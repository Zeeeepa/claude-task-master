# Advanced Error Recovery & Retry Logic System

A comprehensive error recovery and retry logic system designed to ensure system resilience and automatic recovery from failures across all CI/CD components.

## 🎯 Overview

This system provides intelligent error handling, retry logic, circuit breaker patterns, and automatic recovery mechanisms for the Claude Task Master project. It integrates seamlessly with PostgreSQL, Linear, GitHub, AgentAPI, and other external services.

## 🏗️ Architecture

### Core Components

1. **Central Error Handler** (`error-handler.js`)
   - Comprehensive error classification and analysis
   - Error correlation across system components
   - Predictive failure detection
   - Root cause analysis and pattern recognition

2. **Retry Manager** (`retry-manager.js`)
   - Intelligent retry strategies (exponential backoff, linear, adaptive)
   - Dead letter queue for failed operations
   - Adaptive retry policies based on historical success rates
   - Concurrent retry management

3. **Circuit Breaker** (`circuit-breaker.js`)
   - Multiple circuit breaker strategies (failure count, failure rate, response time)
   - Adaptive thresholds based on performance
   - Half-open state for gradual recovery testing
   - Per-service circuit breaker management

4. **Recovery Orchestrator** (`recovery-orchestrator.js`)
   - Orchestrates recovery workflows
   - Automatic and manual recovery strategies
   - State restoration and rollback capabilities
   - Graceful degradation management

5. **State Manager** (`state-manager.js`)
   - System state preservation and restoration
   - Transactional state changes with rollback
   - Automatic backup strategies
   - State validation and integrity checking

6. **Error Monitor** (`error-monitor.js`)
   - Real-time error monitoring and alerting
   - Comprehensive metrics collection
   - Trend analysis and pattern detection
   - Multi-channel alerting (log, email, webhook, etc.)

## 🚀 Quick Start

### Basic Usage

```javascript
import AdvancedErrorRecoverySystem from './src/recovery/index.js';

// Initialize the recovery system
const recoverySystem = new AdvancedErrorRecoverySystem({
    errorHandler: {
        enableRetry: true,
        enableCircuitBreaker: true,
        enablePredictiveFailure: true
    },
    retryManager: {
        enableAdaptive: true,
        maxConcurrentRetries: 5
    },
    errorMonitor: {
        enableRealTimeMonitoring: true,
        enableAlerting: true
    }
});

await recoverySystem.initialize();

// Execute operation with recovery support
const result = await recoverySystem.executeWithRecovery(
    async () => {
        // Your operation here
        return await someAPICall();
    },
    {
        source: 'linear',
        retry: true,
        retryOptions: {
            maxRetries: 3,
            strategy: 'exponential_backoff'
        },
        circuitBreaker: 'linear-api',
        enableRecovery: true
    }
);
```

### Database Integration

```javascript
// Configure database-specific recovery
recoverySystem.configureIntegration('postgresql', {
    circuitBreaker: {
        failureThreshold: 3,
        timeout: 30000,
        strategy: 'failure_count'
    },
    monitoring: {
        thresholds: {
            errorRate: 0.05,
            responseTime: 2000
        }
    },
    recovery: {
        strategies: {
            'network': 'gradual',
            'timeout': 'immediate'
        }
    }
});

// Execute database operation
const dbResult = await recoverySystem.executeWithRecovery(
    () => database.query('SELECT * FROM users'),
    {
        source: 'postgresql',
        circuitBreaker: 'postgresql-main',
        saveState: true
    }
);
```

### State Management

```javascript
// Transactional state management
const transactionId = await recoverySystem.stateManager.startTransaction(['user-session', 'cart-data']);

try {
    await recoverySystem.stateManager.saveState('user-session', userSessionData);
    await recoverySystem.stateManager.saveState('cart-data', cartData);
    
    // Perform operations...
    
    await recoverySystem.stateManager.commitTransaction(transactionId);
} catch (error) {
    await recoverySystem.stateManager.rollbackTransaction(transactionId);
    throw error;
}
```

## 📊 Monitoring & Alerting

### Dashboard Data

```javascript
const dashboard = recoverySystem.getDashboardData();
console.log('System Health Score:', dashboard.system.healthScore);
console.log('Active Alerts:', dashboard.alerts.length);
console.log('Success Rate:', dashboard.system.successRate);
```

### Custom Alerts

```javascript
// Set up custom alert thresholds
recoverySystem.errorMonitor.setAlertThreshold('errorRate', 0.1);
recoverySystem.errorMonitor.setAlertThreshold('responseTime', 5000);

// Listen for alerts
recoverySystem.errorMonitor.on('alert-created', (alert) => {
    console.log(`🚨 ALERT: ${alert.message}`);
    // Send to external monitoring system
});
```

## 🔧 Configuration

### Error Handler Configuration

```javascript
{
    enableRetry: true,
    enableCircuitBreaker: true,
    enablePredictiveFailure: true,
    enableCorrelation: true,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000,
    correlationWindow: 300000,
    predictionThreshold: 0.8
}
```

### Retry Manager Configuration

```javascript
{
    enableAdaptive: true,
    enableJitter: true,
    enableDeadLetterQueue: true,
    maxConcurrentRetries: 10,
    deadLetterQueueSize: 1000,
    adaptiveWindow: 300000
}
```

### Circuit Breaker Configuration

```javascript
{
    strategy: 'failure_count', // 'failure_count', 'failure_rate', 'response_time', 'hybrid'
    failureThreshold: 5,
    failureRateThreshold: 0.5,
    responseTimeThreshold: 5000,
    timeout: 60000,
    halfOpenMaxCalls: 3,
    enableAdaptive: true
}
```

### State Manager Configuration

```javascript
{
    enableAutoBackup: true,
    enableStateValidation: true,
    enableCompression: false,
    backupStrategy: 'on_change', // 'immediate', 'periodic', 'on_change', 'manual'
    backupInterval: 300000,
    maxBackups: 10,
    backupDirectory: './backups/state',
    stateDirectory: './state'
}
```

### Error Monitor Configuration

```javascript
{
    enableRealTimeMonitoring: true,
    enableAlerting: true,
    enableMetrics: true,
    enableTrending: true,
    monitoringInterval: 60000,
    alertingInterval: 30000,
    metricsRetention: 86400000,
    alertThresholds: {
        errorRate: 0.1,
        responseTime: 5000,
        availability: 0.95
    },
    alertChannels: ['log', 'webhook']
}
```

## 🔌 Integration Points

### PostgreSQL Database
- Connection failure recovery
- Query timeout handling
- Connection pool management
- Transaction rollback on errors

### Linear Integration
- API rate limit handling
- Authentication token refresh
- Request retry with backoff
- Graceful degradation

### GitHub Integration
- Rate limit compliance
- API failure recovery
- Webhook retry logic
- Authentication handling

### AgentAPI
- Service discovery
- Load balancing
- Timeout management
- Circuit breaker protection

### Claude Code
- Execution failure recovery
- Resource management
- State preservation
- Error classification

## 📈 Metrics & Analytics

### System Metrics
- Total operations
- Success/failure rates
- Recovery success rates
- Average response times
- System uptime
- Health scores

### Error Metrics
- Error rates by source
- Error categories and severity
- Error patterns and trends
- Correlation analysis
- Predictive failure indicators

### Performance Metrics
- Circuit breaker states
- Retry attempt statistics
- Recovery time measurements
- Resource utilization
- Throughput metrics

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test tests/recovery/error-recovery-system.test.js
```

Run example scenarios:

```bash
node src/recovery/examples/usage-example.js
```

## 🔍 Troubleshooting

### Common Issues

1. **High Error Rates**
   - Check service health
   - Review error patterns
   - Adjust retry policies
   - Verify circuit breaker thresholds

2. **Circuit Breaker Constantly Open**
   - Reduce failure threshold
   - Increase timeout duration
   - Check underlying service health
   - Review error classification

3. **State Corruption**
   - Enable state validation
   - Check backup integrity
   - Review transaction boundaries
   - Verify rollback procedures

4. **Performance Degradation**
   - Monitor retry concurrency
   - Adjust backoff strategies
   - Review circuit breaker settings
   - Check resource utilization

### Debug Mode

Enable debug logging:

```javascript
const recoverySystem = new AdvancedErrorRecoverySystem({
    debug: true,
    logLevel: 'debug'
});
```

### Health Checks

Monitor system health:

```javascript
const healthReport = recoverySystem.getHealthReport();
console.log('Health Score:', healthReport.healthScore);
console.log('Component Status:', healthReport.components);
```

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive tests for new features
3. Update documentation
4. Ensure backward compatibility
5. Test integration scenarios

## 📝 License

This project is licensed under the MIT License with Commons Clause.

## 🔗 Related Documentation

- [Error Classification Guide](./docs/error-classification.md)
- [Retry Strategies Guide](./docs/retry-strategies.md)
- [Circuit Breaker Patterns](./docs/circuit-breaker-patterns.md)
- [State Management Guide](./docs/state-management.md)
- [Monitoring Setup](./docs/monitoring-setup.md)
- [Integration Examples](./examples/)

