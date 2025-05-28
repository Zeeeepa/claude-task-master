# AgentAPI Middleware Integration

This directory contains the AgentAPI middleware integration for the Claude Task Master AI CI/CD system. The middleware provides robust orchestration of Claude Code, Goose, Aider, and Codex on WSL2 instances for PR branch deployment and validation.

## 🏗️ Architecture Overview

The middleware consists of four main components:

1. **AgentAPI Client** (`agentapi_client.js`) - Robust HTTP client with circuit breaker and retry logic
2. **WSL2 Manager** (`wsl2_manager.js`) - Automated WSL2 instance provisioning and management
3. **Claude Code Integration** (`claude_code_integration.js`) - PR validation workflow orchestration
4. **Agent Session Manager** (`agent_session_manager.js`) - Long-running agent session lifecycle management

## 🚀 Quick Start

### Basic Usage

```javascript
import { createAICICDSystem } from '../index.js';

// Create system with middleware
const system = await createAICICDSystem({
  agentapi: {
    baseURL: 'http://localhost:8000',
    timeout: 60000
  },
  wsl2: {
    maxInstances: 5,
    resourceLimits: {
      memory: '8GB',
      cpu: 4
    }
  }
});

// Deploy and validate a PR
const result = await system.deployAndValidatePR(prData);
console.log('Validation result:', result.report);
```

### Direct Middleware Usage

```javascript
import { AgentAPIMiddleware } from './index.js';

const middleware = new AgentAPIMiddleware(config);
await middleware.initialize();

// Create WSL2 instance
const instance = await middleware.createWSL2Instance();

// Create agent session
const session = await middleware.createAgentSession('claude');

// Send message
const response = await middleware.sendMessageToSession(
  session.id, 
  'Analyze this code for issues'
);
```

## 📦 Components

### AgentAPI Client

Provides robust communication with the AgentAPI server:

- **Circuit Breaker**: Prevents cascade failures
- **Retry Logic**: Exponential backoff with jitter
- **Connection Pooling**: Efficient resource usage
- **Health Monitoring**: Automatic health checks
- **Metrics Collection**: Performance tracking

```javascript
import { AgentAPIClient } from './agentapi_client.js';

const client = new AgentAPIClient({
  baseURL: 'http://localhost:8000',
  retryAttempts: 3,
  circuitBreakerThreshold: 5
});

// Start agent session
const session = await client.startAgentSession('claude', config);

// Send message
const response = await client.sendMessage(session.sessionId, message);
```

### WSL2 Manager

Manages WSL2 instances for isolated code execution:

- **Automated Provisioning**: Create instances on demand
- **Resource Management**: Memory, CPU, disk limits
- **Network Security**: Firewall and isolation
- **Lifecycle Management**: Create, deploy, monitor, destroy
- **Cleanup**: Automatic garbage collection

```javascript
import { WSL2Manager } from './wsl2_manager.js';

const manager = new WSL2Manager({
  maxInstances: 5,
  resourceLimits: { memory: '8GB', cpu: 4 }
});

// Create instance
const instance = await manager.createInstance();

// Deploy code
await manager.deployCode(instance.id, {
  repository: { url: 'https://github.com/user/repo.git' },
  setupCommands: ['npm install', 'npm test']
});
```

### Claude Code Integration

Orchestrates the complete PR validation workflow:

- **PR Branch Deployment**: Clone and setup code
- **Validation Pipeline**: Tests, linting, security, code review
- **Report Generation**: Comprehensive validation reports
- **Error Handling**: Robust error recovery
- **Performance Monitoring**: Metrics and timing

```javascript
import { ClaudeCodeIntegration } from './claude_code_integration.js';

const integration = new ClaudeCodeIntegration(config);

// Deploy and validate PR
const deployment = await integration.deployAndValidatePR(prData, {
  gitCredentials: { username: 'user', token: 'token' }
});

console.log('Validation results:', deployment.results);
console.log('Risk level:', deployment.report.riskLevel);
```

### Agent Session Manager

Manages long-running agent sessions:

- **Session Lifecycle**: Create, monitor, cleanup
- **Resource Monitoring**: Memory, CPU usage tracking
- **Health Checks**: Automatic health monitoring
- **Persistence**: Session state recovery
- **Concurrent Management**: Multiple agent types

```javascript
import { AgentSessionManager } from './agent_session_manager.js';

const manager = new AgentSessionManager({
  maxSessions: 10,
  sessionTimeout: 3600000
});

// Create session
const session = await manager.createSession('claude', config);

// Send message
const response = await manager.sendMessage(session.id, message);

// Monitor health
const status = await manager.getSessionStatus(session.id);
```

## ⚙️ Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:8000
AGENTAPI_TIMEOUT=60000
AGENTAPI_RETRY_ATTEMPTS=3

# WSL2 Configuration
WSL2_MAX_INSTANCES=5
WSL2_INSTANCE_TIMEOUT=3600000
WSL2_BASE_DISTRIBUTION=Ubuntu-22.04

# Claude Code Configuration
CLAUDE_CODE_MODEL=claude-3-sonnet-20240229
CLAUDE_CODE_MAX_TOKENS=4096
CLAUDE_CODE_TEMPERATURE=0.1

# Session Management
SESSION_MAX_SESSIONS=10
SESSION_TIMEOUT=3600000
SESSION_PERSISTENCE_DIR=./data/sessions
```

### Configuration File

Use the provided configuration template:

```javascript
import config from '../../../config/agentapi_config.json' assert { type: 'json' };

const middleware = new AgentAPIMiddleware(config);
```

## 🛠️ Setup & Installation

### Prerequisites

1. **Windows with WSL2**: Required for WSL2 instance management
2. **AgentAPI Server**: Running instance of AgentAPI
3. **Node.js 18+**: For running the middleware
4. **Git**: For repository operations

### Installation Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Setup WSL2** (Windows only):
   ```bash
   # Run the setup script
   ./scripts/wsl2_setup.sh
   
   # Or manually install Ubuntu
   wsl --install Ubuntu-22.04
   ```

3. **Configure Environment**:
   ```bash
   cp config/agentapi_config.json.example config/agentapi_config.json
   # Edit configuration as needed
   ```

4. **Start AgentAPI Server**:
   ```bash
   # In separate terminal
   agentapi server -- claude
   ```

5. **Run Examples**:
   ```bash
   npm run agentapi:demo
   ```

## 📊 Monitoring & Metrics

### Health Monitoring

The middleware provides comprehensive health monitoring:

```javascript
// Get system health
const health = await middleware.getHealthStatus();
console.log('System health:', health);

// Component-specific health
const agentAPIHealth = await middleware.agentAPI.healthCheck();
const wsl2Stats = middleware.wsl2Manager.getStatistics();
```

### Performance Metrics

Track performance across all components:

```javascript
// Get system statistics
const stats = middleware.getSystemStatistics();
console.log('Active sessions:', stats.system.activeSessions);
console.log('Response time:', stats.components.agentapi.averageResponseTime);
console.log('Resource usage:', stats.components.wsl2.resourceUsage);
```

### Event Monitoring

Listen to system events:

```javascript
middleware.on('deploymentStarted', (deployment) => {
  console.log('PR deployment started:', deployment.id);
});

middleware.on('sessionCreated', (session) => {
  console.log('Agent session created:', session.id);
});

middleware.on('healthAlert', (alert) => {
  console.log('Health alert:', alert);
});
```

## 🔒 Security

### Network Security

- WSL2 instances are isolated with firewall rules
- Only necessary ports are exposed
- DNS servers configured for security
- Network traffic monitoring

### Authentication

- JWT-based authentication for API access
- Role-based access control
- API key management
- Rate limiting protection

### Data Protection

- Sensitive data encrypted at rest
- Secure credential management
- Audit logging for operations
- Regular security scans

## 🚨 Error Handling

### Error Categories

1. **Transient Errors**: Network timeouts, temporary unavailability
2. **Permanent Errors**: Authentication failures, invalid requests
3. **Resource Errors**: Memory exhaustion, disk space issues
4. **Configuration Errors**: Invalid settings, missing dependencies

### Recovery Strategies

- Automatic retry with exponential backoff
- Circuit breaker pattern for service protection
- Graceful degradation when services unavailable
- Automatic cleanup of failed operations

### Error Examples

```javascript
try {
  const deployment = await middleware.deployAndValidatePR(prData);
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    console.log('Service temporarily unavailable');
  } else if (error.code === 'WSL2_INSTANCE_LIMIT') {
    console.log('Too many instances, waiting...');
  } else {
    console.error('Deployment failed:', error.message);
  }
}
```

## 🧪 Testing

### Unit Tests

```bash
# Run all middleware tests
npm test src/ai_cicd_system/middleware/

# Run specific component tests
npm test src/ai_cicd_system/middleware/agentapi_client.test.js
```

### Integration Tests

```bash
# Run integration tests (requires AgentAPI server)
npm run test:integration:middleware
```

### Example Scripts

```bash
# Run all examples
npm run agentapi:demo

# Run specific examples
npm run agentapi:pr          # PR deployment example
npm run agentapi:middleware  # Direct middleware usage
npm run agentapi:sessions    # Session management
npm run agentapi:wsl2        # WSL2 management
```

## 📚 API Reference

### AgentAPIMiddleware

Main orchestrator class:

```javascript
class AgentAPIMiddleware extends EventEmitter {
  async initialize()
  async deployAndValidatePR(prData, options)
  async createAgentSession(agentType, config)
  async sendMessageToSession(sessionId, message, options)
  async createWSL2Instance(options)
  async deployCodeToInstance(instanceId, codeData)
  getSystemStatistics()
  getHealthStatus()
  async shutdown()
}
```

### Events

The middleware emits various events for monitoring:

- `initialized` - System initialization complete
- `deploymentStarted` - PR deployment started
- `deploymentCompleted` - PR deployment completed
- `deploymentFailed` - PR deployment failed
- `sessionCreated` - Agent session created
- `sessionStopped` - Agent session stopped
- `instanceCreated` - WSL2 instance created
- `instanceDestroyed` - WSL2 instance destroyed
- `healthCheck` - Health check results
- `healthAlert` - Health alert triggered
- `metrics` - Performance metrics collected

## 🤝 Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Run tests: `npm test`
5. Start development: `npm run dev`

### Code Standards

- Follow ESLint configuration
- Write comprehensive tests
- Document all public APIs
- Use semantic versioning

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review feedback

## 📖 Additional Resources

- [Architecture Documentation](../../../docs/middleware_architecture.md)
- [Configuration Guide](../../../config/agentapi_config.json)
- [WSL2 Setup Script](../../../scripts/wsl2_setup.sh)
- [Example Usage](../examples/agentapi_middleware_example.js)

## 🆘 Troubleshooting

### Common Issues

1. **WSL2 Not Available**:
   ```bash
   # Check WSL2 status
   wsl --status
   
   # Install WSL2
   wsl --install
   ```

2. **AgentAPI Connection Failed**:
   ```bash
   # Check AgentAPI server
   curl http://localhost:8000/api/v1/health
   
   # Start AgentAPI server
   agentapi server -- claude
   ```

3. **Instance Creation Failed**:
   ```bash
   # Check available resources
   wsl --list --verbose
   
   # Free up resources
   wsl --shutdown
   ```

4. **Session Timeout**:
   ```javascript
   // Increase session timeout
   const config = {
     sessionManager: {
       sessionTimeout: 7200000 // 2 hours
     }
   };
   ```

### Debug Mode

Enable debug logging for troubleshooting:

```javascript
const middleware = new AgentAPIMiddleware({
  logLevel: 'debug',
  agentapi: { logLevel: 'debug' },
  wsl2: { logLevel: 'debug' }
});
```

### Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Comprehensive guides and examples
- Community: Discussions and support forum

