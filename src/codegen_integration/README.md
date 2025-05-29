# Codegen Integration System

A comprehensive foundational system for integrating with codegen APIs, generating intelligent prompts, and tracking PR creation workflows. This system enables maximum concurrency by providing well-defined interfaces and mock implementations for immediate development.

## 🚀 Features

### Core Capabilities

- **Intelligent Prompt Generation**: Convert atomic tasks into effective codegen prompts with context enhancement
- **Codegen API Integration**: Seamless communication with codegen APIs for PR creation
- **PR Tracking & Management**: Complete lifecycle tracking of generated PRs
- **Error Handling & Retries**: Robust error handling with configurable retry logic
- **Workflow Orchestration**: End-to-end task processing with comprehensive monitoring
- **Mock Implementations**: Full mock mode for development and testing

### Interface-First Design

- **Maximum Concurrency**: Well-defined interfaces enable parallel development
- **Forward Compatibility**: Designed for future integration with Claude Code validation
- **Comprehensive Context**: Includes codebase context, validation requirements, and metadata
- **Configurable Templates**: Support for different task types with customizable templates

## 📁 Architecture

```
src/codegen_integration/
├── types.js                 # Type definitions and constants
├── integration.js           # Main orchestrator class
├── codegen_client.js        # API client for codegen communication
├── pr_tracker.js           # PR lifecycle tracking
├── examples.js             # Usage examples and mock data
├── index.js                # Main entry point
├── README.md               # This file
└── tests/
    └── integration.test.js  # Comprehensive test suite

src/prompt_generation/
├── prompt_generator.js     # Intelligent prompt generation engine
└── templates.js           # Prompt templates for different task types
```

## 🛠 Installation & Setup

### Basic Setup

```javascript
import { createCompleteIntegration } from './src/codegen_integration/index.js';

// Create integration with all features enabled
const integration = createCompleteIntegration({
    codegenClient: {
        apiKey: process.env.CODEGEN_API_KEY,
        apiUrl: 'https://api.codegen.sh'
    },
    enableTracking: true,
    maxRetries: 3
});
```

### Environment Variables

```bash
# Required for production use
CODEGEN_API_KEY=your_codegen_api_key_here

# Optional configuration
CODEGEN_API_URL=https://api.codegen.sh
GITHUB_TOKEN=your_github_token_here
WEBHOOK_SECRET=your_webhook_secret_here
```

## 📖 Usage Examples

### Basic Prompt Generation

```javascript
import { createPromptGenerator } from './src/codegen_integration/index.js';

const generator = createPromptGenerator();

const task = {
    id: 'task_001',
    title: 'Implement user authentication',
    description: 'Create secure JWT-based authentication system',
    type: 'implementation',
    requirements: [
        'Use bcrypt for password hashing',
        'Implement JWT token generation',
        'Add rate limiting for login attempts'
    ],
    acceptance_criteria: [
        'Users can register and login',
        'Passwords are securely hashed',
        'JWT tokens expire after 24 hours'
    ]
};

const context = {
    project_name: 'TaskMaster API',
    codebase_context: {
        language: 'JavaScript',
        framework: 'Node.js with Express',
        coding_standards: ['Use ESLint', 'Follow JSDoc standards']
    }
};

const prompt = generator.generatePrompt(task, context);
console.log('Generated prompt:', prompt.content);
```

### Complete Workflow

```javascript
import { createCompleteIntegration } from './src/codegen_integration/index.js';

const integration = createCompleteIntegration();

async function processTask(task, context) {
    try {
        // Process the complete workflow
        const result = await integration.processTask(task, context);
        
        console.log('Workflow completed:', result.workflow_id);
        console.log('Status:', result.status);
        
        if (result.pr_info) {
            console.log('PR created:', result.pr_info.pr_url);
            console.log('PR number:', result.pr_info.pr_number);
        }
        
        return result;
    } catch (error) {
        console.error('Workflow failed:', error);
        throw error;
    }
}
```

### PR Tracking

```javascript
// Track PR creation
await integration.trackPRCreation(taskId, {
    pr_url: 'https://github.com/org/repo/pull/123',
    pr_number: 123,
    branch_name: 'feature/auth-system',
    title: 'Implement authentication system',
    status: 'open'
});

// Get PR status
const prStatus = await integration.getPRStatus(taskId);
console.log('PR status:', prStatus);

// Add check results
await integration.prTracker.addCheckResult(prUrl, {
    name: 'CI/CD Pipeline',
    status: 'completed',
    conclusion: 'success'
});
```

### Error Handling & Retries

```javascript
try {
    const result = await integration.processTask(task, context);
    
    if (result.status === 'failed') {
        console.log('Task failed, attempting retry...');
        const retryResult = await integration.retryFailedRequest(task.id);
        console.log('Retry result:', retryResult.status);
    }
} catch (error) {
    console.error('Task processing failed:', error);
}
```

## 🎯 Task Types & Templates

The system supports multiple task types with specialized prompt templates:

### Implementation Tasks
```javascript
const implementationTask = {
    type: 'implementation',
    title: 'Add new feature',
    description: 'Detailed feature description',
    requirements: ['Requirement 1', 'Requirement 2'],
    acceptance_criteria: ['Criteria 1', 'Criteria 2']
};
```

### Bug Fix Tasks
```javascript
const bugFixTask = {
    type: 'bug_fix',
    title: 'Fix critical bug',
    description: 'Bug description and impact',
    metadata: {
        severity: 'high',
        reproduction_steps: ['Step 1', 'Step 2'],
        error_details: 'Error message or stack trace'
    }
};
```

### Feature Development
```javascript
const featureTask = {
    type: 'feature',
    title: 'New feature development',
    description: 'Feature requirements and specifications',
    metadata: {
        user_stories: ['As a user, I want...'],
        api_design: 'API specification',
        ui_requirements: 'UI/UX requirements'
    }
};
```

## 🔧 Configuration Options

### Prompt Generator Options
```javascript
const promptGenerator = createPromptGenerator({
    maxContextSize: 8000,           // Maximum prompt size
    includeCodeExamples: true,      // Include code examples
    enhanceWithBestPractices: true // Add best practices
});
```

### Codegen Client Options
```javascript
const codegenClient = createCodegenClient({
    apiUrl: 'https://api.codegen.sh',
    apiKey: 'your-api-key',
    timeout: 60000,                 // Request timeout
    retryAttempts: 3,              // Number of retries
    retryDelay: 2000               // Delay between retries
});
```

### PR Tracker Options
```javascript
const prTracker = createPRTracker({
    storageBackend: 'memory',       // Storage backend
    githubToken: 'github-token',    // GitHub API token
    webhookSecret: 'webhook-secret' // Webhook secret
});
```

## 📊 Monitoring & Statistics

### Integration Statistics
```javascript
const stats = await integration.getStatistics();
console.log('Active requests:', stats.active_requests);
console.log('Completed requests:', stats.completed_requests);
console.log('Success rate:', stats.success_rate + '%');
```

### PR Statistics
```javascript
const prStats = await integration.prTracker.getPRStatistics();
console.log('Total PRs:', prStats.total);
console.log('Open PRs:', prStats.by_status.open);
console.log('Merged PRs:', prStats.by_status.merged);
console.log('Success rate:', prStats.success_rate + '%');
```

## 🧪 Testing

### Running Tests
```bash
npm test src/codegen_integration/tests/
```

### Mock Mode
The system includes comprehensive mock implementations for development and testing:

```javascript
// Mock mode is automatically enabled when no API key is provided
const integration = createCompleteIntegration(); // Uses mock mode

// Mock responses include realistic data
const response = await integration.sendCodegenRequest(prompt);
console.log('Mock PR URL:', response.pr_info.pr_url);
```

### Test Data Generators
```javascript
import { MockDataGenerators } from './src/codegen_integration/examples.js';

const mockTask = MockDataGenerators.createMockTask({
    type: 'implementation',
    title: 'Custom task title'
});

const mockContext = MockDataGenerators.createMockContext({
    project_name: 'My Project'
});
```

## 🔄 Workflow Integration

### Integration Points

The system is designed to integrate with:

- **Task Storage (ZAM-537)**: Retrieve task context for prompt generation
- **Claude Code Validation**: Include validation requirements in prompts
- **Workflow Orchestration**: Track PR creation and status
- **Error Handling**: Manage codegen failures and retries

### Webhook Support

```javascript
// Handle GitHub webhook events
await integration.prTracker.handleWebhookEvent({
    action: 'closed',
    pull_request: {
        html_url: 'https://github.com/org/repo/pull/123',
        merged: true
    }
});

// Handle check suite events
await integration.prTracker.handleCheckSuiteEvent({
    action: 'completed',
    check_suite: {
        status: 'completed',
        conclusion: 'success'
    },
    pull_requests: [{ html_url: 'pr-url' }]
});
```

## 🚀 Production Deployment

### Production Configuration
```javascript
import { DEFAULT_PRODUCTION_CONFIG } from './src/codegen_integration/index.js';

const integration = createCompleteIntegration(DEFAULT_PRODUCTION_CONFIG);
```

### Database Integration
For production use, replace the in-memory storage with a database:

```javascript
const integration = createCompleteIntegration({
    prTracker: {
        storageBackend: 'postgresql',
        connectionString: process.env.DATABASE_URL
    }
});
```

### Monitoring & Alerting
```javascript
// Set up monitoring
setInterval(async () => {
    const stats = await integration.getStatistics();
    
    if (stats.success_rate < 90) {
        console.warn('Success rate below threshold:', stats.success_rate);
        // Send alert
    }
}, 60000); // Check every minute
```

## 🔧 Maintenance

### Cleanup Operations
```javascript
// Clean up old data (run periodically)
const cleanupResult = await integration.cleanup(30); // 30 days
console.log('Cleaned up:', cleanupResult.cleaned_requests, 'requests');
```

### Health Checks
```javascript
// Check system health
async function healthCheck() {
    try {
        const stats = await integration.getStatistics();
        const usageStats = await integration.codegenClient.getUsageStats();
        
        return {
            status: 'healthy',
            active_requests: stats.active_requests,
            success_rate: stats.success_rate,
            api_quota_remaining: usageStats?.requests_remaining
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}
```

## 📚 API Reference

### Main Classes

- **CodegenIntegration**: Main orchestrator class
- **PromptGenerator**: Intelligent prompt generation
- **CodegenClient**: API client for codegen communication
- **PRTracker**: PR lifecycle tracking

### Factory Functions

- **createCompleteIntegration()**: Full-featured integration
- **createMinimalIntegration()**: Lightweight integration
- **createPromptGenerator()**: Standalone prompt generator
- **createCodegenClient()**: Standalone API client
- **createPRTracker()**: Standalone PR tracker

### Convenience Functions

- **generateTaskPrompt()**: Generate prompt for a task
- **sendToCodegen()**: Send prompt to codegen API
- **parseCodegenResponse()**: Extract PR info from response
- **trackPRCreation()**: Track PR creation manually

## 🤝 Contributing

1. Follow the established coding standards
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Use the mock implementations for testing
5. Ensure backward compatibility

## 📄 License

This codegen integration system is part of the Task Master project and follows the same MIT License with Commons Clause.

