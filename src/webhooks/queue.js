/**
 * Event Queue
 * 
 * Reliable event processing queue with retry mechanisms,
 * dead letter queues, and performance monitoring.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export class EventQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrency: config.maxConcurrency || 5,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      maxRetryDelay: config.maxRetryDelay || 30000,
      deadLetterQueueSize: config.deadLetterQueueSize || 1000,
      processingTimeout: config.processingTimeout || 60000,
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    // Queue storage
    this.pendingQueue = [];
    this.processingQueue = new Map();
    this.deadLetterQueue = [];
    this.completedQueue = [];

    // Processing state
    this.isProcessing = false;
    this.activeWorkers = 0;
    this.paused = false;

    // Statistics
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      deadLettered: 0,
      startTime: new Date()
    };

    // Start processing
    this.startProcessing();
  }

  /**
   * Enqueue an event for processing
   */
  async enqueue(event, priority = 0) {
    const queueItem = {
      id: event.id || this.generateId(),
      event,
      priority,
      attempts: 0,
      enqueuedAt: new Date(),
      lastAttemptAt: null,
      errors: []
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.findInsertIndex(priority);
    this.pendingQueue.splice(insertIndex, 0, queueItem);

    this.stats.enqueued++;

    logger.debug('Event enqueued', {
      eventId: queueItem.id,
      priority,
      queueSize: this.pendingQueue.length
    });

    this.emit('enqueued', queueItem);

    // Trigger processing if not already running
    if (!this.isProcessing && !this.paused) {
      setImmediate(() => this.processQueue());
    }

    return queueItem.id;
  }

  /**
   * Start queue processing
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processQueue();

    logger.info('Event queue processing started', {
      maxConcurrency: this.config.maxConcurrency
    });
  }

  /**
   * Stop queue processing
   */
  async stopProcessing() {
    this.isProcessing = false;
    this.paused = true;

    // Wait for active workers to complete
    while (this.activeWorkers > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Event queue processing stopped');
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.paused = true;
    logger.info('Event queue processing paused');
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.paused = false;
    if (this.isProcessing) {
      setImmediate(() => this.processQueue());
    }
    logger.info('Event queue processing resumed');
  }

  /**
   * Main queue processing loop
   */
  async processQueue() {
    while (this.isProcessing && !this.paused) {
      // Check if we can start more workers
      if (this.activeWorkers >= this.config.maxConcurrency) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Get next item from queue
      const queueItem = this.pendingQueue.shift();
      if (!queueItem) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Start processing in background
      this.processItem(queueItem);
    }
  }

  /**
   * Process a single queue item
   */
  async processItem(queueItem) {
    this.activeWorkers++;
    this.processingQueue.set(queueItem.id, queueItem);

    const startTime = Date.now();

    try {
      logger.debug('Processing queue item', {
        eventId: queueItem.id,
        attempt: queueItem.attempts + 1,
        activeWorkers: this.activeWorkers
      });

      queueItem.attempts++;
      queueItem.lastAttemptAt = new Date();

      // Set processing timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeout);
      });

      // Process the event
      const processingPromise = this.processEvent(queueItem.event);
      
      await Promise.race([processingPromise, timeoutPromise]);

      // Success
      this.handleSuccess(queueItem, startTime);

    } catch (error) {
      this.handleFailure(queueItem, error, startTime);
    } finally {
      this.activeWorkers--;
      this.processingQueue.delete(queueItem.id);
    }
  }

  /**
   * Process the actual event (override this method)
   */
  async processEvent(event) {
    // This should be overridden by the event router
    this.emit('process', event);
    
    // Default implementation - just emit the event
    return new Promise((resolve, reject) => {
      this.emit('processEvent', event, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Handle successful processing
   */
  handleSuccess(queueItem, startTime) {
    const duration = Date.now() - startTime;
    
    this.stats.processed++;
    
    // Move to completed queue (keep limited history)
    queueItem.completedAt = new Date();
    queueItem.duration = duration;
    
    this.completedQueue.push(queueItem);
    if (this.completedQueue.length > 1000) {
      this.completedQueue.shift();
    }

    logger.debug('Queue item processed successfully', {
      eventId: queueItem.id,
      duration: `${duration}ms`,
      attempts: queueItem.attempts
    });

    this.emit('processed', queueItem);
  }

  /**
   * Handle processing failure
   */
  handleFailure(queueItem, error, startTime) {
    const duration = Date.now() - startTime;
    
    queueItem.errors.push({
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
      attempt: queueItem.attempts
    });

    logger.warn('Queue item processing failed', {
      eventId: queueItem.id,
      attempt: queueItem.attempts,
      maxAttempts: this.config.retryAttempts,
      error: error.message,
      duration: `${duration}ms`
    });

    // Check if we should retry
    if (queueItem.attempts < this.config.retryAttempts) {
      this.scheduleRetry(queueItem);
    } else {
      this.moveToDeadLetterQueue(queueItem);
    }

    this.emit('failed', queueItem, error);
  }

  /**
   * Schedule retry for failed item
   */
  scheduleRetry(queueItem) {
    this.stats.retried++;

    // Calculate exponential backoff delay
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, queueItem.attempts - 1);
    const delay = Math.min(exponentialDelay, this.config.maxRetryDelay);

    logger.debug('Scheduling retry', {
      eventId: queueItem.id,
      attempt: queueItem.attempts,
      delay: `${delay}ms`
    });

    setTimeout(() => {
      if (this.isProcessing && !this.paused) {
        // Re-enqueue with original priority
        const insertIndex = this.findInsertIndex(queueItem.priority);
        this.pendingQueue.splice(insertIndex, 0, queueItem);
        
        this.emit('retried', queueItem);
      }
    }, delay);
  }

  /**
   * Move item to dead letter queue
   */
  moveToDeadLetterQueue(queueItem) {
    this.stats.failed++;
    this.stats.deadLettered++;

    queueItem.deadLetteredAt = new Date();
    
    this.deadLetterQueue.push(queueItem);
    
    // Limit dead letter queue size
    if (this.deadLetterQueue.length > this.config.deadLetterQueueSize) {
      this.deadLetterQueue.shift();
    }

    logger.error('Item moved to dead letter queue', {
      eventId: queueItem.id,
      attempts: queueItem.attempts,
      errors: queueItem.errors.length
    });

    this.emit('deadLettered', queueItem);
  }

  /**
   * Find insertion index for priority queue
   */
  findInsertIndex(priority) {
    let left = 0;
    let right = this.pendingQueue.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.pendingQueue[mid].priority >= priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Retry items from dead letter queue
   */
  retryDeadLetterItems(maxItems = 10) {
    const itemsToRetry = this.deadLetterQueue.splice(0, maxItems);
    
    for (const item of itemsToRetry) {
      // Reset attempts and errors
      item.attempts = 0;
      item.errors = [];
      delete item.deadLetteredAt;
      
      // Re-enqueue
      const insertIndex = this.findInsertIndex(item.priority);
      this.pendingQueue.splice(insertIndex, 0, item);
    }

    logger.info('Retrying dead letter items', {
      count: itemsToRetry.length
    });

    return itemsToRetry.length;
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    
    logger.info('Dead letter queue cleared', { count });
    
    return count;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `queue-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Get queue status
   */
  getStatus() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      isProcessing: this.isProcessing,
      paused: this.paused,
      activeWorkers: this.activeWorkers,
      queues: {
        pending: this.pendingQueue.length,
        processing: this.processingQueue.size,
        completed: this.completedQueue.length,
        deadLetter: this.deadLetterQueue.length
      },
      stats: {
        ...this.stats,
        uptime: `${Math.floor(uptime / 1000)}s`,
        throughput: this.stats.processed > 0 
          ? `${(this.stats.processed / (uptime / 1000)).toFixed(2)} events/sec`
          : '0 events/sec',
        successRate: this.stats.enqueued > 0
          ? `${((this.stats.processed / this.stats.enqueued) * 100).toFixed(2)}%`
          : '0%'
      },
      config: {
        maxConcurrency: this.config.maxConcurrency,
        retryAttempts: this.config.retryAttempts,
        processingTimeout: this.config.processingTimeout
      }
    };
  }

  /**
   * Get queue metrics
   */
  getMetrics() {
    if (!this.config.enableMetrics) {
      return null;
    }

    const now = Date.now();
    const uptime = now - this.stats.startTime.getTime();

    return {
      timestamp: new Date().toISOString(),
      uptime,
      counters: {
        enqueued: this.stats.enqueued,
        processed: this.stats.processed,
        failed: this.stats.failed,
        retried: this.stats.retried,
        deadLettered: this.stats.deadLettered
      },
      gauges: {
        pendingQueueSize: this.pendingQueue.length,
        processingQueueSize: this.processingQueue.size,
        deadLetterQueueSize: this.deadLetterQueue.length,
        activeWorkers: this.activeWorkers
      },
      rates: {
        throughput: this.stats.processed / (uptime / 1000),
        successRate: this.stats.enqueued > 0 ? this.stats.processed / this.stats.enqueued : 0,
        failureRate: this.stats.enqueued > 0 ? this.stats.failed / this.stats.enqueued : 0
      }
    };
  }
}

export default EventQueue;

