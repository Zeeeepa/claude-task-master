/**
 * @fileoverview Event Bus - Central event management for event-driven architecture
 * @description Provides reliable event handling, persistence, and retry mechanisms
 */

import { EventEmitter } from 'events';
import { getConfig } from '../../config/orchestrator.js';

/**
 * Event priorities
 */
export const EventPriority = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Event states
 */
export const EventState = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying'
};

/**
 * Event Bus Class
 * Manages event distribution, persistence, and retry logic
 */
export class EventBus extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxListeners: 100,
            timeout: 10000,
            retryAttempts: 3,
            retryDelay: 1000,
            enablePersistence: true,
            enableMetrics: true,
            ...options
        };

        // Set max listeners
        this.setMaxListeners(this.options.maxListeners);

        // Event storage and tracking
        this.eventQueue = [];
        this.processingEvents = new Map();
        this.eventHistory = [];
        this.failedEvents = [];
        
        // Metrics
        this.metrics = {
            eventsEmitted: 0,
            eventsProcessed: 0,
            eventsFailed: 0,
            eventsRetried: 0,
            averageProcessingTime: 0,
            totalProcessingTime: 0
        };

        // Event handlers registry
        this.handlers = new Map();
        
        // Retry timers
        this.retryTimers = new Map();
        
        this.initialized = false;
    }

    /**
     * Initialize the event bus
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.emit('eventBus:initializing');

            // Setup event processing
            this.setupEventProcessing();

            // Setup error handling
            this.setupErrorHandling();

            // Setup metrics collection
            if (this.options.enableMetrics) {
                this.setupMetricsCollection();
            }

            this.initialized = true;
            this.emit('eventBus:initialized');

            console.log('✅ Event Bus initialized');
        } catch (error) {
            this.emit('eventBus:error', error);
            throw new Error(`Failed to initialize Event Bus: ${error.message}`);
        }
    }

    /**
     * Setup event processing
     */
    setupEventProcessing() {
        // Override emit to add event tracking
        const originalEmit = this.emit.bind(this);
        
        this.emit = (eventName, ...args) => {
            const eventData = this.createEventData(eventName, args);
            
            // Track event
            this.trackEvent(eventData);
            
            // Process event
            return this.processEvent(eventName, eventData, originalEmit);
        };
    }

    /**
     * Create event data object
     * @param {string} eventName - Event name
     * @param {Array} args - Event arguments
     * @returns {Object} Event data
     */
    createEventData(eventName, args) {
        return {
            id: this.generateEventId(),
            name: eventName,
            data: args.length === 1 ? args[0] : args,
            timestamp: Date.now(),
            priority: this.getEventPriority(eventName),
            state: EventState.PENDING,
            attempts: 0,
            maxAttempts: this.options.retryAttempts,
            timeout: this.options.timeout,
            source: 'EventBus'
        };
    }

    /**
     * Process event with retry logic
     * @param {string} eventName - Event name
     * @param {Object} eventData - Event data
     * @param {Function} originalEmit - Original emit function
     * @returns {boolean} Success status
     */
    async processEvent(eventName, eventData, originalEmit) {
        try {
            eventData.state = EventState.PROCESSING;
            eventData.processingStartTime = Date.now();
            
            this.processingEvents.set(eventData.id, eventData);

            // Call original emit
            const result = originalEmit(eventName, eventData.data);

            // Handle timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Event ${eventName} timed out after ${eventData.timeout}ms`));
                }, eventData.timeout);
            });

            // Wait for processing or timeout
            await Promise.race([
                Promise.resolve(result),
                timeoutPromise
            ]);

            // Mark as completed
            eventData.state = EventState.COMPLETED;
            eventData.processingEndTime = Date.now();
            eventData.processingTime = eventData.processingEndTime - eventData.processingStartTime;

            this.completeEvent(eventData);
            return true;

        } catch (error) {
            return await this.handleEventError(eventData, error);
        }
    }

    /**
     * Handle event processing error
     * @param {Object} eventData - Event data
     * @param {Error} error - Error that occurred
     * @returns {boolean} Success status
     */
    async handleEventError(eventData, error) {
        eventData.attempts++;
        eventData.lastError = error.message;

        if (eventData.attempts < eventData.maxAttempts) {
            // Retry event
            eventData.state = EventState.RETRYING;
            this.metrics.eventsRetried++;

            console.warn(`⚠️ Event ${eventData.name} failed, retrying (${eventData.attempts}/${eventData.maxAttempts}):`, error.message);

            // Schedule retry with exponential backoff
            const retryDelay = this.options.retryDelay * Math.pow(2, eventData.attempts - 1);
            
            const retryTimer = setTimeout(() => {
                this.retryEvent(eventData);
            }, retryDelay);

            this.retryTimers.set(eventData.id, retryTimer);
            return false;

        } else {
            // Mark as failed
            eventData.state = EventState.FAILED;
            eventData.processingEndTime = Date.now();
            
            this.failEvent(eventData, error);
            return false;
        }
    }

    /**
     * Retry event processing
     * @param {Object} eventData - Event data
     */
    async retryEvent(eventData) {
        try {
            console.log(`🔄 Retrying event ${eventData.name} (attempt ${eventData.attempts})`);
            
            // Remove from retry timers
            this.retryTimers.delete(eventData.id);
            
            // Re-emit the event
            const originalEmit = EventEmitter.prototype.emit.bind(this);
            await this.processEvent(eventData.name, eventData, originalEmit);

        } catch (error) {
            await this.handleEventError(eventData, error);
        }
    }

    /**
     * Complete event processing
     * @param {Object} eventData - Event data
     */
    completeEvent(eventData) {
        this.processingEvents.delete(eventData.id);
        this.eventHistory.push(eventData);
        
        this.metrics.eventsProcessed++;
        this.metrics.totalProcessingTime += eventData.processingTime;
        this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.eventsProcessed;

        // Maintain history size
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-1000);
        }
    }

    /**
     * Mark event as failed
     * @param {Object} eventData - Event data
     * @param {Error} error - Error that caused failure
     */
    failEvent(eventData, error) {
        this.processingEvents.delete(eventData.id);
        this.failedEvents.push(eventData);
        
        this.metrics.eventsFailed++;

        console.error(`❌ Event ${eventData.name} failed permanently:`, error.message);
        
        // Emit failure event
        EventEmitter.prototype.emit.call(this, 'event:failed', {
            eventData,
            error: error.message
        });

        // Maintain failed events size
        if (this.failedEvents.length > 100) {
            this.failedEvents = this.failedEvents.slice(-100);
        }
    }

    /**
     * Track event emission
     * @param {Object} eventData - Event data
     */
    trackEvent(eventData) {
        this.eventQueue.push(eventData);
        this.metrics.eventsEmitted++;

        // Maintain queue size
        if (this.eventQueue.length > 1000) {
            this.eventQueue = this.eventQueue.slice(-1000);
        }
    }

    /**
     * Get event priority based on event name
     * @param {string} eventName - Event name
     * @returns {string} Event priority
     */
    getEventPriority(eventName) {
        // Define priority rules
        const priorityRules = {
            'error': EventPriority.CRITICAL,
            'shutdown': EventPriority.CRITICAL,
            'component:error': EventPriority.HIGH,
            'task:failed': EventPriority.HIGH,
            'task:completed': EventPriority.MEDIUM,
            'task:created': EventPriority.MEDIUM,
            'health:check': EventPriority.LOW
        };

        // Check for exact match
        if (priorityRules[eventName]) {
            return priorityRules[eventName];
        }

        // Check for pattern matches
        for (const [pattern, priority] of Object.entries(priorityRules)) {
            if (eventName.includes(pattern)) {
                return priority;
            }
        }

        return EventPriority.MEDIUM;
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        this.on('error', (error) => {
            console.error('❌ Event Bus error:', error);
            this.metrics.eventsFailed++;
        });

        // Handle uncaught exceptions in event handlers
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught exception in event handler:', error);
        });
    }

    /**
     * Setup metrics collection
     */
    setupMetricsCollection() {
        // Collect metrics every minute
        setInterval(() => {
            this.collectMetrics();
        }, 60000);
    }

    /**
     * Collect and emit metrics
     */
    collectMetrics() {
        const metrics = {
            ...this.metrics,
            queueSize: this.eventQueue.length,
            processingCount: this.processingEvents.size,
            failedCount: this.failedEvents.length,
            historySize: this.eventHistory.length,
            timestamp: Date.now()
        };

        EventEmitter.prototype.emit.call(this, 'metrics:collected', metrics);
    }

    /**
     * Register event handler with metadata
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Handler options
     */
    registerHandler(eventName, handler, options = {}) {
        const handlerInfo = {
            handler,
            options: {
                priority: EventPriority.MEDIUM,
                timeout: this.options.timeout,
                retryOnError: true,
                ...options
            },
            registeredAt: Date.now(),
            callCount: 0,
            errorCount: 0
        };

        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }

        this.handlers.get(eventName).push(handlerInfo);
        this.on(eventName, handler);
    }

    /**
     * Unregister event handler
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     */
    unregisterHandler(eventName, handler) {
        const handlers = this.handlers.get(eventName);
        if (handlers) {
            const index = handlers.findIndex(h => h.handler === handler);
            if (index !== -1) {
                handlers.splice(index, 1);
                this.removeListener(eventName, handler);
            }
        }
    }

    /**
     * Get event bus status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: this.initialized,
            metrics: this.metrics,
            queueSize: this.eventQueue.length,
            processingCount: this.processingEvents.size,
            failedCount: this.failedEvents.length,
            historySize: this.eventHistory.length,
            handlerCount: Array.from(this.handlers.values()).reduce((sum, handlers) => sum + handlers.length, 0),
            retryTimersActive: this.retryTimers.size
        };
    }

    /**
     * Get event history
     * @param {number} limit - Maximum number of events to return
     * @returns {Array} Event history
     */
    getEventHistory(limit = 100) {
        return this.eventHistory.slice(-limit);
    }

    /**
     * Get failed events
     * @param {number} limit - Maximum number of events to return
     * @returns {Array} Failed events
     */
    getFailedEvents(limit = 50) {
        return this.failedEvents.slice(-limit);
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory = [];
        this.failedEvents = [];
    }

    /**
     * Health check for the event bus
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            const status = {
                healthy: true,
                initialized: this.initialized,
                ...this.getStatus(),
                timestamp: new Date().toISOString()
            };

            // Check if processing is stuck
            const stuckEvents = Array.from(this.processingEvents.values()).filter(
                event => Date.now() - event.processingStartTime > event.timeout * 2
            );

            if (stuckEvents.length > 0) {
                status.healthy = false;
                status.warning = `${stuckEvents.length} events appear to be stuck`;
            }

            // Check failure rate
            const recentEvents = this.eventHistory.slice(-100);
            const recentFailures = this.failedEvents.slice(-100);
            const failureRate = recentFailures.length / (recentEvents.length + recentFailures.length);

            if (failureRate > 0.1) { // 10% failure rate
                status.healthy = false;
                status.warning = `High failure rate: ${(failureRate * 100).toFixed(1)}%`;
            }

            return status;
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Stop the event bus
     */
    async stop() {
        try {
            // Clear retry timers
            for (const timer of this.retryTimers.values()) {
                clearTimeout(timer);
            }
            this.retryTimers.clear();

            // Wait for processing events to complete (with timeout)
            const maxWaitTime = 10000; // 10 seconds
            const startTime = Date.now();
            
            while (this.processingEvents.size > 0 && Date.now() - startTime < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.removeAllListeners();
            EventEmitter.prototype.emit.call(this, 'eventBus:stopped');
            
            console.log('✅ Event Bus stopped');
        } catch (error) {
            console.error('❌ Error stopping Event Bus:', error);
            throw error;
        }
    }
}

export default EventBus;

