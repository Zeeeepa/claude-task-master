# Claude Task Master Database System

A comprehensive PostgreSQL database system for managing tasks, projects, and AI-powered workflow automation.

## 🏗️ Architecture Overview

The database system is built with the following components:

- **PostgreSQL Database**: Primary data store with JSONB support for flexible schemas
- **Connection Manager**: Pooled connections with automatic retry and health monitoring
- **Migration System**: Version-controlled schema changes with rollback support
- **Model Layer**: Object-relational mapping with validation and business logic
- **Repository Pattern**: Data access layer with query optimization
- **Triggers & Functions**: Automated data integrity and workflow management

## 📊 Database Schema

### Core Tables

#### Tasks
- **Purpose**: Store task information with hierarchical relationships
- **Key Features**: JSONB fields for flexible requirements, dependencies, and acceptance criteria
- **Relationships**: Self-referencing for subtasks, foreign key to projects

#### Projects
- **Purpose**: Group related tasks and provide context
- **Key Features**: Repository integration, architectural documentation
- **Relationships**: One-to-many with tasks

#### Task Dependencies
- **Purpose**: Define blocking relationships between tasks
- **Key Features**: Circular dependency prevention, multiple dependency types
- **Relationships**: Many-to-many between tasks

#### Templates
- **Purpose**: Reusable patterns for tasks, projects, and workflows
- **Key Features**: Usage tracking, type categorization
- **Relationships**: Standalone with usage analytics

#### Execution History
- **Purpose**: Track task execution attempts and patterns
- **Key Features**: Performance metrics, error logging, success patterns
- **Relationships**: Many-to-one with tasks

#### Learning Data
- **Purpose**: AI optimization and pattern recognition
- **Key Features**: Success rate tracking, usage frequency
- **Relationships**: Standalone analytics data

### Supporting Tables

- **System Config**: Application-wide settings and feature flags
- **Schema Migrations**: Version control for database changes

## 🚀 Getting Started

### Prerequisites

- PostgreSQL 12+ with extensions:
  - `uuid-ossp` (UUID generation)
  - `pg_trgm` (Text similarity)
  - `btree_gin` (Composite indexes)

### Installation

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd claude-task-master
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Database Setup**
   ```bash
   # Create database
   createdb claude_task_master
   
   # Run migrations
   npm run db:migrate
   ```

### Environment Variables

```env
# Required
DB_HOST=localhost
DB_PORT=5432
DB_NAME=claude_task_master
DB_USER=postgres
DB_PASSWORD=your_password

# Optional
DB_SSL=false
DB_POOL_MAX=20
DB_POOL_MIN=2
NODE_ENV=development
```

## 🔧 Usage

### Database Connection

```javascript
import db from './src/database/connection.js';

// Initialize connection
await db.initialize();

// Execute query
const result = await db.query('SELECT * FROM tasks WHERE status = $1', ['backlog']);

// Use transaction
await db.transaction(async (client) => {
  await client.query('INSERT INTO tasks (title) VALUES ($1)', ['New Task']);
  await client.query('UPDATE projects SET updated_at = NOW()');
});
```

### Using Models

```javascript
import Task from './src/database/models/Task.js';
import Project from './src/database/models/Project.js';

// Create new task
const task = new Task({
  title: 'Implement feature X',
  description: 'Add new functionality',
  priority: 'high',
  status: 'backlog'
});

await task.save();

// Find and update
const existingTask = await Task.findById(taskId);
existingTask.status = 'in-progress';
await existingTask.save();

// Search tasks
const tasks = await Task.search('implement feature');
```

### Using Repositories

```javascript
import TaskRepository from './src/database/repositories/TaskRepository.js';

const taskRepo = new TaskRepository();

// Get ready tasks (no blocking dependencies)
const readyTasks = await taskRepo.findReadyTasks();

// Get task hierarchy
const hierarchy = await taskRepo.getTaskHierarchy(parentTaskId);

// Bulk operations
await taskRepo.bulkUpdateStatus([id1, id2, id3], 'done');
```

## 🔄 Migrations

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Check migration status
npm run db:status

# Rollback last migration
npm run db:rollback

# Validate migration integrity
npm run db:validate
```

### Creating Migrations

```bash
# Create new migration
npm run db:create-migration add_new_feature

# Edit the generated file
# src/database/migrations/YYYYMMDDHHMMSS_add_new_feature.js
```

### Migration Structure

```javascript
/**
 * Migration: Add New Feature
 * Created: 2025-05-30T13:54:00.000Z
 */

export async function up(client) {
  await client.query(`
    ALTER TABLE tasks 
    ADD COLUMN new_feature_field VARCHAR(100);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE tasks 
    DROP COLUMN IF EXISTS new_feature_field;
  `);
}
```

## 🧪 Testing

### Running Tests

```bash
# All database tests
npm run test:database

# Specific test files
npm test tests/database/connection.test.js
npm test tests/database/models.test.js
npm test tests/database/repositories.test.js
```

### Test Database Setup

```bash
# Create test database
createdb claude_task_master_test

# Set test environment
export NODE_ENV=test
export TEST_DB_NAME=claude_task_master_test

# Run tests
npm test
```

## 📈 Performance Optimization

### Indexes

The system includes comprehensive indexing:

- **B-tree indexes**: Primary keys, foreign keys, status fields
- **GIN indexes**: JSONB fields, full-text search
- **Composite indexes**: Multi-column queries
- **Partial indexes**: Filtered data subsets

### Query Optimization

```javascript
// Use prepared statements
const result = await db.query(
  'SELECT * FROM tasks WHERE status = $1 AND priority = $2',
  [status, priority]
);

// Leverage JSONB operators
const result = await db.query(`
  SELECT * FROM tasks 
  WHERE requirements @> $1
`, [JSON.stringify({ type: 'feature' })]);

// Use full-text search
const result = await db.query(`
  SELECT *, ts_rank(to_tsvector('english', title), plainto_tsquery('english', $1)) as rank
  FROM tasks 
  WHERE to_tsvector('english', title) @@ plainto_tsquery('english', $1)
  ORDER BY rank DESC
`, [searchTerm]);
```

### Connection Pooling

```javascript
// Pool configuration
const poolConfig = {
  max: 20,           // Maximum connections
  min: 2,            // Minimum connections
  idle: 10000,       // Idle timeout
  acquire: 60000,    // Acquire timeout
  evict: 1000        // Eviction interval
};
```

## 🛡️ Security

### Connection Security

- SSL/TLS encryption support
- Connection string validation
- Credential management via environment variables
- SQL injection prevention through parameterized queries

### Data Integrity

- Foreign key constraints
- Check constraints for data validation
- Triggers for circular dependency prevention
- Automatic timestamp management

### Access Control

```sql
-- Example role-based access
CREATE ROLE task_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO task_reader;

CREATE ROLE task_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO task_writer;
```

## 🔍 Monitoring

### Health Checks

```javascript
// Database health check
const health = await db.healthCheck();
console.log('Database healthy:', health.healthy);

// Connection pool statistics
const stats = db.getPoolStats();
console.log('Active connections:', stats.totalCount);
```

### Query Logging

```javascript
// Enable query logging
process.env.LOG_QUERIES = 'true';

// Custom logging
db.on('query', (query, duration) => {
  console.log(`Query: ${query} (${duration}ms)`);
});
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection Timeout**
   ```bash
   # Increase timeout values
   DB_CONNECTION_TIMEOUT=60000
   DB_QUERY_TIMEOUT=120000
   ```

2. **Pool Exhaustion**
   ```bash
   # Increase pool size
   DB_POOL_MAX=50
   ```

3. **Migration Failures**
   ```bash
   # Check migration status
   npm run db:status
   
   # Validate integrity
   npm run db:validate
   
   # Manual rollback if needed
   npm run db:rollback
   ```

4. **Performance Issues**
   ```sql
   -- Analyze query performance
   EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'backlog';
   
   -- Check index usage
   SELECT schemaname, tablename, indexname, idx_scan 
   FROM pg_stat_user_indexes 
   ORDER BY idx_scan DESC;
   ```

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development
LOG_LEVEL=debug
LOG_QUERIES=true
```

## 📚 API Reference

### Connection Manager

- `initialize()` - Initialize database connection
- `query(sql, params)` - Execute parameterized query
- `transaction(callback)` - Execute transaction
- `healthCheck()` - Check database health
- `getPoolStats()` - Get connection pool statistics
- `close()` - Close all connections

### Task Model

- `save()` - Create or update task
- `delete()` - Delete task
- `validate()` - Validate task data
- `getSubtasks()` - Get child tasks
- `getDependencies()` - Get task dependencies
- `getExecutionHistory()` - Get execution attempts

### Task Repository

- `create(data)` - Create new task
- `findById(id)` - Find task by ID
- `findAll(filters)` - Find tasks with filters
- `search(text)` - Full-text search
- `findReadyTasks()` - Get tasks ready for work
- `getTaskHierarchy(id)` - Get task tree

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

### Development Workflow

```bash
# Setup development environment
npm install
cp .env.example .env

# Create feature branch
git checkout -b feature/new-database-feature

# Run tests
npm test

# Create migration if needed
npm run db:create-migration feature_name

# Commit changes
git commit -m "Add new database feature"
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create new issue with detailed description
4. Include environment details and error logs

