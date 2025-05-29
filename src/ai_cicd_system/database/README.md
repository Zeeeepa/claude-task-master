# AI CI/CD Database System

## Overview

This directory contains the comprehensive PostgreSQL database schema and management system for the AI CI/CD orchestration platform. The database is designed to handle high-throughput task management, workflow orchestration, and comprehensive audit logging with performance optimization and scalability in mind.

## Architecture

### Database Schema Version 2.0.0

The enhanced database schema includes:

- **Enhanced Tasks Table**: CI/CD specific fields for repository integration, PR tracking, and error handling
- **Workflows Table**: Multi-step workflow orchestration with execution tracking
- **Workflow Execution Steps**: Detailed step-by-step execution monitoring
- **Comprehensive Audit Logging**: Complete audit trail for compliance and debugging
- **Performance Optimizations**: Advanced indexing, views, and query optimization

## Directory Structure

```
src/ai_cicd_system/database/
├── README.md                          # This file
├── connection.js                      # Database connection management
├── schema/                           # SQL schema definitions
│   ├── tasks_schema.sql              # Enhanced tasks table schema
│   ├── workflows_schema.sql          # Workflows and execution steps schema
│   └── audit_schema.sql              # Comprehensive audit logging schema
├── migrations/                       # Database migration scripts
│   ├── 001_create_tasks_table.js     # Tasks table migration
│   ├── 002_create_workflows_table.js # Workflows table migration
│   ├── 003_create_audit_tables.js    # Audit tables migration
│   └── runner.js                     # Migration runner utility
└── models/                          # Data models and business logic
    ├── Task.js                      # Enhanced Task model
    ├── Workflow.js                  # Workflow and WorkflowExecutionStep models
    ├── AuditLog.js                  # AuditLog and AuditSummary models
    └── TaskContext.js               # Legacy TaskContext model
```

## Database Tables

### Tasks Table (Enhanced)

The enhanced tasks table includes CI/CD specific fields:

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Technology stack
    language VARCHAR(50),
    framework VARCHAR(100),
    testing_framework VARCHAR(100),
    
    -- Repository integration
    repository_url VARCHAR(500),
    branch_name VARCHAR(255),
    pr_number INTEGER,
    pr_url VARCHAR(500),
    codegen_request_id VARCHAR(255),
    
    -- Error handling
    error_logs JSONB DEFAULT '[]'::jsonb,
    retry_count INTEGER DEFAULT 0,
    
    -- Timestamps and assignment
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    assigned_to VARCHAR(255),
    parent_task_id UUID REFERENCES tasks(id),
    workflow_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Features:**
- Enhanced status tracking (pending, in_progress, completed, failed, cancelled, blocked, review, testing, deployed)
- Priority levels (low, medium, high, critical)
- CI/CD integration fields (repository_url, branch_name, pr_number, etc.)
- Error logging and retry mechanisms
- Hierarchical task relationships
- Workflow integration

### Workflows Table

Manages complex multi-step CI/CD workflows:

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    trigger_type VARCHAR(100),
    trigger_config JSONB DEFAULT '{}'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    timeout_minutes INTEGER DEFAULT 60,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Features:**
- Multiple trigger types (manual, webhook, schedule, git_push, pr_created, etc.)
- Step-by-step execution tracking
- Timeout and retry management
- Flexible workflow configuration

### Workflow Execution Steps

Detailed tracking of individual workflow steps:

```sql
CREATE TABLE workflow_execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL,
    step_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0,
    depends_on_steps INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Audit Logs

Comprehensive audit logging for all system changes:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),
    api_endpoint VARCHAR(500),
    http_method VARCHAR(10),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_time_ms INTEGER,
    context JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    severity VARCHAR(20) DEFAULT 'info',
    category VARCHAR(50) DEFAULT 'general',
    correlation_id VARCHAR(255),
    parent_audit_id UUID REFERENCES audit_logs(id)
);
```

## Performance Optimizations

### Indexing Strategy

The database includes comprehensive indexing for optimal performance:

**Tasks Table Indexes:**
- Primary key and foreign key indexes
- Status, priority, and assignment indexes
- Repository and CI/CD integration indexes
- GIN indexes for JSONB fields (requirements, error_logs, metadata)
- Text search indexes for full-text search
- Composite indexes for common query patterns
- Partial indexes for active tasks and retryable failures

**Workflows Table Indexes:**
- Status and trigger type indexes
- Execution progress indexes
- GIN indexes for JSONB configuration fields

**Audit Logs Indexes:**
- Entity type and ID composite indexes
- Timestamp indexes for time-based queries
- User and session tracking indexes
- GIN indexes for JSONB fields

### Query Optimization

- **Views**: Pre-computed views for common queries (active tasks, workflow statistics, audit summaries)
- **Triggers**: Automatic timestamp updates and audit logging
- **Functions**: Optimized stored procedures for complex operations
- **Constraints**: Data integrity and validation at the database level

### Performance Benchmarks

The system is designed to meet the following performance targets:

- **Single Operations**: < 100ms for CRUD operations
- **Bulk Operations**: < 5 seconds for 1000+ record operations
- **Complex Queries**: < 100ms for JOIN and aggregation queries
- **Concurrent Operations**: Support for 100+ concurrent connections
- **Audit Logging**: Minimal performance impact (< 10ms overhead)

## Migration System

### Migration Files

Each migration includes:
- **Version Control**: Sequential versioning (001, 002, 003)
- **Dependency Management**: Clear dependency chains
- **Rollback Support**: Safe rollback mechanisms with data preservation
- **Validation**: Pre-migration validation checks
- **Performance Monitoring**: Migration timing and metrics

### Running Migrations

```javascript
import { MigrationRunner } from './migrations/runner.js';

const runner = new MigrationRunner(dbConnection);

// Run all pending migrations
await runner.runPending();

// Run specific migration
await runner.runMigration('002');

// Rollback migration
await runner.rollback('003');

// Get migration status
const status = await runner.getStatus();
```

### Migration Safety

- **Backup Creation**: Automatic table backups before destructive operations
- **Transaction Safety**: All migrations run in transactions
- **Validation**: Pre and post-migration validation
- **Rollback Testing**: Automated rollback testing

## Data Models

### Task Model (Enhanced)

```javascript
import { Task } from './models/Task.js';

// Create new task
const task = new Task({
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication system',
    requirements: ['JWT library', 'User model', 'Auth middleware'],
    acceptance_criteria: ['Login works', 'Token validation', 'Logout functionality'],
    complexity_score: 8,
    priority: 'high',
    language: 'javascript',
    framework: 'express.js',
    repository_url: 'https://github.com/company/project',
    branch_name: 'feature/auth-system'
});

// Validate task
const validation = task.validate();
if (!validation.valid) {
    console.error('Validation errors:', validation.errors);
}

// Update status with CI/CD logic
const result = task.updateStatus('in_progress', { assignee: 'developer@company.com' });

// Add error logging
task.addErrorLog(new Error('Build failed'), { step: 'compilation' });

// Get pipeline status
const pipelineStatus = task.getPipelineStatus();
console.log('Pipeline stage:', pipelineStatus.pipelineStage);
```

### Workflow Model

```javascript
import { Workflow } from './models/Workflow.js';

// Create workflow
const workflow = new Workflow({
    name: 'CI/CD Pipeline',
    description: 'Automated build, test, and deployment',
    trigger_type: 'git_push',
    steps: [
        { name: 'Build', type: 'task_creation', config: { timeout: 300 } },
        { name: 'Test', type: 'testing', config: { timeout: 600 } },
        { name: 'Deploy', type: 'deployment', config: { timeout: 900 } }
    ],
    total_steps: 3
});

// Execute workflow
workflow.advanceStep({ success: true, artifacts: ['build.zip'] });
console.log('Progress:', workflow.getProgress() + '%');

// Handle workflow control
workflow.pause();
workflow.resume();
workflow.reset();
```

### Audit Log Model

```javascript
import { AuditLog } from './models/AuditLog.js';

// Create audit logs
const createLog = AuditLog.forCreate('task', taskId, taskData);
const updateLog = AuditLog.forUpdate('task', taskId, oldData, newData);
const statusLog = AuditLog.forStatusChange('task', taskId, 'pending', 'completed');

// Set context information
auditLog.setUser({ id: 'user123', email: 'user@company.com', name: 'John Doe' });
auditLog.setRequest({ ip: '192.168.1.1', userAgent: 'Mozilla/5.0', method: 'PUT' });
auditLog.setCorrelation('correlation-id-123');

// Check event severity
if (auditLog.isCritical()) {
    console.log('Critical event detected:', auditLog.getDescription());
}
```

## Cloudflare Integration

### Database Exposure Configuration

```javascript
import { CLOUDFLARE_DB_CONFIG } from '../config/cloudflare_db_config.js';

// Cloudflare tunnel configuration
const config = {
    credential_name: "Database",
    description: "PostgreSQL database for AI CI/CD orchestration",
    host: process.env.CLOUDFLARE_DB_URL,
    port: 5432,
    database_name: "codegen-taskmaster-db",
    username: "software_developer",
    password: process.env.DB_PASSWORD,
    ssl_mode: "require",
    connection_pool: {
        min: 5,
        max: 20,
        idle_timeout: 30000
    }
};
```

### Codegen Integration

The database is configured to be accessible by Codegen with:
- **Controlled Access**: Limited to specific tables and views
- **Query Limitations**: Row limits and timeout controls
- **Caching**: Query result caching for performance
- **Security**: SSL encryption and access policies

## Testing

### Test Coverage

The database system includes comprehensive tests:

- **Unit Tests**: Model validation and business logic (90%+ coverage)
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Benchmarking and load testing
- **Migration Tests**: Migration and rollback testing
- **Concurrency Tests**: Multi-user scenario testing

### Running Tests

```bash
# Run all database tests
npm test tests/database/

# Run specific test suites
npm test tests/database/enhanced_models.test.js
npm test tests/database/migration_runner.test.js
npm test tests/database/performance_benchmarks.test.js

# Run with coverage
npm run test:coverage
```

### Performance Benchmarks

Expected performance metrics:
- Single task operations: < 100ms
- Bulk operations (1000 records): < 5 seconds
- Complex queries: < 100ms
- Concurrent operations: 100+ connections
- Migration execution: < 2 minutes total

## Security

### Data Protection

- **Encryption**: TLS 1.3 for all connections
- **Access Control**: Role-based permissions
- **Audit Trail**: Complete change tracking
- **Data Validation**: Input validation and sanitization
- **SQL Injection Prevention**: Parameterized queries

### Compliance

- **GDPR**: Data retention and deletion policies
- **SOX**: Financial data audit requirements
- **HIPAA**: Healthcare data protection (if applicable)
- **Custom**: Organization-specific compliance requirements

## Monitoring and Maintenance

### Health Checks

- **Connection Monitoring**: Pool status and connection health
- **Query Performance**: Slow query detection and logging
- **Resource Usage**: Memory and CPU monitoring
- **Error Tracking**: Database error logging and alerting

### Maintenance Tasks

- **Audit Log Cleanup**: Automated retention policy enforcement
- **Index Maintenance**: Regular index optimization
- **Statistics Updates**: Query planner statistics refresh
- **Backup Verification**: Regular backup testing

### Troubleshooting

Common issues and solutions:

1. **Slow Queries**: Check indexes and query plans
2. **Connection Pool Exhaustion**: Adjust pool settings
3. **Migration Failures**: Check dependencies and rollback
4. **Audit Log Growth**: Implement cleanup policies
5. **Deadlocks**: Review transaction patterns

## Environment Configuration

### Development

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen_taskmaster_dev
DB_USER=developer
DB_PASSWORD=dev_password
DB_SSL_MODE=disable
DB_POOL_MIN=2
DB_POOL_MAX=5
```

### Production

```env
DB_HOST=production-db.company.com
DB_PORT=5432
DB_NAME=codegen_taskmaster_prod
DB_USER=app_user
DB_PASSWORD=secure_password
DB_SSL_MODE=require
DB_POOL_MIN=10
DB_POOL_MAX=50
CLOUDFLARE_DB_URL=tunnel-url.cloudflare.com
```

## API Integration

### Supported Endpoints

The database supports the following API operations:

- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Retrieve task details
- `PUT /api/tasks/:id` - Update task status
- `GET /api/workflows/:id` - Get workflow status
- `POST /api/workflows` - Create new workflow
- `POST /api/audit/search` - Query audit logs

### Query Examples

```sql
-- Get active high-priority tasks
SELECT * FROM v_active_tasks 
WHERE priority = 'high' 
ORDER BY created_at DESC;

-- Get workflow statistics
SELECT * FROM v_workflow_statistics 
WHERE status = 'active';

-- Search audit logs
SELECT * FROM v_recent_audit_activity 
WHERE entity_type = 'task' 
AND action = 'status_change'
AND timestamp > NOW() - INTERVAL '24 hours';
```

## Future Enhancements

### Planned Features

1. **Partitioning**: Table partitioning for large datasets
2. **Read Replicas**: Read-only replicas for scaling
3. **Sharding**: Horizontal scaling for massive workloads
4. **Real-time Sync**: Real-time data synchronization
5. **Advanced Analytics**: Built-in analytics and reporting

### Scalability Roadmap

- **Phase 1**: Current implementation (up to 10M tasks)
- **Phase 2**: Partitioning and indexing optimization (up to 100M tasks)
- **Phase 3**: Sharding and distributed architecture (unlimited scale)

## Support and Documentation

### Additional Resources

- [Database Schema Documentation](./schema/)
- [Migration Guide](./migrations/README.md)
- [Performance Tuning Guide](./docs/performance.md)
- [Security Best Practices](./docs/security.md)
- [Troubleshooting Guide](./docs/troubleshooting.md)

### Getting Help

For issues or questions:
1. Check the troubleshooting guide
2. Review the test cases for examples
3. Check the audit logs for error details
4. Contact the development team

---

This database system provides a robust, scalable foundation for the AI CI/CD orchestration platform with comprehensive task management, workflow orchestration, and audit capabilities.

