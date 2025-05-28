# PostgreSQL Database Deployment Guide

## 🎯 Overview

This guide provides comprehensive instructions for deploying the PostgreSQL database schema and integration layer for the AI CI/CD system. It covers everything from initial setup to production deployment and monitoring.

## 📋 Prerequisites

### System Requirements
- **PostgreSQL**: Version 13 or higher
- **Node.js**: Version 18 or higher with ES modules support
- **Memory**: Minimum 4GB RAM (8GB+ recommended for production)
- **Storage**: SSD storage recommended for optimal performance
- **Network**: Stable network connection for database operations

### Required Extensions
```sql
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- For performance monitoring
```

### Environment Setup
```bash
# Install Node.js dependencies
npm install

# Install PostgreSQL client tools (if not already installed)
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql

# Windows
# Download from https://www.postgresql.org/download/windows/
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=your_secure_password_here
DB_SSL_MODE=prefer

# Connection Pool Configuration
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=10000
DB_POOL_ACQUIRE_TIMEOUT=30000
DB_POOL_CREATE_TIMEOUT=30000
DB_POOL_DESTROY_TIMEOUT=5000
DB_POOL_REAP_INTERVAL=1000
DB_POOL_CREATE_RETRY_INTERVAL=200

# Query Configuration
DB_QUERY_TIMEOUT=60000

# Retry Configuration
DB_RETRY_MAX_ATTEMPTS=3
DB_RETRY_DELAY_MS=1000
DB_RETRY_BACKOFF_FACTOR=2

# Health Check Configuration
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000
DB_HEALTH_CHECK_TIMEOUT=5000

# Migration Configuration
DB_MIGRATIONS_TABLE=schema_migrations
DB_MIGRATIONS_DIR=./src/ai_cicd_system/database/migrations

# Audit Configuration
DB_AUDIT_ENABLED=true
DB_AUDIT_RETENTION_DAYS=90

# Performance Monitoring
DB_SLOW_QUERY_THRESHOLD=1000
DB_LOG_QUERIES=false
DB_LOG_SLOW_QUERIES=true
```

### Production Environment Variables

For production deployments, use more secure configurations:

```bash
# Production Database Connection
DB_HOST=your-production-db-host.com
DB_PORT=5432
DB_NAME=codegen_taskmaster_prod
DB_USER=app_user
DB_PASSWORD=your_very_secure_password_here
DB_SSL_MODE=require

# Production Pool Configuration (higher limits)
DB_POOL_MIN=5
DB_POOL_MAX=25
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_ACQUIRE_TIMEOUT=60000

# Production Monitoring (more verbose)
DB_LOG_SLOW_QUERIES=true
DB_SLOW_QUERY_THRESHOLD=500

# Production Health Checks (more frequent)
DB_HEALTH_CHECK_INTERVAL=15000
DB_HEALTH_CHECK_TIMEOUT=3000
```

## 🗄️ Database Setup

### 1. Create Database and User

```sql
-- Connect as PostgreSQL superuser
sudo -u postgres psql

-- Create database
CREATE DATABASE "codegen-taskmaster-db" 
    WITH ENCODING 'UTF8' 
    LC_COLLATE='en_US.UTF-8' 
    LC_CTYPE='en_US.UTF-8';

-- Create application user
CREATE USER software_developer WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "codegen-taskmaster-db" TO software_developer;

-- Connect to the new database
\c "codegen-taskmaster-db"

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO software_developer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO software_developer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO software_developer;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Exit psql
\q
```

### 2. Configure PostgreSQL

Edit your PostgreSQL configuration files:

#### postgresql.conf
```ini
# Memory Configuration
shared_buffers = 256MB                  # 25% of RAM for dedicated server
effective_cache_size = 1GB              # 75% of RAM
work_mem = 4MB                          # Per-operation memory
maintenance_work_mem = 64MB             # Maintenance operations

# Connection Configuration
max_connections = 100                   # Adjust based on your needs
listen_addresses = '*'                  # Or specific IPs for security

# Performance Configuration
random_page_cost = 1.1                  # For SSD storage
effective_io_concurrency = 200          # For SSD storage
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Logging Configuration
log_statement = 'mod'                   # Log modifications
log_duration = on
log_min_duration_statement = 1000      # Log slow queries (1 second)
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

# Extensions
shared_preload_libraries = 'pg_stat_statements'
```

#### pg_hba.conf
```ini
# Allow local connections
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5

# Allow application connections (adjust IP ranges as needed)
host    codegen-taskmaster-db    software_developer    10.0.0.0/8    md5
host    codegen-taskmaster-db    software_developer    172.16.0.0/12 md5
host    codegen-taskmaster-db    software_developer    192.168.0.0/16 md5
```

### 3. Restart PostgreSQL

```bash
# Ubuntu/Debian
sudo systemctl restart postgresql

# macOS (if using Homebrew)
brew services restart postgresql

# Or manually
sudo service postgresql restart
```

## 🚀 Migration Deployment

### 1. Verify Connection

```bash
# Test database connection
npm run db:test-connection

# Or manually test
psql -h localhost -p 5432 -U software_developer -d codegen-taskmaster-db -c "SELECT version();"
```

### 2. Run Migrations

```bash
# Check migration status
npm run migrate:status

# Run all pending migrations
npm run migrate

# Or run migrations manually
node src/ai_cicd_system/database/migrations/runner.js
```

### 3. Verify Schema

```bash
# Verify schema deployment
npm run db:verify

# Check tables manually
psql -h localhost -p 5432 -U software_developer -d codegen-taskmaster-db -c "\dt"
```

### 4. Seed Initial Data (Optional)

```bash
# Run data seeding if needed
npm run db:seed

# Or manually insert initial data
psql -h localhost -p 5432 -U software_developer -d codegen-taskmaster-db -f scripts/seed_data.sql
```

## 📊 Performance Optimization

### 1. Run Performance Benchmarks

```bash
# Run comprehensive benchmarks
npm run db:benchmark

# Run specific benchmark categories
npm run db:benchmark -- --category=basic
npm run db:benchmark -- --category=cicd
npm run db:benchmark -- --category=concurrent
```

### 2. Analyze Query Performance

```sql
-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;

-- Check table statistics
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC;
```

### 3. Optimize Configuration

Based on benchmark results, adjust PostgreSQL settings:

```sql
-- Update statistics for better query planning
ANALYZE;

-- Reindex if needed
REINDEX DATABASE "codegen-taskmaster-db";

-- Update configuration
ALTER SYSTEM SET work_mem = '8MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
SELECT pg_reload_conf();
```

## 🔍 Monitoring Setup

### 1. Enable Query Statistics

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Reset statistics
SELECT pg_stat_statements_reset();
```

### 2. Create Monitoring Views

```sql
-- Create monitoring views
CREATE OR REPLACE VIEW db_performance_summary AS
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    stddev_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY mean_time DESC;

-- Create connection monitoring view
CREATE OR REPLACE VIEW db_connections AS
SELECT 
    state,
    count(*) as connection_count,
    max(now() - state_change) as max_duration
FROM pg_stat_activity 
WHERE state IS NOT NULL
GROUP BY state;
```

### 3. Set Up Alerts

Create monitoring scripts for critical metrics:

```bash
#!/bin/bash
# monitor_db.sh

# Check connection count
CONNECTIONS=$(psql -h localhost -U software_developer -d codegen-taskmaster-db -t -c "SELECT count(*) FROM pg_stat_activity;")
if [ "$CONNECTIONS" -gt 80 ]; then
    echo "WARNING: High connection count: $CONNECTIONS"
fi

# Check slow queries
SLOW_QUERIES=$(psql -h localhost -U software_developer -d codegen-taskmaster-db -t -c "SELECT count(*) FROM pg_stat_statements WHERE mean_time > 1000;")
if [ "$SLOW_QUERIES" -gt 5 ]; then
    echo "WARNING: $SLOW_QUERIES slow queries detected"
fi

# Check database size
DB_SIZE=$(psql -h localhost -U software_developer -d codegen-taskmaster-db -t -c "SELECT pg_size_pretty(pg_database_size('codegen-taskmaster-db'));")
echo "Database size: $DB_SIZE"
```

## 🔒 Security Configuration

### 1. Database Security

```sql
-- Create read-only user for monitoring
CREATE USER monitor_user WITH PASSWORD 'monitor_password';
GRANT CONNECT ON DATABASE "codegen-taskmaster-db" TO monitor_user;
GRANT USAGE ON SCHEMA public TO monitor_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_user;

-- Create backup user
CREATE USER backup_user WITH PASSWORD 'backup_password';
GRANT CONNECT ON DATABASE "codegen-taskmaster-db" TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;

-- Revoke unnecessary privileges
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

### 2. SSL Configuration

```bash
# Generate SSL certificates (for production)
openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key -subj "/CN=your-db-host.com"

# Set permissions
chmod 600 server.key
chown postgres:postgres server.key server.crt

# Update postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

### 3. Network Security

```bash
# Configure firewall (Ubuntu/Debian)
sudo ufw allow from 10.0.0.0/8 to any port 5432
sudo ufw allow from 172.16.0.0/12 to any port 5432
sudo ufw allow from 192.168.0.0/16 to any port 5432

# Or use iptables
sudo iptables -A INPUT -p tcp --dport 5432 -s 10.0.0.0/8 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -j DROP
```

## 💾 Backup and Recovery

### 1. Automated Backups

```bash
#!/bin/bash
# backup_db.sh

BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="codegen-taskmaster-db"

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
pg_dump -h localhost -U backup_user -d $DB_NAME -f "$BACKUP_DIR/full_backup_$DATE.sql"

# Compressed backup
pg_dump -h localhost -U backup_user -d $DB_NAME | gzip > "$BACKUP_DIR/full_backup_$DATE.sql.gz"

# Schema-only backup
pg_dump -h localhost -U backup_user -d $DB_NAME --schema-only -f "$BACKUP_DIR/schema_backup_$DATE.sql"

# Data-only backup
pg_dump -h localhost -U backup_user -d $DB_NAME --data-only -f "$BACKUP_DIR/data_backup_$DATE.sql"

# Clean up old backups (keep last 7 days)
find $BACKUP_DIR -name "*.sql*" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### 2. Schedule Backups

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/backup_db.sh

# Weekly full backup on Sunday at 1 AM
0 1 * * 0 /path/to/backup_db.sh
```

### 3. Recovery Procedures

```bash
# Restore from backup
psql -h localhost -U software_developer -d codegen-taskmaster-db -f /var/backups/postgresql/full_backup_20231201_020000.sql

# Restore compressed backup
gunzip -c /var/backups/postgresql/full_backup_20231201_020000.sql.gz | psql -h localhost -U software_developer -d codegen-taskmaster-db

# Point-in-time recovery (if WAL archiving is enabled)
pg_basebackup -h localhost -U backup_user -D /var/lib/postgresql/backup -Ft -z -P
```

## 🚀 Production Deployment

### 1. Pre-deployment Checklist

- [ ] Database server provisioned and configured
- [ ] SSL certificates installed and configured
- [ ] Firewall rules configured
- [ ] Backup system configured and tested
- [ ] Monitoring system configured
- [ ] Performance benchmarks completed
- [ ] Security audit completed
- [ ] Documentation updated

### 2. Deployment Steps

```bash
# 1. Deploy to staging environment first
export NODE_ENV=staging
npm run migrate
npm run db:verify
npm run db:benchmark

# 2. Run integration tests
npm run test:integration

# 3. Deploy to production
export NODE_ENV=production
npm run migrate
npm run db:verify

# 4. Verify production deployment
npm run db:health-check
npm run db:performance-check
```

### 3. Post-deployment Verification

```bash
# Check application connectivity
npm run app:health-check

# Verify all services are running
systemctl status postgresql
systemctl status your-app-service

# Check logs for errors
tail -f /var/log/postgresql/postgresql-13-main.log
tail -f /var/log/your-app/app.log

# Run smoke tests
npm run test:smoke
```

## 🔧 Troubleshooting

### Common Issues

#### Connection Issues
```bash
# Check if PostgreSQL is running
systemctl status postgresql

# Check port availability
netstat -tlnp | grep 5432

# Test connection
psql -h localhost -p 5432 -U software_developer -d codegen-taskmaster-db -c "SELECT 1;"
```

#### Performance Issues
```sql
-- Check for blocking queries
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
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
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
WHERE NOT blocked_locks.GRANTED;
```

#### Migration Issues
```bash
# Check migration status
npm run migrate:status

# Rollback last migration
npm run migrate:rollback

# Force migration (use with caution)
npm run migrate:force
```

### Log Analysis

```bash
# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-13-main.log

# Check application logs
tail -f logs/database.log

# Search for specific errors
grep -i "error" /var/log/postgresql/postgresql-13-main.log
grep -i "slow query" /var/log/postgresql/postgresql-13-main.log
```

## 📈 Performance Tuning

### Query Optimization

```sql
-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM tasks WHERE status = 'pending';

-- Update table statistics
ANALYZE tasks;

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;
```

### Configuration Tuning

```sql
-- Memory settings
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
ALTER SYSTEM SET work_mem = '8MB';

-- Checkpoint settings
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';

-- Reload configuration
SELECT pg_reload_conf();
```

## 📞 Support and Maintenance

### Regular Maintenance Tasks

```bash
# Weekly maintenance script
#!/bin/bash
# weekly_maintenance.sh

# Update table statistics
psql -h localhost -U software_developer -d codegen-taskmaster-db -c "ANALYZE;"

# Vacuum tables
psql -h localhost -U software_developer -d codegen-taskmaster-db -c "VACUUM ANALYZE;"

# Check for unused indexes
psql -h localhost -U software_developer -d codegen-taskmaster-db -f scripts/check_unused_indexes.sql

# Generate performance report
npm run db:performance-report

echo "Weekly maintenance completed: $(date)"
```

### Health Checks

```bash
# Daily health check script
#!/bin/bash
# daily_health_check.sh

# Check database connectivity
npm run db:health-check

# Check disk space
df -h /var/lib/postgresql

# Check memory usage
free -h

# Check CPU usage
top -bn1 | grep "Cpu(s)"

# Check active connections
psql -h localhost -U software_developer -d codegen-taskmaster-db -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';"

echo "Health check completed: $(date)"
```

### Contact Information

For additional support:
- **Documentation**: See main project README
- **Issues**: Create GitHub issue with `database` label
- **Emergency**: Contact system administrator

---

This deployment guide provides comprehensive instructions for setting up and maintaining the PostgreSQL database for the AI CI/CD system. Follow the steps carefully and adapt configurations to your specific environment and requirements.

