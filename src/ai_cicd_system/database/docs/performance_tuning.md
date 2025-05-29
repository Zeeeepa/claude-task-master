# PostgreSQL Performance Tuning Guide for AI-Driven CI/CD

## Overview

This guide provides comprehensive performance tuning strategies for the AI-driven CI/CD PostgreSQL database schema. The goal is to achieve and maintain sub-100ms query performance for 95th percentile operations while supporting 1000+ concurrent operations.

## Performance Targets

### Primary Objectives
- **Query Response Time**: <100ms for 95th percentile
- **Concurrent Operations**: 1000+ simultaneous operations
- **Workflow State Transitions**: <50ms completion time
- **Database Connections**: Support for 50+ concurrent connections
- **Backup Operations**: Complete within 30 minutes

### Key Performance Indicators (KPIs)
- Average query execution time
- Connection pool utilization
- Index hit ratio (target: >99%)
- Buffer cache hit ratio (target: >95%)
- Lock wait time (target: <10ms)

## Database Configuration Optimization

### PostgreSQL Configuration (`postgresql.conf`)

```ini
# Memory Configuration
shared_buffers = 256MB                    # 25% of available RAM
effective_cache_size = 1GB                # 75% of available RAM
work_mem = 4MB                           # Per-operation memory
maintenance_work_mem = 64MB              # Maintenance operations

# Connection Configuration
max_connections = 100                     # Adjust based on workload
superuser_reserved_connections = 3

# Checkpoint Configuration
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min
max_wal_size = 1GB
min_wal_size = 80MB

# Query Planner Configuration
random_page_cost = 1.1                   # SSD optimization
effective_io_concurrency = 200           # SSD concurrent I/O

# Logging Configuration
log_min_duration_statement = 1000        # Log slow queries (>1s)
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Statistics Configuration
track_activities = on
track_counts = on
track_io_timing = on
track_functions = pl
```

### Connection Pool Configuration

```javascript
// Database connection pool settings
const poolConfig = {
    min: 2,                              // Minimum connections
    max: 20,                             // Maximum connections
    idleTimeoutMillis: 10000,            // Close idle connections
    acquireTimeoutMillis: 30000,         // Connection acquisition timeout
    createTimeoutMillis: 30000,          // Connection creation timeout
    destroyTimeoutMillis: 5000,          // Connection destruction timeout
    reapIntervalMillis: 1000,            // Check for idle connections
    createRetryIntervalMillis: 200       // Retry interval for failed connections
};
```

## Index Optimization Strategies

### 1. Partial Indexes for Active Records

Focus indexes on frequently queried active records:

```sql
-- Active workflows only
CREATE INDEX CONCURRENTLY idx_workflows_active_priority 
ON workflows(priority DESC, created_at DESC) 
WHERE status IN ('pending', 'running');

-- Active agent sessions only
CREATE INDEX CONCURRENTLY idx_agent_sessions_active_performance 
ON agent_sessions(avg_response_time_ms ASC, total_requests DESC) 
WHERE status = 'active' AND last_activity_at > NOW() - INTERVAL '1 hour';

-- Open PRs only
CREATE INDEX CONCURRENTLY idx_pr_tracking_open_quality 
ON pr_tracking(quality_score DESC, test_coverage_percentage DESC) 
WHERE status = 'open';
```

### 2. Composite Indexes for Common Query Patterns

```sql
-- Workflow queries by environment and status
CREATE INDEX CONCURRENTLY idx_workflows_env_status_priority 
ON workflows(environment, status, priority DESC);

-- Agent session lookup by name and type
CREATE INDEX CONCURRENTLY idx_agent_sessions_name_type_activity 
ON agent_sessions(agent_name, agent_type, last_activity_at DESC);

-- PR tracking by repository and status
CREATE INDEX CONCURRENTLY idx_pr_tracking_repo_status_updated 
ON pr_tracking(repository_name, status, updated_at DESC);
```

### 3. JSONB Indexes for Metadata Queries

```sql
-- GIN indexes for JSONB columns
CREATE INDEX CONCURRENTLY idx_workflows_tags_gin 
ON workflows USING GIN(tags);

CREATE INDEX CONCURRENTLY idx_workflows_metadata_gin 
ON workflows USING GIN(metadata);

CREATE INDEX CONCURRENTLY idx_system_metrics_dimensions_gin 
ON system_metrics USING GIN(dimensions);

-- Specific JSONB path indexes
CREATE INDEX CONCURRENTLY idx_workflows_config_environment 
ON workflows USING GIN((configuration->'environment'));

CREATE INDEX CONCURRENTLY idx_agent_sessions_context_type 
ON agent_sessions USING GIN((context_data->'type'));
```

### 4. Text Search Indexes

```sql
-- Full-text search capabilities
CREATE INDEX CONCURRENTLY idx_workflows_text_search 
ON workflows USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

CREATE INDEX CONCURRENTLY idx_pr_tracking_text_search 
ON pr_tracking USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

## Query Optimization Techniques

### 1. Efficient JSONB Queries

```sql
-- Good: Use GIN index with containment operator
SELECT * FROM workflows 
WHERE tags @> '["urgent"]'::jsonb;

-- Good: Use existence operator
SELECT * FROM workflows 
WHERE configuration ? 'auto_deploy';

-- Avoid: Functional expressions that can't use indexes
-- SELECT * FROM workflows WHERE jsonb_array_length(tags) > 2;
```

### 2. Optimized Time-Range Queries

```sql
-- Good: Use indexed timestamp columns
SELECT * FROM system_metrics 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Good: Use partial indexes for recent data
SELECT * FROM audit_logs_enhanced 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
  AND security_level = 'high';
```

### 3. Efficient Aggregation Queries

```sql
-- Good: Use covering indexes
SELECT 
    workflow_type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'completed') as completed
FROM workflows 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY workflow_type;

-- Good: Use window functions for running totals
SELECT 
    date_trunc('hour', timestamp) as hour,
    metric_name,
    AVG(numeric_value) as avg_value,
    LAG(AVG(numeric_value)) OVER (
        PARTITION BY metric_name 
        ORDER BY date_trunc('hour', timestamp)
    ) as prev_avg
FROM system_metrics 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', timestamp), metric_name;
```

## Connection Management

### 1. Connection Pool Sizing

Calculate optimal pool size:
```
Pool Size = ((Core Count * 2) + Effective Spindle Count)
```

For typical deployment:
- **Minimum Pool Size**: 2-5 connections
- **Maximum Pool Size**: 10-20 connections
- **Monitor**: Connection utilization should stay below 80%

### 2. Connection Lifecycle Management

```javascript
// Proper connection handling
class DatabaseManager {
    async executeQuery(sql, params) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return result;
        } finally {
            client.release(); // Always release connections
        }
    }

    async executeTransaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
```

### 3. Connection Health Monitoring

```sql
-- Monitor active connections
SELECT 
    state,
    count(*) as connection_count,
    avg(extract(epoch from (now() - query_start))) as avg_duration
FROM pg_stat_activity 
WHERE state IS NOT NULL
GROUP BY state;

-- Identify long-running queries
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
  AND state = 'active';
```

## Memory Optimization

### 1. Buffer Pool Tuning

Monitor buffer cache performance:

```sql
-- Buffer cache hit ratio (should be >95%)
SELECT 
    round(
        (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 2
    ) as buffer_cache_hit_ratio
FROM pg_statio_user_tables;

-- Index cache hit ratio (should be >99%)
SELECT 
    round(
        (sum(idx_blks_hit) / (sum(idx_blks_hit) + sum(idx_blks_read))) * 100, 2
    ) as index_cache_hit_ratio
FROM pg_statio_user_indexes;
```

### 2. Work Memory Optimization

```sql
-- Monitor work memory usage
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    temp_blks_read,
    temp_blks_written
FROM pg_stat_statements 
WHERE temp_blks_read > 0 OR temp_blks_written > 0
ORDER BY temp_blks_read + temp_blks_written DESC;
```

Adjust `work_mem` based on:
- Available RAM
- Number of concurrent connections
- Query complexity

## I/O Optimization

### 1. Storage Configuration

For SSD storage:
```ini
# PostgreSQL configuration for SSD
random_page_cost = 1.1
seq_page_cost = 1.0
effective_io_concurrency = 200
```

### 2. WAL Optimization

```ini
# Write-Ahead Log optimization
wal_buffers = 16MB
wal_writer_delay = 200ms
commit_delay = 0
commit_siblings = 5
```

### 3. Checkpoint Tuning

```ini
# Checkpoint configuration
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min
max_wal_size = 1GB
min_wal_size = 80MB
```

## Monitoring and Alerting

### 1. Key Metrics to Monitor

```sql
-- Query performance metrics
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    stddev_time,
    rows
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Table and index sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Lock monitoring
SELECT 
    mode,
    locktype,
    database,
    relation,
    page,
    tuple,
    classid,
    granted,
    count(*)
FROM pg_locks 
GROUP BY mode, locktype, database, relation, page, tuple, classid, granted
ORDER BY count(*) DESC;
```

### 2. Automated Performance Monitoring

```javascript
// Performance monitoring function
async function monitorPerformance() {
    const metrics = await db.query(`
        SELECT 
            'query_performance' as metric_type,
            query as metric_name,
            mean_time as value,
            calls as count
        FROM pg_stat_statements 
        WHERE mean_time > 100  -- Queries slower than 100ms
        ORDER BY mean_time DESC 
        LIMIT 10
    `);

    // Store metrics for alerting
    for (const metric of metrics.rows) {
        await insertSystemMetric({
            metric_category: 'performance',
            metric_name: 'slow_query_detected',
            numeric_value: metric.value,
            dimensions: {
                query_hash: crypto.createHash('md5').update(metric.metric_name).digest('hex'),
                call_count: metric.count
            },
            source_system: 'performance_monitor'
        });
    }
}
```

### 3. Alert Thresholds

Set up alerts for:
- **Query Response Time**: >100ms for 95th percentile
- **Connection Pool Utilization**: >80%
- **Buffer Cache Hit Ratio**: <95%
- **Lock Wait Time**: >10ms
- **Disk Space Usage**: >80%

## Maintenance Procedures

### 1. Regular Maintenance Tasks

```sql
-- Weekly maintenance procedure
DO $$
BEGIN
    -- Update table statistics
    ANALYZE;
    
    -- Vacuum tables to reclaim space
    VACUUM (ANALYZE, VERBOSE);
    
    -- Reindex if needed (check for index bloat first)
    -- REINDEX INDEX CONCURRENTLY idx_name;
    
    -- Clean up old audit logs
    PERFORM cleanup_old_audit_logs();
    
    -- Update aggregated metrics
    PERFORM calculate_aggregated_metrics();
END $$;
```

### 2. Index Maintenance

```sql
-- Check for unused indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check for index bloat
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes 
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 3. Statistics Updates

```sql
-- Update statistics for query planner
ANALYZE workflows;
ANALYZE agent_sessions;
ANALYZE pr_tracking;
ANALYZE system_metrics;
ANALYZE audit_logs_enhanced;

-- Check statistics freshness
SELECT 
    schemaname,
    tablename,
    last_analyze,
    last_autoanalyze,
    n_tup_ins + n_tup_upd + n_tup_del as total_changes
FROM pg_stat_user_tables 
ORDER BY total_changes DESC;
```

## Troubleshooting Performance Issues

### 1. Slow Query Analysis

```sql
-- Enable query logging temporarily
SET log_min_duration_statement = 100;  -- Log queries >100ms

-- Analyze query plans
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT * FROM workflows 
WHERE status = 'running' 
  AND priority > 5 
ORDER BY created_at DESC 
LIMIT 10;
```

### 2. Lock Contention Analysis

```sql
-- Identify blocking queries
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### 3. Memory Usage Analysis

```sql
-- Check for memory-intensive queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    temp_blks_read,
    temp_blks_written,
    local_blks_read,
    local_blks_written
FROM pg_stat_statements 
WHERE temp_blks_read > 1000 OR temp_blks_written > 1000
ORDER BY temp_blks_read + temp_blks_written DESC;
```

## Performance Testing

### 1. Load Testing Scenarios

```javascript
// Concurrent workflow creation test
async function testConcurrentWorkflows(concurrency = 100) {
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
        promises.push(createWorkflow({
            name: `Test Workflow ${i}`,
            workflow_type: 'ci_cd',
            environment: 'test',
            priority: Math.floor(Math.random() * 10)
        }));
    }
    
    const startTime = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    console.log(`Created ${concurrency} workflows in ${duration}ms`);
    console.log(`Average: ${duration / concurrency}ms per workflow`);
}

// Agent session performance test
async function testAgentSessionPerformance(sessionCount = 50) {
    const sessions = [];
    
    // Create sessions
    for (let i = 0; i < sessionCount; i++) {
        const session = await createAgentSession({
            agent_name: `test_agent_${i}`,
            agent_type: 'ai_assistant'
        });
        sessions.push(session);
    }
    
    // Simulate interactions
    const startTime = Date.now();
    const promises = sessions.map(session => 
        recordAgentInteraction(session.id, {
            interaction_type: 'chat',
            request_data: { message: 'test' },
            response_data: { response: 'test response' },
            duration_ms: Math.floor(Math.random() * 1000),
            tokens_used: Math.floor(Math.random() * 100),
            success: true
        })
    );
    
    await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    console.log(`Processed ${sessionCount} interactions in ${duration}ms`);
    console.log(`Average: ${duration / sessionCount}ms per interaction`);
}
```

### 2. Benchmark Results Tracking

```sql
-- Store benchmark results
INSERT INTO system_metrics (
    metric_category, metric_name, metric_type, numeric_value,
    dimensions, source_system
) VALUES (
    'performance', 'benchmark_workflow_creation', 'timer', 45.2,
    '{"concurrency": 100, "test_type": "load_test"}',
    'performance_test'
);
```

## Conclusion

This performance tuning guide provides a comprehensive approach to optimizing PostgreSQL for AI-driven CI/CD workloads. Regular monitoring, proper indexing, and proactive maintenance are key to maintaining optimal performance as the system scales.

Key takeaways:
1. **Monitor continuously**: Set up automated monitoring and alerting
2. **Index strategically**: Use partial and composite indexes for common patterns
3. **Optimize connections**: Proper pool sizing and lifecycle management
4. **Maintain regularly**: Regular VACUUM, ANALYZE, and statistics updates
5. **Test performance**: Regular load testing to validate optimizations

By following these guidelines, the system should consistently meet the performance targets of sub-100ms query times and support for 1000+ concurrent operations.

