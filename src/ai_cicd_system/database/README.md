# PostgreSQL Database Implementation

This directory contains the production-ready PostgreSQL database implementation for the Claude Task Master AI CI/CD system.

## 🏗️ Architecture Overview

```
src/ai_cicd_system/database/
├── schema/                 # SQL schema definitions
│   ├── init.sql           # Main initialization script
│   ├── tasks.sql          # Tasks table schema
│   ├── contexts.sql       # Contexts table schema
│   ├── workflows.sql      # Workflows table schema
│   └── pr_tracking.sql    # PR tracking table schema
├── models/                # Data access layer
│   ├── task_model.js      # Task CRUD operations
│   ├── context_model.js   # Context CRUD operations
│   └── workflow_model.js  # Workflow CRUD operations
├── connection/            # Connection management
│   ├── pool_manager.js    # Connection pooling
│   └── health_checker.js  # Health monitoring
└── migrations/            # Migration system
    └── migration_runner.js # Migration management
```

## 📊 Database Schema

### Tasks Table
Stores all task information with comprehensive metadata:

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]',
    acceptance_criteria JSONB DEFAULT '[]',
    complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    dependencies JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    -- ... additional fields
);
```

### Contexts Table
Stores contextual information for tasks:

```sql
CREATE TABLE contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL,
    -- ... additional fields
);
```

### Workflows Table
Manages workflow configurations and states:

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    configuration JSONB DEFAULT '{}',
    state JSONB DEFAULT '{}',
    task_ids JSONB DEFAULT '[]',
    -- ... additional fields
);
```

### PR Tracking Table
Tracks pull requests associated with tasks:

```sql
CREATE TABLE pr_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    pr_url VARCHAR(500),
    pr_number INTEGER,
    branch_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open',
    -- ... additional fields
);
```

## 🚀 Quick Start

### 1. Database Setup

```bash
# Create database
createdb codegen_taskmaster

# Create user
createuser -P software_developer
```

### 2. Environment Configuration

```bash
# Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=codegen_taskmaster
export DB_USER=software_developer
export DB_PASSWORD=your_password
export DB_SSL=false
```

### 3. Initialize Database

```javascript
import { DatabaseManager } from './core/database_manager.js';

const dbManager = new DatabaseManager({
    host: 'localhost',
    port: 5432,
    database: 'codegen_taskmaster',
    user: 'software_developer',
    password: 'your_password',
    auto_migrate: true
});

await dbManager.initialize();
```

### 4. Use TaskStorageManager

```javascript
import { TaskStorageManager } from './core/task_storage_manager.js';

const taskManager = new TaskStorageManager({
    host: 'localhost',
    port: 5432,
    database: 'codegen_taskmaster',
    user: 'software_developer',
    password: 'your_password'
});

await taskManager.initialize();

// Store a task
const taskId = await taskManager.storeAtomicTask({
    title: 'Implement feature X',
    description: 'Add new functionality',
    complexityScore: 7,
    priority: 1
}, requirement);

// Retrieve task
const task = await taskManager.retrieveTaskById(taskId);
```

## 🔧 Configuration Options

### Database Configuration

```javascript
const config = {
    // Connection settings
    host: 'localhost',
    port: 5432,
    database: 'codegen_taskmaster',
    user: 'software_developer',
    password: 'your_password',
    
    // SSL settings
    ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync('ca-certificate.crt').toString(),
        key: fs.readFileSync('client-key.key').toString(),
        cert: fs.readFileSync('client-certificate.crt').toString()
    },
    
    // Connection pool settings
    max_connections: 20,
    min_connections: 5,
    idle_timeout: 30000,
    connection_timeout: 2000,
    
    // Application settings
    enable_mock: false,
    enable_logging: true,
    log_level: 'info',
    auto_migrate: true
};
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | Database host |
| `DB_PORT` | 5432 | Database port |
| `DB_NAME` | codegen_taskmaster | Database name |
| `DB_USER` | software_developer | Database user |
| `DB_PASSWORD` | - | Database password |
| `DB_SSL` | false | SSL mode (true/false/require/prefer) |
| `DB_POOL_MAX` | 20 | Maximum pool connections |
| `DB_POOL_MIN` | 5 | Minimum pool connections |
| `DB_ENABLE_MOCK` | false | Enable mock mode |
| `DB_AUTO_MIGRATE` | false | Auto-run migrations |

## 📈 Performance Features

### Connection Pooling
- Configurable pool size (5-50 connections)
- Automatic connection recycling
- Connection health monitoring
- Graceful degradation on failures

### Query Optimization
- Proper indexing on frequently queried columns
- GIN indexes for JSONB columns
- Query performance monitoring
- Automatic query logging

### Caching Strategy
- Connection-level prepared statements
- Result caching for static data
- Efficient bulk operations
- Optimized transaction handling

## 🔍 Monitoring & Health Checks

### Health Monitoring

```javascript
// Get database health status
const health = await dbManager.getHealth();
console.log(health);
// {
//   status: 'healthy',
//   isHealthy: true,
//   responseTime: 45,
//   pool: { totalCount: 10, idleCount: 8, waitingCount: 0 },
//   metrics: { totalQueries: 1250, successfulQueries: 1248 }
// }
```

### Performance Metrics

```javascript
// Get performance metrics
const metrics = await taskManager.getTaskMetrics();
console.log(metrics);
// {
//   totalTasks: 150,
//   pendingTasks: 25,
//   completedTasks: 120,
//   avgComplexity: 6.2,
//   totalEstimatedHours: 1200,
//   totalActualHours: 1150
// }
```

## 🧪 Testing

### Unit Tests
```bash
npm test -- src/ai_cicd_system/tests/models.test.js
```

### Integration Tests
```bash
# Set up test database
export TEST_DB_NAME=codegen_taskmaster_test
export TEST_DB_USER=test_user
export TEST_DB_PASSWORD=test_password

# Run integration tests
npm test -- src/ai_cicd_system/tests/database_integration.test.js
```

### Mock Mode Testing
```bash
# Run tests in mock mode
export TEST_USE_MOCK=true
npm test
```

## 🔄 Migration System

### Running Migrations

```javascript
import { MigrationRunner } from './database/migrations/migration_runner.js';

const migrationRunner = new MigrationRunner(dbManager);
await migrationRunner.initialize();

// Run all pending migrations
const appliedMigrations = await migrationRunner.runMigrations();

// Check migration status
const status = await migrationRunner.getStatus();
console.log(status);
```

### Creating New Migrations

1. Add migration definition to `migration_runner.js`
2. Include SQL schema changes
3. Provide rollback instructions
4. Test migration thoroughly

## 🛡️ Security Features

### SQL Injection Prevention
- Parameterized queries only
- Input validation and sanitization
- Type checking for all parameters
- No dynamic SQL construction

### Access Control
- Role-based database permissions
- Connection encryption (SSL/TLS)
- Password security requirements
- Audit logging for sensitive operations

### Data Protection
- Automatic data encryption at rest
- Secure connection pooling
- Sensitive data masking in logs
- Regular security updates

## 🚨 Error Handling

### Connection Failures
- Automatic retry with exponential backoff
- Graceful fallback to mock mode
- Connection pool health monitoring
- Alert system for persistent failures

### Query Errors
- Detailed error logging
- Transaction rollback on failures
- Query timeout handling
- Performance degradation detection

### Recovery Procedures
- Automatic connection recovery
- Database failover support
- Backup and restore procedures
- Data consistency validation

## 📚 API Reference

### TaskModel

```javascript
// Create task
const task = await taskModel.create(taskData);

// Find by ID
const task = await taskModel.findById(taskId);

// Update status
const task = await taskModel.updateStatus(taskId, 'completed');

// Find by status
const tasks = await taskModel.findByStatus('pending');

// Search tasks
const tasks = await taskModel.search('search term');

// Get statistics
const stats = await taskModel.getStatistics();
```

### ContextModel

```javascript
// Create context
const context = await contextModel.create(taskId, 'ai_interaction', data);

// Find by task
const contexts = await contextModel.findByTaskId(taskId);

// Find by type
const contexts = await contextModel.findByType('validation');

// Get statistics
const stats = await contextModel.getTaskContextStats(taskId);
```

### WorkflowModel

```javascript
// Create workflow
const workflow = await workflowModel.create(workflowData);

// Add task to workflow
const workflow = await workflowModel.addTask(workflowId, taskId);

// Get progress
const progress = await workflowModel.getProgress(workflowId);

// Update status
const workflow = await workflowModel.updateStatus(workflowId, 'running');
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check PostgreSQL is running
   - Verify host/port configuration
   - Check firewall settings

2. **Authentication Failed**
   - Verify username/password
   - Check pg_hba.conf settings
   - Ensure user has proper permissions

3. **Migration Failures**
   - Check database permissions
   - Verify schema compatibility
   - Review migration logs

4. **Performance Issues**
   - Monitor connection pool usage
   - Check query performance
   - Review index usage

### Debug Mode

```javascript
const taskManager = new TaskStorageManager({
    enable_logging: true,
    log_level: 'debug'
});
```

## 📋 Best Practices

### Development
- Always use transactions for multi-table operations
- Implement proper error handling
- Use connection pooling efficiently
- Monitor query performance

### Production
- Enable SSL/TLS encryption
- Set up monitoring and alerting
- Regular backup procedures
- Performance tuning and optimization

### Testing
- Use separate test databases
- Mock external dependencies
- Test error scenarios
- Validate data integrity

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Follow security best practices
5. Test with both real and mock databases

## 📄 License

This implementation is part of the Claude Task Master project and follows the same licensing terms.

