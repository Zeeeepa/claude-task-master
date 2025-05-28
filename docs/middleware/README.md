# AgentAPI Middleware Integration

This document provides comprehensive documentation for the AgentAPI middleware integration that serves as the communication bridge between the orchestrator/system watcher (claude-task-master) and Claude Code for PR deployment and validation on WSL2 instances.

## Overview

The AgentAPI middleware integration consists of several key components:

1. **AgentAPI HTTP Client** - Enhanced HTTP client for agentapi communication
2. **Authentication Manager** - Handles authentication and authorization
3. **Webhook Handler** - Processes real-time status updates and events
4. **WSL2 Deployment Manager** - Manages WSL2 deployment automation
5. **Claude Code Validator** - Interfaces with Claude Code for validation
6. **Communication Bridge** - Central orchestration hub

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Orchestrator  │───▶│ Communication    │───▶│   AgentAPI      │
│                 │    │ Bridge           │    │   Client        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Webhook Handler  │    │   Claude Code   │
                       │                  │    │   Validator     │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ WSL2 Deployment  │    │   Result        │
                       │ Manager          │    │   Collector     │
                       └──────────────────┘    └─────────────────┘
```

## Components

### AgentAPI Client

The AgentAPI client provides a robust HTTP interface for communicating with the AgentAPI service.

**Features:**
- HTTP client with retry logic and exponential backoff
- Server-Sent Events (SSE) support for real-time updates
- Authentication handling
- Connection management and health monitoring
- Request/response logging and metrics

**Usage:**
```javascript
import AgentAPIClient from './src/ai_cicd_system/integrations/agentapi/client.js';

const client = new AgentAPIClient({
    baseURL: 'http://localhost:3284',
    apiKey: 'your-api-key',
    timeout: 30000,
    retryAttempts: 3
});

await client.connect();
const result = await client.sendMessage('Hello, Claude!', 'user');
```

### Authentication Manager

Handles secure authentication and authorization for API access.

**Features:**
- API key generation and validation
- JWT token management
- Username/password authentication
- Rate limiting and lockout protection
- Permission-based access control

**Usage:**
```javascript
import AuthManager from './src/ai_cicd_system/integrations/agentapi/auth_manager.js';

const authManager = new AuthManager();

// Generate API key
const apiKey = authManager.generateApiKey('user-id', {
    permissions: ['read', 'write'],
    description: 'User API key'
});

// Validate API key
const validation = await authManager.validateApiKey(apiKey.key);
```

### Webhook Handler

Processes webhook events for real-time status updates and notifications.

**Features:**
- Express.js-based webhook server
- Signature validation for security
- Event routing and processing
- Webhook endpoint registration
- Event queuing and retry logic

**Usage:**
```javascript
import WebhookHandler from './src/ai_cicd_system/integrations/agentapi/webhook_handler.js';

const webhookHandler = new WebhookHandler({
    port: 3002,
    secret: 'webhook-secret'
});

await webhookHandler.start();

// Register endpoint
webhookHandler.registerEndpoint('claude-code', [
    'validation_started',
    'validation_completed'
], 'Claude Code validation events');
```

### WSL2 Deployment Manager

Manages WSL2 deployment automation for PR validation and testing.

**Features:**
- WSL2 environment management
- Project type detection and setup
- Concurrent deployment handling
- Resource monitoring and cleanup
- Deployment lifecycle management

**Usage:**
```javascript
import WSL2DeploymentManager from './src/ai_cicd_system/integrations/agentapi/deployment_manager.js';

const deploymentManager = new WSL2DeploymentManager({
    maxConcurrentDeployments: 3,
    deploymentTimeout: 30 * 60 * 1000
});

const result = await deploymentManager.deployPR({
    repository: 'owner/repo',
    number: 123,
    branch: 'feature-branch',
    cloneUrl: 'https://github.com/owner/repo.git'
});
```

### Claude Code Validator

Interfaces with Claude Code for comprehensive PR validation.

**Features:**
- AgentAPI integration for Claude Code communication
- Validation workflow orchestration
- Code quality analysis
- Security scanning
- Performance analysis
- Report generation

**Usage:**
```javascript
import ClaudeCodeValidator from './src/ai_cicd_system/integrations/claude_code/validator.js';

const validator = new ClaudeCodeValidator({
    agentApiUrl: 'http://localhost:3284',
    agentApiKey: 'your-api-key'
});

await validator.initialize();

const result = await validator.validatePR({
    repository: 'owner/repo',
    number: 123,
    branch: 'feature-branch'
});
```

### Communication Bridge

Central orchestration hub that coordinates all middleware components.

**Features:**
- Component lifecycle management
- Operation queuing and processing
- Event routing and handling
- Status monitoring and reporting
- Error handling and recovery

**Usage:**
```javascript
import CommunicationBridge from './src/ai_cicd_system/middleware/communication_bridge.js';

const bridge = new CommunicationBridge({
    agentApiUrl: 'http://localhost:3284',
    agentApiKey: 'your-api-key',
    webhookPort: 3002
});

await bridge.initialize();

// Process full PR validation
const result = await bridge.processFullPRValidation({
    repository: 'owner/repo',
    number: 123,
    branch: 'feature-branch'
});
```

## Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_URL=http://localhost:3284
AGENTAPI_KEY=your-api-key

# Webhook Configuration
WEBHOOK_PORT=3002
WEBHOOK_SECRET=your-webhook-secret

# Authentication Configuration
JWT_SECRET=your-jwt-secret

# WSL2 Configuration
WSL2_DISTRIBUTION=Ubuntu-22.04
WSL2_WORKSPACE_ROOT=/tmp/claude-deployments
```

### Configuration Options

Each component accepts configuration options:

```javascript
const config = {
    // AgentAPI Client
    agentApiUrl: 'http://localhost:3284',
    agentApiKey: 'your-api-key',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    
    // Webhook Handler
    webhookPort: 3002,
    webhookSecret: 'your-secret',
    enableSignatureValidation: true,
    
    // WSL2 Deployment
    maxConcurrentDeployments: 3,
    deploymentTimeout: 30 * 60 * 1000,
    workspaceRoot: '/tmp/claude-deployments',
    
    // Claude Code Validator
    maxConcurrentValidations: 2,
    validationTimeout: 30 * 60 * 1000,
    enableDetailedAnalysis: true,
    enableSecurityScan: true,
    
    // Communication Bridge
    maxConcurrentOperations: 5,
    operationTimeout: 30 * 60 * 1000,
    enableWebhooks: true,
    enableDeployments: true,
    enableValidation: true
};
```

## Integration Flow

The complete integration flow for PR validation:

1. **Request Received**: Orchestrator sends PR validation request to Communication Bridge
2. **Operation Queued**: Bridge queues operation if at capacity, otherwise starts immediately
3. **WSL2 Deployment**: Deployment Manager clones PR and sets up environment
4. **Claude Code Validation**: Validator runs comprehensive analysis via AgentAPI
5. **Result Collection**: Results are collected and processed
6. **Webhook Notifications**: Status updates sent via webhooks
7. **Response Returned**: Final results returned to orchestrator

```javascript
// Example integration flow
const bridge = new CommunicationBridge(config);
await bridge.initialize();

// Listen for events
bridge.on('validation.started', (data) => {
    console.log('Validation started:', data);
});

bridge.on('validation.completed', (data) => {
    console.log('Validation completed:', data);
});

// Process PR
const result = await bridge.processFullPRValidation({
    repository: 'owner/repo',
    number: 123,
    branch: 'feature-branch',
    cloneUrl: 'https://github.com/owner/repo.git'
});
```

## Error Handling

The middleware includes comprehensive error handling:

### Retry Logic
- HTTP requests with exponential backoff
- Failed operations with configurable retry attempts
- Connection recovery for AgentAPI client

### Error Types
- **Connection Errors**: AgentAPI unavailable
- **Authentication Errors**: Invalid credentials or expired tokens
- **Validation Errors**: Claude Code validation failures
- **Deployment Errors**: WSL2 environment issues
- **Timeout Errors**: Operations exceeding time limits

### Error Recovery
```javascript
bridge.on('agentapi.disconnected', async () => {
    console.log('AgentAPI disconnected, attempting reconnection...');
    await bridge.agentApiClient.connect();
});

bridge.on('operation.failed', (data) => {
    console.error('Operation failed:', data);
    // Implement custom error handling
});
```

## Monitoring and Logging

### Metrics Collection
- Operation success/failure rates
- Average processing times
- Resource utilization
- Error frequencies

### Logging
All components use structured logging with configurable levels:

```javascript
const logger = new SimpleLogger('ComponentName', 'info');
logger.info('Operation started', { operationId, prNumber });
logger.error('Operation failed', { error: error.message });
```

### Health Checks
```javascript
// Component health status
const status = bridge.getStatus();
console.log('Bridge status:', status);

// Individual component status
const agentApiStatus = bridge.agentApiClient.getConnectionStatus();
const webhookStats = bridge.webhookHandler.getStats();
const deploymentStats = bridge.deploymentManager.getStats();
```

## Security Considerations

### Authentication
- API key-based authentication with configurable permissions
- JWT tokens with expiration and refresh capabilities
- Rate limiting to prevent abuse

### Webhook Security
- HMAC signature validation
- Timestamp verification to prevent replay attacks
- IP whitelisting (configurable)

### WSL2 Security
- Isolated environments for each deployment
- Resource limits to prevent resource exhaustion
- Automatic cleanup of expired deployments

## Performance Optimization

### Concurrency Control
- Configurable limits for concurrent operations
- Queue management for pending requests
- Resource monitoring and throttling

### Caching
- Connection pooling for HTTP requests
- Result caching for repeated validations
- Environment template caching

### Resource Management
- Automatic cleanup of expired resources
- Memory usage monitoring
- Disk space management

## Troubleshooting

### Common Issues

1. **AgentAPI Connection Failed**
   - Check AgentAPI service status
   - Verify URL and network connectivity
   - Check authentication credentials

2. **WSL2 Not Available**
   - Ensure WSL2 is installed and configured
   - Check distribution availability
   - Verify user permissions

3. **Webhook Delivery Failed**
   - Check webhook endpoint availability
   - Verify signature validation
   - Review network connectivity

4. **Validation Timeout**
   - Increase timeout configuration
   - Check resource availability
   - Review validation complexity

### Debug Mode
Enable debug logging for detailed troubleshooting:

```javascript
const bridge = new CommunicationBridge({
    ...config,
    logLevel: 'debug'
});
```

### Health Checks
Regular health checks help identify issues:

```bash
# Check WSL2 status
./scripts/wsl2/setup-environment.sh health-check

# Check component status
curl http://localhost:3002/health
```

## Testing

### Unit Tests
```bash
npm test -- tests/integrations/agentapi/
```

### Integration Tests
```bash
npm run test:e2e
```

### Manual Testing
```bash
# Test AgentAPI connection
node -e "
import('./src/ai_cicd_system/integrations/agentapi/client.js')
  .then(m => new m.default({baseURL: 'http://localhost:3284'}))
  .then(client => client.getHealth())
  .then(console.log)
"
```

## Deployment

### Production Deployment
1. Configure environment variables
2. Set up WSL2 environments
3. Configure webhook endpoints
4. Start services in correct order
5. Monitor health and performance

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3002
CMD ["node", "src/ai_cicd_system/middleware/communication_bridge.js"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentapi-middleware
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agentapi-middleware
  template:
    metadata:
      labels:
        app: agentapi-middleware
    spec:
      containers:
      - name: middleware
        image: agentapi-middleware:latest
        ports:
        - containerPort: 3002
        env:
        - name: AGENTAPI_URL
          value: "http://agentapi-service:3284"
```

## Contributing

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

### Pull Request Process
1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review feedback

## Support

For issues and questions:
- Check troubleshooting guide
- Review logs and error messages
- Create GitHub issue with details
- Contact development team

## License

This middleware integration is part of the claude-task-master project and follows the same licensing terms.

