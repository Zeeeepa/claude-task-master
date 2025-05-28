# GitHub Webhook Integration & Event Processing System

This module implements a comprehensive GitHub webhook integration system for automated PR processing and event-driven workflows. It provides secure, scalable, and robust handling of GitHub events with advanced features like deduplication, retry logic, and workflow orchestration.

## 🏗️ Architecture Overview

```
GitHub → Webhook Handler → Event Processor → Workflow Dispatcher → Task Storage
                ↓              ↓                    ↓
         Signature Validator   Event Queue    WorkflowOrchestrator
                ↓              ↓                    ↓
         Event Deduplicator    Database       Task Management
```

## 📦 Components

### Core Components

- **GitHubWebhookHandler**: Main webhook endpoint handler with security validation
- **EventProcessor**: Routes and processes GitHub events
- **SignatureValidator**: Validates GitHub webhook signatures for security
- **EventDeduplicator**: Prevents duplicate event processing
- **WorkflowDispatcher**: Dispatches workflows based on GitHub events
- **EventQueue**: Manages event queuing and processing with retry logic

### Integration Components

- **GitHubClient**: GitHub API client for repository operations
- **EventMetrics**: Event processing metrics and monitoring
- **IntegrationTest**: Comprehensive test suite for the webhook system

## 🚀 Quick Start

### Basic Setup

```javascript
import { createWebhookSystem } from './src/ai_cicd_system/webhooks/index.js';

const config = {
    github: {
        webhook_secret: process.env.GITHUB_WEBHOOK_SECRET,
        token: process.env.GITHUB_TOKEN
    },
    processing: {
        enable_async_processing: true,
        max_concurrent_events: 10
    }
};

const database = /* your database connection */;
const webhookSystem = createWebhookSystem(config, database);

// Initialize the system
await webhookSystem.initialize();

// Setup Express routes
app.use('/webhooks', webhookSystem.webhookHandler.setupWebhookEndpoints);
```

### Express Integration

```javascript
import express from 'express';
import { GitHubWebhookHandler } from './github_webhook_handler.js';

const app = express();
const webhookHandler = new GitHubWebhookHandler(config, database);

await webhookHandler.initialize();
await webhookHandler.setupWebhookEndpoints(app);

app.listen(3000, () => {
    console.log('Webhook server running on port 3000');
});
```

## 🔧 Configuration

### Webhook Handler Configuration

```javascript
const config = {
    github: {
        webhook_secret: 'your-webhook-secret',
        user_agent_validation: true,
        require_signature: true
    },
    server: {
        enable_cors: true,
        cors_origins: ['*'],
        max_payload_size: '10mb',
        request_timeout: 30000
    },
    processing: {
        enable_async_processing: true,
        max_concurrent_events: 10,
        enable_rate_limiting: true,
        rate_limit_max_requests: 100,
        rate_limit_window: 60000
    }
};
```

### Event Processing Configuration

```javascript
const eventProcessorConfig = {
    max_processing_time: 300000, // 5 minutes
    enable_event_replay: true,
    max_retry_attempts: 3,
    retry_delay_multiplier: 2,
    base_retry_delay: 5000,
    enable_detailed_logging: true
};
```

### Workflow Dispatcher Configuration

```javascript
const workflowConfig = {
    max_concurrent_workflows_per_repo: 5,
    default_workflow_timeout: 1800000, // 30 minutes
    enable_auto_retry: true,
    max_retry_attempts: 3,
    workflow_priorities: {
        'pr_validation': 8,
        'code_review': 7,
        'security_scan': 9,
        'deployment': 6,
        'testing': 7
    }
};
```

## 📡 Webhook Endpoints

### Main Webhook Endpoint
- **POST** `/webhooks/github` - Main GitHub webhook endpoint
- **GET** `/webhooks/health` - Health check endpoint
- **GET** `/webhooks/metrics` - Processing metrics
- **POST** `/webhooks/replay/:eventId` - Replay specific event
- **GET** `/webhooks/config` - Configuration information

### Health Check Response

```json
{
    "status": "healthy",
    "initialized": true,
    "supported_events": ["pull_request", "push", "issues"],
    "metrics": {
        "total_requests": 1250,
        "successful_requests": 1200,
        "failed_requests": 50,
        "success_rate": 96.0
    },
    "timestamp": "2025-05-28T16:30:00.000Z"
}
```

## 🔒 Security Features

### Signature Validation

```javascript
import { SignatureValidator } from './signature_validator.js';

const validator = new SignatureValidator(webhookSecret);
const isValid = validator.validateSignature(payload, signature);

// Advanced validation with request context
const validationResult = validator.validateRequest(request);
if (!validationResult.isValid) {
    console.log('Validation errors:', validationResult.errors);
}
```

### Rate Limiting

The system includes built-in rate limiting to prevent abuse:

- Configurable request limits per IP
- Sliding window rate limiting
- Automatic cleanup of expired entries
- Rate limit headers in responses

## 🔄 Event Processing Flow

### Pull Request Workflow

1. **PR Opened**: Creates task, starts validation workflows
2. **PR Updated**: Cancels existing workflows, starts fresh validation
3. **PR Closed**: Completes workflows, updates task status
4. **PR Reopened**: Reactivates task, restarts workflows

### Supported GitHub Events

- `pull_request` - PR lifecycle events
- `pull_request_review` - PR review events
- `push` - Repository push events
- `issues` - Issue lifecycle events
- `issue_comment` - Issue comment events
- `ping` - GitHub webhook test events

## 🔁 Event Deduplication

The system prevents duplicate processing using multiple strategies:

### Deduplication Strategies

1. **Event ID**: Exact GitHub delivery ID matching
2. **Content Hash**: SHA-256 hash of normalized payload
3. **Semantic**: Same action on same resource within time window

```javascript
import { EventDeduplicator } from './event_deduplicator.js';

const deduplicator = new EventDeduplicator(database, {
    deduplication_window_ms: 300000, // 5 minutes
    enable_content_deduplication: true,
    max_cache_size: 1000
});

const isDuplicate = await deduplicator.isDuplicate(eventData);
```

## 📊 Monitoring & Metrics

### Available Metrics

- Total events processed
- Success/failure rates
- Processing times
- Duplicate detection rates
- Queue sizes and processing status
- Rate limiting statistics

### Health Monitoring

```javascript
// Get comprehensive health status
const health = await webhookSystem.getHealth();

// Individual component health
const handlerHealth = await webhookHandler.getHealth();
const processorHealth = await eventProcessor.getHealth();
const queueHealth = eventQueue.getHealth();
```

## 🧪 Testing

### Running Integration Tests

```javascript
import { WebhookIntegrationTest } from './integration_test.js';

const testSuite = new WebhookIntegrationTest({
    test_webhook_secret: 'test_secret',
    mock_database: true
});

const results = await testSuite.runAllTests();
console.log(`Tests: ${results.passed}/${results.total} passed`);
```

### Test Coverage

The integration test suite covers:

- Signature validation
- Event deduplication
- Event processing workflows
- Workflow dispatch logic
- Error handling scenarios
- Rate limiting behavior
- Event replay functionality

## 🗄️ Database Schema

### Required Tables

The system requires the following database tables (see `002_webhook_events_schema.sql`):

- `webhook_events` - Stores all webhook events
- `github_repositories` - Repository information
- `pull_requests` - PR data and metadata
- `event_processing_queue` - Event processing queue
- `workflow_triggers` - Workflow trigger configuration

### Migration

```sql
-- Run the migration
\i src/ai_cicd_system/database/migrations/002_webhook_events_schema.sql
```

## 🔧 Troubleshooting

### Common Issues

1. **Invalid Signature Errors**
   - Verify webhook secret configuration
   - Check payload encoding (should be raw body)
   - Ensure signature header format: `sha256=...`

2. **Event Processing Failures**
   - Check database connectivity
   - Verify workflow dispatcher configuration
   - Review event processor logs

3. **Rate Limiting Issues**
   - Adjust rate limit configuration
   - Check for webhook replay storms
   - Monitor IP-based rate limiting

### Debug Mode

Enable detailed logging:

```javascript
const config = {
    processing: {
        enable_detailed_logging: true
    }
};
```

### Event Replay

Replay failed events:

```bash
curl -X POST http://localhost:3000/webhooks/replay/event_id_123
```

## 📈 Performance Considerations

### Optimization Tips

1. **Async Processing**: Enable for high-volume webhooks
2. **Database Indexing**: Ensure proper indexes on event tables
3. **Queue Management**: Monitor queue sizes and processing rates
4. **Memory Usage**: Configure appropriate cache sizes
5. **Concurrent Processing**: Tune concurrent event limits

### Scaling

- Use database connection pooling
- Implement horizontal scaling with load balancers
- Consider event streaming for very high volumes
- Monitor and tune retry mechanisms

## 🤝 Contributing

When contributing to the webhook system:

1. Add comprehensive tests for new features
2. Update documentation for configuration changes
3. Follow the existing error handling patterns
4. Ensure backward compatibility
5. Add appropriate logging and metrics

## 📄 License

This webhook integration system is part of the claude-task-master project and follows the same licensing terms.

