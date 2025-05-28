/**
 * Error Handling Integration Example
 * 
 * Demonstrates how to use the comprehensive error handling system
 * with retry logic, circuit breakers, and fault tolerance.
 */

import { ErrorHandler } from '../core/error_handler.js';
import { RetryManager, RetryUtils } from '../core/retry_manager.js';
import { CircuitBreaker, CircuitBreakerUtils } from '../core/circuit_breaker.js';
import { ErrorTracker } from '../monitoring/error_tracker.js';
import { AlertManager } from '../monitoring/alert_manager.js';
import { 
  ErrorTypes, 
  SystemError, 
  NetworkError, 
  TimeoutError 
} from '../utils/error_types.js';
import { 
  RecoveryStrategyFactory 
} from '../utils/recovery_strategies.js';
import { 
  FaultToleranceManager 
} from '../utils/fault_tolerance.js';

/**
 * Example: Setting up comprehensive error handling for an AI CI/CD system
 */
export async function setupErrorHandlingSystem() {
  console.log('🚀 Setting up comprehensive error handling system...\n');

  // 1. Initialize Error Tracker
  const errorTracker = new ErrorTracker({
    maxErrorHistory: 1000,
    enablePersistence: false, // Would use real persistence in production
    alertThresholds: {
      errorRate: 0.1,
      criticalErrors: 3,
      errorSpike: 2.0
    }
  });

  // 2. Initialize Alert Manager
  const alertManager = new AlertManager({
    enableThrottling: true,
    throttleWindow: 300000, // 5 minutes
    maxAlertsPerWindow: 5,
    channels: {
      critical: ['CONSOLE', 'EMAIL'],
      high: ['CONSOLE'],
      escalation: ['CONSOLE', 'SLACK']
    }
  });

  // 3. Initialize Fault Tolerance Manager
  const faultToleranceManager = new FaultToleranceManager();

  // 4. Initialize Central Error Handler
  const errorHandler = new ErrorHandler({
    errorTracker,
    alertManager,
    enableRetry: true,
    enableCircuitBreaker: true,
    enableErrorTracking: true,
    enableAlerting: true
  });

  console.log('✅ Error handling system initialized\n');
  return { errorHandler, errorTracker, alertManager, faultToleranceManager };
}

/**
 * Example: Simulating various error scenarios
 */
export async function demonstrateErrorScenarios(errorHandler) {
  console.log('🎭 Demonstrating various error scenarios...\n');

  // Scenario 1: Network errors with retry
  console.log('📡 Scenario 1: Network errors with retry');
  try {
    let attempt = 0;
    const flakyNetworkOperation = () => {
      attempt++;
      if (attempt <= 2) {
        throw new NetworkError(`Network failure attempt ${attempt}`);
      }
      return `Success after ${attempt} attempts`;
    };

    const result = await errorHandler.executeWithRetry(
      flakyNetworkOperation,
      { component: 'codegen-api', operationId: 'fetch-tasks' }
    );
    console.log(`   ✅ ${result}\n`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
  }

  // Scenario 2: Circuit breaker protection
  console.log('🔌 Scenario 2: Circuit breaker protection');
  const circuitBreaker = errorHandler.getCircuitBreaker('external-service', {
    failureThreshold: 3,
    recoveryTimeout: 5000
  });

  // Simulate service failures
  for (let i = 1; i <= 5; i++) {
    try {
      await circuitBreaker.execute(
        () => {
          if (i <= 3) {
            throw new Error(`Service failure ${i}`);
          }
          return `Service call ${i} success`;
        },
        () => 'Fallback response'
      );
    } catch (error) {
      console.log(`   ⚠️ Attempt ${i}: ${error.message}`);
    }
  }

  // After circuit opens, fallback should be used
  try {
    const result = await circuitBreaker.execute(
      () => { throw new Error('Service still down'); },
      () => 'Fallback response'
    );
    console.log(`   🔄 Circuit open, using fallback: ${result}\n`);
  } catch (error) {
    console.log(`   ❌ Circuit breaker error: ${error.message}\n`);
  }

  // Scenario 3: Graceful degradation
  console.log('🎯 Scenario 3: Graceful degradation');
  try {
    const result = await errorHandler.executeWithProtection(
      () => {
        throw new SystemError(
          'Database temporarily unavailable',
          ErrorTypes.DATABASE_ERROR,
          true
        );
      },
      {
        component: 'task-storage',
        fallback: () => ({
          tasks: [],
          message: 'Using cached data due to database issues',
          degraded: true
        })
      }
    );
    console.log(`   🔄 Degraded response:`, result, '\n');
  } catch (error) {
    console.log(`   ❌ Degradation failed: ${error.message}\n`);
  }
}

/**
 * Example: Using recovery strategies
 */
export async function demonstrateRecoveryStrategies() {
  console.log('🛠️ Demonstrating recovery strategies...\n');

  // Cache recovery strategy
  console.log('💾 Cache Recovery Strategy');
  const mockCache = new Map();
  mockCache.set('user-data', {
    data: { user: 'john', preferences: {} },
    timestamp: Date.now()
  });

  const cacheRecovery = RecoveryStrategyFactory.createCache({
    get: (key) => Promise.resolve(mockCache.get(key))
  });

  try {
    const result = await cacheRecovery.execute(
      new SystemError('API unavailable', ErrorTypes.SERVER_ERROR, true),
      { cacheKey: 'user-data' }
    );
    console.log('   ✅ Cache recovery successful:', result.user, '\n');
  } catch (error) {
    console.log(`   ❌ Cache recovery failed: ${error.message}\n`);
  }

  // Alternative service recovery
  console.log('🔄 Alternative Service Recovery');
  const alternativeServices = [
    () => { throw new Error('Primary service down'); },
    () => { throw new Error('Secondary service down'); },
    () => Promise.resolve('Tertiary service response')
  ];

  const altServiceRecovery = RecoveryStrategyFactory.createAlternativeService(
    alternativeServices
  );

  try {
    const result = await altServiceRecovery.execute(
      new SystemError('Service unavailable', ErrorTypes.SERVER_ERROR, true),
      {}
    );
    console.log('   ✅ Alternative service successful:', result, '\n');
  } catch (error) {
    console.log(`   ❌ All alternatives failed: ${error.message}\n`);
  }
}

/**
 * Example: Fault tolerance with bulkheads and rate limiting
 */
export async function demonstrateFaultTolerance(faultToleranceManager) {
  console.log('🛡️ Demonstrating fault tolerance mechanisms...\n');

  // Bulkhead isolation
  console.log('📦 Bulkhead Isolation');
  const bulkhead = faultToleranceManager.getBulkhead('critical-service', {
    maxConcurrent: 2,
    queueSize: 3,
    timeout: 1000
  });

  const operations = Array(5).fill().map((_, i) => 
    () => new Promise(resolve => 
      setTimeout(() => resolve(`Operation ${i + 1} complete`), 100)
    )
  );

  try {
    const results = await Promise.all(
      operations.map(op => bulkhead.execute(op))
    );
    console.log('   ✅ Bulkhead operations:', results, '\n');
  } catch (error) {
    console.log(`   ❌ Bulkhead error: ${error.message}\n`);
  }

  // Rate limiting
  console.log('⏱️ Rate Limiting');
  const rateLimiter = faultToleranceManager.getRateLimiter('api-endpoint', {
    maxRequests: 3,
    windowMs: 2000
  });

  for (let i = 1; i <= 5; i++) {
    try {
      await rateLimiter.execute(() => Promise.resolve(`API call ${i}`));
      console.log(`   ✅ API call ${i} successful`);
    } catch (error) {
      console.log(`   ⚠️ API call ${i} rate limited: ${error.message}`);
    }
  }
  console.log();
}

/**
 * Example: Monitoring and alerting
 */
export async function demonstrateMonitoring(errorTracker, alertManager) {
  console.log('📊 Demonstrating monitoring and alerting...\n');

  // Generate some errors for tracking
  const errors = [
    new SystemError('Database connection failed', ErrorTypes.DATABASE_ERROR, true),
    new NetworkError('API timeout'),
    new SystemError('Authentication failed', ErrorTypes.AUTHENTICATION_ERROR, false),
    new SystemError('Rate limit exceeded', ErrorTypes.RATE_LIMIT_ERROR, true),
    new SystemError('Critical system failure', ErrorTypes.RESOURCE_EXHAUSTED, false)
  ];

  // Track errors
  for (const error of errors) {
    await errorTracker.track(error, {
      component: 'ai-cicd-system',
      operationId: `op-${Date.now()}`,
      userId: 'user-123'
    });
  }

  // Generate error report
  const report = errorTracker.generateReport();
  console.log('📈 Error Report:');
  console.log(`   Total Errors: ${report.summary.totalErrors}`);
  console.log(`   Recent Errors: ${report.summary.recentErrors}`);
  console.log(`   Critical Errors: ${report.summary.criticalErrors}`);
  console.log(`   Error Rate: ${report.summary.errorRate.toFixed(2)}/s`);
  console.log('   By Type:', report.breakdown.byType);
  console.log();

  // Test alerting
  console.log('🚨 Testing Alert System');
  const criticalError = new SystemError(
    'System memory exhausted',
    ErrorTypes.RESOURCE_EXHAUSTED,
    false
  );

  await alertManager.sendAlert(criticalError, {
    component: 'ai-cicd-system',
    escalated: true
  });

  // Get alert statistics
  const alertStats = alertManager.getStatistics();
  console.log('📊 Alert Statistics:');
  console.log(`   Total Alerts: ${alertStats.total}`);
  console.log(`   By Severity:`, alertStats.bySeverity);
  console.log(`   By Type:`, alertStats.byType);
  console.log();
}

/**
 * Example: Performance testing
 */
export async function demonstratePerformance(errorHandler) {
  console.log('⚡ Performance testing error handling...\n');

  const operations = Array(100).fill().map((_, i) => 
    () => {
      // Simulate 10% error rate
      if (Math.random() < 0.1) {
        throw new NetworkError(`Random error ${i}`);
      }
      return `Success ${i}`;
    }
  );

  const startTime = Date.now();
  
  const results = await Promise.allSettled(
    operations.map(op => 
      errorHandler.executeWithProtection(op, { component: 'performance-test' })
    )
  );

  const endTime = Date.now();
  const duration = endTime - startTime;

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`⏱️ Performance Results:`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Operations: ${operations.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Avg time per operation: ${(duration / operations.length).toFixed(2)}ms`);
  console.log();

  // Get error handler metrics
  const metrics = errorHandler.getMetrics();
  console.log('📊 Error Handler Metrics:');
  console.log(`   Errors Handled: ${metrics.errorsHandled}`);
  console.log(`   Errors Recovered: ${metrics.errorsRecovered}`);
  console.log(`   Recovery Rate: ${(metrics.recoveryRate * 100).toFixed(1)}%`);
  console.log();
}

/**
 * Main demonstration function
 */
export async function runErrorHandlingDemo() {
  console.log('🎯 AI CI/CD System - Enhanced Error Handling Demo\n');
  console.log('=' .repeat(60) + '\n');

  try {
    // Setup
    const { errorHandler, errorTracker, alertManager, faultToleranceManager } = 
      await setupErrorHandlingSystem();

    // Demonstrate different aspects
    await demonstrateErrorScenarios(errorHandler);
    await demonstrateRecoveryStrategies();
    await demonstrateFaultTolerance(faultToleranceManager);
    await demonstrateMonitoring(errorTracker, alertManager);
    await demonstratePerformance(errorHandler);

    // Final system health check
    console.log('🏥 Final System Health Check');
    const health = errorHandler.getHealthStatus();
    console.log(`   Status: ${health.status}`);
    console.log(`   Recovery Rate: ${(health.recoveryRate * 100).toFixed(1)}%`);
    console.log(`   Total Errors: ${health.totalErrors}`);
    console.log();

    console.log('✅ Error handling demonstration completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runErrorHandlingDemo().catch(console.error);
}

export default {
  setupErrorHandlingSystem,
  demonstrateErrorScenarios,
  demonstrateRecoveryStrategies,
  demonstrateFaultTolerance,
  demonstrateMonitoring,
  demonstratePerformance,
  runErrorHandlingDemo
};

