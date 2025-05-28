/**
 * Message Queue
 * 
 * Asynchronous message processing with retry logic for the AgentAPI middleware.
 * Handles message queuing, processing, and delivery with fault tolerance.
 */

import EventEmitter from 'events';

export class MessageQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxQueueSize: config.maxQueueSize || 1000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      processingTimeout: config.processingTimeout || 30000,
      batchSize: config.batchSize || 10,
      processingInterval: config.processingInterval || 100,
      enablePersistence: config.enablePersistence !== false,
      enablePriority: config.enablePriority !== false,
      ...config
    };

    // Queue storage
    this.messageQueue = [];
    this.processingQueue = new Map(); // messageId -> processing info
    this.deadLetterQueue = [];
    this.completedMessages = new Map(); // messageId -> result

    // Processing state
    this.isProcessing = false;
    this.processingInterval = null;

    // Statistics
    this.stats = {
      totalMessages: 0,
      processedMessages: 0,
      failedMessages: 0,
      retriedMessages: 0,
      averageProcessingTime: 0,
      queueSize: 0,
      deadLetterSize: 0
    };

    // Message priorities
    this.priorities = {
      LOW: 1,
      NORMAL: 2,
      HIGH: 3,
      URGENT: 4
    };
  }

  /**
   * Initialize the message queue
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Message Queue...');

      // Load persisted messages if enabled
      if (this.config.enablePersistence) {
        await this._loadPersistedMessages();
      }

      // Start processing
      this.startProcessing();

      console.log('✅ Message Queue initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Message Queue:', error);
      throw error;
    }
  }

  /**
   * Enqueue a message for processing
   */
  async enqueue(messageData, options = {}) {
    try {
      // Check queue size limits
      if (this.messageQueue.length >= this.config.maxQueueSize) {
        throw new Error(`Queue is full (${this.config.maxQueueSize} messages)`);
      }

      const messageId = this._generateMessageId();
      const priority = this.config.enablePriority ? 
        (options.priority || this.priorities.NORMAL) : this.priorities.NORMAL;

      const message = {
        id: messageId,
        data: messageData,
        priority,
        retries: 0,
        maxRetries: options.maxRetries || this.config.maxRetries,
        timeout: options.timeout || this.config.processingTimeout,
        created: Date.now(),
        options: { ...options }
      };

      // Insert message based on priority
      this._insertMessageByPriority(message);

      // Update statistics
      this.stats.totalMessages++;
      this.stats.queueSize = this.messageQueue.length;

      // Persist message if enabled
      if (this.config.enablePersistence) {
        await this._persistMessage(message);
      }

      console.log(`📥 Enqueued message ${messageId} with priority ${priority}`);
      this.emit('messageEnqueued', message);

      return messageId;
    } catch (error) {
      console.error('❌ Failed to enqueue message:', error);
      throw error;
    }
  }

  /**
   * Start message processing
   */
  startProcessing() {
    if (this.isProcessing) {
      console.warn('⚠️ Message processing is already running');
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      await this._processMessages();
    }, this.config.processingInterval);

    console.log('🔄 Message processing started');
    this.emit('processingStarted');
  }

  /**
   * Stop message processing
   */
  async stopProcessing() {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for current processing to complete
    await this._waitForProcessingCompletion();

    console.log('🛑 Message processing stopped');
    this.emit('processingStopped');
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId) {
    // Check completed messages first
    if (this.completedMessages.has(messageId)) {
      return this.completedMessages.get(messageId);
    }

    // Check processing queue
    if (this.processingQueue.has(messageId)) {
      return this.processingQueue.get(messageId);
    }

    // Check main queue
    const message = this.messageQueue.find(msg => msg.id === messageId);
    if (message) {
      return { ...message, status: 'queued' };
    }

    // Check dead letter queue
    const deadMessage = this.deadLetterQueue.find(msg => msg.id === messageId);
    if (deadMessage) {
      return { ...deadMessage, status: 'failed' };
    }

    return null;
  }

  /**
   * Get queue statistics and metrics
   */
  async getMetrics() {
    const processingMessages = Array.from(this.processingQueue.values());
    
    return {
      ...this.stats,
      queueSize: this.messageQueue.length,
      processingSize: this.processingQueue.size,
      deadLetterSize: this.deadLetterQueue.length,
      completedSize: this.completedMessages.size,
      isProcessing: this.isProcessing,
      messagesByPriority: this._getMessagesByPriority(),
      averageWaitTime: this._calculateAverageWaitTime(),
      processingTimes: this._getProcessingTimes(processingMessages),
      retryStatistics: this._getRetryStatistics()
    };
  }

  /**
   * Clear completed messages
   */
  async clearCompleted(olderThan = null) {
    try {
      const cutoffTime = olderThan || (Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      let clearedCount = 0;

      for (const [messageId, message] of this.completedMessages.entries()) {
        if (message.completed && message.completed < cutoffTime) {
          this.completedMessages.delete(messageId);
          clearedCount++;
        }
      }

      console.log(`🧹 Cleared ${clearedCount} completed messages`);
      return clearedCount;
    } catch (error) {
      console.error('❌ Failed to clear completed messages:', error);
      throw error;
    }
  }

  /**
   * Requeue messages from dead letter queue
   */
  async requeueDeadLetters(messageIds = null) {
    try {
      const messagesToRequeue = messageIds ? 
        this.deadLetterQueue.filter(msg => messageIds.includes(msg.id)) :
        [...this.deadLetterQueue];

      let requeuedCount = 0;

      for (const message of messagesToRequeue) {
        // Reset retry count and re-enqueue
        message.retries = 0;
        message.requeued = Date.now();
        
        this._insertMessageByPriority(message);
        
        // Remove from dead letter queue
        const index = this.deadLetterQueue.findIndex(msg => msg.id === message.id);
        if (index !== -1) {
          this.deadLetterQueue.splice(index, 1);
        }

        requeuedCount++;
      }

      this.stats.queueSize = this.messageQueue.length;
      this.stats.deadLetterSize = this.deadLetterQueue.length;

      console.log(`🔄 Requeued ${requeuedCount} messages from dead letter queue`);
      this.emit('messagesRequeued', requeuedCount);

      return requeuedCount;
    } catch (error) {
      console.error('❌ Failed to requeue dead letter messages:', error);
      throw error;
    }
  }

  /**
   * Shutdown the message queue
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Message Queue...');

      // Stop processing
      await this.stopProcessing();

      // Persist remaining messages if enabled
      if (this.config.enablePersistence) {
        await this._persistAllMessages();
      }

      // Clear all queues
      this.messageQueue.length = 0;
      this.processingQueue.clear();
      this.completedMessages.clear();

      console.log('✅ Message Queue shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Message Queue shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _generateMessageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `msg-${timestamp}-${random}`;
  }

  _insertMessageByPriority(message) {
    if (!this.config.enablePriority) {
      this.messageQueue.push(message);
      return;
    }

    // Insert message based on priority (higher priority first)
    let insertIndex = this.messageQueue.length;
    
    for (let i = 0; i < this.messageQueue.length; i++) {
      if (this.messageQueue[i].priority < message.priority) {
        insertIndex = i;
        break;
      }
    }

    this.messageQueue.splice(insertIndex, 0, message);
  }

  async _processMessages() {
    if (this.messageQueue.length === 0) {
      return;
    }

    const batchSize = Math.min(this.config.batchSize, this.messageQueue.length);
    const messagesToProcess = this.messageQueue.splice(0, batchSize);

    const processingPromises = messagesToProcess.map(message => 
      this._processMessage(message)
    );

    await Promise.allSettled(processingPromises);
    
    this.stats.queueSize = this.messageQueue.length;
  }

  async _processMessage(message) {
    const startTime = Date.now();
    
    try {
      // Add to processing queue
      this.processingQueue.set(message.id, {
        ...message,
        status: 'processing',
        startTime
      });

      // Process the message (this would be implemented based on specific needs)
      const result = await this._executeMessage(message);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Mark as completed
      this.completedMessages.set(message.id, {
        ...message,
        status: 'completed',
        result,
        processingTime,
        completed: Date.now()
      });

      // Remove from processing queue
      this.processingQueue.delete(message.id);

      // Update statistics
      this.stats.processedMessages++;
      this._updateAverageProcessingTime(processingTime);

      console.log(`✅ Processed message ${message.id} in ${processingTime}ms`);
      this.emit('messageProcessed', { message, result, processingTime });

    } catch (error) {
      await this._handleMessageError(message, error, startTime);
    }
  }

  async _executeMessage(message) {
    // This is where the actual message processing would happen
    // For now, this is a placeholder that simulates processing
    
    return new Promise((resolve, reject) => {
      // Simulate processing time
      const processingTime = Math.random() * 1000 + 500; // 500-1500ms
      
      setTimeout(() => {
        // Simulate occasional failures
        if (Math.random() < 0.1) { // 10% failure rate
          reject(new Error('Simulated processing error'));
        } else {
          resolve({
            messageId: message.id,
            processed: true,
            timestamp: Date.now(),
            data: message.data
          });
        }
      }, processingTime);
    });
  }

  async _handleMessageError(message, error, startTime) {
    const processingTime = Date.now() - startTime;

    // Remove from processing queue
    this.processingQueue.delete(message.id);

    // Check if we should retry
    if (message.retries < message.maxRetries) {
      message.retries++;
      message.lastError = error.message;
      message.lastRetry = Date.now();

      // Calculate retry delay (exponential backoff)
      const retryDelay = this.config.retryDelay * Math.pow(2, message.retries - 1);
      
      setTimeout(() => {
        this._insertMessageByPriority(message);
        this.stats.queueSize = this.messageQueue.length;
      }, retryDelay);

      this.stats.retriedMessages++;
      
      console.warn(`⚠️ Retrying message ${message.id} (attempt ${message.retries}/${message.maxRetries}) in ${retryDelay}ms`);
      this.emit('messageRetry', { message, error, retryDelay });

    } else {
      // Move to dead letter queue
      this.deadLetterQueue.push({
        ...message,
        status: 'failed',
        finalError: error.message,
        processingTime,
        failed: Date.now()
      });

      this.stats.failedMessages++;
      this.stats.deadLetterSize = this.deadLetterQueue.length;

      console.error(`❌ Message ${message.id} failed permanently after ${message.retries} retries:`, error.message);
      this.emit('messageError', { message, error });
    }
  }

  async _waitForProcessingCompletion() {
    // Wait for all currently processing messages to complete
    while (this.processingQueue.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async _loadPersistedMessages() {
    // In a real implementation, this would load messages from persistent storage
    console.log('📂 Loading persisted messages...');
    return true;
  }

  async _persistMessage(message) {
    // In a real implementation, this would save the message to persistent storage
    return true;
  }

  async _persistAllMessages() {
    // In a real implementation, this would save all remaining messages
    console.log('💾 Persisting remaining messages...');
    return true;
  }

  _updateAverageProcessingTime(processingTime) {
    const totalProcessed = this.stats.processedMessages;
    this.stats.averageProcessingTime = 
      ((this.stats.averageProcessingTime * (totalProcessed - 1)) + processingTime) / totalProcessed;
  }

  _getMessagesByPriority() {
    const byPriority = {};
    
    for (const [priority, value] of Object.entries(this.priorities)) {
      byPriority[priority] = this.messageQueue.filter(msg => msg.priority === value).length;
    }

    return byPriority;
  }

  _calculateAverageWaitTime() {
    if (this.messageQueue.length === 0) return 0;

    const now = Date.now();
    const totalWaitTime = this.messageQueue.reduce((sum, msg) => sum + (now - msg.created), 0);
    return totalWaitTime / this.messageQueue.length;
  }

  _getProcessingTimes(processingMessages) {
    if (processingMessages.length === 0) return { min: 0, max: 0, average: 0 };

    const now = Date.now();
    const times = processingMessages.map(msg => now - msg.startTime);
    
    return {
      min: Math.min(...times),
      max: Math.max(...times),
      average: times.reduce((sum, time) => sum + time, 0) / times.length
    };
  }

  _getRetryStatistics() {
    const retryStats = { 0: 0, 1: 0, 2: 0, 3: 0, '3+': 0 };
    
    // Count retries in current queue
    this.messageQueue.forEach(msg => {
      const retries = msg.retries;
      if (retries <= 3) {
        retryStats[retries]++;
      } else {
        retryStats['3+']++;
      }
    });

    // Count retries in dead letter queue
    this.deadLetterQueue.forEach(msg => {
      const retries = msg.retries;
      if (retries <= 3) {
        retryStats[retries]++;
      } else {
        retryStats['3+']++;
      }
    });

    return retryStats;
  }
}

export default MessageQueue;

