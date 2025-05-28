/**
 * @fileoverview GitHub Webhook Handler
 * @description Handles GitHub webhook events including PR creation, updates, and merge events
 */

/**
 * GitHub Webhook Handler class
 */
export class GitHubHandler {
    constructor(config = {}) {
        this.config = {
            enabledEvents: config.events || ['pull_request', 'push', 'issue_comment'],
            autoTriggerValidation: config.autoTriggerValidation !== false,
            autoUpdateLinear: config.autoUpdateLinear !== false,
            prValidationDelay: config.prValidationDelay || 5000, // 5 seconds
            ...config
        };

        this.eventHandlers = {
            'pull_request': this.handlePullRequestEvent.bind(this),
            'push': this.handlePushEvent.bind(this),
            'issue_comment': this.handleIssueCommentEvent.bind(this),
            'workflow_run': this.handleWorkflowRunEvent.bind(this)
        };

        this.statistics = {
            eventsProcessed: 0,
            pullRequestsProcessed: 0,
            validationsTriggered: 0,
            workflowsTriggered: 0,
            errors: 0
        };
    }

    /**
     * Process GitHub event
     * @param {Object} event - GitHub webhook event
     * @returns {Promise<Object>} Processing result
     */
    async processEvent(event) {
        try {
            const eventType = event.type;
            
            // Check if event type is enabled
            if (!this.config.enabledEvents.includes(eventType)) {
                return {
                    status: 'ignored',
                    reason: `Event type ${eventType} is not enabled`,
                    triggerWorkflow: false
                };
            }

            // Get event handler
            const handler = this.eventHandlers[eventType];
            if (!handler) {
                return {
                    status: 'ignored',
                    reason: `No handler for event type ${eventType}`,
                    triggerWorkflow: false
                };
            }

            // Process event
            const result = await handler(event);
            
            // Update statistics
            this.statistics.eventsProcessed++;
            if (result.triggerWorkflow) {
                this.statistics.workflowsTriggered++;
            }

            return result;

        } catch (error) {
            this.statistics.errors++;
            console.error(`GitHub event processing failed:`, error);
            throw error;
        }
    }

    /**
     * Handle pull request events
     * @param {Object} event - Pull request event
     * @returns {Promise<Object>} Processing result
     */
    async handlePullRequestEvent(event) {
        const { action, pull_request: pr, repository } = event.payload;
        
        this.statistics.pullRequestsProcessed++;

        const result = {
            status: 'processed',
            eventType: 'pull_request',
            action,
            pullRequest: {
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                author: pr.user?.login,
                repository: repository.full_name,
                branch: pr.head?.ref,
                baseBranch: pr.base?.ref,
                url: pr.html_url
            },
            triggerWorkflow: false,
            workflowType: null,
            workflowData: {}
        };

        switch (action) {
            case 'opened':
                return await this.handlePROpened(event, result);
            
            case 'synchronize':
                return await this.handlePRSynchronized(event, result);
            
            case 'closed':
                return await this.handlePRClosed(event, result);
            
            case 'ready_for_review':
                return await this.handlePRReadyForReview(event, result);
            
            case 'review_requested':
                return await this.handlePRReviewRequested(event, result);
            
            default:
                result.status = 'ignored';
                result.reason = `PR action ${action} is not handled`;
                return result;
        }
    }

    /**
     * Handle PR opened event
     * @param {Object} event - GitHub event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handlePROpened(event, result) {
        const { pull_request: pr } = event.payload;

        // Check if this is a Codegen-created PR
        const isCodegenPR = this.isCodegenPR(pr);
        
        if (isCodegenPR) {
            // Trigger validation workflow for Codegen PRs
            if (this.config.autoTriggerValidation) {
                result.triggerWorkflow = true;
                result.workflowType = 'pr_validation';
                result.workflowData = {
                    prNumber: pr.number,
                    repository: event.payload.repository.full_name,
                    branch: pr.head.ref,
                    baseBranch: pr.base.ref,
                    author: pr.user.login,
                    isCodegenPR: true,
                    validationDelay: this.config.prValidationDelay
                };

                this.statistics.validationsTriggered++;
            }

            // Update Linear ticket if linked
            if (this.config.autoUpdateLinear) {
                const linearTicket = this.extractLinearTicket(pr);
                if (linearTicket) {
                    result.workflowData.linearTicket = linearTicket;
                    result.workflowData.updateLinear = true;
                }
            }
        }

        result.metadata = {
            isCodegenPR,
            isDraft: pr.draft,
            hasConflicts: pr.mergeable === false,
            changedFiles: pr.changed_files,
            additions: pr.additions,
            deletions: pr.deletions
        };

        return result;
    }

    /**
     * Handle PR synchronized event (new commits pushed)
     * @param {Object} event - GitHub event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handlePRSynchronized(event, result) {
        const { pull_request: pr } = event.payload;

        // Check if this is a Codegen PR
        const isCodegenPR = this.isCodegenPR(pr);

        if (isCodegenPR && this.config.autoTriggerValidation) {
            // Re-trigger validation for updated Codegen PRs
            result.triggerWorkflow = true;
            result.workflowType = 'pr_revalidation';
            result.workflowData = {
                prNumber: pr.number,
                repository: event.payload.repository.full_name,
                branch: pr.head.ref,
                isCodegenPR: true,
                isUpdate: true,
                validationDelay: this.config.prValidationDelay
            };

            this.statistics.validationsTriggered++;
        }

        result.metadata = {
            isCodegenPR,
            isUpdate: true,
            newCommits: event.payload.before !== event.payload.after
        };

        return result;
    }

    /**
     * Handle PR closed event
     * @param {Object} event - GitHub event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handlePRClosed(event, result) {
        const { pull_request: pr } = event.payload;
        const isMerged = pr.merged;

        if (isMerged) {
            // Handle merged PR
            result.triggerWorkflow = true;
            result.workflowType = 'pr_merged';
            result.workflowData = {
                prNumber: pr.number,
                repository: event.payload.repository.full_name,
                branch: pr.head.ref,
                baseBranch: pr.base.ref,
                mergeCommit: pr.merge_commit_sha,
                isCodegenPR: this.isCodegenPR(pr)
            };

            // Update Linear ticket if linked
            if (this.config.autoUpdateLinear) {
                const linearTicket = this.extractLinearTicket(pr);
                if (linearTicket) {
                    result.workflowData.linearTicket = linearTicket;
                    result.workflowData.updateLinear = true;
                    result.workflowData.linearStatus = 'completed';
                }
            }
        }

        result.metadata = {
            isMerged,
            isCodegenPR: this.isCodegenPR(pr)
        };

        return result;
    }

    /**
     * Handle PR ready for review event
     * @param {Object} event - GitHub event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handlePRReadyForReview(event, result) {
        const { pull_request: pr } = event.payload;

        // Trigger validation when PR is ready for review
        if (this.config.autoTriggerValidation && this.isCodegenPR(pr)) {
            result.triggerWorkflow = true;
            result.workflowType = 'pr_validation';
            result.workflowData = {
                prNumber: pr.number,
                repository: event.payload.repository.full_name,
                branch: pr.head.ref,
                isCodegenPR: true,
                isReadyForReview: true
            };

            this.statistics.validationsTriggered++;
        }

        return result;
    }

    /**
     * Handle PR review requested event
     * @param {Object} event - GitHub event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handlePRReviewRequested(event, result) {
        const { pull_request: pr, requested_reviewer } = event.payload;

        // Check if Codegen is requested as reviewer
        if (requested_reviewer?.login === 'codegen' || 
            requested_reviewer?.login?.includes('codegen')) {
            
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_review';
            result.workflowData = {
                prNumber: pr.number,
                repository: event.payload.repository.full_name,
                branch: pr.head.ref,
                requestedBy: event.payload.sender?.login,
                isCodegenPR: this.isCodegenPR(pr)
            };
        }

        return result;
    }

    /**
     * Handle push events
     * @param {Object} event - Push event
     * @returns {Promise<Object>} Processing result
     */
    async handlePushEvent(event) {
        const { ref, repository, commits, pusher } = event.payload;
        
        const result = {
            status: 'processed',
            eventType: 'push',
            repository: repository.full_name,
            branch: ref.replace('refs/heads/', ''),
            pusher: pusher.name,
            commits: commits?.length || 0,
            triggerWorkflow: false
        };

        // Check if this is a push to a Codegen branch
        const isCodegenBranch = result.branch.startsWith('codegen/') || 
                               result.branch.startsWith('codegen-');

        if (isCodegenBranch) {
            // Trigger workflow for Codegen branch pushes
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_push';
            result.workflowData = {
                repository: repository.full_name,
                branch: result.branch,
                commits: commits,
                pusher: pusher.name,
                isCodegenBranch: true
            };
        }

        result.metadata = {
            isCodegenBranch,
            commitCount: commits?.length || 0,
            forced: event.payload.forced || false
        };

        return result;
    }

    /**
     * Handle issue comment events
     * @param {Object} event - Issue comment event
     * @returns {Promise<Object>} Processing result
     */
    async handleIssueCommentEvent(event) {
        const { action, comment, issue, repository } = event.payload;
        
        const result = {
            status: 'processed',
            eventType: 'issue_comment',
            action,
            repository: repository.full_name,
            issueNumber: issue.number,
            commentAuthor: comment.user.login,
            triggerWorkflow: false
        };

        // Check if comment mentions Codegen
        const mentionsCodegen = comment.body.includes('@codegen') || 
                               comment.body.includes('codegen');

        if (mentionsCodegen && issue.pull_request) {
            // Handle Codegen mention in PR comment
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_mention';
            result.workflowData = {
                prNumber: issue.number,
                repository: repository.full_name,
                commentId: comment.id,
                commentBody: comment.body,
                commentAuthor: comment.user.login,
                mentionType: 'pr_comment'
            };
        }

        result.metadata = {
            mentionsCodegen,
            isPullRequest: !!issue.pull_request,
            commentLength: comment.body.length
        };

        return result;
    }

    /**
     * Handle workflow run events
     * @param {Object} event - Workflow run event
     * @returns {Promise<Object>} Processing result
     */
    async handleWorkflowRunEvent(event) {
        const { action, workflow_run: workflowRun, repository } = event.payload;
        
        const result = {
            status: 'processed',
            eventType: 'workflow_run',
            action,
            repository: repository.full_name,
            workflowName: workflowRun.name,
            conclusion: workflowRun.conclusion,
            triggerWorkflow: false
        };

        // Handle failed workflows on Codegen PRs
        if (action === 'completed' && workflowRun.conclusion === 'failure') {
            const prNumbers = workflowRun.pull_requests?.map(pr => pr.number) || [];
            
            if (prNumbers.length > 0) {
                result.triggerWorkflow = true;
                result.workflowType = 'workflow_failure';
                result.workflowData = {
                    repository: repository.full_name,
                    workflowRunId: workflowRun.id,
                    workflowName: workflowRun.name,
                    prNumbers,
                    failureReason: workflowRun.conclusion
                };
            }
        }

        return result;
    }

    /**
     * Check if PR is created by Codegen
     * @param {Object} pr - Pull request object
     * @returns {boolean} True if Codegen PR
     */
    isCodegenPR(pr) {
        // Check author
        if (pr.user?.login?.includes('codegen')) {
            return true;
        }

        // Check branch name
        if (pr.head?.ref?.startsWith('codegen/') || 
            pr.head?.ref?.startsWith('codegen-')) {
            return true;
        }

        // Check PR title or body for Codegen mentions
        const title = pr.title?.toLowerCase() || '';
        const body = pr.body?.toLowerCase() || '';
        
        if (title.includes('codegen') || body.includes('@codegen')) {
            return true;
        }

        return false;
    }

    /**
     * Extract Linear ticket information from PR
     * @param {Object} pr - Pull request object
     * @returns {Object|null} Linear ticket info
     */
    extractLinearTicket(pr) {
        const title = pr.title || '';
        const body = pr.body || '';
        const branch = pr.head?.ref || '';

        // Look for Linear ticket patterns (e.g., ZAM-123, ABC-456)
        const linearPattern = /([A-Z]{2,}-\d+)/g;
        
        let matches = [];
        matches = matches.concat(title.match(linearPattern) || []);
        matches = matches.concat(body.match(linearPattern) || []);
        matches = matches.concat(branch.match(linearPattern) || []);

        if (matches.length > 0) {
            return {
                ticketId: matches[0],
                allMatches: [...new Set(matches)] // Remove duplicates
            };
        }

        return null;
    }

    /**
     * Get handler statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            successRate: this.statistics.eventsProcessed > 0 
                ? ((this.statistics.eventsProcessed - this.statistics.errors) / this.statistics.eventsProcessed) * 100
                : 0
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check error rate
            const errorRate = this.statistics.eventsProcessed > 0 
                ? (this.statistics.errors / this.statistics.eventsProcessed) * 100
                : 0;

            if (errorRate > 10) { // More than 10% error rate
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }
}

export default GitHubHandler;

