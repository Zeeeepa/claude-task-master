# Database Migrations

This directory contains database migration files for the TaskMaster AI CI/CD System.

## Migration File Naming Convention

Migration files should follow this naming pattern:
```
YYYYMMDDHHMMSS_description_of_change.sql
```

For example:
```
20250528120000_add_user_preferences_table.sql
```

## Migration File Structure

Each migration file should include:

1. **Header comments** with metadata:
```sql
-- Migration: 20250528120000_add_user_preferences_table.sql
-- Description: Add user preferences table for storing user settings
-- Created: 2025-05-28
-- Version: 20250528120000
-- @zero-downtime: true
-- @estimated-duration: 30 seconds
-- @risk-level: low
-- @dependencies: 20250527100000_create_users_table
```

2. **Migration SQL** with proper structure:
```sql
-- Create the user preferences table
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(255) NOT NULL,
    preference_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT user_preferences_unique_key UNIQUE (user_id, preference_key)
);

-- Add indexes for performance
CREATE INDEX CONCURRENTLY idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX CONCURRENTLY idx_user_preferences_key ON user_preferences(preference_key);
```

## Rollback Files

For each migration, create a corresponding rollback file:
```
20250528120000_add_user_preferences_table_rollback.sql
```

Rollback file example:
```sql
-- Rollback: 20250528120000_add_user_preferences_table_rollback.sql
-- Description: Rollback for adding user preferences table
-- Created: 2025-05-28
-- Version: 20250528120000

-- Drop indexes first
DROP INDEX IF EXISTS idx_user_preferences_key;
DROP INDEX IF EXISTS idx_user_preferences_user_id;

-- Drop the table
DROP TABLE IF EXISTS user_preferences;
```

## Migration Metadata

Use these metadata annotations in your migration files:

- `@zero-downtime: true/false` - Whether the migration can run without downtime
- `@estimated-duration: <time>` - Expected execution time
- `@risk-level: low/medium/high` - Risk assessment
- `@dependencies: <version1>,<version2>` - Required previous migrations

## Best Practices

### 1. Zero-Downtime Migrations

For production environments, prefer zero-downtime migrations:

- Use `CREATE INDEX CONCURRENTLY` instead of `CREATE INDEX`
- Add columns with default values in separate steps
- Use `ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL` carefully
- Consider using feature flags for schema changes

### 2. Backward Compatibility

- Don't drop columns immediately - mark as deprecated first
- Don't rename columns - add new column and migrate data
- Use views for complex schema changes
- Test rollbacks thoroughly

### 3. Performance Considerations

- Add indexes concurrently to avoid blocking
- Use `ANALYZE` after large data changes
- Consider partitioning for large tables
- Monitor query performance impact

### 4. Data Safety

- Always backup before major changes
- Use transactions for data migrations
- Validate data integrity after migrations
- Test on staging environment first

## Migration Commands

### Run Migrations
```bash
# Run all pending migrations
node scripts/migrate.js up

# Run with auto-confirmation
node scripts/migrate.js up --yes

# Skip backup creation
node scripts/migrate.js up --skip-backup
```

### Check Status
```bash
# Show migration status
node scripts/migrate.js status

# Show health report
node scripts/migrate.js health
```

### Rollback
```bash
# Safe rollback of last migration
node scripts/rollback.js safe

# Rollback specific number of migrations
node scripts/rollback.js safe --count 3

# Rollback to specific version
node scripts/rollback.js to-version 20250527100000

# Dry run (simulation)
node scripts/rollback.js dry-run
```

### Create New Migration
```bash
# Create new migration
node scripts/migrate.js create "add user preferences table"

# Create with metadata
node scripts/migrate.js create "add user preferences table" \
  --zero-downtime \
  --estimated-duration "30 seconds" \
  --risk-level low
```

### Validation
```bash
# Validate all migrations
node scripts/migrate.js validate
```

## Emergency Procedures

### Emergency Rollback
```bash
# Emergency rollback to last known good state
node scripts/rollback.js emergency
```

### Backup Management
```bash
# List available backups
node scripts/rollback.js list-backups

# Restore from specific backup
node scripts/rollback.js restore <backup-id>
```

## Troubleshooting

### Common Issues

1. **Migration Timeout**
   - Increase timeout in configuration
   - Break large migrations into smaller chunks
   - Use concurrent operations where possible

2. **Lock Conflicts**
   - Check for long-running queries
   - Consider maintenance windows
   - Use advisory locks for coordination

3. **Rollback Failures**
   - Check rollback script syntax
   - Verify data dependencies
   - Use emergency rollback if needed

### Getting Help

- Check migration logs in the database
- Use health monitoring for system status
- Review migration validation results
- Contact database administrator for complex issues

## Configuration

Migration behavior can be configured through environment variables:

```bash
# Pool configuration
DB_POOL_MIN=5
DB_POOL_MAX=20

# Migration settings
DB_MIGRATIONS_DIR=./migrations
DB_MIGRATION_TIMEOUT=300000

# Monitoring
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000

# Backup settings
DB_BACKUP_ENABLED=true
DB_BACKUP_RETENTION_DAYS=30
```

See `config/pool_config.js` for complete configuration options.

