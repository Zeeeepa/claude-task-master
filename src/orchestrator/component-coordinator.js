/**
 * @fileoverview Component Coordinator - Inter-component communication
 * @description Manages communication between all system components using message queues
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../scripts/modules/utils.js';

/**
 * Message types
 */
export const MessageType = {
    REQUEST: 'request',
    RESPONSE: 'response',
    EVENT: 'event',
    HEARTBEAT: 'heartbeat',
    ERROR: 'error'
};

/**
 * Component states
 */
export const ComponentState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
};

/**
 * Component Coordinator - Manages inter-component communication
 */
export class ComponentCoordinator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            messageTimeout: config.messageTimeout || 30000, // 30 seconds
            heartbeatInterval: config.heartbeatInterval || 15000, // 15 seconds
            maxRetryAttempts: config.maxRetryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            enableHeartbeat: config.enableHeartbeat !== false,
            enableMessageQueue: config.enableMessageQueue !== false,
            maxQueueSize: config.maxQueueSize || 1000,
            ...config
        };

        this.components = new Map();
        this.messageQueue = new Map();
        this.pendingMessages = new Map();
        this.messageHandlers = new Map();
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.heartbeatTimer = null;

        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            messagesQueued: 0,
            messagesFailed: 0,
            componentsConnected: 0,
            componentsDisconnected: 0,
            heartbeatsSent: 0,
            heartbeatsReceived: 0
        };

        // Setup default message handlers
        this._setupDefaultHandlers();
    }

    /**
     * Initialize the Component Coordinator
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Component Coordinator already initialized');
            return;
        }

        try {
            log('info', 'Initializing Component Coordinator...');

            // Initialize message queue system
            if (this.config.enableMessageQueue) {
                await this._initializeMessageQueue();
            }

            // Start heartbeat monitoring
            if (this.config.enableHeartbeat) {
                this._startHeartbeat();
            }

            this.isInitialized = true;
            this.emit('initialized');

            log('info', 'Component Coordinator initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Component Coordinator:', error);
            throw error;
        }
    }

    /**
     * Register a component
     * @param {string} componentId - Component identifier
     * @param {Object} componentInfo - Component information
     * @returns {Promise<void>}
     */
    async registerComponent(componentId, componentInfo = {}) {
        this._ensureInitialized();

        try {
            log('info', `Registering component: ${componentId}`);

            const component = {
                id: componentId,
                name: componentInfo.name || componentId,
                type: componentInfo.type || 'unknown',
                version: componentInfo.version || '1.0.0',
                capabilities: componentInfo.capabilities || [],
                state: ComponentState.CONNECTING,
                registeredAt: new Date().toISOString(),
                lastHeartbeat: new Date().toISOString(),
                messageCount: 0,
                errorCount: 0,
                metadata: componentInfo.metadata || {}
            };

            this.components.set(componentId, component);

            // Initialize message queue for component
            if (this.config.enableMessageQueue) {
                this.messageQueue.set(componentId, []);
            }

            // Mark as connected
            await this._setComponentState(componentId, ComponentState.CONNECTED);

            this.metrics.componentsConnected++;
            this.emit('componentRegistered', { componentId, component });

            log('info', `Component registered successfully: ${componentId}`);

        } catch (error) {
            log('error', `Failed to register component ${componentId}:`, error);
            throw error;
        }
    }

    /**
     * Unregister a component
     * @param {string} componentId - Component identifier
     * @returns {Promise<void>}
     */
    async unregisterComponent(componentId) {
        this._ensureInitialized();

        const component = this.components.get(componentId);
        if (!component) {
            log('warn', `Component not found for unregistration: ${componentId}`);
            return;
        }

        try {
            log('info', `Unregistering component: ${componentId}`);

            // Set state to disconnected
            await this._setComponentState(componentId, ComponentState.DISCONNECTED);

            // Clean up pending messages
            this._cleanupPendingMessages(componentId);

            // Remove from collections
            this.components.delete(componentId);
            this.messageQueue.delete(componentId);

            this.metrics.componentsDisconnected++;
            this.emit('componentUnregistered', { componentId, component });

            log('info', `Component unregistered successfully: ${componentId}`);

        } catch (error) {
            log('error', `Failed to unregister component ${componentId}:`, error);
            throw error;
        }
    }

    /**
     * Send a message to a component
     * @param {string} componentId - Target component ID
     * @param {Object} message - Message to send
     * @param {Object} options - Send options
     * @returns {Promise<Object>} Response from component
     */
    async sendMessage(componentId, message, options = {}) {
        this._ensureInitialized();

        const component = this.components.get(componentId);
        if (!component) {
            throw new Error(`Component not found: ${componentId}`);
        }

        if (component.state !== ComponentState.CONNECTED) {
            throw new Error(`Component ${componentId} is not connected: ${component.state}`);
        }

        try {
            const messageId = uuidv4();
            const fullMessage = {
                id: messageId,
                type: message.type || MessageType.REQUEST,
                from: options.from || 'orchestrator',
                to: componentId,
                payload: message.payload || message,
                timestamp: new Date().toISOString(),
                timeout: options.timeout || this.config.messageTimeout,
                retryCount: 0,
                correlationId: options.correlationId || messageId
            };

            log('debug', `Sending message to ${componentId}:`, fullMessage.type);

            // Send message based on type
            if (fullMessage.type === MessageType.REQUEST) {
                return await this._sendRequest(componentId, fullMessage, options);
            } else {
                await this._sendEvent(componentId, fullMessage);
                return { success: true, messageId };
            }

        } catch (error) {
            this.metrics.messagesFailed++;
            log('error', `Failed to send message to ${componentId}:`, error);
            throw error;
        }
    }

    /**
     * Broadcast a message to all components
     * @param {Object} message - Message to broadcast
     * @param {Object} options - Broadcast options
     * @returns {Promise<Array>} Responses from components
     */
    async broadcastMessage(message, options = {}) {
        this._ensureInitialized();

        const connectedComponents = Array.from(this.components.values())
            .filter(component => component.state === ComponentState.CONNECTED);

        if (connectedComponents.length === 0) {
            log('warn', 'No connected components to broadcast to');
            return [];
        }

        try {
            log('debug', `Broadcasting message to ${connectedComponents.length} components`);

            const promises = connectedComponents.map(component => 
                this.sendMessage(component.id, message, options)
                    .catch(error => ({ error: error.message, componentId: component.id }))
            );

            const responses = await Promise.all(promises);
            
            log('debug', `Broadcast completed with ${responses.length} responses`);
            return responses;

        } catch (error) {
            log('error', 'Failed to broadcast message:', error);
            throw error;
        }
    }

    /**
     * Register a message handler
     * @param {string} messageType - Message type to handle
     * @param {Function} handler - Handler function
     */
    registerMessageHandler(messageType, handler) {
        this._ensureInitialized();

        if (!this.messageHandlers.has(messageType)) {
            this.messageHandlers.set(messageType, []);
        }

        this.messageHandlers.get(messageType).push(handler);
        log('debug', `Message handler registered for type: ${messageType}`);
    }

    /**
     * Unregister a message handler
     * @param {string} messageType - Message type
     * @param {Function} handler - Handler function to remove
     */
    unregisterMessageHandler(messageType, handler) {
        const handlers = this.messageHandlers.get(messageType);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
                log('debug', `Message handler unregistered for type: ${messageType}`);
            }
        }
    }

    /**
     * Process incoming message
     * @param {Object} message - Incoming message
     * @returns {Promise<Object>} Response
     */
    async processMessage(message) {
        this._ensureInitialized();

        try {
            log('debug', `Processing incoming message:`, message.type);

            this.metrics.messagesReceived++;

            // Update component heartbeat
            if (message.from && this.components.has(message.from)) {
                const component = this.components.get(message.from);
                component.lastHeartbeat = new Date().toISOString();
                component.messageCount++;
            }

            // Handle different message types
            switch (message.type) {
                case MessageType.RESPONSE:
                    return await this._handleResponse(message);
                case MessageType.HEARTBEAT:
                    return await this._handleHeartbeat(message);
                case MessageType.ERROR:
                    return await this._handleError(message);
                default:
                    return await this._handleCustomMessage(message);
            }

        } catch (error) {
            log('error', 'Failed to process message:', error);
            throw error;
        }
    }

    /**
     * Get component status
     * @param {string} componentId - Component ID
     * @returns {Object} Component status
     */
    getComponentStatus(componentId) {
        const component = this.components.get(componentId);
        if (!component) {
            return null;
        }

        return {
            id: component.id,
            name: component.name,
            type: component.type,
            state: component.state,
            registeredAt: component.registeredAt,
            lastHeartbeat: component.lastHeartbeat,
            messageCount: component.messageCount,
            errorCount: component.errorCount,
            queueSize: this.messageQueue.get(componentId)?.length || 0
        };
    }

    /**
     * Get all components status
     * @returns {Array} All components status
     */
    getAllComponentsStatus() {
        return Array.from(this.components.keys()).map(componentId => 
            this.getComponentStatus(componentId)
        );
    }

    /**
     * Reconnect a component
     * @param {string} componentId - Component ID
     * @returns {Promise<void>}
     */
    async reconnectComponent(componentId) {
        this._ensureInitialized();

        const component = this.components.get(componentId);
        if (!component) {
            throw new Error(`Component not found: ${componentId}`);
        }

        try {
            log('info', `Reconnecting component: ${componentId}`);

            await this._setComponentState(componentId, ComponentState.CONNECTING);

            // Attempt to send heartbeat
            await this.sendMessage(componentId, {
                type: MessageType.HEARTBEAT,
                payload: { timestamp: new Date().toISOString() }
            }, { timeout: 5000 });

            await this._setComponentState(componentId, ComponentState.CONNECTED);

            log('info', `Component reconnected successfully: ${componentId}`);

        } catch (error) {
            await this._setComponentState(componentId, ComponentState.ERROR);
            log('error', `Failed to reconnect component ${componentId}:`, error);
            throw error;
        }
    }

    /**
     * Get coordinator status
     * @returns {Object} Coordinator status
     */
    getStatus() {
        const connectedComponents = Array.from(this.components.values())
            .filter(component => component.state === ComponentState.CONNECTED).length;

        return {
            initialized: this.isInitialized,
            shuttingDown: this.isShuttingDown,
            healthy: this.isInitialized && !this.isShuttingDown,
            totalComponents: this.components.size,
            connectedComponents,
            queuedMessages: Array.from(this.messageQueue.values())
                .reduce((total, queue) => total + queue.length, 0),
            pendingMessages: this.pendingMessages.size,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Shutdown the Component Coordinator
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        try {
            log('info', 'Shutting down Component Coordinator...');
            this.isShuttingDown = true;

            // Stop heartbeat
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            // Unregister all components
            const componentIds = Array.from(this.components.keys());
            for (const componentId of componentIds) {
                try {
                    await this.unregisterComponent(componentId);
                } catch (error) {
                    log('warn', `Failed to unregister component ${componentId} during shutdown:`, error);
                }
            }

            this.emit('shutdown');
            log('info', 'Component Coordinator shutdown complete');

        } catch (error) {
            log('error', 'Error during Component Coordinator shutdown:', error);
            throw error;
        }
    }

    /**
     * Send a request message
     * @param {string} componentId - Target component ID
     * @param {Object} message - Message to send
     * @param {Object} options - Send options
     * @returns {Promise<Object>} Response
     * @private
     */
    async _sendRequest(componentId, message, options) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingMessages.delete(message.id);
                reject(new Error(`Message timeout: ${message.id}`));
            }, message.timeout);

            // Store pending message
            this.pendingMessages.set(message.id, {
                resolve,
                reject,
                timeout,
                message,
                componentId
            });

            // Send message
            this._deliverMessage(componentId, message)
                .catch(error => {
                    clearTimeout(timeout);
                    this.pendingMessages.delete(message.id);
                    reject(error);
                });
        });
    }

    /**
     * Send an event message
     * @param {string} componentId - Target component ID
     * @param {Object} message - Message to send
     * @private
     */
    async _sendEvent(componentId, message) {
        await this._deliverMessage(componentId, message);
    }

    /**
     * Deliver a message to a component
     * @param {string} componentId - Target component ID
     * @param {Object} message - Message to deliver
     * @private
     */
    async _deliverMessage(componentId, message) {
        const component = this.components.get(componentId);
        
        if (this.config.enableMessageQueue && component.state !== ComponentState.CONNECTED) {
            // Queue message if component is not connected
            const queue = this.messageQueue.get(componentId) || [];
            if (queue.length < this.config.maxQueueSize) {
                queue.push(message);
                this.metrics.messagesQueued++;
                log('debug', `Message queued for ${componentId}: ${message.id}`);
            } else {
                throw new Error(`Message queue full for component: ${componentId}`);
            }
        } else {
            // Deliver message immediately
            this.emit('messageToComponent', { componentId, message });
            this.metrics.messagesSent++;
            log('debug', `Message delivered to ${componentId}: ${message.id}`);
        }
    }

    /**
     * Handle response message
     * @param {Object} message - Response message
     * @private
     */
    async _handleResponse(message) {
        const pending = this.pendingMessages.get(message.correlationId);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingMessages.delete(message.correlationId);
            pending.resolve(message.payload);
        } else {
            log('warn', `Received response for unknown message: ${message.correlationId}`);
        }
    }

    /**
     * Handle heartbeat message
     * @param {Object} message - Heartbeat message
     * @private
     */
    async _handleHeartbeat(message) {
        this.metrics.heartbeatsReceived++;
        
        if (message.from && this.components.has(message.from)) {
            const component = this.components.get(message.from);
            component.lastHeartbeat = new Date().toISOString();
            
            if (component.state !== ComponentState.CONNECTED) {
                await this._setComponentState(message.from, ComponentState.CONNECTED);
            }
        }

        return { success: true, timestamp: new Date().toISOString() };
    }

    /**
     * Handle error message
     * @param {Object} message - Error message
     * @private
     */
    async _handleError(message) {
        if (message.from && this.components.has(message.from)) {
            const component = this.components.get(message.from);
            component.errorCount++;
            
            await this._setComponentState(message.from, ComponentState.ERROR);
        }

        this.emit('componentError', { componentId: message.from, error: message.payload });
        return { success: true };
    }

    /**
     * Handle custom message
     * @param {Object} message - Custom message
     * @private
     */
    async _handleCustomMessage(message) {
        const handlers = this.messageHandlers.get(message.type) || [];
        
        if (handlers.length === 0) {
            log('warn', `No handlers registered for message type: ${message.type}`);
            return { success: false, error: 'No handlers available' };
        }

        try {
            const results = await Promise.all(
                handlers.map(handler => handler(message))
            );
            return { success: true, results };
        } catch (error) {
            log('error', `Error handling message type ${message.type}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Set component state
     * @param {string} componentId - Component ID
     * @param {string} state - New state
     * @private
     */
    async _setComponentState(componentId, state) {
        const component = this.components.get(componentId);
        if (component) {
            const oldState = component.state;
            component.state = state;
            
            this.emit('componentStateChanged', { 
                componentId, 
                oldState, 
                newState: state, 
                component 
            });

            // Process queued messages if component is now connected
            if (state === ComponentState.CONNECTED && this.config.enableMessageQueue) {
                await this._processQueuedMessages(componentId);
            }
        }
    }

    /**
     * Process queued messages for a component
     * @param {string} componentId - Component ID
     * @private
     */
    async _processQueuedMessages(componentId) {
        const queue = this.messageQueue.get(componentId);
        if (!queue || queue.length === 0) {
            return;
        }

        log('debug', `Processing ${queue.length} queued messages for ${componentId}`);

        while (queue.length > 0) {
            const message = queue.shift();
            try {
                await this._deliverMessage(componentId, message);
            } catch (error) {
                log('error', `Failed to deliver queued message to ${componentId}:`, error);
                // Re-queue message or handle error based on policy
                queue.unshift(message);
                break;
            }
        }
    }

    /**
     * Clean up pending messages for a component
     * @param {string} componentId - Component ID
     * @private
     */
    _cleanupPendingMessages(componentId) {
        for (const [messageId, pending] of this.pendingMessages.entries()) {
            if (pending.componentId === componentId) {
                clearTimeout(pending.timeout);
                pending.reject(new Error(`Component disconnected: ${componentId}`));
                this.pendingMessages.delete(messageId);
            }
        }
    }

    /**
     * Start heartbeat monitoring
     * @private
     */
    _startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this._sendHeartbeats();
        }, this.config.heartbeatInterval);

        log('debug', 'Heartbeat monitoring started');
    }

    /**
     * Send heartbeats to all connected components
     * @private
     */
    async _sendHeartbeats() {
        const connectedComponents = Array.from(this.components.values())
            .filter(component => component.state === ComponentState.CONNECTED);

        for (const component of connectedComponents) {
            try {
                await this.sendMessage(component.id, {
                    type: MessageType.HEARTBEAT,
                    payload: { timestamp: new Date().toISOString() }
                }, { timeout: 5000 });

                this.metrics.heartbeatsSent++;

            } catch (error) {
                log('warn', `Heartbeat failed for component ${component.id}:`, error);
                await this._setComponentState(component.id, ComponentState.ERROR);
            }
        }
    }

    /**
     * Initialize message queue system
     * @private
     */
    async _initializeMessageQueue() {
        // Initialize message queue infrastructure
        log('debug', 'Message queue system initialized');
    }

    /**
     * Setup default message handlers
     * @private
     */
    _setupDefaultHandlers() {
        // Register default handlers for system messages
        this.registerMessageHandler('ping', async (message) => {
            return { pong: true, timestamp: new Date().toISOString() };
        });

        this.registerMessageHandler('status', async (message) => {
            return this.getStatus();
        });
    }

    /**
     * Ensure the coordinator is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Component Coordinator not initialized');
        }

        if (this.isShuttingDown) {
            throw new Error('Component Coordinator is shutting down');
        }
    }
}

export default ComponentCoordinator;

