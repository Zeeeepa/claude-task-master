/**
 * escalation-manager.js
 * 
 * Automated escalation system for error handling that determines when
 * to escalate to human intervention and manages notification workflows.
 */

import { log } from '../../scripts/modules/utils.js';
import { ErrorTypes } from '../core/error-classifier.js';

/**
 * Escalation levels and their configurations
 */
export const EscalationLevels = {
  NONE: {
    level: 0,
    name: 'none',
    description: 'No escalation required'
  },
  AUTOMATED: {
    level: 1,
    name: 'automated',
    description: 'Automated resolution attempted'
  },
  MONITORING: {
    level: 2,
    name: 'monitoring',
    description: 'Added to monitoring queue'
  },
  SUPPORT: {
    level: 3,
    name: 'support',
    description: 'Support team notification'
  },
  ENGINEERING: {
    level: 4,
    name: 'engineering',
    description: 'Engineering team escalation'
  },
  CRITICAL: {
    level: 5,
    name: 'critical',
    description: 'Critical incident response'
  }
};

/**
 * Notification channels
 */
export const NotificationChannels = {
  LOG: 'log',
  EMAIL: 'email',
  SLACK: 'slack',
  WEBHOOK: 'webhook',
  LINEAR: 'linear',
  SMS: 'sms'
};

/**
 * Escalation rules engine
 */
class EscalationRules {
  constructor() {
    this.rules = new Map();
    this._initializeDefaultRules();
  }

  /**
   * Initialize default escalation rules
   * @private
   */
  _initializeDefaultRules() {
    // Critical errors - immediate escalation
    this.addRule('critical_errors', {
      condition: (error, classification, context) => {
        return classification.severity === 'critical' || 
               classification.type === 'AUTHENTICATION_ERROR' ||
               classification.type === 'RESOURCE_ERROR';
      },
      escalationLevel: EscalationLevels.CRITICAL,
      immediateNotification: true,
      channels: [NotificationChannels.SLACK, NotificationChannels.EMAIL],
      maxRetries: 0
    });

    // High frequency errors
    this.addRule('high_frequency', {
      condition: (error, classification, context) => {
        return context.errorFrequency > 10 && context.timeWindow < 300000; // 10 errors in 5 minutes
      },
      escalationLevel: EscalationLevels.ENGINEERING,
      immediateNotification: true,
      channels: [NotificationChannels.SLACK],
      maxRetries: 2
    });

    // Retry exhaustion
    this.addRule('retry_exhaustion', {
      condition: (error, classification, context) => {
        return context.retryAttempt >= classification.maxRetries;
      },
      escalationLevel: EscalationLevels.SUPPORT,
      immediateNotification: false,
      channels: [NotificationChannels.LOG, NotificationChannels.LINEAR],
      maxRetries: classification.maxRetries
    });

    // Logic errors - require human review
    this.addRule('logic_errors', {
      condition: (error, classification, context) => {
        return classification.type === 'LOGIC_ERROR';
      },
      escalationLevel: EscalationLevels.ENGINEERING,
      immediateNotification: true,
      channels: [NotificationChannels.LINEAR, NotificationChannels.SLACK],
      maxRetries: 1
    });

    // Unknown errors - monitoring required
    this.addRule('unknown_errors', {
      condition: (error, classification, context) => {
        return classification.type === 'UNKNOWN_ERROR' && classification.confidence < 0.5;
      },
      escalationLevel: EscalationLevels.MONITORING,
      immediateNotification: false,
      channels: [NotificationChannels.LOG],
      maxRetries: 2
    });

    // Production environment errors
    this.addRule('production_errors', {
      condition: (error, classification, context) => {
        return context.environment === 'production' && classification.severity !== 'low';
      },
      escalationLevel: EscalationLevels.SUPPORT,
      immediateNotification: true,
      channels: [NotificationChannels.SLACK, NotificationChannels.LINEAR],
      maxRetries: 3
    });
  }

  /**
   * Add custom escalation rule
   */
  addRule(name, rule) {
    this.rules.set(name, {
      name,
      condition: rule.condition,
      escalationLevel: rule.escalationLevel,
      immediateNotification: rule.immediateNotification || false,
      channels: rule.channels || [NotificationChannels.LOG],
      maxRetries: rule.maxRetries || 3,
      cooldownPeriod: rule.cooldownPeriod || 300000, // 5 minutes
      priority: rule.priority || 5
    });
  }

  /**
   * Evaluate escalation rules for an error
   */
  evaluate(error, classification, context) {
    const matchedRules = [];

    for (const [name, rule] of this.rules) {
      try {
        if (rule.condition(error, classification, context)) {
          matchedRules.push(rule);
        }
      } catch (ruleError) {
        log('warn', `Error evaluating escalation rule ${name}: ${ruleError.message}`);
      }
    }

    // Sort by priority (lower number = higher priority)
    return matchedRules.sort((a, b) => (a.priority || 5) - (b.priority || 5));
  }

  /**
   * Remove escalation rule
   */
  removeRule(name) {
    return this.rules.delete(name);
  }

  /**
   * Get all rules
   */
  getAllRules() {
    return Array.from(this.rules.values());
  }
}

/**
 * Notification manager for different channels
 */
class NotificationManager {
  constructor() {
    this.channels = new Map();
    this.notificationHistory = [];
    this.rateLimits = new Map();
    
    this._initializeChannels();
  }

  /**
   * Initialize notification channels
   * @private
   */
  _initializeChannels() {
    // Log channel
    this.channels.set(NotificationChannels.LOG, {
      send: async (message, context) => {
        log(context.severity || 'info', `[ESCALATION] ${message}`);
        return { success: true, channel: 'log' };
      },
      rateLimit: null
    });

    // Linear channel (create issues)
    this.channels.set(NotificationChannels.LINEAR, {
      send: async (message, context) => {
        // This would integrate with Linear API
        log('info', `[LINEAR] Would create issue: ${message}`);
        return { success: true, channel: 'linear', issueId: 'mock-issue-id' };
      },
      rateLimit: { maxPerHour: 10, window: 3600000 }
    });

    // Slack channel
    this.channels.set(NotificationChannels.SLACK, {
      send: async (message, context) => {
        // This would integrate with Slack API
        log('info', `[SLACK] Would send message: ${message}`);
        return { success: true, channel: 'slack' };
      },
      rateLimit: { maxPerHour: 20, window: 3600000 }
    });

    // Email channel
    this.channels.set(NotificationChannels.EMAIL, {
      send: async (message, context) => {
        // This would integrate with email service
        log('info', `[EMAIL] Would send email: ${message}`);
        return { success: true, channel: 'email' };
      },
      rateLimit: { maxPerHour: 5, window: 3600000 }
    });

    // Webhook channel
    this.channels.set(NotificationChannels.WEBHOOK, {
      send: async (message, context) => {
        // This would send HTTP webhook
        log('info', `[WEBHOOK] Would send webhook: ${message}`);
        return { success: true, channel: 'webhook' };
      },
      rateLimit: { maxPerHour: 50, window: 3600000 }
    });
  }

  /**
   * Send notification through specified channels
   */
  async sendNotification(message, channels, context = {}) {
    const results = [];

    for (const channelName of channels) {
      try {
        // Check rate limits
        if (!this._checkRateLimit(channelName)) {
          log('warn', `Rate limit exceeded for channel ${channelName}`);
          results.push({ 
            channel: channelName, 
            success: false, 
            error: 'Rate limit exceeded' 
          });
          continue;
        }

        const channel = this.channels.get(channelName);
        if (!channel) {
          log('warn', `Unknown notification channel: ${channelName}`);
          results.push({ 
            channel: channelName, 
            success: false, 
            error: 'Unknown channel' 
          });
          continue;
        }

        const result = await channel.send(message, context);
        results.push(result);

        // Update rate limit tracking
        this._updateRateLimit(channelName);

        // Record notification history
        this.notificationHistory.push({
          timestamp: Date.now(),
          channel: channelName,
          message: message.substring(0, 200),
          context: context.errorId || 'unknown',
          success: result.success
        });

      } catch (error) {
        log('error', `Failed to send notification via ${channelName}: ${error.message}`);
        results.push({ 
          channel: channelName, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Check rate limit for channel
   * @private
   */
  _checkRateLimit(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel?.rateLimit) return true;

    const now = Date.now();
    const windowStart = now - channel.rateLimit.window;
    
    const recentNotifications = this.notificationHistory.filter(
      n => n.channel === channelName && n.timestamp > windowStart
    );

    return recentNotifications.length < channel.rateLimit.maxPerHour;
  }

  /**
   * Update rate limit tracking
   * @private
   */
  _updateRateLimit(channelName) {
    // Rate limiting is handled by checking notification history
    // Keep only recent notifications for memory efficiency
    const oneHourAgo = Date.now() - 3600000;
    this.notificationHistory = this.notificationHistory.filter(
      n => n.timestamp > oneHourAgo
    );
  }

  /**
   * Add custom notification channel
   */
  addChannel(name, config) {
    this.channels.set(name, config);
  }

  /**
   * Get notification statistics
   */
  getStats() {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentNotifications = this.notificationHistory.filter(
      n => n.timestamp > last24h
    );

    const byChannel = {};
    recentNotifications.forEach(n => {
      if (!byChannel[n.channel]) {
        byChannel[n.channel] = { total: 0, successful: 0 };
      }
      byChannel[n.channel].total++;
      if (n.success) {
        byChannel[n.channel].successful++;
      }
    });

    return {
      totalNotifications: recentNotifications.length,
      byChannel,
      availableChannels: Array.from(this.channels.keys())
    };
  }
}

/**
 * Main escalation manager
 */
export class EscalationManager {
  constructor(options = {}) {
    this.rules = new EscalationRules();
    this.notifications = new NotificationManager();
    this.escalationHistory = [];
    this.activeEscalations = new Map();
    this.cooldownPeriods = new Map();
    
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.defaultCooldown = options.defaultCooldown || 300000; // 5 minutes
  }

  /**
   * Evaluate and potentially escalate an error
   */
  async evaluateEscalation(error, classification, context = {}) {
    const escalationId = this._generateEscalationId();
    const timestamp = Date.now();

    // Enhance context with additional information
    const enhancedContext = await this._enhanceContext(error, classification, context);

    // Evaluate escalation rules
    const matchedRules = this.rules.evaluate(error, classification, enhancedContext);

    if (matchedRules.length === 0) {
      log('debug', 'No escalation rules matched for error');
      return {
        escalated: false,
        escalationId,
        level: EscalationLevels.NONE
      };
    }

    // Use the highest priority rule
    const primaryRule = matchedRules[0];
    
    // Check cooldown period
    if (this._isInCooldown(primaryRule.name, enhancedContext)) {
      log('debug', `Escalation rule ${primaryRule.name} is in cooldown period`);
      return {
        escalated: false,
        escalationId,
        level: EscalationLevels.NONE,
        reason: 'cooldown_period'
      };
    }

    // Perform escalation
    const escalationResult = await this._performEscalation(
      escalationId,
      error,
      classification,
      enhancedContext,
      primaryRule
    );

    // Record escalation
    this._recordEscalation(escalationId, {
      timestamp,
      error: this._sanitizeError(error),
      classification,
      context: enhancedContext,
      rule: primaryRule.name,
      level: primaryRule.escalationLevel,
      notifications: escalationResult.notifications,
      success: escalationResult.success
    });

    // Set cooldown period
    this._setCooldown(primaryRule.name, enhancedContext, primaryRule.cooldownPeriod);

    return {
      escalated: true,
      escalationId,
      level: primaryRule.escalationLevel,
      rule: primaryRule.name,
      notifications: escalationResult.notifications,
      success: escalationResult.success
    };
  }

  /**
   * Perform the actual escalation
   * @private
   */
  async _performEscalation(escalationId, error, classification, context, rule) {
    const message = this._buildEscalationMessage(error, classification, context, rule);
    
    log('info', `Escalating error ${escalationId} via rule ${rule.name} to level ${rule.escalationLevel.name}`);

    // Send notifications
    const notificationResults = await this.notifications.sendNotification(
      message,
      rule.channels,
      {
        escalationId,
        errorId: context.errorId,
        severity: classification.severity,
        level: rule.escalationLevel.name,
        immediate: rule.immediateNotification
      }
    );

    // Track active escalation
    this.activeEscalations.set(escalationId, {
      timestamp: Date.now(),
      level: rule.escalationLevel,
      rule: rule.name,
      resolved: false
    });

    const success = notificationResults.every(r => r.success);
    
    return {
      success,
      notifications: notificationResults
    };
  }

  /**
   * Build escalation message
   * @private
   */
  _buildEscalationMessage(error, classification, context, rule) {
    const timestamp = new Date().toISOString();
    const errorMessage = error.message || String(error);
    
    let message = `🚨 Error Escalation - Level: ${rule.escalationLevel.name.toUpperCase()}\n\n`;
    message += `Time: ${timestamp}\n`;
    message += `Error Type: ${classification.type}\n`;
    message += `Severity: ${classification.severity}\n`;
    message += `Confidence: ${Math.round(classification.confidence * 100)}%\n`;
    message += `Operation: ${context.operation || 'unknown'}\n`;
    
    if (context.retryAttempt) {
      message += `Retry Attempt: ${context.retryAttempt}/${classification.maxRetries}\n`;
    }
    
    if (context.errorFrequency) {
      message += `Error Frequency: ${context.errorFrequency} in last ${Math.round(context.timeWindow / 60000)} minutes\n`;
    }
    
    message += `\nError Message:\n${errorMessage.substring(0, 500)}\n`;
    
    if (classification.strategy) {
      message += `\nRecommended Strategy: ${classification.strategy}\n`;
    }
    
    if (context.environment) {
      message += `Environment: ${context.environment}\n`;
    }

    return message;
  }

  /**
   * Enhance context with additional information
   * @private
   */
  async _enhanceContext(error, classification, context) {
    const enhanced = { ...context };

    // Add error frequency information
    if (!enhanced.errorFrequency) {
      enhanced.errorFrequency = this._calculateErrorFrequency(error, classification);
      enhanced.timeWindow = 300000; // 5 minutes
    }

    // Add environment information
    if (!enhanced.environment) {
      enhanced.environment = process.env.NODE_ENV || 'development';
    }

    // Add component information
    if (!enhanced.component && error.stack) {
      enhanced.component = this._extractComponent(error.stack);
    }

    return enhanced;
  }

  /**
   * Calculate error frequency for similar errors
   * @private
   */
  _calculateErrorFrequency(error, classification) {
    const fiveMinutesAgo = Date.now() - 300000;
    const errorMessage = error.message || String(error);
    
    return this.escalationHistory.filter(e => {
      return e.timestamp > fiveMinutesAgo &&
             e.classification.type === classification.type &&
             this._isSimilarError(e.error.message, errorMessage);
    }).length;
  }

  /**
   * Check if two error messages are similar
   * @private
   */
  _isSimilarError(message1, message2) {
    // Simple similarity check - could be enhanced with more sophisticated algorithms
    const normalize = (msg) => msg.toLowerCase().replace(/\d+/g, 'N').replace(/[^\w\s]/g, '');
    return normalize(message1) === normalize(message2);
  }

  /**
   * Extract component from stack trace
   * @private
   */
  _extractComponent(stack) {
    const lines = stack.split('\n');
    for (const line of lines) {
      const match = line.match(/at\s+.*?([^/\\]+\.js):/);
      if (match) {
        return match[1];
      }
    }
    return 'unknown';
  }

  /**
   * Check if rule is in cooldown period
   * @private
   */
  _isInCooldown(ruleName, context) {
    const key = `${ruleName}_${context.operation || 'default'}`;
    const cooldownEnd = this.cooldownPeriods.get(key);
    return cooldownEnd && Date.now() < cooldownEnd;
  }

  /**
   * Set cooldown period for rule
   * @private
   */
  _setCooldown(ruleName, context, duration) {
    const key = `${ruleName}_${context.operation || 'default'}`;
    this.cooldownPeriods.set(key, Date.now() + (duration || this.defaultCooldown));
  }

  /**
   * Record escalation in history
   * @private
   */
  _recordEscalation(escalationId, record) {
    this.escalationHistory.push({ escalationId, ...record });
    
    // Maintain history size limit
    if (this.escalationHistory.length > this.maxHistorySize) {
      this.escalationHistory.shift();
    }
  }

  /**
   * Sanitize error for storage
   * @private
   */
  _sanitizeError(error) {
    return {
      message: (error.message || String(error)).substring(0, 1000),
      name: error.name,
      code: error.code,
      status: error.status
    };
  }

  /**
   * Generate escalation ID
   * @private
   */
  _generateEscalationId() {
    return `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Resolve an active escalation
   */
  resolveEscalation(escalationId, resolution = {}) {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      return false;
    }

    escalation.resolved = true;
    escalation.resolvedAt = Date.now();
    escalation.resolution = resolution;

    log('info', `Escalation ${escalationId} resolved: ${resolution.reason || 'manual'}`);
    
    return true;
  }

  /**
   * Get escalation statistics
   */
  getStats(timeRange = '24h') {
    const timeRangeMs = this._parseTimeRange(timeRange);
    const cutoff = Date.now() - timeRangeMs;
    
    const recentEscalations = this.escalationHistory.filter(e => e.timestamp >= cutoff);
    
    const stats = {
      total: recentEscalations.length,
      byLevel: {},
      byRule: {},
      successRate: 0,
      activeEscalations: this.activeEscalations.size
    };

    recentEscalations.forEach(e => {
      const level = e.level.name;
      stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
      stats.byRule[e.rule] = (stats.byRule[e.rule] || 0) + 1;
    });

    const successful = recentEscalations.filter(e => e.success).length;
    stats.successRate = recentEscalations.length > 0 ? (successful / recentEscalations.length) * 100 : 0;

    return stats;
  }

  /**
   * Parse time range string
   * @private
   */
  _parseTimeRange(timeRange) {
    const units = { m: 60000, h: 3600000, d: 86400000 };
    const match = timeRange.match(/^(\d+)([mhd])$/);
    return match ? parseInt(match[1]) * units[match[2]] : 86400000;
  }

  /**
   * Add custom escalation rule
   */
  addRule(name, rule) {
    this.rules.addRule(name, rule);
  }

  /**
   * Add custom notification channel
   */
  addNotificationChannel(name, config) {
    this.notifications.addChannel(name, config);
  }

  /**
   * Get escalation history
   */
  getHistory(limit = 100) {
    return this.escalationHistory
      .slice(-limit)
      .reverse()
      .map(e => ({
        escalationId: e.escalationId,
        timestamp: new Date(e.timestamp).toISOString(),
        level: e.level.name,
        rule: e.rule,
        errorType: e.classification.type,
        severity: e.classification.severity,
        success: e.success,
        operation: e.context.operation
      }));
  }

  /**
   * Clear escalation history and reset cooldowns
   */
  reset() {
    this.escalationHistory = [];
    this.activeEscalations.clear();
    this.cooldownPeriods.clear();
  }
}

// Export singleton instance
export const escalationManager = new EscalationManager();

