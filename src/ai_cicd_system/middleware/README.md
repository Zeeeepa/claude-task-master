# AgentAPI Middleware

The AgentAPI Middleware is a comprehensive communication bridge between the System Orchestrator and Claude Code, enabling seamless integration with the [AgentAPI project](https://github.com/Zeeeepa/agentapi) for enhanced AI-driven development workflows.

## 🎯 Overview

This middleware provides:

- **Seamless Communication**: Bridge between different AI systems and protocols
- **Request Transformation**: Intelligent protocol adaptation and message transformation
- **Session Management**: Context preservation across multiple interactions
- **Real-time Communication**: WebSocket and HTTP support for different use cases
- **Asynchronous Processing**: Message queuing and concurrent request handling
- **Protocol Adaptation**: Support for multiple communication protocols

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ System          │    │ AgentAPI         │    │ Claude Code     │
│ Orchestrator    │◄──►│ Middleware       │◄──►│ Integration     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Communication    │
                    │ Clients          │
                    │ • HTTP Client    │
                    │ • WebSocket      │
                    │ • Event Stream   │
                    └──────────────────┘
```

## 📁 Components

### Core Middleware

- **`agent_api_middleware.js`** - Main middleware orchestrator
- **`request_transformer.js`** - Protocol transformation engine
- **`session_manager.js`** - Session lifecycle management
- **`protocol_adapter.js`** - Protocol adaptation layer
- **`message_queue.js`** - Asynchronous message processing

### Communication Clients

- **`http_client.js`** - HTTP/REST communication
- **`websocket_client.js`** - Real-time WebSocket communication
- **`event_stream.js`** - Server-sent events handling

### Protocol Implementations

- **`agent_protocol.js`** - AgentAPI protocol specifics
- **`claude_code_protocol.js`** - Claude Code protocol adapter
- **`unified_protocol.js`** - Unified protocol bridge

## 🚀 Quick Start

### Basic Usage

```javascript
import { AgentAPIMiddleware } from './middleware/agent_api_middleware.js';

// Initialize middleware
const middleware = new AgentAPIMiddleware({
  agentApiUrl: 'http://localhost:8000',
  apiKey: process.env.AGENT_API_KEY,
  enableWebSocket: true,
  maxConcurrentRequests: 10
});

await middleware.initialize();

// Process a task
const task = {
  id: 'task-001',
  title: 'Create user authentication',
  description: 'Implement secure user auth with JWT',
  requirements: ['Use bcrypt', 'JWT tokens', 'Rate limiting']
};

const result = await middleware.processTaskRequest(task, {
  repository: { name: 'my-app', branch: 'main' },
  project: { language: 'javascript', framework: 'express' }
});

console.log('Claude Code request:', result);
```

### Advanced Configuration

```javascript
const middleware = new AgentAPIMiddleware({
  // Connection settings
  agentApiUrl: 'wss://api.example.com',
  apiKey: process.env.AGENT_API_KEY,
  timeout: 120000,
  retryAttempts: 3,
  
  // Communication options
  enableWebSocket: true,
  enableStreaming: true,
  heartbeatInterval: 30000,
  
  // Performance settings
  maxConcurrentRequests: 20,
  maxSessionAge: 3600000, // 1 hour
  maxActiveSessions: 100,
  
  // Message queue settings
  maxQueueSize: 1000,
  processingIntervalMs: 100,
  maxRetries: 3
});
```

## 🔄 Protocol Transformation

The middleware supports intelligent transformation between different protocols:

```javascript
import { UnifiedProtocol } from './protocols/unified_protocol.js';

const protocol = new UnifiedProtocol();

// Transform AgentAPI message to Claude Code format
const claudeCodeRequest = await protocol.transformMessage(
  agentApiMessage,
  'agentapi',
  'claude_code',
  { requestId: 'transform-123' }
);

// Transform Claude Code response back to AgentAPI
const agentUpdate = await protocol.transformMessage(
  claudeCodeResponse,
  'claude_code',
  'agentapi',
  { sessionId: 'session-456' }
);
```

## 📡 Communication Clients

### HTTP Client

```javascript
import { HTTPClient } from './communication/http_client.js';

const httpClient = new HTTPClient({
  agentApiUrl: 'http://localhost:8000',
  apiKey: 'your-api-key',
  timeout: 30000,
  retryAttempts: 3
});

await httpClient.initialize();

// Send request
const response = await httpClient.send({
  type: 'code_generation_request',
  payload: { /* request data */ }
});
```

### WebSocket Client

```javascript
import { WebSocketClient } from './communication/websocket_client.js';

const wsClient = new WebSocketClient({
  agentApiUrl: 'ws://localhost:8000',
  reconnectAttempts: 5,
  heartbeatInterval: 30000
});

await wsClient.initialize();

// Set up event handlers
wsClient.on('connected', () => console.log('Connected'));
wsClient.on('notification', (data) => console.log('Notification:', data));

// Send message
const response = await wsClient.send({
  type: 'task_request',
  payload: { /* message data */ }
});
```

## 🗄️ Session Management

Sessions preserve context across multiple interactions:

```javascript
import { SessionManager } from './middleware/session_manager.js';

const sessionManager = new SessionManager({
  maxSessionAge: 3600000, // 1 hour
  maxActiveSessions: 100
});

await sessionManager.initialize();

// Create or get session
const session = await sessionManager.getOrCreateSession(task, context);

// Update session with new data
await sessionManager.updateSession(session.id, {
  lastRequest: request,
  lastResponse: response
});
```

## 📬 Message Queue

Asynchronous message processing with different priority levels:

```javascript
import { MessageQueue } from './middleware/message_queue.js';

const messageQueue = new MessageQueue({
  maxQueueSize: 1000,
  processingIntervalMs: 100,
  maxRetries: 3
});

await messageQueue.initialize();

// Register message processor
messageQueue.registerProcessor('high_priority', async (message) => {
  // Process high priority message
  console.log('Processing:', message);
});

// Enqueue message
await messageQueue.enqueue('high_priority', {
  type: 'urgent_task',
  data: { /* message data */ }
}, {
  priority: 'high',
  maxRetries: 5
});
```

## 🧪 Testing

Run the test suite:

```bash
# Run all middleware tests
npm test src/ai_cicd_system/tests/

# Run specific test files
npm test src/ai_cicd_system/tests/agent_api_middleware.test.js
npm test src/ai_cicd_system/tests/protocol_adapter.test.js
npm test src/ai_cicd_system/tests/communication.test.js
```

## 📊 Monitoring and Health

### Get Statistics

```javascript
// Middleware statistics
const stats = middleware.getStatistics();
console.log('Active requests:', stats.active_requests);
console.log('Success rate:', stats.success_rate);

// Component-specific statistics
const sessionStats = sessionManager.getStatistics();
const queueStats = messageQueue.getAllStats();
```

### Health Checks

```javascript
// Overall health
const health = middleware.getHealth();
console.log('Status:', health.status);
console.log('Components:', health.components);

// Component health
const sessionHealth = sessionManager.getHealth();
const clientHealth = httpClient.getHealth();
```

## 🎮 Examples

Run the provided examples:

```bash
# Basic middleware usage
npm run agentapi:basic

# Advanced WebSocket usage
npm run agentapi:advanced

# Protocol transformation examples
npm run agentapi:protocols

# All examples
npm run agentapi:demo
```

## 🔧 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentApiUrl` | string | `'http://localhost:8000'` | AgentAPI server URL |
| `apiKey` | string | `process.env.AGENT_API_KEY` | API authentication key |
| `timeout` | number | `120000` | Request timeout in milliseconds |
| `retryAttempts` | number | `3` | Number of retry attempts |
| `enableWebSocket` | boolean | `true` | Enable WebSocket communication |
| `enableStreaming` | boolean | `true` | Enable streaming responses |
| `maxConcurrentRequests` | number | `10` | Maximum concurrent requests |
| `maxSessionAge` | number | `3600000` | Session expiration time |
| `maxActiveSessions` | number | `100` | Maximum active sessions |
| `heartbeatInterval` | number | `30000` | WebSocket heartbeat interval |
| `reconnectAttempts` | number | `5` | WebSocket reconnection attempts |

## 🔗 Integration

### With System Orchestrator

```javascript
import { EnhancedAICICDSystem } from '../index.js';

const system = new EnhancedAICICDSystem({
  enableAgentAPI: true,
  agentApiUrl: 'http://localhost:8000',
  agentApiKey: process.env.AGENT_API_KEY
});

await system.initialize();

const result = await system.processTask(task, context);
```

### With Existing Workflows

```javascript
// Integrate with existing workflow
const workflowResult = await orchestrator.completeWorkflow(workflowId, {
  task,
  context,
  middlewareResult: await middleware.processTaskRequest(task, context)
});
```

## 🚨 Error Handling

The middleware provides comprehensive error handling:

```javascript
try {
  const result = await middleware.processTaskRequest(task, context);
} catch (error) {
  if (error.message.includes('Maximum concurrent requests')) {
    // Handle rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Retry request
  } else if (error.message.includes('timeout')) {
    // Handle timeout
    console.log('Request timed out, retrying with longer timeout');
  } else {
    // Handle other errors
    console.error('Processing failed:', error.message);
  }
}
```

## 🔄 Lifecycle Management

```javascript
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down middleware...');
  await middleware.shutdown();
  process.exit(0);
});

// Health monitoring
setInterval(async () => {
  const health = middleware.getHealth();
  if (health.status !== 'healthy') {
    console.warn('Middleware health degraded:', health);
  }
}, 30000);
```

## 📚 API Reference

For detailed API documentation, see the individual component files:

- [AgentAPIMiddleware](./agent_api_middleware.js)
- [RequestTransformer](./request_transformer.js)
- [SessionManager](./session_manager.js)
- [ProtocolAdapter](./protocol_adapter.js)
- [MessageQueue](./message_queue.js)

## 🤝 Contributing

When contributing to the AgentAPI middleware:

1. Follow the existing code style and patterns
2. Add comprehensive tests for new functionality
3. Update documentation for API changes
4. Ensure all tests pass before submitting
5. Consider backward compatibility

## 📄 License

This middleware is part of the Claude Task Master project and follows the same licensing terms.

