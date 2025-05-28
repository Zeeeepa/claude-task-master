# Linear API Integration Documentation

## Overview

The Linear API integration provides comprehensive automated ticket management for claude-task-master, enabling seamless synchronization between your task workflow and Linear issues. This integration supports real-time status updates, automatic issue creation, PR linking, and bidirectional synchronization.

## Features

### Core Capabilities

- **Automatic Issue Creation**: Creates Linear issues from Task Master tasks
- **Real-time Synchronization**: Keeps Linear issues in sync with task status
- **PR Integration**: Links GitHub PRs to Linear issues and tracks progress
- **Bidirectional Sync**: Updates tasks based on Linear issue changes
- **Webhook Support**: Real-time updates via GitHub and Linear webhooks
- **Error Reporting**: Automatic error reporting and resolution tracking
- **Rate Limiting**: Respects Linear API rate limits with intelligent queuing

### Workflow Integration

- **Task Creation** → Auto-create Linear tickets
- **PR Creation** → Update Linear issue status to "In Progress"
- **CI/CD Events** → Update Linear issues based on validation results
- **PR Merge** → Mark Linear issues as "Done"
- **Error Events** → Add error comments and update issue status

## Installation & Setup

### 1. Environment Variables

Create a `.env` file in your project root:

```bash
# Required
LINEAR_API_KEY=your_linear_api_key_here
LINEAR_TEAM_ID=your_team_id_here

# Optional
LINEAR_PROJECT_ID=your_project_id_here
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
LINEAR_WEBHOOK_SECRET=your_linear_webhook_secret
WEBHOOK_PORT=3000
```

### 2. Get Linear API Key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create new API key"
3. Give it a descriptive name (e.g., "claude-task-master")
4. Copy the generated API key

### 3. Get Team ID

1. Go to your Linear team
2. Copy the team ID from the URL: `https://linear.app/your-team/team/TEAM_ID`
3. Or use the Linear integration test tool to discover available teams

### 4. Install Dependencies

The integration uses the existing dependencies in claude-task-master. No additional packages are required.

## Configuration

### Basic Configuration

```javascript
import { LinearIntegration } from './integrations/linear/index.js';

const linearIntegration = new LinearIntegration({
  apiKey: process.env.LINEAR_API_KEY,
  teamId: process.env.LINEAR_TEAM_ID,
  enableAutoSync: true,
  syncInterval: 300000, // 5 minutes
  enableWebhooks: true
});

await linearIntegration.initialize();
```

### Advanced Configuration

```javascript
const linearIntegration = new LinearIntegration({
  // API Configuration
  apiKey: process.env.LINEAR_API_KEY,
  teamId: process.env.LINEAR_TEAM_ID,
  projectId: process.env.LINEAR_PROJECT_ID,
  
  // Sync Settings
  enableAutoSync: true,
  syncInterval: 300000,
  enableBidirectionalSync: true,
  enableAutoCreate: true,
  enableAutoUpdate: true,
  enableAutoClose: true,
  
  // Webhook Settings
  enableWebhooks: true,
  webhookPort: 3000,
  webhookPath: '/webhooks',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
  
  // Rate Limiting
  rateLimitThreshold: 0.8,
  retryAttempts: 3,
  
  // Custom Status Mapping
  statusMapping: {
    status: {
      'pending': 'Backlog',
      'in-progress': 'In Progress',
      'done': 'Done'
    },
    priority: {
      'low': 1,
      'medium': 2,
      'high': 3,
      'urgent': 4
    },
    labels: {
      'bug': 'bug',
      'feature': 'feature',
      'automated': 'automated'
    }
  }
});
```

## MCP Tools Usage

### Initialize Linear Integration

```javascript
// Initialize with default settings
await mcp.call('linear_initialize', {
  projectRoot: '/path/to/project'
});

// Initialize with custom configuration
await mcp.call('linear_initialize', {
  apiKey: 'your_api_key',
  teamId: 'your_team_id',
  enableAutoSync: true,
  syncInterval: 300000,
  projectRoot: '/path/to/project'
});
```

### Test Connection

```javascript
const result = await mcp.call('linear_test_connection', {
  projectRoot: '/path/to/project'
});

console.log(result.success); // true if connection successful
console.log(result.team); // Team information
```

### Sync Tasks

```javascript
// Sync a specific task
await mcp.call('linear_sync_task', {
  taskId: 123,
  prUrl: 'https://github.com/user/repo/pull/456', // optional
  statusChanged: true, // optional
  projectRoot: '/path/to/project'
});

// Sync all tasks
await mcp.call('linear_sync_all_tasks', {
  projectRoot: '/path/to/project'
});
```

### Handle Events

```javascript
// Handle task creation
await mcp.call('linear_on_task_created', {
  taskId: 123,
  projectRoot: '/path/to/project'
});

// Handle PR creation
await mcp.call('linear_on_pr_created', {
  taskId: 123,
  prUrl: 'https://github.com/user/repo/pull/456',
  projectRoot: '/path/to/project'
});

// Handle PR merge
await mcp.call('linear_on_pr_merged', {
  taskId: 123,
  prUrl: 'https://github.com/user/repo/pull/456',
  projectRoot: '/path/to/project'
});

// Handle errors
await mcp.call('linear_on_error', {
  taskId: 123,
  errorMessage: 'Build failed',
  context: JSON.stringify({ buildUrl: 'https://...' }),
  projectRoot: '/path/to/project'
});
```

### Get Information

```javascript
// Get sync statistics
const stats = await mcp.call('linear_get_sync_stats', {
  projectRoot: '/path/to/project'
});

// Get Linear issue URL for a task
const result = await mcp.call('linear_get_issue_url', {
  taskId: 123,
  projectRoot: '/path/to/project'
});
console.log(result.linearIssueUrl);
```

## Webhook Setup

### GitHub Webhooks

1. Go to your GitHub repository settings
2. Navigate to "Webhooks"
3. Click "Add webhook"
4. Configure:
   - **Payload URL**: `https://your-domain.com/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Your `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Pull requests", "Pushes", "Workflow runs", "Check runs"

### Linear Webhooks

1. Go to Linear Settings > API > Webhooks
2. Click "Create webhook"
3. Configure:
   - **URL**: `https://your-domain.com/webhooks/linear`
   - **Secret**: Your `LINEAR_WEBHOOK_SECRET`
   - **Events**: Select "Issues" and "Comments"

## Status Mapping

### Default Mappings

#### Task Status → Linear State
- `pending` → `Backlog`
- `in-progress` → `In Progress`
- `done` → `Done`
- `deferred` → `Backlog`
- `blocked` → `Blocked`

#### Workflow State → Linear State
- `task_created` → `Backlog`
- `pr_created` → `In Progress`
- `validation_running` → `In Review`
- `validation_failed` → `Needs Fix`
- `validation_passed` → `Ready for Merge`
- `pr_merged` → `Done`

#### Priority Mapping
- `low` → 1
- `medium` → 2
- `high` → 3
- `urgent` → 4

### Custom Mapping

You can customize status mappings by providing a `statusMapping` configuration:

```javascript
const customMapping = {
  status: {
    'pending': 'Todo',
    'in-progress': 'Doing',
    'done': 'Completed'
  },
  priority: {
    'low': 1,
    'medium': 2,
    'high': 4
  },
  labels: {
    'bug': 'bug',
    'feature': 'enhancement',
    'urgent': 'urgent'
  }
};
```

## Error Handling

### Common Issues

#### Authentication Errors
```
Error: HTTP 401: Unauthorized
```
**Solution**: Check your Linear API key is correct and has proper permissions.

#### Team Not Found
```
Error: Team not found
```
**Solution**: Verify your `LINEAR_TEAM_ID` is correct.

#### Rate Limiting
```
Error: Rate limit exceeded
```
**Solution**: The integration automatically handles rate limiting, but you can adjust `rateLimitThreshold` if needed.

#### Webhook Signature Verification Failed
```
Error: Invalid signature
```
**Solution**: Ensure your webhook secrets match between GitHub/Linear and your environment variables.

### Debugging

Enable debug logging:

```javascript
const linearIntegration = new LinearIntegration({
  // ... other config
  debug: true
});
```

Check sync statistics:

```javascript
const stats = await linearIntegration.getSyncStats();
console.log('Sync Stats:', stats);
```

## API Reference

### LinearClient

The core API client for interacting with Linear.

```javascript
import { LinearClient } from './utils/linear-client.js';

const client = new LinearClient(apiKey, options);

// Create issue
const issue = await client.createIssue(taskData);

// Update issue
const updated = await client.updateIssue(issueId, updates);

// Add comment
const comment = await client.addComment(issueId, commentText);

// Get issue
const issue = await client.getIssue(issueId);
```

### StatusMapper

Handles mapping between Task Master and Linear statuses.

```javascript
import { StatusMapper } from './integrations/linear/status-mapping.js';

const mapper = new StatusMapper(customMapping);

// Map status
const linearState = mapper.mapToLinearState('in-progress');
const taskStatus = mapper.mapFromLinearState('In Progress');

// Map priority
const linearPriority = mapper.mapToLinearPriority('high');
const taskPriority = mapper.mapFromLinearPriority(3);
```

### LinearSyncEngine

The main synchronization engine.

```javascript
import { LinearSyncEngine } from './sync/linear-sync.js';

const syncEngine = new LinearSyncEngine(config);
await syncEngine.initialize();

// Manual sync
await syncEngine.performSync();

// Event handlers
await syncEngine.onTaskCreated(task);
await syncEngine.onPRCreated(task, prUrl);
await syncEngine.onPRMerged(task, prUrl);
```

## Performance Considerations

### Rate Limiting

Linear API has rate limits. The integration:
- Queues requests to avoid hitting limits
- Respects rate limit headers
- Automatically retries failed requests
- Uses configurable thresholds (default: 80% of quota)

### Sync Frequency

Default sync interval is 5 minutes. Adjust based on your needs:
- **High-frequency projects**: 1-2 minutes
- **Standard projects**: 5-10 minutes
- **Low-activity projects**: 15-30 minutes

### Webhook vs Polling

Webhooks provide real-time updates and are more efficient than polling. Enable webhooks for:
- Immediate status updates
- Reduced API usage
- Better user experience

## Security

### API Key Security

- Store API keys in environment variables
- Use different API keys for different environments
- Regularly rotate API keys
- Limit API key permissions to minimum required

### Webhook Security

- Always use webhook secrets
- Verify signatures on all webhook requests
- Use HTTPS for webhook URLs
- Implement rate limiting on webhook endpoints

## Troubleshooting

### Common Commands

```bash
# Test Linear connection
task-master-mcp linear_test_connection --projectRoot=/path/to/project

# Check sync stats
task-master-mcp linear_get_sync_stats --projectRoot=/path/to/project

# Manual sync
task-master-mcp linear_sync_all_tasks --projectRoot=/path/to/project

# Get issue URL for task
task-master-mcp linear_get_issue_url --taskId=123 --projectRoot=/path/to/project
```

### Log Analysis

Check the webhook server logs for debugging:

```bash
# Start with debug logging
DEBUG=linear:* node your-app.js

# Check webhook health
curl https://your-domain.com/webhooks/health
```

### Sync Metadata

The integration stores sync metadata in `.linear-sync-metadata.json`:

```json
{
  "taskToIssue": {
    "task_123": "linear-issue-id-456"
  },
  "lastSyncTime": "2024-01-01T12:00:00.000Z",
  "syncStats": {
    "totalSyncs": 10,
    "successfulSyncs": 9,
    "failedSyncs": 1
  }
}
```

## Best Practices

### Task Naming

Use descriptive task titles that work well as Linear issue titles:
- ✅ "Implement user authentication with OAuth"
- ❌ "Auth stuff"

### Branch Naming

Include task IDs in branch names for automatic linking:
- `task-123-implement-oauth`
- `feature/task-123-user-auth`
- `123-oauth-implementation`

### PR Titles

Include task references in PR titles:
- "Task #123: Implement user authentication"
- "[Task 123] Add OAuth support"

### Status Management

Keep task statuses up to date for accurate Linear sync:
- Update status when starting work
- Use appropriate statuses for different workflow stages
- Mark tasks as done when PRs are merged

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review the error logs
3. Test the Linear connection
4. Check webhook configuration
5. Verify environment variables

## Contributing

To contribute to the Linear integration:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

## License

This Linear integration is part of claude-task-master and follows the same license terms.

