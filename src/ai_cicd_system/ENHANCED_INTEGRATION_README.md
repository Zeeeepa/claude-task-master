# Enhanced Codegen Integration (PR #22 Extension)

## 🎯 Overview

This enhanced codegen integration extends the improvements from PR #22 to provide a comprehensive, production-ready solution for AI-driven CI/CD workflows. It includes database-driven prompt generation, webhook handling, advanced error recovery, and intelligent context enrichment.

## 🚀 Key Features

### 1. Database-Driven Prompt Generation
- **Task Context Retrieval**: Automatically pulls task requirements and context from PostgreSQL
- **Dynamic Template Selection**: Intelligently chooses optimal prompt templates based on task type and complexity
- **Context Enrichment**: Enhances prompts with codebase analysis, dependencies, and historical data
- **Prompt Versioning**: Tracks and versions prompt templates for consistency and rollback capability

### 2. Webhook Integration
- **GitHub Webhook Handler**: Processes PR creation, update, and merge events with signature validation
- **Event Processing**: Asynchronous event queue with priority handling and retry logic
- **Status Synchronization**: Syncs PR status back to database and workflow engine
- **Security Features**: Signature validation, replay protection, and rate limiting

### 3. Advanced Error Recovery
- **Intelligent Retry Strategies**: Context-aware backoff with exponential, linear, or fixed strategies
- **Fallback Mechanisms**: Alternative codegen providers on primary failure
- **State Recovery**: Resume interrupted codegen operations from persisted state
- **Circuit Breaker**: Prevents cascade failures with configurable thresholds

### 4. Enhanced Prompt Management
- **Template Manager**: Versioned template system with caching and auto-reload
- **Context Enricher**: Intelligent context enhancement with file analysis and pattern detection
- **Performance Optimization**: Efficient caching and context size management

## 📁 Architecture

```
src/ai_cicd_system/
├── core/
│   ├── enhanced_codegen_integrator.js    # Main enhanced integrator
│   ├── database_prompt_generator.js      # DB-driven prompt generation
│   └── advanced_error_recovery.js        # Advanced error handling
├── webhooks/
│   ├── github_webhook_handler.js         # GitHub webhook processing
│   └── event_processor.js                # Asynchronous event processing
├── prompts/
│   ├── template_manager.js               # Template management system
│   └── context_enricher.js               # Context enhancement engine
└── ENHANCED_INTEGRATION_README.md

config/
└── webhook_config.js                     # Webhook configuration

templates/prompts/
├── bug_fix_simple.json                   # Simple bug fix template
├── feature_complex.json                  # Complex feature template
└── refactor_medium.json                  # Medium refactoring template
```

## 🛠️ Installation and Setup

### 1. Database Setup

Ensure PostgreSQL is configured and the following environment variables are set:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_cicd_system
DB_USER=your_username
DB_PASSWORD=your_password
DB_SSL=false

# Migration settings
DB_MIGRATIONS_DIR=./src/ai_cicd_system/database/migrations
```

### 2. Webhook Configuration

Configure GitHub webhooks with the following environment variables:

```bash
# GitHub Webhook Settings
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_WEBHOOK_PATH=/webhooks/github
GITHUB_WEBHOOK_SIGNATURE_VALIDATION=true

# Rate Limiting
WEBHOOK_RATE_LIMITING=true
WEBHOOK_MAX_REQUESTS=100
WEBHOOK_RATE_WINDOW_MS=60000

# Event Processing
WEBHOOK_QUEUE_SIZE=1000
WEBHOOK_PROCESSING_TIMEOUT=300000
WEBHOOK_BATCH_SIZE=10
WEBHOOK_RETRY_ATTEMPTS=3
```

### 3. Codegen API Configuration

```bash
# Codegen API Settings
CODEGEN_API_URL=https://api.codegen.sh
CODEGEN_API_KEY=your_api_key
CODEGEN_TIMEOUT=60000
CODEGEN_MAX_RETRIES=3

# Error Recovery
ERROR_RECOVERY_MAX_ATTEMPTS=5
ERROR_RECOVERY_BACKOFF_STRATEGY=exponential
ERROR_RECOVERY_BASE_DELAY=1000
```

## 🔧 Usage

### Basic Usage

```javascript
import { EnhancedCodegenIntegrator } from './src/ai_cicd_system/core/enhanced_codegen_integrator.js';

// Initialize with configuration
const integrator = new EnhancedCodegenIntegrator({
    database: {
        enabled: true,
        connection_pool_size: 10
    },
    webhooks: {
        enabled: true,
        github_secret: process.env.GITHUB_WEBHOOK_SECRET
    },
    prompts: {
        versioning_enabled: true,
        context_enrichment: true
    },
    error_recovery: {
        max_retry_attempts: 5,
        backoff_strategy: 'exponential'
    }
});

// Initialize the integrator
await integrator.initialize();

// Process a single task
const task = {
    id: 'task-123',
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication system',
    type: 'feature',
    complexity: 7
};

const result = await integrator.processTask(task, {
    requirements: ['JWT tokens', 'Password hashing', 'Session management'],
    acceptance_criteria: ['Secure login', 'Token refresh', 'Logout functionality']
});

console.log('Task processed:', result);
```

### Batch Processing

```javascript
// Process multiple tasks with enhanced options
const tasks = [
    { id: 'task-1', title: 'Fix login bug', type: 'bug_fix', priority: 1 },
    { id: 'task-2', title: 'Add user profile', type: 'feature', priority: 2 },
    { id: 'task-3', title: 'Refactor auth module', type: 'refactor', priority: 3 }
];

const results = await integrator.processTasks(tasks, {}, {
    concurrency: 3,
    batch_size: 10,
    priority_ordering: true,
    failure_threshold: 0.2
});

console.log('Batch processing results:', results);
```

### Webhook Handling

```javascript
// Handle GitHub webhook events
app.post('/webhooks/github', async (req, res) => {
    try {
        const event = req.body;
        const headers = req.headers;
        const rawBody = JSON.stringify(req.body);

        const result = await integrator.handleWebhookEvent(event, headers, rawBody);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Webhook processing failed:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Custom Template Management

```javascript
// Add custom prompt template
const customTemplate = {
    id: 'custom_api_template',
    name: 'Custom API Development Template',
    type: 'feature',
    complexity_level: 'medium',
    version: '1.0.0',
    content: `# API Development: {{TASK_TITLE}}

## Endpoint Specification
{{API_SPECIFICATION}}

## Request/Response Format
{{REQUEST_RESPONSE_FORMAT}}

## Authentication Requirements
{{AUTH_REQUIREMENTS}}

## Implementation Guidelines
- Follow RESTful principles
- Implement proper error handling
- Add comprehensive validation
- Include API documentation`,
    variables: {
        'API_SPECIFICATION': 'Detailed API endpoint specification',
        'REQUEST_RESPONSE_FORMAT': 'Request and response format details',
        'AUTH_REQUIREMENTS': 'Authentication and authorization requirements'
    }
};

await integrator.templateManager.addTemplate(customTemplate);
```

## 📊 Monitoring and Statistics

### Get Enhanced Statistics

```javascript
const stats = await integrator.getEnhancedStatistics();
console.log('Enhanced Statistics:', {
    requests: stats.requests,
    database: stats.database,
    webhooks: stats.webhooks,
    prompts: stats.prompts,
    error_recovery: stats.error_recovery,
    performance: stats.performance
});
```

### Health Monitoring

```javascript
const health = await integrator.getEnhancedHealth();
console.log('System Health:', {
    status: health.status,
    components: health.enhanced_components,
    active_requests: health.active_requests
});
```

## 🔒 Security Features

### Webhook Security
- **Signature Validation**: Validates GitHub webhook signatures using HMAC-SHA256
- **Replay Protection**: Prevents replay attacks with delivery ID tracking
- **Rate Limiting**: Configurable rate limiting per client IP
- **IP Validation**: Optional GitHub IP range validation

### Error Recovery Security
- **Circuit Breaker**: Prevents cascade failures
- **Timeout Protection**: Configurable timeouts for all operations
- **Secure Fallbacks**: Validated fallback provider configurations

### Database Security
- **Connection Pooling**: Secure connection pool management
- **Query Parameterization**: Prevents SQL injection attacks
- **Transaction Integrity**: ACID compliance for all database operations

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all enhanced integration tests
npm test tests/enhanced_codegen_integration.test.js

# Run specific test suites
npm test -- --grep "Database-Driven Prompt Generation"
npm test -- --grep "Webhook Integration"
npm test -- --grep "Advanced Error Recovery"
```

### Test Coverage

The test suite covers:
- ✅ Enhanced integrator initialization and configuration
- ✅ Database-driven prompt generation with caching
- ✅ Webhook event processing and validation
- ✅ Template management and selection
- ✅ Context enrichment and size limits
- ✅ Advanced error recovery with retries and fallbacks
- ✅ Event processing with priority queues
- ✅ Statistics and health monitoring
- ✅ Security features and validation

## 🚀 Performance Optimizations

### Caching Strategy
- **Template Caching**: LRU cache for frequently used templates
- **Context Caching**: Time-based cache for enriched contexts
- **Prompt Version Caching**: In-memory cache for prompt versions

### Database Optimizations
- **Connection Pooling**: Configurable connection pool size
- **Query Optimization**: Indexed queries for fast retrieval
- **Batch Operations**: Efficient batch processing for multiple tasks

### Memory Management
- **Context Size Limits**: Configurable maximum context size
- **Cache Cleanup**: Automatic cleanup of expired cache entries
- **Resource Monitoring**: Memory usage tracking and alerts

## 🔧 Configuration Reference

### Enhanced Integrator Configuration

```javascript
const config = {
    // Database configuration
    database: {
        enabled: true,
        connection_pool_size: 10,
        query_timeout: 30000,
        retry_attempts: 3
    },
    
    // Webhook configuration
    webhooks: {
        enabled: true,
        github_secret: 'your-secret',
        endpoint_path: '/webhooks/github',
        signature_validation: true,
        event_queue_size: 1000,
        processing_timeout: 300000
    },
    
    // Prompt configuration
    prompts: {
        versioning_enabled: true,
        template_cache_size: 100,
        context_enrichment: true,
        max_context_size: 50000
    },
    
    // Error recovery configuration
    error_recovery: {
        max_retry_attempts: 5,
        backoff_strategy: 'exponential',
        fallback_providers: [],
        state_persistence: true
    }
};
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failures**
   ```bash
   # Check database connectivity
   psql -h localhost -U username -d ai_cicd_system -c "SELECT 1;"
   ```

2. **Webhook Signature Validation Errors**
   ```javascript
   // Verify webhook secret configuration
   console.log('Webhook secret configured:', !!process.env.GITHUB_WEBHOOK_SECRET);
   ```

3. **Template Loading Issues**
   ```bash
   # Check template directory permissions
   ls -la templates/prompts/
   ```

4. **Memory Issues with Large Contexts**
   ```javascript
   // Monitor context sizes
   const stats = await integrator.contextEnricher.getStatistics();
   console.log('Context size distribution:', stats.context_size_distribution);
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
export LOG_LEVEL=debug
export WEBHOOK_LOG_PAYLOADS=true
export WEBHOOK_LOG_HEADERS=true
```

## 🤝 Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Code Style

- Follow ESLint configuration
- Use JSDoc comments for all public methods
- Write comprehensive tests for new features
- Update documentation for API changes

## 📝 Changelog

### Version 1.0.0 (Enhanced Integration)
- ✅ Database-driven prompt generation
- ✅ GitHub webhook integration with security
- ✅ Advanced error recovery with circuit breaker
- ✅ Template management system
- ✅ Context enrichment engine
- ✅ Comprehensive test suite
- ✅ Performance optimizations
- ✅ Security enhancements

## 📄 License

This enhanced integration follows the same license as the main project.

## 🔗 Related Documentation

- [Main AI-CICD System README](../README.md)
- [Database Schema Documentation](../database/README.md)
- [Webhook Configuration Guide](../../config/webhook_config.js)
- [Template Development Guide](../prompts/README.md)

---

**Built with ❤️ for the AI-driven CI/CD future**

