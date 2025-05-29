# Codegen SDK Integration

A comprehensive, production-ready integration that consolidates all Codegen SDK functionality into a unified system for natural language to PR creation.

## 🎯 Overview

This integration combines the best elements from multiple Codegen implementations into a single, cohesive system that:

- **Analyzes** natural language task descriptions using advanced NLP
- **Generates** optimized prompts for the Codegen API
- **Creates** pull requests automatically with comprehensive metadata
- **Tracks** status across multiple systems (Linear, webhooks, notifications)
- **Provides** robust error handling and retry mechanisms

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Task Input    │───▶│  Task Analyzer  │───▶│ Prompt Generator│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Status Updater  │◄───│   PR Workflow   │◄───│ Codegen Client  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

1. **CodegenIntegration** - Main orchestrator class
2. **CodegenClient** - API communication with rate limiting and error handling
3. **TaskAnalyzer** - Natural language processing and requirement extraction
4. **PromptGenerator** - Optimized prompt creation for Codegen API
5. **PRWorkflow** - Complete workflow from task to PR creation
6. **StatusUpdater** - Multi-system status tracking and notifications
7. **CodegenConfig** - Unified configuration management

## 🚀 Quick Start

### Installation

```bash
npm install @octokit/rest
```

### Basic Usage

```javascript
import { CodegenIntegration } from './src/integrations/codegen/index.js';

// Initialize with configuration
const codegen = new CodegenIntegration({
  apiKey: process.env.CODEGEN_API_KEY,
  orgId: process.env.CODEGEN_ORG_ID,
  githubToken: process.env.GITHUB_TOKEN,
  defaultRepository: 'your-org/your-repo'
});

// Initialize the integration
await codegen.initialize();

// Process a task
const result = await codegen.processTask({
  id: 'task-123',
  title: 'Add user authentication',
  description: 'Implement JWT-based authentication system with login and logout functionality'
}, {
  repository: 'your-org/your-repo',
  language: 'javascript',
  framework: 'express'
});

console.log(`PR created: ${result.prUrl}`);
```

### Environment Variables

```bash
# Required
CODEGEN_API_KEY=your-codegen-api-key
CODEGEN_ORG_ID=your-organization-id
GITHUB_TOKEN=your-github-token

# Optional
CODEGEN_API_URL=https://api.codegen.sh
DEFAULT_REPOSITORY=your-org/your-repo
LINEAR_API_KEY=your-linear-api-key
WEBHOOK_URL=https://your-domain.com/webhooks
LOG_LEVEL=info
```

## 📋 Features

### Natural Language Processing

- **Intent Classification** - Automatically determines task type (create, modify, test, document)
- **Complexity Analysis** - Estimates effort, files, and lines of code
- **Requirement Extraction** - Identifies functional and non-functional requirements
- **Technology Detection** - Recognizes programming languages and frameworks
- **Risk Assessment** - Identifies potential challenges and dependencies

### Intelligent Prompt Generation

- **Template-Based** - Uses optimized templates for different task types
- **Context-Aware** - Includes relevant codebase context and examples
- **Quality Standards** - Incorporates language-specific best practices
- **Length Optimization** - Automatically optimizes prompts for API limits

### Robust PR Workflow

- **Automated Branch Management** - Creates and manages feature branches
- **Comprehensive PR Descriptions** - Generates detailed PR metadata
- **Review Assignment** - Automatically assigns reviewers based on configuration
- **Status Tracking** - Monitors progress from task to merged PR

### Multi-System Integration

- **Linear Integration** - Updates Linear issues with PR information
- **Webhook Support** - Sends real-time updates to configured endpoints
- **Notification Channels** - Supports Slack, email, and custom notifications
- **GitHub Integration** - Full GitHub API integration for PR management

### Production-Ready Features

- **Rate Limiting** - Respects API limits with intelligent queuing
- **Error Handling** - Comprehensive retry logic with exponential backoff
- **Circuit Breaker** - Prevents cascade failures during outages
- **Monitoring** - Built-in metrics and health checks
- **Configuration Management** - Environment-specific configurations

## 🔧 Configuration

### Basic Configuration

```javascript
const config = {
  // API Configuration
  apiKey: 'your-api-key',
  orgId: 'your-org-id',
  baseURL: 'https://api.codegen.sh',
  
  // Rate Limiting
  rateLimitingEnabled: true,
  requestsPerMinute: 60,
  
  // GitHub Integration
  githubToken: 'your-github-token',
  defaultRepository: 'owner/repo',
  branchPrefix: 'codegen/',
  
  // Quality Settings
  minQualityScore: 75,
  enableSecurityAnalysis: true,
  
  // Monitoring
  enableMetrics: true,
  logLevel: 'info'
};
```

### Advanced Configuration

```javascript
const advancedConfig = {
  // Task Analyzer
  taskAnalyzer: {
    maxComplexityScore: 100,
    supportedLanguages: ['javascript', 'typescript', 'python'],
    confidenceThreshold: 0.7
  },
  
  // Prompt Generator
  promptGenerator: {
    maxPromptLength: 4000,
    includeContext: true,
    includeExamples: false,
    templateVersion: '1.0'
  },
  
  // PR Workflow
  prWorkflow: {
    enableAutoReview: true,
    defaultReviewers: ['reviewer1', 'reviewer2'],
    timeoutMs: 600000
  },
  
  // Status Updates
  statusUpdater: {
    enableLinearIntegration: true,
    enableWebhooks: true,
    notificationChannels: ['slack', 'email']
  }
};
```

## 📊 API Reference

### CodegenIntegration

#### Methods

- `initialize()` - Initialize the integration
- `processTask(task, options)` - Process a single task
- `processBatch(tasks, options)` - Process multiple tasks
- `getMetrics()` - Get performance metrics
- `getStatus()` - Get integration status
- `shutdown()` - Gracefully shutdown

#### Events

- `task.started` - Task processing started
- `task.completed` - Task processing completed
- `task.failed` - Task processing failed
- `pr.created` - PR created successfully

### Task Object

```javascript
{
  id: 'task-123',
  title: 'Task title',
  description: 'Detailed task description',
  type: 'feature', // optional
  priority: 'high', // optional
  metadata: {} // optional
}
```

### Processing Options

```javascript
{
  repository: 'owner/repo',
  language: 'javascript',
  framework: 'react',
  baseBranch: 'main',
  includeContext: true,
  includeExamples: false,
  maxPromptLength: 4000,
  constraints: {}
}
```

### Result Object

```javascript
{
  success: true,
  taskId: 'task-123',
  prUrl: 'https://github.com/owner/repo/pull/123',
  prNumber: 123,
  branch: 'codegen/feature-branch',
  repository: 'owner/repo',
  processingTime: 45000,
  analysis: {
    intent: { primary: 'create', confidence: 0.9 },
    complexity: { level: 'medium', estimatedHours: 4 },
    technologies: { languages: ['javascript'], frameworks: ['react'] }
  },
  metadata: {
    complexity: 'medium',
    estimatedEffort: 4,
    filesCreated: 2,
    linesOfCode: 150
  }
}
```

## 🧪 Testing

### Unit Tests

```bash
npm test src/integrations/codegen/
```

### Integration Tests

```bash
npm run test:integration
```

### Mock Mode

For testing and development, enable mock mode:

```javascript
const codegen = new CodegenIntegration({
  enableMock: true,
  // other config...
});
```

## 📈 Monitoring

### Metrics

The integration provides comprehensive metrics:

```javascript
const metrics = codegen.getMetrics();
console.log(metrics);
// {
//   tasksProcessed: 150,
//   prsCreated: 142,
//   errors: 8,
//   successRate: 94.67,
//   averageProcessingTime: 45000,
//   lastProcessedAt: "2024-01-15T10:30:00Z"
// }
```

### Health Checks

```javascript
const status = await codegen.getStatus();
console.log(status.healthy); // true/false
```

### Logging

Configure logging levels:

```bash
LOG_LEVEL=debug npm start
```

## 🔒 Security

### API Key Management

- Store API keys securely in environment variables
- Use different keys for different environments
- Rotate keys regularly

### Rate Limiting

- Built-in rate limiting prevents API abuse
- Configurable limits per second/minute/hour/day
- Intelligent queuing and backoff

### Data Protection

- No sensitive data logged by default
- Secure transmission of all API calls
- Minimal data retention

## 🚨 Error Handling

### Common Errors

1. **Authentication Failed**
   ```javascript
   // Check API key and organization ID
   console.log(process.env.CODEGEN_API_KEY);
   console.log(process.env.CODEGEN_ORG_ID);
   ```

2. **Rate Limit Exceeded**
   ```javascript
   // Reduce request frequency or increase limits
   const config = { requestsPerMinute: 30 };
   ```

3. **GitHub Access Denied**
   ```javascript
   // Verify GitHub token permissions
   console.log(process.env.GITHUB_TOKEN);
   ```

### Error Recovery

The integration includes automatic error recovery:

- **Exponential Backoff** - Automatic retry with increasing delays
- **Circuit Breaker** - Prevents cascade failures
- **Graceful Degradation** - Continues operation with reduced functionality

## 🔄 Migration Guide

### From Individual PRs

If you're migrating from individual PR implementations:

1. **Remove old implementations**
2. **Update imports** to use the consolidated integration
3. **Update configuration** to use the unified config format
4. **Test thoroughly** in development environment

### Configuration Migration

```javascript
// Old configuration (multiple files)
import { CodegenClient } from './old/codegen_client.js';
import { TaskProcessor } from './old/task_processor.js';

// New configuration (unified)
import { CodegenIntegration } from './src/integrations/codegen/index.js';
```

## 🤝 Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`

### Code Style

- Use ESLint configuration
- Follow existing patterns
- Add comprehensive tests
- Document public APIs

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the troubleshooting guide
- Review the API documentation
- Contact the development team

---

**Generated by**: Codegen Integration Consolidation  
**Last Updated**: 2024-01-15  
**Version**: 1.0.0

