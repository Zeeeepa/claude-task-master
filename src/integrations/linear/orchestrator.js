import { EventEmitter } from 'events';
import LinearIntegration from './client.js';

/**
 * Linear Orchestrator
 * Manages hierarchical issue structures, progress monitoring, and workflow automation
 */
export class LinearOrchestrator extends EventEmitter {
    constructor(linearClient, database, options = {}) {
        super();
        
        this.linear = linearClient;
        this.db = database;
        this.options = {
            progressCheckInterval: 30000, // 30 seconds
            maxRetries: 3,
            ...options
        };
        
        // Active monitoring sessions
        this.monitoringSessions = new Map();
        
        // Bind event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers for Linear client
     */
    setupEventHandlers() {
        this.linear.on('issueCreated', this.handleIssueCreated.bind(this));
        this.linear.on('issueUpdated', this.handleIssueUpdated.bind(this));
        this.linear.on('subIssueCreated', this.handleSubIssueCreated.bind(this));
        this.linear.on('error', this.handleLinearError.bind(this));
    }

    /**
     * Create hierarchical issue structure for a project
     * @param {Object} projectData - Project data with tasks
     * @returns {Promise<Object>} Created issue structure
     */
    async createProjectIssues(projectData) {
        try {
            // Create main issue
            const mainIssue = await this.linear.createTaskIssue({
                title: `🚀 ${projectData.name} - Main Implementation`,
                description: this.generateMainIssueDescription(projectData),
                priority: 1,
                complexity: 'High',
                labels: ['project', 'main-issue', ...(projectData.labels || [])],
                requirements: projectData.requirements || [],
                acceptanceCriteria: projectData.acceptanceCriteria || [],
                technicalSpecs: projectData.technicalSpecs
            });

            // Create sub-issues for each task
            const subIssues = [];
            for (const [index, task] of projectData.tasks.entries()) {
                const subIssue = await this.linear.createSubIssue(mainIssue.id, {
                    title: task.title,
                    description: task.description,
                    technicalSpecs: task.technicalSpecs,
                    files: task.files || [],
                    acceptanceCriteria: task.acceptanceCriteria || [],
                    priority: task.priority || 0,
                    assigneeId: await this.linear.getCodegenUserId()
                });
                
                subIssues.push(subIssue);
                
                // Store mapping in database
                await this.storeIssueMapping(subIssue.id, {
                    projectId: projectData.id,
                    taskId: task.id,
                    parentIssueId: mainIssue.id,
                    type: 'sub-issue',
                    index: index
                });
            }

            // Store main issue mapping
            await this.storeIssueMapping(mainIssue.id, {
                projectId: projectData.id,
                type: 'main-issue',
                subIssueIds: subIssues.map(issue => issue.id)
            });

            // Start monitoring progress
            this.startProgressMonitoring(mainIssue.id);

            const result = { mainIssue, subIssues };
            this.emit('projectIssuesCreated', result);
            return result;
        } catch (error) {
            this.emit('error', { operation: 'createProjectIssues', error, projectData });
            throw new Error(`Failed to create project issues: ${error.message}`);
        }
    }

    /**
     * Monitor and validate sub-issue progress
     * @param {string} mainIssueId - Main issue ID
     * @returns {Promise<Object>} Progress information
     */
    async validateSubIssueProgress(mainIssueId) {
        try {
            const subIssues = await this.linear.getSubIssues(mainIssueId);
            
            const progressData = {
                total: subIssues.length,
                completed: 0,
                inProgress: 0,
                blocked: 0,
                todo: 0,
                issues: []
            };

            for (const issue of subIssues) {
                const issueData = {
                    id: issue.id,
                    title: issue.title,
                    state: issue.state.name,
                    stateType: issue.state.type,
                    assignee: issue.assignee?.name,
                    updatedAt: issue.updatedAt
                };

                switch (issue.state.type) {
                    case 'completed':
                        progressData.completed++;
                        break;
                    case 'started':
                        progressData.inProgress++;
                        break;
                    case 'unstarted':
                        progressData.todo++;
                        break;
                    default:
                        if (issue.state.name.toLowerCase().includes('blocked')) {
                            progressData.blocked++;
                        } else {
                            progressData.todo++;
                        }
                }

                progressData.issues.push(issueData);
            }

            progressData.progress = progressData.total > 0 
                ? (progressData.completed / progressData.total) * 100 
                : 0;

            // Check if all sub-issues are completed
            if (progressData.progress === 100) {
                await this.handleMainIssueCompletion(mainIssueId);
            }

            // Update main issue with progress
            await this.updateMainIssueProgress(mainIssueId, progressData);

            this.emit('progressValidated', { mainIssueId, progressData });
            return progressData;
        } catch (error) {
            this.emit('error', { operation: 'validateSubIssueProgress', error, mainIssueId });
            throw new Error(`Failed to validate progress: ${error.message}`);
        }
    }

    /**
     * Handle main issue completion
     * @param {string} mainIssueId - Main issue ID
     */
    async handleMainIssueCompletion(mainIssueId) {
        try {
            // Update main issue status
            await this.linear.updateIssue(mainIssueId, {
                status: 'completed'
            });

            // Add completion comment
            await this.linear.createComment(mainIssueId, 
                '🎉 **Project Completed!** All sub-issues have been successfully completed. ' +
                'The implementation is ready for final review and deployment.'
            );

            // Stop monitoring
            this.stopProgressMonitoring(mainIssueId);

            // Trigger completion workflow
            await this.triggerCompletionWorkflow(mainIssueId);

            this.emit('mainIssueCompleted', { mainIssueId });
        } catch (error) {
            this.emit('error', { operation: 'handleMainIssueCompletion', error, mainIssueId });
            throw new Error(`Failed to handle completion: ${error.message}`);
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

            // Update original issue status
            await this.linear.updateIssue(issueId, {
                status: 'needs-restructure'
            });

            // Add comment explaining the restructure
            await this.linear.createComment(issueId,
                `🔧 **Restructure Required**\n\n` +
                `Errors detected during implementation. A restructure sub-issue has been created: ${restructureIssue.identifier}\n\n` +
                `**Error Summary:**\n${errors.map(err => `- ${err.message}`).join('\n')}`
            );

            this.emit('restructureCreated', { originalIssueId: issueId, restructureIssue, errors });
            return restructureIssue;
        } catch (error) {
            this.emit('error', { operation: 'handleErrorsAndRestructure', error, issueId, errors });
            throw new Error(`Failed to handle errors: ${error.message}`);
        }
    }

    /**
     * Start progress monitoring for a main issue
     * @param {string} mainIssueId - Main issue ID
     */
    startProgressMonitoring(mainIssueId) {
        if (this.monitoringSessions.has(mainIssueId)) {
            return; // Already monitoring
        }

        const interval = setInterval(async () => {
            try {
                await this.validateSubIssueProgress(mainIssueId);
            } catch (error) {
                this.emit('error', { operation: 'progressMonitoring', error, mainIssueId });
            }
        }, this.options.progressCheckInterval);

        this.monitoringSessions.set(mainIssueId, interval);
        this.emit('monitoringStarted', { mainIssueId });
    }

    /**
     * Stop progress monitoring for a main issue
     * @param {string} mainIssueId - Main issue ID
     */
    stopProgressMonitoring(mainIssueId) {
        const interval = this.monitoringSessions.get(mainIssueId);
        if (interval) {
            clearInterval(interval);
            this.monitoringSessions.delete(mainIssueId);
            this.emit('monitoringStopped', { mainIssueId });
        }
    }

    /**
     * Generate main issue description
     * @param {Object} projectData - Project data
     * @returns {string} Formatted description
     */
    generateMainIssueDescription(projectData) {
        let description = `# 🚀 ${projectData.name} - Autonomous Development Pipeline\n\n`;
        
        description += `## 🎯 Objective\n${projectData.description || 'No description provided'}\n\n`;

        if (projectData.tasks && projectData.tasks.length > 0) {
            description += `## 📋 Sub-Issues Breakdown\n`;
            projectData.tasks.forEach((task, index) => {
                description += `${index + 1}. **${task.title}** - ${task.description || 'No description'}\n`;
            });
            description += '\n';
        }

        description += `## 🔄 Workflow Status\n`;
        description += `- [ ] Requirements Analysis Complete\n`;
        description += `- [ ] Task Decomposition Complete\n`;
        description += `- [ ] Implementation Started\n`;
        description += `- [ ] Testing & Validation\n`;
        description += `- [ ] Deployment Ready\n`;
        description += `- [ ] Production Deployed\n\n`;

        description += `## 📈 Progress Tracking\n`;
        description += `- **Total Sub-Issues**: ${projectData.tasks?.length || 0}\n`;
        description += `- **Completed**: 0\n`;
        description += `- **In Progress**: 0\n`;
        description += `- **Blocked**: 0\n\n`;

        if (projectData.successCriteria && projectData.successCriteria.length > 0) {
            description += `## 🎯 Success Criteria\n`;
            projectData.successCriteria.forEach(criteria => {
                description += `- ${criteria}\n`;
            });
            description += '\n';
        }

        description += `---\n**Created by**: Autonomous CICD Orchestrator\n`;
        description += `**Project ID**: ${projectData.id || 'N/A'}\n`;
        
        return description;
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

        description += `## 📊 Error Summary\n`;
        description += `- **Total Errors**: ${errors.length}\n`;
        description += `- **Error Types**: ${[...new Set(errors.map(e => e.type || 'Unknown'))].join(', ')}\n`;
        description += `- **Severity**: ${this.calculateErrorSeverity(errors)}\n\n`;

        description += `---\n**Auto-assigned to**: Codegen\n`;
        description += `**Priority**: High (Restructure Required)\n`;
        
        return description;
    }

    /**
     * Calculate error severity
     * @param {Array} errors - Array of errors
     * @returns {string} Severity level
     */
    calculateErrorSeverity(errors) {
        const criticalKeywords = ['syntax', 'compile', 'fatal', 'critical'];
        const hasCritical = errors.some(error => 
            criticalKeywords.some(keyword => 
                error.message.toLowerCase().includes(keyword)
            )
        );
        
        if (hasCritical) return 'Critical';
        if (errors.length > 5) return 'High';
        if (errors.length > 2) return 'Medium';
        return 'Low';
    }

    /**
     * Update main issue with progress information
     * @param {string} mainIssueId - Main issue ID
     * @param {Object} progressData - Progress data
     */
    async updateMainIssueProgress(mainIssueId, progressData) {
        try {
            const progressComment = 
                `📊 **Progress Update**\n\n` +
                `- **Total Sub-Issues**: ${progressData.total}\n` +
                `- **Completed**: ${progressData.completed}\n` +
                `- **In Progress**: ${progressData.inProgress}\n` +
                `- **Todo**: ${progressData.todo}\n` +
                `- **Blocked**: ${progressData.blocked}\n` +
                `- **Progress**: ${progressData.progress.toFixed(1)}%\n\n` +
                `*Last updated: ${new Date().toISOString()}*`;

            await this.linear.createComment(mainIssueId, progressComment);
        } catch (error) {
            this.emit('error', { operation: 'updateMainIssueProgress', error, mainIssueId });
        }
    }

    /**
     * Store issue mapping in database
     * @param {string} issueId - Linear issue ID
     * @param {Object} mapping - Mapping data
     */
    async storeIssueMapping(issueId, mapping) {
        if (!this.db) return;
        
        try {
            // Store in database for tracking
            await this.db.query(
                'INSERT INTO linear_issue_mappings (issue_id, mapping_data, created_at) VALUES ($1, $2, $3)',
                [issueId, JSON.stringify(mapping), new Date()]
            );
        } catch (error) {
            this.emit('error', { operation: 'storeIssueMapping', error, issueId, mapping });
        }
    }

    /**
     * Trigger completion workflow
     * @param {string} mainIssueId - Main issue ID
     */
    async triggerCompletionWorkflow(mainIssueId) {
        try {
            // This would integrate with other systems like GitHub, deployment pipelines, etc.
            this.emit('completionWorkflowTriggered', { mainIssueId });
        } catch (error) {
            this.emit('error', { operation: 'triggerCompletionWorkflow', error, mainIssueId });
        }
    }

    /**
     * Event handlers
     */
    handleIssueCreated(data) {
        this.emit('issueCreated', data);
    }

    handleIssueUpdated(data) {
        this.emit('issueUpdated', data);
    }

    handleSubIssueCreated(data) {
        this.emit('subIssueCreated', data);
    }

    handleLinearError(data) {
        this.emit('linearError', data);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Stop all monitoring sessions
        for (const [mainIssueId, interval] of this.monitoringSessions) {
            clearInterval(interval);
        }
        this.monitoringSessions.clear();
        
        // Remove event listeners
        this.removeAllListeners();
    }
}

export default LinearOrchestrator;

