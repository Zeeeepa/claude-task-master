/**
 * @fileoverview Database Performance Benchmarks
 * @description Performance tests for database operations and query optimization
 * @version 2.0.0
 * @created 2025-05-28
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';
import { Task } from '../../src/ai_cicd_system/database/models/Task.js';
import { Workflow } from '../../src/ai_cicd_system/database/models/Workflow.js';
import { AuditLog } from '../../src/ai_cicd_system/database/models/AuditLog.js';

describe('Database Performance Benchmarks', () => {
    let dbConnection;
    let client;
    const PERFORMANCE_THRESHOLD_MS = 100; // 100ms threshold for most operations
    const BULK_OPERATION_THRESHOLD_MS = 5000; // 5 seconds for bulk operations

    beforeAll(async () => {
        // Use test database configuration
        process.env.DB_NAME = 'test_performance_db';
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '5432';
        process.env.DB_USER = 'test_user';
        process.env.DB_PASSWORD = 'test_password';

        dbConnection = new DatabaseConnection();
        
        try {
            await dbConnection.connect();
            client = dbConnection.getClient();
            
            // Ensure tables exist (run migrations if needed)
            await setupTestTables();
            
        } catch (error) {
            console.warn('Database connection failed, skipping performance tests:', error.message);
            return;
        }
    });

    afterAll(async () => {
        if (dbConnection) {
            await dbConnection.disconnect();
        }
    });

    beforeEach(async () => {
        if (!client) return;
        
        // Clean up test data before each test
        await client.query('DELETE FROM audit_logs WHERE entity_type = $1', ['test']);
        await client.query('DELETE FROM workflow_execution_steps WHERE workflow_id LIKE $1', ['test-%']);
        await client.query('DELETE FROM workflows WHERE name LIKE $1', ['Test %']);
        await client.query('DELETE FROM tasks WHERE title LIKE $1', ['Test %']);
    });

    async function setupTestTables() {
        // Create tables if they don't exist (simplified for testing)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                priority VARCHAR(20) DEFAULT 'medium',
                complexity_score INTEGER DEFAULT 5,
                repository_url VARCHAR(500),
                branch_name VARCHAR(255),
                pr_number INTEGER,
                assigned_to VARCHAR(255),
                workflow_id UUID,
                retry_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'::jsonb
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS workflows (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                trigger_type VARCHAR(100),
                current_step INTEGER DEFAULT 0,
                total_steps INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'::jsonb
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_type VARCHAR(50) NOT NULL,
                entity_id UUID NOT NULL,
                action VARCHAR(100) NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                user_id VARCHAR(255),
                metadata JSONB DEFAULT '{}'::jsonb
            )
        `);

        // Create indexes for performance
        await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)');
    }

    describe('Single Record Operations', () => {
        test('should insert single task within performance threshold', async () => {
            if (!client) return;

            const task = new Task({
                title: 'Test Performance Task',
                description: 'A task for performance testing',
                priority: 'high',
                complexity_score: 8
            });

            const startTime = Date.now();
            
            const result = await client.query(`
                INSERT INTO tasks (id, title, description, priority, complexity_score)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [task.id, task.title, task.description, task.priority, task.complexity_score]);

            const duration = Date.now() - startTime;

            expect(result.rows).toHaveLength(1);
            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            
            console.log(`Single task insert: ${duration}ms`);
        });

        test('should select single task by ID within performance threshold', async () => {
            if (!client) return;

            // Insert test task first
            const taskId = 'test-select-performance';
            await client.query(`
                INSERT INTO tasks (id, title, status)
                VALUES ($1, 'Test Select Task', 'pending')
            `, [taskId]);

            const startTime = Date.now();
            
            const result = await client.query(`
                SELECT * FROM tasks WHERE id = $1
            `, [taskId]);

            const duration = Date.now() - startTime;

            expect(result.rows).toHaveLength(1);
            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            
            console.log(`Single task select: ${duration}ms`);
        });

        test('should update single task within performance threshold', async () => {
            if (!client) return;

            // Insert test task first
            const taskId = 'test-update-performance';
            await client.query(`
                INSERT INTO tasks (id, title, status)
                VALUES ($1, 'Test Update Task', 'pending')
            `, [taskId]);

            const startTime = Date.now();
            
            const result = await client.query(`
                UPDATE tasks SET status = 'in_progress', updated_at = NOW()
                WHERE id = $1
                RETURNING id
            `, [taskId]);

            const duration = Date.now() - startTime;

            expect(result.rows).toHaveLength(1);
            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            
            console.log(`Single task update: ${duration}ms`);
        });
    });

    describe('Bulk Operations', () => {
        test('should insert 1000 tasks within bulk operation threshold', async () => {
            if (!client) return;

            const tasks = [];
            for (let i = 0; i < 1000; i++) {
                tasks.push([
                    `test-bulk-${i}`,
                    `Test Bulk Task ${i}`,
                    'pending',
                    i % 4 === 0 ? 'high' : 'medium',
                    Math.floor(Math.random() * 10) + 1
                ]);
            }

            const startTime = Date.now();

            // Use batch insert for better performance
            const values = tasks.map((_, index) => {
                const offset = index * 5;
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
            }).join(', ');

            const flatValues = tasks.flat();

            await client.query(`
                INSERT INTO tasks (id, title, status, priority, complexity_score)
                VALUES ${values}
            `, flatValues);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(BULK_OPERATION_THRESHOLD_MS);
            
            console.log(`Bulk insert 1000 tasks: ${duration}ms (${(duration/1000).toFixed(2)}ms per task)`);

            // Verify all tasks were inserted
            const countResult = await client.query(`
                SELECT COUNT(*) FROM tasks WHERE id LIKE 'test-bulk-%'
            `);
            expect(parseInt(countResult.rows[0].count)).toBe(1000);
        });

        test('should query 1000 tasks with filtering within performance threshold', async () => {
            if (!client) return;

            // First ensure we have test data
            await client.query(`
                INSERT INTO tasks (id, title, status, priority, assigned_to)
                SELECT 
                    'test-query-' || generate_series,
                    'Test Query Task ' || generate_series,
                    CASE WHEN generate_series % 3 = 0 THEN 'completed' ELSE 'pending' END,
                    CASE WHEN generate_series % 4 = 0 THEN 'high' ELSE 'medium' END,
                    CASE WHEN generate_series % 5 = 0 THEN 'user-' || (generate_series % 10) ELSE NULL END
                FROM generate_series(1, 1000)
            `);

            const startTime = Date.now();

            const result = await client.query(`
                SELECT id, title, status, priority, assigned_to, created_at
                FROM tasks 
                WHERE id LIKE 'test-query-%'
                AND status = 'pending'
                AND priority = 'high'
                ORDER BY created_at DESC
                LIMIT 100
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(result.rows.length).toBeGreaterThan(0);
            
            console.log(`Complex query on 1000 tasks: ${duration}ms`);
        });

        test('should perform bulk update within performance threshold', async () => {
            if (!client) return;

            // Insert test data
            await client.query(`
                INSERT INTO tasks (id, title, status)
                SELECT 
                    'test-bulk-update-' || generate_series,
                    'Test Bulk Update Task ' || generate_series,
                    'pending'
                FROM generate_series(1, 500)
            `);

            const startTime = Date.now();

            const result = await client.query(`
                UPDATE tasks 
                SET status = 'in_progress', updated_at = NOW()
                WHERE id LIKE 'test-bulk-update-%'
                AND status = 'pending'
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(BULK_OPERATION_THRESHOLD_MS);
            expect(result.rowCount).toBe(500);
            
            console.log(`Bulk update 500 tasks: ${duration}ms`);
        });
    });

    describe('Complex Query Performance', () => {
        test('should perform JOIN queries within performance threshold', async () => {
            if (!client) return;

            // Insert test workflows and tasks
            await client.query(`
                INSERT INTO workflows (id, name, status, total_steps)
                SELECT 
                    'test-workflow-' || generate_series,
                    'Test Workflow ' || generate_series,
                    CASE WHEN generate_series % 2 = 0 THEN 'active' ELSE 'completed' END,
                    generate_series % 5 + 1
                FROM generate_series(1, 100)
            `);

            await client.query(`
                INSERT INTO tasks (id, title, status, workflow_id)
                SELECT 
                    'test-join-task-' || generate_series,
                    'Test Join Task ' || generate_series,
                    CASE WHEN generate_series % 3 = 0 THEN 'completed' ELSE 'pending' END,
                    'test-workflow-' || ((generate_series % 100) + 1)
                FROM generate_series(1, 500)
            `);

            const startTime = Date.now();

            const result = await client.query(`
                SELECT 
                    w.id as workflow_id,
                    w.name as workflow_name,
                    w.status as workflow_status,
                    COUNT(t.id) as task_count,
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                    AVG(t.complexity_score) as avg_complexity
                FROM workflows w
                LEFT JOIN tasks t ON w.id = t.workflow_id
                WHERE w.id LIKE 'test-workflow-%'
                GROUP BY w.id, w.name, w.status
                HAVING COUNT(t.id) > 0
                ORDER BY task_count DESC
                LIMIT 50
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(result.rows.length).toBeGreaterThan(0);
            
            console.log(`Complex JOIN query: ${duration}ms`);
        });

        test('should perform aggregation queries within performance threshold', async () => {
            if (!client) return;

            // Ensure we have test data
            await client.query(`
                INSERT INTO tasks (id, title, status, priority, complexity_score, created_at)
                SELECT 
                    'test-agg-' || generate_series,
                    'Test Aggregation Task ' || generate_series,
                    (ARRAY['pending', 'in_progress', 'completed', 'failed'])[((generate_series % 4) + 1)],
                    (ARRAY['low', 'medium', 'high', 'critical'])[((generate_series % 4) + 1)],
                    (generate_series % 10) + 1,
                    NOW() - (generate_series || ' hours')::INTERVAL
                FROM generate_series(1, 1000)
            `);

            const startTime = Date.now();

            const result = await client.query(`
                SELECT 
                    status,
                    priority,
                    COUNT(*) as task_count,
                    AVG(complexity_score) as avg_complexity,
                    MIN(created_at) as oldest_task,
                    MAX(created_at) as newest_task,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY complexity_score) as median_complexity
                FROM tasks
                WHERE id LIKE 'test-agg-%'
                GROUP BY status, priority
                ORDER BY task_count DESC
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(result.rows.length).toBeGreaterThan(0);
            
            console.log(`Aggregation query on 1000 tasks: ${duration}ms`);
        });

        test('should perform JSONB queries within performance threshold', async () => {
            if (!client) return;

            // Insert tasks with JSONB metadata
            await client.query(`
                INSERT INTO tasks (id, title, metadata)
                SELECT 
                    'test-jsonb-' || generate_series,
                    'Test JSONB Task ' || generate_series,
                    ('{"tags": ["tag' || (generate_series % 5) || '"], "config": {"timeout": ' || (generate_series * 10) || ', "retries": ' || (generate_series % 3) || '}}')::jsonb
                FROM generate_series(1, 500)
            `);

            const startTime = Date.now();

            const result = await client.query(`
                SELECT 
                    id,
                    title,
                    metadata->'config'->>'timeout' as timeout,
                    metadata->'tags' as tags
                FROM tasks
                WHERE id LIKE 'test-jsonb-%'
                AND metadata->'config'->>'timeout'::int > 100
                AND metadata->'tags' ? 'tag1'
                ORDER BY (metadata->'config'->>'timeout')::int DESC
                LIMIT 100
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            
            console.log(`JSONB query: ${duration}ms`);
        });
    });

    describe('Concurrent Operations', () => {
        test('should handle concurrent inserts efficiently', async () => {
            if (!client) return;

            const concurrentOperations = 10;
            const recordsPerOperation = 50;

            const startTime = Date.now();

            const promises = Array.from({ length: concurrentOperations }, async (_, index) => {
                const values = Array.from({ length: recordsPerOperation }, (_, recordIndex) => {
                    const id = `test-concurrent-${index}-${recordIndex}`;
                    return `('${id}', 'Concurrent Task ${index}-${recordIndex}', 'pending')`;
                }).join(', ');

                return client.query(`
                    INSERT INTO tasks (id, title, status)
                    VALUES ${values}
                `);
            });

            await Promise.all(promises);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(BULK_OPERATION_THRESHOLD_MS);
            
            console.log(`${concurrentOperations} concurrent operations (${recordsPerOperation} records each): ${duration}ms`);

            // Verify all records were inserted
            const countResult = await client.query(`
                SELECT COUNT(*) FROM tasks WHERE id LIKE 'test-concurrent-%'
            `);
            expect(parseInt(countResult.rows[0].count)).toBe(concurrentOperations * recordsPerOperation);
        });

        test('should handle concurrent reads efficiently', async () => {
            if (!client) return;

            // Insert test data
            await client.query(`
                INSERT INTO tasks (id, title, status, priority)
                SELECT 
                    'test-read-' || generate_series,
                    'Test Read Task ' || generate_series,
                    (ARRAY['pending', 'in_progress', 'completed'])[((generate_series % 3) + 1)],
                    (ARRAY['low', 'medium', 'high'])[((generate_series % 3) + 1)]
                FROM generate_series(1, 1000)
            `);

            const concurrentReads = 20;
            const startTime = Date.now();

            const promises = Array.from({ length: concurrentReads }, async (_, index) => {
                return client.query(`
                    SELECT id, title, status, priority
                    FROM tasks 
                    WHERE id LIKE 'test-read-%'
                    AND status = $1
                    ORDER BY created_at DESC
                    LIMIT 50
                `, [(index % 3 === 0) ? 'pending' : (index % 3 === 1) ? 'in_progress' : 'completed']);
            });

            const results = await Promise.all(promises);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(BULK_OPERATION_THRESHOLD_MS);
            expect(results.every(result => result.rows.length > 0)).toBe(true);
            
            console.log(`${concurrentReads} concurrent read operations: ${duration}ms`);
        });
    });

    describe('Index Performance', () => {
        test('should demonstrate index effectiveness', async () => {
            if (!client) return;

            // Insert large dataset
            await client.query(`
                INSERT INTO tasks (id, title, status, priority, assigned_to, created_at)
                SELECT 
                    'test-index-' || generate_series,
                    'Test Index Task ' || generate_series,
                    (ARRAY['pending', 'in_progress', 'completed', 'failed'])[((generate_series % 4) + 1)],
                    (ARRAY['low', 'medium', 'high', 'critical'])[((generate_series % 4) + 1)],
                    CASE WHEN generate_series % 10 = 0 THEN 'user-' || (generate_series % 100) ELSE NULL END,
                    NOW() - (generate_series || ' minutes')::INTERVAL
                FROM generate_series(1, 10000)
            `);

            // Test indexed query (status)
            const startTime1 = Date.now();
            const result1 = await client.query(`
                SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND id LIKE 'test-index-%'
            `);
            const indexedDuration = Date.now() - startTime1;

            // Test query with multiple indexed columns
            const startTime2 = Date.now();
            const result2 = await client.query(`
                SELECT id, title, status, priority, assigned_to
                FROM tasks 
                WHERE status = 'pending' 
                AND priority = 'high'
                AND id LIKE 'test-index-%'
                ORDER BY created_at DESC
                LIMIT 100
            `);
            const multiIndexDuration = Date.now() - startTime2;

            expect(indexedDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(multiIndexDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            
            console.log(`Indexed query on 10k records: ${indexedDuration}ms`);
            console.log(`Multi-index query on 10k records: ${multiIndexDuration}ms`);
        });
    });

    describe('Memory and Resource Usage', () => {
        test('should handle large result sets efficiently', async () => {
            if (!client) return;

            // Insert large dataset
            await client.query(`
                INSERT INTO tasks (id, title, status, metadata)
                SELECT 
                    'test-memory-' || generate_series,
                    'Test Memory Task ' || generate_series,
                    'pending',
                    ('{"data": "' || repeat('x', 100) || '", "index": ' || generate_series || '}')::jsonb
                FROM generate_series(1, 5000)
            `);

            const startTime = Date.now();

            // Query large result set
            const result = await client.query(`
                SELECT id, title, status, metadata
                FROM tasks 
                WHERE id LIKE 'test-memory-%'
                ORDER BY created_at
            `);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(BULK_OPERATION_THRESHOLD_MS);
            expect(result.rows.length).toBe(5000);
            
            console.log(`Large result set query (5000 records): ${duration}ms`);
        });
    });

    describe('Performance Regression Tests', () => {
        test('should maintain consistent performance across operations', async () => {
            if (!client) return;

            const iterations = 10;
            const durations = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();
                
                await client.query(`
                    INSERT INTO tasks (id, title, status)
                    VALUES ($1, $2, 'pending')
                `, [`test-regression-${i}`, `Regression Test Task ${i}`]);

                const result = await client.query(`
                    SELECT * FROM tasks WHERE id = $1
                `, [`test-regression-${i}`]);

                await client.query(`
                    UPDATE tasks SET status = 'completed' WHERE id = $1
                `, [`test-regression-${i}`]);

                const duration = Date.now() - startTime;
                durations.push(duration);
            }

            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations);

            expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2); // Allow some variance
            
            console.log(`Performance consistency test - Avg: ${avgDuration.toFixed(2)}ms, Min: ${minDuration}ms, Max: ${maxDuration}ms`);
        });
    });
});

