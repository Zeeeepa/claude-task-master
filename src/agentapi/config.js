/**
 * AgentAPI Configuration
 * 
 * Centralized configuration management for AgentAPI integration
 * with environment-based settings and validation.
 */

import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export const agentApiConfig = {
  // AgentAPI server configuration
  server: {
    baseUrl: process.env.AGENTAPI_URL || 'http://localhost:3002',
    wsUrl: process.env.AGENTAPI_WS_URL || 'ws://localhost:3002/ws',
    timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
    retries: parseInt(process.env.AGENTAPI_RETRIES) || 3,
    retryDelay: parseInt(process.env.AGENTAPI_RETRY_DELAY) || 5000
  },

  // Authentication configuration
  authentication: {
    type: process.env.AGENTAPI_AUTH_TYPE || 'bearer',
    token: process.env.AGENTAPI_TOKEN,
    apiKey: process.env.AGENTAPI_API_KEY,
    refreshToken: process.env.AGENTAPI_REFRESH_TOKEN,
    tokenExpiry: parseInt(process.env.AGENTAPI_TOKEN_EXPIRY) || 3600000 // 1 hour
  },

  // WSL2 instance configuration
  wsl2: {
    maxInstances: parseInt(process.env.WSL2_MAX_INSTANCES) || 5,
    instanceTimeout: parseInt(process.env.WSL2_INSTANCE_TIMEOUT) || 300000, // 5 minutes
    resourceLimits: {
      memory: process.env.WSL2_MEMORY_LIMIT || '4GB',
      cpu: process.env.WSL2_CPU_LIMIT || '2 cores',
      disk: process.env.WSL2_DISK_LIMIT || '20GB'
    },
    distribution: process.env.WSL2_DISTRIBUTION || 'Ubuntu',
    user: process.env.WSL2_USER || 'ubuntu',
    workingDir: process.env.WSL2_WORKING_DIR || '/home/ubuntu/workspace'
  },

  // Claude Code configuration
  claudeCode: {
    version: process.env.CLAUDE_CODE_VERSION || 'latest',
    timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || 600000, // 10 minutes
    retryAttempts: parseInt(process.env.CLAUDE_CODE_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.CLAUDE_CODE_RETRY_DELAY) || 10000,
    maxConcurrentExecutions: parseInt(process.env.CLAUDE_CODE_MAX_CONCURRENT) || 3,
    enableLogging: process.env.CLAUDE_CODE_ENABLE_LOGGING !== 'false',
    logLevel: process.env.CLAUDE_CODE_LOG_LEVEL || 'info'
  },

  // Task management configuration
  taskManager: {
    maxConcurrentTasks: parseInt(process.env.TASK_MANAGER_MAX_CONCURRENT) || 10,
    taskTimeout: parseInt(process.env.TASK_MANAGER_TIMEOUT) || 600000, // 10 minutes
    retryAttempts: parseInt(process.env.TASK_MANAGER_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.TASK_MANAGER_RETRY_DELAY) || 5000,
    cleanupInterval: parseInt(process.env.TASK_MANAGER_CLEANUP_INTERVAL) || 300000, // 5 minutes
    enablePersistence: process.env.TASK_MANAGER_ENABLE_PERSISTENCE === 'true'
  },

  // Load balancer configuration
  loadBalancer: {
    algorithm: process.env.LOAD_BALANCER_ALGORITHM || 'weighted_round_robin',
    healthCheckEnabled: process.env.LOAD_BALANCER_HEALTH_CHECK !== 'false',
    resourceThresholds: {
      maxCpuUsage: parseInt(process.env.LOAD_BALANCER_MAX_CPU) || 80,
      maxMemoryUsage: parseInt(process.env.LOAD_BALANCER_MAX_MEMORY) || 85,
      maxDiskUsage: parseInt(process.env.LOAD_BALANCER_MAX_DISK) || 90
    },
    weights: {} // Instance-specific weights can be set dynamically
  },

  // WebSocket client configuration
  websocket: {
    enabled: process.env.AGENTAPI_WEBSOCKET_ENABLED !== 'false',
    reconnectInterval: parseInt(process.env.AGENTAPI_WS_RECONNECT_INTERVAL) || 5000,
    maxReconnectAttempts: parseInt(process.env.AGENTAPI_WS_MAX_RECONNECT) || 10,
    pingInterval: parseInt(process.env.AGENTAPI_WS_PING_INTERVAL) || 30000,
    pongTimeout: parseInt(process.env.AGENTAPI_WS_PONG_TIMEOUT) || 5000
  },

  // Message queue configuration
  messageQueue: {
    maxSize: parseInt(process.env.MESSAGE_QUEUE_MAX_SIZE) || 1000,
    defaultPriority: parseInt(process.env.MESSAGE_QUEUE_DEFAULT_PRIORITY) || 5,
    retryAttempts: parseInt(process.env.MESSAGE_QUEUE_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.MESSAGE_QUEUE_RETRY_DELAY) || 5000,
    deadLetterQueueEnabled: process.env.MESSAGE_QUEUE_DLQ_ENABLED !== 'false',
    persistenceEnabled: process.env.MESSAGE_QUEUE_PERSISTENCE_ENABLED === 'true'
  },

  // Status tracker configuration
  statusTracker: {
    retentionPeriod: parseInt(process.env.STATUS_TRACKER_RETENTION) || 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupInterval: parseInt(process.env.STATUS_TRACKER_CLEANUP_INTERVAL) || 60 * 60 * 1000, // 1 hour
    enableMetrics: process.env.STATUS_TRACKER_ENABLE_METRICS !== 'false',
    enableHistory: process.env.STATUS_TRACKER_ENABLE_HISTORY !== 'false',
    maxHistoryEntries: parseInt(process.env.STATUS_TRACKER_MAX_HISTORY) || 1000
  },

  // Error handler configuration
  errorHandler: {
    maxRetryAttempts: parseInt(process.env.ERROR_HANDLER_MAX_RETRIES) || 3,
    baseRetryDelay: parseInt(process.env.ERROR_HANDLER_BASE_DELAY) || 1000,
    maxRetryDelay: parseInt(process.env.ERROR_HANDLER_MAX_DELAY) || 30000,
    exponentialBackoff: process.env.ERROR_HANDLER_EXPONENTIAL_BACKOFF !== 'false',
    jitterEnabled: process.env.ERROR_HANDLER_JITTER_ENABLED !== 'false',
    circuitBreakerEnabled: process.env.ERROR_HANDLER_CIRCUIT_BREAKER !== 'false',
    circuitBreakerThreshold: parseInt(process.env.ERROR_HANDLER_CB_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.ERROR_HANDLER_CB_TIMEOUT) || 60000
  },

  // Monitoring and logging configuration
  monitoring: {
    enableMetrics: process.env.AGENTAPI_ENABLE_METRICS !== 'false',
    metricsInterval: parseInt(process.env.AGENTAPI_METRICS_INTERVAL) || 60000,
    enableHealthCheck: process.env.AGENTAPI_ENABLE_HEALTH_CHECK !== 'false',
    healthCheckInterval: parseInt(process.env.AGENTAPI_HEALTH_CHECK_INTERVAL) || 30000,
    logLevel: process.env.AGENTAPI_LOG_LEVEL || 'info',
    enableDebugMode: process.env.AGENTAPI_DEBUG_MODE === 'true'
  },

  // Security configuration
  security: {
    enableRateLimiting: process.env.AGENTAPI_RATE_LIMITING !== 'false',
    rateLimitWindow: parseInt(process.env.AGENTAPI_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    rateLimitMax: parseInt(process.env.AGENTAPI_RATE_LIMIT_MAX) || 100,
    enableRequestValidation: process.env.AGENTAPI_REQUEST_VALIDATION !== 'false',
    enableResponseValidation: process.env.AGENTAPI_RESPONSE_VALIDATION !== 'false',
    trustedProxies: process.env.AGENTAPI_TRUSTED_PROXIES?.split(',') || []
  },

  // Development and testing configuration
  development: {
    enableMockMode: process.env.AGENTAPI_MOCK_MODE === 'true',
    mockDelay: parseInt(process.env.AGENTAPI_MOCK_DELAY) || 1000,
    enableTestMode: process.env.NODE_ENV === 'test',
    verboseLogging: process.env.AGENTAPI_VERBOSE_LOGGING === 'true'
  }
};

/**
 * Get configuration with environment overrides
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Merged configuration
 */
export function getConfig(overrides = {}) {
  return mergeDeep(agentApiConfig, overrides);
}

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name
 * @returns {Object} Environment configuration
 */
export function getEnvironmentConfig(environment = process.env.NODE_ENV || 'development') {
  const baseConfig = getConfig();
  
  switch (environment) {
    case 'development':
      return mergeDeep(baseConfig, {
        monitoring: {
          logLevel: 'debug',
          enableDebugMode: true
        },
        errorHandler: {
          maxRetryAttempts: 1 // Faster feedback in development
        },
        development: {
          enableMockMode: true,
          verboseLogging: true
        }
      });

    case 'test':
      return mergeDeep(baseConfig, {
        server: {
          timeout: 5000 // Shorter timeouts for tests
        },
        wsl2: {
          maxInstances: 2 // Fewer instances for testing
        },
        monitoring: {
          logLevel: 'error', // Reduce test noise
          enableMetrics: false
        },
        development: {
          enableTestMode: true,
          enableMockMode: true
        }
      });

    case 'staging':
      return mergeDeep(baseConfig, {
        monitoring: {
          logLevel: 'info',
          enableMetrics: true
        },
        errorHandler: {
          circuitBreakerEnabled: true
        },
        security: {
          enableRateLimiting: true
        }
      });

    case 'production':
      return mergeDeep(baseConfig, {
        monitoring: {
          logLevel: 'warn',
          enableMetrics: true,
          enableHealthCheck: true
        },
        errorHandler: {
          circuitBreakerEnabled: true,
          maxRetryAttempts: 5
        },
        security: {
          enableRateLimiting: true,
          enableRequestValidation: true,
          enableResponseValidation: true
        },
        development: {
          enableMockMode: false,
          verboseLogging: false
        }
      });

    default:
      return baseConfig;
  }
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate required fields
  if (!config.authentication.token && !config.authentication.apiKey) {
    errors.push('Either AGENTAPI_TOKEN or AGENTAPI_API_KEY must be provided');
  }

  if (!config.server.baseUrl) {
    errors.push('AGENTAPI_URL is required');
  }

  // Validate numeric values
  if (config.server.timeout < 1000) {
    warnings.push('Server timeout is very low, consider increasing it');
  }

  if (config.wsl2.maxInstances < 1) {
    errors.push('WSL2 max instances must be at least 1');
  }

  if (config.wsl2.maxInstances > 10) {
    warnings.push('High number of WSL2 instances may impact system performance');
  }

  if (config.taskManager.maxConcurrentTasks > config.wsl2.maxInstances * 2) {
    warnings.push('Max concurrent tasks is much higher than available instances');
  }

  // Validate URLs
  try {
    new URL(config.server.baseUrl);
  } catch (error) {
    errors.push(`Invalid AGENTAPI_URL: ${config.server.baseUrl}`);
  }

  // Validate WSL2 configuration
  if (!config.wsl2.distribution) {
    errors.push('WSL2 distribution must be specified');
  }

  if (!config.wsl2.user) {
    errors.push('WSL2 user must be specified');
  }

  // Validate resource limits
  const memoryLimit = config.wsl2.resourceLimits.memory;
  if (memoryLimit && !memoryLimit.match(/^\d+[KMGT]?B$/i)) {
    warnings.push(`Invalid memory limit format: ${memoryLimit}`);
  }

  // Validate load balancer algorithm
  const validAlgorithms = ['round_robin', 'least_connections', 'weighted_round_robin', 'resource_based'];
  if (!validAlgorithms.includes(config.loadBalancer.algorithm)) {
    errors.push(`Invalid load balancer algorithm: ${config.loadBalancer.algorithm}`);
  }

  // Validate log level
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.monitoring.logLevel)) {
    warnings.push(`Invalid log level: ${config.monitoring.logLevel}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Deep merge configuration objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Get configuration for a specific component
 * @param {string} component - Component name
 * @param {Object} baseConfig - Base configuration
 * @returns {Object} Component configuration
 */
export function getComponentConfig(component, baseConfig = null) {
  const config = baseConfig || getConfig();
  
  switch (component) {
    case 'client':
      return {
        agentApiUrl: config.server.baseUrl,
        wsUrl: config.server.wsUrl,
        apiKey: config.authentication.token || config.authentication.apiKey,
        timeout: config.server.timeout,
        enableWebSocket: config.websocket.enabled
      };

    case 'taskManager':
      return config.taskManager;

    case 'wsl2Manager':
      return config.wsl2;

    case 'loadBalancer':
      return config.loadBalancer;

    case 'websocketClient':
      return {
        ...config.websocket,
        apiKey: config.authentication.token || config.authentication.apiKey
      };

    case 'messageQueue':
      return config.messageQueue;

    case 'statusTracker':
      return config.statusTracker;

    case 'errorHandler':
      return config.errorHandler;

    default:
      throw new Error(`Unknown component: ${component}`);
  }
}

/**
 * Create a logger with appropriate configuration
 * @param {string} name - Logger name
 * @param {Object} config - Configuration
 * @returns {Object} Logger instance
 */
export function createLogger(name, config = null) {
  const logConfig = config || getConfig();
  return new SimpleLogger(name, logConfig.monitoring.logLevel);
}

/**
 * Export environment variables template
 * @returns {string} Environment variables template
 */
export function getEnvironmentTemplate() {
  return `# AgentAPI Configuration
# Server Configuration
AGENTAPI_URL=http://localhost:3002
AGENTAPI_WS_URL=ws://localhost:3002/ws
AGENTAPI_TIMEOUT=30000
AGENTAPI_RETRIES=3
AGENTAPI_RETRY_DELAY=5000

# Authentication
AGENTAPI_TOKEN=your_agentapi_token
AGENTAPI_API_KEY=your_api_key

# WSL2 Configuration
WSL2_MAX_INSTANCES=5
WSL2_INSTANCE_TIMEOUT=300000
WSL2_MEMORY_LIMIT=4GB
WSL2_CPU_LIMIT=2 cores
WSL2_DISTRIBUTION=Ubuntu
WSL2_USER=ubuntu
WSL2_WORKING_DIR=/home/ubuntu/workspace

# Claude Code Configuration
CLAUDE_CODE_VERSION=latest
CLAUDE_CODE_TIMEOUT=600000
CLAUDE_CODE_RETRY_ATTEMPTS=3
CLAUDE_CODE_MAX_CONCURRENT=3

# Task Manager Configuration
TASK_MANAGER_MAX_CONCURRENT=10
TASK_MANAGER_TIMEOUT=600000
TASK_MANAGER_RETRY_ATTEMPTS=3

# Load Balancer Configuration
LOAD_BALANCER_ALGORITHM=weighted_round_robin
LOAD_BALANCER_HEALTH_CHECK=true
LOAD_BALANCER_MAX_CPU=80
LOAD_BALANCER_MAX_MEMORY=85

# Monitoring Configuration
AGENTAPI_ENABLE_METRICS=true
AGENTAPI_LOG_LEVEL=info
AGENTAPI_DEBUG_MODE=false

# Security Configuration
AGENTAPI_RATE_LIMITING=true
AGENTAPI_RATE_LIMIT_MAX=100
AGENTAPI_REQUEST_VALIDATION=true
`;
}

export default {
  agentApiConfig,
  getConfig,
  getEnvironmentConfig,
  validateConfig,
  getComponentConfig,
  createLogger,
  getEnvironmentTemplate
};

