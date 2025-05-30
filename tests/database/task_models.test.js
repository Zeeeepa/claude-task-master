/**
 * @fileoverview Test suite for Task and Workflow database models
 * @description Comprehensive tests for database operations and model functionality
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { getConnection, resetConnection } from '../../src/database/connection/connection_manager.js';
import { taskModel, subtaskModel } from '../../src/database/models/TaskModel.js';
import { workflowModel, workflowStepModel } from '../../src/database/models/WorkflowModel.js';

describe('Database Models Integration Tests', () => {
    let db;
    let testWorkflowId;
    let testTaskId;
    let testSubtaskId;

    beforeAll(async () => {
        // Initialize database connection
        db = getConnection();
        await db.initialize();

        // Run migrations to ensure schema is up to date
        // Note: In a real environment, this would be handled by the migration system
        console.log('Database connection established for testing');
    });

    afterAll(async () => {
        // Clean up database connection
        if (db) {
            await db.shutdown();
        }
        resetConnection();
    });

    beforeEach(async () => {
        // Create test data for each test
        const testWorkflow = await workflowModel.create({
            name: 'Test Workflow',
            description: 'A test workflow for unit testing',
            github_repo_url: 'https://github.com/test/repo',
            requirements_text: 'Test requirements',
            status: 'draft',
            created_by: 'test-user',
            owner: 'test-user'
        });
        testWorkflowId = testWorkflow.id;

        const testTask = await taskModel.create({
            title: 'Test Task',
            description: 'A test task for unit testing',
            workflow_id: testWorkflowId,
            priority: 5,
            complexity_score: 50,
            tags: ['test', 'unit-test'],
            requirements: { type: 'test' },
            context: { environment: 'test' }
        });
        testTaskId = testTask.id;
    });

    afterEach(async () => {
        // Clean up test data after each test
        try {
            if (testSubtaskId) {
                await subtaskModel.delete(testSubtaskId);
            }
            if (testTaskId) {
                await taskModel.delete(testTaskId);
            }
            if (testWorkflowId) {
                await workflowModel.delete(testWorkflowId);
            }
        } catch (error) {
            console.warn('Cleanup warning:', error.message);
        }
        
        testWorkflowId = null;
        testTaskId = null;
        testSubtaskId = null;
    });

    describe('WorkflowModel', () => {
        test('should create a new workflow', async () => {
            const workflowData = {
                name: 'New Test Workflow',
                description: 'Another test workflow',
                github_repo_url: 'https://github.com/test/another-repo',
                status: 'active',
                trigger_type: 'webhook',
                timeout_minutes: 120,
                configuration: { key: 'value' },
                tags: ['integration', 'test']
            };

            const workflow = await workflowModel.create(workflowData);

            expect(workflow).toBeDefined();
            expect(workflow.id).toBeDefined();
            expect(workflow.name).toBe(workflowData.name);
            expect(workflow.status).toBe(workflowData.status);
            expect(workflow.trigger_type).toBe(workflowData.trigger_type);
            expect(workflow.timeout_minutes).toBe(workflowData.timeout_minutes);

            // Clean up
            await workflowModel.delete(workflow.id);
        });

        test('should find workflow by ID with statistics', async () => {
            const workflow = await workflowModel.findById(testWorkflowId);

            expect(workflow).toBeDefined();
            expect(workflow.id).toBe(testWorkflowId);
            expect(workflow.name).toBe('Test Workflow');
            expect(workflow.task_count).toBeDefined();
            expect(workflow.execution_count).toBeDefined();
        });

        test('should update workflow', async () => {
            const updateData = {
                description: 'Updated description',
                status: 'active',
                metadata: { updated: true }
            };

            const updatedWorkflow = await workflowModel.update(testWorkflowId, updateData);

            expect(updatedWorkflow).toBeDefined();
            expect(updatedWorkflow.description).toBe(updateData.description);
            expect(updatedWorkflow.status).toBe(updateData.status);
        });

        test('should start and complete workflow execution', async () => {
            // Start execution
            const execution = await workflowModel.startExecution(testWorkflowId, {
                trigger_type: 'manual',
                triggered_by: 'test-user',
                trigger_data: { test: true }
            });

            expect(execution).toBeDefined();
            expect(execution.workflow_id).toBe(testWorkflowId);
            expect(execution.status).toBe('active');
            expect(execution.trigger_type).toBe('manual');

            // Complete execution
            const completedExecution = await workflowModel.completeExecution(execution.id, {
                status: 'completed',
                total_tasks: 5,
                completed_tasks: 5,
                failed_tasks: 0,
                result_data: { success: true }
            });

            expect(completedExecution).toBeDefined();
            expect(completedExecution.status).toBe('completed');
            expect(completedExecution.total_tasks).toBe(5);
            expect(completedExecution.completed_tasks).toBe(5);
        });

        test('should get workflow statistics', async () => {
            const stats = await workflowModel.getStatistics();

            expect(stats).toBeDefined();
            expect(stats.total_workflows).toBeGreaterThan(0);
            expect(stats.total_executions).toBeDefined();
        });
    });

    describe('TaskModel', () => {
        test('should create a new task', async () => {
            const taskData = {
                title: 'New Test Task',
                description: 'Another test task',
                workflow_id: testWorkflowId,
                priority: 8,
                complexity_score: 75,
                assigned_to: 'test-user',
                tags: ['new', 'test'],
                requirements: { framework: 'jest' },
                context: { branch: 'test-branch' }
            };

            const task = await taskModel.create(taskData);

            expect(task).toBeDefined();
            expect(task.id).toBeDefined();
            expect(task.title).toBe(taskData.title);
            expect(task.priority).toBe(taskData.priority);
            expect(task.complexity_score).toBe(taskData.complexity_score);
            expect(task.workflow_id).toBe(testWorkflowId);

            // Clean up
            await taskModel.delete(task.id);
        });

        test('should find task by ID with workflow info', async () => {
            const task = await taskModel.findById(testTaskId);

            expect(task).toBeDefined();
            expect(task.id).toBe(testTaskId);
            expect(task.title).toBe('Test Task');
            expect(task.workflow_name).toBe('Test Workflow');
        });

        test('should update task status', async () => {
            const updatedTask = await taskModel.updateStatus(testTaskId, 'in_progress', {
                assigned_to: 'new-user'
            });

            expect(updatedTask).toBeDefined();
            expect(updatedTask.status).toBe('in_progress');
            expect(updatedTask.assigned_to).toBe('new-user');
        });

        test('should find tasks with filters', async () => {
            const result = await taskModel.findMany({
                status: 'pending',
                workflow_id: testWorkflowId,
                limit: 10,
                offset: 0
            });

            expect(result).toBeDefined();
            expect(result.data).toBeInstanceOf(Array);
            expect(result.pagination).toBeDefined();
            expect(result.pagination.total).toBeGreaterThan(0);
        });

        test('should search tasks by text', async () => {
            const results = await taskModel.search('Test Task', { limit: 10 });

            expect(results).toBeInstanceOf(Array);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].title).toContain('Test');
        });

        test('should get task hierarchy', async () => {
            // Create a child task
            const childTask = await taskModel.create({
                title: 'Child Task',
                description: 'A child task',
                parent_task_id: testTaskId,
                workflow_id: testWorkflowId
            });

            const hierarchy = await taskModel.getHierarchy(testTaskId);

            expect(hierarchy).toBeInstanceOf(Array);
            expect(hierarchy.length).toBeGreaterThan(0);

            // Clean up
            await taskModel.delete(childTask.id);
        });

        test('should get ready tasks', async () => {
            const readyTasks = await taskModel.getReadyTasks(testWorkflowId);

            expect(readyTasks).toBeInstanceOf(Array);
            // Should include our test task since it has no dependencies
            expect(readyTasks.some(task => task.id === testTaskId)).toBe(true);
        });
    });

    describe('SubtaskModel', () => {
        test('should create a new subtask', async () => {
            const subtaskData = {
                parent_task_id: testTaskId,
                title: 'Test Subtask',
                description: 'A test subtask',
                order_index: 0,
                assigned_to: 'test-user',
                metadata: { type: 'unit-test' }
            };

            const subtask = await subtaskModel.create(subtaskData);
            testSubtaskId = subtask.id;

            expect(subtask).toBeDefined();
            expect(subtask.id).toBeDefined();
            expect(subtask.title).toBe(subtaskData.title);
            expect(subtask.parent_task_id).toBe(testTaskId);
            expect(subtask.order_index).toBe(0);
        });

        test('should find subtasks by parent ID', async () => {
            // Create a subtask first
            const subtask = await subtaskModel.create({
                parent_task_id: testTaskId,
                title: 'Find Test Subtask',
                order_index: 0
            });

            const subtasks = await subtaskModel.findByParentId(testTaskId);

            expect(subtasks).toBeInstanceOf(Array);
            expect(subtasks.length).toBeGreaterThan(0);
            expect(subtasks[0].parent_task_id).toBe(testTaskId);

            // Clean up
            await subtaskModel.delete(subtask.id);
        });

        test('should update subtask', async () => {
            // Create a subtask first
            const subtask = await subtaskModel.create({
                parent_task_id: testTaskId,
                title: 'Update Test Subtask',
                order_index: 0
            });

            const updateData = {
                title: 'Updated Subtask Title',
                status: 'in_progress',
                metadata: { updated: true }
            };

            const updatedSubtask = await subtaskModel.update(subtask.id, updateData);

            expect(updatedSubtask).toBeDefined();
            expect(updatedSubtask.title).toBe(updateData.title);
            expect(updatedSubtask.status).toBe(updateData.status);

            // Clean up
            await subtaskModel.delete(subtask.id);
        });

        test('should reorder subtasks', async () => {
            // Create multiple subtasks
            const subtask1 = await subtaskModel.create({
                parent_task_id: testTaskId,
                title: 'Subtask 1',
                order_index: 0
            });

            const subtask2 = await subtaskModel.create({
                parent_task_id: testTaskId,
                title: 'Subtask 2',
                order_index: 1
            });

            // Reorder them
            const reorderedSubtasks = await subtaskModel.reorder(testTaskId, [subtask2.id, subtask1.id]);

            expect(reorderedSubtasks).toBeInstanceOf(Array);
            expect(reorderedSubtasks[0].id).toBe(subtask2.id);
            expect(reorderedSubtasks[0].order_index).toBe(0);
            expect(reorderedSubtasks[1].id).toBe(subtask1.id);
            expect(reorderedSubtasks[1].order_index).toBe(1);

            // Clean up
            await subtaskModel.delete(subtask1.id);
            await subtaskModel.delete(subtask2.id);
        });
    });

    describe('WorkflowStepModel', () => {
        test('should create workflow steps', async () => {
            const stepData = {
                workflow_id: testWorkflowId,
                name: 'Test Step',
                description: 'A test workflow step',
                step_type: 'task_creation',
                order_index: 0,
                configuration: { action: 'create_task' },
                timeout_minutes: 15
            };

            const step = await workflowStepModel.create(stepData);

            expect(step).toBeDefined();
            expect(step.id).toBeDefined();
            expect(step.name).toBe(stepData.name);
            expect(step.workflow_id).toBe(testWorkflowId);
            expect(step.step_type).toBe(stepData.step_type);

            // Clean up
            await workflowStepModel.delete(step.id);
        });

        test('should find steps by workflow ID', async () => {
            // Create a step first
            const step = await workflowStepModel.create({
                workflow_id: testWorkflowId,
                name: 'Find Test Step',
                step_type: 'execution',
                order_index: 0
            });

            const steps = await workflowStepModel.findByWorkflowId(testWorkflowId);

            expect(steps).toBeInstanceOf(Array);
            expect(steps.length).toBeGreaterThan(0);
            expect(steps[0].workflow_id).toBe(testWorkflowId);

            // Clean up
            await workflowStepModel.delete(step.id);
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete workflow with tasks and subtasks', async () => {
            // Create a complete workflow
            const workflow = await workflowModel.create({
                name: 'Integration Test Workflow',
                description: 'Complete workflow test',
                status: 'active'
            });

            // Create tasks
            const task1 = await taskModel.create({
                title: 'Integration Task 1',
                workflow_id: workflow.id,
                priority: 5
            });

            const task2 = await taskModel.create({
                title: 'Integration Task 2',
                workflow_id: workflow.id,
                priority: 3,
                parent_task_id: task1.id
            });

            // Create subtasks
            const subtask1 = await subtaskModel.create({
                parent_task_id: task1.id,
                title: 'Integration Subtask 1',
                order_index: 0
            });

            const subtask2 = await subtaskModel.create({
                parent_task_id: task1.id,
                title: 'Integration Subtask 2',
                order_index: 1
            });

            // Start workflow execution
            const execution = await workflowModel.startExecution(workflow.id, {
                triggered_by: 'integration-test'
            });

            // Verify the complete structure
            const workflowWithStats = await workflowModel.findById(workflow.id);
            expect(workflowWithStats.task_count).toBe(2);

            const taskHierarchy = await taskModel.getHierarchy(task1.id);
            expect(taskHierarchy.length).toBeGreaterThan(1);

            const subtasks = await subtaskModel.findByParentId(task1.id);
            expect(subtasks.length).toBe(2);

            // Complete execution
            await workflowModel.completeExecution(execution.id, {
                status: 'completed',
                total_tasks: 2,
                completed_tasks: 2
            });

            // Clean up
            await subtaskModel.delete(subtask1.id);
            await subtaskModel.delete(subtask2.id);
            await taskModel.delete(task2.id);
            await taskModel.delete(task1.id);
            await workflowModel.delete(workflow.id);
        });

        test('should handle error cases gracefully', async () => {
            // Test non-existent ID
            const nonExistentTask = await taskModel.findById('00000000-0000-0000-0000-000000000000');
            expect(nonExistentTask).toBeNull();

            // Test invalid update
            try {
                await taskModel.update(testTaskId, {});
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('No valid fields to update');
            }

            // Test constraint violation
            try {
                await taskModel.create({
                    title: 'Invalid Task',
                    priority: 15, // Invalid priority (max is 10)
                    workflow_id: testWorkflowId
                });
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});

// Performance tests
describe('Database Performance Tests', () => {
    test('should handle bulk operations efficiently', async () => {
        const startTime = Date.now();
        
        // Create a workflow for testing
        const workflow = await workflowModel.create({
            name: 'Performance Test Workflow',
            description: 'Testing bulk operations'
        });

        // Create multiple tasks
        const taskPromises = [];
        for (let i = 0; i < 10; i++) {
            taskPromises.push(taskModel.create({
                title: `Performance Task ${i}`,
                workflow_id: workflow.id,
                priority: i % 5
            }));
        }

        const tasks = await Promise.all(taskPromises);
        
        // Query with pagination
        const result = await taskModel.findMany({
            workflow_id: workflow.id,
            limit: 5,
            offset: 0
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(tasks.length).toBe(10);
        expect(result.data.length).toBe(5);
        expect(result.pagination.total).toBe(10);
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

        // Clean up
        for (const task of tasks) {
            await taskModel.delete(task.id);
        }
        await workflowModel.delete(workflow.id);
    }, 10000); // 10 second timeout for performance test
});

