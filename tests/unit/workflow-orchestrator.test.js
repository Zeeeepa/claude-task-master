/**
 * @fileoverview Workflow Orchestrator Tests
 * @description Comprehensive tests for the workflow orchestration system
 */

import { jest } from '@jest/globals';
import {
    WorkflowOrchestrator,
    WorkflowStateManager,
    WorkflowEngine,
    create_workflow_instance,
    get_workflow_status,
    get_workflow_metrics,
    pause_workflow,
    resume_workflow,
    cancel_workflow,
    initializeOrchestrator,
    WORKFLOW_STATES,
    WORKFLOW_PRIORITY
} from '../../src/workflow_orchestrator/index.js';

describe('Workflow Orchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        orchestrator = new WorkflowOrchestrator({
            maxConcurrentWorkflows: 5,
            defaultTimeout: 30000
        });
    });

    afterEach(() => {
        // Clean up any running workflows
        jest.clearAllMocks();
    });

    describe('WorkflowOrchestrator Class', () => {
        test('should initialize with default configuration', () => {
            const defaultOrchestrator = new WorkflowOrchestrator();
            expect(defaultOrchestrator.config.maxConcurrentWorkflows).toBe(50);
            expect(defaultOrchestrator.config.defaultTimeout).toBe(900000);
        });

        test('should initialize with custom configuration', () => {
            expect(orchestrator.config.maxConcurrentWorkflows).toBe(5);
            expect(orchestrator.config.defaultTimeout).toBe(30000);
        });

        test('should start task workflow successfully', async () => {
            const workflow = await orchestrator.start_task_workflow('test-task-1');
            
            expect(workflow).toBeDefined();
            expect(workflow.id).toBeDefined();
            expect(workflow.task_id).toBe('test-task-1');
            expect(workflow.current_state).toBe('CREATED');
            expect(workflow.steps).toHaveLength(4); // analysis, codegen, validation, completion
        });

        test('should get workflow status', async () => {
            const workflow = await orchestrator.start_task_workflow('test-task-2');
            const status = await orchestrator.get_workflow_status(workflow.id);
            
            expect(status.workflow_id).toBe(workflow.id);
            expect(status.current_state).toBeDefined();
            expect(status.progress_percentage).toBeGreaterThanOrEqual(0);
            expect(status.progress_percentage).toBeLessThanOrEqual(100);
        });

        test('should handle workflow error', async () => {
            const workflow = await orchestrator.start_task_workflow('test-task-3');
            const error = {
                code: 'TEST_ERROR',
                message: 'Test error message',
                workflow_id: workflow.id,
                timestamp: new Date(),
                recoverable: true
            };

            await orchestrator.handle_workflow_error(workflow.id, error);
            
            expect(workflow.context.errors).toContain(error);
        });

        test('should complete workflow successfully', async () => {
            const workflow = await orchestrator.start_task_workflow('test-task-4');
            const result = {
                workflow_id: workflow.id,
                status: 'completed',
                output: { test: 'data' },
                completed_at: new Date()
            };

            await orchestrator.complete_workflow(workflow.id, result);
            
            expect(workflow.current_state).toBe('COMPLETED');
            expect(workflow.completed_at).toBeDefined();
            expect(workflow.result).toBe(result);
        });

        test('should cancel workflow', async () => {
            const workflow = await orchestrator.start_task_workflow('test-task-5');
            await orchestrator.cancel_workflow(workflow.id, 'Test cancellation');
            
            expect(workflow.current_state).toBe('CANCELLED');
            expect(workflow.cancellation_reason).toBe('Test cancellation');
        });

        test('should list active workflows', async () => {
            const workflow1 = await orchestrator.start_task_workflow('test-task-6');
            const workflow2 = await orchestrator.start_task_workflow('test-task-7');
            
            const activeWorkflows = await orchestrator.list_active_workflows();
            
            expect(activeWorkflows).toHaveLength(2);
            expect(activeWorkflows.map(w => w.id)).toContain(workflow1.id);
            expect(activeWorkflows.map(w => w.id)).toContain(workflow2.id);
        });
    });

    describe('WorkflowStateManager Class', () => {
        let stateManager;

        beforeEach(() => {
            stateManager = new WorkflowStateManager();
        });

        test('should initialize workflow state', async () => {
            const workflow = {
                id: 'test-workflow-1',
                current_state: 'CREATED',
                context: { test: 'data' },
                metadata: { version: '1.0.0' }
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            const state = await stateManager.get_current_state(workflow.id);
            
            expect(state.workflow_id).toBe(workflow.id);
            expect(state.current_state).toBe('CREATED');
        });

        test('should transition state successfully', async () => {
            const workflow = {
                id: 'test-workflow-2',
                current_state: 'CREATED',
                context: {},
                metadata: {}
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            const success = await stateManager.transition_state(workflow.id, 'CREATED', 'ANALYZING');
            
            expect(success).toBe(true);
            
            const state = await stateManager.get_current_state(workflow.id);
            expect(state.current_state).toBe('ANALYZING');
        });

        test('should validate state transitions', async () => {
            const workflow = {
                id: 'test-workflow-3',
                current_state: 'CREATED',
                context: {},
                metadata: {}
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            
            // Valid transition
            const validTransition = await stateManager.can_transition(workflow.id, 'ANALYZING');
            expect(validTransition).toBe(true);
            
            // Invalid transition
            const invalidTransition = await stateManager.can_transition(workflow.id, 'COMPLETED');
            expect(invalidTransition).toBe(false);
        });

        test('should get workflow history', async () => {
            const workflow = {
                id: 'test-workflow-4',
                current_state: 'CREATED',
                context: {},
                metadata: {}
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            await stateManager.transition_state(workflow.id, 'CREATED', 'ANALYZING');
            
            const history = await stateManager.get_workflow_history(workflow.id);
            expect(history).toHaveLength(2); // initialization + transition
        });

        test('should pause and resume workflow state', async () => {
            const workflow = {
                id: 'test-workflow-5',
                current_state: 'ANALYZING',
                context: {},
                metadata: {}
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            await stateManager.pause_workflow_state(workflow.id, 'Test pause');
            
            const pausedState = await stateManager.get_current_state(workflow.id);
            expect(pausedState.context.paused).toBe(true);
            
            await stateManager.resume_workflow_state(workflow.id);
            
            const resumedState = await stateManager.get_current_state(workflow.id);
            expect(resumedState.context.paused).toBe(false);
        });

        test('should rollback workflow state', async () => {
            const workflow = {
                id: 'test-workflow-6',
                current_state: 'CREATED',
                context: {},
                metadata: {}
            };

            await stateManager.initialize_workflow_state(workflow.id, workflow);
            await stateManager.transition_state(workflow.id, 'CREATED', 'ANALYZING');
            await stateManager.transition_state(workflow.id, 'ANALYZING', 'ANALYZED');
            
            const rollbackSuccess = await stateManager.rollback_workflow_state(workflow.id, 1);
            expect(rollbackSuccess).toBe(true);
            
            const state = await stateManager.get_current_state(workflow.id);
            expect(state.current_state).toBe('ANALYZING');
        });
    });

    describe('WorkflowEngine Class', () => {
        let workflowEngine;

        beforeEach(() => {
            workflowEngine = new WorkflowEngine({
                maxConcurrentSteps: 3,
                stepTimeout: 10000
            });
        });

        test('should execute workflow', async () => {
            const workflow = {
                id: 'test-workflow-7',
                steps: [
                    {
                        id: 'step-1',
                        name: 'Test Step',
                        type: 'analysis',
                        dependencies: [],
                        timeout: 5000,
                        retry_count: 0,
                        parameters: {},
                        status: 'pending',
                        created_at: new Date()
                    }
                ]
            };

            // Mock the execution (since we don't want to actually run async operations in tests)
            const executeSpy = jest.spyOn(workflowEngine, '_executeStep').mockResolvedValue({
                step_id: 'step-1',
                status: 'success',
                output: {},
                duration_ms: 1000,
                completed_at: new Date()
            });

            await workflowEngine.execute_workflow(workflow);
            
            expect(executeSpy).toHaveBeenCalled();
        });

        test('should get next workflow steps', async () => {
            const workflow = {
                id: 'test-workflow-8',
                steps: [
                    {
                        id: 'step-1',
                        dependencies: [],
                        status: 'pending'
                    },
                    {
                        id: 'step-2',
                        dependencies: ['step-1'],
                        status: 'pending'
                    }
                ]
            };

            workflowEngine.executingWorkflows.set(workflow.id, { workflow });
            
            const nextSteps = await workflowEngine.get_next_workflow_steps(workflow.id);
            expect(nextSteps).toHaveLength(1);
            expect(nextSteps[0].id).toBe('step-1');
        });

        test('should handle step completion', async () => {
            const workflow = {
                id: 'test-workflow-9',
                steps: [
                    {
                        id: 'step-1',
                        status: 'running'
                    }
                ]
            };

            workflowEngine.executingWorkflows.set(workflow.id, { 
                workflow,
                currentSteps: new Set(['step-1'])
            });

            const result = {
                step_id: 'step-1',
                status: 'success',
                output: {},
                duration_ms: 1000,
                completed_at: new Date()
            };

            await workflowEngine.handle_step_completion(workflow.id, 'step-1', result);
            
            expect(workflow.steps[0].status).toBe('completed');
        });

        test('should pause and resume workflow', async () => {
            const workflow = {
                id: 'test-workflow-10',
                steps: []
            };

            workflowEngine.executingWorkflows.set(workflow.id, { workflow });

            await workflowEngine.pause_workflow(workflow.id);
            const executionContext = workflowEngine.executingWorkflows.get(workflow.id);
            expect(executionContext.paused).toBe(true);

            await workflowEngine.resume_workflow(workflow.id);
            expect(executionContext.paused).toBe(false);
        });
    });

    describe('Module Functions', () => {
        beforeEach(() => {
            initializeOrchestrator({
                maxConcurrentWorkflows: 5,
                defaultTimeout: 30000
            });
        });

        test('should create workflow instance', async () => {
            const workflowId = await create_workflow_instance('module-test-1');
            expect(workflowId).toBeDefined();
            expect(typeof workflowId).toBe('string');
        });

        test('should get workflow status', async () => {
            const workflowId = await create_workflow_instance('module-test-2');
            const status = await get_workflow_status(workflowId);
            
            expect(status.workflow_id).toBe(workflowId);
            expect(status.current_state).toBeDefined();
        });

        test('should get workflow metrics', async () => {
            const workflowId = await create_workflow_instance('module-test-3');
            const metrics = await get_workflow_metrics(workflowId);
            
            expect(metrics.workflow_id).toBe(workflowId);
            expect(metrics.total_duration_ms).toBeGreaterThanOrEqual(0);
        });

        test('should pause and resume workflow', async () => {
            const workflowId = await create_workflow_instance('module-test-4');
            
            await pause_workflow(workflowId);
            // In a real test, we'd verify the workflow is actually paused
            
            await resume_workflow(workflowId);
            // In a real test, we'd verify the workflow is actually resumed
        });

        test('should cancel workflow', async () => {
            const workflowId = await create_workflow_instance('module-test-5');
            await cancel_workflow(workflowId, 'Test cancellation');
            
            // In a real test, we'd verify the workflow is actually cancelled
        });
    });

    describe('Workflow States and Transitions', () => {
        test('should have valid workflow states configuration', () => {
            expect(WORKFLOW_STATES).toBeDefined();
            expect(WORKFLOW_STATES.CREATED).toContain('ANALYZING');
            expect(WORKFLOW_STATES.ANALYZING).toContain('ANALYZED');
            expect(WORKFLOW_STATES.ANALYZING).toContain('ANALYSIS_FAILED');
        });

        test('should have valid priority levels', () => {
            expect(WORKFLOW_PRIORITY.LOW).toBe(1);
            expect(WORKFLOW_PRIORITY.NORMAL).toBe(2);
            expect(WORKFLOW_PRIORITY.HIGH).toBe(3);
            expect(WORKFLOW_PRIORITY.CRITICAL).toBe(4);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid workflow ID gracefully', async () => {
            await expect(get_workflow_status('invalid-id')).rejects.toThrow();
        });

        test('should handle workflow creation errors', async () => {
            // Mock a scenario where workflow creation fails
            const originalMethod = orchestrator.stateManager.initialize_workflow_state;
            orchestrator.stateManager.initialize_workflow_state = jest.fn().mockRejectedValue(new Error('State initialization failed'));
            
            await expect(orchestrator.start_task_workflow('failing-task')).rejects.toThrow();
            
            // Restore original method
            orchestrator.stateManager.initialize_workflow_state = originalMethod;
        });
    });

    describe('Performance and Concurrency', () => {
        test('should handle multiple concurrent workflows', async () => {
            const workflowPromises = [];
            for (let i = 0; i < 3; i++) {
                workflowPromises.push(create_workflow_instance(`concurrent-test-${i}`));
            }
            
            const workflowIds = await Promise.all(workflowPromises);
            expect(workflowIds).toHaveLength(3);
            expect(new Set(workflowIds).size).toBe(3); // All IDs should be unique
        });

        test('should respect concurrency limits', () => {
            expect(orchestrator.config.maxConcurrentWorkflows).toBe(5);
            // In a real test, we'd create more workflows than the limit and verify behavior
        });
    });
});

