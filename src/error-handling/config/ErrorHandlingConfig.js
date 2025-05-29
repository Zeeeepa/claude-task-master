/**
 * @fileoverview Unified Error Handling Configuration
 * @description Consolidates configuration from all PRs into a single,
 * comprehensive configuration system
 */

import { z } from 'zod';

/**
 * Configuration schema for error handling system
 */
const ErrorHandlingConfigSchema = z.object({
    // Core error handling settings
    errorHandling: z.object({
        enableAnalytics: z.boolean().default(true),
        enablePatternRecognition: z.boolean().default(true),
        enableAutomatedFixes: z.boolean().default(true),
        enableEscalation: z.boolean().default(true),
        maxRetryAttempts: z.number().min(0).max(10).default(3),
        escalationThreshold: z.number().min(1).max(10).default(3)
    }).default({}),

    // Error classification settings
    classification: z.object({
        enableMLClassification: z.boolean().default(true),
        confidenceThreshold: z.number().min(0).max(1).default(0.7),
        maxPatternHistory: z.number().min(100).max(10000).default(1000),
        enablePatternLearning: z.boolean().default(true)
    }).default({}),

    // Retry configuration
    retry: z.object({
        maxRetries: z.number().min(0).max(10).default(3),
        initialDelayMs: z.number().min(100).max(10000).default(1000),
        maxDelayMs: z.number().min(1000).max(300000).default(30000),
        backoffMultiplier: z.number().min(1).max(5).default(2),
        jitterEnabled: z.boolean().default(true),
        jitterFactor: z.number().min(0).max(1).default(0.1),
        timeoutMs: z.number().min(1000).max(300000).default(60000),
        enableCircuitBreaker: z.boolean().default(true),
        enableAdaptive: z.boolean().default(true),
        maxConcurrentRetries: z.number().min(1).max(100).default(10),
        strategy: z.enum(['exponential', 'linear', 'fixed', 'fibonacci', 'adaptive']).default('exponential')
    }).default({}),

    // Circuit breaker configuration
    circuitBreaker: z.object({
        failureThreshold: z.number().min(1).max(20).default(5),
        successThreshold: z.number().min(1).max(10).default(3),
        timeoutMs: z.number().min(10000).max(600000).default(60000),
        monitoringPeriodMs: z.number().min(60000).max(3600000).default(300000),
        volumeThreshold: z.number().min(1).max(100).default(10),
        halfOpenMaxCalls: z.number().min(1).max(10).default(3)
    }).default({}),

    // Fix generation settings
    fixGeneration: z.object({
        enableLearning: z.boolean().default(true),
        maxFixAttempts: z.number().min(1).max(5).default(3),
        confidenceThreshold: z.number().min(0).max(1).default(0.7),
        enableCodegenIntegration: z.boolean().default(true),
        enablePatternBasedFixes: z.boolean().default(true),
        enableRuleBasedFixes: z.boolean().default(true)
    }).default({}),

    // Escalation configuration
    escalation: z.object({
        enableAutoEscalation: z.boolean().default(true),
        codegenThreshold: z.number().min(1).max(10).default(2),
        manualThreshold: z.number().min(1).max(20).default(5),
        systemResetThreshold: z.number().min(5).max(50).default(10),
        escalationLevels: z.array(z.enum([
            'AUTOMATED_RETRY',
            'AUTOMATED_FIX',
            'CODEGEN_ASSISTANCE',
            'HUMAN_INTERVENTION',
            'SYSTEM_SHUTDOWN'
        ])).default([
            'AUTOMATED_RETRY',
            'AUTOMATED_FIX',
            'CODEGEN_ASSISTANCE',
            'HUMAN_INTERVENTION',
            'SYSTEM_SHUTDOWN'
        ]),
        escalationThresholds: z.object({
            errorCount: z.number().min(1).max(100).default(5),
            timeWindowMs: z.number().min(60000).max(3600000).default(300000),
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('HIGH'),
            failureRate: z.number().min(0).max(1).default(0.8)
        }).default({})
    }).default({}),

    // Monitoring configuration
    monitoring: z.object({
        enableRealTimeMonitoring: z.boolean().default(true),
        enableAlerting: z.boolean().default(true),
        enableMetrics: z.boolean().default(true),
        enableTrending: z.boolean().default(true),
        monitoringInterval: z.number().min(10000).max(300000).default(60000),
        alertingInterval: z.number().min(5000).max(120000).default(30000),
        metricsRetention: z.number().min(3600000).max(604800000).default(86400000), // 24 hours
        alertThresholds: z.object({
            errorRate: z.number().min(0).max(1).default(0.1),
            responseTime: z.number().min(1000).max(30000).default(5000),
            availability: z.number().min(0).max(1).default(0.95)
        }).default({}),
        alertChannels: z.array(z.enum(['log', 'email', 'slack', 'webhook', 'sms'])).default(['log'])
    }).default({}),

    // Analytics configuration
    analytics: z.object({
        retentionPeriod: z.number().min(86400000).max(2592000000).default(2592000000), // 30 days
        aggregationIntervals: z.array(z.string()).default(['1h', '1d', '1w']),
        enableRealTimeAnalytics: z.boolean().default(true),
        enableTrendAnalysis: z.boolean().default(true),
        enableAnomalyDetection: z.boolean().default(true),
        enablePatternDetection: z.boolean().default(true)
    }).default({}),

    // Health monitoring configuration
    health: z.object({
        enableHealthChecks: z.boolean().default(true),
        healthCheckInterval: z.number().min(10000).max(300000).default(30000),
        healthCheckTimeout: z.number().min(1000).max(30000).default(5000),
        enableComponentHealth: z.boolean().default(true),
        enableDependencyHealth: z.boolean().default(true)
    }).default({}),

    // Reporting configuration
    reporting: z.object({
        enableErrorReporting: z.boolean().default(true),
        enableSuccessReporting: z.boolean().default(false),
        reportFormat: z.enum(['json', 'text', 'html']).default('json'),
        includeStackTrace: z.boolean().default(true),
        includeContext: z.boolean().default(true),
        maxReportSize: z.number().min(1000).max(1000000).default(100000)
    }).default({}),

    // Integration settings
    integrations: z.object({
        // Codegen integration
        codegen: z.object({
            enabled: z.boolean().default(true),
            apiUrl: z.string().url().default('https://api.codegen.sh'),
            apiKey: z.string().optional(),
            orgId: z.string().optional(),
            timeout: z.number().min(5000).max(120000).default(30000),
            retryAttempts: z.number().min(0).max(5).default(3),
            enableAutoFix: z.boolean().default(true),
            enableEscalation: z.boolean().default(true)
        }).default({}),

        // Linear integration
        linear: z.object({
            enabled: z.boolean().default(true),
            apiKey: z.string().optional(),
            teamId: z.string().optional(),
            defaultAssignee: z.string().default('codegen'),
            priorityMapping: z.object({
                LOW: z.string().default('LOW'),
                MEDIUM: z.string().default('MEDIUM'),
                HIGH: z.string().default('HIGH'),
                CRITICAL: z.string().default('URGENT')
            }).default({}),
            enableAutoTicketCreation: z.boolean().default(true),
            enableStatusUpdates: z.boolean().default(true)
        }).default({}),

        // Notification settings
        notifications: z.object({
            enabled: z.boolean().default(true),
            enableRateLimiting: z.boolean().default(true),
            rateLimitWindow: z.number().min(60000).max(3600000).default(300000),
            maxNotificationsPerWindow: z.number().min(1).max(100).default(10),
            enableBatching: z.boolean().default(true),
            batchInterval: z.number().min(10000).max(300000).default(60000),
            channels: z.object({
                slack: z.object({
                    enabled: z.boolean().default(false),
                    webhookUrl: z.string().optional(),
                    channel: z.string().default('#alerts'),
                    username: z.string().default('Error Handler')
                }).default({}),
                email: z.object({
                    enabled: z.boolean().default(false),
                    smtpHost: z.string().optional(),
                    smtpPort: z.number().min(1).max(65535).default(587),
                    username: z.string().optional(),
                    password: z.string().optional(),
                    from: z.string().optional(),
                    to: z.array(z.string()).default([])
                }).default({}),
                webhook: z.object({
                    enabled: z.boolean().default(false),
                    url: z.string().optional(),
                    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
                    headers: z.record(z.string()).default({}),
                    timeout: z.number().min(1000).max(30000).default(5000)
                }).default({})
            }).default({})
        }).default({}),

        // Database integration
        database: z.object({
            enabled: z.boolean().default(false),
            connectionString: z.string().optional(),
            poolSize: z.number().min(1).max(50).default(10),
            timeout: z.number().min(1000).max(30000).default(5000),
            retryAttempts: z.number().min(0).max(5).default(3),
            enableMigrations: z.boolean().default(true)
        }).default({})
    }).default({}),

    // Security settings
    security: z.object({
        enableEncryption: z.boolean().default(true),
        encryptionKey: z.string().optional(),
        enableAuditLog: z.boolean().default(true),
        auditLogRetention: z.number().min(86400000).max(31536000000).default(7776000000), // 90 days
        enableRateLimiting: z.boolean().default(true),
        rateLimitWindow: z.number().min(60000).max(3600000).default(60000),
        rateLimitMax: z.number().min(10).max(1000).default(100),
        enableDataSanitization: z.boolean().default(true)
    }).default({}),

    // Performance settings
    performance: z.object({
        enableCaching: z.boolean().default(true),
        cacheSize: z.number().min(100).max(10000).default(1000),
        cacheTTL: z.number().min(60000).max(3600000).default(300000), // 5 minutes
        enableCompression: z.boolean().default(true),
        compressionLevel: z.number().min(1).max(9).default(6),
        enableBatching: z.boolean().default(true),
        batchSize: z.number().min(10).max(1000).default(100),
        batchTimeout: z.number().min(1000).max(30000).default(5000),
        maxMemoryUsage: z.number().min(100).max(2000).default(500) // MB
    }).default({}),

    // Logging configuration
    logging: z.object({
        enableLogging: z.boolean().default(true),
        logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        logFormat: z.enum(['json', 'text']).default('json'),
        enableStructuredLogging: z.boolean().default(true),
        enableLogRotation: z.boolean().default(true),
        maxLogSize: z.number().min(1).max(1000).default(100), // MB
        maxLogFiles: z.number().min(1).max(100).default(10),
        enableRemoteLogging: z.boolean().default(false),
        remoteLogEndpoint: z.string().optional()
    }).default({})
});

/**
 * Environment-specific configuration presets
 */
const EnvironmentPresets = {
    development: {
        errorHandling: {
            enableAnalytics: true,
            enablePatternRecognition: false,
            enableAutomatedFixes: false,
            enableEscalation: false
        },
        classification: {
            enableMLClassification: false,
            confidenceThreshold: 0.5
        },
        retry: {
            maxRetries: 2,
            initialDelayMs: 500,
            maxDelayMs: 5000
        },
        monitoring: {
            enableRealTimeMonitoring: true,
            enableAlerting: false,
            alertChannels: ['log']
        },
        logging: {
            logLevel: 'debug',
            logFormat: 'text'
        }
    },

    testing: {
        errorHandling: {
            enableAnalytics: false,
            enablePatternRecognition: false,
            enableAutomatedFixes: false,
            enableEscalation: false
        },
        classification: {
            enableMLClassification: false,
            enablePatternLearning: false
        },
        retry: {
            maxRetries: 1,
            initialDelayMs: 100,
            maxDelayMs: 1000
        },
        monitoring: {
            enableRealTimeMonitoring: false,
            enableAlerting: false,
            metricsRetention: 3600000 // 1 hour
        },
        logging: {
            logLevel: 'error',
            enableLogging: false
        }
    },

    staging: {
        errorHandling: {
            enableAnalytics: true,
            enablePatternRecognition: true,
            enableAutomatedFixes: true,
            enableEscalation: false
        },
        classification: {
            enableMLClassification: true,
            confidenceThreshold: 0.6
        },
        retry: {
            maxRetries: 3,
            enableAdaptive: true
        },
        monitoring: {
            enableRealTimeMonitoring: true,
            enableAlerting: true,
            alertChannels: ['log', 'slack']
        },
        integrations: {
            codegen: {
                enableAutoFix: true,
                enableEscalation: false
            },
            linear: {
                enableAutoTicketCreation: false
            }
        }
    },

    production: {
        errorHandling: {
            enableAnalytics: true,
            enablePatternRecognition: true,
            enableAutomatedFixes: true,
            enableEscalation: true
        },
        classification: {
            enableMLClassification: true,
            confidenceThreshold: 0.8
        },
        retry: {
            maxRetries: 3,
            enableAdaptive: true,
            enableCircuitBreaker: true
        },
        monitoring: {
            enableRealTimeMonitoring: true,
            enableAlerting: true,
            alertChannels: ['log', 'slack', 'email']
        },
        integrations: {
            codegen: {
                enableAutoFix: true,
                enableEscalation: true
            },
            linear: {
                enableAutoTicketCreation: true,
                enableStatusUpdates: true
            },
            notifications: {
                enableRateLimiting: true,
                enableBatching: true
            }
        },
        security: {
            enableEncryption: true,
            enableAuditLog: true,
            enableRateLimiting: true
        },
        performance: {
            enableCaching: true,
            enableCompression: true,
            enableBatching: true
        }
    }
};

/**
 * Unified Error Handling Configuration Manager
 */
export class ErrorHandlingConfig {
    constructor(userConfig = {}, environment = null) {
        this.environment = environment || process.env.NODE_ENV || 'development';
        this.userConfig = userConfig;
        
        // Merge configurations
        const baseConfig = this._getBaseConfig();
        const envConfig = this._getEnvironmentConfig();
        const mergedConfig = this._mergeConfigs(baseConfig, envConfig, userConfig);
        
        // Validate configuration
        const validationResult = ErrorHandlingConfigSchema.safeParse(mergedConfig);
        
        if (!validationResult.success) {
            throw new Error(`Invalid error handling configuration: ${validationResult.error.message}`);
        }
        
        this.config = validationResult.data;
        this._resolveEnvironmentVariables();
    }

    /**
     * Get configuration value by path
     * @param {string} path - Configuration path (e.g., 'retry.maxRetries')
     * @returns {any} Configuration value
     */
    get(path) {
        return this._getNestedValue(this.config, path);
    }

    /**
     * Set configuration value by path
     * @param {string} path - Configuration path
     * @param {any} value - Value to set
     */
    set(path, value) {
        this._setNestedValue(this.config, path, value);
    }

    /**
     * Get full configuration object
     * @returns {Object} Full configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Update configuration with new values
     * @param {Object} updates - Configuration updates
     */
    update(updates) {
        const mergedConfig = this._mergeConfigs(this.config, updates);
        const validationResult = ErrorHandlingConfigSchema.safeParse(mergedConfig);
        
        if (!validationResult.success) {
            throw new Error(`Invalid configuration update: ${validationResult.error.message}`);
        }
        
        this.config = validationResult.data;
        this._resolveEnvironmentVariables();
    }

    /**
     * Validate configuration
     * @returns {Object} Validation result
     */
    validate() {
        return ErrorHandlingConfigSchema.safeParse(this.config);
    }

    /**
     * Get configuration for specific component
     * @param {string} component - Component name
     * @returns {Object} Component configuration
     */
    getComponentConfig(component) {
        return this.config[component] || {};
    }

    /**
     * Export configuration to JSON
     * @returns {string} JSON configuration
     */
    toJSON() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Load configuration from JSON
     * @param {string} json - JSON configuration
     */
    fromJSON(json) {
        const config = JSON.parse(json);
        this.update(config);
    }

    // Private methods

    /**
     * Get base configuration
     * @returns {Object} Base configuration
     * @private
     */
    _getBaseConfig() {
        return ErrorHandlingConfigSchema.parse({});
    }

    /**
     * Get environment-specific configuration
     * @returns {Object} Environment configuration
     * @private
     */
    _getEnvironmentConfig() {
        return EnvironmentPresets[this.environment] || {};
    }

    /**
     * Merge multiple configuration objects
     * @param {...Object} configs - Configuration objects to merge
     * @returns {Object} Merged configuration
     * @private
     */
    _mergeConfigs(...configs) {
        return configs.reduce((merged, config) => {
            return this._deepMerge(merged, config);
        }, {});
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     * @private
     */
    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (
                    typeof source[key] === 'object' &&
                    source[key] !== null &&
                    !Array.isArray(source[key]) &&
                    typeof target[key] === 'object' &&
                    target[key] !== null &&
                    !Array.isArray(target[key])
                ) {
                    result[key] = this._deepMerge(target[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }

    /**
     * Get nested value from object by path
     * @param {Object} obj - Object to search
     * @param {string} path - Path to value
     * @returns {any} Value at path
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Set nested value in object by path
     * @param {Object} obj - Object to modify
     * @param {string} path - Path to value
     * @param {any} value - Value to set
     * @private
     */
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
    }

    /**
     * Resolve environment variables in configuration
     * @private
     */
    _resolveEnvironmentVariables() {
        // Codegen integration
        if (!this.config.integrations.codegen.apiKey) {
            this.config.integrations.codegen.apiKey = process.env.CODEGEN_API_KEY;
        }
        if (!this.config.integrations.codegen.orgId) {
            this.config.integrations.codegen.orgId = process.env.CODEGEN_ORG_ID;
        }
        if (process.env.CODEGEN_API_URL) {
            this.config.integrations.codegen.apiUrl = process.env.CODEGEN_API_URL;
        }

        // Linear integration
        if (!this.config.integrations.linear.apiKey) {
            this.config.integrations.linear.apiKey = process.env.LINEAR_API_KEY;
        }
        if (!this.config.integrations.linear.teamId) {
            this.config.integrations.linear.teamId = process.env.LINEAR_TEAM_ID;
        }

        // Notification channels
        if (!this.config.integrations.notifications.channels.slack.webhookUrl) {
            this.config.integrations.notifications.channels.slack.webhookUrl = process.env.SLACK_WEBHOOK_URL;
        }
        if (!this.config.integrations.notifications.channels.email.smtpHost) {
            this.config.integrations.notifications.channels.email.smtpHost = process.env.SMTP_HOST;
        }
        if (!this.config.integrations.notifications.channels.email.username) {
            this.config.integrations.notifications.channels.email.username = process.env.SMTP_USERNAME;
        }
        if (!this.config.integrations.notifications.channels.email.password) {
            this.config.integrations.notifications.channels.email.password = process.env.SMTP_PASSWORD;
        }

        // Database
        if (!this.config.integrations.database.connectionString) {
            this.config.integrations.database.connectionString = process.env.DATABASE_URL;
        }

        // Security
        if (!this.config.security.encryptionKey) {
            this.config.security.encryptionKey = process.env.ENCRYPTION_KEY;
        }
    }
}

/**
 * Create configuration for specific environment
 * @param {string} environment - Environment name
 * @param {Object} overrides - Configuration overrides
 * @returns {ErrorHandlingConfig} Configuration instance
 */
export function createEnvironmentConfig(environment, overrides = {}) {
    return new ErrorHandlingConfig(overrides, environment);
}

/**
 * Get default configuration
 * @returns {ErrorHandlingConfig} Default configuration
 */
export function getDefaultConfig() {
    return new ErrorHandlingConfig();
}

/**
 * Validate configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
    return ErrorHandlingConfigSchema.safeParse(config);
}

export { ErrorHandlingConfigSchema, EnvironmentPresets };
export default ErrorHandlingConfig;

