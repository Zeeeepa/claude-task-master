/**
 * GitHub Webhook Server
 * 
 * Express.js server for handling GitHub webhook events with comprehensive
 * security, routing, and error handling capabilities.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { WebhookProcessor } from './webhook-processor.js';
import { webhookMiddleware } from './middleware.js';
import { logger } from '../utils/logger.js';

export class WebhookServer {
  constructor(config = {}) {
    this.app = express();
    this.config = {
      port: config.port || process.env.WEBHOOK_PORT || 3000,
      host: config.host || process.env.WEBHOOK_HOST || '0.0.0.0',
      secret: config.secret || process.env.GITHUB_WEBHOOK_SECRET,
      maxPayloadSize: config.maxPayloadSize || '10mb',
      ...config
    };
    
    this.processor = new WebhookProcessor(this.config);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware for security and performance
   */
  setupMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

    // Rate limiting for webhook endpoints
    const webhookLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many webhook requests from this IP',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Slow down repeated requests
    const speedLimiter = slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 100, // Allow 100 requests per 15 minutes at full speed
      delayMs: 500, // Add 500ms delay per request after delayAfter
      maxDelayMs: 20000, // Maximum delay of 20 seconds
    });

    // Apply middleware
    this.app.use('/webhooks', webhookLimiter);
    this.app.use('/webhooks', speedLimiter);
    
    // Parse JSON with size limit
    this.app.use(express.json({ 
      limit: this.config.maxPayloadSize,
      verify: (req, res, buf) => {
        // Store raw body for signature verification
        req.rawBody = buf;
      }
    }));

    // Custom webhook middleware
    this.app.use('/webhooks', webhookMiddleware(this.config));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Webhook request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });
      next();
    });
  }

  /**
   * Setup webhook routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // GitHub webhook endpoint
    this.app.post('/webhooks/github', async (req, res) => {
      try {
        const signature = req.get('X-Hub-Signature-256');
        const event = req.get('X-GitHub-Event');
        const delivery = req.get('X-GitHub-Delivery');

        logger.info('GitHub webhook received', {
          event,
          delivery,
          action: req.body?.action,
          repository: req.body?.repository?.full_name
        });

        // Process the webhook
        await this.processor.processWebhook(req.body, signature, {
          event,
          delivery,
          timestamp: new Date().toISOString()
        });

        res.status(200).json({
          success: true,
          message: 'Webhook processed successfully',
          delivery
        });

      } catch (error) {
        logger.error('Webhook processing failed', {
          error: error.message,
          stack: error.stack,
          delivery: req.get('X-GitHub-Delivery')
        });

        res.status(500).json({
          success: false,
          error: 'Internal server error',
          delivery: req.get('X-GitHub-Delivery')
        });
      }
    });

    // Webhook management endpoints
    this.app.get('/webhooks/status', (req, res) => {
      res.json({
        server: 'running',
        processor: this.processor.getStatus(),
        timestamp: new Date().toISOString()
      });
    });

    // Webhook replay endpoint for debugging
    this.app.post('/webhooks/replay/:deliveryId', async (req, res) => {
      try {
        const { deliveryId } = req.params;
        const result = await this.processor.replayWebhook(deliveryId);
        
        res.json({
          success: true,
          result
        });
      } catch (error) {
        logger.error('Webhook replay failed', {
          error: error.message,
          deliveryId: req.params.deliveryId
        });

        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error in webhook server', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Start the webhook server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          logger.info('Webhook server started', {
            host: this.config.host,
            port: this.config.port,
            environment: process.env.NODE_ENV || 'development'
          });
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Webhook server error', { error: error.message });
          reject(error);
        });

      } catch (error) {
        logger.error('Failed to start webhook server', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Stop the webhook server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: !!this.server,
      config: {
        port: this.config.port,
        host: this.config.host,
        hasSecret: !!this.config.secret
      },
      processor: this.processor.getStatus()
    };
  }
}

export default WebhookServer;

