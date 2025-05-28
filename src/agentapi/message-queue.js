/**
 * Message Queue System for AgentAPI
 * 
 * Provides reliable message queuing and task distribution
 * with support for priorities, retries, and dead letter queues.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class TaskQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultPriority: config.defaultPriority || 5,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      deadLetterQueueEnabled: config.deadLetterQueueEnabled !== false,
      persistenceEnabled: config.persistenceEnabled || false,
      ...config
    };

    this.logger = new SimpleLogger('TaskQueue');
    
    this.queue = [];
    this.deadLetterQueue = [];
    this.processing = new Map();
    this.completed = new Map();
    this.failed = new Map();
    
    this.stats = {
      enqueued: 0,
      dequeued: 0,
      completed: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Add a task to the queue
   * @param {Object} task - Task to enqueue
   * @returns {Promise<string>} Task ID
   */
  async enqueue(task) {
    if (this.queue.length >= this.config.maxSize) {
      throw new Error('Queue is full');
    }

    const taskId = task.taskId || this._generateTaskId();
    const queueItem = {
      id: taskId,
      data: task,
      priority: task.priority || this.config.defaultPriority,
      attempts: 0,
      maxAttempts: task.maxAttempts || this.config.retryAttempts,
      enqueuedAt: new Date().toISOString(),
      lastAttempt: null,
      status: 'queued'
    };

    // Insert task in priority order (lower number = higher priority)
    this._insertByPriority(queueItem);
    
    this.stats.enqueued++;
    
    this.logger.info(`Task enqueued: ${taskId}`, {
      taskId,
      priority: queueItem.priority,
      queueSize: this.queue.length
    });

    this.emit('taskEnqueued', queueItem);
    
    return taskId;
  }

  /**
   * Remove and return the next task from the queue
   * @returns {Promise<Object|null>} Next task or null if empty
   */
  async dequeue() {
    if (this.queue.length === 0) {
      return null;
    }

    const task = this.queue.shift();
    task.status = 'processing';
    task.dequeuedAt = new Date().toISOString();
    task.attempts++;
    task.lastAttempt = task.dequeuedAt;
    
    this.processing.set(task.id, task);
    this.stats.dequeued++;
    
    this.logger.info(`Task dequeued: ${task.id}`, {
      taskId: task.id,
      attempt: task.attempts,
      queueSize: this.queue.length
    });

    this.emit('taskDequeued', task);
    
    return task;
  }

  /**
   * Mark a task as completed
   * @param {string} taskId - Task ID
   * @param {Object} result - Task result
   */
  async complete(taskId, result = {}) {
    const task = this.processing.get(taskId);
    if (!task) {
      this.logger.warn(`Attempted to complete unknown task: ${taskId}`);
      return;
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;
    
    this.processing.delete(taskId);
    this.completed.set(taskId, task);
    this.stats.completed++;
    
    this.logger.info(`Task completed: ${taskId}`, {
      taskId,
      duration: new Date(task.completedAt) - new Date(task.dequeuedAt)
    });

    this.emit('taskCompleted', task);
  }

  /**
   * Mark a task as failed and handle retry logic
   * @param {string} taskId - Task ID
   * @param {Error|string} error - Error details
   */
  async fail(taskId, error) {
    const task = this.processing.get(taskId);
    if (!task) {
      this.logger.warn(`Attempted to fail unknown task: ${taskId}`);
      return;
    }

    task.error = error instanceof Error ? error.message : error;
    task.failedAt = new Date().toISOString();
    
    // Check if we should retry
    if (task.attempts < task.maxAttempts) {
      task.status = 'retrying';
      
      this.logger.warn(`Task failed, scheduling retry: ${taskId}`, {
        taskId,
        attempt: task.attempts,
        maxAttempts: task.maxAttempts,
        error: task.error
      });

      // Schedule retry with exponential backoff
      const retryDelay = this.config.retryDelay * Math.pow(2, task.attempts - 1);
      setTimeout(() => {
        this._retryTask(task);
      }, retryDelay);

      this.stats.retried++;
      this.emit('taskRetrying', task);
    } else {
      // Max attempts reached
      task.status = 'failed';
      
      this.processing.delete(taskId);
      this.failed.set(taskId, task);
      this.stats.failed++;
      
      // Move to dead letter queue if enabled
      if (this.config.deadLetterQueueEnabled) {
        this.deadLetterQueue.push(task);
      }
      
      this.logger.error(`Task failed permanently: ${taskId}`, {
        taskId,
        attempts: task.attempts,
        error: task.error
      });

      this.emit('taskFailed', task);
    }
  }

  /**
   * Retry a failed task
   * @param {Object} task - Task to retry
   */
  _retryTask(task) {
    if (task.status !== 'retrying') {
      return; // Task may have been cancelled
    }

    // Remove from processing and re-enqueue
    this.processing.delete(task.id);
    task.status = 'queued';
    
    // Insert at front of queue for retry (higher priority)
    this.queue.unshift(task);
    
    this.logger.info(`Task retry queued: ${task.id}`, {
      taskId: task.id,
      attempt: task.attempts + 1
    });

    this.emit('taskRequeued', task);
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID to cancel
   * @returns {boolean} Success status
   */
  async cancel(taskId) {
    // Check if task is in queue
    const queueIndex = this.queue.findIndex(task => task.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.status = 'cancelled';
      task.cancelledAt = new Date().toISOString();
      
      this.logger.info(`Task cancelled from queue: ${taskId}`);
      this.emit('taskCancelled', task);
      return true;
    }

    // Check if task is processing
    const processingTask = this.processing.get(taskId);
    if (processingTask) {
      processingTask.status = 'cancelled';
      processingTask.cancelledAt = new Date().toISOString();
      
      this.processing.delete(taskId);
      
      this.logger.info(`Processing task cancelled: ${taskId}`);
      this.emit('taskCancelled', processingTask);
      return true;
    }

    return false;
  }

  /**
   * Get task status
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task status
   */
  getTaskStatus(taskId) {
    // Check processing tasks
    let task = this.processing.get(taskId);
    if (task) {
      return this._formatTaskStatus(task);
    }

    // Check completed tasks
    task = this.completed.get(taskId);
    if (task) {
      return this._formatTaskStatus(task);
    }

    // Check failed tasks
    task = this.failed.get(taskId);
    if (task) {
      return this._formatTaskStatus(task);
    }

    // Check queue
    task = this.queue.find(t => t.id === taskId);
    if (task) {
      return this._formatTaskStatus(task);
    }

    // Check dead letter queue
    task = this.deadLetterQueue.find(t => t.id === taskId);
    if (task) {
      return this._formatTaskStatus(task);
    }

    return null;
  }

  /**
   * Get all tasks with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered tasks
   */
  getTasks(filters = {}) {
    let allTasks = [
      ...this.queue,
      ...Array.from(this.processing.values()),
      ...Array.from(this.completed.values()),
      ...Array.from(this.failed.values())
    ];

    // Apply filters
    if (filters.status) {
      allTasks = allTasks.filter(task => task.status === filters.status);
    }

    if (filters.priority) {
      allTasks = allTasks.filter(task => task.priority === filters.priority);
    }

    if (filters.since) {
      const since = new Date(filters.since);
      allTasks = allTasks.filter(task => new Date(task.enqueuedAt) >= since);
    }

    // Sort by enqueue time (newest first)
    allTasks.sort((a, b) => new Date(b.enqueuedAt) - new Date(a.enqueuedAt));

    // Apply limit
    if (filters.limit) {
      allTasks = allTasks.slice(0, parseInt(filters.limit));
    }

    return allTasks.map(task => this._formatTaskStatus(task));
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStatistics() {
    return {
      queue: {
        size: this.queue.length,
        maxSize: this.config.maxSize,
        utilization: (this.queue.length / this.config.maxSize * 100).toFixed(2) + '%'
      },
      processing: {
        count: this.processing.size
      },
      completed: {
        count: this.completed.size
      },
      failed: {
        count: this.failed.size
      },
      deadLetterQueue: {
        count: this.deadLetterQueue.length,
        enabled: this.config.deadLetterQueueEnabled
      },
      totals: {
        ...this.stats
      },
      successRate: this.stats.dequeued > 0 
        ? ((this.stats.completed / this.stats.dequeued) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear completed and failed tasks
   * @param {Object} options - Clear options
   */
  async clear(options = {}) {
    const { olderThan, status } = options;
    let clearedCount = 0;

    const shouldClear = (task) => {
      if (status && task.status !== status) {
        return false;
      }
      
      if (olderThan) {
        const taskTime = new Date(task.completedAt || task.failedAt || task.enqueuedAt);
        return taskTime < new Date(olderThan);
      }
      
      return true;
    };

    // Clear completed tasks
    if (!status || status === 'completed') {
      for (const [taskId, task] of this.completed.entries()) {
        if (shouldClear(task)) {
          this.completed.delete(taskId);
          clearedCount++;
        }
      }
    }

    // Clear failed tasks
    if (!status || status === 'failed') {
      for (const [taskId, task] of this.failed.entries()) {
        if (shouldClear(task)) {
          this.failed.delete(taskId);
          clearedCount++;
        }
      }
    }

    // Clear dead letter queue
    if (!status || status === 'failed') {
      const originalLength = this.deadLetterQueue.length;
      this.deadLetterQueue = this.deadLetterQueue.filter(task => !shouldClear(task));
      clearedCount += originalLength - this.deadLetterQueue.length;
    }

    this.logger.info(`Cleared ${clearedCount} tasks`, { clearedCount, options });
    
    return clearedCount;
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.paused = true;
    this.logger.info('Queue processing paused');
    this.emit('queuePaused');
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.paused = false;
    this.logger.info('Queue processing resumed');
    this.emit('queueResumed');
  }

  /**
   * Check if queue is paused
   * @returns {boolean} Paused status
   */
  isPaused() {
    return this.paused || false;
  }

  /**
   * Insert task in priority order
   * @param {Object} task - Task to insert
   */
  _insertByPriority(task) {
    let insertIndex = this.queue.length;
    
    // Find insertion point (lower priority number = higher priority)
    for (let i = 0; i < this.queue.length; i++) {
      if (task.priority < this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * Format task status for external consumption
   * @param {Object} task - Internal task object
   * @returns {Object} Formatted task status
   */
  _formatTaskStatus(task) {
    return {
      id: task.id,
      status: task.status,
      priority: task.priority,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      enqueuedAt: task.enqueuedAt,
      dequeuedAt: task.dequeuedAt,
      completedAt: task.completedAt,
      failedAt: task.failedAt,
      cancelledAt: task.cancelledAt,
      lastAttempt: task.lastAttempt,
      error: task.error,
      result: task.result,
      data: task.data
    };
  }

  /**
   * Generate unique task ID
   * @returns {string} Task ID
   */
  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Message Queue for real-time communication
 */
export class MessageQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 10000,
      ttl: config.ttl || 300000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      ...config
    };

    this.logger = new SimpleLogger('MessageQueue');
    
    this.messages = new Map();
    this.subscribers = new Map();
    
    // Start cleanup interval
    this._startCleanup();
  }

  /**
   * Publish a message to a channel
   * @param {string} channel - Channel name
   * @param {Object} message - Message to publish
   */
  async publish(channel, message) {
    const messageId = this._generateMessageId();
    const messageData = {
      id: messageId,
      channel,
      data: message,
      timestamp: new Date().toISOString(),
      ttl: Date.now() + this.config.ttl
    };

    // Store message
    this.messages.set(messageId, messageData);
    
    // Deliver to subscribers
    const channelSubscribers = this.subscribers.get(channel) || new Set();
    for (const callback of channelSubscribers) {
      try {
        callback(messageData);
      } catch (error) {
        this.logger.error(`Subscriber callback error for channel ${channel}:`, error);
      }
    }

    this.logger.debug(`Message published to channel: ${channel}`, {
      messageId,
      channel,
      subscriberCount: channelSubscribers.size
    });

    this.emit('messagePublished', messageData);
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name
   * @param {Function} callback - Message callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    
    this.subscribers.get(channel).add(callback);
    
    this.logger.debug(`Subscribed to channel: ${channel}`);
    
    // Return unsubscribe function
    return () => {
      const channelSubscribers = this.subscribers.get(channel);
      if (channelSubscribers) {
        channelSubscribers.delete(callback);
        if (channelSubscribers.size === 0) {
          this.subscribers.delete(channel);
        }
      }
    };
  }

  /**
   * Get message history for a channel
   * @param {string} channel - Channel name
   * @param {Object} options - Query options
   * @returns {Array} Message history
   */
  getHistory(channel, options = {}) {
    const { limit = 100, since } = options;
    
    let messages = Array.from(this.messages.values())
      .filter(msg => msg.channel === channel);
    
    if (since) {
      const sinceTime = new Date(since);
      messages = messages.filter(msg => new Date(msg.timestamp) >= sinceTime);
    }
    
    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    return messages.slice(0, limit);
  }

  /**
   * Start cleanup interval for expired messages
   */
  _startCleanup() {
    setInterval(() => {
      this._cleanupExpiredMessages();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up expired messages
   */
  _cleanupExpiredMessages() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [messageId, message] of this.messages.entries()) {
      if (message.ttl < now) {
        this.messages.delete(messageId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired messages`);
    }
  }

  /**
   * Generate unique message ID
   * @returns {string} Message ID
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get queue statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      messages: this.messages.size,
      channels: this.subscribers.size,
      totalSubscribers: Array.from(this.subscribers.values())
        .reduce((sum, subs) => sum + subs.size, 0)
    };
  }
}

export default { TaskQueue, MessageQueue };

