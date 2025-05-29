# AI Development Orchestrator - Agent Integration Guide

⚠️ **ARCHITECTURE CHANGE NOTICE** ⚠️

This file has been updated for the new **AI Development Orchestrator** architecture (v0.16.0+).

The previous CLI-based task management system has been completely replaced with an orchestrator-focused system.

## New Architecture Overview

The AI Development Orchestrator integrates:

- **Codegen SDK** - Primary AI development agent
- **Claude Code** - Secondary validation and review agent  
- **AgentAPI Middleware** - Communication layer between agents
- **Linear Integration** - Issue management and synchronization
- **WSL2 Deployment** - Automated PR validation and deployment

## Current Status: Phase 1.1 Complete ✅

**What's Available:**
- ✅ Basic orchestrator CLI entry point
- ✅ Simplified configuration system
- ✅ Clean architecture ready for new components

**What's Coming:**
- 🔄 Phase 1.2: Orchestrator core engine implementation
- 🔄 Phase 1.3: AgentAPI middleware integration
- 🔄 Phase 1.4: Database event storage system

## Configuration

Create `.orchestratorconfig` in your project root:

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

## Basic Usage (Placeholder - Implementation Pending)

```bash
# Start the orchestrator
task-master orchestrate

# Check system status
task-master status

# Configure integrations
task-master config

# View logs
task-master logs
```

## Migration from Legacy System

If you need the previous CLI-based task management functionality, please use version **0.15.x or earlier**.

The new system focuses on:
- Orchestrating AI development workflows
- Automated PR creation and validation
- Real-time Linear issue synchronization
- WSL2 deployment automation
- Comprehensive event logging

---

**Note:** This is a major architectural restructuring. Previous CLI commands and MCP integration are no longer available.

