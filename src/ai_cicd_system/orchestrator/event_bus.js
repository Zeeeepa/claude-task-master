/**
 * @fileoverview Event Bus Implementation
 * @description Inter-component communication system with message queuing
 */

import { MessageQueue } from '../events/message_queue.js';

/**
 * Event Bus for inter-component communication
 */
export class EventBus {
    constructor(config = {}) {
        this.config = {
            maxHistorySize: config.maxHistorySize || 1000,
            enableAsyncProcessing: config.enableAsyncProcessing !== false,
            processingInterval: config.processingInterval || 10,
            maxListeners: config.maxListeners || 100,
            ...config
        };
        
        this.listeners = new Map();
        this.messageQueue = new MessageQueue(config.messageQueue || {});
        this.eventHistory = [];
        this.isStarted = false;
        this.processingTimer = null;
        this.stats = {
            totalEvents: 0,
            totalListeners: 0,
            processedEvents: 0,
            failedEvents: 0
        };
    }

    /**
     * Start the event bus
     */
    async start() {
        if (this.isStarted) {
            return;
        }

        await this.messageQueue.initialize();
        this.isStarted = true;
        
        // Start processing queued messages
        if (this.config.enableAsyncProcessing) {
            this._startMessageProcessing();
        }
    }

    /**
     * Stop the event bus
     */
    async stop() {
        if (!this.isStarted) {
            return;
        }

        this.isStarted = false;
        
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
        
        await this.messageQueue.shutdown();
    }

    /**
     * Register an event listener
     * @param {string} eventType - Event type to listen for
     * @param {Function} listener - Listener function
     * @param {Object} options - Listener options
     * @returns {string} Listener ID for removal
     */
    on(eventType, listener, options = {}) {
        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }

        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        
        const listeners = this.listeners.get(eventType);
        
        if (listeners.length >= this.config.maxListeners) {
            throw new Error(`Maximum listeners (${this.config.maxListeners}) reached for event type: ${eventType}`);
        }
        
        const listenerConfig = {
            fn: listener,
            once: options.once || false,
            priority: options.priority || 0,
            id: this._generateListenerId(),
            context: options.context || null,
            timeout: options.timeout || null,
            addedAt: new Date()
        };
        
        listeners.push(listenerConfig);
        
        // Sort by priority (higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);
        
        this.stats.totalListeners++;
        
        return listenerConfig.id;
    }

    /**
     * Register a one-time event listener
     * @param {string} eventType - Event type to listen for
     * @param {Function} listener - Listener function
     * @param {Object} options - Listener options
     * @returns {string} Listener ID
     */
    once(eventType, listener, options = {}) {
        return this.on(eventType, listener, { ...options, once: true });
    }

    /**
     * Remove an event listener
     * @param {string} eventType - Event type
     * @param {string} listenerId - Listener ID to remove
     * @returns {boolean} True if listener was removed
     */
    off(eventType, listenerId) {
        if (!this.listeners.has(eventType)) {
            return false;
        }
        
        const listeners = this.listeners.get(eventType);
        const index = listeners.findIndex(l => l.id === listenerId);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            this.stats.totalListeners--;
            
            // Clean up empty event type
            if (listeners.length === 0) {
                this.listeners.delete(eventType);
            }
            
            return true;
        }
        
        return false;
    }

    /**
     * Remove all listeners for an event type
     * @param {string} eventType - Event type to clear
     * @returns {number} Number of listeners removed
     */
    removeAllListeners(eventType) {
        if (!this.listeners.has(eventType)) {
            return 0;
        }
        
        const listeners = this.listeners.get(eventType);
        const count = listeners.length;
        
        this.listeners.delete(eventType);
        this.stats.totalListeners -= count;
        
        return count;
    }

    /**
     * Emit an event
     * @param {string} eventType - Event type
     * @param {*} data - Event data
     * @param {Object} options - Emission options
     * @returns {Promise<Array>} Results from listeners
     */
    async emit(eventType, data = {}, options = {}) {
        if (!this.isStarted) {
            throw new Error('Event bus not started');
        }

        const event = {
            type: eventType,
            data,
            timestamp: new Date(),
            id: this._generateEventId(),
            source: options.source || 'system',
            metadata: options.metadata || {}
        };
        
        // Add to history
        this._addToHistory(event);
        this.stats.totalEvents++;
        
        // If async processing requested, queue the event
        if (options.async && this.config.enableAsyncProcessing) {
            await this.messageQueue.enqueue(event);
            return [];
        }
        
        // Process immediately
        return await this._processEvent(event);
    }

    /**
     * Process an event
     * @param {Object} event - Event to process
     * @returns {Promise<Array>} Results from listeners
     * @private
     */
    async _processEvent(event) {
        const listeners = this.listeners.get(event.type) || [];
        const results = [];
        
        for (const listener of listeners) {
            try {
                let result;
                
                // Handle timeout if specified
                if (listener.timeout) {
                    result = await this._executeWithTimeout(
                        listener.fn, 
                        [event.data, event], 
                        listener.timeout
                    );
                } else {
                    result = await listener.fn(event.data, event);
                }
                
                results.push({ 
                    listenerId: listener.id, 
                    result,
                    executedAt: new Date()
                });
                
                // Remove one-time listeners
                if (listener.once) {
                    this.off(event.type, listener.id);
                }
                
            } catch (error) {
                console.error(`Error in event listener for ${event.type}:`, error);
                results.push({ 
                    listenerId: listener.id, 
                    error: error.message,
                    stack: error.stack,
                    executedAt: new Date()
                });
                this.stats.failedEvents++;
            }
        }
        
        this.stats.processedEvents++;
        return results;
    }

    /**
     * Start message queue processing
     * @private
     */
    _startMessageProcessing() {
        if (!this.isStarted) {
            return;
        }

        this._processMessageQueue();
    }

    /**
     * Process message queue
     * @private
     */
    async _processMessageQueue() {
        if (!this.isStarted) {
            return;
        }
        
        try {
            const event = await this.messageQueue.dequeue();
            if (event) {
                await this._processEvent(event);
            }
        } catch (error) {
            console.error('Error processing message queue:', error);
            this.stats.failedEvents++;
        }
        
        // Schedule next processing
        if (this.isStarted) {
            this.processingTimer = setTimeout(
                () => this._processMessageQueue(), 
                this.config.processingInterval
            );
        }
    }

    /**
     * Execute function with timeout
     * @param {Function} fn - Function to execute
     * @param {Array} args - Function arguments
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} Function result
     * @private
     */
    async _executeWithTimeout(fn, args, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Listener execution timed out after ${timeout}ms`));
            }, timeout);
            
            Promise.resolve(fn.apply(null, args))
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Add event to history
     * @param {Object} event - Event to add
     * @private
     */
    _addToHistory(event) {
        this.eventHistory.push(event);
        
        // Trim history if too large
        if (this.eventHistory.length > this.config.maxHistorySize) {
            this.eventHistory.splice(0, this.eventHistory.length - this.config.maxHistorySize);
        }
    }

    /**
     * Get event history
     * @param {string} eventType - Optional event type filter
     * @param {number} limit - Maximum number of events to return
     * @returns {Array} Event history
     */
    getEventHistory(eventType = null, limit = 100) {
        let history = this.eventHistory;
        
        if (eventType) {
            history = history.filter(event => event.type === eventType);
        }
        
        return history.slice(-limit);
    }

    /**
     * Get event bus statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeListeners: Array.from(this.listeners.values())
                .reduce((sum, listeners) => sum + listeners.length, 0),
            eventTypes: this.listeners.size,
            historySize: this.eventHistory.length,
            queueStats: this.messageQueue.getStats(),
            isStarted: this.isStarted
        };
    }

    /**
     * Get listener information
     * @param {string} eventType - Optional event type filter
     * @returns {Object} Listener information
     */
    getListeners(eventType = null) {
        if (eventType) {
            return {
                eventType,
                listeners: (this.listeners.get(eventType) || []).map(l => ({
                    id: l.id,
                    priority: l.priority,
                    once: l.once,
                    addedAt: l.addedAt,
                    hasTimeout: l.timeout !== null
                }))
            };
        }
        
        const result = {};
        for (const [type, listeners] of this.listeners.entries()) {
            result[type] = listeners.map(l => ({
                id: l.id,
                priority: l.priority,
                once: l.once,
                addedAt: l.addedAt,
                hasTimeout: l.timeout !== null
            }));
        }
        
        return result;
    }

    /**
     * Generate unique listener ID
     * @returns {string} Listener ID
     * @private
     */
    _generateListenerId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     * @private
     */
    _generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EventBus;

