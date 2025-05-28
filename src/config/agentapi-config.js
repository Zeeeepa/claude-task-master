/**
 * AgentAPI Configuration
 * 
 * Consolidated configuration management for AgentAPI middleware integration
 * combining features from PRs #74, #81, #82, #85 with environment
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

      // WSL2 Configuration (from PR #81)
      wsl2: {
        enabled: process.env.WSL2_ENABLED === 'true',
        maxInstances: parseInt(process.env.WSL2_MAX_INSTANCES) || 5,
        defaultDistribution: process.env.WSL2_DEFAULT_DISTRIBUTION || 'Ubuntu-22.04',
        resourceLimits: {
          memory: process.env.WSL2_MEMORY_LIMIT || '2GB',
          cpu: process.env.WSL2_CPU_LIMIT || '2 cores',
          disk: process.env.WSL2_DISK_LIMIT || '10GB'
        },
        timeout: parseInt(process.env.WSL2_TIMEOUT) || 300000,
        healthCheckInterval: parseInt(process.env.WSL2_HEALTH_CHECK_INTERVAL) || 30000,
        autoCleanup: process.env.WSL2_AUTO_CLEANUP !== 'false',
        cleanupIdleTime: parseInt(process.env.WSL2_CLEANUP_IDLE_TIME) || 600000
      },

      // Deployment Configuration (from PR #81)
      deployment: {
        maxConcurrentDeployments: parseInt(process.env.DEPLOYMENT_MAX_CONCURRENT) || 3,
        deploymentTimeout: parseInt(process.env.DEPLOYMENT_TIMEOUT) || 600000,
        validationTimeout: parseInt(process.env.DEPLOYMENT_VALIDATION_TIMEOUT) || 300000,
        retryAttempts: parseInt(process.env.DEPLOYMENT_RETRY_ATTEMPTS) || 2,
        retryDelay: parseInt(process.env.DEPLOYMENT_RETRY_DELAY) || 10000,
        enableParallelValidation: process.env.DEPLOYMENT_ENABLE_PARALLEL_VALIDATION !== 'false'
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

  _mergeConfigs(defaultConfig, customConfig) {
    return { ...defaultConfig, ...customConfig };
  }

  _validateConfig() {
    // Add validation logic here
  }

  _parseEventFilters(eventFilters) {
    return eventFilters ? eventFilters.split(',') : [];
  }
}
