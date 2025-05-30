# Database Schema Documentation

## Overview

This directory contains the comprehensive database schema for the Claude Task Master system, designed to support task composition, workflow orchestration, and dependency management. The schema is built for PostgreSQL and leverages advanced features like JSONB, full-text search, and recursive queries.

## Schema Files

### 1. `tasks.sql` - Task Management Schema
Contains the core task management tables and related functionality:

- **`tasks`** - Main tasks table with hierarchical support
- **`subtasks`** - Subtask management for task decomposition
- **`task_files`** - Generated files and content associated with tasks

**Key Features:**
- Hierarchical task structure with parent-child relationships
- JSONB fields for flexible metadata, requirements, and context
- Full-text search capabilities
- Automatic timestamp management
- Comprehensive indexing for performance

### 2. `workflows.sql` - Workflow Management Schema
Defines workflow orchestration and execution tracking:

- **`workflows`** - Main workflow definitions
- **`workflow_executions`** - Execution history and tracking
- **`workflow_steps`** - Individual workflow step definitions
- **`workflow_step_executions`** - Step-level execution tracking

**Key Features:**
- Multiple trigger types (manual, scheduled, webhook, event-driven)
- Execution statistics and performance tracking
- Step-based workflow definition
- Resource usage monitoring
- Automatic execution statistics updates

### 3. `dependencies.sql` - Dependency Management Schema
Manages task dependencies and external resource requirements:

- **`task_dependencies`** - Task-to-task dependencies
- **`external_dependencies`** - External service/resource dependencies
- **`dependency_validations`** - Dependency validation history
- **`dependency_resolution_rules`** - Complex dependency logic

**Key Features:**
- Multiple dependency types (blocks, requires, suggests)
- Circular dependency detection
- External dependency validation
- Automatic dependency status updates
- Conditional dependency support

### 4. `001_task_components.sql` - Comprehensive Migration
Complete migration script that creates all tables, indexes, triggers, and views in the correct order.

## Database Design Principles

### 1. **Flexibility with Structure**
- Uses JSONB fields for flexible metadata while maintaining structured core fields
- Supports both rigid constraints and flexible data storage
- Allows for future extensibility without schema changes

### 2. **Performance Optimization**
- Comprehensive indexing strategy including GIN indexes for JSONB fields
- Full-text search indexes for content discovery
- Optimized queries with proper foreign key relationships
- Materialized views for complex aggregations

### 3. **Data Integrity**
- Foreign key constraints ensure referential integrity
- Check constraints validate data ranges and formats
- Triggers maintain data consistency
- Circular dependency prevention

### 4. **Audit and Tracking**
- Automatic timestamp management (created_at, updated_at)
- Comprehensive execution tracking
- Performance metrics collection
- Complete audit trail through workflow events

## Key Tables and Relationships

```
workflows (1) ──→ (n) tasks
    │                 │
    │                 ├── (n) subtasks
    │                 ├── (n) task_files
    │                 ├── (n) task_dependencies
    │                 └── (n) external_dependencies
    │
    ├── (n) workflow_executions
    └── (n) workflow_steps
            │
            └── (n) workflow_step_executions
```

## Custom Types

### Task Status
```sql
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed'
);
```

### Workflow Status
```sql
CREATE TYPE workflow_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed',
    'failed'
);
```

### Dependency Types
```sql
CREATE TYPE dependency_type AS ENUM (
    'blocks',      -- Blocking dependency
    'requires',    -- Required dependency
    'suggests'     -- Suggested dependency
);
```

## Views and Queries

### Active Tasks View
Shows currently active tasks with subtask and file counts:
```sql
SELECT * FROM active_tasks WHERE status IN ('pending', 'in_progress');
```

### Task Dependency Summary
Provides dependency status for each task:
```sql
SELECT * FROM task_dependency_summary WHERE all_dependencies_satisfied = true;
```

### Workflow Execution Summary
Shows workflow execution progress and metrics:
```sql
SELECT * FROM workflow_execution_summary WHERE completion_percentage > 50;
```

## Triggers and Functions

### Automatic Timestamp Updates
All tables with `updated_at` fields automatically update timestamps on modification.

### Circular Dependency Prevention
The `check_circular_dependency()` function prevents circular task dependencies.

### Dependency Status Updates
When tasks complete or fail, dependent task statuses are automatically updated.

### Workflow Statistics
Execution counts and success rates are automatically maintained.

## Indexing Strategy

### Performance Indexes
- Primary keys (UUID) with B-tree indexes
- Foreign keys for join optimization
- Status fields for filtering
- Timestamp fields for temporal queries

### Search Indexes
- GIN indexes on JSONB fields for metadata queries
- Full-text search indexes on title and description fields
- Trigram indexes for fuzzy text matching

### Composite Indexes
- Multi-column indexes for common query patterns
- Unique constraints on business logic combinations

## Usage Examples

### Creating a Workflow with Tasks
```sql
-- Create workflow
INSERT INTO workflows (name, description, status) 
VALUES ('Data Processing Pipeline', 'ETL workflow for data processing', 'active');

-- Create main task
INSERT INTO tasks (title, workflow_id, priority, requirements) 
VALUES ('Extract Data', workflow_id, 5, '{"source": "database", "format": "json"}');

-- Create subtasks
INSERT INTO subtasks (parent_task_id, title, order_index) 
VALUES (task_id, 'Validate Data Schema', 0);
```

### Querying Task Hierarchy
```sql
-- Get complete task hierarchy
SELECT * FROM task_hierarchy WHERE id = 'task-uuid';

-- Get ready tasks (no blocking dependencies)
SELECT t.* FROM tasks t
LEFT JOIN task_dependencies td ON t.id = td.task_id
WHERE t.status = 'pending'
AND NOT EXISTS (
    SELECT 1 FROM task_dependencies td2 
    WHERE td2.task_id = t.id 
    AND td2.status != 'satisfied'
    AND td2.dependency_type = 'blocks'
);
```

### Workflow Performance Analysis
```sql
-- Get workflow performance metrics
SELECT 
    w.name,
    w.execution_count,
    ROUND((w.success_count::DECIMAL / w.execution_count) * 100, 2) as success_rate,
    AVG(EXTRACT(EPOCH FROM we.duration)) as avg_duration_seconds
FROM workflows w
JOIN workflow_executions we ON w.id = we.workflow_id
WHERE we.status = 'completed'
GROUP BY w.id, w.name, w.execution_count, w.success_count;
```

## Migration and Deployment

### Running Migrations
```bash
# Run the comprehensive migration
npm run db:migrate

# Check migration status
npm run db:status

# Rollback if needed
npm run db:rollback
```

### Environment Variables
Required environment variables for database connection:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=password
DB_SSL_MODE=require  # for production
```

### Performance Tuning
Recommended PostgreSQL settings for optimal performance:
```sql
-- Increase work memory for complex queries
SET work_mem = '256MB';

-- Enable parallel queries
SET max_parallel_workers_per_gather = 4;

-- Optimize for JSONB operations
SET gin_pending_list_limit = '4MB';
```

## Monitoring and Maintenance

### Health Checks
```sql
-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
    indexrelname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Backup Strategy
```bash
# Full database backup
pg_dump -h localhost -U software_developer -d codegen-taskmaster-db > backup.sql

# Schema-only backup
pg_dump -h localhost -U software_developer -d codegen-taskmaster-db --schema-only > schema.sql

# Data-only backup
pg_dump -h localhost -U software_developer -d codegen-taskmaster-db --data-only > data.sql
```

## Security Considerations

### Access Control
- Use role-based access control (RBAC)
- Limit database user permissions
- Enable row-level security where appropriate

### Data Protection
- Encrypt sensitive data in JSONB fields
- Use SSL/TLS for database connections
- Regular security audits and updates

### Audit Logging
- Enable PostgreSQL audit logging
- Track schema changes
- Monitor unusual query patterns

## Future Enhancements

### Planned Features
1. **Partitioning** - Implement table partitioning for large datasets
2. **Replication** - Set up read replicas for scaling
3. **Archiving** - Implement data archiving for completed workflows
4. **Analytics** - Add specialized analytics tables and views

### Extension Points
- Custom dependency validation functions
- Workflow step plugins
- Custom metadata schemas
- Integration with external systems

## Troubleshooting

### Common Issues
1. **Circular Dependencies** - Check dependency graph visualization
2. **Performance Issues** - Analyze query plans and index usage
3. **Lock Contention** - Monitor long-running transactions
4. **Storage Growth** - Implement data retention policies

### Debug Queries
```sql
-- Find circular dependencies
WITH RECURSIVE dep_chain AS (
    SELECT task_id, depends_on_task_id, 1 as level, ARRAY[task_id] as path
    FROM task_dependencies
    UNION ALL
    SELECT td.task_id, td.depends_on_task_id, dc.level + 1, dc.path || td.task_id
    FROM task_dependencies td
    JOIN dep_chain dc ON td.depends_on_task_id = dc.task_id
    WHERE td.task_id != ALL(dc.path) AND dc.level < 10
)
SELECT * FROM dep_chain WHERE task_id = ANY(path[2:]);

-- Find slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

This schema provides a robust foundation for the Claude Task Master system with excellent performance, flexibility, and maintainability characteristics.

