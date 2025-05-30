# Integration Layer Implementation

This directory contains the comprehensive integration layer for the claude-task-master system, connecting all external services (Linear, GitHub, Codegen SDK, Claude Code, AgentAPI) with the orchestration system.

## 🏗️ Architecture Overview

The integration layer follows a modular, event-driven architecture with the following core components:

### Core Components

1. **IntegrationFramework** - Main orchestration framework
2. **EventBus** - Event-driven communication system
3. **WebhookManager** - Centralized webhook handling
4. **IntegrationHealthMonitor** - Service health monitoring

### Service Integrations

1. **LinearIntegration** - Linear API integration for issue management
2. **GitHubIntegration** - GitHub API integration for repository operations
3. **CodegenSDKIntegration** - Codegen SDK integration for task processing
4. **ClaudeCodeIntegration** - Claude Code integration for validation
5. **AgentAPIIntegration** - Agent API integration for agent management

## 📁 File Structure

```
src/integrations/
├── README.md                           # This file
├── index.js                           # Main exports and framework factory
├── IntegrationFlows.js                # Pre-built workflow patterns
├── LinearIntegration.js               # Linear API integration
├── GitHubIntegration.js               # GitHub API integration
├── CodegenSDKIntegration.js           # Codegen SDK integration
├── ClaudeCodeIntegration.js           # Claude Code integration
├── AgentAPIIntegration.js             # Agent API integration
├── WebhookManager.js                  # Webhook management
├── EventBus.js                        # Event bus implementation
├── IntegrationHealthMonitor.js        # Health monitoring
├── integration-framework.js           # Core framework (existing)
├── event-bus.js                       # Legacy event bus (existing)
├── health-monitor.js                  # Legacy health monitor (existing)
├── service-registry.js               # Service registry (existing)
├── config-manager.js                 # Config manager (existing)
└── examples/                          # Usage examples
```

## 🚀 Quick Start

### Basic Setup

```javascript
import { createIntegrationFramework } from './src/integrations/index.js';

// Create framework with configuration
const framework = await createIntegrationFramework({
    linear: {
        apiKey: process.env.LINEAR_API_KEY,
        teamId: process.env.LINEAR_TEAM_ID
    },
    github: {
        token: process.env.GITHUB_TOKEN
    },
    codegen: {
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID
    }
});

// Initialize all components
await framework.initialize();
```

### Using Individual Integrations

```javascript
import { LinearIntegration, GitHubIntegration } from './src/integrations/index.js';

// Linear integration
const linear = new LinearIntegration({
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID
});

await linear.initialize();

// Create an issue
const issue = await linear.createIssue(
    'New Feature Request',
    'Implement user authentication system'
);

// GitHub integration
const github = new GitHubIntegration({
    token: process.env.GITHUB_TOKEN
});

await github.initialize();

// Create a pull request
const pr = await github.createPullRequest(
    'https://github.com/user/repo',
    'feature-branch',
    'Add authentication',
    'Implements user authentication system'
);
```

## 🔄 Integration Flows

The system provides pre-built workflow patterns for common scenarios:

### 1. Workflow Creation Flow

```javascript
import { integrationFlows } from './src/integrations/index.js';

const result = await integrationFlows.createWorkflow(framework, {
    title: 'New Feature Development',
    description: 'Implement user dashboard',
    repoUrl: 'https://github.com/user/repo'
});
```

### 2. Task Completion Flow

```javascript
const result = await integrationFlows.completeTask(framework, {
    task: {
        id: 'task-123',
        description: 'Add user authentication',
        linearIssueId: 'issue-456'
    },
    repoUrl: 'https://github.com/user/repo',
    branch: 'feature/auth',
    title: 'Add authentication system',
    body: 'Implements JWT-based authentication'
});
```

### 3. Validation Flow

```javascript
const result = await integrationFlows.handleValidation(framework, {
    validationResults: {
        status: 'failed',
        results: { issues: [...] }
    },
    prUrl: 'https://github.com/user/repo/pull/123',
    issueId: 'linear-issue-456'
});
```

### 4. Full CICD Pipeline

```javascript
const result = await integrationFlows.runCICDPipeline(framework, {
    requirements: 'Build a user authentication system with JWT tokens',
    repoUrl: 'https://github.com/user/repo'
});
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Linear Configuration
LINEAR_API_KEY=your_linear_api_key
LINEAR_TEAM_ID=your_team_id
LINEAR_WEBHOOK_SECRET=your_webhook_secret

# GitHub Configuration
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Codegen Configuration
CODEGEN_API_KEY=your_codegen_api_key
CODEGEN_ORG_ID=your_org_id
CODEGEN_BASE_URL=https://api.codegen.sh

# Claude Code Configuration
CLAUDE_CODE_BASE_URL=https://api.claude-code.com
CLAUDE_CODE_API_KEY=your_claude_code_api_key
CLAUDE_CODE_WEBHOOK_SECRET=your_webhook_secret

# Agent API Configuration
AGENTAPI_BASE_URL=https://api.agentapi.com
AGENTAPI_KEY=your_agent_api_key
AGENTAPI_WEBHOOK_SECRET=your_webhook_secret

# Webhook Configuration
WEBHOOK_PORT=3001
WEBHOOK_SECURITY=true
WEBHOOK_MAX_PAYLOAD=10mb

# Event Bus Configuration
EVENT_BUS_WS_PORT=8080
EVENT_BUS_PERSISTENCE=true

# Health Monitor Configuration
HEALTH_CHECK_INTERVAL=30000
HEALTH_ALERTS=true
HEALTH_ALERT_WEBHOOK=https://your-alert-webhook.com
```

### Configuration Object

```javascript
const config = {
    linear: {
        apiKey: process.env.LINEAR_API_KEY,
        teamId: process.env.LINEAR_TEAM_ID,
        webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
        rateLimits: { requests: 1000, window: 3600 }
    },
    github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
        rateLimits: { requests: 5000, window: 3600 }
    },
    codegen: {
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID,
        baseUrl: process.env.CODEGEN_BASE_URL,
        timeout: 60000,
        retryAttempts: 5
    },
    claudeCode: {
        baseUrl: process.env.CLAUDE_CODE_BASE_URL,
        apiKey: process.env.CLAUDE_CODE_API_KEY,
        webhookSecret: process.env.CLAUDE_CODE_WEBHOOK_SECRET
    },
    agentapi: {
        baseUrl: process.env.AGENTAPI_BASE_URL,
        apiKey: process.env.AGENTAPI_KEY,
        webhookSecret: process.env.AGENTAPI_WEBHOOK_SECRET
    },
    webhook: {
        port: 3001,
        enableSecurity: true,
        maxPayloadSize: '10mb'
    },
    eventBus: {
        enableWebSocket: true,
        wsPort: 8080,
        enablePersistence: true
    },
    healthMonitor: {
        checkInterval: 30000,
        enableAlerts: true,
        alertWebhook: process.env.HEALTH_ALERT_WEBHOOK
    }
};
```

## 🔌 Webhook Setup

### Express Middleware

```javascript
import express from 'express';
import { createWebhookMiddlewareStack } from './src/integrations/index.js';

const app = express();
const framework = await createIntegrationFramework(config);
const webhookManager = framework.getComponent('webhookManager');

// Add webhook middleware
app.use(createWebhookMiddlewareStack(webhookManager));

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

### Webhook Endpoints

The middleware automatically creates the following endpoints:

- `POST /webhooks/linear` - Linear webhooks
- `POST /webhooks/github` - GitHub webhooks
- `POST /webhooks/claude-code` - Claude Code webhooks
- `POST /webhooks/agent-api` - Agent API webhooks
- `GET /webhooks/status` - Webhook status
- `GET /webhooks/history` - Webhook history
- `POST /webhooks/retry` - Retry failed webhooks

## 📊 Health Monitoring

### Monitoring Setup

```javascript
const healthMonitor = framework.getComponent('healthMonitor');

// Start monitoring
await healthMonitor.initialize();

// Get health report
const report = healthMonitor.generateHealthReport();
console.log(report);

// Listen for alerts
healthMonitor.on('alert.triggered', (alert) => {
    console.log('Alert:', alert);
});
```

### Health Endpoints

```javascript
// Check specific service health
const health = await healthMonitor.checkIntegrationHealth('linear');

// Monitor API limits
const limits = await healthMonitor.monitorAPILimits('github');

// Track response times
const responseTimes = healthMonitor.trackResponseTimes('codegen');
```

## 🎯 Event System

### Event Bus Usage

```javascript
const eventBus = framework.getComponent('eventBus');

// Subscribe to events
eventBus.subscribe('workflow.*', (event) => {
    console.log('Workflow event:', event);
});

// Emit events
eventBus.emit('custom.event', { data: 'example' });

// Broadcast to all components
eventBus.broadcast('system.notification', { message: 'System update' });
```

### WebSocket Events

Connect to the event bus via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
    // Subscribe to events
    ws.send(JSON.stringify({
        type: 'subscribe',
        events: ['workflow.*', 'task.*'],
        patterns: ['*.completed']
    }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event received:', data);
};
```

## 🔒 Security Features

### Webhook Security

- **Signature Validation**: All webhooks are validated using HMAC signatures
- **Rate Limiting**: Built-in rate limiting per IP address
- **Payload Size Limits**: Configurable maximum payload sizes
- **Content Type Validation**: Ensures proper JSON content

### API Security

- **Circuit Breaker Pattern**: Prevents cascade failures
- **Rate Limiting**: Per-service rate limiting
- **Timeout Handling**: Configurable request timeouts
- **Retry Logic**: Exponential backoff for failed requests

## 🧪 Testing

### Unit Tests

```bash
npm test src/integrations/
```

### Integration Tests

```bash
npm run test:integration
```

### Example Test

```javascript
import { LinearIntegration } from './src/integrations/index.js';

describe('LinearIntegration', () => {
    let integration;
    
    beforeEach(() => {
        integration = new LinearIntegration({
            apiKey: 'test-key',
            teamId: 'test-team'
        });
    });
    
    test('should create issue', async () => {
        const issue = await integration.createIssue('Test', 'Description');
        expect(issue.title).toBe('Test');
    });
});
```

## 📈 Monitoring & Metrics

### Built-in Metrics

Each integration provides comprehensive metrics:

- Request count and response times
- Error rates and circuit breaker status
- Rate limiting information
- Health status and uptime

### Custom Metrics

```javascript
const metrics = framework.getMetrics();
console.log('Framework metrics:', metrics);

// Service-specific metrics
const linearHealth = linearIntegration.getHealthStatus();
console.log('Linear health:', linearHealth);
```

## 🚨 Error Handling

### Error Recovery

```javascript
// Automatic error recovery
framework.on('error', async (error) => {
    console.error('Framework error:', error);
    
    // Attempt recovery
    await integrationFlows.handleError(framework, {
        error,
        context: { service: 'linear' }
    });
});
```

### Circuit Breaker

```javascript
// Circuit breaker automatically opens on repeated failures
// and closes after successful requests
const status = integration.getHealthStatus();
console.log('Circuit breaker state:', status.circuitBreaker);
```

## 🔄 Migration from Legacy

If migrating from the existing integration system:

1. **Gradual Migration**: The new system coexists with the legacy system
2. **Configuration**: Update configuration to use new format
3. **Event Handlers**: Migrate event handlers to new event bus
4. **Health Checks**: Replace legacy health checks with new monitor

## 📚 API Reference

### LinearIntegration

- `createIssue(title, description, parentIssueId)` - Create Linear issue
- `updateIssueStatus(issueId, status)` - Update issue status
- `linkIssueToTask(issueId, taskId)` - Link issue to task
- `syncTaskProgress(taskId, progress)` - Sync task progress
- `getIssueDetails(issueId)` - Get issue details
- `handleLinearWebhooks(payload)` - Handle webhooks

### GitHubIntegration

- `validateRepository(repoUrl)` - Validate repository access
- `createPullRequest(repoUrl, branch, title, body)` - Create PR
- `linkPRToIssue(prUrl, issueUrl)` - Link PR to issue
- `getPRStatus(prUrl)` - Get PR status
- `mergePullRequest(prUrl)` - Merge PR
- `handleGitHubWebhooks(payload)` - Handle webhooks

### CodegenSDKIntegration

- `initializeSDK(apiKey, orgId)` - Initialize SDK
- `sendTaskRequest(task, context)` - Send task request
- `processResponse(response)` - Process response
- `handleErrors(error, task)` - Handle errors
- `retryRequest(task, retryCount)` - Retry request
- `trackRequestProgress(requestId)` - Track progress

### ClaudeCodeIntegration

- `deployValidationAgent(prUrl, context)` - Deploy validation
- `getValidationResults(deploymentId)` - Get results
- `handleValidationErrors(errors)` - Handle errors
- `requestFixGeneration(errors, context)` - Request fixes
- `monitorDeployment(deploymentId)` - Monitor deployment

### AgentAPIIntegration

- `deployAgent(agentConfig)` - Deploy agent
- `getAgentStatus(agentId)` - Get agent status
- `sendAgentCommand(agentId, command)` - Send command
- `getAgentLogs(agentId)` - Get logs
- `stopAgent(agentId)` - Stop agent

## 🤝 Contributing

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure proper error handling
5. Add health checks for new services

## 📄 License

This integration layer is part of the claude-task-master project and follows the same license terms.

