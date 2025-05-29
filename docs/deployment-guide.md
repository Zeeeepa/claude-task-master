# Task Master Deployment Guide

## Overview

This guide covers the deployment of Task Master AI Development Orchestrator in various environments, from local development to production WSL2 deployments.

## Prerequisites

### System Requirements

**Minimum Requirements:**
- Node.js 18.0 or higher
- 4GB RAM
- 10GB disk space
- Git 2.30 or higher

**Recommended Requirements:**
- Node.js 20.0 or higher
- 8GB RAM
- 50GB disk space
- SSD storage

### Required Software

1. **Node.js and npm**
   ```bash
   # Install Node.js 20.x
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Git**
   ```bash
   sudo apt-get update
   sudo apt-get install git
   ```

3. **Claude Code** (Optional)
   ```bash
   # Install Claude Code CLI
   npm install -g @anthropic-ai/claude-code
   ```

4. **Database** (Production)
   ```bash
   # For PostgreSQL
   sudo apt-get install postgresql postgresql-contrib
   
   # For SQLite (default)
   sudo apt-get install sqlite3
   ```

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/task-master.git
cd task-master
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Core Configuration
NODE_ENV=production
LOG_LEVEL=info

# Codegen SDK Configuration
CODEGEN_TOKEN=your_codegen_token_here
CODEGEN_ORG_ID=your_org_id_here
CODEGEN_API_URL=https://api.codegen.sh

# Claude Code Configuration
CLAUDE_CODE_PATH=/usr/local/bin/claude-code

# Database Configuration
DATABASE_URL=sqlite:./taskmaster.db
# For PostgreSQL: postgresql://user:password@localhost:5432/taskmaster

# External Integrations
LINEAR_API_KEY=your_linear_api_key
GITHUB_TOKEN=your_github_token

# AgentAPI Configuration
AGENTAPI_PORT=3001
AGENTAPI_HOST=0.0.0.0

# WSL2 Configuration (if applicable)
WSL2_HOST=localhost
```

### 4. Database Setup

#### SQLite (Default)

```bash
# Database will be created automatically
npm run setup:database
```

#### PostgreSQL

```bash
# Create database
sudo -u postgres createdb taskmaster

# Run migrations
npm run migrate
```

## Development Deployment

### Local Development

1. **Start in Development Mode**
   ```bash
   npm run dev
   ```

2. **Run Tests**
   ```bash
   npm test
   npm run test:integration
   ```

3. **Access Services**
   - AgentAPI: http://localhost:3001
   - Health Check: http://localhost:3001/health
   - WebSocket: ws://localhost:3001/ws

### Development with Docker

1. **Build Docker Image**
   ```bash
   docker build -t task-master:dev .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

## Production Deployment

### 1. System Preparation

```bash
# Create dedicated user
sudo useradd -m -s /bin/bash taskmaster
sudo usermod -aG sudo taskmaster

# Create application directory
sudo mkdir -p /opt/taskmaster
sudo chown taskmaster:taskmaster /opt/taskmaster

# Switch to taskmaster user
sudo su - taskmaster
```

### 2. Application Setup

```bash
# Clone and setup application
cd /opt/taskmaster
git clone https://github.com/your-org/task-master.git .
npm ci --production

# Create necessary directories
mkdir -p logs backups config
```

### 3. Configuration

```bash
# Copy production configuration
cp config/production.json.example config/production.json

# Edit configuration
nano config/production.json
```

**Production Configuration Example:**

```json
{
  "system": {
    "logLevel": "info",
    "nodeEnv": "production",
    "healthCheckInterval": 30000
  },
  "database": {
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "taskmaster",
    "username": "taskmaster",
    "password": "secure_password",
    "ssl": true,
    "connectionTimeout": 10000,
    "maxConnections": 20
  },
  "agentapi": {
    "port": 3001,
    "host": "0.0.0.0",
    "allowedOrigins": ["https://your-domain.com"]
  },
  "logging": {
    "level": "info",
    "format": "json",
    "maxFiles": 10,
    "maxSize": "50m"
  }
}
```

### 4. Process Management with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'task-master',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=2048'
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup
```

### 5. Reverse Proxy with Nginx

```bash
# Install Nginx
sudo apt-get install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/task-master
```

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # API Proxy
    location /api/ {
        proxy_pass http://localhost:3001;
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

    # WebSocket Proxy
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Health Check
    location /health {
        proxy_pass http://localhost:3001;
        access_log off;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/task-master /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## WSL2 Deployment

### 1. WSL2 Setup

```bash
# Enable WSL2 on Windows
wsl --install

# Install Ubuntu
wsl --install -d Ubuntu-22.04

# Update system
sudo apt update && sudo apt upgrade -y
```

### 2. Docker in WSL2

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker service
sudo service docker start
```

### 3. Application Deployment

```bash
# Clone repository
git clone https://github.com/your-org/task-master.git
cd task-master

# Build and run with Docker Compose
docker-compose -f docker-compose.wsl2.yml up -d
```

**WSL2 Docker Compose Configuration:**

```yaml
version: '3.8'

services:
  task-master:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://taskmaster:password@postgres:5432/taskmaster
    volumes:
      - ./logs:/app/logs
      - ./config:/app/config
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: taskmaster
      POSTGRES_USER: taskmaster
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - task-master
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## Monitoring and Maintenance

### 1. Health Monitoring

```bash
# Create health check script
cat > /opt/taskmaster/scripts/health-check.sh << 'EOF'
#!/bin/bash

HEALTH_URL="http://localhost:3001/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): Health check passed"
    exit 0
else
    echo "$(date): Health check failed with status $RESPONSE"
    # Restart application
    pm2 restart task-master
    exit 1
fi
EOF

chmod +x /opt/taskmaster/scripts/health-check.sh

# Add to crontab
echo "*/5 * * * * /opt/taskmaster/scripts/health-check.sh >> /opt/taskmaster/logs/health.log 2>&1" | crontab -
```

### 2. Log Rotation

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/task-master
```

```
/opt/taskmaster/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 taskmaster taskmaster
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 3. Backup Strategy

```bash
# Create backup script
cat > /opt/taskmaster/scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/taskmaster/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
if [ "$DATABASE_TYPE" = "postgresql" ]; then
    pg_dump taskmaster > "$BACKUP_DIR/db_backup_$DATE.sql"
elif [ "$DATABASE_TYPE" = "sqlite" ]; then
    cp taskmaster.db "$BACKUP_DIR/db_backup_$DATE.db"
fi

# Configuration backup
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" config/

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "*backup*" -mtime +30 -delete

echo "$(date): Backup completed - $DATE"
EOF

chmod +x /opt/taskmaster/scripts/backup.sh

# Schedule daily backups
echo "0 2 * * * /opt/taskmaster/scripts/backup.sh >> /opt/taskmaster/logs/backup.log 2>&1" | crontab -
```

## Security Considerations

### 1. Firewall Configuration

```bash
# Configure UFW
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3001/tcp  # Block direct access to application port
```

### 2. SSL/TLS Setup

```bash
# Install Certbot for Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### 3. Security Headers

Add to Nginx configuration:

```nginx
# Security Headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Troubleshooting

### Common Issues

1. **Application Won't Start**
   ```bash
   # Check logs
   pm2 logs task-master
   
   # Check configuration
   npm run config:validate
   
   # Check dependencies
   npm audit
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   npm run db:test
   
   # Check database status
   sudo systemctl status postgresql
   ```

3. **High Memory Usage**
   ```bash
   # Monitor memory usage
   pm2 monit
   
   # Restart application
   pm2 restart task-master
   ```

4. **WebSocket Connection Issues**
   ```bash
   # Check Nginx configuration
   sudo nginx -t
   
   # Test WebSocket endpoint
   wscat -c ws://localhost:3001/ws
   ```

### Performance Tuning

1. **Node.js Optimization**
   ```bash
   # Increase memory limit
   export NODE_OPTIONS="--max-old-space-size=4096"
   
   # Enable V8 optimizations
   export NODE_OPTIONS="--optimize-for-size"
   ```

2. **Database Optimization**
   ```sql
   -- PostgreSQL optimizations
   ALTER SYSTEM SET shared_buffers = '256MB';
   ALTER SYSTEM SET effective_cache_size = '1GB';
   ALTER SYSTEM SET maintenance_work_mem = '64MB';
   SELECT pg_reload_conf();
   ```

3. **Nginx Optimization**
   ```nginx
   # Add to nginx.conf
   worker_processes auto;
   worker_connections 1024;
   keepalive_timeout 65;
   gzip on;
   gzip_types text/plain application/json application/javascript text/css;
   ```

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancer Setup**
   ```nginx
   upstream task_master_backend {
       server 127.0.0.1:3001;
       server 127.0.0.1:3002;
       server 127.0.0.1:3003;
   }
   ```

2. **Database Clustering**
   - PostgreSQL streaming replication
   - Redis cluster for session storage
   - Database connection pooling

3. **Container Orchestration**
   - Kubernetes deployment
   - Docker Swarm mode
   - Auto-scaling policies

### Monitoring and Alerting

1. **Application Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Custom health checks

2. **Infrastructure Monitoring**
   - System resource monitoring
   - Network monitoring
   - Database performance monitoring

3. **Alerting**
   - Email notifications
   - Slack integration
   - PagerDuty integration

This deployment guide provides a comprehensive approach to deploying Task Master in various environments. Adjust configurations based on your specific requirements and infrastructure constraints.

