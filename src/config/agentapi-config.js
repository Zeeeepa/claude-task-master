/**
 * AgentAPI Configuration
 * 
 * Configuration management for AgentAPI middleware integration with environment
 * variable support and validation.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class AgentAPIConfig {
  constructor(customConfig = {}) {
    this.config = this._mergeConfigs(this._getDefaultConfig(), customConfig);
    this._validateConfig();
  }

  /**
   * Get default configuration
   * @returns {Object} Default configuration
   */
  _getDefaultConfig() {
    return {
      // AgentAPI Server Configuration
      agentapi: {
        baseUrl: process.env.AGENTAPI_URL || 'http://localhost:3284',
        timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
        retryAttempts: parseInt(process.env.AGENTAPI_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.AGENTAPI_RETRY_DELAY) || 1000,
        healthCheckInterval: parseInt(process.env.AGENTAPI_HEALTH_CHECK_INTERVAL) || 30000,
        reconnectDelay: parseInt(process.env.AGENTAPI_RECONNECT_DELAY) || 5000,
        maxReconnectAttempts: parseInt(process.env.AGENTAPI_MAX_RECONNECT_ATTEMPTS) || 10,
        enableEventStream: process.env.AGENTAPI_ENABLE_EVENT_STREAM !== 'false'
      },

      // Claude Code Configuration
      claudeCode: {
        maxInstances: parseInt(process.env.CLAUDE_CODE_MAX_INSTANCES) || 5,
        instanceTimeout: parseInt(process.env.CLAUDE_CODE_INSTANCE_TIMEOUT) || 300000,
        healthCheckInterval: parseInt(process.env.CLAUDE_CODE_HEALTH_CHECK_INTERVAL) || 30000,
        defaultTools: (process.env.CLAUDE_CODE_DEFAULT_TOOLS || 'Bash(git*),Edit,Replace').split(','),
        workingDirectory: process.env.CLAUDE_CODE_WORKING_DIRECTORY || process.cwd(),
        autoStart: process.env.CLAUDE_CODE_AUTO_START === 'true',
        autoRestart: process.env.CLAUDE_CODE_AUTO_RESTART === 'true'
      },

      // Task Queue Configuration
      taskQueue: {
        maxConcurrentTasks: parseInt(process.env.TASK_QUEUE_MAX_CONCURRENT) || 3,
        defaultPriority: parseInt(process.env.TASK_QUEUE_DEFAULT_PRIORITY) || 5,
        taskTimeout: parseInt(process.env.TASK_QUEUE_TASK_TIMEOUT) || 300000,
        retryAttempts: parseInt(process.env.TASK_QUEUE_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.TASK_QUEUE_RETRY_DELAY) || 5000,
        queueProcessInterval: parseInt(process.env.TASK_QUEUE_PROCESS_INTERVAL) || 1000,
        maxQueueSize: parseInt(process.env.TASK_QUEUE_MAX_SIZE) || 1000,
        enablePersistence: process.env.TASK_QUEUE_ENABLE_PERSISTENCE === 'true'
      },

      // Event Processor Configuration
      eventProcessor: {
        reconnectDelay: parseInt(process.env.EVENT_PROCESSOR_RECONNECT_DELAY) || 5000,
        maxReconnectAttempts: parseInt(process.env.EVENT_PROCESSOR_MAX_RECONNECT_ATTEMPTS) || 10,
        heartbeatInterval: parseInt(process.env.EVENT_PROCESSOR_HEARTBEAT_INTERVAL) || 30000,
        eventBufferSize: parseInt(process.env.EVENT_PROCESSOR_BUFFER_SIZE) || 1000,
        enableEventPersistence: process.env.EVENT_PROCESSOR_ENABLE_PERSISTENCE === 'true',
        eventFilters: this._parseEventFilters(process.env.EVENT_PROCESSOR_FILTERS)
      },

      // Database Configuration (for persistence)
      database: {
        enabled: process.env.DATABASE_ENABLED === 'true',
        url: process.env.DATABASE_URL,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || 'claude_task_master',
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true',
        poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000
      },

      // Logging Configuration
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        logDirectory: process.env.LOG_DIRECTORY || './logs',
        maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 10,
        maxLogSize: process.env.MAX_LOG_SIZE || '10MB',
        enableStructuredLogging: process.env.ENABLE_STRUCTURED_LOGGING === 'true'
      },

      // Monitoring Configuration
      monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
        healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT) || 8080,
        enablePrometheus: process.env.ENABLE_PROMETHEUS === 'true',
        enableTracing: process.env.ENABLE_TRACING === 'true',
        tracingEndpoint: process.env.TRACING_ENDPOINT
      },

      // Security Configuration
      security: {
        enableAuth: process.env.ENABLE_AUTH === 'true',
        apiKey: process.env.API_KEY,
        jwtSecret: process.env.JWT_SECRET,
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
        enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
      },

      // Integration Configuration
      integrations: {
        linear: {
          enabled: process.env.LINEAR_ENABLED === 'true',
          apiKey: process.env.LINEAR_API_KEY,
          webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
          teamId: process.env.LINEAR_TEAM_ID
        },
        github: {
          enabled: process.env.GITHUB_ENABLED === 'true',
          token: process.env.GITHUB_TOKEN,
          webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
          repository: process.env.GITHUB_REPOSITORY
        },
        slack: {
          enabled: process.env.SLACK_ENABLED === 'true',
          botToken: process.env.SLACK_BOT_TOKEN,
          signingSecret: process.env.SLACK_SIGNING_SECRET,
          channel: process.env.SLACK_CHANNEL
        }
      },

      // Performance Configuration
      performance: {
        enableCaching: process.env.ENABLE_CACHING === 'true',
        cacheSize: parseInt(process.env.CACHE_SIZE) || 1000,
        cacheTTL: parseInt(process.env.CACHE_TTL) || 3600000,
        enableCompression: process.env.ENABLE_COMPRESSION === 'true',
        maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10MB'
      }
    };
  }

  /**
   * Parse event filters from environment variable
   * @param {string} filtersString - Comma-separated event filters
   * @returns {Array} Array of event filters
   */
  _parseEventFilters(filtersString) {
    if (!filtersString) return [];
    
    return filtersString.split(',').map(filter => filter.trim()).filter(Boolean);
  }

  /**
   * Merge configurations with precedence
   * @param {Object} defaultConfig - Default configuration
   * @param {Object} customConfig - Custom configuration
   * @returns {Object} Merged configuration
   */
  _mergeConfigs(defaultConfig, customConfig) {
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(customConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this._mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * Validate configuration
   */
  _validateConfig() {
    const errors = [];

    // Validate AgentAPI URL
    if (!this.config.agentapi.baseUrl) {
      errors.push('AgentAPI base URL is required');
    }

    // Validate numeric values
    const numericFields = [
      'agentapi.timeout',
      'agentapi.retryAttempts',
      'claudeCode.maxInstances',
      'taskQueue.maxConcurrentTasks',
      'eventProcessor.eventBufferSize'
    ];

    for (const field of numericFields) {
      const value = this._getNestedValue(this.config, field);
      if (typeof value !== 'number' || value < 0) {
        errors.push(`${field} must be a positive number`);
      }
    }

    // Validate database configuration if enabled
    if (this.config.database.enabled) {
      if (!this.config.database.url && !this.config.database.host) {
        errors.push('Database URL or host is required when database is enabled');
      }
    }

    // Validate security configuration if enabled
    if (this.config.security.enableAuth && !this.config.security.jwtSecret) {
      errors.push('JWT secret is required when authentication is enabled');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-separated path
   * @returns {any} Value at path
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Get configuration value
   * @param {string} path - Dot-separated path to configuration value
   * @param {any} defaultValue - Default value if not found
   * @returns {any} Configuration value
   */
  get(path, defaultValue = undefined) {
    const value = this._getNestedValue(this.config, path);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} path - Dot-separated path to configuration value
   * @param {any} value - Value to set
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, this.config);
    
    target[lastKey] = value;
  }

  /**
   * Get full configuration object
   * @returns {Object} Full configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Get configuration for a specific component
   * @param {string} component - Component name
   * @returns {Object} Component configuration
   */
  getComponent(component) {
    return this.config[component] || {};
  }

  /**
   * Load configuration from file
   * @param {string} filePath - Path to configuration file
   * @returns {AgentAPIConfig} New configuration instance
   */
  static fromFile(filePath) {
    try {
      const configData = JSON.parse(readFileSync(filePath, 'utf8'));
      return new AgentAPIConfig(configData);
    } catch (error) {
      throw new Error(`Failed to load configuration from ${filePath}: ${error.message}`);
    }
  }

  /**
   * Create configuration for development environment
   * @returns {AgentAPIConfig} Development configuration
   */
  static development() {
    return new AgentAPIConfig({
      logging: {
        level: 'debug',
        enableFileLogging: true
      },
      monitoring: {
        enabled: true
      },
      performance: {
        enableCaching: false
      }
    });
  }

  /**
   * Create configuration for production environment
   * @returns {AgentAPIConfig} Production configuration
   */
  static production() {
    return new AgentAPIConfig({
      logging: {
        level: 'info',
        enableFileLogging: true,
        enableStructuredLogging: true
      },
      monitoring: {
        enabled: true,
        enablePrometheus: true,
        enableTracing: true
      },
      performance: {
        enableCaching: true,
        enableCompression: true
      },
      security: {
        enableAuth: true,
        enableRateLimit: true
      }
    });
  }

  /**
   * Create configuration for testing environment
   * @returns {AgentAPIConfig} Testing configuration
   */
  static testing() {
    return new AgentAPIConfig({
      agentapi: {
        baseUrl: 'http://localhost:3284',
        timeout: 5000
      },
      claudeCode: {
        maxInstances: 2
      },
      taskQueue: {
        maxConcurrentTasks: 1,
        taskTimeout: 10000
      },
      logging: {
        level: 'warn'
      },
      monitoring: {
        enabled: false
      }
    });
  }

  /**
   * Export configuration to JSON
   * @param {boolean} includeSecrets - Whether to include sensitive values
   * @returns {string} JSON configuration
   */
  toJSON(includeSecrets = false) {
    const config = { ...this.config };
    
    if (!includeSecrets) {
      // Remove sensitive fields
      const sensitiveFields = [
        'database.password',
        'security.apiKey',
        'security.jwtSecret',
        'integrations.linear.apiKey',
        'integrations.github.token',
        'integrations.slack.botToken'
      ];
      
      for (const field of sensitiveFields) {
        const keys = field.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => current?.[key], config);
        if (target && target[lastKey]) {
          target[lastKey] = '[REDACTED]';
        }
      }
    }
    
    return JSON.stringify(config, null, 2);
  }
}

// Export default instance
export const agentAPIConfig = new AgentAPIConfig();

export default AgentAPIConfig;

