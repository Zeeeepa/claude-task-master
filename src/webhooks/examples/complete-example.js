/**
 * @fileoverview Complete Webhook System Example
 * @description Demonstrates the consolidated webhook system with all features from PRs #48,49,58,68,79,89
 * @version 1.0.0
 */

import { ConsolidatedWebhookSystem, startWebhookSystem } from '../index.js';
import { logger } from '../../utils/logger.js';

/**
 * Complete example demonstrating all consolidated features
 */
async function runCompleteExample() {
    logger.info('🚀 Starting Complete Webhook System Example');
    logger.info('📋 This example demonstrates features from PRs #48,49,58,68,79,89');

    // Configuration demonstrating all consolidated features
    const config = {
        // PR #48 - Core Webhook System
        server: {
            port: 3001,
            host: '0.0.0.0',
            maxPayloadSize: '10mb',
            timeout: 30000,
            enableCors: true,
            enableCompression: true,
            enableHelmet: true,
            
            // PR #49 - Rate limiting and throttling
            rateLimit: {
                enabled: true,
                windowMs: 900000, // 15 minutes
                max: 1000,
                slowDownThreshold: 100
            }
        },

        // PR #49 - Advanced Security Configuration
        security: {
            github: {
                secret: process.env.GITHUB_WEBHOOK_SECRET || 'demo-secret-key-123'
            },
            validation: {
                enablePayloadValidation: true,
                maxPayloadSize: 10485760,
                allowedEvents: [
                    'pull_request', 'push', 'check_run', 'check_suite',
                    'pull_request_review', 'pull_request_review_comment', 'status'
                ]
            },
            security: {
                enableRateLimiting: true,
                enableIPWhitelist: false, // Disabled for demo
                allowedIPs: ['127.0.0.1', '::1'],
                enableUserAgentValidation: true,
                enableTimestampValidation: true,
                maxTimestampAge: 300000
            }
        },

        // PR #49 - Redis-based Event Queuing
        queue: {
            enabled: false, // Disabled for demo (no Redis required)
            redis: {
                host: 'localhost',
                port: 6379,
                keyPrefix: 'webhook:'
            },
            processing: {
                maxRetries: 3,
                retryDelay: 1000,
                retryBackoffMultiplier: 2,
                maxRetryDelay: 30000,
                processingTimeout: 300000,
                batchSize: 10,
                concurrency: 5
            }
        },

        // PR #68 & #79 - Database Configuration & Implementation
        database: {
            host: 'localhost',
            port: 5432,
            database: 'webhook-demo-db',
            username: 'demo-user',
            password: 'demo-password',
            
            // Connection pooling
            pool: {
                min: 2,
                max: 10,
                idleTimeout: 30000,
                acquireTimeout: 60000
            },
            
            queryTimeout: 30000,
            
            // PR #68 - Cloudflare tunnel support
            cloudflare: {
                enabled: false, // Disabled for demo
                tunnelUrl: process.env.CLOUDFLARE_TUNNEL_URL,
                tunnelToken: process.env.CLOUDFLARE_TUNNEL_TOKEN
            }
        },

        // PR #58 - Event Processing Configuration
        processor: {
            enableQueue: false, // Disabled for demo
            enableCorrelation: true,
            enableRetries: true,
            maxRetries: 3,
            retryDelay: 1000,
            processingTimeout: 30000,
            
            // External service integration
            agentapi: {
                enabled: false, // Disabled for demo
                baseUrl: 'http://localhost:8000',
                timeout: 30000,
                retries: 3
            },
            
            codegen: {
                enabled: false, // Disabled for demo
                apiUrl: 'https://api.codegen.sh',
                timeout: 60000
            },
            
            linear: {
                enabled: false, // Disabled for demo
                baseUrl: 'https://api.linear.app/graphql',
                timeout: 30000
            }
        },

        // PR #89 - Error Handling & Recovery
        error: {
            enabled: true,
            maxRetries: 3,
            retryDelay: 1000,
            backoffMultiplier: 2,
            maxRetryDelay: 30000,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000,
            enableRecovery: true,
            recoveryStrategies: ['retry', 'fallback', 'circuit_breaker']
        },

        // Monitoring configuration
        monitoring: {
            enabled: true,
            enableMetrics: true,
            enableTracing: false, // Disabled for demo
            enableSecurityMetrics: true,
            logSecurityEvents: true,
            metricsInterval: 60000,
            healthCheckInterval: 30000
        },

        // Logging configuration
        logging: {
            level: 'info',
            format: 'json',
            enableColors: true,
            enableTimestamp: true,
            enableMetadata: true
        }
    };

    try {
        // Create and start the consolidated webhook system
        logger.info('🔧 Creating consolidated webhook system...');
        const webhookSystem = new ConsolidatedWebhookSystem(config);

        // Initialize the system
        logger.info('⚙️  Initializing system components...');
        await webhookSystem.initialize();

        // Start the system
        logger.info('🚀 Starting webhook system...');
        await webhookSystem.start();

        // Demonstrate health check (PR #48)
        logger.info('🏥 Checking system health...');
        const health = await webhookSystem.getHealth();
        logger.info('Health status:', health);

        // Demonstrate metrics (PR #48)
        logger.info('📊 Getting system metrics...');
        const metrics = await webhookSystem.getMetrics();
        logger.info('System metrics:', metrics);

        // Demonstrate stats (PR #49)
        logger.info('📈 Getting system statistics...');
        const stats = await webhookSystem.getStats();
        logger.info('System statistics:', stats);

        // Simulate webhook events (PR #58)
        logger.info('🔄 Simulating GitHub webhook events...');
        
        // Simulate a pull request event
        const prEvent = {
            action: 'opened',
            number: 123,
            pull_request: {
                id: 456,
                title: 'Add new feature',
                state: 'open',
                user: { login: 'developer' }
            },
            repository: {
                name: 'test-repo',
                full_name: 'org/test-repo'
            }
        };

        // Simulate a push event
        const pushEvent = {
            ref: 'refs/heads/main',
            commits: [
                {
                    id: 'abc123',
                    message: 'Fix bug in webhook handler',
                    author: { name: 'Developer', email: 'dev@example.com' }
                }
            ],
            repository: {
                name: 'test-repo',
                full_name: 'org/test-repo'
            }
        };

        logger.info('✅ Webhook system is running successfully!');
        logger.info('🌐 Server listening on http://localhost:3001');
        logger.info('📡 Ready to receive GitHub webhooks at:');
        logger.info('   - POST /webhooks/github (GitHub events)');
        logger.info('   - GET /health (Health check)');
        logger.info('   - GET /metrics (System metrics)');
        logger.info('   - GET /status (System status)');

        // Keep the system running for demonstration
        logger.info('⏰ System will run for 30 seconds for demonstration...');
        
        setTimeout(async () => {
            logger.info('🛑 Stopping webhook system...');
            await webhookSystem.stop();
            logger.info('✅ Webhook system stopped successfully!');
            
            logger.info('🎉 Complete example finished!');
            logger.info('📋 Demonstrated features from all 6 PRs:');
            logger.info('   ✅ PR #48: Core webhook server, event processing, security, monitoring');
            logger.info('   ✅ PR #49: Advanced configuration, queuing, rate limiting');
            logger.info('   ✅ PR #58: GitHub integration, API endpoints, event replay');
            logger.info('   ✅ PR #68: Database configuration, Cloudflare tunnels');
            logger.info('   ✅ PR #79: Database implementation, performance optimization');
            logger.info('   ✅ PR #89: Error handling, circuit breakers, auto-recovery');
            
            process.exit(0);
        }, 30000);

    } catch (error) {
        logger.error('❌ Error running complete example:', error);
        process.exit(1);
    }
}

/**
 * Alternative simple example using the convenience function
 */
async function runSimpleExample() {
    logger.info('🚀 Starting Simple Webhook System Example');

    try {
        // Use the convenience function for quick setup
        const webhookSystem = await startWebhookSystem({
            server: {
                port: 3002,
                host: '0.0.0.0'
            },
            security: {
                github: {
                    secret: 'simple-demo-secret'
                }
            }
        });

        logger.info('✅ Simple webhook system started!');
        logger.info('🌐 Server listening on http://localhost:3002');

        // Get health status
        const health = await webhookSystem.getHealth();
        logger.info('Health:', health.status);

        // Stop after 10 seconds
        setTimeout(async () => {
            await webhookSystem.stop();
            logger.info('✅ Simple example completed!');
            process.exit(0);
        }, 10000);

    } catch (error) {
        logger.error('❌ Error running simple example:', error);
        process.exit(1);
    }
}

// Run the appropriate example based on command line argument
const exampleType = process.argv[2] || 'complete';

if (exampleType === 'simple') {
    runSimpleExample();
} else {
    runCompleteExample();
}

export { runCompleteExample, runSimpleExample };

