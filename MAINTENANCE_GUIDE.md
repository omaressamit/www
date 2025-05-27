# دليل الصيانة والمراقبة
## System Maintenance and Monitoring Guide

## 📊 مراقبة النظام اليومية

### 1. **فحص مؤشرات السلامة**
- **مؤشر قاعدة البيانات**: تحقق من اللون الأخضر في أسفل الشاشة
- **مؤشر الاتصال**: تأكد من عرض "متصل"
- **سجل المراجعة**: راجع العمليات الأخيرة

### 2. **مراجعة الإحصائيات**
```javascript
// الحصول على تقرير شامل عن النظام
const report = await databaseMonitor.generateSystemReport();
console.log('تقرير النظام:', report);
```

### 3. **فحص الأخطاء**
- راجع وحدة تحكم المتصفح للأخطاء
- تحقق من رسائل التحذير
- راجع سجل Firebase للمشاكل

## 🔧 مهام الصيانة الأسبوعية

### 1. **النسخ الاحتياطي**
```javascript
// إنشاء نسخة احتياطية أسبوعية
async function weeklyBackup() {
    try {
        const backup = await backupManager.createFullBackup();
        const filename = `weekly-backup-${new Date().toISOString().split('T')[0]}.json`;
        backupManager.downloadBackup(backup, filename);
        console.log('تم إنشاء النسخة الاحتياطية الأسبوعية');
    } catch (error) {
        console.error('خطأ في النسخة الاحتياطية:', error);
    }
}
```

### 2. **تنظيف سجل المراجعة**
```javascript
// تنظيف السجلات القديمة (أكثر من شهر)
await databaseMonitor.cleanupAuditLog();
```

### 3. **فحص سلامة البيانات**
```javascript
// فحص شامل لسلامة قاعدة البيانات
const healthReport = await dataValidator.validateDatabaseIntegrity();
if (!healthReport.isHealthy) {
    console.warn('مشاكل في قاعدة البيانات:', healthReport.issues);
}
```

## 🗓️ مهام الصيانة الشهرية

### 1. **مراجعة المستخدمين**
- حذف المستخدمين غير النشطين
- تحديث كلمات المرور
- مراجعة الصلاحيات

### 2. **تحليل الأداء**
```javascript
// تحليل استخدام النظام
const stats = {
    totalUsers: users.length,
    activeBranches: Object.keys(branchMetadata).filter(id => branchMetadata[id].isActive).length,
    totalSales: 0,
    totalProducts: 0
};

// حساب إجمالي المبيعات والأصناف
for (const branchId in branchData) {
    const branch = branchData[branchId];
    stats.totalSales += (branch.sales || []).length;
    stats.totalProducts += (branch.products || []).length;
}

console.log('إحصائيات النظام:', stats);
```

### 3. **تحديث النظام**
- تحقق من وجود تحديثات للمكتبات
- اختبر الميزات الجديدة
- راجع قواعد الأمان

## 🚨 التعامل مع الطوارئ

### 1. **انقطاع الخدمة**
```javascript
// تفعيل وضع الطوارئ
const emergencyMode = {
    enableOfflineMode: true,
    disableNonEssentialFeatures: true,
    increaseBackupFrequency: true
};

// حفظ البيانات محلياً
localStorage.setItem('emergencyData', JSON.stringify({
    users: users,
    branchMetadata: branchMetadata,
    branchData: branchData,
    timestamp: new Date().toISOString()
}));
```

### 2. **فقدان البيانات**
```javascript
// استعادة من آخر نسخة احتياطية
async function emergencyRestore() {
    try {
        // البحث عن آخر نسخة احتياطية محلية
        const emergencyData = localStorage.getItem('emergencyData');
        if (emergencyData) {
            const data = JSON.parse(emergencyData);
            await database.ref('/').set(data);
            console.log('تم استعادة البيانات من النسخة المحلية');
        }
    } catch (error) {
        console.error('فشل في الاستعادة الطارئة:', error);
    }
}
```

### 3. **اختراق أمني**
```javascript
// إجراءات الأمان الطارئة
async function securityLockdown() {
    // تغيير كلمات مرور جميع المستخدمين
    for (const user of users) {
        if (user.role === 'admin') {
            // إشعار المسؤولين بتغيير كلمة المرور
            console.warn(`يجب على المسؤول ${user.username} تغيير كلمة المرور فوراً`);
        }
    }
    
    // تسجيل الحادث
    await dbManager.logAuditEntry('SECURITY_INCIDENT', {
        type: 'lockdown',
        timestamp: new Date().toISOString(),
        action: 'emergency_lockdown_initiated'
    });
}
```

## 📈 مراقبة الأداء

### 1. **مؤشرات الأداء الرئيسية**
```javascript
// قياس أوقات الاستجابة
const performanceMetrics = {
    loadTime: 0,
    saveTime: 0,
    queryTime: 0
};

// قياس وقت تحميل البيانات
const startTime = performance.now();
await loadData();
performanceMetrics.loadTime = performance.now() - startTime;
```

### 2. **مراقبة استخدام الذاكرة**
```javascript
// فحص استخدام الذاكرة
if (performance.memory) {
    const memoryInfo = {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB',
        total: Math.round(performance.memory.totalJSHeapSize / 1048576) + ' MB',
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB'
    };
    console.log('استخدام الذاكرة:', memoryInfo);
}
```

### 3. **مراقبة حجم البيانات**
```javascript
// حساب حجم البيانات
function calculateDataSize() {
    const dataSize = {
        users: JSON.stringify(users).length,
        branchMetadata: JSON.stringify(branchMetadata).length,
        branchData: JSON.stringify(branchData).length
    };
    
    const totalSize = Object.values(dataSize).reduce((a, b) => a + b, 0);
    console.log('حجم البيانات:', {
        ...dataSize,
        total: `${Math.round(totalSize / 1024)} KB`
    });
}
```

## 🔄 إجراءات التحديث

### 1. **قبل التحديث**
```javascript
// إنشاء نسخة احتياطية قبل التحديث
async function preUpdateBackup() {
    const backup = await backupManager.createFullBackup();
    const filename = `pre-update-backup-${Date.now()}.json`;
    backupManager.downloadBackup(backup, filename);
    
    // تسجيل بداية التحديث
    await dbManager.logAuditEntry('SYSTEM_UPDATE', {
        phase: 'pre_update_backup',
        timestamp: new Date().toISOString()
    });
}
```

### 2. **أثناء التحديث**
```javascript
// تفعيل وضع الصيانة
async function enableMaintenanceMode() {
    await database.ref('/systemConfig/maintenanceMode').set(true);
    
    // إشعار المستخدمين
    Swal.fire({
        title: 'وضع الصيانة',
        text: 'النظام في وضع الصيانة حالياً. يرجى المحاولة لاحقاً.',
        icon: 'info',
        allowOutsideClick: false,
        showConfirmButton: false
    });
}
```

### 3. **بعد التحديث**
```javascript
// اختبار النظام بعد التحديث
async function postUpdateTest() {
    try {
        // اختبار الوظائف الأساسية
        await loadData();
        const healthReport = await dataValidator.validateDatabaseIntegrity();
        
        if (healthReport.isHealthy) {
            // إلغاء وضع الصيانة
            await database.ref('/systemConfig/maintenanceMode').set(false);
            console.log('التحديث مكتمل بنجاح');
        } else {
            throw new Error('فشل في اختبار السلامة بعد التحديث');
        }
    } catch (error) {
        console.error('خطأ في اختبار ما بعد التحديث:', error);
        // استعادة من النسخة الاحتياطية
    }
}
```

## 📋 قائمة فحص الصيانة

### يومياً ✅
- [ ] فحص مؤشرات السلامة
- [ ] مراجعة سجل المراجعة
- [ ] التحقق من الأخطاء

### أسبوعياً ✅
- [ ] إنشاء نسخة احتياطية
- [ ] فحص سلامة البيانات
- [ ] مراجعة الأداء

### شهرياً ✅
- [ ] تنظيف سجل المراجعة
- [ ] مراجعة المستخدمين
- [ ] تحليل الإحصائيات
- [ ] تحديث النظام

### عند الحاجة ⚠️
- [ ] التعامل مع الطوارئ
- [ ] استعادة البيانات
- [ ] إجراءات الأمان

## 📞 جهات الاتصال للدعم

**الدعم التقني**: EAGLE.CO FOR SOFTWARE DEVELOPMENT
**الطوارئ**: متوفر 24/7
**التحديثات**: تحقق من الموقع الرسمي

---

**تذكر**: الصيانة الدورية تضمن استمرارية وأمان النظام
