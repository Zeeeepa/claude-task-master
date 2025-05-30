/**
 * @fileoverview Tests for find-next-task.js
 * @description Database integration tests for intelligent task finding
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { DatabaseConnectionManager } from '../../src/database/connection/connection_manager.js';
import { TaskModel } from '../../src/database/models/task.js';
import { DependencyModel } from '../../src/database/models/dependency.js';
import { findNextTask, getReadyTasks, getHighPriorityTasks } from '../../src/task-manager-db/find-next-task.js';

describe('find-next-task.js', () => {
    let db;
    let testProjectId;
    let testTasks = [];

    beforeAll(async () => {
        db = new DatabaseConnectionManager();
        await db.connect();
        
        // Create test project
        const projectResult = await db.query(`
            INSERT INTO projects (name, description, context)
            VALUES ('Test Project', 'Test project for task finding tests', '{}')
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
        testTasks = [];
        
        // Create test tasks with different priorities and complexities
        const taskData = [
            {
                title: 'High Priority Simple Task',
                description: 'Simple bug fix',
                priority: 9,
                status: 'pending',
                context: { complexity_score: 2, type: 'bug_fix' },
                project_id: testProjectId,
                created_by: 'test-user'
            },
            {
                title: 'Medium Priority Complex Task',
                description: 'Implement complex algorithm with optimization and performance considerations',
                priority: 5,
                status: 'pending',
                context: { complexity_score: 8, type: 'feature' },
                project_id: testProjectId,
                created_by: 'test-user'
            },
            {
                title: 'Low Priority Simple Task',
                description: 'Update documentation',
                priority: 2,
                status: 'pending',
                context: { complexity_score: 1, type: 'documentation' },
                project_id: testProjectId,
                created_by: 'test-user'
            },
            {
                title: 'Blocked Task',
                description: 'Task with dependencies',
                priority: 8,
                status: 'pending',
                context: { complexity_score: 4, type: 'feature' },
                project_id: testProjectId,
                created_by: 'test-user'
            },
            {
                title: 'Dependency Task',
                description: 'Task that blocks others',
                priority: 6,
                status: 'pending',
                context: { complexity_score: 3, type: 'feature' },
                project_id: testProjectId,
                created_by: 'test-user'
            },
            {
                title: 'Completed Task',
                description: 'Already done',
                priority: 7,
                status: 'completed',
                context: { complexity_score: 5, type: 'feature' },
                project_id: testProjectId,
                created_by: 'test-user'
            }
        ];

        // Create tasks
        for (const data of taskData) {
            const task = await TaskModel.create(null, data);
            testTasks.push(task);
        }

        // Create dependency: Blocked Task depends on Dependency Task
        await DependencyModel.create(null, testTasks[3].id, testTasks[4].id, 'blocks');
    });

    afterEach(async () => {
        // Clean up test data
        await db.query('DELETE FROM tasks WHERE project_id = $1', [testProjectId]);
    });

    test('should find tasks prioritized by priority', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            prioritizeBy: 'priority',
            limit: 5
        });

        expect(result).toHaveLength(4); // Excluding completed and blocked tasks
        
        // Should be ordered by priority (high to low)
        expect(result[0].title).toBe('High Priority Simple Task');
        expect(result[0].priority).toBe(9);
        
        // Blocked task should not appear
        const blockedTask = result.find(task => task.title === 'Blocked Task');
        expect(blockedTask).toBeUndefined();
        
        // Completed task should not appear
        const completedTask = result.find(task => task.title === 'Completed Task');
        expect(completedTask).toBeUndefined();
    });

    test('should find tasks prioritized by complexity', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            prioritizeBy: 'complexity',
            limit: 5
        });

        expect(result).toHaveLength(4);
        
        // Should prioritize lower complexity tasks
        const complexities = result.map(task => task.context?.complexity_score || 0);
        expect(complexities[0]).toBeLessThanOrEqual(complexities[1]);
    });

    test('should filter by maximum complexity', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            maxComplexity: 3,
            limit: 10
        });

        // Should only return tasks with complexity <= 3
        result.forEach(task => {
            const complexity = task.context?.complexity_score || 0;
            expect(complexity).toBeLessThanOrEqual(3);
        });
        
        expect(result.length).toBeGreaterThan(0);
    });

    test('should exclude blocked tasks by default', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            excludeBlocked: true,
            limit: 10
        });

        // Blocked task should not appear
        const blockedTask = result.find(task => task.title === 'Blocked Task');
        expect(blockedTask).toBeUndefined();
        
        // Dependency task should appear (it's not blocked)
        const dependencyTask = result.find(task => task.title === 'Dependency Task');
        expect(dependencyTask).toBeDefined();
    });

    test('should include blocked tasks when requested', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            excludeBlocked: false,
            limit: 10
        });

        // Blocked task should appear
        const blockedTask = result.find(task => task.title === 'Blocked Task');
        expect(blockedTask).toBeDefined();
    });

    test('should filter by assigned agent', async () => {
        // Update one task to have an assigned agent
        await TaskModel.updateById(testTasks[0].id, { assigned_agent: 'codegen' });

        const result = await findNextTask({
            projectId: testProjectId,
            assigneeId: 'codegen',
            limit: 10
        });

        // Should include the assigned task and unassigned tasks
        expect(result.length).toBeGreaterThan(0);
        
        const assignedTask = result.find(task => task.title === 'High Priority Simple Task');
        expect(assignedTask).toBeDefined();
    });

    test('should calculate readiness scores', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            limit: 5
        });

        result.forEach(task => {
            expect(task.readinessScore).toBeDefined();
            expect(task.readinessScore).toBeGreaterThanOrEqual(0);
            expect(task.readinessScore).toBeLessThanOrEqual(100);
        });
    });

    test('should calculate recommendation scores', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            limit: 5
        });

        result.forEach(task => {
            expect(task.recommendationScore).toBeDefined();
            expect(typeof task.recommendationScore).toBe('number');
        });

        // Results should be sorted by recommendation score (highest first)
        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].recommendationScore).toBeGreaterThanOrEqual(result[i + 1].recommendationScore);
        }
    });

    test('should handle due date prioritization', async () => {
        // Add due dates to some tasks
        const urgentDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
        const laterDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

        await TaskModel.updateById(testTasks[2].id, { due_date: urgentDate.toISOString() });
        await TaskModel.updateById(testTasks[1].id, { due_date: laterDate.toISOString() });

        const result = await findNextTask({
            projectId: testProjectId,
            prioritizeBy: 'deadline',
            limit: 5
        });

        expect(result.length).toBeGreaterThan(0);
        
        // Task with urgent due date should get higher recommendation score
        const urgentTask = result.find(task => task.title === 'Low Priority Simple Task');
        const laterTask = result.find(task => task.title === 'Medium Priority Complex Task');
        
        if (urgentTask && laterTask) {
            expect(urgentTask.recommendationScore).toBeGreaterThan(laterTask.recommendationScore);
        }
    });

    test('should provide blocking information', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            excludeBlocked: false,
            limit: 10
        });

        const blockedTask = result.find(task => task.title === 'Blocked Task');
        if (blockedTask) {
            expect(blockedTask.blockers).toBeDefined();
            expect(Array.isArray(blockedTask.blockers)).toBe(true);
        }
    });

    test('getReadyTasks should return only unblocked tasks', async () => {
        const result = await getReadyTasks({
            projectId: testProjectId
        });

        // Should not include blocked or completed tasks
        const blockedTask = result.find(task => task.title === 'Blocked Task');
        const completedTask = result.find(task => task.title === 'Completed Task');
        
        expect(blockedTask).toBeUndefined();
        expect(completedTask).toBeUndefined();
        expect(result.length).toBeGreaterThan(0);
    });

    test('getHighPriorityTasks should return high priority tasks', async () => {
        const result = await getHighPriorityTasks({
            projectId: testProjectId
        });

        expect(result.length).toBeGreaterThan(0);
        
        // Should prioritize by priority
        if (result.length > 1) {
            expect(result[0].priority).toBeGreaterThanOrEqual(result[1].priority);
        }
    });

    test('should handle empty result set', async () => {
        // Create a project with no tasks
        const emptyProjectResult = await db.query(`
            INSERT INTO projects (name, description, context)
            VALUES ('Empty Project', 'Project with no tasks', '{}')
            RETURNING id
        `);
        const emptyProjectId = emptyProjectResult.rows[0].id;

        const result = await findNextTask({
            projectId: emptyProjectId,
            limit: 10
        });

        expect(result).toHaveLength(0);

        // Cleanup
        await db.query('DELETE FROM projects WHERE id = $1', [emptyProjectId]);
    });

    test('should respect limit parameter', async () => {
        const result = await findNextTask({
            projectId: testProjectId,
            limit: 2
        });

        expect(result.length).toBeLessThanOrEqual(2);
    });

    test('should handle invalid project ID', async () => {
        const result = await findNextTask({
            projectId: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
            limit: 10
        });

        expect(result).toHaveLength(0);
    });
});

