/**
 * auto-recovery-orchestrator.js
 * Automated failure detection and recovery workflows
 * Implements self-healing capabilities and graceful degradation
 */

import { CIRCUIT_STATES } from '../core/circuit-breaker.js';
import { ERROR_CATEGORIES, RECOVERY_STRATEGIES } from '../core/error-classifier.js';

// Recovery action types
export const RECOVERY_ACTIONS = {
  RESTART_SERVICE: 'restart_service',
  CLEAR_CACHE: 'clear_cache',
  RESET_CIRCUIT: 'reset_circuit',
  SCALE_RESOURCES: 'scale_resources',
  SWITCH_PROVIDER: 'switch_provider',
  ENABLE_FALLBACK: 'enable_fallback',
  NOTIFY_ADMIN: 'notify_admin'
};

// Recovery trigger conditions
export const RECOVERY_TRIGGERS = {
  CIRCUIT_OPEN: 'circuit_open',
  HIGH_ERROR_RATE: 'high_error_rate',
  CONSECUTIVE_FAILURES: 'consecutive_failures',
  RESOURCE_EXHAUSTION: 'resource_exhaustion',
  TIMEOUT_THRESHOLD: 'timeout_threshold'
};

/**
 * Auto-recovery orchestrator for automated failure detection and recovery
 */
export class AutoRecoveryOrchestrator {
  constructor(config = {}) {
    this.config = {
      enableAutoRecovery: true,
      recoveryInterval: 30000, // 30 seconds
      maxRecoveryAttempts: 3,
      errorRateThreshold: 0.5, // 50% error rate
      consecutiveFailureThreshold: 5,
      ...config
    };

    this.logger = config.logger;
    this.circuitBreakerRegistry = config.circuitBreakerRegistry;
    
    this.recoveryHistory = new Map();
    this.activeRecoveries = new Map();
    this.recoveryRules = new Map();
    this.monitoringInterval = null;
    
    this._initializeDefaultRules();
    this._startMonitoring();
  }

  /**
   * Initialize default recovery rules
   */
  _initializeDefaultRules() {
    // Circuit breaker recovery
    this.addRecoveryRule({
      id: 'circuit_breaker_recovery',
      trigger: RECOVERY_TRIGGERS.CIRCUIT_OPEN,
      condition: (context) => context.circuitState === CIRCUIT_STATES.OPEN,
      actions: [
        {
          type: RECOVERY_ACTIONS.RESET_CIRCUIT,
          delay: 60000, // Wait 1 minute before reset
          maxAttempts: 3
        },
        {
          type: RECOVERY_ACTIONS.ENABLE_FALLBACK,
          delay: 0,
          maxAttempts: 1
        }
      ],
      cooldown: 300000 // 5 minutes between recovery attempts
    });

    // High error rate recovery
    this.addRecoveryRule({
      id: 'high_error_rate_recovery',
      trigger: RECOVERY_TRIGGERS.HIGH_ERROR_RATE,
      condition: (context) => context.errorRate > this.config.errorRateThreshold,
      actions: [
        {
          type: RECOVERY_ACTIONS.CLEAR_CACHE,
          delay: 0,
          maxAttempts: 1
        },
        {
          type: RECOVERY_ACTIONS.SWITCH_PROVIDER,
          delay: 5000,
          maxAttempts: 2
        },
        {
          type: RECOVERY_ACTIONS.NOTIFY_ADMIN,
          delay: 30000,
          maxAttempts: 1
        }
      ],
      cooldown: 600000 // 10 minutes
    });

    // Consecutive failures recovery
    this.addRecoveryRule({
      id: 'consecutive_failures_recovery',
      trigger: RECOVERY_TRIGGERS.CONSECUTIVE_FAILURES,
      condition: (context) => context.consecutiveFailures >= this.config.consecutiveFailureThreshold,
      actions: [
        {
          type: RECOVERY_ACTIONS.RESTART_SERVICE,
          delay: 10000,
          maxAttempts: 2
        },
        {
          type: RECOVERY_ACTIONS.SCALE_RESOURCES,
          delay: 30000,
          maxAttempts: 1
        }
      ],
      cooldown: 900000 // 15 minutes
    });
  }

  /**
   * Add a recovery rule
   * @param {Object} rule - Recovery rule configuration
   */
  addRecoveryRule(rule) {
    this.recoveryRules.set(rule.id, {
      ...rule,
      createdAt: Date.now(),
      executionCount: 0,
      lastExecution: null
    });
  }

  /**
   * Start monitoring for recovery triggers
   */
  _startMonitoring() {
    if (!this.config.enableAutoRecovery) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this._checkRecoveryTriggers();
    }, this.config.recoveryInterval);

    this.logger?.info('Auto-recovery monitoring started', {
      interval: this.config.recoveryInterval,
      rulesCount: this.recoveryRules.size
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger?.info('Auto-recovery monitoring stopped');
  }

  /**
   * Check for recovery triggers
   */
  async _checkRecoveryTriggers() {
    try {
      // Get system health context
      const context = await this._gatherSystemContext();
      
      // Check each recovery rule
      for (const [ruleId, rule] of this.recoveryRules) {
        if (this._shouldTriggerRecovery(rule, context)) {
          await this._executeRecovery(rule, context);
        }
      }
    } catch (error) {
      this.logger?.error('Error during recovery trigger check', { error });
    }
  }

  /**
   * Gather system context for recovery decisions
   * @returns {Object} System context
   */
  async _gatherSystemContext() {
    const context = {
      timestamp: Date.now(),
      circuitBreakers: {},
      errorMetrics: {},
      systemHealth: {}
    };

    // Gather circuit breaker states
    if (this.circuitBreakerRegistry) {
      const circuitStats = this.circuitBreakerRegistry.getAllStats();
      context.circuitBreakers = {
        total: circuitStats.length,
        open: circuitStats.filter(s => s.state === CIRCUIT_STATES.OPEN).length,
        halfOpen: circuitStats.filter(s => s.state === CIRCUIT_STATES.HALF_OPEN).length,
        stats: circuitStats
      };
    }

    // Gather error metrics
    if (this.logger?.getErrorMetrics) {
      context.errorMetrics = this.logger.getErrorMetrics();
      context.errorRate = this._calculateErrorRate(context.errorMetrics);
    }

    // Calculate consecutive failures
    context.consecutiveFailures = this._calculateConsecutiveFailures();

    return context;
  }

  /**
   * Calculate current error rate
   * @param {Object} errorMetrics - Error metrics
   * @returns {number} Error rate (0-1)
   */
  _calculateErrorRate(errorMetrics) {
    const totalErrors = errorMetrics.totalErrors || 0;
    const totalRequests = totalErrors + (errorMetrics.totalSuccesses || 0);
    
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  /**
   * Calculate consecutive failures from recent logs
   * @returns {number} Number of consecutive failures
   */
  _calculateConsecutiveFailures() {
    if (!this.logger?.getRecentLogs) {
      return 0;
    }

    const recentLogs = this.logger.getRecentLogs(50, 'error');
    let consecutiveCount = 0;
    
    // Count consecutive errors from most recent
    for (let i = recentLogs.length - 1; i >= 0; i--) {
      const log = recentLogs[i];
      if (log.level === 'error') {
        consecutiveCount++;
      } else {
        break; // Stop at first non-error
      }
    }
    
    return consecutiveCount;
  }

  /**
   * Check if recovery should be triggered for a rule
   * @param {Object} rule - Recovery rule
   * @param {Object} context - System context
   * @returns {boolean} Whether to trigger recovery
   */
  _shouldTriggerRecovery(rule, context) {
    // Check cooldown period
    if (rule.lastExecution && 
        (Date.now() - rule.lastExecution) < rule.cooldown) {
      return false;
    }

    // Check if already recovering
    if (this.activeRecoveries.has(rule.id)) {
      return false;
    }

    // Check rule condition
    try {
      return rule.condition(context);
    } catch (error) {
      this.logger?.error(`Error evaluating recovery rule condition: ${rule.id}`, { error });
      return false;
    }
  }

  /**
   * Execute recovery actions for a rule
   * @param {Object} rule - Recovery rule
   * @param {Object} context - System context
   */
  async _executeRecovery(rule, context) {
    const recoveryId = `${rule.id}_${Date.now()}`;
    
    this.activeRecoveries.set(rule.id, {
      recoveryId,
      startTime: Date.now(),
      rule,
      context,
      actionsCompleted: 0,
      status: 'running'
    });

    this.logger?.info(`Starting recovery: ${rule.id}`, {
      recoveryId,
      trigger: rule.trigger,
      actionsCount: rule.actions.length
    });

    try {
      // Execute recovery actions sequentially
      for (let i = 0; i < rule.actions.length; i++) {
        const action = rule.actions[i];
        
        // Wait for action delay
        if (action.delay > 0) {
          await this._delay(action.delay);
        }

        // Execute action
        await this._executeRecoveryAction(action, context, recoveryId);
        
        // Update progress
        const recovery = this.activeRecoveries.get(rule.id);
        if (recovery) {
          recovery.actionsCompleted = i + 1;
        }
      }

      // Mark recovery as successful
      this._completeRecovery(rule.id, 'success');
      
    } catch (error) {
      this.logger?.error(`Recovery failed: ${rule.id}`, { 
        recoveryId, 
        error: error.message 
      });
      
      this._completeRecovery(rule.id, 'failed', error);
    }
  }

  /**
   * Execute a specific recovery action
   * @param {Object} action - Recovery action
   * @param {Object} context - System context
   * @param {string} recoveryId - Recovery ID
   */
  async _executeRecoveryAction(action, context, recoveryId) {
    this.logger?.info(`Executing recovery action: ${action.type}`, { 
      recoveryId,
      action: action.type 
    });

    switch (action.type) {
      case RECOVERY_ACTIONS.RESET_CIRCUIT:
        await this._resetCircuitBreakers(context);
        break;
        
      case RECOVERY_ACTIONS.CLEAR_CACHE:
        await this._clearCache(context);
        break;
        
      case RECOVERY_ACTIONS.RESTART_SERVICE:
        await this._restartService(context);
        break;
        
      case RECOVERY_ACTIONS.SCALE_RESOURCES:
        await this._scaleResources(context);
        break;
        
      case RECOVERY_ACTIONS.SWITCH_PROVIDER:
        await this._switchProvider(context);
        break;
        
      case RECOVERY_ACTIONS.ENABLE_FALLBACK:
        await this._enableFallback(context);
        break;
        
      case RECOVERY_ACTIONS.NOTIFY_ADMIN:
        await this._notifyAdmin(context, recoveryId);
        break;
        
      default:
        throw new Error(`Unknown recovery action: ${action.type}`);
    }
  }

  /**
   * Reset circuit breakers
   * @param {Object} context - System context
   */
  async _resetCircuitBreakers(context) {
    if (this.circuitBreakerRegistry) {
      const openCircuits = context.circuitBreakers.stats
        .filter(s => s.state === CIRCUIT_STATES.OPEN);
      
      for (const circuit of openCircuits) {
        const breaker = this.circuitBreakerRegistry.getBreaker(circuit.name);
        breaker.reset();
        
        this.logger?.info(`Reset circuit breaker: ${circuit.name}`);
      }
    }
  }

  /**
   * Clear cache (placeholder implementation)
   * @param {Object} context - System context
   */
  async _clearCache(context) {
    // TODO: Implement cache clearing logic
    this.logger?.info('Cache cleared (placeholder)');
  }

  /**
   * Restart service (placeholder implementation)
   * @param {Object} context - System context
   */
  async _restartService(context) {
    // TODO: Implement service restart logic
    this.logger?.info('Service restart initiated (placeholder)');
  }

  /**
   * Scale resources (placeholder implementation)
   * @param {Object} context - System context
   */
  async _scaleResources(context) {
    // TODO: Implement resource scaling logic
    this.logger?.info('Resource scaling initiated (placeholder)');
  }

  /**
   * Switch provider (placeholder implementation)
   * @param {Object} context - System context
   */
  async _switchProvider(context) {
    // TODO: Implement provider switching logic
    this.logger?.info('Provider switch initiated (placeholder)');
  }

  /**
   * Enable fallback (placeholder implementation)
   * @param {Object} context - System context
   */
  async _enableFallback(context) {
    // TODO: Implement fallback enabling logic
    this.logger?.info('Fallback enabled (placeholder)');
  }

  /**
   * Notify admin (placeholder implementation)
   * @param {Object} context - System context
   * @param {string} recoveryId - Recovery ID
   */
  async _notifyAdmin(context, recoveryId) {
    // TODO: Implement admin notification logic
    this.logger?.warn('Admin notification sent (placeholder)', { 
      recoveryId,
      context: {
        errorRate: context.errorRate,
        openCircuits: context.circuitBreakers.open
      }
    });
  }

  /**
   * Complete a recovery process
   * @param {string} ruleId - Rule ID
   * @param {string} status - Recovery status
   * @param {Error} error - Error if failed
   */
  _completeRecovery(ruleId, status, error = null) {
    const recovery = this.activeRecoveries.get(ruleId);
    if (!recovery) return;

    const duration = Date.now() - recovery.startTime;
    
    // Update rule execution history
    const rule = this.recoveryRules.get(ruleId);
    if (rule) {
      rule.executionCount++;
      rule.lastExecution = Date.now();
    }

    // Store recovery history
    this.recoveryHistory.set(recovery.recoveryId, {
      ...recovery,
      status,
      duration,
      error: error?.message,
      completedAt: Date.now()
    });

    // Remove from active recoveries
    this.activeRecoveries.delete(ruleId);

    this.logger?.info(`Recovery completed: ${ruleId}`, {
      recoveryId: recovery.recoveryId,
      status,
      duration,
      actionsCompleted: recovery.actionsCompleted
    });
  }

  /**
   * Create a delay promise
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get recovery statistics
   * @returns {Object} Recovery statistics
   */
  getStats() {
    const activeRecoveries = Array.from(this.activeRecoveries.values());
    const recentHistory = Array.from(this.recoveryHistory.values())
      .filter(h => (Date.now() - h.completedAt) < 86400000) // Last 24 hours
      .sort((a, b) => b.completedAt - a.completedAt);

    return {
      activeRecoveries: activeRecoveries.length,
      totalRules: this.recoveryRules.size,
      recentRecoveries: recentHistory.length,
      successfulRecoveries: recentHistory.filter(h => h.status === 'success').length,
      failedRecoveries: recentHistory.filter(h => h.status === 'failed').length,
      averageRecoveryTime: this._calculateAverageRecoveryTime(recentHistory),
      activeRecoveryDetails: activeRecoveries,
      recentRecoveryHistory: recentHistory.slice(0, 10) // Last 10 recoveries
    };
  }

  /**
   * Calculate average recovery time
   * @param {Array} recoveries - Recovery history
   * @returns {number} Average time in milliseconds
   */
  _calculateAverageRecoveryTime(recoveries) {
    if (recoveries.length === 0) return 0;
    
    const totalTime = recoveries.reduce((sum, r) => sum + (r.duration || 0), 0);
    return Math.round(totalTime / recoveries.length);
  }

  /**
   * Reset recovery state
   */
  reset() {
    this.activeRecoveries.clear();
    this.recoveryHistory.clear();
    
    // Reset rule execution counts
    for (const rule of this.recoveryRules.values()) {
      rule.executionCount = 0;
      rule.lastExecution = null;
    }
  }

  /**
   * Destroy the orchestrator
   */
  destroy() {
    this.stopMonitoring();
    this.reset();
  }
}

export default AutoRecoveryOrchestrator;

