# PostgreSQL Database Schema & Cloudflare Integration

## 🎯 Overview

This directory contains the comprehensive PostgreSQL database implementation for the AI-Powered CI/CD System. It provides a complete database foundation with Cloudflare integration for secure, scalable, and performant data management.

## 📁 Directory Structure

```
src/database/
├── schema.sql              # Complete database schema definition
├── connection.js           # Enhanced database connection manager
├── migrations/             # Database migration system
│   ├── 001_comprehensive_schema.sql  # Initial schema migration
│   └── runner.js          # Migration runner and CLI
└── README.md              # This documentation
```

## 🗄️ Database Schema

### Core Tables

#### 1. **Tasks Table**
Stores task details, requirements, status, and dependencies.

**Key Fields:**
- `id` (UUID) - Primary key
- `title`, `description` - Task information
- `type` - Task type (bug, feature, enhancement, etc.)
- `status` - Current status (pending, in_progress, completed, etc.)
- `priority` - Priority level (0-10)
- `complexity_score` - Complexity rating (1-10)
- `requirements`, `acceptance_criteria` - JSONB arrays
- `linear_issue_id`, `github_pr_url` - Integration references
- `assigned_to` - Assignee identifier
- `estimated_hours`, `actual_hours` - Time tracking

#### 2. **Workflows Table**
Tracks CI/CD pipeline stages and execution states.

**Key Fields:**
- `workflow_id` - Unique workflow identifier
- `task_id` - Associated task reference
- `status` - Workflow status (pending, running, completed, etc.)
- `current_stage` - Current execution stage
- `total_stages`, `completed_stages` - Progress tracking
- `pipeline_config` - JSONB configuration
- `stage_results` - JSONB array of stage results

#### 3. **Integrations Table**
Manages connections to Linear, AgentAPI, Claude Code, and other services.

**Key Fields:**
- `name`, `type` - Integration identification
- `config`, `credentials` - JSONB configuration (encrypted)
- `status`, `health_status` - Current state
- `rate_limit_config` - Rate limiting settings
- `usage_stats` - Usage tracking
- `error_count`, `last_error` - Error monitoring

#### 4. **Logs Table**
Comprehensive logging for debugging and monitoring.

**Key Fields:**
- `level` - Log level (debug, info, warn, error, fatal)
- `message` - Log message
- `source`, `component` - Origin identification
- `task_id`, `workflow_id`, `integration_id` - Entity references
- `context` - JSONB additional context
- `correlation_id` - Request correlation

#### 5. **Templates Table**
Stores prompt templates for Codegen integration.

**Key Fields:**
- `name`, `type` - Template identification
- `template_content` - Template text with variables
- `variables` - JSONB array of template variables
- `category` - Template category
- `usage_count`, `success_rate` - Performance metrics

#### 6. **Deployments Table**
Tracks deployment history and status.

**Key Fields:**
- `deployment_id` - Unique deployment identifier
- `environment` - Target environment
- `deployment_type` - Type of deployment
- `source_branch`, `target_branch` - Git references
- `commit_sha`, `pr_number` - Version control info
- `deployment_config` - JSONB configuration
- `health_checks` - JSONB health check results

### Relationship Tables

- **task_dependencies** - Task relationships and dependencies
- **workflow_stages** - Individual stages within workflows
- **integration_events** - Integration usage tracking

### Audit & Monitoring

- **audit_logs** - Complete audit trail for all changes
- **performance_metrics** - System performance tracking

## 🔗 Cloudflare Integration

### Features

1. **Secure Database Access**
   - SSL/TLS encryption for all connections
   - API token authentication
   - Rate limiting and DDoS protection

2. **Cloudflare Workers**
   - Database proxy for secure access
   - Edge computing for reduced latency
   - Automatic scaling and load balancing

3. **Performance Optimization**
   - Connection pooling
   - Query caching at the edge
   - Compression and minification

4. **Security Headers**
   - Content Security Policy (CSP)
   - HTTP Strict Transport Security (HSTS)
   - X-Frame-Options and other security headers

### Configuration

The Cloudflare integration is configured through environment variables:

```bash
# Cloudflare Worker
CLOUDFLARE_WORKER_URL=https://your-worker.your-domain.workers.dev
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ZONE_ID=your-zone-id

# Rate Limiting
CLOUDFLARE_RATE_LIMIT_RPM=1000
CLOUDFLARE_BURST_LIMIT=100

# SSL/TLS
CLOUDFLARE_SSL_MODE=full_strict
CLOUDFLARE_MIN_TLS_VERSION=1.2

# Security
CLOUDFLARE_HSTS_ENABLED=true
CLOUDFLARE_HSTS_MAX_AGE=31536000
```

## 🚀 Getting Started

### 1. Database Setup

```bash
# Set environment variables
export DB_HOST=your-cloudflare-url
export DB_PORT=5432
export DB_NAME=codegen-taskmaster-db
export DB_USER=software_developer
export DB_PASSWORD=your-secure-password
export DB_SSL_MODE=require

# Initialize database
npm run db:migrate
```

### 2. Run Migrations

```bash
# Check migration status
npm run db:status

# Run all pending migrations
npm run db:migrate

# Create new migration
npm run db:create-migration "add_new_feature"

# Validate migrations
npm run db:validate
```

### 3. Start API Server

```bash
# Set API configuration
export API_PORT=3000
export API_KEY=your-api-key
export CORS_ORIGINS=https://your-domain.com

# Start the server
npm run api:start
```

## 📡 API Endpoints

### Base URL
```
https://your-worker.your-domain.workers.dev/api/v1
```

### Authentication
All API requests require authentication via:
- **API Key**: Include `X-API-Key` header
- **JWT Token**: Include `Authorization: Bearer <token>` header

### Endpoints

#### Tasks
- `GET /tasks` - List tasks with filtering
- `GET /tasks/:id` - Get single task
- `POST /tasks` - Create new task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

#### Workflows
- `GET /workflows` - List workflows
- `POST /workflows` - Create workflow
- `PUT /workflows/:id` - Update workflow

#### Integrations
- `GET /integrations` - List integrations
- `PUT /integrations/:id/status` - Update integration status

#### Logs
- `GET /logs` - Retrieve logs with filtering
- `POST /logs` - Create log entry

#### Templates
- `GET /templates` - List templates
- `POST /templates` - Create template

#### Deployments
- `GET /deployments` - List deployments
- `POST /deployments` - Create deployment

### Example Requests

#### Create Task
```bash
curl -X POST https://your-worker.your-domain.workers.dev/api/v1/tasks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication system",
    "type": "feature",
    "priority": 8,
    "complexity_score": 7,
    "requirements": ["JWT library", "User model", "Auth middleware"],
    "acceptance_criteria": ["Login works", "Token validation", "Logout functionality"]
  }'
```

#### Get Tasks
```bash
curl -X GET "https://your-worker.your-domain.workers.dev/api/v1/tasks?status=pending&limit=10" \
  -H "X-API-Key: your-api-key"
```

## 🔧 Configuration

### Database Connection

```javascript
import { DatabaseConnection } from './database/connection.js';

const db = new DatabaseConnection({
    host: 'your-cloudflare-url',
    port: 5432,
    database: 'codegen-taskmaster-db',
    user: 'software_developer',
    password: 'your-secure-password',
    ssl: { rejectUnauthorized: false },
    cloudflare: {
        enabled: true,
        worker_url: 'https://your-worker.your-domain.workers.dev',
        api_token: 'your-api-token'
    }
});

await db.initialize();
```

### API Server

```javascript
import { DatabaseAPIServer } from './api/database-endpoints.js';

const server = new DatabaseAPIServer({
    port: 3000,
    cors_origins: ['https://your-domain.com'],
    rate_limit_rpm: 1000,
    enable_auth: true,
    api_key: 'your-api-key'
});

await server.start();
```

## 🧪 Testing

### Unit Tests
```bash
npm test src/database/connection.test.js
npm test src/database/migrations/runner.test.js
npm test src/api/database-endpoints.test.js
```

### Integration Tests
```bash
# Requires test database
export DB_TEST_URL=postgresql://test_user:test_password@localhost:5432/test_db
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

## 📊 Monitoring

### Health Checks

```bash
# Database health
curl https://your-worker.your-domain.workers.dev/health

# API health
curl https://your-api-server.com/health
```

### Performance Metrics

The system tracks:
- Query execution times
- Connection pool statistics
- API response times
- Error rates
- Rate limiting statistics

### Logging

Logs are stored in the `logs` table with structured data:
- Log levels (debug, info, warn, error, fatal)
- Source and component identification
- Correlation IDs for request tracking
- Contextual information in JSONB format

## 🔒 Security

### Database Security
- SSL/TLS encryption for all connections
- Parameterized queries to prevent SQL injection
- Input validation and sanitization
- Audit logging for all changes

### API Security
- Authentication required for all endpoints
- Rate limiting to prevent abuse
- CORS configuration for cross-origin requests
- Security headers (CSP, HSTS, etc.)
- Request size limits

### Cloudflare Security
- DDoS protection
- Web Application Firewall (WAF)
- Bot management
- SSL/TLS termination

## 🚨 Troubleshooting

### Common Issues

1. **Connection Timeout**
   ```bash
   # Check database connectivity
   npm run db:health
   
   # Verify Cloudflare Worker status
   curl https://your-worker.your-domain.workers.dev/health
   ```

2. **Migration Failures**
   ```bash
   # Validate migrations
   npm run db:validate
   
   # Check migration status
   npm run db:status
   
   # Rollback if needed
   npm run db:rollback 001
   ```

3. **API Errors**
   ```bash
   # Check API logs
   npm run api:logs
   
   # Verify authentication
   curl -H "X-API-Key: your-key" https://your-api/health
   ```

### Debug Mode

Enable debug mode for detailed logging:

```bash
export DEBUG_MODE=true
export DB_LOG_QUERIES=true
export DB_LOG_SLOW_QUERIES=true
```

## 📈 Performance Optimization

### Database Optimization
- Comprehensive indexing on frequently queried columns
- Connection pooling with configurable limits
- Query timeout and retry logic
- Slow query monitoring and logging

### Cloudflare Optimization
- Edge caching for static content
- Compression (Brotli/Gzip)
- HTTP/2 and HTTP/3 support
- Minification of CSS/JS/HTML

### API Optimization
- Response compression
- Pagination for large datasets
- Efficient query patterns
- Connection reuse

## 🔄 Backup and Recovery

### Automated Backups
Configure automated backups through your PostgreSQL provider or Cloudflare.

### Manual Backup
```bash
# Create backup
pg_dump $DATABASE_URL > backup.sql

# Restore backup
psql $DATABASE_URL < backup.sql
```

### Migration Rollback
```bash
# Rollback to specific version
npm run db:rollback 001

# Reset all migrations (DANGEROUS)
npm run db:reset --confirm
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Express.js Documentation](https://expressjs.com/)
- [Node.js PostgreSQL Client (pg)](https://node-postgres.com/)

## 🤝 Contributing

When contributing to the database implementation:

1. **Follow schema conventions** - Use proper naming and constraints
2. **Add comprehensive tests** - Unit, integration, and performance tests
3. **Update migrations** - Create migration scripts for schema changes
4. **Document changes** - Update this README and code comments
5. **Test performance** - Ensure changes don't degrade performance
6. **Validate security** - Review for security implications

## 📄 License

This database implementation is part of the TaskMaster AI CI/CD System and follows the same license terms.

