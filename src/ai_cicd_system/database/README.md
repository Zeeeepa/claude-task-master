# PostgreSQL Database Schema & Cloudflare Integration

## 🎯 Overview

This directory contains the complete PostgreSQL database implementation with Cloudflare proxy integration for the AI CI/CD system. It provides a production-ready data backbone for task management, workflow tracking, and secure external access.

## 📁 Directory Structure

```
src/ai_cicd_system/database/
├── README.md                          # This documentation
├── connection.js                      # Database connection manager
├── models/                           # Data models with validation
│   ├── Task.js                       # Task model
│   ├── TaskContext.js                # Context model
│   ├── WorkflowState.js              # Workflow state model
│   ├── ErrorLog.js                   # Error logging model
│   └── ApiKey.js                     # API key management model
├── repositories/                     # Data access layer
│   ├── TaskRepository.js             # Task CRUD operations
│   ├── ContextRepository.js          # Context management
│   └── StateRepository.js            # Workflow state operations
├── migrations/                       # Database schema migrations
│   ├── 001_initial_schema.sql        # Initial schema
│   ├── 002_add_error_logs_and_api_keys.sql # Additional tables
│   └── runner.js                     # Migration runner
├── performance/                      # Performance tools
│   └── benchmark.js                  # Benchmarking tool
└── seeds/                           # Test data (if exists)
```

## 🗄️ Database Schema

### Core Tables

#### 1. Tasks Table
Stores all task information with metadata and relationships.

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    complexity_score INTEGER DEFAULT 5,
    affected_files JSONB DEFAULT '[]'::jsonb,
    requirements JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    parent_task_id UUID REFERENCES tasks(id),
    assigned_to VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 2. Task Contexts Table
Stores contextual information and metadata for tasks.

```sql
CREATE TABLE task_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 3. Workflow States Table
Tracks workflow execution states and progress.

```sql
CREATE TABLE workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id VARCHAR(255) NOT NULL,
    task_id UUID REFERENCES tasks(id),
    step VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    result JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 4. Error Logs Table
Comprehensive error logging and tracking.

```sql
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_type VARCHAR(50) NOT NULL DEFAULT 'general',
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    task_id UUID REFERENCES tasks(id),
    workflow_id VARCHAR(255),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 5. API Keys Table
Secure API key storage and management.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    service VARCHAR(50) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(20),
    permissions JSONB DEFAULT '[]'::jsonb,
    environment VARCHAR(20) NOT NULL DEFAULT 'development',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    rate_limit JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### Supporting Tables

- **audit_logs**: Complete audit trail for all database changes
- **task_dependencies**: Task dependency relationships
- **performance_metrics**: System performance metrics
- **schema_migrations**: Database version tracking

## 🔌 Connection Management

### Basic Usage

```javascript
import { getConnection, initializeDatabase } from './connection.js';

// Initialize database connection
const connection = await initializeDatabase();

// Get existing connection
const db = getConnection();

// Execute query
const result = await db.query('SELECT * FROM tasks WHERE status = $1', ['pending']);

// Execute transaction
const result = await db.transaction(async (client) => {
    const task = await client.query('INSERT INTO tasks (...) VALUES (...) RETURNING *');
    const context = await client.query('INSERT INTO task_contexts (...) VALUES (...)');
    return { task: task.rows[0], context: context.rows[0] };
});
```

### Configuration

Database configuration is managed through environment variables:

```bash
# Basic connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=postgres
DB_PASSWORD=password

# Cloudflare proxy (optional)
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_PROXY_HOSTNAME=db-proxy.your-domain.com

# SSL configuration
DB_SSL_ENABLED=true
DB_SSL_MODE=require

# Pool configuration
DB_POOL_MIN=2
DB_POOL_MAX=10

# Monitoring
DB_LOG_QUERIES=false
DB_LOG_POOL_STATS=false
```

## 📊 Data Models

### Task Model

```javascript
import { Task } from './models/Task.js';

// Create new task
const task = new Task({
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication system',
    type: 'feature',
    priority: 8,
    complexity_score: 7,
    requirements: ['JWT library', 'User model', 'Auth middleware'],
    acceptance_criteria: ['Login works', 'Token validation', 'Logout functionality']
});

// Validate task
const validation = task.validate();
if (!validation.valid) {
    console.error('Validation errors:', validation.errors);
}

// Convert to database format
const dbData = task.toDatabase();

// Create from database row
const taskFromDb = Task.fromDatabase(dbRow);
```

### TaskContext Model

```javascript
import { TaskContext } from './models/TaskContext.js';

const context = new TaskContext({
    task_id: 'task-uuid',
    context_type: 'requirement',
    context_data: {
        source: 'user_story',
        priority: 'high',
        stakeholder: 'product_team'
    }
});
```

### WorkflowState Model

```javascript
import { WorkflowState } from './models/WorkflowState.js';

const state = new WorkflowState({
    workflow_id: 'workflow-123',
    task_id: 'task-uuid',
    step: 'code_generation',
    status: 'running'
});

// Update status
state.updateStatus('completed');

// Set result
state.setResult({ 
    files_created: ['auth.js', 'middleware.js'],
    tests_passed: true 
});
```

## 🗃️ Repository Pattern

### TaskRepository

```javascript
import { TaskRepository } from './repositories/TaskRepository.js';

const taskRepo = new TaskRepository();

// Create task
const task = await taskRepo.create({
    title: 'New feature',
    description: 'Feature description'
});

// Find by ID
const task = await taskRepo.findById('task-uuid');

// Find by criteria
const results = await taskRepo.findBy(
    { status: 'pending', priority: 8 },
    { limit: 10, offset: 0, orderBy: 'created_at DESC' }
);

// Update task
const updatedTask = await taskRepo.update('task-uuid', {
    status: 'in_progress'
});

// Get statistics
const stats = await taskRepo.getStatistics({
    assigned_to: 'user-123',
    created_after: new Date('2024-01-01')
});

// Search tasks
const searchResults = await taskRepo.search('authentication', {
    limit: 20
});
```

### ContextRepository

```javascript
import { ContextRepository } from './repositories/ContextRepository.js';

const contextRepo = new ContextRepository();

// Find contexts by task
const contexts = await contextRepo.findByTaskId('task-uuid', {
    contextType: 'requirement',
    limit: 50
});

// Get task timeline
const timeline = await contextRepo.getTaskTimeline('task-uuid');

// Bulk create contexts
const contexts = await contextRepo.bulkCreate([
    { task_id: 'task-1', context_type: 'requirement', context_data: {...} },
    { task_id: 'task-1', context_type: 'validation', context_data: {...} }
]);
```

### StateRepository

```javascript
import { StateRepository } from './repositories/StateRepository.js';

const stateRepo = new StateRepository();

// Find workflow states
const states = await stateRepo.findByWorkflowId('workflow-123');

// Get workflow progress
const progress = await stateRepo.getWorkflowProgress('workflow-123');

// Update state status
const state = await stateRepo.updateStatus('state-uuid', 'completed');

// Get retryable failed states
const failedStates = await stateRepo.getRetryableFailedStates({
    maxRetries: 3,
    limit: 10
});
```

## 🔄 Migrations

### Running Migrations

```javascript
import { MigrationRunner } from './migrations/runner.js';

const runner = new MigrationRunner();

// Run all pending migrations
await runner.runMigrations();

// Check migration status
const status = await runner.getStatus();

// Rollback last migration
await runner.rollback();
```

### Creating New Migrations

1. Create a new SQL file in `migrations/` directory
2. Follow naming convention: `XXX_description.sql`
3. Include both UP and DOWN migrations
4. Update migration runner if needed

Example migration:

```sql
-- Migration: 003_add_user_preferences.sql
-- Description: Add user preferences table
-- Created: 2024-01-15

CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('003', 'Add user preferences table', 'user_preferences_v1_0_0')
ON CONFLICT (version) DO NOTHING;
```

## ⚡ Performance Optimization

### Benchmarking

```javascript
import { DatabaseBenchmark } from './performance/benchmark.js';

const benchmark = new DatabaseBenchmark();

// Run comprehensive benchmark
const results = await benchmark.runBenchmark({
    includeConnectionTests: true,
    includeCrudTests: true,
    includeQueryTests: true,
    includeConcurrencyTests: true,
    includeStressTests: false, // Enable for stress testing
    iterations: 100,
    concurrency: 10
});

// Print results
benchmark.printResults();

// Export results
await benchmark.exportResults('./benchmark-results.json');
```

### Performance Tips

1. **Indexing**: Ensure proper indexes on frequently queried columns
2. **Connection Pooling**: Use appropriate pool sizes for your workload
3. **Query Optimization**: Use EXPLAIN ANALYZE to optimize slow queries
4. **Batch Operations**: Use bulk operations for multiple inserts/updates
5. **Monitoring**: Enable query logging and performance metrics

### Key Performance Metrics

- **Connection Time**: < 50ms average
- **Simple Queries**: < 10ms average
- **Complex Queries**: < 100ms average
- **CRUD Operations**: < 50ms average
- **Concurrent Operations**: > 100 ops/second

## 🔒 Security

### Connection Security

- SSL/TLS encryption enabled by default
- Certificate validation for production
- IP-based access control
- Connection timeout limits

### Query Security

- Parameterized queries to prevent SQL injection
- Query validation and dangerous pattern detection
- User-based operation restrictions
- Audit logging for all operations

### API Key Management

```javascript
import { ApiKey } from './models/ApiKey.js';

// Create API key
const apiKey = new ApiKey({
    name: 'Codegen Service Key',
    service: 'codegen',
    permissions: ['read', 'write'],
    environment: 'production'
});

// Set API key (hashes automatically)
apiKey.setApiKey('your-secret-api-key');

// Verify API key
const isValid = apiKey.verifyApiKey('provided-key');

// Record usage
apiKey.recordUsage({ endpoint: '/api/tasks', method: 'GET' });
```

## 🌐 Cloudflare Integration

The database is configured to work with Cloudflare proxy for secure external access. See the `infrastructure/cloudflare/` directory for detailed configuration.

### Key Features

- **SSL/TLS Termination**: Cloudflare handles SSL certificates
- **DDoS Protection**: Automatic protection against attacks
- **Access Control**: IP whitelisting and geographic restrictions
- **Rate Limiting**: Configurable rate limits per service
- **Monitoring**: Real-time connection and performance monitoring

### Configuration

```bash
# Enable Cloudflare proxy
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_PROXY_HOSTNAME=db-proxy.your-domain.com

# Cloudflare credentials
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Security settings
CLOUDFLARE_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
CLOUDFLARE_ALLOWED_COUNTRIES=US,CA,GB,DE,FR
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify Cloudflare proxy settings
   - Increase connection timeout values

2. **SSL Certificate Errors**
   - Verify certificate paths
   - Check certificate expiration
   - Ensure proper SSL mode configuration

3. **Pool Exhaustion**
   - Increase pool size
   - Check for connection leaks
   - Monitor connection usage

4. **Slow Queries**
   - Add missing indexes
   - Optimize query structure
   - Use EXPLAIN ANALYZE

### Health Checks

```javascript
// Check database health
const health = connection.getHealth();
console.log('Database status:', health.connected);
console.log('Pool stats:', health.poolStats);
console.log('Query stats:', health.queryStats);

// Check specific table
const result = await connection.query('SELECT COUNT(*) FROM tasks');
console.log('Tasks count:', result.rows[0].count);
```

### Monitoring

Enable monitoring to track:
- Connection pool utilization
- Query performance metrics
- Error rates and types
- SSL certificate expiration
- Cloudflare proxy status

## 📚 API Reference

### Connection Methods

- `getConnection()`: Get singleton connection instance
- `initializeDatabase(config)`: Initialize with optional config
- `query(text, params, options)`: Execute query
- `transaction(callback)`: Execute transaction
- `getHealth()`: Get health status
- `getMetrics()`: Get performance metrics
- `shutdown()`: Graceful shutdown

### Model Methods

Each model provides:
- `validate()`: Validate model data
- `toDatabase()`: Convert to database format
- `fromDatabase(row)`: Create from database row
- `getSummary()`: Get display summary

### Repository Methods

All repositories provide:
- `create(data)`: Create new entity
- `findById(id)`: Find by ID
- `findBy(criteria, options)`: Find by criteria
- `update(id, updates)`: Update entity
- `delete(id)`: Delete entity
- `getStatistics(filters)`: Get statistics

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install pg uuid
   ```

2. **Set Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database settings
   ```

3. **Initialize Database**
   ```javascript
   import { initializeDatabase } from './connection.js';
   const db = await initializeDatabase();
   ```

4. **Run Migrations**
   ```javascript
   import { MigrationRunner } from './migrations/runner.js';
   const runner = new MigrationRunner();
   await runner.runMigrations();
   ```

5. **Start Using Repositories**
   ```javascript
   import { TaskRepository } from './repositories/TaskRepository.js';
   const taskRepo = new TaskRepository();
   const task = await taskRepo.create({ title: 'My first task' });
   ```

## 📈 Performance Benchmarks

Target performance metrics for production:

| Operation | Target | Excellent | Good | Needs Improvement |
|-----------|--------|-----------|------|-------------------|
| Connection Time | < 50ms | < 10ms | < 30ms | > 100ms |
| Simple Query | < 10ms | < 5ms | < 15ms | > 50ms |
| Complex Query | < 100ms | < 50ms | < 150ms | > 500ms |
| CRUD Create | < 50ms | < 20ms | < 80ms | > 200ms |
| CRUD Read | < 20ms | < 10ms | < 40ms | > 100ms |
| CRUD Update | < 50ms | < 25ms | < 80ms | > 200ms |
| CRUD Delete | < 30ms | < 15ms | < 50ms | > 150ms |
| Concurrent Ops | > 100/sec | > 500/sec | > 200/sec | < 50/sec |

Run benchmarks regularly to ensure performance targets are met:

```bash
node -e "
import('./performance/benchmark.js').then(async ({ DatabaseBenchmark }) => {
  const benchmark = new DatabaseBenchmark();
  await benchmark.runBenchmark();
  benchmark.printResults();
});
"
```

## 🤝 Contributing

When contributing to the database layer:

1. **Follow Naming Conventions**: Use snake_case for database columns, camelCase for JavaScript
2. **Add Migrations**: Always create migrations for schema changes
3. **Update Models**: Keep models in sync with database schema
4. **Add Tests**: Include unit and integration tests
5. **Document Changes**: Update this README for significant changes
6. **Performance Test**: Run benchmarks for performance-critical changes

## 📄 License

This database implementation is part of the Claude Task Master project and follows the same licensing terms.

