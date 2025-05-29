/**
 * @fileoverview Status Tracking and Linear Updates
 * @description Advanced status tracking and Linear integration for workflow updates
 */

import { log } from '../utils/simple_logger.js';

/**
 * Status Updater for tracking and updating workflow status
 */
export class StatusUpdater {
  constructor(config = {}) {
    this.config = {
      enableLinearIntegration: config.enableLinearIntegration !== false,
      enableWebhooks: config.enableWebhooks !== false,
      enableNotifications: config.enableNotifications !== false,
      updateIntervalMs: config.updateIntervalMs || 30000, // 30 seconds
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 5000,
      linearApiKey: config.linearApiKey,
      webhookUrl: config.webhookUrl,
      notificationChannels: config.notificationChannels || []
    };
    
    // Status tracking state
    this.trackedItems = new Map();
    this.updateQueue = [];
    this.isRunning = false;
    this.updateInterval = null;
    
    // Status definitions
    this.statusDefinitions = {
      task: {
        pending: { label: 'Pending', color: '#gray', priority: 1 },
        analyzing: { label: 'Analyzing', color: '#blue', priority: 2 },
        processing: { label: 'Processing', color: '#yellow', priority: 3 },
        generating: { label: 'Generating Code', color: '#orange', priority: 4 },
        reviewing: { label: 'Under Review', color: '#purple', priority: 5 },
        completed: { label: 'Completed', color: '#green', priority: 6 },
        failed: { label: 'Failed', color: '#red', priority: 7 },
        cancelled: { label: 'Cancelled', color: '#gray', priority: 8 }
      },
      pr: {
        draft: { label: 'Draft', color: '#gray', priority: 1 },
        open: { label: 'Open', color: '#green', priority: 2 },
        review_requested: { label: 'Review Requested', color: '#yellow', priority: 3 },
        changes_requested: { label: 'Changes Requested', color: '#orange', priority: 4 },
        approved: { label: 'Approved', color: '#blue', priority: 5 },
        merged: { label: 'Merged', color: '#purple', priority: 6 },
        closed: { label: 'Closed', color: '#red', priority: 7 }
      }
    };
    
    // Event handlers
    this.eventHandlers = {
      'status.updated': [],
      'status.error': [],
      'notification.sent': []
    };
    
    log('debug', 'StatusUpdater initialized', { config: this.config });
  }

  /**
   * Start the status updater
   */
  async start() {
    if (this.isRunning) {
      log('warning', 'StatusUpdater is already running');
      return;
    }
    
    try {
      log('info', 'Starting StatusUpdater...');
      
      this.isRunning = true;
      
      // Start update interval
      this.updateInterval = setInterval(
        () => this._processUpdateQueue(),
        this.config.updateIntervalMs
      );
      
      log('info', 'StatusUpdater started successfully');
      
    } catch (error) {
      log('error', `StatusUpdater start failed: ${error.message}`);
      throw new Error(`StatusUpdater start failed: ${error.message}`);
    }
  }

  /**
   * Stop the status updater
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    log('info', 'Stopping StatusUpdater...');
    
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Process remaining queue items
    await this._processUpdateQueue();
    
    log('info', 'StatusUpdater stopped');
  }

  /**
   * Track a new item for status updates
   * @param {Object} item - Item to track
   * @returns {string} Tracking ID
   */
  trackItem(item) {
    const trackingId = this._generateTrackingId();
    
    const trackedItem = {
      id: trackingId,
      type: item.type || 'task',
      externalId: item.externalId,
      linearIssueId: item.linearIssueId,
      prNumber: item.prNumber,
      repository: item.repository,
      status: item.status || 'pending',
      metadata: item.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updateCount: 0,
      lastNotification: null
    };
    
    this.trackedItems.set(trackingId, trackedItem);
    
    log('debug', `Started tracking item ${trackingId}`, {
      type: trackedItem.type,
      externalId: trackedItem.externalId,
      status: trackedItem.status
    });
    
    // Send initial status update
    this._queueUpdate(trackingId, trackedItem.status, {
      action: 'track_started',
      ...trackedItem.metadata
    });
    
    return trackingId;
  }

  /**
   * Update status of tracked item
   * @param {string} trackingId - Tracking ID
   * @param {string} newStatus - New status
   * @param {Object} metadata - Additional metadata
   * @returns {boolean} Success status
   */
  updateStatus(trackingId, newStatus, metadata = {}) {
    const item = this.trackedItems.get(trackingId);
    if (!item) {
      log('warning', `Attempted to update non-existent tracking ID: ${trackingId}`);
      return false;
    }
    
    const oldStatus = item.status;
    
    // Update item
    item.status = newStatus;
    item.metadata = { ...item.metadata, ...metadata };
    item.updatedAt = new Date().toISOString();
    item.updateCount++;
    
    log('debug', `Status updated for ${trackingId}`, {
      oldStatus,
      newStatus,
      updateCount: item.updateCount
    });
    
    // Queue update
    this._queueUpdate(trackingId, newStatus, {
      action: 'status_updated',
      oldStatus,
      newStatus,
      ...metadata
    });
    
    return true;
  }

  /**
   * Update multiple items in batch
   * @param {Array} updates - Array of update objects
   * @returns {Object} Batch update result
   */
  batchUpdate(updates) {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const update of updates) {
      try {
        const success = this.updateStatus(
          update.trackingId,
          update.status,
          update.metadata
        );
        
        if (success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            trackingId: update.trackingId,
            error: 'Item not found'
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          trackingId: update.trackingId,
          error: error.message
        });
      }
    }
    
    log('debug', `Batch update completed`, results);
    
    return results;
  }

  /**
   * Stop tracking an item
   * @param {string} trackingId - Tracking ID
   * @returns {boolean} Success status
   */
  stopTracking(trackingId) {
    const item = this.trackedItems.get(trackingId);
    if (!item) {
      return false;
    }
    
    // Send final status update
    this._queueUpdate(trackingId, item.status, {
      action: 'tracking_stopped',
      finalStatus: item.status
    });
    
    this.trackedItems.delete(trackingId);
    
    log('debug', `Stopped tracking item ${trackingId}`);
    
    return true;
  }

  /**
   * Get status of tracked item
   * @param {string} trackingId - Tracking ID
   * @returns {Object|null} Item status
   */
  getStatus(trackingId) {
    return this.trackedItems.get(trackingId) || null;
  }

  /**
   * Get all tracked items
   * @param {Object} filters - Optional filters
   * @returns {Array} Tracked items
   */
  getAllTracked(filters = {}) {
    let items = Array.from(this.trackedItems.values());
    
    // Apply filters
    if (filters.type) {
      items = items.filter(item => item.type === filters.type);
    }
    
    if (filters.status) {
      items = items.filter(item => item.status === filters.status);
    }
    
    if (filters.repository) {
      items = items.filter(item => item.repository === filters.repository);
    }
    
    return items;
  }

  /**
   * Send notification
   * @param {Object} notification - Notification data
   * @returns {Promise<boolean>} Success status
   */
  async sendNotification(notification) {
    try {
      log('debug', `Sending notification: ${notification.type}`);
      
      const notificationData = {
        id: this._generateNotificationId(),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data || {},
        timestamp: new Date().toISOString(),
        channels: notification.channels || this.config.notificationChannels
      };
      
      // Send to configured channels
      const results = await Promise.allSettled(
        notificationData.channels.map(channel => 
          this._sendToChannel(channel, notificationData)
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      log('debug', `Notification sent`, {
        id: notificationData.id,
        successful,
        failed,
        totalChannels: notificationData.channels.length
      });
      
      // Emit notification sent event
      await this._emitEvent('notification.sent', notificationData);
      
      return successful > 0;
      
    } catch (error) {
      log('error', `Notification sending failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Add event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  /**
   * Remove event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const items = Array.from(this.trackedItems.values());
    const statusCounts = {};
    
    // Count by status
    items.forEach(item => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });
    
    return {
      totalTracked: items.length,
      queueSize: this.updateQueue.length,
      isRunning: this.isRunning,
      statusCounts,
      averageUpdateCount: items.length > 0 ? 
        items.reduce((sum, item) => sum + item.updateCount, 0) / items.length : 0,
      oldestItem: items.length > 0 ? 
        Math.min(...items.map(item => new Date(item.createdAt).getTime())) : null
    };
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getHealth() {
    const stats = this.getStatistics();
    
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      timestamp: new Date().toISOString(),
      metrics: {
        isRunning: this.isRunning,
        trackedItems: stats.totalTracked,
        queueSize: stats.queueSize,
        updateInterval: this.config.updateIntervalMs
      },
      config: {
        linearIntegration: this.config.enableLinearIntegration,
        webhooks: this.config.enableWebhooks,
        notifications: this.config.enableNotifications
      }
    };
  }

  // Private helper methods

  /**
   * Generate unique tracking ID
   * @returns {string} Tracking ID
   * @private
   */
  _generateTrackingId() {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique notification ID
   * @returns {string} Notification ID
   * @private
   */
  _generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Queue status update
   * @param {string} trackingId - Tracking ID
   * @param {string} status - Status
   * @param {Object} metadata - Metadata
   * @private
   */
  _queueUpdate(trackingId, status, metadata) {
    this.updateQueue.push({
      trackingId,
      status,
      metadata,
      timestamp: new Date().toISOString(),
      retryCount: 0
    });
  }

  /**
   * Process update queue
   * @private
   */
  async _processUpdateQueue() {
    if (this.updateQueue.length === 0) {
      return;
    }
    
    log('debug', `Processing ${this.updateQueue.length} queued updates`);
    
    const updates = this.updateQueue.splice(0); // Take all updates
    
    for (const update of updates) {
      try {
        await this._processUpdate(update);
      } catch (error) {
        log('error', `Update processing failed: ${error.message}`, update);
        
        // Retry if under limit
        if (update.retryCount < this.config.maxRetries) {
          update.retryCount++;
          this.updateQueue.push(update);
          
          // Add delay for retry
          await this._sleep(this.config.retryDelayMs);
        } else {
          // Emit error event
          await this._emitEvent('status.error', {
            update,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Process individual update
   * @param {Object} update - Update to process
   * @private
   */
  async _processUpdate(update) {
    const item = this.trackedItems.get(update.trackingId);
    if (!item) {
      log('warning', `Update for non-existent item: ${update.trackingId}`);
      return;
    }
    
    // Update Linear if enabled
    if (this.config.enableLinearIntegration && item.linearIssueId) {
      await this._updateLinear(item, update);
    }
    
    // Send webhook if enabled
    if (this.config.enableWebhooks && this.config.webhookUrl) {
      await this._sendWebhook(item, update);
    }
    
    // Send notifications if enabled
    if (this.config.enableNotifications) {
      await this._sendStatusNotification(item, update);
    }
    
    // Emit status updated event
    await this._emitEvent('status.updated', {
      item,
      update
    });
  }

  /**
   * Update Linear issue
   * @param {Object} item - Tracked item
   * @param {Object} update - Update data
   * @private
   */
  async _updateLinear(item, update) {
    try {
      // This would integrate with actual Linear API
      // For now, log the update
      
      const statusDef = this.statusDefinitions[item.type]?.[update.status];
      
      log('debug', `Updating Linear issue ${item.linearIssueId}`, {
        status: update.status,
        label: statusDef?.label,
        metadata: update.metadata
      });
      
      // Mock Linear API call
      const linearUpdate = {
        issueId: item.linearIssueId,
        status: update.status,
        comment: this._generateLinearComment(item, update),
        labels: statusDef ? [statusDef.label] : [],
        updatedAt: new Date().toISOString()
      };
      
      log('debug', `Linear update completed for ${item.linearIssueId}`);
      
    } catch (error) {
      log('error', `Linear update failed for ${item.linearIssueId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send webhook
   * @param {Object} item - Tracked item
   * @param {Object} update - Update data
   * @private
   */
  async _sendWebhook(item, update) {
    try {
      const webhookData = {
        event: 'status.updated',
        timestamp: new Date().toISOString(),
        item: {
          id: item.id,
          type: item.type,
          externalId: item.externalId,
          status: update.status,
          metadata: update.metadata
        }
      };
      
      // Mock webhook call
      log('debug', `Sending webhook to ${this.config.webhookUrl}`, webhookData);
      
    } catch (error) {
      log('error', `Webhook sending failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send status notification
   * @param {Object} item - Tracked item
   * @param {Object} update - Update data
   * @private
   */
  async _sendStatusNotification(item, update) {
    const statusDef = this.statusDefinitions[item.type]?.[update.status];
    
    // Only send notifications for significant status changes
    const significantStatuses = ['completed', 'failed', 'merged', 'approved'];
    
    if (!significantStatuses.includes(update.status)) {
      return;
    }
    
    // Check if we've already sent a notification for this status
    if (item.lastNotification === update.status) {
      return;
    }
    
    const notification = {
      type: 'status_update',
      title: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} ${statusDef?.label || update.status}`,
      message: this._generateNotificationMessage(item, update),
      data: {
        trackingId: item.id,
        itemType: item.type,
        status: update.status,
        externalId: item.externalId
      }
    };
    
    await this.sendNotification(notification);
    
    // Update last notification status
    item.lastNotification = update.status;
  }

  /**
   * Send notification to specific channel
   * @param {string} channel - Channel identifier
   * @param {Object} notification - Notification data
   * @private
   */
  async _sendToChannel(channel, notification) {
    // This would integrate with actual notification services
    // For now, just log
    
    log('debug', `Sending notification to channel ${channel}`, {
      id: notification.id,
      type: notification.type,
      title: notification.title
    });
    
    return true;
  }

  /**
   * Generate Linear comment
   * @param {Object} item - Tracked item
   * @param {Object} update - Update data
   * @returns {string} Comment text
   * @private
   */
  _generateLinearComment(item, update) {
    const statusDef = this.statusDefinitions[item.type]?.[update.status];
    
    let comment = `Status updated to: **${statusDef?.label || update.status}**`;
    
    if (update.metadata.action) {
      comment += `\nAction: ${update.metadata.action}`;
    }
    
    if (item.prNumber) {
      comment += `\nPR: #${item.prNumber}`;
    }
    
    comment += `\n\n_Updated automatically by StatusUpdater_`;
    
    return comment;
  }

  /**
   * Generate notification message
   * @param {Object} item - Tracked item
   * @param {Object} update - Update data
   * @returns {string} Notification message
   * @private
   */
  _generateNotificationMessage(item, update) {
    const statusDef = this.statusDefinitions[item.type]?.[update.status];
    
    let message = `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} `;
    
    if (item.externalId) {
      message += `${item.externalId} `;
    }
    
    message += `is now ${statusDef?.label || update.status}`;
    
    if (item.prNumber) {
      message += ` (PR #${item.prNumber})`;
    }
    
    return message;
  }

  /**
   * Emit event to handlers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @private
   */
  async _emitEvent(event, data) {
    const handlers = this.eventHandlers[event] || [];
    
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        log('error', `Event handler error for ${event}: ${error.message}`);
      }
    }
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear old tracked items
   * @param {Object} options - Clear options
   * @returns {number} Number of items cleared
   */
  clearOldItems(options = {}) {
    const maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - maxAge;
    
    const before = this.trackedItems.size;
    
    for (const [id, item] of this.trackedItems.entries()) {
      const itemTime = new Date(item.createdAt).getTime();
      
      // Only clear completed, failed, or cancelled items
      const clearableStatuses = ['completed', 'failed', 'cancelled', 'merged', 'closed'];
      
      if (itemTime < cutoff && clearableStatuses.includes(item.status)) {
        this.trackedItems.delete(id);
      }
    }
    
    const cleared = before - this.trackedItems.size;
    log('debug', `Cleared ${cleared} old tracked items`);
    
    return cleared;
  }
}

export default StatusUpdater;

