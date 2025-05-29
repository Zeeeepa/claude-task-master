import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message Queue
 * In-memory queue with prioritization, persistence options, and dead letter queue handling
 */
export class MessageQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.maxSize = options.maxSize || 10000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.deadLetterEnabled = options.deadLetterEnabled !== false;
    this.persistenceEnabled = options.persistenceEnabled || false;
    this.persistencePath = options.persistencePath || './queue.json';
    this.processingTimeout = options.processingTimeout || 60000; // 1 minute
    
    // Queue storage - using priority queues
    this.queues = {
      1: [], // Critical
      2: [], // High
      3: [], // Normal
      4: []  // Low
    };
    
    // Dead letter queue
    this.deadLetterQueue = [];
    
    // Processing tracking
    this.processing = new Map();
    this.processingTimeouts = new Map();
    
    // Statistics
    this.stats = {
      enqueued: 0,
      dequeued: 0,
      processed: 0,
      failed: 0,
      deadLettered: 0,
      retried: 0
    };
    
    // Load persisted queue if enabled
    this.loadPersistedQueue();
    
    // Start processing timeout cleanup
    this.startTimeoutCleanup();
  }

  /**
   * Enqueue a message with priority
   */
  async enqueue(message, priority = 3) {
    try {
      // Validate priority
      if (!this.queues[priority]) {
        priority = 3; // Default to normal priority
      }
      
      // Check queue size limit
      const totalSize = this.size();
      if (totalSize >= this.maxSize) {
        throw new Error(`Queue is full (max size: ${this.maxSize})`);
      }
      
      // Create queue item
      const queueItem = {
        id: message.id || uuidv4(),
        message,
        priority,
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
        attempts: []
      };
      
      // Add to appropriate priority queue
      this.queues[priority].push(queueItem);
      
      // Update statistics
      this.stats.enqueued++;
      
      // Persist if enabled
      if (this.persistenceEnabled) {
        await this.persistQueue();
      }
      
      // Emit event
      this.emit('enqueued', {
        itemId: queueItem.id,
        messageId: message.id,
        priority,
        queueSize: this.size(),
        timestamp: queueItem.enqueuedAt
      });
      
      console.log(`[MessageQueue] Enqueued message ${queueItem.id} with priority ${priority}`);
      
      return queueItem.id;
    } catch (error) {
      console.error('[MessageQueue] Enqueue error:', error);
      throw error;
    }
  }

  /**
   * Dequeue next message based on priority
   */
  async dequeue() {
    try {
      // Check queues in priority order (1 = highest, 4 = lowest)
      for (let priority = 1; priority <= 4; priority++) {
        const queue = this.queues[priority];
        if (queue.length > 0) {
          const queueItem = queue.shift();
          
          // Mark as processing
          queueItem.dequeuedAt = new Date().toISOString();
          queueItem.status = 'processing';
          this.processing.set(queueItem.id, queueItem);
          
          // Set processing timeout
          this.setProcessingTimeout(queueItem.id);
          
          // Update statistics
          this.stats.dequeued++;
          
          // Persist if enabled
          if (this.persistenceEnabled) {
            await this.persistQueue();
          }
          
          // Emit event
          this.emit('dequeued', {
            itemId: queueItem.id,
            messageId: queueItem.message.id,
            priority,
            queueSize: this.size(),
            timestamp: queueItem.dequeuedAt
          });
          
          console.log(`[MessageQueue] Dequeued message ${queueItem.id} from priority ${priority}`);
          
          return queueItem;
        }
      }
      
      return null; // No messages in queue
    } catch (error) {
      console.error('[MessageQueue] Dequeue error:', error);
      throw error;
    }
  }

  /**
   * Mark message as processed successfully
   */
  async markProcessed(itemId, result = null) {
    try {
      const queueItem = this.processing.get(itemId);
      if (!queueItem) {
        throw new Error(`Queue item ${itemId} not found in processing`);
      }
      
      // Update item
      queueItem.status = 'completed';
      queueItem.completedAt = new Date().toISOString();
      queueItem.result = result;
      
      // Remove from processing
      this.processing.delete(itemId);
      this.clearProcessingTimeout(itemId);
      
      // Update statistics
      this.stats.processed++;
      
      // Persist if enabled
      if (this.persistenceEnabled) {
        await this.persistQueue();
      }
      
      // Emit event
      this.emit('processed', {
        itemId,
        messageId: queueItem.message.id,
        result,
        processingTime: new Date(queueItem.completedAt) - new Date(queueItem.dequeuedAt),
        timestamp: queueItem.completedAt
      });
      
      console.log(`[MessageQueue] Marked message ${itemId} as processed`);
      
      return true;
    } catch (error) {
      console.error('[MessageQueue] Mark processed error:', error);
      throw error;
    }
  }

  /**
   * Mark message as failed and handle retry logic
   */
  async markFailed(itemId, error) {
    try {
      const queueItem = this.processing.get(itemId);
      if (!queueItem) {
        throw new Error(`Queue item ${itemId} not found in processing`);
      }
      
      // Record attempt
      queueItem.attempts.push({
        timestamp: new Date().toISOString(),
        error: error.message || error
      });
      
      queueItem.retryCount++;
      queueItem.lastError = error.message || error;
      
      // Remove from processing
      this.processing.delete(itemId);
      this.clearProcessingTimeout(itemId);
      
      // Check if should retry
      if (queueItem.retryCount < this.maxRetries) {
        // Re-queue for retry
        queueItem.status = 'retrying';
        queueItem.retryAt = new Date(Date.now() + this.retryDelay * Math.pow(2, queueItem.retryCount - 1)).toISOString();
        
        // Add back to queue with same priority
        this.queues[queueItem.priority].push(queueItem);
        
        // Update statistics
        this.stats.retried++;
        
        // Emit retry event
        this.emit('retrying', {
          itemId,
          messageId: queueItem.message.id,
          retryCount: queueItem.retryCount,
          retryAt: queueItem.retryAt,
          error: queueItem.lastError,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[MessageQueue] Retrying message ${itemId} (attempt ${queueItem.retryCount})`);
      } else {
        // Max retries reached - move to dead letter queue
        queueItem.status = 'dead_lettered';
        queueItem.deadLetteredAt = new Date().toISOString();
        
        if (this.deadLetterEnabled) {
          this.deadLetterQueue.push(queueItem);
        }
        
        // Update statistics
        this.stats.failed++;
        this.stats.deadLettered++;
        
        // Emit dead letter event
        this.emit('dead_lettered', {
          itemId,
          messageId: queueItem.message.id,
          retryCount: queueItem.retryCount,
          error: queueItem.lastError,
          timestamp: queueItem.deadLetteredAt
        });
        
        console.log(`[MessageQueue] Message ${itemId} moved to dead letter queue after ${queueItem.retryCount} attempts`);
      }
      
      // Persist if enabled
      if (this.persistenceEnabled) {
        await this.persistQueue();
      }
      
      return true;
    } catch (error) {
      console.error('[MessageQueue] Mark failed error:', error);
      throw error;
    }
  }

  /**
   * Remove message from queue by ID
   */
  async remove(messageId) {
    try {
      let removed = false;
      
      // Check all priority queues
      for (let priority = 1; priority <= 4; priority++) {
        const queue = this.queues[priority];
        const index = queue.findIndex(item => item.message.id === messageId || item.id === messageId);
        
        if (index !== -1) {
          const removedItem = queue.splice(index, 1)[0];
          removed = true;
          
          this.emit('removed', {
            itemId: removedItem.id,
            messageId: removedItem.message.id,
            priority,
            timestamp: new Date().toISOString()
          });
          
          console.log(`[MessageQueue] Removed message ${messageId} from priority ${priority} queue`);
          break;
        }
      }
      
      // Check processing queue
      for (const [itemId, queueItem] of this.processing.entries()) {
        if (queueItem.message.id === messageId || queueItem.id === messageId) {
          this.processing.delete(itemId);
          this.clearProcessingTimeout(itemId);
          removed = true;
          
          this.emit('removed', {
            itemId,
            messageId: queueItem.message.id,
            status: 'processing',
            timestamp: new Date().toISOString()
          });
          
          console.log(`[MessageQueue] Removed processing message ${messageId}`);
          break;
        }
      }
      
      // Persist if enabled
      if (this.persistenceEnabled && removed) {
        await this.persistQueue();
      }
      
      return removed;
    } catch (error) {
      console.error('[MessageQueue] Remove error:', error);
      throw error;
    }
  }

  /**
   * Get queue size
   */
  size() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Get queue size by priority
   */
  sizeByPriority() {
    return {
      critical: this.queues[1].length,
      high: this.queues[2].length,
      normal: this.queues[3].length,
      low: this.queues[4].length,
      processing: this.processing.size,
      deadLetter: this.deadLetterQueue.length
    };
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      current: this.sizeByPriority(),
      total: this.size(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Peek at next message without dequeuing
   */
  peek() {
    for (let priority = 1; priority <= 4; priority++) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return { ...queue[0] };
      }
    }
    return null;
  }

  /**
   * Get all messages in queue
   */
  getAll() {
    const allMessages = [];
    
    for (let priority = 1; priority <= 4; priority++) {
      allMessages.push(...this.queues[priority].map(item => ({ ...item })));
    }
    
    return allMessages.sort((a, b) => {
      // Sort by priority first, then by enqueue time
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.enqueuedAt) - new Date(b.enqueuedAt);
    });
  }

  /**
   * Get processing messages
   */
  getProcessing() {
    return Array.from(this.processing.values()).map(item => ({ ...item }));
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear queue
   */
  async clear(priority = null) {
    if (priority && this.queues[priority]) {
      const cleared = this.queues[priority].length;
      this.queues[priority] = [];
      
      this.emit('cleared', {
        priority,
        count: cleared,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[MessageQueue] Cleared priority ${priority} queue (${cleared} messages)`);
    } else {
      let totalCleared = 0;
      for (let p = 1; p <= 4; p++) {
        totalCleared += this.queues[p].length;
        this.queues[p] = [];
      }
      
      this.emit('cleared', {
        priority: 'all',
        count: totalCleared,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[MessageQueue] Cleared all queues (${totalCleared} messages)`);
    }
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistQueue();
    }
  }

  /**
   * Set processing timeout for a message
   */
  setProcessingTimeout(itemId) {
    const timeoutId = setTimeout(() => {
      this.handleProcessingTimeout(itemId);
    }, this.processingTimeout);
    
    this.processingTimeouts.set(itemId, timeoutId);
  }

  /**
   * Clear processing timeout
   */
  clearProcessingTimeout(itemId) {
    const timeoutId = this.processingTimeouts.get(itemId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.processingTimeouts.delete(itemId);
    }
  }

  /**
   * Handle processing timeout
   */
  async handleProcessingTimeout(itemId) {
    const queueItem = this.processing.get(itemId);
    if (queueItem) {
      console.warn(`[MessageQueue] Processing timeout for message ${itemId}`);
      
      await this.markFailed(itemId, new Error('Processing timeout'));
      
      this.emit('processing_timeout', {
        itemId,
        messageId: queueItem.message.id,
        processingTime: this.processingTimeout,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Start timeout cleanup
   */
  startTimeoutCleanup() {
    // Clean up expired timeouts every minute
    setInterval(() => {
      const now = Date.now();
      for (const [itemId, queueItem] of this.processing.entries()) {
        const processingTime = now - new Date(queueItem.dequeuedAt).getTime();
        if (processingTime > this.processingTimeout) {
          this.handleProcessingTimeout(itemId);
        }
      }
    }, 60000);
  }

  /**
   * Persist queue to storage
   */
  async persistQueue() {
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      const fs = await import('fs/promises');
      const queueData = {
        queues: this.queues,
        processing: Array.from(this.processing.entries()),
        deadLetterQueue: this.deadLetterQueue,
        stats: this.stats,
        timestamp: new Date().toISOString()
      };
      
      await fs.writeFile(this.persistencePath, JSON.stringify(queueData, null, 2));
    } catch (error) {
      console.error('[MessageQueue] Persist queue error:', error);
    }
  }

  /**
   * Load persisted queue
   */
  async loadPersistedQueue() {
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.persistencePath, 'utf8');
      const queueData = JSON.parse(data);
      
      // Restore queues
      if (queueData.queues) {
        this.queues = queueData.queues;
      }
      
      // Restore processing (but mark as failed since server restarted)
      if (queueData.processing) {
        for (const [itemId, queueItem] of queueData.processing) {
          await this.markFailed(itemId, new Error('Server restart'));
        }
      }
      
      // Restore dead letter queue
      if (queueData.deadLetterQueue) {
        this.deadLetterQueue = queueData.deadLetterQueue;
      }
      
      // Restore stats
      if (queueData.stats) {
        this.stats = { ...this.stats, ...queueData.stats };
      }
      
      console.log(`[MessageQueue] Loaded persisted queue with ${this.size()} messages`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[MessageQueue] Load persisted queue error:', error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    // Clear all timeouts
    for (const timeoutId of this.processingTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    
    this.processingTimeouts.clear();
    this.processing.clear();
    
    // Clear queues
    for (let priority = 1; priority <= 4; priority++) {
      this.queues[priority] = [];
    }
    
    this.deadLetterQueue = [];
    this.removeAllListeners();
  }
}

export default MessageQueue;

