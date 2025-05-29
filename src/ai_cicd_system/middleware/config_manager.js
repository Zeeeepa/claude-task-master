/**
 * @fileoverview Configuration Manager
 * @description Unified configuration management system consolidating config approaches
 * from PRs #46, #60, #61, #92. Provides environment-based configuration, validation,
 * and hot-reloading capabilities.
 */

import fs from 'fs/promises';
import path from 'path';
import { SimpleLogger } from '../utils/simple_logger.js';

export class ConfigManager {
    constructor(configPath = null) {
        this.configPath = configPath || this._getDefaultConfigPath();
        this.config = null;
        this.watchers = new Map();
        this.logger = new SimpleLogger('ConfigManager');
        
        // Configuration schema for validation
        this.schema = this._getConfigSchema();
    }

    /**
     * Load configuration
     */
    async load() {
        try {
            this.logger.info('📋 Loading configuration...');
            
            // Start with default configuration
            this.config = this._getDefaultConfig();
            
            // Load from file if exists
            if (await this._fileExists(this.configPath)) {
                const fileConfig = await this._loadFromFile();
                this.config = this._mergeConfigs(this.config, fileConfig);
            }
            
            // Override with environment variables
            this._applyEnvironmentOverrides();
            
            // Validate configuration
            this._validateConfig();
            
            this.logger.info('✅ Configuration loaded successfully');
            this._notifyWatchers('configLoaded', this.config);
            
            return this.config;

        } catch (error) {
            this.logger.error('❌ Failed to load configuration:', error);
            throw error;
        }
    }

    /**
     * Save configuration to file
     */
    async save() {
        try {
            this.logger.info('💾 Saving configuration...');
            
            // Ensure directory exists
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            
            // Save configuration
            await fs.writeFile(
                this.configPath, 
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
            
            this.logger.info('✅ Configuration saved successfully');
            this._notifyWatchers('configSaved', this.config);

        } catch (error) {
            this.logger.error('❌ Failed to save configuration:', error);
            throw error;
        }
    }

    /**
     * Get configuration value
     * @param {string} path - Configuration path (e.g., 'agentapi.baseUrl')
     * @param {*} defaultValue - Default value if path not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue = undefined) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value
     * @param {string} path - Configuration path
     * @param {*} value - Value to set
     */
    set(path, value) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        const lastKey = keys[keys.length - 1];
        current[lastKey] = value;
        
        this._notifyWatchers('configChanged', { path, value });
    }

    /**
     * Watch for configuration changes
     * @param {Function} callback - Callback function
     * @returns {Function} Unwatch function
     */
    watch(callback) {
        const watcherId = Date.now().toString() + Math.random().toString(36).substring(2);
        this.watchers.set(watcherId, callback);
        
        return () => {
            this.watchers.delete(watcherId);
        };
    }

    /**
     * Get full configuration
     * @returns {Object} Full configuration
     */
    getAll() {
        return this.config ? { ...this.config } : null;
    }

    /**
     * Reload configuration from file
     */
    async reload() {
        this.logger.info('🔄 Reloading configuration...');
        await this.load();
    }

    // Private methods

    _getDefaultConfigPath() {
        return path.join(process.cwd(), 'config', 'agentapi.json');
    }

    _getDefaultConfig() {
        return {
            // AgentAPI Configuration (from PRs #43, #46, #60, #85)
            agentapi: {
                baseUrl: 'http://localhost:3284',
                timeout: 30000,
                retryAttempts: 3,
                retryDelay: 1000,
                enableEventStream: true,
                healthCheckInterval: 30000,
                reconnectDelay: 5000,
                maxReconnectAttempts: 10,
                circuitBreaker: {
                    failureThreshold: 5,
                    recoveryTimeout: 60000
                }
            },

            // Claude Code Configuration (from PRs #47, #85)
            claudeCode: {
                maxInstances: 5,
                instanceTimeout: 300000,
                defaultTools: ['Bash(git*)', 'Edit', 'Replace'],
                workingDirectory: process.cwd(),
                autoStart: false,
                autoRestart: true,
                healthCheckInterval: 30000
            },

            // Task Queue Configuration (from PRs #43, #92)
            taskQueue: {
                maxConcurrentTasks: 3,
                defaultPriority: 5,
                taskTimeout: 300000,
                retryAttempts: 3,
                retryDelay: 5000,
                queueProcessInterval: 1000,
                maxQueueSize: 1000,
                enablePersistence: false
            },

            // WSL2 Configuration (from PRs #46, #85)
            wsl2: {
                enabled: false,
                maxInstances: 5,
                defaultDistribution: 'Ubuntu-22.04',
                resourceLimits: {
                    memory: '2GB',
                    cpu: '2 cores',
                    disk: '10GB'
                },
                timeout: 300000,
                healthCheckInterval: 30000,
                autoCleanup: true,
                cleanupIdleTime: 600000,
                workspaceRoot: '/tmp/claude-deployments'
            },

            // Security Configuration (from PRs #61, #84)
            security: {
                enableAuth: false,
                apiKey: null,
                jwtSecret: null,
                jwtExpiresIn: '1h',
                enableRateLimit: false,
                rateLimitWindow: 900000,
                rateLimitMax: 100,
                enableSSL: false,
                sslCertPath: null,
                sslKeyPath: null
            },

            // Synchronization Configuration (from PRs #76, #83)
            sync: {
                enableRealTimeSync: true,
                conflictResolution: 'latest_wins',
                syncInterval: 5000,
                enableWebSocket: true,
                maxRetries: 3,
                retryDelay: 2000,
                enablePersistence: false
            },

            // Database Configuration (from PR #61)
            database: {
                enabled: false,
                host: 'localhost',
                port: 5432,
                name: 'claude_task_master',
                username: 'postgres',
                password: null,
                ssl: false,
                poolSize: 10,
                connectionTimeout: 30000,
                queryTimeout: 60000
            },

            // Monitoring Configuration (from PRs #60, #76)
            monitoring: {
                enabled: true,
                metricsPort: 9090,
                healthCheckPort: 8080,
                enablePrometheus: false,
                enableTracing: false,
                enableDashboard: true,
                dashboardPort: 3001,
                logLevel: 'info',
                enableFileLogging: false,
                logDirectory: './logs'
            },

            // Webhook Configuration (from PR #83)
            webhooks: {
                enabled: false,
                port: 3002,
                secret: null,
                enableSignatureValidation: true,
                maxPayloadSize: 1048576, // 1MB
                timeout: 30000,
                github: {
                    enabled: false,
                    secret: null,
                    events: ['pull_request', 'push', 'issues']
                },
                linear: {
                    enabled: false,
                    secret: null,
                    events: ['issue', 'comment']
                }
            },

            // Integration Configuration
            integrations: {
                linear: {
                    enabled: false,
                    apiKey: null,
                    teamId: null
                },
                github: {
                    enabled: false,
                    token: null
                },
                cloudflare: {
                    enabled: false,
                    apiToken: null,
                    zoneId: null
                }
            },

            // Environment
            environment: 'development',
            version: '1.0.0'
        };
    }

    _getConfigSchema() {
        return {
            agentapi: {
                baseUrl: { type: 'string', required: true },
                timeout: { type: 'number', min: 1000, max: 300000 },
                retryAttempts: { type: 'number', min: 0, max: 10 },
                enableEventStream: { type: 'boolean' }
            },
            claudeCode: {
                maxInstances: { type: 'number', min: 1, max: 20 },
                instanceTimeout: { type: 'number', min: 10000 }
            },
            taskQueue: {
                maxConcurrentTasks: { type: 'number', min: 1, max: 50 },
                maxQueueSize: { type: 'number', min: 10 }
            },
            security: {
                enableAuth: { type: 'boolean' },
                enableRateLimit: { type: 'boolean' }
            },
            monitoring: {
                enabled: { type: 'boolean' },
                metricsPort: { type: 'number', min: 1024, max: 65535 }
            }
        };
    }

    async _loadFromFile() {
        try {
            const content = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(content);
            this.logger.info(`📄 Loaded configuration from ${this.configPath}`);
            return config;
        } catch (error) {
            this.logger.error(`❌ Failed to load configuration from ${this.configPath}:`, error);
            throw error;
        }
    }

    _applyEnvironmentOverrides() {
        const envMappings = {
            // AgentAPI
            'AGENTAPI_URL': 'agentapi.baseUrl',
            'AGENTAPI_TIMEOUT': 'agentapi.timeout',
            'AGENTAPI_RETRY_ATTEMPTS': 'agentapi.retryAttempts',
            'AGENTAPI_ENABLE_EVENT_STREAM': 'agentapi.enableEventStream',
            
            // Claude Code
            'CLAUDE_CODE_MAX_INSTANCES': 'claudeCode.maxInstances',
            'CLAUDE_CODE_INSTANCE_TIMEOUT': 'claudeCode.instanceTimeout',
            'CLAUDE_CODE_AUTO_START': 'claudeCode.autoStart',
            
            // Task Queue
            'TASK_QUEUE_MAX_CONCURRENT': 'taskQueue.maxConcurrentTasks',
            'TASK_QUEUE_MAX_SIZE': 'taskQueue.maxQueueSize',
            'TASK_QUEUE_ENABLE_PERSISTENCE': 'taskQueue.enablePersistence',
            
            // WSL2
            'WSL2_ENABLED': 'wsl2.enabled',
            'WSL2_MAX_INSTANCES': 'wsl2.maxInstances',
            'WSL2_DEFAULT_DISTRIBUTION': 'wsl2.defaultDistribution',
            
            // Security
            'ENABLE_AUTH': 'security.enableAuth',
            'API_KEY': 'security.apiKey',
            'JWT_SECRET': 'security.jwtSecret',
            'ENABLE_RATE_LIMIT': 'security.enableRateLimit',
            
            // Database
            'DATABASE_ENABLED': 'database.enabled',
            'DB_HOST': 'database.host',
            'DB_PORT': 'database.port',
            'DB_NAME': 'database.name',
            'DB_USERNAME': 'database.username',
            'DB_PASSWORD': 'database.password',
            
            // Monitoring
            'MONITORING_ENABLED': 'monitoring.enabled',
            'METRICS_PORT': 'monitoring.metricsPort',
            'LOG_LEVEL': 'monitoring.logLevel',
            
            // Environment
            'NODE_ENV': 'environment'
        };

        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const envValue = process.env[envVar];
            if (envValue !== undefined) {
                const convertedValue = this._convertEnvValue(envValue);
                this.set(configPath, convertedValue);
            }
        }
    }

    _convertEnvValue(value) {
        // Convert string environment variables to appropriate types
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (value === 'undefined') return undefined;
        
        // Try to parse as number
        const numValue = Number(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
            return numValue;
        }
        
        // Try to parse as JSON
        try {
            return JSON.parse(value);
        } catch {
            // Return as string
            return value;
        }
    }

    _mergeConfigs(defaultConfig, fileConfig) {
        const merged = { ...defaultConfig };
        
        for (const [key, value] of Object.entries(fileConfig)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                merged[key] = this._mergeConfigs(merged[key] || {}, value);
            } else {
                merged[key] = value;
            }
        }
        
        return merged;
    }

    _validateConfig() {
        const errors = [];
        
        this._validateSection(this.config, this.schema, '', errors);
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    _validateSection(config, schema, prefix, errors) {
        for (const [key, rules] of Object.entries(schema)) {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            const value = config[key];
            
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`${fullPath} is required`);
                continue;
            }
            
            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`${fullPath} must be of type ${rules.type}`);
                }
                
                if (rules.min !== undefined && value < rules.min) {
                    errors.push(`${fullPath} must be at least ${rules.min}`);
                }
                
                if (rules.max !== undefined && value > rules.max) {
                    errors.push(`${fullPath} must be at most ${rules.max}`);
                }
            }
            
            // Recursively validate nested objects
            if (typeof value === 'object' && !Array.isArray(value) && typeof rules === 'object') {
                this._validateSection(value, rules, fullPath, errors);
            }
        }
    }

    _notifyWatchers(event, data) {
        for (const callback of this.watchers.values()) {
            try {
                callback(event, data);
            } catch (error) {
                this.logger.error('❌ Error in config watcher callback:', error);
            }
        }
    }

    async _fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

export default ConfigManager;

