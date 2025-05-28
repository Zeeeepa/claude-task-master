/**
 * @fileoverview Event Queue Manager
 * @description Manages queuing and processing of webhook events
 */

import { log } from '../utils/simple_logger.js';

/**
 * Event queue manager for processing webhook events
 * Handles prioritization, retry logic, and concurrent processing
 */
export class EventQueue {
    constructor(database, config = {}) {
        this.database = database;
        this.config = {
            // Maximum concurrent event processing
            max_concurrent_events: config.max_concurrent_events || 5,
            // Processing interval in milliseconds
            processing_interval: config.processing_interval || 5000, // 5 seconds
            // Maximum retry attempts
            max_retry_attempts: config.max_retry_attempts || 3,
            // Retry delay multiplier (exponential backoff)
            retry_delay_multiplier: config.retry_delay_multiplier || 2,
            // Base retry delay in milliseconds
            base_retry_delay: config.base_retry_delay || 5000, // 5 seconds
            // Event priority levels
            priority_levels: config.priority_levels || {
                'critical': 10,
                'high': 8,
                'normal': 5,
                'low': 3,
                'background': 1
            },
            // Enable automatic queue processing
            enable_auto_processing: config.enable_auto_processing !== false,
            // Queue size limits
            max_queue_size: config.max_queue_size || 10000,
            // Event timeout in milliseconds
            event_timeout: config.event_timeout || 300000, // 5 minutes
            ...config
        };

        // In-memory queue for fast access
        this.memoryQueue = [];
        this.processingEvents = new Map();
        this.processingInterval = null;
        this.isProcessing = false;
        this.isInitialized = false;

        // Processing metrics
        this.metrics = {
            total_queued: 0,
            total_processed: 0,
            total_failed: 0,
            total_retried: 0,
            current_queue_size: 0,
            processing_events: 0,
            last_processed_at: null
        };
    }

    /**
     * Initialize the event queue
     */
    async initialize() {
        log('debug', 'Initializing event queue...');
        
        // Load pending events from database
        await this.loadPendingEvents();
        
        // Start automatic processing if enabled
        if (this.config.enable_auto_processing) {
            this.startProcessing();
        }
        
        this.isInitialized = true;
        log('debug', 'Event queue initialized');
    }

    /**
     * Add event to queue
     * @param {Object} eventData - Event data
     * @param {Object} options - Queue options
     * @returns {Promise<string>} Queue entry ID
     */
    async enqueue(eventData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Event queue not initialized');
        }

        const priority = options.priority || this.determinePriority(eventData);
        const scheduledAt = options.scheduled_at || new Date();
        const maxRetries = options.max_retries || this.config.max_retry_attempts;

        const queueEntry = {
            id: this.generateQueueId(),
            event_id: eventData.id,
            event_type: eventData.type,
            priority: priority,
            status: 'pending',
            scheduled_at: scheduledAt,
            retry_count: 0,
            max_retries: maxRetries,
            processing_data: {
                event_data: eventData,
                options: options
            },
            created_at: new Date()
        };

        // Check queue size limit
        if (this.memoryQueue.length >= this.config.max_queue_size) {
            throw new Error('Queue size limit exceeded');
        }

        // Store in database
        await this.storeQueueEntry(queueEntry);

        // Add to memory queue
        this.memoryQueue.push(queueEntry);
        this.sortQueue();

        this.metrics.total_queued++;
        this.metrics.current_queue_size = this.memoryQueue.length;

        log('debug', `Queued event ${eventData.id} with priority ${priority}`);
        return queueEntry.id;
    }

    /**
     * Process next event in queue
     * @returns {Promise<Object|null>} Processing result or null if no events
     */
    async processNext() {
        if (!this.isInitialized || this.memoryQueue.length === 0) {
            return null;
        }

        // Check if we've reached concurrent processing limit
        if (this.processingEvents.size >= this.config.max_concurrent_events) {
            return null;
        }

        // Get next event to process
        const now = new Date();
        const nextEvent = this.memoryQueue.find(event => 
            event.status === 'pending' && 
            event.scheduled_at <= now
        );

        if (!nextEvent) {
            return null;
        }

        // Mark as processing
        nextEvent.status = 'processing';
        nextEvent.started_at = now;
        this.processingEvents.set(nextEvent.id, nextEvent);

        // Update database
        await this.updateQueueEntry(nextEvent);

        this.metrics.processing_events = this.processingEvents.size;

        try {
            log('info', `Processing event ${nextEvent.event_id} (queue ID: ${nextEvent.id})`);

            // Process the event (this would call the actual event processor)
            const result = await this.processEvent(nextEvent);

            // Mark as completed
            await this.completeEvent(nextEvent, result);

            return result;

        } catch (error) {
            log('error', `Event processing failed: ${error.message}`);
            await this.handleEventFailure(nextEvent, error);
            throw error;
        }
    }

    /**
     * Process an event
     * @param {Object} queueEntry - Queue entry
     * @returns {Promise<Object>} Processing result
     */
    async processEvent(queueEntry) {
        // This is a placeholder - in real implementation, this would call
        // the actual event processor with the event data
        const eventData = queueEntry.processing_data.event_data;
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            status: 'processed',
            event_id: eventData.id,
            queue_id: queueEntry.id,
            processing_time_ms: Date.now() - queueEntry.started_at.getTime()
        };
    }

    /**
     * Complete event processing
     * @param {Object} queueEntry - Queue entry
     * @param {Object} result - Processing result
     */
    async completeEvent(queueEntry, result) {
        queueEntry.status = 'completed';
        queueEntry.completed_at = new Date();
        queueEntry.result = result;

        // Update database
        await this.updateQueueEntry(queueEntry);

        // Remove from processing and memory queue
        this.processingEvents.delete(queueEntry.id);
        this.removeFromMemoryQueue(queueEntry.id);

        this.metrics.total_processed++;
        this.metrics.processing_events = this.processingEvents.size;
        this.metrics.current_queue_size = this.memoryQueue.length;
        this.metrics.last_processed_at = new Date();

        log('info', `Completed processing event ${queueEntry.event_id}`);
    }

    /**
     * Handle event processing failure
     * @param {Object} queueEntry - Queue entry
     * @param {Error} error - Processing error
     */
    async handleEventFailure(queueEntry, error) {
        queueEntry.retry_count++;
        queueEntry.error_message = error.message;

        // Check if we should retry
        if (queueEntry.retry_count <= queueEntry.max_retries) {
            // Schedule retry with exponential backoff
            const delay = this.config.base_retry_delay * 
                         Math.pow(this.config.retry_delay_multiplier, queueEntry.retry_count - 1);
            
            queueEntry.status = 'pending';
            queueEntry.scheduled_at = new Date(Date.now() + delay);
            
            this.metrics.total_retried++;
            
            log('info', `Scheduled retry for event ${queueEntry.event_id} in ${delay}ms (attempt ${queueEntry.retry_count})`);
        } else {
            // Max retries exceeded
            queueEntry.status = 'failed';
            queueEntry.completed_at = new Date();
            
            this.removeFromMemoryQueue(queueEntry.id);
            this.metrics.total_failed++;
            
            log('error', `Event ${queueEntry.event_id} failed after ${queueEntry.retry_count} attempts`);
        }

        // Update database
        await this.updateQueueEntry(queueEntry);

        // Remove from processing
        this.processingEvents.delete(queueEntry.id);
        this.metrics.processing_events = this.processingEvents.size;
        this.metrics.current_queue_size = this.memoryQueue.length;
    }

    /**
     * Start automatic queue processing
     */
    startProcessing() {
        if (this.processingInterval) {
            return;
        }

        log('debug', 'Starting automatic queue processing');
        
        this.processingInterval = setInterval(async () => {
            if (this.isProcessing) {
                return;
            }

            this.isProcessing = true;
            
            try {
                // Process multiple events concurrently
                const promises = [];
                for (let i = 0; i < this.config.max_concurrent_events; i++) {
                    promises.push(this.processNext());
                }
                
                await Promise.allSettled(promises);
            } catch (error) {
                log('error', `Queue processing error: ${error.message}`);
            } finally {
                this.isProcessing = false;
            }
        }, this.config.processing_interval);
    }

    /**
     * Stop automatic queue processing
     */
    stopProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
            log('debug', 'Stopped automatic queue processing');
        }
    }

    /**
     * Determine event priority
     * @param {Object} eventData - Event data
     * @returns {number} Priority level
     */
    determinePriority(eventData) {
        const { type, payload } = eventData;

        // High priority for security-related events
        if (type === 'push' && payload.ref === 'refs/heads/main') {
            return this.config.priority_levels.high;
        }

        // High priority for PR events on important branches
        if (type === 'pull_request') {
            const baseBranch = payload.pull_request?.base?.ref;
            if (['main', 'master', 'develop'].includes(baseBranch)) {
                return this.config.priority_levels.high;
            }
            return this.config.priority_levels.normal;
        }

        // Normal priority for most events
        return this.config.priority_levels.normal;
    }

    /**
     * Sort queue by priority and scheduled time
     */
    sortQueue() {
        this.memoryQueue.sort((a, b) => {
            // First sort by priority (higher priority first)
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            
            // Then sort by scheduled time (earlier first)
            return a.scheduled_at.getTime() - b.scheduled_at.getTime();
        });
    }

    /**
     * Generate unique queue ID
     * @returns {string} Queue ID
     */
    generateQueueId() {
        return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load pending events from database
     */
    async loadPendingEvents() {
        if (!this.database) {
            return;
        }

        try {
            const query = `
                SELECT * FROM event_processing_queue 
                WHERE status IN ('pending', 'processing')
                ORDER BY priority DESC, scheduled_at ASC
            `;
            
            const result = await this.database.query(query);
            
            if (result.rows) {
                this.memoryQueue = result.rows.map(row => ({
                    id: row.id,
                    event_id: row.event_id,
                    event_type: row.event_type,
                    priority: row.priority,
                    status: row.status === 'processing' ? 'pending' : row.status, // Reset processing status
                    scheduled_at: row.scheduled_at,
                    retry_count: row.retry_count,
                    max_retries: row.max_retries,
                    error_message: row.error_message,
                    processing_data: row.processing_data,
                    created_at: row.created_at,
                    started_at: row.started_at,
                    completed_at: row.completed_at
                }));
                
                this.metrics.current_queue_size = this.memoryQueue.length;
                log('debug', `Loaded ${this.memoryQueue.length} pending events from database`);
            }
        } catch (error) {
            log('error', `Failed to load pending events: ${error.message}`);
        }
    }

    /**
     * Store queue entry in database
     * @param {Object} queueEntry - Queue entry
     */
    async storeQueueEntry(queueEntry) {
        if (!this.database) {
            return;
        }

        try {
            const query = `
                INSERT INTO event_processing_queue 
                (id, event_id, event_type, priority, status, scheduled_at, retry_count, max_retries, processing_data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `;
            
            await this.database.query(query, [
                queueEntry.id,
                queueEntry.event_id,
                queueEntry.event_type,
                queueEntry.priority,
                queueEntry.status,
                queueEntry.scheduled_at,
                queueEntry.retry_count,
                queueEntry.max_retries,
                JSON.stringify(queueEntry.processing_data)
            ]);
        } catch (error) {
            log('error', `Failed to store queue entry: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update queue entry in database
     * @param {Object} queueEntry - Queue entry
     */
    async updateQueueEntry(queueEntry) {
        if (!this.database) {
            return;
        }

        try {
            const query = `
                UPDATE event_processing_queue 
                SET status = $2, scheduled_at = $3, retry_count = $4, error_message = $5,
                    started_at = $6, completed_at = $7, processing_data = $8
                WHERE id = $1
            `;
            
            await this.database.query(query, [
                queueEntry.id,
                queueEntry.status,
                queueEntry.scheduled_at,
                queueEntry.retry_count,
                queueEntry.error_message,
                queueEntry.started_at,
                queueEntry.completed_at,
                JSON.stringify(queueEntry.processing_data)
            ]);
        } catch (error) {
            log('error', `Failed to update queue entry: ${error.message}`);
        }
    }

    /**
     * Remove entry from memory queue
     * @param {string} queueId - Queue entry ID
     */
    removeFromMemoryQueue(queueId) {
        const index = this.memoryQueue.findIndex(entry => entry.id === queueId);
        if (index !== -1) {
            this.memoryQueue.splice(index, 1);
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue statistics
     */
    getStatistics() {
        const pendingEvents = this.memoryQueue.filter(e => e.status === 'pending').length;
        const processingEvents = this.processingEvents.size;
        
        return {
            ...this.metrics,
            pending_events: pendingEvents,
            processing_events: processingEvents,
            queue_health: {
                is_processing: this.isProcessing,
                auto_processing_enabled: !!this.processingInterval,
                queue_utilization: (this.metrics.current_queue_size / this.config.max_queue_size) * 100
            }
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        const isHealthy = this.isInitialized && 
                         stats.queue_utilization < 90 && 
                         stats.processing_events < this.config.max_concurrent_events;

        return {
            status: isHealthy ? 'healthy' : 'degraded',
            queue_size: stats.current_queue_size,
            processing_events: stats.processing_events,
            auto_processing: !!this.processingInterval,
            database_connected: !!this.database
        };
    }

    /**
     * Shutdown the event queue
     */
    async shutdown() {
        log('debug', 'Shutting down event queue...');
        
        this.stopProcessing();
        
        // Wait for processing events to complete
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.processingEvents.size > 0 && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.memoryQueue.length = 0;
        this.processingEvents.clear();
        this.isInitialized = false;
        
        log('debug', 'Event queue shut down');
    }
}

export default EventQueue;

