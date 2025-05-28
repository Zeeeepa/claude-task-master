# Claude Code Integration

This directory contains the comprehensive integration with @anthropic-ai/claude-code for automated PR validation, debugging, and code quality assessment within the AI CI/CD workflow.

## Overview

The Claude Code integration provides:

- **Automated PR Validation**: Comprehensive validation of pull requests using Claude Code CLI
- **WSL2 Environment Management**: Isolated environments for secure code validation
- **Code Analysis**: Deep analysis of code complexity, security, and performance
- **Validation Reporting**: Detailed reports with actionable insights and recommendations
- **Debugging Capabilities**: AI-powered debugging and issue resolution suggestions

## Architecture

```
src/ai_cicd_system/integrations/
├── claude_code_integrator.js    # Main integration orchestrator
├── pr_validator.js              # PR validation logic and rules
├── code_analyzer.js             # Code analysis and metrics
├── wsl2_manager.js              # WSL2 environment management
└── validation_reporter.js       # Report generation and formatting
```

## Components

### ClaudeCodeIntegrator

The main orchestrator that coordinates all validation activities.

```javascript
import { ClaudeCodeIntegrator } from './claude_code_integrator.js';

const integrator = new ClaudeCodeIntegrator({
  claudeCodePath: 'claude-code',
  wsl2Enabled: true,
  validationTimeout: 300000,
  maxConcurrentValidations: 3,
  enableDebugging: true,
  enableCodeAnalysis: true
});

await integrator.initialize();

const result = await integrator.validatePR({
  prNumber: 123,
  repository: 'https://github.com/user/repo.git',
  headBranch: 'feature/new-feature',
  title: 'Add new feature',
  author: 'developer@example.com',
  modifiedFiles: ['src/feature.js', 'tests/feature.test.js']
});
```

### PRValidator

Handles PR validation rules and quality checks.

```javascript
import { PRValidator } from './pr_validator.js';

const validator = new PRValidator({
  validationRules: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
    maxLinesPerFile: 1000,
    requireTests: true,
    noHardcodedSecrets: true
  }
});

await validator.initialize();
const result = await validator.validatePR(prDetails, environment);
```

### CodeAnalyzer

Performs comprehensive code analysis including complexity, coverage, and security.

```javascript
import { CodeAnalyzer } from './code_analyzer.js';

const analyzer = new CodeAnalyzer({
  analysisMetrics: ['complexity', 'coverage', 'security', 'performance']
});

await analyzer.initialize();
const analysis = await analyzer.analyzeCode({
  environment,
  files: ['src/component.js'],
  metrics: ['complexity', 'security']
});
```

### WSL2Manager

Manages isolated WSL2 environments for secure validation.

```javascript
import { WSL2Manager } from './wsl2_manager.js';

const wsl2Manager = new WSL2Manager();
await wsl2Manager.initialize();

const environment = await wsl2Manager.createEnvironment({
  name: 'pr-validation-123',
  repository: 'https://github.com/user/repo.git',
  branch: 'feature/branch'
});

// Use environment for validation
await wsl2Manager.cleanupEnvironment(environment);
```

### ValidationReporter

Generates comprehensive validation reports in multiple formats.

```javascript
import { ValidationReporter } from './validation_reporter.js';

const reporter = new ValidationReporter({
  reportFormats: ['json', 'markdown', 'html'],
  includeRawOutput: true
});

const report = await reporter.generateReport({
  validationId: 'validation_123',
  prDetails,
  validation: validationResult,
  analysis: analysisResult
});
```

## Configuration

### Basic Configuration

```javascript
const config = {
  // Claude Code CLI path
  claudeCodePath: 'claude-code',
  
  // Environment settings
  wsl2Enabled: true,
  validationTimeout: 300000, // 5 minutes
  
  // Concurrency settings
  maxConcurrentValidations: 3,
  
  // Feature flags
  enableDebugging: true,
  enableCodeAnalysis: true,
  
  // Validation rules
  validationRules: {
    maxFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
    maxLinesPerFile: 1000,
    requireTests: true
  }
};
```

### Advanced Configuration

```javascript
const advancedConfig = {
  // WSL2 specific settings
  wsl2: {
    defaultDistribution: 'Ubuntu',
    installBaseTools: true,
    environmentTimeout: 600000
  },
  
  // Analysis settings
  analysis: {
    metrics: ['complexity', 'coverage', 'security', 'performance'],
    complexityThreshold: 10,
    coverageThreshold: 80,
    securityScanEnabled: true
  },
  
  // Reporting settings
  reporting: {
    formats: ['json', 'markdown', 'html'],
    includeRawOutput: false,
    generateSummary: true
  }
};
```

## Usage Examples

### Basic PR Validation

```javascript
import { ClaudeCodeIntegrator } from './claude_code_integrator.js';

async function validatePR() {
  const integrator = new ClaudeCodeIntegrator();
  await integrator.initialize();
  
  const result = await integrator.validatePR({
    prNumber: 42,
    repository: 'https://github.com/example/repo.git',
    headBranch: 'feature/validation',
    modifiedFiles: ['src/validator.js']
  });
  
  console.log(`Validation status: ${result.summary.status}`);
  console.log(`Issues found: ${result.validation.issues.length}`);
  
  await integrator.shutdown();
}
```

### Code Debugging

```javascript
async function debugCode() {
  const integrator = new ClaudeCodeIntegrator({
    enableDebugging: true
  });
  
  await integrator.initialize();
  
  const environment = await integrator.createValidationEnvironment({
    repository: 'https://github.com/example/repo.git',
    branch: 'bugfix/memory-leak'
  });
  
  const debugResult = await integrator.debugCode(
    environment,
    'Memory leak in user session management'
  );
  
  console.log('Diagnosis:', debugResult.diagnosis);
  console.log('Suggested fixes:', debugResult.fixes);
  
  await integrator.cleanupEnvironment(environment);
  await integrator.shutdown();
}
```

### Batch Validation

```javascript
async function batchValidation() {
  const integrator = new ClaudeCodeIntegrator({
    maxConcurrentValidations: 5
  });
  
  await integrator.initialize();
  
  const prs = [
    { prNumber: 1, repository: 'repo1', headBranch: 'feature1' },
    { prNumber: 2, repository: 'repo2', headBranch: 'feature2' },
    { prNumber: 3, repository: 'repo3', headBranch: 'feature3' }
  ];
  
  const results = await Promise.all(
    prs.map(pr => integrator.validatePR(pr))
  );
  
  results.forEach((result, index) => {
    console.log(`PR ${prs[index].prNumber}: ${result.summary.status}`);
  });
  
  await integrator.shutdown();
}
```

## Error Handling

The integration includes comprehensive error handling:

```javascript
try {
  const result = await integrator.validatePR(prDetails);
  // Handle successful validation
} catch (error) {
  if (error.message.includes('Maximum concurrent validations')) {
    // Handle concurrency limit
    console.log('Too many concurrent validations, retrying later...');
  } else if (error.message.includes('Claude Code CLI not available')) {
    // Handle CLI availability
    console.log('Claude Code CLI not found, please install it');
  } else {
    // Handle other errors
    console.error('Validation failed:', error.message);
  }
}
```

## Monitoring and Statistics

Track validation performance and statistics:

```javascript
// Get current statistics
const stats = integrator.getValidationStats();
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Average duration: ${stats.averageDuration}ms`);

// Get active validations
const active = integrator.getActiveValidations();
console.log(`Currently running: ${active.length} validations`);

// Get validation history
const history = integrator.getValidationHistory(10);
history.forEach(validation => {
  console.log(`PR ${validation.prNumber}: ${validation.status}`);
});
```

## Testing

Run the test suite:

```bash
npm test src/ai_cicd_system/tests/claude_code_integration.test.js
npm test src/ai_cicd_system/tests/pr_validation.test.js
npm test src/ai_cicd_system/tests/wsl2_environment.test.js
```

## Performance Considerations

- **Concurrent Validations**: Limit concurrent validations to avoid resource exhaustion
- **Environment Cleanup**: Always cleanup environments to prevent resource leaks
- **Timeout Management**: Set appropriate timeouts for different validation types
- **WSL2 Overhead**: Consider local environments for simple validations

## Security Considerations

- **Isolated Environments**: WSL2 provides isolation for untrusted code
- **Secret Detection**: Built-in detection of hardcoded secrets
- **Access Control**: Validate repository access before cloning
- **Resource Limits**: Enforce limits on file sizes and validation time

## Troubleshooting

### Common Issues

1. **Claude Code CLI not found**
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **WSL2 not available**
   ```bash
   wsl --install
   wsl --set-default-version 2
   ```

3. **Permission errors**
   ```bash
   # Ensure proper permissions for working directories
   chmod 755 /tmp/validation-*
   ```

4. **Timeout errors**
   ```javascript
   // Increase timeout for large repositories
   const config = { validationTimeout: 600000 }; // 10 minutes
   ```

### Debug Mode

Enable debug logging:

```javascript
const integrator = new ClaudeCodeIntegrator({
  debug: true,
  logLevel: 'debug'
});
```

## Contributing

When contributing to the Claude Code integration:

1. Follow the existing code patterns and structure
2. Add comprehensive tests for new functionality
3. Update documentation for any API changes
4. Ensure error handling is robust
5. Test with both local and WSL2 environments

## Dependencies

- **@anthropic-ai/claude-code**: Claude Code CLI tool
- **WSL2**: Windows Subsystem for Linux (optional)
- **Git**: Version control operations
- **Node.js**: Runtime environment

## License

This integration is part of the AI CI/CD system and follows the same license terms.

