// helpers.js

// Populates a product select dropdown based on the selected branch
function populateProductSelect(pageContext, selectedBranchName) {
    let selectId;
    // Determine the correct select element ID based on the page context
    switch (pageContext) {
        case 'sales':
            selectId = 'product-select';
            break;
        case 'returns':
            selectId = 'return-product-select';
            break;
        case 'receiving':
             // Receiving page might have two product selects: one for adding, one potentially for scrap type if functionality is added
             // Assuming 'receive-product-select' is for adding new/existing received stock
            selectId = 'receive-product-select';
            break;
         case 'scrap-purchase': // Example if used for scrap type selection in expenses
             selectId = 'expense-scrap-type';
             break;
        // Add other cases if needed (e.g., item movement)
        case 'item-movement':
             selectId = 'item-movement-product-select';
             break;
        default:
            console.warn(`populateProductSelect called with unknown pageContext: ${pageContext}`);
            return;
    }

    const selectElement = document.getElementById(selectId);
    if (!selectElement) {
        console.warn(`Select element with ID '${selectId}' not found in DOM for pageContext: ${pageContext}`);
        return;
    }

    // Clear existing options
    selectElement.innerHTML = '<option value="">اختر الصنف...</option>'; // Default placeholder

    if (!selectedBranchName) {
        selectElement.innerHTML = '<option value="">اختر الفرع أولاً</option>';
        selectElement.disabled = true; // Disable if no branch is selected
        return;
    }

    const branchId = getBranchIdByName(selectedBranchName);
    if (!branchId || !branchData[branchId] || !branchData[branchId].products) {
        selectElement.innerHTML = `<option value="">لا توجد أصناف لفرع ${selectedBranchName}</option>`;
         selectElement.disabled = true; // Disable if no products or branch data
        return;
    }

    const products = branchData[branchId].products;

    if (products.length === 0) {
         selectElement.innerHTML = `<option value="">لا توجد أصناف في هذا الفرع</option>`;
         selectElement.disabled = true;
         return;
    }

    selectElement.disabled = false; // Enable the select

    // Sort products alphabetically
    products.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    products.forEach(product => {
        const option = document.createElement('option');
        option.value = product.name;
        // Display quantity, handle potential undefined/null quantity
        const quantityDisplay = (typeof product.quantity === 'number') ? product.quantity.toFixed(2) : 'N/A';
        option.textContent = `${product.name} (المتوفر: ${quantityDisplay} جرام)`;
        selectElement.appendChild(option);
    });
}

// This function needs to be called whenever the relevant Branch select dropdown changes
// Example setup in main.js or page-specific init:
/*
document.getElementById('branch-select')?.addEventListener('change', (event) => {
    populateProductSelect('sales', event.target.value);
});
document.getElementById('returns-branch-select')?.addEventListener('change', (event) => {
    populateProductSelect('returns', event.target.value);
});
document.getElementById('receiving-branch-select')?.addEventListener('change', (event) => {
    populateProductSelect('receiving', event.target.value);
});
document.getElementById('expense-branch-select')?.addEventListener('change', (event) => {
     // If the expense type is scrap purchase, update the scrap type dropdown
     if (document.getElementById('expense-type')?.value === 'شراء فضة كسر') {
         populateProductSelect('scrap-purchase', event.target.value);
     }
});
document.getElementById('item-movement-branch-select')?.addEventListener('change', (event) => {
     populateProductSelect('item-movement', event.target.value);
});
*/