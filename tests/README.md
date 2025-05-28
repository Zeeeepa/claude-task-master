# 🧪 Comprehensive Testing and Validation Framework

This directory contains a comprehensive testing framework designed to ensure system reliability, performance, and correctness across all components of the claude-task-master CI/CD pipeline.

## 📋 Testing Strategy

Our testing approach follows a multi-layered strategy:

1. **Unit Testing**: Comprehensive unit tests for all system components
2. **Integration Testing**: End-to-end workflow testing across all services
3. **Performance Testing**: Load testing and performance benchmarking
4. **Security Testing**: Vulnerability assessment and penetration testing
5. **Chaos Engineering**: Fault injection and resilience testing

## 🏗️ Framework Structure

```
tests/
├── automation/          # Test automation and CI/CD integration
├── chaos/              # Chaos engineering tests
├── fixtures/           # Test data and mock responses
├── integration/        # Integration and end-to-end tests
├── performance/        # Performance and load tests
├── security/           # Security vulnerability tests
├── test-utils/         # Shared testing utilities
├── unit/              # Unit tests for individual components
├── global-setup.js    # Global test environment setup
├── global-teardown.js # Global test environment cleanup
└── setup.js           # Jest test setup configuration
```

## 🚀 Quick Start

### Running All Tests

```bash
# Run all test suites
npm run test:all

# Run all tests with coverage
npm run test:all-coverage

# Run tests for CI/CD (with fail-fast)
npm run test:ci
```

### Running Specific Test Categories

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Performance tests only
npm run test:performance

# Security tests only
npm run test:security

# Chaos engineering tests only
npm run test:chaos
```

### Running Individual Test Files

```bash
# Run specific test file
npm test -- tests/unit/task-manager.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="should handle"

# Run tests in watch mode
npm run test:watch
```

## 📊 Test Coverage

Our framework maintains high test coverage standards:

- **Global Coverage**: 90% minimum for branches, functions, lines, and statements
- **Critical Modules** (`scripts/modules/`): 95% minimum coverage
- **Source Code** (`src/`): 85% minimum coverage

### Viewing Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

## 🧰 Testing Utilities

### TestDataManager

Manages test data creation, cleanup, and fixture loading:

```javascript
import { TestDataManager } from '../test-utils/index.js';

const testDataManager = new TestDataManager();
const testTasks = testDataManager.generateTestTasks(100);
const tempFile = testDataManager.createTempFile('test.json', JSON.stringify(data));
```

### MockAIFactory

Creates mocks for AI service providers:

```javascript
import { MockAIFactory } from '../test-utils/index.js';

const claudeMock = MockAIFactory.createClaudeMock();
const openaiMock = MockAIFactory.createOpenAIMock();
```

### PerformanceTestUtils

Utilities for performance testing and monitoring:

```javascript
import { PerformanceTestUtils } from '../test-utils/index.js';

const { duration, result } = await PerformanceTestUtils.measureExecutionTime(async () => {
    return someFunction();
});

const loadTestResults = await PerformanceTestUtils.runLoadTest(
    testFunction,
    10, // concurrency
    100 // total iterations
);
```

### SecurityTestUtils

Security testing utilities and payload generators:

```javascript
import { SecurityTestUtils } from '../test-utils/index.js';

const xssPayloads = SecurityTestUtils.getXSSPayloads();
const sqlPayloads = SecurityTestUtils.getSQLInjectionPayloads();
const results = SecurityTestUtils.testInputSanitization(sanitizeFunction, payloads);
```

### ChaosTestUtils

Chaos engineering utilities for fault injection:

```javascript
import { ChaosTestUtils } from '../test-utils/index.js';

// Simulate network failures
if (ChaosTestUtils.simulateNetworkFailure(0.1)) {
    throw new Error('Network timeout');
}

// Simulate random delays
await ChaosTestUtils.simulateRandomDelay(100, 1000);

// Simulate memory pressure
const buffer = ChaosTestUtils.simulateMemoryPressure(100); // 100MB
```

## 🔧 Test Configuration

### Jest Configuration

The Jest configuration is located in `jest.config.js` and includes:

- Enhanced coverage thresholds
- Module path mapping
- Global setup/teardown
- Custom reporters
- Performance optimizations

### Environment Variables

Test-specific environment variables:

```bash
NODE_ENV=test
TASKMASTER_TEST_MODE=true
TASKMASTER_LOG_LEVEL=error
TASKMASTER_DISABLE_ANALYTICS=true
```

## 📈 Performance Testing

### Performance Benchmarks

Our performance tests validate:

- **Single Task Lookup**: < 10ms
- **Bulk Operations**: < 5ms average
- **Large Dataset Operations**: < 50ms for 1000 tasks
- **Concurrent Operations**: < 10ms average with 50 concurrent requests

### Load Testing

```javascript
// Example load test
const loadTestResults = await PerformanceTestUtils.runLoadTest(
    async () => findTaskById(tasks, randomId),
    10,  // 10 concurrent operations
    100  // 100 total operations
);

expect(loadTestResults.averageDuration).toBeLessThan(5);
```

### Memory Monitoring

```javascript
const initialMemory = PerformanceTestUtils.getMemoryUsage();
// ... perform operations ...
const finalMemory = PerformanceTestUtils.getMemoryUsage();
const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
```

## 🔒 Security Testing

### Input Validation Testing

```javascript
const xssPayloads = SecurityTestUtils.getXSSPayloads();
const results = SecurityTestUtils.testInputSanitization(sanitizePrompt, xssPayloads);

results.forEach(result => {
    expect(result.safe).toBe(true);
});
```

### Authentication Testing

```javascript
// Test API key validation
const isValid = validateApiKey(apiKey);
expect(isValid).toBe(false); // for invalid keys
```

### File System Security

```javascript
// Test path traversal prevention
const isAuthorized = isAuthorizedPath('../../../etc/passwd');
expect(isAuthorized).toBe(false);
```

## 🌪️ Chaos Engineering

### Network Failure Simulation

```javascript
const mockApiCall = jest.fn().mockImplementation(async () => {
    if (ChaosTestUtils.simulateNetworkFailure(0.3)) {
        throw new Error('Network timeout');
    }
    return { success: true };
});
```

### File System Failure Simulation

```javascript
// Simulate file read failures
fs.readFileSync = jest.fn().mockImplementation((path) => {
    if (Math.random() < 0.2) {
        ChaosTestUtils.simulateFileSystemError('read');
    }
    return originalReadFileSync(path);
});
```

### Circuit Breaker Testing

```javascript
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.failureThreshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED';
    }
    
    async call(fn) {
        if (this.state === 'OPEN') {
            throw new Error('Circuit breaker is OPEN');
        }
        // ... implementation
    }
}
```

## 🔄 Continuous Integration

### CI/CD Integration

The framework integrates with CI/CD pipelines through:

```bash
# CI-optimized test run
npm run test:ci

# Generate reports for CI
npm run test:all-coverage
```

### Test Reports

The framework generates multiple report formats:

- **Console Output**: Real-time test results
- **JSON Report**: Machine-readable results (`coverage/test-report.json`)
- **HTML Report**: Interactive web report (`coverage/test-report.html`)
- **LCOV Report**: Coverage data for external tools

### GitHub Actions Integration

```yaml
- name: Run Comprehensive Tests
  run: npm run test:ci
  
- name: Upload Coverage Reports
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

## 📝 Writing Tests

### Test Structure

Follow this structure for new tests:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestDataManager } from '../test-utils/index.js';

describe('Feature Name', () => {
    let testDataManager;

    beforeAll(async () => {
        testDataManager = new TestDataManager();
        // Setup test data
    });

    afterAll(() => {
        testDataManager.cleanup();
    });

    describe('Specific Functionality', () => {
        test('should behave correctly under normal conditions', async () => {
            // Arrange
            const input = testDataManager.generateTestData();
            
            // Act
            const result = await functionUnderTest(input);
            
            // Assert
            expect(result).toBeDefined();
            expect(result.success).toBe(true);
        });

        test('should handle error conditions gracefully', async () => {
            // Test error scenarios
        });
    });
});
```

### Best Practices

1. **Test Independence**: Each test should be independent and not rely on other tests
2. **Clear Naming**: Use descriptive test names that explain the expected behavior
3. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification phases
4. **Mock External Dependencies**: Use mocks for external services and APIs
5. **Test Edge Cases**: Include tests for boundary conditions and error scenarios
6. **Performance Awareness**: Include performance assertions where relevant
7. **Security Mindset**: Test for security vulnerabilities and input validation

### Test Categories

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test interactions between components
- **End-to-End Tests**: Test complete user workflows
- **Performance Tests**: Validate performance requirements
- **Security Tests**: Test for vulnerabilities and security issues
- **Chaos Tests**: Test system resilience under failure conditions

## 🐛 Debugging Tests

### Running Tests in Debug Mode

```bash
# Run with verbose output
npm test -- --verbose

# Run specific test with debugging
node --inspect-brk node_modules/.bin/jest --runInBand tests/unit/specific.test.js
```

### Common Issues

1. **Async Test Timeouts**: Increase timeout with `jest.setTimeout(30000)`
2. **Memory Leaks**: Use `afterEach` to clean up resources
3. **Mock Issues**: Ensure mocks are properly reset between tests
4. **File System Issues**: Use `TestDataManager` for proper cleanup

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Performance Testing Guide](https://web.dev/performance-testing/)
- [Security Testing Checklist](https://owasp.org/www-project-web-security-testing-guide/)
- [Chaos Engineering Principles](https://principlesofchaos.org/)

## 🤝 Contributing

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Add appropriate documentation and comments
3. Ensure tests are deterministic and reliable
4. Include both positive and negative test cases
5. Update this README if adding new testing utilities or patterns

## 📞 Support

For questions about the testing framework:

1. Check existing test examples in the codebase
2. Review this documentation
3. Create an issue with the `testing` label
4. Reach out to the development team

---

**Remember**: Good tests are the foundation of reliable software. Write tests that you would want to debug at 3 AM! 🌙

