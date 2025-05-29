/**
 * @fileoverview Migration: Create Enhanced Tasks Table
 * @description Creates the enhanced tasks table with CI/CD specific fields and optimizations
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
    version: '001',
    name: 'create_tasks_table',
    description: 'Create enhanced tasks table with CI/CD specific fields and optimizations',
    dependencies: [],
    rollbackSupported: true,
    estimatedDuration: '30 seconds',
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
    logger.info('Starting migration: Create enhanced tasks table');
    
    try {
        // Read the tasks schema SQL file
        const schemaPath = path.join(__dirname, '..', 'schema', 'tasks_schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the schema creation
        await client.query('BEGIN');
        
        logger.info('Creating enhanced tasks table and related objects...');
        await client.query(schemaSql);
        
        // Verify table creation
        const tableCheck = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'tasks' 
            ORDER BY ordinal_position
        `);
        
        if (tableCheck.rows.length === 0) {
            throw new Error('Tasks table was not created successfully');
        }
        
        logger.info(`Tasks table created with ${tableCheck.rows.length} columns`);
        
        // Verify indexes creation
        const indexCheck = await client.query(`
            SELECT indexname, indexdef
            FROM pg_indexes 
            WHERE tablename = 'tasks'
            ORDER BY indexname
        `);
        
        logger.info(`Created ${indexCheck.rows.length} indexes for tasks table`);
        
        // Verify triggers creation
        const triggerCheck = await client.query(`
            SELECT trigger_name, event_manipulation, action_timing
            FROM information_schema.triggers 
            WHERE event_object_table = 'tasks'
            ORDER BY trigger_name
        `);
        
        logger.info(`Created ${triggerCheck.rows.length} triggers for tasks table`);
        
        // Verify views creation
        const viewCheck = await client.query(`
            SELECT table_name
            FROM information_schema.views 
            WHERE table_name LIKE 'v_%tasks%'
            ORDER BY table_name
        `);
        
        logger.info(`Created ${viewCheck.rows.length} views for tasks`);
        
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
                columns: tableCheck.rows.length,
                indexes: indexCheck.rows.length,
                triggers: triggerCheck.rows.length,
                views: viewCheck.rows.length
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
    logger.info('Starting rollback: Remove enhanced tasks table');
    
    try {
        await client.query('BEGIN');
        
        // Drop views first (they depend on the table)
        logger.info('Dropping task-related views...');
        await client.query(`
            DROP VIEW IF EXISTS v_retryable_failed_tasks CASCADE;
            DROP VIEW IF EXISTS v_high_priority_tasks CASCADE;
            DROP VIEW IF EXISTS v_task_statistics CASCADE;
            DROP VIEW IF EXISTS v_active_tasks CASCADE;
            DROP VIEW IF EXISTS v_task_hierarchy CASCADE;
        `);
        
        // Drop triggers
        logger.info('Dropping task-related triggers...');
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_prevent_circular_task_dependency ON tasks;
            DROP TRIGGER IF EXISTS trigger_validate_task_status_transition ON tasks;
            DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON tasks;
        `);
        
        // Drop functions
        logger.info('Dropping task-related functions...');
        await client.query(`
            DROP FUNCTION IF EXISTS prevent_circular_task_dependency() CASCADE;
            DROP FUNCTION IF EXISTS validate_task_status_transition() CASCADE;
            DROP FUNCTION IF EXISTS update_tasks_updated_at() CASCADE;
        `);
        
        // Note: We don't drop the tasks table itself to preserve data
        // Instead, we could rename it or mark it as deprecated
        logger.info('Preserving tasks table data - renaming to tasks_backup');
        await client.query(`
            ALTER TABLE IF EXISTS tasks RENAME TO tasks_backup_${Date.now()};
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
                action: 'table_renamed_to_backup',
                preservedData: true
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
        
        // Check if schema_migrations table exists
        const migrationTableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'schema_migrations'
        `);
        
        const warnings = [];
        if (migrationTableCheck.rows.length === 0) {
            warnings.push('schema_migrations table does not exist - will be created');
        }
        
        // Check for existing tasks table
        const existingTableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'tasks'
        `);
        
        if (existingTableCheck.rows.length > 0) {
            warnings.push('tasks table already exists - migration will update structure');
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

