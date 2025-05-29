/**
 * AgentAPI Middleware Server
 * 
 * Main middleware server that acts as a communication bridge between
 * the System Orchestrator and Claude Code integration.
 * 
 * Features:
 * - Express.js-based RESTful API with WebSocket support
 * - Request/response handling and proxying
 * - Authentication and rate limiting
 * - Data transformation and validation
 * - Health monitoring and logging
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { APIRouter } from './api-router.js';
import { AuthHandler } from './auth-handler.js';
import { DataTransformer } from './data-transformer.js';
import { RateLimiter } from './rate-limiter.js';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

export class MiddlewareServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.AGENT_API_PORT || 3001,
      host: config.host || process.env.AGENT_API_HOST || 'localhost',
      enableWebSocket: config.enableWebSocket !== false,
      enableCors: config.enableCors !== false,
      enableCompression: config.enableCompression !== false,
      enableHelmet: config.enableHelmet !== false,
      logLevel: config.logLevel || 'info',
      ...config
    };

    this.logger = new SimpleLogger('MiddlewareServer', this.config.logLevel);
    this.app = express();
    this.server = null;
    this.wsServer = null;
    this.isRunning = false;

    // Initialize components
    this.authHandler = new AuthHandler(this.config.auth);
    this.dataTransformer = new DataTransformer(this.config.transformer);
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.apiRouter = new APIRouter({
      authHandler: this.authHandler,
      dataTransformer: this.dataTransformer,
      logger: this.logger
    });

    this._setupMiddleware();
    this._setupRoutes();
    this._setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  _setupMiddleware() {
    // Security middleware
    if (this.config.enableHelmet) {
      this.app.use(helmet({
        contentSecurityPolicy: false, // Allow for API usage
        crossOriginEmbedderPolicy: false
      }));
    }

    // CORS middleware
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: this.config.corsOrigin || true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      }));
    }

    // Compression middleware
    if (this.config.enableCompression) {
      this.app.use(compression());
    }

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting middleware
    this.app.use(this.rateLimiter.getMiddleware());

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      const requestId = Math.random().toString(36).substring(7);
      
      req.requestId = requestId;
      req.startTime = start;

      this.logger.info(`[${requestId}] ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info(`[${requestId}] ${res.statusCode} - ${duration}ms`, {
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length')
        });
      });

      next();
    });
  }

  /**
   * Setup API routes
   */
  _setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes
    this.app.use('/api/v1', this.apiRouter.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'AgentAPI Middleware Server',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Communication bridge between System Orchestrator and Claude Code',
        endpoints: {
          health: '/health',
          api: '/api/v1',
          websocket: this.config.enableWebSocket ? '/ws' : null
        }
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  _setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      const statusCode = error.statusCode || error.status || 500;
      const message = error.message || 'Internal Server Error';

      this.logger.error(`[${req.requestId}] Error: ${message}`, {
        error: error.stack,
        statusCode,
        path: req.path,
        method: req.method
      });

      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal Server Error' : error.name || 'Error',
        message: statusCode >= 500 ? 'An unexpected error occurred' : message,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });
  }

  /**
   * Setup WebSocket server
   */
  _setupWebSocket() {
    if (!this.config.enableWebSocket) return;

    this.wsServer = new WebSocketServer({ 
      server: this.server,
      path: '/ws'
    });

    this.wsServer.on('connection', (ws, req) => {
      const clientId = Math.random().toString(36).substring(7);
      ws.clientId = clientId;

      this.logger.info(`WebSocket client connected: ${clientId}`, {
        clientId,
        ip: req.socket.remoteAddress
      });

      // Handle authentication for WebSocket
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'auth') {
            const authResult = await this.authHandler.validateToken(message.token);
            if (authResult.valid) {
              ws.authenticated = true;
              ws.userId = authResult.userId;
              ws.send(JSON.stringify({
                type: 'auth_success',
                clientId
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'auth_error',
                message: 'Invalid token'
              }));
              ws.close(1008, 'Invalid token');
            }
          } else if (ws.authenticated) {
            // Handle authenticated messages
            await this._handleWebSocketMessage(ws, message);
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Authentication required'
            }));
          }
        } catch (error) {
          this.logger.error(`WebSocket message error for client ${clientId}:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', (code, reason) => {
        this.logger.info(`WebSocket client disconnected: ${clientId}`, {
          clientId,
          code,
          reason: reason.toString()
        });
      });

      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }

  /**
   * Handle WebSocket messages
   */
  async _handleWebSocketMessage(ws, message) {
    try {
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'subscribe':
          // Handle subscription to events
          ws.subscriptions = ws.subscriptions || new Set();
          ws.subscriptions.add(message.channel);
          ws.send(JSON.stringify({
            type: 'subscribed',
            channel: message.channel
          }));
          break;

        case 'unsubscribe':
          // Handle unsubscription from events
          if (ws.subscriptions) {
            ws.subscriptions.delete(message.channel);
          }
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            channel: message.channel
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`
          }));
      }
    } catch (error) {
      this.logger.error(`Error handling WebSocket message:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing message'
      }));
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  broadcast(message, channel = null) {
    if (!this.wsServer) return;

    const messageStr = JSON.stringify(message);
    
    this.wsServer.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN && ws.authenticated) {
        if (!channel || (ws.subscriptions && ws.subscriptions.has(channel))) {
          ws.send(messageStr);
        }
      }
    });
  }

  /**
   * Start the middleware server
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);

      this.server.listen(this.config.port, this.config.host, (error) => {
        if (error) {
          this.logger.error('Failed to start server:', error);
          reject(error);
          return;
        }

        this.isRunning = true;
        this._setupWebSocket();

        this.logger.info(`AgentAPI Middleware Server started`, {
          host: this.config.host,
          port: this.config.port,
          websocket: this.config.enableWebSocket,
          environment: process.env.NODE_ENV || 'development'
        });

        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error('Server error:', error);
        if (!this.isRunning) {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the middleware server
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close(() => {
          this.logger.info('WebSocket server closed');
        });
      }

      // Close HTTP server
      this.server.close(() => {
        this.isRunning = false;
        this.logger.info('AgentAPI Middleware Server stopped');
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
      config: {
        host: this.config.host,
        port: this.config.port,
        enableWebSocket: this.config.enableWebSocket
      },
      uptime: this.isRunning ? process.uptime() : 0,
      connections: this.wsServer ? this.wsServer.clients.size : 0
    };
  }
}

export default MiddlewareServer;

