#!/usr/bin/env node

/**
 * Webhook Server for Claude Task Master
 * Handles GitHub, Linear, and Codegen webhook events
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Import webhook routes
import githubRoutes from './routes/github.js';
import linearRoutes from './routes/linear.js';
import codegenRoutes from './routes/codegen.js';
import statusRoutes from './routes/status.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { rateLimiter } from './middleware/rate-limiter.js';

// Import services
import { DatabaseService } from './services/database.js';
import { WebhookProcessor } from './services/webhook-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

class WebhookServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.WEBHOOK_PORT || 3001;
    this.host = process.env.WEBHOOK_HOST || 'localhost';
    
    // Initialize services
    this.database = new DatabaseService();
    this.processor = new WebhookProcessor(this.database);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow webhook payloads
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration for webhook endpoints
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-GitHub-Event', 'X-GitHub-Delivery', 'X-Hub-Signature-256']
    }));

    // Request logging
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use(rateLimiter);

    // Raw body parser for webhook signature verification
    this.app.use('/webhooks', express.raw({ 
      type: 'application/json',
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));

    // JSON parser for other routes
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Webhook routes
    this.app.use('/webhooks/github', githubRoutes);
    this.app.use('/webhooks/linear', linearRoutes);
    this.app.use('/webhooks/codegen', codegenRoutes);
    this.app.use('/webhooks/status', statusRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Start the webhook server
   */
  async start() {
    try {
      // Initialize database connection
      await this.database.connect();
      console.log('✅ Database connected successfully');

      // Start HTTP server
      this.server = createServer(this.app);
      
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, this.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log(`🚀 Webhook server running on http://${this.host}:${this.port}`);
      console.log(`📊 Health check: http://${this.host}:${this.port}/health`);
      console.log(`🪝 GitHub webhooks: http://${this.host}:${this.port}/webhooks/github`);
      console.log(`📋 Linear webhooks: http://${this.host}:${this.port}/webhooks/linear`);
      console.log(`🤖 Codegen webhooks: http://${this.host}:${this.port}/webhooks/codegen`);

    } catch (error) {
      console.error('❌ Failed to start webhook server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        console.log('✅ HTTP server closed');
      }

      // Close database connection
      await this.database.disconnect();
      console.log('✅ Database disconnected');

      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WebhookServer();
  server.start();
}

export default WebhookServer;

