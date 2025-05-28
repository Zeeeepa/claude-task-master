/**
 * @fileoverview Enhanced Event Emitter Implementation
 * @description Advanced event emitter with filtering, middleware, and monitoring
 */

import { EventUtils, EVENT_PRIORITIES, EVENT_SEVERITIES } from './event_types.js';

/**
 * Enhanced Event Emitter with advanced features
 */
export class EnhancedEventEmitter {
    constructor(config = {}) {
        this.config = {
            maxListeners: config.maxListeners || 100,
            enableWildcards: config.enableWildcards !== false,
            enableMiddleware: config.enableMiddleware !== false,
            enableMetrics: config.enableMetrics !== false,
            enableHistory: config.enableHistory !== false,
            historySize: config.historySize || 1000,
            enableFiltering: config.enableFiltering !== false,
            ...config
        };
        
        this.listeners = new Map();
        this.wildcardListeners = new Map();
        this.middleware = [];
        this.filters = [];
        this.eventHistory = [];
        this.metrics = {
            totalEvents: 0,
            totalListeners: 0,
            eventsPerType: new Map(),
            listenerExecutions: new Map(),
            errors: 0
        };
        this.isActive = true;
    }

    /**
     * Add event listener
     * @param {string|RegExp} eventPattern - Event pattern or regex
     * @param {Function} listener - Listener function
     * @param {Object} options - Listener options
     * @returns {string} Listener ID
     */
    on(eventPattern, listener, options = {}) {
        if (!this.isActive) {
            throw new Error('Event emitter is not active');
        }

        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }

        const listenerId = this._generateListenerId();
        const listenerConfig = {
            id: listenerId,
            fn: listener,
            pattern: eventPattern,
            once: options.once || false,
            priority: options.priority || 0,
            filter: options.filter || null,
            context: options.context || null,
            timeout: options.timeout || null,
            maxExecutions: options.maxExecutions || null,
            executionCount: 0,
            addedAt: new Date(),
            metadata: options.metadata || {}
        };

        // Handle wildcard patterns
        if (this.config.enableWildcards && this._isWildcardPattern(eventPattern)) {
            if (!this.wildcardListeners.has(eventPattern)) {
                this.wildcardListeners.set(eventPattern, []);
            }
            this.wildcardListeners.get(eventPattern).push(listenerConfig);
        } else {
            // Regular event listeners
            if (!this.listeners.has(eventPattern)) {
                this.listeners.set(eventPattern, []);
            }
            
            const listeners = this.listeners.get(eventPattern);
            if (listeners.length >= this.config.maxListeners) {
                throw new Error(`Maximum listeners (${this.config.maxListeners}) reached for event: ${eventPattern}`);
            }
            
            listeners.push(listenerConfig);
            
            // Sort by priority (higher priority first)
            listeners.sort((a, b) => b.priority - a.priority);
        }

        this.metrics.totalListeners++;
        return listenerId;
    }

    /**
     * Add one-time event listener
     * @param {string|RegExp} eventPattern - Event pattern
     * @param {Function} listener - Listener function
     * @param {Object} options - Listener options
     * @returns {string} Listener ID
     */
    once(eventPattern, listener, options = {}) {
        return this.on(eventPattern, listener, { ...options, once: true });
    }

    /**
     * Remove event listener
     * @param {string|RegExp} eventPattern - Event pattern
     * @param {string} listenerId - Listener ID
     * @returns {boolean} True if listener was removed
     */
    off(eventPattern, listenerId) {
        // Check regular listeners
        if (this.listeners.has(eventPattern)) {
            const listeners = this.listeners.get(eventPattern);
            const index = listeners.findIndex(l => l.id === listenerId);
            
            if (index !== -1) {
                listeners.splice(index, 1);
                this.metrics.totalListeners--;
                
                if (listeners.length === 0) {
                    this.listeners.delete(eventPattern);
                }
                
                return true;
            }
        }

        // Check wildcard listeners
        if (this.wildcardListeners.has(eventPattern)) {
            const listeners = this.wildcardListeners.get(eventPattern);
            const index = listeners.findIndex(l => l.id === listenerId);
            
            if (index !== -1) {
                listeners.splice(index, 1);
                this.metrics.totalListeners--;
                
                if (listeners.length === 0) {
                    this.wildcardListeners.delete(eventPattern);
                }
                
                return true;
            }
        }

        return false;
    }

    /**
     * Remove all listeners for an event pattern
     * @param {string|RegExp} eventPattern - Event pattern
     * @returns {number} Number of listeners removed
     */
    removeAllListeners(eventPattern) {
        let removedCount = 0;

        if (this.listeners.has(eventPattern)) {
            removedCount += this.listeners.get(eventPattern).length;
            this.listeners.delete(eventPattern);
        }

        if (this.wildcardListeners.has(eventPattern)) {
            removedCount += this.wildcardListeners.get(eventPattern).length;
            this.wildcardListeners.delete(eventPattern);
        }

        this.metrics.totalListeners -= removedCount;
        return removedCount;
    }

    /**
     * Emit an event
     * @param {string} eventType - Event type
     * @param {*} data - Event data
     * @param {Object} options - Emission options
     * @returns {Promise<Array>} Results from listeners
     */
    async emit(eventType, data = {}, options = {}) {
        if (!this.isActive) {
            return [];
        }

        // Create standardized event object
        const event = EventUtils.createEvent(eventType, data, options);
        
        // Add to history if enabled
        if (this.config.enableHistory) {
            this._addToHistory(event);
        }

        // Update metrics
        this.metrics.totalEvents++;
        this.metrics.eventsPerType.set(eventType, 
            (this.metrics.eventsPerType.get(eventType) || 0) + 1
        );

        // Apply global filters
        if (this.config.enableFiltering && !this._passesFilters(event)) {
            return [];
        }

        // Apply middleware
        if (this.config.enableMiddleware) {
            const middlewareResult = await this._applyMiddleware(event);
            if (middlewareResult === false) {
                return []; // Event was blocked by middleware
            }
        }

        // Get matching listeners
        const matchingListeners = this._getMatchingListeners(eventType);
        
        // Execute listeners
        const results = [];
        for (const listener of matchingListeners) {
            try {
                const result = await this._executeListener(listener, event);
                results.push(result);
                
                // Update execution count
                listener.executionCount++;
                this.metrics.listenerExecutions.set(listener.id,
                    (this.metrics.listenerExecutions.get(listener.id) || 0) + 1
                );
                
                // Remove one-time listeners
                if (listener.once) {
                    this.off(listener.pattern, listener.id);
                }
                
                // Remove listeners that have reached max executions
                if (listener.maxExecutions && listener.executionCount >= listener.maxExecutions) {
                    this.off(listener.pattern, listener.id);
                }
                
            } catch (error) {
                this.metrics.errors++;
                results.push({
                    listenerId: listener.id,
                    error: error.message,
                    stack: error.stack,
                    executedAt: new Date()
                });
                
                // Emit error event (but prevent infinite loops)
                if (eventType !== 'error.listener_execution') {
                    this.emit('error.listener_execution', {
                        originalEvent: event,
                        listener: listener.id,
                        error: error.message
                    });
                }
            }
        }

        return results;
    }

    /**
     * Add middleware function
     * @param {Function} middleware - Middleware function
     * @param {Object} options - Middleware options
     */
    addMiddleware(middleware, options = {}) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }

        this.middleware.push({
            fn: middleware,
            priority: options.priority || 0,
            name: options.name || `middleware_${this.middleware.length}`,
            addedAt: new Date()
        });

        // Sort by priority (higher priority first)
        this.middleware.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Remove middleware
     * @param {string} name - Middleware name
     * @returns {boolean} True if middleware was removed
     */
    removeMiddleware(name) {
        const index = this.middleware.findIndex(m => m.name === name);
        if (index !== -1) {
            this.middleware.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Add global event filter
     * @param {Function} filter - Filter function
     * @param {Object} options - Filter options
     */
    addFilter(filter, options = {}) {
        if (typeof filter !== 'function') {
            throw new Error('Filter must be a function');
        }

        this.filters.push({
            fn: filter,
            name: options.name || `filter_${this.filters.length}`,
            addedAt: new Date()
        });
    }

    /**
     * Remove global filter
     * @param {string} name - Filter name
     * @returns {boolean} True if filter was removed
     */
    removeFilter(name) {
        const index = this.filters.findIndex(f => f.name === name);
        if (index !== -1) {
            this.filters.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get event history
     * @param {Object} options - Query options
     * @returns {Array} Event history
     */
    getHistory(options = {}) {
        let history = this.eventHistory;

        if (options.eventType) {
            history = history.filter(event => event.type === options.eventType);
        }

        if (options.category) {
            history = history.filter(event => event.category === options.category);
        }

        if (options.priority) {
            history = history.filter(event => event.priority === options.priority);
        }

        if (options.since) {
            history = history.filter(event => event.timestamp >= options.since);
        }

        if (options.until) {
            history = history.filter(event => event.timestamp <= options.until);
        }

        const limit = options.limit || 100;
        return history.slice(-limit);
    }

    /**
     * Get emitter metrics
     * @returns {Object} Metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeListeners: this._countActiveListeners(),
            eventTypes: this.listeners.size + this.wildcardListeners.size,
            historySize: this.eventHistory.length,
            middlewareCount: this.middleware.length,
            filterCount: this.filters.length,
            isActive: this.isActive
        };
    }

    /**
     * Get listener information
     * @param {string} eventPattern - Optional event pattern filter
     * @returns {Object} Listener information
     */
    getListeners(eventPattern = null) {
        const result = {};

        if (eventPattern) {
            if (this.listeners.has(eventPattern)) {
                result[eventPattern] = this._formatListeners(this.listeners.get(eventPattern));
            }
            if (this.wildcardListeners.has(eventPattern)) {
                result[`${eventPattern} (wildcard)`] = this._formatListeners(this.wildcardListeners.get(eventPattern));
            }
        } else {
            // Return all listeners
            for (const [pattern, listeners] of this.listeners.entries()) {
                result[pattern] = this._formatListeners(listeners);
            }
            for (const [pattern, listeners] of this.wildcardListeners.entries()) {
                result[`${pattern} (wildcard)`] = this._formatListeners(listeners);
            }
        }

        return result;
    }

    /**
     * Pause event emission
     */
    pause() {
        this.isActive = false;
    }

    /**
     * Resume event emission
     */
    resume() {
        this.isActive = true;
    }

    /**
     * Clear all listeners and reset state
     */
    clear() {
        this.listeners.clear();
        this.wildcardListeners.clear();
        this.middleware = [];
        this.filters = [];
        this.eventHistory = [];
        this.metrics = {
            totalEvents: 0,
            totalListeners: 0,
            eventsPerType: new Map(),
            listenerExecutions: new Map(),
            errors: 0
        };
    }

    // Private methods

    /**
     * Generate unique listener ID
     * @returns {string} Listener ID
     * @private
     */
    _generateListenerId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if pattern is a wildcard pattern
     * @param {string|RegExp} pattern - Pattern to check
     * @returns {boolean} True if wildcard pattern
     * @private
     */
    _isWildcardPattern(pattern) {
        return pattern instanceof RegExp || 
               (typeof pattern === 'string' && (pattern.includes('*') || pattern.includes('?')));
    }

    /**
     * Get listeners matching an event type
     * @param {string} eventType - Event type
     * @returns {Array} Matching listeners
     * @private
     */
    _getMatchingListeners(eventType) {
        const matchingListeners = [];

        // Add exact match listeners
        if (this.listeners.has(eventType)) {
            matchingListeners.push(...this.listeners.get(eventType));
        }

        // Add wildcard listeners if enabled
        if (this.config.enableWildcards) {
            for (const [pattern, listeners] of this.wildcardListeners.entries()) {
                if (this._matchesPattern(eventType, pattern)) {
                    matchingListeners.push(...listeners);
                }
            }
        }

        // Sort by priority
        matchingListeners.sort((a, b) => b.priority - a.priority);

        return matchingListeners;
    }

    /**
     * Check if event type matches pattern
     * @param {string} eventType - Event type
     * @param {string|RegExp} pattern - Pattern
     * @returns {boolean} True if matches
     * @private
     */
    _matchesPattern(eventType, pattern) {
        if (pattern instanceof RegExp) {
            return pattern.test(eventType);
        }

        if (typeof pattern === 'string') {
            // Convert wildcard pattern to regex
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(eventType);
        }

        return false;
    }

    /**
     * Execute a listener
     * @param {Object} listener - Listener configuration
     * @param {Object} event - Event object
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeListener(listener, event) {
        // Apply listener-specific filter
        if (listener.filter && !listener.filter(event)) {
            return {
                listenerId: listener.id,
                skipped: true,
                reason: 'filtered',
                executedAt: new Date()
            };
        }

        // Execute with timeout if specified
        let result;
        if (listener.timeout) {
            result = await this._executeWithTimeout(
                listener.fn,
                [event.data, event],
                listener.timeout
            );
        } else {
            result = await listener.fn(event.data, event);
        }

        return {
            listenerId: listener.id,
            result,
            executedAt: new Date()
        };
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
     * Apply middleware to event
     * @param {Object} event - Event object
     * @returns {Promise<boolean>} True to continue, false to block
     * @private
     */
    async _applyMiddleware(event) {
        for (const middleware of this.middleware) {
            try {
                const result = await middleware.fn(event);
                if (result === false) {
                    return false; // Block event
                }
            } catch (error) {
                console.error(`Middleware ${middleware.name} error:`, error);
                // Continue with other middleware
            }
        }
        return true;
    }

    /**
     * Check if event passes global filters
     * @param {Object} event - Event object
     * @returns {boolean} True if passes all filters
     * @private
     */
    _passesFilters(event) {
        for (const filter of this.filters) {
            try {
                if (!filter.fn(event)) {
                    return false;
                }
            } catch (error) {
                console.error(`Filter ${filter.name} error:`, error);
                // Continue with other filters
            }
        }
        return true;
    }

    /**
     * Add event to history
     * @param {Object} event - Event to add
     * @private
     */
    _addToHistory(event) {
        this.eventHistory.push(event);

        // Trim history if too large
        if (this.eventHistory.length > this.config.historySize) {
            this.eventHistory.splice(0, this.eventHistory.length - this.config.historySize);
        }
    }

    /**
     * Count active listeners
     * @returns {number} Number of active listeners
     * @private
     */
    _countActiveListeners() {
        let count = 0;
        for (const listeners of this.listeners.values()) {
            count += listeners.length;
        }
        for (const listeners of this.wildcardListeners.values()) {
            count += listeners.length;
        }
        return count;
    }

    /**
     * Format listeners for display
     * @param {Array} listeners - Listeners to format
     * @returns {Array} Formatted listeners
     * @private
     */
    _formatListeners(listeners) {
        return listeners.map(listener => ({
            id: listener.id,
            priority: listener.priority,
            once: listener.once,
            executionCount: listener.executionCount,
            maxExecutions: listener.maxExecutions,
            addedAt: listener.addedAt,
            hasFilter: listener.filter !== null,
            hasTimeout: listener.timeout !== null,
            metadata: listener.metadata
        }));
    }
}

export default EnhancedEventEmitter;

