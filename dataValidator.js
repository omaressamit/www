// dataValidator.js - التحقق من صحة البيانات وإدارة الأخطاء
// Data Validation and Error Management System

class DataValidator {
    constructor() {
        this.validationRules = this.initializeValidationRules();
        this.errorMessages = this.initializeErrorMessages();
    }

    // تهيئة قواعد التحقق
    initializeValidationRules() {
        return {
            user: {
                username: {
                    required: true,
                    minLength: 3,
                    maxLength: 20,
                    pattern: /^[a-zA-Z0-9_]+$/,
                    unique: true
                },
                password: {
                    required: true,
                    minLength: 6,
                    maxLength: 50
                },
                role: {
                    required: true,
                    allowedValues: ['admin', 'user']
                }
            },
            branch: {
                name: {
                    required: true,
                    minLength: 2,
                    maxLength: 50,
                    unique: true
                },
                users: {
                    required: true,
                    minItems: 1
                }
            },
            product: {
                name: {
                    required: true,
                    minLength: 2,
                    maxLength: 100
                },
                quantity: {
                    required: true,
                    type: 'number',
                    min: 0
                },
                purchasePrice: {
                    required: true,
                    type: 'number',
                    min: 0
                }
            },
            sale: {
                productName: {
                    required: true,
                    minLength: 2
                },
                quantity: {
                    required: true,
                    type: 'number',
                    min: 1
                },
                price: {
                    required: true,
                    type: 'number',
                    min: 0.01
                },
                user: {
                    required: true,
                    minLength: 3
                },
                date: {
                    required: true,
                    type: 'date'
                }
            },
            expense: {
                expenseType: {
                    required: true,
                    minLength: 2,
                    maxLength: 50
                },
                amount: {
                    required: true,
                    type: 'number',
                    min: 0.01
                },
                description: {
                    maxLength: 200
                },
                user: {
                    required: true,
                    minLength: 3
                },
                date: {
                    required: true,
                    type: 'date'
                }
            }
        };
    }

    // تهيئة رسائل الأخطاء
    initializeErrorMessages() {
        return {
            required: 'هذا الحقل مطلوب',
            minLength: 'يجب أن يكون الحد الأدنى {min} أحرف',
            maxLength: 'يجب أن لا يتجاوز {max} حرف',
            min: 'يجب أن تكون القيمة أكبر من أو تساوي {min}',
            max: 'يجب أن تكون القيمة أقل من أو تساوي {max}',
            pattern: 'تنسيق البيانات غير صحيح',
            unique: 'هذه القيمة موجودة بالفعل',
            type: 'نوع البيانات غير صحيح',
            allowedValues: 'القيمة غير مسموحة',
            minItems: 'يجب اختيار عنصر واحد على الأقل',
            date: 'تاريخ غير صحيح'
        };
    }

    // التحقق من صحة البيانات
    validate(data, type) {
        const rules = this.validationRules[type];
        if (!rules) {
            throw new Error(`نوع البيانات '${type}' غير مدعوم`);
        }

        const errors = [];

        for (const field in rules) {
            const fieldRules = rules[field];
            const value = data[field];

            // التحقق من الحقول المطلوبة
            if (fieldRules.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: field,
                    message: this.errorMessages.required
                });
                continue;
            }

            // إذا كان الحقل فارغ وغير مطلوب، تخطي باقي التحققات
            if (!fieldRules.required && (value === undefined || value === null || value === '')) {
                continue;
            }

            // التحقق من نوع البيانات
            if (fieldRules.type) {
                if (!this.validateType(value, fieldRules.type)) {
                    errors.push({
                        field: field,
                        message: this.errorMessages.type
                    });
                    continue;
                }
            }

            // التحقق من الحد الأدنى للطول
            if (fieldRules.minLength && value.toString().length < fieldRules.minLength) {
                errors.push({
                    field: field,
                    message: this.errorMessages.minLength.replace('{min}', fieldRules.minLength)
                });
            }

            // التحقق من الحد الأقصى للطول
            if (fieldRules.maxLength && value.toString().length > fieldRules.maxLength) {
                errors.push({
                    field: field,
                    message: this.errorMessages.maxLength.replace('{max}', fieldRules.maxLength)
                });
            }

            // التحقق من الحد الأدنى للقيمة
            if (fieldRules.min !== undefined && parseFloat(value) < fieldRules.min) {
                errors.push({
                    field: field,
                    message: this.errorMessages.min.replace('{min}', fieldRules.min)
                });
            }

            // التحقق من الحد الأقصى للقيمة
            if (fieldRules.max !== undefined && parseFloat(value) > fieldRules.max) {
                errors.push({
                    field: field,
                    message: this.errorMessages.max.replace('{max}', fieldRules.max)
                });
            }

            // التحقق من النمط
            if (fieldRules.pattern && !fieldRules.pattern.test(value)) {
                errors.push({
                    field: field,
                    message: this.errorMessages.pattern
                });
            }

            // التحقق من القيم المسموحة
            if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(value)) {
                errors.push({
                    field: field,
                    message: this.errorMessages.allowedValues
                });
            }

            // التحقق من الحد الأدنى للعناصر (للمصفوفات)
            if (fieldRules.minItems && Array.isArray(value) && value.length < fieldRules.minItems) {
                errors.push({
                    field: field,
                    message: this.errorMessages.minItems
                });
            }

            // التحقق من التفرد
            if (fieldRules.unique && this.checkDuplicate(value, field, type, data)) {
                errors.push({
                    field: field,
                    message: this.errorMessages.unique
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // التحقق من نوع البيانات
    validateType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return !isNaN(parseFloat(value)) && isFinite(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'date':
                return !isNaN(Date.parse(value));
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true;
        }
    }

    // التحقق من التكرار
    checkDuplicate(value, field, type, currentData) {
        switch (type) {
            case 'user':
                if (field === 'username') {
                    return users.some(user => 
                        user.username === value && 
                        (!currentData.id || user.id !== currentData.id)
                    );
                }
                break;
            case 'branch':
                if (field === 'name') {
                    return Object.values(branchMetadata).some(branch => 
                        branch.name === value && 
                        (!currentData.id || branch.id !== currentData.id)
                    );
                }
                break;
            case 'product':
                if (field === 'name' && currentData.branchId) {
                    const branchProducts = branchData[currentData.branchId]?.products || [];
                    return branchProducts.some(product => 
                        product.name === value && 
                        (!currentData.index || branchProducts.indexOf(product) !== currentData.index)
                    );
                }
                break;
        }
        return false;
    }

    // تنظيف البيانات
    sanitizeData(data, type) {
        const sanitized = { ...data };
        const rules = this.validationRules[type];

        if (!rules) return sanitized;

        for (const field in sanitized) {
            if (typeof sanitized[field] === 'string') {
                // إزالة المسافات الزائدة
                sanitized[field] = sanitized[field].trim();
                
                // تحويل إلى رقم إذا كان مطلوب
                if (rules[field] && rules[field].type === 'number') {
                    sanitized[field] = parseFloat(sanitized[field]);
                }
            }
        }

        return sanitized;
    }

    // التحقق من سلامة قاعدة البيانات
    async validateDatabaseIntegrity() {
        const issues = [];

        try {
            // التحقق من وجود المستخدمين
            if (!users || users.length === 0) {
                issues.push({
                    type: 'warning',
                    message: 'لا يوجد مستخدمين في النظام'
                });
            }

            // التحقق من وجود فروع
            if (!branchMetadata || Object.keys(branchMetadata).length === 0) {
                issues.push({
                    type: 'warning',
                    message: 'لا يوجد فروع في النظام'
                });
            }

            // التحقق من تطابق بيانات الفروع
            for (const branchId in branchMetadata) {
                if (!branchData[branchId]) {
                    issues.push({
                        type: 'error',
                        message: `بيانات الفرع ${branchMetadata[branchId].name} مفقودة`
                    });
                }
            }

            // التحقق من صحة المستخدمين في الفروع
            for (const branchId in branchMetadata) {
                const branchUsers = branchMetadata[branchId].users || [];
                for (const username of branchUsers) {
                    const userExists = users.some(user => user.username === username);
                    if (!userExists) {
                        issues.push({
                            type: 'warning',
                            message: `المستخدم ${username} في الفرع ${branchMetadata[branchId].name} غير موجود في قائمة المستخدمين`
                        });
                    }
                }
            }

            return {
                isHealthy: issues.filter(issue => issue.type === 'error').length === 0,
                issues: issues
            };

        } catch (error) {
            return {
                isHealthy: false,
                issues: [{
                    type: 'error',
                    message: `خطأ في فحص سلامة قاعدة البيانات: ${error.message}`
                }]
            };
        }
    }
}

// إنشاء مثيل من مدقق البيانات
const dataValidator = new DataValidator();
