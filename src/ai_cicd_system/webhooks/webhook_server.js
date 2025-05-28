/**
 * @fileoverview Main Webhook Server
 * @description Express-based webhook server for handling GitHub, Linear, Codegen, and Claude Code events
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { WebhookProcessor } from './webhook_processor.js';
import { GitHubHandler } from './github_handler.js';
import { LinearHandler } from './linear_handler.js';
import { WorkflowEngine } from './workflow_engine.js';
import { WebhookValidator } from '../security/webhook_validator.js';
import { RateLimiter } from '../middleware/rate_limiter.js';
import { EventQueue } from '../events/event_queue.js';
import { EventRouter } from '../events/event_router.js';
import { EventStore } from '../events/event_store.js';
import { RetryManager } from '../events/retry_manager.js';

/**
 * Webhook Server class
 */
export class WebhookServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || process.env.WEBHOOK_PORT || 3000,
            host: config.host || process.env.WEBHOOK_HOST || '0.0.0.0',
            cors: config.cors || { origin: true, credentials: true },
            compression: config.compression !== false,
            rateLimit: config.rateLimit || {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 1000, // limit each IP to 1000 requests per windowMs
                message: 'Too many webhook requests from this IP'
            },
            webhooks: {
                github: {
                    secret: config.github?.secret || process.env.GITHUB_WEBHOOK_SECRET,
                    events: config.github?.events || ['pull_request', 'push', 'issue_comment'],
                    path: config.github?.path || '/webhooks/github'
                },
                linear: {
                    secret: config.linear?.secret || process.env.LINEAR_WEBHOOK_SECRET,
                    events: config.linear?.events || ['issue.update', 'issue.create'],
                    path: config.linear?.path || '/webhooks/linear'
                },
                codegen: {
                    secret: config.codegen?.secret || process.env.CODEGEN_WEBHOOK_SECRET,
                    events: config.codegen?.events || ['generation.complete', 'generation.failed'],
                    path: config.codegen?.path || '/webhooks/codegen'
                },
                claude_code: {
                    secret: config.claude_code?.secret || process.env.CLAUDE_CODE_WEBHOOK_SECRET,
                    events: config.claude_code?.events || ['validation.complete', 'validation.failed'],
                    path: config.claude_code?.path || '/webhooks/claude-code'
                }
            },
            ...config
        };

        this.app = express();
        this.server = null;
        this.isRunning = false;
        
        // Initialize components
        this.eventQueue = new EventQueue(this.config.eventQueue);
        this.eventRouter = new EventRouter(this.config.eventRouter);
        this.eventStore = new EventStore(this.config.eventStore);
        this.retryManager = new RetryManager(this.config.retryManager);
        this.webhookValidator = new WebhookValidator(this.config.webhooks);
        this.rateLimiter = new RateLimiter(this.config.rateLimit);
        
        // Initialize handlers
        this.githubHandler = new GitHubHandler(this.config.webhooks.github);
        this.linearHandler = new LinearHandler(this.config.webhooks.linear);
        this.workflowEngine = new WorkflowEngine(this.config.workflow);
        
        // Initialize webhook processor
        this.webhookProcessor = new WebhookProcessor({
            eventQueue: this.eventQueue,
            eventRouter: this.eventRouter,
            eventStore: this.eventStore,
            retryManager: this.retryManager,
            handlers: {
                github: this.githubHandler,
                linear: this.linearHandler
            },
            workflowEngine: this.workflowEngine
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Basic middleware
        if (this.config.compression) {
            this.app.use(compression());
        }

        if (this.config.cors) {
            this.app.use(cors(this.config.cors));
        }

        // Rate limiting
        if (this.config.rateLimit) {
            this.app.use(rateLimit(this.config.rateLimit));
        }

        // Custom rate limiter for webhook endpoints
        this.app.use('/webhooks/*', this.rateLimiter.middleware());

        // Body parsing with size limits
        this.app.use(express.json({ 
            limit: '10mb',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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

        // Metrics endpoint
        this.app.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.getMetrics();
                res.json(metrics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });

        // GitHub webhook endpoint
        this.app.post(this.config.webhooks.github.path, async (req, res) => {
            try {
                await this.handleWebhook('github', req, res);
            } catch (error) {
                console.error('GitHub webhook error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Linear webhook endpoint
        this.app.post(this.config.webhooks.linear.path, async (req, res) => {
            try {
                await this.handleWebhook('linear', req, res);
            } catch (error) {
                console.error('Linear webhook error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Codegen webhook endpoint
        this.app.post(this.config.webhooks.codegen.path, async (req, res) => {
            try {
                await this.handleWebhook('codegen', req, res);
            } catch (error) {
                console.error('Codegen webhook error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Claude Code webhook endpoint
        this.app.post(this.config.webhooks.claude_code.path, async (req, res) => {
            try {
                await this.handleWebhook('claude_code', req, res);
            } catch (error) {
                console.error('Claude Code webhook error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Event status endpoint
        this.app.get('/events/:eventId/status', async (req, res) => {
            try {
                const status = await this.eventStore.getEventStatus(req.params.eventId);
                res.json(status);
            } catch (error) {
                res.status(404).json({ error: 'Event not found' });
            }
        });

        // Event retry endpoint
        this.app.post('/events/:eventId/retry', async (req, res) => {
            try {
                await this.retryManager.retryEvent(req.params.eventId);
                res.json({ message: 'Event queued for retry' });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
    }

    /**
     * Handle incoming webhook
     * @param {string} source - Webhook source (github, linear, etc.)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async handleWebhook(source, req, res) {
        const startTime = Date.now();
        
        try {
            // Validate webhook signature
            const isValid = await this.webhookValidator.validateSignature(source, req);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // Create event object
            const event = {
                id: this.generateEventId(),
                source,
                type: this.extractEventType(source, req),
                payload: req.body,
                headers: req.headers,
                timestamp: new Date().toISOString(),
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                }
            };

            // Process webhook
            const result = await this.webhookProcessor.processWebhook(event);

            // Send response
            const responseTime = Date.now() - startTime;
            res.json({
                success: true,
                eventId: event.id,
                processingTime: responseTime,
                result: result.summary
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error(`Webhook processing error (${source}):`, error);
            
            res.status(500).json({
                success: false,
                error: error.message,
                processingTime: responseTime
            });
        }
    }

    /**
     * Extract event type from webhook request
     * @param {string} source - Webhook source
     * @param {Object} req - Express request object
     * @returns {string} Event type
     */
    extractEventType(source, req) {
        switch (source) {
            case 'github':
                return req.headers['x-github-event'] || 'unknown';
            case 'linear':
                return req.body.type || 'unknown';
            case 'codegen':
                return req.body.event_type || 'unknown';
            case 'claude_code':
                return req.body.event_type || 'unknown';
            default:
                return 'unknown';
        }
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('Unhandled error:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        });

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    /**
     * Start the webhook server
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Server is already running');
        }

        try {
            // Initialize components
            await this.eventQueue.initialize();
            await this.eventStore.initialize();
            await this.retryManager.initialize();

            // Start server
            this.server = this.app.listen(this.config.port, this.config.host, () => {
                console.log(`Webhook server listening on ${this.config.host}:${this.config.port}`);
                this.isRunning = true;
            });

            // Start background processes
            await this.startBackgroundProcesses();

        } catch (error) {
            console.error('Failed to start webhook server:', error);
            throw error;
        }
    }

    /**
     * Start background processes
     */
    async startBackgroundProcesses() {
        // Start event processing
        this.eventQueue.startProcessing();
        
        // Start retry manager
        this.retryManager.startRetryLoop();

        // Start health monitoring
        this.startHealthMonitoring();
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            try {
                const health = await this.getHealth();
                if (health.status !== 'healthy') {
                    console.warn('Webhook server health check failed:', health);
                }
            } catch (error) {
                console.error('Health check error:', error);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop the webhook server
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (!this.isRunning) {
            return;
        }

        console.log('Shutting down webhook server...');

        try {
            // Stop accepting new connections
            if (this.server) {
                this.server.close();
            }

            // Stop background processes
            await this.eventQueue.shutdown();
            await this.retryManager.shutdown();

            this.isRunning = false;
            console.log('Webhook server shut down successfully');

        } catch (error) {
            console.error('Error during shutdown:', error);
            throw error;
        }
    }

    /**
     * Get server health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const components = {
            server: this.isRunning ? 'healthy' : 'unhealthy',
            eventQueue: await this.eventQueue.getHealth(),
            eventStore: await this.eventStore.getHealth(),
            retryManager: await this.retryManager.getHealth()
        };

        const unhealthyComponents = Object.entries(components)
            .filter(([, status]) => status !== 'healthy')
            .map(([name]) => name);

        return {
            status: unhealthyComponents.length === 0 ? 'healthy' : 'unhealthy',
            components,
            unhealthyComponents,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get server metrics
     * @returns {Promise<Object>} Server metrics
     */
    async getMetrics() {
        const eventQueueMetrics = await this.eventQueue.getMetrics();
        const eventStoreMetrics = await this.eventStore.getMetrics();
        const retryManagerMetrics = await this.retryManager.getMetrics();

        return {
            server: {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            },
            eventQueue: eventQueueMetrics,
            eventStore: eventStoreMetrics,
            retryManager: retryManagerMetrics,
            timestamp: new Date().toISOString()
        };
    }
}

export default WebhookServer;

