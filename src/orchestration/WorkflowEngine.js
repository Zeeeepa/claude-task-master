/**
 * @fileoverview CICD Workflow Orchestration Engine
 * @description Core orchestration engine that manages end-to-end CICD workflows
 */

import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';
import { RequirementProcessor } from '../ai_cicd_system/core/requirement_processor.js';
import { CodegenIntegrator } from '../ai_cicd_system/core/codegen_integrator.js';
import { PRManager } from '../integrations/codegen/core/pr-manager.js';
import { TaskDecomposer } from './TaskDecomposer.js';
import { ValidationOrchestrator } from './ValidationOrchestrator.js';
import { StatusSynchronizer } from './StatusSynchronizer.js';

/**
 * Core CICD Workflow Orchestration Engine
 * Manages end-to-end workflows from requirements input to PR creation and validation
 */
export class WorkflowEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxConcurrentWorkflows: config.maxConcurrentWorkflows || 5,
            workflowTimeout: config.workflowTimeout || 3600000, // 1 hour
            enableRetries: config.enableRetries !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000,
            enableStatusSync: config.enableStatusSync !== false,
            enableValidation: config.enableValidation !== false,
            enableLogging: config.enableLogging !== false,
            ...config
        };

        // Initialize components
        this.requirementProcessor = new RequirementProcessor(this.config.requirementProcessor);
        this.taskDecomposer = new TaskDecomposer(this.config.taskDecomposer);
        this.codegenIntegrator = new CodegenIntegrator(this.config.codegenIntegrator);
        this.prManager = new PRManager(this.config.prManager);
        this.validationOrchestrator = new ValidationOrchestrator(this.config.validationOrchestrator);
        this.statusSynchronizer = new StatusSynchronizer(this.config.statusSynchronizer);

        // Workflow state management
        this.activeWorkflows = new Map();
        this.workflowHistory = new Map();
        this.isInitialized = false;

        // Bind event handlers
        this._bindEventHandlers();
    }

    /**
     * Initialize the workflow engine
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing CICD Workflow Engine...');

        try {
            // Initialize all components
            await Promise.all([
                this.requirementProcessor.initialize?.(),
                this.taskDecomposer.initialize?.(),
                this.codegenIntegrator.initialize?.(),
                this.prManager.initialize?.(),
                this.validationOrchestrator.initialize?.(),
                this.statusSynchronizer.initialize?.()
            ]);

            this.isInitialized = true;
            this.emit('initialized');
            log('info', 'CICD Workflow Engine initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize CICD Workflow Engine:', error);
            throw error;
        }
    }

    /**
     * Start a new CICD workflow
     * @param {string} githubRepoUrl - GitHub repository URL
     * @param {string} requirements - Requirements text
     * @param {Object} options - Additional workflow options
     * @returns {Promise<string>} Workflow ID
     */
    async startWorkflow(githubRepoUrl, requirements, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const workflowId = this._generateWorkflowId();
        const workflow = {
            id: workflowId,
            githubRepoUrl,
            requirements,
            options,
            status: 'initializing',
            startTime: new Date(),
            steps: [],
            currentStep: null,
            retryCount: 0,
            metadata: {
                createdBy: options.createdBy || 'system',
                priority: options.priority || 'medium',
                tags: options.tags || []
            }
        };

        this.activeWorkflows.set(workflowId, workflow);
        
        log('info', `Starting CICD workflow ${workflowId} for repository: ${githubRepoUrl}`);
        this.emit('workflowStarted', { workflowId, workflow });

        try {
            // Start workflow execution asynchronously
            this._executeWorkflow(workflow).catch(error => {
                log('error', `Workflow ${workflowId} failed:`, error);
                this._handleWorkflowError(workflowId, error);
            });

            return workflowId;
        } catch (error) {
            this._handleWorkflowError(workflowId, error);
            throw error;
        }
    }

    /**
     * Pause a running workflow
     * @param {string} workflowId - Workflow ID
     */
    async pauseWorkflow(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        if (workflow.status === 'paused') {
            return;
        }

        workflow.status = 'paused';
        workflow.pausedAt = new Date();
        
        log('info', `Pausing workflow ${workflowId}`);
        this.emit('workflowPaused', { workflowId, workflow });

        // Pause all active components
        await this._pauseWorkflowComponents(workflow);
    }

    /**
     * Resume a paused workflow
     * @param {string} workflowId - Workflow ID
     */
    async resumeWorkflow(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        if (workflow.status !== 'paused') {
            throw new Error(`Workflow ${workflowId} is not paused`);
        }

        workflow.status = 'running';
        workflow.resumedAt = new Date();
        
        log('info', `Resuming workflow ${workflowId}`);
        this.emit('workflowResumed', { workflowId, workflow });

        // Resume workflow execution
        this._executeWorkflow(workflow).catch(error => {
            log('error', `Resumed workflow ${workflowId} failed:`, error);
            this._handleWorkflowError(workflowId, error);
        });
    }

    /**
     * Stop a workflow
     * @param {string} workflowId - Workflow ID
     * @param {string} reason - Reason for stopping
     */
    async stopWorkflow(workflowId, reason = 'Manual stop') {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        workflow.status = 'stopped';
        workflow.stoppedAt = new Date();
        workflow.stopReason = reason;
        
        log('info', `Stopping workflow ${workflowId}: ${reason}`);
        this.emit('workflowStopped', { workflowId, workflow, reason });

        // Stop all active components
        await this._stopWorkflowComponents(workflow);

        // Move to history
        this.workflowHistory.set(workflowId, workflow);
        this.activeWorkflows.delete(workflowId);
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Object} Workflow status
     */
    getWorkflowStatus(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId) || 
                        this.workflowHistory.get(workflowId);
        
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        return {
            id: workflow.id,
            status: workflow.status,
            currentStep: workflow.currentStep,
            progress: this._calculateProgress(workflow),
            startTime: workflow.startTime,
            endTime: workflow.endTime,
            duration: workflow.endTime ? 
                workflow.endTime - workflow.startTime : 
                Date.now() - workflow.startTime,
            steps: workflow.steps.map(step => ({
                name: step.name,
                status: step.status,
                startTime: step.startTime,
                endTime: step.endTime,
                error: step.error
            })),
            metadata: workflow.metadata
        };
    }

    /**
     * Handle workflow events
     * @param {Object} event - Workflow event
     */
    async handleWorkflowEvents(event) {
        const { type, workflowId, data } = event;
        
        log('debug', `Handling workflow event: ${type} for workflow ${workflowId}`);
        
        switch (type) {
            case 'stepCompleted':
                await this._handleStepCompleted(workflowId, data);
                break;
            case 'stepFailed':
                await this._handleStepFailed(workflowId, data);
                break;
            case 'validationCompleted':
                await this._handleValidationCompleted(workflowId, data);
                break;
            case 'prCreated':
                await this._handlePRCreated(workflowId, data);
                break;
            default:
                log('warn', `Unknown workflow event type: ${type}`);
        }
    }

    /**
     * Execute workflow steps
     * @private
     */
    async _executeWorkflow(workflow) {
        try {
            workflow.status = 'running';
            this.emit('workflowRunning', { workflowId: workflow.id, workflow });

            // Step 1: Process requirements
            await this._executeStep(workflow, 'processRequirements', async () => {
                const processed = await this.requirementProcessor.parseRequirements(workflow.requirements);
                workflow.processedRequirements = processed;
                return processed;
            });

            // Step 2: Decompose into tasks
            await this._executeStep(workflow, 'decomposeTasks', async () => {
                const tasks = await this.taskDecomposer.decomposeRequirements(workflow.processedRequirements);
                workflow.tasks = tasks;
                return tasks;
            });

            // Step 3: Process tasks with Codegen
            await this._executeStep(workflow, 'processTasks', async () => {
                const results = [];
                for (const task of workflow.tasks) {
                    if (workflow.status === 'paused' || workflow.status === 'stopped') {
                        break;
                    }
                    
                    const result = await this.codegenIntegrator.sendTaskToCodegen(task, {
                        workflowId: workflow.id,
                        githubRepoUrl: workflow.githubRepoUrl
                    });
                    results.push(result);
                }
                workflow.codegenResults = results;
                return results;
            });

            // Step 4: Create PRs
            await this._executeStep(workflow, 'createPRs', async () => {
                const prs = [];
                for (const result of workflow.codegenResults) {
                    if (workflow.status === 'paused' || workflow.status === 'stopped') {
                        break;
                    }
                    
                    const pr = await this.prManager.createPRFromTask(result.task, result.generatedCode);
                    prs.push(pr);
                }
                workflow.prs = prs;
                return prs;
            });

            // Step 5: Validate PRs
            if (this.config.enableValidation) {
                await this._executeStep(workflow, 'validatePRs', async () => {
                    const validationResults = [];
                    for (const pr of workflow.prs) {
                        if (workflow.status === 'paused' || workflow.status === 'stopped') {
                            break;
                        }
                        
                        const validation = await this.validationOrchestrator.triggerClaudeCodeValidation(pr.url);
                        validationResults.push(validation);
                    }
                    workflow.validationResults = validationResults;
                    return validationResults;
                });
            }

            // Step 6: Sync status
            if (this.config.enableStatusSync) {
                await this._executeStep(workflow, 'syncStatus', async () => {
                    await this.statusSynchronizer.syncWorkflowProgress(workflow.id);
                    return { synced: true };
                });
            }

            // Complete workflow
            workflow.status = 'completed';
            workflow.endTime = new Date();
            
            log('info', `Workflow ${workflow.id} completed successfully`);
            this.emit('workflowCompleted', { workflowId: workflow.id, workflow });

            // Move to history
            this.workflowHistory.set(workflow.id, workflow);
            this.activeWorkflows.delete(workflow.id);

        } catch (error) {
            throw error;
        }
    }

    /**
     * Execute a workflow step
     * @private
     */
    async _executeStep(workflow, stepName, stepFunction) {
        const step = {
            name: stepName,
            status: 'running',
            startTime: new Date()
        };

        workflow.currentStep = stepName;
        workflow.steps.push(step);

        log('info', `Executing workflow step: ${stepName} for workflow ${workflow.id}`);
        this.emit('stepStarted', { workflowId: workflow.id, step });

        try {
            const result = await stepFunction();
            step.status = 'completed';
            step.endTime = new Date();
            step.result = result;

            log('info', `Completed workflow step: ${stepName} for workflow ${workflow.id}`);
            this.emit('stepCompleted', { workflowId: workflow.id, step });

            return result;
        } catch (error) {
            step.status = 'failed';
            step.endTime = new Date();
            step.error = error.message;

            log('error', `Failed workflow step: ${stepName} for workflow ${workflow.id}:`, error);
            this.emit('stepFailed', { workflowId: workflow.id, step, error });

            throw error;
        }
    }

    /**
     * Handle workflow error
     * @private
     */
    async _handleWorkflowError(workflowId, error) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            return;
        }

        workflow.status = 'failed';
        workflow.endTime = new Date();
        workflow.error = error.message;

        this.emit('workflowFailed', { workflowId, workflow, error });

        // Attempt retry if enabled
        if (this.config.enableRetries && workflow.retryCount < this.config.maxRetries) {
            workflow.retryCount++;
            log('info', `Retrying workflow ${workflowId} (attempt ${workflow.retryCount}/${this.config.maxRetries})`);
            
            setTimeout(() => {
                this._executeWorkflow(workflow).catch(retryError => {
                    log('error', `Workflow ${workflowId} retry failed:`, retryError);
                    this._finalizeFailedWorkflow(workflowId, retryError);
                });
            }, this.config.retryDelay);
        } else {
            this._finalizeFailedWorkflow(workflowId, error);
        }
    }

    /**
     * Finalize failed workflow
     * @private
     */
    _finalizeFailedWorkflow(workflowId, error) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            workflow.status = 'failed';
            workflow.finalError = error.message;
            
            // Move to history
            this.workflowHistory.set(workflowId, workflow);
            this.activeWorkflows.delete(workflowId);
        }
    }

    /**
     * Generate unique workflow ID
     * @private
     */
    _generateWorkflowId() {
        return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calculate workflow progress
     * @private
     */
    _calculateProgress(workflow) {
        if (!workflow.steps || workflow.steps.length === 0) {
            return 0;
        }

        const completedSteps = workflow.steps.filter(step => step.status === 'completed').length;
        return Math.round((completedSteps / workflow.steps.length) * 100);
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEventHandlers() {
        // Handle component events
        this.codegenIntegrator.on('taskCompleted', (data) => {
            this.emit('taskCompleted', data);
        });

        this.validationOrchestrator.on('validationCompleted', (data) => {
            this.emit('validationCompleted', data);
        });

        this.statusSynchronizer.on('statusSynced', (data) => {
            this.emit('statusSynced', data);
        });
    }

    /**
     * Pause workflow components
     * @private
     */
    async _pauseWorkflowComponents(workflow) {
        // Implementation for pausing components
        log('debug', `Pausing components for workflow ${workflow.id}`);
    }

    /**
     * Stop workflow components
     * @private
     */
    async _stopWorkflowComponents(workflow) {
        // Implementation for stopping components
        log('debug', `Stopping components for workflow ${workflow.id}`);
    }

    /**
     * Handle step completed event
     * @private
     */
    async _handleStepCompleted(workflowId, data) {
        log('debug', `Step completed for workflow ${workflowId}:`, data);
    }

    /**
     * Handle step failed event
     * @private
     */
    async _handleStepFailed(workflowId, data) {
        log('debug', `Step failed for workflow ${workflowId}:`, data);
    }

    /**
     * Handle validation completed event
     * @private
     */
    async _handleValidationCompleted(workflowId, data) {
        log('debug', `Validation completed for workflow ${workflowId}:`, data);
    }

    /**
     * Handle PR created event
     * @private
     */
    async _handlePRCreated(workflowId, data) {
        log('debug', `PR created for workflow ${workflowId}:`, data);
    }

    /**
     * Shutdown the workflow engine
     */
    async shutdown() {
        log('info', 'Shutting down CICD Workflow Engine...');
        
        // Stop all active workflows
        for (const [workflowId] of this.activeWorkflows) {
            await this.stopWorkflow(workflowId, 'Engine shutdown');
        }

        this.isInitialized = false;
        this.emit('shutdown');
        log('info', 'CICD Workflow Engine shutdown complete');
    }
}

