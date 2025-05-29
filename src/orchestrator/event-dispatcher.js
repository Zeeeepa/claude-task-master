/**
 * Event Dispatcher
 * Event routing and handling component for Task Master orchestrator
 * 
 * Manages event flow between different system components, handles event
 * persistence, and ensures proper event delivery and processing.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * EventDispatcher class for managing system-wide event flow
 * @extends EventEmitter
 */
export class EventDispatcher extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            maxListeners: 100,
            eventRetention: 1000, // Keep last 1000 events
            persistEvents: true,
            ...options
        };
        this.eventHistory = [];
        this.eventHandlers = new Map();
        this.isActive = false;
    }

    /**
     * Initialize the event dispatcher
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            logger.info('Initializing event dispatcher...');
            
            // Set max listeners to prevent memory leaks
            this.setMaxListeners(this.options.maxListeners);
            
            // Setup event persistence if enabled
            if (this.options.persistEvents) {
                await this._setupEventPersistence();
            }
            
            // Register core event handlers
            this._registerCoreHandlers();
            
            this.isActive = true;
            this.emit('initialized');
            logger.info('Event dispatcher initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize event dispatcher:', error);
            throw error;
        }
    }

    /**
     * Shutdown the event dispatcher
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            logger.info('Shutting down event dispatcher...');
            this.isActive = false;
            
            // Flush any pending events
            await this._flushPendingEvents();
            
            // Clear event handlers
            this.eventHandlers.clear();
            this.removeAllListeners();
            
            this.emit('shutdown');
            logger.info('Event dispatcher shutdown complete');
        } catch (error) {
            logger.error('Error during event dispatcher shutdown:', error);
            throw error;
        }
    }

    /**
     * Dispatch an event through the system
     * @param {string} eventType - Type of event
     * @param {Object} eventData - Event payload
     * @param {Object} options - Dispatch options
     * @returns {Promise<void>}
     */
    async dispatchEvent(eventType, eventData, options = {}) {
        try {
            const event = this._createEvent(eventType, eventData, options);
            
            logger.debug(`Dispatching event: ${eventType}`, { eventId: event.id });
            
            // Store event in history if enabled
            if (this.options.persistEvents) {
                this._storeEvent(event);
            }
            
            // Emit the event
            this.emit(eventType, event);
            this.emit('*', event); // Global event listener
            
            // Handle event routing
            await this._routeEvent(event);
            
            logger.debug(`Event dispatched successfully: ${eventType}`, { eventId: event.id });
        } catch (error) {
            logger.error(`Failed to dispatch event ${eventType}:`, error);
            throw error;
        }
    }

    /**
     * Register an event handler
     * @param {string} eventType - Type of event to handle
     * @param {Function} handler - Handler function
     * @param {Object} options - Handler options
     */
    registerHandler(eventType, handler, options = {}) {
        const handlerInfo = {
            handler,
            priority: options.priority || 0,
            once: options.once || false,
            filter: options.filter || null
        };
        
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        
        this.eventHandlers.get(eventType).push(handlerInfo);
        
        // Sort handlers by priority (higher priority first)
        this.eventHandlers.get(eventType).sort((a, b) => b.priority - a.priority);
        
        logger.debug(`Registered handler for event type: ${eventType}`);
    }

    /**
     * Unregister an event handler
     * @param {string} eventType - Type of event
     * @param {Function} handler - Handler function to remove
     */
    unregisterHandler(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.findIndex(h => h.handler === handler);
            
            if (index !== -1) {
                handlers.splice(index, 1);
                logger.debug(`Unregistered handler for event type: ${eventType}`);
            }
        }
    }

    /**
     * Get event history
     * @param {Object} filters - Filters to apply
     * @returns {Array} Filtered event history
     */
    getEventHistory(filters = {}) {
        let events = [...this.eventHistory];
        
        if (filters.type) {
            events = events.filter(event => event.type === filters.type);
        }
        
        if (filters.since) {
            events = events.filter(event => event.timestamp >= filters.since);
        }
        
        if (filters.limit) {
            events = events.slice(-filters.limit);
        }
        
        return events;
    }

    /**
     * Get dispatcher status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isActive: this.isActive,
            eventHandlers: this.eventHandlers.size,
            eventHistory: this.eventHistory.length,
            maxListeners: this.getMaxListeners(),
            listenerCount: this.eventNames().reduce((count, name) => count + this.listenerCount(name), 0)
        };
    }

    /**
     * Create a standardized event object
     * @param {string} eventType - Type of event
     * @param {Object} eventData - Event payload
     * @param {Object} options - Event options
     * @returns {Object} Standardized event object
     * @private
     */
    _createEvent(eventType, eventData, options) {
        return {
            id: this._generateEventId(),
            type: eventType,
            data: eventData,
            timestamp: new Date(),
            source: options.source || 'system',
            priority: options.priority || 'normal',
            metadata: options.metadata || {}
        };
    }

    /**
     * Store event in history
     * @param {Object} event - Event to store
     * @private
     */
    _storeEvent(event) {
        this.eventHistory.push(event);
        
        // Maintain event retention limit
        if (this.eventHistory.length > this.options.eventRetention) {
            this.eventHistory.shift();
        }
    }

    /**
     * Route event to appropriate handlers
     * @param {Object} event - Event to route
     * @private
     */
    async _routeEvent(event) {
        const handlers = this.eventHandlers.get(event.type) || [];
        
        for (const handlerInfo of handlers) {
            try {
                // Apply filter if specified
                if (handlerInfo.filter && !handlerInfo.filter(event)) {
                    continue;
                }
                
                // Execute handler
                await handlerInfo.handler(event);
                
                // Remove handler if it's a one-time handler
                if (handlerInfo.once) {
                    this.unregisterHandler(event.type, handlerInfo.handler);
                }
            } catch (error) {
                logger.error(`Event handler failed for ${event.type}:`, error);
                // Continue processing other handlers
            }
        }
    }

    /**
     * Register core system event handlers
     * @private
     */
    _registerCoreHandlers() {
        // System lifecycle events
        this.registerHandler('system.start', this._handleSystemStart.bind(this));
        this.registerHandler('system.stop', this._handleSystemStop.bind(this));
        
        // Task events
        this.registerHandler('task.created', this._handleTaskCreated.bind(this));
        this.registerHandler('task.completed', this._handleTaskCompleted.bind(this));
        this.registerHandler('task.failed', this._handleTaskFailed.bind(this));
        
        // Agent events
        this.registerHandler('agent.connected', this._handleAgentConnected.bind(this));
        this.registerHandler('agent.disconnected', this._handleAgentDisconnected.bind(this));
        
        // Integration events
        this.registerHandler('linear.issue.updated', this._handleLinearIssueUpdated.bind(this));
        this.registerHandler('github.pr.created', this._handleGitHubPRCreated.bind(this));
        
        logger.debug('Core event handlers registered');
    }

    /**
     * Setup event persistence
     * @private
     */
    async _setupEventPersistence() {
        logger.debug('Setting up event persistence');
        // Implementation for event persistence to database
    }

    /**
     * Flush pending events
     * @private
     */
    async _flushPendingEvents() {
        logger.debug('Flushing pending events');
        // Implementation for flushing any pending events
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     * @private
     */
    _generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Core event handlers
    async _handleSystemStart(event) {
        logger.info('System start event received');
    }

    async _handleSystemStop(event) {
        logger.info('System stop event received');
    }

    async _handleTaskCreated(event) {
        logger.debug(`Task created: ${event.data.taskId}`);
    }

    async _handleTaskCompleted(event) {
        logger.debug(`Task completed: ${event.data.taskId}`);
    }

    async _handleTaskFailed(event) {
        logger.warn(`Task failed: ${event.data.taskId}`, event.data.error);
    }

    async _handleAgentConnected(event) {
        logger.info(`Agent connected: ${event.data.agentType}`);
    }

    async _handleAgentDisconnected(event) {
        logger.warn(`Agent disconnected: ${event.data.agentType}`);
    }

    async _handleLinearIssueUpdated(event) {
        logger.debug(`Linear issue updated: ${event.data.issueId}`);
    }

    async _handleGitHubPRCreated(event) {
        logger.debug(`GitHub PR created: ${event.data.prNumber}`);
    }
}

export default EventDispatcher;

