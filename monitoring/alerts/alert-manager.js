/**
 * Alert Manager
 * Handles alert generation, notification, and management
 */

import EventEmitter from 'events';

export class AlertManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.notificationChannels = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the alert manager
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.setupNotificationChannels();
    this.initialized = true;
    console.log('🚨 Alert manager initialized');
  }

  /**
   * Setup notification channels
   */
  setupNotificationChannels() {
    // Console notification channel (always available)
    this.notificationChannels.set('console', {
      send: this.sendConsoleNotification.bind(this)
    });

    // Email notification channel (placeholder)
    this.notificationChannels.set('email', {
      send: this.sendEmailNotification.bind(this)
    });

    // Webhook notification channel (placeholder)
    this.notificationChannels.set('webhook', {
      send: this.sendWebhookNotification.bind(this)
    });

    // Slack notification channel (placeholder)
    this.notificationChannels.set('slack', {
      send: this.sendSlackNotification.bind(this)
    });
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alertData) {
    const alert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      status: 'active',
      ...alertData
    };

    // Check if this is a duplicate alert
    const existingAlert = this.findSimilarAlert(alert);
    if (existingAlert) {
      await this.updateAlert(existingAlert.id, {
        count: (existingAlert.count || 1) + 1,
        lastSeen: alert.timestamp
      });
      return existingAlert.id;
    }

    // Store the alert
    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push({ ...alert });

    // Send notifications
    await this.sendNotifications(alert);

    // Emit alert event
    this.emit('alert_triggered', alert);

    console.log(`🚨 Alert triggered: ${alert.type} - ${alert.metric || 'N/A'}`);
    return alert.id;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, resolution = 'manual') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;

    this.activeAlerts.delete(alertId);

    // Send resolution notification
    await this.sendResolutionNotification(alert);

    // Emit resolution event
    this.emit('alert_resolved', alert);

    console.log(`✅ Alert resolved: ${alertId}`);
  }

  /**
   * Update an existing alert
   */
  async updateAlert(alertId, updates) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    Object.assign(alert, updates);
    this.emit('alert_updated', alert);
  }

  /**
   * Find similar active alert
   */
  findSimilarAlert(newAlert) {
    for (const alert of this.activeAlerts.values()) {
      if (
        alert.type === newAlert.type &&
        alert.metric === newAlert.metric &&
        alert.status === 'active'
      ) {
        return alert;
      }
    }
    return null;
  }

  /**
   * Send notifications for an alert
   */
  async sendNotifications(alert) {
    const severity = this.getAlertSeverity(alert);
    const channels = this.getNotificationChannels(severity);

    for (const channel of channels) {
      try {
        const notifier = this.notificationChannels.get(channel);
        if (notifier) {
          await notifier.send(alert);
        }
      } catch (error) {
        console.error(`Failed to send notification via ${channel}:`, error);
      }
    }
  }

  /**
   * Send resolution notification
   */
  async sendResolutionNotification(alert) {
    const message = {
      ...alert,
      type: 'alert_resolved',
      message: `Alert resolved: ${alert.type}`
    };

    // Send to console by default
    await this.sendConsoleNotification(message);
  }

  /**
   * Get alert severity level
   */
  getAlertSeverity(alert) {
    if (alert.type === 'threshold_exceeded') {
      const value = alert.value || 0;
      const threshold = alert.threshold || 0;
      const ratio = value / threshold;

      if (ratio >= 2) return 'critical';
      if (ratio >= 1.5) return 'high';
      if (ratio >= 1.2) return 'medium';
      return 'low';
    }

    return 'medium'; // Default severity
  }

  /**
   * Get notification channels for severity
   */
  getNotificationChannels(severity) {
    switch (severity) {
      case 'critical':
        return ['console', 'email', 'slack', 'webhook'];
      case 'high':
        return ['console', 'email', 'slack'];
      case 'medium':
        return ['console', 'slack'];
      case 'low':
        return ['console'];
      default:
        return ['console'];
    }
  }

  /**
   * Console notification
   */
  async sendConsoleNotification(alert) {
    const severity = this.getAlertSeverity(alert);
    const emoji = this.getSeverityEmoji(severity);
    const timestamp = new Date(alert.timestamp).toISOString();
    
    console.log(`${emoji} [${severity.toUpperCase()}] ${timestamp}`);
    console.log(`   Type: ${alert.type}`);
    if (alert.metric) console.log(`   Metric: ${alert.metric}`);
    if (alert.value !== undefined) console.log(`   Value: ${alert.value}`);
    if (alert.threshold !== undefined) console.log(`   Threshold: ${alert.threshold}`);
    if (alert.message) console.log(`   Message: ${alert.message}`);
    console.log('');
  }

  /**
   * Email notification (placeholder)
   */
  async sendEmailNotification(alert) {
    // Placeholder for email notification implementation
    console.log(`📧 Email notification would be sent for alert: ${alert.id}`);
  }

  /**
   * Webhook notification (placeholder)
   */
  async sendWebhookNotification(alert) {
    // Placeholder for webhook notification implementation
    console.log(`🔗 Webhook notification would be sent for alert: ${alert.id}`);
  }

  /**
   * Slack notification (placeholder)
   */
  async sendSlackNotification(alert) {
    // Placeholder for Slack notification implementation
    console.log(`💬 Slack notification would be sent for alert: ${alert.id}`);
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    };
    return emojis[severity] || '⚪';
  }

  /**
   * Generate unique alert ID
   */
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert statistics
   */
  getAlertStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    const recentAlerts = this.alertHistory.filter(
      alert => now - alert.timestamp < oneHour
    );
    const dailyAlerts = this.alertHistory.filter(
      alert => now - alert.timestamp < oneDay
    );

    return {
      active_alerts: this.activeAlerts.size,
      total_alerts: this.alertHistory.length,
      alerts_last_hour: recentAlerts.length,
      alerts_last_day: dailyAlerts.length,
      alert_types: this.getAlertTypeStats(),
      severity_distribution: this.getSeverityStats()
    };
  }

  /**
   * Get alert type statistics
   */
  getAlertTypeStats() {
    const stats = {};
    for (const alert of this.alertHistory) {
      stats[alert.type] = (stats[alert.type] || 0) + 1;
    }
    return stats;
  }

  /**
   * Get severity statistics
   */
  getSeverityStats() {
    const stats = {};
    for (const alert of this.alertHistory) {
      const severity = this.getAlertSeverity(alert);
      stats[severity] = (stats[severity] || 0) + 1;
    }
    return stats;
  }

  /**
   * Clean up old alerts from history
   */
  cleanupHistory(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    const cutoff = Date.now() - maxAge;
    const originalLength = this.alertHistory.length;
    
    this.alertHistory = this.alertHistory.filter(
      alert => alert.timestamp >= cutoff
    );
    
    const removed = originalLength - this.alertHistory.length;
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} old alerts from history`);
    }
  }

  /**
   * Close alert manager
   */
  async close() {
    // Resolve all active alerts
    for (const alertId of this.activeAlerts.keys()) {
      await this.resolveAlert(alertId, 'system_shutdown');
    }

    this.initialized = false;
    console.log('🚨 Alert manager closed');
  }
}

export default AlertManager;

