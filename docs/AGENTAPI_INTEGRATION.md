# AgentAPI Integration for Claude Code

This document describes the AgentAPI middleware integration that enables communication between claude-task-master and Claude Code for PR validation, deployment, and debugging on WSL2 instances.

## Overview

The AgentAPI integration provides a robust, production-ready interface for controlling Claude Code through HTTP API calls. This replaces the previous mock implementation with real Claude Code capabilities.

## Architecture

```
claude-task-master → AgentAPI Server → Claude Code (WSL2)
                                    ↓
PostgreSQL ← Results ← PR Validation ← Code Analysis
```

### Components

1. **AgentAPIClient** - HTTP client for AgentAPI communication
2. **ClaudeCodeManager** - High-level session and operation management
3. **ValidationEngine** - Enhanced with real Claude Code integration
4. **Configuration** - Environment-based configuration management

## Features

### Core Functionality

- ✅ **Session Management** - Start, stop, and monitor Claude Code sessions
- ✅ **Message Handling** - Send commands and receive responses
- ✅ **Health Monitoring** - Continuous health checks and circuit breaker
- ✅ **Error Recovery** - Retry logic and graceful fallback to mock mode
- ✅ **Concurrent Operations** - Support for multiple simultaneous validations
- ✅ **Queue Management** - Automatic queuing when max sessions reached

### Validation Pipeline

- ✅ **Repository Cloning** - Clone PR branch to WSL2 instance
- ✅ **Code Analysis** - Analyze changes, run tests, security scans
- ✅ **Performance Checks** - Evaluate code performance and optimization
- ✅ **Requirements Compliance** - Verify task requirements are met
- ✅ **Feedback Generation** - Comprehensive validation reports
- ✅ **Scoring System** - Weighted scoring across multiple criteria

## Configuration

### Environment Variables

```bash
# AgentAPI Server
AGENTAPI_URL=http://localhost:3284
AGENTAPI_TIMEOUT=30000
AGENTAPI_RETRIES=3

# Claude Code Settings
CLAUDE_CODE_PATH=claude
CLAUDE_CODE_ARGS=--allowedTools,Bash(git*) Edit Replace

# Session Management
AGENTAPI_SESSION_TIMEOUT=300000
AGENTAPI_MAX_SESSIONS=5

# WSL2 Environment
WSL2_ENABLED=true
WSL2_DISTRO=Ubuntu
WSL2_WORKING_DIR=/tmp/claude-task-master

# Validation Settings
VALIDATION_MAX_TIME=300000
VALIDATION_MAX_FILE_SIZE=10485760

# Error Handling
ERROR_MAX_RETRIES=3
ERROR_CIRCUIT_BREAKER_THRESHOLD=5
```

### Configuration Files

#### `src/ai_cicd_system/config/agentapi_config.js`

Centralized configuration management with environment-specific settings:

```javascript
import { mergeAgentAPIConfig, getEnvironmentConfig } from './agentapi_config.js';

// Development configuration
const devConfig = getEnvironmentConfig('development');

// Production configuration
const prodConfig = getEnvironmentConfig('production');

// Custom configuration
const customConfig = mergeAgentAPIConfig({
    baseURL: 'http://custom-agentapi:3284',
    maxConcurrentSessions: 10
});
```

## Usage

### Basic Usage

```javascript
import { ValidationEngine } from './src/ai_cicd_system/core/validation_engine.js';

const validationEngine = new ValidationEngine({
    agentapi_url: 'http://localhost:3284',
    enable_mock: false, // Use real AgentAPI
    enable_security_analysis: true,
    enable_performance_analysis: true
});

await validationEngine.initialize();

const result = await validationEngine.validatePR({
    number: 123,
    url: 'https://github.com/user/repo/pull/123',
    branch_name: 'feature-branch'
}, {
    task_id: 'task-456',
    requirements: ['Add new feature', 'Include tests']
});

console.log('Validation Score:', result.overall_score);
console.log('Status:', result.status);
console.log('Recommendations:', result.recommendations);
```

### Direct AgentAPI Client Usage

```javascript
import { AgentAPIClient } from './src/ai_cicd_system/core/agentapi_client.js';

const client = new AgentAPIClient({
    baseURL: 'http://localhost:3284',
    timeout: 30000
});

// Start Claude Code session
const sessionId = await client.startClaudeCodeSession({
    workingDirectory: '/tmp/validation',
    args: ['--allowedTools', 'Bash(git*) Edit Replace']
});

// Send commands
await client.sendMessage(sessionId, 'git clone https://github.com/user/repo.git .');
await client.sendMessage(sessionId, 'npm test');

// Get results
const messages = await client.getMessages(sessionId);
const status = await client.getSessionStatus(sessionId);

// Cleanup
await client.stopSession(sessionId);
```

### Claude Code Manager Usage

```javascript
import { ClaudeCodeManager } from './src/ai_cicd_system/core/claude_code_manager.js';

const manager = new ClaudeCodeManager({
    maxConcurrentSessions: 3,
    validationTimeout: 600000
});

// Validate PR with automatic session management
const result = await manager.validatePR({
    url: 'https://github.com/user/repo',
    branch: 'feature-branch',
    number: 123
}, {
    enableSecurity: true,
    enablePerformance: true
});

console.log('Validation completed:', result.summary.status);
console.log('Score:', result.score);
```

## Error Handling

### Circuit Breaker Pattern

The AgentAPI client implements a circuit breaker to handle service failures:

- **Closed State**: Normal operation, requests pass through
- **Open State**: Service is down, requests fail immediately
- **Half-Open State**: Testing if service has recovered

```javascript
client.on('circuitBreakerOpen', () => {
    console.log('AgentAPI is unavailable, falling back to mock mode');
});

client.on('circuitBreakerClosed', () => {
    console.log('AgentAPI is back online');
});
```

### Retry Logic

Automatic retry with exponential backoff:

```javascript
const result = await client.makeRequest('POST', '/session/start', data, {
    retries: 3,
    retryDelay: 1000
});
```

### Graceful Fallback

When AgentAPI is unavailable, the system automatically falls back to mock validation:

```javascript
// Automatic fallback in ValidationEngine
if (agentAPIUnavailable) {
    this.config.enable_mock = true;
    return await this.performMockValidation(prInfo, taskContext);
}
```

## Monitoring and Health Checks

### Health Monitoring

```javascript
// Check AgentAPI health
const health = await client.checkHealth();
console.log('AgentAPI Status:', health.status);

// Get detailed status
const status = client.getStatus();
console.log('Active Sessions:', status.activeSessions);
console.log('Circuit Breaker State:', status.circuitBreaker.state);
```

### Event Monitoring

```javascript
client.on('healthCheckPassed', (data) => {
    console.log('Health check passed:', data);
});

client.on('healthCheckFailed', (data) => {
    console.log('Health check failed:', data.error);
});

client.on('sessionStarted', (data) => {
    console.log('Session started:', data.sessionId);
});

client.on('sessionStopped', (data) => {
    console.log('Session stopped:', data.sessionId);
});
```

## Testing

### Running Tests

```bash
# Run all AgentAPI tests
npm test tests/agentapi/

# Run specific test files
npm test tests/agentapi/agentapi_client.test.js
npm test tests/agentapi/claude_code_manager.test.js
npm test tests/agentapi/validation_engine_integration.test.js

# Run with coverage
npm run test:coverage
```

### Test Coverage

The test suite provides comprehensive coverage:

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow validation
- **Error Handling Tests**: Failure scenarios and recovery
- **Performance Tests**: Concurrent operations and load testing

### Mock Testing

For development and CI environments:

```javascript
const validationEngine = new ValidationEngine({
    enable_mock: true // Use mock validation
});
```

## Deployment

### Prerequisites

1. **AgentAPI Server**: Running on accessible endpoint
2. **Claude Code**: Installed and accessible to AgentAPI
3. **WSL2** (if on Windows): Configured for development environment
4. **Node.js Dependencies**: axios, ws, node-ssh, dockerode

### Production Deployment

```bash
# Install dependencies
npm install

# Set environment variables
export AGENTAPI_URL=http://agentapi-server:3284
export CLAUDE_CODE_PATH=/usr/local/bin/claude
export WSL2_ENABLED=false

# Start application
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV AGENTAPI_URL=http://agentapi:3284
ENV NODE_ENV=production

CMD ["npm", "start"]
```

## Security Considerations

### API Security

- **Authentication**: Configure API keys for AgentAPI access
- **Network Security**: Use HTTPS in production
- **Input Validation**: Sanitize all user inputs
- **Resource Limits**: Configure timeouts and session limits

### WSL2 Security

- **File Permissions**: Restrict access to working directories
- **Network Isolation**: Limit network access from WSL2 instances
- **Resource Monitoring**: Monitor CPU and memory usage

## Performance Optimization

### Session Management

- **Connection Pooling**: Reuse sessions when possible
- **Session Cleanup**: Automatic cleanup of expired sessions
- **Concurrent Limits**: Configure based on system resources

### Caching

- **Validation Results**: Cache results for identical PRs
- **Health Check Results**: Cache health status
- **Configuration**: Cache parsed configuration

## Troubleshooting

### Common Issues

1. **AgentAPI Connection Failed**
   ```
   Error: Failed to start Claude Code session: Connection failed
   ```
   - Check AgentAPI server is running
   - Verify network connectivity
   - Check firewall settings

2. **Session Timeout**
   ```
   Error: Session session-123 not found or inactive
   ```
   - Increase session timeout
   - Check for session cleanup issues
   - Monitor session activity

3. **Circuit Breaker Open**
   ```
   Error: Circuit breaker is open - AgentAPI is currently unavailable
   ```
   - Wait for circuit breaker to reset
   - Check AgentAPI health
   - Review error logs

### Debug Mode

Enable debug logging:

```bash
export AGENTAPI_LOG_LEVEL=debug
export AGENTAPI_LOG_REQUESTS=true
export AGENTAPI_LOG_RESPONSES=true
```

### Health Checks

```bash
# Check AgentAPI server
curl http://localhost:3284/health

# Check validation engine health
curl http://localhost:8000/api/health
```

## Contributing

### Development Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Start AgentAPI server
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Code Style

- Follow ESLint configuration
- Use JSDoc for documentation
- Write comprehensive tests
- Follow error handling patterns

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review feedback

## Changelog

### v1.0.0 - Initial AgentAPI Integration

- ✅ AgentAPI client implementation
- ✅ Claude Code Manager
- ✅ ValidationEngine refactor
- ✅ Comprehensive test suite
- ✅ Configuration management
- ✅ Error handling and recovery
- ✅ Health monitoring
- ✅ Documentation

### Future Enhancements

- [ ] WebSocket support for real-time communication
- [ ] Advanced caching strategies
- [ ] Metrics and analytics dashboard
- [ ] Multi-agent orchestration
- [ ] Enhanced security features

