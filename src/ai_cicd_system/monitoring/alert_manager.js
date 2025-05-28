/**
 * Alert Manager
 * 
 * Comprehensive alerting system for the AI CI/CD system.
 * Handles alert routing, escalation, throttling, and delivery.
 */

import { ErrorSeverity, ErrorTypes } from '../utils/error_types.js';

/**
 * Alert Severity Levels
 */
export const AlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Alert Types
 */
export const AlertTypes = {
  ERROR_THRESHOLD: 'ERROR_THRESHOLD',
  ERROR_RATE: 'ERROR_RATE',
  ERROR_SPIKE: 'ERROR_SPIKE',
  CRITICAL_ERROR: 'CRITICAL_ERROR',
  SERVICE_DOWN: 'SERVICE_DOWN',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  AUTHENTICATION_FAILURE: 'AUTHENTICATION_FAILURE',
  SYSTEM_HEALTH: 'SYSTEM_HEALTH'
};

/**
 * Alert Channels
 */
export const AlertChannels = {
  CONSOLE: 'CONSOLE',
  EMAIL: 'EMAIL',
  SLACK: 'SLACK',
  WEBHOOK: 'WEBHOOK',
  SMS: 'SMS',
  PAGERDUTY: 'PAGERDUTY'
};

/**
 * Alert Manager Implementation
 */
export class AlertManager {
  constructor(config = {}) {
    this.config = {
      enableThrottling: config.enableThrottling !== false,
      throttleWindow: config.throttleWindow || 300000, // 5 minutes
      maxAlertsPerWindow: config.maxAlertsPerWindow || 10,
      enableEscalation: config.enableEscalation !== false,
      escalationDelay: config.escalationDelay || 900000, // 15 minutes
      defaultChannel: config.defaultChannel || AlertChannels.CONSOLE,
      channels: config.channels || {},
      rules: config.rules || []
    };
    
    this.alertHistory = [];
    this.throttleCounters = new Map();
    this.escalationTimers = new Map();
    this.alertProviders = new Map();
    
    this.metrics = {
      totalAlerts: 0,
      alertsBySeverity: {},
      alertsByType: {},
      alertsByChannel: {},
      throttledAlerts: 0,
      escalatedAlerts: 0,
      failedDeliveries: 0
    };
    
    // Initialize default providers
    this.initializeDefaultProviders();
    
    // Start cleanup process
    this.startCleanup();
  }

  /**
   * Initialize default alert providers
   */
  initializeDefaultProviders() {
    // Console provider (always available)
    this.alertProviders.set(AlertChannels.CONSOLE, {
      send: async (alert) => {
        const emoji = this.getAlertEmoji(alert.severity);
        const timestamp = new Date().toISOString();
        console.log(`${emoji} [${timestamp}] ALERT: ${alert.title}`);
        console.log(`   Severity: ${alert.severity}`);
        console.log(`   Type: ${alert.type}`);
        console.log(`   Message: ${alert.message}`);
        if (alert.metadata) {
          console.log(`   Metadata:`, JSON.stringify(alert.metadata, null, 2));
        }
      }
    });
  }

  /**
   * Get emoji for alert severity
   */
  getAlertEmoji(severity) {
    const emojis = {
      [AlertSeverity.LOW]: '💡',
      [AlertSeverity.MEDIUM]: '⚠️',
      [AlertSeverity.HIGH]: '🚨',
      [AlertSeverity.CRITICAL]: '🔥'
    };
    return emojis[severity] || '📢';
  }

  /**
   * Register alert provider
   */
  registerProvider(channel, provider) {
    if (!provider.send || typeof provider.send !== 'function') {
      throw new Error(`Alert provider for ${channel} must have a 'send' method`);
    }
    
    this.alertProviders.set(channel, provider);
    console.log(`📢 Alert provider registered for channel: ${channel}`);
  }

  /**
   * Send alert
   */
  async sendAlert(error, context = {}) {
    const alert = this.createAlert(error, context);
    
    // Check if alert should be throttled
    if (this.shouldThrottle(alert)) {
      this.metrics.throttledAlerts++;
      console.log(`🔇 Alert throttled: ${alert.type} (${alert.title})`);
      return null;
    }
    
    // Apply alert rules
    const processedAlert = this.applyRules(alert);
    if (!processedAlert) {
      return null; // Alert was filtered out
    }
    
    // Record alert
    this.recordAlert(processedAlert);
    
    // Determine channels
    const channels = this.determineChannels(processedAlert);
    
    // Send to channels
    const deliveryResults = await this.deliverAlert(processedAlert, channels);
    
    // Handle escalation
    if (this.config.enableEscalation && this.shouldEscalate(processedAlert)) {
      this.scheduleEscalation(processedAlert);
    }
    
    return {
      alertId: processedAlert.id,
      deliveryResults,
      channels
    };
  }

  /**
   * Create alert from error
   */
  createAlert(error, context) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: this.determineAlertType(error, context),
      severity: this.determineAlertSeverity(error, context),
      title: this.generateAlertTitle(error, context),
      message: this.generateAlertMessage(error, context),
      source: {
        component: context.component || 'unknown',
        operationId: context.operationId,
        errorId: error.metadata?.id
      },
      metadata: {
        errorType: error.type,
        errorMessage: error.message,
        retryable: error.retryable,
        context: context,
        environment: process.env.NODE_ENV || 'development'
      },
      escalated: false,
      resolved: false
    };
    
    return alert;
  }

  /**
   * Determine alert type from error
   */
  determineAlertType(error, context) {
    // Map error types to alert types
    const typeMapping = {
      [ErrorTypes.AUTHENTICATION_ERROR]: AlertTypes.AUTHENTICATION_FAILURE,
      [ErrorTypes.AUTHORIZATION_ERROR]: AlertTypes.AUTHENTICATION_FAILURE,
      [ErrorTypes.CIRCUIT_BREAKER_OPEN]: AlertTypes.CIRCUIT_BREAKER_OPEN,
      [ErrorTypes.RESOURCE_EXHAUSTED]: AlertTypes.RESOURCE_EXHAUSTED,
      [ErrorTypes.SERVER_ERROR]: AlertTypes.SERVICE_DOWN
    };
    
    if (typeMapping[error.type]) {
      return typeMapping[error.type];
    }
    
    // Check for critical errors
    if (error.metadata?.severity === ErrorSeverity.CRITICAL) {
      return AlertTypes.CRITICAL_ERROR;
    }
    
    // Check for error rate/spike context
    if (context.alertType) {
      return context.alertType;
    }
    
    return AlertTypes.ERROR_THRESHOLD;
  }

  /**
   * Determine alert severity
   */
  determineAlertSeverity(error, context) {
    // Use error severity if available
    if (error.metadata?.severity) {
      return error.metadata.severity;
    }
    
    // Map error types to severity
    const severityMapping = {
      [ErrorTypes.AUTHENTICATION_ERROR]: AlertSeverity.HIGH,
      [ErrorTypes.AUTHORIZATION_ERROR]: AlertSeverity.HIGH,
      [ErrorTypes.DATABASE_ERROR]: AlertSeverity.CRITICAL,
      [ErrorTypes.RESOURCE_EXHAUSTED]: AlertSeverity.CRITICAL,
      [ErrorTypes.CONFIGURATION_ERROR]: AlertSeverity.HIGH,
      [ErrorTypes.CIRCUIT_BREAKER_OPEN]: AlertSeverity.HIGH,
      [ErrorTypes.RATE_LIMIT_ERROR]: AlertSeverity.MEDIUM,
      [ErrorTypes.TIMEOUT_ERROR]: AlertSeverity.MEDIUM,
      [ErrorTypes.NETWORK_ERROR]: AlertSeverity.MEDIUM
    };
    
    return severityMapping[error.type] || AlertSeverity.LOW;
  }

  /**
   * Generate alert title
   */
  generateAlertTitle(error, context) {
    const component = context.component || 'System';
    
    const titleTemplates = {
      [AlertTypes.CRITICAL_ERROR]: `Critical Error in ${component}`,
      [AlertTypes.SERVICE_DOWN]: `Service Down: ${component}`,
      [AlertTypes.CIRCUIT_BREAKER_OPEN]: `Circuit Breaker Open: ${component}`,
      [AlertTypes.AUTHENTICATION_FAILURE]: `Authentication Failure in ${component}`,
      [AlertTypes.RESOURCE_EXHAUSTED]: `Resource Exhausted: ${component}`,
      [AlertTypes.ERROR_RATE]: `High Error Rate in ${component}`,
      [AlertTypes.ERROR_SPIKE]: `Error Spike Detected in ${component}`
    };
    
    const alertType = this.determineAlertType(error, context);
    return titleTemplates[alertType] || `Error in ${component}`;
  }

  /**
   * Generate alert message
   */
  generateAlertMessage(error, context) {
    let message = error.message;
    
    // Add context information
    if (context.operationId) {
      message += ` (Operation: ${context.operationId})`;
    }
    
    if (context.userId) {
      message += ` (User: ${context.userId})`;
    }
    
    // Add error details
    if (error.retryable) {
      message += ' [Retryable]';
    }
    
    // Add escalation info if applicable
    if (context.escalated) {
      message += ' [ESCALATED]';
    }
    
    return message;
  }

  /**
   * Check if alert should be throttled
   */
  shouldThrottle(alert) {
    if (!this.config.enableThrottling) {
      return false;
    }
    
    const throttleKey = `${alert.type}:${alert.source.component}`;
    const now = Date.now();
    const windowStart = now - this.config.throttleWindow;
    
    // Clean old entries
    if (this.throttleCounters.has(throttleKey)) {
      const counter = this.throttleCounters.get(throttleKey);
      counter.timestamps = counter.timestamps.filter(ts => ts > windowStart);
    }
    
    // Get current count
    const counter = this.throttleCounters.get(throttleKey) || { timestamps: [] };
    
    if (counter.timestamps.length >= this.config.maxAlertsPerWindow) {
      return true;
    }
    
    // Add current timestamp
    counter.timestamps.push(now);
    this.throttleCounters.set(throttleKey, counter);
    
    return false;
  }

  /**
   * Apply alert rules
   */
  applyRules(alert) {
    for (const rule of this.config.rules) {
      if (this.matchesRule(alert, rule)) {
        if (rule.action === 'suppress') {
          console.log(`🔇 Alert suppressed by rule: ${rule.name}`);
          return null;
        }
        
        if (rule.action === 'modify') {
          alert = this.applyRuleModifications(alert, rule);
        }
        
        if (rule.action === 'escalate') {
          alert.severity = AlertSeverity.CRITICAL;
          alert.escalated = true;
        }
      }
    }
    
    return alert;
  }

  /**
   * Check if alert matches rule
   */
  matchesRule(alert, rule) {
    if (rule.conditions) {
      for (const [key, value] of Object.entries(rule.conditions)) {
        if (alert[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Apply rule modifications
   */
  applyRuleModifications(alert, rule) {
    if (rule.modifications) {
      return { ...alert, ...rule.modifications };
    }
    
    return alert;
  }

  /**
   * Record alert in history
   */
  recordAlert(alert) {
    this.alertHistory.push(alert);
    
    // Update metrics
    this.metrics.totalAlerts++;
    this.metrics.alertsBySeverity[alert.severity] = 
      (this.metrics.alertsBySeverity[alert.severity] || 0) + 1;
    this.metrics.alertsByType[alert.type] = 
      (this.metrics.alertsByType[alert.type] || 0) + 1;
    
    // Maintain history size
    if (this.alertHistory.length > 1000) {
      this.alertHistory.shift();
    }
  }

  /**
   * Determine delivery channels
   */
  determineChannels(alert) {
    const channels = [];
    
    // Default channel
    channels.push(this.config.defaultChannel);
    
    // Severity-based channels
    if (alert.severity === AlertSeverity.CRITICAL) {
      if (this.config.channels.critical) {
        channels.push(...this.config.channels.critical);
      }
    } else if (alert.severity === AlertSeverity.HIGH) {
      if (this.config.channels.high) {
        channels.push(...this.config.channels.high);
      }
    }
    
    // Type-based channels
    if (this.config.channels[alert.type]) {
      channels.push(...this.config.channels[alert.type]);
    }
    
    // Component-based channels
    if (this.config.channels[alert.source.component]) {
      channels.push(...this.config.channels[alert.source.component]);
    }
    
    // Remove duplicates
    return [...new Set(channels)];
  }

  /**
   * Deliver alert to channels
   */
  async deliverAlert(alert, channels) {
    const results = {};
    
    for (const channel of channels) {
      try {
        const provider = this.alertProviders.get(channel);
        if (!provider) {
          throw new Error(`No provider registered for channel: ${channel}`);
        }
        
        await provider.send(alert);
        results[channel] = { success: true };
        
        this.metrics.alertsByChannel[channel] = 
          (this.metrics.alertsByChannel[channel] || 0) + 1;
        
      } catch (error) {
        results[channel] = { 
          success: false, 
          error: error.message 
        };
        this.metrics.failedDeliveries++;
        
        console.log(`❌ Failed to deliver alert to ${channel}: ${error.message}`);
      }
    }
    
    return results;
  }

  /**
   * Check if alert should be escalated
   */
  shouldEscalate(alert) {
    return alert.severity === AlertSeverity.CRITICAL || 
           alert.type === AlertTypes.SERVICE_DOWN ||
           alert.type === AlertTypes.RESOURCE_EXHAUSTED;
  }

  /**
   * Schedule escalation
   */
  scheduleEscalation(alert) {
    const escalationId = `escalation_${alert.id}`;
    
    const timer = setTimeout(async () => {
      if (!alert.resolved) {
        await this.escalateAlert(alert);
      }
      this.escalationTimers.delete(escalationId);
    }, this.config.escalationDelay);
    
    this.escalationTimers.set(escalationId, timer);
    
    console.log(`⏰ Escalation scheduled for alert ${alert.id} in ${this.config.escalationDelay}ms`);
  }

  /**
   * Escalate alert
   */
  async escalateAlert(alert) {
    console.log(`🚨 ESCALATING ALERT: ${alert.title}`);
    
    const escalatedAlert = {
      ...alert,
      id: `escalated_${alert.id}`,
      timestamp: new Date().toISOString(),
      severity: AlertSeverity.CRITICAL,
      escalated: true,
      title: `[ESCALATED] ${alert.title}`,
      message: `ESCALATED: ${alert.message}`
    };
    
    // Send to escalation channels
    const escalationChannels = this.config.channels.escalation || [AlertChannels.CONSOLE];
    await this.deliverAlert(escalatedAlert, escalationChannels);
    
    this.metrics.escalatedAlerts++;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId, resolution = {}) {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolution = {
        timestamp: new Date().toISOString(),
        resolvedBy: resolution.resolvedBy,
        method: resolution.method,
        notes: resolution.notes
      };
      
      // Cancel escalation if scheduled
      const escalationId = `escalation_${alertId}`;
      if (this.escalationTimers.has(escalationId)) {
        clearTimeout(this.escalationTimers.get(escalationId));
        this.escalationTimers.delete(escalationId);
      }
      
      console.log(`✅ Alert ${alertId} resolved`);
    }
  }

  /**
   * Get alert history
   */
  getAlertHistory(criteria = {}) {
    let alerts = [...this.alertHistory];
    
    if (criteria.severity) {
      alerts = alerts.filter(a => a.severity === criteria.severity);
    }
    
    if (criteria.type) {
      alerts = alerts.filter(a => a.type === criteria.type);
    }
    
    if (criteria.component) {
      alerts = alerts.filter(a => a.source.component === criteria.component);
    }
    
    if (criteria.since) {
      const since = new Date(criteria.since).getTime();
      alerts = alerts.filter(a => new Date(a.timestamp).getTime() > since);
    }
    
    if (criteria.resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === criteria.resolved);
    }
    
    if (criteria.limit) {
      alerts = alerts.slice(-criteria.limit);
    }
    
    return alerts;
  }

  /**
   * Get alert statistics
   */
  getStatistics() {
    const recentAlerts = this.getAlertHistory({ 
      since: new Date(Date.now() - 3600000).toISOString() // Last hour
    });
    
    return {
      total: this.metrics.totalAlerts,
      recent: recentAlerts.length,
      bySeverity: this.metrics.alertsBySeverity,
      byType: this.metrics.alertsByType,
      byChannel: this.metrics.alertsByChannel,
      throttled: this.metrics.throttledAlerts,
      escalated: this.metrics.escalatedAlerts,
      failedDeliveries: this.metrics.failedDeliveries,
      activeEscalations: this.escalationTimers.size
    };
  }

  /**
   * Start cleanup process
   */
  startCleanup() {
    setInterval(() => {
      this.performCleanup();
    }, 3600000); // Every hour
  }

  /**
   * Perform cleanup
   */
  performCleanup() {
    const cutoff = Date.now() - 86400000; // 24 hours
    
    // Clean alert history
    this.alertHistory = this.alertHistory.filter(alert => 
      new Date(alert.timestamp).getTime() > cutoff
    );
    
    // Clean throttle counters
    for (const [key, counter] of this.throttleCounters.entries()) {
      counter.timestamps = counter.timestamps.filter(ts => ts > cutoff);
      if (counter.timestamps.length === 0) {
        this.throttleCounters.delete(key);
      }
    }
    
    console.log(`🧹 Alert manager cleanup completed`);
  }

  /**
   * Test alert delivery
   */
  async testAlert(channel = null) {
    const testAlert = {
      id: `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: AlertTypes.SYSTEM_HEALTH,
      severity: AlertSeverity.LOW,
      title: 'Test Alert',
      message: 'This is a test alert to verify delivery channels',
      source: { component: 'alert-manager' },
      metadata: { test: true }
    };
    
    const channels = channel ? [channel] : [this.config.defaultChannel];
    return await this.deliverAlert(testAlert, channels);
  }
}

export default AlertManager;

