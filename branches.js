// branches.js

// Updates branch dropdown select elements
function updateBranchSelect(selectId = 'branch-select') {
    const branchSelect = document.getElementById(selectId);
    if (!branchSelect) {
        console.error(`Select element with ID '${selectId}' not found.`);
        return;
    }
    const currentSelectedValue = branchSelect.value; // Preserve selection if possible
    branchSelect.innerHTML = '<option value="">اختر الفرع</option>';

    const availableBranches = [];
    for (const id in branchMetadata) {
        const branch = branchMetadata[id];
        // Admin sees all branches
        if (currentUser.role === 'admin') {
            availableBranches.push({ id: id, name: branch.name });
        }
        // Regular users see only assigned branches
        else if (branch.users && branch.users.includes(currentUser.username)) {
             availableBranches.push({ id: id, name: branch.name });
        }
    }

    // Sort branches alphabetically by name for consistency
    availableBranches.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    availableBranches.forEach(branchInfo => {
        const option = document.createElement('option');
        option.value = branchInfo.name; // Use name as value for simplicity in UI binding
        // Store the ID as a data attribute if needed elsewhere, though lookup by name is planned
        // option.dataset.branchId = branchInfo.id;
        option.textContent = branchInfo.name;
        branchSelect.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (availableBranches.some(b => b.name === currentSelectedValue)) {
        branchSelect.value = currentSelectedValue;
    }

     // Trigger change event manually if needed for dependent dropdowns,
     // but populateProductSelect etc. should be called explicitly in showPage or other triggers.
     // Example: branchSelect.dispatchEvent(new Event('change'));
}

// Populates the checkbox list of users for assigning to a NEW branch
function updateBranchUsersList() {
    if (!currentUser || currentUser.role !== 'admin') {
        return;
    }
    const usersListDiv = document.getElementById('branch-users-list');
    if (!usersListDiv) return;
    usersListDiv.innerHTML = '';

    // Filter out the admin user(s)
    const nonAdminUsers = users.filter(user => user.role !== 'admin');

    if (nonAdminUsers.length === 0) {
        usersListDiv.innerHTML = '<p>لا يوجد مستخدمين (غير المسؤول) لإضافتهم.</p>';
        return;
    }

    nonAdminUsers.forEach(user => {
        const div = document.createElement('div');
        // Check if this user is already assigned to *any* branch
        let isAssigned = false;
        for (const branchId in branchMetadata) {
            if (branchMetadata[branchId].users && branchMetadata[branchId].users.includes(user.username)) {
                isAssigned = true;
                break;
            }
        }

        div.innerHTML = `
          <input type="checkbox" id="user-${user.username}" value="${user.username}" ${isAssigned ? 'disabled' : ''}>
         <label for="user-${user.username}">${user.username} ${isAssigned ? '(معين لفرع آخر)' : ''}</label>
       `;
        usersListDiv.appendChild(div);
    });
}

// Adds a new branch
async function addBranch() {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لإضافة فرع', 'error');
        return;
    }

    const branchNameInput = document.getElementById('new-branch-name');
    const branchName = branchNameInput.value.trim();
    if (!branchName) {
        Swal.fire('خطأ', 'يرجى إدخال اسم الفرع', 'error');
        return;
    }

    const selectedUsers = [];
    document.querySelectorAll('#branch-users-list input[type="checkbox"]:checked:not(:disabled)').forEach(checkbox => {
        selectedUsers.push(checkbox.value);
    });

    // إعداد بيانات الفرع للتحقق والإنشاء
    const branchDataToCreate = {
        name: branchName,
        users: selectedUsers
    };

    try {
        // التحقق من صحة البيانات محلياً
        if (selectedUsers.length === 0) {
            Swal.fire('خطأ', 'يجب اختيار مستخدم واحد على الأقل لهذا الفرع.', 'error');
            return;
        }

        // التحقق من عدم تكرار اسم الفرع
        const existingBranch = Object.values(branchMetadata).find(branch => branch.name === branchName);
        if (existingBranch) {
            Swal.fire('خطأ', 'اسم الفرع موجود بالفعل', 'error');
            return;
        }

        // إنشاء الفرع باستخدام النظام المحسن إذا كان متاحاً، وإلا استخدم الطريقة التقليدية
        if (dbManager && typeof dbManager.createBranch === 'function') {
            const branchId = await dbManager.createBranch(branchDataToCreate);
        } else {
            // الطريقة التقليدية
            const newBranchId = database.ref('branchMetadata').push().key;

            branchMetadata[newBranchId] = {
                name: branchName,
                users: selectedUsers,
                createdAt: new Date().toISOString(),
                isActive: true
            };

            branchData[newBranchId] = {
                products: [],
                sales: [],
                returns: [],
                receiving: [],
                expenses: [],
                workshopOperations: [],
                lastUpdated: new Date().toISOString()
            };

            await database.ref().update({
                [`/branchMetadata/${newBranchId}`]: branchMetadata[newBranchId],
                [`/branchData/${newBranchId}`]: branchData[newBranchId]
            });
        }

        // Clear the form
        branchNameInput.value = '';
        document.querySelectorAll('#branch-users-list input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Dispatch event to refresh UI
        document.dispatchEvent(new CustomEvent('branchAdded'));

        Swal.fire({
            title: 'تم',
            text: 'تم إضافة الفرع بنجاح',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('خطأ في إضافة الفرع:', error);
        Swal.fire('خطأ', error.message || 'حدث خطأ أثناء إضافة الفرع', 'error');
    }
}

// Displays existing branches and options to manage their users
function updateExistingBranches() {
    if (!currentUser || currentUser.role !== 'admin') {
        return;
    }
    const existingBranchesDiv = document.getElementById('existing-branches');
    if (!existingBranchesDiv) return;
    existingBranchesDiv.innerHTML = '';

    const branchIds = Object.keys(branchMetadata);

    if (branchIds.length === 0) {
        existingBranchesDiv.innerHTML = '<p>لا توجد فروع حالياً</p>';
        return;
    }

     // Get all non-admin users
     const nonAdminUsers = users.filter(user => user.role !== 'admin');

     // Create a map of username -> assigned branch ID (if any) for quick lookup
     const userAssignments = {};
     for (const branchId in branchMetadata) {
         if (branchMetadata[branchId].users) {
             branchMetadata[branchId].users.forEach(username => {
                 userAssignments[username] = branchId;
             });
         }
     }

    // Sort branches by name
    branchIds.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));

    branchIds.forEach(branchId => {
        const branch = branchMetadata[branchId];
        const branchDiv = document.createElement('div');
        branchDiv.className = 'branch-item';
        branchDiv.dataset.branchId = branchId; // Store ID for the update function

        let usersListHTML = '<h5>المستخدمون المعينون:</h5><ul class="assigned-users-list">';
        if (branch.users && branch.users.length > 0) {
            branch.users.forEach(username => {
                usersListHTML += `<li>${username}</li>`;
            });
        } else {
            usersListHTML += '<li>لا يوجد مستخدمون معينون حالياً</li>';
        }
         usersListHTML += '</ul>';

        usersListHTML += '<h5>تعديل التعيين:</h5><div class="checkbox-list">'; // Start checkbox list

        nonAdminUsers.forEach(user => {
            const isChecked = branch.users && branch.users.includes(user.username);
            const assignedToOtherBranchId = userAssignments[user.username];
            // Disable if assigned to *another* branch
            const isDisabled = assignedToOtherBranchId && assignedToOtherBranchId !== branchId;
            const disabledText = isDisabled ? `(معين لفرع ${branchMetadata[assignedToOtherBranchId]?.name || 'آخر'})` : '';

            usersListHTML += `
                <div>
                    <input type="checkbox"
                           id="user-${branchId}-${user.username}"
                           value="${user.username}"
                           ${isChecked ? 'checked' : ''}
                           ${isDisabled ? 'disabled' : ''}>
                    <label for="user-${branchId}-${user.username}">${user.username} ${disabledText}</label>
                </div>`;
        });
        usersListHTML += '</div>'; // End checkbox list

        // Add Delete Branch Button
        const deleteButtonHTML = `<button class="delete-btn branch-delete-btn" onclick="deleteBranch('${branchId}', '${branch.name}')" style="margin-top: 10px; width:auto; padding: 5px 10px;">حذف هذا الفرع</button>`;


        branchDiv.innerHTML = `
            <h4>${branch.name}</h4>
            ${usersListHTML}
            <button onclick="updateBranchUsers('${branchId}')" style="margin-top: 10px;">تحديث المستخدمين</button>
            ${deleteButtonHTML}
            <hr class="separator" style="margin-top: 15px;">
        `;
        existingBranchesDiv.appendChild(branchDiv);
    });
}

// Updates the assigned users for a specific branch
async function updateBranchUsers(branchId) {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لتحديث المستخدمين', 'error');
        return;
    }

    const branch = branchMetadata[branchId];
    if (!branch) {
        console.error("Branch not found for update:", branchId);
        Swal.fire('خطأ', 'الفرع المحدد غير موجود.', 'error');
        return;
    }

    const branchDiv = document.querySelector(`.branch-item[data-branch-id="${branchId}"]`);
    if (!branchDiv) {
         console.error("Branch UI element not found for update:", branchId);
         // Attempt update anyway, but UI might not reflect checkbox state correctly
    }

    const newlySelectedUsers = [];
    // Select only checkboxes within the specific branch's div
    branchDiv.querySelectorAll(`input[type="checkbox"][id^="user-${branchId}-"]:checked:not(:disabled)`).forEach(checkbox => {
         newlySelectedUsers.push(checkbox.value);
    });

    // Ensure at least one user remains assigned
    if (newlySelectedUsers.length === 0) {
        Swal.fire('خطأ', 'لا يمكن إزالة جميع المستخدمين من الفرع. يجب أن يكون هناك مستخدم واحد على الأقل.', 'error');
        return;
    }

    // Store the original users before modification
    const originalUsers = [...(branch.users || [])];
    branch.users = newlySelectedUsers; // Update local metadata immediately for UI refresh

    try {
        // Save only the changed branch metadata
        await database.ref(`/branchMetadata/${branchId}`).set(branch);

        // Dispatch event to potentially refresh related UI parts
        document.dispatchEvent(new CustomEvent('branchUsersUpdated', { detail: { branchId: branchId } }));
         // Refresh the branches display itself
         updateExistingBranches(); // Re-render the list to reflect changes and disable states

        Swal.fire({
            title: 'تم', text: 'تم تحديث مستخدمي الفرع بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });

    } catch (error) {
        handleError(error, "خطأ أثناء تحديث مستخدمي الفرع");
        // Revert local change if save failed
        branch.users = originalUsers;
        // Optionally, re-render the branch list to show the reverted state
        updateExistingBranches();
    }
}


// Function to delete a branch
async function deleteBranch(branchId, branchName) {
     if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لحذف الفروع.', 'error');
        return;
    }

     if (!branchMetadata[branchId]) {
        Swal.fire('خطأ', 'الفرع المحدد للحذف غير موجود.', 'error');
        return;
     }

     // Confirmation dialog
     const result = await Swal.fire({
        title: `تأكيد حذف فرع "${branchName}"`,
        html: `<p style="color: red; font-weight: bold;">تحذير: سيؤدي هذا إلى حذف الفرع (${branchName}) و <span style="text-decoration: underline;">جميع بياناته المرتبطة نهائياً</span> (الأصناف، المبيعات، المصروفات، إلخ).</p>
               <p>هذا الإجراء <span style="text-decoration: underline; font-weight: bold;">لا يمكن التراجع عنه</span>.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف الفرع وبياناته',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
    });

     if (result.isConfirmed) {
         // Show loading indicator
         Swal.fire({
            title: 'جاري الحذف...',
            text: `يتم حذف فرع ${branchName} وجميع بياناته.`,
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
         });

         try {
             // Prepare updates to remove data atomically (or as close as possible)
             const updates = {};
             updates[`/branchMetadata/${branchId}`] = null; // Remove metadata
             updates[`/branchData/${branchId}`] = null;     // Remove all associated data

             await database.ref().update(updates);

             // Remove from local state
             delete branchMetadata[branchId];
             delete branchData[branchId];

             // Dispatch event to refresh UI
             document.dispatchEvent(new CustomEvent('branchDeleted', { detail: { branchId: branchId } }));
             document.dispatchEvent(new CustomEvent('branchAdded')); // Reuse branchAdded to trigger full refresh of lists

             Swal.fire({
                 title: 'تم الحذف',
                 text: `تم حذف فرع "${branchName}" وجميع بياناته بنجاح.`,
                 icon: 'success',
             });

         } catch (error) {
             handleError(error, `خطأ أثناء حذف فرع ${branchName}`);
             // Data might be partially deleted, manual cleanup might be needed in Firebase
         }
     }
}
