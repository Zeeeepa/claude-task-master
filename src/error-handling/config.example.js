/**
 * @fileoverview Error Handling Configuration Example
 * @description Example configuration for the error handling system
 */

/**
 * Comprehensive error handling configuration
 */
export const errorHandlingConfig = {
    // Global settings
    enableRetry: true,
    enableCircuitBreaker: true,
    enableEscalation: true,
    enableRecovery: true,
    enableCodegen: true,
    enableEnvironmentReset: true,
    enableNotifications: true,
    enableAnalytics: true,
    enableTracking: true,
    enableReporting: true,

    // Error classification configuration
    classification: {
        confidenceThreshold: 0.8,
        enableMachineLearning: true,
        updatePatterns: true
    },

    // Retry system configuration
    retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBase: 2,
        jitterEnabled: true,
        jitterRange: 0.1
    },

    // Circuit breaker configuration
    circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 300000,
        halfOpenMaxCalls: 3,
        successThreshold: 2
    },

    // Escalation configuration
    escalation: {
        codegenThreshold: 2, // failures before triggering Codegen
        manualThreshold: 5,  // failures before manual intervention
        systemResetThreshold: 10,
        escalationTimeout: 300000, // 5 minutes
        maxConcurrentEscalations: 10,
        enableAutoRecovery: true
    },

    // Recovery strategies configuration
    recovery: {
        timeoutMs: 300000, // 5 minutes
        maxRetries: 3,
        enableFileBackup: true,
        backupDir: '.recovery-backups'
    },

    // Codegen integration configuration
    codegen: {
        apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID,
        timeout: 300000, // 5 minutes
        maxRetries: 3,
        enableAutoMerge: true,
        confidenceThreshold: 0.8
    },

    // Environment reset configuration
    environmentReset: {
        timeoutMs: 600000, // 10 minutes
        backupEnabled: true,
        backupDir: '.environment-backups',
        preserveUserData: true,
        allowDestructiveOperations: false // Set to true for production environments
    },

    // Notification system configuration
    notifications: {
        enableRateLimiting: true,
        rateLimitWindow: 300000, // 5 minutes
        maxNotificationsPerWindow: 10,
        enableBatching: true,
        batchInterval: 60000, // 1 minute
        batchSize: 5,
        retryAttempts: 3,
        retryDelay: 5000,
        
        // Channel configurations
        channels: {
            slack: {
                webhookUrl: process.env.NOTIFICATION_SLACK_WEBHOOK,
                channel: '#alerts',
                username: 'Error Handler Bot'
            },
            email: {
                smtpHost: process.env.NOTIFICATION_EMAIL_SMTP_HOST,
                smtpPort: process.env.NOTIFICATION_EMAIL_SMTP_PORT,
                smtpUser: process.env.NOTIFICATION_EMAIL_SMTP_USER,
                smtpPass: process.env.NOTIFICATION_EMAIL_SMTP_PASS,
                from: 'alerts@yourcompany.com',
                to: ['dev-team@yourcompany.com']
            },
            linear: {
                apiKey: process.env.LINEAR_API_KEY,
                teamId: process.env.LINEAR_TEAM_ID
            }
        }
    },

    // Analytics configuration
    analytics: {
        retentionPeriod: 2592000000, // 30 days
        analysisInterval: 3600000, // 1 hour
        trendThreshold: 0.2, // 20% change
        volatilityThreshold: 0.5, // 50% variance
        enablePrediction: true,
        predictionWindow: 86400000 // 24 hours
    },

    // Failure tracking configuration
    tracking: {
        trackingWindow: 86400000, // 24 hours
        sampleInterval: 300000, // 5 minutes
        alertThresholds: {
            failureRate: 0.1, // 10%
            successRate: 0.9, // 90%
            mttr: 3600000, // 1 hour
            availability: 0.95 // 95%
        },
        retentionPeriod: 2592000000, // 30 days
        enableAlerting: true
    },

    // Reporting configuration
    reporting: {
        defaultFormat: 'json',
        enableScheduledReports: true,
        reportSchedule: '0 0 * * *', // Daily at midnight
        retentionPeriod: 2592000000, // 30 days
        maxReportSize: 10485760, // 10MB
        enableDashboard: true,
        dashboardPort: 3001
    }
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
    development: {
        ...errorHandlingConfig,
        // More lenient settings for development
        retry: {
            ...errorHandlingConfig.retry,
            maxRetries: 5,
            baseDelay: 500
        },
        escalation: {
            ...errorHandlingConfig.escalation,
            codegenThreshold: 1,
            manualThreshold: 3
        },
        notifications: {
            ...errorHandlingConfig.notifications,
            enableRateLimiting: false,
            channels: {
                slack: {
                    webhookUrl: process.env.DEV_SLACK_WEBHOOK,
                    channel: '#dev-alerts'
                }
            }
        }
    },

    staging: {
        ...errorHandlingConfig,
        // Balanced settings for staging
        escalation: {
            ...errorHandlingConfig.escalation,
            codegenThreshold: 2,
            manualThreshold: 4
        },
        environmentReset: {
            ...errorHandlingConfig.environmentReset,
            allowDestructiveOperations: true
        }
    },

    production: {
        ...errorHandlingConfig,
        // Strict settings for production
        retry: {
            ...errorHandlingConfig.retry,
            maxRetries: 2,
            baseDelay: 2000
        },
        escalation: {
            ...errorHandlingConfig.escalation,
            codegenThreshold: 3,
            manualThreshold: 5,
            enableAutoRecovery: false
        },
        environmentReset: {
            ...errorHandlingConfig.environmentReset,
            allowDestructiveOperations: false,
            preserveUserData: true
        },
        notifications: {
            ...errorHandlingConfig.notifications,
            rateLimitWindow: 60000, // 1 minute
            maxNotificationsPerWindow: 5,
            channels: {
                slack: {
                    webhookUrl: process.env.PROD_SLACK_WEBHOOK,
                    channel: '#critical-alerts'
                },
                email: {
                    ...errorHandlingConfig.notifications.channels.email,
                    to: ['oncall@yourcompany.com', 'cto@yourcompany.com']
                },
                linear: {
                    apiKey: process.env.LINEAR_API_KEY,
                    teamId: process.env.LINEAR_PROD_TEAM_ID
                }
            }
        }
    }
};

/**
 * Component-specific configurations
 */
export const componentConfigs = {
    // Configuration for build systems
    buildSystem: {
        ...errorHandlingConfig,
        classification: {
            ...errorHandlingConfig.classification,
            // Custom patterns for build errors
            customPatterns: {
                webpack: /webpack.*error|compilation.*failed/i,
                typescript: /typescript.*error|ts\(\d+\)/i,
                eslint: /eslint.*error|parsing.*error/i
            }
        },
        recovery: {
            ...errorHandlingConfig.recovery,
            // Build-specific recovery strategies
            strategies: ['clear_cache', 'reinstall_deps', 'reset_config']
        }
    },

    // Configuration for API services
    apiService: {
        ...errorHandlingConfig,
        retry: {
            ...errorHandlingConfig.retry,
            maxRetries: 5,
            baseDelay: 1000
        },
        circuitBreaker: {
            ...errorHandlingConfig.circuitBreaker,
            failureThreshold: 3,
            resetTimeout: 30000
        }
    },

    // Configuration for database operations
    database: {
        ...errorHandlingConfig,
        retry: {
            ...errorHandlingConfig.retry,
            maxRetries: 3,
            baseDelay: 2000,
            maxDelay: 10000
        },
        escalation: {
            ...errorHandlingConfig.escalation,
            codegenThreshold: 1, // Database errors need immediate attention
            manualThreshold: 2
        }
    }
};

/**
 * Get configuration for current environment
 * @param {string} environment - Environment name
 * @returns {Object} Environment configuration
 */
export function getEnvironmentConfig(environment = 'development') {
    return environmentConfigs[environment] || environmentConfigs.development;
}

/**
 * Get configuration for specific component
 * @param {string} component - Component name
 * @param {string} environment - Environment name
 * @returns {Object} Component configuration
 */
export function getComponentConfig(component, environment = 'development') {
    const envConfig = getEnvironmentConfig(environment);
    const compConfig = componentConfigs[component];
    
    if (compConfig) {
        // Merge environment and component configs
        return {
            ...envConfig,
            ...compConfig,
            // Deep merge nested objects
            classification: {
                ...envConfig.classification,
                ...compConfig.classification
            },
            retry: {
                ...envConfig.retry,
                ...compConfig.retry
            },
            escalation: {
                ...envConfig.escalation,
                ...compConfig.escalation
            }
        };
    }
    
    return envConfig;
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (config.enableCodegen && !config.codegen?.apiKey) {
        errors.push('Codegen API key is required when Codegen is enabled');
    }

    if (config.enableNotifications && !config.notifications?.channels) {
        warnings.push('No notification channels configured');
    }

    // Check numeric values
    if (config.retry?.maxRetries < 0) {
        errors.push('maxRetries must be non-negative');
    }

    if (config.retry?.baseDelay < 0) {
        errors.push('baseDelay must be non-negative');
    }

    if (config.circuitBreaker?.failureThreshold < 1) {
        errors.push('failureThreshold must be at least 1');
    }

    // Check timeouts
    if (config.retry?.maxDelay < config.retry?.baseDelay) {
        warnings.push('maxDelay should be greater than baseDelay');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Environment variables required for full functionality
 */
export const requiredEnvironmentVariables = {
    // Codegen integration
    CODEGEN_API_URL: 'Codegen API URL',
    CODEGEN_API_KEY: 'Codegen API key',
    CODEGEN_ORG_ID: 'Codegen organization ID',

    // Notification channels
    NOTIFICATION_SLACK_WEBHOOK: 'Slack webhook URL for notifications',
    NOTIFICATION_EMAIL_SMTP_HOST: 'SMTP host for email notifications',
    NOTIFICATION_EMAIL_SMTP_PORT: 'SMTP port for email notifications',
    NOTIFICATION_EMAIL_SMTP_USER: 'SMTP username for email notifications',
    NOTIFICATION_EMAIL_SMTP_PASS: 'SMTP password for email notifications',

    // Linear integration
    LINEAR_API_KEY: 'Linear API key',
    LINEAR_TEAM_ID: 'Linear team ID',

    // Environment-specific
    DEV_SLACK_WEBHOOK: 'Development Slack webhook',
    PROD_SLACK_WEBHOOK: 'Production Slack webhook',
    LINEAR_PROD_TEAM_ID: 'Production Linear team ID'
};

/**
 * Check if all required environment variables are set
 * @param {Array} required - List of required variables
 * @returns {Object} Check result
 */
export function checkEnvironmentVariables(required = Object.keys(requiredEnvironmentVariables)) {
    const missing = [];
    const present = [];

    for (const variable of required) {
        if (process.env[variable]) {
            present.push(variable);
        } else {
            missing.push({
                name: variable,
                description: requiredEnvironmentVariables[variable]
            });
        }
    }

    return {
        allPresent: missing.length === 0,
        missing,
        present,
        total: required.length
    };
}

export default errorHandlingConfig;

