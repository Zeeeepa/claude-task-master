/**
 * Input Validator Middleware
 * 
 * Comprehensive input validation and sanitization middleware for the AI CI/CD system.
 * Provides protection against injection attacks and data validation.
 */

import { SimpleLogger } from '../utils/simple_logger.js';

export class InputValidator {
    constructor(config = {}) {
        this.config = {
            // Maximum request body size (in bytes)
            maxBodySize: 10 * 1024 * 1024, // 10MB
            
            // Maximum URL length
            maxUrlLength: 2048,
            
            // Maximum header value length
            maxHeaderLength: 8192,
            
            // SQL injection patterns
            sqlInjectionPatterns: [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
                /(;|\-\-|\#|\/\*|\*\/)/g,
                /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
                /(\b(OR|AND)\s+['"]\w+['"]?\s*=\s*['"]\w+['"]?)/gi
            ],
            
            // XSS patterns
            xssPatterns: [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /<img[^>]+src[^>]*>/gi,
                /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
                /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
            ],
            
            // Command injection patterns
            commandInjectionPatterns: [
                /[;&|`$(){}[\]]/g,
                /\b(cat|ls|pwd|whoami|id|uname|ps|netstat|ifconfig|ping|wget|curl|nc|telnet|ssh|ftp)\b/gi
            ],
            
            // Path traversal patterns
            pathTraversalPatterns: [
                /\.\.\//g,
                /\.\.\\\\g,
                /%2e%2e%2f/gi,
                /%2e%2e%5c/gi,
                /\.\.%2f/gi,
                /\.\.%5c/gi
            ],
            
            // LDAP injection patterns
            ldapInjectionPatterns: [
                /[()&|!]/g,
                /\*(?![a-zA-Z0-9])/g
            ],
            
            // NoSQL injection patterns
            nosqlInjectionPatterns: [
                /\$where/gi,
                /\$ne/gi,
                /\$gt/gi,
                /\$lt/gi,
                /\$regex/gi,
                /\$or/gi,
                /\$and/gi
            ],
            
            // Allowed file extensions for uploads
            allowedFileExtensions: [
                '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt', '.doc', '.docx',
                '.xls', '.xlsx', '.csv', '.json', '.xml', '.zip'
            ],
            
            // Blocked file extensions
            blockedFileExtensions: [
                '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
                '.jar', '.php', '.asp', '.aspx', '.jsp', '.sh', '.ps1'
            ],
            
            // Custom validation rules
            customRules: {},
            
            // Sanitization options
            sanitization: {
                enabled: true,
                stripHtml: true,
                trimWhitespace: true,
                normalizeUnicode: true
            },
            
            // Logging options
            logging: {
                logValidationFailures: true,
                logSanitization: false
            },
            
            ...config
        };

        this.logger = new SimpleLogger('InputValidator');
    }

    /**
     * Main validation middleware
     */
    validate(rules = {}) {
        return async (req, res, next) => {
            try {
                const validationResult = await this._validateRequest(req, rules);
                
                if (!validationResult.valid) {
                    // Log validation failure
                    if (this.config.logging.logValidationFailures) {
                        await this._logSecurityEvent('input_validation_failure', 'medium', req.user?.id || null, {
                            errors: validationResult.errors,
                            path: req.path,
                            method: req.method,
                            ip_address: this._getClientIP(req),
                            user_agent: req.get('User-Agent')
                        });
                    }

                    return res.status(400).json({
                        error: 'Input validation failed',
                        message: 'Request contains invalid or potentially malicious input',
                        details: validationResult.errors,
                        code: 'VALIDATION_FAILED'
                    });
                }

                // Apply sanitization if enabled
                if (this.config.sanitization.enabled) {
                    this._sanitizeRequest(req);
                }

                next();

            } catch (error) {
                this.logger.error('Input validation error:', error);
                return res.status(500).json({
                    error: 'Validation system error',
                    message: 'Internal validation error'
                });
            }
        };
    }

    /**
     * Validate request against security patterns and rules
     */
    async _validateRequest(req, rules) {
        const errors = [];

        // Check request size limits
        if (req.get('content-length') && parseInt(req.get('content-length')) > this.config.maxBodySize) {
            errors.push('Request body too large');
        }

        // Check URL length
        if (req.url.length > this.config.maxUrlLength) {
            errors.push('URL too long');
        }

        // Check headers
        for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === 'string' && value.length > this.config.maxHeaderLength) {
                errors.push(`Header ${name} too long`);
            }
        }

        // Validate URL parameters
        const urlValidation = this._validateInput(req.url, 'url');
        if (!urlValidation.valid) {
            errors.push(...urlValidation.errors);
        }

        // Validate query parameters
        for (const [key, value] of Object.entries(req.query || {})) {
            const queryValidation = this._validateInput(value, 'query', key);
            if (!queryValidation.valid) {
                errors.push(...queryValidation.errors);
            }
        }

        // Validate request body
        if (req.body) {
            const bodyValidation = this._validateObject(req.body, rules.body || {}, 'body');
            if (!bodyValidation.valid) {
                errors.push(...bodyValidation.errors);
            }
        }

        // Validate file uploads
        if (req.files) {
            const fileValidation = this._validateFiles(req.files);
            if (!fileValidation.valid) {
                errors.push(...fileValidation.errors);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate input string against security patterns
     */
    _validateInput(input, context = 'general', fieldName = '') {
        const errors = [];
        
        if (typeof input !== 'string') {
            return { valid: true, errors: [] };
        }

        const prefix = fieldName ? `${fieldName}: ` : '';

        // Check for SQL injection
        for (const pattern of this.config.sqlInjectionPatterns) {
            if (pattern.test(input)) {
                errors.push(`${prefix}Potential SQL injection detected`);
                break;
            }
        }

        // Check for XSS
        for (const pattern of this.config.xssPatterns) {
            if (pattern.test(input)) {
                errors.push(`${prefix}Potential XSS attack detected`);
                break;
            }
        }

        // Check for command injection
        if (context !== 'url') { // URLs naturally contain some of these characters
            for (const pattern of this.config.commandInjectionPatterns) {
                if (pattern.test(input)) {
                    errors.push(`${prefix}Potential command injection detected`);
                    break;
                }
            }
        }

        // Check for path traversal
        for (const pattern of this.config.pathTraversalPatterns) {
            if (pattern.test(input)) {
                errors.push(`${prefix}Potential path traversal detected`);
                break;
            }
        }

        // Check for LDAP injection
        for (const pattern of this.config.ldapInjectionPatterns) {
            if (pattern.test(input)) {
                errors.push(`${prefix}Potential LDAP injection detected`);
                break;
            }
        }

        // Check for NoSQL injection
        for (const pattern of this.config.nosqlInjectionPatterns) {
            if (pattern.test(input)) {
                errors.push(`${prefix}Potential NoSQL injection detected`);
                break;
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate object recursively
     */
    _validateObject(obj, rules, context = '') {
        const errors = [];

        if (typeof obj !== 'object' || obj === null) {
            return { valid: true, errors: [] };
        }

        for (const [key, value] of Object.entries(obj)) {
            const fieldPath = context ? `${context}.${key}` : key;
            const fieldRules = rules[key] || {};

            // Validate field value
            if (typeof value === 'string') {
                const validation = this._validateInput(value, 'body', fieldPath);
                if (!validation.valid) {
                    errors.push(...validation.errors);
                }

                // Apply custom field rules
                const customValidation = this._validateCustomRules(value, fieldRules, fieldPath);
                if (!customValidation.valid) {
                    errors.push(...customValidation.errors);
                }
            } else if (typeof value === 'object' && value !== null) {
                // Recursively validate nested objects
                const nestedValidation = this._validateObject(value, fieldRules.properties || {}, fieldPath);
                if (!nestedValidation.valid) {
                    errors.push(...nestedValidation.errors);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate custom rules for a field
     */
    _validateCustomRules(value, rules, fieldPath) {
        const errors = [];

        // Required field validation
        if (rules.required && (!value || value.trim() === '')) {
            errors.push(`${fieldPath}: Field is required`);
        }

        // Type validation
        if (rules.type && typeof value !== rules.type) {
            errors.push(`${fieldPath}: Expected type ${rules.type}, got ${typeof value}`);
        }

        // Length validation
        if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${fieldPath}: Minimum length is ${rules.minLength}`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${fieldPath}: Maximum length is ${rules.maxLength}`);
        }

        // Pattern validation
        if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${fieldPath}: Value does not match required pattern`);
        }

        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${fieldPath}: Value must be one of: ${rules.enum.join(', ')}`);
        }

        // Email validation
        if (rules.format === 'email') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(value)) {
                errors.push(`${fieldPath}: Invalid email format`);
            }
        }

        // URL validation
        if (rules.format === 'url') {
            try {
                new URL(value);
            } catch {
                errors.push(`${fieldPath}: Invalid URL format`);
            }
        }

        // UUID validation
        if (rules.format === 'uuid') {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidPattern.test(value)) {
                errors.push(`${fieldPath}: Invalid UUID format`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate file uploads
     */
    _validateFiles(files) {
        const errors = [];

        for (const [fieldName, fileArray] of Object.entries(files)) {
            const fileList = Array.isArray(fileArray) ? fileArray : [fileArray];
            
            for (const file of fileList) {
                // Check file extension
                const extension = this._getFileExtension(file.name || file.originalname || '');
                
                if (this.config.blockedFileExtensions.includes(extension.toLowerCase())) {
                    errors.push(`${fieldName}: File type ${extension} is not allowed`);
                    continue;
                }

                if (this.config.allowedFileExtensions.length > 0 && 
                    !this.config.allowedFileExtensions.includes(extension.toLowerCase())) {
                    errors.push(`${fieldName}: File type ${extension} is not allowed`);
                    continue;
                }

                // Check file size (if available)
                if (file.size && file.size > this.config.maxBodySize) {
                    errors.push(`${fieldName}: File size exceeds maximum allowed size`);
                }

                // Check MIME type vs extension mismatch
                if (file.mimetype && !this._validateMimeType(file.mimetype, extension)) {
                    errors.push(`${fieldName}: File MIME type does not match extension`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Sanitize request data
     */
    _sanitizeRequest(req) {
        // Sanitize query parameters
        if (req.query) {
            req.query = this._sanitizeObject(req.query);
        }

        // Sanitize request body
        if (req.body) {
            req.body = this._sanitizeObject(req.body);
        }

        if (this.config.logging.logSanitization) {
            this.logger.debug('Request data sanitized');
        }
    }

    /**
     * Sanitize object recursively
     */
    _sanitizeObject(obj) {
        if (typeof obj === 'string') {
            return this._sanitizeString(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this._sanitizeObject(item));
        }

        if (typeof obj === 'object' && obj !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = this._sanitizeObject(value);
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Sanitize string
     */
    _sanitizeString(str) {
        let sanitized = str;

        // Trim whitespace
        if (this.config.sanitization.trimWhitespace) {
            sanitized = sanitized.trim();
        }

        // Strip HTML tags
        if (this.config.sanitization.stripHtml) {
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }

        // Normalize Unicode
        if (this.config.sanitization.normalizeUnicode) {
            sanitized = sanitized.normalize('NFC');
        }

        // Escape special characters
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        return sanitized;
    }

    /**
     * Get file extension
     */
    _getFileExtension(filename) {
        return filename.toLowerCase().substring(filename.lastIndexOf('.'));
    }

    /**
     * Validate MIME type against file extension
     */
    _validateMimeType(mimeType, extension) {
        const mimeMap = {
            '.jpg': ['image/jpeg'],
            '.jpeg': ['image/jpeg'],
            '.png': ['image/png'],
            '.gif': ['image/gif'],
            '.pdf': ['application/pdf'],
            '.txt': ['text/plain'],
            '.json': ['application/json'],
            '.xml': ['application/xml', 'text/xml'],
            '.csv': ['text/csv'],
            '.zip': ['application/zip']
        };

        const allowedMimes = mimeMap[extension.toLowerCase()];
        return allowedMimes ? allowedMimes.includes(mimeType.toLowerCase()) : true;
    }

    /**
     * Get client IP address
     */
    _getClientIP(req) {
        return req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               '127.0.0.1';
    }

    /**
     * Log security event (placeholder - should integrate with actual security logging)
     */
    async _logSecurityEvent(eventType, severity, userId, eventData) {
        // This would integrate with the actual security event logging system
        this.logger.warn(`Security event: ${eventType}`, { severity, userId, eventData });
    }

    /**
     * Create validation middleware for specific schemas
     */
    static createSchemaValidator(schema) {
        return new InputValidator().validate(schema);
    }

    /**
     * Create strict validation middleware for API endpoints
     */
    static createStrictValidator(options = {}) {
        const config = {
            maxBodySize: 1024 * 1024, // 1MB
            maxUrlLength: 1024,
            sanitization: {
                enabled: true,
                stripHtml: true,
                trimWhitespace: true,
                normalizeUnicode: true
            },
            ...options
        };

        return new InputValidator(config).validate();
    }
}

export default InputValidator;

