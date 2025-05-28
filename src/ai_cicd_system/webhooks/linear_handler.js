/**
 * @fileoverview Linear Webhook Handler
 * @description Handles Linear webhook events including issue updates, status changes, and assignments
 */

/**
 * Linear Webhook Handler class
 */
export class LinearHandler {
    constructor(config = {}) {
        this.config = {
            enabledEvents: config.events || ['issue.update', 'issue.create', 'issue.remove'],
            autoTriggerCodegen: config.autoTriggerCodegen !== false,
            autoUpdateGitHub: config.autoUpdateGitHub !== false,
            codegenTriggerStates: config.codegenTriggerStates || ['In Progress', 'Todo'],
            completedStates: config.completedStates || ['Done', 'Completed'],
            ...config
        };

        this.eventHandlers = {
            'issue.create': this.handleIssueCreate.bind(this),
            'issue.update': this.handleIssueUpdate.bind(this),
            'issue.remove': this.handleIssueRemove.bind(this)
        };

        this.statistics = {
            eventsProcessed: 0,
            issuesProcessed: 0,
            codegenTriggered: 0,
            statusUpdates: 0,
            errors: 0
        };
    }

    /**
     * Process Linear event
     * @param {Object} event - Linear webhook event
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
                this.statistics.codegenTriggered++;
            }

            return result;

        } catch (error) {
            this.statistics.errors++;
            console.error(`Linear event processing failed:`, error);
            throw error;
        }
    }

    /**
     * Handle issue create events
     * @param {Object} event - Issue create event
     * @returns {Promise<Object>} Processing result
     */
    async handleIssueCreate(event) {
        const issue = event.payload.data;
        
        this.statistics.issuesProcessed++;

        const result = {
            status: 'processed',
            eventType: 'issue.create',
            issue: {
                id: issue.id,
                title: issue.title,
                description: issue.description,
                state: issue.state?.name,
                priority: issue.priority,
                assignee: issue.assignee?.name,
                team: issue.team?.name,
                project: issue.project?.name,
                labels: issue.labels?.map(label => label.name) || [],
                url: issue.url
            },
            triggerWorkflow: false,
            workflowType: null,
            workflowData: {}
        };

        // Check if issue is assigned to Codegen
        const isCodegenAssigned = this.isCodegenAssigned(issue);
        
        if (isCodegenAssigned) {
            // Trigger Codegen workflow for assigned issues
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_task';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                issueDescription: issue.description,
                team: issue.team?.name,
                project: issue.project?.name,
                priority: issue.priority,
                labels: issue.labels?.map(label => label.name) || [],
                assignedAt: new Date().toISOString(),
                isNewIssue: true
            };

            // Extract repository information if available
            const repoInfo = this.extractRepositoryInfo(issue);
            if (repoInfo) {
                result.workflowData.repository = repoInfo;
            }
        }

        result.metadata = {
            isCodegenAssigned,
            hasDescription: !!issue.description,
            hasLabels: issue.labels?.length > 0,
            priority: issue.priority,
            estimatedHours: this.extractEstimatedHours(issue)
        };

        return result;
    }

    /**
     * Handle issue update events
     * @param {Object} event - Issue update event
     * @returns {Promise<Object>} Processing result
     */
    async handleIssueUpdate(event) {
        const issue = event.payload.data;
        const updatedFrom = event.payload.updatedFrom || {};
        
        this.statistics.issuesProcessed++;

        const result = {
            status: 'processed',
            eventType: 'issue.update',
            issue: {
                id: issue.id,
                title: issue.title,
                state: issue.state?.name,
                assignee: issue.assignee?.name,
                team: issue.team?.name,
                project: issue.project?.name
            },
            changes: this.extractChanges(issue, updatedFrom),
            triggerWorkflow: false,
            workflowType: null,
            workflowData: {}
        };

        // Handle different types of updates
        if (this.hasStateChange(result.changes)) {
            return await this.handleStateChange(event, result);
        }

        if (this.hasAssigneeChange(result.changes)) {
            return await this.handleAssigneeChange(event, result);
        }

        if (this.hasDescriptionChange(result.changes)) {
            return await this.handleDescriptionChange(event, result);
        }

        // Handle other updates
        result.metadata = {
            changeTypes: Object.keys(result.changes),
            isCodegenAssigned: this.isCodegenAssigned(issue)
        };

        return result;
    }

    /**
     * Handle issue remove events
     * @param {Object} event - Issue remove event
     * @returns {Promise<Object>} Processing result
     */
    async handleIssueRemove(event) {
        const issue = event.payload.data;

        const result = {
            status: 'processed',
            eventType: 'issue.remove',
            issue: {
                id: issue.id,
                title: issue.title,
                state: issue.state?.name
            },
            triggerWorkflow: false
        };

        // Check if this was a Codegen-assigned issue
        const wasCodegenAssigned = this.isCodegenAssigned(issue);
        
        if (wasCodegenAssigned) {
            // Trigger cleanup workflow
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_cleanup';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                removedAt: new Date().toISOString()
            };
        }

        result.metadata = {
            wasCodegenAssigned
        };

        return result;
    }

    /**
     * Handle state change
     * @param {Object} event - Linear event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handleStateChange(event, result) {
        const issue = event.payload.data;
        const newState = issue.state?.name;
        const oldState = result.changes.state?.from;

        this.statistics.statusUpdates++;

        // Check if Codegen should be triggered
        if (this.isCodegenAssigned(issue) && 
            this.config.codegenTriggerStates.includes(newState)) {
            
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_task';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                issueDescription: issue.description,
                newState,
                oldState,
                stateChanged: true,
                team: issue.team?.name,
                project: issue.project?.name
            };

            // Extract repository information
            const repoInfo = this.extractRepositoryInfo(issue);
            if (repoInfo) {
                result.workflowData.repository = repoInfo;
            }
        }

        // Check if issue is completed
        if (this.config.completedStates.includes(newState)) {
            result.workflowType = 'issue_completed';
            result.workflowData = {
                ...result.workflowData,
                issueId: issue.id,
                completedAt: new Date().toISOString(),
                finalState: newState
            };

            // Update GitHub PR if linked
            if (this.config.autoUpdateGitHub) {
                const prInfo = this.extractPRInfo(issue);
                if (prInfo) {
                    result.workflowData.githubPR = prInfo;
                    result.workflowData.updateGitHub = true;
                }
            }
        }

        result.metadata = {
            stateTransition: `${oldState} → ${newState}`,
            isCodegenAssigned: this.isCodegenAssigned(issue),
            isCompleted: this.config.completedStates.includes(newState),
            shouldTriggerCodegen: this.config.codegenTriggerStates.includes(newState)
        };

        return result;
    }

    /**
     * Handle assignee change
     * @param {Object} event - Linear event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handleAssigneeChange(event, result) {
        const issue = event.payload.data;
        const newAssignee = issue.assignee?.name;
        const oldAssignee = result.changes.assignee?.from;

        // Check if Codegen was assigned
        const codegenAssigned = this.isCodegenAssigned(issue);
        const codegenWasAssigned = oldAssignee?.toLowerCase().includes('codegen');

        if (codegenAssigned && !codegenWasAssigned) {
            // Codegen was newly assigned
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_assigned';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                issueDescription: issue.description,
                assignedAt: new Date().toISOString(),
                previousAssignee: oldAssignee,
                team: issue.team?.name,
                project: issue.project?.name,
                state: issue.state?.name
            };

            // Extract repository information
            const repoInfo = this.extractRepositoryInfo(issue);
            if (repoInfo) {
                result.workflowData.repository = repoInfo;
            }
        } else if (!codegenAssigned && codegenWasAssigned) {
            // Codegen was unassigned
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_unassigned';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                unassignedAt: new Date().toISOString(),
                newAssignee: newAssignee
            };
        }

        result.metadata = {
            assigneeChange: `${oldAssignee || 'unassigned'} → ${newAssignee || 'unassigned'}`,
            codegenAssigned,
            codegenWasAssigned
        };

        return result;
    }

    /**
     * Handle description change
     * @param {Object} event - Linear event
     * @param {Object} result - Base result object
     * @returns {Promise<Object>} Processing result
     */
    async handleDescriptionChange(event, result) {
        const issue = event.payload.data;

        // Check if Codegen is assigned and description was updated
        if (this.isCodegenAssigned(issue)) {
            result.triggerWorkflow = true;
            result.workflowType = 'codegen_requirements_updated';
            result.workflowData = {
                issueId: issue.id,
                issueTitle: issue.title,
                newDescription: issue.description,
                updatedAt: new Date().toISOString(),
                team: issue.team?.name,
                project: issue.project?.name
            };
        }

        result.metadata = {
            isCodegenAssigned: this.isCodegenAssigned(issue),
            descriptionLength: issue.description?.length || 0
        };

        return result;
    }

    /**
     * Extract changes from update event
     * @param {Object} issue - Current issue state
     * @param {Object} updatedFrom - Previous issue state
     * @returns {Object} Changes object
     */
    extractChanges(issue, updatedFrom) {
        const changes = {};

        if (updatedFrom.stateId && issue.state?.id !== updatedFrom.stateId) {
            changes.state = {
                from: updatedFrom.state?.name,
                to: issue.state?.name
            };
        }

        if (updatedFrom.assigneeId !== issue.assignee?.id) {
            changes.assignee = {
                from: updatedFrom.assignee?.name,
                to: issue.assignee?.name
            };
        }

        if (updatedFrom.title && issue.title !== updatedFrom.title) {
            changes.title = {
                from: updatedFrom.title,
                to: issue.title
            };
        }

        if (updatedFrom.description !== issue.description) {
            changes.description = {
                from: updatedFrom.description,
                to: issue.description
            };
        }

        if (updatedFrom.priority !== issue.priority) {
            changes.priority = {
                from: updatedFrom.priority,
                to: issue.priority
            };
        }

        return changes;
    }

    /**
     * Check if changes include state change
     * @param {Object} changes - Changes object
     * @returns {boolean} True if state changed
     */
    hasStateChange(changes) {
        return !!changes.state;
    }

    /**
     * Check if changes include assignee change
     * @param {Object} changes - Changes object
     * @returns {boolean} True if assignee changed
     */
    hasAssigneeChange(changes) {
        return !!changes.assignee;
    }

    /**
     * Check if changes include description change
     * @param {Object} changes - Changes object
     * @returns {boolean} True if description changed
     */
    hasDescriptionChange(changes) {
        return !!changes.description;
    }

    /**
     * Check if issue is assigned to Codegen
     * @param {Object} issue - Linear issue
     * @returns {boolean} True if assigned to Codegen
     */
    isCodegenAssigned(issue) {
        const assignee = issue.assignee?.name?.toLowerCase() || '';
        const assigneeEmail = issue.assignee?.email?.toLowerCase() || '';
        
        return assignee.includes('codegen') || 
               assigneeEmail.includes('codegen') ||
               assignee === 'codegen bot' ||
               assignee === 'codegen';
    }

    /**
     * Extract repository information from issue
     * @param {Object} issue - Linear issue
     * @returns {Object|null} Repository info
     */
    extractRepositoryInfo(issue) {
        const description = issue.description || '';
        const title = issue.title || '';

        // Look for GitHub repository patterns
        const repoPattern = /github\.com\/([^\/\s]+\/[^\/\s]+)/gi;
        const matches = [...description.matchAll(repoPattern), ...title.matchAll(repoPattern)];

        if (matches.length > 0) {
            return {
                fullName: matches[0][1],
                url: `https://github.com/${matches[0][1]}`
            };
        }

        // Look for repository mentions in project or team names
        const project = issue.project?.name || '';
        const team = issue.team?.name || '';
        
        if (project.includes('/') || team.includes('/')) {
            const repoName = project.includes('/') ? project : team;
            return {
                fullName: repoName,
                url: `https://github.com/${repoName}`
            };
        }

        return null;
    }

    /**
     * Extract PR information from issue
     * @param {Object} issue - Linear issue
     * @returns {Object|null} PR info
     */
    extractPRInfo(issue) {
        const description = issue.description || '';
        
        // Look for GitHub PR patterns
        const prPattern = /github\.com\/([^\/\s]+\/[^\/\s]+)\/pull\/(\d+)/gi;
        const matches = [...description.matchAll(prPattern)];

        if (matches.length > 0) {
            return {
                repository: matches[0][1],
                number: parseInt(matches[0][2]),
                url: `https://github.com/${matches[0][1]}/pull/${matches[0][2]}`
            };
        }

        return null;
    }

    /**
     * Extract estimated hours from issue
     * @param {Object} issue - Linear issue
     * @returns {number|null} Estimated hours
     */
    extractEstimatedHours(issue) {
        const description = issue.description || '';
        const title = issue.title || '';

        // Look for hour estimates (e.g., "2h", "3 hours", "1.5hrs")
        const hourPattern = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/gi;
        const matches = [...description.matchAll(hourPattern), ...title.matchAll(hourPattern)];

        if (matches.length > 0) {
            return parseFloat(matches[0][1]);
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

export default LinearHandler;

