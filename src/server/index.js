/**
 * Claude Task Master Server
 * 
 * Main server entry point with comprehensive monitoring, health checks,
 * and production-ready features
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Import monitoring components
import { HealthCheck } from '../monitoring/HealthCheck.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { Logger } from '../monitoring/Logger.js';
import { AlertManager } from '../monitoring/AlertManager.js';

// Import existing components
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';
import { MiddlewareServer } from '../integrations/agent-api/middleware-server.js';

class ClaudeTaskMasterServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.API_PORT || 3000,
      metricsPort: config.metricsPort || process.env.METRICS_PORT || 8000,
      host: config.host || process.env.HOST || '0.0.0.0',
      environment: config.environment || process.env.NODE_ENV || 'development',
      enableCors: config.enableCors !== false,
      enableCompression: config.enableCompression !== false,
      enableHelmet: config.enableHelmet !== false,
      enableRateLimit: config.enableRateLimit !== false,
      logLevel: config.logLevel || process.env.LOG_LEVEL || 'info',
      ...config
    };

    // Initialize logging
    this.logger = new Logger({
      level: this.config.logLevel,
      enableConsole: true,
      enableFile: true,
      logDir: './logs'
    });

    // Initialize monitoring components
    this.healthCheck = new HealthCheck({
      logLevel: this.config.logLevel,
      enableAlerts: true
    });

    this.metricsCollector = new MetricsCollector({
      logLevel: this.config.logLevel,
      enablePrometheus: true,
      prometheusPort: this.config.metricsPort
    });

    this.alertManager = new AlertManager({
      logLevel: this.config.logLevel,
      enableSlack: true,
      enableEmail: true
    });

    // Initialize Express apps
    this.app = express();
    this.metricsApp = express();
    
    // Server instances
    this.server = null;
    this.metricsServer = null;
    this.middlewareServer = null;
    
    // State
    this.isRunning = false;
    this.startTime = Date.now();

    this._setupMainApp();
    this._setupMetricsApp();
    this._setupEventHandlers();
  }

  /**
   * Setup main application
   */
  _setupMainApp() {
    // Security middleware
    if (this.config.enableHelmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        crossOriginEmbedderPolicy: false
      }));
    }

    // CORS middleware
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: process.env.CORS_ORIGIN || true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      }));
    }

    // Compression middleware
    if (this.config.enableCompression) {
      this.app.use(compression());
    }

    // Rate limiting
    if (this.config.enableRateLimit) {
      const limiter = rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
        message: {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW) || 900000) / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false
      });
      this.app.use(limiter);
    }

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: process.env.MAX_REQUEST_SIZE || '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: process.env.MAX_REQUEST_SIZE || '10mb' 
    }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      const requestId = Math.random().toString(36).substring(7);
      
      req.requestId = requestId;
      req.startTime = startTime;

      // Log request
      this.logger.logHttpRequest(req, res, 0);

      // Log response when finished
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.logger.logHttpRequest(req, res, responseTime);
        
        // Update metrics
        this.metricsCollector.incrementCounter('http_requests_total', {
          method: req.method,
          status: res.statusCode.toString(),
          endpoint: req.route?.path || req.path
        });
        
        this.metricsCollector.observeHistogram('http_request_duration_seconds', 
          responseTime / 1000, {
            method: req.method,
            endpoint: req.route?.path || req.path
          }
        );
      });

      next();
    });

    // Health check routes
    this._setupHealthRoutes();

    // API routes
    this._setupApiRoutes();

    // Error handling
    this._setupErrorHandling();
  }

  /**
   * Setup metrics application
   */
  _setupMetricsApp() {
    // Basic middleware for metrics app
    this.metricsApp.use(express.json());

    // Metrics endpoint
    this.metricsApp.get('/metrics', (req, res) => {
      try {
        const metrics = this.metricsCollector.exportToPrometheus();
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics);
      } catch (error) {
        this.logger.error('Failed to export metrics:', error);
        res.status(500).json({ error: 'Failed to export metrics' });
      }
    });

    // Metrics summary endpoint
    this.metricsApp.get('/metrics/summary', (req, res) => {
      try {
        const summary = this.metricsCollector.getMetricsSummary();
        res.json(summary);
      } catch (error) {
        this.logger.error('Failed to get metrics summary:', error);
        res.status(500).json({ error: 'Failed to get metrics summary' });
      }
    });

    // Health check for metrics service
    this.metricsApp.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'metrics',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  }

  /**
   * Setup health check routes
   */
  _setupHealthRoutes() {
    // Basic health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthCheck.runAllChecks();
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(health);
      } catch (error) {
        this.logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Readiness probe
    this.app.get('/health/ready', async (req, res) => {
      try {
        // Check if all critical services are ready
        const dbCheck = await this.healthCheck.runCheck('database');
        const appCheck = await this.healthCheck.runCheck('application');
        
        const isReady = dbCheck?.status === 'healthy' && appCheck?.status === 'healthy';
        
        res.status(isReady ? 200 : 503).json({
          status: isReady ? 'ready' : 'not ready',
          checks: { database: dbCheck, application: appCheck },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Readiness check failed:', error);
        res.status(503).json({
          status: 'not ready',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Liveness probe
    this.app.get('/health/live', (req, res) => {
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid
      });
    });
  }

  /**
   * Setup API routes
   */
  _setupApiRoutes() {
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Claude Task Master',
        version: process.env.npm_package_version || '1.0.0',
        environment: this.config.environment,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          api: '/api/v1',
          metrics: `http://localhost:${this.config.metricsPort}/metrics`
        }
      });
    });

    // API v1 routes
    const apiRouter = express.Router();
    
    // Status endpoint
    apiRouter.get('/status', (req, res) => {
      res.json({
        status: 'operational',
        version: process.env.npm_package_version || '1.0.0',
        environment: this.config.environment,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          healthCheck: this.healthCheck.getStatus(),
          metrics: this.metricsCollector.getMetricsSummary(),
          alerts: this.alertManager.getAlertStats()
        }
      });
    });

    // Workflow endpoints (placeholder)
    apiRouter.get('/workflows', (req, res) => {
      res.json({
        message: 'Workflow endpoints will be implemented here',
        timestamp: new Date().toISOString()
      });
    });

    // Task endpoints (placeholder)
    apiRouter.get('/tasks', (req, res) => {
      res.json({
        message: 'Task endpoints will be implemented here',
        timestamp: new Date().toISOString()
      });
    });

    this.app.use('/api/v1', apiRouter);
  }

  /**
   * Setup error handling
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

      // Log error
      this.logger.logErrors(error, {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Update error metrics
      this.metricsCollector.incrementCounter('errors_total', {
        type: error.name || 'Error',
        component: 'api'
      });

      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal Server Error' : error.name || 'Error',
        message: statusCode >= 500 ? 'An unexpected error occurred' : message,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        ...(this.config.environment === 'development' && { stack: error.stack })
      });
    });
  }

  /**
   * Setup event handlers
   */
  _setupEventHandlers() {
    // Health check events
    this.healthCheck.on('criticalFailure', (result) => {
      this.alertManager.sendAlert({
        type: 'application_down',
        severity: 'critical',
        title: 'Critical Health Check Failure',
        message: `Health check '${result.name}' failed: ${result.error}`,
        details: result,
        channels: ['slack', 'email']
      });
    });

    // Metrics events
    this.metricsCollector.on('metricsCollected', (summary) => {
      this.logger.debug('Metrics collected', summary);
    });

    // Process events
    process.on('uncaughtException', (error) => {
      this.logger.logErrors(error, { type: 'uncaughtException' });
      this.alertManager.sendAlert({
        type: 'uncaught_exception',
        severity: 'critical',
        title: 'Uncaught Exception',
        message: error.message,
        details: { stack: error.stack },
        channels: ['slack', 'email']
      });
      
      // Graceful shutdown
      this.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.logErrors(new Error(`Unhandled Rejection: ${reason}`), { 
        type: 'unhandledRejection',
        promise: promise.toString()
      });
      
      this.alertManager.sendAlert({
        type: 'unhandled_rejection',
        severity: 'warning',
        title: 'Unhandled Promise Rejection',
        message: `Unhandled Rejection: ${reason}`,
        details: { reason, promise: promise.toString() },
        channels: ['slack']
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, starting graceful shutdown...');
      this.stop();
    });

    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, starting graceful shutdown...');
      this.stop();
    });
  }

  /**
   * Start the server
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      this.logger.info('Starting Claude Task Master server...', {
        environment: this.config.environment,
        port: this.config.port,
        metricsPort: this.config.metricsPort
      });

      // Start monitoring components
      this.healthCheck.start();
      this.metricsCollector.start();

      // Start main server
      await new Promise((resolve, reject) => {
        this.server = createServer(this.app);
        
        this.server.listen(this.config.port, this.config.host, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });

        this.server.on('error', reject);
      });

      // Start metrics server
      await new Promise((resolve, reject) => {
        this.metricsServer = createServer(this.metricsApp);
        
        this.metricsServer.listen(this.config.metricsPort, this.config.host, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });

        this.metricsServer.on('error', reject);
      });

      // Start middleware server
      this.middlewareServer = new MiddlewareServer({
        port: process.env.AGENT_API_PORT || 3001,
        logLevel: this.config.logLevel
      });
      await this.middlewareServer.start();

      this.isRunning = true;

      this.logger.info('Claude Task Master server started successfully', {
        mainPort: this.config.port,
        metricsPort: this.config.metricsPort,
        middlewarePort: process.env.AGENT_API_PORT || 3001,
        environment: this.config.environment,
        pid: process.pid
      });

      // Send startup notification
      await this.alertManager.sendAlert({
        type: 'application_startup',
        severity: 'info',
        title: 'Claude Task Master Started',
        message: `Application started successfully in ${this.config.environment} environment`,
        details: {
          port: this.config.port,
          metricsPort: this.config.metricsPort,
          pid: process.pid,
          nodeVersion: process.version
        },
        channels: ['slack']
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping Claude Task Master server...');

    try {
      // Stop monitoring components
      this.healthCheck.stop();
      this.metricsCollector.stop();

      // Stop middleware server
      if (this.middlewareServer) {
        await this.middlewareServer.stop();
      }

      // Stop servers
      const stopPromises = [];

      if (this.server) {
        stopPromises.push(new Promise((resolve) => {
          this.server.close(() => {
            this.logger.info('Main server stopped');
            resolve();
          });
        }));
      }

      if (this.metricsServer) {
        stopPromises.push(new Promise((resolve) => {
          this.metricsServer.close(() => {
            this.logger.info('Metrics server stopped');
            resolve();
          });
        }));
      }

      await Promise.all(stopPromises);

      // Close logger
      await this.logger.close();

      this.isRunning = false;
      this.logger.info('Claude Task Master server stopped');

    } catch (error) {
      this.logger.error('Error during server shutdown:', error);
      throw error;
    }
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime,
      environment: this.config.environment,
      ports: {
        main: this.config.port,
        metrics: this.config.metricsPort
      },
      monitoring: {
        healthCheck: this.healthCheck.getStatus(),
        metrics: this.metricsCollector.getMetricsSummary(),
        alerts: this.alertManager.getAlertStats()
      }
    };
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClaudeTaskMasterServer();
  
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { ClaudeTaskMasterServer };
export default ClaudeTaskMasterServer;

