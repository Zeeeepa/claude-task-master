# AI Development Orchestrator

A comprehensive AI-driven development orchestrator that bridges Codegen SDK and Claude Code through AgentAPI middleware.

## 🎯 Overview

The AI Development Orchestrator transforms traditional development workflows by providing:

- **Dual AI Coordination**: Seamless integration between Codegen SDK and Claude Code
- **AgentAPI Middleware**: Central communication hub for all AI agents
- **Event-Driven Architecture**: Comprehensive logging and state persistence
- **WSL2 Deployment**: Automated PR validation and deployment
- **Linear Integration**: Bidirectional synchronization with Linear for issue management

## 🚀 Quick Start

### Installation

```bash
npm install -g ai-development-orchestrator
```

### Configuration

1. **Set up environment variables**:

```bash
# Codegen SDK Configuration
CODEGEN_TOKEN=your_codegen_token
CODEGEN_ORG_ID=your_organization_id

# Claude Code Configuration
CLAUDE_WEB_CLIENT_CONFIRMATION=your_confirmation_token

# Linear Integration
LINEAR_API_TOKEN=your_linear_token

# GitHub Integration
GITHUB_TOKEN=your_github_token

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/orchestrator
```

2. **Start the orchestrator**:

```bash
orchestrator start --port 3000
```

## 🏗️ Architecture

### Core Components

- **Core Orchestrator**: Main orchestration engine
- **AgentAPI Middleware**: Request routing and response aggregation
- **Agent Coordination**: Dual AI agent management
- **Database Layer**: Event storage and state management
- **Integration Layer**: Linear, GitHub, and WSL2 connectors

### Workflow Example

```javascript
import { Orchestrator } from 'ai-development-orchestrator';

const orchestrator = new Orchestrator({
  codegenToken: process.env.CODEGEN_TOKEN,
  codegenOrgId: process.env.CODEGEN_ORG_ID,
  claudeConfirmation: process.env.CLAUDE_WEB_CLIENT_CONFIRMATION
});

await orchestrator.initialize();

// Execute a development workflow
const result = await orchestrator.executeWorkflow({
  name: 'feature-development',
  steps: [
    { type: 'analysis', agent: 'codegen' },
    { type: 'implementation', agent: 'claude' },
    { type: 'validation', agent: 'wsl2' },
    { type: 'deployment', agent: 'github' }
  ]
});
```

## 🔧 Configuration

### CLI Commands

```bash
# Start the orchestrator
orchestrator start [options]

# Check status
orchestrator status

# Configure settings
orchestrator config --codegen-token <token> --linear-token <token>
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CODEGEN_TOKEN` | Codegen SDK authentication token | Yes |
| `CODEGEN_ORG_ID` | Codegen organization ID | Yes |
| `CLAUDE_WEB_CLIENT_CONFIRMATION` | Claude Code confirmation token | Yes |
| `LINEAR_API_TOKEN` | Linear API token | Yes |
| `GITHUB_TOKEN` | GitHub API token | Yes |
| `DATABASE_URL` | PostgreSQL database connection string | Yes |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | No |

## 🤖 AI Agent Integration

### Codegen SDK

The orchestrator integrates with Codegen SDK for:
- Code analysis and generation
- Repository management
- Pull request automation

### Claude Code

Claude Code integration provides:
- Natural language processing
- Code review and suggestions
- Documentation generation

### AgentAPI Middleware

The middleware layer handles:
- Request routing between agents
- Response aggregation
- Load balancing and failover
- Authentication and authorization

## 🔄 Linear Integration

### Bidirectional Sync

- **Issue Creation**: Automatically create Linear issues from development activities
- **Status Updates**: Real-time synchronization of issue status
- **Comment Sync**: Bidirectional comment synchronization
- **Attachment Handling**: File and link attachment management

### Webhook Configuration

Configure Linear webhooks to point to your orchestrator:

```
POST https://your-orchestrator.com/webhooks/linear
```

## 🚀 WSL2 Deployment

### Automated Pipeline

The WSL2 deployment engine provides:
- Automated PR validation
- Containerized deployment environments
- Performance testing
- Rollback and recovery mechanisms

### Configuration

```yaml
# wsl2-config.yml
deployment:
  instances: 3
  timeout: 300
  validation:
    - lint
    - test
    - build
  monitoring:
    enabled: true
    metrics: ['cpu', 'memory', 'disk']
```

## 📊 Monitoring

### Metrics

The orchestrator provides comprehensive metrics:
- Task completion rates
- Agent performance
- System resource usage
- Error rates and patterns

### Health Checks

Built-in health checks monitor:
- Database connectivity
- Agent availability
- Integration status
- System resources

## 🧪 Development

### Local Setup

```bash
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master
npm install
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## 📚 API Documentation

### REST API

The orchestrator exposes a REST API for external integrations:

- `GET /api/status` - Get orchestrator status
- `POST /api/workflows` - Execute a workflow
- `GET /api/agents` - List available agents
- `POST /api/tasks` - Create a new task

### WebSocket Events

Real-time events are available via WebSocket:

- `workflow:started`
- `workflow:completed`
- `agent:status`
- `task:updated`

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License with Commons Clause. See [LICENSE](LICENSE) for details.

## 🆘 Support

- **Documentation**: [Full documentation](https://docs.ai-orchestrator.dev)
- **Issues**: [GitHub Issues](https://github.com/Zeeeepa/claude-task-master/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Zeeeepa/claude-task-master/discussions)

---

**AI Development Orchestrator** - Orchestrating the future of AI-driven development workflows.

