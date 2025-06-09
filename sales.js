// sales.js

let lastSaleClickTime = 0; // Initialize timestamp

// Sets today's date as default in the sale date field
function setDefaultSaleDate() {
    const saleDateInput = document.getElementById('sale-date');
    if (saleDateInput) {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        saleDateInput.value = formattedDate;
    }
}

async function recordSale() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }

    // Double-click prevention:
    const now = Date.now();
    if (now - lastSaleClickTime < 5000) {
        Swal.fire('تنبيه', 'يرجى الانتظار 5 ثوانٍ قبل تسجيل عملية بيع أخرى.', 'warning');
        return;
    }

    const branchName = document.getElementById('branch-select').value;
    const saleDate = document.getElementById('sale-date').value;
    const productName = document.getElementById('product-select').value.trim();
    const saleQuantity = parseFloat(document.getElementById('sale-quantity').value.trim());
    const salePrice = parseFloat(document.getElementById('sale-price').value.trim()); // Total sale price
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const details = document.getElementById('sale-details').value.trim();
    const paymentMethod = document.getElementById('payment-method').value;
    const customerDetails = document.getElementById('customer-details').value.trim();

    // Get Branch ID
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!saleDate) {
        Swal.fire('خطأ', 'يرجى اختيار تاريخ البيع.', 'error');
        return;
    }
    if (!productName || !paymentMethod || isNaN(saleQuantity) || isNaN(salePrice)) {
        Swal.fire('خطأ', 'يرجى إدخال جميع الحقول المطلوبة (الفرع، التاريخ، الصنف، الكمية، السعر، وسيلة الدفع) بقيم صحيحة.', 'error');
        return;
    }
    if (saleQuantity <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال كمية مباعة صحيحة (أكبر من صفر).', 'error');
        return;
    }
    if (salePrice <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال سعر بيع صحيح (أكبر من صفر).', 'error');
        return;
    }

    // Authorization Check: User must be assigned to the branch (or be admin)
    if (currentUser.role !== 'admin') {
         if (!branchMetadata[branchId] || !branchMetadata[branchId].users || !branchMetadata[branchId].users.includes(currentUser.username)) {
            Swal.fire('خطأ', `غير مصرح لك بتسجيل مبيعات لفرع "${branchName}"`, 'error');
            return;
        }
    }

    // Ensure branch data and necessary arrays exist
    if (!branchData[branchId] || !branchData[branchId].products) {
        console.error(`Branch data or products missing for ID: ${branchId}`);
        Swal.fire('خطأ', 'بيانات الفرع أو الأصناف غير موجودة.', 'error');
        return;
    }
    branchData[branchId].sales = branchData[branchId].sales || [];

    // Find product and check quantity
    const productIndex = branchData[branchId].products.findIndex(p => p.name === productName);

    if (productIndex === -1) {
        Swal.fire('خطأ', `الصنف "${productName}" غير موجود في فرع "${branchName}".`, 'error');
        return;
    }

    const product = branchData[branchId].products[productIndex];

    if (product.quantity < saleQuantity) {
        Swal.fire('خطأ', `الكمية المتوفرة (${product.quantity.toFixed(2)}) من الصنف "${productName}" غير كافية لإتمام البيع (${saleQuantity}).`, 'error');
        return;
    }

    // --- Update Product Inventory ---
    const originalQuantityBeforeSale = product.quantity;
    product.quantity -= saleQuantity;

    // Calculate the cost of the sold items based on average cost *before* deduction
    let costBasis = 0;
     if (originalQuantityBeforeSale > 0 && product.purchasePrice > 0) {
         costBasis = product.purchasePrice / originalQuantityBeforeSale;
     }
    const costOfSale = costBasis * saleQuantity;
    product.purchasePrice = (product.purchasePrice || 0) - costOfSale;
    // Ensure purchase price doesn't go negative
     if (product.purchasePrice < 0) product.purchasePrice = 0;
    // --- End Inventory Update ---


    // Create date object from selected date and current time
    const selectedDate = new Date(saleDate);
    const currentTime = new Date();
    // Set the time to current time but keep the selected date
    selectedDate.setHours(currentTime.getHours(), currentTime.getMinutes(), currentTime.getSeconds(), currentTime.getMilliseconds());

    // Add record to the specific branch's sales list
    const newSaleRecord = {
        date: selectedDate.toISOString(),
        product: productName,
        quantity: saleQuantity,
        price: salePrice, // Total sale price
        customerPhone: customerPhone,
        details: details,
        user: currentUser.username,
        paymentMethod: paymentMethod,
        customerDetails: customerDetails,
        type: 'sale'
        // branch: branchName // Optional redundancy
    };
    branchData[branchId].sales.push(newSaleRecord);

    lastSaleClickTime = now; // Update timestamp

    try {
        // Save the updated branch data (products and sales list)
        await database.ref(`/branchData/${branchId}`).update({
            products: branchData[branchId].products,
            sales: branchData[branchId].sales
        });

        // Clear form fields
        document.getElementById('sale-date').value = '';
        document.getElementById('sale-quantity').value = '';
        document.getElementById('sale-price').value = '';
        document.getElementById('customer-phone').value = '';
        document.getElementById('sale-details').value = '';
        document.getElementById('payment-method').value = 'نقدي'; // Reset to default
        document.getElementById('customer-details').value = '';
        // Repopulate product select for the current branch
        populateProductSelect('sales', branchName);

        // Dispatch event
        document.dispatchEvent(new CustomEvent('saleRecorded', { detail: { branchId: branchId } }));

        Swal.fire({
            title: 'تم', text: 'تم تسجيل عملية البيع بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });
    } catch (error) {
        handleError(error, "خطأ أثناء حفظ عملية البيع");
        // Revert local changes (difficult)
        await loadData(); // Reload data
    }
}


// Updates the "Target" display for the logged-in user
// TODO: Decide if target should be cross-branch or per-branch.
// Current implementation: Cross-branch target.
// Note: Workshop operations are excluded from employee targets
function updateTargetDisplay() {
    if (!currentUser) return;

    let totalSalesValue = 0;
    // Iterate through all branches the user might have sold in
    for (const branchId in branchData) {
        const salesList = branchData[branchId]?.sales || [];
        salesList.forEach(sale => {
            if (sale.user === currentUser.username) {
                totalSalesValue += parseFloat(sale.price || 0);
            }
        });
         // Workshop operations are excluded from employee targets
         // const workshopList = branchData[branchId]?.workshopOperations || [];
         // workshopList.forEach(op => {
         //     if (op.user === currentUser.username) {
         //         totalSalesValue += parseFloat(op.price || 0);
         //     }
         // });
    }

    const targetTableBody = document.querySelector('#target-table tbody');
    if (!targetTableBody) return;

    targetTableBody.innerHTML = ''; // Clear existing rows
    const row = targetTableBody.insertRow();
    row.innerHTML = `
       <td>${currentUser.username}</td>
       <td>${totalSalesValue.toFixed(2)}</td>
     `;
}


// Updates the "Daily Sales" table for the logged-in user for the currently selected branch
function updateDailySalesTable() {
    if (!currentUser) return;

    const selectedBranchName = document.getElementById('branch-select').value;
    const branchId = getBranchIdByName(selectedBranchName);
    const dailySalesTableBody = document.querySelector('#daily-sales-table tbody');
    if (!dailySalesTableBody) return;

    dailySalesTableBody.innerHTML = ''; // Clear previous

    if (!branchId) {
        dailySalesTableBody.innerHTML = '<tr><td colspan="5">يرجى اختيار فرع لعرض مبيعات اليوم.</td></tr>';
        return;
    }

    const options = { year: 'numeric', month: '2-digit', day: '2-digit' }; // Date format for comparison
    const todayStr = new Date().toLocaleDateString('ar-EG', options);

    const branchSales = branchData[branchId]?.sales || [];
    // Workshop operations are excluded from employee targets
    // const branchWorkshopOps = branchData[branchId]?.workshopOperations || [];

    // Filter sales for the current user and today for the selected branch (workshop ops excluded from targets)
    const todayTransactions = [
         ...branchSales.filter(sale => sale.user === currentUser.username && new Date(sale.date).toLocaleDateString('ar-EG', options) === todayStr)
         // Workshop operations excluded from employee targets
         // ...branchWorkshopOps.filter(op => op.user === currentUser.username && new Date(op.date).toLocaleDateString('ar-EG', options) === todayStr)
        ];


    if (todayTransactions.length === 0) {
        dailySalesTableBody.innerHTML = `<tr><td colspan="5">لا يوجد مبيعات مسجلة لك اليوم في فرع "${selectedBranchName}".</td></tr>`;
        return;
    }

    // Sort by date descending (most recent first)
    todayTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let totalDailyValue = 0;

    todayTransactions.forEach(transaction => {
        const row = dailySalesTableBody.insertRow();
        const price = parseFloat(transaction.price || 0);

        if (transaction.type === 'sale') {
            row.insertCell(0).textContent = transaction.product;
            row.insertCell(1).textContent = transaction.quantity?.toFixed(2) || '0.00';
            row.insertCell(2).textContent = price.toFixed(2);
            row.insertCell(3).textContent = transaction.details || '';
            row.insertCell(4).textContent = transaction.paymentMethod || '';
        } else if (transaction.type === 'workshop') {
            row.insertCell(0).textContent = "خدمة ورشة"; // Generic description
            row.insertCell(1).textContent = '-'; // No quantity
            row.insertCell(2).textContent = price.toFixed(2);
            row.insertCell(3).textContent = transaction.description || ''; // Use workshop description
            row.insertCell(4).textContent = transaction.paymentMethod || '';
        }
        totalDailyValue += price;
    });

    // Add total row
    const totalRow = dailySalesTableBody.insertRow();
    totalRow.innerHTML = `
        <td colspan="5" style="text-align: center; background-color: #555;">
            <strong> إجمالي اليوم (${selectedBranchName}): ${totalDailyValue.toFixed(2)} </strong>
        </td>`;
}


// Populates the employee dropdown based on the selected branch in the main sales form
function populateBranchEmployeeSelect() {
    const employeeSelect = document.getElementById('employee-select');
    const selectedBranchName = document.getElementById('branch-select').value;
    if (!employeeSelect) return;

    employeeSelect.innerHTML = '<option value="">اختر موظف...</option>';

    if (!selectedBranchName) {
        employeeSelect.disabled = true;
        return;
    }

    const branchId = getBranchIdByName(selectedBranchName);
    if (!branchId || !branchMetadata[branchId] || !branchMetadata[branchId].users) {
         employeeSelect.disabled = true;
         console.warn(`No users found for branch: ${selectedBranchName}`);
        return;
    }

    const branchUsers = branchMetadata[branchId].users;
    const usersInBranch = users.filter(user => branchUsers.includes(user.username) && user.role !== 'admin'); // Filter global users list

    if (usersInBranch.length === 0) {
        employeeSelect.disabled = true;
        employeeSelect.innerHTML = '<option value="">لا يوجد موظفين بهذا الفرع</option>';
        return;
    }

    employeeSelect.disabled = false;
     usersInBranch.sort((a, b) => a.username.localeCompare(b.username, 'ar')); // Sort alphabetically

    usersInBranch.forEach(user => {
        const option = document.createElement('option');
        option.value = user.username;
        option.textContent = user.username;
        employeeSelect.appendChild(option);
    });
}


// Queries and displays daily sales for a selected employee in the selected branch
async function queryEmployeeDailySales() {
    const selectedEmployeeUsername = document.getElementById('employee-select').value;
    const selectedBranchName = document.getElementById('branch-select').value; // Get selected branch
    const employeeDailySalesTableBody = document.querySelector('#employee-daily-sales-table tbody');

    if (!employeeDailySalesTableBody) return;
    employeeDailySalesTableBody.innerHTML = ''; // Clear previous results

    if (!selectedBranchName) {
        Swal.fire('تنبيه', 'يرجى اختيار الفرع أولاً.', 'warning');
        return;
    }
    if (!selectedEmployeeUsername) {
        Swal.fire('تنبيه', 'يرجى اختيار موظف للاستعلام عن مبيعاته اليومية.', 'warning');
        return;
    }

    const branchId = getBranchIdByName(selectedBranchName);
    if (!branchId) {
         Swal.fire('خطأ', 'لم يتم العثور على بيانات الفرع المحدد.', 'error');
        return;
    }


    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const todayStr = new Date().toLocaleDateString('ar-EG', options);

    const branchSales = branchData[branchId]?.sales || [];
    // Workshop operations are excluded from employee targets
    // const branchWorkshopOps = branchData[branchId]?.workshopOperations || [];

    // Filter for the selected employee and today in the selected branch (workshop ops excluded from targets)
    const todayEmployeeTransactions = [
         ...branchSales.filter(sale => sale.user === selectedEmployeeUsername && new Date(sale.date).toLocaleDateString('ar-EG', options) === todayStr)
         // Workshop operations excluded from employee targets
         // ...branchWorkshopOps.filter(op => op.user === selectedEmployeeUsername && new Date(op.date).toLocaleDateString('ar-EG', options) === todayStr)
        ];


    if (todayEmployeeTransactions.length === 0) {
        employeeDailySalesTableBody.innerHTML = `<tr><td colspan="5">لا يوجد مبيعات للموظف "${selectedEmployeeUsername}" اليوم في فرع "${selectedBranchName}".</td></tr>`;
        return;
    }

     // Sort by date descending
     todayEmployeeTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());


    let totalEmployeeDailyValue = 0;

    todayEmployeeTransactions.forEach(transaction => {
         const row = employeeDailySalesTableBody.insertRow();
         const price = parseFloat(transaction.price || 0);

         if (transaction.type === 'sale') {
             row.insertCell(0).textContent = transaction.product;
             row.insertCell(1).textContent = transaction.quantity?.toFixed(2) || '0.00';
             row.insertCell(2).textContent = price.toFixed(2);
             row.insertCell(3).textContent = transaction.details || '';
             row.insertCell(4).textContent = transaction.paymentMethod || '';
         } else if (transaction.type === 'workshop') {
             row.insertCell(0).textContent = "خدمة ورشة";
             row.insertCell(1).textContent = '-';
             row.insertCell(2).textContent = price.toFixed(2);
             row.insertCell(3).textContent = transaction.description || '';
             row.insertCell(4).textContent = transaction.paymentMethod || '';
         }
         totalEmployeeDailyValue += price;
    });

    // Add total row
    const totalRow = employeeDailySalesTableBody.insertRow();
    totalRow.innerHTML = `<td colspan="5" style="text-align: center; background-color: #555;"><strong>إجمالي اليوم للموظف (${selectedEmployeeUsername}): ${totalEmployeeDailyValue.toFixed(2)}</strong></td>`;
}