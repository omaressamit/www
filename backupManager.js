// backupManager.js - إدارة النسخ الاحتياطي المحسن
// Enhanced Backup Management System

class BackupManager {
    constructor(database) {
        this.db = database;
        this.maxBackupSize = 50 * 1024 * 1024; // 50MB
        this.compressionEnabled = true;
        this.encryptionEnabled = true;
    }

    // إنشاء نسخة احتياطية شاملة
    async createFullBackup() {
        try {
            console.log('بدء إنشاء النسخة الاحتياطية الشاملة...');

            const snapshot = await this.db.ref('/').once('value');
            const rawData = snapshot.val() || {};

            // التحقق من حجم البيانات
            const dataSize = this.calculateDataSize(rawData);
            if (dataSize > this.maxBackupSize) {
                throw new Error(`حجم البيانات (${this.formatBytes(dataSize)}) يتجاوز الحد المسموح (${this.formatBytes(this.maxBackupSize)})`);
            }

            // إنشاء معلومات النسخة الاحتياطية
            const backupInfo = {
                id: this.generateBackupId(),
                version: DB_SCHEMA_VERSION,
                timestamp: new Date().toISOString(),
                createdBy: currentUser ? currentUser.username : 'system',
                type: 'full',
                originalSize: dataSize,
                checksum: this.calculateChecksum(rawData)
            };

            // ضغط البيانات إذا كان مفعل
            let processedData = rawData;
            if (this.compressionEnabled) {
                processedData = this.compressData(rawData);
                backupInfo.compressed = true;
                backupInfo.compressedSize = this.calculateDataSize(processedData);
            }

            // تشفير البيانات إذا كان مفعل
            if (this.encryptionEnabled) {
                processedData = this.encryptData(processedData);
                backupInfo.encrypted = true;
            }

            // إنشاء ملف النسخة الاحتياطية
            const backupData = {
                info: backupInfo,
                data: processedData
            };

            // حفظ معلومات النسخة الاحتياطية في قاعدة البيانات
            await this.saveBackupInfo(backupInfo);

            // تسجيل في سجل المراجعة
            await dbManager.logAuditEntry('CREATE_BACKUP', {
                backupId: backupInfo.id,
                type: backupInfo.type,
                size: backupInfo.originalSize,
                compressed: backupInfo.compressed || false,
                encrypted: backupInfo.encrypted || false
            });

            console.log('تم إنشاء النسخة الاحتياطية بنجاح');
            return backupData;

        } catch (error) {
            console.error('خطأ في إنشاء النسخة الاحتياطية:', error);
            throw error;
        }
    }

    // إنشاء نسخة احتياطية تدريجية (للتغييرات فقط)
    async createIncrementalBackup(lastBackupTimestamp) {
        try {
            console.log('بدء إنشاء النسخة الاحتياطية التدريجية...');

            // الحصول على التغييرات منذ آخر نسخة احتياطية
            const changes = await this.getChangesSince(lastBackupTimestamp);

            if (Object.keys(changes).length === 0) {
                console.log('لا توجد تغييرات منذ آخر نسخة احتياطية');
                return null;
            }

            const backupInfo = {
                id: this.generateBackupId(),
                version: DB_SCHEMA_VERSION,
                timestamp: new Date().toISOString(),
                createdBy: currentUser ? currentUser.username : 'system',
                type: 'incremental',
                baseTimestamp: lastBackupTimestamp,
                originalSize: this.calculateDataSize(changes),
                checksum: this.calculateChecksum(changes)
            };

            let processedData = changes;
            if (this.compressionEnabled) {
                processedData = this.compressData(changes);
                backupInfo.compressed = true;
                backupInfo.compressedSize = this.calculateDataSize(processedData);
            }

            if (this.encryptionEnabled) {
                processedData = this.encryptData(processedData);
                backupInfo.encrypted = true;
            }

            const backupData = {
                info: backupInfo,
                data: processedData
            };

            await this.saveBackupInfo(backupInfo);

            await dbManager.logAuditEntry('CREATE_INCREMENTAL_BACKUP', {
                backupId: backupInfo.id,
                changesCount: Object.keys(changes).length,
                size: backupInfo.originalSize
            });

            console.log('تم إنشاء النسخة الاحتياطية التدريجية بنجاح');
            return backupData;

        } catch (error) {
            console.error('خطأ في إنشاء النسخة الاحتياطية التدريجية:', error);
            throw error;
        }
    }

    // استعادة من النسخة الاحتياطية مع التحقق المحسن
    async restoreFromBackup(backupData, options = {}) {
        try {
            console.log('بدء استعادة النسخة الاحتياطية...');

            // التحقق من صحة النسخة الاحتياطية
            const validation = this.validateBackup(backupData);
            if (!validation.isValid) {
                throw new Error(`النسخة الاحتياطية غير صحيحة: ${validation.errors.join(', ')}`);
            }

            // إنشاء نسخة احتياطية من البيانات الحالية قبل الاستعادة
            if (!options.skipCurrentBackup) {
                console.log('إنشاء نسخة احتياطية من البيانات الحالية...');
                await this.createFullBackup();
            }

            // فك تشفير البيانات إذا كانت مشفرة
            let processedData = backupData.data;
            if (backupData.info.encrypted) {
                processedData = this.decryptData(processedData);
            }

            // إلغاء ضغط البيانات إذا كانت مضغوطة
            if (backupData.info.compressed) {
                processedData = this.decompressData(processedData);
            }

            // التحقق من سلامة البيانات
            const currentChecksum = this.calculateChecksum(processedData);
            if (currentChecksum !== backupData.info.checksum) {
                throw new Error('فشل في التحقق من سلامة البيانات المستعادة');
            }

            // استعادة البيانات حسب النوع
            if (backupData.info.type === 'full') {
                await this.restoreFullData(processedData);
            } else if (backupData.info.type === 'incremental') {
                await this.restoreIncrementalData(processedData);
            }

            // إعادة تحميل البيانات المحلية
            await loadData();

            // تسجيل في سجل المراجعة
            await dbManager.logAuditEntry('RESTORE_BACKUP', {
                backupId: backupData.info.id,
                backupType: backupData.info.type,
                backupTimestamp: backupData.info.timestamp
            });

            console.log('تم استعادة النسخة الاحتياطية بنجاح');
            return true;

        } catch (error) {
            console.error('خطأ في استعادة النسخة الاحتياطية:', error);
            throw error;
        }
    }

    // تنزيل النسخة الاحتياطية
    downloadBackup(backupData, filename) {
        try {
            const jsonData = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename || `backup-${backupData.info.id}.json`;

            document.body.appendChild(a);
            a.click();

            // تنظيف
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            console.log('تم تنزيل النسخة الاحتياطية بنجاح');

        } catch (error) {
            console.error('خطأ في تنزيل النسخة الاحتياطية:', error);
            throw error;
        }
    }

    // التحقق من صحة النسخة الاحتياطية
    validateBackup(backupData) {
        const errors = [];

        if (!backupData || typeof backupData !== 'object') {
            errors.push('تنسيق النسخة الاحتياطية غير صحيح');
            return { isValid: false, errors };
        }

        if (!backupData.info) {
            errors.push('معلومات النسخة الاحتياطية مفقودة');
        } else {
            if (!backupData.info.version) {
                errors.push('إصدار النسخة الاحتياطية مفقود');
            }
            if (!backupData.info.timestamp) {
                errors.push('تاريخ النسخة الاحتياطية مفقود');
            }
            if (!backupData.info.checksum) {
                errors.push('رمز التحقق مفقود');
            }
        }

        if (!backupData.data) {
            errors.push('بيانات النسخة الاحتياطية مفقودة');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // حساب حجم البيانات
    calculateDataSize(data) {
        return new Blob([JSON.stringify(data)]).size;
    }

    // تنسيق حجم البيانات
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // إنشاء معرف النسخة الاحتياطية
    generateBackupId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `backup_${timestamp}_${random}`;
    }

    // حساب رمز التحقق
    calculateChecksum(data) {
        // تنفيذ بسيط لحساب رمز التحقق
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // تحويل إلى 32bit integer
        }
        return hash.toString(16);
    }

    // ضغط البيانات (تنفيذ بسيط)
    compressData(data) {
        // في التطبيق الحقيقي، يمكن استخدام مكتبة ضغط مثل pako
        return JSON.stringify(data);
    }

    // إلغاء ضغط البيانات
    decompressData(compressedData) {
        return JSON.parse(compressedData);
    }

    // تشفير البيانات (تنفيذ بسيط)
    encryptData(data) {
        // في التطبيق الحقيقي، يجب استخدام تشفير قوي
        return btoa(JSON.stringify(data));
    }

    // فك تشفير البيانات
    decryptData(encryptedData) {
        return JSON.parse(atob(encryptedData));
    }

    // حفظ معلومات النسخة الاحتياطية
    async saveBackupInfo(backupInfo) {
        await this.db.ref(`/systemConfig/backups/${backupInfo.id}`).set(backupInfo);
    }

    // استعادة البيانات الكاملة
    async restoreFullData(data) {
        await this.db.ref('/').set(data);
    }

    // استعادة البيانات التدريجية
    async restoreIncrementalData(changes) {
        const updates = {};
        for (const path in changes) {
            updates[path] = changes[path];
        }
        await this.db.ref().update(updates);
    }

    // الحصول على التغييرات منذ تاريخ معين
    async getChangesSince(timestamp) {
        // تنفيذ مبسط - في التطبيق الحقيقي يحتاج إلى تتبع التغييرات
        const snapshot = await this.db.ref('/').once('value');
        const data = snapshot.val() || {};

        // فلترة البيانات المحدثة بعد التاريخ المحدد
        const changes = {};
        // هذا تنفيذ مبسط - يحتاج إلى تحسين
        return changes;
    }
}

// إنشاء مثيل من مدير النسخ الاحتياطي
// سيتم تهيئته بعد تحميل Firebase في main.js
let backupManager = null;
