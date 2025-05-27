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
    Swal.fire({
        title: 'جاري إنشاء النسخة الاحتياطية المحسنة...',
        text: 'يتم ضغط وتشفير البيانات...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // استخدام النظام المحسن إذا كان متاحاً، وإلا استخدم الطريقة التقليدية
        if (backupManager && typeof backupManager.createFullBackup === 'function') {
            const backupData = await backupManager.createFullBackup();

            // تنزيل النسخة الاحتياطية
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `mrfeadda-enhanced-backup-${timestamp}.json`;
            backupManager.downloadBackup(backupData, filename);

            Swal.fire({
                title: 'تم',
                html: `
                    <p>تم إنشاء النسخة الاحتياطية المحسنة بنجاح</p>
                    <p><strong>معرف النسخة:</strong> ${backupData.info.id}</p>
                    <p><strong>الحجم الأصلي:</strong> ${backupManager.formatBytes(backupData.info.originalSize)}</p>
                    ${backupData.info.compressed ? `<p><strong>الحجم المضغوط:</strong> ${backupManager.formatBytes(backupData.info.compressedSize)}</p>` : ''}
                    <p><strong>مشفرة:</strong> ${backupData.info.encrypted ? 'نعم' : 'لا'}</p>
                `,
                icon: 'success',
                timer: 5000,
                showConfirmButton: true
            });
        } else {
            // الطريقة التقليدية
            const snapshot = await database.ref('/').once('value');
            const data = snapshot.val();

            if (!data) {
                Swal.fire('فارغة', 'قاعدة البيانات فارغة، لا يوجد شيء لنسخه.', 'info');
                return;
            }

            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `mrfeadda-backup-${timestamp}.json`;

            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            Swal.fire({
                title: 'تم',
                text: 'تم تنزيل النسخة الاحتياطية بنجاح!',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
        }

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
            const backupData = JSON.parse(fileContent);

            // استخدام النظام المحسن إذا كان متاحاً، وإلا استخدم الطريقة التقليدية
            if (backupManager && typeof backupManager.restoreFromBackup === 'function') {
                const success = await backupManager.restoreFromBackup(backupData, {
                    skipCurrentBackup: false // إنشاء نسخة احتياطية من البيانات الحالية قبل الاستعادة
                });

                if (success) {
                    Swal.fire({
                        title: 'تم بنجاح!',
                        html: `
                            <p>تم استعادة البيانات بنجاح</p>
                            <p><strong>معرف النسخة المستعادة:</strong> ${backupData.info?.id || 'غير محدد'}</p>
                            <p><strong>تاريخ النسخة:</strong> ${backupData.info?.timestamp ? new Date(backupData.info.timestamp).toLocaleString('ar') : 'غير محدد'}</p>
                            <p><strong>نوع النسخة:</strong> ${backupData.info?.type === 'full' ? 'كاملة' : 'تدريجية'}</p>
                        `,
                        icon: 'success',
                        timer: 5000,
                        showConfirmButton: true
                    });
                }
            } else {
                // الطريقة التقليدية
                if (!backupData || typeof backupData !== 'object') {
                    throw new Error("ملف النسخة الاحتياطية غير صالح أو فارغ.");
                }

                // التحقق من البنية الأساسية
                const hasUsers = backupData.hasOwnProperty('users') && Array.isArray(backupData.users);
                const hasMetadata = backupData.hasOwnProperty('branchMetadata') && typeof backupData.branchMetadata === 'object';
                const hasData = backupData.hasOwnProperty('branchData') && typeof backupData.branchData === 'object';

                if (!hasUsers || !hasMetadata || !hasData) {
                    throw new Error("ملف النسخة الاحتياطية لا يحتوي على الهيكل المتوقع.");
                }

                // استعادة البيانات
                await database.ref('/').set(backupData);
                await loadData();

                Swal.fire({
                    title: 'تم بنجاح!',
                    text: 'تم استعادة البيانات بنجاح.',
                    icon: 'success',
                    timer: 3000,
                    showConfirmButton: true
                });
            }

        } catch (error) {
            console.error("Error during restore:", error);
            let errorMsg = 'حدث خطأ أثناء استعادة البيانات.';
            if (error instanceof SyntaxError) {
                errorMsg = 'خطأ في تحليل ملف JSON. تأكد من أن الملف صالح.';
            } else {
                errorMsg = error.message;
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