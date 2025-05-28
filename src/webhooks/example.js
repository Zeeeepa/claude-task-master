/**
 * Webhook System Usage Example
 * 
 * Example demonstrating how to set up and use the webhook system
 * for GitHub PR event handling and routing.
 */

import { WebhookSystem, createWebhookSystem } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Basic webhook system setup
 */
async function basicExample() {
  console.log('🚀 Starting basic webhook system example...\n');

  try {
    // Create webhook system with minimal configuration
    const webhookSystem = await createWebhookSystem({
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      security: {
        secret: process.env.GITHUB_WEBHOOK_SECRET || 'development-secret-key'
      },
      logging: {
        level: 'info',
        format: 'text'
      }
    });

    // Start the system
    await webhookSystem.start();

    console.log('✅ Webhook system started successfully!');
    console.log('📡 Listening on http://localhost:3000/webhooks/github');
    console.log('🔍 Health check: http://localhost:3000/health');
    console.log('📊 Status: http://localhost:3000/webhooks/status\n');

    // Display system status
    const status = webhookSystem.getStatus();
    console.log('📋 System Status:');
    console.log(`   Running: ${status.running}`);
    console.log(`   Uptime: ${status.uptime}`);
    console.log(`   Components: ${Object.keys(status.components).join(', ')}\n`);

    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down webhook system...');
      await webhookSystem.stop();
      console.log('✅ Webhook system stopped gracefully');
      process.exit(0);
    });

    return webhookSystem;

  } catch (error) {
    console.error('❌ Failed to start webhook system:', error.message);
    process.exit(1);
  }
}

/**
 * Advanced webhook system setup with all handlers
 */
async function advancedExample() {
  console.log('🚀 Starting advanced webhook system example...\n');

  try {
    const webhookSystem = new WebhookSystem({
      server: {
        port: 3000,
        host: '0.0.0.0',
        maxPayloadSize: '10mb',
        timeout: 30000
      },
      security: {
        secret: process.env.GITHUB_WEBHOOK_SECRET || 'development-secret-key',
        enableSignatureVerification: true
      },
      rateLimit: {
        enabled: true,
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000
      },
      queue: {
        enabled: true,
        maxConcurrency: 5,
        retryAttempts: 3,
        retryDelay: 1000
      },
      handlers: {
        claudeCode: {
          enabled: true,
          apiUrl: process.env.CLAUDE_CODE_API_URL || 'http://localhost:3001',
          timeout: 30000,
          retryAttempts: 2
        },
        agentAPI: {
          enabled: true,
          apiUrl: process.env.AGENTAPI_URL || 'http://localhost:3002',
          timeout: 30000,
          retryAttempts: 2
        },
        codegen: {
          enabled: true,
          apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
          timeout: 60000,
          retryAttempts: 1
        },
        linear: {
          enabled: true,
          apiUrl: process.env.LINEAR_API_URL || 'https://api.linear.app',
          apiToken: process.env.LINEAR_API_TOKEN,
          timeout: 30000,
          retryAttempts: 2
        }
      },
      logging: {
        level: 'debug',
        format: 'text',
        enableMetrics: true
      }
    });

    // Initialize and start
    await webhookSystem.initialize();
    await webhookSystem.start();

    console.log('✅ Advanced webhook system started successfully!');

    // Display detailed status
    const status = webhookSystem.getStatus();
    console.log('\n📋 Detailed System Status:');
    console.log(JSON.stringify(status, null, 2));

    // Monitor health periodically
    setInterval(async () => {
      const health = await webhookSystem.getHealth();
      console.log(`\n🏥 Health Check (${new Date().toISOString()}):`, health.status);
      
      if (health.status !== 'healthy') {
        console.warn('⚠️  System health degraded:', health);
      }
    }, 30000); // Every 30 seconds

    // Monitor metrics
    setInterval(() => {
      const metrics = webhookSystem.getMetrics();
      console.log(`\n📊 Metrics (${new Date().toISOString()}):`);
      console.log(`   Processor: ${metrics.processor?.stats?.processed || 0} processed, ${metrics.processor?.stats?.failed || 0} failed`);
      console.log(`   Queue: ${metrics.queue?.gauges?.pendingQueueSize || 0} pending, ${metrics.queue?.gauges?.activeWorkers || 0} active workers`);
      console.log(`   Memory: ${Math.round(metrics.system.memory.heapUsed / 1024 / 1024)}MB heap used`);
    }, 60000); // Every minute

    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down advanced webhook system...');
      await webhookSystem.stop();
      console.log('✅ Advanced webhook system stopped gracefully');
      process.exit(0);
    });

    return webhookSystem;

  } catch (error) {
    console.error('❌ Failed to start advanced webhook system:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Development mode with mock handlers
 */
async function developmentExample() {
  console.log('🚀 Starting development webhook system example...\n');

  try {
    const webhookSystem = await createWebhookSystem({
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      security: {
        secret: 'development-secret-key',
        enableSignatureVerification: false // Disabled for development
      },
      development: {
        enableDebugLogging: true,
        enableTestEndpoints: true,
        mockHandlers: true
      },
      logging: {
        level: 'debug',
        format: 'text'
      }
    });

    await webhookSystem.start();

    console.log('✅ Development webhook system started!');
    console.log('🧪 Test endpoints enabled');
    console.log('🔓 Signature verification disabled');
    console.log('🎭 Mock handlers enabled\n');

    // Simulate a webhook event for testing
    setTimeout(async () => {
      console.log('🧪 Simulating test webhook event...');
      
      const mockPayload = {
        action: 'opened',
        pull_request: {
          id: 123456789,
          number: 42,
          title: 'Test PR for webhook system',
          body: 'This is a test PR to demonstrate the webhook system.',
          state: 'open',
          head: {
            ref: 'feature/webhook-system',
            sha: 'abc123def456',
            repo: {
              full_name: 'test-org/test-repo',
              clone_url: 'https://github.com/test-org/test-repo.git'
            }
          },
          base: {
            ref: 'main',
            sha: 'def456abc123',
            repo: {
              full_name: 'test-org/test-repo',
              clone_url: 'https://github.com/test-org/test-repo.git'
            }
          },
          user: {
            login: 'test-user',
            id: 12345
          },
          html_url: 'https://github.com/test-org/test-repo/pull/42',
          created_at: new Date().toISOString()
        },
        repository: {
          id: 987654321,
          name: 'test-repo',
          full_name: 'test-org/test-repo',
          clone_url: 'https://github.com/test-org/test-repo.git',
          default_branch: 'main',
          private: false
        }
      };

      try {
        await webhookSystem.processor.processWebhook(mockPayload, null, {
          event: 'pull_request',
          delivery: 'test-delivery-' + Date.now(),
          timestamp: new Date().toISOString()
        });
        
        console.log('✅ Test webhook event processed successfully!');
      } catch (error) {
        console.error('❌ Test webhook event failed:', error.message);
      }
    }, 5000); // Simulate after 5 seconds

    return webhookSystem;

  } catch (error) {
    console.error('❌ Failed to start development webhook system:', error.message);
    process.exit(1);
  }
}

/**
 * Production-ready setup with monitoring
 */
async function productionExample() {
  console.log('🚀 Starting production webhook system example...\n');

  try {
    // Validate required environment variables
    const requiredEnvVars = [
      'GITHUB_WEBHOOK_SECRET',
      'CLAUDE_CODE_API_URL',
      'AGENTAPI_URL',
      'LINEAR_API_TOKEN'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    const webhookSystem = new WebhookSystem({
      server: {
        port: parseInt(process.env.PORT) || 3000,
        host: '0.0.0.0',
        maxPayloadSize: '10mb',
        timeout: 30000
      },
      security: {
        secret: process.env.GITHUB_WEBHOOK_SECRET,
        enableSignatureVerification: true
      },
      rateLimit: {
        enabled: true,
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000
      },
      queue: {
        enabled: true,
        maxConcurrency: 10,
        retryAttempts: 3,
        retryDelay: 1000,
        maxRetryDelay: 30000
      },
      handlers: {
        claudeCode: {
          enabled: true,
          apiUrl: process.env.CLAUDE_CODE_API_URL,
          apiKey: process.env.CLAUDE_CODE_API_KEY,
          timeout: 30000,
          retryAttempts: 2
        },
        agentAPI: {
          enabled: true,
          apiUrl: process.env.AGENTAPI_URL,
          apiKey: process.env.AGENTAPI_API_KEY,
          timeout: 30000,
          retryAttempts: 2
        },
        codegen: {
          enabled: true,
          apiUrl: process.env.CODEGEN_API_URL,
          apiKey: process.env.CODEGEN_API_KEY,
          timeout: 60000,
          retryAttempts: 1
        },
        linear: {
          enabled: true,
          apiUrl: process.env.LINEAR_API_URL,
          apiToken: process.env.LINEAR_API_TOKEN,
          timeout: 30000,
          retryAttempts: 2
        }
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        enableMetrics: true
      },
      monitoring: {
        enabled: true,
        healthCheckInterval: 30000,
        alertThresholds: {
          errorRate: 0.1,
          responseTime: 5000,
          queueSize: 1000
        }
      }
    });

    await webhookSystem.start();

    console.log('✅ Production webhook system started successfully!');
    console.log(`📡 Listening on port ${webhookSystem.config.get('server.port')}`);

    // Set up monitoring and alerting
    setInterval(async () => {
      const health = await webhookSystem.getHealth();
      const metrics = webhookSystem.getMetrics();
      
      // Log metrics for external monitoring systems
      logger.info('System metrics', {
        health: health.status,
        metrics: {
          processed: metrics.processor?.stats?.processed || 0,
          failed: metrics.processor?.stats?.failed || 0,
          queueSize: metrics.queue?.gauges?.pendingQueueSize || 0,
          memoryUsage: metrics.system.memory.heapUsed
        }
      });

      // Check alert thresholds
      const config = webhookSystem.config.get('monitoring.alertThresholds');
      const errorRate = metrics.processor?.stats?.failed / (metrics.processor?.stats?.processed || 1);
      
      if (errorRate > config.errorRate) {
        logger.error('High error rate detected', {
          errorRate: (errorRate * 100).toFixed(2) + '%',
          threshold: (config.errorRate * 100).toFixed(2) + '%'
        });
      }

      if (metrics.queue?.gauges?.pendingQueueSize > config.queueSize) {
        logger.warn('High queue size detected', {
          queueSize: metrics.queue.gauges.pendingQueueSize,
          threshold: config.queueSize
        });
      }
    }, 60000); // Every minute

    // Graceful shutdown with cleanup
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        await webhookSystem.stop();
        console.log('✅ Production webhook system stopped gracefully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    return webhookSystem;

  } catch (error) {
    console.error('❌ Failed to start production webhook system:', error.message);
    process.exit(1);
  }
}

// Export examples for use in other modules
export {
  basicExample,
  advancedExample,
  developmentExample,
  productionExample
};

// Run example based on NODE_ENV or command line argument
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || process.env.NODE_ENV || 'development';
  
  switch (mode) {
    case 'basic':
      basicExample();
      break;
    case 'advanced':
      advancedExample();
      break;
    case 'development':
      developmentExample();
      break;
    case 'production':
      productionExample();
      break;
    default:
      console.log('Usage: node example.js [basic|advanced|development|production]');
      console.log('Or set NODE_ENV environment variable');
      process.exit(1);
  }
}

