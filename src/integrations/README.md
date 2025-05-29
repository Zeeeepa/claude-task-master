# 🔗 Claude Code Integration

This directory contains the comprehensive Claude Code integration for the claude-task-master system, providing seamless communication with Claude Code via AgentAPI middleware for automated task execution and code generation.

## 🎯 Overview

The Claude Code integration provides a robust, production-ready system for:

- **AgentAPI Communication**: Reliable HTTP communication with Claude Code instances
- **Task Execution**: Automated code generation and modification workflows  
- **Workspace Management**: WSL2 environment setup and management
- **Authentication**: Secure API key and JWT token management
- **Real-time Updates**: Server-Sent Events for live status monitoring
- **Error Handling**: Comprehensive error recovery with circuit breaker protection

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Claude Code Integration                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  AgentAPI       │◄──►│  Claude Code    │◄──►│  Workspace      │         │
│  │  Client         │    │  Executor       │    │  Manager        │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Auth           │    │  Result         │    │  File           │         │
│  │  Manager        │    │  Parser         │    │  Tracker        │         │
│  │                 │    │                 │    │                 │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   ▼                                         │
│                          ┌─────────────────┐                                │
│                          │  Integration    │                                │
│                          │  Orchestrator   │                                │
│                          │                 │                                │
│                          └─────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
src/integrations/
├── agentapi/
│   ├── client.js              # AgentAPI HTTP client with SSE support
│   └── auth_manager.js        # Authentication and authorization
├── claude_code/
│   └── executor.js            # Task execution logic for Claude Code
├── workspace_manager.js       # WSL2 workspace management
├── index.js                   # Main integration entry point
├── examples/
│   └── integration_example.js # Comprehensive usage examples
├── tests/
│   └── integration.test.js    # Test suite
└── README.md                  # This file
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { createClaudeCodeIntegration } from './src/integrations/index.js';

// Create integration instance
const integration = createClaudeCodeIntegration({
  environment: 'development'
});

// Initialize
await integration.initialize();

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
const result = await integration.executeTask(task, {
  waitForCompletion: true,
  createWorkspace: true,
  repository: 'https://github.com/example/project.git',
  branch: 'main'
});

console.log('Task completed:', result.results.summary);
```

### Using Individual Components

```javascript
import { 
  AgentAPIClient, 
  ClaudeCodeExecutor, 
  WorkspaceManager,
  AuthManager 
} from './src/integrations/index.js';

// Initialize components
const agentAPI = new AgentAPIClient({
  baseURL: 'http://localhost:3284',
  timeout: 30000
});

const executor = new ClaudeCodeExecutor({
  agentAPI: { baseURL: 'http://localhost:3284' }
});

const workspaceManager = new WorkspaceManager({
  basePath: '/tmp/workspace',
  maxConcurrent: 10
});

// Execute task
await executor.initialize();
const result = await executor.executeTask(task, 'exec-123');
```

## 🔧 Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
AGENTAPI_TIMEOUT=30000
AGENTAPI_MAX_RETRIES=3
AGENTAPI_API_KEY=your-api-key

# Workspace Configuration
WORKSPACE_BASE_PATH=/tmp/workspace
WORKSPACE_MAX_CONCURRENT=10
WORKSPACE_CLEANUP_AFTER=3600000

# Claude Configuration
CLAUDE_MAX_TOKENS=4000
CLAUDE_TEMPERATURE=0.1
CLAUDE_ALLOWED_TOOLS=Bash(git*),Edit,Replace

# WSL2 Configuration
WSL2_DISTRIBUTION=Ubuntu-22.04
WSL2_USER=ubuntu

# Authentication Configuration
JWT_SECRET=your-jwt-secret
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

### Real-time Status

```javascript
// Get system status
const status = integration.getSystemStatus();
console.log('System Status:', status);

// Monitor events
integration.on('execution_started', (data) => {
  console.log(`🚀 Execution started: ${data.taskTitle}`);
});

integration.on('execution_completed', (data) => {
  console.log(`✅ Execution completed: ${data.taskTitle} in ${data.duration}ms`);
});

integration.on('execution_failed', (data) => {
  console.log(`❌ Execution failed: ${data.taskTitle} - ${data.error}`);
});

integration.on('workspace_created', (data) => {
  console.log(`🏗️ Workspace created: ${data.path}`);
});
```

### Performance Metrics

```javascript
// Get execution statistics
const executorStats = integration.executor.getExecutionStats();
console.log('Active Executions:', executorStats.activeExecutions);
console.log('Utilization Rate:', executorStats.utilizationRate);

// Get workspace statistics
const workspaceStats = await integration.workspaceManager.getStatistics();
console.log('Active Workspaces:', workspaceStats.activeWorkspaces);
console.log('Disk Usage:', workspaceStats.diskUsage);

// Get AgentAPI connection status
const connectionStatus = integration.agentAPIClient.getConnectionStatus();
console.log('Connected:', connectionStatus.connected);
console.log('Active Requests:', connectionStatus.activeRequests);
```

## 🏗️ Workspace Management

### Creating Workspaces

```javascript
// Create workspace with repository
const workspace = await integration.workspaceManager.createWorkspace('task-001', {
  repository: 'https://github.com/example/project.git',
  branch: 'main',
  environment: {
    variables: {
      NODE_ENV: 'development',
      API_KEY: 'test-key'
    },
    dependencies: {
      nodePackages: ['lodash', 'axios'],
      pythonPackages: ['requests', 'numpy'],
      systemPackages: ['git', 'curl']
    },
    setupCommands: [
      'npm install',
      'npm run build'
    ]
  }
});

console.log('Workspace created:', workspace.path);
```

### Executing Commands in Workspace

```javascript
// Execute commands in workspace
const result = await integration.workspaceManager.executeInWorkspace(
  'task-001',
  'npm test'
);

console.log('Command output:', result.stdout);
```

## 🔐 Authentication

### API Key Management

```javascript
import { AuthManager } from './src/integrations/index.js';

const authManager = new AuthManager();

// Generate API key
const apiKey = authManager.generateApiKey('user-123', {
  permissions: ['read', 'write'],
  description: 'User API key',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
});

console.log('API Key:', apiKey.key);

// Validate API key
const validation = await authManager.validateApiKey(apiKey.key);
console.log('Valid:', validation.isValid);
console.log('Permissions:', validation.permissions);
```

### JWT Token Management

```javascript
// Generate JWT token
const tokenResult = authManager.generateJWTToken('user-123', ['read', 'write']);
console.log('Token:', tokenResult.token);

// Validate JWT token
const tokenValidation = await authManager.validateJWTToken(tokenResult.token);
console.log('Token valid:', tokenValidation.isValid);
```

## 🧪 Testing

### Running Tests

```bash
# Run all integration tests
npm test src/integrations/

# Run specific test suites
npm test src/integrations/tests/integration.test.js

# Run with coverage
npm run test:coverage src/integrations/
```

### Example Tests

```javascript
import { ClaudeCodeIntegration } from './src/integrations/index.js';

describe('ClaudeCodeIntegration', () => {
  let integration;

  beforeEach(async () => {
    integration = new ClaudeCodeIntegration({
      environment: 'test'
    });
    await integration.initialize();
  });

  afterEach(async () => {
    await integration.shutdown();
  });

  it('should execute tasks successfully', async () => {
    const task = {
      title: 'Test task',
      description: 'Simple test task',
      type: 'test'
    };

    const result = await integration.executeTask(task, {
      waitForCompletion: true,
      createWorkspace: false
    });

    expect(result.completed).toBe(true);
    expect(result.results).toBeDefined();
  });
});
```

## 📚 Examples

### Complete Task Execution

```bash
# Run complete task execution example
node src/integrations/examples/integration_example.js
```

### Example Output

```
🚀 Starting Claude Code Integration Example
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
  } else if (error.message.includes('Workspace')) {
    console.log('Workspace error, cleaning up...');
    // Handle workspace errors
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

2. **WSL2 Not Available**
   ```bash
   # Check WSL2 status
   wsl --list --verbose
   
   # Install WSL2 if needed
   wsl --install
   ```

3. **Workspace Creation Failed**
   ```bash
   # Check permissions
   ls -la /tmp/workspace
   
   # Check disk space
   df -h /tmp
   ```

4. **Authentication Errors**
   ```bash
   # Check API key
   echo $AGENTAPI_API_KEY
   
   # Verify JWT secret
   echo $JWT_SECRET
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```javascript
const integration = new ClaudeCodeIntegration({
  ...config,
  logLevel: 'debug'
});
```

## 🚀 Production Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3002
CMD ["node", "src/integrations/index.js"]
```

### Environment Setup

```bash
# Production environment variables
export AGENTAPI_URL=https://agentapi.production.com
export WORKSPACE_BASE_PATH=/var/workspace
export WORKSPACE_MAX_CONCURRENT=50
export JWT_SECRET=production-jwt-secret
export AGENTAPI_API_KEY=production-api-key
```

## 🤝 Contributing

### Development Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Code Style

- Use ESLint configuration
- Follow existing patterns
- Add comprehensive tests
- Update documentation

## 📄 License

This Claude Code integration is part of the claude-task-master project and follows the same licensing terms.

## 🆘 Support

For issues and questions:
- Check troubleshooting guide
- Review logs and error messages
- Create GitHub issue with details
- Contact development team

