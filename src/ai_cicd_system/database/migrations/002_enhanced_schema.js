/**
 * @fileoverview Enhanced Schema Migration
 * @description Migration to apply enhanced schema with new tables and improved structure
 * @version 2.0.0
 * @created 2025-05-28
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Schema Migration
 * Applies the new enhanced schema with all improvements
 */
export class EnhancedSchemaMigration {
    constructor(connection) {
        this.connection = connection;
        this.migrationId = '002_enhanced_schema';
        this.description = 'Enhanced schema with new tables and improved structure';
    }

    /**
     * Apply the migration
     * @returns {Promise<void>}
     */
    async up() {
        console.log('🔄 Applying enhanced schema migration...');
        
        try {
            await this.connection.transaction(async (client) => {
                // Apply core tables schema
                await this._applyCoreTablesSchema(client);
                
                // Apply indexes
                await this._applyIndexes(client);
                
                // Apply constraints
                await this._applyConstraints(client);
                
                // Apply functions and triggers
                await this._applyFunctions(client);
                
                // Migrate existing data
                await this._migrateExistingData(client);
                
                // Record migration
                await client.query(
                    `INSERT INTO schema_migrations (version, description, migration_type, execution_time_ms, rollback_available) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [this.migrationId, this.description, 'schema', Date.now(), true]
                );
            });
            
            console.log('✅ Enhanced schema migration applied successfully');
            
        } catch (error) {
            console.error('❌ Enhanced schema migration failed:', error.message);
            throw error;
        }
    }

    /**
     * Rollback the migration
     * @returns {Promise<void>}
     */
    async down() {
        console.log('🔄 Rolling back enhanced schema migration...');
        
        try {
            await this.connection.transaction(async (client) => {
                // Drop new tables in reverse order
                await this._dropNewTables(client);
                
                // Revert existing table modifications
                await this._revertTableModifications(client);
                
                // Drop new functions and triggers
                await this._dropNewFunctions(client);
                
                // Remove migration record
                await client.query(
                    `DELETE FROM schema_migrations WHERE version = $1`,
                    [this.migrationId]
                );
            });
            
            console.log('✅ Enhanced schema migration rolled back successfully');
            
        } catch (error) {
            console.error('❌ Enhanced schema migration rollback failed:', error.message);
            throw error;
        }
    }

    /**
     * Apply core tables schema
     * @private
     */
    async _applyCoreTablesSchema(client) {
        console.log('📋 Applying core tables schema...');
        
        // Read and execute core tables schema
        const schemaPath = path.join(__dirname, '../schema/core_tables.sql');
        const schemaSQL = await fs.readFile(schemaPath, 'utf8');
        
        // Split into individual statements and execute
        const statements = this._splitSQLStatements(schemaSQL);
        
        for (const statement of statements) {
            if (statement.trim()) {
                await client.query(statement);
            }
        }
        
        console.log('✅ Core tables schema applied');
    }

    /**
     * Apply indexes
     * @private
     */
    async _applyIndexes(client) {
        console.log('📊 Applying performance indexes...');
        
        const indexesPath = path.join(__dirname, '../schema/indexes.sql');
        const indexesSQL = await fs.readFile(indexesPath, 'utf8');
        
        const statements = this._splitSQLStatements(indexesSQL);
        
        for (const statement of statements) {
            if (statement.trim() && statement.includes('CREATE INDEX')) {
                try {
                    await client.query(statement);
                } catch (error) {
                    // Index might already exist, log warning but continue
                    if (error.message.includes('already exists')) {
                        console.warn(`⚠️ Index already exists: ${error.message}`);
                    } else {
                        throw error;
                    }
                }
            }
        }
        
        console.log('✅ Performance indexes applied');
    }

    /**
     * Apply constraints
     * @private
     */
    async _applyConstraints(client) {
        console.log('🔒 Applying data integrity constraints...');
        
        const constraintsPath = path.join(__dirname, '../schema/constraints.sql');
        const constraintsSQL = await fs.readFile(constraintsPath, 'utf8');
        
        const statements = this._splitSQLStatements(constraintsSQL);
        
        for (const statement of statements) {
            if (statement.trim() && (statement.includes('ALTER TABLE') || statement.includes('CREATE DOMAIN'))) {
                try {
                    await client.query(statement);
                } catch (error) {
                    // Constraint might already exist, log warning but continue
                    if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
                        console.warn(`⚠️ Constraint already exists: ${error.message}`);
                    } else {
                        throw error;
                    }
                }
            }
        }
        
        console.log('✅ Data integrity constraints applied');
    }

    /**
     * Apply functions and triggers
     * @private
     */
    async _applyFunctions(client) {
        console.log('⚙️ Applying stored functions and triggers...');
        
        const functionsPath = path.join(__dirname, '../schema/functions.sql');
        const functionsSQL = await fs.readFile(functionsPath, 'utf8');
        
        const statements = this._splitSQLStatements(functionsSQL);
        
        for (const statement of statements) {
            if (statement.trim()) {
                await client.query(statement);
            }
        }
        
        console.log('✅ Stored functions and triggers applied');
    }

    /**
     * Migrate existing data to new structure
     * @private
     */
    async _migrateExistingData(client) {
        console.log('🔄 Migrating existing data...');
        
        // Check if we need to migrate data from old structure
        const tablesExist = await this._checkTablesExist(client);
        
        if (tablesExist.tasks) {
            // Add new columns to existing tasks table if they don't exist
            await this._addNewColumnsToTasks(client);
        }
        
        if (tablesExist.workflows) {
            // Add new columns to existing workflows table if they don't exist
            await this._addNewColumnsToWorkflows(client);
        }
        
        // Create new tables if they don't exist
        if (!tablesExist.external_integrations) {
            await this._createExternalIntegrationsTable(client);
        }
        
        if (!tablesExist.api_access_logs) {
            await this._createAPIAccessLogsTable(client);
        }
        
        console.log('✅ Existing data migrated');
    }

    /**
     * Check which tables exist
     * @private
     */
    async _checkTablesExist(client) {
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        
        const existingTables = result.rows.map(row => row.table_name);
        
        return {
            tasks: existingTables.includes('tasks'),
            workflows: existingTables.includes('workflows'),
            system_metrics: existingTables.includes('system_metrics'),
            task_contexts: existingTables.includes('task_contexts'),
            audit_logs: existingTables.includes('audit_logs'),
            task_dependencies: existingTables.includes('task_dependencies'),
            external_integrations: existingTables.includes('external_integrations'),
            api_access_logs: existingTables.includes('api_access_logs')
        };
    }

    /**
     * Add new columns to tasks table
     * @private
     */
    async _addNewColumnsToTasks(client) {
        const newColumns = [
            { name: 'linear_issue_id', type: 'VARCHAR(255)' },
            { name: 'github_issue_number', type: 'INTEGER' },
            { name: 'codegen_session_id', type: 'VARCHAR(255)' }
        ];
        
        for (const column of newColumns) {
            try {
                await client.query(`
                    ALTER TABLE tasks 
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
                console.log(`✅ Added column ${column.name} to tasks table`);
            } catch (error) {
                console.warn(`⚠️ Failed to add column ${column.name}:`, error.message);
            }
        }
    }

    /**
     * Add new columns to workflows table
     * @private
     */
    async _addNewColumnsToWorkflows(client) {
        const newColumns = [
            { name: 'workflow_type', type: 'VARCHAR(50) DEFAULT \'standard\'' },
            { name: 'total_steps', type: 'INTEGER DEFAULT 0' },
            { name: 'retry_count', type: 'INTEGER DEFAULT 0' },
            { name: 'max_retries', type: 'INTEGER DEFAULT 3' },
            { name: 'timeout_minutes', type: 'INTEGER DEFAULT 60' },
            { name: 'codegen_pr_url', type: 'VARCHAR(500)' },
            { name: 'claude_session_id', type: 'VARCHAR(255)' },
            { name: 'validation_results', type: 'JSONB DEFAULT \'{}\'::jsonb' }
        ];
        
        for (const column of newColumns) {
            try {
                await client.query(`
                    ALTER TABLE workflows 
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
                console.log(`✅ Added column ${column.name} to workflows table`);
            } catch (error) {
                console.warn(`⚠️ Failed to add column ${column.name}:`, error.message);
            }
        }
    }

    /**
     * Create external integrations table
     * @private
     */
    async _createExternalIntegrationsTable(client) {
        await client.query(`
            CREATE TABLE IF NOT EXISTS external_integrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                integration_type VARCHAR(50) NOT NULL,
                integration_name VARCHAR(100) NOT NULL,
                configuration JSONB NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_used_at TIMESTAMP WITH TIME ZONE,
                
                health_check_url VARCHAR(500),
                last_health_check TIMESTAMP WITH TIME ZONE,
                health_status VARCHAR(20) DEFAULT 'unknown',
                
                rate_limit_per_minute INTEGER DEFAULT 60,
                current_usage INTEGER DEFAULT 0,
                usage_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 minute',
                
                CONSTRAINT external_integrations_type_check CHECK (integration_type IN ('codegen', 'github', 'linear', 'claude', 'webhook', 'slack', 'email')),
                CONSTRAINT external_integrations_status_check CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
                CONSTRAINT external_integrations_health_check CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'timeout')),
                CONSTRAINT uk_external_integrations_type_name UNIQUE (integration_type, integration_name)
            )
        `);
        
        console.log('✅ Created external_integrations table');
    }

    /**
     * Create API access logs table
     * @private
     */
    async _createAPIAccessLogsTable(client) {
        await client.query(`
            CREATE TABLE IF NOT EXISTS api_access_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                integration_id UUID REFERENCES external_integrations(id) ON DELETE SET NULL,
                endpoint VARCHAR(255) NOT NULL,
                method VARCHAR(10) NOT NULL,
                request_headers JSONB,
                request_body JSONB,
                response_status INTEGER,
                response_headers JSONB,
                response_body JSONB,
                response_time_ms INTEGER,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                correlation_id VARCHAR(255),
                user_id VARCHAR(255),
                task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
                
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                
                CONSTRAINT api_access_logs_method_check CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS')),
                CONSTRAINT api_access_logs_status_check CHECK (response_status >= 100 AND response_status < 600)
            )
        `);
        
        console.log('✅ Created api_access_logs table');
    }

    /**
     * Drop new tables (for rollback)
     * @private
     */
    async _dropNewTables(client) {
        const tablesToDrop = [
            'api_access_logs',
            'external_integrations'
        ];
        
        for (const table of tablesToDrop) {
            try {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
                console.log(`✅ Dropped table ${table}`);
            } catch (error) {
                console.warn(`⚠️ Failed to drop table ${table}:`, error.message);
            }
        }
    }

    /**
     * Revert table modifications (for rollback)
     * @private
     */
    async _revertTableModifications(client) {
        // Remove new columns from tasks table
        const tasksColumnsToRemove = [
            'linear_issue_id',
            'github_issue_number',
            'codegen_session_id'
        ];
        
        for (const column of tasksColumnsToRemove) {
            try {
                await client.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS ${column}`);
                console.log(`✅ Removed column ${column} from tasks table`);
            } catch (error) {
                console.warn(`⚠️ Failed to remove column ${column}:`, error.message);
            }
        }
        
        // Remove new columns from workflows table
        const workflowsColumnsToRemove = [
            'workflow_type',
            'total_steps',
            'retry_count',
            'max_retries',
            'timeout_minutes',
            'codegen_pr_url',
            'claude_session_id',
            'validation_results'
        ];
        
        for (const column of workflowsColumnsToRemove) {
            try {
                await client.query(`ALTER TABLE workflows DROP COLUMN IF EXISTS ${column}`);
                console.log(`✅ Removed column ${column} from workflows table`);
            } catch (error) {
                console.warn(`⚠️ Failed to remove column ${column}:`, error.message);
            }
        }
    }

    /**
     * Drop new functions (for rollback)
     * @private
     */
    async _dropNewFunctions(client) {
        const functionsToRemove = [
            'create_task',
            'update_task_status',
            'get_task_hierarchy',
            'calculate_task_completion',
            'create_workflow',
            'update_workflow_step',
            'record_metric',
            'get_system_health',
            'cleanup_old_data',
            'log_api_call',
            'check_rate_limit',
            'get_task_statistics',
            'get_workflow_performance',
            'validate_task_hierarchy',
            'validate_task_dependencies',
            'validate_rate_limits'
        ];
        
        for (const func of functionsToRemove) {
            try {
                await client.query(`DROP FUNCTION IF EXISTS ${func} CASCADE`);
                console.log(`✅ Dropped function ${func}`);
            } catch (error) {
                console.warn(`⚠️ Failed to drop function ${func}:`, error.message);
            }
        }
    }

    /**
     * Split SQL statements
     * @private
     */
    _splitSQLStatements(sql) {
        // Simple SQL statement splitter - in production, use a proper SQL parser
        return sql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
            .map(stmt => stmt + ';');
    }

    /**
     * Validate migration
     * @returns {Promise<Object>} Validation result
     */
    async validate() {
        try {
            console.log('🔍 Validating enhanced schema migration...');
            
            const errors = [];
            const warnings = [];
            
            // Check if all required tables exist
            const tablesExist = await this._checkTablesExist(this.connection);
            const requiredTables = [
                'tasks', 'workflows', 'system_metrics', 'task_contexts',
                'audit_logs', 'task_dependencies', 'external_integrations', 'api_access_logs'
            ];
            
            for (const table of requiredTables) {
                if (!tablesExist[table]) {
                    errors.push(`Required table '${table}' does not exist`);
                }
            }
            
            // Check if migration is recorded
            const migrationResult = await this.connection.query(
                'SELECT * FROM schema_migrations WHERE version = $1',
                [this.migrationId]
            );
            
            if (migrationResult.rows.length === 0) {
                warnings.push('Migration not recorded in schema_migrations table');
            }
            
            console.log('✅ Enhanced schema migration validation completed');
            
            return {
                valid: errors.length === 0,
                errors,
                warnings,
                migration_id: this.migrationId,
                tables_checked: requiredTables.length,
                validation_timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Enhanced schema migration validation failed:', error.message);
            throw error;
        }
    }
}

export default EnhancedSchemaMigration;

