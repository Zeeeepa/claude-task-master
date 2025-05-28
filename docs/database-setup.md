# Database Setup and Deployment Guide

This guide provides comprehensive instructions for setting up the PostgreSQL database schema and configuring Cloudflare exposure for the AI CI/CD system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Schema Setup](#database-schema-setup)
3. [Cloudflare Tunnel Configuration](#cloudflare-tunnel-configuration)
4. [Environment Configuration](#environment-configuration)
5. [Connection Testing](#connection-testing)
6. [Security Configuration](#security-configuration)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- PostgreSQL 13+ (recommended: PostgreSQL 15+)
- Node.js 18+ with npm
- Cloudflared CLI tool
- SSL certificates (for production)

### Required Accounts

- Cloudflare account with domain management
- PostgreSQL hosting service (or local installation)

## Database Schema Setup

### 1. Initial Database Creation

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database and user
CREATE DATABASE "codegen-taskmaster-db";
CREATE USER software_developer WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE "codegen-taskmaster-db" TO software_developer;

# Connect to the new database
\c codegen-taskmaster-db

# Grant schema permissions
GRANT ALL ON SCHEMA public TO software_developer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO software_developer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO software_developer;
```

### 2. Run Database Migrations

```bash
# Navigate to project directory
cd /path/to/claude-task-master

# Install dependencies
npm install

# Run initial schema migration
node src/ai_cicd_system/database/migrations/runner.js

# Or run migrations manually
psql -U software_developer -d codegen-taskmaster-db -f src/ai_cicd_system/database/migrations/001_initial_schema.sql
psql -U software_developer -d codegen-taskmaster-db -f src/ai_cicd_system/database/migrations/002_enhanced_cicd_schema.sql
```

### 3. Verify Schema Installation

```sql
-- Check tables
\dt

-- Check views
\dv

-- Check functions
\df

-- Verify sample data
SELECT * FROM prompt_templates;
SELECT * FROM deployment_scripts;
```

## Cloudflare Tunnel Configuration

### 1. Install Cloudflared

```bash
# On Ubuntu/Debian
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# On macOS
brew install cloudflared

# On Windows
# Download from https://github.com/cloudflare/cloudflared/releases
```

### 2. Authenticate with Cloudflare

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create codegen-taskmaster-db-tunnel

# Note the tunnel ID from the output
```

### 3. Configure DNS Records

Add the following DNS records in your Cloudflare dashboard:

```
Type: CNAME
Name: db.codegen-taskmaster
Target: <tunnel-id>.cfargotunnel.com

Type: CNAME  
Name: api.codegen-taskmaster
Target: <tunnel-id>.cfargotunnel.com

Type: CNAME
Name: health.codegen-taskmaster
Target: <tunnel-id>.cfargotunnel.com
```

### 4. Deploy Tunnel Configuration

```bash
# Copy the tunnel configuration
cp cloudflare/tunnel-config.yml ~/.cloudflared/config.yml

# Update the configuration with your domain
sed -i 's/your-domain.com/yourdomain.com/g' ~/.cloudflared/config.yml

# Start the tunnel
cloudflared tunnel run codegen-taskmaster-db-tunnel

# Or install as a service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

## Environment Configuration

### 1. Create Environment File

```bash
# Copy the example environment file
cp .env.example .env
```

### 2. Configure Database Settings

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=your_secure_password
DB_SSL_MODE=require

# Connection Pool Settings
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=10000
DB_POOL_ACQUIRE_TIMEOUT=30000

# Cloudflare Tunnel Settings
CLOUDFLARE_TUNNEL_ENABLED=true
CLOUDFLARE_TUNNEL_URL=db.codegen-taskmaster.yourdomain.com
CLOUDFLARE_API_URL=api.codegen-taskmaster.yourdomain.com
CLOUDFLARE_HEALTH_URL=health.codegen-taskmaster.yourdomain.com

# External Access Settings
EXTERNAL_ACCESS_ENABLED=true
ALLOWED_ORIGINS=https://codegen.sh,https://api.codegen.sh
CODEGEN_API_KEY=your_codegen_api_key
CLAUDE_CODE_API_KEY=your_claude_code_api_key

# Security Settings
DB_ENCRYPTION_ENABLED=true
DB_ENCRYPTION_KEY=your_32_character_encryption_key
ACCESS_CONTROL_ENABLED=true
AUDIT_LOG_CONNECTIONS=true

# Monitoring Settings
DB_LOG_QUERIES=false
DB_LOG_SLOW_QUERIES=true
DB_SLOW_QUERY_THRESHOLD=1000
EXTERNAL_MONITORING_ENABLED=true
```

### 3. SSL Certificate Configuration

For production environments, configure SSL certificates:

```bash
# Generate SSL certificates (if not using managed certificates)
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes

# Set certificate paths in environment
DB_SSL_CA=/path/to/ca-certificate.crt
DB_SSL_CERT=/path/to/client-certificate.crt
DB_SSL_KEY=/path/to/client-key.key
```

## Connection Testing

### 1. Test Local Database Connection

```javascript
// test-db-connection.js
import { initializeDatabase } from './src/ai_cicd_system/database/connection.js';

async function testConnection() {
    try {
        const db = await initializeDatabase();
        const health = db.getHealth();
        console.log('Database connection successful:', health);
        
        // Test query
        const result = await db.query('SELECT NOW() as current_time');
        console.log('Test query result:', result.rows[0]);
        
        await db.shutdown();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
}

testConnection();
```

```bash
# Run the test
node test-db-connection.js
```

### 2. Test Cloudflare Tunnel Connection

```bash
# Test tunnel connectivity
curl -v https://health.codegen-taskmaster.yourdomain.com/health

# Test database connection through tunnel
psql "postgresql://software_developer:password@db.codegen-taskmaster.yourdomain.com:5432/codegen-taskmaster-db?sslmode=require"
```

### 3. Test External API Access

```javascript
// test-external-access.js
import { cloudflareDbConfig } from './src/config/database.js';

async function testExternalAccess() {
    const connectionString = `postgresql://${cloudflareDbConfig.credentials.username}:${cloudflareDbConfig.credentials.password}@${cloudflareDbConfig.credentials.host}:${cloudflareDbConfig.credentials.port}/${cloudflareDbConfig.credentials.database}?sslmode=${cloudflareDbConfig.credentials.ssl_mode}`;
    
    console.log('External connection string:', connectionString);
    
    // Test with pg client
    const { Client } = await import('pg');
    const client = new Client(connectionString);
    
    try {
        await client.connect();
        const result = await client.query('SELECT version()');
        console.log('External connection successful:', result.rows[0]);
    } catch (error) {
        console.error('External connection failed:', error);
    } finally {
        await client.end();
    }
}

testExternalAccess();
```

## Security Configuration

### 1. Database Security

```sql
-- Create read-only user for monitoring
CREATE USER codegen_reader WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE "codegen-taskmaster-db" TO codegen_reader;
GRANT USAGE ON SCHEMA public TO codegen_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO codegen_reader;

-- Create application user with limited permissions
CREATE USER codegen_writer WITH PASSWORD 'writer_password';
GRANT CONNECT ON DATABASE "codegen-taskmaster-db" TO codegen_writer;
GRANT USAGE ON SCHEMA public TO codegen_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO codegen_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO codegen_writer;

-- Enable row-level security (optional)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
```

### 2. Cloudflare Security

```yaml
# Add to tunnel-config.yml
security:
  ddosProtection: true
  rateLimit:
    threshold: 1000
    period: 60s
  allowedIPs:
    - 192.168.1.0/24  # Your office network
    - 10.0.0.0/8      # Your VPC network
```

### 3. Application Security

```javascript
// Add to your application startup
import { validateCloudflareConfig } from './src/config/database.js';

const validation = validateCloudflareConfig();
if (!validation.valid) {
    console.error('Security validation failed:', validation.errors);
    process.exit(1);
}
```

## Monitoring and Maintenance

### 1. Health Monitoring

```javascript
// health-check.js
import { getConnection } from './src/ai_cicd_system/database/connection.js';

async function healthCheck() {
    const db = getConnection();
    const health = db.getHealth();
    const metrics = db.getMetrics();
    
    console.log('Database Health:', health);
    console.log('Performance Metrics:', metrics);
    
    // Check for issues
    if (!health.connected) {
        console.error('Database not connected!');
        return false;
    }
    
    if (metrics.slowQueryRate > 10) {
        console.warn('High slow query rate:', metrics.slowQueryRate + '%');
    }
    
    return true;
}

// Run health check every 30 seconds
setInterval(healthCheck, 30000);
```

### 2. Log Monitoring

```javascript
// log-monitor.js
import { SystemLog } from './src/ai_cicd_system/database/models/SystemLog.js';

async function monitorLogs() {
    // Get recent errors
    const errors = await SystemLog.getErrors({ hours: 1 });
    if (errors.length > 0) {
        console.error(`Found ${errors.length} errors in the last hour`);
        errors.forEach(error => {
            console.error(`[${error.component}] ${error.message}`);
        });
    }
    
    // Get system health summary
    const health = await SystemLog.getHealthSummary();
    console.log('System Health Summary:', health);
}

// Run log monitoring every 5 minutes
setInterval(monitorLogs, 5 * 60 * 1000);
```

### 3. Database Maintenance

```sql
-- Regular maintenance queries
-- Analyze table statistics
ANALYZE;

-- Vacuum tables
VACUUM ANALYZE;

-- Check for slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check connection counts
SELECT count(*) as connection_count, state 
FROM pg_stat_activity 
GROUP BY state;

-- Check database size
SELECT pg_size_pretty(pg_database_size('codegen-taskmaster-db'));
```

### 4. Automated Cleanup

```javascript
// cleanup.js
import { SystemLog } from './src/ai_cicd_system/database/models/SystemLog.js';

async function dailyCleanup() {
    // Clean up old logs (keep 90 days)
    const deletedLogs = await SystemLog.cleanup(90);
    console.log(`Cleaned up ${deletedLogs} old log entries`);
    
    // Clean up old audit logs
    const db = getConnection();
    const result = await db.query(`
        DELETE FROM audit_logs 
        WHERE timestamp < NOW() - INTERVAL '90 days'
    `);
    console.log(`Cleaned up ${result.rowCount} old audit entries`);
}

// Run daily at 2 AM
const schedule = require('node-cron');
schedule.schedule('0 2 * * *', dailyCleanup);
```

## Troubleshooting

### Common Issues

#### 1. Connection Refused

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if port is open
netstat -tlnp | grep 5432

# Check firewall
sudo ufw status
```

#### 2. SSL Connection Issues

```bash
# Test SSL connection
psql "postgresql://software_developer:password@localhost:5432/codegen-taskmaster-db?sslmode=require"

# Check SSL configuration
SELECT name, setting FROM pg_settings WHERE name LIKE 'ssl%';
```

#### 3. Cloudflare Tunnel Issues

```bash
# Check tunnel status
cloudflared tunnel info codegen-taskmaster-db-tunnel

# Check tunnel logs
journalctl -u cloudflared -f

# Test tunnel connectivity
curl -v https://db.codegen-taskmaster.yourdomain.com
```

#### 4. Permission Issues

```sql
-- Check user permissions
\du

-- Check table permissions
\dp

-- Grant missing permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO software_developer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO software_developer;
```

### Performance Issues

#### 1. Slow Queries

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
WHERE mean_time > 1000
ORDER BY mean_time DESC;
```

#### 2. Connection Pool Issues

```javascript
// Monitor connection pool
const db = getConnection();
const poolStats = db._getPoolStats();
console.log('Pool Stats:', poolStats);

// Adjust pool settings if needed
// Increase max connections if pool is exhausted
// Decrease if too many idle connections
```

### Monitoring Commands

```bash
# Database status
sudo systemctl status postgresql

# Cloudflare tunnel status
sudo systemctl status cloudflared

# Check disk space
df -h

# Check memory usage
free -h

# Check CPU usage
top

# Check network connectivity
ping db.codegen-taskmaster.yourdomain.com
```

## Backup and Recovery

### 1. Database Backup

```bash
# Create backup
pg_dump -U software_developer -h localhost -d codegen-taskmaster-db > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U software_developer -h localhost -d codegen-taskmaster-db | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

### 2. Database Restore

```bash
# Restore from backup
psql -U software_developer -h localhost -d codegen-taskmaster-db < backup_20250528_120000.sql

# Or from compressed backup
gunzip -c backup_20250528_120000.sql.gz | psql -U software_developer -h localhost -d codegen-taskmaster-db
```

## Production Deployment Checklist

- [ ] PostgreSQL installed and configured
- [ ] Database schema deployed
- [ ] SSL certificates configured
- [ ] Cloudflare tunnel configured and running
- [ ] DNS records configured
- [ ] Environment variables set
- [ ] Security settings configured
- [ ] Monitoring enabled
- [ ] Backup strategy implemented
- [ ] Connection testing completed
- [ ] Performance testing completed
- [ ] Documentation updated

## Support and Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Node.js pg Documentation](https://node-postgres.com/)
- [Project Repository](https://github.com/Zeeeepa/claude-task-master)

For additional support, please refer to the project's issue tracker or contact the development team.

