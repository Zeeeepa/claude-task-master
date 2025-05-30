# 🗄️ Database Layer - Unified CI/CD Orchestration System

This directory contains the complete PostgreSQL database implementation for the Unified CI/CD Orchestration System, replacing the file-based storage with a robust, scalable database solution.

## 📋 Overview

The database layer provides:
- **Comprehensive Schema**: All tables, relationships, and constraints
- **Performance Optimization**: Indexes, triggers, and materialized views
- **Data Migration**: Tools to migrate from file-based storage
- **Monitoring & Analytics**: Performance metrics and system health tracking
- **Template Management**: Reusable code patterns and configurations

## 🏗️ Architecture

### Core Tables
- **Projects**: Central project management and configuration
- **Workflows**: Task orchestration and progress tracking
- **Tasks**: Individual work items with dependency management
- **Task Dependencies**: Explicit relationship management

### Component Integration
- **Components**: System component registry and health monitoring
- **Component Communications**: Inter-component message tracking
- **Events**: System-wide event logging and tracing

### Templates & Learning
- **Templates**: Reusable code patterns and configurations
- **Template Usage History**: Usage tracking and effectiveness metrics
- **Execution History**: Detailed operation logs
- **Learning Data**: AI pattern recognition and optimization
- **Knowledge Base**: Centralized documentation and best practices

### Performance Monitoring
- **Performance Metrics**: Time-series component metrics
- **System Health**: Real-time health status and resource utilization
- **Workflow Analytics**: Calculated workflow performance metrics
- **Task Analytics**: Individual task performance analysis
- **Alerts**: System notifications and issue tracking

## 🚀 Quick Start

### Prerequisites
- PostgreSQL 14+ installed and running
- Node.js 18+ for migration scripts
- Environment variable `DATABASE_URL` set

### Installation

1. **Install dependencies**:
   ```bash
   cd database
   npm install
   ```

2. **Set up database**:
   ```bash
   # Set your database connection string
   export DATABASE_URL="postgresql://username:password@localhost:5432/taskmaster"
   
   # Run complete setup (migrations + seed data)
   npm run setup
   ```

3. **Migrate existing data** (optional):
   ```bash
   # Migrate from file-based storage
   npm run migrate
   ```

4. **Verify installation**:
   ```bash
   npm run verify
   ```

## 📁 Directory Structure

```
database/
├── schema/                 # SQL schema definitions
│   ├── 01_core_tables.sql
│   ├── 02_component_integration.sql
│   ├── 03_templates_learning.sql
│   ├── 04_performance_monitoring.sql
│   └── complete_schema.sql
├── migrations/             # Database migrations
│   ├── 001_initial_schema.sql
│   └── 002_indexes_and_triggers.sql
├── seeds/                  # Initial data
│   └── 001_initial_components.sql
├── lib/                    # Database access layer
│   └── DatabaseManager.js
├── scripts/                # Utility scripts
│   ├── setup_database.js
│   └── migrate_from_files.js
├── package.json
└── README.md
```

## 🔧 Usage

### DatabaseManager Class

```javascript
import DatabaseManager from './lib/DatabaseManager.js';

const db = new DatabaseManager(process.env.DATABASE_URL);

// Create a project
const project = await db.createProject({
    name: 'My Project',
    description: 'Project description',
    repository_url: 'https://github.com/user/repo'
});

// Create a workflow
const workflow = await db.createWorkflow({
    project_id: project.id,
    name: 'Development Workflow',
    requirements: 'Build and deploy application'
});

// Create tasks
const task = await db.createTask({
    workflow_id: workflow.id,
    title: 'Implement feature X',
    description: 'Detailed task description',
    priority: 8,
    estimated_effort: 4
});

// Record metrics
await db.recordMetric(
    'codegen-generator',
    'files_generated',
    150,
    'count'
);

// Close connection
await db.close();
```

### Available Scripts

```bash
# Database setup and management
npm run setup          # Complete database setup
npm run reset          # Reset database (WARNING: Destructive!)
npm run verify         # Verify database setup
npm run migrate        # Migrate from file-based storage
npm run seed           # Apply seed data only

# Development
npm test               # Run tests
```

## 📊 Schema Details

### Key Features

1. **UUID Primary Keys**: All tables use UUIDs for better distribution and security
2. **JSONB Fields**: Flexible metadata storage with indexing support
3. **Audit Trails**: Automatic timestamp tracking with triggers
4. **Referential Integrity**: Proper foreign key constraints
5. **Performance Indexes**: Optimized for common query patterns
6. **Full-Text Search**: Knowledge base content searchability

### Relationships

```mermaid
graph TD
    A[Projects] --> B[Workflows]
    B --> C[Tasks]
    C --> D[Task Dependencies]
    C --> E[Task Analytics]
    B --> F[Workflow Analytics]
    G[Components] --> H[Component Communications]
    G --> I[System Health]
    J[Templates] --> K[Template Usage History]
    L[Events] --> B
    L --> C
    M[Performance Metrics] --> B
    M --> C
```

## 🔍 Monitoring & Analytics

### Performance Metrics
- Component-level metrics collection
- Time-series data with automatic retention
- Real-time dashboards support
- Anomaly detection capabilities

### System Health
- Component health monitoring
- Resource utilization tracking
- Automated alerting
- Performance baselines

### Analytics
- Workflow efficiency analysis
- Task completion patterns
- Component performance trends
- Optimization recommendations

## 🛠️ Migration Guide

### From File-Based Storage

The migration script automatically:
1. Creates a default project for migrated data
2. Converts tasks.json to database records
3. Preserves task relationships and dependencies
4. Migrates configuration settings
5. Generates a detailed migration report

```bash
# Run migration
npm run migrate

# Check migration report
cat migration_report.json
```

### Migration Mapping

| File-Based | Database |
|------------|----------|
| tasks.json | tasks table |
| .taskmasterconfig | project settings |
| Task files | task metadata |
| Dependencies array | task_dependencies table |

## 🔒 Security Considerations

1. **Connection Security**: Use SSL connections in production
2. **Access Control**: Implement role-based database access
3. **Data Encryption**: Encrypt sensitive data in JSONB fields
4. **Audit Logging**: Enable PostgreSQL audit logging
5. **Backup Strategy**: Regular automated backups

## 📈 Performance Optimization

### Indexing Strategy
- Composite indexes for common query patterns
- GIN indexes for JSONB field searches
- Partial indexes for filtered queries
- Time-series optimization for metrics

### Query Optimization
- Materialized views for complex analytics
- Partitioning for large tables
- Connection pooling
- Query plan analysis

### Monitoring
- Query performance tracking
- Index usage analysis
- Connection pool monitoring
- Resource utilization alerts

## 🧪 Testing

```bash
# Run database tests
npm test

# Test specific functionality
node --test tests/database-manager.test.js
```

## 📝 Contributing

1. **Schema Changes**: Add new migrations, don't modify existing ones
2. **Indexing**: Consider performance impact of new indexes
3. **Documentation**: Update README for new features
4. **Testing**: Add tests for new functionality

## 🔗 Integration

### With Main Application

```javascript
// In your main application
import DatabaseManager from './database/lib/DatabaseManager.js';

const db = new DatabaseManager(process.env.DATABASE_URL);

// Use throughout your application
export default db;
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://username:password@host:port/database

# Optional
DB_POOL_SIZE=20
DB_TIMEOUT=30000
DB_SSL=true
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Library](https://node-postgres.com/)
- [Database Design Best Practices](https://www.postgresql.org/docs/current/ddl-best-practices.html)
- [Performance Tuning Guide](https://wiki.postgresql.org/wiki/Performance_Optimization)

## 🆘 Troubleshooting

### Common Issues

1. **Connection Errors**: Check DATABASE_URL and PostgreSQL service
2. **Migration Failures**: Ensure database permissions and clean state
3. **Performance Issues**: Analyze query plans and index usage
4. **Data Integrity**: Check foreign key constraints and triggers

### Support

For issues and questions:
1. Check the troubleshooting section
2. Review PostgreSQL logs
3. Create an issue in the repository
4. Contact the development team

---

**Note**: This database layer is designed for production use with proper monitoring, backup, and security measures in place.

