/**
 * @fileoverview Migration: Create Workflows Table
 * @description Creates the workflows table and workflow execution steps table for CI/CD orchestration
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
    version: '002',
    name: 'create_workflows_table',
    description: 'Create workflows table and workflow execution steps table for CI/CD orchestration',
    dependencies: ['001'],
    rollbackSupported: true,
    estimatedDuration: '45 seconds',
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
    logger.info('Starting migration: Create workflows table');
    
    try {
        // Read the workflows schema SQL file
        const schemaPath = path.join(__dirname, '..', 'schema', 'workflows_schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the schema creation
        await client.query('BEGIN');
        
        logger.info('Creating workflows table and related objects...');
        await client.query(schemaSql);
        
        // Verify workflows table creation
        const workflowsTableCheck = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'workflows' 
            ORDER BY ordinal_position
        `);
        
        if (workflowsTableCheck.rows.length === 0) {
            throw new Error('Workflows table was not created successfully');
        }
        
        logger.info(`Workflows table created with ${workflowsTableCheck.rows.length} columns`);
        
        // Verify workflow execution steps table creation
        const stepsTableCheck = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'workflow_execution_steps' 
            ORDER BY ordinal_position
        `);
        
        if (stepsTableCheck.rows.length === 0) {
            throw new Error('Workflow execution steps table was not created successfully');
        }
        
        logger.info(`Workflow execution steps table created with ${stepsTableCheck.rows.length} columns`);
        
        // Verify indexes creation
        const indexCheck = await client.query(`
            SELECT indexname, tablename, indexdef
            FROM pg_indexes 
            WHERE tablename IN ('workflows', 'workflow_execution_steps')
            ORDER BY tablename, indexname
        `);
        
        logger.info(`Created ${indexCheck.rows.length} indexes for workflow tables`);
        
        // Verify triggers creation
        const triggerCheck = await client.query(`
            SELECT trigger_name, event_object_table, event_manipulation, action_timing
            FROM information_schema.triggers 
            WHERE event_object_table IN ('workflows', 'workflow_execution_steps')
            ORDER BY event_object_table, trigger_name
        `);
        
        logger.info(`Created ${triggerCheck.rows.length} triggers for workflow tables`);
        
        // Verify views creation
        const viewCheck = await client.query(`
            SELECT table_name
            FROM information_schema.views 
            WHERE table_name LIKE 'v_%workflow%'
            ORDER BY table_name
        `);
        
        logger.info(`Created ${viewCheck.rows.length} views for workflows`);
        
        // Add foreign key constraint from tasks to workflows
        logger.info('Adding foreign key constraint from tasks to workflows...');
        await client.query(`
            ALTER TABLE tasks 
            ADD CONSTRAINT fk_tasks_workflow_id 
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
        `);
        
        // Create sample workflow templates
        logger.info('Creating sample workflow templates...');
        await client.query(`
            INSERT INTO workflows (name, description, trigger_type, steps, total_steps, metadata) VALUES
            ('Basic CI/CD Pipeline', 'Standard continuous integration and deployment workflow', 'git_push', 
             '[
                {"step": 1, "name": "Code Analysis", "type": "validation", "config": {"timeout": 300}},
                {"step": 2, "name": "Unit Tests", "type": "testing", "config": {"timeout": 600}},
                {"step": 3, "name": "Build", "type": "task_creation", "config": {"timeout": 900}},
                {"step": 4, "name": "Deploy", "type": "deployment", "config": {"timeout": 1200}}
             ]'::jsonb, 4, 
             '{"template": true, "category": "ci_cd", "complexity": "basic"}'::jsonb),
            ('PR Review Workflow', 'Automated pull request review and validation', 'pr_created',
             '[
                {"step": 1, "name": "Code Review", "type": "validation", "config": {"timeout": 600}},
                {"step": 2, "name": "Automated Tests", "type": "testing", "config": {"timeout": 900}},
                {"step": 3, "name": "Security Scan", "type": "validation", "config": {"timeout": 300}},
                {"step": 4, "name": "Approval", "type": "approval", "config": {"timeout": 86400}}
             ]'::jsonb, 4,
             '{"template": true, "category": "review", "complexity": "intermediate"}'::jsonb),
            ('Hotfix Deployment', 'Emergency hotfix deployment workflow', 'manual',
             '[
                {"step": 1, "name": "Emergency Validation", "type": "validation", "config": {"timeout": 180}},
                {"step": 2, "name": "Quick Deploy", "type": "deployment", "config": {"timeout": 300}}
             ]'::jsonb, 2,
             '{"template": true, "category": "hotfix", "complexity": "simple", "priority": "critical"}'::jsonb)
            ON CONFLICT DO NOTHING
        `);
        
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
                workflowsColumns: workflowsTableCheck.rows.length,
                stepsColumns: stepsTableCheck.rows.length,
                indexes: indexCheck.rows.length,
                triggers: triggerCheck.rows.length,
                views: viewCheck.rows.length,
                sampleWorkflows: 3
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
    logger.info('Starting rollback: Remove workflows table');
    
    try {
        await client.query('BEGIN');
        
        // Remove foreign key constraint from tasks table
        logger.info('Removing foreign key constraint from tasks table...');
        await client.query(`
            ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_workflow_id;
        `);
        
        // Drop views first (they depend on the tables)
        logger.info('Dropping workflow-related views...');
        await client.query(`
            DROP VIEW IF EXISTS v_long_running_workflows CASCADE;
            DROP VIEW IF EXISTS v_workflow_execution_timeline CASCADE;
            DROP VIEW IF EXISTS v_retryable_failed_workflows CASCADE;
            DROP VIEW IF EXISTS v_workflow_statistics CASCADE;
            DROP VIEW IF EXISTS v_active_workflows CASCADE;
        `);
        
        // Drop triggers
        logger.info('Dropping workflow-related triggers...');
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_calculate_step_duration ON workflow_execution_steps;
            DROP TRIGGER IF EXISTS trigger_update_workflow_progress ON workflow_execution_steps;
            DROP TRIGGER IF EXISTS trigger_workflow_execution_steps_updated_at ON workflow_execution_steps;
            DROP TRIGGER IF EXISTS trigger_workflows_updated_at ON workflows;
        `);
        
        // Drop functions
        logger.info('Dropping workflow-related functions...');
        await client.query(`
            DROP FUNCTION IF EXISTS calculate_step_duration() CASCADE;
            DROP FUNCTION IF EXISTS update_workflow_progress() CASCADE;
            DROP FUNCTION IF EXISTS update_workflow_execution_steps_updated_at() CASCADE;
            DROP FUNCTION IF EXISTS update_workflows_updated_at() CASCADE;
        `);
        
        // Backup and drop tables
        logger.info('Backing up and dropping workflow tables...');
        const timestamp = Date.now();
        
        await client.query(`
            ALTER TABLE IF EXISTS workflow_execution_steps 
            RENAME TO workflow_execution_steps_backup_${timestamp};
        `);
        
        await client.query(`
            ALTER TABLE IF EXISTS workflows 
            RENAME TO workflows_backup_${timestamp};
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
                backupTimestamp: timestamp
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
        // Check if tasks table exists (dependency)
        const tasksTableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'tasks'
        `);
        
        if (tasksTableCheck.rows.length === 0) {
            return {
                valid: false,
                errors: ['Tasks table does not exist - run migration 001 first'],
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
        
        // Check for existing workflows table
        const existingWorkflowsCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'workflows'
        `);
        
        if (existingWorkflowsCheck.rows.length > 0) {
            warnings.push('workflows table already exists - migration will update structure');
        }
        
        // Check for existing workflow_execution_steps table
        const existingStepsCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'workflow_execution_steps'
        `);
        
        if (existingStepsCheck.rows.length > 0) {
            warnings.push('workflow_execution_steps table already exists - migration will update structure');
        }
        
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
        return {
            applied: true,
            version: migration.version,
            description: migration.description,
            appliedAt: migration.applied_at,
            checksum: migration.checksum
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

