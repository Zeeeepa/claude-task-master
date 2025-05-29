/**
 * @fileoverview Database Testing Helper Utilities
 * @description Comprehensive utilities for database testing, consolidating all database test functionality
 */

import { createConnection } from '../../src/ai_cicd_system/database/connection.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env.DB_TEST_HOST || 'localhost',
  port: parseInt(process.env.DB_TEST_PORT) || 5432,
  database: process.env.DB_TEST_NAME || 'taskmaster_test',
  user: process.env.DB_TEST_USER || 'test_user',
  password: process.env.DB_TEST_PASSWORD || 'test_password',
  ssl: process.env.DB_TEST_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
  pool: {
    min: 1,
    max: 5,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  }
};

let testConnection = null;

/**
 * Initialize test database connection
 * @returns {Promise<Object>} Database connection instance
 */
export async function initializeTestDatabase() {
  if (!testConnection) {
    testConnection = await createConnection(TEST_DB_CONFIG);
  }
  return testConnection;
}

/**
 * Close test database connection
 * @returns {Promise<void>}
 */
export async function closeTestDatabase() {
  if (testConnection) {
    await testConnection.end();
    testConnection = null;
  }
}

/**
 * Get test database connection
 * @returns {Object} Database connection instance
 */
export function getTestDatabase() {
  if (!testConnection) {
    throw new Error('Test database not initialized. Call initializeTestDatabase() first.');
  }
  return testConnection;
}

/**
 * Execute SQL query on test database
 * @param {string} query - SQL query to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function executeTestQuery(query, params = []) {
  const db = getTestDatabase();
  return await db.query(query, params);
}

/**
 * Load and execute SQL file
 * @param {string} filename - SQL file name (relative to fixtures directory)
 * @returns {Promise<Object>} Query result
 */
export async function executeSQLFile(filename) {
  const filePath = join(__dirname, '../database/fixtures', filename);
  const sql = readFileSync(filePath, 'utf8');
  return await executeTestQuery(sql);
}

/**
 * Create test tables with schema
 * @returns {Promise<void>}
 */
export async function createTestTables() {
  const createTablesSQL = `
    -- Create tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(50) NOT NULL DEFAULT 'feature',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      priority INTEGER DEFAULT 5 CHECK (priority >= 0 AND priority <= 10),
      complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
      affected_files JSONB DEFAULT '[]'::jsonb,
      requirements JSONB DEFAULT '[]'::jsonb,
      acceptance_criteria JSONB DEFAULT '[]'::jsonb,
      parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      assigned_to VARCHAR(255),
      tags JSONB DEFAULT '[]'::jsonb,
      estimated_hours DECIMAL(10,2),
      actual_hours DECIMAL(10,2),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      metadata JSONB DEFAULT '{}'::jsonb
    );

    -- Create task_contexts table
    CREATE TABLE IF NOT EXISTS task_contexts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      context_type VARCHAR(100) NOT NULL,
      context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
    );

    -- Create workflow_states table
    CREATE TABLE IF NOT EXISTS workflow_states (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workflow_id VARCHAR(255) NOT NULL,
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      step VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      result JSONB DEFAULT '{}'::jsonb,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}'::jsonb
    );

    -- Create audit_logs table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(100) NOT NULL,
      entity_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      old_values JSONB DEFAULT '{}'::jsonb,
      new_values JSONB DEFAULT '{}'::jsonb,
      user_id VARCHAR(255),
      session_id VARCHAR(255),
      ip_address INET,
      user_agent TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
    );

    -- Create task_dependencies table
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      dependency_type VARCHAR(50) DEFAULT 'blocks',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(parent_task_id, child_task_id)
    );

    -- Create code_artifacts table (from PR #73)
    CREATE TABLE IF NOT EXISTS code_artifacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      artifact_type VARCHAR(50) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      content_size BIGINT NOT NULL,
      content_type VARCHAR(100),
      storage_location VARCHAR(500),
      storage_type VARCHAR(50) DEFAULT 'database',
      content TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create validation_results table (from PR #73)
    CREATE TABLE IF NOT EXISTS validation_results (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      validation_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      result_data JSONB DEFAULT '{}'::jsonb,
      error_message TEXT,
      validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
    );

    -- Create execution_history table (from PR #73)
    CREATE TABLE IF NOT EXISTS execution_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      execution_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      duration_ms INTEGER,
      result_data JSONB DEFAULT '{}'::jsonb,
      error_message TEXT,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `;

  await executeTestQuery(createTablesSQL);
}

/**
 * Create test indexes for performance
 * @returns {Promise<void>}
 */
export async function createTestIndexes() {
  const createIndexesSQL = `
    -- Tasks indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);

    -- Task contexts indexes
    CREATE INDEX IF NOT EXISTS idx_task_contexts_task_id ON task_contexts(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_contexts_context_type ON task_contexts(context_type);
    CREATE INDEX IF NOT EXISTS idx_task_contexts_created_at ON task_contexts(created_at);

    -- Workflow states indexes
    CREATE INDEX IF NOT EXISTS idx_workflow_states_workflow_id ON workflow_states(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_states_task_id ON workflow_states(task_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_states_status ON workflow_states(status);
    CREATE INDEX IF NOT EXISTS idx_workflow_states_started_at ON workflow_states(started_at);

    -- Audit logs indexes
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

    -- Task dependencies indexes
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent ON task_dependencies(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_child ON task_dependencies(child_task_id);

    -- Code artifacts indexes
    CREATE INDEX IF NOT EXISTS idx_code_artifacts_task_id ON code_artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_code_artifacts_type ON code_artifacts(artifact_type);
    CREATE INDEX IF NOT EXISTS idx_code_artifacts_hash ON code_artifacts(content_hash);

    -- Validation results indexes
    CREATE INDEX IF NOT EXISTS idx_validation_results_task_id ON validation_results(task_id);
    CREATE INDEX IF NOT EXISTS idx_validation_results_type ON validation_results(validation_type);
    CREATE INDEX IF NOT EXISTS idx_validation_results_status ON validation_results(status);

    -- Execution history indexes
    CREATE INDEX IF NOT EXISTS idx_execution_history_task_id ON execution_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_execution_history_type ON execution_history(execution_type);
    CREATE INDEX IF NOT EXISTS idx_execution_history_status ON execution_history(status);
    CREATE INDEX IF NOT EXISTS idx_execution_history_started_at ON execution_history(started_at);
  `;

  await executeTestQuery(createIndexesSQL);
}

/**
 * Create test triggers for audit logging
 * @returns {Promise<void>}
 */
export async function createTestTriggers() {
  const createTriggersSQL = `
    -- Function to update updated_at timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Triggers for updated_at
    DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
    CREATE TRIGGER update_tasks_updated_at
      BEFORE UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_task_contexts_updated_at ON task_contexts;
    CREATE TRIGGER update_task_contexts_updated_at
      BEFORE UPDATE ON task_contexts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_code_artifacts_updated_at ON code_artifacts;
    CREATE TRIGGER update_code_artifacts_updated_at
      BEFORE UPDATE ON code_artifacts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `;

  await executeTestQuery(createTriggersSQL);
}

/**
 * Seed test database with sample data
 * @returns {Promise<void>}
 */
export async function seedTestData() {
  const seedDataSQL = `
    -- Insert sample tasks
    INSERT INTO tasks (id, title, description, type, status, priority, complexity_score)
    VALUES 
      ('550e8400-e29b-41d4-a716-446655440001', 'Test Task 1', 'First test task', 'feature', 'pending', 5, 3),
      ('550e8400-e29b-41d4-a716-446655440002', 'Test Task 2', 'Second test task', 'bug', 'in_progress', 8, 5),
      ('550e8400-e29b-41d4-a716-446655440003', 'Test Task 3', 'Third test task', 'enhancement', 'completed', 3, 2)
    ON CONFLICT (id) DO NOTHING;

    -- Insert sample task contexts
    INSERT INTO task_contexts (task_id, context_type, context_data)
    VALUES 
      ('550e8400-e29b-41d4-a716-446655440001', 'requirements', '{"functional": ["req1", "req2"], "non_functional": ["perf1"]}'),
      ('550e8400-e29b-41d4-a716-446655440002', 'bug_report', '{"severity": "high", "steps_to_reproduce": ["step1", "step2"]}')
    ON CONFLICT DO NOTHING;

    -- Insert sample workflow states
    INSERT INTO workflow_states (workflow_id, task_id, step, status)
    VALUES 
      ('workflow-1', '550e8400-e29b-41d4-a716-446655440001', 'analysis', 'completed'),
      ('workflow-1', '550e8400-e29b-41d4-a716-446655440001', 'implementation', 'pending'),
      ('workflow-2', '550e8400-e29b-41d4-a716-446655440002', 'analysis', 'in_progress')
    ON CONFLICT DO NOTHING;
  `;

  await executeTestQuery(seedDataSQL);
}

/**
 * Clean up test database (truncate all tables)
 * @returns {Promise<void>}
 */
export async function cleanupTestDatabase() {
  const cleanupSQL = `
    TRUNCATE TABLE 
      execution_history,
      validation_results,
      code_artifacts,
      task_dependencies,
      audit_logs,
      workflow_states,
      task_contexts,
      tasks
    CASCADE;
  `;

  await executeTestQuery(cleanupSQL);
}

/**
 * Drop test tables
 * @returns {Promise<void>}
 */
export async function dropTestTables() {
  const dropTablesSQL = `
    DROP TABLE IF EXISTS 
      execution_history,
      validation_results,
      code_artifacts,
      task_dependencies,
      audit_logs,
      workflow_states,
      task_contexts,
      tasks
    CASCADE;
  `;

  await executeTestQuery(dropTablesSQL);
}

/**
 * Reset test database sequences
 * @returns {Promise<void>}
 */
export async function resetTestSequences() {
  // Note: Using UUIDs, so no sequences to reset
  // This function is kept for compatibility and future use
  return Promise.resolve();
}

/**
 * Generate test task data
 * @param {Object} overrides - Properties to override
 * @returns {Object} Test task data
 */
export function generateTestTask(overrides = {}) {
  return {
    title: 'Test Task',
    description: 'Test task description',
    type: 'feature',
    status: 'pending',
    priority: 5,
    complexity_score: 3,
    affected_files: [],
    requirements: [],
    acceptance_criteria: [],
    tags: [],
    metadata: {},
    ...overrides
  };
}

/**
 * Generate test task context data
 * @param {string} taskId - Task ID
 * @param {Object} overrides - Properties to override
 * @returns {Object} Test task context data
 */
export function generateTestTaskContext(taskId, overrides = {}) {
  return {
    task_id: taskId,
    context_type: 'test_context',
    context_data: { test: true },
    metadata: {},
    ...overrides
  };
}

/**
 * Generate test workflow state data
 * @param {string} taskId - Task ID
 * @param {Object} overrides - Properties to override
 * @returns {Object} Test workflow state data
 */
export function generateTestWorkflowState(taskId, overrides = {}) {
  return {
    workflow_id: 'test-workflow',
    task_id: taskId,
    step: 'test_step',
    status: 'pending',
    result: {},
    retry_count: 0,
    metadata: {},
    ...overrides
  };
}

/**
 * Assert that a table exists
 * @param {string} tableName - Table name to check
 * @returns {Promise<void>}
 */
export async function assertTableExists(tableName) {
  const result = await executeTestQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = $1
    )
  `, [tableName]);

  if (!result.rows[0].exists) {
    throw new Error(`Table '${tableName}' does not exist`);
  }
}

/**
 * Assert that an index exists
 * @param {string} indexName - Index name to check
 * @returns {Promise<void>}
 */
export async function assertIndexExists(indexName) {
  const result = await executeTestQuery(`
    SELECT EXISTS (
      SELECT FROM pg_indexes 
      WHERE indexname = $1
    )
  `, [indexName]);

  if (!result.rows[0].exists) {
    throw new Error(`Index '${indexName}' does not exist`);
  }
}

/**
 * Assert that a constraint exists
 * @param {string} tableName - Table name
 * @param {string} constraintName - Constraint name
 * @returns {Promise<void>}
 */
export async function assertConstraintExists(tableName, constraintName) {
  const result = await executeTestQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE table_name = $1 AND constraint_name = $2
    )
  `, [tableName, constraintName]);

  if (!result.rows[0].exists) {
    throw new Error(`Constraint '${constraintName}' does not exist on table '${tableName}'`);
  }
}

/**
 * Get table row count
 * @param {string} tableName - Table name
 * @returns {Promise<number>} Row count
 */
export async function getTableRowCount(tableName) {
  const result = await executeTestQuery(`SELECT COUNT(*) as count FROM ${tableName}`);
  return parseInt(result.rows[0].count);
}

/**
 * Measure query execution time
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result with execution time
 */
export async function measureQueryTime(query, params = []) {
  const startTime = Date.now();
  const result = await executeTestQuery(query, params);
  const executionTime = Date.now() - startTime;

  return {
    result,
    executionTime,
    rowCount: result.rows.length
  };
}

/**
 * Check if query uses index
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query plan analysis
 */
export async function analyzeQueryPlan(query, params = []) {
  const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
  const result = await executeTestQuery(explainQuery, params);
  
  const plan = result.rows[0]['QUERY PLAN'][0];
  
  return {
    executionTime: plan['Execution Time'],
    planningTime: plan['Planning Time'],
    usesIndex: JSON.stringify(plan).includes('Index Scan'),
    plan: plan
  };
}

/**
 * Test database connection health
 * @returns {Promise<Object>} Health check result
 */
export async function testDatabaseHealth() {
  try {
    const startTime = Date.now();
    const result = await executeTestQuery('SELECT NOW() as timestamp, version() as version');
    const responseTime = Date.now() - startTime;

    return {
      healthy: true,
      responseTime,
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

export default {
  initializeTestDatabase,
  closeTestDatabase,
  getTestDatabase,
  executeTestQuery,
  executeSQLFile,
  createTestTables,
  createTestIndexes,
  createTestTriggers,
  seedTestData,
  cleanupTestDatabase,
  dropTestTables,
  resetTestSequences,
  generateTestTask,
  generateTestTaskContext,
  generateTestWorkflowState,
  assertTableExists,
  assertIndexExists,
  assertConstraintExists,
  getTableRowCount,
  measureQueryTime,
  analyzeQueryPlan,
  testDatabaseHealth
};

