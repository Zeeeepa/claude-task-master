/**
 * Workflow Engine
 * Main orchestration system for managing complex multi-step CI/CD workflows
 */

import { EventEmitter } from 'events';
import { StateManager } from './state_manager.js';
import { StepExecutor } from './step_executor.js';
import { DependencyResolver } from './dependency_resolver.js';
import { ParallelProcessor } from './parallel_processor.js';
import { WORKFLOW_DEFINITIONS, validateWorkflowDefinition } from './workflow_definition.js';

export class WorkflowEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxConcurrentWorkflows: config.maxConcurrentWorkflows || 10,
            defaultTimeout: config.defaultTimeout || 3600000, // 1 hour
            enableMetrics: config.enableMetrics || true,
            enableRecovery: config.enableRecovery || true,
            retryPolicy: {
                maxRetries: config.maxRetries || 3,
                retryDelay: config.retryDelay || 5000,
                backoffMultiplier: config.backoffMultiplier || 2
            },
            ...config
        };

        // Initialize core components
        this.stateManager = new StateManager(config.database, config.stateManager);
        this.stepExecutor = new StepExecutor(config.agentManager, config.stepExecutor);
        this.dependencyResolver = new DependencyResolver();
        this.parallelProcessor = new ParallelProcessor(this.stepExecutor, config.parallelProcessor);

        // Workflow management
        this.activeWorkflows = new Map();
        this.workflowQueue = [];
        this.metrics = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0,
            currentlyActive: 0
        };

        this.setupEventHandlers();
        this.setupPeriodicTasks();
    }

    /**
     * Executes a workflow
     * @param {string} workflowId - Workflow definition ID
     * @param {Object} context - Execution context
     * @param {Object} options - Execution options
     * @returns {Object} Workflow execution result
     */
    async executeWorkflow(workflowId, context = {}, options = {}) {
        const executionId = this.generateExecutionId();
        const startTime = Date.now();

        try {
            // Get and validate workflow definition
            const workflow = this.getWorkflowDefinition(workflowId);
            this.validateWorkflowExecution(workflow, context, options);

            // Check concurrency limits
            await this.checkConcurrencyLimits();

            // Initialize workflow state
            const state = await this.stateManager.initializeWorkflow(
                executionId, 
                workflow, 
                this.prepareExecutionContext(context, options)
            );

            // Add to active workflows
            this.activeWorkflows.set(executionId, {
                workflow,
                state,
                startTime,
                options
            });

            this.metrics.totalExecutions++;
            this.metrics.currentlyActive++;

            this.emit('workflow_started', { 
                executionId, 
                workflowId, 
                context: this.sanitizeContext(context) 
            });

            // Execute the workflow
            const result = await this.processWorkflow(state, workflow, options);

            // Complete workflow
            await this.stateManager.completeWorkflow(executionId, result);
            
            const duration = Date.now() - startTime;
            this.updateMetrics(true, duration);

            this.emit('workflow_completed', { 
                executionId, 
                workflowId, 
                result, 
                duration 
            });

            return {
                executionId,
                workflowId,
                status: 'completed',
                result,
                duration,
                startTime: new Date(startTime),
                endTime: new Date()
            };

        } catch (error) {
            await this.handleWorkflowFailure(executionId, workflowId, error, startTime);
            throw error;
        } finally {
            this.activeWorkflows.delete(executionId);
            this.metrics.currentlyActive--;
        }
    }

    /**
     * Processes a workflow through its execution plan
     * @param {Object} state - Workflow state
     * @param {Object} workflow - Workflow definition
     * @param {Object} options - Execution options
     * @returns {Object} Workflow execution result
     */
    async processWorkflow(state, workflow, options) {
        // Create execution plan
        const executionPlan = this.dependencyResolver.createExecutionPlan(workflow.steps);
        
        this.emit('execution_plan_created', { 
            executionId: state.execution_id,
            planSize: executionPlan.length,
            totalSteps: workflow.steps.length
        });

        const results = {};
        let batchIndex = 0;

        // Execute each batch in the plan
        for (const batch of executionPlan) {
            batchIndex++;
            
            this.emit('batch_starting', { 
                executionId: state.execution_id,
                batchIndex,
                totalBatches: executionPlan.length,
                stepCount: batch.length
            });

            try {
                let batchResults;

                if (batch.length === 1) {
                    // Sequential execution
                    const step = batch[0];
                    const stepResult = await this.stepExecutor.executeStep(
                        step, 
                        state.context, 
                        state
                    );
                    
                    batchResults = [stepResult];
                    await this.stateManager.updateStepResult(
                        state.execution_id, 
                        step.id, 
                        stepResult
                    );
                } else {
                    // Parallel execution
                    batchResults = await this.parallelProcessor.executeBatch(
                        batch, 
                        state.context, 
                        state
                    );
                    
                    // Update state for all completed steps
                    for (let i = 0; i < batch.length; i++) {
                        const step = batch[i];
                        const result = batchResults[i];
                        
                        if (result && result.success !== false) {
                            await this.stateManager.updateStepResult(
                                state.execution_id, 
                                step.id, 
                                result
                            );
                        } else {
                            await this.stateManager.updateStepFailure(
                                state.execution_id, 
                                step.id, 
                                new Error(result?.error || 'Step execution failed')
                            );
                        }
                    }
                }

                // Collect results
                for (let i = 0; i < batch.length; i++) {
                    const step = batch[i];
                    const result = batchResults[i];
                    results[step.id] = result;
                }

                // Update workflow progress
                await this.stateManager.updateWorkflowProgress(state);

                // Check for early termination conditions
                if (options.failFast && batchResults.some(r => r.success === false)) {
                    throw new Error('Workflow terminated due to step failure (fail-fast mode)');
                }

            } catch (error) {
                // Handle batch failure
                await this.handleBatchFailure(state, batch, error, batchIndex);
                
                if (!this.shouldContinueAfterFailure(workflow, error, options)) {
                    throw error;
                }
            }
        }

        return {
            success: true,
            stepResults: results,
            executionPlan: executionPlan.map(batch => batch.map(step => step.id)),
            metrics: await this.calculateWorkflowMetrics(state),
            completedAt: new Date()
        };
    }

    /**
     * Pauses a running workflow
     * @param {string} executionId - Execution ID to pause
     * @param {string} reason - Reason for pausing
     * @returns {boolean} True if successfully paused
     */
    async pauseWorkflow(executionId, reason = 'manual_pause') {
        const workflowExecution = this.activeWorkflows.get(executionId);
        if (!workflowExecution) {
            throw new Error(`Workflow not found: ${executionId}`);
        }

        await this.stateManager.pauseWorkflow(executionId, reason);
        
        this.emit('workflow_paused', { executionId, reason });
        return true;
    }

    /**
     * Resumes a paused workflow
     * @param {string} executionId - Execution ID to resume
     * @returns {boolean} True if successfully resumed
     */
    async resumeWorkflow(executionId) {
        const state = await this.stateManager.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        if (state.status !== 'paused') {
            throw new Error(`Cannot resume workflow in status: ${state.status}`);
        }

        await this.stateManager.resumeWorkflow(executionId);
        
        // Continue execution from where it left off
        const workflow = this.getWorkflowDefinition(state.workflow_id);
        const remainingSteps = this.getRemainingSteps(workflow, state);
        
        if (remainingSteps.length > 0) {
            // Re-add to active workflows and continue processing
            this.activeWorkflows.set(executionId, {
                workflow,
                state,
                startTime: Date.now(),
                options: { resumed: true }
            });

            // Continue processing in background
            this.continueWorkflowExecution(state, workflow, remainingSteps);
        }

        this.emit('workflow_resumed', { executionId });
        return true;
    }

    /**
     * Cancels a running workflow
     * @param {string} executionId - Execution ID to cancel
     * @param {string} reason - Reason for cancellation
     * @returns {boolean} True if successfully cancelled
     */
    async cancelWorkflow(executionId, reason = 'manual_cancellation') {
        const workflowExecution = this.activeWorkflows.get(executionId);
        if (!workflowExecution) {
            throw new Error(`Workflow not found: ${executionId}`);
        }

        // Cancel any running steps
        await this.cancelActiveSteps(executionId);

        // Update state
        await this.stateManager.failWorkflow(
            executionId, 
            new Error(`Workflow cancelled: ${reason}`)
        );

        this.activeWorkflows.delete(executionId);
        this.metrics.currentlyActive--;

        this.emit('workflow_cancelled', { executionId, reason });
        return true;
    }

    /**
     * Gets the status of a workflow execution
     * @param {string} executionId - Execution ID
     * @returns {Object} Workflow status
     */
    async getWorkflowStatus(executionId) {
        const state = await this.stateManager.getState(executionId);
        if (!state) {
            return null;
        }

        const activeExecution = this.activeWorkflows.get(executionId);
        
        return {
            executionId,
            workflowId: state.workflow_id,
            status: state.status,
            progress: state.progress || { percentage: 0 },
            startedAt: state.started_at,
            updatedAt: state.updated_at,
            currentStep: state.current_step,
            totalSteps: state.total_steps,
            stepStates: state.step_states,
            errorLog: state.error_log,
            isActive: !!activeExecution,
            metrics: state.metrics
        };
    }

    /**
     * Lists all active workflows
     * @returns {Array} Array of active workflow information
     */
    getActiveWorkflows() {
        return Array.from(this.activeWorkflows.entries()).map(([executionId, execution]) => ({
            executionId,
            workflowId: execution.workflow.id,
            status: execution.state.status,
            startTime: execution.startTime,
            currentStep: execution.state.current_step,
            totalSteps: execution.state.total_steps
        }));
    }

    /**
     * Recovers workflows from system restart
     * @returns {Array} Array of recovered workflow IDs
     */
    async recoverWorkflows() {
        if (!this.config.enableRecovery) {
            return [];
        }

        // This would query the database for workflows that were running
        // when the system shut down and attempt to recover them
        const recoveredWorkflows = [];
        
        this.emit('workflows_recovered', { count: recoveredWorkflows.length });
        return recoveredWorkflows;
    }

    /**
     * Gets workflow execution metrics
     * @returns {Object} Execution metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeWorkflows: this.activeWorkflows.size,
            queuedWorkflows: this.workflowQueue.length,
            systemUptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Gets a workflow definition by ID
     * @param {string} workflowId - Workflow ID
     * @returns {Object} Workflow definition
     */
    getWorkflowDefinition(workflowId) {
        const workflow = WORKFLOW_DEFINITIONS[workflowId];
        if (!workflow) {
            throw new Error(`Workflow definition not found: ${workflowId}`);
        }
        return workflow;
    }

    /**
     * Validates workflow execution parameters
     * @param {Object} workflow - Workflow definition
     * @param {Object} context - Execution context
     * @param {Object} options - Execution options
     */
    validateWorkflowExecution(workflow, context, options) {
        // Validate workflow definition
        const validation = validateWorkflowDefinition(workflow);
        if (!validation.valid) {
            throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
        }

        // Validate required context
        if (workflow.required_context) {
            for (const field of workflow.required_context) {
                if (!(field in context)) {
                    throw new Error(`Required context field missing: ${field}`);
                }
            }
        }

        // Validate resource limits
        if (workflow.resource_limits && options.enforceResourceLimits !== false) {
            this.validateResourceLimits(workflow.resource_limits);
        }
    }

    /**
     * Checks concurrency limits
     */
    async checkConcurrencyLimits() {
        if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
            throw new Error(
                `Maximum concurrent workflows reached: ${this.config.maxConcurrentWorkflows}`
            );
        }
    }

    /**
     * Prepares execution context
     * @param {Object} context - Base context
     * @param {Object} options - Execution options
     * @returns {Object} Prepared context
     */
    prepareExecutionContext(context, options) {
        return {
            ...context,
            execution_options: options,
            system_info: {
                node_version: process.version,
                platform: process.platform,
                timestamp: new Date(),
                engine_version: '1.0.0'
            }
        };
    }

    /**
     * Handles workflow failure
     * @param {string} executionId - Execution ID
     * @param {string} workflowId - Workflow ID
     * @param {Error} error - Error that occurred
     * @param {number} startTime - Workflow start time
     */
    async handleWorkflowFailure(executionId, workflowId, error, startTime) {
        try {
            await this.stateManager.failWorkflow(executionId, error);
        } catch (stateError) {
            this.emit('error', { 
                type: 'state_management_error', 
                executionId, 
                error: stateError 
            });
        }

        const duration = Date.now() - startTime;
        this.updateMetrics(false, duration);

        this.emit('workflow_failed', { 
            executionId, 
            workflowId, 
            error, 
            duration 
        });
    }

    /**
     * Handles batch execution failure
     * @param {Object} state - Workflow state
     * @param {Array} batch - Failed batch
     * @param {Error} error - Error that occurred
     * @param {number} batchIndex - Index of the failed batch
     */
    async handleBatchFailure(state, batch, error, batchIndex) {
        this.emit('batch_failed', { 
            executionId: state.execution_id,
            batchIndex,
            stepIds: batch.map(s => s.id),
            error
        });

        // Log failure for each step in the batch
        for (const step of batch) {
            await this.stateManager.updateStepFailure(state.execution_id, step.id, error);
        }
    }

    /**
     * Determines if workflow should continue after failure
     * @param {Object} workflow - Workflow definition
     * @param {Error} error - Error that occurred
     * @param {Object} options - Execution options
     * @returns {boolean} True if should continue
     */
    shouldContinueAfterFailure(workflow, error, options) {
        if (options.failFast) {
            return false;
        }

        const errorHandling = workflow.error_handling || {};
        return errorHandling.strategy === 'continue_on_failure';
    }

    /**
     * Gets remaining steps for a workflow
     * @param {Object} workflow - Workflow definition
     * @param {Object} state - Current state
     * @returns {Array} Remaining steps
     */
    getRemainingSteps(workflow, state) {
        return workflow.steps.filter(step => 
            !state.step_states[step.id] || 
            state.step_states[step.id] === 'failed'
        );
    }

    /**
     * Continues workflow execution after resume
     * @param {Object} state - Workflow state
     * @param {Object} workflow - Workflow definition
     * @param {Array} remainingSteps - Steps to execute
     */
    async continueWorkflowExecution(state, workflow, remainingSteps) {
        try {
            // Create execution plan for remaining steps
            const executionPlan = this.dependencyResolver.createExecutionPlan(remainingSteps);
            
            // Continue processing
            await this.processWorkflow(state, { ...workflow, steps: remainingSteps }, { resumed: true });
            
        } catch (error) {
            await this.handleWorkflowFailure(state.execution_id, workflow.id, error, Date.now());
        }
    }

    /**
     * Cancels active steps for a workflow
     * @param {string} executionId - Execution ID
     */
    async cancelActiveSteps(executionId) {
        // This would cancel any currently executing steps
        // Implementation depends on step executor capabilities
    }

    /**
     * Calculates workflow execution metrics
     * @param {Object} state - Workflow state
     * @returns {Object} Calculated metrics
     */
    async calculateWorkflowMetrics(state) {
        const stepResults = Object.values(state.step_results);
        const totalDuration = stepResults.reduce((sum, result) => 
            sum + (result.duration || 0), 0
        );

        return {
            totalSteps: state.total_steps,
            completedSteps: stepResults.length,
            failedSteps: state.error_log.length,
            totalDuration,
            averageStepDuration: stepResults.length > 0 ? totalDuration / stepResults.length : 0,
            resourceUsage: state.resource_usage
        };
    }

    /**
     * Updates execution metrics
     * @param {boolean} success - Whether execution was successful
     * @param {number} duration - Execution duration
     */
    updateMetrics(success, duration) {
        if (success) {
            this.metrics.successfulExecutions++;
        } else {
            this.metrics.failedExecutions++;
        }

        // Update average execution time
        const totalExecutions = this.metrics.successfulExecutions + this.metrics.failedExecutions;
        this.metrics.averageExecutionTime = 
            (this.metrics.averageExecutionTime * (totalExecutions - 1) + duration) / totalExecutions;
    }

    /**
     * Validates resource limits
     * @param {Object} limits - Resource limits to validate
     */
    validateResourceLimits(limits) {
        // This would validate against system capabilities
        // For now, just check format
        if (limits.memory && typeof limits.memory !== 'string') {
            throw new Error('Memory limit must be a string (e.g., "2GB")');
        }
    }

    /**
     * Sanitizes context for logging
     * @param {Object} context - Context to sanitize
     * @returns {Object} Sanitized context
     */
    sanitizeContext(context) {
        const sanitized = { ...context };
        delete sanitized.password;
        delete sanitized.token;
        delete sanitized.secret;
        delete sanitized.api_key;
        return sanitized;
    }

    /**
     * Generates a unique execution ID
     * @returns {string} Unique execution ID
     */
    generateExecutionId() {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sets up event handlers for component integration
     */
    setupEventHandlers() {
        // State manager events
        this.stateManager.on('workflow_initialized', (data) => {
            this.emit('workflow_state_initialized', data);
        });

        this.stateManager.on('step_completed', (data) => {
            this.emit('step_state_updated', data);
        });

        // Step executor events
        this.stepExecutor.on('step_started', (data) => {
            this.emit('step_execution_started', data);
        });

        this.stepExecutor.on('step_completed', (data) => {
            this.emit('step_execution_completed', data);
        });

        // Parallel processor events
        this.parallelProcessor.on('batch_started', (data) => {
            this.emit('parallel_batch_started', data);
        });

        this.parallelProcessor.on('batch_completed', (data) => {
            this.emit('parallel_batch_completed', data);
        });
    }

    /**
     * Sets up periodic maintenance tasks
     */
    setupPeriodicTasks() {
        // Cleanup old workflow states
        setInterval(async () => {
            try {
                await this.stateManager.cleanupOldStates();
            } catch (error) {
                this.emit('error', { type: 'cleanup_error', error });
            }
        }, 3600000); // Every hour

        // Emit metrics
        if (this.config.enableMetrics) {
            setInterval(() => {
                this.emit('metrics_update', this.getMetrics());
            }, 30000); // Every 30 seconds
        }
    }

    /**
     * Cleanup resources and shutdown gracefully
     */
    async destroy() {
        // Cancel all active workflows
        const activeIds = Array.from(this.activeWorkflows.keys());
        await Promise.all(activeIds.map(id => 
            this.cancelWorkflow(id, 'system_shutdown')
        ));

        // Cleanup components
        await this.stateManager.destroy();
        this.stepExecutor.destroy();
        this.parallelProcessor.destroy();

        this.removeAllListeners();
    }
}

