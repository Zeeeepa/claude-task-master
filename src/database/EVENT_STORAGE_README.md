# Event Storage System - Phase 1.3

## 🎯 Overview

The Event Storage System is a comprehensive PostgreSQL-based solution for tracking all development activities in the Claude Task Master project. This system implements Phase 1.3 requirements (ZAM-853) and provides robust event logging, querying, and analytics capabilities.

## 🏗️ Architecture

### Core Components

1. **EventStore** (`event-store.js`) - Main event storage implementation
2. **EventIntegration** (`event-integration.js`) - Integration layer with existing systems
3. **Event Configuration** (`event-config.js`) - Configuration management
4. **Migration System** (`migrations/002_event_storage_system.js`) - Database schema management

### Database Schema

The system creates 5 main tables:

- `events` - General system events
- `task_events` - Task-specific tracking
- `agent_events` - Agent activity tracking
- `deployment_events` - WSL2 deployment tracking
- `event_batches` - Batch processing optimization

## 🚀 Quick Start

### 1. Development Setup

```bash
# Start PostgreSQL with Docker Compose
docker-compose -f docker-compose.event-storage.yml up -d

# Install dependencies
npm install

# The system will auto-create tables on first run
```

### 2. Basic Usage

```javascript
import { EventStore, getEventConfig } from './src/database/index.js';

// Initialize EventStore
const config = getEventConfig();
const eventStore = new EventStore(config);
await eventStore.initialize();

// Log a system event
await eventStore.logSystemEvent({
  event_type: 'user_action',
  event_name: 'login_attempt',
  user_id: 'user-123',
  data: { success: true },
  status: 'completed'
});

// Query events
const events = await eventStore.querySystemEvents({
  limit: 10,
  eventType: 'user_action'
});

// Get statistics
const stats = await eventStore.getEventStatistics();
```

### 3. Integration Usage

```javascript
import { EventIntegration } from './src/database/index.js';

// Initialize integration
const integration = new EventIntegration();
await integration.initialize();

// Automatic event capture
integration.emit('task:started', {
  id: 'task-123',
  name: 'Process Data',
  agentId: 'agent-456'
});

integration.emit('task:completed', {
  id: 'task-123',
  output: { processed: 100 }
});
```

## 📊 Event Types

### System Events
- User actions (login, logout, etc.)
- System operations
- Configuration changes
- Error events

### Task Events
- Task lifecycle (started, completed, error, cancelled)
- Input/output data tracking
- Performance metrics
- Error handling

### Agent Events
- Agent registration/unregistration
- Agent actions and tool usage
- Agent errors and recovery
- Performance tracking

### Deployment Events
- WSL2 deployment tracking
- Branch and PR information
- Build and test results
- Deployment status

## 🔧 Configuration

### Environment Variables

```bash
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=claude_task_master
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_SSL_MODE=disable

# Event Storage Configuration
EVENT_TABLE_PREFIX=claude_task_master
EVENT_BATCH_SIZE=100
EVENT_BATCH_TIMEOUT=5000
EVENT_HEALTH_MONITORING=true

# Integration Configuration
EVENT_INTEGRATION_ENABLED=true
EVENT_AUTO_CAPTURE_TASKS=true
EVENT_AUTO_CAPTURE_AGENTS=true
EVENT_AUTO_CAPTURE_DEPLOYMENTS=true
```

### Custom Configuration

```javascript
import { createEventConfig } from './src/database/index.js';

const customConfig = createEventConfig({
  database: {
    host: 'my-postgres-host',
    database: 'my_database'
  },
  eventStore: {
    tablePrefix: 'my_app_events',
    batchSize: 50
  },
  integration: {
    autoCapture: {
      deployments: false // Disable deployment tracking
    }
  }
});
```

## 📈 Performance Features

### Connection Pooling
- Configurable pool size (2-50 connections)
- Automatic connection management
- Health monitoring and recovery

### Event Batching
- Configurable batch sizes
- Timeout-based flushing
- Performance optimization

### Indexing Strategy
- Comprehensive indexes on all searchable fields
- Optimized for time-based queries
- Agent and task-specific indexes

### Health Monitoring
- Real-time connection monitoring
- Automatic reconnection logic
- Performance metrics collection

## 🔍 Querying and Analytics

### Basic Queries

```javascript
// Recent events
const recent = await eventStore.querySystemEvents({
  limit: 100,
  orderBy: 'timestamp',
  orderDirection: 'DESC'
});

// Events by agent
const agentEvents = await eventStore.querySystemEvents({
  agentId: 'agent-123',
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
});

// Events by type and status
const errorEvents = await eventStore.querySystemEvents({
  eventType: 'task_execution',
  status: 'error',
  limit: 50
});
```

### Analytics

```javascript
// Comprehensive statistics
const stats = await eventStore.getEventStatistics({
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
});

console.log('Total events:', stats.totalEvents);
console.log('Events by type:', stats.eventsByType);
console.log('Events by status:', stats.eventsByStatus);
console.log('Average duration:', stats.averageDuration);
```

## 🛠️ Development Tools

### Migration System

```javascript
import { migration002 } from './src/database/migrations/002_event_storage_system.js';

// Apply migration
await migration002.up(client, 'my_table_prefix');

// Rollback migration
await migration002.down(client, 'my_table_prefix');
```

### Examples and Testing

```javascript
import { runAllExamples } from './src/database/event-examples.js';

// Run comprehensive examples
await runAllExamples();
```

### Docker Development Environment

```bash
# Start full development environment
docker-compose -f docker-compose.event-storage.yml up -d

# Start with pgAdmin
docker-compose -f docker-compose.event-storage.yml --profile admin up -d

# Start with Redis caching
docker-compose -f docker-compose.event-storage.yml --profile cache up -d
```

## 🔒 Security Features

### Data Protection
- Parameterized queries prevent SQL injection
- JSONB validation for structured data
- Connection encryption support

### Access Control
- Database-level user permissions
- Connection pooling with authentication
- Environment-based configuration

## 📋 API Reference

### EventStore Methods

- `initialize()` - Initialize the event store
- `logSystemEvent(event)` - Log a system event
- `logTaskEvent(event)` - Log a task event
- `logAgentEvent(event)` - Log an agent event
- `logDeploymentEvent(event)` - Log a deployment event
- `querySystemEvents(options)` - Query events with filtering
- `getEventStatistics(options)` - Get comprehensive statistics
- `getHealthStatus()` - Get system health status
- `close()` - Close the event store

### EventIntegration Methods

- `initialize()` - Initialize the integration system
- `logCustomEvent(type, data)` - Log a custom event
- `queryEvents(options)` - Query events
- `getEventStatistics(options)` - Get statistics
- `getHealthStatus()` - Get health status
- `setEnabled(enabled)` - Enable/disable integration
- `close()` - Close the integration system

### Event Emitter Events

- `task:started` - Task started
- `task:completed` - Task completed
- `task:error` - Task error
- `task:cancelled` - Task cancelled
- `agent:registered` - Agent registered
- `agent:action` - Agent action
- `agent:error` - Agent error
- `agent:unregistered` - Agent unregistered
- `deployment:started` - Deployment started
- `deployment:completed` - Deployment completed
- `deployment:error` - Deployment error
- `system:event` - System event

## 🧪 Testing

### Unit Tests

```bash
# Run event storage tests
npm test -- --testPathPattern=event-storage

# Run integration tests
npm test -- --testPathPattern=event-integration
```

### Manual Testing

```javascript
// Test basic functionality
import { basicEventStoreExample } from './src/database/event-examples.js';
await basicEventStoreExample();

// Test integration
import { eventIntegrationExample } from './src/database/event-examples.js';
await eventIntegrationExample();
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection Errors**
   - Check PostgreSQL is running
   - Verify connection parameters
   - Check network connectivity

2. **Migration Errors**
   - Ensure database exists
   - Check user permissions
   - Verify PostgreSQL version (12+)

3. **Performance Issues**
   - Adjust connection pool size
   - Optimize batch settings
   - Check index usage

### Health Monitoring

```javascript
const health = await eventStore.getHealthStatus();
if (!health.isHealthy) {
  console.error('Health issues:', health.error);
}
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Driver](https://node-postgres.com/)
- [Event-Driven Architecture Patterns](https://microservices.io/patterns/data/event-driven-architecture.html)

## 🤝 Contributing

1. Follow the existing code style
2. Add comprehensive tests
3. Update documentation
4. Ensure backward compatibility
5. Test with different PostgreSQL versions

## 📄 License

This event storage system is part of the Claude Task Master project and follows the same licensing terms.

