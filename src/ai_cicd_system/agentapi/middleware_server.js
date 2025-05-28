/**
 * AgentAPI Middleware Server
 * 
 * Main HTTP API server that serves as a communication bridge between
 * the claude-task-master orchestrator and Claude Code on WSL2 instances.
 * 
 * Features:
 * - RESTful API for deployment operations
 * - WSL2 instance management
 * - Git operations for PR branch cloning
 * - Claude Code integration
 * - Process orchestration and monitoring
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const WSL2Manager = require('./wsl2_manager');
const GitOperations = require('./git_operations');
const ClaudeCodeInterface = require('./claude_code_interface');
const DeploymentOrchestrator = require('./deployment_orchestrator');

// Route handlers
const deploymentRoutes = require('./routes/deployment');
const validationRoutes = require('./routes/validation');
const statusRoutes = require('./routes/status');
const webhookRoutes = require('./routes/webhook');

// Integration components
const OrchestratorClient = require('./integration/orchestrator_client');
const DatabaseConnector = require('./integration/database_connector');

class AgentAPIMiddlewareServer {
  constructor(config = {}) {
    this.config = {
      server: {
        host: 'localhost',
        port: 3001,
        cors: { origin: ['http://localhost:3000'] },
        ...config.server
      },
      wsl2: {
        maxInstances: 5,
        resourceLimits: {
          memory: '2GB',
          cpu: '2 cores',
          disk: '10GB'
        },
        timeout: 300000, // 5 minutes
        ...config.wsl2
      },
      claudeCode: {
        apiUrl: 'http://localhost:3002',
        timeout: 180000, // 3 minutes
        retryAttempts: 3,
        ...config.claudeCode
      },
      database: {
        connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/ai_cicd',
        ...config.database
      },
      orchestrator: {
        apiUrl: 'http://localhost:3000',
        timeout: 30000,
        ...config.orchestrator
      }
    };

    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: this.config.server.cors
    });

    this.isRunning = false;
    this.activeDeployments = new Map();
    this.metrics = {
      totalDeployments: 0,
      successfulDeployments: 0,
      failedDeployments: 0,
      averageDeploymentTime: 0,
      activeInstances: 0
    };

    this.initializeComponents();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * Initialize core components
   */
  initializeComponents() {
    this.wsl2Manager = new WSL2Manager(this.config.wsl2);
    this.gitOperations = new GitOperations();
    this.claudeCodeInterface = new ClaudeCodeInterface(this.config.claudeCode);
    this.deploymentOrchestrator = new DeploymentOrchestrator({
      wsl2Manager: this.wsl2Manager,
      gitOperations: this.gitOperations,
      claudeCodeInterface: this.claudeCodeInterface,
      config: this.config
    });

    // Integration components
    this.orchestratorClient = new OrchestratorClient(this.config.orchestrator);
    this.databaseConnector = new DatabaseConnector(this.config.database);
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors(this.config.server.cors));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Add middleware context
    this.app.use((req, res, next) => {
      req.agentAPI = {
        wsl2Manager: this.wsl2Manager,
        gitOperations: this.gitOperations,
        claudeCodeInterface: this.claudeCodeInterface,
        deploymentOrchestrator: this.deploymentOrchestrator,
        orchestratorClient: this.orchestratorClient,
        databaseConnector: this.databaseConnector,
        activeDeployments: this.activeDeployments,
        metrics: this.metrics,
        io: this.io
      };
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: this.metrics
      });
    });

    // API routes
    this.app.use('/api/deployment', deploymentRoutes);
    this.app.use('/api/validation', validationRoutes);
    this.app.use('/api/status', statusRoutes);
    this.app.use('/api/webhook', webhookRoutes);

    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'AgentAPI Middleware',
        version: '1.0.0',
        description: 'HTTP API for AgentAPI middleware integration',
        endpoints: {
          deployment: {
            'POST /api/deployment/start': 'Start a new deployment',
            'GET /api/deployment/:id': 'Get deployment status',
            'POST /api/deployment/:id/stop': 'Stop a deployment',
            'GET /api/deployment': 'List all deployments'
          },
          validation: {
            'POST /api/validation/start': 'Start validation process',
            'GET /api/validation/:id': 'Get validation results',
            'POST /api/validation/:id/retry': 'Retry validation'
          },
          status: {
            'GET /api/status': 'Get system status',
            'GET /api/status/wsl2': 'Get WSL2 instances status',
            'GET /api/status/metrics': 'Get performance metrics'
          },
          webhook: {
            'POST /api/webhook/github': 'Handle GitHub webhooks',
            'POST /api/webhook/linear': 'Handle Linear webhooks'
          }
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: '/api/docs'
      });
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`WebSocket client connected: ${socket.id}`);

      // Join deployment room for updates
      socket.on('join-deployment', (deploymentId) => {
        socket.join(`deployment-${deploymentId}`);
        console.log(`Client ${socket.id} joined deployment room: ${deploymentId}`);
      });

      // Leave deployment room
      socket.on('leave-deployment', (deploymentId) => {
        socket.leave(`deployment-${deploymentId}`);
        console.log(`Client ${socket.id} left deployment room: ${deploymentId}`);
      });

      socket.on('disconnect', () => {
        console.log(`WebSocket client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      
      res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      this.gracefulShutdown();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown();
    });

    // Handle SIGTERM and SIGINT
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize database connection
      await this.databaseConnector.connect();
      console.log('Database connected successfully');

      // Initialize WSL2 manager
      await this.wsl2Manager.initialize();
      console.log('WSL2 manager initialized');

      // Start the server
      this.server.listen(this.config.server.port, this.config.server.host, () => {
        this.isRunning = true;
        console.log(`AgentAPI Middleware Server running on http://${this.config.server.host}:${this.config.server.port}`);
        console.log(`WebSocket server ready for real-time updates`);
        console.log(`API documentation available at http://${this.config.server.host}:${this.config.server.port}/api/docs`);
      });

      // Start periodic cleanup
      this.startPeriodicCleanup();

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Start periodic cleanup of resources
   */
  startPeriodicCleanup() {
    setInterval(async () => {
      try {
        await this.wsl2Manager.cleanupIdleInstances();
        await this.cleanupExpiredDeployments();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }, 60000); // Run every minute
  }

  /**
   * Clean up expired deployments
   */
  async cleanupExpiredDeployments() {
    const now = Date.now();
    const expiredDeployments = [];

    for (const [id, deployment] of this.activeDeployments.entries()) {
      if (now - deployment.startTime > this.config.wsl2.timeout) {
        expiredDeployments.push(id);
      }
    }

    for (const id of expiredDeployments) {
      console.log(`Cleaning up expired deployment: ${id}`);
      await this.deploymentOrchestrator.stopDeployment(id);
      this.activeDeployments.delete(id);
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    if (!this.isRunning) return;

    console.log('Initiating graceful shutdown...');
    this.isRunning = false;

    try {
      // Stop accepting new connections
      this.server.close();

      // Stop all active deployments
      for (const [id] of this.activeDeployments) {
        await this.deploymentOrchestrator.stopDeployment(id);
      }

      // Cleanup WSL2 instances
      await this.wsl2Manager.cleanup();

      // Close database connection
      await this.databaseConnector.disconnect();

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Emit real-time update to clients
   */
  emitUpdate(deploymentId, event, data) {
    this.io.to(`deployment-${deploymentId}`).emit(event, {
      deploymentId,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Update metrics
   */
  updateMetrics(type, value = 1) {
    switch (type) {
      case 'deployment_started':
        this.metrics.totalDeployments += value;
        break;
      case 'deployment_success':
        this.metrics.successfulDeployments += value;
        break;
      case 'deployment_failed':
        this.metrics.failedDeployments += value;
        break;
      case 'deployment_time':
        const total = this.metrics.successfulDeployments + this.metrics.failedDeployments;
        this.metrics.averageDeploymentTime = 
          ((this.metrics.averageDeploymentTime * (total - 1)) + value) / total;
        break;
      case 'active_instances':
        this.metrics.activeInstances = value;
        break;
    }
  }
}

module.exports = AgentAPIMiddlewareServer;

