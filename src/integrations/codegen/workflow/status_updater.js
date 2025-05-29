/**
 * @fileoverview Status Updater for Workflow Tracking
 * @description Tracks and updates status across different systems (Linear, webhooks, notifications)
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Status Updater
 * Manages status updates across multiple systems and platforms
 */
export class StatusUpdater extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableLinearIntegration: config.enableLinearIntegration !== false,
            enableWebhooks: config.enableWebhooks !== false,
            enableNotifications: config.enableNotifications !== false,
            updateIntervalMs: config.updateIntervalMs || 30000, // 30 seconds
            maxRetries: config.maxRetries || 3,
            retryDelayMs: config.retryDelayMs || 5000,
            linearApiKey: config.linearApiKey || process.env.LINEAR_API_KEY,
            webhookUrl: config.webhookUrl || process.env.WEBHOOK_URL,
            notificationChannels: config.notificationChannels || ['slack'],
            ...config
        };
        
        // Tracking state
        this.trackedItems = new Map();
        this.updateQueue = [];
        this.isProcessing = false;
        this.updateTimer = null;
        
        // Metrics
        this.metrics = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            averageUpdateTime: 0,
            lastUpdateAt: null,
            trackedItemsCount: 0
        };
        
        log('debug', 'Status Updater initialized', {
            enableLinearIntegration: this.config.enableLinearIntegration,
            enableWebhooks: this.config.enableWebhooks,
            enableNotifications: this.config.enableNotifications,
            updateInterval: this.config.updateIntervalMs
        });
    }

    /**
     * Initialize the status updater
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', 'Initializing Status Updater...');
            
            // Validate integrations
            if (this.config.enableLinearIntegration) {
                await this._validateLinearIntegration();
            }
            
            if (this.config.enableWebhooks) {
                await this._validateWebhookConfiguration();
            }
            
            // Start update processing
            this._startUpdateProcessor();
            
            log('info', 'Status Updater initialized successfully');
            
        } catch (error) {
            log('error', 'Failed to initialize Status Updater', { error: error.message });
            throw error;
        }
    }

    /**
     * Track a new item for status updates
     * @param {Object} item - Item to track
     * @returns {string} Tracking ID
     */
    trackItem(item) {
        const trackingId = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const trackedItem = {
            id: trackingId,
            type: item.type || 'task',
            externalId: item.externalId,
            linearIssueId: item.linearIssueId,
            status: item.status || 'pending',
            metadata: item.metadata || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updateHistory: []
        };
        
        this.trackedItems.set(trackingId, trackedItem);
        this.metrics.trackedItemsCount = this.trackedItems.size;
        
        log('debug', 'Item tracking started', {
            trackingId,
            type: trackedItem.type,
            externalId: trackedItem.externalId,
            status: trackedItem.status
        });
        
        this.emit('item.tracked', { trackingId, item: trackedItem });
        
        return trackingId;
    }

    /**
     * Update status of a tracked item
     * @param {string} trackingId - Tracking ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<void>}
     */
    async updateStatus(trackingId, status, metadata = {}) {
        try {
            const trackedItem = this.trackedItems.get(trackingId);
            if (!trackedItem) {
                throw new Error(`Tracked item not found: ${trackingId}`);
            }
            
            const previousStatus = trackedItem.status;
            
            // Update tracked item
            trackedItem.status = status;
            trackedItem.metadata = { ...trackedItem.metadata, ...metadata };
            trackedItem.updatedAt = new Date().toISOString();
            
            // Add to update history
            trackedItem.updateHistory.push({
                timestamp: new Date().toISOString(),
                previousStatus,
                newStatus: status,
                metadata
            });
            
            // Queue update for processing
            this._queueUpdate({
                trackingId,
                item: trackedItem,
                status,
                metadata,
                timestamp: new Date().toISOString()
            });
            
            log('debug', 'Status update queued', {
                trackingId,
                previousStatus,
                newStatus: status,
                queueSize: this.updateQueue.length
            });
            
            this.emit('status.updated', { trackingId, previousStatus, newStatus: status, metadata });
            
        } catch (error) {
            log('error', 'Failed to update status', { trackingId, status, error: error.message });
            throw error;
        }
    }

    /**
     * Get status of a tracked item
     * @param {string} trackingId - Tracking ID
     * @returns {Object|null} Tracked item or null if not found
     */
    getStatus(trackingId) {
        const item = this.trackedItems.get(trackingId);
        return item ? { ...item } : null;
    }

    /**
     * Get all tracked items
     * @returns {Array} Array of tracked items
     */
    getAllTrackedItems() {
        return Array.from(this.trackedItems.values());
    }

    /**
     * Remove item from tracking
     * @param {string} trackingId - Tracking ID
     * @returns {boolean} Whether item was removed
     */
    untrackItem(trackingId) {
        const removed = this.trackedItems.delete(trackingId);
        if (removed) {
            this.metrics.trackedItemsCount = this.trackedItems.size;
            log('debug', 'Item untracked', { trackingId });
            this.emit('item.untracked', { trackingId });
        }
        return removed;
    }

    /**
     * Get status updater status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: true,
            isProcessing: this.isProcessing,
            trackedItems: this.trackedItems.size,
            queuedUpdates: this.updateQueue.length,
            metrics: this.metrics,
            config: {
                enableLinearIntegration: this.config.enableLinearIntegration,
                enableWebhooks: this.config.enableWebhooks,
                enableNotifications: this.config.enableNotifications,
                updateInterval: this.config.updateIntervalMs
            }
        };
    }

    /**
     * Shutdown the status updater
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Status Updater...');
            
            // Stop update processor
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            
            // Process remaining updates
            if (this.updateQueue.length > 0) {
                log('info', `Processing ${this.updateQueue.length} remaining updates...`);
                await this._processUpdateQueue();
            }
            
            log('info', 'Status Updater shutdown completed');
            
        } catch (error) {
            log('error', 'Error during Status Updater shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate Linear integration
     * @returns {Promise<void>}
     * @private
     */
    async _validateLinearIntegration() {
        if (!this.config.linearApiKey) {
            log('warn', 'Linear API key not configured, Linear integration disabled');
            this.config.enableLinearIntegration = false;
            return;
        }
        
        try {
            // In real implementation, validate Linear API access
            log('debug', 'Linear integration validated');
        } catch (error) {
            log('warn', 'Linear integration validation failed', { error: error.message });
            this.config.enableLinearIntegration = false;
        }
    }

    /**
     * Validate webhook configuration
     * @returns {Promise<void>}
     * @private
     */
    async _validateWebhookConfiguration() {
        if (!this.config.webhookUrl) {
            log('warn', 'Webhook URL not configured, webhook integration disabled');
            this.config.enableWebhooks = false;
            return;
        }
        
        try {
            // In real implementation, validate webhook endpoint
            log('debug', 'Webhook configuration validated');
        } catch (error) {
            log('warn', 'Webhook validation failed', { error: error.message });
            this.config.enableWebhooks = false;
        }
    }

    /**
     * Start update processor
     * @private
     */
    _startUpdateProcessor() {
        this.updateTimer = setInterval(async () => {
            if (!this.isProcessing && this.updateQueue.length > 0) {
                await this._processUpdateQueue();
            }
        }, this.config.updateIntervalMs);
        
        log('debug', 'Update processor started', { interval: this.config.updateIntervalMs });
    }

    /**
     * Queue update for processing
     * @param {Object} update - Update data
     * @private
     */
    _queueUpdate(update) {
        this.updateQueue.push(update);
        
        // Emit event for immediate processing if needed
        this.emit('update.queued', { update, queueSize: this.updateQueue.length });
    }

    /**
     * Process update queue
     * @returns {Promise<void>}
     * @private
     */
    async _processUpdateQueue() {
        if (this.isProcessing || this.updateQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            log('debug', `Processing ${this.updateQueue.length} status updates...`);
            
            const updates = [...this.updateQueue];
            this.updateQueue = [];
            
            // Process updates in parallel with limited concurrency
            const concurrency = 3;
            for (let i = 0; i < updates.length; i += concurrency) {
                const batch = updates.slice(i, i + concurrency);
                const promises = batch.map(update => this._processUpdate(update));
                await Promise.allSettled(promises);
            }
            
            log('debug', 'Update queue processing completed');
            
        } catch (error) {
            log('error', 'Error processing update queue', { error: error.message });
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process individual update
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _processUpdate(update) {
        const startTime = Date.now();
        
        try {
            log('debug', 'Processing status update', {
                trackingId: update.trackingId,
                status: update.status
            });
            
            // Update Linear if enabled
            if (this.config.enableLinearIntegration && update.item.linearIssueId) {
                await this._updateLinearStatus(update);
            }
            
            // Send webhook if enabled
            if (this.config.enableWebhooks) {
                await this._sendWebhook(update);
            }
            
            // Send notifications if enabled
            if (this.config.enableNotifications) {
                await this._sendNotifications(update);
            }
            
            // Update metrics
            this._updateMetrics(true, Date.now() - startTime);
            
            this.emit('update.processed', { update, success: true });
            
        } catch (error) {
            log('error', 'Failed to process status update', {
                trackingId: update.trackingId,
                error: error.message
            });
            
            this._updateMetrics(false, Date.now() - startTime);
            this.emit('update.processed', { update, success: false, error });
        }
    }

    /**
     * Update Linear issue status
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _updateLinearStatus(update) {
        try {
            // In real implementation, update Linear issue via API
            log('debug', 'Would update Linear issue', {
                issueId: update.item.linearIssueId,
                status: update.status
            });
            
            // Mock Linear API call
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            log('error', 'Failed to update Linear status', {
                issueId: update.item.linearIssueId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Send webhook notification
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _sendWebhook(update) {
        try {
            const payload = {
                event: 'status.updated',
                timestamp: update.timestamp,
                data: {
                    trackingId: update.trackingId,
                    type: update.item.type,
                    externalId: update.item.externalId,
                    status: update.status,
                    metadata: update.metadata
                }
            };
            
            // In real implementation, send HTTP POST to webhook URL
            log('debug', 'Would send webhook', {
                url: this.config.webhookUrl,
                payload: payload
            });
            
            // Mock webhook call
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            log('error', 'Failed to send webhook', {
                url: this.config.webhookUrl,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Send notifications
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _sendNotifications(update) {
        try {
            for (const channel of this.config.notificationChannels) {
                await this._sendChannelNotification(channel, update);
            }
        } catch (error) {
            log('error', 'Failed to send notifications', { error: error.message });
            throw error;
        }
    }

    /**
     * Send notification to specific channel
     * @param {string} channel - Notification channel
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _sendChannelNotification(channel, update) {
        try {
            const message = this._formatNotificationMessage(update);
            
            switch (channel) {
                case 'slack':
                    await this._sendSlackNotification(message, update);
                    break;
                case 'email':
                    await this._sendEmailNotification(message, update);
                    break;
                default:
                    log('warn', `Unknown notification channel: ${channel}`);
            }
        } catch (error) {
            log('error', `Failed to send ${channel} notification`, { error: error.message });
            throw error;
        }
    }

    /**
     * Format notification message
     * @param {Object} update - Update data
     * @returns {string} Formatted message
     * @private
     */
    _formatNotificationMessage(update) {
        const { item, status, metadata } = update;
        
        let message = `📋 Task Status Update\n`;
        message += `**Type**: ${item.type}\n`;
        message += `**ID**: ${item.externalId}\n`;
        message += `**Status**: ${status}\n`;
        
        if (metadata.prUrl) {
            message += `**PR**: ${metadata.prUrl}\n`;
        }
        
        if (metadata.processingTime) {
            message += `**Processing Time**: ${Math.round(metadata.processingTime / 1000)}s\n`;
        }
        
        return message;
    }

    /**
     * Send Slack notification
     * @param {string} message - Message content
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _sendSlackNotification(message, update) {
        // In real implementation, send to Slack webhook
        log('debug', 'Would send Slack notification', { message });
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    /**
     * Send email notification
     * @param {string} message - Message content
     * @param {Object} update - Update data
     * @returns {Promise<void>}
     * @private
     */
    async _sendEmailNotification(message, update) {
        // In real implementation, send email
        log('debug', 'Would send email notification', { message });
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    /**
     * Update metrics
     * @param {boolean} success - Success status
     * @param {number} processingTime - Processing time in ms
     * @private
     */
    _updateMetrics(success, processingTime) {
        this.metrics.totalUpdates++;
        
        if (success) {
            this.metrics.successfulUpdates++;
            
            // Update average processing time
            const totalTime = this.metrics.averageUpdateTime * (this.metrics.successfulUpdates - 1) + processingTime;
            this.metrics.averageUpdateTime = totalTime / this.metrics.successfulUpdates;
        } else {
            this.metrics.failedUpdates++;
        }
        
        this.metrics.lastUpdateAt = new Date().toISOString();
    }
}

export default StatusUpdater;

