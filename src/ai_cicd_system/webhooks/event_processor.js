/**
 * @fileoverview Event Processor
 * @description Business logic for processing GitHub webhook events and creating tasks
 */

import { PROCESSING_PIPELINE, EVENT_STATUS, PRIORITY_LEVELS } from '../config/webhook_config.js';
import { TaskStorageManager } from '../core/task_storage_manager.js';
import { GitHubAPIClient } from '../utils/github_api_client.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Event processor for converting GitHub webhook events into tasks
 */
export class EventProcessor {
    constructor(config = {}) {
        this.config = config;
        this.taskStorage = new TaskStorageManager(config.database);
        this.githubClient = new GitHubAPIClient(config.github);
        this.processingQueue = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the event processor
     */
    async initialize() {
        try {
            await this.taskStorage.initialize();
            this.isInitialized = true;
            log('info', 'Event processor initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize event processor: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process webhook event through the pipeline
     * @param {Object} event - Parsed webhook event
     * @returns {Promise<Object>} Processing result
     */
    async process(event) {
        if (!this.isInitialized) {
            throw new Error('Event processor not initialized');
        }

        const startTime = Date.now();
        let result = {
            eventId: event.id,
            status: EVENT_STATUS.PROCESSING,
            steps: [],
            tasks: [],
            errors: []
        };

        try {
            // Check for duplicate events
            if (await this._isDuplicateEvent(event)) {
                result.status = EVENT_STATUS.SKIPPED;
                result.reason = 'Duplicate event';
                return result;
            }

            // Add to processing queue
            this.processingQueue.set(event.id, {
                event,
                startTime,
                status: EVENT_STATUS.PROCESSING
            });

            // Process through pipeline
            for (const step of PROCESSING_PIPELINE) {
                try {
                    const stepResult = await this._executeStep(step, event, result);
                    result.steps.push({
                        name: step,
                        status: 'completed',
                        duration: stepResult.duration,
                        data: stepResult.data
                    });
                } catch (stepError) {
                    result.steps.push({
                        name: step,
                        status: 'failed',
                        error: stepError.message
                    });
                    result.errors.push(`${step}: ${stepError.message}`);
                    
                    // Continue processing for non-critical steps
                    if (!this._isCriticalStep(step)) {
                        log('warn', `Non-critical step ${step} failed: ${stepError.message}`);
                        continue;
                    }
                    
                    throw stepError;
                }
            }

            result.status = EVENT_STATUS.COMPLETED;
            result.duration = Date.now() - startTime;

            log('info', `Event ${event.id} processed successfully`, {
                type: event.type,
                action: event.action,
                duration: result.duration,
                tasksCreated: result.tasks.length
            });

        } catch (error) {
            result.status = EVENT_STATUS.FAILED;
            result.error = error.message;
            result.duration = Date.now() - startTime;

            log('error', `Event ${event.id} processing failed: ${error.message}`, {
                type: event.type,
                action: event.action,
                duration: result.duration
            });

        } finally {
            // Remove from processing queue
            this.processingQueue.delete(event.id);
            
            // Store processing result
            await this._storeProcessingResult(event, result);
        }

        return result;
    }

    /**
     * Execute a pipeline step
     * @param {string} step - Step name
     * @param {Object} event - Event data
     * @param {Object} result - Current result
     * @returns {Promise<Object>} Step result
     * @private
     */
    async _executeStep(step, event, result) {
        const stepStart = Date.now();
        let stepData = {};

        switch (step) {
            case 'validateEvent':
                stepData = await this._validateEvent(event);
                break;

            case 'extractMetadata':
                stepData = await this._extractMetadata(event);
                break;

            case 'createTask':
                stepData = await this._createTask(event, result);
                if (stepData.task) {
                    result.tasks.push(stepData.task);
                }
                break;

            case 'triggerWorkflow':
                stepData = await this._triggerWorkflow(event, result);
                break;

            case 'updateStatus':
                stepData = await this._updateStatus(event, result);
                break;

            case 'notifyStakeholders':
                stepData = await this._notifyStakeholders(event, result);
                break;

            default:
                throw new Error(`Unknown pipeline step: ${step}`);
        }

        return {
            duration: Date.now() - stepStart,
            data: stepData
        };
    }

    /**
     * Validate event data
     * @param {Object} event - Event to validate
     * @returns {Promise<Object>} Validation result
     * @private
     */
    async _validateEvent(event) {
        // Additional business logic validation beyond basic parsing
        const validation = {
            valid: true,
            warnings: [],
            metadata: {}
        };

        // Check repository access
        if (event.repository) {
            try {
                const repo = await this.githubClient.getRepository(
                    event.repository.owner.login,
                    event.repository.name
                );
                validation.metadata.repository = repo;
            } catch (error) {
                validation.warnings.push(`Could not access repository: ${error.message}`);
            }
        }

        // Event-specific validation
        switch (event.type) {
            case 'pull_request':
                if (event.pull_request && event.pull_request.draft && event.action === 'opened') {
                    validation.warnings.push('Draft pull request opened - may skip some processing');
                }
                break;

            case 'push':
                if (event.commits && event.commits.length === 0) {
                    validation.warnings.push('Push event with no commits');
                }
                break;
        }

        return validation;
    }

    /**
     * Extract metadata from event
     * @param {Object} event - Event to process
     * @returns {Promise<Object>} Extracted metadata
     * @private
     */
    async _extractMetadata(event) {
        const metadata = {
            priority: this._calculatePriority(event),
            complexity: this._estimateComplexity(event),
            tags: this._generateTags(event),
            context: {}
        };

        // Extract context based on event type
        switch (event.type) {
            case 'pull_request':
                metadata.context = await this._extractPRContext(event);
                break;

            case 'push':
                metadata.context = await this._extractPushContext(event);
                break;

            case 'issues':
                metadata.context = await this._extractIssueContext(event);
                break;

            case 'workflow_run':
                metadata.context = await this._extractWorkflowContext(event);
                break;
        }

        return metadata;
    }

    /**
     * Create task from event
     * @param {Object} event - Event to process
     * @param {Object} result - Current processing result
     * @returns {Promise<Object>} Task creation result
     * @private
     */
    async _createTask(event, result) {
        const metadata = result.steps.find(s => s.name === 'extractMetadata')?.data || {};
        
        const task = {
            id: `webhook-${event.id}-${Date.now()}`,
            type: 'webhook_event',
            source: 'github_webhook',
            event_id: event.id,
            event_type: event.type,
            event_action: event.action,
            priority: metadata.priority || 'medium',
            status: 'pending',
            created_at: new Date().toISOString(),
            repository: event.repository,
            metadata: {
                ...metadata,
                original_event: event
            }
        };

        // Add event-specific task data
        switch (event.type) {
            case 'pull_request':
                task.title = `Process PR #${event.pull_request.number}: ${event.pull_request.title}`;
                task.description = this._generatePRTaskDescription(event);
                task.requirements = this._generatePRRequirements(event);
                break;

            case 'push':
                task.title = `Process push to ${event.ref}`;
                task.description = this._generatePushTaskDescription(event);
                task.requirements = this._generatePushRequirements(event);
                break;

            case 'issues':
                task.title = `Process issue #${event.issue.number}: ${event.issue.title}`;
                task.description = this._generateIssueTaskDescription(event);
                task.requirements = this._generateIssueRequirements(event);
                break;

            case 'workflow_run':
                task.title = `Process workflow run: ${event.workflow_run.name}`;
                task.description = this._generateWorkflowTaskDescription(event);
                task.requirements = this._generateWorkflowRequirements(event);
                break;
        }

        // Store task
        try {
            await this.taskStorage.storeTask(task);
            log('info', `Created task ${task.id} for event ${event.id}`);
            return { task, created: true };
        } catch (error) {
            log('error', `Failed to store task for event ${event.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger workflow based on event
     * @param {Object} event - Event to process
     * @param {Object} result - Current processing result
     * @returns {Promise<Object>} Workflow trigger result
     * @private
     */
    async _triggerWorkflow(event, result) {
        const workflows = [];

        // Determine which workflows to trigger
        switch (event.type) {
            case 'pull_request':
                if (['opened', 'synchronize'].includes(event.action)) {
                    workflows.push('pr_analysis', 'code_review', 'test_execution');
                }
                if (event.action === 'closed' && event.pull_request.merged) {
                    workflows.push('post_merge_cleanup', 'deployment_check');
                }
                break;

            case 'push':
                workflows.push('continuous_integration', 'security_scan');
                if (event.ref === `refs/heads/${event.repository.default_branch}`) {
                    workflows.push('deployment_pipeline');
                }
                break;

            case 'workflow_run':
                if (event.workflow_run.conclusion === 'failure') {
                    workflows.push('failure_analysis', 'notification');
                }
                break;
        }

        // Trigger workflows (placeholder for actual workflow orchestration)
        const triggeredWorkflows = [];
        for (const workflow of workflows) {
            try {
                // This would integrate with the workflow orchestrator
                const workflowResult = await this._triggerSingleWorkflow(workflow, event);
                triggeredWorkflows.push({
                    name: workflow,
                    id: workflowResult.id,
                    status: 'triggered'
                });
            } catch (error) {
                log('warn', `Failed to trigger workflow ${workflow}: ${error.message}`);
                triggeredWorkflows.push({
                    name: workflow,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return { workflows: triggeredWorkflows };
    }

    /**
     * Update status based on processing
     * @param {Object} event - Event to process
     * @param {Object} result - Current processing result
     * @returns {Promise<Object>} Status update result
     * @private
     */
    async _updateStatus(event, result) {
        const updates = [];

        // Update GitHub status/checks if applicable
        if (event.type === 'pull_request' && event.pull_request.head.sha) {
            try {
                const status = {
                    state: 'pending',
                    description: 'AI CI/CD processing started',
                    context: 'claude-task-master/webhook'
                };

                await this.githubClient.updateCommitStatus(
                    event.repository.owner.login,
                    event.repository.name,
                    event.pull_request.head.sha,
                    status
                );

                updates.push({
                    type: 'github_status',
                    sha: event.pull_request.head.sha,
                    status: 'updated'
                });
            } catch (error) {
                log('warn', `Failed to update GitHub status: ${error.message}`);
            }
        }

        return { updates };
    }

    /**
     * Notify stakeholders
     * @param {Object} event - Event to process
     * @param {Object} result - Current processing result
     * @returns {Promise<Object>} Notification result
     * @private
     */
    async _notifyStakeholders(event, result) {
        const notifications = [];

        // Determine notification recipients and methods
        const recipients = this._getNotificationRecipients(event);
        
        for (const recipient of recipients) {
            try {
                await this._sendNotification(recipient, event, result);
                notifications.push({
                    recipient: recipient.type,
                    status: 'sent'
                });
            } catch (error) {
                log('warn', `Failed to notify ${recipient.type}: ${error.message}`);
                notifications.push({
                    recipient: recipient.type,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return { notifications };
    }

    /**
     * Check if event is duplicate
     * @param {Object} event - Event to check
     * @returns {Promise<boolean>} Whether event is duplicate
     * @private
     */
    async _isDuplicateEvent(event) {
        // Check processing queue
        if (this.processingQueue.has(event.id)) {
            return true;
        }

        // Check database for recent events
        try {
            // This would query the webhook_events table
            // For now, return false (no duplicate detection)
            return false;
        } catch (error) {
            log('warn', `Failed to check for duplicate event: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if step is critical for processing
     * @param {string} step - Step name
     * @returns {boolean} Whether step is critical
     * @private
     */
    _isCriticalStep(step) {
        const criticalSteps = ['validateEvent', 'createTask'];
        return criticalSteps.includes(step);
    }

    /**
     * Calculate event priority
     * @param {Object} event - Event to analyze
     * @returns {string} Priority level
     * @private
     */
    _calculatePriority(event) {
        // Base priority from event type
        let priority = 'medium';
        
        switch (event.type) {
            case 'pull_request':
                priority = 'high';
                if (event.pull_request && event.pull_request.draft) {
                    priority = 'medium';
                }
                break;
            case 'workflow_run':
                priority = event.workflow_run.conclusion === 'failure' ? 'high' : 'medium';
                break;
            case 'push':
                priority = event.ref.includes(event.repository.default_branch) ? 'high' : 'medium';
                break;
            case 'issues':
                priority = 'low';
                break;
        }

        return priority;
    }

    /**
     * Estimate complexity of event processing
     * @param {Object} event - Event to analyze
     * @returns {string} Complexity level
     * @private
     */
    _estimateComplexity(event) {
        let complexity = 'medium';

        switch (event.type) {
            case 'pull_request':
                // Could analyze file count, line changes, etc.
                complexity = 'high';
                break;
            case 'push':
                const commitCount = event.commits ? event.commits.length : 1;
                complexity = commitCount > 5 ? 'high' : 'medium';
                break;
            default:
                complexity = 'low';
        }

        return complexity;
    }

    /**
     * Generate tags for event
     * @param {Object} event - Event to tag
     * @returns {Array} Generated tags
     * @private
     */
    _generateTags(event) {
        const tags = [event.type, event.action];

        if (event.repository) {
            tags.push(`repo:${event.repository.full_name}`);
        }

        if (event.type === 'pull_request' && event.pull_request) {
            if (event.pull_request.draft) tags.push('draft');
            if (event.pull_request.labels) {
                event.pull_request.labels.forEach(label => tags.push(`label:${label.name}`));
            }
        }

        return tags;
    }

    // Additional helper methods would be implemented here...
    // (PR context extraction, task description generation, etc.)

    /**
     * Store processing result
     * @param {Object} event - Original event
     * @param {Object} result - Processing result
     * @returns {Promise<void>}
     * @private
     */
    async _storeProcessingResult(event, result) {
        try {
            // Store in webhook_events table
            const eventRecord = {
                id: event.id,
                type: event.type,
                action: event.action,
                repository: event.repository?.full_name,
                status: result.status,
                processing_duration: result.duration,
                tasks_created: result.tasks.length,
                errors: result.errors,
                created_at: new Date().toISOString(),
                processed_at: new Date().toISOString()
            };

            // This would store in the database
            log('debug', `Stored processing result for event ${event.id}`);
        } catch (error) {
            log('error', `Failed to store processing result: ${error.message}`);
        }
    }

    // Placeholder methods for workflow integration
    async _triggerSingleWorkflow(workflow, event) {
        return { id: `workflow-${Date.now()}` };
    }

    async _extractPRContext(event) { return {}; }
    async _extractPushContext(event) { return {}; }
    async _extractIssueContext(event) { return {}; }
    async _extractWorkflowContext(event) { return {}; }

    _generatePRTaskDescription(event) { return `Process pull request ${event.pull_request.number}`; }
    _generatePRRequirements(event) { return []; }
    _generatePushTaskDescription(event) { return `Process push to ${event.ref}`; }
    _generatePushRequirements(event) { return []; }
    _generateIssueTaskDescription(event) { return `Process issue ${event.issue.number}`; }
    _generateIssueRequirements(event) { return []; }
    _generateWorkflowTaskDescription(event) { return `Process workflow run ${event.workflow_run.id}`; }
    _generateWorkflowRequirements(event) { return []; }

    _getNotificationRecipients(event) { return []; }
    async _sendNotification(recipient, event, result) { }
}

export default EventProcessor;

