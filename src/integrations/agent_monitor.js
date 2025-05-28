/**
 * @fileoverview Agent Monitor
 * @description Health monitoring and performance tracking for AgentAPI and Claude Code
 */

import { AgentAPIClient } from './agentapi_client.js';
import { EventEmitter } from 'events';

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimeHistory: []
      },
      agent: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskDuration: 0,
        taskDurationHistory: []
      },
      system: {
        uptime: Date.now(),
        lastHealthCheck: null,
        circuitBreakerTrips: 0,
        errorRate: 0
      }
    };
  }

  recordRequest(responseTime, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Update response time metrics
    this.metrics.requests.responseTimeHistory.push(responseTime);
    if (this.metrics.requests.responseTimeHistory.length > 100) {
      this.metrics.requests.responseTimeHistory.shift();
    }

    this.metrics.requests.averageResponseTime = 
      this.metrics.requests.responseTimeHistory.reduce((a, b) => a + b, 0) / 
      this.metrics.requests.responseTimeHistory.length;
  }

  recordTask(duration, success = true) {
    this.metrics.agent.totalTasks++;
    
    if (success) {
      this.metrics.agent.completedTasks++;
    } else {
      this.metrics.agent.failedTasks++;
    }

    // Update task duration metrics
    this.metrics.agent.taskDurationHistory.push(duration);
    if (this.metrics.agent.taskDurationHistory.length > 50) {
      this.metrics.agent.taskDurationHistory.shift();
    }

    this.metrics.agent.averageTaskDuration = 
      this.metrics.agent.taskDurationHistory.reduce((a, b) => a + b, 0) / 
      this.metrics.agent.taskDurationHistory.length;
  }

  recordCircuitBreakerTrip() {
    this.metrics.system.circuitBreakerTrips++;
  }

  updateHealthCheck() {
    this.metrics.system.lastHealthCheck = new Date();
  }

  getMetrics() {
    // Calculate error rate
    const totalRequests = this.metrics.requests.total;
    this.metrics.system.errorRate = totalRequests > 0 
      ? (this.metrics.requests.failed / totalRequests) * 100 
      : 0;

    return {
      ...this.metrics,
      system: {
        ...this.metrics.system,
        uptimeMs: Date.now() - this.metrics.system.uptime
      }
    };
  }

  reset() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimeHistory: []
      },
      agent: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskDuration: 0,
        taskDurationHistory: []
      },
      system: {
        uptime: Date.now(),
        lastHealthCheck: null,
        circuitBreakerTrips: 0,
        errorRate: 0
      }
    };
  }
}

/**
 * Agent Monitor for health and performance tracking
 */
export class AgentMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      performanceReportInterval: config.performanceReportInterval || 300000, // 5 minutes
      alertThresholds: {
        errorRate: config.errorRateThreshold || 10, // 10%
        responseTime: config.responseTimeThreshold || 5000, // 5 seconds
        taskDuration: config.taskDurationThreshold || 300000, // 5 minutes
        ...config.alertThresholds
      },
      ...config
    };

    this.agentAPI = new AgentAPIClient(config.agentAPI || {});
    this.metrics = new PerformanceMetrics();
    this.isMonitoring = false;
    this.healthCheckInterval = null;
    this.performanceReportInterval = null;
    this.lastAlerts = new Map();
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    console.log('Agent monitoring started');

    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Start performance reporting
    this.performanceReportInterval = setInterval(() => {
      this.generatePerformanceReport();
    }, this.config.performanceReportInterval);

    // Perform initial health check
    this.performHealthCheck();

    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.performanceReportInterval) {
      clearInterval(this.performanceReportInterval);
      this.performanceReportInterval = null;
    }

    console.log('Agent monitoring stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    let healthStatus = {
      timestamp: new Date(),
      healthy: false,
      agentAPI: {
        available: false,
        responseTime: null,
        status: null,
        error: null
      },
      circuitBreaker: null,
      alerts: []
    };

    try {
      // Check AgentAPI health
      const health = await this.agentAPI.getHealth();
      const responseTime = Date.now() - startTime;
      
      healthStatus.agentAPI = {
        available: true,
        responseTime,
        status: health.status || 'unknown',
        error: null
      };

      // Record metrics
      this.metrics.recordRequest(responseTime, true);
      this.metrics.updateHealthCheck();

      // Check circuit breaker status
      healthStatus.circuitBreaker = this.agentAPI.getCircuitBreakerStatus();

      // Overall health assessment
      healthStatus.healthy = health.healthy !== false && 
                            !healthStatus.circuitBreaker.state === 'OPEN';

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      healthStatus.agentAPI = {
        available: false,
        responseTime,
        status: 'error',
        error: error.message
      };

      // Record failed request
      this.metrics.recordRequest(responseTime, false);

      // Check if circuit breaker tripped
      const cbStatus = this.agentAPI.getCircuitBreakerStatus();
      if (cbStatus.state === 'OPEN') {
        this.metrics.recordCircuitBreakerTrip();
      }
      
      healthStatus.circuitBreaker = cbStatus;
      healthStatus.healthy = false;
    }

    // Check for alerts
    healthStatus.alerts = this.checkAlerts(healthStatus);

    // Emit health check event
    this.emit('health:check', healthStatus);

    // Emit alerts if any
    if (healthStatus.alerts.length > 0) {
      this.emit('health:alerts', healthStatus.alerts);
    }

    return healthStatus;
  }

  /**
   * Check for alert conditions
   * @param {Object} healthStatus - Current health status
   * @returns {Array} Array of alerts
   */
  checkAlerts(healthStatus) {
    const alerts = [];
    const metrics = this.metrics.getMetrics();
    const now = Date.now();

    // Error rate alert
    if (metrics.system.errorRate > this.config.alertThresholds.errorRate) {
      const alertKey = 'error_rate';
      if (!this.lastAlerts.has(alertKey) || 
          now - this.lastAlerts.get(alertKey) > 300000) { // 5 minutes cooldown
        alerts.push({
          type: 'error_rate',
          severity: 'warning',
          message: `High error rate: ${metrics.system.errorRate.toFixed(2)}%`,
          threshold: this.config.alertThresholds.errorRate,
          current: metrics.system.errorRate
        });
        this.lastAlerts.set(alertKey, now);
      }
    }

    // Response time alert
    if (healthStatus.agentAPI.responseTime > this.config.alertThresholds.responseTime) {
      const alertKey = 'response_time';
      if (!this.lastAlerts.has(alertKey) || 
          now - this.lastAlerts.get(alertKey) > 300000) {
        alerts.push({
          type: 'response_time',
          severity: 'warning',
          message: `High response time: ${healthStatus.agentAPI.responseTime}ms`,
          threshold: this.config.alertThresholds.responseTime,
          current: healthStatus.agentAPI.responseTime
        });
        this.lastAlerts.set(alertKey, now);
      }
    }

    // Circuit breaker alert
    if (healthStatus.circuitBreaker && healthStatus.circuitBreaker.state === 'OPEN') {
      const alertKey = 'circuit_breaker';
      if (!this.lastAlerts.has(alertKey) || 
          now - this.lastAlerts.get(alertKey) > 600000) { // 10 minutes cooldown
        alerts.push({
          type: 'circuit_breaker',
          severity: 'critical',
          message: 'Circuit breaker is open - AgentAPI unavailable',
          threshold: 'N/A',
          current: 'OPEN'
        });
        this.lastAlerts.set(alertKey, now);
      }
    }

    // Agent unavailable alert
    if (!healthStatus.agentAPI.available) {
      const alertKey = 'agent_unavailable';
      if (!this.lastAlerts.has(alertKey) || 
          now - this.lastAlerts.get(alertKey) > 300000) {
        alerts.push({
          type: 'agent_unavailable',
          severity: 'critical',
          message: 'AgentAPI is not available',
          threshold: 'N/A',
          current: 'unavailable'
        });
        this.lastAlerts.set(alertKey, now);
      }
    }

    return alerts;
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const metrics = this.metrics.getMetrics();
    const report = {
      timestamp: new Date(),
      summary: {
        uptime: metrics.system.uptimeMs,
        totalRequests: metrics.requests.total,
        successRate: metrics.requests.total > 0 
          ? ((metrics.requests.successful / metrics.requests.total) * 100).toFixed(2) + '%'
          : '0%',
        errorRate: metrics.system.errorRate.toFixed(2) + '%',
        averageResponseTime: metrics.requests.averageResponseTime.toFixed(2) + 'ms'
      },
      agent: {
        totalTasks: metrics.agent.totalTasks,
        completedTasks: metrics.agent.completedTasks,
        failedTasks: metrics.agent.failedTasks,
        taskSuccessRate: metrics.agent.totalTasks > 0 
          ? ((metrics.agent.completedTasks / metrics.agent.totalTasks) * 100).toFixed(2) + '%'
          : '0%',
        averageTaskDuration: (metrics.agent.averageTaskDuration / 1000).toFixed(2) + 's'
      },
      system: {
        circuitBreakerTrips: metrics.system.circuitBreakerTrips,
        lastHealthCheck: metrics.system.lastHealthCheck
      }
    };

    console.log('Performance Report:', JSON.stringify(report, null, 2));
    this.emit('performance:report', report);

    return report;
  }

  /**
   * Record task execution
   * @param {number} duration - Task duration in milliseconds
   * @param {boolean} success - Whether task was successful
   */
  recordTaskExecution(duration, success = true) {
    this.metrics.recordTask(duration, success);
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics.reset();
    this.lastAlerts.clear();
    this.emit('metrics:reset');
  }

  /**
   * Get monitoring status
   * @returns {Object} Monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      config: this.config,
      metrics: this.getMetrics(),
      circuitBreaker: this.agentAPI.getCircuitBreakerStatus()
    };
  }
}

export default AgentMonitor;

