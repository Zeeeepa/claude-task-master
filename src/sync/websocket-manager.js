/**
 * @fileoverview WebSocket Connection Management
 * @description Manages WebSocket connections for real-time status updates and live monitoring
 */

import EventEmitter from 'events';
import { WebSocketServer } from 'ws';
import http from 'http';
import { performance } from 'perf_hooks';

/**
 * WebSocket Manager for real-time communication
 */
export class WebSocketManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Server settings
            port: process.env.WS_PORT || 8080,
            host: process.env.WS_HOST || 'localhost',
            
            // Connection settings
            maxConnections: 1000,
            connectionTimeout: 30000, // 30 seconds
            heartbeatInterval: 30000, // 30 seconds
            
            // Message settings
            maxMessageSize: 1024 * 1024, // 1MB
            enableCompression: true,
            enableBinaryMessages: false,
            
            // Authentication
            enableAuth: true,
            authTimeout: 10000, // 10 seconds
            
            // Rate limiting
            enableRateLimit: true,
            rateLimit: {
                windowMs: 60000, // 1 minute
                maxRequests: 100
            },
            
            // Monitoring
            enableMetrics: true,
            enableLogging: true,
            
            ...config
        };

        // Server instances
        this.httpServer = null;
        this.wsServer = null;
        
        // Connection management
        this.connections = new Map();
        this.connectionsByRoom = new Map();
        this.authenticatedConnections = new Set();
        
        // Rate limiting
        this.rateLimitMap = new Map();
        
        // Metrics
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            messagesSent: 0,
            messagesReceived: 0,
            bytesTransferred: 0,
            errors: 0,
            authFailures: 0,
            rateLimitHits: 0,
            averageResponseTime: 0,
            uptime: 0,
            startTime: null
        };
        
        // State
        this.isInitialized = false;
        this.isRunning = false;
        
        // Heartbeat tracking
        this.heartbeatInterval = null;
        this.heartbeatTimeouts = new Map();
    }

    /**
     * Initialize WebSocket manager
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🔄 Initializing WebSocket Manager...');

            // Create HTTP server
            this.httpServer = http.createServer();
            
            // Create WebSocket server
            this.wsServer = new WebSocketServer({
                server: this.httpServer,
                maxPayload: this.config.maxMessageSize,
                perMessageDeflate: this.config.enableCompression
            });

            // Setup event handlers
            this._setupEventHandlers();

            // Initialize metrics
            if (this.config.enableMetrics) {
                this._initializeMetrics();
            }

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ WebSocket Manager initialized successfully');

        } catch (error) {
            console.error('❌ WebSocket Manager initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start WebSocket server
     */
    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                console.log(`🚀 Starting WebSocket server on ${this.config.host}:${this.config.port}...`);

                this.httpServer.listen(this.config.port, this.config.host, () => {
                    this.isRunning = true;
                    this.metrics.startTime = Date.now();
                    
                    // Start heartbeat
                    this._startHeartbeat();
                    
                    this.emit('started');
                    console.log(`✅ WebSocket server started on ws://${this.config.host}:${this.config.port}`);
                    
                    resolve();
                });

                this.httpServer.on('error', (error) => {
                    console.error('❌ HTTP server error:', error);
                    reject(error);
                });

            } catch (error) {
                console.error('❌ Failed to start WebSocket server:', error);
                reject(error);
            }
        });
    }

    /**
     * Stop WebSocket server
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        return new Promise((resolve) => {
            try {
                console.log('🛑 Stopping WebSocket server...');

                // Stop heartbeat
                this._stopHeartbeat();

                // Close all connections
                this._closeAllConnections();

                // Close WebSocket server
                this.wsServer.close(() => {
                    // Close HTTP server
                    this.httpServer.close(() => {
                        this.isRunning = false;
                        this.emit('stopped');
                        console.log('✅ WebSocket server stopped successfully');
                        resolve();
                    });
                });

            } catch (error) {
                console.error('❌ Error stopping WebSocket server:', error);
                resolve(); // Don't reject to allow graceful shutdown
            }
        });
    }

    /**
     * Broadcast message to all connected clients
     * @param {Object} message - Message to broadcast
     * @param {string} room - Optional room to broadcast to
     */
    broadcast(message, room = null) {
        try {
            const messageStr = JSON.stringify({
                type: 'broadcast',
                timestamp: new Date().toISOString(),
                data: message
            });

            let targetConnections;
            
            if (room) {
                targetConnections = this.connectionsByRoom.get(room) || new Set();
            } else {
                targetConnections = new Set(this.connections.keys());
            }

            let sentCount = 0;
            for (const connectionId of targetConnections) {
                const connection = this.connections.get(connectionId);
                if (connection && connection.ws.readyState === connection.ws.OPEN) {
                    try {
                        connection.ws.send(messageStr);
                        sentCount++;
                        this.metrics.messagesSent++;
                        this.metrics.bytesTransferred += messageStr.length;
                    } catch (error) {
                        console.error(`❌ Failed to send message to connection ${connectionId}:`, error);
                        this._handleConnectionError(connectionId, error);
                    }
                }
            }

            if (this.config.enableLogging) {
                console.log(`📡 Broadcast sent to ${sentCount} connections${room ? ` in room: ${room}` : ''}`);
            }

            this.emit('message:broadcast', { message, room, sentCount });

        } catch (error) {
            console.error('❌ Failed to broadcast message:', error);
            this.metrics.errors++;
        }
    }

    /**
     * Send message to specific connection
     * @param {string} connectionId - Connection ID
     * @param {Object} message - Message to send
     */
    sendToConnection(connectionId, message) {
        try {
            const connection = this.connections.get(connectionId);
            
            if (!connection) {
                throw new Error(`Connection not found: ${connectionId}`);
            }

            if (connection.ws.readyState !== connection.ws.OPEN) {
                throw new Error(`Connection not open: ${connectionId}`);
            }

            const messageStr = JSON.stringify({
                type: 'direct',
                timestamp: new Date().toISOString(),
                data: message
            });

            connection.ws.send(messageStr);
            
            this.metrics.messagesSent++;
            this.metrics.bytesTransferred += messageStr.length;

            if (this.config.enableLogging) {
                console.log(`📤 Message sent to connection: ${connectionId}`);
            }

            this.emit('message:sent', { connectionId, message });

        } catch (error) {
            console.error(`❌ Failed to send message to connection ${connectionId}:`, error);
            this.metrics.errors++;
            throw error;
        }
    }

    /**
     * Join connection to room
     * @param {string} connectionId - Connection ID
     * @param {string} room - Room name
     */
    joinRoom(connectionId, room) {
        try {
            const connection = this.connections.get(connectionId);
            
            if (!connection) {
                throw new Error(`Connection not found: ${connectionId}`);
            }

            // Add to room
            if (!this.connectionsByRoom.has(room)) {
                this.connectionsByRoom.set(room, new Set());
            }
            
            this.connectionsByRoom.get(room).add(connectionId);
            
            // Track room in connection
            if (!connection.rooms) {
                connection.rooms = new Set();
            }
            connection.rooms.add(room);

            console.log(`🏠 Connection ${connectionId} joined room: ${room}`);
            this.emit('room:joined', { connectionId, room });

        } catch (error) {
            console.error(`❌ Failed to join room ${room} for connection ${connectionId}:`, error);
            throw error;
        }
    }

    /**
     * Leave room
     * @param {string} connectionId - Connection ID
     * @param {string} room - Room name
     */
    leaveRoom(connectionId, room) {
        try {
            const connection = this.connections.get(connectionId);
            
            if (connection && connection.rooms) {
                connection.rooms.delete(room);
            }

            const roomConnections = this.connectionsByRoom.get(room);
            if (roomConnections) {
                roomConnections.delete(connectionId);
                
                // Clean up empty rooms
                if (roomConnections.size === 0) {
                    this.connectionsByRoom.delete(room);
                }
            }

            console.log(`🚪 Connection ${connectionId} left room: ${room}`);
            this.emit('room:left', { connectionId, room });

        } catch (error) {
            console.error(`❌ Failed to leave room ${room} for connection ${connectionId}:`, error);
            throw error;
        }
    }

    /**
     * Get connection status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            activeConnections: this.connections.size,
            authenticatedConnections: this.authenticatedConnections.size,
            rooms: this.connectionsByRoom.size,
            metrics: {
                ...this.metrics,
                uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0
            },
            config: {
                port: this.config.port,
                host: this.config.host,
                maxConnections: this.config.maxConnections
            }
        };
    }

    /**
     * Setup WebSocket event handlers
     * @private
     */
    _setupEventHandlers() {
        this.wsServer.on('connection', (ws, request) => {
            this._handleNewConnection(ws, request);
        });

        this.wsServer.on('error', (error) => {
            console.error('❌ WebSocket server error:', error);
            this.metrics.errors++;
            this.emit('server:error', error);
        });
    }

    /**
     * Handle new WebSocket connection
     * @private
     */
    _handleNewConnection(ws, request) {
        try {
            // Check connection limit
            if (this.connections.size >= this.config.maxConnections) {
                console.warn('⚠️ Connection limit reached, rejecting new connection');
                ws.close(1013, 'Server overloaded');
                return;
            }

            // Generate connection ID
            const connectionId = this._generateConnectionId();
            
            // Create connection object
            const connection = {
                id: connectionId,
                ws,
                request,
                connectedAt: Date.now(),
                lastActivity: Date.now(),
                authenticated: false,
                rooms: new Set(),
                metadata: {
                    userAgent: request.headers['user-agent'],
                    origin: request.headers.origin,
                    ip: request.socket.remoteAddress
                }
            };

            // Store connection
            this.connections.set(connectionId, connection);
            this.metrics.totalConnections++;
            this.metrics.activeConnections = this.connections.size;

            // Setup connection event handlers
            this._setupConnectionHandlers(connection);

            // Start authentication timeout if enabled
            if (this.config.enableAuth) {
                this._startAuthTimeout(connection);
            } else {
                // Auto-authenticate if auth is disabled
                this._authenticateConnection(connection);
            }

            console.log(`🔌 New WebSocket connection: ${connectionId} from ${connection.metadata.ip}`);
            this.emit('connection:new', connection);

        } catch (error) {
            console.error('❌ Error handling new connection:', error);
            this.metrics.errors++;
            ws.close(1011, 'Internal server error');
        }
    }

    /**
     * Setup connection-specific event handlers
     * @private
     */
    _setupConnectionHandlers(connection) {
        const { ws, id } = connection;

        // Handle messages
        ws.on('message', (data) => {
            this._handleMessage(connection, data);
        });

        // Handle connection close
        ws.on('close', (code, reason) => {
            this._handleConnectionClose(connection, code, reason);
        });

        // Handle connection error
        ws.on('error', (error) => {
            this._handleConnectionError(id, error);
        });

        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            this._handlePong(connection);
        });
    }

    /**
     * Handle incoming message
     * @private
     */
    _handleMessage(connection, data) {
        const startTime = performance.now();
        
        try {
            // Update activity timestamp
            connection.lastActivity = Date.now();
            
            // Check rate limit
            if (this.config.enableRateLimit && !this._checkRateLimit(connection)) {
                console.warn(`⚠️ Rate limit exceeded for connection: ${connection.id}`);
                this.metrics.rateLimitHits++;
                return;
            }

            // Parse message
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (parseError) {
                console.error(`❌ Invalid JSON from connection ${connection.id}:`, parseError);
                this._sendError(connection, 'Invalid JSON format');
                return;
            }

            // Update metrics
            this.metrics.messagesReceived++;
            this.metrics.totalMessages++;
            this.metrics.bytesTransferred += data.length;

            // Handle different message types
            this._handleMessageByType(connection, message);

            // Update response time metrics
            const responseTime = performance.now() - startTime;
            this._updateResponseTimeMetrics(responseTime);

            if (this.config.enableLogging) {
                console.log(`📥 Message received from ${connection.id}: ${message.type}`);
            }

            this.emit('message:received', { connection, message });

        } catch (error) {
            console.error(`❌ Error handling message from connection ${connection.id}:`, error);
            this.metrics.errors++;
            this._sendError(connection, 'Message processing error');
        }
    }

    /**
     * Handle message by type
     * @private
     */
    _handleMessageByType(connection, message) {
        switch (message.type) {
            case 'auth':
                this._handleAuthMessage(connection, message);
                break;
                
            case 'subscribe':
                this._handleSubscribeMessage(connection, message);
                break;
                
            case 'unsubscribe':
                this._handleUnsubscribeMessage(connection, message);
                break;
                
            case 'status_update':
                this._handleStatusUpdateMessage(connection, message);
                break;
                
            case 'ping':
                this._handlePingMessage(connection, message);
                break;
                
            case 'join_room':
                this._handleJoinRoomMessage(connection, message);
                break;
                
            case 'leave_room':
                this._handleLeaveRoomMessage(connection, message);
                break;
                
            default:
                console.warn(`⚠️ Unknown message type from ${connection.id}: ${message.type}`);
                this._sendError(connection, `Unknown message type: ${message.type}`);
        }
    }

    /**
     * Handle authentication message
     * @private
     */
    _handleAuthMessage(connection, message) {
        try {
            // Validate authentication (placeholder implementation)
            const { token } = message.data || {};
            
            if (!token) {
                this._sendError(connection, 'Authentication token required');
                return;
            }

            // TODO: Implement actual token validation
            const isValid = this._validateAuthToken(token);
            
            if (isValid) {
                this._authenticateConnection(connection);
                this._sendMessage(connection, {
                    type: 'auth_success',
                    data: { connectionId: connection.id }
                });
            } else {
                this.metrics.authFailures++;
                this._sendError(connection, 'Invalid authentication token');
                
                // Close connection after auth failure
                setTimeout(() => {
                    connection.ws.close(1008, 'Authentication failed');
                }, 1000);
            }

        } catch (error) {
            console.error(`❌ Authentication error for connection ${connection.id}:`, error);
            this._sendError(connection, 'Authentication error');
        }
    }

    /**
     * Handle subscribe message
     * @private
     */
    _handleSubscribeMessage(connection, message) {
        if (!connection.authenticated) {
            this._sendError(connection, 'Authentication required');
            return;
        }

        const { room } = message.data || {};
        if (room) {
            this.joinRoom(connection.id, room);
            this._sendMessage(connection, {
                type: 'subscribed',
                data: { room }
            });
        }
    }

    /**
     * Handle unsubscribe message
     * @private
     */
    _handleUnsubscribeMessage(connection, message) {
        const { room } = message.data || {};
        if (room) {
            this.leaveRoom(connection.id, room);
            this._sendMessage(connection, {
                type: 'unsubscribed',
                data: { room }
            });
        }
    }

    /**
     * Handle status update message
     * @private
     */
    _handleStatusUpdateMessage(connection, message) {
        if (!connection.authenticated) {
            this._sendError(connection, 'Authentication required');
            return;
        }

        // Emit status update for processing
        this.emit('client:message', {
            type: 'status_update',
            connectionId: connection.id,
            data: message.data
        });
    }

    /**
     * Handle ping message
     * @private
     */
    _handlePingMessage(connection, message) {
        this._sendMessage(connection, {
            type: 'pong',
            data: { timestamp: Date.now() }
        });
    }

    /**
     * Handle join room message
     * @private
     */
    _handleJoinRoomMessage(connection, message) {
        if (!connection.authenticated) {
            this._sendError(connection, 'Authentication required');
            return;
        }

        const { room } = message.data || {};
        if (room) {
            this.joinRoom(connection.id, room);
        }
    }

    /**
     * Handle leave room message
     * @private
     */
    _handleLeaveRoomMessage(connection, message) {
        const { room } = message.data || {};
        if (room) {
            this.leaveRoom(connection.id, room);
        }
    }

    /**
     * Handle connection close
     * @private
     */
    _handleConnectionClose(connection, code, reason) {
        try {
            console.log(`🔌 Connection closed: ${connection.id} (code: ${code}, reason: ${reason})`);

            // Remove from all rooms
            if (connection.rooms) {
                for (const room of connection.rooms) {
                    this.leaveRoom(connection.id, room);
                }
            }

            // Remove from authenticated connections
            this.authenticatedConnections.delete(connection.id);

            // Remove connection
            this.connections.delete(connection.id);
            this.metrics.activeConnections = this.connections.size;

            // Clear heartbeat timeout
            this._clearHeartbeatTimeout(connection.id);

            this.emit('connection:closed', { connection, code, reason });

        } catch (error) {
            console.error(`❌ Error handling connection close for ${connection.id}:`, error);
        }
    }

    /**
     * Handle connection error
     * @private
     */
    _handleConnectionError(connectionId, error) {
        console.error(`❌ Connection error for ${connectionId}:`, error);
        this.metrics.errors++;
        
        const connection = this.connections.get(connectionId);
        if (connection) {
            this.emit('connection:error', { connection, error });
        }
    }

    /**
     * Handle pong response
     * @private
     */
    _handlePong(connection) {
        // Clear heartbeat timeout
        this._clearHeartbeatTimeout(connection.id);
        
        // Update last activity
        connection.lastActivity = Date.now();
    }

    /**
     * Authenticate connection
     * @private
     */
    _authenticateConnection(connection) {
        connection.authenticated = true;
        this.authenticatedConnections.add(connection.id);
        
        console.log(`✅ Connection authenticated: ${connection.id}`);
        this.emit('connection:authenticated', connection);
    }

    /**
     * Start authentication timeout
     * @private
     */
    _startAuthTimeout(connection) {
        setTimeout(() => {
            if (!connection.authenticated) {
                console.warn(`⚠️ Authentication timeout for connection: ${connection.id}`);
                connection.ws.close(1008, 'Authentication timeout');
            }
        }, this.config.authTimeout);
    }

    /**
     * Validate authentication token
     * @private
     */
    _validateAuthToken(token) {
        // TODO: Implement actual token validation
        // For now, accept any non-empty token
        return token && token.length > 0;
    }

    /**
     * Check rate limit
     * @private
     */
    _checkRateLimit(connection) {
        if (!this.config.enableRateLimit) {
            return true;
        }

        const now = Date.now();
        const windowStart = now - this.config.rateLimit.windowMs;
        
        if (!this.rateLimitMap.has(connection.id)) {
            this.rateLimitMap.set(connection.id, []);
        }

        const requests = this.rateLimitMap.get(connection.id);
        
        // Remove old requests
        while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
        }

        // Check limit
        if (requests.length >= this.config.rateLimit.maxRequests) {
            return false;
        }

        // Add current request
        requests.push(now);
        return true;
    }

    /**
     * Send message to connection
     * @private
     */
    _sendMessage(connection, message) {
        try {
            if (connection.ws.readyState === connection.ws.OPEN) {
                const messageStr = JSON.stringify({
                    ...message,
                    timestamp: new Date().toISOString()
                });
                
                connection.ws.send(messageStr);
                this.metrics.messagesSent++;
                this.metrics.bytesTransferred += messageStr.length;
            }
        } catch (error) {
            console.error(`❌ Failed to send message to connection ${connection.id}:`, error);
            this.metrics.errors++;
        }
    }

    /**
     * Send error message to connection
     * @private
     */
    _sendError(connection, errorMessage) {
        this._sendMessage(connection, {
            type: 'error',
            data: { message: errorMessage }
        });
    }

    /**
     * Start heartbeat mechanism
     * @private
     */
    _startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this._performHeartbeat();
        }, this.config.heartbeatInterval);
    }

    /**
     * Stop heartbeat mechanism
     * @private
     */
    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Clear all heartbeat timeouts
        for (const timeoutId of this.heartbeatTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.heartbeatTimeouts.clear();
    }

    /**
     * Perform heartbeat check
     * @private
     */
    _performHeartbeat() {
        for (const [connectionId, connection] of this.connections.entries()) {
            if (connection.ws.readyState === connection.ws.OPEN) {
                // Send ping
                connection.ws.ping();
                
                // Set timeout for pong response
                const timeoutId = setTimeout(() => {
                    console.warn(`⚠️ Heartbeat timeout for connection: ${connectionId}`);
                    connection.ws.close(1001, 'Heartbeat timeout');
                }, 10000); // 10 second timeout
                
                this.heartbeatTimeouts.set(connectionId, timeoutId);
            }
        }
    }

    /**
     * Clear heartbeat timeout
     * @private
     */
    _clearHeartbeatTimeout(connectionId) {
        const timeoutId = this.heartbeatTimeouts.get(connectionId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.heartbeatTimeouts.delete(connectionId);
        }
    }

    /**
     * Close all connections
     * @private
     */
    _closeAllConnections() {
        for (const connection of this.connections.values()) {
            try {
                connection.ws.close(1001, 'Server shutting down');
            } catch (error) {
                console.error(`❌ Error closing connection ${connection.id}:`, error);
            }
        }
    }

    /**
     * Initialize metrics
     * @private
     */
    _initializeMetrics() {
        this.metrics.startTime = Date.now();
    }

    /**
     * Update response time metrics
     * @private
     */
    _updateResponseTimeMetrics(responseTime) {
        const totalMessages = this.metrics.totalMessages;
        const currentAvg = this.metrics.averageResponseTime;
        this.metrics.averageResponseTime = ((currentAvg * (totalMessages - 1)) + responseTime) / totalMessages;
    }

    /**
     * Generate connection ID
     * @private
     */
    _generateConnectionId() {
        return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default WebSocketManager;

