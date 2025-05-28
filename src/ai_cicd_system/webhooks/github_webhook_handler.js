/**
 * @fileoverview GitHub Webhook Handler - Secure endpoint for GitHub PR events
 * @description Handles incoming GitHub webhooks with validation, authentication, and event routing
 */

import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { EventQueueManager } from './event_queue_manager.js';
import { WebhookSecurity } from './webhook_security.js';
import { EventCorrelation } from './event_correlation.js';
import { log } from '../../utils/simple_logger.js';

/**
 * GitHub Webhook Handler
 * Processes GitHub PR events with security, validation, and queuing
 */
export class GitHubWebhookHandler {
    constructor(config = {}) {
        this.config = {
            port: config.port || process.env.WEBHOOK_PORT || 3001,
            path: config.path || '/webhook/github',
            secret: config.secret || process.env.GITHUB_WEBHOOK_SECRET,
            maxPayloadSize: config.maxPayloadSize || '10mb',
            enableCors: config.enableCors || false,
            rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
            rateLimitMax: config.rateLimitMax || 1000, // requests per window
            slowDownThreshold: config.slowDownThreshold || 100,
            ...config
        };

        this.app = express();
        this.server = null;
        this.isRunning = false;
        
        // Initialize components
        this.eventQueue = new EventQueueManager(this.config.queue);
        this.security = new WebhookSecurity(this.config.security);
        this.correlation = new EventCorrelation(this.config.correlation);
        
        // Event handlers
        this.eventHandlers = new Map();
        this.setupEventHandlers();
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            validRequests: 0,
            invalidRequests: 0,
            processedEvents: 0,
            failedEvents: 0,
            lastEventTime: null,
            startTime: Date.now()
        };
    }

    /**
     * Initialize the webhook handler
     */
    async initialize() {
        try {
            await this.eventQueue.initialize();
            await this.security.initialize();
            await this.correlation.initialize();
            
            this.setupMiddleware();
            this.setupRoutes();
            
            log('info', 'GitHub Webhook Handler initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize webhook handler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the webhook server
     */
    async start() {
        if (this.isRunning) {
            log('warning', 'Webhook handler already running');
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port, (error) => {
                if (error) {
                    log('error', `Failed to start webhook server: ${error.message}`);
                    reject(error);
                } else {
                    this.isRunning = true;
                    log('info', `GitHub Webhook Handler listening on port ${this.config.port}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Stop the webhook server
     */
    async stop() {
        if (!this.isRunning || !this.server) {
            return;
        }

        return new Promise((resolve) => {
            this.server.close(() => {
                this.isRunning = false;
                log('info', 'GitHub Webhook Handler stopped');
                resolve();
            });
        });
    }

    /**
     * Setup Express middleware
     * @private
     */
    setupMiddleware() {
        // Rate limiting
        const limiter = rateLimit({
            windowMs: this.config.rateLimitWindow,
            max: this.config.rateLimitMax,
            message: 'Too many webhook requests from this IP',
            standardHeaders: true,
            legacyHeaders: false,
        });

        // Slow down repeated requests
        const speedLimiter = slowDown({
            windowMs: this.config.rateLimitWindow,
            delayAfter: this.config.slowDownThreshold,
            delayMs: 500,
            maxDelayMs: 20000,
        });

        this.app.use(limiter);
        this.app.use(speedLimiter);

        // CORS if enabled
        if (this.config.enableCors) {
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256');
                next();
            });
        }

        // Raw body parser for signature verification
        this.app.use(this.config.path, express.raw({ 
            type: 'application/json',
            limit: this.config.maxPayloadSize
        }));

        // Request logging
        this.app.use((req, res, next) => {
            this.metrics.totalRequests++;
            log('debug', `Webhook request: ${req.method} ${req.path} from ${req.ip}`);
            next();
        });
    }

    /**
     * Setup webhook routes
     * @private
     */
    setupRoutes() {
        // Main webhook endpoint
        this.app.post(this.config.path, async (req, res) => {
            try {
                await this.handleWebhook(req, res);
            } catch (error) {
                log('error', `Webhook handling error: ${error.message}`);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Date.now() - this.metrics.startTime,
                metrics: this.metrics
            });
        });

        // Metrics endpoint
        this.app.get('/metrics', (req, res) => {
            res.json(this.metrics);
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    /**
     * Handle incoming webhook request
     * @param {express.Request} req - Express request
     * @param {express.Response} res - Express response
     * @private
     */
    async handleWebhook(req, res) {
        const startTime = Date.now();
        
        try {
            // Extract headers
            const githubEvent = req.get('X-GitHub-Event');
            const githubDelivery = req.get('X-GitHub-Delivery');
            const signature = req.get('X-Hub-Signature-256');

            // Validate required headers
            if (!githubEvent || !githubDelivery || !signature) {
                this.metrics.invalidRequests++;
                return res.status(400).json({ 
                    error: 'Missing required headers',
                    required: ['X-GitHub-Event', 'X-GitHub-Delivery', 'X-Hub-Signature-256']
                });
            }

            // Verify signature
            if (!this.security.verifySignature(req.body, signature)) {
                this.metrics.invalidRequests++;
                log('warning', `Invalid signature for delivery ${githubDelivery}`);
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // Parse payload
            let payload;
            try {
                payload = JSON.parse(req.body.toString());
            } catch (error) {
                this.metrics.invalidRequests++;
                return res.status(400).json({ error: 'Invalid JSON payload' });
            }

            // Validate payload structure
            const validationResult = this.security.validatePayload(payload, githubEvent);
            if (!validationResult.valid) {
                this.metrics.invalidRequests++;
                return res.status(400).json({ 
                    error: 'Invalid payload structure',
                    details: validationResult.errors
                });
            }

            // Check for duplicate delivery
            const isDuplicate = await this.correlation.isDuplicateEvent(githubDelivery);
            if (isDuplicate) {
                log('info', `Duplicate delivery detected: ${githubDelivery}`);
                return res.status(200).json({ 
                    status: 'duplicate',
                    message: 'Event already processed'
                });
            }

            // Create event object
            const event = {
                id: githubDelivery,
                type: githubEvent,
                payload: payload,
                timestamp: new Date(),
                source: 'github',
                metadata: {
                    userAgent: req.get('User-Agent'),
                    sourceIP: req.ip,
                    contentType: req.get('Content-Type')
                }
            };

            // Filter relevant events
            if (!this.isRelevantEvent(event)) {
                log('debug', `Ignoring irrelevant event: ${githubEvent}`);
                return res.status(200).json({ 
                    status: 'ignored',
                    message: 'Event type not processed'
                });
            }

            // Correlate with existing workflows
            const correlationData = await this.correlation.correlateEvent(event);
            event.correlation = correlationData;

            // Queue event for processing
            await this.eventQueue.enqueue(event);

            // Track event
            await this.correlation.trackEvent(event);

            // Update metrics
            this.metrics.validRequests++;
            this.metrics.processedEvents++;
            this.metrics.lastEventTime = new Date();

            const processingTime = Date.now() - startTime;
            log('info', `Webhook processed successfully: ${githubEvent} (${processingTime}ms)`);

            res.status(200).json({
                status: 'accepted',
                eventId: githubDelivery,
                processingTime: processingTime
            });

        } catch (error) {
            this.metrics.failedEvents++;
            log('error', `Webhook processing failed: ${error.message}`);
            res.status(500).json({ error: 'Processing failed' });
        }
    }

    /**
     * Check if event is relevant for processing
     * @param {Object} event - Webhook event
     * @returns {boolean} Whether event should be processed
     * @private
     */
    isRelevantEvent(event) {
        const relevantEvents = [
            'pull_request',
            'pull_request_review',
            'pull_request_review_comment',
            'push',
            'check_run',
            'check_suite',
            'status'
        ];

        if (!relevantEvents.includes(event.type)) {
            return false;
        }

        // For PR events, check specific actions
        if (event.type === 'pull_request') {
            const relevantActions = [
                'opened',
                'synchronize',
                'reopened',
                'closed',
                'ready_for_review'
            ];
            return relevantActions.includes(event.payload.action);
        }

        return true;
    }

    /**
     * Setup event handlers for different event types
     * @private
     */
    setupEventHandlers() {
        this.eventHandlers.set('pull_request', this.handlePullRequestEvent.bind(this));
        this.eventHandlers.set('push', this.handlePushEvent.bind(this));
        this.eventHandlers.set('check_run', this.handleCheckRunEvent.bind(this));
        this.eventHandlers.set('check_suite', this.handleCheckSuiteEvent.bind(this));
    }

    /**
     * Handle pull request events
     * @param {Object} event - Webhook event
     * @private
     */
    async handlePullRequestEvent(event) {
        const { action, pull_request, repository } = event.payload;
        
        log('info', `Processing PR event: ${action} for PR #${pull_request.number}`);
        
        // Extract relevant data
        const prData = {
            number: pull_request.number,
            title: pull_request.title,
            body: pull_request.body,
            state: pull_request.state,
            head: {
                ref: pull_request.head.ref,
                sha: pull_request.head.sha
            },
            base: {
                ref: pull_request.base.ref,
                sha: pull_request.base.sha
            },
            repository: {
                name: repository.name,
                full_name: repository.full_name,
                clone_url: repository.clone_url
            },
            action: action
        };

        // Trigger appropriate workflow based on action
        switch (action) {
            case 'opened':
            case 'reopened':
                await this.triggerCodeDeployment(prData, event);
                break;
            case 'synchronize':
                await this.triggerCodeValidation(prData, event);
                break;
            case 'closed':
                if (pull_request.merged) {
                    await this.triggerMergeWorkflow(prData, event);
                }
                break;
        }
    }

    /**
     * Handle push events
     * @param {Object} event - Webhook event
     * @private
     */
    async handlePushEvent(event) {
        const { ref, commits, repository } = event.payload;
        
        log('info', `Processing push event: ${commits.length} commits to ${ref}`);
        
        // Only process pushes to main/master branches
        if (ref === 'refs/heads/main' || ref === 'refs/heads/master') {
            // Trigger post-merge workflows
            await this.triggerPostMergeWorkflow(event);
        }
    }

    /**
     * Handle check run events
     * @param {Object} event - Webhook event
     * @private
     */
    async handleCheckRunEvent(event) {
        const { action, check_run } = event.payload;
        
        if (action === 'completed' && check_run.conclusion === 'failure') {
            log('info', `Check run failed: ${check_run.name}`);
            await this.triggerFailureRecovery(event);
        }
    }

    /**
     * Handle check suite events
     * @param {Object} event - Webhook event
     * @private
     */
    async handleCheckSuiteEvent(event) {
        const { action, check_suite } = event.payload;
        
        if (action === 'completed') {
            log('info', `Check suite completed: ${check_suite.conclusion}`);
            await this.triggerCheckSuiteCompletion(event);
        }
    }

    /**
     * Trigger code deployment via AgentAPI
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original webhook event
     * @private
     */
    async triggerCodeDeployment(prData, event) {
        try {
            // Create deployment task
            const deploymentTask = {
                type: 'code_deployment',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                priority: 'high',
                created_at: new Date()
            };

            // Queue for AgentAPI processing
            await this.eventQueue.enqueue(deploymentTask, 'deployment');
            
            log('info', `Code deployment triggered for PR #${prData.number}`);
        } catch (error) {
            log('error', `Failed to trigger code deployment: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger code validation
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original webhook event
     * @private
     */
    async triggerCodeValidation(prData, event) {
        try {
            const validationTask = {
                type: 'code_validation',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                priority: 'medium',
                created_at: new Date()
            };

            await this.eventQueue.enqueue(validationTask, 'validation');
            
            log('info', `Code validation triggered for PR #${prData.number}`);
        } catch (error) {
            log('error', `Failed to trigger code validation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger merge workflow
     * @param {Object} prData - Pull request data
     * @param {Object} event - Original webhook event
     * @private
     */
    async triggerMergeWorkflow(prData, event) {
        try {
            const mergeTask = {
                type: 'merge_workflow',
                pr_data: prData,
                event_id: event.id,
                correlation_id: event.correlation?.workflowId,
                priority: 'low',
                created_at: new Date()
            };

            await this.eventQueue.enqueue(mergeTask, 'workflow');
            
            log('info', `Merge workflow triggered for PR #${prData.number}`);
        } catch (error) {
            log('error', `Failed to trigger merge workflow: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger post-merge workflow
     * @param {Object} event - Webhook event
     * @private
     */
    async triggerPostMergeWorkflow(event) {
        try {
            const postMergeTask = {
                type: 'post_merge',
                push_data: event.payload,
                event_id: event.id,
                priority: 'low',
                created_at: new Date()
            };

            await this.eventQueue.enqueue(postMergeTask, 'workflow');
            
            log('info', 'Post-merge workflow triggered');
        } catch (error) {
            log('error', `Failed to trigger post-merge workflow: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger failure recovery
     * @param {Object} event - Webhook event
     * @private
     */
    async triggerFailureRecovery(event) {
        try {
            const recoveryTask = {
                type: 'failure_recovery',
                check_data: event.payload,
                event_id: event.id,
                priority: 'high',
                created_at: new Date()
            };

            await this.eventQueue.enqueue(recoveryTask, 'recovery');
            
            log('info', 'Failure recovery triggered');
        } catch (error) {
            log('error', `Failed to trigger failure recovery: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger check suite completion workflow
     * @param {Object} event - Webhook event
     * @private
     */
    async triggerCheckSuiteCompletion(event) {
        try {
            const completionTask = {
                type: 'check_suite_completion',
                check_suite_data: event.payload,
                event_id: event.id,
                priority: 'medium',
                created_at: new Date()
            };

            await this.eventQueue.enqueue(completionTask, 'validation');
            
            log('info', 'Check suite completion workflow triggered');
        } catch (error) {
            log('error', `Failed to trigger check suite completion: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get handler metrics
     * @returns {Object} Handler metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            isRunning: this.isRunning,
            queueMetrics: this.eventQueue.getMetrics()
        };
    }

    /**
     * Get handler health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: this.isRunning ? 'healthy' : 'stopped',
            components: {
                server: this.isRunning ? 'running' : 'stopped',
                eventQueue: await this.eventQueue.getHealth(),
                security: await this.security.getHealth(),
                correlation: await this.correlation.getHealth()
            },
            metrics: this.getMetrics()
        };
    }

    /**
     * Shutdown the webhook handler
     */
    async shutdown() {
        try {
            await this.stop();
            await this.eventQueue.shutdown();
            await this.security.shutdown();
            await this.correlation.shutdown();
            
            log('info', 'GitHub Webhook Handler shutdown completed');
        } catch (error) {
            log('error', `Error during webhook handler shutdown: ${error.message}`);
            throw error;
        }
    }
}

export default GitHubWebhookHandler;

