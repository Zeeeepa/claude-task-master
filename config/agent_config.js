/**
 * Agent Configuration Management
 * 
 * Centralized configuration for AgentAPI middleware integration.
 * Manages agent-specific settings, connection parameters, and system configuration.
 */

import fs from 'fs';
import path from 'path';

export class AgentConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'agents.json');
    this.config = this._loadDefaultConfig();
    this.watchers = new Map();
    
    // Load configuration from file if it exists
    this._loadConfigFromFile();
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
        if (!agentConfig.enabled && agentConfig.enabled !== false) {
          errors.push(`Agent ${agentType}: enabled flag is required`);
        }
        if (agentConfig.maxSessions && (typeof agentConfig.maxSessions !== 'number' || agentConfig.maxSessions <= 0)) {
          errors.push(`Agent ${agentType}: maxSessions must be a positive number`);
        }
      });
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

  // Private methods

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
          stopSequences: ['\n\n', '```'],
          includeContext: true,
          formatOutput: true
        }
      },
      monitoring: {
        healthCheckInterval: 30000,
        metricsRetentionPeriod: 86400000, // 24 hours
        alertThreshold: 3,
        enableAlerts: true
      }
    };
  }

  _getDefaultAgentConfig() {
    return {
      enabled: true,
      maxSessions: 3,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000
    };
  }

  _loadConfigFromFile() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        const fileConfig = JSON.parse(fileContent);
        
        // Merge with defaults
        this.config = this._mergeConfigs(this.config, fileConfig);
        
        console.log(`📂 Loaded configuration from ${this.configPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load configuration from file: ${error.message}`);
    }
  }

  _saveConfigToFile() {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Save configuration
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log(`💾 Saved configuration to ${this.configPath}`);
    } catch (error) {
      console.error(`❌ Failed to save configuration: ${error.message}`);
    }
  }

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

    // Merge monitoring config
    if (fileConfig.monitoring) {
      merged.monitoring = { ...defaultConfig.monitoring, ...fileConfig.monitoring };
    }

    return merged;
  }

  _notifyWatchers(event, data) {
    this.watchers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('❌ Error in config watcher callback:', error);
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

