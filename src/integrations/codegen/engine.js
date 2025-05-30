/**
 * @fileoverview AI Development Engine
 * @description Orchestrates the complete development workflow from Linear issues to deployed code
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenIntegration } from './client.js';
import { CodegenMonitor } from './monitor.js';
import { RequirementParser } from '../../utils/requirement-parser.js';

/**
 * AI Development Engine - Orchestrates automated development workflows
 */
export class AIDevelopmentEngine {
    constructor(codegenClient, database, linearClient, options = {}) {
        this.codegen = codegenClient;
        this.db = database;
        this.linear = linearClient;
        this.options = {
            enableProgressUpdates: true,
            enableAutoMerge: false,
            maxRetries: 3,
            pollInterval: 10000, // 10 seconds
            ...options
        };

        // Initialize components
        this.monitor = new CodegenMonitor(this.codegen, this.db, this.linear);
        this.requirementParser = new RequirementParser();
        
        // Track active tasks
        this.activeTasks = new Map();
        
        log('info', 'AI Development Engine initialized');
    }

    /**
     * Process task from Linear and generate code
     * @param {string} issueId - Linear issue ID
     * @returns {Promise<Object>} Processing result
     */
    async processLinearTask(issueId) {
        log('info', `Processing Linear task: ${issueId}`);

        try {
            // Step 1: Get Linear issue details
            const issue = await this.linear.getIssue(issueId);
            if (!issue) {
                throw new Error(`Linear issue ${issueId} not found`);
            }

            // Step 2: Get or create task data in database
            let taskData = await this.db.getTaskByLinearId(issueId);
            if (!taskData) {
                taskData = await this._createTaskFromIssue(issue);
            }

            // Step 3: Extract requirements from Linear issue
            const requirements = this.extractRequirements(issue, taskData);

            // Step 4: Generate code using Codegen
            const codegenTask = await this.codegen.generateCode(requirements);

            // Step 5: Store task reference in database
            await this.db.updateTask(taskData.id, {
                codegenTaskId: codegenTask.id,
                status: 'generating',
                lastUpdated: new Date(),
                requirements: requirements
            });

            // Step 6: Start monitoring progress
            this.monitorCodegenProgress(codegenTask.id, taskData.id);

            // Step 7: Track active task
            this.activeTasks.set(taskData.id, {
                taskData,
                codegenTask,
                startTime: Date.now(),
                status: 'generating'
            });

            log('info', `Task processing initiated for ${issueId} with Codegen task ${codegenTask.id}`);
            return {
                success: true,
                taskId: taskData.id,
                codegenTaskId: codegenTask.id,
                status: 'generating',
                requirements
            };

        } catch (error) {
            log('error', `Failed to process Linear task ${issueId}: ${error.message}`);
            
            // Update Linear issue with error
            if (this.options.enableProgressUpdates) {
                await this._updateLinearWithError(issueId, error);
            }
            
            throw error;
        }
    }

    /**
     * Monitor Codegen progress and update Linear
     * @param {string} codegenTaskId - Codegen task ID
     * @param {string} taskId - Internal task ID
     */
    async monitorCodegenProgress(codegenTaskId, taskId) {
        log('debug', `Starting progress monitoring for Codegen task ${codegenTaskId}`);

        const pollInterval = setInterval(async () => {
            try {
                const task = await this.codegen.monitorTask(codegenTaskId);
                
                // Update task progress
                await this.updateTaskProgress(taskId, task);

                // Check if task is complete
                if (task.status === 'completed') {
                    clearInterval(pollInterval);
                    await this.handleCodegenCompletion(taskId, task);
                } else if (task.status === 'failed') {
                    clearInterval(pollInterval);
                    await this.handleCodegenFailure(taskId, task);
                }

            } catch (error) {
                log('error', `Error monitoring Codegen task ${codegenTaskId}: ${error.message}`);
                
                // Implement exponential backoff for retries
                const activeTask = this.activeTasks.get(taskId);
                if (activeTask) {
                    activeTask.retryCount = (activeTask.retryCount || 0) + 1;
                    
                    if (activeTask.retryCount >= this.options.maxRetries) {
                        clearInterval(pollInterval);
                        await this.handleCodegenFailure(taskId, { 
                            status: 'failed', 
                            error: `Monitoring failed after ${this.options.maxRetries} retries: ${error.message}` 
                        });
                    }
                }
            }
        }, this.options.pollInterval);

        // Store interval reference for cleanup
        const activeTask = this.activeTasks.get(taskId);
        if (activeTask) {
            activeTask.pollInterval = pollInterval;
        }
    }

    /**
     * Update task progress in database and Linear
     * @param {string} taskId - Task ID
     * @param {Object} codegenTask - Codegen task data
     */
    async updateTaskProgress(taskId, codegenTask) {
        try {
            // Update database
            await this.db.updateTask(taskId, {
                codegenStatus: codegenTask.status,
                codegenProgress: codegenTask.progress || 0,
                lastCodegenUpdate: new Date(),
                codegenLogs: codegenTask.logs || []
            });

            // Update Linear if enabled
            if (this.options.enableProgressUpdates) {
                await this.updateLinearProgress(taskId, codegenTask);
            }

            // Update active task tracking
            const activeTask = this.activeTasks.get(taskId);
            if (activeTask) {
                activeTask.status = codegenTask.status;
                activeTask.progress = codegenTask.progress || 0;
                activeTask.lastUpdate = Date.now();
            }

            log('debug', `Task ${taskId} progress updated: ${codegenTask.status} (${codegenTask.progress || 0}%)`);

        } catch (error) {
            log('error', `Failed to update task progress for ${taskId}: ${error.message}`);
        }
    }

    /**
     * Update Linear with progress information
     * @param {string} taskId - Task ID
     * @param {Object} codegenTask - Codegen task data
     */
    async updateLinearProgress(taskId, codegenTask) {
        try {
            const taskData = await this.db.getTask(taskId);
            if (!taskData || !taskData.linearIssueId) {
                return;
            }

            const progressComment = this.formatProgressComment(codegenTask);
            
            await this.linear.createComment(taskData.linearIssueId, {
                body: progressComment
            });

            log('debug', `Linear progress updated for task ${taskId}`);

        } catch (error) {
            log('error', `Failed to update Linear progress for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Handle successful code generation
     * @param {string} taskId - Task ID
     * @param {Object} codegenTask - Completed Codegen task
     */
    async handleCodegenCompletion(taskId, codegenTask) {
        log('info', `Codegen task completed for task ${taskId}`);

        try {
            const taskData = await this.db.getTask(taskId);
            
            // Create PR with generated code
            const pr = await this.codegen.createPR({
                title: `🤖 ${taskData.title}`,
                description: this.formatPRDescription(taskData, codegenTask),
                files: codegenTask.generatedFiles,
                branch: `codegen-bot/${taskId}`,
                baseBranch: 'main',
                taskId: taskId,
                linearIssueId: taskData.linearIssueId
            });

            // Update database with PR information
            await this.db.updateTask(taskId, {
                status: 'pr_created',
                prUrl: pr.url,
                prNumber: pr.number,
                generatedFiles: codegenTask.generatedFiles,
                completedAt: new Date()
            });

            // Update Linear issue
            if (taskData.linearIssueId) {
                await this.linear.updateIssue(taskData.linearIssueId, {
                    state: 'in_review',
                    description: this.appendPRLink(taskData.description, pr.url)
                });

                // Add completion comment
                await this.linear.createComment(taskData.linearIssueId, {
                    body: this.formatCompletionComment(pr, codegenTask)
                });
            }

            // Clean up active task tracking
            this.activeTasks.delete(taskId);

            log('info', `Task ${taskId} completed successfully with PR: ${pr.url}`);
            return pr;

        } catch (error) {
            log('error', `Failed to handle Codegen completion for task ${taskId}: ${error.message}`);
            await this.handleCodegenFailure(taskId, { 
                status: 'failed', 
                error: `Post-completion processing failed: ${error.message}` 
            });
        }
    }

    /**
     * Handle failed code generation
     * @param {string} taskId - Task ID
     * @param {Object} codegenTask - Failed Codegen task
     */
    async handleCodegenFailure(taskId, codegenTask) {
        log('error', `Codegen task failed for task ${taskId}: ${codegenTask.error || 'Unknown error'}`);

        try {
            const taskData = await this.db.getTask(taskId);

            // Update database with failure information
            await this.db.updateTask(taskId, {
                status: 'failed',
                error: codegenTask.error || 'Code generation failed',
                failedAt: new Date()
            });

            // Update Linear issue
            if (taskData.linearIssueId) {
                await this.linear.updateIssue(taskData.linearIssueId, {
                    state: 'todo' // Move back to todo for manual intervention
                });

                // Add failure comment
                await this.linear.createComment(taskData.linearIssueId, {
                    body: this.formatFailureComment(codegenTask)
                });
            }

            // Clean up active task tracking
            this.activeTasks.delete(taskId);

        } catch (error) {
            log('error', `Failed to handle Codegen failure for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Extract requirements from Linear issue
     * @param {Object} issue - Linear issue
     * @param {Object} taskData - Task data
     * @returns {Object} Extracted requirements
     */
    extractRequirements(issue, taskData) {
        // Use the requirement parser to extract structured requirements
        const parsed = this.requirementParser.parseLinearIssue(issue.description);
        
        return {
            title: issue.title,
            description: issue.description,
            repository: taskData.repository || 'default',
            branch: taskData.branch || 'main',
            contextFiles: taskData.contextFiles || [],
            ...parsed
        };
    }

    /**
     * Format progress comment for Linear
     * @param {Object} codegenTask - Codegen task data
     * @returns {string} Formatted comment
     */
    formatProgressComment(codegenTask) {
        const progress = codegenTask.progress || 0;
        const status = codegenTask.status;
        
        let comment = `🤖 **Codegen Progress Update**\n\n`;
        comment += `**Status**: ${status}\n`;
        comment += `**Progress**: ${progress}%\n`;
        comment += `**Last Update**: ${new Date().toISOString()}\n`;

        if (codegenTask.logs && codegenTask.logs.length > 0) {
            comment += `\n**Latest Logs**:\n\`\`\`\n`;
            comment += codegenTask.logs.slice(-3).join('\n');
            comment += `\n\`\`\``;
        }

        return comment;
    }

    /**
     * Format completion comment for Linear
     * @param {Object} pr - PR data
     * @param {Object} codegenTask - Codegen task data
     * @returns {string} Formatted comment
     */
    formatCompletionComment(pr, codegenTask) {
        let comment = `🎉 **Code Generation Completed!**\n\n`;
        comment += `**PR Created**: [${pr.title}](${pr.url})\n`;
        comment += `**Branch**: ${pr.branch}\n`;
        
        if (codegenTask.generatedFiles && codegenTask.generatedFiles.length > 0) {
            comment += `\n**Generated Files**:\n`;
            codegenTask.generatedFiles.forEach(file => {
                comment += `- ${file}\n`;
            });
        }

        comment += `\n**Next Steps**:\n`;
        comment += `1. Review the generated code in the PR\n`;
        comment += `2. Test the implementation\n`;
        comment += `3. Merge when ready\n`;

        return comment;
    }

    /**
     * Format failure comment for Linear
     * @param {Object} codegenTask - Failed Codegen task
     * @returns {string} Formatted comment
     */
    formatFailureComment(codegenTask) {
        let comment = `❌ **Code Generation Failed**\n\n`;
        comment += `**Error**: ${codegenTask.error || 'Unknown error'}\n`;
        comment += `**Status**: ${codegenTask.status}\n`;
        comment += `**Timestamp**: ${new Date().toISOString()}\n`;

        comment += `\n**Next Steps**:\n`;
        comment += `1. Review the error details\n`;
        comment += `2. Update requirements if needed\n`;
        comment += `3. Retry code generation\n`;

        return comment;
    }

    /**
     * Format PR description
     * @param {Object} taskData - Task data
     * @param {Object} codegenTask - Codegen task data
     * @returns {string} Formatted description
     */
    formatPRDescription(taskData, codegenTask) {
        let description = `# 🤖 Automated Implementation\n\n`;
        description += `**Task**: ${taskData.title}\n`;
        description += `**Linear Issue**: ${taskData.linearIssueId}\n`;
        description += `**Generated by**: Codegen AI Development Engine\n\n`;

        if (taskData.description) {
            description += `## Description\n${taskData.description}\n\n`;
        }

        if (codegenTask.generatedFiles && codegenTask.generatedFiles.length > 0) {
            description += `## Generated Files\n`;
            codegenTask.generatedFiles.forEach(file => {
                description += `- ${file}\n`;
            });
            description += '\n';
        }

        description += `## Review Checklist\n`;
        description += `- [ ] Code follows project standards\n`;
        description += `- [ ] Tests are included and passing\n`;
        description += `- [ ] Documentation is updated\n`;
        description += `- [ ] No security vulnerabilities\n`;

        return description;
    }

    /**
     * Append PR link to description
     * @param {string} description - Original description
     * @param {string} prUrl - PR URL
     * @returns {string} Updated description
     */
    appendPRLink(description, prUrl) {
        return `${description}\n\n---\n\n🔗 **Generated PR**: [View Implementation](${prUrl})`;
    }

    /**
     * Create task from Linear issue
     * @param {Object} issue - Linear issue
     * @returns {Promise<Object>} Created task data
     * @private
     */
    async _createTaskFromIssue(issue) {
        const taskData = {
            title: issue.title,
            description: issue.description,
            linearIssueId: issue.id,
            status: 'pending',
            createdAt: new Date(),
            priority: issue.priority || 3
        };

        const task = await this.db.createTask(taskData);
        log('debug', `Created task ${task.id} from Linear issue ${issue.id}`);
        
        return task;
    }

    /**
     * Update Linear with error information
     * @param {string} issueId - Linear issue ID
     * @param {Error} error - Error object
     * @private
     */
    async _updateLinearWithError(issueId, error) {
        try {
            await this.linear.createComment(issueId, {
                body: `❌ **Processing Error**\n\n${error.message}\n\nPlease check the requirements and try again.`
            });
        } catch (commentError) {
            log('error', `Failed to update Linear with error: ${commentError.message}`);
        }
    }

    /**
     * Get engine health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const activeTasks = Array.from(this.activeTasks.values());
        
        return {
            status: 'healthy',
            activeTasks: activeTasks.length,
            components: {
                codegen: await this.codegen.getHealth(),
                monitor: this.monitor.getHealth(),
                database: await this.db.getHealth(),
                linear: await this.linear.getHealth()
            },
            options: this.options,
            uptime: process.uptime()
        };
    }

    /**
     * Shutdown the engine
     */
    async shutdown() {
        log('info', 'Shutting down AI Development Engine...');

        // Clear all active polling intervals
        for (const [taskId, activeTask] of this.activeTasks) {
            if (activeTask.pollInterval) {
                clearInterval(activeTask.pollInterval);
            }
        }

        // Clear active tasks
        this.activeTasks.clear();

        // Shutdown components
        await this.monitor.shutdown();
        await this.codegen.shutdown();

        log('info', 'AI Development Engine shutdown complete');
    }
}

export default AIDevelopmentEngine;

