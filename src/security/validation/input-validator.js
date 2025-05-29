/**
 * Unified Input Validator
 * 
 * Comprehensive input validation and sanitization service.
 * Protects against injection attacks, XSS, and malformed data.
 */

import { EventEmitter } from 'events';

export class InputValidator extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = {
            enabled: true,
            strictMode: true,
            sanitization: {
                enabled: true,
                htmlEntities: true,
                sqlInjection: true,
                xss: true
            },
            limits: {
                maxStringLength: 10000,
                maxArrayLength: 1000,
                maxObjectDepth: 10,
                maxFileSize: 10 * 1024 * 1024 // 10MB
            },
            patterns: {
                email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                phone: /^\+?[\d\s\-\(\)]+$/,
                alphanumeric: /^[a-zA-Z0-9]+$/,
                uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
                url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
                ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
                ipv6: /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
            },
            ...config
        };
        
        // Dangerous patterns to detect
        this.dangerousPatterns = {
            sqlInjection: [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
                /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
                /(;|\-\-|\#|\/\*|\*\/)/g,
                /(\b(INFORMATION_SCHEMA|SYSOBJECTS|SYSCOLUMNS)\b)/gi
            ],
            xss: [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /<img[^>]+src[^>]*>/gi,
                /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
            ],
            pathTraversal: [
                /\.\.\//g,
                /\.\.\\\\g,
                /%2e%2e%2f/gi,
                /%2e%2e%5c/gi
            ],
            commandInjection: [
                /(\||&|;|`|\$\(|\${)/g,
                /\b(cat|ls|pwd|whoami|id|uname|ps|netstat|ifconfig|ping|wget|curl|nc|telnet|ssh|ftp)\b/gi
            ]
        };
        
        this.initialized = false;
    }

    /**
     * Initialize input validator
     */
    async initialize() {
        try {
            this.initialized = true;
            this.emit('initialized');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Validate input data
     */
    async validate(data, options = {}) {
        if (!this.config.enabled) {
            return { valid: true, sanitized: data };
        }

        try {
            const context = options.context || 'general';
            const errors = [];
            let sanitized = data;

            // Basic structure validation
            const structureValidation = this._validateStructure(data, options);
            if (!structureValidation.valid) {
                errors.push(...structureValidation.errors);
            }

            // Security validation
            const securityValidation = this._validateSecurity(data, options);
            if (!securityValidation.valid) {
                errors.push(...securityValidation.errors);
            }

            // Type validation
            const typeValidation = this._validateTypes(data, options);
            if (!typeValidation.valid) {
                errors.push(...typeValidation.errors);
            }

            // Sanitization
            if (this.config.sanitization.enabled && errors.length === 0) {
                sanitized = this._sanitizeData(data, options);
            }

            const result = {
                valid: errors.length === 0,
                errors,
                sanitized,
                context
            };

            // Emit validation event
            this.emit('validation', {
                valid: result.valid,
                context,
                errorCount: errors.length
            });

            return result;

        } catch (error) {
            this.emit('validationError', { error: error.message, context: options.context });
            return {
                valid: false,
                errors: [{ message: 'Validation failed', code: 'VALIDATION_ERROR' }],
                sanitized: data
            };
        }
    }

    /**
     * Validate data structure
     */
    _validateStructure(data, options) {
        const errors = [];

        try {
            // Check object depth
            const depth = this._getObjectDepth(data);
            if (depth > this.config.limits.maxObjectDepth) {
                errors.push({
                    message: `Object depth exceeds maximum of ${this.config.limits.maxObjectDepth}`,
                    code: 'MAX_DEPTH_EXCEEDED',
                    value: depth
                });
            }

            // Check array lengths
            this._checkArrayLengths(data, errors);

            // Check string lengths
            this._checkStringLengths(data, errors);

        } catch (error) {
            errors.push({
                message: 'Structure validation failed',
                code: 'STRUCTURE_ERROR',
                details: error.message
            });
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate security aspects
     */
    _validateSecurity(data, options) {
        const errors = [];

        try {
            // Check for SQL injection patterns
            if (this.config.sanitization.sqlInjection) {
                const sqlErrors = this._checkSQLInjection(data);
                errors.push(...sqlErrors);
            }

            // Check for XSS patterns
            if (this.config.sanitization.xss) {
                const xssErrors = this._checkXSS(data);
                errors.push(...xssErrors);
            }

            // Check for path traversal
            const pathErrors = this._checkPathTraversal(data);
            errors.push(...pathErrors);

            // Check for command injection
            const cmdErrors = this._checkCommandInjection(data);
            errors.push(...cmdErrors);

        } catch (error) {
            errors.push({
                message: 'Security validation failed',
                code: 'SECURITY_ERROR',
                details: error.message
            });
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate data types
     */
    _validateTypes(data, options) {
        const errors = [];
        const schema = options.schema;

        if (!schema) {
            return { valid: true, errors };
        }

        try {
            this._validateAgainstSchema(data, schema, errors, '');
        } catch (error) {
            errors.push({
                message: 'Type validation failed',
                code: 'TYPE_ERROR',
                details: error.message
            });
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate against schema
     */
    _validateAgainstSchema(data, schema, errors, path) {
        if (schema.type) {
            if (!this._isValidType(data, schema.type)) {
                errors.push({
                    message: `Invalid type at ${path || 'root'}. Expected ${schema.type}, got ${typeof data}`,
                    code: 'INVALID_TYPE',
                    path,
                    expected: schema.type,
                    actual: typeof data
                });
                return;
            }
        }

        if (schema.pattern && typeof data === 'string') {
            const pattern = this.config.patterns[schema.pattern] || new RegExp(schema.pattern);
            if (!pattern.test(data)) {
                errors.push({
                    message: `Value at ${path || 'root'} does not match required pattern`,
                    code: 'PATTERN_MISMATCH',
                    path,
                    pattern: schema.pattern
                });
            }
        }

        if (schema.minLength && typeof data === 'string' && data.length < schema.minLength) {
            errors.push({
                message: `String at ${path || 'root'} is too short. Minimum length: ${schema.minLength}`,
                code: 'MIN_LENGTH',
                path,
                minLength: schema.minLength,
                actualLength: data.length
            });
        }

        if (schema.maxLength && typeof data === 'string' && data.length > schema.maxLength) {
            errors.push({
                message: `String at ${path || 'root'} is too long. Maximum length: ${schema.maxLength}`,
                code: 'MAX_LENGTH',
                path,
                maxLength: schema.maxLength,
                actualLength: data.length
            });
        }

        if (schema.properties && typeof data === 'object' && data !== null) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (data.hasOwnProperty(key)) {
                    this._validateAgainstSchema(data[key], propSchema, errors, path ? `${path}.${key}` : key);
                } else if (propSchema.required) {
                    errors.push({
                        message: `Required property ${key} is missing at ${path || 'root'}`,
                        code: 'MISSING_REQUIRED',
                        path: path ? `${path}.${key}` : key
                    });
                }
            }
        }
    }

    /**
     * Check if value is valid type
     */
    _isValidType(value, expectedType) {
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
            case 'null':
                return value === null;
            case 'undefined':
                return value === undefined;
            default:
                return true;
        }
    }

    /**
     * Sanitize data
     */
    _sanitizeData(data, options) {
        if (typeof data === 'string') {
            return this._sanitizeString(data);
        } else if (Array.isArray(data)) {
            return data.map(item => this._sanitizeData(item, options));
        } else if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                sanitized[this._sanitizeString(key)] = this._sanitizeData(value, options);
            }
            return sanitized;
        }
        
        return data;
    }

    /**
     * Sanitize string
     */
    _sanitizeString(str) {
        if (typeof str !== 'string') {
            return str;
        }

        let sanitized = str;

        // HTML entity encoding
        if (this.config.sanitization.htmlEntities) {
            sanitized = sanitized
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
        }

        // Remove null bytes
        sanitized = sanitized.replace(/\0/g, '');

        // Normalize whitespace
        sanitized = sanitized.replace(/\s+/g, ' ').trim();

        return sanitized;
    }

    /**
     * Check SQL injection patterns
     */
    _checkSQLInjection(data) {
        const errors = [];
        const strings = this._extractStrings(data);

        for (const str of strings) {
            for (const pattern of this.dangerousPatterns.sqlInjection) {
                if (pattern.test(str)) {
                    errors.push({
                        message: 'Potential SQL injection detected',
                        code: 'SQL_INJECTION',
                        pattern: pattern.source,
                        value: str.substring(0, 100) // Truncate for logging
                    });
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Check XSS patterns
     */
    _checkXSS(data) {
        const errors = [];
        const strings = this._extractStrings(data);

        for (const str of strings) {
            for (const pattern of this.dangerousPatterns.xss) {
                if (pattern.test(str)) {
                    errors.push({
                        message: 'Potential XSS attack detected',
                        code: 'XSS_ATTACK',
                        pattern: pattern.source,
                        value: str.substring(0, 100)
                    });
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Check path traversal patterns
     */
    _checkPathTraversal(data) {
        const errors = [];
        const strings = this._extractStrings(data);

        for (const str of strings) {
            for (const pattern of this.dangerousPatterns.pathTraversal) {
                if (pattern.test(str)) {
                    errors.push({
                        message: 'Potential path traversal detected',
                        code: 'PATH_TRAVERSAL',
                        pattern: pattern.source,
                        value: str.substring(0, 100)
                    });
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Check command injection patterns
     */
    _checkCommandInjection(data) {
        const errors = [];
        const strings = this._extractStrings(data);

        for (const str of strings) {
            for (const pattern of this.dangerousPatterns.commandInjection) {
                if (pattern.test(str)) {
                    errors.push({
                        message: 'Potential command injection detected',
                        code: 'COMMAND_INJECTION',
                        pattern: pattern.source,
                        value: str.substring(0, 100)
                    });
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Extract all strings from data structure
     */
    _extractStrings(data, strings = []) {
        if (typeof data === 'string') {
            strings.push(data);
        } else if (Array.isArray(data)) {
            for (const item of data) {
                this._extractStrings(item, strings);
            }
        } else if (typeof data === 'object' && data !== null) {
            for (const value of Object.values(data)) {
                this._extractStrings(value, strings);
            }
        }
        
        return strings;
    }

    /**
     * Get object depth
     */
    _getObjectDepth(obj, depth = 0) {
        if (typeof obj !== 'object' || obj === null) {
            return depth;
        }

        let maxDepth = depth;
        
        if (Array.isArray(obj)) {
            for (const item of obj) {
                maxDepth = Math.max(maxDepth, this._getObjectDepth(item, depth + 1));
            }
        } else {
            for (const value of Object.values(obj)) {
                maxDepth = Math.max(maxDepth, this._getObjectDepth(value, depth + 1));
            }
        }
        
        return maxDepth;
    }

    /**
     * Check array lengths
     */
    _checkArrayLengths(data, errors, path = '') {
        if (Array.isArray(data)) {
            if (data.length > this.config.limits.maxArrayLength) {
                errors.push({
                    message: `Array at ${path || 'root'} exceeds maximum length of ${this.config.limits.maxArrayLength}`,
                    code: 'MAX_ARRAY_LENGTH',
                    path,
                    maxLength: this.config.limits.maxArrayLength,
                    actualLength: data.length
                });
            }
            
            data.forEach((item, index) => {
                this._checkArrayLengths(item, errors, path ? `${path}[${index}]` : `[${index}]`);
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                this._checkArrayLengths(value, errors, path ? `${path}.${key}` : key);
            }
        }
    }

    /**
     * Check string lengths
     */
    _checkStringLengths(data, errors, path = '') {
        if (typeof data === 'string') {
            if (data.length > this.config.limits.maxStringLength) {
                errors.push({
                    message: `String at ${path || 'root'} exceeds maximum length of ${this.config.limits.maxStringLength}`,
                    code: 'MAX_STRING_LENGTH',
                    path,
                    maxLength: this.config.limits.maxStringLength,
                    actualLength: data.length
                });
            }
        } else if (Array.isArray(data)) {
            data.forEach((item, index) => {
                this._checkStringLengths(item, errors, path ? `${path}[${index}]` : `[${index}]`);
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                this._checkStringLengths(value, errors, path ? `${path}.${key}` : key);
            }
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'ok',
            enabled: this.config.enabled,
            strictMode: this.config.strictMode,
            sanitizationEnabled: this.config.sanitization.enabled
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        this.initialized = false;
    }
}

export default InputValidator;

