/**
 * @fileoverview Webhook System Usage Examples
 * @description Examples of how to use the webhook architecture components
 */

import { WebhookSystem, createWebhookSystem } from './index.js';
import { log } from '../../utils/simple_logger.js';

/**
 * Basic webhook system setup example
 */
async function basicWebhookSetup() {
    console.log('=== Basic Webhook Setup Example ===');
    
    try {
        // Create webhook system with basic configuration
        const webhookSystem = await createWebhookSystem({
            webhook: {
                server: {
                    port: 3001,
                    path: '/webhook/github'
                },
                security: {
                    github: {
                        secret: process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
                    }
                }
            },
            queue: {
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379
                }
            },
            processor: {
                agentapi: {
                    baseUrl: process.env.AGENTAPI_BASE_URL || 'http://localhost:8000'
                }
            }
        });

        // Get system health
        const health = await webhookSystem.getHealth();
        console.log('Webhook System Health:', JSON.stringify(health, null, 2));

        // Get metrics
        const metrics = webhookSystem.getMetrics();
        console.log('Webhook System Metrics:', JSON.stringify(metrics, null, 2));

        // Shutdown
        await webhookSystem.shutdown();
        console.log('Webhook system shutdown completed');

    } catch (error) {
        console.error('Basic webhook setup failed:', error.message);
    }
}

/**
 * Advanced webhook system configuration example
 */
async function advancedWebhookSetup() {
    console.log('=== Advanced Webhook Setup Example ===');
    
    try {
        const webhookSystem = new WebhookSystem({
            enabled: true,
            autoStart: false, // Manual start for this example
            webhook: {
                server: {
                    port: 3001,
                    path: '/webhook/github',
                    maxPayloadSize: '10mb',
                    enableCors: false
                },
                security: {
                    github: {
                        secret: process.env.GITHUB_WEBHOOK_SECRET
                    },
                    validation: {
                        enablePayloadValidation: true,
                        allowedEvents: [
                            'pull_request',
                            'push',
                            'check_run',
                            'check_suite'
                        ]
                    },
                    security: {
                        enableRateLimiting: true,
                        enableIPWhitelist: false,
                        enableUserAgentValidation: true
                    }
                }
            },
            queue: {
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    password: process.env.REDIS_PASSWORD
                },
                processing: {
                    maxRetries: 3,
                    retryDelay: 1000,
                    concurrency: 5,
                    batchSize: 10
                }
            },
            correlation: {
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    db: 1
                },
                correlation: {
                    eventTTL: 86400, // 24 hours
                    workflowTTL: 604800, // 7 days
                    duplicateWindow: 3600 // 1 hour
                }
            },
            processor: {
                agentapi: {
                    baseUrl: process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
                    apiKey: process.env.AGENTAPI_API_KEY,
                    timeout: 300000, // 5 minutes
                    retries: 3
                },
                database: {
                    connectionString: process.env.DATABASE_URL
                },
                linear: {
                    apiKey: process.env.LINEAR_API_KEY
                }
            },
            monitoring: {
                enableMetrics: true,
                enableTracing: true,
                logSecurityEvents: true
            }
        });

        // Initialize manually
        await webhookSystem.initialize();
        console.log('Webhook system initialized');

        // Start manually
        await webhookSystem.start();
        console.log('Webhook system started');

        // Monitor for a short time
        setTimeout(async () => {
            const health = await webhookSystem.getHealth();
            console.log('Health check:', health.status);
            
            const queueStatus = await webhookSystem.getQueueStatus();
            console.log('Queue status:', queueStatus.status);
            
            await webhookSystem.shutdown();
            console.log('Advanced webhook setup completed');
        }, 5000);

    } catch (error) {
        console.error('Advanced webhook setup failed:', error.message);
    }
}

/**
 * Webhook monitoring example
 */
async function webhookMonitoringExample() {
    console.log('=== Webhook Monitoring Example ===');
    
    try {
        const webhookSystem = await createWebhookSystem({
            webhook: {
                server: { port: 3002 } // Different port to avoid conflicts
            },
            monitoring: {
                enableMetrics: true,
                enableTracing: true
            }
        });

        // Set up monitoring interval
        const monitoringInterval = setInterval(async () => {
            try {
                const health = await webhookSystem.getHealth();
                const metrics = webhookSystem.getMetrics();
                const queueStatus = await webhookSystem.getQueueStatus();

                console.log('=== Monitoring Report ===');
                console.log(`System Status: ${health.status}`);
                console.log(`Uptime: ${Math.round(metrics.uptime / 1000)}s`);
                console.log(`Total Events: ${metrics.totalEvents}`);
                console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(2)}%`);
                console.log(`Queue Health: ${queueStatus.status}`);
                console.log('========================');

            } catch (error) {
                console.error('Monitoring error:', error.message);
            }
        }, 10000); // Every 10 seconds

        // Stop monitoring after 30 seconds
        setTimeout(async () => {
            clearInterval(monitoringInterval);
            await webhookSystem.shutdown();
            console.log('Monitoring example completed');
        }, 30000);

    } catch (error) {
        console.error('Webhook monitoring example failed:', error.message);
    }
}

/**
 * Error handling and recovery example
 */
async function errorHandlingExample() {
    console.log('=== Error Handling Example ===');
    
    try {
        const webhookSystem = await createWebhookSystem({
            webhook: {
                server: { port: 3003 }
            },
            queue: {
                processing: {
                    maxRetries: 2,
                    retryDelay: 500
                }
            }
        });

        // Simulate checking dead letter queue
        console.log('Checking for dead letter queue items...');
        
        // In a real scenario, you would get actual job IDs from the dead letter queue
        const mockJobId = 'job_12345_abcdef';
        
        try {
            const reprocessed = await webhookSystem.reprocessDeadLetterItem(mockJobId, 'default');
            console.log(`Reprocessing result: ${reprocessed}`);
        } catch (error) {
            console.log(`Reprocessing failed (expected): ${error.message}`);
        }

        // Clear correlation data example
        try {
            const cleared = await webhookSystem.clearCorrelationData('events');
            console.log(`Cleared ${cleared} correlation items`);
        } catch (error) {
            console.log(`Clear correlation failed: ${error.message}`);
        }

        await webhookSystem.shutdown();
        console.log('Error handling example completed');

    } catch (error) {
        console.error('Error handling example failed:', error.message);
    }
}

/**
 * Integration with AI CI/CD system example
 */
async function integrationExample() {
    console.log('=== Integration Example ===');
    
    try {
        // Import the main AI CI/CD system
        const { createAICICDSystem } = await import('../index.js');
        
        // Create system with webhook configuration
        const system = await createAICICDSystem({
            webhooks: {
                enabled: true,
                autoStart: true,
                webhook: {
                    server: { port: 3004 }
                }
            }
        });

        // Get overall system health including webhooks
        const health = await system.getSystemHealth();
        console.log('System Health:', JSON.stringify(health, null, 2));

        // Get webhook-specific status
        const webhookStatus = await system.getWebhookStatus();
        console.log('Webhook Status:', JSON.stringify(webhookStatus, null, 2));

        // Get webhook queue status
        const queueStatus = await system.getWebhookQueueStatus();
        console.log('Queue Status:', JSON.stringify(queueStatus, null, 2));

        await system.shutdown();
        console.log('Integration example completed');

    } catch (error) {
        console.error('Integration example failed:', error.message);
    }
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('Starting Webhook System Examples...\n');
    
    await basicWebhookSetup();
    console.log('\n');
    
    await advancedWebhookSetup();
    console.log('\n');
    
    await errorHandlingExample();
    console.log('\n');
    
    await integrationExample();
    console.log('\n');
    
    console.log('All examples completed!');
    
    // Note: Monitoring example runs for 30 seconds, so we skip it in the batch run
    // Uncomment the line below to run it separately
    // await webhookMonitoringExample();
}

// Export functions for individual use
export {
    basicWebhookSetup,
    advancedWebhookSetup,
    webhookMonitoringExample,
    errorHandlingExample,
    integrationExample,
    runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

