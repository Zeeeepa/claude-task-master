# Testing Framework Documentation

## 🧪 Overview

This comprehensive testing framework provides complete coverage for the CICD orchestration system, implementing the test pyramid approach with unit tests, integration tests, end-to-end tests, performance tests, and security validation.

## 📁 Directory Structure

```
tests/
├── unit/                    # Unit tests (70% of test suite)
│   ├── database/           # Database model tests
│   ├── orchestration/      # Workflow engine tests
│   └── integrations/       # External service integration tests
├── integration/            # Integration tests (20% of test suite)
│   └── workflows/          # Complete workflow integration tests
├── e2e/                    # End-to-end tests (10% of test suite)
│   ├── dashboard/          # Dashboard functionality tests
│   └── support/            # Cypress support files
├── performance/            # Performance and load tests
├── security/               # Security validation tests
├── fixtures/               # Test data fixtures
├── mocks/                  # Mock services and APIs
├── utils/                  # Test utilities and helpers
└── README.md              # This documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis (for integration tests)
- Chrome/Chromium (for E2E tests)

### Installation

```bash
# Install dependencies
npm install

# Setup test database
npm run db:migrate

# Run all tests
npm run test:all
```

### Individual Test Suites

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# End-to-end tests
npm run test:e2e

# Performance tests
npm run test:performance

# Security tests
npm run test:security

# Coverage report
npm run test:coverage
```

## 🧪 Test Categories

### Unit Tests

**Location**: `tests/unit/`  
**Coverage Target**: 90%+  
**Purpose**: Test individual components in isolation

#### Database Tests
- Model validation and constraints
- CRUD operations
- Data relationships
- Query performance

```javascript
// Example: tests/unit/database/TaskModel.test.js
describe('TaskModel', () => {
  test('should create task with valid data', async () => {
    const taskData = await TestHelpers.createTestTask();
    const result = await Task.create(taskData);
    expect(result.id).toBeDefined();
  });
});
```

#### Orchestration Tests
- Workflow engine functionality
- Task scheduling and execution
- Error handling and recovery
- State management

```javascript
// Example: tests/unit/orchestration/WorkflowEngine.test.js
describe('WorkflowEngine', () => {
  test('should start workflow successfully', async () => {
    const workflow = await TestHelpers.createTestWorkflow();
    const result = await workflowEngine.startWorkflow(workflow);
    expect(result.success).toBe(true);
  });
});
```

#### Integration Tests
- External API interactions
- Webhook handling
- Authentication and authorization
- Rate limiting

### Integration Tests

**Location**: `tests/integration/`  
**Purpose**: Test service interactions and data flow

#### Workflow Integration
- Complete workflow execution
- Service coordination
- Data persistence
- Error propagation

```javascript
// Example: tests/integration/workflows/CompleteWorkflow.test.js
describe('Complete Workflow Integration', () => {
  test('should execute end-to-end workflow', async () => {
    const workflow = await orchestrator.executeCompleteWorkflow(config);
    expect(workflow.status).toBe('completed');
  });
});
```

### End-to-End Tests

**Location**: `tests/e2e/`  
**Framework**: Cypress  
**Purpose**: Test complete user journeys

#### Dashboard Tests
- User interface interactions
- Real-time updates
- Cross-browser compatibility
- Accessibility compliance

```javascript
// Example: tests/e2e/dashboard/DashboardWorkflow.cy.js
describe('Dashboard Workflow', () => {
  it('should create workflow through UI', () => {
    cy.visit('/dashboard');
    cy.get('[data-cy=create-workflow-btn]').click();
    cy.get('[data-cy=workflow-title]').type('Test Workflow');
    // ... more interactions
  });
});
```

### Performance Tests

**Location**: `tests/performance/`  
**Framework**: K6  
**Purpose**: Validate system performance under load

#### Load Testing
- Concurrent workflow processing
- Database query performance
- API response times
- Resource utilization

```javascript
// Example: tests/performance/workflow-load-test.js
export default function(data) {
  const response = http.post('/api/workflows', workflowData);
  check(response, {
    'workflow creation < 2s': (r) => r.timings.duration < 2000,
  });
}
```

### Security Tests

**Location**: `tests/security/`  
**Purpose**: Validate security controls and protections

#### Security Validation
- Authentication mechanisms
- Authorization controls
- Input validation
- Data encryption
- Audit logging

```javascript
// Example: tests/security/SecurityValidation.test.js
describe('Security Validation', () => {
  test('should prevent SQL injection', async () => {
    const maliciousInput = "'; DROP TABLE users; --";
    const result = await inputValidator.preventSQLInjection(maliciousInput);
    expect(result.safe).toBe(false);
  });
});
```

## 🛠 Test Utilities

### TestHelpers Class

**Location**: `tests/utils/TestHelpers.js`

Provides common utilities for test setup and data generation:

```javascript
import { TestHelpers } from '../utils/TestHelpers.js';

// Create test data
const workflow = await TestHelpers.createTestWorkflow();
const task = await TestHelpers.createTestTask();

// Mock external services
TestHelpers.mockLinearAPI();
TestHelpers.mockGitHubAPI();

// Generate test IDs
const id = TestHelpers.generateId();

// Clean up after tests
await TestHelpers.cleanupTestData();
```

### Mock Services

**Location**: `tests/mocks/`

#### LinearMock
- Mock Linear API responses
- Webhook simulation
- Rate limiting simulation

#### GitHubMock  
- Mock GitHub API responses
- PR and issue management
- Webhook events

### Test Fixtures

**Location**: `tests/fixtures/`

Pre-defined test data for consistent testing:

```javascript
import { sampleWorkflow, completedTask } from '../fixtures/workflows.js';
import { activeTask, failedTask } from '../fixtures/tasks.js';
```

## 📊 Coverage Requirements

### Coverage Thresholds

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90
  }
}
```

### Critical Path Coverage
- Authentication flows: 100%
- Workflow orchestration: 100%
- Data persistence: 95%
- External integrations: 90%
- Error handling: 95%

## 🔧 Configuration

### Jest Configuration

**File**: `jest.config.js`

```javascript
export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

### Cypress Configuration

**File**: `cypress.config.js`

```javascript
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'tests/e2e/support/index.js',
    specPattern: 'tests/e2e/**/*.cy.js'
  }
});
```

### Environment Variables

```bash
# Test Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=claude_task_master_test
DB_USER=test_user
DB_PASSWORD=test_password

# External Service URLs (mocked)
LINEAR_API_URL=http://localhost:3001/mock/linear
GITHUB_API_URL=http://localhost:3001/mock/github
CODEGEN_SDK_URL=http://localhost:3001/mock/codegen

# Test Credentials
JWT_SECRET=test-jwt-secret-key
TEST_USERNAME=test@example.com
TEST_PASSWORD=testpassword123
```

## 🚀 Continuous Integration

### GitHub Actions Workflow

**File**: `.github/workflows/test.yml`

The CI pipeline runs:

1. **Unit Tests** - Fast, isolated component tests
2. **Integration Tests** - Service interaction validation  
3. **E2E Tests** - Complete user journey validation
4. **Performance Tests** - Load and stress testing
5. **Security Tests** - Security vulnerability scanning
6. **Code Quality** - Linting, coverage, and quality metrics

### Test Execution Matrix

| Test Type | Trigger | Duration | Parallel |
|-----------|---------|----------|----------|
| Unit | Every commit | ~2 min | Yes |
| Integration | Every commit | ~5 min | Yes |
| E2E | Every commit | ~10 min | Yes |
| Performance | Main branch only | ~15 min | No |
| Security | Every commit | ~3 min | Yes |

## 📈 Performance Benchmarks

### Response Time Targets

- Workflow creation: < 2 seconds
- Task processing: < 30 seconds  
- Database queries: < 100ms
- API responses: < 500ms
- Dashboard load: < 3 seconds

### Load Testing Scenarios

- **Normal Load**: 10 concurrent users
- **Peak Load**: 50 concurrent users
- **Stress Test**: 100 concurrent users
- **Spike Test**: 10 → 100 → 10 users

### Performance Metrics

```javascript
// K6 thresholds
thresholds: {
  http_req_duration: ['p(95)<2000'],
  http_req_failed: ['rate<0.05'],
  workflow_creation_success_rate: ['rate>0.95']
}
```

## 🔒 Security Testing

### Security Test Categories

1. **Authentication Tests**
   - API key validation
   - JWT token verification
   - Password strength validation
   - Session management

2. **Authorization Tests**
   - Role-based access control (RBAC)
   - Resource-level permissions
   - Access audit logging

3. **Input Validation Tests**
   - SQL injection prevention
   - XSS protection
   - CSRF protection
   - File upload validation

4. **Data Security Tests**
   - Encryption at rest
   - Secure transmission
   - Secret management
   - Webhook signature validation

### Security Scanning Tools

- **npm audit** - Dependency vulnerability scanning
- **Snyk** - Advanced security scanning
- **OWASP Dependency Check** - Known vulnerability detection
- **SonarCloud** - Code quality and security analysis

## 🐛 Debugging Tests

### Running Tests in Debug Mode

```bash
# Debug specific test
npm run test:unit -- --testNamePattern="TaskModel"

# Debug with verbose output
npm run test:unit -- --verbose

# Debug with coverage
npm run test:unit -- --coverage --collectCoverageFrom="src/models/**"

# Debug Cypress tests
npm run test:e2e:open
```

### Common Issues and Solutions

#### Database Connection Issues
```bash
# Reset test database
npm run db:migrate
npm run db:seed:test
```

#### Mock Service Issues
```javascript
// Clear mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  TestHelpers.cleanupTestData();
});
```

#### Cypress Test Failures
```bash
# Run with browser visible
npm run test:e2e:open

# Check screenshots and videos
ls tests/e2e/screenshots/
ls tests/e2e/videos/
```

## 📝 Writing New Tests

### Test Naming Conventions

```javascript
// Unit tests: ComponentName.test.js
// Integration tests: FeatureName.test.js  
// E2E tests: UserJourney.cy.js
// Performance tests: load-test-name.js
// Security tests: SecurityArea.test.js
```

### Test Structure

```javascript
describe('Component/Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Specific Functionality', () => {
    test('should do something specific', async () => {
      // Arrange
      const input = createTestData();
      
      // Act
      const result = await functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

### Best Practices

1. **Use descriptive test names** that explain what is being tested
2. **Follow AAA pattern** (Arrange, Act, Assert)
3. **Mock external dependencies** to ensure test isolation
4. **Use test helpers** for common setup and data generation
5. **Clean up after tests** to prevent test pollution
6. **Test both happy path and error scenarios**
7. **Maintain test independence** - tests should not depend on each other

## 📊 Test Reporting

### Coverage Reports

```bash
# Generate HTML coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Test Results

- **Console Output**: Real-time test execution feedback
- **JUnit XML**: For CI/CD integration
- **HTML Reports**: Detailed test results with screenshots
- **Coverage Reports**: Line, branch, and function coverage

### Metrics Dashboard

The CI pipeline generates comprehensive test metrics:

- Test execution time trends
- Coverage percentage over time
- Flaky test identification
- Performance regression detection

## 🔄 Maintenance

### Regular Maintenance Tasks

1. **Update test dependencies** monthly
2. **Review and update fixtures** quarterly  
3. **Performance benchmark review** quarterly
4. **Security test updates** as needed
5. **Mock service updates** when APIs change

### Test Health Monitoring

- Monitor test execution times
- Track flaky test patterns
- Review coverage trends
- Update performance benchmarks

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Cypress Documentation](https://docs.cypress.io/)
- [K6 Documentation](https://k6.io/docs/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## 🤝 Contributing

When adding new tests:

1. Follow the established patterns and conventions
2. Ensure adequate test coverage for new features
3. Update this documentation for significant changes
4. Run the full test suite before submitting PRs

## 📞 Support

For questions about the testing framework:

- Check existing test examples in the codebase
- Review this documentation
- Ask in team chat or create an issue

---

**Last Updated**: 2024-01-01  
**Framework Version**: 1.0.0  
**Maintainer**: Codegen Team

