// --- salesHistory.js ---

function performSearch() {
    // Get filter values
    const searchTerm = document.getElementById('search-sales').value.trim().toLowerCase();
    const selectedBranchName = document.getElementById('branch-filter').value;
    const dateFromStr = document.getElementById('date-from').value;
    const dateToStr = document.getElementById('date-to').value;

    const salesTableBody = document.querySelector('#sales-table tbody');
    const returnsTableBody = document.querySelector('#returns-table tbody');

    // Clear previous results immediately
    if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="11" style="text-align: center;"><i>جاري البحث...</i></td></tr>';
    if (returnsTableBody) returnsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;"><i>جاري البحث...</i></td></tr>';

    // Date From validation is crucial
    if (!dateFromStr) {
        Swal.fire('خطأ', 'يرجى تحديد تاريخ بداية الفترة للبحث.', 'error');
        if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="11" style="text-align: center;">يرجى تحديد تاريخ بداية للبحث.</td></tr>';
        if (returnsTableBody) returnsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">يرجى تحديد تاريخ بداية للبحث.</td></tr>';
        return; // Stop
    }

    // --- Start data processing ---

    const dateFrom = new Date(dateFromStr);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = dateToStr ? new Date(dateToStr) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    let allFilteredSales = [];
    let allFilteredReturns = [];
    let allFilteredWorkshop = [];
    let allFilteredExpenses = []; // For profit calculation
    let allFilteredReceiving = []; // For profit calculation

    // Determine which branches to process based on filter and user role
    const branchIdsToProcess = [];
    if (selectedBranchName) {
        const branchId = getBranchIdByName(selectedBranchName);
        if (branchId) {
            // Admin or assigned user can see the specific branch
             if (currentUser.role === 'admin' || (branchMetadata[branchId]?.users?.includes(currentUser.username))) {
                branchIdsToProcess.push(branchId);
             }
        }
    } else if (currentUser.role === 'admin') {
        // Admin sees all if no specific branch selected
        branchIdsToProcess.push(...Object.keys(branchMetadata));
    } else {
        // User sees their assigned branches if no specific branch selected
        for (const id in branchMetadata) {
            if (branchMetadata[id].users && branchMetadata[id].users.includes(currentUser.username)) {
                branchIdsToProcess.push(id);
            }
        }
    }

     // Sort branch IDs by name for consistent processing order (optional)
     branchIdsToProcess.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));


    // Gather and filter data from relevant branches
    branchIdsToProcess.forEach(branchId => {
        const branch = branchData[branchId];
        if (!branch) return; // Skip if branch data is missing

        const currentBranchName = getBranchNameById(branchId) || `فرع (${branchId})`; // Get name for display & search

        // Filter Sales for this branch
        (branch.sales || []).forEach(sale => {
            if (filterItem(sale, dateFrom, dateTo, searchTerm, currentBranchName)) {
                allFilteredSales.push({ ...sale, branchId, branchName: currentBranchName });
            }
        });
        // Filter Returns for this branch
        (branch.returns || []).forEach(ret => {
            if (filterItem(ret, dateFrom, dateTo, searchTerm, currentBranchName)) {
                 allFilteredReturns.push({ ...ret, branchId, branchName: currentBranchName });
            }
        });
        // Filter Workshop for this branch (Search term doesn't apply directly here, only date/branch)
        (branch.workshopOperations || []).forEach(op => {
             if (filterItem(op, dateFrom, dateTo, null, currentBranchName)) { // Pass null for searchTerm
                 allFilteredWorkshop.push({ ...op, branchId, branchName: currentBranchName });
             }
        });
        // Filter Expenses for this branch (for profit calc)
         (branch.expenses || []).forEach(exp => {
             if (filterItem(exp, dateFrom, dateTo, null, currentBranchName)) { // Pass null for searchTerm
                 allFilteredExpenses.push({ ...exp, branchId, branchName: currentBranchName });
             }
         });
         // Filter Receiving for this branch (for profit calc)
         (branch.receiving || []).forEach(rec => {
             if (filterItem(rec, dateFrom, dateTo, null, currentBranchName)) { // Pass null for searchTerm
                 allFilteredReceiving.push({ ...rec, branchId, branchName: currentBranchName });
             }
         });
    });

    // Render the gathered and filtered data
    renderSalesHistoryTables(allFilteredSales, allFilteredReturns, allFilteredWorkshop, allFilteredExpenses, allFilteredReceiving);
}

// Helper function to filter individual items (sales, returns, etc.)
function filterItem(item, dateFrom, dateTo, searchTerm, branchName) {
    if (!item || !item.date) return false;
    let itemDate;
    try { itemDate = new Date(item.date); if(isNaN(itemDate.getTime())) return false; } catch(e) { return false; }

    // Date Check
    const dateMatch = itemDate.getTime() >= dateFrom.getTime() &&
                      (!dateTo || itemDate.getTime() <= dateTo.getTime());
    if (!dateMatch) return false;

    // Search Term Check (only if searchTerm is provided)
    if (searchTerm) {
         const searchFields = [
             item.product, item.details, item.user, branchName, item.date, // Common fields
             item.customerPhone, item.customerDetails, item.paymentMethod, // Sale specific
             item.reason, // Return specific
             item.description, // Workshop/Expense specific
             item.expenseType, item.expenseUser, item.scrapType, // Expense specific
             item.supplierName // Receiving specific
         ];
         const amountFields = [item.quantity, item.price, item.amount, item.scrapQuantity]; // Numeric fields

         let itemMatch = searchFields.some(field => field && typeof field === 'string' && field.toLowerCase().includes(searchTerm));
         if (!itemMatch) {
             itemMatch = amountFields.some(field => field != null && field.toString().toLowerCase().includes(searchTerm));
         }
         if (!itemMatch) return false; // No match in any relevant field
    }

    return true; // Passed all checks
}


// Renders the tables based on the pre-filtered data
function renderSalesHistoryTables(filteredSales, filteredReturns, filteredWorkshop, filteredExpenses, filteredReceiving) {
    const salesTableBody = document.querySelector('#sales-table tbody');
    const returnsTableBody = document.querySelector('#returns-table tbody');

    if (!salesTableBody || !returnsTableBody) return;

    salesTableBody.innerHTML = ''; // Clear loading/previous
    returnsTableBody.innerHTML = '';

    // --- Check if any data exists ---
    if (filteredSales.length === 0 && filteredWorkshop.length === 0) {
        salesTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center;">لا يوجد سجل مبيعات أو عمليات ورشة تطابق البحث.</td></tr>`;
    }
    if (filteredReturns.length === 0) {
        returnsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">لا يوجد سجل ارتجاعات تطابق البحث.</td></tr>`;
    }
    if (filteredSales.length === 0 && filteredWorkshop.length === 0 && filteredReturns.length === 0) {
        return; // Exit if nothing to display at all
    }

    // --- Calculations ---
    let overallTotalSalesValue = 0;
    let overallTotalWorkshopValue = 0;
    let overallTotalReturnsValue = 0;
    let overallTotalExpensesValue = 0;
    let overallTotalPurchaseCost = 0; // Cost of goods received/purchased in period

    const totalsByBranch = {}; // Store { sales, workshop, returns, expenses, purchases } per branch

    // Aggregate totals per branch
    const processBranchTotals = (item) => {
        const branchId = item.branchId;
        if (!totalsByBranch[branchId]) {
            totalsByBranch[branchId] = { name: item.branchName, sales: 0, workshop: 0, returns: 0, expenses: 0, purchases: 0 };
        }
        if (item.type === 'sale') totalsByBranch[branchId].sales += parseFloat(item.price || 0);
        else if (item.type === 'workshop') totalsByBranch[branchId].workshop += parseFloat(item.price || 0);
        else if (item.reason) totalsByBranch[branchId].returns += parseFloat(item.price || 0); // Assuming it's a return if it has a reason
        else if (item.expenseType) totalsByBranch[branchId].expenses += parseFloat(item.amount || 0); // Assuming expense
        else if (item.supplierName) { // Assuming receiving/purchase
             totalsByBranch[branchId].purchases += (parseFloat(item.quantity || 0) * parseFloat(item.purchasePrice || 0));
        }
    };

    filteredSales.forEach(processBranchTotals);
    filteredReturns.forEach(processBranchTotals);
    filteredWorkshop.forEach(processBranchTotals);
    filteredExpenses.forEach(processBranchTotals);
    filteredReceiving.forEach(processBranchTotals);


    // --- Render Sales & Workshop Table ---
    const allSalesAndWorkshop = [...filteredSales, ...filteredWorkshop]
                                 .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentSalesBranchName = null;
    if (allSalesAndWorkshop.length > 0) {
        allSalesAndWorkshop.forEach(item => {
            // Add Branch Header if changed
            if (item.branchName !== currentSalesBranchName) {
                 // Add branch totals header row
                 const branchTotals = totalsByBranch[item.branchId];
                 const branchNetProfit = (branchTotals.sales + branchTotals.workshop) - branchTotals.returns - branchTotals.expenses - branchTotals.purchases;
                 const branchHeader = salesTableBody.insertRow();
                 branchHeader.innerHTML = `
                    <td colspan="11" style="background-color: #4CAF50; text-align: center; color: white;">
                        <strong>${item.branchName}</strong> |
                        مبيعات: ${branchTotals.sales.toFixed(2)} |
                        ورشة: ${branchTotals.workshop.toFixed(2)} |
                        مرتجعات: ${branchTotals.returns.toFixed(2)} |
                        مشتريات: ${branchTotals.purchases.toFixed(2)} |
                        مصروفات: ${branchTotals.expenses.toFixed(2)} |
                        <strong>صافي: ${branchNetProfit.toFixed(2)}</strong>
                    </td>`;
                currentSalesBranchName = item.branchName;
            }

            // Add Item Row
            const row = salesTableBody.insertRow();
            const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
            const formattedDate = new Date(item.date).toLocaleString('ar-EG', options);
            const price = parseFloat(item.price || 0);

            row.insertCell(0).textContent = formattedDate;
            row.insertCell(1).textContent = item.branchName;

            if (item.type === 'sale') {
                row.classList.add('sales-row'); // Add class for details dialog listener
                row.dataset.saleDetails = JSON.stringify(item); // Store sale details

                row.insertCell(2).textContent = item.product || '';
                row.insertCell(3).textContent = item.quantity?.toFixed(2) || '0.00';
                row.insertCell(4).textContent = price.toFixed(2);
                row.insertCell(5).textContent = item.customerPhone || '';
                row.insertCell(6).textContent = item.details || '';
                row.insertCell(7).textContent = item.customerDetails || '';
                row.insertCell(8).textContent = item.user || '';
                row.insertCell(9).textContent = item.paymentMethod || '';
                overallTotalSalesValue += price;
            } else { // Workshop
                row.insertCell(2).textContent = 'خدمة ورشة';
                row.insertCell(3).textContent = '-';
                row.insertCell(4).textContent = price.toFixed(2);
                row.insertCell(5).textContent = item.customerPhone || '';
                row.insertCell(6).textContent = item.description || ''; // Workshop description
                row.insertCell(7).textContent = item.customerDetails || '';
                row.insertCell(8).textContent = item.user || '';
                row.insertCell(9).textContent = item.paymentMethod || '';
                overallTotalWorkshopValue += price;
            }

            // Actions Cell (Admin only for now)
            const actionsCell = row.insertCell(10);
             if (currentUser.role === 'admin') {
                 actionsCell.style.whiteSpace = 'nowrap';
                 const editBtn = document.createElement('button');
                 editBtn.textContent = 'تعديل';
                 editBtn.classList.add('edit-btn');
                 editBtn.style.width = 'auto'; editBtn.style.marginLeft = '5px';

                 const deleteBtn = document.createElement('button');
                 deleteBtn.textContent = 'حذف';
                 deleteBtn.classList.add('delete-btn');
                 deleteBtn.style.width = 'auto';

                 if (item.type === 'sale') {
                     editBtn.onclick = (event) => { event.stopPropagation(); editSale(item); };
                     deleteBtn.onclick = (event) => { event.stopPropagation(); deleteSale(item); };
                 } else { // Workshop
                     editBtn.onclick = () => editWorkshopOperation(item);
                     deleteBtn.onclick = () => deleteWorkshopOperation(item);
                 }
                 actionsCell.appendChild(editBtn);
                 actionsCell.appendChild(deleteBtn);
             } else {
                 actionsCell.textContent = '-';
             }
        });

        // Add Overall Sales/Workshop Total Row
        const totalSalesRow = salesTableBody.insertRow();
        totalSalesRow.innerHTML = `
            <td colspan="11" style="text-align: center; background-color: #f39c12;">
                <strong>إجمالي المبيعات للفترة: ${overallTotalSalesValue.toFixed(2)} | إجمالي الورشة للفترة: ${overallTotalWorkshopValue.toFixed(2)}</strong>
            </td>
        `;
    }


    // --- Render Returns Table ---
    if (filteredReturns.length > 0) {
         // Sort returns by date
         filteredReturns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

         filteredReturns.forEach(ret => {
             const row = returnsTableBody.insertRow();
             const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
             const formattedDate = new Date(ret.date).toLocaleString('ar-EG', options);
             const price = parseFloat(ret.price || 0);
             const quantity = parseFloat(ret.quantity || 0);

             row.insertCell(0).textContent = formattedDate;
             row.insertCell(1).textContent = ret.product || '';
             row.insertCell(2).textContent = quantity.toFixed(2);
             row.insertCell(3).textContent = price.toFixed(2);
             row.insertCell(4).textContent = ret.reason || '';
             row.insertCell(5).textContent = ret.user || '';
             overallTotalReturnsValue += price;

             // Actions Cell (Admin only)
             const actionsCell = row.insertCell(6);
             if (currentUser.role === 'admin') {
                 actionsCell.style.whiteSpace = 'nowrap';
                 const editBtn = document.createElement('button');
                 editBtn.textContent = 'تعديل';
                 editBtn.classList.add('edit-btn');
                 editBtn.style.width = 'auto'; editBtn.style.marginLeft = '5px';
                 editBtn.onclick = () => editReturn(ret);
                 actionsCell.appendChild(editBtn);

                 const deleteBtn = document.createElement('button');
                 deleteBtn.textContent = 'حذف';
                 deleteBtn.classList.add('delete-btn');
                 deleteBtn.style.width = 'auto';
                 deleteBtn.onclick = () => deleteReturn(ret);
                 actionsCell.appendChild(deleteBtn);
             } else {
                  actionsCell.textContent = '-';
             }
         });

        // Add Total Returns Row
        const totalReturnsRow = returnsTableBody.insertRow();
        totalReturnsRow.innerHTML = `
            <td colspan="7" style="background-color: #ff5722; text-align:center; font-weight: bold;">
                <strong>إجمالي قيمة المرتجعات للفترة: ${overallTotalReturnsValue.toFixed(2)}</strong>
            </td>
        `;
    }

     // --- Calculate and Display Final Summary Row (in Sales Table Footer) ---
     if (allSalesAndWorkshop.length > 0 || filteredReturns.length > 0) {
         // Sum up totals from all relevant branches
         for(const branchId in totalsByBranch) {
             // overallTotalSalesValue calculated during sales render
             // overallTotalWorkshopValue calculated during sales render
             // overallTotalReturnsValue calculated during returns render
             overallTotalExpensesValue += totalsByBranch[branchId].expenses;
             overallTotalPurchaseCost += totalsByBranch[branchId].purchases;
         }

         const finalTotalRevenue = overallTotalSalesValue + overallTotalWorkshopValue;
         const finalNetProfit = finalTotalRevenue - overallTotalReturnsValue - overallTotalExpensesValue - overallTotalPurchaseCost;

         const tfoot = salesTableBody.closest('table').createTFoot(); // Add footer to sales table
         const summaryTotalRow = tfoot.insertRow();
         summaryTotalRow.innerHTML = `
            <td colspan="11" style="background-color: #2196F3; text-align: center; font-weight: bold; color: white;">
                إجمالي الإيرادات: ${finalTotalRevenue.toFixed(2)} |
                إجمالي المرتجعات: ${overallTotalReturnsValue.toFixed(2)} |
                إجمالي المصروفات: ${overallTotalExpensesValue.toFixed(2)} |
                إجمالي المشتريات: ${overallTotalPurchaseCost.toFixed(2)} |
                <strong>صافي الربح للفترة: ${finalNetProfit.toFixed(2)}</strong>
            </td>
        `;
    }


    // --- Add Event Listener for Sales Details Dialog ---
    // Remove previous listener before adding a new one
    const salesTableElement = document.getElementById('sales-table');
    if (salesTableElement) {
        const currentTbody = salesTableElement.querySelector('tbody');
        if (currentTbody) {
             if (currentTbody._salesRowClickListener) {
                 currentTbody.removeEventListener('click', currentTbody._salesRowClickListener);
             }
            currentTbody._salesRowClickListener = function(event) {
                handleSalesRowClick(event);
            };
            currentTbody.addEventListener('click', currentTbody._salesRowClickListener);
        }
    }
}

// Handler for clicking on a sales row
function handleSalesRowClick(event) {
    const clickedRow = event.target.closest('.sales-row');
    if (clickedRow && clickedRow.dataset.saleDetails) {
        try {
            const saleDetails = JSON.parse(clickedRow.dataset.saleDetails);
            displaySaleDetailsDialog(saleDetails);
        } catch (e) {
            console.error("Error parsing sale details from row dataset:", e);
            Swal.fire('خطأ', 'لا يمكن عرض تفاصيل هذه العملية.', 'error');
        }
    }
}


// Updates the branch filter dropdown on the sales history page
function updateBranchFilter() {
    const filterSelectId = 'branch-filter'; // ID of the select element for filtering
    updateBranchSelect(filterSelectId); // Use the common function
}

// --- Edit/Delete Functions (Need Adaptation) ---

// Edit Sale (Handles Inventory Adjustment)
async function editSale(sale) {
    // sale object should now include branchId and branchName
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'غير مصرح لك بتعديل المبيعات.', 'error'); return;
    }
    if (!sale || !sale.branchId || !sale.product) {
        Swal.fire('خطأ', 'بيانات عملية البيع غير كاملة للتعديل.', 'error'); return;
    }

    const { value: updatedSaleData } = await Swal.fire({
        title: 'تعديل عملية البيع',
        html: /* Content as before, but use sale.branchName */
             `<label>الفرع</label><input class="swal2-input" value="${sale.branchName || ''}" readonly>` +
             `<label>الصنف</label><input class="swal2-input" value="${sale.product || ''}" readonly>` +
             `<label>الكمية (جرام)</label><input id="swal-edit-qty" class="swal2-input" type="number" step="0.01" value="${sale.quantity || 0}">` +
             `<label>سعر البيع الإجمالي</label><input id="swal-edit-price" class="swal2-input" type="number" step="0.01" value="${sale.price || 0}">` +
             `<label>هاتف العميل</label><input id="swal-edit-phone" class="swal2-input" type="tel" value="${sale.customerPhone || ''}">` +
             `<label>التفاصيل</label><textarea id="swal-edit-details" class="swal2-textarea">${sale.details || ''}</textarea>` +
             `<label>بيانات العميل</label><textarea id="swal-edit-custdetails" class="swal2-textarea">${sale.customerDetails || ''}</textarea>` +
             `<label>وسيلة الدفع:</label><select id="swal-edit-payment" class="swal2-select">
                <option value="نقدي" ${sale.paymentMethod === 'نقدي' ? 'selected' : ''}>نقدي</option>
                <option value="فيزا" ${sale.paymentMethod === 'فيزا' ? 'selected' : ''}>فيزا</option>
                <option value="انستاباي" ${sale.paymentMethod === 'انستاباي' ? 'selected' : ''}>انستاباي</option>
            </select>`,
        focusConfirm: false,
        preConfirm: () => { /* Validation logic remains the same */
            const quantity = parseFloat(document.getElementById('swal-edit-qty').value);
            const price = parseFloat(document.getElementById('swal-edit-price').value);
            const customerPhone = document.getElementById('swal-edit-phone').value.trim();
            const details = document.getElementById('swal-edit-details').value.trim();
            const customerDetails = document.getElementById('swal-edit-custdetails').value.trim();
            const paymentMethod = document.getElementById('swal-edit-payment').value;
            if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0 || !paymentMethod) {
                Swal.showValidationMessage('يرجى إدخال قيم صحيحة للكمية والسعر وطريقة الدفع.'); return false;
            }
            return { quantity, price, customerPhone, details, customerDetails, paymentMethod };
        }
    });

    if (updatedSaleData) {
        const branchId = sale.branchId;
        // Find index within the specific branch's sales array
        const saleIndex = branchData[branchId]?.sales.findIndex(s => s.date === sale.date && s.user === sale.user && s.product === sale.product);

        if (saleIndex === -1 || !branchData[branchId].products) {
            Swal.fire('خطأ', 'لم يتم العثور على عملية البيع الأصلية أو بيانات الأصناف.', 'error'); return;
        }

        const originalSale = { ...branchData[branchId].sales[saleIndex] }; // Copy
        const productIndex = branchData[branchId].products.findIndex(p => p.name === originalSale.product);

        if (productIndex === -1) {
            Swal.fire('خطأ', 'لم يتم العثور على الصنف الأصلي لتعديل المخزون.', 'error'); return;
        }
        const product = branchData[branchId].products[productIndex];

        // --- Reverse old sale effect ---
        const oldQuantity = parseFloat(originalSale.quantity || 0);
        product.quantity += oldQuantity;
        const costBasisBeforeReversal = (product.quantity > 0 && product.purchasePrice > 0) ? product.purchasePrice / product.quantity : 0;
        const originalCostOfSale = costBasisBeforeReversal * oldQuantity;
        product.purchasePrice = (product.purchasePrice || 0) + originalCostOfSale;
        if (product.purchasePrice < 0) product.purchasePrice = 0; // Sanity check

        // --- Apply new sale effect ---
        const newQuantity = parseFloat(updatedSaleData.quantity);
        if (product.quantity < newQuantity) {
             // Allow save but maybe warn inventory will be negative? Or block? Blocking for now.
             Swal.fire('خطأ', `الكمية الحالية (${product.quantity.toFixed(2)}) غير كافية بعد عكس البيع القديم لتغطية الكمية الجديدة (${newQuantity.toFixed(2)}). لا يمكن إتمام التعديل.`, 'error');
             // Revert the reversal before exiting
             product.quantity -= oldQuantity;
             product.purchasePrice -= originalCostOfSale;
             if (product.purchasePrice < 0) product.purchasePrice = 0;
             return;
        }
        product.quantity -= newQuantity;
        const costBasisBeforeNewSale = (product.quantity + newQuantity > 0 && product.purchasePrice > 0) ? product.purchasePrice / (product.quantity + newQuantity) : 0;
        const newCostOfSale = costBasisBeforeNewSale * newQuantity;
        product.purchasePrice -= newCostOfSale;
        if (product.purchasePrice < 0) product.purchasePrice = 0; // Sanity check

        // --- Update Sale Record ---
        branchData[branchId].sales[saleIndex] = {
            ...originalSale, // Keep original date, user, etc.
            quantity: newQuantity,
            price: updatedSaleData.price,
            customerPhone: updatedSaleData.customerPhone,
            details: updatedSaleData.details,
            customerDetails: updatedSaleData.customerDetails,
            paymentMethod: updatedSaleData.paymentMethod
        };

        try {
             // Save updated products and sales for the branch
             await database.ref(`/branchData/${branchId}`).update({
                 products: branchData[branchId].products,
                 sales: branchData[branchId].sales
             });
            // Refresh UI
            performSearch(); // Re-run the search to show updated history
            updateProductsTable(); // Update product table view
            updateDailySalesTable(); // Update daily sales on sales page if needed
             // Consider populating other product selects

            Swal.fire('تم', 'تم تحديث عملية البيع بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء تحديث البيع");
            await loadData(); // Reload data
        }
    }
}


// Delete Sale (Handles Inventory Adjustment)
async function deleteSale(sale) {
     // sale object should now include branchId and branchName
     if (!currentUser || currentUser.role !== 'admin') {
         Swal.fire('خطأ', 'غير مصرح لك بحذف المبيعات.', 'error'); return;
     }
    if (!sale || !sale.branchId || !sale.product) {
        Swal.fire('خطأ', 'بيانات عملية البيع غير كاملة للحذف.', 'error'); return;
    }

    let formattedDateStr = 'تاريخ غير متاح';
    try { formattedDateStr = new Date(sale.date).toLocaleDateString('ar-EG'); } catch (e) {}

    const confirmResult = await Swal.fire({
        title: 'تأكيد الحذف',
        text: `هل أنت متأكد من حذف بيع "${sale.product}" بتاريخ ${formattedDateStr} من فرع "${sale.branchName}"؟ سيتم إعادة الكمية للمخزون.`,
        icon: 'warning',
        showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33', cancelButtonColor: '#3085d6'
    });

    if (confirmResult.isConfirmed) {
        const branchId = sale.branchId;
        const saleIndex = branchData[branchId]?.sales.findIndex(s => s.date === sale.date && s.user === sale.user && s.product === sale.product && s.price === sale.price);

        if (saleIndex === -1 || !branchData[branchId].products) {
             Swal.fire('خطأ', 'لم يتم العثور على عملية البيع الأصلية أو بيانات الأصناف.', 'error'); return;
        }

        const saleToDelete = { ...branchData[branchId].sales[saleIndex] };
        const productIndex = branchData[branchId].products.findIndex(p => p.name === saleToDelete.product);

        if (productIndex === -1) {
            console.warn(`Product ${saleToDelete.product} not found in branch ${branchId} during sale deletion. Inventory not adjusted.`);
            // Proceed to delete sale record, but warn user?
        } else {
            // --- Reverse sale effect ---
            const product = branchData[branchId].products[productIndex];
            const quantityToAddBack = parseFloat(saleToDelete.quantity || 0);
            product.quantity += quantityToAddBack;
             // Calculate approx cost to add back
             const costBasis = (product.quantity > 0 && product.purchasePrice >= 0) ? product.purchasePrice / product.quantity : 0; // Use average cost AFTER adding quantity back
             const costOfSaleToAddBack = costBasis * quantityToAddBack;
            product.purchasePrice = (product.purchasePrice || 0) + costOfSaleToAddBack;
             if (product.purchasePrice < 0) product.purchasePrice = 0;
        }

        // Remove Sale Record
        branchData[branchId].sales.splice(saleIndex, 1);

        try {
             // Save updated products and sales for the branch
             await database.ref(`/branchData/${branchId}`).update({
                 products: branchData[branchId].products, // May not have changed if product not found
                 sales: branchData[branchId].sales
             });

             // Refresh UI
             document.dispatchEvent(new CustomEvent('saleDeleted', { detail: { branchId: branchId } }));
             performSearch(); // Re-run search
             updateProductsTable();
             updateDailySalesTable();
             // Update product dropdowns

            Swal.fire('تم الحذف', 'تم حذف عملية البيع بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء حذف البيع");
            await loadData(); // Reload data
        }
    }
}

// Edit Return (Handles Inventory Adjustment)
async function editReturn(returnItem) {
     // returnItem object should include branchId and branchName
     if (!currentUser || currentUser.role !== 'admin') {
         Swal.fire('خطأ', 'غير مصرح لك بتعديل المرتجعات.', 'error'); return;
     }
     if (!returnItem || !returnItem.branchId || !returnItem.product) {
         Swal.fire('خطأ', 'بيانات الارتجاع غير كاملة للتعديل.', 'error'); return;
     }

    const { value: updatedReturnData } = await Swal.fire({
        title: 'تعديل الارتجاع',
        html:
             `<label>الفرع</label><input class="swal2-input" value="${returnItem.branchName || ''}" readonly>` +
             `<label>الصنف</label><input class="swal2-input" value="${returnItem.product || ''}" readonly>` +
             `<label>الكمية (جرام)</label><input id="swal-edit-qty" class="swal2-input" type="number" step="0.01" value="${returnItem.quantity || 0}">` +
             `<label>السعر الإجمالي المسترد</label><input id="swal-edit-price" class="swal2-input" type="number" step="0.01" value="${returnItem.price || 0}">` +
             `<label>السبب</label><textarea id="swal-edit-reason" class="swal2-textarea">${returnItem.reason || ''}</textarea>`,
        focusConfirm: false,
        preConfirm: () => { /* Validation */
            const quantity = parseFloat(document.getElementById('swal-edit-qty').value);
            const price = parseFloat(document.getElementById('swal-edit-price').value);
            const reason = document.getElementById('swal-edit-reason').value.trim();
            if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price < 0 || !reason) { // Allow 0 price
                Swal.showValidationMessage('يرجى إدخال كمية صحيحة، سعر غير سالب، وسبب.'); return false;
            }
            return { quantity, price, reason };
        }
    });

    if (updatedReturnData) {
         const branchId = returnItem.branchId;
         const returnIndex = branchData[branchId]?.returns.findIndex(r => r.date === returnItem.date && r.user === returnItem.user && r.product === returnItem.product);

         if (returnIndex === -1 || !branchData[branchId].products) {
             Swal.fire('خطأ', 'لم يتم العثور على الارتجاع الأصلي أو بيانات الأصناف.', 'error'); return;
         }

        const originalReturn = { ...branchData[branchId].returns[returnIndex] };
        const productIndex = branchData[branchId].products.findIndex(p => p.name === originalReturn.product);

        if (productIndex === -1) {
            // If product didn't exist when return was recorded, maybe skip inventory adjustment?
             console.warn(`Product ${originalReturn.product} not found for return edit. Inventory adjustment skipped.`);
             // Update only the return record
             branchData[branchId].returns[returnIndex] = { ...originalReturn, ...updatedReturnData };
        } else {
            const product = branchData[branchId].products[productIndex];
             // --- Reverse old return effect ---
             const oldQuantity = parseFloat(originalReturn.quantity || 0);
             product.quantity -= oldQuantity;
             const costBasisBeforeReversal = (product.quantity + oldQuantity > 0 && product.purchasePrice > 0) ? product.purchasePrice / (product.quantity + oldQuantity) : 0;
             const originalReturnedCost = costBasisBeforeReversal * oldQuantity;
             product.purchasePrice = (product.purchasePrice || 0) - originalReturnedCost;
             if (product.quantity < 0) product.quantity = 0;
             if (product.purchasePrice < 0) product.purchasePrice = 0;

             // --- Apply new return effect ---
             const newQuantity = parseFloat(updatedReturnData.quantity);
             product.quantity += newQuantity;
             const costBasisBeforeNewReturn = (product.quantity > 0 && product.purchasePrice > 0) ? product.purchasePrice / product.quantity : 0;
             const newReturnedCost = costBasisBeforeNewReturn * newQuantity;
             product.purchasePrice += newReturnedCost;
              if (product.purchasePrice < 0) product.purchasePrice = 0;

             // --- Update Return Record ---
             branchData[branchId].returns[returnIndex] = { ...originalReturn, ...updatedReturnData };
        }


        try {
             // Save updated products and returns for the branch
              await database.ref(`/branchData/${branchId}`).update({
                  products: branchData[branchId].products, // May not have changed if product not found
                  returns: branchData[branchId].returns
              });
              // Refresh UI
              performSearch();
              updateProductsTable();
              // Update product dropdowns

             Swal.fire('تم', 'تم تحديث الارتجاع بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء تحديث الارتجاع");
            await loadData(); // Reload data
        }
    }
}

// Delete Return (Handles Inventory Adjustment)
async function deleteReturn(returnItem) {
     // returnItem object should include branchId and branchName
     if (!currentUser || currentUser.role !== 'admin') {
         Swal.fire('خطأ', 'غير مصرح لك بحذف المرتجعات.', 'error'); return;
     }
    if (!returnItem || !returnItem.branchId || !returnItem.product) {
        Swal.fire('خطأ', 'بيانات الارتجاع غير كاملة للحذف.', 'error'); return;
    }

    const confirmResult = await Swal.fire({
        title: 'تأكيد الحذف',
        text: `هل أنت متأكد من حذف ارتجاع "${returnItem.product}" من فرع "${returnItem.branchName}"؟ سيتم خصم الكمية من المخزون.`,
        icon: 'warning',
        showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33', cancelButtonColor: '#3085d6'
    });

    if (confirmResult.isConfirmed) {
        const branchId = returnItem.branchId;
        const returnIndex = branchData[branchId]?.returns.findIndex(r => r.date === returnItem.date && r.user === returnItem.user && r.product === returnItem.product && r.price === returnItem.price);

         if (returnIndex === -1 || !branchData[branchId].products) {
             Swal.fire('خطأ', 'لم يتم العثور على الارتجاع الأصلي أو بيانات الأصناف.', 'error'); return;
         }

        const returnToDelete = { ...branchData[branchId].returns[returnIndex] };
        const productIndex = branchData[branchId].products.findIndex(p => p.name === returnToDelete.product);

        if (productIndex === -1) {
             console.warn(`Product ${returnToDelete.product} not found in branch ${branchId} during return deletion. Inventory not adjusted.`);
        } else {
             // --- Reverse return effect ---
             const product = branchData[branchId].products[productIndex];
             const quantityToRemove = parseFloat(returnToDelete.quantity || 0);
             product.quantity -= quantityToRemove;
             // Calculate approx cost to remove
              const costBasis = (product.quantity + quantityToRemove > 0 && product.purchasePrice > 0) ? product.purchasePrice / (product.quantity + quantityToRemove) : 0;
              const returnedCostToRemove = costBasis * quantityToRemove;
             product.purchasePrice = (product.purchasePrice || 0) - returnedCostToRemove;
             if (product.quantity < 0) product.quantity = 0;
             if (product.purchasePrice < 0) product.purchasePrice = 0;
        }

        // Remove Return Record
        branchData[branchId].returns.splice(returnIndex, 1);

        try {
             // Save updated products and returns for the branch
              await database.ref(`/branchData/${branchId}`).update({
                  products: branchData[branchId].products, // May not have changed
                  returns: branchData[branchId].returns
              });
             // Refresh UI
             document.dispatchEvent(new CustomEvent('returnDeleted', { detail: { branchId: branchId } }));
             performSearch();
             updateProductsTable();
             // Update product dropdowns

             Swal.fire('تم الحذف', 'تم حذف الارتجاع بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء حذف الارتجاع");
            await loadData(); // Reload data
        }
    }
}

// Displays the sale details dialog (No changes needed if data structure is passed correctly)
function displaySaleDetailsDialog(saleDetails) {
    if (!saleDetails) return;
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    let formattedDate = 'غير متاح';
    try { formattedDate = saleDetails.date ? new Date(saleDetails.date).toLocaleString('ar-EG', options) : 'غير متاح'; } catch(e) {}

    Swal.fire({
        title: 'تفاصيل عملية البيع',
        html: `
            <div style="text-align: right; max-height: 400px; overflow-y: auto; padding: 5px 10px;">
                <p><strong>التاريخ:</strong> ${formattedDate}</p>
                <p><strong>الفرع:</strong> ${saleDetails.branchName || saleDetails.branch || 'غير متاح'}</p>
                <p><strong>الصنف:</strong> ${saleDetails.product || 'غير متاح'}</p>
                <p><strong>الكمية:</strong> ${saleDetails.quantity?.toFixed(2) || 0}</p>
                <p><strong>السعر:</strong> ${(parseFloat(saleDetails.price) || 0).toFixed(2)}</p>
                <p><strong>هاتف العميل:</strong> ${saleDetails.customerPhone || 'لا يوجد'}</p>
                <p><strong>بيانات العميل:</strong> ${saleDetails.customerDetails || 'لا يوجد'}</p>
                <p><strong>التفاصيل:</strong> ${saleDetails.details || 'لا يوجد'}</p>
                <p><strong>المستخدم:</strong> ${saleDetails.user || 'غير متاح'}</p>
                <p><strong>وسيلة الدفع:</strong> ${saleDetails.paymentMethod || 'غير متاح'}</p>
            </div>`,
        confirmButtonText: 'إغلاق',
        customClass: { popup: 'swal-wide' }
    });
}