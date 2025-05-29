# AI Development Orchestrator - Scripts Documentation

⚠️ **ARCHITECTURE CHANGE NOTICE** ⚠️

This documentation has been updated for the new **AI Development Orchestrator** architecture (v0.16.0+).

## Overview

The AI Development Orchestrator has replaced the previous CLI-based task management system with a comprehensive orchestration platform that integrates:

- **Codegen SDK** - Primary AI development capabilities
- **Claude Code** - Secondary validation and review
- **AgentAPI Middleware** - Communication layer between AI agents
- **Linear Integration** - Issue management and synchronization
- **WSL2 Deployment** - Automated PR validation and deployment

## Current Architecture

### Core Components

```
├── bin/
│   └── task-master.js          # CLI entry point (orchestrator launcher)
├── scripts/
│   └── modules/
│       ├── config-manager.js   # Configuration management
│       ├── utils.js           # Utility functions
│       └── index.js           # Module exports
├── src/
│   ├── constants/             # Application constants
│   └── utils/                 # Core utilities
└── index.js                   # Main package entry (orchestrator)
```

### Configuration

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

## Development Status

### Phase 1: Core Infrastructure ⏳
- [x] **Phase 1.1** - Remove deprecated components & clean architecture ✅
- [ ] **Phase 1.2** - Implement orchestrator core engine
- [ ] **Phase 1.3** - Set up AgentAPI middleware integration
- [ ] **Phase 1.4** - Implement database event storage system

### Phase 2: AI Coordination ⏳
- [ ] **Phase 2.1** - Codegen SDK integration
- [ ] **Phase 2.2** - Claude Code integration  
- [ ] **Phase 2.3** - Dual agent coordination system
- [ ] **Phase 2.4** - Intelligent routing and load balancing

## Migration Notes

**From Legacy System:**
- Previous CLI commands (`task-master list`, `task-master add-task`, etc.) are no longer available
- MCP server functionality has been removed
- Multiple AI provider support has been removed
- Local JSON task storage has been removed

**To New System:**
- Focus on orchestrating AI development workflows
- Automated PR creation and validation
- Real-time Linear issue synchronization
- WSL2 deployment automation
- Comprehensive event logging

## Legacy Documentation

If you need the previous CLI-based task management functionality, please use version **0.15.x or earlier**.

For legacy documentation, see:
- `README-task-master.md` - Legacy system documentation
- `docs/DEPRECATED.md` - Deprecation notice for old documentation

---

**Note:** This is a major architectural restructuring. The previous task management scripts and CLI functionality are no longer available in the new orchestrator-based system.

