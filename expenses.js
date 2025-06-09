// --- expenses.js ---

async function recordExpense() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول لتسجيل المصروفات', 'error');
        return;
    }

    const branchName = document.getElementById('expense-branch-select').value;
    const expenseType = document.getElementById('expense-type').value;
    const amount = parseFloat(document.getElementById('expense-amount').value.trim());
    const description = document.getElementById('expense-description').value.trim();

    // Get Branch ID
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!expenseType || isNaN(amount) || amount <= 0) {
        Swal.fire('خطأ', 'يرجى ملء حقول النوع والمبلغ والتأكد من إدخال قيمة موجبة للمصروف', 'error');
        return;
    }

    // Ensure branch data and expenses array exist
    if (!branchData[branchId]) {
        console.error(`Branch data missing for ID: ${branchId}`);
        Swal.fire('خطأ', 'بيانات الفرع غير موجودة.', 'error');
        return;
    }
    branchData[branchId].expenses = branchData[branchId].expenses || [];

    let expenseData = {
        date: new Date().toISOString(),
        // branch: branchName, // Optional redundancy
        expenseType: expenseType,
        amount: amount,
        description: description,
        user: currentUser.username // User who recorded the expense
    };

    let requiresProductSave = false; // Flag to check if product data also needs saving

    // Handle 'مرتبات' specific fields
    if (expenseType === 'مرتبات') {
        if (currentUser.role !== 'admin') {
            Swal.fire('خطأ', 'فقط المسؤول يمكنه تسجيل مصروفات المرتبات', 'error');
            return;
        }
        const expenseUser = document.getElementById('expense-user-select').value;
        if (!expenseUser) {
            Swal.fire('خطأ', 'يرجى اختيار المستخدم للمرتب', 'error');
            return;
        }
        expenseData.expenseUser = expenseUser; // User receiving the salary
    }
    // Handle 'شراء فضة كسر' specific fields
    else if (expenseType === "شراء فضة كسر") {
        const scrapType = document.getElementById('expense-scrap-type').value; // Product Name
        const scrapQuantity = parseFloat(document.getElementById('expense-scrap-quantity').value);

        if (!scrapType || isNaN(scrapQuantity) || scrapQuantity <= 0) {
            Swal.fire('خطأ', "يرجى إدخال بيانات صحيحة لنوع وكمية الكسر", 'error');
            return;
        }

        // Ensure products array exists for product update
        branchData[branchId].products = branchData[branchId].products || [];

        // Find Product by selected scrap Type in the specific branch
        const productIndex = branchData[branchId].products.findIndex(p => p.name === scrapType);
        if (productIndex === -1) {
            Swal.fire('خطأ', `الصنف '${scrapType}' غير موجود في فرع '${branchName}' لقبول الكسر. قم بإضافة الصنف أولاً أو اختر صنفاً موجوداً.`, 'error');
            return;
        }

        // Update quantity and total purchase price (Total Cost)
        const product = branchData[branchId].products[productIndex];
        product.quantity += scrapQuantity;
        // 'amount' is the total cost paid for the scrap. Add this to the product's total purchase price.
        product.purchasePrice = (product.purchasePrice || 0) + amount;

        // Store scrap details in the expense record
        expenseData.scrapType = scrapType;
        expenseData.scrapQuantity = scrapQuantity;
        requiresProductSave = true; // Mark that product data was modified
    }

    // Add expense to the specific branch's expenses list
    branchData[branchId].expenses.push(expenseData);

    try {
        // Prepare data payload for saving
        const dataToSave = {
             expenses: branchData[branchId].expenses
        };
        if (requiresProductSave) {
             dataToSave.products = branchData[branchId].products;
        }

        // Save the updated expenses (and potentially products) for the branch
        await database.ref(`/branchData/${branchId}`).update(dataToSave);

        // Reset the form
        // document.getElementById('expense-branch-select').value = ''; // Don't reset branch?
        document.getElementById('expense-type').value = 'أخرى';
        document.getElementById('expense-amount').value = '';
        document.getElementById('expense-description').value = '';
        // Reset and hide conditional fields
        document.getElementById('expense-user-div').style.display = 'none';
        document.getElementById('expense-scrap-fields').style.display = 'none';
        document.getElementById('expense-user-select').value = '';
        document.getElementById('expense-scrap-type').value = ''; // Reset scrap type select
        document.getElementById('expense-scrap-quantity').value = '';

        // Trigger necessary UI updates
        document.dispatchEvent(new CustomEvent('expenseRecorded', { detail: { branchId: branchId } }));
        if (requiresProductSave) {
            document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } }));
        }

        Swal.fire({
            title: 'تم', text: 'تم تسجيل المصروف بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });

    } catch (error) {
        handleError(error, "خطأ أثناء حفظ المصروف");
        // Revert local changes (difficult)
        await loadData(); // Reload data
    }
}

// Handles visibility of specific form fields based on expense type and selected branch
function updateExpenseForm() {
    const expenseType = document.getElementById('expense-type').value;
    const userSelectDiv = document.getElementById('expense-user-div');
    const scrapFields = document.getElementById('expense-scrap-fields');
    const branchSelect = document.getElementById('expense-branch-select');
    const selectedBranchName = branchSelect.value; // Get selected branch name

    // Hide all conditional sections initially
    if (userSelectDiv) userSelectDiv.style.display = 'none';
    if (scrapFields) scrapFields.style.display = 'none';

    if (expenseType === "مرتبات") {
        if (currentUser && currentUser.role === 'admin') {
            if (userSelectDiv) userSelectDiv.style.display = 'block';
            populateUserSelect(); // Populate the user dropdown
        } else {
            // If not admin, reset the type selection to prevent recording salary
            document.getElementById('expense-type').value = 'أخرى';
             // Swal.fire('تنبيه', 'فقط المسؤول يمكنه تسجيل مصروفات المرتبات.', 'warning'); // Optional warning
        }
    } else if (expenseType === "شراء فضة كسر") {
        if (scrapFields) scrapFields.style.display = 'block';
        // Populate the scrap type select with products from the *selected branch*
        populateProductSelect('scrap-purchase', selectedBranchName); // Use helper
    }
}

// Populates the user select dropdown for salary expenses
function populateUserSelect() {
    const userSelect = document.getElementById('expense-user-select');
    if (!userSelect) return;
    userSelect.innerHTML = "<option value=''>اختر المستخدم</option>";

    if (typeof users !== 'undefined' && Array.isArray(users)) {
        const nonAdminUsers = users.filter(user => user.role !== 'admin');
        nonAdminUsers.sort((a, b) => a.username.localeCompare(b.username, 'ar')); // Sort
        nonAdminUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.username;
            userSelect.appendChild(option);
        });
    }
}

// Displays the list of expenses based on filters
function showExpenses() {
    if (!currentUser) return;

    // Get filter values
    const selectedBranchName = document.getElementById('expenses-branch-filter').value;
    const dateFromStr = document.getElementById('expenses-date-from').value;
    const dateToStr = document.getElementById('expenses-date-to').value;
    const searchTerm = document.getElementById('search-expenses').value.trim().toLowerCase();

    const expensesListTbody = document.getElementById('expenses-list');
    const expensesTableWrapper = document.getElementById('expenses-table-wrapper');

    if (!expensesListTbody || !expensesTableWrapper) {
         console.error("Expenses table elements not found.");
         return;
    }

    // Date From validation
    if (!dateFromStr) {
        Swal.fire('خطأ', 'يرجى تحديد تاريخ بداية الفترة لعرض المصروفات.', 'error');
        expensesTableWrapper.style.display = 'none';
        expensesListTbody.innerHTML = '';
        return;
    }

    expensesTableWrapper.style.display = 'block';
    expensesListTbody.innerHTML = ''; // Clear previous results

    const dateFrom = new Date(dateFromStr);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = dateToStr ? new Date(dateToStr) : null;
    if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
    }

    let overallTotalExpensesAmount = 0;
    let overallTotalScrapQuantity = 0;
    let displayedData = []; // Array to hold data rows before rendering

    // Determine which branches to process based on filter and user role
    const branchIdsToProcess = [];
    if (selectedBranchName) {
        const branchId = getBranchIdByName(selectedBranchName);
        if (branchId) {
            // Check if user has access to this specific branch (if not admin)
             if (currentUser.role === 'admin' || (branchMetadata[branchId]?.users?.includes(currentUser.username))) {
                branchIdsToProcess.push(branchId);
             } else {
                  console.warn(`User ${currentUser.username} does not have access to filtered branch ${selectedBranchName}`);
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

     // Sort branch IDs by name for consistent order if showing multiple
     branchIdsToProcess.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));


    // Iterate through the determined branches
    branchIdsToProcess.forEach(branchId => {
        const branchExpensesList = branchData[branchId]?.expenses || [];
        const branchName = getBranchNameById(branchId) || `فرع (${branchId})`; // Get name for display

        const filteredBranchExpenses = branchExpensesList.filter(expense => {
            if (!expense || !expense.date) return false;
            let expenseDate;
            try {
                expenseDate = new Date(expense.date);
                if (isNaN(expenseDate.getTime())) return false;
            } catch (e) { return false; }

            // Date Check
            const dateMatch = expenseDate.getTime() >= dateFrom.getTime() &&
                              (!dateTo || expenseDate.getTime() <= dateTo.getTime());
            if (!dateMatch) return false;

            // Search Term Check
            const searchMatch = !searchTerm || (
                expense.expenseType?.toLowerCase().includes(searchTerm) ||
                expense.description?.toLowerCase().includes(searchTerm) ||
                branchName.toLowerCase().includes(searchTerm) || // Search on branch name
                expense.amount?.toString().includes(searchTerm) ||
                expense.user?.toLowerCase().includes(searchTerm) || // User who recorded
                // Salary specific
                expense.expenseUser?.toLowerCase().includes(searchTerm) ||
                // Scrap specific
                expense.scrapType?.toLowerCase().includes(searchTerm) ||
                expense.scrapQuantity?.toString().includes(searchTerm)
            );
            return searchMatch;
        });

        // Add filtered expenses for this branch to the main display array
        if (filteredBranchExpenses.length > 0) {
             filteredBranchExpenses.forEach(expense => {
                 // Add branchId and branchName for context in edit/delete
                 displayedData.push({ ...expense, branchId: branchId, branchName: branchName });
             });
        }
    });


    if (displayedData.length === 0) {
        expensesListTbody.innerHTML = '<tr><td colspan="8">لا توجد بيانات مصروفات للعرض تطابق الفلاتر المحددة.</td></tr>';
        return;
    }

    // Sort all collected data by date (newest first)
    displayedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());


    let currentDisplayBranchName = null; // Track branch changes for headers
    let branchTotalAmount = 0;
    let branchTotalScrap = 0;

    // Function to add branch total row
    const addBranchTotalRow = (tbody, name, amount, scrap) => {
        const totalRow = tbody.insertRow();
        let branchTotalHTML = `<strong>إجمالي مصروفات ${name}: ${amount.toFixed(2)} جنيه</strong>`;
        if (scrap > 0) {
            branchTotalHTML += ` | <strong>إجمالي وزن الكسر: ${scrap.toFixed(2)} جرام</strong>`;
        }
        totalRow.innerHTML = `<td colspan="8" style="text-align: center; background-color: #8bc34a;">${branchTotalHTML}</td>`;
    };


    displayedData.forEach((expense, index) => {
        // Check if branch changed
         if (branchIdsToProcess.length > 1 && expense.branchName !== currentDisplayBranchName) {
            // Add total row for the *previous* branch if it wasn't the first one
            if (currentDisplayBranchName !== null) {
                 addBranchTotalRow(expensesListTbody, currentDisplayBranchName, branchTotalAmount, branchTotalScrap);
                 overallTotalExpensesAmount += branchTotalAmount;
                 overallTotalScrapQuantity += branchTotalScrap;
            }
            // Reset for the new branch
            currentDisplayBranchName = expense.branchName;
            branchTotalAmount = 0;
            branchTotalScrap = 0;
            // Add header row for the new branch
            const branchHeaderRow = expensesListTbody.insertRow();
             branchHeaderRow.innerHTML = `<td colspan="8" style="background-color: #4CAF50; color: white; text-align: center; font-weight: bold;">${currentDisplayBranchName}</td>`;
        }


        const row = expensesListTbody.insertRow();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        let formattedDate = 'تاريخ غير صالح';
        try { formattedDate = new Date(expense.date).toLocaleString('ar-EG', options); } catch (e) { }

        const amount = parseFloat(expense.amount || 0);
        const scrapQuantity = parseFloat(expense.scrapQuantity || 0);

        row.insertCell(0).textContent = formattedDate;
        row.insertCell(1).textContent = expense.branchName; // Display branch name
        row.insertCell(2).textContent = expense.expenseType;
        row.insertCell(3).textContent = expense.expenseUser || ''; // User for salary
        const scrapDisplay = (expense.expenseType === 'شراء فضة كسر' && expense.scrapType && !isNaN(scrapQuantity))
                           ? `${expense.scrapType} - ${scrapQuantity.toFixed(2)} ج`
                           : '';
        row.insertCell(4).textContent = scrapDisplay;
        row.insertCell(5).textContent = amount.toFixed(2);
        row.insertCell(6).textContent = expense.description || '';

        // Actions Cell (Edit/Delete) - Add checks if needed (e.g., only admin can delete salary)
        const actionsCell = row.insertCell(7);
        actionsCell.style.whiteSpace = 'nowrap';
        let canEditDelete = true;
        if (expense.expenseType === 'مرتبات' && currentUser.role !== 'admin') {
            canEditDelete = false; // Non-admin cannot edit/delete salaries
        }

        if (canEditDelete) {
            const editBtn = document.createElement('button');
            editBtn.textContent = "تعديل";
            editBtn.classList.add('edit-btn');
            editBtn.style.width = 'auto'; editBtn.style.marginLeft = '5px';
            editBtn.onclick = () => editExpense(expense); // Pass the full expense object
            actionsCell.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'حذف';
            deleteBtn.classList.add('delete-btn');
            deleteBtn.style.width = 'auto';
            deleteBtn.onclick = () => deleteExpense(expense); // Pass the full expense object
            actionsCell.appendChild(deleteBtn);
         } else {
             actionsCell.textContent = '-'; // Indicate no actions allowed
         }

        // Accumulate totals for the current branch
        branchTotalAmount += amount;
        if (expense.expenseType === 'شراء فضة كسر' && !isNaN(scrapQuantity)) {
            branchTotalScrap += scrapQuantity;
        }

         // Add total row for the last branch after the loop finishes
         if (index === displayedData.length - 1) {
             addBranchTotalRow(expensesListTbody, currentDisplayBranchName || selectedBranchName, branchTotalAmount, branchTotalScrap);
             overallTotalExpensesAmount += branchTotalAmount;
             overallTotalScrapQuantity += branchTotalScrap;
         }
    });


    // Add overall total row for the entire filtered period
    const overallTotalRow = expensesListTbody.insertRow();
    let overallTotalHTML = `<strong> إجمالي المصروفات الكلي: ${overallTotalExpensesAmount.toFixed(2)} جنيه </strong>`;
    if (overallTotalScrapQuantity > 0) {
        overallTotalHTML += ` | <strong> إجمالي وزن الكسر المشترى الكلي: ${overallTotalScrapQuantity.toFixed(2)} جرام </strong>`;
    }
    overallTotalRow.innerHTML = `
        <td colspan="8" style="text-align: center; background-color: #2196f3; color: white; font-weight: bold;">
            ${overallTotalHTML}
        </td>`;
}


// Edit Expense Record
async function editExpense(expense) {
    // expense object should contain branchId and branchName from showExpenses
    if (!expense || !expense.branchId) {
        Swal.fire('خطأ', 'بيانات المصروف غير صالحة للتعديل.', 'error');
        return;
    }
    // Admin check for editing salaries
    if (expense.expenseType === 'مرتبات' && (!currentUser || currentUser.role !== 'admin')) {
        Swal.fire('خطأ', 'فقط المسؤول يمكنه تعديل مصروفات المرتبات.', 'error');
        return;
    }

    // Determine if this is a scrap purchase to handle product cost adjustment
    const isScrapPurchase = expense.expenseType === 'شراء فضة كسر';
    const originalScrapAmount = isScrapPurchase ? (parseFloat(expense.amount) || 0) : 0;

    const { value: updatedExpenseData } = await Swal.fire({
        title: "تعديل المصروف",
        html:
            `<div style="text-align: right;">` +
            `<label style="display: block; margin-top: 10px;">الفرع:</label><input class="swal2-input" value="${expense.branchName}" readonly>` +
            `<label style="display: block; margin-top: 10px;">نوع المصروف:</label><input class="swal2-input" value="${expense.expenseType}" readonly>` +
            (expense.expenseType === 'مرتبات' ? `<label style="display: block; margin-top: 10px;">المستخدم (للمرتب):</label><input class="swal2-input" value="${expense.expenseUser || 'N/A'}" readonly>` : '') +
            (isScrapPurchase ?
                `<label style="display: block; margin-top: 10px;">تفاصيل الكسر:</label>`+
                `<input class="swal2-input" value="${expense.scrapType || 'N/A'}" readonly style="margin-bottom: 5px;">`+ // Readonly scrap type
                `<input class="swal2-input" value="${expense.scrapQuantity?.toFixed(2) || 'N/A'} جرام" readonly>` // Readonly scrap quantity
                : "") +
            `<label style="display: block; margin-top: 10px;">قيمة المصروف:</label><input id="swal-edit-amount" class="swal2-input" value="${expense.amount}" type="number" step="0.01">` +
            `<label style="display: block; margin-top: 10px;">التوضيح:</label><textarea id="swal-edit-description" class="swal2-textarea" style="width: 95%">${expense.description || ''}</textarea>` +
            `</div>`,
        focusConfirm: false,
        preConfirm: () => {
            const newAmount = parseFloat(document.getElementById('swal-edit-amount').value);
            const newDescription = document.getElementById('swal-edit-description').value.trim();

            if (isNaN(newAmount) || newAmount <= 0) {
                Swal.showValidationMessage("يرجى إدخال قيمة صحيحة وموجبة للمصروف");
                return false;
            }
            return { amount: newAmount, description: newDescription };
        }
    });

    if (updatedExpenseData) {
        const branchId = expense.branchId;

        // Find the index of the expense record within its branch's list
        const expenseIndex = branchData[branchId]?.expenses.findIndex(ex =>
            ex.date === expense.date && ex.user === expense.user && ex.expenseType === expense.expenseType && ex.amount === expense.amount // Use original amount for matching
        );

        if (expenseIndex === -1) {
            console.error("Expense not found for editing:", expense, "in branch:", branchId);
            Swal.fire('خطأ', 'لم يتم العثور على المصروف المحدد للتعديل.', 'error');
            return;
        }

        let productUpdateNeeded = false;
        let productCostDifference = 0;

        // Adjust product cost ONLY if it was a scrap purchase and the amount changed
        if (isScrapPurchase) {
             const newScrapAmount = updatedExpenseData.amount;
             if (newScrapAmount !== originalScrapAmount) {
                 productCostDifference = newScrapAmount - originalScrapAmount; // Calculate change in cost

                 const productIndex = branchData[branchId].products?.findIndex(p => p.name === expense.scrapType);
                 if (productIndex !== -1) {
                     // Adjust the total purchase price of the product
                     const product = branchData[branchId].products[productIndex];
                     product.purchasePrice = (product.purchasePrice || 0) + productCostDifference;
                     if (product.purchasePrice < 0) {
                        console.warn(`Product purchase price for ${expense.scrapType} in ${expense.branchName} went below zero after editing expense amount. Setting to 0.`);
                        product.purchasePrice = 0;
                     }
                     productUpdateNeeded = true; // Mark that product data needs saving
                 } else {
                     console.warn(`Product '${expense.scrapType}' not found in branch '${expense.branchName}' when trying to adjust cost during expense edit.`);
                      // Optionally show warning to user?
                 }
            }
        }
        // --- End Product Cost Adjustment ---


        // Update the expense record itself
        branchData[branchId].expenses[expenseIndex] = {
            ...branchData[branchId].expenses[expenseIndex], // Keep original non-editable data
            amount: updatedExpenseData.amount,
            description: updatedExpenseData.description,
        };


        try {
            // Prepare data payload for saving
            const dataToSave = {
                 expenses: branchData[branchId].expenses
            };
            if (productUpdateNeeded) {
                 dataToSave.products = branchData[branchId].products;
            }
            // Save updated data for the branch
            await database.ref(`/branchData/${branchId}`).update(dataToSave);

            // Refresh UI
            document.dispatchEvent(new CustomEvent('expenseRecorded', { detail: { branchId: branchId } })); // Refresh expense list UI
            if(productUpdateNeeded) {
                 document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } })); // Refresh product tables if cost changed
            }
            Swal.fire('تم', "تم تحديث المصروف بنجاح", 'success');

        } catch (error) {
            handleError(error, "خطأ أثناء تحديث المصروف");
            await loadData(); // Reload data to revert local changes
        }
    }
}


// Delete Expense Record
async function deleteExpense(expense) {
     // expense object should contain branchId and branchName
    if (!expense || !expense.branchId) {
        Swal.fire('خطأ', 'بيانات المصروف غير صالحة للحذف.', 'error');
        return;
    }
    // Admin check for deleting salaries
    if (expense.expenseType === 'مرتبات' && (!currentUser || currentUser.role !== 'admin')) {
        Swal.fire('خطأ', 'فقط المسؤول يمكنه حذف مصروفات المرتبات.', 'error');
        return;
    }

    const isScrapPurchase = expense.expenseType === 'شراء فضة كسر';
    let confirmationText = `هل أنت متأكد من حذف مصروف (${expense.expenseType}) بقيمة ${expense.amount} لفرع ${expense.branchName}؟`;
    if (isScrapPurchase) {
        confirmationText += `<br><b>ملاحظة:</b> سيتم عكس تأثير هذا المصروف على كمية وتكلفة الصنف "${expense.scrapType}" في المخزون.`;
    }

    const confirmationResult = await Swal.fire({
        title: "تأكيد الحذف",
        html: confirmationText,
        icon: 'warning',
        confirmButtonText: "نعم، احذف",
        cancelButtonText: "إلغاء",
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });

    if (confirmationResult.isConfirmed) {
        const branchId = expense.branchId;

        // Find the index using a robust comparison
        const expenseIndex = branchData[branchId]?.expenses.findIndex(ex =>
            ex.date === expense.date && ex.user === expense.user && ex.expenseType === expense.expenseType && ex.amount === expense.amount
            // Add more fields if necessary for uniqueness (e.g., expenseUser, scrapType/Quantity)
            && (expense.expenseType !== 'مرتبات' || ex.expenseUser === expense.expenseUser)
            && (!isScrapPurchase || (ex.scrapType === expense.scrapType && ex.scrapQuantity === expense.scrapQuantity))
        );

        if (expenseIndex === -1) {
            console.error("Expense not found for deletion:", expense, "in branch:", branchId);
            Swal.fire('خطأ', 'لم يتم العثور على المصروف المحدد للحذف.', 'error');
            return;
        }

        const expenseToDelete = { ...branchData[branchId].expenses[expenseIndex] }; // Copy before splicing
        let productUpdateNeeded = false;

        // <<-- Reverse product changes if deleting a 'شراء فضة كسر' expense -->>
        if (isScrapPurchase && expenseToDelete.scrapType && typeof expenseToDelete.scrapQuantity === 'number' && !isNaN(expenseToDelete.scrapQuantity)) {
            if (!branchData[branchId].products) {
                 console.warn(`Products array not found for branch ${branchId} during expense deletion. Inventory not adjusted.`);
            } else {
                 const productIndex = branchData[branchId].products.findIndex(p => p.name === expenseToDelete.scrapType);
                 if (productIndex !== -1) {
                     const product = branchData[branchId].products[productIndex];
                     const quantityToRemove = expenseToDelete.scrapQuantity;
                     const costToRemove = expenseToDelete.amount; // The total cost recorded in the expense

                     // Reduce quantity by the amount that was added
                     product.quantity -= quantityToRemove;
                     // Reduce total purchase price by the amount that was recorded for this expense
                     product.purchasePrice = (product.purchasePrice || 0) - costToRemove;

                     // Ensure quantity and price don't go below zero
                     if (product.quantity < 0) {
                         console.warn(`Product quantity for ${expenseToDelete.scrapType} in ${expense.branchName} went below zero after deleting expense. Setting to 0.`);
                         product.quantity = 0;
                     }
                     if (product.purchasePrice < 0) {
                         console.warn(`Product purchase price for ${expenseToDelete.scrapType} in ${expense.branchName} went below zero after deleting expense. Setting to 0.`);
                         product.purchasePrice = 0;
                     }
                     productUpdateNeeded = true; // Mark product data for saving
                 } else {
                     console.warn(`Product '${expenseToDelete.scrapType}' not found in branch '${expense.branchName}' when trying to reverse expense deletion.`);
                     Swal.fire('تحذير', `لم يتم العثور على الصنف '${expenseToDelete.scrapType}' لتعديل المخزون أثناء حذف المصروف. قد يكون المخزون غير دقيق.`, 'warning');
                 }
            }
        }
        // --- End Product Adjustment ---

        // Now, remove the expense record itself
        branchData[branchId].expenses.splice(expenseIndex, 1);

        try {
             // Prepare data payload for saving
             const dataToSave = {
                 expenses: branchData[branchId].expenses
             };
             if (productUpdateNeeded) {
                 dataToSave.products = branchData[branchId].products;
             }
             // Save updated data for the branch
             await database.ref(`/branchData/${branchId}`).update(dataToSave);

             // Refresh UI
            document.dispatchEvent(new CustomEvent('expenseRecorded', { detail: { branchId: branchId } })); // Refresh expense table UI
            if(productUpdateNeeded) {
                 document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } })); // Refresh product tables if needed
            }
            Swal.fire('تم الحذف', 'تم حذف المصروف بنجاح', 'success');

        } catch (error) {
            handleError(error, "خطأ أثناء حذف المصروف");
            await loadData(); // Reload to revert local changes
        }
    }
}


// Called when navigating to the expenses page or refreshing data
function updateExpensesPage() {
    // Populate the branch filter dropdown
    updateBranchSelect('expenses-branch-filter');
    // Populate the branch select for recording expenses
    updateBranchSelect('expense-branch-select');
    // Update the form fields based on the selected expense type and branch
    updateExpenseForm();
    // Initially hide the expense table until a search is performed
    const expensesTableWrapper = document.getElementById('expenses-table-wrapper');
    const expensesListTbody = document.getElementById('expenses-list');
    if (expensesTableWrapper) {
        expensesTableWrapper.style.display = 'none';
    }
     if (expensesListTbody) {
        expensesListTbody.innerHTML = ''; // Clear any previous results
     }

      // Add listener for recording branch select change
      const expBranchSelect = document.getElementById('expense-branch-select');
      if (expBranchSelect) {
          expBranchSelect.removeEventListener('change', updateExpenseForm); // Prevent duplicates
          expBranchSelect.addEventListener('change', updateExpenseForm);
      }
       // Add listener for expense type change
      const expTypeSelect = document.getElementById('expense-type');
      if (expTypeSelect) {
          expTypeSelect.removeEventListener('change', updateExpenseForm); // Prevent duplicates
          expTypeSelect.addEventListener('change', updateExpenseForm);
      }
}