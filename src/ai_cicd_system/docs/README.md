# TaskMaster Workflow Orchestration Engine

## Overview

The TaskMaster Workflow Orchestration Engine is a comprehensive system that consolidates workflow management, task orchestration, database persistence, and infrastructure automation into a single, cohesive platform. This system represents the consolidation of PRs #50 and #63, eliminating redundancy while preserving all functionality.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    TaskMaster Workflow Engine                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Workflow      │  │     Agent       │  │   Database      │  │
│  │  Orchestrator   │  │   Manager       │  │   Manager       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   State         │  │  Infrastructure │  │   Monitoring    │  │
│  │  Manager        │  │   Manager       │  │   System        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Configuration Layer                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   PostgreSQL    │  │   Cloudflare    │  │   Agent APIs    │  │
│  │   Database      │  │     Proxy       │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

- **Unified Configuration**: Single configuration system managing all components
- **Database Integration**: PostgreSQL with connection pooling and state persistence
- **Agent Orchestration**: Coordinated execution across Claude Code, Codegen, Aider, and Goose
- **Infrastructure Automation**: Cloudflare proxy integration with load balancing
- **State Management**: Workflow pause/resume with database persistence
- **Error Recovery**: Intelligent retry logic with escalation policies
- **Monitoring**: Comprehensive metrics and alerting system
- **Security**: Role-based access control with encryption support

## Directory Structure

```
src/ai_cicd_system/
├── config/
│   └── workflow_config.js          # Unified configuration system
├── workflows/
│   ├── workflow_engine.js          # Core workflow orchestration engine
│   ├── workflow_definition.js      # Workflow definition schemas
│   └── step_executor.js            # Individual step execution logic
├── database/
│   ├── schema.sql                  # Complete database schema
│   ├── database_manager.js         # Database connection and operations
│   ├── migrations/                 # Database migration scripts
│   └── connection_pool.js          # Connection pool management
├── infrastructure/
│   ├── cloudflare-proxy.yaml       # Cloudflare configuration
│   ├── load_balancer.js            # Load balancing logic
│   └── health_monitor.js           # Infrastructure health monitoring
├── examples/
│   └── workflow_examples.js        # Comprehensive usage examples
└── docs/
    ├── README.md                   # This file
    ├── API.md                      # API documentation
    ├── DEPLOYMENT.md               # Deployment guide
    └── TROUBLESHOOTING.md          # Troubleshooting guide
```

## Quick Start

### 1. Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb codegen-taskmaster-db

# Run migrations
psql -d codegen-taskmaster-db -f src/ai_cicd_system/database/schema.sql
```

### 3. Configuration

```javascript
// Basic configuration example
import { WORKFLOW_CONFIG } from './src/ai_cicd_system/config/workflow_config.js';

// Validate configuration
import { validateConfig } from './src/ai_cicd_system/config/workflow_config.js';
const validation = validateConfig();
if (!validation.valid) {
    console.error('Configuration errors:', validation.errors);
}
```

### 4. Basic Usage

```javascript
import { WorkflowEngine } from './src/ai_cicd_system/workflows/workflow_engine.js';
import { WORKFLOW_CONFIG } from './src/ai_cicd_system/config/workflow_config.js';

const engine = new WorkflowEngine(WORKFLOW_CONFIG);

// Execute a workflow
const result = await engine.executeWorkflow('pr_processing', {
    pr_id: '123',
    repository: 'company/app',
    branch: 'feature/new-feature'
});

console.log('Workflow completed:', result);
```

## Core Concepts

### Workflows

Workflows are defined as a series of steps that can be executed sequentially or in parallel. Each workflow has:

- **ID**: Unique identifier
- **Steps**: Individual tasks to execute
- **Dependencies**: Step execution order
- **Error Handling**: Retry and escalation policies
- **State Management**: Pause/resume capabilities

### Agents

The system coordinates multiple AI agents:

- **Claude Code**: Code analysis, validation, testing
- **Codegen**: Code generation, PR creation
- **Aider**: Code editing, refactoring
- **Goose**: Security scanning, analysis

### State Management

All workflow state is persisted in PostgreSQL:

- **Workflow Executions**: Track workflow instances
- **Step States**: Individual step progress
- **Task Management**: Integration with task system
- **Validation Results**: Agent validation outcomes
- **Error Logs**: Comprehensive error tracking

### Infrastructure Integration

Cloudflare proxy provides:

- **Secure Access**: SSL/TLS termination
- **Load Balancing**: High availability
- **DDoS Protection**: Security layer
- **Rate Limiting**: API protection
- **Health Monitoring**: Service health checks

## Configuration

### Environment Variables

```bash
# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=codegen-taskmaster-db
DATABASE_USERNAME=software_developer
DATABASE_PASSWORD=your_password

# Workflow Engine
MAX_CONCURRENT_WORKFLOWS=10
DEFAULT_WORKFLOW_TIMEOUT=3600000
ENABLE_WORKFLOW_METRICS=true

# Agent Configuration
CLAUDE_CODE_ENDPOINT=http://localhost:3001
CODEGEN_ENDPOINT=http://localhost:3002
AIDER_ENDPOINT=http://localhost:3003
GOOSE_ENDPOINT=http://localhost:3004

# Infrastructure
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_TUNNEL_ID=your_tunnel_id
CLOUDFLARE_PROXY_HOSTNAME=db.taskmaster.com

# Security
ENABLE_AUTH=true
JWT_SECRET=your_jwt_secret
ENABLE_ENCRYPTION=true

# Monitoring
ENABLE_MONITORING=true
ENABLE_PROMETHEUS=true
PROMETHEUS_PORT=9090
```

### Configuration Validation

The system includes comprehensive configuration validation:

```javascript
import { validateConfig } from './config/workflow_config.js';

const validation = validateConfig();
if (!validation.valid) {
    console.error('Configuration errors:', validation.errors);
    console.warn('Configuration warnings:', validation.warnings);
}
```

## Database Schema

### Core Tables

- **workflow_definitions**: Workflow templates and configurations
- **workflow_executions**: Individual workflow runs
- **workflow_states**: Step-by-step execution state
- **tasks**: Task management integration
- **validation_results**: Agent validation outcomes
- **error_logs**: Comprehensive error tracking
- **agent_instances**: Registered agents and health
- **users**: User management and authentication

### Connection Pooling

The system uses intelligent connection pooling:

- **Read Pool**: 60% of connections for SELECT queries
- **Write Pool**: 30% of connections for modifications
- **Analytics Pool**: 10% of connections for reporting

## API Endpoints

### Workflow Management

```
POST   /api/workflows/execute        # Execute workflow
GET    /api/workflows/{id}           # Get workflow status
PUT    /api/workflows/{id}/pause     # Pause workflow
PUT    /api/workflows/{id}/resume    # Resume workflow
DELETE /api/workflows/{id}           # Cancel workflow
```

### Task Management

```
GET    /api/tasks                    # List tasks
POST   /api/tasks                    # Create task
PUT    /api/tasks/{id}               # Update task
GET    /api/tasks/{id}/workflow      # Get task workflow
```

### Validation

```
GET    /api/validations              # List validations
POST   /api/validations              # Create validation
GET    /api/validations/{id}         # Get validation result
```

### System

```
GET    /api/health                   # System health
GET    /api/metrics                  # Prometheus metrics
GET    /api/agents                   # Agent status
```

## Examples

### Basic Workflow Execution

```javascript
import { WorkflowExamples } from './examples/workflow_examples.js';

// Execute a complete task-to-PR workflow
const result = await WorkflowExamples.taskToPRWorkflow();
```

### Multi-Agent Validation

```javascript
// Run comprehensive validation pipeline
const validation = await WorkflowExamples.multiAgentValidation();
```

### Parallel Execution

```javascript
// Execute multiple workflows in parallel
const parallel = await WorkflowExamples.parallelWorkflowCoordination();
```

### State Management

```javascript
// Demonstrate pause/resume functionality
const stateManagement = await WorkflowExamples.workflowStateManagement();
```

## Monitoring and Observability

### Metrics

The system exposes comprehensive metrics:

- **Workflow Metrics**: Execution times, success rates, failure rates
- **Agent Metrics**: Performance, availability, response times
- **Database Metrics**: Connection pool usage, query performance
- **Infrastructure Metrics**: Health checks, failover events

### Alerting

Configurable alerts for:

- **High Error Rates**: >10% failure rate
- **Slow Performance**: >30 minute average execution
- **Resource Utilization**: >80% usage
- **Agent Failures**: Agent unavailability

### Health Checks

- **Database**: Connection and query health
- **Agents**: Endpoint availability and response
- **Infrastructure**: Cloudflare proxy status
- **System**: Overall system health

## Security

### Authentication

- **JWT Tokens**: Stateless authentication
- **API Keys**: Service-to-service authentication
- **Cloudflare Access**: Enterprise SSO integration

### Authorization

Role-based access control:

- **Admin**: Full system access
- **Developer**: Task and workflow management
- **Operator**: Workflow execution only
- **Viewer**: Read-only access

### Data Protection

- **Encryption**: AES-256 for sensitive data
- **SSL/TLS**: End-to-end encryption
- **Row-Level Security**: Database access control
- **Audit Logging**: Comprehensive activity tracking

## Deployment

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
  name: taskmaster-workflow
spec:
  replicas: 3
  selector:
    matchLabels:
      app: taskmaster-workflow
  template:
    metadata:
      labels:
        app: taskmaster-workflow
    spec:
      containers:
      - name: workflow-engine
        image: taskmaster/workflow-engine:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_HOST
          value: "postgres-service"
```

### Cloudflare Setup

```bash
# Install cloudflared
cloudflared tunnel create taskmaster-workflow

# Configure tunnel
cloudflared tunnel route dns taskmaster-workflow db.taskmaster.com

# Run tunnel
cloudflared tunnel run --config cloudflare-proxy.yaml taskmaster-workflow
```

## Performance Optimization

### Database Optimization

- **Indexing**: Comprehensive indexes on frequently queried columns
- **Connection Pooling**: Optimized pool sizes for workload
- **Query Optimization**: Regular EXPLAIN ANALYZE for slow queries
- **Read Replicas**: Separate read traffic from writes

### Workflow Optimization

- **Parallel Execution**: Concurrent step execution where possible
- **Caching**: Result caching for expensive operations
- **Resource Management**: CPU and memory limits
- **Load Balancing**: Distribute load across agents

### Infrastructure Optimization

- **CDN**: Cloudflare CDN for static assets
- **Compression**: Gzip compression for API responses
- **Keep-Alive**: Persistent connections
- **Edge Caching**: Cache at edge locations

## Troubleshooting

### Common Issues

1. **Connection Pool Exhaustion**
   - Increase pool size
   - Check for connection leaks
   - Monitor pool metrics

2. **Slow Workflow Execution**
   - Analyze step performance
   - Check agent response times
   - Review database query performance

3. **Agent Communication Failures**
   - Verify agent endpoints
   - Check network connectivity
   - Review authentication configuration

4. **Database Performance Issues**
   - Analyze slow queries
   - Check index usage
   - Monitor connection pool

### Debugging

```javascript
// Enable debug mode
process.env.DEBUG_MODE = 'true';
process.env.LOG_LEVEL = 'debug';

// Check system health
const health = await engine.healthCheck();
console.log('System health:', health);

// Get detailed metrics
const metrics = await engine.getDetailedMetrics();
console.log('System metrics:', metrics);
```

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/company/taskmaster-workflow

# Install dependencies
npm install

# Set up development environment
cp .env.example .env.development

# Run tests
npm test

# Start development server
npm run dev
```

### Code Standards

- **ESLint**: Code linting and formatting
- **Jest**: Unit and integration testing
- **JSDoc**: Comprehensive documentation
- **TypeScript**: Type safety (optional)

### Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "workflow"

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: [docs.taskmaster.com](https://docs.taskmaster.com)
- **Issues**: [GitHub Issues](https://github.com/company/taskmaster-workflow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/company/taskmaster-workflow/discussions)
- **Email**: support@taskmaster.com

