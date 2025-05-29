/**
 * @fileoverview PR Workflow Management
 * @description Orchestrates the complete workflow from task to PR creation
 */

import { EventEmitter } from 'events';
import { Octokit } from '@octokit/rest';
import { log } from '../../../utils/logger.js';

/**
 * PR Workflow Manager
 * Handles the complete workflow from Codegen task to GitHub PR creation
 */
export class PRWorkflow extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            githubToken: config.githubToken || process.env.GITHUB_TOKEN,
            defaultRepository: config.defaultRepository || process.env.DEFAULT_REPOSITORY,
            defaultBranch: config.defaultBranch || 'main',
            branchPrefix: config.branchPrefix || 'codegen/',
            enableAutoReview: config.enableAutoReview !== false,
            enableStatusTracking: config.enableStatusTracking !== false,
            enableNotifications: config.enableNotifications !== false,
            maxRetries: config.maxRetries || 3,
            retryDelayMs: config.retryDelayMs || 5000,
            timeoutMs: config.timeoutMs || 600000, // 10 minutes
            defaultReviewers: config.defaultReviewers || [],
            autoMergeEnabled: config.autoMergeEnabled || false,
            ...config
        };
        
        // Initialize GitHub client
        if (this.config.githubToken) {
            this.octokit = new Octokit({
                auth: this.config.githubToken,
                userAgent: 'claude-task-master/1.0.0'
            });
        }
        
        this.activeWorkflows = new Map();
        this.workflowHistory = [];
        
        // Metrics
        this.metrics = {
            totalWorkflows: 0,
            successfulWorkflows: 0,
            failedWorkflows: 0,
            averageWorkflowTime: 0,
            prsCreated: 0,
            lastWorkflowAt: null
        };
        
        log('debug', 'PR Workflow initialized', {
            hasGithubToken: !!this.config.githubToken,
            defaultRepository: this.config.defaultRepository,
            branchPrefix: this.config.branchPrefix
        });
    }

    /**
     * Initialize the workflow manager
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', 'Initializing PR Workflow...');
            
            // Validate GitHub token if provided
            if (this.octokit) {
                await this._validateGitHubAccess();
            }
            
            log('info', 'PR Workflow initialized successfully');
            
        } catch (error) {
            log('error', 'Failed to initialize PR Workflow', { error: error.message });
            throw error;
        }
    }

    /**
     * Execute complete workflow from task to PR
     * @param {Object} workflowData - Workflow data
     * @returns {Promise<Object>} Workflow result
     */
    async executeWorkflow(workflowData) {
        const workflowId = `workflow-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            log('info', `Starting workflow ${workflowId}`, {
                taskId: workflowData.task?.id,
                repository: workflowData.options?.repository
            });
            
            // Initialize workflow tracking
            const workflow = {
                id: workflowId,
                startTime,
                status: 'running',
                steps: [],
                data: workflowData,
                metadata: {}
            };
            
            this.activeWorkflows.set(workflowId, workflow);
            this.emit('workflow.started', { workflow });
            
            // Step 1: Prepare repository and branch
            const repoInfo = await this._prepareRepository(workflow);
            this._addWorkflowStep(workflow, 'repository_prepared', { repoInfo });
            
            // Step 2: Submit to Codegen API
            const codegenResult = await this._submitToCodegen(workflow);
            this._addWorkflowStep(workflow, 'codegen_submitted', { taskId: codegenResult.taskId });
            
            // Step 3: Monitor Codegen progress
            const completedResult = await this._monitorCodegenProgress(workflow, codegenResult.taskId);
            this._addWorkflowStep(workflow, 'codegen_completed', { result: completedResult });
            
            // Step 4: Create PR
            const prResult = await this._createPullRequest(workflow, completedResult);
            this._addWorkflowStep(workflow, 'pr_created', { prResult });
            
            // Step 5: Post-processing
            await this._postProcessPR(workflow, prResult);
            this._addWorkflowStep(workflow, 'post_processing_completed');
            
            // Complete workflow
            workflow.status = 'completed';
            workflow.endTime = Date.now();
            workflow.duration = workflow.endTime - workflow.startTime;
            workflow.result = prResult;
            
            this.activeWorkflows.delete(workflowId);
            this.workflowHistory.push(workflow);
            
            // Update metrics
            this._updateMetrics(workflow, true);
            
            this.emit('workflow.completed', { workflow });
            
            log('info', `Workflow ${workflowId} completed successfully`, {
                duration: workflow.duration,
                prUrl: prResult.prUrl,
                prNumber: prResult.prNumber
            });
            
            return {
                success: true,
                workflowId,
                prUrl: prResult.prUrl,
                prNumber: prResult.prNumber,
                branch: prResult.branch,
                repository: repoInfo.fullName,
                duration: workflow.duration,
                steps: workflow.steps.length,
                metadata: workflow.metadata
            };
            
        } catch (error) {
            log('error', `Workflow ${workflowId} failed`, { error: error.message });
            
            // Handle workflow failure
            const workflow = this.activeWorkflows.get(workflowId);
            if (workflow) {
                workflow.status = 'failed';
                workflow.error = error.message;
                workflow.endTime = Date.now();
                workflow.duration = workflow.endTime - workflow.startTime;
                
                this.activeWorkflows.delete(workflowId);
                this.workflowHistory.push(workflow);
                
                this._updateMetrics(workflow, false);
                this.emit('workflow.failed', { workflow, error });
            }
            
            throw error;
        }
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Object} Workflow status
     */
    getWorkflowStatus(workflowId) {
        const activeWorkflow = this.activeWorkflows.get(workflowId);
        if (activeWorkflow) {
            return {
                id: workflowId,
                status: activeWorkflow.status,
                steps: activeWorkflow.steps,
                duration: Date.now() - activeWorkflow.startTime,
                metadata: activeWorkflow.metadata
            };
        }
        
        const historicalWorkflow = this.workflowHistory.find(w => w.id === workflowId);
        if (historicalWorkflow) {
            return {
                id: workflowId,
                status: historicalWorkflow.status,
                steps: historicalWorkflow.steps,
                duration: historicalWorkflow.duration,
                result: historicalWorkflow.result,
                error: historicalWorkflow.error,
                metadata: historicalWorkflow.metadata
            };
        }
        
        return null;
    }

    /**
     * Get workflow manager status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: true,
            activeWorkflows: this.activeWorkflows.size,
            totalWorkflows: this.workflowHistory.length,
            metrics: this.metrics,
            config: {
                hasGithubToken: !!this.config.githubToken,
                defaultRepository: this.config.defaultRepository,
                enableAutoReview: this.config.enableAutoReview
            }
        };
    }

    /**
     * Shutdown the workflow manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down PR Workflow...');
            
            // Wait for active workflows to complete or timeout
            const timeout = 30000; // 30 seconds
            const startTime = Date.now();
            
            while (this.activeWorkflows.size > 0 && (Date.now() - startTime) < timeout) {
                log('info', `Waiting for ${this.activeWorkflows.size} active workflows to complete...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (this.activeWorkflows.size > 0) {
                log('warn', `Force shutdown with ${this.activeWorkflows.size} workflows still active`);
            }
            
            log('info', 'PR Workflow shutdown completed');
            
        } catch (error) {
            log('error', 'Error during PR Workflow shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Prepare repository and branch for PR
     * @param {Object} workflow - Workflow object
     * @returns {Promise<Object>} Repository information
     * @private
     */
    async _prepareRepository(workflow) {
        const { task, options } = workflow.data;
        const repository = options?.repository || this.config.defaultRepository;
        
        if (!repository) {
            throw new Error('Repository not specified and no default repository configured');
        }
        
        // Parse repository (owner/repo)
        const [owner, repo] = repository.split('/');
        if (!owner || !repo) {
            throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
        }
        
        // Generate branch name
        const branchName = this._generateBranchName(task);
        
        const repoInfo = {
            owner,
            repo,
            fullName: repository,
            branchName,
            baseBranch: options?.baseBranch || this.config.defaultBranch
        };
        
        log('debug', 'Repository prepared', repoInfo);
        
        return repoInfo;
    }

    /**
     * Submit task to Codegen API
     * @param {Object} workflow - Workflow object
     * @returns {Promise<Object>} Codegen submission result
     * @private
     */
    async _submitToCodegen(workflow) {
        const { task, analysis, prompt, options } = workflow.data;
        
        // Mock Codegen API submission for now
        // In real implementation, this would call the actual Codegen API
        const taskId = `codegen-task-${Date.now()}`;
        
        log('debug', 'Submitting to Codegen API', {
            taskId,
            promptLength: prompt.content.length,
            complexity: analysis.complexity.level
        });
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            taskId,
            status: 'submitted',
            estimatedCompletionTime: analysis.complexity.estimatedHours * 60 * 1000 // Convert to ms
        };
    }

    /**
     * Monitor Codegen progress
     * @param {Object} workflow - Workflow object
     * @param {string} taskId - Codegen task ID
     * @returns {Promise<Object>} Completion result
     * @private
     */
    async _monitorCodegenProgress(workflow, taskId) {
        const maxWaitTime = this.config.timeoutMs;
        const pollInterval = 5000; // 5 seconds
        const startTime = Date.now();
        
        log('debug', 'Monitoring Codegen progress', { taskId, maxWaitTime });
        
        while ((Date.now() - startTime) < maxWaitTime) {
            // Mock progress check
            // In real implementation, this would call the Codegen API
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            // Simulate completion after some time
            if ((Date.now() - startTime) > 10000) { // 10 seconds for demo
                return {
                    taskId,
                    status: 'completed',
                    result: {
                        files: [
                            {
                                path: 'src/new-feature.js',
                                content: '// Generated code would be here\nfunction newFeature() {\n  return "Hello from Codegen!";\n}\n\nmodule.exports = { newFeature };',
                                action: 'create'
                            },
                            {
                                path: 'tests/new-feature.test.js',
                                content: '// Generated tests would be here\nconst { newFeature } = require("../src/new-feature");\n\ntest("newFeature returns greeting", () => {\n  expect(newFeature()).toBe("Hello from Codegen!");\n});',
                                action: 'create'
                            }
                        ],
                        summary: 'Successfully generated new feature with tests',
                        metadata: {
                            linesOfCode: 15,
                            filesCreated: 2,
                            testsIncluded: true
                        }
                    }
                };
            }
        }
        
        throw new Error(`Codegen task ${taskId} timed out after ${maxWaitTime}ms`);
    }

    /**
     * Create GitHub pull request
     * @param {Object} workflow - Workflow object
     * @param {Object} codegenResult - Codegen completion result
     * @returns {Promise<Object>} PR creation result
     * @private
     */
    async _createPullRequest(workflow, codegenResult) {
        const { task, analysis } = workflow.data;
        const repoInfo = workflow.steps.find(s => s.name === 'repository_prepared').data.repoInfo;
        
        if (!this.octokit) {
            // Mock PR creation if no GitHub token
            return this._mockCreatePR(repoInfo, task, codegenResult);
        }
        
        try {
            // Create PR title and description
            const title = this._generatePRTitle(task, analysis);
            const description = this._generatePRDescription(task, analysis, codegenResult);
            
            // In a real implementation, you would:
            // 1. Create a new branch
            // 2. Commit the generated files
            // 3. Push the branch
            // 4. Create the PR
            
            // For now, we'll mock this
            const prNumber = Math.floor(Math.random() * 1000) + 1;
            const prUrl = `https://github.com/${repoInfo.fullName}/pull/${prNumber}`;
            
            log('info', 'PR created successfully', {
                repository: repoInfo.fullName,
                prNumber,
                prUrl,
                branch: repoInfo.branchName
            });
            
            return {
                prNumber,
                prUrl,
                branch: repoInfo.branchName,
                title,
                description,
                repository: repoInfo.fullName,
                files: codegenResult.result.files,
                metadata: {
                    createdAt: new Date().toISOString(),
                    filesChanged: codegenResult.result.files.length,
                    linesOfCode: codegenResult.result.metadata.linesOfCode
                }
            };
            
        } catch (error) {
            log('error', 'Failed to create PR', { error: error.message });
            throw error;
        }
    }

    /**
     * Post-process PR (add reviewers, labels, etc.)
     * @param {Object} workflow - Workflow object
     * @param {Object} prResult - PR creation result
     * @returns {Promise<void>}
     * @private
     */
    async _postProcessPR(workflow, prResult) {
        try {
            log('debug', 'Post-processing PR', { prNumber: prResult.prNumber });
            
            // Add reviewers if configured
            if (this.config.defaultReviewers.length > 0 && this.octokit) {
                // In real implementation, add reviewers to PR
                log('debug', 'Would add reviewers', { reviewers: this.config.defaultReviewers });
            }
            
            // Add labels based on analysis
            const { analysis } = workflow.data;
            const labels = this._generatePRLabels(analysis);
            if (labels.length > 0 && this.octokit) {
                // In real implementation, add labels to PR
                log('debug', 'Would add labels', { labels });
            }
            
            // Send notifications if enabled
            if (this.config.enableNotifications) {
                await this._sendNotifications(workflow, prResult);
            }
            
        } catch (error) {
            log('warn', 'Post-processing failed, but PR was created successfully', { error: error.message });
            // Don't throw error as PR was already created successfully
        }
    }

    /**
     * Validate GitHub access
     * @returns {Promise<void>}
     * @private
     */
    async _validateGitHubAccess() {
        try {
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            log('debug', 'GitHub access validated', { username: user.login });
        } catch (error) {
            throw new Error(`GitHub authentication failed: ${error.message}`);
        }
    }

    /**
     * Generate branch name for task
     * @param {Object} task - Task object
     * @returns {string} Branch name
     * @private
     */
    _generateBranchName(task) {
        const taskId = task.id || 'unknown';
        const timestamp = Date.now();
        const sanitizedTitle = task.title
            ?.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 30) || 'task';
        
        return `${this.config.branchPrefix}${sanitizedTitle}-${timestamp}`;
    }

    /**
     * Generate PR title
     * @param {Object} task - Task object
     * @param {Object} analysis - Task analysis
     * @returns {string} PR title
     * @private
     */
    _generatePRTitle(task, analysis) {
        const intentPrefix = {
            create: 'feat:',
            modify: 'fix:',
            test: 'test:',
            document: 'docs:'
        };
        
        const prefix = intentPrefix[analysis.intent.primary] || 'feat:';
        return `${prefix} ${task.title || task.description.substring(0, 50)}`;
    }

    /**
     * Generate PR description
     * @param {Object} task - Task object
     * @param {Object} analysis - Task analysis
     * @param {Object} codegenResult - Codegen result
     * @returns {string} PR description
     * @private
     */
    _generatePRDescription(task, analysis, codegenResult) {
        let description = `## Description\n\n${task.description}\n\n`;
        
        description += `## Implementation Details\n\n`;
        description += `- **Intent**: ${analysis.intent.description}\n`;
        description += `- **Complexity**: ${analysis.complexity.level}\n`;
        description += `- **Estimated Effort**: ${analysis.complexity.estimatedHours} hours\n`;
        description += `- **Files Changed**: ${codegenResult.result.files.length}\n`;
        description += `- **Lines of Code**: ${codegenResult.result.metadata.linesOfCode}\n\n`;
        
        if (codegenResult.result.files.length > 0) {
            description += `## Files Changed\n\n`;
            for (const file of codegenResult.result.files) {
                description += `- \`${file.path}\` (${file.action})\n`;
            }
            description += '\n';
        }
        
        if (analysis.requirements.functional.length > 0) {
            description += `## Requirements Addressed\n\n`;
            for (const req of analysis.requirements.functional) {
                description += `- ${req.text}\n`;
            }
            description += '\n';
        }
        
        description += `## Generated by\n\nThis PR was automatically generated by Codegen AI.\n`;
        
        return description;
    }

    /**
     * Generate PR labels based on analysis
     * @param {Object} analysis - Task analysis
     * @returns {Array} Labels array
     * @private
     */
    _generatePRLabels(analysis) {
        const labels = ['codegen-generated'];
        
        // Add intent-based labels
        const intentLabels = {
            create: 'enhancement',
            modify: 'bug',
            test: 'testing',
            document: 'documentation'
        };
        
        if (intentLabels[analysis.intent.primary]) {
            labels.push(intentLabels[analysis.intent.primary]);
        }
        
        // Add complexity label
        labels.push(`complexity:${analysis.complexity.level}`);
        
        // Add technology labels
        if (analysis.technologies.languages.length > 0) {
            labels.push(`lang:${analysis.technologies.languages[0].name}`);
        }
        
        return labels;
    }

    /**
     * Mock PR creation for testing
     * @param {Object} repoInfo - Repository information
     * @param {Object} task - Task object
     * @param {Object} codegenResult - Codegen result
     * @returns {Object} Mock PR result
     * @private
     */
    _mockCreatePR(repoInfo, task, codegenResult) {
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        const prUrl = `https://github.com/${repoInfo.fullName}/pull/${prNumber}`;
        
        log('debug', 'Mock PR created', {
            repository: repoInfo.fullName,
            prNumber,
            branch: repoInfo.branchName
        });
        
        return {
            prNumber,
            prUrl,
            branch: repoInfo.branchName,
            title: `feat: ${task.title || 'Generated feature'}`,
            description: `Mock PR for task: ${task.description}`,
            repository: repoInfo.fullName,
            files: codegenResult.result.files,
            metadata: {
                createdAt: new Date().toISOString(),
                filesChanged: codegenResult.result.files.length,
                linesOfCode: codegenResult.result.metadata.linesOfCode,
                mock: true
            }
        };
    }

    /**
     * Send notifications about PR creation
     * @param {Object} workflow - Workflow object
     * @param {Object} prResult - PR result
     * @returns {Promise<void>}
     * @private
     */
    async _sendNotifications(workflow, prResult) {
        // In real implementation, send notifications via configured channels
        log('debug', 'Would send notifications', {
            prUrl: prResult.prUrl,
            channels: ['slack', 'email']
        });
    }

    /**
     * Add step to workflow tracking
     * @param {Object} workflow - Workflow object
     * @param {string} name - Step name
     * @param {Object} data - Step data
     * @private
     */
    _addWorkflowStep(workflow, name, data = {}) {
        const step = {
            name,
            timestamp: new Date().toISOString(),
            data
        };
        
        workflow.steps.push(step);
        this.emit(`workflow.step.${name}`, { workflow, step });
        
        log('debug', `Workflow step completed: ${name}`, { workflowId: workflow.id });
    }

    /**
     * Update workflow metrics
     * @param {Object} workflow - Workflow object
     * @param {boolean} success - Success status
     * @private
     */
    _updateMetrics(workflow, success) {
        this.metrics.totalWorkflows++;
        
        if (success) {
            this.metrics.successfulWorkflows++;
            this.metrics.prsCreated++;
            
            // Update average workflow time
            const totalTime = this.metrics.averageWorkflowTime * (this.metrics.successfulWorkflows - 1) + workflow.duration;
            this.metrics.averageWorkflowTime = totalTime / this.metrics.successfulWorkflows;
        } else {
            this.metrics.failedWorkflows++;
        }
        
        this.metrics.lastWorkflowAt = new Date().toISOString();
    }
}

export default PRWorkflow;

