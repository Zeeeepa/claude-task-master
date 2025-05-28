/**
 * Initial Database Schema Migration
 * Creates all core tables for the unified AI CI/CD system
 */

export async function up(knex) {
    // Enable UUID extension
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"');

    // Users table
    await knex.schema.createTable('users', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('email', 255).unique().notNullable();
        table.string('username', 100).unique().notNullable();
        table.string('full_name', 255);
        table.text('avatar_url');
        table.string('role', 50).defaultTo('user').checkIn(['admin', 'user', 'viewer']);
        table.jsonb('permissions').defaultTo('{}');
        table.jsonb('preferences').defaultTo('{}');
        table.boolean('is_active').defaultTo(true);
        table.timestamp('last_login_at', { useTz: true });
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('email');
        table.index('username');
        table.index('role');
        table.index('is_active');
    });

    // Workflows table
    await knex.schema.createTable('workflows', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('name', 255).notNullable();
        table.text('description');
        table.string('type', 100).notNullable().checkIn(['ci_cd', 'deployment', 'testing', 'monitoring', 'custom']);
        table.string('status', 50).defaultTo('draft').checkIn(['draft', 'active', 'paused', 'completed', 'failed', 'cancelled']);
        table.integer('priority').defaultTo(0).checkBetween([0, 10]);
        
        table.jsonb('definition').notNullable().defaultTo('{}');
        table.jsonb('configuration').defaultTo('{}');
        table.jsonb('environment_variables').defaultTo('{}');
        
        table.integer('version').defaultTo(1);
        table.specificType('tags', 'text[]').defaultTo('{}');
        table.jsonb('metadata').defaultTo('{}');
        
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('parent_workflow_id').references('id').inTable('workflows').onDelete('CASCADE');
        
        table.timestamp('scheduled_at', { useTz: true });
        table.timestamp('started_at', { useTz: true });
        table.timestamp('completed_at', { useTz: true });
        table.integer('timeout_seconds').defaultTo(3600);
        
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('status');
        table.index('type');
        table.index('created_by');
        table.index('parent_workflow_id');
        table.index('created_at');
        table.index('priority');
        table.index(['status', 'created_at']);
    });

    // Tasks table
    await knex.schema.createTable('tasks', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
        table.string('name', 255).notNullable();
        table.text('description');
        table.string('type', 100).notNullable().checkIn(['code_generation', 'testing', 'deployment', 'validation', 'monitoring', 'custom']);
        table.string('status', 50).defaultTo('pending').checkIn(['pending', 'running', 'completed', 'failed', 'cancelled', 'skipped']);
        table.integer('priority').defaultTo(0).checkBetween([0, 10]);
        
        table.text('command');
        table.jsonb('parameters').defaultTo('{}');
        table.jsonb('environment').defaultTo('{}');
        table.text('working_directory');
        
        table.specificType('depends_on', 'uuid[]').defaultTo('{}');
        table.integer('execution_order').defaultTo(0);
        table.integer('retry_count').defaultTo(0);
        table.integer('max_retries').defaultTo(3);
        
        table.jsonb('result');
        table.text('output');
        table.text('error_message');
        table.integer('exit_code');
        
        table.integer('estimated_duration_seconds');
        table.timestamp('started_at', { useTz: true });
        table.timestamp('completed_at', { useTz: true });
        table.integer('timeout_seconds').defaultTo(1800);
        
        table.specificType('tags', 'text[]').defaultTo('{}');
        table.jsonb('metadata').defaultTo('{}');
        
        table.uuid('assigned_to').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('workflow_id');
        table.index('status');
        table.index('type');
        table.index('assigned_to');
        table.index('created_by');
        table.index('execution_order');
        table.index('created_at');
        table.index('priority');
        table.index(['workflow_id', 'status']);
    });

    // Components table
    await knex.schema.createTable('components', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('name', 255).unique().notNullable();
        table.string('type', 100).notNullable().checkIn(['orchestrator', 'database', 'monitoring', 'codegen_sdk', 'claude_code', 'agent_api', 'linear', 'wsl2', 'nlp', 'custom']);
        table.string('status', 50).defaultTo('inactive').checkIn(['active', 'inactive', 'maintenance', 'error', 'unknown']);
        table.string('version', 50);
        
        table.jsonb('configuration').defaultTo('{}');
        table.jsonb('endpoints').defaultTo('{}');
        table.text('health_check_url');
        
        table.timestamp('last_health_check', { useTz: true });
        table.string('health_status', 50).defaultTo('unknown').checkIn(['healthy', 'unhealthy', 'degraded', 'unknown']);
        table.jsonb('performance_metrics').defaultTo('{}');
        
        table.specificType('dependencies', 'text[]').defaultTo('{}');
        table.specificType('dependent_components', 'text[]').defaultTo('{}');
        
        table.text('description');
        table.text('documentation_url');
        table.text('repository_url');
        table.specificType('tags', 'text[]').defaultTo('{}');
        table.jsonb('metadata').defaultTo('{}');
        
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('name');
        table.index('type');
        table.index('status');
        table.index('health_status');
    });

    // Logs table
    await knex.schema.createTable('logs', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('level', 20).notNullable().checkIn(['debug', 'info', 'warn', 'error', 'fatal']);
        table.text('message').notNullable();
        
        table.string('component_name', 255);
        table.uuid('workflow_id').references('id').inTable('workflows').onDelete('CASCADE');
        table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
        table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
        
        table.jsonb('data').defaultTo('{}');
        table.text('stack_trace');
        table.string('request_id', 255);
        table.string('session_id', 255);
        
        table.string('source_file', 500);
        table.integer('source_line');
        table.string('source_function', 255);
        
        table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('indexed_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('level');
        table.index('component_name');
        table.index('workflow_id');
        table.index('task_id');
        table.index('user_id');
        table.index('timestamp');
        table.index('request_id');
        table.index(['component_name', 'level', 'timestamp']);
    });

    // Configurations table
    await knex.schema.createTable('configurations', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('key', 255).unique().notNullable();
        table.jsonb('value').notNullable();
        table.string('type', 50).defaultTo('system').checkIn(['system', 'user', 'component', 'workflow', 'environment']);
        
        table.text('description');
        table.boolean('is_sensitive').defaultTo(false);
        table.boolean('is_readonly').defaultTo(false);
        table.jsonb('validation_schema');
        
        table.string('scope', 100).defaultTo('global');
        table.string('component_name', 255);
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        
        table.integer('version').defaultTo(1);
        table.jsonb('previous_value');
        
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Indexes
        table.index('key');
        table.index('type');
        table.index('scope');
        table.index('component_name');
        table.index('user_id');
    });

    // Workflow executions table
    await knex.schema.createTable('workflow_executions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
        table.integer('execution_number').notNullable();
        table.string('status', 50).defaultTo('running').checkIn(['running', 'completed', 'failed', 'cancelled']);
        
        table.string('triggered_by', 100).checkIn(['manual', 'scheduled', 'webhook', 'api', 'dependency']);
        table.jsonb('trigger_data').defaultTo('{}');
        table.jsonb('environment').defaultTo('{}');
        
        table.jsonb('result');
        table.text('error_message');
        
        table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('completed_at', { useTz: true });
        table.integer('duration_seconds');
        
        table.uuid('triggered_by_user').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('parent_execution_id').references('id').inTable('workflow_executions').onDelete('CASCADE');
        
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Unique constraint
        table.unique(['workflow_id', 'execution_number']);

        // Indexes
        table.index('workflow_id');
        table.index('status');
        table.index('triggered_by');
        table.index('started_at');
        table.index('parent_execution_id');
    });

    // Task executions table
    await knex.schema.createTable('task_executions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
        table.uuid('workflow_execution_id').notNullable().references('id').inTable('workflow_executions').onDelete('CASCADE');
        table.integer('execution_number').notNullable();
        table.string('status', 50).defaultTo('pending').checkIn(['pending', 'running', 'completed', 'failed', 'cancelled', 'skipped']);
        
        table.text('command_executed');
        table.jsonb('parameters_used').defaultTo('{}');
        table.jsonb('environment_used').defaultTo('{}');
        
        table.jsonb('result');
        table.text('output');
        table.text('error_message');
        table.integer('exit_code');
        
        table.timestamp('started_at', { useTz: true });
        table.timestamp('completed_at', { useTz: true });
        table.integer('duration_seconds');
        
        table.integer('retry_attempt').defaultTo(0);
        table.boolean('is_retry').defaultTo(false);
        
        table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

        // Unique constraint
        table.unique(['task_id', 'workflow_execution_id', 'execution_number']);

        // Indexes
        table.index('task_id');
        table.index('workflow_execution_id');
        table.index('status');
        table.index('started_at');
    });

    // System metrics table
    await knex.schema.createTable('system_metrics', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('metric_name', 255).notNullable();
        table.string('metric_type', 50).notNullable().checkIn(['counter', 'gauge', 'histogram', 'summary']);
        table.decimal('value').notNullable();
        table.string('unit', 50);
        
        table.string('component_name', 255);
        table.uuid('workflow_id').references('id').inTable('workflows').onDelete('CASCADE');
        table.uuid('task_id').references('id').inTable('tasks').onDelete('CASCADE');
        
        table.jsonb('labels').defaultTo('{}');
        
        table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now());
        table.integer('retention_days').defaultTo(30);

        // Indexes
        table.index('metric_name');
        table.index('metric_type');
        table.index('component_name');
        table.index('workflow_id');
        table.index('task_id');
        table.index('timestamp');
        table.index(['metric_name', 'timestamp']);
    });

    console.log('Initial schema migration completed successfully');
}

export async function down(knex) {
    // Drop tables in reverse order to handle foreign key constraints
    await knex.schema.dropTableIfExists('system_metrics');
    await knex.schema.dropTableIfExists('task_executions');
    await knex.schema.dropTableIfExists('workflow_executions');
    await knex.schema.dropTableIfExists('configurations');
    await knex.schema.dropTableIfExists('logs');
    await knex.schema.dropTableIfExists('components');
    await knex.schema.dropTableIfExists('tasks');
    await knex.schema.dropTableIfExists('workflows');
    await knex.schema.dropTableIfExists('users');

    // Drop extensions
    await knex.raw('DROP EXTENSION IF EXISTS "pg_stat_statements"');
    await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');

    console.log('Initial schema migration rolled back successfully');
}

