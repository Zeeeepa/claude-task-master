# Webhook System for Claude Task Master

A comprehensive webhook system that handles GitHub, Linear, and Codegen events to trigger automated workflows for PR creation, validation, and debugging.

## 🎯 Overview

This webhook system provides:

- **GitHub Webhook Handler**: Captures PR creation, updates, and status changes
- **Linear Webhook Handler**: Processes issue updates and comment events
- **Codegen Webhook Handler**: Manages internal system events and status updates
- **Secure Processing**: Signature verification and rate limiting
- **Retry Logic**: Handles failed webhook deliveries with exponential backoff
- **Database Integration**: Event logging and state management
- **AgentAPI Integration**: Triggers validation workflows

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub API    │    │   Linear API    │    │  Codegen Agent  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ Webhooks             │ Webhooks             │ Status Updates
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Webhook Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   GitHub    │  │   Linear    │  │       Codegen           │  │
│  │   Routes    │  │   Routes    │  │       Routes            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                           │                                     │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │              Webhook Processor                           │  │
│  │  • Event Validation    • Retry Logic                    │  │
│  │  • Signature Verify    • Error Handling                 │  │
│  │  • Rate Limiting       • Database Logging               │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   AgentAPI      │
                    │   Integration   │
                    └─────────────────┘
```

## 🚀 Quick Start

### 1. Installation

```bash
# Navigate to the webhooks directory
cd webhooks

# Install dependencies (if not already installed in parent project)
npm install
```

### 2. Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Required Environment Variables

```bash
# Webhook secrets
GITHUB_WEBHOOK_SECRET=your_github_secret
LINEAR_WEBHOOK_SECRET=your_linear_secret
CODEGEN_WEBHOOK_SECRET=your_codegen_secret

# External service URLs
AGENTAPI_URL=http://localhost:8000
LINEAR_API_KEY=your_linear_api_key
GITHUB_TOKEN=your_github_token
```

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start

# Or run directly
node server.js
```

## 📡 Webhook Endpoints

### GitHub Webhooks
```
POST /webhooks/github
```

**Supported Events:**
- `pull_request` - PR creation, updates, merges
- `push` - Code pushes to branches
- `check_run` / `check_suite` - CI/CD status updates
- `ping` - Webhook connectivity test

**Headers Required:**
- `X-GitHub-Event` - Event type
- `X-GitHub-Delivery` - Unique delivery ID
- `X-Hub-Signature-256` - HMAC signature

### Linear Webhooks
```
POST /webhooks/linear
```

**Supported Events:**
- `Issue` - Issue creation, updates, status changes
- `Comment` - Comments on issues
- `Project` - Project updates
- `Cycle` - Cycle changes

**Headers Required:**
- `Linear-Signature` - HMAC signature
- `Linear-Timestamp` - Request timestamp

### Codegen Webhooks
```
POST /webhooks/codegen
POST /webhooks/codegen/status
```

**Supported Events:**
- `agent_status` - Agent status updates
- `validation_complete` - Validation results
- `pr_created` - PR creation notifications
- `error_escalation` - Error handling

**Headers Required:**
- `X-Codegen-Event` - Event type
- `X-Codegen-Signature` - HMAC signature

## 🔒 Security

### Signature Verification

All webhooks use HMAC-SHA256 signature verification:

```javascript
// GitHub
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Expected: sha256=<signature>
```

### Rate Limiting

- **Default**: 100 requests per 15 minutes per IP
- **Authenticated**: 500 requests per 15 minutes
- **Admin**: 1000 requests per 15 minutes
- **Webhook Burst**: 5 requests per 10 seconds

### Authentication

Multiple authentication methods supported:

1. **API Key**: `X-API-Key` header
2. **JWT Token**: `Authorization: Bearer <token>`
3. **Webhook Signatures**: Platform-specific HMAC signatures

## 🔄 Event Processing Flow

```
1. Webhook Received → Verify Signature → Parse Payload
2. Validate Event Type → Route to Handler → Update Database
3. Process Business Logic → Call External APIs → Handle Results
4. Update Status → Send Notifications → Log Completion
```

### Retry Logic

Failed events are automatically retried with exponential backoff:

- **Attempt 1**: Immediate
- **Attempt 2**: 1 second delay
- **Attempt 3**: 5 second delay
- **Attempt 4**: 15 second delay

## 📊 Monitoring & Health Checks

### Health Check Endpoint
```
GET /webhooks/status
```

Returns system health status including:
- Database connectivity
- Processing queue status
- External service availability
- Recent error rates

### Metrics Endpoint
```
GET /webhooks/status/metrics
```

Provides detailed metrics:
- Webhook processing times
- Success/failure rates
- Queue sizes
- Error patterns

### Event History
```
GET /webhooks/status/events
```

Recent webhook events with filtering:
- By event type
- By status (success/failed)
- By time range

## 🛠️ Development

### Project Structure

```
webhooks/
├── server.js                 # Main server entry point
├── routes/                   # Webhook route handlers
│   ├── github.js            # GitHub webhook routes
│   ├── linear.js            # Linear webhook routes
│   ├── codegen.js           # Codegen webhook routes
│   └── status.js            # Health check routes
├── middleware/               # Express middleware
│   ├── webhook-auth.js      # Authentication
│   ├── github-signature.js  # GitHub signature validation
│   ├── linear-signature.js  # Linear signature validation
│   ├── codegen-signature.js # Codegen signature validation
│   ├── rate-limiter.js      # Rate limiting
│   ├── error-handler.js     # Error handling
│   └── request-logger.js    # Request logging
├── services/                 # Business logic services
│   ├── database.js          # Database operations
│   ├── webhook-processor.js # Main processing engine
│   ├── github-webhook.js    # GitHub-specific processing
│   ├── linear-webhook.js    # Linear-specific processing
│   └── codegen-webhook.js   # Codegen-specific processing
├── utils/                    # Utility functions
│   └── validation.js        # Payload validation
├── config/                   # Configuration
│   └── environment.js       # Environment configuration
└── README.md                # This file
```

### Adding New Webhook Types

1. **Create Route Handler**:
```javascript
// routes/new-service.js
import { Router } from 'express';
const router = Router();

router.post('/', async (req, res) => {
  // Handle webhook
});

export default router;
```

2. **Add Signature Validation**:
```javascript
// middleware/new-service-signature.js
export function validateNewServiceSignature(req, res, next) {
  // Implement signature validation
}
```

3. **Create Service Handler**:
```javascript
// services/new-service-webhook.js
export class NewServiceWebhookService {
  async processWebhook(webhookData) {
    // Implement processing logic
  }
}
```

4. **Register in Main Server**:
```javascript
// server.js
import newServiceRoutes from './routes/new-service.js';
this.app.use('/webhooks/new-service', newServiceRoutes);
```

## 🧪 Testing

### Manual Testing

```bash
# Test GitHub webhook
curl -X POST http://localhost:3001/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: 12345" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"zen": "Design for failure."}'

# Test Linear webhook
curl -X POST http://localhost:3001/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: ..." \
  -d '{"type": "Issue", "action": "create"}'

# Health check
curl http://localhost:3001/webhooks/status
```

### Webhook Signature Generation

For testing, you can generate signatures:

```javascript
import crypto from 'crypto';

// GitHub signature
const githubSignature = crypto
  .createHmac('sha256', 'your-secret')
  .update(JSON.stringify(payload))
  .digest('hex');
console.log(`sha256=${githubSignature}`);

// Linear signature
const linearSignature = crypto
  .createHmac('sha256', 'your-secret')
  .update(JSON.stringify(payload))
  .digest('hex');
console.log(linearSignature);
```

## 🚨 Troubleshooting

### Common Issues

1. **Signature Validation Fails**
   - Check webhook secret configuration
   - Verify payload is not modified
   - Ensure correct HMAC algorithm

2. **Rate Limiting Triggered**
   - Check rate limit configuration
   - Verify IP whitelisting
   - Use authentication for higher limits

3. **Database Connection Issues**
   - Verify DATABASE_URL configuration
   - Check database server availability
   - Review connection pool settings

4. **External Service Timeouts**
   - Check service URLs and API keys
   - Verify network connectivity
   - Review timeout configurations

### Debug Mode

Enable debug logging:

```bash
DEBUG=true LOG_LEVEL=debug node server.js
```

### Log Analysis

Logs include structured data for analysis:

```json
{
  "timestamp": "2025-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Webhook processed",
  "eventId": "evt_123456",
  "eventType": "pull_request",
  "source": "github",
  "processingTime": "150ms",
  "success": true
}
```

## 📈 Performance Optimization

### Scaling Considerations

1. **Horizontal Scaling**: Run multiple webhook server instances
2. **Database Optimization**: Use connection pooling and indexing
3. **Caching**: Implement Redis for rate limiting and session storage
4. **Queue Management**: Use external message queues for high volume

### Memory Management

- Event cache automatically expires old entries
- Configurable retention periods
- Automatic cleanup of processed events

## 🔗 Integration Examples

### GitHub Webhook Setup

1. Go to repository Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/webhooks/github`
3. Select events: Pull requests, Pushes, Check runs
4. Set secret to match `GITHUB_WEBHOOK_SECRET`

### Linear Webhook Setup

1. Go to Linear Settings → API → Webhooks
2. Add webhook URL: `https://your-domain.com/webhooks/linear`
3. Select events: Issues, Comments
4. Set secret to match `LINEAR_WEBHOOK_SECRET`

### AgentAPI Integration

The webhook system integrates with AgentAPI to trigger validation workflows:

```javascript
// Triggered on PR creation
const validationRequest = {
  type: 'pr_validation',
  repository: 'owner/repo',
  prNumber: 123,
  branch: 'feature-branch'
};

await fetch(`${AGENTAPI_URL}/workflows/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(validationRequest)
});
```

## 📝 License

This webhook system is part of the Claude Task Master project and follows the same licensing terms.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

For questions or support, please open an issue in the main repository.

