# 📊 Task Master Monitoring System

## Overview

The Task Master Monitoring System is a comprehensive, real-time monitoring and analytics platform designed to provide deep insights into system performance, workflow efficiency, and operational health. It features a modern web dashboard, intelligent alerting, and powerful analytics capabilities.

## 🎯 Key Features

### Real-Time Monitoring
- **Performance Metrics**: Response times, throughput, error rates
- **System Health**: CPU, memory, disk usage monitoring  
- **Workflow Analytics**: Task completion rates, PR success rates, cycle times
- **Live Data Streaming**: WebSocket-based real-time updates

### Intelligent Alerting
- **Configurable Thresholds**: Custom alert rules for different metrics
- **Multi-Channel Notifications**: Console, email, Slack, webhooks
- **Smart Deduplication**: Prevents alert spam with intelligent grouping
- **Severity-Based Routing**: Different notification channels based on alert severity

### Interactive Dashboard
- **Real-Time Visualization**: Live charts and metrics display
- **Custom Time Ranges**: 5m, 15m, 1h, 6h, 24h, 7d, 30d views
- **Export Capabilities**: CSV and JSON data export
- **Mobile Responsive**: Works on desktop, tablet, and mobile devices

### Advanced Analytics
- **Comprehensive Reports**: Performance, workflow, system, and combined analysis
- **Anomaly Detection**: Automatic identification of unusual patterns
- **Trend Analysis**: Performance trends and predictions
- **Actionable Insights**: Specific recommendations for optimization

## 🚀 Quick Start

### Installation

The monitoring system is included with Task Master. No additional installation required.

### Starting the Monitoring System

```bash
# Start with dashboard (recommended)
npm run monitoring:start

# Start with custom port
npm run monitoring start --port 3002

# Start without dashboard
npm run monitoring start --no-dashboard

# Run demo with sample data
npm run monitoring:demo
```

### Accessing the Dashboard

Once started, access the dashboard at:
```
http://localhost:3001
```

## 📈 Usage Guide

### Basic Monitoring Setup

```javascript
import MonitoringSystem from './monitoring/index.js';

const monitoring = new MonitoringSystem();

// Start monitoring
await monitoring.start({
  enableDashboard: true,
  dashboardPort: 3001
});

// Track custom events
await monitoring.trackEvent('user_login', {
  user_id: 'user_123',
  timestamp: Date.now()
});
```

### Performance Monitoring

```javascript
import { measurePerformance, Timer } from './utils/metrics.js';

// Using decorator for automatic measurement
class TaskService {
  @measurePerformance
  async processTask(task) {
    // Task processing logic
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
  assignee: 'user_456',
  estimated_hours: 8
});

await monitoring.trackEvent('task_completed', {
  task_id: 123,
  actual_hours: 6,
  success: true
});

// Track errors
await monitoring.trackEvent('error_occurred', {
  error_type: 'validation_error',
  severity: 'medium',
  component: 'task_validator'
});
```

## ⚙️ Configuration

### Default Configuration

The monitoring system comes with sensible defaults that work out of the box:

```javascript
// monitoring/core/monitoring-config.js
export const MonitoringConfig = {
  alerts: {
    error_rate_threshold: 5,        // 5%
    response_time_threshold: 1000,  // 1 second
    cpu_usage_threshold: 80,        // 80%
    memory_usage_threshold: 85,     // 85%
  },
  collection: {
    real_time_interval: 5000,       // 5 seconds
    performance_interval: 30000,    // 30 seconds
    system_health_interval: 60000,  // 1 minute
  },
  retention: {
    real_time_data: '1h',
    daily_aggregates: '90d',
    monthly_aggregates: '1y'
  }
};
```

### Custom Configuration

```javascript
import { MonitoringConfig } from './monitoring/core/monitoring-config.js';

// Customize alert thresholds
MonitoringConfig.alerts.error_rate_threshold = 3; // 3%
MonitoringConfig.alerts.response_time_threshold = 500; // 500ms

// Adjust collection intervals
MonitoringConfig.collection.real_time_interval = 10000; // 10 seconds

// Configure storage
MonitoringConfig.storage = {
  type: 'file',
  file_path: './monitoring/data',
  compression: true
};
```

## 📊 Dashboard Guide

### Main Dashboard

The dashboard provides a comprehensive view of system health:

1. **Header**: System status indicator and connection status
2. **Controls**: Time range selector and action buttons
3. **Metrics Grid**: Real-time performance, system, and workflow metrics
4. **Charts**: Interactive time-series visualizations
5. **Alerts Panel**: Active alerts and alert history

### Key Metrics

#### Performance Metrics
- **Response Time**: Average API response time
- **Throughput**: Requests per second
- **Error Rate**: Percentage of failed requests
- **Uptime**: System availability percentage

#### System Metrics
- **CPU Usage**: Processor utilization percentage
- **Memory Usage**: RAM utilization percentage
- **Disk Usage**: Storage utilization percentage
- **Active Connections**: Current database/API connections

#### Workflow Metrics
- **Task Completion Rate**: Percentage of successfully completed tasks
- **PR Success Rate**: Percentage of successful pull requests
- **Cycle Time**: Average time from task creation to completion
- **Queue Depth**: Number of pending tasks

### Interactive Features

- **Real-Time Updates**: Charts update automatically via WebSocket
- **Time Range Selection**: Choose from predefined ranges or custom periods
- **Data Export**: Download metrics as CSV or JSON
- **Alert Management**: View and acknowledge active alerts

## 🚨 Alerting System

### Alert Types

1. **Threshold Alerts**: Triggered when metrics exceed configured thresholds
2. **Anomaly Alerts**: Triggered when unusual patterns are detected
3. **System Health Alerts**: Triggered for critical system issues
4. **Custom Alerts**: User-defined alert conditions

### Severity Levels

- **Critical**: Immediate attention required (red)
- **High**: Important issues that need prompt attention (orange)
- **Medium**: Issues that should be addressed soon (yellow)
- **Low**: Informational alerts (green)

### Notification Channels

#### Console Notifications
Always enabled, provides immediate feedback in the terminal.

#### Email Notifications (Configurable)
```javascript
// Configure email notifications
MonitoringConfig.notifications = {
  email: {
    enabled: true,
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    },
    recipients: ['admin@company.com']
  }
};
```

#### Slack Notifications (Configurable)
```javascript
// Configure Slack notifications
MonitoringConfig.notifications = {
  slack: {
    enabled: true,
    webhook_url: process.env.SLACK_WEBHOOK_URL,
    channel: '#monitoring',
    username: 'TaskMaster Monitor'
  }
};
```

### Alert Configuration

```javascript
// Custom alert rules
MonitoringConfig.alerts = {
  // Performance thresholds
  error_rate_threshold: 5,
  response_time_threshold: 1000,
  
  // System resource thresholds
  cpu_usage_threshold: 80,
  memory_usage_threshold: 85,
  disk_usage_threshold: 90,
  
  // Workflow thresholds
  task_failure_threshold: 10,
  queue_depth_threshold: 100
};
```

## 📈 Analytics & Reporting

### Report Types

#### Performance Report
Analyzes system performance metrics including:
- Response time trends
- Throughput analysis
- Error rate patterns
- Performance recommendations

#### Workflow Report
Examines workflow efficiency including:
- Task completion statistics
- Cycle time analysis
- Bottleneck identification
- Process optimization suggestions

#### System Report
Reviews system health including:
- Resource utilization trends
- Capacity planning recommendations
- System stability analysis
- Infrastructure optimization

#### Comprehensive Report
Combines all report types with:
- Executive summary
- Cross-cutting insights
- Prioritized action items
- Overall health assessment

### Generating Reports

#### CLI Commands
```bash
# Generate comprehensive report
npm run monitoring report

# Generate specific report type
npm run monitoring report --type performance --range 7d

# Save report to file
npm run monitoring report --output report.json

# Include raw data
npm run monitoring report --raw
```

#### Programmatic API
```javascript
// Generate reports programmatically
const report = await monitoring.generateReport('comprehensive', '24h', {
  includeRawData: false
});

console.log(report.executive_summary);
console.log(report.recommendations);
```

### Sample Report Structure

```json
{
  "type": "comprehensive",
  "timeRange": "24h",
  "timestamp": 1640995200000,
  "overall_health": {
    "score": 87,
    "status": "healthy",
    "critical_issues": 0,
    "warnings": 2
  },
  "executive_summary": {
    "status": "System operating within normal parameters",
    "key_metrics": {
      "uptime": "99.5%",
      "performance": "Good",
      "efficiency": "High"
    }
  },
  "recommendations": [
    {
      "priority": "high",
      "title": "Optimize response times",
      "description": "Focus on reducing average response time by 15%",
      "action": "Review slow queries and implement caching"
    }
  ]
}
```

## 🔌 Integration Points

### Database Monitoring

The system automatically monitors database performance:

```javascript
// Database query monitoring
await monitoring.trackEvent('database_query', {
  query_type: 'SELECT',
  table: 'tasks',
  duration: 150,
  rows_affected: 25
});
```

### AgentAPI Integration

Tracks agent performance and success rates:

```javascript
// Agent request monitoring
await monitoring.trackEvent('agent_request', {
  agent_type: 'claude',
  operation: 'task_processing',
  success: true,
  duration: 2500
});
```

### Webhook System

Monitors webhook delivery and processing:

```javascript
// Webhook monitoring
await monitoring.trackEvent('webhook_delivery', {
  webhook_id: 'webhook_123',
  endpoint: 'https://api.example.com/webhook',
  status_code: 200,
  delivery_time: 350
});
```

### Linear Integration

Tracks ticket lifecycle and resolution times:

```javascript
// Linear ticket monitoring
await monitoring.trackEvent('ticket_created', {
  ticket_id: 'TASK-123',
  priority: 'high',
  assignee: 'user_456'
});

await monitoring.trackEvent('ticket_resolved', {
  ticket_id: 'TASK-123',
  resolution_time: 86400000, // 24 hours
  resolution_type: 'completed'
});
```

## 🛠️ CLI Reference

### Available Commands

```bash
# Start monitoring system
npm run monitoring start [options]

# Check system status
npm run monitoring status

# Generate reports
npm run monitoring report [options]

# Run demo with sample data
npm run monitoring demo

# Perform health check
npm run monitoring health
```

### Command Options

#### Start Command
```bash
npm run monitoring start \
  --port 3001 \           # Dashboard port
  --host localhost \      # Dashboard host
  --no-dashboard \        # Disable dashboard
  --config ./config.js    # Custom config file
```

#### Report Command
```bash
npm run monitoring report \
  --type comprehensive \  # Report type
  --range 24h \          # Time range
  --output report.json \ # Output file
  --raw                  # Include raw data
```

## 🔍 Troubleshooting

### Common Issues

#### High Memory Usage
```javascript
// Reduce memory retention
MonitoringConfig.storage.max_memory_entries = 5000;
MonitoringConfig.retention.real_time_data = '30m';
```

#### Dashboard Not Loading
```bash
# Check if monitoring is running
npm run monitoring status

# Check dashboard server status
curl http://localhost:3001/health
```

#### Missing Metrics
```bash
# Verify metrics collector is running
npm run monitoring health

# Check for errors in logs
DEBUG=monitoring:* npm run monitoring start
```

#### Performance Impact
```javascript
// Reduce collection frequency
MonitoringConfig.collection.real_time_interval = 30000; // 30 seconds
MonitoringConfig.collection.performance_interval = 120000; // 2 minutes
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Enable all monitoring debug logs
DEBUG=monitoring:* npm run monitoring start

# Enable specific component logs
DEBUG=monitoring:collector,monitoring:alerts npm run monitoring start
```

### Health Checks

The monitoring system includes built-in health checks:

```bash
# Perform comprehensive health check
npm run monitoring health

# Check specific components
curl http://localhost:3001/api/status
```

## 📚 Best Practices

### Performance Optimization

1. **Collection Intervals**: Use appropriate intervals based on your needs
   - Real-time: 5-10 seconds for critical metrics
   - Performance: 30-60 seconds for general monitoring
   - System: 1-5 minutes for resource monitoring

2. **Data Retention**: Configure retention policies to manage storage
   - Real-time data: 1-6 hours
   - Hourly aggregates: 7-30 days
   - Daily aggregates: 90-365 days

3. **Memory Management**: Monitor memory usage and adjust limits
   - Use file storage for large deployments
   - Implement data compression
   - Regular cleanup of old data

### Security Considerations

1. **Data Sanitization**: Remove sensitive information from metrics
2. **Access Control**: Secure dashboard access with authentication
3. **Network Security**: Use HTTPS for dashboard in production
4. **API Security**: Implement rate limiting and authentication

### Scalability Guidelines

1. **Distributed Monitoring**: Consider multiple monitoring instances for large systems
2. **Metric Aggregation**: Use aggregation for high-volume metrics
3. **Storage Backends**: Use appropriate storage for your scale
4. **Load Balancing**: Distribute dashboard load across multiple instances

## 🔄 Maintenance

### Regular Tasks

1. **Data Cleanup**: Old metrics are automatically cleaned up based on retention policies
2. **Health Monitoring**: Regular health checks ensure system reliability
3. **Performance Review**: Weekly/monthly performance report reviews
4. **Alert Tuning**: Adjust thresholds based on system behavior

### Backup and Recovery

```bash
# Backup monitoring data (file storage)
tar -czf monitoring-backup.tar.gz monitoring/data/

# Restore monitoring data
tar -xzf monitoring-backup.tar.gz
```

### Updates and Upgrades

The monitoring system is updated as part of Task Master releases. Check the changelog for monitoring-specific updates.

## 📞 Support

For issues, questions, or feature requests related to the monitoring system:

1. Check this documentation
2. Review the troubleshooting section
3. Check the GitHub issues
4. Create a new issue with detailed information

## 🔗 Related Documentation

- [Task Master README](../README.md)
- [API Documentation](./API.md)
- [Configuration Reference](./CONFIGURATION.md)
- [Development Guide](./DEVELOPMENT.md)

---

**The Task Master Monitoring System - Comprehensive insights for optimal performance** 📊

