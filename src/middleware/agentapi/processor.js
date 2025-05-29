import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';

/**
 * Message Processor
 * Asynchronous message processing with batch capabilities and status tracking
 */
export class MessageProcessor extends EventEmitter {
  constructor(messageQueue, options = {}) {
    super();
    
    this.messageQueue = messageQueue;
    
    // Configuration
    this.concurrency = options.concurrency || 5;
    this.batchSize = options.batchSize || 1;
    this.batchTimeout = options.batchTimeout || 5000;
    this.processingTimeout = options.processingTimeout || 60000;
    this.retryDelay = options.retryDelay || 1000;
    this.maxRetries = options.maxRetries || 3;
    
    // Processing state
    this.isRunning = false;
    this.workers = [];
    this.activeJobs = new Map();
    this.batchBuffer = [];
    this.batchTimer = null;
    
    // Statistics
    this.stats = {
      processed: 0,
      failed: 0,
      batched: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      startTime: null
    };
    
    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Listen to queue events
    if (this.messageQueue) {
      this.messageQueue.on('enqueued', () => {
        if (this.isRunning) {
          this.processNext();
        }
      });
    }
  }

  /**
   * Start the message processor
   */
  async start() {
    if (this.isRunning) {
      console.warn('[MessageProcessor] Already running');
      return;
    }
    
    this.isRunning = true;
    this.stats.startTime = new Date().toISOString();
    
    console.log(`[MessageProcessor] Starting with concurrency: ${this.concurrency}, batch size: ${this.batchSize}`);
    
    // Start processing workers
    for (let i = 0; i < this.concurrency; i++) {
      this.startWorker(i);
    }
    
    // Start batch processing if enabled
    if (this.batchSize > 1) {
      this.startBatchProcessing();
    }
    
    this.emit('started', {
      concurrency: this.concurrency,
      batchSize: this.batchSize,
      timestamp: this.stats.startTime
    });
    
    console.log('[MessageProcessor] Started successfully');
  }

  /**
   * Stop the message processor
   */
  async stop() {
    if (!this.isRunning) {
      console.warn('[MessageProcessor] Not running');
      return;
    }
    
    this.isRunning = false;
    
    console.log('[MessageProcessor] Stopping...');
    
    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Process remaining batch
    if (this.batchBuffer.length > 0) {
      await this.processBatch();
    }
    
    // Wait for active jobs to complete
    const activeJobPromises = Array.from(this.activeJobs.values());
    if (activeJobPromises.length > 0) {
      console.log(`[MessageProcessor] Waiting for ${activeJobPromises.length} active jobs to complete...`);
      await Promise.allSettled(activeJobPromises);
    }
    
    // Terminate workers
    for (const worker of this.workers) {
      if (worker && !worker.terminated) {
        await worker.terminate();
      }
    }
    this.workers = [];
    
    this.emit('stopped', {
      timestamp: new Date().toISOString(),
      stats: this.getStats()
    });
    
    console.log('[MessageProcessor] Stopped successfully');
  }

  /**
   * Start a processing worker
   */
  startWorker(workerId) {
    const processNext = async () => {
      while (this.isRunning) {
        try {
          await this.processNext();
          
          // Small delay to prevent tight loop
          await this.sleep(10);
        } catch (error) {
          console.error(`[MessageProcessor] Worker ${workerId} error:`, error);
          await this.sleep(1000); // Wait longer on error
        }
      }
    };
    
    // Start worker
    processNext().catch(error => {
      console.error(`[MessageProcessor] Worker ${workerId} crashed:`, error);
    });
    
    this.workers.push({ id: workerId, started: new Date().toISOString() });
  }

  /**
   * Process next message from queue
   */
  async processNext() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Check if we have capacity
      if (this.activeJobs.size >= this.concurrency) {
        return;
      }
      
      // Dequeue next message
      const queueItem = await this.messageQueue.dequeue();
      if (!queueItem) {
        return; // No messages to process
      }
      
      // Process based on batch configuration
      if (this.batchSize > 1) {
        this.addToBatch(queueItem);
      } else {
        await this.processSingle(queueItem);
      }
    } catch (error) {
      console.error('[MessageProcessor] Process next error:', error);
      this.emit('processing_error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Process a single message
   */
  async processSingle(queueItem) {
    const jobId = `job_${queueItem.id}_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Track active job
      const jobPromise = this.executeMessage(queueItem);
      this.activeJobs.set(jobId, jobPromise);
      
      // Execute message processing
      const result = await jobPromise;
      
      // Mark as processed
      await this.messageQueue.markProcessed(queueItem.id, result);
      
      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, true);
      
      // Emit success event
      this.emit('message_processed', {
        itemId: queueItem.id,
        messageId: queueItem.message.id,
        result,
        processingTime,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[MessageProcessor] Processed message ${queueItem.id} in ${processingTime}ms`);
    } catch (error) {
      console.error(`[MessageProcessor] Processing failed for message ${queueItem.id}:`, error);
      
      // Mark as failed
      await this.messageQueue.markFailed(queueItem.id, error);
      
      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, false);
      
      // Emit error event
      this.emit('processing_error', {
        itemId: queueItem.id,
        messageId: queueItem.message.id,
        error: error.message,
        processingTime,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Add message to batch buffer
   */
  addToBatch(queueItem) {
    this.batchBuffer.push(queueItem);
    
    // Process batch if it's full
    if (this.batchBuffer.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.batchTimer) {
      // Set timer for partial batch
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.batchTimeout);
    }
  }

  /**
   * Process batch of messages
   */
  async processBatch() {
    if (this.batchBuffer.length === 0) {
      return;
    }
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Get batch to process
    const batch = [...this.batchBuffer];
    this.batchBuffer = [];
    
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      console.log(`[MessageProcessor] Processing batch ${batchId} with ${batch.length} messages`);
      
      // Track active job
      const jobPromise = this.executeBatch(batch);
      this.activeJobs.set(batchId, jobPromise);
      
      // Execute batch processing
      const results = await jobPromise;
      
      // Mark messages as processed
      for (let i = 0; i < batch.length; i++) {
        const queueItem = batch[i];
        const result = results[i];
        
        if (result.success) {
          await this.messageQueue.markProcessed(queueItem.id, result.data);
        } else {
          await this.messageQueue.markFailed(queueItem.id, new Error(result.error));
        }
      }
      
      // Update statistics
      const processingTime = Date.now() - startTime;
      this.stats.batched++;
      this.updateStats(processingTime, true);
      
      // Emit batch processed event
      this.emit('batch_processed', {
        batchId,
        messageCount: batch.length,
        results,
        processingTime,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[MessageProcessor] Processed batch ${batchId} with ${batch.length} messages in ${processingTime}ms`);
    } catch (error) {
      console.error(`[MessageProcessor] Batch processing failed for batch ${batchId}:`, error);
      
      // Mark all messages as failed
      for (const queueItem of batch) {
        await this.messageQueue.markFailed(queueItem.id, error);
      }
      
      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, false);
      
      // Emit error event
      this.emit('batch_error', {
        batchId,
        messageCount: batch.length,
        error: error.message,
        processingTime,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(batchId);
    }
  }

  /**
   * Execute single message processing
   */
  async executeMessage(queueItem) {
    const message = queueItem.message;
    
    // Simulate message processing
    // In a real implementation, this would call the actual processing logic
    return new Promise((resolve, reject) => {
      // Simulate processing time
      const processingTime = Math.random() * 1000 + 100; // 100-1100ms
      
      setTimeout(() => {
        // Simulate occasional failures
        if (Math.random() < 0.1) { // 10% failure rate
          reject(new Error('Simulated processing failure'));
        } else {
          resolve({
            messageId: message.id,
            processed: true,
            timestamp: new Date().toISOString(),
            processingTime
          });
        }
      }, processingTime);
    });
  }

  /**
   * Execute batch processing
   */
  async executeBatch(batch) {
    // Process all messages in the batch
    const results = [];
    
    for (const queueItem of batch) {
      try {
        const result = await this.executeMessage(queueItem);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Start batch processing timer
   */
  startBatchProcessing() {
    // Process batches periodically even if not full
    const batchInterval = setInterval(() => {
      if (this.isRunning && this.batchBuffer.length > 0) {
        this.processBatch();
      }
    }, this.batchTimeout);
    
    // Clean up interval when stopped
    this.once('stopped', () => {
      clearInterval(batchInterval);
    });
  }

  /**
   * Update processing statistics
   */
  updateStats(processingTime, success) {
    if (success) {
      this.stats.processed++;
    } else {
      this.stats.failed++;
    }
    
    this.stats.totalProcessingTime += processingTime;
    this.stats.avgProcessingTime = this.stats.totalProcessingTime / (this.stats.processed + this.stats.failed);
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      batchBufferSize: this.batchBuffer.length,
      workers: this.workers.length,
      uptime: this.stats.startTime ? Date.now() - new Date(this.stats.startTime).getTime() : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get active jobs
   */
  getActiveJobs() {
    return Array.from(this.activeJobs.keys()).map(jobId => ({
      jobId,
      startTime: new Date().toISOString() // This would be tracked in a real implementation
    }));
  }

  /**
   * Pause processing
   */
  pause() {
    if (!this.isRunning) {
      console.warn('[MessageProcessor] Not running');
      return;
    }
    
    this.isRunning = false;
    
    this.emit('paused', {
      timestamp: new Date().toISOString()
    });
    
    console.log('[MessageProcessor] Paused');
  }

  /**
   * Resume processing
   */
  resume() {
    if (this.isRunning) {
      console.warn('[MessageProcessor] Already running');
      return;
    }
    
    this.isRunning = true;
    
    // Restart workers
    for (let i = 0; i < this.concurrency; i++) {
      this.startWorker(i);
    }
    
    this.emit('resumed', {
      timestamp: new Date().toISOString()
    });
    
    console.log('[MessageProcessor] Resumed');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    if (newConfig.concurrency && newConfig.concurrency !== this.concurrency) {
      this.concurrency = newConfig.concurrency;
      
      // Restart if running to apply new concurrency
      if (this.isRunning) {
        console.log(`[MessageProcessor] Updating concurrency to ${this.concurrency}`);
        // In a real implementation, you'd gracefully adjust the worker count
      }
    }
    
    if (newConfig.batchSize) this.batchSize = newConfig.batchSize;
    if (newConfig.batchTimeout) this.batchTimeout = newConfig.batchTimeout;
    if (newConfig.processingTimeout) this.processingTimeout = newConfig.processingTimeout;
    
    this.emit('config_updated', {
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stop().then(() => {
      this.removeAllListeners();
      this.activeJobs.clear();
      this.batchBuffer = [];
    });
  }
}

export default MessageProcessor;

