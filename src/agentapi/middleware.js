/**
 * Express Middleware for AgentAPI Integration
 * 
 * Provides Express middleware components for integrating AgentAPI
 * functionality into the claude-task-master system.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';
import { AgentAPIClient } from './client.js';
import { TaskManager } from './task-manager.js';
import { AuthManager } from './auth.js';

export class AgentAPIMiddleware {
  constructor(config = {}) {
    this.config = {
      enableRateLimit: config.enableRateLimit !== false,
      enableSlowDown: config.enableSlowDown !== false,
      enableAuth: config.enableAuth !== false,
      enableLogging: config.enableLogging !== false,
      enableMetrics: config.enableMetrics !== false,
      rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
      rateLimitMax: config.rateLimitMax || 100,
      slowDownWindow: config.slowDownWindow || 15 * 60 * 1000,
      slowDownDelayAfter: config.slowDownDelayAfter || 50,
      slowDownDelayMs: config.slowDownDelayMs || 500,
      ...config
    };

    this.logger = new SimpleLogger('AgentAPIMiddleware');
    
    // Initialize components
    this.agentApiClient = new AgentAPIClient(config.agentApi);
    this.taskManager = new TaskManager(config.taskManager);
    this.authManager = new AuthManager(config.auth);
    
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      lastReset: new Date().toISOString()
    };
  }

  /**
   * Create rate limiting middleware
   * @returns {Function} Rate limiting middleware
   */
  createRateLimitMiddleware() {
    if (!this.config.enableRateLimit) {
      return (req, res, next) => next();
    }

    return rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
      message: {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(this.config.rateLimitWindow / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(this.config.rateLimitWindow / 1000)
        });
      }
    });
  }

  /**
   * Create slow down middleware
   * @returns {Function} Slow down middleware
   */
  createSlowDownMiddleware() {
    if (!this.config.enableSlowDown) {
      return (req, res, next) => next();
    }

    return slowDown({
      windowMs: this.config.slowDownWindow,
      delayAfter: this.config.slowDownDelayAfter,
      delayMs: this.config.slowDownDelayMs,
      maxDelayMs: this.config.slowDownDelayMs * 10
    });
  }

  /**
   * Create authentication middleware
   * @param {Object} options - Auth options
   * @returns {Function} Authentication middleware
   */
  createAuthMiddleware(options = {}) {
    if (!this.config.enableAuth) {
      return (req, res, next) => next();
    }

    return this.authManager.createMiddleware(options);
  }

  /**
   * Create request logging middleware
   * @returns {Function} Logging middleware
   */
  createLoggingMiddleware() {
    if (!this.config.enableLogging) {
      return (req, res, next) => next();
    }

    return (req, res, next) => {
      const start = Date.now();
      const requestId = Math.random().toString(36).substring(7);
      
      req.requestId = requestId;
      req.startTime = start;

      this.logger.info(`[${requestId}] ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        contentLength: req.get('Content-Length')
      });

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - start;
        
        this.logger.info(`[${requestId}] ${res.statusCode} - ${duration}ms`, {
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length')
        });

        // Update metrics
        if (this.config.enableMetrics) {
          this._updateMetrics(req, res, duration);
        }
      });

      next();
    };
  }

  /**
   * Create metrics collection middleware
   * @returns {Function} Metrics middleware
   */
  createMetricsMiddleware() {
    if (!this.config.enableMetrics) {
      return (req, res, next) => next();
    }

    return (req, res, next) => {
      this.metrics.requests++;
      
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          this.metrics.errors++;
        }
      });

      next();
    };
  }

  /**
   * Create PR deployment middleware
   * @returns {Function} PR deployment middleware
   */
  createPRDeploymentMiddleware() {
    return async (req, res, next) => {
      try {
        if (req.method !== 'POST' || !req.path.includes('/deploy/pr')) {
          return next();
        }

        const { prData, options = {} } = req.body;
        
        if (!prData) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'PR data is required'
          });
        }

        this.logger.info('Processing PR deployment request', {
          repository: prData.repository?.full_name,
          prNumber: prData.pull_request?.number,
          requestId: req.requestId
        });

        // Deploy PR via AgentAPI
        const deploymentResult = await this.agentApiClient.deployPR(prData);
        
        // Track deployment task
        const taskId = await this.taskManager.submitTask({
          type: 'pr_deployment',
          ...prData,
          ...options,
          deploymentId: deploymentResult.taskId
        });

        res.json({
          success: true,
          taskId,
          deploymentId: deploymentResult.taskId,
          status: 'submitted',
          message: 'PR deployment initiated successfully'
        });

      } catch (error) {
        this.logger.error('PR deployment failed:', error);
        
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'PR deployment failed',
          details: error.message
        });
      }
    };
  }

  /**
   * Create task status middleware
   * @returns {Function} Task status middleware
   */
  createTaskStatusMiddleware() {
    return async (req, res, next) => {
      try {
        if (req.method !== 'GET' || !req.path.includes('/tasks/')) {
          return next();
        }

        const taskId = req.params.taskId || req.path.split('/').pop();
        
        if (!taskId) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Task ID is required'
          });
        }

        // Get task status from task manager
        const taskStatus = this.taskManager.getTaskStatus(taskId);
        
        if (!taskStatus) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Task not found'
          });
        }

        // Get additional status from AgentAPI if available
        let agentApiStatus = null;
        try {
          agentApiStatus = await this.agentApiClient.getTaskStatus(taskId);
        } catch (error) {
          this.logger.warn(`Failed to get AgentAPI status for task ${taskId}:`, error);
        }

        res.json({
          taskId,
          status: taskStatus.status,
          progress: taskStatus.progress,
          submittedAt: taskStatus.submittedAt,
          startedAt: taskStatus.startedAt,
          completedAt: taskStatus.completedAt,
          attempts: taskStatus.attempts,
          error: taskStatus.error,
          result: taskStatus.result,
          agentApiStatus
        });

      } catch (error) {
        this.logger.error('Task status retrieval failed:', error);
        
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve task status',
          details: error.message
        });
      }
    };
  }

  /**
   * Create health check middleware
   * @returns {Function} Health check middleware
   */
  createHealthCheckMiddleware() {
    return async (req, res, next) => {
      try {
        if (req.method !== 'GET' || req.path !== '/health') {
          return next();
        }

        // Check AgentAPI health
        let agentApiHealth = null;
        try {
          agentApiHealth = await this.agentApiClient.getHealth();
        } catch (error) {
          agentApiHealth = { status: 'unhealthy', error: error.message };
        }

        // Check task manager health
        const taskManagerStats = this.taskManager.getStatistics();
        
        // Check auth manager health
        const authStats = this.authManager.getStats();

        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          components: {
            agentApi: agentApiHealth,
            taskManager: {
              status: 'healthy',
              stats: taskManagerStats
            },
            auth: {
              status: 'healthy',
              stats: authStats
            }
          },
          metrics: this.config.enableMetrics ? this.getMetrics() : null
        };

        // Determine overall health status
        if (agentApiHealth?.status === 'unhealthy') {
          health.status = 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);

      } catch (error) {
        this.logger.error('Health check failed:', error);
        
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    };
  }

  /**
   * Create error handling middleware
   * @returns {Function} Error handling middleware
   */
  createErrorHandlingMiddleware() {
    return (error, req, res, next) => {
      const statusCode = error.statusCode || error.status || 500;
      const message = error.message || 'Internal Server Error';

      this.logger.error(`[${req.requestId}] Error: ${message}`, {
        error: error.stack,
        statusCode,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Update error metrics
      if (this.config.enableMetrics) {
        this.metrics.errors++;
      }

      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal Server Error' : error.name || 'Error',
        message: statusCode >= 500 ? 'An unexpected error occurred' : message,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    };
  }

  /**
   * Create complete middleware stack
   * @param {Object} options - Middleware options
   * @returns {Array} Middleware stack
   */
  createMiddlewareStack(options = {}) {
    const stack = [];

    // Request logging (first)
    if (this.config.enableLogging) {
      stack.push(this.createLoggingMiddleware());
    }

    // Rate limiting
    if (this.config.enableRateLimit) {
      stack.push(this.createRateLimitMiddleware());
    }

    // Slow down
    if (this.config.enableSlowDown) {
      stack.push(this.createSlowDownMiddleware());
    }

    // Metrics collection
    if (this.config.enableMetrics) {
      stack.push(this.createMetricsMiddleware());
    }

    // Authentication (if required)
    if (options.requireAuth && this.config.enableAuth) {
      stack.push(this.createAuthMiddleware(options.authOptions));
    }

    // Body parsing
    stack.push(express.json({ limit: '10mb' }));
    stack.push(express.urlencoded({ extended: true, limit: '10mb' }));

    return stack;
  }

  /**
   * Create API router with all endpoints
   * @returns {Object} Express router
   */
  createAPIRouter() {
    const router = express.Router();

    // Apply middleware stack
    router.use(this.createMiddlewareStack({ requireAuth: true }));

    // Health check endpoint (no auth required)
    router.get('/health', this.createHealthCheckMiddleware());

    // PR deployment endpoint
    router.post('/deploy/pr', this.createPRDeploymentMiddleware());

    // Task management endpoints
    router.get('/tasks/:taskId', this.createTaskStatusMiddleware());
    
    router.get('/tasks', async (req, res) => {
      try {
        const filters = {
          status: req.query.status,
          limit: req.query.limit ? parseInt(req.query.limit) : undefined,
          since: req.query.since
        };

        const tasks = this.taskManager.getTasks(filters);
        res.json({ tasks, count: tasks.length });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/tasks/:taskId/cancel', async (req, res) => {
      try {
        const { taskId } = req.params;
        const success = await this.taskManager.cancelTask(taskId);
        
        if (success) {
          res.json({ success: true, message: 'Task cancelled successfully' });
        } else {
          res.status(404).json({ error: 'Task not found or cannot be cancelled' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Metrics endpoint
    router.get('/metrics', (req, res) => {
      if (!this.config.enableMetrics) {
        return res.status(404).json({ error: 'Metrics not enabled' });
      }
      
      res.json(this.getMetrics());
    });

    // Error handling (last)
    router.use(this.createErrorHandlingMiddleware());

    return router;
  }

  /**
   * Update metrics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {number} duration - Request duration
   */
  _updateMetrics(req, res, duration) {
    this.metrics.responseTime.push(duration);
    
    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
    }
  }

  /**
   * Get metrics data
   * @returns {Object} Metrics data
   */
  getMetrics() {
    const responseTime = this.metrics.responseTime;
    const avgResponseTime = responseTime.length > 0
      ? responseTime.reduce((sum, time) => sum + time, 0) / responseTime.length
      : 0;

    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 
        ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTime: Math.round(avgResponseTime),
      lastReset: this.metrics.lastReset,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      taskManager: this.taskManager.getStatistics(),
      auth: this.authManager.getStats()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      lastReset: new Date().toISOString()
    };
    
    this.logger.info('Metrics reset');
  }

  /**
   * Shutdown middleware components
   */
  async shutdown() {
    this.logger.info('Shutting down AgentAPI middleware');
    
    try {
      await this.agentApiClient.close();
      await this.taskManager.shutdown();
      
      this.logger.info('AgentAPI middleware shutdown complete');
    } catch (error) {
      this.logger.error('Error during middleware shutdown:', error);
    }
  }
}

export default AgentAPIMiddleware;

