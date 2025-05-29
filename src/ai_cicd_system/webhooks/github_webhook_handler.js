/**
 * @fileoverview GitHub Webhook Handler
 * @description Processes GitHub webhook events for PR creation, updates, and merge events
 *              with signature validation and security features
 */

import crypto from 'crypto';
import { log } from '../../../scripts/modules/utils.js';

/**
 * GitHub webhook handler with security validation and event processing
 */
export class GitHubWebhookHandler {
    constructor(config = {}) {
        this.config = {
            github_secret: config.github_secret,
            endpoint_path: config.endpoint_path || '/webhooks/github',
            signature_validation: config.signature_validation !== false,
            supported_events: config.supported_events || [
                'pull_request',
                'push',
                'issues',
                'check_run',
                'check_suite',
                'workflow_run'
            ],
            rate_limiting: {
                enabled: config.rate_limiting?.enabled !== false,
                max_requests: config.rate_limiting?.max_requests || 100,
                window_ms: config.rate_limiting?.window_ms || 60000
            },
            replay_protection: {
                enabled: config.replay_protection?.enabled !== false,
                window_ms: config.replay_protection?.window_ms || 300000 // 5 minutes
            },
            ...config
        };

        // Event tracking
        this.processedEvents = new Map();
        this.eventStatistics = new Map();
        this.rateLimitTracker = new Map();
        this.recentEvents = [];

        // Event handlers
        this.eventHandlers = new Map();
        this._initializeEventHandlers();

        log('info', 'GitHub Webhook Handler initialized');
    }

    /**
     * Initialize webhook handler
     */
    async initialize() {
        log('info', 'Initializing GitHub Webhook Handler...');

        // Validate configuration
        if (this.config.signature_validation && !this.config.github_secret) {
            throw new Error('GitHub webhook secret is required when signature validation is enabled');
        }

        // Start cleanup intervals
        this._startCleanupIntervals();

        log('info', 'GitHub Webhook Handler initialized successfully');
    }

    /**
     * Process incoming webhook event
     * @param {Object} event - Webhook event data
     * @param {Object} headers - Request headers
     * @param {string} rawBody - Raw request body
     * @returns {Promise<Object>} Processing result
     */
    async processEvent(event, headers = {}, rawBody = '') {
        const eventId = this._generateEventId(event);
        const eventType = event.action ? `${event.type || headers['x-github-event']}.${event.action}` : (event.type || headers['x-github-event']);
        
        log('info', `Processing GitHub webhook event: ${eventType} (${eventId})`);

        try {
            // Step 1: Rate limiting check
            if (this.config.rate_limiting.enabled) {
                await this._checkRateLimit(headers['x-forwarded-for'] || 'unknown');
            }

            // Step 2: Signature validation
            if (this.config.signature_validation) {
                await this.validateSignature(rawBody, headers['x-hub-signature-256'] || headers['x-hub-signature']);
            }

            // Step 3: Replay protection
            if (this.config.replay_protection.enabled) {
                await this._checkReplayProtection(eventId, headers['x-github-delivery']);
            }

            // Step 4: Event validation
            const validationResult = await this._validateEvent(event, eventType);
            if (!validationResult.valid) {
                return {
                    status: 'rejected',
                    reason: validationResult.reason,
                    event_id: eventId
                };
            }

            // Step 5: Process event based on type
            const result = await this._processEventByType(event, eventType, eventId);

            // Step 6: Track event
            this._trackEvent(eventId, eventType, result);

            log('info', `GitHub webhook event ${eventType} processed successfully (${eventId})`);
            return {
                status: 'processed',
                event_id: eventId,
                event_type: eventType,
                result: result,
                requires_processing: result.requires_processing || false
            };

        } catch (error) {
            log('error', `Failed to process GitHub webhook event ${eventType}: ${error.message}`);
            
            this._trackEvent(eventId, eventType, { status: 'failed', error: error.message });
            
            return {
                status: 'failed',
                event_id: eventId,
                event_type: eventType,
                error: error.message
            };
        }
    }

    /**
     * Validate webhook signature
     * @param {string} payload - Raw payload
     * @param {string} signature - GitHub signature
     * @returns {Promise<boolean>} Validation result
     */
    async validateSignature(payload, signature) {
        if (!this.config.signature_validation) {
            return true;
        }

        if (!signature) {
            throw new Error('Missing webhook signature');
        }

        if (!this.config.github_secret) {
            throw new Error('GitHub webhook secret not configured');
        }

        try {
            // Support both SHA-1 and SHA-256 signatures
            let expectedSignature;
            let algorithm;

            if (signature.startsWith('sha256=')) {
                algorithm = 'sha256';
                expectedSignature = 'sha256=' + crypto
                    .createHmac('sha256', this.config.github_secret)
                    .update(payload, 'utf8')
                    .digest('hex');
            } else if (signature.startsWith('sha1=')) {
                algorithm = 'sha1';
                expectedSignature = 'sha1=' + crypto
                    .createHmac('sha1', this.config.github_secret)
                    .update(payload, 'utf8')
                    .digest('hex');
            } else {
                throw new Error('Unsupported signature algorithm');
            }

            // Use timing-safe comparison
            const isValid = crypto.timingSafeEqual(
                Buffer.from(signature, 'utf8'),
                Buffer.from(expectedSignature, 'utf8')
            );

            if (!isValid) {
                throw new Error('Invalid webhook signature');
            }

            log('debug', `Webhook signature validated successfully (${algorithm})`);
            return true;

        } catch (error) {
            log('error', `Webhook signature validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Register custom event handler
     * @param {string} eventType - Event type to handle
     * @param {Function} handler - Handler function
     */
    registerEventHandler(eventType, handler) {
        this.eventHandlers.set(eventType, handler);
        log('debug', `Registered custom handler for event type: ${eventType}`);
    }

    /**
     * Get webhook statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const totalEvents = this.recentEvents.length;
        const eventsByType = {};
        const eventsByStatus = { processed: 0, failed: 0, rejected: 0 };

        for (const event of this.recentEvents) {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            eventsByStatus[event.status] = (eventsByStatus[event.status] || 0) + 1;
        }

        return {
            total_events: totalEvents,
            events_by_type: eventsByType,
            events_by_status: eventsByStatus,
            success_rate: totalEvents > 0 ? eventsByStatus.processed / totalEvents : 0,
            rate_limit_hits: Array.from(this.rateLimitTracker.values()).reduce((sum, tracker) => sum + tracker.hits, 0),
            recent_events: this.recentEvents.slice(-10)
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        const recentFailureRate = this._calculateRecentFailureRate();

        return {
            status: recentFailureRate < 0.2 ? 'healthy' : 'degraded',
            signature_validation: this.config.signature_validation,
            rate_limiting: this.config.rate_limiting.enabled,
            replay_protection: this.config.replay_protection.enabled,
            supported_events: this.config.supported_events,
            recent_failure_rate: recentFailureRate,
            total_events_processed: stats.total_events
        };
    }

    /**
     * Shutdown webhook handler
     */
    async shutdown() {
        log('info', 'Shutting down GitHub Webhook Handler...');

        // Clear all tracking data
        this.processedEvents.clear();
        this.eventStatistics.clear();
        this.rateLimitTracker.clear();
        this.recentEvents.length = 0;

        log('info', 'GitHub Webhook Handler shut down');
    }

    // Private methods

    /**
     * Initialize default event handlers
     * @private
     */
    _initializeEventHandlers() {
        // Pull request events
        this.eventHandlers.set('pull_request.opened', this._handlePROpened.bind(this));
        this.eventHandlers.set('pull_request.synchronize', this._handlePRSynchronize.bind(this));
        this.eventHandlers.set('pull_request.closed', this._handlePRClosed.bind(this));
        this.eventHandlers.set('pull_request.reopened', this._handlePRReopened.bind(this));

        // Check events
        this.eventHandlers.set('check_run.completed', this._handleCheckRunCompleted.bind(this));
        this.eventHandlers.set('check_suite.completed', this._handleCheckSuiteCompleted.bind(this));

        // Workflow events
        this.eventHandlers.set('workflow_run.completed', this._handleWorkflowRunCompleted.bind(this));

        // Push events
        this.eventHandlers.set('push', this._handlePush.bind(this));

        // Issues events
        this.eventHandlers.set('issues.opened', this._handleIssueOpened.bind(this));
        this.eventHandlers.set('issues.closed', this._handleIssueClosed.bind(this));
    }

    /**
     * Generate unique event ID
     * @param {Object} event - Event data
     * @returns {string} Event ID
     * @private
     */
    _generateEventId(event) {
        const timestamp = Date.now();
        const hash = crypto.createHash('sha256')
            .update(JSON.stringify(event))
            .digest('hex')
            .substring(0, 8);
        return `gh_${timestamp}_${hash}`;
    }

    /**
     * Check rate limiting
     * @param {string} clientId - Client identifier
     * @private
     */
    async _checkRateLimit(clientId) {
        const now = Date.now();
        const windowStart = now - this.config.rate_limiting.window_ms;

        if (!this.rateLimitTracker.has(clientId)) {
            this.rateLimitTracker.set(clientId, { requests: [], hits: 0 });
        }

        const tracker = this.rateLimitTracker.get(clientId);
        
        // Remove old requests outside the window
        tracker.requests = tracker.requests.filter(timestamp => timestamp > windowStart);

        // Check if limit exceeded
        if (tracker.requests.length >= this.config.rate_limiting.max_requests) {
            tracker.hits++;
            throw new Error(`Rate limit exceeded for client ${clientId}`);
        }

        // Add current request
        tracker.requests.push(now);
    }

    /**
     * Check replay protection
     * @param {string} eventId - Event ID
     * @param {string} deliveryId - GitHub delivery ID
     * @private
     */
    async _checkReplayProtection(eventId, deliveryId) {
        const now = Date.now();
        const windowStart = now - this.config.replay_protection.window_ms;

        // Check if we've seen this delivery ID recently
        if (deliveryId && this.processedEvents.has(deliveryId)) {
            const previousEvent = this.processedEvents.get(deliveryId);
            if (previousEvent.timestamp > windowStart) {
                throw new Error(`Replay attack detected: delivery ID ${deliveryId} already processed`);
            }
        }

        // Store delivery ID
        if (deliveryId) {
            this.processedEvents.set(deliveryId, {
                event_id: eventId,
                timestamp: now
            });
        }
    }

    /**
     * Validate event structure and content
     * @param {Object} event - Event data
     * @param {string} eventType - Event type
     * @returns {Object} Validation result
     * @private
     */
    async _validateEvent(event, eventType) {
        // Check if event type is supported
        const baseEventType = eventType.split('.')[0];
        if (!this.config.supported_events.includes(baseEventType)) {
            return {
                valid: false,
                reason: `Unsupported event type: ${baseEventType}`
            };
        }

        // Basic structure validation
        if (!event || typeof event !== 'object') {
            return {
                valid: false,
                reason: 'Invalid event structure'
            };
        }

        // Event-specific validation
        switch (baseEventType) {
            case 'pull_request':
                if (!event.pull_request || !event.repository) {
                    return {
                        valid: false,
                        reason: 'Missing required pull_request or repository data'
                    };
                }
                break;

            case 'push':
                if (!event.repository || !event.ref) {
                    return {
                        valid: false,
                        reason: 'Missing required repository or ref data'
                    };
                }
                break;

            case 'issues':
                if (!event.issue || !event.repository) {
                    return {
                        valid: false,
                        reason: 'Missing required issue or repository data'
                    };
                }
                break;
        }

        return { valid: true };
    }

    /**
     * Process event based on type
     * @param {Object} event - Event data
     * @param {string} eventType - Event type
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _processEventByType(event, eventType, eventId) {
        const handler = this.eventHandlers.get(eventType);
        
        if (handler) {
            log('debug', `Processing ${eventType} with dedicated handler`);
            return await handler(event, eventId);
        } else {
            log('debug', `No specific handler for ${eventType}, using default processing`);
            return await this._handleGenericEvent(event, eventType, eventId);
        }
    }

    /**
     * Track processed event
     * @param {string} eventId - Event ID
     * @param {string} eventType - Event type
     * @param {Object} result - Processing result
     * @private
     */
    _trackEvent(eventId, eventType, result) {
        const eventRecord = {
            id: eventId,
            type: eventType,
            status: result.status || 'processed',
            timestamp: new Date(),
            processing_time_ms: result.processing_time_ms || 0
        };

        this.recentEvents.push(eventRecord);

        // Keep only recent events (last 1000)
        if (this.recentEvents.length > 1000) {
            this.recentEvents.shift();
        }

        // Update statistics
        this.eventStatistics.set(eventType, (this.eventStatistics.get(eventType) || 0) + 1);
    }

    /**
     * Calculate recent failure rate
     * @returns {number} Failure rate
     * @private
     */
    _calculateRecentFailureRate() {
        const recentEvents = this.recentEvents.filter(event => {
            const age = Date.now() - event.timestamp.getTime();
            return age < 300000; // Last 5 minutes
        });

        if (recentEvents.length === 0) return 0;

        const failures = recentEvents.filter(event => event.status === 'failed').length;
        return failures / recentEvents.length;
    }

    /**
     * Start cleanup intervals
     * @private
     */
    _startCleanupIntervals() {
        // Clean up old processed events every 10 minutes
        setInterval(() => {
            const now = Date.now();
            const cutoff = now - this.config.replay_protection.window_ms;

            for (const [deliveryId, event] of this.processedEvents.entries()) {
                if (event.timestamp < cutoff) {
                    this.processedEvents.delete(deliveryId);
                }
            }
        }, 600000);

        // Clean up rate limit trackers every 5 minutes
        setInterval(() => {
            const now = Date.now();
            const cutoff = now - this.config.rate_limiting.window_ms;

            for (const [clientId, tracker] of this.rateLimitTracker.entries()) {
                tracker.requests = tracker.requests.filter(timestamp => timestamp > cutoff);
                if (tracker.requests.length === 0) {
                    this.rateLimitTracker.delete(clientId);
                }
            }
        }, 300000);
    }

    // Event handler methods

    /**
     * Handle pull request opened event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePROpened(event, eventId) {
        const pr = event.pull_request;
        const repo = event.repository;

        log('info', `PR opened: ${repo.full_name}#${pr.number} - ${pr.title}`);

        return {
            status: 'processed',
            action: 'pr_opened',
            pr_info: {
                number: pr.number,
                title: pr.title,
                url: pr.html_url,
                branch: pr.head.ref,
                base_branch: pr.base.ref,
                repository: repo.full_name,
                author: pr.user.login
            },
            requires_processing: true
        };
    }

    /**
     * Handle pull request synchronize event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRSynchronize(event, eventId) {
        const pr = event.pull_request;
        const repo = event.repository;

        log('info', `PR updated: ${repo.full_name}#${pr.number}`);

        return {
            status: 'processed',
            action: 'pr_updated',
            pr_info: {
                number: pr.number,
                url: pr.html_url,
                repository: repo.full_name,
                head_sha: pr.head.sha
            },
            requires_processing: true
        };
    }

    /**
     * Handle pull request closed event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRClosed(event, eventId) {
        const pr = event.pull_request;
        const repo = event.repository;

        log('info', `PR ${pr.merged ? 'merged' : 'closed'}: ${repo.full_name}#${pr.number}`);

        return {
            status: 'processed',
            action: pr.merged ? 'pr_merged' : 'pr_closed',
            pr_info: {
                number: pr.number,
                url: pr.html_url,
                repository: repo.full_name,
                merged: pr.merged,
                merge_commit_sha: pr.merge_commit_sha
            },
            requires_processing: pr.merged
        };
    }

    /**
     * Handle pull request reopened event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePRReopened(event, eventId) {
        const pr = event.pull_request;
        const repo = event.repository;

        log('info', `PR reopened: ${repo.full_name}#${pr.number}`);

        return {
            status: 'processed',
            action: 'pr_reopened',
            pr_info: {
                number: pr.number,
                url: pr.html_url,
                repository: repo.full_name
            },
            requires_processing: true
        };
    }

    /**
     * Handle check run completed event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleCheckRunCompleted(event, eventId) {
        const checkRun = event.check_run;
        const repo = event.repository;

        log('info', `Check run completed: ${checkRun.name} - ${checkRun.conclusion}`);

        return {
            status: 'processed',
            action: 'check_run_completed',
            check_info: {
                name: checkRun.name,
                conclusion: checkRun.conclusion,
                status: checkRun.status,
                url: checkRun.html_url,
                repository: repo.full_name,
                head_sha: checkRun.head_sha
            },
            requires_processing: checkRun.conclusion === 'failure'
        };
    }

    /**
     * Handle check suite completed event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleCheckSuiteCompleted(event, eventId) {
        const checkSuite = event.check_suite;
        const repo = event.repository;

        log('info', `Check suite completed: ${checkSuite.conclusion}`);

        return {
            status: 'processed',
            action: 'check_suite_completed',
            check_info: {
                conclusion: checkSuite.conclusion,
                status: checkSuite.status,
                url: checkSuite.url,
                repository: repo.full_name,
                head_sha: checkSuite.head_sha
            },
            requires_processing: checkSuite.conclusion === 'failure'
        };
    }

    /**
     * Handle workflow run completed event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleWorkflowRunCompleted(event, eventId) {
        const workflowRun = event.workflow_run;
        const repo = event.repository;

        log('info', `Workflow run completed: ${workflowRun.name} - ${workflowRun.conclusion}`);

        return {
            status: 'processed',
            action: 'workflow_run_completed',
            workflow_info: {
                name: workflowRun.name,
                conclusion: workflowRun.conclusion,
                status: workflowRun.status,
                url: workflowRun.html_url,
                repository: repo.full_name,
                head_sha: workflowRun.head_sha
            },
            requires_processing: workflowRun.conclusion === 'failure'
        };
    }

    /**
     * Handle push event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handlePush(event, eventId) {
        const repo = event.repository;
        const ref = event.ref;
        const commits = event.commits || [];

        log('info', `Push to ${repo.full_name}:${ref} (${commits.length} commits)`);

        return {
            status: 'processed',
            action: 'push',
            push_info: {
                repository: repo.full_name,
                ref: ref,
                before: event.before,
                after: event.after,
                commits_count: commits.length,
                forced: event.forced || false
            },
            requires_processing: ref.includes('main') || ref.includes('master')
        };
    }

    /**
     * Handle issue opened event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleIssueOpened(event, eventId) {
        const issue = event.issue;
        const repo = event.repository;

        log('info', `Issue opened: ${repo.full_name}#${issue.number} - ${issue.title}`);

        return {
            status: 'processed',
            action: 'issue_opened',
            issue_info: {
                number: issue.number,
                title: issue.title,
                url: issue.html_url,
                repository: repo.full_name,
                author: issue.user.login,
                labels: issue.labels.map(label => label.name)
            },
            requires_processing: issue.labels.some(label => label.name.includes('bug') || label.name.includes('enhancement'))
        };
    }

    /**
     * Handle issue closed event
     * @param {Object} event - Event data
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleIssueClosed(event, eventId) {
        const issue = event.issue;
        const repo = event.repository;

        log('info', `Issue closed: ${repo.full_name}#${issue.number}`);

        return {
            status: 'processed',
            action: 'issue_closed',
            issue_info: {
                number: issue.number,
                url: issue.html_url,
                repository: repo.full_name,
                state_reason: issue.state_reason
            },
            requires_processing: false
        };
    }

    /**
     * Handle generic event
     * @param {Object} event - Event data
     * @param {string} eventType - Event type
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _handleGenericEvent(event, eventType, eventId) {
        log('debug', `Processing generic event: ${eventType}`);

        return {
            status: 'processed',
            action: 'generic_event',
            event_type: eventType,
            requires_processing: false
        };
    }
}

export default GitHubWebhookHandler;

