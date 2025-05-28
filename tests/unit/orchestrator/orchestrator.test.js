/**
 * @fileoverview Unit tests for System Orchestrator
 */

import { jest } from '@jest/globals';
import { SystemOrchestrator } from '../../../src/orchestrator/orchestrator.js';

// Mock dependencies
jest.mock('../../../src/scripts/modules/utils.js', () => ({
    log: jest.fn()
}));

describe('SystemOrchestrator', () => {
    let orchestrator;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            maxConcurrentWorkflows: 5,
            maxConcurrentTasks: 25,
            healthCheckInterval: 10000,
            componentTimeout: 30000,
            enableMonitoring: true,
            enableErrorRecovery: true,
            retryAttempts: 2,
            retryDelay: 500
        };

        orchestrator = new SystemOrchestrator(mockConfig);
    });

    afterEach(async () => {
        if (orchestrator.isInitialized) {
            await orchestrator.shutdown();
        }
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should create orchestrator with default config', () => {
            const defaultOrchestrator = new SystemOrchestrator();
            
            expect(defaultOrchestrator.config.maxConcurrentWorkflows).toBe(10);
            expect(defaultOrchestrator.config.maxConcurrentTasks).toBe(50);
            expect(defaultOrchestrator.config.enableMonitoring).toBe(true);
            expect(defaultOrchestrator.isInitialized).toBe(false);
        });

        test('should create orchestrator with custom config', () => {
            expect(orchestrator.config.maxConcurrentWorkflows).toBe(5);
            expect(orchestrator.config.maxConcurrentTasks).toBe(25);
            expect(orchestrator.config.healthCheckInterval).toBe(10000);
        });

        test('should initialize core components', () => {
            expect(orchestrator.workflowManager).toBeDefined();
            expect(orchestrator.componentCoordinator).toBeDefined();
            expect(orchestrator.taskScheduler).toBeDefined();
            expect(orchestrator.stateManager).toBeDefined();
        });

        test('should initialize metrics', () => {
            expect(orchestrator.metrics).toEqual({
                workflowsCreated: 0,
                workflowsCompleted: 0,
                workflowsFailed: 0,
                tasksScheduled: 0,
                tasksCompleted: 0,
                componentMessages: 0,
                errors: 0,
                uptime: 0
            });
        });
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            // Mock component initialization
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();

            await orchestrator.initialize();

            expect(orchestrator.isInitialized).toBe(true);
            expect(orchestrator.startTime).toBeDefined();
            expect(orchestrator.stateManager.initialize).toHaveBeenCalled();
            expect(orchestrator.componentCoordinator.initialize).toHaveBeenCalled();
            expect(orchestrator.taskScheduler.initialize).toHaveBeenCalled();
            expect(orchestrator.workflowManager.initialize).toHaveBeenCalled();
        });

        test('should not initialize twice', async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();

            await orchestrator.initialize();
            await orchestrator.initialize();

            expect(orchestrator.stateManager.initialize).toHaveBeenCalledTimes(1);
        });

        test('should handle initialization failure', async () => {
            const error = new Error('Initialization failed');
            orchestrator.stateManager.initialize = jest.fn().mockRejectedValue(error);

            await expect(orchestrator.initialize()).rejects.toThrow('Orchestrator initialization failed: Initialization failed');
            expect(orchestrator.isInitialized).toBe(false);
        });

        test('should start health monitoring when enabled', async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();

            await orchestrator.initialize();

            expect(orchestrator.healthCheckTimer).toBeDefined();
        });

        test('should not start health monitoring when disabled', async () => {
            orchestrator.config.enableMonitoring = false;
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();

            await orchestrator.initialize();

            expect(orchestrator.healthCheckTimer).toBeNull();
        });
    });

    describe('Workflow Management', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should create workflow successfully', async () => {
            const workflowDefinition = {
                name: 'Test Workflow',
                steps: [
                    { name: 'Step 1', type: 'task' },
                    { name: 'Step 2', type: 'task' }
                ]
            };

            const mockWorkflowId = 'workflow-123';
            orchestrator.workflowManager.createWorkflow = jest.fn().mockResolvedValue(mockWorkflowId);

            const workflowId = await orchestrator.createWorkflow(workflowDefinition);

            expect(workflowId).toBe(mockWorkflowId);
            expect(orchestrator.workflowManager.createWorkflow).toHaveBeenCalledWith(workflowDefinition);
            expect(orchestrator.metrics.workflowsCreated).toBe(1);
        });

        test('should validate workflow definition', async () => {
            const invalidWorkflow = {};

            await expect(orchestrator.createWorkflow(invalidWorkflow)).rejects.toThrow('Workflow name is required');
        });

        test('should validate workflow steps', async () => {
            const invalidWorkflow = {
                name: 'Test Workflow',
                steps: []
            };

            await expect(orchestrator.createWorkflow(invalidWorkflow)).rejects.toThrow('Workflow must have at least one step');
        });

        test('should handle workflow creation failure', async () => {
            const workflowDefinition = {
                name: 'Test Workflow',
                steps: [{ name: 'Step 1', type: 'task' }]
            };

            const error = new Error('Creation failed');
            orchestrator.workflowManager.createWorkflow = jest.fn().mockRejectedValue(error);

            await expect(orchestrator.createWorkflow(workflowDefinition)).rejects.toThrow(error);
            expect(orchestrator.metrics.errors).toBe(1);
        });

        test('should get workflow status', async () => {
            const workflowId = 'workflow-123';
            const mockStatus = { id: workflowId, state: 'running' };
            
            orchestrator.workflowManager.getWorkflowStatus = jest.fn().mockResolvedValue(mockStatus);

            const status = await orchestrator.getWorkflowStatus(workflowId);

            expect(status).toBe(mockStatus);
            expect(orchestrator.workflowManager.getWorkflowStatus).toHaveBeenCalledWith(workflowId);
        });
    });

    describe('Task Scheduling', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should schedule task successfully', async () => {
            const task = {
                name: 'Test Task',
                type: 'processing'
            };

            const mockTaskId = 'task-123';
            orchestrator.taskScheduler.scheduleTask = jest.fn().mockResolvedValue(mockTaskId);

            const taskId = await orchestrator.scheduleTask(task);

            expect(taskId).toBe(mockTaskId);
            expect(orchestrator.taskScheduler.scheduleTask).toHaveBeenCalledWith(task, {});
            expect(orchestrator.metrics.tasksScheduled).toBe(1);
        });

        test('should schedule task with options', async () => {
            const task = { name: 'Test Task' };
            const options = { priority: 'high', timeout: 60000 };

            const mockTaskId = 'task-123';
            orchestrator.taskScheduler.scheduleTask = jest.fn().mockResolvedValue(mockTaskId);

            await orchestrator.scheduleTask(task, options);

            expect(orchestrator.taskScheduler.scheduleTask).toHaveBeenCalledWith(task, options);
        });

        test('should handle task scheduling failure', async () => {
            const task = { name: 'Test Task' };
            const error = new Error('Scheduling failed');
            
            orchestrator.taskScheduler.scheduleTask = jest.fn().mockRejectedValue(error);

            await expect(orchestrator.scheduleTask(task)).rejects.toThrow(error);
            expect(orchestrator.metrics.errors).toBe(1);
        });

        test('should get task status', async () => {
            const taskId = 'task-123';
            const mockStatus = { id: taskId, state: 'running' };
            
            orchestrator.taskScheduler.getTaskStatus = jest.fn().mockResolvedValue(mockStatus);

            const status = await orchestrator.getTaskStatus(taskId);

            expect(status).toBe(mockStatus);
            expect(orchestrator.taskScheduler.getTaskStatus).toHaveBeenCalledWith(taskId);
        });
    });

    describe('Component Communication', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should send message to component', async () => {
            const componentId = 'component-123';
            const message = { type: 'request', payload: { action: 'process' } };
            const mockResponse = { success: true, result: 'processed' };

            orchestrator.componentCoordinator.sendMessage = jest.fn().mockResolvedValue(mockResponse);

            const response = await orchestrator.sendMessage(componentId, message);

            expect(response).toBe(mockResponse);
            expect(orchestrator.componentCoordinator.sendMessage).toHaveBeenCalledWith(componentId, message);
            expect(orchestrator.metrics.componentMessages).toBe(1);
        });

        test('should handle message sending failure', async () => {
            const componentId = 'component-123';
            const message = { type: 'request' };
            const error = new Error('Send failed');

            orchestrator.componentCoordinator.sendMessage = jest.fn().mockRejectedValue(error);

            await expect(orchestrator.sendMessage(componentId, message)).rejects.toThrow(error);
            expect(orchestrator.metrics.errors).toBe(1);
        });
    });

    describe('Status and Monitoring', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should return system status', () => {
            // Mock component statuses
            orchestrator.workflowManager.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.componentCoordinator.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.taskScheduler.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.stateManager.getStatus = jest.fn().mockReturnValue({ healthy: true });

            const status = orchestrator.getStatus();

            expect(status.initialized).toBe(true);
            expect(status.shuttingDown).toBe(false);
            expect(status.uptime).toBeGreaterThan(0);
            expect(status.metrics).toBeDefined();
            expect(status.components).toBeDefined();
        });

        test('should perform health check', async () => {
            // Mock component statuses
            orchestrator.workflowManager.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.componentCoordinator.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.taskScheduler.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.stateManager.getStatus = jest.fn().mockReturnValue({ healthy: true });

            const healthCheckPromise = new Promise((resolve) => {
                orchestrator.once('healthCheckPassed', resolve);
            });

            // Trigger health check manually
            await orchestrator._performHealthCheck();

            await expect(healthCheckPromise).resolves.toBeDefined();
        });

        test('should detect unhealthy components', async () => {
            // Mock unhealthy component
            orchestrator.workflowManager.getStatus = jest.fn().mockReturnValue({ healthy: false });
            orchestrator.componentCoordinator.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.taskScheduler.getStatus = jest.fn().mockReturnValue({ healthy: true });
            orchestrator.stateManager.getStatus = jest.fn().mockReturnValue({ healthy: true });

            const healthCheckPromise = new Promise((resolve) => {
                orchestrator.once('healthCheckFailed', resolve);
            });

            await orchestrator._performHealthCheck();

            const result = await healthCheckPromise;
            expect(result.unhealthyComponents).toContain('workflowManager');
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should handle component timeout error', async () => {
            const error = new Error('Component timeout');
            error.code = 'COMPONENT_TIMEOUT';
            error.componentId = 'component-123';

            orchestrator.componentCoordinator.reconnectComponent = jest.fn().mockResolvedValue();

            const recoveryPromise = new Promise((resolve) => {
                orchestrator.once('errorRecovered', resolve);
            });

            await orchestrator._handleError(error);

            await expect(recoveryPromise).resolves.toBe(error);
            expect(orchestrator.componentCoordinator.reconnectComponent).toHaveBeenCalledWith('component-123');
        });

        test('should handle workflow failure error', async () => {
            const error = new Error('Workflow failed');
            error.code = 'WORKFLOW_FAILED';
            error.workflowId = 'workflow-123';

            orchestrator.workflowManager.retryWorkflow = jest.fn().mockResolvedValue();

            await orchestrator._handleError(error);

            expect(orchestrator.workflowManager.retryWorkflow).toHaveBeenCalledWith('workflow-123');
        });

        test('should handle task failure error', async () => {
            const error = new Error('Task failed');
            error.code = 'TASK_FAILED';
            error.taskId = 'task-123';

            orchestrator.taskScheduler.retryTask = jest.fn().mockResolvedValue();

            await orchestrator._handleError(error);

            expect(orchestrator.taskScheduler.retryTask).toHaveBeenCalledWith('task-123');
        });

        test('should handle error recovery failure', async () => {
            const error = new Error('Component timeout');
            error.code = 'COMPONENT_TIMEOUT';
            error.componentId = 'component-123';

            const recoveryError = new Error('Recovery failed');
            orchestrator.componentCoordinator.reconnectComponent = jest.fn().mockRejectedValue(recoveryError);

            const recoveryFailedPromise = new Promise((resolve) => {
                orchestrator.once('errorRecoveryFailed', resolve);
            });

            await orchestrator._handleError(error);

            const result = await recoveryFailedPromise;
            expect(result.originalError).toBe(error);
            expect(result.recoveryError).toBe(recoveryError);
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should handle workflow completed event', () => {
            const workflowData = { workflowId: 'workflow-123' };

            const eventPromise = new Promise((resolve) => {
                orchestrator.once('workflowCompleted', resolve);
            });

            orchestrator.workflowManager.emit('workflowCompleted', workflowData);

            return expect(eventPromise).resolves.toBe(workflowData);
        });

        test('should handle workflow failed event', () => {
            const workflowData = { workflowId: 'workflow-123' };

            const eventPromise = new Promise((resolve) => {
                orchestrator.once('workflowFailed', resolve);
            });

            orchestrator.workflowManager.emit('workflowFailed', workflowData);

            return expect(eventPromise).resolves.toBe(workflowData);
        });

        test('should handle task completed event', () => {
            const taskData = { taskId: 'task-123' };

            const eventPromise = new Promise((resolve) => {
                orchestrator.once('taskCompleted', resolve);
            });

            orchestrator.taskScheduler.emit('taskCompleted', taskData);

            return expect(eventPromise).resolves.toBe(taskData);
        });

        test('should update metrics on events', () => {
            orchestrator.workflowManager.emit('workflowCompleted', { workflowId: 'workflow-123' });
            expect(orchestrator.metrics.workflowsCompleted).toBe(1);

            orchestrator.workflowManager.emit('workflowFailed', { workflowId: 'workflow-456' });
            expect(orchestrator.metrics.workflowsFailed).toBe(1);

            orchestrator.taskScheduler.emit('taskCompleted', { taskId: 'task-123' });
            expect(orchestrator.metrics.tasksCompleted).toBe(1);
        });
    });

    describe('Shutdown', () => {
        beforeEach(async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();
        });

        test('should shutdown gracefully', async () => {
            orchestrator.workflowManager.shutdown = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.shutdown = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.shutdown = jest.fn().mockResolvedValue();
            orchestrator.stateManager.shutdown = jest.fn().mockResolvedValue();

            await orchestrator.shutdown();

            expect(orchestrator.isShuttingDown).toBe(true);
            expect(orchestrator.healthCheckTimer).toBeNull();
            expect(orchestrator.workflowManager.shutdown).toHaveBeenCalled();
            expect(orchestrator.taskScheduler.shutdown).toHaveBeenCalled();
            expect(orchestrator.componentCoordinator.shutdown).toHaveBeenCalled();
            expect(orchestrator.stateManager.shutdown).toHaveBeenCalled();
        });

        test('should not shutdown twice', async () => {
            orchestrator.workflowManager.shutdown = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.shutdown = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.shutdown = jest.fn().mockResolvedValue();
            orchestrator.stateManager.shutdown = jest.fn().mockResolvedValue();

            await orchestrator.shutdown();
            await orchestrator.shutdown();

            expect(orchestrator.workflowManager.shutdown).toHaveBeenCalledTimes(1);
        });

        test('should handle shutdown errors', async () => {
            const error = new Error('Shutdown failed');
            orchestrator.workflowManager.shutdown = jest.fn().mockRejectedValue(error);

            await expect(orchestrator.shutdown()).rejects.toThrow(error);
        });
    });

    describe('Validation', () => {
        test('should throw error when not initialized', async () => {
            const workflowDefinition = {
                name: 'Test Workflow',
                steps: [{ name: 'Step 1', type: 'task' }]
            };

            await expect(orchestrator.createWorkflow(workflowDefinition))
                .rejects.toThrow('System Orchestrator not initialized');
        });

        test('should throw error when shutting down', async () => {
            orchestrator.stateManager.initialize = jest.fn().mockResolvedValue();
            orchestrator.componentCoordinator.initialize = jest.fn().mockResolvedValue();
            orchestrator.taskScheduler.initialize = jest.fn().mockResolvedValue();
            orchestrator.workflowManager.initialize = jest.fn().mockResolvedValue();
            await orchestrator.initialize();

            orchestrator.isShuttingDown = true;

            const workflowDefinition = {
                name: 'Test Workflow',
                steps: [{ name: 'Step 1', type: 'task' }]
            };

            await expect(orchestrator.createWorkflow(workflowDefinition))
                .rejects.toThrow('System Orchestrator is shutting down');
        });
    });
});

