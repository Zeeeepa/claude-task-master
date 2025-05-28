/**
 * @fileoverview Database Integration Tests
 * @description Comprehensive test suite for database schema and Cloudflare integration
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DatabaseConnection, initializeDatabase } from '../src/ai_cicd_system/database/connection.js';
import { Deployment } from '../src/ai_cicd_system/database/models/Deployment.js';
import { ValidationResult } from '../src/ai_cicd_system/database/models/ValidationResult.js';
import { SystemLog } from '../src/ai_cicd_system/database/models/SystemLog.js';
import { MigrationRunner } from '../src/ai_cicd_system/database/migrations/runner.js';
import { validateCloudflareConfig, getDatabaseConfig } from '../src/config/database.js';

describe('Database Integration Tests', () => {
    let db;
    let testTaskId;
    let testDeploymentId;

    beforeAll(async () => {
        // Initialize test database connection
        db = await initializeDatabase({
            database: process.env.TEST_DB_NAME || 'codegen-taskmaster-test-db',
            pool: { min: 1, max: 5 }
        });

        // Run migrations
        const runner = new MigrationRunner();
        await runner.initialize();
        await runner.runPendingMigrations();
        await runner.shutdown();

        // Create test task for foreign key relationships
        const taskResult = await db.query(`
            INSERT INTO tasks (title, description, requirements, status)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['Test Task', 'Test Description', '{"test": true}', 'pending']);
        
        testTaskId = taskResult.rows[0].id;
    });

    afterAll(async () => {
        // Clean up test data
        if (testTaskId) {
            await db.query('DELETE FROM tasks WHERE id = $1', [testTaskId]);
        }
        
        // Close database connection
        if (db) {
            await db.shutdown();
        }
    });

    beforeEach(async () => {
        // Clean up test deployments and related data before each test
        await db.query('DELETE FROM validation_results WHERE deployment_id IN (SELECT id FROM deployments WHERE task_id = $1)', [testTaskId]);
        await db.query('DELETE FROM deployments WHERE task_id = $1', [testTaskId]);
        await db.query('DELETE FROM system_logs WHERE component = $1', ['test_component']);
    });

    describe('Database Connection', () => {
        test('should establish database connection', async () => {
            expect(db.isConnected).toBe(true);
        });

        test('should execute basic queries', async () => {
            const result = await db.query('SELECT NOW() as current_time');
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].current_time).toBeInstanceOf(Date);
        });

        test('should handle transactions', async () => {
            const result = await db.transaction(async (client) => {
                const insertResult = await client.query(
                    'INSERT INTO system_logs (component, level, message) VALUES ($1, $2, $3) RETURNING id',
                    ['test_transaction', 'info', 'Transaction test']
                );
                return insertResult.rows[0].id;
            });

            expect(result).toBeDefined();
            
            // Verify the record exists
            const checkResult = await db.query('SELECT * FROM system_logs WHERE id = $1', [result]);
            expect(checkResult.rows).toHaveLength(1);
        });

        test('should provide health status', () => {
            const health = db.getHealth();
            expect(health).toHaveProperty('connected', true);
            expect(health).toHaveProperty('poolStats');
            expect(health).toHaveProperty('queryStats');
        });

        test('should provide performance metrics', () => {
            const metrics = db.getMetrics();
            expect(metrics).toHaveProperty('total');
            expect(metrics).toHaveProperty('successful');
            expect(metrics).toHaveProperty('failed');
            expect(metrics).toHaveProperty('avgExecutionTime');
        });
    });

    describe('Database Schema', () => {
        test('should have all required tables', async () => {
            const requiredTables = [
                'tasks', 'task_contexts', 'workflow_states', 'audit_logs',
                'task_dependencies', 'performance_metrics', 'schema_migrations',
                'deployments', 'validation_results', 'prompt_templates',
                'deployment_scripts', 'system_logs'
            ];

            for (const table of requiredTables) {
                const result = await db.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    )
                `, [table]);
                
                expect(result.rows[0].exists).toBe(true);
            }
        });

        test('should have all required views', async () => {
            const requiredViews = [
                'active_tasks', 'task_summary', 'recent_activity',
                'active_deployments', 'deployment_summary', 'system_health',
                'task_deployment_status'
            ];

            for (const view of requiredViews) {
                const result = await db.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.views 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    )
                `, [view]);
                
                expect(result.rows[0].exists).toBe(true);
            }
        });

        test('should have all required functions', async () => {
            const requiredFunctions = [
                'update_updated_at_column', 'audit_trigger_function',
                'update_deployment_status', 'log_system_event'
            ];

            for (const func of requiredFunctions) {
                const result = await db.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.routines 
                        WHERE routine_schema = 'public' 
                        AND routine_name = $1
                    )
                `, [func]);
                
                expect(result.rows[0].exists).toBe(true);
            }
        });

        test('should have proper indexes', async () => {
            const result = await db.query(`
                SELECT indexname, tablename 
                FROM pg_indexes 
                WHERE schemaname = 'public'
                AND indexname LIKE 'idx_%'
            `);

            expect(result.rows.length).toBeGreaterThan(10);
            
            // Check for specific important indexes
            const indexNames = result.rows.map(row => row.indexname);
            expect(indexNames).toContain('idx_tasks_status');
            expect(indexNames).toContain('idx_deployments_task_id');
            expect(indexNames).toContain('idx_system_logs_component');
        });
    });

    describe('Deployment Model', () => {
        test('should create deployment', async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/123',
                branch_name: 'feature/test-branch',
                status: 'pending',
                logs: { message: 'Deployment created' }
            };

            const deployment = await Deployment.create(deploymentData);
            testDeploymentId = deployment.id;

            expect(deployment).toBeInstanceOf(Deployment);
            expect(deployment.id).toBeDefined();
            expect(deployment.task_id).toBe(testTaskId);
            expect(deployment.pr_url).toBe(deploymentData.pr_url);
            expect(deployment.branch_name).toBe(deploymentData.branch_name);
            expect(deployment.status).toBe('pending');
        });

        test('should find deployment by ID', async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/124',
                branch_name: 'feature/test-branch-2'
            };

            const created = await Deployment.create(deploymentData);
            const found = await Deployment.findById(created.id);

            expect(found).toBeInstanceOf(Deployment);
            expect(found.id).toBe(created.id);
            expect(found.pr_url).toBe(deploymentData.pr_url);
        });

        test('should update deployment status', async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/125',
                branch_name: 'feature/test-branch-3'
            };

            const deployment = await Deployment.create(deploymentData);
            await deployment.updateStatus('running');

            expect(deployment.status).toBe('running');
            expect(deployment.updated_at).toBeDefined();
        });

        test('should add logs to deployment', async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/126',
                branch_name: 'feature/test-branch-4'
            };

            const deployment = await Deployment.create(deploymentData);
            await deployment.addLog('info', 'Test log message', { test: true });

            expect(deployment.logs.entries).toHaveLength(1);
            expect(deployment.logs.entries[0].message).toBe('Test log message');
            expect(deployment.logs.entries[0].level).toBe('info');
        });

        test('should validate deployment data', () => {
            const validData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/127',
                branch_name: 'feature/test-branch-5'
            };

            const validation = Deployment.validate(validData);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);

            const invalidData = {
                pr_url: 'https://github.com/test/repo/pull/128'
                // Missing required fields
            };

            const invalidValidation = Deployment.validate(invalidData);
            expect(invalidValidation.valid).toBe(false);
            expect(invalidValidation.errors.length).toBeGreaterThan(0);
        });
    });

    describe('ValidationResult Model', () => {
        let testDeployment;

        beforeEach(async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/200',
                branch_name: 'feature/validation-test'
            };
            testDeployment = await Deployment.create(deploymentData);
        });

        test('should create validation result', async () => {
            const resultData = {
                deployment_id: testDeployment.id,
                test_type: 'unit_test',
                status: 'passed',
                output: 'All tests passed',
                duration_ms: 5000
            };

            const result = await ValidationResult.create(resultData);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.id).toBeDefined();
            expect(result.deployment_id).toBe(testDeployment.id);
            expect(result.test_type).toBe('unit_test');
            expect(result.status).toBe('passed');
            expect(result.duration_ms).toBe(5000);
        });

        test('should find validation results by deployment', async () => {
            const resultData1 = {
                deployment_id: testDeployment.id,
                test_type: 'unit_test',
                status: 'passed'
            };

            const resultData2 = {
                deployment_id: testDeployment.id,
                test_type: 'integration_test',
                status: 'failed'
            };

            await ValidationResult.create(resultData1);
            await ValidationResult.create(resultData2);

            const results = await ValidationResult.findByDeploymentId(testDeployment.id);

            expect(results).toHaveLength(2);
            expect(results[0]).toBeInstanceOf(ValidationResult);
            expect(results[1]).toBeInstanceOf(ValidationResult);
        });

        test('should get deployment statistics', async () => {
            const resultData1 = {
                deployment_id: testDeployment.id,
                test_type: 'unit_test',
                status: 'passed',
                duration_ms: 1000
            };

            const resultData2 = {
                deployment_id: testDeployment.id,
                test_type: 'unit_test',
                status: 'failed',
                duration_ms: 2000
            };

            await ValidationResult.create(resultData1);
            await ValidationResult.create(resultData2);

            const stats = await ValidationResult.getDeploymentStatistics(testDeployment.id);

            expect(stats.total).toBe(2);
            expect(stats.overall.passed).toBe(1);
            expect(stats.overall.failed).toBe(1);
            expect(stats.by_type.unit_test).toBeDefined();
        });
    });

    describe('SystemLog Model', () => {
        test('should create system log', async () => {
            const logData = {
                component: 'test_component',
                level: 'info',
                message: 'Test log message',
                metadata: { test: true }
            };

            const log = await SystemLog.create(logData);

            expect(log).toBeInstanceOf(SystemLog);
            expect(log.id).toBeDefined();
            expect(log.component).toBe('test_component');
            expect(log.level).toBe('info');
            expect(log.message).toBe('Test log message');
        });

        test('should find logs by component', async () => {
            await SystemLog.create({
                component: 'test_component_2',
                level: 'info',
                message: 'Test message 1'
            });

            await SystemLog.create({
                component: 'test_component_2',
                level: 'error',
                message: 'Test message 2'
            });

            const logs = await SystemLog.findByComponent('test_component_2');

            expect(logs).toHaveLength(2);
            expect(logs[0]).toBeInstanceOf(SystemLog);
            expect(logs[1]).toBeInstanceOf(SystemLog);
        });

        test('should get recent logs', async () => {
            await SystemLog.create({
                component: 'test_component_3',
                level: 'info',
                message: 'Recent log message'
            });

            const recentLogs = await SystemLog.getRecent({ hours: 1, limit: 10 });

            expect(recentLogs.length).toBeGreaterThan(0);
            expect(recentLogs[0]).toBeInstanceOf(SystemLog);
        });

        test('should search logs', async () => {
            await SystemLog.create({
                component: 'test_component_4',
                level: 'info',
                message: 'Searchable unique message content'
            });

            const searchResults = await SystemLog.search('unique message');

            expect(searchResults.length).toBeGreaterThan(0);
            expect(searchResults[0].message).toContain('unique message');
        });
    });

    describe('Database Functions', () => {
        test('should use update_deployment_status function', async () => {
            const deploymentData = {
                task_id: testTaskId,
                pr_url: 'https://github.com/test/repo/pull/300',
                branch_name: 'feature/function-test'
            };

            const deployment = await Deployment.create(deploymentData);

            await db.query(
                'SELECT update_deployment_status($1, $2, $3)',
                [deployment.id, 'failed', 'Test error message']
            );

            const updated = await Deployment.findById(deployment.id);
            expect(updated.status).toBe('failed');
            expect(updated.last_error).toBe('Test error message');
            expect(updated.error_count).toBe(1);
        });

        test('should use log_system_event function', async () => {
            const result = await db.query(
                'SELECT log_system_event($1, $2, $3, $4) as log_id',
                ['test_function', 'info', 'Function test message', '{"test": true}']
            );

            const logId = result.rows[0].log_id;
            expect(logId).toBeDefined();

            const log = await SystemLog.findById(logId);
            expect(log.component).toBe('test_function');
            expect(log.message).toBe('Function test message');
        });
    });

    describe('Cloudflare Configuration', () => {
        test('should validate cloudflare configuration', () => {
            const validation = validateCloudflareConfig();
            expect(validation).toHaveProperty('valid');
            expect(validation).toHaveProperty('errors');
            expect(validation).toHaveProperty('warnings');
        });

        test('should get database configuration', () => {
            const config = getDatabaseConfig();
            expect(config).toHaveProperty('host');
            expect(config).toHaveProperty('port');
            expect(config).toHaveProperty('database');
            expect(config).toHaveProperty('user');
        });
    });

    describe('Migration Runner', () => {
        test('should get migration status', async () => {
            const runner = new MigrationRunner();
            await runner.initialize();
            
            const status = await runner.getStatus();
            
            expect(status).toHaveProperty('total');
            expect(status).toHaveProperty('applied');
            expect(status).toHaveProperty('pending');
            expect(status).toHaveProperty('migrations');
            expect(Array.isArray(status.migrations)).toBe(true);
            
            await runner.shutdown();
        });

        test('should validate schema', async () => {
            const runner = new MigrationRunner();
            await runner.initialize();
            
            // Should not throw an error
            await expect(runner.validateSchema()).resolves.not.toThrow();
            
            await runner.shutdown();
        });
    });

    describe('Performance and Monitoring', () => {
        test('should track query performance', async () => {
            // Execute some queries to generate metrics
            await db.query('SELECT COUNT(*) FROM tasks');
            await db.query('SELECT COUNT(*) FROM deployments');
            await db.query('SELECT COUNT(*) FROM system_logs');

            const metrics = db.getMetrics();
            expect(metrics.total).toBeGreaterThan(0);
            expect(metrics.successful).toBeGreaterThan(0);
            expect(metrics.avgExecutionTime).toBeGreaterThanOrEqual(0);
        });

        test('should provide system health summary', async () => {
            // Create some test logs
            await SystemLog.create({
                component: 'health_test',
                level: 'info',
                message: 'Health test message'
            });

            const health = await SystemLog.getHealthSummary();
            expect(health).toHaveProperty('components');
            expect(health).toHaveProperty('overall');
        });
    });
});

describe('Error Handling', () => {
    test('should handle invalid database queries', async () => {
        const db = await initializeDatabase();
        
        await expect(
            db.query('SELECT * FROM non_existent_table')
        ).rejects.toThrow();
        
        await db.shutdown();
    });

    test('should handle transaction rollbacks', async () => {
        const db = await initializeDatabase();
        
        await expect(
            db.transaction(async (client) => {
                await client.query('INSERT INTO tasks (title) VALUES ($1)', ['Test']);
                throw new Error('Intentional error');
            })
        ).rejects.toThrow('Intentional error');
        
        await db.shutdown();
    });
});

