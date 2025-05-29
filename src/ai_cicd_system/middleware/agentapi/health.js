/**
 * Agent Health Monitor - Consolidated Implementation
 * 
 * Real-time monitoring system for agent health and performance.
 * Consolidates health monitoring functionality from multiple PRs.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentHealthMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      healthCheckInterval: config.healthCheckInterval || 30000,
      alertThreshold: config.alertThreshold || 3,
      metricsRetentionPeriod: config.metricsRetentionPeriod || 86400000, // 24 hours
      enableAlerts: config.enableAlerts !== false,
      ...config
    };

    this.logger = new SimpleLogger('AgentHealthMonitor');
    
    // Health status tracking
    this.agentHealth = new Map();
    this.systemHealth = {
      status: 'unknown',
      lastCheck: null,
      uptime: 0,
      startTime: Date.now()
    };
    
    // Metrics storage
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0 },
      responseTime: { total: 0, average: 0, min: Infinity, max: 0 },
      system: {
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { usage: 0 },
        circuitBreakerTrips: 0,
        errors: { total: 0, rate: 0 }
      },
      agents: new Map()
    };
    
    // Alert management
    this.alerts = [];
    this.alertHistory = [];
    
    this.running = false;
    this.healthCheckInterval = null;
  }

  /**
   * Start health monitoring
   */
  async start() {
    if (this.running) {
      return;
    }

    this.logger.info('Starting health monitoring...');
    
    try {
      this.running = true;
      this.systemHealth.startTime = Date.now();
      
      // Start periodic health checks
      this._startHealthChecks();
      
      // Start metrics collection
      this._startMetricsCollection();
      
      this.logger.info('Health monitoring started successfully');
      this.emit('started');
      
    } catch (error) {
      this.logger.error('Failed to start health monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop health monitoring
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping health monitoring...');
    
    try {
      this.running = false;
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }
      
      this.logger.info('Health monitoring stopped');
      this.emit('stopped');
      
    } catch (error) {
      this.logger.error('Error stopping health monitoring:', error);
      throw error;
    }
  }

  /**
   * Register an agent for monitoring
   */
  registerAgent(agentType, agentClient) {
    this.logger.debug(`Registering agent for monitoring: ${agentType}`);
    
    this.agentHealth.set(agentType, {
      type: agentType,
      status: 'unknown',
      lastCheck: null,
      consecutiveFailures: 0,
      client: agentClient,
      metrics: {
        requests: { total: 0, successful: 0, failed: 0 },
        responseTime: { total: 0, average: 0 },
        availability: 100,
        lastError: null
      }
    });

    // Set up agent event listeners
    if (agentClient) {
      agentClient.on('connected', () => {
        this._updateAgentStatus(agentType, 'healthy');
      });

      agentClient.on('disconnected', () => {
        this._updateAgentStatus(agentType, 'unhealthy', 'Disconnected');
      });

      agentClient.on('circuitBreakerOpened', () => {
        this._updateAgentStatus(agentType, 'degraded', 'Circuit breaker opened');
        this._recordAlert('warning', `Circuit breaker opened for ${agentType}`, agentType);
      });
    }
  }

  /**
   * Unregister an agent from monitoring
   */
  unregisterAgent(agentType) {
    this.logger.debug(`Unregistering agent from monitoring: ${agentType}`);
    this.agentHealth.delete(agentType);
    this.metrics.agents.delete(agentType);
  }

  /**
   * Check if an agent is healthy
   */
  isAgentHealthy(agentType) {
    const health = this.agentHealth.get(agentType);
    return health ? health.status === 'healthy' : false;
  }

  /**
   * Get health status for a specific agent
   */
  getAgentHealth(agentType) {
    const health = this.agentHealth.get(agentType);
    if (!health) {
      throw new Error(`Agent not registered: ${agentType}`);
    }

    return {
      agentType,
      status: health.status,
      lastCheck: health.lastCheck,
      consecutiveFailures: health.consecutiveFailures,
      metrics: { ...health.metrics },
      healthy: health.status === 'healthy'
    };
  }

  /**
   * Get overall system health summary
   */
  getHealthSummary() {
    const agents = Array.from(this.agentHealth.values());
    const healthyAgents = agents.filter(agent => agent.status === 'healthy').length;
    const totalAgents = agents.length;
    
    let overallStatus = 'healthy';
    if (healthyAgents === 0) {
      overallStatus = 'unhealthy';
    } else if (healthyAgents < totalAgents) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      healthyAgents,
      totalAgents,
      uptime: Date.now() - this.systemHealth.startTime,
      lastCheck: this.systemHealth.lastCheck,
      agents: agents.map(agent => ({
        type: agent.type,
        status: agent.status,
        healthy: agent.status === 'healthy'
      }))
    };
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      uptime: Date.now() - this.systemHealth.startTime
    };
  }

  /**
   * Get current alerts
   */
  getAlerts() {
    return this.alerts.map(alert => ({ ...alert }));
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory
      .slice(-limit)
      .map(alert => ({ ...alert }));
  }

  /**
   * Record a request metric
   */
  recordRequest(agentType, success, responseTime, error = null) {
    // Update global metrics
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
      this.metrics.system.errors.total++;
    }

    // Update response time metrics
    if (responseTime) {
      this.metrics.responseTime.total += responseTime;
      this.metrics.responseTime.average = this.metrics.responseTime.total / this.metrics.requests.total;
      this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, responseTime);
      this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, responseTime);
    }

    // Update agent-specific metrics
    if (agentType) {
      const agentHealth = this.agentHealth.get(agentType);
      if (agentHealth) {
        agentHealth.metrics.requests.total++;
        if (success) {
          agentHealth.metrics.requests.successful++;
          agentHealth.consecutiveFailures = 0;
        } else {
          agentHealth.metrics.requests.failed++;
          agentHealth.consecutiveFailures++;
          agentHealth.metrics.lastError = error;
        }

        if (responseTime) {
          agentHealth.metrics.responseTime.total += responseTime;
          agentHealth.metrics.responseTime.average = 
            agentHealth.metrics.responseTime.total / agentHealth.metrics.requests.total;
        }

        // Calculate availability
        agentHealth.metrics.availability = 
          (agentHealth.metrics.requests.successful / agentHealth.metrics.requests.total) * 100;

        // Check for alerts
        this._checkAgentAlerts(agentType, agentHealth);
      }
    }

    // Calculate error rate
    this.metrics.system.errors.rate = 
      (this.metrics.requests.failed / this.metrics.requests.total) * 100;
  }

  /**
   * Record circuit breaker trip
   */
  recordCircuitBreakerTrip(agentType) {
    this.metrics.system.circuitBreakerTrips++;
    this._recordAlert('error', `Circuit breaker tripped for ${agentType}`, agentType);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      running: this.running,
      uptime: Date.now() - this.systemHealth.startTime,
      registeredAgents: this.agentHealth.size,
      activeAlerts: this.alerts.length,
      totalRequests: this.metrics.requests.total,
      errorRate: this.metrics.system.errors.rate,
      healthy: this._isSystemHealthy()
    };
  }

  // Private methods

  /**
   * Start periodic health checks
   */
  _startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.config.healthCheckInterval);

    // Perform initial health check
    this._performHealthChecks();
  }

  /**
   * Start metrics collection
   */
  _startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this._collectSystemMetrics();
      this._cleanupOldMetrics();
    }, 60000); // Collect every minute
  }

  /**
   * Perform health checks on all registered agents
   */
  async _performHealthChecks() {
    this.systemHealth.lastCheck = Date.now();
    this.systemHealth.uptime = Date.now() - this.systemHealth.startTime;

    for (const [agentType, agentHealth] of this.agentHealth) {
      try {
        await this._checkAgentHealth(agentType, agentHealth);
      } catch (error) {
        this.logger.error(`Health check failed for ${agentType}:`, error);
      }
    }

    // Update overall system status
    this._updateSystemStatus();
    
    // Emit health update event
    this.emit('healthUpdate', {
      timestamp: this.systemHealth.lastCheck,
      summary: this.getHealthSummary(),
      metrics: this.getMetrics()
    });
  }

  /**
   * Check health of a specific agent
   */
  async _checkAgentHealth(agentType, agentHealth) {
    agentHealth.lastCheck = Date.now();

    try {
      if (agentHealth.client) {
        const status = agentHealth.client.getConnectionStatus();
        
        if (status.connected) {
          // Try to perform a health check
          await agentHealth.client.healthCheck();
          this._updateAgentStatus(agentType, 'healthy');
        } else {
          this._updateAgentStatus(agentType, 'unhealthy', 'Not connected');
        }
      } else {
        this._updateAgentStatus(agentType, 'unknown', 'No client available');
      }
    } catch (error) {
      this._updateAgentStatus(agentType, 'unhealthy', error.message);
      agentHealth.consecutiveFailures++;
    }
  }

  /**
   * Update agent status
   */
  _updateAgentStatus(agentType, status, message = null) {
    const agentHealth = this.agentHealth.get(agentType);
    if (!agentHealth) {
      return;
    }

    const previousStatus = agentHealth.status;
    agentHealth.status = status;
    agentHealth.lastCheck = Date.now();

    if (message) {
      agentHealth.metrics.lastError = message;
    }

    // Log status changes
    if (previousStatus !== status) {
      this.logger.info(`Agent status changed: ${agentType}`, {
        from: previousStatus,
        to: status,
        message
      });

      // Emit status change event
      this.emit('agentStatusChanged', {
        agentType,
        previousStatus,
        currentStatus: status,
        message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Update overall system status
   */
  _updateSystemStatus() {
    const summary = this.getHealthSummary();
    const previousStatus = this.systemHealth.status;
    this.systemHealth.status = summary.status;

    if (previousStatus !== summary.status) {
      this.logger.info(`System status changed: ${previousStatus} -> ${summary.status}`);
      
      this.emit('systemStatusChanged', {
        previousStatus,
        currentStatus: summary.status,
        summary,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Check for agent-specific alerts
   */
  _checkAgentAlerts(agentType, agentHealth) {
    // High error rate alert
    if (agentHealth.metrics.availability < 90) {
      this._recordAlert('warning', 
        `Low availability for ${agentType}: ${agentHealth.metrics.availability.toFixed(1)}%`, 
        agentType
      );
    }

    // Consecutive failures alert
    if (agentHealth.consecutiveFailures >= this.config.alertThreshold) {
      this._recordAlert('error', 
        `${agentHealth.consecutiveFailures} consecutive failures for ${agentType}`, 
        agentType
      );
    }

    // High response time alert
    if (agentHealth.metrics.responseTime.average > 10000) { // 10 seconds
      this._recordAlert('warning', 
        `High response time for ${agentType}: ${agentHealth.metrics.responseTime.average}ms`, 
        agentType
      );
    }
  }

  /**
   * Record an alert
   */
  _recordAlert(severity, message, agentType = null) {
    if (!this.config.enableAlerts) {
      return;
    }

    const alert = {
      id: this._generateAlertId(),
      severity,
      message,
      agentType,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.push(alert);
    this.alertHistory.push({ ...alert });

    this.logger.warn(`Alert: ${severity.toUpperCase()} - ${message}`, { agentType });
    
    this.emit('alert', alert);

    // Auto-acknowledge info alerts after 5 minutes
    if (severity === 'info') {
      setTimeout(() => {
        this._acknowledgeAlert(alert.id);
      }, 300000);
    }
  }

  /**
   * Acknowledge an alert
   */
  _acknowledgeAlert(alertId) {
    const alertIndex = this.alerts.findIndex(alert => alert.id === alertId);
    if (alertIndex > -1) {
      this.alerts[alertIndex].acknowledged = true;
      this.alerts.splice(alertIndex, 1);
    }
  }

  /**
   * Collect system metrics
   */
  _collectSystemMetrics() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.system.memory = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.metrics.system.cpu = {
      usage: (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to seconds
    };
  }

  /**
   * Clean up old metrics and alerts
   */
  _cleanupOldMetrics() {
    const cutoffTime = Date.now() - this.config.metricsRetentionPeriod;
    
    // Clean up alert history
    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp > cutoffTime
    );
  }

  /**
   * Check if system is healthy
   */
  _isSystemHealthy() {
    const summary = this.getHealthSummary();
    return summary.status === 'healthy' || summary.status === 'degraded';
  }

  /**
   * Generate unique alert ID
   */
  _generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

export default AgentHealthMonitor;

