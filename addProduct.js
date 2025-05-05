// addProduct.js

let lastProductClickTime = 0; // Initialize timestamp for adding products

async function addProduct() {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لإضافة منتج', 'error');
        return;
    }

    // Double-click prevention (5 seconds)
    const now = Date.now();
    if (now - lastProductClickTime < 5000) {
        Swal.fire('تنبيه', 'يرجى الانتظار 5 ثوانٍ قبل إضافة صنف آخر.', 'warning');
        return;
    }

    const branchName = document.getElementById('add-product-branch-select').value;
    const productName = document.getElementById('new-product-name').value.trim();
    // *** IMPORTANT: Get the Branch ID from the selected Name ***
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!productName) {
        Swal.fire('خطأ', 'يرجى إدخال اسم الصنف.', 'error');
        return;
    }

    // Check if branchData exists for this branch (it should if branch selection is populated)
    if (!branchData[branchId]) {
         console.error(`Branch data not found for ID: ${branchId} (Name: ${branchName})`);
         Swal.fire('خطأ', 'بيانات الفرع غير موجودة. لا يمكن إضافة الصنف.', 'error');
         return;
    }
    // Ensure the products array exists within the specific branch's data
    branchData[branchId].products = branchData[branchId].products || [];


    const { value: productDetails } = await Swal.fire({
        title: `إضافة صنف جديد إلى فرع "${branchName}"`,
        html:
            `<input id="swal-input1" class="swal2-input" placeholder="الكمية الأولية (بالجرام)" type="number" step="0.01">` +
            `<input id="swal-input2" class="swal2-input" placeholder="إجمالي سعر الشراء للكمية المدخلة" type="number" step="0.01">`, // Changed placeholder
        focusConfirm: false,
        preConfirm: () => {
            const quantity = parseFloat(document.getElementById('swal-input1').value);
            // IMPORTANT: Input 2 is now TOTAL purchase price for the initial quantity
            const totalPurchasePrice = parseFloat(document.getElementById('swal-input2').value);

            if (isNaN(quantity) || quantity <= 0 || isNaN(totalPurchasePrice) || totalPurchasePrice < 0) { // Allow 0 price?
                Swal.showValidationMessage('يرجى إدخال قيم صحيحة وموجبة للكمية وسعر الشراء الإجمالي (يمكن أن يكون السعر صفراً).');
                return false; // prevent confirmation
            }
            return { quantity, totalPurchasePrice };
        }
    });

    if (productDetails) {
        lastProductClickTime = now; // Update timestamp only on successful confirmation
        const { quantity, totalPurchasePrice } = productDetails;

        // Find existing product within the specific branch's products array
        const existingProductIndex = branchData[branchId].products.findIndex(p => p.name === productName);

        if (existingProductIndex !== -1) {
            // Product exists, add quantity and total purchase price
            const existingProduct = branchData[branchId].products[existingProductIndex];
            existingProduct.quantity += quantity;
            // Add the total cost of the new batch to the existing total cost
            existingProduct.purchasePrice = (existingProduct.purchasePrice || 0) + totalPurchasePrice;

        } else {
            // Add new product to the specific branch's products array
            branchData[branchId].products.push({
                name: productName,
                quantity: quantity,
                purchasePrice: totalPurchasePrice // Initial total purchase price
            });
        }

        try {
            // Save only the products array for the specific branch for efficiency
            await database.ref(`/branchData/${branchId}/products`).set(branchData[branchId].products);

            // Clear input and update UI
            document.getElementById('new-product-name').value = '';
            // Dispatch event to refresh product tables (which now needs branch context)
            document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } }));

            Swal.fire({
                title: 'تم', text: `تم إضافة/تحديث الصنف "${productName}" في فرع "${branchName}" بنجاح`,
                icon: 'success', timer: 1500, showConfirmButton: false
            });
        } catch (error) {
            handleError(error, "خطأ أثناء حفظ الصنف");
            // Consider reverting local changes if save failed
             // This is complex, might require reloading data or more sophisticated state management
        }
    }
}

// Updates the display of product tables for ALL branches (Admin view)
// Or only the user's assigned branch (User view)
function updateProductsTable() {
    const container = document.getElementById('products-tables-container');
    if (!container) return;
    container.innerHTML = ''; // Clear previous tables

    const branchIdsToDisplay = [];
    if (currentUser.role === 'admin') {
        // Admin sees all branches
        branchIdsToDisplay.push(...Object.keys(branchMetadata));
    } else {
        // User sees only assigned branches
        for (const id in branchMetadata) {
            if (branchMetadata[id].users && branchMetadata[id].users.includes(currentUser.username)) {
                branchIdsToDisplay.push(id);
            }
        }
    }

    if (branchIdsToDisplay.length === 0) {
        container.innerHTML = '<p>لا توجد فروع لعرض الأصناف أو لم يتم تعيينك لأي فرع.</p>';
        return;
    }

     // Sort branch IDs by name for consistent order
     branchIdsToDisplay.sort((idA, idB) => branchMetadata[idA].name.localeCompare(branchMetadata[idB].name, 'ar'));


    branchIdsToDisplay.forEach(branchId => {
        const branchMeta = branchMetadata[branchId];
        const products = branchData[branchId]?.products || []; // Get products for this branch, default to empty array

        const tableWrapper = document.createElement('div');
        tableWrapper.classList.add('table-wrapper');
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        thead.innerHTML = `
              <tr>
                  <th colspan="4" style="text-align: center; background-color: #4CAF50; color: white;">${branchMeta.name}</th>
              </tr>
              <tr>
                  <th>اسم الصنف</th>
                  <th>الكمية (جرام)</th>
                  <th>إجمالي سعر الشراء</th>
                  ${currentUser.role === 'admin' ? '<th></th>' : ''} <!-- Actions column only for admin -->
              </tr>
          `;
        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        container.appendChild(tableWrapper);


        if (products.length === 0) {
            const row = tbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = currentUser.role === 'admin' ? 4 : 3; // Adjust colspan
            cell.textContent = 'لا توجد أصناف في هذا الفرع.';
            cell.style.textAlign = 'center';
            return; // Skip to the next branch
        }


        // Sort products alphabetically by name
        products.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        products.forEach((product, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                  <td>${product.name}</td>
                  <td>${product.quantity?.toFixed(2) || '0.00'}</td>
                  <td>${product.purchasePrice?.toFixed(2) || '0.00'}</td>
              `;

            // Add actions cell only for admin
            if (currentUser.role === 'admin') {
                const actionsCell = row.insertCell(); // Add cell for actions
                actionsCell.style.whiteSpace = 'nowrap'; // Prevent buttons wrapping

                const editButton = document.createElement('button');
                editButton.textContent = 'تعديل';
                editButton.className = 'edit-btn';
                editButton.style.width = 'auto'; // Override general button width
                editButton.style.marginLeft = '5px';
                editButton.onclick = () => editProduct(branchId, index); // Pass branch ID and index
                actionsCell.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'حذف';
                deleteButton.className = 'delete-btn';
                deleteButton.style.width = 'auto'; // Override general button width
                deleteButton.onclick = () => deleteProduct(branchId, index); // Pass branch ID and index
                actionsCell.appendChild(deleteButton);
             }
        });
    });
}

// Edit Product (Admin only)
async function editProduct(branchId, productIndex) {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لتعديل المنتجات', 'error');
        return;
    }

    if (!branchData[branchId] || !branchData[branchId].products || productIndex < 0 || productIndex >= branchData[branchId].products.length) {
        Swal.fire('خطأ', 'الفرع أو الصنف المحدد غير صالح للتعديل', 'error');
        return;
    }

    const product = branchData[branchId].products[productIndex];
    const branchName = getBranchNameById(branchId) || `فرع غير معروف (${branchId})`;

    const { value: updatedDetails } = await Swal.fire({
        title: `تعديل الصنف "${product.name}"`,
        html:
            `<p><strong>الفرع:</strong> ${branchName}</p>`+ // Show branch name
            `<label for="swal-input-name" style="display: block; text-align: right; margin-top: 10px;">اسم الصنف:</label>`+
            `<input id="swal-input-name" class="swal2-input" value="${product.name}">` + // Allow editing name
            `<label for="swal-input-qty" style="display: block; text-align: right; margin-top: 10px;">الكمية الحالية (بالجرام):</label>` +
            `<input id="swal-input-qty" class="swal2-input" placeholder="الكمية (بالجرام)" type="number" step="0.01" value="${product.quantity}">` +
            `<label for="swal-input-price" style="display: block; text-align: right; margin-top: 10px;">إجمالي سعر الشراء الحالي:</label>` +
            `<input id="swal-input-price" class="swal2-input" placeholder="إجمالي سعر الشراء" type="number" step="0.01" value="${product.purchasePrice}">`,
        focusConfirm: false,
        preConfirm: () => {
            const name = document.getElementById('swal-input-name').value.trim();
            const quantity = parseFloat(document.getElementById('swal-input-qty').value);
            const purchasePrice = parseFloat(document.getElementById('swal-input-price').value);

             if (!name) {
                Swal.showValidationMessage('يرجى إدخال اسم الصنف.');
                return false;
            }
            // Check if name changed and if it conflicts with another product *in the same branch*
            if (name !== product.name && branchData[branchId].products.some((p, idx) => p.name === name && idx !== productIndex)) {
                 Swal.showValidationMessage(`اسم الصنف "${name}" موجود بالفعل في هذا الفرع.`);
                 return false;
            }

            // Validate numbers (allow zero quantity and price?)
            if (isNaN(quantity) || quantity < 0 || isNaN(purchasePrice) || purchasePrice < 0) {
                Swal.showValidationMessage('يرجى إدخال قيم رقمية صحيحة (غير سالبة) للكمية والسعر');
                return false;
            }
            return { name, quantity, purchasePrice };
        }
    });

    if (updatedDetails) {
        const { name, quantity, purchasePrice } = updatedDetails;

        // Update the product in the specific branch's array
        branchData[branchId].products[productIndex] = {
            name: name, // Use potentially updated name
            quantity: quantity,
            purchasePrice: purchasePrice
        };

        try {
             // Save the updated products array for the branch
             await database.ref(`/branchData/${branchId}/products`).set(branchData[branchId].products);

             // Dispatch event to refresh UI
             document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } })); // Re-use event

            Swal.fire({
                title: 'تم', text: 'تم تحديث الصنف بنجاح', icon: 'success',
                timer: 1500, showConfirmButton: false
            });
        } catch (error) {
            handleError(error, "خطأ أثناء تحديث الصنف");
            // Revert local changes? Difficult without full state reload.
             // Maybe reload data after error: await loadData();
        }
    }
}

// Delete Product (Admin only)
async function deleteProduct(branchId, productIndex) {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'يجب تسجيل الدخول كمسؤول لحذف المنتجات', 'error');
        return;
    }

    if (!branchData[branchId] || !branchData[branchId].products || productIndex < 0 || productIndex >= branchData[branchId].products.length) {
        Swal.fire('خطأ', 'الفرع أو الصنف المحدد غير صالح للحذف', 'error');
        return;
    }

    const product = branchData[branchId].products[productIndex];
    const branchName = getBranchNameById(branchId) || `فرع غير معروف (${branchId})`;

    const result = await Swal.fire({
        title: 'تأكيد الحذف',
        text: `هل أنت متأكد من حذف الصنف "${product.name}" من فرع "${branchName}"؟ سيتم حذف الصنف نهائياً.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });

    if (result.isConfirmed) {
        // Remove the product from the specific branch's array
        branchData[branchId].products.splice(productIndex, 1);

        try {
             // Save the updated products array for the branch
             await database.ref(`/branchData/${branchId}/products`).set(branchData[branchId].products);

            // Dispatch event to refresh UI
            document.dispatchEvent(new CustomEvent('productAdded', { detail: { branchId: branchId } })); // Re-use event

            Swal.fire({
                title: 'تم الحذف', text: 'تم حذف الصنف بنجاح', icon: 'success',
                timer: 1500, showConfirmButton: false
            });
        } catch (error) {
            handleError(error, "خطأ أثناء حذف الصنف");
            // Revert local splice? Difficult. Reloading might be best.
             // await loadData();
        }
    }
}
