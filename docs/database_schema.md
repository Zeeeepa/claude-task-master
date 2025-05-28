# PostgreSQL Database Schema Documentation

## Overview

This document describes the comprehensive PostgreSQL database schema for the AI CI/CD task management system. The schema is designed for scalability, security, and integration with Cloudflare for secure external access.

## Architecture

### Core Design Principles

1. **Scalability**: Optimized for high-throughput operations with proper indexing and connection pooling
2. **Security**: Row-level security, API key authentication, and encrypted sensitive data
3. **Extensibility**: JSONB fields and flexible schema design for future AI workflow requirements
4. **Data Integrity**: Comprehensive constraints and validation for task dependencies
5. **Auditability**: Complete audit trail for all database changes

### Database Configuration

- **Engine**: PostgreSQL 13+
- **Extensions**: uuid-ossp, pgcrypto, pg_stat_statements
- **Connection Pooling**: Multiple pools for different operation types
- **Backup Strategy**: Automated backup with point-in-time recovery

## Schema Overview

### Core Tables

#### 1. tasks
Primary table for storing all task information.

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
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
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

**Key Features:**
- UUID primary keys for distributed systems
- JSONB fields for flexible metadata storage
- Hierarchical task relationships via parent_task_id
- Automatic timestamp management with triggers
- Comprehensive constraints for data validation

#### 2. task_contexts
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

**Context Types:**
- `requirement`: Task requirements and specifications
- `codebase`: Code-related context and file information
- `ai_interaction`: AI processing results and interactions
- `validation`: Validation results and feedback
- `workflow`: Workflow state and progress information
- `status_change`: Status change history
- `completion`: Task completion details
- `dependency_parent`: Parent dependency information
- `dependency_child`: Child dependency information
- `error`: Error context and debugging information
- `performance`: Performance metrics and timing data

#### 3. deployment_scripts
Manages CI/CD deployment scripts and execution tracking.

```sql
CREATE TABLE deployment_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    script_name VARCHAR(255) NOT NULL,
    script_type VARCHAR(50) NOT NULL,
    script_content TEXT NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'development',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    parameters JSONB DEFAULT '{}'::jsonb,
    execution_order INTEGER DEFAULT 0,
    timeout_seconds INTEGER DEFAULT 300,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_duration_ms INTEGER,
    exit_code INTEGER,
    stdout_log TEXT,
    stderr_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Script Types:**
- `build`: Build scripts and compilation
- `test`: Testing and validation scripts
- `deploy`: Deployment and installation scripts
- `rollback`: Rollback and recovery scripts
- `migration`: Database and schema migrations
- `validation`: Post-deployment validation
- `cleanup`: Cleanup and maintenance scripts

#### 4. error_logs
Comprehensive error tracking and resolution system.

```sql
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    deployment_script_id UUID REFERENCES deployment_scripts(id) ON DELETE SET NULL,
    workflow_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
    error_type VARCHAR(50) NOT NULL,
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}'::jsonb,
    stack_trace TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    source_component VARCHAR(100),
    source_file VARCHAR(255),
    source_line INTEGER,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Error Types:**
- `validation`: Input validation errors
- `compilation`: Code compilation errors
- `runtime`: Runtime execution errors
- `network`: Network connectivity errors
- `database`: Database operation errors
- `authentication`: Authentication failures
- `authorization`: Permission denied errors
- `timeout`: Operation timeout errors
- `resource`: Resource exhaustion errors
- `configuration`: Configuration errors

#### 5. webhook_events
External system integration via webhooks.

```sql
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_source VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    headers JSONB DEFAULT '{}'::jsonb,
    signature VARCHAR(255),
    signature_verified BOOLEAN DEFAULT FALSE,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_attempts INTEGER DEFAULT 0,
    max_processing_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    response_status INTEGER,
    response_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Event Types:**
- `task_created`, `task_updated`, `task_completed`, `task_failed`
- `deployment_started`, `deployment_completed`, `deployment_failed`
- `pr_created`, `pr_updated`, `pr_merged`, `pr_closed`
- `build_started`, `build_completed`, `build_failed`
- `test_started`, `test_completed`, `test_failed`

### Security Tables

#### 6. api_keys
API authentication and authorization management.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,
    allowed_ips JSONB DEFAULT '[]'::jsonb,
    allowed_endpoints JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Permission Types:**
- `read:tasks`: Read task information
- `write:tasks`: Create and update tasks
- `read:metrics`: Access system metrics
- `admin`: Full administrative access

#### 7. api_access_logs
Security monitoring and access logging.

```sql
CREATE TABLE api_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id VARCHAR(255),
    api_key_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    execution_time_ms INTEGER,
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Monitoring Tables

#### 8. system_metrics
System performance and health metrics.

```sql
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    dimensions JSONB DEFAULT '{}'::jsonb,
    aggregation_period VARCHAR(20) DEFAULT 'instant',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Metric Categories:**
- `database`: Database performance metrics
- `api`: API performance and usage metrics
- `task_processing`: Task execution metrics
- `deployment`: Deployment performance metrics
- `error_rate`: Error rate and failure metrics
- `performance`: General performance metrics
- `security`: Security-related metrics
- `resource_usage`: System resource utilization

#### 9. configuration_settings
Dynamic system configuration management.

```sql
CREATE TABLE configuration_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    is_sensitive BOOLEAN DEFAULT FALSE,
    environment VARCHAR(50) DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);
```

## Materialized Views

### task_dependency_tree
Efficient task dependency resolution using recursive CTE.

```sql
CREATE MATERIALIZED VIEW task_dependency_tree AS
WITH RECURSIVE dependency_tree AS (
    -- Base case: tasks with no dependencies
    SELECT 
        t.id, t.title, t.status, t.priority,
        0 as depth, ARRAY[t.id] as path, t.id as root_task_id
    FROM tasks t
    WHERE NOT EXISTS (
        SELECT 1 FROM task_dependencies td 
        WHERE td.child_task_id = t.id AND td.dependency_type = 'depends_on'
    )
    
    UNION ALL
    
    -- Recursive case: tasks that depend on others
    SELECT 
        t.id, t.title, t.status, t.priority,
        dt.depth + 1, dt.path || t.id, dt.root_task_id
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.child_task_id
    JOIN dependency_tree dt ON td.parent_task_id = dt.id
    WHERE td.dependency_type = 'depends_on'
    AND NOT t.id = ANY(dt.path) -- Prevent cycles
)
SELECT * FROM dependency_tree;
```

### task_performance_summary
Performance analytics for tasks and deployments.

```sql
CREATE MATERIALIZED VIEW task_performance_summary AS
SELECT 
    t.id, t.title, t.status, t.complexity_score,
    t.estimated_hours, t.actual_hours,
    CASE 
        WHEN t.estimated_hours > 0 THEN (t.actual_hours / t.estimated_hours) * 100
        ELSE NULL 
    END as accuracy_percentage,
    COUNT(el.id) as error_count,
    COUNT(ds.id) as deployment_script_count,
    COUNT(CASE WHEN ds.status = 'completed' THEN 1 END) as successful_deployments,
    COUNT(CASE WHEN ds.status = 'failed' THEN 1 END) as failed_deployments,
    AVG(ds.execution_duration_ms) as avg_deployment_duration_ms,
    t.created_at, t.updated_at, t.completed_at
FROM tasks t
LEFT JOIN error_logs el ON t.id = el.task_id
LEFT JOIN deployment_scripts ds ON t.id = ds.task_id
GROUP BY t.id, t.title, t.status, t.complexity_score, 
         t.estimated_hours, t.actual_hours, 
         t.created_at, t.updated_at, t.completed_at;
```

## Security Features

### Row Level Security (RLS)

RLS policies are implemented for multi-tenant access control:

```sql
-- Enable RLS on sensitive tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_settings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY api_keys_user_policy ON api_keys
    FOR ALL TO authenticated_users
    USING (user_id = current_setting('app.current_user_id', true));

-- Users can only see their own access logs
CREATE POLICY api_access_logs_user_policy ON api_access_logs
    FOR SELECT TO authenticated_users
    USING (user_id = current_setting('app.current_user_id', true));
```

### Database Roles

```sql
-- Application roles with specific permissions
CREATE ROLE authenticated_users;
CREATE ROLE api_users;
CREATE ROLE readonly_users;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON tasks, task_contexts, workflow_states TO api_users;
GRANT SELECT, INSERT, UPDATE ON deployment_scripts, error_logs, webhook_events TO api_users;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_users;
```

## Performance Optimization

### Indexing Strategy

Comprehensive indexing for optimal query performance:

```sql
-- Tasks table indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX idx_tasks_assigned_status ON tasks(assigned_to, status);

-- JSONB indexes for metadata queries
CREATE INDEX idx_tasks_tags_gin ON tasks USING GIN(tags);
CREATE INDEX idx_tasks_requirements_gin ON tasks USING GIN(requirements);
```

### Connection Pooling

Multiple connection pools for different operation types:

- **Primary Pool**: General operations (2-10 connections)
- **Read-Only Pool**: Analytics and reporting (1-5 connections)
- **Priority Pool**: Critical operations (1-3 connections)
- **Background Pool**: Background tasks (1-2 connections)

## Cloudflare Integration

### Security Configuration

```javascript
// Cloudflare Access policies
const accessPolicies = {
    admin: {
        name: 'Database Admin Access',
        decision: 'allow',
        rules: [{ type: 'email_domain', values: ['company.com'] }]
    },
    api: {
        name: 'Database API Access',
        decision: 'allow',
        rules: [{ type: 'service_token', values: ['token1', 'token2'] }]
    }
};

// Rate limiting configuration
const rateLimiting = {
    api: { threshold: 100, period: 60, action: 'block' },
    database: { threshold: 50, period: 60, action: 'challenge' },
    burst: { threshold: 20, period: 10, action: 'block' }
};
```

### WAF Rules

Custom Web Application Firewall rules for database protection:

```javascript
const wafRules = [
    {
        name: 'Block SQL injection attempts',
        expression: '(http.request.body contains "UNION") or (http.request.uri.query contains "UNION")',
        action: 'block'
    },
    {
        name: 'Block unauthorized database access',
        expression: '(http.request.uri.path contains "/api/database" and not any(http.request.headers["authorization"][*] contains "Bearer"))',
        action: 'block'
    }
];
```

## API Endpoints

### Authentication

All API endpoints require authentication via API key:

```http
GET /api/database/health
Authorization: Bearer ctm_your_api_key_here
```

### Core Endpoints

#### Tasks Management

```http
# Get tasks with filtering and pagination
GET /api/database/tasks?status=pending&page=1&limit=20

# Get task details
GET /api/database/tasks/{id}

# Create new task
POST /api/database/tasks
Content-Type: application/json
{
    "title": "Implement feature X",
    "description": "Detailed description",
    "priority": 5,
    "assigned_to": "developer@company.com"
}

# Update task status
PATCH /api/database/tasks/{id}/status
Content-Type: application/json
{
    "status": "in_progress",
    "notes": "Started working on implementation"
}
```

#### System Monitoring

```http
# Health check
GET /api/database/health

# System metrics
GET /api/database/metrics

# Custom query (admin only)
POST /api/database/query
Content-Type: application/json
{
    "sql": "SELECT COUNT(*) FROM tasks WHERE status = 'pending'",
    "pool": "readonly"
}
```

## Maintenance Procedures

### Automated Cleanup

```sql
-- Clean up old logs (runs daily)
SELECT cleanup_old_logs(90); -- 90 days retention

-- Refresh materialized views (runs hourly)
SELECT refresh_materialized_views();
```

### Backup Strategy

1. **Continuous WAL Archiving**: Real-time transaction log backup
2. **Daily Full Backups**: Complete database backup with compression
3. **Point-in-Time Recovery**: Ability to restore to any point in time
4. **Cross-Region Replication**: Disaster recovery with geographic distribution

### Monitoring Alerts

- Connection pool exhaustion
- Slow query detection (>5 seconds)
- High error rate (>5% in 5 minutes)
- Disk space usage (>80%)
- Replication lag (>30 seconds)

## Migration Guide

### From Version 1.0 to 2.0

1. **Run Migration Script**:
   ```bash
   psql -d taskmaster -f src/ai_cicd_system/database/migrations/002_enhanced_cicd_schema.sql
   ```

2. **Update Application Configuration**:
   ```javascript
   // Update connection pool settings
   const poolConfig = {
       min: 2,
       max: 20,
       acquireTimeoutMillis: 30000
   };
   ```

3. **Configure Cloudflare**:
   ```bash
   # Deploy Cloudflare configuration
   terraform apply -var-file="cloudflare.tfvars"
   ```

4. **Verify Migration**:
   ```sql
   SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC;
   ```

## Troubleshooting

### Common Issues

1. **Connection Pool Exhaustion**:
   - Check pool configuration
   - Monitor connection usage patterns
   - Increase pool size if necessary

2. **Slow Queries**:
   - Review query execution plans
   - Check index usage
   - Consider query optimization

3. **High Memory Usage**:
   - Monitor JSONB field sizes
   - Implement data archiving
   - Optimize materialized views

4. **Replication Lag**:
   - Check network connectivity
   - Monitor disk I/O
   - Verify replication configuration

### Performance Tuning

```sql
-- Analyze query performance
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Monitor connection usage
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;
```

## Best Practices

1. **Use Transactions**: Always use transactions for multi-table operations
2. **Parameterized Queries**: Prevent SQL injection with parameterized queries
3. **Connection Pooling**: Use appropriate pool for operation type
4. **Error Handling**: Implement comprehensive error handling and logging
5. **Monitoring**: Set up proactive monitoring and alerting
6. **Security**: Follow principle of least privilege for database access
7. **Backup Testing**: Regularly test backup and recovery procedures
8. **Performance Monitoring**: Continuously monitor and optimize query performance

## Support and Maintenance

For support and maintenance questions:

1. Check the troubleshooting section above
2. Review system metrics and logs
3. Consult the API documentation
4. Contact the development team with specific error details

---

*This documentation is maintained as part of the AI CI/CD system and should be updated with any schema changes.*

