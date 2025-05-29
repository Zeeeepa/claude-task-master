/**
 * Configuration Manager
 * Centralized configuration management for Task Master orchestrator
 * 
 * Handles loading, validation, and management of configuration files
 * with support for environment variables and schema validation.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ConfigManager class for centralized configuration management
 */
export class ConfigManager {
    constructor(options = {}) {
        this.options = {
            configDir: resolve(__dirname, '../../config'),
            envPrefix: 'TASKMASTER_',
            validateSchemas: true,
            ...options
        };
        this.configs = new Map();
        this.watchers = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the configuration manager
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            logger.info('Initializing configuration manager...');
            
            // Load all configuration files
            await this._loadConfigurations();
            
            // Apply environment variable overrides
            this._applyEnvironmentOverrides();
            
            // Validate configurations if enabled
            if (this.options.validateSchemas) {
                this._validateConfigurations();
            }
            
            this.isInitialized = true;
            logger.info('Configuration manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize configuration manager:', error);
            throw error;
        }
    }

    /**
     * Get configuration by name
     * @param {string} configName - Name of the configuration
     * @param {string} [path] - Optional path within the configuration (dot notation)
     * @returns {*} Configuration value
     */
    get(configName, path = null) {
        if (!this.isInitialized) {
            throw new Error('ConfigManager not initialized. Call initialize() first.');
        }

        const config = this.configs.get(configName);
        if (!config) {
            throw new Error(`Configuration '${configName}' not found`);
        }

        if (!path) {
            return config;
        }

        return this._getNestedValue(config, path);
    }

    /**
     * Set configuration value
     * @param {string} configName - Name of the configuration
     * @param {string} path - Path within the configuration (dot notation)
     * @param {*} value - Value to set
     */
    set(configName, path, value) {
        if (!this.isInitialized) {
            throw new Error('ConfigManager not initialized. Call initialize() first.');
        }

        let config = this.configs.get(configName);
        if (!config) {
            config = {};
            this.configs.set(configName, config);
        }

        this._setNestedValue(config, path, value);
        logger.debug(`Configuration updated: ${configName}.${path}`);
    }

    /**
     * Check if configuration exists
     * @param {string} configName - Name of the configuration
     * @returns {boolean} True if configuration exists
     */
    has(configName) {
        return this.configs.has(configName);
    }

    /**
     * Get all configuration names
     * @returns {Array<string>} Array of configuration names
     */
    getConfigNames() {
        return Array.from(this.configs.keys());
    }

    /**
     * Get database configuration
     * @returns {Object} Database configuration
     */
    getDatabaseConfig() {
        return this.get('database');
    }

    /**
     * Get integrations configuration
     * @returns {Object} Integrations configuration
     */
    getIntegrationsConfig() {
        return this.get('integrations');
    }

    /**
     * Get deployment configuration
     * @returns {Object} Deployment configuration
     */
    getDeploymentConfig() {
        return this.get('deployment');
    }

    /**
     * Get configuration for a specific integration
     * @param {string} integrationName - Name of the integration
     * @returns {Object} Integration configuration
     */
    getIntegrationConfig(integrationName) {
        return this.get('integrations', integrationName);
    }

    /**
     * Check if an integration is enabled
     * @param {string} integrationName - Name of the integration
     * @returns {boolean} True if integration is enabled
     */
    isIntegrationEnabled(integrationName) {
        try {
            return this.get('integrations', `${integrationName}.enabled`) === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get environment-specific configuration
     * @returns {string} Current environment
     */
    getEnvironment() {
        return process.env.NODE_ENV || this.get('deployment', 'environment') || 'development';
    }

    /**
     * Reload configurations from files
     * @returns {Promise<void>}
     */
    async reload() {
        logger.info('Reloading configurations...');
        this.configs.clear();
        await this._loadConfigurations();
        this._applyEnvironmentOverrides();
        
        if (this.options.validateSchemas) {
            this._validateConfigurations();
        }
        
        logger.info('Configurations reloaded successfully');
    }

    /**
     * Load all configuration files
     * @private
     */
    async _loadConfigurations() {
        const configFiles = [
            'database.json',
            'integrations.json',
            'deployment.json'
        ];

        for (const filename of configFiles) {
            const configPath = resolve(this.options.configDir, filename);
            const configName = filename.replace('.json', '');

            if (existsSync(configPath)) {
                try {
                    const configContent = readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configContent);
                    this.configs.set(configName, config);
                    logger.debug(`Loaded configuration: ${configName}`);
                } catch (error) {
                    logger.error(`Failed to load configuration ${configName}:`, error);
                    throw error;
                }
            } else {
                logger.warn(`Configuration file not found: ${configPath}`);
            }
        }
    }

    /**
     * Apply environment variable overrides
     * @private
     */
    _applyEnvironmentOverrides() {
        const envVars = Object.keys(process.env)
            .filter(key => key.startsWith(this.options.envPrefix))
            .map(key => ({
                key,
                value: process.env[key],
                configPath: key.substring(this.options.envPrefix.length).toLowerCase()
            }));

        for (const envVar of envVars) {
            try {
                const pathParts = envVar.configPath.split('_');
                if (pathParts.length >= 2) {
                    const configName = pathParts[0];
                    const configPath = pathParts.slice(1).join('.');
                    
                    // Parse value (try JSON first, then string)
                    let value = envVar.value;
                    try {
                        value = JSON.parse(envVar.value);
                    } catch {
                        // Keep as string if not valid JSON
                    }
                    
                    this.set(configName, configPath, value);
                    logger.debug(`Applied environment override: ${envVar.key}`);
                }
            } catch (error) {
                logger.warn(`Failed to apply environment override ${envVar.key}:`, error);
            }
        }
    }

    /**
     * Validate configurations against schemas
     * @private
     */
    _validateConfigurations() {
        logger.debug('Validating configurations...');
        
        // Basic validation - in a real implementation, you would use a JSON schema validator
        for (const [configName, config] of this.configs) {
            try {
                this._validateConfig(configName, config);
                logger.debug(`Configuration validation passed: ${configName}`);
            } catch (error) {
                logger.error(`Configuration validation failed for ${configName}:`, error);
                throw error;
            }
        }
    }

    /**
     * Validate a specific configuration
     * @param {string} configName - Name of the configuration
     * @param {Object} config - Configuration object
     * @private
     */
    _validateConfig(configName, config) {
        switch (configName) {
            case 'database':
                this._validateDatabaseConfig(config);
                break;
            case 'integrations':
                this._validateIntegrationsConfig(config);
                break;
            case 'deployment':
                this._validateDeploymentConfig(config);
                break;
            default:
                logger.debug(`No validation rules for configuration: ${configName}`);
        }
    }

    /**
     * Validate database configuration
     * @param {Object} config - Database configuration
     * @private
     */
    _validateDatabaseConfig(config) {
        if (!config.connection) {
            throw new Error('Database configuration must have connection object');
        }
        
        const required = ['type', 'host', 'database'];
        for (const field of required) {
            if (!config.connection[field]) {
                throw new Error(`Database connection missing required field: ${field}`);
            }
        }
    }

    /**
     * Validate integrations configuration
     * @param {Object} config - Integrations configuration
     * @private
     */
    _validateIntegrationsConfig(config) {
        // Validate each integration
        for (const [integrationName, integrationConfig] of Object.entries(config)) {
            if (integrationConfig.enabled && !integrationConfig.apiKey && !integrationConfig.token) {
                logger.warn(`Integration ${integrationName} is enabled but missing authentication credentials`);
            }
        }
    }

    /**
     * Validate deployment configuration
     * @param {Object} config - Deployment configuration
     * @private
     */
    _validateDeploymentConfig(config) {
        if (!config.environment) {
            throw new Error('Deployment configuration must specify environment');
        }
        
        const validEnvironments = ['development', 'staging', 'production'];
        if (!validEnvironments.includes(config.environment)) {
            throw new Error(`Invalid environment: ${config.environment}. Must be one of: ${validEnvironments.join(', ')}`);
        }
    }

    /**
     * Get nested value from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Dot notation path
     * @returns {*} Value at path
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            if (current && typeof current === 'object' && key in current) {
                return current[key];
            }
            throw new Error(`Configuration path not found: ${path}`);
        }, obj);
    }

    /**
     * Set nested value in object using dot notation
     * @param {Object} obj - Object to modify
     * @param {string} path - Dot notation path
     * @param {*} value - Value to set
     * @private
     */
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        const target = keys.reduce((current, key) => {
            if (!(key in current)) {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
    }
}

// Create and export singleton instance
export const configManager = new ConfigManager();

// Export class for testing and custom instances
export default ConfigManager;

