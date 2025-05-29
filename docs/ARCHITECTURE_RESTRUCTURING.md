# Task Master Architecture Restructuring

## 🎯 Project Overview

Transform Task Master from a standalone task management system into a comprehensive AI-driven development orchestrator that bridges Codegen SDK and Claude Code through AgentAPI middleware.

## 📊 Current vs Target Architecture

### Current Architecture (Complex)
```
Task Master (Current)
├── CLI Interface (bin/task-master.js)
├── MCP Server (mcp-server/)
├── Multiple AI Providers (7 providers)
│   ├── Anthropic
│   ├── OpenAI
│   ├── Google
│   ├── Ollama
│   ├── OpenRouter
│   ├── Perplexity
│   └── XAI
├── Scripts & Utilities
└── Task Management Core
```

### Target Architecture (Simplified)
```
Task Master Orchestrator
├── AgentAPI Middleware (Claude Code Interface)
├── Codegen SDK Integration (token + org_id)
├── Database Event Storage (PostgreSQL)
├── Linear Connector (Main + Sub-issue correlation)
└── WSL2 Deployment Engine (PR validation)
```

## 🏗️ Component Design

### 1. AgentAPI Middleware
- **Purpose**: HTTP API bridge for Claude Code communication
- **Replaces**: MCP Server
- **Interface**: RESTful API endpoints
- **Features**:
  - Task orchestration endpoints
  - Agent communication protocols
  - Event streaming for real-time updates

### 2. Codegen SDK Integration
- **Purpose**: Direct integration with Codegen platform
- **Configuration**: Token + org_id based authentication
- **Features**:
  - Code generation requests
  - Repository management
  - PR creation and management

### 3. Database Event Storage
- **Technology**: PostgreSQL
- **Purpose**: Comprehensive tracking of all development activities
- **Schema**:
  - Events table (all activities)
  - Tasks table (task management)
  - Agents table (agent coordination)
  - Deployments table (WSL2 tracking)

### 4. Linear Connector
- **Purpose**: Bidirectional sync with Linear
- **Features**:
  - Hierarchical issue management
  - Main + Sub-issue correlation
  - Status synchronization
  - Automated issue creation

### 5. WSL2 Deployment Engine
- **Purpose**: Automated PR deployment and validation
- **Features**:
  - PR deployment pipeline
  - Environment validation
  - Automated testing
  - Rollback capabilities

## 📋 Implementation Phases

### Phase 1: Core Infrastructure (Weeks 1-2)
1. **Phase 1.1**: Remove deprecated components and simplify codebase
2. **Phase 1.2**: Implement new folder structure and core architecture
3. **Phase 1.3**: Setup database event storage system

### Phase 2: AI Coordination (Weeks 3-4)
1. **Phase 2.1**: Implement AgentAPI middleware integration
2. **Phase 2.2**: Implement Codegen SDK integration

### Phase 3: Advanced Features (Weeks 5-6)
1. **Phase 3.1**: Implement Linear integration with bidirectional sync
2. **Phase 3.2**: Implement WSL2 PR deployment and validation pipeline

### Phase 4: Optimization & Documentation (Weeks 7-8)
1. **Phase 4.1**: System integration and end-to-end orchestration
2. **Phase 4.2**: Comprehensive documentation and deployment guide

## 🎯 Success Criteria

- [ ] 50% reduction in codebase complexity
- [ ] Functional dual AI coordination system
- [ ] Complete database event tracking
- [ ] Automated Linear issue creation and sync
- [ ] WSL2 PR deployment pipeline
- [ ] Comprehensive documentation

## 🔄 Migration Strategy

1. **Preserve Core Functionality**: Maintain task management capabilities throughout transition
2. **Incremental Replacement**: Replace components one at a time to minimize risk
3. **Backward Compatibility**: Ensure smooth transition for existing users
4. **Data Migration**: Preserve existing task data and configurations
5. **Testing Strategy**: Comprehensive testing at each phase boundary

## 📁 New Folder Structure

```
task-master-orchestrator/
├── src/
│   ├── core/
│   │   ├── orchestrator.js
│   │   ├── task-manager.js
│   │   └── event-store.js
│   ├── agents/
│   │   ├── codegen-agent.js
│   │   └── claude-agent.js
│   ├── middleware/
│   │   ├── agent-api.js
│   │   └── http-server.js
│   ├── integrations/
│   │   ├── linear-connector.js
│   │   ├── codegen-sdk.js
│   │   └── wsl2-deployer.js
│   ├── database/
│   │   ├── models/
│   │   ├── migrations/
│   │   └── connection.js
│   └── utils/
├── config/
│   ├── database.js
│   ├── agents.js
│   └── deployment.js
├── docs/
│   ├── api/
│   ├── deployment/
│   └── architecture/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## 🔧 Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Database**: PostgreSQL
- **API Framework**: Express.js
- **Agent Communication**: HTTP/WebSocket
- **Deployment**: WSL2 + Docker
- **Testing**: Jest
- **Documentation**: Markdown + API docs

## 🚀 Getting Started

Each phase will be implemented as a separate sub-issue with detailed implementation instructions and acceptance criteria. The project will maintain backward compatibility during the transition period.

