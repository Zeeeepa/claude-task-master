/**
 * @fileoverview OpenEvolve Configuration
 * @description Configuration settings for the OpenEvolve Central Orchestrator system.
 */

/**
 * OpenEvolve system configuration
 */
export const openEvolveConfig = {
    // Core orchestrator settings
    orchestrator: {
        maxConcurrentWorkflows: 10,
        maxConcurrentTasks: 5,
        taskTimeout: 300000, // 5 minutes
        workflowTimeout: 3600000, // 1 hour
        enableParallelExecution: true,
        enableStateRecovery: true,
        enableLearning: true
    },

    // AI Analysis Engine settings
    analysis: {
        enableNLP: true,
        enableContextAnalysis: true,
        enableComplexityEstimation: true,
        confidenceThreshold: 0.7,
        maxAnalysisTime: 30000, // 30 seconds
        cacheAnalysisResults: true,
        cacheTTL: 3600000 // 1 hour
    },

    // Task Decomposition settings
    decomposition: {
        maxTaskDepth: 5,
        maxTasksPerFeature: 20,
        enableSpecializedDecomposers: true,
        enableCrossCuttingConcerns: true,
        defaultTaskPriority: 'medium',
        defaultEstimatedEffort: 2
    },

    // Dependency Mapping settings
    dependencies: {
        enableAutomaticMapping: true,
        enableCycleDetection: true,
        enableOptimization: true,
        maxDependencyDepth: 10,
        enableImplicitDependencies: true,
        dependencyStrengthThreshold: 0.5
    },

    // Workflow Monitoring settings
    monitoring: {
        pollingInterval: 30000, // 30 seconds
        maxRetries: 3,
        retryBackoffMultiplier: 2,
        enableRealTimeUpdates: true,
        enableProgressTracking: true,
        enableFailureRecovery: true,
        stuckWorkflowThreshold: 600000 // 10 minutes
    },

    // Integration settings
    integrations: {
        linear: {
            enabled: true,
            createMainIssues: true,
            createSubIssues: true,
            updateProgress: true,
            enableComments: true,
            defaultLabels: ['openevolve', 'autonomous-development']
        },
        codegen: {
            enabled: true,
            autoAssignTasks: true,
            enableTaskMonitoring: true,
            taskAssignmentDelay: 5000 // 5 seconds
        },
        claudeCode: {
            enabled: true,
            enableValidation: true,
            enableDeployment: false,
            validationTimeout: 300000 // 5 minutes
        },
        database: {
            enabled: true,
            enableWorkflowPersistence: true,
            enableTaskPersistence: true,
            enableAnalyticsPersistence: true,
            connectionPoolSize: 10
        }
    },

    // Performance settings
    performance: {
        analysisPerformanceTarget: 30000, // 30 seconds
        decompositionPerformanceTarget: 60000, // 1 minute
        dependencyMappingPerformanceTarget: 30000, // 30 seconds
        workflowInitiationPerformanceTarget: 120000, // 2 minutes
        enablePerformanceMonitoring: true,
        enablePerformanceOptimization: true
    },

    // Scalability settings
    scalability: {
        maxConcurrentWorkflows: 100,
        maxTasksPerWorkflow: 1000,
        enableHorizontalScaling: false,
        enableLoadBalancing: false,
        enableCaching: true,
        cacheSize: 1000
    },

    // Security settings
    security: {
        enableSecureProcessing: true,
        enableInputValidation: true,
        enableOutputSanitization: true,
        enableAuditLogging: true,
        enableAccessControl: true,
        requireAuthentication: false
    },

    // AI Security settings
    aiSecurity: {
        enableBiasDetection: true,
        enableOutputVerification: true,
        enableInputSanitization: true,
        maxInputLength: 10000,
        enableContentFiltering: true
    },

    // Logging settings
    logging: {
        level: 'info', // debug, info, warn, error
        enableFileLogging: true,
        enableConsoleLogging: true,
        logRotation: true,
        maxLogFileSize: '10MB',
        maxLogFiles: 5,
        enableStructuredLogging: true
    },

    // Error handling settings
    errorHandling: {
        enableGracefulDegradation: true,
        enableErrorRecovery: true,
        enableErrorReporting: true,
        maxErrorRetries: 3,
        errorRetryDelay: 5000, // 5 seconds
        enableCircuitBreaker: true
    },

    // Feature flags
    features: {
        enableAdvancedAnalytics: true,
        enableMachineLearning: false,
        enablePredictiveAnalysis: false,
        enableAutoOptimization: true,
        enableExperimentalFeatures: false
    },

    // Development settings
    development: {
        enableDebugMode: false,
        enableVerboseLogging: false,
        enableTestMode: false,
        enableMockIntegrations: false,
        enablePerformanceProfiling: false
    },

    // API settings
    api: {
        version: '1.0.0',
        enableRateLimiting: true,
        rateLimitRequests: 100,
        rateLimitWindow: 60000, // 1 minute
        enableCORS: true,
        enableCompression: true
    },

    // Notification settings
    notifications: {
        enableWorkflowNotifications: true,
        enableTaskNotifications: true,
        enableErrorNotifications: true,
        enableProgressNotifications: true,
        notificationChannels: ['linear', 'email'],
        notificationThrottling: 60000 // 1 minute
    },

    // Analytics settings
    analytics: {
        enableWorkflowAnalytics: true,
        enableTaskAnalytics: true,
        enablePerformanceAnalytics: true,
        enableUserAnalytics: false,
        analyticsRetentionDays: 90,
        enableRealTimeAnalytics: true
    },

    // Backup and recovery settings
    backup: {
        enableAutomaticBackup: true,
        backupInterval: 86400000, // 24 hours
        backupRetentionDays: 30,
        enablePointInTimeRecovery: true,
        enableIncrementalBackup: true
    }
};

/**
 * Environment-specific configuration overrides
 */
export const environmentConfigs = {
    development: {
        logging: {
            level: 'debug',
            enableVerboseLogging: true
        },
        development: {
            enableDebugMode: true,
            enableTestMode: true,
            enableMockIntegrations: true
        },
        performance: {
            enablePerformanceMonitoring: false
        }
    },

    testing: {
        integrations: {
            linear: { enabled: false },
            codegen: { enabled: false },
            claudeCode: { enabled: false }
        },
        development: {
            enableTestMode: true,
            enableMockIntegrations: true
        },
        notifications: {
            enableWorkflowNotifications: false,
            enableTaskNotifications: false
        }
    },

    staging: {
        scalability: {
            maxConcurrentWorkflows: 50,
            maxTasksPerWorkflow: 500
        },
        backup: {
            backupInterval: 43200000, // 12 hours
            backupRetentionDays: 14
        }
    },

    production: {
        logging: {
            level: 'warn'
        },
        security: {
            requireAuthentication: true,
            enableAccessControl: true
        },
        performance: {
            enablePerformanceOptimization: true
        },
        scalability: {
            enableHorizontalScaling: true,
            enableLoadBalancing: true
        },
        features: {
            enableExperimentalFeatures: false
        }
    }
};

/**
 * Get configuration for current environment
 * @param {string} environment - Environment name (development, testing, staging, production)
 * @returns {Object} Merged configuration
 */
export function getConfig(environment = 'development') {
    const baseConfig = { ...openEvolveConfig };
    const envConfig = environmentConfigs[environment] || {};
    
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Deep merge configuration objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = mergeDeep(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Required settings validation
    if (!config.orchestrator) {
        errors.push('orchestrator configuration is required');
    }

    if (!config.integrations) {
        errors.push('integrations configuration is required');
    }

    // Performance validation
    if (config.performance?.analysisPerformanceTarget < 10000) {
        warnings.push('analysisPerformanceTarget is very low, may cause timeouts');
    }

    // Scalability validation
    if (config.scalability?.maxConcurrentWorkflows > 1000) {
        warnings.push('maxConcurrentWorkflows is very high, may impact performance');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

export default {
    openEvolveConfig,
    environmentConfigs,
    getConfig,
    validateConfig
};

