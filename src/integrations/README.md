# Component Integration Framework

A comprehensive component integration framework that enables seamless communication and coordination between all system components in the unified AI CI/CD development flow system.

## 🎯 Overview

The Component Integration Framework provides a standardized interface for component communication, featuring:

- **Service Discovery**: Automatic component registration and discovery
- **Health Monitoring**: Real-time component health checking and status reporting
- **Configuration Management**: Centralized configuration with hot reloading
- **Event System**: Event-driven communication between components
- **Circuit Breaker**: Fault tolerance with automatic recovery
- **Rate Limiting**: Request throttling and quota management
- **Load Balancing**: Intelligent request routing and distribution

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Integration Framework                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Service   │  │   Health    │  │   Config    │         │
│  │  Registry   │  │  Monitor    │  │  Manager    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Event Bus   │  │ Circuit     │  │ Rate        │         │
│  │             │  │ Breaker     │  │ Limiter     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Components                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Performance │  │ Error       │  │ Database    │         │
│  │ Monitoring  │  │ Handling    │  │ Manager     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Claude Code │  │ AgentAPI    │  │ Linear      │         │
│  │ Integration │  │ Middleware  │  │ Integration │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Installation

```javascript
import { createIntegrationFramework } from './src/integrations/index.js';
```

### Basic Usage

```javascript
// Create and initialize the framework
const framework = await createIntegrationFramework({
    serviceRegistry: { storage: 'memory' },
    healthMonitor: { checkInterval: 30000 },
    configManager: { watchFiles: true },
    eventBus: { enableWebSocket: true }
});

// Register a component
await framework.registerComponent({
    id: 'my-service',
    name: 'My Service',
    type: 'api',
    version: '1.0.0',
    endpoints: { health: '/health' },
    healthCheck: () => ({ status: 'healthy' })
}, componentInstance);

// Discover components
const service = await framework.discoverComponent('my-service');
const apiServices = await framework.discoverComponent('api');

// Send requests with circuit breaker and rate limiting
const result = await framework.sendRequest(
    'my-service', 
    'GET', 
    '/data', 
    { query: 'test' }
);

// Subscribe to events
framework.subscribe('service.started', (data) => {
    console.log('Service started:', data);
});

// Broadcast events
await framework.broadcastEvent('service.started', {
    serviceId: 'my-service',
    timestamp: new Date().toISOString()
});
```

## 📚 Core Components

### Service Registry

Handles automatic component registration and discovery:

```javascript
import { ServiceRegistry } from './src/integrations/service-registry.js';

const registry = new ServiceRegistry({
    storage: 'memory', // or 'consul', 'etcd'
    heartbeatInterval: 30000,
    serviceTimeout: 90000
});

await registry.initialize();

// Register a service
await registry.register({
    id: 'user-service',
    name: 'User Management Service',
    type: 'api',
    version: '2.1.0',
    endpoints: {
        health: '/health',
        users: '/api/v1/users'
    },
    dependencies: ['database', 'auth-service']
});

// Discover services
const userService = await registry.discover('user-service');
const apiServices = await registry.getByType('api');
```

### Health Monitor

Provides real-time component health monitoring:

```javascript
import { HealthMonitor } from './src/integrations/health-monitor.js';

const monitor = new HealthMonitor({
    checkInterval: 30000,
    timeout: 10000,
    retryAttempts: 3,
    alertThreshold: 3
});

await monitor.initialize();

// Register health check
await monitor.registerHealthCheck('my-service', async () => {
    // Custom health check logic
    return {
        status: 'healthy',
        details: { uptime: process.uptime() }
    };
});

// Get health status
const health = await monitor.getOverallHealth();
const componentHealth = monitor.getComponentHealth('my-service');
```

### Configuration Manager

Centralized configuration management with hot reloading:

```javascript
import { ConfigManager } from './src/integrations/config-manager.js';

const config = new ConfigManager({
    configDir: './config',
    watchFiles: true,
    hotReload: true
});

await config.initialize();

// Get configuration values
const dbUrl = config.get('database.url', 'localhost:5432');
const apiConfig = config.get('api');

// Set configuration values
await config.set('feature.newFeature', true);

// Listen for configuration changes
config.on('config.changed', (data) => {
    console.log('Config changed:', data.key, data.value);
});
```

### Event Bus

Event-driven communication system:

```javascript
import { EventBus } from './src/integrations/event-bus.js';

const eventBus = new EventBus({
    enableWebSocket: true,
    wsPort: 8080,
    eventHistory: true,
    historyLimit: 1000
});

await eventBus.initialize();

// Subscribe to events
const subscriptionId = eventBus.subscribe('user.created', (userData) => {
    console.log('New user created:', userData);
});

// Emit events
await eventBus.emit('user.created', {
    userId: '123',
    email: 'user@example.com'
});

// Broadcast to all clients (including WebSocket)
await eventBus.broadcast('system.alert', {
    level: 'warning',
    message: 'High memory usage detected'
});
```

## 🔧 Advanced Features

### Circuit Breaker Pattern

Automatic fault tolerance with circuit breaker:

```javascript
// Circuit breaker automatically opens after 5 consecutive failures
// Requests are blocked for 60 seconds, then half-open state allows test requests
const result = await framework.sendRequest('unreliable-service', 'GET', '/data');
```

### Rate Limiting

Built-in rate limiting per component:

```javascript
// Default: 100 requests per minute per component
// Automatically throttles requests when limit is exceeded
const result = await framework.sendRequest('rate-limited-service', 'POST', '/api');
```

### Load Balancing

Intelligent request distribution:

```javascript
// When multiple instances of the same service type are registered,
// requests are automatically load balanced
const apiServices = await framework.discoverComponent('api');
// Returns array of services, requests distributed among them
```

## 📊 Monitoring and Metrics

### Framework Health

```javascript
const health = await framework.getHealth();
console.log(health);
// {
//   status: 'healthy',
//   framework: {
//     initialized: true,
//     uptime: 123456,
//     componentCount: 5,
//     requestCount: 1250,
//     errorCount: 12,
//     errorRate: 0.0096
//   },
//   components: {
//     'my-service': { status: 'healthy', uptime: 98.5 }
//   }
// }
```

### Metrics

```javascript
const metrics = framework.getMetrics();
console.log(metrics);
// {
//   uptime: 123456,
//   componentCount: 5,
//   requestCount: 1250,
//   errorCount: 12,
//   errorRate: 0.0096,
//   circuitBreakers: [...]
// }
```

### Event History

```javascript
const eventHistory = framework.eventBus.getEventHistory({
    eventName: 'user.created',
    since: '2024-01-01T00:00:00Z',
    limit: 100
});
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test tests/integration/integration-framework.test.js
```

### Example Test

```javascript
import { IntegrationFramework } from './src/integrations/integration-framework.js';

describe('Integration Framework', () => {
    let framework;

    beforeEach(async () => {
        framework = new IntegrationFramework();
        await framework.initialize();
    });

    afterEach(async () => {
        await framework.shutdown();
    });

    test('should register and discover components', async () => {
        const mockComponent = { request: jest.fn() };
        
        await framework.registerComponent({
            id: 'test-service',
            name: 'Test Service',
            type: 'api'
        }, mockComponent);

        const discovered = await framework.discoverComponent('test-service');
        expect(discovered.id).toBe('test-service');
    });
});
```

## 🔧 Configuration

### Framework Configuration

```javascript
const framework = await createIntegrationFramework({
    // Service Registry Configuration
    serviceRegistry: {
        storage: 'memory',           // 'memory', 'consul', 'etcd'
        consulUrl: 'http://localhost:8500',
        etcdUrl: 'http://localhost:2379',
        heartbeatInterval: 30000,    // 30 seconds
        serviceTimeout: 90000        // 90 seconds
    },

    // Health Monitor Configuration
    healthMonitor: {
        checkInterval: 30000,        // 30 seconds
        timeout: 10000,              // 10 seconds
        retryAttempts: 3,
        retryDelay: 5000,            // 5 seconds
        alertThreshold: 3            // consecutive failures
    },

    // Configuration Manager
    configManager: {
        configDir: './config',
        configFile: 'system.json',
        watchFiles: true,
        hotReload: true,
        validateConfig: true,
        backupConfig: true,
        encryptSecrets: false
    },

    // Event Bus Configuration
    eventBus: {
        enableWebSocket: true,
        wsPort: 8080,
        maxListeners: 100,
        eventHistory: true,
        historyLimit: 1000,
        enablePersistence: false,
        enableMetrics: true
    }
});
```

## 🚀 Performance Metrics

The integration framework is designed to meet the following performance requirements:

- **Component discovery time**: < 5 seconds
- **Health check response time**: < 1 second  
- **Configuration propagation time**: < 10 seconds
- **Event delivery latency**: < 100ms
- **System availability**: > 99.9%

## 🔒 Security

- Optional configuration encryption for sensitive values
- Authentication support for component registration
- Rate limiting to prevent abuse
- Circuit breaker to prevent cascade failures
- Input validation and sanitization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the [examples](./examples/) directory
2. Review the [test suite](../../tests/integration/) for usage patterns
3. Create an issue in the repository

## 🗺️ Roadmap

- [ ] Consul/etcd integration for distributed service registry
- [ ] Prometheus metrics export
- [ ] Grafana dashboard templates
- [ ] Advanced load balancing algorithms
- [ ] Service mesh integration
- [ ] Configuration encryption with key management
- [ ] Distributed tracing support
- [ ] Performance benchmarking tools

