/**
 * @fileoverview Event Processor
 * @description Asynchronous event processing queue for webhook events with
 *              priority handling, retry logic, and status synchronization
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Event processor with queue management and asynchronous processing
 */
export class EventProcessor {
    constructor(config = {}) {
        this.config = {
            queue_size: config.queue_size || 1000,
            processing_timeout: config.processing_timeout || 300000, // 5 minutes
            batch_size: config.batch_size || 10,
            processing_interval: config.processing_interval || 5000, // 5 seconds
            retry_attempts: config.retry_attempts || 3,
            retry_delay: config.retry_delay || 2000,
            priority_levels: config.priority_levels || ['high', 'medium', 'low'],
            dead_letter_queue: config.dead_letter_queue !== false,
            metrics_enabled: config.metrics_enabled !== false,
            ...config
        };

        // Event queues by priority
        this.eventQueues = new Map();
        this.config.priority_levels.forEach(level => {
            this.eventQueues.set(level, []);
        });

        // Processing state
        this.isProcessing = false;
        this.processingInterval = null;
        this.activeProcessors = new Map();
        this.deadLetterQueue = [];

        // Metrics and tracking
        this.metrics = {
            events_queued: 0,
            events_processed: 0,
            events_failed: 0,
            events_retried: 0,
            processing_times: [],
            queue_sizes: new Map(),
            last_processed: null
        };

        // Event handlers
        this.eventHandlers = new Map();
        this._initializeDefaultHandlers();

        log('info', 'Event Processor initialized');
    }

    /**
     * Initialize event processor
     */
    async initialize() {
        log('info', 'Initializing Event Processor...');

        // Start processing interval
        this._startProcessing();

        // Start metrics collection
        if (this.config.metrics_enabled) {
            this._startMetricsCollection();
        }

        log('info', 'Event Processor initialized successfully');
    }

    /**
     * Queue event for processing
     * @param {Object} event - Event to queue
     * @param {string} priority - Event priority (high, medium, low)
     * @returns {Promise<string>} Event ID
     */
    async queueEvent(event, priority = 'medium') {
        const eventId = this._generateEventId();
        const queuedEvent = {
            id: eventId,
            ...event,
            priority: priority,
            queued_at: new Date(),
            attempts: 0,
            status: 'queued'
        };

        // Validate priority
        if (!this.config.priority_levels.includes(priority)) {
            priority = 'medium';
            queuedEvent.priority = priority;
        }

        // Check queue size limits
        const queue = this.eventQueues.get(priority);
        if (queue.length >= this.config.queue_size) {
            // Remove oldest event if queue is full
            const removedEvent = queue.shift();
            log('warning', `Queue full, removed oldest event: ${removedEvent.id}`);
        }

        // Add to appropriate priority queue
        queue.push(queuedEvent);
        this.metrics.events_queued++;

        log('debug', `Event ${eventId} queued with priority ${priority}`);
        return eventId;
    }

    /**
     * Process events from queues
     * @returns {Promise<void>}
     */
    async processEvents() {
        if (this.isProcessing) {
            log('debug', 'Event processing already in progress');
            return;
        }

        this.isProcessing = true;
        const startTime = Date.now();

        try {
            log('debug', 'Starting event processing cycle');

            // Process events by priority (high -> medium -> low)
            for (const priority of this.config.priority_levels) {
                const queue = this.eventQueues.get(priority);
                
                if (queue.length === 0) continue;

                // Process batch of events from this priority level
                const batch = queue.splice(0, Math.min(this.config.batch_size, queue.length));
                
                if (batch.length > 0) {
                    log('debug', `Processing ${batch.length} ${priority} priority events`);
                    await this._processBatch(batch);
                }

                // Don't process lower priority if we have high priority events
                if (priority === 'high' && this.eventQueues.get('high').length > 0) {
                    break;
                }
            }

            const processingTime = Date.now() - startTime;
            this.metrics.processing_times.push(processingTime);
            this.metrics.last_processed = new Date();

            log('debug', `Event processing cycle completed (${processingTime}ms)`);

        } catch (error) {
            log('error', `Error during event processing: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Register event handler
     * @param {string} eventType - Event type to handle
     * @param {Function} handler - Handler function
     */
    registerEventHandler(eventType, handler) {
        this.eventHandlers.set(eventType, handler);
        log('debug', `Registered event handler for: ${eventType}`);
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue statistics
     */
    getQueueStatistics() {
        const queueSizes = {};
        let totalQueued = 0;

        for (const [priority, queue] of this.eventQueues.entries()) {
            queueSizes[priority] = queue.length;
            totalQueued += queue.length;
        }

        return {
            total_queued: totalQueued,
            queue_sizes: queueSizes,
            active_processors: this.activeProcessors.size,
            dead_letter_queue_size: this.deadLetterQueue.length,
            is_processing: this.isProcessing
        };
    }

    /**
     * Get processing metrics
     * @returns {Object} Processing metrics
     */
    getMetrics() {
        const avgProcessingTime = this.metrics.processing_times.length > 0
            ? this.metrics.processing_times.reduce((sum, time) => sum + time, 0) / this.metrics.processing_times.length
            : 0;

        return {
            ...this.metrics,
            avg_processing_time_ms: avgProcessingTime,
            success_rate: this.metrics.events_processed > 0 
                ? (this.metrics.events_processed - this.metrics.events_failed) / this.metrics.events_processed 
                : 0,
            queue_statistics: this.getQueueStatistics()
        };
    }

    /**
     * Get queue size
     * @returns {number} Total queue size
     */
    getQueueSize() {
        return this.getQueueStatistics().total_queued;
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const metrics = this.getMetrics();
        const queueStats = this.getQueueStatistics();
        
        // Determine health based on queue sizes and processing rate
        let status = 'healthy';
        if (queueStats.total_queued > this.config.queue_size * 0.8) {
            status = 'degraded';
        }
        if (queueStats.total_queued >= this.config.queue_size) {
            status = 'unhealthy';
        }

        return {
            status: status,
            queue_utilization: queueStats.total_queued / this.config.queue_size,
            processing_active: this.isProcessing,
            success_rate: metrics.success_rate,
            avg_processing_time_ms: metrics.avg_processing_time_ms,
            dead_letter_queue_size: this.deadLetterQueue.length,
            last_processed: this.metrics.last_processed
        };
    }

    /**
     * Shutdown event processor
     */
    async shutdown() {
        log('info', 'Shutting down Event Processor...');

        // Stop processing
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        // Wait for active processors to complete
        const activeProcessorPromises = Array.from(this.activeProcessors.values());
        if (activeProcessorPromises.length > 0) {
            log('info', `Waiting for ${activeProcessorPromises.length} active processors to complete...`);
            await Promise.allSettled(activeProcessorPromises);
        }

        // Clear queues
        for (const queue of this.eventQueues.values()) {
            queue.length = 0;
        }
        this.deadLetterQueue.length = 0;
        this.activeProcessors.clear();

        log('info', 'Event Processor shut down');
    }

    // Private methods

    /**
     * Initialize default event handlers
     * @private
     */
    _initializeDefaultHandlers() {
        // PR events
        this.eventHandlers.set('pr_created', this._handlePRCreated.bind(this));
        this.eventHandlers.set('pr_updated', this._handlePRUpdated.bind(this));
        this.eventHandlers.set('pr_merged', this._handlePRMerged.bind(this));
        this.eventHandlers.set('pr_closed', this._handlePRClosed.bind(this));

        // Check events
        this.eventHandlers.set('check_run_completed', this._handleCheckRunCompleted.bind(this));
        this.eventHandlers.set('check_suite_completed', this._handleCheckSuiteCompleted.bind(this));

        // Workflow events
        this.eventHandlers.set('workflow_run_completed', this._handleWorkflowRunCompleted.bind(this));

        // Issue events
        this.eventHandlers.set('issue_opened', this._handleIssueOpened.bind(this));
        this.eventHandlers.set('issue_closed', this._handleIssueClosed.bind(this));

        // Generic events
        this.eventHandlers.set('generic_event', this._handleGenericEvent.bind(this));
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     * @private
     */
    _generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    /**
     * Start processing interval
     * @private
     */
    _startProcessing() {
        this.processingInterval = setInterval(async () => {
            await this.processEvents();
        }, this.config.processing_interval);

        log('debug', `Event processing started with ${this.config.processing_interval}ms interval`);
    }

    /**
     * Start metrics collection
     * @private
     */
    _startMetricsCollection() {
        setInterval(() => {
            // Collect queue size metrics
            for (const [priority, queue] of this.eventQueues.entries()) {
                this.metrics.queue_sizes.set(priority, queue.length);
            }

            // Trim processing times to keep memory usage reasonable
            if (this.metrics.processing_times.length > 100) {
                this.metrics.processing_times = this.metrics.processing_times.slice(-50);
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Process batch of events
     * @param {Array} batch - Batch of events to process
     * @returns {Promise<void>}
     * @private
     */
    async _processBatch(batch) {
        const batchPromises = batch.map(event => this._processEvent(event));
        await Promise.allSettled(batchPromises);
    }

    /**
     * Process individual event
     * @param {Object} event - Event to process
     * @returns {Promise<void>}
     * @private
     */
    async _processEvent(event) {
        const processorId = `proc_${event.id}`;
        const startTime = Date.now();

        try {
            // Track active processor
            const processorPromise = this._executeEventHandler(event);
            this.activeProcessors.set(processorId, processorPromise);

            log('debug', `Processing event ${event.id} (type: ${event.type})`);

            // Execute with timeout
            const result = await Promise.race([
                processorPromise,
                this._createTimeoutPromise(this.config.processing_timeout)
            ]);

            // Update event status
            event.status = 'completed';
            event.completed_at = new Date();
            event.processing_time_ms = Date.now() - startTime;
            event.result = result;

            this.metrics.events_processed++;
            log('debug', `Event ${event.id} processed successfully (${event.processing_time_ms}ms)`);

        } catch (error) {
            log('error', `Failed to process event ${event.id}: ${error.message}`);

            event.attempts++;
            event.last_error = error.message;
            event.last_attempt_at = new Date();

            // Retry logic
            if (event.attempts < this.config.retry_attempts) {
                log('info', `Retrying event ${event.id} (attempt ${event.attempts + 1}/${this.config.retry_attempts})`);
                
                // Add back to queue with delay
                setTimeout(() => {
                    const queue = this.eventQueues.get(event.priority);
                    queue.unshift(event); // Add to front for priority
                }, this.config.retry_delay);

                this.metrics.events_retried++;
            } else {
                // Move to dead letter queue
                event.status = 'failed';
                event.failed_at = new Date();
                
                if (this.config.dead_letter_queue) {
                    this.deadLetterQueue.push(event);
                    log('warning', `Event ${event.id} moved to dead letter queue after ${event.attempts} attempts`);
                }

                this.metrics.events_failed++;
            }
        } finally {
            // Remove from active processors
            this.activeProcessors.delete(processorId);
        }
    }

    /**
     * Execute event handler
     * @param {Object} event - Event to handle
     * @returns {Promise<any>} Handler result
     * @private
     */
    async _executeEventHandler(event) {
        const handler = this.eventHandlers.get(event.type);
        
        if (handler) {
            return await handler(event);
        } else {
            log('warning', `No handler found for event type: ${event.type}`);
            return await this._handleGenericEvent(event);
        }
    }

    /**
     * Create timeout promise
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<never>} Timeout promise
     * @private
     */
    _createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Event processing timeout after ${timeout}ms`));
            }, timeout);
        });
    }

    // Event handler methods

    /**
     * Handle PR created event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRCreated(event) {
        log('info', `Processing PR created event for task ${event.task_id}`);
        
        // Sync PR status to database
        if (event.pr_info) {
            // This would integrate with the database to update task status
            log('debug', `Syncing PR ${event.pr_info.number} to database`);
        }

        return {
            action: 'pr_created_processed',
            task_id: event.task_id,
            pr_number: event.pr_info?.number,
            status: 'synced'
        };
    }

    /**
     * Handle PR updated event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRUpdated(event) {
        log('info', `Processing PR updated event`);
        
        return {
            action: 'pr_updated_processed',
            pr_number: event.pr_info?.number,
            status: 'synced'
        };
    }

    /**
     * Handle PR merged event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRMerged(event) {
        log('info', `Processing PR merged event`);
        
        // Trigger deployment or next steps
        return {
            action: 'pr_merged_processed',
            pr_number: event.pr_info?.number,
            status: 'deployment_triggered'
        };
    }

    /**
     * Handle PR closed event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRClosed(event) {
        log('info', `Processing PR closed event`);
        
        return {
            action: 'pr_closed_processed',
            pr_number: event.pr_info?.number,
            status: 'synced'
        };
    }

    /**
     * Handle check run completed event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleCheckRunCompleted(event) {
        log('info', `Processing check run completed event: ${event.check_info?.conclusion}`);
        
        // Handle failed checks
        if (event.check_info?.conclusion === 'failure') {
            log('warning', `Check run failed: ${event.check_info.name}`);
            // Could trigger automatic fixes or notifications
        }

        return {
            action: 'check_run_processed',
            check_name: event.check_info?.name,
            conclusion: event.check_info?.conclusion,
            status: 'processed'
        };
    }

    /**
     * Handle check suite completed event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleCheckSuiteCompleted(event) {
        log('info', `Processing check suite completed event: ${event.check_info?.conclusion}`);
        
        return {
            action: 'check_suite_processed',
            conclusion: event.check_info?.conclusion,
            status: 'processed'
        };
    }

    /**
     * Handle workflow run completed event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleWorkflowRunCompleted(event) {
        log('info', `Processing workflow run completed event: ${event.workflow_info?.conclusion}`);
        
        return {
            action: 'workflow_run_processed',
            workflow_name: event.workflow_info?.name,
            conclusion: event.workflow_info?.conclusion,
            status: 'processed'
        };
    }

    /**
     * Handle issue opened event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleIssueOpened(event) {
        log('info', `Processing issue opened event: ${event.issue_info?.title}`);
        
        return {
            action: 'issue_opened_processed',
            issue_number: event.issue_info?.number,
            status: 'processed'
        };
    }

    /**
     * Handle issue closed event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleIssueClosed(event) {
        log('info', `Processing issue closed event`);
        
        return {
            action: 'issue_closed_processed',
            issue_number: event.issue_info?.number,
            status: 'processed'
        };
    }

    /**
     * Handle generic event
     * @param {Object} event - Event data
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleGenericEvent(event) {
        log('debug', `Processing generic event: ${event.type}`);
        
        return {
            action: 'generic_event_processed',
            event_type: event.type,
            status: 'processed'
        };
    }
}

export default EventProcessor;

