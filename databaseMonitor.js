// databaseMonitor.js - مراقبة سلامة قاعدة البيانات
// Database Health Monitoring and Maintenance System

class DatabaseMonitor {
    constructor(database, validator) {
        this.db = database;
        this.validator = validator;
        this.monitoringInterval = null;
        this.healthCheckInterval = 5 * 60 * 1000; // 5 دقائق
        this.lastHealthCheck = null;
        this.healthStatus = {
            isHealthy: true,
            lastCheck: null,
            issues: []
        };
        this.setupMonitoring();
    }

    // تهيئة نظام المراقبة
    setupMonitoring() {
        // مراقبة دورية لسلامة قاعدة البيانات
        this.startHealthMonitoring();

        // مراقبة أحداث قاعدة البيانات
        this.setupDatabaseListeners();

        // مراقبة حالة الاتصال
        this.setupConnectionMonitoring();
    }

    // بدء المراقبة الدورية
    startHealthMonitoring() {
        this.monitoringInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckInterval);

        // فحص فوري عند البدء
        setTimeout(() => this.performHealthCheck(), 2000);
    }

    // إيقاف المراقبة
    stopHealthMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    // فحص سلامة قاعدة البيانات
    async performHealthCheck() {
        try {
            console.log('بدء فحص سلامة قاعدة البيانات...');

            const healthReport = await this.validator.validateDatabaseIntegrity();

            this.healthStatus = {
                isHealthy: healthReport.isHealthy,
                lastCheck: new Date().toISOString(),
                issues: healthReport.issues
            };

            // تسجيل النتائج
            if (!healthReport.isHealthy) {
                console.warn('تم اكتشاف مشاكل في قاعدة البيانات:', healthReport.issues);
                await this.handleHealthIssues(healthReport.issues);
            } else {
                console.log('قاعدة البيانات سليمة ✓');
            }

            // تحديث واجهة المستخدم
            this.updateHealthIndicator();

            this.lastHealthCheck = new Date();

        } catch (error) {
            console.error('خطأ في فحص سلامة قاعدة البيانات:', error);
            this.healthStatus.isHealthy = false;
            this.healthStatus.issues.push({
                type: 'error',
                message: `خطأ في فحص السلامة: ${error.message}`
            });
        }
    }

    // معالجة مشاكل السلامة
    async handleHealthIssues(issues) {
        const criticalIssues = issues.filter(issue => issue.type === 'error');
        const warnings = issues.filter(issue => issue.type === 'warning');

        // معالجة المشاكل الحرجة
        if (criticalIssues.length > 0) {
            await this.handleCriticalIssues(criticalIssues);
        }

        // تسجيل التحذيرات
        if (warnings.length > 0) {
            await this.logWarnings(warnings);
        }

        // إشعار المسؤول إذا كان متصل
        if (currentUser && currentUser.role === 'admin') {
            this.notifyAdmin(issues);
        }
    }

    // معالجة المشاكل الحرجة
    async handleCriticalIssues(criticalIssues) {
        for (const issue of criticalIssues) {
            try {
                // محاولة إصلاح تلقائي للمشاكل المعروفة
                if (issue.message.includes('بيانات الفرع') && issue.message.includes('مفقودة')) {
                    await this.repairMissingBranchData(issue);
                }

                // تسجيل في سجل المراجعة
                await dbManager.logAuditEntry('CRITICAL_ISSUE_DETECTED', {
                    issue: issue.message,
                    autoRepairAttempted: true
                });

            } catch (repairError) {
                console.error('فشل في إصلاح المشكلة:', repairError);
            }
        }
    }

    // إصلاح بيانات الفرع المفقودة
    async repairMissingBranchData(issue) {
        // استخراج معرف الفرع من رسالة الخطأ
        const branchIdMatch = issue.message.match(/الفرع (.+) مفقودة/);
        if (!branchIdMatch) return;

        const branchName = branchIdMatch[1];
        const branchId = getBranchIdByName(branchName);

        if (branchId && !branchData[branchId]) {
            // إنشاء بنية بيانات فارغة للفرع
            branchData[branchId] = {
                products: [],
                sales: [],
                returns: [],
                receiving: [],
                expenses: [],
                workshopOperations: [],
                lastUpdated: new Date().toISOString()
            };

            // حفظ البيانات المصلحة
            await this.db.ref(`${DB_PATHS.BRANCH_DATA}/${branchId}`).set(branchData[branchId]);

            console.log(`تم إصلاح بيانات الفرع: ${branchName}`);
        }
    }

    // تسجيل التحذيرات
    async logWarnings(warnings) {
        for (const warning of warnings) {
            await dbManager.logAuditEntry('DATABASE_WARNING', {
                warning: warning.message
            });
        }
    }

    // إشعار المسؤول
    notifyAdmin(issues) {
        const criticalCount = issues.filter(i => i.type === 'error').length;
        const warningCount = issues.filter(i => i.type === 'warning').length;

        if (criticalCount > 0) {
            Swal.fire({
                title: 'تحذير: مشاكل في قاعدة البيانات',
                html: `
                    <p>تم اكتشاف <strong>${criticalCount}</strong> مشكلة حرجة و <strong>${warningCount}</strong> تحذير</p>
                    <p>يرجى مراجعة سجل المراجعة للتفاصيل</p>
                `,
                icon: 'warning',
                confirmButtonText: 'فهمت'
            });
        }
    }

    // تحديث مؤشر السلامة في الواجهة
    updateHealthIndicator() {
        const indicator = document.getElementById('database-health-indicator');
        if (!indicator) return;

        const isHealthy = this.healthStatus.isHealthy;
        const criticalIssues = this.healthStatus.issues.filter(i => i.type === 'error').length;

        indicator.className = `health-indicator ${isHealthy ? 'healthy' : 'unhealthy'}`;
        indicator.title = isHealthy
            ? 'قاعدة البيانات سليمة'
            : `${criticalIssues} مشكلة حرجة`;

        indicator.innerHTML = isHealthy ? '●' : '⚠';
    }

    // إعداد مراقبة أحداث قاعدة البيانات
    setupDatabaseListeners() {
        // مراقبة تغييرات المستخدمين
        this.db.ref(DB_PATHS.USERS).on('value', (snapshot) => {
            this.onUsersChanged(snapshot.val());
        });

        // مراقبة تغييرات الفروع
        this.db.ref(DB_PATHS.BRANCH_METADATA).on('value', (snapshot) => {
            this.onBranchesChanged(snapshot.val());
        });
    }

    // معالجة تغييرات المستخدمين
    onUsersChanged(newUsers) {
        if (!newUsers || !Array.isArray(newUsers)) {
            console.warn('بيانات المستخدمين غير صحيحة');
            return;
        }

        // التحقق من وجود مسؤول واحد على الأقل
        const adminCount = newUsers.filter(user => user.role === 'admin').length;
        if (adminCount === 0) {
            console.error('تحذير: لا يوجد مسؤولين في النظام!');
            this.healthStatus.issues.push({
                type: 'error',
                message: 'لا يوجد مسؤولين في النظام'
            });
        }
    }

    // معالجة تغييرات الفروع
    onBranchesChanged(newBranches) {
        if (!newBranches || typeof newBranches !== 'object') {
            console.warn('بيانات الفروع غير صحيحة');
            return;
        }

        // التحقق من تطابق بيانات الفروع
        for (const branchId in newBranches) {
            if (!branchData[branchId]) {
                console.warn(`بيانات الفرع ${newBranches[branchId].name} مفقودة`);
            }
        }
    }

    // إعداد مراقبة الاتصال
    setupConnectionMonitoring() {
        window.addEventListener('online', () => {
            console.log('تم استعادة الاتصال - بدء فحص السلامة');
            setTimeout(() => this.performHealthCheck(), 1000);
        });

        window.addEventListener('offline', () => {
            console.log('انقطع الاتصال - إيقاف مراقبة قاعدة البيانات مؤقتاً');
        });
    }

    // الحصول على تقرير السلامة
    getHealthReport() {
        return {
            ...this.healthStatus,
            lastCheck: this.lastHealthCheck,
            monitoringActive: this.monitoringInterval !== null
        };
    }

    // تنظيف سجل المراجعة القديم
    async cleanupAuditLog() {
        try {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const snapshot = await this.db.ref(DB_PATHS.AUDIT_LOG).once('value');
            const auditEntries = snapshot.val() || {};

            const updates = {};
            let deletedCount = 0;

            for (const entryId in auditEntries) {
                const entry = auditEntries[entryId];
                const entryDate = new Date(entry.timestamp);

                if (entryDate < oneMonthAgo) {
                    updates[`${DB_PATHS.AUDIT_LOG}/${entryId}`] = null;
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                await this.db.ref().update(updates);
                console.log(`تم حذف ${deletedCount} إدخال قديم من سجل المراجعة`);
            }

        } catch (error) {
            console.error('خطأ في تنظيف سجل المراجعة:', error);
        }
    }

    // إنشاء تقرير شامل عن حالة النظام
    async generateSystemReport() {
        const report = {
            timestamp: new Date().toISOString(),
            health: this.getHealthReport(),
            statistics: {
                totalUsers: users.length,
                totalBranches: Object.keys(branchMetadata).length,
                totalProducts: 0,
                totalSales: 0
            }
        };

        // حساب الإحصائيات
        for (const branchId in branchData) {
            const branch = branchData[branchId];
            report.statistics.totalProducts += (branch.products || []).length;
            report.statistics.totalSales += (branch.sales || []).length;
        }

        return report;
    }
}

// إنشاء مثيل من مراقب قاعدة البيانات
// سيتم تهيئته بعد تحميل Firebase في main.js
let databaseMonitor = null;
