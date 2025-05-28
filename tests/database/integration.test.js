/**
 * @fileoverview Database Integration Tests
 * @description Integration tests for PostgreSQL database operations
 */

import { jest } from '@jest/globals';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';
import { MigrationRunner } from '../../src/ai_cicd_system/database/migrations/runner.js';
import { TaskStorageManager } from '../../src/ai_cicd_system/core/task_storage_manager.js';

// These tests require a real PostgreSQL database
// Skip them if DB_TEST_URL is not provided
const DB_TEST_URL = process.env.DB_TEST_URL;
const skipDatabaseTests = !DB_TEST_URL;

describe('Database Integration Tests', () => {
    let connection;
    let taskStorage;

    beforeAll(async () => {
        if (skipDatabaseTests) {
            console.log('Skipping database integration tests - DB_TEST_URL not provided');
            return;
        }

        // Parse test database URL
        const url = new URL(DB_TEST_URL);
        const config = {
            host: url.hostname,
            port: parseInt(url.port) || 5432,
            database: url.pathname.slice(1),
            user: url.username,
            password: url.password,
            ssl: url.searchParams.get('ssl') === 'true'
        };

        connection = new DatabaseConnection(config);
        await connection.initialize();

        // Run migrations
        const migrationRunner = new MigrationRunner(connection);
        await migrationRunner.runMigrations();

        // Initialize task storage with real database
        taskStorage = new TaskStorageManager({
            enable_mock: false,
            auto_migrate: false
        });
        taskStorage.connection = connection;
        taskStorage.isInitialized = true;
    });

    afterAll(async () => {
        if (skipDatabaseTests) return;

        // Clean up test data
        if (connection) {
            await connection.query('TRUNCATE TABLE tasks, task_contexts, workflow_states, audit_logs, task_dependencies CASCADE');
            await connection.shutdown();
        }
    });

    beforeEach(async () => {
        if (skipDatabaseTests) return;

        // Clean up before each test
        await connection.query('TRUNCATE TABLE tasks, task_contexts, workflow_states, audit_logs, task_dependencies CASCADE');
    });

    describe('Database Connection', () => {
        test.skipIf(skipDatabaseTests)('should connect to database successfully', async () => {
            const health = connection.getHealth();
            expect(health.connected).toBe(true);
        });

        test.skipIf(skipDatabaseTests)('should execute queries successfully', async () => {
            const result = await connection.query('SELECT NOW() as current_time');
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].current_time).toBeDefined();
        });

        test.skipIf(skipDatabaseTests)('should handle transactions', async () => {
            const result = await connection.transaction(async (client) => {
                await client.query('CREATE TEMP TABLE test_transaction (id INTEGER)');
                await client.query('INSERT INTO test_transaction (id) VALUES (1)');
                const selectResult = await client.query('SELECT * FROM test_transaction');
                return selectResult.rows;
            });

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
        });

        test.skipIf(skipDatabaseTests)('should rollback failed transactions', async () => {
            await expect(connection.transaction(async (client) => {
                await client.query('CREATE TEMP TABLE test_rollback (id INTEGER)');
                await client.query('INSERT INTO test_rollback (id) VALUES (1)');
                throw new Error('Intentional error for rollback test');
            })).rejects.toThrow('Intentional error for rollback test');

            // Verify the temp table doesn't exist (transaction was rolled back)
            await expect(connection.query('SELECT * FROM test_rollback'))
                .rejects.toThrow();
        });
    });

    describe('Migration System', () => {
        test.skipIf(skipDatabaseTests)('should track applied migrations', async () => {
            const migrationRunner = new MigrationRunner(connection);
            const status = await migrationRunner.getMigrationStatus();

            expect(status.applied).toBeGreaterThan(0);
            expect(status.migrations).toBeDefined();
            expect(status.migrations.some(m => m.applied)).toBe(true);
        });

        test.skipIf(skipDatabaseTests)('should validate migration files', async () => {
            const migrationRunner = new MigrationRunner(connection);
            const validation = await migrationRunner.validateMigrations();

            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    describe('Task Storage Database Operations', () => {
        test.skipIf(skipDatabaseTests)('should store and retrieve tasks from database', async () => {
            const task = {
                title: 'Database Integration Test Task',
                description: 'Testing real database operations',
                type: 'integration_test',
                priority: 7,
                complexity_score: 8,
                requirements: ['Database connection', 'Transaction support'],
                acceptance_criteria: ['Task stored', 'Task retrieved'],
                affected_files: ['database.js', 'task_storage.js'],
                tags: ['integration', 'database'],
                estimated_hours: 4.5
            };

            const taskId = await taskStorage.storeTask(task);
            expect(taskId).toBeDefined();

            const retrievedTask = await taskStorage.getTask(taskId);
            expect(retrievedTask).toBeDefined();
            expect(retrievedTask.title).toBe(task.title);
            expect(retrievedTask.description).toBe(task.description);
            expect(retrievedTask.type).toBe(task.type);
            expect(retrievedTask.priority).toBe(task.priority);
            expect(retrievedTask.complexity_score).toBe(task.complexity_score);
            expect(retrievedTask.requirements).toEqual(task.requirements);
            expect(retrievedTask.acceptance_criteria).toEqual(task.acceptance_criteria);
            expect(retrievedTask.affected_files).toEqual(task.affected_files);
            expect(retrievedTask.tags).toEqual(task.tags);
            expect(retrievedTask.estimated_hours).toBe(task.estimated_hours);
        });

        test.skipIf(skipDatabaseTests)('should update tasks in database', async () => {
            const task = {
                title: 'Updatable Task',
                description: 'Task for update testing',
                priority: 3
            };

            const taskId = await taskStorage.storeTask(task);

            const updates = {
                title: 'Updated Task Title',
                priority: 8,
                status: 'in_progress',
                actual_hours: 2.5
            };

            await taskStorage.updateTask(taskId, updates);

            const updatedTask = await taskStorage.getTask(taskId);
            expect(updatedTask.title).toBe(updates.title);
            expect(updatedTask.priority).toBe(updates.priority);
            expect(updatedTask.status).toBe(updates.status);
            expect(updatedTask.actual_hours).toBe(updates.actual_hours);
        });

        test.skipIf(skipDatabaseTests)('should filter and sort tasks', async () => {
            // Create multiple tasks
            const tasks = [
                { title: 'High Priority Bug', priority: 9, type: 'bug', status: 'pending' },
                { title: 'Medium Feature', priority: 5, type: 'feature', status: 'in_progress' },
                { title: 'Low Priority Enhancement', priority: 2, type: 'enhancement', status: 'completed' },
                { title: 'Another High Priority', priority: 8, type: 'bug', status: 'pending' }
            ];

            const taskIds = [];
            for (const task of tasks) {
                const taskId = await taskStorage.storeTask(task);
                taskIds.push(taskId);
                if (task.status !== 'pending') {
                    await taskStorage.updateTaskStatus(taskId, task.status);
                }
            }

            // Test filtering by status
            const pendingTasks = await taskStorage.listTasks({ status: 'pending' });
            expect(pendingTasks).toHaveLength(2);

            // Test filtering by type
            const bugTasks = await taskStorage.listTasks({ type: 'bug' });
            expect(bugTasks).toHaveLength(2);

            // Test sorting by priority
            const sortedTasks = await taskStorage.listTasks({
                sort_by: 'priority',
                sort_order: 'DESC'
            });
            expect(sortedTasks[0].priority).toBeGreaterThanOrEqual(sortedTasks[1].priority);

            // Test pagination
            const firstPage = await taskStorage.listTasks({ limit: 2, offset: 0 });
            expect(firstPage).toHaveLength(2);

            const secondPage = await taskStorage.listTasks({ limit: 2, offset: 2 });
            expect(secondPage).toHaveLength(2);
        });

        test.skipIf(skipDatabaseTests)('should store and retrieve task contexts', async () => {
            const task = {
                title: 'Context Test Task',
                description: 'Task for context testing'
            };

            const taskId = await taskStorage.storeTask(task);

            // Store various types of context
            await taskStorage.storeTaskContext(taskId, 'codebase', {
                files_analyzed: ['file1.js', 'file2.js'],
                complexity_metrics: { cyclomatic: 5, cognitive: 8 }
            });

            await taskStorage.storeAIInteraction(taskId, 'claude-3', {
                type: 'code_analysis',
                request: { analyze: 'function complexity' },
                response: { complexity_score: 7 },
                execution_time_ms: 2500,
                success: true
            });

            await taskStorage.storeValidationResult(
                taskId,
                'code_quality',
                'eslint',
                'passed',
                92,
                { errors: 0, warnings: 2 },
                { use_const_instead_of_let: true }
            );

            // Retrieve and verify contexts
            const contexts = await taskStorage.getTaskContext(taskId);
            expect(contexts).toHaveLength(3);

            const codebaseContext = contexts.find(c => c.context_type === 'codebase');
            expect(codebaseContext).toBeDefined();
            expect(codebaseContext.context_data.files_analyzed).toEqual(['file1.js', 'file2.js']);

            const aiContext = contexts.find(c => c.context_type === 'ai_interaction');
            expect(aiContext).toBeDefined();
            expect(aiContext.context_data.agent_name).toBe('claude-3');

            const validationContext = contexts.find(c => c.context_type === 'validation');
            expect(validationContext).toBeDefined();
            expect(validationContext.context_data.score).toBe(92);

            // Test full context retrieval
            const fullContext = await taskStorage.getTaskFullContext(taskId);
            expect(fullContext.task).toBeDefined();
            expect(fullContext.codebase_context).toBeDefined();
            expect(fullContext.ai_interactions).toHaveLength(1);
            expect(fullContext.validation_results).toHaveLength(1);
        });

        test.skipIf(skipDatabaseTests)('should handle workflow states', async () => {
            const workflowId = 'integration-test-workflow';
            const taskId = await taskStorage.storeTask({
                title: 'Workflow Test Task',
                description: 'Task for workflow testing'
            });

            // Store initial workflow state
            await taskStorage.storeWorkflowState(workflowId, {
                task_id: taskId,
                step: 'analysis',
                status: 'running',
                metadata: { attempt: 1 }
            });

            // Store another step
            await taskStorage.storeWorkflowState(workflowId, {
                task_id: taskId,
                step: 'code_generation',
                status: 'pending',
                metadata: { depends_on: 'analysis' }
            });

            // Retrieve workflow states
            const states = await taskStorage.getWorkflowState(workflowId);
            expect(states).toHaveLength(2);
            expect(states.some(s => s.step === 'analysis')).toBe(true);
            expect(states.some(s => s.step === 'code_generation')).toBe(true);

            // Update workflow state
            await taskStorage.updateWorkflowState(workflowId, {
                status: 'completed',
                result: { success: true, output: 'Analysis complete' }
            });

            const updatedStates = await taskStorage.getWorkflowState(workflowId);
            const latestState = updatedStates[updatedStates.length - 1];
            expect(latestState.status).toBe('completed');
        });

        test.skipIf(skipDatabaseTests)('should manage task dependencies', async () => {
            const parentTask = await taskStorage.storeTask({
                title: 'Parent Task',
                description: 'Task that blocks others'
            });

            const childTask1 = await taskStorage.storeTask({
                title: 'Child Task 1',
                description: 'Task that depends on parent'
            });

            const childTask2 = await taskStorage.storeTask({
                title: 'Child Task 2',
                description: 'Another task that depends on parent'
            });

            // Add dependencies
            await taskStorage.addTaskDependency(parentTask, childTask1, 'blocks');
            await taskStorage.addTaskDependency(parentTask, childTask2, 'blocks');

            // Verify dependencies
            const child1Dependencies = await taskStorage.getTaskDependencies(childTask1);
            const child2Dependencies = await taskStorage.getTaskDependencies(childTask2);

            expect(child1Dependencies).toContain(parentTask);
            expect(child2Dependencies).toContain(parentTask);

            // Verify dependency contexts were created
            const child1Context = await taskStorage.getTaskContext(childTask1);
            const dependencyContext = child1Context.find(c => c.context_type === 'dependency_child');
            expect(dependencyContext).toBeDefined();
            expect(dependencyContext.context_data.parent_task_id).toBe(parentTask);
        });

        test.skipIf(skipDatabaseTests)('should generate accurate metrics', async () => {
            // Create tasks with various statuses and properties
            const tasks = [
                { title: 'Pending Task 1', status: 'pending', complexity_score: 5, estimated_hours: 3 },
                { title: 'Pending Task 2', status: 'pending', complexity_score: 7, estimated_hours: 5 },
                { title: 'In Progress Task', status: 'in_progress', complexity_score: 6, estimated_hours: 4 },
                { title: 'Completed Task 1', status: 'completed', complexity_score: 4, estimated_hours: 2, actual_hours: 2.5 },
                { title: 'Completed Task 2', status: 'completed', complexity_score: 8, estimated_hours: 6, actual_hours: 5.5 },
                { title: 'Failed Task', status: 'failed', complexity_score: 9, estimated_hours: 8 }
            ];

            for (const task of tasks) {
                const taskId = await taskStorage.storeTask(task);
                if (task.status !== 'pending') {
                    await taskStorage.updateTaskStatus(taskId, task.status);
                }
                if (task.actual_hours) {
                    await taskStorage.updateTask(taskId, { actual_hours: task.actual_hours });
                }
            }

            const metrics = await taskStorage.getTaskMetrics();

            expect(metrics.total_tasks).toBe(6);
            expect(metrics.pending_tasks).toBe(2);
            expect(metrics.in_progress_tasks).toBe(1);
            expect(metrics.completed_tasks).toBe(2);
            expect(metrics.failed_tasks).toBe(1);
            expect(metrics.avg_complexity).toBeCloseTo(6.5, 1);
            expect(metrics.total_estimated_hours).toBe(28);
            expect(metrics.total_actual_hours).toBe(8);
        });

        test.skipIf(skipDatabaseTests)('should maintain audit trail', async () => {
            const task = {
                title: 'Audit Trail Test Task',
                description: 'Task for audit testing'
            };

            const taskId = await taskStorage.storeTask(task);

            // Make several updates to generate audit trail
            await taskStorage.updateTask(taskId, { priority: 5 });
            await taskStorage.updateTaskStatus(taskId, 'in_progress');
            await taskStorage.updateTask(taskId, { estimated_hours: 3.5 });
            await taskStorage.updateTaskStatus(taskId, 'completed');

            // Retrieve audit trail
            const auditTrail = await taskStorage.getAuditTrail(taskId);

            expect(auditTrail.length).toBeGreaterThan(0);
            
            // Verify audit entries contain expected information
            const createEntry = auditTrail.find(entry => entry.action === 'create');
            expect(createEntry).toBeDefined();
            expect(createEntry.entity_type).toBe('task');
            expect(createEntry.new_values).toBeDefined();

            const updateEntries = auditTrail.filter(entry => entry.action === 'update');
            expect(updateEntries.length).toBeGreaterThan(0);
        });
    });

    describe('Performance and Concurrency', () => {
        test.skipIf(skipDatabaseTests)('should handle concurrent operations', async () => {
            const concurrentTasks = Array.from({ length: 10 }, (_, i) => ({
                title: `Concurrent Task ${i + 1}`,
                description: `Task ${i + 1} for concurrency testing`,
                priority: Math.floor(Math.random() * 10),
                complexity_score: Math.floor(Math.random() * 10) + 1
            }));

            // Store tasks concurrently
            const storePromises = concurrentTasks.map(task => taskStorage.storeTask(task));
            const taskIds = await Promise.all(storePromises);

            expect(taskIds).toHaveLength(10);
            expect(taskIds.every(id => typeof id === 'string')).toBe(true);

            // Update tasks concurrently
            const updatePromises = taskIds.map((taskId, index) => 
                taskStorage.updateTask(taskId, { 
                    status: index % 2 === 0 ? 'in_progress' : 'completed',
                    actual_hours: Math.random() * 5
                })
            );

            await Promise.all(updatePromises);

            // Verify all tasks were updated correctly
            const retrievePromises = taskIds.map(taskId => taskStorage.getTask(taskId));
            const retrievedTasks = await Promise.all(retrievePromises);

            expect(retrievedTasks).toHaveLength(10);
            expect(retrievedTasks.every(task => task !== null)).toBe(true);
        });

        test.skipIf(skipDatabaseTests)('should handle large datasets efficiently', async () => {
            const startTime = Date.now();

            // Create a larger number of tasks
            const largeBatch = Array.from({ length: 100 }, (_, i) => ({
                title: `Batch Task ${i + 1}`,
                description: `Task ${i + 1} for performance testing`,
                type: i % 3 === 0 ? 'bug' : i % 3 === 1 ? 'feature' : 'enhancement',
                priority: Math.floor(Math.random() * 10),
                complexity_score: Math.floor(Math.random() * 10) + 1,
                tags: [`batch-${Math.floor(i / 10)}`, `priority-${Math.floor(Math.random() * 3)}`]
            }));

            // Store tasks in batches to avoid overwhelming the database
            const batchSize = 20;
            const taskIds = [];

            for (let i = 0; i < largeBatch.length; i += batchSize) {
                const batch = largeBatch.slice(i, i + batchSize);
                const batchPromises = batch.map(task => taskStorage.storeTask(task));
                const batchIds = await Promise.all(batchPromises);
                taskIds.push(...batchIds);
            }

            const storeTime = Date.now() - startTime;
            console.log(`Stored 100 tasks in ${storeTime}ms`);

            // Test querying performance
            const queryStart = Date.now();
            
            const allTasks = await taskStorage.listTasks();
            const bugTasks = await taskStorage.listTasks({ type: 'bug' });
            const highPriorityTasks = await taskStorage.listTasks({ 
                priority: 8,
                sort_by: 'created_at',
                sort_order: 'DESC'
            });

            const queryTime = Date.now() - queryStart;
            console.log(`Executed queries in ${queryTime}ms`);

            expect(allTasks.length).toBeGreaterThanOrEqual(100);
            expect(bugTasks.length).toBeGreaterThan(0);
            expect(storeTime).toBeLessThan(10000); // Should complete within 10 seconds
            expect(queryTime).toBeLessThan(1000); // Queries should be fast
        });
    });

    describe('Error Recovery and Resilience', () => {
        test.skipIf(skipDatabaseTests)('should handle database connection issues gracefully', async () => {
            // This test would require temporarily disrupting the database connection
            // For now, we'll test the error handling paths that we can control
            
            const invalidTaskStorage = new TaskStorageManager({
                enable_mock: false,
                auto_migrate: false
            });

            // Don't initialize the connection
            await expect(invalidTaskStorage.storeTask({ title: 'Test' }))
                .rejects.toThrow('Task storage not initialized');
        });

        test.skipIf(skipDatabaseTests)('should validate data integrity', async () => {
            // Test constraint violations
            const task1 = await taskStorage.storeTask({
                title: 'Parent Task',
                description: 'Task for constraint testing'
            });

            // Try to create a circular dependency (should be prevented by application logic)
            await taskStorage.addTaskDependency(task1, task1, 'blocks');
            
            // The dependency should not be created due to validation
            const dependencies = await taskStorage.getTaskDependencies(task1);
            expect(dependencies).not.toContain(task1);
        });
    });
});

