# GitHub Webhook Integration System

A robust, production-ready GitHub webhook integration system for the AI CI/CD pipeline.

## Quick Start

### 1. Environment Setup
```bash
export GITHUB_WEBHOOK_SECRET="your-secure-webhook-secret"
export GITHUB_TOKEN="your-github-token"
```

### 2. Basic Usage
```javascript
import { GitHubWebhookHandler } from './github_webhook_handler.js';

const handler = new GitHubWebhookHandler({
    secret: process.env.GITHUB_WEBHOOK_SECRET
});

await handler.initialize();
```

### 3. Express Integration
```javascript
import { createWebhookRouter } from '../api/webhook_endpoints.js';

const app = express();
app.use('/api/webhooks', createWebhookRouter());
```

## Components

### Core Components
- **`github_webhook_handler.js`** - Main webhook processing logic
- **`webhook_validator.js`** - Event parsing and validation
- **`webhook_security.js`** - Security and authentication
- **`event_processor.js`** - Business logic for event processing

### Supporting Components
- **`../api/webhook_endpoints.js`** - RESTful API endpoints
- **`../middleware/webhook_middleware.js`** - Express middleware
- **`../config/webhook_config.js`** - Configuration management
- **`../utils/github_api_client.js`** - GitHub API wrapper

## Supported Events

| Event Type | Actions | Priority |
|------------|---------|----------|
| `pull_request` | opened, synchronize, reopened, closed | high |
| `push` | main, master, develop | medium |
| `issues` | opened, edited, labeled | low |
| `workflow_run` | completed, failed | high |

## Security Features

- ✅ HMAC-SHA256 signature validation
- ✅ Origin validation (User-Agent, IP)
- ✅ Payload structure validation
- ✅ Rate limiting and DDoS protection
- ✅ Request timeout handling

## Processing Pipeline

1. **validateEvent** - Validate event structure and access
2. **extractMetadata** - Extract priority, complexity, tags
3. **createTask** - Create structured task from event
4. **triggerWorkflow** - Initiate appropriate workflows
5. **updateStatus** - Update GitHub status/checks
6. **notifyStakeholders** - Send notifications

## Configuration

### Environment Variables
```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-token
WEBHOOK_ENDPOINT=/api/webhooks/github
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RATE_MAX_REQUESTS=100
WEBHOOK_PROCESSING_TIMEOUT=30000
```

### Programmatic Configuration
```javascript
const config = {
    secret: 'your-webhook-secret',
    database: {
        host: 'localhost',
        port: 5432,
        database: 'codegen-taskmaster-db'
    },
    github: {
        token: 'your-github-token',
        timeout: 30000
    },
    processing: {
        timeout_ms: 30000,
        concurrent_limit: 10
    }
};
```

## API Endpoints

### Main Endpoints
- `POST /api/webhooks/github` - Main webhook endpoint
- `GET /api/webhooks/health` - Health check
- `GET /api/webhooks/status` - Status and statistics
- `GET /api/webhooks/metrics` - Prometheus-style metrics

### Management Endpoints
- `GET /api/webhooks/events` - List recent events
- `POST /api/webhooks/replay/:eventId` - Replay failed event
- `DELETE /api/webhooks/events/:eventId` - Delete event record
- `POST /api/webhooks/reset-stats` - Reset statistics

## Testing

### Run Tests
```bash
npm run test:webhooks
```

### Manual Testing
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "x-github-event: pull_request" \
  -H "x-github-delivery: test-123" \
  -H "x-hub-signature-256: sha256=..." \
  -d @test-payload.json
```

### Load Testing
```bash
npm install -g artillery
artillery run tests/load/webhook-load-test.yml
```

## Examples

### Basic Server
```bash
npm run webhook:basic
```

### Advanced Server
```bash
npm run webhook:advanced
```

### All Examples
```bash
npm run webhook:examples
```

## Monitoring

### Key Metrics
- Event processing rate
- Success/failure rates
- Processing times
- Queue sizes

### Health Checks
```bash
curl http://localhost:3000/api/webhooks/health
curl http://localhost:3000/api/webhooks/metrics
```

## Troubleshooting

### Common Issues

**Signature validation failures:**
- Verify webhook secret matches GitHub configuration
- Check payload is not modified by middleware

**High processing times:**
- Check database connection performance
- Monitor GitHub API rate limits
- Increase timeout configuration

**Rate limiting:**
- Increase rate limit configuration
- Implement request queuing
- Use multiple webhook endpoints

### Debug Mode
```bash
export LOG_LEVEL=debug
npm start
```

## Production Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup
- Set secure webhook secret (32+ characters)
- Configure database connection
- Set up monitoring and alerting
- Enable SSL/TLS
- Configure reverse proxy with rate limiting

## Contributing

1. Follow existing code patterns
2. Add tests for new features
3. Update documentation
4. Ensure security best practices

## License

MIT License - see LICENSE file for details.

