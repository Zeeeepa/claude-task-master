/**
 * @fileoverview Core Workflow Orchestrator
 * @description Main orchestrator class that manages complete task lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import { WORKFLOW_STATES, WORKFLOW_PRIORITY } from './types.js';
import { WorkflowStateManager } from '../state_manager/WorkflowStateManager.js';
import { WorkflowEngine } from '../workflow_engine/WorkflowEngine.js';

/**
 * Core workflow orchestration interface
 * Manages complete task lifecycle from creation to completion
 */
export class WorkflowOrchestrator {
    constructor(options = {}) {
        this.stateManager = new WorkflowStateManager(options.stateManager);
        this.workflowEngine = new WorkflowEngine(options.workflowEngine);
        this.workflows = new Map(); // In-memory workflow storage
        this.eventHandlers = new Map();
        this.config = {
            maxConcurrentWorkflows: options.maxConcurrentWorkflows || 50,
            defaultTimeout: options.defaultTimeout || 900000, // 15 minutes
            retryAttempts: options.retryAttempts || 3,
            ...options.config
        };
        
        this._setupEventHandlers();
    }

    /**
     * Start a new task workflow
     * @param {string} task_id - Task identifier
     * @param {Object} options - Workflow options
     * @returns {Promise<import('./types.js').WorkflowInstance>}
     */
    async start_task_workflow(task_id, options = {}) {
        try {
            const workflow_id = uuidv4();
            const now = new Date();
            
            // Create workflow instance
            const workflow = {
                id: workflow_id,
                task_id,
                current_state: 'CREATED',
                steps: this._generateWorkflowSteps(task_id, options),
                context: {
                    task_id,
                    created_by: options.created_by || 'system',
                    ...options.context
                },
                priority: options.priority || WORKFLOW_PRIORITY.NORMAL,
                created_at: now,
                metadata: {
                    source: options.source || 'api',
                    version: '1.0.0',
                    ...options.metadata
                }
            };

            // Store workflow
            this.workflows.set(workflow_id, workflow);
            
            // Initialize state management
            await this.stateManager.initialize_workflow_state(workflow_id, workflow);
            
            // Start workflow execution
            await this._startWorkflowExecution(workflow);
            
            return workflow;
        } catch (error) {
            throw new Error(`Failed to start workflow for task ${task_id}: ${error.message}`);
        }
    }

    /**
     * Get workflow status
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<import('./types.js').WorkflowStatus>}
     */
    async get_workflow_status(workflow_id) {
        const workflow = this.workflows.get(workflow_id);
        if (!workflow) {
            throw new Error(`Workflow ${workflow_id} not found`);
        }

        const state = await this.stateManager.get_current_state(workflow_id);
        const completedSteps = workflow.steps.filter(step => step.status === 'completed');
        const pendingSteps = workflow.steps.filter(step => step.status === 'pending');
        const currentStep = workflow.steps.find(step => step.status === 'running');

        const progress = workflow.steps.length > 0 
            ? Math.round((completedSteps.length / workflow.steps.length) * 100)
            : 0;

        return {
            workflow_id,
            current_state: state.current_state,
            progress_percentage: progress,
            completed_steps: completedSteps,
            pending_steps: pendingSteps,
            current_step: currentStep,
            last_updated: state.last_updated,
            metrics: await this._calculateMetrics(workflow_id)
        };
    }

    /**
     * Advance workflow state
     * @param {string} workflow_id - Workflow identifier
     * @param {import('./types.js').WorkflowEvent} event - Workflow event
     */
    async advance_workflow_state(workflow_id, event) {
        try {
            const workflow = this.workflows.get(workflow_id);
            if (!workflow) {
                throw new Error(`Workflow ${workflow_id} not found`);
            }

            // Validate state transition
            const currentState = await this.stateManager.get_current_state(workflow_id);
            const newState = this._determineNextState(currentState.current_state, event);
            
            if (!newState) {
                throw new Error(`Invalid state transition from ${currentState.current_state} with event ${event.type}`);
            }

            // Perform state transition
            const transitionSuccess = await this.stateManager.transition_state(
                workflow_id, 
                currentState.current_state, 
                newState
            );

            if (!transitionSuccess) {
                throw new Error(`Failed to transition from ${currentState.current_state} to ${newState}`);
            }

            // Update workflow
            workflow.current_state = newState;
            
            // Trigger next workflow steps if needed
            await this._processStateChange(workflow_id, newState, event);
            
        } catch (error) {
            await this.handle_workflow_error(workflow_id, {
                code: 'STATE_TRANSITION_ERROR',
                message: error.message,
                workflow_id,
                timestamp: new Date(),
                recoverable: true
            });
        }
    }

    /**
     * Handle workflow error
     * @param {string} workflow_id - Workflow identifier
     * @param {import('./types.js').WorkflowError} error - Workflow error
     */
    async handle_workflow_error(workflow_id, error) {
        try {
            const workflow = this.workflows.get(workflow_id);
            if (!workflow) {
                console.error(`Cannot handle error for unknown workflow ${workflow_id}`);
                return;
            }

            // Log error
            console.error(`Workflow ${workflow_id} error:`, error);
            
            // Add error to workflow context
            if (!workflow.context.errors) {
                workflow.context.errors = [];
            }
            workflow.context.errors.push(error);

            // Determine recovery strategy
            if (error.recoverable && workflow.context.retry_count < this.config.retryAttempts) {
                await this._retryWorkflow(workflow_id, error);
            } else {
                await this._failWorkflow(workflow_id, error);
            }
            
        } catch (recoveryError) {
            console.error(`Failed to handle workflow error for ${workflow_id}:`, recoveryError);
            await this._failWorkflow(workflow_id, error);
        }
    }

    /**
     * Complete workflow
     * @param {string} workflow_id - Workflow identifier
     * @param {import('./types.js').WorkflowResult} result - Workflow result
     */
    async complete_workflow(workflow_id, result) {
        try {
            const workflow = this.workflows.get(workflow_id);
            if (!workflow) {
                throw new Error(`Workflow ${workflow_id} not found`);
            }

            // Update workflow state
            workflow.current_state = 'COMPLETED';
            workflow.completed_at = new Date();
            workflow.result = result;

            // Transition to completed state
            await this.stateManager.transition_state(workflow_id, workflow.current_state, 'COMPLETED');
            
            // Calculate final metrics
            const metrics = await this._calculateMetrics(workflow_id);
            result.metrics = metrics;

            // Emit completion event
            await this._emitEvent({
                type: 'workflow_completed',
                workflow_id,
                data: { result, metrics },
                timestamp: new Date()
            });

            console.log(`Workflow ${workflow_id} completed successfully`);
            
        } catch (error) {
            console.error(`Failed to complete workflow ${workflow_id}:`, error);
            throw error;
        }
    }

    /**
     * Get workflow metrics
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<import('./types.js').WorkflowMetrics>}
     */
    async get_workflow_metrics(workflow_id) {
        return await this._calculateMetrics(workflow_id);
    }

    /**
     * List active workflows
     * @returns {Promise<import('./types.js').WorkflowInstance[]>}
     */
    async list_active_workflows() {
        const activeWorkflows = [];
        for (const [id, workflow] of this.workflows) {
            if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(workflow.current_state)) {
                activeWorkflows.push(workflow);
            }
        }
        return activeWorkflows;
    }

    /**
     * Cancel workflow
     * @param {string} workflow_id - Workflow identifier
     * @param {string} reason - Cancellation reason
     */
    async cancel_workflow(workflow_id, reason) {
        const workflow = this.workflows.get(workflow_id);
        if (!workflow) {
            throw new Error(`Workflow ${workflow_id} not found`);
        }

        workflow.current_state = 'CANCELLED';
        workflow.completed_at = new Date();
        workflow.cancellation_reason = reason;

        await this.stateManager.transition_state(workflow_id, workflow.current_state, 'CANCELLED');
        
        await this._emitEvent({
            type: 'workflow_cancelled',
            workflow_id,
            data: { reason },
            timestamp: new Date()
        });
    }

    // Private methods

    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        this.eventHandlers.set('step_completed', this._handleStepCompleted.bind(this));
        this.eventHandlers.set('step_failed', this._handleStepFailed.bind(this));
        this.eventHandlers.set('workflow_paused', this._handleWorkflowPaused.bind(this));
    }

    /**
     * Generate workflow steps based on task
     * @param {string} task_id - Task identifier
     * @param {Object} options - Workflow options
     * @returns {import('./types.js').WorkflowStep[]}
     * @private
     */
    _generateWorkflowSteps(task_id, options) {
        const now = new Date();
        const baseSteps = [
            {
                id: uuidv4(),
                name: 'Analyze Requirements',
                type: 'analysis',
                dependencies: [],
                timeout: 300000, // 5 minutes
                retry_count: 0,
                parameters: { task_id, analysis_type: 'requirements' },
                status: 'pending',
                created_at: now
            },
            {
                id: uuidv4(),
                name: 'Generate Code',
                type: 'codegen',
                dependencies: [],
                timeout: 600000, // 10 minutes
                retry_count: 0,
                parameters: { task_id, generation_type: 'full' },
                status: 'pending',
                created_at: now
            },
            {
                id: uuidv4(),
                name: 'Validate Code',
                type: 'validation',
                dependencies: [],
                timeout: 300000, // 5 minutes
                retry_count: 0,
                parameters: { task_id, validation_type: 'comprehensive' },
                status: 'pending',
                created_at: now
            },
            {
                id: uuidv4(),
                name: 'Complete Task',
                type: 'completion',
                dependencies: [],
                timeout: 60000, // 1 minute
                retry_count: 0,
                parameters: { task_id },
                status: 'pending',
                created_at: now
            }
        ];

        // Set up dependencies
        baseSteps[1].dependencies = [baseSteps[0].id]; // Code generation depends on analysis
        baseSteps[2].dependencies = [baseSteps[1].id]; // Validation depends on code generation
        baseSteps[3].dependencies = [baseSteps[2].id]; // Completion depends on validation

        return baseSteps;
    }

    /**
     * Start workflow execution
     * @param {import('./types.js').WorkflowInstance} workflow
     * @private
     */
    async _startWorkflowExecution(workflow) {
        workflow.started_at = new Date();
        
        // Transition to ANALYZING state
        await this.stateManager.transition_state(workflow.id, 'CREATED', 'ANALYZING');
        workflow.current_state = 'ANALYZING';
        
        // Start executing workflow steps
        await this.workflowEngine.execute_workflow(workflow);
    }

    /**
     * Determine next state based on current state and event
     * @param {string} currentState - Current workflow state
     * @param {import('./types.js').WorkflowEvent} event - Workflow event
     * @returns {string|null} Next state or null if invalid transition
     * @private
     */
    _determineNextState(currentState, event) {
        const allowedTransitions = WORKFLOW_STATES[currentState] || [];
        
        // Simple state transition logic based on event type
        switch (event.type) {
            case 'analysis_completed':
                return allowedTransitions.includes('ANALYZED') ? 'ANALYZED' : null;
            case 'analysis_failed':
                return allowedTransitions.includes('ANALYSIS_FAILED') ? 'ANALYSIS_FAILED' : null;
            case 'code_generated':
                return allowedTransitions.includes('CODE_GENERATED') ? 'CODE_GENERATED' : null;
            case 'code_generation_failed':
                return allowedTransitions.includes('CODE_GENERATION_FAILED') ? 'CODE_GENERATION_FAILED' : null;
            case 'validation_passed':
                return allowedTransitions.includes('VALIDATION_PASSED') ? 'VALIDATION_PASSED' : null;
            case 'validation_failed':
                return allowedTransitions.includes('VALIDATION_FAILED') ? 'VALIDATION_FAILED' : null;
            case 'workflow_completed':
                return allowedTransitions.includes('COMPLETED') ? 'COMPLETED' : null;
            default:
                return null;
        }
    }

    /**
     * Process state change and trigger next steps
     * @param {string} workflow_id - Workflow identifier
     * @param {string} newState - New workflow state
     * @param {import('./types.js').WorkflowEvent} event - Triggering event
     * @private
     */
    async _processStateChange(workflow_id, newState, event) {
        const workflow = this.workflows.get(workflow_id);
        
        // Continue workflow execution based on new state
        switch (newState) {
            case 'ANALYZED':
                await this.workflowEngine.continue_workflow(workflow_id, 'codegen');
                break;
            case 'CODE_GENERATED':
                await this.workflowEngine.continue_workflow(workflow_id, 'validation');
                break;
            case 'VALIDATION_PASSED':
                await this.workflowEngine.continue_workflow(workflow_id, 'completion');
                break;
            case 'VALIDATION_FAILED':
                // Retry code generation or escalate to manual review
                if (workflow.context.validation_retry_count < 2) {
                    await this.workflowEngine.continue_workflow(workflow_id, 'codegen');
                } else {
                    await this.stateManager.transition_state(workflow_id, newState, 'MANUAL_REVIEW');
                }
                break;
        }
    }

    /**
     * Calculate workflow metrics
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<import('./types.js').WorkflowMetrics>}
     * @private
     */
    async _calculateMetrics(workflow_id) {
        const workflow = this.workflows.get(workflow_id);
        if (!workflow) {
            throw new Error(`Workflow ${workflow_id} not found`);
        }

        const now = new Date();
        const startTime = workflow.started_at || workflow.created_at;
        const endTime = workflow.completed_at || now;
        
        const completedSteps = workflow.steps.filter(step => step.status === 'completed');
        const failedSteps = workflow.steps.filter(step => step.status === 'failed');
        
        const stepDurations = {};
        workflow.steps.forEach(step => {
            if (step.completed_at && step.started_at) {
                const duration = step.completed_at.getTime() - step.started_at.getTime();
                stepDurations[step.type] = (stepDurations[step.type] || 0) + duration;
            }
        });

        return {
            workflow_id,
            total_duration_ms: endTime.getTime() - startTime.getTime(),
            steps_completed: completedSteps.length,
            steps_failed: failedSteps.length,
            retry_count: workflow.context.retry_count || 0,
            step_durations: stepDurations,
            started_at: startTime,
            completed_at: workflow.completed_at
        };
    }

    /**
     * Retry workflow execution
     * @param {string} workflow_id - Workflow identifier
     * @param {import('./types.js').WorkflowError} error - Original error
     * @private
     */
    async _retryWorkflow(workflow_id, error) {
        const workflow = this.workflows.get(workflow_id);
        workflow.context.retry_count = (workflow.context.retry_count || 0) + 1;
        
        console.log(`Retrying workflow ${workflow_id}, attempt ${workflow.context.retry_count}`);
        
        // Reset failed steps
        workflow.steps.forEach(step => {
            if (step.status === 'failed') {
                step.status = 'pending';
                step.retry_count = (step.retry_count || 0) + 1;
            }
        });

        // Continue execution
        await this.workflowEngine.execute_workflow(workflow);
    }

    /**
     * Fail workflow
     * @param {string} workflow_id - Workflow identifier
     * @param {import('./types.js').WorkflowError} error - Final error
     * @private
     */
    async _failWorkflow(workflow_id, error) {
        const workflow = this.workflows.get(workflow_id);
        workflow.current_state = 'FAILED';
        workflow.completed_at = new Date();
        workflow.final_error = error;

        await this.stateManager.transition_state(workflow_id, workflow.current_state, 'FAILED');
        
        await this._emitEvent({
            type: 'workflow_failed',
            workflow_id,
            data: { error },
            timestamp: new Date()
        });
    }

    /**
     * Emit workflow event
     * @param {import('./types.js').WorkflowEvent} event - Event to emit
     * @private
     */
    async _emitEvent(event) {
        const handler = this.eventHandlers.get(event.type);
        if (handler) {
            try {
                await handler(event);
            } catch (error) {
                console.error(`Error handling event ${event.type}:`, error);
            }
        }
    }

    /**
     * Handle step completed event
     * @param {import('./types.js').WorkflowEvent} event
     * @private
     */
    async _handleStepCompleted(event) {
        console.log(`Step completed: ${event.step_id} in workflow ${event.workflow_id}`);
    }

    /**
     * Handle step failed event
     * @param {import('./types.js').WorkflowEvent} event
     * @private
     */
    async _handleStepFailed(event) {
        console.log(`Step failed: ${event.step_id} in workflow ${event.workflow_id}`);
    }

    /**
     * Handle workflow paused event
     * @param {import('./types.js').WorkflowEvent} event
     * @private
     */
    async _handleWorkflowPaused(event) {
        console.log(`Workflow paused: ${event.workflow_id}`);
    }
}

