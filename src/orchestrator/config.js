/**
 * @fileoverview Orchestrator Configuration
 * @description Configuration settings for the task orchestration engine
 */

/**
 * Default orchestrator configuration
 */
export const orchestratorConfig = {
  // Concurrency settings
  concurrency: {
    maxParallelTasks: parseInt(process.env.MAX_PARALLEL_TASKS) || 20,
    maxStageRetries: parseInt(process.env.MAX_STAGE_RETRIES) || 3,
    timeoutMs: parseInt(process.env.TASK_TIMEOUT_MS) || 1800000, // 30 minutes
    queueSize: parseInt(process.env.QUEUE_SIZE) || 100
  },
  
  // Workflow settings
  workflows: {
    defaultTimeout: parseInt(process.env.WORKFLOW_DEFAULT_TIMEOUT) || 600000, // 10 minutes per stage
    retryDelay: parseInt(process.env.WORKFLOW_RETRY_DELAY) || 30000, // 30 seconds
    maxRetries: parseInt(process.env.WORKFLOW_MAX_RETRIES) || 3,
    enableParallelStages: process.env.ENABLE_PARALLEL_STAGES === 'true',
    stageTimeoutMultiplier: parseFloat(process.env.STAGE_TIMEOUT_MULTIPLIER) || 1.5
  },
  
  // AI configuration
  ai: {
    model: process.env.AI_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 4000,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.1,
    enableEnhancement: process.env.AI_ENABLE_ENHANCEMENT !== 'false',
    enableValidation: process.env.AI_ENABLE_VALIDATION !== 'false'
  },
  
  // Monitoring and alerting
  monitoring: {
    metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 30000, // 30 seconds
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000, // 1 minute
    enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
    alertThresholds: {
      failureRate: parseFloat(process.env.ALERT_FAILURE_RATE) || 0.1, // 10%
      avgExecutionTime: parseInt(process.env.ALERT_AVG_EXECUTION_TIME) || 300000, // 5 minutes
      queueDepth: parseInt(process.env.ALERT_QUEUE_DEPTH) || 50,
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE) || 0.8 // 80%
    }
  },
  
  // Database configuration
  database: {
    connectionString: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
    queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
    enableMigrations: process.env.DB_ENABLE_MIGRATIONS !== 'false',
    enableBackups: process.env.DB_ENABLE_BACKUPS === 'true'
  },
  
  // AgentAPI configuration
  agentApi: {
    url: process.env.AGENT_API_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.AGENT_API_TIMEOUT) || 300000, // 5 minutes
    maxRetries: parseInt(process.env.AGENT_API_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.AGENT_API_RETRY_DELAY) || 5000,
    enableStreaming: process.env.AGENT_API_ENABLE_STREAMING !== 'false',
    apiKey: process.env.AGENT_API_KEY
  },
  
  // GitHub integration
  github: {
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
    enableAutoMerge: process.env.GITHUB_ENABLE_AUTO_MERGE === 'true',
    prTemplate: process.env.GITHUB_PR_TEMPLATE
  },
  
  // Security settings
  security: {
    enableAuthentication: process.env.ENABLE_AUTHENTICATION === 'true',
    jwtSecret: process.env.JWT_SECRET,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 3600000, // 1 hour
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },
  
  // Resource management
  resources: {
    maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE) || 1024 * 1024 * 1024, // 1GB
    maxCpuUsage: parseFloat(process.env.MAX_CPU_USAGE) || 0.8, // 80%
    maxDiskUsage: parseFloat(process.env.MAX_DISK_USAGE) || 0.9, // 90%
    enableResourceMonitoring: process.env.ENABLE_RESOURCE_MONITORING !== 'false',
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 3600000 // 1 hour
  },
  
  // Feature flags
  features: {
    enableExperimentalWorkflows: process.env.ENABLE_EXPERIMENTAL_WORKFLOWS === 'true',
    enableAdvancedMetrics: process.env.ENABLE_ADVANCED_METRICS === 'true',
    enableWebhookValidation: process.env.ENABLE_WEBHOOK_VALIDATION !== 'false',
    enableTaskDependencies: process.env.ENABLE_TASK_DEPENDENCIES !== 'false',
    enableParallelExecution: process.env.ENABLE_PARALLEL_EXECUTION !== 'false'
  }
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
  development: {
    monitoring: {
      enableDetailedLogging: true,
      logLevel: 'debug'
    },
    concurrency: {
      maxParallelTasks: 5
    },
    workflows: {
      defaultTimeout: 300000 // 5 minutes
    }
  },
  
  test: {
    monitoring: {
      enableDetailedLogging: false,
      logLevel: 'error'
    },
    concurrency: {
      maxParallelTasks: 2
    },
    workflows: {
      defaultTimeout: 60000 // 1 minute
    },
    agentApi: {
      url: 'http://localhost:3001' // Test instance
    }
  },
  
  staging: {
    monitoring: {
      enableDetailedLogging: true,
      logLevel: 'info'
    },
    concurrency: {
      maxParallelTasks: 10
    },
    workflows: {
      defaultTimeout: 900000 // 15 minutes
    }
  },
  
  production: {
    monitoring: {
      enableDetailedLogging: false,
      logLevel: 'warn'
    },
    concurrency: {
      maxParallelTasks: 50
    },
    workflows: {
      defaultTimeout: 1800000 // 30 minutes
    },
    security: {
      enableAuthentication: true,
      enableRateLimit: true
    },
    features: {
      enableExperimentalWorkflows: false
    }
  }
};

/**
 * Workflow-specific configurations
 */
export const workflowConfigs = {
  default: {
    timeout: 600000, // 10 minutes
    retries: 3,
    stages: ['code_generation', 'pr_creation', 'validation', 'deployment']
  },
  
  hotfix: {
    timeout: 300000, // 5 minutes
    retries: 2,
    priority: 'critical',
    stages: ['code_generation', 'validation', 'pr_creation', 'deployment'],
    fastTrack: true
  },
  
  feature: {
    timeout: 1200000, // 20 minutes
    retries: 3,
    stages: ['analysis', 'code_generation', 'testing', 'pr_creation', 'validation'],
    requiresApproval: true
  },
  
  bugfix: {
    timeout: 600000, // 10 minutes
    retries: 3,
    stages: ['analysis', 'code_generation', 'testing', 'pr_creation', 'validation'],
    requiresTesting: true
  },
  
  refactor: {
    timeout: 1800000, // 30 minutes
    retries: 2,
    stages: ['analysis', 'code_generation', 'testing', 'pr_creation', 'validation'],
    requiresExtensiveTesting: true
  },
  
  experimental: {
    timeout: 900000, // 15 minutes
    retries: 1,
    stages: ['analysis', 'code_generation', 'pr_creation'],
    allowFailure: true
  }
};

/**
 * Stage-specific configurations
 */
export const stageConfigs = {
  analysis: {
    timeout: 300000, // 5 minutes
    retries: 2,
    resources: { cpu: 'low', memory: 'medium' }
  },
  
  code_generation: {
    timeout: 900000, // 15 minutes
    retries: 3,
    resources: { cpu: 'high', memory: 'high' }
  },
  
  testing: {
    timeout: 600000, // 10 minutes
    retries: 2,
    resources: { cpu: 'medium', memory: 'medium' }
  },
  
  pr_creation: {
    timeout: 120000, // 2 minutes
    retries: 3,
    resources: { cpu: 'low', memory: 'low' }
  },
  
  validation: {
    timeout: 600000, // 10 minutes
    retries: 2,
    resources: { cpu: 'medium', memory: 'medium' }
  },
  
  deployment: {
    timeout: 900000, // 15 minutes
    retries: 1,
    resources: { cpu: 'medium', memory: 'medium' }
  }
};

/**
 * Get configuration for current environment
 * @param {string} environment - Environment name
 * @returns {Object} Merged configuration
 */
export function getConfig(environment = process.env.NODE_ENV || 'development') {
  const envConfig = environmentConfigs[environment] || {};
  
  // Deep merge configurations
  return mergeDeep(orchestratorConfig, envConfig);
}

/**
 * Get workflow configuration
 * @param {string} workflowType - Workflow type
 * @returns {Object} Workflow configuration
 */
export function getWorkflowConfig(workflowType = 'default') {
  return workflowConfigs[workflowType] || workflowConfigs.default;
}

/**
 * Get stage configuration
 * @param {string} stageType - Stage type
 * @returns {Object} Stage configuration
 */
export function getStageConfig(stageType) {
  return stageConfigs[stageType] || {
    timeout: 600000,
    retries: 2,
    resources: { cpu: 'medium', memory: 'medium' }
  };
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!config.database?.connectionString) {
    errors.push('Database connection string is required');
  }
  
  if (!config.agentApi?.url) {
    warnings.push('AgentAPI URL not configured, using default');
  }
  
  // Numeric validations
  if (config.concurrency?.maxParallelTasks < 1) {
    errors.push('maxParallelTasks must be at least 1');
  }
  
  if (config.workflows?.defaultTimeout < 10000) {
    warnings.push('defaultTimeout is very low, may cause premature timeouts');
  }
  
  // Security validations
  if (config.security?.enableAuthentication && !config.security?.jwtSecret) {
    errors.push('JWT secret is required when authentication is enabled');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Get configuration value with fallback
 * @param {Object} config - Configuration object
 * @param {string} path - Dot-separated path to value
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Configuration value
 */
export function getConfigValue(config, path, defaultValue = null) {
  const keys = path.split('.');
  let current = config;
  
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
 * Set configuration value
 * @param {Object} config - Configuration object
 * @param {string} path - Dot-separated path to value
 * @param {*} value - Value to set
 */
export function setConfigValue(config, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let current = config;
  
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[lastKey] = value;
}

// Export default configuration
export default orchestratorConfig;

