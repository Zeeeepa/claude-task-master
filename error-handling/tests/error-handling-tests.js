/**
 * error-handling-tests.js
 * 
 * Comprehensive test suite for the error handling and retry logic system.
 * Tests error classification, retry strategies, analytics, and escalation.
 */

import { log } from '../../scripts/modules/utils.js';
import { errorClassifier, ErrorTypes } from '../core/error-classifier.js';
import { retryManager, RetryStrategies, CircuitBreakerStates } from '../../utils/retry-manager.js';
import { errorAnalytics } from '../analytics/error-analytics.js';
import { escalationManager, EscalationLevels } from '../escalation/escalation-manager.js';
import { globalErrorHandler, createErrorContext } from '../../middleware/error-handler.js';

/**
 * Test error generator for creating various error types
 */
class TestErrorGenerator {
  static createSyntaxError() {
    const error = new Error('Unexpected token } in JSON at position 42');
    error.name = 'SyntaxError';
    return error;
  }

  static createNetworkError() {
    const error = new Error('Connection refused: ECONNREFUSED');
    error.code = 'ECONNREFUSED';
    return error;
  }

  static createAPIError() {
    const error = new Error('Rate limit exceeded. Please try again later.');
    error.status = 429;
    return error;
  }

  static createAuthError() {
    const error = new Error('Invalid API key provided');
    error.status = 401;
    return error;
  }

  static createValidationError() {
    const error = new Error('Validation failed: required field missing');
    return error;
  }

  static createResourceError() {
    const error = new Error('Out of memory: heap limit exceeded');
    error.code = 'ENOMEM';
    return error;
  }

  static createCustomError(message, code, status) {
    const error = new Error(message);
    if (code) error.code = code;
    if (status) error.status = status;
    return error;
  }
}

/**
 * Test runner for error handling system
 */
export class ErrorHandlingTestRunner {
  constructor() {
    this.testResults = [];
    this.testStats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * Run all error handling tests
   */
  async runAllTests() {
    log('info', '🧪 Starting comprehensive error handling tests...');
    
    try {
      // Clear any existing data
      this._resetTestEnvironment();

      // Run test suites
      await this._runClassificationTests();
      await this._runRetryManagerTests();
      await this._runAnalyticsTests();
      await this._runEscalationTests();
      await this._runIntegrationTests();
      await this._runPerformanceTests();

      // Generate test report
      const report = this._generateTestReport();
      log('info', '📊 Test Results:', report);

      return report;
    } catch (error) {
      log('error', `Test runner failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test error classification system
   */
  async _runClassificationTests() {
    log('info', '🔍 Running error classification tests...');

    // Test 1: Syntax error classification
    await this._runTest('Syntax Error Classification', async () => {
      const error = TestErrorGenerator.createSyntaxError();
      const classification = errorClassifier.classify(error);
      
      this._assert(classification.type === 'SYNTAX_ERROR', 'Should classify as SYNTAX_ERROR');
      this._assert(classification.confidence > 0.8, 'Should have high confidence');
      this._assert(classification.strategy === 'auto-fix', 'Should use auto-fix strategy');
    });

    // Test 2: Network error classification
    await this._runTest('Network Error Classification', async () => {
      const error = TestErrorGenerator.createNetworkError();
      const classification = errorClassifier.classify(error);
      
      this._assert(classification.type === 'NETWORK_ERROR', 'Should classify as NETWORK_ERROR');
      this._assert(classification.maxRetries >= 5, 'Should allow multiple retries');
    });

    // Test 3: API error classification
    await this._runTest('API Error Classification', async () => {
      const error = TestErrorGenerator.createAPIError();
      const classification = errorClassifier.classify(error);
      
      this._assert(classification.type === 'API_ERROR', 'Should classify as API_ERROR');
      this._assert(classification.severity === 'medium', 'Should have medium severity');
    });

    // Test 4: Authentication error classification
    await this._runTest('Authentication Error Classification', async () => {
      const error = TestErrorGenerator.createAuthError();
      const classification = errorClassifier.classify(error);
      
      this._assert(classification.type === 'AUTHENTICATION_ERROR', 'Should classify as AUTHENTICATION_ERROR');
      this._assert(classification.severity === 'high', 'Should have high severity');
      this._assert(classification.maxRetries <= 1, 'Should not retry auth errors');
    });

    // Test 5: Classification caching
    await this._runTest('Classification Caching', async () => {
      const error = TestErrorGenerator.createSyntaxError();
      
      const start1 = Date.now();
      const classification1 = errorClassifier.classify(error);
      const time1 = Date.now() - start1;
      
      const start2 = Date.now();
      const classification2 = errorClassifier.classify(error);
      const time2 = Date.now() - start2;
      
      this._assert(classification1.type === classification2.type, 'Classifications should match');
      this._assert(time2 < time1, 'Second classification should be faster (cached)');
    });
  }

  /**
   * Test retry manager functionality
   */
  async _runRetryManagerTests() {
    log('info', '🔄 Running retry manager tests...');

    // Test 1: Successful retry after failures
    await this._runTest('Successful Retry After Failures', async () => {
      let attempts = 0;
      
      const result = await retryManager.executeWithRetry(async () => {
        attempts++;
        if (attempts < 3) {
          throw TestErrorGenerator.createNetworkError();
        }
        return 'success';
      }, {
        maxRetries: 5,
        baseDelay: 10, // Fast for testing
        operationName: 'test_retry'
      });
      
      this._assert(result === 'success', 'Should return success result');
      this._assert(attempts === 3, 'Should have made 3 attempts');
    });

    // Test 2: Retry exhaustion
    await this._runTest('Retry Exhaustion', async () => {
      let attempts = 0;
      
      try {
        await retryManager.executeWithRetry(async () => {
          attempts++;
          throw TestErrorGenerator.createNetworkError();
        }, {
          maxRetries: 2,
          baseDelay: 10,
          operationName: 'test_exhaustion'
        });
        
        this._assert(false, 'Should have thrown error after exhausting retries');
      } catch (error) {
        this._assert(attempts === 3, 'Should have made 3 attempts (initial + 2 retries)');
        this._assert(error.retryInfo, 'Error should have retry information');
      }
    });

    // Test 3: Circuit breaker functionality
    await this._runTest('Circuit Breaker', async () => {
      const operationType = 'test_circuit_breaker';
      
      // Trigger circuit breaker by causing multiple failures
      for (let i = 0; i < 6; i++) {
        try {
          await retryManager.executeWithRetry(async () => {
            throw TestErrorGenerator.createNetworkError();
          }, {
            maxRetries: 0,
            operationType,
            operationName: `test_cb_${i}`
          });
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Next call should be rejected by circuit breaker
      try {
        await retryManager.executeWithRetry(async () => {
          return 'should not execute';
        }, {
          maxRetries: 0,
          operationType,
          operationName: 'test_cb_rejected'
        });
        
        this._assert(false, 'Circuit breaker should have rejected the call');
      } catch (error) {
        this._assert(error.message.includes('Circuit breaker'), 'Should be circuit breaker error');
      }
    });

    // Test 4: Exponential backoff timing
    await this._runTest('Exponential Backoff Timing', async () => {
      const delays = [];
      let attempts = 0;
      
      try {
        await retryManager.executeWithRetry(async () => {
          attempts++;
          const start = Date.now();
          
          if (attempts > 1) {
            delays.push(Date.now() - start);
          }
          
          throw TestErrorGenerator.createNetworkError();
        }, {
          maxRetries: 3,
          baseDelay: 100,
          strategy: RetryStrategies.EXPONENTIAL_BACKOFF,
          operationName: 'test_backoff'
        });
      } catch (error) {
        // Expected to fail
      }
      
      this._assert(attempts === 4, 'Should have made 4 attempts');
      // Note: Actual delay testing would require more sophisticated timing
    });
  }

  /**
   * Test error analytics functionality
   */
  async _runAnalyticsTests() {
    log('info', '📊 Running analytics tests...');

    // Test 1: Error recording and retrieval
    await this._runTest('Error Recording and Retrieval', async () => {
      const error = TestErrorGenerator.createSyntaxError();
      const classification = errorClassifier.classify(error);
      
      const errorId = errorAnalytics.recordError(error, classification, {
        operation: 'test_operation',
        component: 'test_component'
      });
      
      this._assert(errorId, 'Should return error ID');
      this._assert(errorId.startsWith('err_'), 'Error ID should have correct prefix');
      
      const stats = errorAnalytics.getErrorStats('1h');
      this._assert(stats.summary.totalErrors >= 1, 'Should record at least one error');
    });

    // Test 2: Error resolution tracking
    await this._runTest('Error Resolution Tracking', async () => {
      const error = TestErrorGenerator.createValidationError();
      const classification = errorClassifier.classify(error);
      
      const errorId = errorAnalytics.recordError(error, classification);
      const resolved = errorAnalytics.recordResolution(errorId, 'auto-fix', true, {
        fixType: 'validation_correction'
      });
      
      this._assert(resolved, 'Should successfully record resolution');
      
      const effectiveness = errorAnalytics.getResolutionEffectiveness();
      const autoFixStrategy = effectiveness.find(s => s.strategy === 'auto-fix');
      this._assert(autoFixStrategy, 'Should find auto-fix strategy in effectiveness data');
    });

    // Test 3: Error pattern detection
    await this._runTest('Error Pattern Detection', async () => {
      // Record multiple similar errors
      for (let i = 0; i < 5; i++) {
        const error = TestErrorGenerator.createCustomError(`Validation failed: field ${i} missing`);
        const classification = errorClassifier.classify(error);
        errorAnalytics.recordError(error, classification);
      }
      
      const patterns = errorAnalytics.getErrorPatterns({ minOccurrences: 3 });
      this._assert(patterns.length > 0, 'Should detect error patterns');
      
      const validationPattern = patterns.find(p => p.pattern.includes('validation'));
      this._assert(validationPattern, 'Should detect validation error pattern');
    });

    // Test 4: Dashboard data generation
    await this._runTest('Dashboard Data Generation', async () => {
      const dashboardData = errorAnalytics.getDashboardData();
      
      this._assert(dashboardData.current, 'Should have current data');
      this._assert(dashboardData.trends, 'Should have trends data');
      this._assert(dashboardData.recentErrors, 'Should have recent errors');
      this._assert(typeof dashboardData.systemHealth === 'number', 'Should have system health score');
    });
  }

  /**
   * Test escalation manager functionality
   */
  async _runEscalationTests() {
    log('info', '🚨 Running escalation tests...');

    // Test 1: Critical error escalation
    await this._runTest('Critical Error Escalation', async () => {
      const error = TestErrorGenerator.createAuthError();
      const classification = errorClassifier.classify(error);
      
      const result = await escalationManager.evaluateEscalation(error, classification, {
        operation: 'test_auth',
        environment: 'production'
      });
      
      this._assert(result.escalated, 'Should escalate critical error');
      this._assert(result.level.level >= EscalationLevels.CRITICAL.level, 'Should escalate to critical level');
    });

    // Test 2: Escalation cooldown
    await this._runTest('Escalation Cooldown', async () => {
      const error = TestErrorGenerator.createNetworkError();
      const classification = errorClassifier.classify(error);
      const context = { operation: 'test_cooldown' };
      
      // First escalation
      const result1 = await escalationManager.evaluateEscalation(error, classification, context);
      
      // Immediate second escalation (should be in cooldown)
      const result2 = await escalationManager.evaluateEscalation(error, classification, context);
      
      this._assert(result1.escalated, 'First escalation should succeed');
      this._assert(!result2.escalated || result2.reason === 'cooldown_period', 'Second escalation should be in cooldown');
    });

    // Test 3: Escalation rule evaluation
    await this._runTest('Escalation Rule Evaluation', async () => {
      // Add custom rule for testing
      escalationManager.addRule('test_rule', {
        condition: (error, classification, context) => {
          return context.testFlag === true;
        },
        escalationLevel: EscalationLevels.SUPPORT,
        immediateNotification: true,
        channels: ['log'],
        maxRetries: 1
      });
      
      const error = TestErrorGenerator.createValidationError();
      const classification = errorClassifier.classify(error);
      
      const result = await escalationManager.evaluateEscalation(error, classification, {
        testFlag: true
      });
      
      this._assert(result.escalated, 'Should escalate with custom rule');
      this._assert(result.rule === 'test_rule', 'Should use custom rule');
    });

    // Test 4: Escalation statistics
    await this._runTest('Escalation Statistics', async () => {
      const stats = escalationManager.getStats('1h');
      
      this._assert(typeof stats.total === 'number', 'Should have total escalations count');
      this._assert(typeof stats.successRate === 'number', 'Should have success rate');
      this._assert(stats.byLevel, 'Should have escalations by level');
      this._assert(stats.byRule, 'Should have escalations by rule');
    });
  }

  /**
   * Test integration between all components
   */
  async _runIntegrationTests() {
    log('info', '🔗 Running integration tests...');

    // Test 1: End-to-end error handling
    await this._runTest('End-to-End Error Handling', async () => {
      const context = createErrorContext()
        .operation('integration_test')
        .component('test_suite')
        .environment('test')
        .build();

      let attempts = 0;
      const result = await globalErrorHandler.handleErrorWithRetry(async () => {
        attempts++;
        if (attempts < 2) {
          throw TestErrorGenerator.createNetworkError();
        }
        return { success: true, data: 'test_result' };
      }, {
        maxRetries: 3,
        operationName: 'integration_test',
        context
      });
      
      this._assert(result.success, 'Should successfully handle and retry error');
      this._assert(attempts === 2, 'Should retry once before succeeding');
    });

    // Test 2: Error handling with analytics and escalation
    await this._runTest('Error Handling with Analytics and Escalation', async () => {
      const error = TestErrorGenerator.createResourceError();
      const context = createErrorContext()
        .operation('resource_intensive_task')
        .component('test_component')
        .environment('production')
        .build();

      const result = await globalErrorHandler.handleError(error, context);
      
      this._assert(result.errorId, 'Should generate error ID');
      this._assert(result.classification, 'Should classify error');
      this._assert(result.classification.type === 'RESOURCE_ERROR', 'Should classify as resource error');
      
      // Check if error was recorded in analytics
      const stats = errorAnalytics.getErrorStats('1h');
      this._assert(stats.summary.totalErrors > 0, 'Should record error in analytics');
    });

    // Test 3: Express middleware integration
    await this._runTest('Express Middleware Integration', async () => {
      const middleware = globalErrorHandler.expressMiddleware();
      
      // Mock Express request/response objects
      const req = {
        method: 'GET',
        url: '/test',
        get: (header) => header === 'User-Agent' ? 'test-agent' : null
      };
      
      const res = {
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.responseData = data;
          return this;
        }
      };
      
      const error = TestErrorGenerator.createValidationError();
      
      await middleware(error, req, res, () => {});
      
      this._assert(res.statusCode === 400, 'Should set correct HTTP status code');
      this._assert(res.responseData.error, 'Should return error response');
      this._assert(res.responseData.error.id, 'Should include error ID in response');
    });
  }

  /**
   * Test performance characteristics
   */
  async _runPerformanceTests() {
    log('info', '⚡ Running performance tests...');

    // Test 1: Classification performance
    await this._runTest('Classification Performance', async () => {
      const errors = [];
      for (let i = 0; i < 100; i++) {
        errors.push(TestErrorGenerator.createCustomError(`Test error ${i}`));
      }
      
      const start = Date.now();
      for (const error of errors) {
        errorClassifier.classify(error);
      }
      const duration = Date.now() - start;
      
      this._assert(duration < 1000, 'Should classify 100 errors in under 1 second');
      
      // Test cache performance
      const cacheStart = Date.now();
      for (const error of errors) {
        errorClassifier.classify(error); // Should hit cache
      }
      const cacheDuration = Date.now() - cacheStart;
      
      this._assert(cacheDuration < duration / 2, 'Cached classifications should be significantly faster');
    });

    // Test 2: Retry manager performance
    await this._runTest('Retry Manager Performance', async () => {
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(async () => {
          if (Math.random() < 0.3) { // 30% failure rate
            throw TestErrorGenerator.createNetworkError();
          }
          return `result_${i}`;
        });
      }
      
      const start = Date.now();
      const results = await Promise.allSettled(
        operations.map(op => retryManager.executeWithRetry(op, {
          maxRetries: 2,
          baseDelay: 10,
          operationName: 'perf_test'
        }))
      );
      const duration = Date.now() - start;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      this._assert(successful > 0, 'Should have some successful operations');
      this._assert(duration < 5000, 'Should complete 50 operations in under 5 seconds');
    });

    // Test 3: Memory usage
    await this._runTest('Memory Usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate many errors to test memory management
      for (let i = 0; i < 1000; i++) {
        const error = TestErrorGenerator.createCustomError(`Memory test error ${i}`);
        const classification = errorClassifier.classify(error);
        errorAnalytics.recordError(error, classification);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 1000 errors)
      this._assert(memoryIncrease < 50 * 1024 * 1024, 'Memory usage should be reasonable');
    });
  }

  /**
   * Run individual test
   * @private
   */
  async _runTest(testName, testFunction) {
    this.testStats.total++;
    
    try {
      const start = Date.now();
      await testFunction();
      const duration = Date.now() - start;
      
      this.testResults.push({
        name: testName,
        status: 'PASSED',
        duration,
        error: null
      });
      
      this.testStats.passed++;
      log('debug', `✅ ${testName} (${duration}ms)`);
    } catch (error) {
      this.testResults.push({
        name: testName,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });
      
      this.testStats.failed++;
      log('error', `❌ ${testName}: ${error.message}`);
    }
  }

  /**
   * Assert condition
   * @private
   */
  _assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  /**
   * Reset test environment
   * @private
   */
  _resetTestEnvironment() {
    errorClassifier.clearCache();
    retryManager.clearHistory();
    retryManager.resetCircuitBreakers();
    errorAnalytics.clearData();
    escalationManager.reset();
    globalErrorHandler.resetStats();
  }

  /**
   * Generate test report
   * @private
   */
  _generateTestReport() {
    const passRate = this.testStats.total > 0 ? 
      (this.testStats.passed / this.testStats.total) * 100 : 0;

    return {
      summary: {
        total: this.testStats.total,
        passed: this.testStats.passed,
        failed: this.testStats.failed,
        skipped: this.testStats.skipped,
        passRate: Math.round(passRate * 100) / 100
      },
      results: this.testResults,
      systemStats: {
        errorHandler: globalErrorHandler.getStats(),
        retryManager: retryManager.getStats(),
        errorAnalytics: errorAnalytics.getDashboardData(),
        escalationManager: escalationManager.getStats()
      }
    };
  }
}

/**
 * Run error handling tests
 */
export async function runErrorHandlingTests() {
  const testRunner = new ErrorHandlingTestRunner();
  return await testRunner.runAllTests();
}

// Export test utilities
export { TestErrorGenerator };

