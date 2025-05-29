/**
 * AgentAPI Configuration Manager - Consolidated Implementation
 * 
 * Centralized configuration management for all AgentAPI middleware components.
 * Consolidates configuration handling from multiple PRs into a unified system.
 */

import fs from 'fs';
import path from 'path';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'agentapi.json');
    this.logger = new SimpleLogger('AgentConfigManager');
    
    this.config = this._loadDefaultConfig();
    this.watchers = new Map();
    this.initialized = false;
    
    // Load configuration from file if it exists
    this._loadConfigFromFile();
  }

  /**
   * Initialize configuration manager
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing configuration manager...');
    
    try {
      // Validate configuration
      const validation = this.validateConfig();
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Apply environment overrides
      this._applyEnvironmentOverrides();
      
      this.initialized = true;
      this.logger.info('Configuration manager initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize configuration manager:', error);
      throw error;
    }
  }

  /**
   * Get configuration for a specific agent type
   */
  getAgentConfig(agentType) {
    if (!this.config.agents[agentType]) {
      throw new Error(`Configuration not found for agent type: ${agentType}`);
    }

    return {
      ...this.config.global,
      ...this.config.agents[agentType],
      agentType
    };
  }

  /**
   * Get global configuration
   */
  getGlobalConfig() {
    return { ...this.config.global };
  }

  /**
   * Get all agent configurations
   */
  getAllAgentConfigs() {
    const configs = {};
    
    Object.keys(this.config.agents).forEach(agentType => {
      configs[agentType] = this.getAgentConfig(agentType);
    });

    return configs;
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig() {
    const env = process.env.NODE_ENV || 'development';
    
    return {
      ...this.config,
      environment: env,
      agentApiUrl: process.env.AGENTAPI_URL || this.config.global.agentApiUrl,
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      logLevel: process.env.LOG_LEVEL || this.config.global.logLevel
    };
  }

  /**
   * Get middleware configuration
   */
  getMiddlewareConfig() {
    return {
      ...this.config.middleware,
      cors: {
        ...this.config.middleware.cors,
        origin: process.env.CORS_ORIGINS?.split(',') || this.config.middleware.cors.origin
      },
      rateLimit: {
        ...this.config.middleware.rateLimit,
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || this.config.middleware.rateLimit.windowMs,
        max: parseInt(process.env.RATE_LIMIT_MAX) || this.config.middleware.rateLimit.max
      }
    };
  }

  /**
   * Get WSL2 configuration
   */
  getWSL2Config() {
    return {
      ...this.config.wsl2,
      maxInstances: parseInt(process.env.WSL2_MAX_INSTANCES) || this.config.wsl2.maxInstances,
      workspaceRoot: process.env.WSL2_WORKSPACE_ROOT || this.config.wsl2.workspaceRoot,
      distribution: process.env.WSL2_DISTRIBUTION || this.config.wsl2.distribution
    };
  }

  /**
   * Update configuration for a specific agent
   */
  updateAgentConfig(agentType, updates) {
    if (!this.config.agents[agentType]) {
      throw new Error(`Agent type not found: ${agentType}`);
    }

    this.config.agents[agentType] = {
      ...this.config.agents[agentType],
      ...updates
    };

    this._saveConfigToFile();
    this._notifyWatchers('agentConfigUpdated', { agentType, config: this.config.agents[agentType] });
  }

  /**
   * Update global configuration
   */
  updateGlobalConfig(updates) {
    this.config.global = {
      ...this.config.global,
      ...updates
    };

    this._saveConfigToFile();
    this._notifyWatchers('globalConfigUpdated', { config: this.config.global });
  }

  /**
   * Add a new agent configuration
   */
  addAgentConfig(agentType, config) {
    if (this.config.agents[agentType]) {
      throw new Error(`Agent type already exists: ${agentType}`);
    }

    this.config.agents[agentType] = {
      ...this._getDefaultAgentConfig(),
      ...config
    };

    this._saveConfigToFile();
    this._notifyWatchers('agentConfigAdded', { agentType, config: this.config.agents[agentType] });
  }

  /**
   * Remove an agent configuration
   */
  removeAgentConfig(agentType) {
    if (!this.config.agents[agentType]) {
      throw new Error(`Agent type not found: ${agentType}`);
    }

    delete this.config.agents[agentType];
    this._saveConfigToFile();
    this._notifyWatchers('agentConfigRemoved', { agentType });
  }

  /**
   * Validate configuration
   */
  validateConfig(config = null) {
    const configToValidate = config || this.config;
    const errors = [];

    // Validate global config
    if (!configToValidate.global) {
      errors.push('Global configuration is missing');
    } else {
      if (!configToValidate.global.agentApiUrl) {
        errors.push('Global agentApiUrl is required');
      }
      if (typeof configToValidate.global.timeout !== 'number' || configToValidate.global.timeout <= 0) {
        errors.push('Global timeout must be a positive number');
      }
    }

    // Validate agent configs
    if (!configToValidate.agents || typeof configToValidate.agents !== 'object') {
      errors.push('Agents configuration is missing or invalid');
    } else {
      Object.entries(configToValidate.agents).forEach(([agentType, agentConfig]) => {
        if (agentConfig.enabled !== true && agentConfig.enabled !== false) {
          errors.push(`Agent ${agentType}: enabled flag is required`);
        }
        if (agentConfig.maxSessions && (typeof agentConfig.maxSessions !== 'number' || agentConfig.maxSessions <= 0)) {
          errors.push(`Agent ${agentType}: maxSessions must be a positive number`);
        }
      });
    }

    // Validate middleware config
    if (configToValidate.middleware) {
      if (configToValidate.middleware.rateLimit && 
          (!configToValidate.middleware.rateLimit.windowMs || !configToValidate.middleware.rateLimit.max)) {
        errors.push('Rate limit configuration requires windowMs and max values');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Watch for configuration changes
   */
  watchConfig(callback) {
    const watcherId = Date.now().toString() + Math.random().toString(36).substring(2);
    this.watchers.set(watcherId, callback);
    
    return () => {
      this.watchers.delete(watcherId);
    };
  }

  /**
   * Export configuration to JSON
   */
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(jsonConfig) {
    try {
      const importedConfig = JSON.parse(jsonConfig);
      const validation = this.validateConfig(importedConfig);
      
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      this.config = importedConfig;
      this._saveConfigToFile();
      this._notifyWatchers('configImported', { config: this.config });
      
      return true;
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults() {
    this.config = this._loadDefaultConfig();
    this._saveConfigToFile();
    this._notifyWatchers('configReset', { config: this.config });
  }

  /**
   * Get configuration status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      configPath: this.configPath,
      lastModified: this._getFileModificationTime(),
      watchers: this.watchers.size,
      validation: this.validateConfig()
    };
  }

  // Private methods

  /**
   * Load default configuration
   */
  _loadDefaultConfig() {
    return {
      version: '1.0.0',
      global: {
        agentApiUrl: 'http://localhost:3284',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        maxConcurrentSessions: 10,
        enableMetrics: true,
        enableHealthChecks: true,
        logLevel: 'info',
        heartbeatInterval: 30000
      },
      agents: {
        claude: {
          enabled: true,
          maxSessions: 3,
          model: 'claude-3-5-sonnet-20241022',
          allowedTools: ['Bash', 'Edit', 'Replace', 'Create'],
          maxTokens: 4096,
          temperature: 0.1,
          systemPrompt: null,
          autoCommit: false
        },
        goose: {
          enabled: true,
          maxSessions: 3,
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          profile: 'default',
          toolkits: ['developer', 'screen'],
          planMode: 'auto'
        },
        aider: {
          enabled: true,
          maxSessions: 3,
          model: 'claude-3-5-sonnet-20241022',
          editFormat: 'diff',
          autoCommit: true,
          gitRepo: true,
          showDiffs: true,
          mapTokens: 1024,
          cachePrompts: true
        },
        codex: {
          enabled: true,
          maxSessions: 3,
          model: 'gpt-4',
          maxTokens: 2048,
          temperature: 0.1,
          completionMode: 'code',
          language: 'auto',
          stopSequences: ['\\n\\n', '```'],
          includeContext: true,
          formatOutput: true
        }
      },
      middleware: {
        enableAuthentication: true,
        enableAuthorization: true,
        enableRateLimit: true,
        enableCors: true,
        enableCompression: true,
        cors: {
          origin: ['http://localhost:3000', 'http://localhost:3001'],
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization']
        },
        rateLimit: {
          windowMs: 60000, // 1 minute
          max: 100, // requests per window
          message: 'Too many requests, please try again later'
        },
        security: {
          enableHelmet: true,
          enableHsts: true,
          enableXssFilter: true,
          enableNoSniff: true
        }
      },
      wsl2: {
        enabled: true,
        maxInstances: 5,
        instanceTimeout: 3600000, // 1 hour
        workspaceRoot: '/tmp/claude-deployments',
        distribution: 'Ubuntu-22.04',
        resourceLimits: {
          memory: '4GB',
          cpu: 2,
          disk: '20GB'
        },
        networkConfig: {
          isolateNetworking: true,
          allowedPorts: [22, 80, 443, 3000, 8000, 8080, 9000],
          dnsServers: ['8.8.8.8', '1.1.1.1']
        }
      },
      webhooks: {
        enabled: true,
        port: 3002,
        secret: process.env.WEBHOOK_SECRET || '',
        enableSignatureValidation: true,
        endpoints: {
          github: '/webhooks/github',
          linear: '/webhooks/linear'
        }
      },
      monitoring: {
        healthCheckInterval: 30000,
        metricsRetentionPeriod: 86400000, // 24 hours
        alertThreshold: 3,
        enableAlerts: true,
        alertChannels: {
          slack: {
            enabled: false,
            webhookUrl: process.env.SLACK_WEBHOOK_URL || ''
          },
          email: {
            enabled: false,
            recipients: []
          }
        }
      }
    };
  }

  /**
   * Get default agent configuration
   */
  _getDefaultAgentConfig() {
    return {
      enabled: true,
      maxSessions: 3,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000
    };
  }

  /**
   * Load configuration from file
   */
  _loadConfigFromFile() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        const fileConfig = JSON.parse(fileContent);
        
        // Merge with defaults
        this.config = this._mergeConfigs(this.config, fileConfig);
        
        this.logger.info(`Configuration loaded from ${this.configPath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to load configuration from file: ${error.message}`);
    }
  }

  /**
   * Save configuration to file
   */
  _saveConfigToFile() {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Save configuration
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      this.logger.debug(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      this.logger.error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Merge configurations
   */
  _mergeConfigs(defaultConfig, fileConfig) {
    const merged = { ...defaultConfig };

    // Merge global config
    if (fileConfig.global) {
      merged.global = { ...defaultConfig.global, ...fileConfig.global };
    }

    // Merge agent configs
    if (fileConfig.agents) {
      merged.agents = { ...defaultConfig.agents };
      Object.entries(fileConfig.agents).forEach(([agentType, agentConfig]) => {
        if (merged.agents[agentType]) {
          merged.agents[agentType] = { ...merged.agents[agentType], ...agentConfig };
        } else {
          merged.agents[agentType] = { ...this._getDefaultAgentConfig(), ...agentConfig };
        }
      });
    }

    // Merge other sections
    ['middleware', 'wsl2', 'webhooks', 'monitoring'].forEach(section => {
      if (fileConfig[section]) {
        merged[section] = { ...defaultConfig[section], ...fileConfig[section] };
      }
    });

    return merged;
  }

  /**
   * Apply environment variable overrides
   */
  _applyEnvironmentOverrides() {
    // Global overrides
    if (process.env.AGENTAPI_URL) {
      this.config.global.agentApiUrl = process.env.AGENTAPI_URL;
    }
    if (process.env.AGENTAPI_TIMEOUT) {
      this.config.global.timeout = parseInt(process.env.AGENTAPI_TIMEOUT);
    }
    if (process.env.LOG_LEVEL) {
      this.config.global.logLevel = process.env.LOG_LEVEL;
    }

    // WSL2 overrides
    if (process.env.WSL2_MAX_INSTANCES) {
      this.config.wsl2.maxInstances = parseInt(process.env.WSL2_MAX_INSTANCES);
    }
    if (process.env.WSL2_WORKSPACE_ROOT) {
      this.config.wsl2.workspaceRoot = process.env.WSL2_WORKSPACE_ROOT;
    }

    // Webhook overrides
    if (process.env.WEBHOOK_PORT) {
      this.config.webhooks.port = parseInt(process.env.WEBHOOK_PORT);
    }
    if (process.env.WEBHOOK_SECRET) {
      this.config.webhooks.secret = process.env.WEBHOOK_SECRET;
    }
  }

  /**
   * Get file modification time
   */
  _getFileModificationTime() {
    try {
      if (fs.existsSync(this.configPath)) {
        const stats = fs.statSync(this.configPath);
        return stats.mtime;
      }
    } catch (error) {
      this.logger.error('Failed to get file modification time:', error);
    }
    return null;
  }

  /**
   * Notify configuration watchers
   */
  _notifyWatchers(event, data) {
    this.watchers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        this.logger.error('Error in config watcher callback:', error);
      }
    });
  }
}

// Singleton instance
let configManagerInstance = null;

/**
 * Get the singleton configuration manager instance
 */
export function getConfigManager(configPath = null) {
  if (!configManagerInstance) {
    configManagerInstance = new AgentConfigManager(configPath);
  }
  return configManagerInstance;
}

/**
 * Get configuration for a specific agent type
 */
export function getAgentConfig(agentType) {
  return getConfigManager().getAgentConfig(agentType);
}

/**
 * Get global configuration
 */
export function getGlobalConfig() {
  return getConfigManager().getGlobalConfig();
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig() {
  return getConfigManager().getEnvironmentConfig();
}

export default AgentConfigManager;

