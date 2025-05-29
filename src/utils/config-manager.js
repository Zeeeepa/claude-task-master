/**
 * Configuration Manager - Centralized configuration management
 * Handles configuration loading, environment variables, validation, and hot reloading
 */

import { readFileSync, writeFileSync, existsSync, watchFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConfigManager extends EventEmitter {
    constructor() {
        super();
        this.config = {};
        this.watchers = new Map();
        this.configPaths = [];
        this.isInitialized = false;
        this.validationRules = new Map();
        this.defaultConfig = this.getDefaultConfiguration();
    }

    /**
     * Initialize the configuration manager
     */
    async initialize() {
        try {
            console.log('Initializing configuration manager...');
            
            // Define configuration file paths
            this.configPaths = [
                join(__dirname, '../../config/database.json'),
                join(__dirname, '../../config/integrations.json'),
                join(__dirname, '../../config/deployment.json'),
                join(__dirname, '../../package.json') // For version and basic info
            ];
            
            // Load configuration from all sources
            await this.loadConfiguration();
            
            // Setup validation rules
            this.setupValidationRules();
            
            // Validate configuration
            this.validateConfiguration();
            
            // Setup hot reloading
            this.setupHotReloading();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('Configuration manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize configuration manager:', error);
            throw error;
        }
    }

    /**
     * Load configuration from all sources
     */
    async loadConfiguration() {
        // Start with default configuration
        this.config = { ...this.defaultConfig };
        
        // Load from environment variables
        this.loadFromEnvironment();
        
        // Load from configuration files
        for (const configPath of this.configPaths) {
            if (existsSync(configPath)) {
                try {
                    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
                    const configKey = this.getConfigKeyFromPath(configPath);
                    
                    if (configKey) {
                        this.config[configKey] = { ...this.config[configKey], ...configData };
                    } else {
                        // Merge directly for package.json and other root configs
                        this.config = { ...this.config, ...configData };
                    }
                    
                    console.log(`Loaded configuration from: ${configPath}`);
                } catch (error) {
                    console.warn(`Failed to load configuration from ${configPath}:`, error.message);
                }
            }
        }
        
        // Load from .env file if present
        this.loadFromDotEnv();
    }

    /**
     * Load configuration from environment variables
     */
    loadFromEnvironment() {
        const envConfig = {
            codegen: {
                token: process.env.CODEGEN_TOKEN,
                orgId: process.env.CODEGEN_ORG_ID,
                apiBaseUrl: process.env.CODEGEN_API_URL
            },
            claude: {
                codePath: process.env.CLAUDE_CODE_PATH
            },
            database: {
                url: process.env.DATABASE_URL,
                type: process.env.DATABASE_TYPE
            },
            linear: {
                apiKey: process.env.LINEAR_API_KEY
            },
            github: {
                token: process.env.GITHUB_TOKEN
            },
            wsl2: {
                host: process.env.WSL2_HOST
            },
            agentapi: {
                port: process.env.AGENTAPI_PORT ? parseInt(process.env.AGENTAPI_PORT) : undefined,
                host: process.env.AGENTAPI_HOST
            },
            system: {
                logLevel: process.env.LOG_LEVEL,
                nodeEnv: process.env.NODE_ENV
            }
        };
        
        // Remove undefined values and merge
        this.config = this.deepMerge(this.config, this.removeUndefined(envConfig));
    }

    /**
     * Load configuration from .env file
     */
    loadFromDotEnv() {
        const envPath = join(__dirname, '../../.env');
        
        if (existsSync(envPath)) {
            try {
                const envContent = readFileSync(envPath, 'utf8');
                const envVars = {};
                
                envContent.split('\n').forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith('#')) {
                        const [key, ...valueParts] = trimmedLine.split('=');
                        if (key && valueParts.length > 0) {
                            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                            envVars[key.trim()] = value;
                        }
                    }
                });
                
                // Apply environment variables
                Object.assign(process.env, envVars);
                
                // Reload from environment to pick up .env values
                this.loadFromEnvironment();
                
                console.log('Loaded configuration from .env file');
            } catch (error) {
                console.warn('Failed to load .env file:', error.message);
            }
        }
    }

    /**
     * Get default configuration
     */
    getDefaultConfiguration() {
        return {
            system: {
                logLevel: 'info',
                nodeEnv: 'development',
                healthCheckInterval: 30000,
                staleThreshold: 300000
            },
            agentapi: {
                port: 3001,
                host: 'localhost',
                allowedOrigins: ['http://localhost:3000'],
                processInterval: 1000
            },
            coordination: {
                processInterval: 5000,
                maxConcurrentTasks: 10
            },
            eventDispatcher: {
                batchSize: 10,
                processInterval: 1000,
                maxQueueSize: 10000,
                maxHistorySize: 1000
            },
            messageHandler: {
                processInterval: 1000,
                maxHistorySize: 1000,
                timeout: 30000
            },
            session: {
                timeout: 3600000, // 1 hour
                cleanupInterval: 300000, // 5 minutes
                staleThreshold: 1800000 // 30 minutes
            },
            workflow: {
                monitorInterval: 10000,
                defaultTimeout: 300000 // 5 minutes
            },
            database: {
                type: 'sqlite',
                filename: 'taskmaster.db',
                connectionTimeout: 10000,
                maxConnections: 10
            },
            codegen: {
                apiBaseUrl: 'https://api.codegen.sh',
                sdkVersion: 'latest',
                requestTimeout: 30000,
                retryAttempts: 3,
                rateLimitDelay: 1000
            },
            claude: {
                codePath: '/usr/local/bin/claude-code',
                workingDirectory: process.cwd(),
                timeout: 30000
            },
            git: {
                user: {
                    name: 'TaskMaster AI',
                    email: 'taskmaster@ai.local'
                }
            },
            logging: {
                level: 'info',
                format: 'json',
                maxFiles: 5,
                maxSize: '10m',
                datePattern: 'YYYY-MM-DD'
            }
        };
    }

    /**
     * Setup validation rules
     */
    setupValidationRules() {
        // System validation rules
        this.addValidationRule('system.logLevel', (value) => {
            const validLevels = ['error', 'warn', 'info', 'debug'];
            return validLevels.includes(value);
        }, 'Log level must be one of: error, warn, info, debug');

        this.addValidationRule('agentapi.port', (value) => {
            return Number.isInteger(value) && value > 0 && value < 65536;
        }, 'AgentAPI port must be a valid port number (1-65535)');

        this.addValidationRule('database.type', (value) => {
            const validTypes = ['sqlite', 'postgresql', 'mysql'];
            return validTypes.includes(value);
        }, 'Database type must be one of: sqlite, postgresql, mysql');

        this.addValidationRule('codegen.token', (value) => {
            return typeof value === 'string' && value.length > 0;
        }, 'Codegen token is required and must be a non-empty string');

        this.addValidationRule('codegen.orgId', (value) => {
            return typeof value === 'string' && value.length > 0;
        }, 'Codegen organization ID is required and must be a non-empty string');
    }

    /**
     * Add validation rule
     */
    addValidationRule(path, validator, message) {
        this.validationRules.set(path, { validator, message });
    }

    /**
     * Validate configuration
     */
    validateConfiguration() {
        const errors = [];
        
        for (const [path, rule] of this.validationRules) {
            const value = this.get(path);
            
            if (value !== undefined && value !== null) {
                try {
                    if (!rule.validator(value)) {
                        errors.push(`${path}: ${rule.message}`);
                    }
                } catch (error) {
                    errors.push(`${path}: Validation error - ${error.message}`);
                }
            }
        }
        
        if (errors.length > 0) {
            console.warn('Configuration validation warnings:', errors);
        }
    }

    /**
     * Get configuration value
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    /**
     * Set configuration value
     */
    set(path, value) {
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
        const oldValue = current[lastKey];
        current[lastKey] = value;
        
        // Validate the new value
        const rule = this.validationRules.get(path);
        if (rule) {
            try {
                if (!rule.validator(value)) {
                    current[lastKey] = oldValue; // Restore old value
                    throw new Error(rule.message);
                }
            } catch (error) {
                current[lastKey] = oldValue; // Restore old value
                throw error;
            }
        }
        
        this.emit('configChanged', { path, oldValue, newValue: value });
    }

    /**
     * Update configuration from object
     */
    update(updates) {
        const oldConfig = { ...this.config };
        this.config = this.deepMerge(this.config, updates);
        
        // Validate updated configuration
        this.validateConfiguration();
        
        this.emit('configUpdated', { oldConfig, newConfig: this.config });
    }

    /**
     * Save configuration to file
     */
    async saveConfiguration(configType = 'all') {
        try {
            if (configType === 'all' || configType === 'database') {
                const dbConfigPath = join(__dirname, '../../config/database.json');
                this.ensureDirectoryExists(dirname(dbConfigPath));
                writeFileSync(dbConfigPath, JSON.stringify(this.config.database || {}, null, 2));
            }
            
            if (configType === 'all' || configType === 'integrations') {
                const integrationsConfigPath = join(__dirname, '../../config/integrations.json');
                this.ensureDirectoryExists(dirname(integrationsConfigPath));
                const integrationsConfig = {
                    codegen: this.config.codegen || {},
                    claude: this.config.claude || {},
                    linear: this.config.linear || {},
                    github: this.config.github || {}
                };
                writeFileSync(integrationsConfigPath, JSON.stringify(integrationsConfig, null, 2));
            }
            
            if (configType === 'all' || configType === 'deployment') {
                const deploymentConfigPath = join(__dirname, '../../config/deployment.json');
                this.ensureDirectoryExists(dirname(deploymentConfigPath));
                const deploymentConfig = {
                    wsl2: this.config.wsl2 || {},
                    agentapi: this.config.agentapi || {},
                    system: this.config.system || {}
                };
                writeFileSync(deploymentConfigPath, JSON.stringify(deploymentConfig, null, 2));
            }
            
            console.log(`Configuration saved: ${configType}`);
        } catch (error) {
            console.error(`Failed to save configuration (${configType}):`, error);
            throw error;
        }
    }

    /**
     * Setup hot reloading
     */
    setupHotReloading() {
        for (const configPath of this.configPaths) {
            if (existsSync(configPath)) {
                watchFile(configPath, { interval: 1000 }, () => {
                    console.log(`Configuration file changed: ${configPath}`);
                    this.reloadConfiguration();
                });
                
                this.watchers.set(configPath, true);
            }
        }
    }

    /**
     * Reload configuration
     */
    async reloadConfiguration() {
        try {
            const oldConfig = { ...this.config };
            await this.loadConfiguration();
            this.validateConfiguration();
            
            this.emit('configReloaded', { oldConfig, newConfig: this.config });
            console.log('Configuration reloaded successfully');
        } catch (error) {
            console.error('Failed to reload configuration:', error);
            this.emit('configReloadError', error);
        }
    }

    /**
     * Get configuration key from file path
     */
    getConfigKeyFromPath(configPath) {
        if (configPath.includes('database.json')) return 'database';
        if (configPath.includes('integrations.json')) return 'integrations';
        if (configPath.includes('deployment.json')) return 'deployment';
        return null;
    }

    /**
     * Deep merge objects
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

    /**
     * Remove undefined values from object
     */
    removeUndefined(obj) {
        const result = {};
        
        for (const key in obj) {
            if (obj[key] !== undefined) {
                if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    const nested = this.removeUndefined(obj[key]);
                    if (Object.keys(nested).length > 0) {
                        result[key] = nested;
                    }
                } else {
                    result[key] = obj[key];
                }
            }
        }
        
        return result;
    }

    /**
     * Ensure directory exists
     */
    ensureDirectoryExists(dirPath) {
        try {
            const fs = require('fs');
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        } catch (error) {
            console.warn(`Failed to create directory ${dirPath}:`, error.message);
        }
    }

    /**
     * Get all configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Get configuration schema
     */
    getSchema() {
        const schema = {};
        
        for (const [path, rule] of this.validationRules) {
            schema[path] = {
                message: rule.message,
                currentValue: this.get(path)
            };
        }
        
        return schema;
    }

    /**
     * Reset to default configuration
     */
    resetToDefaults() {
        const oldConfig = { ...this.config };
        this.config = { ...this.defaultConfig };
        
        this.emit('configReset', { oldConfig, newConfig: this.config });
        console.log('Configuration reset to defaults');
    }

    /**
     * Stop configuration manager
     */
    stop() {
        // Stop watching files
        for (const configPath of this.watchers.keys()) {
            try {
                const fs = require('fs');
                fs.unwatchFile(configPath);
            } catch (error) {
                console.warn(`Failed to stop watching ${configPath}:`, error.message);
            }
        }
        
        this.watchers.clear();
        this.isInitialized = false;
        
        console.log('Configuration manager stopped');
    }
}

export const configManager = new ConfigManager();
export default ConfigManager;

