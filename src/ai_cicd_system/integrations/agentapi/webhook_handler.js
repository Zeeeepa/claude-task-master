/**
 * AgentAPI Webhook Handler
 * 
 * Handles webhook processing for real-time status updates and event notifications
 * from AgentAPI and Claude Code validation processes.
 */

import express from 'express';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class WebhookHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            port: options.port || process.env.WEBHOOK_PORT || 3002,
            host: options.host || process.env.WEBHOOK_HOST || 'localhost',
            secret: options.secret || process.env.WEBHOOK_SECRET,
            enableSignatureValidation: options.enableSignatureValidation !== false,
            maxPayloadSize: options.maxPayloadSize || '10mb',
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            ...options
        };

        this.logger = new SimpleLogger('WebhookHandler', options.logLevel || 'info');
        this.app = express();
        this.server = null;
        this.isRunning = false;
        this.webhookEndpoints = new Map();
        this.eventQueue = [];
        this.processingQueue = false;

        this._setupMiddleware();
        this._setupRoutes();
        this._setupDefaultHandlers();
    }

    /**
     * Setup Express middleware
     */
    _setupMiddleware() {
        // Raw body parser for signature validation
        this.app.use('/webhook', express.raw({ 
            type: 'application/json',
            limit: this.config.maxPayloadSize
        }));

        // JSON parser for other routes
        this.app.use(express.json({ limit: this.config.maxPayloadSize }));

        // Request logging
        this.app.use((req, res, next) => {
            const requestId = Math.random().toString(36).substring(7);
            req.requestId = requestId;
            req.startTime = Date.now();

            this.logger.debug(`[${requestId}] Webhook request: ${req.method} ${req.path}`, {
                method: req.method,
                path: req.path,
                userAgent: req.get('User-Agent'),
                contentType: req.get('Content-Type'),
                contentLength: req.get('Content-Length')
            });

            next();
        });
    }

    /**
     * Setup webhook routes
     */
    _setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                queueSize: this.eventQueue.length,
                endpoints: Array.from(this.webhookEndpoints.keys())
            });
        });

        // Main webhook endpoint
        this.app.post('/webhook/:endpoint', async (req, res) => {
            try {
                const endpoint = req.params.endpoint;
                const signature = req.get('X-Webhook-Signature') || req.get('X-Hub-Signature-256');
                const timestamp = req.get('X-Webhook-Timestamp');
                const event = req.get('X-Webhook-Event') || 'unknown';

                // Validate signature if enabled
                if (this.config.enableSignatureValidation && this.config.secret) {
                    const isValid = this._validateSignature(req.body, signature, timestamp);
                    if (!isValid) {
                        this.logger.warn(`[${req.requestId}] Invalid webhook signature for endpoint: ${endpoint}`);
                        return res.status(401).json({ error: 'Invalid signature' });
                    }
                }

                // Parse payload
                let payload;
                try {
                    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                } catch (error) {
                    this.logger.error(`[${req.requestId}] Failed to parse webhook payload:`, error);
                    return res.status(400).json({ error: 'Invalid JSON payload' });
                }

                // Process webhook
                const result = await this._processWebhook(endpoint, event, payload, req.requestId);
                
                if (result.success) {
                    res.status(200).json({ 
                        success: true, 
                        message: 'Webhook processed successfully',
                        requestId: req.requestId
                    });
                } else {
                    res.status(400).json({ 
                        error: result.error,
                        requestId: req.requestId
                    });
                }

            } catch (error) {
                this.logger.error(`[${req.requestId}] Webhook processing error:`, error);
                res.status(500).json({ 
                    error: 'Internal server error',
                    requestId: req.requestId
                });
            }
        });

        // Webhook registration endpoint
        this.app.post('/webhook/register', (req, res) => {
            try {
                const { endpoint, events, description } = req.body;
                
                if (!endpoint || !events) {
                    return res.status(400).json({ error: 'Endpoint and events are required' });
                }

                this.registerEndpoint(endpoint, events, description);
                
                res.json({
                    success: true,
                    endpoint,
                    events,
                    url: `${req.protocol}://${req.get('host')}/webhook/${endpoint}`
                });
            } catch (error) {
                this.logger.error('Webhook registration error:', error);
                res.status(500).json({ error: 'Registration failed' });
            }
        });

        // List registered endpoints
        this.app.get('/webhook/endpoints', (req, res) => {
            const endpoints = Array.from(this.webhookEndpoints.entries()).map(([name, config]) => ({
                name,
                events: config.events,
                description: config.description,
                url: `${req.protocol}://${req.get('host')}/webhook/${name}`,
                createdAt: config.createdAt,
                lastTriggered: config.lastTriggered,
                triggerCount: config.triggerCount
            }));

            res.json({ endpoints });
        });
    }

    /**
     * Setup default webhook handlers
     */
    _setupDefaultHandlers() {
        // AgentAPI status updates
        this.on('agentapi.status.changed', (data) => {
            this.logger.info('AgentAPI status changed:', data);
            this._broadcastEvent('status_update', data);
        });

        // Claude Code validation events
        this.on('claude_code.validation.started', (data) => {
            this.logger.info('Claude Code validation started:', data);
            this._broadcastEvent('validation_started', data);
        });

        this.on('claude_code.validation.completed', (data) => {
            this.logger.info('Claude Code validation completed:', data);
            this._broadcastEvent('validation_completed', data);
        });

        this.on('claude_code.validation.failed', (data) => {
            this.logger.error('Claude Code validation failed:', data);
            this._broadcastEvent('validation_failed', data);
        });

        // WSL2 deployment events
        this.on('wsl2.deployment.started', (data) => {
            this.logger.info('WSL2 deployment started:', data);
            this._broadcastEvent('deployment_started', data);
        });

        this.on('wsl2.deployment.completed', (data) => {
            this.logger.info('WSL2 deployment completed:', data);
            this._broadcastEvent('deployment_completed', data);
        });

        this.on('wsl2.deployment.failed', (data) => {
            this.logger.error('WSL2 deployment failed:', data);
            this._broadcastEvent('deployment_failed', data);
        });

        // Error events
        this.on('error', (error) => {
            this.logger.error('Webhook handler error:', error);
            this._broadcastEvent('error', { error: error.message, timestamp: new Date().toISOString() });
        });
    }

    /**
     * Validate webhook signature
     */
    _validateSignature(payload, signature, timestamp) {
        if (!signature || !this.config.secret) {
            return false;
        }

        try {
            // Check timestamp to prevent replay attacks
            if (timestamp) {
                const now = Math.floor(Date.now() / 1000);
                const webhookTime = parseInt(timestamp);
                if (Math.abs(now - webhookTime) > 300) { // 5 minutes tolerance
                    return false;
                }
            }

            // Validate signature
            const expectedSignature = crypto
                .createHmac('sha256', this.config.secret)
                .update(payload)
                .digest('hex');

            const providedSignature = signature.replace('sha256=', '');
            
            return crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(providedSignature, 'hex')
            );
        } catch (error) {
            this.logger.error('Signature validation error:', error);
            return false;
        }
    }

    /**
     * Process incoming webhook
     */
    async _processWebhook(endpoint, event, payload, requestId) {
        try {
            const endpointConfig = this.webhookEndpoints.get(endpoint);
            if (!endpointConfig) {
                return { success: false, error: `Unknown endpoint: ${endpoint}` };
            }

            // Check if event is supported
            if (!endpointConfig.events.includes(event) && !endpointConfig.events.includes('*')) {
                return { success: false, error: `Event '${event}' not supported for endpoint '${endpoint}'` };
            }

            // Update endpoint statistics
            endpointConfig.lastTriggered = new Date();
            endpointConfig.triggerCount++;

            // Add to processing queue
            const webhookEvent = {
                id: crypto.randomUUID(),
                endpoint,
                event,
                payload,
                requestId,
                timestamp: new Date(),
                processed: false
            };

            this.eventQueue.push(webhookEvent);
            this._processEventQueue();

            // Emit event for handlers
            this.emit(`webhook.${endpoint}.${event}`, payload);
            this.emit(`webhook.${endpoint}`, { event, payload });
            this.emit('webhook', { endpoint, event, payload });

            return { success: true };
        } catch (error) {
            this.logger.error(`Error processing webhook for endpoint ${endpoint}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process event queue
     */
    async _processEventQueue() {
        if (this.processingQueue || this.eventQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        try {
            while (this.eventQueue.length > 0) {
                const event = this.eventQueue.shift();
                
                try {
                    await this._handleWebhookEvent(event);
                    event.processed = true;
                } catch (error) {
                    this.logger.error(`Error handling webhook event ${event.id}:`, error);
                    
                    // Retry logic
                    if (event.retryCount < this.config.retryAttempts) {
                        event.retryCount = (event.retryCount || 0) + 1;
                        event.nextRetry = new Date(Date.now() + this.config.retryDelay * event.retryCount);
                        this.eventQueue.push(event);
                    }
                }
            }
        } finally {
            this.processingQueue = false;
        }
    }

    /**
     * Handle individual webhook event
     */
    async _handleWebhookEvent(event) {
        const { endpoint, event: eventType, payload } = event;

        // Route to specific handlers based on endpoint and event type
        switch (endpoint) {
            case 'agentapi':
                await this._handleAgentAPIEvent(eventType, payload);
                break;
            case 'claude-code':
                await this._handleClaudeCodeEvent(eventType, payload);
                break;
            case 'wsl2':
                await this._handleWSL2Event(eventType, payload);
                break;
            default:
                this.logger.warn(`No handler for endpoint: ${endpoint}`);
        }
    }

    /**
     * Handle AgentAPI events
     */
    async _handleAgentAPIEvent(event, payload) {
        switch (event) {
            case 'status_changed':
                this.emit('agentapi.status.changed', payload);
                break;
            case 'message_received':
                this.emit('agentapi.message.received', payload);
                break;
            case 'session_started':
                this.emit('agentapi.session.started', payload);
                break;
            case 'session_ended':
                this.emit('agentapi.session.ended', payload);
                break;
            default:
                this.logger.debug(`Unknown AgentAPI event: ${event}`);
        }
    }

    /**
     * Handle Claude Code events
     */
    async _handleClaudeCodeEvent(event, payload) {
        switch (event) {
            case 'validation_started':
                this.emit('claude_code.validation.started', payload);
                break;
            case 'validation_progress':
                this.emit('claude_code.validation.progress', payload);
                break;
            case 'validation_completed':
                this.emit('claude_code.validation.completed', payload);
                break;
            case 'validation_failed':
                this.emit('claude_code.validation.failed', payload);
                break;
            default:
                this.logger.debug(`Unknown Claude Code event: ${event}`);
        }
    }

    /**
     * Handle WSL2 events
     */
    async _handleWSL2Event(event, payload) {
        switch (event) {
            case 'deployment_started':
                this.emit('wsl2.deployment.started', payload);
                break;
            case 'deployment_progress':
                this.emit('wsl2.deployment.progress', payload);
                break;
            case 'deployment_completed':
                this.emit('wsl2.deployment.completed', payload);
                break;
            case 'deployment_failed':
                this.emit('wsl2.deployment.failed', payload);
                break;
            default:
                this.logger.debug(`Unknown WSL2 event: ${event}`);
        }
    }

    /**
     * Broadcast event to all listeners
     */
    _broadcastEvent(eventType, data) {
        const event = {
            type: eventType,
            data,
            timestamp: new Date().toISOString()
        };

        // Emit to internal listeners
        this.emit('broadcast', event);
        
        // Could also send to external systems (WebSocket, SSE, etc.)
        this.logger.debug('Broadcasting event:', event);
    }

    /**
     * Register webhook endpoint
     */
    registerEndpoint(name, events, description = '') {
        if (!Array.isArray(events)) {
            events = [events];
        }

        this.webhookEndpoints.set(name, {
            events,
            description,
            createdAt: new Date(),
            lastTriggered: null,
            triggerCount: 0
        });

        this.logger.info(`Webhook endpoint registered: ${name}`, { events, description });
    }

    /**
     * Unregister webhook endpoint
     */
    unregisterEndpoint(name) {
        const removed = this.webhookEndpoints.delete(name);
        if (removed) {
            this.logger.info(`Webhook endpoint unregistered: ${name}`);
        }
        return removed;
    }

    /**
     * Send webhook to external URL
     */
    async sendWebhook(url, event, payload, options = {}) {
        try {
            const axios = (await import('axios')).default;
            
            const webhookPayload = {
                event,
                payload,
                timestamp: new Date().toISOString(),
                ...options.additionalData
            };

            const headers = {
                'Content-Type': 'application/json',
                'X-Webhook-Event': event,
                'X-Webhook-Timestamp': Math.floor(Date.now() / 1000).toString(),
                ...options.headers
            };

            // Add signature if secret provided
            if (options.secret) {
                const signature = crypto
                    .createHmac('sha256', options.secret)
                    .update(JSON.stringify(webhookPayload))
                    .digest('hex');
                headers['X-Webhook-Signature'] = `sha256=${signature}`;
            }

            const response = await axios.post(url, webhookPayload, {
                headers,
                timeout: this.config.timeout
            });

            this.logger.info(`Webhook sent successfully to ${url}`, {
                event,
                status: response.status
            });

            return { success: true, status: response.status };
        } catch (error) {
            this.logger.error(`Failed to send webhook to ${url}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Start webhook server
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Webhook server is already running');
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port, this.config.host, (error) => {
                if (error) {
                    this.logger.error('Failed to start webhook server:', error);
                    reject(error);
                    return;
                }

                this.isRunning = true;
                this.logger.info(`Webhook server started on ${this.config.host}:${this.config.port}`);
                resolve();
            });

            this.server.on('error', (error) => {
                this.logger.error('Webhook server error:', error);
                if (!this.isRunning) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Stop webhook server
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        return new Promise((resolve) => {
            this.server.close(() => {
                this.isRunning = false;
                this.logger.info('Webhook server stopped');
                resolve();
            });
        });
    }

    /**
     * Get webhook statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            endpoints: this.webhookEndpoints.size,
            queueSize: this.eventQueue.length,
            totalEvents: Array.from(this.webhookEndpoints.values())
                .reduce((sum, endpoint) => sum + endpoint.triggerCount, 0)
        };
    }
}

export default WebhookHandler;

