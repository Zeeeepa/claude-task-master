# AgentAPI Middleware

The AgentAPI middleware layer serves as the communication bridge between Task Master orchestrator and Claude Code instances. It provides a robust HTTP/WebSocket API for managing AI agent sessions and facilitating real-time communication.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Task Master   │    │  AgentAPI       │    │   Claude Code   │
│  Orchestrator   │◄──►│  Middleware     │◄──►│   Instances     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Session &     │
                       │ Message Storage │
                       └─────────────────┘
```

## Components

### 1. AgentAPI Server (`server.js`)
- **Express.js HTTP server** with WebSocket support
- **RESTful API endpoints** for session and message management
- **Real-time communication** via WebSocket and Server-Sent Events
- **Security middleware** including CORS, rate limiting, and request validation
- **Health monitoring** and status reporting

### 2. Claude Code Interface (`claude-interface.js`)
- **Process management** for Claude Code instances
- **Terminal emulation** with output parsing and cleaning
- **Message transformation** between API and terminal formats
- **Process health monitoring** and automatic recovery
- **Multi-session support** with process isolation

### 3. Message Handler (`message-handler.js`)
- **Message queuing system** with priority and retry logic
- **Format transformation** between API requests and terminal commands
- **Event streaming** via Server-Sent Events
- **Message persistence** and history management
- **Real-time message routing** and broadcasting

### 4. Session Manager (`session-manager.js`)
- **Session lifecycle management** with automatic cleanup
- **Client authentication** and access control
- **State persistence** with backup and recovery
- **Resource monitoring** and usage limits
- **Multi-client session support**

## API Endpoints

### Core Endpoints

#### `POST /message`
Send a message to Claude Code instance.

```json
{
  "sessionId": "session-uuid",
  "message": "Create a new React component",
  "options": {
    "type": "command",
    "priority": 1,
    "timeout": 30000
  }
}
```

#### `GET /messages/:sessionId`
Retrieve conversation history for a session.

Query parameters:
- `limit`: Number of messages to return (default: 50)
- `offset`: Pagination offset (default: 0)

#### `POST /attach`
Attach to an agent session (creates new session if none specified).

```json
{
  "clientId": "client-uuid",
  "sessionId": "session-uuid" // optional
}
```

#### `POST /detach`
Detach from an agent session.

```json
{
  "sessionId": "session-uuid",
  "clientId": "client-uuid"
}
```

#### `GET /status`
Get server and session status information.

#### `GET /health`
Health check endpoint for monitoring.

#### `GET /events/:sessionId`
Server-Sent Events stream for real-time updates.

### WebSocket API

Connect to `/` for WebSocket communication:

```javascript
const ws = new WebSocket('ws://localhost:3284');

// Attach to session
ws.send(JSON.stringify({
  type: 'attach'
}));

// Send message
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello Claude!',
  options: {}
}));

// Ping/pong for connection health
ws.send(JSON.stringify({
  type: 'ping'
}));
```

## Configuration

### Environment Variables

```bash
# Server Configuration
AGENTAPI_PORT=3284
AGENTAPI_HOST=localhost
AGENTAPI_SSL=false
AGENTAPI_SSL_CERT=/path/to/cert.pem
AGENTAPI_SSL_KEY=/path/to/key.pem

# Claude Code Configuration
CLAUDE_CODE_PATH=/usr/local/bin/claude
CLAUDE_ALLOWED_TOOLS=Bash(git*),Edit,Replace
CLAUDE_MAX_PROCESSES=5

# Session Configuration
AGENTAPI_MAX_SESSIONS=10
AGENTAPI_SESSION_TIMEOUT=3600000
AGENTAPI_STORAGE_TYPE=memory
AGENTAPI_STORAGE_FILE=./sessions.json

# Security Configuration
AGENTAPI_AUTH_TOKEN=your-secret-token
AGENTAPI_ENABLE_AUTH=false

# Logging Configuration
AGENTAPI_LOG_LEVEL=info
AGENTAPI_LOG_FILE=./agentapi.log
```

### Configuration File

Create `agentapi.config.json`:

```json
{
  "server": {
    "port": 3284,
    "host": "localhost",
    "ssl": false
  },
  "sessions": {
    "maxSessions": 10,
    "sessionTimeout": 3600000,
    "storageType": "file",
    "storageFile": "./sessions.json"
  },
  "claude": {
    "claudeCodePath": "/usr/local/bin/claude",
    "allowedTools": ["Bash(git*)", "Edit", "Replace"],
    "maxProcesses": 5
  },
  "messages": {
    "maxQueueSize": 1000,
    "retryAttempts": 3,
    "retryDelay": 1000
  },
  "security": {
    "enableAuth": false,
    "rateLimitEnabled": true,
    "rateLimitMax": 100
  }
}
```

## Usage

### Programmatic Usage

```javascript
import { AgentAPIMiddleware } from './src/middleware/agentapi/index.js';

const middleware = new AgentAPIMiddleware({
  port: 3284,
  host: 'localhost',
  maxSessions: 10,
  claudeCodePath: '/usr/local/bin/claude'
});

// Start the middleware
await middleware.start();

// Get status
const status = middleware.getStatus();
console.log('Middleware running:', status.running);

// Stop the middleware
await middleware.stop();
```

### CLI Usage

```bash
# Start the server
node src/middleware/agentapi/cli.js start --port 3284 --max-sessions 10

# Check status
node src/middleware/agentapi/cli.js status

# Test functionality
node src/middleware/agentapi/cli.js test --session --message "Hello Claude"

# View configuration
node src/middleware/agentapi/cli.js config --show

# Stop the server
node src/middleware/agentapi/cli.js stop
```

### Direct Server Usage

```bash
# Run server directly
node src/middleware/agentapi/server.js
```

## Integration with Task Master

### Event Integration

The AgentAPI middleware integrates with the Task Master orchestrator through events:

```javascript
// Listen for agent activities
middleware.on('message', (event) => {
  console.log('Agent message:', event);
});

middleware.on('sessionUpdate', (event) => {
  console.log('Session update:', event);
});

// Send events to orchestrator
orchestrator.emit('agentActivity', {
  type: 'message_sent',
  sessionId: 'session-123',
  timestamp: new Date().toISOString()
});
```

### Configuration Integration

Load configuration from Task Master's central config:

```javascript
import { configManager } from '../config/index.js';

const agentApiConfig = configManager.get('agentapi');
const middleware = new AgentAPIMiddleware(agentApiConfig);
```

## Security Features

### Authentication
- Optional token-based authentication
- Session-based access control
- Client permission management

### Rate Limiting
- Configurable request rate limits
- Per-IP and per-session limits
- Automatic blocking of abusive clients

### Input Validation
- Message content validation
- Parameter sanitization
- Command injection prevention

### Process Isolation
- Separate Claude Code processes per session
- Resource usage monitoring
- Automatic cleanup of orphaned processes

## Monitoring and Logging

### Health Checks
- Server health endpoint (`/health`)
- Claude Code availability checks
- Process health monitoring
- Resource usage tracking

### Logging
- Configurable log levels
- Request/response logging
- Error tracking and reporting
- Performance metrics

### Metrics
- Session statistics
- Message throughput
- Error rates
- Resource utilization

## Error Handling

### Graceful Degradation
- Automatic retry logic for failed messages
- Session recovery mechanisms
- Process restart capabilities
- Fallback error responses

### Error Types
- **Connection Errors**: Network and WebSocket issues
- **Process Errors**: Claude Code process failures
- **Validation Errors**: Invalid requests and parameters
- **Resource Errors**: Session limits and timeouts
- **System Errors**: Internal server errors

## Performance Considerations

### Scalability
- Configurable session limits
- Message queue management
- Connection pooling
- Resource monitoring

### Optimization
- Efficient message parsing
- Terminal output caching
- Event streaming optimization
- Memory usage monitoring

## Testing

### Unit Tests
```bash
npm test tests/middleware/agentapi/
```

### Integration Tests
```bash
npm test tests/middleware/agentapi/integration.test.js
```

### Manual Testing
```bash
# Start server
node src/middleware/agentapi/cli.js start

# Run tests
node src/middleware/agentapi/cli.js test --session --message "Test message"
```

## Troubleshooting

### Common Issues

1. **Claude Code Not Found**
   - Verify `CLAUDE_CODE_PATH` environment variable
   - Check Claude Code installation
   - Run health check: `node cli.js test --claude-health`

2. **Port Already in Use**
   - Change port: `--port 3285`
   - Check running processes: `lsof -i :3284`
   - Kill existing process: `pkill -f agentapi`

3. **Session Creation Fails**
   - Check session limits in configuration
   - Verify Claude Code permissions
   - Review server logs for errors

4. **WebSocket Connection Issues**
   - Check firewall settings
   - Verify CORS configuration
   - Test with simple WebSocket client

### Debug Mode

Enable debug logging:
```bash
AGENTAPI_LOG_LEVEL=debug node src/middleware/agentapi/cli.js start
```

### Log Analysis

View logs:
```bash
node src/middleware/agentapi/cli.js logs --follow --level error
```

## Development

### Adding New Features

1. **New API Endpoints**: Add routes in `server.js`
2. **Message Types**: Extend `MessageTransformer` in `message-handler.js`
3. **Session Features**: Modify `Session` class in `session-manager.js`
4. **Claude Integration**: Update `ClaudeInterface` in `claude-interface.js`

### Testing New Features

1. Add unit tests in `tests/middleware/agentapi/`
2. Update integration tests
3. Test with CLI: `node cli.js test`
4. Manual testing with Postman or curl

### Contributing

1. Follow existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure backward compatibility
5. Test with real Claude Code instances

## License

This AgentAPI middleware is part of the Task Master project and follows the same licensing terms.

