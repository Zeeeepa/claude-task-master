/**
 * @fileoverview GitHub Webhook Server
 * @description Main webhook server for handling GitHub events and PR validation
 */

import express from 'express';
import crypto from 'crypto';
import { log } from '../../scripts/modules/utils.js';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';
import { PRValidation, ValidationStatus } from '../database/models/validation.js';
import { CodegenIntegration } from '../integrations/codegen_client.js';
import { PRAnalyzer } from './pr_analyzer.js';
import { StatusReporter } from './status_reporter.js';
import { ValidationPipeline } from './validation_pipeline.js';
import { webhookConfig } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate_limit.js';

/**
 * GitHub Webhook Server
 * Handles GitHub webhook events for automated PR validation and CI/CD integration
 */
export class GitHubWebhookServer {
  constructor(config = {}) {
    this.config = {
      ...webhookConfig,
      ...config
    };

    this.app = express();
    this.server = null;
    
    this.errorHandler = new CodegenErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true,
      maxRetries: 3
    });
    
    this.codegenClient = new CodegenIntegration(this.config.codegen);
    this.prAnalyzer = new PRAnalyzer(this.config.github);
    this.statusReporter = new StatusReporter(this.config.github);
    this.validationPipeline = new ValidationPipeline({
      analyzer: this.prAnalyzer,
      codegenClient: this.codegenClient,
      statusReporter: this.statusReporter
    });
    
    this.metrics = {
      webhooksReceived: 0,
      webhooksProcessed: 0,
      webhooksFailed: 0,
      validationsStarted: 0,
      validationsCompleted: 0,
      validationsFailed: 0,
      startTime: new Date()
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Basic middleware
    this.app.use(express.json({ 
      limit: this.config.server.maxPayloadSize || '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    this.app.use(express.urlencoded({ extended: true }));
    
    // Security middleware
    this.app.use(this.corsMiddleware.bind(this));
    this.app.use(rateLimitMiddleware(this.config.rateLimit));
    
    // Logging middleware
    if (this.config.logging.enableRequestLogging) {
      this.app.use(this.requestLoggingMiddleware.bind(this));
    }
    
    // Webhook signature verification
    this.app.use('/webhook/github', this.verifySignature.bind(this));
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Main webhook endpoint
    this.app.post('/webhook/github', this.handleWebhook.bind(this));
    
    // Health check endpoints
    this.app.get('/health', this.healthCheck.bind(this));
    this.app.get('/health/detailed', this.detailedHealthCheck.bind(this));
    
    // Status and metrics endpoints
    this.app.get('/status', this.getSystemStatus.bind(this));
    this.app.get('/metrics', this.getMetrics.bind(this));
    
    // Validation endpoints
    this.app.get('/validations/:id', this.getValidation.bind(this));
    this.app.get('/validations', this.listValidations.bind(this));
    
    // Admin endpoints (protected)
    this.app.use('/admin', authMiddleware);
    this.app.get('/admin/queue', this.getQueueStatus.bind(this));
    this.app.post('/admin/retry/:id', this.retryValidation.bind(this));
    this.app.post('/admin/reset-metrics', this.resetMetrics.bind(this));
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      log('error', 'Express error handler', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      this.metrics.webhooksFailed++;

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });
  }

  /**
   * Start the webhook server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      await this.validateConfiguration();
      
      this.server = this.app.listen(this.config.server.port, this.config.server.host, () => {
        log('info', `GitHub Webhook Server started`, {
          host: this.config.server.host,
          port: this.config.server.port,
          environment: process.env.NODE_ENV || 'development'
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
    } catch (error) {
      log('error', 'Failed to start webhook server', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the webhook server
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          log('info', 'GitHub Webhook Server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Verify GitHub webhook signature
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  verifySignature(req, res, next) {
    if (!this.config.github.webhookSecret) {
      log('warn', 'Webhook secret not configured, skipping signature verification');
      return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    const payload = req.rawBody || JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', this.config.github.webhookSecret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`);
    const actualBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== actualBuffer.length || 
        !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      log('warn', 'Invalid webhook signature', {
        expected_length: expectedBuffer.length,
        actual_length: actualBuffer.length
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  }

  /**
   * Handle GitHub webhook events
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleWebhook(req, res) {
    const startTime = Date.now();
    
    try {
      const event = req.headers['x-github-event'];
      const delivery = req.headers['x-github-delivery'];
      const payload = req.body;

      this.metrics.webhooksReceived++;

      log('info', `📥 Received GitHub webhook: ${event}`, {
        delivery_id: delivery,
        repository: payload.repository?.full_name,
        action: payload.action
      });

      await this.errorHandler.handleError(
        async () => {
          switch (event) {
            case 'pull_request':
              await this.handlePullRequest(payload);
              break;
            case 'push':
              await this.handlePush(payload);
              break;
            case 'check_run':
              await this.handleCheckRun(payload);
              break;
            case 'check_suite':
              await this.handleCheckSuite(payload);
              break;
            case 'pull_request_review':
              await this.handlePullRequestReview(payload);
              break;
            case 'ping':
              await this.handlePing(payload);
              break;
            default:
              log('info', `ℹ️ Unhandled event type: ${event}`);
          }
        },
        { 
          component: 'webhook', 
          operation: event,
          delivery_id: delivery,
          repository: payload.repository?.full_name
        }
      );

      this.metrics.webhooksProcessed++;
      
      const processingTime = Date.now() - startTime;
      log('info', `✅ Webhook processed successfully`, {
        event,
        delivery_id: delivery,
        processing_time_ms: processingTime
      });

      res.status(200).json({ 
        status: 'processed',
        delivery_id: delivery,
        processing_time_ms: processingTime
      });
      
    } catch (error) {
      this.metrics.webhooksFailed++;
      
      log('error', '❌ Webhook processing error', {
        error: error.message,
        stack: error.stack,
        delivery_id: req.headers['x-github-delivery']
      });
      
      res.status(500).json({ 
        error: 'Processing failed',
        message: error.message
      });
    }
  }

  /**
   * Handle pull request events
   * @param {Object} payload - GitHub webhook payload
   */
  async handlePullRequest(payload) {
    const { action, pull_request, repository } = payload;
    
    if (!['opened', 'synchronize', 'reopened'].includes(action)) {
      log('info', `Ignoring PR action: ${action}`);
      return;
    }

    log('info', `Processing PR #${pull_request.number}`, {
      action,
      repository: repository.full_name,
      branch: pull_request.head.ref,
      author: pull_request.user.login
    });

    // Check if validation already exists
    let validation = await PRValidation.findByPR(pull_request.number, repository.full_name);
    
    if (validation && validation.status === ValidationStatus.RUNNING) {
      log('info', 'Validation already running for this PR', {
        validation_id: validation.id,
        pr_number: pull_request.number
      });
      return;
    }

    // Create or update validation record
    if (!validation) {
      validation = await PRValidation.create({
        pr_number: pull_request.number,
        repository: repository.full_name,
        branch_name: pull_request.head.ref,
        status: ValidationStatus.PENDING,
        webhook_payload: payload,
        metadata: {
          action,
          author: pull_request.user.login,
          created_at: pull_request.created_at,
          updated_at: pull_request.updated_at
        }
      });
      
      this.metrics.validationsStarted++;
    } else {
      await validation.updateStatus(ValidationStatus.PENDING, {
        webhook_payload: payload,
        updated_at: new Date().toISOString()
      });
    }

    // Trigger validation pipeline
    await this.triggerValidation(validation, pull_request);
  }

  /**
   * Handle push events
   * @param {Object} payload - GitHub webhook payload
   */
  async handlePush(payload) {
    const { ref, repository, commits } = payload;
    
    log('info', `Processing push to ${ref}`, {
      repository: repository.full_name,
      commits: commits.length,
      head_commit: payload.head_commit?.id
    });

    // For now, we only handle pushes to main/master branches
    if (!ref.endsWith('/main') && !ref.endsWith('/master')) {
      return;
    }

    // Could trigger additional validations or notifications here
    log('info', `Push to main branch detected`, {
      repository: repository.full_name,
      commits: commits.length
    });
  }

  /**
   * Handle check run events
   * @param {Object} payload - GitHub webhook payload
   */
  async handleCheckRun(payload) {
    const { action, check_run, repository } = payload;
    
    log('info', `Processing check run: ${action}`, {
      repository: repository.full_name,
      check_name: check_run.name,
      status: check_run.status,
      conclusion: check_run.conclusion
    });

    // Update any related validations
    if (check_run.pull_requests?.length > 0) {
      for (const pr of check_run.pull_requests) {
        const validation = await PRValidation.findByPR(pr.number, repository.full_name);
        if (validation) {
          await validation.setResults({
            ...validation.validation_results,
            check_runs: {
              ...validation.validation_results.check_runs,
              [check_run.name]: {
                status: check_run.status,
                conclusion: check_run.conclusion,
                completed_at: check_run.completed_at
              }
            }
          });
        }
      }
    }
  }

  /**
   * Handle check suite events
   * @param {Object} payload - GitHub webhook payload
   */
  async handleCheckSuite(payload) {
    const { action, check_suite, repository } = payload;
    
    log('info', `Processing check suite: ${action}`, {
      repository: repository.full_name,
      status: check_suite.status,
      conclusion: check_suite.conclusion
    });

    // Handle completed check suites
    if (action === 'completed' && check_suite.pull_requests?.length > 0) {
      for (const pr of check_suite.pull_requests) {
        const validation = await PRValidation.findByPR(pr.number, repository.full_name);
        if (validation) {
          await this.handleCheckSuiteCompletion(validation, check_suite);
        }
      }
    }
  }

  /**
   * Handle pull request review events
   * @param {Object} payload - GitHub webhook payload
   */
  async handlePullRequestReview(payload) {
    const { action, review, pull_request, repository } = payload;
    
    log('info', `Processing PR review: ${action}`, {
      repository: repository.full_name,
      pr_number: pull_request.number,
      review_state: review.state,
      reviewer: review.user.login
    });

    const validation = await PRValidation.findByPR(pull_request.number, repository.full_name);
    if (validation) {
      await validation.setResults({
        ...validation.validation_results,
        reviews: {
          ...validation.validation_results.reviews,
          [review.id]: {
            state: review.state,
            reviewer: review.user.login,
            submitted_at: review.submitted_at
          }
        }
      });
    }
  }

  /**
   * Handle ping events
   * @param {Object} payload - GitHub webhook payload
   */
  async handlePing(payload) {
    log('info', 'Received ping webhook', {
      zen: payload.zen,
      hook_id: payload.hook?.id
    });
  }

  /**
   * Trigger validation pipeline
   * @param {PRValidation} validation - Validation instance
   * @param {Object} pullRequest - GitHub PR object
   */
  async triggerValidation(validation, pullRequest) {
    try {
      log('info', `Triggering validation pipeline`, {
        validation_id: validation.id,
        pr_number: validation.pr_number
      });

      await this.validationPipeline.execute(validation, pullRequest);
      
      this.metrics.validationsCompleted++;
      
    } catch (error) {
      this.metrics.validationsFailed++;
      
      await validation.updateStatus(ValidationStatus.FAILED, { 
        error_message: error.message 
      });
      
      log('error', 'Validation pipeline failed', {
        validation_id: validation.id,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Handle check suite completion
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   */
  async handleCheckSuiteCompletion(validation, checkSuite) {
    if (checkSuite.conclusion === 'failure') {
      // Check if this is a Codegen-related failure that needs fixing
      await this.codegenClient.requestFixes({
        pr_number: validation.pr_number,
        repository: validation.repository,
        check_suite: checkSuite,
        validation_id: validation.id
      });
    }
  }

  /**
   * Health check endpoint
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  healthCheck(req, res) {
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }

  /**
   * Detailed health check endpoint
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async detailedHealthCheck(req, res) {
    try {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
          codegen: 'unknown',
          github: 'unknown'
        },
        metrics: this.metrics
      };

      // Check Codegen service
      try {
        await this.codegenClient.getHealth();
        health.services.codegen = 'ok';
      } catch (error) {
        health.services.codegen = 'error';
        health.status = 'degraded';
      }

      // Check GitHub API
      try {
        await this.prAnalyzer.octokit.rest.meta.get();
        health.services.github = 'ok';
      } catch (error) {
        health.services.github = 'error';
        health.status = 'degraded';
      }

      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  }

  /**
   * Get system status
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getSystemStatus(req, res) {
    const status = {
      server: {
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        started_at: this.metrics.startTime
      },
      metrics: this.metrics,
      queue: this.codegenClient.getQueueStatus(),
      configuration: {
        validation_rules: this.config.validation,
        rate_limits: this.config.rateLimit
      }
    };

    res.json(status);
  }

  /**
   * Get metrics
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getMetrics(req, res) {
    res.json(this.metrics);
  }

  /**
   * Get validation by ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getValidation(req, res) {
    try {
      const validation = await PRValidation.findByPR(req.params.id);
      if (!validation) {
        return res.status(404).json({ error: 'Validation not found' });
      }
      res.json(validation.toJSON());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List validations
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async listValidations(req, res) {
    try {
      const status = req.query.status;
      const validations = status 
        ? await PRValidation.findByStatus(status)
        : await PRValidation.findByStatus('pending'); // Default to pending

      res.json({
        validations: validations.map(v => v.getSummary()),
        total: validations.length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get queue status (admin endpoint)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getQueueStatus(req, res) {
    res.json(this.codegenClient.getQueueStatus());
  }

  /**
   * Retry validation (admin endpoint)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async retryValidation(req, res) {
    try {
      const validation = await PRValidation.findByPR(req.params.id);
      if (!validation) {
        return res.status(404).json({ error: 'Validation not found' });
      }

      if (!validation.canRetry()) {
        return res.status(400).json({ error: 'Validation cannot be retried' });
      }

      await validation.incrementRetry();
      await validation.updateStatus(ValidationStatus.PENDING);

      res.json({ message: 'Validation retry initiated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Reset metrics (admin endpoint)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  resetMetrics(req, res) {
    this.metrics = {
      webhooksReceived: 0,
      webhooksProcessed: 0,
      webhooksFailed: 0,
      validationsStarted: 0,
      validationsCompleted: 0,
      validationsFailed: 0,
      startTime: new Date()
    };

    res.json({ message: 'Metrics reset successfully' });
  }

  /**
   * CORS middleware
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  corsMiddleware(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  }

  /**
   * Request logging middleware
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  requestLoggingMiddleware(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      log('info', 'HTTP Request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration_ms: duration,
        user_agent: req.get('User-Agent'),
        ip: req.ip
      });
    });
    
    next();
  }

  /**
   * Validate configuration
   * @private
   */
  async validateConfiguration() {
    if (!this.config.github.token) {
      throw new Error('GitHub token is required');
    }

    if (!this.config.github.webhookSecret) {
      log('warn', 'GitHub webhook secret not configured - signature verification disabled');
    }

    if (!this.config.codegen.apiKey) {
      log('warn', 'Codegen API key not configured - some features may not work');
    }
  }

  /**
   * Setup graceful shutdown
   * @private
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      log('info', `Received ${signal}, shutting down gracefully`);
      
      if (this.server) {
        this.server.close(() => {
          log('info', 'HTTP server closed');
          process.exit(0);
        });
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Start health monitoring
   * @private
   */
  startHealthMonitoring() {
    if (this.config.monitoring.enableMetrics) {
      setInterval(() => {
        log('info', 'Health check', {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          metrics: this.metrics
        });
      }, this.config.monitoring.healthCheckInterval);
    }
  }
}

export default GitHubWebhookServer;

