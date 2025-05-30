/**
 * @fileoverview Codegen Configuration Management
 * @description Centralized configuration for Codegen SDK integration
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Codegen Configuration Manager
 */
export class CodegenConfig {
    constructor(options = {}) {
        this.config = this.loadConfiguration(options);
        this.validateConfiguration();
        
        log('debug', 'Codegen configuration initialized', {
            mode: this.config.mode,
            baseURL: this.config.api.baseURL,
            enableMock: this.config.api.enableMock
        });
    }

    /**
     * Load configuration from environment and options
     * @param {Object} options - Override options
     * @returns {Object} Configuration object
     */
    loadConfiguration(options = {}) {
        const env = process.env;
        
        return {
            // Environment mode
            mode: options.mode || env.NODE_ENV || env.CODEGEN_MODE || 'development',
            
            // API Configuration
            api: {
                baseURL: options.baseURL || env.CODEGEN_API_URL || 'https://api.codegen.sh',
                timeout: this._parseNumber(options.timeout || env.CODEGEN_API_TIMEOUT) || 120000,
                enableMock: this._parseBoolean(options.enableMock || env.CODEGEN_ENABLE_MOCK) || false
            },
            
            // Authentication
            auth: {
                token: options.token || env.CODEGEN_API_KEY || env.CODEGEN_TOKEN,
                orgId: options.orgId || env.CODEGEN_ORG_ID,
                validateOnInit: this._parseBoolean(options.validateOnInit || env.CODEGEN_VALIDATE_ON_INIT) || true
            },
            
            // Rate Limiting
            rateLimiting: {
                enabled: this._parseBoolean(options.rateLimitingEnabled || env.CODEGEN_RATE_LIMITING_ENABLED) || true,
                requestsPerSecond: this._parseNumber(options.requestsPerSecond || env.CODEGEN_REQUESTS_PER_SECOND) || 5,
                requestsPerMinute: this._parseNumber(options.requestsPerMinute || env.CODEGEN_REQUESTS_PER_MINUTE) || 60,
                requestsPerHour: this._parseNumber(options.requestsPerHour || env.CODEGEN_REQUESTS_PER_HOUR) || 1000,
                requestsPerDay: this._parseNumber(options.requestsPerDay || env.CODEGEN_REQUESTS_PER_DAY) || 10000,
                maxQueueSize: this._parseNumber(options.maxQueueSize || env.CODEGEN_MAX_QUEUE_SIZE) || 100
            },
            
            // Retry Configuration
            retry: {
                enabled: this._parseBoolean(options.retryEnabled || env.CODEGEN_RETRY_ENABLED) || true,
                maxRetries: this._parseNumber(options.maxRetries || env.CODEGEN_MAX_RETRIES) || 3,
                baseDelay: this._parseNumber(options.baseDelay || env.CODEGEN_RETRY_BASE_DELAY) || 1000,
                maxDelay: this._parseNumber(options.maxDelay || env.CODEGEN_RETRY_MAX_DELAY) || 30000
            },
            
            // Polling Configuration
            polling: {
                defaultInterval: this._parseNumber(options.pollInterval || env.CODEGEN_POLL_INTERVAL) || 10000,
                maxWaitTime: this._parseNumber(options.maxWaitTime || env.CODEGEN_MAX_WAIT_TIME) || 600000
            },
            
            // Usage Quotas
            quotas: {
                dailyLimit: this._parseNumber(options.dailyLimit || env.CODEGEN_DAILY_LIMIT) || 1000,
                monthlyLimit: this._parseNumber(options.monthlyLimit || env.CODEGEN_MONTHLY_LIMIT) || 10000,
                enableWarnings: this._parseBoolean(options.quotaWarnings || env.CODEGEN_QUOTA_WARNINGS) || true
            },
            
            // Logging Configuration
            logging: {
                level: options.logLevel || env.CODEGEN_LOG_LEVEL || 'info',
                enableRequestLogging: this._parseBoolean(options.enableRequestLogging || env.CODEGEN_LOG_REQUESTS) || false,
                enableResponseLogging: this._parseBoolean(options.enableResponseLogging || env.CODEGEN_LOG_RESPONSES) || false
            },
            
            // Feature Flags
            features: {
                enableProgressUpdates: this._parseBoolean(options.enableProgressUpdates) !== false,
                enableAutoMerge: this._parseBoolean(options.enableAutoMerge) || false,
                enableLinearIntegration: this._parseBoolean(options.enableLinearIntegration) !== false,
                enableDatabasePersistence: this._parseBoolean(options.enableDatabasePersistence) !== false,
                enableErrorRecovery: this._parseBoolean(options.enableErrorRecovery) !== false
            },
            
            // Integration Settings
            integrations: {
                linear: {
                    enabled: this._parseBoolean(options.linearEnabled || env.LINEAR_INTEGRATION_ENABLED) !== false,
                    apiKey: options.linearApiKey || env.LINEAR_API_KEY,
                    teamId: options.linearTeamId || env.LINEAR_TEAM_ID,
                    createSubIssues: this._parseBoolean(options.linearCreateSubIssues) !== false,
                    autoAssign: this._parseBoolean(options.linearAutoAssign) || false
                },
                github: {
                    enabled: this._parseBoolean(options.githubEnabled || env.GITHUB_INTEGRATION_ENABLED) !== false,
                    token: options.githubToken || env.GITHUB_TOKEN,
                    owner: options.githubOwner || env.GITHUB_OWNER,
                    repo: options.githubRepo || env.GITHUB_REPO,
                    createPRs: this._parseBoolean(options.githubCreatePRs) !== false,
                    autoMerge: this._parseBoolean(options.githubAutoMerge) || false
                }
            },
            
            // Override options
            ...options
        };
    }

    /**
     * Validate configuration
     * @throws {Error} If configuration is invalid
     */
    validateConfiguration() {
        const errors = [];
        const warnings = [];

        // Validate required fields for production
        if (this.config.mode === 'production') {
            if (!this.config.auth.token) {
                errors.push('CODEGEN_API_KEY or CODEGEN_TOKEN is required in production mode');
            }
            
            if (!this.config.auth.orgId) {
                errors.push('CODEGEN_ORG_ID is required in production mode');
            }
        }

        // Validate API configuration
        if (!this.config.api.baseURL) {
            errors.push('API base URL is required');
        }

        if (this.config.api.timeout < 1000) {
            warnings.push('API timeout is very low, this may cause request failures');
        }

        // Validate rate limiting
        if (this.config.rateLimiting.enabled) {
            if (this.config.rateLimiting.requestsPerSecond <= 0) {
                errors.push('Requests per second must be greater than 0');
            }
            
            if (this.config.rateLimiting.requestsPerMinute <= 0) {
                errors.push('Requests per minute must be greater than 0');
            }
        }

        // Validate retry configuration
        if (this.config.retry.enabled) {
            if (this.config.retry.maxRetries < 0) {
                errors.push('Max retries cannot be negative');
            }
            
            if (this.config.retry.baseDelay < 100) {
                warnings.push('Base retry delay is very low');
            }
        }

        // Validate polling configuration
        if (this.config.polling.defaultInterval < 1000) {
            warnings.push('Polling interval is very low, this may cause excessive API calls');
        }

        // Log warnings
        warnings.forEach(warning => {
            log('warning', `Codegen configuration warning: ${warning}`);
        });

        // Throw errors
        if (errors.length > 0) {
            throw new Error(`Codegen configuration errors: ${errors.join(', ')}`);
        }
    }

    /**
     * Get configuration value by path
     * @param {string} path - Configuration path (e.g., 'api.baseURL')
     * @returns {*} Configuration value
     */
    get(path) {
        return this._getNestedValue(this.config, path);
    }

    /**
     * Set configuration value by path
     * @param {string} path - Configuration path
     * @param {*} value - Value to set
     */
    set(path, value) {
        this._setNestedValue(this.config, path, value);
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Check if running in mock mode
     * @returns {boolean} Whether mock mode is enabled
     */
    isMockEnabled() {
        return this.config.api.enableMock || !this.config.auth.token;
    }

    /**
     * Check if running in production mode
     * @returns {boolean} Whether in production mode
     */
    isProduction() {
        return this.config.mode === 'production';
    }

    /**
     * Check if running in development mode
     * @returns {boolean} Whether in development mode
     */
    isDevelopment() {
        return this.config.mode === 'development';
    }

    /**
     * Get API configuration
     * @returns {Object} API configuration
     */
    getApiConfig() {
        return {
            baseURL: this.config.api.baseURL,
            timeout: this.config.api.timeout,
            token: this.config.auth.token,
            orgId: this.config.auth.orgId
        };
    }

    /**
     * Get rate limiting configuration
     * @returns {Object} Rate limiting configuration
     */
    getRateLimitConfig() {
        return { ...this.config.rateLimiting };
    }

    /**
     * Get retry configuration
     * @returns {Object} Retry configuration
     */
    getRetryConfig() {
        return { ...this.config.retry };
    }

    /**
     * Get polling configuration
     * @returns {Object} Polling configuration
     */
    getPollingConfig() {
        return { ...this.config.polling };
    }

    /**
     * Get integration configuration
     * @param {string} integration - Integration name
     * @returns {Object} Integration configuration
     */
    getIntegrationConfig(integration) {
        return this.config.integrations[integration] || {};
    }

    /**
     * Check if feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature] || false;
    }

    /**
     * Get environment-specific configuration
     * @returns {Object} Environment configuration
     */
    getEnvironmentConfig() {
        const baseConfig = {
            development: {
                api: { enableMock: true },
                logging: { level: 'debug' },
                rateLimiting: { enabled: false }
            },
            test: {
                api: { enableMock: true },
                logging: { level: 'error' },
                rateLimiting: { enabled: false }
            },
            production: {
                api: { enableMock: false },
                logging: { level: 'info' },
                rateLimiting: { enabled: true }
            }
        };

        return baseConfig[this.config.mode] || baseConfig.development;
    }

    /**
     * Merge environment-specific configuration
     */
    applyEnvironmentConfig() {
        const envConfig = this.getEnvironmentConfig();
        this.config = this._deepMerge(this.config, envConfig);
    }

    /**
     * Get configuration summary for logging
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            mode: this.config.mode,
            mockEnabled: this.isMockEnabled(),
            apiBaseURL: this.config.api.baseURL,
            rateLimitingEnabled: this.config.rateLimiting.enabled,
            retryEnabled: this.config.retry.enabled,
            features: Object.keys(this.config.features).filter(
                feature => this.config.features[feature]
            ),
            integrations: Object.keys(this.config.integrations).filter(
                integration => this.config.integrations[integration].enabled
            )
        };
    }

    /**
     * Validate API connectivity
     * @returns {Promise<boolean>} Whether API is accessible
     */
    async validateConnectivity() {
        if (this.isMockEnabled()) {
            log('info', 'Skipping connectivity validation in mock mode');
            return true;
        }

        try {
            // This would make an actual API call to validate connectivity
            // For now, we'll just validate the configuration
            const required = ['baseURL', 'token', 'orgId'];
            const apiConfig = this.getApiConfig();
            
            for (const field of required) {
                if (!apiConfig[field]) {
                    throw new Error(`Missing required API configuration: ${field}`);
                }
            }

            log('info', 'API connectivity validation passed');
            return true;

        } catch (error) {
            log('error', `API connectivity validation failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            mode: this.config.mode,
            mockEnabled: this.isMockEnabled(),
            configuration: this.getSummary(),
            validation: {
                hasToken: !!this.config.auth.token,
                hasOrgId: !!this.config.auth.orgId,
                hasBaseURL: !!this.config.api.baseURL
            }
        };
    }

    // Private helper methods

    /**
     * Parse string to number
     * @param {string|number} value - Value to parse
     * @returns {number|null} Parsed number or null
     * @private
     */
    _parseNumber(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    /**
     * Parse string to boolean
     * @param {string|boolean} value - Value to parse
     * @returns {boolean} Parsed boolean
     * @private
     */
    _parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
        }
        return false;
    }

    /**
     * Get nested value from object
     * @param {Object} obj - Object to search
     * @param {string} path - Path to value
     * @returns {*} Value or undefined
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Set nested value in object
     * @param {Object} obj - Object to modify
     * @param {string} path - Path to set
     * @param {*} value - Value to set
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
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     * @private
     */
    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
}

/**
 * Create and configure Codegen configuration instance
 * @param {Object} options - Configuration options
 * @returns {CodegenConfig} Configuration instance
 */
export function createCodegenConfig(options = {}) {
    const config = new CodegenConfig(options);
    config.applyEnvironmentConfig();
    return config;
}

export default CodegenConfig;

