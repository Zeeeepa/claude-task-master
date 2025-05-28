/**
 * @fileoverview Base Workflow Implementation
 * @description Abstract base class for all workflow types
 */

/**
 * Base Workflow class that all workflows must extend
 */
export class BaseWorkflow {
    constructor(context) {
        if (this.constructor === BaseWorkflow) {
            throw new Error('BaseWorkflow is abstract and cannot be instantiated directly');
        }

        this.context = context || {};
        this.orchestrator = context.orchestrator;
        this.eventBus = context.eventBus;
        this.steps = [];
        this.currentStep = 0;
        this.stepResults = [];
        this.metadata = {};
        this.status = 'created';
        this.id = null;
        this.createdAt = new Date();
        this.startedAt = null;
        this.completedAt = null;
        this.failedAt = null;
        this.error = null;
    }

    /**
     * Execute the workflow
     * @returns {Promise<Object>} Workflow execution result
     */
    async execute() {
        try {
            this.status = 'running';
            this.startedAt = new Date();
            
            // Validate context before execution
            this.validateContext();
            
            // Execute all steps
            for (let i = 0; i < this.steps.length; i++) {
                this.currentStep = i;
                const step = this.steps[i];
                
                await this._executeStepWithRetry(step, i);
            }
            
            // Build final result
            const result = this.buildResult();
            
            this.status = 'completed';
            this.completedAt = new Date();
            
            return result;
            
        } catch (error) {
            this.status = 'failed';
            this.failedAt = new Date();
            this.error = error;
            throw error;
        }
    }

    /**
     * Execute a single step with retry logic
     * @param {Object} step - Step to execute
     * @param {number} stepIndex - Step index
     * @private
     */
    async _executeStepWithRetry(step, stepIndex) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
            try {
                // Emit step started event
                if (this.eventBus) {
                    this.eventBus.emit('workflow.step.started', {
                        workflowId: this.id,
                        step: step.name,
                        stepIndex,
                        attempt: attempt + 1,
                        maxRetries: step.maxRetries + 1
                    });
                }
                
                // Execute step with timeout
                const result = await this._executeStepWithTimeout(step, stepIndex);
                this.stepResults[stepIndex] = result;
                
                // Emit step completed event
                if (this.eventBus) {
                    this.eventBus.emit('workflow.step.completed', {
                        workflowId: this.id,
                        step: step.name,
                        stepIndex,
                        result,
                        attempt: attempt + 1
                    });
                }
                
                // Step succeeded, break retry loop
                return;
                
            } catch (error) {
                lastError = error;
                step.retryCount = attempt + 1;
                
                // Emit step failed event
                if (this.eventBus) {
                    this.eventBus.emit('workflow.step.failed', {
                        workflowId: this.id,
                        step: step.name,
                        stepIndex,
                        error: error.message,
                        attempt: attempt + 1,
                        willRetry: step.retryable && attempt < step.maxRetries
                    });
                }
                
                // If not retryable or max retries reached, throw error
                if (!step.retryable || attempt >= step.maxRetries) {
                    throw error;
                }
                
                // Wait before retry
                if (step.retryDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, step.retryDelay));
                }
            }
        }
        
        // If we get here, all retries failed
        throw lastError;
    }

    /**
     * Execute step with timeout
     * @param {Object} step - Step to execute
     * @param {number} stepIndex - Step index
     * @returns {Promise} Step result
     * @private
     */
    async _executeStepWithTimeout(step, stepIndex) {
        if (step.timeout <= 0) {
            return await this.executeStep(step);
        }
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Step '${step.name}' timed out after ${step.timeout}ms`));
            }, step.timeout);
            
            this.executeStep(step)
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Execute a single step (to be overridden by subclasses)
     * @param {Object} step - Step to execute
     * @returns {Promise<*>} Step execution result
     */
    async executeStep(step) {
        return await step.execute(this.context, this.stepResults);
    }

    /**
     * Validate workflow context (to be overridden by subclasses)
     * @throws {Error} If context is invalid
     */
    validateContext() {
        // Base validation - subclasses should override for specific validation
        if (!this.context) {
            throw new Error('Workflow context is required');
        }
    }

    /**
     * Build final workflow result (to be overridden by subclasses)
     * @returns {Object} Final workflow result
     */
    buildResult() {
        return {
            workflowId: this.id,
            status: this.status,
            steps: this.stepResults,
            metadata: this.metadata,
            executionTime: this.completedAt ? this.completedAt - this.startedAt : null,
            totalSteps: this.steps.length,
            completedSteps: this.stepResults.length,
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt
        };
    }

    /**
     * Get workflow progress percentage
     * @returns {number} Progress percentage (0-100)
     */
    getProgress() {
        if (this.steps.length === 0) {
            return this.status === 'completed' ? 100 : 0;
        }
        
        return (this.currentStep / this.steps.length) * 100;
    }

    /**
     * Add a step to the workflow
     * @param {string} name - Step name
     * @param {Function} executeFunction - Step execution function
     * @param {Object} options - Step options
     */
    addStep(name, executeFunction, options = {}) {
        if (typeof executeFunction !== 'function') {
            throw new Error('Step execute function must be a function');
        }

        const step = {
            name,
            execute: executeFunction,
            retryable: options.retryable || false,
            maxRetries: options.maxRetries || 3,
            retryCount: 0,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 30000,
            metadata: options.metadata || {},
            dependencies: options.dependencies || [],
            condition: options.condition || null
        };

        this.steps.push(step);
    }

    /**
     * Insert a step at a specific position
     * @param {number} index - Position to insert step
     * @param {string} name - Step name
     * @param {Function} executeFunction - Step execution function
     * @param {Object} options - Step options
     */
    insertStep(index, name, executeFunction, options = {}) {
        if (index < 0 || index > this.steps.length) {
            throw new Error('Invalid step index');
        }

        const step = {
            name,
            execute: executeFunction,
            retryable: options.retryable || false,
            maxRetries: options.maxRetries || 3,
            retryCount: 0,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 30000,
            metadata: options.metadata || {},
            dependencies: options.dependencies || [],
            condition: options.condition || null
        };

        this.steps.splice(index, 0, step);
    }

    /**
     * Remove a step by name
     * @param {string} stepName - Name of step to remove
     * @returns {boolean} True if step was removed
     */
    removeStep(stepName) {
        const index = this.steps.findIndex(step => step.name === stepName);
        if (index !== -1) {
            this.steps.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get step by name
     * @param {string} stepName - Name of step to find
     * @returns {Object|null} Step object or null if not found
     */
    getStep(stepName) {
        return this.steps.find(step => step.name === stepName) || null;
    }

    /**
     * Get all step names
     * @returns {Array<string>} Array of step names
     */
    getStepNames() {
        return this.steps.map(step => step.name);
    }

    /**
     * Check if workflow can be paused
     * @returns {boolean} True if workflow can be paused
     */
    canPause() {
        return this.status === 'running';
    }

    /**
     * Check if workflow can be resumed
     * @returns {boolean} True if workflow can be resumed
     */
    canResume() {
        return this.status === 'paused';
    }

    /**
     * Pause workflow execution
     */
    pause() {
        if (this.canPause()) {
            this.status = 'paused';
            this.pausedAt = new Date();
        }
    }

    /**
     * Resume workflow execution
     */
    resume() {
        if (this.canResume()) {
            this.status = 'running';
            this.resumedAt = new Date();
        }
    }

    /**
     * Cancel workflow execution
     * @param {string} reason - Cancellation reason
     */
    cancel(reason = 'Cancelled by user') {
        this.status = 'cancelled';
        this.cancelledAt = new Date();
        this.cancellationReason = reason;
    }

    /**
     * Get workflow summary
     * @returns {Object} Workflow summary
     */
    getSummary() {
        return {
            id: this.id,
            status: this.status,
            progress: this.getProgress(),
            totalSteps: this.steps.length,
            currentStep: this.currentStep,
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            failedAt: this.failedAt,
            executionTime: this.startedAt ? 
                (this.completedAt || this.failedAt || new Date()) - this.startedAt : null,
            error: this.error ? this.error.message : null
        };
    }
}

export default BaseWorkflow;

