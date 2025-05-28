/**
 * Database Test Suite
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Comprehensive tests for database functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { 
    initializeDatabase, 
    query, 
    transaction, 
    healthCheck,
    getDatabaseStats,
    backupDatabase,
    closeConnection,
    getDatabaseConfig 
} from '../config/database.js';
import { TaskDataAccess } from '../config/data-access-layer.js';
import { 
    runMigrations, 
    getMigrationStatus, 
    validateMigrations 
} from '../migrations/migration-runner.js';

// Test configuration
const TEST_DATABASE_MODE = process.env.TEST_DATABASE_MODE || 'local';

describe('Database Configuration', () => {
    test('should return valid database configuration', () => {
        const config = getDatabaseConfig();
        expect(config).toHaveProperty('mode');
        expect(config).toHaveProperty('config');
        expect(['local', 'postgres']).toContain(config.mode);
    });

    test('should initialize database connection', async () => {
        await expect(initializeDatabase()).resolves.not.toThrow();
    });

    test('should perform health check', async () => {
        const health = await healthCheck();
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('mode');
        expect(health.status).toBe('healthy');
    });
});

describe('Database Statistics', () => {
    test('should get database statistics', async () => {
        const stats = await getDatabaseStats();
        expect(stats).toHaveProperty('mode');
        
        if (stats.mode === 'postgres') {
            expect(stats).toHaveProperty('tables');
        } else {
            expect(stats).toHaveProperty('taskCount');
        }
    });

    test('should create database backup', async () => {
        const result = await backupDatabase();
        expect(result).toHaveProperty('success');
        if (result.success) {
            expect(result).toHaveProperty('file');
        } else {
            expect(result).toHaveProperty('error');
        }
    });
});

describe('Migration System', () => {
    test('should get migration status', async () => {
        const status = await getMigrationStatus();
        expect(status).toHaveProperty('mode');
        
        if (status.mode === 'postgres') {
            expect(status).toHaveProperty('totalMigrations');
            expect(status).toHaveProperty('appliedMigrations');
            expect(status).toHaveProperty('pendingMigrations');
        }
    });

    test('should run migrations successfully', async () => {
        if (TEST_DATABASE_MODE === 'postgres') {
            const result = await runMigrations();
            expect(result).toHaveProperty('success');
            expect(result.success).toBe(true);
        }
    });

    test('should validate migration integrity', async () => {
        const result = await validateMigrations();
        expect(result).toHaveProperty('valid');
        
        if (!result.valid) {
            expect(result).toHaveProperty('issues');
            console.warn('Migration validation issues:', result.issues);
        }
    });
});

describe('Data Access Layer', () => {
    let taskDA;
    let createdTaskIds = [];

    beforeAll(async () => {
        await initializeDatabase();
        taskDA = new TaskDataAccess();
    });

    afterAll(async () => {
        // Clean up created test tasks
        for (const taskId of createdTaskIds) {
            try {
                await taskDA.deleteTask(taskId);
            } catch (error) {
                console.warn(`Failed to clean up task ${taskId}:`, error.message);
            }
        }
        await closeConnection();
    });

    beforeEach(() => {
        createdTaskIds = [];
    });

    describe('Task Operations', () => {
        test('should create a new task', async () => {
            const taskData = {
                title: 'Test Task',
                description: 'Test task description',
                status: 'pending',
                priority: 'medium',
                tags: ['test', 'automation'],
                requirements: { framework: 'jest' },
                created_by: 'test_user'
            };

            const createdTask = await taskDA.createTask(taskData);
            createdTaskIds.push(createdTask.id);

            expect(createdTask).toHaveProperty('id');
            expect(createdTask.title).toBe(taskData.title);
            expect(createdTask.description).toBe(taskData.description);
            expect(createdTask.status).toBe(taskData.status);
            expect(createdTask.priority).toBe(taskData.priority);
        });

        test('should retrieve task by ID', async () => {
            const taskData = {
                title: 'Retrieve Test Task',
                description: 'Task for testing retrieval',
                status: 'pending',
                priority: 'high',
                created_by: 'test_user'
            };

            const createdTask = await taskDA.createTask(taskData);
            createdTaskIds.push(createdTask.id);

            const retrievedTask = await taskDA.getTaskById(createdTask.id);
            expect(retrievedTask).not.toBeNull();
            expect(retrievedTask.id).toBe(createdTask.id);
            expect(retrievedTask.title).toBe(taskData.title);
        });

        test('should update task properties', async () => {
            const taskData = {
                title: 'Update Test Task',
                description: 'Task for testing updates',
                status: 'pending',
                priority: 'low',
                created_by: 'test_user'
            };

            const createdTask = await taskDA.createTask(taskData);
            createdTaskIds.push(createdTask.id);

            const updates = {
                status: 'in-progress',
                priority: 'high',
                description: 'Updated description',
                updated_by: 'test_user'
            };

            const updatedTask = await taskDA.updateTask(createdTask.id, updates);
            expect(updatedTask.status).toBe(updates.status);
            expect(updatedTask.priority).toBe(updates.priority);
            expect(updatedTask.description).toBe(updates.description);
        });

        test('should delete task', async () => {
            const taskData = {
                title: 'Delete Test Task',
                description: 'Task for testing deletion',
                status: 'pending',
                priority: 'low',
                created_by: 'test_user'
            };

            const createdTask = await taskDA.createTask(taskData);
            const deleteResult = await taskDA.deleteTask(createdTask.id);
            expect(deleteResult).toBe(true);

            const retrievedTask = await taskDA.getTaskById(createdTask.id);
            expect(retrievedTask).toBeNull();
        });

        test('should filter tasks by status', async () => {
            const tasks = [
                { title: 'Pending Task 1', status: 'pending', created_by: 'test_user' },
                { title: 'Done Task 1', status: 'done', created_by: 'test_user' },
                { title: 'Pending Task 2', status: 'pending', created_by: 'test_user' }
            ];

            for (const taskData of tasks) {
                const createdTask = await taskDA.createTask(taskData);
                createdTaskIds.push(createdTask.id);
            }

            const pendingTasks = await taskDA.getTasks({ status: 'pending' });
            const pendingTestTasks = pendingTasks.filter(t => 
                t.title.includes('Pending Task') && t.createdBy === 'test_user'
            );
            expect(pendingTestTasks.length).toBeGreaterThanOrEqual(2);

            const doneTasks = await taskDA.getTasks({ status: 'done' });
            const doneTestTasks = doneTasks.filter(t => 
                t.title.includes('Done Task') && t.createdBy === 'test_user'
            );
            expect(doneTestTasks.length).toBeGreaterThanOrEqual(1);
        });

        test('should handle task dependencies', async () => {
            const parentTask = await taskDA.createTask({
                title: 'Parent Task',
                description: 'Parent task for dependency test',
                status: 'pending',
                created_by: 'test_user'
            });
            createdTaskIds.push(parentTask.id);

            const childTask = await taskDA.createTask({
                title: 'Child Task',
                description: 'Child task for dependency test',
                status: 'pending',
                dependencies: [parentTask.id],
                created_by: 'test_user'
            });
            createdTaskIds.push(childTask.id);

            const retrievedChild = await taskDA.getTaskById(childTask.id);
            expect(retrievedChild.dependencies).toContain(parentTask.id);
        });
    });

    describe('Advanced Features (PostgreSQL only)', () => {
        test('should create workflow state', async () => {
            if (TEST_DATABASE_MODE !== 'postgres') {
                return; // Skip for local mode
            }

            const task = await taskDA.createTask({
                title: 'Workflow Test Task',
                description: 'Task for workflow state testing',
                status: 'pending',
                created_by: 'test_user'
            });
            createdTaskIds.push(task.id);

            const workflowState = await taskDA.createWorkflowState({
                task_id: task.uuid, // Use UUID for PostgreSQL
                state: 'development',
                previous_state: 'planning',
                state_data: { developer: 'test_user' },
                triggered_by: 'test_user',
                trigger_reason: 'Started development'
            });

            expect(workflowState).toHaveProperty('id');
            expect(workflowState.state).toBe('development');
            expect(workflowState.previous_state).toBe('planning');
        });

        test('should log errors', async () => {
            if (TEST_DATABASE_MODE !== 'postgres') {
                return; // Skip for local mode
            }

            const task = await taskDA.createTask({
                title: 'Error Test Task',
                description: 'Task for error logging testing',
                status: 'pending',
                created_by: 'test_user'
            });
            createdTaskIds.push(task.id);

            const errorLog = await taskDA.logError({
                task_id: task.uuid, // Use UUID for PostgreSQL
                error_code: 'TEST_ERROR',
                error_message: 'Test error message',
                error_details: { test: true },
                severity: 'low',
                context: { test_context: 'unit_test' },
                tags: ['test', 'error']
            });

            expect(errorLog).toHaveProperty('id');
            expect(errorLog.error_code).toBe('TEST_ERROR');
            expect(errorLog.error_message).toBe('Test error message');
            expect(errorLog.severity).toBe('low');
        });

        test('should create PR metadata', async () => {
            if (TEST_DATABASE_MODE !== 'postgres') {
                return; // Skip for local mode
            }

            const prData = {
                pr_number: 999,
                repository_url: 'https://github.com/test/repo',
                title: 'Test PR',
                description: 'Test PR description',
                status: 'open',
                branch_name: 'test-branch',
                author: 'test_user',
                labels: ['test', 'feature']
            };

            const prMetadata = await taskDA.createPRMetadata(prData);
            expect(prMetadata).toHaveProperty('id');
            expect(prMetadata.pr_number).toBe(prData.pr_number);
            expect(prMetadata.repository_url).toBe(prData.repository_url);
            expect(prMetadata.title).toBe(prData.title);
        });

        test('should create Linear sync record', async () => {
            if (TEST_DATABASE_MODE !== 'postgres') {
                return; // Skip for local mode
            }

            const task = await taskDA.createTask({
                title: 'Linear Sync Test Task',
                description: 'Task for Linear sync testing',
                status: 'pending',
                created_by: 'test_user'
            });
            createdTaskIds.push(task.id);

            const linearSync = await taskDA.createLinearSync({
                task_id: task.uuid, // Use UUID for PostgreSQL
                linear_issue_id: 'TEST-123',
                linear_team_id: 'team_test',
                linear_title: 'Test Linear Issue',
                linear_description: 'Test Linear issue description',
                sync_direction: 'bidirectional',
                sync_status: 'synced'
            });

            expect(linearSync).toHaveProperty('id');
            expect(linearSync.linear_issue_id).toBe('TEST-123');
            expect(linearSync.sync_direction).toBe('bidirectional');
            expect(linearSync.sync_status).toBe('synced');
        });
    });
});

describe('Database Queries (PostgreSQL only)', () => {
    test('should execute simple query', async () => {
        if (TEST_DATABASE_MODE !== 'postgres') {
            return; // Skip for local mode
        }

        const result = await query('SELECT NOW() as current_time');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toHaveProperty('current_time');
    });

    test('should execute parameterized query', async () => {
        if (TEST_DATABASE_MODE !== 'postgres') {
            return; // Skip for local mode
        }

        const result = await query('SELECT $1 as test_value', ['test']);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].test_value).toBe('test');
    });

    test('should execute transaction', async () => {
        if (TEST_DATABASE_MODE !== 'postgres') {
            return; // Skip for local mode
        }

        const result = await transaction(async (client) => {
            const result1 = await client.query('SELECT 1 as value');
            const result2 = await client.query('SELECT 2 as value');
            return { first: result1.rows[0], second: result2.rows[0] };
        });

        expect(result.first.value).toBe(1);
        expect(result.second.value).toBe(2);
    });

    test('should rollback transaction on error', async () => {
        if (TEST_DATABASE_MODE !== 'postgres') {
            return; // Skip for local mode
        }

        await expect(transaction(async (client) => {
            await client.query('SELECT 1');
            throw new Error('Test error');
        })).rejects.toThrow('Test error');
    });
});

describe('Performance Tests', () => {
    test('should handle concurrent task operations', async () => {
        const concurrentOperations = 10;
        const promises = [];

        for (let i = 0; i < concurrentOperations; i++) {
            promises.push(
                taskDA.createTask({
                    title: `Concurrent Task ${i}`,
                    description: `Concurrent task ${i} for performance testing`,
                    status: 'pending',
                    priority: 'medium',
                    created_by: 'performance_test'
                })
            );
        }

        const results = await Promise.all(promises);
        expect(results).toHaveLength(concurrentOperations);

        // Clean up
        for (const task of results) {
            await taskDA.deleteTask(task.id);
        }
    });

    test('should perform queries within performance threshold', async () => {
        const startTime = Date.now();
        await taskDA.getTasks({ limit: 10 });
        const duration = Date.now() - startTime;

        // Should complete within 100ms as per requirements
        expect(duration).toBeLessThan(100);
    });
});

describe('Error Handling', () => {
    test('should handle invalid task ID gracefully', async () => {
        const result = await taskDA.getTaskById('invalid-id');
        expect(result).toBeNull();
    });

    test('should handle update of non-existent task', async () => {
        await expect(taskDA.updateTask('non-existent-id', { title: 'Updated' }))
            .rejects.toThrow();
    });

    test('should handle delete of non-existent task', async () => {
        const result = await taskDA.deleteTask('non-existent-id');
        expect(result).toBe(false);
    });

    test('should validate required fields', async () => {
        await expect(taskDA.createTask({})).rejects.toThrow();
    });
});

describe('Data Integrity', () => {
    test('should maintain referential integrity', async () => {
        if (TEST_DATABASE_MODE !== 'postgres') {
            return; // Skip for local mode
        }

        // Test that deleting a parent task cascades to dependencies
        const parentTask = await taskDA.createTask({
            title: 'Parent for Integrity Test',
            description: 'Parent task for integrity testing',
            status: 'pending',
            created_by: 'integrity_test'
        });

        const childTask = await taskDA.createTask({
            title: 'Child for Integrity Test',
            description: 'Child task for integrity testing',
            status: 'pending',
            dependencies: [parentTask.id],
            created_by: 'integrity_test'
        });

        // Delete parent task
        await taskDA.deleteTask(parentTask.id);

        // Child task should still exist but dependency should be handled
        const retrievedChild = await taskDA.getTaskById(childTask.id);
        expect(retrievedChild).not.toBeNull();

        // Clean up
        await taskDA.deleteTask(childTask.id);
    });
});

