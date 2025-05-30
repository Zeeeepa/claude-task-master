/**
 * Migration: Create Indexes
 * Created: 2025-05-30T13:55:00.000Z
 * Description: Create performance indexes for all tables
 */

/**
 * Apply migration - Create all indexes
 * @param {import('pg').PoolClient} client - Database client
 */
export async function up(client) {
  console.log('Creating indexes for performance optimization...');

  // Tasks table indexes
  await client.query('CREATE INDEX idx_tasks_status ON tasks(status);');
  await client.query('CREATE INDEX idx_tasks_project_id ON tasks(project_id);');
  await client.query('CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);');
  await client.query('CREATE INDEX idx_tasks_created_at ON tasks(created_at);');
  await client.query('CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);');
  await client.query('CREATE INDEX idx_tasks_priority ON tasks(priority);');
  await client.query('CREATE INDEX idx_tasks_complexity_score ON tasks(complexity_score);');
  await client.query('CREATE INDEX idx_tasks_legacy_id ON tasks(legacy_id);');

  // JSONB indexes for efficient querying
  await client.query('CREATE INDEX idx_tasks_requirements_gin ON tasks USING GIN (requirements);');
  await client.query('CREATE INDEX idx_tasks_dependencies_gin ON tasks USING GIN (dependencies);');
  await client.query('CREATE INDEX idx_tasks_acceptance_criteria_gin ON tasks USING GIN (acceptance_criteria);');

  // Subtasks indexes
  await client.query('CREATE INDEX idx_subtasks_parent ON subtasks(parent_task_id);');
  await client.query('CREATE INDEX idx_subtasks_child ON subtasks(child_task_id);');
  await client.query('CREATE INDEX idx_subtasks_order ON subtasks(parent_task_id, order_index);');

  // Task dependencies indexes
  await client.query('CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);');
  await client.query('CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);');
  await client.query('CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);');

  // Projects indexes
  await client.query('CREATE INDEX idx_projects_status ON projects(status);');
  await client.query('CREATE INDEX idx_projects_name ON projects(name);');
  await client.query('CREATE INDEX idx_projects_created_at ON projects(created_at);');

  // Templates indexes
  await client.query('CREATE INDEX idx_templates_type ON templates(type);');
  await client.query('CREATE INDEX idx_templates_name ON templates(name);');
  await client.query('CREATE INDEX idx_templates_usage_count ON templates(usage_count DESC);');

  // Execution history indexes
  await client.query('CREATE INDEX idx_execution_history_task_id ON execution_history(task_id);');
  await client.query('CREATE INDEX idx_execution_history_status ON execution_history(status);');
  await client.query('CREATE INDEX idx_execution_history_started_at ON execution_history(started_at);');
  await client.query('CREATE INDEX idx_execution_history_attempt ON execution_history(task_id, attempt_number);');

  // Learning data indexes
  await client.query('CREATE INDEX idx_learning_data_pattern_type ON learning_data(pattern_type);');
  await client.query('CREATE INDEX idx_learning_data_success_rate ON learning_data(success_rate DESC);');
  await client.query('CREATE INDEX idx_learning_data_usage_frequency ON learning_data(usage_frequency DESC);');

  // Full-text search indexes
  await client.query("CREATE INDEX idx_tasks_title_search ON tasks USING GIN (to_tsvector('english', title));");
  await client.query("CREATE INDEX idx_tasks_description_search ON tasks USING GIN (to_tsvector('english', description));");
  await client.query("CREATE INDEX idx_projects_name_search ON projects USING GIN (to_tsvector('english', name));");

  console.log('✅ Created all performance indexes');
}

/**
 * Rollback migration - Drop all indexes
 * @param {import('pg').PoolClient} client - Database client
 */
export async function down(client) {
  console.log('Dropping all indexes...');

  // Drop all indexes (PostgreSQL will automatically drop them when tables are dropped,
  // but we'll be explicit for clarity)
  const indexes = [
    'idx_tasks_status',
    'idx_tasks_project_id',
    'idx_tasks_parent_task_id',
    'idx_tasks_created_at',
    'idx_tasks_updated_at',
    'idx_tasks_priority',
    'idx_tasks_complexity_score',
    'idx_tasks_legacy_id',
    'idx_tasks_requirements_gin',
    'idx_tasks_dependencies_gin',
    'idx_tasks_acceptance_criteria_gin',
    'idx_subtasks_parent',
    'idx_subtasks_child',
    'idx_subtasks_order',
    'idx_task_dependencies_task_id',
    'idx_task_dependencies_depends_on',
    'idx_task_dependencies_type',
    'idx_projects_status',
    'idx_projects_name',
    'idx_projects_created_at',
    'idx_templates_type',
    'idx_templates_name',
    'idx_templates_usage_count',
    'idx_execution_history_task_id',
    'idx_execution_history_status',
    'idx_execution_history_started_at',
    'idx_execution_history_attempt',
    'idx_learning_data_pattern_type',
    'idx_learning_data_success_rate',
    'idx_learning_data_usage_frequency',
    'idx_tasks_title_search',
    'idx_tasks_description_search',
    'idx_projects_name_search'
  ];

  for (const index of indexes) {
    await client.query(`DROP INDEX IF EXISTS ${index};`);
  }

  console.log('✅ Dropped all indexes');
}

