# Webhook Architecture & Event Processing System

## Overview

The Webhook Architecture & Event Processing System is a comprehensive, production-ready solution for handling GitHub webhook events in the AI CI/CD pipeline. It provides robust event processing, reliable queuing, security validation, and seamless integration with AgentAPI for automated code deployment and validation.

## Architecture Components

### 1. GitHub Webhook Handler (`github_webhook_handler.js`)

The main entry point for GitHub webhook events, providing:

- **Secure Endpoint**: Express.js server with configurable security measures
- **Signature Verification**: GitHub webhook signature validation using HMAC-SHA256
- **Rate Limiting**: Protection against abuse with configurable limits
- **Event Routing**: Intelligent routing of events to appropriate processors
- **Health Monitoring**: Built-in health checks and metrics collection

#### Key Features:
- Multi-layer security validation
- Configurable CORS support
- Request/response logging
- Automatic event filtering
- Graceful error handling

### 2. Event Queue Manager (`event_queue_manager.js`)

Redis-based message queue system providing:

- **Reliable Queuing**: Redis sorted sets for priority-based event processing
- **Retry Logic**: Exponential backoff with configurable retry limits
- **Dead Letter Queue**: Failed events isolation for manual intervention
- **Batch Processing**: Efficient processing of multiple events
- **Concurrency Control**: Configurable concurrent processing limits

#### Queue Types:
- `default`: General webhook events
- `deployment`: Code deployment tasks
- `validation`: Code validation tasks
- `workflow`: Workflow management tasks
- `recovery`: Failure recovery tasks
- `dead_letter`: Failed events requiring manual intervention

### 3. Event Processor (`event_processor.js`)

Core event processing engine that:

- **AgentAPI Integration**: Seamless communication with AgentAPI middleware
- **Event Type Handling**: Specialized processors for different GitHub events
- **Workflow Coordination**: Orchestrates complex multi-step workflows
- **Database Integration**: Logs events and updates task status
- **Linear Integration**: Updates Linear tickets with progress information

#### Supported Events:
- Pull Request events (opened, synchronize, closed, etc.)
- Push events (main branch deployments)
- Check Run events (CI/CD status updates)
- Check Suite events (comprehensive test results)

### 4. Webhook Security (`webhook_security.js`)

Comprehensive security layer providing:

- **Signature Verification**: GitHub webhook signature validation
- **Payload Validation**: JSON schema validation for event payloads
- **IP Whitelisting**: Configurable IP address restrictions
- **User-Agent Validation**: GitHub-specific User-Agent verification
- **Rate Limiting**: Request throttling and abuse prevention
- **Security Event Tracking**: Detailed logging of security violations

#### Security Features:
- Timing-safe signature comparison
- Configurable validation rules
- Security metrics collection
- Event-specific payload schemas
- Comprehensive audit logging

### 5. Event Correlation (`event_correlation.js`)

Advanced correlation system that:

- **Duplicate Detection**: Prevents processing of duplicate webhook deliveries
- **Workflow Tracking**: Links related events into cohesive workflows
- **Event Correlation**: Associates events with existing tasks and PRs
- **State Management**: Tracks workflow progress and completion
- **Metrics Collection**: Provides insights into event patterns

#### Correlation Patterns:
- Pull Request lifecycle tracking
- Commit-based event correlation
- Branch-based workflow association
- User activity correlation

## System Flow

```mermaid
graph TD
    A[GitHub Webhook] --> B[Webhook Handler]
    B --> C[Security Validation]
    C --> D[Event Correlation]
    D --> E[Event Queue]
    E --> F[Event Processor]
    F --> G[AgentAPI]
    F --> H[Database]
    F --> I[Linear API]
    
    J[Redis] --> E
    J --> D
    
    K[Monitoring] --> B
    K --> E
    K --> F
```

## Configuration

### Environment Variables

```bash
# GitHub Webhook Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
WEBHOOK_PORT=3001

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password

# AgentAPI Configuration
AGENTAPI_BASE_URL=http://localhost:8000
AGENTAPI_API_KEY=your_api_key_here

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_cicd

# Linear Integration
LINEAR_API_KEY=your_linear_api_key_here

# Optional: Security Configuration
WEBHOOK_ENABLE_IP_WHITELIST=false
WEBHOOK_ALLOWED_IPS=140.82.112.0/20,185.199.108.0/22
```

### Configuration File

The system uses `config/webhook_config.json` for detailed configuration:

```json
{
  "webhook": {
    "server": {
      "port": 3001,
      "path": "/webhook/github",
      "maxPayloadSize": "10mb"
    },
    "security": {
      "enablePayloadValidation": true,
      "enableRateLimiting": true,
      "enableIPWhitelist": false
    },
    "queue": {
      "processing": {
        "maxRetries": 3,
        "retryDelay": 1000,
        "concurrency": 5
      }
    }
  }
}
```

## Installation & Setup

### 1. Quick Setup

```bash
# Run the automated setup script
./scripts/webhook_setup.sh
```

### 2. Manual Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start Redis (if not already running)
redis-server

# Start the webhook server
node src/ai_cicd_system/webhooks/github_webhook_handler.js
```

### 3. Docker Setup

```bash
# Build and start with Docker Compose
docker-compose -f docker-compose.webhook.yml up -d
```

## GitHub Webhook Configuration

### 1. Repository Settings

1. Go to your repository settings
2. Navigate to "Webhooks"
3. Click "Add webhook"

### 2. Webhook Configuration

- **Payload URL**: `https://your-domain.com/webhook/github`
- **Content type**: `application/json`
- **Secret**: Your `GITHUB_WEBHOOK_SECRET`
- **SSL verification**: Enable (recommended)

### 3. Events Selection

Select the following events:
- Pull requests
- Pushes
- Check runs
- Check suites
- Pull request reviews
- Pull request review comments
- Statuses

## Monitoring & Observability

### Health Checks

```bash
# Check webhook server health
curl http://localhost:3001/health

# Check detailed metrics
curl http://localhost:3001/metrics
```

### Queue Monitoring

```bash
# Monitor queue status
./scripts/webhook_queue_monitor.sh

# Check Redis directly
redis-cli -h localhost -p 6379
> ZCARD webhook:events:default
> LLEN webhook:events:dead_letter
```

### Log Analysis

The system provides structured logging with different levels:

```bash
# View webhook logs
tail -f logs/webhook.log

# Filter by log level
grep "ERROR" logs/webhook.log
grep "SECURITY" logs/webhook.log
```

## Performance Tuning

### 1. Queue Configuration

```json
{
  "queue": {
    "processing": {
      "concurrency": 10,        // Increase for higher throughput
      "batchSize": 20,          // Process more events per batch
      "maxRetries": 5,          // Increase retry attempts
      "processingTimeout": 600000 // 10 minutes timeout
    }
  }
}
```

### 2. Redis Optimization

```bash
# Redis configuration for high throughput
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

### 3. Security Optimization

```json
{
  "security": {
    "rateLimiting": {
      "windowMs": 900000,     // 15 minutes
      "max": 2000,            // Increase for high-volume repos
      "slowDownThreshold": 200
    }
  }
}
```

## Troubleshooting

### Common Issues

#### 1. Webhook Signature Verification Fails

```bash
# Check webhook secret configuration
echo $GITHUB_WEBHOOK_SECRET

# Verify GitHub webhook configuration
# Ensure secret matches in both places
```

#### 2. Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping

# Check Redis logs
tail -f /var/log/redis/redis-server.log
```

#### 3. High Memory Usage

```bash
# Monitor Redis memory usage
redis-cli INFO memory

# Clear old correlation data
redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', 'webhook:correlation:*')))" 0
```

#### 4. AgentAPI Connection Failures

```bash
# Test AgentAPI connectivity
curl -H "Authorization: Bearer $AGENTAPI_API_KEY" $AGENTAPI_BASE_URL/health

# Check AgentAPI logs
tail -f logs/agentapi.log
```

### Debug Mode

Enable debug logging:

```bash
export NODE_ENV=development
export DEBUG=webhook:*
node src/ai_cicd_system/webhooks/github_webhook_handler.js
```

## Security Considerations

### 1. Network Security

- Use HTTPS for webhook endpoints
- Configure firewall rules to restrict access
- Enable IP whitelisting for production environments

### 2. Secret Management

- Store webhook secrets securely (e.g., AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets regularly
- Use different secrets for different environments

### 3. Monitoring & Alerting

- Monitor for unusual webhook patterns
- Set up alerts for security violations
- Track failed authentication attempts

### 4. Data Protection

- Limit payload logging in production
- Implement data retention policies
- Ensure compliance with data protection regulations

## Scaling Considerations

### Horizontal Scaling

1. **Multiple Webhook Instances**
   ```bash
   # Run multiple instances behind a load balancer
   PM2_INSTANCES=4 pm2 start ecosystem.config.js
   ```

2. **Redis Clustering**
   ```bash
   # Configure Redis cluster for high availability
   redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002
   ```

3. **Database Sharding**
   - Partition event data by repository
   - Use read replicas for analytics queries

### Vertical Scaling

1. **Resource Allocation**
   - Increase memory for Redis caching
   - Allocate more CPU cores for processing
   - Use SSD storage for better I/O performance

2. **Connection Pooling**
   - Configure database connection pools
   - Optimize Redis connection management

## API Reference

### Webhook Endpoints

#### POST /webhook/github
Receives GitHub webhook events.

**Headers:**
- `X-GitHub-Event`: Event type
- `X-GitHub-Delivery`: Unique delivery ID
- `X-Hub-Signature-256`: HMAC signature

**Response:**
```json
{
  "status": "accepted",
  "eventId": "12345678-1234-1234-1234-123456789012",
  "processingTime": 150
}
```

#### GET /health
Returns webhook server health status.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400000,
  "metrics": {
    "totalRequests": 1000,
    "validRequests": 995,
    "invalidRequests": 5
  }
}
```

#### GET /metrics
Returns detailed metrics.

**Response:**
```json
{
  "totalRequests": 1000,
  "validRequests": 995,
  "invalidRequests": 5,
  "processedEvents": 950,
  "failedEvents": 5,
  "averageProcessingTime": 125,
  "queueMetrics": {
    "default": 0,
    "deployment": 2,
    "validation": 1
  }
}
```

## Integration Examples

### Custom Event Processor

```javascript
import { EventProcessor } from './src/ai_cicd_system/webhooks/event_processor.js';

class CustomEventProcessor extends EventProcessor {
  async processCustomEvent(event, job) {
    // Custom processing logic
    console.log(`Processing custom event: ${event.type}`);
    
    // Call parent method for standard processing
    return await super.processEvent(event, job);
  }
}
```

### Custom Security Rules

```javascript
import { WebhookSecurity } from './src/ai_cicd_system/webhooks/webhook_security.js';

const security = new WebhookSecurity();

// Add custom validation rule
security.addValidationRule('custom_event', {
  type: 'object',
  required: ['action', 'custom_data'],
  properties: {
    action: { type: 'string' },
    custom_data: { type: 'object' }
  }
});
```

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/your-org/claude-task-master.git
cd claude-task-master

# Install dependencies
npm install

# Set up development environment
cp .env.example .env.development
# Edit configuration

# Start development server
npm run dev:webhook
```

### Testing

```bash
# Run unit tests
npm test src/ai_cicd_system/webhooks/

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e:webhook
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

## License

This project is licensed under the MIT License with Commons Clause. See the LICENSE file for details.

## Support

For support and questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review [GitHub Issues](https://github.com/your-org/claude-task-master/issues)
3. Join our [Discord community](https://discord.gg/your-invite)
4. Contact support at support@your-domain.com

