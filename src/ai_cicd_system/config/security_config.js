/**
 * Security Configuration
 * 
 * Centralized security configuration management for the AI CI/CD system.
 * Handles security settings, validation, and environment-based configuration.
 */

import crypto from 'crypto';
import { SimpleLogger } from '../utils/simple_logger.js';

export class SecurityConfig {
    constructor(config = {}) {
        this.logger = new SimpleLogger('SecurityConfig');
        
        // Default security configuration
        this.config = {
            // Environment
            environment: process.env.NODE_ENV || 'development',
            
            // JWT Configuration
            jwt: {
                secret: process.env.JWT_SECRET || this._generateSecret('JWT'),
                issuer: process.env.JWT_ISSUER || 'ai-cicd-system',
                audience: process.env.JWT_AUDIENCE || 'ai-cicd-users',
                algorithm: process.env.JWT_ALGORITHM || 'HS256',
                accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
                refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
                clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE) || 30,
                ...config.jwt
            },
            
            // API Key Configuration
            apiKey: {
                prefix: process.env.API_KEY_PREFIX || 'aics_',
                defaultExpiry: process.env.API_KEY_DEFAULT_EXPIRY || '1y',
                maxKeysPerUser: parseInt(process.env.API_KEY_MAX_PER_USER) || 10,
                keyLength: parseInt(process.env.API_KEY_LENGTH) || 32,
                ...config.apiKey
            },
            
            // Session Configuration
            session: {
                timeout: process.env.SESSION_TIMEOUT || '24h',
                maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 5,
                cleanupInterval: process.env.SESSION_CLEANUP_INTERVAL || '1h',
                trackUserAgent: process.env.SESSION_TRACK_USER_AGENT !== 'false',
                trackIpAddress: process.env.SESSION_TRACK_IP !== 'false',
                ...config.session
            },
            
            // Password Policy
            password: {
                minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
                maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
                requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
                requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
                requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
                requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
                preventCommonPasswords: process.env.PASSWORD_PREVENT_COMMON !== 'false',
                saltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 12,
                ...config.password
            },
            
            // Rate Limiting
            rateLimit: {
                enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
                defaultRequests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
                defaultWindowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW) || 900, // 15 minutes
                whitelist: (process.env.RATE_LIMIT_WHITELIST || '').split(',').filter(ip => ip.trim()),
                ...config.rateLimit
            },
            
            // CORS Configuration
            cors: {
                enabled: process.env.CORS_ENABLED !== 'false',
                origin: this._parseCorsOrigin(process.env.CORS_ORIGIN),
                credentials: process.env.CORS_CREDENTIALS === 'true',
                methods: (process.env.CORS_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE').split(','),
                allowedHeaders: (process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-API-Key').split(','),
                exposedHeaders: (process.env.CORS_EXPOSED_HEADERS || '').split(',').filter(h => h.trim()),
                maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400,
                ...config.cors
            },
            
            // Security Headers
            headers: {
                hsts: {
                    enabled: process.env.HSTS_ENABLED !== 'false',
                    maxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000,
                    includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
                    preload: process.env.HSTS_PRELOAD === 'true'
                },
                csp: {
                    enabled: process.env.CSP_ENABLED !== 'false',
                    reportOnly: process.env.CSP_REPORT_ONLY === 'true',
                    reportUri: process.env.CSP_REPORT_URI || null
                },
                frameOptions: process.env.X_FRAME_OPTIONS || 'DENY',
                contentTypeOptions: process.env.X_CONTENT_TYPE_OPTIONS !== 'false',
                xssProtection: process.env.X_XSS_PROTECTION !== 'false',
                referrerPolicy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin',
                ...config.headers
            },
            
            // Encryption
            encryption: {
                algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
                keyDerivation: process.env.KEY_DERIVATION || 'pbkdf2',
                iterations: parseInt(process.env.ENCRYPTION_ITERATIONS) || 100000,
                keyLength: parseInt(process.env.ENCRYPTION_KEY_LENGTH) || 32,
                ivLength: parseInt(process.env.ENCRYPTION_IV_LENGTH) || 16,
                tagLength: parseInt(process.env.ENCRYPTION_TAG_LENGTH) || 16,
                ...config.encryption
            },
            
            // Audit and Logging
            audit: {
                enabled: process.env.AUDIT_ENABLED !== 'false',
                logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
                retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS) || 90,
                sensitiveFields: (process.env.AUDIT_SENSITIVE_FIELDS || 'password,token,secret,key').split(','),
                ...config.audit
            },
            
            // Security Monitoring
            monitoring: {
                enabled: process.env.SECURITY_MONITORING_ENABLED !== 'false',
                alertThresholds: {
                    failedLogins: parseInt(process.env.ALERT_FAILED_LOGINS) || 5,
                    rateLimitExceeded: parseInt(process.env.ALERT_RATE_LIMIT) || 10,
                    suspiciousActivity: parseInt(process.env.ALERT_SUSPICIOUS_ACTIVITY) || 3
                },
                ...config.monitoring
            },
            
            // Database Security
            database: {
                ssl: process.env.DB_SSL === 'true',
                sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
                connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
                queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
                maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
                ...config.database
            },
            
            // File Upload Security
            upload: {
                enabled: process.env.FILE_UPLOAD_ENABLED === 'true',
                maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
                maxFiles: parseInt(process.env.UPLOAD_MAX_FILES) || 5,
                allowedMimeTypes: (process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,application/pdf').split(','),
                blockedExtensions: (process.env.UPLOAD_BLOCKED_EXTENSIONS || '.exe,.bat,.cmd,.scr').split(','),
                scanForMalware: process.env.UPLOAD_SCAN_MALWARE === 'true',
                ...config.upload
            },
            
            // Custom security settings
            ...config
        };

        // Validate configuration
        this._validateConfig();
        
        // Log security configuration status
        this._logConfigStatus();
    }

    /**
     * Get configuration value
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value
     */
    set(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
        this.logger.info(`Security configuration updated: ${path}`);
    }

    /**
     * Get JWT configuration
     */
    getJWTConfig() {
        return { ...this.config.jwt };
    }

    /**
     * Get API key configuration
     */
    getAPIKeyConfig() {
        return { ...this.config.apiKey };
    }

    /**
     * Get session configuration
     */
    getSessionConfig() {
        return { ...this.config.session };
    }

    /**
     * Get password policy
     */
    getPasswordPolicy() {
        return { ...this.config.password };
    }

    /**
     * Get rate limiting configuration
     */
    getRateLimitConfig() {
        return { ...this.config.rateLimit };
    }

    /**
     * Get CORS configuration
     */
    getCORSConfig() {
        return { ...this.config.cors };
    }

    /**
     * Get security headers configuration
     */
    getHeadersConfig() {
        return { ...this.config.headers };
    }

    /**
     * Get encryption configuration
     */
    getEncryptionConfig() {
        return { ...this.config.encryption };
    }

    /**
     * Check if running in production
     */
    isProduction() {
        return this.config.environment === 'production';
    }

    /**
     * Check if running in development
     */
    isDevelopment() {
        return this.config.environment === 'development';
    }

    /**
     * Validate password against policy
     */
    validatePassword(password) {
        const policy = this.config.password;
        const errors = [];

        if (password.length < policy.minLength) {
            errors.push(`Password must be at least ${policy.minLength} characters long`);
        }

        if (password.length > policy.maxLength) {
            errors.push(`Password must not exceed ${policy.maxLength} characters`);
        }

        if (policy.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (policy.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (policy.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        if (policy.preventCommonPasswords && this._isCommonPassword(password)) {
            errors.push('Password is too common, please choose a more secure password');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generate secure random secret
     */
    _generateSecret(type = 'general') {
        const secret = crypto.randomBytes(64).toString('hex');
        this.logger.warn(`Generated ${type} secret. Set environment variable for production.`);
        return secret;
    }

    /**
     * Parse CORS origin configuration
     */
    _parseCorsOrigin(origin) {
        if (!origin) return false;
        if (origin === '*') return true;
        if (origin === 'true') return true;
        if (origin === 'false') return false;
        
        // Parse comma-separated origins
        const origins = origin.split(',').map(o => o.trim()).filter(o => o);
        return origins.length === 1 ? origins[0] : origins;
    }

    /**
     * Check if password is commonly used
     */
    _isCommonPassword(password) {
        const commonPasswords = [
            'password', '123456', '123456789', 'qwerty', 'abc123',
            'password123', 'admin', 'letmein', 'welcome', 'monkey',
            'dragon', 'master', 'shadow', 'superman', 'michael'
        ];
        
        return commonPasswords.includes(password.toLowerCase());
    }

    /**
     * Validate security configuration
     */
    _validateConfig() {
        const errors = [];

        // Validate JWT secret in production
        if (this.isProduction() && this.config.jwt.secret.length < 32) {
            errors.push('JWT secret must be at least 32 characters in production');
        }

        // Validate password policy
        if (this.config.password.minLength < 8) {
            errors.push('Minimum password length should be at least 8 characters');
        }

        // Validate rate limiting
        if (this.config.rateLimit.defaultRequests < 1) {
            errors.push('Rate limit requests must be at least 1');
        }

        // Validate encryption settings
        const validAlgorithms = ['aes-256-gcm', 'aes-256-cbc', 'aes-192-gcm', 'aes-128-gcm'];
        if (!validAlgorithms.includes(this.config.encryption.algorithm)) {
            errors.push(`Invalid encryption algorithm: ${this.config.encryption.algorithm}`);
        }

        // Log validation errors
        if (errors.length > 0) {
            this.logger.error('Security configuration validation failed:', errors);
            if (this.isProduction()) {
                throw new Error('Invalid security configuration in production');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Log configuration status
     */
    _logConfigStatus() {
        const status = {
            environment: this.config.environment,
            jwtConfigured: !!this.config.jwt.secret,
            rateLimitEnabled: this.config.rateLimit.enabled,
            corsEnabled: this.config.cors.enabled,
            hstsEnabled: this.config.headers.hsts.enabled,
            auditEnabled: this.config.audit.enabled,
            monitoringEnabled: this.config.monitoring.enabled
        };

        this.logger.info('Security configuration loaded:', status);

        // Warn about insecure settings in production
        if (this.isProduction()) {
            if (!this.config.headers.hsts.enabled) {
                this.logger.warn('HSTS is disabled in production');
            }
            if (!this.config.audit.enabled) {
                this.logger.warn('Audit logging is disabled in production');
            }
            if (!this.config.database.ssl) {
                this.logger.warn('Database SSL is disabled in production');
            }
        }
    }

    /**
     * Export configuration for external use
     */
    export() {
        // Return a deep copy without sensitive information
        const exported = JSON.parse(JSON.stringify(this.config));
        
        // Remove sensitive fields
        if (exported.jwt) {
            exported.jwt.secret = '[REDACTED]';
        }
        
        return exported;
    }

    /**
     * Update configuration from environment variables
     */
    updateFromEnvironment() {
        // Re-read environment variables and update configuration
        const newConfig = new SecurityConfig();
        this.config = newConfig.config;
        this.logger.info('Security configuration updated from environment');
    }
}

export default SecurityConfig;

