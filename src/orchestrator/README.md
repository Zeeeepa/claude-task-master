# Task Orchestration Engine & Workflow Management

Central coordination hub for the unified AI CI/CD development flow system that manages the complete workflow lifecycle from natural language task creation to automated code deployment and validation.

## 🎯 Overview

The Task Orchestration Engine is the central coordinator for the entire CI/CD system, providing:

- **Task Lifecycle Management**: Complete orchestration from creation to deployment
- **Flexible Workflow System**: Configurable workflows for different task types
- **Natural Language Processing**: AI-powered task parsing and enhancement
- **Error Handling & Recovery**: Comprehensive fault tolerance and retry mechanisms
- **Real-time Monitoring**: Performance metrics and execution tracking
- **Multi-stage Coordination**: Seamless integration between all system components

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Orchestration Engine                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ Task Parser     │    │ Workflow State  │    │ Task Execution  │ │
│  │ (NL → Struct)   │    │ Machine         │    │ Tracking        │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│           │                       │                       │        │
│           ▼                       ▼                       ▼        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │              Task Orchestrator (Core Engine)              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│           │                       │                       │        │
│           ▼                       ▼                       ▼        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ Claude Code     │    │ GitHub PR       │    │ Webhook         │ │
│  │ Executor        │    │ Management      │    │ Validation      │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Core Components

### 1. TaskOrchestrator
Main orchestration engine that coordinates the complete CI/CD workflow lifecycle.

**Key Features:**
- Multi-stage workflow execution
- Parallel task processing (up to 20 concurrent tasks)
- Error handling with intelligent retry
- Resource management and monitoring
- Real-time execution tracking

### 2. WorkflowStateMachine
Flexible workflow definitions and state management for different task types.

**Supported Workflows:**
- `default`: Standard development workflow
- `hotfix`: Fast-track workflow for critical fixes
- `feature`: Comprehensive workflow for new features
- `bugfix`: Standard workflow for bug fixes
- `refactor`: Workflow for code refactoring tasks
- `experimental`: Workflow for experimental features

### 3. TaskParser
AI-powered natural language processing to convert requirements into structured tasks.

**Capabilities:**
- Natural language understanding
- Task type classification
- Priority and complexity estimation
- Acceptance criteria extraction
- Risk factor identification

### 4. TaskExecution
Comprehensive execution tracking and state management.

**Features:**
- Real-time progress monitoring
- Detailed logging and metrics
- Retry management
- Resource usage tracking
- Performance analytics

## 📋 Workflow Stages

### Standard Stages
1. **Analysis** - Analyze requirements and plan implementation
2. **Code Generation** - Generate or modify code using Claude Code
3. **Testing** - Run automated tests and quality checks
4. **PR Creation** - Create pull request with changes
5. **Validation** - Validate changes through CI/CD pipeline
6. **Deployment** - Deploy changes to target environment

### Stage Configuration
Each stage supports:
- Custom timeouts and retry policies
- Resource requirements specification
- Dependency management
- Success/failure criteria
- Optional vs required execution

## 🔧 Configuration

### Environment Variables
```bash
# Concurrency Settings
MAX_PARALLEL_TASKS=20
MAX_STAGE_RETRIES=3
TASK_TIMEOUT_MS=1800000

# Workflow Settings
WORKFLOW_DEFAULT_TIMEOUT=600000
WORKFLOW_RETRY_DELAY=30000
WORKFLOW_MAX_RETRIES=3

# AI Configuration
AI_MODEL=claude-3-5-sonnet-20241022
AI_MAX_TOKENS=4000
AI_TEMPERATURE=0.1

# Monitoring
METRICS_INTERVAL=30000
HEALTH_CHECK_INTERVAL=60000
ENABLE_DETAILED_LOGGING=true

# Database
DATABASE_URL=postgresql://user:pass@localhost/db

# AgentAPI
AGENT_API_URL=http://localhost:3000
AGENT_API_TIMEOUT=300000

# GitHub
GITHUB_TOKEN=your_token_here
GITHUB_WEBHOOK_SECRET=your_secret_here
```

### Programmatic Configuration
```javascript
import { TaskOrchestrator, getConfig } from './src/orchestrator/index.js';

const orchestrator = new TaskOrchestrator({
  concurrency: {
    maxParallelTasks: 10,
    maxStageRetries: 2,
    timeoutMs: 900000
  },
  workflows: {
    defaultTimeout: 300000,
    retryDelay: 15000,
    maxRetries: 2
  },
  ai: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1
  }
});
```

## 💻 Usage Examples

### Basic Task Processing
```javascript
import { TaskOrchestrator } from './src/orchestrator/index.js';

const orchestrator = new TaskOrchestrator();

// Process a task
const result = await orchestrator.processTask('task-123');
console.log('Task completed:', result);
```

### Natural Language Task Creation
```javascript
import { TaskParser } from './src/orchestrator/index.js';

const parser = new TaskParser();

const input = `
  Fix the login bug that's preventing users from accessing their accounts.
  This is urgent and affecting production users.
`;

const task = await parser.parseNaturalLanguage(input);
console.log('Parsed task:', task);
```

### Custom Workflow Definition
```javascript
import { WorkflowStateMachine } from './src/orchestrator/index.js';

const stateMachine = new WorkflowStateMachine();

// Register custom workflow
stateMachine.registerWorkflow('data_migration', {
  name: 'Data Migration Workflow',
  stages: [
    { name: 'backup', type: 'backup', required: true },
    { name: 'migration', type: 'migration', required: true },
    { name: 'verification', type: 'verification', required: true }
  ]
});

const workflow = stateMachine.createWorkflow('data_migration');
```

### Full System Initialization
```javascript
import { initializeOrchestrator } from './src/orchestrator/index.js';

const system = await initializeOrchestrator({
  config: {
    concurrency: { maxParallelTasks: 15 }
  },
  customWorkflows: {
    'ml_training': { /* workflow definition */ }
  },
  enableHealthChecks: true,
  enableMetrics: true
});
```

## 📊 Monitoring & Metrics

### Real-time Metrics
- Tasks processed, succeeded, failed
- Success/failure rates
- Average execution times
- Active executions count
- Resource usage statistics

### Health Checks
- Failure rate monitoring
- Execution time thresholds
- Queue depth alerts
- Resource usage warnings

### Performance Criteria
- **Task Processing**: < 30 seconds for simple tasks
- **Concurrency**: Support 20+ parallel task executions
- **Reliability**: 99% task completion success rate
- **Recovery**: Automatic retry with intelligent backoff

## 🧪 Testing

### Running Tests
```bash
# Unit tests
npm test src/orchestrator/tests/

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Test Coverage
- Task orchestration logic: >95%
- Workflow state management: >90%
- Error handling scenarios: >85%
- Natural language parsing: >80%

## 🔗 Integration Points

### Dependencies
- **Error Handler**: Enterprise-grade fault tolerance
- **Database Models**: Task and execution persistence
- **Claude Code Executor**: Code generation via AgentAPI
- **GitHub API**: PR creation and management
- **Webhook System**: Validation pipeline integration

### External Services
- **AgentAPI**: HTTP middleware for Claude Code control
- **PostgreSQL**: Task and execution data storage
- **GitHub**: Repository and PR management
- **CI/CD Pipeline**: Automated validation and deployment

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Initialize Database**
   ```bash
   npm run db:migrate
   ```

4. **Start the System**
   ```javascript
   import { initializeOrchestrator } from './src/orchestrator/index.js';
   
   const system = await initializeOrchestrator();
   console.log('Orchestration system ready!');
   ```

5. **Process Your First Task**
   ```javascript
   const result = await system.orchestrator.processTask('your-task-id');
   ```

## 📚 API Reference

### TaskOrchestrator
- `processTask(taskId)` - Process a task through complete workflow
- `executeWorkflow(task, execution)` - Execute workflow stages
- `cancelExecution(taskId)` - Cancel active task execution
- `getMetrics()` - Get current performance metrics
- `getActiveExecutions()` - Get list of active executions

### WorkflowStateMachine
- `createWorkflow(type)` - Create workflow instance
- `registerWorkflow(type, definition)` - Register custom workflow
- `getAvailableWorkflows()` - Get all available workflow types
- `validateWorkflow(definition)` - Validate workflow definition

### TaskParser
- `parseNaturalLanguage(input, context)` - Parse natural language to task
- `enhanceTaskRequirements(task)` - Enhance task with type-specific requirements
- `validateTask(task)` - Validate parsed task structure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For questions, issues, or contributions:
- Create an issue in the GitHub repository
- Check the documentation in `/docs`
- Review example usage in `/src/orchestrator/examples`

---

**Repository**: [https://github.com/Zeeeepa/claude-task-master](https://github.com/Zeeeepa/claude-task-master)

**Implementation Status**: ✅ **COMPLETE** - Ready for production use
