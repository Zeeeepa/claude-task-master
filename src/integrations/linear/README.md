# Linear Integration

A comprehensive Linear integration for the unified AI CI/CD development flow system, providing real-time issue management, status synchronization, and workflow automation.

## Features

### 🎯 Core Functionality
- **Issue Management**: Create, update, and track Linear issues automatically
- **Status Synchronization**: Real-time bidirectional sync between Linear and system states
- **Workflow Integration**: Seamless integration with development workflows
- **Comment Management**: Automated commenting and progress updates
- **Label Management**: Intelligent labeling based on workflow status

### 🔧 Technical Capabilities
- **GraphQL API Integration**: Full Linear GraphQL API support with rate limiting
- **Real-time Updates**: WebSocket connections for live synchronization
- **Webhook Processing**: Handle Linear webhook events for instant updates
- **Error Handling**: Robust error handling with retry logic
- **Batch Processing**: Efficient batch operations for high-volume scenarios

## Installation

```bash
npm install graphql-request
```

## Configuration

### Environment Variables

```bash
# Required
LINEAR_API_KEY=your_linear_api_key

# Optional
LINEAR_WEBHOOK_SECRET=your_webhook_secret
LINEAR_DEFAULT_TEAM_ID=your_default_team_id
LINEAR_DEFAULT_PROJECT_ID=your_default_project_id
LINEAR_ENABLE_REAL_TIME_SYNC=true
LINEAR_SYNC_INTERVAL=30000
LINEAR_ENABLE_AUTO_COMMENTS=true
```

### Configuration File

Create a `.linear-config.json` file:

```json
{
  "defaultTeamId": "your-team-id",
  "defaultProjectId": "your-project-id",
  "enableRealTimeSync": true,
  "syncInterval": 30000,
  "enableAutoComments": true,
  "stateMapping": {
    "backlog": "pending",
    "unstarted": "pending", 
    "started": "in_progress",
    "completed": "completed",
    "canceled": "cancelled"
  }
}
```

## Usage

### Basic Setup

```javascript
const { LinearIntegration } = require('./src/integrations/linear');

const linear = new LinearIntegration({
  apiKey: process.env.LINEAR_API_KEY,
  defaultTeamId: 'your-team-id',
  enableRealTimeSync: true,
  enableAutoComments: true
});

// Initialize the integration
await linear.initialize();
```

### Creating Issues

```javascript
// Create a basic issue
const issue = await linear.createIssue({
  title: 'Fix authentication bug',
  description: 'Users are unable to log in with OAuth',
  priority: 'high',
  teamId: 'team-123'
});

// Create issue from workflow event
const workflowIssue = await linear.createIssueFromWorkflow({
  type: 'deployment_failed',
  title: 'Production deployment failed',
  description: 'Deployment to production environment failed',
  priority: 'critical',
  metadata: {
    environment: 'production',
    buildId: 'build-456',
    error: 'Database connection timeout'
  }
});
```

### Managing Issues

```javascript
// Update issue status
await linear.updateIssue('issue-id', {
  stateId: 'completed-state-id',
  assigneeId: 'user-id'
});

// Search issues
const issues = await linear.searchIssues({
  teamId: 'team-123',
  assigneeId: 'user-id',
  title: 'authentication'
});

// Get issue details
const issue = await linear.getIssue('issue-id');
```

### Automated Comments

```javascript
// Add workflow progress comment
await linear.addWorkflowComment('issue-id', 'workflow_started', {
  workflowName: 'CI/CD Pipeline',
  description: 'Starting automated deployment',
  metadata: {
    branch: 'main',
    commit: 'abc123'
  }
});

// Add progress update
await linear.addProgressUpdate('issue-id', {
  percentage: 75,
  currentStep: 'Running tests',
  totalSteps: 4,
  description: 'Executing unit and integration tests'
});

// Add build status
await linear.commentManager.addBuildStatus('issue-id', {
  name: 'Production Build',
  status: 'completed',
  branch: 'main',
  duration: '5m 32s',
  url: 'https://ci.example.com/builds/123'
});
```

### Webhook Handling

```javascript
// Express.js webhook endpoint
app.post('/webhooks/linear', async (req, res) => {
  try {
    const result = await linear.handleWebhook(req);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Listen for webhook events
linear.on('webhook:issue:created', (issue) => {
  console.log('New issue created:', issue.title);
});

linear.on('webhook:issue:updated', ({ issue, updatedFrom }) => {
  console.log('Issue updated:', issue.title);
  console.log('Changes:', updatedFrom);
});
```

### Status Synchronization

```javascript
// Listen for sync events
linear.on('sync:to_system', (syncData) => {
  // Update your system with Linear changes
  console.log('Syncing to system:', syncData);
});

linear.on('sync:issue_created', ({ systemId, linearIssue }) => {
  // Map system task to Linear issue
  console.log(`System task ${systemId} mapped to Linear issue ${linearIssue.id}`);
});

// Force sync a specific issue
await linear.forceSyncIssue('issue-id');

// Queue sync operation
linear.queueSync('issue-id', {
  operation: 'update_state',
  state: 'completed'
});
```

## API Reference

### LinearIntegration

Main integration class that orchestrates all Linear functionality.

#### Methods

- `initialize()` - Initialize the integration
- `createIssue(issueData)` - Create a new Linear issue
- `updateIssue(issueId, updateData)` - Update an existing issue
- `getIssue(issueId)` - Get issue by ID
- `searchIssues(filters)` - Search issues with filters
- `addComment(issueId, body)` - Add comment to issue
- `addWorkflowComment(issueId, eventType, data)` - Add automated workflow comment
- `handleWebhook(request)` - Process webhook request
- `getStatus()` - Get integration status
- `shutdown()` - Gracefully shutdown integration

### LinearClient

Low-level GraphQL client for Linear API.

#### Methods

- `query(query, variables)` - Execute GraphQL query
- `getCurrentUser()` - Get current user info
- `getTeams()` - Get accessible teams
- `getIssueStates(teamId)` - Get issue states for team
- `testConnection()` - Test API connection

### IssueManager

High-level issue management operations.

#### Methods

- `createIssue(issueData)` - Create issue
- `updateIssue(issueId, updateData)` - Update issue
- `getIssue(issueId)` - Get issue
- `searchIssues(filters)` - Search issues
- `addComment(issueId, body)` - Add comment
- `assignIssue(issueId, assigneeId)` - Assign issue
- `updateIssueState(issueId, stateId)` - Update state
- `addLabels(issueId, labelIds)` - Add labels
- `setPriority(issueId, priority)` - Set priority

### StatusSync

Bidirectional status synchronization between Linear and system.

#### Methods

- `startPeriodicSync()` - Start automatic sync
- `stopPeriodicSync()` - Stop automatic sync
- `forceSyncIssue(issueId)` - Force sync specific issue
- `queueSync(issueId, syncData)` - Queue sync operation
- `getSyncStatus()` - Get sync status
- `updateSyncConfig(config)` - Update sync configuration

### WebhookHandler

Process Linear webhook events.

#### Methods

- `handleWebhook(request)` - Handle webhook request
- `addEventProcessor(eventType, processor)` - Add custom event processor
- `getStatus()` - Get handler status
- `clearQueue()` - Clear processing queue

### CommentManager

Automated commenting and progress updates.

#### Methods

- `addWorkflowComment(issueId, eventType, data)` - Add workflow comment
- `addProgressUpdate(issueId, progress)` - Add progress update
- `addStatusUpdate(issueId, statusChange)` - Add status update
- `addErrorReport(issueId, error)` - Add error report
- `addBuildStatus(issueId, buildInfo)` - Add build status
- `addDeploymentStatus(issueId, deploymentInfo)` - Add deployment status
- `addTemplate(eventType, template)` - Add custom template
- `getTemplates()` - Get available templates

## Events

The Linear integration emits various events for monitoring and integration:

### Connection Events
- `connection:established` - Connection to Linear API established
- `integration:initialized` - Integration fully initialized
- `integration:shutdown` - Integration shutdown complete

### Issue Events
- `issue:created` - Issue created in Linear
- `issue:updated` - Issue updated in Linear
- `comment:created` - Comment added to issue

### Sync Events
- `sync:completed` - Sync cycle completed
- `sync:error` - Sync error occurred
- `sync:to_system` - Data synced from Linear to system
- `sync:issue_created` - New issue created and mapped

### Webhook Events
- `webhook:processed` - Webhook event processed
- `webhook:error` - Webhook processing error
- `webhook:issue:created` - Issue created via webhook
- `webhook:issue:updated` - Issue updated via webhook

### Comment Events
- `comment:workflow_added` - Workflow comment added
- `comment:error` - Comment error occurred

## Error Handling

The integration includes comprehensive error handling:

```javascript
// Listen for errors
linear.on('sync:error', ({ type, error }) => {
  console.error(`Sync error (${type}):`, error.message);
});

linear.on('webhook:error', ({ error, request }) => {
  console.error('Webhook error:', error.message);
});

linear.on('comment:error', ({ issueId, eventType, error }) => {
  console.error(`Comment error for issue ${issueId}:`, error.message);
});

// Handle initialization errors
try {
  await linear.initialize();
} catch (error) {
  console.error('Failed to initialize Linear integration:', error.message);
}
```

## Testing

Run the test suite:

```bash
npm test src/integrations/linear/tests/
```

The test suite includes:
- Unit tests for all components
- Integration tests for end-to-end workflows
- Performance tests for high-volume scenarios
- Mock implementations for testing without API calls

## Performance Considerations

### Rate Limiting
- Automatic rate limiting with configurable intervals
- Request queuing to prevent API overload
- Retry logic for failed requests

### Batch Processing
- Batch comment processing for high-volume scenarios
- Configurable batch sizes and delays
- Concurrent webhook processing with limits

### Memory Management
- Event listener cleanup on shutdown
- Queue clearing mechanisms
- Automatic resource cleanup

## Security

### API Key Management
- Environment variable configuration
- No API keys in configuration files
- Secure credential handling

### Webhook Security
- Signature verification for webhook authenticity
- Configurable signature verification
- Request validation and sanitization

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   ```
   Error: Failed to connect to Linear: Invalid API key
   ```
   - Verify `LINEAR_API_KEY` environment variable
   - Check API key permissions in Linear

2. **Webhook Signature Verification Failed**
   ```
   Error: Invalid webhook signature
   ```
   - Verify `LINEAR_WEBHOOK_SECRET` matches Linear webhook configuration
   - Ensure webhook secret is properly configured

3. **Sync Issues**
   ```
   Error: Sync operation failed
   ```
   - Check network connectivity
   - Verify team and project IDs
   - Review sync configuration

### Debug Mode

Enable debug logging:

```javascript
const linear = new LinearIntegration({
  apiKey: process.env.LINEAR_API_KEY,
  enableLogging: true,
  logLevel: 'debug'
});

// Listen for debug events
linear.on('client:request:success', (data) => {
  console.log('API request successful:', data);
});

linear.on('client:request:error', (data) => {
  console.error('API request failed:', data);
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

