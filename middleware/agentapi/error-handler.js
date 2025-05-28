/**
 * Error Handler
 * 
 * Centralized error handling and recovery for the AgentAPI middleware
 * Provides error classification, logging, and recovery strategies
 */

import { EventEmitter } from 'events';

export class ErrorHandler extends EventEmitter {
  constructor() {
    super();
    
    this.errorCounts = new Map();
    this.errorPatterns = new Map();
    this.recoveryStrategies = new Map();
    
    this.initializeErrorPatterns();
    this.initializeRecoveryStrategies();
  }

  initializeErrorPatterns() {
    // Agent-specific error patterns
    this.errorPatterns.set('agent_not_found', {
      pattern: /agent.*not found|no agent.*found/i,
      category: 'agent',
      severity: 'medium',
      recoverable: true,
    });

    this.errorPatterns.set('agent_timeout', {
      pattern: /timeout|timed out|no response/i,
      category: 'agent',
      severity: 'high',
      recoverable: true,
    });

    this.errorPatterns.set('agent_crash', {
      pattern: /crashed|segmentation fault|core dumped/i,
      category: 'agent',
      severity: 'critical',
      recoverable: true,
    });

    // Git/Repository errors
    this.errorPatterns.set('git_clone_failed', {
      pattern: /git clone.*failed|repository not found|permission denied/i,
      category: 'git',
      severity: 'high',
      recoverable: false,
    });

    this.errorPatterns.set('git_checkout_failed', {
      pattern: /git checkout.*failed|branch.*not found/i,
      category: 'git',
      severity: 'medium',
      recoverable: true,
    });

    // Build/Dependency errors
    this.errorPatterns.set('dependency_install_failed', {
      pattern: /npm install.*failed|yarn install.*failed|pip install.*failed/i,
      category: 'dependencies',
      severity: 'medium',
      recoverable: true,
    });

    this.errorPatterns.set('build_failed', {
      pattern: /build.*failed|compilation.*failed|syntax error/i,
      category: 'build',
      severity: 'medium',
      recoverable: false,
    });

    // Network/API errors
    this.errorPatterns.set('network_error', {
      pattern: /network error|connection refused|timeout|ENOTFOUND/i,
      category: 'network',
      severity: 'medium',
      recoverable: true,
    });

    this.errorPatterns.set('api_key_invalid', {
      pattern: /invalid api key|unauthorized|authentication failed/i,
      category: 'auth',
      severity: 'critical',
      recoverable: false,
    });

    // Resource errors
    this.errorPatterns.set('disk_space_full', {
      pattern: /no space left|disk full|ENOSPC/i,
      category: 'resources',
      severity: 'critical',
      recoverable: true,
    });

    this.errorPatterns.set('memory_error', {
      pattern: /out of memory|memory allocation failed|ENOMEM/i,
      category: 'resources',
      severity: 'critical',
      recoverable: true,
    });
  }

  initializeRecoveryStrategies() {
    // Agent recovery strategies
    this.recoveryStrategies.set('agent_not_found', {
      strategy: 'restart_agent',
      maxRetries: 3,
      backoffMs: 5000,
    });

    this.recoveryStrategies.set('agent_timeout', {
      strategy: 'restart_agent',
      maxRetries: 2,
      backoffMs: 10000,
    });

    this.recoveryStrategies.set('agent_crash', {
      strategy: 'restart_agent',
      maxRetries: 1,
      backoffMs: 15000,
    });

    // Git recovery strategies
    this.recoveryStrategies.set('git_checkout_failed', {
      strategy: 'retry_with_force',
      maxRetries: 2,
      backoffMs: 2000,
    });

    // Dependency recovery strategies
    this.recoveryStrategies.set('dependency_install_failed', {
      strategy: 'retry_with_clean',
      maxRetries: 2,
      backoffMs: 5000,
    });

    // Network recovery strategies
    this.recoveryStrategies.set('network_error', {
      strategy: 'exponential_backoff',
      maxRetries: 5,
      backoffMs: 1000,
    });

    // Resource recovery strategies
    this.recoveryStrategies.set('disk_space_full', {
      strategy: 'cleanup_workspace',
      maxRetries: 1,
      backoffMs: 0,
    });

    this.recoveryStrategies.set('memory_error', {
      strategy: 'restart_with_limits',
      maxRetries: 1,
      backoffMs: 5000,
    });
  }

  handleError(error, context = {}) {
    const errorInfo = this.classifyError(error);
    const errorId = this.generateErrorId();
    
    const errorResponse = {
      id: errorId,
      timestamp: new Date().toISOString(),
      message: error.message || 'Unknown error',
      type: errorInfo.type,
      category: errorInfo.category,
      severity: errorInfo.severity,
      recoverable: errorInfo.recoverable,
      context,
      stack: error.stack,
    };

    // Track error frequency
    this.trackError(errorInfo.type);

    // Log error
    this.logError(errorResponse);

    // Emit error event for monitoring
    this.emit('error', errorResponse);

    // Determine HTTP status code
    errorResponse.status = this.getHttpStatusCode(errorInfo);

    // Add recovery suggestion if applicable
    if (errorInfo.recoverable) {
      errorResponse.recovery = this.getRecoveryStrategy(errorInfo.type);
    }

    return errorResponse;
  }

  classifyError(error) {
    const message = error.message || error.toString();
    
    // Check against known patterns
    for (const [type, pattern] of this.errorPatterns) {
      if (pattern.pattern.test(message)) {
        return {
          type,
          category: pattern.category,
          severity: pattern.severity,
          recoverable: pattern.recoverable,
        };
      }
    }

    // Default classification for unknown errors
    return {
      type: 'unknown',
      category: 'general',
      severity: 'medium',
      recoverable: false,
    };
  }

  trackError(errorType) {
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
  }

  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getHttpStatusCode(errorInfo) {
    const statusMap = {
      auth: 401,
      network: 503,
      resources: 507,
      agent: 502,
      git: 422,
      dependencies: 422,
      build: 422,
      general: 500,
    };

    return statusMap[errorInfo.category] || 500;
  }

  getRecoveryStrategy(errorType) {
    const strategy = this.recoveryStrategies.get(errorType);
    if (!strategy) {
      return null;
    }

    return {
      strategy: strategy.strategy,
      maxRetries: strategy.maxRetries,
      backoffMs: strategy.backoffMs,
      description: this.getRecoveryDescription(strategy.strategy),
    };
  }

  getRecoveryDescription(strategyType) {
    const descriptions = {
      restart_agent: 'Restart the agent process',
      retry_with_force: 'Retry the operation with force flag',
      retry_with_clean: 'Clean cache and retry the operation',
      exponential_backoff: 'Retry with exponential backoff',
      cleanup_workspace: 'Clean up workspace to free resources',
      restart_with_limits: 'Restart with resource limits',
    };

    return descriptions[strategyType] || 'Generic retry strategy';
  }

  logError(errorResponse) {
    const logLevel = this.getLogLevel(errorResponse.severity);
    const logMessage = `[${errorResponse.id}] ${errorResponse.category.toUpperCase()}: ${errorResponse.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }

    // Log additional context if available
    if (errorResponse.context && Object.keys(errorResponse.context).length > 0) {
      console.log(`[${errorResponse.id}] Context:`, errorResponse.context);
    }
  }

  getLogLevel(severity) {
    const levelMap = {
      critical: 'error',
      high: 'error',
      medium: 'warn',
      low: 'log',
    };

    return levelMap[severity] || 'log';
  }

  // Recovery execution methods
  async executeRecovery(errorType, context = {}) {
    const strategy = this.recoveryStrategies.get(errorType);
    if (!strategy) {
      throw new Error(`No recovery strategy found for error type: ${errorType}`);
    }

    const recoveryId = this.generateErrorId();
    
    try {
      this.emit('recoveryStarted', { recoveryId, errorType, strategy });
      
      const result = await this.executeRecoveryStrategy(strategy.strategy, context);
      
      this.emit('recoveryCompleted', { recoveryId, errorType, result });
      return result;
      
    } catch (error) {
      this.emit('recoveryFailed', { recoveryId, errorType, error });
      throw error;
    }
  }

  async executeRecoveryStrategy(strategyType, context) {
    switch (strategyType) {
      case 'restart_agent':
        return await this.restartAgent(context);
      
      case 'retry_with_force':
        return await this.retryWithForce(context);
      
      case 'retry_with_clean':
        return await this.retryWithClean(context);
      
      case 'exponential_backoff':
        return await this.exponentialBackoff(context);
      
      case 'cleanup_workspace':
        return await this.cleanupWorkspace(context);
      
      case 'restart_with_limits':
        return await this.restartWithLimits(context);
      
      default:
        throw new Error(`Unknown recovery strategy: ${strategyType}`);
    }
  }

  async restartAgent(context) {
    const { agentManager, agentType, workspaceId } = context;
    
    if (!agentManager) {
      throw new Error('Agent manager not provided in context');
    }

    // Stop the agent if it's running
    try {
      await agentManager.stopAgent(agentType, workspaceId);
    } catch (error) {
      // Agent might already be stopped
    }

    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start the agent again
    return await agentManager.startAgent(agentType, workspaceId);
  }

  async retryWithForce(context) {
    const { operation, args = [] } = context;
    
    if (!operation) {
      throw new Error('Operation not provided in context');
    }

    // Add force flag to arguments
    const forceArgs = [...args, '--force'];
    return await operation(...forceArgs);
  }

  async retryWithClean(context) {
    const { operation, args = [], cleanupOperation } = context;
    
    if (!operation) {
      throw new Error('Operation not provided in context');
    }

    // Run cleanup if provided
    if (cleanupOperation) {
      await cleanupOperation();
    }

    // Retry the original operation
    return await operation(...args);
  }

  async exponentialBackoff(context) {
    const { operation, args = [], maxRetries = 5, baseDelayMs = 1000 } = context;
    
    if (!operation) {
      throw new Error('Operation not provided in context');
    }

    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async cleanupWorkspace(context) {
    const { workspaceId, prDeploymentService } = context;
    
    if (!prDeploymentService) {
      throw new Error('PR deployment service not provided in context');
    }

    return await prDeploymentService.cleanupWorkspace(workspaceId);
  }

  async restartWithLimits(context) {
    const { agentManager, agentType, workspaceId, memoryLimit, cpuLimit } = context;
    
    if (!agentManager) {
      throw new Error('Agent manager not provided in context');
    }

    // Stop the agent
    try {
      await agentManager.stopAgent(agentType, workspaceId);
    } catch (error) {
      // Agent might already be stopped
    }

    // Start with resource limits
    const config = {
      memoryLimit: memoryLimit || '512m',
      cpuLimit: cpuLimit || '0.5',
    };

    return await agentManager.startAgent(agentType, workspaceId, config);
  }

  // Error statistics and monitoring
  getErrorStatistics() {
    const stats = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      errorsBySeverity: {},
    };

    for (const [errorType, count] of this.errorCounts) {
      stats.totalErrors += count;
      stats.errorsByType[errorType] = count;

      const pattern = this.errorPatterns.get(errorType);
      if (pattern) {
        stats.errorsByCategory[pattern.category] = 
          (stats.errorsByCategory[pattern.category] || 0) + count;
        stats.errorsBySeverity[pattern.severity] = 
          (stats.errorsBySeverity[pattern.severity] || 0) + count;
      }
    }

    return stats;
  }

  resetErrorCounts() {
    this.errorCounts.clear();
    this.emit('errorCountsReset');
  }

  // Health check for error handler
  getHealthStatus() {
    const stats = this.getErrorStatistics();
    const criticalErrors = stats.errorsBySeverity.critical || 0;
    const highErrors = stats.errorsBySeverity.high || 0;
    
    let status = 'healthy';
    if (criticalErrors > 0) {
      status = 'critical';
    } else if (highErrors > 5) {
      status = 'degraded';
    } else if (stats.totalErrors > 20) {
      status = 'warning';
    }

    return {
      status,
      totalErrors: stats.totalErrors,
      criticalErrors,
      highErrors,
      timestamp: new Date().toISOString(),
    };
  }
}

