# Webhook System & Event-Driven Automation Engine

A comprehensive webhook system for event-driven automation that triggers PR validation, error handling, and status updates throughout the CI/CD pipeline.

## 🎯 Overview

This webhook system provides:

- **Multi-source webhook handling** (GitHub, Linear, Codegen, Claude Code)
- **Intelligent event routing** with priority and context-based decisions
- **Robust event processing** with queuing, retry logic, and deduplication
- **Workflow automation** for complex multi-step processes
- **Security validation** with signature verification and rate limiting
- **Comprehensive monitoring** with metrics and health checks

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Webhook       │    │   Event          │    │   Workflow      │
│   Server        │───▶│   Processing     │───▶│   Engine        │
│                 │    │   Pipeline       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Security      │    │   Event Queue    │    │   Integrations  │
│   Validation    │    │   & Storage      │    │   (GitHub,      │
│                 │    │                  │    │    Linear, etc) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { WebhookServer } from './webhook_server.js';
import { loadWebhookConfig } from '../config/webhook_config.js';

// Load configuration
const config = loadWebhookConfig({
  server: { port: 3000 },
  webhooks: {
    github: { secret: 'your-github-secret' },
    linear: { secret: 'your-linear-secret' }
  }
});

// Create and start webhook server
const webhookServer = new WebhookServer(config);
await webhookServer.start();

console.log('Webhook server running on port 3000');
```

### Advanced Configuration

```javascript
import { WebhookServer } from './webhook_server.js';

const webhookServer = new WebhookServer({
  server: {
    port: 8080,
    host: '0.0.0.0',
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 2000
    }
  },
  webhooks: {
    github: {
      secret: process.env.GITHUB_WEBHOOK_SECRET,
      events: ['pull_request', 'push', 'workflow_run'],
      path: '/webhooks/github'
    },
    linear: {
      secret: process.env.LINEAR_WEBHOOK_SECRET,
      events: ['issue.update', 'issue.create'],
      path: '/webhooks/linear'
    }
  },
  eventQueue: {
    backend: 'postgresql',
    maxQueueSize: 50000,
    processingConcurrency: 10
  },
  workflow: {
    maxConcurrentWorkflows: 20,
    workflowTimeout: 300000
  }
});

await webhookServer.start();
```

## 📋 Components

### 1. Webhook Server (`webhook_server.js`)

Main Express server that receives and processes webhooks.

**Features:**
- Multi-source webhook handling
- Security validation
- Rate limiting
- Health checks and metrics
- Graceful shutdown

**Endpoints:**
- `POST /webhooks/github` - GitHub webhooks
- `POST /webhooks/linear` - Linear webhooks
- `POST /webhooks/codegen` - Codegen webhooks
- `POST /webhooks/claude-code` - Claude Code webhooks
- `GET /health` - Health check
- `GET /metrics` - System metrics

### 2. Webhook Processor (`webhook_processor.js`)

Core processing engine for webhook events.

**Features:**
- Event validation and enrichment
- Context-aware processing
- Error handling and retry logic
- Performance monitoring

### 3. Event Handlers

#### GitHub Handler (`github_handler.js`)

Processes GitHub webhook events:
- Pull request events (opened, synchronized, closed)
- Push events
- Issue comment events
- Workflow run events

**Key Features:**
- Codegen PR detection
- Automatic validation triggering
- Linear ticket linking
- Workflow failure handling

#### Linear Handler (`linear_handler.js`)

Processes Linear webhook events:
- Issue creation and updates
- Status changes
- Assignment changes

**Key Features:**
- Codegen assignment detection
- Automatic task triggering
- GitHub PR linking
- Priority-based routing

### 4. Workflow Engine (`workflow_engine.js`)

Executes complex multi-step automation workflows.

**Built-in Workflows:**
- `pr_validation` - Validate PRs with Claude Code
- `pr_revalidation` - Re-validate updated PRs
- `codegen_task` - Execute Codegen tasks from Linear
- `pr_merged` - Handle PR merge completion
- `workflow_failure` - Handle failed GitHub workflows
- `codegen_review` - Codegen reviews PRs

### 5. Event Management

#### Event Queue (`event_queue.js`)

Reliable event queuing with multiple backend support.

**Features:**
- Memory, Redis, and PostgreSQL backends
- Priority-based processing
- Concurrent processing with limits
- Retry logic with exponential backoff

#### Event Router (`event_router.js`)

Intelligent event routing based on rules and context.

**Features:**
- Rule-based routing
- Priority adjustments
- Context-aware decisions
- Load balancing

#### Event Store (`event_store.js`)

Event persistence for debugging and analytics.

**Features:**
- Multiple storage backends
- Event indexing and querying
- Automatic cleanup
- Compression support

#### Retry Manager (`retry_manager.js`)

Robust retry mechanisms for failed events.

**Features:**
- Exponential backoff with jitter
- Circuit breaker pattern
- Configurable retry policies
- Error classification

### 6. Security & Middleware

#### Webhook Validator (`webhook_validator.js`)

Security validation for webhook authenticity.

**Features:**
- Signature verification
- IP address validation
- Timestamp validation
- Rate limiting

#### Rate Limiter (`rate_limiter.js`)

Advanced rate limiting with multiple strategies.

**Features:**
- Sliding window rate limiting
- Burst protection
- Adaptive limits
- Slow-down mechanisms

### 7. Utilities

#### Event Deduplicator (`event_deduplicator.js`)

Prevents processing duplicate webhook events.

**Features:**
- Content-based deduplication
- Source-specific logic
- Timestamp tolerance
- Memory-efficient storage

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
WEBHOOK_PORT=3000
WEBHOOK_HOST=0.0.0.0

# Webhook Secrets
GITHUB_WEBHOOK_SECRET=your-github-secret
LINEAR_WEBHOOK_SECRET=your-linear-secret
CODEGEN_WEBHOOK_SECRET=your-codegen-secret
CLAUDE_CODE_WEBHOOK_SECRET=your-claude-code-secret

# Event Queue
EVENT_QUEUE_BACKEND=memory
EVENT_QUEUE_MAX_SIZE=10000
EVENT_QUEUE_CONCURRENCY=5

# Event Store
EVENT_STORE_BACKEND=memory
EVENT_STORE_MAX_EVENTS=100000
EVENT_STORE_RETENTION_DAYS=30

# Retry Manager
RETRY_MANAGER_MAX_RETRIES=3
RETRY_MANAGER_BASE_DELAY=1000
RETRY_MANAGER_CIRCUIT_BREAKER=true

# Security
WEBHOOK_VALIDATOR_IP_WHITELIST=false
WEBHOOK_VALIDATOR_TIMESTAMP=true
RATE_LIMITER_MAX_REQUESTS=100

# Monitoring
MONITORING_METRICS=true
MONITORING_HEALTH_CHECKS=true
LOG_LEVEL=info
```

### Configuration File

```javascript
import { loadWebhookConfig } from '../config/webhook_config.js';

const config = loadWebhookConfig({
  // Override default configuration
  server: {
    port: 8080,
    rateLimit: {
      max: 2000
    }
  },
  eventQueue: {
    backend: 'postgresql',
    processingConcurrency: 10
  }
});
```

## 🔄 Workflow Examples

### PR Validation Workflow

```javascript
// Triggered when a Codegen PR is opened
{
  "workflowType": "pr_validation",
  "steps": [
    { "name": "delay", "action": "delay", "config": { "duration": 5000 } },
    { "name": "validate_pr", "action": "validate_pr" },
    { "name": "update_status", "action": "update_pr_status" },
    { "name": "notify", "action": "send_notification" }
  ]
}
```

### Codegen Task Workflow

```javascript
// Triggered when Codegen is assigned to a Linear issue
{
  "workflowType": "codegen_task",
  "steps": [
    { "name": "parse_requirements", "action": "parse_linear_requirements" },
    { "name": "generate_code", "action": "trigger_codegen" },
    { "name": "create_pr", "action": "create_github_pr" },
    { "name": "update_linear", "action": "update_linear_issue" },
    { "name": "notify", "action": "send_notification" }
  ]
}
```

## 📊 Monitoring & Metrics

### Health Checks

```bash
# Check overall system health
curl http://localhost:3000/health

# Response
{
  "status": "healthy",
  "timestamp": "2025-05-28T16:34:28.369Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Metrics

```bash
# Get system metrics
curl http://localhost:3000/metrics

# Response
{
  "server": {
    "uptime": 3600,
    "memoryUsage": { "rss": 50331648, "heapTotal": 20971520 }
  },
  "eventQueue": {
    "eventsQueued": 1250,
    "eventsProcessed": 1200,
    "queueSize": 50
  },
  "eventStore": {
    "eventsStored": 1200,
    "storageSize": 1200
  }
}
```

### Component Health

Each component provides health status:
- `healthy` - Operating normally
- `degraded` - Operating with reduced performance
- `unhealthy` - Not functioning properly

## 🧪 Testing

### Unit Tests

```javascript
import { WebhookProcessor } from './webhook_processor.js';

describe('WebhookProcessor', () => {
  it('should process GitHub PR events', async () => {
    const processor = new WebhookProcessor();
    const event = {
      id: 'test-event',
      source: 'github',
      type: 'pull_request',
      payload: { action: 'opened' }
    };
    
    const result = await processor.processWebhook(event);
    expect(result.status).toBe('success');
  });
});
```

### Integration Tests

```javascript
import request from 'supertest';
import { WebhookServer } from './webhook_server.js';

describe('Webhook Server', () => {
  let server;
  
  beforeAll(async () => {
    server = new WebhookServer({ server: { port: 0 } });
    await server.start();
  });
  
  it('should handle GitHub webhooks', async () => {
    const response = await request(server.app)
      .post('/webhooks/github')
      .send({ action: 'opened' })
      .expect(200);
      
    expect(response.body.success).toBe(true);
  });
});
```

## 🔒 Security

### Webhook Signature Validation

All webhooks are validated using HMAC signatures:

```javascript
// GitHub signature validation
const signature = req.headers['x-hub-signature-256'];
const payload = req.rawBody;
const secret = process.env.GITHUB_WEBHOOK_SECRET;

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

const isValid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(`sha256=${expectedSignature}`)
);
```

### Rate Limiting

Multiple layers of rate limiting:
- Global rate limiting per IP
- Webhook-specific rate limiting
- Adaptive rate limiting based on performance
- Burst protection

### IP Whitelisting

Optional IP address validation:
- GitHub webhook IP ranges
- Custom IP whitelist
- CIDR notation support

## 🚨 Error Handling

### Retry Strategies

- **Exponential backoff** with jitter
- **Circuit breaker** pattern for failing services
- **Dead letter queue** for permanently failed events
- **Error classification** (retryable vs non-retryable)

### Error Types

```javascript
// Retryable errors
const retryableErrors = [
  'NETWORK_ERROR',
  'TIMEOUT_ERROR',
  'RATE_LIMIT_ERROR',
  'SERVICE_UNAVAILABLE'
];

// Non-retryable errors
const nonRetryableErrors = [
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'NOT_FOUND_ERROR',
  'DUPLICATE_ERROR'
];
```

## 📈 Performance

### Optimization Features

- **Event deduplication** to prevent duplicate processing
- **Parallel processing** with configurable concurrency
- **Event batching** for database operations
- **Memory-efficient** storage with cleanup
- **Compression** for large payloads

### Performance Targets

- **Event Processing Time**: < 5 seconds average
- **Webhook Response Time**: < 1 second
- **Event Throughput**: 1000+ events per minute
- **Success Rate**: > 99.9% successful processing

## 🔧 Troubleshooting

### Common Issues

1. **Webhook signature validation fails**
   - Check webhook secret configuration
   - Verify payload is not modified
   - Check timestamp tolerance

2. **Events not processing**
   - Check event queue status
   - Verify processor registration
   - Check rate limiting

3. **High memory usage**
   - Check event store retention
   - Verify cleanup is running
   - Monitor queue sizes

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm start

# Check component health
curl http://localhost:3000/health

# View metrics
curl http://localhost:3000/metrics
```

## 🤝 Contributing

1. Follow existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure all health checks pass
5. Test with real webhook payloads

## 📄 License

This project follows the same MIT License with Commons Clause as the parent claude-task-master project.

---

**Built with ❤️ for robust, scalable webhook processing and event-driven automation**

