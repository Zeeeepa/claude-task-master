# 🚀 Comprehensive CI/CD System Deployment Guide

## 📋 Overview

This guide provides step-by-step instructions for deploying the Comprehensive CI/CD System that integrates all foundation components (PRs #13-17) into a unified AI-driven development pipeline.

## 🎯 Deployment Options

### Option 1: Docker Compose (Recommended)
### Option 2: Manual Installation
### Option 3: Cloud Deployment
### Option 4: Development Setup

---

## 🐳 Option 1: Docker Compose Deployment (Recommended)

### Prerequisites
```bash
# System Requirements
- Docker 20.10+
- Docker Compose 2.0+
- 8GB RAM minimum
- 50GB disk space
- WSL2 (for Windows)

# Network Requirements
- Ports 8080, 5432, 6379, 8000 available
- Internet access for API calls
```

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# 2. Configure environment
cp .env.comprehensive_cicd .env
# Edit .env with your API keys and configuration

# 3. Start the system
docker-compose -f docker-compose.comprehensive-cicd.yml up -d

# 4. Verify deployment
curl http://localhost:8080/api/v1/health

# 5. Process your first requirement
curl -X POST http://localhost:8080/api/v1/requirements \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Create a secure user authentication system with JWT tokens",
    "project_id": "demo-project",
    "priority": "high"
  }'
```

### Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   CI/CD API │  │  PostgreSQL │  │    Redis    │        │
│  │   :8080     │  │   :5432     │  │   :6379     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  AgentAPI   │  │ Prometheus  │  │   Grafana   │        │
│  │   :8000     │  │   :9090     │  │   :3000     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Files

#### Environment Configuration (.env)
```bash
# Required Configuration
CODEGEN_ORG_ID=323
CODEGEN_API_KEY=sk-ce027fa7-3c8d-4beb-8c86-ed8ae982ac99
DB_PASSWORD=your-secure-password

# Optional Configuration
ENABLE_CYCLICAL_IMPROVEMENT=true
ENABLE_WSL2_DEPLOYMENT=true
MAX_CONCURRENT_TASKS=10
```

#### Docker Compose Profiles
```bash
# Basic deployment (API + Database)
docker-compose -f docker-compose.comprehensive-cicd.yml up -d

# With monitoring
docker-compose -f docker-compose.comprehensive-cicd.yml --profile monitoring up -d

# Production deployment
docker-compose -f docker-compose.comprehensive-cicd.yml --profile production up -d

# Development with WSL2
docker-compose -f docker-compose.comprehensive-cicd.yml --profile development up -d
```

---

## 🔧 Option 2: Manual Installation

### System Requirements
```bash
# Software Requirements
- Node.js 18+
- Python 3.8+
- PostgreSQL 12+
- Redis 6+ (optional)
- Git
- WSL2 (Windows only)
- Claude Code CLI

# Hardware Requirements
- 8GB RAM minimum
- 4 CPU cores
- 50GB disk space
- SSD recommended
```

### Step-by-Step Installation

#### 1. Install System Dependencies
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip postgresql postgresql-contrib redis-server git curl

# macOS
brew install node python postgresql redis git

# Windows (WSL2)
# Install WSL2 first, then follow Ubuntu instructions
```

#### 2. Install Claude Code
```bash
# Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash
claude --version
```

#### 3. Setup Database
```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE "codegen-taskmaster-db";
CREATE USER software_developer WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE "codegen-taskmaster-db" TO software_developer;
\q
EOF
```

#### 4. Install Application
```bash
# Clone repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# Install dependencies
npm install
pip install -r requirements.txt

# Configure environment
cp .env.comprehensive_cicd .env
# Edit .env with your configuration

# Initialize database
npm run db:init

# Start the system
npm run start:comprehensive-cicd
```

#### 5. Install AgentAPI
```bash
# Clone AgentAPI
git clone https://github.com/Zeeeepa/agentapi.git
cd agentapi

# Install and start
npm install
npm start
```

---

## ☁️ Option 3: Cloud Deployment

### AWS Deployment

#### Prerequisites
```bash
# AWS CLI configured
aws configure

# Required services
- ECS/Fargate
- RDS PostgreSQL
- ElastiCache Redis
- Application Load Balancer
- CloudWatch
```

#### Deployment Steps
```bash
# 1. Create infrastructure
aws cloudformation create-stack \
  --stack-name codegen-cicd \
  --template-body file://aws/cloudformation.yml \
  --parameters ParameterKey=Environment,ParameterValue=production

# 2. Build and push Docker image
docker build -f Dockerfile.cicd -t codegen-cicd:latest .
docker tag codegen-cicd:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/codegen-cicd:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/codegen-cicd:latest

# 3. Deploy to ECS
aws ecs update-service \
  --cluster codegen-cicd \
  --service cicd-api \
  --force-new-deployment
```

### Google Cloud Platform

#### Prerequisites
```bash
# GCP CLI configured
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Required services
- Cloud Run
- Cloud SQL PostgreSQL
- Memorystore Redis
- Cloud Load Balancing
```

#### Deployment Steps
```bash
# 1. Build and deploy
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/codegen-cicd

# 2. Deploy to Cloud Run
gcloud run deploy codegen-cicd \
  --image gcr.io/YOUR_PROJECT_ID/codegen-cicd \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="DB_HOST=YOUR_SQL_INSTANCE_IP"
```

### Azure Deployment

#### Prerequisites
```bash
# Azure CLI configured
az login

# Required services
- Container Instances
- Database for PostgreSQL
- Cache for Redis
- Application Gateway
```

#### Deployment Steps
```bash
# 1. Create resource group
az group create --name codegen-cicd --location eastus

# 2. Deploy container
az container create \
  --resource-group codegen-cicd \
  --name cicd-api \
  --image codegen-cicd:latest \
  --ports 8080 \
  --environment-variables \
    DB_HOST=your-postgres-host \
    CODEGEN_API_KEY=your-api-key
```

---

## 🛠️ Option 4: Development Setup

### Local Development Environment

#### Prerequisites
```bash
# Development tools
- VS Code or preferred IDE
- Node.js 18+
- Python 3.8+
- Docker Desktop
- WSL2 (Windows)
- Git
```

#### Setup Steps
```bash
# 1. Clone and setup
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# 2. Install dependencies
npm install
pip install -r requirements.txt

# 3. Setup development database
docker run -d \
  --name postgres-dev \
  -e POSTGRES_DB=codegen-taskmaster-db \
  -e POSTGRES_USER=software_developer \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15-alpine

# 4. Configure environment
cp .env.comprehensive_cicd .env
# Set ENABLE_MOCK_MODE=true for development

# 5. Initialize database
npm run db:init

# 6. Start development server
npm run dev
```

#### Development Workflow
```bash
# Run tests
npm test

# Run specific component tests
npm run test:requirement-analyzer

# Run demos
npm run demo:comprehensive-cicd

# Check system health
npm run health:check

# Monitor WSL2 status
npm run wsl2:status
```

---

## 🔍 Verification & Testing

### Health Checks
```bash
# System health
curl http://localhost:8080/api/v1/health

# Database connectivity
npm run db:test

# WSL2 status
npm run wsl2:status

# AgentAPI connectivity
curl http://localhost:8000/health
```

### Functional Testing
```bash
# Test requirement processing
curl -X POST http://localhost:8080/api/v1/requirements \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Add user registration with email verification",
    "project_id": "test-project",
    "options": {
      "enable_validation": true,
      "max_iterations": 2
    }
  }'

# Check system metrics
curl http://localhost:8080/api/v1/metrics/system

# Get performance analytics
curl http://localhost:8080/api/v1/metrics/performance
```

### Load Testing
```bash
# Install load testing tool
npm install -g artillery

# Run load test
artillery run tests/load/basic-load-test.yml
```

---

## 📊 Monitoring & Observability

### Metrics Dashboard
```bash
# Access Grafana (if monitoring profile enabled)
http://localhost:3000
# Default: admin/admin

# Prometheus metrics
http://localhost:9090

# Application logs
docker-compose logs -f cicd-api
```

### Key Metrics to Monitor
- **Request Rate**: Requests per second
- **Response Time**: Average response time
- **Success Rate**: Percentage of successful operations
- **Database Performance**: Query execution time
- **WSL2 Instance Usage**: Active instances and resource usage
- **Memory Usage**: Application memory consumption
- **Error Rate**: Error percentage by endpoint

### Alerting Setup
```yaml
# prometheus/alerts.yml
groups:
  - name: cicd-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate detected"
      
      - alert: DatabaseConnectionFailure
        expr: up{job="postgres"} == 0
        for: 1m
        annotations:
          summary: "Database connection failed"
```

---

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Test connection manually
psql -h localhost -U software_developer -d codegen-taskmaster-db

# Reset database
npm run db:reset
```

#### WSL2 Issues
```bash
# Check WSL2 status
wsl --list --verbose

# Restart WSL2
wsl --shutdown
wsl --distribution Ubuntu-22.04

# Clean up instances
npm run wsl2:cleanup
```

#### AgentAPI Connection Issues
```bash
# Check AgentAPI status
curl http://localhost:8000/health

# Restart AgentAPI
docker-compose restart agentapi

# View AgentAPI logs
docker-compose logs agentapi
```

#### Memory Issues
```bash
# Check memory usage
docker stats

# Increase memory limits
# Edit docker-compose.yml:
services:
  cicd-api:
    deploy:
      resources:
        limits:
          memory: 4G
```

### Performance Optimization

#### Database Optimization
```sql
-- Create indexes for better performance
CREATE INDEX CONCURRENTLY idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX CONCURRENTLY idx_ai_interactions_task_id ON ai_interactions(task_id);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'pending';
```

#### Application Optimization
```bash
# Enable production optimizations
NODE_ENV=production
ENABLE_CONTEXT_CACHING=true
DB_POOL_MAX_SIZE=20

# Monitor performance
npm run metrics:performance
```

---

## 🔐 Security Considerations

### Environment Security
```bash
# Use strong passwords
DB_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
WEBHOOK_SECRET=$(openssl rand -base64 32)

# Enable SSL/TLS
DB_SSL_MODE=require
ENABLE_HTTPS=true
```

### Network Security
```yaml
# docker-compose.yml
networks:
  cicd-network:
    driver: bridge
    internal: true  # Isolate internal services
```

### API Security
```bash
# Enable rate limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# Use API keys
REQUIRE_API_KEY=true
API_KEY_HEADER=X-API-Key
```

---

## 📈 Scaling & Production

### Horizontal Scaling
```yaml
# docker-compose.yml
services:
  cicd-api:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### Load Balancing
```nginx
# nginx/nginx.conf
upstream cicd_backend {
    server cicd-api-1:8080;
    server cicd-api-2:8080;
    server cicd-api-3:8080;
}

server {
    listen 80;
    location / {
        proxy_pass http://cicd_backend;
    }
}
```

### Database Scaling
```bash
# Read replicas
DB_READ_REPLICA_HOST=postgres-read-replica
DB_WRITE_HOST=postgres-primary

# Connection pooling
DB_POOL_MAX_SIZE=50
DB_POOL_MIN_SIZE=10
```

---

## 🎯 Success Metrics

### Deployment Success Criteria
- ✅ All services start successfully
- ✅ Health checks pass
- ✅ Database connectivity established
- ✅ API endpoints respond correctly
- ✅ WSL2 instances can be created
- ✅ Claude Code validation works
- ✅ End-to-end workflow completes

### Performance Targets
- ✅ API response time < 200ms (95th percentile)
- ✅ Requirement processing < 30 seconds
- ✅ Database queries < 100ms
- ✅ System uptime > 99.9%
- ✅ Memory usage < 4GB per instance
- ✅ CPU usage < 80% average

---

## 📚 Additional Resources

### Documentation
- [API Reference](./API_REFERENCE.md)
- [Architecture Guide](./ARCHITECTURE.md)
- [Development Guide](./DEVELOPMENT.md)
- [Security Guide](./SECURITY.md)

### Support
- [GitHub Issues](https://github.com/Zeeeepa/claude-task-master/issues)
- [Discussions](https://github.com/Zeeeepa/claude-task-master/discussions)
- [Wiki](https://github.com/Zeeeepa/claude-task-master/wiki)

### Community
- [Discord Server](https://discord.gg/claude-task-master)
- [Slack Workspace](https://claude-task-master.slack.com)
- [Reddit Community](https://reddit.com/r/claude-task-master)

---

**🎉 Congratulations! Your Comprehensive CI/CD System is now deployed and ready to transform natural language requirements into production-ready code!**

