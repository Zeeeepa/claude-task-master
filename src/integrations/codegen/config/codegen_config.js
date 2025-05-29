/**
 * @fileoverview Consolidated Codegen Configuration
 * @description Unified configuration management for all Codegen integration components
 */

import { log } from '../../../utils/logger.js';

/**
 * Codegen Configuration Manager
 * Handles all configuration aspects for the Codegen integration
 */
export class CodegenConfig {
    constructor(config = {}) {
        // Core API configuration
        this.api = {
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            orgId: config.orgId || process.env.CODEGEN_ORG_ID,
            baseURL: config.baseURL || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            version: config.version || 'v1',
            enableMock: config.enableMock || process.env.CODEGEN_ENABLE_MOCK === 'true',
            ...config.api
        };

        // Authentication configuration
        this.authentication = {
            validateOnInit: config.validateOnInit !== false,
            tokenRefreshThreshold: config.tokenRefreshThreshold || 300000, // 5 minutes
            autoRefresh: config.autoRefresh !== false,
            ...config.authentication
        };

        // Rate limiting configuration
        this.rateLimiting = {
            enabled: config.rateLimitingEnabled !== false,
            requestsPerSecond: config.requestsPerSecond || 2,
            requestsPerMinute: config.requestsPerMinute || 60,
            requestsPerHour: config.requestsPerHour || 1000,
            requestsPerDay: config.requestsPerDay || 10000,
            burstSize: config.burstSize || 5,
            maxQueueSize: config.maxQueueSize || 100,
            enableQueue: config.enableQueue !== false,
            ...config.rateLimiting
        };

        // Error handling configuration
        this.errorHandling = {
            enabled: config.errorHandlingEnabled !== false,
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            retryableErrors: config.retryableErrors || [
                'NETWORK_ERROR',
                'TIMEOUT_ERROR',
                'RATE_LIMIT_EXCEEDED',
                'SERVER_ERROR'
            ],
            ...config.errorHandling
        };

        // Task analyzer configuration
        this.taskAnalyzer = {
            maxComplexityScore: config.maxComplexityScore || 100,
            enableDetailedAnalysis: config.enableDetailedAnalysis !== false,
            supportedLanguages: config.supportedLanguages || [
                'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
            ],
            supportedFrameworks: config.supportedFrameworks || [
                'react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'rails'
            ],
            confidenceThreshold: config.confidenceThreshold || 0.6,
            ...config.taskAnalyzer
        };

        // Prompt generator configuration
        this.promptGenerator = {
            maxPromptLength: config.maxPromptLength || 4000,
            includeContext: config.includeContext !== false,
            includeExamples: config.includeExamples || false,
            optimizeForCodegen: config.optimizeForCodegen !== false,
            templateVersion: config.templateVersion || '1.0',
            enableTemplateCache: config.enableTemplateCache !== false,
            ...config.promptGenerator
        };

        // PR workflow configuration
        this.prWorkflow = {
            githubToken: config.githubToken || process.env.GITHUB_TOKEN,
            defaultRepository: config.defaultRepository || process.env.DEFAULT_REPOSITORY,
            defaultBranch: config.defaultBranch || 'main',
            branchPrefix: config.branchPrefix || 'codegen/',
            enableAutoReview: config.enableAutoReview !== false,
            enableStatusTracking: config.enableStatusTracking !== false,
            enableNotifications: config.enableNotifications !== false,
            maxRetries: config.maxRetries || 3,
            retryDelayMs: config.retryDelayMs || 5000,
            timeoutMs: config.timeoutMs || 600000, // 10 minutes
            defaultReviewers: config.defaultReviewers || [],
            autoMergeEnabled: config.autoMergeEnabled || false,
            ...config.prWorkflow
        };

        // Status updater configuration
        this.statusUpdater = {
            enableLinearIntegration: config.enableLinearIntegration !== false,
            enableWebhooks: config.enableWebhooks !== false,
            enableNotifications: config.enableNotifications !== false,
            updateIntervalMs: config.updateIntervalMs || 30000, // 30 seconds
            maxRetries: config.maxRetries || 3,
            retryDelayMs: config.retryDelayMs || 5000,
            linearApiKey: config.linearApiKey || process.env.LINEAR_API_KEY,
            webhookUrl: config.webhookUrl || process.env.WEBHOOK_URL,
            notificationChannels: config.notificationChannels || ['slack'],
            ...config.statusUpdater
        };

        // Client configuration
        this.client = {
            maxConcurrentRequests: config.maxConcurrentRequests || 3,
            enableMock: this.api.enableMock,
            ...config.client
        };

        // Quality validation configuration
        this.qualityValidation = {
            enabled: config.qualityValidationEnabled !== false,
            minQualityScore: config.minQualityScore || 75,
            enableCodeAnalysis: config.enableCodeAnalysis !== false,
            enableSecurityAnalysis: config.enableSecurityAnalysis !== false,
            enablePerformanceAnalysis: config.enablePerformanceAnalysis !== false,
            strictMode: config.strictMode || false,
            ...config.qualityValidation
        };

        // Monitoring configuration
        this.monitoring = {
            enabled: config.monitoringEnabled !== false,
            logLevel: config.logLevel || 'info',
            enableMetrics: config.enableMetrics !== false,
            enableTracing: config.enableTracing !== false,
            metricsInterval: config.metricsInterval || 60000, // 1 minute
            enableHealthChecks: config.enableHealthChecks !== false,
            healthCheckInterval: config.healthCheckInterval || 60000,
            ...config.monitoring
        };

        // Cache configuration
        this.cache = {
            enabled: config.cacheEnabled !== false,
            ttl: config.cacheTTL || 300000, // 5 minutes
            maxSize: config.cacheMaxSize || 100,
            strategy: config.cacheStrategy || 'lru',
            ...config.cache
        };

        // Development configuration
        this.development = {
            mockMode: config.mockMode || this.api.enableMock,
            debugMode: config.debugMode || process.env.NODE_ENV === 'development',
            testMode: config.testMode || process.env.NODE_ENV === 'test',
            enableValidation: config.enableValidation !== false,
            ...config.development
        };

        // Validate configuration
        this._validateConfig();

        log('info', 'Codegen configuration initialized', {
            mockMode: this.development.mockMode,
            apiConfigured: !!this.api.apiKey,
            rateLimitingEnabled: this.rateLimiting.enabled,
            componentsConfigured: this._getConfiguredComponents()
        });
    }

    /**
     * Get configuration for a specific component
     * @param {string} component - Component name
     * @returns {Object} Component configuration
     */
    getComponent(component) {
        return this[component] || {};
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return {
            api: this.api,
            authentication: this.authentication,
            rateLimiting: this.rateLimiting,
            errorHandling: this.errorHandling,
            taskAnalyzer: this.taskAnalyzer,
            promptGenerator: this.promptGenerator,
            prWorkflow: this.prWorkflow,
            statusUpdater: this.statusUpdater,
            client: this.client,
            qualityValidation: this.qualityValidation,
            monitoring: this.monitoring,
            cache: this.cache,
            development: this.development
        };
    }

    /**
     * Check if mock mode is enabled
     * @returns {boolean} Mock mode status
     */
    isMockEnabled() {
        return this.development.mockMode;
    }

    /**
     * Check if debug mode is enabled
     * @returns {boolean} Debug mode status
     */
    isDebugEnabled() {
        return this.development.debugMode;
    }

    /**
     * Get API configuration for HTTP client
     * @returns {Object} API configuration
     */
    getApiConfig() {
        return {
            baseURL: this.api.baseURL,
            timeout: this.api.timeout,
            headers: {
                'Authorization': `Bearer ${this.api.apiKey}`,
                'X-Org-ID': this.api.orgId,
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0'
            }
        };
    }

    /**
     * Update configuration
     * @param {Object} updates - Configuration updates
     */
    update(updates) {
        // Deep merge updates
        for (const [key, value] of Object.entries(updates)) {
            if (this[key] && typeof this[key] === 'object' && typeof value === 'object') {
                this[key] = { ...this[key], ...value };
            } else {
                this[key] = value;
            }
        }

        // Re-validate configuration
        this._validateConfig();

        log('debug', 'Configuration updated', { updatedKeys: Object.keys(updates) });
    }

    /**
     * Get configuration summary for logging
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            mockMode: this.development.mockMode,
            debugMode: this.development.debugMode,
            apiConfigured: !!this.api.apiKey,
            rateLimitingEnabled: this.rateLimiting.enabled,
            errorHandlingEnabled: this.errorHandling.enabled,
            qualityValidationEnabled: this.qualityValidation.enabled,
            monitoringEnabled: this.monitoring.enabled,
            cacheEnabled: this.cache.enabled,
            componentsConfigured: this._getConfiguredComponents()
        };
    }

    /**
     * Export configuration to JSON
     * @param {boolean} includeSensitive - Include sensitive data
     * @returns {string} JSON configuration
     */
    toJSON(includeSensitive = false) {
        const config = this.getAll();
        
        if (!includeSensitive) {
            // Remove sensitive information
            if (config.api.apiKey) {
                config.api.apiKey = '[REDACTED]';
            }
            if (config.prWorkflow.githubToken) {
                config.prWorkflow.githubToken = '[REDACTED]';
            }
            if (config.statusUpdater.linearApiKey) {
                config.statusUpdater.linearApiKey = '[REDACTED]';
            }
        }
        
        return JSON.stringify(config, null, 2);
    }

    /**
     * Create configuration for specific environment
     * @param {string} environment - Environment name (development, test, production)
     * @returns {CodegenConfig} Environment-specific configuration
     */
    static forEnvironment(environment) {
        const baseConfig = {
            development: {
                api: {
                    enableMock: true,
                    timeout: 10000
                },
                rateLimiting: {
                    enabled: false
                },
                monitoring: {
                    logLevel: 'debug'
                },
                development: {
                    debugMode: true,
                    mockMode: true
                }
            },
            test: {
                api: {
                    enableMock: true,
                    timeout: 5000
                },
                rateLimiting: {
                    enabled: false
                },
                errorHandling: {
                    enabled: false
                },
                monitoring: {
                    logLevel: 'error'
                },
                development: {
                    testMode: true,
                    mockMode: true
                }
            },
            production: {
                api: {
                    enableMock: false,
                    timeout: 30000
                },
                rateLimiting: {
                    enabled: true,
                    requestsPerSecond: 1,
                    requestsPerMinute: 30
                },
                errorHandling: {
                    enabled: true,
                    maxRetries: 5
                },
                monitoring: {
                    logLevel: 'warn',
                    enableMetrics: true,
                    enableTracing: true
                },
                development: {
                    mockMode: false,
                    debugMode: false
                }
            }
        };

        const envConfig = baseConfig[environment] || baseConfig.development;
        return new CodegenConfig(envConfig);
    }

    /**
     * Load configuration from environment variables
     * @static
     * @returns {CodegenConfig} Configuration instance
     */
    static fromEnvironment() {
        return new CodegenConfig({
            apiKey: process.env.CODEGEN_API_KEY,
            orgId: process.env.CODEGEN_ORG_ID,
            baseURL: process.env.CODEGEN_API_URL,
            timeout: parseInt(process.env.CODEGEN_TIMEOUT) || undefined,
            retries: parseInt(process.env.CODEGEN_RETRIES) || undefined,
            enableMock: process.env.CODEGEN_ENABLE_MOCK === 'true',
            rateLimitingEnabled: process.env.CODEGEN_RATE_LIMITING !== 'false',
            requestsPerMinute: parseInt(process.env.CODEGEN_REQUESTS_PER_MINUTE) || undefined,
            githubToken: process.env.GITHUB_TOKEN,
            defaultRepository: process.env.DEFAULT_REPOSITORY,
            linearApiKey: process.env.LINEAR_API_KEY,
            webhookUrl: process.env.WEBHOOK_URL
        });
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const errors = [];

        // Validate API configuration
        if (!this.development.mockMode && !this.api.apiKey) {
            errors.push('API key is required when not in mock mode');
        }

        if (!this.development.mockMode && !this.api.orgId) {
            errors.push('Organization ID is required when not in mock mode');
        }

        if (!this.api.baseURL) {
            errors.push('Base URL is required');
        }

        // Validate rate limiting configuration
        if (this.rateLimiting.enabled) {
            if (this.rateLimiting.requestsPerSecond <= 0) {
                errors.push('Rate limiting requests per second must be positive');
            }
            if (this.rateLimiting.requestsPerMinute <= 0) {
                errors.push('Rate limiting requests per minute must be positive');
            }
        }

        // Validate error handling configuration
        if (this.errorHandling.maxRetries < 0) {
            errors.push('Max retries cannot be negative');
        }

        // Validate task analyzer configuration
        if (this.taskAnalyzer.maxComplexityScore <= 0) {
            errors.push('Max complexity score must be positive');
        }

        // Validate prompt generator configuration
        if (this.promptGenerator.maxPromptLength <= 0) {
            errors.push('Max prompt length must be positive');
        }

        // Validate quality validation configuration
        if (this.qualityValidation.minQualityScore < 0 || this.qualityValidation.minQualityScore > 100) {
            errors.push('Minimum quality score must be between 0 and 100');
        }

        if (errors.length > 0) {
            throw new ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Get list of configured components
     * @returns {Array} List of configured components
     * @private
     */
    _getConfiguredComponents() {
        const components = [];
        
        if (this.api.apiKey || this.development.mockMode) {
            components.push('api');
        }
        if (this.prWorkflow.githubToken) {
            components.push('github');
        }
        if (this.statusUpdater.linearApiKey) {
            components.push('linear');
        }
        if (this.statusUpdater.webhookUrl) {
            components.push('webhooks');
        }
        
        return components;
    }
}

/**
 * Configuration Error Class
 */
export class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

/**
 * Create default configuration instance
 * @returns {CodegenConfig} Default configuration
 */
export function createDefaultConfig() {
    return CodegenConfig.fromEnvironment();
}

export default CodegenConfig;

