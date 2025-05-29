/**
 * @fileoverview Event Storage Configuration
 * @description Configuration management for the event storage system
 * @version 1.0.0
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Default event storage configuration
 */
export const DEFAULT_EVENT_CONFIG = {
  // Database connection settings
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE || 'claude_task_master',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL_MODE === 'require',
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
    min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS || '2'),
  },

  // Event storage settings
  eventStore: {
    tablePrefix: process.env.EVENT_TABLE_PREFIX || 'claude_task_master',
    batchSize: parseInt(process.env.EVENT_BATCH_SIZE || '100'),
    batchTimeout: parseInt(process.env.EVENT_BATCH_TIMEOUT || '5000'),
    enableHealthMonitoring: process.env.EVENT_HEALTH_MONITORING !== 'false',
    healthCheckInterval: parseInt(process.env.EVENT_HEALTH_CHECK_INTERVAL || '30000'),
    retryAttempts: parseInt(process.env.EVENT_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.EVENT_RETRY_DELAY || '1000'),
  },

  // Integration settings
  integration: {
    enabled: process.env.EVENT_INTEGRATION_ENABLED !== 'false',
    autoCapture: {
      tasks: process.env.EVENT_AUTO_CAPTURE_TASKS !== 'false',
      agents: process.env.EVENT_AUTO_CAPTURE_AGENTS !== 'false',
      deployments: process.env.EVENT_AUTO_CAPTURE_DEPLOYMENTS !== 'false',
      system: process.env.EVENT_AUTO_CAPTURE_SYSTEM !== 'false',
    },
    trackingLimits: {
      maxTrackedTasks: parseInt(process.env.EVENT_MAX_TRACKED_TASKS || '1000'),
      maxTrackedAgents: parseInt(process.env.EVENT_MAX_TRACKED_AGENTS || '100'),
      taskTimeoutMs: parseInt(process.env.EVENT_TASK_TIMEOUT_MS || '3600000'), // 1 hour
      agentTimeoutMs: parseInt(process.env.EVENT_AGENT_TIMEOUT_MS || '86400000'), // 24 hours
    }
  },

  // Logging settings
  logging: {
    level: process.env.EVENT_LOG_LEVEL || 'info',
    enableConsole: process.env.EVENT_LOG_CONSOLE !== 'false',
    enableFile: process.env.EVENT_LOG_FILE === 'true',
    logFile: process.env.EVENT_LOG_FILE_PATH || './logs/event-store.log',
  }
};

/**
 * Development configuration
 */
export const DEVELOPMENT_CONFIG = {
  ...DEFAULT_EVENT_CONFIG,
  database: {
    ...DEFAULT_EVENT_CONFIG.database,
    host: 'localhost',
    port: 5432,
    database: 'claude_task_master_dev',
    user: 'postgres',
    password: 'postgres',
    ssl: false,
    max: 10,
    min: 2,
  },
  eventStore: {
    ...DEFAULT_EVENT_CONFIG.eventStore,
    tablePrefix: 'dev_events',
    batchSize: 50,
    batchTimeout: 2000,
    healthCheckInterval: 15000,
  },
  logging: {
    ...DEFAULT_EVENT_CONFIG.logging,
    level: 'debug',
    enableConsole: true,
    enableFile: true,
  }
};

/**
 * Production configuration
 */
export const PRODUCTION_CONFIG = {
  ...DEFAULT_EVENT_CONFIG,
  database: {
    ...DEFAULT_EVENT_CONFIG.database,
    ssl: true,
    max: 50,
    min: 5,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 60000,
  },
  eventStore: {
    ...DEFAULT_EVENT_CONFIG.eventStore,
    batchSize: 200,
    batchTimeout: 10000,
    healthCheckInterval: 60000,
    retryAttempts: 5,
    retryDelay: 2000,
  },
  integration: {
    ...DEFAULT_EVENT_CONFIG.integration,
    trackingLimits: {
      ...DEFAULT_EVENT_CONFIG.integration.trackingLimits,
      maxTrackedTasks: 5000,
      maxTrackedAgents: 500,
    }
  },
  logging: {
    ...DEFAULT_EVENT_CONFIG.logging,
    level: 'warn',
    enableConsole: false,
    enableFile: true,
  }
};

/**
 * Test configuration
 */
export const TEST_CONFIG = {
  ...DEFAULT_EVENT_CONFIG,
  database: {
    ...DEFAULT_EVENT_CONFIG.database,
    database: 'claude_task_master_test',
    max: 5,
    min: 1,
  },
  eventStore: {
    ...DEFAULT_EVENT_CONFIG.eventStore,
    tablePrefix: 'test_events',
    batchSize: 10,
    batchTimeout: 1000,
    enableHealthMonitoring: false,
  },
  integration: {
    ...DEFAULT_EVENT_CONFIG.integration,
    trackingLimits: {
      ...DEFAULT_EVENT_CONFIG.integration.trackingLimits,
      maxTrackedTasks: 100,
      maxTrackedAgents: 10,
    }
  },
  logging: {
    ...DEFAULT_EVENT_CONFIG.logging,
    level: 'error',
    enableConsole: false,
    enableFile: false,
  }
};

/**
 * Get configuration based on environment
 */
export function getEventConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';
  
  switch (env.toLowerCase()) {
    case 'production':
    case 'prod':
      return PRODUCTION_CONFIG;
    case 'test':
    case 'testing':
      return TEST_CONFIG;
    case 'development':
    case 'dev':
    default:
      return DEVELOPMENT_CONFIG;
  }
}

/**
 * Validate configuration
 */
export function validateEventConfig(config) {
  const errors = [];

  // Validate database configuration
  if (!config.database) {
    errors.push('Database configuration is required');
  } else {
    if (!config.database.host) errors.push('Database host is required');
    if (!config.database.port) errors.push('Database port is required');
    if (!config.database.database) errors.push('Database name is required');
    if (!config.database.user) errors.push('Database user is required');
  }

  // Validate event store configuration
  if (!config.eventStore) {
    errors.push('Event store configuration is required');
  } else {
    if (!config.eventStore.tablePrefix) errors.push('Table prefix is required');
    if (config.eventStore.batchSize < 1) errors.push('Batch size must be greater than 0');
    if (config.eventStore.batchTimeout < 1000) errors.push('Batch timeout must be at least 1000ms');
  }

  // Validate integration configuration
  if (!config.integration) {
    errors.push('Integration configuration is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }

  return true;
}

/**
 * Create a custom configuration by merging with defaults
 */
export function createEventConfig(customConfig = {}) {
  const baseConfig = getEventConfig();
  
  // Deep merge custom configuration
  const mergedConfig = {
    database: { ...baseConfig.database, ...customConfig.database },
    eventStore: { ...baseConfig.eventStore, ...customConfig.eventStore },
    integration: {
      ...baseConfig.integration,
      ...customConfig.integration,
      autoCapture: {
        ...baseConfig.integration.autoCapture,
        ...customConfig.integration?.autoCapture
      },
      trackingLimits: {
        ...baseConfig.integration.trackingLimits,
        ...customConfig.integration?.trackingLimits
      }
    },
    logging: { ...baseConfig.logging, ...customConfig.logging }
  };

  // Validate the merged configuration
  validateEventConfig(mergedConfig);

  return mergedConfig;
}

/**
 * Export configuration utilities
 */
export default {
  DEFAULT_EVENT_CONFIG,
  DEVELOPMENT_CONFIG,
  PRODUCTION_CONFIG,
  TEST_CONFIG,
  getEventConfig,
  validateEventConfig,
  createEventConfig
};

