/**
 * @fileoverview Workflow Dispatcher
 * @description Dispatches workflows based on GitHub events
 */

import { log } from '../utils/simple_logger.js';
import { TaskStorageManager } from '../core/task_storage_manager.js';
import { WorkflowOrchestrator } from '../core/workflow_orchestrator.js';

/**
 * Workflow dispatcher that routes GitHub events to appropriate workflows
 */
export class WorkflowDispatcher {
    constructor(database, config = {}) {
        this.database = database;
        this.config = {
            // Maximum concurrent workflows per repository
            max_concurrent_workflows_per_repo: config.max_concurrent_workflows_per_repo || 5,
            // Default workflow timeout in milliseconds
            default_workflow_timeout: config.default_workflow_timeout || 1800000, // 30 minutes
            // Enable automatic workflow retry
            enable_auto_retry: config.enable_auto_retry !== false,
            // Maximum retry attempts
            max_retry_attempts: config.max_retry_attempts || 3,
            // Workflow priority levels
            workflow_priorities: config.workflow_priorities || {
                'pr_validation': 8,
                'code_review': 7,
                'security_scan': 9,
                'deployment': 6,
                'testing': 7
            },
            ...config
        };

        this.taskStorage = new TaskStorageManager(database);
        this.workflowOrchestrator = new WorkflowOrchestrator(database);
        
        // Track active workflows per repository
        this.activeWorkflows = new Map();
        this.workflowQueue = [];
        this.isInitialized = false;
    }

    /**
     * Initialize the workflow dispatcher
     */
    async initialize() {
        log('debug', 'Initializing workflow dispatcher...');
        
        await this.taskStorage.initialize();
        await this.workflowOrchestrator.initialize();
        
        this.isInitialized = true;
        log('debug', 'Workflow dispatcher initialized');
    }

    /**
     * Dispatch PR workflow based on action
     * @param {string} action - PR action (opened, synchronize, closed, etc.)
     * @param {Object} taskData - Task data extracted from PR event
     * @returns {Promise<Object>} Dispatch result
     */
    async dispatchPRWorkflow(action, taskData) {
        if (!this.isInitialized) {
            throw new Error('Workflow dispatcher not initialized');
        }

        try {
            log('info', `Dispatching PR workflow for action: ${action}`);

            switch (action) {
                case 'opened':
                    return await this.handlePROpened(taskData);
                case 'synchronize':
                    return await this.handlePRUpdated(taskData);
                case 'closed':
                    return await this.handlePRClosed(taskData);
                case 'reopened':
                    return await this.handlePRReopened(taskData);
                case 'ready_for_review':
                    return await this.handlePRReadyForReview(taskData);
                case 'converted_to_draft':
                    return await this.handlePRConvertedToDraft(taskData);
                default:
                    log('info', `No specific handler for PR action: ${action}`);
                    return { status: 'acknowledged', action };
            }
        } catch (error) {
            log('error', `Workflow dispatch failed for action ${action}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle PR opened event
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePROpened(taskData) {
        log('info', `Handling PR opened: ${taskData.title}`);

        // Check if we should skip draft PRs
        if (taskData.metadata?.is_draft) {
            log('info', 'Skipping workflow for draft PR');
            return {
                status: 'skipped',
                reason: 'draft_pr',
                action: 'pr_opened'
            };
        }

        // Create new task for the PR
        const task = await this.taskStorage.storeAtomicTask(taskData, {
            id: `pr_${taskData.pr_number}`,
            type: 'pull_request',
            source: 'github_webhook'
        });

        // Determine workflows to start based on PR characteristics
        const workflows = await this.determineWorkflowsForPR(taskData);
        
        const startedWorkflows = [];
        
        for (const workflowType of workflows) {
            try {
                const workflow = await this.startWorkflow(workflowType, {
                    task_id: task,
                    repository_url: taskData.repository_url,
                    pr_number: taskData.pr_number,
                    branch_name: taskData.branch_name,
                    base_branch: taskData.base_branch,
                    author: taskData.author,
                    metadata: taskData.metadata
                });

                startedWorkflows.push({
                    type: workflowType,
                    workflow_id: workflow.workflow_id,
                    status: 'started'
                });

                log('info', `Started ${workflowType} workflow ${workflow.workflow_id} for task ${task}`);
            } catch (error) {
                log('error', `Failed to start ${workflowType} workflow: ${error.message}`);
                startedWorkflows.push({
                    type: workflowType,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return {
            status: 'workflows_started',
            task_id: task,
            workflows: startedWorkflows,
            action: 'pr_opened'
        };
    }

    /**
     * Handle PR updated event (synchronize)
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePRUpdated(taskData) {
        log('info', `Handling PR updated: ${taskData.title}`);

        // Find existing task for this PR
        const existingTask = await this.findTaskByPR(
            taskData.repository_url,
            taskData.pr_number
        );

        if (existingTask) {
            // Update existing task
            await this.taskStorage.updateTaskStatus(existingTask.id, 'pending', {
                updated_at: new Date(),
                metadata: {
                    ...existingTask.metadata,
                    ...taskData.metadata,
                    last_update: new Date().toISOString(),
                    update_reason: 'pr_synchronize'
                }
            });

            // Cancel existing workflows and start new ones
            await this.cancelWorkflowsForTask(existingTask.id, 'PR updated');
            
            // Start fresh validation workflows
            const workflows = await this.determineWorkflowsForPR(taskData);
            const restartedWorkflows = [];

            for (const workflowType of workflows) {
                try {
                    const workflow = await this.startWorkflow(workflowType, {
                        task_id: existingTask.id,
                        repository_url: taskData.repository_url,
                        pr_number: taskData.pr_number,
                        branch_name: taskData.branch_name,
                        base_branch: taskData.base_branch,
                        author: taskData.author,
                        metadata: taskData.metadata
                    });

                    restartedWorkflows.push({
                        type: workflowType,
                        workflow_id: workflow.workflow_id,
                        status: 'restarted'
                    });

                    log('info', `Restarted ${workflowType} workflow ${workflow.workflow_id} for task ${existingTask.id}`);
                } catch (error) {
                    log('error', `Failed to restart ${workflowType} workflow: ${error.message}`);
                    restartedWorkflows.push({
                        type: workflowType,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            return {
                status: 'workflows_restarted',
                task_id: existingTask.id,
                workflows: restartedWorkflows,
                action: 'pr_updated'
            };
        } else {
            // Create new task if not found (fallback)
            log('warn', `No existing task found for PR ${taskData.pr_number}, creating new one`);
            return await this.handlePROpened(taskData);
        }
    }

    /**
     * Handle PR closed event
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePRClosed(taskData) {
        log('info', `Handling PR closed: ${taskData.title}`);

        const existingTask = await this.findTaskByPR(
            taskData.repository_url,
            taskData.pr_number
        );

        if (existingTask) {
            const isMerged = taskData.metadata?.merged || false;
            const finalStatus = isMerged ? 'completed' : 'cancelled';
            
            await this.taskStorage.updateTaskStatus(existingTask.id, finalStatus, {
                completed_at: new Date(),
                metadata: {
                    ...existingTask.metadata,
                    ...taskData.metadata,
                    closure_reason: isMerged ? 'merged' : 'closed_without_merge',
                    closed_at: new Date().toISOString()
                }
            });

            // Complete any running workflows
            await this.completeWorkflowsForTask(existingTask.id, finalStatus);

            return {
                status: 'task_completed',
                task_id: existingTask.id,
                final_status: finalStatus,
                merged: isMerged,
                action: 'pr_closed'
            };
        }

        return { 
            status: 'no_task_found', 
            action: 'pr_closed',
            pr_number: taskData.pr_number
        };
    }

    /**
     * Handle PR reopened event
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePRReopened(taskData) {
        log('info', `Handling PR reopened: ${taskData.title}`);

        const existingTask = await this.findTaskByPR(
            taskData.repository_url,
            taskData.pr_number
        );

        if (existingTask) {
            // Reactivate the task
            await this.taskStorage.updateTaskStatus(existingTask.id, 'pending', {
                updated_at: new Date(),
                metadata: {
                    ...existingTask.metadata,
                    ...taskData.metadata,
                    reopened_at: new Date().toISOString()
                }
            });

            // Start workflows again
            const workflows = await this.determineWorkflowsForPR(taskData);
            const restartedWorkflows = [];

            for (const workflowType of workflows) {
                try {
                    const workflow = await this.startWorkflow(workflowType, {
                        task_id: existingTask.id,
                        repository_url: taskData.repository_url,
                        pr_number: taskData.pr_number,
                        branch_name: taskData.branch_name,
                        base_branch: taskData.base_branch,
                        author: taskData.author,
                        metadata: taskData.metadata
                    });

                    restartedWorkflows.push({
                        type: workflowType,
                        workflow_id: workflow.workflow_id,
                        status: 'restarted'
                    });
                } catch (error) {
                    restartedWorkflows.push({
                        type: workflowType,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            return {
                status: 'task_reopened',
                task_id: existingTask.id,
                workflows: restartedWorkflows,
                action: 'pr_reopened'
            };
        } else {
            // Create new task for reopened PR
            return await this.handlePROpened(taskData);
        }
    }

    /**
     * Handle PR ready for review event
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePRReadyForReview(taskData) {
        log('info', `Handling PR ready for review: ${taskData.title}`);

        // Similar to PR opened, but specifically for when draft becomes ready
        return await this.handlePROpened(taskData);
    }

    /**
     * Handle PR converted to draft event
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Result
     */
    async handlePRConvertedToDraft(taskData) {
        log('info', `Handling PR converted to draft: ${taskData.title}`);

        const existingTask = await this.findTaskByPR(
            taskData.repository_url,
            taskData.pr_number
        );

        if (existingTask) {
            // Pause workflows for draft PR
            await this.pauseWorkflowsForTask(existingTask.id, 'Converted to draft');

            return {
                status: 'workflows_paused',
                task_id: existingTask.id,
                reason: 'converted_to_draft',
                action: 'pr_converted_to_draft'
            };
        }

        return { 
            status: 'no_task_found', 
            action: 'pr_converted_to_draft' 
        };
    }

    /**
     * Determine which workflows to start for a PR
     * @param {Object} taskData - Task data
     * @returns {Promise<Array>} Array of workflow types
     */
    async determineWorkflowsForPR(taskData) {
        const workflows = [];

        // Always start PR validation
        workflows.push('pr_validation');

        // Add code review workflow for non-draft PRs
        if (!taskData.metadata?.is_draft) {
            workflows.push('code_review');
        }

        // Add security scan for PRs with certain file changes
        const affectedFiles = taskData.affected_files || [];
        const hasSecuritySensitiveFiles = affectedFiles.some(file => 
            file.includes('package.json') || 
            file.includes('requirements.txt') ||
            file.includes('Dockerfile') ||
            file.includes('.env') ||
            file.includes('config/')
        );

        if (hasSecuritySensitiveFiles) {
            workflows.push('security_scan');
        }

        // Add testing workflow for PRs with test files or source changes
        const hasTestFiles = affectedFiles.some(file => 
            file.includes('test/') || 
            file.includes('spec/') ||
            file.includes('.test.') ||
            file.includes('.spec.')
        );

        const hasSourceFiles = affectedFiles.some(file => 
            file.endsWith('.js') || 
            file.endsWith('.ts') ||
            file.endsWith('.py') ||
            file.endsWith('.java')
        );

        if (hasTestFiles || hasSourceFiles) {
            workflows.push('testing');
        }

        log('debug', `Determined workflows for PR ${taskData.pr_number}: ${workflows.join(', ')}`);
        return workflows;
    }

    /**
     * Start a workflow
     * @param {string} workflowType - Type of workflow
     * @param {Object} workflowData - Workflow data
     * @returns {Promise<Object>} Workflow result
     */
    async startWorkflow(workflowType, workflowData) {
        const priority = this.config.workflow_priorities[workflowType] || 5;
        
        const workflowDefinition = {
            type: workflowType,
            priority: priority,
            timeout: this.config.default_workflow_timeout,
            data: workflowData,
            steps: this.getWorkflowSteps(workflowType),
            context: {
                repository_url: workflowData.repository_url,
                pr_number: workflowData.pr_number,
                task_id: workflowData.task_id
            }
        };

        const workflowId = await this.workflowOrchestrator.startWorkflow(workflowDefinition);
        
        // Track active workflow
        const repoKey = this.getRepositoryKey(workflowData.repository_url);
        if (!this.activeWorkflows.has(repoKey)) {
            this.activeWorkflows.set(repoKey, new Set());
        }
        this.activeWorkflows.get(repoKey).add(workflowId);

        return { workflow_id: workflowId, type: workflowType };
    }

    /**
     * Get workflow steps for a workflow type
     * @param {string} workflowType - Workflow type
     * @returns {Array} Workflow steps
     */
    getWorkflowSteps(workflowType) {
        const stepDefinitions = {
            'pr_validation': [
                { id: 'validate_pr_format', name: 'Validate PR Format', type: 'validation' },
                { id: 'check_branch_protection', name: 'Check Branch Protection', type: 'validation' },
                { id: 'validate_commit_messages', name: 'Validate Commit Messages', type: 'validation' }
            ],
            'code_review': [
                { id: 'analyze_code_changes', name: 'Analyze Code Changes', type: 'analysis' },
                { id: 'check_code_quality', name: 'Check Code Quality', type: 'quality' },
                { id: 'review_architecture', name: 'Review Architecture', type: 'review' }
            ],
            'security_scan': [
                { id: 'scan_dependencies', name: 'Scan Dependencies', type: 'security' },
                { id: 'check_secrets', name: 'Check for Secrets', type: 'security' },
                { id: 'analyze_vulnerabilities', name: 'Analyze Vulnerabilities', type: 'security' }
            ],
            'testing': [
                { id: 'run_unit_tests', name: 'Run Unit Tests', type: 'test' },
                { id: 'run_integration_tests', name: 'Run Integration Tests', type: 'test' },
                { id: 'check_coverage', name: 'Check Test Coverage', type: 'test' }
            ],
            'deployment': [
                { id: 'prepare_deployment', name: 'Prepare Deployment', type: 'deploy' },
                { id: 'deploy_to_staging', name: 'Deploy to Staging', type: 'deploy' },
                { id: 'validate_deployment', name: 'Validate Deployment', type: 'validation' }
            ]
        };

        return stepDefinitions[workflowType] || [];
    }

    /**
     * Find task by PR information
     * @param {string} repositoryUrl - Repository URL
     * @param {number} prNumber - PR number
     * @returns {Promise<Object|null>} Task or null
     */
    async findTaskByPR(repositoryUrl, prNumber) {
        try {
            // This would typically query the database
            // For now, using the task storage manager's mock implementation
            const tasks = await this.taskStorage.getPendingTasks();
            
            return tasks.find(task => 
                task.metadata?.repository_url === repositoryUrl &&
                task.metadata?.pr_number === prNumber
            ) || null;
        } catch (error) {
            log('error', `Error finding task by PR: ${error.message}`);
            return null;
        }
    }

    /**
     * Cancel workflows for a task
     * @param {string} taskId - Task ID
     * @param {string} reason - Cancellation reason
     */
    async cancelWorkflowsForTask(taskId, reason) {
        try {
            // Find and cancel active workflows for this task
            for (const [repoKey, workflowIds] of this.activeWorkflows.entries()) {
                for (const workflowId of workflowIds) {
                    const status = await this.workflowOrchestrator.getWorkflowStatus(workflowId);
                    if (status && status.task_id === taskId) {
                        await this.workflowOrchestrator.cancelWorkflow(workflowId, reason);
                        workflowIds.delete(workflowId);
                    }
                }
            }
        } catch (error) {
            log('error', `Error cancelling workflows for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Complete workflows for a task
     * @param {string} taskId - Task ID
     * @param {string} finalStatus - Final status
     */
    async completeWorkflowsForTask(taskId, finalStatus) {
        try {
            // Find and complete active workflows for this task
            for (const [repoKey, workflowIds] of this.activeWorkflows.entries()) {
                for (const workflowId of workflowIds) {
                    const status = await this.workflowOrchestrator.getWorkflowStatus(workflowId);
                    if (status && status.task_id === taskId) {
                        await this.workflowOrchestrator.completeWorkflow(workflowId, {
                            final_status: finalStatus,
                            completed_by: 'pr_closure'
                        });
                        workflowIds.delete(workflowId);
                    }
                }
            }
        } catch (error) {
            log('error', `Error completing workflows for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Pause workflows for a task
     * @param {string} taskId - Task ID
     * @param {string} reason - Pause reason
     */
    async pauseWorkflowsForTask(taskId, reason) {
        try {
            for (const [repoKey, workflowIds] of this.activeWorkflows.entries()) {
                for (const workflowId of workflowIds) {
                    const status = await this.workflowOrchestrator.getWorkflowStatus(workflowId);
                    if (status && status.task_id === taskId) {
                        await this.workflowOrchestrator.pauseWorkflow(workflowId, reason);
                    }
                }
            }
        } catch (error) {
            log('error', `Error pausing workflows for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Get repository key for tracking
     * @param {string} repositoryUrl - Repository URL
     * @returns {string} Repository key
     */
    getRepositoryKey(repositoryUrl) {
        try {
            const url = new URL(repositoryUrl);
            return url.pathname.slice(1); // Remove leading slash
        } catch (error) {
            return repositoryUrl;
        }
    }

    /**
     * Get dispatcher statistics
     * @returns {Promise<Object>} Statistics
     */
    async getStatistics() {
        const totalActiveWorkflows = Array.from(this.activeWorkflows.values())
            .reduce((sum, workflowSet) => sum + workflowSet.size, 0);

        return {
            active_workflows: totalActiveWorkflows,
            active_repositories: this.activeWorkflows.size,
            queue_size: this.workflowQueue.length,
            workflow_priorities: this.config.workflow_priorities,
            task_storage_stats: await this.taskStorage.getTaskMetrics(),
            orchestrator_stats: await this.workflowOrchestrator.getStatistics()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getStatistics();
        
        return {
            status: 'healthy',
            active_workflows: stats.active_workflows,
            task_storage: await this.taskStorage.getHealth(),
            workflow_orchestrator: await this.workflowOrchestrator.getHealth()
        };
    }

    /**
     * Shutdown the dispatcher
     */
    async shutdown() {
        log('debug', 'Shutting down workflow dispatcher...');
        
        // Cancel all active workflows
        for (const [repoKey, workflowIds] of this.activeWorkflows.entries()) {
            for (const workflowId of workflowIds) {
                try {
                    await this.workflowOrchestrator.cancelWorkflow(workflowId, 'System shutdown');
                } catch (error) {
                    log('error', `Error cancelling workflow ${workflowId}: ${error.message}`);
                }
            }
        }
        
        await this.taskStorage.shutdown();
        await this.workflowOrchestrator.shutdown();
        
        this.activeWorkflows.clear();
        this.workflowQueue.length = 0;
        this.isInitialized = false;
    }
}

export default WorkflowDispatcher;

