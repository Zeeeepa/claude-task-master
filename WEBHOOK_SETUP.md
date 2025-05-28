# Webhook System Setup Guide

This guide provides step-by-step instructions for setting up and configuring the webhook system for Claude Task Master.

## 🎯 Overview

The webhook system enables automated workflows by:
- Capturing GitHub PR events and triggering validation
- Processing Linear issue updates and comments
- Handling Codegen agent status and results
- Integrating with AgentAPI for workflow orchestration

## 🚀 Quick Setup

### 1. Environment Configuration

```bash
# Copy the webhook environment template
cp webhooks/.env.example webhooks/.env

# Edit the configuration
nano webhooks/.env
```

### 2. Required Secrets

Generate and configure these essential secrets:

```bash
# Generate webhook secrets (use strong random strings)
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
LINEAR_WEBHOOK_SECRET=$(openssl rand -hex 32)
CODEGEN_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Generate API keys
WEBHOOK_MASTER_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
CODEGEN_INTERNAL_KEY=$(openssl rand -hex 32)
```

### 3. Start the Webhook Server

```bash
# Development mode
npm run webhook-dev

# Production mode
npm run webhook-server
```

## 🔧 Detailed Configuration

### GitHub Integration

1. **Get GitHub Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create token with `repo` and `admin:repo_hook` scopes
   - Set as `GITHUB_TOKEN` in environment

2. **Configure Repository Webhooks**:
   ```bash
   # For each repository, add webhook:
   # URL: https://your-domain.com/webhooks/github
   # Content type: application/json
   # Secret: Your GITHUB_WEBHOOK_SECRET
   # Events: Pull requests, Pushes, Check runs
   ```

3. **Test GitHub Integration**:
   ```bash
   curl -X GET http://localhost:3001/webhooks/github/test
   ```

### Linear Integration

1. **Get Linear API Key**:
   - Go to Linear Settings → API → Personal API keys
   - Create new API key with full access
   - Set as `LINEAR_API_KEY` in environment

2. **Configure Linear Webhooks**:
   ```bash
   # In Linear Settings → API → Webhooks:
   # URL: https://your-domain.com/webhooks/linear
   # Secret: Your LINEAR_WEBHOOK_SECRET
   # Events: Issues, Comments, Projects
   ```

3. **Get Codegen User ID**:
   ```bash
   # Find the Linear user ID for your codegen bot
   # Set as CODEGEN_USER_ID in environment
   ```

4. **Test Linear Integration**:
   ```bash
   curl -X GET http://localhost:3001/webhooks/linear/test
   ```

### AgentAPI Integration

1. **Configure AgentAPI URL**:
   ```bash
   # Set the AgentAPI endpoint
   AGENTAPI_URL=http://localhost:8000
   AGENTAPI_KEY=your_agentapi_key
   ```

2. **Test AgentAPI Connection**:
   ```bash
   curl -X GET http://localhost:3001/webhooks/status
   ```

## 🔒 Security Configuration

### SSL/TLS Setup

For production, use HTTPS with proper certificates:

```bash
# Using nginx as reverse proxy
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /webhooks/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Firewall Configuration

```bash
# Allow webhook traffic
sudo ufw allow 3001/tcp

# Restrict to specific IPs if needed
sudo ufw allow from 140.82.112.0/20 to any port 3001  # GitHub IPs
```

### Rate Limiting

Configure rate limits based on your needs:

```bash
# Standard limits
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_REQUESTS=100   # 100 requests per window

# For high-volume repositories, increase limits
RATE_LIMIT_REQUESTS=500
```

## 📊 Database Setup (Optional)

For production, use a persistent database:

### PostgreSQL Setup

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE webhooks;
CREATE USER webhook_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE webhooks TO webhook_user;
\q

# Configure environment
DATABASE_URL=postgresql://webhook_user:secure_password@localhost:5432/webhooks
DATABASE_TYPE=postgresql
```

### Database Schema

The system will automatically create tables for:
- `webhook_events` - Event storage and processing status
- `webhook_metrics` - Performance and monitoring data
- `retry_queue` - Failed events for retry processing

## 🔄 Workflow Configuration

### PR Validation Workflow

Configure automatic PR validation:

```bash
# Enable GitHub webhook processing
ENABLE_GITHUB_WEBHOOKS=true

# Configure validation triggers
ENABLE_AGENTAPI_INTEGRATION=true
AGENTAPI_URL=http://localhost:8000
```

### Linear Issue Automation

Set up automatic issue processing:

```bash
# Enable Linear webhook processing
ENABLE_LINEAR_WEBHOOKS=true

# Configure codegen user detection
CODEGEN_USER_ID=your_linear_user_id
```

### Error Escalation

Configure error handling and escalation:

```bash
# Enable error escalation
ALERTING_ENABLED=true
ALERT_WEBHOOK_URL=https://hooks.slack.com/your-slack-webhook

# Set error thresholds
ERROR_RATE_THRESHOLD=0.05  # 5% error rate
SLOW_REQUEST_THRESHOLD=5000  # 5 second threshold
```

## 🧪 Testing Your Setup

### 1. Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

### 2. GitHub Webhook Test

Create a test PR in your repository and verify:

```bash
# Check webhook events
curl http://localhost:3001/webhooks/github/events

# Check processing status
curl http://localhost:3001/webhooks/status/events
```

### 3. Linear Webhook Test

Create or update a Linear issue and verify:

```bash
# Check Linear events
curl http://localhost:3001/webhooks/linear/events

# Check processing metrics
curl http://localhost:3001/webhooks/status/metrics
```

### 4. End-to-End Test

1. Create a Linear issue assigned to codegen
2. Verify webhook triggers codegen workflow
3. Create a PR linked to the Linear issue
4. Verify PR validation is triggered
5. Check that Linear issue is updated with PR status

## 📈 Monitoring and Maintenance

### Log Monitoring

Monitor webhook processing:

```bash
# Follow webhook logs
tail -f /var/log/webhook-server.log

# Monitor error rates
grep "ERROR" /var/log/webhook-server.log | tail -20
```

### Performance Monitoring

Track key metrics:

```bash
# Get system metrics
curl http://localhost:3001/webhooks/status/metrics

# Check processing times
curl "http://localhost:3001/webhooks/status/events?limit=100" | jq '.events[] | .processingTime'
```

### Database Maintenance

Regular maintenance tasks:

```bash
# Clean up old events (automated, but can be triggered manually)
curl -X POST http://localhost:3001/webhooks/status/cleanup

# Check database size
curl http://localhost:3001/webhooks/status/detailed
```

## 🚨 Troubleshooting

### Common Issues

1. **Webhook Signature Validation Fails**
   ```bash
   # Check secret configuration
   echo $GITHUB_WEBHOOK_SECRET
   
   # Verify webhook secret in GitHub matches environment
   # Check webhook delivery logs in GitHub
   ```

2. **Rate Limiting Issues**
   ```bash
   # Check current rate limits
   curl http://localhost:3001/webhooks/status/detailed
   
   # Increase limits if needed
   RATE_LIMIT_REQUESTS=500
   ```

3. **Database Connection Issues**
   ```bash
   # Test database connection
   psql $DATABASE_URL -c "SELECT 1;"
   
   # Check connection pool status
   curl http://localhost:3001/webhooks/status/detailed
   ```

4. **AgentAPI Integration Issues**
   ```bash
   # Test AgentAPI connectivity
   curl $AGENTAPI_URL/health
   
   # Check webhook processing logs
   grep "AgentAPI" /var/log/webhook-server.log
   ```

### Debug Mode

Enable detailed debugging:

```bash
# Start with debug logging
DEBUG=true LOG_LEVEL=debug npm run webhook-dev

# Enable request/response logging
LOG_REQUESTS=true LOG_RESPONSES=true LOG_BODIES=true
```

### Webhook Delivery Testing

Test webhook delivery manually:

```bash
# GitHub webhook test
curl -X POST http://localhost:3001/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=$(echo -n '{"zen":"test"}' | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"zen":"test"}'

# Linear webhook test
curl -X POST http://localhost:3001/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: $(echo -n '{"type":"Issue","action":"create"}' | openssl dgst -sha256 -hmac "$LINEAR_WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"type":"Issue","action":"create","data":{"id":"test","title":"Test Issue"}}'
```

## 🔄 Deployment

### Production Deployment

1. **Environment Setup**:
   ```bash
   # Set production environment
   NODE_ENV=production
   
   # Use production database
   DATABASE_URL=postgresql://user:pass@prod-db:5432/webhooks
   
   # Configure production secrets
   # (Use secure secret management system)
   ```

2. **Process Management**:
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start webhooks/server.js --name webhook-server
   pm2 startup
   pm2 save
   
   # Using systemd
   sudo cp webhook-server.service /etc/systemd/system/
   sudo systemctl enable webhook-server
   sudo systemctl start webhook-server
   ```

3. **Load Balancing**:
   ```bash
   # Run multiple instances
   pm2 start webhooks/server.js -i 4 --name webhook-server
   
   # Or use nginx load balancing
   upstream webhook_backend {
       server 127.0.0.1:3001;
       server 127.0.0.1:3002;
       server 127.0.0.1:3003;
   }
   ```

### Backup and Recovery

```bash
# Database backup
pg_dump $DATABASE_URL > webhook_backup.sql

# Configuration backup
tar -czf webhook_config.tar.gz webhooks/.env webhooks/config/

# Restore database
psql $DATABASE_URL < webhook_backup.sql
```

## 📞 Support

For additional support:

1. Check the webhook system logs
2. Review the GitHub/Linear webhook delivery logs
3. Test individual components using the provided curl commands
4. Open an issue in the repository with detailed error information

## 🔗 Related Documentation

- [Main README](README.md) - Project overview
- [Webhook System README](webhooks/README.md) - Technical details
- [AgentAPI Documentation](docs/agentapi.md) - AgentAPI integration
- [Linear Integration Guide](docs/linear.md) - Linear setup details

