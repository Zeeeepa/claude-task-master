# PostgreSQL Database Schema for Task Orchestration

This directory contains the complete PostgreSQL database implementation for the Claude Task Master AI-driven CI/CD system. The database supports atomic task management, complex dependency graphs, workflow state tracking, and comprehensive audit trails.

## 🏗️ Architecture Overview

The database schema is designed to support:

- **Atomic Task Structure**: Highly granular, discrete functionality modules
- **Dependency Management**: Complex dependency graphs with cycle detection
- **State Tracking**: Comprehensive workflow state management
- **Audit Trail**: Complete history of task modifications and state changes
- **Performance Optimization**: Proper indexing for high-frequency queries (<100ms requirement)
- **Dual Mode Operation**: Seamless switching between local JSON and PostgreSQL backends

## 📁 Directory Structure

```
database/
├── schemas/                 # Database schema definitions
│   ├── 001_initial_schema.sql
│   └── 002_triggers_and_functions.sql
├── migrations/              # Version-controlled schema evolution
│   ├── migration-runner.js
│   └── [version]_[name].sql
├── config/                  # Database configuration and connection management
│   ├── database.js
│   └── data-access-layer.js
├── scripts/                 # Utility scripts
│   └── migrate-json-to-postgres.js
├── seeds/                   # Sample data for development/testing
│   └── 001_sample_data.sql
└── README.md               # This file
```

## 🗄️ Database Schema

### Core Tables

#### 1. `tasks` - Core task information with atomic granularity
- **Primary Key**: `id` (UUID)
- **Legacy Support**: `legacy_id` (INTEGER) for migration from JSON system
- **Key Features**:
  - Full-text search with `search_vector` (tsvector)
  - JSONB fields for flexible requirements and metadata
  - Hierarchical structure with `parent_task_id`
  - Audit fields with versioning
  - Complexity estimation and tracking

#### 2. `task_dependencies` - Task relationship and dependency mapping
- **Cycle Detection**: Automatic prevention of circular dependencies
- **Dependency Types**: blocks, suggests, related
- **Referential Integrity**: Cascading deletes

#### 3. `workflow_states` - Current state tracking for each task/PR
- **State Transitions**: Automatic duration calculation
- **State Types**: created, planning, development, testing, review, deployment, completed, failed, cancelled
- **Metadata**: Flexible JSONB for state-specific data

#### 4. `deployment_scripts` - Reusable deployment and setup scripts
- **Multi-Language Support**: bash, python, node, sql
- **Environment Targeting**: development, staging, production
- **Dependency Management**: Script dependencies and execution order
- **Security**: Required permissions and environment variables

#### 5. `error_logs` - Comprehensive error tracking and analysis
- **Severity Levels**: low, medium, high, critical
- **Context Capture**: Request context, environment info
- **Resolution Tracking**: Auto-resolution and manual resolution
- **Retry Logic**: Retry count and failure analysis

#### 6. `pr_metadata` - GitHub PR information and status tracking
- **PR Lifecycle**: draft, open, merged, closed, conflict
- **Integration Data**: commits, files changed, additions/deletions
- **Review Status**: checks, reviews, merge status
- **Automation**: Auto-merge configuration

#### 7. `linear_sync` - Linear ticket synchronization data
- **Bidirectional Sync**: to_linear, from_linear, bidirectional
- **Conflict Resolution**: Sync status and error tracking
- **Metadata Preservation**: Linear-specific fields and URLs

### Supporting Tables

- **`task_pr_relationships`**: Many-to-many mapping between tasks and PRs
- **`deployment_executions`**: Execution history for deployment scripts
- **`audit_log`**: Comprehensive audit trail for all table changes
- **`schema_migrations`**: Migration tracking and versioning

## 🚀 Getting Started

### Prerequisites

- PostgreSQL 12+ with extensions:
  - `uuid-ossp` (UUID generation)
  - `pg_trgm` (Full-text search)
  - `btree_gin` (Advanced indexing)
- Node.js 18+ with ES modules support

### Environment Configuration

Create a `.env` file with the following variables:

```bash
# Database Mode Selection
DATABASE_MODE=postgres  # or 'local' for JSON file mode

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen_taskmaster_db
DB_USER=software_developer
DB_PASSWORD=password
DB_SSL=false

# Cloudflare Database Proxy (Optional)
CLOUDFLARE_DB_PROXY=false
CLOUDFLARE_DB_URL=your-cloudflare-proxy-url
CLOUDFLARE_DB_TOKEN=your-cloudflare-token

# Connection Pool Configuration
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000
```

### Database Setup

1. **Create Database**:
   ```sql
   CREATE DATABASE codegen_taskmaster_db;
   CREATE USER software_developer WITH PASSWORD 'password';
   GRANT ALL PRIVILEGES ON DATABASE codegen_taskmaster_db TO software_developer;
   ```

2. **Initialize Schema**:
   ```bash
   # Apply initial schema
   psql -d codegen_taskmaster_db -f database/schemas/001_initial_schema.sql
   psql -d codegen_taskmaster_db -f database/schemas/002_triggers_and_functions.sql
   
   # Or use the migration runner
   node database/migrations/migration-runner.js
   ```

3. **Load Sample Data** (Optional):
   ```bash
   psql -d codegen_taskmaster_db -f database/seeds/001_sample_data.sql
   ```

### Migration from JSON

If you have existing `tasks.json` data:

```bash
# Dry run to see what would be migrated
node database/scripts/migrate-json-to-postgres.js --dry-run

# Perform actual migration
node database/scripts/migrate-json-to-postgres.js

# Migration with custom options
node database/scripts/migrate-json-to-postgres.js tasks/custom-tasks.json --no-backup
```

## 🔧 Usage

### Data Access Layer

The system provides a unified interface that works with both JSON and PostgreSQL backends:

```javascript
import { TaskDataAccess } from './database/config/data-access-layer.js';

const taskDA = new TaskDataAccess();

// Works in both local and postgres modes
const tasks = await taskDA.getTasks({ status: 'pending' });
const task = await taskDA.getTaskById(123);
const newTask = await taskDA.createTask({
    title: 'New Task',
    description: 'Task description',
    status: 'pending',
    priority: 'high'
});
```

### Database Operations

```javascript
import { initializeDatabase, query, transaction } from './database/config/database.js';

// Initialize connection
await initializeDatabase();

// Simple query
const result = await query('SELECT * FROM tasks WHERE status = $1', ['pending']);

// Transaction
await transaction(async (client) => {
    await client.query('INSERT INTO tasks ...');
    await client.query('INSERT INTO task_dependencies ...');
});
```

### Health Monitoring

```javascript
import { healthCheck, getDatabaseStats } from './database/config/database.js';

// Check database health
const health = await healthCheck();
console.log(health);
// { status: 'healthy', mode: 'postgres', responseTime: 15, poolSize: 5 }

// Get database statistics
const stats = await getDatabaseStats();
console.log(stats);
```

## 🔍 Performance Optimization

### Indexing Strategy

The schema includes comprehensive indexing for common query patterns:

- **Single Column Indexes**: status, priority, created_at, etc.
- **Composite Indexes**: (status, priority), (task_id, state), etc.
- **GIN Indexes**: Full-text search, JSONB fields, arrays
- **Partial Indexes**: For filtered queries on large tables

### Query Performance

- **Target**: <100ms for common queries
- **Monitoring**: Automatic slow query logging
- **Optimization**: Query plan analysis and index recommendations

### Connection Pooling

- **Pool Size**: Configurable (default: 2-20 connections)
- **Health Checks**: Automatic connection validation
- **Failover**: Graceful error handling and retry logic

## 🔐 Security Features

### Row-Level Security (RLS)

```sql
-- Example RLS policy (to be implemented based on requirements)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_access_policy ON tasks
    FOR ALL TO application_role
    USING (created_by = current_user OR 'admin' = ANY(current_user_roles()));
```

### Audit Trail

All changes are automatically tracked in the `audit_log` table:

- **What Changed**: Field-level change tracking
- **Who Changed It**: User identification
- **When**: Precise timestamps
- **Context**: Session, IP, user agent information

### Data Validation

- **Constraint Checks**: Database-level validation
- **Trigger Validation**: Complex business rules
- **Application Validation**: Input sanitization and validation

## 🧪 Testing Strategy

### Schema Validation

```bash
# Validate migration integrity
node -e "
import { validateMigrations } from './database/migrations/migration-runner.js';
console.log(await validateMigrations());
"
```

### Performance Testing

```bash
# Load testing with realistic data volumes
npm run test:performance

# Query performance analysis
EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'pending';
```

### Data Integrity

```bash
# Check referential integrity
npm run test:integrity

# Validate constraint enforcement
npm run test:constraints
```

## 📊 Monitoring and Maintenance

### Database Statistics

```sql
-- Table statistics
SELECT * FROM pg_stat_user_tables ORDER BY n_tup_ins DESC;

-- Index usage
SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan DESC;

-- Query performance
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC;
```

### Maintenance Tasks

```bash
# Vacuum and analyze
VACUUM ANALYZE;

# Reindex if needed
REINDEX DATABASE codegen_taskmaster_db;

# Update statistics
ANALYZE;
```

### Backup Strategy

```bash
# Automated backup
node -e "
import { backupDatabase } from './database/config/database.js';
console.log(await backupDatabase());
"

# Manual PostgreSQL backup
pg_dump codegen_taskmaster_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 🔄 Migration Management

### Creating New Migrations

```bash
# Create new migration file
node database/migrations/migration-runner.js create "Add new feature table"
```

### Running Migrations

```bash
# Check migration status
node -e "
import { getMigrationStatus } from './database/migrations/migration-runner.js';
console.log(await getMigrationStatus());
"

# Run pending migrations
node -e "
import { runMigrations } from './database/migrations/migration-runner.js';
console.log(await runMigrations());
"
```

### Rollback (Use with Caution)

```bash
# Rollback last migration
node -e "
import { rollbackLastMigration } from './database/migrations/migration-runner.js';
console.log(await rollbackLastMigration());
"
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection Failures**:
   - Check PostgreSQL service status
   - Verify connection parameters
   - Check firewall settings

2. **Performance Issues**:
   - Analyze slow query log
   - Check index usage
   - Monitor connection pool

3. **Migration Errors**:
   - Validate schema integrity
   - Check for data conflicts
   - Review migration logs

### Debug Mode

```bash
# Enable debug logging
DEBUG=database:* node your-app.js

# Query logging
export PGDEBUG=1
```

## 🤝 Contributing

When contributing to the database schema:

1. **Always create migrations** for schema changes
2. **Update documentation** for new features
3. **Add appropriate indexes** for new queries
4. **Include audit triggers** for new tables
5. **Test thoroughly** with realistic data volumes

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Driver](https://node-postgres.com/)
- [Database Design Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)
- [Performance Tuning Guide](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

For questions or issues, please refer to the main project documentation or create an issue in the repository.

