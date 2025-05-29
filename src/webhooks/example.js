/**
 * @fileoverview Consolidated Webhook System Example
 * @description Example usage of the consolidated webhook system
 * @version 3.0.0
 */

import { startWebhookSystem, ConsolidatedWebhookSystem } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Basic webhook system example
 */
async function basicExample() {
    logger.info('Starting basic webhook system example...');

    try {
        // Start with minimal configuration
        const webhookSystem = await startWebhookSystem({
            server: {
                port: 3000,
                host: '0.0.0.0'
            },
            security: {
                github: {
                    secret: process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
                }
            },
            logging: {
                level: 'info'
            }
        });

        logger.info('Basic webhook system started successfully');

        // Get system health
        const health = await webhookSystem.getHealth();
        logger.info('System health:', health);

        // Get system statistics
        const stats = webhookSystem.getStats();
        logger.info('System statistics:', stats);

        return webhookSystem;

    } catch (error) {
        logger.error('Failed to start basic webhook system:', error);
        throw error;
    }
}

/**
 * Advanced webhook system example with full configuration
 */
async function advancedExample() {
    logger.info('Starting advanced webhook system example...');

    try {
        const config = {
            environment: 'development',
            
            server: {
                port: 3001,
                host: '0.0.0.0',
                maxPayloadSize: '10mb',
                timeout: 30000,
                enableCors: true,
                enableCompression: true,
                rateLimit: {
                    enabled: true,
                    windowMs: 900000, // 15 minutes
                    max: 1000
                }
            },

            security: {
                github: {
                    secret: process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
                },
                validation: {
                    enablePayloadValidation: true,
                    allowedEvents: [
                        'pull_request', 'push', 'workflow_run', 'check_run'
                    ]
                },
                security: {
                    enableIPWhitelist: false, // Disabled for development
                    enableUserAgentValidation: true,
                    enableTimestampValidation: true
                }
            },

            queue: {
                enabled: process.env.REDIS_HOST ? true : false,
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379
                },
                processing: {
                    concurrency: 5,
                    maxRetries: 3,
                    retryDelay: 1000
                }
            },

            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'codegen-taskmaster-db',
                username: process.env.DB_USER || 'software_developer',
                password: process.env.DB_PASSWORD || 'password',
                pool: {
                    min: 2,
                    max: 10
                }
            },

            processor: {
                enableCorrelation: true,
                enableRetries: true,
                processingTimeout: 30000,
                
                // External service integrations
                agentapi: {
                    enabled: !!process.env.AGENTAPI_API_KEY,
                    baseUrl: process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
                    apiKey: process.env.AGENTAPI_API_KEY,
                    timeout: 30000
                },
                
                codegen: {
                    enabled: !!process.env.CODEGEN_API_KEY,
                    apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
                    apiKey: process.env.CODEGEN_API_KEY,
                    timeout: 60000
                },
                
                linear: {
                    enabled: !!process.env.LINEAR_API_KEY,
                    apiKey: process.env.LINEAR_API_KEY,
                    timeout: 30000
                }
            },

            error: {
                enabled: true,
                maxRetries: 3,
                retryDelay: 1000,
                enableCircuitBreaker: true,
                enableRecovery: true
            },

            monitoring: {
                enabled: true,
                enableMetrics: true,
                metricsInterval: 60000,
                healthCheckInterval: 30000
            },

            logging: {
                level: 'debug',
                format: 'text',
                enableColors: true
            }
        };

        const system = new ConsolidatedWebhookSystem(config);
        await system.start();

        logger.info('Advanced webhook system started successfully');

        // Demonstrate system capabilities
        await demonstrateCapabilities(system);

        return system;

    } catch (error) {
        logger.error('Failed to start advanced webhook system:', error);
        throw error;
    }
}

/**
 * Demonstrate system capabilities
 */
async function demonstrateCapabilities(system) {
    logger.info('Demonstrating webhook system capabilities...');

    try {
        // Health check
        const health = await system.getHealth();
        logger.info('System health check:', {
            status: health.status,
            uptime: health.uptime,
            components: Object.keys(health.components || {})
        });

        // Metrics
        const metrics = await system.getMetrics();
        logger.info('System metrics available:', Object.keys(metrics || {}));

        // Statistics
        const stats = system.getStats();
        logger.info('System statistics:', {
            server: {
                isRunning: stats.server?.isRunning,
                totalRequests: stats.server?.totalRequests
            },
            processor: {
                totalEvents: stats.processor?.totalEvents,
                successfulEvents: stats.processor?.successfulEvents
            },
            uptime: stats.uptime
        });

        logger.info('System capabilities demonstrated successfully');

    } catch (error) {
        logger.error('Error demonstrating capabilities:', error);
    }
}

/**
 * Production-ready example
 */
async function productionExample() {
    logger.info('Starting production webhook system example...');

    try {
        const config = {
            environment: 'production',
            
            server: {
                port: parseInt(process.env.PORT) || 3000,
                host: '0.0.0.0',
                trustProxy: true,
                rateLimit: {
                    enabled: true,
                    windowMs: 900000,
                    max: 2000
                }
            },

            security: {
                github: {
                    secret: process.env.GITHUB_WEBHOOK_SECRET
                },
                security: {
                    enableIPWhitelist: true,
                    allowedIPs: [
                        '140.82.112.0/20',
                        '185.199.108.0/22',
                        '192.30.252.0/22',
                        '143.55.64.0/20'
                    ],
                    enableUserAgentValidation: true,
                    enableTimestampValidation: true
                }
            },

            queue: {
                enabled: true,
                processing: {
                    concurrency: 10,
                    batchSize: 20
                }
            },

            monitoring: {
                enabled: true,
                enableMetrics: true,
                enableTracing: true,
                logSecurityEvents: true
            },

            logging: {
                level: 'info',
                format: 'json'
            }
        };

        const system = new ConsolidatedWebhookSystem(config);
        await system.start();

        logger.info('Production webhook system started successfully');
        return system;

    } catch (error) {
        logger.error('Failed to start production webhook system:', error);
        throw error;
    }
}

/**
 * Run examples based on command line arguments
 */
async function main() {
    const mode = process.argv[2] || 'basic';

    try {
        let system;

        switch (mode) {
            case 'basic':
                system = await basicExample();
                break;
            case 'advanced':
                system = await advancedExample();
                break;
            case 'production':
                system = await productionExample();
                break;
            default:
                logger.error('Invalid mode. Use: basic, advanced, or production');
                process.exit(1);
        }

        // Keep the process running
        logger.info(`Webhook system running in ${mode} mode. Press Ctrl+C to stop.`);
        
        // Graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, shutting down gracefully...');
            try {
                await system.stop();
                logger.info('Webhook system stopped successfully');
                process.exit(0);
            } catch (error) {
                logger.error('Error during shutdown:', error);
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error('Example failed:', error);
        process.exit(1);
    }
}

// Export functions for programmatic usage
export {
    basicExample,
    advancedExample,
    productionExample
};

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logger.error('Unhandled error:', error);
        process.exit(1);
    });
}

