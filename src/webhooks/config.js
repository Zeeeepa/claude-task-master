/**
 * Webhook Configuration Management
 * 
 * Centralized configuration management for webhook system
 * with environment variable support and validation.
 */

import { logger } from '../utils/logger.js';

export class WebhookConfig {
  constructor(overrides = {}) {
    this.config = this.loadConfiguration(overrides);
    this.validateConfiguration();
  }

  /**
   * Load configuration from environment variables and overrides
   */
  loadConfiguration(overrides) {
    const config = {
      // Server Configuration
      server: {
        port: parseInt(process.env.WEBHOOK_PORT) || 3000,
        host: process.env.WEBHOOK_HOST || '0.0.0.0',
        maxPayloadSize: process.env.WEBHOOK_MAX_PAYLOAD_SIZE || '10mb',
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 30000,
        keepAliveTimeout: parseInt(process.env.WEBHOOK_KEEP_ALIVE_TIMEOUT) || 5000,
        headersTimeout: parseInt(process.env.WEBHOOK_HEADERS_TIMEOUT) || 60000
      },

      // Security Configuration
      security: {
        secret: process.env.GITHUB_WEBHOOK_SECRET,
        enableSignatureVerification: process.env.WEBHOOK_VERIFY_SIGNATURE !== 'false',
        allowedUserAgents: process.env.WEBHOOK_ALLOWED_USER_AGENTS?.split(',') || [
          'GitHub-Hookshot',
          'GitHub Hookshot'
        ],
        trustedProxies: process.env.WEBHOOK_TRUSTED_PROXIES?.split(',') || [],
        enableCors: process.env.WEBHOOK_ENABLE_CORS === 'true',
        corsOrigins: process.env.WEBHOOK_CORS_ORIGINS?.split(',') || []
      },

      // Rate Limiting Configuration
      rateLimit: {
        enabled: process.env.WEBHOOK_RATE_LIMIT_ENABLED !== 'false',
        windowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX) || 1000,
        skipSuccessfulRequests: process.env.WEBHOOK_RATE_LIMIT_SKIP_SUCCESS === 'true',
        skipFailedRequests: process.env.WEBHOOK_RATE_LIMIT_SKIP_FAILED === 'true'
      },

      // Queue Configuration
      queue: {
        enabled: process.env.WEBHOOK_QUEUE_ENABLED !== 'false',
        maxConcurrency: parseInt(process.env.WEBHOOK_QUEUE_CONCURRENCY) || 5,
        retryAttempts: parseInt(process.env.WEBHOOK_QUEUE_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.WEBHOOK_QUEUE_RETRY_DELAY) || 1000,
        maxRetryDelay: parseInt(process.env.WEBHOOK_QUEUE_MAX_RETRY_DELAY) || 30000,
        deadLetterQueueSize: parseInt(process.env.WEBHOOK_QUEUE_DLQ_SIZE) || 1000,
        processingTimeout: parseInt(process.env.WEBHOOK_QUEUE_TIMEOUT) || 60000
      },

      // Handler Configuration
      handlers: {
        claudeCode: {
          enabled: process.env.WEBHOOK_CLAUDE_CODE_ENABLED !== 'false',
          apiUrl: process.env.CLAUDE_CODE_API_URL || 'http://localhost:3001',
          timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || 30000,
          retryAttempts: parseInt(process.env.CLAUDE_CODE_RETRY_ATTEMPTS) || 2,
          apiKey: process.env.CLAUDE_CODE_API_KEY
        },
        agentAPI: {
          enabled: process.env.WEBHOOK_AGENTAPI_ENABLED !== 'false',
          apiUrl: process.env.AGENTAPI_URL || 'http://localhost:3002',
          timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
          retryAttempts: parseInt(process.env.AGENTAPI_RETRY_ATTEMPTS) || 2,
          apiKey: process.env.AGENTAPI_API_KEY
        },
        codegen: {
          enabled: process.env.WEBHOOK_CODEGEN_ENABLED !== 'false',
          apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
          timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 60000,
          retryAttempts: parseInt(process.env.CODEGEN_RETRY_ATTEMPTS) || 1,
          apiKey: process.env.CODEGEN_API_KEY
        },
        linear: {
          enabled: process.env.WEBHOOK_LINEAR_ENABLED !== 'false',
          apiUrl: process.env.LINEAR_API_URL || 'https://api.linear.app',
          timeout: parseInt(process.env.LINEAR_TIMEOUT) || 30000,
          retryAttempts: parseInt(process.env.LINEAR_RETRY_ATTEMPTS) || 2,
          apiToken: process.env.LINEAR_API_TOKEN
        }
      },

      // Logging Configuration
      logging: {
        level: process.env.WEBHOOK_LOG_LEVEL || 'info',
        enableRequestLogging: process.env.WEBHOOK_LOG_REQUESTS !== 'false',
        enableMetrics: process.env.WEBHOOK_ENABLE_METRICS !== 'false',
        metricsInterval: parseInt(process.env.WEBHOOK_METRICS_INTERVAL) || 60000
      },

      // Storage Configuration
      storage: {
        type: process.env.WEBHOOK_STORAGE_TYPE || 'memory', // memory, file, database
        filePath: process.env.WEBHOOK_STORAGE_FILE_PATH || './webhook-events.json',
        databaseUrl: process.env.WEBHOOK_DATABASE_URL,
        retentionDays: parseInt(process.env.WEBHOOK_RETENTION_DAYS) || 30
      },

      // Monitoring Configuration
      monitoring: {
        enabled: process.env.WEBHOOK_MONITORING_ENABLED === 'true',
        healthCheckInterval: parseInt(process.env.WEBHOOK_HEALTH_CHECK_INTERVAL) || 30000,
        alertThresholds: {
          errorRate: parseFloat(process.env.WEBHOOK_ALERT_ERROR_RATE) || 0.1, // 10%
          responseTime: parseInt(process.env.WEBHOOK_ALERT_RESPONSE_TIME) || 5000, // 5s
          queueSize: parseInt(process.env.WEBHOOK_ALERT_QUEUE_SIZE) || 1000
        }
      },

      // Development Configuration
      development: {
        enableDebugLogging: process.env.NODE_ENV === 'development' || process.env.WEBHOOK_DEBUG === 'true',
        enableTestEndpoints: process.env.WEBHOOK_ENABLE_TEST_ENDPOINTS === 'true',
        mockHandlers: process.env.WEBHOOK_MOCK_HANDLERS === 'true',
        simulateFailures: process.env.WEBHOOK_SIMULATE_FAILURES === 'true'
      }
    };

    // Apply overrides
    return this.mergeDeep(config, overrides);
  }

  /**
   * Validate configuration
   */
  validateConfiguration() {
    const errors = [];

    // Validate server configuration
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('Invalid server port. Must be between 1 and 65535');
    }

    if (this.config.server.timeout < 1000) {
      errors.push('Server timeout must be at least 1000ms');
    }

    // Validate security configuration
    if (this.config.security.enableSignatureVerification && !this.config.security.secret) {
      errors.push('Webhook secret is required when signature verification is enabled');
    }

    if (this.config.security.secret && this.config.security.secret.length < 16) {
      errors.push('Webhook secret must be at least 16 characters long');
    }

    // Validate rate limiting configuration
    if (this.config.rateLimit.enabled) {
      if (this.config.rateLimit.windowMs < 1000) {
        errors.push('Rate limit window must be at least 1000ms');
      }

      if (this.config.rateLimit.maxRequests < 1) {
        errors.push('Rate limit max requests must be at least 1');
      }
    }

    // Validate queue configuration
    if (this.config.queue.enabled) {
      if (this.config.queue.maxConcurrency < 1) {
        errors.push('Queue max concurrency must be at least 1');
      }

      if (this.config.queue.retryAttempts < 0) {
        errors.push('Queue retry attempts cannot be negative');
      }

      if (this.config.queue.processingTimeout < 1000) {
        errors.push('Queue processing timeout must be at least 1000ms');
      }
    }

    // Validate handler configurations
    Object.entries(this.config.handlers).forEach(([name, config]) => {
      if (config.enabled) {
        if (!config.apiUrl) {
          errors.push(`Handler ${name} is enabled but missing API URL`);
        }

        if (config.timeout < 1000) {
          errors.push(`Handler ${name} timeout must be at least 1000ms`);
        }

        if (config.retryAttempts < 0) {
          errors.push(`Handler ${name} retry attempts cannot be negative`);
        }
      }
    });

    // Validate storage configuration
    if (!['memory', 'file', 'database'].includes(this.config.storage.type)) {
      errors.push('Invalid storage type. Must be memory, file, or database');
    }

    if (this.config.storage.type === 'database' && !this.config.storage.databaseUrl) {
      errors.push('Database URL is required when using database storage');
    }

    if (errors.length > 0) {
      const errorMessage = `Configuration validation failed:\n${errors.join('\n')}`;
      logger.error('Webhook configuration validation failed', { errors });
      throw new Error(errorMessage);
    }

    logger.info('Webhook configuration validated successfully');
  }

  /**
   * Get configuration value by path
   */
  get(path, defaultValue = undefined) {
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
   * Set configuration value by path
   */
  set(path, value) {
    const keys = path.split('.');
    let target = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[keys[keys.length - 1]] = value;
    
    // Re-validate after changes
    this.validateConfiguration();
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Get sanitized configuration (without secrets)
   */
  getSanitized() {
    const sanitized = JSON.parse(JSON.stringify(this.config));
    
    // Remove sensitive information
    if (sanitized.security.secret) {
      sanitized.security.secret = '[REDACTED]';
    }

    Object.values(sanitized.handlers).forEach(handler => {
      if (handler.apiKey) {
        handler.apiKey = '[REDACTED]';
      }
      if (handler.apiToken) {
        handler.apiToken = '[REDACTED]';
      }
    });

    if (sanitized.storage.databaseUrl) {
      sanitized.storage.databaseUrl = '[REDACTED]';
    }

    return sanitized;
  }

  /**
   * Deep merge objects
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
   * Export configuration to environment variables format
   */
  toEnvFormat() {
    const envVars = [];
    
    const flatten = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const envKey = prefix + key.toUpperCase().replace(/([A-Z])/g, '_$1');
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, envKey + '_');
        } else if (Array.isArray(value)) {
          envVars.push(`${envKey}=${value.join(',')}`);
        } else if (value !== undefined && value !== null) {
          envVars.push(`${envKey}=${value}`);
        }
      }
    };

    flatten(this.config, 'WEBHOOK_');
    return envVars.sort();
  }

  /**
   * Load configuration from file
   */
  static fromFile(filePath, overrides = {}) {
    try {
      const fs = require('fs');
      const fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return new WebhookConfig({ ...fileConfig, ...overrides });
    } catch (error) {
      logger.warn('Failed to load configuration from file', {
        filePath,
        error: error.message
      });
      return new WebhookConfig(overrides);
    }
  }

  /**
   * Save configuration to file
   */
  toFile(filePath) {
    try {
      const fs = require('fs');
      fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2));
      logger.info('Configuration saved to file', { filePath });
    } catch (error) {
      logger.error('Failed to save configuration to file', {
        filePath,
        error: error.message
      });
      throw error;
    }
  }
}

/**
 * Create default webhook configuration
 */
export function createDefaultConfig(overrides = {}) {
  return new WebhookConfig(overrides);
}

/**
 * Validate environment variables
 */
export function validateEnvironment() {
  const required = [];
  const missing = [];

  // Check for required environment variables based on enabled features
  if (process.env.WEBHOOK_VERIFY_SIGNATURE !== 'false' && !process.env.GITHUB_WEBHOOK_SECRET) {
    required.push('GITHUB_WEBHOOK_SECRET');
  }

  if (process.env.WEBHOOK_CLAUDE_CODE_ENABLED !== 'false' && !process.env.CLAUDE_CODE_API_URL) {
    required.push('CLAUDE_CODE_API_URL');
  }

  if (process.env.WEBHOOK_LINEAR_ENABLED !== 'false' && !process.env.LINEAR_API_TOKEN) {
    required.push('LINEAR_API_TOKEN');
  }

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error('Environment validation failed', { missing });
    throw new Error(message);
  }

  logger.info('Environment validation passed');
}

export default WebhookConfig;

