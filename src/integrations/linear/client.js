import { LinearClient } from '@linear/sdk';
import { EventEmitter } from 'events';

/**
 * Linear API Integration Client
 * Provides comprehensive Linear API integration for automated issue creation,
 * status management, and hierarchical task orchestration
 */
export class LinearIntegration extends EventEmitter {
    constructor(apiKey, teamId, options = {}) {
        super();
        
        if (!apiKey) {
            throw new Error('Linear API key is required');
        }
        
        this.client = new LinearClient({ apiKey });
        this.teamId = teamId;
        this.options = {
            retryAttempts: 3,
            retryDelay: 1000,
            ...options
        };
        
        // Cache for frequently accessed data
        this.cache = {
            states: new Map(),
            labels: new Map(),
            users: new Map(),
            teams: new Map()
        };
    }

    /**
     * Create main issue with optional sub-issues
     * @param {Object} taskData - Task data for issue creation
     * @returns {Promise<Object>} Created issue object
     */
    async createTaskIssue(taskData) {
        try {
            const issueData = {
                teamId: this.teamId,
                title: taskData.title,
                description: this.formatTaskDescription(taskData),
                priority: this.mapComplexityToPriority(taskData.complexity),
                assigneeId: taskData.assigneeId,
                labelIds: await this.getOrCreateLabels(taskData.labels || [])
            };

            // Add parent relationship if specified
            if (taskData.parentId) {
                issueData.parentId = taskData.parentId;
            }

            const issue = await this.client.createIssue(issueData);

            // Create sub-issues for subtasks
            if (taskData.subtasks && taskData.subtasks.length > 0) {
                const subIssues = [];
                for (const subtask of taskData.subtasks) {
                    const subIssue = await this.createSubIssue(issue.id, subtask);
                    subIssues.push(subIssue);
                }
                issue.subIssues = subIssues;
            }

            this.emit('issueCreated', { issue, taskData });
            return issue;
        } catch (error) {
            this.emit('error', { operation: 'createTaskIssue', error, taskData });
            throw new Error(`Failed to create task issue: ${error.message}`);
        }
    }

    /**
     * Create a sub-issue under a parent issue
     * @param {string} parentId - Parent issue ID
     * @param {Object} subtaskData - Subtask data
     * @returns {Promise<Object>} Created sub-issue
     */
    async createSubIssue(parentId, subtaskData) {
        try {
            const subIssueData = {
                teamId: this.teamId,
                title: `📋 ${subtaskData.title}`,
                description: this.formatSubIssueDescription(subtaskData),
                parentId: parentId,
                priority: subtaskData.priority || 0,
                assigneeId: subtaskData.assigneeId || await this.getCodegenUserId()
            };

            const subIssue = await this.client.createIssue(subIssueData);
            this.emit('subIssueCreated', { subIssue, parentId, subtaskData });
            return subIssue;
        } catch (error) {
            this.emit('error', { operation: 'createSubIssue', error, parentId, subtaskData });
            throw new Error(`Failed to create sub-issue: ${error.message}`);
        }
    }

    /**
     * Update issue status and metadata
     * @param {string} issueId - Issue ID to update
     * @param {Object} updates - Update data
     * @returns {Promise<Object>} Updated issue
     */
    async updateIssue(issueId, updates) {
        try {
            const updateData = { ...updates };
            
            // Convert status name to state ID if needed
            if (updates.status && typeof updates.status === 'string') {
                updateData.stateId = await this.getStateIdByName(updates.status);
                delete updateData.status;
            }

            const issue = await this.client.updateIssue(issueId, updateData);
            this.emit('issueUpdated', { issue, updates });
            return issue;
        } catch (error) {
            this.emit('error', { operation: 'updateIssue', error, issueId, updates });
            throw new Error(`Failed to update issue: ${error.message}`);
        }
    }

    /**
     * Add comment to an issue
     * @param {string} issueId - Issue ID
     * @param {string} body - Comment body
     * @returns {Promise<Object>} Created comment
     */
    async createComment(issueId, body) {
        try {
            const comment = await this.client.createComment({
                issueId,
                body
            });
            this.emit('commentCreated', { comment, issueId });
            return comment;
        } catch (error) {
            this.emit('error', { operation: 'createComment', error, issueId });
            throw new Error(`Failed to create comment: ${error.message}`);
        }
    }

    /**
     * Get issue by ID with full details
     * @param {string} issueId - Issue ID
     * @returns {Promise<Object>} Issue object
     */
    async getIssue(issueId) {
        try {
            const issue = await this.client.issue(issueId);
            return issue;
        } catch (error) {
            this.emit('error', { operation: 'getIssue', error, issueId });
            throw new Error(`Failed to get issue: ${error.message}`);
        }
    }

    /**
     * Get sub-issues for a parent issue
     * @param {string} parentId - Parent issue ID
     * @returns {Promise<Array>} Array of sub-issues
     */
    async getSubIssues(parentId) {
        try {
            const issues = await this.client.issues({
                filter: { parent: { id: { eq: parentId } } }
            });
            return issues.nodes;
        } catch (error) {
            this.emit('error', { operation: 'getSubIssues', error, parentId });
            throw new Error(`Failed to get sub-issues: ${error.message}`);
        }
    }

    /**
     * Get or create labels by names
     * @param {Array<string>} labelNames - Label names
     * @returns {Promise<Array<string>>} Array of label IDs
     */
    async getOrCreateLabels(labelNames) {
        if (!labelNames || labelNames.length === 0) return [];

        try {
            const labelIds = [];
            
            for (const labelName of labelNames) {
                // Check cache first
                if (this.cache.labels.has(labelName)) {
                    labelIds.push(this.cache.labels.get(labelName));
                    continue;
                }

                // Try to find existing label
                const existingLabels = await this.client.issueLabels({
                    filter: { name: { eq: labelName } }
                });

                if (existingLabels.nodes.length > 0) {
                    const labelId = existingLabels.nodes[0].id;
                    this.cache.labels.set(labelName, labelId);
                    labelIds.push(labelId);
                } else {
                    // Create new label
                    const newLabel = await this.client.createIssueLabel({
                        name: labelName,
                        teamId: this.teamId
                    });
                    this.cache.labels.set(labelName, newLabel.id);
                    labelIds.push(newLabel.id);
                }
            }

            return labelIds;
        } catch (error) {
            this.emit('error', { operation: 'getOrCreateLabels', error, labelNames });
            throw new Error(`Failed to get or create labels: ${error.message}`);
        }
    }

    /**
     * Get state ID by state name
     * @param {string} stateName - State name
     * @returns {Promise<string>} State ID
     */
    async getStateIdByName(stateName) {
        try {
            // Check cache first
            if (this.cache.states.has(stateName)) {
                return this.cache.states.get(stateName);
            }

            const states = await this.client.workflowStates({
                filter: { name: { eq: stateName } }
            });

            if (states.nodes.length === 0) {
                throw new Error(`State '${stateName}' not found`);
            }

            const stateId = states.nodes[0].id;
            this.cache.states.set(stateName, stateId);
            return stateId;
        } catch (error) {
            this.emit('error', { operation: 'getStateIdByName', error, stateName });
            throw new Error(`Failed to get state ID: ${error.message}`);
        }
    }

    /**
     * Get Codegen user ID (assumes Codegen user exists)
     * @returns {Promise<string>} User ID
     */
    async getCodegenUserId() {
        try {
            // Check cache first
            if (this.cache.users.has('codegen')) {
                return this.cache.users.get('codegen');
            }

            const users = await this.client.users({
                filter: { name: { contains: 'Codegen' } }
            });

            if (users.nodes.length === 0) {
                throw new Error('Codegen user not found');
            }

            const userId = users.nodes[0].id;
            this.cache.users.set('codegen', userId);
            return userId;
        } catch (error) {
            this.emit('error', { operation: 'getCodegenUserId', error });
            throw new Error(`Failed to get Codegen user ID: ${error.message}`);
        }
    }

    /**
     * Format task description for Linear issue
     * @param {Object} taskData - Task data
     * @returns {string} Formatted description
     */
    formatTaskDescription(taskData) {
        let description = `# 🎯 ${taskData.title}\n\n`;
        
        if (taskData.description) {
            description += `## 📋 Description\n${taskData.description}\n\n`;
        }

        if (taskData.requirements) {
            description += `## ✅ Requirements\n`;
            taskData.requirements.forEach(req => {
                description += `- ${req}\n`;
            });
            description += '\n';
        }

        if (taskData.acceptanceCriteria) {
            description += `## 🎯 Acceptance Criteria\n`;
            taskData.acceptanceCriteria.forEach(criteria => {
                description += `- [ ] ${criteria}\n`;
            });
            description += '\n';
        }

        if (taskData.technicalSpecs) {
            description += `## 🔧 Technical Specifications\n${taskData.technicalSpecs}\n\n`;
        }

        if (taskData.dependencies && taskData.dependencies.length > 0) {
            description += `## 🔗 Dependencies\n`;
            taskData.dependencies.forEach(dep => {
                description += `- ${dep}\n`;
            });
            description += '\n';
        }

        description += `---\n**Created by**: Autonomous CICD System\n**Complexity**: ${taskData.complexity || 'Medium'}\n`;
        
        return description;
    }

    /**
     * Format sub-issue description
     * @param {Object} subtaskData - Subtask data
     * @returns {string} Formatted description
     */
    formatSubIssueDescription(subtaskData) {
        let description = `# 📋 ${subtaskData.title}\n\n`;
        
        if (subtaskData.description) {
            description += `## 📝 Description\n${subtaskData.description}\n\n`;
        }

        if (subtaskData.technicalSpecs) {
            description += `## 🔧 Technical Specifications\n${subtaskData.technicalSpecs}\n\n`;
        }

        if (subtaskData.files && subtaskData.files.length > 0) {
            description += `## 📁 Affected Files\n`;
            subtaskData.files.forEach(file => {
                description += `- \`${file}\`\n`;
            });
            description += '\n';
        }

        if (subtaskData.acceptanceCriteria) {
            description += `## ✅ Acceptance Criteria\n`;
            subtaskData.acceptanceCriteria.forEach(criteria => {
                description += `- [ ] ${criteria}\n`;
            });
            description += '\n';
        }

        description += `## 📊 Implementation Status\n`;
        description += `- [ ] Analysis Complete\n`;
        description += `- [ ] Implementation Started\n`;
        description += `- [ ] Code Review\n`;
        description += `- [ ] Testing Complete\n`;
        description += `- [ ] PR Created\n`;
        description += `- [ ] Merged to Main\n\n`;

        description += `---\n**Auto-assigned to**: Codegen\n`;
        
        return description;
    }

    /**
     * Map complexity to Linear priority
     * @param {string} complexity - Complexity level
     * @returns {number} Priority number (0-4)
     */
    mapComplexityToPriority(complexity) {
        const priorityMap = {
            'Low': 4,
            'Medium': 3,
            'High': 2,
            'Critical': 1,
            'Urgent': 0
        };
        
        return priorityMap[complexity] || 3;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.states.clear();
        this.cache.labels.clear();
        this.cache.users.clear();
        this.cache.teams.clear();
    }

    /**
     * Health check for Linear API connection
     * @returns {Promise<boolean>} Connection status
     */
    async healthCheck() {
        try {
            await this.client.viewer;
            return true;
        } catch (error) {
            this.emit('error', { operation: 'healthCheck', error });
            return false;
        }
    }
}

export default LinearIntegration;

