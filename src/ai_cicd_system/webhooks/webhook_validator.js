/**
 * @fileoverview Webhook Validator
 * @description Validation and parsing of GitHub webhook events
 */

import { SUPPORTED_EVENTS, EVENT_STATUS } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Webhook event validator and parser
 */
export class WebhookValidator {
    constructor(config = {}) {
        this.config = config;
        this.supportedEvents = SUPPORTED_EVENTS;
    }

    /**
     * Parse and validate webhook event
     * @param {Object} req - Express request object
     * @returns {Promise<Object>} Parsed and validated event
     */
    async parseEvent(req) {
        try {
            const eventType = req.headers['x-github-event'];
            const deliveryId = req.headers['x-github-delivery'];
            const payload = req.body;

            // Basic validation
            if (!eventType) {
                throw new Error('Missing x-github-event header');
            }

            if (!deliveryId) {
                throw new Error('Missing x-github-delivery header');
            }

            if (!payload) {
                throw new Error('Missing request payload');
            }

            // Validate event type
            if (!this.isEventSupported(eventType)) {
                throw new Error(`Unsupported event type: ${eventType}`);
            }

            // Validate event action
            const action = payload.action;
            if (!this.isActionSupported(eventType, action)) {
                throw new Error(`Unsupported action '${action}' for event type '${eventType}'`);
            }

            // Parse event data
            const parsedEvent = await this._parseEventData(eventType, payload, deliveryId);

            // Validate parsed event
            await this._validateParsedEvent(parsedEvent);

            log('debug', `Successfully parsed ${eventType} event`, {
                deliveryId,
                action,
                repository: parsedEvent.repository?.full_name
            });

            return parsedEvent;

        } catch (error) {
            log('error', `Event parsing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if event type is supported
     * @param {string} eventType - GitHub event type
     * @returns {boolean} Whether event is supported
     */
    isEventSupported(eventType) {
        return eventType in this.supportedEvents;
    }

    /**
     * Check if action is supported for event type
     * @param {string} eventType - GitHub event type
     * @param {string} action - Event action
     * @returns {boolean} Whether action is supported
     */
    isActionSupported(eventType, action) {
        const eventConfig = this.supportedEvents[eventType];
        if (!eventConfig) {
            return false;
        }

        // For push events, check if branch is in supported list
        if (eventType === 'push') {
            return eventConfig.actions.some(branch => 
                action === branch || action.endsWith(`/${branch}`)
            );
        }

        return eventConfig.actions.includes(action);
    }

    /**
     * Get event priority
     * @param {string} eventType - GitHub event type
     * @returns {string} Event priority
     */
    getEventPriority(eventType) {
        const eventConfig = this.supportedEvents[eventType];
        return eventConfig ? eventConfig.priority : 'low';
    }

    /**
     * Parse event data based on event type
     * @param {string} eventType - GitHub event type
     * @param {Object} payload - Webhook payload
     * @param {string} deliveryId - GitHub delivery ID
     * @returns {Promise<Object>} Parsed event data
     * @private
     */
    async _parseEventData(eventType, payload, deliveryId) {
        const baseEvent = {
            id: deliveryId,
            type: eventType,
            action: payload.action,
            timestamp: new Date().toISOString(),
            priority: this.getEventPriority(eventType),
            status: EVENT_STATUS.PENDING,
            repository: this._extractRepositoryInfo(payload.repository),
            sender: this._extractSenderInfo(payload.sender)
        };

        switch (eventType) {
            case 'pull_request':
                return {
                    ...baseEvent,
                    pull_request: this._extractPullRequestInfo(payload.pull_request),
                    changes: payload.changes || null
                };

            case 'push':
                return {
                    ...baseEvent,
                    ref: payload.ref,
                    before: payload.before,
                    after: payload.after,
                    commits: this._extractCommitsInfo(payload.commits || []),
                    head_commit: payload.head_commit ? this._extractCommitInfo(payload.head_commit) : null
                };

            case 'issues':
                return {
                    ...baseEvent,
                    issue: this._extractIssueInfo(payload.issue),
                    changes: payload.changes || null
                };

            case 'workflow_run':
                return {
                    ...baseEvent,
                    workflow_run: this._extractWorkflowRunInfo(payload.workflow_run)
                };

            default:
                return baseEvent;
        }
    }

    /**
     * Extract repository information
     * @param {Object} repository - Repository object from payload
     * @returns {Object} Extracted repository info
     * @private
     */
    _extractRepositoryInfo(repository) {
        if (!repository) return null;

        return {
            id: repository.id,
            name: repository.name,
            full_name: repository.full_name,
            owner: repository.owner ? {
                login: repository.owner.login,
                id: repository.owner.id,
                type: repository.owner.type
            } : null,
            private: repository.private,
            default_branch: repository.default_branch,
            clone_url: repository.clone_url,
            ssh_url: repository.ssh_url,
            html_url: repository.html_url
        };
    }

    /**
     * Extract sender information
     * @param {Object} sender - Sender object from payload
     * @returns {Object} Extracted sender info
     * @private
     */
    _extractSenderInfo(sender) {
        if (!sender) return null;

        return {
            login: sender.login,
            id: sender.id,
            type: sender.type,
            avatar_url: sender.avatar_url,
            html_url: sender.html_url
        };
    }

    /**
     * Extract pull request information
     * @param {Object} pullRequest - Pull request object from payload
     * @returns {Object} Extracted pull request info
     * @private
     */
    _extractPullRequestInfo(pullRequest) {
        if (!pullRequest) return null;

        return {
            id: pullRequest.id,
            number: pullRequest.number,
            title: pullRequest.title,
            body: pullRequest.body,
            state: pullRequest.state,
            draft: pullRequest.draft,
            merged: pullRequest.merged,
            mergeable: pullRequest.mergeable,
            mergeable_state: pullRequest.mergeable_state,
            head: {
                ref: pullRequest.head.ref,
                sha: pullRequest.head.sha,
                repo: pullRequest.head.repo ? {
                    full_name: pullRequest.head.repo.full_name,
                    clone_url: pullRequest.head.repo.clone_url
                } : null
            },
            base: {
                ref: pullRequest.base.ref,
                sha: pullRequest.base.sha,
                repo: pullRequest.base.repo ? {
                    full_name: pullRequest.base.repo.full_name,
                    clone_url: pullRequest.base.repo.clone_url
                } : null
            },
            user: this._extractSenderInfo(pullRequest.user),
            assignees: pullRequest.assignees ? pullRequest.assignees.map(a => this._extractSenderInfo(a)) : [],
            labels: pullRequest.labels ? pullRequest.labels.map(l => ({
                name: l.name,
                color: l.color,
                description: l.description
            })) : [],
            html_url: pullRequest.html_url,
            diff_url: pullRequest.diff_url,
            patch_url: pullRequest.patch_url,
            created_at: pullRequest.created_at,
            updated_at: pullRequest.updated_at
        };
    }

    /**
     * Extract issue information
     * @param {Object} issue - Issue object from payload
     * @returns {Object} Extracted issue info
     * @private
     */
    _extractIssueInfo(issue) {
        if (!issue) return null;

        return {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            user: this._extractSenderInfo(issue.user),
            assignees: issue.assignees ? issue.assignees.map(a => this._extractSenderInfo(a)) : [],
            labels: issue.labels ? issue.labels.map(l => ({
                name: l.name,
                color: l.color,
                description: l.description
            })) : [],
            html_url: issue.html_url,
            created_at: issue.created_at,
            updated_at: issue.updated_at
        };
    }

    /**
     * Extract workflow run information
     * @param {Object} workflowRun - Workflow run object from payload
     * @returns {Object} Extracted workflow run info
     * @private
     */
    _extractWorkflowRunInfo(workflowRun) {
        if (!workflowRun) return null;

        return {
            id: workflowRun.id,
            name: workflowRun.name,
            status: workflowRun.status,
            conclusion: workflowRun.conclusion,
            workflow_id: workflowRun.workflow_id,
            head_branch: workflowRun.head_branch,
            head_sha: workflowRun.head_sha,
            run_number: workflowRun.run_number,
            event: workflowRun.event,
            html_url: workflowRun.html_url,
            created_at: workflowRun.created_at,
            updated_at: workflowRun.updated_at
        };
    }

    /**
     * Extract commits information
     * @param {Array} commits - Commits array from payload
     * @returns {Array} Extracted commits info
     * @private
     */
    _extractCommitsInfo(commits) {
        return commits.map(commit => this._extractCommitInfo(commit));
    }

    /**
     * Extract commit information
     * @param {Object} commit - Commit object from payload
     * @returns {Object} Extracted commit info
     * @private
     */
    _extractCommitInfo(commit) {
        if (!commit) return null;

        return {
            id: commit.id,
            message: commit.message,
            timestamp: commit.timestamp,
            url: commit.url,
            author: commit.author ? {
                name: commit.author.name,
                email: commit.author.email,
                username: commit.author.username
            } : null,
            committer: commit.committer ? {
                name: commit.committer.name,
                email: commit.committer.email,
                username: commit.committer.username
            } : null,
            added: commit.added || [],
            removed: commit.removed || [],
            modified: commit.modified || []
        };
    }

    /**
     * Validate parsed event data
     * @param {Object} event - Parsed event data
     * @returns {Promise<void>}
     * @private
     */
    async _validateParsedEvent(event) {
        const errors = [];

        // Required fields validation
        if (!event.id) errors.push('Missing event ID');
        if (!event.type) errors.push('Missing event type');
        if (!event.action) errors.push('Missing event action');
        if (!event.repository) errors.push('Missing repository information');

        // Repository validation
        if (event.repository && !event.repository.full_name) {
            errors.push('Missing repository full_name');
        }

        // Event-specific validation
        switch (event.type) {
            case 'pull_request':
                if (!event.pull_request) {
                    errors.push('Missing pull request information');
                } else if (!event.pull_request.number) {
                    errors.push('Missing pull request number');
                }
                break;

            case 'push':
                if (!event.ref) errors.push('Missing ref information');
                if (!event.after) errors.push('Missing after commit SHA');
                break;

            case 'issues':
                if (!event.issue) {
                    errors.push('Missing issue information');
                } else if (!event.issue.number) {
                    errors.push('Missing issue number');
                }
                break;

            case 'workflow_run':
                if (!event.workflow_run) {
                    errors.push('Missing workflow run information');
                } else if (!event.workflow_run.id) {
                    errors.push('Missing workflow run ID');
                }
                break;
        }

        if (errors.length > 0) {
            throw new Error(`Event validation failed: ${errors.join(', ')}`);
        }
    }
}

export default WebhookValidator;

