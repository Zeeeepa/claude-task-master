import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { ClaudeInterface } from './claude-interface.js';
import { MessageHandler } from './message-handler.js';
import { SessionManager } from './session-manager.js';
import { MessageQueue } from './queue.js';
import { MessageProcessor } from './processor.js';

/**
 * AgentAPI HTTP Server
 * Provides RESTful API endpoints for agent communication with WebSocket support
 */
export class AgentAPIServer {
  constructor(options = {}) {
    this.port = options.port || process.env.AGENTAPI_PORT || 3284;
    this.host = options.host || process.env.AGENTAPI_HOST || 'localhost';
    
    // Initialize core components
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Initialize middleware components
    this.claudeInterface = new ClaudeInterface(options.claude || {});
    this.sessionManager = new SessionManager(options.session || {});
    this.messageQueue = new MessageQueue(options.queue || {});
    this.messageProcessor = new MessageProcessor(this.messageQueue, options.processor || {});
    this.messageHandler = new MessageHandler({
      claudeInterface: this.claudeInterface,
      sessionManager: this.sessionManager,
      messageQueue: this.messageQueue,
      messageProcessor: this.messageProcessor,
      ...options.messageHandler
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow WebSocket connections
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.AGENTAPI_CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
      credentials: true
    }));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      const requestId = uuidv4();
      req.requestId = requestId;
      
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        requestId,
        userAgent: req.get('User-Agent'),
        sessionId: req.get('X-Session-ID')
      });
      
      next();
    });
    
    // Rate limiting middleware (basic implementation)
    const rateLimitMap = new Map();
    this.app.use((req, res, next) => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxRequests = 100;
      
      if (!rateLimitMap.has(clientId)) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + windowMs });
        return next();
      }
      
      const clientData = rateLimitMap.get(clientId);
      if (now > clientData.resetTime) {
        clientData.count = 1;
        clientData.resetTime = now + windowMs;
        return next();
      }
      
      if (clientData.count >= maxRequests) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
      }
      
      clientData.count++;
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
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });

    // Core Communication Endpoints
    this.app.post('/api/agents/claude/message', this.handleSendMessage.bind(this));
    this.app.get('/api/agents/claude/messages', this.handleGetMessages.bind(this));
    this.app.get('/api/agents/claude/status', this.handleGetStatus.bind(this));
    this.app.get('/api/agents/claude/events', this.handleEventStream.bind(this));
    this.app.post('/api/agents/claude/session', this.handleCreateSession.bind(this));
    this.app.delete('/api/agents/claude/session/:id', this.handleEndSession.bind(this));

    // Task Management Endpoints
    this.app.post('/api/tasks/create', this.handleCreateTask.bind(this));
    this.app.put('/api/tasks/:id/assign', this.handleAssignTask.bind(this));
    this.app.get('/api/tasks/:id/status', this.handleGetTaskStatus.bind(this));
    this.app.post('/api/tasks/:id/complete', this.handleCompleteTask.bind(this));

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'AgentAPI Documentation',
        version: '1.0.0',
        endpoints: {
          'POST /api/agents/claude/message': 'Send message to Claude Code',
          'GET /api/agents/claude/messages': 'Get conversation history',
          'GET /api/agents/claude/status': 'Get agent status',
          'GET /api/agents/claude/events': 'SSE stream of events',
          'POST /api/agents/claude/session': 'Create new session',
          'DELETE /api/agents/claude/session/:id': 'End session',
          'POST /api/tasks/create': 'Create new task',
          'PUT /api/tasks/:id/assign': 'Assign task to agent',
          'GET /api/tasks/:id/status': 'Get task status',
          'POST /api/tasks/:id/complete': 'Mark task complete'
        }
      });
    });
  }

  /**
   * Setup WebSocket server for real-time communication
   */
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const sessionId = req.url?.split('sessionId=')[1] || uuidv4();
      ws.sessionId = sessionId;
      
      console.log(`WebSocket connected: ${sessionId}`);
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log(`WebSocket disconnected: ${sessionId}`);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${sessionId}:`, error);
      });
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        timestamp: new Date().toISOString()
      }));
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      
      res.status(error.status || 500).json({
        error: error.name || 'Internal Server Error',
        message: error.message || 'An unexpected error occurred',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle sending message to Claude Code
   */
  async handleSendMessage(req, res) {
    try {
      const { message, sessionId, priority = 'normal' } = req.body;
      
      if (!message) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Message content is required'
        });
      }

      const result = await this.messageHandler.sendMessage({
        content: message,
        sessionId: sessionId || req.get('X-Session-ID'),
        priority,
        requestId: req.requestId
      });

      res.json({
        success: true,
        messageId: result.messageId,
        sessionId: result.sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle getting conversation history
   */
  async handleGetMessages(req, res) {
    try {
      const sessionId = req.query.sessionId || req.get('X-Session-ID');
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      if (!sessionId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Session ID is required'
        });
      }

      const messages = await this.messageHandler.getMessages(sessionId, { limit, offset });

      res.json({
        success: true,
        messages,
        sessionId,
        pagination: {
          limit,
          offset,
          total: messages.length
        }
      });
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle getting agent status
   */
  async handleGetStatus(req, res) {
    try {
      const status = await this.claudeInterface.getStatus();
      
      res.json({
        success: true,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get status error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle Server-Sent Events stream
   */
  handleEventStream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sessionId = req.query.sessionId || req.get('X-Session-ID');
    
    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Set up event listeners for this session
    const eventHandler = (event) => {
      if (event.sessionId === sessionId || !sessionId) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    this.messageHandler.on('message', eventHandler);
    this.messageHandler.on('response', eventHandler);
    this.messageHandler.on('error', eventHandler);

    // Clean up on client disconnect
    req.on('close', () => {
      this.messageHandler.off('message', eventHandler);
      this.messageHandler.off('response', eventHandler);
      this.messageHandler.off('error', eventHandler);
    });
  }

  /**
   * Handle creating new session
   */
  async handleCreateSession(req, res) {
    try {
      const { metadata = {} } = req.body;
      const session = await this.sessionManager.createSession(metadata);
      
      res.json({
        success: true,
        session,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle ending session
   */
  async handleEndSession(req, res) {
    try {
      const { id } = req.params;
      await this.sessionManager.endSession(id);
      
      res.json({
        success: true,
        message: 'Session ended successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('End session error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle creating new task
   */
  async handleCreateTask(req, res) {
    try {
      const { title, description, priority = 'normal', metadata = {} } = req.body;
      
      if (!title) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Task title is required'
        });
      }

      const task = {
        id: uuidv4(),
        title,
        description,
        priority,
        status: 'created',
        metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store task (in a real implementation, this would go to a database)
      // For now, we'll just return the task
      
      res.json({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle assigning task to agent
   */
  async handleAssignTask(req, res) {
    try {
      const { id } = req.params;
      const { agentId, sessionId } = req.body;
      
      if (!agentId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Agent ID is required'
        });
      }

      // In a real implementation, this would update the task in the database
      const task = {
        id,
        agentId,
        sessionId,
        status: 'assigned',
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      res.json({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Assign task error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle getting task status
   */
  async handleGetTaskStatus(req, res) {
    try {
      const { id } = req.params;
      
      // In a real implementation, this would fetch from database
      const task = {
        id,
        status: 'in_progress',
        progress: 0.5,
        lastUpdate: new Date().toISOString()
      };
      
      res.json({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get task status error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle completing task
   */
  async handleCompleteTask(req, res) {
    try {
      const { id } = req.params;
      const { result, metadata = {} } = req.body;
      
      // In a real implementation, this would update the task in the database
      const task = {
        id,
        status: 'completed',
        result,
        metadata,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      res.json({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Complete task error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Handle WebSocket messages
   */
  async handleWebSocketMessage(ws, message) {
    try {
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
          
        case 'subscribe':
          // Handle subscription to specific events
          ws.subscriptions = message.events || [];
          ws.send(JSON.stringify({ 
            type: 'subscribed', 
            events: ws.subscriptions,
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'message':
          // Handle direct message through WebSocket
          const result = await this.messageHandler.sendMessage({
            content: message.content,
            sessionId: ws.sessionId,
            priority: message.priority || 'normal'
          });
          
          ws.send(JSON.stringify({
            type: 'message_sent',
            messageId: result.messageId,
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
      console.error('WebSocket message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  }

  /**
   * Start the server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`AgentAPI Server running on http://${this.host}:${this.port}`);
          console.log(`WebSocket server available at ws://${this.host}:${this.port}`);
          resolve();
        }
      });
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          console.log('AgentAPI Server stopped');
          resolve();
        });
      });
    });
  }
}

export default AgentAPIServer;

