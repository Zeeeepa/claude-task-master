/**
 * @fileoverview Integration Configuration
 * @description Configuration settings for AgentAPI and Claude Code integration
 */

/**
 * Default AgentAPI configuration
 */
export const agentAPIConfig = {
  agentAPI: {
    baseURL: process.env.AGENTAPI_URL || 'http://localhost:3284',
    timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.AGENTAPI_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.AGENTAPI_RETRY_DELAY) || 1000
  },
  workspace: {
    basePath: process.env.WORKSPACE_BASE_PATH || '/tmp/workspace',
    cleanupAfter: parseInt(process.env.WORKSPACE_CLEANUP_AFTER) || 3600000, // 1 hour
    maxConcurrent: parseInt(process.env.WORKSPACE_MAX_CONCURRENT) || 10,
    maxDiskUsage: parseInt(process.env.WORKSPACE_MAX_DISK_USAGE) || 10 * 1024 * 1024 * 1024 // 10GB
  },
  claude: {
    allowedTools: (process.env.CLAUDE_ALLOWED_TOOLS || 'Bash(git*),Edit,Replace').split(','),
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4000,
    temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.1,
    model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229'
  },
  monitoring: {
    healthCheckInterval: parseInt(process.env.MONITOR_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    performanceReportInterval: parseInt(process.env.MONITOR_PERFORMANCE_REPORT_INTERVAL) || 300000, // 5 minutes
    alertThresholds: {
      errorRate: parseFloat(process.env.MONITOR_ERROR_RATE_THRESHOLD) || 10, // 10%
      responseTime: parseInt(process.env.MONITOR_RESPONSE_TIME_THRESHOLD) || 5000, // 5 seconds
      taskDuration: parseInt(process.env.MONITOR_TASK_DURATION_THRESHOLD) || 300000 // 5 minutes
    }
  },
  errorHandling: {
    enableRetry: process.env.ERROR_HANDLING_ENABLE_RETRY !== 'false',
    enableCircuitBreaker: process.env.ERROR_HANDLING_ENABLE_CIRCUIT_BREAKER !== 'false',
    circuitBreakerThreshold: parseInt(process.env.ERROR_HANDLING_CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.ERROR_HANDLING_CIRCUIT_BREAKER_TIMEOUT) || 60000,
    maxRetries: parseInt(process.env.ERROR_HANDLING_MAX_RETRIES) || 3,
    baseDelay: parseInt(process.env.ERROR_HANDLING_BASE_DELAY) || 1000
  }
};

/**
 * Development configuration
 */
export const developmentConfig = {
  ...agentAPIConfig,
  agentAPI: {
    ...agentAPIConfig.agentAPI,
    baseURL: 'http://localhost:3284',
    timeout: 10000
  },
  workspace: {
    ...agentAPIConfig.workspace,
    basePath: '/tmp/dev-workspace',
    cleanupAfter: 1800000, // 30 minutes
    maxConcurrent: 5
  },
  monitoring: {
    ...agentAPIConfig.monitoring,
    healthCheckInterval: 10000, // 10 seconds
    performanceReportInterval: 60000 // 1 minute
  }
};

/**
 * Production configuration
 */
export const productionConfig = {
  ...agentAPIConfig,
  agentAPI: {
    ...agentAPIConfig.agentAPI,
    timeout: 60000, // 1 minute
    maxRetries: 5
  },
  workspace: {
    ...agentAPIConfig.workspace,
    cleanupAfter: 7200000, // 2 hours
    maxConcurrent: 20,
    maxDiskUsage: 50 * 1024 * 1024 * 1024 // 50GB
  },
  monitoring: {
    ...agentAPIConfig.monitoring,
    healthCheckInterval: 60000, // 1 minute
    performanceReportInterval: 600000, // 10 minutes
    alertThresholds: {
      errorRate: 5, // 5%
      responseTime: 10000, // 10 seconds
      taskDuration: 600000 // 10 minutes
    }
  },
  errorHandling: {
    ...agentAPIConfig.errorHandling,
    circuitBreakerThreshold: 10,
    maxRetries: 5
  }
};

/**
 * Test configuration
 */
export const testConfig = {
  ...agentAPIConfig,
  agentAPI: {
    ...agentAPIConfig.agentAPI,
    baseURL: 'http://localhost:3285', // Different port for testing
    timeout: 5000,
    maxRetries: 1
  },
  workspace: {
    ...agentAPIConfig.workspace,
    basePath: '/tmp/test-workspace',
    cleanupAfter: 300000, // 5 minutes
    maxConcurrent: 2
  },
  monitoring: {
    ...agentAPIConfig.monitoring,
    healthCheckInterval: 5000, // 5 seconds
    performanceReportInterval: 30000, // 30 seconds
    alertThresholds: {
      errorRate: 20, // 20% (more lenient for tests)
      responseTime: 2000, // 2 seconds
      taskDuration: 60000 // 1 minute
    }
  }
};

/**
 * Get configuration based on environment
 * @param {string} environment - Environment name (development, production, test)
 * @returns {Object} Configuration object
 */
export function getConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';
  
  switch (env.toLowerCase()) {
    case 'production':
    case 'prod':
      return productionConfig;
    case 'test':
    case 'testing':
      return testConfig;
    case 'development':
    case 'dev':
    default:
      return developmentConfig;
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

  // Validate AgentAPI configuration
  if (!config.agentAPI) {
    errors.push('AgentAPI configuration is required');
  } else {
    if (!config.agentAPI.baseURL) {
      errors.push('AgentAPI baseURL is required');
    }
    if (config.agentAPI.timeout < 1000) {
      warnings.push('AgentAPI timeout is very low (< 1 second)');
    }
    if (config.agentAPI.maxRetries > 10) {
      warnings.push('AgentAPI maxRetries is very high (> 10)');
    }
  }

  // Validate workspace configuration
  if (!config.workspace) {
    errors.push('Workspace configuration is required');
  } else {
    if (!config.workspace.basePath) {
      errors.push('Workspace basePath is required');
    }
    if (config.workspace.maxConcurrent < 1) {
      errors.push('Workspace maxConcurrent must be at least 1');
    }
    if (config.workspace.cleanupAfter < 60000) {
      warnings.push('Workspace cleanupAfter is very low (< 1 minute)');
    }
  }

  // Validate Claude configuration
  if (!config.claude) {
    errors.push('Claude configuration is required');
  } else {
    if (!Array.isArray(config.claude.allowedTools)) {
      errors.push('Claude allowedTools must be an array');
    }
    if (config.claude.maxTokens < 100) {
      warnings.push('Claude maxTokens is very low (< 100)');
    }
    if (config.claude.temperature < 0 || config.claude.temperature > 2) {
      warnings.push('Claude temperature should be between 0 and 2');
    }
  }

  // Validate monitoring configuration
  if (config.monitoring) {
    if (config.monitoring.healthCheckInterval < 5000) {
      warnings.push('Monitoring healthCheckInterval is very low (< 5 seconds)');
    }
    if (config.monitoring.alertThresholds) {
      const thresholds = config.monitoring.alertThresholds;
      if (thresholds.errorRate < 0 || thresholds.errorRate > 100) {
        errors.push('Error rate threshold must be between 0 and 100');
      }
      if (thresholds.responseTime < 100) {
        warnings.push('Response time threshold is very low (< 100ms)');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Merge configurations
 * @param {Object} baseConfig - Base configuration
 * @param {Object} overrideConfig - Override configuration
 * @returns {Object} Merged configuration
 */
export function mergeConfig(baseConfig, overrideConfig) {
  const merged = JSON.parse(JSON.stringify(baseConfig)); // Deep clone
  
  function deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  
  deepMerge(merged, overrideConfig);
  return merged;
}

/**
 * Configuration presets for common scenarios
 */
export const configPresets = {
  // High performance configuration
  highPerformance: {
    agentAPI: {
      timeout: 120000, // 2 minutes
      maxRetries: 5
    },
    workspace: {
      maxConcurrent: 50,
      maxDiskUsage: 100 * 1024 * 1024 * 1024 // 100GB
    },
    monitoring: {
      healthCheckInterval: 15000, // 15 seconds
      performanceReportInterval: 300000 // 5 minutes
    }
  },

  // Low resource configuration
  lowResource: {
    agentAPI: {
      timeout: 15000, // 15 seconds
      maxRetries: 2
    },
    workspace: {
      maxConcurrent: 3,
      cleanupAfter: 900000, // 15 minutes
      maxDiskUsage: 2 * 1024 * 1024 * 1024 // 2GB
    },
    monitoring: {
      healthCheckInterval: 60000, // 1 minute
      performanceReportInterval: 900000 // 15 minutes
    }
  },

  // Debug configuration
  debug: {
    agentAPI: {
      timeout: 300000, // 5 minutes (for debugging)
      maxRetries: 1
    },
    monitoring: {
      healthCheckInterval: 5000, // 5 seconds
      performanceReportInterval: 30000 // 30 seconds
    },
    errorHandling: {
      enableRetry: false // Disable retries for debugging
    }
  }
};

export default {
  agentAPIConfig,
  developmentConfig,
  productionConfig,
  testConfig,
  getConfig,
  validateConfig,
  mergeConfig,
  configPresets
};

