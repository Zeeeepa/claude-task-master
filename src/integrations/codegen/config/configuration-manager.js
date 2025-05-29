/**
 * @fileoverview Unified Configuration Manager
 * @description Consolidated configuration management for Codegen SDK integration
 */

import { log } from '../../../utils/logger.js';

/**
 * Configuration validation error
 */
export class ConfigurationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ConfigurationError';
        this.field = field;
    }
}

/**
 * Unified Configuration Manager
 * Consolidates configuration patterns from all 6 PRs
 */
export class ConfigurationManager {
    constructor(config = {}) {
        this.config = this._buildConfiguration(config);
        this._validateConfiguration();
        
        log('debug', 'Configuration Manager initialized', {
            components: Object.keys(this.config),
            mockMode: this.isMockEnabled(),
            debugMode: this.isDebugEnabled()
        });
    }

    /**
     * Build complete configuration from input
     * @param {Object} config - Input configuration
     * @returns {Object} Complete configuration
     * @private
     */
    _buildConfiguration(config) {
        return {
            // API Configuration (from PRs #52, #86, #87)
            api: {
                apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
                baseUrl: config.baseUrl || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
                timeout: config.timeout || parseInt(process.env.CODEGEN_TIMEOUT) || 30000,
                retries: config.retries || parseInt(process.env.CODEGEN_RETRIES) || 3,
                version: config.version || 'v1',
                enableMock: config.enableMock || process.env.CODEGEN_MOCK_MODE === 'true',
                ...config.api
            },

            // Authentication Configuration (from PRs #52, #87)
            authentication: {
                type: config.authenticationType || 'bearer',
                orgId: config.orgId || process.env.CODEGEN_ORG_ID,
                validateOnInit: config.validateOnInit !== false,
                tokenRefresh: config.tokenRefresh !== false,
                tokenExpiry: config.tokenExpiry || 3600000, // 1 hour
                ...config.authentication
            },

            // Rate Limiting Configuration (from PRs #52, #54, #87)
            rateLimiting: {
                enabled: config.rateLimitingEnabled !== false,
                requestsPerSecond: config.requestsPerSecond || 2,
                requestsPerMinute: config.requestsPerMinute || 60,
                requestsPerHour: config.requestsPerHour || 1000,
                requestsPerDay: config.requestsPerDay || 10000,
                burstSize: config.burstSize || 5,
                strategy: config.strategy || 'sliding_window',
                backoffMultiplier: config.backoffMultiplier || 2,
                maxBackoffTime: config.maxBackoffTime || 30000,
                queueSize: config.queueSize || 100,
                ...config.rateLimiting
            },

            // Error Handling Configuration (from PRs #52, #55, #87)
            errorHandling: {
                enabled: config.errorHandlingEnabled !== false,
                maxRetries: config.maxRetries || 3,
                retryDelay: config.retryDelay || 1000,
                exponentialBackoff: config.exponentialBackoff !== false,
                circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
                circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
                retryableErrors: config.retryableErrors || [
                    'NETWORK_ERROR',
                    'TIMEOUT_ERROR',
                    'RATE_LIMIT_EXCEEDED',
                    'SERVER_ERROR'
                ],
                ...config.errorHandling
            },

            // Natural Language Processing Configuration (from PRs #54, #55, #86)
            nlp: {
                enabled: config.nlpEnabled !== false,
                maxContextLength: config.maxContextLength || 8000,
                confidenceThreshold: config.confidenceThreshold || 0.7,
                enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
                enableIntentClassification: config.enableIntentClassification !== false,
                enableComplexityAnalysis: config.enableComplexityAnalysis !== false,
                supportedTaskTypes: config.supportedTaskTypes || [
                    'feature_implementation',
                    'bug_fix',
                    'code_refactor',
                    'documentation',
                    'testing',
                    'optimization',
                    'security_fix'
                ],
                supportedLanguages: config.supportedLanguages || [
                    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
                ],
                ...config.nlp
            },

            // Prompt Generation Configuration (from PRs #52, #54, #86)
            promptGeneration: {
                enabled: config.promptGenerationEnabled !== false,
                maxPromptLength: config.maxPromptLength || 8000,
                enableTemplates: config.enableTemplates !== false,
                enableOptimization: config.enableOptimization !== false,
                includeExamples: config.includeExamples || false,
                includeContext: config.includeContext !== false,
                templateVersion: config.templateVersion || '2.0',
                optimizeForCodegen: config.optimizeForCodegen !== false,
                ...config.promptGeneration
            },

            // Context Enrichment Configuration (from PRs #52, #86, #87)
            contextEnrichment: {
                enabled: config.contextEnrichmentEnabled !== false,
                maxContextSize: config.maxContextSize || 10000,
                enableFileAnalysis: config.enableFileAnalysis !== false,
                enableDependencyAnalysis: config.enableDependencyAnalysis !== false,
                enablePatternAnalysis: config.enablePatternAnalysis !== false,
                includeFileStructure: config.includeFileStructure !== false,
                includeRecentChanges: config.includeRecentChanges !== false,
                cacheEnabled: config.cacheEnabled !== false,
                cacheTTL: config.cacheTTL || 3600000, // 1 hour
                smartFiltering: config.smartFiltering !== false,
                ...config.contextEnrichment
            },

            // PR Creation Configuration (from PRs #52, #54, #86)
            prCreation: {
                enabled: config.prCreationEnabled !== false,
                defaultBranch: config.defaultBranch || 'main',
                branchPrefix: config.branchPrefix || 'codegen/',
                includeMetadata: config.includeMetadata !== false,
                autoAssignReviewers: config.autoAssignReviewers || false,
                defaultReviewers: config.defaultReviewers || [],
                templateVersion: config.templateVersion || '2.0',
                enableAutoMerge: config.enableAutoMerge || false,
                qualityGates: config.qualityGates !== false,
                ...config.prCreation
            },

            // Quality Validation Configuration (from PRs #54, #55)
            qualityValidation: {
                enabled: config.qualityValidationEnabled !== false,
                minQualityScore: config.minQualityScore || 75,
                enableCodeAnalysis: config.enableCodeAnalysis !== false,
                enableContentAnalysis: config.enableContentAnalysis !== false,
                enableSecurityAnalysis: config.enableSecurityAnalysis !== false,
                enablePerformanceAnalysis: config.enablePerformanceAnalysis !== false,
                strictMode: config.strictMode || false,
                validationRules: {
                    maxLineLength: 120,
                    maxCyclomaticComplexity: 10,
                    maxFunctionLength: 50,
                    maxNestingDepth: 4,
                    maxFileSize: 1000,
                    ...config.validationRules
                },
                ...config.qualityValidation
            },

            // Monitoring Configuration (from PRs #52, #54, #87)
            monitoring: {
                enabled: config.monitoringEnabled !== false,
                logLevel: config.logLevel || process.env.LOG_LEVEL || 'info',
                enableMetrics: config.enableMetrics !== false,
                enableTracing: config.enableTracing !== false,
                enableHealthChecks: config.enableHealthChecks !== false,
                metricsInterval: config.metricsInterval || 60000, // 1 minute
                healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
                enableRequestLogging: config.enableRequestLogging || false,
                enableResponseLogging: config.enableResponseLogging || false,
                ...config.monitoring
            },

            // Cache Configuration (from PRs #52, #87)
            cache: {
                enabled: config.cacheEnabled !== false,
                ttl: config.cacheTTL || 3600000, // 1 hour
                maxSize: config.cacheMaxSize || 1000,
                strategy: config.cacheStrategy || 'lru',
                enableTemplateCache: config.enableTemplateCache !== false,
                enableContextCache: config.enableContextCache !== false,
                enableResultCache: config.enableResultCache !== false,
                ...config.cache
            },

            // Development Configuration (from all PRs)
            development: {
                mockMode: config.mockMode || process.env.CODEGEN_MOCK_MODE === 'true',
                debugMode: config.debugMode || process.env.CODEGEN_DEBUG_MODE === 'true',
                testMode: config.testMode || process.env.NODE_ENV === 'test',
                enableValidation: config.enableValidation !== false,
                enableDetailedLogging: config.enableDetailedLogging || false,
                ...config.development
            },

            // Integration Configuration (from PRs #82, #54)
            integrations: {
                github: {
                    enabled: config.githubEnabled !== false,
                    token: config.githubToken || process.env.GITHUB_TOKEN,
                    apiVersion: config.githubApiVersion || 'v4',
                    ...config.github
                },
                linear: {
                    enabled: config.linearEnabled !== false,
                    apiKey: config.linearApiKey || process.env.LINEAR_API_KEY,
                    teamId: config.linearTeamId || process.env.LINEAR_TEAM_ID,
                    updateTicketStatus: config.updateTicketStatus !== false,
                    ...config.linear
                },
                agentapi: {
                    enabled: config.agentapiEnabled || false,
                    baseUrl: config.agentapiBaseUrl || process.env.AGENTAPI_BASE_URL,
                    timeout: config.agentapiTimeout || 60000,
                    ...config.agentapi
                },
                slack: {
                    enabled: config.slackEnabled || false,
                    webhookUrl: config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
                    channels: config.slackChannels || {
                        notifications: '#codegen-notifications',
                        alerts: '#codegen-alerts'
                    },
                    ...config.slack
                },
                ...config.integrations
            }
        };
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfiguration() {
        const errors = [];

        // Validate API configuration
        if (!this.config.development.mockMode) {
            if (!this.config.api.apiKey) {
                errors.push('API key is required when not in mock mode');
            }
            if (!this.config.authentication.orgId) {
                errors.push('Organization ID is required when not in mock mode');
            }
        }

        if (!this.config.api.baseUrl) {
            errors.push('Base URL is required');
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

        // Validate error handling
        if (this.config.errorHandling.maxRetries < 0) {
            errors.push('Max retries cannot be negative');
        }

        // Validate NLP configuration
        if (this.config.nlp.maxContextLength <= 0) {
            errors.push('Max context length must be positive');
        }

        if (this.config.nlp.confidenceThreshold < 0 || this.config.nlp.confidenceThreshold > 1) {
            errors.push('Confidence threshold must be between 0 and 1');
        }

        // Validate quality validation
        if (this.config.qualityValidation.minQualityScore < 0 || 
            this.config.qualityValidation.minQualityScore > 100) {
            errors.push('Minimum quality score must be between 0 and 100');
        }

        // Validate cache configuration
        if (this.config.cache.maxSize <= 0) {
            errors.push('Cache max size must be positive');
        }

        if (errors.length > 0) {
            throw new ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Get configuration for a specific component
     * @param {string} component - Component name
     * @returns {Object} Component configuration
     */
    getComponent(component) {
        if (!this.config[component]) {
            throw new ConfigurationError(`Unknown component: ${component}`);
        }
        return { ...this.config[component] };
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Update configuration
     * @param {Object} updates - Configuration updates
     */
    update(updates) {
        // Deep merge updates
        for (const [key, value] of Object.entries(updates)) {
            if (this.config[key] && typeof this.config[key] === 'object' && 
                typeof value === 'object' && !Array.isArray(value)) {
                this.config[key] = { ...this.config[key], ...value };
            } else {
                this.config[key] = value;
            }
        }

        // Re-validate configuration
        this._validateConfiguration();

        log('debug', 'Configuration updated', { 
            updatedComponents: Object.keys(updates) 
        });
    }

    /**
     * Check if mock mode is enabled
     * @returns {boolean} Mock mode status
     */
    isMockEnabled() {
        return this.config.development.mockMode;
    }

    /**
     * Check if debug mode is enabled
     * @returns {boolean} Debug mode status
     */
    isDebugEnabled() {
        return this.config.development.debugMode;
    }

    /**
     * Check if test mode is enabled
     * @returns {boolean} Test mode status
     */
    isTestMode() {
        return this.config.development.testMode;
    }

    /**
     * Get API configuration for HTTP client
     * @returns {Object} API configuration
     */
    getApiConfig() {
        return {
            baseURL: this.config.api.baseUrl,
            timeout: this.config.api.timeout,
            headers: {
                'Authorization': `Bearer ${this.config.api.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/2.0.0',
                ...(this.config.authentication.orgId && {
                    'X-Org-ID': this.config.authentication.orgId
                })
            }
        };
    }

    /**
     * Get environment-specific configuration
     * @param {string} environment - Environment name
     * @returns {Object} Environment configuration
     */
    getEnvironmentConfig(environment = process.env.NODE_ENV || 'development') {
        const baseConfig = this.getAll();

        switch (environment) {
            case 'production':
                return {
                    ...baseConfig,
                    development: {
                        ...baseConfig.development,
                        mockMode: false,
                        debugMode: false,
                        enableDetailedLogging: false
                    },
                    monitoring: {
                        ...baseConfig.monitoring,
                        logLevel: 'warn',
                        enableRequestLogging: false,
                        enableResponseLogging: false
                    },
                    rateLimiting: {
                        ...baseConfig.rateLimiting,
                        requestsPerSecond: Math.min(baseConfig.rateLimiting.requestsPerSecond, 1)
                    }
                };

            case 'staging':
                return {
                    ...baseConfig,
                    development: {
                        ...baseConfig.development,
                        mockMode: false,
                        debugMode: false
                    },
                    monitoring: {
                        ...baseConfig.monitoring,
                        logLevel: 'info',
                        enableRequestLogging: true
                    }
                };

            case 'test':
                return {
                    ...baseConfig,
                    development: {
                        ...baseConfig.development,
                        mockMode: true,
                        testMode: true
                    },
                    api: {
                        ...baseConfig.api,
                        timeout: 5000,
                        enableMock: true
                    },
                    rateLimiting: {
                        ...baseConfig.rateLimiting,
                        enabled: false
                    },
                    errorHandling: {
                        ...baseConfig.errorHandling,
                        maxRetries: 1
                    },
                    monitoring: {
                        ...baseConfig.monitoring,
                        logLevel: 'error',
                        enableMetrics: false
                    }
                };

            default: // development
                return {
                    ...baseConfig,
                    monitoring: {
                        ...baseConfig.monitoring,
                        logLevel: 'debug',
                        enableRequestLogging: true,
                        enableDetailedLogging: true
                    }
                };
        }
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
            if (config.integrations.github.token) {
                config.integrations.github.token = '[REDACTED]';
            }
            if (config.integrations.linear.apiKey) {
                config.integrations.linear.apiKey = '[REDACTED]';
            }
        }
        
        return JSON.stringify(config, null, 2);
    }

    /**
     * Get configuration summary for logging
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            mockMode: this.isMockEnabled(),
            debugMode: this.isDebugEnabled(),
            testMode: this.isTestMode(),
            apiConfigured: !!this.config.api.apiKey,
            components: {
                rateLimiting: this.config.rateLimiting.enabled,
                errorHandling: this.config.errorHandling.enabled,
                nlp: this.config.nlp.enabled,
                promptGeneration: this.config.promptGeneration.enabled,
                contextEnrichment: this.config.contextEnrichment.enabled,
                qualityValidation: this.config.qualityValidation.enabled,
                monitoring: this.config.monitoring.enabled,
                cache: this.config.cache.enabled
            },
            integrations: {
                github: this.config.integrations.github.enabled,
                linear: this.config.integrations.linear.enabled,
                agentapi: this.config.integrations.agentapi.enabled,
                slack: this.config.integrations.slack.enabled
            }
        };
    }

    /**
     * Create configuration from environment variables
     * @static
     * @returns {ConfigurationManager} Configuration manager instance
     */
    static fromEnvironment() {
        return new ConfigurationManager({
            apiKey: process.env.CODEGEN_API_KEY,
            baseUrl: process.env.CODEGEN_API_URL,
            orgId: process.env.CODEGEN_ORG_ID,
            timeout: parseInt(process.env.CODEGEN_TIMEOUT) || undefined,
            retries: parseInt(process.env.CODEGEN_RETRIES) || undefined,
            mockMode: process.env.CODEGEN_MOCK_MODE === 'true',
            debugMode: process.env.CODEGEN_DEBUG_MODE === 'true',
            rateLimitingEnabled: process.env.CODEGEN_RATE_LIMITING !== 'false',
            requestsPerSecond: parseInt(process.env.CODEGEN_RATE_LIMIT_RPS) || undefined,
            requestsPerMinute: parseInt(process.env.CODEGEN_RATE_LIMIT_RPM) || undefined,
            githubToken: process.env.GITHUB_TOKEN,
            linearApiKey: process.env.LINEAR_API_KEY,
            linearTeamId: process.env.LINEAR_TEAM_ID
        });
    }
}

