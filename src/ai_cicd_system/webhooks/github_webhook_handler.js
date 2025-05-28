/**
 * @fileoverview GitHub Webhook Handler
 * @description Main webhook processing logic for GitHub events
 */

import crypto from 'crypto';
import { log } from '../utils/simple_logger.js';
import { EventProcessor } from './event_processor.js';
import { SignatureValidator } from './signature_validator.js';

/**
 * GitHub webhook handler
 * Processes incoming GitHub webhook events with security validation
 */
export class GitHubWebhookHandler {
    constructor(config, database) {
        this.config = {
            github: {
                webhook_secret: config.github?.webhook_secret || process.env.GITHUB_WEBHOOK_SECRET,
                user_agent_validation: config.github?.user_agent_validation !== false,
                require_signature: config.github?.require_signature !== false,
                ...config.github
            },
            server: {
                enable_cors: config.server?.enable_cors !== false,
                cors_origins: config.server?.cors_origins || ['*'],
                max_payload_size: config.server?.max_payload_size || '10mb',
                request_timeout: config.server?.request_timeout || 30000,
                ...config.server
            },
            processing: {
                enable_async_processing: config.processing?.enable_async_processing !== false,
                max_concurrent_events: config.processing?.max_concurrent_events || 10,
                enable_rate_limiting: config.processing?.enable_rate_limiting !== false,
                rate_limit_window: config.processing?.rate_limit_window || 60000, // 1 minute
                rate_limit_max_requests: config.processing?.rate_limit_max_requests || 100,
                ...config.processing
            },
            ...config
        };

        this.database = database;
        this.eventProcessor = new EventProcessor(database, config.event_processor);
        this.signatureValidator = new SignatureValidator(this.config.github.webhook_secret);
        
        // Supported GitHub event types
        this.supportedEvents = [
            'pull_request',
            'pull_request_review',
            'push',
            'issues',
            'issue_comment',
            'ping' // GitHub webhook test event
        ];

        // Rate limiting tracking
        this.rateLimitMap = new Map();
        
        // Processing metrics
        this.metrics = {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            rejected_requests: 0,
            signature_failures: 0,
            unsupported_events: 0,
            rate_limited_requests: 0,
            last_request_at: null
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the webhook handler
     */
    async initialize() {
        log('debug', 'Initializing GitHub webhook handler...');
        
        if (!this.config.github.webhook_secret) {
            throw new Error('GitHub webhook secret is required');
        }

        await this.eventProcessor.initialize();
        
        this.isInitialized = true;
        log('debug', 'GitHub webhook handler initialized');
    }

    /**
     * Handle incoming webhook request
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<Object>} Response object
     */
    async handleWebhook(req, res) {
        if (!this.isInitialized) {
            return this.sendErrorResponse(res, 500, 'HANDLER_NOT_INITIALIZED', 'Webhook handler not initialized');
        }

        const startTime = Date.now();
        this.metrics.total_requests++;
        this.metrics.last_request_at = new Date();

        try {
            // Extract headers
            const signature = req.headers['x-hub-signature-256'];
            const event = req.headers['x-github-event'];
            const deliveryId = req.headers['x-github-delivery'];
            const userAgent = req.headers['user-agent'];

            log('info', `Received webhook: ${event} (${deliveryId})`);

            // Validate request headers
            const headerValidation = this.validateHeaders(signature, event, deliveryId, userAgent);
            if (!headerValidation.isValid) {
                this.metrics.rejected_requests++;
                return this.sendErrorResponse(res, 400, 'INVALID_HEADERS', headerValidation.error);
            }

            // Check rate limiting
            if (this.config.processing.enable_rate_limiting) {
                const rateLimitResult = this.checkRateLimit(req.ip || 'unknown');
                if (!rateLimitResult.allowed) {
                    this.metrics.rate_limited_requests++;
                    return this.sendErrorResponse(res, 429, 'RATE_LIMITED', 'Rate limit exceeded', {
                        'X-RateLimit-Limit': this.config.processing.rate_limit_max_requests,
                        'X-RateLimit-Remaining': rateLimitResult.remaining,
                        'X-RateLimit-Reset': rateLimitResult.resetTime
                    });
                }
            }

            // Validate webhook signature
            if (this.config.github.require_signature) {
                const payload = req.rawBody || JSON.stringify(req.body);
                const isValidSignature = this.signatureValidator.validateSignature(payload, signature);
                
                if (!isValidSignature) {
                    this.metrics.signature_failures++;
                    log('warn', `Invalid webhook signature for delivery ${deliveryId}`);
                    return this.sendErrorResponse(res, 401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
                }
            }

            // Handle ping event (GitHub webhook test)
            if (event === 'ping') {
                return this.handlePingEvent(req, res);
            }

            // Check if event type is supported
            if (!this.supportedEvents.includes(event)) {
                this.metrics.unsupported_events++;
                log('info', `Unsupported event type: ${event}`);
                return this.sendSuccessResponse(res, {
                    message: 'Event type not supported',
                    event_type: event,
                    supported_events: this.supportedEvents
                });
            }

            // Prepare event data
            const eventData = {
                id: deliveryId,
                type: event,
                payload: req.body,
                received_at: new Date(),
                processed: false,
                metadata: {
                    user_agent: userAgent,
                    source_ip: req.ip,
                    processing_started_at: new Date()
                }
            };

            // Process the event
            let processingResult;
            if (this.config.processing.enable_async_processing) {
                // Process asynchronously and return immediate response
                this.processEventAsync(eventData);
                processingResult = { status: 'accepted', message: 'Event queued for processing' };
            } else {
                // Process synchronously
                processingResult = await this.eventProcessor.processEvent(eventData);
            }

            this.metrics.successful_requests++;
            const processingTime = Date.now() - startTime;

            log('info', `Successfully handled webhook ${deliveryId} in ${processingTime}ms`);

            return this.sendSuccessResponse(res, {
                message: 'Webhook processed successfully',
                event_id: deliveryId,
                event_type: event,
                processing_time_ms: processingTime,
                result: processingResult
            });

        } catch (error) {
            this.metrics.failed_requests++;
            log('error', `Webhook processing error: ${error.message}`);
            
            return this.sendErrorResponse(res, 500, 'PROCESSING_ERROR', error.message, {
                'X-Processing-Time': Date.now() - startTime
            });
        }
    }

    /**
     * Handle GitHub ping event
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @returns {Object} Response
     */
    handlePingEvent(req, res) {
        const { zen, hook_id, hook } = req.body;
        
        log('info', `Received GitHub ping event: ${zen}`);
        
        return this.sendSuccessResponse(res, {
            message: 'Webhook endpoint is healthy',
            zen: zen,
            hook_id: hook_id,
            events: hook?.events || [],
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Process event asynchronously
     * @param {Object} eventData - Event data
     */
    async processEventAsync(eventData) {
        try {
            await this.eventProcessor.processEvent(eventData);
            log('debug', `Async processing completed for event ${eventData.id}`);
        } catch (error) {
            log('error', `Async processing failed for event ${eventData.id}: ${error.message}`);
        }
    }

    /**
     * Validate request headers
     * @param {string} signature - Webhook signature
     * @param {string} event - Event type
     * @param {string} deliveryId - Delivery ID
     * @param {string} userAgent - User agent
     * @returns {Object} Validation result
     */
    validateHeaders(signature, event, deliveryId, userAgent) {
        const errors = [];

        if (this.config.github.require_signature && !signature) {
            errors.push('Missing X-Hub-Signature-256 header');
        }

        if (!event) {
            errors.push('Missing X-GitHub-Event header');
        }

        if (!deliveryId) {
            errors.push('Missing X-GitHub-Delivery header');
        }

        if (this.config.github.user_agent_validation && (!userAgent || !userAgent.includes('GitHub-Hookshot/'))) {
            errors.push('Invalid or missing User-Agent header');
        }

        return {
            isValid: errors.length === 0,
            error: errors.join(', ')
        };
    }

    /**
     * Check rate limiting for IP address
     * @param {string} ip - Client IP address
     * @returns {Object} Rate limit result
     */
    checkRateLimit(ip) {
        const now = Date.now();
        const windowStart = now - this.config.processing.rate_limit_window;
        
        // Clean up old entries
        for (const [clientIp, requests] of this.rateLimitMap.entries()) {
            const filteredRequests = requests.filter(timestamp => timestamp > windowStart);
            if (filteredRequests.length === 0) {
                this.rateLimitMap.delete(clientIp);
            } else {
                this.rateLimitMap.set(clientIp, filteredRequests);
            }
        }

        // Get current requests for this IP
        const requests = this.rateLimitMap.get(ip) || [];
        const recentRequests = requests.filter(timestamp => timestamp > windowStart);

        // Check if limit exceeded
        const allowed = recentRequests.length < this.config.processing.rate_limit_max_requests;
        
        if (allowed) {
            // Add current request
            recentRequests.push(now);
            this.rateLimitMap.set(ip, recentRequests);
        }

        return {
            allowed: allowed,
            remaining: Math.max(0, this.config.processing.rate_limit_max_requests - recentRequests.length),
            resetTime: Math.ceil((windowStart + this.config.processing.rate_limit_window) / 1000)
        };
    }

    /**
     * Setup webhook endpoints on Express app
     * @param {Object} app - Express app instance
     */
    async setupWebhookEndpoints(app) {
        log('debug', 'Setting up webhook endpoints...');

        // Middleware for raw body parsing (required for signature validation)
        app.use('/webhooks/github', (req, res, next) => {
            let data = '';
            req.setEncoding('utf8');
            req.on('data', chunk => data += chunk);
            req.on('end', () => {
                req.rawBody = data;
                try {
                    req.body = JSON.parse(data);
                } catch (error) {
                    req.body = {};
                }
                next();
            });
        });

        // CORS middleware
        if (this.config.server.enable_cors) {
            app.use('/webhooks/*', (req, res, next) => {
                const origin = req.headers.origin;
                const allowedOrigins = this.config.server.cors_origins;
                
                if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                    res.header('Access-Control-Allow-Origin', origin || '*');
                }
                
                res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature-256, X-GitHub-Event, X-GitHub-Delivery');
                
                if (req.method === 'OPTIONS') {
                    return res.sendStatus(200);
                }
                
                next();
            });
        }

        // Main webhook endpoint
        app.post('/webhooks/github', async (req, res) => {
            await this.handleWebhook(req, res);
        });

        // Health check endpoint
        app.get('/webhooks/health', (req, res) => {
            const health = this.getHealth();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        });

        // Metrics endpoint
        app.get('/webhooks/metrics', (req, res) => {
            res.json(this.getMetrics());
        });

        // Event replay endpoint
        app.post('/webhooks/replay/:eventId', async (req, res) => {
            try {
                const eventId = req.params.eventId;
                const result = await this.eventProcessor.replayEvent(eventId);
                res.json({
                    message: 'Event replayed successfully',
                    result: result
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Event replay failed',
                    message: error.message
                });
            }
        });

        // Configuration endpoint
        app.get('/webhooks/config', (req, res) => {
            res.json({
                supported_events: this.supportedEvents,
                rate_limiting: {
                    enabled: this.config.processing.enable_rate_limiting,
                    max_requests: this.config.processing.rate_limit_max_requests,
                    window_ms: this.config.processing.rate_limit_window
                },
                signature_validation: this.config.github.require_signature,
                async_processing: this.config.processing.enable_async_processing
            });
        });

        log('debug', 'Webhook endpoints configured');
    }

    /**
     * Send success response
     * @param {Object} res - Response object
     * @param {Object} data - Response data
     * @returns {Object} Response
     */
    sendSuccessResponse(res, data) {
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            ...data
        });
    }

    /**
     * Send error response
     * @param {Object} res - Response object
     * @param {number} statusCode - HTTP status code
     * @param {string} errorCode - Error code
     * @param {string} message - Error message
     * @param {Object} headers - Additional headers
     * @returns {Object} Response
     */
    sendErrorResponse(res, statusCode, errorCode, message, headers = {}) {
        // Set additional headers
        Object.entries(headers).forEach(([key, value]) => {
            res.header(key, value);
        });

        return res.status(statusCode).json({
            success: false,
            error: {
                code: errorCode,
                message: message
            },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get handler metrics
     * @returns {Object} Metrics
     */
    getMetrics() {
        const successRate = this.metrics.total_requests > 0 
            ? (this.metrics.successful_requests / this.metrics.total_requests) * 100 
            : 0;

        return {
            ...this.metrics,
            success_rate: successRate,
            active_rate_limit_entries: this.rateLimitMap.size,
            event_processor_metrics: this.eventProcessor.getMetrics()
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const metrics = this.getMetrics();
        const isHealthy = this.isInitialized && 
                         metrics.success_rate >= 95 && 
                         metrics.signature_failures < 10;

        return {
            status: isHealthy ? 'healthy' : 'degraded',
            initialized: this.isInitialized,
            supported_events: this.supportedEvents,
            metrics: metrics,
            event_processor: this.eventProcessor.getHealth(),
            signature_validator: this.signatureValidator.getHealth(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Shutdown the webhook handler
     */
    async shutdown() {
        log('debug', 'Shutting down GitHub webhook handler...');
        
        await this.eventProcessor.shutdown();
        this.rateLimitMap.clear();
        this.isInitialized = false;
        
        log('debug', 'GitHub webhook handler shut down');
    }
}

export default GitHubWebhookHandler;

