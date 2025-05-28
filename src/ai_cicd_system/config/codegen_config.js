/**
 * @fileoverview Enhanced Codegen Configuration
 * @description Production-ready configuration for Codegen SDK integration
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Enhanced Codegen configuration class with production settings
 */
export class CodegenConfig {
    constructor(config = {}) {
        // Core API configuration
        this.api = {
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            baseUrl: config.baseUrl || process.env.CODEGEN_BASE_URL || 'https://api.codegen.com',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            version: config.version || 'v1',
            ...config.api
        };

        // Authentication configuration
        this.authentication = {
            type: config.authenticationType || 'bearer',
            refreshToken: config.refreshToken || process.env.CODEGEN_REFRESH_TOKEN,
            tokenExpiry: config.tokenExpiry || 3600000, // 1 hour
            autoRefresh: config.autoRefresh !== false,
            ...config.authentication
        };

        // Rate limiting configuration
        this.rateLimiting = {
            enabled: config.rateLimitingEnabled !== false,
            requests: config.requests || 100,
            window: config.window || 60000, // 1 minute
            strategy: config.strategy || 'sliding_window',
            backoffMultiplier: config.backoffMultiplier || 2,
            maxBackoffTime: config.maxBackoffTime || 30000,
            ...config.rateLimiting
        };

        // Error handling configuration
        this.errorHandling = {
            enabled: config.errorHandlingEnabled !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            exponentialBackoff: config.exponentialBackoff !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            ...config.errorHandling
        };

        // Quota management configuration
        this.quota = {
            enabled: config.quotaEnabled !== false,
            dailyLimit: config.dailyLimit || 1000,
            monthlyLimit: config.monthlyLimit || 10000,
            warningThreshold: config.warningThreshold || 0.8,
            trackUsage: config.trackUsage !== false,
            ...config.quota
        };

        // NLP processing configuration
        this.nlp = {
            enabled: config.nlpEnabled !== false,
            maxContextLength: config.maxContextLength || 8000,
            enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
            enableIntentClassification: config.enableIntentClassification !== false,
            enableComplexityAnalysis: config.enableComplexityAnalysis !== false,
            supportedLanguages: config.supportedLanguages || ['javascript', 'typescript', 'python', 'java', 'go'],
            ...config.nlp
        };

        // Prompt generation configuration
        this.promptGeneration = {
            enabled: config.promptGenerationEnabled !== false,
            maxPromptLength: config.maxPromptLength || 8000,
            enableTemplates: config.enableTemplates !== false,
            enableOptimization: config.enableOptimization !== false,
            includeExamples: config.includeExamples || false,
            templateVersion: config.templateVersion || '1.0',
            ...config.promptGeneration
        };

        // Context enrichment configuration
        this.contextEnrichment = {
            enabled: config.contextEnrichmentEnabled !== false,
            maxContextSize: config.maxContextSize || 8000,
            enableFileAnalysis: config.enableFileAnalysis !== false,
            enableDependencyAnalysis: config.enableDependencyAnalysis !== false,
            enablePatternAnalysis: config.enablePatternAnalysis !== false,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 3600000, // 1 hour
            ...config.contextEnrichment
        };

        // Quality validation configuration
        this.qualityValidation = {
            enabled: config.qualityValidationEnabled !== false,
            minQualityScore: config.minQualityScore || 75,
            enableCodeAnalysis: config.enableCodeAnalysis !== false,
            enableContentAnalysis: config.enableContentAnalysis !== false,
            enableSecurityAnalysis: config.enableSecurityAnalysis !== false,
            enablePerformanceAnalysis: config.enablePerformanceAnalysis !== false,
            strictMode: config.strictMode || false,
            ...config.qualityValidation
        };

        // Monitoring and logging configuration
        this.monitoring = {
            enabled: config.monitoringEnabled !== false,
            logLevel: config.logLevel || 'info',
            enableMetrics: config.enableMetrics !== false,
            enableTracing: config.enableTracing !== false,
            metricsInterval: config.metricsInterval || 60000, // 1 minute
            ...config.monitoring
        };

        // Cache configuration
        this.cache = {
            enabled: config.cacheEnabled !== false,
            ttl: config.cacheTTL || 3600000, // 1 hour
            maxSize: config.cacheMaxSize || 1000,
            strategy: config.cacheStrategy || 'lru',
            ...config.cache
        };

        // Development and testing configuration
        this.development = {
            mockMode: config.mockMode || false,
            debugMode: config.debugMode || false,
            testMode: config.testMode || false,
            enableValidation: config.enableValidation !== false,
            ...config.development
        };

        // Validate configuration
        this._validateConfig();

        log('info', 'Codegen configuration initialized', {
            mockMode: this.development.mockMode,
            apiConfigured: !!this.api.apiKey,
            rateLimitingEnabled: this.rateLimiting.enabled
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
            quota: this.quota,
            nlp: this.nlp,
            promptGeneration: this.promptGeneration,
            contextEnrichment: this.contextEnrichment,
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
     * Get API configuration
     * @returns {Object} API configuration
     */
    getApiConfig() {
        return {
            baseURL: this.api.baseUrl,
            timeout: this.api.timeout,
            headers: {
                'Authorization': `Bearer ${this.api.apiKey}`,
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
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const errors = [];

        // Validate API configuration
        if (!this.development.mockMode && !this.api.apiKey) {
            errors.push('API key is required when not in mock mode');
        }

        if (!this.api.baseUrl) {
            errors.push('Base URL is required');
        }

        // Validate rate limiting configuration
        if (this.rateLimiting.enabled) {
            if (this.rateLimiting.requests <= 0) {
                errors.push('Rate limiting requests must be positive');
            }
            if (this.rateLimiting.window <= 0) {
                errors.push('Rate limiting window must be positive');
            }
        }

        // Validate error handling configuration
        if (this.errorHandling.maxRetries < 0) {
            errors.push('Max retries cannot be negative');
        }

        // Validate quota configuration
        if (this.quota.enabled) {
            if (this.quota.dailyLimit <= 0) {
                errors.push('Daily quota limit must be positive');
            }
            if (this.quota.monthlyLimit <= 0) {
                errors.push('Monthly quota limit must be positive');
            }
        }

        // Validate NLP configuration
        if (this.nlp.maxContextLength <= 0) {
            errors.push('Max context length must be positive');
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
            quotaEnabled: this.quota.enabled,
            nlpEnabled: this.nlp.enabled,
            qualityValidationEnabled: this.qualityValidation.enabled,
            monitoringEnabled: this.monitoring.enabled,
            cacheEnabled: this.cache.enabled
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
            if (config.authentication.refreshToken) {
                config.authentication.refreshToken = '[REDACTED]';
            }
        }
        
        return JSON.stringify(config, null, 2);
    }

    /**
     * Load configuration from environment variables
     * @static
     * @returns {CodegenConfig} Configuration instance
     */
    static fromEnvironment() {
        return new CodegenConfig({
            apiKey: process.env.CODEGEN_API_KEY,
            baseUrl: process.env.CODEGEN_BASE_URL,
            timeout: parseInt(process.env.CODEGEN_TIMEOUT) || undefined,
            retries: parseInt(process.env.CODEGEN_RETRIES) || undefined,
            mockMode: process.env.CODEGEN_MOCK_MODE === 'true',
            debugMode: process.env.CODEGEN_DEBUG_MODE === 'true',
            rateLimitingEnabled: process.env.CODEGEN_RATE_LIMITING !== 'false',
            requests: parseInt(process.env.CODEGEN_RATE_LIMIT_REQUESTS) || undefined,
            window: parseInt(process.env.CODEGEN_RATE_LIMIT_WINDOW) || undefined
        });
    }
}

/**
 * Create Codegen configuration with defaults
 * @param {Object} config - Configuration overrides
 * @returns {CodegenConfig} Configuration instance
 */
export function createCodegenConfig(config = {}) {
    return new CodegenConfig(config);
}

/**
 * Configuration error class
 */
export class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ConfigurationError);
        }
    }
}

export default CodegenConfig;
