# TaskMaster Database Documentation

## Overview

This document provides comprehensive documentation for the TaskMaster PostgreSQL production database schema with Cloudflare proxy integration. The system is designed for high availability, security, and performance in a production environment.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Security Implementation](#security-implementation)
4. [Cloudflare Integration](#cloudflare-integration)
5. [Connection Pool Management](#connection-pool-management)
6. [API Endpoints](#api-endpoints)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Backup and Recovery](#backup-and-recovery)
9. [Performance Optimization](#performance-optimization)
10. [Deployment Guide](#deployment-guide)
11. [Troubleshooting](#troubleshooting)

## Architecture Overview

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Cloudflare     │    │   TaskMaster    │
│                 │◄──►│   Proxy/Access   │◄──►│   API Server    │
│ - Web UI        │    │                  │    │                 │
│ - Mobile App    │    │ - SSL/TLS        │    │ - REST API      │
│ - CLI Tools     │    │ - Rate Limiting  │    │ - GraphQL       │
│ - Integrations  │    │ - DDoS Protection│    │ - WebSocket     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Connection Pool │
                                                │ Manager         │
                                                │                 │
                                                │ - Read Pool     │
                                                │ - Write Pool    │
                                                │ - Analytics Pool│
                                                │ - Background    │
                                                └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │   PostgreSQL    │
                                                │   Database      │
                                                │                 │
                                                │ - Primary DB    │
                                                │ - Read Replicas │
                                                │ - Backup System │
                                                └─────────────────┘
```

### Key Features

- **High Availability**: Multi-pool connection management with failover
- **Security**: Row-Level Security (RLS), Cloudflare Access integration
- **Performance**: Optimized indexing, connection pooling, query optimization
- **Monitoring**: Comprehensive metrics, health checks, alerting
- **Scalability**: Horizontal scaling support, read replicas
- **Compliance**: Audit logging, data retention policies

## Database Schema

### Core Tables

#### 1. Tasks Table
Primary table for task management with comprehensive metadata.

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

**Constraints:**
- Status: `pending`, `in_progress`, `completed`, `failed`, `cancelled`
- Priority: 0-10 (0 = lowest, 10 = highest)
- Complexity Score: 1-10 (1 = simple, 10 = very complex)

#### 2. Validation Results Table
Stores Claude Code validation outcomes and metrics.

```sql
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    validation_type VARCHAR(50) NOT NULL,
    validation_status VARCHAR(50) NOT NULL,
    validation_score DECIMAL(5,2),
    validation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    claude_code_version VARCHAR(50),
    validation_environment JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Validation Types:**
- `syntax`: Code syntax validation
- `security`: Security vulnerability scanning
- `performance`: Performance analysis
- `style`: Code style checking
- `testing`: Test coverage and quality
- `integration`: Integration testing
- `deployment`: Deployment readiness
- `compliance`: Compliance checking
- `documentation`: Documentation quality

#### 3. Error Logs Table
Comprehensive error tracking and resolution history.

```sql
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    validation_result_id UUID REFERENCES validation_results(id) ON DELETE SET NULL,
    workflow_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
    error_code VARCHAR(50) NOT NULL,
    error_category VARCHAR(50) NOT NULL,
    error_severity VARCHAR(20) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}'::jsonb,
    stack_trace TEXT,
    context_data JSONB DEFAULT '{}'::jsonb,
    resolution_status VARCHAR(50) DEFAULT 'unresolved',
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    occurrence_count INTEGER DEFAULT 1,
    first_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Additional fields for comprehensive tracking
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    environment VARCHAR(50) DEFAULT 'production',
    service_name VARCHAR(100),
    service_version VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 4. User Management Tables

**User Roles:**
```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Users:**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role_id UUID NOT NULL REFERENCES user_roles(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    api_key_hash VARCHAR(255),
    api_key_expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Indexes and Performance

All tables include comprehensive indexing for optimal query performance:

```sql
-- Example indexes for tasks table
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
```

### Views for Common Queries

**Active Tasks View:**
```sql
CREATE VIEW active_tasks AS
SELECT
    t.*,
    COUNT(tc.id) as context_count,
    COUNT(td_parent.child_task_id) as child_task_count,
    COUNT(td_child.parent_task_id) as dependency_count
FROM tasks t
LEFT JOIN task_contexts tc ON t.id = tc.task_id
LEFT JOIN task_dependencies td_parent ON t.id = td_parent.parent_task_id
LEFT JOIN task_dependencies td_child ON t.id = td_child.child_task_id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id;
```

## Security Implementation

### Row-Level Security (RLS)

All tables have RLS enabled with comprehensive policies:

```sql
-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Example policy for tasks
CREATE POLICY tasks_select_policy ON tasks
    FOR SELECT
    USING (
        user_has_permission('tasks:read') AND
        id IN (SELECT task_id FROM get_user_accessible_tasks())
    );
```

### User Roles and Permissions

**Default Roles:**
- **Admin**: Full system access (`["*"]`)
- **Developer**: Task and validation access (`["tasks:read", "tasks:write", "validations:read", "validations:write", "errors:read"]`)
- **Viewer**: Read-only access (`["tasks:read", "validations:read", "errors:read"]`)
- **API Client**: External integration access (`["tasks:read", "tasks:write", "validations:write"]`)

### Authentication Methods

1. **API Key Authentication**: SHA-256 hashed keys with expiration
2. **JWT Tokens**: Signed tokens for session management
3. **Cloudflare Access**: Enterprise SSO integration
4. **Service Tokens**: Internal service authentication

## Cloudflare Integration

### Proxy Configuration

```yaml
# cloudflare-proxy.yaml
tunnel: ${CLOUDFLARE_TUNNEL_ID}
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: ${CLOUDFLARE_PROXY_HOSTNAME}
    service: tcp://localhost:5432
    originRequest:
      tcpKeepAlive: 30s
      noTLSVerify: false
      connectTimeout: 30s
```

### Security Features

- **SSL/TLS Termination**: End-to-end encryption
- **DDoS Protection**: Automatic attack mitigation
- **Rate Limiting**: Configurable request limits
- **IP Whitelisting**: Restrict access by IP ranges
- **WAF Rules**: Custom security rules

### Access Control

```javascript
// Cloudflare Access JWT validation
const jwtConfig = {
    issuer: `https://${TEAM_DOMAIN}.cloudflareaccess.com`,
    audience: APPLICATION_AUD,
    algorithms: ['RS256']
};
```

## Connection Pool Management

### Pool Types

1. **Read Pool**: 60% of connections for SELECT queries
2. **Write Pool**: 30% of connections for INSERT/UPDATE/DELETE
3. **Analytics Pool**: 10% of connections for complex reporting
4. **Background Pool**: Limited connections for maintenance tasks

### Configuration

```javascript
const poolConfigs = {
    read: {
        max: Math.ceil(totalConnections * 0.6),
        min: Math.ceil(minConnections * 0.4),
        statement_timeout: 30000,
        query_timeout: 30000
    },
    write: {
        max: Math.ceil(totalConnections * 0.3),
        min: Math.ceil(minConnections * 0.3),
        statement_timeout: 60000,
        query_timeout: 60000
    }
    // ... other pools
};
```

### Health Monitoring

- Automatic health checks every 30 seconds
- Connection pool statistics tracking
- Query performance metrics
- Automatic failover for unhealthy pools

## API Endpoints

### REST API

**Base URL**: `https://api.taskmaster.com/api/v1`

#### Tasks Endpoints

```
GET    /tasks              # List tasks with filtering
GET    /tasks/{id}         # Get specific task
POST   /tasks              # Create new task
PUT    /tasks/{id}         # Update task
DELETE /tasks/{id}         # Delete task
GET    /tasks/{id}/contexts # Get task contexts
POST   /tasks/{id}/contexts # Add task context
```

#### Validation Endpoints

```
GET    /validations        # List validations
POST   /validations        # Create validation
PUT    /validations/{id}   # Update validation
```

#### Error Endpoints

```
GET    /errors             # List errors
POST   /errors             # Log error
```

#### Analytics Endpoints

```
GET    /analytics/tasks    # Task analytics
GET    /analytics/validations # Validation analytics
GET    /analytics/errors   # Error analytics
```

### Authentication

**API Key Header:**
```
X-API-Key: your_api_key_here
```

**Bearer Token:**
```
Authorization: Bearer your_jwt_token_here
```

### Response Format

```json
{
    "data": { /* response data */ },
    "pagination": {
        "total": 100,
        "limit": 20,
        "offset": 0,
        "hasMore": true
    },
    "meta": {
        "requestId": "req_123456789",
        "timestamp": "2025-05-28T16:30:00Z"
    }
}
```

## Monitoring and Alerting

### Prometheus Metrics

```
# Database metrics
taskmaster_db_queries_total{pool="read"} 1000
taskmaster_db_queries_successful{pool="read"} 995
taskmaster_db_queries_failed{pool="read"} 5

# Application metrics
taskmaster_tasks_total{status="pending"} 50
taskmaster_tasks_total{status="completed"} 200

# System metrics
taskmaster_uptime_seconds 86400
taskmaster_memory_usage_bytes{type="heap_used"} 134217728
```

### Alert Rules

**Critical Alerts:**
- Database connection failures
- High error rates (>10 errors/minute)
- Memory usage >95%
- Disk usage >95%

**Warning Alerts:**
- Slow query performance (>1s average)
- High connection pool utilization (>80%)
- Task backlog >100 pending tasks

### Health Check Endpoints

```
GET /api/v1/health          # Basic health check
GET /api/v1/health/detailed # Comprehensive health status
GET /api/v1/metrics         # Prometheus metrics
```

## Backup and Recovery

### Automated Backup Script

```bash
# Full backup
./database-backup.sh full

# Incremental backup
./database-backup.sh incremental

# Schema-only backup
./database-backup.sh schema-only
```

### Backup Features

- **Compression**: gzip compression with configurable levels
- **Encryption**: AES-256 encryption for sensitive data
- **S3 Upload**: Automatic upload to cloud storage
- **Retention**: Configurable retention policies
- **Verification**: Automatic backup integrity checks
- **Notifications**: Slack/email notifications for backup status

### Recovery Procedures

1. **Point-in-Time Recovery**: Using WAL files for precise recovery
2. **Full Restore**: Complete database restoration from backup
3. **Selective Restore**: Table-level restoration
4. **Cross-Environment**: Restore to different environments

## Performance Optimization

### Query Optimization

1. **Proper Indexing**: All foreign keys and frequently queried columns
2. **Query Analysis**: Regular EXPLAIN ANALYZE for slow queries
3. **Connection Pooling**: Optimized pool sizes for workload
4. **Read Replicas**: Separate read traffic from write operations

### Monitoring Queries

```sql
-- Find slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;
```

### Performance Targets

- **Query Response Time**: <100ms for standard queries
- **Concurrent Connections**: Support 100+ simultaneous connections
- **Throughput**: 1000+ queries per second
- **Uptime**: >99.9% availability

## Deployment Guide

### Prerequisites

1. **PostgreSQL 14+**: With required extensions
2. **Node.js 18+**: For API server
3. **Cloudflare Account**: With tunnel and access configured
4. **Monitoring Stack**: Prometheus, Grafana, Alertmanager

### Environment Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=secure_password
DB_SSL_MODE=require

# Cloudflare Configuration
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_PROXY_HOSTNAME=db.taskmaster.com
CLOUDFLARE_TUNNEL_ID=your_tunnel_id
CLOUDFLARE_ACCESS_ENABLED=true

# API Configuration
API_PORT=3000
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=https://taskmaster.com

# Monitoring
PROMETHEUS_ENABLED=true
METRICS_PORT=8080
```

### Deployment Steps

1. **Database Setup**:
   ```bash
   # Run migrations
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f src/ai_cicd_system/database/migrations/001_initial_schema.sql
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f src/ai_cicd_system/database/migrations/002_validation_and_error_tables.sql
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f src/ai_cicd_system/database/migrations/003_row_level_security.sql
   ```

2. **Cloudflare Setup**:
   ```bash
   # Install cloudflared
   cloudflared tunnel create taskmaster-db
   cloudflared tunnel route dns taskmaster-db db.taskmaster.com
   cloudflared tunnel run --config cloudflare-proxy.yaml taskmaster-db
   ```

3. **Application Deployment**:
   ```bash
   # Install dependencies
   npm install

   # Start API server
   npm start
   ```

4. **Monitoring Setup**:
   ```bash
   # Deploy monitoring stack
   kubectl apply -f monitoring-alerts.yaml
   ```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  taskmaster-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_NAME=taskmaster
    depends_on:
      - postgres
  
  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=taskmaster
      - POSTGRES_USER=taskmaster
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

## Troubleshooting

### Common Issues

#### 1. Connection Pool Exhaustion

**Symptoms**: "Pool exhausted" errors, high connection wait times

**Solutions**:
- Increase pool size: `DB_POOL_MAX=20`
- Optimize query performance
- Check for connection leaks
- Monitor pool metrics

#### 2. Slow Query Performance

**Symptoms**: High response times, timeout errors

**Solutions**:
```sql
-- Analyze slow queries
EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'pending';

-- Check missing indexes
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE n_distinct > 100 AND correlation < 0.1;

-- Update table statistics
ANALYZE tasks;
```

#### 3. RLS Policy Issues

**Symptoms**: Permission denied errors, unexpected data filtering

**Solutions**:
```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'tasks';

-- Test user permissions
SELECT user_has_permission('tasks:read');

-- Debug accessible tasks
SELECT * FROM get_user_accessible_tasks();
```

#### 4. Cloudflare Connectivity Issues

**Symptoms**: Connection timeouts, SSL errors

**Solutions**:
- Check tunnel status: `cloudflared tunnel info`
- Verify DNS configuration
- Test direct database connection
- Check Cloudflare Access logs

### Monitoring Commands

```bash
# Check database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor query performance
psql -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check disk usage
df -h /var/lib/postgresql/data

# Monitor API health
curl https://api.taskmaster.com/api/v1/health
```

### Log Analysis

```bash
# PostgreSQL logs
tail -f /var/log/postgresql/postgresql.log

# Application logs
tail -f /var/log/taskmaster/app.log

# Cloudflare tunnel logs
tail -f /var/log/cloudflared/tunnel.log
```

## Security Best Practices

1. **Database Security**:
   - Use strong passwords and rotate regularly
   - Enable SSL/TLS for all connections
   - Implement RLS policies for all tables
   - Regular security audits and updates

2. **API Security**:
   - Rate limiting and request validation
   - Input sanitization and SQL injection prevention
   - Secure headers and CORS configuration
   - API key rotation and monitoring

3. **Infrastructure Security**:
   - Network segmentation and firewalls
   - Regular security patches and updates
   - Monitoring and alerting for security events
   - Backup encryption and secure storage

## Compliance and Auditing

### Audit Logging

All database operations are automatically logged with:
- User identification
- Timestamp and operation type
- Before/after values for updates
- IP address and user agent
- Session and request tracking

### Data Retention

- **Audit Logs**: 90 days (configurable)
- **Error Logs**: 30 days for resolved, 1 year for unresolved
- **Performance Metrics**: 1 year with archiving
- **Task Data**: Indefinite with archiving options

### GDPR Compliance

- **Data Minimization**: Only collect necessary data
- **Right to Erasure**: Automated data deletion procedures
- **Data Portability**: Export functionality for user data
- **Consent Management**: User consent tracking and management

---

## Support and Maintenance

For technical support or questions about this documentation, please contact:

- **Technical Lead**: [technical-lead@taskmaster.com]
- **DevOps Team**: [devops@taskmaster.com]
- **Security Team**: [security@taskmaster.com]

**Documentation Version**: 1.0.0  
**Last Updated**: 2025-05-28  
**Next Review**: 2025-08-28

