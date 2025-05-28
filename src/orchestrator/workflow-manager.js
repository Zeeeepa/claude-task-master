/**
 * @fileoverview Workflow Manager - Workflow lifecycle management
 * @description Manages workflow creation, execution, monitoring, and completion
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../scripts/modules/utils.js';

/**
 * Workflow states
 */
export const WorkflowState = {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Step states
 */
export const StepState = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
};

/**
 * Workflow Manager - Manages workflow lifecycle and execution
 */
export class WorkflowManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxConcurrentWorkflows: config.maxConcurrentWorkflows || 10,
            stepTimeout: config.stepTimeout || 300000, // 5 minutes
            workflowTimeout: config.workflowTimeout || 3600000, // 1 hour
            enableParallelExecution: config.enableParallelExecution !== false,
            enableRetry: config.enableRetry !== false,
            maxRetryAttempts: config.maxRetryAttempts || 3,
            retryDelay: config.retryDelay || 5000,
            ...config
        };

        this.workflows = new Map();
        this.activeWorkflows = new Set();
        this.workflowQueue = [];
        this.isInitialized = false;
        this.isShuttingDown = false;
        
        this.metrics = {
            created: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            retried: 0
        };
    }

    /**
     * Initialize the Workflow Manager
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Workflow Manager already initialized');
            return;
        }

        try {
            log('info', 'Initializing Workflow Manager...');
            
            // Initialize workflow storage and recovery
            await this._initializeStorage();
            await this._recoverWorkflows();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            log('info', 'Workflow Manager initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Workflow Manager:', error);
            throw error;
        }
    }

    /**
     * Create a new workflow
     * @param {Object} workflowDefinition - Workflow definition
     * @returns {Promise<string>} Workflow ID
     */
    async createWorkflow(workflowDefinition) {
        this._ensureInitialized();

        try {
            const workflowId = uuidv4();
            const workflow = {
                id: workflowId,
                name: workflowDefinition.name,
                description: workflowDefinition.description || '',
                state: WorkflowState.PENDING,
                steps: this._processSteps(workflowDefinition.steps),
                metadata: workflowDefinition.metadata || {},
                config: workflowDefinition.config || {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: null,
                completedAt: null,
                currentStep: 0,
                retryCount: 0,
                error: null,
                result: null
            };

            // Store workflow
            this.workflows.set(workflowId, workflow);
            this.metrics.created++;

            // Queue for execution if auto-start is enabled
            if (workflowDefinition.autoStart !== false) {
                await this._queueWorkflow(workflowId);
            }

            this.emit('workflowCreated', { workflowId, workflow });
            log('info', `Workflow created: ${workflowId} (${workflow.name})`);

            return workflowId;

        } catch (error) {
            log('error', 'Failed to create workflow:', error);
            throw error;
        }
    }

    /**
     * Start a workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<void>}
     */
    async startWorkflow(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.state !== WorkflowState.PENDING) {
            throw new Error(`Workflow ${workflowId} is not in pending state: ${workflow.state}`);
        }

        try {
            log('info', `Starting workflow: ${workflowId}`);

            // Check concurrent workflow limit
            if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
                await this._queueWorkflow(workflowId);
                return;
            }

            await this._executeWorkflow(workflowId);

        } catch (error) {
            log('error', `Failed to start workflow ${workflowId}:`, error);
            await this._failWorkflow(workflowId, error);
            throw error;
        }
    }

    /**
     * Pause a workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<void>}
     */
    async pauseWorkflow(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.state !== WorkflowState.RUNNING) {
            throw new Error(`Cannot pause workflow ${workflowId} in state: ${workflow.state}`);
        }

        workflow.state = WorkflowState.PAUSED;
        workflow.updatedAt = new Date().toISOString();

        this.emit('workflowPaused', { workflowId, workflow });
        log('info', `Workflow paused: ${workflowId}`);
    }

    /**
     * Resume a paused workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<void>}
     */
    async resumeWorkflow(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.state !== WorkflowState.PAUSED) {
            throw new Error(`Cannot resume workflow ${workflowId} in state: ${workflow.state}`);
        }

        workflow.state = WorkflowState.RUNNING;
        workflow.updatedAt = new Date().toISOString();

        await this._continueWorkflow(workflowId);

        this.emit('workflowResumed', { workflowId, workflow });
        log('info', `Workflow resumed: ${workflowId}`);
    }

    /**
     * Cancel a workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<void>}
     */
    async cancelWorkflow(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if ([WorkflowState.COMPLETED, WorkflowState.FAILED, WorkflowState.CANCELLED].includes(workflow.state)) {
            throw new Error(`Cannot cancel workflow ${workflowId} in state: ${workflow.state}`);
        }

        workflow.state = WorkflowState.CANCELLED;
        workflow.updatedAt = new Date().toISOString();
        workflow.completedAt = new Date().toISOString();

        this.activeWorkflows.delete(workflowId);
        this.metrics.cancelled++;

        this.emit('workflowCancelled', { workflowId, workflow });
        log('info', `Workflow cancelled: ${workflowId}`);

        // Process next workflow in queue
        await this._processQueue();
    }

    /**
     * Retry a failed workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<void>}
     */
    async retryWorkflow(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        if (workflow.state !== WorkflowState.FAILED) {
            throw new Error(`Cannot retry workflow ${workflowId} in state: ${workflow.state}`);
        }

        if (workflow.retryCount >= this.config.maxRetryAttempts) {
            throw new Error(`Workflow ${workflowId} has exceeded maximum retry attempts`);
        }

        try {
            log('info', `Retrying workflow: ${workflowId} (attempt ${workflow.retryCount + 1})`);

            workflow.retryCount++;
            workflow.state = WorkflowState.PENDING;
            workflow.error = null;
            workflow.updatedAt = new Date().toISOString();

            // Reset failed steps
            workflow.steps.forEach(step => {
                if (step.state === StepState.FAILED) {
                    step.state = StepState.PENDING;
                    step.error = null;
                    step.retryCount = 0;
                }
            });

            this.metrics.retried++;

            // Add delay before retry
            setTimeout(async () => {
                await this.startWorkflow(workflowId);
            }, this.config.retryDelay);

        } catch (error) {
            log('error', `Failed to retry workflow ${workflowId}:`, error);
            throw error;
        }
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Workflow status
     */
    async getWorkflowStatus(workflowId) {
        this._ensureInitialized();

        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        return {
            id: workflow.id,
            name: workflow.name,
            state: workflow.state,
            currentStep: workflow.currentStep,
            totalSteps: workflow.steps.length,
            progress: workflow.steps.length > 0 ? (workflow.currentStep / workflow.steps.length) * 100 : 0,
            createdAt: workflow.createdAt,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            retryCount: workflow.retryCount,
            error: workflow.error,
            steps: workflow.steps.map(step => ({
                name: step.name,
                state: step.state,
                startedAt: step.startedAt,
                completedAt: step.completedAt,
                error: step.error
            }))
        };
    }

    /**
     * Get manager status
     * @returns {Object} Manager status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            shuttingDown: this.isShuttingDown,
            healthy: this.isInitialized && !this.isShuttingDown,
            activeWorkflows: this.activeWorkflows.size,
            queuedWorkflows: this.workflowQueue.length,
            totalWorkflows: this.workflows.size,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Shutdown the Workflow Manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        try {
            log('info', 'Shutting down Workflow Manager...');
            this.isShuttingDown = true;

            // Cancel all active workflows
            for (const workflowId of this.activeWorkflows) {
                try {
                    await this.cancelWorkflow(workflowId);
                } catch (error) {
                    log('warn', `Failed to cancel workflow ${workflowId} during shutdown:`, error);
                }
            }

            this.emit('shutdown');
            log('info', 'Workflow Manager shutdown complete');

        } catch (error) {
            log('error', 'Error during Workflow Manager shutdown:', error);
            throw error;
        }
    }

    /**
     * Execute a workflow
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _executeWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        
        workflow.state = WorkflowState.RUNNING;
        workflow.startedAt = new Date().toISOString();
        workflow.updatedAt = new Date().toISOString();
        
        this.activeWorkflows.add(workflowId);

        this.emit('workflowStarted', { workflowId, workflow });

        try {
            // Execute steps sequentially or in parallel based on configuration
            if (this.config.enableParallelExecution && workflow.config.parallel) {
                await this._executeStepsParallel(workflowId);
            } else {
                await this._executeStepsSequential(workflowId);
            }

            await this._completeWorkflow(workflowId);

        } catch (error) {
            await this._failWorkflow(workflowId, error);
        }
    }

    /**
     * Execute workflow steps sequentially
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _executeStepsSequential(workflowId) {
        const workflow = this.workflows.get(workflowId);

        for (let i = workflow.currentStep; i < workflow.steps.length; i++) {
            if (workflow.state === WorkflowState.PAUSED) {
                break;
            }

            workflow.currentStep = i;
            await this._executeStep(workflowId, i);
        }
    }

    /**
     * Execute workflow steps in parallel
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _executeStepsParallel(workflowId) {
        const workflow = this.workflows.get(workflowId);
        const stepPromises = [];

        for (let i = workflow.currentStep; i < workflow.steps.length; i++) {
            stepPromises.push(this._executeStep(workflowId, i));
        }

        await Promise.all(stepPromises);
    }

    /**
     * Execute a single workflow step
     * @param {string} workflowId - Workflow ID
     * @param {number} stepIndex - Step index
     * @private
     */
    async _executeStep(workflowId, stepIndex) {
        const workflow = this.workflows.get(workflowId);
        const step = workflow.steps[stepIndex];

        try {
            log('debug', `Executing step ${stepIndex}: ${step.name} for workflow ${workflowId}`);

            step.state = StepState.RUNNING;
            step.startedAt = new Date().toISOString();

            this.emit('stepStarted', { workflowId, stepIndex, step });

            // Execute step based on type
            let result;
            switch (step.type) {
                case 'task':
                    result = await this._executeTaskStep(workflowId, step);
                    break;
                case 'condition':
                    result = await this._executeConditionStep(workflowId, step);
                    break;
                case 'parallel':
                    result = await this._executeParallelStep(workflowId, step);
                    break;
                case 'delay':
                    result = await this._executeDelayStep(workflowId, step);
                    break;
                default:
                    throw new Error(`Unknown step type: ${step.type}`);
            }

            step.state = StepState.COMPLETED;
            step.completedAt = new Date().toISOString();
            step.result = result;

            this.emit('stepCompleted', { workflowId, stepIndex, step, result });
            log('debug', `Step ${stepIndex} completed for workflow ${workflowId}`);

        } catch (error) {
            step.state = StepState.FAILED;
            step.error = error.message;
            step.completedAt = new Date().toISOString();

            this.emit('stepFailed', { workflowId, stepIndex, step, error });
            log('error', `Step ${stepIndex} failed for workflow ${workflowId}:`, error);

            throw error;
        }
    }

    /**
     * Execute a task step
     * @param {string} workflowId - Workflow ID
     * @param {Object} step - Step definition
     * @returns {Promise<any>} Step result
     * @private
     */
    async _executeTaskStep(workflowId, step) {
        // Emit task execution request
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Step timeout: ${step.name}`));
            }, this.config.stepTimeout);

            this.emit('executeTask', {
                workflowId,
                step,
                callback: (error, result) => {
                    clearTimeout(timeout);
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            });
        });
    }

    /**
     * Execute a condition step
     * @param {string} workflowId - Workflow ID
     * @param {Object} step - Step definition
     * @returns {Promise<boolean>} Condition result
     * @private
     */
    async _executeConditionStep(workflowId, step) {
        // Evaluate condition
        const condition = step.condition;
        if (typeof condition === 'function') {
            return await condition();
        } else if (typeof condition === 'string') {
            // Simple string evaluation (could be enhanced)
            return eval(condition);
        }
        return Boolean(condition);
    }

    /**
     * Execute a parallel step
     * @param {string} workflowId - Workflow ID
     * @param {Object} step - Step definition
     * @returns {Promise<Array>} Parallel results
     * @private
     */
    async _executeParallelStep(workflowId, step) {
        const promises = step.steps.map(subStep => 
            this._executeStep(workflowId, { ...subStep, parentStep: step.name })
        );
        return await Promise.all(promises);
    }

    /**
     * Execute a delay step
     * @param {string} workflowId - Workflow ID
     * @param {Object} step - Step definition
     * @returns {Promise<void>}
     * @private
     */
    async _executeDelayStep(workflowId, step) {
        const delay = step.delay || 1000;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Complete a workflow
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _completeWorkflow(workflowId) {
        const workflow = this.workflows.get(workflowId);
        
        workflow.state = WorkflowState.COMPLETED;
        workflow.completedAt = new Date().toISOString();
        workflow.updatedAt = new Date().toISOString();

        this.activeWorkflows.delete(workflowId);
        this.metrics.completed++;

        this.emit('workflowCompleted', { workflowId, workflow });
        log('info', `Workflow completed: ${workflowId}`);

        // Process next workflow in queue
        await this._processQueue();
    }

    /**
     * Fail a workflow
     * @param {string} workflowId - Workflow ID
     * @param {Error} error - Error that caused failure
     * @private
     */
    async _failWorkflow(workflowId, error) {
        const workflow = this.workflows.get(workflowId);
        
        workflow.state = WorkflowState.FAILED;
        workflow.error = error.message;
        workflow.completedAt = new Date().toISOString();
        workflow.updatedAt = new Date().toISOString();

        this.activeWorkflows.delete(workflowId);
        this.metrics.failed++;

        this.emit('workflowFailed', { workflowId, workflow, error });
        log('error', `Workflow failed: ${workflowId} - ${error.message}`);

        // Attempt retry if enabled
        if (this.config.enableRetry && workflow.retryCount < this.config.maxRetryAttempts) {
            setTimeout(async () => {
                try {
                    await this.retryWorkflow(workflowId);
                } catch (retryError) {
                    log('error', `Failed to retry workflow ${workflowId}:`, retryError);
                }
            }, this.config.retryDelay);
        } else {
            // Process next workflow in queue
            await this._processQueue();
        }
    }

    /**
     * Process workflow steps
     * @param {Array} steps - Raw steps
     * @returns {Array} Processed steps
     * @private
     */
    _processSteps(steps) {
        return steps.map((step, index) => ({
            id: step.id || `step-${index}`,
            name: step.name || `Step ${index + 1}`,
            type: step.type || 'task',
            state: StepState.PENDING,
            config: step.config || {},
            dependencies: step.dependencies || [],
            condition: step.condition,
            retryCount: 0,
            startedAt: null,
            completedAt: null,
            error: null,
            result: null,
            ...step
        }));
    }

    /**
     * Queue a workflow for execution
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _queueWorkflow(workflowId) {
        if (!this.workflowQueue.includes(workflowId)) {
            this.workflowQueue.push(workflowId);
            log('debug', `Workflow queued: ${workflowId}`);
        }
    }

    /**
     * Process workflow queue
     * @private
     */
    async _processQueue() {
        if (this.workflowQueue.length === 0 || this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
            return;
        }

        const workflowId = this.workflowQueue.shift();
        if (workflowId) {
            try {
                await this._executeWorkflow(workflowId);
            } catch (error) {
                log('error', `Failed to execute queued workflow ${workflowId}:`, error);
            }
        }
    }

    /**
     * Continue a paused workflow
     * @param {string} workflowId - Workflow ID
     * @private
     */
    async _continueWorkflow(workflowId) {
        await this._executeWorkflow(workflowId);
    }

    /**
     * Initialize storage
     * @private
     */
    async _initializeStorage() {
        // Initialize workflow storage (could be database, file system, etc.)
        log('debug', 'Workflow storage initialized');
    }

    /**
     * Recover workflows from storage
     * @private
     */
    async _recoverWorkflows() {
        // Recover workflows from storage on startup
        log('debug', 'Workflow recovery completed');
    }

    /**
     * Ensure the manager is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Workflow Manager not initialized');
        }

        if (this.isShuttingDown) {
            throw new Error('Workflow Manager is shutting down');
        }
    }
}

export default WorkflowManager;

