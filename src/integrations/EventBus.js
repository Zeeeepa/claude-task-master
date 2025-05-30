/**
 * @fileoverview Enhanced Event Bus
 * @description Advanced event-driven communication system with pattern matching and persistence
 */

import EventEmitter from 'events';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs/promises';
import { integrationConfig } from '../config/integrations.js';

/**
 * Enhanced Event Bus for event-driven communication between components
 */
export class EventBus extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.eventBus,
            ...config
        };
        
        // Set max listeners to avoid warnings
        this.setMaxListeners(this.config.maxListeners);
        
        this.subscribers = new Map();
        this.patternSubscribers = new Map();
        this.eventHistory = [];
        this.eventMetrics = new Map();
        this.wsServer = null;
        this.httpServer = null;
        this.wsConnections = new Set();
        this.isInitialized = false;
        this.eventQueue = [];
        this.processing = false;
        
        // Event types registry
        this.eventTypes = new Set([
            'workflow.started',
            'workflow.paused',
            'workflow.completed',
            'workflow.failed',
            'task.created',
            'task.updated',
            'task.completed',
            'task.failed',
            'pr.created',
            'pr.updated',
            'pr.merged',
            'pr.closed',
            'validation.started',
            'validation.completed',
            'validation.failed',
            'error.occurred',
            'integration.connected',
            'integration.disconnected',
            'agent.deployed',
            'agent.stopped',
            'webhook.received',
            'webhook.processed'
        ]);
        
        this.metrics = {
            totalEvents: 0,
            eventsPerSecond: 0,
            lastEventTime: null,
            subscriberCount: 0,
            wsConnectionCount: 0,
            eventTypeDistribution: new Map()
        };
    }
    
    /**
     * Initialize the event bus
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Initialize WebSocket server if enabled
            if (this.config.enableWebSocket) {
                await this.initializeWebSocketServer();
            }
            
            // Load persisted events if enabled
            if (this.config.enablePersistence) {
                await this.loadPersistedEvents();
            }
            
            // Start event processing
            this.startEventProcessing();
            
            this.isInitialized = true;
            this.emit('initialized');
            console.log('Event bus initialized successfully');
        } catch (error) {
            throw new Error(`Failed to initialize event bus: ${error.message}`);
        }
    }
    
    /**
     * Initialize WebSocket server
     */
    async initializeWebSocketServer() {
        try {
            this.httpServer = http.createServer();
            this.wsServer = new WebSocketServer({ server: this.httpServer });
            
            this.wsServer.on('connection', (ws, request) => {
                this.handleWebSocketConnection(ws, request);
            });
            
            this.wsServer.on('error', (error) => {
                console.error('WebSocket server error:', error);
                this.emit('error', error);
            });
            
            this.httpServer.listen(this.config.wsPort, () => {
                console.log(`Event bus WebSocket server listening on port ${this.config.wsPort}`);
            });
        } catch (error) {
            throw new Error(`Failed to initialize WebSocket server: ${error.message}`);
        }
    }
    
    /**
     * Handle WebSocket connection
     */
    handleWebSocketConnection(ws, request) {
        const connectionId = this.generateConnectionId();
        
        ws.connectionId = connectionId;
        this.wsConnections.add(ws);
        this.metrics.wsConnectionCount = this.wsConnections.size;
        
        console.log(`WebSocket client connected: ${connectionId}`);
        
        // Send connection acknowledgment
        ws.send(JSON.stringify({
            type: 'connection',
            connectionId,
            timestamp: new Date().toISOString(),
            eventTypes: Array.from(this.eventTypes)
        }));
        
        ws.on('message', (message) => {
            this.handleWebSocketMessage(ws, message);
        });
        
        ws.on('close', () => {
            this.wsConnections.delete(ws);
            this.metrics.wsConnectionCount = this.wsConnections.size;
            console.log(`WebSocket client disconnected: ${connectionId}`);
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket client error (${connectionId}):`, error);
            this.wsConnections.delete(ws);
            this.metrics.wsConnectionCount = this.wsConnections.size;
        });
        
        this.emit('ws.connection', { connectionId, request });
    }
    
    /**
     * Handle WebSocket message
     */
    handleWebSocketMessage(ws, message) {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'subscribe':
                    this.handleWebSocketSubscribe(ws, data);
                    break;
                case 'unsubscribe':
                    this.handleWebSocketUnsubscribe(ws, data);
                    break;
                case 'emit':
                    this.handleWebSocketEmit(ws, data);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                    break;
                default:
                    console.warn(`Unknown WebSocket message type: ${data.type}`);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }
    
    /**
     * Handle WebSocket subscribe
     */
    handleWebSocketSubscribe(ws, data) {
        const { events, patterns } = data;
        
        if (!ws.subscriptions) {
            ws.subscriptions = new Set();
        }
        
        if (events) {
            for (const event of events) {
                ws.subscriptions.add(event);
            }
        }
        
        if (patterns) {
            if (!ws.patternSubscriptions) {
                ws.patternSubscriptions = new Set();
            }
            for (const pattern of patterns) {
                ws.patternSubscriptions.add(pattern);
            }
        }
        
        ws.send(JSON.stringify({
            type: 'subscribed',
            events: events || [],
            patterns: patterns || [],
            timestamp: new Date().toISOString()
        }));
    }
    
    /**
     * Handle WebSocket unsubscribe
     */
    handleWebSocketUnsubscribe(ws, data) {
        const { events, patterns } = data;
        
        if (events && ws.subscriptions) {
            for (const event of events) {
                ws.subscriptions.delete(event);
            }
        }
        
        if (patterns && ws.patternSubscriptions) {
            for (const pattern of patterns) {
                ws.patternSubscriptions.delete(pattern);
            }
        }
        
        ws.send(JSON.stringify({
            type: 'unsubscribed',
            events: events || [],
            patterns: patterns || [],
            timestamp: new Date().toISOString()
        }));
    }
    
    /**
     * Handle WebSocket emit
     */
    handleWebSocketEmit(ws, data) {
        const { event, eventData } = data;
        
        if (!event) {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Event name is required',
                timestamp: new Date().toISOString()
            }));
            return;
        }
        
        // Emit the event
        this.emit(event, {
            ...eventData,
            source: 'websocket',
            connectionId: ws.connectionId
        });
        
        ws.send(JSON.stringify({
            type: 'emitted',
            event,
            timestamp: new Date().toISOString()
        }));
    }
    
    /**
     * Enhanced emit with metadata
     */
    emit(event, data = {}) {
        const eventData = {
            event,
            data,
            timestamp: new Date().toISOString(),
            id: this.generateEventId(),
            source: data.source || 'internal'
        };
        
        // Add to event queue for processing
        this.eventQueue.push(eventData);
        
        // Process immediately if not already processing
        if (!this.processing) {
            this.processEventQueue();
        }
        
        // Call parent emit
        return super.emit(event, eventData);
    }
    
    /**
     * Process event queue
     */
    async processEventQueue() {
        if (this.processing || this.eventQueue.length === 0) {
            return;
        }
        
        this.processing = true;
        
        try {
            while (this.eventQueue.length > 0) {
                const eventData = this.eventQueue.shift();
                await this.processEvent(eventData);
            }
        } catch (error) {
            console.error('Error processing event queue:', error);
        } finally {
            this.processing = false;
        }
    }
    
    /**
     * Process individual event
     */
    async processEvent(eventData) {
        try {
            // Update metrics
            this.updateEventMetrics(eventData);
            
            // Store in history if enabled
            if (this.config.eventHistory) {
                this.storeEventInHistory(eventData);
            }
            
            // Persist event if enabled
            if (this.config.enablePersistence) {
                await this.persistEvent(eventData);
            }
            
            // Broadcast to WebSocket clients
            this.broadcastToWebSocketClients(eventData);
            
            // Notify pattern subscribers
            this.notifyPatternSubscribers(eventData);
            
        } catch (error) {
            console.error('Error processing event:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Subscribe to events with pattern matching
     */
    subscribe(pattern, handler) {
        if (typeof pattern === 'string' && pattern.includes('*')) {
            // Pattern subscription
            if (!this.patternSubscribers.has(pattern)) {
                this.patternSubscribers.set(pattern, new Set());
            }
            this.patternSubscribers.get(pattern).add(handler);
            
            this.metrics.subscriberCount++;
            
            return () => {
                const handlers = this.patternSubscribers.get(pattern);
                if (handlers) {
                    handlers.delete(handler);
                    if (handlers.size === 0) {
                        this.patternSubscribers.delete(pattern);
                    }
                }
                this.metrics.subscriberCount--;
            };
        } else {
            // Regular subscription
            this.on(pattern, handler);
            this.metrics.subscriberCount++;
            
            return () => {
                this.off(pattern, handler);
                this.metrics.subscriberCount--;
            };
        }
    }
    
    /**
     * Broadcast event to all components
     */
    broadcast(event, data) {
        const broadcastData = {
            ...data,
            broadcast: true,
            timestamp: new Date().toISOString()
        };
        
        this.emit(event, broadcastData);
        
        // Also emit a generic broadcast event
        this.emit('broadcast', {
            event,
            data: broadcastData
        });
    }
    
    /**
     * Notify pattern subscribers
     */
    notifyPatternSubscribers(eventData) {
        for (const [pattern, handlers] of this.patternSubscribers.entries()) {
            if (this.matchesPattern(eventData.event, pattern)) {
                for (const handler of handlers) {
                    try {
                        handler(eventData);
                    } catch (error) {
                        console.error(`Error in pattern subscriber (${pattern}):`, error);
                    }
                }
            }
        }
    }
    
    /**
     * Check if event matches pattern
     */
    matchesPattern(event, pattern) {
        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(event);
    }
    
    /**
     * Broadcast to WebSocket clients
     */
    broadcastToWebSocketClients(eventData) {
        if (!this.wsServer || this.wsConnections.size === 0) {
            return;
        }
        
        const message = JSON.stringify({
            type: 'event',
            ...eventData
        });
        
        for (const ws of this.wsConnections) {
            if (ws.readyState === ws.OPEN) {
                // Check if client is subscribed to this event
                const isSubscribed = this.isClientSubscribed(ws, eventData.event);
                
                if (isSubscribed) {
                    try {
                        ws.send(message);
                    } catch (error) {
                        console.error('Error sending WebSocket message:', error);
                        this.wsConnections.delete(ws);
                    }
                }
            } else {
                this.wsConnections.delete(ws);
            }
        }
        
        this.metrics.wsConnectionCount = this.wsConnections.size;
    }
    
    /**
     * Check if WebSocket client is subscribed to event
     */
    isClientSubscribed(ws, event) {
        // Check direct subscriptions
        if (ws.subscriptions && ws.subscriptions.has(event)) {
            return true;
        }
        
        // Check pattern subscriptions
        if (ws.patternSubscriptions) {
            for (const pattern of ws.patternSubscriptions) {
                if (this.matchesPattern(event, pattern)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Store event in history
     */
    storeEventInHistory(eventData) {
        this.eventHistory.push(eventData);
        
        // Keep only the last N events
        if (this.eventHistory.length > this.config.historyLimit) {
            this.eventHistory = this.eventHistory.slice(-this.config.historyLimit);
        }
    }
    
    /**
     * Persist event to file
     */
    async persistEvent(eventData) {
        try {
            const logEntry = JSON.stringify(eventData) + '\\n';
            await fs.appendFile(this.config.persistenceFile, logEntry);
        } catch (error) {
            console.error('Error persisting event:', error);
        }
    }
    
    /**
     * Load persisted events
     */
    async loadPersistedEvents() {
        try {
            const data = await fs.readFile(this.config.persistenceFile, 'utf8');
            const lines = data.trim().split('\\n');
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const eventData = JSON.parse(line);
                        this.eventHistory.push(eventData);
                    } catch (error) {
                        console.warn('Error parsing persisted event:', error);
                    }
                }
            }
            
            // Keep only the last N events
            if (this.eventHistory.length > this.config.historyLimit) {
                this.eventHistory = this.eventHistory.slice(-this.config.historyLimit);
            }
            
            console.log(`Loaded ${this.eventHistory.length} persisted events`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading persisted events:', error);
            }
        }
    }
    
    /**
     * Start event processing
     */
    startEventProcessing() {
        // Process event queue periodically
        setInterval(() => {
            if (!this.processing && this.eventQueue.length > 0) {
                this.processEventQueue();
            }
        }, 100);
        
        // Update events per second metric
        setInterval(() => {
            this.updateEventsPerSecond();
        }, 1000);
    }
    
    /**
     * Update event metrics
     */
    updateEventMetrics(eventData) {
        this.metrics.totalEvents++;
        this.metrics.lastEventTime = Date.now();
        
        // Update event type distribution
        const eventType = eventData.event;
        const currentCount = this.metrics.eventTypeDistribution.get(eventType) || 0;
        this.metrics.eventTypeDistribution.set(eventType, currentCount + 1);
    }
    
    /**
     * Update events per second metric
     */
    updateEventsPerSecond() {
        const now = Date.now();
        const oneSecondAgo = now - 1000;
        
        const recentEvents = this.eventHistory.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            return eventTime > oneSecondAgo;
        });
        
        this.metrics.eventsPerSecond = recentEvents.length;
    }
    
    /**
     * Generate connection ID
     */
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get event history
     */
    getEventHistory(limit = 100) {
        return this.eventHistory.slice(-limit);
    }
    
    /**
     * Get event metrics
     */
    getEventMetrics() {
        return {
            ...this.metrics,
            eventTypeDistribution: Object.fromEntries(this.metrics.eventTypeDistribution),
            patternSubscribers: this.patternSubscribers.size,
            regularSubscribers: this.listenerCount(),
            eventHistorySize: this.eventHistory.length
        };
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            service: 'event-bus',
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            initialized: this.isInitialized,
            wsServerRunning: !!this.wsServer,
            wsPort: this.config.wsPort,
            metrics: this.getEventMetrics(),
            config: {
                enableWebSocket: this.config.enableWebSocket,
                enablePersistence: this.config.enablePersistence,
                eventHistory: this.config.eventHistory,
                historyLimit: this.config.historyLimit
            }
        };
    }
    
    /**
     * Clear event history
     */
    clearEventHistory() {
        this.eventHistory = [];
        this.emit('history.cleared');
    }
    
    /**
     * Shutdown event bus
     */
    async shutdown() {
        try {
            // Close WebSocket server
            if (this.wsServer) {
                this.wsServer.close();
            }
            
            if (this.httpServer) {
                this.httpServer.close();
            }
            
            // Close all WebSocket connections
            for (const ws of this.wsConnections) {
                ws.close();
            }
            
            this.isInitialized = false;
            this.emit('shutdown');
            
            console.log('Event bus shutdown completed');
        } catch (error) {
            console.error('Error during event bus shutdown:', error);
            throw error;
        }
    }
}

export default EventBus;

