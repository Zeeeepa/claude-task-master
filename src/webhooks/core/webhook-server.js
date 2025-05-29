/**
 * @fileoverview Consolidated Webhook Server
 * @description Unified webhook server consolidating Express.js implementations from PRs #48, #49, #58
 * @version 3.0.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { logger } from '../../utils/logger.js';

/**
 * Consolidated Webhook Server
 * Combines functionality from multiple PR implementations
 */
export class WebhookServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || process.env.WEBHOOK_PORT || 3000,
            host: config.host || process.env.WEBHOOK_HOST || '0.0.0.0',
            maxPayloadSize: config.maxPayloadSize || process.env.WEBHOOK_MAX_PAYLOAD_SIZE || '10mb',
            timeout: config.timeout || process.env.WEBHOOK_TIMEOUT || 30000,
            enableCors: config.enableCors !== false,
            enableCompression: config.enableCompression !== false,
            enableHelmet: config.enableHelmet !== false,
            trustProxy: config.trustProxy || false,
            ...config
        };

        this.security = config.security;
        this.eventProcessor = config.eventProcessor;
        this.errorHandler = config.errorHandler;
        this.monitoring = config.monitoring;
        
        this.logger = logger.child({ component: 'webhook-server' });
        this.app = null;
        this.server = null;
        this.isRunning = false;
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            validRequests: 0,
            invalidRequests: 0,
            errors: 0,
            startTime: null,
            lastRequestTime: null
        };
    }

    /**
     * Initialize the webhook server
     */
    async initialize() {
        this.logger.info('Initializing webhook server...');

        try {
            this.app = express();
            
            // Configure Express app
            this._configureMiddleware();
            this._configureRoutes();
            this._configureErrorHandling();
            
            this.logger.info('Webhook server initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize webhook server', { error: error.message });
            throw error;
        }
    }

    /**
     * Start the webhook server
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('Webhook server is already running');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                this.server = createServer(this.app);
                
                // Configure server settings
                this.server.timeout = this.config.timeout;
                this.server.keepAliveTimeout = 65000;
                this.server.headersTimeout = 66000;

                this.server.listen(this.config.port, this.config.host, () => {
                    this.isRunning = true;
                    this.stats.startTime = new Date();
                    
                    this.logger.info('Webhook server started', {
                        port: this.config.port,
                        host: this.config.host,
                        environment: process.env.NODE_ENV || 'development'
                    });
                    
                    resolve();
                });

                this.server.on('error', (error) => {
                    this.logger.error('Server error', { error: error.message });
                    reject(error);
                });

            } catch (error) {
                this.logger.error('Failed to start webhook server', { error: error.message });
                reject(error);
            }
        });
    }

    /**
     * Stop the webhook server
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        return new Promise((resolve) => {
            this.server.close(() => {
                this.isRunning = false;
                this.stats.startTime = null;
                this.logger.info('Webhook server stopped');
                resolve();
            });
        });
    }

    /**
     * Configure Express middleware
     */
    _configureMiddleware() {
        // Trust proxy if configured
        if (this.config.trustProxy) {
            this.app.set('trust proxy', this.config.trustProxy);
        }

        // Security middleware
        if (this.config.enableHelmet) {
            this.app.use(helmet({
                contentSecurityPolicy: false,
                crossOriginEmbedderPolicy: false
            }));
        }

        // CORS middleware
        if (this.config.enableCors) {
            this.app.use(cors({
                origin: this.config.corsOrigin || false,
                credentials: this.config.corsCredentials || false
            }));
        }

        // Compression middleware
        if (this.config.enableCompression) {
            this.app.use(compression());
        }

        // Rate limiting middleware
        if (this.config.rateLimit) {
            const limiter = rateLimit({
                windowMs: this.config.rateLimit.windowMs || 15 * 60 * 1000, // 15 minutes
                max: this.config.rateLimit.max || 100,
                message: {
                    error: 'Too many requests',
                    retryAfter: this.config.rateLimit.windowMs || 15 * 60 * 1000
                },
                standardHeaders: true,
                legacyHeaders: false
            });
            this.app.use(limiter);
        }

        // Request logging middleware
        this.app.use((req, res, next) => {
            this.stats.totalRequests++;
            this.stats.lastRequestTime = new Date();
            
            const startTime = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                
                this.logger.info('Request processed', {
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration,
                    userAgent: req.get('User-Agent'),
                    ip: req.ip
                });

                // Update statistics
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    this.stats.validRequests++;
                } else if (res.statusCode >= 400) {
                    this.stats.invalidRequests++;
                }

                // Report metrics
                if (this.monitoring) {
                    this.monitoring.recordMetric('webhook_request_duration', duration);
                    this.monitoring.recordMetric('webhook_request_total', 1);
                    this.monitoring.recordMetric(`webhook_response_${res.statusCode}`, 1);
                }
            });

            next();
        });

        // Body parsing middleware
        this.app.use(express.json({
            limit: this.config.maxPayloadSize,
            verify: (req, res, buf) => {
                // Store raw body for signature verification
                req.rawBody = buf;
            }
        }));

        this.app.use(express.urlencoded({
            extended: true,
            limit: this.config.maxPayloadSize
        }));
    }

    /**
     * Configure routes
     */
    _configureRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealth();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.status(statusCode).json({
                    success: true,
                    data: health
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: {
                        type: 'health_check_error',
                        message: 'Health check failed'
                    }
                });
            }
        });

        // Status endpoint
        this.app.get('/status', (req, res) => {
            res.json({
                success: true,
                data: {
                    status: this.isRunning ? 'running' : 'stopped',
                    stats: this.getStats(),
                    uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
                    timestamp: new Date().toISOString()
                }
            });
        });

        // Metrics endpoint
        this.app.get('/metrics', async (req, res) => {
            try {
                const metrics = this.monitoring ? await this.monitoring.getMetrics() : {};
                res.json({
                    success: true,
                    data: {
                        ...metrics,
                        server: this.getStats()
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: {
                        type: 'metrics_error',
                        message: 'Failed to collect metrics'
                    }
                });
            }
        });

        // Main webhook endpoint for GitHub events
        this.app.post('/webhooks/github', async (req, res) => {
            await this._handleWebhookRequest(req, res, 'github');
        });

        // Generic webhook endpoint
        this.app.post('/webhooks/:provider', async (req, res) => {
            await this._handleWebhookRequest(req, res, req.params.provider);
        });

        // Webhook management endpoints
        this.app.get('/webhooks/events', async (req, res) => {
            // List recent webhook events
            try {
                const events = await this.eventProcessor.getRecentEvents(req.query);
                res.json({
                    success: true,
                    data: events
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: {
                        type: 'list_error',
                        message: 'Failed to list webhook events'
                    }
                });
            }
        });

        this.app.post('/webhooks/replay/:eventId', async (req, res) => {
            // Replay a webhook event
            try {
                const result = await this.eventProcessor.replayEvent(req.params.eventId);
                res.json({
                    success: true,
                    data: result
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: {
                        type: 'replay_error',
                        message: 'Failed to replay event'
                    }
                });
            }
        });

        // Catch-all for undefined routes
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: {
                    type: 'not_found',
                    message: 'Endpoint not found'
                }
            });
        });
    }

    /**
     * Handle webhook requests
     */
    async _handleWebhookRequest(req, res, provider) {
        const timer = this.logger.timer(`webhook-${provider}`);
        
        try {
            // Security validation
            const securityResult = await this.security.validateRequest(req, provider);
            if (!securityResult.valid) {
                this.stats.invalidRequests++;
                return res.status(401).json({
                    success: false,
                    error: {
                        type: 'security_validation_failed',
                        message: securityResult.message
                    }
                });
            }

            // Process the webhook event
            const result = await this.eventProcessor.processWebhook(req, provider);
            
            timer.end('info');
            
            res.json({
                success: true,
                eventId: result.eventId,
                status: result.status,
                message: result.message,
                data: result.data
            });

        } catch (error) {
            this.stats.errors++;
            timer.end('error', { error: error.message });
            
            // Handle error through error handler
            const errorResponse = await this.errorHandler.handleWebhookError(error, req, provider);
            
            res.status(errorResponse.statusCode || 500).json({
                success: false,
                error: {
                    type: errorResponse.type || 'processing_error',
                    message: errorResponse.message || 'Webhook processing failed'
                }
            });
        }
    }

    /**
     * Configure error handling
     */
    _configureErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            this.stats.errors++;
            
            this.logger.error('Unhandled error in webhook server', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method
            });

            if (res.headersSent) {
                return next(error);
            }

            res.status(500).json({
                success: false,
                error: {
                    type: 'internal_server_error',
                    message: 'An unexpected error occurred'
                }
            });
        });
    }

    /**
     * Get server health status
     */
    async getHealth() {
        return {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            port: this.config.port,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
            stats: this.getStats()
        };
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            ...this.stats,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
            isRunning: this.isRunning
        };
    }
}

export default WebhookServer;

