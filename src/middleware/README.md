# AgentAPI Middleware Integration

A comprehensive middleware system that enables seamless communication between Claude Task Master and Claude Code through AgentAPI, providing automated PR validation, deployment, and code analysis capabilities.

## 🎯 Overview

The AgentAPI Middleware Integration serves as the critical bridge between the task orchestration system and Claude Code execution, enabling:

- **Real-time Communication**: Bidirectional communication with Claude Code instances via AgentAPI
- **Task Queue Management**: Priority-based task scheduling with concurrent execution
- **Instance Lifecycle Management**: Automatic creation, monitoring, and cleanup of Claude Code instances
- **Event Stream Processing**: Real-time event handling with SSE (Server-Sent Events)
- **Error Recovery**: Automatic reconnection and retry mechanisms
- **Performance Monitoring**: Comprehensive metrics and health checking

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Linear        │    │   Claude Task   │    │   AgentAPI      │
│  Integration    │───▶│    Master       │───▶│   Middleware    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Task Queue    │    │   Event         │
│   Database      │◀───│   Manager       │◀───│   Processor     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Claude Code   │    │   AgentAPI      │
                       │    Manager      │───▶│    Client       │
                       └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Claude Code   │    │   AgentAPI      │
                       │   Instances     │◀───│    Server       │
                       └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { AgentAPIMiddleware } from './src/middleware/index.js';

// Create and start the middleware
const middleware = new AgentAPIMiddleware();
await middleware.start();

// Add a code analysis task
const taskId = middleware.addTask({
  type: 'analyze',
  priority: 8,
  data: {
    repository: 'https://github.com/example/repo.git',
    branch: 'main',
    analysisType: 'security',
    options: {
      depth: 'medium',
      includeTests: true
    }
  }
});

// Monitor task completion
middleware.on('taskCompleted', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed:`, result);
});

// Stop the middleware
await middleware.stop();
```

### Advanced Configuration

```javascript
import { AgentAPIMiddleware, AgentAPIConfig } from './src/middleware/index.js';

// Create custom configuration
const config = new AgentAPIConfig({
  agentapi: {
    baseUrl: 'http://localhost:3284',
    timeout: 60000,
    retryAttempts: 5
  },
  claudeCode: {
    maxInstances: 3,
    instanceTimeout: 600000,
    defaultTools: ['Bash(git*)', 'Edit', 'Replace', 'Search']
  },
  taskQueue: {
    maxConcurrentTasks: 2,
    taskTimeout: 300000,
    retryAttempts: 3
  }
});

const middleware = new AgentAPIMiddleware(config);
await middleware.start();
```

## 📋 Core Components

### 1. AgentAPI Client (`agentapi-client.js`)

HTTP client for AgentAPI communication with comprehensive features:

- **All AgentAPI Endpoints**: `/messages`, `/message`, `/status`, `/events`
- **Real-time Event Streaming**: SSE support with automatic reconnection
- **Connection Management**: Health monitoring and automatic recovery
- **Error Handling**: Retry logic with exponential backoff

```javascript
import { AgentAPIClient } from './src/middleware/agentapi-client.js';

const client = new AgentAPIClient({
  baseUrl: 'http://localhost:3284',
  enableEventStream: true,
  retryAttempts: 3
});

await client.initialize();

// Send message to Claude Code
const response = await client.sendMessage({
  content: 'Analyze this codebase for security vulnerabilities',
  type: 'user'
});

// Get conversation history
const messages = await client.getMessages();

// Check agent status
const status = await client.getStatus();
```

### 2. Claude Code Manager (`claude-code-manager.js`)

Manages Claude Code instance lifecycle and execution:

- **Instance Management**: Create, monitor, and destroy Claude Code instances
- **Execution Monitoring**: Track job progress and handle timeouts
- **Resource Allocation**: Limit concurrent instances and manage resources
- **Health Checking**: Monitor instance health and performance

```javascript
import { ClaudeCodeManager } from './src/middleware/claude-code-manager.js';

const manager = new ClaudeCodeManager({
  agentApiUrl: 'http://localhost:3284',
  maxInstances: 5,
  instanceTimeout: 300000
});

// Create a new instance
const instanceId = await manager.createInstance({
  allowedTools: ['Bash(git*)', 'Edit', 'Replace'],
  workingDirectory: '/path/to/project'
});

// Execute instruction
const result = await manager.executeInstruction(
  instanceId,
  'Analyze this code for performance issues',
  { repository: 'https://github.com/example/repo.git' }
);

// Stop instance
await manager.stopInstance(instanceId);
```

### 3. Task Queue (`task-queue.js`)

Priority-based task scheduling with concurrent execution:

- **Priority Scheduling**: Higher priority tasks execute first
- **Concurrent Execution**: Configurable number of simultaneous tasks
- **Dependency Management**: Support for task dependencies
- **Retry Logic**: Automatic retry with configurable attempts
- **Timeout Handling**: Task-level timeout management

```javascript
import { TaskQueue } from './src/middleware/task-queue.js';

const queue = new TaskQueue({
  maxConcurrentTasks: 3,
  taskTimeout: 300000,
  retryAttempts: 3
});

// Add task with priority
const taskId = queue.addTask({
  type: 'analyze',
  priority: 8,
  data: {
    repository: 'https://github.com/example/repo.git',
    analysisType: 'security'
  },
  dependencies: ['task-1', 'task-2'] // Optional dependencies
});

// Monitor task execution
queue.on('executeTask', ({ task, resolve, reject }) => {
  // Custom task execution logic
  executeCustomTask(task)
    .then(resolve)
    .catch(reject);
});
```

### 4. Event Processor (`event-processor.js`)

Real-time SSE event processing and routing:

- **SSE Stream Management**: Connect to AgentAPI event stream
- **Event Filtering**: Configurable event type filtering
- **Event Buffering**: Maintain event history with configurable size
- **Handler Registration**: Register custom event handlers
- **Reconnection Logic**: Automatic reconnection on stream interruption

```javascript
import { EventProcessor } from './src/middleware/event-processor.js';

const processor = new EventProcessor({
  agentApiUrl: 'http://localhost:3284',
  eventBufferSize: 1000,
  eventFilters: ['message', 'status', 'error']
});

await processor.start();

// Register event handlers
processor.registerHandler('message', (event) => {
  console.log('New message:', event.content);
});

processor.registerHandler('status', (event) => {
  console.log('Status changed:', event.status);
});

// Get recent events
const recentEvents = processor.getRecentEvents({
  limit: 50,
  eventType: 'message'
});
```

## 🔧 Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
AGENTAPI_TIMEOUT=30000
AGENTAPI_RETRY_ATTEMPTS=3
AGENTAPI_ENABLE_EVENT_STREAM=true

# Claude Code Configuration
CLAUDE_CODE_MAX_INSTANCES=5
CLAUDE_CODE_INSTANCE_TIMEOUT=300000
CLAUDE_CODE_DEFAULT_TOOLS=Bash(git*),Edit,Replace
CLAUDE_CODE_WORKING_DIRECTORY=/workspace

# Task Queue Configuration
TASK_QUEUE_MAX_CONCURRENT=3
TASK_QUEUE_DEFAULT_PRIORITY=5
TASK_QUEUE_TASK_TIMEOUT=300000
TASK_QUEUE_MAX_SIZE=1000

# Event Processor Configuration
EVENT_PROCESSOR_BUFFER_SIZE=1000
EVENT_PROCESSOR_HEARTBEAT_INTERVAL=30000
EVENT_PROCESSOR_FILTERS=message,status,error

# Database Configuration (Optional)
DATABASE_ENABLED=true
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_task_master

# Logging Configuration
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_DIRECTORY=./logs

# Monitoring Configuration
MONITORING_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_PORT=8080
```

### Configuration File

```javascript
import { AgentAPIConfig } from './src/config/agentapi-config.js';

const config = new AgentAPIConfig({
  agentapi: {
    baseUrl: 'http://localhost:3284',
    timeout: 60000,
    retryAttempts: 5,
    enableEventStream: true
  },
  claudeCode: {
    maxInstances: 3,
    instanceTimeout: 600000,
    defaultTools: ['Bash(git*)', 'Edit', 'Replace', 'Search'],
    autoStart: true,
    autoRestart: true
  },
  taskQueue: {
    maxConcurrentTasks: 2,
    taskTimeout: 300000,
    retryAttempts: 3,
    queueProcessInterval: 1000,
    maxQueueSize: 500
  },
  eventProcessor: {
    eventBufferSize: 500,
    heartbeatInterval: 15000,
    eventFilters: ['message', 'status', 'error']
  },
  database: {
    enabled: true,
    url: 'postgresql://user:pass@localhost:5432/claude_task_master'
  },
  logging: {
    level: 'debug',
    enableFileLogging: true
  },
  monitoring: {
    enabled: true,
    enablePrometheus: true
  }
});
```

## 📝 Task Types

### Analysis Tasks

Perform comprehensive code analysis:

```javascript
const taskId = middleware.addTask({
  type: 'analyze',
  priority: 8,
  data: {
    repository: 'https://github.com/example/repo.git',
    branch: 'main',
    files: ['src/**/*.js', 'tests/**/*.test.js'],
    analysisType: 'security', // 'security', 'performance', 'quality', 'architecture'
    options: {
      depth: 'deep', // 'shallow', 'medium', 'deep'
      includeTests: true,
      outputFormat: 'structured'
    }
  }
});
```

### Generation Tasks

Generate code from natural language descriptions:

```javascript
const taskId = middleware.addTask({
  type: 'generate',
  priority: 7,
  data: {
    description: 'Create a REST API endpoint for user authentication with JWT tokens',
    language: 'typescript',
    framework: 'nestjs',
    options: {
      includeTests: true,
      includeDocumentation: true,
      style: 'enterprise'
    }
  }
});
```

### Review Tasks

Perform code reviews on changes:

```javascript
const taskId = middleware.addTask({
  type: 'review',
  priority: 9,
  data: {
    files: ['src/auth.js', 'src/middleware/auth.js'],
    changes: 'Added JWT token validation and refresh mechanism',
    focusAreas: ['security', 'performance', 'maintainability'],
    options: {
      severity: 'high',
      includeMetrics: true
    }
  }
});
```

### Validation Tasks

Validate code for correctness and best practices:

```javascript
const taskId = middleware.addTask({
  type: 'validate',
  priority: 6,
  data: {
    code: 'function validateEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }',
    language: 'javascript',
    validationType: 'comprehensive',
    options: {
      requirements: [
        'Must handle edge cases',
        'Should be performant',
        'Must follow best practices'
      ]
    }
  }
});
```

### Custom Tasks

Execute custom instructions:

```javascript
const taskId = middleware.addTask({
  type: 'custom',
  priority: 5,
  data: {
    instruction: 'Explain the benefits of using TypeScript over JavaScript in enterprise applications',
    options: {
      outputFormat: 'structured',
      includeExamples: true
    }
  },
  context: {
    source: 'linear-integration',
    requestId: 'req-123'
  }
});
```

## 📊 Monitoring and Health Checks

### Statistics

```javascript
const stats = middleware.getStats();
console.log(stats);
// {
//   middleware: {
//     isInitialized: true,
//     isRunning: true,
//     uptime: 3600000,
//     totalTasks: 25,
//     completedTasks: 20,
//     failedTasks: 2,
//     activeInstances: 3
//   },
//   taskQueue: {
//     queue: { size: 5, maxSize: 1000 },
//     active: { count: 2, maxConcurrent: 3 },
//     completed: { count: 20, successRate: 0.91 }
//   },
//   claudeCodeManager: {
//     totalInstances: 3,
//     activeJobs: 2
//   }
// }
```

### Health Checks

```javascript
// Basic health status
const health = middleware.getHealth();
console.log(health);
// {
//   status: 'healthy',
//   timestamp: 1640995200000,
//   uptime: 3600000,
//   components: {
//     agentApiClient: true,
//     eventProcessor: true,
//     taskQueue: true,
//     claudeCodeManager: 3
//   },
//   version: '1.0.0'
// }

// Comprehensive health check
const healthCheck = await middleware.performHealthCheck();
console.log(healthCheck);
// {
//   status: 'healthy',
//   overall: 'healthy',
//   checks: [
//     { name: 'agentapi', status: 'healthy', message: 'Connected' },
//     { name: 'claude-code', status: 'healthy', message: 'Available' },
//     { name: 'task-queue', status: 'healthy', message: '5/1000 queued, 2 active' }
//   ]
// }
```

## 🔄 Event System

The middleware provides a comprehensive event system for monitoring and integration:

### Core Events

```javascript
// Middleware lifecycle
middleware.on('initialized', () => console.log('Middleware initialized'));
middleware.on('started', () => console.log('Middleware started'));
middleware.on('stopped', () => console.log('Middleware stopped'));

// Task events
middleware.on('taskCompleted', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed`, result);
});

middleware.on('taskFailed', ({ taskId, error }) => {
  console.log(`Task ${taskId} failed`, error);
});

// Instance events
middleware.on('instanceCreated', ({ instanceId }) => {
  console.log(`Instance created: ${instanceId}`);
});

middleware.on('instanceStopped', ({ instanceId }) => {
  console.log(`Instance stopped: ${instanceId}`);
});

// AgentAPI events
middleware.on('agentApiConnected', () => {
  console.log('AgentAPI connected');
});

middleware.on('agentApiDisconnected', () => {
  console.log('AgentAPI disconnected');
});

// Real-time agent communication
middleware.on('agentMessage', (message) => {
  console.log('Agent message:', message.content);
});

middleware.on('agentStatusChanged', (status) => {
  console.log('Agent status:', status.status);
});
```

## 🧪 Testing

### Running Tests

```bash
# Run all middleware tests
npm test tests/middleware/

# Run specific test file
npm test tests/middleware/agentapi-middleware.test.js

# Run with coverage
npm run test:coverage tests/middleware/
```

### Test Categories

- **Unit Tests**: Individual component testing
- **Integration Tests**: Component interaction testing
- **Performance Tests**: Load and stress testing
- **Error Scenario Tests**: Error handling and recovery
- **End-to-End Tests**: Complete workflow testing

## 📚 Examples

### Basic Example

```bash
node src/middleware/examples/usage-example.js
```

### Advanced Configuration

```javascript
import { advancedConfigurationExample } from './src/middleware/examples/usage-example.js';
await advancedConfigurationExample();
```

### Real-time Monitoring

```javascript
import { realTimeMonitoringExample } from './src/middleware/examples/usage-example.js';
await realTimeMonitoringExample();
```

### Error Handling

```javascript
import { errorHandlingExample } from './src/middleware/examples/usage-example.js';
await errorHandlingExample();
```

## 🔗 Integration Points

### Linear Integration

```javascript
// Trigger Claude Code from Linear events
middleware.on('linearIssueCreated', async (issue) => {
  const taskId = middleware.addTask({
    type: 'analyze',
    priority: issue.priority,
    data: {
      repository: issue.repository,
      analysisType: 'general'
    },
    context: {
      source: 'linear',
      issueId: issue.id
    }
  });
});
```

### PostgreSQL Database

```javascript
// Store task queue and execution logs
const config = new AgentAPIConfig({
  database: {
    enabled: true,
    url: 'postgresql://user:pass@localhost:5432/claude_task_master'
  },
  taskQueue: {
    enablePersistence: true
  }
});
```

### Webhook System

```javascript
// Process AgentAPI events via webhooks
app.post('/webhook/agentapi', (req, res) => {
  const event = req.body;
  middleware.eventProcessor.emit(event.type, event);
  res.status(200).send('OK');
});
```

## 🚨 Error Handling

The middleware includes comprehensive error handling and recovery mechanisms:

### Automatic Recovery

- **Connection Failures**: Automatic reconnection with exponential backoff
- **Task Failures**: Configurable retry attempts with delay
- **Instance Crashes**: Automatic instance recreation
- **Event Stream Interruptions**: Automatic stream reconnection

### Error Events

```javascript
middleware.on('initializationError', (error) => {
  console.error('Initialization failed:', error);
});

middleware.on('taskFailed', ({ taskId, error }) => {
  console.error(`Task ${taskId} failed:`, error);
});

middleware.on('instanceError', ({ instanceId, error }) => {
  console.error(`Instance ${instanceId} error:`, error);
});
```

## 🔧 Troubleshooting

### Common Issues

1. **AgentAPI Connection Failed**
   - Verify AgentAPI server is running on correct port
   - Check network connectivity
   - Validate configuration settings

2. **Claude Code Not Found**
   - Ensure Claude Code is installed and in PATH
   - Check working directory permissions
   - Verify tool permissions

3. **Task Queue Overflow**
   - Increase `maxQueueSize` configuration
   - Monitor task completion rates
   - Optimize task execution time

4. **Instance Timeout**
   - Increase `instanceTimeout` setting
   - Check system resources
   - Monitor task complexity

### Debug Logging

```bash
LOG_LEVEL=debug node your-app.js
```

### Health Check Endpoint

```bash
curl http://localhost:8080/health
```

## 📈 Performance Optimization

### Configuration Tuning

```javascript
const config = new AgentAPIConfig({
  claudeCode: {
    maxInstances: 5, // Adjust based on system resources
    instanceTimeout: 600000 // 10 minutes for complex tasks
  },
  taskQueue: {
    maxConcurrentTasks: 3, // Balance concurrency vs resources
    queueProcessInterval: 500 // Faster processing for high throughput
  },
  eventProcessor: {
    eventBufferSize: 2000, // Larger buffer for high event volume
    heartbeatInterval: 15000 // More frequent health checks
  }
});
```

### Monitoring Metrics

- **Task Throughput**: Tasks completed per minute
- **Instance Utilization**: Active instances vs maximum
- **Queue Depth**: Number of pending tasks
- **Error Rate**: Failed tasks percentage
- **Response Time**: Average task execution time

## 🔒 Security

### Authentication

```javascript
const config = new AgentAPIConfig({
  security: {
    enableAuth: true,
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET
  }
});
```

### Rate Limiting

```javascript
const config = new AgentAPIConfig({
  security: {
    enableRateLimit: true,
    rateLimitWindow: 900000, // 15 minutes
    rateLimitMax: 100 // 100 requests per window
  }
});
```

## 📄 License

This project is licensed under the MIT License with Commons Clause - see the [LICENSE](../../../LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Ensure all tests pass
5. Submit a pull request

## 📞 Support

For issues and questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Review the [examples](#-examples)
3. Open an issue on GitHub
4. Contact the development team

---

**Built with ❤️ for the Claude Task Master ecosystem**

