# Webhook System for PR Event Handling & Routing

A comprehensive webhook system that captures GitHub PR events and routes them to appropriate components (Claude Code, AgentAPI) for automated deployment and validation workflows.

## 🎯 Overview

This webhook system serves as the event-driven trigger for the entire CI/CD pipeline, providing:

- **GitHub Webhook Integration**: Secure handling of PR events with signature verification
- **Event Routing**: Intelligent routing to Claude Code, AgentAPI, Codegen, and Linear
- **Queue Management**: Reliable event processing with retry mechanisms
- **Error Handling**: Comprehensive error handling and recovery
- **Monitoring**: Real-time metrics and health monitoring

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Webhook System Architecture                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ GitHub Webhook  │───▶│ Webhook Server  │───▶│ Event Processor │             │
│  │ Events          │    │ (Express.js)    │    │ (Validation)    │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│           │                       │                       │                     │
│           ▼                       ▼                       ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ Signature       │    │ Rate Limiting   │    │ Event Queue     │             │
│  │ Verification    │    │ & Security      │    │ (Optional)      │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│           │                       │                       │                     │
│           ▼                       ▼                       ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ Event Router    │───▶│ Handler         │───▶│ External        │             │
│  │ (Dispatch)      │    │ Selection       │    │ Services        │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│           │                       │                       │                     │
│           ▼                       ▼                       ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ Claude Code     │    │ AgentAPI        │    │ Codegen API     │             │
│  │ (Deployment)    │    │ (Middleware)    │    │ (AI Fixes)      │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│           │                       │                       │                     │
│           ▼                       ▼                       ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ Linear          │    │ Monitoring      │    │ Error Recovery  │             │
│  │ (Issue Updates) │    │ & Logging       │    │ & Retry Logic   │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { startWebhookSystem } from './src/webhooks/index.js';

// Start with default configuration
const webhookSystem = await startWebhookSystem({
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  security: {
    secret: process.env.GITHUB_WEBHOOK_SECRET
  }
});

console.log('Webhook system started:', webhookSystem.getStatus());
```

### Advanced Configuration

```javascript
import { WebhookSystem, WebhookConfig } from './src/webhooks/index.js';

// Create custom configuration
const config = new WebhookConfig({
  server: {
    port: 3000,
    maxPayloadSize: '10mb',
    timeout: 30000
  },
  security: {
    secret: process.env.GITHUB_WEBHOOK_SECRET,
    enableSignatureVerification: true
  },
  queue: {
    enabled: true,
    maxConcurrency: 5,
    retryAttempts: 3
  },
  handlers: {
    claudeCode: {
      enabled: true,
      apiUrl: 'http://localhost:3001'
    },
    agentAPI: {
      enabled: true,
      apiUrl: 'http://localhost:3002'
    },
    codegen: {
      enabled: true,
      apiUrl: 'https://api.codegen.sh'
    },
    linear: {
      enabled: true,
      apiToken: process.env.LINEAR_API_TOKEN
    }
  }
});

// Initialize and start system
const system = new WebhookSystem(config);
await system.start();
```

## 📋 Supported Events

### Pull Request Events
- `pull_request.opened` - PR created
- `pull_request.synchronize` - PR updated
- `pull_request.closed` - PR closed/merged
- `pull_request.reopened` - PR reopened

### Push Events
- `push` - Code pushed to repository

### Workflow Events
- `workflow_run.completed` - Workflow finished
- `workflow_run.failed` - Workflow failed

### Issue Events
- `issues.opened` - Issue created
- `issues.closed` - Issue closed
- `issue_comment.created` - Comment added

### Review Events
- `pull_request_review.submitted` - Review submitted

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
WEBHOOK_PORT=3000
WEBHOOK_HOST=0.0.0.0
WEBHOOK_MAX_PAYLOAD_SIZE=10mb
WEBHOOK_TIMEOUT=30000

# Security Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_VERIFY_SIGNATURE=true

# Rate Limiting
WEBHOOK_RATE_LIMIT_ENABLED=true
WEBHOOK_RATE_LIMIT_WINDOW=900000  # 15 minutes
WEBHOOK_RATE_LIMIT_MAX=1000

# Queue Configuration
WEBHOOK_QUEUE_ENABLED=true
WEBHOOK_QUEUE_CONCURRENCY=5
WEBHOOK_QUEUE_RETRY_ATTEMPTS=3
WEBHOOK_QUEUE_TIMEOUT=60000

# Handler Configuration
CLAUDE_CODE_API_URL=http://localhost:3001
CLAUDE_CODE_API_KEY=your_api_key

AGENTAPI_URL=http://localhost:3002
AGENTAPI_API_KEY=your_api_key

CODEGEN_API_URL=https://api.codegen.sh
CODEGEN_API_KEY=your_api_key

LINEAR_API_TOKEN=your_linear_token

# Logging
WEBHOOK_LOG_LEVEL=info
WEBHOOK_LOG_FORMAT=json
WEBHOOK_ENABLE_METRICS=true
```

### GitHub Webhook Setup

1. Go to your repository settings
2. Navigate to "Webhooks"
3. Click "Add webhook"
4. Configure:
   - **Payload URL**: `https://your-domain.com/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Your webhook secret
   - **Events**: Select individual events or "Send me everything"

```javascript
// GitHub webhook configuration example
const webhookConfig = {
  url: 'https://your-domain.com/webhooks/github',
  content_type: 'json',
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  events: [
    'pull_request',
    'push',
    'workflow_run',
    'issues',
    'issue_comment',
    'pull_request_review'
  ],
  active: true
};
```

## 🔄 Event Flow

### PR Creation Flow
1. GitHub sends `pull_request.opened` webhook
2. Webhook server receives and validates signature
3. Event processor parses PR data
4. Event router dispatches to handlers:
   - **Claude Code**: Triggers PR deployment
   - **AgentAPI**: Sends PR context for processing
   - **Linear**: Updates issue status to "In Progress"

### PR Update Flow
1. GitHub sends `pull_request.synchronize` webhook
2. System processes new commits
3. Handlers update their respective services:
   - **Claude Code**: Updates deployment
   - **AgentAPI**: Processes new changes
   - **Linear**: Adds progress comment

### Workflow Failure Flow
1. GitHub sends `workflow_run.completed` with failure
2. System identifies failure condition
3. **Codegen Handler**: Triggers AI-powered error analysis
4. **Linear Handler**: Updates issue status to "Blocked"

## 🛠️ API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Webhook Endpoint
```
POST /webhooks/github
```

Headers:
- `X-GitHub-Event`: Event type
- `X-GitHub-Delivery`: Unique delivery ID
- `X-Hub-Signature-256`: HMAC signature

### Status Endpoint
```
GET /webhooks/status
```

Response:
```json
{
  "server": "running",
  "processor": {
    "stats": {
      "processed": 150,
      "failed": 2,
      "successRate": "98.67%"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Replay Endpoint
```
POST /webhooks/replay/:deliveryId
```

## 📊 Monitoring & Metrics

### System Metrics
```javascript
const metrics = webhookSystem.getMetrics();
console.log(metrics);
```

Output:
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600000,
  "system": {
    "memory": { "rss": 50000000, "heapUsed": 30000000 },
    "cpu": { "user": 1000000, "system": 500000 }
  },
  "processor": {
    "stats": {
      "processed": 150,
      "failed": 2,
      "retries": 5
    }
  },
  "queue": {
    "pending": 0,
    "processing": 2,
    "completed": 148
  }
}
```

### Health Monitoring
```javascript
const health = await webhookSystem.getHealth();
console.log(health);
```

Output:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "server": { "healthy": true },
    "queue": { "healthy": true, "activeWorkers": 3 },
    "handlers": {
      "claudeCode": { "healthy": true, "version": "1.0.0" },
      "agentAPI": { "healthy": true, "uptime": "2h 30m" },
      "linear": { "healthy": true }
    }
  }
}
```

## 🔒 Security Features

### Signature Verification
- HMAC-SHA256 signature validation
- Timing-safe comparison to prevent timing attacks
- Configurable secret management

### Rate Limiting
- IP-based rate limiting
- Configurable windows and limits
- Burst protection with slow-down

### Input Validation
- Payload size limits
- Content-type validation
- User-Agent verification
- Required header checks

## 🚨 Error Handling

### Retry Mechanisms
- Exponential backoff for failed requests
- Configurable retry attempts
- Dead letter queue for persistent failures

### Circuit Breaker Pattern
- Automatic failure detection
- Service degradation handling
- Recovery monitoring

### Error Recovery
- Automatic Codegen triggering for failures
- Context preservation for debugging
- Comprehensive error logging

## 🧪 Testing

### Unit Tests
```bash
npm test -- src/webhooks
```

### Integration Tests
```bash
npm run test:integration -- webhooks
```

### Webhook Simulation
```javascript
import { WebhookProcessor } from './src/webhooks/webhook-processor.js';

const processor = new WebhookProcessor();

// Simulate PR creation
const mockEvent = {
  action: 'opened',
  pull_request: {
    number: 123,
    title: 'Test PR',
    // ... other PR data
  },
  repository: {
    full_name: 'owner/repo',
    // ... other repo data
  }
};

await processor.processWebhook(mockEvent, 'sha256=signature', {
  event: 'pull_request',
  delivery: 'test-delivery-id'
});
```

## 📈 Performance Optimization

### Queue Management
- Configurable concurrency limits
- Priority-based processing
- Memory-efficient storage

### Connection Pooling
- HTTP keep-alive connections
- Request timeout management
- Connection reuse

### Caching
- Event deduplication
- Response caching for health checks
- Metadata caching

## 🔧 Troubleshooting

### Common Issues

#### Signature Verification Failures
```bash
# Check webhook secret
echo $GITHUB_WEBHOOK_SECRET

# Verify payload format
curl -X POST http://localhost:3000/webhooks/github \
  -H "X-GitHub-Event: ping" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"zen": "test"}'
```

#### Handler Connection Issues
```javascript
// Test handler connectivity
const handler = new ClaudeCodeHandler();
const health = await handler.healthCheck();
console.log('Handler health:', health);
```

#### Queue Processing Issues
```javascript
// Check queue status
const status = webhookSystem.getStatus();
console.log('Queue status:', status.components.queue);

// Retry dead letter items
const retried = webhookSystem.queue.retryDeadLetterItems(10);
console.log(`Retried ${retried} items`);
```

### Debug Mode
```bash
# Enable debug logging
export WEBHOOK_LOG_LEVEL=debug
export WEBHOOK_DEBUG=true

# Start with debug endpoints
export WEBHOOK_ENABLE_TEST_ENDPOINTS=true
```

## 📚 API Reference

See individual component documentation:
- [WebhookServer](./webhook-server.js)
- [WebhookProcessor](./webhook-processor.js)
- [EventRouter](./event-router.js)
- [EventQueue](./queue.js)
- [Handlers](./handlers/)

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Ensure security best practices
5. Test with real webhook events

## 📄 License

This webhook system is part of the claude-task-master project and follows the same license terms.

