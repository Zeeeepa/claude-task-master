/**
 * @fileoverview Webhook Handler
 * @description Handles GitHub webhook processing and validation
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * Webhook Handler for processing GitHub PR notifications
 */
export class WebhookHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            webhook_secret: config.webhook_secret,
            supported_events: config.supported_events || [
                'pull_request.opened',
                'pull_request.synchronize',
                'pull_request.reopened',
                'push'
            ],
            max_payload_size: config.max_payload_size || 10 * 1024 * 1024, // 10MB
            signature_algorithm: config.signature_algorithm || 'sha256',
            validate_signatures: config.validate_signatures !== false,
            rate_limit: config.rate_limit || {
                max_requests: 100,
                window_ms: 60000 // 1 minute
            },
            ...config
        };

        this.webhookHistory = [];
        this.rateLimitTracker = new Map();
        this.eventHandlers = new Map();
        this.processingQueue = [];
        this.isProcessing = false;

        // Setup default event handlers
        this.setupDefaultHandlers();
    }

    /**
     * Initialize the webhook handler
     */
    async initialize() {
        console.log('🔗 Initializing Webhook Handler...');
        
        try {
            // Validate configuration
            this.validateConfiguration();
            
            // Setup event listeners
            this.setupEventListeners();
            
            console.log('✅ Webhook Handler initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Webhook Handler:', error);
            throw error;
        }
    }

    /**
     * Validate webhook configuration
     */
    validateConfiguration() {
        if (this.config.validate_signatures && !this.config.webhook_secret) {
            throw new Error('Webhook secret is required when signature validation is enabled');
        }

        if (!Array.isArray(this.config.supported_events) || this.config.supported_events.length === 0) {
            throw new Error('At least one supported event must be configured');
        }

        console.log('✅ Webhook configuration validated');
    }

    /**
     * Setup default event handlers
     */
    setupDefaultHandlers() {
        // Pull request events
        this.eventHandlers.set('pull_request.opened', this.handlePullRequestOpened.bind(this));
        this.eventHandlers.set('pull_request.synchronize', this.handlePullRequestSynchronize.bind(this));
        this.eventHandlers.set('pull_request.reopened', this.handlePullRequestReopened.bind(this));
        this.eventHandlers.set('pull_request.closed', this.handlePullRequestClosed.bind(this));

        // Push events
        this.eventHandlers.set('push', this.handlePush.bind(this));

        // Check run events
        this.eventHandlers.set('check_run.completed', this.handleCheckRunCompleted.bind(this));
        this.eventHandlers.set('check_suite.completed', this.handleCheckSuiteCompleted.bind(this));
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.on('webhook_received', this.processWebhook.bind(this));
        this.on('webhook_validated', this.queueWebhookProcessing.bind(this));
        this.on('webhook_processed', this.recordWebhookHistory.bind(this));
        this.on('webhook_error', this.handleWebhookError.bind(this));
    }

    /**
     * Process incoming webhook
     */
    async receiveWebhook(payload, headers = {}) {
        const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`📥 Received webhook: ${webhookId}`);

        try {
            // Check rate limiting
            if (!this.checkRateLimit(headers['x-forwarded-for'] || 'unknown')) {
                throw new Error('Rate limit exceeded');
            }

            // Validate payload size
            const payloadSize = JSON.stringify(payload).length;
            if (payloadSize > this.config.max_payload_size) {
                throw new Error(`Payload size (${payloadSize}) exceeds maximum allowed (${this.config.max_payload_size})`);
            }

            // Validate webhook signature
            if (this.config.validate_signatures) {
                const isValid = this.validateSignature(payload, headers['x-hub-signature-256']);
                if (!isValid) {
                    throw new Error('Invalid webhook signature');
                }
            }

            // Emit webhook received event
            this.emit('webhook_received', {
                id: webhookId,
                payload,
                headers,
                timestamp: Date.now()
            });

            return { success: true, webhookId };
        } catch (error) {
            console.error(`❌ Webhook validation failed: ${webhookId}`, error);
            this.emit('webhook_error', { webhookId, error: error.message });
            throw error;
        }
    }

    /**
     * Validate webhook payload structure and content
     */
    async validateWebhook(payload) {
        console.log('🔍 Validating webhook payload...');

        try {
            // Check required fields
            if (!payload || typeof payload !== 'object') {
                throw new Error('Invalid payload format');
            }

            // Validate event type
            const eventType = this.extractEventType(payload);
            if (!this.config.supported_events.includes(eventType)) {
                throw new Error(`Unsupported event type: ${eventType}`);
            }

            // Validate repository information
            if (!payload.repository || !payload.repository.clone_url) {
                throw new Error('Missing repository information');
            }

            // Event-specific validation
            await this.validateEventSpecificFields(eventType, payload);

            console.log(`✅ Webhook payload validated for event: ${eventType}`);
            return true;
        } catch (error) {
            console.error('❌ Webhook validation failed:', error);
            return false;
        }
    }

    /**
     * Extract event type from payload
     */
    extractEventType(payload) {
        // GitHub webhook format
        if (payload.action && payload.pull_request) {
            return `pull_request.${payload.action}`;
        }
        
        if (payload.ref && payload.commits) {
            return 'push';
        }
        
        if (payload.check_run) {
            return `check_run.${payload.action}`;
        }
        
        if (payload.check_suite) {
            return `check_suite.${payload.action}`;
        }

        throw new Error('Unable to determine event type from payload');
    }

    /**
     * Validate event-specific fields
     */
    async validateEventSpecificFields(eventType, payload) {
        switch (eventType) {
            case 'pull_request.opened':
            case 'pull_request.synchronize':
            case 'pull_request.reopened':
                this.validatePullRequestFields(payload);
                break;
            case 'push':
                this.validatePushFields(payload);
                break;
            case 'check_run.completed':
                this.validateCheckRunFields(payload);
                break;
            case 'check_suite.completed':
                this.validateCheckSuiteFields(payload);
                break;
        }
    }

    /**
     * Validate pull request specific fields
     */
    validatePullRequestFields(payload) {
        const pr = payload.pull_request;
        
        if (!pr) {
            throw new Error('Missing pull_request object');
        }

        if (!pr.number || !pr.head || !pr.base) {
            throw new Error('Missing required pull request fields');
        }

        if (!pr.head.ref || !pr.head.repo || !pr.base.ref) {
            throw new Error('Missing pull request branch information');
        }
    }

    /**
     * Validate push specific fields
     */
    validatePushFields(payload) {
        if (!payload.ref || !payload.commits) {
            throw new Error('Missing required push fields');
        }

        if (!Array.isArray(payload.commits)) {
            throw new Error('Invalid commits format');
        }
    }

    /**
     * Validate check run specific fields
     */
    validateCheckRunFields(payload) {
        if (!payload.check_run || !payload.check_run.id) {
            throw new Error('Missing check run information');
        }
    }

    /**
     * Validate check suite specific fields
     */
    validateCheckSuiteFields(payload) {
        if (!payload.check_suite || !payload.check_suite.id) {
            throw new Error('Missing check suite information');
        }
    }

    /**
     * Process webhook after validation
     */
    async processWebhook(webhookData) {
        const { id, payload, headers, timestamp } = webhookData;
        
        try {
            // Validate the webhook
            const isValid = await this.validateWebhook(payload);
            if (!isValid) {
                throw new Error('Webhook validation failed');
            }

            // Extract event type
            const eventType = this.extractEventType(payload);
            
            // Emit validated event
            this.emit('webhook_validated', {
                id,
                eventType,
                payload,
                headers,
                timestamp
            });

        } catch (error) {
            this.emit('webhook_error', { webhookId: id, error: error.message });
        }
    }

    /**
     * Queue webhook for processing
     */
    async queueWebhookProcessing(validatedWebhook) {
        console.log(`📋 Queuing webhook for processing: ${validatedWebhook.id}`);
        
        this.processingQueue.push(validatedWebhook);
        
        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Process webhook queue
     */
    async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        console.log(`⚡ Processing webhook queue (${this.processingQueue.length} items)...`);

        while (this.processingQueue.length > 0) {
            const webhook = this.processingQueue.shift();
            
            try {
                await this.executeWebhookHandler(webhook);
                this.emit('webhook_processed', webhook);
            } catch (error) {
                console.error(`❌ Failed to process webhook ${webhook.id}:`, error);
                this.emit('webhook_error', { webhookId: webhook.id, error: error.message });
            }
        }

        this.isProcessing = false;
        console.log('✅ Webhook queue processing completed');
    }

    /**
     * Execute appropriate webhook handler
     */
    async executeWebhookHandler(webhook) {
        const { eventType, payload } = webhook;
        
        const handler = this.eventHandlers.get(eventType);
        if (!handler) {
            console.warn(`⚠️ No handler found for event type: ${eventType}`);
            return;
        }

        console.log(`🔧 Executing handler for: ${eventType}`);
        await handler(payload, webhook);
    }

    /**
     * Handle pull request opened event
     */
    async handlePullRequestOpened(payload, webhook) {
        console.log(`🔀 Handling PR opened: #${payload.pull_request.number}`);
        
        const prInfo = this.extractPullRequestInfo(payload);
        
        // Emit event for validation engine
        this.emit('pr_validation_requested', {
            type: 'pr_opened',
            prInfo,
            webhook
        });
    }

    /**
     * Handle pull request synchronize event (new commits)
     */
    async handlePullRequestSynchronize(payload, webhook) {
        console.log(`🔄 Handling PR synchronize: #${payload.pull_request.number}`);
        
        const prInfo = this.extractPullRequestInfo(payload);
        
        // Emit event for validation engine
        this.emit('pr_validation_requested', {
            type: 'pr_updated',
            prInfo,
            webhook
        });
    }

    /**
     * Handle pull request reopened event
     */
    async handlePullRequestReopened(payload, webhook) {
        console.log(`🔓 Handling PR reopened: #${payload.pull_request.number}`);
        
        const prInfo = this.extractPullRequestInfo(payload);
        
        // Emit event for validation engine
        this.emit('pr_validation_requested', {
            type: 'pr_reopened',
            prInfo,
            webhook
        });
    }

    /**
     * Handle pull request closed event
     */
    async handlePullRequestClosed(payload, webhook) {
        console.log(`🔒 Handling PR closed: #${payload.pull_request.number}`);
        
        // Emit cleanup event
        this.emit('pr_cleanup_requested', {
            prNumber: payload.pull_request.number,
            merged: payload.pull_request.merged,
            webhook
        });
    }

    /**
     * Handle push event
     */
    async handlePush(payload, webhook) {
        const branch = payload.ref.replace('refs/heads/', '');
        console.log(`📤 Handling push to branch: ${branch}`);
        
        // Only process pushes to main branches or PR branches
        if (this.shouldProcessPush(branch, payload)) {
            this.emit('push_validation_requested', {
                branch,
                commits: payload.commits,
                repository: payload.repository,
                webhook
            });
        }
    }

    /**
     * Handle check run completed event
     */
    async handleCheckRunCompleted(payload, webhook) {
        console.log(`✅ Handling check run completed: ${payload.check_run.name}`);
        
        this.emit('check_run_completed', {
            checkRun: payload.check_run,
            repository: payload.repository,
            webhook
        });
    }

    /**
     * Handle check suite completed event
     */
    async handleCheckSuiteCompleted(payload, webhook) {
        console.log(`📋 Handling check suite completed: ${payload.check_suite.id}`);
        
        this.emit('check_suite_completed', {
            checkSuite: payload.check_suite,
            repository: payload.repository,
            webhook
        });
    }

    /**
     * Extract pull request information
     */
    extractPullRequestInfo(payload) {
        const pr = payload.pull_request;
        
        return {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            branch: pr.head.ref,
            baseBranch: pr.base.ref,
            repoUrl: pr.head.repo.clone_url,
            repoName: pr.head.repo.full_name,
            author: pr.user.login,
            authorId: pr.user.id,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            commits: pr.commits,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            mergeable: pr.mergeable,
            mergeableState: pr.mergeable_state,
            labels: pr.labels?.map(l => l.name) || [],
            assignees: pr.assignees?.map(a => a.login) || [],
            reviewers: pr.requested_reviewers?.map(r => r.login) || []
        };
    }

    /**
     * Check if push should be processed
     */
    shouldProcessPush(branch, payload) {
        // Process pushes to main/master branches
        if (['main', 'master', 'develop', 'development'].includes(branch)) {
            return true;
        }

        // Process pushes to PR branches (if they have open PRs)
        // This would require additional logic to check for open PRs
        return false;
    }

    /**
     * Validate webhook signature
     */
    validateSignature(payload, signature) {
        if (!signature || !this.config.webhook_secret) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac(this.config.signature_algorithm, this.config.webhook_secret)
            .update(JSON.stringify(payload))
            .digest('hex');

        const expectedSignatureWithPrefix = `${this.config.signature_algorithm}=${expectedSignature}`;
        
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignatureWithPrefix)
        );
    }

    /**
     * Check rate limiting
     */
    checkRateLimit(clientId) {
        const now = Date.now();
        const windowStart = now - this.config.rate_limit.window_ms;
        
        // Clean old entries
        if (this.rateLimitTracker.has(clientId)) {
            const requests = this.rateLimitTracker.get(clientId);
            const validRequests = requests.filter(timestamp => timestamp > windowStart);
            this.rateLimitTracker.set(clientId, validRequests);
        }

        // Check current request count
        const currentRequests = this.rateLimitTracker.get(clientId) || [];
        
        if (currentRequests.length >= this.config.rate_limit.max_requests) {
            return false;
        }

        // Add current request
        currentRequests.push(now);
        this.rateLimitTracker.set(clientId, currentRequests);
        
        return true;
    }

    /**
     * Record webhook in history
     */
    recordWebhookHistory(webhook) {
        this.webhookHistory.push({
            id: webhook.id,
            eventType: webhook.eventType,
            timestamp: webhook.timestamp,
            processed: true
        });

        // Keep history limited
        if (this.webhookHistory.length > 1000) {
            this.webhookHistory = this.webhookHistory.slice(-500);
        }
    }

    /**
     * Handle webhook errors
     */
    handleWebhookError(errorData) {
        console.error(`❌ Webhook error: ${errorData.webhookId}`, errorData.error);
        
        // Record error in history
        this.webhookHistory.push({
            id: errorData.webhookId,
            error: errorData.error,
            timestamp: Date.now(),
            processed: false
        });
    }

    /**
     * Get webhook statistics
     */
    getWebhookStatistics() {
        const total = this.webhookHistory.length;
        const successful = this.webhookHistory.filter(w => w.processed).length;
        const failed = this.webhookHistory.filter(w => !w.processed).length;
        
        const eventTypes = {};
        this.webhookHistory.forEach(w => {
            if (w.eventType) {
                eventTypes[w.eventType] = (eventTypes[w.eventType] || 0) + 1;
            }
        });

        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? (successful / total) * 100 : 0,
            eventTypes,
            queueSize: this.processingQueue.length,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Get webhook history
     */
    getWebhookHistory(limit = 100) {
        return this.webhookHistory.slice(-limit);
    }

    /**
     * Register custom event handler
     */
    registerEventHandler(eventType, handler) {
        this.eventHandlers.set(eventType, handler);
        console.log(`✅ Registered custom handler for: ${eventType}`);
    }

    /**
     * Unregister event handler
     */
    unregisterEventHandler(eventType) {
        this.eventHandlers.delete(eventType);
        console.log(`🗑️ Unregistered handler for: ${eventType}`);
    }

    /**
     * Shutdown webhook handler
     */
    async shutdown() {
        console.log('🛑 Shutting down Webhook Handler...');
        
        // Wait for queue to finish processing
        while (this.isProcessing || this.processingQueue.length > 0) {
            console.log('⏳ Waiting for webhook queue to finish...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Remove all listeners
        this.removeAllListeners();
        
        console.log('✅ Webhook Handler shutdown complete');
    }
}

export default WebhookHandler;

