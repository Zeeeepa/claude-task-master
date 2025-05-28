# PostgreSQL Database Schema & Connection Management

This directory contains the comprehensive PostgreSQL database implementation for the AI CI/CD system, providing persistent storage for tasks, executions, validations, and audit trails.

## 📁 Directory Structure

```
src/database/
├── README.md                    # This documentation
├── schema.sql                   # Complete database schema
├── config.js                    # Database configuration management
├── connection_manager.js        # Connection pooling and management
├── models/                      # Data models with CRUD operations
│   ├── task.js                 # Task model
│   ├── execution.js            # Task execution model
│   └── validation.js           # PR validation model
└── migrations/                  # Database migrations
    └── 001_initial_schema.js   # Initial schema migration
```

## 🗄️ Database Schema

### Core Tables

#### `tasks`
Main task management table storing all task information.

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    requirements JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_by VARCHAR(255),
    assigned_to VARCHAR(255),
    parent_task_id UUID REFERENCES tasks(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Status Values**: `pending`, `in_progress`, `completed`, `failed`, `cancelled`
**Priority Range**: 0-10 (0 = lowest, 10 = highest)

#### `task_executions`
Task execution tracking with agent information and logs.

```sql
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL,
    agent_config JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    logs JSONB DEFAULT '[]',
    error_details JSONB,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Agent Types**: `claude-code`, `codegen`, `webhook-handler`, `validation-engine`
**Status Values**: `pending`, `running`, `completed`, `failed`, `cancelled`

#### `pr_validations`
PR validation tracking for GitHub integration.

```sql
CREATE TABLE pr_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES task_executions(id),
    pr_number INTEGER NOT NULL,
    repository VARCHAR(255) NOT NULL,
    branch_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    validation_results JSONB DEFAULT '{}',
    webhook_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Status Values**: `pending`, `running`, `passed`, `failed`, `cancelled`

#### `error_logs`
Error tracking and recovery management.

```sql
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    execution_id UUID REFERENCES task_executions(id),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    context JSONB DEFAULT '{}',
    recovery_attempts INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Error Types**: `database`, `api`, `validation`, `network`, `timeout`, `authentication`, `authorization`, `system`

#### `system_config`
System configuration key-value store.

```sql
CREATE TABLE system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `audit_logs`
Comprehensive audit trail for all database changes.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Views

The schema includes several views for common queries:

- **`active_tasks`**: Tasks with status `pending` or `in_progress`
- **`task_execution_summary`**: Execution statistics by agent type and status
- **`pr_validation_summary`**: Validation statistics by repository and status
- **`error_summary`**: Error statistics by type and resolution status
- **`recent_activity`**: Recent audit log entries with task information

## 🔧 Configuration

### Environment Variables

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_cicd_system
DB_USER=postgres
DB_PASSWORD=password
DB_SSL_MODE=disable

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
DB_POOL_ACQUIRE_TIMEOUT=30000

# Query Settings
DB_QUERY_TIMEOUT=30000
DB_SLOW_QUERY_THRESHOLD=1000

# Health Check
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000

# Logging
DB_LOGGING_ENABLED=true
DB_LOGGING_LEVEL=info
DB_LOG_QUERIES=false
DB_LOG_SLOW_QUERIES=true
```

### Configuration Usage

```javascript
import { databaseConfig, createConnectionConfig } from './src/database/config.js';

// Get environment-specific configuration
const config = createConnectionConfig('production');

// Validate configuration
const validation = validateDatabaseConfig(config);
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}
```

## 🔌 Connection Management

### Basic Usage

```javascript
import { DatabaseConnectionManager } from './src/database/connection_manager.js';
import { createConnectionConfig } from './src/database/config.js';

// Initialize connection manager
const config = createConnectionConfig();
const connectionManager = new DatabaseConnectionManager(config);

// Initialize connection pool
await connectionManager.initialize();

// Execute queries
const result = await connectionManager.executeQuery(
  'SELECT * FROM tasks WHERE status = $1',
  ['pending']
);

// Execute transactions
const transactionResult = await connectionManager.executeTransaction(async (client) => {
  await client.query('INSERT INTO tasks (title) VALUES ($1)', ['New Task']);
  await client.query('INSERT INTO task_executions (task_id, agent_type) VALUES ($1, $2)', [taskId, 'claude-code']);
  return 'Transaction completed';
});

// Health check
const health = await connectionManager.healthCheck();
console.log('Database healthy:', health.healthy);

// Get statistics
const stats = connectionManager.getStats();
console.log('Query success rate:', stats.successRate);

// Close connection
await connectionManager.close();
```

### Features

- **Connection Pooling**: Configurable pool size with automatic connection management
- **Error Handling**: Integrated with CodegenErrorHandler for retry logic and circuit breaker
- **Health Monitoring**: Automatic health checks and connection statistics
- **Query Logging**: Configurable query logging with slow query detection
- **Transaction Support**: Full transaction support with automatic rollback on errors

## 📊 Data Models

### Task Model

```javascript
import { Task } from './src/database/models/task.js';

// Create new task
const task = await Task.create(connectionManager, {
  title: 'Implement new feature',
  description: 'Add user authentication',
  requirements: { auth: 'oauth2', provider: 'github' },
  priority: 5,
  assigned_to: 'developer@example.com'
});

// Find tasks
const tasks = await Task.findBy(connectionManager, {
  status: 'pending',
  assigned_to: 'developer@example.com'
}, {
  limit: 10,
  orderBy: 'priority DESC'
});

// Update task
task.status = 'in_progress';
await task.update(connectionManager);

// Get statistics
const stats = await Task.getStatistics(connectionManager);
```

### Task Execution Model

```javascript
import { TaskExecution } from './src/database/models/execution.js';

// Create execution
const execution = await TaskExecution.create(connectionManager, {
  task_id: task.id,
  agent_type: 'claude-code',
  agent_config: { model: 'claude-3-sonnet', temperature: 0.1 }
});

// Start execution
await execution.start(connectionManager);

// Add logs
await execution.addLog(connectionManager, {
  level: 'info',
  message: 'Starting code generation',
  timestamp: new Date()
});

// Complete execution
await execution.complete(connectionManager, [
  { level: 'info', message: 'Code generation completed successfully' }
]);
```

### PR Validation Model

```javascript
import { PRValidation } from './src/database/models/validation.js';

// Create validation
const validation = await PRValidation.create(connectionManager, {
  task_id: task.id,
  execution_id: execution.id,
  pr_number: 123,
  repository: 'owner/repo',
  branch_name: 'feature/new-auth'
});

// Add validation results
await validation.addValidationResult(connectionManager, 'tests', {
  status: 'passed',
  details: { passed: 15, failed: 0, skipped: 2 }
});

// Update status
await validation.updateStatus(connectionManager, 'passed', {
  overall_score: 95,
  checks_passed: 5,
  checks_failed: 0
});
```

## 🔄 Migrations

### Running Migrations

```javascript
import { Migration001InitialSchema } from './src/database/migrations/001_initial_schema.js';

const migration = new Migration001InitialSchema();

// Check if migration is applied
const isApplied = await migration.isApplied(connectionManager);

// Apply migration
if (!isApplied) {
  await migration.up(connectionManager);
}

// Validate migration
const validation = await migration.validate(connectionManager);
if (!validation.valid) {
  console.error('Migration validation failed:', validation.errors);
}
```

### Creating New Migrations

1. Create a new migration file: `src/database/migrations/002_new_feature.js`
2. Implement the migration class with `up()`, `down()`, and `validate()` methods
3. Update the migration runner to include the new migration

## 🧪 Testing

### Running Tests

```bash
# Run all database tests
npm test tests/database/

# Run specific test files
npm test tests/database/connection_manager.test.js
npm test tests/database/models/task.test.js
```

### Test Coverage

The test suite includes:

- **Connection Manager Tests**: Pool management, query execution, transactions, health checks
- **Model Tests**: CRUD operations, validation, error handling
- **Migration Tests**: Schema creation, rollback, validation
- **Integration Tests**: End-to-end database operations

### Performance Tests

```javascript
// Example performance test
import { DatabaseConnectionManager } from './src/database/connection_manager.js';

const connectionManager = new DatabaseConnectionManager();
await connectionManager.initialize();

// Test concurrent queries
const promises = Array.from({ length: 100 }, (_, i) => 
  connectionManager.executeQuery('SELECT $1 as test_value', [i])
);

const results = await Promise.all(promises);
const stats = connectionManager.getStats();

console.log('Concurrent queries completed:', results.length);
console.log('Average execution time:', stats.avgExecutionTime);
console.log('Success rate:', stats.successRate);
```

## 📈 Monitoring

### Health Checks

The connection manager provides comprehensive health monitoring:

```javascript
const health = await connectionManager.healthCheck();

console.log('Database Status:', {
  healthy: health.healthy,
  responseTime: health.responseTime,
  lastCheck: health.timestamp,
  poolStats: health.stats.pool,
  queryStats: {
    total: health.stats.totalQueries,
    successful: health.stats.successfulQueries,
    failed: health.stats.failedQueries,
    avgTime: health.stats.avgExecutionTime
  }
});
```

### Performance Metrics

```javascript
const stats = connectionManager.getStats();

console.log('Performance Metrics:', {
  connectionPool: {
    total: stats.pool.totalCount,
    idle: stats.pool.idleCount,
    waiting: stats.pool.waitingCount
  },
  queries: {
    total: stats.totalQueries,
    successRate: stats.successRate,
    avgExecutionTime: stats.avgExecutionTime,
    slowQueries: stats.slowQueries
  },
  errors: {
    connectionErrors: stats.connectionErrors,
    failedQueries: stats.failedQueries
  }
});
```

## 🔒 Security

### Best Practices

1. **Environment Variables**: Store sensitive configuration in environment variables
2. **SSL Connections**: Use SSL in production environments
3. **Connection Limits**: Configure appropriate pool limits to prevent resource exhaustion
4. **Query Parameterization**: Always use parameterized queries to prevent SQL injection
5. **Audit Logging**: All database changes are automatically logged for security auditing

### Example Secure Configuration

```javascript
const productionConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA,
    cert: process.env.DB_SSL_CERT,
    key: process.env.DB_SSL_KEY
  },
  pool: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000
  }
};
```

## 🚀 Performance Optimization

### Indexing Strategy

The schema includes comprehensive indexes for optimal query performance:

- **Primary Keys**: UUID primary keys on all tables
- **Foreign Keys**: Indexes on all foreign key relationships
- **Query Optimization**: Indexes on commonly queried columns (status, created_at, etc.)
- **Composite Indexes**: Multi-column indexes for complex queries

### Query Optimization

```javascript
// Use indexes effectively
const recentTasks = await Task.findBy(connectionManager, {
  status: 'pending',           // Uses idx_tasks_status
  assigned_to: 'user@example.com'  // Uses idx_tasks_assigned_to
}, {
  orderBy: 'created_at DESC',  // Uses idx_tasks_created_at
  limit: 50
});

// Use views for complex queries
const activeTasksResult = await connectionManager.executeQuery(
  'SELECT * FROM active_tasks WHERE priority >= $1',
  [5]
);
```

### Connection Pool Tuning

```javascript
const optimizedConfig = {
  // Pool size based on expected concurrent users
  max: Math.min(20, process.env.MAX_CONCURRENT_USERS || 10),
  min: 2,
  
  // Timeout settings for responsive applications
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  acquireTimeoutMillis: 30000,
  
  // Health check settings
  healthCheck: {
    enabled: true,
    interval: 30000
  }
};
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Library](https://node-postgres.com/)
- [Database Design Best Practices](https://www.postgresql.org/docs/current/ddl-best-practices.html)
- [Connection Pooling Guide](https://node-postgres.com/features/pooling)

