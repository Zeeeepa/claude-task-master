# AgentAPI Middleware Architecture

## Overview

The AgentAPI Middleware Integration provides a robust, scalable, and fault-tolerant system for orchestrating Claude Code, Goose, Aider, and Codex on WSL2 instances. This middleware layer enables seamless PR branch deployment, validation, and debugging within the AI CI/CD system.

## Architecture Components

### 1. AgentAPI Client (`agentapi_client.js`)

The AgentAPI Client provides a robust HTTP client for communicating with the AgentAPI server.

**Key Features:**
- Circuit breaker pattern for fault tolerance
- Exponential backoff retry mechanism
- Connection pooling and keep-alive
- Request/response validation
- Comprehensive error handling
- Performance metrics collection
- Health monitoring

**Circuit Breaker States:**
- `CLOSED`: Normal operation, requests flow through
- `OPEN`: Circuit is open, requests fail fast
- `HALF_OPEN`: Testing if service has recovered

**Retry Strategy:**
- Exponential backoff with jitter
- Configurable retry attempts (default: 3)
- Non-retryable errors (4xx status codes)
- Maximum retry delay: 30 seconds

### 2. WSL2 Manager (`wsl2_manager.js`)

The WSL2 Manager handles automated provisioning and management of WSL2 instances.

**Key Features:**
- Automated WSL2 instance provisioning
- Resource allocation and monitoring
- Instance lifecycle management
- Network security and isolation
- Performance optimization
- Cleanup and garbage collection

**Instance Lifecycle:**
1. **Creating**: Instance is being provisioned
2. **Running**: Instance is active and ready
3. **Stopped**: Instance is stopped but preserved
4. **Destroyed**: Instance is completely removed

**Resource Management:**
- Memory limits per instance
- CPU allocation
- Disk space monitoring
- Network isolation
- Firewall configuration

### 3. Claude Code Integration (`claude_code_integration.js`)

The Claude Code Integration orchestrates the entire PR validation workflow.

**Key Features:**
- Claude Code session management
- PR branch cloning and setup
- Code validation and testing
- Error detection and reporting
- Performance monitoring
- Automated debugging workflows

**Validation Pipeline:**
1. **Instance Creation**: Provision WSL2 instance
2. **Code Deployment**: Clone PR branch and setup environment
3. **Session Start**: Initialize Claude Code session
4. **Validation**: Run tests, linting, security checks, code review
5. **Report Generation**: Compile comprehensive validation report
6. **Cleanup**: Destroy instance and cleanup resources

### 4. Agent Session Manager (`agent_session_manager.js`)

The Agent Session Manager provides comprehensive lifecycle management for long-running agent sessions.

**Key Features:**
- Session lifecycle management
- Resource monitoring and limits
- Automatic cleanup and garbage collection
- Session persistence and recovery
- Performance metrics and health monitoring
- Concurrent session coordination

**Session States:**
- `creating`: Session is being initialized
- `active`: Session is running and ready
- `stopping`: Session is being terminated
- `stopped`: Session has been terminated
- `recovered`: Session was restored from persistence

## Data Flow

```mermaid
graph TD
    A[GitHub PR Event] --> B[Webhook Handler]
    B --> C[Claude Code Integration]
    C --> D[WSL2 Manager]
    D --> E[Create WSL2 Instance]
    E --> F[Deploy PR Code]
    F --> G[Agent Session Manager]
    G --> H[Start Claude Code Session]
    H --> I[AgentAPI Client]
    I --> J[AgentAPI Server]
    J --> K[Claude Code Agent]
    K --> L[Validation Pipeline]
    L --> M[Generate Report]
    M --> N[Cleanup Resources]
    N --> O[Update PR Status]
```

## Configuration

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

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_task_master

# Monitoring
ENABLE_METRICS=true
METRICS_INTERVAL=60000
HEALTH_CHECK_INTERVAL=30000
```

### Configuration File

The system uses a comprehensive JSON configuration file (`config/agentapi_config.json`) that defines all aspects of the middleware behavior.

## Security Considerations

### Network Security
- WSL2 instances are isolated with firewall rules
- Only necessary ports are exposed
- DNS servers are configured for security
- Network traffic is monitored

### Authentication & Authorization
- JWT-based authentication for API access
- Role-based access control
- API key management
- Rate limiting to prevent abuse

### Data Protection
- Sensitive data is encrypted at rest
- Secure credential management
- Audit logging for all operations
- Regular security scans

## Performance Optimization

### Connection Management
- HTTP connection pooling
- Keep-alive connections
- Request pipelining where appropriate
- Connection timeout management

### Resource Optimization
- Lazy loading of components
- Efficient memory management
- CPU usage monitoring
- Disk space optimization

### Caching Strategy
- Response caching for frequently accessed data
- Session state caching
- Configuration caching
- Intelligent cache invalidation

## Monitoring & Observability

### Metrics Collection
- Request/response metrics
- Resource usage metrics
- Error rates and types
- Performance benchmarks

### Health Monitoring
- Component health checks
- Service availability monitoring
- Resource threshold alerts
- Automated recovery procedures

### Logging
- Structured JSON logging
- Log level configuration
- Log rotation and archival
- Centralized log aggregation

## Error Handling & Recovery

### Error Categories
1. **Transient Errors**: Network timeouts, temporary service unavailability
2. **Permanent Errors**: Authentication failures, invalid requests
3. **Resource Errors**: Memory exhaustion, disk space issues
4. **Configuration Errors**: Invalid settings, missing dependencies

### Recovery Strategies
- Automatic retry with exponential backoff
- Circuit breaker pattern for service protection
- Graceful degradation when services are unavailable
- Automatic cleanup of failed operations

### Alerting
- Real-time error notifications
- Threshold-based alerts
- Escalation procedures
- Integration with monitoring systems

## Scalability Considerations

### Horizontal Scaling
- Multiple AgentAPI instances
- Load balancing across instances
- Session affinity management
- Distributed session storage

### Vertical Scaling
- Resource limit adjustments
- Performance tuning
- Memory optimization
- CPU utilization improvements

### Auto-scaling
- Dynamic instance provisioning
- Load-based scaling decisions
- Resource usage monitoring
- Cost optimization

## Deployment Strategies

### Development Environment
- Local WSL2 instances
- Mock services for testing
- Debug logging enabled
- Hot reload for development

### Staging Environment
- Production-like configuration
- Integration testing
- Performance testing
- Security testing

### Production Environment
- High availability setup
- Monitoring and alerting
- Backup and recovery
- Security hardening

## Troubleshooting Guide

### Common Issues

1. **WSL2 Instance Creation Failures**
   - Check WSL2 availability
   - Verify resource limits
   - Review distribution installation
   - Check disk space

2. **AgentAPI Connection Issues**
   - Verify AgentAPI server status
   - Check network connectivity
   - Review authentication credentials
   - Examine firewall rules

3. **Session Management Problems**
   - Check session limits
   - Review resource usage
   - Verify persistence directory
   - Examine session logs

4. **Performance Issues**
   - Monitor resource usage
   - Check connection pooling
   - Review caching configuration
   - Analyze request patterns

### Diagnostic Commands

```bash
# Check WSL2 status
wsl --status
wsl --list --verbose

# Monitor system resources
htop
iotop
nethogs

# Check service status
systemctl status docker
systemctl status ssh

# View logs
tail -f logs/agentapi-middleware.log
journalctl -u wsl2-manager

# Test connectivity
curl -v http://localhost:8000/api/v1/health
ping agentapi-server
```

## API Reference

### AgentAPI Client Methods

```javascript
// Create session
const session = await agentAPI.startAgentSession('claude', config);

// Send message
const response = await agentAPI.sendMessage(sessionId, message);

// Get status
const status = await agentAPI.getSessionStatus(sessionId);

// Stop session
await agentAPI.stopAgentSession(sessionId);

// Health check
const health = await agentAPI.healthCheck();
```

### WSL2 Manager Methods

```javascript
// Create instance
const instance = await wsl2Manager.createInstance(options);

// Deploy code
await wsl2Manager.deployCode(instanceId, codeData);

// Get status
const status = await wsl2Manager.getInstanceStatus(instanceId);

// Stop instance
await wsl2Manager.stopInstance(instanceId);

// Destroy instance
await wsl2Manager.destroyInstance(instanceId);
```

### Claude Code Integration Methods

```javascript
// Deploy and validate PR
const deployment = await claudeCode.deployAndValidatePR(prData, options);

// Get deployment status
const status = claudeCode.getDeploymentStatus(deploymentId);

// Cleanup deployment
await claudeCode.cleanupDeployment(deploymentId);
```

## Best Practices

### Development
- Use TypeScript for better type safety
- Implement comprehensive unit tests
- Follow consistent coding standards
- Use dependency injection for testability

### Operations
- Monitor all critical metrics
- Implement proper logging
- Use configuration management
- Automate deployment processes

### Security
- Regular security audits
- Keep dependencies updated
- Use secure communication protocols
- Implement proper access controls

### Performance
- Profile critical code paths
- Optimize database queries
- Use appropriate caching strategies
- Monitor resource usage

## Future Enhancements

### Planned Features
- Multi-cloud WSL2 support
- Advanced load balancing
- Machine learning-based optimization
- Enhanced security features

### Roadmap
- Q1: Multi-agent orchestration
- Q2: Advanced monitoring dashboard
- Q3: Auto-scaling implementation
- Q4: Cloud-native deployment

## Contributing

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Run tests: `npm test`
5. Start development server: `npm run dev`

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

## Support

### Documentation
- API documentation: `/docs/api`
- Configuration guide: `/docs/configuration`
- Troubleshooting: `/docs/troubleshooting`

### Community
- GitHub Issues: Report bugs and feature requests
- Discussions: Community support and questions
- Wiki: Additional documentation and examples

### Commercial Support
- Enterprise support available
- Custom development services
- Training and consulting
- SLA-backed support options

