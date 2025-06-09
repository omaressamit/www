// --- receiving.js ---

let lastReceiveClickTime = 0; // Initialize timestamp for receiving

async function recordReceiving() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }
    // Double-click prevention (5 seconds)
    const now = Date.now();
    if (now - lastReceiveClickTime < 5000) {
        Swal.fire('تنبيه', 'يرجى الانتظار 5 ثوانٍ قبل تسجيل استلام بضاعة آخر.', 'warning');
        return;
    }

    const branchName = document.getElementById('receiving-branch-select').value;
    const productName = document.getElementById('receive-product-select').value.trim();
    const quantity = parseFloat(document.getElementById('receive-quantity').value.trim());
    // IMPORTANT: This is PRICE PER GRAM in this context
    const purchasePricePerGram = parseFloat(document.getElementById('purchase-price').value.trim());
    const supplierName = document.getElementById('supplier-name').value.trim();

    // Get Branch ID
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!productName || !supplierName || isNaN(quantity) || isNaN(purchasePricePerGram)) {
        Swal.fire('خطأ', 'يرجى إدخال جميع الحقول المطلوبة بقيم صحيحة.', 'error');
        return;
    }
    if (quantity <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال كمية صحيحة (أكبر من صفر).', 'error');
        return;
    }
    if (purchasePricePerGram <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال سعر شراء للجرام صحيح (أكبر من صفر).', 'error');
        return;
    }

    // Ensure branch data and products array exist
    if (!branchData[branchId]) {
        console.error(`Branch data missing for ID: ${branchId}`);
        Swal.fire('خطأ', 'بيانات الفرع غير موجودة.', 'error');
        return; // Should not happen if dropdown is populated correctly
    }
    branchData[branchId].products = branchData[branchId].products || [];
    branchData[branchId].receiving = branchData[branchId].receiving || [];


    // Find the product index within the specific branch's products
    const productIndex = branchData[branchId].products.findIndex(p => p.name === productName);
    const totalCostForThisBatch = quantity * purchasePricePerGram;

    if (productIndex === -1) {
        // Product doesn't exist in the branch, add as new
        branchData[branchId].products.push({
            name: productName,
            quantity: quantity,
            purchasePrice: totalCostForThisBatch // Initial total purchase price
        });
    } else {
        // Product exists, update quantity and total purchase price
        const existingProduct = branchData[branchId].products[productIndex];
        existingProduct.quantity += quantity;
        existingProduct.purchasePrice = (existingProduct.purchasePrice || 0) + totalCostForThisBatch;
    }

    // Add record to the specific branch's receiving list
    const newReceivingRecord = {
        date: new Date().toISOString(), // ISO 8601 format
        product: productName,
        quantity: quantity,
        purchasePrice: purchasePricePerGram, // Store price per gram here
        supplierName: supplierName,
        user: currentUser.username
        // Note: branch name/id isn't strictly needed INSIDE the record if it's already under branchData[branchId]
        // But keep it for potential future data structure changes or easier querying if flattened
        // branch: branchName // Optional redundancy
    };
    branchData[branchId].receiving.push(newReceivingRecord);

    lastReceiveClickTime = now; // Update timestamp only on success

    try {
        // Save the updated branch data (products and receiving list)
        await database.ref(`/branchData/${branchId}`).update({
            products: branchData[branchId].products,
            receiving: branchData[branchId].receiving
        });

        // Clear fields after successful save
        document.getElementById('receive-quantity').value = '';
        document.getElementById('purchase-price').value = '';
        document.getElementById('supplier-name').value = '';
        // Re-populate product select for the current branch
        populateProductSelect('receiving', branchName);

        document.dispatchEvent(new CustomEvent('receivingRecorded', { detail: { branchId: branchId } }));

        Swal.fire({
            title: 'تم', text: 'تم تسجيل الاستلام بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });
    } catch (error) {
        handleError(error, "خطأ أثناء حفظ الاستلام");
        // Revert local changes if save failed (difficult, reload might be better)
        // Example: Remove the last added receiving record and revert product changes
        branchData[branchId].receiving.pop();
        // Reverting product changes requires knowing if it was new or updated... complex.
        await loadData(); // Reload data to ensure consistency after error
    }
}

// Displays the list of received items based on filters
function showPurchases() {
    if (!currentUser) return;

    const selectedBranchName = document.getElementById('receiving-branch-filter').value;
    const dateFromStr = document.getElementById('receiving-date-from').value;
    const dateToStr = document.getElementById('receiving-date-to').value;
    const purchasesListTbody = document.getElementById('purchases-list'); // Target the tbody
    const purchasesTableWrapper = purchasesListTbody?.closest('.table-wrapper');

    if (!purchasesListTbody || !purchasesTableWrapper) {
         console.error("Purchases table elements not found.");
         return;
    }

    // Date From validation
    if (!dateFromStr) {
        Swal.fire('خطأ', 'يرجى تحديد تاريخ بداية الفترة للاستعلام.', 'error');
        purchasesTableWrapper.style.display = 'none';
        purchasesListTbody.innerHTML = '';
        return;
    }

    purchasesTableWrapper.style.display = 'block';
    purchasesListTbody.innerHTML = ''; // Clear previous results

    const dateFrom = new Date(dateFromStr);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = dateToStr ? new Date(dateToStr) : null;
    if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
    }

    let totalOverallCost = 0;
    let totalOverallQuantity = 0;
    let displayedData = []; // Array to hold data rows before rendering

    // Determine which branches to process
    const branchIdsToProcess = [];
    if (selectedBranchName) {
        const branchId = getBranchIdByName(selectedBranchName);
        if (branchId) {
            branchIdsToProcess.push(branchId);
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

     // Sort branch IDs by name for consistent order if showing multiple
     branchIdsToProcess.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));


    branchIdsToProcess.forEach(branchId => {
        const branchReceivingList = branchData[branchId]?.receiving || [];
        const branchName = getBranchNameById(branchId) || `فرع غير معروف (${branchId})`; // Get name for display

        const filteredBranchReceiving = branchReceivingList.filter(receive => {
            if (!receive || !receive.date) return false;
            let receiveDate;
            try {
                receiveDate = new Date(receive.date);
                if (isNaN(receiveDate.getTime())) return false;
            } catch (e) { return false; }

            const dateMatch = receiveDate.getTime() >= dateFrom.getTime() &&
                              (!dateTo || receiveDate.getTime() <= dateTo.getTime());
            return dateMatch; // Branch filter already applied by selecting branchIdsToProcess
        });

        if (filteredBranchReceiving.length > 0) {
            // Add branch data to the display array
             filteredBranchReceiving.forEach(receive => {
                 // Add branchId and branchName to each record for use in edit/delete
                 displayedData.push({ ...receive, branchId: branchId, branchName: branchName });
             });
        }
    });


    if (displayedData.length === 0) {
        purchasesListTbody.innerHTML = '<tr><td colspan="8">لا توجد سجلات مشتريات تطابق البحث.</td></tr>';
        return;
    }

    // Sort all collected data by date (newest first)
    displayedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentDisplayBranchName = null;

    displayedData.forEach(receive => {
         // Add branch header row if the branch changes (and more than one branch is involved)
         if (branchIdsToProcess.length > 1 && receive.branchName !== currentDisplayBranchName) {
             currentDisplayBranchName = receive.branchName;
             const branchHeaderRow = purchasesListTbody.insertRow();
             branchHeaderRow.innerHTML = `<td colspan="8" style="background-color: #4CAF50; color: white; text-align: center; font-weight: bold;">${currentDisplayBranchName}</td>`;
         }

        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        const formattedDate = new Date(receive.date).toLocaleString('ar-EG', options);
        const quantity = parseFloat(receive.quantity || 0);
        const pricePerUnit = parseFloat(receive.purchasePrice || 0); // Price per gram
        const cost = quantity * pricePerUnit;

        const row = purchasesListTbody.insertRow();

        row.insertCell(0).textContent = formattedDate;
        row.insertCell(1).textContent = receive.branchName; // Display branch name
        row.insertCell(2).textContent = receive.product;
        row.insertCell(3).textContent = quantity.toFixed(2); // Don't add "جرام" here, it's in the header
        row.insertCell(4).textContent = pricePerUnit.toFixed(2);
        row.insertCell(5).textContent = receive.supplierName;
        row.insertCell(6).textContent = receive.user;

        // Actions Cell (Edit/Delete) - Only for Admin
        const actionsCell = row.insertCell(7);
        if (currentUser.role === 'admin') {
            actionsCell.style.whiteSpace = 'nowrap';
            const editBtn = document.createElement('button');
            editBtn.textContent = 'تعديل';
            editBtn.classList.add('edit-btn');
            editBtn.style.width = 'auto'; editBtn.style.marginLeft = '5px';
            // Pass the full receive object (which now includes branchId)
            editBtn.onclick = () => editReceiving(receive);
            actionsCell.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'حذف';
            deleteBtn.classList.add('delete-btn');
             deleteBtn.style.width = 'auto';
            // Pass the full receive object
            deleteBtn.onclick = () => deleteReceiving(receive);
            actionsCell.appendChild(deleteBtn);
        }


        totalOverallCost += cost;
        totalOverallQuantity += quantity;
    });

    // Add overall total row
    const totalRow = purchasesListTbody.insertRow();
    totalRow.innerHTML = `
        <td colspan="8" style="text-align: center; background-color: #8bc34a;">
            <strong>إجمالي الكمية المستلمة: ${totalOverallQuantity.toFixed(2)} جرام | إجمالي تكلفة الشراء: ${totalOverallCost.toFixed(2)} جنيه</strong>
        </td>
    `;
}

// Edit Receiving Record (Admin only)
async function editReceiving(receive) {
     if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لتعديل السجلات', 'error');
        return;
    }
     // receive object should contain branchId and branchName from showPurchases
     if (!receive || !receive.branchId || !receive.product) {
         Swal.fire('خطأ', 'بيانات سجل الاستلام غير كاملة للتعديل.', 'error');
         return;
     }

    const { value: updatedData } = await Swal.fire({
        title: 'تعديل بيانات استلام',
        html:
            `<label style="display:block; text-align:right;">الفرع</label><input class="swal2-input" value="${receive.branchName}" readonly>` +
            `<label style="display:block; text-align:right;">الصنف</label><input class="swal2-input" value="${receive.product}" readonly>` +
            `<label style="display:block; text-align:right;">الكمية (جرام)</label><input id="swal-edit-qty" class="swal2-input" type="number" step="0.01" value="${receive.quantity}">` +
            `<label style="display:block; text-align:right;">سعر شراء الجرام</label><input id="swal-edit-price" class="swal2-input" type="number" step="0.01" value="${receive.purchasePrice}">` +
            `<label style="display:block; text-align:right;">اسم المورد</label><input id="swal-edit-supplier" class="swal2-input" value="${receive.supplierName}">`,
        focusConfirm: false,
        preConfirm: () => {
            const quantity = parseFloat(document.getElementById('swal-edit-qty').value);
            const purchasePricePerGram = parseFloat(document.getElementById('swal-edit-price').value);
            const supplierName = document.getElementById('swal-edit-supplier').value.trim();

            if (isNaN(quantity) || quantity <= 0 || isNaN(purchasePricePerGram) || purchasePricePerGram <= 0 || !supplierName) {
                Swal.showValidationMessage('يرجى إدخال قيم صحيحة وموجبة للكمية والسعر واسم المورد');
                return false;
            }
            return { quantity, purchasePrice: purchasePricePerGram, supplierName }; // Renamed purchasePrice for clarity
        }
    });

    if (updatedData) {
        const branchId = receive.branchId; // Get branchId from the passed object

        // Find the index of the receiving record within its branch's list
        const receiveIndex = branchData[branchId]?.receiving.findIndex(r =>
            r.date === receive.date && r.user === receive.user && r.product === receive.product
        );

        if (receiveIndex === -1 || !branchData[branchId].products) {
            Swal.fire('خطأ', 'لم يتم العثور على سجل الاستلام الأصلي أو بيانات الأصناف.', 'error');
            return;
        }

         // Find the corresponding product
         const productIndex = branchData[branchId].products.findIndex(p => p.name === receive.product);
         if (productIndex === -1) {
              Swal.fire('خطأ', `لم يتم العثور على الصنف "${receive.product}" في الفرع لتحديثه.`, 'error');
              return;
         }

        const originalRecord = { ...branchData[branchId].receiving[receiveIndex] }; // Copy before modification
        const product = branchData[branchId].products[productIndex];

        // --- Reverse the original receiving effect on the product ---
        const originalQuantity = parseFloat(originalRecord.quantity || 0);
        const originalPricePerGram = parseFloat(originalRecord.purchasePrice || 0);
        const originalCost = originalQuantity * originalPricePerGram;

        product.quantity -= originalQuantity;
        product.purchasePrice = (product.purchasePrice || 0) - originalCost;
         // Ensure non-negative after reversal
         if (product.quantity < 0) product.quantity = 0;
         if (product.purchasePrice < 0) product.purchasePrice = 0;


         // --- Apply the new receiving effect ---
        const newQuantity = parseFloat(updatedData.quantity);
        const newPricePerGram = parseFloat(updatedData.purchasePrice);
        const newCost = newQuantity * newPricePerGram;

        product.quantity += newQuantity;
        product.purchasePrice += newCost;

        // --- Update the receiving record itself ---
        branchData[branchId].receiving[receiveIndex] = {
            ...originalRecord, // Keep date, user, product
            quantity: newQuantity,
            purchasePrice: newPricePerGram, // Store price per gram
            supplierName: updatedData.supplierName
        };


        try {
            // Save updated products and receiving list for the branch
            await database.ref(`/branchData/${branchId}`).update({
                products: branchData[branchId].products,
                receiving: branchData[branchId].receiving
            });

            // Refresh UI
            showPurchases(); // Refresh the history list
            updateProductsTable(); // Refresh product tables view
            // Update product dropdowns on other pages if necessary
            populateProductSelect('sales', getBranchNameById(branchId));
            populateProductSelect('returns', getBranchNameById(branchId));
            populateProductSelect('receiving', getBranchNameById(branchId));
            // Add item movement, expenses scrap etc. if needed

            Swal.fire('تم', 'تم تحديث بيانات الاستلام بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء تحديث سجل الاستلام");
            // Revert local changes by reloading
            await loadData();
        }
    }
}


// Delete Receiving Record (Admin only)
async function deleteReceiving(receive) {
     if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لحذف السجلات', 'error');
        return;
    }
     if (!receive || !receive.branchId || !receive.product) {
         Swal.fire('خطأ', 'بيانات سجل الاستلام غير كاملة للحذف.', 'error');
         return;
     }

    const confirmResult = await Swal.fire({
        title: "تأكيد الحذف",
        text: `هل أنت متأكد من حذف سجل استلام "${receive.product}" من فرع "${receive.branchName}"؟ سيتم عكس تأثيره على المخزون.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: "نعم، احذف",
        cancelButtonText: "إلغاء",
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });

    if (confirmResult.isConfirmed) {
        const branchId = receive.branchId;

        // Find the index of the receiving record
        const receiveIndex = branchData[branchId]?.receiving.findIndex(r =>
            r.date === receive.date && r.user === receive.user && r.product === receive.product
        );

        if (receiveIndex === -1 || !branchData[branchId].products) {
            Swal.fire('خطأ', 'لم يتم العثور على سجل الاستلام الأصلي أو بيانات الأصناف.', 'error');
            return;
        }

        // Find the corresponding product
        const productIndex = branchData[branchId].products.findIndex(p => p.name === receive.product);
        if (productIndex === -1) {
            console.warn(`Product "${receive.product}" not found in branch ${branchId} during deletion. Inventory may be inaccurate.`);
            // Proceed to delete record, but inventory won't be adjusted
        } else {
             // --- Reverse the receiving effect on the product ---
             const product = branchData[branchId].products[productIndex];
             const quantityToDelete = parseFloat(receive.quantity || 0);
             const pricePerGram = parseFloat(receive.purchasePrice || 0);
             const costToDelete = quantityToDelete * pricePerGram;

             product.quantity -= quantityToDelete;
             product.purchasePrice = (product.purchasePrice || 0) - costToDelete;
              // Ensure non-negative
              if (product.quantity < 0) {
                  console.warn(`Product ${product.name} quantity went negative after deleting receiving. Setting to 0.`);
                  product.quantity = 0;
              }
              if (product.purchasePrice < 0) {
                  console.warn(`Product ${product.name} purchase price went negative after deleting receiving. Setting to 0.`);
                  product.purchasePrice = 0;
              }
        }

        // Remove the receiving record from the list
        branchData[branchId].receiving.splice(receiveIndex, 1);

        try {
            // Save updated products and receiving list for the branch
            await database.ref(`/branchData/${branchId}`).update({
                products: branchData[branchId].products, // May not have changed if product wasn't found
                receiving: branchData[branchId].receiving
            });

            // Refresh UI
             document.dispatchEvent(new CustomEvent('receivingDeleted', { detail: { branchId: branchId } })); // Dispatch event
             showPurchases(); // Refresh the current view
             updateProductsTable(); // Refresh product tables view
            // Update product dropdowns
             populateProductSelect('sales', getBranchNameById(branchId));
             populateProductSelect('returns', getBranchNameById(branchId));
             populateProductSelect('receiving', getBranchNameById(branchId));

            Swal.fire('تم الحذف', 'تم حذف بيانات الاستلام بنجاح', 'success');

        } catch (error) {
             handleError(error, "خطأ أثناء حذف سجل الاستلام");
             // Revert local changes by reloading
             await loadData();
        }
    }
}

// Updates dropdowns and potentially clears table for the receiving page
function updateReceivingPage() {
    updateBranchSelect('receiving-branch-select'); // For recording
    updateBranchSelect('receiving-branch-filter'); // For filtering
    // Populate products based on the default/current selection for recording
    populateProductSelect('receiving', document.getElementById('receiving-branch-select').value);

    // Add listener for the recording branch select to update products
    const recBranchSelect = document.getElementById('receiving-branch-select');
    if (recBranchSelect) {
        // Remove previous listener if exists to avoid duplicates
        recBranchSelect.removeEventListener('change', handleReceivingBranchChange);
        recBranchSelect.addEventListener('change', handleReceivingBranchChange);
    }

     // Hide the results table initially until a search is performed
     const purchasesTableWrapper = document.getElementById('purchases-table')?.closest('.table-wrapper');
     const purchasesListTbody = document.getElementById('purchases-list');
     if (purchasesTableWrapper) purchasesTableWrapper.style.display = 'none';
     if (purchasesListTbody) purchasesListTbody.innerHTML = '';
}

// Handler function for event listener to avoid creating anonymous functions repeatedly
function handleReceivingBranchChange(event) {
    populateProductSelect('receiving', event.target.value);
}
