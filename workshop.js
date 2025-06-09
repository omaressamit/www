// workshop.js

let lastWorkshopClickTime = 0;

async function recordWorkshopOperation() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }

    const now = Date.now();
    if (now - lastWorkshopClickTime < 5000) {
        Swal.fire('تنبيه', 'يرجى الانتظار 5 ثوانٍ قبل تسجيل عملية ورشة أخرى.', 'warning');
        return;
    }

    const branchName = document.getElementById('workshop-branch-select').value;
    const description = document.getElementById('workshop-description').value.trim();
    const price = parseFloat(document.getElementById('workshop-price').value.trim());
    const customerPhone = document.getElementById('workshop-customer-phone').value.trim();
    const paymentMethod = document.getElementById('workshop-payment-method').value;
    const customerDetails = document.getElementById('workshop-customer-details').value.trim();

    // Get Branch ID
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!description || !paymentMethod || isNaN(price)) {
        Swal.fire('خطأ', 'يرجى إدخال وصف العملية، السعر، وطريقة الدفع.', 'error');
        return;
    }
    if (price <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال سعر صحيح (أكبر من صفر).', 'error');
        return;
    }

    // Authorization Check
    if (currentUser.role !== 'admin') {
        if (!branchMetadata[branchId] || !branchMetadata[branchId].users || !branchMetadata[branchId].users.includes(currentUser.username)) {
            Swal.fire('خطأ', `غير مصرح لك بتسجيل عمليات لفرع "${branchName}"`, 'error');
            return;
        }
    }

    // Ensure branch data and workshopOperations array exist
    if (!branchData[branchId]) {
        console.error(`Branch data missing for ID: ${branchId}`);
        Swal.fire('خطأ', 'بيانات الفرع غير موجودة.', 'error');
        return;
    }
    branchData[branchId].workshopOperations = branchData[branchId].workshopOperations || [];

    const newOperation = {
        date: new Date().toISOString(),
        description: description,
        price: price,
        customerPhone: customerPhone,
        paymentMethod: paymentMethod,
        customerDetails: customerDetails,
        user: currentUser.username,
        type: 'workshop'
        // branch: branchName // Optional redundancy
    };

    branchData[branchId].workshopOperations.push(newOperation);
    lastWorkshopClickTime = now;

    try {
        // Save the updated workshop operations list for the branch
        await database.ref(`/branchData/${branchId}/workshopOperations`).set(branchData[branchId].workshopOperations);

        // Reset form fields
        document.getElementById('workshop-description').value = '';
        document.getElementById('workshop-price').value = '';
        document.getElementById('workshop-customer-phone').value = '';
        document.getElementById('workshop-payment-method').value = 'نقدي';
        document.getElementById('workshop-customer-details').value = '';

        // Dispatch events
        document.dispatchEvent(new CustomEvent('workshopRecorded', { detail: { branchId: branchId } }));
        // Trigger saleRecorded to update daily sales display (workshop ops don't count toward employee targets but are shown in daily totals)
        document.dispatchEvent(new CustomEvent('saleRecorded', { detail: { branchId: branchId } }));


        Swal.fire({
            title: 'تم', text: 'تم تسجيل عملية الورشة بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });
    } catch (error) {
        handleError(error, "خطأ أثناء حفظ عملية الورشة");
        // Revert local changes
        await loadData();
    }
}


function showWorkshopOperations() {
    if (!currentUser) return;

    const selectedBranchName = document.getElementById('workshop-branch-filter').value;
    const dateFromStr = document.getElementById('workshop-date-from').value;
    const dateToStr = document.getElementById('workshop-date-to').value;
    const container = document.getElementById('workshop-tables-container');

    if (!container) {
         console.error("Workshop tables container not found.");
         return;
    }

    // Date From validation
    if (!dateFromStr) {
        Swal.fire('خطأ', 'يرجى تحديد تاريخ بداية الفترة للاستعلام.', 'error');
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = ''; // Clear previous tables

    const dateFrom = new Date(dateFromStr);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = dateToStr ? new Date(dateToStr) : null;
    if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
    }

    let overallTotalPrice = 0;
    let displayedData = []; // Array to hold data rows before rendering

    // Determine which branches to process
    const branchIdsToProcess = [];
    if (selectedBranchName) {
        const branchId = getBranchIdByName(selectedBranchName);
        if (branchId) {
            if (currentUser.role === 'admin' || (branchMetadata[branchId]?.users?.includes(currentUser.username))) {
                branchIdsToProcess.push(branchId);
            }
        }
    } else if (currentUser.role === 'admin') {
        branchIdsToProcess.push(...Object.keys(branchMetadata));
    } else {
        for (const id in branchMetadata) {
            if (branchMetadata[id].users && branchMetadata[id].users.includes(currentUser.username)) {
                branchIdsToProcess.push(id);
            }
        }
    }

    branchIdsToProcess.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));

    // Gather data from relevant branches
    branchIdsToProcess.forEach(branchId => {
        const branchOpsList = branchData[branchId]?.workshopOperations || [];
        const branchName = getBranchNameById(branchId) || `فرع (${branchId})`;

        const filteredBranchOps = branchOpsList.filter(op => {
            if (!op || !op.date) return false;
            let opDate;
            try { opDate = new Date(op.date); if(isNaN(opDate.getTime())) return false; } catch(e){ return false; }

            const dateMatch = opDate.getTime() >= dateFrom.getTime() &&
                              (!dateTo || opDate.getTime() <= dateTo.getTime());
            return dateMatch;
        });

        if (filteredBranchOps.length > 0) {
            filteredBranchOps.forEach(op => {
                displayedData.push({ ...op, branchId: branchId, branchName: branchName });
            });
        }
    });


    if (displayedData.length === 0) {
        container.innerHTML = '<p>لا توجد عمليات ورشة مسجلة تطابق البحث.</p>';
        return;
    }

    // Sort all collected data by date (newest first)
    displayedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentDisplayBranchName = null;
    let totalBranchPrice = 0;
    let table, tbody, tableWrapper; // Declare here for broader scope


    // Function to add branch total row
     const addWorkshopBranchTotalRow = (tbodyElem, name, amount) => {
        if (!tbodyElem) return;
        const totalRow = tbodyElem.insertRow();
        totalRow.innerHTML = `
            <td colspan="8" style="text-align: center; background-color: #8bc34a;">
                <strong>إجمالي سعر الورشة لفرع ${name}: ${amount.toFixed(2)} جنيه</strong>
            </td>
        `;
    };

    displayedData.forEach((operation, index) => {
        // Check if branch changed or if it's the first row
        if (operation.branchName !== currentDisplayBranchName) {
            // Add total row for the *previous* branch table body if it exists
            if (tbody && currentDisplayBranchName !== null) {
                addWorkshopBranchTotalRow(tbody, currentDisplayBranchName, totalBranchPrice);
                overallTotalPrice += totalBranchPrice; // Add previous branch total to overall
            }

            // Start new branch table
            currentDisplayBranchName = operation.branchName;
            totalBranchPrice = 0; // Reset branch total

            tableWrapper = document.createElement('div');
            tableWrapper.classList.add('table-wrapper');
            table = document.createElement('table');
            table.classList.add('workshop-table'); // Use specific class if needed
            const thead = table.createTHead();
            tbody = table.createTBody(); // Assign to the outer scope variable

            thead.innerHTML = `
                <tr><th colspan="8" style="text-align: center; background-color: #4CAF50; color: white;">${currentDisplayBranchName}</th></tr>
                <tr><th>التاريخ والوقت</th><th>الوصف</th><th>السعر</th><th>هاتف العميل</th><th>الدفع</th><th>بيانات العميل</th><th>المستخدم</th><th></th></tr>
            `;
            table.appendChild(thead);
            table.appendChild(tbody);
            tableWrapper.appendChild(table);
            container.appendChild(tableWrapper); // Add new table wrapper to container
        }

        // Add operation row to the current tbody
        const row = tbody.insertRow();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        const formattedDate = new Date(operation.date).toLocaleString('ar-EG', options);
        const price = parseFloat(operation.price || 0);

        row.insertCell(0).textContent = formattedDate;
        row.insertCell(1).textContent = operation.description;
        row.insertCell(2).textContent = price.toFixed(2);
        row.insertCell(3).textContent = operation.customerPhone || '';
        row.insertCell(4).textContent = operation.paymentMethod || '';
        row.insertCell(5).textContent = operation.customerDetails || '';
        row.insertCell(6).textContent = operation.user;

        // Actions Cell (Edit/Delete)
        const actionsCell = row.insertCell(7);
        actionsCell.style.whiteSpace = 'nowrap';

        // Add check: only user who created or admin can edit/delete? Or just admin? Assuming Admin only for now.
        if (currentUser.role === 'admin') {
            const editBtn = document.createElement('button');
            editBtn.textContent = "تعديل";
            editBtn.classList.add('edit-btn');
             editBtn.style.width = 'auto'; editBtn.style.marginLeft = '5px';
            editBtn.onclick = () => editWorkshopOperation(operation);
            actionsCell.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'حذف';
            deleteBtn.classList.add('delete-btn');
            deleteBtn.style.width = 'auto';
            deleteBtn.onclick = () => deleteWorkshopOperation(operation);
            actionsCell.appendChild(deleteBtn);
        } else {
             actionsCell.textContent = '-';
        }


        totalBranchPrice += price; // Accumulate for the current branch

         // Add total row for the *last* branch after the loop finishes
         if (index === displayedData.length - 1) {
             addWorkshopBranchTotalRow(tbody, currentDisplayBranchName, totalBranchPrice);
             overallTotalPrice += totalBranchPrice; // Add last branch total
         }
    });


    // Add Overall Total Row if data was displayed
    if (displayedData.length > 0 && table) { // Ensure table exists
        const overallTotalRow = table.createTFoot().insertRow(); // Use tfoot for overall total
        overallTotalRow.innerHTML = `
            <td colspan="8" style="text-align: center; background-color: #2196f3; color: white; font-weight: bold;">
                إجمالي سعر عمليات الورشة للفترة المحددة: ${overallTotalPrice.toFixed(2)} جنيه
            </td>
        `;
    }
}


function updateWorkshopPage() {
    updateBranchSelect('workshop-branch-select'); // For recording
    updateBranchSelect('workshop-branch-filter'); // For filtering
    // Hide the results container initially
    const container = document.getElementById('workshop-tables-container');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}


async function editWorkshopOperation(operation) {
     // operation should include branchId, branchName
    if (!operation || !operation.branchId) {
        Swal.fire('خطأ', 'بيانات العملية غير كاملة للتعديل.', 'error');
        return;
    }
     // Authorization check: Only admin? Or user who created it? Assuming admin for now.
     if (currentUser.role !== 'admin') {
         Swal.fire('خطأ', 'فقط المسؤول يمكنه تعديل عمليات الورشة.', 'error');
         return;
     }

    const { value: updatedData } = await Swal.fire({
        title: "تعديل عملية ورشة",
        html:
            `<label style="display:block; text-align:right;">الفرع</label><input class="swal2-input" value="${operation.branchName}" readonly>` +
            `<label style="display:block; text-align:right;">وصف العملية</label><textarea id="swal-edit-desc" class="swal2-textarea">${operation.description || ''}</textarea>` +
            `<label style="display:block; text-align:right;">السعر</label><input id="swal-edit-price" class="swal2-input" value="${operation.price || 0}" type="number" step="0.01">` +
            `<label style="display:block; text-align:right;">رقم هاتف العميل</label><input id="swal-edit-phone" class="swal2-input" value="${operation.customerPhone || ''}">` +
            `<label style="display:block; text-align:right;">وسيلة الدفع:</label><select id="swal-edit-payment" class="swal2-select">
                <option value="نقدي" ${operation.paymentMethod === 'نقدي' ? 'selected' : ''}>نقدي</option>
                <option value="فيزا" ${operation.paymentMethod === 'فيزا' ? 'selected' : ''}>فيزا</option>
                <option value="انستاباي" ${operation.paymentMethod === 'انستاباي' ? 'selected' : ''}>انستاباي</option>
            </select>` +
            `<label style="display:block; text-align:right;">بيانات العميل</label><textarea id="swal-edit-details" class="swal2-textarea">${operation.customerDetails || ''}</textarea>`,
        focusConfirm: false,
        preConfirm: () => {
            const price = parseFloat(document.getElementById('swal-edit-price').value);
            const description = document.getElementById('swal-edit-desc').value.trim();
            const customerPhone = document.getElementById('swal-edit-phone').value.trim();
            const paymentMethod = document.getElementById('swal-edit-payment').value;
            const customerDetails = document.getElementById('swal-edit-details').value.trim();

            if (isNaN(price) || price <= 0 || !description || !paymentMethod) {
                Swal.showValidationMessage("يرجى إدخال وصف، سعر موجب، وطريقة دفع صحيحة.");
                return false;
            }
            return { price, description, customerPhone, paymentMethod, customerDetails };
        }
    });

    if (updatedData) {
        const branchId = operation.branchId;
        const opIndex = branchData[branchId]?.workshopOperations.findIndex(op =>
            op.date === operation.date && op.user === operation.user && op.description === operation.description // Match on more fields if needed
        );

        if (opIndex === -1) {
            Swal.fire('خطأ', 'لم يتم العثور على العملية الأصلية للتحديث.', 'error');
            return;
        }

        // Update the operation record
        branchData[branchId].workshopOperations[opIndex] = {
            ...branchData[branchId].workshopOperations[opIndex], // Keep date, user, type etc.
            price: updatedData.price,
            description: updatedData.description,
            customerPhone: updatedData.customerPhone,
            paymentMethod: updatedData.paymentMethod,
            customerDetails: updatedData.customerDetails
        };

        try {
            // Save the updated list for the branch
            await database.ref(`/branchData/${branchId}/workshopOperations`).set(branchData[branchId].workshopOperations);

            // Refresh UI
             document.dispatchEvent(new CustomEvent('workshopRecorded', { detail: { branchId: branchId } }));
             // Trigger saleRecorded to update daily sales display (workshop ops don't count toward employee targets but are shown in daily totals)
             document.dispatchEvent(new CustomEvent('saleRecorded', { detail: { branchId: branchId } }));


            Swal.fire('تم', "تم تحديث العملية بنجاح", 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء تحديث عملية الورشة");
            await loadData(); // Reload data
        }
    }
}


async function deleteWorkshopOperation(operation) {
     // operation should include branchId, branchName
    if (!operation || !operation.branchId) {
        Swal.fire('خطأ', 'بيانات العملية غير كاملة للحذف.', 'error');
        return;
    }
     // Authorization check: Only admin?
     if (currentUser.role !== 'admin') {
         Swal.fire('خطأ', 'فقط المسؤول يمكنه حذف عمليات الورشة.', 'error');
         return;
     }

    const confirmResult = await Swal.fire({
        title: "تأكيد الحذف",
        text: `هل أنت متأكد من حذف عملية الورشة "${operation.description}" من فرع "${operation.branchName}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: "نعم، احذف",
        cancelButtonText: "إلغاء",
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });

    if (confirmResult.isConfirmed) {
        const branchId = operation.branchId;
        const opIndex = branchData[branchId]?.workshopOperations.findIndex(op =>
             op.date === operation.date && op.user === operation.user && op.description === operation.description // Match on more fields if needed
         );

        if (opIndex === -1) {
            Swal.fire('خطأ', 'لم يتم العثور على العملية الأصلية للحذف.', 'error');
            return;
        }

        // Remove the operation record
        branchData[branchId].workshopOperations.splice(opIndex, 1);

        try {
            // Save the updated list for the branch
            await database.ref(`/branchData/${branchId}/workshopOperations`).set(branchData[branchId].workshopOperations);

            // Refresh UI
            document.dispatchEvent(new CustomEvent('workshopRecorded', { detail: { branchId: branchId } }));
            document.dispatchEvent(new CustomEvent('saleRecorded', { detail: { branchId: branchId } })); // Update daily total


            Swal.fire('تم الحذف', 'تم حذف العملية بنجاح', 'success');
        } catch (error) {
            handleError(error, "خطأ أثناء حذف عملية الورشة");
            await loadData(); // Reload data
        }
    }
}