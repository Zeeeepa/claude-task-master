# AI Development Orchestrator [![GitHub stars](https://img.shields.io/github/stars/eyaltoledano/claude-task-master?style=social)](https://github.com/eyaltoledano/claude-task-master/stargazers)

[![CI](https://github.com/eyaltoledano/claude-task-master/actions/workflows/ci.yml/badge.svg)](https://github.com/eyaltoledano/claude-task-master/actions/workflows/ci.yml) [![npm version](https://badge.fury.io/js/task-master-ai.svg)](https://badge.fury.io/js/task-master-ai) [![Discord](https://dcbadge.limes.pink/api/server/https://discord.gg/taskmasterai?style=flat)](https://discord.gg/taskmasterai) [![License: MIT with Commons Clause](https://img.shields.io/badge/license-MIT%20with%20Commons%20Clause-blue.svg)](LICENSE)

### By [@eyaltoledano](https://x.com/eyaltoledano) & [@RalphEcom](https://x.com/RalphEcom)

[![Twitter Follow](https://img.shields.io/twitter/follow/eyaltoledano?style=flat)](https://x.com/eyaltoledano)
[![Twitter Follow](https://img.shields.io/twitter/follow/RalphEcom?style=flat)](https://x.com/RalphEcom)

**AI Development Orchestrator** - A comprehensive system that bridges Codegen SDK and Claude Code through AgentAPI middleware, providing automated development lifecycle management from requirements analysis to deployment validation.

## 🎯 Overview

This project has been restructured from a CLI-based task management system into a cutting-edge AI development orchestrator that:

- **Integrates Codegen SDK** (token + org_id) with **Claude Code** (webClientConfirmation)
- **Uses AgentAPI** as middleware for seamless AI agent communication
- **Implements comprehensive database** event storage for all development activities
- **Provides automated PR deployment** and validation on WSL2 instances
- **Maintains bidirectional sync** with Linear for issue management

## 🏗️ Architecture

### Core Components

1. **Orchestrator Engine** - Central coordination system
2. **AgentAPI Middleware** - Communication layer between AI agents
3. **Dual AI Integration** - Codegen SDK + Claude Code coordination
4. **Event Storage System** - Comprehensive logging and state persistence
5. **Linear Integration** - Issue management and synchronization
6. **WSL2 Deployment** - Automated PR validation and deployment

### Current Status: Phase 1.1 Complete ✅

**What's Been Removed:**
- ❌ MCP server components and dependencies
- ❌ Multiple AI provider support (OpenAI, Anthropic, Perplexity, etc.)
- ❌ Complex CLI interface and terminal UI components
- ❌ Manual configuration management system
- ❌ Standalone task management and local JSON storage
- ❌ Legacy `.taskmasterconfig` files

**What's Been Simplified:**
- ✅ Streamlined package.json (reduced dependencies by ~70%)
- ✅ Basic orchestrator CLI entry point
- ✅ Simplified configuration system focused on core integrations
- ✅ Clean codebase architecture ready for new components

## 🚀 Quick Start

### Installation

```bash
npm install -g task-master-ai
```

### Basic Usage

```bash
# Start the orchestrator (placeholder - implementation pending)
task-master orchestrate

# Check system status
task-master status

# Configure integrations
task-master config

# View logs
task-master logs
```

## ⚙️ Configuration

The orchestrator uses `.orchestratorconfig` for configuration:

```json
{
  "codegen": {
    "token": "your-codegen-token",
    "orgId": "your-org-id",
    "apiUrl": "https://api.codegen.sh"
  },
  "claude": {
    "webClientConfirmation": "your-confirmation-token",
    "apiKey": "your-claude-api-key"
  },
  "agentapi": {
    "baseUrl": "http://localhost:8000",
    "enabled": true
  },
  "linear": {
    "apiKey": "your-linear-api-key",
    "teamId": "your-team-id"
  },
  "wsl2": {
    "enabled": true,
    "instanceName": "default"
  },
  "database": {
    "type": "sqlite",
    "path": "./orchestrator.db"
  }
}
```

## 🛣️ Roadmap

### Phase 1: Core Infrastructure ⏳
- [x] **Phase 1.1** - Remove deprecated components & clean architecture
- [ ] **Phase 1.2** - Implement orchestrator core engine
- [ ] **Phase 1.3** - Set up AgentAPI middleware integration
- [ ] **Phase 1.4** - Implement database event storage system

### Phase 2: AI Coordination ⏳
- [ ] **Phase 2.1** - Codegen SDK integration
- [ ] **Phase 2.2** - Claude Code integration  
- [ ] **Phase 2.3** - Dual agent coordination system
- [ ] **Phase 2.4** - Intelligent routing and load balancing

### Phase 3: Advanced Features ⏳
- [ ] **Phase 3.1** - Linear integration and issue sync
- [ ] **Phase 3.2** - WSL2 deployment automation
- [ ] **Phase 3.3** - Real-time monitoring and alerting
- [ ] **Phase 3.4** - Advanced workflow orchestration

### Phase 4: Optimization & Testing ⏳
- [ ] **Phase 4.1** - Performance optimization
- [ ] **Phase 4.2** - Comprehensive testing suite
- [ ] **Phase 4.3** - Documentation and examples
- [ ] **Phase 4.4** - Production deployment guides

## 🔧 Development

### Project Structure

```
├── bin/
│   └── task-master.js          # CLI entry point
├── scripts/
│   └── modules/
│       ├── config-manager.js   # Configuration management
│       ├── utils.js           # Utility functions
│       └── index.js           # Module exports
├── src/
│   ├── constants/             # Application constants
│   └── utils/                 # Core utilities
├── index.js                   # Main package entry
└── package.json              # Simplified dependencies
```

### Contributing

This project is in active restructuring. Current focus:

1. **Phase 1.1 Complete** ✅ - Architecture cleanup finished
2. **Phase 1.2 Next** - Implementing orchestrator core engine
3. **Looking for contributors** for AgentAPI middleware integration

## 📄 License

MIT License with Commons Clause - see [LICENSE](LICENSE) for details.

## 🤝 Support

- **Discord**: [Join our community](https://discord.gg/taskmasterai)
- **Issues**: [GitHub Issues](https://github.com/eyaltoledano/claude-task-master/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eyaltoledano/claude-task-master/discussions)

---

**Note**: This is a major architectural restructuring. The previous CLI-based task management functionality has been removed in favor of the new orchestrator-based system. If you need the legacy functionality, please use version 0.14.x or earlier.

