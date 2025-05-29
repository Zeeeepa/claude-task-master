/**
 * Security Configuration Manager
 * 
 * Centralized configuration management for the unified security framework.
 * Handles validation, defaults, and environment-specific settings.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class SecurityConfig {
    constructor(config = {}) {
        this.config = this._mergeWithDefaults(config);
        this._validateConfig();
    }

    /**
     * Get default security configuration
     */
    _getDefaults() {
        return {
            // Core framework settings
            framework: {
                environment: process.env.NODE_ENV || 'development',
                debug: process.env.SECURITY_DEBUG === 'true',
                strictMode: process.env.SECURITY_STRICT_MODE !== 'false'
            },

            // Component enablement flags
            components: {
                authentication: true,
                authorization: true,
                encryption: true,
                auditLogging: true,
                inputValidation: true,
                securityMiddleware: true,
                vulnerabilityScanning: true
            },

            // Authentication configuration
            authentication: {
                jwt: {
                    secret: process.env.JWT_SECRET,
                    issuer: process.env.JWT_ISSUER || 'ai-cicd-system',
                    audience: process.env.JWT_AUDIENCE || 'ai-cicd-users',
                    algorithm: 'HS256',
                    accessTokenExpiry: '1h',
                    refreshTokenExpiry: '7d',
                    clockTolerance: 30
                },
                apiKeys: {
                    enabled: true,
                    keyLength: 32,
                    hashAlgorithm: 'sha256',
                    rateLimiting: {
                        windowMs: 15 * 60 * 1000, // 15 minutes
                        maxRequests: 1000
                    }
                },
                sessions: {
                    enabled: true,
                    secret: process.env.SESSION_SECRET,
                    maxAge: 24 * 60 * 60 * 1000, // 24 hours
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    sameSite: 'strict'
                },
                oauth: {
                    enabled: false,
                    providers: {}
                }
            },

            // Authorization configuration
            authorization: {
                rbac: {
                    enabled: true,
                    defaultRole: 'user',
                    superAdminRole: 'super_admin',
                    cachePermissions: true,
                    cacheTTL: 300 // 5 minutes
                },
                permissions: {
                    hierarchical: true,
                    inheritance: true,
                    wildcards: true
                }
            },

            // Encryption configuration
            encryption: {
                algorithm: 'aes-256-gcm',
                keyDerivation: {
                    algorithm: 'pbkdf2',
                    iterations: 100000,
                    keyLength: 32,
                    digest: 'sha256'
                },
                dataAtRest: {
                    enabled: true,
                    keyRotation: {
                        enabled: true,
                        intervalDays: 90
                    }
                },
                dataInTransit: {
                    enabled: true,
                    minTlsVersion: '1.2',
                    cipherSuites: [
                        'ECDHE-RSA-AES256-GCM-SHA384',
                        'ECDHE-RSA-AES128-GCM-SHA256'
                    ]
                }
            },

            // Audit logging configuration
            auditLogging: {
                enabled: true,
                level: 'info',
                format: 'json',
                destinations: ['file', 'database'],
                retention: {
                    days: 365,
                    maxSize: '10GB'
                },
                events: {
                    authentication: true,
                    authorization: true,
                    dataAccess: true,
                    systemChanges: true,
                    securityEvents: true
                },
                sensitiveFields: [
                    'password',
                    'token',
                    'secret',
                    'key',
                    'credential'
                ]
            },

            // Input validation configuration
            inputValidation: {
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
                    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                }
            },

            // Security middleware configuration
            securityMiddleware: {
                enabled: true,
                cors: {
                    enabled: true,
                    origin: process.env.CORS_ORIGIN || false,
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
                },
                helmet: {
                    enabled: true,
                    contentSecurityPolicy: {
                        directives: {
                            defaultSrc: ["'self'"],
                            scriptSrc: ["'self'", "'unsafe-inline'"],
                            styleSrc: ["'self'", "'unsafe-inline'"],
                            imgSrc: ["'self'", "data:", "https:"]
                        }
                    }
                },
                rateLimiting: {
                    enabled: true,
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    maxRequests: 100,
                    skipSuccessfulRequests: false,
                    skipFailedRequests: false
                }
            },

            // Vulnerability scanning configuration
            vulnerabilityScanning: {
                enabled: true,
                schedule: {
                    enabled: true,
                    cron: '0 2 * * *' // Daily at 2 AM
                },
                scans: {
                    dependencies: true,
                    codeAnalysis: true,
                    configurationReview: true,
                    secretsDetection: true
                },
                reporting: {
                    enabled: true,
                    format: 'json',
                    destinations: ['file', 'email'],
                    severity: {
                        critical: true,
                        high: true,
                        medium: true,
                        low: false
                    }
                }
            }
        };
    }

    /**
     * Merge user config with defaults
     */
    _mergeWithDefaults(userConfig) {
        const defaults = this._getDefaults();
        return this._deepMerge(defaults, userConfig);
    }

    /**
     * Deep merge two objects
     */
    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Validate configuration
     */
    _validateConfig() {
        const errors = [];

        // Validate JWT secret in production
        if (this.config.framework.environment === 'production') {
            if (!this.config.authentication.jwt.secret) {
                errors.push('JWT secret is required in production');
            }
            if (this.config.authentication.sessions.enabled && !this.config.authentication.sessions.secret) {
                errors.push('Session secret is required in production');
            }
        }

        // Validate encryption settings
        if (this.config.components.encryption) {
            const supportedAlgorithms = ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'];
            if (!supportedAlgorithms.includes(this.config.encryption.algorithm)) {
                errors.push(`Unsupported encryption algorithm: ${this.config.encryption.algorithm}`);
            }
        }

        // Validate audit logging destinations
        if (this.config.components.auditLogging) {
            const validDestinations = ['file', 'database', 'syslog', 'elasticsearch'];
            const invalidDestinations = this.config.auditLogging.destinations.filter(
                dest => !validDestinations.includes(dest)
            );
            if (invalidDestinations.length > 0) {
                errors.push(`Invalid audit logging destinations: ${invalidDestinations.join(', ')}`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Check if a component is enabled
     */
    isEnabled(componentName) {
        return this.config.components[componentName] === true;
    }

    /**
     * Get configuration section
     */
    getSection(sectionName) {
        return this.config[sectionName] || {};
    }

    /**
     * Get full configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration at runtime
     */
    updateConfig(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        this._validateConfig();
    }

    /**
     * Load configuration from file
     */
    static fromFile(filePath) {
        try {
            const configData = JSON.parse(readFileSync(filePath, 'utf8'));
            return new SecurityConfig(configData);
        } catch (error) {
            throw new Error(`Failed to load security config from ${filePath}: ${error.message}`);
        }
    }

    /**
     * Get environment-specific configuration
     */
    getEnvironmentConfig() {
        const env = this.config.framework.environment;
        const envConfig = this.config.environments?.[env] || {};
        return this._deepMerge(this.config, envConfig);
    }
}

export default SecurityConfig;

