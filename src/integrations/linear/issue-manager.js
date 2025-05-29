/**
 * Linear Issue Manager
 * 
 * Handles issue creation, updates, status changes, comment management,
 * and label/project assignment with proper metadata tracking.
 */

import LinearAPIClient from './api-client.js';

export class LinearIssueManager {
    constructor(config = {}) {
        this.config = {
            teamId: config.teamId || process.env.LINEAR_TEAM_ID,
            projectId: config.projectId || process.env.LINEAR_PROJECT_ID,
            defaultAssigneeId: config.defaultAssigneeId,
            autoAssign: config.autoAssign || false,
            createSubIssues: config.createSubIssues !== false,
            linkToTasks: config.linkToTasks !== false,
            ...config
        };

        this.apiClient = new LinearAPIClient(config);
        
        // Issue templates
        this.templates = {
            mainIssue: this.getMainIssueTemplate(),
            subIssue: this.getSubIssueTemplate(),
            taskIssue: this.getTaskIssueTemplate()
        };

        // Priority mappings
        this.priorityMap = {
            urgent: 1,
            high: 2,
            medium: 3,
            low: 4
        };

        // Status mappings for Task Master to Linear
        this.statusMap = {
            'pending': 'Todo',
            'in_progress': 'In Progress',
            'validation': 'In Review',
            'completed': 'Done',
            'failed': 'Todo',
            'cancelled': 'Cancelled'
        };
    }

    // ==================== MAIN ISSUE CREATION ====================

    /**
     * Create main issue from requirement
     */
    async createMainIssue(requirement) {
        try {
            const issueData = await this.prepareMainIssueData(requirement);
            const issue = await this.apiClient.createIssue(issueData);
            
            // Add initial comment with metadata
            await this.addMetadataComment(issue.id, {
                type: 'main_issue',
                requirement_id: requirement.id,
                created_by: 'task_master',
                correlation_id: this.generateCorrelationId()
            });

            // Set up labels and project assignment
            await this.setupIssueLabelsAndProject(issue.id, {
                labels: ['epic', 'task-master', `priority-${requirement.priority || 'medium'}`],
                projectId: this.config.projectId
            });

            return {
                issue,
                metadata: {
                    requirement_id: requirement.id,
                    issue_type: 'main',
                    correlation_id: issue.id,
                    created_at: new Date().toISOString()
                }
            };
        } catch (error) {
            throw new Error(`Failed to create main issue: ${error.message}`);
        }
    }

    /**
     * Prepare main issue data
     */
    async prepareMainIssueData(requirement) {
        const template = this.templates.mainIssue;
        
        const title = template.title
            .replace('{requirement.title}', requirement.title);

        const description = template.description
            .replace('{requirement.description}', requirement.description || '')
            .replace('{requirement.id}', requirement.id || '')
            .replace('{acceptance_criteria}', this.formatAcceptanceCriteria(requirement.acceptance_criteria))
            .replace('{sub_tasks_list}', this.formatSubTasksList(requirement.tasks || []));

        // Get appropriate state
        const state = await this.apiClient.findStateByName(this.config.teamId, 'Todo');
        
        return {
            teamId: this.config.teamId,
            title,
            description,
            priority: this.mapPriority(requirement.priority || 'medium'),
            stateId: state?.id,
            assigneeId: this.config.autoAssign ? this.config.defaultAssigneeId : null,
            projectId: this.config.projectId
        };
    }

    // ==================== SUB-ISSUE CREATION ====================

    /**
     * Create sub-issues for tasks
     */
    async createSubIssues(mainIssueId, tasks) {
        if (!this.config.createSubIssues || !tasks || tasks.length === 0) {
            return [];
        }

        const subIssues = [];
        
        for (const task of tasks) {
            try {
                const subIssue = await this.createSubIssue(mainIssueId, task);
                subIssues.push(subIssue);
            } catch (error) {
                console.error(`Failed to create sub-issue for task ${task.id}:`, error);
                // Continue with other tasks
            }
        }

        // Update main issue with sub-issue links
        await this.updateMainIssueWithSubIssues(mainIssueId, subIssues);

        return subIssues;
    }

    /**
     * Create individual sub-issue
     */
    async createSubIssue(parentIssueId, task) {
        const issueData = await this.prepareSubIssueData(parentIssueId, task);
        const issue = await this.apiClient.createIssue(issueData);

        // Add metadata comment
        await this.addMetadataComment(issue.id, {
            type: 'sub_issue',
            parent_issue_id: parentIssueId,
            task_id: task.id,
            task_type: task.type,
            created_by: 'task_master'
        });

        // Set up labels
        await this.setupIssueLabelsAndProject(issue.id, {
            labels: ['task', 'task-master', `type-${task.type}`, `priority-${task.priority || 'medium'}`]
        });

        return {
            issue,
            metadata: {
                parent_issue_id: parentIssueId,
                task_id: task.id,
                task_type: task.type,
                created_at: new Date().toISOString()
            }
        };
    }

    /**
     * Prepare sub-issue data
     */
    async prepareSubIssueData(parentIssueId, task) {
        const template = this.templates.subIssue;
        
        const title = template.title
            .replace('{task.title}', task.title)
            .replace('{task.type}', task.type || 'task');

        const description = template.description
            .replace('{task.description}', task.description || '')
            .replace('{task.id}', task.id || '')
            .replace('{task.requirements}', this.formatTaskRequirements(task.requirements))
            .replace('{task.acceptance_criteria}', this.formatAcceptanceCriteria(task.acceptance_criteria))
            .replace('{parent_issue_id}', parentIssueId);

        // Get appropriate state based on task status
        const stateName = this.statusMap[task.status] || 'Todo';
        const state = await this.apiClient.findStateByName(this.config.teamId, stateName);

        return {
            teamId: this.config.teamId,
            title,
            description,
            priority: this.mapPriority(task.priority || 'medium'),
            stateId: state?.id,
            parentId: parentIssueId,
            assigneeId: task.assignee_id || (this.config.autoAssign ? this.config.defaultAssigneeId : null)
        };
    }

    // ==================== ISSUE UPDATES ====================

    /**
     * Update issue status
     */
    async updateIssueStatus(issueId, newStatus, comment = null) {
        try {
            const stateName = this.statusMap[newStatus] || newStatus;
            const state = await this.apiClient.findStateByName(this.config.teamId, stateName);
            
            if (!state) {
                throw new Error(`State '${stateName}' not found`);
            }

            const updatedIssue = await this.apiClient.updateIssue(issueId, {
                stateId: state.id
            });

            // Add status change comment
            if (comment) {
                await this.apiClient.addComment(issueId, comment);
            } else {
                await this.apiClient.addComment(issueId, 
                    `🔄 Status updated to: **${stateName}**\n\n_Updated by Task Master automation_`
                );
            }

            return updatedIssue;
        } catch (error) {
            throw new Error(`Failed to update issue status: ${error.message}`);
        }
    }

    /**
     * Update issue progress
     */
    async updateIssueProgress(issueId, progressData) {
        try {
            const updateData = {};
            
            if (progressData.description) {
                updateData.description = progressData.description;
            }
            
            if (progressData.priority) {
                updateData.priority = this.mapPriority(progressData.priority);
            }

            if (progressData.assigneeId) {
                updateData.assigneeId = progressData.assigneeId;
            }

            const updatedIssue = await this.apiClient.updateIssue(issueId, updateData);

            // Add progress comment
            if (progressData.comment) {
                await this.apiClient.addComment(issueId, progressData.comment);
            }

            return updatedIssue;
        } catch (error) {
            throw new Error(`Failed to update issue progress: ${error.message}`);
        }
    }

    // ==================== COMMENT MANAGEMENT ====================

    /**
     * Add comment with formatting
     */
    async addComment(issueId, content, options = {}) {
        try {
            const formattedContent = this.formatComment(content, options);
            return await this.apiClient.addComment(issueId, formattedContent);
        } catch (error) {
            throw new Error(`Failed to add comment: ${error.message}`);
        }
    }

    /**
     * Add metadata comment
     */
    async addMetadataComment(issueId, metadata) {
        const comment = `<!-- TASK_MASTER_METADATA\n${JSON.stringify(metadata, null, 2)}\n-->`;
        return await this.apiClient.addComment(issueId, comment);
    }

    /**
     * Add progress update comment
     */
    async addProgressComment(issueId, progressData) {
        const comment = this.formatProgressComment(progressData);
        return await this.apiClient.addComment(issueId, comment);
    }

    /**
     * Add task correlation comment
     */
    async addTaskCorrelationComment(issueId, taskId, correlationType = 'related') {
        const comment = `🔗 **Task Correlation**\n\n` +
                       `- **Task ID**: ${taskId}\n` +
                       `- **Relationship**: ${correlationType}\n` +
                       `- **Updated**: ${new Date().toISOString()}\n\n` +
                       `_Managed by Task Master automation_`;
        
        return await this.apiClient.addComment(issueId, comment);
    }

    // ==================== LABEL AND PROJECT MANAGEMENT ====================

    /**
     * Setup issue labels and project assignment
     */
    async setupIssueLabelsAndProject(issueId, options = {}) {
        try {
            const { labels = [], projectId } = options;
            
            // Create/get labels
            const labelIds = [];
            for (const labelName of labels) {
                const label = await this.apiClient.findOrCreateLabel(
                    this.config.teamId, 
                    labelName, 
                    this.getLabelColor(labelName)
                );
                labelIds.push(label.id);
            }

            // Update issue with labels and project
            const updateData = {};
            if (labelIds.length > 0) {
                updateData.labelIds = labelIds;
            }
            if (projectId) {
                updateData.projectId = projectId;
            }

            if (Object.keys(updateData).length > 0) {
                await this.apiClient.updateIssue(issueId, updateData);
            }

            return { labelIds, projectId };
        } catch (error) {
            console.error('Failed to setup labels and project:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Get label color based on name
     */
    getLabelColor(labelName) {
        const colorMap = {
            'epic': '#8B5CF6',
            'task': '#3B82F6',
            'task-master': '#10B981',
            'priority-urgent': '#EF4444',
            'priority-high': '#F59E0B',
            'priority-medium': '#6B7280',
            'priority-low': '#9CA3AF',
            'type-feature': '#3B82F6',
            'type-bug': '#EF4444',
            'type-improvement': '#10B981',
            'type-documentation': '#8B5CF6'
        };
        
        return colorMap[labelName] || '#6B7280';
    }

    // ==================== FORMATTING UTILITIES ====================

    /**
     * Format comment with options
     */
    formatComment(content, options = {}) {
        let formatted = content;
        
        if (options.type) {
            const typeEmojis = {
                'info': 'ℹ️',
                'success': '✅',
                'warning': '⚠️',
                'error': '❌',
                'progress': '🔄'
            };
            const emoji = typeEmojis[options.type] || '';
            formatted = `${emoji} ${formatted}`;
        }
        
        if (options.timestamp !== false) {
            formatted += `\n\n_${new Date().toISOString()}_`;
        }
        
        return formatted;
    }

    /**
     * Format progress comment
     */
    formatProgressComment(progressData) {
        let comment = `🔄 **Progress Update**\n\n`;
        
        if (progressData.percentage !== undefined) {
            comment += `**Completion**: ${progressData.percentage}%\n`;
        }
        
        if (progressData.status) {
            comment += `**Status**: ${progressData.status}\n`;
        }
        
        if (progressData.description) {
            comment += `**Update**: ${progressData.description}\n`;
        }
        
        if (progressData.blockers && progressData.blockers.length > 0) {
            comment += `**Blockers**:\n`;
            progressData.blockers.forEach(blocker => {
                comment += `- ${blocker}\n`;
            });
        }
        
        comment += `\n_Updated by Task Master automation_`;
        
        return comment;
    }

    /**
     * Format acceptance criteria
     */
    formatAcceptanceCriteria(criteria) {
        if (!criteria || criteria.length === 0) {
            return 'No specific acceptance criteria defined.';
        }
        
        if (Array.isArray(criteria)) {
            return criteria.map(criterion => `- [ ] ${criterion}`).join('\n');
        }
        
        return criteria;
    }

    /**
     * Format sub-tasks list
     */
    formatSubTasksList(tasks) {
        if (!tasks || tasks.length === 0) {
            return 'No sub-tasks defined.';
        }
        
        return tasks.map(task => 
            `- [ ] **${task.title}** (${task.type || 'task'})`
        ).join('\n');
    }

    /**
     * Format task requirements
     */
    formatTaskRequirements(requirements) {
        if (!requirements) {
            return 'No specific requirements defined.';
        }
        
        if (typeof requirements === 'object') {
            return Object.entries(requirements)
                .map(([key, value]) => `- **${key}**: ${value}`)
                .join('\n');
        }
        
        return requirements;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Map priority to Linear priority number
     */
    mapPriority(priority) {
        if (typeof priority === 'number') {
            return Math.max(1, Math.min(4, priority));
        }
        
        return this.priorityMap[priority.toLowerCase()] || 3;
    }

    /**
     * Generate correlation ID
     */
    generateCorrelationId() {
        return `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update main issue with sub-issue links
     */
    async updateMainIssueWithSubIssues(mainIssueId, subIssues) {
        if (subIssues.length === 0) return;
        
        const subIssueLinks = subIssues.map(subIssue => 
            `- [${subIssue.issue.title}](${subIssue.issue.url})`
        ).join('\n');
        
        const comment = `🔗 **Sub-Issues Created**\n\n${subIssueLinks}\n\n_Managed by Task Master automation_`;
        
        await this.apiClient.addComment(mainIssueId, comment);
    }

    // ==================== ISSUE TEMPLATES ====================

    /**
     * Get main issue template
     */
    getMainIssueTemplate() {
        return {
            title: "🚀 {requirement.title}",
            description: `## Requirement Overview

{requirement.description}

## Requirements ID
\`{requirement.id}\`

## Sub-Tasks
{sub_tasks_list}

## Acceptance Criteria
{acceptance_criteria}

---
*This issue was created automatically by Task Master*`
        };
    }

    /**
     * Get sub-issue template
     */
    getSubIssueTemplate() {
        return {
            title: "📋 {task.title} ({task.type})",
            description: `## Task Description

{task.description}

## Task ID
\`{task.id}\`

## Requirements
{task.requirements}

## Acceptance Criteria
{task.acceptance_criteria}

## Parent Issue
Related to: {parent_issue_id}

---
*This sub-issue was created automatically by Task Master*`
        };
    }

    /**
     * Get task issue template
     */
    getTaskIssueTemplate() {
        return {
            title: "⚡ {task.title}",
            description: `## Task Details

{task.description}

## Task Information
- **Type**: {task.type}
- **Priority**: {task.priority}
- **Status**: {task.status}

## Requirements
{task.requirements}

---
*This issue was created automatically by Task Master*`
        };
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get health status
     */
    async getHealthStatus() {
        try {
            const apiHealth = await this.apiClient.getHealthStatus();
            
            return {
                status: apiHealth.status,
                api_client: apiHealth,
                config: {
                    team_id: this.config.teamId,
                    project_id: this.config.projectId,
                    auto_assign: this.config.autoAssign,
                    create_sub_issues: this.config.createSubIssues,
                    link_to_tasks: this.config.linkToTasks
                },
                features: {
                    main_issue_creation: true,
                    sub_issue_creation: this.config.createSubIssues,
                    status_updates: true,
                    comment_management: true,
                    label_management: true,
                    project_assignment: !!this.config.projectId
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }
}

export default LinearIssueManager;

