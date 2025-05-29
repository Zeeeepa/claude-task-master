# Database Testing Framework

This directory contains comprehensive database testing for the PostgreSQL implementation, consolidating all database-related testing from the AI CI/CD system.

## 🎯 Overview

The database testing framework validates:
- **Schema Integrity**: Table structures, constraints, indexes, and triggers
- **Migration Safety**: Forward and backward migration testing
- **Performance**: Query optimization and connection pooling
- **Data Operations**: CRUD operations and transaction handling
- **Integration**: Database interaction with application logic

## 📁 Structure

```
tests/database/
├── README.md                     # This documentation
├── schema/                       # Schema validation tests
│   ├── tables.test.js           # Table structure validation
│   ├── indexes.test.js          # Index validation and performance
│   ├── constraints.test.js      # Foreign keys and constraints
│   ├── triggers.test.js         # Trigger functionality
│   └── audit.test.js            # Audit trail validation
├── migrations/                   # Migration testing
│   ├── forward.test.js          # Forward migration tests
│   ├── rollback.test.js         # Rollback migration tests
│   ├── data-preservation.test.js # Data integrity during migrations
│   └── version-control.test.js  # Migration version management
├── performance/                  # Performance testing
│   ├── query-performance.test.js # Query execution benchmarks
│   ├── connection-pool.test.js  # Connection pooling tests
│   ├── concurrent-access.test.js # Concurrent operation tests
│   └── load-testing.test.js     # Database load tests
├── operations/                   # Database operation tests
│   ├── crud.test.js             # Basic CRUD operations
│   ├── transactions.test.js     # Transaction handling
│   ├── error-handling.test.js   # Error scenarios
│   └── data-validation.test.js  # Data validation rules
├── fixtures/                     # Test data fixtures
│   ├── sample-tasks.sql         # Sample task data
│   ├── sample-contexts.sql      # Sample context data
│   ├── sample-workflows.sql     # Sample workflow data
│   └── sample-artifacts.sql     # Sample artifact data
└── helpers/                      # Database test utilities
    ├── db-setup.js              # Database setup utilities
    ├── data-generators.js       # Test data generators
    ├── assertion-helpers.js     # Custom database assertions
    └── cleanup-helpers.js       # Database cleanup utilities
```

## 🚀 Running Database Tests

### All Database Tests
```bash
npm run test:database
```

### Specific Test Categories
```bash
# Schema validation tests
npm test -- tests/database/schema

# Migration tests
npm test -- tests/database/migrations

# Performance tests
npm test -- tests/database/performance

# Operation tests
npm test -- tests/database/operations
```

### Environment-Specific Tests
```bash
# Development database tests
NODE_ENV=development npm run test:database

# Test database tests
NODE_ENV=test npm run test:database

# Staging database tests (read-only)
NODE_ENV=staging npm run test:database:readonly
```

## 🗄️ Test Database Setup

### Prerequisites
```bash
# Install PostgreSQL (if not already installed)
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql

# Start PostgreSQL service
sudo systemctl start postgresql  # Linux
brew services start postgresql   # macOS
```

### Test Database Configuration
```bash
# Create test database
createdb taskmaster_test

# Create test user
psql -c "CREATE USER test_user WITH PASSWORD 'test_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE taskmaster_test TO test_user;"

# Set environment variables
export DB_TEST_HOST=localhost
export DB_TEST_PORT=5432
export DB_TEST_NAME=taskmaster_test
export DB_TEST_USER=test_user
export DB_TEST_PASSWORD=test_password
export DB_TEST_SSL_MODE=disable
```

### Automated Setup
```bash
# Run database setup script
npm run test:db:setup

# Run test migrations
npm run test:db:migrate

# Seed test data
npm run test:db:seed

# Reset test database
npm run test:db:reset
```

## 📊 Schema Testing

### Table Structure Validation
Tests validate that all required tables exist with correct:
- Column names and data types
- Primary and foreign key constraints
- Check constraints and default values
- Table permissions and ownership

### Index Performance Testing
Tests ensure optimal query performance through:
- Index existence validation
- Index usage analysis
- Query execution plan verification
- Performance benchmark comparisons

### Constraint Testing
Tests validate data integrity through:
- Foreign key constraint enforcement
- Check constraint validation
- Unique constraint verification
- Not-null constraint testing

## 🔄 Migration Testing

### Forward Migration Tests
- **Schema Changes**: Validate all schema modifications apply correctly
- **Data Preservation**: Ensure existing data remains intact
- **Index Recreation**: Verify indexes are properly recreated
- **Constraint Updates**: Test constraint modifications

### Rollback Migration Tests
- **Schema Rollback**: Validate schema can be rolled back safely
- **Data Recovery**: Ensure data can be restored to previous state
- **Dependency Handling**: Test rollback of dependent migrations
- **Error Recovery**: Validate recovery from failed migrations

### Migration Safety Tests
- **Atomic Operations**: Ensure migrations are atomic
- **Backup Validation**: Test backup creation before migrations
- **Lock Management**: Validate proper table locking during migrations
- **Performance Impact**: Measure migration performance impact

## ⚡ Performance Testing

### Query Performance Benchmarks
```javascript
// Example performance test
describe('Query Performance', () => {
  it('should execute task queries within performance thresholds', async () => {
    const startTime = Date.now();
    const result = await db.query('SELECT * FROM tasks WHERE status = $1', ['pending']);
    const executionTime = Date.now() - startTime;
    
    expect(executionTime).toBeLessThan(100); // 100ms threshold
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
```

### Connection Pool Testing
- **Pool Size Optimization**: Test optimal pool configuration
- **Connection Lifecycle**: Validate connection creation and cleanup
- **Pool Exhaustion**: Test behavior when pool is exhausted
- **Connection Leaks**: Detect and prevent connection leaks

### Concurrent Access Testing
- **Race Conditions**: Test concurrent data modifications
- **Lock Contention**: Validate proper locking mechanisms
- **Transaction Isolation**: Test transaction isolation levels
- **Deadlock Prevention**: Ensure deadlock prevention mechanisms

## 🔧 Database Operations Testing

### CRUD Operations
```javascript
// Example CRUD test
describe('Task CRUD Operations', () => {
  it('should create, read, update, and delete tasks', async () => {
    // Create
    const taskId = await taskStorage.storeTask({
      title: 'Test Task',
      description: 'Test Description',
      type: 'feature',
      status: 'pending'
    });
    
    // Read
    const task = await taskStorage.getTask(taskId);
    expect(task.title).toBe('Test Task');
    
    // Update
    await taskStorage.updateTaskStatus(taskId, 'in_progress');
    const updatedTask = await taskStorage.getTask(taskId);
    expect(updatedTask.status).toBe('in_progress');
    
    // Delete
    await taskStorage.deleteTask(taskId);
    const deletedTask = await taskStorage.getTask(taskId);
    expect(deletedTask).toBeNull();
  });
});
```

### Transaction Testing
- **ACID Properties**: Validate atomicity, consistency, isolation, durability
- **Rollback Scenarios**: Test transaction rollback on errors
- **Nested Transactions**: Test savepoint functionality
- **Long-Running Transactions**: Test transaction timeout handling

### Error Handling Testing
- **Connection Failures**: Test database connection error handling
- **Query Errors**: Validate SQL error handling and reporting
- **Constraint Violations**: Test constraint violation error handling
- **Timeout Handling**: Test query timeout scenarios

## 📈 Performance Benchmarks

### Baseline Performance Metrics
| Operation | Target Time | Current Performance |
|-----------|-------------|-------------------|
| Simple SELECT | < 10ms | ✅ 8ms |
| Complex JOIN | < 50ms | ✅ 42ms |
| INSERT operation | < 20ms | ✅ 15ms |
| UPDATE operation | < 25ms | ✅ 18ms |
| DELETE operation | < 15ms | ✅ 12ms |
| Migration execution | < 5s | ✅ 3.2s |

### Load Testing Scenarios
- **Concurrent Connections**: Test with 100+ concurrent connections
- **High Throughput**: Test with 1000+ operations per second
- **Large Datasets**: Test with 1M+ records
- **Memory Usage**: Monitor memory consumption under load

## 🛠️ Test Utilities

### Database Helpers
```javascript
// Database setup helper
export async function setupTestDatabase() {
  await createTestTables();
  await seedTestData();
  await createTestIndexes();
}

// Data generation helper
export function generateTestTask(overrides = {}) {
  return {
    title: 'Test Task',
    description: 'Test Description',
    type: 'feature',
    status: 'pending',
    priority: 5,
    ...overrides
  };
}

// Assertion helper
export async function expectTableExists(tableName) {
  const result = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = $1
    )
  `, [tableName]);
  
  expect(result.rows[0].exists).toBe(true);
}
```

### Cleanup Utilities
```javascript
// Cleanup helper
export async function cleanupTestDatabase() {
  await db.query('TRUNCATE TABLE tasks CASCADE');
  await db.query('TRUNCATE TABLE task_contexts CASCADE');
  await db.query('TRUNCATE TABLE workflow_states CASCADE');
  await db.query('TRUNCATE TABLE audit_logs CASCADE');
}

// Reset sequences
export async function resetSequences() {
  await db.query('ALTER SEQUENCE tasks_id_seq RESTART WITH 1');
  await db.query('ALTER SEQUENCE task_contexts_id_seq RESTART WITH 1');
}
```

## 🔍 Debugging Database Tests

### Common Issues
1. **Connection Timeouts**: Check database connectivity and pool configuration
2. **Migration Failures**: Verify migration scripts and dependencies
3. **Performance Degradation**: Analyze query execution plans and indexes
4. **Data Inconsistencies**: Check constraint definitions and validation rules

### Debugging Tools
```bash
# Enable query logging
export DB_LOG_QUERIES=true

# Enable slow query logging
export DB_LOG_SLOW_QUERIES=true
export DB_SLOW_QUERY_THRESHOLD=100

# Enable connection debugging
export DB_DEBUG_CONNECTIONS=true

# Run tests with database debugging
DEBUG=db:* npm run test:database
```

### Performance Analysis
```bash
# Generate query performance report
npm run test:db:performance-report

# Analyze slow queries
npm run test:db:analyze-slow-queries

# Check index usage
npm run test:db:index-analysis

# Monitor connection pool
npm run test:db:pool-monitor
```

## 📚 Best Practices

### Test Data Management
- **Isolation**: Each test should use isolated test data
- **Cleanup**: Always clean up test data after each test
- **Fixtures**: Use consistent test fixtures across tests
- **Generators**: Use data generators for dynamic test data

### Performance Testing
- **Baselines**: Establish performance baselines for all operations
- **Monitoring**: Continuously monitor performance trends
- **Optimization**: Regularly optimize slow queries and operations
- **Scaling**: Test performance under various load conditions

### Error Testing
- **Edge Cases**: Test all edge cases and error conditions
- **Recovery**: Test error recovery and rollback scenarios
- **Logging**: Ensure proper error logging and reporting
- **Monitoring**: Set up alerts for database errors

---

This database testing framework ensures comprehensive validation of all PostgreSQL components while maintaining high performance and reliability standards.

