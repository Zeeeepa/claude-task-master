/**
 * @fileoverview Webhook Configuration
 * @description Centralized configuration for the webhook system and event-driven automation
 */

/**
 * Default webhook system configuration
 */
export const defaultWebhookConfig = {
    // Server configuration
    server: {
        port: process.env.WEBHOOK_PORT || 3000,
        host: process.env.WEBHOOK_HOST || '0.0.0.0',
        cors: {
            origin: true,
            credentials: true
        },
        compression: true,
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // limit each IP to 1000 requests per windowMs
            message: 'Too many webhook requests from this IP'
        }
    },

    // Webhook sources configuration
    webhooks: {
        github: {
            secret: process.env.GITHUB_WEBHOOK_SECRET,
            events: ['pull_request', 'push', 'issue_comment', 'workflow_run'],
            path: '/webhooks/github',
            enableValidation: true,
            enableIPWhitelist: true
        },
        linear: {
            secret: process.env.LINEAR_WEBHOOK_SECRET,
            events: ['issue.update', 'issue.create', 'issue.remove'],
            path: '/webhooks/linear',
            enableValidation: true,
            enableIPWhitelist: false
        },
        codegen: {
            secret: process.env.CODEGEN_WEBHOOK_SECRET,
            events: ['generation.complete', 'generation.failed'],
            path: '/webhooks/codegen',
            enableValidation: true,
            enableIPWhitelist: false
        },
        claude_code: {
            secret: process.env.CLAUDE_CODE_WEBHOOK_SECRET,
            events: ['validation.complete', 'validation.failed'],
            path: '/webhooks/claude-code',
            enableValidation: true,
            enableIPWhitelist: false
        }
    },

    // Event queue configuration
    eventQueue: {
        backend: process.env.EVENT_QUEUE_BACKEND || 'memory', // 'memory', 'redis', 'postgresql'
        maxQueueSize: parseInt(process.env.EVENT_QUEUE_MAX_SIZE) || 10000,
        processingConcurrency: parseInt(process.env.EVENT_QUEUE_CONCURRENCY) || 5,
        processingTimeout: parseInt(process.env.EVENT_QUEUE_TIMEOUT) || 30000,
        retryDelay: parseInt(process.env.EVENT_QUEUE_RETRY_DELAY) || 5000,
        maxRetries: parseInt(process.env.EVENT_QUEUE_MAX_RETRIES) || 3,
        enablePersistence: process.env.EVENT_QUEUE_PERSISTENCE !== 'false'
    },

    // Event router configuration
    eventRouter: {
        enableContextRouting: process.env.EVENT_ROUTER_CONTEXT !== 'false',
        enablePriorityRouting: process.env.EVENT_ROUTER_PRIORITY !== 'false',
        enableLoadBalancing: process.env.EVENT_ROUTER_LOAD_BALANCING !== 'false',
        defaultPriority: parseInt(process.env.EVENT_ROUTER_DEFAULT_PRIORITY) || 5
    },

    // Event store configuration
    eventStore: {
        backend: process.env.EVENT_STORE_BACKEND || 'memory', // 'memory', 'postgresql', 'mongodb'
        maxEvents: parseInt(process.env.EVENT_STORE_MAX_EVENTS) || 100000,
        retentionDays: parseInt(process.env.EVENT_STORE_RETENTION_DAYS) || 30,
        enableCompression: process.env.EVENT_STORE_COMPRESSION !== 'false',
        enableIndexing: process.env.EVENT_STORE_INDEXING !== 'false',
        batchSize: parseInt(process.env.EVENT_STORE_BATCH_SIZE) || 100,
        flushInterval: parseInt(process.env.EVENT_STORE_FLUSH_INTERVAL) || 5000
    },

    // Retry manager configuration
    retryManager: {
        maxRetries: parseInt(process.env.RETRY_MANAGER_MAX_RETRIES) || 3,
        baseDelay: parseInt(process.env.RETRY_MANAGER_BASE_DELAY) || 1000,
        maxDelay: parseInt(process.env.RETRY_MANAGER_MAX_DELAY) || 300000,
        backoffMultiplier: parseFloat(process.env.RETRY_MANAGER_BACKOFF_MULTIPLIER) || 2,
        jitterFactor: parseFloat(process.env.RETRY_MANAGER_JITTER_FACTOR) || 0.1,
        enableCircuitBreaker: process.env.RETRY_MANAGER_CIRCUIT_BREAKER !== 'false',
        circuitBreakerThreshold: parseInt(process.env.RETRY_MANAGER_CB_THRESHOLD) || 5,
        circuitBreakerTimeout: parseInt(process.env.RETRY_MANAGER_CB_TIMEOUT) || 60000
    },

    // Webhook validator configuration
    webhookValidator: {
        enableTimestampValidation: process.env.WEBHOOK_VALIDATOR_TIMESTAMP !== 'false',
        timestampTolerance: parseInt(process.env.WEBHOOK_VALIDATOR_TIMESTAMP_TOLERANCE) || 300,
        enableIPWhitelist: process.env.WEBHOOK_VALIDATOR_IP_WHITELIST === 'true',
        allowedIPs: process.env.WEBHOOK_VALIDATOR_ALLOWED_IPS?.split(',') || [],
        enableRateLimiting: process.env.WEBHOOK_VALIDATOR_RATE_LIMITING !== 'false'
    },

    // Rate limiter configuration
    rateLimiter: {
        windowMs: parseInt(process.env.RATE_LIMITER_WINDOW_MS) || 60000,
        maxRequests: parseInt(process.env.RATE_LIMITER_MAX_REQUESTS) || 100,
        enableBackpressure: process.env.RATE_LIMITER_BACKPRESSURE !== 'false',
        backpressureThreshold: parseFloat(process.env.RATE_LIMITER_BACKPRESSURE_THRESHOLD) || 0.8,
        enableBurst: process.env.RATE_LIMITER_BURST !== 'false',
        burstLimit: parseInt(process.env.RATE_LIMITER_BURST_LIMIT) || 20,
        burstWindowMs: parseInt(process.env.RATE_LIMITER_BURST_WINDOW_MS) || 10000,
        enableSlowDown: process.env.RATE_LIMITER_SLOW_DOWN !== 'false',
        slowDownThreshold: parseFloat(process.env.RATE_LIMITER_SLOW_DOWN_THRESHOLD) || 0.7,
        slowDownDelay: parseInt(process.env.RATE_LIMITER_SLOW_DOWN_DELAY) || 1000,
        enableAdaptive: process.env.RATE_LIMITER_ADAPTIVE !== 'false',
        adaptiveWindow: parseInt(process.env.RATE_LIMITER_ADAPTIVE_WINDOW) || 300000
    },

    // Event deduplicator configuration
    eventDeduplicator: {
        windowMs: parseInt(process.env.EVENT_DEDUPLICATOR_WINDOW_MS) || 300000,
        maxEntries: parseInt(process.env.EVENT_DEDUPLICATOR_MAX_ENTRIES) || 10000,
        hashAlgorithm: process.env.EVENT_DEDUPLICATOR_HASH_ALGORITHM || 'sha256',
        enableContentHashing: process.env.EVENT_DEDUPLICATOR_CONTENT_HASHING !== 'false',
        enableTimestampCheck: process.env.EVENT_DEDUPLICATOR_TIMESTAMP_CHECK !== 'false',
        timestampTolerance: parseInt(process.env.EVENT_DEDUPLICATOR_TIMESTAMP_TOLERANCE) || 60000,
        enableSourceSpecificLogic: process.env.EVENT_DEDUPLICATOR_SOURCE_SPECIFIC !== 'false'
    },

    // Workflow engine configuration
    workflow: {
        maxConcurrentWorkflows: parseInt(process.env.WORKFLOW_MAX_CONCURRENT) || 10,
        workflowTimeout: parseInt(process.env.WORKFLOW_TIMEOUT) || 300000,
        enableRetry: process.env.WORKFLOW_RETRY !== 'false',
        maxRetries: parseInt(process.env.WORKFLOW_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.WORKFLOW_RETRY_DELAY) || 5000
    },

    // GitHub handler configuration
    githubHandler: {
        autoTriggerValidation: process.env.GITHUB_HANDLER_AUTO_VALIDATION !== 'false',
        autoUpdateLinear: process.env.GITHUB_HANDLER_AUTO_UPDATE_LINEAR !== 'false',
        prValidationDelay: parseInt(process.env.GITHUB_HANDLER_PR_VALIDATION_DELAY) || 5000
    },

    // Linear handler configuration
    linearHandler: {
        autoTriggerCodegen: process.env.LINEAR_HANDLER_AUTO_CODEGEN !== 'false',
        autoUpdateGitHub: process.env.LINEAR_HANDLER_AUTO_UPDATE_GITHUB !== 'false',
        codegenTriggerStates: process.env.LINEAR_HANDLER_CODEGEN_STATES?.split(',') || ['In Progress', 'Todo'],
        completedStates: process.env.LINEAR_HANDLER_COMPLETED_STATES?.split(',') || ['Done', 'Completed']
    },

    // Monitoring configuration
    monitoring: {
        enableMetrics: process.env.MONITORING_METRICS !== 'false',
        enableHealthChecks: process.env.MONITORING_HEALTH_CHECKS !== 'false',
        healthCheckInterval: parseInt(process.env.MONITORING_HEALTH_CHECK_INTERVAL) || 30000,
        metricsInterval: parseInt(process.env.MONITORING_METRICS_INTERVAL) || 60000
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableRequestLogging: process.env.LOG_REQUESTS !== 'false',
        enableErrorLogging: process.env.LOG_ERRORS !== 'false',
        enablePerformanceLogging: process.env.LOG_PERFORMANCE !== 'false'
    }
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
    development: {
        server: {
            port: 3001,
            cors: {
                origin: ['http://localhost:3000', 'http://localhost:3001'],
                credentials: true
            }
        },
        eventQueue: {
            backend: 'memory',
            maxQueueSize: 1000,
            processingConcurrency: 2
        },
        eventStore: {
            backend: 'memory',
            maxEvents: 10000,
            retentionDays: 7
        },
        logging: {
            level: 'debug',
            enableRequestLogging: true,
            enablePerformanceLogging: true
        },
        webhookValidator: {
            enableIPWhitelist: false,
            enableTimestampValidation: false
        }
    },

    testing: {
        server: {
            port: 0, // Random port for testing
        },
        eventQueue: {
            backend: 'memory',
            maxQueueSize: 100,
            processingConcurrency: 1,
            processingTimeout: 5000
        },
        eventStore: {
            backend: 'memory',
            maxEvents: 1000,
            retentionDays: 1
        },
        retryManager: {
            maxRetries: 1,
            baseDelay: 100,
            maxDelay: 1000
        },
        workflow: {
            maxConcurrentWorkflows: 2,
            workflowTimeout: 10000
        },
        logging: {
            level: 'error'
        },
        webhookValidator: {
            enableIPWhitelist: false,
            enableTimestampValidation: false,
            enableRateLimiting: false
        }
    },

    production: {
        server: {
            port: process.env.PORT || 8080,
            rateLimit: {
                windowMs: 15 * 60 * 1000,
                max: 2000
            }
        },
        eventQueue: {
            backend: 'postgresql',
            maxQueueSize: 50000,
            processingConcurrency: 10,
            enablePersistence: true
        },
        eventStore: {
            backend: 'postgresql',
            maxEvents: 1000000,
            retentionDays: 90,
            enableCompression: true,
            enableIndexing: true
        },
        retryManager: {
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 10
        },
        workflow: {
            maxConcurrentWorkflows: 50
        },
        webhookValidator: {
            enableIPWhitelist: true,
            enableTimestampValidation: true,
            enableRateLimiting: true
        },
        rateLimiter: {
            maxRequests: 500,
            enableAdaptive: true,
            enableBackpressure: true
        },
        monitoring: {
            enableMetrics: true,
            enableHealthChecks: true,
            healthCheckInterval: 15000
        },
        logging: {
            level: 'warn',
            enableRequestLogging: false,
            enableErrorLogging: true
        }
    }
};

/**
 * Create webhook configuration for environment
 * @param {string} environment - Environment name
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Merged configuration
 */
export function createWebhookConfig(environment = 'development', overrides = {}) {
    const envConfig = environmentConfigs[environment] || {};
    
    return mergeConfigs(defaultWebhookConfig, envConfig, overrides);
}

/**
 * Merge configuration objects deeply
 * @param {...Object} configs - Configuration objects to merge
 * @returns {Object} Merged configuration
 */
function mergeConfigs(...configs) {
    const result = {};
    
    for (const config of configs) {
        for (const [key, value] of Object.entries(config)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = mergeConfigs(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
    }
    
    return result;
}

/**
 * Validate webhook configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateWebhookConfig(config) {
    const errors = [];
    const warnings = [];

    // Validate required webhook secrets
    const webhookSources = ['github', 'linear', 'codegen', 'claude_code'];
    for (const source of webhookSources) {
        if (!config.webhooks?.[source]?.secret) {
            warnings.push(`No webhook secret configured for ${source}`);
        }
    }

    // Validate server configuration
    if (!config.server?.port || config.server.port < 1 || config.server.port > 65535) {
        errors.push('Invalid server port configuration');
    }

    // Validate event queue configuration
    if (config.eventQueue?.maxQueueSize < 1) {
        errors.push('Event queue max size must be greater than 0');
    }

    if (config.eventQueue?.processingConcurrency < 1) {
        errors.push('Event queue processing concurrency must be greater than 0');
    }

    // Validate retry configuration
    if (config.retryManager?.maxRetries < 0) {
        errors.push('Retry manager max retries cannot be negative');
    }

    if (config.retryManager?.baseDelay < 0) {
        errors.push('Retry manager base delay cannot be negative');
    }

    // Validate workflow configuration
    if (config.workflow?.maxConcurrentWorkflows < 1) {
        errors.push('Workflow max concurrent workflows must be greater than 0');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get configuration for specific component
 * @param {Object} config - Full configuration
 * @param {string} component - Component name
 * @returns {Object} Component configuration
 */
export function getComponentConfig(config, component) {
    return config[component] || {};
}

/**
 * Environment detection
 * @returns {string} Current environment
 */
export function detectEnvironment() {
    return process.env.NODE_ENV || 'development';
}

/**
 * Load webhook configuration from environment
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Webhook configuration
 */
export function loadWebhookConfig(overrides = {}) {
    const environment = detectEnvironment();
    const config = createWebhookConfig(environment, overrides);
    
    const validation = validateWebhookConfig(config);
    if (!validation.valid) {
        console.error('Webhook configuration validation failed:', validation.errors);
        throw new Error(`Invalid webhook configuration: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
        console.warn('Webhook configuration warnings:', validation.warnings);
    }

    return config;
}

export default {
    defaultWebhookConfig,
    environmentConfigs,
    createWebhookConfig,
    validateWebhookConfig,
    getComponentConfig,
    detectEnvironment,
    loadWebhookConfig
};

