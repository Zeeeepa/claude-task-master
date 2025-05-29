# AI CI/CD System Integration

## Overview

The AI CI/CD System Integration provides comprehensive status synchronization, security, and automation capabilities for the Task Master system. This consolidated system combines Linear integration with robust security features to create a production-ready AI-powered development workflow.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Task Master       │◄──►│ AI CI/CD System     │◄──►│   Linear API        │
│   Core System       │    │                     │    │                     │
│                     │    │ ┌─────────────────┐ │    │                     │
│ • Task Management   │    │ │ Status Manager  │ │    │ • Issues            │
│ • Status Tracking   │    │ │ Conflict Resolver│ │    │ • Projects          │
│ • Dependencies      │    │ │ Progress Tracker│ │    │ • Teams             │
│ • Workflows         │    │ └─────────────────┘ │    │ • Workflows         │
└─────────────────────┘    │                     │    └─────────────────────┘
                           │ ┌─────────────────┐ │
                           │ │ Security Layer  │ │
                           │ │ • Authentication│ │
                           │ │ • Authorization │ │
                           │ │ • Audit Logging │ │
                           │ │ • Vulnerability │ │
                           │ │   Scanning      │ │
                           │ └─────────────────┘ │
                           └─────────────────────┘
```

## Components

### 1. Linear Integration

#### Status Manager (`src/ai_cicd_system/linear/status_manager.js`)

Manages bidirectional status synchronization between Task Master and Linear.

**Key Features:**
- Automatic status mapping between systems
- Conflict detection and resolution
- Event-driven updates
- Batch processing capabilities
- Integration with existing Task Master workflows

**Usage:**
```javascript
import { StatusManager } from './src/ai_cicd_system/linear/status_manager.js';

const statusManager = new StatusManager(config);

// Sync from Task Master to Linear
await statusManager.syncFromTaskMaster('1', 'in-progress');

// Handle CI/CD events
await statusManager.updateStatusFromEvent(issueId, 'deployment_success');
```

#### Linear Client (`src/ai_cicd_system/linear/linear_client.js`)

Provides a comprehensive interface to Linear's GraphQL API.

**Key Features:**
- Rate limiting and retry logic
- Comprehensive API coverage
- Task Master integration helpers
- Health monitoring
- Bulk operations

**Usage:**
```javascript
import { LinearClient } from './src/ai_cicd_system/linear/linear_client.js';

const client = new LinearClient(config);

// Get issue details
const issue = await client.getIssue(issueId);

// Create issue from Task Master task
const result = await client.createIssueFromTask(task);
```

#### Conflict Resolver (`src/ai_cicd_system/linear/conflict_resolver.js`)

Handles conflicts between manual updates and automated changes.

**Key Features:**
- Multiple resolution strategies
- Escalation mechanisms
- Time-based conflict detection
- Field-specific rules
- Audit trail

**Resolution Strategies:**
1. **Manual Override** - Manual changes take precedence
2. **Recent Change** - Most recent change wins
3. **Automation Skip** - Skip automation if conflict detected
4. **Merge Changes** - Attempt to merge compatible changes
5. **Escalate** - Escalate for manual resolution

### 2. Security Layer

#### Authentication & Authorization

**Configuration:** `config/security/auth_config.json`

**Features:**
- JWT-based authentication
- Multi-factor authentication (MFA)
- OAuth2 integration (Google, GitHub, Microsoft)
- API key management
- Session management
- Password policies

**RBAC Policies:** `config/security/rbac_policies.json`

**Roles:**
- `super_admin` - Full system access
- `admin` - System administration
- `developer` - Development and CI/CD access
- `operator` - Operations and deployment
- `auditor` - Read-only audit access
- `user` - Basic user access
- `service` - Service-to-service communication
- `readonly` - Read-only access

#### Security Scanning

**Script:** `scripts/security/security_scan.sh`

**Scan Types:**
- **Dependency Vulnerabilities** - npm audit and vulnerability scanning
- **Static Code Analysis** - ESLint security rules and pattern detection
- **Configuration Security** - Secrets detection and permission checks
- **Web Application Security** - Basic web security analysis

**Usage:**
```bash
# Run all scans
npm run security:scan

# Run specific scans
npm run security:scan:deps
npm run security:scan:static
npm run security:scan:config
npm run security:scan:web

# Auto-fix vulnerabilities
npm run security:scan:fix
```

## Configuration

### Linear Configuration (`config/linear_config.json`)

```json
{
  "linear": {
    "apiKey": "${LINEAR_API_KEY}",
    "teamId": "${LINEAR_TEAM_ID}"
  },
  "taskMasterIntegration": {
    "enabled": true,
    "syncDirection": "bidirectional",
    "autoSync": {
      "enabled": true,
      "onTaskUpdate": true,
      "onStatusChange": true
    }
  },
  "statusMappings": {
    "pending": "backlog",
    "in-progress": "in_progress",
    "done": "done",
    "deferred": "blocked",
    "cancelled": "cancelled"
  }
}
```

### Environment Variables

```bash
# Required
LINEAR_API_KEY=your_linear_api_key
LINEAR_TEAM_ID=your_team_id

# Optional
LINEAR_WEBHOOK_SECRET=your_webhook_secret
SLACK_WEBHOOK_URL=your_slack_webhook_url
SMTP_HOST=your_smtp_host
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password

# Security
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

## Integration Patterns

### 1. Task Master Status Sync

When a task status changes in Task Master, automatically sync to Linear:

```javascript
// In your task status update handler
import { StatusManager } from './src/ai_cicd_system/linear/status_manager.js';

const statusManager = new StatusManager(config);

// After updating task status
await statusManager.syncFromTaskMaster(taskId, newStatus, {
  source: 'task_master_ui',
  user: userId,
  timestamp: new Date().toISOString()
});
```

### 2. CI/CD Pipeline Integration

Update Linear issues based on CI/CD events:

```javascript
// In your CI/CD pipeline
import { StatusManager } from './src/ai_cicd_system/linear/status_manager.js';

const statusManager = new StatusManager(config);

// On PR creation
await statusManager.updateStatusFromEvent(issueId, 'pr_created', {
  prUrl: process.env.PR_URL,
  commitSha: process.env.COMMIT_SHA
});

// On deployment success
await statusManager.updateStatusFromEvent(issueId, 'deployment_success', {
  deploymentUrl: process.env.DEPLOYMENT_URL,
  environment: 'production'
});
```

### 3. Webhook Integration

Set up webhooks for real-time synchronization:

```javascript
import express from 'express';
import { StatusManager } from './src/ai_cicd_system/linear/status_manager.js';

const app = express();
const statusManager = new StatusManager(config);

app.post('/webhooks/linear', async (req, res) => {
  const { type, data } = req.body;
  
  if (type === 'Issue' && data.action === 'update') {
    // Handle Linear issue updates
    await handleLinearIssueUpdate(data);
  }
  
  res.status(200).send('OK');
});
```

## Security Best Practices

### 1. API Key Management

- Store API keys in environment variables
- Rotate keys regularly (configured in auth_config.json)
- Use different keys for different environments
- Monitor API key usage

### 2. Access Control

- Implement role-based access control (RBAC)
- Use principle of least privilege
- Enable multi-factor authentication for sensitive roles
- Regular access reviews

### 3. Audit Logging

- Enable comprehensive audit logging
- Monitor security events
- Set up alerting for suspicious activities
- Regular log analysis

### 4. Vulnerability Management

- Run security scans regularly
- Auto-fix low-risk vulnerabilities
- Monitor dependency vulnerabilities
- Keep dependencies up to date

## Monitoring and Observability

### Health Checks

```bash
# Check Linear integration health
npm run linear:health

# Check overall system health
node src/ai_cicd_system/linear/health_check.js
```

### Metrics and Statistics

```javascript
// Get status manager statistics
const stats = statusManager.getStatistics();
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Conflict rate: ${stats.conflictRate}%`);

// Get recent events
const events = statusManager.getRecentEvents(10);
```

### Logging

The system uses structured logging with correlation IDs:

```javascript
import logger from './mcp-server/src/logger.js';

logger.info('Status update completed', {
  issueId,
  fromState,
  toState,
  event,
  correlationId: req.headers['x-correlation-id']
});
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: Linear API error: 401 Unauthorized
```
**Solution:** Verify LINEAR_API_KEY environment variable is set correctly.

#### 2. Rate Limiting
```
Error: Rate limit exceeded
```
**Solution:** The system automatically handles rate limiting with retries. Check rate limiter configuration if issues persist.

#### 3. Sync Conflicts
```
Warning: Status update conflict detected
```
**Solution:** Review conflict resolution settings and escalation rules. Check for recent manual changes.

#### 4. Configuration Issues
```
Error: Missing required configuration
```
**Solution:** Run health check to identify missing configuration: `npm run linear:health`

### Debug Mode

Enable debug logging:

```bash
DEBUG=ai-cicd:* npm run linear:sync
```

### Health Check

Run comprehensive health check:

```bash
npm run linear:health
```

## Migration Guide

### From Manual Linear Management

1. **Export existing Linear data**
2. **Configure status mappings** in `config/linear_config.json`
3. **Set up environment variables**
4. **Test with a small subset of issues**
5. **Gradually roll out to all projects**

### Integration with Existing CI/CD

1. **Identify CI/CD events** to map to Linear states
2. **Configure event handlers** in your pipeline
3. **Test status updates** in staging environment
4. **Deploy to production** with monitoring

## API Reference

### StatusManager

#### `syncFromTaskMaster(taskId, newStatus, metadata)`
Sync Task Master status change to Linear.

#### `updateStatusFromEvent(issueId, event, metadata)`
Update Linear issue status based on CI/CD event.

#### `getStatistics()`
Get status manager statistics and metrics.

#### `healthCheck()`
Perform health check on the status manager.

### LinearClient

#### `getIssue(issueId)`
Get Linear issue details.

#### `createIssueFromTask(task, options)`
Create Linear issue from Task Master task.

#### `updateIssueStatus(issueId, stateId)`
Update Linear issue status.

#### `healthCheck()`
Check Linear API connectivity.

### ConflictResolver

#### `checkForConflicts(issue, targetState, event, metadata)`
Check for conflicts between current and proposed state.

#### `resolveConflict(conflictResult)`
Resolve detected conflicts using configured strategies.

#### `getStatistics()`
Get conflict resolution statistics.

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Run health check: `npm run linear:health`

### Testing

- Unit tests for all components
- Integration tests with Linear API
- End-to-end workflow testing
- Security testing

### Code Quality

- ESLint configuration for code style
- Prettier for code formatting
- Security scanning with automated tools
- Code coverage requirements

## Support

For questions, issues, or contributions:
- GitHub Issues: [Repository Issues](https://github.com/Zeeeepa/claude-task-master/issues)
- Documentation: [Project Wiki](https://github.com/Zeeeepa/claude-task-master/wiki)
- Security Issues: Report privately to maintainers

