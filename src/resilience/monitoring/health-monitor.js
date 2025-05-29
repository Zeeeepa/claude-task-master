/**
 * health-monitor.js
 * Health monitoring and self-healing capabilities
 * Provides comprehensive system health tracking and metrics
 */

// Health status levels
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  DOWN: 'down'
};

// Health check types
export const HEALTH_CHECK_TYPES = {
  CIRCUIT_BREAKER: 'circuit_breaker',
  ERROR_RATE: 'error_rate',
  RESPONSE_TIME: 'response_time',
  RESOURCE_USAGE: 'resource_usage',
  DEPENDENCY: 'dependency',
  CUSTOM: 'custom'
};

/**
 * Health monitor for tracking system health and performance
 */
export class HealthMonitor {
  constructor(config = {}) {
    this.config = {
      checkInterval: 30000, // 30 seconds
      healthHistorySize: 100,
      alertThresholds: {
        errorRate: 0.1, // 10%
        responseTime: 5000, // 5 seconds
        circuitOpenCount: 3
      },
      enableAlerts: true,
      ...config
    };

    this.logger = config.logger;
    this.circuitBreakerRegistry = config.circuitBreakerRegistry;
    
    this.healthChecks = new Map();
    this.healthHistory = [];
    this.currentHealth = {
      status: HEALTH_STATUS.HEALTHY,
      timestamp: Date.now(),
      checks: {},
      metrics: {}
    };
    
    this.monitoringInterval = null;
    this.alertCallbacks = new Set();
    
    this._initializeDefaultChecks();
    this._startMonitoring();
  }

  /**
   * Initialize default health checks
   */
  _initializeDefaultChecks() {
    // Circuit breaker health check
    this.addHealthCheck({
      id: 'circuit_breakers',
      type: HEALTH_CHECK_TYPES.CIRCUIT_BREAKER,
      name: 'Circuit Breaker Health',
      check: () => this._checkCircuitBreakers(),
      interval: 30000,
      timeout: 5000,
      enabled: true
    });

    // Error rate health check
    this.addHealthCheck({
      id: 'error_rate',
      type: HEALTH_CHECK_TYPES.ERROR_RATE,
      name: 'Error Rate Monitor',
      check: () => this._checkErrorRate(),
      interval: 60000,
      timeout: 5000,
      enabled: true
    });

    // Response time health check
    this.addHealthCheck({
      id: 'response_time',
      type: HEALTH_CHECK_TYPES.RESPONSE_TIME,
      name: 'Response Time Monitor',
      check: () => this._checkResponseTime(),
      interval: 45000,
      timeout: 5000,
      enabled: true
    });

    // Resource usage health check
    this.addHealthCheck({
      id: 'resource_usage',
      type: HEALTH_CHECK_TYPES.RESOURCE_USAGE,
      name: 'Resource Usage Monitor',
      check: () => this._checkResourceUsage(),
      interval: 120000, // 2 minutes
      timeout: 10000,
      enabled: true
    });
  }

  /**
   * Add a health check
   * @param {Object} healthCheck - Health check configuration
   */
  addHealthCheck(healthCheck) {
    const check = {
      ...healthCheck,
      lastRun: null,
      lastResult: null,
      consecutiveFailures: 0,
      totalRuns: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      createdAt: Date.now()
    };

    this.healthChecks.set(healthCheck.id, check);
    
    this.logger?.info(`Health check added: ${healthCheck.name}`, {
      id: healthCheck.id,
      type: healthCheck.type,
      interval: healthCheck.interval
    });
  }

  /**
   * Remove a health check
   * @param {string} id - Health check ID
   */
  removeHealthCheck(id) {
    if (this.healthChecks.delete(id)) {
      this.logger?.info(`Health check removed: ${id}`);
    }
  }

  /**
   * Start health monitoring
   */
  _startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this._runHealthChecks();
    }, this.config.checkInterval);

    this.logger?.info('Health monitoring started', {
      interval: this.config.checkInterval,
      checksCount: this.healthChecks.size
    });
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger?.info('Health monitoring stopped');
  }

  /**
   * Run all enabled health checks
   */
  async _runHealthChecks() {
    const checkResults = {};
    const startTime = Date.now();

    for (const [id, healthCheck] of this.healthChecks) {
      if (!healthCheck.enabled) {
        continue;
      }

      // Check if it's time to run this check
      if (healthCheck.lastRun && 
          (Date.now() - healthCheck.lastRun) < healthCheck.interval) {
        // Use last result
        checkResults[id] = healthCheck.lastResult;
        continue;
      }

      try {
        const result = await this._runSingleHealthCheck(healthCheck);
        checkResults[id] = result;
        
        // Update health check state
        healthCheck.lastRun = Date.now();
        healthCheck.lastResult = result;
        healthCheck.totalRuns++;
        
        if (result.status === HEALTH_STATUS.HEALTHY) {
          healthCheck.consecutiveFailures = 0;
        } else {
          healthCheck.consecutiveFailures++;
          healthCheck.totalFailures++;
        }
        
        // Update average response time
        if (result.responseTime) {
          healthCheck.averageResponseTime = 
            (healthCheck.averageResponseTime * (healthCheck.totalRuns - 1) + result.responseTime) / 
            healthCheck.totalRuns;
        }
        
      } catch (error) {
        this.logger?.error(`Health check failed: ${id}`, { error: error.message });
        
        checkResults[id] = {
          status: HEALTH_STATUS.CRITICAL,
          message: `Health check error: ${error.message}`,
          timestamp: Date.now(),
          error: error.message
        };
        
        healthCheck.consecutiveFailures++;
        healthCheck.totalFailures++;
      }
    }

    // Update overall health status
    this._updateOverallHealth(checkResults, Date.now() - startTime);
  }

  /**
   * Run a single health check with timeout
   * @param {Object} healthCheck - Health check to run
   * @returns {Promise<Object>} Health check result
   */
  async _runSingleHealthCheck(healthCheck) {
    const startTime = Date.now();
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Health check timeout: ${healthCheck.id}`));
      }, healthCheck.timeout);

      try {
        const result = await healthCheck.check();
        clearTimeout(timeoutId);
        
        const responseTime = Date.now() - startTime;
        resolve({
          ...result,
          responseTime,
          timestamp: Date.now()
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Check circuit breaker health
   * @returns {Object} Health check result
   */
  _checkCircuitBreakers() {
    if (!this.circuitBreakerRegistry) {
      return {
        status: HEALTH_STATUS.HEALTHY,
        message: 'Circuit breaker registry not available'
      };
    }

    const stats = this.circuitBreakerRegistry.getAllStats();
    const openCircuits = stats.filter(s => s.state === 'open');
    const halfOpenCircuits = stats.filter(s => s.state === 'half_open');

    let status = HEALTH_STATUS.HEALTHY;
    let message = `${stats.length} circuit breakers monitored`;

    if (openCircuits.length >= this.config.alertThresholds.circuitOpenCount) {
      status = HEALTH_STATUS.CRITICAL;
      message = `${openCircuits.length} circuit breakers are open`;
    } else if (openCircuits.length > 0 || halfOpenCircuits.length > 0) {
      status = HEALTH_STATUS.DEGRADED;
      message = `${openCircuits.length} open, ${halfOpenCircuits.length} half-open circuits`;
    }

    return {
      status,
      message,
      details: {
        total: stats.length,
        open: openCircuits.length,
        halfOpen: halfOpenCircuits.length,
        closed: stats.length - openCircuits.length - halfOpenCircuits.length,
        openCircuits: openCircuits.map(c => c.name)
      }
    };
  }

  /**
   * Check error rate health
   * @returns {Object} Health check result
   */
  _checkErrorRate() {
    if (!this.logger?.getErrorMetrics) {
      return {
        status: HEALTH_STATUS.HEALTHY,
        message: 'Error metrics not available'
      };
    }

    const metrics = this.logger.getErrorMetrics();
    const errorRate = this._calculateCurrentErrorRate(metrics);

    let status = HEALTH_STATUS.HEALTHY;
    let message = `Error rate: ${(errorRate * 100).toFixed(2)}%`;

    if (errorRate >= this.config.alertThresholds.errorRate) {
      status = HEALTH_STATUS.CRITICAL;
      message = `High error rate: ${(errorRate * 100).toFixed(2)}%`;
    } else if (errorRate >= this.config.alertThresholds.errorRate * 0.5) {
      status = HEALTH_STATUS.DEGRADED;
      message = `Elevated error rate: ${(errorRate * 100).toFixed(2)}%`;
    }

    return {
      status,
      message,
      details: {
        errorRate,
        totalErrors: metrics.totalErrors,
        errorCounts: metrics.errorCounts
      }
    };
  }

  /**
   * Check response time health
   * @returns {Object} Health check result
   */
  _checkResponseTime() {
    // Calculate average response time from health check history
    const recentChecks = this.healthHistory.slice(-10);
    const responseTimes = recentChecks
      .map(h => h.metrics.healthCheckDuration)
      .filter(t => t !== undefined);

    if (responseTimes.length === 0) {
      return {
        status: HEALTH_STATUS.HEALTHY,
        message: 'No response time data available'
      };
    }

    const avgResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

    let status = HEALTH_STATUS.HEALTHY;
    let message = `Average response time: ${avgResponseTime.toFixed(0)}ms`;

    if (avgResponseTime >= this.config.alertThresholds.responseTime) {
      status = HEALTH_STATUS.CRITICAL;
      message = `High response time: ${avgResponseTime.toFixed(0)}ms`;
    } else if (avgResponseTime >= this.config.alertThresholds.responseTime * 0.7) {
      status = HEALTH_STATUS.DEGRADED;
      message = `Elevated response time: ${avgResponseTime.toFixed(0)}ms`;
    }

    return {
      status,
      message,
      details: {
        averageResponseTime: avgResponseTime,
        sampleSize: responseTimes.length,
        threshold: this.config.alertThresholds.responseTime
      }
    };
  }

  /**
   * Check resource usage health
   * @returns {Object} Health check result
   */
  _checkResourceUsage() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Convert to MB
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const memoryUtilization = heapUsedMB / heapTotalMB;

    let status = HEALTH_STATUS.HEALTHY;
    let message = `Memory: ${heapUsedMB.toFixed(1)}MB/${heapTotalMB.toFixed(1)}MB`;

    if (memoryUtilization >= 0.9) {
      status = HEALTH_STATUS.CRITICAL;
      message = `High memory usage: ${(memoryUtilization * 100).toFixed(1)}%`;
    } else if (memoryUtilization >= 0.7) {
      status = HEALTH_STATUS.DEGRADED;
      message = `Elevated memory usage: ${(memoryUtilization * 100).toFixed(1)}%`;
    }

    return {
      status,
      message,
      details: {
        memory: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          utilization: memoryUtilization,
          external: memoryUsage.external / 1024 / 1024
        },
        cpu: cpuUsage,
        uptime: process.uptime()
      }
    };
  }

  /**
   * Calculate current error rate
   * @param {Object} metrics - Error metrics
   * @returns {number} Error rate (0-1)
   */
  _calculateCurrentErrorRate(metrics) {
    // Calculate error rate from recent time window
    const recentErrors = Object.values(metrics.errorRates || {})
      .reduce((sum, rate) => sum + rate, 0);
    
    // Estimate total requests (this is a simplified calculation)
    const estimatedRequests = recentErrors / 0.1; // Assume 10% error rate baseline
    
    return estimatedRequests > 0 ? recentErrors / estimatedRequests : 0;
  }

  /**
   * Update overall health status
   * @param {Object} checkResults - Health check results
   * @param {number} duration - Health check duration
   */
  _updateOverallHealth(checkResults, duration) {
    const statuses = Object.values(checkResults).map(r => r.status);
    
    // Determine overall status (worst case)
    let overallStatus = HEALTH_STATUS.HEALTHY;
    if (statuses.includes(HEALTH_STATUS.DOWN)) {
      overallStatus = HEALTH_STATUS.DOWN;
    } else if (statuses.includes(HEALTH_STATUS.CRITICAL)) {
      overallStatus = HEALTH_STATUS.CRITICAL;
    } else if (statuses.includes(HEALTH_STATUS.DEGRADED)) {
      overallStatus = HEALTH_STATUS.DEGRADED;
    }

    const previousStatus = this.currentHealth.status;
    
    this.currentHealth = {
      status: overallStatus,
      timestamp: Date.now(),
      checks: checkResults,
      metrics: {
        healthCheckDuration: duration,
        totalChecks: Object.keys(checkResults).length,
        healthyChecks: statuses.filter(s => s === HEALTH_STATUS.HEALTHY).length,
        degradedChecks: statuses.filter(s => s === HEALTH_STATUS.DEGRADED).length,
        criticalChecks: statuses.filter(s => s === HEALTH_STATUS.CRITICAL).length
      }
    };

    // Add to history
    this.healthHistory.push({ ...this.currentHealth });
    
    // Trim history
    if (this.healthHistory.length > this.config.healthHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.config.healthHistorySize);
    }

    // Trigger alerts if status changed
    if (previousStatus !== overallStatus && this.config.enableAlerts) {
      this._triggerAlert(previousStatus, overallStatus, checkResults);
    }

    this.logger?.debug('Health status updated', {
      status: overallStatus,
      duration,
      checksCount: Object.keys(checkResults).length
    });
  }

  /**
   * Trigger health status alert
   * @param {string} previousStatus - Previous health status
   * @param {string} currentStatus - Current health status
   * @param {Object} checkResults - Health check results
   */
  _triggerAlert(previousStatus, currentStatus, checkResults) {
    const alert = {
      type: 'health_status_change',
      timestamp: Date.now(),
      previousStatus,
      currentStatus,
      severity: this._getAlertSeverity(currentStatus),
      message: `Health status changed from ${previousStatus} to ${currentStatus}`,
      details: checkResults
    };

    this.logger?.warn('Health status alert', alert);

    // Notify alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        this.logger?.error('Alert callback error', { error: error.message });
      }
    }
  }

  /**
   * Get alert severity for health status
   * @param {string} status - Health status
   * @returns {string} Alert severity
   */
  _getAlertSeverity(status) {
    switch (status) {
      case HEALTH_STATUS.DOWN:
        return 'critical';
      case HEALTH_STATUS.CRITICAL:
        return 'high';
      case HEALTH_STATUS.DEGRADED:
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Add alert callback
   * @param {Function} callback - Alert callback function
   */
  addAlertCallback(callback) {
    this.alertCallbacks.add(callback);
  }

  /**
   * Remove alert callback
   * @param {Function} callback - Alert callback function
   */
  removeAlertCallback(callback) {
    this.alertCallbacks.delete(callback);
  }

  /**
   * Get current health status
   * @returns {Object} Current health status
   */
  getStatus() {
    return { ...this.currentHealth };
  }

  /**
   * Get health history
   * @param {number} limit - Number of history entries to return
   * @returns {Array} Health history
   */
  getHistory(limit = 50) {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Get health check statistics
   * @returns {Object} Health check statistics
   */
  getHealthCheckStats() {
    const stats = {};
    
    for (const [id, check] of this.healthChecks) {
      stats[id] = {
        name: check.name,
        type: check.type,
        enabled: check.enabled,
        totalRuns: check.totalRuns,
        totalFailures: check.totalFailures,
        consecutiveFailures: check.consecutiveFailures,
        successRate: check.totalRuns > 0 ? 
          ((check.totalRuns - check.totalFailures) / check.totalRuns) : 0,
        averageResponseTime: check.averageResponseTime,
        lastRun: check.lastRun,
        lastResult: check.lastResult
      };
    }
    
    return stats;
  }

  /**
   * Reset health monitor state
   */
  reset() {
    this.healthHistory = [];
    this.currentHealth = {
      status: HEALTH_STATUS.HEALTHY,
      timestamp: Date.now(),
      checks: {},
      metrics: {}
    };
    
    // Reset health check stats
    for (const check of this.healthChecks.values()) {
      check.lastRun = null;
      check.lastResult = null;
      check.consecutiveFailures = 0;
      check.totalRuns = 0;
      check.totalFailures = 0;
      check.averageResponseTime = 0;
    }
  }

  /**
   * Destroy the health monitor
   */
  destroy() {
    this.stopMonitoring();
    this.alertCallbacks.clear();
    this.healthChecks.clear();
    this.reset();
  }
}

export default HealthMonitor;

