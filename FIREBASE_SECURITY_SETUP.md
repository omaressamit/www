# دليل تطبيق قواعد الأمان في Firebase
## Firebase Security Rules Implementation Guide

## 📋 خطوات تطبيق قواعد الأمان

### 1. **الوصول إلى Firebase Console**
1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. اختر مشروعك
3. من القائمة الجانبية، اختر "Realtime Database"
4. اختر تبويب "Rules"

### 2. **تطبيق القواعد الجديدة**
1. انسخ محتوى ملف `firebase-security-rules.json`
2. الصق المحتوى في محرر القواعد
3. اضغط "Publish" لتطبيق القواعد

### 3. **التحقق من تطبيق القواعد**
```javascript
// اختبار في وحدة التحكم
// يجب أن تفشل هذه العملية إذا كانت القواعد مطبقة بشكل صحيح
firebase.database().ref('/users').set({test: "unauthorized"});
```

## 🔐 شرح قواعد الأمان المطبقة

### 1. **قواعد عامة**
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
- **المعنى**: يتطلب تسجيل دخول للقراءة والكتابة
- **الهدف**: منع الوصول غير المصرح به

### 2. **قواعد المستخدمين**
```json
"users": {
  ".indexOn": ["username", "role", "isActive"],
  "$userId": {
    ".validate": "newData.hasChildren(['username', 'password', 'role', 'createdAt', 'isActive'])"
  }
}
```
- **الفهرسة**: تسريع البحث بالاسم والدور والحالة
- **التحقق**: ضمان وجود الحقول المطلوبة

### 3. **قواعد الفروع**
```json
"branchMetadata": {
  ".indexOn": ["name", "isActive", "createdAt"],
  "$branchId": {
    ".validate": "newData.hasChildren(['name', 'users', 'createdAt', 'isActive'])"
  }
}
```
- **الفهرسة**: تسريع البحث والفلترة
- **التحقق**: ضمان البنية الصحيحة للبيانات

### 4. **قواعد بيانات الفروع**
```json
"branchData": {
  "$branchId": {
    ".indexOn": ["lastUpdated"],
    "products": {
      ".indexOn": ["name", "quantity"]
    },
    "sales": {
      ".indexOn": ["date", "user", "productName"]
    }
  }
}
```
- **الفهرسة المتعددة**: تسريع الاستعلامات المختلفة
- **التنظيم**: فصل البيانات حسب الفرع

## 📊 فوائد الفهرسة المطبقة

### 1. **استعلامات المستخدمين**
```javascript
// البحث بالاسم - سريع بسبب الفهرسة
database.ref('users').orderByChild('username').equalTo('admin');

// البحث بالدور - سريع بسبب الفهرسة
database.ref('users').orderByChild('role').equalTo('admin');
```

### 2. **استعلامات المبيعات**
```javascript
// البحث بالتاريخ - سريع بسبب الفهرسة
database.ref('branchData/branch1/sales').orderByChild('date').startAt('2024-01-01');

// البحث بالمستخدم - سريع بسبب الفهرسة
database.ref('branchData/branch1/sales').orderByChild('user').equalTo('user1');
```

### 3. **استعلامات الأصناف**
```javascript
// البحث بالاسم - سريع بسبب الفهرسة
database.ref('branchData/branch1/products').orderByChild('name').equalTo('صنف1');

// ترتيب بالكمية - سريع بسبب الفهرسة
database.ref('branchData/branch1/products').orderByChild('quantity');
```

## ⚠️ تحذيرات مهمة

### 1. **قبل تطبيق القواعد**
- **انشئ نسخة احتياطية** من البيانات الحالية
- **اختبر القواعد** في بيئة تطوير أولاً
- **تأكد من صحة البيانات** الموجودة

### 2. **بعد تطبيق القواعد**
- **اختبر جميع الوظائف** للتأكد من عملها
- **راقب الأخطاء** في وحدة التحكم
- **تحقق من الأداء** للاستعلامات

### 3. **في حالة المشاكل**
```json
// قواعد طوارئ - استخدم فقط في حالة الضرورة
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## 🔧 تخصيص القواعد

### 1. **إضافة قواعد مخصصة**
```json
"customData": {
  ".read": "auth.uid === 'admin_user_id'",
  ".write": "auth.uid === 'admin_user_id'"
}
```

### 2. **قواعد حسب الوقت**
```json
"timeBasedData": {
  ".write": "now < timestamp + 86400000" // 24 ساعة
}
```

### 3. **قواعد حسب حجم البيانات**
```json
"limitedData": {
  ".validate": "newData.val().length < 1000"
}
```

## 📈 مراقبة الأداء

### 1. **مراقبة الاستعلامات**
- استخدم Firebase Performance Monitoring
- راقب أوقات الاستجابة
- تحقق من استخدام الفهارس

### 2. **تحليل الاستخدام**
```javascript
// تفعيل تسجيل الاستعلامات
firebase.database.enableLogging(true);
```

### 3. **تحسين الأداء**
- استخدم الفهارس المناسبة
- قلل من حجم البيانات المنقولة
- استخدم التخزين المؤقت

## 🛠️ استكشاف الأخطاء

### 1. **خطأ "Permission Denied"**
```javascript
// السبب: قواعد الأمان ترفض العملية
// الحل: تحقق من تسجيل الدخول وصلاحيات المستخدم
```

### 2. **خطأ "Index not defined"**
```javascript
// السبب: محاولة استعلام بدون فهرس
// الحل: أضف الفهرس المطلوب في القواعد
```

### 3. **بطء في الاستعلامات**
```javascript
// السبب: عدم وجود فهارس مناسبة
// الحل: أضف فهارس للحقول المستخدمة في الاستعلامات
```

## 📝 أفضل الممارسات

### 1. **تصميم القواعد**
- ابدأ بقواعد صارمة وخفف تدريجياً
- استخدم التحقق من البيانات
- أضف فهارس للحقول المهمة

### 2. **الاختبار**
- اختبر جميع السيناريوهات
- استخدم بيانات تجريبية
- راقب الأداء باستمرار

### 3. **الصيانة**
- راجع القواعد دورياً
- حدث الفهارس حسب الحاجة
- راقب استخدام قاعدة البيانات

## 🔄 تحديث القواعد

### 1. **التحديث التدريجي**
```json
// المرحلة 1: إضافة قواعد جديدة
"newFeature": {
  ".read": "auth != null",
  ".write": "auth != null"
}

// المرحلة 2: تشديد القواعد الموجودة
"existingFeature": {
  ".read": "auth.uid === data.child('owner').val()",
  ".write": "auth.uid === data.child('owner').val()"
}
```

### 2. **اختبار التحديثات**
- استخدم Firebase Emulator
- اختبر مع بيانات حقيقية
- راقب الأخطاء بعد النشر

---

**ملاحظة**: هذه القواعد مصممة خصيصاً لنظام إدارة الفروع وقد تحتاج تعديل حسب احتياجاتك الخاصة.
