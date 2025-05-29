# AgentAPI Middleware Integration - Consolidated Documentation

## Overview

This document provides comprehensive documentation for the consolidated AgentAPI middleware integration that serves as the unified communication bridge between the orchestrator/system watcher (claude-task-master) and AI agents (Claude Code, Goose, Aider, Codex) for automated task execution, PR deployment, and validation.

**Consolidation Source**: This implementation consolidates functionality from PRs #43, #46, #47, #60, #61, #76, #83, #84, #85, #92 into a single, cohesive system with zero redundancy.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AgentAPI Middleware Integration                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Configuration  │    │  Health Monitor │    │  Agent Router   │         │
│  │  Manager        │◄──►│                 │◄──►│                 │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Agent Manager  │    │  AgentAPI       │    │  Express        │         │
│  │                 │◄──►│  Client         │◄──►│  Middleware     │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  WSL2 Manager   │    │  Webhook        │    │  Auth Manager   │         │
│  │                 │    │  Handler        │    │                 │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AI Agents                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Claude Code │  │    Goose    │  │    Aider    │  │    Codex    │       │
│  │             │  │             │  │             │  │             │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. AgentAPI Integration (`index.js`)

Main orchestration class that coordinates all middleware components.

**Key Features:**
- Unified initialization and lifecycle management
- Component coordination and dependency injection
- Task execution orchestration
- System health monitoring
- Graceful shutdown handling

**Usage:**
```javascript
import { createAgentAPIIntegration } from './src/ai_cicd_system/middleware/agentapi/index.js';

const integration = await createAgentAPIIntegration({
  configPath: './config/agentapi.json',
  monitoring: { healthCheckInterval: 30000 },
  auth: { enableAuthentication: true }
});

// Execute a task
const result = await integration.executeTask({
  id: 'task-001',
  type: 'code_validation',
  title: 'Validate PR changes',
  description: 'Run comprehensive validation on PR #123'
});
```

### 2. AgentAPI Client (`client.js`)

Robust HTTP client for AgentAPI communication with circuit breaker protection.

**Key Features:**
- Circuit breaker pattern for fault tolerance
- Exponential backoff retry mechanism
- Server-Sent Events (SSE) support
- Connection pooling and health monitoring
- Comprehensive error handling and metrics

**Usage:**
```javascript
import { AgentAPIClient } from './src/ai_cicd_system/middleware/agentapi/client.js';

const client = new AgentAPIClient({
  baseURL: 'http://localhost:3284',
  apiKey: 'your-api-key',
  timeout: 30000,
  retryAttempts: 3
});

await client.connect();
await client.startSession('claude');
const response = await client.sendMessage('Analyze this code for issues');
```

### 3. Configuration Manager (`config.js`)

Centralized configuration management with environment overrides and validation.

**Key Features:**
- Hierarchical configuration merging
- Environment variable overrides
- Configuration validation and hot reloading
- Agent-specific configuration management
- Export/import functionality

**Usage:**
```javascript
import { AgentConfigManager } from './src/ai_cicd_system/middleware/agentapi/config.js';

const configManager = new AgentConfigManager('./config/agentapi.json');
await configManager.initialize();

const claudeConfig = configManager.getAgentConfig('claude');
const globalConfig = configManager.getGlobalConfig();
```

### 4. Express Middleware (`middleware.js`)

Comprehensive Express middleware stack for security, authentication, and request processing.

**Key Features:**
- JWT and API key authentication
- Rate limiting and slow down protection
- CORS and security headers
- Request/response transformation
- Comprehensive error handling

**Usage:**
```javascript
import { AgentMiddleware } from './src/ai_cicd_system/middleware/agentapi/middleware.js';

const middleware = new AgentMiddleware({
  enableAuthentication: true,
  enableRateLimit: true,
  enableCors: true
});

app.use(middleware.cors());
app.use(middleware.authenticate());
app.use(middleware.rateLimit());
```

### 5. Agent Manager (`manager.js`)

Central orchestrator for agent lifecycle, task execution, and resource management.

**Key Features:**
- Multi-agent session management
- Task queuing and load balancing
- Performance metrics collection
- Automatic failover and recovery
- Concurrent task execution limits

**Usage:**
```javascript
import { AgentManager } from './src/ai_cicd_system/middleware/agentapi/manager.js';

const manager = new AgentManager({
  maxConcurrentTasks: 10,
  taskTimeout: 30 * 60 * 1000
}, healthMonitor, agentRouter);

await manager.initialize();
const result = await manager.executeTask(task);
```

### 6. Health Monitor (`health.js`)

Real-time monitoring system for agent health and performance tracking.

**Key Features:**
- Continuous health checks
- Performance metrics collection
- Alert management and notifications
- Circuit breaker monitoring
- System health aggregation

**Usage:**
```javascript
import { AgentHealthMonitor } from './src/ai_cicd_system/middleware/agentapi/health.js';

const monitor = new AgentHealthMonitor({
  healthCheckInterval: 30000,
  alertThreshold: 3
});

await monitor.start();
monitor.registerAgent('claude', agentClient);
```

### 7. Agent Router (`router.js`)

Intelligent routing system for optimal agent selection based on capabilities and performance.

**Key Features:**
- Multiple routing strategies (capability, round-robin, least-loaded, performance)
- Agent capability mapping
- Load balancing and failover
- Performance-based routing decisions
- Routing analytics and recommendations

**Usage:**
```javascript
import { AgentRouter } from './src/ai_cicd_system/middleware/agentapi/router.js';

const router = new AgentRouter({
  strategy: 'capability_priority',
  enableFailover: true
}, healthMonitor);

const selectedAgent = await router.selectAgent(task);
const recommendations = router.getAgentRecommendations(task, 3);
```

## Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
AGENTAPI_KEY=your-api-key
AGENTAPI_TIMEOUT=30000

# Authentication
JWT_SECRET=your-jwt-secret
ENABLE_AUTHENTICATION=true

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# WSL2 Configuration
WSL2_MAX_INSTANCES=5
WSL2_WORKSPACE_ROOT=/tmp/claude-deployments
WSL2_DISTRIBUTION=Ubuntu-22.04

# Monitoring
HEALTH_CHECK_INTERVAL=30000
ENABLE_METRICS=true
LOG_LEVEL=info

# Webhooks
WEBHOOK_PORT=3002
WEBHOOK_SECRET=your-webhook-secret
```

### Configuration File Structure

```json
{
  "version": "1.0.0",
  "global": {
    "agentApiUrl": "http://localhost:3284",
    "timeout": 30000,
    "retryAttempts": 3,
    "maxConcurrentSessions": 10,
    "enableMetrics": true,
    "logLevel": "info"
  },
  "agents": {
    "claude": {
      "enabled": true,
      "maxSessions": 3,
      "model": "claude-3-5-sonnet-20241022",
      "allowedTools": ["Bash", "Edit", "Replace", "Create"],
      "maxTokens": 4096,
      "temperature": 0.1
    },
    "goose": {
      "enabled": true,
      "maxSessions": 3,
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "toolkits": ["developer", "screen"]
    }
  },
  "middleware": {
    "enableAuthentication": true,
    "enableRateLimit": true,
    "enableCors": true,
    "cors": {
      "origin": ["http://localhost:3000"],
      "credentials": true
    },
    "rateLimit": {
      "windowMs": 60000,
      "max": 100
    }
  },
  "wsl2": {
    "enabled": true,
    "maxInstances": 5,
    "workspaceRoot": "/tmp/claude-deployments",
    "distribution": "Ubuntu-22.04"
  },
  "monitoring": {
    "healthCheckInterval": 30000,
    "enableAlerts": true,
    "alertThreshold": 3
  }
}
```

## Quick Start Examples

### Development Setup

```javascript
import { quickSetup } from './src/ai_cicd_system/middleware/agentapi/index.js';

// Quick development setup
const integration = await quickSetup.development();

// Execute a simple task
const result = await integration.executeTask({
  id: 'dev-task-001',
  type: 'code_generation',
  title: 'Generate user authentication module',
  requirements: [
    'JWT token handling',
    'Password hashing',
    'User registration and login'
  ]
});

console.log('Task completed:', result.success);
```

### Production Setup

```javascript
import { createAgentAPIIntegration } from './src/ai_cicd_system/middleware/agentapi/index.js';

const integration = await createAgentAPIIntegration({
  configPath: './config/agentapi-prod.json',
  monitoring: {
    healthCheckInterval: 15000,
    enableAlerts: true
  },
  auth: {
    enableAuthentication: true,
    jwtSecret: process.env.JWT_SECRET
  },
  middleware: {
    enableRateLimit: true,
    enableCors: true
  }
});

// Set up event listeners
integration.healthMonitor.on('alert', (alert) => {
  console.log(`Alert: ${alert.severity} - ${alert.message}`);
});

integration.agentManager.on('taskCompleted', (result) => {
  console.log(`Task ${result.taskId} completed by ${result.agentType}`);
});
```

### Express Server Integration

```javascript
import express from 'express';
import { createAgentAPIIntegration } from './src/ai_cicd_system/middleware/agentapi/index.js';

const app = express();
const integration = await createAgentAPIIntegration();

// Mount AgentAPI routes
app.use('/api/v1/agents', integration.getRouter());

// Health check endpoint
app.get('/health', (req, res) => {
  const status = integration.getStatus();
  res.json(status);
});

// Task execution endpoint
app.post('/api/v1/tasks', async (req, res) => {
  try {
    const result = await integration.executeTask(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('AgentAPI Middleware server running on port 3000');
});
```

## Agent Capabilities

### Claude Code
- **Primary Use Cases**: PR deployment, code validation, error debugging, comprehensive analysis
- **Capabilities**: WSL2 deployment, Git operations, code review, security analysis
- **Best For**: Complex validation workflows, deployment testing, thorough code analysis

### Goose
- **Primary Use Cases**: Code generation, feature development, refactoring, documentation
- **Capabilities**: Context-aware generation, multi-file operations, optimization
- **Best For**: Creating new features, large-scale refactoring, comprehensive documentation

### Aider
- **Primary Use Cases**: Targeted code editing, file management, precise modifications
- **Capabilities**: Tree-sitter integration, diff context, Git operations
- **Best For**: Specific code changes, file operations, targeted refactoring

### Codex
- **Primary Use Cases**: Code completion, test generation, quick analysis
- **Capabilities**: Fast completion, documentation generation, code suggestions
- **Best For**: Code completion, test creation, rapid prototyping

## Error Handling and Recovery

### Circuit Breaker Protection

The system implements circuit breakers to prevent cascading failures:

```javascript
// Circuit breaker states: closed, open, half-open
const client = new AgentAPIClient({
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 60000
});

client.on('circuitBreakerOpened', () => {
  console.log('Circuit breaker opened - routing to alternative agent');
});
```

### Automatic Failover

```javascript
const router = new AgentRouter({
  strategy: 'capability_priority',
  enableFailover: true
});

// If primary agent fails, automatically route to backup
const selectedAgent = await router.selectAgent(task);
```

### Health Monitoring and Alerts

```javascript
const monitor = new AgentHealthMonitor({
  healthCheckInterval: 30000,
  alertThreshold: 3,
  enableAlerts: true
});

monitor.on('alert', (alert) => {
  if (alert.severity === 'error') {
    // Trigger recovery procedures
    integration.agentManager.restartAgent(alert.agentType);
  }
});
```

## Performance Optimization

### Connection Management
- HTTP connection pooling with keep-alive
- Configurable timeout and retry settings
- Circuit breaker protection for failed services

### Load Balancing
- Multiple routing strategies (round-robin, least-loaded, performance-based)
- Real-time load monitoring
- Automatic failover to healthy agents

### Caching and Optimization
- Response caching for frequently accessed data
- Configuration caching with hot reloading
- Metrics aggregation and retention management

## Security Features

### Authentication and Authorization
- JWT token-based authentication
- API key management with permissions
- Role-based access control

### Rate Limiting and Protection
- Configurable rate limits per client
- Progressive delay for excessive requests
- IP-based and token-based limiting

### Security Headers and CORS
- Comprehensive security headers (HSTS, CSP, etc.)
- Configurable CORS policies
- Request validation and sanitization

## Monitoring and Observability

### Metrics Collection
- Request/response metrics with timing
- Agent performance and availability tracking
- System resource monitoring (memory, CPU)
- Circuit breaker and error rate tracking

### Health Monitoring
- Continuous agent health checks
- System health aggregation
- Alert management with severity levels
- Performance threshold monitoring

### Logging and Debugging
- Structured JSON logging
- Configurable log levels
- Request tracing with unique IDs
- Error tracking and reporting

## Testing and Validation

### Unit Testing
```bash
npm test src/ai_cicd_system/middleware/agentapi/
```

### Integration Testing
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

### Health Check Testing
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/agents/status
```

## Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/ai_cicd_system/middleware/agentapi/index.js"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentapi-middleware
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agentapi-middleware
  template:
    spec:
      containers:
      - name: middleware
        image: agentapi-middleware:latest
        ports:
        - containerPort: 3000
        env:
        - name: AGENTAPI_URL
          value: "http://agentapi-service:3284"
```

## Troubleshooting

### Common Issues

1. **AgentAPI Connection Failed**
   ```bash
   # Check AgentAPI service
   curl http://localhost:3284/health
   
   # Verify configuration
   node -e "console.log(process.env.AGENTAPI_URL)"
   ```

2. **Circuit Breaker Open**
   ```javascript
   // Reset circuit breaker
   await integration.agentManager.restartAgent('claude');
   ```

3. **High Memory Usage**
   ```bash
   # Monitor memory usage
   node -e "console.log(process.memoryUsage())"
   
   # Check metrics retention
   curl http://localhost:3000/api/v1/metrics
   ```

### Debug Mode
```bash
DEBUG=agentapi:* npm start
```

### Health Diagnostics
```bash
# System health
curl http://localhost:3000/health

# Agent status
curl http://localhost:3000/api/v1/agents/status

# Metrics
curl http://localhost:3000/api/v1/metrics
```

## Migration from Individual PRs

This consolidated implementation replaces the following individual PR implementations:

- **PR #43**: Agent endpoints and middleware architecture
- **PR #46**: Configuration management and WSL2 setup
- **PR #47**: Integration examples and package updates
- **PR #60**: Agent configuration and dashboard
- **PR #61**: [To be analyzed]
- **PR #76**: Status synchronization system
- **PR #83**: Enhanced Codegen integration
- **PR #84**: Authentication framework
- **PR #85**: Middleware documentation and dependencies
- **PR #92**: API integration layer

### Migration Benefits

1. **Zero Code Duplication**: Eliminated redundant implementations across PRs
2. **Unified Configuration**: Single configuration system for all components
3. **Standardized Interfaces**: Consistent APIs and parameter structures
4. **Improved Performance**: Optimized resource usage and connection management
5. **Enhanced Reliability**: Comprehensive error handling and circuit breaker protection
6. **Better Monitoring**: Unified health monitoring and metrics collection

## Contributing

### Development Guidelines
1. Follow existing code patterns and naming conventions
2. Add comprehensive tests for new functionality
3. Update documentation for API changes
4. Ensure backward compatibility where possible

### Code Standards
- Use ESLint configuration for code formatting
- Write descriptive commit messages
- Add JSDoc comments for public APIs
- Include error handling for all async operations

## License

This consolidated AgentAPI middleware integration is part of the claude-task-master project and follows the same licensing terms.

