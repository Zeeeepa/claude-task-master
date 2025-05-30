/**
 * Claude Code Configuration
 * 
 * Configuration management for Claude Code integration including
 * AgentAPI settings, validation layers, and deployment parameters.
 */

export class ClaudeCodeConfig {
    constructor(options = {}) {
        this.config = {
            // AgentAPI Configuration
            agentApi: {
                url: options.agentApiUrl || process.env.AGENT_API_URL || 'http://localhost:8000',
                apiKey: options.apiKey || process.env.AGENT_API_KEY,
                timeout: options.timeout || 30000,
                retries: options.retries || 3,
                retryDelay: options.retryDelay || 1000
            },

            // Deployment Configuration
            deployment: {
                maxConcurrentDeployments: options.maxConcurrentDeployments || 20,
                maxValidationTime: options.maxValidationTime || 900000, // 15 minutes
                pollInterval: options.pollInterval || 15000, // 15 seconds
                retryInterval: options.retryInterval || 30000, // 30 seconds
                cleanupDelay: options.cleanupDelay || 300000 // 5 minutes after completion
            },

            // WSL2 Environment Configuration
            wsl2: {
                defaultEnvironment: options.defaultEnvironment || 'default',
                environments: {
                    default: {
                        baseImage: 'ubuntu:22.04',
                        resources: {
                            cpu: '2',
                            memory: '4GB',
                            disk: '20GB'
                        },
                        networking: 'isolated',
                        timeout: 3600000 // 1 hour
                    },
                    lightweight: {
                        baseImage: 'ubuntu:22.04',
                        resources: {
                            cpu: '1',
                            memory: '2GB',
                            disk: '10GB'
                        },
                        networking: 'isolated',
                        timeout: 1800000 // 30 minutes
                    },
                    performance: {
                        baseImage: 'ubuntu:22.04',
                        resources: {
                            cpu: '4',
                            memory: '8GB',
                            disk: '40GB'
                        },
                        networking: 'isolated',
                        timeout: 7200000 // 2 hours
                    }
                }
            },

            // Validation Layers Configuration
            validation: {
                defaultLayers: ['syntax', 'unit_tests', 'integration_tests', 'security'],
                stopOnFailure: options.stopOnFailure || false,
                layers: {
                    syntax: {
                        enabled: true,
                        timeout: 30000,
                        failOnWarnings: false,
                        languages: ['javascript', 'typescript', 'python', 'go', 'java', 'rust'],
                        linters: {
                            javascript: ['eslint'],
                            typescript: ['tsc', 'eslint'],
                            python: ['pylint', 'flake8', 'black'],
                            go: ['golint', 'gofmt', 'go vet'],
                            java: ['checkstyle', 'spotbugs'],
                            rust: ['rustfmt', 'clippy']
                        }
                    },
                    unit_tests: {
                        enabled: true,
                        timeout: 300000,
                        parallel: true,
                        coverage: {
                            enabled: true,
                            minimum: 80,
                            reportFormat: 'lcov'
                        },
                        frameworks: {
                            javascript: ['jest', 'mocha', 'vitest'],
                            typescript: ['jest', 'mocha', 'vitest'],
                            python: ['pytest', 'unittest'],
                            go: ['go test'],
                            java: ['junit', 'testng'],
                            rust: ['cargo test']
                        }
                    },
                    integration_tests: {
                        enabled: true,
                        timeout: 600000,
                        parallel: true,
                        retries: 2,
                        testSuites: ['api', 'database', 'external_services', 'e2e']
                    },
                    performance: {
                        enabled: options.enablePerformanceTests || false,
                        timeout: 900000,
                        metrics: ['response_time', 'memory_usage', 'cpu_usage', 'throughput'],
                        thresholds: {
                            response_time: 1000,
                            memory_usage: '512MB',
                            cpu_usage: '80%',
                            throughput: 100
                        }
                    },
                    security: {
                        enabled: true,
                        timeout: 300000,
                        failOnVulnerabilities: true,
                        severity: ['high', 'critical'],
                        scanners: {
                            javascript: ['npm audit', 'snyk'],
                            typescript: ['npm audit', 'snyk'],
                            python: ['bandit', 'safety'],
                            go: ['gosec'],
                            java: ['spotbugs', 'owasp'],
                            rust: ['cargo audit']
                        }
                    },
                    regression: {
                        enabled: options.enableRegressionTests || false,
                        timeout: 1200000,
                        baselineBranch: 'main',
                        testSuites: ['smoke', 'critical_path', 'regression'],
                        compareMetrics: true,
                        allowedDegradation: 5
                    }
                }
            },

            // Auto-Fix Configuration
            autoFix: {
                enabled: options.enableAutoFix !== false,
                maxAttempts: options.maxAutoFixAttempts || 3,
                timeout: options.autoFixTimeout || 600000, // 10 minutes
                strategies: {
                    dependency_resolution: {
                        enabled: true,
                        priority: 1,
                        timeout: 300000
                    },
                    syntax_correction: {
                        enabled: true,
                        priority: 2,
                        timeout: 120000
                    },
                    test_fixes: {
                        enabled: true,
                        priority: 3,
                        timeout: 600000
                    },
                    build_fixes: {
                        enabled: true,
                        priority: 4,
                        timeout: 600000
                    },
                    environment_fixes: {
                        enabled: true,
                        priority: 5,
                        timeout: 300000
                    }
                }
            },

            // GitHub Integration Configuration
            github: {
                webhookSecret: options.githubWebhookSecret || process.env.GITHUB_WEBHOOK_SECRET,
                statusContext: options.statusContext || 'claude-code/validation',
                createChecks: options.createChecks !== false,
                updatePRComments: options.updatePRComments !== false
            },

            // Linear Integration Configuration
            linear: {
                apiKey: options.linearApiKey || process.env.LINEAR_API_KEY,
                createFixIssues: options.createFixIssues !== false,
                assigneeId: options.codegenUserId || process.env.CODEGEN_USER_ID,
                defaultTeamId: options.defaultTeamId || process.env.LINEAR_DEFAULT_TEAM_ID
            },

            // Database Configuration
            database: {
                enabled: options.enableDatabase !== false,
                trackDeployments: options.trackDeployments !== false,
                trackMetrics: options.trackMetrics !== false,
                retentionDays: options.retentionDays || 30
            },

            // Logging Configuration
            logging: {
                level: options.logLevel || process.env.LOG_LEVEL || 'info',
                enableMetrics: options.enableMetrics !== false,
                enableTracing: options.enableTracing || false,
                logDeploymentDetails: options.logDeploymentDetails !== false
            },

            // Feature Flags
            features: {
                enableParallelValidation: options.enableParallelValidation || false,
                enableSmartRetries: options.enableSmartRetries !== false,
                enableLearning: options.enableLearning !== false,
                enableCaching: options.enableCaching || false
            }
        };

        // Validate configuration
        this.validateConfig();
    }

    /**
     * Validate configuration
     * @throws {Error} If configuration is invalid
     */
    validateConfig() {
        const errors = [];

        // Validate AgentAPI configuration
        if (!this.config.agentApi.url) {
            errors.push('AgentAPI URL is required');
        }

        if (!this.config.agentApi.apiKey) {
            errors.push('AgentAPI key is required');
        }

        // Validate timeout values
        if (this.config.deployment.maxValidationTime < 60000) {
            errors.push('Maximum validation time must be at least 1 minute');
        }

        if (this.config.deployment.pollInterval < 5000) {
            errors.push('Poll interval must be at least 5 seconds');
        }

        // Validate validation layer timeouts
        for (const [layerName, layerConfig] of Object.entries(this.config.validation.layers)) {
            if (layerConfig.enabled && layerConfig.timeout < 10000) {
                errors.push(`${layerName} validation timeout must be at least 10 seconds`);
            }
        }

        // Validate auto-fix configuration
        if (this.config.autoFix.maxAttempts < 1 || this.config.autoFix.maxAttempts > 10) {
            errors.push('Auto-fix max attempts must be between 1 and 10');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Get configuration value
     * @param {string} path - Configuration path (e.g., 'agentApi.url')
     * @returns {*} Configuration value
     */
    get(path) {
        return this.getNestedValue(this.config, path);
    }

    /**
     * Set configuration value
     * @param {string} path - Configuration path
     * @param {*} value - Value to set
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.validateConfig();
    }

    /**
     * Get nested value from object
     * @param {Object} obj - Object to search
     * @param {string} path - Dot-separated path
     * @returns {*} Value or undefined
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set nested value in object
     * @param {Object} obj - Object to modify
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    /**
     * Get AgentAPI configuration
     * @returns {Object} AgentAPI configuration
     */
    getAgentApiConfig() {
        return { ...this.config.agentApi };
    }

    /**
     * Get deployment configuration
     * @returns {Object} Deployment configuration
     */
    getDeploymentConfig() {
        return { ...this.config.deployment };
    }

    /**
     * Get WSL2 environment configuration
     * @param {string} environmentType - Environment type
     * @returns {Object} Environment configuration
     */
    getWSL2Config(environmentType = null) {
        if (environmentType) {
            return this.config.wsl2.environments[environmentType] || null;
        }
        return { ...this.config.wsl2 };
    }

    /**
     * Get validation configuration
     * @param {string} layerName - Validation layer name (optional)
     * @returns {Object} Validation configuration
     */
    getValidationConfig(layerName = null) {
        if (layerName) {
            return this.config.validation.layers[layerName] || null;
        }
        return { ...this.config.validation };
    }

    /**
     * Get auto-fix configuration
     * @param {string} strategyName - Fix strategy name (optional)
     * @returns {Object} Auto-fix configuration
     */
    getAutoFixConfig(strategyName = null) {
        if (strategyName) {
            return this.config.autoFix.strategies[strategyName] || null;
        }
        return { ...this.config.autoFix };
    }

    /**
     * Get enabled validation layers
     * @returns {Array<string>} List of enabled validation layers
     */
    getEnabledValidationLayers() {
        return Object.entries(this.config.validation.layers)
            .filter(([_, config]) => config.enabled)
            .map(([name, _]) => name);
    }

    /**
     * Get enabled auto-fix strategies
     * @returns {Array<string>} List of enabled auto-fix strategies
     */
    getEnabledAutoFixStrategies() {
        return Object.entries(this.config.autoFix.strategies)
            .filter(([_, config]) => config.enabled)
            .map(([name, _]) => name);
    }

    /**
     * Check if feature is enabled
     * @param {string} featureName - Feature name
     * @returns {boolean} True if feature is enabled
     */
    isFeatureEnabled(featureName) {
        return this.config.features[featureName] || false;
    }

    /**
     * Update configuration from environment variables
     */
    updateFromEnvironment() {
        const envMappings = {
            'AGENT_API_URL': 'agentApi.url',
            'AGENT_API_KEY': 'agentApi.apiKey',
            'GITHUB_WEBHOOK_SECRET': 'github.webhookSecret',
            'LINEAR_API_KEY': 'linear.apiKey',
            'CODEGEN_USER_ID': 'linear.assigneeId',
            'LINEAR_DEFAULT_TEAM_ID': 'linear.defaultTeamId',
            'LOG_LEVEL': 'logging.level',
            'MAX_CONCURRENT_DEPLOYMENTS': 'deployment.maxConcurrentDeployments',
            'MAX_VALIDATION_TIME': 'deployment.maxValidationTime',
            'ENABLE_AUTO_FIX': 'autoFix.enabled',
            'MAX_AUTO_FIX_ATTEMPTS': 'autoFix.maxAttempts'
        };

        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const value = process.env[envVar];
            if (value !== undefined) {
                // Convert string values to appropriate types
                let convertedValue = value;
                if (value === 'true') convertedValue = true;
                else if (value === 'false') convertedValue = false;
                else if (!isNaN(value) && !isNaN(parseFloat(value))) convertedValue = parseFloat(value);
                
                this.set(configPath, convertedValue);
            }
        }
    }

    /**
     * Export configuration as JSON
     * @param {boolean} includeSecrets - Whether to include sensitive values
     * @returns {Object} Configuration object
     */
    toJSON(includeSecrets = false) {
        const config = JSON.parse(JSON.stringify(this.config));
        
        if (!includeSecrets) {
            // Remove sensitive information
            if (config.agentApi.apiKey) config.agentApi.apiKey = '[REDACTED]';
            if (config.github.webhookSecret) config.github.webhookSecret = '[REDACTED]';
            if (config.linear.apiKey) config.linear.apiKey = '[REDACTED]';
        }
        
        return config;
    }

    /**
     * Create configuration from JSON
     * @param {Object} json - Configuration JSON
     * @returns {ClaudeCodeConfig} New configuration instance
     */
    static fromJSON(json) {
        return new ClaudeCodeConfig(json);
    }

    /**
     * Create default configuration
     * @returns {ClaudeCodeConfig} Default configuration instance
     */
    static createDefault() {
        return new ClaudeCodeConfig();
    }

    /**
     * Merge configurations
     * @param {ClaudeCodeConfig} other - Other configuration to merge
     * @returns {ClaudeCodeConfig} Merged configuration
     */
    merge(other) {
        const merged = this.deepMerge(this.config, other.config);
        return new ClaudeCodeConfig(merged);
    }

    /**
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
}

export default ClaudeCodeConfig;

