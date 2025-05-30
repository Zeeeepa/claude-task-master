# Codegen SDK Integration & AI Development Engine

This directory contains the comprehensive Codegen SDK integration that enables automated code generation, PR creation, and intelligent development workflows for the claude-task-master project.

## 🎯 Overview

The Codegen integration serves as an AI-powered development engine that converts natural language requirements from Linear issues into working code implementations. It provides a complete workflow from requirement analysis to PR creation and deployment validation.

## 🏗️ Architecture

### Core Components

1. **CodegenIntegration** (`client.js`) - Main SDK wrapper for Codegen API
2. **AIDevelopmentEngine** (`engine.js`) - Orchestrates the complete development workflow
3. **CodegenMonitor** (`monitor.js`) - Real-time progress tracking and status updates
4. **RequirementFormatter** (`formatter.js`) - Formats requirements for optimal Codegen processing
5. **CodegenAuthMiddleware** (`../middleware/codegen-auth.js`) - Authentication and rate limiting
6. **RequirementParser** (`../utils/requirement-parser.js`) - Parses Linear issues into structured requirements

### Integration Flow

```
Linear Issue → Requirement Parser → AI Development Engine → Codegen API
     ↓                                        ↓
Linear Updates ← Progress Monitor ← Code Generation ← PR Creation
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { createCodegenIntegration } from './src/integrations/codegen/index.js';

// Initialize with dependencies
const components = await createCodegenIntegration({
    database: databaseClient,
    linearClient: linearClient
}, {
    apiKey: process.env.CODEGEN_API_KEY,
    orgId: process.env.CODEGEN_ORG_ID
});

// Process a Linear issue
const result = await components.engine.processLinearTask('linear-issue-id');
console.log('Task processing initiated:', result);
```

### Factory Pattern

```javascript
import { CodegenIntegrationFactory } from './src/integrations/codegen/index.js';

const factory = new CodegenIntegrationFactory({
    enableAutoInit: true,
    enableHealthChecks: true
});

const components = await factory.initialize({
    database: databaseClient,
    linearClient: linearClient
});

// Access individual components
const client = factory.getComponent('client');
const engine = factory.getComponent('engine');
const monitor = factory.getComponent('monitor');
```

## 📋 Configuration

### Environment Variables

```bash
# Required
CODEGEN_API_KEY=your_codegen_api_key
CODEGEN_ORG_ID=your_organization_id

# Optional
CODEGEN_API_URL=https://api.codegen.sh
CODEGEN_MODE=production
CODEGEN_ENABLE_MOCK=false

# Rate Limiting
CODEGEN_REQUESTS_PER_MINUTE=60
CODEGEN_REQUESTS_PER_HOUR=1000

# Retry Configuration
CODEGEN_MAX_RETRIES=3
CODEGEN_RETRY_BASE_DELAY=1000

# Polling Configuration
CODEGEN_POLL_INTERVAL=10000
CODEGEN_MAX_WAIT_TIME=600000

# Feature Flags
LINEAR_INTEGRATION_ENABLED=true
GITHUB_INTEGRATION_ENABLED=true
```

### Programmatic Configuration

```javascript
import { createCodegenConfig } from './src/config/codegen.js';

const config = createCodegenConfig({
    mode: 'production',
    api: {
        baseURL: 'https://api.codegen.sh',
        timeout: 120000
    },
    rateLimiting: {
        enabled: true,
        requestsPerMinute: 60
    },
    features: {
        enableProgressUpdates: true,
        enableAutoMerge: false
    }
});
```

## 🔧 Component Details

### CodegenIntegration (client.js)

Main SDK wrapper that handles:
- Code generation requests
- Task monitoring
- PR creation
- Health checks

```javascript
const client = new CodegenIntegration(apiKey, orgId, options);

// Generate code from requirements
const task = await client.generateCode({
    title: 'User Authentication',
    description: 'Implement JWT-based authentication',
    technicalSpecs: ['Use bcrypt', 'Add middleware'],
    acceptanceCriteria: ['Secure login', 'Token validation']
});

// Monitor task progress
const status = await client.monitorTask(task.id);

// Create PR when complete
const pr = await client.createPR(taskData);
```

### AIDevelopmentEngine (engine.js)

Orchestrates the complete workflow:
- Processes Linear issues
- Extracts requirements
- Manages code generation
- Handles PR creation
- Updates Linear with progress

```javascript
const engine = new AIDevelopmentEngine(client, database, linearClient);

// Process a Linear issue end-to-end
const result = await engine.processLinearTask('linear-issue-id');

// Monitor active tasks
const activeTasks = engine.activeTasks;
```

### CodegenMonitor (monitor.js)

Real-time progress tracking:
- Polls Codegen tasks for updates
- Updates database with progress
- Posts progress comments to Linear
- Handles completion and failures

```javascript
const monitor = new CodegenMonitor(client, database, linearClient);

// Start monitoring a task
monitor.startMonitoring('codegen-task-id', 'internal-task-id', {
    onProgress: (task) => console.log('Progress:', task.progress),
    onComplete: (task) => console.log('Completed:', task.id)
});
```

### RequirementFormatter (formatter.js)

Formats requirements for optimal Codegen processing:
- Detects requirement types (feature, bugfix, refactor, etc.)
- Applies appropriate templates
- Formats prompts for maximum clarity

```javascript
const formatter = new RequirementFormatter();

// Format Linear issue for Codegen
const prompt = formatter.formatLinearIssue(linearIssue, {
    repository: 'my-repo',
    branch: 'feature-branch'
});
```

## 🧪 Testing

### Running Tests

```bash
# Run all Codegen integration tests
npm test tests/integrations/codegen/

# Run specific test files
npm test tests/integrations/codegen/client.test.js
npm test tests/integrations/codegen/engine.test.js
npm test tests/utils/requirement-parser.test.js
```

### Test Coverage

The integration includes comprehensive tests for:
- ✅ Client functionality and error handling
- ✅ Engine workflow orchestration
- ✅ Monitor progress tracking
- ✅ Requirement parsing and formatting
- ✅ Authentication middleware
- ✅ Configuration management

### Mock Mode

For development and testing, the integration supports mock mode:

```javascript
const components = await createCodegenIntegration({}, {
    enableMock: true // Uses mock responses instead of real API calls
});
```

## 🔐 Security

### Authentication

The integration uses Bearer token authentication:

```javascript
// Via environment variable
CODEGEN_API_KEY=your_token

// Via configuration
const client = new CodegenIntegration('your_token', 'your_org_id');

// Via middleware
app.use('/api/codegen', createCodegenAuthMiddleware());
```

### Rate Limiting

Built-in rate limiting prevents API abuse:
- Configurable requests per minute/hour
- Exponential backoff on failures
- Queue management for burst requests

### Audit Logging

All API interactions are logged for security auditing:
- Request/response logging (configurable)
- Authentication events
- Error tracking
- Performance metrics

## 📊 Monitoring & Health Checks

### Health Endpoints

```javascript
// Check overall integration health
const health = await factory.getHealth();

// Check individual component health
const clientHealth = await client.getHealth();
const engineHealth = await engine.getHealth();
```

### Metrics

```javascript
// Get integration metrics
const metrics = factory.getMetrics();

// Get monitoring statistics
const stats = monitor.getStatistics();
```

### Logging

The integration uses structured logging:

```javascript
import { log } from '../../scripts/modules/utils.js';

// Different log levels
log('debug', 'Detailed debugging information');
log('info', 'General information');
log('warning', 'Warning conditions');
log('error', 'Error conditions');
```

## 🔄 Workflow Examples

### Complete Linear Issue Processing

```javascript
// 1. Linear issue is assigned to Codegen
const linearIssueId = 'linear-123';

// 2. Engine processes the issue
const result = await engine.processLinearTask(linearIssueId);

// 3. Monitor tracks progress and updates Linear
// (Automatic progress comments posted to Linear)

// 4. On completion, PR is created and Linear is updated
// (Automatic PR link added to Linear issue)
```

### Custom Requirement Processing

```javascript
// 1. Parse custom requirements
const requirements = parser.parseLinearIssue(customDescription);

// 2. Format for Codegen
const prompt = formatter.formatRequirements(requirements);

// 3. Generate code
const task = await client.generateCode({
    ...requirements,
    repository: 'my-repo',
    branch: 'feature-branch'
});

// 4. Monitor and handle completion
monitor.startMonitoring(task.id, 'custom-task-id');
```

## 🚨 Error Handling

The integration includes comprehensive error handling:

### Retry Logic
- Exponential backoff for transient failures
- Configurable retry limits
- Circuit breaker pattern for persistent failures

### Error Recovery
- Automatic task restart on recoverable errors
- Manual intervention triggers for complex failures
- Detailed error reporting to Linear

### Graceful Degradation
- Mock mode fallback when API is unavailable
- Partial functionality when components fail
- Health check isolation

## 🔧 Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```bash
   # Check API key and org ID
   echo $CODEGEN_API_KEY
   echo $CODEGEN_ORG_ID
   
   # Test connectivity
   curl -H "Authorization: Bearer $CODEGEN_API_KEY" https://api.codegen.sh/health
   ```

2. **Rate Limiting**
   ```javascript
   // Check rate limit status
   const health = await client.getHealth();
   console.log('Rate limits:', health.rateLimits);
   ```

3. **Task Monitoring Issues**
   ```javascript
   // Check active monitoring tasks
   const stats = monitor.getStatistics();
   console.log('Active tasks:', stats.activeTasks);
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
CODEGEN_LOG_LEVEL=debug
CODEGEN_LOG_REQUESTS=true
CODEGEN_LOG_RESPONSES=true
```

## 📚 API Reference

### CodegenIntegration

- `generateCode(requirements)` - Generate code from requirements
- `monitorTask(taskId)` - Get task status
- `createPR(taskData)` - Create PR with generated code
- `getHealth()` - Get client health status
- `shutdown()` - Gracefully shutdown client

### AIDevelopmentEngine

- `processLinearTask(issueId)` - Process Linear issue end-to-end
- `extractRequirements(issue, taskData)` - Extract structured requirements
- `handleCodegenCompletion(taskId, task)` - Handle successful completion
- `handleCodegenFailure(taskId, task)` - Handle failures
- `getHealth()` - Get engine health status
- `shutdown()` - Gracefully shutdown engine

### CodegenMonitor

- `startMonitoring(codegenTaskId, taskId, options)` - Start monitoring task
- `stopMonitoring(codegenTaskId)` - Stop monitoring task
- `getStatistics()` - Get monitoring statistics
- `getHealth()` - Get monitor health status
- `shutdown()` - Gracefully shutdown monitor

## 🤝 Contributing

When contributing to the Codegen integration:

1. **Follow the existing patterns** - Use the established architecture
2. **Add comprehensive tests** - Cover both success and failure scenarios
3. **Update documentation** - Keep README and code comments current
4. **Handle errors gracefully** - Implement proper error handling and recovery
5. **Consider security** - Validate inputs and protect sensitive data

## 📄 License

This integration is part of the claude-task-master project and follows the same license terms.

