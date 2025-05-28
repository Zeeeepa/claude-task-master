# AgentAPI Integration Documentation

## Overview

The AgentAPI Integration provides comprehensive middleware for orchestrating Claude Code operations on WSL2 instances, enabling seamless communication between the task management system and Claude Code validation engine.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Task Manager  │───▶│  AgentAPI Client │───▶│   AgentAPI      │
└─────────────────┘    └──────────────────┘    │   Server        │
                                               └─────────────────┘
                                                        │
                                                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ WSL2 Environment│───▶│   Claude Code   │
                       │    Manager      │    │   Validation    │
                       └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Repository    │
                       │    Manager      │
                       └─────────────────┘
```

## Components

### 1. AgentAPIClient

The core HTTP client for communicating with the AgentAPI server.

#### Features
- Robust HTTP communication with retry logic
- WSL2 instance lifecycle management
- Claude Code session orchestration
- Resource monitoring and cleanup
- Event-driven architecture

#### Usage

```javascript
import AgentAPIClient from './src/ai_cicd_system/integrations/agentapi_client.js';

const client = new AgentAPIClient({
    baseUrl: 'http://localhost:3284',
    apiKey: process.env.AGENTAPI_KEY,
    timeout: 300000,
    retries: 3
});

await client.initialize();

// Create WSL2 instance
const instance = await client.createWSL2Instance({
    name: 'pr-validation-123',
    distribution: 'Ubuntu-22.04',
    resources: {
        memory: '4GB',
        cpu: '2 cores',
        disk: '20GB'
    }
});

// Execute commands
const result = await client.executeCommand(
    instance.id, 
    'git clone https://github.com/user/repo.git'
);

// Start Claude Code validation
const session = await client.startClaudeCodeValidation(
    instance.id,
    { allowedTools: 'Bash(git*) Edit Replace' }
);
```

### 2. WSL2EnvironmentManager

Manages WSL2 environment lifecycle including creation, configuration, and cleanup.

#### Features
- Automated environment provisioning
- Language-specific dependency detection
- Resource requirement calculation
- Concurrent instance management
- Health monitoring and alerts

#### Usage

```javascript
import WSL2EnvironmentManager from './src/ai_cicd_system/integrations/wsl2_manager.js';

const manager = new WSL2EnvironmentManager({
    maxConcurrentInstances: 10,
    defaultDistribution: 'Ubuntu-22.04',
    resourceLimits: {
        memory: '4GB',
        cpu: '2 cores',
        disk: '20GB'
    }
});

await manager.initialize();

// Create environment for PR validation
const environment = await manager.createEnvironment({
    prNumber: 123,
    repositoryUrl: 'https://github.com/user/repo.git',
    branch: 'feature/new-feature',
    files: ['src/app.js', 'package.json']
});

// Environment is automatically configured with:
// - System updates
// - Language-specific dependencies
// - Repository cloning
// - Claude Code setup
// - Validation tools
```

### 3. ClaudeCodeOrchestrator

Orchestrates comprehensive code validation workflows using Claude Code.

#### Features
- Multi-step validation process
- Automated debugging sessions
- Result aggregation and analysis
- Error handling and recovery
- Performance metrics

#### Validation Steps

1. **Syntax Validation**: Checks for syntax errors, compilation issues, and structural problems
2. **Security Analysis**: Identifies vulnerabilities, security risks, and compliance issues
3. **Performance Assessment**: Analyzes performance bottlenecks and optimization opportunities
4. **Best Practices Review**: Evaluates code quality, maintainability, and adherence to standards

#### Usage

```javascript
import ClaudeCodeOrchestrator from './src/ai_cicd_system/integrations/claude_code_orchestrator.js';

const orchestrator = new ClaudeCodeOrchestrator({
    validationTimeout: 600000,
    allowedTools: 'Bash(git*) Edit Replace',
    validationRules: {
        syntax: true,
        security: true,
        performance: true,
        bestPractices: true
    },
    debuggingConfig: {
        maxIterations: 5,
        autoFix: true
    }
});

await orchestrator.initialize();

// Start comprehensive PR validation
const session = await orchestrator.startPRValidation({
    prNumber: 123,
    repositoryUrl: 'https://github.com/user/repo.git',
    branch: 'feature/security-fix',
    files: ['src/auth.js', 'src/database.js']
});

// Results include:
// - Individual step results (syntax, security, performance, best practices)
// - Overall assessment and score
// - Detailed issue reports
// - Actionable recommendations
// - Debugging session logs (if triggered)
```

### 4. RepositoryManager

Manages repository operations including cloning, branch management, and file operations.

#### Features
- Secure repository cloning
- Branch creation and management
- File change analysis
- Commit and push operations
- Git configuration management

#### Usage

```javascript
import RepositoryManager from './src/ai_cicd_system/integrations/repository_manager.js';

const repoManager = new RepositoryManager({
    defaultWorkspace: '/workspace',
    gitConfig: {
        user: {
            name: 'Claude Task Master',
            email: 'claude-task-master@example.com'
        }
    }
});

await repoManager.initialize();

// Clone repository for validation
const repository = await repoManager.cloneRepository(
    'wsl2-instance-id',
    {
        prNumber: 123,
        repositoryUrl: 'https://github.com/user/repo.git',
        branch: 'feature/new-feature'
    }
);

// Analyze file changes
const changes = await repoManager.getFileChanges(
    'wsl2-instance-id',
    repository.id,
    'main',
    'feature/new-feature'
);

// Create fix branch
const fixBranch = await repoManager.createBranch(
    'wsl2-instance-id',
    repository.id,
    'fix/automated-fixes',
    'feature/new-feature'
);

// Commit and push fixes
await repoManager.commitChanges(
    'wsl2-instance-id',
    repository.id,
    'Automated fixes from Claude Code validation'
);

await repoManager.pushChanges(
    'wsl2-instance-id',
    repository.id,
    'fix/automated-fixes'
);
```

### 5. EnvironmentMonitor

Provides comprehensive monitoring and alerting for WSL2 environments.

#### Features
- Real-time resource monitoring
- Performance metrics collection
- Alert generation and management
- Historical data aggregation
- Resource usage analytics

#### Usage

```javascript
import EnvironmentMonitor from './src/ai_cicd_system/integrations/environment_monitor.js';

const monitor = new EnvironmentMonitor({
    monitoringInterval: 30000,
    alertThresholds: {
        cpu: { warning: 80, critical: 95 },
        memory: { warning: 80, critical: 95 },
        disk: { warning: 85, critical: 95 }
    }
});

await monitor.initialize();
monitor.startMonitoring();

// Add environment to monitoring
monitor.addEnvironment('instance-id', instanceData);

// Get metrics
const metrics = monitor.getMetrics('instance-id', {
    startTime: '2024-01-01T00:00:00Z',
    limit: 100
});

// Get active alerts
const alerts = monitor.getActiveAlerts('instance-id');
```

## Configuration

### Environment Variables

```bash
# AgentAPI Configuration
AGENTAPI_BASE_URL=http://localhost:3284
AGENTAPI_KEY=your-api-key
AGENTAPI_TIMEOUT=300000
AGENTAPI_RETRIES=3

# WSL2 Configuration
WSL2_DISTRIBUTION=Ubuntu-22.04
WSL2_MAX_INSTANCES=10
WSL2_MEMORY_LIMIT=4GB
WSL2_CPU_LIMIT=2 cores
WSL2_DISK_LIMIT=20GB

# Claude Code Configuration
CLAUDE_CODE_ALLOWED_TOOLS="Bash(git*) Edit Replace"
CLAUDE_CODE_WORKSPACE=/workspace
CLAUDE_CODE_VALIDATION_MODE=strict
CLAUDE_CODE_SESSION_TIMEOUT=600000

# Monitoring Configuration
MONITORING_ENABLED=true
MONITORING_INTERVAL=30000
MONITORING_RETENTION_PERIOD=86400000

# Security Configuration
SECURITY_ENABLE_AUTH=true
SECURITY_API_KEY_REQUIRED=true

# Logging Configuration
LOG_LEVEL=info
LOG_ENABLE_FILE=false
LOG_FILE=agentapi.log
```

### Configuration Files

#### AgentAPI Configuration

```javascript
import AgentAPIConfig from './src/ai_cicd_system/config/agentapi_config.js';

const config = new AgentAPIConfig({
    server: {
        baseUrl: 'http://localhost:3284',
        timeout: 300000,
        retries: 3
    },
    wsl2: {
        distribution: 'Ubuntu-22.04',
        maxInstances: 10,
        resourceLimits: {
            memory: '4GB',
            cpu: '2 cores',
            disk: '20GB'
        }
    },
    claudeCode: {
        allowedTools: 'Bash(git*) Edit Replace',
        validationMode: 'strict'
    }
});
```

#### WSL2 Configuration

```javascript
import WSL2Config from './src/ai_cicd_system/config/wsl2_config.js';

const config = new WSL2Config({
    distribution: {
        name: 'Ubuntu-22.04',
        architecture: 'x64'
    },
    resources: {
        memory: { default: '4GB', minimum: '1GB', maximum: '16GB' },
        cpu: { default: '2 cores', minimum: '1 core', maximum: '8 cores' },
        disk: { default: '20GB', minimum: '10GB', maximum: '100GB' }
    },
    instances: {
        maxConcurrent: 10,
        autoCleanup: true
    }
});
```

## Error Handling

The integration provides comprehensive error handling with automatic retry logic and graceful degradation.

### Common Error Scenarios

1. **AgentAPI Server Unavailable**
   - Automatic retry with exponential backoff
   - Fallback to local validation if configured
   - Clear error messages and logging

2. **WSL2 Instance Creation Failure**
   - Resource availability checks
   - Alternative resource allocation
   - Cleanup of partial instances

3. **Repository Access Issues**
   - Authentication retry logic
   - Alternative clone methods
   - Detailed error reporting

4. **Validation Timeout**
   - Configurable timeout values
   - Partial result preservation
   - Session cleanup

### Error Recovery

```javascript
// Automatic retry with exponential backoff
const result = await client.retryOperation(async () => {
    return await client.createWSL2Instance(config);
}, 3);

// Graceful error handling
try {
    const session = await orchestrator.startPRValidation(prDetails);
} catch (error) {
    if (error.code === 'TIMEOUT') {
        // Handle timeout scenario
        await orchestrator.stopValidationSession(session.id);
    } else if (error.code === 'RESOURCE_EXHAUSTED') {
        // Handle resource exhaustion
        await orchestrator.cleanup();
    }
}
```

## Performance Optimization

### Resource Management

- **Instance Pooling**: Pre-allocated WSL2 instances for faster startup
- **Resource Monitoring**: Real-time tracking of CPU, memory, and disk usage
- **Automatic Cleanup**: Scheduled cleanup of completed environments
- **Load Balancing**: Distribution of workload across available instances

### Caching Strategies

- **Dependency Caching**: Cache installed packages and dependencies
- **Repository Caching**: Cache frequently accessed repositories
- **Result Caching**: Cache validation results for unchanged code

### Performance Metrics

```javascript
// Get performance statistics
const stats = await orchestrator.getStatistics();
console.log(`Average validation time: ${stats.averageValidationTime}ms`);
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Resource utilization: ${stats.resourceUtilization}%`);
```

## Security Considerations

### Authentication and Authorization

- **API Key Management**: Secure storage and rotation of API keys
- **Access Control**: Role-based access to AgentAPI endpoints
- **Network Security**: TLS encryption for all communications

### Isolation and Sandboxing

- **Process Isolation**: Each validation runs in isolated WSL2 environment
- **Network Isolation**: Restricted network access for validation environments
- **Resource Limits**: Enforced resource quotas to prevent abuse

### Data Protection

- **Credential Management**: Secure handling of repository credentials
- **Data Encryption**: Encryption of sensitive data in transit and at rest
- **Audit Logging**: Comprehensive logging of all operations

## Monitoring and Observability

### Metrics Collection

- **System Metrics**: CPU, memory, disk, and network usage
- **Application Metrics**: Validation times, success rates, error rates
- **Business Metrics**: PR processing throughput, issue detection rates

### Alerting

```javascript
// Configure alerts
monitor.on('alert:critical', (alert) => {
    console.error(`Critical alert: ${alert.message}`);
    // Send notification to operations team
});

monitor.on('alert:warning', (alert) => {
    console.warn(`Warning alert: ${alert.message}`);
    // Log for analysis
});
```

### Dashboards

- **Real-time Monitoring**: Live view of system health and performance
- **Historical Analysis**: Trends and patterns in validation metrics
- **Resource Utilization**: Tracking of WSL2 instance usage and efficiency

## Testing

### Unit Tests

```bash
npm test tests/integrations/agentapi.test.js
npm test tests/integrations/wsl2_environment.test.js
npm test tests/integrations/claude_code_orchestration.test.js
```

### Integration Tests

```bash
npm run test:integration
```

### Load Testing

```bash
npm run test:load
```

## Deployment

### Prerequisites

- Node.js 18+ 
- AgentAPI server running and accessible
- WSL2 enabled on Windows or compatible Linux environment
- Claude Code CLI installed and configured

### Installation

```bash
npm install
```

### Configuration

1. Copy environment variables template:
```bash
cp .env.example .env
```

2. Configure AgentAPI connection:
```bash
export AGENTAPI_BASE_URL=http://your-agentapi-server:3284
export AGENTAPI_KEY=your-api-key
```

3. Configure WSL2 settings:
```bash
export WSL2_DISTRIBUTION=Ubuntu-22.04
export WSL2_MAX_INSTANCES=10
```

### Starting the Integration

```javascript
import { AgentAPIIntegration } from './src/ai_cicd_system/integrations/index.js';

const integration = new AgentAPIIntegration({
    agentAPI: {
        baseUrl: process.env.AGENTAPI_BASE_URL,
        apiKey: process.env.AGENTAPI_KEY
    },
    wsl2: {
        maxInstances: parseInt(process.env.WSL2_MAX_INSTANCES)
    }
});

await integration.initialize();
console.log('AgentAPI Integration ready');
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check AgentAPI server status
   - Verify network connectivity
   - Confirm firewall settings

2. **WSL2 Instance Creation Fails**
   - Check WSL2 installation
   - Verify resource availability
   - Review system requirements

3. **Validation Timeout**
   - Increase timeout values
   - Check system performance
   - Review validation complexity

### Debug Mode

```bash
export LOG_LEVEL=debug
export DEBUG=agentapi:*
```

### Health Checks

```javascript
// Check system health
const health = await integration.healthCheck();
console.log('System health:', health);

// Check individual components
const agentAPIHealth = await client.getStatus();
const wsl2Health = await manager.getStatistics();
```

## API Reference

### AgentAPIClient

#### Methods

- `initialize()`: Initialize the client
- `createWSL2Instance(config)`: Create new WSL2 instance
- `executeCommand(instanceId, command)`: Execute command in instance
- `cloneRepository(instanceId, repoUrl, branch)`: Clone repository
- `startClaudeCodeValidation(instanceId, config)`: Start validation session
- `getResourceUsage(instanceId)`: Get resource metrics
- `destroyWSL2Instance(instanceId)`: Destroy instance

#### Events

- `connected`: Client connected to AgentAPI
- `instanceCreated`: WSL2 instance created
- `instanceReady`: WSL2 instance ready for use
- `validationStarted`: Validation session started
- `error`: Error occurred

### WSL2EnvironmentManager

#### Methods

- `createEnvironment(prDetails)`: Create environment for PR
- `getEnvironment(environmentId)`: Get environment details
- `listEnvironments()`: List all environments
- `cleanupEnvironment(environmentId)`: Cleanup environment

#### Events

- `environmentCreating`: Environment creation started
- `environmentReady`: Environment ready for use
- `setupStepStarted`: Setup step started
- `setupStepCompleted`: Setup step completed
- `resourceAlert`: Resource usage alert

### ClaudeCodeOrchestrator

#### Methods

- `startPRValidation(prDetails)`: Start PR validation
- `getValidationSession(sessionId)`: Get session details
- `stopValidationSession(sessionId)`: Stop validation session
- `listActiveSessions()`: List active sessions

#### Events

- `validationStarted`: Validation started
- `validationStepStarted`: Validation step started
- `validationStepCompleted`: Validation step completed
- `validationCompleted`: Validation completed
- `debuggingStarted`: Debugging session started

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Code Style

- Use ESLint configuration
- Follow JSDoc commenting standards
- Write comprehensive tests
- Update documentation

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review feedback

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- GitHub Issues: [Repository Issues](https://github.com/Zeeeepa/claude-task-master/issues)
- Documentation: [Full Documentation](https://github.com/Zeeeepa/claude-task-master/docs)
- AgentAPI Documentation: [AgentAPI Repository](https://github.com/Zeeeepa/agentapi)

