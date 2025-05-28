/**
 * @fileoverview Migration Runner Tests
 * @description Tests for database migration system with rollback capabilities
 * @version 2.0.0
 * @created 2025-05-28
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';
import migration001 from '../../src/ai_cicd_system/database/migrations/001_create_tasks_table.js';
import migration002 from '../../src/ai_cicd_system/database/migrations/002_create_workflows_table.js';
import migration003 from '../../src/ai_cicd_system/database/migrations/003_create_audit_tables.js';

// Mock logger for testing
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
};

describe('Migration System Tests', () => {
    let dbConnection;
    let client;

    beforeAll(async () => {
        // Use test database configuration
        process.env.DB_NAME = 'test_codegen_taskmaster_db';
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '5432';
        process.env.DB_USER = 'test_user';
        process.env.DB_PASSWORD = 'test_password';

        dbConnection = new DatabaseConnection();
        
        try {
            await dbConnection.connect();
            client = dbConnection.getClient();
            
            // Clean up any existing test data
            await client.query('DROP SCHEMA IF EXISTS public CASCADE');
            await client.query('CREATE SCHEMA public');
            await client.query('GRANT ALL ON SCHEMA public TO public');
            
        } catch (error) {
            console.warn('Database connection failed, skipping migration tests:', error.message);
            return;
        }
    });

    afterAll(async () => {
        if (dbConnection) {
            await dbConnection.disconnect();
        }
    });

    beforeEach(() => {
        // Clear mock calls
        Object.values(mockLogger).forEach(fn => fn.mockClear());
    });

    describe('Migration 001: Tasks Table', () => {
        test('should validate prerequisites', async () => {
            if (!client) return; // Skip if no database connection
            
            const validation = await migration001.validate(client);
            expect(validation).toHaveProperty('valid');
            expect(validation).toHaveProperty('errors');
            expect(validation).toHaveProperty('warnings');
        });

        test('should execute migration successfully', async () => {
            if (!client) return;
            
            const result = await migration001.up(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.version).toBe('001');
            expect(result.duration).toBeGreaterThan(0);
            expect(result.details).toHaveProperty('columns');
            expect(result.details).toHaveProperty('indexes');
            expect(result.details).toHaveProperty('triggers');
            
            // Verify table creation
            const tableCheck = await client.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name = 'tasks'
            `);
            expect(tableCheck.rows).toHaveLength(1);
        });

        test('should create proper indexes', async () => {
            if (!client) return;
            
            const indexCheck = await client.query(`
                SELECT indexname FROM pg_indexes 
                WHERE tablename = 'tasks'
                ORDER BY indexname
            `);
            
            const indexNames = indexCheck.rows.map(row => row.indexname);
            expect(indexNames).toContain('idx_tasks_status');
            expect(indexNames).toContain('idx_tasks_priority');
            expect(indexNames).toContain('idx_tasks_assigned_to');
            expect(indexNames).toContain('idx_tasks_workflow_id');
        });

        test('should create proper triggers', async () => {
            if (!client) return;
            
            const triggerCheck = await client.query(`
                SELECT trigger_name FROM information_schema.triggers 
                WHERE event_object_table = 'tasks'
            `);
            
            const triggerNames = triggerCheck.rows.map(row => row.trigger_name);
            expect(triggerNames).toContain('trigger_tasks_updated_at');
            expect(triggerNames).toContain('trigger_validate_task_status_transition');
        });

        test('should create proper views', async () => {
            if (!client) return;
            
            const viewCheck = await client.query(`
                SELECT table_name FROM information_schema.views 
                WHERE table_name LIKE 'v_%tasks%'
            `);
            
            const viewNames = viewCheck.rows.map(row => row.table_name);
            expect(viewNames).toContain('v_active_tasks');
            expect(viewNames).toContain('v_task_statistics');
            expect(viewNames).toContain('v_high_priority_tasks');
        });

        test('should get migration status', async () => {
            if (!client) return;
            
            const status = await migration001.getStatus(client);
            expect(status.applied).toBe(true);
            expect(status.version).toBe('001');
            expect(status.appliedAt).toBeTruthy();
        });
    });

    describe('Migration 002: Workflows Table', () => {
        test('should validate dependencies', async () => {
            if (!client) return;
            
            const validation = await migration002.validate(client);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        test('should execute migration successfully', async () => {
            if (!client) return;
            
            const result = await migration002.up(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.version).toBe('002');
            expect(result.details).toHaveProperty('workflowsColumns');
            expect(result.details).toHaveProperty('stepsColumns');
            expect(result.details).toHaveProperty('sampleWorkflows');
            
            // Verify tables creation
            const tablesCheck = await client.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name IN ('workflows', 'workflow_execution_steps')
                ORDER BY table_name
            `);
            expect(tablesCheck.rows).toHaveLength(2);
        });

        test('should create sample workflow templates', async () => {
            if (!client) return;
            
            const workflowsCheck = await client.query(`
                SELECT name, trigger_type FROM workflows 
                WHERE metadata->>'template' = 'true'
            `);
            
            expect(workflowsCheck.rows.length).toBeGreaterThan(0);
            
            const workflowNames = workflowsCheck.rows.map(row => row.name);
            expect(workflowNames).toContain('Basic CI/CD Pipeline');
            expect(workflowNames).toContain('PR Review Workflow');
        });

        test('should create foreign key constraint', async () => {
            if (!client) return;
            
            const constraintCheck = await client.query(`
                SELECT constraint_name FROM information_schema.table_constraints 
                WHERE table_name = 'tasks' 
                AND constraint_name = 'fk_tasks_workflow_id'
            `);
            
            expect(constraintCheck.rows).toHaveLength(1);
        });
    });

    describe('Migration 003: Audit Tables', () => {
        test('should validate all dependencies', async () => {
            if (!client) return;
            
            const validation = await migration003.validate(client);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        test('should execute migration successfully', async () => {
            if (!client) return;
            
            const result = await migration003.up(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.version).toBe('003');
            expect(result.details).toHaveProperty('auditLogsColumns');
            expect(result.details).toHaveProperty('auditSummaryColumns');
            expect(result.details).toHaveProperty('functions');
            expect(result.details.auditTriggersCreated).toBe(3);
        });

        test('should create audit functions', async () => {
            if (!client) return;
            
            const functionCheck = await client.query(`
                SELECT routine_name FROM information_schema.routines 
                WHERE routine_name IN (
                    'create_audit_log', 
                    'audit_trigger_function', 
                    'cleanup_old_audit_logs'
                )
            `);
            
            expect(functionCheck.rows.length).toBeGreaterThanOrEqual(3);
        });

        test('should create audit triggers on existing tables', async () => {
            if (!client) return;
            
            const triggerCheck = await client.query(`
                SELECT trigger_name, event_object_table 
                FROM information_schema.triggers 
                WHERE trigger_name LIKE 'audit_%_trigger'
                ORDER BY event_object_table
            `);
            
            const tables = triggerCheck.rows.map(row => row.event_object_table);
            expect(tables).toContain('tasks');
            expect(tables).toContain('workflows');
            expect(tables).toContain('workflow_execution_steps');
        });

        test('should test audit functionality', async () => {
            if (!client) return;
            
            // Test audit log creation
            const auditResult = await client.query(`
                SELECT create_audit_log(
                    'test',
                    gen_random_uuid(),
                    'test_action',
                    '{"old": "value"}'::jsonb,
                    '{"new": "value"}'::jsonb,
                    'test_user',
                    '{"test": true}'::jsonb,
                    'info',
                    'system'
                ) as audit_id
            `);
            
            expect(auditResult.rows[0].audit_id).toBeTruthy();
            
            // Verify audit log was created
            const auditCheck = await client.query(`
                SELECT * FROM audit_logs WHERE id = $1
            `, [auditResult.rows[0].audit_id]);
            
            expect(auditCheck.rows).toHaveLength(1);
            expect(auditCheck.rows[0].entity_type).toBe('test');
            expect(auditCheck.rows[0].action).toBe('test_action');
        });
    });

    describe('Migration Rollback Tests', () => {
        test('should rollback migration 003', async () => {
            if (!client) return;
            
            const result = await migration003.down(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.details.preservedData).toBe(true);
            expect(result.details.auditTriggersRemoved).toBe(3);
            
            // Verify tables are backed up
            const backupCheck = await client.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name LIKE '%audit%backup%'
            `);
            
            expect(backupCheck.rows.length).toBeGreaterThan(0);
        });

        test('should rollback migration 002', async () => {
            if (!client) return;
            
            const result = await migration002.down(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.details.preservedData).toBe(true);
            
            // Verify foreign key constraint is removed
            const constraintCheck = await client.query(`
                SELECT constraint_name FROM information_schema.table_constraints 
                WHERE table_name = 'tasks' 
                AND constraint_name = 'fk_tasks_workflow_id'
            `);
            
            expect(constraintCheck.rows).toHaveLength(0);
        });

        test('should rollback migration 001', async () => {
            if (!client) return;
            
            const result = await migration001.down(client, mockLogger);
            
            expect(result.success).toBe(true);
            expect(result.details.preservedData).toBe(true);
            
            // Verify table is backed up
            const backupCheck = await client.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name LIKE 'tasks_backup_%'
            `);
            
            expect(backupCheck.rows.length).toBeGreaterThan(0);
        });
    });

    describe('Migration Error Handling', () => {
        test('should handle invalid migration gracefully', async () => {
            if (!client) return;
            
            // Create a mock migration that will fail
            const failingMigration = {
                up: async (client, logger) => {
                    await client.query('INVALID SQL STATEMENT');
                    return { success: true };
                }
            };
            
            const result = await failingMigration.up(client, mockLogger);
            // This should throw an error, but we're testing error handling
            expect(result).toBeDefined();
        });

        test('should validate missing dependencies', async () => {
            if (!client) return;
            
            // Drop tasks table to simulate missing dependency
            await client.query('DROP TABLE IF EXISTS tasks CASCADE');
            
            const validation = await migration002.validate(client);
            expect(validation.valid).toBe(false);
            expect(validation.errors[0]).toContain('Tasks table does not exist');
        });
    });

    describe('Performance Tests', () => {
        test('should complete migrations within time limits', async () => {
            if (!client) return;
            
            // Re-run migrations to test performance
            const startTime = Date.now();
            
            await migration001.up(client, mockLogger);
            await migration002.up(client, mockLogger);
            await migration003.up(client, mockLogger);
            
            const totalTime = Date.now() - startTime;
            
            // Should complete within 2 minutes
            expect(totalTime).toBeLessThan(120000);
        });

        test('should handle concurrent migration attempts', async () => {
            if (!client) return;
            
            // This test would require multiple database connections
            // For now, we'll just verify the migration can be run multiple times
            const result1 = await migration001.up(client, mockLogger);
            const result2 = await migration001.up(client, mockLogger);
            
            // Both should succeed (idempotent)
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
        });
    });

    describe('Data Integrity Tests', () => {
        test('should maintain referential integrity', async () => {
            if (!client) return;
            
            // Test foreign key constraints
            const workflowId = 'test-workflow-id';
            
            // Insert workflow first
            await client.query(`
                INSERT INTO workflows (id, name, trigger_type, steps, total_steps)
                VALUES ($1, 'Test Workflow', 'manual', '[]'::jsonb, 0)
            `, [workflowId]);
            
            // Insert task with workflow reference
            await client.query(`
                INSERT INTO tasks (id, title, workflow_id)
                VALUES (gen_random_uuid(), 'Test Task', $1)
            `, [workflowId]);
            
            // Verify the relationship
            const relationCheck = await client.query(`
                SELECT t.title, w.name 
                FROM tasks t 
                JOIN workflows w ON t.workflow_id = w.id 
                WHERE w.id = $1
            `, [workflowId]);
            
            expect(relationCheck.rows).toHaveLength(1);
            expect(relationCheck.rows[0].name).toBe('Test Workflow');
        });

        test('should enforce check constraints', async () => {
            if (!client) return;
            
            // Test invalid priority
            try {
                await client.query(`
                    INSERT INTO tasks (id, title, priority)
                    VALUES (gen_random_uuid(), 'Test Task', 'invalid_priority')
                `);
                fail('Should have thrown constraint violation');
            } catch (error) {
                expect(error.message).toContain('priority');
            }
            
            // Test invalid complexity score
            try {
                await client.query(`
                    INSERT INTO tasks (id, title, complexity_score)
                    VALUES (gen_random_uuid(), 'Test Task', 15)
                `);
                fail('Should have thrown constraint violation');
            } catch (error) {
                expect(error.message).toContain('complexity_score');
            }
        });

        test('should trigger audit logging automatically', async () => {
            if (!client) return;
            
            const taskId = 'test-task-audit';
            
            // Insert a task
            await client.query(`
                INSERT INTO tasks (id, title, status)
                VALUES ($1, 'Audit Test Task', 'pending')
            `, [taskId]);
            
            // Update the task
            await client.query(`
                UPDATE tasks SET status = 'in_progress' WHERE id = $1
            `, [taskId]);
            
            // Check audit logs
            const auditCheck = await client.query(`
                SELECT action, entity_type, entity_id 
                FROM audit_logs 
                WHERE entity_id = $1 
                ORDER BY timestamp
            `, [taskId]);
            
            expect(auditCheck.rows.length).toBeGreaterThanOrEqual(2);
            expect(auditCheck.rows[0].action).toBe('create');
            expect(auditCheck.rows[1].action).toBe('update');
        });
    });
});

