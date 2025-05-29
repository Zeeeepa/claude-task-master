# PostgreSQL Schema Documentation for AI-Driven CI/CD Task Orchestration

## Overview

This document provides comprehensive documentation for the PostgreSQL database schema designed for AI-driven CI/CD task orchestration. The schema supports high-performance operations (1000+ concurrent operations with <100ms query performance), enterprise-grade security, and comprehensive audit logging.

## Architecture Principles

### Performance-First Design
- **Partial Indexes**: Optimized for active records only
- **JSONB Storage**: Flexible metadata with GIN indexes
- **Connection Pooling**: Efficient resource management
- **Query Optimization**: Sub-100ms response times

### Security & Compliance
- **SSL/TLS Encryption**: All connections encrypted
- **Role-Based Access Control**: Granular permissions
- **Audit Logging**: Comprehensive change tracking
- **Data Classification**: Security level tagging

### Scalability & Reliability
- **Zero-Downtime Migrations**: Safe schema evolution
- **Automated Triggers**: State management
- **Performance Monitoring**: Real-time metrics
- **Backup & Recovery**: Automated procedures

## Core Tables

### 1. Workflows Table

**Purpose**: Track end-to-end development workflows from requirement to deployment.

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    workflow_type VARCHAR(50) NOT NULL DEFAULT 'ci_cd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    configuration JSONB DEFAULT '{}'::jsonb,
    environment VARCHAR(50) DEFAULT 'development',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    parent_workflow_id UUID REFERENCES workflows(id),
    triggered_by VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);
```

**Key Features**:
- Hierarchical workflow support via `parent_workflow_id`
- Flexible configuration storage in JSONB
- Duration tracking for performance analysis
- Environment-specific execution

**Indexes**:
- `idx_workflows_status` - Active workflow queries
- `idx_workflows_type_status` - Type-based filtering
- `idx_workflows_priority_status` - Priority ordering
- `idx_workflows_tags_gin` - Tag-based searches

### 2. Agent Sessions Table

**Purpose**: Manage AI agent communication sessions and state.

```sql
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    agent_version VARCHAR(50),
    agent_type VARCHAR(50) NOT NULL DEFAULT 'ai_assistant',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    session_data JSONB DEFAULT '{}'::jsonb,
    context_data JSONB DEFAULT '{}'::jsonb,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time_ms DECIMAL(10,2),
    tokens_used INTEGER DEFAULT 0,
    api_calls_made INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    workflow_id UUID REFERENCES workflows(id),
    task_id UUID REFERENCES tasks(id),
    parent_session_id UUID REFERENCES agent_sessions(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    client_ip INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Features**:
- Session lifecycle management with expiration
- Performance and cost tracking
- Hierarchical session support
- Real-time activity monitoring

**Indexes**:
- `idx_agent_sessions_session_id` - Session lookup
- `idx_agent_sessions_expires_at` - Expiration monitoring
- `idx_agent_sessions_performance` - Performance analysis

### 3. PR Tracking Table

**Purpose**: Monitor pull request lifecycle and validation status.

```sql
CREATE TABLE pr_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_number INTEGER NOT NULL,
    pr_url VARCHAR(500) NOT NULL,
    repository_name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(500),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    branch_name VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) NOT NULL DEFAULT 'main',
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    merge_status VARCHAR(50) DEFAULT 'pending',
    review_status VARCHAR(50) DEFAULT 'pending',
    ci_status VARCHAR(50) DEFAULT 'pending',
    test_coverage_percentage DECIMAL(5,2),
    quality_score DECIMAL(5,2),
    security_scan_status VARCHAR(50) DEFAULT 'pending',
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    commits_count INTEGER DEFAULT 0,
    workflow_id UUID REFERENCES workflows(id),
    task_id UUID REFERENCES tasks(id),
    created_by_session_id UUID REFERENCES agent_sessions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    author VARCHAR(255),
    assignees JSONB DEFAULT '[]'::jsonb,
    reviewers JSONB DEFAULT '[]'::jsonb,
    labels JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(repository_name, pr_number)
);
```

**Key Features**:
- Complete PR lifecycle tracking
- Quality metrics integration
- CI/CD pipeline status monitoring
- Repository-specific organization

**Indexes**:
- `idx_pr_tracking_repo_pr` - Repository + PR lookup
- `idx_pr_tracking_quality_score` - Quality-based ranking
- `idx_pr_tracking_ci_status` - CI status monitoring

### 4. System Metrics Table

**Purpose**: Store performance and quality metrics for continuous improvement.

```sql
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL DEFAULT 'gauge',
    numeric_value DECIMAL(20,6),
    string_value TEXT,
    boolean_value BOOLEAN,
    json_value JSONB,
    aggregation_period VARCHAR(50) DEFAULT 'instant',
    aggregation_function VARCHAR(50) DEFAULT 'last',
    dimensions JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '{}'::jsonb,
    workflow_id UUID REFERENCES workflows(id),
    task_id UUID REFERENCES tasks(id),
    session_id UUID REFERENCES agent_sessions(id),
    pr_id UUID REFERENCES pr_tracking(id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_system VARCHAR(100),
    source_component VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Features**:
- Multi-type value storage (numeric, string, boolean, JSON)
- Time-series data support
- Dimensional analysis capabilities
- Source system tracking

**Indexes**:
- `idx_system_metrics_category_name` - Metric lookup
- `idx_system_metrics_timestamp` - Time-series queries
- `idx_system_metrics_aggregation` - Aggregation support

### 5. Enhanced Audit Logs Table

**Purpose**: Comprehensive logging for debugging and compliance.

```sql
CREATE TABLE audit_logs_enhanced (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    action_category VARCHAR(50) NOT NULL DEFAULT 'data',
    action_result VARCHAR(50) DEFAULT 'success',
    old_values JSONB,
    new_values JSONB,
    changed_fields JSONB DEFAULT '[]'::jsonb,
    actor_type VARCHAR(50) NOT NULL DEFAULT 'user',
    actor_id VARCHAR(255),
    actor_name VARCHAR(255),
    session_id UUID REFERENCES agent_sessions(id),
    workflow_id UUID REFERENCES workflows(id),
    task_id UUID REFERENCES tasks(id),
    request_id VARCHAR(255),
    correlation_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_ms INTEGER,
    error_code VARCHAR(50),
    error_message TEXT,
    error_stack TEXT,
    compliance_tags JSONB DEFAULT '[]'::jsonb,
    security_level VARCHAR(20) DEFAULT 'normal',
    data_classification VARCHAR(20) DEFAULT 'internal',
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Features**:
- Comprehensive change tracking
- Security event classification
- Compliance tag support
- Request correlation tracking

**Indexes**:
- `idx_audit_logs_enhanced_entity` - Entity tracking
- `idx_audit_logs_enhanced_security_level` - Security monitoring
- `idx_audit_logs_enhanced_timestamp` - Time-based queries

### 6. Supporting Tables

#### Workflow Tasks Table
Links tasks to workflows with execution order and dependencies.

#### Agent Interactions Table
Detailed logging of AI agent interactions with performance metrics.

## Performance Optimization

### Index Strategy

1. **Partial Indexes**: Only index active/relevant records
   ```sql
   CREATE INDEX idx_workflows_active_priority 
   ON workflows(priority DESC, created_at DESC) 
   WHERE status IN ('pending', 'running');
   ```

2. **Composite Indexes**: Support common query patterns
   ```sql
   CREATE INDEX idx_workflows_env_status_priority 
   ON workflows(environment, status, priority DESC);
   ```

3. **GIN Indexes**: Efficient JSONB queries
   ```sql
   CREATE INDEX idx_workflows_tags_gin 
   ON workflows USING GIN(tags);
   ```

### Query Optimization Guidelines

1. **Use Partial Indexes**: Filter on indexed conditions first
2. **Leverage JSONB Operators**: Use `@>`, `?`, `?&` for efficient JSON queries
3. **Batch Operations**: Use bulk insert procedures for metrics
4. **Connection Pooling**: Maintain optimal connection pool size

## Security Implementation

### Role-Based Access Control

```sql
-- Create roles
CREATE ROLE ai_cicd_read;
CREATE ROLE ai_cicd_write;
CREATE ROLE ai_cicd_admin;

-- Grant permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_cicd_read;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ai_cicd_write;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ai_cicd_admin;
```

### Data Encryption

- **At Rest**: PostgreSQL transparent data encryption
- **In Transit**: SSL/TLS for all connections
- **Application Level**: Sensitive fields encrypted before storage

### Audit Compliance

- **Change Tracking**: All modifications logged automatically
- **Data Classification**: Security levels assigned to all records
- **Retention Policies**: Automated cleanup based on compliance requirements

## Monitoring & Maintenance

### Health Checks

Use the `database_health_check()` function for real-time monitoring:

```sql
SELECT * FROM database_health_check();
```

### Performance Metrics

Monitor key performance indicators:
- Query response times (target: <100ms for 95th percentile)
- Connection pool utilization
- Index usage statistics
- Table growth rates

### Maintenance Procedures

Regular maintenance tasks:

```sql
-- Run comprehensive maintenance
SELECT * FROM perform_database_maintenance(
    p_vacuum_analyze := TRUE,
    p_cleanup_old_data := TRUE,
    p_update_statistics := TRUE
);
```

## Migration Management

### Zero-Downtime Migrations

The enhanced migration system supports:
- **Lock Management**: Prevents concurrent migrations
- **Backup Creation**: Automatic schema backups
- **Rollback Support**: Safe migration reversal
- **Validation**: Pre and post-migration checks

### Migration Commands

```javascript
// Run pending migrations
const runner = new EnhancedMigrationRunner();
await runner.runMigrations({
    dryRun: false,
    createBackup: true,
    maxConcurrentMigrations: 1
});

// Create new migration
await runner.createMigration('Add new feature table', 'schema');

// Rollback to specific version
await runner.rollbackToVersion('20250528120000');
```

## Analytics & Reporting

### Pre-built Views

The schema includes comprehensive analytics views:

1. **workflow_dashboard**: Real-time workflow status
2. **agent_performance_dashboard**: AI agent metrics
3. **pr_quality_dashboard**: Code quality tracking
4. **system_health_dashboard**: Overall system health

### Custom Queries

Example analytics queries:

```sql
-- Workflow success rate by environment
SELECT 
    environment,
    COUNT(*) as total_workflows,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    ROUND((COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100, 2) as success_rate
FROM workflows 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY environment;

-- Agent performance trends
SELECT 
    agent_name,
    DATE_TRUNC('day', started_at) as date,
    AVG(avg_response_time_ms) as avg_response_time,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usd) as total_cost
FROM agent_sessions 
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY agent_name, DATE_TRUNC('day', started_at)
ORDER BY date DESC, agent_name;
```

## Best Practices

### Development Guidelines

1. **Use Transactions**: Wrap related operations in transactions
2. **Validate Input**: Always validate data before database operations
3. **Handle Errors**: Implement comprehensive error handling
4. **Monitor Performance**: Track query execution times
5. **Use Prepared Statements**: Prevent SQL injection

### Operational Guidelines

1. **Regular Backups**: Automated daily backups
2. **Monitor Metrics**: Set up alerting for key metrics
3. **Capacity Planning**: Monitor growth trends
4. **Security Updates**: Keep PostgreSQL updated
5. **Documentation**: Maintain up-to-date documentation

## Troubleshooting

### Common Issues

1. **Slow Queries**: Check index usage and query plans
2. **Connection Limits**: Monitor connection pool utilization
3. **Lock Contention**: Identify long-running transactions
4. **Storage Growth**: Monitor table and index sizes

### Diagnostic Queries

```sql
-- Find slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;

-- Monitor connection usage
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;
```

## Conclusion

This PostgreSQL schema provides a robust foundation for AI-driven CI/CD task orchestration with enterprise-grade performance, security, and scalability. The design supports the demanding requirements of modern AI systems while maintaining operational excellence and compliance standards.

