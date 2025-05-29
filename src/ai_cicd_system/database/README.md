# PostgreSQL Database Schema and Integration

## 🎯 Overview

This directory contains the comprehensive PostgreSQL database schema design and integration layer for the AI CI/CD system. It provides a robust, scalable, and performant foundation for storing tasks, requirements, dependencies, execution history, code artifacts, and validation results.

## 📁 Directory Structure

```
src/ai_cicd_system/database/
├── README.md                     # This documentation
├── connection.js                 # Database connection management with pooling
├── query_builder.js             # Advanced query builder for complex operations
├── performance_benchmark.js      # Performance testing and benchmarking tools
├── migrations/
│   ├── 001_initial_schema.sql   # Initial database schema
│   ├── 002_cicd_enhancements.sql # CI/CD specific enhancements
│   └── runner.js                # Migration runner
└── models/
    ├── Task.js                  # Task model (existing)
    ├── TaskContext.js           # Task context model (existing)
    ├── CodeArtifact.js          # Code artifact model
    ├── ValidationResult.js      # Validation result model
    └── ExecutionHistory.js      # Execution history model
```

## 🗄️ Database Schema

### Core Tables

#### 1. **tasks** (Enhanced)
- **Purpose**: Store task metadata, requirements, and acceptance criteria
- **Key Features**: 
  - UUID primary keys for distributed systems
  - JSONB fields for flexible metadata storage
  - Audit triggers for change tracking
  - Comprehensive indexing for performance

#### 2. **task_contexts** (Enhanced)
- **Purpose**: Store contextual information and metadata for tasks
- **Key Features**:
  - Flexible context types for different use cases
  - JSONB storage for complex context data

#### 3. **workflow_states** (Enhanced)
- **Purpose**: Track workflow execution states and progress
- **Key Features**:
  - Step-by-step workflow tracking
  - Error handling and retry logic
  - Performance metrics integration

### New CI/CD Tables

#### 4. **code_artifacts**
- **Purpose**: Store generated code, tests, documentation, and other CI/CD artifacts
- **Features**:
  - Content hash verification for integrity
  - Multiple storage backends (database, S3, Azure Blob, GCS)
  - Automatic content type detection
  - File size and metadata tracking

```sql
CREATE TABLE code_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_type VARCHAR(50) NOT NULL, -- source_code, test_file, documentation, etc.
    file_path VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    content_size BIGINT NOT NULL,
    content_type VARCHAR(100),
    storage_location VARCHAR(500),
    storage_type VARCHAR(50) DEFAULT 'database',
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 5. **validation_results**
- **Purpose**: Store Claude Code validation outcomes and other validation results
- **Features**:
  - Flexible validation types (syntax, style, security, performance, etc.)
  - Detailed issue categorization (critical, major, minor)
  - Scoring system with configurable weights
  - Suggestions and recommendations storage

```sql
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES code_artifacts(id) ON DELETE SET NULL,
    validation_type VARCHAR(50) NOT NULL,
    validator_name VARCHAR(100) NOT NULL,
    validation_status VARCHAR(50) NOT NULL,
    score DECIMAL(5,2),
    max_score DECIMAL(5,2),
    issues_found INTEGER DEFAULT 0,
    issues_critical INTEGER DEFAULT 0,
    issues_major INTEGER DEFAULT 0,
    issues_minor INTEGER DEFAULT 0,
    validation_details JSONB DEFAULT '{}'::jsonb,
    suggestions JSONB DEFAULT '[]'::jsonb,
    execution_time_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 6. **execution_history**
- **Purpose**: Track detailed execution history of CI/CD operations
- **Features**:
  - Comprehensive execution tracking with phases
  - Resource usage monitoring (CPU, memory)
  - Error handling with stack traces
  - Retry mechanism support
  - Performance metrics collection

```sql
CREATE TABLE execution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    execution_type VARCHAR(50) NOT NULL,
    execution_phase VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb INTEGER,
    exit_code INTEGER,
    stdout_preview TEXT,
    stderr_preview TEXT,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    retry_of UUID REFERENCES execution_history(id) ON DELETE SET NULL,
    environment_info JSONB DEFAULT '{}'::jsonb,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### 7. **system_metrics** (Enhanced)
- **Purpose**: Store enhanced system performance and business metrics
- **Features**:
  - Categorized metrics (database, application, infrastructure, business, security)
  - Multiple aggregation types (gauge, counter, histogram, summary, timer)
  - Retention policies for data lifecycle management
  - Tag-based filtering and dimensions

#### 8. **task_relationships**
- **Purpose**: Manage complex task relationships beyond simple dependencies
- **Features**:
  - Multiple relationship types (blocks, depends_on, related, duplicates, etc.)
  - Relationship strength weighting
  - Circular dependency prevention

### Performance Optimizations

#### Indexing Strategy
- **Primary Keys**: UUID with efficient generation
- **Foreign Keys**: Indexed for join performance
- **Query Patterns**: Indexes optimized for common CI/CD queries
- **Composite Indexes**: Multi-column indexes for complex filters
- **Partial Indexes**: For filtered queries on status, type, etc.

#### Partitioning
- **Time-based Partitioning**: For high-volume tables (execution_history, system_metrics)
- **Monthly Partitions**: Automatic partition creation
- **Retention Policies**: Automated cleanup of old data

#### Views and Materialized Views
- **task_execution_summary**: Aggregated task performance data
- **cicd_pipeline_status**: Real-time pipeline status overview
- **performance_dashboard**: Time-series performance metrics
- **task_dependency_graph**: Relationship visualization data

## 🔧 Database Connection Management

### Features
- **Connection Pooling**: Configurable pool sizes with health monitoring
- **Retry Logic**: Exponential backoff for connection failures
- **Health Checks**: Automatic connection health monitoring
- **Performance Monitoring**: Query execution time tracking
- **Graceful Shutdown**: Clean connection closure

### Configuration
```javascript
export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD || 'password',
    
    pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 10000,
        acquireTimeoutMillis: 30000
    },
    
    health_check: {
        enabled: true,
        interval_ms: 30000,
        timeout_ms: 5000
    }
};
```

## 🔍 Query Builder

### Advanced Query Construction
```javascript
import { query, cicdQuery } from './query_builder.js';

// Basic queries
const tasks = await query('tasks')
    .where('status', '=', 'pending')
    .where('priority', '>=', 5)
    .orderBy('created_at', 'DESC')
    .limit(10)
    .get();

// Complex joins
const tasksWithArtifacts = await query('tasks t')
    .select(['t.*', 'COUNT(ca.id) as artifact_count'])
    .leftJoin('code_artifacts ca', 't.id = ca.task_id')
    .groupBy('t.id')
    .having('COUNT(ca.id)', '>', 0)
    .get();

// CI/CD specific queries
const cicdStatus = await cicdQuery()
    .getTasksWithCICDStatus({ 
        status: ['pending', 'in_progress'],
        priority: 5 
    })
    .get();
```

### CI/CD Query Builders
- **getTasksWithCICDStatus()**: Tasks with artifact and validation counts
- **getValidationResults()**: Validation results with task and artifact details
- **getExecutionHistory()**: Execution history with performance metrics
- **getPerformanceMetrics()**: Time-series performance data
- **getTaskDependencyGraph()**: Task relationship traversal

## 📊 Performance Benchmarking

### Comprehensive Performance Testing
```javascript
import { runPerformanceBenchmarks } from './performance_benchmark.js';

const results = await runPerformanceBenchmarks({
    warmupRuns: 3,
    benchmarkRuns: 10,
    concurrentUsers: 5,
    dataSetSize: 1000,
    targetResponseTime: 100 // ms
});

console.log('Benchmark Results:', results.summary);
```

### Benchmark Categories
1. **Basic Queries**: Simple SELECT, WHERE, ORDER BY operations
2. **Complex Queries**: JOINs, aggregations, subqueries
3. **CI/CD Queries**: Domain-specific query patterns
4. **Concurrent Operations**: Multi-user simulation
5. **Bulk Operations**: Large-scale INSERT/UPDATE/DELETE
6. **Index Performance**: Index utilization analysis

### Performance Targets
- **Query Response Time**: < 100ms for 95th percentile
- **Concurrent Users**: Support 10,000+ concurrent operations
- **Throughput**: Optimized for read-heavy workloads
- **Data Volume**: Efficient handling of large datasets

## 🧪 Testing Framework

### Model Testing
- **Unit Tests**: Comprehensive model validation and business logic
- **Integration Tests**: Database operations and query performance
- **Edge Case Testing**: Error handling and data integrity

### Test Coverage
- **Models**: >95% code coverage
- **Query Builder**: All query patterns and edge cases
- **Connection Management**: Failure scenarios and recovery
- **Performance**: Benchmark validation and regression testing

## 🚀 Deployment Guide

### Prerequisites
- PostgreSQL 13+ with UUID extension
- Node.js 18+ with ES modules support
- Environment variables configured

### Migration Process
```bash
# Run migrations
npm run migrate

# Verify schema
npm run db:verify

# Run performance benchmarks
npm run db:benchmark
```

### Environment Variables
```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=your_secure_password

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10

# Performance Monitoring
DB_SLOW_QUERY_THRESHOLD=1000
DB_LOG_QUERIES=false
DB_LOG_SLOW_QUERIES=true

# Health Checks
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000
```

### Production Considerations
- **SSL Configuration**: Enable SSL for production connections
- **Connection Limits**: Monitor and tune pool sizes
- **Backup Strategy**: Regular automated backups
- **Monitoring**: Query performance and resource usage
- **Security**: Database access control and encryption

## 🔗 Integration Points

### claude-task-master
- Task storage and retrieval
- Workflow state management
- Progress tracking

### AgentAPI Middleware
- Session and context persistence
- Request/response caching
- Authentication state

### Cloudflare
- Database exposure configuration
- API rate limiting
- Security policies

### Monitoring Systems
- Performance metrics collection
- Alert configuration
- Dashboard integration

## ⚠️ Troubleshooting

### Common Issues

#### Connection Problems
```javascript
// Check connection health
const connection = getConnection();
const health = connection.getHealth();
console.log('Connection Status:', health);
```

#### Performance Issues
```javascript
// Run performance analysis
const metrics = connection.getMetrics();
console.log('Query Performance:', metrics);
```

#### Migration Failures
```bash
# Check migration status
npm run migrate:status

# Rollback if needed
npm run migrate:rollback
```

### Monitoring Queries
```sql
-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;

-- Check connection usage
SELECT count(*), state 
FROM pg_stat_activity 
GROUP BY state;

-- Check table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 📈 Performance Metrics

### Success Criteria
- ✅ Query performance < 100ms average
- ✅ 99.9% uptime
- ✅ Zero data loss
- ✅ Successful integration with all system components
- ✅ >90% test coverage
- ✅ Comprehensive documentation

### Monitoring Dashboard
- Real-time query performance
- Connection pool utilization
- Error rates and types
- Resource usage trends
- Business metrics (tasks processed, validations completed)

## 🔄 Future Enhancements

### Planned Features
- **Read Replicas**: Scale read operations
- **Sharding**: Horizontal scaling for massive datasets
- **Caching Layer**: Redis integration for frequently accessed data
- **Event Sourcing**: Immutable event log for audit trails
- **GraphQL API**: Flexible query interface
- **Real-time Subscriptions**: WebSocket-based live updates

### Optimization Opportunities
- **Query Optimization**: Continuous performance tuning
- **Index Tuning**: Dynamic index recommendations
- **Partition Management**: Automated partition lifecycle
- **Compression**: Data compression for archival
- **Analytics**: Advanced reporting and insights

---

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Driver](https://node-postgres.com/)
- [Database Design Best Practices](https://www.postgresql.org/docs/current/ddl-best-practices.html)
- [Performance Tuning Guide](https://wiki.postgresql.org/wiki/Performance_Optimization)

For questions or support, please refer to the main project documentation or create an issue in the repository.

