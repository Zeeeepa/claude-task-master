# Database Schema Enhancement

## Overview

This module implements a comprehensive PostgreSQL database schema for the unified AI CI/CD system. It serves as the central state store for task and workflow management, providing robust data persistence, query optimization, and monitoring capabilities.

## Architecture

### Core Components

- **Connection Management**: Robust PostgreSQL connection pooling using `pg-pool`
- **Schema Design**: Comprehensive database schema supporting all system requirements
- **Migration System**: Version-controlled database migrations using Knex.js
- **Data Models**: Object-oriented data access layer with query builders
- **Performance Monitoring**: Built-in performance metrics and health monitoring
- **Data Integrity**: ACID compliance with referential integrity constraints

### Database Schema

#### Core Tables

1. **users** - User accounts and authentication
2. **workflows** - Workflow definitions and metadata
3. **tasks** - Individual tasks within workflows
4. **components** - System component registration and health
5. **logs** - System and workflow execution logs
6. **configurations** - System configuration and settings

#### Execution Tables

7. **workflow_executions** - Workflow execution instances
8. **task_executions** - Task execution instances
9. **system_metrics** - Performance and monitoring metrics

### Key Features

- **UUID Primary Keys**: All tables use UUID primary keys for distributed system compatibility
- **JSONB Support**: Flexible metadata and configuration storage
- **Array Support**: Native PostgreSQL array support for tags and dependencies
- **Temporal Data**: Comprehensive timestamp tracking with timezone support
- **Indexing Strategy**: Optimized indexes for sub-100ms query performance
- **Constraints**: Data integrity through check constraints and foreign keys

## Installation

### Prerequisites

- PostgreSQL 14+
- Node.js 14+
- npm or yarn

### Dependencies

```bash
npm install pg pg-pool knex
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=claude_task_master
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false

# Connection Pool Settings
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000

# Query Settings
DB_STATEMENT_TIMEOUT=30000
DB_QUERY_TIMEOUT=30000

# Debug Settings
DB_DEBUG=false
DB_SSL_REJECT_UNAUTHORIZED=true
```

## Usage

### Basic Setup

```javascript
import { initializeDatabase, getWorkflowModel, getTaskModel } from './src/database/index.js';

// Initialize database
const db = await initializeDatabase();

// Get model instances
const workflowModel = getWorkflowModel();
const taskModel = getTaskModel();
```

### Creating Workflows

```javascript
const workflow = await workflowModel.createWorkflow({
    name: 'CI/CD Pipeline',
    description: 'Automated CI/CD workflow',
    type: 'ci_cd',
    status: 'draft',
    priority: 5,
    definition: {
        stages: ['validation', 'testing', 'deployment'],
        parallel: true
    },
    configuration: {
        timeout: 3600,
        retries: 3
    },
    environment_variables: {
        NODE_ENV: 'production'
    },
    tags: ['ci-cd', 'automated'],
    created_by: userId
});
```

### Creating Tasks

```javascript
const task = await taskModel.createTask({
    workflow_id: workflow.id,
    name: 'Run Tests',
    description: 'Execute unit tests',
    type: 'testing',
    command: 'npm test',
    parameters: {
        coverage: true,
        reporter: 'json'
    },
    depends_on: [validationTaskId],
    execution_order: 2,
    timeout_seconds: 600,
    created_by: userId
});
```

### Querying Data

```javascript
// Get active workflows
const activeWorkflows = await workflowModel.getActiveWorkflows();

// Get workflow with tasks
const workflowWithTasks = await workflowModel.getWithTasks(workflowId);

// Get runnable tasks
const runnableTasks = await taskModel.getRunnableTasks(workflowId);

// Get workflow progress
const progress = await workflowModel.getProgress(workflowId);
```

### Health Monitoring

```javascript
import { getDatabaseHealth, getDatabaseStatistics } from './src/database/index.js';

// Get health status
const health = await getDatabaseHealth();
console.log('Database status:', health.status);

// Get performance statistics
const stats = await getDatabaseStatistics();
console.log('Database size:', stats.size.database_size);
console.log('Active connections:', stats.connections.active_connections);
```

## Database Schema Details

### Workflows Table

Stores workflow definitions and metadata:

- **Core Fields**: id, name, description, type, status, priority
- **Configuration**: definition (JSONB), configuration (JSONB), environment_variables (JSONB)
- **Metadata**: version, tags (array), metadata (JSONB)
- **Relationships**: created_by, parent_workflow_id
- **Timing**: scheduled_at, started_at, completed_at, timeout_seconds

### Tasks Table

Stores individual tasks within workflows:

- **Core Fields**: id, workflow_id, name, description, type, status, priority
- **Execution**: command, parameters (JSONB), environment (JSONB), working_directory
- **Dependencies**: depends_on (UUID array), execution_order, retry_count, max_retries
- **Results**: result (JSONB), output, error_message, exit_code
- **Timing**: estimated_duration_seconds, started_at, completed_at, timeout_seconds

### Components Table

Tracks system component health and status:

- **Core Fields**: id, name, type, status, version
- **Configuration**: configuration (JSONB), endpoints (JSONB), health_check_url
- **Health**: last_health_check, health_status, performance_metrics (JSONB)
- **Dependencies**: dependencies (array), dependent_components (array)

## Performance Optimization

### Indexing Strategy

The schema includes comprehensive indexing for optimal query performance:

```sql
-- Composite indexes for common queries
CREATE INDEX idx_workflows_status_created_at ON workflows(status, created_at);
CREATE INDEX idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX idx_logs_component_level_timestamp ON logs(component_name, level, timestamp);
```

### Query Optimization

- **Connection Pooling**: Configurable pool size with connection reuse
- **Prepared Statements**: Automatic query preparation for repeated queries
- **JSONB Indexing**: GIN indexes on JSONB columns for fast JSON queries
- **Partial Indexes**: Indexes on filtered data for specific use cases

### Performance Monitoring

Built-in performance monitoring tracks:

- Query execution times
- Connection pool utilization
- Database size and growth
- Index usage statistics
- Slow query detection

## Migration Management

### Running Migrations

```bash
# Install Knex CLI
npm install -g knex

# Run migrations
knex migrate:latest --knexfile src/database/knexfile.js

# Rollback migrations
knex migrate:rollback --knexfile src/database/knexfile.js

# Create new migration
knex migrate:make migration_name --knexfile src/database/knexfile.js
```

### Seeding Data

```bash
# Run seeds
knex seed:run --knexfile src/database/knexfile.js

# Create new seed
knex seed:make seed_name --knexfile src/database/knexfile.js
```

## Testing

### Running Tests

```bash
# Set up test database
createdb claude_task_master_test

# Run database tests
npm test src/database/tests/database.test.js

# Run with coverage
npm run test:coverage -- src/database/tests/
```

### Test Configuration

Tests use a separate test database configuration:

```javascript
const TEST_CONFIG = {
    host: process.env.TEST_DB_HOST || 'localhost',
    database: process.env.TEST_DB_NAME || 'claude_task_master_test',
    // ... other config
};
```

## Backup and Recovery

### Automated Backups

The system supports automated backup procedures:

```javascript
// Enable backups in configuration
await query(`
    INSERT INTO configurations (key, value, type, description)
    VALUES ('backup.enabled', 'true', 'system', 'Enable automated backups')
`);
```

### Manual Backup

```bash
# Create backup
pg_dump claude_task_master > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql claude_task_master < backup_file.sql
```

## Monitoring and Alerting

### Health Checks

The database provides comprehensive health monitoring:

```javascript
const health = await getDatabaseHealth();
// Returns: { status, timestamp, poolStats, models: { workflows, tasks, ... } }
```

### Performance Metrics

Track key performance indicators:

- Query response times (target: < 100ms average)
- Connection pool efficiency (target: > 95%)
- Database availability (target: > 99.9%)
- Data consistency validation (target: 100%)

### Alerting

Set up monitoring alerts for:

- Slow queries (> 1000ms)
- High connection usage (> 80% of pool)
- Failed health checks
- Disk space usage (> 90%)

## Security Considerations

### Access Control

- Use dedicated database users with minimal privileges
- Enable SSL/TLS for production connections
- Implement connection string encryption
- Regular security audits and updates

### Data Protection

- Sensitive configuration marked with `is_sensitive` flag
- Audit trails for all data modifications
- Backup encryption for production data
- Regular vulnerability assessments

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify connection pool settings
   - Monitor database load

2. **Slow Queries**
   - Review query execution plans
   - Check index usage
   - Consider query optimization

3. **Migration Failures**
   - Verify database permissions
   - Check for data conflicts
   - Review migration scripts

### Debug Mode

Enable debug logging:

```env
DB_DEBUG=true
```

This will log all SQL queries and performance metrics.

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up local PostgreSQL database
4. Copy `.env.example` to `.env` and configure
5. Run migrations: `knex migrate:latest`
6. Run seeds: `knex seed:run`
7. Run tests: `npm test`

### Code Standards

- Follow ESLint configuration
- Write comprehensive tests for new features
- Document all public APIs
- Use TypeScript-style JSDoc comments

## License

This database implementation is part of the Claude Task Master project and follows the same licensing terms.

