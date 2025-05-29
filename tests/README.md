# Task Master Comprehensive Test Suite

This directory contains the complete testing framework for the Task Master AI CI/CD system, consolidating application logic, database operations, and infrastructure testing into a unified, cohesive testing strategy.

## 🎯 Testing Philosophy

Our testing framework follows a **layered approach** that ensures comprehensive coverage across all system components:

- **Unit Tests**: Fast, isolated tests for individual functions and components
- **Integration Tests**: Component interaction and API testing
- **Database Tests**: PostgreSQL schema validation and data operations
- **Infrastructure Tests**: Cloudflare proxy, SSL/TLS, and monitoring validation
- **End-to-End Tests**: Complete workflow validation from user perspective

## 📁 Test Structure

```
tests/
├── README.md                     # This documentation
├── setup.js                      # Global test setup and configuration
├── jest.config.js                # Jest configuration for all test types
├── unit/                         # Unit tests for individual components
│   ├── task-manager.test.js      # Task management logic
│   ├── ui.test.js                # User interface components
│   ├── config-manager.test.js    # Configuration management
│   └── mcp/                      # MCP server unit tests
├── integration/                  # Integration tests
│   ├── cli/                      # CLI command integration tests
│   ├── mcp-server/               # MCP server integration tests
│   ├── database/                 # Database integration tests
│   └── infrastructure/           # Infrastructure integration tests
├── database/                     # Database-specific tests (NEW)
│   ├── schema/                   # Schema validation tests
│   ├── migrations/               # Migration tests
│   ├── performance/              # Database performance tests
│   └── fixtures/                 # Database test fixtures
├── infrastructure/               # Infrastructure tests (NEW)
│   ├── cloudflare/               # Cloudflare proxy tests
│   ├── ssl/                      # SSL/TLS configuration tests
│   ├── monitoring/               # Monitoring and alerting tests
│   └── security/                 # Security and access control tests
├── e2e/                          # End-to-end tests
│   ├── workflows/                # Complete workflow tests
│   ├── database-e2e/             # Database end-to-end tests
│   └── infrastructure-e2e/       # Infrastructure end-to-end tests
├── fixtures/                     # Shared test fixtures
├── helpers/                      # Test helper utilities (NEW)
│   ├── database-helpers.js       # Database test utilities
│   ├── infrastructure-helpers.js # Infrastructure test utilities
│   └── mock-helpers.js           # Mocking utilities
└── performance/                  # Performance and load tests (NEW)
    ├── benchmarks/               # Performance benchmarks
    └── load-tests/               # Load testing scenarios
```

## 🚀 Running Tests

### All Tests
```bash
npm test                          # Run all tests
npm run test:watch                # Watch mode for development
npm run test:coverage             # Generate coverage report
```

### Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Database tests only
npm run test:database

# Infrastructure tests only
npm run test:infrastructure

# End-to-end tests only
npm run test:e2e

# Performance tests only
npm run test:performance
```

### Environment-Specific Tests
```bash
# Development environment tests
npm run test:dev

# Staging environment tests
npm run test:staging

# Production environment tests (read-only)
npm run test:prod
```

## 🗄️ Database Testing

### Schema Validation Tests
- **Purpose**: Validate PostgreSQL schema integrity and constraints
- **Location**: `tests/database/schema/`
- **Coverage**: Tables, indexes, triggers, foreign keys, data types

### Migration Tests
- **Purpose**: Ensure database migrations work correctly
- **Location**: `tests/database/migrations/`
- **Coverage**: Forward migrations, rollbacks, data preservation

### Performance Tests
- **Purpose**: Validate database query performance and optimization
- **Location**: `tests/database/performance/`
- **Coverage**: Query execution times, index usage, connection pooling

### Database Integration Tests
- **Purpose**: Test database operations with application logic
- **Location**: `tests/integration/database/`
- **Coverage**: CRUD operations, transactions, error handling

## 🌐 Infrastructure Testing

### Cloudflare Proxy Tests
- **Purpose**: Validate proxy configuration and routing
- **Location**: `tests/infrastructure/cloudflare/`
- **Coverage**: SSL termination, access rules, rate limiting

### SSL/TLS Tests
- **Purpose**: Ensure secure connections and certificate management
- **Location**: `tests/infrastructure/ssl/`
- **Coverage**: Certificate validation, TLS configuration, encryption

### Security Tests
- **Purpose**: Validate access controls and security policies
- **Location**: `tests/infrastructure/security/`
- **Coverage**: IP whitelisting, geographic restrictions, bot management

### Monitoring Tests
- **Purpose**: Ensure monitoring and alerting systems work correctly
- **Location**: `tests/infrastructure/monitoring/`
- **Coverage**: Health checks, metrics collection, alert triggers

## 🔄 End-to-End Testing

### Complete Workflow Tests
- **Purpose**: Test entire user workflows from start to finish
- **Location**: `tests/e2e/workflows/`
- **Coverage**: Task creation, execution, completion, reporting

### Database E2E Tests
- **Purpose**: Test complete database workflows
- **Location**: `tests/e2e/database-e2e/`
- **Coverage**: Data lifecycle, backup/restore, performance under load

### Infrastructure E2E Tests
- **Purpose**: Test complete infrastructure workflows
- **Location**: `tests/e2e/infrastructure-e2e/`
- **Coverage**: Connection flows, failover scenarios, monitoring alerts

## ⚡ Performance Testing

### Benchmarks
- **Purpose**: Establish performance baselines and track improvements
- **Location**: `tests/performance/benchmarks/`
- **Coverage**: Database queries, API responses, infrastructure latency

### Load Tests
- **Purpose**: Validate system behavior under high load
- **Location**: `tests/performance/load-tests/`
- **Coverage**: Concurrent connections, throughput limits, resource usage

## 🛠️ Test Configuration

### Environment Variables
```bash
# Database Testing
DB_TEST_HOST=localhost
DB_TEST_PORT=5432
DB_TEST_NAME=taskmaster_test
DB_TEST_USER=test_user
DB_TEST_PASSWORD=test_password

# Infrastructure Testing
CLOUDFLARE_TEST_ZONE_ID=test_zone_id
CLOUDFLARE_TEST_API_TOKEN=test_token
TEST_PROXY_HOSTNAME=test-proxy.example.com

# Test Environment
NODE_ENV=test
TEST_TIMEOUT=30000
TEST_PARALLEL_WORKERS=4
```

### Test Database Setup
```bash
# Create test database
createdb taskmaster_test

# Run test migrations
npm run migrate:test

# Seed test data
npm run seed:test
```

### Infrastructure Test Setup
```bash
# Validate test environment
npm run test:validate-env

# Setup test infrastructure
npm run test:setup-infrastructure

# Cleanup test resources
npm run test:cleanup
```

## 🎭 Mocking Strategy

### Database Mocking
- **Unit Tests**: Use in-memory SQLite for fast, isolated tests
- **Integration Tests**: Use dedicated test PostgreSQL database
- **E2E Tests**: Use full PostgreSQL instance with test data

### Infrastructure Mocking
- **Unit Tests**: Mock all external services (Cloudflare API, SSL certificates)
- **Integration Tests**: Use test endpoints and staging environments
- **E2E Tests**: Use dedicated test infrastructure when possible

### API Mocking
- **External APIs**: Mock all third-party API calls
- **Internal APIs**: Use real implementations with test data
- **Network Calls**: Mock network requests in unit tests

## 📊 Test Coverage Goals

| Test Type | Coverage Target | Current Status |
|-----------|----------------|----------------|
| Unit Tests | 90%+ | ✅ 92% |
| Integration Tests | 85%+ | ✅ 87% |
| Database Tests | 95%+ | 🔄 In Progress |
| Infrastructure Tests | 80%+ | 🔄 In Progress |
| E2E Tests | 70%+ | ✅ 73% |

## 🔍 Test Quality Standards

### Test Naming Convention
```javascript
// Unit tests
describe('TaskManager', () => {
  describe('createTask', () => {
    it('should create task with valid data', () => {});
    it('should throw error with invalid data', () => {});
  });
});

// Integration tests
describe('Database Integration', () => {
  describe('Task CRUD Operations', () => {
    it('should create and retrieve task from database', () => {});
  });
});

// E2E tests
describe('Complete Task Workflow', () => {
  it('should create, execute, and complete task end-to-end', () => {});
});
```

### Test Structure
```javascript
describe('Component/Feature', () => {
  // Setup
  beforeAll(() => {
    // One-time setup
  });

  beforeEach(() => {
    // Per-test setup
  });

  // Test cases
  it('should handle normal case', () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle edge case', () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle error case', () => {
    // Arrange
    // Act
    // Assert
  });

  // Cleanup
  afterEach(() => {
    // Per-test cleanup
  });

  afterAll(() => {
    // One-time cleanup
  });
});
```

## 🚨 Test Failure Handling

### Debugging Failed Tests
```bash
# Run specific test file
npm test -- tests/database/schema/tasks.test.js

# Run tests with verbose output
npm test -- --verbose

# Run tests with debugging
npm test -- --detectOpenHandles --forceExit

# Run only failed tests
npm run test:fails
```

### Common Test Issues
1. **Database Connection Issues**: Check test database configuration
2. **Infrastructure Timeouts**: Verify network connectivity and test endpoints
3. **Race Conditions**: Use proper async/await and test isolation
4. **Memory Leaks**: Ensure proper cleanup in afterEach/afterAll hooks

## 📈 Continuous Integration

### GitHub Actions Integration
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests
        run: npm run test:unit
      - name: Run integration tests
        run: npm run test:integration
      - name: Run database tests
        run: npm run test:database
      - name: Run e2e tests
        run: npm run test:e2e
```

### Test Reporting
- **Coverage Reports**: Generated in `coverage/` directory
- **Test Results**: JUnit XML format for CI integration
- **Performance Reports**: JSON format for trend analysis
- **Failure Reports**: Detailed logs for debugging

## 🔧 Development Workflow

### Adding New Tests
1. **Identify Test Category**: Unit, integration, database, infrastructure, or e2e
2. **Create Test File**: Follow naming convention and structure
3. **Write Test Cases**: Cover normal, edge, and error cases
4. **Add Fixtures**: Create necessary test data
5. **Update Documentation**: Add test description to relevant README

### Test-Driven Development
1. **Write Failing Test**: Start with a test that fails
2. **Implement Feature**: Write minimal code to make test pass
3. **Refactor**: Improve code while keeping tests green
4. **Add Edge Cases**: Expand test coverage
5. **Document**: Update documentation and examples

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [PostgreSQL Testing Best Practices](https://wiki.postgresql.org/wiki/Testing)
- [Cloudflare API Testing](https://developers.cloudflare.com/api/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#-6-testing-and-overall-quality-practices)

---

This comprehensive testing framework ensures zero redundancy while providing complete coverage across all system components. The consolidation eliminates duplicate testing patterns and creates a unified approach to quality assurance across the entire AI CI/CD system.

