# Integration Testing Framework

## Overview

This directory contains the comprehensive integration testing framework for the claude-task-master system. The framework provides end-to-end validation of system functionality, performance, security, and health monitoring.

## Framework Components

### 1. End-to-End Test Suite (`tests/e2e-scenarios.js`)
Validates complete workflows from task creation through PR validation and deployment.

**Key Features:**
- Happy path scenario testing
- Error recovery validation
- Concurrent operations testing
- Edge case handling
- Comprehensive workflow validation

### 2. System Health Validator (`health-checks/system-validator.js`)
Monitors system health and validates component availability.

**Key Features:**
- Database connectivity monitoring
- MCP server health checks
- AI provider integration validation
- Resource utilization monitoring
- Continuous health monitoring

### 3. Performance Load Tester (`performance/load-tester.js`)
Validates system performance under various load conditions.

**Key Features:**
- Multiple load testing scenarios
- SLA requirement validation
- Performance metrics collection
- Bottleneck identification
- Scalability testing

### 4. Security Validator (`security/security-validator.js`)
Comprehensive security testing and vulnerability assessment.

**Key Features:**
- Input validation testing
- Authentication/authorization checks
- API security validation
- Injection attack prevention
- Security compliance verification

### 5. Integration Test Runner (`integration-test-runner.js`)
Main orchestrator that coordinates all testing components.

**Key Features:**
- Configurable test execution
- Comprehensive reporting
- Error handling and recovery
- Performance monitoring
- Results aggregation

## Quick Start

### 1. Installation
```bash
# Deploy the integration testing framework
./deployment/scripts/deploy-integration-tests.sh

# Verify installation
npm run test:integration:validate
```

### 2. Configuration
```bash
# Copy environment template
cp .env.example .env.test

# Edit configuration
nano .env.test
```

### 3. Run Tests
```bash
# Run all integration tests
npm run test:integration

# Run specific test categories
npm run test:integration:e2e
npm run test:integration:health
npm run test:integration:performance
npm run test:integration:security
```

## Test Categories

### End-to-End Tests
```bash
# Run E2E tests only
npm run test:integration:e2e

# Or with environment variable
RUN_HEALTH_CHECKS=false RUN_PERFORMANCE_TESTS=false RUN_SECURITY_TESTS=false npm run test:integration
```

**Test Scenarios:**
- **Happy Path**: Complete successful workflow
- **Error Recovery**: System resilience testing
- **Concurrent Operations**: Multi-workflow validation
- **Edge Cases**: Boundary condition testing

### Health Checks
```bash
# Run health checks only
npm run test:integration:health
```

**Health Validations:**
- Database connectivity
- MCP server responsiveness
- AI provider availability
- System resource monitoring
- Network connectivity

### Performance Tests
```bash
# Run performance tests only
npm run test:integration:performance
```

**Performance Scenarios:**
- **Baseline**: Single user performance
- **Normal Load**: Typical operating conditions
- **Peak Load**: High traffic simulation
- **Stress Test**: Breaking point identification
- **Spike Test**: Sudden load increase handling

### Security Tests
```bash
# Run security tests only
npm run test:integration:security
```

**Security Validations:**
- Input sanitization
- Authentication mechanisms
- Authorization controls
- API security
- Vulnerability scanning

## Configuration

### Environment Variables

#### Core Configuration
```bash
NODE_ENV=test
LOG_LEVEL=debug
INTEGRATION_TEST_TIMEOUT=300000
INTEGRATION_TEST_RETRIES=3
INTEGRATION_REPORTS_DIR=./integration-reports
```

#### Test Control
```bash
RUN_E2E_TESTS=true
RUN_HEALTH_CHECKS=true
RUN_PERFORMANCE_TESTS=true
RUN_SECURITY_TESTS=true
GENERATE_REPORTS=true
```

#### API Keys
```bash
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GOOGLE_API_KEY=your-google-key
LINEAR_API_KEY=your-linear-key
GITHUB_TOKEN=your-github-token
```

#### Performance Testing
```bash
PERFORMANCE_TEST_DURATION=60000
PERFORMANCE_MAX_CONCURRENT_USERS=50
PERFORMANCE_RAMP_UP_TIME=30000
```

#### Security Testing
```bash
SECURITY_TEST_ENABLED=true
SECURITY_SCAN_TIMEOUT=120000
SECURITY_VULNERABILITY_THRESHOLD=0
```

### Configuration Files

#### Test Configuration (`config/test.json`)
```json
{
  "timeout": 300000,
  "retries": 3,
  "parallel": false,
  "verbose": true,
  "reports": {
    "enabled": true,
    "format": ["json", "html"],
    "directory": "./integration-reports"
  }
}
```

## Test Execution

### Command Line Options
```bash
# Show help
node run-integration-tests.js --help

# Run specific test types
node run-integration-tests.js --e2e-only
node run-integration-tests.js --health-only
node run-integration-tests.js --performance-only
node run-integration-tests.js --security-only

# Quick test run
node run-integration-tests.js --quick

# Dry run (show configuration without executing)
node run-integration-tests.js --dry-run

# Verbose output
node run-integration-tests.js --verbose
```

### Programmatic Usage
```javascript
import { IntegrationTestRunner } from './integration-test-runner.js';

const options = {
  runE2ETests: true,
  runHealthChecks: true,
  runPerformanceTests: false,
  runSecurityTests: true,
  generateReports: true,
  outputDirectory: './custom-reports'
};

const runner = new IntegrationTestRunner(options);
await runner.initialize();
const results = await runner.runAllTests();

console.log(`Overall status: ${results.overallStatus}`);
```

## Reporting

### Report Types

#### 1. Executive Summary (`executive-summary.json`)
High-level overview for stakeholders
```json
{
  "overallStatus": "passed",
  "keyMetrics": {
    "totalTestsRun": 45,
    "overallSuccessRate": "95.6%",
    "testDuration": "12.3 minutes",
    "criticalIssues": 0
  },
  "topRecommendations": [...],
  "nextSteps": [...]
}
```

#### 2. Comprehensive Report (`integration-test-report.json`)
Detailed results for all test categories
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "overallStatus": "passed",
  "summary": {...},
  "results": {
    "e2e": {...},
    "health": {...},
    "performance": {...},
    "security": {...}
  },
  "recommendations": [...]
}
```

#### 3. Category-Specific Reports
- `e2e-test-report.json`: E2E test details
- `health-validation-report.json`: Health check results
- `performance-test-report.json`: Performance metrics
- `security-validation-report.json`: Security findings

### Report Analysis
```bash
# View executive summary
cat integration-reports/executive-summary.json | jq '.'

# Check for critical issues
cat integration-reports/integration-test-report.json | jq '.summary.criticalIssues'

# View performance metrics
cat integration-reports/performance-test-report.json | jq '.performanceReport.summary'

# Check security vulnerabilities
cat integration-reports/security-validation-report.json | jq '.vulnerabilities'
```

## Continuous Integration

### GitHub Actions Integration
```yaml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Deploy integration tests
      run: ./deployment/scripts/deploy-integration-tests.sh
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    
    - name: Upload test reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: integration-reports
        path: integration-reports/
```

### Scheduled Testing
```bash
# Add to crontab for regular testing
crontab -e

# Daily integration tests at 2 AM
0 2 * * * cd /path/to/claude-task-master && npm run test:integration

# Health checks every 30 minutes
*/30 * * * * cd /path/to/claude-task-master && npm run test:integration:health
```

## Performance Benchmarks

### SLA Requirements
- **Response Time**: < 1000ms (95th percentile)
- **Throughput**: > 100 requests/minute
- **Error Rate**: < 1%
- **Workflow Completion**: < 15 minutes
- **System Uptime**: > 99.9%

### Load Testing Scenarios
| Scenario | Users | Duration | Purpose |
|----------|-------|----------|---------|
| Baseline | 1 | 1 min | Performance baseline |
| Normal | 10 | 5 min | Typical load |
| Peak | 25 | 10 min | High traffic |
| Stress | 50 | 15 min | Breaking point |
| Spike | 100 | 3 min | Sudden increases |

## Security Standards

### Security Test Categories
- **Input Validation**: XSS, SQL injection prevention
- **Authentication**: Password policies, MFA support
- **Authorization**: Role-based access control
- **API Security**: Rate limiting, key protection
- **Data Protection**: Encryption, sanitization

### Compliance Validation
- OWASP Top 10 compliance
- Data protection regulations
- Industry security standards
- API security best practices

## Troubleshooting

### Common Issues

#### Test Timeouts
```bash
# Increase timeout
export INTEGRATION_TEST_TIMEOUT=600000

# Run with debug logging
LOG_LEVEL=debug npm run test:integration
```

#### API Authentication Failures
```bash
# Verify API keys
echo $ANTHROPIC_API_KEY | cut -c1-10

# Test API connectivity
curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
```

#### Database Connection Issues
```bash
# Check database status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U taskmaster_user -d taskmaster -c "SELECT 1;"
```

#### Memory Issues
```bash
# Monitor memory during tests
while true; do
  ps aux | grep integration-test | awk '{print $6}'
  sleep 5
done

# Force garbage collection
node --expose-gc run-integration-tests.js
```

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run test:integration

# Run individual components
npm run test:integration:health --verbose

# Check system resources
top -p $(pgrep -f integration-test)
```

## Best Practices

### Test Development
1. **Isolation**: Each test should be independent
2. **Cleanup**: Properly clean up resources after tests
3. **Deterministic**: Tests should produce consistent results
4. **Fast Feedback**: Optimize for quick execution
5. **Clear Assertions**: Use descriptive test assertions

### Performance Testing
1. **Realistic Data**: Use production-like test data
2. **Gradual Ramp-up**: Gradually increase load
3. **Monitor Resources**: Track system resources during tests
4. **Baseline Comparison**: Compare against established baselines
5. **Regular Execution**: Run performance tests regularly

### Security Testing
1. **Comprehensive Coverage**: Test all attack vectors
2. **Regular Updates**: Keep security tests current
3. **Automated Scanning**: Include automated vulnerability scans
4. **Compliance Checks**: Validate against security standards
5. **Incident Response**: Test security incident procedures

## Extending the Framework

### Adding New Test Scenarios
```javascript
// Add to e2e-scenarios.js
export const CustomScenarios = {
  newScenario: {
    description: 'Custom test scenario',
    steps: ['step1', 'step2', 'step3'],
    expectedDuration: 300000,
    criticalPath: true
  }
};
```

### Custom Health Checks
```javascript
// Add to system-validator.js
registerHealthChecks() {
  this.healthChecks.set('custom_check', this.customHealthCheck.bind(this));
}

async customHealthCheck() {
  // Custom health check implementation
  return { status: 'healthy', details: {...} };
}
```

### Performance Test Extensions
```javascript
// Add to load-tester.js
this.loadTestScenarios.customTest = {
  name: 'Custom Load Test',
  concurrentUsers: 20,
  duration: 300000,
  rampUpTime: 60000
};
```

### Security Test Extensions
```javascript
// Add to security-validator.js
registerSecurityTests() {
  this.securityTests.set('custom_security_test', this.customSecurityTest.bind(this));
}

async customSecurityTest() {
  // Custom security test implementation
  return { secure: true, details: {...} };
}
```

## Support and Documentation

### Additional Resources
- [Integration Testing Guide](../docs/integration/integration-testing-guide.md)
- [Deployment Guide](../docs/deployment/deployment-guide.md)
- [Troubleshooting Guide](../docs/troubleshooting/troubleshooting-guide.md)
- [Performance Benchmarks](../docs/performance/performance-benchmarks.md)

### Getting Help
1. Check the troubleshooting guide for common issues
2. Review test logs for detailed error information
3. Run tests with debug logging enabled
4. Create GitHub issues with test reports and logs
5. Contact the development team for complex issues

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Add or modify tests
4. Run the full test suite
5. Submit a pull request

### Test Guidelines
- Follow existing code patterns
- Add comprehensive test coverage
- Include documentation updates
- Ensure tests pass in CI/CD
- Add appropriate error handling

## License

This integration testing framework is part of the claude-task-master project and follows the same licensing terms.

