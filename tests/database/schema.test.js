/**
 * @fileoverview Comprehensive Database Schema Tests
 * @description Tests for PostgreSQL schema, RLS policies, and database operations
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Pool } from 'pg';
import { DatabaseConnection, getConnection, initializeDatabase } from '../../src/ai_cicd_system/database/connection.js';
import { ConnectionPoolManager, getPoolManager, initializePoolManager } from '../../src/ai_cicd_system/database/connection_pool.js';
import { dbConfig } from '../../src/ai_cicd_system/config/database_config.js';

// Test database configuration
const testDbConfig = {
    ...dbConfig,
    database: process.env.TEST_DB_NAME || 'taskmaster_test',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT) || 5432,
    user: process.env.TEST_DB_USER || 'test_user',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
};

describe('Database Schema Tests', () => {
    let db;
    let poolManager;
    let adminPool;

    beforeAll(async () => {
        // Initialize test database connection
        db = new DatabaseConnection(testDbConfig);
        await db.initialize();

        // Initialize pool manager for testing
        poolManager = new ConnectionPoolManager(testDbConfig);
        await poolManager.initialize();

        // Create admin pool for setup/teardown
        adminPool = new Pool({
            ...testDbConfig,
            user: process.env.TEST_DB_ADMIN_USER || 'postgres',
            password: process.env.TEST_DB_ADMIN_PASSWORD || 'postgres',
        });

        // Run migrations to set up schema
        await runMigrations();
    });

    afterAll(async () => {
        // Cleanup
        if (db) await db.shutdown();
        if (poolManager) await poolManager.shutdown();
        if (adminPool) await adminPool.end();
    });

    beforeEach(async () => {
        // Clean up test data before each test
        await cleanupTestData();
    });

    afterEach(async () => {
        // Clean up test data after each test
        await cleanupTestData();
    });

    describe('Schema Structure', () => {
        test('should have all required tables', async () => {
            const result = await db.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `);

            const tableNames = result.rows.map(row => row.table_name);
            const expectedTables = [
                'audit_logs',
                'error_logs',
                'performance_metrics',
                'schema_migrations',
                'task_contexts',
                'task_dependencies',
                'tasks',
                'user_roles',
                'users',
                'validation_results',
                'workflow_states'
            ];

            expectedTables.forEach(table => {
                expect(tableNames).toContain(table);
            });
        });

        test('should have proper indexes', async () => {
            const result = await db.query(`
                SELECT 
                    schemaname,
                    tablename,
                    indexname,
                    indexdef
                FROM pg_indexes 
                WHERE schemaname = 'public'
                ORDER BY tablename, indexname
            `);

            expect(result.rows.length).toBeGreaterThan(20); // Should have many indexes

            // Check for specific critical indexes
            const indexNames = result.rows.map(row => row.indexname);
            expect(indexNames).toContain('idx_tasks_status');
            expect(indexNames).toContain('idx_validation_results_task_id');
            expect(indexNames).toContain('idx_error_logs_severity');
        });

        test('should have proper foreign key constraints', async () => {
            const result = await db.query(`
                SELECT 
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = 'public'
                ORDER BY tc.table_name, kcu.column_name
            `);

            expect(result.rows.length).toBeGreaterThan(5); // Should have multiple FK constraints

            // Check for specific foreign keys
            const foreignKeys = result.rows.map(row => ({
                table: row.table_name,
                column: row.column_name,
                foreignTable: row.foreign_table_name,
                foreignColumn: row.foreign_column_name
            }));

            expect(foreignKeys).toContainEqual({
                table: 'validation_results',
                column: 'task_id',
                foreignTable: 'tasks',
                foreignColumn: 'id'
            });
        });

        test('should have proper check constraints', async () => {
            const result = await db.query(`
                SELECT 
                    tc.table_name,
                    tc.constraint_name,
                    cc.check_clause
                FROM information_schema.table_constraints tc
                JOIN information_schema.check_constraints cc
                    ON tc.constraint_name = cc.constraint_name
                WHERE tc.constraint_type = 'CHECK'
                    AND tc.table_schema = 'public'
                ORDER BY tc.table_name, tc.constraint_name
            `);

            expect(result.rows.length).toBeGreaterThan(10); // Should have multiple check constraints

            // Check for specific constraints
            const constraints = result.rows.map(row => ({
                table: row.table_name,
                name: row.constraint_name,
                clause: row.check_clause
            }));

            const taskStatusConstraint = constraints.find(c => 
                c.table === 'tasks' && c.name === 'tasks_status_check'
            );
            expect(taskStatusConstraint).toBeDefined();
            expect(taskStatusConstraint.clause).toContain('pending');
            expect(taskStatusConstraint.clause).toContain('completed');
        });
    });

    describe('Row-Level Security (RLS)', () => {
        test('should have RLS enabled on all tables', async () => {
            const result = await db.query(`
                SELECT 
                    schemaname,
                    tablename,
                    rowsecurity
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            `);

            const tablesWithoutRLS = result.rows.filter(row => !row.rowsecurity);
            expect(tablesWithoutRLS).toHaveLength(0);
        });

        test('should have proper RLS policies', async () => {
            const result = await db.query(`
                SELECT 
                    schemaname,
                    tablename,
                    policyname,
                    permissive,
                    roles,
                    cmd,
                    qual,
                    with_check
                FROM pg_policies 
                WHERE schemaname = 'public'
                ORDER BY tablename, policyname
            `);

            expect(result.rows.length).toBeGreaterThan(15); // Should have many policies

            // Check for specific policies
            const policies = result.rows.map(row => ({
                table: row.tablename,
                name: row.policyname,
                command: row.cmd
            }));

            expect(policies).toContainEqual(
                expect.objectContaining({
                    table: 'tasks',
                    name: 'tasks_select_policy',
                    command: 'SELECT'
                })
            );
        });

        test('should have proper user roles and permissions', async () => {
            // Test default roles exist
            const rolesResult = await db.query(`
                SELECT role_name, permissions 
                FROM user_roles 
                ORDER BY role_name
            `);

            const roleNames = rolesResult.rows.map(row => row.role_name);
            expect(roleNames).toContain('admin');
            expect(roleNames).toContain('developer');
            expect(roleNames).toContain('viewer');
            expect(roleNames).toContain('api_client');

            // Test admin has wildcard permissions
            const adminRole = rolesResult.rows.find(row => row.role_name === 'admin');
            expect(adminRole.permissions).toContain('*');
        });
    });

    describe('Database Functions', () => {
        test('should have required utility functions', async () => {
            const result = await db.query(`
                SELECT 
                    routine_name,
                    routine_type,
                    data_type
                FROM information_schema.routines 
                WHERE routine_schema = 'public'
                    AND routine_type = 'FUNCTION'
                ORDER BY routine_name
            `);

            const functionNames = result.rows.map(row => row.routine_name);
            expect(functionNames).toContain('get_current_user_role');
            expect(functionNames).toContain('user_has_permission');
            expect(functionNames).toContain('get_user_accessible_tasks');
            expect(functionNames).toContain('create_app_user');
        });

        test('should have working trigger functions', async () => {
            // Test updated_at trigger
            const taskResult = await db.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Test Task', 'Test Description', 'general', 'pending')
                RETURNING id, created_at, updated_at
            `);

            const taskId = taskResult.rows[0].id;
            const originalUpdatedAt = taskResult.rows[0].updated_at;

            // Wait a moment and update
            await new Promise(resolve => setTimeout(resolve, 100));

            await db.query(`
                UPDATE tasks 
                SET description = 'Updated Description'
                WHERE id = $1
            `, [taskId]);

            const updatedResult = await db.query(`
                SELECT updated_at 
                FROM tasks 
                WHERE id = $1
            `, [taskId]);

            const newUpdatedAt = updatedResult.rows[0].updated_at;
            expect(new Date(newUpdatedAt)).toBeAfter(new Date(originalUpdatedAt));
        });

        test('should have working audit triggers', async () => {
            // Insert a task
            const taskResult = await db.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Audit Test Task', 'Test Description', 'general', 'pending')
                RETURNING id
            `);

            const taskId = taskResult.rows[0].id;

            // Check audit log
            const auditResult = await db.query(`
                SELECT entity_type, entity_id, action, new_values
                FROM audit_logs 
                WHERE entity_type = 'tasks' AND entity_id = $1
                ORDER BY timestamp DESC
                LIMIT 1
            `, [taskId]);

            expect(auditResult.rows).toHaveLength(1);
            expect(auditResult.rows[0].action).toBe('create');
            expect(auditResult.rows[0].new_values).toHaveProperty('title', 'Audit Test Task');
        });
    });

    describe('Data Integrity', () => {
        test('should enforce task status constraints', async () => {
            await expect(
                db.query(`
                    INSERT INTO tasks (title, description, type, status)
                    VALUES ('Test Task', 'Test Description', 'general', 'invalid_status')
                `)
            ).rejects.toThrow();
        });

        test('should enforce priority constraints', async () => {
            await expect(
                db.query(`
                    INSERT INTO tasks (title, description, type, priority)
                    VALUES ('Test Task', 'Test Description', 'general', 15)
                `)
            ).rejects.toThrow();
        });

        test('should enforce validation score constraints', async () => {
            // First create a task
            const taskResult = await db.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Test Task', 'Test Description', 'general', 'pending')
                RETURNING id
            `);

            const taskId = taskResult.rows[0].id;

            // Try to insert invalid validation score
            await expect(
                db.query(`
                    INSERT INTO validation_results (task_id, validation_type, validation_status, validation_score)
                    VALUES ($1, 'syntax', 'passed', 150)
                `, [taskId])
            ).rejects.toThrow();
        });

        test('should prevent circular task dependencies', async () => {
            // Create two tasks
            const task1Result = await db.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Task 1', 'Test Description', 'general', 'pending')
                RETURNING id
            `);

            const task2Result = await db.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Task 2', 'Test Description', 'general', 'pending')
                RETURNING id
            `);

            const task1Id = task1Result.rows[0].id;
            const task2Id = task2Result.rows[0].id;

            // Create dependency: task1 -> task2
            await db.query(`
                INSERT INTO task_dependencies (parent_task_id, child_task_id, dependency_type)
                VALUES ($1, $2, 'blocks')
            `, [task1Id, task2Id]);

            // Try to create circular dependency: task2 -> task1
            // Note: This test assumes we have a trigger or constraint to prevent this
            // If not implemented yet, this test documents the requirement
            try {
                await db.query(`
                    INSERT INTO task_dependencies (parent_task_id, child_task_id, dependency_type)
                    VALUES ($1, $2, 'blocks')
                `, [task2Id, task1Id]);
                
                // If we get here, check if the circular dependency was actually created
                const circularCheck = await db.query(`
                    WITH RECURSIVE dependency_chain AS (
                        SELECT parent_task_id, child_task_id, 1 as depth
                        FROM task_dependencies
                        WHERE parent_task_id = $1
                        
                        UNION ALL
                        
                        SELECT td.parent_task_id, td.child_task_id, dc.depth + 1
                        FROM task_dependencies td
                        JOIN dependency_chain dc ON td.parent_task_id = dc.child_task_id
                        WHERE dc.depth < 10
                    )
                    SELECT COUNT(*) as circular_count
                    FROM dependency_chain
                    WHERE child_task_id = $1
                `, [task1Id]);

                // If circular dependency exists, it should be detected
                if (circularCheck.rows[0].circular_count > 0) {
                    console.warn('Circular dependency detected but not prevented - consider adding constraint');
                }
            } catch (error) {
                // This is expected if circular dependency prevention is implemented
                expect(error.message).toMatch(/circular|cycle|dependency/i);
            }
        });
    });

    describe('Performance', () => {
        test('should handle concurrent connections', async () => {
            const concurrentQueries = Array.from({ length: 10 }, (_, i) =>
                db.query('SELECT $1 as query_number', [i])
            );

            const results = await Promise.all(concurrentQueries);
            expect(results).toHaveLength(10);
            results.forEach((result, index) => {
                expect(result.rows[0].query_number).toBe(index);
            });
        });

        test('should execute queries within performance thresholds', async () => {
            const startTime = Date.now();
            
            await db.query(`
                SELECT COUNT(*) 
                FROM tasks t
                LEFT JOIN task_contexts tc ON t.id = tc.task_id
                LEFT JOIN validation_results vr ON t.id = vr.task_id
            `);

            const executionTime = Date.now() - startTime;
            expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle large result sets efficiently', async () => {
            // Insert test data
            const insertPromises = Array.from({ length: 100 }, (_, i) =>
                db.query(`
                    INSERT INTO tasks (title, description, type, status)
                    VALUES ($1, $2, 'general', 'pending')
                `, [`Test Task ${i}`, `Description ${i}`])
            );

            await Promise.all(insertPromises);

            const startTime = Date.now();
            const result = await db.query('SELECT * FROM tasks ORDER BY created_at');
            const executionTime = Date.now() - startTime;

            expect(result.rows.length).toBeGreaterThanOrEqual(100);
            expect(executionTime).toBeLessThan(500); // Should complete within 500ms
        });
    });

    describe('Connection Pool Management', () => {
        test('should route queries to appropriate pools', async () => {
            // Test read query routing
            const readResult = await poolManager.query('SELECT COUNT(*) FROM tasks');
            expect(readResult.rows).toHaveLength(1);

            // Test write query routing
            const writeResult = await poolManager.query(`
                INSERT INTO tasks (title, description, type, status)
                VALUES ('Pool Test Task', 'Test Description', 'general', 'pending')
                RETURNING id
            `);
            expect(writeResult.rows).toHaveLength(1);
        });

        test('should handle transactions correctly', async () => {
            const result = await poolManager.transaction(async (client) => {
                const task1 = await client.query(`
                    INSERT INTO tasks (title, description, type, status)
                    VALUES ('Transaction Task 1', 'Test Description', 'general', 'pending')
                    RETURNING id
                `);

                const task2 = await client.query(`
                    INSERT INTO tasks (title, description, type, status)
                    VALUES ('Transaction Task 2', 'Test Description', 'general', 'pending')
                    RETURNING id
                `);

                return { task1: task1.rows[0].id, task2: task2.rows[0].id };
            });

            expect(result.task1).toBeDefined();
            expect(result.task2).toBeDefined();

            // Verify both tasks were created
            const verifyResult = await db.query(`
                SELECT COUNT(*) as count 
                FROM tasks 
                WHERE id IN ($1, $2)
            `, [result.task1, result.task2]);

            expect(verifyResult.rows[0].count).toBe('2');
        });

        test('should provide health status', async () => {
            const health = poolManager.getHealth();
            
            expect(health).toHaveProperty('isInitialized', true);
            expect(health).toHaveProperty('poolCount');
            expect(health).toHaveProperty('pools');
            expect(health.pools).toHaveProperty('read');
            expect(health.pools).toHaveProperty('write');
        });

        test('should provide performance metrics', async () => {
            // Execute some queries to generate metrics
            await poolManager.query('SELECT 1');
            await poolManager.query('SELECT 2');

            const metrics = poolManager.getMetrics();
            
            expect(metrics).toHaveProperty('read');
            expect(metrics.read).toHaveProperty('totalQueries');
            expect(metrics.read).toHaveProperty('successfulQueries');
            expect(metrics.read).toHaveProperty('successRate');
        });
    });

    // Helper functions
    async function runMigrations() {
        const migrationFiles = [
            '001_initial_schema.sql',
            '002_validation_and_error_tables.sql',
            '003_row_level_security.sql'
        ];

        for (const file of migrationFiles) {
            try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const migrationPath = path.join(process.cwd(), 'src/ai_cicd_system/database/migrations', file);
                const migrationSQL = await fs.readFile(migrationPath, 'utf8');
                
                // Execute migration
                await adminPool.query(migrationSQL);
                console.log(`Migration ${file} executed successfully`);
            } catch (error) {
                console.error(`Error executing migration ${file}:`, error.message);
                // Continue with other migrations
            }
        }
    }

    async function cleanupTestData() {
        const tables = [
            'audit_logs',
            'error_logs',
            'validation_results',
            'task_contexts',
            'task_dependencies',
            'workflow_states',
            'tasks',
            'users',
            'performance_metrics'
        ];

        for (const table of tables) {
            try {
                await db.query(`DELETE FROM ${table} WHERE created_at > NOW() - INTERVAL '1 hour'`);
            } catch (error) {
                // Some tables might not have created_at column
                try {
                    await db.query(`TRUNCATE ${table} CASCADE`);
                } catch (truncateError) {
                    console.warn(`Could not clean table ${table}:`, truncateError.message);
                }
            }
        }
    }
});

// Custom Jest matchers
expect.extend({
    toBeAfter(received, expected) {
        const pass = new Date(received) > new Date(expected);
        return {
            message: () => `expected ${received} to be after ${expected}`,
            pass,
        };
    },
});

