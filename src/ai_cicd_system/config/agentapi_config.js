/**
 * AgentAPI Configuration
 * 
 * Configuration settings for AgentAPI client and WSL2 environment management.
 */

export class AgentAPIConfig {
    constructor(options = {}) {
        this.config = {
            // AgentAPI Server Configuration
            server: {
                baseUrl: options.baseUrl || process.env.AGENTAPI_BASE_URL || 'http://localhost:3284',
                apiKey: options.apiKey || process.env.AGENTAPI_KEY,
                timeout: options.timeout || 300000, // 5 minutes
                retries: options.retries || 3,
                retryDelay: options.retryDelay || 1000, // 1 second base delay
                maxRetryDelay: options.maxRetryDelay || 10000, // 10 seconds max delay
                ...options.server
            },

            // WSL2 Configuration
            wsl2: {
                distribution: options.wsl2?.distribution || 'Ubuntu-22.04',
                maxInstances: options.wsl2?.maxInstances || 10,
                resourceLimits: {
                    memory: '4GB',
                    cpu: '2 cores',
                    disk: '20GB',
                    ...options.wsl2?.resourceLimits
                },
                networkConfig: {
                    enableNetworking: true,
                    portRange: {
                        start: 22000,
                        end: 23000
                    },
                    ...options.wsl2?.networkConfig
                },
                ...options.wsl2
            },

            // Claude Code Configuration
            claudeCode: {
                allowedTools: options.claudeCode?.allowedTools || 'Bash(git*) Edit Replace',
                workspace: options.claudeCode?.workspace || '/workspace',
                validationMode: options.claudeCode?.validationMode || 'strict',
                autoSave: options.claudeCode?.autoSave !== false,
                sessionTimeout: options.claudeCode?.sessionTimeout || 600000, // 10 minutes
                ...options.claudeCode
            },

            // Environment Management
            environment: {
                creationTimeout: options.environment?.creationTimeout || 120000, // 2 minutes
                setupTimeout: options.environment?.setupTimeout || 300000, // 5 minutes
                cleanupTimeout: options.environment?.cleanupTimeout || 60000, // 1 minute
                healthCheckInterval: options.environment?.healthCheckInterval || 30000, // 30 seconds
                maxSetupRetries: options.environment?.maxSetupRetries || 3,
                ...options.environment
            },

            // Repository Management
            repository: {
                defaultWorkspace: options.repository?.defaultWorkspace || '/workspace',
                cloneTimeout: options.repository?.cloneTimeout || 300000, // 5 minutes
                gitConfig: {
                    user: {
                        name: 'Claude Task Master',
                        email: 'claude-task-master@example.com'
                    },
                    ...options.repository?.gitConfig
                },
                ...options.repository
            },

            // Monitoring Configuration
            monitoring: {
                enabled: options.monitoring?.enabled !== false,
                interval: options.monitoring?.interval || 30000, // 30 seconds
                retentionPeriod: options.monitoring?.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
                alertThresholds: {
                    cpu: {
                        warning: 80,
                        critical: 95
                    },
                    memory: {
                        warning: 80,
                        critical: 95
                    },
                    disk: {
                        warning: 85,
                        critical: 95
                    },
                    network: {
                        warning: 100 * 1024 * 1024, // 100MB/s
                        critical: 500 * 1024 * 1024  // 500MB/s
                    },
                    ...options.monitoring?.alertThresholds
                },
                ...options.monitoring
            },

            // Security Configuration
            security: {
                enableAuthentication: options.security?.enableAuthentication !== false,
                apiKeyRequired: options.security?.apiKeyRequired !== false,
                allowedOrigins: options.security?.allowedOrigins || ['*'],
                rateLimiting: {
                    enabled: true,
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    maxRequests: 100,
                    ...options.security?.rateLimiting
                },
                ...options.security
            },

            // Logging Configuration
            logging: {
                level: options.logging?.level || 'info',
                enableConsole: options.logging?.enableConsole !== false,
                enableFile: options.logging?.enableFile || false,
                logFile: options.logging?.logFile || 'agentapi.log',
                maxFileSize: options.logging?.maxFileSize || 10 * 1024 * 1024, // 10MB
                maxFiles: options.logging?.maxFiles || 5,
                ...options.logging
            }
        };

        this.validateConfig();
    }

    /**
     * Validate configuration settings
     */
    validateConfig() {
        // Validate server configuration
        if (!this.config.server.baseUrl) {
            throw new Error('AgentAPI base URL is required');
        }

        // Validate WSL2 configuration
        if (this.config.wsl2.maxInstances < 1) {
            throw new Error('WSL2 max instances must be at least 1');
        }

        // Validate timeouts
        const timeouts = [
            'server.timeout',
            'environment.creationTimeout',
            'environment.setupTimeout',
            'environment.cleanupTimeout',
            'repository.cloneTimeout',
            'claudeCode.sessionTimeout'
        ];

        timeouts.forEach(path => {
            const value = this.getNestedValue(this.config, path);
            if (value && (typeof value !== 'number' || value < 1000)) {
                throw new Error(`${path} must be a number >= 1000ms`);
            }
        });

        // Validate alert thresholds
        const thresholds = this.config.monitoring.alertThresholds;
        Object.keys(thresholds).forEach(resource => {
            if (thresholds[resource].warning >= thresholds[resource].critical) {
                throw new Error(`${resource} warning threshold must be less than critical threshold`);
            }
        });
    }

    /**
     * Get nested configuration value
     * @param {Object} obj - Configuration object
     * @param {string} path - Dot-separated path
     * @returns {any} Configuration value
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    /**
     * Get server configuration
     * @returns {Object} Server configuration
     */
    getServerConfig() {
        return { ...this.config.server };
    }

    /**
     * Get WSL2 configuration
     * @returns {Object} WSL2 configuration
     */
    getWSL2Config() {
        return { ...this.config.wsl2 };
    }

    /**
     * Get Claude Code configuration
     * @returns {Object} Claude Code configuration
     */
    getClaudeCodeConfig() {
        return { ...this.config.claudeCode };
    }

    /**
     * Get environment configuration
     * @returns {Object} Environment configuration
     */
    getEnvironmentConfig() {
        return { ...this.config.environment };
    }

    /**
     * Get repository configuration
     * @returns {Object} Repository configuration
     */
    getRepositoryConfig() {
        return { ...this.config.repository };
    }

    /**
     * Get monitoring configuration
     * @returns {Object} Monitoring configuration
     */
    getMonitoringConfig() {
        return { ...this.config.monitoring };
    }

    /**
     * Get security configuration
     * @returns {Object} Security configuration
     */
    getSecurityConfig() {
        return { ...this.config.security };
    }

    /**
     * Get logging configuration
     * @returns {Object} Logging configuration
     */
    getLoggingConfig() {
        return { ...this.config.logging };
    }

    /**
     * Get complete configuration
     * @returns {Object} Complete configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration
     * @param {Object} updates - Configuration updates
     */
    updateConfig(updates) {
        this.config = this.mergeDeep(this.config, updates);
        this.validateConfig();
    }

    /**
     * Deep merge configuration objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    mergeDeep(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeDeep(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Create configuration from environment variables
     * @returns {AgentAPIConfig} Configuration instance
     */
    static fromEnvironment() {
        const envConfig = {
            server: {
                baseUrl: process.env.AGENTAPI_BASE_URL,
                apiKey: process.env.AGENTAPI_KEY,
                timeout: process.env.AGENTAPI_TIMEOUT ? parseInt(process.env.AGENTAPI_TIMEOUT) : undefined,
                retries: process.env.AGENTAPI_RETRIES ? parseInt(process.env.AGENTAPI_RETRIES) : undefined
            },
            wsl2: {
                distribution: process.env.WSL2_DISTRIBUTION,
                maxInstances: process.env.WSL2_MAX_INSTANCES ? parseInt(process.env.WSL2_MAX_INSTANCES) : undefined,
                resourceLimits: {
                    memory: process.env.WSL2_MEMORY_LIMIT,
                    cpu: process.env.WSL2_CPU_LIMIT,
                    disk: process.env.WSL2_DISK_LIMIT
                }
            },
            claudeCode: {
                allowedTools: process.env.CLAUDE_CODE_ALLOWED_TOOLS,
                workspace: process.env.CLAUDE_CODE_WORKSPACE,
                validationMode: process.env.CLAUDE_CODE_VALIDATION_MODE,
                sessionTimeout: process.env.CLAUDE_CODE_SESSION_TIMEOUT ? parseInt(process.env.CLAUDE_CODE_SESSION_TIMEOUT) : undefined
            },
            monitoring: {
                enabled: process.env.MONITORING_ENABLED !== 'false',
                interval: process.env.MONITORING_INTERVAL ? parseInt(process.env.MONITORING_INTERVAL) : undefined,
                retentionPeriod: process.env.MONITORING_RETENTION_PERIOD ? parseInt(process.env.MONITORING_RETENTION_PERIOD) : undefined
            },
            security: {
                enableAuthentication: process.env.SECURITY_ENABLE_AUTH !== 'false',
                apiKeyRequired: process.env.SECURITY_API_KEY_REQUIRED !== 'false'
            },
            logging: {
                level: process.env.LOG_LEVEL,
                enableFile: process.env.LOG_ENABLE_FILE === 'true',
                logFile: process.env.LOG_FILE
            }
        };

        // Remove undefined values
        const cleanConfig = JSON.parse(JSON.stringify(envConfig, (key, value) => 
            value === undefined ? null : value
        ));

        return new AgentAPIConfig(cleanConfig);
    }

    /**
     * Export configuration to environment variables format
     * @returns {Object} Environment variables
     */
    toEnvironmentVariables() {
        return {
            AGENTAPI_BASE_URL: this.config.server.baseUrl,
            AGENTAPI_KEY: this.config.server.apiKey,
            AGENTAPI_TIMEOUT: this.config.server.timeout.toString(),
            AGENTAPI_RETRIES: this.config.server.retries.toString(),
            
            WSL2_DISTRIBUTION: this.config.wsl2.distribution,
            WSL2_MAX_INSTANCES: this.config.wsl2.maxInstances.toString(),
            WSL2_MEMORY_LIMIT: this.config.wsl2.resourceLimits.memory,
            WSL2_CPU_LIMIT: this.config.wsl2.resourceLimits.cpu,
            WSL2_DISK_LIMIT: this.config.wsl2.resourceLimits.disk,
            
            CLAUDE_CODE_ALLOWED_TOOLS: this.config.claudeCode.allowedTools,
            CLAUDE_CODE_WORKSPACE: this.config.claudeCode.workspace,
            CLAUDE_CODE_VALIDATION_MODE: this.config.claudeCode.validationMode,
            CLAUDE_CODE_SESSION_TIMEOUT: this.config.claudeCode.sessionTimeout.toString(),
            
            MONITORING_ENABLED: this.config.monitoring.enabled.toString(),
            MONITORING_INTERVAL: this.config.monitoring.interval.toString(),
            MONITORING_RETENTION_PERIOD: this.config.monitoring.retentionPeriod.toString(),
            
            SECURITY_ENABLE_AUTH: this.config.security.enableAuthentication.toString(),
            SECURITY_API_KEY_REQUIRED: this.config.security.apiKeyRequired.toString(),
            
            LOG_LEVEL: this.config.logging.level,
            LOG_ENABLE_FILE: this.config.logging.enableFile.toString(),
            LOG_FILE: this.config.logging.logFile
        };
    }
}

export default AgentAPIConfig;

