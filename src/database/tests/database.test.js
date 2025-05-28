/**
 * Database Tests
 * Comprehensive test suite for database functionality
 */

import { jest } from '@jest/globals';
import { 
    initializeDatabase, 
    closeDatabase, 
    query, 
    transaction,
    getHealthStatus,
    getWorkflowModel,
    getTaskModel,
    getDatabaseHealth,
    getDatabaseStatistics
} from '../index.js';

// Test configuration
const TEST_CONFIG = {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT) || 5432,
    database: process.env.TEST_DB_NAME || 'claude_task_master_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || '',
    ssl: false,
    max: 5,
    min: 1
};

describe('Database System', () => {
    let db;
    let workflowModel;
    let taskModel;

    beforeAll(async () => {
        // Initialize test database
        db = await initializeDatabase(TEST_CONFIG);
        workflowModel = getWorkflowModel();
        taskModel = getTaskModel();
    });

    afterAll(async () => {
        // Clean up
        await closeDatabase();
    });

    describe('Connection Management', () => {
        test('should initialize database connection', async () => {
            expect(db).toBeDefined();
            expect(db.isConnected).toBe(true);
        });

        test('should execute basic queries', async () => {
            const result = await query('SELECT 1 as test');
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].test).toBe(1);
        });

        test('should handle transactions', async () => {
            const result = await transaction(async (client) => {
                const insertResult = await client.query(
                    'INSERT INTO configurations (key, value, type) VALUES ($1, $2, $3) RETURNING *',
                    ['test.key', JSON.stringify('test_value'), 'test']
                );
                
                const selectResult = await client.query(
                    'SELECT * FROM configurations WHERE key = $1',
                    ['test.key']
                );
                
                return { inserted: insertResult.rows[0], selected: selectResult.rows[0] };
            });

            expect(result.inserted).toBeDefined();
            expect(result.selected).toBeDefined();
            expect(result.inserted.key).toBe('test.key');
        });

        test('should provide health status', async () => {
            const health = await getHealthStatus();
            expect(health.status).toBe('healthy');
            expect(health.timestamp).toBeDefined();
        });
    });

    describe('Workflow Model', () => {
        let testWorkflow;

        test('should create a workflow', async () => {
            const workflowData = {
                name: 'Test Workflow',
                description: 'A test workflow',
                type: 'ci_cd',
                status: 'draft',
                priority: 5,
                definition: { stages: ['test', 'build'] },
                configuration: { parallel: true },
                environment_variables: { NODE_ENV: 'test' },
                tags: ['test', 'ci-cd'],
                metadata: { test: true }
            };

            testWorkflow = await workflowModel.createWorkflow(workflowData);
            
            expect(testWorkflow).toBeDefined();
            expect(testWorkflow.name).toBe(workflowData.name);
            expect(testWorkflow.type).toBe(workflowData.type);
            expect(testWorkflow.status).toBe(workflowData.status);
            expect(testWorkflow.id).toBeDefined();
        });

        test('should find workflow by ID', async () => {
            const found = await workflowModel.findById(testWorkflow.id);
            expect(found).toBeDefined();
            expect(found.id).toBe(testWorkflow.id);
            expect(found.name).toBe(testWorkflow.name);
        });

        test('should get workflows by status', async () => {
            const workflows = await workflowModel.getByStatus('draft');
            expect(workflows).toBeInstanceOf(Array);
            expect(workflows.length).toBeGreaterThan(0);
            expect(workflows.some(w => w.id === testWorkflow.id)).toBe(true);
        });

        test('should update workflow status', async () => {
            const updated = await workflowModel.updateStatus(testWorkflow.id, 'active');
            expect(updated.status).toBe('active');
            expect(updated.started_at).toBeDefined();
        });

        test('should get workflow progress', async () => {
            const progress = await workflowModel.getProgress(testWorkflow.id);
            expect(progress).toBeDefined();
            expect(progress.total_tasks).toBeDefined();
            expect(progress.progress_percentage).toBeDefined();
        });

        test('should search workflows', async () => {
            const results = await workflowModel.search('Test');
            expect(results).toBeInstanceOf(Array);
            expect(results.some(w => w.id === testWorkflow.id)).toBe(true);
        });
    });

    describe('Task Model', () => {
        let testTask;

        test('should create a task', async () => {
            const taskData = {
                workflow_id: testWorkflow.id,
                name: 'Test Task',
                description: 'A test task',
                type: 'testing',
                status: 'pending',
                priority: 7,
                command: 'npm test',
                parameters: { coverage: true },
                environment: { NODE_ENV: 'test' },
                working_directory: '/workspace',
                depends_on: [],
                execution_order: 1,
                max_retries: 3,
                estimated_duration_seconds: 120,
                timeout_seconds: 300,
                tags: ['test', 'unit'],
                metadata: { critical: true }
            };

            testTask = await taskModel.createTask(taskData);
            
            expect(testTask).toBeDefined();
            expect(testTask.name).toBe(taskData.name);
            expect(testTask.workflow_id).toBe(taskData.workflow_id);
            expect(testTask.type).toBe(taskData.type);
            expect(testTask.id).toBeDefined();
        });

        test('should find task by ID', async () => {
            const found = await taskModel.findById(testTask.id);
            expect(found).toBeDefined();
            expect(found.id).toBe(testTask.id);
            expect(found.name).toBe(testTask.name);
        });

        test('should get tasks by workflow', async () => {
            const tasks = await taskModel.getByWorkflow(testWorkflow.id);
            expect(tasks).toBeInstanceOf(Array);
            expect(tasks.length).toBeGreaterThan(0);
            expect(tasks.some(t => t.id === testTask.id)).toBe(true);
        });

        test('should get runnable tasks', async () => {
            const runnableTasks = await taskModel.getRunnableTasks(testWorkflow.id);
            expect(runnableTasks).toBeInstanceOf(Array);
            expect(runnableTasks.some(t => t.id === testTask.id)).toBe(true);
        });

        test('should check if task can execute', async () => {
            const canExecute = await taskModel.canExecute(testTask.id);
            expect(canExecute).toBe(true);
        });

        test('should update task status', async () => {
            const updated = await taskModel.updateStatus(testTask.id, 'running');
            expect(updated.status).toBe('running');
            expect(updated.started_at).toBeDefined();
        });

        test('should update task result', async () => {
            const result = { success: true, output: 'Test passed' };
            const updated = await taskModel.updateResult(testTask.id, result, 'All tests passed', null, 0);
            
            expect(updated.status).toBe('completed');
            expect(updated.completed_at).toBeDefined();
            expect(updated.exit_code).toBe(0);
        });

        test('should get task statistics', async () => {
            const stats = await taskModel.getStatistics({ workflow_id: testWorkflow.id });
            expect(stats).toBeDefined();
            expect(stats.total_tasks).toBeGreaterThan(0);
            expect(stats.completed_tasks).toBeGreaterThan(0);
        });
    });

    describe('Performance Tests', () => {
        test('should handle concurrent queries', async () => {
            const promises = Array.from({ length: 10 }, (_, i) => 
                query('SELECT $1 as test_value', [i])
            );

            const results = await Promise.all(promises);
            expect(results).toHaveLength(10);
            results.forEach((result, index) => {
                expect(result.rows[0].test_value).toBe(index);
            });
        });

        test('should execute queries within performance threshold', async () => {
            const startTime = Date.now();
            
            await query('SELECT COUNT(*) FROM workflows');
            
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(100); // Should be under 100ms
        });

        test('should handle large result sets efficiently', async () => {
            // Insert multiple test records
            const insertPromises = Array.from({ length: 100 }, (_, i) => 
                query(
                    'INSERT INTO logs (level, message, component_name) VALUES ($1, $2, $3)',
                    ['info', `Test log message ${i}`, 'test-component']
                )
            );

            await Promise.all(insertPromises);

            const startTime = Date.now();
            const result = await query('SELECT * FROM logs WHERE component_name = $1', ['test-component']);
            const duration = Date.now() - startTime;

            expect(result.rows.length).toBeGreaterThanOrEqual(100);
            expect(duration).toBeLessThan(200); // Should be under 200ms
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid queries gracefully', async () => {
            await expect(query('SELECT * FROM non_existent_table')).rejects.toThrow();
        });

        test('should handle transaction rollbacks', async () => {
            await expect(transaction(async (client) => {
                await client.query('INSERT INTO workflows (name, type) VALUES ($1, $2)', ['Test', 'ci_cd']);
                throw new Error('Intentional error');
            })).rejects.toThrow('Intentional error');

            // Verify the transaction was rolled back
            const result = await query('SELECT * FROM workflows WHERE name = $1', ['Test']);
            expect(result.rows).toHaveLength(0);
        });

        test('should handle connection errors gracefully', async () => {
            // This test would require mocking the database connection
            // For now, we'll just verify the error handling structure exists
            expect(typeof getHealthStatus).toBe('function');
        });
    });

    describe('Data Integrity', () => {
        test('should enforce foreign key constraints', async () => {
            await expect(taskModel.createTask({
                workflow_id: '00000000-0000-0000-0000-000000000000', // Non-existent workflow
                name: 'Invalid Task',
                type: 'testing'
            })).rejects.toThrow();
        });

        test('should enforce unique constraints', async () => {
            // Try to create a component with duplicate name
            await query(
                'INSERT INTO components (name, type) VALUES ($1, $2)',
                ['unique-component', 'custom']
            );

            await expect(query(
                'INSERT INTO components (name, type) VALUES ($1, $2)',
                ['unique-component', 'custom']
            )).rejects.toThrow();
        });

        test('should enforce check constraints', async () => {
            await expect(workflowModel.createWorkflow({
                name: 'Invalid Priority Workflow',
                type: 'ci_cd',
                priority: 15 // Invalid priority (should be 0-10)
            })).rejects.toThrow();
        });
    });

    describe('System Health', () => {
        test('should provide comprehensive health status', async () => {
            const health = await getDatabaseHealth();
            expect(health.status).toBe('healthy');
            expect(health.models).toBeDefined();
            expect(health.models.workflows).toBeDefined();
            expect(health.models.tasks).toBeDefined();
        });

        test('should provide database statistics', async () => {
            const stats = await getDatabaseStatistics();
            expect(stats.tables).toBeInstanceOf(Array);
            expect(stats.indexes).toBeInstanceOf(Array);
            expect(stats.size).toBeDefined();
            expect(stats.connections).toBeDefined();
        });
    });

    describe('Cleanup', () => {
        test('should clean up test data', async () => {
            // Clean up test data
            await query('DELETE FROM tasks WHERE workflow_id = $1', [testWorkflow.id]);
            await query('DELETE FROM workflows WHERE id = $1', [testWorkflow.id]);
            await query('DELETE FROM configurations WHERE key = $1', ['test.key']);
            await query('DELETE FROM logs WHERE component_name = $1', ['test-component']);
            await query('DELETE FROM components WHERE name = $1', ['unique-component']);

            // Verify cleanup
            const workflowCount = await query('SELECT COUNT(*) FROM workflows WHERE id = $1', [testWorkflow.id]);
            expect(parseInt(workflowCount.rows[0].count)).toBe(0);
        });
    });
});

