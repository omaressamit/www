// --- backupRestore.js ---

// --- Backup Functionality ---
async function backupData() {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'فقط المسؤول يمكنه إنشاء نسخ احتياطية.', 'error');
        return;
    }

    // Confirmation
    const { isConfirmed } = await Swal.fire({
        title: 'تأكيد إنشاء نسخة احتياطية',
        text: "سيتم تنزيل نسخة احتياطية كاملة من قاعدة البيانات الحالية.",
        icon: 'question', showCancelButton: true, confirmButtonText: 'نعم، إنشاء', cancelButtonText: 'إلغاء'
    });
    if (!isConfirmed) return;

    // Loading indicator
    Swal.fire({ title: 'جاري إنشاء النسخة الاحتياطية...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // Fetch the entire database root
        const snapshot = await database.ref('/').once('value');
        const data = snapshot.val();

        if (!data) {
            Swal.fire('فارغة', 'قاعدة البيانات فارغة، لا يوجد شيء لنسخه.', 'info');
            return;
        }

        // Ensure the structure includes the new format (or whatever is currently in DB)
        // No structural change needed here as we backup the whole root
        const jsonData = JSON.stringify(data, null, 2); // Pretty print
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `mrfeadda-backup-${timestamp}.json`; // Consistent naming

        document.body.appendChild(a);
        a.click();

        // Clean up
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        Swal.fire({ title: 'تم', text: 'تم تنزيل النسخة الاحتياطية بنجاح!', icon: 'success', timer: 2000, showConfirmButton: false });

    } catch (error) {
        console.error("Error creating backup:", error);
        handleError(error, 'خطأ أثناء إنشاء النسخة الاحتياطية'); // Use central handler
        Swal.close(); // Ensure loading is closed on error
    }
}

// --- Restore Functionality ---

// Trigger the hidden file input
function triggerRestore() {
    if (!currentUser || currentUser.role !== 'admin') {
        Swal.fire('خطأ', 'فقط المسؤول يمكنه استعادة نسخة احتياطية.', 'error');
        return;
    }
    const fileInput = document.getElementById('restore-file-input');
    if (fileInput) {
        fileInput.click();
    } else {
         console.error("Restore file input element not found!");
         Swal.fire('خطأ', 'عنصر تحميل الملف غير موجود.', 'error');
    }
}

// Handle file selection and initiate restore
async function handleRestoreFile(event) {
    if (!currentUser || currentUser.role !== 'admin') {
        console.warn("Non-admin attempted restore via file input.");
        return;
    }

    const file = event.target.files[0];
    if (!file) return; // No file selected

    // Reset input value for future selections
    event.target.value = null;

    if (file.type !== 'application/json') {
        Swal.fire('خطأ', 'يرجى اختيار ملف بصيغة JSON.', 'error');
        return;
    }

    // --- CRITICAL CONFIRMATION ---
    const { value: confirmationText } = await Swal.fire({
        title: 'تأكيد الاستعادة الخطيرة!',
        html: `
            <p style="color: red; font-weight: bold;">تحذير شديد! هذا الإجراء سيقوم بحذف <span style="text-decoration: underline;">جميع</span> البيانات الحالية في قاعدة البيانات واستبدالها بمحتويات الملف المختار.</p>
            <p>هذا الإجراء <span style="text-decoration: underline; font-weight: bold;">لا يمكن التراجع عنه</span>.</p>
            <p>للتأكيد، يرجى كتابة كلمة "استعادة" في الحقل أدناه:</p>`,
        input: 'text', inputPlaceholder: 'اكتب "استعادة" هنا', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'تأكيد الاستعادة', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33', cancelButtonColor: '#aaa',
        inputValidator: (value) => {
            if (value !== 'استعادة') {
                return 'يجب كتابة "استعادة" لتأكيد العملية!';
            }
        }
    });

    if (confirmationText !== 'استعادة') {
        Swal.fire('تم الإلغاء', 'لم يتم استعادة البيانات.', 'info');
        return;
    }

    // --- Proceed with restore ---
    Swal.fire({
        title: 'جاري استعادة البيانات...', text: 'سيتم استبدال جميع البيانات الحالية.',
        allowOutsideClick: false, didOpen: () => Swal.showLoading()
    });

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const fileContent = e.target.result;
            const dataToRestore = JSON.parse(fileContent);

            // *** VALIDATION for NEW STRUCTURE ***
            if (!dataToRestore || typeof dataToRestore !== 'object') {
                throw new Error("ملف النسخة الاحتياطية غير صالح أو فارغ.");
            }
            // Check for essential top-level keys of the new structure
            const hasUsers = dataToRestore.hasOwnProperty('users') && Array.isArray(dataToRestore.users);
            const hasMetadata = dataToRestore.hasOwnProperty('branchMetadata') && typeof dataToRestore.branchMetadata === 'object';
            const hasData = dataToRestore.hasOwnProperty('branchData') && typeof dataToRestore.branchData === 'object';

            if (!hasUsers || !hasMetadata || !hasData) {
                 console.error("Validation failed. Missing keys:", {hasUsers, hasMetadata, hasData});
                 throw new Error("ملف النسخة الاحتياطية لا يحتوي على الهيكل المتوقع (users, branchMetadata, branchData).");
            }
             // Optional: Deeper validation (e.g., check format within branchData) can be added here.


            // The core restore operation: OVERWRITE EVERYTHING at the root
            await database.ref('/').set(dataToRestore);

            // IMPORTANT: Reload data into the application's memory *immediately*
            await loadData(); // loadData now handles the new structure

            // Refresh UI elements based on the newly loaded data
            // refreshAllPagesData(); // Call the function from refresh.js - This is now handled by loadData calling showPage

            Swal.fire({
                title: 'تم بنجاح!', text: 'تم استعادة البيانات بنجاح.', icon: 'success',
                timer: 3000, showConfirmButton: true
            });

        } catch (error) {
            console.error("Error during restore:", error);
            let errorMsg = 'حدث خطأ أثناء استعادة البيانات.';
            if (error instanceof SyntaxError) {
                errorMsg = 'خطأ في تحليل ملف JSON. تأكد من أن الملف صالح.';
            } else if (error.message.includes("الهيكل المتوقع") || error.message.includes("غير صالح")) {
                errorMsg = error.message; // Use the specific validation error message
            }
            // Use the central error handler
            handleError(new Error(errorMsg), 'فشل الاستعادة');
            Swal.close(); // Ensure loading Swal is closed
        }
    };

    reader.onerror = (e) => {
        console.error("File reading error:", e);
        handleError(new Error('حدث خطأ أثناء قراءة الملف.'), 'خطأ في قراءة الملف');
        Swal.close();
    };

    reader.readAsText(file); // Start reading the file
}

// Add event listener (No change needed here, assuming index.html structure is the same)
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('restore-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleRestoreFile);
    } else {
        console.error("Restore file input element not found!");
    }
});