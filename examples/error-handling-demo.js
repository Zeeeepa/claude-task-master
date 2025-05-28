#!/usr/bin/env node

/**
 * error-handling-demo.js
 * 
 * Demonstration script showing the capabilities of the intelligent
 * error handling and retry logic system.
 */

import { log } from '../scripts/modules/utils.js';
import { 
  initializeErrorHandling,
  getSystemStatus,
  generateSystemReport,
  quickSetup,
  utils
} from '../error-handling/index.js';
import { runErrorHandlingTests } from '../error-handling/tests/error-handling-tests.js';

/**
 * Demo error scenarios
 */
class DemoErrorScenarios {
  static async networkErrorScenario() {
    log('info', '🌐 Demonstrating network error handling...');
    
    let attempts = 0;
    const result = await utils.withRetry(async () => {
      attempts++;
      log('info', `Network request attempt ${attempts}`);
      
      if (attempts < 3) {
        const error = new Error('Connection refused: ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      
      return { success: true, data: 'Network request successful' };
    }, {
      maxRetries: 5,
      baseDelay: 500,
      operationName: 'demo_network_request'
    });
    
    log('info', `✅ Network scenario completed after ${attempts} attempts:`, result);
    return result;
  }

  static async apiRateLimitScenario() {
    log('info', '🚦 Demonstrating API rate limit handling...');
    
    let attempts = 0;
    const result = await utils.withRetry(async () => {
      attempts++;
      log('info', `API request attempt ${attempts}`);
      
      if (attempts < 4) {
        const error = new Error('Rate limit exceeded. Please try again later.');
        error.status = 429;
        throw error;
      }
      
      return { success: true, data: 'API request successful' };
    }, {
      maxRetries: 5,
      baseDelay: 1000,
      strategy: 'exponential_backoff',
      operationName: 'demo_api_request'
    });
    
    log('info', `✅ API rate limit scenario completed after ${attempts} attempts:`, result);
    return result;
  }

  static async criticalErrorScenario() {
    log('info', '🚨 Demonstrating critical error escalation...');
    
    try {
      const wrappedFunction = utils.withErrorHandling(async () => {
        const error = new Error('Authentication failed: Invalid API key');
        error.status = 401;
        throw error;
      }, {
        operation: 'demo_authentication',
        component: 'demo_service'
      });
      
      await wrappedFunction();
    } catch (error) {
      log('info', '✅ Critical error was properly escalated');
      return { escalated: true, error: error.message };
    }
  }

  static async circuitBreakerScenario() {
    log('info', '⚡ Demonstrating circuit breaker functionality...');
    
    const results = [];
    
    // Cause multiple failures to trigger circuit breaker
    for (let i = 0; i < 8; i++) {
      try {
        const result = await utils.withCircuitBreaker(async () => {
          if (i < 6) {
            throw new Error(`Service failure ${i + 1}`);
          }
          return { success: true, attempt: i + 1 };
        }, {
          operationType: 'demo_circuit_breaker',
          operationName: `demo_cb_${i}`
        });
        
        results.push({ attempt: i + 1, result: 'success', data: result });
      } catch (error) {
        const isCircuitBreakerError = error.message.includes('Circuit breaker');
        results.push({ 
          attempt: i + 1, 
          result: isCircuitBreakerError ? 'circuit_breaker' : 'failure',
          error: error.message 
        });
      }
    }
    
    log('info', '✅ Circuit breaker scenario completed:', results);
    return results;
  }
}

/**
 * Main demo function
 */
async function runDemo() {
  log('info', '🚀 Starting Error Handling System Demo...\n');

  try {
    // Initialize the error handling system
    log('info', '⚙️  Initializing error handling system...');
    const config = quickSetup.development();
    log('info', '✅ Error handling system initialized\n');

    // Show initial system status
    log('info', '📊 Initial system status:');
    const initialStatus = getSystemStatus();
    log('info', `System Health: ${initialStatus.systemHealth}/100`);
    log('info', `Active Components: ${Object.keys(initialStatus.components).length}\n`);

    // Run demo scenarios
    log('info', '🎭 Running demo scenarios...\n');

    // Scenario 1: Network error with retry
    await DemoErrorScenarios.networkErrorScenario();
    log('info', '');

    // Scenario 2: API rate limit with exponential backoff
    await DemoErrorScenarios.apiRateLimitScenario();
    log('info', '');

    // Scenario 3: Critical error with escalation
    await DemoErrorScenarios.criticalErrorScenario();
    log('info', '');

    // Scenario 4: Circuit breaker demonstration
    await DemoErrorScenarios.circuitBreakerScenario();
    log('info', '');

    // Show updated system status
    log('info', '📊 Updated system status after scenarios:');
    const updatedStatus = getSystemStatus();
    log('info', `System Health: ${updatedStatus.systemHealth}/100`);
    log('info', `Total Errors Handled: ${updatedStatus.components.errorHandler.stats.totalErrors}`);
    log('info', `Resolution Rate: ${updatedStatus.components.errorHandler.stats.resolutionRate}%`);
    log('info', `Active Retries: ${updatedStatus.components.retryManager.stats.activeRetries}\n`);

    // Generate comprehensive report
    log('info', '📋 Generating system report...');
    const report = generateSystemReport({ timeRange: '1h' });
    
    log('info', '📈 Error Analytics Summary:');
    log('info', `- Total Errors: ${report.analytics.summary.totalErrors}`);
    log('info', `- Resolved Errors: ${report.analytics.summary.resolvedErrors}`);
    log('info', `- Resolution Rate: ${report.analytics.summary.resolutionRate}%`);
    
    if (report.analytics.patterns && report.analytics.patterns.length > 0) {
      log('info', '🔍 Top Error Patterns:');
      report.analytics.patterns.slice(0, 3).forEach((pattern, index) => {
        log('info', `  ${index + 1}. ${pattern.pattern.substring(0, 50)}... (${pattern.occurrences} occurrences)`);
      });
    }
    
    if (report.recommendations && report.recommendations.length > 0) {
      log('info', '💡 System Recommendations:');
      report.recommendations.forEach((rec, index) => {
        log('info', `  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
        log('info', `     Action: ${rec.action}`);
      });
    }

    log('info', '\n✨ Demo completed successfully!');
    
    return {
      success: true,
      finalStatus: updatedStatus,
      report: report.analytics.summary
    };

  } catch (error) {
    log('error', `Demo failed: ${error.message}`);
    throw error;
  }
}

/**
 * Run comprehensive tests
 */
async function runTests() {
  log('info', '\n🧪 Running comprehensive error handling tests...');
  
  try {
    const testResults = await runErrorHandlingTests();
    
    log('info', '📊 Test Results Summary:');
    log('info', `- Total Tests: ${testResults.summary.total}`);
    log('info', `- Passed: ${testResults.summary.passed}`);
    log('info', `- Failed: ${testResults.summary.failed}`);
    log('info', `- Pass Rate: ${testResults.summary.passRate}%`);
    
    if (testResults.summary.failed > 0) {
      log('warn', '\n❌ Failed Tests:');
      testResults.results
        .filter(r => r.status === 'FAILED')
        .forEach(test => {
          log('warn', `  - ${test.name}: ${test.error}`);
        });
    }
    
    log('info', '\n✅ Test suite completed');
    return testResults;
    
  } catch (error) {
    log('error', `Test suite failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'demo';

  try {
    switch (command) {
      case 'demo':
        await runDemo();
        break;
      
      case 'test':
        await runTests();
        break;
      
      case 'both':
        await runDemo();
        await runTests();
        break;
      
      case 'status':
        const status = getSystemStatus();
        log('info', 'System Status:', JSON.stringify(status, null, 2));
        break;
      
      case 'report':
        const report = generateSystemReport();
        log('info', 'System Report:', JSON.stringify(report, null, 2));
        break;
      
      default:
        log('info', 'Usage: node error-handling-demo.js [demo|test|both|status|report]');
        log('info', '  demo   - Run demonstration scenarios');
        log('info', '  test   - Run comprehensive tests');
        log('info', '  both   - Run demo and tests');
        log('info', '  status - Show current system status');
        log('info', '  report - Generate comprehensive report');
        break;
    }
  } catch (error) {
    log('error', `Command failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log('error', `Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { runDemo, runTests, DemoErrorScenarios };

