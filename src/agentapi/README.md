# AgentAPI Middleware Integration

This module provides a comprehensive integration layer between the claude-task-master orchestrator and Claude Code on WSL2 instances via the AgentAPI middleware.

## 🎯 Overview

The AgentAPI integration serves as a communication bridge that enables:

- **PR Deployment**: Automatic deployment of pull requests to WSL2 instances
- **Task Management**: Queuing, tracking, and lifecycle management of tasks
- **Load Balancing**: Intelligent distribution of tasks across WSL2 instances
- **Real-time Communication**: WebSocket-based status updates and notifications
- **Error Handling**: Robust retry logic and failure recovery
- **Resource Management**: WSL2 instance allocation and monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Claude Task     │    │ AgentAPI        │    │ WSL2 Instance   │
│ Master          │    │ Middleware      │    │ (Claude Code)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ 1. Submit PR Task     │                       │
         ├──────────────────────►│                       │
         │                       │ 2. Allocate Instance  │
         │                       ├──────────────────────►│
         │                       │                       │
         │                       │ 3. Clone PR Branch    │
         │                       ├──────────────────────►│
         │                       │                       │
         │ 4. Status Updates     │ 4. Execute Claude Code│
         │◄──────────────────────┤◄──────────────────────┤
         │                       │                       │
         │ 5. Results/Errors     │ 5. Return Results     │
         │◄──────────────────────┤◄──────────────────────┤
```

## 📦 Components

### Core Components

#### AgentAPIClient (`client.js`)
- HTTP and WebSocket client for AgentAPI communication
- PR deployment and task submission
- Real-time status updates and notifications

#### TaskManager (`task-manager.js`)
- Task queuing with priority support
- Lifecycle management (pending → running → completed/failed)
- Retry logic with exponential backoff
- Task status tracking and reporting

#### WSL2InstanceManager (`wsl2-manager.js`)
- WSL2 instance allocation and lifecycle management
- Claude Code execution coordination
- Resource monitoring and health checks
- Workspace preparation and cleanup

#### LoadBalancer (`load-balancer.js`)
- Multiple load balancing algorithms (round-robin, least-connections, weighted, resource-based)
- Health-aware instance selection
- Resource threshold enforcement
- Performance metrics tracking

### Communication Components

#### WebSocketClient (`websocket-client.js`)
- Real-time bidirectional communication
- Automatic reconnection with exponential backoff
- Channel-based subscriptions
- Heartbeat/ping-pong mechanism

#### MessageQueue (`message-queue.js`)
- Priority-based task queuing
- Dead letter queue for failed tasks
- Message persistence and TTL
- Pub/sub messaging for real-time updates

### Monitoring & Tracking

#### StatusTracker (`status-tracker.js`)
- Task status lifecycle tracking
- Historical status changes
- Performance metrics and analytics
- Status transition validation

#### ErrorHandler (`error-handler.js`)
- Categorized error handling
- Circuit breaker pattern
- Retry strategies with jitter
- Recovery mechanisms

### Configuration & Security

#### Configuration (`config.js`)
- Environment-based configuration
- Validation and defaults
- Component-specific configs
- Development/staging/production presets

#### AuthManager (`auth.js`)
- Token-based authentication
- API key management
- Rate limiting and account lockout
- Permission-based authorization

#### AgentAPIMiddleware (`middleware.js`)
- Express middleware integration
- Request/response handling
- Metrics collection
- Error handling

## 🚀 Quick Start

### Basic Usage

```javascript
import { createAgentAPIIntegration } from './src/agentapi/index.js';

// Initialize with default configuration
const agentApi = createAgentAPIIntegration({
  server: {
    baseUrl: 'http://localhost:3002',
    timeout: 30000
  },
  authentication: {
    token: 'your-api-token'
  },
  wsl2: {
    maxInstances: 5,
    distribution: 'Ubuntu'
  }
});

// Deploy a PR
const prData = {
  repository: { full_name: 'user/repo', clone_url: 'https://github.com/user/repo.git' },
  pull_request: {
    number: 123,
    head: { ref: 'feature-branch', sha: 'abc123' },
    base: { ref: 'main' }
  }
};

const result = await agentApi.deployPR(prData);
console.log('Deployment result:', result);

// Check task status
const status = await agentApi.getTaskStatus(result.taskId);
console.log('Task status:', status);
```

### Express Integration

```javascript
import express from 'express';
import { AgentAPIMiddleware } from './src/agentapi/index.js';

const app = express();
const middleware = new AgentAPIMiddleware({
  enableAuth: true,
  enableRateLimit: true,
  enableMetrics: true
});

// Use the complete API router
app.use('/api/v1/agentapi', middleware.createAPIRouter());

// Or use individual middleware components
app.use(middleware.createLoggingMiddleware());
app.use(middleware.createRateLimitMiddleware());
app.use(middleware.createAuthMiddleware());

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
AGENTAPI_URL=http://localhost:3002
AGENTAPI_WS_URL=ws://localhost:3002/ws
AGENTAPI_TIMEOUT=30000
AGENTAPI_TOKEN=your_agentapi_token

# WSL2 Configuration
WSL2_MAX_INSTANCES=5
WSL2_INSTANCE_TIMEOUT=300000
WSL2_MEMORY_LIMIT=4GB
WSL2_CPU_LIMIT=2 cores
WSL2_DISTRIBUTION=Ubuntu
WSL2_USER=ubuntu
WSL2_WORKING_DIR=/home/ubuntu/workspace

# Claude Code Configuration
CLAUDE_CODE_VERSION=latest
CLAUDE_CODE_TIMEOUT=600000
CLAUDE_CODE_RETRY_ATTEMPTS=3
CLAUDE_CODE_MAX_CONCURRENT=3

# Task Manager Configuration
TASK_MANAGER_MAX_CONCURRENT=10
TASK_MANAGER_TIMEOUT=600000
TASK_MANAGER_RETRY_ATTEMPTS=3

# Load Balancer Configuration
LOAD_BALANCER_ALGORITHM=weighted_round_robin
LOAD_BALANCER_HEALTH_CHECK=true
LOAD_BALANCER_MAX_CPU=80
LOAD_BALANCER_MAX_MEMORY=85

# Monitoring Configuration
AGENTAPI_ENABLE_METRICS=true
AGENTAPI_LOG_LEVEL=info
AGENTAPI_DEBUG_MODE=false
```

### Programmatic Configuration

```javascript
import { getEnvironmentConfig, validateConfig } from './src/agentapi/config.js';

// Get environment-specific configuration
const config = getEnvironmentConfig('production');

// Validate configuration
const validation = validateConfig(config);
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
  process.exit(1);
}

// Use configuration
const agentApi = createAgentAPIIntegration(config);
```

## 📊 Monitoring & Metrics

### Health Checks

```javascript
// Get overall system health
const health = await agentApi.getHealth();
console.log('System health:', health);

// Component-specific health
const taskManagerStats = agentApi.taskManager.getStatistics();
const wsl2Stats = agentApi.wsl2Manager.getStatistics();
const loadBalancerStats = agentApi.loadBalancer.getStatistics();
```

### Metrics Collection

```javascript
// Enable metrics in middleware
const middleware = new AgentAPIMiddleware({
  enableMetrics: true,
  enableLogging: true
});

// Get metrics via API
app.get('/metrics', (req, res) => {
  res.json(middleware.getMetrics());
});
```

### Real-time Updates

```javascript
// Subscribe to task updates
await agentApi.client.subscribeToTask(taskId, (update) => {
  console.log('Task update:', update);
});

// Subscribe to system events
agentApi.taskManager.on('taskCompleted', (task) => {
  console.log('Task completed:', task.id);
});

agentApi.errorHandler.on('errorOccurred', (error) => {
  console.log('Error occurred:', error);
});
```

## 🔧 Advanced Usage

### Custom Load Balancing

```javascript
import { LoadBalancer } from './src/agentapi/index.js';

const loadBalancer = new LoadBalancer({
  algorithm: 'resource_based',
  resourceThresholds: {
    maxCpuUsage: 70,
    maxMemoryUsage: 80
  }
});

// Set custom instance weights
loadBalancer.setInstanceWeight('instance-1', 2.0);
loadBalancer.setInstanceWeight('instance-2', 1.5);
```

### Error Recovery Strategies

```javascript
import { ErrorHandler } from './src/agentapi/index.js';

const errorHandler = new ErrorHandler({
  circuitBreakerEnabled: true,
  circuitBreakerThreshold: 5,
  maxRetryAttempts: 3
});

// Register custom recovery strategy
errorHandler.registerRecoveryStrategy('network', async () => {
  // Custom network recovery logic
  console.log('Attempting network recovery...');
  return true;
});
```

### Custom Task Processing

```javascript
import { TaskManager } from './src/agentapi/index.js';

const taskManager = new TaskManager({
  maxConcurrentTasks: 15,
  taskTimeout: 900000 // 15 minutes
});

// Listen for task events
taskManager.on('taskStarted', (task) => {
  console.log(`Task ${task.id} started`);
});

taskManager.on('taskFailed', (task) => {
  console.log(`Task ${task.id} failed:`, task.error);
});
```

## 🧪 Testing

### Mock Mode

```javascript
// Enable mock mode for testing
const agentApi = createAgentAPIIntegration({
  development: {
    enableMockMode: true,
    mockDelay: 1000
  }
});
```

### Integration Tests

```javascript
import { AgentAPIClient } from './src/agentapi/index.js';

describe('AgentAPI Integration', () => {
  let client;

  beforeEach(() => {
    client = new AgentAPIClient({
      agentApiUrl: 'http://localhost:3002',
      apiKey: 'test-key'
    });
  });

  afterEach(async () => {
    await client.close();
  });

  test('should deploy PR successfully', async () => {
    const prData = {
      repository: { full_name: 'test/repo' },
      pull_request: { number: 1, head: { ref: 'test' } }
    };

    const result = await client.deployPR(prData);
    expect(result.taskId).toBeDefined();
  });
});
```

## 🔒 Security

### Authentication

```javascript
import { AuthManager } from './src/agentapi/index.js';

const authManager = new AuthManager({
  enableApiKeyAuth: true,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000
});

// Create API key
const apiKey = await authManager.createApiKey({
  name: 'CI/CD Integration',
  userId: 'system',
  scopes: ['deploy:pr', 'tasks:read']
});
```

### Rate Limiting

```javascript
// Configure rate limiting
const middleware = new AgentAPIMiddleware({
  enableRateLimit: true,
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100 // requests per window
});
```

## 🐛 Troubleshooting

### Common Issues

1. **WSL2 Connection Failed**
   ```bash
   # Check WSL2 status
   wsl --list --verbose
   
   # Restart WSL2 if needed
   wsl --shutdown
   wsl --distribution Ubuntu
   ```

2. **AgentAPI Connection Timeout**
   ```javascript
   // Increase timeout in configuration
   const config = {
     server: {
       timeout: 60000 // 60 seconds
     }
   };
   ```

3. **Task Queue Full**
   ```javascript
   // Increase queue size
   const taskManager = new TaskManager({
     maxConcurrentTasks: 20
   });
   ```

### Debug Mode

```bash
# Enable debug logging
AGENTAPI_LOG_LEVEL=debug
AGENTAPI_DEBUG_MODE=true
AGENTAPI_VERBOSE_LOGGING=true
```

### Health Monitoring

```javascript
// Monitor component health
setInterval(async () => {
  const health = await agentApi.getHealth();
  if (health.status !== 'healthy') {
    console.warn('System health degraded:', health);
  }
}, 30000);
```

## 📚 API Reference

### AgentAPIClient

- `deployPR(prData)` - Deploy a pull request
- `getTaskStatus(taskId)` - Get task status
- `getTasks(filters)` - Get all tasks with filters
- `cancelTask(taskId)` - Cancel a running task
- `subscribeToTask(taskId, callback)` - Subscribe to task updates
- `getHealth()` - Get AgentAPI health status

### TaskManager

- `submitTask(taskData)` - Submit a new task
- `getTaskStatus(taskId)` - Get task status
- `getTasks(filters)` - Get tasks with filters
- `cancelTask(taskId)` - Cancel a task
- `getStatistics()` - Get task manager statistics

### WSL2InstanceManager

- `allocateInstance(task)` - Allocate WSL2 instance
- `executeClaudeCode(instance, task)` - Execute Claude Code
- `releaseInstance(instanceId)` - Release instance
- `getInstanceStatus(instanceId)` - Get instance status
- `getAllInstancesStatus()` - Get all instances status

For complete API documentation, see the individual component files.

## 🤝 Contributing

1. Follow the existing code style and patterns
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Ensure all components handle errors gracefully
5. Add appropriate logging and metrics

## 📄 License

This module is part of the claude-task-master project and follows the same license terms.

