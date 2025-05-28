# Performance Optimization & Monitoring System

A comprehensive performance optimization and monitoring system designed to ensure the CI/CD workflow operates efficiently at scale with real-time visibility into system performance.

## 🎯 Overview

The Performance System provides:

- **Real-time Performance Monitoring** - Track system metrics, response times, and resource usage
- **Intelligent Health Checking** - Monitor system health with configurable thresholds and alerts
- **Database Optimization** - Query analysis, indexing recommendations, and connection pooling
- **Smart Caching** - Multi-strategy caching with compression and intelligent invalidation
- **Load Balancing** - Distribute requests across multiple servers with health-aware routing
- **Comprehensive Analytics** - Collect, aggregate, and export metrics in multiple formats

## 🚀 Quick Start

### Basic Usage

```javascript
import PerformanceSystem from './src/performance-system.js';
import { getPerformanceConfig } from './src/config/performance-config.js';

// Get configuration for your environment
const config = getPerformanceConfig(process.env.NODE_ENV || 'development');

// Create and initialize the performance system
const performanceSystem = new PerformanceSystem(config);
await performanceSystem.initialize();
await performanceSystem.start();

// Get performance dashboard
const dashboard = performanceSystem.getPerformanceDashboard();
console.log(`System Status: ${dashboard.status}`);
console.log(`Performance Score: ${dashboard.summary.overallScore}/100`);
```

### With Database Integration

```javascript
import { DatabaseConnection } from './src/ai_cicd_system/database/connection.js';

// Initialize with database connection for optimization
const dbConnection = new DatabaseConnection();
await dbConnection.connect();

await performanceSystem.initialize(dbConnection);
await performanceSystem.start();
```

## 📊 Components

### Performance Monitor

Real-time performance metrics collection and monitoring.

```javascript
const perfMonitor = performanceSystem.getComponent('performance');

// Time operations
const timer = perfMonitor.startTimer('api_request');
// ... perform operation
const duration = perfMonitor.endTimer(timer.name);

// Record request metrics
perfMonitor.recordRequest(true, 250, { endpoint: '/api/users' });

// Get performance summary
const summary = perfMonitor.getPerformanceSummary();
```

**Features:**
- CPU and memory usage tracking
- Response time monitoring
- Error rate calculation
- Event loop lag detection
- Configurable thresholds and alerts

### Health Checker

System health monitoring with configurable checks and alerting.

```javascript
const healthChecker = performanceSystem.getComponent('health');

// Register custom health check
healthChecker.registerHealthCheck('database', async () => {
    const result = await checkDatabaseConnection();
    return {
        status: result.connected ? 'healthy' : 'critical',
        message: result.message
    };
});

// Get health summary
const health = healthChecker.getHealthSummary();
```

**Built-in Health Checks:**
- Memory usage monitoring
- Event loop lag detection
- Process uptime tracking
- Custom health checks support

### Database Optimizer

Database performance optimization and query analysis.

```javascript
const dbOptimizer = performanceSystem.getComponent('database');

// Optimize queries automatically
const result = await dbOptimizer.optimizeQuery(
    'SELECT * FROM users WHERE email = $1',
    ['user@example.com']
);

// Get optimization suggestions
const suggestions = dbOptimizer.getOptimizationSuggestions();
const slowQueries = dbOptimizer.getSlowQueries();
```

**Features:**
- Slow query detection and logging
- Query optimization suggestions
- Index analysis and recommendations
- Connection pool optimization
- Retry logic for failed queries

### Cache Manager

Intelligent caching with multiple strategies and compression.

```javascript
const cacheManager = performanceSystem.getComponent('cache');

// Basic caching
await cacheManager.set('user:123', userData, { ttl: 300000 });
const user = await cacheManager.get('user:123');

// Memoization
const result = await cacheManager.memoize('expensive_operation', async () => {
    return await performExpensiveCalculation();
});

// Tag-based invalidation
await cacheManager.set('user:123', userData, { tags: ['user', 'profile'] });
await cacheManager.invalidateTags(['user']); // Invalidate all user-related cache
```

**Caching Strategies:**
- **LRU** (Least Recently Used) - Default
- **LFU** (Least Frequently Used)
- **TTL** (Time To Live)
- **FIFO** (First In, First Out)

**Features:**
- Multiple eviction strategies
- Compression for large values
- Tag-based invalidation
- Pattern-based invalidation
- Comprehensive statistics

### Load Balancer

Distribute requests across multiple servers with health-aware routing.

```javascript
const loadBalancer = performanceSystem.getComponent('loadBalancer');

// Add servers
loadBalancer.addServer('server1', {
    host: 'localhost',
    port: 3001,
    weight: 1
});

// Execute requests with load balancing
const result = await loadBalancer.executeRequest(async (server) => {
    return await makeRequestToServer(server);
});
```

**Load Balancing Strategies:**
- **Round Robin** - Distribute requests evenly
- **Weighted Round Robin** - Distribute based on server weights
- **Least Connections** - Route to server with fewest active connections
- **Least Response Time** - Route to fastest responding server
- **Resource Based** - Route based on server resource utilization
- **Hash** - Route based on request hash for consistency

### Metrics Collector

Comprehensive metrics collection and analysis system.

```javascript
const metricsCollector = performanceSystem.getComponent('metrics');

// Define custom metrics
metricsCollector.defineMetric('api_requests_total', {
    type: 'counter',
    description: 'Total number of API requests'
});

// Record metrics
metricsCollector.incrementCounter('api_requests_total', 1, { endpoint: '/api/users' });
metricsCollector.setGauge('active_connections', 42);
metricsCollector.recordHistogram('response_time_ms', 250);

// Time functions
const result = await metricsCollector.timeFunction('database_query', async () => {
    return await executeQuery();
});

// Export metrics
const jsonMetrics = metricsCollector.exportMetrics('json');
const prometheusMetrics = metricsCollector.exportMetrics('prometheus');
```

**Metric Types:**
- **Counter** - Monotonically increasing values
- **Gauge** - Current value that can go up or down
- **Histogram** - Distribution of values
- **Summary** - Summary statistics
- **Timer** - Duration measurements

## ⚙️ Configuration

### Environment-based Configuration

```javascript
import { getPerformanceConfig } from './src/config/performance-config.js';

// Get configuration for specific environment
const devConfig = getPerformanceConfig('development');
const prodConfig = getPerformanceConfig('production');
const testConfig = getPerformanceConfig('testing');
```

### Custom Configuration

```javascript
const customConfig = getPerformanceConfig('production', {
    performanceMonitor: {
        thresholds: {
            responseTime: 500, // Stricter threshold
            errorRate: 1
        }
    },
    cacheManager: {
        strategy: 'lfu',
        maxSize: 5000,
        enableCompression: true
    },
    enableLoadBalancing: true
});
```

### Configuration Validation

```javascript
import { validatePerformanceConfig } from './src/config/performance-config.js';

const validation = validatePerformanceConfig(config);
if (!validation.isValid) {
    console.error('Configuration errors:', validation.errors);
}
```

## 📈 Dashboard and Monitoring

### Performance Dashboard

```javascript
const dashboard = performanceSystem.getPerformanceDashboard();

console.log(`Status: ${dashboard.status}`);
console.log(`Uptime: ${dashboard.uptime}ms`);
console.log(`Performance Score: ${dashboard.summary.overallScore}/100`);

// Component-specific data
console.log('Performance:', dashboard.components.performance);
console.log('Health:', dashboard.components.health);
console.log('Cache:', dashboard.components.cache);
```

### Alerts and Recommendations

```javascript
// Get optimization recommendations
const recommendations = performanceSystem.getOptimizationRecommendations();
recommendations.forEach(rec => {
    console.log(`[${rec.priority}] ${rec.message}`);
});

// Listen for alerts
performanceSystem.on('alert', (alert) => {
    console.log(`Alert: ${alert.message} (${alert.severity})`);
});
```

### Metrics Export

```javascript
// Export in different formats
const jsonMetrics = performanceSystem.exportMetrics('json');
const prometheusMetrics = performanceSystem.exportMetrics('prometheus');
const csvMetrics = performanceSystem.exportMetrics('csv');
```

## 🧪 Testing

### Running Tests

```bash
npm test tests/performance-system.test.js
```

### Example Tests

```javascript
import PerformanceSystem from '../src/performance-system.js';
import { getPerformanceConfig } from '../src/config/performance-config.js';

describe('Performance System', () => {
    test('should initialize and start successfully', async () => {
        const config = getPerformanceConfig('testing');
        const system = new PerformanceSystem(config);
        
        await system.initialize();
        await system.start();
        
        expect(system.isRunning).toBe(true);
        
        await system.stop();
    });
});
```

## 🔧 Integration Examples

### Express.js Integration

```javascript
import express from 'express';
import PerformanceSystem from './src/performance-system.js';

const app = express();
const performanceSystem = new PerformanceSystem();

await performanceSystem.initialize();
await performanceSystem.start();

// Middleware for request tracking
app.use((req, res, next) => {
    const timer = performanceSystem.getComponent('performance').startTimer('http_request');
    
    res.on('finish', () => {
        const duration = performanceSystem.getComponent('performance').endTimer(timer.name);
        performanceSystem.getComponent('performance').recordRequest(
            res.statusCode < 400,
            duration,
            { method: req.method, route: req.route?.path }
        );
    });
    
    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const health = performanceSystem.getComponent('health').getHealthSummary();
    res.json(health);
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
    const format = req.query.format || 'json';
    const metrics = performanceSystem.exportMetrics(format);
    
    if (format === 'prometheus') {
        res.set('Content-Type', 'text/plain');
    }
    
    res.send(metrics);
});
```

### Database Integration

```javascript
import { DatabaseConnection } from './src/ai_cicd_system/database/connection.js';

// Initialize database with performance monitoring
const dbConnection = new DatabaseConnection();
await dbConnection.connect();

// Initialize performance system with database
await performanceSystem.initialize(dbConnection);

// Use optimized queries
const dbOptimizer = performanceSystem.getComponent('database');
const users = await dbOptimizer.optimizeQuery(
    'SELECT * FROM users WHERE active = $1',
    [true]
);
```

### Caching Integration

```javascript
// Cache expensive operations
const cacheManager = performanceSystem.getComponent('cache');

async function getUser(id) {
    return await cacheManager.memoize(`user:${id}`, async () => {
        return await database.query('SELECT * FROM users WHERE id = $1', [id]);
    }, { ttl: 300000, tags: ['user'] });
}

// Invalidate cache when user is updated
async function updateUser(id, data) {
    await database.query('UPDATE users SET ... WHERE id = $1', [id]);
    await cacheManager.invalidateTags(['user']);
}
```

## 🚨 Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check cache size limits
   - Review metrics retention period
   - Monitor for memory leaks in custom code

2. **Slow Performance**
   - Review database query optimization suggestions
   - Check cache hit rates
   - Analyze slow query logs

3. **Health Check Failures**
   - Review health check configurations
   - Check system resource usage
   - Verify external service availability

### Debug Mode

```javascript
const config = getPerformanceConfig('development', {
    performanceMonitor: {
        collectInterval: 1000, // More frequent collection
        enableDebugLogging: true
    }
});
```

### Monitoring Logs

```javascript
performanceSystem.on('alert', (alert) => {
    console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
});

performanceSystem.on('metric_recorded', (metric) => {
    console.log(`Metric recorded: ${metric.name} = ${metric.value}`);
});
```

## 📚 API Reference

### PerformanceSystem

- `initialize(databaseConnection?)` - Initialize the system
- `start()` - Start monitoring and optimization
- `stop()` - Stop the system
- `getPerformanceDashboard()` - Get comprehensive dashboard data
- `getComponent(name)` - Get specific component instance
- `exportMetrics(format)` - Export metrics in specified format
- `getOptimizationRecommendations()` - Get optimization suggestions

### Events

- `initialized` - System initialized
- `started` - System started
- `stopped` - System stopped
- `alert` - Alert triggered
- `metric_recorded` - Metric recorded

## 🔮 Future Enhancements

- **Machine Learning Integration** - Predictive performance analysis
- **Distributed Tracing** - Request tracing across services
- **Auto-scaling** - Automatic resource scaling based on metrics
- **Advanced Alerting** - Integration with external alerting systems
- **Performance Profiling** - Detailed code-level performance analysis

## 📄 License

This performance system is part of the claude-task-master project and follows the same licensing terms.

