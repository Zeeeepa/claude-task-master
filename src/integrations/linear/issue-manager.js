/**
 * Linear Issue Manager
 * 
 * Handles creation, updating, and management of Linear issues
 * with support for automated workflows and status synchronization.
 */

const EventEmitter = require('events');

class IssueManager extends EventEmitter {
    constructor(linearClient, options = {}) {
        super();
        
        this.client = linearClient;
        this.defaultTeamId = options.defaultTeamId;
        this.defaultProjectId = options.defaultProjectId;
        this.defaultAssigneeId = options.defaultAssigneeId;
        this.autoLabeling = options.autoLabeling !== false;
        this.priorityMapping = options.priorityMapping || {
            'critical': 1,
            'high': 2,
            'medium': 3,
            'low': 4
        };
    }
    
    /**
     * Create a new Linear issue
     */
    async createIssue(issueData) {
        const mutation = `
            mutation IssueCreate($input: IssueCreateInput!) {
                issueCreate(input: $input) {
                    success
                    issue {
                        id
                        identifier
                        title
                        description
                        url
                        state {
                            id
                            name
                            type
                        }
                        assignee {
                            id
                            name
                            email
                        }
                        team {
                            id
                            name
                            key
                        }
                        labels {
                            nodes {
                                id
                                name
                                color
                            }
                        }
                        priority
                        estimate
                        createdAt
                        updatedAt
                    }
                    lastSyncId
                }
            }
        `;
        
        const input = await this.prepareIssueInput(issueData);
        const result = await this.client.query(mutation, { input });
        
        if (!result.issueCreate.success) {
            throw new Error('Failed to create Linear issue');
        }
        
        const issue = result.issueCreate.issue;
        this.emit('issue:created', issue);
        
        return issue;
    }
    
    /**
     * Update an existing Linear issue
     */
    async updateIssue(issueId, updateData) {
        const mutation = `
            mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
                issueUpdate(id: $id, input: $input) {
                    success
                    issue {
                        id
                        identifier
                        title
                        description
                        url
                        state {
                            id
                            name
                            type
                        }
                        assignee {
                            id
                            name
                            email
                        }
                        labels {
                            nodes {
                                id
                                name
                                color
                            }
                        }
                        priority
                        estimate
                        updatedAt
                    }
                    lastSyncId
                }
            }
        `;
        
        const input = await this.prepareUpdateInput(updateData);
        const result = await this.client.query(mutation, { id: issueId, input });
        
        if (!result.issueUpdate.success) {
            throw new Error(`Failed to update Linear issue ${issueId}`);
        }
        
        const issue = result.issueUpdate.issue;
        this.emit('issue:updated', issue);
        
        return issue;
    }
    
    /**
     * Get issue by ID
     */
    async getIssue(issueId) {
        const query = `
            query($id: String!) {
                issue(id: $id) {
                    id
                    identifier
                    title
                    description
                    url
                    state {
                        id
                        name
                        type
                        color
                    }
                    assignee {
                        id
                        name
                        email
                    }
                    team {
                        id
                        name
                        key
                    }
                    labels {
                        nodes {
                            id
                            name
                            color
                        }
                    }
                    priority
                    estimate
                    createdAt
                    updatedAt
                    comments {
                        nodes {
                            id
                            body
                            createdAt
                            user {
                                id
                                name
                            }
                        }
                    }
                    attachments {
                        nodes {
                            id
                            title
                            url
                        }
                    }
                }
            }
        `;
        
        const result = await this.client.query(query, { id: issueId });
        return result.issue;
    }
    
    /**
     * Search issues with filters
     */
    async searchIssues(filters = {}) {
        const query = `
            query($filter: IssueFilter, $first: Int, $after: String) {
                issues(filter: $filter, first: $first, after: $after) {
                    nodes {
                        id
                        identifier
                        title
                        description
                        url
                        state {
                            id
                            name
                            type
                        }
                        assignee {
                            id
                            name
                            email
                        }
                        team {
                            id
                            name
                            key
                        }
                        labels {
                            nodes {
                                id
                                name
                                color
                            }
                        }
                        priority
                        createdAt
                        updatedAt
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;
        
        const filter = this.buildIssueFilter(filters);
        const result = await this.client.query(query, {
            filter,
            first: filters.limit || 50,
            after: filters.after
        });
        
        return result.issues;
    }
    
    /**
     * Add comment to an issue
     */
    async addComment(issueId, body, displayIconUrl = null) {
        const mutation = `
            mutation CommentCreate($input: CommentCreateInput!) {
                commentCreate(input: $input) {
                    success
                    comment {
                        id
                        body
                        createdAt
                        user {
                            id
                            name
                        }
                        issue {
                            id
                            identifier
                        }
                    }
                    lastSyncId
                }
            }
        `;
        
        const input = {
            issueId,
            body,
            ...(displayIconUrl && { displayIconUrl })
        };
        
        const result = await this.client.query(mutation, { input });
        
        if (!result.commentCreate.success) {
            throw new Error(`Failed to add comment to issue ${issueId}`);
        }
        
        const comment = result.commentCreate.comment;
        this.emit('comment:created', comment);
        
        return comment;
    }
    
    /**
     * Assign issue to user
     */
    async assignIssue(issueId, assigneeId) {
        return this.updateIssue(issueId, { assigneeId });
    }
    
    /**
     * Update issue state
     */
    async updateIssueState(issueId, stateId) {
        return this.updateIssue(issueId, { stateId });
    }
    
    /**
     * Add labels to issue
     */
    async addLabels(issueId, labelIds) {
        const currentIssue = await this.getIssue(issueId);
        const currentLabelIds = currentIssue.labels.nodes.map(label => label.id);
        const newLabelIds = [...new Set([...currentLabelIds, ...labelIds])];
        
        return this.updateIssue(issueId, { labelIds: newLabelIds });
    }
    
    /**
     * Remove labels from issue
     */
    async removeLabels(issueId, labelIds) {
        const currentIssue = await this.getIssue(issueId);
        const currentLabelIds = currentIssue.labels.nodes.map(label => label.id);
        const newLabelIds = currentLabelIds.filter(id => !labelIds.includes(id));
        
        return this.updateIssue(issueId, { labelIds: newLabelIds });
    }
    
    /**
     * Set issue priority
     */
    async setPriority(issueId, priority) {
        const priorityValue = typeof priority === 'string' 
            ? this.priorityMapping[priority.toLowerCase()] 
            : priority;
            
        return this.updateIssue(issueId, { priority: priorityValue });
    }
    
    /**
     * Prepare issue input for creation
     */
    async prepareIssueInput(issueData) {
        const input = {
            title: issueData.title,
            description: issueData.description,
            teamId: issueData.teamId || this.defaultTeamId
        };
        
        // Optional fields
        if (issueData.assigneeId || this.defaultAssigneeId) {
            input.assigneeId = issueData.assigneeId || this.defaultAssigneeId;
        }
        
        if (issueData.projectId || this.defaultProjectId) {
            input.projectId = issueData.projectId || this.defaultProjectId;
        }
        
        if (issueData.stateId) {
            input.stateId = issueData.stateId;
        }
        
        if (issueData.priority) {
            input.priority = typeof issueData.priority === 'string'
                ? this.priorityMapping[issueData.priority.toLowerCase()]
                : issueData.priority;
        }
        
        if (issueData.estimate) {
            input.estimate = issueData.estimate;
        }
        
        if (issueData.labelIds && issueData.labelIds.length > 0) {
            input.labelIds = issueData.labelIds;
        }
        
        if (issueData.parentId) {
            input.parentId = issueData.parentId;
        }
        
        return input;
    }
    
    /**
     * Prepare update input
     */
    async prepareUpdateInput(updateData) {
        const input = {};
        
        if (updateData.title) input.title = updateData.title;
        if (updateData.description) input.description = updateData.description;
        if (updateData.assigneeId) input.assigneeId = updateData.assigneeId;
        if (updateData.stateId) input.stateId = updateData.stateId;
        if (updateData.projectId) input.projectId = updateData.projectId;
        if (updateData.labelIds) input.labelIds = updateData.labelIds;
        if (updateData.parentId) input.parentId = updateData.parentId;
        
        if (updateData.priority) {
            input.priority = typeof updateData.priority === 'string'
                ? this.priorityMapping[updateData.priority.toLowerCase()]
                : updateData.priority;
        }
        
        if (updateData.estimate !== undefined) {
            input.estimate = updateData.estimate;
        }
        
        return input;
    }
    
    /**
     * Build issue filter for search
     */
    buildIssueFilter(filters) {
        const filter = {};
        
        if (filters.teamId) filter.team = { id: { eq: filters.teamId } };
        if (filters.assigneeId) filter.assignee = { id: { eq: filters.assigneeId } };
        if (filters.stateId) filter.state = { id: { eq: filters.stateId } };
        if (filters.projectId) filter.project = { id: { eq: filters.projectId } };
        if (filters.priority) filter.priority = { eq: filters.priority };
        if (filters.title) filter.title = { containsIgnoreCase: filters.title };
        if (filters.description) filter.description = { containsIgnoreCase: filters.description };
        
        if (filters.createdAfter) {
            filter.createdAt = { gte: filters.createdAfter };
        }
        
        if (filters.updatedAfter) {
            filter.updatedAt = { gte: filters.updatedAfter };
        }
        
        if (filters.labelIds && filters.labelIds.length > 0) {
            filter.labels = { some: { id: { in: filters.labelIds } } };
        }
        
        return filter;
    }
    
    /**
     * Create issue from workflow event
     */
    async createIssueFromWorkflow(workflowEvent) {
        const issueData = {
            title: workflowEvent.title || `Workflow Event: ${workflowEvent.type}`,
            description: this.formatWorkflowDescription(workflowEvent),
            teamId: workflowEvent.teamId || this.defaultTeamId,
            priority: this.mapWorkflowPriority(workflowEvent.priority),
            labelIds: await this.getWorkflowLabels(workflowEvent)
        };
        
        if (this.autoLabeling) {
            issueData.labelIds = await this.addAutomaticLabels(issueData.labelIds, workflowEvent);
        }
        
        return this.createIssue(issueData);
    }
    
    /**
     * Format workflow event description
     */
    formatWorkflowDescription(workflowEvent) {
        let description = `**Workflow Event**: ${workflowEvent.type}\n\n`;
        
        if (workflowEvent.description) {
            description += `${workflowEvent.description}\n\n`;
        }
        
        if (workflowEvent.metadata) {
            description += `**Metadata**:\n`;
            for (const [key, value] of Object.entries(workflowEvent.metadata)) {
                description += `- **${key}**: ${value}\n`;
            }
            description += '\n';
        }
        
        if (workflowEvent.source) {
            description += `**Source**: ${workflowEvent.source}\n`;
        }
        
        if (workflowEvent.timestamp) {
            description += `**Timestamp**: ${new Date(workflowEvent.timestamp).toISOString()}\n`;
        }
        
        return description;
    }
    
    /**
     * Map workflow priority to Linear priority
     */
    mapWorkflowPriority(priority) {
        if (!priority) return this.priorityMapping.medium;
        
        const priorityMap = {
            'critical': this.priorityMapping.critical,
            'high': this.priorityMapping.high,
            'medium': this.priorityMapping.medium,
            'low': this.priorityMapping.low,
            'urgent': this.priorityMapping.critical,
            'normal': this.priorityMapping.medium
        };
        
        return priorityMap[priority.toLowerCase()] || this.priorityMapping.medium;
    }
    
    /**
     * Get workflow-specific labels
     */
    async getWorkflowLabels(workflowEvent) {
        // This would be implemented based on your label management strategy
        // For now, return empty array
        return [];
    }
    
    /**
     * Add automatic labels based on workflow event
     */
    async addAutomaticLabels(existingLabelIds = [], workflowEvent) {
        // This would implement automatic labeling logic
        // For now, return existing labels
        return existingLabelIds;
    }
}

module.exports = IssueManager;

