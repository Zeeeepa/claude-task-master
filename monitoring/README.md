# 📊 Comprehensive Monitoring and Analytics System

A powerful, real-time monitoring and analytics system for Task Master that provides deep insights into system performance, workflow efficiency, and operational health.

## 🎯 Features

### Core Monitoring
- **Performance Metrics**: Response times, throughput, error rates
- **System Health**: CPU, memory, disk usage monitoring
- **Workflow Analytics**: Task completion rates, PR success rates, cycle times
- **Real-time Data**: Live metrics collection and streaming
- **Historical Analysis**: Trend analysis and performance over time

### Alerting System
- **Configurable Thresholds**: Custom alert rules for different metrics
- **Multiple Notification Channels**: Console, email, Slack, webhooks
- **Alert Severity Levels**: Critical, high, medium, low priority alerts
- **Smart Deduplication**: Prevents alert spam with intelligent grouping

### Dashboard & Visualization
- **Real-time Dashboard**: Live system status and KPIs
- **Interactive Charts**: Performance trends and system metrics
- **Custom Time Ranges**: 5m, 15m, 1h, 6h, 24h, 7d, 30d views
- **Export Capabilities**: CSV and JSON data export

### Analytics Engine
- **Comprehensive Reports**: Performance, workflow, system, and combined reports
- **Anomaly Detection**: Automatic identification of unusual patterns
- **Trend Analysis**: Performance trends and predictions
- **Actionable Insights**: Specific recommendations for optimization

## 🚀 Quick Start

### Basic Setup

```javascript
import MonitoringSystem from './monitoring/index.js';

const monitoring = new MonitoringSystem();

// Start monitoring with dashboard
await monitoring.start({
  enableDashboard: true,
  dashboardPort: 3001
});

// Track custom events
await monitoring.trackEvent('application_started', {
  version: '1.0.0',
  environment: 'production'
});

// Generate reports
const report = await monitoring.generateReport('comprehensive', '24h');
console.log(report);
```

### Dashboard Access

Once started, access the real-time dashboard at:
```
http://localhost:3001
```

## 📈 Usage Examples

### Performance Monitoring

```javascript
import { measurePerformance, Timer } from './utils/metrics.js';

class TaskService {
  @measurePerformance
  async processTask(task) {
    // Your task processing logic
    return result;
  }
}

// Manual timing
const timer = new Timer('database_query');
timer.start();
await database.query('SELECT * FROM tasks');
timer.stop();
await timer.track();
```

### Custom Event Tracking

```javascript
// Track task lifecycle
await monitoring.trackEvent('task_created', {
  task_id: 123,
  complexity: 'high',
  assignee: 'user_456'
});

await monitoring.trackEvent('task_completed', {
  task_id: 123,
  duration: 3600000, // 1 hour
  success: true
});
```

### Error Monitoring

```javascript
try {
  await riskyOperation();
} catch (error) {
  await monitoring.trackEvent('error_occurred', {
    error_type: 'validation_error',
    severity: 'high',
    message: error.message,
    stack_trace: error.stack
  });
  throw error;
}
```

## ⚙️ Configuration

### Monitoring Configuration

```javascript
import { MonitoringConfig } from './monitoring/core/monitoring-config.js';

// Customize thresholds
MonitoringConfig.alerts.error_rate_threshold = 3; // 3%
MonitoringConfig.alerts.response_time_threshold = 500; // 500ms

// Adjust collection intervals
MonitoringConfig.collection.real_time_interval = 10000; // 10 seconds
MonitoringConfig.collection.performance_interval = 60000; // 1 minute

// Configure retention
MonitoringConfig.retention.daily_aggregates = '180d'; // 6 months
```

### Storage Options

```javascript
// Memory storage (default)
const monitoring = new MonitoringSystem({
  storage: {
    type: 'memory',
    max_memory_entries: 10000
  }
});

// File storage
const monitoring = new MonitoringSystem({
  storage: {
    type: 'file',
    file_path: './monitoring/data'
  }
});
```

## 📊 Dashboard Features

### Real-time Metrics
- **Performance**: Response times, throughput, error rates
- **System Health**: CPU, memory, disk usage
- **Workflow**: Task completion rates, cycle times
- **Alerts**: Active alerts and alert history

### Interactive Charts
- Line charts for time-series data
- Real-time updates via WebSocket
- Configurable time ranges
- Zoom and pan capabilities

### Export & Reporting
- CSV export for all metrics
- JSON export for programmatic access
- Comprehensive PDF reports (planned)
- Scheduled report delivery (planned)

## 🔧 API Reference

### MonitoringSystem

```javascript
const monitoring = new MonitoringSystem(config);

// Start/stop system
await monitoring.start(options);
await monitoring.stop();

// Track events
await monitoring.trackEvent(eventType, metadata);

// Get metrics
const metrics = await monitoring.getMetrics(type, timeRange);

// Generate reports
const report = await monitoring.generateReport(type, timeRange, options);

// System status
const status = await monitoring.getStatus();
const health = await monitoring.healthCheck();
```

### Utility Classes

```javascript
import { Timer, Counter, Gauge, Histogram } from './utils/metrics.js';

// Timer for measuring durations
const timer = new Timer('operation_name');
timer.start();
// ... operation ...
timer.stop();
await timer.track();

// Counter for counting events
const counter = new Counter('requests');
counter.increment();
await counter.track();

// Gauge for current values
const gauge = new Gauge('queue_size');
gauge.set(42);
await gauge.track();

// Histogram for value distributions
const histogram = new Histogram('response_times');
histogram.observe(150);
console.log(histogram.getPercentile(95));
```

## 🚨 Alerting

### Alert Types
- **Threshold Exceeded**: Metric values above/below thresholds
- **Anomaly Detected**: Unusual patterns in data
- **System Health**: Critical system issues
- **Custom Events**: User-defined alert conditions

### Notification Channels
- **Console**: Immediate console output
- **Email**: SMTP-based email notifications (configurable)
- **Slack**: Slack webhook integration (configurable)
- **Webhooks**: Custom HTTP webhook endpoints

### Alert Configuration

```javascript
// Configure alert thresholds
MonitoringConfig.alerts = {
  error_rate_threshold: 5,        // 5%
  response_time_threshold: 1000,  // 1 second
  cpu_usage_threshold: 80,        // 80%
  memory_usage_threshold: 85,     // 85%
  disk_usage_threshold: 90        // 90%
};
```

## 📈 Analytics & Reporting

### Report Types
- **Performance Report**: Response times, throughput, error analysis
- **Workflow Report**: Task metrics, efficiency analysis
- **System Report**: Resource usage, capacity planning
- **Comprehensive Report**: Combined analysis with insights

### Report Features
- **Executive Summary**: High-level overview for stakeholders
- **Trend Analysis**: Performance trends over time
- **Anomaly Detection**: Identification of unusual patterns
- **Recommendations**: Actionable optimization suggestions
- **Capacity Planning**: Resource usage projections

### Sample Report Structure

```javascript
{
  "type": "comprehensive",
  "timeRange": "24h",
  "overall_health": {
    "score": 87,
    "status": "healthy"
  },
  "executive_summary": {
    "status": "System operating within normal parameters",
    "critical_issues": 0,
    "recommendations": 3
  },
  "performance": { /* detailed performance metrics */ },
  "workflow": { /* workflow efficiency data */ },
  "system": { /* system health metrics */ },
  "recommendations": [
    {
      "priority": "high",
      "title": "Optimize response times",
      "description": "Focus on reducing average response time by 15%"
    }
  ]
}
```

## 🔌 Integration Points

### Database Monitoring
- Query performance tracking
- Connection pool monitoring
- Slow query detection

### AgentAPI Integration
- Request/response tracking
- Agent performance metrics
- Success/failure rates

### Webhook System
- Delivery success rates
- Processing times
- Failure analysis

### Linear Integration
- Ticket lifecycle tracking
- Resolution time analysis
- Workflow efficiency

## 🛠️ Development

### Running Examples

```bash
# Basic usage example
node monitoring/examples/basic-usage.js

# Custom integration example
node monitoring/examples/custom-integration.js
```

### Testing

```bash
# Run monitoring system tests
npm test -- monitoring/

# Run specific test suites
npm test -- monitoring/core/
npm test -- monitoring/dashboard/
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📝 Best Practices

### Performance
- Use appropriate collection intervals
- Implement data retention policies
- Monitor monitoring overhead (< 5% recommended)

### Security
- Sanitize sensitive data in metrics
- Use secure communication channels
- Implement proper access controls

### Scalability
- Use efficient storage backends for large deployments
- Implement metric aggregation for high-volume systems
- Consider distributed monitoring for microservices

## 🔍 Troubleshooting

### Common Issues

**High Memory Usage**
```javascript
// Reduce memory retention
MonitoringConfig.storage.max_memory_entries = 5000;
MonitoringConfig.retention.real_time_data = '30m';
```

**Dashboard Not Loading**
```javascript
// Check dashboard server status
const status = await monitoring.getStatus();
console.log(status.dashboard);
```

**Missing Metrics**
```javascript
// Verify metrics collector is running
const health = await monitoring.healthCheck();
console.log(health.checks);
```

### Debug Mode

```javascript
// Enable debug logging
process.env.DEBUG = 'monitoring:*';

// Or specific components
process.env.DEBUG = 'monitoring:collector,monitoring:alerts';
```

## 📚 Additional Resources

- [Configuration Reference](./docs/configuration.md)
- [API Documentation](./docs/api.md)
- [Dashboard Guide](./docs/dashboard.md)
- [Integration Examples](./examples/)
- [Performance Tuning](./docs/performance.md)

## 📄 License

This monitoring system is part of the Task Master project and follows the same licensing terms.

---

**Built with ❤️ for the Task Master ecosystem**

