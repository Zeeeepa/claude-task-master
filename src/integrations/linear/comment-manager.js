/**
 * Linear Comment Manager
 * 
 * Handles automated commenting and progress updates for Linear issues
 * with support for workflow events and status changes.
 */

const EventEmitter = require('events');

class CommentManager extends EventEmitter {
    constructor(linearClient, issueManager, options = {}) {
        super();
        
        this.client = linearClient;
        this.issueManager = issueManager;
        
        // Configuration
        this.enableAutoComments = options.enableAutoComments !== false;
        this.commentTemplates = options.commentTemplates || {};
        this.botIconUrl = options.botIconUrl || 'https://avatars.githubusercontent.com/u/claude-task-master';
        this.maxCommentLength = options.maxCommentLength || 65536; // Linear's limit
        this.enableMarkdown = options.enableMarkdown !== false;
        this.enableMentions = options.enableMentions !== false;
        
        // Comment formatting options
        this.timestampFormat = options.timestampFormat || 'iso';
        this.includeMetadata = options.includeMetadata !== false;
        this.enableEmojis = options.enableEmojis !== false;
        
        // Initialize templates
        this.initializeDefaultTemplates();
        
        // Comment queue for batch processing
        this.commentQueue = [];
        this.isProcessingComments = false;
        this.batchSize = options.batchSize || 10;
        this.batchDelay = options.batchDelay || 1000;
    }
    
    /**
     * Initialize default comment templates
     */
    initializeDefaultTemplates() {
        const defaultTemplates = {
            workflow_started: {
                title: '🚀 Workflow Started',
                template: `**Workflow Started**: {{workflowName}}

{{#if description}}
**Description**: {{description}}
{{/if}}

{{#if metadata}}
**Details**:
{{#each metadata}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

**Started at**: {{timestamp}}`
            },
            
            workflow_completed: {
                title: '✅ Workflow Completed',
                template: `**Workflow Completed**: {{workflowName}}

{{#if result}}
**Result**: {{result}}
{{/if}}

{{#if duration}}
**Duration**: {{duration}}
{{/if}}

{{#if metadata}}
**Details**:
{{#each metadata}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

**Completed at**: {{timestamp}}`
            },
            
            workflow_failed: {
                title: '❌ Workflow Failed',
                template: `**Workflow Failed**: {{workflowName}}

{{#if error}}
**Error**: {{error}}
{{/if}}

{{#if logs}}
**Logs**:
\`\`\`
{{logs}}
\`\`\`
{{/if}}

{{#if metadata}}
**Details**:
{{#each metadata}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

**Failed at**: {{timestamp}}`
            },
            
            pr_created: {
                title: '🔀 Pull Request Created',
                template: `**Pull Request Created**: [{{prTitle}}]({{prUrl}})

{{#if description}}
**Description**: {{description}}
{{/if}}

{{#if branch}}
**Branch**: \`{{branch}}\`
{{/if}}

{{#if commits}}
**Commits**: {{commits}} commit(s)
{{/if}}

**Created at**: {{timestamp}}`
            },
            
            pr_merged: {
                title: '🎉 Pull Request Merged',
                template: `**Pull Request Merged**: [{{prTitle}}]({{prUrl}})

{{#if mergedBy}}
**Merged by**: {{mergedBy}}
{{/if}}

{{#if deploymentUrl}}
**Deployment**: [View Deployment]({{deploymentUrl}})
{{/if}}

**Merged at**: {{timestamp}}`
            },
            
            build_started: {
                title: '🔨 Build Started',
                template: `**Build Started**: {{buildName}}

{{#if branch}}
**Branch**: \`{{branch}}\`
{{/if}}

{{#if commit}}
**Commit**: \`{{commit}}\`
{{/if}}

{{#if buildUrl}}
**Build URL**: [View Build]({{buildUrl}})
{{/if}}

**Started at**: {{timestamp}}`
            },
            
            build_completed: {
                title: '✅ Build Completed',
                template: `**Build Completed**: {{buildName}}

{{#if status}}
**Status**: {{status}}
{{/if}}

{{#if duration}}
**Duration**: {{duration}}
{{/if}}

{{#if artifactsUrl}}
**Artifacts**: [Download]({{artifactsUrl}})
{{/if}}

{{#if buildUrl}}
**Build URL**: [View Build]({{buildUrl}})
{{/if}}

**Completed at**: {{timestamp}}`
            },
            
            deployment_started: {
                title: '🚀 Deployment Started',
                template: `**Deployment Started**: {{environment}}

{{#if version}}
**Version**: {{version}}
{{/if}}

{{#if deploymentUrl}}
**Deployment URL**: [View Deployment]({{deploymentUrl}})
{{/if}}

{{#if metadata}}
**Details**:
{{#each metadata}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

**Started at**: {{timestamp}}`
            },
            
            deployment_completed: {
                title: '🎉 Deployment Completed',
                template: `**Deployment Completed**: {{environment}}

{{#if status}}
**Status**: {{status}}
{{/if}}

{{#if url}}
**Live URL**: [{{url}}]({{url}})
{{/if}}

{{#if duration}}
**Duration**: {{duration}}
{{/if}}

**Completed at**: {{timestamp}}`
            },
            
            error_reported: {
                title: '🚨 Error Reported',
                template: `**Error Reported**: {{errorType}}

{{#if message}}
**Message**: {{message}}
{{/if}}

{{#if stack}}
**Stack Trace**:
\`\`\`
{{stack}}
\`\`\`
{{/if}}

{{#if context}}
**Context**:
{{#each context}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

**Reported at**: {{timestamp}}`
            },
            
            status_changed: {
                title: '📊 Status Changed',
                template: `**Status Changed**: {{fromStatus}} → {{toStatus}}

{{#if reason}}
**Reason**: {{reason}}
{{/if}}

{{#if assignee}}
**Assignee**: {{assignee}}
{{/if}}

**Changed at**: {{timestamp}}`
            }
        };
        
        this.commentTemplates = { ...defaultTemplates, ...this.commentTemplates };
    }
    
    /**
     * Add automated comment to an issue
     */
    async addWorkflowComment(issueId, eventType, data) {
        if (!this.enableAutoComments) {
            return null;
        }
        
        try {
            const template = this.commentTemplates[eventType];
            if (!template) {
                this.emit('comment:template_not_found', { eventType, issueId });
                return null;
            }
            
            const commentBody = this.renderTemplate(template.template, data);
            const comment = await this.issueManager.addComment(
                issueId, 
                commentBody, 
                this.botIconUrl
            );
            
            this.emit('comment:workflow_added', {
                issueId,
                eventType,
                commentId: comment.id,
                template: template.title
            });
            
            return comment;
            
        } catch (error) {
            this.emit('comment:error', { issueId, eventType, error });
            throw error;
        }
    }
    
    /**
     * Add progress update comment
     */
    async addProgressUpdate(issueId, progress) {
        const data = {
            progress: progress.percentage || 0,
            currentStep: progress.currentStep,
            totalSteps: progress.totalSteps,
            description: progress.description,
            timestamp: this.formatTimestamp(new Date()),
            ...progress.metadata
        };
        
        const template = `**Progress Update**: {{progress}}% Complete

{{#if currentStep}}
**Current Step**: {{currentStep}}{{#if totalSteps}} ({{currentStep}}/{{totalSteps}}){{/if}}
{{/if}}

{{#if description}}
**Description**: {{description}}
{{/if}}

{{#if estimatedCompletion}}
**Estimated Completion**: {{estimatedCompletion}}
{{/if}}

**Updated at**: {{timestamp}}`;
        
        const commentBody = this.renderTemplate(template, data);
        return this.issueManager.addComment(issueId, commentBody, this.botIconUrl);
    }
    
    /**
     * Add status update comment
     */
    async addStatusUpdate(issueId, statusChange) {
        const data = {
            fromStatus: statusChange.from,
            toStatus: statusChange.to,
            reason: statusChange.reason,
            assignee: statusChange.assignee,
            timestamp: this.formatTimestamp(new Date()),
            ...statusChange.metadata
        };
        
        return this.addWorkflowComment(issueId, 'status_changed', data);
    }
    
    /**
     * Add error report comment
     */
    async addErrorReport(issueId, error) {
        const data = {
            errorType: error.type || 'Unknown Error',
            message: error.message,
            stack: error.stack,
            context: error.context,
            timestamp: this.formatTimestamp(new Date()),
            ...error.metadata
        };
        
        return this.addWorkflowComment(issueId, 'error_reported', data);
    }
    
    /**
     * Add build status comment
     */
    async addBuildStatus(issueId, buildInfo) {
        const eventType = buildInfo.status === 'started' ? 'build_started' : 'build_completed';
        
        const data = {
            buildName: buildInfo.name,
            status: buildInfo.status,
            branch: buildInfo.branch,
            commit: buildInfo.commit,
            duration: buildInfo.duration,
            buildUrl: buildInfo.url,
            artifactsUrl: buildInfo.artifactsUrl,
            timestamp: this.formatTimestamp(new Date()),
            ...buildInfo.metadata
        };
        
        return this.addWorkflowComment(issueId, eventType, data);
    }
    
    /**
     * Add deployment status comment
     */
    async addDeploymentStatus(issueId, deploymentInfo) {
        const eventType = deploymentInfo.status === 'started' ? 'deployment_started' : 'deployment_completed';
        
        const data = {
            environment: deploymentInfo.environment,
            status: deploymentInfo.status,
            version: deploymentInfo.version,
            url: deploymentInfo.url,
            deploymentUrl: deploymentInfo.deploymentUrl,
            duration: deploymentInfo.duration,
            timestamp: this.formatTimestamp(new Date()),
            ...deploymentInfo.metadata
        };
        
        return this.addWorkflowComment(issueId, eventType, data);
    }
    
    /**
     * Add PR status comment
     */
    async addPRStatus(issueId, prInfo) {
        const eventType = prInfo.action === 'opened' ? 'pr_created' : 'pr_merged';
        
        const data = {
            prTitle: prInfo.title,
            prUrl: prInfo.url,
            description: prInfo.description,
            branch: prInfo.branch,
            commits: prInfo.commits,
            mergedBy: prInfo.mergedBy,
            deploymentUrl: prInfo.deploymentUrl,
            timestamp: this.formatTimestamp(new Date()),
            ...prInfo.metadata
        };
        
        return this.addWorkflowComment(issueId, eventType, data);
    }
    
    /**
     * Queue comment for batch processing
     */
    queueComment(issueId, eventType, data) {
        this.commentQueue.push({
            issueId,
            eventType,
            data,
            queuedAt: new Date()
        });
        
        this.processCommentQueue();
    }
    
    /**
     * Process comment queue
     */
    async processCommentQueue() {
        if (this.isProcessingComments || this.commentQueue.length === 0) {
            return;
        }
        
        this.isProcessingComments = true;
        
        try {
            while (this.commentQueue.length > 0) {
                const batch = this.commentQueue.splice(0, this.batchSize);
                
                const promises = batch.map(async (item) => {
                    try {
                        return await this.addWorkflowComment(
                            item.issueId, 
                            item.eventType, 
                            item.data
                        );
                    } catch (error) {
                        this.emit('comment:batch_error', { item, error });
                        return null;
                    }
                });
                
                await Promise.allSettled(promises);
                
                if (this.commentQueue.length > 0) {
                    await this.sleep(this.batchDelay);
                }
            }
            
        } finally {
            this.isProcessingComments = false;
        }
    }
    
    /**
     * Render template with data
     */
    renderTemplate(template, data) {
        // Simple Handlebars-like template rendering
        let rendered = template;
        
        // Replace simple variables
        rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] || '';
        });
        
        // Handle conditional blocks
        rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
            return data[key] ? content : '';
        });
        
        // Handle each loops
        rendered = rendered.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
            const items = data[key];
            if (!items || !Array.isArray(items)) {
                return '';
            }
            
            return items.map(item => {
                return content.replace(/\{\{this\}\}/g, item);
            }).join('');
        });
        
        // Handle object iteration
        rendered = rendered.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
            const obj = data[key];
            if (!obj || typeof obj !== 'object') {
                return '';
            }
            
            return Object.entries(obj).map(([objKey, value]) => {
                return content
                    .replace(/\{\{@key\}\}/g, objKey)
                    .replace(/\{\{this\}\}/g, value);
            }).join('');
        });
        
        // Truncate if too long
        if (rendered.length > this.maxCommentLength) {
            rendered = rendered.substring(0, this.maxCommentLength - 100) + '\n\n... (truncated)';
        }
        
        return rendered;
    }
    
    /**
     * Format timestamp
     */
    formatTimestamp(date) {
        switch (this.timestampFormat) {
            case 'iso':
                return date.toISOString();
            case 'local':
                return date.toLocaleString();
            case 'relative':
                return this.getRelativeTime(date);
            default:
                return date.toISOString();
        }
    }
    
    /**
     * Get relative time string
     */
    getRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }
    
    /**
     * Add custom comment template
     */
    addTemplate(eventType, template) {
        this.commentTemplates[eventType] = template;
        this.emit('comment:template_added', { eventType, template });
    }
    
    /**
     * Remove comment template
     */
    removeTemplate(eventType) {
        delete this.commentTemplates[eventType];
        this.emit('comment:template_removed', { eventType });
    }
    
    /**
     * Get available templates
     */
    getTemplates() {
        return Object.keys(this.commentTemplates);
    }
    
    /**
     * Update comment configuration
     */
    updateConfig(config) {
        if (config.enableAutoComments !== undefined) {
            this.enableAutoComments = config.enableAutoComments;
        }
        
        if (config.botIconUrl) {
            this.botIconUrl = config.botIconUrl;
        }
        
        if (config.timestampFormat) {
            this.timestampFormat = config.timestampFormat;
        }
        
        if (config.maxCommentLength) {
            this.maxCommentLength = config.maxCommentLength;
        }
        
        this.emit('comment:config_updated', config);
    }
    
    /**
     * Get comment manager status
     */
    getStatus() {
        return {
            enableAutoComments: this.enableAutoComments,
            queueSize: this.commentQueue.length,
            isProcessing: this.isProcessingComments,
            templateCount: Object.keys(this.commentTemplates).length,
            batchSize: this.batchSize
        };
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Clear comment queue
     */
    clearQueue() {
        const queueSize = this.commentQueue.length;
        this.commentQueue = [];
        this.emit('comment:queue_cleared', { clearedComments: queueSize });
        return queueSize;
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.clearQueue();
        this.removeAllListeners();
    }
}

module.exports = CommentManager;

