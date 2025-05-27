//--- main.js ---
// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://omaressamit-f3607-default-rtdb.firebaseio.com/" // Replace with your actual database URL
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Database Schema Version for migration tracking
const DB_SCHEMA_VERSION = "2.0";

// Database Structure Constants
const DB_PATHS = {
    USERS: '/users',
    BRANCH_METADATA: '/branchMetadata',
    BRANCH_DATA: '/branchData',
    SYSTEM_CONFIG: '/systemConfig',
    AUDIT_LOG: '/auditLog',
    SCHEMA_VERSION: '/schemaVersion'
};

// تهيئة مديري قاعدة البيانات بعد تحميل Firebase
function initializeDatabaseManagers() {
    // تهيئة مدير قاعدة البيانات
    if (typeof DatabaseManager !== 'undefined') {
        dbManager = new DatabaseManager(database);
    }

    // تهيئة مدير النسخ الاحتياطي
    if (typeof BackupManager !== 'undefined') {
        backupManager = new BackupManager(database);
    }

    // تهيئة مراقب قاعدة البيانات
    if (typeof DatabaseMonitor !== 'undefined' && typeof DataValidator !== 'undefined') {
        databaseMonitor = new DatabaseMonitor(database, dataValidator);
    }
}

// Global Variables - NEW STRUCTURE
let users = [];
let branchMetadata = {}; // Key: branchId, Value: { name: "...", users: ["..."] }
let branchData = {};     // Key: branchId, Value: { products: [], sales: [], returns: [], receiving: [], expenses: [], workshopOperations: [] }
let currentUser = null;

// Helper to get branchId from branchName
function getBranchIdByName(branchName) {
    for (const id in branchMetadata) {
        if (branchMetadata[id].name === branchName) {
            return id;
        }
    }
    return null; // Branch name not found
}

// Helper to get branchName from branchId
function getBranchNameById(branchId) {
    return branchMetadata[branchId] ? branchMetadata[branchId].name : null;
}

// Check for remembered login on page load
window.onload = async function () {
    // تهيئة مديري قاعدة البيانات أولاً
    initializeDatabaseManagers();

    await loadData();  // Load data first

    // Remember Me Logic (remains largely the same, checks against global 'users')
    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        try {
            const { username, password } = JSON.parse(rememberedUser);
            document.getElementById('username').value = username;
            document.getElementById('password').value = password;
            document.getElementById('remember-me').checked = true;

            // Find the user in the database (global users array)
            const user = users.find(u => u.username === username && u.password === password);
            if (user) {
                currentUser = user;
                document.getElementById('home').style.display = 'none';
                document.getElementById('main-menu').style.display = 'block';
                document.querySelector('.nav-toggle').style.display = 'block';
                if (user.role === 'admin') {
                    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                }
                showPage('sales'); // Default page after login
            } else {
                localStorage.removeItem('rememberedUser');
                resetLoginForm();
            }
        } catch (error) {
            console.error("Error with remembered user:", error);
            localStorage.removeItem('rememberedUser');
            resetLoginForm();
        }
    } else {
        showHomePage(); // Show login page if not remembered
    }

    // Hide all pages initially except the login (if not remembered)
    if (!currentUser) {
        document.querySelectorAll('.container').forEach(page => {
            if (page.id !== 'home') {
                page.style.display = 'none';
            }
        });
        showPage('home');
    }


    // Check for daily reset (remains the same logic, might need user context later if targets are per-branch)
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem('lastDailySalesReset');
    if (lastReset !== today) {
        // This localStorage needs revisiting if daily sales display becomes branch-specific
        localStorage.setItem('dailySales_' + lastReset, JSON.stringify([]));
        localStorage.setItem('lastDailySalesReset', today);
    }

    // --- Connection Status Indicator --- (No changes needed here)
    const statusElement = document.getElementById('connection-status');
    function updateConnectionStatus() {
        if (statusElement) {
            if (navigator.onLine) {
                statusElement.textContent = 'متصل';
                statusElement.classList.remove('status-offline');
                statusElement.classList.add('status-online');
            } else {
                statusElement.textContent = 'غير متصل';
                statusElement.classList.remove('status-online');
                statusElement.classList.add('status-offline');
                Swal.fire({
                    toast: true, position: 'top-end', icon: 'warning',
                    title: 'غير متصل بالإنترنت!', showConfirmButton: false,
                    timer: 3000, timerProgressBar: true
                });
            }
        } else { console.error("Connection status element not found!"); }
    }
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    // --- End Connection Status Indicator ---


    // --- Event Listeners ---
    // Note: Many listeners might need adjustments based on the refactored functions
    document.addEventListener('dataSaved', loadData); // Might trigger reload, ensure functions handle new structure
    document.addEventListener('productAdded', updateProductsTable); // Will need branch context
    document.addEventListener('expenseRecorded', showExpenses); // Will need branch context or "All" logic
    document.addEventListener('userAdded', updateUsersList);
    document.addEventListener('branchAdded', () => { // Combined update for branches page
        updateBranchUsersList(); // Needs refresh as users list might change
        updateExistingBranches();
    });
    document.addEventListener('userDeleted', updateUsersList);
    document.addEventListener('targetResetted', updateUsersList); // Target calculation is now complex
    document.addEventListener('returnDeleted', () => { // Refresh sales history after delete
         const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
         if(activePageId === 'sales-history') showSalesHistory();
    });
    document.addEventListener('saleDeleted', () => { // Refresh sales history after delete
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'sales-history') showSalesHistory();
   });
    document.addEventListener('receivingDeleted', () => { // Refresh receiving history
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'receiving') showPurchases();
    });
    document.addEventListener('dataLoaded', () => { // Called after loadData completes
        // Initialize dropdowns on relevant pages (will be handled in showPage)
    });
    document.addEventListener('receivingRecorded', () => { // Update receiving and product tables
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'receiving') showPurchases(); // Refresh history if on that page
        if(activePageId === 'add-product') updateProductsTable(); // Refresh products if on that page
        // Also consider refreshing item movement or sales history if needed
    });
    document.addEventListener('returnRecorded', () => { // Update product table
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'add-product') updateProductsTable();
        // Also consider refreshing item movement or sales history
    });
    document.addEventListener('saleRecorded', () => {  // Update target, products, daily sales
        updateTargetDisplay(); // Target might need adjustment based on selected branch
        updateProductsTable(); // Needs branch context
        updateDailySalesTable(); // Needs branch context or logic based on currentUser
        // Also consider refreshing item movement or sales history
    });
    document.addEventListener('workshopRecorded', () => { // Update workshop history and potentially daily sales
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'workshop') showWorkshopOperations();
        if(activePageId === 'sales') updateDailySalesTable(); // Update daily total on sales page
   });
    document.addEventListener('expenseRecorded', () => { // Update expense history and potentially products
        const activePageId = document.querySelector('.nav-bar a.active')?.getAttribute('href')?.substring(1);
        if(activePageId === 'expenses') showExpenses();
        if(activePageId === 'add-product') updateProductsTable(); // If scrap was bought
        // Also consider refreshing sales history (profit calculation)
    });

    // Add Event Listener to update expense form when branch changes
     const expenseBranchSelect = document.getElementById('expense-branch-select');
     if (expenseBranchSelect) {
         expenseBranchSelect.addEventListener('change', updateExpenseForm);
     }
     // Add Event Listener to update employee dropdown and product select when sales branch changes
     const salesBranchSelect = document.getElementById('branch-select');
     if (salesBranchSelect) {
         salesBranchSelect.addEventListener('change', function() {
             populateBranchEmployeeSelect(); // Update employee dropdown
             populateProductSelect('sales', this.value); // Update product select
             updateDailySalesTable(); // Update daily sales table for the new branch
         });
     }

     // Add event listeners for Item Movement page dropdowns
     const itemMoveBranchSelect = document.getElementById('item-movement-branch-select');
     if(itemMoveBranchSelect) {
        itemMoveBranchSelect.addEventListener('change', updateItemMovementProductSelect);
     }

     // Add Event Listener to update product select when returns branch changes
     const returnsBranchSelect = document.getElementById('returns-branch-select');
     if (returnsBranchSelect) {
         returnsBranchSelect.addEventListener('change', function() {
             populateProductSelect('returns', this.value); // Update product select for returns
         });
     }


}; // End of window.onload

function resetLoginForm() {
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('remember-me').checked = false;
    const navToggle = document.querySelector('.nav-toggle');
    if(navToggle) navToggle.style.display = 'none';
}

function showPage(pageId) {
    if (!currentUser && pageId !== 'home') {
        showHomePage();
        return;
    }

    // Admin check remains client-side for UI hiding, but real security needs Firebase Rules
    const adminOnlyPages = ['users', 'branches', 'backup-restore-section']; // Adjusted list based on likely intent
    const adminOnlyFunctionalityPages = ['sales-history', 'add-product', 'item-movement', 'receiving', 'expenses', 'workshop']; // Pages with admin views/filters

    let requiresAdmin = adminOnlyPages.includes(pageId);
    if (!requiresAdmin && adminOnlyFunctionalityPages.includes(pageId)) {
        // Even if page is visible, specific elements/views might be admin only
        // This logic will be handled within the page-specific update functions
    }

    if (currentUser && requiresAdmin && currentUser.role !== 'admin') {
        Swal.fire('خطأ في الصلاحية', 'هذه الصفحة مخصصة للمسؤولين فقط.', 'error');
        showPage('sales'); // Redirect non-admins
        return;
    }

    document.querySelectorAll('.container').forEach(page => {
        page.style.display = 'none';
    });

    // Special handling for backup/restore which might not be a 'container'
    const backupRestoreSection = document.getElementById('backup-restore-section'); // Assuming you wrap these buttons
    if (backupRestoreSection) backupRestoreSection.style.display = 'none';

    let targetElement = document.getElementById(pageId);
    if (pageId === 'backup-restore-section' && backupRestoreSection) {
         targetElement = backupRestoreSection; // Target the section directly if ID matches
    }

    if (targetElement) {
        targetElement.style.display = 'block';
    } else {
        console.error(`Page or Section with ID '${pageId}' not found.`);
        showHomePage(); // Fallback
        return;
    }

    // Show/hide nav toggle button
    const navToggle = document.querySelector('.nav-toggle');
     if(navToggle) navToggle.style.display = pageId === 'home' ? 'none' : 'block';

    // Show/hide main menu
     const mainMenu = document.getElementById('main-menu');
     if(mainMenu) mainMenu.style.display = pageId === 'home' ? 'none' : 'block';

    // Update active link
    document.querySelectorAll('.nav-bar a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        // Adjust matching for backup/restore links if they are direct function calls
        if (href && href === '#' + pageId) {
            link.classList.add('active');
        } else if (pageId === 'backup-restore-section') {
            // Highlight both backup and restore links if that section is shown
            const onclickAttr = link.getAttribute('onclick');
            if (onclickAttr && (onclickAttr.includes('backupData') || onclickAttr.includes('triggerRestore'))) {
                 link.classList.add('active');
            }
        }
    });

    // Hide nav on mobile after selection
    if(mainMenu) mainMenu.classList.remove('show');

    // --- Call page-specific update functions (adapted for new structure) ---
    if (pageId === 'sales-history') {
        updateBranchFilter('branch-filter'); // Update filter dropdown
        // Don't show history automatically, require search click
        clearTableDisplay('#sales-table tbody');
        clearTableDisplay('#returns-table tbody');
    } else if (pageId === 'users') {
        updateUsersList();
    } else if (pageId === 'branches') {
        updateBranchUsersList();
        updateExistingBranches();
    } else if (pageId === 'sales') {
        updateBranchSelect('branch-select'); // Update branch dropdown
        populateProductSelect('sales', document.getElementById('branch-select').value); // Populate products for selected branch
        updateTargetDisplay(); // Update target (may need branch context)
        updateDailySalesTable(); // Update daily sales (may need branch context)
        populateBranchEmployeeSelect(); // Populate employee dropdown for selected branch
        setDefaultSaleDate(); // Set today's date as default
    } else if (pageId === 'expenses') {
        updateExpensesPage(); // Updates dropdowns and form visibility
        // Don't show history automatically
        clearTableDisplay('#expenses-list');
        const tableWrapper = document.getElementById('expenses-table-wrapper');
        if(tableWrapper) tableWrapper.style.display = 'none';
    } else if (pageId === 'receiving') {
        updateReceivingPage(); // Updates dropdowns
        // Don't show history automatically
        clearTableDisplay('#purchases-list');
         const tableWrapper = document.getElementById('purchases-table')?.closest('.table-wrapper');
         if(tableWrapper) tableWrapper.style.display = 'none';
    } else if (pageId === 'add-product') {
        updateBranchSelect('add-product-branch-select');
        updateProductsTable(); // Show products for currently selected branch
    } else if (pageId === 'returns') {
        updateBranchSelect('returns-branch-select');
        populateProductSelect('returns', document.getElementById('returns-branch-select').value);
    } else if (pageId === 'workshop') {
        updateWorkshopPage(); // Updates dropdowns
        // Don't show history automatically
         const tableContainer = document.getElementById('workshop-tables-container');
         if(tableContainer) {
            tableContainer.style.display = 'none';
            tableContainer.innerHTML = '';
         }
    } else if (pageId === 'item-movement') {
        updateItemMovementPage(); // Updates dropdowns
        clearTableDisplay('#item-movement-table tbody');
    } else if (pageId === 'backup-restore-section') {
         // No specific updates needed, visibility handled above
    }

    // Special handling for admin-only elements within pages visible to users
    // This needs to be done carefully within each page's update/show function
    updateAdminOnlyElementsVisibility();

}

function clearTableDisplay(tbodySelector) {
    const tbody = document.querySelector(tbodySelector);
    if (tbody) {
        tbody.innerHTML = ''; // Clear content
    }
}


function showHomePage() {
    document.querySelectorAll('.container').forEach(page => {
        page.style.display = 'none';
    });
    const homePage = document.getElementById('home');
    if(homePage) homePage.style.display = 'block';

    const mainMenu = document.getElementById('main-menu');
    if(mainMenu) mainMenu.style.display = 'none';

    const navToggle = document.querySelector('.nav-toggle');
    if(navToggle) navToggle.style.display = 'none';

    // Hide backup/restore section if separate
    const backupRestoreSection = document.getElementById('backup-restore-section');
    if (backupRestoreSection) backupRestoreSection.style.display = 'none';
}


function toggleNav() {
    const mainMenu = document.getElementById('main-menu');
    if(mainMenu) mainMenu.classList.toggle('show');
}

async function loadData() {
    if (!navigator.onLine) {
        console.warn("Offline: Cannot load data from Firebase.");
        // Optionally load from local cache if implemented, otherwise rely on existing data
        // Display offline status via indicator
        handleError(new Error("Offline"), "غير متصل", false); // Inform user, non-blocking
        return; // Stop loading from Firebase
    }
    console.log("Loading data from Firebase...");
    try {
        const snapshot = await database.ref('/').once('value');
        const data = snapshot.val() || {};

        // Load data into the new global structures
        users = data.users || [];
        branchMetadata = data.branchMetadata || {};
        branchData = data.branchData || {};

        // --- Migration Logic (Run only if new structure is missing but old exists) ---
        let needsSaveAfterMigration = false;
        if (Object.keys(branchMetadata).length === 0 && data.branches && Array.isArray(data.branches) && data.branches.length > 0) {
            console.warn("Old 'branches' structure detected. Attempting migration to 'branchMetadata' and 'branchData'.");
            needsSaveAfterMigration = true;
            branchMetadata = {}; // Reset just in case
            branchData = {};     // Reset just in case

            // Migrate branches and initialize branchData
            data.branches.forEach(oldBranch => {
                if (!oldBranch || !oldBranch.name) return; // Skip invalid old branch data
                const newBranchId = database.ref('branchMetadata').push().key; // Generate unique ID
                branchMetadata[newBranchId] = {
                    name: oldBranch.name,
                    users: oldBranch.users || [] // Copy users
                };
                // Initialize data node for this branch
                branchData[newBranchId] = {
                    products: oldBranch.products || [], // Copy products
                    sales: [],
                    returns: [],
                    receiving: [],
                    expenses: [],
                    workshopOperations: []
                };
            });

            // Migrate old top-level operational data
            const migrateList = (oldKey, newKey) => {
                if (data[oldKey] && Array.isArray(data[oldKey])) {
                    data[oldKey].forEach(item => {
                        const branchId = getBranchIdByName(item.branch);
                        if (branchId && branchData[branchId] && branchData[branchId][newKey]) {
                             // Avoid duplicates during migration if run multiple times (simple check)
                             const exists = branchData[branchId][newKey].some(existing => existing.date === item.date && existing.user === item.user);
                             if (!exists) {
                                 branchData[branchId][newKey].push(item);
                             }
                        } else {
                            console.warn(`Could not find branch ID for ${item.branch} or missing data node while migrating ${oldKey}`);
                        }
                    });
                }
            };

             // Migrate old expenses (object keyed by name)
            if (data.expenses && typeof data.expenses === 'object' && !Array.isArray(data.expenses)) {
                 for (const branchName in data.expenses) {
                     const branchId = getBranchIdByName(branchName);
                     if (branchId && branchData[branchId] && Array.isArray(data.expenses[branchName])) {
                         data.expenses[branchName].forEach(expense => {
                            const exists = branchData[branchId].expenses.some(existing => existing.date === expense.date && existing.amount === expense.amount);
                            if(!exists) {
                                branchData[branchId].expenses.push(expense);
                            }
                         });
                     } else {
                        console.warn(`Could not find branch ID for ${branchName} or missing data node while migrating expenses`);
                     }
                 }
             }


            migrateList('sales', 'sales');
            migrateList('returns', 'returns');
            migrateList('receiving', 'receiving');
            migrateList('workshopOperations', 'workshopOperations');

            console.log("Migration attempted. Review data before saving.");
            // IMPORTANT: Consider *not* auto-saving after migration.
            // Maybe prompt the admin? For now, we'll save if needsSaveAfterMigration is true.
        }
        // --- End Migration Logic ---


        // Create admin user if no users exist
        if (!users || users.length === 0) {
            console.log("No users found. Creating default admin user.");
            const adminUser = {
                username: 'admin',
                password: 'admin123', // Consider prompting for initial password
                role: 'admin'
            };
            users = [adminUser];
             // Save immediately if online
             if (navigator.onLine) {
                await database.ref('/users').set(users);
                console.log("Default admin user saved.");
             }
             needsSaveAfterMigration = false; // Don't trigger full save if only user was added
        }

        // Save data if migration occurred
        if (needsSaveAfterMigration && navigator.onLine) {
            console.log("Saving migrated data structure...");
             // Be cautious here. This will overwrite everything!
             // It might be better to save ONLY branchMetadata and branchData
             // and *manually* delete the old nodes after verification.
             // For automation:
             await database.ref('/').update({
                 branchMetadata: branchMetadata,
                 branchData: branchData,
                 // Explicitly remove old structures by setting them to null
                 branches: null,
                 sales: null,
                 returns: null,
                 receiving: null,
                 expenses: null,
                 workshopOperations: null,
                 products: null // If there was a global products list
             });
            console.log("Migrated data saved and old nodes removed.");
        }


        console.log("Data loaded successfully.");
        document.dispatchEvent(new CustomEvent('dataLoaded')); // Notify other parts of the app

        // Refresh UI based on current page (call showPage again to trigger updates)
        const activePageLink = document.querySelector('.nav-bar a.active');
        const activePageId = activePageLink ? activePageLink.getAttribute('href')?.substring(1) : (currentUser ? 'sales' : 'home');
        if (activePageId) {
            showPage(activePageId);
        }


    } catch (error) {
        if (!navigator.onLine) {
            console.error("Firebase load error while offline:", error);
            handleError(error, "غير متصل", false);
        } else {
            handleError(error, "خطأ في تحميل البيانات");
        }
    }
}


async function saveData() {
    if (!navigator.onLine) {
        handleError(new Error("لا يوجد اتصال بالإنترنت. لم يتم حفظ التغييرات."), "غير متصل");
        return Promise.reject(new Error("Offline"));
    }
    console.log("Attempting to save data...");
    try {
        // Save the entire new structure
        await database.ref('/').set({
            users: users,
            branchMetadata: branchMetadata,
            branchData: branchData
        });
        console.log('Data saved successfully to Firebase');
        document.dispatchEvent(new CustomEvent('dataSaved'));
        return Promise.resolve();
    } catch (error) {
        handleError(error, "خطأ في حفظ البيانات");
        return Promise.reject(error);
    }
}

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.getElementById('remember-me').checked;

    if (!username || !password) {
        Swal.fire('خطأ', 'يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
    }
    // Ensure data is loaded before login attempt
    if (users.length === 0) {
        await loadData(); // Load data if users array is empty
        // Add a small delay or check again if loadData is async and might not finish instantly
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        if (users.length === 0 && navigator.onLine) {
             Swal.fire('خطأ', 'لم يتم تحميل بيانات المستخدمين. يرجى المحاولة مرة أخرى.', 'error');
             return;
        } else if (!navigator.onLine) {
            Swal.fire('غير متصل', 'لا يمكن تسجيل الدخول أثناء عدم الاتصال بالإنترنت.', 'warning');
            return;
        }
    }

    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        currentUser = user;
        if (rememberMe) {
            localStorage.setItem('rememberedUser', JSON.stringify({ username, password }));
        } else {
            localStorage.removeItem('rememberedUser');
        }
        document.getElementById('home').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        const navToggle = document.querySelector('.nav-toggle');
        if(navToggle) navToggle.style.display = 'block';

        updateAdminOnlyElementsVisibility(); // Update visibility based on role

        await Swal.fire({
            title: 'مرحباً', text: 'تم تسجيل الدخول بنجاح', icon: 'success',
            timer: 1500, showConfirmButton: false
        });
        showPage('sales'); // Go to default page after login

    } else {
        Swal.fire('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('rememberedUser');
    resetLoginForm();
    showHomePage(); // Show login page

    // Hide admin elements again
    updateAdminOnlyElementsVisibility();

    Swal.fire({
        title: 'تم', text: 'تم تسجيل الخروج بنجاح', icon: 'success',
        timer: 1500, showConfirmButton: false
    });
}

// Centralized Error Handler
function handleError(error, title = 'خطأ', showPopup = true) {
    console.error(title + ":", error); // Log the full error for debugging

    let message = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.'; // Generic

    if (error.message === "Offline" || (error.message && error.message.toLowerCase().includes("network request failed")) || !navigator.onLine) {
         message = "لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مرة أخرى.";
         title = "غير متصل";
    } else if (error.code === 'PERMISSION_DENIED') {
         message = "ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء.";
         title = "خطأ في الصلاحية";
    }
    // Add more specific Firebase error codes as needed

    if (showPopup) {
        Swal.fire({
            title: title,
            text: message,
            icon: (title === "غير متصل" ? 'warning' : 'error'), // Use warning icon for offline
            confirmButtonText: 'حسناً'
        });
    }
}


// Function to show/hide admin-only elements based on currentUser.role
function updateAdminOnlyElementsVisibility() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none'; // Or 'inline-block', 'flex', etc., depending on the element
    });

     // Also handle admin-only sections if they exist (like backup/restore)
     const backupRestoreSection = document.getElementById('backup-restore-section');
     if (backupRestoreSection) {
         backupRestoreSection.style.display = isAdmin ? 'block' : 'none';
     }
}


// getData function might be less necessary now, but can be adapted:
function getData(type, branchId = null) {
    switch (type) {
        case 'users':
            return users;
        case 'branchMetadata':
            return branchMetadata;
        case 'branchData':
            if (branchId && branchData[branchId]) {
                return branchData[branchId]; // Return data for a specific branch
            } else if (!branchId) {
                return branchData; // Return all branch data
            } else {
                return null; // Branch ID specified but not found
            }
        case 'products':
        case 'sales':
        case 'returns':
        case 'receiving':
        case 'expenses':
        case 'workshopOperations':
            if (branchId && branchData[branchId] && branchData[branchId][type]) {
                return branchData[branchId][type]; // Get specific list for a branch
            } else if (!branchId) {
                 // Combine data from all branches (more complex, might be better handled in specific functions)
                 console.warn(`getData: Combining '${type}' across all branches is not directly implemented here.`);
                 return []; // Return empty or handle aggregation elsewhere
            } else {
                return []; // Branch ID specified but not found or list doesn't exist
            }
        case 'currentUser':
            return currentUser;
        default:
            // Return all structured data
            return {
                users,
                branchMetadata,
                branchData,
                currentUser
            };
    }
}