/**
 * @fileoverview Consolidated Webhook System
 * @description Unified webhook system consolidating PRs #48, #49, #58, #68, #79, #89
 * @version 3.0.0
 * @created 2025-05-29
 */

import { WebhookServer } from './core/webhook-server.js';
import { EventProcessor } from './core/event-processor.js';
import { SecurityManager } from './security/security-manager.js';
import { QueueManager } from './queue/queue-manager.js';
import { DatabaseManager } from './database/database-manager.js';
import { ErrorHandler } from './error/error-handler.js';
import { MonitoringSystem } from './monitoring/monitoring-system.js';
import { ConfigManager } from './config/config-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Consolidated Webhook System
 * Integrates all webhook/event processing functionality from PRs #48-89
 */
export class ConsolidatedWebhookSystem {
    constructor(config = {}) {
        this.config = new ConfigManager(config);
        this.logger = logger.child({ component: 'webhook-system' });
        
        // Initialize core components
        this.errorHandler = new ErrorHandler(this.config.error);
        this.security = new SecurityManager(this.config.security);
        this.queue = new QueueManager(this.config.queue);
        this.database = new DatabaseManager(this.config.database);
        this.monitoring = new MonitoringSystem(this.config.monitoring);
        this.eventProcessor = new EventProcessor({
            queue: this.queue,
            database: this.database,
            errorHandler: this.errorHandler,
            monitoring: this.monitoring,
            ...this.config.processor
        });
        this.server = new WebhookServer({
            security: this.security,
            eventProcessor: this.eventProcessor,
            errorHandler: this.errorHandler,
            monitoring: this.monitoring,
            ...this.config.server
        });
        
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
    }

    /**
     * Initialize the webhook system
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        this.logger.info('Initializing consolidated webhook system...');

        try {
            // Initialize components in dependency order
            await this.errorHandler.initialize();
            await this.database.initialize();
            await this.queue.initialize();
            await this.security.initialize();
            await this.monitoring.initialize();
            await this.eventProcessor.initialize();
            await this.server.initialize();

            this.isInitialized = true;
            this.logger.info('Webhook system initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize webhook system', { error: error.message });
            throw error;
        }
    }

    /**
     * Start the webhook system
     */
    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            this.logger.warn('Webhook system is already running');
            return;
        }

        this.logger.info('Starting consolidated webhook system...');

        try {
            // Start components
            await this.queue.start();
            await this.monitoring.start();
            await this.server.start();

            this.isRunning = true;
            this.startTime = new Date();
            
            this.logger.info('Webhook system started successfully', {
                port: this.config.server.port,
                environment: this.config.environment
            });

            // Register shutdown handlers
            this._registerShutdownHandlers();

        } catch (error) {
            this.logger.error('Failed to start webhook system', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop the webhook system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Stopping webhook system...');

        try {
            // Stop components in reverse order
            await this.server.stop();
            await this.monitoring.stop();
            await this.queue.stop();
            await this.database.close();

            this.isRunning = false;
            this.startTime = null;
            
            this.logger.info('Webhook system stopped successfully');
        } catch (error) {
            this.logger.error('Error stopping webhook system', { error: error.message });
            throw error;
        }
    }

    /**
     * Get system health status
     */
    async getHealth() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            components: {}
        };

        try {
            // Check component health
            health.components.server = await this.server.getHealth();
            health.components.database = await this.database.getHealth();
            health.components.queue = await this.queue.getHealth();
            health.components.security = await this.security.getHealth();
            health.components.monitoring = await this.monitoring.getHealth();

            // Determine overall health
            const unhealthyComponents = Object.entries(health.components)
                .filter(([, status]) => status.status !== 'healthy');

            if (unhealthyComponents.length > 0) {
                health.status = 'degraded';
                health.issues = unhealthyComponents.map(([name, status]) => ({
                    component: name,
                    status: status.status,
                    message: status.message
                }));
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    /**
     * Get system metrics
     */
    async getMetrics() {
        return await this.monitoring.getMetrics();
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            server: this.server.getStats(),
            processor: this.eventProcessor.getStats(),
            queue: this.queue.getStats(),
            database: this.database.getStats(),
            security: this.security.getStats(),
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            isRunning: this.isRunning,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Register shutdown handlers
     */
    _registerShutdownHandlers() {
        const shutdown = async (signal) => {
            this.logger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                await this.stop();
                process.exit(0);
            } catch (error) {
                this.logger.error('Error during shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
    }
}

/**
 * Factory function to create and start webhook system
 */
export async function startWebhookSystem(config = {}) {
    const system = new ConsolidatedWebhookSystem(config);
    await system.start();
    return system;
}

/**
 * Export individual components for advanced usage
 */
export {
    WebhookServer,
    EventProcessor,
    SecurityManager,
    QueueManager,
    DatabaseManager,
    ErrorHandler,
    MonitoringSystem,
    ConfigManager
};

export default ConsolidatedWebhookSystem;

