# Claude Code Integration

Comprehensive Claude Code integration for automated PR validation, debugging, and code quality analysis using the @anthropic-ai/claude-code CLI tool.

## 🎯 Overview

This integration provides a complete solution for incorporating Claude Code's AI-powered coding assistance into your CI/CD pipeline. It offers automated code review, quality assessment, security scanning, and debugging assistance.

## 🚀 Features

### Core Functionality

- **PR Validation**: Automated code review and validation using Claude Code
- **Code Quality Analysis**: Comprehensive assessment of maintainability, complexity, and best practices
- **Security Scanning**: Vulnerability detection and security best practices validation
- **Performance Analysis**: Performance bottleneck identification and optimization suggestions
- **Debug Assistance**: Intelligent debugging support for build failures
- **Feedback Processing**: Multi-format feedback delivery (GitHub, Linear, Slack, Email)

### Integration Features

- **Quality Gates**: Configurable quality thresholds for PR approval
- **Multi-format Output**: JSON, Markdown, and structured reports
- **Session Management**: Conversation continuity for complex analysis
- **Metrics Collection**: Performance and accuracy tracking
- **Error Handling**: Robust error handling and recovery

## 📦 Installation

### Prerequisites

1. **Claude Code CLI**: Install the Claude Code CLI tool

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Authentication**: Complete the one-time OAuth process

   ```bash
   claude
   # Follow the authentication prompts
   ```

3. **System Requirements**:
   - Node.js 18+
   - Git 2.23+ (optional)
   - 4GB RAM minimum
   - Internet connection for AI processing

### Integration Setup

1. **Import the integration**:

   ```javascript
   import { ClaudeCodeIntegration } from './src/integrations/claude-code/index.js';
   ```

2. **Initialize the integration**:

   ```javascript
   const integration = new ClaudeCodeIntegration({
   	config: {
   		outputFormat: 'json',
   		maxTurns: 5,
   		verbose: false
   	}
   });

   await integration.initialize();
   ```

## 🔧 Configuration

### Basic Configuration

```javascript
const config = {
	// Output format for Claude Code responses
	outputFormat: 'json', // 'json', 'text', 'stream-json'

	// Maximum number of agentic turns
	maxTurns: 5,

	// Enable verbose logging
	verbose: false,

	// Allowed tools for Claude Code
	allowedTools: [
		'Bash(npm install)',
		'Bash(npm test)',
		'FileEditor',
		'FileViewer',
		'WebSearch'
	],

	// Disallowed tools for security
	disallowedTools: ['Bash(rm -rf)', 'Bash(sudo)', 'Bash(git push --force)'],

	// Custom system prompt append
	systemPromptAppend: 'Focus on code quality, security, and best practices.'
};
```

### Quality Gates Configuration

```javascript
const qualityGates = {
	codeQuality: {
		minScore: 0.8, // Minimum code quality score (0-1)
		maxComplexity: 10, // Maximum cyclomatic complexity
		maxDuplication: 0.1 // Maximum code duplication ratio
	},
	security: {
		maxVulnerabilities: 0, // Maximum critical vulnerabilities
		allowedSeverities: ['low', 'medium'] // Allowed vulnerability severities
	},
	performance: {
		maxResponseTime: 5000, // Maximum response time (ms)
		minCoverage: 0.9 // Minimum test coverage
	},
	maintainability: {
		minReadability: 0.7, // Minimum readability score
		maxTechnicalDebt: 0.2 // Maximum technical debt ratio
	}
};
```

## 📚 Usage Examples

### PR Validation

```javascript
const prInfo = {
	prNumber: 123,
	sourceBranch: 'feature/new-feature',
	targetBranch: 'main',
	title: 'Add new user authentication',
	description: 'Implements OAuth2 authentication flow',
	author: 'developer@company.com',
	files: ['src/auth.js', 'src/middleware/auth.js']
};

const result = await integration.validatePullRequest(prInfo, {
	feedbackTarget: 'github',
	includeFileBreakdown: true,
	timeout: 300000 // 5 minutes
});

if (result.success) {
	console.log('PR Validation Result:', result.validation.recommendation);
	console.log('GitHub Feedback:', result.feedback.formats.github.content);
} else {
	console.error('Validation failed:', result.error);
}
```

### Code Quality Analysis

```javascript
// Analyze a single file
const fileResult = await integration.analyzeCodeQuality(
	'./src/utils/helper.js',
	{
		analysisDepth: 'comprehensive',
		feedbackTarget: 'all'
	}
);

// Analyze entire project
const projectResult = await integration.analyzeCodeQuality('./src', {
	analysisDepth: 'standard',
	excludePatterns: ['node_modules', 'dist', 'coverage'],
	maxFileSize: 1024 * 1024, // 1MB
	batchSize: 5
});

console.log('Overall Score:', projectResult.analysis.metrics.overallScore);
console.log('Grade:', projectResult.analysis.summary.grade);
```

### Security Scanning

```javascript
const securityResult = await integration.performSecurityScan('./src', {
	feedbackTarget: 'slack',
	timeout: 180000 // 3 minutes
});

if (securityResult.success) {
	console.log('Security scan completed');
	console.log('Slack notification:', securityResult.feedback.formats.slack);
}
```

### Debug Assistance

```javascript
const errorLog = `
Error: Cannot find module 'missing-dependency'
    at Function.Module._resolveFilename (internal/modules/cjs/loader.js:636:15)
    at Function.Module._load (internal/modules/cjs/loader.js:562:25)
    at Module.require (internal/modules/cjs/loader.js:692:17)
`;

const debugResult = await integration.debugBuildFailure(errorLog, {
	feedbackTarget: 'linear'
});

console.log('Debug suggestions:', debugResult.debug.data);
```

### Performance Analysis

```javascript
const perfResult = await integration.analyzePerformance('./src/api', {
	feedbackTarget: 'email',
	includeOptimizations: true
});

console.log('Performance analysis:', perfResult.analysis.data);
```

## 🔄 Workflow Integration

### CI/CD Pipeline Integration

```yaml
# GitHub Actions example
name: Claude Code Analysis
on:
  pull_request:
    branches: [main]

jobs:
  code-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run Claude Code Analysis
        run: node scripts/claude-code-analysis.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Webhook Integration

```javascript
// Express.js webhook handler
app.post('/webhook/pr', async (req, res) => {
	const { action, pull_request } = req.body;

	if (action === 'opened' || action === 'synchronize') {
		const prInfo = {
			prNumber: pull_request.number,
			sourceBranch: pull_request.head.ref,
			targetBranch: pull_request.base.ref,
			title: pull_request.title,
			description: pull_request.body,
			author: pull_request.user.login
		};

		const result = await integration.validatePullRequest(prInfo);

		if (result.success) {
			// Post feedback as PR comment
			await github.issues.createComment({
				owner: 'your-org',
				repo: 'your-repo',
				issue_number: pull_request.number,
				body: result.feedback.formats.github.content
			});
		}
	}

	res.status(200).send('OK');
});
```

## 📊 Feedback Formats

### GitHub Format

- Markdown-formatted PR comments
- Quality gate status indicators
- File-specific issue breakdown
- Actionable recommendations

### Linear Format

- Compact issue updates
- Priority-based labeling
- Status tracking integration

### Slack Format

- Rich message blocks
- Color-coded status indicators
- Interactive elements
- Team notifications

### Email Format

- HTML-formatted reports
- Executive summaries
- Detailed analysis breakdowns
- Attachment support

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- src/integrations/claude-code/tests/

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:e2e
```

### Test Coverage

The integration includes comprehensive tests covering:

- Unit tests for individual components
- Integration tests for component interaction
- End-to-end workflow testing
- Error handling and edge cases
- Performance and timeout scenarios

Target coverage: 90%+

## 📈 Metrics and Monitoring

### Available Metrics

```javascript
const status = integration.getStatus();
console.log('Metrics:', status.metrics);

// Example output:
{
  validationsPerformed: 45,
  analysesCompleted: 23,
  feedbackGenerated: 67,
  averageValidationTime: 4500, // ms
  successRate: 0.95
}
```

### Performance Monitoring

- Validation completion time tracking
- Analysis accuracy measurement
- Error rate monitoring
- Resource utilization tracking

## 🔒 Security Considerations

### API Key Management

- Store Anthropic API keys securely
- Use environment variables
- Implement key rotation
- Monitor API usage

### Tool Restrictions

- Configure allowed/disallowed tools
- Implement command filtering
- Audit tool usage
- Restrict dangerous operations

### Data Privacy

- Code analysis is processed by Anthropic's servers
- Ensure compliance with data policies
- Consider on-premises alternatives for sensitive code
- Implement data retention policies

## 🚨 Error Handling

### Common Issues and Solutions

1. **Claude Code Not Installed**

   ```
   Error: Claude Code CLI is not installed or not accessible
   Solution: npm install -g @anthropic-ai/claude-code
   ```

2. **Authentication Failure**

   ```
   Error: Authentication failed
   Solution: Run 'claude' and complete OAuth process
   ```

3. **Timeout Errors**

   ```
   Error: Command timed out after 300000ms
   Solution: Increase timeout or reduce analysis scope
   ```

4. **Git Repository Issues**
   ```
   Error: Not a git repository
   Solution: Ensure analysis runs in git repository root
   ```

## 🔧 Troubleshooting

### Debug Mode

```javascript
const integration = new ClaudeCodeIntegration({
	config: { verbose: true }
});
```

### Log Analysis

- Check Claude Code CLI logs
- Monitor system resource usage
- Verify network connectivity
- Validate file permissions

### Performance Optimization

- Adjust batch sizes for large projects
- Use appropriate analysis depth
- Configure file exclusion patterns
- Implement caching strategies

## 🤝 Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
4. Run tests: `npm test`
5. Start development: `npm run dev`

### Code Standards

- Follow ESLint configuration
- Maintain test coverage above 90%
- Document all public APIs
- Use semantic versioning

## 📄 License

This integration is part of the Claude Task Master project and follows the same licensing terms.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review Claude Code documentation
3. Open an issue in the repository
4. Contact the development team

---

_Generated by Claude Code Integration v1.0.0_
