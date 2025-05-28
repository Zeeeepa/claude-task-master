/**
 * @fileoverview Database Integration Tests
 * @description Comprehensive tests for PostgreSQL database implementation
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DatabaseManager } from '../core/database_manager.js';
import { TaskModel } from '../database/models/task_model.js';
import { ContextModel } from '../database/models/context_model.js';
import { WorkflowModel } from '../database/models/workflow_model.js';
import { TaskStorageManager } from '../core/task_storage_manager.js';

// Test configuration
const testConfig = {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'codegen_taskmaster_test',
    user: process.env.TEST_DB_USER || 'test_user',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
    enable_mock: process.env.TEST_USE_MOCK === 'true',
    auto_migrate: true,
    enable_logging: false
};

describe('Database Integration Tests', () => {
    let dbManager;
    let taskModel;
    let contextModel;
    let workflowModel;
    let taskStorageManager;

    beforeAll(async () => {
        if (!testConfig.enable_mock) {
            // Initialize database manager
            dbManager = new DatabaseManager(testConfig);
            await dbManager.initialize();
            
            // Initialize models
            taskModel = new TaskModel(dbManager);
            contextModel = new ContextModel(dbManager);
            workflowModel = new WorkflowModel(dbManager);
        }
        
        // Initialize task storage manager
        taskStorageManager = new TaskStorageManager(testConfig);
        await taskStorageManager.initialize();
    });

    afterAll(async () => {
        if (dbManager) {
            await dbManager.shutdown();
        }
        if (taskStorageManager) {
            await taskStorageManager.shutdown();
        }
    });

    beforeEach(async () => {
        if (!testConfig.enable_mock && dbManager) {
            // Clean up test data
            await dbManager.query('DELETE FROM contexts');
            await dbManager.query('DELETE FROM pr_tracking');
            await dbManager.query('DELETE FROM workflows');
            await dbManager.query('DELETE FROM tasks');
        }
    });

    describe('Database Manager', () => {
        test('should initialize successfully', async () => {
            expect(dbManager?.isInitialized || testConfig.enable_mock).toBe(true);
        });

        test('should execute queries', async () => {
            if (testConfig.enable_mock) return;
            
            const result = await dbManager.query('SELECT NOW() as current_time');
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].current_time).toBeDefined();
        });

        test('should handle transactions', async () => {
            if (testConfig.enable_mock) return;
            
            const result = await dbManager.transaction(async (client) => {
                await client.query('SELECT 1 as test_value');
                return 'transaction_success';
            });
            
            expect(result).toBe('transaction_success');
        });

        test('should provide health status', async () => {
            if (testConfig.enable_mock) return;
            
            const health = await dbManager.getHealth();
            expect(health).toHaveProperty('isHealthy');
            expect(health).toHaveProperty('database');
        });
    });

    describe('Task Model', () => {
        const mockTask = {
            title: 'Test Task',
            description: 'Test task description',
            requirements: ['Requirement 1', 'Requirement 2'],
            acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
            complexityScore: 7,
            priority: 1,
            assignedTo: 'test_user',
            tags: ['test', 'integration'],
            estimatedHours: 8.5
        };

        test('should create a task', async () => {
            if (testConfig.enable_mock) return;
            
            const task = await taskModel.create(mockTask);
            
            expect(task).toHaveProperty('id');
            expect(task.title).toBe(mockTask.title);
            expect(task.complexityScore).toBe(mockTask.complexityScore);
            expect(task.status).toBe('pending');
            expect(task.createdAt).toBeDefined();
        });

        test('should find task by ID', async () => {
            if (testConfig.enable_mock) return;
            
            const createdTask = await taskModel.create(mockTask);
            const foundTask = await taskModel.findById(createdTask.id);
            
            expect(foundTask).toBeDefined();
            expect(foundTask.id).toBe(createdTask.id);
            expect(foundTask.title).toBe(mockTask.title);
        });

        test('should update task status', async () => {
            if (testConfig.enable_mock) return;
            
            const createdTask = await taskModel.create(mockTask);
            const updatedTask = await taskModel.updateStatus(createdTask.id, 'in_progress');
            
            expect(updatedTask.status).toBe('in_progress');
            expect(updatedTask.updatedAt).not.toBe(createdTask.updatedAt);
        });

        test('should find tasks by status', async () => {
            if (testConfig.enable_mock) return;
            
            await taskModel.create({ ...mockTask, title: 'Task 1' });
            await taskModel.create({ ...mockTask, title: 'Task 2' });
            
            const pendingTasks = await taskModel.findByStatus('pending');
            expect(pendingTasks).toHaveLength(2);
        });

        test('should get task statistics', async () => {
            if (testConfig.enable_mock) return;
            
            await taskModel.create(mockTask);
            await taskModel.create({ ...mockTask, title: 'Task 2', complexityScore: 5 });
            
            const stats = await taskModel.getStatistics();
            expect(stats.totalTasks).toBe(2);
            expect(stats.pendingTasks).toBe(2);
            expect(stats.avgComplexity).toBe(6); // (7 + 5) / 2
        });

        test('should search tasks', async () => {
            if (testConfig.enable_mock) return;
            
            await taskModel.create({ ...mockTask, title: 'Search Test Task' });
            await taskModel.create({ ...mockTask, title: 'Another Task' });
            
            const results = await taskModel.search('Search Test');
            expect(results).toHaveLength(1);
            expect(results[0].title).toBe('Search Test Task');
        });
    });

    describe('Context Model', () => {
        let testTaskId;

        beforeEach(async () => {
            if (!testConfig.enable_mock) {
                const task = await taskModel.create({
                    title: 'Context Test Task',
                    description: 'Task for context testing'
                });
                testTaskId = task.id;
            } else {
                testTaskId = 'mock_task_id';
            }
        });

        test('should create context', async () => {
            if (testConfig.enable_mock) return;
            
            const contextData = {
                test_field: 'test_value',
                timestamp: new Date()
            };
            
            const context = await contextModel.create(testTaskId, 'test_context', contextData);
            
            expect(context).toHaveProperty('id');
            expect(context.taskId).toBe(testTaskId);
            expect(context.contextType).toBe('test_context');
            expect(context.contextData.test_field).toBe('test_value');
        });

        test('should find contexts by task ID', async () => {
            if (testConfig.enable_mock) return;
            
            await contextModel.create(testTaskId, 'context1', { data: 'value1' });
            await contextModel.create(testTaskId, 'context2', { data: 'value2' });
            
            const contexts = await contextModel.findByTaskId(testTaskId);
            expect(contexts).toHaveLength(2);
        });

        test('should find contexts by type', async () => {
            if (testConfig.enable_mock) return;
            
            await contextModel.create(testTaskId, 'ai_interaction', { agent: 'test_agent' });
            
            const contexts = await contextModel.findByType('ai_interaction');
            expect(contexts).toHaveLength(1);
            expect(contexts[0].contextData.agent).toBe('test_agent');
        });

        test('should get context statistics', async () => {
            if (testConfig.enable_mock) return;
            
            await contextModel.create(testTaskId, 'validation', { score: 95 });
            await contextModel.create(testTaskId, 'validation', { score: 87 });
            await contextModel.create(testTaskId, 'ai_interaction', { agent: 'test' });
            
            const stats = await contextModel.getTaskContextStats(testTaskId);
            expect(stats.totalContexts).toBe(3);
            expect(stats.contextTypes.validation.count).toBe(2);
            expect(stats.contextTypes.ai_interaction.count).toBe(1);
        });
    });

    describe('Workflow Model', () => {
        const mockWorkflow = {
            name: 'Test Workflow',
            status: 'pending',
            configuration: {
                max_concurrent_tasks: 5,
                timeout: 3600
            },
            state: {
                current_step: 1,
                progress: 0
            },
            taskIds: [],
            metadata: {
                created_by: 'test_user'
            }
        };

        test('should create workflow', async () => {
            if (testConfig.enable_mock) return;
            
            const workflow = await workflowModel.create(mockWorkflow);
            
            expect(workflow).toHaveProperty('id');
            expect(workflow.name).toBe(mockWorkflow.name);
            expect(workflow.status).toBe('pending');
            expect(workflow.configuration.max_concurrent_tasks).toBe(5);
        });

        test('should find workflow by name', async () => {
            if (testConfig.enable_mock) return;
            
            await workflowModel.create(mockWorkflow);
            const foundWorkflow = await workflowModel.findByName(mockWorkflow.name);
            
            expect(foundWorkflow).toBeDefined();
            expect(foundWorkflow.name).toBe(mockWorkflow.name);
        });

        test('should update workflow status', async () => {
            if (testConfig.enable_mock) return;
            
            const workflow = await workflowModel.create(mockWorkflow);
            const updatedWorkflow = await workflowModel.updateStatus(workflow.id, 'running');
            
            expect(updatedWorkflow.status).toBe('running');
        });

        test('should add and remove tasks', async () => {
            if (testConfig.enable_mock) return;
            
            const workflow = await workflowModel.create(mockWorkflow);
            const task = await taskModel.create({
                title: 'Workflow Task',
                description: 'Task for workflow testing'
            });
            
            // Add task
            const updatedWorkflow = await workflowModel.addTask(workflow.id, task.id);
            expect(updatedWorkflow.taskIds).toContain(task.id);
            
            // Remove task
            const finalWorkflow = await workflowModel.removeTask(workflow.id, task.id);
            expect(finalWorkflow.taskIds).not.toContain(task.id);
        });

        test('should get workflow progress', async () => {
            if (testConfig.enable_mock) return;
            
            const workflow = await workflowModel.create(mockWorkflow);
            const task1 = await taskModel.create({ title: 'Task 1' });
            const task2 = await taskModel.create({ title: 'Task 2' });
            
            // Add tasks to workflow
            await workflowModel.addTask(workflow.id, task1.id);
            await workflowModel.addTask(workflow.id, task2.id);
            
            // Complete one task
            await taskModel.updateStatus(task1.id, 'completed');
            
            const progress = await workflowModel.getProgress(workflow.id);
            expect(progress.totalTasks).toBe(2);
            expect(progress.completedTasks).toBe(1);
            expect(progress.progressPercentage).toBe(50);
        });
    });

    describe('Task Storage Manager Integration', () => {
        const mockRequirement = {
            id: 'req_123',
            description: 'Test requirement',
            priority: 'high'
        };

        const mockTask = {
            title: 'Integration Test Task',
            description: 'Task for integration testing',
            requirements: ['Req 1', 'Req 2'],
            acceptanceCriteria: ['Criteria 1'],
            complexityScore: 6,
            priority: 1,
            estimatedHours: 4
        };

        test('should store and retrieve tasks', async () => {
            const taskId = await taskStorageManager.storeAtomicTask(mockTask, mockRequirement);
            expect(taskId).toBeDefined();
            
            const retrievedTask = await taskStorageManager.retrieveTaskById(taskId);
            expect(retrievedTask).toBeDefined();
            expect(retrievedTask.title).toBe(mockTask.title);
            expect(retrievedTask.complexityScore).toBe(mockTask.complexityScore);
        });

        test('should update task status', async () => {
            const taskId = await taskStorageManager.storeAtomicTask(mockTask, mockRequirement);
            
            await taskStorageManager.updateTaskStatus(taskId, 'in_progress');
            
            const updatedTask = await taskStorageManager.retrieveTaskById(taskId);
            expect(updatedTask.status).toBe('in_progress');
        });

        test('should store and retrieve context', async () => {
            const taskId = await taskStorageManager.storeAtomicTask(mockTask, mockRequirement);
            
            await taskStorageManager.storeTaskContext(taskId, 'test_context', {
                test_data: 'test_value'
            });
            
            const fullContext = await taskStorageManager.getTaskFullContext(taskId);
            expect(fullContext.metadata.test_context).toBeDefined();
            expect(fullContext.metadata.test_context.test_data).toBe('test_value');
        });

        test('should store AI interactions', async () => {
            const taskId = await taskStorageManager.storeAtomicTask(mockTask, mockRequirement);
            
            await taskStorageManager.storeAIInteraction(taskId, 'test_agent', {
                type: 'code_generation',
                request: { prompt: 'Generate code' },
                response: { code: 'console.log("test");' },
                execution_time_ms: 1500,
                success: true
            });
            
            const fullContext = await taskStorageManager.getTaskFullContext(taskId);
            expect(fullContext.ai_interactions).toHaveLength(1);
            expect(fullContext.ai_interactions[0].agent_name).toBe('test_agent');
        });

        test('should handle task dependencies', async () => {
            const parentTaskId = await taskStorageManager.storeAtomicTask(
                { ...mockTask, title: 'Parent Task' }, 
                mockRequirement
            );
            const childTaskId = await taskStorageManager.storeAtomicTask(
                { ...mockTask, title: 'Child Task' }, 
                mockRequirement
            );
            
            await taskStorageManager.addTaskDependency(parentTaskId, childTaskId, 'blocks');
            
            const dependencies = await taskStorageManager.getTaskDependencies(childTaskId);
            expect(dependencies).toContain(parentTaskId);
        });

        test('should get task metrics', async () => {
            await taskStorageManager.storeAtomicTask(mockTask, mockRequirement);
            await taskStorageManager.storeAtomicTask(
                { ...mockTask, title: 'Task 2' }, 
                mockRequirement
            );
            
            const metrics = await taskStorageManager.getTaskMetrics();
            expect(metrics.total_tasks || metrics.totalTasks).toBeGreaterThanOrEqual(2);
        });

        test('should provide health status', async () => {
            const health = await taskStorageManager.getHealth();
            expect(health).toHaveProperty('status');
            expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
        });

        test('should handle concurrent operations', async () => {
            const promises = Array(5).fill().map((_, index) => 
                taskStorageManager.storeAtomicTask(
                    { ...mockTask, title: `Concurrent Task ${index}` },
                    mockRequirement
                )
            );
            
            const taskIds = await Promise.all(promises);
            expect(taskIds).toHaveLength(5);
            taskIds.forEach(id => expect(id).toBeDefined());
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid task data', async () => {
            await expect(
                taskStorageManager.storeAtomicTask({}, {})
            ).rejects.toThrow();
        });

        test('should handle non-existent task retrieval', async () => {
            const result = await taskStorageManager.retrieveTaskById('non_existent_id');
            expect(result).toBeNull();
        });

        test('should handle database connection issues gracefully', async () => {
            if (testConfig.enable_mock) return;
            
            // This test would require a way to simulate connection failures
            // For now, we just ensure the health check works
            const health = await taskStorageManager.getHealth();
            expect(health).toHaveProperty('status');
        });
    });
});

describe('Performance Tests', () => {
    let taskStorageManager;

    beforeAll(async () => {
        taskStorageManager = new TaskStorageManager({
            ...testConfig,
            enable_logging: false
        });
        await taskStorageManager.initialize();
    });

    afterAll(async () => {
        if (taskStorageManager) {
            await taskStorageManager.shutdown();
        }
    });

    test('should handle bulk task creation efficiently', async () => {
        const startTime = Date.now();
        const taskCount = 50;
        
        const promises = Array(taskCount).fill().map((_, index) => 
            taskStorageManager.storeAtomicTask(
                {
                    title: `Bulk Task ${index}`,
                    description: `Description for task ${index}`,
                    complexityScore: Math.floor(Math.random() * 10) + 1
                },
                { id: `req_${index}` }
            )
        );
        
        const taskIds = await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        expect(taskIds).toHaveLength(taskCount);
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        
        console.log(`Created ${taskCount} tasks in ${duration}ms (${Math.round(duration/taskCount)}ms per task)`);
    });
});

