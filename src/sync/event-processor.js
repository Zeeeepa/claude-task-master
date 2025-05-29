/**
 * @fileoverview Event Processing and Queuing System
 * @description Handles event queue management, priority-based processing, and batch operations
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

/**
 * Event Processor for handling status synchronization events
 */
export class EventProcessor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Queue settings
            maxQueueSize: 10000,
            batchSize: 50,
            processingInterval: 1000, // 1 second
            
            // Priority settings
            priorityLevels: {
                critical: 0,
                high: 1,
                normal: 2,
                low: 3
            },
            
            // Retry settings
            maxRetries: 3,
            retryDelay: 1000,
            retryBackoffMultiplier: 2,
            
            // Deduplication settings
            enableDeduplication: true,
            deduplicationWindow: 5000, // 5 seconds
            
            // Performance settings
            enableBatching: true,
            enableOrdering: true,
            enableMetrics: true,
            
            ...config
        };

        // Event queues by priority
        this.eventQueues = new Map();
        this.initializeQueues();
        
        // Processing state
        this.isProcessing = false;
        this.processingInterval = null;
        
        // Deduplication tracking
        this.recentEvents = new Map();
        this.deduplicationCleanupInterval = null;
        
        // Retry tracking
        this.retryQueue = new Map();
        
        // Metrics
        this.metrics = {
            totalEvents: 0,
            processedEvents: 0,
            failedEvents: 0,
            retriedEvents: 0,
            deduplicatedEvents: 0,
            averageProcessingTime: 0,
            queueSizes: {},
            lastProcessedAt: null
        };
        
        // Performance tracking
        this.performanceTracker = new Map();
    }

    /**
     * Initialize the event processor
     */
    async initialize() {
        try {
            console.log('🔄 Initializing Event Processor...');

            // Initialize priority queues
            this.initializeQueues();

            // Start deduplication cleanup if enabled
            if (this.config.enableDeduplication) {
                this._startDeduplicationCleanup();
            }

            // Initialize metrics
            if (this.config.enableMetrics) {
                this._initializeMetrics();
            }

            this.emit('initialized');
            console.log('✅ Event Processor initialized successfully');

        } catch (error) {
            console.error('❌ Event Processor initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start event processing
     */
    async start() {
        if (this.isProcessing) {
            return;
        }

        try {
            console.log('🚀 Starting Event Processor...');

            this.isProcessing = true;
            this._startProcessing();

            this.emit('started');
            console.log('✅ Event Processor started successfully');

        } catch (error) {
            console.error('❌ Failed to start Event Processor:', error);
            throw error;
        }
    }

    /**
     * Stop event processing
     */
    async stop() {
        if (!this.isProcessing) {
            return;
        }

        try {
            console.log('🛑 Stopping Event Processor...');

            this.isProcessing = false;
            
            // Stop processing interval
            if (this.processingInterval) {
                clearInterval(this.processingInterval);
                this.processingInterval = null;
            }

            // Stop deduplication cleanup
            if (this.deduplicationCleanupInterval) {
                clearInterval(this.deduplicationCleanupInterval);
                this.deduplicationCleanupInterval = null;
            }

            // Process remaining events
            await this._processRemainingEvents();

            this.emit('stopped');
            console.log('✅ Event Processor stopped successfully');

        } catch (error) {
            console.error('❌ Error stopping Event Processor:', error);
            throw error;
        }
    }

    /**
     * Add event to processing queue
     * @param {Object} event - Event to process
     * @param {string} priority - Event priority (critical, high, normal, low)
     * @returns {string} Event ID
     */
    addEvent(event, priority = 'normal') {
        try {
            // Validate event
            this._validateEvent(event);

            // Generate event ID
            const eventId = this._generateEventId();
            
            // Create event wrapper
            const eventWrapper = {
                id: eventId,
                data: event,
                priority,
                timestamp: Date.now(),
                retryCount: 0,
                source: event.source || 'unknown',
                type: event.type || 'status_update'
            };

            // Check for deduplication
            if (this.config.enableDeduplication && this._isDuplicate(eventWrapper)) {
                this.metrics.deduplicatedEvents++;
                console.log(`🔄 Duplicate event detected and skipped: ${eventId}`);
                return null;
            }

            // Check queue capacity
            const priorityLevel = this.config.priorityLevels[priority] || this.config.priorityLevels.normal;
            const queue = this.eventQueues.get(priorityLevel);
            
            if (queue.length >= this.config.maxQueueSize) {
                throw new Error(`Event queue is full (${this.config.maxQueueSize} events)`);
            }

            // Add to appropriate priority queue
            queue.push(eventWrapper);
            
            // Update metrics
            this.metrics.totalEvents++;
            this._updateQueueSizeMetrics();

            // Add to deduplication tracking
            if (this.config.enableDeduplication) {
                this._addToDeduplicationTracking(eventWrapper);
            }

            console.log(`📥 Event added to queue [${eventId}] with priority: ${priority}`);
            this.emit('event:added', eventWrapper);

            return eventId;

        } catch (error) {
            console.error('❌ Failed to add event to queue:', error);
            throw error;
        }
    }

    /**
     * Get processing status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueSizes: this._getQueueSizes(),
            metrics: this.metrics,
            retryQueueSize: this.retryQueue.size,
            recentEventsCount: this.recentEvents.size,
            lastProcessedAt: this.metrics.lastProcessedAt
        };
    }

    /**
     * Initialize priority queues
     * @private
     */
    initializeQueues() {
        // Clear existing queues
        this.eventQueues.clear();
        
        // Create priority queues
        Object.values(this.config.priorityLevels).forEach(level => {
            this.eventQueues.set(level, []);
        });
    }

    /**
     * Start event processing loop
     * @private
     */
    _startProcessing() {
        this.processingInterval = setInterval(async () => {
            if (this.isProcessing) {
                await this._processEvents();
            }
        }, this.config.processingInterval);
    }

    /**
     * Process events from queues
     * @private
     */
    async _processEvents() {
        try {
            const startTime = performance.now();
            
            // Get events to process
            const eventsToProcess = this._getEventsToProcess();
            
            if (eventsToProcess.length === 0) {
                return;
            }

            console.log(`🔄 Processing ${eventsToProcess.length} events`);

            // Process events
            if (this.config.enableBatching && eventsToProcess.length > 1) {
                await this._processBatch(eventsToProcess);
            } else {
                for (const event of eventsToProcess) {
                    await this._processEvent(event);
                }
            }

            // Update metrics
            const processingTime = performance.now() - startTime;
            this._updateProcessingMetrics(eventsToProcess.length, processingTime);

        } catch (error) {
            console.error('❌ Error processing events:', error);
            this.emit('processing:error', error);
        }
    }

    /**
     * Get events to process based on priority
     * @private
     */
    _getEventsToProcess() {
        const eventsToProcess = [];
        let remainingBatchSize = this.config.batchSize;

        // Process queues by priority (lower number = higher priority)
        const sortedPriorities = Array.from(this.eventQueues.keys()).sort((a, b) => a - b);

        for (const priority of sortedPriorities) {
            if (remainingBatchSize <= 0) break;

            const queue = this.eventQueues.get(priority);
            const eventsFromQueue = queue.splice(0, remainingBatchSize);
            
            eventsToProcess.push(...eventsFromQueue);
            remainingBatchSize -= eventsFromQueue.length;
        }

        // Sort by timestamp if ordering is enabled
        if (this.config.enableOrdering) {
            eventsToProcess.sort((a, b) => a.timestamp - b.timestamp);
        }

        return eventsToProcess;
    }

    /**
     * Process a single event
     * @private
     */
    async _processEvent(event) {
        const startTime = performance.now();
        
        try {
            console.log(`🔄 Processing event [${event.id}] of type: ${event.type}`);

            // Emit event for processing
            this.emit('status:update', event);

            // Update metrics
            this.metrics.processedEvents++;
            this.metrics.lastProcessedAt = new Date().toISOString();

            // Track performance
            const processingTime = performance.now() - startTime;
            this._trackEventPerformance(event.type, processingTime);

            console.log(`✅ Event processed successfully [${event.id}] in ${processingTime.toFixed(2)}ms`);

        } catch (error) {
            console.error(`❌ Failed to process event [${event.id}]:`, error);
            
            // Handle retry
            await this._handleEventRetry(event, error);
            
            this.metrics.failedEvents++;
            this.emit('event:failed', { event, error });
        }
    }

    /**
     * Process events in batch
     * @private
     */
    async _processBatch(events) {
        const startTime = performance.now();
        
        try {
            console.log(`🔄 Processing batch of ${events.length} events`);

            // Group events by type for efficient processing
            const eventsByType = this._groupEventsByType(events);

            // Process each type group
            for (const [type, typeEvents] of Object.entries(eventsByType)) {
                try {
                    await this._processBatchByType(type, typeEvents);
                } catch (error) {
                    console.error(`❌ Failed to process batch for type ${type}:`, error);
                    
                    // Handle individual retries for failed batch
                    for (const event of typeEvents) {
                        await this._handleEventRetry(event, error);
                    }
                }
            }

            const processingTime = performance.now() - startTime;
            console.log(`✅ Batch processed successfully in ${processingTime.toFixed(2)}ms`);

        } catch (error) {
            console.error('❌ Batch processing failed:', error);
            throw error;
        }
    }

    /**
     * Process batch by event type
     * @private
     */
    async _processBatchByType(type, events) {
        console.log(`🔄 Processing ${events.length} events of type: ${type}`);

        // Emit batch event
        this.emit('batch:process', { type, events });

        // Update metrics
        this.metrics.processedEvents += events.length;
        this.metrics.lastProcessedAt = new Date().toISOString();
    }

    /**
     * Handle event retry
     * @private
     */
    async _handleEventRetry(event, error) {
        if (event.retryCount >= this.config.maxRetries) {
            console.error(`❌ Event [${event.id}] exceeded max retries (${this.config.maxRetries})`);
            this.emit('event:max_retries_exceeded', { event, error });
            return;
        }

        // Calculate retry delay with backoff
        const retryDelay = this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, event.retryCount);
        
        // Schedule retry
        setTimeout(() => {
            event.retryCount++;
            this.metrics.retriedEvents++;
            
            // Add back to appropriate queue
            const priorityLevel = this.config.priorityLevels[event.priority] || this.config.priorityLevels.normal;
            const queue = this.eventQueues.get(priorityLevel);
            queue.unshift(event); // Add to front for priority
            
            console.log(`🔄 Retrying event [${event.id}] (attempt ${event.retryCount}/${this.config.maxRetries})`);
            
        }, retryDelay);
    }

    /**
     * Check if event is duplicate
     * @private
     */
    _isDuplicate(event) {
        const deduplicationKey = this._generateDeduplicationKey(event);
        return this.recentEvents.has(deduplicationKey);
    }

    /**
     * Add event to deduplication tracking
     * @private
     */
    _addToDeduplicationTracking(event) {
        const deduplicationKey = this._generateDeduplicationKey(event);
        this.recentEvents.set(deduplicationKey, {
            timestamp: Date.now(),
            eventId: event.id
        });
    }

    /**
     * Generate deduplication key
     * @private
     */
    _generateDeduplicationKey(event) {
        const { data } = event;
        return `${data.entityType}:${data.entityId}:${data.status}:${data.source}`;
    }

    /**
     * Start deduplication cleanup
     * @private
     */
    _startDeduplicationCleanup() {
        this.deduplicationCleanupInterval = setInterval(() => {
            this._cleanupDeduplicationTracking();
        }, this.config.deduplicationWindow);
    }

    /**
     * Cleanup old deduplication entries
     * @private
     */
    _cleanupDeduplicationTracking() {
        const now = Date.now();
        const cutoff = now - this.config.deduplicationWindow;
        
        for (const [key, entry] of this.recentEvents.entries()) {
            if (entry.timestamp < cutoff) {
                this.recentEvents.delete(key);
            }
        }
    }

    /**
     * Group events by type
     * @private
     */
    _groupEventsByType(events) {
        return events.reduce((groups, event) => {
            const type = event.type || 'unknown';
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(event);
            return groups;
        }, {});
    }

    /**
     * Process remaining events on shutdown
     * @private
     */
    async _processRemainingEvents() {
        console.log('🔄 Processing remaining events before shutdown...');
        
        let totalRemaining = 0;
        for (const queue of this.eventQueues.values()) {
            totalRemaining += queue.length;
        }

        if (totalRemaining > 0) {
            console.log(`🔄 Processing ${totalRemaining} remaining events`);
            await this._processEvents();
        }
    }

    /**
     * Get queue sizes
     * @private
     */
    _getQueueSizes() {
        const sizes = {};
        for (const [priority, queue] of this.eventQueues.entries()) {
            sizes[priority] = queue.length;
        }
        return sizes;
    }

    /**
     * Update queue size metrics
     * @private
     */
    _updateQueueSizeMetrics() {
        this.metrics.queueSizes = this._getQueueSizes();
    }

    /**
     * Update processing metrics
     * @private
     */
    _updateProcessingMetrics(eventCount, processingTime) {
        // Update average processing time
        const totalProcessed = this.metrics.processedEvents;
        const currentAvg = this.metrics.averageProcessingTime;
        this.metrics.averageProcessingTime = ((currentAvg * (totalProcessed - eventCount)) + processingTime) / totalProcessed;
    }

    /**
     * Track event performance
     * @private
     */
    _trackEventPerformance(eventType, processingTime) {
        if (!this.performanceTracker.has(eventType)) {
            this.performanceTracker.set(eventType, {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }

        const stats = this.performanceTracker.get(eventType);
        stats.count++;
        stats.totalTime += processingTime;
        stats.averageTime = stats.totalTime / stats.count;
        stats.minTime = Math.min(stats.minTime, processingTime);
        stats.maxTime = Math.max(stats.maxTime, processingTime);
    }

    /**
     * Initialize metrics
     * @private
     */
    _initializeMetrics() {
        this.metrics.queueSizes = this._getQueueSizes();
    }

    /**
     * Validate event
     * @private
     */
    _validateEvent(event) {
        if (!event || typeof event !== 'object') {
            throw new Error('Event must be an object');
        }

        if (!event.entityId) {
            throw new Error('Event must include entityId');
        }

        if (!event.entityType) {
            throw new Error('Event must include entityType');
        }
    }

    /**
     * Generate event ID
     * @private
     */
    _generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EventProcessor;

