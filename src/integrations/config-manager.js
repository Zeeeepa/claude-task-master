/**
 * @fileoverview Configuration Management
 * @description Centralized configuration for all components with hot reloading
 */

import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import { watch } from 'fs';

/**
 * Configuration Manager for centralized configuration management
 */
export class ConfigManager extends EventEmitter {
	constructor(config = {}) {
		super();

		this.config = {
			configDir: process.env.CONFIG_DIR || './config',
			configFile: process.env.CONFIG_FILE || 'system.json',
			watchFiles: true,
			hotReload: true,
			validateConfig: true,
			backupConfig: true,
			encryptSecrets: false,
			...config
		};

		this.configurations = new Map();
		this.watchers = new Map();
		this.schemas = new Map();
		this.isInitialized = false;
		this.configHistory = [];
		this.secretsManager = null;
	}

	/**
	 * Initialize the configuration manager
	 */
	async initialize() {
		if (this.isInitialized) {
			return;
		}

		try {
			console.log('⚙️ Initializing Configuration Manager...');

			// Ensure config directory exists
			await this._ensureConfigDirectory();

			// Load default configuration
			await this._loadDefaultConfiguration();

			// Load all configuration files
			await this._loadAllConfigurations();

			// Start file watching if enabled
			if (this.config.watchFiles) {
				await this._startFileWatching();
			}

			// Initialize secrets manager if encryption is enabled
			if (this.config.encryptSecrets) {
				await this._initializeSecretsManager();
			}

			this.isInitialized = true;
			this.emit('initialized');

			console.log('✅ Configuration Manager initialized successfully');
		} catch (error) {
			console.error('❌ Configuration Manager initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Get configuration value
	 * @param {string} key - Configuration key (supports dot notation)
	 * @param {any} defaultValue - Default value if key not found
	 * @returns {any} Configuration value
	 */
	get(key, defaultValue = undefined) {
		if (!key) {
			return this._getAllConfigurations();
		}

		const keys = key.split('.');
		let value = this.configurations.get('system') || {};

		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = value[k];
			} else {
				return defaultValue;
			}
		}

		return value;
	}

	/**
	 * Set configuration value
	 * @param {string} key - Configuration key (supports dot notation)
	 * @param {any} value - Configuration value
	 * @param {Object} options - Set options
	 */
	async set(key, value, options = {}) {
		const {
			persist = true,
			validate = true,
			notify = true,
			backup = this.config.backupConfig
		} = options;

		if (!key) {
			throw new Error('Configuration key is required');
		}

		try {
			// Backup current configuration if enabled
			if (backup) {
				await this._backupConfiguration();
			}

			// Get current system configuration
			const systemConfig = this.configurations.get('system') || {};

			// Set value using dot notation
			const keys = key.split('.');
			let current = systemConfig;

			for (let i = 0; i < keys.length - 1; i++) {
				const k = keys[i];
				if (!(k in current) || typeof current[k] !== 'object') {
					current[k] = {};
				}
				current = current[k];
			}

			const lastKey = keys[keys.length - 1];
			const oldValue = current[lastKey];
			current[lastKey] = value;

			// Validate configuration if enabled
			if (validate && this.config.validateConfig) {
				await this._validateConfiguration('system', systemConfig);
			}

			// Update in memory
			this.configurations.set('system', systemConfig);

			// Persist to file if enabled
			if (persist) {
				await this._saveConfiguration('system', systemConfig);
			}

			// Notify listeners if enabled
			if (notify) {
				this.emit('config.changed', {
					key,
					value,
					oldValue,
					timestamp: new Date().toISOString()
				});
			}

			// Add to history
			this._addToHistory('set', key, value, oldValue);

			console.log(
				`✅ Configuration updated: ${key} = ${JSON.stringify(value)}`
			);
		} catch (error) {
			console.error(`❌ Failed to set configuration ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Delete configuration value
	 * @param {string} key - Configuration key
	 * @param {Object} options - Delete options
	 */
	async delete(key, options = {}) {
		const {
			persist = true,
			notify = true,
			backup = this.config.backupConfig
		} = options;

		if (!key) {
			throw new Error('Configuration key is required');
		}

		try {
			// Backup current configuration if enabled
			if (backup) {
				await this._backupConfiguration();
			}

			// Get current system configuration
			const systemConfig = this.configurations.get('system') || {};

			// Delete value using dot notation
			const keys = key.split('.');
			let current = systemConfig;

			for (let i = 0; i < keys.length - 1; i++) {
				const k = keys[i];
				if (!(k in current) || typeof current[k] !== 'object') {
					return; // Path doesn't exist
				}
				current = current[k];
			}

			const lastKey = keys[keys.length - 1];
			const oldValue = current[lastKey];
			delete current[lastKey];

			// Update in memory
			this.configurations.set('system', systemConfig);

			// Persist to file if enabled
			if (persist) {
				await this._saveConfiguration('system', systemConfig);
			}

			// Notify listeners if enabled
			if (notify) {
				this.emit('config.deleted', {
					key,
					oldValue,
					timestamp: new Date().toISOString()
				});
			}

			// Add to history
			this._addToHistory('delete', key, undefined, oldValue);

			console.log(`✅ Configuration deleted: ${key}`);
		} catch (error) {
			console.error(`❌ Failed to delete configuration ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Load configuration from file
	 * @param {string} configName - Configuration name
	 * @param {string} filePath - File path
	 */
	async loadConfiguration(configName, filePath) {
		try {
			const fullPath = path.resolve(filePath);
			const content = await fs.readFile(fullPath, 'utf8');

			let config;
			if (fullPath.endsWith('.json')) {
				config = JSON.parse(content);
			} else if (fullPath.endsWith('.js')) {
				// Dynamic import for JS config files
				const module = await import(fullPath);
				config = module.default || module;
			} else {
				throw new Error(`Unsupported configuration file format: ${fullPath}`);
			}

			// Validate configuration if schema exists
			if (this.config.validateConfig && this.schemas.has(configName)) {
				await this._validateConfiguration(configName, config);
			}

			this.configurations.set(configName, config);

			this.emit('config.loaded', {
				configName,
				filePath: fullPath,
				timestamp: new Date().toISOString()
			});

			console.log(`✅ Configuration loaded: ${configName} from ${fullPath}`);
		} catch (error) {
			console.error(`❌ Failed to load configuration ${configName}:`, error);
			throw error;
		}
	}

	/**
	 * Save configuration to file
	 * @param {string} configName - Configuration name
	 * @param {string} filePath - File path (optional)
	 */
	async saveConfiguration(configName, filePath = null) {
		const config = this.configurations.get(configName);
		if (!config) {
			throw new Error(`Configuration ${configName} not found`);
		}

		await this._saveConfiguration(configName, config, filePath);
	}

	/**
	 * Register configuration schema for validation
	 * @param {string} configName - Configuration name
	 * @param {Object} schema - JSON schema
	 */
	registerSchema(configName, schema) {
		this.schemas.set(configName, schema);
		console.log(`✅ Schema registered for configuration: ${configName}`);
	}

	/**
	 * Get configuration history
	 * @param {number} limit - Number of history entries to return
	 * @returns {Array} Configuration history
	 */
	getHistory(limit = 100) {
		return this.configHistory.slice(-limit);
	}

	/**
	 * Reload all configurations
	 */
	async reloadAll() {
		console.log('🔄 Reloading all configurations...');

		try {
			await this._loadAllConfigurations();

			this.emit('config.reloaded', {
				timestamp: new Date().toISOString()
			});

			console.log('✅ All configurations reloaded successfully');
		} catch (error) {
			console.error('❌ Failed to reload configurations:', error);
			throw error;
		}
	}

	/**
	 * Get configuration manager status
	 * @returns {Object} Status information
	 */
	getStatus() {
		return {
			initialized: this.isInitialized,
			configCount: this.configurations.size,
			watchersActive: this.watchers.size,
			hotReloadEnabled: this.config.hotReload,
			configDirectory: this.config.configDir,
			lastChange:
				this.configHistory.length > 0
					? this.configHistory[this.configHistory.length - 1].timestamp
					: null
		};
	}

	/**
	 * Shutdown the configuration manager
	 */
	async shutdown() {
		if (!this.isInitialized) {
			return;
		}

		try {
			console.log('🛑 Shutting down Configuration Manager...');

			// Stop file watchers
			for (const [filePath, watcher] of this.watchers) {
				watcher.close();
				console.log(`📁 Stopped watching: ${filePath}`);
			}
			this.watchers.clear();

			// Clear configurations
			this.configurations.clear();
			this.schemas.clear();
			this.configHistory.length = 0;

			this.isInitialized = false;
			this.emit('shutdown');

			console.log('✅ Configuration Manager shutdown completed');
		} catch (error) {
			console.error('❌ Error during configuration manager shutdown:', error);
			throw error;
		}
	}

	// Private methods

	/**
	 * Ensure config directory exists
	 * @private
	 */
	async _ensureConfigDirectory() {
		try {
			await fs.access(this.config.configDir);
		} catch (error) {
			await fs.mkdir(this.config.configDir, { recursive: true });
			console.log(`📁 Created config directory: ${this.config.configDir}`);
		}
	}

	/**
	 * Load default configuration
	 * @private
	 */
	async _loadDefaultConfiguration() {
		const defaultConfig = {
			system: {
				name: 'AI CI/CD Integration Framework',
				version: '1.0.0',
				environment: process.env.NODE_ENV || 'development',
				logging: {
					level: 'info',
					format: 'json'
				},
				monitoring: {
					enabled: true,
					interval: 30000
				},
				security: {
					encryption: false,
					authentication: false
				}
			}
		};

		this.configurations.set('system', defaultConfig.system);
	}

	/**
	 * Load all configuration files
	 * @private
	 */
	async _loadAllConfigurations() {
		try {
			const configFiles = await fs.readdir(this.config.configDir);

			for (const file of configFiles) {
				if (file.endsWith('.json') || file.endsWith('.js')) {
					const configName = path.basename(file, path.extname(file));
					const filePath = path.join(this.config.configDir, file);

					try {
						await this.loadConfiguration(configName, filePath);
					} catch (error) {
						console.warn(
							`⚠️ Failed to load config file ${file}:`,
							error.message
						);
					}
				}
			}
		} catch (error) {
			// Config directory might not exist or be empty
			console.log('📁 No additional configuration files found');
		}
	}

	/**
	 * Start file watching
	 * @private
	 */
	async _startFileWatching() {
		if (!this.config.hotReload) {
			return;
		}

		try {
			const watcher = watch(
				this.config.configDir,
				{ recursive: true },
				(eventType, filename) => {
					if (
						filename &&
						(filename.endsWith('.json') || filename.endsWith('.js'))
					) {
						this._handleFileChange(eventType, filename);
					}
				}
			);

			this.watchers.set(this.config.configDir, watcher);
			console.log(`👁️ Watching config directory: ${this.config.configDir}`);
		} catch (error) {
			console.warn('⚠️ Failed to start file watching:', error.message);
		}
	}

	/**
	 * Handle file change events
	 * @param {string} eventType - Event type
	 * @param {string} filename - Changed filename
	 * @private
	 */
	async _handleFileChange(eventType, filename) {
		if (!this.config.hotReload) {
			return;
		}

		try {
			const configName = path.basename(filename, path.extname(filename));
			const filePath = path.join(this.config.configDir, filename);

			if (eventType === 'change') {
				console.log(`🔄 Configuration file changed: ${filename}`);

				// Reload configuration
				await this.loadConfiguration(configName, filePath);

				this.emit('config.file.changed', {
					configName,
					filename,
					timestamp: new Date().toISOString()
				});
			}
		} catch (error) {
			console.error(`❌ Error handling file change for ${filename}:`, error);
		}
	}

	/**
	 * Save configuration to file
	 * @param {string} configName - Configuration name
	 * @param {Object} config - Configuration object
	 * @param {string} filePath - File path (optional)
	 * @private
	 */
	async _saveConfiguration(configName, config, filePath = null) {
		try {
			const targetPath =
				filePath || path.join(this.config.configDir, `${configName}.json`);

			const content = JSON.stringify(config, null, 2);
			await fs.writeFile(targetPath, content, 'utf8');

			console.log(`💾 Configuration saved: ${configName} to ${targetPath}`);
		} catch (error) {
			console.error(`❌ Failed to save configuration ${configName}:`, error);
			throw error;
		}
	}

	/**
	 * Validate configuration against schema
	 * @param {string} configName - Configuration name
	 * @param {Object} config - Configuration object
	 * @private
	 */
	async _validateConfiguration(configName, config) {
		const schema = this.schemas.get(configName);
		if (!schema) {
			return; // No schema to validate against
		}

		// Basic validation - in production, use a proper JSON schema validator
		// like ajv or joi
		try {
			this._basicValidation(config, schema);
		} catch (error) {
			throw new Error(
				`Configuration validation failed for ${configName}: ${error.message}`
			);
		}
	}

	/**
	 * Basic configuration validation
	 * @param {Object} config - Configuration object
	 * @param {Object} schema - Schema object
	 * @private
	 */
	_basicValidation(config, schema) {
		// This is a simplified validation
		// In production, use a proper schema validation library
		if (schema.required) {
			for (const field of schema.required) {
				if (!(field in config)) {
					throw new Error(`Required field missing: ${field}`);
				}
			}
		}
	}

	/**
	 * Backup current configuration
	 * @private
	 */
	async _backupConfiguration() {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const backupDir = path.join(this.config.configDir, 'backups');

			await fs.mkdir(backupDir, { recursive: true });

			for (const [configName, config] of this.configurations) {
				const backupFile = path.join(
					backupDir,
					`${configName}-${timestamp}.json`
				);
				const content = JSON.stringify(config, null, 2);
				await fs.writeFile(backupFile, content, 'utf8');
			}
		} catch (error) {
			console.warn('⚠️ Failed to backup configuration:', error.message);
		}
	}

	/**
	 * Initialize secrets manager
	 * @private
	 */
	async _initializeSecretsManager() {
		// TODO: Implement secrets manager for encrypted configuration values
		console.log('🔐 Secrets manager not yet implemented');
	}

	/**
	 * Add entry to configuration history
	 * @param {string} action - Action type
	 * @param {string} key - Configuration key
	 * @param {any} value - New value
	 * @param {any} oldValue - Old value
	 * @private
	 */
	_addToHistory(action, key, value, oldValue) {
		this.configHistory.push({
			action,
			key,
			value,
			oldValue,
			timestamp: new Date().toISOString()
		});

		// Keep only last 1000 entries
		if (this.configHistory.length > 1000) {
			this.configHistory.shift();
		}
	}

	/**
	 * Get all configurations
	 * @returns {Object} All configurations
	 * @private
	 */
	_getAllConfigurations() {
		const result = {};
		for (const [name, config] of this.configurations) {
			result[name] = config;
		}
		return result;
	}
}

export default ConfigManager;
