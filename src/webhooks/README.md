# 🪝 GitHub Webhook Handlers & PR Validation Pipeline

A comprehensive GitHub webhook system for automated PR validation, status tracking, and integration with the CI/CD pipeline for continuous code quality assurance.

## 🎯 Overview

This webhook system provides:

- **Secure webhook handling** with signature verification
- **Comprehensive PR analysis** for code quality and security
- **Automated issue detection** and reporting
- **Integration with Codegen** for automated fixes
- **Real-time status reporting** to GitHub
- **Rate limiting and DDoS protection**
- **Comprehensive monitoring and metrics**

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           GitHub Webhook System                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ GitHub Webhook  │    │   PR Analyzer   │    │ Status Reporter │             │
│  │    Server       │◄──►│                 │◄──►│                 │             │
│  │                 │    │                 │    │                 │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│           │                       │                       │                     │
│           ▼                       ▼                       ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │   Validation    │    │   Database      │    │   Codegen       │             │
│  │   Pipeline      │    │   Models        │    │   Integration   │             │
│  │                 │    │                 │    │                 │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { startWebhookSystem } from './src/webhooks/index.js';

// Start with default configuration
const system = await startWebhookSystem();
console.log('Webhook system started!');
```

### Advanced Configuration

```javascript
import { WebhookSystem } from './src/webhooks/index.js';

const system = new WebhookSystem({
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
  },
  codegen: {
    baseURL: process.env.CODEGEN_API_URL,
    apiKey: process.env.CODEGEN_API_KEY
  },
  validation: {
    maxPRSize: 500,
    requireTests: true,
    securityScan: true
  }
});

await system.start();
```

## 📋 Configuration

### Environment Variables

```bash
# Required
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
CODEGEN_API_KEY=your_codegen_api_key

# Optional
WEBHOOK_PORT=3000
WEBHOOK_HOST=0.0.0.0
CODEGEN_API_URL=https://api.codegen.sh
MAX_PR_SIZE=500
REQUIRE_TESTS=true
SECURITY_SCAN=true
RATE_LIMIT_MAX=100
ENABLE_METRICS=true
LOG_LEVEL=info
```

### Configuration Options

```javascript
{
  server: {
    port: 3000,                    // Server port
    host: '0.0.0.0',              // Server host
    timeout: 30000                 // Request timeout
  },
  github: {
    token: 'github_token',         // GitHub API token
    webhookSecret: 'secret',       // Webhook secret for verification
    apiUrl: 'https://api.github.com' // GitHub API URL
  },
  codegen: {
    baseURL: 'https://api.codegen.sh', // Codegen API URL
    apiKey: 'api_key',             // Codegen API key
    timeout: 60000                 // Request timeout
  },
  validation: {
    maxPRSize: 500,                // Max changes per PR
    requireTests: true,            // Require test updates
    securityScan: true,            // Enable security scanning
    performanceCheck: true,        // Enable performance checks
    maxFilesChanged: 50,           // Max files per PR
    complexityThreshold: 10        // Complexity threshold
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,     // Rate limit window
    max: 100,                      // Max requests per window
    skipSuccessfulRequests: true   // Skip counting successful requests
  },
  monitoring: {
    enableMetrics: true,           // Enable metrics collection
    metricsPort: 9090,            // Metrics server port
    healthCheckInterval: 30000     // Health check interval
  }
}
```

## 🔧 Components

### 1. GitHub Webhook Server (`github_webhook_server.js`)

Main webhook server that handles GitHub events:

- **Signature verification** for security
- **Event routing** to appropriate handlers
- **Rate limiting** and DDoS protection
- **Health monitoring** and metrics
- **Error handling** with retry logic

### 2. PR Analyzer (`pr_analyzer.js`)

Comprehensive PR analysis engine:

- **File analysis** (changes, complexity, types)
- **Security scanning** (secrets, vulnerabilities)
- **Code quality checks** (style, best practices)
- **Breaking change detection**
- **Performance issue detection**

### 3. Validation Pipeline (`validation_pipeline.js`)

Orchestrates the complete validation workflow:

- **Multi-stage validation** process
- **Issue evaluation** and prioritization
- **Automated fix requests** to Codegen
- **Status reporting** to GitHub
- **Comprehensive reporting**

### 4. Status Reporter (`status_reporter.js`)

Reports validation results back to GitHub:

- **Commit status** updates
- **PR comments** with detailed feedback
- **Review comments** on specific lines
- **Label management**
- **Check run** creation and updates

### 5. Database Models (`database/models/validation.js`)

Data persistence for validation tracking:

- **PR validation** records
- **Issue tracking** and history
- **Status management**
- **Retry logic** and failure handling

### 6. Codegen Integration (`integrations/codegen_client.js`)

Integration with Codegen API:

- **Analysis requests** for automated fixes
- **Status tracking** and results retrieval
- **Queue management** for batch processing
- **Error handling** and retry logic

## 🔍 Webhook Events Handled

### 1. Pull Request Events

```json
{
  "action": "opened|synchronize|reopened",
  "pull_request": {
    "number": 123,
    "head": { "ref": "feature-branch", "sha": "abc123" },
    "base": { "repo": { "full_name": "owner/repo" } }
  }
}
```

**Actions:**
- Trigger comprehensive PR analysis
- Detect code quality and security issues
- Request Codegen analysis if needed
- Report status back to GitHub

### 2. Check Suite Events

```json
{
  "action": "completed",
  "check_suite": {
    "id": 456,
    "conclusion": "failure|success",
    "pull_requests": [{ "number": 123 }]
  }
}
```

**Actions:**
- Update validation status
- Request automated fixes for failures
- Track CI/CD pipeline results

### 3. Check Run Events

```json
{
  "action": "completed",
  "check_run": {
    "name": "test-suite",
    "conclusion": "failure",
    "pull_requests": [{ "number": 123 }]
  }
}
```

**Actions:**
- Update individual check status
- Aggregate results for overall validation

## 🛡️ Security Features

### Signature Verification

All webhook requests are verified using HMAC-SHA256:

```javascript
const signature = req.headers['x-hub-signature-256'];
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
```

### Rate Limiting

Multiple layers of protection:

- **Standard rate limiting** (100 req/15min per IP)
- **Burst protection** (20 req/10sec)
- **Adaptive limiting** based on system load
- **DDoS protection** with automatic blocking

### Security Scanning

Automated detection of:

- **Hardcoded secrets** (API keys, passwords, tokens)
- **Sensitive files** (.env, .key, .pem)
- **Security vulnerabilities** in dependencies
- **Unsafe patterns** in code

## 📊 Monitoring & Metrics

### Health Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive health status
- `GET /status` - System status and metrics
- `GET /metrics` - Prometheus-compatible metrics

### Metrics Collected

```javascript
{
  webhooksReceived: 1250,
  webhooksProcessed: 1248,
  webhooksFailed: 2,
  validationsStarted: 856,
  validationsCompleted: 854,
  validationsFailed: 2,
  averageProcessingTime: 1.2, // seconds
  queueSize: 3
}
```

### Logging

Structured logging with configurable levels:

```javascript
log('info', 'PR validation completed', {
  pr_number: 123,
  repository: 'owner/repo',
  issues_found: 2,
  processing_time_ms: 1200
});
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm run webhook:test

# Run performance tests
npm run webhook:performance

# Run integration tests
npm run webhook:integration
```

### Test Coverage

- **Unit tests** for all components
- **Integration tests** for end-to-end workflows
- **Performance tests** for throughput and latency
- **Security tests** for vulnerability scanning

### Example Test

```javascript
import { runWebhookTests } from './src/webhooks/test_webhook_system.js';

const results = await runWebhookTests();
console.log(`Tests: ${results.passed}/${results.total} passed`);
```

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3000

CMD ["node", "src/webhooks/index.js"]
```

### Environment Setup

```bash
# Production environment
export NODE_ENV=production
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export GITHUB_WEBHOOK_SECRET=your_secret_here
export CODEGEN_API_KEY=your_api_key_here
export WEBHOOK_PORT=3000
export LOG_LEVEL=info
export ENABLE_METRICS=true
```

### GitHub Webhook Configuration

1. Go to your repository settings
2. Navigate to "Webhooks"
3. Add webhook with:
   - **Payload URL**: `https://your-domain.com/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: Your webhook secret
   - **Events**: Pull requests, Check suites, Check runs

## 📚 API Reference

### Webhook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/github` | POST | Main GitHub webhook endpoint |
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Detailed health status |
| `/status` | GET | System status and metrics |
| `/metrics` | GET | Prometheus metrics |
| `/validations/:id` | GET | Get validation details |
| `/validations` | GET | List validations |

### Admin Endpoints (Protected)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/queue` | GET | Queue status |
| `/admin/retry/:id` | POST | Retry validation |
| `/admin/reset-metrics` | POST | Reset metrics |

## 🔧 Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check GitHub webhook configuration
   - Verify webhook URL is accessible
   - Check webhook secret configuration

2. **Signature verification failing**
   - Ensure webhook secret matches GitHub configuration
   - Check payload encoding

3. **High memory usage**
   - Enable adaptive rate limiting
   - Increase health check frequency
   - Monitor queue size

4. **Slow processing**
   - Check GitHub API rate limits
   - Monitor Codegen API response times
   - Optimize validation rules

### Debug Mode

```bash
export LOG_LEVEL=debug
export ENABLE_REQUEST_LOGGING=true
```

### Health Checks

```bash
# Check system health
curl http://localhost:3000/health

# Get detailed status
curl http://localhost:3000/health/detailed

# View metrics
curl http://localhost:3000/metrics
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Development Setup

```bash
git clone https://github.com/your-org/claude-task-master.git
cd claude-task-master
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm run webhook:test

# Start development server
npm run webhook:dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- GitHub API for webhook infrastructure
- Codegen for automated analysis and fixes
- Express.js for web server framework
- Octokit for GitHub API integration

---

For more examples and detailed usage, see the [examples directory](./examples/) and [test files](./test_webhook_system.js).

