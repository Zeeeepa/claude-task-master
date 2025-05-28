/**
 * @fileoverview Webhook System Usage Examples
 * @description Examples demonstrating how to use the webhook system
 */

import { WebhookSystem, startWebhookSystem } from '../index.js';
import { runWebhookTests, runPerformanceTests } from '../test_webhook_system.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Basic webhook system usage
 */
export async function basicUsage() {
  log('info', '🚀 Starting basic webhook system usage example...');

  try {
    // Method 1: Quick start with defaults
    const system = await startWebhookSystem();
    
    log('info', 'Webhook system started with defaults');
    
    // Get system status
    const status = system.getStatus();
    log('info', 'System status:', status);
    
    // Get health check
    const health = await system.getHealth();
    log('info', 'System health:', health);
    
    // Stop the system
    await system.stop();
    log('info', 'Basic usage example completed');
    
  } catch (error) {
    log('error', 'Basic usage example failed:', error.message);
  }
}

/**
 * Advanced webhook system configuration
 */
export async function advancedUsage() {
  log('info', '⚙️ Starting advanced webhook system configuration example...');

  try {
    // Method 2: Custom configuration
    const customConfig = {
      server: {
        port: 3001,
        host: '0.0.0.0',
        timeout: 30000
      },
      github: {
        token: process.env.GITHUB_TOKEN || 'your-github-token',
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret',
        apiUrl: 'https://api.github.com'
      },
      codegen: {
        baseURL: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
        apiKey: process.env.CODEGEN_API_KEY || 'your-codegen-api-key',
        timeout: 60000
      },
      validation: {
        maxPRSize: 1000,
        requireTests: true,
        securityScan: true,
        performanceCheck: true
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200, // 200 requests per window
        skipSuccessfulRequests: true
      },
      monitoring: {
        enableMetrics: true,
        healthCheckInterval: 30000
      }
    };

    const system = new WebhookSystem(customConfig);
    
    // Validate configuration
    const validation = system.validateConfig();
    if (!validation.valid) {
      log('error', 'Configuration validation failed:', validation.errors);
      return;
    }
    
    if (validation.warnings.length > 0) {
      log('warn', 'Configuration warnings:', validation.warnings);
    }
    
    // Initialize and start
    await system.initialize();
    await system.start();
    
    log('info', 'Advanced webhook system started with custom configuration');
    
    // Demonstrate system monitoring
    const metrics = system.getMetrics();
    log('info', 'System metrics:', metrics);
    
    // Simulate some time passing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Stop the system
    await system.stop();
    log('info', 'Advanced usage example completed');
    
  } catch (error) {
    log('error', 'Advanced usage example failed:', error.message);
  }
}

/**
 * Webhook event simulation
 */
export async function webhookEventSimulation() {
  log('info', '📥 Starting webhook event simulation example...');

  try {
    const system = new WebhookSystem({
      server: { port: 3002 },
      github: { token: 'test-token' },
      codegen: { apiKey: 'test-key' }
    });

    await system.initialize();
    
    // Simulate different webhook events
    const events = [
      {
        type: 'pull_request',
        action: 'opened',
        payload: {
          action: 'opened',
          pull_request: {
            number: 123,
            head: { ref: 'feature-branch', sha: 'abc123' },
            user: { login: 'developer' },
            title: 'Add new feature',
            body: 'This PR adds a new feature to the system'
          },
          repository: {
            full_name: 'example/repo',
            owner: { login: 'example' },
            name: 'repo'
          }
        }
      },
      {
        type: 'check_suite',
        action: 'completed',
        payload: {
          action: 'completed',
          check_suite: {
            id: 456,
            status: 'completed',
            conclusion: 'failure',
            url: 'https://github.com/example/repo/runs/456',
            pull_requests: [{ number: 123 }]
          },
          repository: {
            full_name: 'example/repo'
          }
        }
      }
    ];

    for (const event of events) {
      log('info', `Simulating ${event.type} event:`, event.action);
      
      // In a real scenario, these would be HTTP POST requests to the webhook endpoint
      // Here we're just demonstrating the event structure
      
      log('info', 'Event payload:', {
        type: event.type,
        action: event.payload.action,
        pr_number: event.payload.pull_request?.number || event.payload.check_suite?.pull_requests?.[0]?.number
      });
    }
    
    log('info', 'Webhook event simulation completed');
    
  } catch (error) {
    log('error', 'Webhook event simulation failed:', error.message);
  }
}

/**
 * Error handling and recovery demonstration
 */
export async function errorHandlingDemo() {
  log('info', '🛡️ Starting error handling demonstration...');

  try {
    // Test with invalid configuration
    log('info', 'Testing invalid configuration handling...');
    
    const invalidSystem = new WebhookSystem({
      server: { port: -1 }, // Invalid port
      github: { token: '' }, // Empty token
    });

    const validation = invalidSystem.validateConfig();
    
    if (!validation.valid) {
      log('info', '✅ Configuration validation correctly caught errors:', validation.errors);
    }

    // Test system recovery
    log('info', 'Testing system recovery...');
    
    const validSystem = new WebhookSystem({
      server: { port: 3003 },
      github: { token: 'valid-token' },
      codegen: { apiKey: 'valid-key' }
    });

    await validSystem.initialize();
    
    // Simulate system restart
    await validSystem.restart();
    
    log('info', '✅ System restart completed successfully');
    
    await validSystem.stop();
    log('info', 'Error handling demonstration completed');
    
  } catch (error) {
    log('error', 'Error handling demonstration failed:', error.message);
  }
}

/**
 * Performance testing demonstration
 */
export async function performanceDemo() {
  log('info', '⚡ Starting performance demonstration...');

  try {
    // Run performance tests
    const perfResults = await runPerformanceTests();
    
    log('info', 'Performance test results:', {
      webhook_throughput: perfResults.webhook_processing.throughput_per_second + ' req/sec',
      avg_processing_time: perfResults.webhook_processing.avg_time_ms + ' ms'
    });
    
    // Run system tests
    log('info', 'Running comprehensive system tests...');
    const testResults = await runWebhookTests();
    
    log('info', 'Test results summary:', {
      total_tests: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      success_rate: testResults.success_rate
    });
    
    log('info', 'Performance demonstration completed');
    
  } catch (error) {
    log('error', 'Performance demonstration failed:', error.message);
  }
}

/**
 * Production deployment example
 */
export async function productionDeployment() {
  log('info', '🏭 Starting production deployment example...');

  try {
    const productionConfig = {
      server: {
        port: process.env.PORT || 3000,
        host: '0.0.0.0'
      },
      github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
      },
      codegen: {
        baseURL: process.env.CODEGEN_API_URL,
        apiKey: process.env.CODEGEN_API_KEY
      },
      validation: {
        maxPRSize: parseInt(process.env.MAX_PR_SIZE) || 500,
        requireTests: process.env.REQUIRE_TESTS !== 'false',
        securityScan: process.env.SECURITY_SCAN !== 'false'
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100
      },
      monitoring: {
        enableMetrics: process.env.ENABLE_METRICS !== 'false',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
      }
    };

    log('info', 'Production configuration prepared');
    
    // Validate production config
    const system = new WebhookSystem(productionConfig);
    const validation = system.validateConfig();
    
    if (!validation.valid) {
      log('error', 'Production configuration is invalid:', validation.errors);
      return;
    }
    
    log('info', '✅ Production configuration is valid');
    
    if (validation.warnings.length > 0) {
      log('warn', 'Production configuration warnings:', validation.warnings);
    }
    
    // In production, you would start the system here:
    // await system.start();
    
    log('info', 'Production deployment example completed (system not started)');
    
  } catch (error) {
    log('error', 'Production deployment example failed:', error.message);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  log('info', '🎯 Running all webhook system examples...');

  const examples = [
    { name: 'Basic Usage', fn: basicUsage },
    { name: 'Advanced Usage', fn: advancedUsage },
    { name: 'Webhook Event Simulation', fn: webhookEventSimulation },
    { name: 'Error Handling Demo', fn: errorHandlingDemo },
    { name: 'Performance Demo', fn: performanceDemo },
    { name: 'Production Deployment', fn: productionDeployment }
  ];

  for (const example of examples) {
    try {
      log('info', `\n📋 Running ${example.name}...`);
      await example.fn();
      log('info', `✅ ${example.name} completed successfully\n`);
    } catch (error) {
      log('error', `❌ ${example.name} failed:`, error.message);
    }
  }

  log('info', '🎉 All webhook system examples completed!');
}

// Export all examples
export default {
  basicUsage,
  advancedUsage,
  webhookEventSimulation,
  errorHandlingDemo,
  performanceDemo,
  productionDeployment,
  runAllExamples
};

