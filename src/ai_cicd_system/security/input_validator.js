/**
 * Input Validation and Sanitization Service
 * Prevents injection attacks, validates data integrity, and sanitizes inputs
 */

import { EventEmitter } from 'events';
import { AuditLogger } from './audit_logger.js';

export class InputValidator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxStringLength: config.maxStringLength || 10000,
            maxArrayLength: config.maxArrayLength || 1000,
            maxObjectDepth: config.maxObjectDepth || 10,
            allowedFileTypes: config.allowedFileTypes || ['.txt', '.json', '.yaml', '.yml', '.md'],
            maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
            strictMode: config.strictMode || true,
            logViolations: config.logViolations !== false,
            ...config
        };

        this.auditLogger = new AuditLogger();
        
        // Common attack patterns
        this.sqlInjectionPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
            /(;|\-\-|\#|\/\*|\*\/)/g,
            /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
            /(\'\s*(OR|AND)\s*\'\w*\'\s*=\s*\'\w*)/gi
        ];

        this.xssPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<\s*\w+[^>]*\s+on\w+\s*=/gi,
            /eval\s*\(/gi,
            /expression\s*\(/gi
        ];

        this.commandInjectionPatterns = [
            /[;&|`$(){}[\]]/g,
            /\b(rm|del|format|shutdown|reboot|kill|ps|ls|cat|grep|find|chmod|chown)\b/gi,
            /\.\.\//g,
            /\/etc\/passwd/gi,
            /\/proc\//gi
        ];

        this.pathTraversalPatterns = [
            /\.\.\//g,
            /\.\.\\\\g,
            /%2e%2e%2f/gi,
            /%2e%2e%5c/gi,
            /\.\.%2f/gi,
            /\.\.%5c/gi
        ];

        // Validation schemas
        this.schemas = new Map();
        this.initializeDefaultSchemas();
    }

    /**
     * Initialize default validation schemas
     */
    initializeDefaultSchemas() {
        // User input schema
        this.schemas.set('user', {
            username: { type: 'string', minLength: 3, maxLength: 50, pattern: /^[a-zA-Z0-9_-]+$/ },
            email: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
            password: { type: 'string', minLength: 8, maxLength: 128 },
            firstName: { type: 'string', maxLength: 50, pattern: /^[a-zA-Z\s'-]+$/ },
            lastName: { type: 'string', maxLength: 50, pattern: /^[a-zA-Z\s'-]+$/ }
        });

        // Task input schema
        this.schemas.set('task', {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 5000 },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
            tags: { type: 'array', maxLength: 20, itemType: 'string', itemMaxLength: 50 }
        });

        // API input schema
        this.schemas.set('api', {
            endpoint: { type: 'string', pattern: /^\/[a-zA-Z0-9\/_-]*$/ },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
            headers: { type: 'object', maxDepth: 2 },
            queryParams: { type: 'object', maxDepth: 1 }
        });

        // File upload schema
        this.schemas.set('file', {
            filename: { type: 'string', maxLength: 255, pattern: /^[a-zA-Z0-9._-]+$/ },
            mimetype: { type: 'string', pattern: /^[a-zA-Z0-9]+\/[a-zA-Z0-9.-]+$/ },
            size: { type: 'number', min: 0, max: this.config.maxFileSize }
        });
    }

    /**
     * Validate input against schema
     */
    async validateInput(input, schemaName, context = {}) {
        try {
            const schema = this.schemas.get(schemaName);
            if (!schema) {
                throw new Error(`Schema '${schemaName}' not found`);
            }

            const violations = [];
            const sanitized = {};

            for (const [field, rules] of Object.entries(schema)) {
                const value = input[field];
                const fieldViolations = await this.validateField(field, value, rules, context);
                
                if (fieldViolations.length > 0) {
                    violations.push(...fieldViolations);
                } else {
                    sanitized[field] = await this.sanitizeValue(value, rules);
                }
            }

            // Check for unexpected fields in strict mode
            if (this.config.strictMode) {
                for (const field of Object.keys(input)) {
                    if (!schema[field]) {
                        violations.push({
                            field,
                            violation: 'unexpected_field',
                            message: `Unexpected field '${field}' in input`
                        });
                    }
                }
            }

            if (violations.length > 0) {
                if (this.config.logViolations) {
                    await this.auditLogger.logSecurityEvent('INPUT_VALIDATION_FAILED', {
                        schemaName,
                        violations,
                        input: this.sanitizeForLogging(input),
                        context
                    });
                }

                this.emit('validationFailed', { schemaName, violations, context });
                throw new ValidationError('Input validation failed', violations);
            }

            return sanitized;

        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }

            await this.auditLogger.logSecurityEvent('INPUT_VALIDATION_ERROR', {
                schemaName,
                error: error.message,
                context
            });

            throw new Error(`Validation error: ${error.message}`);
        }
    }

    /**
     * Validate individual field
     */
    async validateField(fieldName, value, rules, context) {
        const violations = [];

        // Check required fields
        if (rules.required && (value === undefined || value === null || value === '')) {
            violations.push({
                field: fieldName,
                violation: 'required',
                message: `Field '${fieldName}' is required`
            });
            return violations;
        }

        // Skip validation for optional empty fields
        if (value === undefined || value === null || value === '') {
            return violations;
        }

        // Type validation
        if (rules.type && !this.validateType(value, rules.type)) {
            violations.push({
                field: fieldName,
                violation: 'type',
                message: `Field '${fieldName}' must be of type ${rules.type}`
            });
            return violations;
        }

        // String validations
        if (rules.type === 'string' && typeof value === 'string') {
            if (rules.minLength && value.length < rules.minLength) {
                violations.push({
                    field: fieldName,
                    violation: 'min_length',
                    message: `Field '${fieldName}' must be at least ${rules.minLength} characters`
                });
            }

            if (rules.maxLength && value.length > rules.maxLength) {
                violations.push({
                    field: fieldName,
                    violation: 'max_length',
                    message: `Field '${fieldName}' must be at most ${rules.maxLength} characters`
                });
            }

            if (rules.pattern && !rules.pattern.test(value)) {
                violations.push({
                    field: fieldName,
                    violation: 'pattern',
                    message: `Field '${fieldName}' does not match required pattern`
                });
            }

            if (rules.enum && !rules.enum.includes(value)) {
                violations.push({
                    field: fieldName,
                    violation: 'enum',
                    message: `Field '${fieldName}' must be one of: ${rules.enum.join(', ')}`
                });
            }

            // Security validations
            const securityViolations = await this.validateSecurity(fieldName, value, context);
            violations.push(...securityViolations);
        }

        // Number validations
        if (rules.type === 'number' && typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
                violations.push({
                    field: fieldName,
                    violation: 'min_value',
                    message: `Field '${fieldName}' must be at least ${rules.min}`
                });
            }

            if (rules.max !== undefined && value > rules.max) {
                violations.push({
                    field: fieldName,
                    violation: 'max_value',
                    message: `Field '${fieldName}' must be at most ${rules.max}`
                });
            }
        }

        // Array validations
        if (rules.type === 'array' && Array.isArray(value)) {
            if (rules.maxLength && value.length > rules.maxLength) {
                violations.push({
                    field: fieldName,
                    violation: 'max_array_length',
                    message: `Field '${fieldName}' must have at most ${rules.maxLength} items`
                });
            }

            // Validate array items
            if (rules.itemType) {
                for (let i = 0; i < value.length; i++) {
                    const item = value[i];
                    if (!this.validateType(item, rules.itemType)) {
                        violations.push({
                            field: `${fieldName}[${i}]`,
                            violation: 'item_type',
                            message: `Item at index ${i} in '${fieldName}' must be of type ${rules.itemType}`
                        });
                    }

                    if (rules.itemMaxLength && typeof item === 'string' && item.length > rules.itemMaxLength) {
                        violations.push({
                            field: `${fieldName}[${i}]`,
                            violation: 'item_max_length',
                            message: `Item at index ${i} in '${fieldName}' must be at most ${rules.itemMaxLength} characters`
                        });
                    }
                }
            }
        }

        // Object validations
        if (rules.type === 'object' && typeof value === 'object' && value !== null) {
            const depth = this.getObjectDepth(value);
            if (rules.maxDepth && depth > rules.maxDepth) {
                violations.push({
                    field: fieldName,
                    violation: 'max_object_depth',
                    message: `Field '${fieldName}' exceeds maximum object depth of ${rules.maxDepth}`
                });
            }
        }

        return violations;
    }

    /**
     * Validate security threats
     */
    async validateSecurity(fieldName, value, context) {
        const violations = [];

        // SQL Injection detection
        if (this.detectSQLInjection(value)) {
            violations.push({
                field: fieldName,
                violation: 'sql_injection',
                message: `Potential SQL injection detected in field '${fieldName}'`,
                severity: 'high'
            });

            await this.auditLogger.logSecurityEvent('SQL_INJECTION_ATTEMPT', {
                field: fieldName,
                value: this.sanitizeForLogging(value),
                context
            });
        }

        // XSS detection
        if (this.detectXSS(value)) {
            violations.push({
                field: fieldName,
                violation: 'xss',
                message: `Potential XSS attack detected in field '${fieldName}'`,
                severity: 'high'
            });

            await this.auditLogger.logSecurityEvent('XSS_ATTEMPT', {
                field: fieldName,
                value: this.sanitizeForLogging(value),
                context
            });
        }

        // Command injection detection
        if (this.detectCommandInjection(value)) {
            violations.push({
                field: fieldName,
                violation: 'command_injection',
                message: `Potential command injection detected in field '${fieldName}'`,
                severity: 'critical'
            });

            await this.auditLogger.logSecurityEvent('COMMAND_INJECTION_ATTEMPT', {
                field: fieldName,
                value: this.sanitizeForLogging(value),
                context
            });
        }

        // Path traversal detection
        if (this.detectPathTraversal(value)) {
            violations.push({
                field: fieldName,
                violation: 'path_traversal',
                message: `Potential path traversal attack detected in field '${fieldName}'`,
                severity: 'high'
            });

            await this.auditLogger.logSecurityEvent('PATH_TRAVERSAL_ATTEMPT', {
                field: fieldName,
                value: this.sanitizeForLogging(value),
                context
            });
        }

        return violations;
    }

    /**
     * Detect SQL injection patterns
     */
    detectSQLInjection(value) {
        if (typeof value !== 'string') return false;
        return this.sqlInjectionPatterns.some(pattern => pattern.test(value));
    }

    /**
     * Detect XSS patterns
     */
    detectXSS(value) {
        if (typeof value !== 'string') return false;
        return this.xssPatterns.some(pattern => pattern.test(value));
    }

    /**
     * Detect command injection patterns
     */
    detectCommandInjection(value) {
        if (typeof value !== 'string') return false;
        return this.commandInjectionPatterns.some(pattern => pattern.test(value));
    }

    /**
     * Detect path traversal patterns
     */
    detectPathTraversal(value) {
        if (typeof value !== 'string') return false;
        return this.pathTraversalPatterns.some(pattern => pattern.test(value));
    }

    /**
     * Validate data type
     */
    validateType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            case 'date':
                return value instanceof Date || !isNaN(Date.parse(value));
            default:
                return true;
        }
    }

    /**
     * Sanitize value based on rules
     */
    async sanitizeValue(value, rules) {
        if (value === undefined || value === null) {
            return value;
        }

        switch (rules.type) {
            case 'string':
                return this.sanitizeString(value);
            case 'number':
                return this.sanitizeNumber(value);
            case 'array':
                return this.sanitizeArray(value, rules);
            case 'object':
                return this.sanitizeObject(value);
            default:
                return value;
        }
    }

    /**
     * Sanitize string value
     */
    sanitizeString(value) {
        if (typeof value !== 'string') return value;

        // Remove null bytes
        let sanitized = value.replace(/\0/g, '');
        
        // Trim whitespace
        sanitized = sanitized.trim();
        
        // Limit length
        if (sanitized.length > this.config.maxStringLength) {
            sanitized = sanitized.substring(0, this.config.maxStringLength);
        }

        return sanitized;
    }

    /**
     * Sanitize number value
     */
    sanitizeNumber(value) {
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return typeof value === 'number' ? value : 0;
    }

    /**
     * Sanitize array value
     */
    sanitizeArray(value, rules) {
        if (!Array.isArray(value)) return [];

        let sanitized = value.slice(0, this.config.maxArrayLength);
        
        if (rules.itemType === 'string') {
            sanitized = sanitized.map(item => this.sanitizeString(item));
        }

        return sanitized;
    }

    /**
     * Sanitize object value
     */
    sanitizeObject(value) {
        if (typeof value !== 'object' || value === null) return {};

        const sanitized = {};
        const depth = this.getObjectDepth(value);
        
        if (depth > this.config.maxObjectDepth) {
            return {}; // Return empty object if too deep
        }

        for (const [key, val] of Object.entries(value)) {
            const sanitizedKey = this.sanitizeString(key);
            if (typeof val === 'string') {
                sanitized[sanitizedKey] = this.sanitizeString(val);
            } else if (typeof val === 'object' && val !== null) {
                sanitized[sanitizedKey] = this.sanitizeObject(val);
            } else {
                sanitized[sanitizedKey] = val;
            }
        }

        return sanitized;
    }

    /**
     * Get object depth
     */
    getObjectDepth(obj, depth = 0) {
        if (typeof obj !== 'object' || obj === null) return depth;

        let maxDepth = depth;
        for (const value of Object.values(obj)) {
            if (typeof value === 'object' && value !== null) {
                const currentDepth = this.getObjectDepth(value, depth + 1);
                maxDepth = Math.max(maxDepth, currentDepth);
            }
        }

        return maxDepth;
    }

    /**
     * Validate file upload
     */
    async validateFile(file, context = {}) {
        const violations = [];

        // Check file size
        if (file.size > this.config.maxFileSize) {
            violations.push({
                field: 'file',
                violation: 'file_size',
                message: `File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`
            });
        }

        // Check file extension
        const extension = this.getFileExtension(file.originalname || file.filename);
        if (!this.config.allowedFileTypes.includes(extension)) {
            violations.push({
                field: 'file',
                violation: 'file_type',
                message: `File type '${extension}' is not allowed`
            });
        }

        // Check filename for security issues
        const filename = file.originalname || file.filename;
        if (this.detectPathTraversal(filename)) {
            violations.push({
                field: 'filename',
                violation: 'path_traversal',
                message: 'Filename contains path traversal patterns',
                severity: 'high'
            });
        }

        if (violations.length > 0) {
            await this.auditLogger.logSecurityEvent('FILE_VALIDATION_FAILED', {
                filename,
                size: file.size,
                mimetype: file.mimetype,
                violations,
                context
            });

            throw new ValidationError('File validation failed', violations);
        }

        return true;
    }

    /**
     * Get file extension
     */
    getFileExtension(filename) {
        return filename.toLowerCase().substring(filename.lastIndexOf('.'));
    }

    /**
     * Sanitize data for logging (remove sensitive information)
     */
    sanitizeForLogging(data) {
        if (typeof data === 'string') {
            // Truncate long strings and mask potential sensitive data
            let sanitized = data.length > 100 ? data.substring(0, 100) + '...' : data;
            
            // Mask potential passwords, tokens, etc.
            sanitized = sanitized.replace(/password|token|secret|key/gi, '[REDACTED]');
            
            return sanitized;
        }

        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                if (/password|token|secret|key/i.test(key)) {
                    sanitized[key] = '[REDACTED]';
                } else {
                    sanitized[key] = this.sanitizeForLogging(value);
                }
            }
            return sanitized;
        }

        return data;
    }

    /**
     * Add custom validation schema
     */
    addSchema(name, schema) {
        this.schemas.set(name, schema);
    }

    /**
     * Remove validation schema
     */
    removeSchema(name) {
        return this.schemas.delete(name);
    }

    /**
     * Get validation schema
     */
    getSchema(name) {
        return this.schemas.get(name);
    }

    /**
     * List all schemas
     */
    listSchemas() {
        return Array.from(this.schemas.keys());
    }
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
    constructor(message, violations = []) {
        super(message);
        this.name = 'ValidationError';
        this.violations = violations;
    }
}

export default InputValidator;

