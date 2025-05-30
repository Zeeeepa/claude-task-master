# Linear API Integration & Issue Orchestration

A comprehensive Linear API integration that enables automated issue creation, status management, and hierarchical task orchestration within the CICD pipeline. This integration serves as the task management hub for the autonomous development system.

## 🚀 Features

### Core Capabilities

- **Issue Management**: Create, update, delete issues with full Linear API support
- **Hierarchical Structure**: Parent-child issue relationships for complex projects
- **Status Tracking**: Real-time monitoring of issue state changes
- **Assignment Management**: Automatic assignment to Codegen and team members
- **Label Management**: Categorize issues by type, priority, and components
- **Comment Integration**: Add progress updates and feedback automatically
- **Webhook Processing**: Real-time event handling for Linear updates
- **Template System**: Standardized issue templates for consistency
- **Progress Monitoring**: Automated tracking of project completion

### Advanced Features

- **Error Handling**: Automatic restructure issue creation for failed implementations
- **Bulk Operations**: Efficient batch processing of multiple issues
- **Caching**: Performance optimization with intelligent caching
- **Rate Limiting**: Built-in protection against API limits
- **Authentication**: Secure webhook signature validation
- **Monitoring**: Health checks and performance metrics

## 📦 Installation

```bash
npm install @linear/sdk
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Required
LINEAR_API_KEY=lin_api_your_api_key_here
LINEAR_TEAM_ID=your_team_id_here

# Optional
LINEAR_ORGANIZATION_ID=your_org_id
LINEAR_WEBHOOK_SECRET=your_webhook_secret
LINEAR_WEBHOOK_URL=https://your-domain.com/webhooks/linear

# Performance Settings
LINEAR_RETRY_ATTEMPTS=3
LINEAR_RETRY_DELAY=1000
LINEAR_TIMEOUT=30000
LINEAR_PROGRESS_INTERVAL=30000

# Feature Flags
LINEAR_AUTO_TRANSITIONS=true
LINEAR_STATUS_HISTORY=true
LINEAR_NOTIFY_ON_CHANGE=true
LINEAR_ENABLE_WEBHOOKS=true
LINEAR_ENABLE_ORCHESTRATION=true
```

### Configuration Object

```javascript
import { getConfig, createLinearIntegration } from './src/integrations/linear/index.js';

// Get environment-specific configuration
const config = getConfig('production');

// Create integration with custom config
const integration = createLinearIntegration({
    apiKey: 'your-api-key',
    teamId: 'your-team-id',
    retryAttempts: 3,
    progressCheckInterval: 30000
});
```

## 🚀 Quick Start

### Basic Setup

```javascript
import { setupLinearIntegration } from './src/integrations/linear/index.js';

// Setup complete integration stack
const integration = await setupLinearIntegration({
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
    database: databaseConnection,
    environment: 'production'
});

const { client, orchestrator, webhookHandler, statusManager } = integration;
```

### Creating Issues

```javascript
// Create a simple task issue
const issue = await client.createTaskIssue({
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication system',
    complexity: 'High',
    requirements: [
        'JWT token generation',
        'Password hashing',
        'Session management'
    ],
    acceptanceCriteria: [
        'Users can register and login',
        'Tokens expire after 24 hours',
        'Passwords are securely hashed'
    ]
});

// Create project with sub-issues
const project = await orchestrator.createProjectIssues({
    name: 'E-commerce Platform',
    description: 'Build complete e-commerce solution',
    tasks: [
        {
            title: 'User Management System',
            description: 'Implement user registration and authentication',
            files: ['src/auth/', 'src/users/'],
            acceptanceCriteria: ['User registration', 'Login/logout', 'Profile management']
        },
        {
            title: 'Product Catalog',
            description: 'Create product listing and search functionality',
            files: ['src/products/', 'src/search/'],
            acceptanceCriteria: ['Product CRUD', 'Search functionality', 'Category filtering']
        }
    ],
    successCriteria: [
        'All core features implemented',
        'Tests pass with >90% coverage',
        'Performance meets requirements'
    ]
});
```

### Status Management

```javascript
// Update issue status
await statusManager.updateTaskStatus('issue-id', 'in-progress', {
    reason: 'Starting implementation',
    estimatedCompletion: '2024-01-15',
    nextSteps: 'Set up project structure and dependencies'
});

// Handle errors and create restructure issue
await statusManager.handleErrorsAndRestructure('issue-id', [
    {
        message: 'Syntax error in authentication module',
        type: 'syntax',
        file: 'src/auth/login.js',
        line: 42,
        severity: 'high'
    }
]);

// Bulk status updates
await statusManager.bulkStatusUpdate([
    { taskId: 'issue-1', status: 'completed' },
    { taskId: 'issue-2', status: 'in-progress' },
    { taskId: 'issue-3', status: 'blocked', metadata: { reason: 'Waiting for API access' } }
]);
```

### Webhook Integration

```javascript
import express from 'express';
import { createLinearWebhookRouter } from './src/integrations/linear/index.js';

const app = express();

// Create webhook router
const webhookRouter = createLinearWebhookRouter(webhookHandler, {
    path: '/webhooks/linear',
    enableAuth: true,
    enableRateLimit: true
});

app.use(webhookRouter);

// Handle webhook events
webhookHandler.on('issueCompleted', async ({ issue }) => {
    console.log(`Issue completed: ${issue.title}`);
    // Trigger deployment or next steps
});

webhookHandler.on('implementationBlocked', async ({ taskId, metadata }) => {
    console.log(`Issue blocked: ${taskId}`, metadata);
    // Notify team or escalate
});
```

## 📚 API Reference

### LinearIntegration

Main client for Linear API operations.

```javascript
const client = new LinearIntegration(apiKey, teamId, options);

// Core methods
await client.createTaskIssue(taskData);
await client.createSubIssue(parentId, subtaskData);
await client.updateIssue(issueId, updates);
await client.createComment(issueId, body);
await client.getIssue(issueId);
await client.getSubIssues(parentId);
await client.healthCheck();
```

### LinearOrchestrator

Manages hierarchical issue structures and progress monitoring.

```javascript
const orchestrator = new LinearOrchestrator(linearClient, database, options);

// Core methods
await orchestrator.createProjectIssues(projectData);
await orchestrator.validateSubIssueProgress(mainIssueId);
await orchestrator.handleErrorsAndRestructure(issueId, errors);
orchestrator.startProgressMonitoring(mainIssueId);
orchestrator.stopProgressMonitoring(mainIssueId);
```

### LinearWebhookHandler

Processes Linear webhook events for real-time updates.

```javascript
const webhookHandler = new LinearWebhookHandler(orchestrator, options);

// Core methods
await webhookHandler.processWebhook(payload, signature);

// Event handlers
webhookHandler.on('issueCompleted', handler);
webhookHandler.on('implementationStarted', handler);
webhookHandler.on('implementationBlocked', handler);
```

### LinearStatusManager

Manages issue status updates and workflow automation.

```javascript
const statusManager = new LinearStatusManager(linearClient, options);

// Core methods
await statusManager.updateTaskStatus(taskId, status, metadata);
await statusManager.handleErrorsAndRestructure(issueId, errors);
await statusManager.bulkStatusUpdate(updates);
await statusManager.getStatusHistory(taskId);
await statusManager.getStatusStatistics(issueIds);
```

## 🎨 Templates

### Issue Templates

```javascript
import { TemplateFactory } from './src/integrations/linear/templates.js';

// Main issue template
const mainTemplate = TemplateFactory.createMainIssue({
    name: 'Project Name',
    description: 'Project description',
    tasks: [...],
    successCriteria: [...],
    requirements: [...]
});

// Sub-issue template
const subTemplate = TemplateFactory.createSubIssue({
    title: 'Task Title',
    description: 'Task description',
    technicalSpecs: 'Technical specifications',
    files: ['file1.js', 'file2.js'],
    acceptanceCriteria: [...]
});

// Bug report template
const bugTemplate = TemplateFactory.createBugReport({
    title: 'Bug Title',
    description: 'Bug description',
    stepsToReproduce: [...],
    expectedBehavior: 'Expected behavior',
    actualBehavior: 'Actual behavior',
    environment: { os: 'macOS', browser: 'Chrome' }
});
```

### Custom Templates

```javascript
// Create custom template
class CustomTemplate {
    constructor(data) {
        this.data = data;
    }
    
    generate() {
        return `# ${this.data.title}\n\nCustom content here...`;
    }
}

// Use with factory
TemplateFactory.registerTemplate('custom', CustomTemplate);
const template = TemplateFactory.getTemplate('custom', data);
```

## 🔧 Middleware

### Express.js Integration

```javascript
import express from 'express';
import {
    createLinearWebhookRouter,
    createLinearApiRouter,
    createAuthMiddlewareStack
} from './src/integrations/linear/index.js';

const app = express();

// Apply security middleware
app.use(createAuthMiddlewareStack({
    enableRateLimit: true,
    enableCors: true,
    enableLogging: true,
    enableSecurity: true
}));

// Webhook endpoints
app.use(createLinearWebhookRouter(webhookHandler));

// API endpoints
app.use(createLinearApiRouter(integration));
```

### Custom Middleware

```javascript
import {
    webhookAuthMiddleware,
    apiAuthMiddleware,
    rateLimitMiddleware
} from './src/integrations/linear/index.js';

// Custom webhook middleware
app.use('/webhooks/linear', [
    rateLimitMiddleware({ maxRequests: 50 }),
    webhookAuthMiddleware,
    (req, res, next) => {
        // Custom logic
        next();
    }
]);
```

## 📊 Monitoring & Analytics

### Health Checks

```javascript
// Client health check
const isHealthy = await client.healthCheck();

// Integration health check
app.get('/health/linear', async (req, res) => {
    const health = {
        client: await client.healthCheck(),
        webhook: webhookHandler.isHealthy(),
        orchestrator: orchestrator.isHealthy()
    };
    
    res.json(health);
});
```

### Metrics Collection

```javascript
// Status statistics
const stats = await statusManager.getStatusStatistics();
console.log('Issue Statistics:', stats);

// Progress monitoring
orchestrator.on('progressValidated', ({ progressData }) => {
    console.log(`Progress: ${progressData.progress}%`);
    // Send to monitoring system
});

// Performance metrics
client.on('requestCompleted', ({ duration, operation }) => {
    console.log(`${operation} completed in ${duration}ms`);
});
```

## 🧪 Testing

### Unit Tests

```javascript
import { LinearIntegration } from './src/integrations/linear/client.js';

describe('LinearIntegration', () => {
    let client;
    
    beforeEach(() => {
        client = new LinearIntegration('test-key', 'test-team');
    });
    
    it('should create task issue', async () => {
        const issue = await client.createTaskIssue({
            title: 'Test Task',
            description: 'Test description'
        });
        
        expect(issue).toBeDefined();
        expect(issue.title).toBe('Test Task');
    });
});
```

### Integration Tests

```javascript
describe('Linear Integration', () => {
    let integration;
    
    beforeAll(async () => {
        integration = await setupLinearIntegration({
            apiKey: process.env.TEST_LINEAR_API_KEY,
            teamId: process.env.TEST_LINEAR_TEAM_ID,
            database: testDatabase
        });
    });
    
    it('should create project with sub-issues', async () => {
        const result = await integration.orchestrator.createProjectIssues({
            name: 'Test Project',
            tasks: [{ title: 'Test Task' }]
        });
        
        expect(result.mainIssue).toBeDefined();
        expect(result.subIssues).toHaveLength(1);
    });
});
```

## 🔒 Security

### Authentication

- API key validation and secure storage
- Webhook signature verification using HMAC-SHA256
- Rate limiting to prevent abuse
- CORS configuration for webhook endpoints

### Best Practices

```javascript
// Secure configuration
const config = {
    apiKey: process.env.LINEAR_API_KEY, // Never hardcode
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
    validateSignature: true, // Always validate in production
    enableRateLimit: true,
    enableLogging: true
};

// Validate all inputs
const sanitizedData = sanitizeInput(userInput);
await client.createTaskIssue(sanitizedData);
```

## 🚀 Deployment

### Production Setup

```javascript
// Production configuration
const integration = await setupLinearIntegration({
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
    database: productionDatabase,
    environment: 'production',
    
    // Production optimizations
    retryAttempts: 3,
    progressCheckInterval: 30000,
    enableMetrics: true,
    logLevel: 'warn'
});
```

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV LINEAR_API_KEY=${LINEAR_API_KEY}
ENV LINEAR_TEAM_ID=${LINEAR_TEAM_ID}

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

```bash
# Production environment
LINEAR_API_KEY=lin_api_production_key
LINEAR_TEAM_ID=production_team_id
LINEAR_WEBHOOK_SECRET=production_webhook_secret
LINEAR_VALIDATE_SIGNATURE=true
LINEAR_ENABLE_METRICS=true
LINEAR_LOG_LEVEL=warn
```

## 📈 Performance

### Optimization Tips

1. **Caching**: Enable caching for frequently accessed data
2. **Batch Operations**: Use bulk operations for multiple updates
3. **Rate Limiting**: Respect Linear API rate limits
4. **Connection Pooling**: Reuse HTTP connections
5. **Monitoring**: Track performance metrics

### Performance Configuration

```javascript
const optimizedConfig = {
    // Caching
    cacheEnabled: true,
    cacheTtl: 300000, // 5 minutes
    
    // Batch processing
    batchSize: 10,
    
    // Rate limiting
    requestsPerMinute: 100,
    burstLimit: 20,
    
    // Connection optimization
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
};
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Development Setup

```bash
git clone https://github.com/your-org/claude-task-master.git
cd claude-task-master
npm install
npm run test:linear
```

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: [Linear API Docs](https://developers.linear.app/)
- **Issues**: [GitHub Issues](https://github.com/your-org/claude-task-master/issues)
- **Discord**: [Community Discord](https://discord.gg/your-server)

## 🔗 Related

- [Linear SDK](https://github.com/linear/linear/tree/master/packages/sdk)
- [Linear GraphQL API](https://studio.apollographql.com/public/Linear-API/home)
- [Webhook Documentation](https://developers.linear.app/docs/graphql/webhooks)

