# AgentAPI Middleware Integration

The AgentAPI Middleware serves as a communication bridge between the claude-task-master orchestrator and Claude Code on WSL2 instances. This middleware handles PR branch cloning, deployment coordination, and validation result communication.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Orchestrator  │◄──►│  AgentAPI       │◄──►│   Claude Code   │
│                 │    │  Middleware     │    │   on WSL2       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   Database      │
                       └─────────────────┘
```

## 🚀 Features

- **WSL2 Instance Management**: Create, configure, and manage isolated WSL2 instances
- **Git Operations**: Clone repositories, manage branches, and handle Git workflows
- **Claude Code Integration**: HTTP API interface for Claude Code operations
- **Process Orchestration**: Coordinate deployment workflows and validation processes
- **Real-time Updates**: WebSocket support for live deployment status updates
- **Database Integration**: Store deployment data, validation results, and metrics
- **Webhook Support**: Handle GitHub and Linear webhooks for automated workflows

## 📁 Directory Structure

```
src/ai_cicd_system/agentapi/
├── middleware_server.js          # Main HTTP API server
├── wsl2_manager.js               # WSL2 instance management
├── git_operations.js             # Git repository operations
├── claude_code_interface.js      # Claude Code API integration
├── deployment_orchestrator.js    # Deployment workflow coordination
├── routes/
│   ├── deployment.js             # Deployment operation endpoints
│   ├── validation.js             # Validation result endpoints
│   ├── status.js                 # Health and status endpoints
│   └── webhook.js                # Webhook handling endpoints
└── integration/
    ├── orchestrator_client.js    # Communication with main orchestrator
    └── database_connector.js     # Database update operations
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+ 
- WSL2 enabled on Windows
- PostgreSQL database
- Claude Code installed and accessible

### Environment Variables

```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@cloudflare-url:5432/ai_cicd

# Webhook Secrets
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
LINEAR_WEBHOOK_SECRET=your_linear_webhook_secret

# Service URLs
ORCHESTRATOR_URL=http://localhost:3000
CLAUDE_CODE_URL=http://localhost:3002
```

### Installation

```bash
# Install dependencies
npm install

# Initialize database schema
npm run db:init

# Start the middleware server
npm start
```

## 🔧 Configuration

```javascript
const config = {
  server: {
    host: "localhost",
    port: 3001,
    cors: { origin: ["http://localhost:3000"] }
  },
  wsl2: {
    maxInstances: 5,
    resourceLimits: {
      memory: "2GB",
      cpu: "2 cores", 
      disk: "10GB"
    },
    timeout: 300000 // 5 minutes
  },
  claudeCode: {
    apiUrl: "http://localhost:3002",
    timeout: 180000, // 3 minutes
    retryAttempts: 3
  },
  database: {
    connectionString: "postgresql://user:pass@cloudflare-url:5432/db"
  },
  orchestrator: {
    apiUrl: "http://localhost:3000",
    timeout: 30000
  }
};
```

## 📡 API Endpoints

### Deployment Operations

```http
POST /api/deployment/start
GET /api/deployment/:id
POST /api/deployment/:id/stop
GET /api/deployment
GET /api/deployment/:id/logs
GET /api/deployment/:id/report
POST /api/deployment/:id/retry
GET /api/deployment/stats
```

### Validation Operations

```http
POST /api/validation/start
GET /api/validation/:id
POST /api/validation/:id/retry
GET /api/validation
GET /api/validation/:id/report
POST /api/validation/batch
GET /api/validation/stats
```

### Status & Health

```http
GET /api/status
GET /api/status/wsl2
GET /api/status/claude-code
GET /api/status/database
GET /api/status/deployments
GET /api/status/metrics
GET /api/status/health
POST /api/status/cleanup
```

### Webhooks

```http
POST /api/webhook/github
POST /api/webhook/linear
POST /api/webhook/generic
GET /api/webhook/events
```

## 🔄 Deployment Workflow

1. **Receive Deployment Request**
   - From orchestrator or webhook
   - Validate request parameters

2. **Create WSL2 Instance**
   - Spin up isolated environment
   - Configure resource limits
   - Install required packages

3. **Clone Repository**
   - Clone PR branch
   - Configure Git settings
   - Prepare workspace

4. **Start Claude Code Session**
   - Initialize Claude Code
   - Configure allowed tools
   - Setup WebSocket connection

5. **Execute Validation Tasks**
   - Code analysis
   - Test execution
   - Lint checks
   - Build verification
   - Security scans

6. **Generate Report**
   - Aggregate results
   - Store in database
   - Notify orchestrator

7. **Cleanup Resources**
   - Stop Claude Code session
   - Destroy WSL2 instance
   - Update metrics

## 🧪 Validation Task Types

### Code Analysis
```javascript
{
  type: 'code_analysis',
  scope: 'changed_files',
  focus: ['bugs', 'performance', 'security'],
  files: ['src/component.js']
}
```

### Test Execution
```javascript
{
  type: 'test_execution',
  command: 'npm test',
  timeout: 120000
}
```

### Lint Check
```javascript
{
  type: 'lint_check',
  command: 'npm run lint',
  options: { stopOnError: false }
}
```

### Build Verification
```javascript
{
  type: 'build_verification',
  command: 'npm run build',
  timeout: 300000
}
```

### Security Scan
```javascript
{
  type: 'security_scan',
  command: 'npm audit',
  options: { generateReport: true }
}
```

### Custom Validation
```javascript
{
  type: 'custom_validation',
  command: 'custom-script.sh',
  instructions: 'Run custom validation script',
  timeout: 180000
}
```

## 🔌 WebSocket Events

### Client Events
```javascript
// Join deployment room for updates
socket.emit('join-deployment', deploymentId);

// Leave deployment room
socket.emit('leave-deployment', deploymentId);
```

### Server Events
```javascript
// Deployment status updates
socket.on('deploymentStarted', (data) => {
  console.log('Deployment started:', data.deploymentId);
});

socket.on('deploymentCompleted', (data) => {
  console.log('Deployment completed:', data.deploymentId);
});

socket.on('deploymentFailed', (data) => {
  console.log('Deployment failed:', data.deploymentId, data.error);
});

// Real-time progress updates
socket.on('deploymentProgress', (data) => {
  console.log('Progress:', data.progress + '%');
});
```

## 🔗 Integration Examples

### Start Deployment
```javascript
const deploymentRequest = {
  repositoryUrl: 'https://github.com/user/repo.git',
  prBranch: 'feature/new-feature',
  validationTasks: [
    { type: 'code_analysis', scope: 'changed_files' },
    { type: 'test_execution', command: 'npm test' },
    { type: 'lint_check', command: 'npm run lint' }
  ],
  gitConfig: {
    name: 'AgentAPI Bot',
    email: 'agentapi@example.com'
  }
};

const response = await fetch('/api/deployment/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(deploymentRequest)
});

const result = await response.json();
console.log('Deployment ID:', result.deploymentId);
```

### Monitor Deployment
```javascript
const deploymentId = 'deployment-id';

// Get status
const status = await fetch(`/api/deployment/${deploymentId}`);
const statusData = await status.json();

// Get logs
const logs = await fetch(`/api/deployment/${deploymentId}/logs`);
const logsData = await logs.json();

// Get final report
const report = await fetch(`/api/deployment/${deploymentId}/report`);
const reportData = await report.json();
```

### Webhook Integration
```javascript
// GitHub webhook handler
app.post('/webhook/github', (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'pull_request' && payload.action === 'opened') {
    // Trigger deployment via AgentAPI
    triggerDeployment(payload.pull_request);
  }

  res.status(200).send('OK');
});
```

## 📊 Monitoring & Metrics

### System Metrics
- Active WSL2 instances
- Memory and CPU usage
- Deployment success/failure rates
- Average deployment time
- Queue length and processing time

### Performance Benchmarks
- **Deployment Time**: < 30 seconds target
- **Instance Creation**: < 10 seconds
- **Git Clone**: < 15 seconds
- **Claude Code Startup**: < 5 seconds

### Health Checks
```bash
# Check overall system health
curl http://localhost:3001/api/status

# Check specific components
curl http://localhost:3001/api/status/wsl2
curl http://localhost:3001/api/status/claude-code
curl http://localhost:3001/api/status/database
```

## 🔒 Security Considerations

### WSL2 Isolation
- Each deployment runs in isolated WSL2 instance
- Resource limits prevent resource exhaustion
- Automatic cleanup of idle instances

### Authentication
- Webhook signature verification
- API key authentication for orchestrator
- Secure database connections

### Network Security
- CORS configuration
- Rate limiting
- Request validation and sanitization

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/agentapi/middleware_server.test.js
npm test -- tests/agentapi/wsl2_manager.test.js

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3001

CMD ["node", "src/ai_cicd_system/agentapi/middleware_server.js"]
```

### Production Configuration
```javascript
const productionConfig = {
  server: {
    host: '0.0.0.0',
    port: process.env.PORT || 3001
  },
  wsl2: {
    maxInstances: 10,
    resourceLimits: {
      memory: '4GB',
      cpu: '4 cores',
      disk: '20GB'
    }
  },
  database: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  }
};
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Multiple middleware instances behind load balancer
- Shared PostgreSQL database
- Redis for session management

### Resource Optimization
- WSL2 instance pooling
- Lazy loading of components
- Efficient cleanup strategies

### Performance Tuning
- Connection pooling
- Caching strategies
- Async processing queues

## 🔧 Troubleshooting

### Common Issues

**WSL2 Not Available**
```bash
# Enable WSL2
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

**Database Connection Issues**
```bash
# Check connection
psql $DATABASE_URL -c "SELECT NOW();"
```

**Claude Code Connection Issues**
```bash
# Check Claude Code API
curl http://localhost:3002/health
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=agentapi:* npm start

# Verbose WSL2 logging
WSL2_DEBUG=true npm start
```

## 📚 API Documentation

Complete API documentation is available at:
- **Interactive Docs**: `http://localhost:3001/api/docs`
- **OpenAPI Spec**: `http://localhost:3001/openapi.json`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

This project is part of the claude-task-master AI CI/CD system and follows the same licensing terms.

