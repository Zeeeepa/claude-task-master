#!/usr/bin/env node

/**
 * AgentAPI Server
 * HTTP/WebSocket server for Claude Code communication
 * Part of Task Master Architecture Restructuring
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

import { ClaudeInterface } from './claude-interface.js';
import { MessageHandler } from './message-handler.js';
import { SessionManager } from './session-manager.js';

/**
 * AgentAPI Server Class
 * Manages HTTP/WebSocket server for Claude Code communication
 */
export class AgentAPIServer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            port: config.port || process.env.AGENTAPI_PORT || 3284,
            host: config.host || process.env.AGENTAPI_HOST || 'localhost',
            ssl: config.ssl || false,
            maxSessions: config.maxSessions || 10,
            sessionTimeout: config.sessionTimeout || 3600000, // 1 hour
            claudeCodePath: config.claudeCodePath || process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude',
            allowedTools: config.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
            ...config
        };

        this.app = express();
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        
        this.sessionManager = new SessionManager(this.config);
        this.messageHandler = new MessageHandler(this.config);
        this.claudeInterface = new ClaudeInterface(this.config);
        
        this.isRunning = false;
        this.connections = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupEventHandlers();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' ? false : true,
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP, please try again later.'
        });
        this.app.use(limiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            const requestId = uuidv4();
            req.requestId = requestId;
            
            console.log(`[${new Date().toISOString()}] ${requestId} ${req.method} ${req.path}`);
            
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`[${new Date().toISOString()}] ${requestId} ${res.statusCode} ${duration}ms`);
            });
            
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                sessions: this.sessionManager.getActiveSessions().length,
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // Status endpoint
        this.app.get('/status', (req, res) => {
            const sessions = this.sessionManager.getActiveSessions();
            res.json({
                server: {
                    running: this.isRunning,
                    uptime: process.uptime(),
                    connections: this.connections.size
                },
                sessions: sessions.map(session => ({
                    id: session.id,
                    status: session.status,
                    created: session.createdAt,
                    lastActivity: session.lastActivity
                })),
                config: {
                    maxSessions: this.config.maxSessions,
                    sessionTimeout: this.config.sessionTimeout,
                    allowedTools: this.config.allowedTools
                }
            });
        });

        // Send message to Claude Code
        this.app.post('/message', async (req, res) => {
            try {
                const { sessionId, message, options = {} } = req.body;
                
                if (!sessionId || !message) {
                    return res.status(400).json({
                        error: 'Missing required fields: sessionId, message'
                    });
                }

                const session = await this.sessionManager.getSession(sessionId);
                if (!session) {
                    return res.status(404).json({
                        error: 'Session not found'
                    });
                }

                const result = await this.messageHandler.sendMessage(sessionId, message, options);
                
                res.json({
                    success: true,
                    messageId: result.messageId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Error sending message:', error);
                res.status(500).json({
                    error: 'Failed to send message',
                    details: error.message
                });
            }
        });

        // Get conversation history
        this.app.get('/messages/:sessionId', async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { limit = 50, offset = 0 } = req.query;

                const session = await this.sessionManager.getSession(sessionId);
                if (!session) {
                    return res.status(404).json({
                        error: 'Session not found'
                    });
                }

                const messages = await this.messageHandler.getMessages(sessionId, {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });

                res.json({
                    sessionId,
                    messages,
                    total: messages.length,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });

            } catch (error) {
                console.error('Error getting messages:', error);
                res.status(500).json({
                    error: 'Failed to get messages',
                    details: error.message
                });
            }
        });

        // Attach to agent session
        this.app.post('/attach', async (req, res) => {
            try {
                const { sessionId, clientId } = req.body;
                
                if (!clientId) {
                    return res.status(400).json({
                        error: 'Missing required field: clientId'
                    });
                }

                let session;
                if (sessionId) {
                    session = await this.sessionManager.getSession(sessionId);
                    if (!session) {
                        return res.status(404).json({
                            error: 'Session not found'
                        });
                    }
                } else {
                    session = await this.sessionManager.createSession({
                        clientId,
                        claudeCodePath: this.config.claudeCodePath,
                        allowedTools: this.config.allowedTools
                    });
                }

                await this.sessionManager.attachClient(session.id, clientId);

                res.json({
                    success: true,
                    sessionId: session.id,
                    status: session.status,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Error attaching to session:', error);
                res.status(500).json({
                    error: 'Failed to attach to session',
                    details: error.message
                });
            }
        });

        // Detach from agent session
        this.app.post('/detach', async (req, res) => {
            try {
                const { sessionId, clientId } = req.body;
                
                if (!sessionId || !clientId) {
                    return res.status(400).json({
                        error: 'Missing required fields: sessionId, clientId'
                    });
                }

                await this.sessionManager.detachClient(sessionId, clientId);

                res.json({
                    success: true,
                    sessionId,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Error detaching from session:', error);
                res.status(500).json({
                    error: 'Failed to detach from session',
                    details: error.message
                });
            }
        });

        // Server-Sent Events endpoint for real-time updates
        this.app.get('/events/:sessionId', (req, res) => {
            const { sessionId } = req.params;
            
            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            // Send initial connection event
            res.write(`data: ${JSON.stringify({
                type: 'connected',
                sessionId,
                timestamp: new Date().toISOString()
            })}\n\n`);

            // Setup event listeners for this session
            const eventHandler = (event) => {
                if (event.sessionId === sessionId) {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                }
            };

            this.messageHandler.on('message', eventHandler);
            this.sessionManager.on('sessionUpdate', eventHandler);

            // Cleanup on client disconnect
            req.on('close', () => {
                this.messageHandler.removeListener('message', eventHandler);
                this.sessionManager.removeListener('sessionUpdate', eventHandler);
            });
        });

        // Error handling middleware
        this.app.use((error, req, res, next) => {
            console.error('Unhandled error:', error);
            res.status(500).json({
                error: 'Internal server error',
                requestId: req.requestId
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                path: req.path,
                method: req.method
            });
        });
    }

    /**
     * Setup WebSocket server
     */
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const connectionId = uuidv4();
            const clientIP = req.socket.remoteAddress;
            
            console.log(`WebSocket connection established: ${connectionId} from ${clientIP}`);
            
            this.connections.set(connectionId, {
                ws,
                id: connectionId,
                ip: clientIP,
                connectedAt: new Date(),
                sessionId: null
            });

            // Handle incoming messages
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await this.handleWebSocketMessage(connectionId, message);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Invalid message format'
                    }));
                }
            });

            // Handle connection close
            ws.on('close', () => {
                console.log(`WebSocket connection closed: ${connectionId}`);
                this.connections.delete(connectionId);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`WebSocket error for ${connectionId}:`, error);
                this.connections.delete(connectionId);
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'welcome',
                connectionId,
                timestamp: new Date().toISOString()
            }));
        });
    }

    /**
     * Handle WebSocket messages
     */
    async handleWebSocketMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        const { ws } = connection;

        try {
            switch (message.type) {
                case 'attach':
                    const session = await this.sessionManager.createSession({
                        clientId: connectionId,
                        claudeCodePath: this.config.claudeCodePath,
                        allowedTools: this.config.allowedTools
                    });
                    
                    connection.sessionId = session.id;
                    
                    ws.send(JSON.stringify({
                        type: 'attached',
                        sessionId: session.id,
                        timestamp: new Date().toISOString()
                    }));
                    break;

                case 'message':
                    if (!connection.sessionId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            error: 'Not attached to a session'
                        }));
                        return;
                    }

                    const result = await this.messageHandler.sendMessage(
                        connection.sessionId,
                        message.content,
                        message.options || {}
                    );

                    ws.send(JSON.stringify({
                        type: 'message_sent',
                        messageId: result.messageId,
                        timestamp: new Date().toISOString()
                    }));
                    break;

                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    }));
                    break;

                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: `Unknown message type: ${message.type}`
                    }));
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                error: error.message
            }));
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Forward events from components
        this.messageHandler.on('message', (event) => {
            this.emit('message', event);
            this.broadcastToSession(event.sessionId, event);
        });

        this.sessionManager.on('sessionUpdate', (event) => {
            this.emit('sessionUpdate', event);
            this.broadcastToSession(event.sessionId, event);
        });

        this.claudeInterface.on('output', (event) => {
            this.emit('claudeOutput', event);
            this.broadcastToSession(event.sessionId, event);
        });

        // Handle process signals
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    /**
     * Broadcast message to all WebSocket connections for a session
     */
    broadcastToSession(sessionId, message) {
        for (const [connectionId, connection] of this.connections) {
            if (connection.sessionId === sessionId && connection.ws.readyState === 1) {
                connection.ws.send(JSON.stringify(message));
            }
        }
    }

    /**
     * Start the server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server.listen(this.config.port, this.config.host, () => {
                    this.isRunning = true;
                    console.log(`AgentAPI Server running on ${this.config.host}:${this.config.port}`);
                    console.log(`WebSocket server ready for connections`);
                    console.log(`Max sessions: ${this.config.maxSessions}`);
                    console.log(`Session timeout: ${this.config.sessionTimeout}ms`);
                    
                    this.emit('started');
                    resolve();
                });

                this.server.on('error', (error) => {
                    console.error('Server error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the server
     */
    async shutdown() {
        console.log('Shutting down AgentAPI Server...');
        
        this.isRunning = false;

        // Close all WebSocket connections
        for (const [connectionId, connection] of this.connections) {
            connection.ws.close();
        }
        this.connections.clear();

        // Close WebSocket server
        this.wss.close();

        // Cleanup sessions
        await this.sessionManager.cleanup();

        // Close HTTP server
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('AgentAPI Server stopped');
                this.emit('stopped');
                resolve();
            });
        });
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            uptime: process.uptime(),
            connections: this.connections.size,
            sessions: this.sessionManager.getActiveSessions().length,
            memory: process.memoryUsage(),
            config: this.config
        };
    }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const config = {
        port: process.env.AGENTAPI_PORT || 3284,
        host: process.env.AGENTAPI_HOST || 'localhost',
        claudeCodePath: process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude'
    };

    const server = new AgentAPIServer(config);
    
    server.start().catch((error) => {
        console.error('Failed to start AgentAPI Server:', error);
        process.exit(1);
    });
}

