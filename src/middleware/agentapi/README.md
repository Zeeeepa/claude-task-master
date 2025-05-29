# AgentAPI Middleware

HTTP API bridge between Task Master orchestrator and Claude Code instances through AgentAPI middleware.

## Overview

The AgentAPI Middleware provides a comprehensive HTTP API layer that enables seamless communication between the Task Master orchestrator and Claude Code instances. It includes WebSocket support for real-time communication, message queuing, session management, and robust error handling.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Task Master   │◄──►│  AgentAPI Server │◄──►│   Claude Code   │
│  Orchestrator   │    │                  │    │   Instances     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Message Queue   │
                    │  & Processing    │
                    └──────────────────┘
```

## Components

### 1. AgentAPI Server (`server.js`)
- Express.js HTTP server with CORS support
- RESTful API endpoints for agent communication
- WebSocket support for real-time updates
- Request/response logging and monitoring
- Rate limiting and security middleware

### 2. Claude Interface (`claude-interface.js`)
- HTTP client for Claude Code API calls
- Message formatting and parsing
- Error handling and retry logic with exponential backoff
- Session state management
- Health monitoring

### 3. Message Handler (`message-handler.js`)
- Message queue management and routing
- Message dispatching with priority support
- Message persistence and recovery
- Event-driven architecture

### 4. Session Manager (`session-manager.js`)
- Claude Code session lifecycle management
- Session state persistence
- Session timeout handling
- Multi-session coordination

### 5. AgentAPI Client (`client.js`)
- HTTP client for AgentAPI communication
- Connection pooling and management
- Error recovery and fallback mechanisms
- WebSocket and SSE support

### 6. Message Queue (`queue.js`)
- Priority-based message queuing
- Dead letter queue handling
- Message persistence options
- Retry logic with exponential backoff

### 7. Message Processor (`processor.js`)
- Asynchronous message processing
- Batch processing capabilities
- Processing status tracking
- Configurable concurrency

## API Endpoints

### Core Communication Endpoints

```javascript
POST   /api/agents/claude/message      // Send message to Claude Code
GET    /api/agents/claude/messages     // Get conversation history
GET    /api/agents/claude/status       // Get agent status
GET    /api/agents/claude/events       // SSE stream of events
POST   /api/agents/claude/session      // Create new session
DELETE /api/agents/claude/session/:id  // End session
```

### Task Management Endpoints

```javascript
POST /api/tasks/create              // Create new task
PUT  /api/tasks/:id/assign          // Assign task to agent
GET  /api/tasks/:id/status          // Get task status
POST /api/tasks/:id/complete        // Mark task complete
```

### Health and Documentation

```javascript
GET /health      // Health check endpoint
GET /api/docs    // API documentation
```

## Configuration

### Environment Variables

```bash
# Server Configuration
AGENTAPI_PORT=3284
AGENTAPI_HOST=localhost
AGENTAPI_CORS_ORIGIN=*

# Claude Code Configuration
CLAUDE_CODE_API_URL=http://localhost:8080
CLAUDE_CODE_API_KEY=your_api_key_here
CLAUDE_CODE_TIMEOUT=30000
CLAUDE_CODE_RETRY_ATTEMPTS=3
CLAUDE_CODE_RETRY_DELAY=1000

# Session Configuration
SESSION_DEFAULT_TIMEOUT=3600000
SESSION_MAX_SESSIONS=100
SESSION_CLEANUP_INTERVAL=300000
SESSION_PERSISTENCE_ENABLED=false
SESSION_PERSISTENCE_PATH=./sessions.json

# Queue Configuration
QUEUE_MAX_SIZE=10000
QUEUE_MAX_RETRIES=3
QUEUE_RETRY_DELAY=1000
QUEUE_DEAD_LETTER_ENABLED=true
QUEUE_PERSISTENCE_ENABLED=false
QUEUE_PERSISTENCE_PATH=./queue.json
QUEUE_PROCESSING_TIMEOUT=60000

# Processor Configuration
PROCESSOR_CONCURRENCY=5
PROCESSOR_BATCH_SIZE=1
PROCESSOR_BATCH_TIMEOUT=5000
PROCESSOR_PROCESSING_TIMEOUT=60000
PROCESSOR_RETRY_DELAY=1000
PROCESSOR_MAX_RETRIES=3

# Message Handler Configuration
MESSAGE_HANDLER_MAX_RETRIES=3
MESSAGE_HANDLER_RETRY_DELAY=1000
MESSAGE_HANDLER_MESSAGE_TIMEOUT=30000
```

## Usage Examples

### Starting the Server

```javascript
import { AgentAPIServer } from './src/middleware/agentapi/index.js';
import { mergeConfig } from './src/middleware/agentapi/config.js';

const config = mergeConfig({
  server: { port: 3284 },
  claude: { baseURL: 'http://localhost:8080' }
});

const server = new AgentAPIServer(config);
await server.start();
```

### Using the Client

```javascript
import { AgentAPIClient } from './src/middleware/agentapi/index.js';

const client = new AgentAPIClient({
  baseURL: 'http://localhost:3284'
});

// Create session
const session = await client.createSession();

// Send message
const response = await client.sendMessage(
  'Hello, Claude!',
  session.session.id
);

// Get messages
const messages = await client.getMessages(session.session.id);
```

### WebSocket Connection

```javascript
const client = new AgentAPIClient({
  baseURL: 'http://localhost:3284'
});

const ws = client.createWebSocket(sessionId);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Send message via WebSocket
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello via WebSocket!'
}));
```

### Server-Sent Events

```javascript
const eventSource = client.subscribeToEvents(
  sessionId,
  (event) => console.log('Event:', event),
  (error) => console.error('Error:', error)
);
```

## Message Flow

1. **Message Submission**: Client submits message via HTTP POST or WebSocket
2. **Queue Processing**: Message is added to priority queue
3. **Session Management**: Session is created/validated
4. **Claude Communication**: Message is sent to Claude Code via HTTP
5. **Response Handling**: Response is processed and returned to client
6. **Event Broadcasting**: Events are broadcast via WebSocket/SSE

## Error Handling

- **Retry Logic**: Automatic retry with exponential backoff
- **Dead Letter Queue**: Failed messages after max retries
- **Circuit Breaker**: Prevents cascade failures
- **Health Monitoring**: Continuous health checks
- **Graceful Degradation**: Fallback mechanisms

## Security Features

- **CORS Configuration**: Configurable cross-origin policies
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Request Validation**: Input sanitization and validation
- **Authentication**: Bearer token support
- **Security Headers**: Helmet.js security middleware

## Monitoring and Logging

- **Request Logging**: Comprehensive request/response logging
- **Performance Metrics**: Processing time tracking
- **Health Checks**: Regular health monitoring
- **Statistics**: Queue, session, and processing statistics
- **Event Emission**: Real-time event broadcasting

## Testing

Run the example to test all components:

```bash
node src/middleware/agentapi/example.js
```

This will:
1. Start the AgentAPI server
2. Test client operations
3. Demonstrate WebSocket communication
4. Show Server-Sent Events
5. Clean up resources

## Dependencies

- `express` - HTTP server framework
- `ws` - WebSocket support
- `axios` - HTTP client
- `cors` - CORS middleware
- `helmet` - Security middleware
- `uuid` - UUID generation

## Performance Considerations

- **Connection Pooling**: Efficient HTTP connection management
- **Message Batching**: Optional batch processing for high throughput
- **Concurrency Control**: Configurable processing concurrency
- **Memory Management**: Automatic cleanup of expired sessions/messages
- **Persistence Options**: Optional disk persistence for reliability

## Deployment

The AgentAPI middleware is designed to run as part of the Task Master system but can also be deployed as a standalone service for microservice architectures.

### Standalone Deployment

```bash
# Install dependencies
npm install

# Set environment variables
export AGENTAPI_PORT=3284
export CLAUDE_CODE_API_URL=http://your-claude-instance:8080

# Start server
node -e "
import('./src/middleware/agentapi/index.js').then(({ AgentAPIServer }) => {
  const server = new AgentAPIServer();
  server.start();
});
"
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3284
CMD ["node", "src/middleware/agentapi/example.js"]
```

## Contributing

When contributing to the AgentAPI middleware:

1. Follow the existing code structure and patterns
2. Add comprehensive error handling
3. Include logging for debugging
4. Write tests for new functionality
5. Update documentation for API changes
6. Consider performance implications

## License

This middleware is part of the Task Master project and follows the same licensing terms.

