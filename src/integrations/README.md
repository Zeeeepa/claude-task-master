# 🔗 AgentAPI Integration & Claude Code Control

This directory contains the comprehensive AgentAPI integration for controlling Claude Code instances on WSL2, enabling automated code generation and modification as part of the CI/CD pipeline.

## 📋 Overview

The AgentAPI integration provides a robust, production-ready system for:

- **HTTP Communication**: Reliable communication with Claude Code via AgentAPI
- **Task Execution**: Automated code generation and modification workflows
- **Workspace Management**: WSL2 environment setup and management
- **Health Monitoring**: Real-time monitoring and performance tracking
- **Error Handling**: Comprehensive error recovery with circuit breaker protection
- **File Tracking**: Detailed tracking of file modifications and changes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AgentAPI Integration Architecture                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  AgentAPI       │    │  Claude Code    │    │  Workspace      │         │
│  │  Client         │◄──►│  Executor       │◄──►│  Manager        │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Agent          │    │  Result         │    │  File           │         │
│  │  Monitor        │    │  Parser         │    │  Tracker        │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   ▼                                         │
│                          ┌─────────────────┐                                │
│                          │  Error Handler  │                                │
│                          │  & Circuit      │                                │
│                          │  Breaker        │                                │
│                          └─────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
src/integrations/
├── agentapi_client.js          # HTTP client for AgentAPI communication
├── claude_code_executor.js     # Task execution logic for Claude Code
├── workspace_manager.js        # WSL2 workspace management
├── agent_monitor.js           # Health monitoring and performance tracking
├── file_tracker.js            # File modification tracking
├── result_parser.js           # Parse and extract results from agent output
├── prompt_templates.js        # Standardized prompts for different task types
├── config.js                  # Integration configuration management
├── index.js                   # Main entry point and convenience functions
├── examples/
│   └── agentapi_integration_example.js  # Comprehensive usage examples
├── tests/
│   └── agentapi_integration.test.js     # Test suite
└── README.md                  # This file
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { createAgentAPIIntegration } from './src/integrations/index.js';

// Create integration instance
const integration = createAgentAPIIntegration({
  environment: 'development'
});

// Define a task
const task = {
  id: 'feature-001',
  title: 'Add input validation',
  description: 'Implement comprehensive input validation for user forms',
  type: 'feature',
  requirements: [
    'Validate email format',
    'Check password strength',
    'Sanitize user inputs'
  ]
};

// Execute the task
const result = await integration.executeTask(task);
console.log('Task completed:', result.parsedResults.summary);
```

### Using Individual Components

```javascript
import { 
  AgentAPIClient, 
  ClaudeCodeExecutor, 
  WorkspaceManager,
  AgentMonitor 
} from './src/integrations/index.js';

// Initialize components
const agentAPI = new AgentAPIClient({
  baseURL: 'http://localhost:3284',
  timeout: 30000
});

const executor = new ClaudeCodeExecutor({
  agentAPI: { baseURL: 'http://localhost:3284' }
});

const monitor = new AgentMonitor();
monitor.start();

// Execute task
const result = await executor.executeTask(task, 'exec-123');
```

## 🔧 Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
AGENTAPI_TIMEOUT=30000
AGENTAPI_MAX_RETRIES=3

# Workspace Configuration
WORKSPACE_BASE_PATH=/tmp/workspace
WORKSPACE_MAX_CONCURRENT=10
WORKSPACE_CLEANUP_AFTER=3600000

# Claude Configuration
CLAUDE_MAX_TOKENS=4000
CLAUDE_TEMPERATURE=0.1
CLAUDE_ALLOWED_TOOLS=Bash(git*),Edit,Replace

# Monitoring Configuration
MONITOR_HEALTH_CHECK_INTERVAL=30000
MONITOR_ERROR_RATE_THRESHOLD=10
```

### Configuration Presets

```javascript
import { quickSetup } from './src/integrations/index.js';

// Development setup
const devIntegration = quickSetup.development();

// Production setup
const prodIntegration = quickSetup.production();

// Custom setup
const customIntegration = quickSetup.custom({
  agentAPI: {
    baseURL: 'https://my-agentapi.com',
    timeout: 60000
  },
  workspace: {
    maxConcurrent: 20
  }
});
```

## 📊 Monitoring & Health Checks

### Real-time Monitoring

```javascript
import { AgentMonitor } from './src/integrations/index.js';

const monitor = new AgentMonitor({
  healthCheckInterval: 30000,
  alertThresholds: {
    errorRate: 10,
    responseTime: 5000
  }
});

// Event listeners
monitor.on('health:check', (status) => {
  console.log(`Health: ${status.healthy ? '✅' : '❌'}`);
});

monitor.on('health:alerts', (alerts) => {
  alerts.forEach(alert => {
    console.log(`🚨 ${alert.severity}: ${alert.message}`);
  });
});

monitor.start();
```

### Performance Metrics

```javascript
// Get current metrics
const metrics = monitor.getMetrics();
console.log('Success Rate:', metrics.requests.successful / metrics.requests.total);
console.log('Average Response Time:', metrics.requests.averageResponseTime);
console.log('Circuit Breaker State:', metrics.system.circuitBreakerTrips);
```

## 🏗️ Workspace Management

### Creating Workspaces

```javascript
import { WorkspaceManager } from './src/integrations/index.js';

const workspaceManager = new WorkspaceManager({
  basePath: '/tmp/workspace',
  maxConcurrent: 10
});

// Create workspace with repository
const workspace = await workspaceManager.createWorkspace('task-001', {
  repository: 'https://github.com/example/project.git',
  branch: 'main',
  environment: {
    variables: {
      NODE_ENV: 'development'
    },
    dependencies: {
      nodePackages: ['lodash', 'axios']
    }
  }
});
```

### Workspace Statistics

```javascript
const stats = await workspaceManager.getStatistics();
console.log(`Active workspaces: ${stats.activeWorkspaces}`);
console.log(`Disk usage: ${stats.diskUsage.total}`);
```

## 📝 Prompt Templates

### Using Built-in Templates

```javascript
import { generatePrompt } from './src/integrations/index.js';

const task = {
  title: 'Fix authentication bug',
  description: 'Users cannot log in with valid credentials',
  type: 'bugfix',
  bug_details: 'Login fails with 500 error',
  reproduction_steps: '1. Enter valid email\n2. Enter valid password\n3. Click login'
};

const prompt = generatePrompt(task);
// Generates a comprehensive bugfix prompt with investigation steps
```

### Custom Templates

```javascript
import { createTemplate } from './src/integrations/index.js';

const customTemplate = createTemplate(
  'api-integration',
  `# API Integration: {{title}}

## Objective
{{description}}

## API Requirements
{{api_requirements}}

## Implementation Steps
1. Set up API client
2. Implement authentication
3. Add error handling
4. Write tests`,
  ['title', 'description', 'api_requirements']
);

const prompt = customTemplate.render({
  title: 'Payment Gateway Integration',
  description: 'Integrate Stripe payment processing',
  api_requirements: 'Support credit cards and ACH payments'
});
```

## 📁 File Tracking

### Tracking File Changes

```javascript
import { FileTracker } from './src/integrations/index.js';

const fileTracker = new FileTracker();

// Create snapshot before task execution
await fileTracker.createSnapshot('task-001', '/path/to/workspace');

// ... execute task ...

// Detect changes
const changes = await fileTracker.detectChanges('task-001');
console.log(`Files modified: ${changes.summary.filesModified}`);
console.log(`Lines added: ${changes.summary.linesAdded}`);
console.log(`Lines removed: ${changes.summary.linesRemoved}`);
```

### Change Analysis

```javascript
// Get detailed change report
const report = fileTracker.generateSummaryReport('task-001');
console.log('Modified files:', report.changes.details.modified);
console.log('Created files:', report.changes.details.created);
console.log('Deleted files:', report.changes.details.deleted);
```

## 🧪 Testing

### Running Tests

```bash
# Run all AgentAPI integration tests
npm run agentapi:test

# Run specific test suites
npm run test src/integrations/tests/agentapi_integration.test.js

# Run with coverage
npm run test:coverage src/integrations/
```

### Example Tests

```javascript
import { AgentAPIClient } from './src/integrations/index.js';

describe('AgentAPIClient', () => {
  it('should send messages successfully', async () => {
    const client = new AgentAPIClient({
      baseURL: 'http://localhost:3284'
    });
    
    const result = await client.sendMessage('Hello, Claude!');
    expect(result).toHaveProperty('id');
  });
});
```

## 📚 Examples

### Complete Task Execution

```bash
# Run complete task execution example
npm run agentapi:example

# Run health monitoring example
npm run agentapi:health

# Run workspace management example
npm run agentapi:workspace

# Run all examples
npm run agentapi:all
```

### Example Output

```
🚀 Starting AgentAPI Integration Example
📋 Configuration loaded
📊 Monitoring started
📝 Task: Add input validation to user registration
🏗️ Workspace created: /tmp/workspace/example-task-001
📸 File snapshot created
💭 Prompt generated
⚡ Starting task execution...
✅ Task completed in 45230ms
📊 Results parsed
🔍 File changes detected

📈 EXECUTION RESULTS:
==================================================

🎯 Task Results:
Summary: Successfully implemented input validation with email format checking, password strength validation, and input sanitization. Added comprehensive error handling and user feedback.
Files Modified: 3
Files Created: 2
Commands Executed: 8
Errors: 0

📁 File Changes:
Total Changes: 5
Files Modified: 3
Files Created: 2
Files Deleted: 0
Lines Added: 127
Lines Removed: 12

⚡ Performance:
Execution Time: 45230ms
Success Rate: 100%
Average Response Time: 1250ms

🧹 Cleanup completed
✨ Example execution finished successfully!
```

## 🛡️ Error Handling

### Circuit Breaker Protection

The integration includes automatic circuit breaker protection:

- **Failure Threshold**: 5 consecutive failures
- **Recovery Timeout**: 60 seconds
- **Automatic Recovery**: Gradual recovery with half-open state

### Error Recovery

```javascript
try {
  const result = await integration.executeTask(task);
} catch (error) {
  if (error.message.includes('Circuit breaker')) {
    console.log('AgentAPI temporarily unavailable, retrying later...');
    // Implement retry logic
  } else {
    console.error('Task execution failed:', error.message);
  }
}
```

## 🔧 Troubleshooting

### Common Issues

1. **AgentAPI Connection Failed**
   ```bash
   # Check if AgentAPI is running
   curl http://localhost:3284/health
   
   # Check configuration
   echo $AGENTAPI_URL
   ```

2. **Workspace Creation Failed**
   ```bash
   # Check permissions
   ls -la /tmp/workspace
   
   # Check disk space
   df -h /tmp
   ```

3. **Circuit Breaker Open**
   ```javascript
   // Reset circuit breaker
   client.resetCircuitBreaker();
   
   // Check status
   console.log(client.getCircuitBreakerStatus());
   ```

### Debug Mode

```javascript
// Enable debug logging
const integration = createAgentAPIIntegration({
  environment: 'development',
  debug: true
});
```

## 📈 Performance Optimization

### Best Practices

1. **Workspace Management**
   - Set appropriate cleanup intervals
   - Monitor disk usage
   - Limit concurrent workspaces

2. **Monitoring**
   - Adjust health check intervals based on load
   - Set realistic alert thresholds
   - Monitor circuit breaker status

3. **Error Handling**
   - Implement proper retry logic
   - Use fallback mechanisms
   - Monitor error rates

### Performance Metrics

- **Response Time**: < 5 seconds for simple operations
- **Throughput**: Support 10+ concurrent agent sessions
- **Reliability**: 99% success rate for agent communication
- **Recovery**: Automatic retry on transient failures

## 🔗 Dependencies

- **Parent Issue**: ZAM-596 (Main CI/CD Epic)
- **Database**: ZAM-604 (Database schema for execution tracking)
- **AgentAPI**: External service running on WSL2
- **Claude Code**: Installed and configured on WSL2 instance

## 📋 API Reference

### AgentAPIClient

```javascript
class AgentAPIClient {
  constructor(config)
  async sendMessage(content, type = 'user')
  async getMessages()
  async getStatus()
  async waitForCompletion(timeoutMs = 300000)
  async clearMessages()
  async getHealth()
  getCircuitBreakerStatus()
  resetCircuitBreaker()
}
```

### ClaudeCodeExecutor

```javascript
class ClaudeCodeExecutor {
  constructor(config)
  async executeTask(task, executionId)
  generatePrompt(task)
  async prepareWorkspace(task)
  parseResults(messages)
  extractModifiedFiles(messages)
  extractErrors(messages)
  extractCommands(messages)
  getStatistics()
  async cleanupWorkspace(taskId)
}
```

### WorkspaceManager

```javascript
class WorkspaceManager {
  constructor(config)
  async createWorkspace(taskId, options = {})
  getWorkspace(taskId)
  touchWorkspace(taskId)
  async cloneRepository(workspace, repository, branch = 'main')
  async setupEnvironment(workspace, environment)
  async cleanupWorkspace(taskId)
  async getStatistics()
  async cleanupAll()
  stop()
}
```

### AgentMonitor

```javascript
class AgentMonitor extends EventEmitter {
  constructor(config)
  start()
  stop()
  async performHealthCheck()
  recordTaskExecution(duration, success = true)
  getMetrics()
  resetMetrics()
  getStatus()
}
```

## 🤝 Contributing

1. Follow the existing code patterns and conventions
2. Add comprehensive tests for new features
3. Update documentation for any API changes
4. Ensure all examples work correctly
5. Test error handling scenarios

## 📄 License

This integration is part of the claude-task-master project and follows the same licensing terms.

---

For more information, see the [main project documentation](../../README.md) or check out the [examples](./examples/agentapi_integration_example.js).

