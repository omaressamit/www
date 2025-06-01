// users.js

async function addUser() {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لإضافة مستخدم', 'error');
        return;
    }

    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const role = document.getElementById('new-user-role').value;

    // إعداد بيانات المستخدم للتحقق والإنشاء
    const userData = {
        username: username,
        password: password,
        role: role
    };

    try {
        // التحقق من صحة البيانات محلياً
        if (!username || !password) {
            Swal.fire('خطأ', 'يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
            return;
        }

        if (password.length < 6) {
            Swal.fire('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }

        // التحقق من عدم تكرار اسم المستخدم
        if (users.some(u => u.username === username)) {
            Swal.fire('خطأ', 'اسم المستخدم موجود بالفعل', 'error');
            return;
        }

        // إنشاء المستخدم باستخدام النظام المحسن إذا كان متاحاً، وإلا استخدم الطريقة التقليدية
        if (dbManager && typeof dbManager.createUser === 'function') {
            const userId = await dbManager.createUser(userData);
        } else {
            // الطريقة التقليدية مع تشفير كلمة المرور
            const encryptedPassword = dbManager && typeof dbManager.encryptSensitiveData === 'function'
                ? dbManager.encryptSensitiveData(password)
                : btoa(password); // استخدام Base64 كبديل إذا لم يكن dbManager متاحاً

            const newUser = {
                username: username,
                password: encryptedPassword, // كلمة المرور مشفرة
                role: role,
                createdAt: new Date().toISOString(),
                isActive: true
            };

            users.push(newUser);
            await database.ref('/users').set(users);
        }

        // Clear form
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-user-role').value = 'user'; // Reset role dropdown

        // Dispatch event to refresh UI
        document.dispatchEvent(new CustomEvent('userAdded'));

        Swal.fire({
            title: 'تم',
            text: 'تم إضافة المستخدم بنجاح',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('خطأ في إضافة المستخدم:', error);
        Swal.fire('خطأ', error.message || 'حدث خطأ أثناء إضافة المستخدم', 'error');
    }
}

// Updates the list of users displayed in the table
async function updateUsersList() {
    if (!currentUser || currentUser.role !== 'admin') {
        // Non-admins should not see this page, but double-check
        console.warn("Attempt to update user list by non-admin.");
         // Optionally hide the container or redirect
         const userManagementDiv = document.getElementById('user-management');
         if(userManagementDiv) userManagementDiv.style.display = 'none';
        return;
    }

    const usersListTbody = document.querySelector('#users-list tbody');
    if (!usersListTbody) return;
    usersListTbody.innerHTML = '';

    if (users.length === 0) {
        usersListTbody.innerHTML = '<tr><td colspan="4">لا يوجد مستخدمين معرفين.</td></tr>';
        return;
    }

     // Clone and sort users alphabetically (excluding current admin for actions)
     const sortedUsers = [...users].sort((a, b) => a.username.localeCompare(b.username, 'ar'));

    sortedUsers.forEach(user => {
        const row = usersListTbody.insertRow();
        row.insertCell(0).textContent = user.username;
        row.insertCell(1).textContent = user.role === 'admin' ? 'مسؤول' : 'مستخدم';

        // Calculate total sales (target) for this user across ALL branches
        // Note: Workshop operations are excluded from employee targets
        let totalSalesValue = 0;
        for (const branchId in branchData) {
            const salesList = branchData[branchId]?.sales || [];
            salesList.forEach(sale => {
                if (sale.user === user.username) {
                    totalSalesValue += parseFloat(sale.price || 0);
                }
            });
             // Workshop operations are excluded from employee targets
             // const workshopList = branchData[branchId]?.workshopOperations || [];
             // workshopList.forEach(op => {
             //     if (op.user === user.username) {
             //         totalSalesValue += parseFloat(op.price || 0);
             //     }
             // });
        }
        row.insertCell(2).textContent = totalSalesValue.toFixed(2); // Display target/total sales


        // Actions Cell (Delete, Reset Target)
        const actionsCell = row.insertCell(3);
        actionsCell.style.whiteSpace = 'nowrap';

        // Cannot delete or reset target for the currently logged-in admin
        if (user.username !== currentUser.username || user.role !== 'admin') {
            // Delete button (cannot delete self)
            if (user.username !== currentUser.username) {
                 const deleteButton = document.createElement('button');
                 deleteButton.textContent = 'حذف';
                 deleteButton.onclick = () => deleteUser(user.username);
                 deleteButton.className = 'delete-btn';
                 deleteButton.style.width = 'auto'; deleteButton.style.marginLeft = '5px';
                 actionsCell.appendChild(deleteButton);
            } else if (user.role !== 'admin') {
                 // Non-admin cannot delete self, show placeholder
                 actionsCell.textContent = '(لا يمكن حذف النفس)';
            }

             // Reset Target button (only for admins, not applicable to self)
             if (currentUser.role === 'admin' && user.username !== currentUser.username) {
                 const resetTargetButton = document.createElement('button');
                 resetTargetButton.textContent = 'تصفير التارجت';
                 resetTargetButton.onclick = () => resetUserTarget(user.username);
                 resetTargetButton.className = 'reset-target-btn'; // Defined in style.css
                 resetTargetButton.style.width = 'auto'; resetTargetButton.style.marginLeft = '5px';
                 actionsCell.appendChild(resetTargetButton);
             }

        } else {
            actionsCell.textContent = '(المستخدم الحالي)'; // Indicate the current admin user
        }
    });

    // Ensure table header is correct
    const tableHeaderRow = usersListTbody.closest('table')?.querySelector('thead tr');
    if (tableHeaderRow) {
        tableHeaderRow.innerHTML = `
            <th>اسم المستخدم</th>
            <th>نوع المستخدم</th>
            <th>إجمالي المبيعات</th>
            <th>الإجراءات</th>
        `;
    }
}

// Deletes a user (Admin only)
async function deleteUser(usernameToDelete) {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لحذف المستخدمين', 'error');
        return;
    }
    if (usernameToDelete === currentUser.username) {
        Swal.fire('خطأ', 'لا يمكنك حذف حسابك الحالي', 'error');
        return;
    }
     // Prevent deleting the last admin if only one admin exists
     const adminUsers = users.filter(u => u.role === 'admin');
     if (adminUsers.length <= 1 && users.find(u => u.username === usernameToDelete)?.role === 'admin') {
         Swal.fire('خطأ', 'لا يمكن حذف المسؤول الوحيد في النظام.', 'error');
         return;
     }


    const result = await Swal.fire({
        title: `تأكيد حذف المستخدم "${usernameToDelete}"`,
        text: 'سيتم حذف المستخدم نهائياً. هل أنت متأكد؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });

    if (result.isConfirmed) {
        const userIndex = users.findIndex(u => u.username === usernameToDelete);
        if (userIndex !== -1) {
            const userToRemove = users[userIndex];

            // --- Remove user from Branch Metadata ---
             let metadataUpdated = false;
             for (const branchId in branchMetadata) {
                 const userIndexInBranch = branchMetadata[branchId].users?.indexOf(usernameToDelete);
                 if (userIndexInBranch > -1) {
                     branchMetadata[branchId].users.splice(userIndexInBranch, 1);
                     metadataUpdated = true;
                     console.log(`User ${usernameToDelete} removed from branch ${branchMetadata[branchId].name}`);
                 }
             }
             // --- End Branch Metadata Update ---

            // Remove user from global list
            users.splice(userIndex, 1);

            try {
                // Save the updated users list and potentially updated branch metadata
                 const updates = { '/users': users };
                 if (metadataUpdated) {
                     updates['/branchMetadata'] = branchMetadata;
                 }
                 await database.ref().update(updates);

                // Dispatch event to refresh UI
                document.dispatchEvent(new CustomEvent('userDeleted'));

                Swal.fire({
                    title: 'تم الحذف', text: `تم حذف المستخدم "${usernameToDelete}" بنجاح.`, icon: 'success',
                    timer: 1500, showConfirmButton: false
                });
            } catch (error) {
                handleError(error, "خطأ أثناء حذف المستخدم");
                // Revert local changes
                users.splice(userIndex, 0, userToRemove); // Add back user
                 // Reverting branch metadata changes is complex, reload is safer
                 await loadData();
            }
        } else {
             Swal.fire('خطأ', 'لم يتم العثور على المستخدم المحدد للحذف.', 'error');
        }
    }
}

// Resets the target (deletes sales/workshop history) for a specific user (Admin only)
async function resetUserTarget(usernameToReset) {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لتصفير التارجت', 'error');
        return;
    }
     if (usernameToReset === currentUser.username) {
        Swal.fire('خطأ', 'لا يمكن تصفير التارجت للمستخدم الحالي (المسؤول).', 'error');
        return;
    }

    const confirmResult = await Swal.fire({
        title: `تأكيد تصفير التارجت`,
        text: `سيتم حذف جميع سجلات المبيعات وعمليات الورشة للمستخدم "${usernameToReset}". ملاحظة: عمليات الورشة لا تدخل في حساب التارجت ولكن سيتم حذفها أيضاً. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، صفر التارجت',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33',
    });

    if (confirmResult.isConfirmed) {
         Swal.fire({ title: 'جاري تصفير التارجت...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

         const updates = {};
         let changesMade = false;
         // Iterate through all branches and filter out records for the target user
         for (const branchId in branchData) {
             let branchSales = branchData[branchId]?.sales || [];
             let branchWorkshop = branchData[branchId]?.workshopOperations || [];

             const originalSalesCount = branchSales.length;
             const originalWorkshopCount = branchWorkshop.length;

             const filteredSales = branchSales.filter(sale => sale.user !== usernameToReset);
             const filteredWorkshop = branchWorkshop.filter(op => op.user !== usernameToReset);

             if (filteredSales.length < originalSalesCount) {
                 updates[`/branchData/${branchId}/sales`] = filteredSales;
                 branchData[branchId].sales = filteredSales; // Update local data
                 changesMade = true;
             }
             if (filteredWorkshop.length < originalWorkshopCount) {
                 updates[`/branchData/${branchId}/workshopOperations`] = filteredWorkshop;
                 branchData[branchId].workshopOperations = filteredWorkshop; // Update local data
                 changesMade = true;
             }
         }


         if (!changesMade) {
             Swal.close();
             Swal.fire('لا تغيير', `لا توجد سجلات مبيعات أو ورشة للمستخدم "${usernameToReset}" ليتم حذفها.`, 'info');
             return;
         }

        try {
             await database.ref().update(updates); // Apply the updates to Firebase

             // Dispatch event to refresh user list (which recalculates targets)
             document.dispatchEvent(new CustomEvent('targetResetted'));

             Swal.fire({
                 title: 'تم', text: `تم تصفير التارجت (حذف سجلات المبيعات والورشة) للمستخدم "${usernameToReset}" بنجاح. ملاحظة: عمليات الورشة لا تدخل في حساب التارجت.`, icon: 'success'
             });
         } catch (error) {
             handleError(error, `خطأ أثناء تصفير تارجت المستخدم ${usernameToReset}`);
             // Reload data to ensure consistency after failed multi-location update
             await loadData();
         }
    }
}
