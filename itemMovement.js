// itemMovement.js

// Populates the product select specifically for the item movement page
function updateItemMovementProductSelect() {
  const branchName = document.getElementById('item-movement-branch-select').value;
  populateProductSelect('item-movement', branchName); // Use the helper
}

// Displays the sales movement for a selected item in a specific branch and date range
function showItemMovement() {
  const branchName = document.getElementById('item-movement-branch-select').value;
  const productName = document.getElementById('item-movement-product-select').value;
  const dateFromStr = document.getElementById('item-movement-date-from').value;
  const dateToStr = document.getElementById('item-movement-date-to').value;

  const tableBody = document.querySelector('#item-movement-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = ''; // Clear previous results

  if (!branchName || !productName) {
      Swal.fire('خطأ', 'يرجى اختيار الفرع والصنف', 'error');
      tableBody.innerHTML = '<tr><td colspan="4">يرجى اختيار الفرع والصنف أولاً.</td></tr>';
      return;
  }

  const branchId = getBranchIdByName(branchName);
  if (!branchId || !branchData[branchId]) {
       Swal.fire('خطأ', 'بيانات الفرع المحدد غير موجودة.', 'error');
       tableBody.innerHTML = '<tr><td colspan="4">بيانات الفرع المحدد غير موجودة.</td></tr>';
       return;
  }

  // Date filtering setup
  const dateFrom = dateFromStr ? new Date(dateFromStr) : null;
  if (dateFrom) dateFrom.setHours(0, 0, 0, 0);
  const dateTo = dateToStr ? new Date(dateToStr) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  // Get sales for the specific branch and product
  const branchSales = branchData[branchId].sales || [];
  const productSales = branchSales.filter(sale => {
      if (sale.product !== productName) return false;
      if (!sale.date) return false; // Ensure date exists

      let saleDate;
       try {
           saleDate = new Date(sale.date);
           if (isNaN(saleDate.getTime())) return false; // Invalid date
       } catch (e) { return false; }

      // Apply date filter
      const dateMatch = (!dateFrom || saleDate.getTime() >= dateFrom.getTime()) &&
                        (!dateTo || saleDate.getTime() <= dateTo.getTime());
      return dateMatch;
  });


  if (productSales.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4">لا توجد مبيعات للصنف "${productName}" في فرع "${branchName}" خلال الفترة المحددة.</td></tr>`;
      return;
  }

  // Sort sales by date descending (newest first)
  productSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let totalSaleQuantity = 0;
  let totalSalePrice = 0;
  let totalPurchaseCostOfSales = 0; // Total estimated purchase cost for the items sold

   // Get the product's *current* average purchase price per gram (as a fallback if calculation fails)
   // This isn't ideal for historical cost, but better than nothing.
   const productInfo = branchData[branchId].products?.find(p => p.name === productName);
   let currentAvgCostPerGram = 0;
   if (productInfo && productInfo.quantity > 0 && productInfo.purchasePrice > 0) {
       currentAvgCostPerGram = productInfo.purchasePrice / productInfo.quantity;
   }

  productSales.forEach(sale => {
      const row = tableBody.insertRow();
      const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
      const formattedDate = new Date(sale.date).toLocaleString('ar-EG', options);
      const saleQuantity = parseFloat(sale.quantity || 0);
      const salePrice = parseFloat(sale.price || 0); // Total price for this sale

      // --- Estimate Purchase Cost at time of sale ---
      // This is tricky without historical cost snapshots.
      // We approximate based on the logic used *during* sale recording.
      // We need the product state *before* this sale occurred. This isn't stored.
      // Approximation: Use the *current* average cost. This is inaccurate for historical reports.
      // A better approach would require storing cost basis with each sale, or complex inventory recalculation.
      // For now, we use the current average cost as calculated above.
      const estimatedPurchaseCostForThisSale = currentAvgCostPerGram * saleQuantity;
      // --- End Cost Estimation ---

      row.insertCell(0).textContent = formattedDate;
      row.insertCell(1).textContent = saleQuantity.toFixed(2);
      row.insertCell(2).textContent = salePrice.toFixed(2); // Display total sale price
      row.insertCell(3).textContent = estimatedPurchaseCostForThisSale.toFixed(2); // Display estimated cost

      totalSaleQuantity += saleQuantity;
      totalSalePrice += salePrice;
      totalPurchaseCostOfSales += estimatedPurchaseCostForThisSale;
  });

  // Add total row
  const totalRow = tableBody.insertRow();
  totalRow.innerHTML = `
      <td><strong>المجموع</strong></td>
      <td><strong>${totalSaleQuantity.toFixed(2)}</strong></td>
      <td><strong>${totalSalePrice.toFixed(2)}</strong></td>
      <td><strong>${totalPurchaseCostOfSales.toFixed(2)}</strong></td>
  `;
  totalRow.style.backgroundColor = '#555'; // Style the total row
  totalRow.style.fontWeight = 'bold';
}

// Initializes the Item Movement page (called by showPage)
function updateItemMovementPage() {
  updateBranchSelect('item-movement-branch-select');
  // Populate products based on the initially selected branch
  updateItemMovementProductSelect();
  // Clear the table initially
  const tableBody = document.querySelector('#item-movement-table tbody');
  if (tableBody) tableBody.innerHTML = '';
}