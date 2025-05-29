/**
 * AgentAPI Configuration
 * Configuration management for AgentAPI middleware
 * Part of Task Master Architecture Restructuring
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    // Server configuration
    server: {
        port: 3284,
        host: 'localhost',
        ssl: false,
        sslCert: null,
        sslKey: null
    },

    // Session configuration
    sessions: {
        maxSessions: 10,
        sessionTimeout: 3600000, // 1 hour
        cleanupInterval: 60000, // 1 minute
        persistenceEnabled: true,
        storageType: 'memory', // 'memory' or 'file'
        storageFile: './agentapi-sessions.json',
        backupFile: './agentapi-sessions.backup.json'
    },

    // Claude Code configuration
    claude: {
        claudeCodePath: '/usr/local/bin/claude',
        allowedTools: ['Bash(git*)', 'Edit', 'Replace'],
        processTimeout: 30000,
        maxProcesses: 5
    },

    // Message handling configuration
    messages: {
        maxQueueSize: 1000,
        retryAttempts: 3,
        retryDelay: 1000,
        messageTimeout: 30000
    },

    // Security configuration
    security: {
        enableAuth: false,
        authToken: null,
        rateLimitEnabled: true,
        rateLimitWindow: 900000, // 15 minutes
        rateLimitMax: 100
    },

    // Logging configuration
    logging: {
        level: 'info',
        enableRequestLogging: true,
        enableErrorLogging: true,
        logFile: null
    },

    // Integration configuration
    integration: {
        orchestratorEnabled: false,
        orchestratorUrl: null,
        eventDispatcherEnabled: true
    }
};

/**
 * Environment variable mappings
 */
export const ENV_MAPPINGS = {
    // Server
    'AGENTAPI_PORT': 'server.port',
    'AGENTAPI_HOST': 'server.host',
    'AGENTAPI_SSL': 'server.ssl',
    'AGENTAPI_SSL_CERT': 'server.sslCert',
    'AGENTAPI_SSL_KEY': 'server.sslKey',

    // Claude Code
    'CLAUDE_CODE_PATH': 'claude.claudeCodePath',
    'CLAUDE_ALLOWED_TOOLS': 'claude.allowedTools',
    'CLAUDE_MAX_PROCESSES': 'claude.maxProcesses',

    // Sessions
    'AGENTAPI_MAX_SESSIONS': 'sessions.maxSessions',
    'AGENTAPI_SESSION_TIMEOUT': 'sessions.sessionTimeout',
    'AGENTAPI_STORAGE_TYPE': 'sessions.storageType',
    'AGENTAPI_STORAGE_FILE': 'sessions.storageFile',

    // Security
    'AGENTAPI_AUTH_TOKEN': 'security.authToken',
    'AGENTAPI_ENABLE_AUTH': 'security.enableAuth',

    // Logging
    'AGENTAPI_LOG_LEVEL': 'logging.level',
    'AGENTAPI_LOG_FILE': 'logging.logFile',

    // Integration
    'ORCHESTRATOR_URL': 'integration.orchestratorUrl',
    'ORCHESTRATOR_ENABLED': 'integration.orchestratorEnabled'
};

/**
 * Configuration Manager
 */
export class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
        this.watchers = new Map();
    }

    /**
     * Load configuration from multiple sources
     */
    loadConfig() {
        let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

        // Load from config file
        const fileConfig = this.loadFromFile();
        if (fileConfig) {
            config = this.mergeConfig(config, fileConfig);
        }

        // Load from environment variables
        const envConfig = this.loadFromEnvironment();
        config = this.mergeConfig(config, envConfig);

        // Validate configuration
        this.validateConfig(config);

        return config;
    }

    /**
     * Load configuration from file
     */
    loadFromFile() {
        const configPaths = [
            './agentapi.config.json',
            './config/agentapi.json',
            resolve(process.cwd(), 'agentapi.config.json'),
            resolve(process.cwd(), '.agentapi.json')
        ];

        for (const configPath of configPaths) {
            if (existsSync(configPath)) {
                try {
                    const configData = readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    console.log(`Loaded configuration from ${configPath}`);
                    return config;
                } catch (error) {
                    console.warn(`Error loading config from ${configPath}:`, error.message);
                }
            }
        }

        return null;
    }

    /**
     * Load configuration from environment variables
     */
    loadFromEnvironment() {
        const envConfig = {};

        for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
            const value = process.env[envVar];
            if (value !== undefined) {
                this.setNestedValue(envConfig, configPath, this.parseEnvValue(value));
            }
        }

        return envConfig;
    }

    /**
     * Parse environment variable value
     */
    parseEnvValue(value) {
        // Boolean values
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;

        // Number values
        if (/^\d+$/.test(value)) return parseInt(value, 10);
        if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

        // Array values (comma-separated)
        if (value.includes(',')) {
            return value.split(',').map(item => item.trim());
        }

        // String values
        return value;
    }

    /**
     * Set nested value in object
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Merge configuration objects
     */
    mergeConfig(base, override) {
        const result = { ...base };

        for (const [key, value] of Object.entries(override)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.mergeConfig(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Validate configuration
     */
    validateConfig(config) {
        const errors = [];

        // Validate server configuration
        if (config.server.port < 1 || config.server.port > 65535) {
            errors.push('Server port must be between 1 and 65535');
        }

        if (!config.server.host) {
            errors.push('Server host is required');
        }

        // Validate session configuration
        if (config.sessions.maxSessions < 1) {
            errors.push('Max sessions must be at least 1');
        }

        if (config.sessions.sessionTimeout < 1000) {
            errors.push('Session timeout must be at least 1000ms');
        }

        // Validate Claude Code configuration
        if (!config.claude.claudeCodePath) {
            errors.push('Claude Code path is required');
        }

        if (!Array.isArray(config.claude.allowedTools)) {
            errors.push('Allowed tools must be an array');
        }

        // Validate message configuration
        if (config.messages.maxQueueSize < 1) {
            errors.push('Max queue size must be at least 1');
        }

        if (config.messages.retryAttempts < 0) {
            errors.push('Retry attempts must be non-negative');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Get configuration value
     */
    get(path = null) {
        if (!path) {
            return this.config;
        }

        const keys = path.split('.');
        let current = this.config;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Set configuration value
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.validateConfig(this.config);
        this.notifyWatchers(path, value);
    }

    /**
     * Update configuration
     */
    update(updates) {
        this.config = this.mergeConfig(this.config, updates);
        this.validateConfig(this.config);
        this.notifyWatchers('*', this.config);
    }

    /**
     * Watch for configuration changes
     */
    watch(path, callback) {
        const watcherId = `${path}_${Date.now()}_${Math.random()}`;
        this.watchers.set(watcherId, { path, callback });
        return watcherId;
    }

    /**
     * Remove configuration watcher
     */
    unwatch(watcherId) {
        return this.watchers.delete(watcherId);
    }

    /**
     * Notify configuration watchers
     */
    notifyWatchers(changedPath, value) {
        for (const [watcherId, watcher] of this.watchers) {
            if (watcher.path === '*' || watcher.path === changedPath || changedPath.startsWith(watcher.path + '.')) {
                try {
                    watcher.callback(changedPath, value, this.config);
                } catch (error) {
                    console.error(`Error in config watcher ${watcherId}:`, error);
                }
            }
        }
    }

    /**
     * Get flattened configuration for AgentAPI components
     */
    getAgentAPIConfig() {
        return {
            // Server configuration
            port: this.get('server.port'),
            host: this.get('server.host'),
            ssl: this.get('server.ssl'),
            sslCert: this.get('server.sslCert'),
            sslKey: this.get('server.sslKey'),

            // Session configuration
            maxSessions: this.get('sessions.maxSessions'),
            sessionTimeout: this.get('sessions.sessionTimeout'),
            cleanupInterval: this.get('sessions.cleanupInterval'),
            persistenceEnabled: this.get('sessions.persistenceEnabled'),
            storageType: this.get('sessions.storageType'),
            storageFile: this.get('sessions.storageFile'),
            backupFile: this.get('sessions.backupFile'),

            // Claude Code configuration
            claudeCodePath: this.get('claude.claudeCodePath'),
            allowedTools: this.get('claude.allowedTools'),
            processTimeout: this.get('claude.processTimeout'),
            maxProcesses: this.get('claude.maxProcesses'),

            // Message configuration
            maxQueueSize: this.get('messages.maxQueueSize'),
            retryAttempts: this.get('messages.retryAttempts'),
            retryDelay: this.get('messages.retryDelay'),
            messageTimeout: this.get('messages.messageTimeout'),

            // Security configuration
            enableAuth: this.get('security.enableAuth'),
            authToken: this.get('security.authToken'),
            rateLimitEnabled: this.get('security.rateLimitEnabled'),
            rateLimitWindow: this.get('security.rateLimitWindow'),
            rateLimitMax: this.get('security.rateLimitMax'),

            // Logging configuration
            logLevel: this.get('logging.level'),
            enableRequestLogging: this.get('logging.enableRequestLogging'),
            enableErrorLogging: this.get('logging.enableErrorLogging'),
            logFile: this.get('logging.logFile'),

            // Integration configuration
            orchestratorEnabled: this.get('integration.orchestratorEnabled'),
            orchestratorUrl: this.get('integration.orchestratorUrl'),
            eventDispatcherEnabled: this.get('integration.eventDispatcherEnabled')
        };
    }

    /**
     * Export configuration to file
     */
    exportToFile(filePath) {
        const fs = require('fs');
        const configData = JSON.stringify(this.config, null, 2);
        fs.writeFileSync(filePath, configData);
        console.log(`Configuration exported to ${filePath}`);
    }

    /**
     * Get configuration schema for validation
     */
    getSchema() {
        return {
            type: 'object',
            properties: {
                server: {
                    type: 'object',
                    properties: {
                        port: { type: 'number', minimum: 1, maximum: 65535 },
                        host: { type: 'string', minLength: 1 },
                        ssl: { type: 'boolean' },
                        sslCert: { type: ['string', 'null'] },
                        sslKey: { type: ['string', 'null'] }
                    },
                    required: ['port', 'host']
                },
                sessions: {
                    type: 'object',
                    properties: {
                        maxSessions: { type: 'number', minimum: 1 },
                        sessionTimeout: { type: 'number', minimum: 1000 },
                        cleanupInterval: { type: 'number', minimum: 1000 },
                        persistenceEnabled: { type: 'boolean' },
                        storageType: { type: 'string', enum: ['memory', 'file'] },
                        storageFile: { type: 'string' },
                        backupFile: { type: 'string' }
                    }
                },
                claude: {
                    type: 'object',
                    properties: {
                        claudeCodePath: { type: 'string', minLength: 1 },
                        allowedTools: { type: 'array', items: { type: 'string' } },
                        processTimeout: { type: 'number', minimum: 1000 },
                        maxProcesses: { type: 'number', minimum: 1 }
                    },
                    required: ['claudeCodePath']
                }
            }
        };
    }
}

// Create and export default config manager instance
export const configManager = new ConfigManager();

// Export convenience functions
export const getConfig = (path) => configManager.get(path);
export const setConfig = (path, value) => configManager.set(path, value);
export const updateConfig = (updates) => configManager.update(updates);
export const watchConfig = (path, callback) => configManager.watch(path, callback);
export const unwatchConfig = (watcherId) => configManager.unwatch(watcherId);

