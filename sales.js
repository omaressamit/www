// sales.js

let lastSaleClickTime = 0; // Initialize timestamp

// Work day management variables
let workDayUpdateInterval = null;

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

    // Check if user has an active work day
    if (!canRecordSales()) {
        Swal.fire({
            title: 'يوم العمل غير نشط',
            text: 'يجب بدء يوم العمل أولاً قبل تسجيل المبيعات',
            icon: 'warning',
            confirmButtonText: 'موافق'
        });
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

    // Get current active work day
    const activeWorkDay = getCurrentActiveWorkDay();

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
        type: 'sale',
        workDayId: activeWorkDay ? activeWorkDay.startTime : null // Link to work day
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

    // Get current active work day
    const activeWorkDay = getCurrentActiveWorkDay();
    if (!activeWorkDay) {
        dailySalesTableBody.innerHTML = '<tr><td colspan="5">لا يوجد يوم عمل نشط. يرجى بدء يوم العمل لعرض المبيعات.</td></tr>';
        return;
    }

    const branchSales = branchData[branchId]?.sales || [];

    // Filter sales for the current user and current work day for the selected branch
    const workDayStartTime = new Date(activeWorkDay.startTime);
    const workDayEndTime = activeWorkDay.endTime ? new Date(activeWorkDay.endTime) : new Date();

    const todayTransactions = branchSales.filter(sale => {
        if (sale.user !== currentUser.username) return false;

        const saleDate = new Date(sale.date);
        return saleDate >= workDayStartTime && saleDate <= workDayEndTime;
    });


    if (todayTransactions.length === 0) {
        dailySalesTableBody.innerHTML = `<tr><td colspan="5">لا يوجد مبيعات مسجلة لك في يوم العمل الحالي في فرع "${selectedBranchName}".</td></tr>`;
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
            <strong> إجمالي يوم العمل (${selectedBranchName}): ${totalDailyValue.toFixed(2)} </strong>
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

// ==================== WORK DAY MANAGEMENT FUNCTIONS ====================

// Initialize work day status when page loads
function initializeWorkDayStatus() {
    if (!currentUser) return;

    updateWorkDayDisplay();
    updateWorkDayControls();
}

// Start a new work day for the current user
async function startWorkDay() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }

    const result = await Swal.fire({
        title: 'بدء يوم العمل',
        text: 'هل أنت متأكد من بدء يوم عمل جديد؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'نعم، ابدأ',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#4CAF50',
        cancelButtonColor: '#d33'
    });

    if (result.isConfirmed) {
        try {
            const workDayData = {
                startTime: new Date().toISOString(),
                endTime: null,
                isActive: true,
                userId: currentUser.username
            };

            // Save work day data to user's profile
            if (!currentUser.workDays) {
                currentUser.workDays = [];
            }
            currentUser.workDays.push(workDayData);

            // Update user in the global users array
            const userIndex = users.findIndex(u => u.username === currentUser.username);
            if (userIndex !== -1) {
                users[userIndex] = currentUser;
                await database.ref('/users').set(users);
            }

            updateWorkDayDisplay();
            updateWorkDayControls();
            startWorkDayTimer();

            Swal.fire({
                title: 'تم بدء يوم العمل',
                text: 'تم بدء يوم العمل بنجاح. يمكنك الآن تسجيل المبيعات.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

        } catch (error) {
            handleError(error, "خطأ أثناء بدء يوم العمل");
        }
    }
}

// End the current work day
async function endWorkDay() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }

    const activeWorkDay = getCurrentActiveWorkDay();
    if (!activeWorkDay) {
        Swal.fire('تنبيه', 'لا يوجد يوم عمل نشط لإنهائه', 'warning');
        return;
    }

    const result = await Swal.fire({
        title: 'إنهاء يوم العمل',
        text: 'هل أنت متأكد من إنهاء يوم العمل الحالي؟ لن تتمكن من تسجيل مبيعات جديدة حتى تبدأ يوم عمل جديد.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أنهِ اليوم',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ff6b6b',
        cancelButtonColor: '#6c757d'
    });

    if (result.isConfirmed) {
        try {
            // Update the active work day
            activeWorkDay.endTime = new Date().toISOString();
            activeWorkDay.isActive = false;

            // Update user in the global users array
            const userIndex = users.findIndex(u => u.username === currentUser.username);
            if (userIndex !== -1) {
                users[userIndex] = currentUser;
                await database.ref('/users').set(users);
            }

            updateWorkDayDisplay();
            updateWorkDayControls();
            stopWorkDayTimer();

            Swal.fire({
                title: 'تم إنهاء يوم العمل',
                text: 'تم إنهاء يوم العمل بنجاح. شكراً لك على عملك اليوم!',
                icon: 'success',
                timer: 3000,
                showConfirmButton: false
            });

        } catch (error) {
            handleError(error, "خطأ أثناء إنهاء يوم العمل");
        }
    }
}

// Get the current active work day for the user
function getCurrentActiveWorkDay() {
    if (!currentUser || !currentUser.workDays) return null;

    return currentUser.workDays.find(workDay => workDay.isActive && workDay.userId === currentUser.username);
}

// Update the work day display
function updateWorkDayDisplay() {
    const indicator = document.getElementById('work-day-indicator');
    const duration = document.getElementById('work-day-duration');

    if (!indicator || !duration) return;

    const activeWorkDay = getCurrentActiveWorkDay();

    if (activeWorkDay) {
        indicator.textContent = '🟢 يوم العمل: نشط';
        indicator.className = 'active';

        const startTime = new Date(activeWorkDay.startTime);
        const now = new Date();
        const durationMs = now - startTime;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

        duration.textContent = `مدة العمل: ${hours} ساعة و ${minutes} دقيقة`;
    } else {
        indicator.textContent = '🔴 يوم العمل: غير نشط';
        indicator.className = 'inactive';
        duration.textContent = 'لم يتم بدء يوم العمل بعد';
    }
}

// Update work day control buttons
function updateWorkDayControls() {
    const startBtn = document.getElementById('start-work-day-btn');
    const endBtn = document.getElementById('end-work-day-btn');

    if (!startBtn || !endBtn) return;

    const activeWorkDay = getCurrentActiveWorkDay();

    if (activeWorkDay) {
        startBtn.style.display = 'none';
        endBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'block';
        endBtn.style.display = 'none';
    }
}

// Start the work day timer
function startWorkDayTimer() {
    stopWorkDayTimer(); // Clear any existing timer

    workDayUpdateInterval = setInterval(() => {
        updateWorkDayDisplay();
    }, 60000); // Update every minute
}

// Stop the work day timer
function stopWorkDayTimer() {
    if (workDayUpdateInterval) {
        clearInterval(workDayUpdateInterval);
        workDayUpdateInterval = null;
    }
}

// Check if user can record sales (has active work day)
function canRecordSales() {
    const activeWorkDay = getCurrentActiveWorkDay();
    return activeWorkDay !== null;
}