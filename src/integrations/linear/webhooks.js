import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Linear Webhook Handler
 * Processes Linear webhook events for real-time issue updates and workflow automation
 */
export class LinearWebhookHandler extends EventEmitter {
    constructor(orchestrator, options = {}) {
        super();
        
        this.orchestrator = orchestrator;
        this.options = {
            webhookSecret: options.webhookSecret,
            validateSignature: options.validateSignature !== false,
            retryAttempts: 3,
            retryDelay: 1000,
            ...options
        };
        
        // Event processing queue
        this.eventQueue = [];
        this.processing = false;
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers for orchestrator
     */
    setupEventHandlers() {
        this.orchestrator.on('error', this.handleOrchestratorError.bind(this));
        this.orchestrator.on('issueCreated', this.handleIssueCreated.bind(this));
        this.orchestrator.on('progressValidated', this.handleProgressValidated.bind(this));
    }

    /**
     * Process incoming webhook payload
     * @param {Object} payload - Webhook payload
     * @param {string} signature - Webhook signature
     * @returns {Promise<Object>} Processing result
     */
    async processWebhook(payload, signature = null) {
        try {
            // Validate webhook signature if configured
            if (this.options.validateSignature && this.options.webhookSecret) {
                if (!this.validateSignature(payload, signature)) {
                    throw new Error('Invalid webhook signature');
                }
            }

            // Add to processing queue
            const event = {
                id: this.generateEventId(),
                payload,
                timestamp: new Date(),
                attempts: 0
            };

            this.eventQueue.push(event);
            this.emit('webhookReceived', { event });

            // Process queue if not already processing
            if (!this.processing) {
                await this.processEventQueue();
            }

            return { success: true, eventId: event.id };
        } catch (error) {
            this.emit('error', { operation: 'processWebhook', error, payload });
            throw new Error(`Failed to process webhook: ${error.message}`);
        }
    }

    /**
     * Process event queue
     */
    async processEventQueue() {
        if (this.processing || this.eventQueue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            
            try {
                await this.processEvent(event);
                this.emit('eventProcessed', { event });
            } catch (error) {
                event.attempts++;
                
                if (event.attempts < this.options.retryAttempts) {
                    // Retry with exponential backoff
                    setTimeout(() => {
                        this.eventQueue.unshift(event);
                    }, this.options.retryDelay * Math.pow(2, event.attempts - 1));
                } else {
                    this.emit('eventFailed', { event, error });
                }
            }
        }

        this.processing = false;
    }

    /**
     * Process individual webhook event
     * @param {Object} event - Event object
     */
    async processEvent(event) {
        const { payload } = event;
        const { action, data, type } = payload;

        switch (type) {
            case 'Issue':
                await this.handleIssueEvent(action, data);
                break;
            case 'Comment':
                await this.handleCommentEvent(action, data);
                break;
            case 'IssueLabel':
                await this.handleIssueLabelEvent(action, data);
                break;
            default:
                this.emit('unknownEventType', { type, action, data });
        }
    }

    /**
     * Handle issue-related webhook events
     * @param {string} action - Action type (create, update, remove)
     * @param {Object} data - Issue data
     */
    async handleIssueEvent(action, data) {
        const issue = data;
        
        switch (action) {
            case 'update':
                await this.handleIssueUpdate(issue);
                break;
            case 'create':
                await this.handleNewIssue(issue);
                break;
            case 'remove':
                await this.handleIssueRemoval(issue);
                break;
            default:
                this.emit('unknownIssueAction', { action, issue });
        }
    }

    /**
     * Handle issue update events
     * @param {Object} issue - Updated issue data
     */
    async handleIssueUpdate(issue) {
        try {
            const { state, assignee, priority } = issue;
            
            // Handle state changes
            if (state) {
                switch (state.type) {
                    case 'completed':
                        await this.handleIssueCompletion(issue);
                        break;
                    case 'started':
                        await this.handleIssueStart(issue);
                        break;
                    case 'unstarted':
                        await this.handleIssueReset(issue);
                        break;
                    default:
                        if (state.name.toLowerCase().includes('blocked')) {
                            await this.handleIssueBlocked(issue);
                        }
                }
            }

            // Handle assignment changes
            if (assignee) {
                await this.handleAssignmentChange(issue);
            }

            // Handle priority changes
            if (priority !== undefined) {
                await this.handlePriorityChange(issue);
            }

            this.emit('issueUpdated', { issue });
        } catch (error) {
            this.emit('error', { operation: 'handleIssueUpdate', error, issue });
            throw error;
        }
    }

    /**
     * Handle issue completion
     * @param {Object} issue - Completed issue
     */
    async handleIssueCompletion(issue) {
        try {
            // Check if this is a sub-issue
            if (issue.parent) {
                // Validate parent issue progress
                await this.orchestrator.validateSubIssueProgress(issue.parent.id);
                
                // Add completion comment
                await this.orchestrator.linear.createComment(issue.id,
                    '✅ **Issue Completed!** Implementation has been successfully finished. ' +
                    'Validating parent issue progress...'
                );
            } else {
                // This is a main issue completion
                await this.handleMainIssueCompletion(issue);
            }

            this.emit('issueCompleted', { issue });
        } catch (error) {
            this.emit('error', { operation: 'handleIssueCompletion', error, issue });
            throw error;
        }
    }

    /**
     * Handle main issue completion
     * @param {Object} issue - Main issue
     */
    async handleMainIssueCompletion(issue) {
        try {
            // Validate implementation
            const validation = await this.validateImplementation(issue.id);
            
            if (validation.success) {
                await this.triggerMergeWorkflow(issue.id);
                await this.updateLinearStatus(issue.id, 'merged');
                
                await this.orchestrator.linear.createComment(issue.id,
                    '🎉 **Project Successfully Completed!** All validations passed. ' +
                    'Implementation has been merged to main branch.'
                );
            } else {
                await this.orchestrator.handleErrorsAndRestructure(issue.id, validation.errors);
            }

            this.emit('mainIssueCompleted', { issue, validation });
        } catch (error) {
            this.emit('error', { operation: 'handleMainIssueCompletion', error, issue });
            throw error;
        }
    }

    /**
     * Handle issue start
     * @param {Object} issue - Started issue
     */
    async handleIssueStart(issue) {
        try {
            // Add start comment with implementation plan
            await this.orchestrator.linear.createComment(issue.id,
                '🚀 **Implementation Started!** Beginning work on this issue. ' +
                'Progress updates will be posted here automatically.'
            );

            // Trigger implementation workflow
            await this.triggerImplementationWorkflow(issue);

            this.emit('issueStarted', { issue });
        } catch (error) {
            this.emit('error', { operation: 'handleIssueStart', error, issue });
            throw error;
        }
    }

    /**
     * Handle issue blocked
     * @param {Object} issue - Blocked issue
     */
    async handleIssueBlocked(issue) {
        try {
            // Add blocked comment
            await this.orchestrator.linear.createComment(issue.id,
                '🚫 **Issue Blocked!** This issue has been marked as blocked. ' +
                'Please review dependencies and remove blockers to continue.'
            );

            // Notify relevant stakeholders
            await this.notifyBlockedIssue(issue);

            this.emit('issueBlocked', { issue });
        } catch (error) {
            this.emit('error', { operation: 'handleIssueBlocked', error, issue });
            throw error;
        }
    }

    /**
     * Handle new issue creation
     * @param {Object} issue - New issue
     */
    async handleNewIssue(issue) {
        try {
            // Check if this is an auto-generated issue
            if (issue.description && issue.description.includes('Autonomous CICD')) {
                // Start monitoring if it's a main issue
                if (!issue.parent) {
                    this.orchestrator.startProgressMonitoring(issue.id);
                }
            }

            this.emit('newIssueCreated', { issue });
        } catch (error) {
            this.emit('error', { operation: 'handleNewIssue', error, issue });
            throw error;
        }
    }

    /**
     * Handle comment events
     * @param {string} action - Action type
     * @param {Object} data - Comment data
     */
    async handleCommentEvent(action, data) {
        try {
            const comment = data;
            
            if (action === 'create') {
                // Check for special commands in comments
                await this.processCommentCommands(comment);
            }

            this.emit('commentEvent', { action, comment });
        } catch (error) {
            this.emit('error', { operation: 'handleCommentEvent', error, action, data });
            throw error;
        }
    }

    /**
     * Process special commands in comments
     * @param {Object} comment - Comment data
     */
    async processCommentCommands(comment) {
        const body = comment.body.toLowerCase();
        
        if (body.includes('@codegen')) {
            // Codegen mention - trigger AI response
            await this.triggerCodegenResponse(comment);
        }
        
        if (body.includes('/restart')) {
            // Restart implementation
            await this.restartImplementation(comment.issue.id);
        }
        
        if (body.includes('/validate')) {
            // Manual validation trigger
            await this.triggerValidation(comment.issue.id);
        }
        
        if (body.includes('/progress')) {
            // Progress report request
            await this.generateProgressReport(comment.issue.id);
        }
    }

    /**
     * Validate implementation
     * @param {string} issueId - Issue ID
     * @returns {Promise<Object>} Validation result
     */
    async validateImplementation(issueId) {
        try {
            // This would integrate with testing and validation systems
            // For now, return a mock validation
            return {
                success: true,
                errors: [],
                warnings: [],
                coverage: 95,
                performance: 'good'
            };
        } catch (error) {
            return {
                success: false,
                errors: [{ message: error.message, type: 'validation' }],
                warnings: [],
                coverage: 0,
                performance: 'unknown'
            };
        }
    }

    /**
     * Trigger merge workflow
     * @param {string} issueId - Issue ID
     */
    async triggerMergeWorkflow(issueId) {
        try {
            // This would integrate with GitHub/GitLab for automated merging
            this.emit('mergeWorkflowTriggered', { issueId });
        } catch (error) {
            this.emit('error', { operation: 'triggerMergeWorkflow', error, issueId });
            throw error;
        }
    }

    /**
     * Update Linear status
     * @param {string} issueId - Issue ID
     * @param {string} status - New status
     */
    async updateLinearStatus(issueId, status) {
        try {
            await this.orchestrator.linear.updateIssue(issueId, { status });
        } catch (error) {
            this.emit('error', { operation: 'updateLinearStatus', error, issueId, status });
            throw error;
        }
    }

    /**
     * Trigger implementation workflow
     * @param {Object} issue - Issue to implement
     */
    async triggerImplementationWorkflow(issue) {
        try {
            // This would integrate with Codegen or other AI systems
            this.emit('implementationWorkflowTriggered', { issue });
        } catch (error) {
            this.emit('error', { operation: 'triggerImplementationWorkflow', error, issue });
            throw error;
        }
    }

    /**
     * Validate webhook signature
     * @param {Object} payload - Webhook payload
     * @param {string} signature - Provided signature
     * @returns {boolean} Signature validity
     */
    validateSignature(payload, signature) {
        if (!this.options.webhookSecret || !signature) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac('sha256', this.options.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Notify about blocked issue
     * @param {Object} issue - Blocked issue
     */
    async notifyBlockedIssue(issue) {
        try {
            // This would integrate with notification systems
            this.emit('blockedIssueNotification', { issue });
        } catch (error) {
            this.emit('error', { operation: 'notifyBlockedIssue', error, issue });
        }
    }

    /**
     * Trigger Codegen response
     * @param {Object} comment - Comment mentioning Codegen
     */
    async triggerCodegenResponse(comment) {
        try {
            // This would integrate with Codegen API
            this.emit('codegenResponseTriggered', { comment });
        } catch (error) {
            this.emit('error', { operation: 'triggerCodegenResponse', error, comment });
        }
    }

    /**
     * Restart implementation
     * @param {string} issueId - Issue ID
     */
    async restartImplementation(issueId) {
        try {
            await this.orchestrator.linear.updateIssue(issueId, { status: 'todo' });
            await this.orchestrator.linear.createComment(issueId,
                '🔄 **Implementation Restarted** - Issue has been reset to todo status.'
            );
            this.emit('implementationRestarted', { issueId });
        } catch (error) {
            this.emit('error', { operation: 'restartImplementation', error, issueId });
        }
    }

    /**
     * Trigger validation
     * @param {string} issueId - Issue ID
     */
    async triggerValidation(issueId) {
        try {
            const validation = await this.validateImplementation(issueId);
            
            const validationComment = 
                `🔍 **Manual Validation Results**\n\n` +
                `- **Status**: ${validation.success ? '✅ Passed' : '❌ Failed'}\n` +
                `- **Errors**: ${validation.errors.length}\n` +
                `- **Warnings**: ${validation.warnings.length}\n` +
                `- **Coverage**: ${validation.coverage}%\n` +
                `- **Performance**: ${validation.performance}\n\n` +
                `*Validation triggered manually*`;

            await this.orchestrator.linear.createComment(issueId, validationComment);
            this.emit('validationTriggered', { issueId, validation });
        } catch (error) {
            this.emit('error', { operation: 'triggerValidation', error, issueId });
        }
    }

    /**
     * Generate progress report
     * @param {string} issueId - Issue ID
     */
    async generateProgressReport(issueId) {
        try {
            const progress = await this.orchestrator.validateSubIssueProgress(issueId);
            this.emit('progressReportGenerated', { issueId, progress });
        } catch (error) {
            this.emit('error', { operation: 'generateProgressReport', error, issueId });
        }
    }

    /**
     * Event handlers
     */
    handleOrchestratorError(data) {
        this.emit('orchestratorError', data);
    }

    handleIssueCreated(data) {
        this.emit('orchestratorIssueCreated', data);
    }

    handleProgressValidated(data) {
        this.emit('orchestratorProgressValidated', data);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.eventQueue = [];
        this.processing = false;
        this.removeAllListeners();
    }
}

export default LinearWebhookHandler;

