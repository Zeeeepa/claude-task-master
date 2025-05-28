/**
 * @fileoverview Notification System
 * @description Error notification and alerting system
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Notification channels
 */
export const NotificationChannel = {
    SLACK: 'slack',
    EMAIL: 'email',
    LINEAR: 'linear',
    WEBHOOK: 'webhook',
    SMS: 'sms'
};

/**
 * Notification priorities
 */
export const NotificationPriority = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Error notification and alerting system
 */
export class NotificationSystem {
    constructor(config = {}) {
        this.config = {
            enableRateLimiting: config.enableRateLimiting !== false,
            rateLimitWindow: config.rateLimitWindow || 300000, // 5 minutes
            maxNotificationsPerWindow: config.maxNotificationsPerWindow || 10,
            enableBatching: config.enableBatching !== false,
            batchInterval: config.batchInterval || 60000, // 1 minute
            batchSize: config.batchSize || 5,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 5000,
            ...config
        };

        this.channels = new Map();
        this.notificationQueue = [];
        this.notificationHistory = [];
        this.rateLimitTracker = new Map();
        this.batchTimer = null;
        
        this._initializeDefaultChannels();
    }

    /**
     * Send error notification
     * @param {Object} notification - Notification details
     * @returns {Promise<Object>} Send result
     */
    async sendNotification(notification) {
        const {
            escalation,
            channels = ['slack'],
            priority = NotificationPriority.MEDIUM,
            template = 'default',
            metadata = {}
        } = notification;

        const notificationId = this._generateNotificationId();
        
        const notificationData = {
            id: notificationId,
            escalation,
            channels,
            priority,
            template,
            metadata,
            timestamp: Date.now(),
            status: 'pending',
            attempts: 0,
            results: {}
        };

        this.notificationHistory.push(notificationData);

        // Check rate limiting
        if (this._isRateLimited(channels, priority)) {
            log('warn', 'Notification rate limited', {
                notificationId,
                channels,
                priority
            });
            
            notificationData.status = 'rate_limited';
            return {
                success: false,
                reason: 'rate_limited',
                notificationId
            };
        }

        // Add to queue for batching or send immediately
        if (this.config.enableBatching && priority !== NotificationPriority.CRITICAL) {
            this._addToBatch(notificationData);
            return {
                success: true,
                reason: 'queued_for_batch',
                notificationId
            };
        } else {
            return await this._sendImmediately(notificationData);
        }
    }

    /**
     * Send notification immediately
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendImmediately(notificationData) {
        log('info', 'Sending immediate notification', {
            notificationId: notificationData.id,
            channels: notificationData.channels,
            priority: notificationData.priority
        });

        const results = {};
        let overallSuccess = true;

        for (const channelName of notificationData.channels) {
            const channel = this.channels.get(channelName);
            
            if (!channel) {
                log('warn', 'Unknown notification channel', { channel: channelName });
                results[channelName] = {
                    success: false,
                    error: 'channel_not_found'
                };
                overallSuccess = false;
                continue;
            }

            try {
                const message = this._buildMessage(notificationData, channelName);
                const result = await this._sendToChannel(channel, message, notificationData);
                
                results[channelName] = result;
                
                if (!result.success) {
                    overallSuccess = false;
                }

                // Update rate limiting
                this._updateRateLimit(channelName, notificationData.priority);

            } catch (error) {
                log('error', 'Failed to send notification to channel', {
                    channel: channelName,
                    error: error.message
                });
                
                results[channelName] = {
                    success: false,
                    error: error.message
                };
                overallSuccess = false;
            }
        }

        notificationData.status = overallSuccess ? 'sent' : 'partial_failure';
        notificationData.results = results;
        notificationData.attempts++;

        return {
            success: overallSuccess,
            notificationId: notificationData.id,
            results
        };
    }

    /**
     * Add notification to batch
     * @param {Object} notificationData - Notification data
     * @private
     */
    _addToBatch(notificationData) {
        this.notificationQueue.push(notificationData);
        
        log('debug', 'Notification added to batch', {
            notificationId: notificationData.id,
            queueSize: this.notificationQueue.length
        });

        // Start batch timer if not already running
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this._processBatch();
            }, this.config.batchInterval);
        }

        // Process batch immediately if it reaches max size
        if (this.notificationQueue.length >= this.config.batchSize) {
            this._processBatch();
        }
    }

    /**
     * Process notification batch
     * @private
     */
    async _processBatch() {
        if (this.notificationQueue.length === 0) {
            return;
        }

        log('info', 'Processing notification batch', {
            batchSize: this.notificationQueue.length
        });

        const batch = this.notificationQueue.splice(0, this.config.batchSize);
        
        // Clear timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Group notifications by channel for efficient sending
        const channelGroups = this._groupByChannel(batch);

        for (const [channelName, notifications] of channelGroups.entries()) {
            const channel = this.channels.get(channelName);
            
            if (!channel) {
                continue;
            }

            try {
                if (channel.supportsBatching) {
                    // Send as batch
                    const batchMessage = this._buildBatchMessage(notifications, channelName);
                    await this._sendToChannel(channel, batchMessage, { batch: true });
                } else {
                    // Send individually
                    for (const notification of notifications) {
                        const message = this._buildMessage(notification, channelName);
                        await this._sendToChannel(channel, message, notification);
                    }
                }

                // Mark notifications as sent
                for (const notification of notifications) {
                    notification.status = 'sent';
                    notification.attempts++;
                }

            } catch (error) {
                log('error', 'Failed to send batch to channel', {
                    channel: channelName,
                    batchSize: notifications.length,
                    error: error.message
                });

                // Mark notifications as failed
                for (const notification of notifications) {
                    notification.status = 'failed';
                    notification.attempts++;
                    notification.error = error.message;
                }
            }
        }

        // Schedule next batch if queue is not empty
        if (this.notificationQueue.length > 0) {
            this.batchTimer = setTimeout(() => {
                this._processBatch();
            }, this.config.batchInterval);
        }
    }

    /**
     * Group notifications by channel
     * @param {Array} notifications - Notifications to group
     * @returns {Map} Grouped notifications
     * @private
     */
    _groupByChannel(notifications) {
        const groups = new Map();

        for (const notification of notifications) {
            for (const channelName of notification.channels) {
                if (!groups.has(channelName)) {
                    groups.set(channelName, []);
                }
                groups.get(channelName).push(notification);
            }
        }

        return groups;
    }

    /**
     * Build message for specific channel
     * @param {Object} notificationData - Notification data
     * @param {string} channelName - Channel name
     * @returns {Object} Formatted message
     * @private
     */
    _buildMessage(notificationData, channelName) {
        const { escalation, priority, template } = notificationData;
        const { error, classification, context, attempts } = escalation;

        const baseMessage = {
            title: this._getMessageTitle(classification, priority),
            content: this._getMessageContent(error, classification, context, attempts),
            priority,
            timestamp: notificationData.timestamp,
            escalationId: escalation.id,
            operationId: escalation.operationId
        };

        // Format for specific channel
        switch (channelName) {
            case NotificationChannel.SLACK:
                return this._formatSlackMessage(baseMessage, notificationData);
            case NotificationChannel.EMAIL:
                return this._formatEmailMessage(baseMessage, notificationData);
            case NotificationChannel.LINEAR:
                return this._formatLinearMessage(baseMessage, notificationData);
            case NotificationChannel.WEBHOOK:
                return this._formatWebhookMessage(baseMessage, notificationData);
            default:
                return baseMessage;
        }
    }

    /**
     * Build batch message for channel
     * @param {Array} notifications - Notifications in batch
     * @param {string} channelName - Channel name
     * @returns {Object} Formatted batch message
     * @private
     */
    _buildBatchMessage(notifications, channelName) {
        const summary = {
            count: notifications.length,
            priorities: {},
            errorTypes: {},
            timeRange: {
                start: Math.min(...notifications.map(n => n.timestamp)),
                end: Math.max(...notifications.map(n => n.timestamp))
            }
        };

        // Aggregate statistics
        for (const notification of notifications) {
            const priority = notification.priority;
            const errorType = notification.escalation.classification.type;
            
            summary.priorities[priority] = (summary.priorities[priority] || 0) + 1;
            summary.errorTypes[errorType] = (summary.errorTypes[errorType] || 0) + 1;
        }

        const baseMessage = {
            title: `Error Batch Summary (${notifications.length} errors)`,
            content: this._getBatchContent(summary, notifications),
            priority: this._getHighestPriority(notifications),
            timestamp: Date.now(),
            batch: true,
            summary
        };

        // Format for specific channel
        switch (channelName) {
            case NotificationChannel.SLACK:
                return this._formatSlackBatchMessage(baseMessage, notifications);
            case NotificationChannel.EMAIL:
                return this._formatEmailBatchMessage(baseMessage, notifications);
            default:
                return baseMessage;
        }
    }

    /**
     * Send message to channel
     * @param {Object} channel - Channel configuration
     * @param {Object} message - Formatted message
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendToChannel(channel, message, notificationData) {
        let lastError;

        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                const result = await channel.send(message, notificationData);
                
                if (result.success) {
                    log('debug', 'Notification sent successfully', {
                        channel: channel.name,
                        attempt: attempt + 1
                    });
                    return result;
                }

                lastError = new Error(result.error || 'Send failed');

            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.retryAttempts - 1) {
                    log('warn', 'Notification send failed, retrying', {
                        channel: channel.name,
                        attempt: attempt + 1,
                        error: error.message
                    });
                    
                    await this._sleep(this.config.retryDelay * (attempt + 1));
                }
            }
        }

        throw lastError;
    }

    /**
     * Initialize default notification channels
     * @private
     */
    _initializeDefaultChannels() {
        // Slack channel
        this.channels.set(NotificationChannel.SLACK, {
            name: NotificationChannel.SLACK,
            supportsBatching: true,
            send: this._sendSlackNotification.bind(this)
        });

        // Email channel
        this.channels.set(NotificationChannel.EMAIL, {
            name: NotificationChannel.EMAIL,
            supportsBatching: true,
            send: this._sendEmailNotification.bind(this)
        });

        // Linear channel
        this.channels.set(NotificationChannel.LINEAR, {
            name: NotificationChannel.LINEAR,
            supportsBatching: false,
            send: this._sendLinearNotification.bind(this)
        });

        // Webhook channel
        this.channels.set(NotificationChannel.WEBHOOK, {
            name: NotificationChannel.WEBHOOK,
            supportsBatching: true,
            send: this._sendWebhookNotification.bind(this)
        });
    }

    /**
     * Send Slack notification
     * @param {Object} message - Formatted message
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendSlackNotification(message, notificationData) {
        // TODO: Implement actual Slack integration
        log('info', 'Sending Slack notification', {
            title: message.title,
            priority: message.priority
        });

        return {
            success: true,
            messageId: `slack_${Date.now()}`,
            channel: 'slack'
        };
    }

    /**
     * Send email notification
     * @param {Object} message - Formatted message
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendEmailNotification(message, notificationData) {
        // TODO: Implement actual email integration
        log('info', 'Sending email notification', {
            title: message.title,
            priority: message.priority
        });

        return {
            success: true,
            messageId: `email_${Date.now()}`,
            channel: 'email'
        };
    }

    /**
     * Send Linear notification
     * @param {Object} message - Formatted message
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendLinearNotification(message, notificationData) {
        // TODO: Implement actual Linear integration
        log('info', 'Sending Linear notification', {
            title: message.title,
            priority: message.priority
        });

        return {
            success: true,
            messageId: `linear_${Date.now()}`,
            channel: 'linear'
        };
    }

    /**
     * Send webhook notification
     * @param {Object} message - Formatted message
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Send result
     * @private
     */
    async _sendWebhookNotification(message, notificationData) {
        // TODO: Implement actual webhook integration
        log('info', 'Sending webhook notification', {
            title: message.title,
            priority: message.priority
        });

        return {
            success: true,
            messageId: `webhook_${Date.now()}`,
            channel: 'webhook'
        };
    }

    /**
     * Format Slack message
     * @param {Object} baseMessage - Base message
     * @param {Object} notificationData - Notification data
     * @returns {Object} Slack-formatted message
     * @private
     */
    _formatSlackMessage(baseMessage, notificationData) {
        const priorityEmoji = {
            [NotificationPriority.LOW]: '🔵',
            [NotificationPriority.MEDIUM]: '🟡',
            [NotificationPriority.HIGH]: '🟠',
            [NotificationPriority.CRITICAL]: '🔴'
        };

        return {
            ...baseMessage,
            text: `${priorityEmoji[baseMessage.priority]} ${baseMessage.title}`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: baseMessage.content
                    }
                }
            ]
        };
    }

    /**
     * Format email message
     * @param {Object} baseMessage - Base message
     * @param {Object} notificationData - Notification data
     * @returns {Object} Email-formatted message
     * @private
     */
    _formatEmailMessage(baseMessage, notificationData) {
        return {
            ...baseMessage,
            subject: baseMessage.title,
            html: `<h2>${baseMessage.title}</h2><p>${baseMessage.content}</p>`,
            text: `${baseMessage.title}\n\n${baseMessage.content}`
        };
    }

    /**
     * Format Linear message
     * @param {Object} baseMessage - Base message
     * @param {Object} notificationData - Notification data
     * @returns {Object} Linear-formatted message
     * @private
     */
    _formatLinearMessage(baseMessage, notificationData) {
        return {
            ...baseMessage,
            issueTitle: baseMessage.title,
            description: baseMessage.content,
            priority: this._mapLinearPriority(baseMessage.priority)
        };
    }

    /**
     * Format webhook message
     * @param {Object} baseMessage - Base message
     * @param {Object} notificationData - Notification data
     * @returns {Object} Webhook-formatted message
     * @private
     */
    _formatWebhookMessage(baseMessage, notificationData) {
        return {
            ...baseMessage,
            webhook: true,
            payload: notificationData
        };
    }

    /**
     * Get message title
     * @param {Object} classification - Error classification
     * @param {string} priority - Priority level
     * @returns {string} Message title
     * @private
     */
    _getMessageTitle(classification, priority) {
        const priorityPrefix = priority === NotificationPriority.CRITICAL ? '🚨 CRITICAL' : 
                              priority === NotificationPriority.HIGH ? '⚠️ HIGH' :
                              priority === NotificationPriority.MEDIUM ? '⚡ MEDIUM' : 'ℹ️ LOW';

        return `${priorityPrefix}: ${classification.category.toUpperCase()} Error - ${classification.type}`;
    }

    /**
     * Get message content
     * @param {Error} error - Error object
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @param {number} attempts - Number of attempts
     * @returns {string} Message content
     * @private
     */
    _getMessageContent(error, classification, context, attempts) {
        return `
**Error Details:**
- Type: ${classification.type}
- Category: ${classification.category}
- Severity: ${classification.severity}
- Confidence: ${(classification.confidence * 100).toFixed(1)}%
- Attempts: ${attempts}

**Error Message:**
${error.message}

**Context:**
- Operation: ${context.operationType || 'unknown'}
- Environment: ${context.environment || 'unknown'}
- Repository: ${context.repository || 'unknown'}

**Suggested Action:** ${classification.suggestedAction}
        `.trim();
    }

    /**
     * Get batch content
     * @param {Object} summary - Batch summary
     * @param {Array} notifications - Notifications in batch
     * @returns {string} Batch content
     * @private
     */
    _getBatchContent(summary, notifications) {
        const priorityList = Object.entries(summary.priorities)
            .map(([priority, count]) => `${priority}: ${count}`)
            .join(', ');

        const errorTypeList = Object.entries(summary.errorTypes)
            .map(([type, count]) => `${type}: ${count}`)
            .join(', ');

        return `
**Batch Summary:**
- Total Errors: ${summary.count}
- Time Range: ${new Date(summary.timeRange.start).toISOString()} - ${new Date(summary.timeRange.end).toISOString()}
- Priorities: ${priorityList}
- Error Types: ${errorTypeList}

**Recent Errors:**
${notifications.slice(0, 5).map(n => `- ${n.escalation.classification.type}: ${n.escalation.error.message.substring(0, 100)}...`).join('\n')}
        `.trim();
    }

    /**
     * Check if notifications are rate limited
     * @param {Array} channels - Notification channels
     * @param {string} priority - Priority level
     * @returns {boolean} Whether rate limited
     * @private
     */
    _isRateLimited(channels, priority) {
        if (!this.config.enableRateLimiting) {
            return false;
        }

        // Critical notifications bypass rate limiting
        if (priority === NotificationPriority.CRITICAL) {
            return false;
        }

        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindow;

        for (const channel of channels) {
            const key = `${channel}_${priority}`;
            const tracker = this.rateLimitTracker.get(key) || { count: 0, timestamps: [] };
            
            // Clean old timestamps
            tracker.timestamps = tracker.timestamps.filter(ts => ts > windowStart);
            
            if (tracker.timestamps.length >= this.config.maxNotificationsPerWindow) {
                return true;
            }
        }

        return false;
    }

    /**
     * Update rate limit tracking
     * @param {string} channel - Channel name
     * @param {string} priority - Priority level
     * @private
     */
    _updateRateLimit(channel, priority) {
        if (!this.config.enableRateLimiting) {
            return;
        }

        const key = `${channel}_${priority}`;
        const tracker = this.rateLimitTracker.get(key) || { count: 0, timestamps: [] };
        
        tracker.timestamps.push(Date.now());
        tracker.count++;
        
        this.rateLimitTracker.set(key, tracker);
    }

    /**
     * Get highest priority from notifications
     * @param {Array} notifications - Notifications
     * @returns {string} Highest priority
     * @private
     */
    _getHighestPriority(notifications) {
        const priorities = [NotificationPriority.CRITICAL, NotificationPriority.HIGH, NotificationPriority.MEDIUM, NotificationPriority.LOW];
        
        for (const priority of priorities) {
            if (notifications.some(n => n.priority === priority)) {
                return priority;
            }
        }
        
        return NotificationPriority.LOW;
    }

    /**
     * Map priority to Linear priority
     * @param {string} priority - Internal priority
     * @returns {number} Linear priority
     * @private
     */
    _mapLinearPriority(priority) {
        const priorityMap = {
            [NotificationPriority.LOW]: 1,
            [NotificationPriority.MEDIUM]: 2,
            [NotificationPriority.HIGH]: 3,
            [NotificationPriority.CRITICAL]: 4
        };

        return priorityMap[priority] || 2;
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique notification ID
     * @returns {string} Notification ID
     * @private
     */
    _generateNotificationId() {
        return `not_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Register custom notification channel
     * @param {string} name - Channel name
     * @param {Object} channel - Channel configuration
     */
    registerChannel(name, channel) {
        this.channels.set(name, {
            name,
            supportsBatching: channel.supportsBatching || false,
            send: channel.send
        });
        
        log('info', 'Custom notification channel registered', { name });
    }

    /**
     * Get notification statistics
     * @returns {Object} Notification statistics
     */
    getStatistics() {
        const stats = {
            totalNotifications: this.notificationHistory.length,
            queuedNotifications: this.notificationQueue.length,
            byChannel: {},
            byPriority: {},
            byStatus: {},
            successRate: 0,
            rateLimitHits: 0
        };

        let successCount = 0;
        let rateLimitCount = 0;

        for (const notification of this.notificationHistory) {
            // Count by channels
            for (const channel of notification.channels) {
                stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;
            }
            
            // Count by priority
            stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;
            
            // Count by status
            stats.byStatus[notification.status] = (stats.byStatus[notification.status] || 0) + 1;
            
            if (notification.status === 'sent') {
                successCount++;
            } else if (notification.status === 'rate_limited') {
                rateLimitCount++;
            }
        }

        if (this.notificationHistory.length > 0) {
            stats.successRate = successCount / this.notificationHistory.length;
        }

        stats.rateLimitHits = rateLimitCount;

        return stats;
    }

    /**
     * Get notification history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Notification history
     */
    getHistory(limit = 100) {
        return this.notificationHistory.slice(-limit);
    }

    /**
     * Clear notification queue
     */
    clearQueue() {
        this.notificationQueue = [];
        
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        log('info', 'Notification queue cleared');
    }

    /**
     * Reset notification system state
     */
    reset() {
        this.notificationQueue = [];
        this.notificationHistory = [];
        this.rateLimitTracker.clear();
        
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        log('info', 'Notification system reset');
    }
}

export default NotificationSystem;

