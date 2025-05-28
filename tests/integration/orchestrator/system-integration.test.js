/**
 * @fileoverview Integration tests for System Orchestrator
 */

import { jest } from '@jest/globals';
import { SystemOrchestrator } from '../../../src/orchestrator/orchestrator.js';
import { TaskPriority } from '../../../src/orchestrator/task-scheduler.js';

// Mock dependencies
jest.mock('../../../src/scripts/modules/utils.js', () => ({
    log: jest.fn()
}));

describe('System Orchestrator Integration Tests', () => {
    let orchestrator;
    let testConfig;

    beforeEach(() => {
        testConfig = {
            maxConcurrentWorkflows: 3,
            maxConcurrentTasks: 10,
            healthCheckInterval: 5000,
            enableMonitoring: true,
            enableErrorRecovery: true,
            retryAttempts: 2,
            retryDelay: 100,
            
            // Faster intervals for testing
            workflow: {
                stepTimeout: 5000,
                workflowTimeout: 30000,
                retryDelay: 100
            },
            components: {
                messageTimeout: 5000,
                heartbeatInterval: 2000,
                retryDelay: 100
            },
            tasks: {
                taskTimeout: 5000,
                schedulingInterval: 100,
                retryDelay: 100,
                deadlockDetectionInterval: 2000
            },
            state: {
                enablePersistence: false,
                enableVersioning: true,
                enableBackup: false,
                persistenceInterval: 1000
            }
        };

        orchestrator = new SystemOrchestrator(testConfig);
    });

    afterEach(async () => {
        if (orchestrator.isInitialized) {
            await orchestrator.shutdown();
        }
        jest.clearAllMocks();
    });

    describe('Full System Initialization', () => {
        test('should initialize all components successfully', async () => {
            await orchestrator.initialize();

            expect(orchestrator.isInitialized).toBe(true);
            expect(orchestrator.workflowManager.isInitialized).toBe(true);
            expect(orchestrator.componentCoordinator.isInitialized).toBe(true);
            expect(orchestrator.taskScheduler.isInitialized).toBe(true);
            expect(orchestrator.stateManager.isInitialized).toBe(true);
        });

        test('should start health monitoring', async () => {
            await orchestrator.initialize();

            expect(orchestrator.healthCheckTimer).toBeDefined();
            
            // Wait for health check
            await new Promise(resolve => {
                orchestrator.once('healthCheckPassed', resolve);
            });
        });

        test('should handle component initialization failure gracefully', async () => {
            // Mock a component initialization failure
            const originalInit = orchestrator.stateManager.initialize;
            orchestrator.stateManager.initialize = jest.fn().mockRejectedValue(new Error('State manager init failed'));

            await expect(orchestrator.initialize()).rejects.toThrow('Orchestrator initialization failed');
            expect(orchestrator.isInitialized).toBe(false);

            // Restore original method
            orchestrator.stateManager.initialize = originalInit;
        });
    });

    describe('End-to-End Workflow Execution', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should execute a simple workflow end-to-end', async () => {
            const workflowDefinition = {
                name: 'Simple Test Workflow',
                description: 'A test workflow with sequential steps',
                steps: [
                    {
                        name: 'Initialize',
                        type: 'task',
                        config: { action: 'initialize' }
                    },
                    {
                        name: 'Process',
                        type: 'task',
                        config: { action: 'process' }
                    },
                    {
                        name: 'Finalize',
                        type: 'task',
                        config: { action: 'finalize' }
                    }
                ]
            };

            // Mock task execution
            let executedTasks = [];
            orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
                executedTasks.push(task.config.action);
                setTimeout(() => callback(null, { success: true, action: task.config.action }), 50);
            });

            const workflowId = await orchestrator.createWorkflow(workflowDefinition);
            expect(workflowId).toBeDefined();

            // Wait for workflow completion
            const completionPromise = new Promise((resolve) => {
                orchestrator.once('workflowCompleted', resolve);
            });

            await orchestrator.workflowManager.startWorkflow(workflowId);
            const completionData = await completionPromise;

            expect(completionData.workflowId).toBe(workflowId);
            expect(executedTasks).toEqual(['initialize', 'process', 'finalize']);
            expect(orchestrator.metrics.workflowsCreated).toBe(1);
            expect(orchestrator.metrics.workflowsCompleted).toBe(1);
        });

        test('should handle workflow with parallel steps', async () => {
            const workflowDefinition = {
                name: 'Parallel Test Workflow',
                config: { parallel: true },
                steps: [
                    {
                        name: 'Task A',
                        type: 'task',
                        config: { action: 'taskA', duration: 100 }
                    },
                    {
                        name: 'Task B',
                        type: 'task',
                        config: { action: 'taskB', duration: 150 }
                    },
                    {
                        name: 'Task C',
                        type: 'task',
                        config: { action: 'taskC', duration: 80 }
                    }
                ]
            };

            let executedTasks = [];
            let startTimes = {};
            
            orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
                const action = task.config.action;
                startTimes[action] = Date.now();
                executedTasks.push(action);
                
                setTimeout(() => {
                    callback(null, { success: true, action });
                }, task.config.duration);
            });

            const workflowId = await orchestrator.createWorkflow(workflowDefinition);

            const completionPromise = new Promise((resolve) => {
                orchestrator.once('workflowCompleted', resolve);
            });

            const startTime = Date.now();
            await orchestrator.workflowManager.startWorkflow(workflowId);
            await completionPromise;
            const endTime = Date.now();

            // All tasks should have started roughly at the same time (parallel execution)
            const taskStartTimes = Object.values(startTimes);
            const maxStartTimeDiff = Math.max(...taskStartTimes) - Math.min(...taskStartTimes);
            expect(maxStartTimeDiff).toBeLessThan(50); // Should start within 50ms of each other

            // Total execution time should be close to the longest task (150ms) rather than sum (330ms)
            const totalTime = endTime - startTime;
            expect(totalTime).toBeLessThan(250); // Should be much less than sequential execution
            expect(executedTasks).toHaveLength(3);
        });

        test('should handle workflow failure and retry', async () => {
            const workflowDefinition = {
                name: 'Failing Test Workflow',
                steps: [
                    {
                        name: 'Failing Task',
                        type: 'task',
                        config: { action: 'fail' }
                    }
                ]
            };

            let attemptCount = 0;
            orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
                attemptCount++;
                if (attemptCount < 3) {
                    setTimeout(() => callback(new Error('Task failed')), 50);
                } else {
                    setTimeout(() => callback(null, { success: true, attempt: attemptCount }), 50);
                }
            });

            const workflowId = await orchestrator.createWorkflow(workflowDefinition);

            const completionPromise = new Promise((resolve) => {
                orchestrator.once('workflowCompleted', resolve);
            });

            await orchestrator.workflowManager.startWorkflow(workflowId);
            await completionPromise;

            expect(attemptCount).toBe(3); // Should have retried twice
            expect(orchestrator.metrics.workflowsCompleted).toBe(1);
        });
    });

    describe('Task Scheduling Integration', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should schedule and execute tasks with priorities', async () => {
            const tasks = [
                { name: 'Low Priority Task', priority: TaskPriority.LOW, duration: 100 },
                { name: 'High Priority Task', priority: TaskPriority.HIGH, duration: 100 },
                { name: 'Normal Priority Task', priority: TaskPriority.NORMAL, duration: 100 },
                { name: 'Critical Priority Task', priority: TaskPriority.CRITICAL, duration: 100 }
            ];

            let executionOrder = [];
            orchestrator.taskScheduler.on('executeTask', ({ task, callback }) => {
                executionOrder.push(task.name);
                setTimeout(() => callback(null, { success: true }), task.duration);
            });

            // Schedule all tasks
            const taskIds = [];
            for (const task of tasks) {
                const taskId = await orchestrator.scheduleTask(task);
                taskIds.push(taskId);
            }

            // Wait for all tasks to complete
            const completionPromises = taskIds.map(taskId => 
                new Promise(resolve => {
                    const checkCompletion = async () => {
                        const status = await orchestrator.getTaskStatus(taskId);
                        if (status.state === 'completed') {
                            resolve();
                        } else {
                            setTimeout(checkCompletion, 50);
                        }
                    };
                    checkCompletion();
                })
            );

            await Promise.all(completionPromises);

            // Critical should execute first, then High, then Normal, then Low
            expect(executionOrder[0]).toBe('Critical Priority Task');
            expect(executionOrder[1]).toBe('High Priority Task');
            expect(executionOrder[2]).toBe('Normal Priority Task');
            expect(executionOrder[3]).toBe('Low Priority Task');
        });

        test('should handle task dependencies correctly', async () => {
            // Create tasks with dependencies
            const taskA = await orchestrator.scheduleTask({
                name: 'Task A',
                duration: 100
            });

            const taskB = await orchestrator.scheduleTask({
                name: 'Task B',
                dependencies: [taskA],
                duration: 100
            });

            const taskC = await orchestrator.scheduleTask({
                name: 'Task C',
                dependencies: [taskA, taskB],
                duration: 100
            });

            let executionOrder = [];
            orchestrator.taskScheduler.on('executeTask', ({ task, callback }) => {
                executionOrder.push(task.name);
                setTimeout(() => callback(null, { success: true }), task.duration);
            });

            // Wait for all tasks to complete
            const completionPromise = new Promise(resolve => {
                let completedCount = 0;
                orchestrator.on('taskCompleted', () => {
                    completedCount++;
                    if (completedCount === 3) {
                        resolve();
                    }
                });
            });

            await completionPromise;

            // Should execute in dependency order: A, then B, then C
            expect(executionOrder).toEqual(['Task A', 'Task B', 'Task C']);
        });

        test('should detect and handle circular dependencies', async () => {
            const taskA = await orchestrator.scheduleTask({
                name: 'Task A',
                dependencies: ['task-b'] // Will be created later
            });

            const taskB = await orchestrator.scheduleTask({
                name: 'Task B',
                dependencies: [taskA] // Creates circular dependency
            });

            // Update task A to depend on task B (creating the circle)
            const taskAObj = orchestrator.taskScheduler.tasks.get(taskA);
            taskAObj.dependencies = [taskB];

            let deadlockDetected = false;
            orchestrator.taskScheduler.on('deadlockDetected', () => {
                deadlockDetected = true;
            });

            // Wait for deadlock detection
            await new Promise(resolve => setTimeout(resolve, 3000));

            expect(deadlockDetected).toBe(true);
        });
    });

    describe('Component Communication Integration', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should register and communicate with components', async () => {
            const componentId = 'test-component';
            const componentInfo = {
                name: 'Test Component',
                type: 'processor',
                version: '1.0.0',
                capabilities: ['process', 'validate']
            };

            // Register component
            await orchestrator.componentCoordinator.registerComponent(componentId, componentInfo);

            // Mock component response
            orchestrator.componentCoordinator.on('messageToComponent', ({ componentId: id, message }) => {
                if (id === componentId) {
                    // Simulate component processing the message
                    setTimeout(() => {
                        orchestrator.componentCoordinator.processMessage({
                            id: 'response-123',
                            type: 'response',
                            from: componentId,
                            to: 'orchestrator',
                            correlationId: message.id,
                            payload: { success: true, processed: message.payload }
                        });
                    }, 50);
                }
            });

            // Send message to component
            const message = {
                type: 'request',
                payload: { action: 'process', data: 'test data' }
            };

            const response = await orchestrator.sendMessage(componentId, message);

            expect(response.success).toBe(true);
            expect(response.processed).toEqual(message.payload);
            expect(orchestrator.metrics.componentMessages).toBe(1);
        });

        test('should handle component heartbeats', async () => {
            const componentId = 'heartbeat-component';
            
            await orchestrator.componentCoordinator.registerComponent(componentId, {
                name: 'Heartbeat Component'
            });

            // Mock component heartbeat responses
            orchestrator.componentCoordinator.on('messageToComponent', ({ componentId: id, message }) => {
                if (id === componentId && message.type === 'heartbeat') {
                    setTimeout(() => {
                        orchestrator.componentCoordinator.processMessage({
                            id: 'heartbeat-response',
                            type: 'heartbeat',
                            from: componentId,
                            to: 'orchestrator',
                            payload: { timestamp: new Date().toISOString() }
                        });
                    }, 10);
                }
            });

            // Wait for heartbeat exchange
            await new Promise(resolve => setTimeout(resolve, 3000));

            const componentStatus = orchestrator.componentCoordinator.getComponentStatus(componentId);
            expect(componentStatus.state).toBe('connected');
            expect(new Date(componentStatus.lastHeartbeat)).toBeInstanceOf(Date);
        });

        test('should broadcast messages to multiple components', async () => {
            const components = ['comp-1', 'comp-2', 'comp-3'];
            
            // Register multiple components
            for (const compId of components) {
                await orchestrator.componentCoordinator.registerComponent(compId, {
                    name: `Component ${compId}`
                });
            }

            let receivedMessages = [];

            // Mock component responses
            orchestrator.componentCoordinator.on('messageToComponent', ({ componentId, message }) => {
                receivedMessages.push({ componentId, messageId: message.id });
                
                // Simulate component response
                setTimeout(() => {
                    orchestrator.componentCoordinator.processMessage({
                        id: `response-${componentId}`,
                        type: 'response',
                        from: componentId,
                        to: 'orchestrator',
                        correlationId: message.id,
                        payload: { componentId, received: true }
                    });
                }, 50);
            });

            // Broadcast message
            const broadcastMessage = {
                type: 'event',
                payload: { event: 'system-update', data: 'update data' }
            };

            const responses = await orchestrator.componentCoordinator.broadcastMessage(broadcastMessage);

            expect(responses).toHaveLength(3);
            expect(receivedMessages).toHaveLength(3);
            
            // All components should have received the message
            const receivedComponentIds = receivedMessages.map(r => r.componentId);
            expect(receivedComponentIds).toEqual(expect.arrayContaining(components));
        });
    });

    describe('State Management Integration', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should manage state across components', async () => {
            const stateManager = orchestrator.stateManager;

            // Set initial state
            await stateManager.setState('workflow.current', 'workflow-123');
            await stateManager.setState('tasks.active', ['task-1', 'task-2']);
            await stateManager.setState('components.status', { 'comp-1': 'connected' });

            // Verify state retrieval
            expect(stateManager.getState('workflow.current')).toBe('workflow-123');
            expect(stateManager.getState('tasks.active')).toEqual(['task-1', 'task-2']);
            expect(stateManager.getState('components.status')).toEqual({ 'comp-1': 'connected' });

            // Test state subscriptions
            let stateChanges = [];
            const subscriptionId = stateManager.subscribe('workflow.*', (change) => {
                stateChanges.push(change);
            });

            await stateManager.setState('workflow.current', 'workflow-456');
            await stateManager.setState('workflow.status', 'running');

            // Give time for subscription callbacks
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(stateChanges).toHaveLength(2);
            expect(stateChanges[0].newValue).toBe('workflow-456');
            expect(stateChanges[1].newValue).toBe('running');

            stateManager.unsubscribe(subscriptionId);
        });

        test('should handle state versioning', async () => {
            const stateManager = orchestrator.stateManager;
            const key = 'test.versioned';

            // Set multiple versions
            await stateManager.setState(key, 'version 1');
            await stateManager.setState(key, 'version 2');
            await stateManager.setState(key, 'version 3');

            // Check current state
            expect(stateManager.getState(key)).toBe('version 3');

            // Check versions
            const versions = stateManager.getStateVersions(key);
            expect(versions).toHaveLength(3);
            expect(versions[0].value).toBe('version 1');
            expect(versions[1].value).toBe('version 2');
            expect(versions[2].value).toBe('version 3');

            // Restore previous version
            await stateManager.restoreStateVersion(key, 2);
            expect(stateManager.getState(key)).toBe('version 2');
        });

        test('should create and restore snapshots', async () => {
            const stateManager = orchestrator.stateManager;

            // Set up initial state
            await stateManager.setState('app.name', 'Test App');
            await stateManager.setState('app.version', '1.0.0');
            await stateManager.setState('user.count', 100);

            // Create snapshot
            const snapshotId = await stateManager.createSnapshot({
                metadata: { description: 'Initial state snapshot' }
            });

            expect(snapshotId).toBeDefined();

            // Modify state
            await stateManager.setState('app.version', '2.0.0');
            await stateManager.setState('user.count', 200);
            await stateManager.setState('new.feature', 'enabled');

            // Verify changes
            expect(stateManager.getState('app.version')).toBe('2.0.0');
            expect(stateManager.getState('user.count')).toBe(200);
            expect(stateManager.getState('new.feature')).toBe('enabled');

            // Restore from snapshot
            await stateManager.restoreSnapshot(snapshotId);

            // Verify restoration
            expect(stateManager.getState('app.name')).toBe('Test App');
            expect(stateManager.getState('app.version')).toBe('1.0.0');
            expect(stateManager.getState('user.count')).toBe(100);
            expect(stateManager.getState('new.feature')).toBeNull();
        });
    });

    describe('Error Recovery Integration', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should recover from component failures', async () => {
            const componentId = 'failing-component';
            
            await orchestrator.componentCoordinator.registerComponent(componentId, {
                name: 'Failing Component'
            });

            // Simulate component failure
            const component = orchestrator.componentCoordinator.components.get(componentId);
            component.state = 'error';

            let recoveryAttempted = false;
            orchestrator.componentCoordinator.reconnectComponent = jest.fn().mockImplementation(async (id) => {
                recoveryAttempted = true;
                const comp = orchestrator.componentCoordinator.components.get(id);
                comp.state = 'connected';
            });

            // Trigger error recovery
            const error = new Error('Component failed');
            error.code = 'COMPONENT_TIMEOUT';
            error.componentId = componentId;

            await orchestrator._handleError(error);

            expect(recoveryAttempted).toBe(true);
            expect(orchestrator.componentCoordinator.reconnectComponent).toHaveBeenCalledWith(componentId);
        });

        test('should handle cascading failures gracefully', async () => {
            // Create a workflow with dependent tasks
            const workflowDefinition = {
                name: 'Cascading Failure Test',
                steps: [
                    { name: 'Step 1', type: 'task', config: { action: 'step1' } },
                    { name: 'Step 2', type: 'task', config: { action: 'step2' } },
                    { name: 'Step 3', type: 'task', config: { action: 'step3' } }
                ]
            };

            let stepCount = 0;
            orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
                stepCount++;
                if (stepCount === 2) {
                    // Fail the second step
                    setTimeout(() => callback(new Error('Step 2 failed')), 50);
                } else {
                    setTimeout(() => callback(null, { success: true }), 50);
                }
            });

            const workflowId = await orchestrator.createWorkflow(workflowDefinition);

            const failurePromise = new Promise((resolve) => {
                orchestrator.once('workflowFailed', resolve);
            });

            await orchestrator.workflowManager.startWorkflow(workflowId);
            const failureData = await failurePromise;

            expect(failureData.workflowId).toBe(workflowId);
            expect(orchestrator.metrics.workflowsFailed).toBe(1);

            // System should still be healthy despite workflow failure
            const status = orchestrator.getStatus();
            expect(status.healthy).toBe(true);
        });
    });

    describe('Performance and Scalability', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should handle concurrent workflow execution', async () => {
            const workflowCount = 5;
            const workflows = [];

            // Create multiple workflows
            for (let i = 0; i < workflowCount; i++) {
                const workflowDefinition = {
                    name: `Concurrent Workflow ${i}`,
                    steps: [
                        { name: 'Step 1', type: 'task', config: { workflowIndex: i, duration: 100 } }
                    ]
                };
                workflows.push(workflowDefinition);
            }

            let executedWorkflows = [];
            orchestrator.workflowManager.on('executeTask', ({ task, callback }) => {
                executedWorkflows.push(task.config.workflowIndex);
                setTimeout(() => callback(null, { success: true }), task.config.duration);
            });

            // Start all workflows concurrently
            const workflowIds = [];
            for (const workflow of workflows) {
                const workflowId = await orchestrator.createWorkflow(workflow);
                workflowIds.push(workflowId);
                orchestrator.workflowManager.startWorkflow(workflowId);
            }

            // Wait for all workflows to complete
            const completionPromise = new Promise(resolve => {
                let completedCount = 0;
                orchestrator.on('workflowCompleted', () => {
                    completedCount++;
                    if (completedCount === workflowCount) {
                        resolve();
                    }
                });
            });

            await completionPromise;

            expect(executedWorkflows).toHaveLength(workflowCount);
            expect(orchestrator.metrics.workflowsCompleted).toBe(workflowCount);
        });

        test('should maintain performance under high task load', async () => {
            const taskCount = 20;
            const tasks = [];

            // Create many tasks
            for (let i = 0; i < taskCount; i++) {
                tasks.push({
                    name: `Load Test Task ${i}`,
                    priority: Math.floor(Math.random() * 5) + 1,
                    duration: Math.floor(Math.random() * 100) + 50
                });
            }

            let executedTasks = 0;
            orchestrator.taskScheduler.on('executeTask', ({ task, callback }) => {
                executedTasks++;
                setTimeout(() => callback(null, { success: true }), task.duration);
            });

            // Schedule all tasks
            const startTime = Date.now();
            const taskIds = [];
            for (const task of tasks) {
                const taskId = await orchestrator.scheduleTask(task);
                taskIds.push(taskId);
            }

            // Wait for all tasks to complete
            const completionPromise = new Promise(resolve => {
                let completedCount = 0;
                orchestrator.on('taskCompleted', () => {
                    completedCount++;
                    if (completedCount === taskCount) {
                        resolve();
                    }
                });
            });

            await completionPromise;
            const endTime = Date.now();

            expect(executedTasks).toBe(taskCount);
            expect(orchestrator.metrics.tasksCompleted).toBe(taskCount);
            
            // Should complete within reasonable time (considering concurrent execution)
            const totalTime = endTime - startTime;
            expect(totalTime).toBeLessThan(5000); // Should be much faster than sequential execution
        });
    });
});

