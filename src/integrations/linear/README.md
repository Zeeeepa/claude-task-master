# Linear Integration for Task Master

Comprehensive Linear integration with automated main issue + sub-issue correlation, bidirectional synchronization, and hierarchical task structure management.

## 🎯 Overview

This Linear integration provides seamless connectivity between Task Master and Linear, enabling:

- **Automated Issue Creation**: Main issues and sub-issues from requirements and tasks
- **Bidirectional Synchronization**: Real-time sync between Task Master and Linear
- **Hierarchical Management**: Parent-child relationships and correlation tracking
- **Progress Tracking**: Automated progress calculation and reporting
- **Project Management**: Automatic project assignment and milestone tracking
- **Webhook Integration**: Real-time event processing from Linear
- **Comprehensive Logging**: Full audit trail and performance monitoring

## 🏗️ Architecture

```
Linear Integration
├── API Client (api-client.js)
│   ├── GraphQL API integration
│   ├── Rate limiting & error handling
│   └── Caching & performance optimization
├── Issue Manager (issue-manager.js)
│   ├── Issue creation & updates
│   ├── Comment management
│   └── Label & project assignment
├── Sync Service (sync-service.js)
│   ├── Bidirectional synchronization
│   ├── Conflict resolution
│   └── Incremental sync optimization
├── Correlation Mapper (correlation-mapper.js)
│   ├── Task ↔ Issue mapping
│   ├── Hierarchy tracking
│   └── Orphan cleanup
├── Webhook Handler (webhook-handler.js)
│   ├── Event processing
│   ├── Signature validation
│   └── Deduplication
├── Status Sync (status-sync.js)
│   ├── Status mapping & validation
│   ├── Transition rules
│   └── Audit trail
├── Progress Tracker (progress-tracker.js)
│   ├── Completion calculation
│   ├── Milestone tracking
│   └── Progress reports
├── Project Manager (project-manager.js)
│   ├── Auto-assignment rules
│   ├── Project templates
│   └── Progress tracking
└── Event Logger (event-logger.js)
    ├── API operation logging
    ├── Performance tracking
    └── Report generation
```

## 🚀 Quick Start

### 1. Installation

```bash
npm install @linear/sdk graphql graphql-request
```

### 2. Environment Configuration

```bash
# Required
LINEAR_API_KEY=your_linear_api_key
LINEAR_TEAM_ID=your_team_id

# Optional
LINEAR_PROJECT_ID=your_default_project_id
LINEAR_WEBHOOK_SECRET=your_webhook_secret
LINEAR_WEBHOOK_URL=https://your-domain.com/webhooks/linear
```

### 3. Basic Usage

```javascript
import LinearIntegration from './src/integrations/linear/index.js';

// Initialize integration
const linearIntegration = new LinearIntegration({
    teamId: process.env.LINEAR_TEAM_ID,
    apiKey: process.env.LINEAR_API_KEY,
    enableBidirectionalSync: true,
    enableProgressTracking: true,
    enableProjectManagement: true
});

// Initialize with database connection
await linearIntegration.initialize(database);

// Create main issue from requirement
const result = await linearIntegration.createMainIssue({
    id: 'req_123',
    title: 'Implement user authentication',
    description: 'Add OAuth2 authentication system',
    tasks: [
        {
            id: 'task_1',
            title: 'Setup OAuth2 provider',
            type: 'feature'
        },
        {
            id: 'task_2', 
            title: 'Implement login flow',
            type: 'feature'
        }
    ]
});

console.log('Created main issue:', result.mainIssue.issue.url);
console.log('Created sub-issues:', result.subIssues.length);
```

## 📋 Components

### API Client (`api-client.js`)

Handles all Linear API interactions with advanced features:

- **Rate Limiting**: Automatic request throttling
- **Retry Logic**: Exponential backoff for failed requests
- **Caching**: Intelligent caching of teams, users, states, and labels
- **Error Handling**: Comprehensive error enhancement and logging

```javascript
import LinearAPIClient from './api-client.js';

const apiClient = new LinearAPIClient({
    apiKey: 'your_api_key',
    retryAttempts: 3,
    rateLimitBuffer: 100
});

// Create issue
const issue = await apiClient.createIssue({
    teamId: 'team_123',
    title: 'New feature request',
    description: 'Detailed description',
    priority: 2
});
```

### Issue Manager (`issue-manager.js`)

Manages issue creation, updates, and metadata:

- **Template System**: Configurable issue templates
- **Auto-labeling**: Automatic label creation and assignment
- **Comment Management**: Formatted comments with metadata
- **Project Assignment**: Automatic project assignment

```javascript
import LinearIssueManager from './issue-manager.js';

const issueManager = new LinearIssueManager({
    teamId: 'team_123',
    autoAssign: true,
    createSubIssues: true
});

// Create main issue
const mainIssue = await issueManager.createMainIssue({
    title: 'Epic: User Management',
    description: 'Complete user management system',
    priority: 'high'
});

// Create sub-issues
const subIssues = await issueManager.createSubIssues(
    mainIssue.issue.id,
    tasks
);
```

### Sync Service (`sync-service.js`)

Handles bidirectional synchronization:

- **Real-time Sync**: Webhook-triggered synchronization
- **Incremental Sync**: Efficient delta synchronization
- **Conflict Resolution**: Configurable conflict resolution strategies
- **Batch Processing**: Optimized batch operations

```javascript
import LinearSyncService from './sync-service.js';

const syncService = new LinearSyncService({
    conflictResolution: 'linear_wins',
    enableIncrementalSync: true,
    batchSize: 10
});

// Perform full sync
const results = await syncService.performFullSync();
console.log('Sync results:', results);
```

### Correlation Mapper (`correlation-mapper.js`)

Manages task-issue correlations:

- **Bidirectional Mapping**: Task ↔ Issue relationships
- **Hierarchy Tracking**: Parent-child relationships
- **Orphan Management**: Automatic cleanup of orphaned correlations
- **Reference Integrity**: Maintains data consistency

```javascript
import LinearCorrelationMapper from './correlation-mapper.js';

const correlationMapper = new LinearCorrelationMapper({
    enableOrphanCleanup: true,
    orphanRetentionDays: 7
});

// Create correlation
const correlation = await correlationMapper.createCorrelation({
    taskId: 'task_123',
    linearIssueId: 'issue_456',
    correlationType: 'task_to_issue'
});
```

### Webhook Handler (`webhook-handler.js`)

Processes Linear webhook events:

- **Signature Validation**: Secure webhook verification
- **Event Deduplication**: Prevents duplicate processing
- **Queue Management**: Reliable event processing
- **Error Recovery**: Retry logic for failed events

```javascript
import LinearWebhookHandler from './webhook-handler.js';

const webhookHandler = new LinearWebhookHandler({
    webhookSecret: 'your_secret',
    enableDeduplication: true,
    maxRetries: 3
});

// Handle webhook in Express.js
app.post('/webhooks/linear', async (req, res) => {
    await webhookHandler.handleWebhook(req, res);
});
```

### Status Sync (`status-sync.js`)

Synchronizes status changes:

- **Status Mapping**: Configurable status mappings
- **Transition Validation**: Enforces valid status transitions
- **Conflict Detection**: Identifies and resolves conflicts
- **Audit Trail**: Complete change history

```javascript
import LinearStatusSync from './status-sync.js';

const statusSync = new LinearStatusSync({
    enableStatusValidation: true,
    conflictResolution: 'linear_wins'
});

// Sync task status to Linear
await statusSync.syncTaskStatusToLinear(
    'task_123',
    'in_progress',
    'pending'
);
```

### Progress Tracker (`progress-tracker.js`)

Tracks and reports progress:

- **Weighted Progress**: Multiple calculation strategies
- **Milestone Tracking**: Project milestone management
- **Real-time Updates**: Automatic progress updates
- **Report Generation**: Comprehensive progress reports

```javascript
import LinearProgressTracker from './progress-tracker.js';

const progressTracker = new LinearProgressTracker({
    weightingStrategy: 'priority',
    enableRealTimeUpdates: true
});

// Calculate task progress
const progress = await progressTracker.calculateTaskProgress('task_123');
console.log('Progress:', progress.percentage + '%');
```

### Project Manager (`project-manager.js`)

Manages project assignments:

- **Auto-assignment Rules**: Configurable assignment logic
- **Project Templates**: Template-based project creation
- **Progress Tracking**: Project-level progress monitoring
- **Milestone Management**: Project milestone tracking

```javascript
import LinearProjectManager from './project-manager.js';

const projectManager = new LinearProjectManager({
    enableAutoAssignment: true,
    enableMilestoneManagement: true
});

// Auto-assign issue to project
await projectManager.autoAssignIssueToProject(issue);
```

### Event Logger (`event-logger.js`)

Comprehensive logging and monitoring:

- **API Logging**: All API operations
- **Performance Tracking**: Operation timing and metrics
- **Audit Trail**: Complete change history
- **Report Generation**: Detailed analytics reports

```javascript
import LinearEventLogger from './event-logger.js';

const eventLogger = new LinearEventLogger({
    enablePerformanceLogging: true,
    retentionDays: 30
});

// Log API operation
await eventLogger.logApiOperation({
    method: 'POST',
    endpoint: '/issues',
    duration: 250,
    statusCode: 200
});
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes | Linear API authentication key |
| `LINEAR_TEAM_ID` | Yes | Default team ID for issue creation |
| `LINEAR_PROJECT_ID` | No | Default project ID for issues |
| `LINEAR_WEBHOOK_SECRET` | No | Webhook signature verification secret |
| `LINEAR_WEBHOOK_URL` | No | Webhook endpoint URL |

### Configuration Options

```javascript
const config = {
    // API Configuration
    apiKey: 'your_api_key',
    teamId: 'team_123',
    projectId: 'project_456',
    
    // Sync Configuration
    enableBidirectionalSync: true,
    enableRealTimeSync: true,
    conflictResolution: 'linear_wins', // 'linear_wins', 'task_master_wins', 'manual'
    
    // Feature Toggles
    enableProgressTracking: true,
    enableProjectManagement: true,
    enableEventLogging: true,
    autoCreateSubIssues: true,
    autoAssignProjects: true,
    
    // Performance Settings
    syncInterval: 30000, // 30 seconds
    batchSize: 10,
    retryAttempts: 3,
    rateLimitBuffer: 100,
    
    // Logging Settings
    logLevel: 'info',
    retentionDays: 30,
    enablePerformanceLogging: true
};
```

## 🔄 Sync Strategies

### Conflict Resolution

The integration supports three conflict resolution strategies:

1. **Linear Wins** (`linear_wins`): Linear data takes precedence
2. **Task Master Wins** (`task_master_wins`): Task Master data takes precedence  
3. **Manual Resolution** (`manual`): Conflicts queued for manual review

### Status Mapping

Default status mappings between Task Master and Linear:

| Task Master | Linear |
|-------------|--------|
| `pending` | `Todo` |
| `in_progress` | `In Progress` |
| `validation` | `In Review` |
| `completed` | `Done` |
| `failed` | `Todo` |
| `cancelled` | `Cancelled` |

## 📊 Progress Tracking

### Weighting Strategies

1. **Equal Weight**: All tasks weighted equally
2. **Priority Weight**: Tasks weighted by priority level
3. **Complexity Weight**: Tasks weighted by estimated complexity

### Progress Calculation

```javascript
// Equal weight example
const progress = {
    percentage: 75,
    completed_tasks: 3,
    total_tasks: 4,
    in_progress_tasks: 1,
    failed_tasks: 0
};

// Priority weighted example
const priorityProgress = {
    percentage: 80,
    completed_tasks: 2,
    total_tasks: 3,
    weighting_strategy: 'priority',
    total_weight: 9
};
```

## 🎣 Webhook Events

### Supported Events

- `Issue` - Issue creation, updates, deletion
- `Comment` - Comment creation and updates
- `IssueLabel` - Label changes
- `Project` - Project updates
- `WorkflowState` - Status changes

### Event Processing

```javascript
// Webhook event handler setup
webhookHandler.on('sync:issue_updated', async (data) => {
    console.log('Issue updated:', data.linear_issue_id);
    // Process the update
});

webhookHandler.on('sync:potential_conflict', async (conflict) => {
    console.log('Conflict detected:', conflict.type);
    // Handle the conflict
});
```

## 📈 Monitoring & Analytics

### Health Monitoring

```javascript
// Get integration health
const health = await linearIntegration.getHealthStatus();
console.log('Status:', health.status);
console.log('Components:', health.components);
```

### Performance Metrics

```javascript
// Get performance statistics
const stats = await linearIntegration.getStatistics();
console.log('API calls:', stats.api_usage.total_requests);
console.log('Sync operations:', stats.sync_operations.total);
console.log('Average duration:', stats.performance.avg_duration);
```

### Report Generation

```javascript
// Generate weekly report
const report = await linearIntegration.generateReport('week');
console.log('Report:', report);
```

## 🧪 Testing

### Unit Tests

```bash
npm test src/integrations/linear/
```

### Integration Tests

```bash
# Set up test environment
export LINEAR_API_KEY=test_key
export LINEAR_TEAM_ID=test_team

# Run integration tests
npm run test:integration
```

### Webhook Testing

```bash
# Test webhook with mock Linear events
npm run test:webhooks
```

## 🚨 Error Handling

### Common Errors

1. **API Rate Limits**: Automatic retry with exponential backoff
2. **Network Timeouts**: Configurable timeout and retry settings
3. **Authentication Errors**: Clear error messages and validation
4. **Sync Conflicts**: Configurable resolution strategies

### Error Recovery

```javascript
try {
    await linearIntegration.createMainIssue(requirement);
} catch (error) {
    if (error.code === 'RATE_LIMITED') {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 5000));
        return await linearIntegration.createMainIssue(requirement);
    }
    throw error;
}
```

## 🔒 Security

### API Key Management

- Store API keys in environment variables
- Use different keys for different environments
- Rotate keys regularly

### Webhook Security

- Verify webhook signatures
- Use HTTPS endpoints
- Implement rate limiting

### Data Privacy

- Log only necessary data
- Implement data retention policies
- Secure database connections

## 🚀 Deployment

### Production Checklist

- [ ] Configure environment variables
- [ ] Set up webhook endpoints
- [ ] Configure database connections
- [ ] Set up monitoring and alerting
- [ ] Test sync operations
- [ ] Verify webhook processing
- [ ] Check performance metrics

### Scaling Considerations

- Use connection pooling for database
- Implement horizontal scaling for webhook processing
- Monitor API rate limits
- Optimize sync batch sizes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📚 API Reference

### LinearIntegration

Main integration class that orchestrates all components.

#### Methods

- `initialize(database)` - Initialize the integration
- `createMainIssue(requirement)` - Create main issue from requirement
- `createSubIssues(parentIssueId, tasks)` - Create sub-issues
- `syncTaskStatusToLinear(taskId, status)` - Sync task status
- `syncLinearStatusToTask(issueId, status)` - Sync Linear status
- `updateTaskProgress(taskId)` - Update task progress
- `handleWebhookEvent(request, response)` - Handle webhook
- `getHealthStatus()` - Get health status
- `getStatistics()` - Get statistics
- `generateReport(timeframe)` - Generate report
- `cleanup()` - Cleanup resources

### Database Schema

The integration creates the following tables:

- `linear_correlations` - Task-issue correlations
- `task_linear_references` - Task to Linear references
- `linear_task_references` - Linear to Task references
- `correlation_hierarchy` - Hierarchy relationships
- `linear_hierarchy` - Linear issue hierarchy
- `linear_webhook_events` - Webhook event log
- `status_sync_audit` - Status change audit trail
- `status_sync_conflicts` - Sync conflicts
- `progress_snapshots` - Progress history
- `milestone_progress` - Milestone tracking
- `progress_reports` - Generated reports
- `project_assignments` - Project assignments
- `project_metadata` - Project metadata
- `project_progress` - Project progress
- `project_milestones` - Project milestones
- `project_assignment_rules` - Assignment rules
- `linear_event_logs` - Event logs

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For support and questions:

1. Check the documentation
2. Review error logs
3. Check health status
4. Generate diagnostic report
5. Contact support team

---

*This Linear integration provides comprehensive connectivity between Task Master and Linear, enabling seamless project management and task tracking across both platforms.*

