/**
 * GitHub Webhook Handler
 * 
 * Handles GitHub webhook events for automated deployment validation
 * and integration with the Claude Code deployment validation engine.
 */

import crypto from 'crypto';
import { DeploymentValidationEngine } from '../engines/deployment-validation-engine.js';

export class GitHubWebhookHandler {
    constructor(options = {}) {
        this.secret = options.secret || process.env.GITHUB_WEBHOOK_SECRET;
        this.deploymentEngine = options.deploymentEngine || new DeploymentValidationEngine(
            options.claudeCodeClient,
            options.database,
            options.githubClient,
            options.linearClient
        );
        
        // Webhook configuration
        this.config = {
            maxPayloadSize: options.maxPayloadSize || 10 * 1024 * 1024, // 10MB
            timeout: options.timeout || 30000, // 30 seconds
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000 // 1 second
        };

        // Event handlers
        this.eventHandlers = {
            'pull_request': this.handlePullRequestEvent.bind(this),
            'push': this.handlePushEvent.bind(this),
            'check_suite': this.handleCheckSuiteEvent.bind(this),
            'check_run': this.handleCheckRunEvent.bind(this),
            'workflow_run': this.handleWorkflowRunEvent.bind(this),
            'ping': this.handlePingEvent.bind(this)
        };

        // Metrics tracking
        this.metrics = {
            totalWebhooks: 0,
            processedWebhooks: 0,
            failedWebhooks: 0,
            eventCounts: {},
            averageProcessingTime: 0
        };
    }

    /**
     * Initialize the webhook handler
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing GitHub Webhook Handler...');
            
            // Initialize deployment validation engine
            await this.deploymentEngine.initialize();
            
            console.log('GitHub Webhook Handler initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize GitHub Webhook Handler:', error);
            throw error;
        }
    }

    /**
     * Process incoming webhook
     * @param {Object} request - HTTP request object
     * @param {Object} response - HTTP response object
     * @returns {Promise<Object>} Processing result
     */
    async processWebhook(request, response) {
        const startTime = Date.now();
        this.metrics.totalWebhooks++;

        try {
            // Validate webhook signature
            if (!this.validateSignature(request)) {
                response.status(401).json({ error: 'Invalid signature' });
                return { status: 'error', error: 'Invalid signature' };
            }

            // Parse webhook payload
            const payload = this.parsePayload(request);
            const event = request.headers['x-github-event'];
            const deliveryId = request.headers['x-github-delivery'];

            console.log(`Processing GitHub webhook: ${event} (delivery: ${deliveryId})`);

            // Update metrics
            this.metrics.eventCounts[event] = (this.metrics.eventCounts[event] || 0) + 1;

            // Route to appropriate handler
            const handler = this.eventHandlers[event];
            if (!handler) {
                console.log(`No handler for event type: ${event}`);
                response.status(200).json({ status: 'ignored', reason: `No handler for ${event}` });
                return { status: 'ignored', reason: `No handler for ${event}` };
            }

            // Process the event
            const result = await handler(payload, {
                event,
                deliveryId,
                timestamp: new Date()
            });

            // Send response
            response.status(200).json({
                status: 'success',
                result,
                processingTime: Date.now() - startTime
            });

            // Update metrics
            this.metrics.processedWebhooks++;
            this.updateAverageProcessingTime(Date.now() - startTime);

            return { status: 'success', result };

        } catch (error) {
            console.error('Error processing webhook:', error);
            this.metrics.failedWebhooks++;

            response.status(500).json({
                status: 'error',
                error: error.message,
                processingTime: Date.now() - startTime
            });

            return { status: 'error', error: error.message };
        }
    }

    /**
     * Handle pull request events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handlePullRequestEvent(payload, context) {
        const { action, pull_request: pr, repository } = payload;
        
        console.log(`Handling PR event: ${action} for PR #${pr.number} in ${repository.full_name}`);

        // Only process relevant actions
        const relevantActions = ['opened', 'synchronize', 'reopened'];
        if (!relevantActions.includes(action)) {
            return { status: 'ignored', reason: `Action ${action} not relevant for validation` };
        }

        try {
            // Check if this is a Codegen PR
            if (!this.isCodegenPR(pr)) {
                return { status: 'ignored', reason: 'Not a Codegen PR' };
            }

            // Trigger deployment validation
            const validationResult = await this.deploymentEngine.handlePRWebhook({
                action,
                pull_request: pr,
                repository
            });

            return {
                status: 'processed',
                action,
                prNumber: pr.number,
                validationResult
            };

        } catch (error) {
            console.error(`Error handling PR event for #${pr.number}:`, error);
            throw error;
        }
    }

    /**
     * Handle push events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handlePushEvent(payload, context) {
        const { ref, repository, commits } = payload;
        
        console.log(`Handling push event to ${ref} in ${repository.full_name} (${commits.length} commits)`);

        // Only process pushes to Codegen branches
        if (!this.isCodegenBranch(ref)) {
            return { status: 'ignored', reason: 'Not a Codegen branch' };
        }

        try {
            // For now, we mainly handle PR events, but this could trigger
            // additional validations for direct pushes to Codegen branches
            return {
                status: 'processed',
                ref,
                commitCount: commits.length,
                message: 'Push event logged'
            };

        } catch (error) {
            console.error(`Error handling push event for ${ref}:`, error);
            throw error;
        }
    }

    /**
     * Handle check suite events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handleCheckSuiteEvent(payload, context) {
        const { action, check_suite: checkSuite, repository } = payload;
        
        console.log(`Handling check suite event: ${action} for ${checkSuite.head_branch} in ${repository.full_name}`);

        // Process completed check suites for Codegen PRs
        if (action === 'completed' && this.isCodegenBranch(`refs/heads/${checkSuite.head_branch}`)) {
            try {
                // This could trigger additional actions based on check suite results
                return {
                    status: 'processed',
                    action,
                    conclusion: checkSuite.conclusion,
                    branch: checkSuite.head_branch
                };

            } catch (error) {
                console.error(`Error handling check suite event:`, error);
                throw error;
            }
        }

        return { status: 'ignored', reason: `Action ${action} not relevant` };
    }

    /**
     * Handle check run events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handleCheckRunEvent(payload, context) {
        const { action, check_run: checkRun, repository } = payload;
        
        console.log(`Handling check run event: ${action} for ${checkRun.name} in ${repository.full_name}`);

        // Process completed check runs for Claude Code validations
        if (action === 'completed' && checkRun.name.includes('claude-code')) {
            try {
                return {
                    status: 'processed',
                    action,
                    checkName: checkRun.name,
                    conclusion: checkRun.conclusion
                };

            } catch (error) {
                console.error(`Error handling check run event:`, error);
                throw error;
            }
        }

        return { status: 'ignored', reason: `Action ${action} not relevant` };
    }

    /**
     * Handle workflow run events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handleWorkflowRunEvent(payload, context) {
        const { action, workflow_run: workflowRun, repository } = payload;
        
        console.log(`Handling workflow run event: ${action} for ${workflowRun.name} in ${repository.full_name}`);

        // Process completed workflow runs for Codegen branches
        if (action === 'completed' && this.isCodegenBranch(`refs/heads/${workflowRun.head_branch}`)) {
            try {
                return {
                    status: 'processed',
                    action,
                    workflowName: workflowRun.name,
                    conclusion: workflowRun.conclusion,
                    branch: workflowRun.head_branch
                };

            } catch (error) {
                console.error(`Error handling workflow run event:`, error);
                throw error;
            }
        }

        return { status: 'ignored', reason: `Action ${action} not relevant` };
    }

    /**
     * Handle ping events
     * @param {Object} payload - Webhook payload
     * @param {Object} context - Event context
     * @returns {Promise<Object>} Handler result
     */
    async handlePingEvent(payload, context) {
        console.log('Handling ping event - webhook is active');
        
        return {
            status: 'processed',
            message: 'Webhook is active and responding',
            timestamp: new Date()
        };
    }

    /**
     * Validate webhook signature
     * @param {Object} request - HTTP request object
     * @returns {boolean} True if signature is valid
     */
    validateSignature(request) {
        if (!this.secret) {
            console.warn('No webhook secret configured, skipping signature validation');
            return true;
        }

        const signature = request.headers['x-hub-signature-256'];
        if (!signature) {
            console.error('No signature provided in webhook');
            return false;
        }

        const payload = JSON.stringify(request.body);
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', this.secret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Parse webhook payload
     * @param {Object} request - HTTP request object
     * @returns {Object} Parsed payload
     */
    parsePayload(request) {
        if (typeof request.body === 'string') {
            return JSON.parse(request.body);
        }
        return request.body;
    }

    /**
     * Check if PR is from Codegen
     * @param {Object} pr - Pull request object
     * @returns {boolean} True if PR is from Codegen
     */
    isCodegenPR(pr) {
        const codegenPatterns = [
            /^codegen-bot\//,
            /^codegen\//,
            /^feature\/codegen/,
            /^fix\/codegen/
        ];

        return codegenPatterns.some(pattern => pattern.test(pr.head.ref));
    }

    /**
     * Check if branch is a Codegen branch
     * @param {string} ref - Git reference
     * @returns {boolean} True if branch is from Codegen
     */
    isCodegenBranch(ref) {
        const branchName = ref.replace('refs/heads/', '');
        const codegenPatterns = [
            /^codegen-bot\//,
            /^codegen\//,
            /^feature\/codegen/,
            /^fix\/codegen/
        ];

        return codegenPatterns.some(pattern => pattern.test(branchName));
    }

    /**
     * Update average processing time metric
     * @param {number} processingTime - Processing time in milliseconds
     */
    updateAverageProcessingTime(processingTime) {
        const totalProcessed = this.metrics.processedWebhooks;
        const currentAverage = this.metrics.averageProcessingTime;
        
        this.metrics.averageProcessingTime = 
            ((currentAverage * (totalProcessed - 1)) + processingTime) / totalProcessed;
    }

    /**
     * Get webhook handler metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalWebhooks > 0 
                ? (this.metrics.processedWebhooks / this.metrics.totalWebhooks) * 100 
                : 0
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalWebhooks: 0,
            processedWebhooks: 0,
            failedWebhooks: 0,
            eventCounts: {},
            averageProcessingTime: 0
        };
    }

    /**
     * Add custom event handler
     * @param {string} eventType - GitHub event type
     * @param {Function} handler - Event handler function
     */
    addEventHandler(eventType, handler) {
        this.eventHandlers[eventType] = handler;
        console.log(`Added custom handler for ${eventType} events`);
    }

    /**
     * Remove event handler
     * @param {string} eventType - GitHub event type
     */
    removeEventHandler(eventType) {
        delete this.eventHandlers[eventType];
        console.log(`Removed handler for ${eventType} events`);
    }

    /**
     * Get supported event types
     * @returns {Array<string>} List of supported event types
     */
    getSupportedEvents() {
        return Object.keys(this.eventHandlers);
    }

    /**
     * Shutdown webhook handler
     */
    async shutdown() {
        console.log('Shutting down GitHub Webhook Handler...');
        
        // Shutdown deployment validation engine
        if (this.deploymentEngine) {
            await this.deploymentEngine.shutdown();
        }
        
        console.log('GitHub Webhook Handler shutdown complete');
    }
}

export default GitHubWebhookHandler;

