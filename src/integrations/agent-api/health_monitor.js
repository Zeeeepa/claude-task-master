/**
 * Health Monitor
 * 
 * Real-time monitoring and health checks for AI agents in the AgentAPI middleware.
 * Provides agent status tracking, performance monitoring, and alerting capabilities.
 */

import EventEmitter from 'events';
import axios from 'axios';

export class HealthMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      timeout: config.timeout || 10000, // 10 seconds
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      healthThreshold: config.healthThreshold || 0.8, // 80% success rate
      alertThreshold: config.alertThreshold || 3, // 3 consecutive failures
      enableAlerts: config.enableAlerts !== false,
      enableMetrics: config.enableMetrics !== false,
      agentApiUrl: config.agentApiUrl || 'http://localhost:3284',
      ...config
    };

    // Health monitoring state
    this.agentHealth = new Map(); // agentType -> health data
    this.healthHistory = new Map(); // agentType -> array of health checks
    this.alertState = new Map(); // agentType -> alert status
    this.isMonitoring = false;
    this.monitoringInterval = null;

    // Supported agent types
    this.supportedAgentTypes = ['claude', 'goose', 'aider', 'codex'];

    // Initialize health tracking
    this._initializeHealthTracking();
  }

  /**
   * Initialize the health monitor
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Health Monitor...');

      // Perform initial health checks
      await this._performInitialHealthChecks();

      console.log('✅ Health Monitor initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Health Monitor:', error);
      throw error;
    }
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.warn('⚠️ Health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.config.checkInterval);

    console.log('🔍 Health monitoring started');
    this.emit('monitoringStarted');
  }

  /**
   * Stop health monitoring
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('🛑 Health monitoring stopped');
    this.emit('monitoringStopped');
  }

  /**
   * Get health status for a specific agent type
   */
  async getAgentHealth(agentType) {
    if (!this.supportedAgentTypes.includes(agentType)) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    return this.agentHealth.get(agentType) || this._createDefaultHealthData(agentType);
  }

  /**
   * Get health status for all agents
   */
  async getAllAgentHealth() {
    const healthData = {};
    
    for (const agentType of this.supportedAgentTypes) {
      healthData[agentType] = await this.getAgentHealth(agentType);
    }

    return {
      overall: this._calculateOverallHealth(healthData),
      agents: healthData,
      lastCheck: Math.max(...Object.values(healthData).map(h => h.lastCheck || 0)),
      isMonitoring: this.isMonitoring
    };
  }

  /**
   * Perform a manual health check for a specific agent
   */
  async checkAgentHealth(agentType) {
    if (!this.supportedAgentTypes.includes(agentType)) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    return await this._performAgentHealthCheck(agentType);
  }

  /**
   * Get health metrics and statistics
   */
  async getMetrics() {
    if (!this.config.enableMetrics) {
      throw new Error('Metrics collection is disabled');
    }

    const metrics = {
      monitoring: {
        isActive: this.isMonitoring,
        checkInterval: this.config.checkInterval,
        lastCheck: Math.max(...Array.from(this.agentHealth.values()).map(h => h.lastCheck || 0))
      },
      agents: {},
      alerts: {
        active: Array.from(this.alertState.values()).filter(alert => alert.active).length,
        total: Array.from(this.alertState.values()).reduce((sum, alert) => sum + alert.count, 0)
      },
      performance: {
        averageResponseTime: 0,
        successRate: 0,
        totalChecks: 0
      }
    };

    // Calculate agent-specific metrics
    for (const agentType of this.supportedAgentTypes) {
      const health = this.agentHealth.get(agentType);
      const history = this.healthHistory.get(agentType) || [];

      if (health) {
        metrics.agents[agentType] = {
          status: health.status,
          successRate: health.successRate,
          averageResponseTime: health.averageResponseTime,
          totalChecks: health.totalChecks,
          consecutiveFailures: health.consecutiveFailures,
          lastCheck: health.lastCheck,
          uptime: this._calculateUptime(history)
        };
      }
    }

    // Calculate overall performance metrics
    const allHealthData = Array.from(this.agentHealth.values());
    if (allHealthData.length > 0) {
      metrics.performance.averageResponseTime = 
        allHealthData.reduce((sum, h) => sum + (h.averageResponseTime || 0), 0) / allHealthData.length;
      metrics.performance.successRate = 
        allHealthData.reduce((sum, h) => sum + (h.successRate || 0), 0) / allHealthData.length;
      metrics.performance.totalChecks = 
        allHealthData.reduce((sum, h) => sum + (h.totalChecks || 0), 0);
    }

    return metrics;
  }

  /**
   * Get alert status
   */
  async getAlerts() {
    const alerts = [];
    
    for (const [agentType, alertData] of this.alertState.entries()) {
      if (alertData.active) {
        alerts.push({
          agentType,
          severity: alertData.severity,
          message: alertData.message,
          count: alertData.count,
          firstOccurrence: alertData.firstOccurrence,
          lastOccurrence: alertData.lastOccurrence
        });
      }
    }

    return alerts.sort((a, b) => b.lastOccurrence - a.lastOccurrence);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(agentType) {
    const alertData = this.alertState.get(agentType);
    if (alertData && alertData.active) {
      alertData.acknowledged = true;
      alertData.acknowledgedAt = Date.now();
      
      console.log(`✅ Alert acknowledged for agent type: ${agentType}`);
      this.emit('alertAcknowledged', { agentType, alertData });
    }
  }

  /**
   * Shutdown the health monitor
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Health Monitor...');

      // Stop monitoring
      await this.stopMonitoring();

      // Clear all data
      this.agentHealth.clear();
      this.healthHistory.clear();
      this.alertState.clear();

      console.log('✅ Health Monitor shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Health Monitor shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _initializeHealthTracking() {
    for (const agentType of this.supportedAgentTypes) {
      this.agentHealth.set(agentType, this._createDefaultHealthData(agentType));
      this.healthHistory.set(agentType, []);
      this.alertState.set(agentType, {
        active: false,
        count: 0,
        severity: 'info',
        message: '',
        firstOccurrence: null,
        lastOccurrence: null,
        acknowledged: false
      });
    }
  }

  _createDefaultHealthData(agentType) {
    return {
      agentType,
      status: 'unknown',
      isHealthy: false,
      lastCheck: null,
      responseTime: null,
      averageResponseTime: 0,
      successRate: 0,
      totalChecks: 0,
      successfulChecks: 0,
      consecutiveFailures: 0,
      lastError: null,
      metadata: {}
    };
  }

  async _performInitialHealthChecks() {
    console.log('🔍 Performing initial health checks...');
    
    const checkPromises = this.supportedAgentTypes.map(agentType => 
      this._performAgentHealthCheck(agentType)
    );

    await Promise.allSettled(checkPromises);
  }

  async _performHealthChecks() {
    try {
      const checkPromises = this.supportedAgentTypes.map(agentType => 
        this._performAgentHealthCheck(agentType)
      );

      await Promise.allSettled(checkPromises);
      
      this.emit('healthCheck', await this.getAllAgentHealth());
    } catch (error) {
      console.error('❌ Error during health checks:', error);
    }
  }

  async _performAgentHealthCheck(agentType) {
    const startTime = Date.now();
    let healthData = this.agentHealth.get(agentType) || this._createDefaultHealthData(agentType);
    
    try {
      // Perform health check via AgentAPI
      const response = await this._checkAgentViaAPI(agentType);
      const responseTime = Date.now() - startTime;

      // Update health data
      healthData.status = 'healthy';
      healthData.isHealthy = true;
      healthData.lastCheck = Date.now();
      healthData.responseTime = responseTime;
      healthData.totalChecks++;
      healthData.successfulChecks++;
      healthData.consecutiveFailures = 0;
      healthData.lastError = null;

      // Update average response time
      healthData.averageResponseTime = 
        ((healthData.averageResponseTime * (healthData.totalChecks - 1)) + responseTime) / healthData.totalChecks;

      // Update success rate
      healthData.successRate = healthData.successfulChecks / healthData.totalChecks;

      // Store health data
      this.agentHealth.set(agentType, healthData);

      // Add to history
      this._addToHealthHistory(agentType, {
        timestamp: Date.now(),
        status: 'healthy',
        responseTime,
        success: true
      });

      // Clear alerts if health is restored
      this._clearAlert(agentType);

      console.log(`✅ Health check passed for ${agentType} (${responseTime}ms)`);
      this.emit('agentHealthy', { agentType, healthData });

      return healthData;

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Update health data for failure
      healthData.status = 'unhealthy';
      healthData.isHealthy = false;
      healthData.lastCheck = Date.now();
      healthData.responseTime = responseTime;
      healthData.totalChecks++;
      healthData.consecutiveFailures++;
      healthData.lastError = error.message;

      // Update success rate
      healthData.successRate = healthData.successfulChecks / healthData.totalChecks;

      // Store health data
      this.agentHealth.set(agentType, healthData);

      // Add to history
      this._addToHealthHistory(agentType, {
        timestamp: Date.now(),
        status: 'unhealthy',
        responseTime,
        success: false,
        error: error.message
      });

      // Check if alert should be triggered
      this._checkAlertConditions(agentType, healthData);

      console.error(`❌ Health check failed for ${agentType}:`, error.message);
      this.emit('agentUnhealthy', { agentType, healthData, error });

      return healthData;
    }
  }

  async _checkAgentViaAPI(agentType) {
    // Try to get agent status via AgentAPI
    const response = await axios.get(`${this.config.agentApiUrl}/health`, {
      timeout: this.config.timeout,
      params: { agentType }
    });

    if (response.status !== 200) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }

    return response.data;
  }

  _addToHealthHistory(agentType, entry) {
    const history = this.healthHistory.get(agentType) || [];
    history.push(entry);

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }

    this.healthHistory.set(agentType, history);
  }

  _checkAlertConditions(agentType, healthData) {
    if (!this.config.enableAlerts) return;

    const alertData = this.alertState.get(agentType);
    
    // Check for consecutive failures
    if (healthData.consecutiveFailures >= this.config.alertThreshold) {
      if (!alertData.active) {
        this._triggerAlert(agentType, 'error', 
          `Agent ${agentType} has ${healthData.consecutiveFailures} consecutive failures`);
      } else {
        alertData.count++;
        alertData.lastOccurrence = Date.now();
      }
    }

    // Check for low success rate
    if (healthData.totalChecks >= 10 && healthData.successRate < this.config.healthThreshold) {
      if (!alertData.active || alertData.severity !== 'warning') {
        this._triggerAlert(agentType, 'warning', 
          `Agent ${agentType} has low success rate: ${(healthData.successRate * 100).toFixed(1)}%`);
      }
    }
  }

  _triggerAlert(agentType, severity, message) {
    const alertData = this.alertState.get(agentType);
    const now = Date.now();

    alertData.active = true;
    alertData.severity = severity;
    alertData.message = message;
    alertData.count++;
    alertData.lastOccurrence = now;
    alertData.acknowledged = false;

    if (!alertData.firstOccurrence) {
      alertData.firstOccurrence = now;
    }

    console.warn(`🚨 Alert triggered for ${agentType}: ${message}`);
    this.emit('alertTriggered', { agentType, alertData });

    // Emit specific alert events
    if (severity === 'error') {
      this.emit('agentDown', agentType);
    }
  }

  _clearAlert(agentType) {
    const alertData = this.alertState.get(agentType);
    if (alertData.active) {
      alertData.active = false;
      alertData.acknowledged = false;
      
      console.log(`✅ Alert cleared for ${agentType}`);
      this.emit('alertCleared', { agentType, alertData });
    }
  }

  _calculateOverallHealth(healthData) {
    const agents = Object.values(healthData);
    if (agents.length === 0) return { status: 'unknown', score: 0 };

    const healthyAgents = agents.filter(agent => agent.isHealthy).length;
    const score = healthyAgents / agents.length;

    let status;
    if (score >= 0.8) status = 'healthy';
    else if (score >= 0.5) status = 'degraded';
    else status = 'unhealthy';

    return { status, score, healthyAgents, totalAgents: agents.length };
  }

  _calculateUptime(history) {
    if (history.length === 0) return 0;

    const successfulChecks = history.filter(entry => entry.success).length;
    return successfulChecks / history.length;
  }
}

export default HealthMonitor;

