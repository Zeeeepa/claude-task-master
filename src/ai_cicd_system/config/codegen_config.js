/**
 * @fileoverview Codegen Configuration Management
 * @description Environment-based configuration for Codegen API integration
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Codegen Configuration Manager
 */
export class CodegenConfig {
    constructor(config = {}) {
        this.config = this._buildConfig(config);
        this._validateConfig();
        
        log('debug', 'Codegen configuration initialized', {
            mode: this.config.mode,
            baseURL: this.config.api.baseURL,
            enableMock: this.config.api.enableMock
        });
    }

    /**
     * Build configuration from environment and overrides
     * @param {Object} overrides - Configuration overrides
     * @returns {Object} Complete configuration
     * @private
     */
    _buildConfig(overrides) {
        const envConfig = this._getEnvironmentConfig();
        const defaultConfig = this._getDefaultConfig();
        
        return this._mergeConfigs(defaultConfig, envConfig, overrides);
    }

    /**
     * Get default configuration
     * @returns {Object} Default configuration
     * @private
     */
    _getDefaultConfig() {
        return {
            mode: 'development', // development, production, test
            
            api: {
                baseURL: 'https://api.codegen.sh',
                timeout: 120000, // 2 minutes
                enableMock: false,
                version: 'v1'
            },
            
            authentication: {
                token: null,
                orgId: null,
                validateOnInit: true
            },
            
            rateLimiting: {
                enabled: true,
                requestsPerSecond: 2,
                requestsPerMinute: 60,
                requestsPerHour: 1000,
                requestsPerDay: 10000,
                burstSize: 5,
                burstRefillRate: 1000,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 60000,
                maxQueueSize: 100,
                enableQueue: true
            },
            
            retry: {
                enabled: true,
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 30000,
                retryableErrors: [
                    'NETWORK_ERROR',
                    'TIMEOUT_ERROR',
                    'RATE_LIMIT_EXCEEDED',
                    'SERVER_ERROR'
                ]
            },
            
            errorHandling: {
                enableCircuitBreaker: true,
                circuitBreakerThreshold: 5,
                circuitBreakerTimeout: 60000,
                enableErrorTracking: true,
                maxErrorHistory: 1000
            },
            
            polling: {
                defaultInterval: 5000, // 5 seconds
                maxWaitTime: 600000, // 10 minutes
                backoffMultiplier: 1.5,
                maxInterval: 30000 // 30 seconds
            },
            
            quota: {
                dailyLimit: 10000,
                monthlyLimit: 100000,
                enableWarnings: true,
                warningThresholds: [0.8, 0.9, 0.95]
            },
            
            logging: {
                level: 'info', // debug, info, warning, error
                enableRequestLogging: false,
                enableResponseLogging: false,
                enableMetrics: true
            },
            
            cache: {
                enabled: false,
                ttl: 300000, // 5 minutes
                maxSize: 100
            },
            
            monitoring: {
                enableHealthChecks: true,
                healthCheckInterval: 60000, // 1 minute
                enableMetrics: true,
                metricsInterval: 30000 // 30 seconds
            }
        };
    }

    /**
     * Get configuration from environment variables
     * @returns {Object} Environment configuration
     * @private
     */
    _getEnvironmentConfig() {
        const env = process.env;
        
        return {
            mode: env.NODE_ENV || env.CODEGEN_MODE,
            
            api: {
                baseURL: env.CODEGEN_API_URL,
                timeout: this._parseNumber(env.CODEGEN_API_TIMEOUT),
                enableMock: this._parseBoolean(env.CODEGEN_ENABLE_MOCK)
            },
            
            authentication: {
                token: env.CODEGEN_API_KEY || env.CODEGEN_TOKEN,
                orgId: env.CODEGEN_ORG_ID,
                validateOnInit: this._parseBoolean(env.CODEGEN_VALIDATE_ON_INIT)
            },
            
            rateLimiting: {
                enabled: this._parseBoolean(env.CODEGEN_RATE_LIMITING_ENABLED),
                requestsPerSecond: this._parseNumber(env.CODEGEN_REQUESTS_PER_SECOND),
                requestsPerMinute: this._parseNumber(env.CODEGEN_REQUESTS_PER_MINUTE),
                requestsPerHour: this._parseNumber(env.CODEGEN_REQUESTS_PER_HOUR),
                requestsPerDay: this._parseNumber(env.CODEGEN_REQUESTS_PER_DAY),
                maxQueueSize: this._parseNumber(env.CODEGEN_MAX_QUEUE_SIZE)
            },
            
            retry: {
                enabled: this._parseBoolean(env.CODEGEN_RETRY_ENABLED),
                maxRetries: this._parseNumber(env.CODEGEN_MAX_RETRIES),
                baseDelay: this._parseNumber(env.CODEGEN_RETRY_BASE_DELAY),
                maxDelay: this._parseNumber(env.CODEGEN_RETRY_MAX_DELAY)
            },
            
            polling: {
                defaultInterval: this._parseNumber(env.CODEGEN_POLL_INTERVAL),
                maxWaitTime: this._parseNumber(env.CODEGEN_MAX_WAIT_TIME)
            },
            
            quota: {
                dailyLimit: this._parseNumber(env.CODEGEN_DAILY_LIMIT),
                monthlyLimit: this._parseNumber(env.CODEGEN_MONTHLY_LIMIT),
                enableWarnings: this._parseBoolean(env.CODEGEN_QUOTA_WARNINGS)
            },
            
            logging: {
                level: env.CODEGEN_LOG_LEVEL,
                enableRequestLogging: this._parseBoolean(env.CODEGEN_LOG_REQUESTS),
                enableResponseLogging: this._parseBoolean(env.CODEGEN_LOG_RESPONSES)
            }
        };
    }

    /**
     * Merge multiple configuration objects
     * @param {...Object} configs - Configuration objects to merge
     * @returns {Object} Merged configuration
     * @private
     */
    _mergeConfigs(...configs) {
        const result = {};
        
        for (const config of configs) {
            this._deepMerge(result, config);
        }
        
        return result;
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @private
     */
    _deepMerge(target, source) {
        if (!source) return;
        
        for (const key in source) {
            if (source[key] !== null && source[key] !== undefined) {
                if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    this._deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
    }

    /**
     * Parse boolean from string
     * @param {string} value - String value
     * @returns {boolean|undefined} Parsed boolean or undefined
     * @private
     */
    _parseBoolean(value) {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'boolean') return value;
        return value.toLowerCase() === 'true';
    }

    /**
     * Parse number from string
     * @param {string} value - String value
     * @returns {number|undefined} Parsed number or undefined
     * @private
     */
    _parseNumber(value) {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'number') return value;
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? undefined : parsed;
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const errors = [];
        
        // Validate authentication in production mode
        if (this.config.mode === 'production' && !this.config.api.enableMock) {
            if (!this.config.authentication.token) {
                errors.push('CODEGEN_API_KEY or CODEGEN_TOKEN is required in production mode');
            }
            if (!this.config.authentication.orgId) {
                errors.push('CODEGEN_ORG_ID is required in production mode');
            }
        }
        
        // Validate API configuration
        if (!this.config.api.baseURL) {
            errors.push('API base URL is required');
        }
        
        if (this.config.api.timeout < 1000) {
            errors.push('API timeout must be at least 1000ms');
        }
        
        // Validate rate limiting
        if (this.config.rateLimiting.enabled) {
            if (this.config.rateLimiting.requestsPerSecond <= 0) {
                errors.push('Requests per second must be positive');
            }
            if (this.config.rateLimiting.requestsPerMinute <= 0) {
                errors.push('Requests per minute must be positive');
            }
        }
        
        // Validate retry configuration
        if (this.config.retry.enabled) {
            if (this.config.retry.maxRetries < 0) {
                errors.push('Max retries must be non-negative');
            }
            if (this.config.retry.baseDelay < 0) {
                errors.push('Base delay must be non-negative');
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Get configuration value by path
     * @param {string} path - Configuration path (e.g., 'api.timeout')
     * @returns {*} Configuration value
     */
    get(path) {
        const parts = path.split('.');
        let value = this.config;
        
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value by path
     * @param {string} path - Configuration path
     * @param {*} value - Value to set
     */
    set(path, value) {
        const parts = path.split('.');
        let target = this.config;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!target[part] || typeof target[part] !== 'object') {
                target[part] = {};
            }
            target = target[part];
        }
        
        target[parts[parts.length - 1]] = value;
        
        // Re-validate after changes
        this._validateConfig();
    }

    /**
     * Get full configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Get configuration for specific component
     * @param {string} component - Component name
     * @returns {Object} Component configuration
     */
    getComponent(component) {
        return this.config[component] || {};
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
     * Check if running in test mode
     * @returns {boolean} Whether in test mode
     */
    isTest() {
        return this.config.mode === 'test';
    }

    /**
     * Check if mock mode is enabled
     * @returns {boolean} Whether mock mode is enabled
     */
    isMockEnabled() {
        return this.config.api.enableMock;
    }

    /**
     * Get environment-specific configuration
     * @returns {Object} Environment configuration
     */
    getEnvironmentConfig() {
        const baseConfig = {
            api: this.config.api,
            authentication: this.config.authentication,
            logging: this.config.logging
        };
        
        switch (this.config.mode) {
            case 'production':
                return {
                    ...baseConfig,
                    rateLimiting: this.config.rateLimiting,
                    retry: this.config.retry,
                    errorHandling: this.config.errorHandling,
                    monitoring: this.config.monitoring
                };
                
            case 'development':
                return {
                    ...baseConfig,
                    rateLimiting: {
                        ...this.config.rateLimiting,
                        requestsPerSecond: Math.max(this.config.rateLimiting.requestsPerSecond, 5)
                    },
                    retry: {
                        ...this.config.retry,
                        maxRetries: Math.min(this.config.retry.maxRetries, 2)
                    },
                    logging: {
                        ...this.config.logging,
                        level: 'debug',
                        enableRequestLogging: true
                    }
                };
                
            case 'test':
                return {
                    ...baseConfig,
                    api: {
                        ...this.config.api,
                        enableMock: true,
                        timeout: 5000
                    },
                    rateLimiting: {
                        ...this.config.rateLimiting,
                        enabled: false
                    },
                    retry: {
                        ...this.config.retry,
                        enabled: false
                    },
                    logging: {
                        ...this.config.logging,
                        level: 'error'
                    }
                };
                
            default:
                return baseConfig;
        }
    }

    /**
     * Create configuration for specific use case
     * @param {string} useCase - Use case name
     * @returns {Object} Use case configuration
     */
    createUseCaseConfig(useCase) {
        const baseConfig = this.getEnvironmentConfig();
        
        switch (useCase) {
            case 'batch_processing':
                return {
                    ...baseConfig,
                    rateLimiting: {
                        ...baseConfig.rateLimiting,
                        requestsPerSecond: 1,
                        requestsPerMinute: 30,
                        enableQueue: true,
                        maxQueueSize: 1000
                    },
                    polling: {
                        ...this.config.polling,
                        defaultInterval: 10000,
                        maxWaitTime: 1800000 // 30 minutes
                    }
                };
                
            case 'interactive':
                return {
                    ...baseConfig,
                    rateLimiting: {
                        ...baseConfig.rateLimiting,
                        requestsPerSecond: 3,
                        burstSize: 10
                    },
                    polling: {
                        ...this.config.polling,
                        defaultInterval: 2000,
                        maxWaitTime: 300000 // 5 minutes
                    }
                };
                
            case 'background':
                return {
                    ...baseConfig,
                    rateLimiting: {
                        ...baseConfig.rateLimiting,
                        requestsPerSecond: 0.5,
                        requestsPerMinute: 20
                    },
                    polling: {
                        ...this.config.polling,
                        defaultInterval: 15000,
                        maxWaitTime: 3600000 // 1 hour
                    }
                };
                
            default:
                return baseConfig;
        }
    }
}

/**
 * Create configuration instance
 * @param {Object} config - Configuration overrides
 * @returns {CodegenConfig} Configuration instance
 */
export function createCodegenConfig(config = {}) {
    return new CodegenConfig(config);
}

export default CodegenConfig;

