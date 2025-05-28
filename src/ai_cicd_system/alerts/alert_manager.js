/**
 * @fileoverview Alert Manager
 * @description Comprehensive alerting system with rules, notifications, and escalation
 */

import { AlertSeverity } from '../metrics/metric_types.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Alert Manager with rules, notifications, and escalation policies
 */
export class AlertManager {
  constructor(config = {}) {
    this.config = {
      enableAlerts: config.enableAlerts !== false,
      alertCooldown: config.alertCooldown || 300000, // 5 minutes
      maxActiveAlerts: config.maxActiveAlerts || 1000,
      alertHistorySize: config.alertHistorySize || 10000,
      ...config
    };
    
    this.activeAlerts = new Map();
    this.alertRules = new Map();
    this.alertHistory = [];
    this.notificationChannels = new Map();
    this.escalationPolicies = new Map();
    this.alertCooldowns = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the alert manager
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    log('debug', 'Initializing alert manager...');
    
    this._setupDefaultAlertRules();
    this._setupDefaultNotificationChannels();
    
    this.isInitialized = true;
    log('info', 'Alert manager initialized successfully');
  }

  /**
   * Add an alert rule
   * @param {string} name - Rule name
   * @param {Object} rule - Alert rule configuration
   */
  addAlertRule(name, rule) {
    const alertRule = {
      name,
      type: rule.type || 'metric', // metric, health, event
      condition: rule.condition,
      threshold: rule.threshold,
      operator: rule.operator || 'greater_than',
      severity: rule.severity || AlertSeverity.WARNING,
      message: rule.message || `Alert: ${name}`,
      tags: rule.tags || {},
      cooldown: rule.cooldown || this.config.alertCooldown,
      enabled: rule.enabled !== false,
      notificationChannels: rule.notificationChannels || ['console'],
      escalationPolicy: rule.escalationPolicy || null,
      ...rule
    };

    this.alertRules.set(name, alertRule);
    log('info', `Added alert rule: ${name}`);
  }

  /**
   * Remove an alert rule
   * @param {string} name - Rule name
   */
  removeAlertRule(name) {
    if (this.alertRules.has(name)) {
      this.alertRules.delete(name);
      log('info', `Removed alert rule: ${name}`);
    }
  }

  /**
   * Add a notification channel
   * @param {string} name - Channel name
   * @param {Object} channel - Notification channel
   */
  addNotificationChannel(name, channel) {
    if (!channel || typeof channel.send !== 'function') {
      throw new Error('Notification channel must have a send method');
    }

    this.notificationChannels.set(name, {
      name,
      ...channel
    });
    
    log('info', `Added notification channel: ${name}`);
  }

  /**
   * Remove a notification channel
   * @param {string} name - Channel name
   */
  removeNotificationChannel(name) {
    if (this.notificationChannels.has(name)) {
      this.notificationChannels.delete(name);
      log('info', `Removed notification channel: ${name}`);
    }
  }

  /**
   * Add an escalation policy
   * @param {string} name - Policy name
   * @param {Object} policy - Escalation policy
   */
  addEscalationPolicy(name, policy) {
    this.escalationPolicies.set(name, {
      name,
      steps: policy.steps || [],
      ...policy
    });
    
    log('info', `Added escalation policy: ${name}`);
  }

  /**
   * Send an alert
   * @param {Object} alertData - Alert data
   */
  async sendAlert(alertData) {
    if (!this.config.enableAlerts || !this.isInitialized) {
      return;
    }

    const alertId = this._generateAlertId(alertData);
    
    // Check cooldown
    if (this._isInCooldown(alertData.type, alertData.labels)) {
      log('debug', `Alert ${alertData.type} is in cooldown, skipping`);
      return;
    }

    // Check if we already have too many active alerts
    if (this.activeAlerts.size >= this.config.maxActiveAlerts) {
      log('warning', 'Maximum active alerts reached, skipping new alert');
      return;
    }

    const alert = {
      id: alertId,
      type: alertData.type,
      severity: alertData.severity || AlertSeverity.WARNING,
      message: alertData.message || `Alert: ${alertData.type}`,
      value: alertData.value,
      threshold: alertData.threshold,
      labels: alertData.labels || {},
      timestamp: alertData.timestamp || Date.now(),
      status: 'active',
      notificationsSent: 0,
      escalationLevel: 0,
      ...alertData
    };

    // Store active alert
    this.activeAlerts.set(alertId, alert);
    
    // Add to history
    this.alertHistory.push({ ...alert });
    this._trimAlertHistory();
    
    // Set cooldown
    this._setCooldown(alert.type, alert.labels);
    
    // Send notifications
    await this._sendNotifications(alert);
    
    // Start escalation if policy exists
    this._startEscalation(alert);
    
    log('info', `Alert fired: ${alert.message} (${alert.severity})`);
  }

  /**
   * Resolve an alert
   * @param {string} alertId - Alert ID
   * @param {string} reason - Resolution reason
   */
  async resolveAlert(alertId, reason = 'Manual resolution') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      log('warning', `Alert ${alertId} not found for resolution`);
      return;
    }

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolutionReason = reason;
    
    // Remove from active alerts
    this.activeAlerts.delete(alertId);
    
    // Send resolution notification
    await this._sendResolutionNotification(alert);
    
    log('info', `Alert resolved: ${alert.message} (${reason})`);
  }

  /**
   * Get active alerts
   * @param {Object} filters - Optional filters
   * @returns {Array} Active alerts
   */
  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.activeAlerts.values());
    
    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }
    
    if (filters.type) {
      alerts = alerts.filter(a => a.type === filters.type);
    }
    
    if (filters.tags) {
      alerts = alerts.filter(a => {
        return Object.entries(filters.tags).every(([key, value]) => 
          a.labels[key] === value
        );
      });
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get alert history
   * @param {Object} filters - Optional filters
   * @param {number} limit - Maximum number of alerts
   * @returns {Array} Alert history
   */
  getAlertHistory(filters = {}, limit = 100) {
    let history = this.alertHistory.slice();
    
    if (filters.severity) {
      history = history.filter(a => a.severity === filters.severity);
    }
    
    if (filters.type) {
      history = history.filter(a => a.type === filters.type);
    }
    
    if (filters.timeRange) {
      const { start, end } = filters.timeRange;
      history = history.filter(a => a.timestamp >= start && a.timestamp <= end);
    }
    
    return history
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get alert statistics
   * @returns {Object} Alert statistics
   */
  async getStatistics() {
    const now = Date.now();
    const last24h = now - 86400000; // 24 hours
    const last1h = now - 3600000; // 1 hour
    
    const recent24h = this.alertHistory.filter(a => a.timestamp >= last24h);
    const recent1h = this.alertHistory.filter(a => a.timestamp >= last1h);
    
    const severityCount = {};
    for (const severity of Object.values(AlertSeverity)) {
      severityCount[severity] = recent24h.filter(a => a.severity === severity).length;
    }
    
    return {
      active_alerts: this.activeAlerts.size,
      total_alerts_fired: this.alertHistory.length,
      alerts_last_24h: recent24h.length,
      alerts_last_1h: recent1h.length,
      alerts_by_severity_24h: severityCount,
      alert_rules: this.alertRules.size,
      notification_channels: this.notificationChannels.size,
      escalation_policies: this.escalationPolicies.size
    };
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  async getHealth() {
    const stats = await this.getStatistics();
    
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      active_alerts: stats.active_alerts,
      alert_rules: stats.alert_rules,
      notification_channels: stats.notification_channels
    };
  }

  /**
   * Shutdown the alert manager
   */
  async shutdown() {
    log('debug', 'Shutting down alert manager...');
    
    // Resolve all active alerts
    const activeAlertIds = Array.from(this.activeAlerts.keys());
    for (const alertId of activeAlertIds) {
      await this.resolveAlert(alertId, 'System shutdown');
    }
    
    this.activeAlerts.clear();
    this.alertRules.clear();
    this.alertHistory.length = 0;
    this.notificationChannels.clear();
    this.escalationPolicies.clear();
    this.alertCooldowns.clear();
    
    this.isInitialized = false;
    log('info', 'Alert manager shut down successfully');
  }

  // Private methods

  /**
   * Setup default alert rules
   * @private
   */
  _setupDefaultAlertRules() {
    // High memory usage alert
    this.addAlertRule('high_memory_usage', {
      type: 'metric',
      condition: 'memory_usage > threshold',
      threshold: 0.8,
      operator: 'greater_than',
      severity: AlertSeverity.WARNING,
      message: 'High memory usage detected',
      cooldown: 300000 // 5 minutes
    });
    
    // Critical memory usage alert
    this.addAlertRule('critical_memory_usage', {
      type: 'metric',
      condition: 'memory_usage > threshold',
      threshold: 0.9,
      operator: 'greater_than',
      severity: AlertSeverity.CRITICAL,
      message: 'Critical memory usage detected',
      cooldown: 60000 // 1 minute
    });
    
    // High API response time alert
    this.addAlertRule('high_api_response_time', {
      type: 'metric',
      condition: 'api_response_time > threshold',
      threshold: 2000,
      operator: 'greater_than',
      severity: AlertSeverity.WARNING,
      message: 'High API response time detected',
      cooldown: 300000
    });
    
    // High error rate alert
    this.addAlertRule('high_error_rate', {
      type: 'metric',
      condition: 'error_rate > threshold',
      threshold: 0.05,
      operator: 'greater_than',
      severity: AlertSeverity.WARNING,
      message: 'High error rate detected',
      cooldown: 300000
    });
    
    // Service unhealthy alert
    this.addAlertRule('service_unhealthy', {
      type: 'health',
      condition: 'status === "unhealthy"',
      severity: AlertSeverity.CRITICAL,
      message: 'Service is unhealthy',
      cooldown: 60000
    });
  }

  /**
   * Setup default notification channels
   * @private
   */
  _setupDefaultNotificationChannels() {
    // Console notification channel
    this.addNotificationChannel('console', {
      send: async (alert) => {
        const emoji = this._getSeverityEmoji(alert.severity);
        log('warning', `${emoji} ALERT: ${alert.message} (${alert.severity})`);
      }
    });
    
    // Log file notification channel
    this.addNotificationChannel('log', {
      send: async (alert) => {
        log('info', `Alert: ${JSON.stringify(alert, null, 2)}`);
      }
    });
  }

  /**
   * Generate alert ID
   * @param {Object} alertData - Alert data
   * @returns {string} Alert ID
   * @private
   */
  _generateAlertId(alertData) {
    const hash = JSON.stringify({
      type: alertData.type,
      labels: alertData.labels || {}
    });
    
    return `alert_${Date.now()}_${Buffer.from(hash).toString('base64').slice(0, 8)}`;
  }

  /**
   * Check if alert is in cooldown
   * @param {string} type - Alert type
   * @param {Object} labels - Alert labels
   * @returns {boolean} True if in cooldown
   * @private
   */
  _isInCooldown(type, labels = {}) {
    const key = `${type}_${JSON.stringify(labels)}`;
    const cooldownEnd = this.alertCooldowns.get(key);
    
    return cooldownEnd && Date.now() < cooldownEnd;
  }

  /**
   * Set cooldown for alert
   * @param {string} type - Alert type
   * @param {Object} labels - Alert labels
   * @private
   */
  _setCooldown(type, labels = {}) {
    const key = `${type}_${JSON.stringify(labels)}`;
    const cooldownEnd = Date.now() + this.config.alertCooldown;
    
    this.alertCooldowns.set(key, cooldownEnd);
    
    // Clean up expired cooldowns
    setTimeout(() => {
      this.alertCooldowns.delete(key);
    }, this.config.alertCooldown);
  }

  /**
   * Send notifications for alert
   * @param {Object} alert - Alert object
   * @private
   */
  async _sendNotifications(alert) {
    const rule = this.alertRules.get(alert.type);
    const channels = rule?.notificationChannels || ['console'];
    
    const notificationPromises = channels.map(async (channelName) => {
      const channel = this.notificationChannels.get(channelName);
      if (!channel) {
        log('warning', `Notification channel ${channelName} not found`);
        return;
      }
      
      try {
        await channel.send(alert);
        alert.notificationsSent++;
      } catch (error) {
        log('error', `Failed to send notification via ${channelName}: ${error.message}`);
      }
    });
    
    await Promise.allSettled(notificationPromises);
  }

  /**
   * Send resolution notification
   * @param {Object} alert - Alert object
   * @private
   */
  async _sendResolutionNotification(alert) {
    const rule = this.alertRules.get(alert.type);
    const channels = rule?.notificationChannels || ['console'];
    
    const resolutionAlert = {
      ...alert,
      message: `RESOLVED: ${alert.message}`,
      status: 'resolved'
    };
    
    const notificationPromises = channels.map(async (channelName) => {
      const channel = this.notificationChannels.get(channelName);
      if (channel && typeof channel.sendResolution === 'function') {
        try {
          await channel.sendResolution(resolutionAlert);
        } catch (error) {
          log('error', `Failed to send resolution notification via ${channelName}: ${error.message}`);
        }
      }
    });
    
    await Promise.allSettled(notificationPromises);
  }

  /**
   * Start escalation for alert
   * @param {Object} alert - Alert object
   * @private
   */
  _startEscalation(alert) {
    const rule = this.alertRules.get(alert.type);
    if (!rule?.escalationPolicy) {
      return;
    }
    
    const policy = this.escalationPolicies.get(rule.escalationPolicy);
    if (!policy || !policy.steps || policy.steps.length === 0) {
      return;
    }
    
    // Start escalation timer
    setTimeout(async () => {
      await this._escalateAlert(alert, policy);
    }, policy.steps[0].delay || 300000); // Default 5 minutes
  }

  /**
   * Escalate alert
   * @param {Object} alert - Alert object
   * @param {Object} policy - Escalation policy
   * @private
   */
  async _escalateAlert(alert, policy) {
    if (!this.activeAlerts.has(alert.id)) {
      return; // Alert already resolved
    }
    
    const step = policy.steps[alert.escalationLevel];
    if (!step) {
      return; // No more escalation steps
    }
    
    alert.escalationLevel++;
    alert.severity = step.severity || alert.severity;
    
    // Send escalated notification
    await this._sendNotifications({
      ...alert,
      message: `ESCALATED: ${alert.message}`
    });
    
    // Schedule next escalation
    if (alert.escalationLevel < policy.steps.length) {
      const nextStep = policy.steps[alert.escalationLevel];
      setTimeout(async () => {
        await this._escalateAlert(alert, policy);
      }, nextStep.delay || 300000);
    }
  }

  /**
   * Trim alert history to configured size
   * @private
   */
  _trimAlertHistory() {
    if (this.alertHistory.length > this.config.alertHistorySize) {
      this.alertHistory.splice(0, this.alertHistory.length - this.config.alertHistorySize);
    }
  }

  /**
   * Get emoji for severity level
   * @param {string} severity - Alert severity
   * @returns {string} Emoji
   * @private
   */
  _getSeverityEmoji(severity) {
    const emojis = {
      [AlertSeverity.INFO]: 'ℹ️',
      [AlertSeverity.WARNING]: '⚠️',
      [AlertSeverity.CRITICAL]: '🚨'
    };
    
    return emojis[severity] || '📢';
  }
}

/**
 * Email Notification Channel
 */
export class EmailNotificationChannel {
  constructor(config) {
    this.name = 'email';
    this.config = config;
  }

  async send(alert) {
    // Mock email sending - replace with actual email service
    log('info', `📧 Email Alert: ${alert.message} to ${this.config.recipients?.join(', ')}`);
  }

  async sendResolution(alert) {
    log('info', `📧 Email Resolution: ${alert.message} to ${this.config.recipients?.join(', ')}`);
  }
}

/**
 * Slack Notification Channel
 */
export class SlackNotificationChannel {
  constructor(config) {
    this.name = 'slack';
    this.config = config;
  }

  async send(alert) {
    // Mock Slack sending - replace with actual Slack API
    log('info', `💬 Slack Alert: ${alert.message} to ${this.config.channel}`);
  }

  async sendResolution(alert) {
    log('info', `💬 Slack Resolution: ${alert.message} to ${this.config.channel}`);
  }
}

export default AlertManager;

