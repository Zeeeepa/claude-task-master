/**
 * @fileoverview Main Workflow Orchestrator Module
 * @description Exports core workflow orchestration functions and classes
 */

import { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
import { WorkflowStateManager } from '../state_manager/WorkflowStateManager.js';
import { WorkflowEngine } from '../workflow_engine/WorkflowEngine.js';
import { v4 as uuidv4 } from 'uuid';

// Global orchestrator instance
let globalOrchestrator = null;

/**
 * Initialize the global workflow orchestrator
 * @param {Object} options - Configuration options
 * @returns {WorkflowOrchestrator} Initialized orchestrator
 */
export function initializeOrchestrator(options = {}) {
    if (!globalOrchestrator) {
        globalOrchestrator = new WorkflowOrchestrator(options);
    }
    return globalOrchestrator;
}

/**
 * Get the global workflow orchestrator instance
 * @returns {WorkflowOrchestrator} Orchestrator instance
 */
export function getOrchestrator() {
    if (!globalOrchestrator) {
        globalOrchestrator = new WorkflowOrchestrator();
    }
    return globalOrchestrator;
}

/**
 * Create a new workflow instance
 * @param {string} task_id - Task identifier
 * @param {Object} options - Workflow options
 * @returns {Promise<string>} Workflow ID
 */
export async function create_workflow_instance(task_id, options = {}) {
    const orchestrator = getOrchestrator();
    const workflow = await orchestrator.start_task_workflow(task_id, options);
    return workflow.id;
}

/**
 * Execute a workflow step
 * @param {string} workflow_id - Workflow identifier
 * @param {import('./types.js').WorkflowStep} step - Step to execute
 * @returns {Promise<import('./types.js').StepResult>}
 */
export async function execute_workflow_step(workflow_id, step) {
    const orchestrator = getOrchestrator();
    return await orchestrator.workflowEngine.execute_workflow_step(workflow_id, step);
}

/**
 * Get next workflow steps that are ready to execute
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<import('./types.js').WorkflowStep[]>}
 */
export async function get_next_workflow_steps(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.workflowEngine.get_next_workflow_steps(workflow_id);
}

/**
 * Handle step completion
 * @param {string} workflow_id - Workflow identifier
 * @param {string} step_id - Step identifier
 * @param {import('./types.js').StepResult} result - Step result
 */
export async function handle_step_completion(workflow_id, step_id, result) {
    const orchestrator = getOrchestrator();
    await orchestrator.workflowEngine.handle_step_completion(workflow_id, step_id, result);
}

/**
 * Handle step failure
 * @param {string} workflow_id - Workflow identifier
 * @param {string} step_id - Step identifier
 * @param {import('./types.js').StepError} error - Step error
 */
export async function handle_step_failure(workflow_id, step_id, error) {
    const orchestrator = getOrchestrator();
    await orchestrator.workflowEngine.handle_step_failure(workflow_id, step_id, error);
}

/**
 * Pause workflow execution
 * @param {string} workflow_id - Workflow identifier
 */
export async function pause_workflow(workflow_id) {
    const orchestrator = getOrchestrator();
    await orchestrator.workflowEngine.pause_workflow(workflow_id);
    await orchestrator.stateManager.pause_workflow_state(workflow_id, 'manual_pause');
}

/**
 * Resume workflow execution
 * @param {string} workflow_id - Workflow identifier
 */
export async function resume_workflow(workflow_id) {
    const orchestrator = getOrchestrator();
    await orchestrator.stateManager.resume_workflow_state(workflow_id);
    await orchestrator.workflowEngine.resume_workflow(workflow_id);
}

/**
 * Cancel workflow execution
 * @param {string} workflow_id - Workflow identifier
 * @param {string} reason - Cancellation reason
 */
export async function cancel_workflow(workflow_id, reason) {
    const orchestrator = getOrchestrator();
    await orchestrator.cancel_workflow(workflow_id, reason);
    await orchestrator.workflowEngine.cancel_workflow(workflow_id, reason);
}

/**
 * Get workflow metrics
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<import('./types.js').WorkflowMetrics>}
 */
export async function get_workflow_metrics(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.get_workflow_metrics(workflow_id);
}

/**
 * Get workflow status
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<import('./types.js').WorkflowStatus>}
 */
export async function get_workflow_status(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.get_workflow_status(workflow_id);
}

/**
 * Get workflow state
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<import('./types.js').WorkflowState>}
 */
export async function get_workflow_state(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.stateManager.get_current_state(workflow_id);
}

/**
 * Get workflow history
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<import('./types.js').StateTransition[]>}
 */
export async function get_workflow_history(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.stateManager.get_workflow_history(workflow_id);
}

/**
 * List all active workflows
 * @returns {Promise<import('./types.js').WorkflowInstance[]>}
 */
export async function list_active_workflows() {
    const orchestrator = getOrchestrator();
    return await orchestrator.list_active_workflows();
}

/**
 * Rollback workflow to previous state
 * @param {string} workflow_id - Workflow identifier
 * @param {number} steps - Number of steps to rollback
 * @returns {Promise<boolean>} Success status
 */
export async function rollback_workflow(workflow_id, steps = 1) {
    const orchestrator = getOrchestrator();
    return await orchestrator.stateManager.rollback_workflow_state(workflow_id, steps);
}

/**
 * Get workflow state statistics
 * @param {string} workflow_id - Workflow identifier
 * @returns {Promise<Object>} State statistics
 */
export async function get_workflow_state_statistics(workflow_id) {
    const orchestrator = getOrchestrator();
    return await orchestrator.stateManager.get_state_statistics(workflow_id);
}

/**
 * Clean up old workflow states
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {Promise<number>} Number of cleaned up workflows
 */
export async function cleanup_old_workflows(maxAge) {
    const orchestrator = getOrchestrator();
    return await orchestrator.stateManager.cleanup_old_states(maxAge);
}

// Export classes for advanced usage
export { WorkflowOrchestrator, WorkflowStateManager, WorkflowEngine };

// Export types and constants
export * from './types.js';

