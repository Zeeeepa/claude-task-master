import { EventEmitter } from 'events';

/**
 * Linear Status Manager
 * Manages issue status updates, transitions, and workflow automation
 */
export class LinearStatusManager extends EventEmitter {
    constructor(linearClient, options = {}) {
        super();
        
        this.linear = linearClient;
        this.options = {
            autoTransitions: true,
            statusHistory: true,
            notifyOnChange: true,
            ...options
        };
        
        // Status transition rules
        this.transitionRules = new Map([
            ['todo', ['in-progress', 'blocked']],
            ['in-progress', ['completed', 'blocked', 'todo']],
            ['blocked', ['todo', 'in-progress']],
            ['completed', ['todo']], // Allow reopening
            ['needs-restructure', ['todo', 'in-progress']]
        ]);
        
        // Status metadata cache
        this.statusCache = new Map();
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.linear.on('issueUpdated', this.handleIssueUpdate.bind(this));
        this.linear.on('error', this.handleLinearError.bind(this));
    }

    /**
     * Update task status with metadata and validation
     * @param {string} taskId - Task/Issue ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Update result
     */
    async updateTaskStatus(taskId, status, metadata = {}) {
        try {
            // Validate status transition
            const currentIssue = await this.linear.getIssue(taskId);
            const currentStatus = currentIssue.state.name.toLowerCase().replace(/\s+/g, '-');
            
            if (!this.isValidTransition(currentStatus, status)) {
                throw new Error(`Invalid status transition from '${currentStatus}' to '${status}'`);
            }

            // Get state ID for the new status
            const stateId = await this.linear.getStateIdByName(status);
            
            // Prepare update data
            const updateData = {
                stateId,
                ...metadata.issueUpdates
            };

            // Update the issue
            const updatedIssue = await this.linear.updateIssue(taskId, updateData);

            // Update description with status information if enabled
            if (this.options.statusHistory) {
                await this.appendStatusUpdate(taskId, status, metadata);
            }

            // Add status change comment
            await this.addStatusComment(taskId, status, metadata);

            // Store status history
            await this.storeStatusHistory(taskId, {
                fromStatus: currentStatus,
                toStatus: status,
                metadata,
                timestamp: new Date(),
                updatedBy: 'system'
            });

            // Trigger status-specific workflows
            await this.triggerStatusWorkflows(taskId, status, metadata);

            const result = {
                success: true,
                taskId,
                previousStatus: currentStatus,
                newStatus: status,
                updatedIssue,
                metadata
            };

            this.emit('statusUpdated', result);
            return result;
        } catch (error) {
            this.emit('error', { operation: 'updateTaskStatus', error, taskId, status, metadata });
            throw new Error(`Failed to update task status: ${error.message}`);
        }
    }

    /**
     * Handle errors and create restructure issues
     * @param {string} issueId - Issue ID with errors
     * @param {Array} errors - Array of error objects
     * @returns {Promise<Object>} Restructure issue
     */
    async handleErrorsAndRestructure(issueId, errors) {
        try {
            const originalIssue = await this.linear.getIssue(issueId);
            
            // Create restructure sub-issue
            const restructureIssue = await this.linear.createSubIssue(issueId, {
                title: `🔧 Restructure: ${originalIssue.title}`,
                description: this.formatRestructureDescription(errors),
                priority: 1,
                assigneeId: await this.linear.getCodegenUserId()
            });

            // Update original issue status to needs-restructure
            await this.updateTaskStatus(issueId, 'needs-restructure', {
                restructureIssueId: restructureIssue.id,
                errorCount: errors.length,
                errorSummary: this.summarizeErrors(errors)
            });

            // Add detailed error comment
            await this.addErrorComment(issueId, errors, restructureIssue);

            const result = {
                originalIssueId: issueId,
                restructureIssue,
                errors,
                errorSummary: this.summarizeErrors(errors)
            };

            this.emit('restructureCreated', result);
            return result;
        } catch (error) {
            this.emit('error', { operation: 'handleErrorsAndRestructure', error, issueId, errors });
            throw new Error(`Failed to handle errors: ${error.message}`);
        }
    }

    /**
     * Bulk status update for multiple issues
     * @param {Array} updates - Array of {taskId, status, metadata} objects
     * @returns {Promise<Array>} Array of update results
     */
    async bulkStatusUpdate(updates) {
        const results = [];
        const errors = [];

        for (const update of updates) {
            try {
                const result = await this.updateTaskStatus(
                    update.taskId,
                    update.status,
                    update.metadata || {}
                );
                results.push(result);
            } catch (error) {
                errors.push({
                    taskId: update.taskId,
                    error: error.message,
                    update
                });
            }
        }

        const bulkResult = {
            successful: results,
            failed: errors,
            totalProcessed: updates.length,
            successCount: results.length,
            errorCount: errors.length
        };

        this.emit('bulkStatusUpdate', bulkResult);
        return bulkResult;
    }

    /**
     * Get status history for an issue
     * @param {string} taskId - Task/Issue ID
     * @returns {Promise<Array>} Status history
     */
    async getStatusHistory(taskId) {
        try {
            // This would typically query a database
            // For now, return cached data or empty array
            return this.statusCache.get(`${taskId}_history`) || [];
        } catch (error) {
            this.emit('error', { operation: 'getStatusHistory', error, taskId });
            throw new Error(`Failed to get status history: ${error.message}`);
        }
    }

    /**
     * Get current status statistics
     * @param {Array} issueIds - Array of issue IDs (optional)
     * @returns {Promise<Object>} Status statistics
     */
    async getStatusStatistics(issueIds = null) {
        try {
            let issues;
            
            if (issueIds) {
                // Get specific issues
                issues = await Promise.all(
                    issueIds.map(id => this.linear.getIssue(id))
                );
            } else {
                // Get all issues for the team
                const issuesResponse = await this.linear.client.issues({
                    filter: { team: { id: { eq: this.linear.teamId } } }
                });
                issues = issuesResponse.nodes;
            }

            const stats = {
                total: issues.length,
                byStatus: {},
                byPriority: {},
                byAssignee: {},
                completionRate: 0
            };

            issues.forEach(issue => {
                const status = issue.state.name;
                const priority = issue.priority;
                const assignee = issue.assignee?.name || 'Unassigned';

                // Count by status
                stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
                
                // Count by priority
                stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
                
                // Count by assignee
                stats.byAssignee[assignee] = (stats.byAssignee[assignee] || 0) + 1;
            });

            // Calculate completion rate
            const completedCount = stats.byStatus['Completed'] || 0;
            stats.completionRate = issues.length > 0 ? (completedCount / issues.length) * 100 : 0;

            this.emit('statisticsGenerated', stats);
            return stats;
        } catch (error) {
            this.emit('error', { operation: 'getStatusStatistics', error, issueIds });
            throw new Error(`Failed to get status statistics: ${error.message}`);
        }
    }

    /**
     * Validate status transition
     * @param {string} fromStatus - Current status
     * @param {string} toStatus - Target status
     * @returns {boolean} Whether transition is valid
     */
    isValidTransition(fromStatus, toStatus) {
        if (!this.options.autoTransitions) {
            return true; // Allow all transitions if auto-transitions disabled
        }

        const normalizedFrom = fromStatus.toLowerCase().replace(/\s+/g, '-');
        const normalizedTo = toStatus.toLowerCase().replace(/\s+/g, '-');
        
        const allowedTransitions = this.transitionRules.get(normalizedFrom);
        return allowedTransitions ? allowedTransitions.includes(normalizedTo) : true;
    }

    /**
     * Append status update to issue description
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} metadata - Status metadata
     */
    async appendStatusUpdate(taskId, status, metadata) {
        try {
            const issue = await this.linear.getIssue(taskId);
            const timestamp = new Date().toISOString();
            
            const statusUpdate = `\n\n---\n**Status Update** (${timestamp})\n` +
                `- **Status**: ${status}\n` +
                `- **Updated by**: ${metadata.updatedBy || 'System'}\n`;
            
            if (metadata.reason) {
                statusUpdate += `- **Reason**: ${metadata.reason}\n`;
            }
            
            if (metadata.nextSteps) {
                statusUpdate += `- **Next Steps**: ${metadata.nextSteps}\n`;
            }

            const updatedDescription = issue.description + statusUpdate;
            
            await this.linear.updateIssue(taskId, {
                description: updatedDescription
            });
        } catch (error) {
            this.emit('error', { operation: 'appendStatusUpdate', error, taskId, status });
        }
    }

    /**
     * Add status change comment
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} metadata - Status metadata
     */
    async addStatusComment(taskId, status, metadata) {
        try {
            const statusEmojis = {
                'todo': '📋',
                'in-progress': '🚀',
                'completed': '✅',
                'blocked': '🚫',
                'needs-restructure': '🔧'
            };

            const emoji = statusEmojis[status.toLowerCase().replace(/\s+/g, '-')] || '📊';
            
            let comment = `${emoji} **Status Updated to: ${status}**\n\n`;
            
            if (metadata.reason) {
                comment += `**Reason**: ${metadata.reason}\n\n`;
            }
            
            if (metadata.details) {
                comment += `**Details**: ${metadata.details}\n\n`;
            }
            
            if (metadata.nextSteps) {
                comment += `**Next Steps**: ${metadata.nextSteps}\n\n`;
            }
            
            if (metadata.estimatedCompletion) {
                comment += `**Estimated Completion**: ${metadata.estimatedCompletion}\n\n`;
            }

            comment += `*Updated automatically by CICD System*`;

            await this.linear.createComment(taskId, comment);
        } catch (error) {
            this.emit('error', { operation: 'addStatusComment', error, taskId, status });
        }
    }

    /**
     * Add error comment with details
     * @param {string} issueId - Issue ID
     * @param {Array} errors - Array of errors
     * @param {Object} restructureIssue - Restructure issue object
     */
    async addErrorComment(issueId, errors, restructureIssue) {
        try {
            let comment = `🚨 **Implementation Errors Detected**\n\n`;
            comment += `A total of ${errors.length} error(s) were encountered during implementation.\n\n`;
            
            comment += `**Error Summary:**\n`;
            errors.slice(0, 3).forEach((error, index) => {
                comment += `${index + 1}. **${error.type || 'Error'}**: ${error.message}\n`;
                if (error.file) comment += `   - File: \`${error.file}\`\n`;
                if (error.line) comment += `   - Line: ${error.line}\n`;
            });
            
            if (errors.length > 3) {
                comment += `... and ${errors.length - 3} more error(s)\n`;
            }
            
            comment += `\n**Restructure Issue Created**: ${restructureIssue.identifier}\n\n`;
            comment += `The implementation will be restructured to address these issues. `;
            comment += `Progress will continue in the restructure sub-issue.\n\n`;
            comment += `*This issue has been automatically moved to "Needs Restructure" status.*`;

            await this.linear.createComment(issueId, comment);
        } catch (error) {
            this.emit('error', { operation: 'addErrorComment', error, issueId });
        }
    }

    /**
     * Store status history
     * @param {string} taskId - Task ID
     * @param {Object} historyEntry - History entry
     */
    async storeStatusHistory(taskId, historyEntry) {
        try {
            const historyKey = `${taskId}_history`;
            const history = this.statusCache.get(historyKey) || [];
            
            history.push(historyEntry);
            this.statusCache.set(historyKey, history);
            
            // In a real implementation, this would be stored in a database
            this.emit('statusHistoryStored', { taskId, historyEntry });
        } catch (error) {
            this.emit('error', { operation: 'storeStatusHistory', error, taskId, historyEntry });
        }
    }

    /**
     * Trigger status-specific workflows
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} metadata - Status metadata
     */
    async triggerStatusWorkflows(taskId, status, metadata) {
        try {
            switch (status.toLowerCase().replace(/\s+/g, '-')) {
                case 'in-progress':
                    await this.handleInProgressWorkflow(taskId, metadata);
                    break;
                case 'completed':
                    await this.handleCompletedWorkflow(taskId, metadata);
                    break;
                case 'blocked':
                    await this.handleBlockedWorkflow(taskId, metadata);
                    break;
                case 'needs-restructure':
                    await this.handleRestructureWorkflow(taskId, metadata);
                    break;
            }
        } catch (error) {
            this.emit('error', { operation: 'triggerStatusWorkflows', error, taskId, status });
        }
    }

    /**
     * Handle in-progress workflow
     * @param {string} taskId - Task ID
     * @param {Object} metadata - Metadata
     */
    async handleInProgressWorkflow(taskId, metadata) {
        // Trigger implementation start notifications
        this.emit('implementationStarted', { taskId, metadata });
    }

    /**
     * Handle completed workflow
     * @param {string} taskId - Task ID
     * @param {Object} metadata - Metadata
     */
    async handleCompletedWorkflow(taskId, metadata) {
        // Trigger completion validations and next steps
        this.emit('implementationCompleted', { taskId, metadata });
    }

    /**
     * Handle blocked workflow
     * @param {string} taskId - Task ID
     * @param {Object} metadata - Metadata
     */
    async handleBlockedWorkflow(taskId, metadata) {
        // Trigger blocked issue notifications
        this.emit('implementationBlocked', { taskId, metadata });
    }

    /**
     * Handle restructure workflow
     * @param {string} taskId - Task ID
     * @param {Object} metadata - Metadata
     */
    async handleRestructureWorkflow(taskId, metadata) {
        // Trigger restructure notifications
        this.emit('restructureRequired', { taskId, metadata });
    }

    /**
     * Format restructure description
     * @param {Array} errors - Array of errors
     * @returns {string} Formatted description
     */
    formatRestructureDescription(errors) {
        let description = `# 🔧 Implementation Restructure Required\n\n`;
        
        description += `## 🚨 Error Analysis\n`;
        description += `The following errors were detected during implementation:\n\n`;
        
        errors.forEach((error, index) => {
            description += `### Error ${index + 1}: ${error.type || 'Unknown'}\n`;
            description += `**Message**: ${error.message}\n`;
            if (error.file) description += `**File**: \`${error.file}\`\n`;
            if (error.line) description += `**Line**: ${error.line}\n`;
            if (error.stack) description += `**Stack**: \`\`\`\n${error.stack}\n\`\`\`\n`;
            description += '\n';
        });

        description += `## 🔧 Restructure Plan\n`;
        description += `- [ ] Analyze root cause of errors\n`;
        description += `- [ ] Revise implementation approach\n`;
        description += `- [ ] Update technical specifications\n`;
        description += `- [ ] Implement corrected solution\n`;
        description += `- [ ] Validate fixes\n`;
        description += `- [ ] Update parent issue\n\n`;

        description += `---\n**Auto-assigned to**: Codegen\n`;
        description += `**Priority**: High (Restructure Required)\n`;
        
        return description;
    }

    /**
     * Summarize errors
     * @param {Array} errors - Array of errors
     * @returns {Object} Error summary
     */
    summarizeErrors(errors) {
        const summary = {
            total: errors.length,
            byType: {},
            severity: 'Low',
            criticalCount: 0
        };

        const criticalKeywords = ['syntax', 'compile', 'fatal', 'critical'];
        
        errors.forEach(error => {
            const type = error.type || 'Unknown';
            summary.byType[type] = (summary.byType[type] || 0) + 1;
            
            if (criticalKeywords.some(keyword => 
                error.message.toLowerCase().includes(keyword))) {
                summary.criticalCount++;
            }
        });

        // Determine severity
        if (summary.criticalCount > 0) {
            summary.severity = 'Critical';
        } else if (errors.length > 5) {
            summary.severity = 'High';
        } else if (errors.length > 2) {
            summary.severity = 'Medium';
        }

        return summary;
    }

    /**
     * Event handlers
     */
    handleIssueUpdate(data) {
        this.emit('issueUpdated', data);
    }

    handleLinearError(data) {
        this.emit('linearError', data);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.statusCache.clear();
        this.removeAllListeners();
    }
}

export default LinearStatusManager;

