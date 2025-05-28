/**
 * @fileoverview Event Processor
 * @description Processes GitHub webhook events and routes them to appropriate handlers
 */

import { log } from '../utils/simple_logger.js';
import { EventDeduplicator } from './event_deduplicator.js';
import { WorkflowDispatcher } from '../triggers/workflow_dispatcher.js';

/**
 * Event processor for GitHub webhook events
 * Handles event routing, processing, and error recovery
 */
export class EventProcessor {
    constructor(database, config = {}) {
        this.database = database;
        this.config = {
            // Maximum processing time per event (in milliseconds)
            max_processing_time: config.max_processing_time || 300000, // 5 minutes
            // Enable event replay functionality
            enable_event_replay: config.enable_event_replay !== false,
            // Maximum retry attempts for failed events
            max_retry_attempts: config.max_retry_attempts || 3,
            // Retry delay multiplier (exponential backoff)
            retry_delay_multiplier: config.retry_delay_multiplier || 2,
            // Base retry delay in milliseconds
            base_retry_delay: config.base_retry_delay || 5000, // 5 seconds
            // Enable detailed event logging
            enable_detailed_logging: config.enable_detailed_logging !== false,
            ...config
        };

        this.deduplicator = new EventDeduplicator(database, config.deduplicator);
        this.workflowDispatcher = new WorkflowDispatcher(database, config.workflow_dispatcher);
        
        // Event processing metrics
        this.metrics = {
            total_events_processed: 0,
            successful_events: 0,
            failed_events: 0,
            duplicate_events: 0,
            processing_times: [],
            last_processed_at: null
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the event processor
     */
    async initialize() {
        log('debug', 'Initializing event processor...');
        
        await this.deduplicator.initialize?.();
        await this.workflowDispatcher.initialize();
        
        this.isInitialized = true;
        log('debug', 'Event processor initialized');
    }

    /**
     * Process a GitHub webhook event
     * @param {Object} eventData - Event data from webhook
     * @returns {Promise<Object>} Processing result
     */
    async processEvent(eventData) {
        if (!this.isInitialized) {
            throw new Error('Event processor not initialized');
        }

        const startTime = Date.now();
        const eventId = eventData.id;
        const eventType = eventData.type;

        try {
            log('info', `Processing event ${eventId} (${eventType})`);

            // Update metrics
            this.metrics.total_events_processed++;
            this.metrics.last_processed_at = new Date();

            // Check for duplicate events
            const isDuplicate = await this.deduplicator.isDuplicate(eventData);
            if (isDuplicate) {
                this.metrics.duplicate_events++;
                log('info', `Duplicate event detected: ${eventId}`);
                return { 
                    status: 'duplicate', 
                    event_id: eventId,
                    processing_time_ms: Date.now() - startTime
                };
            }

            // Store event in database
            await this.storeEvent(eventData);

            // Route event to appropriate handler
            const result = await this.routeEvent(eventData);

            // Mark event as processed
            await this.markEventProcessed(eventId);

            // Update success metrics
            this.metrics.successful_events++;
            const processingTime = Date.now() - startTime;
            this.metrics.processing_times.push(processingTime);

            // Keep only last 100 processing times for metrics
            if (this.metrics.processing_times.length > 100) {
                this.metrics.processing_times.shift();
            }

            log('info', `Successfully processed event ${eventId} in ${processingTime}ms`);

            return {
                ...result,
                processing_time_ms: processingTime,
                event_id: eventId
            };

        } catch (error) {
            this.metrics.failed_events++;
            log('error', `Event processing failed for ${eventId}: ${error.message}`);
            
            await this.markEventFailed(eventId, error.message);
            
            // Determine if event should be retried
            const shouldRetry = await this.shouldRetryEvent(eventData, error);
            if (shouldRetry) {
                await this.scheduleEventRetry(eventData, error);
            }

            throw error;
        }
    }

    /**
     * Route event to appropriate handler based on event type
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Routing result
     */
    async routeEvent(eventData) {
        const { type, payload } = eventData;

        log('debug', `Routing event type: ${type}`);

        switch (type) {
            case 'pull_request':
                return await this.handlePullRequestEvent(payload);
            case 'pull_request_review':
                return await this.handlePullRequestReviewEvent(payload);
            case 'push':
                return await this.handlePushEvent(payload);
            case 'issues':
                return await this.handleIssuesEvent(payload);
            case 'issue_comment':
                return await this.handleIssueCommentEvent(payload);
            default:
                log('warn', `Unhandled event type: ${type}`);
                return { 
                    status: 'unhandled', 
                    event_type: type,
                    message: `No handler available for event type: ${type}`
                };
        }
    }

    /**
     * Handle pull request events
     * @param {Object} payload - GitHub pull request payload
     * @returns {Promise<Object>} Handler result
     */
    async handlePullRequestEvent(payload) {
        const { action, pull_request, repository } = payload;
        
        log('info', `Processing PR ${action}: ${pull_request.number} in ${repository.full_name}`);

        // Extract task data from PR payload
        const taskData = this.extractTaskDataFromPR(payload);

        // Dispatch to workflow dispatcher
        const result = await this.workflowDispatcher.dispatchPRWorkflow(action, taskData);

        return {
            status: 'processed',
            event_type: 'pull_request',
            action: action,
            repository: repository.full_name,
            pr_number: pull_request.number,
            workflow_result: result
        };
    }

    /**
     * Handle pull request review events
     * @param {Object} payload - GitHub pull request review payload
     * @returns {Promise<Object>} Handler result
     */
    async handlePullRequestReviewEvent(payload) {
        const { action, review, pull_request, repository } = payload;
        
        log('info', `Processing PR review ${action}: ${pull_request.number} in ${repository.full_name}`);

        // For now, just log the review event
        // Future implementation could trigger review analysis workflows
        
        return {
            status: 'processed',
            event_type: 'pull_request_review',
            action: action,
            repository: repository.full_name,
            pr_number: pull_request.number,
            review_state: review.state,
            reviewer: review.user.login
        };
    }

    /**
     * Handle push events
     * @param {Object} payload - GitHub push payload
     * @returns {Promise<Object>} Handler result
     */
    async handlePushEvent(payload) {
        const { ref, repository, commits } = payload;
        
        log('info', `Processing push to ${ref} in ${repository.full_name} (${commits.length} commits)`);

        // Handle push events (could trigger deployment workflows)
        const branch = ref.replace('refs/heads/', '');
        
        // For main/master branch pushes, could trigger deployment
        if (['main', 'master', 'develop'].includes(branch)) {
            log('info', `Push to protected branch ${branch} detected`);
            
            // Future: Trigger deployment workflow
            return {
                status: 'processed',
                event_type: 'push',
                repository: repository.full_name,
                branch: branch,
                commits_count: commits.length,
                action: 'deployment_candidate'
            };
        }

        return {
            status: 'processed',
            event_type: 'push',
            repository: repository.full_name,
            branch: branch,
            commits_count: commits.length,
            action: 'acknowledged'
        };
    }

    /**
     * Handle issues events
     * @param {Object} payload - GitHub issues payload
     * @returns {Promise<Object>} Handler result
     */
    async handleIssuesEvent(payload) {
        const { action, issue, repository } = payload;
        
        log('info', `Processing issue ${action}: ${issue.number} in ${repository.full_name}`);

        // Future: Could create tasks from issues
        
        return {
            status: 'processed',
            event_type: 'issues',
            action: action,
            repository: repository.full_name,
            issue_number: issue.number,
            issue_title: issue.title
        };
    }

    /**
     * Handle issue comment events
     * @param {Object} payload - GitHub issue comment payload
     * @returns {Promise<Object>} Handler result
     */
    async handleIssueCommentEvent(payload) {
        const { action, comment, issue, repository } = payload;
        
        log('info', `Processing issue comment ${action}: ${issue.number} in ${repository.full_name}`);

        // Future: Could trigger AI responses to comments
        
        return {
            status: 'processed',
            event_type: 'issue_comment',
            action: action,
            repository: repository.full_name,
            issue_number: issue.number,
            comment_author: comment.user.login
        };
    }

    /**
     * Extract task data from pull request payload
     * @param {Object} payload - GitHub pull request payload
     * @returns {Object} Task data
     */
    extractTaskDataFromPR(payload) {
        const { action, pull_request, repository } = payload;

        return {
            title: `PR #${pull_request.number}: ${pull_request.title}`,
            description: pull_request.body || '',
            repository_url: repository.html_url,
            pr_number: pull_request.number,
            branch_name: pull_request.head.ref,
            base_branch: pull_request.base.ref,
            author: pull_request.user.login,
            status: this.mapPRActionToStatus(action),
            affected_files: [], // Would be populated from PR files API
            metadata: {
                github_event: 'pull_request',
                action: action,
                pr_url: pull_request.html_url,
                commits: pull_request.commits,
                additions: pull_request.additions,
                deletions: pull_request.deletions,
                changed_files: pull_request.changed_files,
                is_draft: pull_request.draft,
                mergeable: pull_request.mergeable,
                merged: pull_request.merged,
                head_sha: pull_request.head.sha,
                base_sha: pull_request.base.sha,
                assignees: pull_request.assignees?.map(a => a.login) || [],
                reviewers: pull_request.requested_reviewers?.map(r => r.login) || [],
                labels: pull_request.labels?.map(l => l.name) || []
            }
        };
    }

    /**
     * Map PR action to task status
     * @param {string} action - PR action
     * @returns {string} Task status
     */
    mapPRActionToStatus(action) {
        const statusMap = {
            'opened': 'pending',
            'synchronize': 'pending',
            'reopened': 'pending',
            'ready_for_review': 'pending',
            'closed': 'cancelled',
            'merged': 'completed',
            'converted_to_draft': 'pending'
        };
        return statusMap[action] || 'pending';
    }

    /**
     * Store event in database
     * @param {Object} eventData - Event data
     */
    async storeEvent(eventData) {
        if (!this.database) {
            log('warn', 'No database connection, skipping event storage');
            return;
        }

        try {
            const query = `
                INSERT INTO webhook_events (id, type, payload, received_at, processed, metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    payload = EXCLUDED.payload,
                    received_at = EXCLUDED.received_at,
                    metadata = EXCLUDED.metadata
            `;
            
            const metadata = {
                content_hash: this.deduplicator.generateContentHash(eventData.payload),
                semantic_key: this.deduplicator.generateSemanticKey(eventData.type, eventData.payload),
                processor_version: '1.0.0'
            };

            await this.database.query(query, [
                eventData.id,
                eventData.type,
                JSON.stringify(eventData.payload),
                eventData.received_at,
                eventData.processed || false,
                JSON.stringify(metadata)
            ]);

            log('debug', `Stored event ${eventData.id} in database`);
        } catch (error) {
            log('error', `Failed to store event ${eventData.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mark event as processed
     * @param {string} eventId - Event ID
     */
    async markEventProcessed(eventId) {
        if (!this.database) {
            return;
        }

        try {
            await this.database.query(
                'UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE id = $1',
                [eventId]
            );
            log('debug', `Marked event ${eventId} as processed`);
        } catch (error) {
            log('error', `Failed to mark event ${eventId} as processed: ${error.message}`);
        }
    }

    /**
     * Mark event as failed
     * @param {string} eventId - Event ID
     * @param {string} errorMessage - Error message
     */
    async markEventFailed(eventId, errorMessage) {
        if (!this.database) {
            return;
        }

        try {
            await this.database.query(
                `UPDATE webhook_events 
                 SET failed = true, error_message = $2, processed_at = NOW(), retry_count = retry_count + 1 
                 WHERE id = $1`,
                [eventId, errorMessage]
            );
            log('debug', `Marked event ${eventId} as failed`);
        } catch (error) {
            log('error', `Failed to mark event ${eventId} as failed: ${error.message}`);
        }
    }

    /**
     * Determine if event should be retried
     * @param {Object} eventData - Event data
     * @param {Error} error - Processing error
     * @returns {Promise<boolean>} True if should retry
     */
    async shouldRetryEvent(eventData, error) {
        // Don't retry certain types of errors
        const nonRetryableErrors = [
            'DUPLICATE_EVENT',
            'INVALID_SIGNATURE',
            'MALFORMED_PAYLOAD',
            'UNSUPPORTED_EVENT_TYPE'
        ];

        if (nonRetryableErrors.some(errorType => error.message.includes(errorType))) {
            return false;
        }

        // Check retry count
        if (this.database) {
            try {
                const result = await this.database.query(
                    'SELECT retry_count FROM webhook_events WHERE id = $1',
                    [eventData.id]
                );
                
                const retryCount = result.rows?.[0]?.retry_count || 0;
                return retryCount < this.config.max_retry_attempts;
            } catch (dbError) {
                log('error', `Failed to check retry count: ${dbError.message}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Schedule event for retry
     * @param {Object} eventData - Event data
     * @param {Error} error - Processing error
     */
    async scheduleEventRetry(eventData, error) {
        if (!this.database) {
            return;
        }

        try {
            // Get current retry count
            const result = await this.database.query(
                'SELECT retry_count FROM webhook_events WHERE id = $1',
                [eventData.id]
            );
            
            const retryCount = result.rows?.[0]?.retry_count || 0;
            const delay = this.config.base_retry_delay * Math.pow(this.config.retry_delay_multiplier, retryCount);
            const scheduledAt = new Date(Date.now() + delay);

            // Insert into processing queue
            await this.database.query(
                `INSERT INTO event_processing_queue 
                 (event_id, event_type, priority, status, scheduled_at, retry_count, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    eventData.id,
                    eventData.type,
                    5, // Default priority
                    'pending',
                    scheduledAt,
                    retryCount + 1,
                    error.message
                ]
            );

            log('info', `Scheduled event ${eventData.id} for retry in ${delay}ms (attempt ${retryCount + 1})`);
        } catch (dbError) {
            log('error', `Failed to schedule retry for event ${eventData.id}: ${dbError.message}`);
        }
    }

    /**
     * Replay a previously processed event
     * @param {string} eventId - Event ID to replay
     * @returns {Promise<Object>} Replay result
     */
    async replayEvent(eventId) {
        if (!this.config.enable_event_replay) {
            throw new Error('Event replay is disabled');
        }

        if (!this.database) {
            throw new Error('Database connection required for event replay');
        }

        try {
            log('info', `Replaying event ${eventId}`);

            // Retrieve event from database
            const result = await this.database.query(
                'SELECT * FROM webhook_events WHERE id = $1',
                [eventId]
            );

            if (!result.rows || result.rows.length === 0) {
                throw new Error(`Event ${eventId} not found`);
            }

            const eventRow = result.rows[0];
            const eventData = {
                id: eventRow.id,
                type: eventRow.type,
                payload: eventRow.payload,
                received_at: eventRow.received_at,
                processed: false // Reset processed flag for replay
            };

            // Reset event status for replay
            await this.database.query(
                'UPDATE webhook_events SET processed = false, failed = false, error_message = NULL WHERE id = $1',
                [eventId]
            );

            // Process the event again
            const replayResult = await this.processEvent(eventData);

            return {
                status: 'replayed',
                event_id: eventId,
                replay_result: replayResult
            };

        } catch (error) {
            log('error', `Event replay failed for ${eventId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get processing metrics
     * @returns {Object} Processing metrics
     */
    getMetrics() {
        const avgProcessingTime = this.metrics.processing_times.length > 0
            ? this.metrics.processing_times.reduce((sum, time) => sum + time, 0) / this.metrics.processing_times.length
            : 0;

        return {
            ...this.metrics,
            average_processing_time_ms: avgProcessingTime,
            success_rate: this.metrics.total_events_processed > 0 
                ? (this.metrics.successful_events / this.metrics.total_events_processed) * 100 
                : 0,
            duplicate_rate: this.metrics.total_events_processed > 0
                ? (this.metrics.duplicate_events / this.metrics.total_events_processed) * 100
                : 0
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const metrics = this.getMetrics();
        
        return {
            status: 'healthy',
            metrics: metrics,
            deduplicator: this.deduplicator.getHealth(),
            workflow_dispatcher: await this.workflowDispatcher.getHealth(),
            database_connected: !!this.database
        };
    }

    /**
     * Shutdown the event processor
     */
    async shutdown() {
        log('debug', 'Shutting down event processor...');
        
        this.deduplicator.shutdown();
        await this.workflowDispatcher.shutdown();
        
        this.isInitialized = false;
    }
}

export default EventProcessor;

