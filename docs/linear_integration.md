# Linear Integration Documentation

## Overview

The Linear Integration module provides comprehensive bidirectional synchronization between Linear project management and the AI CI/CD system. It enables automated ticket status updates, progress tracking, conflict resolution, and detailed reporting.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Linear API    │◄──►│ Linear Client    │◄──►│ AI CI/CD System │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Status Manager   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Progress Tracker │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Webhook Handler  │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Conflict Resolver│
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Reporting Engine │
                       └──────────────────┘
```

## Components

### 1. Linear Client (`linear_client.js`)

The core API client that handles all communication with Linear's GraphQL API.

**Features:**
- Rate limiting (1000 requests/minute)
- Automatic retry with exponential backoff
- Authentication management
- Error handling and logging
- Bulk operations support

**Key Methods:**
```javascript
// Get issue details
const issue = await linearClient.getIssue(issueId);

// Update issue status
await linearClient.updateIssueStatus(issueId, stateId);

// Create new issue
const newIssue = await linearClient.createIssue(issueData);

// Add comment
await linearClient.addComment(issueId, commentText);

// Bulk update issues
await linearClient.bulkUpdateIssues(issueIds, updates);
```

### 2. Status Manager (`status_manager.js`)

Manages automated ticket status updates based on CI/CD workflow events.

**Features:**
- Event-driven status updates
- Conflict detection and resolution
- State transition validation
- Batch processing
- Event history tracking

**Status Mappings:**
```javascript
const statusMappings = {
  'task_created': 'backlog',
  'development_started': 'in_progress',
  'pr_created': 'in_review',
  'deployment_success': 'done',
  'deployment_failed': 'failed'
};
```

**Usage:**
```javascript
// Update status from CI/CD event
const result = await statusManager.updateStatusFromEvent(
  issueId, 
  'pr_created', 
  { prUrl: 'https://github.com/org/repo/pull/123' }
);

// Batch update multiple issues
const results = await statusManager.batchUpdateStatuses([
  { issueId: 'issue1', event: 'deployment_success' },
  { issueId: 'issue2', event: 'test_failed' }
]);
```

### 3. Progress Tracker (`progress_tracker.js`)

Provides real-time visibility into project progress and milestone completion.

**Features:**
- Weighted progress calculation
- Milestone tracking
- Velocity analysis
- Risk identification
- Health assessment

**Progress Calculation:**
```javascript
// Calculate project progress
const progress = await progressTracker.calculateProgress({
  project: { id: projectId }
});

// Track milestone
await progressTracker.trackMilestone(milestoneId, {
  name: 'Sprint 1',
  targetDate: '2024-02-01',
  filters: { cycle: { id: cycleId } }
});

// Get progress trends
const trends = progressTracker.getProgressTrends(milestoneId, '7d');
```

### 4. Webhook Handler (`webhook_handler.js`)

Handles bidirectional webhook communication for real-time synchronization.

**Features:**
- Express.js webhook server
- Signature verification
- Event routing and processing
- CI/CD command extraction
- Request tracking

**Supported Events:**
- Issue creation/updates
- Comment creation
- Project changes
- Cycle updates
- Team modifications

**Setup:**
```javascript
const webhookHandler = new WebhookHandler(config);
await webhookHandler.start(); // Starts server on configured port

// Register custom handler
webhookHandler.registerHandler('CustomEvent', async (payload) => {
  // Handle custom event
});
```

### 5. Conflict Resolver (`conflict_resolver.js`)

Handles conflicts between manual updates and automated changes.

**Features:**
- Conflict detection
- Resolution strategies
- Escalation mechanisms
- Field-specific rules
- Audit trail

**Resolution Strategies:**
1. **Manual Override** - Manual changes take precedence
2. **Recent Change** - Most recent change wins
3. **Automation Skip** - Skip automation if conflict detected
4. **Merge Changes** - Attempt to merge compatible changes
5. **Escalate** - Escalate for manual resolution

**Usage:**
```javascript
// Check for conflicts
const conflictResult = await conflictResolver.checkForConflicts(
  issue, targetState, event, metadata
);

// Resolve conflict
if (conflictResult.hasConflict) {
  const resolution = await conflictResolver.resolveConflict(conflictResult);
}
```

### 6. Reporting Engine (`reporting.js`)

Generates comprehensive reports and analytics.

**Features:**
- Project reports
- Team performance reports
- Executive dashboards
- Custom reports
- Multiple export formats (JSON, Markdown, HTML, CSV)

**Report Types:**
```javascript
// Generate project report
const projectReport = await reporting.generateProjectReport(projectId, {
  type: 'weekly',
  timeRange: '30d'
});

// Generate team report
const teamReport = await reporting.generateTeamReport(teamId, {
  timeRange: '7d'
});

// Export report
const markdown = await reporting.exportReport(report, 'markdown');
```

## Configuration

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
```

### Configuration File

The system uses `config/linear_config.json` for detailed configuration:

```json
{
  "linear": {
    "apiKey": "${LINEAR_API_KEY}",
    "teamId": "${LINEAR_TEAM_ID}"
  },
  "statusMappings": {
    "development_started": "in_progress",
    "pr_created": "in_review"
  },
  "tracking": {
    "stateWeights": {
      "backlog": 0,
      "in_progress": 0.3,
      "done": 1.0
    }
  }
}
```

## Integration Patterns

### 1. CI/CD Pipeline Integration

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

### 2. Webhook Integration

```javascript
// Setup webhook endpoint
const webhookHandler = new WebhookHandler({
  port: 3001,
  path: '/webhooks/linear',
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET
});

// Start webhook server
await webhookHandler.start();
console.log('Webhook server listening on port 3001');
```

### 3. Progress Monitoring

```javascript
// Monitor project progress
const progressTracker = new ProgressTracker(config);

// Setup milestone tracking
await progressTracker.trackMilestone('milestone-1', {
  name: 'Q1 Release',
  targetDate: '2024-03-31',
  filters: { project: { id: 'project-123' } }
});

// Generate progress report
const report = await progressTracker.generateProgressReport({
  project: { id: 'project-123' }
});
```

## API Reference

### Linear Client

#### `getIssue(issueId)`
Retrieves detailed information about a Linear issue.

**Parameters:**
- `issueId` (string): The Linear issue ID

**Returns:**
- Promise resolving to issue object

#### `updateIssueStatus(issueId, stateId)`
Updates the status of a Linear issue.

**Parameters:**
- `issueId` (string): The Linear issue ID
- `stateId` (string): The target state ID

**Returns:**
- Promise resolving to updated issue object

#### `createIssue(input)`
Creates a new Linear issue.

**Parameters:**
- `input` (object): Issue creation data
  - `title` (string): Issue title
  - `description` (string): Issue description
  - `teamId` (string): Team ID
  - `assigneeId` (string, optional): Assignee ID
  - `priority` (number, optional): Priority level

**Returns:**
- Promise resolving to created issue object

### Status Manager

#### `updateStatusFromEvent(issueId, event, metadata)`
Updates issue status based on CI/CD event.

**Parameters:**
- `issueId` (string): The Linear issue ID
- `event` (string): The CI/CD event type
- `metadata` (object, optional): Additional event metadata

**Returns:**
- Promise resolving to update result object

#### `batchUpdateStatuses(updates)`
Updates multiple issues in batch.

**Parameters:**
- `updates` (array): Array of update objects
  - `issueId` (string): Issue ID
  - `event` (string): Event type
  - `metadata` (object, optional): Event metadata

**Returns:**
- Promise resolving to array of update results

### Progress Tracker

#### `calculateProgress(filters)`
Calculates progress for filtered issues.

**Parameters:**
- `filters` (object): Issue filters
  - `project` (object, optional): Project filter
  - `team` (object, optional): Team filter
  - `assignee` (object, optional): Assignee filter

**Returns:**
- Promise resolving to progress metrics object

#### `trackMilestone(milestoneId, config)`
Sets up milestone tracking.

**Parameters:**
- `milestoneId` (string): Unique milestone identifier
- `config` (object): Milestone configuration
  - `name` (string): Milestone name
  - `targetDate` (string): Target completion date
  - `filters` (object): Issue filters for milestone

**Returns:**
- Promise resolving to milestone tracking object

## Error Handling

The system implements comprehensive error handling:

### Rate Limiting
- Automatic retry with exponential backoff
- Request queuing during rate limit periods
- Configurable retry attempts and delays

### API Errors
- Detailed error logging with context
- Graceful degradation for non-critical operations
- Error escalation for critical failures

### Conflict Resolution
- Automatic conflict detection
- Configurable resolution strategies
- Manual escalation when needed

## Monitoring and Observability

### Metrics
- API request rates and response times
- Status update success/failure rates
- Conflict resolution statistics
- Progress tracking accuracy

### Logging
- Structured logging with correlation IDs
- Configurable log levels
- Integration with monitoring systems

### Health Checks
- API connectivity checks
- Webhook endpoint health
- Database connectivity (if applicable)

## Security Considerations

### Authentication
- Secure API key management
- Token rotation capabilities
- Least privilege access

### Webhook Security
- Signature verification
- Request origin validation
- Rate limiting protection

### Data Protection
- No sensitive data in logs
- Encrypted configuration storage
- Audit trail for all operations

## Performance Optimization

### Caching
- Progress calculation caching
- Team state caching
- Report generation caching

### Batch Operations
- Bulk issue updates
- Parallel processing with concurrency limits
- Efficient API usage patterns

### Resource Management
- Connection pooling
- Memory usage optimization
- Graceful shutdown handling

## Troubleshooting

### Common Issues

#### Authentication Errors
```
Error: Linear API error: 401 Unauthorized
```
**Solution:** Verify LINEAR_API_KEY environment variable is set correctly.

#### Rate Limiting
```
Error: Rate limit exceeded
```
**Solution:** The system automatically handles rate limiting with retries. Check rate limiter configuration if issues persist.

#### Webhook Signature Verification
```
Error: Invalid webhook signature
```
**Solution:** Verify LINEAR_WEBHOOK_SECRET matches the secret configured in Linear.

### Debug Mode
Enable debug logging by setting the log level:

```javascript
import logger from './src/logger.js';
logger.level = 'debug';
```

### Health Check Endpoints
- `GET /health` - Basic health check
- `GET /webhooks/status` - Webhook handler status
- `GET /metrics` - System metrics (if enabled)

## Best Practices

### Configuration Management
- Use environment variables for secrets
- Version control configuration files
- Document configuration changes

### Error Handling
- Always handle API errors gracefully
- Log errors with sufficient context
- Implement circuit breakers for external dependencies

### Performance
- Use batch operations when possible
- Implement appropriate caching strategies
- Monitor API usage and optimize calls

### Security
- Rotate API keys regularly
- Validate all webhook payloads
- Use HTTPS for all communications

## Migration Guide

### From Manual Linear Management
1. Export existing Linear data
2. Configure status mappings
3. Set up webhook endpoints
4. Test with a small subset of issues
5. Gradually roll out to all projects

### Integration with Existing CI/CD
1. Identify CI/CD events to map to Linear states
2. Configure event handlers
3. Test status updates in staging environment
4. Deploy to production with monitoring

## Support and Maintenance

### Regular Maintenance
- Monitor API usage and performance
- Review and update status mappings
- Clean up old reports and logs
- Update dependencies and security patches

### Monitoring Checklist
- [ ] API response times within acceptable limits
- [ ] Webhook delivery success rate > 95%
- [ ] Conflict resolution working as expected
- [ ] Progress tracking accuracy validated
- [ ] Report generation completing successfully

### Backup and Recovery
- Regular backup of configuration
- Document recovery procedures
- Test disaster recovery scenarios
- Maintain rollback capabilities

## Contributing

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Start development server: `npm run dev`

### Testing
- Unit tests for all components
- Integration tests with Linear API
- End-to-end workflow testing
- Performance testing under load

### Code Quality
- ESLint configuration for code style
- Prettier for code formatting
- JSDoc for documentation
- Code coverage requirements

## Changelog

### Version 1.0.0
- Initial release
- Core Linear integration functionality
- Status management and progress tracking
- Webhook handling and conflict resolution
- Comprehensive reporting capabilities

### Future Enhancements
- Advanced analytics and forecasting
- Machine learning for conflict prediction
- Enhanced notification systems
- Mobile app integration
- Advanced workflow automation

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Contact

For questions, issues, or contributions:
- GitHub Issues: [Repository Issues](https://github.com/Zeeeepa/claude-task-master/issues)
- Documentation: [Project Wiki](https://github.com/Zeeeepa/claude-task-master/wiki)
- Support: [Support Channel](mailto:support@example.com)

