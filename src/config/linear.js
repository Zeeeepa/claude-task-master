import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Linear Configuration
 * Centralized configuration for Linear API integration
 */

/**
 * Default Linear configuration
 */
export const DEFAULT_CONFIG = {
    // API Configuration
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
    organizationId: process.env.LINEAR_ORGANIZATION_ID,
    
    // Webhook Configuration
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
    webhookUrl: process.env.LINEAR_WEBHOOK_URL,
    validateSignature: process.env.LINEAR_VALIDATE_SIGNATURE !== 'false',
    
    // Client Options
    retryAttempts: parseInt(process.env.LINEAR_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.LINEAR_RETRY_DELAY) || 1000,
    timeout: parseInt(process.env.LINEAR_TIMEOUT) || 30000,
    
    // Orchestrator Options
    progressCheckInterval: parseInt(process.env.LINEAR_PROGRESS_INTERVAL) || 30000,
    maxRetries: parseInt(process.env.LINEAR_MAX_RETRIES) || 3,
    autoTransitions: process.env.LINEAR_AUTO_TRANSITIONS !== 'false',
    statusHistory: process.env.LINEAR_STATUS_HISTORY !== 'false',
    notifyOnChange: process.env.LINEAR_NOTIFY_ON_CHANGE !== 'false',
    
    // Issue Configuration
    defaultPriority: parseInt(process.env.LINEAR_DEFAULT_PRIORITY) || 3,
    defaultLabels: process.env.LINEAR_DEFAULT_LABELS?.split(',') || [],
    autoAssignCodegen: process.env.LINEAR_AUTO_ASSIGN_CODEGEN !== 'false',
    
    // Template Configuration
    useTemplates: process.env.LINEAR_USE_TEMPLATES !== 'false',
    templatePrefix: process.env.LINEAR_TEMPLATE_PREFIX || '',
    
    // Performance Configuration
    cacheEnabled: process.env.LINEAR_CACHE_ENABLED !== 'false',
    cacheTtl: parseInt(process.env.LINEAR_CACHE_TTL) || 300000, // 5 minutes
    batchSize: parseInt(process.env.LINEAR_BATCH_SIZE) || 10,
    
    // Logging Configuration
    logLevel: process.env.LINEAR_LOG_LEVEL || 'info',
    enableMetrics: process.env.LINEAR_ENABLE_METRICS !== 'false',
    
    // Feature Flags
    enableWebhooks: process.env.LINEAR_ENABLE_WEBHOOKS !== 'false',
    enableOrchestration: process.env.LINEAR_ENABLE_ORCHESTRATION !== 'false',
    enableStatusManagement: process.env.LINEAR_ENABLE_STATUS_MANAGEMENT !== 'false',
    enableProgressTracking: process.env.LINEAR_ENABLE_PROGRESS_TRACKING !== 'false'
};

/**
 * Environment-specific configurations
 */
export const ENVIRONMENT_CONFIGS = {
    development: {
        ...DEFAULT_CONFIG,
        logLevel: 'debug',
        retryAttempts: 1,
        progressCheckInterval: 10000, // 10 seconds for faster development
        validateSignature: false // Easier testing
    },
    
    staging: {
        ...DEFAULT_CONFIG,
        logLevel: 'info',
        retryAttempts: 2,
        progressCheckInterval: 20000, // 20 seconds
        validateSignature: true
    },
    
    production: {
        ...DEFAULT_CONFIG,
        logLevel: 'warn',
        retryAttempts: 3,
        progressCheckInterval: 30000, // 30 seconds
        validateSignature: true,
        enableMetrics: true
    }
};

/**
 * Status mapping configuration
 */
export const STATUS_MAPPING = {
    // Standard workflow states
    TODO: 'Todo',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Done',
    BLOCKED: 'Blocked',
    
    // Custom states for CICD workflow
    NEEDS_RESTRUCTURE: 'Needs Restructure',
    UNDER_REVIEW: 'Under Review',
    TESTING: 'Testing',
    DEPLOYED: 'Deployed',
    
    // Priority mapping
    PRIORITY: {
        URGENT: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
        NO_PRIORITY: 4
    }
};

/**
 * Label configuration
 */
export const LABEL_CONFIG = {
    // System labels
    SYSTEM_LABELS: [
        'cicd-system',
        'auto-generated',
        'codegen',
        'orchestrator'
    ],
    
    // Issue type labels
    TYPE_LABELS: [
        'main-issue',
        'sub-issue',
        'bug',
        'feature',
        'restructure',
        'enhancement'
    ],
    
    // Priority labels
    PRIORITY_LABELS: [
        'urgent',
        'high-priority',
        'medium-priority',
        'low-priority'
    ],
    
    // Component labels
    COMPONENT_LABELS: [
        'frontend',
        'backend',
        'database',
        'api',
        'integration',
        'testing',
        'deployment'
    ]
};

/**
 * Webhook event configuration
 */
export const WEBHOOK_CONFIG = {
    // Events to listen for
    EVENTS: [
        'Issue',
        'Comment',
        'IssueLabel',
        'WorkflowState'
    ],
    
    // Actions to process
    ACTIONS: [
        'create',
        'update',
        'remove'
    ],
    
    // Event processing options
    PROCESSING: {
        queueSize: 1000,
        batchSize: 10,
        processingTimeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    }
};

/**
 * Template configuration
 */
export const TEMPLATE_CONFIG = {
    // Template types
    TYPES: {
        MAIN_ISSUE: 'main-issue',
        SUB_ISSUE: 'sub-issue',
        BUG_REPORT: 'bug-report',
        FEATURE_REQUEST: 'feature-request',
        RESTRUCTURE: 'restructure'
    },
    
    // Template options
    OPTIONS: {
        includeMetadata: true,
        includeTimestamps: true,
        includeAssignee: true,
        includeLabels: true,
        formatMarkdown: true
    }
};

/**
 * Performance and monitoring configuration
 */
export const PERFORMANCE_CONFIG = {
    // Rate limiting
    RATE_LIMITS: {
        requestsPerMinute: 100,
        burstLimit: 20,
        backoffMultiplier: 2,
        maxBackoffDelay: 30000
    },
    
    // Monitoring thresholds
    THRESHOLDS: {
        responseTime: 2000, // 2 seconds
        errorRate: 0.05, // 5%
        queueDepth: 100,
        memoryUsage: 0.8 // 80%
    },
    
    // Health check configuration
    HEALTH_CHECK: {
        interval: 60000, // 1 minute
        timeout: 5000, // 5 seconds
        retries: 3
    }
};

/**
 * Get configuration for current environment
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Object} Environment-specific configuration
 */
export function getConfig(environment = null) {
    const env = environment || process.env.NODE_ENV || 'development';
    
    const config = ENVIRONMENT_CONFIGS[env] || DEFAULT_CONFIG;
    
    // Validate required configuration
    validateConfig(config);
    
    return config;
}

/**
 * Validate configuration
 * @param {Object} config - Configuration object
 * @throws {Error} If configuration is invalid
 */
export function validateConfig(config) {
    const required = ['apiKey', 'teamId'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required Linear configuration: ${missing.join(', ')}`);
    }
    
    // Validate numeric values
    if (config.retryAttempts < 0 || config.retryAttempts > 10) {
        throw new Error('retryAttempts must be between 0 and 10');
    }
    
    if (config.retryDelay < 100 || config.retryDelay > 60000) {
        throw new Error('retryDelay must be between 100ms and 60s');
    }
    
    if (config.progressCheckInterval < 5000) {
        throw new Error('progressCheckInterval must be at least 5 seconds');
    }
}

/**
 * Get webhook configuration
 * @returns {Object} Webhook configuration
 */
export function getWebhookConfig() {
    return {
        ...WEBHOOK_CONFIG,
        secret: DEFAULT_CONFIG.webhookSecret,
        url: DEFAULT_CONFIG.webhookUrl,
        validateSignature: DEFAULT_CONFIG.validateSignature
    };
}

/**
 * Get status mapping
 * @returns {Object} Status mapping configuration
 */
export function getStatusMapping() {
    return STATUS_MAPPING;
}

/**
 * Get label configuration
 * @returns {Object} Label configuration
 */
export function getLabelConfig() {
    return LABEL_CONFIG;
}

/**
 * Get template configuration
 * @returns {Object} Template configuration
 */
export function getTemplateConfig() {
    return TEMPLATE_CONFIG;
}

/**
 * Get performance configuration
 * @returns {Object} Performance configuration
 */
export function getPerformanceConfig() {
    return PERFORMANCE_CONFIG;
}

/**
 * Create Linear client configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Client configuration
 */
export function createClientConfig(overrides = {}) {
    const config = getConfig();
    
    return {
        apiKey: config.apiKey,
        teamId: config.teamId,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
        timeout: config.timeout,
        cacheEnabled: config.cacheEnabled,
        cacheTtl: config.cacheTtl,
        ...overrides
    };
}

/**
 * Create orchestrator configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Orchestrator configuration
 */
export function createOrchestratorConfig(overrides = {}) {
    const config = getConfig();
    
    return {
        progressCheckInterval: config.progressCheckInterval,
        maxRetries: config.maxRetries,
        autoTransitions: config.autoTransitions,
        statusHistory: config.statusHistory,
        notifyOnChange: config.notifyOnChange,
        ...overrides
    };
}

/**
 * Create webhook handler configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Webhook handler configuration
 */
export function createWebhookConfig(overrides = {}) {
    const config = getConfig();
    const webhookConfig = getWebhookConfig();
    
    return {
        webhookSecret: config.webhookSecret,
        validateSignature: config.validateSignature,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
        ...webhookConfig.PROCESSING,
        ...overrides
    };
}

/**
 * Create status manager configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Status manager configuration
 */
export function createStatusManagerConfig(overrides = {}) {
    const config = getConfig();
    
    return {
        autoTransitions: config.autoTransitions,
        statusHistory: config.statusHistory,
        notifyOnChange: config.notifyOnChange,
        ...overrides
    };
}

export default {
    getConfig,
    validateConfig,
    getWebhookConfig,
    getStatusMapping,
    getLabelConfig,
    getTemplateConfig,
    getPerformanceConfig,
    createClientConfig,
    createOrchestratorConfig,
    createWebhookConfig,
    createStatusManagerConfig,
    DEFAULT_CONFIG,
    ENVIRONMENT_CONFIGS,
    STATUS_MAPPING,
    LABEL_CONFIG,
    WEBHOOK_CONFIG,
    TEMPLATE_CONFIG,
    PERFORMANCE_CONFIG
};

