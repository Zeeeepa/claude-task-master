# AgentAPI Middleware Integration

A robust middleware solution for controlling Claude Code, Goose, Aider, and Codex agents for PR validation and debugging on WSL2 instances.

## 🎯 Overview

This AgentAPI middleware provides:

- **HTTP API** for controlling multiple coding agents
- **PR Deployment Automation** with isolated workspaces
- **Code Validation** and error debugging
- **State Management** and monitoring
- **WSL2 Environment** setup and configuration
- **Health Monitoring** and alerting
- **Error Recovery** and resilience

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CI/CD System  │───▶│  AgentAPI       │───▶│  Coding Agents  │
│   (Webhooks)    │    │  Middleware     │    │  (Claude, etc.) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  WSL2 Workspace │
                       │  Environment    │
                       └─────────────────┘
```

### Core Components

1. **AgentAPI Server** (`middleware/agentapi/server.js`)
   - Express.js HTTP server
   - RESTful API endpoints
   - WebSocket support for real-time updates

2. **Agent Manager** (`middleware/agentapi/agent-manager.js`)
   - Manages agent lifecycle
   - Handles agent communication
   - Monitors agent health

3. **PR Deployment Service** (`middleware/agentapi/pr-deployment.js`)
   - Automated PR branch deployment
   - Code validation and testing
   - Error debugging and fixes

4. **State Manager** (`middleware/agentapi/state-manager.js`)
   - Centralized state tracking
   - Persistent storage
   - History management

5. **Health Monitor** (`middleware/agentapi/health-monitor.js`)
   - System resource monitoring
   - Performance metrics
   - Alerting and notifications

6. **Error Handler** (`middleware/agentapi/error-handler.js`)
   - Error classification and recovery
   - Retry strategies
   - Failure analysis

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- WSL2 (Windows) or Linux environment
- Git
- API keys for agents (Anthropic, OpenAI, etc.)

### Installation

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd claude-task-master
   npm install
   ```

2. **WSL2 Setup** (if on Windows):
   ```bash
   # Copy WSL2 config to Windows user directory
   cp wsl2-setup/.wslconfig ~/.wslconfig
   
   # Run setup script in WSL2
   chmod +x wsl2-setup/setup.sh
   ./wsl2-setup/setup.sh
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start the Server**:
   ```bash
   cd middleware/agentapi
   node server.js
   ```

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Server Configuration
AGENTAPI_HOST=localhost
AGENTAPI_PORT=3285
WORKSPACE_ROOT=/tmp/agentapi-workspaces

# Agent API Keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here

# Agent Configuration
CLAUDE_COMMAND=claude
GOOSE_COMMAND=goose
AIDER_COMMAND=aider
CODEX_COMMAND=codex

# Resource Limits
MAX_CONCURRENT_WORKSPACES=10
MAX_CONCURRENT_DEPLOYMENTS=5

# Monitoring
HEALTH_CHECK_INTERVAL=30000
METRICS_RETENTION=86400000

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=/tmp/agentapi.log

# WSL2 Configuration
WSL2_ENABLED=true
WSL2_MEMORY_LIMIT=4g
WSL2_PROCESSORS=2
```

## 📡 API Endpoints

### Health and Status

- `GET /health` - System health check
- `GET /metrics` - Performance metrics
- `GET /agent-status` - All agent statuses
- `GET /task-progress` - Task progress tracking

### Agent Management

- `POST /agents/{type}/start` - Start an agent
- `POST /agents/{type}/stop` - Stop an agent
- `GET /agents/{type}/status` - Get agent status
- `GET /agents` - List all agents

### PR Deployment

- `POST /deploy-pr` - Deploy PR branch
- `POST /validate-code` - Run code validation
- `POST /debug-errors` - Debug and fix errors

### Agent Communication

- `POST /agents/{type}/message` - Send message to agent
- `GET /agents/{type}/messages` - Get conversation history
- `GET /agents/{type}/events` - SSE stream of agent events

### Workspace Management

- `GET /workspaces` - List active workspaces
- `DELETE /workspaces/{id}` - Cleanup workspace

## 🔧 Configuration

### Agent Configuration

Each agent can be configured in `middleware/config/agentapi.js`:

```javascript
agents: {
  claude: {
    command: 'claude',
    defaultArgs: ['--allowedTools', 'Bash(git*) Edit Replace'],
    envVars: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
    healthCheck: {
      timeout: 30000,
      retries: 3,
    },
    capabilities: ['code-editing', 'git-operations', 'debugging'],
  },
  // ... other agents
}
```

### Validation Rules

Configure validation rules for code quality:

```javascript
validation: {
  rules: [
    'syntax-check',
    'lint-check', 
    'test-run',
    'build-check',
  ],
  timeout: 300000, // 5 minutes
}
```

### Resource Limits

Set resource limits for agents and workspaces:

```javascript
resourceLimits: {
  memory: '1g',
  cpu: '1.0',
  diskSpace: '10g',
}
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: AgentAPI Validation
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy PR to AgentAPI
        run: |
          curl -X POST ${{ secrets.AGENTAPI_URL }}/deploy-pr \
            -H "Content-Type: application/json" \
            -d '{
              "repoUrl": "${{ github.repository }}",
              "prNumber": "${{ github.event.number }}",
              "branch": "${{ github.head_ref }}"
            }'
      
      - name: Validate Code
        run: |
          curl -X POST ${{ secrets.AGENTAPI_URL }}/validate-code \
            -H "Content-Type: application/json" \
            -d '{
              "workspaceId": "pr-${{ github.event.number }}",
              "agentType": "claude"
            }'
```

### Webhook Integration

Configure webhooks to automatically trigger deployments:

```javascript
// Webhook handler example
app.post('/webhook/github', (req, res) => {
  const { action, pull_request } = req.body;
  
  if (action === 'opened' || action === 'synchronize') {
    deployPR({
      repoUrl: pull_request.head.repo.clone_url,
      prNumber: pull_request.number,
      branch: pull_request.head.ref,
    });
  }
  
  res.status(200).send('OK');
});
```

## 🖥️ Web Interface

Access the web dashboard at `http://localhost:3285`:

- **System Health** - Monitor server status and resources
- **Agent Management** - Start, stop, and monitor agents
- **Workspace Overview** - View active deployments
- **Real-time Logs** - Monitor system activity
- **Metrics Dashboard** - Performance and usage statistics

## 🔍 Monitoring and Alerting

### Health Checks

The system continuously monitors:

- **System Resources** (CPU, Memory, Disk)
- **Agent Health** (Response times, error rates)
- **Workspace Status** (Active deployments, disk usage)
- **Network Connectivity** (API endpoints, external services)

### Alert Thresholds

Configure alert thresholds:

```javascript
alertThresholds: {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 85, critical: 95 },
  agentResponseTime: { warning: 10000, critical: 30000 },
  errorRate: { warning: 0.1, critical: 0.25 },
}
```

### Notifications

Set up notifications via:

- **Webhooks** - Send alerts to external systems
- **Email** - SMTP-based email notifications
- **Logs** - Structured logging for analysis

## 🛠️ Troubleshooting

### Common Issues

1. **Agent Not Starting**
   ```bash
   # Check agent installation
   which claude goose aider codex
   
   # Check API keys
   echo $ANTHROPIC_API_KEY
   echo $OPENAI_API_KEY
   
   # Check logs
   journalctl -u agentapi -f
   ```

2. **Workspace Cleanup Issues**
   ```bash
   # Manual cleanup
   rm -rf /tmp/agentapi-workspaces/pr-*
   
   # Check disk space
   df -h
   ```

3. **Performance Issues**
   ```bash
   # Check system resources
   htop
   
   # Monitor agent processes
   ps aux | grep -E "(claude|goose|aider|codex)"
   
   # Check memory usage
   free -h
   ```

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
export NODE_ENV=development
node server.js
```

### Health Check Script

Use the built-in health check:

```bash
# Manual health check
curl http://localhost:3285/health

# Automated health check
./wsl2-setup/scripts/health-check.sh
```

## 🔒 Security Considerations

### API Security

- **Rate Limiting** - Prevent API abuse
- **CORS Configuration** - Control cross-origin requests
- **Input Validation** - Sanitize all inputs
- **Authentication** - Secure API endpoints (optional)

### Environment Security

- **API Key Management** - Secure storage of credentials
- **Workspace Isolation** - Prevent cross-contamination
- **Resource Limits** - Prevent resource exhaustion
- **Network Security** - Firewall configuration

### WSL2 Security

- **User Isolation** - Dedicated service user
- **File Permissions** - Proper access controls
- **Process Limits** - Resource constraints
- **Update Management** - Regular security updates

## 📈 Performance Optimization

### Resource Management

- **Concurrent Limits** - Control parallel operations
- **Memory Limits** - Prevent memory leaks
- **Disk Cleanup** - Automatic workspace cleanup
- **Process Monitoring** - Track resource usage

### Caching Strategies

- **State Caching** - In-memory state management
- **Workspace Reuse** - Optimize deployment times
- **Agent Pooling** - Reuse agent instances
- **Metric Aggregation** - Efficient data collection

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Load Testing

```bash
# Test concurrent deployments
for i in {1..5}; do
  curl -X POST localhost:3285/deploy-pr \
    -H "Content-Type: application/json" \
    -d "{\"repoUrl\":\"test-repo\",\"prNumber\":$i,\"branch\":\"test-$i\"}" &
done
```

## 📚 Additional Resources

- [AgentAPI Documentation](https://github.com/Zeeeepa/agentapi)
- [Claude Code Documentation](https://github.com/anthropics/claude-code)
- [Goose Documentation](https://github.com/block/goose)
- [Aider Documentation](https://github.com/Aider-AI/aider)
- [WSL2 Documentation](https://docs.microsoft.com/en-us/windows/wsl/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the troubleshooting guide
- Review the logs and metrics
- Contact the development team

---

**Note**: This middleware is designed for development and testing environments. For production use, additional security hardening and monitoring may be required.

