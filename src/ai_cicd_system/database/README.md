# PostgreSQL Database Implementation

This directory contains the production-ready PostgreSQL database implementation for the TaskMaster AI CI/CD System.

## Overview

The database implementation provides:

- **Production-ready PostgreSQL integration** with connection pooling and health monitoring
- **Comprehensive schema** with proper indexing, constraints, and audit trails
- **Migration system** for schema version management
- **Data models** with validation and business logic
- **Performance optimization** with query monitoring and caching
- **Error handling and resilience** with retry logic and graceful degradation

## Architecture

```
database/
├── connection.js          # Database connection manager with pooling
├── models/               # Data models with validation
│   ├── Task.js          # Task model with business logic
│   └── TaskContext.js   # Context model for metadata
├── migrations/          # Database schema migrations
│   ├── 001_initial_schema.sql  # Initial schema creation
│   └── runner.js        # Migration runner and management
└── README.md           # This file
```

## Database Schema

### Core Tables

#### `tasks`

Main tasks table storing all task information:

- `id` (UUID) - Primary key
- `title` (VARCHAR) - Task title
- `description` (TEXT) - Task description
- `type` (VARCHAR) - Task type (bug, feature, enhancement)
- `status` (VARCHAR) - Task status (pending, in_progress, completed, failed, cancelled)
- `priority` (INTEGER) - Priority level (0-10)
- `complexity_score` (INTEGER) - Complexity rating (1-10)
- `affected_files` (JSONB) - List of affected files
- `requirements` (JSONB) - Task requirements
- `acceptance_criteria` (JSONB) - Acceptance criteria
- `parent_task_id` (UUID) - Parent task reference
- `assigned_to` (VARCHAR) - Assignee identifier
- `tags` (JSONB) - Task tags
- `estimated_hours` (DECIMAL) - Estimated effort
- `actual_hours` (DECIMAL) - Actual effort
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp
- `completed_at` (TIMESTAMP) - Completion timestamp
- `metadata` (JSONB) - Additional metadata

#### `task_contexts`

Contextual information and metadata for tasks:

- `id` (UUID) - Primary key
- `task_id` (UUID) - Foreign key to tasks
- `context_type` (VARCHAR) - Type of context
- `context_data` (JSONB) - Context data
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp
- `metadata` (JSONB) - Additional metadata

#### `workflow_states`

Workflow execution states and progress tracking:

- `id` (UUID) - Primary key
- `workflow_id` (VARCHAR) - Workflow identifier
- `task_id` (UUID) - Associated task
- `step` (VARCHAR) - Workflow step
- `status` (VARCHAR) - Step status
- `result` (JSONB) - Step result
- `started_at` (TIMESTAMP) - Start timestamp
- `completed_at` (TIMESTAMP) - Completion timestamp
- `error_message` (TEXT) - Error details
- `retry_count` (INTEGER) - Retry attempts
- `metadata` (JSONB) - Additional metadata

#### `audit_logs`

Audit trail for all database changes:

- `id` (UUID) - Primary key
- `entity_type` (VARCHAR) - Type of entity
- `entity_id` (UUID) - Entity identifier
- `action` (VARCHAR) - Action performed
- `old_values` (JSONB) - Previous values
- `new_values` (JSONB) - New values
- `user_id` (VARCHAR) - User identifier
- `session_id` (VARCHAR) - Session identifier
- `ip_address` (INET) - IP address
- `user_agent` (TEXT) - User agent
- `timestamp` (TIMESTAMP) - Action timestamp
- `metadata` (JSONB) - Additional metadata

#### `task_dependencies`

Task dependency relationships:

- `id` (UUID) - Primary key
- `parent_task_id` (UUID) - Parent task
- `child_task_id` (UUID) - Child task
- `dependency_type` (VARCHAR) - Dependency type
- `created_at` (TIMESTAMP) - Creation timestamp
- `metadata` (JSONB) - Additional metadata

### Indexes

The schema includes comprehensive indexes for performance:

- **Tasks**: status, priority, assigned_to, parent_task_id, created_at, updated_at, type, complexity_score
- **Task Contexts**: task_id, context_type, created_at
- **Workflow States**: workflow_id, task_id, status, started_at
- **Audit Logs**: entity_type + entity_id, timestamp, user_id, action
- **Task Dependencies**: parent_task_id, child_task_id

### Triggers

Automatic triggers for:

- **Updated timestamps** - Automatically update `updated_at` fields
- **Audit logging** - Automatically log all changes to audit_logs table

## Configuration

### Environment Variables

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=password
DB_SSL_MODE=disable

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=10000
DB_POOL_ACQUIRE_TIMEOUT=30000

# Performance
DB_QUERY_TIMEOUT=60000
DB_SLOW_QUERY_THRESHOLD=1000
DB_LOG_SLOW_QUERIES=true

# Health Monitoring
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000

# Audit
DB_AUDIT_ENABLED=true
DB_AUDIT_RETENTION_DAYS=90
```

### TaskStorageManager Configuration

```javascript
const taskStorage = new TaskStorageManager({
	enable_mock: false, // Use real database
	auto_migrate: true, // Run migrations automatically
	enable_audit: true, // Enable audit logging
	enable_performance_tracking: true // Track performance metrics
});
```

## Usage

### Basic Operations

```javascript
import { TaskStorageManager } from './core/task_storage_manager.js';

// Initialize
const taskStorage = new TaskStorageManager();
await taskStorage.initialize();

// Store a task
const taskId = await taskStorage.storeTask({
	title: 'Implement feature X',
	description: 'Add new functionality',
	type: 'feature',
	priority: 7,
	complexity_score: 8,
	requirements: ['Requirement 1', 'Requirement 2'],
	acceptance_criteria: ['Criteria 1', 'Criteria 2']
});

// Retrieve a task
const task = await taskStorage.getTask(taskId);

// Update task status
await taskStorage.updateTaskStatus(taskId, 'in_progress', {
	started_by: 'developer-123',
	notes: 'Starting implementation'
});

// List tasks with filters
const pendingTasks = await taskStorage.listTasks({
	status: 'pending',
	priority: 8,
	sort_by: 'created_at',
	sort_order: 'DESC',
	limit: 50
});

// Store context
await taskStorage.storeTaskContext(taskId, 'codebase', {
	files_analyzed: ['file1.js', 'file2.js'],
	complexity_metrics: { cyclomatic: 5 }
});

// Get full context
const fullContext = await taskStorage.getTaskFullContext(taskId);
```

### Advanced Operations

```javascript
// Store AI interaction
await taskStorage.storeAIInteraction(taskId, 'claude-3', {
	type: 'code_generation',
	request: { prompt: 'Generate function' },
	response: { code: 'function test() {}' },
	execution_time_ms: 1500,
	success: true
});

// Add task dependency
await taskStorage.addTaskDependency(parentTaskId, childTaskId, 'blocks');

// Store validation result
await taskStorage.storeValidationResult(
	taskId,
	'code_quality',
	'eslint',
	'passed',
	85,
	{ issues: 2, warnings: 1 },
	{ improve_naming: true }
);

// Get metrics
const metrics = await taskStorage.getTaskMetrics();
console.log(`Total tasks: ${metrics.total_tasks}`);
console.log(
	`Completion rate: ${((metrics.completed_tasks / metrics.total_tasks) * 100).toFixed(1)}%`
);
```

## Migration Management

### Running Migrations

```javascript
import { MigrationRunner } from './database/migrations/runner.js';
import { getConnection } from './database/connection.js';

const connection = await getConnection();
await connection.initialize();

const migrationRunner = new MigrationRunner(connection);

// Run all pending migrations
await migrationRunner.runMigrations();

// Check migration status
const status = await migrationRunner.getMigrationStatus();
console.log(`Applied: ${status.applied}, Pending: ${status.pending}`);

// Validate migrations
const validation = await migrationRunner.validateMigrations();
if (!validation.valid) {
	console.error('Migration validation failed:', validation.errors);
}
```

### Creating New Migrations

```javascript
const migrationRunner = new MigrationRunner(connection);
const migrationPath = await migrationRunner.createMigration(
	'add_new_feature_table'
);
console.log(`Created migration: ${migrationPath}`);
```

## Performance Optimization

### Connection Pooling

The database connection uses PostgreSQL connection pooling with:

- **Min connections**: 2
- **Max connections**: 10
- **Idle timeout**: 10 seconds
- **Acquire timeout**: 30 seconds

### Query Optimization

- **Comprehensive indexing** on frequently queried columns
- **Query monitoring** with slow query logging
- **Performance metrics** tracking
- **Connection pool monitoring**

### Caching Strategy

- **Connection pooling** for database connections
- **Query result caching** for frequently accessed data
- **Performance metrics** for monitoring

## Error Handling

### Resilience Features

- **Automatic retry** with exponential backoff
- **Connection health monitoring** with automatic recovery
- **Graceful degradation** to mock mode on database failure
- **Transaction rollback** on errors
- **Comprehensive error logging**

### Error Recovery

```javascript
// Automatic fallback to mock mode
const taskStorage = new TaskStorageManager({
	enable_mock: false // Will fallback to mock if database fails
});

try {
	await taskStorage.initialize();
} catch (error) {
	// Will automatically switch to mock mode
	console.log('Database failed, using mock mode');
}
```

## Testing

### Unit Tests

```bash
npm test tests/database/task_storage_manager.test.js
```

### Integration Tests

```bash
# Requires DB_TEST_URL environment variable
export DB_TEST_URL=postgresql://test_user:test_password@localhost:5432/test_db
npm test tests/database/integration.test.js
```

### Performance Tests

```bash
# Requires DB_TEST_URL environment variable
export DB_TEST_URL=postgresql://test_user:test_password@localhost:5432/test_db
npm test tests/database/performance.test.js
```

## Monitoring and Health Checks

### Health Status

```javascript
const health = await taskStorage.getHealth();
console.log('Database status:', health.status);
console.log('Connection pool:', health.database.poolStats);
console.log('Query performance:', health.query_performance);
```

### Performance Metrics

```javascript
const metrics = await taskStorage.getTaskMetrics();
console.log('Task metrics:', {
	total: metrics.total_tasks,
	pending: metrics.pending_tasks,
	completed: metrics.completed_tasks,
	avgComplexity: metrics.avg_complexity,
	estimationAccuracy: metrics.avg_estimation_accuracy
});
```

## Security Considerations

### Data Protection

- **SSL/TLS encryption** for database connections
- **Input validation** and sanitization
- **SQL injection prevention** through parameterized queries
- **Audit logging** for all data changes
- **Access control** through database permissions

### Configuration Security

- **Environment variables** for sensitive configuration
- **Connection string masking** in logs
- **Password encryption** in configuration
- **SSL certificate validation**

## Troubleshooting

### Common Issues

1. **Connection Timeout**

   - Check database server status
   - Verify network connectivity
   - Review connection pool settings

2. **Migration Failures**

   - Check database permissions
   - Verify schema compatibility
   - Review migration logs

3. **Performance Issues**

   - Monitor slow query logs
   - Check index usage
   - Review connection pool metrics

4. **Memory Leaks**
   - Monitor connection pool size
   - Check for unclosed connections
   - Review query result caching

### Debug Mode

```javascript
const taskStorage = new TaskStorageManager({
	enable_mock: false,
	monitoring: {
		log_queries: true,
		log_slow_queries: true
	}
});
```

## Contributing

When contributing to the database implementation:

1. **Follow schema conventions** - Use proper naming and constraints
2. **Add comprehensive tests** - Unit, integration, and performance tests
3. **Update migrations** - Create migration scripts for schema changes
4. **Document changes** - Update this README and code comments
5. **Test performance** - Ensure changes don't degrade performance
6. **Validate security** - Review for security implications

## License

This database implementation is part of the TaskMaster AI CI/CD System and follows the same license terms.
