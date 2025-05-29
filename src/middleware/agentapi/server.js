/**
 * AgentAPI HTTP Server - Middleware for AI agent communication
 * Provides HTTP API endpoints for Claude Code and other AI agents
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';
import { claudeInterface } from './claude-interface.js';
import { messageHandler } from './message-handler.js';
import { sessionManager } from './session-manager.js';

class AgentAPIServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.isRunning = false;
        this.port = configManager.get('agentapi.port', 3001);
        this.host = configManager.get('agentapi.host', 'localhost');
    }

    /**
     * Initialize the server
     */
    async initialize() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false, // Disable for API server
            crossOriginEmbedderPolicy: false
        }));

        // CORS configuration
        this.app.use(cors({
            origin: configManager.get('agentapi.allowedOrigins', ['http://localhost:3000']),
            credentials: true
        }));

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // API routes
        this.setupRoutes();

        // Error handling middleware
        this.app.use(this.errorHandler.bind(this));

        // Create HTTP server
        this.server = createServer(this.app);

        // Setup WebSocket server
        this.setupWebSocket();

        logger.info('AgentAPI server initialized');
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        const router = express.Router();

        // Session management
        router.post('/sessions', this.createSession.bind(this));
        router.get('/sessions/:sessionId', this.getSession.bind(this));
        router.delete('/sessions/:sessionId', this.deleteSession.bind(this));

        // Message handling
        router.post('/sessions/:sessionId/messages', this.sendMessage.bind(this));
        router.get('/sessions/:sessionId/messages', this.getMessages.bind(this));

        // Claude Code interface
        router.post('/claude/execute', this.executeClaudeCommand.bind(this));
        router.post('/claude/confirm', this.confirmClaudeAction.bind(this));
        router.get('/claude/status', this.getClaudeStatus.bind(this));

        // Agent management
        router.get('/agents', this.getAgents.bind(this));
        router.post('/agents/:agentId/tasks', this.submitTask.bind(this));
        router.get('/agents/:agentId/status', this.getAgentStatus.bind(this));

        // Workflow management
        router.post('/workflows', this.createWorkflow.bind(this));
        router.get('/workflows/:workflowId', this.getWorkflow.bind(this));
        router.post('/workflows/:workflowId/start', this.startWorkflow.bind(this));
        router.post('/workflows/:workflowId/pause', this.pauseWorkflow.bind(this));
        router.post('/workflows/:workflowId/resume', this.resumeWorkflow.bind(this));

        this.app.use('/api/v1', router);
    }

    /**
     * Setup WebSocket server
     */
    setupWebSocket() {
        this.wss = new WebSocketServer({ 
            server: this.server,
            path: '/ws'
        });

        this.wss.on('connection', (ws, req) => {
            const sessionId = req.url.split('sessionId=')[1];
            
            logger.info(`WebSocket connection established`, { sessionId });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await this.handleWebSocketMessage(ws, message, sessionId);
                } catch (error) {
                    logger.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: error.message
                    }));
                }
            });

            ws.on('close', () => {
                logger.info(`WebSocket connection closed`, { sessionId });
                if (sessionId) {
                    sessionManager.removeWebSocket(sessionId, ws);
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error:', error);
            });

            // Associate WebSocket with session
            if (sessionId) {
                sessionManager.addWebSocket(sessionId, ws);
            }
        });
    }

    /**
     * Handle WebSocket messages
     */
    async handleWebSocketMessage(ws, message, sessionId) {
        switch (message.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;

            case 'message':
                if (sessionId) {
                    const response = await messageHandler.processMessage(
                        sessionId, 
                        message.content,
                        message.metadata
                    );
                    ws.send(JSON.stringify({
                        type: 'response',
                        content: response,
                        timestamp: Date.now()
                    }));
                }
                break;

            case 'subscribe':
                // Subscribe to specific events
                if (message.events && sessionId) {
                    sessionManager.subscribeToEvents(sessionId, message.events);
                }
                break;

            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    error: `Unknown message type: ${message.type}`
                }));
        }
    }

    /**
     * Create a new session
     */
    async createSession(req, res) {
        try {
            const { agentType, configuration } = req.body;
            const session = await sessionManager.createSession(agentType, configuration);
            
            res.status(201).json({
                success: true,
                session
            });
        } catch (error) {
            logger.error('Create session error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get session information
     */
    async getSession(req, res) {
        try {
            const { sessionId } = req.params;
            const session = await sessionManager.getSession(sessionId);
            
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            res.json({
                success: true,
                session
            });
        } catch (error) {
            logger.error('Get session error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(req, res) {
        try {
            const { sessionId } = req.params;
            await sessionManager.deleteSession(sessionId);
            
            res.json({
                success: true,
                message: 'Session deleted'
            });
        } catch (error) {
            logger.error('Delete session error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Send a message to a session
     */
    async sendMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { content, metadata } = req.body;
            
            const response = await messageHandler.processMessage(sessionId, content, metadata);
            
            res.json({
                success: true,
                response
            });
        } catch (error) {
            logger.error('Send message error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get messages for a session
     */
    async getMessages(req, res) {
        try {
            const { sessionId } = req.params;
            const { limit = 50, offset = 0 } = req.query;
            
            const messages = await messageHandler.getMessages(sessionId, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
            res.json({
                success: true,
                messages
            });
        } catch (error) {
            logger.error('Get messages error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Execute Claude Code command
     */
    async executeClaudeCommand(req, res) {
        try {
            const { command, parameters, sessionId } = req.body;
            
            const result = await claudeInterface.executeCommand(command, parameters, sessionId);
            
            res.json({
                success: true,
                result
            });
        } catch (error) {
            logger.error('Execute Claude command error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Confirm Claude Code action
     */
    async confirmClaudeAction(req, res) {
        try {
            const { actionId, confirmed, sessionId } = req.body;
            
            const result = await claudeInterface.confirmAction(actionId, confirmed, sessionId);
            
            res.json({
                success: true,
                result
            });
        } catch (error) {
            logger.error('Confirm Claude action error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get Claude Code status
     */
    async getClaudeStatus(req, res) {
        try {
            const status = await claudeInterface.getStatus();
            
            res.json({
                success: true,
                status
            });
        } catch (error) {
            logger.error('Get Claude status error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get available agents
     */
    async getAgents(req, res) {
        try {
            // This would integrate with the coordination engine
            const agents = []; // Placeholder
            
            res.json({
                success: true,
                agents
            });
        } catch (error) {
            logger.error('Get agents error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Submit task to agent
     */
    async submitTask(req, res) {
        try {
            const { agentId } = req.params;
            const taskData = req.body;
            
            // This would integrate with the coordination engine
            const taskId = `task_${Date.now()}`;
            
            res.status(201).json({
                success: true,
                taskId
            });
        } catch (error) {
            logger.error('Submit task error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get agent status
     */
    async getAgentStatus(req, res) {
        try {
            const { agentId } = req.params;
            
            // This would integrate with the coordination engine
            const status = { id: agentId, status: 'active' };
            
            res.json({
                success: true,
                status
            });
        } catch (error) {
            logger.error('Get agent status error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Create workflow
     */
    async createWorkflow(req, res) {
        try {
            const { templateId, workflowData } = req.body;
            
            // This would integrate with the workflow manager
            const workflowId = `workflow_${Date.now()}`;
            
            res.status(201).json({
                success: true,
                workflowId
            });
        } catch (error) {
            logger.error('Create workflow error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get workflow
     */
    async getWorkflow(req, res) {
        try {
            const { workflowId } = req.params;
            
            // This would integrate with the workflow manager
            const workflow = { id: workflowId, status: 'running' };
            
            res.json({
                success: true,
                workflow
            });
        } catch (error) {
            logger.error('Get workflow error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Start workflow
     */
    async startWorkflow(req, res) {
        try {
            const { workflowId } = req.params;
            const { executionContext } = req.body;
            
            // This would integrate with the workflow manager
            
            res.json({
                success: true,
                message: 'Workflow started'
            });
        } catch (error) {
            logger.error('Start workflow error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Pause workflow
     */
    async pauseWorkflow(req, res) {
        try {
            const { workflowId } = req.params;
            
            // This would integrate with the workflow manager
            
            res.json({
                success: true,
                message: 'Workflow paused'
            });
        } catch (error) {
            logger.error('Pause workflow error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Resume workflow
     */
    async resumeWorkflow(req, res) {
        try {
            const { workflowId } = req.params;
            
            // This would integrate with the workflow manager
            
            res.json({
                success: true,
                message: 'Workflow resumed'
            });
        } catch (error) {
            logger.error('Resume workflow error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Error handling middleware
     */
    errorHandler(error, req, res, next) {
        logger.error('API error:', error);
        
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }

    /**
     * Start the server
     */
    async start() {
        if (this.isRunning) {
            logger.warn('AgentAPI server is already running');
            return;
        }

        await this.initialize();

        return new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, (error) => {
                if (error) {
                    logger.error('Failed to start AgentAPI server:', error);
                    reject(error);
                    return;
                }

                this.isRunning = true;
                logger.info(`AgentAPI server started on ${this.host}:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the server
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('AgentAPI server is not running');
            return;
        }

        return new Promise((resolve) => {
            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
            }

            // Close HTTP server
            this.server.close(() => {
                this.isRunning = false;
                logger.info('AgentAPI server stopped');
                resolve();
            });
        });
    }

    /**
     * Get server status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            host: this.host,
            connections: this.wss ? this.wss.clients.size : 0,
            uptime: process.uptime()
        };
    }
}

export const agentAPIServer = new AgentAPIServer();
export default AgentAPIServer;

