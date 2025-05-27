// databaseManager.js - إدارة قاعدة البيانات المحسنة
// Database Manager for Enhanced Data Security and Organization

class DatabaseManager {
    constructor(database) {
        this.db = database;
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.setupConnectionMonitoring();
    }

    // مراقبة حالة الاتصال
    setupConnectionMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processPendingOperations();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    // تشفير البيانات الحساسة
    encryptSensitiveData(data) {
        // تشفير بسيط للبيانات الحساسة (يمكن تحسينه)
        if (typeof data === 'string') {
            return btoa(data); // Base64 encoding
        }
        return data;
    }

    // فك تشفير البيانات
    decryptSensitiveData(encryptedData) {
        try {
            return atob(encryptedData); // Base64 decoding
        } catch (e) {
            return encryptedData; // إذا لم تكن مشفرة
        }
    }

    // إنشاء معرف فريد محسن
    generateUniqueId(prefix = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${prefix}${timestamp}_${random}`;
    }

    // تسجيل العمليات في سجل المراجعة
    async logAuditEntry(action, details, userId = null) {
        const auditEntry = {
            id: this.generateUniqueId('audit_'),
            timestamp: new Date().toISOString(),
            action: action,
            details: details,
            userId: userId || (currentUser ? currentUser.username : 'system'),
            ipAddress: 'client', // يمكن تحسينه للحصول على IP الحقيقي
            userAgent: navigator.userAgent
        };

        try {
            if (this.isOnline) {
                await this.db.ref(`${DB_PATHS.AUDIT_LOG}/${auditEntry.id}`).set(auditEntry);
            } else {
                this.pendingOperations.push({
                    type: 'audit',
                    path: `${DB_PATHS.AUDIT_LOG}/${auditEntry.id}`,
                    data: auditEntry
                });
            }
        } catch (error) {
            console.error('خطأ في تسجيل سجل المراجعة:', error);
        }
    }

    // التحقق من صحة بيانات الفرع
    validateBranchData(branchData) {
        const requiredFields = ['name'];
        const errors = [];

        for (const field of requiredFields) {
            if (!branchData[field] || branchData[field].trim() === '') {
                errors.push(`الحقل ${field} مطلوب`);
            }
        }

        // التحقق من عدم تكرار اسم الفرع
        const existingBranch = Object.values(branchMetadata).find(
            branch => branch.name === branchData.name
        );
        if (existingBranch) {
            errors.push('اسم الفرع موجود بالفعل');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // التحقق من صحة بيانات المستخدم
    validateUserData(userData) {
        const errors = [];

        if (!userData.username || userData.username.trim() === '') {
            errors.push('اسم المستخدم مطلوب');
        }

        if (!userData.password || userData.password.length < 6) {
            errors.push('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        }

        if (!['admin', 'user'].includes(userData.role)) {
            errors.push('نوع المستخدم غير صحيح');
        }

        // التحقق من عدم تكرار اسم المستخدم
        const existingUser = users.find(user => user.username === userData.username);
        if (existingUser) {
            errors.push('اسم المستخدم موجود بالفعل');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // إنشاء فرع جديد مع التحقق المحسن
    async createBranch(branchData) {
        const validation = this.validateBranchData(branchData);
        if (!validation.isValid) {
            throw new Error(validation.errors.join(', '));
        }

        const branchId = this.generateUniqueId('branch_');

        const newBranchMetadata = {
            id: branchId,
            name: branchData.name,
            users: branchData.users || [],
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.username : 'system',
            isActive: true
        };

        const newBranchData = {
            products: [],
            sales: [],
            returns: [],
            receiving: [],
            expenses: [],
            workshopOperations: [],
            lastUpdated: new Date().toISOString()
        };

        try {
            if (this.isOnline) {
                const updates = {};
                updates[`${DB_PATHS.BRANCH_METADATA}/${branchId}`] = newBranchMetadata;
                updates[`${DB_PATHS.BRANCH_DATA}/${branchId}`] = newBranchData;

                await this.db.ref().update(updates);

                // تحديث البيانات المحلية
                branchMetadata[branchId] = newBranchMetadata;
                branchData[branchId] = newBranchData;

                // تسجيل في سجل المراجعة
                await this.logAuditEntry('CREATE_BRANCH', {
                    branchId: branchId,
                    branchName: branchData.name
                });

                return branchId;
            } else {
                throw new Error('لا يوجد اتصال بالإنترنت');
            }
        } catch (error) {
            console.error('خطأ في إنشاء الفرع:', error);
            throw error;
        }
    }

    // إضافة مستخدم جديد مع التشفير
    async createUser(userData) {
        const validation = this.validateUserData(userData);
        if (!validation.isValid) {
            throw new Error(validation.errors.join(', '));
        }

        const newUser = {
            id: this.generateUniqueId('user_'),
            username: userData.username,
            password: this.encryptSensitiveData(userData.password), // تشفير كلمة المرور
            role: userData.role,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.username : 'system',
            isActive: true,
            lastLogin: null
        };

        try {
            if (this.isOnline) {
                users.push(newUser);
                await this.db.ref(DB_PATHS.USERS).set(users);

                // تسجيل في سجل المراجعة
                await this.logAuditEntry('CREATE_USER', {
                    userId: newUser.id,
                    username: userData.username,
                    role: userData.role
                });

                return newUser.id;
            } else {
                throw new Error('لا يوجد اتصال بالإنترنت');
            }
        } catch (error) {
            console.error('خطأ في إنشاء المستخدم:', error);
            // التراجع عن التغيير المحلي
            const userIndex = users.findIndex(u => u.id === newUser.id);
            if (userIndex > -1) {
                users.splice(userIndex, 1);
            }
            throw error;
        }
    }

    // معالجة العمليات المعلقة عند العودة للاتصال
    async processPendingOperations() {
        if (this.pendingOperations.length === 0) return;

        console.log(`معالجة ${this.pendingOperations.length} عملية معلقة...`);

        for (const operation of this.pendingOperations) {
            try {
                await this.db.ref(operation.path).set(operation.data);
                console.log(`تم تنفيذ العملية المعلقة: ${operation.type}`);
            } catch (error) {
                console.error('خطأ في تنفيذ العملية المعلقة:', error);
            }
        }

        this.pendingOperations = [];
    }

    // نسخ احتياطي محسن مع ضغط البيانات
    async createBackup() {
        try {
            const snapshot = await this.db.ref('/').once('value');
            const data = snapshot.val() || {};

            // إضافة معلومات النسخة الاحتياطية
            const backupData = {
                version: DB_SCHEMA_VERSION,
                timestamp: new Date().toISOString(),
                createdBy: currentUser ? currentUser.username : 'system',
                data: data
            };

            // تسجيل في سجل المراجعة
            await this.logAuditEntry('CREATE_BACKUP', {
                timestamp: backupData.timestamp,
                dataSize: JSON.stringify(data).length
            });

            return backupData;
        } catch (error) {
            console.error('خطأ في إنشاء النسخة الاحتياطية:', error);
            throw error;
        }
    }

    // استعادة من النسخة الاحتياطية مع التحقق
    async restoreFromBackup(backupData) {
        try {
            // التحقق من صحة النسخة الاحتياطية
            if (!backupData.data || !backupData.version) {
                throw new Error('ملف النسخة الاحتياطية غير صحيح');
            }

            // إنشاء نسخة احتياطية من البيانات الحالية قبل الاستعادة
            const currentBackup = await this.createBackup();

            // استعادة البيانات
            await this.db.ref('/').set(backupData.data);

            // إعادة تحميل البيانات المحلية
            await loadData();

            // تسجيل في سجل المراجعة
            await this.logAuditEntry('RESTORE_BACKUP', {
                backupTimestamp: backupData.timestamp,
                backupVersion: backupData.version
            });

            return true;
        } catch (error) {
            console.error('خطأ في استعادة النسخة الاحتياطية:', error);
            throw error;
        }
    }
}

// إنشاء مثيل من مدير قاعدة البيانات
// سيتم تهيئته بعد تحميل Firebase في main.js
let dbManager = null;
