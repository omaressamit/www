// returns.js

let lastReturnClickTime = 0; // Initialize timestamp for returns

async function recordReturn() {
    if (!currentUser) {
        Swal.fire('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
        return;
    }

    // Double-click prevention (5 seconds)
    const now = Date.now();
    if (now - lastReturnClickTime < 5000) {
        Swal.fire('تنبيه', 'يرجى الانتظار 5 ثوانٍ قبل تسجيل ارتجاع آخر.', 'warning');
        return;
    }

    const branchName = document.getElementById('returns-branch-select').value;
    const productName = document.getElementById('return-product-select').value.trim();
    // Quantity is now float for grams
    const returnQuantity = parseFloat(document.getElementById('return-quantity').value.trim());
    const returnPrice = parseFloat(document.getElementById('return-price').value.trim()); // This is total price refunded
    const reason = document.getElementById('return-reason').value.trim();

    // Get Branch ID
    const branchId = getBranchIdByName(branchName);

    if (!branchId) {
        Swal.fire('خطأ', 'يرجى اختيار فرع صحيح.', 'error');
        return;
    }
    if (!productName || !reason || isNaN(returnQuantity) || isNaN(returnPrice)) {
        Swal.fire('خطأ', 'يرجى إدخال جميع الحقول المطلوبة بقيم صحيحة.', 'error');
        return;
    }
    if (returnQuantity <= 0) {
        Swal.fire('خطأ', 'يرجى إدخال كمية مرتجعة صحيحة (أكبر من صفر).', 'error');
        return;
    }
    // Allow zero return price? For exchange maybe? Let's allow >= 0
    if (returnPrice < 0) {
        Swal.fire('خطأ', 'يرجى إدخال سعر إجمالي مسترد صحيح (صفر أو أكبر).', 'error');
        return;
    }

    // Ensure branch data and necessary arrays exist
    if (!branchData[branchId] || !branchData[branchId].products) {
        console.error(`Branch data or products missing for ID: ${branchId}`);
        Swal.fire('خطأ', 'بيانات الفرع أو الأصناف غير موجودة.', 'error');
        return;
    }
    branchData[branchId].returns = branchData[branchId].returns || [];

    // Find the product index within the specific branch's products
    const productIndex = branchData[branchId].products.findIndex(p => p.name === productName);

    if (productIndex === -1) {
        // If product doesn't exist, CAN we accept a return?
        // Option 1: Error - Product must exist to be returned.
        // Swal.fire('خطأ', `الصنف "${productName}" غير موجود في فرع "${branchName}". لا يمكن تسجيل الارتجاع.`, 'error');
        // return;

        // Option 2: Add the product with the returned quantity (treat as receiving?)
        // This might be preferable if items are sometimes sold before formal receiving.
         console.warn(`Product "${productName}" not found in branch "${branchName}". Adding it during return.`);
         branchData[branchId].products.push({
             name: productName,
             quantity: returnQuantity,
             // How to determine cost? Assume it adds zero cost, or prompt admin?
             // For simplicity, assume zero cost addition on return of unknown item.
             purchasePrice: 0
         });
         // We'll proceed to record the return, but the cost calculation below won't apply.
    } else {
        // Product exists, add back quantity and adjust purchase price
        const product = branchData[branchId].products[productIndex];
        const originalQuantityBeforeReturn = product.quantity; // Qty before adding back
        product.quantity += returnQuantity;

        // Calculate the approximate cost value being returned
        // Use average cost per gram *before* adding the quantity back
        let costBasis = 0;
        if (originalQuantityBeforeReturn > 0 && product.purchasePrice > 0) {
             costBasis = product.purchasePrice / originalQuantityBeforeReturn;
        } else if (product.quantity > 0 && product.purchasePrice > 0) {
             // Fallback if original qty was 0, use current average (less accurate)
             costBasis = product.purchasePrice / product.quantity;
        }
        const returnedCostValue = costBasis * returnQuantity;
        product.purchasePrice = (product.purchasePrice || 0) + returnedCostValue;

         // Ensure price doesn't become negative (shouldn't happen with addition)
         if (product.purchasePrice < 0) product.purchasePrice = 0;
    }


    // Add record to the specific branch's returns list
    const newReturnRecord = {
        date: new Date().toISOString(),
        product: productName,
        quantity: returnQuantity,
        price: returnPrice, // Total price refunded
        reason: reason,
        user: currentUser.username
        // branch: branchName // Optional redundancy
    };
    branchData[branchId].returns.push(newReturnRecord);

    lastReturnClickTime = now; // Update timestamp

    try {
        // Save the updated branch data (products and returns list)
        await database.ref(`/branchData/${branchId}`).update({
            products: branchData[branchId].products,
            returns: branchData[branchId].returns
        });

        // Reset form fields
        document.getElementById('return-product-select').value = '';
        document.getElementById('return-quantity').value = ''; // Clear quantity
        document.getElementById('return-price').value = '';
        document.getElementById('return-reason').value = '';
        // Repopulate product select for the current branch
        populateProductSelect('returns', branchName);

        document.dispatchEvent(new CustomEvent('returnRecorded', { detail: { branchId: branchId } }));


        Swal.fire({
            title: 'تم', text: 'تم تسجيل الارتجاع بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });
    } catch (error) {
        handleError(error, "خطأ أثناء حفظ الارتجاع");
        // Revert local changes (difficult)
        await loadData(); // Reload data
    }
}