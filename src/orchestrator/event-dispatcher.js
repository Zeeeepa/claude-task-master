/**
 * Event Dispatcher - Event routing and handling system
 * Routes events between system components, implements event queuing, prioritization, and filtering
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';

class EventDispatcher extends EventEmitter {
    constructor() {
        super();
        this.eventQueue = [];
        this.eventFilters = new Map();
        this.eventHandlers = new Map();
        this.eventHistory = [];
        this.isRunning = false;
        this.processingInterval = null;
        this.maxHistorySize = 1000;
        this.maxQueueSize = 10000;
    }

    /**
     * Start the event dispatcher
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Event dispatcher is already running');
            return;
        }

        logger.info('Starting event dispatcher...');
        this.isRunning = true;
        
        // Start event processing loop
        this.startEventProcessing();
        
        this.emit('started');
        logger.info('Event dispatcher started successfully');
    }

    /**
     * Stop the event dispatcher
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Event dispatcher is not running');
            return;
        }

        logger.info('Stopping event dispatcher...');
        this.isRunning = false;
        
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        this.emit('stopped');
        logger.info('Event dispatcher stopped successfully');
    }

    /**
     * Dispatch an event
     */
    async dispatch(eventType, eventData = {}, options = {}) {
        const event = {
            id: this.generateEventId(),
            type: eventType,
            data: eventData,
            timestamp: Date.now(),
            priority: options.priority || 'normal',
            source: options.source || 'unknown',
            target: options.target || null,
            metadata: options.metadata || {},
            retryCount: 0,
            maxRetries: options.maxRetries || 3
        };

        // Apply filters
        if (!this.passesFilters(event)) {
            logger.debug(`Event filtered out: ${eventType}`, { eventId: event.id });
            return event.id;
        }

        // Check queue size
        if (this.eventQueue.length >= this.maxQueueSize) {
            logger.warn('Event queue is full, dropping oldest events');
            this.eventQueue.splice(0, Math.floor(this.maxQueueSize * 0.1)); // Remove 10% of oldest events
        }

        // Add to queue
        this.eventQueue.push(event);
        
        // Sort queue by priority
        this.sortEventQueue();
        
        logger.debug(`Event dispatched: ${eventType}`, { 
            eventId: event.id, 
            priority: event.priority,
            queueSize: this.eventQueue.length 
        });

        // Emit for immediate listeners
        this.emit('eventDispatched', event);
        
        return event.id;
    }

    /**
     * Register an event handler
     */
    registerHandler(eventType, handler, options = {}) {
        const handlerId = this.generateHandlerId();
        const handlerConfig = {
            id: handlerId,
            eventType,
            handler,
            priority: options.priority || 'normal',
            async: options.async !== false,
            retryOnError: options.retryOnError !== false,
            timeout: options.timeout || 30000,
            metadata: options.metadata || {}
        };

        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        
        this.eventHandlers.get(eventType).push(handlerConfig);
        
        // Sort handlers by priority
        this.eventHandlers.get(eventType).sort((a, b) => {
            const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        logger.debug(`Event handler registered: ${eventType}`, { handlerId });
        return handlerId;
    }

    /**
     * Unregister an event handler
     */
    unregisterHandler(handlerId) {
        for (const [eventType, handlers] of this.eventHandlers) {
            const index = handlers.findIndex(h => h.id === handlerId);
            if (index !== -1) {
                handlers.splice(index, 1);
                if (handlers.length === 0) {
                    this.eventHandlers.delete(eventType);
                }
                logger.debug(`Event handler unregistered: ${handlerId}`);
                return true;
            }
        }
        return false;
    }

    /**
     * Add an event filter
     */
    addFilter(filterId, filterFunction, options = {}) {
        const filter = {
            id: filterId,
            filter: filterFunction,
            priority: options.priority || 'normal',
            metadata: options.metadata || {}
        };

        this.eventFilters.set(filterId, filter);
        logger.debug(`Event filter added: ${filterId}`);
        return filterId;
    }

    /**
     * Remove an event filter
     */
    removeFilter(filterId) {
        const removed = this.eventFilters.delete(filterId);
        if (removed) {
            logger.debug(`Event filter removed: ${filterId}`);
        }
        return removed;
    }

    /**
     * Process events in the queue
     */
    async processEvents() {
        if (!this.isRunning || this.eventQueue.length === 0) {
            return;
        }

        const batchSize = configManager.get('eventDispatcher.batchSize', 10);
        const eventsToProcess = this.eventQueue.splice(0, batchSize);

        for (const event of eventsToProcess) {
            try {
                await this.processEvent(event);
            } catch (error) {
                logger.error(`Error processing event ${event.id}:`, error);
                await this.handleEventError(event, error);
            }
        }
    }

    /**
     * Process a single event
     */
    async processEvent(event) {
        const handlers = this.eventHandlers.get(event.type) || [];
        const wildcardHandlers = this.eventHandlers.get('*') || [];
        const allHandlers = [...handlers, ...wildcardHandlers];

        if (allHandlers.length === 0) {
            logger.debug(`No handlers found for event type: ${event.type}`);
            this.addToHistory(event, 'no_handlers');
            return;
        }

        const results = [];
        
        for (const handlerConfig of allHandlers) {
            try {
                const startTime = Date.now();
                let result;

                if (handlerConfig.async) {
                    // Handle with timeout
                    result = await Promise.race([
                        handlerConfig.handler(event),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Handler timeout')), handlerConfig.timeout)
                        )
                    ]);
                } else {
                    result = handlerConfig.handler(event);
                }

                const duration = Date.now() - startTime;
                results.push({
                    handlerId: handlerConfig.id,
                    success: true,
                    result,
                    duration
                });

                logger.debug(`Event handler completed: ${handlerConfig.id}`, { 
                    eventId: event.id, 
                    duration 
                });

            } catch (error) {
                results.push({
                    handlerId: handlerConfig.id,
                    success: false,
                    error: error.message,
                    duration: Date.now() - startTime
                });

                logger.error(`Event handler failed: ${handlerConfig.id}`, {
                    eventId: event.id,
                    error: error.message
                });

                if (!handlerConfig.retryOnError) {
                    throw error;
                }
            }
        }

        this.addToHistory(event, 'processed', { results });
        this.emit('eventProcessed', { event, results });
    }

    /**
     * Handle event processing errors
     */
    async handleEventError(event, error) {
        event.retryCount++;
        
        if (event.retryCount < event.maxRetries) {
            // Retry the event
            event.priority = 'high'; // Increase priority for retry
            this.eventQueue.unshift(event); // Add to front of queue
            
            logger.warn(`Retrying event ${event.id} (attempt ${event.retryCount + 1}/${event.maxRetries})`);
        } else {
            // Max retries reached
            this.addToHistory(event, 'failed', { error: error.message });
            this.emit('eventFailed', { event, error });
            
            logger.error(`Event ${event.id} failed after ${event.maxRetries} retries:`, error);
        }
    }

    /**
     * Check if event passes all filters
     */
    passesFilters(event) {
        for (const [filterId, filter] of this.eventFilters) {
            try {
                if (!filter.filter(event)) {
                    return false;
                }
            } catch (error) {
                logger.error(`Error in event filter ${filterId}:`, error);
                // Continue processing if filter fails
            }
        }
        return true;
    }

    /**
     * Sort event queue by priority and timestamp
     */
    sortEventQueue() {
        this.eventQueue.sort((a, b) => {
            const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            
            // If same priority, sort by timestamp (older first)
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Add event to history
     */
    addToHistory(event, status, metadata = {}) {
        const historyEntry = {
            eventId: event.id,
            type: event.type,
            status,
            timestamp: Date.now(),
            processingTime: Date.now() - event.timestamp,
            metadata
        };

        this.eventHistory.push(historyEntry);
        
        // Trim history if too large
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.splice(0, this.eventHistory.length - this.maxHistorySize);
        }
    }

    /**
     * Start event processing loop
     */
    startEventProcessing() {
        const processInterval = configManager.get('eventDispatcher.processInterval', 1000);
        
        this.processingInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.processEvents();
            }
        }, processInterval);
    }

    /**
     * Generate unique event ID
     */
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique handler ID
     */
    generateHandlerId() {
        return `handler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get dispatcher status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            queueSize: this.eventQueue.length,
            handlerCount: Array.from(this.eventHandlers.values()).reduce((sum, handlers) => sum + handlers.length, 0),
            filterCount: this.eventFilters.size,
            historySize: this.eventHistory.length,
            eventTypes: Array.from(this.eventHandlers.keys())
        };
    }

    /**
     * Get event history
     */
    getHistory(limit = 100) {
        return this.eventHistory.slice(-limit);
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory = [];
        logger.info('Event history cleared');
    }
}

export const eventDispatcher = new EventDispatcher();
export default EventDispatcher;

