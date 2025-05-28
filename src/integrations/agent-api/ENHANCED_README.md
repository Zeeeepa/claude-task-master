# 🌐 Enhanced AgentAPI Middleware Integration Layer

A comprehensive integration layer between claude-task-master and agentapi middleware, enabling seamless AI agent communication, session management, and real-time status monitoring for CI/CD workflows.

## 🎯 Features

### Core Components

- **🔧 Enhanced Middleware Client**: Central orchestration hub with WebSocket support
- **🤖 Agent Pool Manager**: Multi-agent management with load balancing
- **📋 Session Manager**: Lifecycle management and state tracking
- **💊 Health Monitor**: Real-time agent health checks and alerting
- **📨 Message Queue**: Asynchronous processing with retry logic
- **📊 Metrics Collector**: Performance tracking and analytics

### Agent-Specific Adapters

- **🧠 Claude Code Adapter**: Tool execution and code assistance
- **🦆 Goose Adapter**: Plan-based development workflows
- **✏️ Aider Adapter**: File-based code editing and commits
- **💻 Codex Adapter**: Code completion and generation

### Advanced Features

- **🔄 Real-time WebSocket Communication**: Bidirectional agent communication
- **⚖️ Load Balancing**: Round-robin, least-loaded, and random strategies
- **🔍 Health Monitoring**: Automated health checks with alerting
- **📈 Performance Metrics**: Response times, success rates, and usage analytics
- **🛡️ Error Recovery**: Automatic retry logic and failover mechanisms
- **⚙️ Configuration Management**: Centralized agent configuration
- **📊 Real-time Dashboard**: Web-based monitoring interface

## 🚀 Quick Start

### Basic Usage

```javascript
import { initializeAgentAPISystem } from './src/integrations/agent-api/index.js';

// Initialize the complete system
const system = await initializeAgentAPISystem({
  baseUrl: 'http://localhost:3284',
  enableMetrics: true,
  enableHealthChecks: true
});

// Create a session
const session = await system.createSession('claude', {
  model: 'claude-3-5-sonnet-20241022',
  allowedTools: ['Bash', 'Edit', 'Replace']
});

// Send a message
const response = await system.sendMessage(session.id, 
  'Create a simple REST API with Express.js'
);

console.log('Response:', response.content);

// Get system metrics
const metrics = await system.getMetrics();
console.log('Metrics:', metrics);

// Cleanup
await system.shutdown();
```

### Enhanced Client Usage

```javascript
import { EnhancedMiddlewareClient } from './src/integrations/agent-api/enhanced_middleware_client.js';

const client = new EnhancedMiddlewareClient({
  baseUrl: 'http://localhost:3284',
  wsUrl: 'ws://localhost:3284/ws',
  maxConcurrentSessions: 10,
  enableMetrics: true,
  enableHealthChecks: true
});

// Initialize with event listeners
client.on('sessionCreated', (session) => {
  console.log(`Session created: ${session.id}`);
});

client.on('agentUnhealthy', (data) => {
  console.log(`Agent ${data.agentType} is unhealthy`);
});

await client.initialize();
```

### Agent-Specific Adapters

```javascript
import { ClaudeCodeAdapter, AiderAdapter } from './src/integrations/agent-api/index.js';

// Claude Code for tool execution
const claude = new ClaudeCodeAdapter({
  baseUrl: 'http://localhost:3284',
  allowedTools: ['Bash', 'Edit', 'Replace', 'Create']
});

await claude.initialize();
const session = await claude.createSession();

// Execute tools
await claude.executeTool(session.id, 'Bash', { command: 'ls -la' });
await claude.executeTool(session.id, 'Create', { 
  file: 'app.js', 
  content: 'console.log("Hello World");' 
});

// Aider for file-based editing
const aider = new AiderAdapter({
  baseUrl: 'http://localhost:3284',
  autoCommit: true,
  showDiffs: true
});

await aider.initialize();
const aiderSession = await aider.createSession();

// Add files and request changes
await aider.addFiles(aiderSession.id, ['src/index.js', 'package.json']);
await aider.requestCodeChanges(aiderSession.id, 
  'Add error handling middleware to the Express app'
);
```

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Claude-Task-   │    │   Enhanced      │    │    AgentAPI     │
│     Master      │◄──►│   Middleware    │◄──►│   (Go Server)   │
│                 │    │     Client      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Agent Pool     │
                       │   Manager       │
                       └─────────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │   Claude    │ │    Goose    │ │    Aider    │
            │    Code     │ │             │ │             │
            └─────────────┘ └─────────────┘ └─────────────┘
```

### Component Interaction

```
EnhancedMiddlewareClient
├── AgentPoolManager (manages agent instances)
├── SessionManager (tracks session lifecycle)
├── HealthMonitor (monitors agent health)
├── MessageQueue (handles async processing)
├── MetricsCollector (tracks performance)
└── Agent Adapters
    ├── ClaudeCodeAdapter
    ├── GooseAdapter
    ├── AiderAdapter
    └── CodexAdapter
```

## 📊 Monitoring & Metrics

### Real-time Dashboard

Open `dashboards/agent_status_dashboard.html` in your browser for a real-time monitoring interface featuring:

- **System Overview**: Active sessions, message throughput, response times
- **Agent Status**: Individual agent health and performance metrics
- **Alerts**: Real-time notifications for system issues
- **Performance Charts**: Historical data visualization

### Metrics Collection

```javascript
const metrics = await client.getMetrics();

console.log('System Metrics:', {
  agents: metrics.agents,           // Agent pool status
  sessions: metrics.sessions,       // Session statistics
  messages: metrics.messages,       // Message processing stats
  health: metrics.health,          // Health check results
  performance: metrics.performance  // Performance indicators
});
```

### Health Monitoring

```javascript
// Get health status for all agents
const healthStatus = await client.getAgentStatus();

// Get health status for specific agent
const claudeHealth = await client.getAgentStatus('claude');

// Monitor health events
client.on('agentHealthy', (data) => {
  console.log(`✅ ${data.agentType} is healthy`);
});

client.on('agentDown', (agentType) => {
  console.log(`❌ ${agentType} is down`);
});
```

## ⚙️ Configuration

### Environment Configuration

```javascript
// config/agent_config.js
export const config = {
  global: {
    agentApiUrl: 'http://localhost:3284',
    timeout: 30000,
    retryAttempts: 3,
    maxConcurrentSessions: 10,
    enableMetrics: true,
    enableHealthChecks: true
  },
  agents: {
    claude: {
      enabled: true,
      maxSessions: 3,
      model: 'claude-3-5-sonnet-20241022',
      allowedTools: ['Bash', 'Edit', 'Replace', 'Create']
    },
    goose: {
      enabled: true,
      maxSessions: 3,
      provider: 'anthropic',
      toolkits: ['developer', 'screen']
    },
    aider: {
      enabled: true,
      maxSessions: 3,
      autoCommit: true,
      showDiffs: true
    },
    codex: {
      enabled: true,
      maxSessions: 3,
      model: 'gpt-4',
      completionMode: 'code'
    }
  }
};
```

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
LOG_LEVEL=info

# Agent-specific settings
CLAUDE_MODEL=claude-3-5-sonnet-20241022
GOOSE_PROVIDER=anthropic
AIDER_AUTO_COMMIT=true
CODEX_MODEL=gpt-4
```

## 🔧 Advanced Usage

### Multi-Agent Orchestration

```javascript
// Create multiple agent sessions
const sessions = await Promise.all([
  client.createSession('claude', { systemPrompt: 'You are a senior architect.' }),
  client.createSession('goose', { planMode: 'auto' }),
  client.createSession('aider', { autoCommit: false }),
  client.createSession('codex', { language: 'javascript' })
]);

// Orchestrate complex workflow
const task = 'Create a microservice with authentication';

// 1. Architecture planning with Claude
const architecture = await client.sendMessage(sessions[0].id, 
  `Design architecture for: ${task}`
);

// 2. Implementation plan with Goose
const plan = await client.sendMessage(sessions[1].id, 
  `Create implementation plan: ${architecture.content}`
);

// 3. Code generation with Aider
const code = await client.sendMessage(sessions[2].id, 
  `Implement: ${plan.content}`
);

// 4. Utilities with Codex
const utils = await client.sendMessage(sessions[3].id, 
  'Generate utility functions for authentication middleware'
);
```

### Custom Event Handling

```javascript
client.on('sessionCreated', (session) => {
  console.log(`🆕 Session ${session.id} created for ${session.agentType}`);
});

client.on('messageProcessed', (data) => {
  console.log(`📤 Message processed in ${data.responseTime}ms`);
});

client.on('sessionTimeout', (sessionId) => {
  console.log(`⏰ Session ${sessionId} timed out`);
});

client.on('healthCheck', (status) => {
  if (status.overall.status !== 'healthy') {
    console.log(`⚠️ System health degraded: ${status.overall.score}`);
  }
});
```

### Error Handling and Recovery

```javascript
// Configure retry logic
const client = new EnhancedMiddlewareClient({
  retryAttempts: 5,
  retryDelay: 2000,
  timeout: 45000
});

// Handle connection failures
client.on('disconnected', () => {
  console.log('🔌 Connection lost, attempting to reconnect...');
});

client.on('reconnectionFailed', () => {
  console.log('❌ Failed to reconnect after maximum attempts');
});

// Graceful error handling
try {
  const response = await client.sendMessage(sessionId, message);
} catch (error) {
  if (error.message.includes('Session not found')) {
    // Recreate session
    const newSession = await client.createSession(agentType);
    const response = await client.sendMessage(newSession.id, message);
  } else {
    console.error('Unrecoverable error:', error);
  }
}
```

## 🧪 Testing

### Running Examples

```bash
# Run all integration examples
node src/integrations/agent-api/integration_example.js

# Run specific examples
node -e "
import { basicExample } from './src/integrations/agent-api/integration_example.js';
await basicExample();
"
```

### Load Testing

```javascript
// Create multiple concurrent sessions
const sessions = [];
for (let i = 0; i < 10; i++) {
  sessions.push(await client.createSession('claude'));
}

// Send concurrent messages
const promises = sessions.map(session => 
  client.sendMessage(session.id, `Test message ${session.id}`)
);

const responses = await Promise.all(promises);
console.log(`Processed ${responses.length} concurrent messages`);
```

## 🔒 Security Considerations

- **Authentication**: Secure API key management for agent access
- **Authorization**: Role-based access control for agent operations
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Input Validation**: Comprehensive input sanitization
- **Audit Logging**: Complete audit trail of all operations

## 🚀 Performance Optimization

### Connection Pooling

```javascript
const client = new EnhancedMiddlewareClient({
  maxConcurrentSessions: 20,
  connectionPoolSize: 5,
  keepAliveTimeout: 30000
});
```

### Caching

```javascript
// Enable response caching
const client = new EnhancedMiddlewareClient({
  enableCaching: true,
  cacheTimeout: 300000, // 5 minutes
  maxCacheSize: 1000
});
```

### Load Balancing Strategies

```javascript
const agentPool = new AgentPoolManager({
  loadBalancingStrategy: 'least-loaded', // or 'round-robin', 'random'
  maxAgentsPerType: 5,
  healthCheckInterval: 30000
});
```

## 📚 API Reference

### EnhancedMiddlewareClient

#### Methods

- `initialize()`: Initialize the client and establish connections
- `createSession(agentType, options)`: Create a new agent session
- `sendMessage(sessionId, message, options)`: Send message to agent
- `closeSession(sessionId)`: Close an agent session
- `getMetrics()`: Get comprehensive system metrics
- `getAgentStatus(agentType)`: Get agent health status
- `shutdown()`: Gracefully shutdown the client

#### Events

- `initialized`: Client initialization complete
- `sessionCreated`: New session created
- `sessionClosed`: Session closed
- `messageProcessed`: Message successfully processed
- `agentHealthy`: Agent health restored
- `agentUnhealthy`: Agent health degraded
- `healthCheck`: Health check completed

### Agent Adapters

Each adapter provides specialized methods for their respective agents:

#### ClaudeCodeAdapter
- `executeTool(sessionId, toolName, args)`: Execute specific tools
- `getSessionStatus(sessionId)`: Get detailed session status

#### GooseAdapter
- `executePlan(sessionId, planDescription)`: Execute development plans
- `useToolkit(sessionId, toolkitName, action)`: Use specific toolkits
- `getPlanStatus(sessionId)`: Get plan execution status

#### AiderAdapter
- `addFiles(sessionId, files)`: Add files to session
- `requestCodeChanges(sessionId, description)`: Request code modifications
- `commitChanges(sessionId, message)`: Commit changes to git

#### CodexAdapter
- `generateCompletion(sessionId, prompt)`: Generate code completions
- `explainCode(sessionId, code)`: Get code explanations
- `generateCodeFromDescription(sessionId, description)`: Generate code from natural language

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add comprehensive tests
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- 📧 Email: support@claude-task-master.com
- 💬 Discord: [Join our community](https://discord.gg/claude-task-master)
- 📖 Documentation: [Full documentation](https://docs.claude-task-master.com)
- 🐛 Issues: [GitHub Issues](https://github.com/Zeeeepa/claude-task-master/issues)

---

**Built with ❤️ for the AI development community**

