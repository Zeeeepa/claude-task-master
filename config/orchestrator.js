/**
 * @fileoverview Unified Configuration System for Task Master Orchestrator
 * @description Central configuration hub for the Task Master orchestrator system
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    // Core Orchestrator Settings
    orchestrator: {
        name: 'TaskMasterOrchestrator',
        version: '1.2.0',
        environment: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
        maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 10,
        taskTimeout: parseInt(process.env.TASK_TIMEOUT) || 300000, // 5 minutes
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
        eventBusEnabled: process.env.EVENT_BUS_ENABLED !== 'false',
    },

    // Task Management Configuration
    taskManager: {
        preserveLegacyFunctionality: true,
        enableEventLogging: true,
        backwardCompatibility: true,
        autoSaveInterval: parseInt(process.env.AUTO_SAVE_INTERVAL) || 60000, // 1 minute
        maxTaskHistory: parseInt(process.env.MAX_TASK_HISTORY) || 1000,
        enableTaskValidation: true,
        enableDependencyTracking: true,
    },

    // Event System Configuration
    events: {
        enabled: true,
        maxListeners: parseInt(process.env.MAX_EVENT_LISTENERS) || 100,
        eventTimeout: parseInt(process.env.EVENT_TIMEOUT) || 10000, // 10 seconds
        enableEventPersistence: process.env.ENABLE_EVENT_PERSISTENCE !== 'false',
        eventRetryAttempts: parseInt(process.env.EVENT_RETRY_ATTEMPTS) || 3,
        eventRetryDelay: parseInt(process.env.EVENT_RETRY_DELAY) || 1000, // 1 second
    },

    // Health Check Configuration
    healthChecks: {
        enabled: true,
        endpoints: {
            orchestrator: '/health/orchestrator',
            taskManager: '/health/task-manager',
            eventBus: '/health/events',
            integrations: '/health/integrations',
        },
        timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
        retryAttempts: parseInt(process.env.HEALTH_RETRY_ATTEMPTS) || 2,
        alertThreshold: parseInt(process.env.HEALTH_ALERT_THRESHOLD) || 3, // failures before alert
    },

    // Integration Configuration
    integrations: {
        aiCicdSystem: {
            enabled: true,
            path: './src/ai_cicd_system',
            autoStart: true,
            healthCheckEnabled: true,
        },
        codegenSDK: {
            enabled: process.env.CODEGEN_ENABLED !== 'false',
            apiKey: process.env.CODEGEN_API_KEY,
            orgId: process.env.CODEGEN_ORG_ID,
            baseUrl: process.env.CODEGEN_BASE_URL || 'https://api.codegen.sh',
            timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 30000,
        },
        agentAPI: {
            enabled: process.env.AGENT_API_ENABLED !== 'false',
            baseUrl: process.env.AGENT_API_BASE_URL || 'http://localhost:8000',
            apiKey: process.env.AGENT_API_KEY,
            timeout: parseInt(process.env.AGENT_API_TIMEOUT) || 30000,
        },
        linear: {
            enabled: process.env.LINEAR_ENABLED !== 'false',
            apiKey: process.env.LINEAR_API_KEY,
            teamId: process.env.LINEAR_TEAM_ID,
            baseUrl: process.env.LINEAR_BASE_URL || 'https://api.linear.app',
        },
    },

    // Database Configuration
    database: {
        enabled: process.env.DATABASE_ENABLED !== 'false',
        type: process.env.DATABASE_TYPE || 'postgresql',
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT) || 5432,
        database: process.env.DATABASE_NAME || 'taskmaster',
        username: process.env.DATABASE_USERNAME || 'taskmaster',
        password: process.env.DATABASE_PASSWORD,
        ssl: process.env.DATABASE_SSL === 'true',
        poolSize: parseInt(process.env.DATABASE_POOL_SIZE) || 10,
        connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT) || 10000,
    },

    // Monitoring and Metrics
    monitoring: {
        enabled: process.env.MONITORING_ENABLED !== 'false',
        metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000, // 1 minute
        enablePerformanceTracking: true,
        enableErrorTracking: true,
        enableResourceMonitoring: true,
        alertingEnabled: process.env.ALERTING_ENABLED !== 'false',
    },

    // Security Configuration
    security: {
        enableApiKeyValidation: true,
        enableRateLimiting: true,
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        enableCors: process.env.ENABLE_CORS !== 'false',
        corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    },
};

/**
 * Configuration Manager Class
 */
export class ConfigurationManager {
    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.configPath = null;
        this.watchers = new Map();
        this.loaded = false;
    }

    /**
     * Load configuration from file and environment variables
     * @param {string} configPath - Path to configuration file
     * @returns {Promise<Object>} Loaded configuration
     */
    async load(configPath = null) {
        try {
            // Try to load from file if provided or find default config file
            if (configPath || this.findConfigFile()) {
                const filePath = configPath || this.findConfigFile();
                await this.loadFromFile(filePath);
            }

            // Override with environment variables
            this.loadFromEnvironment();

            // Validate configuration
            this.validate();

            this.loaded = true;
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    /**
     * Find configuration file in standard locations
     * @returns {string|null} Path to configuration file
     */
    findConfigFile() {
        const possiblePaths = [
            join(process.cwd(), 'config', 'orchestrator.json'),
            join(process.cwd(), 'config', 'orchestrator.js'),
            join(process.cwd(), '.taskmasterconfig'),
            join(__dirname, 'orchestrator.json'),
        ];

        for (const path of possiblePaths) {
            if (existsSync(path)) {
                return path;
            }
        }

        return null;
    }

    /**
     * Load configuration from file
     * @param {string} filePath - Path to configuration file
     */
    async loadFromFile(filePath) {
        try {
            this.configPath = filePath;
            
            if (filePath.endsWith('.json')) {
                const content = readFileSync(filePath, 'utf8');
                const fileConfig = JSON.parse(content);
                this.mergeConfig(fileConfig);
            } else if (filePath.endsWith('.js')) {
                const module = await import(filePath);
                const fileConfig = module.default || module;
                this.mergeConfig(fileConfig);
            }
        } catch (error) {
            throw new Error(`Failed to load config file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Load configuration from environment variables
     */
    loadFromEnvironment() {
        // Environment variables are already loaded in DEFAULT_CONFIG
        // This method can be extended for additional env var processing
    }

    /**
     * Merge configuration objects
     * @param {Object} newConfig - Configuration to merge
     */
    mergeConfig(newConfig) {
        this.config = this.deepMerge(this.config, newConfig);
    }

    /**
     * Deep merge two objects
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

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        // Validate required fields
        if (this.config.integrations.codegenSDK.enabled && !this.config.integrations.codegenSDK.apiKey) {
            errors.push('Codegen SDK API key is required when Codegen integration is enabled');
        }

        if (this.config.integrations.linear.enabled && !this.config.integrations.linear.apiKey) {
            errors.push('Linear API key is required when Linear integration is enabled');
        }

        if (this.config.database.enabled && !this.config.database.password) {
            errors.push('Database password is required when database is enabled');
        }

        // Validate numeric values
        if (this.config.orchestrator.maxConcurrentTasks < 1) {
            errors.push('Max concurrent tasks must be at least 1');
        }

        if (this.config.orchestrator.taskTimeout < 1000) {
            errors.push('Task timeout must be at least 1000ms');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Get configuration value by path
     * @param {string} path - Dot-separated path to configuration value
     * @param {*} defaultValue - Default value if path not found
     * @returns {*} Configuration value
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
     * Set configuration value by path
     * @param {string} path - Dot-separated path to configuration value
     * @param {*} value - Value to set
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

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Check if configuration is loaded
     * @returns {boolean} True if configuration is loaded
     */
    isLoaded() {
        return this.loaded;
    }

    /**
     * Reload configuration
     * @returns {Promise<Object>} Reloaded configuration
     */
    async reload() {
        this.loaded = false;
        return await this.load(this.configPath);
    }
}

// Global configuration manager instance
export const configManager = new ConfigurationManager();

/**
 * Initialize configuration system
 * @param {string} configPath - Optional path to configuration file
 * @returns {Promise<Object>} Loaded configuration
 */
export async function initializeConfig(configPath = null) {
    return await configManager.load(configPath);
}

/**
 * Get configuration value
 * @param {string} path - Dot-separated path to configuration value
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} Configuration value
 */
export function getConfig(path, defaultValue = undefined) {
    return configManager.get(path, defaultValue);
}

/**
 * Set configuration value
 * @param {string} path - Dot-separated path to configuration value
 * @param {*} value - Value to set
 */
export function setConfig(path, value) {
    configManager.set(path, value);
}

/**
 * Get all configuration
 * @returns {Object} Complete configuration object
 */
export function getAllConfig() {
    return configManager.getAll();
}

export default configManager;

