/**
 * @fileoverview Webhook Processor
 * @description Core webhook processing engine with event validation, routing, and workflow execution
 */

import { EventDeduplicator } from '../utils/event_deduplicator.js';

/**
 * Webhook Processor class
 */
export class WebhookProcessor {
    constructor(config = {}) {
        this.config = {
            maxProcessingTime: config.maxProcessingTime || 30000, // 30 seconds
            enableDeduplication: config.enableDeduplication !== false,
            enableParallelProcessing: config.enableParallelProcessing !== false,
            maxConcurrentEvents: config.maxConcurrentEvents || 10,
            ...config
        };

        this.eventQueue = config.eventQueue;
        this.eventRouter = config.eventRouter;
        this.eventStore = config.eventStore;
        this.retryManager = config.retryManager;
        this.handlers = config.handlers || {};
        this.workflowEngine = config.workflowEngine;

        this.eventDeduplicator = new EventDeduplicator(this.config.deduplication);
        this.activeProcessing = new Map();
        this.processingStats = {
            totalProcessed: 0,
            totalFailed: 0,
            averageProcessingTime: 0,
            lastProcessedAt: null
        };
    }

    /**
     * Process incoming webhook
     * @param {Object} event - Webhook event
     * @returns {Promise<Object>} Processing result
     */
    async processWebhook(event) {
        const startTime = Date.now();
        const processingId = `proc_${event.id}_${Date.now()}`;

        try {
            // Store event immediately
            await this.eventStore.storeEvent(event);

            // Validate event
            const validatedEvent = await this.validateEvent(event);

            // Check for duplicates
            if (this.config.enableDeduplication) {
                const isDuplicate = await this.eventDeduplicator.isDuplicate(validatedEvent);
                if (isDuplicate) {
                    return this.createResult(event, 'duplicate', 'Event is a duplicate', startTime);
                }
            }

            // Enrich event with context
            const enrichedEvent = await this.enrichContext(validatedEvent);

            // Route event to appropriate handler
            const routedEvent = await this.routeEvent(enrichedEvent);

            // Execute workflow
            const result = await this.executeWorkflow(routedEvent, processingId);

            // Update processing stats
            this.updateProcessingStats(startTime, true);

            return this.createResult(event, 'success', 'Event processed successfully', startTime, result);

        } catch (error) {
            console.error(`Webhook processing failed for event ${event.id}:`, error);

            // Update processing stats
            this.updateProcessingStats(startTime, false);

            // Store error
            await this.eventStore.storeEventError(event.id, error);

            // Queue for retry if appropriate
            if (this.shouldRetry(error)) {
                await this.retryManager.queueForRetry(event, error);
            }

            return this.createResult(event, 'error', error.message, startTime);
        } finally {
            this.activeProcessing.delete(processingId);
        }
    }

    /**
     * Validate incoming event
     * @param {Object} event - Event to validate
     * @returns {Promise<Object>} Validated event
     */
    async validateEvent(event) {
        const errors = [];

        // Required fields
        if (!event.id) errors.push('Event ID is required');
        if (!event.source) errors.push('Event source is required');
        if (!event.type) errors.push('Event type is required');
        if (!event.payload) errors.push('Event payload is required');
        if (!event.timestamp) errors.push('Event timestamp is required');

        // Validate timestamp
        if (event.timestamp) {
            const timestamp = new Date(event.timestamp);
            if (isNaN(timestamp.getTime())) {
                errors.push('Invalid timestamp format');
            }

            // Check if event is too old (older than 1 hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (timestamp < oneHourAgo) {
                errors.push('Event timestamp is too old');
            }
        }

        // Validate source
        const validSources = ['github', 'linear', 'codegen', 'claude_code'];
        if (event.source && !validSources.includes(event.source)) {
            errors.push(`Invalid event source: ${event.source}`);
        }

        // Source-specific validation
        if (event.source === 'github') {
            await this.validateGitHubEvent(event, errors);
        } else if (event.source === 'linear') {
            await this.validateLinearEvent(event, errors);
        }

        if (errors.length > 0) {
            throw new Error(`Event validation failed: ${errors.join(', ')}`);
        }

        return {
            ...event,
            validatedAt: new Date().toISOString()
        };
    }

    /**
     * Validate GitHub event
     * @param {Object} event - GitHub event
     * @param {Array} errors - Error array to populate
     */
    async validateGitHubEvent(event, errors) {
        const payload = event.payload;

        // Check for required GitHub fields
        if (event.type === 'pull_request') {
            if (!payload.pull_request) {
                errors.push('GitHub pull_request event missing pull_request data');
            } else {
                if (!payload.pull_request.id) errors.push('Pull request ID missing');
                if (!payload.pull_request.number) errors.push('Pull request number missing');
                if (!payload.repository?.full_name) errors.push('Repository full name missing');
            }
        } else if (event.type === 'push') {
            if (!payload.repository?.full_name) errors.push('Repository full name missing');
            if (!payload.ref) errors.push('Push ref missing');
        } else if (event.type === 'issue_comment') {
            if (!payload.comment) errors.push('Comment data missing');
            if (!payload.issue) errors.push('Issue data missing');
        }
    }

    /**
     * Validate Linear event
     * @param {Object} event - Linear event
     * @param {Array} errors - Error array to populate
     */
    async validateLinearEvent(event, errors) {
        const payload = event.payload;

        // Check for required Linear fields
        if (event.type === 'issue.update' || event.type === 'issue.create') {
            if (!payload.data) {
                errors.push('Linear event missing data field');
            } else {
                if (!payload.data.id) errors.push('Issue ID missing');
                if (!payload.data.title) errors.push('Issue title missing');
            }
        }
    }

    /**
     * Enrich event with additional context
     * @param {Object} event - Event to enrich
     * @returns {Promise<Object>} Enriched event
     */
    async enrichContext(event) {
        const enrichedEvent = {
            ...event,
            context: {
                processingStartTime: Date.now(),
                enrichedAt: new Date().toISOString()
            }
        };

        try {
            // Add source-specific context
            if (event.source === 'github') {
                enrichedEvent.context.github = await this.enrichGitHubContext(event);
            } else if (event.source === 'linear') {
                enrichedEvent.context.linear = await this.enrichLinearContext(event);
            }

            // Add system context
            enrichedEvent.context.system = {
                nodeVersion: process.version,
                platform: process.platform,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };

        } catch (error) {
            console.warn(`Failed to enrich context for event ${event.id}:`, error);
            enrichedEvent.context.enrichmentError = error.message;
        }

        return enrichedEvent;
    }

    /**
     * Enrich GitHub event context
     * @param {Object} event - GitHub event
     * @returns {Promise<Object>} GitHub context
     */
    async enrichGitHubContext(event) {
        const context = {};

        if (event.type === 'pull_request') {
            const pr = event.payload.pull_request;
            context.pullRequest = {
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                author: pr.user?.login,
                repository: event.payload.repository?.full_name,
                branch: pr.head?.ref,
                baseBranch: pr.base?.ref,
                isDraft: pr.draft,
                mergeable: pr.mergeable,
                changedFiles: pr.changed_files,
                additions: pr.additions,
                deletions: pr.deletions
            };
        }

        return context;
    }

    /**
     * Enrich Linear event context
     * @param {Object} event - Linear event
     * @returns {Promise<Object>} Linear context
     */
    async enrichLinearContext(event) {
        const context = {};

        if (event.type === 'issue.update' || event.type === 'issue.create') {
            const issue = event.payload.data;
            context.issue = {
                id: issue.id,
                title: issue.title,
                state: issue.state?.name,
                priority: issue.priority,
                assignee: issue.assignee?.name,
                team: issue.team?.name,
                project: issue.project?.name,
                labels: issue.labels?.map(label => label.name) || []
            };
        }

        return context;
    }

    /**
     * Route event to appropriate handler
     * @param {Object} event - Event to route
     * @returns {Promise<Object>} Routed event
     */
    async routeEvent(event) {
        const routingResult = await this.eventRouter.routeEvent(event);
        
        return {
            ...event,
            routing: routingResult,
            routedAt: new Date().toISOString()
        };
    }

    /**
     * Execute workflow for event
     * @param {Object} event - Event to process
     * @param {string} processingId - Processing ID
     * @returns {Promise<Object>} Workflow result
     */
    async executeWorkflow(event, processingId) {
        this.activeProcessing.set(processingId, {
            eventId: event.id,
            startTime: Date.now(),
            status: 'processing'
        });

        try {
            // Get appropriate handler
            const handler = this.handlers[event.source];
            if (!handler) {
                throw new Error(`No handler found for source: ${event.source}`);
            }

            // Process event with handler
            const handlerResult = await handler.processEvent(event);

            // Execute workflow if needed
            let workflowResult = null;
            if (this.workflowEngine && handlerResult.triggerWorkflow) {
                workflowResult = await this.workflowEngine.executeWorkflow(
                    handlerResult.workflowType,
                    event,
                    handlerResult.workflowData
                );
            }

            // Update processing status
            this.activeProcessing.set(processingId, {
                ...this.activeProcessing.get(processingId),
                status: 'completed'
            });

            return {
                handlerResult,
                workflowResult,
                completedAt: new Date().toISOString()
            };

        } catch (error) {
            this.activeProcessing.set(processingId, {
                ...this.activeProcessing.get(processingId),
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Create processing result
     * @param {Object} event - Original event
     * @param {string} status - Processing status
     * @param {string} message - Result message
     * @param {number} startTime - Processing start time
     * @param {Object} data - Additional result data
     * @returns {Object} Processing result
     */
    createResult(event, status, message, startTime, data = null) {
        const processingTime = Date.now() - startTime;

        return {
            eventId: event.id,
            status,
            message,
            processingTime,
            timestamp: new Date().toISOString(),
            summary: {
                source: event.source,
                type: event.type,
                processingTime,
                status
            },
            data
        };
    }

    /**
     * Update processing statistics
     * @param {number} startTime - Processing start time
     * @param {boolean} success - Whether processing was successful
     */
    updateProcessingStats(startTime, success) {
        const processingTime = Date.now() - startTime;
        
        this.processingStats.totalProcessed++;
        if (!success) {
            this.processingStats.totalFailed++;
        }

        // Update average processing time
        const totalSuccessful = this.processingStats.totalProcessed - this.processingStats.totalFailed;
        if (totalSuccessful > 0) {
            this.processingStats.averageProcessingTime = 
                (this.processingStats.averageProcessingTime * (totalSuccessful - 1) + processingTime) / totalSuccessful;
        }

        this.processingStats.lastProcessedAt = new Date().toISOString();
    }

    /**
     * Check if event should be retried
     * @param {Error} error - Processing error
     * @returns {boolean} Whether to retry
     */
    shouldRetry(error) {
        // Don't retry validation errors
        if (error.message.includes('validation failed')) {
            return false;
        }

        // Don't retry duplicate events
        if (error.message.includes('duplicate')) {
            return false;
        }

        // Retry network and temporary errors
        return true;
    }

    /**
     * Get processing statistics
     * @returns {Object} Processing statistics
     */
    getStatistics() {
        return {
            ...this.processingStats,
            activeProcessing: this.activeProcessing.size,
            successRate: this.processingStats.totalProcessed > 0 
                ? ((this.processingStats.totalProcessed - this.processingStats.totalFailed) / this.processingStats.totalProcessed) * 100
                : 0
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check if processing is stuck
            const stuckProcessing = Array.from(this.activeProcessing.values())
                .filter(proc => Date.now() - proc.startTime > this.config.maxProcessingTime);

            if (stuckProcessing.length > 0) {
                return 'degraded';
            }

            // Check if too many concurrent processes
            if (this.activeProcessing.size > this.config.maxConcurrentEvents) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }
}

export default WebhookProcessor;

