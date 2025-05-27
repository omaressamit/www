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
            `<label for="swal-input1" style="display: block; text-align: right; margin-bottom: 5px; font-weight: bold;">الكمية الأولية (بالجرام):</label>` +
            `<input id="swal-input1" class="swal2-input" placeholder="الكمية بالجرام" type="number" step="0.01">` +
            `<label for="swal-input2" style="display: block; text-align: right; margin-bottom: 5px; margin-top: 15px; font-weight: bold;">سعر الشراء للجرام الواحد:</label>` +
            `<input id="swal-input2" class="swal2-input" placeholder="سعر الجرام الواحد" type="number" step="0.01">` +
            `<div id="total-cost-display" style="margin-top: 15px; padding: 10px; background-color: #f0f8ff; border-radius: 5px; text-align: center; font-weight: bold; color: #2c5aa0;"></div>`,
        focusConfirm: false,
        didOpen: () => {
            // إضافة مستمع للأحداث لحساب التكلفة الإجمالية تلقائياً
            const quantityInput = document.getElementById('swal-input1');
            const pricePerGramInput = document.getElementById('swal-input2');
            const totalCostDisplay = document.getElementById('total-cost-display');

            function updateTotalCost() {
                const quantity = parseFloat(quantityInput.value) || 0;
                const pricePerGram = parseFloat(pricePerGramInput.value) || 0;
                const totalCost = quantity * pricePerGram;

                if (quantity > 0 && pricePerGram > 0) {
                    totalCostDisplay.innerHTML = `إجمالي التكلفة: <span style="color: #d32f2f;">${totalCost.toFixed(2)} جنيه</span>`;
                } else {
                    totalCostDisplay.innerHTML = 'أدخل الكمية وسعر الجرام لحساب التكلفة الإجمالية';
                }
            }

            quantityInput.addEventListener('input', updateTotalCost);
            pricePerGramInput.addEventListener('input', updateTotalCost);
            updateTotalCost(); // حساب أولي
        },
        preConfirm: () => {
            const quantity = parseFloat(document.getElementById('swal-input1').value);
            const pricePerGram = parseFloat(document.getElementById('swal-input2').value);

            if (isNaN(quantity) || quantity <= 0) {
                Swal.showValidationMessage('يرجى إدخال كمية صحيحة (أكبر من صفر)');
                return false;
            }
            if (isNaN(pricePerGram) || pricePerGram <= 0) {
                Swal.showValidationMessage('يرجى إدخال سعر صحيح للجرام (أكبر من صفر)');
                return false;
            }

            // حساب التكلفة الإجمالية
            const totalPurchasePrice = quantity * pricePerGram;
            return { quantity, pricePerGram, totalPurchasePrice };
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
                  <th colspan="5" style="text-align: center; background-color: #4CAF50; color: white;">${branchMeta.name}</th>
              </tr>
              <tr>
                  <th>اسم الصنف</th>
                  <th>الكمية (جرام)</th>
                  <th>سعر الجرام</th>
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
            cell.colSpan = currentUser.role === 'admin' ? 5 : 4; // Adjust colspan for new column
            cell.textContent = 'لا توجد أصناف في هذا الفرع.';
            cell.style.textAlign = 'center';
            return; // Skip to the next branch
        }


        // Sort products alphabetically by name
        products.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        products.forEach((product, index) => {
            const row = tbody.insertRow();

            // حساب سعر الجرام الواحد
            const pricePerGram = (product.quantity > 0 && product.purchasePrice > 0)
                ? (product.purchasePrice / product.quantity)
                : 0;

            row.innerHTML = `
                  <td>${product.name}</td>
                  <td>${product.quantity?.toFixed(2) || '0.00'}</td>
                  <td>${pricePerGram.toFixed(2)}</td>
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

    // حساب سعر الجرام الحالي
    const currentPricePerGram = (product.quantity > 0 && product.purchasePrice > 0)
        ? (product.purchasePrice / product.quantity)
        : 0;

    const { value: updatedDetails } = await Swal.fire({
        title: `تعديل الصنف "${product.name}"`,
        html:
            `<p><strong>الفرع:</strong> ${branchName}</p>`+ // Show branch name
            `<label for="swal-input-name" style="display: block; text-align: right; margin-top: 10px;">اسم الصنف:</label>`+
            `<input id="swal-input-name" class="swal2-input" value="${product.name}">` + // Allow editing name
            `<label for="swal-input-qty" style="display: block; text-align: right; margin-top: 10px;">الكمية الحالية (بالجرام):</label>` +
            `<input id="swal-input-qty" class="swal2-input" placeholder="الكمية (بالجرام)" type="number" step="0.01" value="${product.quantity}">` +
            `<label for="swal-input-price-per-gram" style="display: block; text-align: right; margin-top: 10px;">سعر الجرام الواحد:</label>` +
            `<input id="swal-input-price-per-gram" class="swal2-input" placeholder="سعر الجرام" type="number" step="0.01" value="${currentPricePerGram.toFixed(2)}">` +
            `<div id="edit-total-cost-display" style="margin-top: 15px; padding: 10px; background-color: #f0f8ff; border-radius: 5px; text-align: center; font-weight: bold; color: #2c5aa0;"></div>`,
        focusConfirm: false,
        didOpen: () => {
            // إضافة مستمع للأحداث لحساب التكلفة الإجمالية تلقائياً في التعديل
            const quantityInput = document.getElementById('swal-input-qty');
            const pricePerGramInput = document.getElementById('swal-input-price-per-gram');
            const totalCostDisplay = document.getElementById('edit-total-cost-display');

            function updateEditTotalCost() {
                const quantity = parseFloat(quantityInput.value) || 0;
                const pricePerGram = parseFloat(pricePerGramInput.value) || 0;
                const totalCost = quantity * pricePerGram;

                if (quantity > 0 && pricePerGram > 0) {
                    totalCostDisplay.innerHTML = `إجمالي التكلفة الجديدة: <span style="color: #d32f2f;">${totalCost.toFixed(2)} جنيه</span>`;
                } else {
                    totalCostDisplay.innerHTML = 'أدخل الكمية وسعر الجرام لحساب التكلفة الإجمالية';
                }
            }

            quantityInput.addEventListener('input', updateEditTotalCost);
            pricePerGramInput.addEventListener('input', updateEditTotalCost);
            updateEditTotalCost(); // حساب أولي
        },
        preConfirm: () => {
            const name = document.getElementById('swal-input-name').value.trim();
            const quantity = parseFloat(document.getElementById('swal-input-qty').value);
            const pricePerGram = parseFloat(document.getElementById('swal-input-price-per-gram').value);

             if (!name) {
                Swal.showValidationMessage('يرجى إدخال اسم الصنف.');
                return false;
            }
            // Check if name changed and if it conflicts with another product *in the same branch*
            if (name !== product.name && branchData[branchId].products.some((p, idx) => p.name === name && idx !== productIndex)) {
                 Swal.showValidationMessage(`اسم الصنف "${name}" موجود بالفعل في هذا الفرع.`);
                 return false;
            }

            // Validate numbers
            if (isNaN(quantity) || quantity < 0) {
                Swal.showValidationMessage('يرجى إدخال كمية صحيحة (غير سالبة)');
                return false;
            }
            if (isNaN(pricePerGram) || pricePerGram < 0) {
                Swal.showValidationMessage('يرجى إدخال سعر صحيح للجرام (غير سالب)');
                return false;
            }

            // حساب التكلفة الإجمالية الجديدة
            const purchasePrice = quantity * pricePerGram;
            return { name, quantity, pricePerGram, purchasePrice };
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
