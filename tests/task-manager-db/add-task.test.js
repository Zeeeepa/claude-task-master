/**
 * @fileoverview Tests for add-task.js
 * @description Database integration tests for task creation
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { DatabaseConnectionManager } from '../../src/database/connection/connection_manager.js';
import { TaskModel } from '../../src/database/models/task.js';
import { SubtaskModel } from '../../src/database/models/subtask.js';
import { DependencyModel } from '../../src/database/models/dependency.js';
import { addTask } from '../../src/task-manager-db/add-task.js';

describe('add-task.js', () => {
    let db;
    let testProjectId;

    beforeAll(async () => {
        db = new DatabaseConnectionManager();
        await db.connect();
        
        // Create test project
        const projectResult = await db.query(`
            INSERT INTO projects (name, description, context)
            VALUES ('Test Project', 'Test project for task tests', '{}')
            RETURNING id
        `);
        testProjectId = projectResult.rows[0].id;
    });

    afterAll(async () => {
        // Cleanup test project
        await db.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
        await db.disconnect();
    });

    beforeEach(async () => {
        // Clean up any existing test tasks
        await db.query('DELETE FROM tasks WHERE project_id = $1', [testProjectId]);
    });

    afterEach(async () => {
        // Clean up test data after each test
        await db.query('DELETE FROM tasks WHERE project_id = $1', [testProjectId]);
    });

    test('should create a basic task successfully', async () => {
        const taskData = {
            title: 'Test Task',
            description: 'This is a test task',
            projectId: testProjectId,
            createdBy: 'test-user'
        };

        const result = await addTask(taskData);

        expect(result).toBeDefined();
        expect(result.id).toBeDefined();
        expect(result.title).toBe(taskData.title);
        expect(result.description).toBe(taskData.description);
        expect(result.status).toBe('pending');
        expect(result.priority).toBe(0);
        expect(result.complexityScore).toBeGreaterThan(0);
    });

    test('should create task with subtasks', async () => {
        const taskData = {
            title: 'Parent Task',
            description: 'Task with subtasks',
            projectId: testProjectId,
            subtasks: [
                {
                    title: 'Subtask 1',
                    description: 'First subtask'
                },
                {
                    title: 'Subtask 2',
                    description: 'Second subtask'
                }
            ],
            createdBy: 'test-user'
        };

        const result = await addTask(taskData);

        expect(result.subtaskCount).toBe(2);

        // Verify subtasks were created
        const subtasks = await SubtaskModel.getByParentId(result.id);
        expect(subtasks).toHaveLength(2);
        expect(subtasks[0].title).toBe('Subtask 1');
        expect(subtasks[1].title).toBe('Subtask 2');
    });

    test('should create task with dependencies', async () => {
        // First create a dependency task
        const depTaskData = {
            title: 'Dependency Task',
            description: 'Task that others depend on',
            projectId: testProjectId,
            createdBy: 'test-user'
        };
        const depTask = await addTask(depTaskData);

        // Now create task with dependency
        const taskData = {
            title: 'Dependent Task',
            description: 'Task that depends on another',
            projectId: testProjectId,
            dependencies: [depTask.id],
            createdBy: 'test-user'
        };

        const result = await addTask(taskData);

        expect(result.dependencyCount).toBe(1);

        // Verify dependency was created
        const dependencies = await DependencyModel.getDependencies(result.id);
        expect(dependencies).toHaveLength(1);
        expect(dependencies[0].depends_on_task_id).toBe(depTask.id);
    });

    test('should validate required fields', async () => {
        const invalidTaskData = {
            description: 'Task without title',
            projectId: testProjectId
        };

        await expect(addTask(invalidTaskData)).rejects.toThrow('Invalid task data');
    });

    test('should handle complex task data', async () => {
        const complexTaskData = {
            title: 'Complex Task',
            description: 'This is a complex task with many requirements and integrations',
            requirements: {
                technical: ['Node.js', 'PostgreSQL', 'Docker'],
                functional: ['User authentication', 'Data validation', 'Error handling'],
                performance: ['Response time < 200ms', 'Support 1000 concurrent users']
            },
            context: {
                type: 'feature',
                module: 'authentication',
                complexity_score: 8
            },
            tags: ['backend', 'security', 'database'],
            priority: 8,
            projectId: testProjectId,
            assignedAgent: 'codegen',
            estimatedDuration: '2 days',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdBy: 'test-user'
        };

        const result = await addTask(complexTaskData);

        expect(result.title).toBe(complexTaskData.title);
        expect(result.priority).toBe(8);
        expect(result.assigned_agent).toBe('codegen');
        expect(result.requirements).toEqual(complexTaskData.requirements);
        expect(result.context).toEqual(complexTaskData.context);
        expect(result.tags).toEqual(complexTaskData.tags);
        expect(result.complexityScore).toBeGreaterThan(5); // Should be high due to complexity
    });

    test('should calculate complexity score correctly', async () => {
        const simpleTask = {
            title: 'Simple Task',
            description: 'Fix bug',
            projectId: testProjectId,
            createdBy: 'test-user'
        };

        const complexTask = {
            title: 'Complex Task',
            description: 'Implement a sophisticated microservice architecture with advanced caching, optimization algorithms, and complex integration patterns for high-performance distributed systems',
            requirements: {
                architecture: ['microservices', 'caching', 'load balancing'],
                performance: ['optimization', 'scalability'],
                integration: ['api gateway', 'message queues', 'databases']
            },
            subtasks: [
                { title: 'Design architecture', description: 'Create system design' },
                { title: 'Implement services', description: 'Build microservices' },
                { title: 'Setup caching', description: 'Configure Redis' }
            ],
            projectId: testProjectId,
            createdBy: 'test-user'
        };

        const simpleResult = await addTask(simpleTask);
        const complexResult = await addTask(complexTask);

        expect(complexResult.complexityScore).toBeGreaterThan(simpleResult.complexityScore);
        expect(simpleResult.complexityScore).toBeLessThanOrEqual(5);
        expect(complexResult.complexityScore).toBeGreaterThanOrEqual(6);
    });

    test('should handle database transaction rollback on error', async () => {
        // Create a task with invalid dependency (non-existent task ID)
        const taskData = {
            title: 'Task with Invalid Dependency',
            description: 'This should fail',
            projectId: testProjectId,
            dependencies: ['00000000-0000-0000-0000-000000000000'], // Non-existent UUID
            createdBy: 'test-user'
        };

        await expect(addTask(taskData)).rejects.toThrow();

        // Verify no task was created
        const tasks = await TaskModel.findWithCriteria({ project_id: testProjectId });
        expect(tasks).toHaveLength(0);
    });

    test('should set default values correctly', async () => {
        const minimalTaskData = {
            title: 'Minimal Task',
            projectId: testProjectId
        };

        const result = await addTask(minimalTaskData);

        expect(result.status).toBe('pending');
        expect(result.priority).toBe(0);
        expect(result.created_by).toBe('system');
        expect(result.requirements).toEqual({});
        expect(result.dependencies).toEqual([]);
        expect(result.context).toEqual({});
        expect(result.tags).toEqual([]);
    });

    test('should handle concurrent task creation', async () => {
        const taskPromises = [];
        
        for (let i = 0; i < 5; i++) {
            const taskData = {
                title: `Concurrent Task ${i}`,
                description: `Task created concurrently ${i}`,
                projectId: testProjectId,
                createdBy: 'test-user'
            };
            taskPromises.push(addTask(taskData));
        }

        const results = await Promise.all(taskPromises);

        expect(results).toHaveLength(5);
        results.forEach((result, index) => {
            expect(result.title).toBe(`Concurrent Task ${index}`);
            expect(result.id).toBeDefined();
        });

        // Verify all tasks were created
        const tasks = await TaskModel.findWithCriteria({ project_id: testProjectId });
        expect(tasks).toHaveLength(5);
    });
});

