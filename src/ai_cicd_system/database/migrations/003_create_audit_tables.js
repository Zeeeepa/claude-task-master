/**
 * @fileoverview Migration: Create Audit Tables
 * @description Creates comprehensive audit logging tables and triggers for the CI/CD system
 * @version 2.0.0
 * @created 2025-05-28
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration configuration
 */
export const migrationConfig = {
    version: '003',
    name: 'create_audit_tables',
    description: 'Create comprehensive audit logging tables and triggers for the CI/CD system',
    dependencies: ['001', '002'],
    rollbackSupported: true,
    estimatedDuration: '60 seconds',
    breakingChange: false
};

/**
 * Execute the migration
 * @param {Object} client - Database client
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Migration result
 */
export async function up(client, logger) {
    const startTime = Date.now();
    logger.info('Starting migration: Create audit tables');
    
    try {
        // Read the audit schema SQL file
        const schemaPath = path.join(__dirname, '..', 'schema', 'audit_schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the schema creation
        await client.query('BEGIN');
        
        logger.info('Creating audit tables and related objects...');
        await client.query(schemaSql);
        
        // Verify audit_logs table creation
        const auditLogsTableCheck = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'audit_logs' 
            ORDER BY ordinal_position
        `);
        
        if (auditLogsTableCheck.rows.length === 0) {
            throw new Error('Audit logs table was not created successfully');
        }
        
        logger.info(`Audit logs table created with ${auditLogsTableCheck.rows.length} columns`);
        
        // Verify audit_summary table creation
        const auditSummaryTableCheck = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'audit_summary' 
            ORDER BY ordinal_position
        `);
        
        if (auditSummaryTableCheck.rows.length === 0) {
            throw new Error('Audit summary table was not created successfully');
        }
        
        logger.info(`Audit summary table created with ${auditSummaryTableCheck.rows.length} columns`);
        
        // Verify indexes creation
        const indexCheck = await client.query(`
            SELECT indexname, tablename, indexdef
            FROM pg_indexes 
            WHERE tablename IN ('audit_logs', 'audit_summary')
            ORDER BY tablename, indexname
        `);
        
        logger.info(`Created ${indexCheck.rows.length} indexes for audit tables`);
        
        // Verify functions creation
        const functionCheck = await client.query(`
            SELECT routine_name, routine_type
            FROM information_schema.routines 
            WHERE routine_name IN (
                'create_audit_log', 
                'audit_trigger_function', 
                'update_audit_summary',
                'cleanup_old_audit_logs'
            )
            ORDER BY routine_name
        `);
        
        logger.info(`Created ${functionCheck.rows.length} audit functions`);
        
        // Verify triggers creation
        const triggerCheck = await client.query(`
            SELECT trigger_name, event_object_table, event_manipulation, action_timing
            FROM information_schema.triggers 
            WHERE trigger_name LIKE '%audit%'
            ORDER BY event_object_table, trigger_name
        `);
        
        logger.info(`Created ${triggerCheck.rows.length} audit triggers`);
        
        // Verify views creation
        const viewCheck = await client.query(`
            SELECT table_name
            FROM information_schema.views 
            WHERE table_name LIKE 'v_%audit%' OR table_name LIKE 'v_%activity%' OR table_name LIKE 'v_%security%'
            ORDER BY table_name
        `);
        
        logger.info(`Created ${viewCheck.rows.length} audit views`);
        
        // Create audit triggers for existing tables
        logger.info('Creating audit triggers for existing tables...');
        
        // Tasks table audit trigger
        await client.query(`
            DROP TRIGGER IF EXISTS audit_tasks_trigger ON tasks;
            CREATE TRIGGER audit_tasks_trigger
                AFTER INSERT OR UPDATE OR DELETE ON tasks
                FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
        `);
        
        // Workflows table audit trigger
        await client.query(`
            DROP TRIGGER IF EXISTS audit_workflows_trigger ON workflows;
            CREATE TRIGGER audit_workflows_trigger
                AFTER INSERT OR UPDATE OR DELETE ON workflows
                FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
        `);
        
        // Workflow execution steps audit trigger
        await client.query(`
            DROP TRIGGER IF EXISTS audit_workflow_execution_steps_trigger ON workflow_execution_steps;
            CREATE TRIGGER audit_workflow_execution_steps_trigger
                AFTER INSERT OR UPDATE OR DELETE ON workflow_execution_steps
                FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
        `);
        
        // Create initial audit log entry for system initialization
        await client.query(`
            SELECT create_audit_log(
                'system',
                gen_random_uuid(),
                'create',
                NULL,
                '{"component": "audit_system", "version": "2.0.0", "migration": "003"}'::jsonb,
                'system',
                '{"migration": "003_create_audit_tables", "timestamp": "' || NOW() || '"}'::jsonb,
                'info',
                'system'
            )
        `);
        
        // Test audit functionality
        logger.info('Testing audit functionality...');
        const testResult = await client.query(`
            SELECT create_audit_log(
                'system',
                gen_random_uuid(),
                'config_change',
                '{"test": "old_value"}'::jsonb,
                '{"test": "new_value"}'::jsonb,
                'migration_test',
                '{"test": true, "migration": "003"}'::jsonb,
                'info',
                'system'
            ) as audit_id
        `);
        
        if (!testResult.rows[0].audit_id) {
            throw new Error('Audit log creation test failed');
        }
        
        logger.info('Audit functionality test passed');
        
        // Insert migration record
        await client.query(`
            INSERT INTO schema_migrations (version, description, applied_at, checksum)
            VALUES ($1, $2, NOW(), $3)
            ON CONFLICT (version) DO UPDATE SET
                description = EXCLUDED.description,
                applied_at = NOW(),
                checksum = EXCLUDED.checksum
        `, [
            migrationConfig.version,
            migrationConfig.description,
            generateChecksum(schemaSql)
        ]);
        
        await client.query('COMMIT');
        
        const duration = Date.now() - startTime;
        logger.info(`Migration completed successfully in ${duration}ms`);
        
        return {
            success: true,
            version: migrationConfig.version,
            duration,
            details: {
                auditLogsColumns: auditLogsTableCheck.rows.length,
                auditSummaryColumns: auditSummaryTableCheck.rows.length,
                indexes: indexCheck.rows.length,
                functions: functionCheck.rows.length,
                triggers: triggerCheck.rows.length,
                views: viewCheck.rows.length,
                auditTriggersCreated: 3
            }
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Migration failed:', error);
        
        return {
            success: false,
            version: migrationConfig.version,
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

/**
 * Rollback the migration
 * @param {Object} client - Database client
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Rollback result
 */
export async function down(client, logger) {
    const startTime = Date.now();
    logger.info('Starting rollback: Remove audit tables');
    
    try {
        await client.query('BEGIN');
        
        // Remove audit triggers from existing tables
        logger.info('Removing audit triggers from existing tables...');
        await client.query(`
            DROP TRIGGER IF EXISTS audit_workflow_execution_steps_trigger ON workflow_execution_steps;
            DROP TRIGGER IF EXISTS audit_workflows_trigger ON workflows;
            DROP TRIGGER IF EXISTS audit_tasks_trigger ON tasks;
        `);
        
        // Drop views first (they depend on the tables)
        logger.info('Dropping audit-related views...');
        await client.query(`
            DROP VIEW IF EXISTS v_audit_statistics CASCADE;
            DROP VIEW IF EXISTS v_error_analysis CASCADE;
            DROP VIEW IF EXISTS v_security_events CASCADE;
            DROP VIEW IF EXISTS v_user_activity_summary CASCADE;
            DROP VIEW IF EXISTS v_recent_audit_activity CASCADE;
        `);
        
        // Drop triggers
        logger.info('Dropping audit-related triggers...');
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_audit_summary ON audit_logs;
        `);
        
        // Drop functions
        logger.info('Dropping audit-related functions...');
        await client.query(`
            DROP FUNCTION IF EXISTS cleanup_old_audit_logs(INTEGER) CASCADE;
            DROP FUNCTION IF EXISTS update_audit_summary() CASCADE;
            DROP FUNCTION IF EXISTS audit_trigger_function() CASCADE;
            DROP FUNCTION IF EXISTS create_audit_log(VARCHAR, UUID, VARCHAR, JSONB, JSONB, VARCHAR, JSONB, VARCHAR, VARCHAR) CASCADE;
        `);
        
        // Backup and drop tables
        logger.info('Backing up and dropping audit tables...');
        const timestamp = Date.now();
        
        await client.query(`
            ALTER TABLE IF EXISTS audit_summary 
            RENAME TO audit_summary_backup_${timestamp};
        `);
        
        await client.query(`
            ALTER TABLE IF EXISTS audit_logs 
            RENAME TO audit_logs_backup_${timestamp};
        `);
        
        // Remove migration record
        await client.query(`
            DELETE FROM schema_migrations WHERE version = $1
        `, [migrationConfig.version]);
        
        await client.query('COMMIT');
        
        const duration = Date.now() - startTime;
        logger.info(`Rollback completed successfully in ${duration}ms`);
        
        return {
            success: true,
            version: migrationConfig.version,
            duration,
            details: {
                action: 'tables_renamed_to_backup',
                preservedData: true,
                backupTimestamp: timestamp,
                auditTriggersRemoved: 3
            }
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Rollback failed:', error);
        
        return {
            success: false,
            version: migrationConfig.version,
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

/**
 * Validate migration prerequisites
 * @param {Object} client - Database client
 * @returns {Promise<Object>} Validation result
 */
export async function validate(client) {
    try {
        // Check if required tables exist (dependencies)
        const requiredTables = ['tasks', 'workflows', 'workflow_execution_steps'];
        const tableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = ANY($1)
        `, [requiredTables]);
        
        const existingTables = tableCheck.rows.map(row => row.table_name);
        const missingTables = requiredTables.filter(table => !existingTables.includes(table));
        
        if (missingTables.length > 0) {
            return {
                valid: false,
                errors: [`Missing required tables: ${missingTables.join(', ')} - run previous migrations first`],
                warnings: []
            };
        }
        
        // Check if required extensions are available
        const extensionCheck = await client.query(`
            SELECT extname FROM pg_extension 
            WHERE extname IN ('uuid-ossp', 'pg_trgm')
        `);
        
        const availableExtensions = extensionCheck.rows.map(row => row.extname);
        const requiredExtensions = ['uuid-ossp', 'pg_trgm'];
        const missingExtensions = requiredExtensions.filter(ext => !availableExtensions.includes(ext));
        
        if (missingExtensions.length > 0) {
            return {
                valid: false,
                errors: [`Missing required extensions: ${missingExtensions.join(', ')}`],
                warnings: []
            };
        }
        
        const warnings = [];
        
        // Check for existing audit tables
        const existingAuditCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name IN ('audit_logs', 'audit_summary')
        `);
        
        if (existingAuditCheck.rows.length > 0) {
            warnings.push('audit tables already exist - migration will update structure');
        }
        
        // Check database size for audit log storage
        const dbSizeCheck = await client.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
        `);
        
        warnings.push(`Current database size: ${dbSizeCheck.rows[0].db_size} - audit logs will increase storage usage`);
        
        return {
            valid: true,
            errors: [],
            warnings
        };
        
    } catch (error) {
        return {
            valid: false,
            errors: [`Validation failed: ${error.message}`],
            warnings: []
        };
    }
}

/**
 * Generate checksum for migration content
 * @param {string} content - Content to checksum
 * @returns {string} Checksum
 */
function generateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Get migration status
 * @param {Object} client - Database client
 * @returns {Promise<Object>} Status information
 */
export async function getStatus(client) {
    try {
        const result = await client.query(`
            SELECT version, description, applied_at, checksum
            FROM schema_migrations 
            WHERE version = $1
        `, [migrationConfig.version]);
        
        if (result.rows.length === 0) {
            return {
                applied: false,
                version: migrationConfig.version,
                description: migrationConfig.description
            };
        }
        
        const migration = result.rows[0];
        
        // Check audit log count
        const auditCountResult = await client.query(`
            SELECT COUNT(*) as audit_count FROM audit_logs
        `);
        
        return {
            applied: true,
            version: migration.version,
            description: migration.description,
            appliedAt: migration.applied_at,
            checksum: migration.checksum,
            auditLogCount: parseInt(auditCountResult.rows[0].audit_count)
        };
        
    } catch (error) {
        return {
            applied: false,
            error: error.message
        };
    }
}

export default {
    migrationConfig,
    up,
    down,
    validate,
    getStatus
};

