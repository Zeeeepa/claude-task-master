# Task Master Core Orchestrator

## 🎯 Overview

The Task Master Core Orchestrator is the central coordination hub for the Task Master system. It implements Phase 1.2 of the architecture restructuring, providing:

- **Component Lifecycle Management**: Manages initialization, monitoring, and shutdown of all system components
- **Event-Driven Architecture**: Implements a robust event system for loose coupling and scalability
- **Enhanced Task Management**: Preserves existing functionality while adding new event-driven capabilities
- **Health Monitoring**: Comprehensive health checks and alerting for all components
- **Configuration Management**: Unified configuration system with environment variable support

## 🏗️ Architecture

```
Task Master Orchestrator
├── Core Orchestrator (orchestrator.js)
│   ├── Component Lifecycle Management
│   ├── Event-Driven Coordination
│   ├── Error Handling & Recovery
│   └── System Metrics
├── Enhanced Task Manager (task-manager.js)
│   ├── Legacy Function Preservation
│   ├── Event Integration
│   ├── Validation & Caching
│   └── Backward Compatibility
├── Event Bus (event-bus.js)
│   ├── Event Distribution
│   ├── Retry Logic
│   ├── Event Persistence
│   └── Metrics Collection
├── Health Monitor (health-monitor.js)
│   ├── Component Health Checks
│   ├── Alerting System
│   ├── Performance Monitoring
│   └── Status Reporting
└── Configuration System (../../config/orchestrator.js)
    ├── Environment Variables
    ├── File-based Config
    ├── Validation
    └── Hot Reloading
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { createOrchestrator } from './src/core/orchestrator.js';

// Create and initialize orchestrator
const orchestrator = await createOrchestrator({
    configPath: './config/orchestrator.js'
});

// Process a requirement
const result = await orchestrator.processRequirement(`
    Create a user authentication system with JWT tokens,
    password hashing, and email verification.
`);

console.log('Tasks created:', result.tasksCreated);

// Graceful shutdown
await orchestrator.shutdown();
```

### Event-Driven Usage

```javascript
import { createOrchestrator } from './src/core/orchestrator.js';

const orchestrator = await createOrchestrator();

// Listen for events
orchestrator.on('task:created', (data) => {
    console.log('New task:', data.task.title);
});

orchestrator.on('task:completed', (data) => {
    console.log('Task completed:', data.task.title);
});

orchestrator.on('component:error', (data) => {
    console.error('Component error:', data.componentName, data.error);
});

// Process requirements
await orchestrator.processRequirement('Implement user dashboard');
```

### Configuration

```javascript
import { initializeConfig, getConfig } from './config/orchestrator.js';

// Initialize configuration
await initializeConfig('./my-config.json');

// Get configuration values
const maxTasks = getConfig('orchestrator.maxConcurrentTasks', 10);
const dbEnabled = getConfig('database.enabled', false);
```

## 📁 Components

### Core Orchestrator (`orchestrator.js`)

The main orchestration engine that:
- Manages component lifecycle (initialization, monitoring, shutdown)
- Coordinates event-driven communication
- Handles error recovery and system resilience
- Provides system-wide metrics and status

**Key Methods:**
- `initialize(options)` - Initialize the orchestrator
- `processRequirement(requirement, options)` - Process natural language requirements
- `getStatus()` - Get system status and metrics
- `shutdown()` - Graceful shutdown

### Enhanced Task Manager (`task-manager.js`)

Preserves all existing task management functionality while adding:
- Event-driven task operations
- Caching for improved performance
- Validation and error handling
- Backward compatibility with legacy functions

**Key Features:**
- All legacy functions preserved and accessible via `.legacy` property
- Event emission for task lifecycle events
- Automatic caching and performance optimization
- Comprehensive validation

### Event Bus (`event-bus.js`)

Robust event management system providing:
- Reliable event distribution
- Automatic retry with exponential backoff
- Event persistence and history
- Performance metrics and monitoring

**Key Features:**
- Event priorities and timeouts
- Retry logic for failed events
- Event history and metrics
- Handler registration and management

### Health Monitor (`health-monitor.js`)

Comprehensive health monitoring for:
- Component health checks
- Performance monitoring
- Alerting and notifications
- Status reporting and metrics

**Key Features:**
- Configurable health check intervals
- Component-specific health checks
- Alert thresholds and notifications
- Health history and trends

### Configuration System (`../../config/orchestrator.js`)

Unified configuration management with:
- Environment variable support
- File-based configuration
- Configuration validation
- Hot reloading capabilities

**Key Features:**
- Hierarchical configuration merging
- Environment-specific overrides
- Validation and error handling
- Configuration watching and reloading

## 🔧 Configuration

### Environment Variables

```bash
# Core Orchestrator
NODE_ENV=production
LOG_LEVEL=info
MAX_CONCURRENT_TASKS=10
TASK_TIMEOUT=300000
HEALTH_CHECK_INTERVAL=30000

# Database
DATABASE_ENABLED=true
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=taskmaster
DATABASE_USERNAME=taskmaster
DATABASE_PASSWORD=your_password

# Integrations
CODEGEN_API_KEY=your_codegen_key
CODEGEN_ORG_ID=your_org_id
LINEAR_API_KEY=your_linear_key
AGENT_API_BASE_URL=http://localhost:8000
```

### Configuration File

```javascript
// config/orchestrator.js or orchestrator.json
export default {
    orchestrator: {
        maxConcurrentTasks: 15,
        taskTimeout: 600000,
        logLevel: 'debug'
    },
    taskManager: {
        enableEventLogging: true,
        autoSaveInterval: 30000
    },
    integrations: {
        codegenSDK: {
            enabled: true,
            timeout: 45000
        }
    }
};
```

## 📊 Events

### System Events

- `orchestrator:initialized` - Orchestrator initialization complete
- `orchestrator:shutdown` - Orchestrator shutdown initiated
- `component:registered` - Component registered with orchestrator
- `component:error` - Component error occurred
- `component:restarted` - Component restarted after error

### Task Events

- `task:created` - New task created
- `task:updated` - Task updated
- `task:completed` - Task completed
- `task:failed` - Task failed
- `task:status:changed` - Task status changed
- `subtask:added` - Subtask added to parent task
- `subtask:removed` - Subtask removed

### Health Events

- `healthCheck:completed` - Health check cycle completed
- `component:unhealthy` - Component health check failed
- `alert:sent` - Health alert sent

### Requirement Events

- `requirement:received` - New requirement received
- `requirement:processed` - Requirement processing completed

## 🏥 Health Checks

### Built-in Health Endpoints

- `/health/orchestrator` - Orchestrator health status
- `/health/task-manager` - Task manager health status
- `/health/events` - Event bus health status
- `/health/integrations` - Integration health status

### Component Health Checks

Each component can implement a `healthCheck()` method:

```javascript
async healthCheck() {
    return {
        healthy: true,
        message: 'Component is operational',
        details: {
            uptime: this.getUptime(),
            metrics: this.getMetrics()
        }
    };
}
```

## 📈 Metrics

### Orchestrator Metrics

- `tasksProcessed` - Total tasks processed
- `eventsEmitted` - Total events emitted
- `errorsHandled` - Total errors handled
- `uptime` - System uptime
- `componentRestarts` - Component restart count

### Task Manager Metrics

- `tasksCreated` - Tasks created
- `tasksCompleted` - Tasks completed
- `tasksUpdated` - Tasks updated
- `validationErrors` - Validation errors
- `cacheSize` - Cache size

### Event Bus Metrics

- `eventsEmitted` - Events emitted
- `eventsProcessed` - Events processed
- `eventsFailed` - Events failed
- `averageProcessingTime` - Average processing time

## 🔍 Examples

Run the included examples to see the orchestrator in action:

```bash
# Basic usage example
node src/core/example.js basic

# Event-driven example
node src/core/example.js events

# Health monitoring example
node src/core/example.js health

# Run all examples
node src/core/example.js all
```

## 🛠️ Development

### Adding New Components

1. Create your component class with required methods:
   ```javascript
   class MyComponent extends EventEmitter {
       async initialize() { /* ... */ }
       async healthCheck() { /* ... */ }
       async stop() { /* ... */ }
   }
   ```

2. Register with orchestrator:
   ```javascript
   const myComponent = new MyComponent();
   await myComponent.initialize();
   orchestrator.registerComponent('myComponent', myComponent);
   ```

### Adding Event Handlers

```javascript
// Register event handler with metadata
orchestrator.eventBus.registerHandler('my:event', (data) => {
    console.log('Handling my event:', data);
}, {
    priority: 'high',
    timeout: 5000
});
```

### Custom Health Checks

```javascript
class MyComponent {
    async healthCheck() {
        try {
            // Perform component-specific checks
            const isConnected = await this.checkConnection();
            const hasResources = await this.checkResources();
            
            return {
                healthy: isConnected && hasResources,
                message: isConnected ? 'Connected' : 'Disconnected',
                details: {
                    connected: isConnected,
                    resources: hasResources,
                    lastCheck: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                healthy: false,
                message: error.message,
                details: { error: error.stack }
            };
        }
    }
}
```

## 🔄 Migration from Legacy System

The orchestrator maintains full backward compatibility:

```javascript
import { TaskManager } from './src/core/task-manager.js';

const taskManager = new TaskManager();
await taskManager.initialize();

// Use legacy functions directly
const tasks = await taskManager.legacy.listTasks();
const task = await taskManager.legacy.addTask(taskData);

// Or use enhanced methods with events
const task = await taskManager.addTask(taskData); // Emits events
```

## 🚨 Error Handling

The orchestrator implements comprehensive error handling:

- **Component Errors**: Automatic restart with exponential backoff
- **Event Errors**: Retry logic with configurable attempts
- **System Errors**: Graceful degradation and recovery
- **Health Failures**: Alerting and notification system

## 📚 API Reference

### Orchestrator Class

#### Methods

- `initialize(options)` - Initialize orchestrator
- `processRequirement(requirement, options)` - Process requirement
- `registerComponent(name, component)` - Register component
- `getStatus()` - Get system status
- `getComponentStatus(name)` - Get component status
- `shutdown()` - Graceful shutdown

#### Events

- `orchestrator:initialized`
- `orchestrator:shutdown`
- `component:registered`
- `component:error`
- `requirement:processed`

### TaskManager Class

#### Methods

- `initialize()` - Initialize task manager
- `addTask(taskData, options)` - Add new task
- `updateTask(taskId, updateData, options)` - Update task
- `getTask(taskId)` - Get task by ID
- `processRequirement(requirement, options)` - Process requirement
- `getMetrics()` - Get metrics

#### Properties

- `legacy` - Access to all legacy functions

### EventBus Class

#### Methods

- `initialize()` - Initialize event bus
- `registerHandler(eventName, handler, options)` - Register handler
- `getStatus()` - Get event bus status
- `getEventHistory(limit)` - Get event history

### HealthMonitor Class

#### Methods

- `initialize()` - Initialize health monitor
- `start()` - Start monitoring
- `performHealthChecks()` - Perform health checks
- `getComponentHealth(name)` - Get component health
- `getMetrics()` - Get health metrics

## ✅ Phase 1.2 Completion Checklist

- [x] **New Folder Structure**: Implemented and functional
- [x] **Core Orchestrator**: Complete implementation with lifecycle management
- [x] **Task Management Migration**: Enhanced with events, preserving legacy functionality
- [x] **Configuration System**: Unified system with validation and environment support
- [x] **Basic Health Checks**: Comprehensive health monitoring implemented
- [x] **Event-Driven Architecture**: Full event system with retry and persistence
- [x] **Error Handling**: Robust error handling and recovery mechanisms
- [x] **Backward Compatibility**: All existing functionality preserved
- [x] **Documentation**: Complete documentation and examples

The Task Master Orchestrator successfully implements all Phase 1.2 requirements while maintaining full backward compatibility and adding powerful new capabilities for the AI-driven development workflow.

