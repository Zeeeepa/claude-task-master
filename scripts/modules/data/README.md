# Unified Data Management Layer

This directory contains the consolidated data management and persistence layer for the claude-task-master application. It provides a unified interface for all data operations, eliminating redundancy and improving maintainability.

## Architecture Overview

The data management layer follows a repository pattern with the following key components:

```
data/
├── DataManager.js          # Central coordinator for all data operations
├── repositories/           # Data access layer
│   ├── BaseRepository.js   # Abstract base class for repositories
│   ├── JsonRepository.js   # JSON file operations with caching
│   └── TaskRepository.js   # Task-specific operations
├── cache/                  # Caching layer
│   └── CacheManager.js     # In-memory caching with TTL
├── validation/             # Data validation layer
│   └── ValidationManager.js # Zod-based validation
└── utils-migration.js      # Migration utilities for backward compatibility
```

## Key Features

### 🚀 **Unified Data Access**
- Single point of entry for all data operations
- Consistent error handling and logging
- Automatic caching with TTL support
- Comprehensive validation using Zod schemas

### 🔄 **Repository Pattern**
- Abstract base repository for consistent interfaces
- Specialized repositories for different data types
- Extensible architecture for future data sources

### ⚡ **Performance Optimization**
- In-memory caching with configurable TTL
- Automatic cache invalidation
- Lazy loading and cleanup mechanisms

### 🛡️ **Data Validation**
- Centralized validation using Zod schemas
- Type-safe data operations
- Comprehensive error reporting

### 🔧 **Transaction Support**
- Atomic operations for complex updates
- Automatic rollback on failures
- Consistent state management

## Usage Examples

### Basic Data Operations

```javascript
import { getDataManager } from './DataManager.js';

const dataManager = getDataManager();

// Read JSON file
const data = await dataManager.readJson('/path/to/file.json');

// Write JSON file with validation
await dataManager.writeJson('/path/to/file.json', data, { schema: 'config' });

// Check if file exists
const exists = dataManager.json().exists('/path/to/file.json');
```

### Task Operations

```javascript
// Read all tasks
const tasksData = await dataManager.readTasks('/path/to/tasks.json');

// Add a new task
const newTask = await dataManager.addTask('/path/to/tasks.json', {
  title: 'New Task',
  description: 'Task description',
  priority: 'high'
});

// Update a task
const updatedTask = await dataManager.updateTask('/path/to/tasks.json', 1, {
  status: 'done'
});

// Get task by ID
const task = await dataManager.getTask('/path/to/tasks.json', 1);
```

### Advanced Operations

```javascript
// Create a transaction for atomic operations
const transaction = dataManager.createTransaction();

transaction.addOperation(async () => {
  return await dataManager.addTask('/path/to/tasks.json', taskData);
}, async () => {
  // Rollback operation
  await dataManager.deleteTask('/path/to/tasks.json', taskId);
});

transaction.addOperation(async () => {
  return await dataManager.updateTask('/path/to/tasks.json', 2, updates);
});

// Execute all operations atomically
const results = await transaction.execute();
```

### Validation

```javascript
// Validate data against schema
const validation = dataManager.validate(taskData, 'task');
if (!validation.success) {
  console.error('Validation failed:', validation.error);
}

// Register custom schema
dataManager.validation().registerSchema('customSchema', zodSchema);
```

### Caching

```javascript
// Clear all caches
dataManager.clearCache();

// Get cache statistics
const cacheStats = dataManager.cache().getStats();
console.log(`Cache hit rate: ${cacheStats.hitRate}%`);

// Get specific cache entry info
const entryInfo = dataManager.cache().getEntryInfo('cache-key');
```

## Migration Guide

### From Direct Filesystem Operations

**Before:**
```javascript
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/path/to/file.json', 'utf8'));
fs.writeFileSync('/path/to/file.json', JSON.stringify(data, null, 2));
```

**After:**
```javascript
import { getDataManager } from './data/DataManager.js';

const dataManager = getDataManager();
const data = await dataManager.readJson('/path/to/file.json');
await dataManager.writeJson('/path/to/file.json', data);
```

### From utils.js readJSON/writeJSON

**Before:**
```javascript
import { readJSON, writeJSON } from './utils.js';

const data = readJSON('/path/to/file.json');
writeJSON('/path/to/file.json', data);
```

**After:**
```javascript
import { readJSONAsync, writeJSONAsync } from './data/utils-migration.js';

const data = await readJSONAsync('/path/to/file.json');
await writeJSONAsync('/path/to/file.json', data);
```

## Configuration

The DataManager can be configured with various options:

```javascript
const dataManager = new DataManager({
  enableCache: true,
  cacheOptions: {
    maxSize: 1000,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    cleanupInterval: 60 * 1000  // 1 minute
  },
  enableValidation: true
});
```

## Schemas

The validation manager comes with pre-registered schemas:

- `task` - Individual task validation
- `tasks` - Tasks collection validation
- `subtask` - Subtask validation
- `config` - Configuration validation
- `modelConfig` - Model configuration validation
- `supportedModels` - Supported models validation
- `aiTaskData` - AI task data validation
- `dependency` - Task dependency validation

### Custom Schema Registration

```javascript
import { z } from 'zod';

const customSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number()
});

dataManager.validation().registerSchema('custom', customSchema);
```

## Error Handling

All operations include comprehensive error handling:

```javascript
try {
  const data = await dataManager.readJson('/path/to/file.json');
} catch (error) {
  console.error('Operation failed:', error.message);
  console.error('Repository:', error.repository);
  console.error('Operation:', error.operation);
  console.error('Path:', error.path);
}
```

## Performance Monitoring

Monitor data layer performance:

```javascript
// Get comprehensive statistics
const stats = dataManager.getStats();
console.log('Repositories:', stats.repositories);
console.log('Cache hit rate:', stats.cache.hitRate);
console.log('Validation schemas:', stats.validation.registeredSchemas);

// Health check
const health = await dataManager.healthCheck();
console.log('System health:', health.status);
```

## Testing

The data layer includes comprehensive test coverage:

```bash
# Run data layer tests
npm test -- tests/unit/data/

# Run specific test file
npm test -- tests/unit/data/DataManager.test.js
```

## Best Practices

### 1. Use Async Operations
Always use async/await for data operations to ensure proper error handling and performance.

### 2. Validate Data
Use schemas to validate data before persistence to ensure data integrity.

### 3. Handle Errors Gracefully
Implement proper error handling for all data operations.

### 4. Use Transactions for Complex Operations
Use transactions when performing multiple related operations to ensure consistency.

### 5. Monitor Performance
Regularly check cache statistics and health status to optimize performance.

### 6. Clean Up Resources
Always call `destroy()` when shutting down to clean up resources properly.

## Troubleshooting

### Common Issues

**Cache Memory Usage**
If cache memory usage is high, consider:
- Reducing `maxSize` in cache options
- Decreasing `defaultTtl` for faster expiration
- Calling `clearCache()` periodically

**Validation Errors**
For validation failures:
- Check schema definitions
- Verify data structure matches schema
- Use partial schemas for updates

**Performance Issues**
For slow operations:
- Check cache hit rates
- Monitor file system performance
- Consider reducing validation complexity

### Debug Mode

Enable debug logging to troubleshoot issues:

```javascript
import { log } from '../utils.js';

// The data layer automatically logs debug information
// when the debug flag is enabled in config-manager.js
```

## Future Enhancements

The data layer is designed to be extensible:

- **Database Support**: Add database repositories (PostgreSQL, MongoDB, etc.)
- **Remote Storage**: Support for cloud storage providers
- **Encryption**: Add encryption for sensitive data
- **Compression**: Implement data compression for large files
- **Replication**: Add data replication and synchronization
- **Metrics**: Enhanced performance metrics and monitoring

## Contributing

When contributing to the data layer:

1. Follow the repository pattern for new data sources
2. Add comprehensive tests for new functionality
3. Update schemas for new data structures
4. Maintain backward compatibility
5. Document all public APIs

## API Reference

### DataManager

The main entry point for all data operations.

#### Methods

- `getRepository(name)` - Get repository by name
- `registerRepository(name, repository)` - Register custom repository
- `json()` - Get JSON repository
- `tasks()` - Get task repository
- `cache()` - Get cache manager
- `validation()` - Get validation manager
- `readJson(path, options)` - Read JSON file
- `writeJson(path, data, options)` - Write JSON file
- `validate(data, schema)` - Validate data
- `clearCache()` - Clear all caches
- `getStats()` - Get statistics
- `healthCheck()` - Perform health check
- `createTransaction()` - Create transaction
- `destroy()` - Clean up resources

### JsonRepository

Repository for JSON file operations.

#### Methods

- `read(path, options)` - Read JSON file
- `write(path, data, options)` - Write JSON file
- `exists(path)` - Check if file exists
- `delete(path)` - Delete file
- `update(path, updates, options)` - Update specific fields
- `append(path, item, options)` - Append to JSON array
- `backup(path, backupPath)` - Create backup
- `getStats(path)` - Get file statistics

### TaskRepository

Specialized repository for task operations.

#### Methods

- `readTasks(path, options)` - Read tasks file
- `writeTasks(path, data, options)` - Write tasks file
- `getTaskById(path, id)` - Get task by ID
- `addTask(path, data)` - Add new task
- `updateTask(path, id, updates)` - Update task
- `deleteTask(path, id)` - Delete task
- `getTasksByStatus(path, status)` - Get tasks by status
- `addDependency(path, taskId, depId)` - Add dependency
- `addSubtask(path, taskId, data)` - Add subtask
- `getTaskStats(path)` - Get task statistics

### CacheManager

In-memory caching with TTL support.

#### Methods

- `get(key)` - Get cached value
- `set(key, value, ttl)` - Set cached value
- `has(key)` - Check if key exists
- `delete(key)` - Delete cached value
- `clear()` - Clear all cache
- `getStats()` - Get cache statistics
- `cleanup()` - Clean expired entries

### ValidationManager

Zod-based validation manager.

#### Methods

- `registerSchema(name, schema)` - Register schema
- `getSchema(name)` - Get schema by name
- `validate(data, schema)` - Validate data
- `isValid(data, schema)` - Check if data is valid
- `getSchemaNames()` - Get all schema names

