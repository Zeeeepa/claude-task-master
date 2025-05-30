/**
 * Migration: Initial Schema
 * Created: 2025-05-30T13:54:00.000Z
 * Description: Create initial database schema for Claude Task Master
 */

/**
 * Apply migration - Create initial schema
 * @param {import('pg').PoolClient} client - Database client
 */
export async function up(client) {
  // Enable required extensions
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "btree_gin";`);

  // Create custom types
  await client.query(`
    CREATE TYPE task_status AS ENUM (
      'backlog',
      'todo', 
      'in-progress',
      'done',
      'deferred',
      'cancelled'
    );
  `);

  await client.query(`
    CREATE TYPE dependency_type AS ENUM (
      'blocks',
      'depends_on',
      'related',
      'subtask'
    );
  `);

  await client.query(`
    CREATE TYPE execution_status AS ENUM (
      'pending',
      'running',
      'completed',
      'failed',
      'timeout',
      'cancelled'
    );
  `);

  await client.query(`
    CREATE TYPE template_type AS ENUM (
      'task',
      'project',
      'workflow',
      'test',
      'deployment'
    );
  `);

  // Create projects table first (referenced by tasks)
  await client.query(`
    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      repository_url VARCHAR(500),
      context JSONB,
      architecture JSONB,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      
      CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'archived', 'completed'))
    );
  `);

  // Create tasks table
  await client.query(`
    CREATE TABLE tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      requirements JSONB,
      dependencies JSONB,
      acceptance_criteria JSONB,
      complexity_score INTEGER DEFAULT 0,
      status task_status DEFAULT 'backlog',
      priority VARCHAR(50) DEFAULT 'medium',
      parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(255),
      assigned_to VARCHAR(255),
      details TEXT,
      test_strategy TEXT,
      previous_status task_status,
      legacy_id INTEGER UNIQUE,
      
      CONSTRAINT valid_complexity_score CHECK (complexity_score >= 0 AND complexity_score <= 100),
      CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
    );
  `);

  // Create subtasks relationship table
  await client.query(`
    CREATE TABLE subtasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      
      CONSTRAINT no_self_reference CHECK (parent_task_id != child_task_id),
      CONSTRAINT unique_parent_child UNIQUE (parent_task_id, child_task_id)
    );
  `);

  // Create task dependencies table
  await client.query(`
    CREATE TABLE task_dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      dependency_type dependency_type DEFAULT 'blocks',
      created_at TIMESTAMP DEFAULT NOW(),
      
      CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
      CONSTRAINT unique_task_dependency UNIQUE (task_id, depends_on_task_id)
    );
  `);

  // Create templates table
  await client.query(`
    CREATE TABLE templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type template_type NOT NULL,
      content JSONB NOT NULL,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(255),
      
      CONSTRAINT unique_template_name_type UNIQUE (name, type),
      CONSTRAINT positive_usage_count CHECK (usage_count >= 0)
    );
  `);

  // Create execution history table
  await client.query(`
    CREATE TABLE execution_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      attempt_number INTEGER DEFAULT 1,
      status execution_status NOT NULL,
      error_logs JSONB,
      success_patterns JSONB,
      execution_time INTERVAL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      
      CONSTRAINT positive_attempt_number CHECK (attempt_number > 0),
      CONSTRAINT valid_execution_time CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL) OR
        (status != 'completed')
      )
    );
  `);

  // Create learning data table
  await client.query(`
    CREATE TABLE learning_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern_type VARCHAR(100) NOT NULL,
      pattern_data JSONB NOT NULL,
      success_rate DECIMAL(5,2),
      usage_frequency INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      
      CONSTRAINT valid_success_rate CHECK (success_rate >= 0 AND success_rate <= 100),
      CONSTRAINT positive_usage_frequency CHECK (usage_frequency >= 0)
    );
  `);

  // Create system config table
  await client.query(`
    CREATE TABLE system_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(100) NOT NULL UNIQUE,
      value JSONB NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Created all tables');
}

/**
 * Rollback migration - Drop all tables and types
 * @param {import('pg').PoolClient} client - Database client
 */
export async function down(client) {
  // Drop tables in reverse order (respecting foreign key constraints)
  await client.query('DROP TABLE IF EXISTS system_config CASCADE;');
  await client.query('DROP TABLE IF EXISTS learning_data CASCADE;');
  await client.query('DROP TABLE IF EXISTS execution_history CASCADE;');
  await client.query('DROP TABLE IF EXISTS templates CASCADE;');
  await client.query('DROP TABLE IF EXISTS task_dependencies CASCADE;');
  await client.query('DROP TABLE IF EXISTS subtasks CASCADE;');
  await client.query('DROP TABLE IF EXISTS tasks CASCADE;');
  await client.query('DROP TABLE IF EXISTS projects CASCADE;');

  // Drop custom types
  await client.query('DROP TYPE IF EXISTS template_type CASCADE;');
  await client.query('DROP TYPE IF EXISTS execution_status CASCADE;');
  await client.query('DROP TYPE IF EXISTS dependency_type CASCADE;');
  await client.query('DROP TYPE IF EXISTS task_status CASCADE;');

  console.log('✅ Dropped all tables and types');
}

