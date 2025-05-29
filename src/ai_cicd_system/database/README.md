# PostgreSQL Database Implementation for AI CI/CD System

## Overview

This directory contains the complete PostgreSQL database implementation for the AI CI/CD task management system, featuring:

- **Scalable Schema Design**: Optimized for high-throughput operations
- **Security-First Architecture**: Row-level security, API authentication, and encryption
- **Cloudflare Integration**: Secure external access with DDoS protection and WAF
- **Advanced Connection Pooling**: Multiple pools for different operation types
- **Comprehensive Monitoring**: Real-time metrics and performance tracking
- **Automated Setup**: One-command deployment and configuration

## Quick Start

### Prerequisites

- PostgreSQL 13+ with extensions: `uuid-ossp`, `pgcrypto`, `pg_stat_statements`
- Node.js 18+ with ES modules support
- Environment variables configured (see Configuration section)

### Installation

1. **Set Environment Variables**:
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=taskmaster_db
export DB_USER=taskmaster_user
export DB_PASSWORD=secure_password
export NODE_ENV=development
```

2. **Run Database Setup**:
```bash
node src/ai_cicd_system/database/setup.js
```

3. **Verify Installation**:
```bash
# Check database health
curl -H "X-API-Key: your_api_key" http://localhost:3000/api/database/health
```

## Architecture

### Core Components

```
src/ai_cicd_system/database/
├── schema.sql                 # Complete database schema
├── connection.js             # Basic database connection
├── connection_pool.js        # Enhanced connection pooling
├── cloudflare_config.js      # Cloudflare integration
├── setup.js                  # Automated setup script
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_enhanced_cicd_schema.sql
│   └── runner.js
└── models/
    ├── Task.js
    └── TaskContext.js
```

### Database Schema

#### Core Tables
- **tasks**: Primary task management
- **task_contexts**: Contextual information and metadata
- **task_dependencies**: Task relationship management
- **workflow_states**: Workflow execution tracking
- **audit_logs**: Complete audit trail

#### CI/CD Tables
- **deployment_scripts**: Script management and execution
- **error_logs**: Comprehensive error tracking
- **webhook_events**: External system integration

#### Security Tables
- **api_keys**: Authentication and authorization
- **api_access_logs**: Security monitoring
- **configuration_settings**: Dynamic configuration

#### Monitoring Tables
- **system_metrics**: Performance and health metrics
- **performance_metrics**: Legacy metrics (maintained for compatibility)

### Connection Pooling Strategy

The system uses multiple specialized connection pools:

```javascript
// Pool configurations
const pools = {
    primary: { min: 2, max: 10 },    // General operations
    readonly: { min: 1, max: 5 },    // Analytics and reporting
    priority: { min: 1, max: 3 },    // Critical operations
    background: { min: 1, max: 2 }   // Background tasks
};
```

## Configuration

### Environment Variables

#### Required Database Settings
```bash
DB_HOST=localhost                    # Database host
DB_PORT=5432                        # Database port
DB_NAME=taskmaster_db               # Database name
DB_USER=taskmaster_user             # Database user
DB_PASSWORD=secure_password         # Database password
```

#### Optional Database Settings
```bash
DB_SSL_MODE=require                 # SSL mode (off, require, prefer)
DB_POOL_MIN=2                       # Minimum pool connections
DB_POOL_MAX=10                      # Maximum pool connections
DB_QUERY_TIMEOUT=60000              # Query timeout (ms)
DB_HEALTH_CHECK_ENABLED=true        # Enable health checks
```

#### Cloudflare Configuration
```bash
CLOUDFLARE_ACCESS_ENABLED=true      # Enable Cloudflare Access
CLOUDFLARE_ACCESS_APP_ID=your_app_id
CLOUDFLARE_ACCESS_DOMAIN=your_domain
CLOUDFLARE_API_RATE_LIMIT=100       # Requests per minute
CLOUDFLARE_WAF_ENABLED=true         # Enable WAF protection
```

#### Setup Options
```bash
CREATE_ADMIN_API_KEY=true           # Create admin API key
ADMIN_USER_ID=admin@company.com     # Admin user identifier
GENERATE_CLOUDFLARE_CONFIG=true     # Generate CF deployment files
NODE_ENV=development                # Environment (development/production)
```

## API Usage

### Authentication

All API endpoints require authentication via API key:

```bash
# Include API key in header
curl -H "X-API-Key: ctm_your_api_key_here" \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/database/health
```

### Core Endpoints

#### Health Check
```bash
GET /api/database/health
```

#### Task Management
```bash
# List tasks with filtering
GET /api/database/tasks?status=pending&page=1&limit=20

# Get task details
GET /api/database/tasks/{task_id}

# Create new task
POST /api/database/tasks
{
    "title": "Implement feature X",
    "description": "Detailed description",
    "priority": 5,
    "assigned_to": "developer@company.com"
}

# Update task status
PATCH /api/database/tasks/{task_id}/status
{
    "status": "in_progress",
    "notes": "Started implementation"
}
```

#### System Monitoring
```bash
# Get system metrics
GET /api/database/metrics

# Execute custom query (admin only)
POST /api/database/query
{
    "sql": "SELECT COUNT(*) FROM tasks WHERE status = 'pending'",
    "pool": "readonly"
}
```

## Security Features

### API Key Management

Generate API keys programmatically:

```javascript
import { getPoolManager } from './connection_pool.js';

const poolManager = getPoolManager();
const result = await poolManager.query(
    'SELECT generate_api_key($1, $2, $3)',
    ['My API Key', 'user@company.com', JSON.stringify(['read:tasks'])]
);

console.log('API Key:', result.rows[0].generate_api_key.api_key);
```

### Permission System

Available permissions:
- `read:tasks`: Read task information
- `write:tasks`: Create and update tasks
- `read:metrics`: Access system metrics
- `admin`: Full administrative access

### Row Level Security

RLS policies ensure users can only access their own data:

```sql
-- Users can only see their own API keys
CREATE POLICY api_keys_user_policy ON api_keys
    FOR ALL TO authenticated_users
    USING (user_id = current_setting('app.current_user_id', true));
```

## Cloudflare Integration

### Security Configuration

The system includes comprehensive Cloudflare integration:

- **Access Control**: Email domain and service token authentication
- **Rate Limiting**: Configurable per-endpoint rate limits
- **WAF Protection**: Custom rules for database security
- **DDoS Protection**: Automatic threat detection and mitigation

### Deployment

Generate Cloudflare configuration files:

```bash
GENERATE_CLOUDFLARE_CONFIG=true node src/ai_cicd_system/database/setup.js
```

This creates:
- `cloudflare-terraform.json`: Terraform configuration
- `cloudflare-docker.json`: Docker deployment configuration

## Monitoring and Maintenance

### Health Monitoring

The system provides comprehensive health monitoring:

```javascript
// Get system health dashboard
const health = await poolManager.query(
    'SELECT * FROM system_health_dashboard'
);

// Get performance metrics
const performance = await poolManager.query(
    'SELECT * FROM performance_monitoring'
);
```

### Automated Maintenance

Built-in maintenance functions:

```sql
-- Clean up old logs (90 days retention)
SELECT cleanup_old_logs(90);

-- Refresh materialized views
SELECT refresh_materialized_views();

-- Get task statistics
SELECT * FROM get_task_statistics();
```

### Performance Optimization

Monitor and optimize performance:

```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;

-- Monitor connection usage
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;
```

## Development

### Running Tests

```bash
# Run database integration tests
npm test tests/database/

# Run specific test suite
npm test tests/database/integration.test.js
```

### Adding New Migrations

1. Create migration file:
```bash
touch src/ai_cicd_system/database/migrations/003_new_feature.sql
```

2. Add migration content:
```sql
-- Migration: 003_new_feature.sql
-- Description: Add new feature tables

CREATE TABLE new_feature (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update migration record
INSERT INTO schema_migrations (version, description, checksum) 
VALUES ('003', 'Add new feature tables', 'new_feature_v1_0_0');
```

3. Run migration:
```bash
node src/ai_cicd_system/database/setup.js
```

### Custom API Endpoints

Add new endpoints to `src/ai_cicd_system/api/database_endpoints.js`:

```javascript
// New endpoint example
router.get('/custom-endpoint',
    checkPermission('read:custom'),
    async (req, res) => {
        try {
            const result = await poolManager.query(
                'SELECT * FROM custom_table',
                [],
                { poolName: 'readonly' }
            );
            res.json({ data: result.rows });
        } catch (error) {
            res.status(500).json({ error: 'Query failed' });
        }
    }
);
```

## Troubleshooting

### Common Issues

#### Connection Pool Exhaustion
```bash
# Check pool status
curl -H "X-API-Key: your_key" http://localhost:3000/api/database/metrics

# Increase pool size
export DB_POOL_MAX=20
```

#### Slow Queries
```sql
-- Identify slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
WHERE mean_time > 5000
ORDER BY total_time DESC;

-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100;
```

#### High Memory Usage
```sql
-- Check table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Error Codes

Common API error codes:
- `MISSING_API_KEY`: API key not provided
- `INVALID_API_KEY`: API key not found or invalid
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `VALIDATION_ERROR`: Request validation failed
- `QUERY_EXECUTION_ERROR`: Database query failed

### Support

For additional support:

1. Check the [main documentation](../../../docs/database_schema.md)
2. Review system logs and metrics
3. Consult the troubleshooting section above
4. Contact the development team with specific error details

## Performance Benchmarks

### Expected Performance

- **Connection Pool**: 2-10 connections per pool
- **Query Response**: <100ms for simple queries, <1s for complex
- **API Throughput**: 100+ requests/minute per API key
- **Database Size**: Scales to 100GB+ with proper maintenance

### Optimization Tips

1. **Use Appropriate Pools**: readonly for analytics, priority for critical ops
2. **Implement Caching**: Cache frequently accessed data
3. **Monitor Metrics**: Regular performance monitoring
4. **Optimize Queries**: Use EXPLAIN ANALYZE for query optimization
5. **Regular Maintenance**: Run cleanup functions regularly

---

*This implementation provides a production-ready database solution for AI CI/CD task management with enterprise-grade security, monitoring, and scalability features.*
