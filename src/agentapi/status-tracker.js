/**
 * Status Tracker for AgentAPI Tasks
 * 
 * Tracks and manages the status of tasks throughout their lifecycle,
 * providing real-time updates and historical tracking.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class StatusTracker extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      retentionPeriod: config.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: config.cleanupInterval || 60 * 60 * 1000, // 1 hour
      enableMetrics: config.enableMetrics !== false,
      enableHistory: config.enableHistory !== false,
      maxHistoryEntries: config.maxHistoryEntries || 1000,
      ...config
    };

    this.logger = new SimpleLogger('StatusTracker');
    
    this.statuses = new Map();
    this.history = new Map();
    this.metrics = {
      statusChanges: 0,
      taskCounts: {},
      averageDurations: {},
      lastReset: new Date().toISOString()
    };
    
    // Valid status transitions
    this.validTransitions = {
      'pending': ['running', 'cancelled'],
      'running': ['completed', 'failed', 'cancelled'],
      'completed': [],
      'failed': ['retrying'],
      'retrying': ['running', 'failed', 'cancelled'],
      'cancelled': []
    };

    // Start cleanup interval
    if (this.config.enableHistory) {
      this._startCleanup();
    }
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {boolean} Success status
   */
  updateStatus(taskId, status, metadata = {}) {
    const currentStatus = this.statuses.get(taskId);
    
    // Validate status transition
    if (currentStatus && !this._isValidTransition(currentStatus.status, status)) {
      this.logger.warn(`Invalid status transition for task ${taskId}`, {
        taskId,
        from: currentStatus.status,
        to: status
      });
      return false;
    }

    const statusUpdate = {
      taskId,
      status,
      timestamp: new Date().toISOString(),
      previousStatus: currentStatus?.status || null,
      metadata: {
        ...metadata,
        updatedBy: metadata.updatedBy || 'system'
      }
    };

    // Update current status
    this.statuses.set(taskId, statusUpdate);
    
    // Add to history if enabled
    if (this.config.enableHistory) {
      this._addToHistory(taskId, statusUpdate);
    }
    
    // Update metrics if enabled
    if (this.config.enableMetrics) {
      this._updateMetrics(statusUpdate);
    }

    this.logger.info(`Status updated for task: ${taskId}`, {
      taskId,
      status,
      previousStatus: statusUpdate.previousStatus
    });

    // Emit status change event
    this.emit('statusChanged', statusUpdate);
    this.emit(`status:${status}`, statusUpdate);

    return true;
  }

  /**
   * Get current status of a task
   * @param {string} taskId - Task ID
   * @returns {Object|null} Current status
   */
  getStatus(taskId) {
    const status = this.statuses.get(taskId);
    return status ? { ...status } : null;
  }

  /**
   * Get status history for a task
   * @param {string} taskId - Task ID
   * @param {Object} options - Query options
   * @returns {Array} Status history
   */
  getHistory(taskId, options = {}) {
    if (!this.config.enableHistory) {
      return [];
    }

    const taskHistory = this.history.get(taskId) || [];
    let history = [...taskHistory];

    // Apply filters
    if (options.since) {
      const since = new Date(options.since);
      history = history.filter(entry => new Date(entry.timestamp) >= since);
    }

    if (options.status) {
      history = history.filter(entry => entry.status === options.status);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply limit
    if (options.limit) {
      history = history.slice(0, parseInt(options.limit));
    }

    return history;
  }

  /**
   * Get all tasks with a specific status
   * @param {string} status - Status to filter by
   * @returns {Array} Tasks with the specified status
   */
  getTasksByStatus(status) {
    const tasks = [];
    
    for (const [taskId, taskStatus] of this.statuses.entries()) {
      if (taskStatus.status === status) {
        tasks.push({ ...taskStatus });
      }
    }
    
    return tasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get status summary for all tasks
   * @returns {Object} Status summary
   */
  getStatusSummary() {
    const summary = {
      total: this.statuses.size,
      byStatus: {},
      byTimestamp: {}
    };

    // Count by status
    for (const taskStatus of this.statuses.values()) {
      const status = taskStatus.status;
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    }

    // Count by time periods
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    summary.byTimestamp = {
      lastHour: 0,
      lastDay: 0,
      lastWeek: 0
    };

    for (const taskStatus of this.statuses.values()) {
      const timestamp = new Date(taskStatus.timestamp);
      
      if (timestamp >= oneHourAgo) {
        summary.byTimestamp.lastHour++;
      }
      if (timestamp >= oneDayAgo) {
        summary.byTimestamp.lastDay++;
      }
      if (timestamp >= oneWeekAgo) {
        summary.byTimestamp.lastWeek++;
      }
    }

    return summary;
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    if (!this.config.enableMetrics) {
      return null;
    }

    return {
      ...this.metrics,
      currentTasks: this.statuses.size,
      statusDistribution: this._calculateStatusDistribution(),
      averageTaskDuration: this._calculateAverageTaskDuration(),
      throughput: this._calculateThroughput()
    };
  }

  /**
   * Remove task from tracking
   * @param {string} taskId - Task ID to remove
   * @returns {boolean} Success status
   */
  removeTask(taskId) {
    const removed = this.statuses.delete(taskId);
    
    if (removed) {
      this.logger.info(`Task removed from tracking: ${taskId}`);
      this.emit('taskRemoved', { taskId });
    }
    
    return removed;
  }

  /**
   * Clear old tasks and history
   * @param {Object} options - Clear options
   * @returns {number} Number of tasks cleared
   */
  clearOldTasks(options = {}) {
    const cutoffTime = options.olderThan 
      ? new Date(options.olderThan)
      : new Date(Date.now() - this.config.retentionPeriod);
    
    let clearedCount = 0;
    
    // Clear old statuses
    for (const [taskId, taskStatus] of this.statuses.entries()) {
      if (new Date(taskStatus.timestamp) < cutoffTime) {
        this.statuses.delete(taskId);
        clearedCount++;
      }
    }
    
    // Clear old history
    if (this.config.enableHistory) {
      for (const [taskId, taskHistory] of this.history.entries()) {
        const filteredHistory = taskHistory.filter(
          entry => new Date(entry.timestamp) >= cutoffTime
        );
        
        if (filteredHistory.length === 0) {
          this.history.delete(taskId);
        } else if (filteredHistory.length < taskHistory.length) {
          this.history.set(taskId, filteredHistory);
        }
      }
    }
    
    this.logger.info(`Cleared ${clearedCount} old tasks`, {
      clearedCount,
      cutoffTime: cutoffTime.toISOString()
    });
    
    return clearedCount;
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    if (this.config.enableMetrics) {
      this.metrics = {
        statusChanges: 0,
        taskCounts: {},
        averageDurations: {},
        lastReset: new Date().toISOString()
      };
      
      this.logger.info('Metrics reset');
      this.emit('metricsReset');
    }
  }

  /**
   * Validate status transition
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @returns {boolean} Valid transition
   */
  _isValidTransition(fromStatus, toStatus) {
    const allowedTransitions = this.validTransitions[fromStatus];
    return allowedTransitions && allowedTransitions.includes(toStatus);
  }

  /**
   * Add status update to history
   * @param {string} taskId - Task ID
   * @param {Object} statusUpdate - Status update
   */
  _addToHistory(taskId, statusUpdate) {
    if (!this.history.has(taskId)) {
      this.history.set(taskId, []);
    }
    
    const taskHistory = this.history.get(taskId);
    taskHistory.push({ ...statusUpdate });
    
    // Limit history size
    if (taskHistory.length > this.config.maxHistoryEntries) {
      taskHistory.splice(0, taskHistory.length - this.config.maxHistoryEntries);
    }
  }

  /**
   * Update metrics
   * @param {Object} statusUpdate - Status update
   */
  _updateMetrics(statusUpdate) {
    this.metrics.statusChanges++;
    
    // Update task counts by status
    const status = statusUpdate.status;
    this.metrics.taskCounts[status] = (this.metrics.taskCounts[status] || 0) + 1;
    
    // Calculate duration for completed/failed tasks
    if ((status === 'completed' || status === 'failed') && statusUpdate.previousStatus) {
      const taskHistory = this.history.get(statusUpdate.taskId) || [];
      const startEntry = taskHistory.find(entry => entry.status === 'running');
      
      if (startEntry) {
        const duration = new Date(statusUpdate.timestamp) - new Date(startEntry.timestamp);
        
        if (!this.metrics.averageDurations[status]) {
          this.metrics.averageDurations[status] = { total: 0, count: 0 };
        }
        
        this.metrics.averageDurations[status].total += duration;
        this.metrics.averageDurations[status].count++;
      }
    }
  }

  /**
   * Calculate status distribution
   * @returns {Object} Status distribution
   */
  _calculateStatusDistribution() {
    const distribution = {};
    const total = this.statuses.size;
    
    for (const taskStatus of this.statuses.values()) {
      const status = taskStatus.status;
      distribution[status] = (distribution[status] || 0) + 1;
    }
    
    // Convert to percentages
    for (const status in distribution) {
      distribution[status] = {
        count: distribution[status],
        percentage: total > 0 ? ((distribution[status] / total) * 100).toFixed(2) : '0.00'
      };
    }
    
    return distribution;
  }

  /**
   * Calculate average task duration
   * @returns {Object} Average durations by status
   */
  _calculateAverageTaskDuration() {
    const averages = {};
    
    for (const [status, data] of Object.entries(this.metrics.averageDurations)) {
      if (data.count > 0) {
        averages[status] = {
          average: Math.round(data.total / data.count),
          count: data.count
        };
      }
    }
    
    return averages;
  }

  /**
   * Calculate throughput metrics
   * @returns {Object} Throughput metrics
   */
  _calculateThroughput() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    let hourlyCompleted = 0;
    let dailyCompleted = 0;
    
    for (const taskStatus of this.statuses.values()) {
      if (taskStatus.status === 'completed') {
        const timestamp = new Date(taskStatus.timestamp);
        
        if (timestamp >= oneHourAgo) {
          hourlyCompleted++;
        }
        if (timestamp >= oneDayAgo) {
          dailyCompleted++;
        }
      }
    }
    
    return {
      tasksPerHour: hourlyCompleted,
      tasksPerDay: dailyCompleted,
      estimatedDailyCapacity: hourlyCompleted * 24
    };
  }

  /**
   * Start cleanup interval
   */
  _startCleanup() {
    setInterval(() => {
      this.clearOldTasks();
    }, this.config.cleanupInterval);
  }

  /**
   * Get tracker statistics
   * @returns {Object} Tracker statistics
   */
  getStatistics() {
    return {
      trackedTasks: this.statuses.size,
      historyEntries: this.config.enableHistory 
        ? Array.from(this.history.values()).reduce((sum, entries) => sum + entries.length, 0)
        : 0,
      metricsEnabled: this.config.enableMetrics,
      historyEnabled: this.config.enableHistory,
      retentionPeriod: this.config.retentionPeriod,
      statusDistribution: this._calculateStatusDistribution()
    };
  }

  /**
   * Export status data
   * @param {Object} options - Export options
   * @returns {Object} Exported data
   */
  exportData(options = {}) {
    const data = {
      statuses: {},
      history: {},
      metrics: this.config.enableMetrics ? this.metrics : null,
      exportedAt: new Date().toISOString()
    };

    // Export current statuses
    for (const [taskId, status] of this.statuses.entries()) {
      data.statuses[taskId] = { ...status };
    }

    // Export history if enabled and requested
    if (this.config.enableHistory && options.includeHistory) {
      for (const [taskId, history] of this.history.entries()) {
        data.history[taskId] = [...history];
      }
    }

    return data;
  }

  /**
   * Import status data
   * @param {Object} data - Data to import
   * @returns {number} Number of tasks imported
   */
  importData(data) {
    let importedCount = 0;

    // Import statuses
    if (data.statuses) {
      for (const [taskId, status] of Object.entries(data.statuses)) {
        this.statuses.set(taskId, { ...status });
        importedCount++;
      }
    }

    // Import history
    if (data.history && this.config.enableHistory) {
      for (const [taskId, history] of Object.entries(data.history)) {
        this.history.set(taskId, [...history]);
      }
    }

    // Import metrics
    if (data.metrics && this.config.enableMetrics) {
      this.metrics = { ...data.metrics };
    }

    this.logger.info(`Imported ${importedCount} task statuses`);
    
    return importedCount;
  }
}

export default StatusTracker;

