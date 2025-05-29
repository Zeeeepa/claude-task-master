/**
 * @fileoverview Configuration management for codegen integration system
 * Provides centralized configuration with environment variable support
 */

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    // Prompt Generator Configuration
    promptGenerator: {
        maxContextSize: 8000,
        includeCodeExamples: true,
        enhanceWithBestPractices: true,
        templateCacheSize: 100
    },

    // Codegen Client Configuration
    codegenClient: {
        apiUrl: 'https://api.codegen.sh',
        timeout: 60000,
        retryAttempts: 3,
        retryDelay: 2000,
        maxConcurrentRequests: 10,
        rateLimitPerMinute: 60
    },

    // PR Tracker Configuration
    prTracker: {
        storageBackend: 'memory',
        cleanupIntervalHours: 24,
        dataRetentionDays: 30,
        enableWebhooks: true
    },

    // Integration Configuration
    integration: {
        enableTracking: true,
        maxRetries: 3,
        retryDelay: 2000,
        enableMetrics: true,
        logLevel: 'info'
    },

    // Security Configuration
    security: {
        validateApiKeys: true,
        enableRateLimiting: true,
        maxRequestsPerHour: 1000,
        requireHttps: true
    }
};

/**
 * Environment-specific configurations
 */
const ENVIRONMENT_CONFIGS = {
    development: {
        promptGenerator: {
            maxContextSize: 4000,
            includeCodeExamples: false
        },
        codegenClient: {
            timeout: 30000,
            retryAttempts: 1
        },
        integration: {
            maxRetries: 1,
            logLevel: 'debug'
        },
        security: {
            requireHttps: false
        }
    },

    test: {
        promptGenerator: {
            maxContextSize: 2000
        },
        codegenClient: {
            timeout: 10000,
            retryAttempts: 0
        },
        prTracker: {
            storageBackend: 'memory',
            enableWebhooks: false
        },
        integration: {
            enableTracking: false,
            maxRetries: 0,
            logLevel: 'error'
        }
    },

    production: {
        promptGenerator: {
            maxContextSize: 12000,
            templateCacheSize: 500
        },
        codegenClient: {
            timeout: 120000,
            retryAttempts: 5,
            maxConcurrentRequests: 50
        },
        prTracker: {
            storageBackend: 'database',
            dataRetentionDays: 90
        },
        integration: {
            logLevel: 'warn'
        }
    }
};

/**
 * Configuration class for managing settings
 */
export class CodegenConfig {
    constructor(environment = null, customConfig = {}) {
        this.environment = environment || process.env.NODE_ENV || 'development';
        this.config = this._buildConfig(customConfig);
    }

    /**
     * Build the final configuration by merging defaults, environment, and custom configs
     * @private
     * @param {Object} customConfig - Custom configuration overrides
     * @returns {Object} Final configuration
     */
    _buildConfig(customConfig) {
        const envConfig = ENVIRONMENT_CONFIGS[this.environment] || {};
        
        return this._deepMerge(
            DEFAULT_CONFIG,
            envConfig,
            this._getEnvironmentVariables(),
            customConfig
        );
    }

    /**
     * Get configuration values from environment variables
     * @private
     * @returns {Object} Configuration from environment variables
     */
    _getEnvironmentVariables() {
        const envConfig = {};

        // Codegen Client Environment Variables
        if (process.env.CODEGEN_API_URL) {
            envConfig.codegenClient = envConfig.codegenClient || {};
            envConfig.codegenClient.apiUrl = process.env.CODEGEN_API_URL;
        }

        if (process.env.CODEGEN_API_KEY) {
            envConfig.codegenClient = envConfig.codegenClient || {};
            envConfig.codegenClient.apiKey = process.env.CODEGEN_API_KEY;
        }

        if (process.env.CODEGEN_TIMEOUT) {
            envConfig.codegenClient = envConfig.codegenClient || {};
            envConfig.codegenClient.timeout = parseInt(process.env.CODEGEN_TIMEOUT, 10);
        }

        // PR Tracker Environment Variables
        if (process.env.GITHUB_TOKEN) {
            envConfig.prTracker = envConfig.prTracker || {};
            envConfig.prTracker.githubToken = process.env.GITHUB_TOKEN;
        }

        if (process.env.WEBHOOK_SECRET) {
            envConfig.prTracker = envConfig.prTracker || {};
            envConfig.prTracker.webhookSecret = process.env.WEBHOOK_SECRET;
        }

        if (process.env.DATABASE_URL) {
            envConfig.prTracker = envConfig.prTracker || {};
            envConfig.prTracker.storageBackend = 'database';
            envConfig.prTracker.connectionString = process.env.DATABASE_URL;
        }

        // Integration Environment Variables
        if (process.env.CODEGEN_ENABLE_TRACKING) {
            envConfig.integration = envConfig.integration || {};
            envConfig.integration.enableTracking = process.env.CODEGEN_ENABLE_TRACKING === 'true';
        }

        if (process.env.CODEGEN_MAX_RETRIES) {
            envConfig.integration = envConfig.integration || {};
            envConfig.integration.maxRetries = parseInt(process.env.CODEGEN_MAX_RETRIES, 10);
        }

        if (process.env.CODEGEN_LOG_LEVEL) {
            envConfig.integration = envConfig.integration || {};
            envConfig.integration.logLevel = process.env.CODEGEN_LOG_LEVEL;
        }

        return envConfig;
    }

    /**
     * Deep merge multiple configuration objects
     * @private
     * @param {...Object} configs - Configuration objects to merge
     * @returns {Object} Merged configuration
     */
    _deepMerge(...configs) {
        const result = {};

        for (const config of configs) {
            for (const [key, value] of Object.entries(config)) {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    result[key] = this._deepMerge(result[key] || {}, value);
                } else {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Get configuration for a specific component
     * @param {string} component - Component name (promptGenerator, codegenClient, etc.)
     * @returns {Object} Component configuration
     */
    get(component) {
        return this.config[component] || {};
    }

    /**
     * Get the full configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Update configuration at runtime
     * @param {string} component - Component name
     * @param {Object} updates - Configuration updates
     */
    update(component, updates) {
        if (!this.config[component]) {
            this.config[component] = {};
        }
        
        this.config[component] = this._deepMerge(this.config[component], updates);
    }

    /**
     * Validate configuration
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Validate required API key in production
        if (this.environment === 'production') {
            if (!this.config.codegenClient?.apiKey) {
                errors.push('CODEGEN_API_KEY is required in production environment');
            }

            if (this.config.security?.requireHttps && 
                !this.config.codegenClient?.apiUrl?.startsWith('https://')) {
                errors.push('HTTPS is required in production environment');
            }
        }

        // Validate timeout values
        if (this.config.codegenClient?.timeout < 1000) {
            warnings.push('Codegen client timeout is very low, may cause request failures');
        }

        // Validate retry configuration
        if (this.config.integration?.maxRetries > 10) {
            warnings.push('High retry count may cause excessive API usage');
        }

        // Validate context size
        if (this.config.promptGenerator?.maxContextSize > 16000) {
            warnings.push('Large context size may cause API errors or high costs');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get configuration summary for logging
     * @returns {Object} Configuration summary (without sensitive data)
     */
    getSummary() {
        const summary = this._deepMerge({}, this.config);
        
        // Remove sensitive information
        if (summary.codegenClient?.apiKey) {
            summary.codegenClient.apiKey = '***';
        }
        if (summary.prTracker?.githubToken) {
            summary.prTracker.githubToken = '***';
        }
        if (summary.prTracker?.webhookSecret) {
            summary.prTracker.webhookSecret = '***';
        }
        if (summary.prTracker?.connectionString) {
            summary.prTracker.connectionString = '***';
        }

        return {
            environment: this.environment,
            config: summary
        };
    }
}

/**
 * Create a new configuration instance
 * @param {string} environment - Environment name
 * @param {Object} customConfig - Custom configuration overrides
 * @returns {CodegenConfig} Configuration instance
 */
export function createConfig(environment = null, customConfig = {}) {
    return new CodegenConfig(environment, customConfig);
}

/**
 * Get default configuration for an environment
 * @param {string} environment - Environment name
 * @returns {Object} Default configuration
 */
export function getDefaultConfig(environment = 'development') {
    const config = new CodegenConfig(environment);
    return config.getAll();
}

/**
 * Validate environment variables
 * @returns {Object} Validation result
 */
export function validateEnvironment() {
    const config = new CodegenConfig();
    return config.validate();
}

// Export default configurations
export { DEFAULT_CONFIG, ENVIRONMENT_CONFIGS };

export default {
    CodegenConfig,
    createConfig,
    getDefaultConfig,
    validateEnvironment,
    DEFAULT_CONFIG,
    ENVIRONMENT_CONFIGS
};

