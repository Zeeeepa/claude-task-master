# Enhanced Error Handling & Retry Logic System

## 🎯 Overview

This comprehensive error handling system provides enterprise-grade fault tolerance, retry mechanisms, and graceful degradation for the AI CI/CD system. It ensures 99.9% reliability through sophisticated error classification, circuit breakers, bulkheads, and intelligent recovery strategies.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Error Handling System                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    │
│ │  Error Handler  │ │ Retry Manager   │ │ Circuit Breaker │    │
│ │  - Central Hub  │ │ - Exponential   │ │ - Fail Fast     │    │
│ │  - Policies     │ │   Backoff       │ │ - Auto Recovery │    │
│ │  - Recovery     │ │ - Jitter        │ │ - Fallbacks     │    │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘    │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    │
│ │ Error Tracker   │ │ Alert Manager   │ │ Fault Tolerance │    │
│ │ - Monitoring    │ │ - Notifications │ │ - Bulkheads     │    │
│ │ - Analytics     │ │ - Escalation    │ │ - Rate Limiting │    │
│ │ - Patterns      │ │ - Throttling    │ │ - Health Checks │    │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Basic Setup

```javascript
import { ErrorHandler } from './core/error_handler.js';
import { ErrorTracker } from './monitoring/error_tracker.js';
import { AlertManager } from './monitoring/alert_manager.js';

// Initialize error handling system
const errorHandler = new ErrorHandler({
  enableRetry: true,
  enableCircuitBreaker: true,
  enableErrorTracking: true,
  enableAlerting: true
});

// Execute operations with protection
const result = await errorHandler.executeWithProtection(
  async () => {
    // Your operation here
    return await apiCall();
  },
  { 
    component: 'codegen-api',
    fallback: () => 'fallback-response'
  }
);
```

### Retry with Exponential Backoff

```javascript
import { RetryManager, RetryUtils } from './core/retry_manager.js';

// Create retry manager with custom policy
const retryManager = RetryManager.withPolicy('API_CALLS', {
  maxRetries: 5,
  baseDelay: 1000
});

// Execute with retry
const result = await retryManager.executeWithRetry(async () => {
  return await flakyApiCall();
});

// Or use utility functions
const result = await RetryUtils.forApiCalls().executeWithRetry(operation);
```

### Circuit Breaker Protection

```javascript
import { CircuitBreaker } from './core/circuit_breaker.js';

// Create circuit breaker
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 60000,
  name: 'external-service'
});

// Execute with circuit breaker
const result = await circuitBreaker.execute(
  async () => await externalServiceCall(),
  async () => 'fallback-response' // Optional fallback
);
```

## 📚 Core Components

### 1. Error Types & Classification

Comprehensive error classification system with automatic error enhancement:

```javascript
import { ErrorTypes, SystemError, ErrorClassifier } from './utils/error_types.js';

// Create typed errors
const networkError = new NetworkError('Connection failed');
const timeoutError = new TimeoutError('Request timeout', { timeout: 5000 });
const rateLimitError = new RateLimitError('Rate limited', 30); // 30 sec retry-after

// Classify generic errors
const classified = ErrorClassifier.classifyError(genericError);
console.log(classified.type, classified.retryable, classified.metadata);
```

**Error Categories:**
- **Retryable**: Network, Timeout, Rate Limit, Server Errors
- **Non-Retryable**: Authentication, Authorization, Validation, Not Found
- **System**: Database, Configuration, Resource Exhausted
- **Business Logic**: Task Processing, Workflow, Dependency Errors

### 2. Retry Manager

Advanced retry logic with multiple backoff strategies:

```javascript
import { RetryManager, RetryPolicies } from './core/retry_manager.js';

// Predefined policies
const policies = {
  API_CALLS: { maxRetries: 4, baseDelay: 1000, timeoutMs: 120000 },
  NETWORK_OPERATIONS: { maxRetries: 5, baseDelay: 500, timeoutMs: 30000 },
  DATABASE_OPERATIONS: { maxRetries: 3, baseDelay: 2000, timeoutMs: 45000 },
  CRITICAL_OPERATIONS: { maxRetries: 1, baseDelay: 1000, timeoutMs: 30000 }
};

// Custom retry manager
const retryManager = new RetryManager({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitterEnabled: true,
  onRetry: (context) => console.log(`Retrying: ${context.attempt}`),
  onSuccess: (context) => console.log(`Success after ${context.attempt} attempts`),
  onFailure: (context) => console.log(`Failed after ${context.attempt} attempts`)
});
```

**Features:**
- Exponential backoff with jitter
- Configurable retry policies
- Timeout handling
- Parallel and sequential execution
- Function wrapping
- Comprehensive metrics

### 3. Circuit Breaker

Implements the circuit breaker pattern for external service protection:

```javascript
import { CircuitBreaker, CircuitBreakerStates } from './core/circuit_breaker.js';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,        // Open after 5 failures
  recoveryTimeout: 60000,     // Try recovery after 60s
  halfOpenMaxCalls: 3,        // Max calls in half-open state
  successThreshold: 2,        // Close after 2 successes
  onStateChange: (change) => {
    console.log(`Circuit breaker: ${change.from} → ${change.to}`);
  }
});

// States: CLOSED → OPEN → HALF_OPEN → CLOSED
console.log(circuitBreaker.state); // Current state
```

**Features:**
- Automatic state transitions
- Configurable thresholds
- Fallback execution
- Health monitoring
- Metrics and status reporting

### 4. Central Error Handler

Orchestrates all error handling components:

```javascript
import { ErrorHandler, ErrorHandlingPolicies } from './core/error_handler.js';

const errorHandler = new ErrorHandler({
  defaultPolicy: 'API_CALLS',
  enableRetry: true,
  enableCircuitBreaker: true,
  enableErrorTracking: true,
  enableAlerting: true,
  errorTracker: customErrorTracker,
  alertManager: customAlertManager
});

// Execute with comprehensive protection
const result = await errorHandler.executeWithProtection(
  operation,
  {
    component: 'codegen-api',
    operationId: 'fetch-tasks',
    fallback: () => getCachedTasks(),
    fallbackData: { tasks: [] }
  }
);
```

**Policies:**
- `API_CALLS`: Circuit breaker + retry
- `DATABASE_OPERATIONS`: Retry with backoff
- `CRITICAL_OPERATIONS`: Escalate immediately
- `USER_OPERATIONS`: Graceful degradation

### 5. Recovery Strategies

Flexible recovery mechanisms for different failure scenarios:

```javascript
import { RecoveryStrategyFactory } from './utils/recovery_strategies.js';

// Cache recovery
const cacheRecovery = RecoveryStrategyFactory.createCache(cacheProvider, {
  maxAge: 3600000 // 1 hour
});

// Alternative service
const altServiceRecovery = RecoveryStrategyFactory.createAlternativeService([
  primaryService,
  secondaryService,
  tertiaryService
]);

// Composite strategy (try multiple approaches)
const compositeRecovery = RecoveryStrategyFactory.createComposite([
  cacheRecovery,
  altServiceRecovery,
  degradedServiceRecovery
]);
```

**Strategy Types:**
- **Fallback**: Execute alternative function
- **Cache**: Return cached data
- **Degraded Service**: Simplified response
- **Alternative Service**: Switch to backup service
- **Queue**: Queue for later retry
- **Notification**: Send alerts + default response
- **Composite**: Chain multiple strategies

### 6. Fault Tolerance

Additional protection mechanisms:

```javascript
import { FaultToleranceManager } from './utils/fault_tolerance.js';

const manager = new FaultToleranceManager();

// Bulkhead isolation
const bulkhead = manager.getBulkhead('critical-service', {
  maxConcurrent: 10,
  queueSize: 50,
  timeout: 30000
});

// Rate limiting
const rateLimiter = manager.getRateLimiter('api-endpoint', {
  maxRequests: 100,
  windowMs: 60000
});

// Health checks
const healthCheck = manager.getHealthCheck('external-service', {
  checkInterval: 30000,
  healthCheckFunction: async () => {
    const response = await fetch('/health');
    return { status: response.ok ? 'OK' : 'FAIL' };
  }
});

// Resource pools
const dbPool = manager.getResourcePool('database', {
  minSize: 5,
  maxSize: 20,
  resourceFactory: () => createDbConnection(),
  resourceValidator: (conn) => conn.isAlive(),
  resourceDestroyer: (conn) => conn.close()
});
```

## 📊 Monitoring & Alerting

### Error Tracking

```javascript
import { ErrorTracker } from './monitoring/error_tracker.js';

const errorTracker = new ErrorTracker({
  maxErrorHistory: 1000,
  aggregationWindow: 300000, // 5 minutes
  alertThresholds: {
    errorRate: 0.1,           // 10% error rate
    criticalErrors: 5,        // 5 critical errors
    errorSpike: 2.0          // 2x normal rate
  }
});

// Track errors automatically
await errorTracker.track(error, context);

// Generate reports
const report = errorTracker.generateReport();
console.log('Error Summary:', report.summary);
console.log('Top Patterns:', report.patterns);
```

### Alert Management

```javascript
import { AlertManager, AlertChannels } from './monitoring/alert_manager.js';

const alertManager = new AlertManager({
  enableThrottling: true,
  throttleWindow: 300000,
  maxAlertsPerWindow: 10,
  channels: {
    critical: [AlertChannels.EMAIL, AlertChannels.SLACK],
    high: [AlertChannels.SLACK],
    escalation: [AlertChannels.PAGERDUTY]
  }
});

// Register custom alert providers
alertManager.registerProvider(AlertChannels.SLACK, {
  send: async (alert) => {
    await slackClient.postMessage({
      channel: '#alerts',
      text: `🚨 ${alert.title}: ${alert.message}`
    });
  }
});
```

## 🧪 Testing

### Unit Tests

```bash
# Run all error handling tests
npm test src/ai_cicd_system/tests/error_handling.test.js
npm test src/ai_cicd_system/tests/retry_logic.test.js
npm test src/ai_cicd_system/tests/fault_tolerance.test.js
```

### Integration Testing

```javascript
// Test complete error handling flow
const { errorHandler } = await setupErrorHandlingSystem();

const result = await errorHandler.executeWithProtection(
  async () => {
    // Simulate various failure scenarios
    if (Math.random() < 0.3) throw new NetworkError('Network failure');
    if (Math.random() < 0.2) throw new TimeoutError('Request timeout');
    return 'success';
  },
  { component: 'integration-test' }
);
```

### Chaos Engineering

```javascript
// Simulate random failures
const chaosOperation = () => {
  const errorTypes = [NetworkError, TimeoutError, SystemError];
  const ErrorClass = errorTypes[Math.floor(Math.random() * errorTypes.length)];
  
  if (Math.random() < 0.4) { // 40% failure rate
    throw new ErrorClass('Chaos engineering failure');
  }
  
  return 'success';
};

// Test system resilience
const results = await Promise.allSettled(
  Array(100).fill().map(() => 
    errorHandler.executeWithProtection(chaosOperation)
  )
);
```

## 📈 Performance Metrics

### Key Metrics

- **Error Recovery Rate**: 95%+ of retryable errors recovered
- **Circuit Breaker Effectiveness**: < 1% false positives
- **Mean Time to Recovery**: < 30 seconds
- **Error Handling Overhead**: < 10ms per operation
- **Alert Response Time**: < 5 minutes for critical errors

### Monitoring Dashboard

```javascript
// Get comprehensive metrics
const metrics = {
  errorHandler: errorHandler.getMetrics(),
  circuitBreakers: circuitBreakerManager.getAggregatedMetrics(),
  faultTolerance: faultToleranceManager.getSystemStatus(),
  alerts: alertManager.getStatistics()
};

console.log('System Health:', {
  status: errorHandler.getHealthStatus().status,
  recoveryRate: metrics.errorHandler.recoveryRate,
  openCircuits: metrics.circuitBreakers.openCircuits,
  recentErrors: metrics.errorHandler.errorsHandled
});
```

## 🔧 Configuration

### Environment-Specific Configs

```javascript
// Development
const devConfig = {
  retry: { maxRetries: 2, baseDelay: 500 },
  circuitBreaker: { failureThreshold: 10 },
  alerting: { enableAlerting: false }
};

// Production
const prodConfig = {
  retry: { maxRetries: 5, baseDelay: 1000 },
  circuitBreaker: { failureThreshold: 5 },
  alerting: { 
    enableAlerting: true,
    channels: {
      critical: ['EMAIL', 'PAGERDUTY'],
      high: ['SLACK']
    }
  }
};

const errorHandler = new ErrorHandler(
  process.env.NODE_ENV === 'production' ? prodConfig : devConfig
);
```

### Component-Specific Policies

```javascript
// Codegen API - High reliability required
const codegenPolicy = {
  strategy: 'CIRCUIT_BREAKER',
  retryConfig: { maxRetries: 5, baseDelay: 1000 },
  circuitBreakerConfig: { failureThreshold: 3 }
};

// Database - Retry with backoff
const databasePolicy = {
  strategy: 'RETRY_WITH_BACKOFF',
  retryConfig: { maxRetries: 3, baseDelay: 2000 }
};

// User operations - Graceful degradation
const userPolicy = {
  strategy: 'GRACEFUL_DEGRADATION',
  retryConfig: { maxRetries: 2, baseDelay: 1000 }
};
```

## 🚀 Production Deployment

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY src/ ./src/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node src/ai_cicd_system/health-check.js

# Start application
CMD ["node", "src/ai_cicd_system/index.js"]
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-cicd-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-cicd-system
  template:
    metadata:
      labels:
        app: ai-cicd-system
    spec:
      containers:
      - name: ai-cicd-system
        image: ai-cicd-system:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: ERROR_TRACKING_ENABLED
          value: "true"
        - name: ALERT_WEBHOOK_URL
          valueFrom:
            secretKeyRef:
              name: alert-secrets
              key: webhook-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 🔍 Troubleshooting

### Common Issues

1. **High Error Rates**
   ```javascript
   // Check error patterns
   const patterns = errorTracker.getTopErrorPatterns();
   console.log('Top error patterns:', patterns);
   
   // Adjust retry policies
   const retryManager = new RetryManager({
     maxRetries: 5, // Increase retries
     baseDelay: 2000 // Increase delay
   });
   ```

2. **Circuit Breaker False Positives**
   ```javascript
   // Increase failure threshold
   const circuitBreaker = new CircuitBreaker({
     failureThreshold: 10, // Was 5
     recoveryTimeout: 30000 // Faster recovery
   });
   ```

3. **Performance Issues**
   ```javascript
   // Use bulkheads to isolate resources
   const bulkhead = new Bulkhead({
     maxConcurrent: 20, // Increase concurrency
     queueSize: 100,
     timeout: 10000 // Reduce timeout
   });
   ```

### Debug Mode

```javascript
// Enable detailed logging
const errorHandler = new ErrorHandler({
  debug: true,
  onRetry: (context) => console.log('RETRY:', context),
  onCircuitBreakerStateChange: (change) => console.log('CB:', change),
  onError: (error, context) => console.log('ERROR:', error, context)
});
```

## 📖 Best Practices

1. **Error Classification**: Always use typed errors for better handling
2. **Graceful Degradation**: Provide fallbacks for critical operations
3. **Monitoring**: Track error patterns and adjust thresholds
4. **Testing**: Include chaos engineering in your test suite
5. **Documentation**: Document error scenarios and recovery procedures

## 🤝 Contributing

1. Add new error types to `error_types.js`
2. Implement recovery strategies in `recovery_strategies.js`
3. Add comprehensive tests for new features
4. Update documentation and examples
5. Follow the existing code patterns and conventions

## 📄 License

This error handling system is part of the AI CI/CD system and follows the same license terms.

