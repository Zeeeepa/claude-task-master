# Linear Integration for Claude Task Master

A comprehensive Linear API integration that provides automated ticket management, real-time synchronization, and seamless workflow integration for claude-task-master.

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Required environment variables
export LINEAR_API_KEY="your_linear_api_key"
export LINEAR_TEAM_ID="your_team_id"

# Optional environment variables
export LINEAR_PROJECT_ID="your_project_id"
export GITHUB_WEBHOOK_SECRET="your_github_secret"
export LINEAR_WEBHOOK_SECRET="your_linear_secret"
export WEBHOOK_PORT="3000"
```

### 2. Test Connection

```bash
# Test your Linear API connection
npx linear-test test-connection

# Check environment configuration
npx linear-test check-env
```

### 3. Initialize Integration

```javascript
import { LinearIntegration } from './integrations/linear/index.js';

const linear = new LinearIntegration();
await linear.initialize();
```

## 📋 Features

### ✅ Core Capabilities
- **Automatic Issue Creation** - Creates Linear issues from Task Master tasks
- **Real-time Synchronization** - Keeps Linear issues in sync with task status
- **PR Integration** - Links GitHub PRs to Linear issues and tracks progress
- **Bidirectional Sync** - Updates tasks based on Linear issue changes
- **Webhook Support** - Real-time updates via GitHub and Linear webhooks
- **Error Reporting** - Automatic error reporting and resolution tracking
- **Rate Limiting** - Respects Linear API rate limits with intelligent queuing

### 🔄 Workflow Integration
- **Task Creation** → Auto-create Linear tickets
- **PR Creation** → Update Linear issue status to "In Progress"
- **CI/CD Events** → Update Linear issues based on validation results
- **PR Merge** → Mark Linear issues as "Done"
- **Error Events** → Add error comments and update issue status

## 🛠 Installation

The Linear integration is included with claude-task-master. No additional installation required.

### Get Linear API Key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create new API key"
3. Give it a descriptive name (e.g., "claude-task-master")
4. Copy the generated API key

### Get Team ID

1. Go to your Linear team
2. Copy the team ID from the URL: `https://linear.app/your-team/team/TEAM_ID`
3. Or use: `npx linear-test test-connection` to discover available teams

## 🔧 Configuration

### Basic Configuration

```javascript
const linearIntegration = new LinearIntegration({
  apiKey: process.env.LINEAR_API_KEY,
  teamId: process.env.LINEAR_TEAM_ID,
  enableAutoSync: true,
  syncInterval: 300000 // 5 minutes
});
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
  
  // Custom Status Mapping
  statusMapping: {
    status: {
      'pending': 'Backlog',
      'in-progress': 'In Progress',
      'done': 'Done'
    }
  }
});
```

## 🎯 Usage Examples

### MCP Tools

```javascript
// Initialize Linear integration
await mcp.call('linear_initialize', {
  projectRoot: '/path/to/project'
});

// Sync a specific task
await mcp.call('linear_sync_task', {
  taskId: 123,
  prUrl: 'https://github.com/user/repo/pull/456',
  projectRoot: '/path/to/project'
});

// Handle PR creation event
await mcp.call('linear_on_pr_created', {
  taskId: 123,
  prUrl: 'https://github.com/user/repo/pull/456',
  projectRoot: '/path/to/project'
});

// Get sync statistics
const stats = await mcp.call('linear_get_sync_stats', {
  projectRoot: '/path/to/project'
});
```

### Direct API Usage

```javascript
import { LinearClient } from './utils/linear-client.js';

const client = new LinearClient(apiKey);

// Create an issue
const issue = await client.createIssue({
  title: 'Implement user authentication',
  description: 'Add OAuth support for user login',
  teamId: 'team_123',
  priority: 2
});

// Update issue status
await client.updateIssue(issue.id, {
  stateId: 'state_in_progress'
});

// Add a comment
await client.addComment(issue.id, 'Started working on this task');
```

## 🔗 Webhook Setup

### GitHub Webhooks

Configure GitHub webhooks to enable real-time PR tracking:

1. Repository Settings → Webhooks → Add webhook
2. **Payload URL**: `https://your-domain.com/webhooks/github`
3. **Content type**: `application/json`
4. **Secret**: Your `GITHUB_WEBHOOK_SECRET`
5. **Events**: Pull requests, Pushes, Workflow runs, Check runs

### Linear Webhooks

Configure Linear webhooks for bidirectional sync:

1. Linear Settings → API → Webhooks → Create webhook
2. **URL**: `https://your-domain.com/webhooks/linear`
3. **Secret**: Your `LINEAR_WEBHOOK_SECRET`
4. **Events**: Issues, Comments

## 📊 Status Mapping

### Default Mappings

| Task Status | Linear State |
|-------------|--------------|
| `pending` | `Backlog` |
| `in-progress` | `In Progress` |
| `done` | `Done` |
| `deferred` | `Backlog` |
| `blocked` | `Blocked` |

### Workflow States

| Workflow Stage | Linear State |
|----------------|--------------|
| `task_created` | `Backlog` |
| `pr_created` | `In Progress` |
| `validation_running` | `In Review` |
| `validation_failed` | `Needs Fix` |
| `validation_passed` | `Ready for Merge` |
| `pr_merged` | `Done` |

## 🧪 Testing

### CLI Testing Tools

```bash
# Test Linear connection
npx linear-test test-connection

# Create a test issue
npx linear-test create-test-issue --title "Test Issue"

# Test task synchronization
npx linear-test sync-test --task-id 1

# Test status mapping
npx linear-test test-mapping

# Check environment setup
npx linear-test check-env
```

### Unit Tests

```bash
# Run Linear integration tests
npm test -- --grep "Linear"

# Run all tests
npm test
```

## 🔍 Troubleshooting

### Common Issues

#### Authentication Error
```
Error: HTTP 401: Unauthorized
```
**Solution**: Check your Linear API key is correct and has proper permissions.

#### Team Not Found
```
Error: Team not found
```
**Solution**: Verify your `LINEAR_TEAM_ID` is correct using `npx linear-test test-connection`.

#### Rate Limiting
```
Error: Rate limit exceeded
```
**Solution**: The integration automatically handles rate limiting. Adjust `rateLimitThreshold` if needed.

### Debug Commands

```bash
# Test connection with verbose output
npx linear-test test-connection --api-key YOUR_KEY --team-id YOUR_TEAM

# Check sync statistics
npx task-master-mcp linear_get_sync_stats --projectRoot .

# Manual sync all tasks
npx task-master-mcp linear_sync_all_tasks --projectRoot .
```

## 📁 File Structure

```
integrations/linear/
├── index.js              # Main integration module
├── status-mapping.js     # Status and priority mapping
├── webhook-handlers.js   # GitHub and Linear webhook handlers
├── config.example.js     # Example configuration
└── README.md            # This file

utils/
└── linear-client.js      # Linear API client

sync/
└── linear-sync.js        # Synchronization engine

bin/
└── linear-test.js        # CLI testing tool

docs/
└── linear-integration.md # Comprehensive documentation
```

## 🔧 API Reference

### LinearIntegration

Main integration class that orchestrates all Linear functionality.

```javascript
const integration = new LinearIntegration(config);
await integration.initialize();

// Event handlers
await integration.onTaskCreated(task);
await integration.onPRCreated(task, prUrl);
await integration.onPRMerged(task, prUrl);
await integration.onError(task, error);

// Utilities
const issueUrl = integration.getLinearIssueUrl(taskId);
const stats = integration.getSyncStats();
```

### LinearClient

Low-level Linear API client with rate limiting and error handling.

```javascript
const client = new LinearClient(apiKey, options);

// Core operations
const issue = await client.createIssue(data);
const updated = await client.updateIssue(id, updates);
const comment = await client.addComment(id, text);
const issue = await client.getIssue(id);

// Utilities
const rateLimitStatus = client.getRateLimitStatus();
```

### StatusMapper

Handles mapping between Task Master and Linear statuses.

```javascript
const mapper = new StatusMapper(customMapping);

// Status mapping
const linearState = mapper.mapToLinearState('in-progress');
const taskStatus = mapper.mapFromLinearState('In Progress');

// Priority mapping
const linearPriority = mapper.mapToLinearPriority('high');

// Label generation
const labels = mapper.getLabelsForTask(task);
```

## 🚀 Performance

### Rate Limiting
- Automatic request queuing
- Respects Linear API rate limits
- Configurable threshold (default: 80% of quota)
- Intelligent retry logic

### Sync Efficiency
- Incremental synchronization
- Change detection to avoid unnecessary updates
- Configurable sync intervals
- Webhook-based real-time updates

### Memory Usage
- Efficient metadata storage
- Minimal memory footprint
- Automatic cleanup of old sync data

## 🔒 Security

### API Key Management
- Environment variable storage
- No hardcoded credentials
- Support for key rotation
- Minimal required permissions

### Webhook Security
- Signature verification
- HTTPS enforcement
- Rate limiting protection
- Input validation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/linear-enhancement`
3. Make your changes
4. Add tests for new functionality
5. Update documentation
6. Submit a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Zeeeepa/claude-task-master.git
cd claude-task-master

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Linear API credentials

# Test the integration
npx linear-test test-connection
```

## 📄 License

This Linear integration is part of claude-task-master and follows the same license terms.

## 🆘 Support

For issues and questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Review the [comprehensive documentation](../../docs/linear-integration.md)
3. Test your setup with `npx linear-test check-env`
4. Create an issue on GitHub with detailed error information

---

**Happy task management with Linear! 🎯**

