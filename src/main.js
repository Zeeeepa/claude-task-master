#!/usr/bin/env node

/**
 * Task Master - AI Development Orchestrator
 * Main entry point for the application
 */

import { orchestrator } from './orchestrator/index.js';
import { logger } from './utils/logger.js';
import { configManager } from './utils/config-manager.js';

// ASCII Art Banner
const banner = `
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   ████████╗ █████╗ ███████╗██╗  ██╗    ███╗   ███╗ █████╗     ║
║   ╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝    ████╗ ████║██╔══██╗    ║
║      ██║   ███████║███████╗█████╔╝     ██╔████╔██║███████║    ║
║      ██║   ██╔══██║╚════██║██╔═██╗     ██║╚██╔╝██║██╔══██║    ║
║      ██║   ██║  ██║███████║██║  ██╗    ██║ ╚═╝ ██║██║  ██║    ║
║      ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚═╝     ╚═╝╚═╝  ╚═╝    ║
║                                                                ║
║              AI Development Orchestrator v2.0                 ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`;

class TaskMasterApplication {
    constructor() {
        this.isShuttingDown = false;
        this.startTime = Date.now();
    }

    /**
     * Start the application
     */
    async start() {
        try {
            // Display banner
            console.log(banner);
            
            // Initialize configuration first
            await configManager.initialize();
            
            // Initialize logger with configuration
            const logConfig = configManager.get('logging', {});
            logger.initialize(logConfig);
            
            logger.info('🚀 Starting Task Master AI Development Orchestrator...');
            logger.info('📋 Configuration loaded successfully');
            
            // Setup process handlers
            this.setupProcessHandlers();
            
            // Start the orchestrator
            await orchestrator.start();
            
            // Log startup completion
            const startupTime = Date.now() - this.startTime;
            logger.info(`✅ Task Master started successfully in ${startupTime}ms`);
            
            // Log configuration summary
            this.logConfigurationSummary();
            
            // Setup health monitoring
            this.setupHealthMonitoring();
            
        } catch (error) {
            logger.error('❌ Failed to start Task Master:', error);
            process.exit(1);
        }
    }

    /**
     * Setup process event handlers
     */
    setupProcessHandlers() {
        // Graceful shutdown on SIGTERM
        process.on('SIGTERM', async () => {
            logger.info('📨 Received SIGTERM signal, initiating graceful shutdown...');
            await this.shutdown();
        });

        // Graceful shutdown on SIGINT (Ctrl+C)
        process.on('SIGINT', async () => {
            logger.info('📨 Received SIGINT signal, initiating graceful shutdown...');
            await this.shutdown();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('💥 Uncaught Exception:', error);
            this.emergencyShutdown();
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('💥 Unhandled Promise Rejection:', { reason, promise });
            this.emergencyShutdown();
        });

        // Handle warnings
        process.on('warning', (warning) => {
            logger.warn('⚠️ Process Warning:', {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });

        // Log process events
        process.on('exit', (code) => {
            console.log(`🏁 Process exiting with code: ${code}`);
        });
    }

    /**
     * Setup health monitoring
     */
    setupHealthMonitoring() {
        const healthCheckInterval = configManager.get('system.healthCheckInterval', 30000);
        
        setInterval(async () => {
            try {
                const health = await orchestrator.healthCheck();
                
                if (health.status !== 'healthy') {
                    logger.warn('⚠️ Health check warning:', {
                        status: health.status,
                        issues: health.issues
                    });
                }
                
                // Log memory usage if high
                const memoryUsage = process.memoryUsage();
                const memoryUsageMB = memoryUsage.rss / 1024 / 1024;
                
                if (memoryUsageMB > 500) { // 500MB threshold
                    logger.warn('📊 High memory usage detected:', {
                        rss: `${memoryUsageMB.toFixed(2)}MB`,
                        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`
                    });
                }
                
            } catch (error) {
                logger.error('❌ Health check failed:', error);
            }
        }, healthCheckInterval);
        
        logger.info(`💓 Health monitoring started (interval: ${healthCheckInterval}ms)`);
    }

    /**
     * Log configuration summary
     */
    logConfigurationSummary() {
        const config = configManager.getAll();
        
        logger.info('⚙️ Configuration Summary:', {
            environment: config.system?.nodeEnv || 'development',
            logLevel: config.system?.logLevel || 'info',
            agentAPIPort: config.agentapi?.port || 3001,
            databaseType: config.database?.type || 'sqlite',
            codegenConfigured: !!(config.codegen?.token && config.codegen?.orgId),
            claudeConfigured: !!config.claude?.codePath,
            linearConfigured: !!config.linear?.apiKey,
            githubConfigured: !!config.github?.token
        });
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn('🔄 Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        logger.info('🛑 Initiating graceful shutdown...');

        try {
            // Set shutdown timeout
            const shutdownTimeout = setTimeout(() => {
                logger.error('⏰ Shutdown timeout reached, forcing exit...');
                process.exit(1);
            }, 30000); // 30 seconds

            // Stop the orchestrator
            await orchestrator.stop();

            // Clear shutdown timeout
            clearTimeout(shutdownTimeout);

            // Log shutdown completion
            const shutdownTime = Date.now() - this.startTime;
            logger.info(`✅ Graceful shutdown completed (uptime: ${Math.round(shutdownTime / 1000)}s)`);

            // Close logger
            await logger.close();

            // Exit cleanly
            process.exit(0);

        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Emergency shutdown
     */
    emergencyShutdown() {
        console.error('🚨 EMERGENCY SHUTDOWN - Critical error detected');
        
        // Try to stop orchestrator quickly
        try {
            orchestrator.stop().catch(() => {});
        } catch (error) {
            console.error('Error during emergency stop:', error);
        }

        // Force exit after short delay
        setTimeout(() => {
            process.exit(1);
        }, 5000);
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            startTime: this.startTime,
            uptime: Date.now() - this.startTime,
            isShuttingDown: this.isShuttingDown,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            orchestrator: orchestrator.getStatus()
        };
    }
}

// Create and start the application
const app = new TaskMasterApplication();

// Start the application if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    app.start().catch((error) => {
        console.error('💥 Fatal error starting Task Master:', error);
        process.exit(1);
    });
}

export { app as taskMasterApp };
export default TaskMasterApplication;

