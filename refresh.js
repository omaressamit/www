// refresh.js

async function refreshData() {
    // Display a loading message
    Swal.fire({
        title: 'تحديث البيانات',
        text: '...جاري تحديث البيانات من الخادم',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // Store the currently active page ID before reloading data
        const activePageLink = document.querySelector('.nav-bar a.active');
        const activePageId = activePageLink ? activePageLink.getAttribute('href')?.substring(1) : 'sales'; // Default to sales

        // Reload data from Firebase (this will overwrite local state)
        await loadData(); // loadData now handles the new structure

        // loadData should ideally trigger 'dataLoaded' event, which in turn calls showPage
        // If not, explicitly call showPage to refresh the UI of the *current* page
        // based on the newly loaded data.
        console.log(`Refreshing UI for page: ${activePageId}`);
        showPage(activePageId); // Call showPage AFTER loadData has finished

        // Close the loading message *after* UI refresh attempts
        Swal.close();
        console.log("Data refresh complete.");

    } catch (error) {
        // Swal might be closed by loadData's error handler, ensure it's closed here too
        Swal.close();
        // Use the centralized handler (handleError is in main.js)
        handleError(error, "حدث خطأ أثناء تحديث البيانات");
    }
}