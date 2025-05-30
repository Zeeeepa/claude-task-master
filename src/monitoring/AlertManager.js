/**
 * Alert Manager
 * 
 * Comprehensive alerting system with multiple notification channels,
 * alert rules, escalation policies, and alert history management
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableSlack: config.enableSlack !== false,
      enableEmail: config.enableEmail !== false,
      enableWebhook: config.enableWebhook || false,
      slackWebhookUrl: config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
      emailConfig: config.emailConfig || {},
      webhookUrl: config.webhookUrl,
      escalationDelay: config.escalationDelay || 300000, // 5 minutes
      maxEscalationLevel: config.maxEscalationLevel || 3,
      alertCooldown: config.alertCooldown || 600000, // 10 minutes
      ...config
    };

    this.logger = new SimpleLogger('AlertManager', config.logLevel || 'info');
    
    // Alert state management
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.alertRules = new Map();
    this.escalationTimers = new Map();
    
    this._setupDefaultRules();
  }

  /**
   * Setup default alert rules
   */
  _setupDefaultRules() {
    // Critical alerts
    this.defineAlertRule('application_down', {
      severity: 'critical',
      threshold: 1,
      duration: 300000, // 5 minutes
      message: 'Application is down for more than 5 minutes',
      channels: ['slack', 'email'],
      escalate: true
    });

    this.defineAlertRule('database_connection_failure', {
      severity: 'critical',
      threshold: 3,
      duration: 60000, // 1 minute
      message: 'Database connection failures detected',
      channels: ['slack', 'email'],
      escalate: true
    });

    this.defineAlertRule('high_error_rate', {
      severity: 'critical',
      threshold: 0.05, // 5%
      duration: 300000, // 5 minutes
      message: 'High error rate detected (>5%)',
      channels: ['slack', 'email'],
      escalate: true
    });

    this.defineAlertRule('memory_usage_high', {
      severity: 'critical',
      threshold: 0.90, // 90%
      duration: 300000, // 5 minutes
      message: 'Memory usage is critically high (>90%)',
      channels: ['slack'],
      escalate: true
    });

    this.defineAlertRule('disk_space_low', {
      severity: 'critical',
      threshold: 0.10, // 10% free
      duration: 600000, // 10 minutes
      message: 'Disk space is critically low (<10% free)',
      channels: ['slack', 'email'],
      escalate: true
    });

    // Warning alerts
    this.defineAlertRule('response_time_high', {
      severity: 'warning',
      threshold: 2000, // 2 seconds
      duration: 600000, // 10 minutes
      message: 'Response time is high (>2 seconds)',
      channels: ['slack'],
      escalate: false
    });

    this.defineAlertRule('queue_backlog_high', {
      severity: 'warning',
      threshold: 100,
      duration: 300000, // 5 minutes
      message: 'Queue backlog is high (>100 items)',
      channels: ['slack'],
      escalate: false
    });

    this.defineAlertRule('cpu_usage_high', {
      severity: 'warning',
      threshold: 0.80, // 80%
      duration: 600000, // 10 minutes
      message: 'CPU usage is high (>80%)',
      channels: ['slack'],
      escalate: false
    });

    this.defineAlertRule('webhook_delivery_failure', {
      severity: 'warning',
      threshold: 5,
      duration: 300000, // 5 minutes
      message: 'Multiple webhook delivery failures detected',
      channels: ['slack'],
      escalate: false
    });

    this.defineAlertRule('integration_timeout', {
      severity: 'warning',
      threshold: 3,
      duration: 600000, // 10 minutes
      message: 'Integration service timeouts detected',
      channels: ['slack'],
      escalate: false
    });
  }

  /**
   * Define alert rules
   */
  defineAlertRule(name, rule) {
    this.alertRules.set(name, {
      name,
      severity: rule.severity || 'warning',
      threshold: rule.threshold,
      duration: rule.duration || 300000,
      message: rule.message,
      channels: rule.channels || ['slack'],
      escalate: rule.escalate || false,
      cooldown: rule.cooldown || this.config.alertCooldown,
      enabled: rule.enabled !== false,
      created: Date.now()
    });
    
    this.logger.info(`Alert rule '${name}' defined`, {
      severity: rule.severity,
      threshold: rule.threshold,
      channels: rule.channels
    });
  }

  /**
   * Send alert
   */
  async sendAlert(alert) {
    try {
      const alertId = this._generateAlertId(alert);
      const existingAlert = this.activeAlerts.get(alertId);
      
      // Check cooldown period
      if (existingAlert && this._isInCooldown(existingAlert)) {
        this.logger.debug(`Alert '${alertId}' is in cooldown period`);
        return;
      }

      // Create alert object
      const alertObj = {
        id: alertId,
        type: alert.type,
        severity: alert.severity || 'warning',
        title: alert.title,
        message: alert.message,
        details: alert.details || {},
        timestamp: alert.timestamp || new Date().toISOString(),
        escalationLevel: 0,
        acknowledged: false,
        resolved: false,
        channels: alert.channels || ['slack']
      };

      // Store active alert
      this.activeAlerts.set(alertId, alertObj);
      this.alertHistory.push({ ...alertObj, action: 'created' });

      // Send to configured channels
      await this._sendToChannels(alertObj);

      // Setup escalation if enabled
      const rule = this.alertRules.get(alert.type);
      if (rule && rule.escalate) {
        this._setupEscalation(alertObj);
      }

      this.emit('alertSent', alertObj);
      this.logger.info(`Alert sent: ${alertObj.title}`, {
        id: alertId,
        severity: alertObj.severity,
        channels: alertObj.channels
      });

      return alertObj;
    } catch (error) {
      this.logger.error('Failed to send alert:', error);
      throw error;
    }
  }

  /**
   * Send Slack alerts
   */
  async sendSlackAlert(alert) {
    if (!this.config.enableSlack || !this.config.slackWebhookUrl) {
      this.logger.warn('Slack alerts not configured');
      return;
    }

    try {
      const color = this._getSeverityColor(alert.severity);
      const payload = {
        username: 'Claude Task Master Alert',
        icon_emoji: ':warning:',
        attachments: [{
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: true
            },
            {
              title: 'Alert ID',
              value: alert.id,
              short: true
            }
          ],
          footer: 'Claude Task Master Monitoring',
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
        }]
      };

      // Add details if available
      if (alert.details && Object.keys(alert.details).length > 0) {
        payload.attachments[0].fields.push({
          title: 'Details',
          value: '```' + JSON.stringify(alert.details, null, 2) + '```',
          short: false
        });
      }

      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      this.logger.debug('Slack alert sent successfully', { alertId: alert.id });
    } catch (error) {
      this.logger.error('Failed to send Slack alert:', error);
      throw error;
    }
  }

  /**
   * Send email alerts
   */
  async sendEmailAlert(alert) {
    if (!this.config.enableEmail) {
      this.logger.warn('Email alerts not configured');
      return;
    }

    try {
      // This would integrate with an email service like SendGrid, SES, etc.
      const emailData = {
        to: this.config.emailConfig.recipients || [],
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        html: this._generateEmailTemplate(alert),
        text: this._generateEmailText(alert)
      };

      // Simulate email sending
      this.logger.info('Email alert would be sent', {
        alertId: alert.id,
        recipients: emailData.to,
        subject: emailData.subject
      });

      // In production, you would use a real email service here
      // await emailService.send(emailData);
    } catch (error) {
      this.logger.error('Failed to send email alert:', error);
      throw error;
    }
  }

  /**
   * Send webhook alerts
   */
  async sendWebhookAlert(alert) {
    if (!this.config.enableWebhook || !this.config.webhookUrl) {
      return;
    }

    try {
      const payload = {
        event: 'alert',
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          details: alert.details,
          timestamp: alert.timestamp
        }
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.statusText}`);
      }

      this.logger.debug('Webhook alert sent successfully', { alertId: alert.id });
    } catch (error) {
      this.logger.error('Failed to send webhook alert:', error);
      throw error;
    }
  }

  /**
   * Escalate alerts
   */
  async escalateAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved || alert.escalationLevel >= this.config.maxEscalationLevel) {
      return;
    }

    alert.escalationLevel++;
    alert.escalatedAt = new Date().toISOString();

    // Add escalation to history
    this.alertHistory.push({
      ...alert,
      action: 'escalated',
      escalationLevel: alert.escalationLevel
    });

    // Send escalated alert
    const escalatedAlert = {
      ...alert,
      title: `[ESCALATED L${alert.escalationLevel}] ${alert.title}`,
      message: `Alert has been escalated to level ${alert.escalationLevel}. Original: ${alert.message}`,
      channels: ['slack', 'email'] // Escalated alerts go to all channels
    };

    await this._sendToChannels(escalatedAlert);

    this.emit('alertEscalated', alert);
    this.logger.warn(`Alert escalated to level ${alert.escalationLevel}`, {
      alertId,
      escalationLevel: alert.escalationLevel
    });

    // Setup next escalation if not at max level
    if (alert.escalationLevel < this.config.maxEscalationLevel) {
      this._setupEscalation(alert);
    }
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.acknowledged) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date().toISOString();

    // Clear escalation timer
    this._clearEscalation(alertId);

    // Add to history
    this.alertHistory.push({
      ...alert,
      action: 'acknowledged',
      acknowledgedBy
    });

    this.emit('alertAcknowledged', alert);
    this.logger.info(`Alert acknowledged`, {
      alertId,
      acknowledgedBy
    });

    return true;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId, resolvedBy) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = new Date().toISOString();

    // Clear escalation timer
    this._clearEscalation(alertId);

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    // Add to history
    this.alertHistory.push({
      ...alert,
      action: 'resolved',
      resolvedBy
    });

    this.emit('alertResolved', alert);
    this.logger.info(`Alert resolved`, {
      alertId,
      resolvedBy
    });

    return true;
  }

  /**
   * Manage alert history
   */
  manageAlertHistory() {
    const maxHistoryAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const cutoff = Date.now() - maxHistoryAge;

    const initialCount = this.alertHistory.length;
    this.alertHistory = this.alertHistory.filter(alert => 
      new Date(alert.timestamp).getTime() > cutoff
    );

    const removed = initialCount - this.alertHistory.length;
    if (removed > 0) {
      this.logger.info(`Cleaned up ${removed} old alert history entries`);
    }
  }

  /**
   * Get alert statistics
   */
  getAlertStats() {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const last7d = now - (7 * 24 * 60 * 60 * 1000);

    const recent24h = this.alertHistory.filter(alert => 
      new Date(alert.timestamp).getTime() > last24h
    );

    const recent7d = this.alertHistory.filter(alert => 
      new Date(alert.timestamp).getTime() > last7d
    );

    return {
      active: this.activeAlerts.size,
      total: this.alertHistory.length,
      last24h: recent24h.length,
      last7d: recent7d.length,
      bySeverity: {
        critical: recent24h.filter(a => a.severity === 'critical').length,
        warning: recent24h.filter(a => a.severity === 'warning').length,
        info: recent24h.filter(a => a.severity === 'info').length
      },
      rules: this.alertRules.size,
      escalations: this.escalationTimers.size
    };
  }

  // Private helper methods

  _generateAlertId(alert) {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${alert.type}-${alert.title}`)
      .digest('hex');
    return `alert-${hash.substring(0, 8)}`;
  }

  _isInCooldown(alert) {
    const rule = this.alertRules.get(alert.type);
    const cooldown = rule ? rule.cooldown : this.config.alertCooldown;
    return Date.now() - new Date(alert.timestamp).getTime() < cooldown;
  }

  async _sendToChannels(alert) {
    const promises = [];

    for (const channel of alert.channels) {
      switch (channel) {
        case 'slack':
          promises.push(this.sendSlackAlert(alert));
          break;
        case 'email':
          promises.push(this.sendEmailAlert(alert));
          break;
        case 'webhook':
          promises.push(this.sendWebhookAlert(alert));
          break;
        default:
          this.logger.warn(`Unknown alert channel: ${channel}`);
      }
    }

    await Promise.allSettled(promises);
  }

  _setupEscalation(alert) {
    const timerId = setTimeout(() => {
      this.escalateAlert(alert.id);
    }, this.config.escalationDelay);

    this.escalationTimers.set(alert.id, timerId);
  }

  _clearEscalation(alertId) {
    const timerId = this.escalationTimers.get(alertId);
    if (timerId) {
      clearTimeout(timerId);
      this.escalationTimers.delete(alertId);
    }
  }

  _getSeverityColor(severity) {
    const colors = {
      critical: '#ff0000',
      warning: '#ffaa00',
      info: '#0099ff'
    };
    return colors[severity] || colors.info;
  }

  _generateEmailTemplate(alert) {
    return `
      <html>
        <body>
          <h2 style="color: ${this._getSeverityColor(alert.severity)}">
            ${alert.title}
          </h2>
          <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
          <p><strong>Message:</strong> ${alert.message}</p>
          <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
          <p><strong>Alert ID:</strong> ${alert.id}</p>
          ${alert.details ? `<pre>${JSON.stringify(alert.details, null, 2)}</pre>` : ''}
          <hr>
          <p><em>Claude Task Master Monitoring System</em></p>
        </body>
      </html>
    `;
  }

  _generateEmailText(alert) {
    return `
      ${alert.title}
      
      Severity: ${alert.severity.toUpperCase()}
      Message: ${alert.message}
      Timestamp: ${alert.timestamp}
      Alert ID: ${alert.id}
      
      ${alert.details ? JSON.stringify(alert.details, null, 2) : ''}
      
      ---
      Claude Task Master Monitoring System
    `;
  }
}

export default AlertManager;

