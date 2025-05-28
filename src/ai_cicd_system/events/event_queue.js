/**
 * @fileoverview Event Queue
 * @description Reliable event queuing system with Redis/PostgreSQL backend
 */

import { EventEmitter } from 'events';

/**
 * Event Queue class
 */
export class EventQueue extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            backend: config.backend || 'memory', // 'memory', 'redis', 'postgresql'
            maxQueueSize: config.maxQueueSize || 10000,
            processingConcurrency: config.processingConcurrency || 5,
            processingTimeout: config.processingTimeout || 30000,
            retryDelay: config.retryDelay || 5000,
            maxRetries: config.maxRetries || 3,
            enablePersistence: config.enablePersistence !== false,
            ...config
        };

        this.queue = [];
        this.processing = new Map();
        this.isProcessing = false;
        this.processingInterval = null;
        
        this.statistics = {
            eventsQueued: 0,
            eventsProcessed: 0,
            eventsCompleted: 0,
            eventsFailed: 0,
            averageProcessingTime: 0,
            queueSize: 0
        };

        this.processors = new Map();
    }

    /**
     * Initialize the event queue
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (this.config.backend === 'redis') {
                await this.initializeRedis();
            } else if (this.config.backend === 'postgresql') {
                await this.initializePostgreSQL();
            }

            console.log(`Event queue initialized with ${this.config.backend} backend`);
        } catch (error) {
            console.error('Failed to initialize event queue:', error);
            throw error;
        }
    }

    /**
     * Initialize Redis backend
     * @returns {Promise<void>}
     */
    async initializeRedis() {
        // Mock Redis initialization
        console.log('Redis backend initialized (mock)');
    }

    /**
     * Initialize PostgreSQL backend
     * @returns {Promise<void>}
     */
    async initializePostgreSQL() {
        // Mock PostgreSQL initialization
        console.log('PostgreSQL backend initialized (mock)');
    }

    /**
     * Add event to queue
     * @param {Object} event - Event to queue
     * @param {Object} options - Queue options
     * @returns {Promise<string>} Queue entry ID
     */
    async enqueue(event, options = {}) {
        try {
            // Check queue size limit
            if (this.queue.length >= this.config.maxQueueSize) {
                throw new Error('Queue size limit exceeded');
            }

            const queueEntry = {
                id: this.generateQueueId(),
                event,
                options: {
                    priority: options.priority || 0,
                    delay: options.delay || 0,
                    maxRetries: options.maxRetries || this.config.maxRetries,
                    timeout: options.timeout || this.config.processingTimeout,
                    ...options
                },
                status: 'queued',
                queuedAt: new Date().toISOString(),
                retryCount: 0,
                lastError: null,
                processingStartedAt: null,
                completedAt: null
            };

            // Add delay if specified
            if (queueEntry.options.delay > 0) {
                queueEntry.executeAt = new Date(Date.now() + queueEntry.options.delay).toISOString();
            }

            // Insert into queue based on priority
            this.insertByPriority(queueEntry);
            
            this.statistics.eventsQueued++;
            this.statistics.queueSize = this.queue.length;

            this.emit('event:queued', queueEntry);

            // Persist if enabled
            if (this.config.enablePersistence) {
                await this.persistQueueEntry(queueEntry);
            }

            return queueEntry.id;

        } catch (error) {
            console.error('Failed to enqueue event:', error);
            throw error;
        }
    }

    /**
     * Insert queue entry by priority
     * @param {Object} queueEntry - Queue entry to insert
     */
    insertByPriority(queueEntry) {
        const priority = queueEntry.options.priority;
        
        // Find insertion point based on priority (higher priority first)
        let insertIndex = this.queue.length;
        for (let i = 0; i < this.queue.length; i++) {
            if (this.queue[i].options.priority < priority) {
                insertIndex = i;
                break;
            }
        }

        this.queue.splice(insertIndex, 0, queueEntry);
    }

    /**
     * Start processing events
     */
    startProcessing() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.processingInterval = setInterval(() => {
            this.processNextEvents();
        }, 1000); // Check every second

        console.log('Event queue processing started');
    }

    /**
     * Stop processing events
     */
    stopProcessing() {
        this.isProcessing = false;
        
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        console.log('Event queue processing stopped');
    }

    /**
     * Process next events in queue
     */
    async processNextEvents() {
        if (!this.isProcessing || this.processing.size >= this.config.processingConcurrency) {
            return;
        }

        const now = new Date();
        const availableSlots = this.config.processingConcurrency - this.processing.size;
        const eventsToProcess = [];

        // Find events ready for processing
        for (let i = 0; i < this.queue.length && eventsToProcess.length < availableSlots; i++) {
            const queueEntry = this.queue[i];
            
            // Check if event is ready to execute
            if (queueEntry.status === 'queued') {
                if (!queueEntry.executeAt || new Date(queueEntry.executeAt) <= now) {
                    eventsToProcess.push(queueEntry);
                    this.queue.splice(i, 1);
                    i--; // Adjust index after removal
                }
            }
        }

        // Process events
        for (const queueEntry of eventsToProcess) {
            this.processEvent(queueEntry);
        }

        this.statistics.queueSize = this.queue.length;
    }

    /**
     * Process a single event
     * @param {Object} queueEntry - Queue entry to process
     */
    async processEvent(queueEntry) {
        const startTime = Date.now();
        
        try {
            queueEntry.status = 'processing';
            queueEntry.processingStartedAt = new Date().toISOString();
            
            this.processing.set(queueEntry.id, queueEntry);
            this.statistics.eventsProcessed++;

            this.emit('event:processing:started', queueEntry);

            // Get processor for event type
            const processor = this.getProcessor(queueEntry.event.type);
            if (!processor) {
                throw new Error(`No processor found for event type: ${queueEntry.event.type}`);
            }

            // Set processing timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Processing timeout')), queueEntry.options.timeout);
            });

            // Process event with timeout
            const result = await Promise.race([
                processor(queueEntry.event, queueEntry.options),
                timeoutPromise
            ]);

            // Mark as completed
            queueEntry.status = 'completed';
            queueEntry.completedAt = new Date().toISOString();
            queueEntry.result = result;

            this.statistics.eventsCompleted++;
            this.updateAverageProcessingTime(Date.now() - startTime);

            this.emit('event:processing:completed', queueEntry, result);

        } catch (error) {
            console.error(`Event processing failed for ${queueEntry.id}:`, error);
            
            queueEntry.lastError = error.message;
            queueEntry.retryCount++;

            // Check if should retry
            if (queueEntry.retryCount < queueEntry.options.maxRetries) {
                queueEntry.status = 'queued';
                queueEntry.executeAt = new Date(Date.now() + this.config.retryDelay).toISOString();
                
                // Re-queue for retry
                this.queue.push(queueEntry);
                
                this.emit('event:processing:retry', queueEntry, error);
            } else {
                queueEntry.status = 'failed';
                queueEntry.completedAt = new Date().toISOString();
                
                this.statistics.eventsFailed++;
                
                this.emit('event:processing:failed', queueEntry, error);
            }

        } finally {
            this.processing.delete(queueEntry.id);
            
            // Persist final state if enabled
            if (this.config.enablePersistence) {
                await this.persistQueueEntry(queueEntry);
            }
        }
    }

    /**
     * Register event processor
     * @param {string} eventType - Event type
     * @param {Function} processor - Processor function
     */
    registerProcessor(eventType, processor) {
        this.processors.set(eventType, processor);
    }

    /**
     * Get processor for event type
     * @param {string} eventType - Event type
     * @returns {Function|null} Processor function
     */
    getProcessor(eventType) {
        return this.processors.get(eventType) || this.processors.get('*'); // Default processor
    }

    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueSize: this.queue.length,
            processingCount: this.processing.size,
            statistics: this.statistics,
            nextEvents: this.queue.slice(0, 5).map(entry => ({
                id: entry.id,
                type: entry.event.type,
                priority: entry.options.priority,
                queuedAt: entry.queuedAt,
                executeAt: entry.executeAt
            }))
        };
    }

    /**
     * Get event by ID
     * @param {string} eventId - Event ID
     * @returns {Object|null} Queue entry
     */
    getEvent(eventId) {
        // Check processing events
        const processingEvent = this.processing.get(eventId);
        if (processingEvent) {
            return processingEvent;
        }

        // Check queued events
        return this.queue.find(entry => entry.id === eventId) || null;
    }

    /**
     * Remove event from queue
     * @param {string} eventId - Event ID
     * @returns {boolean} True if removed
     */
    removeEvent(eventId) {
        const index = this.queue.findIndex(entry => entry.id === eventId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            this.statistics.queueSize = this.queue.length;
            return true;
        }
        return false;
    }

    /**
     * Clear all events from queue
     */
    clear() {
        this.queue.length = 0;
        this.statistics.queueSize = 0;
        this.emit('queue:cleared');
    }

    /**
     * Persist queue entry
     * @param {Object} queueEntry - Queue entry to persist
     */
    async persistQueueEntry(queueEntry) {
        // Mock persistence - replace with actual implementation
        console.log(`Persisting queue entry ${queueEntry.id}`);
    }

    /**
     * Generate unique queue ID
     * @returns {string} Queue ID
     */
    generateQueueId() {
        return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update average processing time
     * @param {number} processingTime - Processing time in ms
     */
    updateAverageProcessingTime(processingTime) {
        const totalCompleted = this.statistics.eventsCompleted;
        if (totalCompleted > 0) {
            this.statistics.averageProcessingTime = 
                (this.statistics.averageProcessingTime * (totalCompleted - 1) + processingTime) / totalCompleted;
        }
    }

    /**
     * Get queue metrics
     * @returns {Promise<Object>} Queue metrics
     */
    async getMetrics() {
        return {
            ...this.statistics,
            queueSize: this.queue.length,
            processingCount: this.processing.size,
            isProcessing: this.isProcessing,
            successRate: this.statistics.eventsProcessed > 0 
                ? (this.statistics.eventsCompleted / this.statistics.eventsProcessed) * 100
                : 0,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check queue size
            if (this.queue.length > this.config.maxQueueSize * 0.8) {
                return 'degraded';
            }

            // Check processing status
            if (!this.isProcessing) {
                return 'unhealthy';
            }

            // Check error rate
            const errorRate = this.statistics.eventsProcessed > 0 
                ? (this.statistics.eventsFailed / this.statistics.eventsProcessed) * 100
                : 0;

            if (errorRate > 10) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Shutdown the event queue
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('Shutting down event queue...');
        
        this.stopProcessing();
        
        // Wait for current processing to complete
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.processing.size > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.processing.size > 0) {
            console.warn(`Event queue shutdown with ${this.processing.size} events still processing`);
        }

        console.log('Event queue shut down successfully');
    }
}

export default EventQueue;

