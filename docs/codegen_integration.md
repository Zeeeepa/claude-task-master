# Codegen Natural Language Processing & PR Generation

## Overview

This module provides a comprehensive natural language processing and automated pull request generation system that integrates with the existing AI CI/CD infrastructure. It bridges the gap between human-readable task descriptions and executable code by processing structured task data from PostgreSQL database and automatically generating pull requests with comprehensive code implementations.

## Architecture

### Core Components

1. **Natural Language Processor** (`natural_language_processor.js`)
   - Interprets complex task requirements and dependencies
   - Extracts structured requirements from natural language descriptions
   - Classifies tasks and determines complexity
   - Generates context for code generation

2. **Template Manager** (`template_manager.js`)
   - Manages prompt instruction templates for consistent output
   - Provides variable substitution and template validation
   - Supports template versioning and caching
   - Includes default templates for common scenarios

3. **Branch Manager** (`branch_manager.js`)
   - Handles Git operations and branch management
   - Manages concurrent PR generation and avoids conflicts
   - Provides branch lifecycle management
   - Includes conflict detection and resolution

4. **Code Quality Validator** (`code_quality_validator.js`)
   - Validates generated code quality and ensures production standards
   - Performs syntax, style, complexity, and security validation
   - Integrates with linting tools and testing frameworks
   - Provides automated quality reporting

5. **PR Generator** (`pr_generator.js`)
   - Orchestrates the complete workflow from task to PR
   - Coordinates all components in a structured pipeline
   - Provides workflow tracking and error recovery
   - Handles post-creation tasks and notifications

## Features

### Natural Language Processing
- **Task Classification**: Automatically classifies tasks into categories (feature, bug fix, refactor, etc.)
- **Requirement Extraction**: Extracts functional, technical, and constraint requirements
- **Context Generation**: Builds comprehensive context for code generation
- **Confidence Scoring**: Provides confidence metrics for processing quality

### Code Generation
- **Template-Based Generation**: Uses customizable templates for consistent output
- **Multi-Language Support**: Supports JavaScript, TypeScript, Python, and more
- **Quality Assurance**: Integrated quality validation and testing
- **Error Recovery**: Automatic retry mechanisms for failed generations

### Branch Management
- **Concurrent Processing**: Handles multiple PR generations simultaneously
- **Conflict Detection**: Identifies and resolves merge conflicts
- **Branch Lifecycle**: Complete branch creation, management, and cleanup
- **Git Integration**: Full Git workflow automation

### Quality Validation
- **Multi-Dimensional Validation**: Syntax, style, complexity, security, performance
- **Configurable Rules**: Customizable validation rules and thresholds
- **Tool Integration**: Works with ESLint, Flake8, and other linting tools
- **Automated Fixes**: Attempts to auto-fix common quality issues

## Installation

### Prerequisites
- Node.js 18+ or Python 3.8+
- Git
- PostgreSQL database
- Codegen API access

### Setup

1. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   npm run db:migrate
   ```

4. **Initialize Templates**
   ```bash
   npm run templates:init
   ```

## Configuration

### Environment Variables

```bash
# Codegen API Configuration
CODEGEN_API_KEY=your_api_key
CODEGEN_ORG_ID=your_org_id
CODEGEN_API_URL=https://api.codegen.sh

# Database Configuration
DATABASE_URL=postgresql://localhost:5432/codegen-taskmaster-db

# Git Configuration
GIT_USER_NAME="Codegen Bot"
GIT_USER_EMAIL="codegen@example.com"

# Quality Validation
QUALITY_THRESHOLD=0.8
ENABLE_LINTING=true
ENABLE_SECURITY_SCANNING=true

# Notifications
SLACK_WEBHOOK_URL=your_slack_webhook
GITHUB_WEBHOOK_SECRET=your_github_secret
```

### Configuration File

The system uses `config/codegen_config.json` for detailed configuration:

```json
{
  "naturalLanguageProcessor": {
    "maxTokens": 4000,
    "confidenceThreshold": 0.7,
    "supportedTaskTypes": ["feature_implementation", "bug_fix", ...]
  },
  "codeQualityValidator": {
    "qualityThreshold": 0.8,
    "enableLinting": true,
    "validationRules": {
      "maxLineLength": 120,
      "maxCyclomaticComplexity": 10
    }
  }
}
```

## Usage

### Basic Usage

```javascript
import { PRGenerator } from './src/ai_cicd_system/codegen/pr_generator.js';

const prGenerator = new PRGenerator({
  // Configuration options
});

await prGenerator.initialize();

// Generate PR from task data
const result = await prGenerator.generatePR(taskData);
console.log(`PR created: ${result.pr.url}`);
```

### Advanced Usage

```javascript
// Batch processing
const batchResult = await nlpProcessor.batchProcessTasks(tasks);

// Custom validation
const validationResult = await qualityValidator.validateCode(filePaths, {
  enableSecurity: true,
  customRules: { maxComplexity: 15 }
});

// Branch management
const branchInfo = await branchManager.createBranch(taskId, taskData);
await branchManager.commitChanges("feat: implement new feature");
await branchManager.pushBranch();
```

## API Reference

### NaturalLanguageProcessor

#### `processTask(taskData)`
Processes a natural language task request and returns structured requirements.

**Parameters:**
- `taskData` (Object): Raw task data from database

**Returns:**
- `Promise<Object>`: Processed task with structured requirements

#### `batchProcessTasks(tasks)`
Processes multiple tasks in batch.

**Parameters:**
- `tasks` (Array): Array of task data objects

**Returns:**
- `Promise<Object>`: Batch processing results

### BranchManager

#### `createBranch(taskId, taskData)`
Creates a new branch for a task.

**Parameters:**
- `taskId` (string): Task identifier
- `taskData` (Object): Task data

**Returns:**
- `Promise<Object>`: Branch information

#### `commitChanges(message, files)`
Commits changes to the current branch.

**Parameters:**
- `message` (string): Commit message
- `files` (Array): Files to commit (optional)

**Returns:**
- `Promise<Object>`: Commit information

### CodeQualityValidator

#### `validateCode(filePaths, options)`
Validates code quality for specified files.

**Parameters:**
- `filePaths` (Array): Paths to files to validate
- `options` (Object): Validation options

**Returns:**
- `Promise<Object>`: Validation results

### PRGenerator

#### `generatePR(taskData, options)`
Generates a complete PR from task data.

**Parameters:**
- `taskData` (Object): Task data from database
- `options` (Object): Generation options

**Returns:**
- `Promise<Object>`: PR generation result

#### `getWorkflowStatus(workflowId)`
Gets the status of a workflow.

**Parameters:**
- `workflowId` (string): Workflow identifier

**Returns:**
- `Object`: Workflow status

## Workflow

### PR Generation Pipeline

1. **Task Processing**
   - Natural language analysis
   - Requirement extraction
   - Context generation

2. **Branch Creation**
   - Unique branch generation
   - Base branch synchronization
   - Conflict prevention

3. **Code Generation**
   - Codegen API integration
   - Template processing
   - Code synthesis

4. **Quality Validation**
   - Multi-dimensional validation
   - Automated testing
   - Security scanning

5. **PR Creation**
   - Commit generation
   - Push to remote
   - PR creation and linking

6. **Post-Processing**
   - Notifications
   - Webhook triggers
   - Status updates

### Error Handling

The system includes comprehensive error handling and recovery:

- **Retry Mechanisms**: Automatic retries for transient failures
- **Quality Gates**: Prevents low-quality code from being merged
- **Rollback Capabilities**: Can revert changes if issues are detected
- **Detailed Logging**: Comprehensive logging for debugging

## Integration Points

### Database Integration
- Reads task data from PostgreSQL database
- Updates task status and PR information
- Stores workflow history and metrics

### Codegen API Integration
- Authenticates with Codegen API
- Sends structured prompts for code generation
- Handles rate limiting and quotas

### GitHub Integration
- Creates and manages pull requests
- Updates PR status and metadata
- Handles webhook events

### AgentAPI Middleware
- Triggers webhook events for downstream processing
- Integrates with Claude Code for validation
- Provides feedback loop for improvements

### Linear Integration
- Updates Linear ticket statuses
- Links PRs to Linear issues
- Provides progress tracking

## Monitoring and Alerting

### Metrics
- Task processing success rate
- Code quality scores
- PR generation time
- Error rates and types

### Alerts
- Quality gate failures
- API quota exceeded
- System errors
- Performance degradation

### Dashboards
- Real-time workflow status
- Quality trends
- Performance metrics
- Error analysis

## Security Considerations

### Code Security
- Automated security scanning
- Secret detection and prevention
- Vulnerability assessment
- Secure coding practices

### API Security
- Token-based authentication
- Rate limiting and quotas
- Request validation
- Audit logging

### Data Security
- Encrypted data transmission
- Secure credential storage
- Access control and permissions
- Data retention policies

## Performance Optimization

### Caching
- Template caching
- Context caching
- Result caching
- Database query optimization

### Parallel Processing
- Concurrent task processing
- Parallel validation
- Asynchronous operations
- Resource pooling

### Resource Management
- Memory optimization
- CPU usage monitoring
- Network optimization
- Storage efficiency

## Troubleshooting

### Common Issues

1. **API Authentication Failures**
   - Verify API key and organization ID
   - Check API quota and rate limits
   - Validate network connectivity

2. **Quality Validation Failures**
   - Review validation rules and thresholds
   - Check linter configurations
   - Verify file permissions

3. **Branch Management Issues**
   - Ensure Git configuration is correct
   - Check repository permissions
   - Verify base branch exists

4. **Template Processing Errors**
   - Validate template syntax
   - Check variable substitution
   - Verify template file permissions

### Debug Mode

Enable debug mode for detailed logging:

```bash
NODE_ENV=development DEBUG=codegen:* npm start
```

### Log Analysis

Logs are structured and include:
- Timestamp and log level
- Component and operation
- Request/response data
- Error details and stack traces

## Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards

- Follow existing code style
- Add comprehensive tests
- Update documentation
- Include error handling

### Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "NaturalLanguageProcessor"

# Run with coverage
npm run test:coverage
```

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation wiki
- Join the community Slack channel

