/**
 * @fileoverview Message Queue
 * @description Handles asynchronous message processing and queuing
 */

import { log } from '../utils/simple_logger.js';

/**
 * Message Queue - Handles asynchronous message processing
 */
export class MessageQueue {
  constructor(config) {
    this.config = config;
    this.queues = new Map();
    this.processors = new Map();
    this.isProcessing = false;
    this.processingInterval = null;
    this.maxQueueSize = config.maxQueueSize || 1000;
    this.processingIntervalMs = config.processingIntervalMs || 100;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
  }

  /**
   * Initialize the message queue
   */
  async initialize() {
    log('info', '🔄 Initializing message queue...');
    
    // Setup default queues
    this.setupDefaultQueues();
    
    // Start processing
    this.startProcessing();
    
    log('info', '✅ Message queue initialized');
  }

  /**
   * Setup default message queues
   */
  setupDefaultQueues() {
    // High priority queue for urgent messages
    this.createQueue('high_priority', {
      maxSize: 100,
      processingOrder: 'fifo',
      retryPolicy: 'exponential_backoff'
    });

    // Normal priority queue for regular messages
    this.createQueue('normal_priority', {
      maxSize: 500,
      processingOrder: 'fifo',
      retryPolicy: 'linear_backoff'
    });

    // Low priority queue for background tasks
    this.createQueue('low_priority', {
      maxSize: 1000,
      processingOrder: 'fifo',
      retryPolicy: 'linear_backoff'
    });

    // Dead letter queue for failed messages
    this.createQueue('dead_letter', {
      maxSize: 200,
      processingOrder: 'fifo',
      retryPolicy: 'none'
    });
  }

  /**
   * Create a new queue
   * @param {string} queueName - Name of the queue
   * @param {Object} options - Queue options
   */
  createQueue(queueName, options = {}) {
    const queue = {
      name: queueName,
      messages: [],
      options: {
        maxSize: options.maxSize || this.maxQueueSize,
        processingOrder: options.processingOrder || 'fifo',
        retryPolicy: options.retryPolicy || 'linear_backoff',
        ...options
      },
      stats: {
        totalMessages: 0,
        processedMessages: 0,
        failedMessages: 0,
        retriedMessages: 0
      }
    };
    
    this.queues.set(queueName, queue);
    log('debug', `📝 Created queue: ${queueName}`);
  }

  /**
   * Add message to queue
   * @param {string} queueName - Target queue name
   * @param {Object} message - Message to queue
   * @param {Object} options - Message options
   * @returns {string} Message ID
   */
  async enqueue(queueName, message, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    // Check queue size limit
    if (queue.messages.length >= queue.options.maxSize) {
      throw new Error(`Queue ${queueName} is full`);
    }
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queueMessage = {
      id: messageId,
      payload: message,
      queueName: queueName,
      enqueuedAt: new Date(),
      attempts: 0,
      maxRetries: options.maxRetries || this.maxRetries,
      priority: options.priority || 'normal',
      delay: options.delay || 0,
      processAfter: new Date(Date.now() + (options.delay || 0)),
      metadata: options.metadata || {}
    };
    
    // Insert message based on processing order and priority
    this._insertMessage(queue, queueMessage);
    
    queue.stats.totalMessages++;
    
    log('debug', `📨 Message enqueued: ${messageId} to ${queueName}`);
    return messageId;
  }

  /**
   * Process messages from a specific queue
   * @param {string} queueName - Queue to process
   * @param {Function} processor - Message processor function
   */
  registerProcessor(queueName, processor) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }
    
    this.processors.set(queueName, processor);
    log('debug', `🔧 Registered processor for queue: ${queueName}`);
  }

  /**
   * Start message processing
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this._processQueues();
    }, this.processingIntervalMs);
    
    log('debug', '▶️ Message processing started');
  }

  /**
   * Stop message processing
   */
  stopProcessing() {
    if (!this.isProcessing) {
      return;
    }
    
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    log('debug', '⏹️ Message processing stopped');
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   * @returns {Object} Queue statistics
   */
  getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    return {
      name: queueName,
      current_size: queue.messages.length,
      max_size: queue.options.maxSize,
      total_messages: queue.stats.totalMessages,
      processed_messages: queue.stats.processedMessages,
      failed_messages: queue.stats.failedMessages,
      retried_messages: queue.stats.retriedMessages,
      processing_rate: this._calculateProcessingRate(queue),
      oldest_message_age_ms: this._getOldestMessageAge(queue)
    };
  }

  /**
   * Get all queue statistics
   * @returns {Object} All queue statistics
   */
  getAllStats() {
    const stats = {};
    
    for (const queueName of this.queues.keys()) {
      stats[queueName] = this.getQueueStats(queueName);
    }
    
    return {
      queues: stats,
      total_queues: this.queues.size,
      is_processing: this.isProcessing,
      processing_interval_ms: this.processingIntervalMs
    };
  }

  /**
   * Clear queue
   * @param {string} queueName - Queue to clear
   * @returns {number} Number of messages cleared
   */
  clearQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    
    const clearedCount = queue.messages.length;
    queue.messages = [];
    
    log('info', `🧹 Cleared ${clearedCount} messages from queue: ${queueName}`);
    return clearedCount;
  }

  /**
   * Remove queue
   * @param {string} queueName - Queue to remove
   * @returns {boolean} True if queue was removed
   */
  removeQueue(queueName) {
    const removed = this.queues.delete(queueName);
    this.processors.delete(queueName);
    
    if (removed) {
      log('debug', `🗑️ Removed queue: ${queueName}`);
    }
    
    return removed;
  }

  /**
   * Get message queue health
   * @returns {Object} Health status
   */
  getHealth() {
    const stats = this.getAllStats();
    const totalMessages = Object.values(stats.queues).reduce((sum, q) => sum + q.current_size, 0);
    const totalCapacity = Object.values(stats.queues).reduce((sum, q) => sum + q.max_size, 0);
    
    return {
      status: 'healthy',
      is_processing: this.isProcessing,
      total_queues: stats.total_queues,
      total_messages: totalMessages,
      capacity_usage: totalCapacity > 0 ? (totalMessages / totalCapacity) * 100 : 0,
      queue_health: Object.entries(stats.queues).map(([name, queueStats]) => ({
        name,
        status: queueStats.current_size < queueStats.max_size ? 'healthy' : 'full',
        usage_percent: (queueStats.current_size / queueStats.max_size) * 100
      }))
    };
  }

  /**
   * Shutdown message queue
   */
  async shutdown() {
    log('info', '🔄 Shutting down message queue...');
    
    // Stop processing
    this.stopProcessing();
    
    // Clear all queues
    for (const queueName of this.queues.keys()) {
      this.clearQueue(queueName);
    }
    
    log('info', '✅ Message queue shutdown complete');
  }

  /**
   * Insert message into queue based on processing order
   * @param {Object} queue - Target queue
   * @param {Object} message - Message to insert
   * @private
   */
  _insertMessage(queue, message) {
    if (queue.options.processingOrder === 'lifo') {
      queue.messages.unshift(message);
    } else if (queue.options.processingOrder === 'priority') {
      // Insert based on priority
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const messagePriority = priorityOrder[message.priority] || 2;
      
      let insertIndex = queue.messages.length;
      for (let i = 0; i < queue.messages.length; i++) {
        const existingPriority = priorityOrder[queue.messages[i].priority] || 2;
        if (messagePriority > existingPriority) {
          insertIndex = i;
          break;
        }
      }
      
      queue.messages.splice(insertIndex, 0, message);
    } else {
      // Default: FIFO
      queue.messages.push(message);
    }
  }

  /**
   * Process all queues
   * @private
   */
  async _processQueues() {
    // Process queues in priority order
    const queuePriority = ['high_priority', 'normal_priority', 'low_priority'];
    
    for (const queueName of queuePriority) {
      if (this.queues.has(queueName)) {
        await this._processQueue(queueName);
      }
    }
    
    // Process other queues
    for (const queueName of this.queues.keys()) {
      if (!queuePriority.includes(queueName) && queueName !== 'dead_letter') {
        await this._processQueue(queueName);
      }
    }
  }

  /**
   * Process a specific queue
   * @param {string} queueName - Queue to process
   * @private
   */
  async _processQueue(queueName) {
    const queue = this.queues.get(queueName);
    const processor = this.processors.get(queueName);
    
    if (!queue || !processor || queue.messages.length === 0) {
      return;
    }
    
    // Get next message to process
    const message = queue.messages.find(msg => 
      new Date() >= msg.processAfter
    );
    
    if (!message) {
      return;
    }
    
    // Remove message from queue
    const messageIndex = queue.messages.indexOf(message);
    queue.messages.splice(messageIndex, 1);
    
    try {
      message.attempts++;
      message.lastAttemptAt = new Date();
      
      // Process message
      await processor(message.payload, message);
      
      queue.stats.processedMessages++;
      log('debug', `✅ Message processed: ${message.id} from ${queueName}`);
      
    } catch (error) {
      log('error', `❌ Message processing failed: ${message.id} - ${error.message}`);
      
      // Handle retry logic
      if (message.attempts < message.maxRetries) {
        await this._retryMessage(queue, message, error);
      } else {
        await this._moveToDeadLetter(message, error);
        queue.stats.failedMessages++;
      }
    }
  }

  /**
   * Retry failed message
   * @param {Object} queue - Source queue
   * @param {Object} message - Failed message
   * @param {Error} error - Processing error
   * @private
   */
  async _retryMessage(queue, message, error) {
    const retryDelay = this._calculateRetryDelay(queue, message);
    
    message.processAfter = new Date(Date.now() + retryDelay);
    message.lastError = error.message;
    message.retryCount = (message.retryCount || 0) + 1;
    
    // Re-insert message into queue
    this._insertMessage(queue, message);
    
    queue.stats.retriedMessages++;
    log('debug', `🔄 Message retry scheduled: ${message.id} (attempt ${message.attempts}/${message.maxRetries})`);
  }

  /**
   * Move message to dead letter queue
   * @param {Object} message - Failed message
   * @param {Error} error - Final error
   * @private
   */
  async _moveToDeadLetter(message, error) {
    const deadLetterQueue = this.queues.get('dead_letter');
    if (!deadLetterQueue) {
      log('error', `💀 No dead letter queue available for message: ${message.id}`);
      return;
    }
    
    message.failedAt = new Date();
    message.finalError = error.message;
    message.originalQueue = message.queueName;
    
    deadLetterQueue.messages.push(message);
    deadLetterQueue.stats.totalMessages++;
    
    log('warn', `💀 Message moved to dead letter queue: ${message.id}`);
  }

  /**
   * Calculate retry delay based on retry policy
   * @param {Object} queue - Queue configuration
   * @param {Object} message - Message to retry
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateRetryDelay(queue, message) {
    const baseDelay = this.retryDelayMs;
    
    switch (queue.options.retryPolicy) {
      case 'exponential_backoff':
        return baseDelay * Math.pow(2, message.attempts - 1);
      
      case 'linear_backoff':
        return baseDelay * message.attempts;
      
      case 'fixed':
        return baseDelay;
      
      default:
        return baseDelay;
    }
  }

  /**
   * Calculate processing rate for a queue
   * @param {Object} queue - Queue to analyze
   * @returns {number} Messages per second
   * @private
   */
  _calculateProcessingRate(queue) {
    // This would be implemented with actual timing data
    return queue.stats.processedMessages / 60; // Mock: messages per minute
  }

  /**
   * Get age of oldest message in queue
   * @param {Object} queue - Queue to analyze
   * @returns {number} Age in milliseconds
   * @private
   */
  _getOldestMessageAge(queue) {
    if (queue.messages.length === 0) return 0;
    
    const oldestMessage = queue.messages.reduce((oldest, msg) => 
      msg.enqueuedAt < oldest.enqueuedAt ? msg : oldest
    );
    
    return Date.now() - oldestMessage.enqueuedAt.getTime();
  }
}

export default MessageQueue;

