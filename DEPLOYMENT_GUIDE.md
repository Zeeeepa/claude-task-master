# 🚀 PostgreSQL Database Schema & Cloudflare Integration - Deployment Guide

## 📋 Overview

This guide provides step-by-step instructions for deploying the comprehensive PostgreSQL database schema with Cloudflare integration for the AI-powered CI/CD system.

## 🎯 What's Included

- **Complete PostgreSQL Schema**: All required tables for tasks, workflows, integrations, logs, templates, and deployments
- **Cloudflare Workers Integration**: Secure database proxy with rate limiting and DDoS protection
- **RESTful API Endpoints**: Comprehensive CRUD operations with authentication
- **Migration System**: Database versioning and rollback support
- **Monitoring & Health Checks**: Performance metrics and system health monitoring
- **Security Features**: SSL/TLS encryption, audit logging, and input validation

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Linear API    │    │  Cloudflare      │    │   PostgreSQL    │
│   AgentAPI      │◄──►│  Workers         │◄──►│   Database      │
│   Claude Code   │    │  (Proxy/Cache)   │    │   (Primary)     │
│   GitHub        │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                        ▲                        ▲
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Codegen       │    │  API Server      │    │  Migration      │
│   Integration   │    │  (Express.js)    │    │  System         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🔧 Prerequisites

### Required Software
- **Node.js** (v18 or higher)
- **PostgreSQL** (v13 or higher)
- **Cloudflare Account** with Workers plan
- **Git** for version control

### Required Accounts
- Cloudflare account with Workers enabled
- PostgreSQL database (cloud provider or self-hosted)
- Domain name (for Cloudflare integration)

## 📦 Installation

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# Checkout the database integration branch
git checkout codegen/zam-618-postgresql-database-schema-cloudflare-integration

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit the configuration file
nano .env
```

**Required Environment Variables:**

```bash
# Database Configuration
DB_HOST=your-database-host.com
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=software_developer
DB_PASSWORD=your-secure-password
DB_SSL_MODE=require

# Cloudflare Configuration
CLOUDFLARE_ENABLED=true
CLOUDFLARE_WORKER_URL=https://database-api.your-domain.workers.dev
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ZONE_ID=your-zone-id

# API Configuration
API_PORT=3000
API_KEY=your-secure-api-key
CORS_ORIGINS=https://your-domain.com
```

## 🗄️ Database Setup

### 1. Create Database

```bash
# Connect to PostgreSQL and create database
psql -h your-host -U your-user -c "CREATE DATABASE codegen_taskmaster_db;"
```

### 2. Run Migrations

```bash
# Check migration status
npm run db:status

# Run all migrations
npm run db:migrate

# Verify database health
npm run db:health
```

### 3. Validate Schema

```bash
# Validate migration integrity
npm run db:validate

# Check database connection
npm run db:health
```

## ☁️ Cloudflare Setup

### 1. Install Wrangler CLI

```bash
# Install Cloudflare Wrangler
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login
```

### 2. Configure Worker

```bash
# Create wrangler.toml configuration
cat > wrangler.toml << EOF
name = "database-api"
main = "src/cloudflare/worker.js"
compatibility_date = "2024-01-01"

[env.production]
account_id = "your-account-id"
zone_id = "your-zone-id"

[[env.production.routes]]
pattern = "database-api.your-domain.com/*"
zone_id = "your-zone-id"
EOF
```

### 3. Deploy Worker

```bash
# Deploy to Cloudflare
npm run cloudflare:deploy

# Test worker deployment
curl https://database-api.your-domain.workers.dev/health
```

### 4. Configure DNS

```bash
# Add DNS record for your worker
wrangler route add "database-api.your-domain.com/*" your-zone-id
```

## 🔐 Security Configuration

### 1. SSL/TLS Setup

```bash
# Configure SSL mode in Cloudflare dashboard
# Set SSL/TLS encryption mode to "Full (strict)"
# Enable "Always Use HTTPS"
# Configure HSTS settings
```

### 2. API Authentication

```bash
# Generate secure API key
openssl rand -hex 32

# Update environment variable
echo "API_KEY=your-generated-key" >> .env
```

### 3. Database Security

```bash
# Ensure SSL is required for database connections
echo "DB_SSL_MODE=require" >> .env

# Configure firewall rules to allow only Cloudflare IPs
# (Specific to your database provider)
```

## 🚀 API Server Deployment

### 1. Local Development

```bash
# Start API server in development mode
npm run api:dev

# Test API endpoints
curl -H "X-API-Key: your-api-key" http://localhost:3000/health
```

### 2. Production Deployment

#### Option A: Docker Deployment

```bash
# Create Dockerfile
cat > Dockerfile << EOF
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "run", "api:start"]
EOF

# Build and run container
docker build -t taskmaster-api .
docker run -p 3000:3000 --env-file .env taskmaster-api
```

#### Option B: PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'taskmaster-api',
    script: 'src/api/database-endpoints.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Option C: Cloud Platform Deployment

**Heroku:**
```bash
# Create Heroku app
heroku create taskmaster-api

# Set environment variables
heroku config:set DB_HOST=your-host DB_PASSWORD=your-password

# Deploy
git push heroku main
```

**AWS/GCP/Azure:**
Follow platform-specific deployment guides for Node.js applications.

## 🔍 Testing and Validation

### 1. Database Tests

```bash
# Run database connection tests
npm run test:integration

# Test migration system
npm run db:migrate:dry
npm run db:validate
```

### 2. API Tests

```bash
# Test API endpoints
curl -X GET \
  -H "X-API-Key: your-api-key" \
  https://your-api-domain.com/api/v1/tasks

# Test health endpoint
curl https://your-api-domain.com/health
```

### 3. Cloudflare Tests

```bash
# Test worker functionality
curl https://database-api.your-domain.workers.dev/health

# Test rate limiting
for i in {1..10}; do
  curl https://database-api.your-domain.workers.dev/api/v1/tasks
done
```

## 📊 Monitoring Setup

### 1. Database Monitoring

```bash
# Check database health
npm run db:health

# Monitor slow queries
tail -f logs/slow-queries.log
```

### 2. API Monitoring

```bash
# Monitor API logs
npm run api:logs

# Check performance metrics
curl https://your-api-domain.com/metrics
```

### 3. Cloudflare Analytics

- Enable Cloudflare Analytics in dashboard
- Configure alerts for high error rates
- Monitor worker performance metrics

## 🔧 Configuration Examples

### Database Connection String

```javascript
// For Cloudflare Workers
const DATABASE_URL = "postgresql://user:password@host:5432/database?sslmode=require";

// For local development
const DATABASE_URL = "postgresql://user:password@localhost:5432/database";
```

### API Client Example

```javascript
// JavaScript client
const apiClient = {
  baseURL: 'https://database-api.your-domain.workers.dev/api/v1',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json'
  }
};

// Create task
const response = await fetch(`${apiClient.baseURL}/tasks`, {
  method: 'POST',
  headers: apiClient.headers,
  body: JSON.stringify({
    title: 'Implement feature X',
    description: 'Add new functionality',
    type: 'feature',
    priority: 8
  })
});
```

### Cloudflare Worker Configuration

```javascript
// Worker environment variables
const CONFIG = {
  DATABASE_URL: env.DATABASE_URL,
  API_KEY: env.API_KEY,
  RATE_LIMIT_RPM: 1000,
  CORS_ORIGINS: ['https://your-domain.com']
};
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

```bash
# Check database connectivity
telnet your-db-host 5432

# Verify SSL configuration
openssl s_client -connect your-db-host:5432 -starttls postgres

# Test connection with psql
psql "postgresql://user:password@host:5432/database?sslmode=require"
```

#### 2. Migration Failures

```bash
# Check migration status
npm run db:status

# Validate migrations
npm run db:validate

# Rollback if needed
npm run db:rollback 001
```

#### 3. Cloudflare Worker Issues

```bash
# Check worker logs
npm run cloudflare:logs

# Test worker locally
npm run cloudflare:dev

# Verify DNS configuration
dig database-api.your-domain.com
```

#### 4. API Authentication Errors

```bash
# Verify API key
curl -H "X-API-Key: wrong-key" https://your-api/health

# Check CORS configuration
curl -H "Origin: https://unauthorized-domain.com" https://your-api/health
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG_MODE=true
export DB_LOG_QUERIES=true

# Restart services
npm run api:dev
```

## 📈 Performance Optimization

### Database Optimization

```sql
-- Monitor slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename = 'tasks';
```

### Cloudflare Optimization

- Enable Brotli compression
- Configure appropriate cache TTL
- Use Cloudflare's Argo Smart Routing
- Enable HTTP/3 for better performance

### API Optimization

```javascript
// Connection pooling
const pool = new Pool({
  min: 2,
  max: 10,
  idleTimeoutMillis: 10000
});

// Response compression
app.use(compression());

// Caching headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'public, max-age=300');
  next();
});
```

## 🔄 Backup and Recovery

### Database Backups

```bash
# Create backup
pg_dump "postgresql://user:password@host:5432/database" > backup.sql

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > "backup_${DATE}.sql"
aws s3 cp "backup_${DATE}.sql" s3://your-backup-bucket/
```

### Configuration Backups

```bash
# Backup environment configuration
cp .env .env.backup.$(date +%Y%m%d)

# Backup Cloudflare configuration
wrangler kv:namespace list > cloudflare-config-backup.json
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Database Security Guide](https://www.postgresql.org/docs/current/security.html)

## 🤝 Support

For issues and questions:

1. Check the troubleshooting section above
2. Review the logs for error messages
3. Consult the API documentation
4. Create an issue in the repository

## 📄 License

This deployment guide is part of the TaskMaster AI CI/CD System and follows the same license terms.

