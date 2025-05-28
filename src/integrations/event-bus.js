/**
 * @fileoverview Event-Driven Communication System
 * @description Event bus for real-time component communication
 */

import EventEmitter from 'events';
import { WebSocketServer } from 'ws';
import http from 'http';

/**
 * Event Bus for event-driven communication between components
 */
export class EventBus extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableWebSocket: true,
            wsPort: process.env.WS_PORT || 8080,
            maxListeners: 100,
            eventHistory: true,
            historyLimit: 1000,
            enablePersistence: false,
            persistenceFile: './events.log',
            enableMetrics: true,
            ...config
        };

        // Set max listeners to avoid warnings
        this.setMaxListeners(this.config.maxListeners);

        this.subscribers = new Map();
        this.eventHistory = [];
        this.eventMetrics = new Map();
        this.wsServer = null;
        this.httpServer = null;
        this.wsConnections = new Set();
        this.isInitialized = false;
        this.eventQueue = [];
        this.processing = false;
    }

    /**
     * Initialize the event bus
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('📡 Initializing Event Bus...');

            // Initialize WebSocket server if enabled
            if (this.config.enableWebSocket) {
                await this._initializeWebSocketServer();
            }

            // Initialize event metrics
            if (this.config.enableMetrics) {
                this._initializeMetrics();
            }

            // Start event processing
            this._startEventProcessing();

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ Event Bus initialized successfully');

        } catch (error) {
            console.error('❌ Event Bus initialization failed:', error);
            throw error;
        }
    }

    /**
     * Subscribe to events
     * @param {string} eventName - Event name (supports wildcards)
     * @param {Function} handler - Event handler function
     * @param {Object} options - Subscription options
     * @returns {string} Subscription ID
     */
    subscribe(eventName, handler, options = {}) {
        if (typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }

        const subscriptionId = this._generateSubscriptionId();
        const subscription = {
            id: subscriptionId,
            eventName,
            handler,
            options: {
                once: false,
                priority: 0,
                filter: null,
                ...options
            },
            subscribedAt: Date.now(),
            callCount: 0,
            lastCalled: null
        };

        // Store subscription
        if (!this.subscribers.has(eventName)) {
            this.subscribers.set(eventName, new Map());
        }
        this.subscribers.get(eventName).set(subscriptionId, subscription);

        // Register with EventEmitter
        if (subscription.options.once) {
            this.once(eventName, handler);
        } else {
            this.on(eventName, handler);
        }

        console.log(`✅ Subscribed to event: ${eventName} (${subscriptionId})`);

        return subscriptionId;
    }

    /**
     * Unsubscribe from events
     * @param {string} subscriptionId - Subscription ID
     */
    unsubscribe(subscriptionId) {
        for (const [eventName, subscribers] of this.subscribers) {
            const subscription = subscribers.get(subscriptionId);
            if (subscription) {
                // Remove from EventEmitter
                this.removeListener(eventName, subscription.handler);
                
                // Remove from subscribers
                subscribers.delete(subscriptionId);
                
                // Clean up empty event maps
                if (subscribers.size === 0) {
                    this.subscribers.delete(eventName);
                }

                console.log(`✅ Unsubscribed from event: ${eventName} (${subscriptionId})`);
                return true;
            }
        }

        console.warn(`⚠️ Subscription not found: ${subscriptionId}`);
        return false;
    }

    /**
     * Emit event to all subscribers
     * @param {string} eventName - Event name
     * @param {any} data - Event data
     * @param {Object} options - Emit options
     */
    async emit(eventName, data = null, options = {}) {
        const event = {
            id: this._generateEventId(),
            name: eventName,
            data,
            timestamp: new Date().toISOString(),
            source: options.source || 'unknown',
            priority: options.priority || 0,
            metadata: options.metadata || {}
        };

        // Add to event queue for processing
        this.eventQueue.push(event);

        // Process immediately if not already processing
        if (!this.processing) {
            await this._processEventQueue();
        }

        return event.id;
    }

    /**
     * Broadcast event to all components (including WebSocket clients)
     * @param {string} eventName - Event name
     * @param {any} data - Event data
     * @param {Object} options - Broadcast options
     */
    async broadcast(eventName, data = null, options = {}) {
        const eventId = await this.emit(eventName, data, options);

        // Broadcast to WebSocket clients
        if (this.config.enableWebSocket && this.wsConnections.size > 0) {
            const message = JSON.stringify({
                type: 'event',
                eventId,
                eventName,
                data,
                timestamp: new Date().toISOString()
            });

            for (const ws of this.wsConnections) {
                if (ws.readyState === ws.OPEN) {
                    try {
                        ws.send(message);
                    } catch (error) {
                        console.error('❌ Failed to send WebSocket message:', error);
                        this.wsConnections.delete(ws);
                    }
                }
            }
        }

        return eventId;
    }

    /**
     * Get event history
     * @param {Object} filters - Optional filters
     * @returns {Array} Event history
     */
    getEventHistory(filters = {}) {
        let history = [...this.eventHistory];

        // Apply filters
        if (filters.eventName) {
            history = history.filter(event => 
                event.name === filters.eventName || 
                event.name.includes(filters.eventName)
            );
        }

        if (filters.source) {
            history = history.filter(event => event.source === filters.source);
        }

        if (filters.since) {
            const sinceTime = new Date(filters.since).getTime();
            history = history.filter(event => 
                new Date(event.timestamp).getTime() >= sinceTime
            );
        }

        if (filters.limit) {
            history = history.slice(-filters.limit);
        }

        return history;
    }

    /**
     * Get event metrics
     * @returns {Object} Event metrics
     */
    getMetrics() {
        const totalEvents = this.eventHistory.length;
        const eventsByName = {};
        const eventsBySource = {};

        for (const event of this.eventHistory) {
            eventsByName[event.name] = (eventsByName[event.name] || 0) + 1;
            eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
        }

        return {
            totalEvents,
            totalSubscribers: Array.from(this.subscribers.values())
                .reduce((sum, subs) => sum + subs.size, 0),
            activeConnections: this.wsConnections.size,
            eventsByName,
            eventsBySource,
            queueSize: this.eventQueue.length,
            processing: this.processing
        };
    }

    /**
     * Get subscription information
     * @returns {Array} List of subscriptions
     */
    getSubscriptions() {
        const subscriptions = [];

        for (const [eventName, subscribers] of this.subscribers) {
            for (const [subscriptionId, subscription] of subscribers) {
                subscriptions.push({
                    id: subscriptionId,
                    eventName,
                    subscribedAt: subscription.subscribedAt,
                    callCount: subscription.callCount,
                    lastCalled: subscription.lastCalled,
                    options: subscription.options
                });
            }
        }

        return subscriptions;
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory.length = 0;
        console.log('🗑️ Event history cleared');
    }

    /**
     * Shutdown the event bus
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        try {
            console.log('🛑 Shutting down Event Bus...');

            // Stop event processing
            this.processing = false;

            // Close WebSocket connections
            for (const ws of this.wsConnections) {
                ws.close();
            }
            this.wsConnections.clear();

            // Close WebSocket server
            if (this.wsServer) {
                this.wsServer.close();
                this.wsServer = null;
            }

            // Close HTTP server
            if (this.httpServer) {
                this.httpServer.close();
                this.httpServer = null;
            }

            // Clear all subscribers
            this.removeAllListeners();
            this.subscribers.clear();

            // Clear event queue and history
            this.eventQueue.length = 0;
            this.eventHistory.length = 0;
            this.eventMetrics.clear();

            this.isInitialized = false;
            this.emit('shutdown');

            console.log('✅ Event Bus shutdown completed');

        } catch (error) {
            console.error('❌ Error during event bus shutdown:', error);
            throw error;
        }
    }

    // Private methods

    /**
     * Initialize WebSocket server
     * @private
     */
    async _initializeWebSocketServer() {
        return new Promise((resolve, reject) => {
            try {
                // Create HTTP server
                this.httpServer = http.createServer();

                // Create WebSocket server
                this.wsServer = new WebSocketServer({ 
                    server: this.httpServer,
                    path: '/events'
                });

                this.wsServer.on('connection', (ws, request) => {
                    console.log('🔌 WebSocket client connected');
                    
                    this.wsConnections.add(ws);

                    // Send welcome message
                    ws.send(JSON.stringify({
                        type: 'welcome',
                        message: 'Connected to Event Bus',
                        timestamp: new Date().toISOString()
                    }));

                    ws.on('close', () => {
                        console.log('🔌 WebSocket client disconnected');
                        this.wsConnections.delete(ws);
                    });

                    ws.on('error', (error) => {
                        console.error('❌ WebSocket error:', error);
                        this.wsConnections.delete(ws);
                    });

                    ws.on('message', (message) => {
                        try {
                            const data = JSON.parse(message.toString());
                            this._handleWebSocketMessage(ws, data);
                        } catch (error) {
                            console.error('❌ Invalid WebSocket message:', error);
                        }
                    });
                });

                this.httpServer.listen(this.config.wsPort, () => {
                    console.log(`🌐 WebSocket server listening on port ${this.config.wsPort}`);
                    resolve();
                });

                this.httpServer.on('error', reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle WebSocket messages
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} data - Message data
     * @private
     */
    _handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'subscribe':
                // TODO: Implement WebSocket event subscription
                break;
            case 'unsubscribe':
                // TODO: Implement WebSocket event unsubscription
                break;
            case 'emit':
                // Allow WebSocket clients to emit events
                this.emit(data.eventName, data.data, {
                    source: 'websocket',
                    metadata: { clientId: ws.id }
                });
                break;
            default:
                console.warn('⚠️ Unknown WebSocket message type:', data.type);
        }
    }

    /**
     * Initialize event metrics
     * @private
     */
    _initializeMetrics() {
        // Track event metrics
        this.on('newListener', (eventName) => {
            if (!this.eventMetrics.has(eventName)) {
                this.eventMetrics.set(eventName, {
                    subscriptions: 0,
                    emissions: 0,
                    lastEmission: null
                });
            }
            this.eventMetrics.get(eventName).subscriptions++;
        });

        this.on('removeListener', (eventName) => {
            const metrics = this.eventMetrics.get(eventName);
            if (metrics) {
                metrics.subscriptions = Math.max(0, metrics.subscriptions - 1);
            }
        });
    }

    /**
     * Start event processing
     * @private
     */
    _startEventProcessing() {
        this.processing = true;
        this._processEventQueue();
    }

    /**
     * Process event queue
     * @private
     */
    async _processEventQueue() {
        if (!this.processing || this.eventQueue.length === 0) {
            return;
        }

        const event = this.eventQueue.shift();
        
        try {
            // Add to history if enabled
            if (this.config.eventHistory) {
                this._addToHistory(event);
            }

            // Update metrics
            if (this.config.enableMetrics) {
                this._updateMetrics(event);
            }

            // Emit to EventEmitter (which will call all registered handlers)
            super.emit(event.name, event.data);

            // Update subscription call counts
            this._updateSubscriptionMetrics(event.name);

        } catch (error) {
            console.error(`❌ Error processing event ${event.name}:`, error);
        }

        // Process next event
        if (this.eventQueue.length > 0) {
            setImmediate(() => this._processEventQueue());
        }
    }

    /**
     * Add event to history
     * @param {Object} event - Event object
     * @private
     */
    _addToHistory(event) {
        this.eventHistory.push(event);

        // Limit history size
        if (this.eventHistory.length > this.config.historyLimit) {
            this.eventHistory.shift();
        }
    }

    /**
     * Update event metrics
     * @param {Object} event - Event object
     * @private
     */
    _updateMetrics(event) {
        const metrics = this.eventMetrics.get(event.name);
        if (metrics) {
            metrics.emissions++;
            metrics.lastEmission = event.timestamp;
        }
    }

    /**
     * Update subscription metrics
     * @param {string} eventName - Event name
     * @private
     */
    _updateSubscriptionMetrics(eventName) {
        const subscribers = this.subscribers.get(eventName);
        if (subscribers) {
            const now = Date.now();
            for (const subscription of subscribers.values()) {
                subscription.callCount++;
                subscription.lastCalled = now;
            }
        }
    }

    /**
     * Generate unique subscription ID
     * @returns {string} Subscription ID
     * @private
     */
    _generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     * @private
     */
    _generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EventBus;

