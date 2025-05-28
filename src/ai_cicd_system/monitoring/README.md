# Performance Monitoring & Metrics System

A comprehensive performance monitoring and metrics collection system for the Claude Task Master AI CI/CD platform. This system provides real-time insights into system health, performance bottlenecks, and operational metrics.

## 🎯 Features

### Core Capabilities
- **Performance Monitoring**: Real-time tracking of API response times, database queries, and workflow execution
- **Metrics Collection**: Advanced aggregation with time-based windowing and percentile calculations
- **Health Checking**: Service dependency monitoring with automatic health assessments
- **Alerting System**: Threshold-based alerts with multiple notification channels
- **Dashboard Integration**: Pre-configured Grafana dashboards and Prometheus metrics

### Metric Types
- **Counters**: Cumulative values that only increase (e.g., request counts, error counts)
- **Gauges**: Instantaneous values that can go up or down (e.g., memory usage, active connections)
- **Histograms**: Distribution of values with percentile calculations (e.g., response times)
- **Timers**: Execution time tracking with statistical analysis

## 🚀 Quick Start

### Basic Setup

```javascript
import { PerformanceMonitor } from './monitoring/performance_monitor.js';
import { MetricTypes } from './metrics/metric_types.js';

// Initialize performance monitor
const monitor = new PerformanceMonitor({
  enableDetailedMetrics: true,
  metricsInterval: 10000, // 10 seconds
  alertThresholds: {
    apiResponseTime: 2000, // 2 seconds
    errorRate: 0.05, // 5%
    memoryUsage: 0.8 // 80%
  }
});

await monitor.initialize();

// Time an operation
const timerId = monitor.startTimer('api_request', { endpoint: '/users' });
// ... perform operation ...
const duration = monitor.endTimer(timerId);

// Record custom metrics
monitor.incrementCounter('requests_total', { method: 'GET' });
monitor.setGauge('active_connections', 42);
monitor.recordMetric(MetricTypes.ERROR_RATE, 0.02);
```

### Enhanced System Monitor

```javascript
import { SystemMonitor } from './monitoring/system_monitor.js';

// Initialize with advanced monitoring
const systemMonitor = new SystemMonitor({
  enable_advanced_monitoring: true,
  enable_performance_tracking: true,
  health_check_interval: 30000,
  metrics_collection_interval: 60000
});

await systemMonitor.initialize();
await systemMonitor.startMonitoring();

// The system will automatically:
// - Collect system metrics (CPU, memory, etc.)
// - Monitor component health
// - Trigger alerts when thresholds are exceeded
// - Export metrics to configured dashboards
```

## 📊 Metrics Architecture

### Metric Categories

```javascript
const MetricTypes = {
  // System Performance
  API_RESPONSE_TIME: 'api_response_time',
  DATABASE_QUERY_TIME: 'database_query_time',
  CODEGEN_REQUEST_TIME: 'codegen_request_time',
  WORKFLOW_EXECUTION_TIME: 'workflow_execution_time',
  
  // Throughput Metrics
  REQUESTS_PER_SECOND: 'requests_per_second',
  TASKS_PROCESSED_PER_MINUTE: 'tasks_processed_per_minute',
  PRS_CREATED_PER_HOUR: 'prs_created_per_hour',
  
  // Error Metrics
  ERROR_RATE: 'error_rate',
  RETRY_COUNT: 'retry_count',
  CIRCUIT_BREAKER_TRIPS: 'circuit_breaker_trips',
  
  // Resource Utilization
  MEMORY_USAGE: 'memory_usage',
  CPU_USAGE: 'cpu_usage',
  DATABASE_CONNECTIONS: 'database_connections',
  CONCURRENT_WORKFLOWS: 'concurrent_workflows'
};
```

### Data Flow

```
Application → Performance Monitor → Metrics Collector → Exporters → Dashboards
     ↓              ↓                    ↓               ↓           ↓
Health Checks → Health Checker → Alert Manager → Notifications → Operations Team
```

## 🏥 Health Monitoring

### Service Registration

```javascript
import { HealthChecker, HealthCheckFunctions } from './monitoring/health_checker.js';

const healthChecker = new HealthChecker();
await healthChecker.initialize();

// Register database health check
healthChecker.registerService('database', async () => {
  const result = await db.query('SELECT 1');
  return { status: 'healthy', responseTime: result.duration };
}, {
  timeout: 5000,
  critical: true,
  retryCount: 3
});

// Register external API health check
healthChecker.registerService('external-api', 
  HealthCheckFunctions.httpCheck('https://api.example.com/health'),
  { critical: false }
);

// Check overall health
const health = await healthChecker.checkHealth();
console.log('System Health:', health.status);
```

### Built-in Health Checks

```javascript
// Memory usage check
const memoryCheck = HealthCheckFunctions.memoryCheck(0.8); // 80% threshold

// HTTP endpoint check
const httpCheck = HealthCheckFunctions.httpCheck('https://api.example.com/status');

// Database connection check
const dbCheck = HealthCheckFunctions.databaseCheck(dbConnection);

// File system check
const fsCheck = HealthCheckFunctions.fileSystemCheck('/app/data');

// Custom check
const customCheck = HealthCheckFunctions.customCheck(async () => {
  // Your custom health logic
  return { status: 'healthy', customData: 'value' };
});
```

## 🚨 Alert Management

### Alert Rules

```javascript
import { AlertManager, AlertSeverity } from './alerts/alert_manager.js';

const alertManager = new AlertManager();
await alertManager.initialize();

// Add alert rules
alertManager.addAlertRule('high-response-time', {
  type: 'metric',
  threshold: 2000,
  operator: 'greater_than',
  severity: AlertSeverity.WARNING,
  message: 'API response time exceeded threshold',
  cooldown: 300000, // 5 minutes
  notificationChannels: ['email', 'slack']
});

alertManager.addAlertRule('critical-error-rate', {
  type: 'metric',
  threshold: 0.1,
  operator: 'greater_than',
  severity: AlertSeverity.CRITICAL,
  message: 'Critical error rate detected',
  escalationPolicy: 'critical-escalation'
});
```

### Notification Channels

```javascript
import { EmailNotificationChannel, SlackNotificationChannel } from './alerts/alert_manager.js';

// Email notifications
alertManager.addNotificationChannel('email', new EmailNotificationChannel({
  recipients: ['ops@company.com', 'dev@company.com'],
  smtpConfig: { /* SMTP configuration */ }
}));

// Slack notifications
alertManager.addNotificationChannel('slack', new SlackNotificationChannel({
  webhook: 'https://hooks.slack.com/services/...',
  channel: '#alerts'
}));

// Custom notification channel
alertManager.addNotificationChannel('custom', {
  send: async (alert) => {
    // Custom notification logic
    await sendToCustomSystem(alert);
  }
});
```

## 📈 Individual Metric Components

### Counters

```javascript
import { Counter, CounterRegistry, RateCounter } from './metrics/counters.js';

// Basic counter
const requestCounter = new Counter('http_requests_total', 'Total HTTP requests');
requestCounter.increment(1, { method: 'GET', status: '200' });

// Rate counter (tracks rate over time)
const rateCounter = new RateCounter('api_requests', 'API request rate', {}, 60000);
rateCounter.increment();
console.log('Current rate:', rateCounter.getRate(), 'requests/second');

// Counter registry
const counterRegistry = new CounterRegistry();
const counter = counterRegistry.getOrCreate('requests', 'Request counter');
```

### Gauges

```javascript
import { Gauge, PercentageGauge, MemoryGauge } from './metrics/gauges.js';

// Basic gauge
const connectionGauge = new Gauge('active_connections', 'Active connections');
connectionGauge.set(42);
connectionGauge.increment(5);
connectionGauge.decrement(2);

// Percentage gauge
const cpuGauge = new PercentageGauge('cpu_usage', 'CPU usage');
cpuGauge.setPercentage(75.5);
cpuGauge.setRatio(0.755); // Same as above

// Memory gauge with human-readable formatting
const memoryGauge = new MemoryGauge('memory_usage', 'Memory usage');
memoryGauge.setMegabytes(512);
memoryGauge.setGigabytes(2);
console.log(memoryGauge.getValue()); // Includes formatted value
```

### Histograms

```javascript
import { Histogram, ResponseTimeHistogram, SizeHistogram } from './metrics/histograms.js';

// Response time histogram
const responseHist = new ResponseTimeHistogram('api_response_time', 'API response times');
responseHist.observeMs(150);
responseHist.observeSeconds(0.25);

// Get SLA compliance
const slaStats = responseHist.getSLAStatistics([100, 500, 1000]);
console.log('SLA Compliance:', slaStats);

// Size histogram
const sizeHist = new SizeHistogram('request_size', 'Request sizes');
sizeHist.observeBytes(1024);
sizeHist.observeKB(64);
sizeHist.observeMB(2);

// Get formatted statistics
const formattedStats = sizeHist.getFormattedStatistics();
console.log('Size Stats:', formattedStats.formatted);
```

### Timers

```javascript
import { Timer, Stopwatch, PerformanceTimer } from './metrics/timers.js';

// Basic timer
const dbTimer = new Timer('database_operations', 'Database operation timing');
const timerId = dbTimer.start('user_query', { table: 'users' });
// ... perform database operation ...
const result = dbTimer.stop(timerId);

// Time a function
const { result: queryResult, timing } = await dbTimer.time(async () => {
  return await db.query('SELECT * FROM users');
});

// Stopwatch for manual timing
const stopwatch = new Stopwatch();
stopwatch.start();
// ... do work ...
stopwatch.lap(); // Record lap time
// ... do more work ...
const elapsed = stopwatch.stop();

// Performance timer with marks
const perfTimer = new PerformanceTimer();
perfTimer.mark('start');
// ... do work ...
perfTimer.mark('middle');
// ... do more work ...
perfTimer.mark('end');
const measure = perfTimer.measure('total', 'start', 'end');
```

## 📊 Dashboard Integration

### Grafana Configuration

The system includes pre-configured Grafana dashboards in `dashboards/grafana_config.json`:

- **System Overview**: Memory, CPU, and workflow metrics
- **API Performance**: Response times with percentiles
- **Database Performance**: Query times and connection metrics
- **Error Tracking**: Error rates and retry statistics
- **Throughput Metrics**: Requests/second, tasks/minute, PRs/hour
- **Health Status**: Service health and alert summaries

### Prometheus Integration

Prometheus configuration in `dashboards/prometheus_config.yml`:

- **Scrape Configs**: Multiple endpoints for different metric types
- **Recording Rules**: Pre-calculated percentiles and rates
- **Alert Rules**: Threshold-based alerting with multiple severity levels
- **Remote Storage**: Optional long-term storage configuration

### Metrics Export

```javascript
import { ConsoleExporter, FileExporter } from './monitoring/metrics_collector.js';

const metricsCollector = new MetricsCollector();

// Console exporter for development
metricsCollector.addExporter(new ConsoleExporter({
  logLevel: 'info',
  includeValues: true
}));

// File exporter for persistence
metricsCollector.addExporter(new FileExporter({
  filePath: './metrics.json',
  format: 'json' // or 'csv'
}));

// Custom exporter
metricsCollector.addExporter({
  name: 'prometheus',
  export: async (metrics) => {
    // Send metrics to Prometheus pushgateway
    await sendToPrometheus(metrics);
  }
});
```

## 🧪 Testing

### Performance Tests

```javascript
import { PerformanceMonitor } from './monitoring/performance_monitor.js';

describe('Performance Monitoring', () => {
  test('should collect metrics with minimal overhead', async () => {
    const monitor = new PerformanceMonitor();
    const operations = 1000;
    
    const start = process.hrtime.bigint();
    
    for (let i = 0; i < operations; i++) {
      const timerId = monitor.startTimer('test_operation');
      await new Promise(resolve => setTimeout(resolve, 1));
      monitor.endTimer(timerId);
    }
    
    const end = process.hrtime.bigint();
    const totalTime = Number(end - start) / 1000000;
    const avgOverhead = totalTime / operations;
    
    expect(avgOverhead).toBeLessThan(5); // Less than 5ms overhead per operation
  });
});
```

### Load Testing

```javascript
test('should maintain performance under load', async () => {
  const monitor = new PerformanceMonitor();
  const operations = 10000;
  
  const startTime = Date.now();
  
  // Perform many operations quickly
  for (let i = 0; i < operations; i++) {
    monitor.incrementCounter('load_test');
    monitor.setGauge('load_gauge', i);
    monitor.recordMetric('load_metric', Math.random() * 100);
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const avgTimePerOp = totalTime / operations;
  
  expect(avgTimePerOp).toBeLessThan(0.1); // Less than 0.1ms per operation
});
```

## 🔧 Configuration

### Environment Variables

```bash
# Monitoring Configuration
MONITORING_ENABLED=true
MONITORING_INTERVAL=10000
METRICS_RETENTION_PERIOD=86400000
ALERT_COOLDOWN=300000

# Prometheus Configuration
PROMETHEUS_PORT=8000
PROMETHEUS_ENDPOINT=/metrics

# Alert Configuration
ALERT_EMAIL_ENABLED=true
ALERT_SLACK_ENABLED=true
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
```

### Configuration Object

```javascript
const config = {
  // Performance Monitor
  enableDetailedMetrics: true,
  metricsInterval: 10000,
  retentionPeriod: 86400000,
  alertThresholds: {
    apiResponseTime: 2000,
    errorRate: 0.05,
    memoryUsage: 0.8,
    cpuUsage: 0.8,
    databaseQueryTime: 1000,
    codegenRequestTime: 10000
  },
  
  // Metrics Collector
  aggregationWindow: 60000,
  exportInterval: 30000,
  maxDataPoints: 10000,
  
  // Health Checker
  healthCheckInterval: 30000,
  defaultTimeout: 5000,
  maxHistorySize: 100,
  enableAutoHealthChecks: true,
  
  // Alert Manager
  enableAlerts: true,
  alertCooldown: 300000,
  maxActiveAlerts: 1000,
  alertHistorySize: 10000
};
```

## 📚 API Reference

### PerformanceMonitor

```javascript
class PerformanceMonitor {
  constructor(config)
  async initialize()
  startTimer(operation, metadata): string
  endTimer(timerId): number
  recordMetric(type, value, labels)
  incrementCounter(name, labels, increment)
  setGauge(name, value, labels)
  async collectSystemMetrics()
  async getStatistics(): Object
  async getHealth(): Object
  async shutdown()
}
```

### MetricsCollector

```javascript
class MetricsCollector {
  constructor(config)
  async initialize()
  collect(metric)
  addExporter(exporter)
  getMetrics(windowKey): Array
  getMetricsRange(startTime, endTime): Array
  async getStatistics(): Object
  async shutdown()
}
```

### HealthChecker

```javascript
class HealthChecker {
  constructor(config)
  async initialize()
  registerService(name, healthCheckFn, config)
  async checkHealth(serviceName): Object
  async checkServiceHealth(serviceName): Object
  getHealthHistory(serviceName, limit): Array
  getHealthTrends(serviceName, timeWindow): Object
  async shutdown()
}
```

### AlertManager

```javascript
class AlertManager {
  constructor(config)
  async initialize()
  addAlertRule(name, rule)
  addNotificationChannel(name, channel)
  async sendAlert(alertData)
  async resolveAlert(alertId, reason)
  getActiveAlerts(filters): Array
  getAlertHistory(filters, limit): Array
  async getStatistics(): Object
  async shutdown()
}
```

## 🚀 Performance Characteristics

### Benchmarks

- **Metric Collection**: < 5ms overhead per operation
- **Health Checks**: Complete within 5 seconds
- **Metrics Export**: Every 30 seconds
- **Alert Notifications**: Within 1 minute of threshold breach
- **Memory Usage**: < 100MB for 10,000 active metrics
- **CPU Overhead**: < 1% under normal load

### Scalability

- **Concurrent Operations**: Supports 1000+ concurrent timers
- **Metric Storage**: Handles 100,000+ metrics with time-based cleanup
- **Alert Processing**: Processes 1000+ alerts per minute
- **Health Checks**: Monitors 100+ services simultaneously

## 🔍 Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```javascript
   // Reduce retention period
   const config = { retentionPeriod: 3600000 }; // 1 hour instead of 24
   
   // Limit metric history
   const config = { maxDataPoints: 1000 }; // Reduce from default 10,000
   ```

2. **Slow Performance**
   ```javascript
   // Increase collection intervals
   const config = {
     metricsInterval: 30000, // 30 seconds instead of 10
     exportInterval: 60000   // 1 minute instead of 30 seconds
   };
   ```

3. **Missing Metrics**
   ```javascript
   // Check if monitoring is enabled
   const config = { enable_metrics: true };
   
   // Verify initialization
   await monitor.initialize();
   ```

### Debug Mode

```javascript
const monitor = new PerformanceMonitor({
  debug: true,
  logLevel: 'debug'
});

// Enable detailed logging
process.env.DEBUG = 'monitoring:*';
```

## 📄 License

This monitoring system is part of the Claude Task Master AI CI/CD platform and follows the same licensing terms.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

For detailed contribution guidelines, see the main project README.

