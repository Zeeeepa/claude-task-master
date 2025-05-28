# Codegen SDK Integration

This documentation covers the comprehensive Codegen SDK integration for natural language to PR creation in the AI CI/CD system.

## Overview

The Codegen integration enables automatic conversion of natural language task descriptions into pull requests through intelligent analysis, prompt generation, and code creation.

## Architecture

```
Natural Language Task → Task Analysis → Prompt Generation → Codegen API → PR Creation → Status Updates
```

### Core Components

1. **Codegen Client** (`src/ai_cicd_system/integrations/codegen/client.js`)
   - Handles authentication and API communication
   - Manages task creation and status tracking
   - Provides error handling and retry logic

2. **Task Analyzer** (`src/ai_cicd_system/integrations/codegen/task_analyzer.js`)
   - Analyzes natural language requirements
   - Extracts coding intent and complexity
   - Identifies technologies and dependencies

3. **Prompt Generator** (`src/ai_cicd_system/integrations/codegen/prompt_generator.js`)
   - Creates optimized prompts for Codegen API
   - Includes context and best practices
   - Supports multiple programming languages

4. **PR Creator** (`src/ai_cicd_system/integrations/codegen/pr_creator.js`)
   - Formats Codegen results into PR structure
   - Generates appropriate titles and descriptions
   - Handles different PR types (feature, bugfix, etc.)

5. **Context Manager** (`src/ai_cicd_system/integrations/codegen/context_manager.js`)
   - Builds comprehensive codebase context
   - Identifies relevant files and patterns
   - Optimizes context size for API limits

## Natural Language Processing

### Requirement Extractor (`src/ai_cicd_system/nlp/requirement_extractor.js`)

Extracts structured requirements from natural language:

```javascript
const extractor = new RequirementExtractor();
const requirements = await extractor.extractRequirements(
  "The system should validate user input and must handle errors gracefully"
);

// Result:
{
  functional: [
    { text: "validate user input", type: "explicit", confidence: 0.9 },
    { text: "handle errors gracefully", type: "explicit", confidence: 0.9 }
  ],
  nonFunctional: {
    reliability: [{ detected: true, confidence: 0.8 }]
  },
  technical: {},
  business: {},
  constraints: {}
}
```

### Code Intent Analyzer (`src/ai_cicd_system/nlp/code_intent_analyzer.js`)

Analyzes coding intent and complexity:

```javascript
const analyzer = new CodeIntentAnalyzer();
const analysis = await analyzer.analyzeIntent(
  "Create a React component for user authentication with TypeScript"
);

// Result:
{
  primary_intent: { intent: "create", confidence: 0.9 },
  artifacts: [
    { type: "component", confidence: 0.8, estimated_lines: 40 }
  ],
  complexity: { level: "medium", score: 15.5, estimated_hours: 4 },
  dependencies: {
    external: [{ name: "react", confidence: 0.7 }],
    technology: [{ name: "web_framework", confidence: 0.6 }]
  }
}
```

### Template Engine (`src/ai_cicd_system/nlp/template_engine.js`)

Generates code templates and structures:

```javascript
const engine = new TemplateEngine();
const template = await engine.generateTemplate(intentAnalysis, {
  language: 'typescript',
  framework: 'react'
});

// Result:
{
  type: "component",
  language: "typescript",
  framework: "react",
  structure: {
    name: "UserAuth",
    template: "function UserAuth(props: UserAuthProps) { ... }"
  },
  files: [
    { path: "src/components/UserAuth.tsx", type: "implementation" },
    { path: "tests/UserAuth.test.tsx", type: "test" }
  ]
}
```

## Workflow Integration

### Task Processor (`src/ai_cicd_system/workflow/task_processor.js`)

Enhanced task processing with Codegen integration:

```javascript
const processor = new TaskProcessor({
  enableCodegenIntegration: true,
  enableNLPAnalysis: true,
  enableTemplateGeneration: true
});

await processor.initialize();

const result = await processor.processTask({
  id: 'task-123',
  description: 'Add user authentication to the login component',
  type: 'feature'
}, {
  repository: 'my-org/my-repo',
  language: 'javascript',
  framework: 'react'
});

// Result includes analysis, template, and Codegen result
```

### PR Workflow (`src/ai_cicd_system/workflow/pr_workflow.js`)

Complete PR creation workflow:

```javascript
const workflow = new PRWorkflow({
  enableAutoReview: true,
  enableStatusTracking: true,
  defaultReviewers: ['reviewer1', 'reviewer2']
});

await workflow.initialize();

const result = await workflow.executeWorkflow({
  description: 'Implement user registration API endpoint'
}, {
  repository: 'my-org/my-repo',
  baseBranch: 'develop'
});

// Result includes PR number, URL, and complete workflow data
```

### Status Updater (`src/ai_cicd_system/workflow/status_updater.js`)

Tracks and updates workflow status:

```javascript
const updater = new StatusUpdater({
  enableLinearIntegration: true,
  enableNotifications: true
});

await updater.start();

// Track a workflow
const trackingId = updater.trackItem({
  type: 'task',
  externalId: 'TASK-123',
  linearIssueId: 'linear-issue-456',
  status: 'pending'
});

// Update status
updater.updateStatus(trackingId, 'processing', {
  step: 'code_generation',
  progress: 50
});
```

## Configuration

### Environment Variables

```bash
# Codegen API Configuration
CODEGEN_API_KEY=your-api-key
CODEGEN_API_URL=https://api.codegen.sh
CODEGEN_ORG_ID=your-org-id

# Rate Limiting
CODEGEN_REQUESTS_PER_MINUTE=10
CODEGEN_REQUESTS_PER_HOUR=100

# Features
CODEGEN_ENABLE_MOCK=false
CODEGEN_VALIDATE_ON_INIT=true

# Linear Integration
LINEAR_API_KEY=your-linear-api-key
LINEAR_TEAM_ID=your-team-id
```

### Configuration Object

```javascript
const config = {
  codegen: {
    api: {
      baseURL: 'https://api.codegen.sh',
      timeout: 30000
    },
    auth: {
      orgId: 'your-org-id',
      token: 'your-api-key',
      validateOnInit: true
    },
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 10,
      requestsPerHour: 100
    }
  },
  taskAnalyzer: {
    maxComplexityScore: 100,
    enableDetailedAnalysis: true
  },
  promptGenerator: {
    maxPromptLength: 4000,
    includeContext: true,
    optimizeForCodegen: true
  },
  prCreator: {
    defaultBranch: 'main',
    branchPrefix: 'codegen/',
    includeMetadata: true,
    autoAssignReviewers: true
  },
  contextManager: {
    maxContextSize: 10000,
    enableSmartFiltering: true
  }
};
```

## Usage Examples

### Basic Task Processing

```javascript
import { TaskProcessor } from './src/ai_cicd_system/workflow/task_processor.js';

const processor = new TaskProcessor();
await processor.initialize();

const result = await processor.processTask({
  description: 'Create a function to validate email addresses',
  type: 'feature'
});

console.log('Task processed:', result.status);
console.log('PR URL:', result.codegenResult?.prUrl);
```

### Batch Processing

```javascript
const tasks = [
  { description: 'Add input validation' },
  { description: 'Implement error handling' },
  { description: 'Create unit tests' }
];

const results = await processor.processBatch(tasks, {
  concurrent: 2,
  failFast: false
});

console.log(`Processed ${results.length} tasks`);
```

### Custom Workflow

```javascript
import { PRWorkflow } from './src/ai_cicd_system/workflow/pr_workflow.js';

const workflow = new PRWorkflow();
await workflow.initialize();

// Add event handlers
workflow.on('pr.created', ({ prData, submissionResult }) => {
  console.log(`PR created: ${submissionResult.prUrl}`);
});

workflow.on('workflow.completed', ({ workflow }) => {
  console.log(`Workflow ${workflow.id} completed in ${workflow.metadata.processingTimeMs}ms`);
});

const result = await workflow.executeWorkflow({
  description: 'Implement user authentication system'
});
```

## API Reference

### CodegenClient

#### Methods

- `initialize()` - Initialize the client with authentication
- `createPR(request)` - Create a PR from natural language
- `getTaskStatus(taskId)` - Get status of a Codegen task
- `cancelTask(taskId)` - Cancel a running task
- `getHealth()` - Get client health status
- `shutdown()` - Shutdown the client

#### Request Format

```javascript
{
  description: string,      // Natural language task description
  repository: string,       // Target repository
  context: {               // Additional context
    language?: string,     // Programming language
    framework?: string,    // Framework to use
    baseBranch?: string,   // Base branch for PR
    // ... other context
  }
}
```

#### Response Format

```javascript
{
  success: boolean,
  taskId: string,
  status: string,
  prUrl?: string,
  prNumber?: number,
  repository: string,
  description: string,
  metadata: {
    createdAt: string,
    responseTime: number,
    tokensUsed?: number
  },
  error?: {
    type: string,
    message: string,
    details?: any
  }
}
```

### TaskAnalyzer

#### Methods

- `analyzeTask(description, context)` - Analyze natural language task

#### Analysis Result

```javascript
{
  originalDescription: string,
  intent: {
    primary: string,           // create, modify, fix, refactor, delete
    confidence: number,        // 0-1
    description: string
  },
  complexity: {
    level: string,            // simple, medium, complex
    score: number,            // Complexity score
    factors: Array,           // Contributing factors
    estimatedHours: number,   // Estimated effort
    estimatedLines: number,   // Estimated lines of code
    estimatedFiles: number    // Estimated number of files
  },
  requirements: {
    functional: Array,        // Functional requirements
    nonFunctional: Object,    // Non-functional requirements
    technical: Object,        // Technical requirements
    business: Object          // Business requirements
  },
  technologies: {
    languages: Array,         // Programming languages
    frameworks: Array,        // Frameworks
    databases: Array,         // Databases
    tools: Array             // Tools
  },
  scope: {
    size: string,            // small, medium, large
    affectedAreas: Array,    // Areas of impact
    estimatedFiles: number,  // Number of files
    estimatedLines: number   // Lines of code
  },
  riskFactors: Array,        // Identified risks
  priority: {
    score: number,           // Priority score 0-100
    level: string,           // low, medium, high, critical
    factors: Object          // Priority factors
  }
}
```

## Error Handling

### Common Errors

1. **Authentication Errors**
   ```javascript
   {
     type: 'AUTHENTICATION_FAILED',
     message: 'Invalid API key or organization ID',
     code: 401
   }
   ```

2. **Rate Limiting**
   ```javascript
   {
     type: 'RATE_LIMIT_EXCEEDED',
     message: 'API rate limit exceeded. Retry after 60 seconds',
     retryAfter: 60
   }
   ```

3. **Task Processing Errors**
   ```javascript
   {
     type: 'TASK_PROCESSING_FAILED',
     message: 'Failed to process natural language task',
     details: { stage: 'analysis', reason: 'Invalid input' }
   }
   ```

### Error Recovery

```javascript
try {
  const result = await codegenClient.createPR(request);
  if (!result.success) {
    // Handle API errors
    console.error('Codegen error:', result.error);
    
    if (result.error.type === 'RATE_LIMIT_EXCEEDED') {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      return await codegenClient.createPR(request);
    }
  }
} catch (error) {
  // Handle network or system errors
  console.error('System error:', error.message);
}
```

## Testing

### Unit Tests

```bash
npm test tests/integrations/codegen/
```

### Integration Tests

```bash
npm run test:integration
```

### Test Configuration

```javascript
const testConfig = {
  codegen: {
    mode: 'test',
    api: { baseURL: 'https://api.test.codegen.sh' },
    auth: { orgId: 'test', token: 'test-token' }
  }
};
```

## Performance Considerations

### Optimization Tips

1. **Context Size Management**
   - Keep context under 10KB for optimal performance
   - Use smart filtering to include only relevant files
   - Cache frequently used context data

2. **Rate Limiting**
   - Implement exponential backoff for retries
   - Use batch processing for multiple tasks
   - Monitor API usage and quotas

3. **Prompt Optimization**
   - Keep prompts under 4000 characters
   - Include only essential context
   - Use templates for common patterns

### Monitoring

```javascript
// Get performance statistics
const stats = processor.getStatistics();
console.log('Processing stats:', {
  averageTime: stats.averageProcessingTime,
  successRate: stats.successRate,
  cacheHitRate: stats.cacheHitRate
});

// Monitor health
const health = await processor.getHealth();
if (health.status !== 'healthy') {
  console.warn('System health issue:', health.error);
}
```

## Troubleshooting

### Common Issues

1. **Slow Processing**
   - Check network connectivity
   - Verify API rate limits
   - Optimize context size

2. **Poor Code Quality**
   - Improve prompt specificity
   - Add more context about coding standards
   - Use better requirement extraction

3. **Authentication Issues**
   - Verify API key and organization ID
   - Check token expiration
   - Ensure proper permissions

### Debug Mode

```javascript
const processor = new TaskProcessor({
  debug: true,
  logLevel: 'debug'
});
```

### Logging

```javascript
import { log } from './src/ai_cicd_system/utils/logger.js';

log('info', 'Processing task', { taskId: 'task-123' });
log('error', 'Task failed', { error: error.message });
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`

### Adding New Features

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request

### Code Style

- Use ESLint configuration
- Follow existing patterns
- Add comprehensive tests
- Document public APIs

## License

This project is licensed under the MIT License. See LICENSE file for details.

