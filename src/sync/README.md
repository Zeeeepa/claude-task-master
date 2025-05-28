# Real-time Status Synchronization System

A comprehensive real-time status synchronization system that maintains consistency across Linear, PostgreSQL, GitHub, and all CI/CD components.

## Overview

The synchronization system consists of several key components:

- **StatusSynchronizer**: Main orchestrator for coordinating synchronization
- **EventProcessor**: Handles event queuing, priority processing, and batch operations
- **WebSocketManager**: Manages real-time WebSocket connections for live updates
- **ConflictResolver**: Detects and resolves data conflicts between systems
- **StatusMapper**: Maps status values between different system formats
- **SyncMonitor**: Provides monitoring, metrics, and alerting capabilities

## Features

### Real-time Synchronization
- WebSocket connections for live updates
- Event-driven status propagation
- Bidirectional synchronization between all systems
- Conflict resolution and data consistency
- Real-time dashboard and monitoring

### Status Management
- Centralized status tracking in PostgreSQL
- Status mapping between different systems
- State transition validation and logging
- Historical status tracking and analytics
- Status rollback and recovery mechanisms

### Event Processing
- Event queue management and processing
- Priority-based event handling
- Batch processing for high-volume scenarios
- Event deduplication and ordering
- Failed event retry and recovery

## Quick Start

### Basic Usage

```javascript
import { StatusSynchronizer } from './src/sync/status-synchronizer.js';

// Initialize the synchronization system
const synchronizer = new StatusSynchronizer({
    enableRealTimeSync: true,
    syncInterval: 5000,
    systems: {
        linear: { enabled: true, priority: 1 },
        github: { enabled: true, priority: 2 },
        postgresql: { enabled: true, priority: 0 },
        agentapi: { enabled: true, priority: 3 }
    }
});

// Start the system
await synchronizer.initialize();
await synchronizer.start();

// Synchronize a status update
const statusUpdate = {
    entityId: 'task-123',
    entityType: 'task',
    status: 'completed',
    metadata: {
        completedBy: 'user-456',
        completedAt: new Date().toISOString()
    }
};

const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');
console.log('Synchronization result:', result);
```

### Advanced Configuration

```javascript
const synchronizer = new StatusSynchronizer({
    // Synchronization settings
    enableRealTimeSync: true,
    syncInterval: 5000,
    batchSize: 50,
    maxRetries: 3,
    retryDelay: 1000,
    
    // System integrations
    systems: {
        linear: { enabled: true, priority: 1 },
        github: { enabled: true, priority: 2 },
        postgresql: { enabled: true, priority: 0 },
        agentapi: { enabled: true, priority: 3 }
    },
    
    // Conflict resolution
    conflictResolution: {
        strategy: 'priority_based',
        autoResolve: true,
        escalationThreshold: 3
    },
    
    // Performance settings
    performance: {
        enableCaching: true,
        cacheTimeout: 30000,
        enableBatching: true,
        enableCompression: true
    },
    
    // Monitoring
    monitoring: {
        enableMetrics: true,
        enableAlerts: true,
        healthCheckInterval: 10000
    }
});
```

## Component Details

### StatusSynchronizer

The main orchestrator that coordinates all synchronization activities.

**Key Methods:**
- `initialize()`: Initialize the synchronization system
- `start()`: Start real-time synchronization
- `stop()`: Stop the synchronization system
- `synchronizeStatus(statusUpdate, sourceSystem)`: Synchronize status across systems
- `getHealthStatus()`: Get system health information

**Events:**
- `initialized`: System initialized successfully
- `started`: System started
- `stopped`: System stopped
- `sync:completed`: Synchronization completed successfully
- `sync:failed`: Synchronization failed
- `conflict:detected`: Conflict detected
- `conflict:resolved`: Conflict resolved

### EventProcessor

Handles event queuing and processing with priority support.

**Features:**
- Priority-based event queuing (critical, high, normal, low)
- Batch processing for efficiency
- Event deduplication
- Retry logic with exponential backoff
- Performance metrics

**Usage:**
```javascript
import { EventProcessor } from './src/sync/event-processor.js';

const processor = new EventProcessor({
    maxQueueSize: 10000,
    batchSize: 50,
    enableDeduplication: true,
    maxRetries: 3
});

await processor.initialize();
await processor.start();

// Add event to queue
const eventId = processor.addEvent({
    entityId: 'task-123',
    entityType: 'task',
    status: 'in_progress',
    source: 'linear'
}, 'high');
```

### WebSocketManager

Manages real-time WebSocket connections for live updates.

**Features:**
- Real-time bidirectional communication
- Room-based subscriptions
- Authentication and rate limiting
- Connection health monitoring
- Message broadcasting

**Usage:**
```javascript
import { WebSocketManager } from './src/sync/websocket-manager.js';

const wsManager = new WebSocketManager({
    port: 8080,
    maxConnections: 1000,
    enableAuth: true,
    enableRateLimit: true
});

await wsManager.initialize();
await wsManager.start();

// Broadcast to all clients
wsManager.broadcast({
    type: 'status_update',
    data: statusUpdate
});

// Send to specific room
wsManager.broadcast({
    type: 'task_completed',
    data: taskData
}, 'project-123');
```

### ConflictResolver

Detects and resolves conflicts between different systems.

**Resolution Strategies:**
- `priority_based`: Use system priorities to resolve conflicts
- `timestamp_based`: Last write wins
- `manual`: Require human intervention
- `merge`: Attempt to merge conflicting updates

**Usage:**
```javascript
import { ConflictResolver } from './src/sync/conflict-resolver.js';

const resolver = new ConflictResolver({
    defaultStrategy: 'priority_based',
    autoResolve: true,
    systemPriorities: {
        postgresql: 0,
        linear: 1,
        github: 2,
        agentapi: 3
    }
});

// Detect conflicts
const conflicts = await resolver.detectConflicts(statusUpdate, 'linear');

// Resolve conflicts
if (conflicts.length > 0) {
    const resolution = await resolver.resolveConflicts(conflicts, statusUpdate);
    console.log('Resolution:', resolution);
}
```

### StatusMapper

Maps status values between different system formats.

**Supported Systems:**
- PostgreSQL (canonical format)
- Linear
- GitHub
- AgentAPI

**Usage:**
```javascript
import { StatusMapper } from './src/sync/status-mapper.js';

const mapper = new StatusMapper({
    enableBidirectionalMapping: true,
    enableCustomMappings: true,
    strictMapping: false
});

// Map status between systems
const mappedStatus = await mapper.mapStatus(
    statusUpdate, 
    'linear', 
    'github'
);

// Add custom mapping
mapper.addCustomMapping(
    'linear', 
    'github', 
    'In Review', 
    'draft', 
    'status'
);
```

### SyncMonitor

Provides comprehensive monitoring and alerting.

**Metrics Tracked:**
- Sync performance and throughput
- Queue sizes and wait times
- Conflict rates and resolution
- System health and resource usage
- Error rates and availability

**Usage:**
```javascript
import { SyncMonitor } from './src/monitoring/sync-monitor.js';

const monitor = new SyncMonitor({
    enableMetrics: true,
    enableAlerts: true,
    alertThresholds: {
        syncFailureRate: 0.1,
        avgSyncTime: 5000,
        queueSize: 1000
    }
});

// Record sync event
monitor.recordSyncEvent({
    success: true,
    duration: 1500,
    conflicts: 0
});

// Get metrics
const metrics = monitor.getMetrics();
console.log('Current metrics:', metrics);
```

## Integration Examples

### Linear Integration

```javascript
// Example Linear webhook handler
app.post('/webhooks/linear', async (req, res) => {
    const { action, data } = req.body;
    
    if (action === 'update' && data.issue) {
        const statusUpdate = {
            entityId: data.issue.id,
            entityType: 'issue',
            status: data.issue.state.name,
            metadata: {
                updatedBy: data.updatedBy?.id,
                updatedAt: data.updatedAt
            }
        };
        
        await synchronizer.synchronizeStatus(statusUpdate, 'linear');
    }
    
    res.status(200).send('OK');
});
```

### GitHub Integration

```javascript
// Example GitHub webhook handler
app.post('/webhooks/github', async (req, res) => {
    const { action, pull_request } = req.body;
    
    if (action === 'closed' && pull_request.merged) {
        const statusUpdate = {
            entityId: pull_request.id.toString(),
            entityType: 'pr',
            status: 'merged',
            metadata: {
                mergedBy: pull_request.merged_by?.login,
                mergedAt: pull_request.merged_at
            }
        };
        
        await synchronizer.synchronizeStatus(statusUpdate, 'github');
    }
    
    res.status(200).send('OK');
});
```

### Database Integration

```javascript
// Example database trigger handler
async function handleDatabaseUpdate(taskId, newStatus, oldStatus) {
    const statusUpdate = {
        entityId: taskId,
        entityType: 'task',
        status: newStatus,
        previousStatus: oldStatus,
        metadata: {
            updatedAt: new Date().toISOString(),
            source: 'database'
        }
    };
    
    await synchronizer.synchronizeStatus(statusUpdate, 'postgresql');
}
```

## Monitoring and Alerting

### Health Checks

The system provides comprehensive health monitoring:

```javascript
// Get overall health status
const health = synchronizer.getHealthStatus();
console.log('System health:', health.overall);
console.log('Active syncs:', health.activeSyncs);
console.log('Queue size:', health.queueSize);

// Component-specific health
console.log('Event processor:', health.components.eventProcessor);
console.log('WebSocket manager:', health.components.websocketManager);
```

### Metrics Dashboard

Access real-time metrics through the monitoring interface:

- Sync throughput and latency
- Queue sizes and processing times
- Conflict detection and resolution rates
- System resource usage
- Error rates and availability

### Alerts

Configure alerts for various conditions:

```javascript
const monitor = new SyncMonitor({
    alertThresholds: {
        syncFailureRate: 0.1,        // 10% failure rate
        avgSyncTime: 5000,           // 5 seconds
        queueSize: 1000,             // 1000 pending syncs
        conflictRate: 0.05,          // 5% conflict rate
        memoryUsage: 0.9,            // 90% memory usage
        cpuUsage: 0.8                // 80% CPU usage
    }
});

// Listen for alerts
monitor.on('alert:created', (alert) => {
    console.warn('Alert created:', alert);
    // Send notification (email, Slack, etc.)
});
```

## Error Handling

The system includes comprehensive error handling:

### Retry Logic

```javascript
// Automatic retry with exponential backoff
const config = {
    maxRetries: 3,
    retryDelay: 1000,
    retryBackoffMultiplier: 2
};
```

### Conflict Resolution

```javascript
// Handle conflicts automatically or manually
const conflictConfig = {
    strategy: 'priority_based',
    autoResolve: true,
    escalationThreshold: 3
};
```

### Graceful Degradation

The system continues operating even when some components fail:

- Queue events when systems are unavailable
- Retry failed synchronizations
- Maintain partial functionality during outages

## Performance Optimization

### Batching

```javascript
// Process events in batches for efficiency
const processor = new EventProcessor({
    enableBatching: true,
    batchSize: 50,
    processingInterval: 1000
});
```

### Caching

```javascript
// Cache frequently accessed data
const synchronizer = new StatusSynchronizer({
    performance: {
        enableCaching: true,
        cacheTimeout: 30000
    }
});
```

### Connection Pooling

```javascript
// Manage database connections efficiently
const dbConfig = {
    pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000
    }
};
```

## Testing

### Unit Tests

```javascript
import { StatusSynchronizer } from './src/sync/status-synchronizer.js';

describe('StatusSynchronizer', () => {
    let synchronizer;
    
    beforeEach(async () => {
        synchronizer = new StatusSynchronizer({
            systems: { postgresql: { enabled: true } }
        });
        await synchronizer.initialize();
    });
    
    test('should synchronize status successfully', async () => {
        const statusUpdate = {
            entityId: 'test-123',
            entityType: 'task',
            status: 'completed'
        };
        
        const result = await synchronizer.synchronizeStatus(
            statusUpdate, 
            'postgresql'
        );
        
        expect(result.success).toBe(true);
    });
});
```

### Integration Tests

```javascript
describe('System Integration', () => {
    test('should sync between Linear and GitHub', async () => {
        // Test end-to-end synchronization
        const linearUpdate = {
            entityId: 'linear-123',
            entityType: 'issue',
            status: 'Done'
        };
        
        const result = await synchronizer.synchronizeStatus(
            linearUpdate, 
            'linear'
        );
        
        expect(result.results.github.success).toBe(true);
    });
});
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 8080 3001

CMD ["node", "src/sync/index.js"]
```

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskmaster
DB_USER=postgres
DB_PASSWORD=password

# WebSocket
WS_PORT=8080
WS_HOST=0.0.0.0

# Monitoring
MONITOR_PORT=3001
ENABLE_METRICS=true
ENABLE_ALERTS=true

# System Integration
LINEAR_API_KEY=your_linear_api_key
GITHUB_TOKEN=your_github_token
AGENT_API_URL=http://localhost:3000
```

## Troubleshooting

### Common Issues

1. **High Sync Latency**
   - Check database connection pool settings
   - Verify network connectivity between systems
   - Review batch processing configuration

2. **Conflict Resolution Failures**
   - Check system priority configuration
   - Review conflict resolution strategy
   - Verify data consistency across systems

3. **WebSocket Connection Issues**
   - Check firewall settings
   - Verify authentication configuration
   - Review connection limits

### Debug Mode

```javascript
const synchronizer = new StatusSynchronizer({
    debug: true,
    logging: {
        level: 'debug',
        enableConsole: true,
        enableFile: true
    }
});
```

### Health Checks

```bash
# Check system health
curl http://localhost:3001/health

# Check metrics
curl http://localhost:3001/metrics

# Check active alerts
curl http://localhost:3001/alerts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

