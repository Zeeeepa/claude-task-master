# Advanced Workflow Orchestration & State Management

This directory contains the implementation of a sophisticated workflow orchestration system that manages complex multi-step CI/CD processes, handles task dependencies, parallel execution, and maintains comprehensive state management across the entire pipeline.

## 🎯 Overview

The workflow orchestration system is designed to be the brain of the CI/CD pipeline, providing:

- **Complex Orchestration**: Multi-step workflows with dependencies and parallel execution
- **State Persistence**: Workflow state maintained across system restarts and failures
- **Error Recovery**: Sophisticated error handling and retry mechanisms
- **Resource Optimization**: Independent steps executed in parallel for efficiency
- **Scalability**: Concurrent workflow execution with resource management

## 🏗️ Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Workflow Engine │────│ State Manager   │────│ Database        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         ├─────────────────┬─────────────────┐
         │                 │                 │
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Step Executor   │ │ Parallel        │ │ Dependency      │
│                 │ │ Processor       │ │ Resolver        │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                  ┌─────────────────┐
                  │ Agent Manager   │
                  └─────────────────┘
```

### Component Responsibilities

1. **Workflow Engine** (`workflow_engine.js`)
   - Main orchestration logic
   - Workflow lifecycle management
   - Event coordination
   - Metrics collection

2. **State Manager** (`state_manager.js`)
   - Persistent state management
   - Checkpoint creation and recovery
   - Progress tracking
   - State caching

3. **Step Executor** (`step_executor.js`)
   - Individual step execution
   - Retry logic and error handling
   - Agent communication
   - Result validation

4. **Parallel Processor** (`parallel_processor.js`)
   - Concurrent step execution
   - Resource management
   - Load balancing
   - Failure handling

5. **Dependency Resolver** (`dependency_resolver.js`)
   - Execution plan creation
   - Circular dependency detection
   - Critical path analysis
   - Optimization

## 📋 Workflow Definitions

### Built-in Workflows

#### 1. PR Processing Workflow (`pr_processing`)
Complete pull request analysis, code generation, and deployment:

```javascript
{
  id: 'pr_processing',
  steps: [
    'analyze_pr',      // Analyze pull request
    'generate_tasks',  // Generate AI tasks
    'deploy_branch',   // Deploy PR branch
    'validate_code',   // Validate code quality (parallel)
    'run_tests',       // Execute test suite (parallel)
    'security_audit'   // Security audit
  ]
}
```

#### 2. Hotfix Deployment (`hotfix_deployment`)
Fast-track deployment for critical fixes:

```javascript
{
  id: 'hotfix_deployment',
  steps: [
    'validate_hotfix',   // Quick validation
    'emergency_tests',   // Emergency test suite
    'deploy_production'  // Deploy to production
  ]
}
```

#### 3. Feature Integration (`feature_integration`)
Comprehensive feature integration and testing:

```javascript
{
  id: 'feature_integration',
  steps: [
    'feature_analysis',      // Analyze feature impact
    'integration_tests',     // Integration testing
    'compatibility_check',   // Compatibility verification (parallel)
    'performance_benchmark'  // Performance benchmarking
  ]
}
```

### Custom Workflow Definition

```javascript
const customWorkflow = {
  id: 'my_custom_workflow',
  name: 'My Custom Workflow',
  description: 'Custom workflow description',
  version: '1.0.0',
  steps: [
    {
      id: 'step_1',
      name: 'First Step',
      type: 'analysis',
      agent: 'claude-code',
      dependencies: [],
      timeout: 60000,
      retry_count: 3,
      parallel: false,
      config: {
        // Step-specific configuration
      }
    }
    // ... more steps
  ],
  error_handling: {
    strategy: 'retry_with_fallback',
    max_retries: 3,
    fallback_agents: ['goose', 'aider']
  }
};
```

## 🚀 Usage Examples

### Basic Workflow Execution

```javascript
import { WorkflowEngine } from './workflow_engine.js';
import { WORKFLOW_CONFIG } from '../config/workflow_config.js';

const workflowEngine = new WorkflowEngine(WORKFLOW_CONFIG);

const context = {
  pr_id: '123',
  repository: 'company/app',
  branch: 'feature/new-feature'
};

const result = await workflowEngine.executeWorkflow('pr_processing', context);
console.log('Workflow completed:', result);
```

### Monitoring Workflow Progress

```javascript
// Set up event listeners
workflowEngine.on('workflow_started', (data) => {
  console.log(`Workflow started: ${data.workflowId}`);
});

workflowEngine.on('step_execution_completed', (data) => {
  console.log(`Step completed: ${data.stepId}`);
});

workflowEngine.on('workflow_completed', (data) => {
  console.log(`Workflow completed in ${data.duration}ms`);
});

// Execute workflow
const result = await workflowEngine.executeWorkflow('pr_processing', context);
```

### Pause and Resume

```javascript
// Start workflow
const workflowPromise = workflowEngine.executeWorkflow('feature_integration', context);

// Get execution ID
const activeWorkflows = workflowEngine.getActiveWorkflows();
const executionId = activeWorkflows[0].executionId;

// Pause for manual review
await workflowEngine.pauseWorkflow(executionId, 'manual_review');

// Resume after review
await workflowEngine.resumeWorkflow(executionId);

const result = await workflowPromise;
```

### Error Handling

```javascript
workflowEngine.on('step_failed', (data) => {
  console.log(`Step failed: ${data.stepId} - ${data.error.message}`);
});

workflowEngine.on('step_retry', (data) => {
  console.log(`Retrying step: ${data.stepId} (attempt ${data.attempt})`);
});

try {
  const result = await workflowEngine.executeWorkflow('pr_processing', context);
} catch (error) {
  console.error('Workflow failed:', error.message);
  
  // Get metrics even on failure
  const metrics = workflowEngine.getMetrics();
  console.log('Metrics:', metrics);
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Engine Configuration
MAX_CONCURRENT_WORKFLOWS=10
DEFAULT_WORKFLOW_TIMEOUT=3600000
ENABLE_WORKFLOW_METRICS=true
ENABLE_WORKFLOW_RECOVERY=true

# Database Configuration
DATABASE_TYPE=postgresql
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=workflow_db
DATABASE_USERNAME=workflow_user
DATABASE_PASSWORD=your_password

# Agent Configuration
CLAUDE_CODE_ENDPOINT=http://localhost:3001
CODEGEN_ENDPOINT=http://localhost:3002
AIDER_ENDPOINT=http://localhost:3003
GOOSE_ENDPOINT=http://localhost:3004

# Resource Limits
MAX_CONCURRENT_STEPS=5
PARALLEL_MEMORY_LIMIT=4GB
PARALLEL_CPU_LIMIT=4 cores
PARALLEL_DISK_LIMIT=20GB
```

### Programmatic Configuration

```javascript
const config = {
  engine: {
    maxConcurrentWorkflows: 10,
    defaultTimeout: 3600000,
    enableMetrics: true,
    enableRecovery: true
  },
  stateManager: {
    cacheSize: 1000,
    persistInterval: 5000,
    retentionDays: 30
  },
  parallelProcessor: {
    maxConcurrentSteps: 5,
    memoryLimit: '4GB',
    cpuLimit: '4 cores',
    enableLoadBalancing: true
  }
};

const workflowEngine = new WorkflowEngine(config);
```

## 🔧 API Reference

### WorkflowEngine

#### Methods

- `executeWorkflow(workflowId, context, options)` - Execute a workflow
- `pauseWorkflow(executionId, reason)` - Pause a running workflow
- `resumeWorkflow(executionId)` - Resume a paused workflow
- `cancelWorkflow(executionId, reason)` - Cancel a running workflow
- `getWorkflowStatus(executionId)` - Get workflow status
- `getActiveWorkflows()` - List active workflows
- `getMetrics()` - Get execution metrics

#### Events

- `workflow_started` - Workflow execution started
- `workflow_completed` - Workflow execution completed
- `workflow_failed` - Workflow execution failed
- `workflow_paused` - Workflow paused
- `workflow_resumed` - Workflow resumed
- `step_execution_started` - Step execution started
- `step_execution_completed` - Step execution completed
- `step_failed` - Step execution failed
- `parallel_batch_started` - Parallel batch started
- `parallel_batch_completed` - Parallel batch completed

### StateManager

#### Methods

- `initializeWorkflow(executionId, workflow, context)` - Initialize workflow state
- `updateStepResult(executionId, stepId, result)` - Update step result
- `updateStepFailure(executionId, stepId, error)` - Record step failure
- `completeWorkflow(executionId, result)` - Mark workflow as completed
- `failWorkflow(executionId, error)` - Mark workflow as failed
- `getState(executionId)` - Get workflow state
- `recoverFromCheckpoint(executionId)` - Recover from checkpoint

### DependencyResolver

#### Methods

- `createExecutionPlan(steps)` - Create execution plan from steps
- `validateNoCycles(steps)` - Validate no circular dependencies
- `analyzeCriticalPath(steps)` - Analyze critical path
- `findParallelizationOpportunities(steps)` - Find parallelization opportunities

## 🧪 Testing

### Running Tests

```bash
# Run all workflow tests
npm test tests/workflows/

# Run specific test file
npm test tests/workflows/workflow_engine.test.js

# Run with coverage
npm run test:coverage
```

### Test Categories

1. **Unit Tests**
   - Individual component testing
   - Dependency resolution algorithms
   - State management operations
   - Error handling scenarios

2. **Integration Tests**
   - End-to-end workflow execution
   - Component interaction
   - Database integration
   - Agent communication

3. **Performance Tests**
   - Concurrent workflow execution
   - Large workflow processing
   - Memory usage optimization
   - Resource management

4. **Reliability Tests**
   - Workflow recovery scenarios
   - Partial failure handling
   - Timeout and retry scenarios
   - System restart recovery

### Example Test

```javascript
describe('Workflow Engine', () => {
  it('should execute a workflow successfully', async () => {
    const context = { pr_id: '123', repository: 'test/repo' };
    const result = await workflowEngine.executeWorkflow('pr_processing', context);
    
    expect(result.status).toBe('completed');
    expect(result.result.success).toBe(true);
  });
});
```

## 📊 Monitoring and Metrics

### Available Metrics

- **Execution Metrics**
  - Total executions
  - Success/failure rates
  - Average execution time
  - Currently active workflows

- **Performance Metrics**
  - Resource utilization
  - Throughput
  - Queue wait times
  - Bottleneck identification

- **Error Metrics**
  - Failure patterns
  - Retry statistics
  - Recovery success rates

### Monitoring Integration

```javascript
// Prometheus metrics
workflowEngine.on('metrics_update', (metrics) => {
  prometheusRegistry.gauge('workflow_active_count').set(metrics.currentlyActive);
  prometheusRegistry.counter('workflow_total_executions').inc();
});

// Custom monitoring
workflowEngine.on('workflow_completed', (data) => {
  customMonitoring.recordWorkflowDuration(data.workflowId, data.duration);
});
```

## 🔒 Security Considerations

### Authentication and Authorization

- API key authentication for workflow execution
- Role-based access control (RBAC)
- Workflow execution permissions
- Audit logging

### Data Protection

- Sensitive data sanitization
- Encrypted state storage
- Secure agent communication
- Context data validation

### Resource Protection

- Resource usage limits
- Rate limiting
- Timeout enforcement
- Memory leak prevention

## 🚀 Deployment

### Production Deployment

1. **Database Setup**
   ```sql
   CREATE DATABASE workflow_db;
   CREATE USER workflow_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE workflow_db TO workflow_user;
   ```

2. **Environment Configuration**
   ```bash
   export NODE_ENV=production
   export DATABASE_HOST=prod-db-host
   export ENABLE_MONITORING=true
   export ENABLE_ALERTS=true
   ```

3. **Service Deployment**
   ```bash
   npm run build
   npm run start:production
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-engine
  template:
    metadata:
      labels:
        app: workflow-engine
    spec:
      containers:
      - name: workflow-engine
        image: workflow-engine:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_HOST
          value: "postgres-service"
        - name: MAX_CONCURRENT_WORKFLOWS
          value: "10"
```

## 🔧 Troubleshooting

### Common Issues

1. **Circular Dependencies**
   ```
   Error: Circular dependency detected: step1 -> step2 -> step1
   ```
   - Check workflow step dependencies
   - Use dependency visualization tools
   - Validate workflow definitions

2. **Resource Exhaustion**
   ```
   Error: Maximum concurrent workflows reached: 10
   ```
   - Increase `maxConcurrentWorkflows` limit
   - Implement workflow queuing
   - Monitor resource usage

3. **Agent Unavailability**
   ```
   Error: Agent not available: claude-code
   ```
   - Check agent health status
   - Verify agent endpoints
   - Implement fallback agents

4. **State Persistence Failures**
   ```
   Error: Failed to persist workflow state
   ```
   - Check database connectivity
   - Verify database permissions
   - Monitor disk space

### Debug Mode

```bash
export DEBUG_MODE=true
export LOG_LEVEL=debug
npm start
```

### Health Checks

```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    activeWorkflows: workflowEngine.getActiveWorkflows().length,
    metrics: workflowEngine.getMetrics(),
    timestamp: new Date()
  };
  
  res.json(health);
});
```

## 📚 Additional Resources

- [Workflow Definition Schema](./workflow_definition.js)
- [Configuration Reference](../config/workflow_config.js)
- [Usage Examples](../examples/workflow_examples.js)
- [Test Suite](../../tests/workflows/)
- [API Documentation](./api-docs.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request
5. Ensure all tests pass

## 📄 License

This workflow orchestration system is part of the Claude Task Master project and follows the same licensing terms.

