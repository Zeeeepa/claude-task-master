/**
 * @fileoverview Workflow Engine Tests
 * @description Comprehensive tests for the WorkflowEngine class
 */

import { jest } from '@jest/globals';
import { WorkflowEngine } from '../../src/ai_cicd_system/orchestrator/workflow_engine.js';
import { BaseWorkflow } from '../../src/ai_cicd_system/orchestrator/workflow_definitions/base_workflow.js';
import { EventBus } from '../../src/ai_cicd_system/orchestrator/event_bus.js';

// Mock workflow class for testing
class TestWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.setupTestSteps();
    }

    setupTestSteps() {
        this.addStep('test_step_1', async () => {
            return { status: 'step1_completed', data: 'test_data_1' };
        });

        this.addStep('test_step_2', async () => {
            return { status: 'step2_completed', data: 'test_data_2' };
        });
    }

    validateContext() {
        if (!this.context.testData) {
            throw new Error('Test data is required');
        }
    }
}

// Mock failing workflow for error testing
class FailingWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.addStep('failing_step', async () => {
            throw new Error('Intentional test failure');
        });
    }
}

describe('WorkflowEngine', () => {
    let workflowEngine;
    let mockOrchestrator;
    let mockEventBus;

    beforeEach(() => {
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn()
        };

        mockOrchestrator = {
            eventBus: mockEventBus,
            performanceMonitor: {
                startTimer: jest.fn().mockReturnValue('timer_id'),
                endTimer: jest.fn()
            },
            errorHandler: {
                handleError: jest.fn()
            }
        };

        workflowEngine = new WorkflowEngine(mockOrchestrator);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            await workflowEngine.initialize();
            
            expect(workflowEngine.isInitialized).toBe(true);
            expect(workflowEngine.getRegisteredWorkflows()).toContain('task_processing');
            expect(workflowEngine.getRegisteredWorkflows()).toContain('pr_creation');
            expect(workflowEngine.getRegisteredWorkflows()).toContain('validation');
        });

        test('should not initialize twice', async () => {
            await workflowEngine.initialize();
            const firstInitState = workflowEngine.isInitialized;
            
            await workflowEngine.initialize();
            
            expect(workflowEngine.isInitialized).toBe(firstInitState);
        });
    });

    describe('Workflow Registration', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
        });

        test('should register workflow successfully', () => {
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            
            expect(workflowEngine.getRegisteredWorkflows()).toContain('test_workflow');
        });

        test('should throw error when registering non-BaseWorkflow class', () => {
            class InvalidWorkflow {}
            
            expect(() => {
                workflowEngine.registerWorkflow('invalid', InvalidWorkflow);
            }).toThrow('Workflow \'invalid\' must extend BaseWorkflow');
        });

        test('should unregister workflow successfully', () => {
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            expect(workflowEngine.getRegisteredWorkflows()).toContain('test_workflow');
            
            const result = workflowEngine.unregisterWorkflow('test_workflow');
            
            expect(result).toBe(true);
            expect(workflowEngine.getRegisteredWorkflows()).not.toContain('test_workflow');
        });

        test('should return false when unregistering non-existent workflow', () => {
            const result = workflowEngine.unregisterWorkflow('non_existent');
            expect(result).toBe(false);
        });
    });

    describe('Workflow Creation', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
        });

        test('should create workflow successfully', async () => {
            const context = { testData: 'test_value' };
            
            const workflow = await workflowEngine.createWorkflow('test_workflow', context);
            
            expect(workflow).toBeInstanceOf(TestWorkflow);
            expect(workflow.id).toBeDefined();
            expect(workflow.status).toBe('created');
            expect(workflow.context.testData).toBe('test_value');
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.created', expect.any(Object));
        });

        test('should throw error when engine not initialized', async () => {
            const uninitializedEngine = new WorkflowEngine(mockOrchestrator);
            
            await expect(uninitializedEngine.createWorkflow('test_workflow', {}))
                .rejects.toThrow('Workflow engine not initialized');
        });

        test('should throw error when workflow type not found', async () => {
            await expect(workflowEngine.createWorkflow('non_existent', {}))
                .rejects.toThrow('Workflow \'non_existent\' not found');
        });

        test('should throw error when max concurrent workflows reached', async () => {
            workflowEngine.maxConcurrentWorkflows = 1;
            
            await workflowEngine.createWorkflow('test_workflow', { testData: 'test1' });
            
            await expect(workflowEngine.createWorkflow('test_workflow', { testData: 'test2' }))
                .rejects.toThrow('Maximum concurrent workflows reached');
        });
    });

    describe('Workflow Execution', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            workflowEngine.registerWorkflow('failing_workflow', FailingWorkflow);
        });

        test('should execute workflow successfully', async () => {
            const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            
            const result = await workflowEngine.executeWorkflow(workflow);
            
            expect(result).toBeDefined();
            expect(workflow.status).toBe('completed');
            expect(workflow.completedAt).toBeDefined();
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.started', expect.any(Object));
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.completed', expect.any(Object));
            expect(mockOrchestrator.performanceMonitor.startTimer).toHaveBeenCalled();
            expect(mockOrchestrator.performanceMonitor.endTimer).toHaveBeenCalled();
        });

        test('should handle workflow execution failure', async () => {
            const workflow = await workflowEngine.createWorkflow('failing_workflow', {});
            
            await expect(workflowEngine.executeWorkflow(workflow))
                .rejects.toThrow('Intentional test failure');
            
            expect(workflow.status).toBe('failed');
            expect(workflow.failedAt).toBeDefined();
            expect(workflow.error).toBeDefined();
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.failed', expect.any(Object));
            expect(mockOrchestrator.errorHandler.handleError).toHaveBeenCalled();
        });

        test('should throw error for invalid workflow instance', async () => {
            await expect(workflowEngine.executeWorkflow(null))
                .rejects.toThrow('Invalid workflow instance');
            
            await expect(workflowEngine.executeWorkflow({}))
                .rejects.toThrow('Invalid workflow instance');
        });
    });

    describe('Workflow Management', () => {
        let workflow;

        beforeEach(async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
        });

        test('should pause workflow successfully', async () => {
            workflow.status = 'running';
            
            await workflowEngine.pauseWorkflow(workflow.id, 'Test pause');
            
            expect(workflow.status).toBe('paused');
            expect(workflow.pauseReason).toBe('Test pause');
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.paused', expect.any(Object));
        });

        test('should resume workflow successfully', async () => {
            workflow.status = 'paused';
            
            await workflowEngine.resumeWorkflow(workflow.id);
            
            expect(workflow.status).toBe('running');
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.resumed', expect.any(Object));
        });

        test('should cancel workflow successfully', async () => {
            await workflowEngine.cancelWorkflow(workflow.id, 'Test cancellation');
            
            expect(workflow.status).toBe('cancelled');
            expect(workflow.cancellationReason).toBe('Test cancellation');
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.cancelled', expect.any(Object));
        });

        test('should get workflow status for active workflow', () => {
            const status = workflowEngine.getWorkflowStatus(workflow.id);
            
            expect(status).toBeDefined();
            expect(status.id).toBe(workflow.id);
            expect(status.status).toBe('created');
            expect(status.progress).toBeDefined();
        });

        test('should return null for non-existent workflow', () => {
            const status = workflowEngine.getWorkflowStatus('non_existent_id');
            expect(status).toBeNull();
        });
    });

    describe('Workflow Queries', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
        });

        test('should get active workflows', async () => {
            const workflow1 = await workflowEngine.createWorkflow('test_workflow', { testData: 'test1' });
            const workflow2 = await workflowEngine.createWorkflow('test_workflow', { testData: 'test2' });
            
            const activeWorkflows = workflowEngine.getActiveWorkflows();
            
            expect(activeWorkflows).toHaveLength(2);
            expect(activeWorkflows.map(w => w.id)).toContain(workflow1.id);
            expect(activeWorkflows.map(w => w.id)).toContain(workflow2.id);
        });

        test('should get workflow history', async () => {
            const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            await workflowEngine.executeWorkflow(workflow);
            
            // Wait for archival
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const history = workflowEngine.getWorkflowHistory();
            expect(history).toHaveLength(1);
            expect(history[0].workflowId).toBe(workflow.id);
        });

        test('should get engine statistics', async () => {
            await workflowEngine.createWorkflow('test_workflow', { testData: 'test1' });
            await workflowEngine.createWorkflow('test_workflow', { testData: 'test2' });
            
            const stats = workflowEngine.getStats();
            
            expect(stats.totalCreated).toBe(2);
            expect(stats.activeWorkflows).toBe(2);
            expect(stats.registeredWorkflowTypes).toBeGreaterThan(0);
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
        });

        test('should handle system shutdown event', async () => {
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            
            // Simulate system shutdown event
            const shutdownHandler = mockEventBus.on.mock.calls.find(call => call[0] === 'system.shutdown')[1];
            await shutdownHandler();
            
            expect(workflow.status).toBe('cancelled');
        });

        test('should handle maintenance mode event', async () => {
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            workflow.status = 'running';
            
            // Simulate maintenance mode event
            const maintenanceHandler = mockEventBus.on.mock.calls.find(call => call[0] === 'system.maintenance')[1];
            await maintenanceHandler({ reason: 'Scheduled maintenance' });
            
            expect(workflow.status).toBe('paused');
        });
    });

    describe('Shutdown', () => {
        test('should shutdown gracefully', async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            
            await workflowEngine.shutdown();
            
            expect(workflowEngine.isInitialized).toBe(false);
            expect(workflowEngine.activeWorkflows.size).toBe(0);
            expect(workflowEngine.workflowDefinitions.size).toBe(0);
        });

        test('should handle shutdown when not initialized', async () => {
            await expect(workflowEngine.shutdown()).resolves.not.toThrow();
        });
    });

    describe('Error Scenarios', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
        });

        test('should handle workflow creation with invalid context', async () => {
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
            
            const workflow = await workflowEngine.createWorkflow('test_workflow', {});
            
            await expect(workflowEngine.executeWorkflow(workflow))
                .rejects.toThrow('Test data is required');
        });

        test('should handle missing performance monitor gracefully', async () => {
            const orchestratorWithoutMonitor = {
                eventBus: mockEventBus,
                errorHandler: mockOrchestrator.errorHandler
            };
            
            const engine = new WorkflowEngine(orchestratorWithoutMonitor);
            await engine.initialize();
            engine.registerWorkflow('test_workflow', TestWorkflow);
            
            const workflow = await engine.createWorkflow('test_workflow', { testData: 'test_value' });
            
            await expect(engine.executeWorkflow(workflow)).resolves.toBeDefined();
        });

        test('should handle missing error handler gracefully', async () => {
            const orchestratorWithoutErrorHandler = {
                eventBus: mockEventBus,
                performanceMonitor: mockOrchestrator.performanceMonitor
            };
            
            const engine = new WorkflowEngine(orchestratorWithoutErrorHandler);
            await engine.initialize();
            engine.registerWorkflow('failing_workflow', FailingWorkflow);
            
            const workflow = await engine.createWorkflow('failing_workflow', {});
            
            await expect(engine.executeWorkflow(workflow))
                .rejects.toThrow('Intentional test failure');
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await workflowEngine.initialize();
            workflowEngine.registerWorkflow('test_workflow', TestWorkflow);
        });

        test('should handle multiple concurrent workflows', async () => {
            const promises = [];
            
            for (let i = 0; i < 10; i++) {
                const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: `test_${i}` });
                promises.push(workflowEngine.executeWorkflow(workflow));
            }
            
            const results = await Promise.all(promises);
            
            expect(results).toHaveLength(10);
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });

        test('should maintain performance metrics', async () => {
            const workflow = await workflowEngine.createWorkflow('test_workflow', { testData: 'test_value' });
            await workflowEngine.executeWorkflow(workflow);
            
            const stats = workflowEngine.getStats();
            
            expect(stats.totalCreated).toBe(1);
            expect(stats.totalExecuted).toBe(1);
            expect(stats.totalCompleted).toBe(1);
            expect(stats.successRate).toBe(100);
        });
    });
});

