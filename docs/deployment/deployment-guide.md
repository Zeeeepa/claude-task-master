# Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the claude-task-master system with integrated end-to-end testing, system validation, and monitoring capabilities.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Architecture](#system-architecture)
3. [Deployment Options](#deployment-options)
4. [Environment Setup](#environment-setup)
5. [Database Configuration](#database-configuration)
6. [Application Deployment](#application-deployment)
7. [Integration Testing Setup](#integration-testing-setup)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Security Configuration](#security-configuration)
10. [Performance Optimization](#performance-optimization)
11. [Backup and Recovery](#backup-and-recovery)
12. [Maintenance](#maintenance)

## Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores, 2.0 GHz
- **Memory**: 4 GB RAM
- **Storage**: 20 GB available space
- **Network**: Stable internet connection

#### Recommended Requirements
- **CPU**: 4 cores, 2.5 GHz or higher
- **Memory**: 8 GB RAM or higher
- **Storage**: 50 GB SSD storage
- **Network**: High-speed internet connection

### Software Dependencies

#### Required Software
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: Version 2.30.0 or higher
- **PostgreSQL**: Version 13.0 or higher (if using PostgreSQL)

#### Optional Software
- **Docker**: Version 20.0.0 or higher (for containerized deployment)
- **Nginx**: Version 1.18.0 or higher (for reverse proxy)
- **PM2**: For process management
- **Redis**: For caching (optional)

### API Keys and Credentials

#### Required API Keys
- **Anthropic API Key**: For Claude AI integration
- **OpenAI API Key**: For GPT model access (optional)
- **Google API Key**: For Gemini integration (optional)
- **Linear API Key**: For Linear integration
- **GitHub Token**: For repository access

#### Optional API Keys
- **Perplexity API Key**: For research capabilities
- **xAI API Key**: For Grok integration
- **OpenRouter API Key**: For model routing

## System Architecture

### Component Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Web Interface │    │   API Gateway   │
│  (Cursor, etc.) │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴───────────┐
                    │    MCP Server Core      │
                    │  (Task Master Engine)   │
                    └─────────────┬───────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────┴───────┐    ┌─────────┴───────┐    ┌─────────┴───────┐
│   Database      │    │   AI Providers  │    │   External APIs │
│  (PostgreSQL)   │    │ (Claude, GPT)   │    │ (GitHub, Linear)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Integration Testing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Integration Test Framework                    │
├─────────────────┬─────────────────┬─────────────────────────┤
│   E2E Tests     │  Health Checks  │   Performance Tests     │
│                 │                 │                         │
│ • Happy Path    │ • System Health │ • Load Testing         │
│ • Error Recovery│ • Component     │ • Stress Testing       │
│ • Concurrency   │   Monitoring    │ • Performance SLA      │
│ • Edge Cases    │ • Resource      │ • Bottleneck Analysis  │
│                 │   Validation    │                         │
├─────────────────┴─────────────────┴─────────────────────────┤
│                   Security Validation                       │
│                                                             │
│ • Input Validation  • Authentication  • API Security       │
│ • Injection Testing • Authorization   • Data Protection    │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Options

### Option 1: Local Development Deployment

#### Use Case
- Development and testing
- Single developer environment
- Quick setup and iteration

#### Steps
1. Clone repository
2. Install dependencies
3. Configure environment
4. Run locally

```bash
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master
npm install
cp .env.example .env
npm start
```

### Option 2: Production Server Deployment

#### Use Case
- Production environment
- Team collaboration
- Scalable deployment

#### Steps
1. Server preparation
2. Application deployment
3. Database setup
4. Process management
5. Monitoring setup

### Option 3: Containerized Deployment

#### Use Case
- Consistent environments
- Easy scaling
- Cloud deployment

#### Docker Configuration
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Option 4: Cloud Platform Deployment

#### Supported Platforms
- **AWS**: EC2, ECS, Lambda
- **Google Cloud**: Compute Engine, Cloud Run
- **Azure**: App Service, Container Instances
- **Heroku**: Web dynos
- **Vercel**: Serverless functions

## Environment Setup

### Environment Variables

#### Core Configuration
```bash
# Application Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/taskmaster
DATABASE_SSL=true
DATABASE_POOL_SIZE=10

# API Keys
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GOOGLE_API_KEY=your-google-key
LINEAR_API_KEY=your-linear-key
GITHUB_TOKEN=your-github-token

# Security Configuration
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
SESSION_SECRET=your-session-secret

# External Services
WEBHOOK_SECRET=your-webhook-secret
CORS_ORIGIN=https://yourdomain.com
```

#### Integration Testing Configuration
```bash
# Integration Testing
INTEGRATION_TEST_ENABLED=true
INTEGRATION_REPORTS_DIR=/var/log/integration-reports
INTEGRATION_TEST_TIMEOUT=300000

# Performance Testing
PERFORMANCE_TEST_ENABLED=true
PERFORMANCE_MAX_CONCURRENT_USERS=50
PERFORMANCE_SLA_RESPONSE_TIME=1000

# Security Testing
SECURITY_TEST_ENABLED=true
SECURITY_SCAN_INTERVAL=3600000
SECURITY_ALERT_WEBHOOK=https://alerts.yourdomain.com/webhook
```

### Configuration Files

#### Application Configuration (`config/production.json`)
```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "timeout": 30000
  },
  "database": {
    "pool": {
      "min": 2,
      "max": 10,
      "acquireTimeoutMillis": 30000,
      "idleTimeoutMillis": 30000
    }
  },
  "ai": {
    "providers": {
      "anthropic": {
        "model": "claude-3-sonnet-20240229",
        "maxTokens": 4096,
        "timeout": 30000
      },
      "openai": {
        "model": "gpt-4",
        "maxTokens": 4096,
        "timeout": 30000
      }
    }
  },
  "integrationTesting": {
    "enabled": true,
    "schedule": "0 2 * * *",
    "retries": 3,
    "timeout": 300000
  }
}
```

## Database Configuration

### PostgreSQL Setup

#### Installation
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Database Creation
```sql
-- Connect as postgres user
sudo -u postgres psql

-- Create database and user
CREATE DATABASE taskmaster;
CREATE USER taskmaster_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE taskmaster TO taskmaster_user;

-- Create schema
\c taskmaster
CREATE SCHEMA IF NOT EXISTS taskmaster;
GRANT ALL ON SCHEMA taskmaster TO taskmaster_user;
```

#### Schema Migration
```bash
# Run database migrations
npm run db:migrate

# Seed initial data (if applicable)
npm run db:seed
```

### Database Security

#### Connection Security
```bash
# PostgreSQL configuration (postgresql.conf)
ssl = on
ssl_cert_file = '/path/to/server.crt'
ssl_key_file = '/path/to/server.key'
ssl_ca_file = '/path/to/ca.crt'

# Client authentication (pg_hba.conf)
hostssl taskmaster taskmaster_user 0.0.0.0/0 md5
```

#### Backup Configuration
```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U taskmaster_user taskmaster > "$BACKUP_DIR/taskmaster_$DATE.sql"
```

## Application Deployment

### Production Deployment Steps

#### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash taskmaster
sudo usermod -aG sudo taskmaster
```

#### 2. Application Setup
```bash
# Switch to application user
sudo su - taskmaster

# Clone repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# Install dependencies
npm ci --only=production

# Build application (if applicable)
npm run build
```

#### 3. Environment Configuration
```bash
# Create production environment file
cp .env.example .env.production

# Edit configuration
nano .env.production

# Set proper permissions
chmod 600 .env.production
```

#### 4. Process Management
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'taskmaster',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
EOF

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Reverse Proxy Configuration

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

## Integration Testing Setup

### Automated Deployment
```bash
# Deploy integration testing framework
./deployment/scripts/deploy-integration-tests.sh

# Verify deployment
npm run test:integration:validate
```

### Continuous Integration Setup

#### GitHub Actions Workflow
```yaml
name: Deploy and Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Deploy integration tests
      run: ./deployment/scripts/deploy-integration-tests.sh
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    
    - name: Upload test reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: integration-reports
        path: integration-reports/
```

### Scheduled Testing

#### Cron Job Setup
```bash
# Add to crontab
crontab -e

# Run integration tests daily at 2 AM
0 2 * * * cd /home/taskmaster/claude-task-master && npm run test:integration >> /var/log/integration-tests.log 2>&1

# Run health checks every 30 minutes
*/30 * * * * cd /home/taskmaster/claude-task-master && npm run test:integration:health >> /var/log/health-checks.log 2>&1
```

## Monitoring and Logging

### Application Monitoring

#### Health Check Endpoint
```javascript
// Health check implementation
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  };
  
  try {
    // Check database connectivity
    await database.ping();
    health.database = 'connected';
    
    // Check AI provider connectivity
    await aiProvider.healthCheck();
    health.aiProvider = 'connected';
    
    res.status(200).json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    res.status(503).json(health);
  }
});
```

#### Metrics Collection
```bash
# Install monitoring tools
npm install --save prometheus-client
npm install --save express-prometheus-middleware
```

### Log Management

#### Log Configuration
```javascript
// Winston logger configuration
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### Log Rotation
```bash
# Install logrotate configuration
sudo cat > /etc/logrotate.d/taskmaster << 'EOF'
/home/taskmaster/claude-task-master/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 taskmaster taskmaster
    postrotate
        pm2 reload taskmaster
    endscript
}
EOF
```

### Alerting

#### Alert Configuration
```javascript
// Alert manager configuration
const alertManager = {
  webhooks: {
    slack: process.env.SLACK_WEBHOOK_URL,
    email: process.env.EMAIL_WEBHOOK_URL
  },
  thresholds: {
    errorRate: 0.05,
    responseTime: 1000,
    memoryUsage: 0.8,
    diskUsage: 0.9
  }
};
```

## Security Configuration

### SSL/TLS Setup

#### Certificate Installation
```bash
# Using Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
0 12 * * * /usr/bin/certbot renew --quiet
```

### Firewall Configuration
```bash
# UFW firewall setup
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp  # Block direct access to app
```

### Security Headers
```javascript
// Express security middleware
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## Performance Optimization

### Application Optimization

#### Node.js Optimization
```bash
# PM2 configuration for performance
module.exports = {
  apps: [{
    name: 'taskmaster',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    node_args: [
      '--max-old-space-size=2048',
      '--optimize-for-size'
    ],
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 16
    }
  }]
};
```

#### Database Optimization
```sql
-- PostgreSQL performance tuning
-- postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_tasks_status ON tasks(status);
CREATE INDEX CONCURRENTLY idx_tasks_created_at ON tasks(created_at);
CREATE INDEX CONCURRENTLY idx_tasks_priority ON tasks(priority);
```

### Caching Strategy

#### Redis Configuration
```javascript
// Redis caching setup
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Cache middleware
const cache = (duration = 300) => {
  return async (req, res, next) => {
    const key = req.originalUrl;
    const cached = await client.get(key);
    
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    res.sendResponse = res.json;
    res.json = (body) => {
      client.setex(key, duration, JSON.stringify(body));
      res.sendResponse(body);
    };
    
    next();
  };
};
```

## Backup and Recovery

### Database Backup

#### Automated Backup Script
```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
DATABASE="taskmaster"
USER="taskmaster_user"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
pg_dump -h localhost -U "$USER" -F c -b -v -f "$BACKUP_DIR/taskmaster_$DATE.backup" "$DATABASE"

# Compress backup
gzip "$BACKUP_DIR/taskmaster_$DATE.backup"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "taskmaster_*.backup.gz" -mtime +30 -delete

# Upload to cloud storage (optional)
# aws s3 cp "$BACKUP_DIR/taskmaster_$DATE.backup.gz" s3://your-backup-bucket/
```

### Application Backup
```bash
#!/bin/bash
# backup-application.sh

APP_DIR="/home/taskmaster/claude-task-master"
BACKUP_DIR="/var/backups/application"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup application files (excluding node_modules)
tar --exclude='node_modules' --exclude='logs' --exclude='.git' \
    -czf "$BACKUP_DIR/taskmaster_app_$DATE.tar.gz" -C "$APP_DIR" .

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "taskmaster_app_*.tar.gz" -mtime +7 -delete
```

### Recovery Procedures

#### Database Recovery
```bash
# Stop application
pm2 stop taskmaster

# Restore database
gunzip -c /var/backups/postgresql/taskmaster_YYYYMMDD_HHMMSS.backup.gz | \
pg_restore -h localhost -U taskmaster_user -d taskmaster --clean --if-exists

# Start application
pm2 start taskmaster
```

#### Application Recovery
```bash
# Stop application
pm2 stop taskmaster

# Backup current application (if needed)
mv /home/taskmaster/claude-task-master /home/taskmaster/claude-task-master.backup

# Extract backup
mkdir -p /home/taskmaster/claude-task-master
tar -xzf /var/backups/application/taskmaster_app_YYYYMMDD_HHMMSS.tar.gz \
    -C /home/taskmaster/claude-task-master

# Install dependencies
cd /home/taskmaster/claude-task-master
npm ci --only=production

# Start application
pm2 start taskmaster
```

## Maintenance

### Regular Maintenance Tasks

#### Daily Tasks
- Monitor application logs
- Check system resource usage
- Verify backup completion
- Review integration test results

#### Weekly Tasks
- Update dependencies (security patches)
- Review performance metrics
- Clean up old log files
- Test backup restoration

#### Monthly Tasks
- Security vulnerability scan
- Performance optimization review
- Capacity planning assessment
- Documentation updates

### Update Procedures

#### Application Updates
```bash
# Create maintenance window
pm2 stop taskmaster

# Backup current version
cp -r /home/taskmaster/claude-task-master /home/taskmaster/claude-task-master.backup

# Pull latest changes
cd /home/taskmaster/claude-task-master
git pull origin main

# Update dependencies
npm ci --only=production

# Run database migrations (if any)
npm run db:migrate

# Run integration tests
npm run test:integration

# Start application
pm2 start taskmaster

# Verify deployment
curl -f http://localhost:3000/health
```

#### Rollback Procedure
```bash
# Stop current version
pm2 stop taskmaster

# Restore previous version
rm -rf /home/taskmaster/claude-task-master
mv /home/taskmaster/claude-task-master.backup /home/taskmaster/claude-task-master

# Restore database (if needed)
# pg_restore commands here

# Start application
cd /home/taskmaster/claude-task-master
pm2 start taskmaster
```

### Monitoring and Alerts

#### System Monitoring
```bash
# System resource monitoring script
#!/bin/bash
# monitor-system.sh

# Check disk usage
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "WARNING: Disk usage is ${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEMORY_USAGE" -gt 80 ]; then
    echo "WARNING: Memory usage is ${MEMORY_USAGE}%"
fi

# Check application status
if ! pm2 list | grep -q "online"; then
    echo "ERROR: Application is not running"
fi
```

## Conclusion

This deployment guide provides comprehensive instructions for deploying the claude-task-master system with integrated testing and monitoring capabilities. Follow the procedures outlined in this guide to ensure a successful and secure deployment.

For additional support and troubleshooting, refer to:
- [Integration Testing Guide](../integration/integration-testing-guide.md)
- [Troubleshooting Guide](../troubleshooting/troubleshooting-guide.md)
- [Performance Guide](../performance/performance-guide.md)

