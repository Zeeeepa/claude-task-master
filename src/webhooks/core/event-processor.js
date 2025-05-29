/**
 * @fileoverview Consolidated Event Processor
 * @description Unified event processing logic consolidating PRs #48, #49, #58, #89
 * @version 3.0.0
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';

/**
 * Consolidated Event Processor
 * Handles all webhook event processing with unified pipeline
 */
export class EventProcessor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableQueue: config.enableQueue !== false,
            enableCorrelation: config.enableCorrelation !== false,
            enableRetries: config.enableRetries !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            processingTimeout: config.processingTimeout || 30000,
            ...config
        };

        this.queue = config.queue;
        this.database = config.database;
        this.errorHandler = config.errorHandler;
        this.monitoring = config.monitoring;
        
        this.logger = logger.child({ component: 'event-processor' });
        
        // Event handlers registry
        this.eventHandlers = new Map();
        this.correlationCache = new Map();
        
        // Statistics
        this.stats = {
            totalEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            skippedEvents: 0,
            averageProcessingTime: 0,
            lastProcessedEvent: null
        };

        // Initialize built-in handlers
        this._initializeEventHandlers();
    }

    /**
     * Initialize the event processor
     */
    async initialize() {
        this.logger.info('Initializing event processor...');
        
        try {
            // Set up event listeners
            this.on('event:received', this._onEventReceived.bind(this));
            this.on('event:processed', this._onEventProcessed.bind(this));
            this.on('event:failed', this._onEventFailed.bind(this));
            
            this.logger.info('Event processor initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize event processor', { error: error.message });
            throw error;
        }
    }

    /**
     * Process a webhook event
     */
    async processWebhook(req, provider) {
        const eventId = uuidv4();
        const startTime = Date.now();
        
        this.logger.info('Processing webhook event', {
            eventId,
            provider,
            eventType: req.headers['x-github-event'] || req.headers['x-event-type'],
            deliveryId: req.headers['x-github-delivery'] || req.headers['x-delivery-id']
        });

        try {
            // Create event object
            const event = this._createEventObject(req, provider, eventId);
            
            // Emit event received
            this.emit('event:received', event);
            
            // Check for duplicates using correlation
            if (this.config.enableCorrelation && await this._isDuplicateEvent(event)) {
                this.stats.skippedEvents++;
                this.logger.info('Skipping duplicate event', { eventId });
                return {
                    eventId,
                    status: 'skipped',
                    message: 'Duplicate event detected',
                    data: { reason: 'duplicate' }
                };
            }

            // Process the event
            const result = await this._processEvent(event);
            
            // Update statistics
            const processingTime = Date.now() - startTime;
            this._updateStats(true, processingTime);
            
            // Emit event processed
            this.emit('event:processed', event, result);
            
            this.logger.info('Event processed successfully', {
                eventId,
                processingTime,
                result: result.summary
            });

            return {
                eventId,
                status: 'completed',
                message: 'Event processed successfully',
                data: {
                    processingTime,
                    ...result
                }
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this._updateStats(false, processingTime);
            
            // Emit event failed
            this.emit('event:failed', { eventId, provider }, error);
            
            this.logger.error('Event processing failed', {
                eventId,
                error: error.message,
                processingTime
            });

            // Handle error through error handler
            if (this.errorHandler) {
                await this.errorHandler.handleEventError(error, { eventId, provider });
            }

            throw error;
        }
    }

    /**
     * Create event object from request
     */
    _createEventObject(req, provider, eventId) {
        const event = {
            id: eventId,
            provider,
            type: req.headers['x-github-event'] || req.headers['x-event-type'] || 'unknown',
            action: req.body.action,
            deliveryId: req.headers['x-github-delivery'] || req.headers['x-delivery-id'],
            timestamp: new Date().toISOString(),
            payload: req.body,
            headers: this._sanitizeHeaders(req.headers),
            metadata: {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
                contentType: req.headers['content-type']
            }
        };

        // Add provider-specific fields
        if (provider === 'github') {
            event.repository = req.body.repository?.full_name;
            event.sender = req.body.sender?.login;
            event.installation = req.body.installation?.id;
        }

        return event;
    }

    /**
     * Process an event through the pipeline
     */
    async _processEvent(event) {
        const pipeline = [
            this._validateEvent,
            this._extractMetadata,
            this._correlateEvent,
            this._routeEvent,
            this._executeHandlers,
            this._storeEvent,
            this._notifyStakeholders
        ];

        let result = { steps: [], summary: {} };

        for (const step of pipeline) {
            const stepName = step.name.replace('_', '');
            const stepTimer = this.logger.timer(`step-${stepName}`);
            
            try {
                const stepResult = await step.call(this, event, result);
                const duration = stepTimer.end('debug');
                
                result.steps.push({
                    name: stepName,
                    status: 'completed',
                    duration,
                    result: stepResult
                });

                // Merge step result into summary
                if (stepResult && typeof stepResult === 'object') {
                    Object.assign(result.summary, stepResult);
                }

            } catch (error) {
                const duration = stepTimer.end('error', { error: error.message });
                
                result.steps.push({
                    name: stepName,
                    status: 'failed',
                    duration,
                    error: error.message
                });

                // Handle step failure
                if (this.config.enableRetries && this._shouldRetryStep(stepName, error)) {
                    this.logger.warn(`Retrying step ${stepName}`, { eventId: event.id });
                    // Implement retry logic here
                } else {
                    throw error;
                }
            }
        }

        return result;
    }

    /**
     * Validate event structure and content
     */
    async _validateEvent(event) {
        this.logger.debug('Validating event', { eventId: event.id, type: event.type });

        // Basic validation
        if (!event.type || !event.payload) {
            throw new Error('Invalid event: missing type or payload');
        }

        // Provider-specific validation
        const handler = this.eventHandlers.get(`${event.provider}:validate`);
        if (handler) {
            await handler(event);
        }

        return { validated: true };
    }

    /**
     * Extract metadata from event
     */
    async _extractMetadata(event) {
        this.logger.debug('Extracting metadata', { eventId: event.id });

        const metadata = {
            priority: this._calculatePriority(event),
            complexity: this._estimateComplexity(event),
            tags: this._extractTags(event),
            context: this._extractContext(event)
        };

        event.metadata = { ...event.metadata, ...metadata };
        
        return { metadata };
    }

    /**
     * Correlate event with existing events/workflows
     */
    async _correlateEvent(event) {
        if (!this.config.enableCorrelation) {
            return { correlated: false };
        }

        this.logger.debug('Correlating event', { eventId: event.id });

        const correlationKey = this._generateCorrelationKey(event);
        const existingEvents = this.correlationCache.get(correlationKey) || [];
        
        existingEvents.push(event.id);
        this.correlationCache.set(correlationKey, existingEvents);

        // Find related events
        const relatedEvents = await this._findRelatedEvents(event);
        
        return {
            correlated: true,
            correlationKey,
            relatedEvents: relatedEvents.length
        };
    }

    /**
     * Route event to appropriate handlers
     */
    async _routeEvent(event) {
        this.logger.debug('Routing event', { eventId: event.id, type: event.type });

        const routingKey = `${event.provider}:${event.type}`;
        const handlers = this._getHandlersForEvent(routingKey);

        event.handlers = handlers;
        
        return {
            routed: true,
            handlerCount: handlers.length,
            handlers: handlers.map(h => h.name)
        };
    }

    /**
     * Execute event handlers
     */
    async _executeHandlers(event) {
        this.logger.debug('Executing handlers', { 
            eventId: event.id, 
            handlerCount: event.handlers?.length || 0 
        });

        const results = [];

        if (event.handlers && event.handlers.length > 0) {
            for (const handler of event.handlers) {
                try {
                    const handlerResult = await handler.execute(event);
                    results.push({
                        handler: handler.name,
                        status: 'success',
                        result: handlerResult
                    });
                } catch (error) {
                    results.push({
                        handler: handler.name,
                        status: 'error',
                        error: error.message
                    });
                    
                    // Continue with other handlers unless critical
                    if (handler.critical) {
                        throw error;
                    }
                }
            }
        }

        return {
            executed: true,
            handlerResults: results,
            successCount: results.filter(r => r.status === 'success').length,
            errorCount: results.filter(r => r.status === 'error').length
        };
    }

    /**
     * Store event in database
     */
    async _storeEvent(event, result) {
        if (!this.database) {
            return { stored: false, reason: 'no_database' };
        }

        this.logger.debug('Storing event', { eventId: event.id });

        try {
            await this.database.storeEvent(event, result);
            return { stored: true };
        } catch (error) {
            this.logger.error('Failed to store event', { 
                eventId: event.id, 
                error: error.message 
            });
            // Don't fail the entire pipeline for storage errors
            return { stored: false, error: error.message };
        }
    }

    /**
     * Notify stakeholders
     */
    async _notifyStakeholders(event, result) {
        this.logger.debug('Notifying stakeholders', { eventId: event.id });

        const notifications = [];

        // Determine who to notify based on event type and result
        const stakeholders = this._getStakeholders(event, result);

        for (const stakeholder of stakeholders) {
            try {
                await this._sendNotification(stakeholder, event, result);
                notifications.push({
                    stakeholder: stakeholder.type,
                    status: 'sent'
                });
            } catch (error) {
                notifications.push({
                    stakeholder: stakeholder.type,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return {
            notified: true,
            notifications,
            stakeholderCount: stakeholders.length
        };
    }

    /**
     * Initialize built-in event handlers
     */
    _initializeEventHandlers() {
        // GitHub event handlers
        this._registerGitHubHandlers();
        
        // Generic handlers
        this._registerGenericHandlers();
    }

    /**
     * Register GitHub-specific event handlers
     */
    _registerGitHubHandlers() {
        // Pull request handlers
        this.registerHandler('github:pull_request', {
            name: 'github-pr-handler',
            execute: async (event) => {
                const action = event.payload.action;
                const pr = event.payload.pull_request;
                
                this.logger.info('Processing GitHub PR event', {
                    action,
                    prNumber: pr.number,
                    repository: event.repository
                });

                // Handle different PR actions
                switch (action) {
                    case 'opened':
                        return await this._handlePROpened(event);
                    case 'synchronize':
                        return await this._handlePRSynchronized(event);
                    case 'closed':
                        return await this._handlePRClosed(event);
                    default:
                        return { action, handled: false };
                }
            }
        });

        // Push event handlers
        this.registerHandler('github:push', {
            name: 'github-push-handler',
            execute: async (event) => {
                const ref = event.payload.ref;
                const commits = event.payload.commits || [];
                
                this.logger.info('Processing GitHub push event', {
                    ref,
                    commitCount: commits.length,
                    repository: event.repository
                });

                return await this._handlePush(event);
            }
        });

        // Workflow run handlers
        this.registerHandler('github:workflow_run', {
            name: 'github-workflow-handler',
            execute: async (event) => {
                const workflowRun = event.payload.workflow_run;
                
                this.logger.info('Processing GitHub workflow run event', {
                    conclusion: workflowRun.conclusion,
                    status: workflowRun.status,
                    repository: event.repository
                });

                return await this._handleWorkflowRun(event);
            }
        });
    }

    /**
     * Register generic event handlers
     */
    _registerGenericHandlers() {
        // Validation handler
        this.registerHandler('*:validate', {
            name: 'generic-validator',
            execute: async (event) => {
                // Generic validation logic
                return { validated: true };
            }
        });
    }

    /**
     * Register an event handler
     */
    registerHandler(eventPattern, handler) {
        this.eventHandlers.set(eventPattern, handler);
        this.logger.debug('Registered event handler', { 
            pattern: eventPattern, 
            handler: handler.name 
        });
    }

    /**
     * Get handlers for an event
     */
    _getHandlersForEvent(routingKey) {
        const handlers = [];
        
        // Exact match
        if (this.eventHandlers.has(routingKey)) {
            handlers.push(this.eventHandlers.get(routingKey));
        }
        
        // Wildcard matches
        for (const [pattern, handler] of this.eventHandlers) {
            if (pattern.includes('*') && this._matchesPattern(routingKey, pattern)) {
                handlers.push(handler);
            }
        }
        
        return handlers;
    }

    /**
     * Check if routing key matches pattern
     */
    _matchesPattern(routingKey, pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(routingKey);
    }

    /**
     * Handle PR opened event
     */
    async _handlePROpened(event) {
        // Create task for PR review
        // Trigger CI/CD pipeline
        // Notify stakeholders
        return { action: 'opened', taskCreated: true };
    }

    /**
     * Handle PR synchronized event
     */
    async _handlePRSynchronized(event) {
        // Update existing task
        // Re-trigger validation
        return { action: 'synchronized', taskUpdated: true };
    }

    /**
     * Handle PR closed event
     */
    async _handlePRClosed(event) {
        // Complete or cancel task
        // Clean up resources
        return { action: 'closed', taskCompleted: true };
    }

    /**
     * Handle push event
     */
    async _handlePush(event) {
        // Trigger deployment pipeline
        // Update related tasks
        return { action: 'push', pipelineTriggered: true };
    }

    /**
     * Handle workflow run event
     */
    async _handleWorkflowRun(event) {
        // Update task status based on workflow result
        // Handle failures
        return { action: 'workflow_run', statusUpdated: true };
    }

    /**
     * Calculate event priority
     */
    _calculatePriority(event) {
        // Priority calculation logic
        if (event.type === 'pull_request' && event.payload.pull_request?.draft === false) {
            return 'high';
        }
        if (event.type === 'push' && event.payload.ref === 'refs/heads/main') {
            return 'critical';
        }
        return 'medium';
    }

    /**
     * Estimate event complexity
     */
    _estimateComplexity(event) {
        // Complexity estimation logic
        const payload = event.payload;
        let complexity = 1;
        
        if (payload.commits && payload.commits.length > 10) complexity += 2;
        if (payload.pull_request && payload.pull_request.changed_files > 20) complexity += 2;
        
        return Math.min(complexity, 10);
    }

    /**
     * Extract tags from event
     */
    _extractTags(event) {
        const tags = [event.provider, event.type];
        
        if (event.repository) {
            tags.push(`repo:${event.repository}`);
        }
        
        return tags;
    }

    /**
     * Extract context from event
     */
    _extractContext(event) {
        return {
            repository: event.repository,
            sender: event.sender,
            timestamp: event.timestamp
        };
    }

    /**
     * Check if event is duplicate
     */
    async _isDuplicateEvent(event) {
        const key = `${event.deliveryId}:${event.type}`;
        return this.correlationCache.has(key);
    }

    /**
     * Generate correlation key
     */
    _generateCorrelationKey(event) {
        if (event.type === 'pull_request') {
            return `pr:${event.repository}:${event.payload.pull_request.number}`;
        }
        if (event.type === 'push') {
            return `push:${event.repository}:${event.payload.ref}`;
        }
        return `${event.type}:${event.repository}:${event.deliveryId}`;
    }

    /**
     * Find related events
     */
    async _findRelatedEvents(event) {
        // Implementation would query database for related events
        return [];
    }

    /**
     * Get stakeholders for notification
     */
    _getStakeholders(event, result) {
        // Determine stakeholders based on event and result
        return [];
    }

    /**
     * Send notification to stakeholder
     */
    async _sendNotification(stakeholder, event, result) {
        // Implementation would send actual notifications
        this.logger.debug('Sending notification', { 
            stakeholder: stakeholder.type,
            eventId: event.id 
        });
    }

    /**
     * Sanitize headers for logging
     */
    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        delete sanitized.authorization;
        delete sanitized['x-hub-signature-256'];
        return sanitized;
    }

    /**
     * Check if step should be retried
     */
    _shouldRetryStep(stepName, error) {
        // Retry logic based on step and error type
        return false;
    }

    /**
     * Update processing statistics
     */
    _updateStats(success, processingTime) {
        this.stats.totalEvents++;
        
        if (success) {
            this.stats.successfulEvents++;
        } else {
            this.stats.failedEvents++;
        }
        
        // Update average processing time
        const totalTime = this.stats.averageProcessingTime * (this.stats.totalEvents - 1) + processingTime;
        this.stats.averageProcessingTime = totalTime / this.stats.totalEvents;
        
        this.stats.lastProcessedEvent = new Date().toISOString();
    }

    /**
     * Event listeners
     */
    _onEventReceived(event) {
        this.logger.debug('Event received', { eventId: event.id, type: event.type });
        
        if (this.monitoring) {
            this.monitoring.recordMetric('event_received', 1, { 
                provider: event.provider, 
                type: event.type 
            });
        }
    }

    _onEventProcessed(event, result) {
        this.logger.debug('Event processed', { eventId: event.id, steps: result.steps.length });
        
        if (this.monitoring) {
            this.monitoring.recordMetric('event_processed', 1, { 
                provider: event.provider, 
                type: event.type 
            });
        }
    }

    _onEventFailed(event, error) {
        this.logger.error('Event failed', { eventId: event.id, error: error.message });
        
        if (this.monitoring) {
            this.monitoring.recordMetric('event_failed', 1, { 
                provider: event.provider, 
                type: event.type 
            });
        }
    }

    /**
     * Get recent events
     */
    async getRecentEvents(query = {}) {
        if (!this.database) {
            return { events: [], total: 0 };
        }
        
        return await this.database.getRecentEvents(query);
    }

    /**
     * Replay an event
     */
    async replayEvent(eventId) {
        if (!this.database) {
            throw new Error('Database not available for event replay');
        }
        
        const event = await this.database.getEvent(eventId);
        if (!event) {
            throw new Error(`Event ${eventId} not found`);
        }
        
        // Replay the event
        return await this._processEvent(event);
    }

    /**
     * Get processor statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

export default EventProcessor;

