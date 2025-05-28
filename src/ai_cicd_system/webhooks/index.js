/**
 * @fileoverview Webhook System Integration - Main entry point for webhook architecture
 * @description Integrates webhook components with the AI CI/CD system
 */

import { GitHubWebhookHandler } from './github_webhook_handler.js';
import { EventQueueManager } from './event_queue_manager.js';
import { EventProcessor } from './event_processor.js';
import { WebhookSecurity } from './webhook_security.js';
import { EventCorrelation } from './event_correlation.js';
import { log } from '../../utils/simple_logger.js';

/**
 * Webhook System Manager
 * Coordinates all webhook components and integrates with AI CI/CD system
 */
export class WebhookSystem {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            autoStart: config.autoStart !== false,
            ...config
        };

        this.components = new Map();
        this.isInitialized = false;
        this.isRunning = false;
        
        // Metrics
        this.metrics = {
            startTime: Date.now(),
            totalEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            lastEventTime: null
        };
    }

    /**
     * Initialize the webhook system
     */
    async initialize() {
        if (this.isInitialized) {
            log('warning', 'Webhook system already initialized');
            return;
        }

        if (!this.config.enabled) {
            log('info', 'Webhook system disabled by configuration');
            return;
        }

        try {
            log('info', 'Initializing Webhook System...');

            // Initialize components
            await this.initializeComponents();
            
            // Setup event processors
            await this.setupEventProcessors();
            
            // Setup event handlers
            this.setupEventHandlers();

            this.isInitialized = true;
            log('info', 'Webhook System initialized successfully');

            // Auto-start if configured
            if (this.config.autoStart) {
                await this.start();
            }

        } catch (error) {
            log('error', `Failed to initialize webhook system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the webhook system
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Webhook system not initialized. Call initialize() first.');
        }

        if (this.isRunning) {
            log('warning', 'Webhook system already running');
            return;
        }

        try {
            log('info', 'Starting Webhook System...');

            // Start event queue processing
            const eventQueue = this.components.get('eventQueue');
            const eventProcessor = this.components.get('eventProcessor');
            
            await eventQueue.startProcessing({
                default: this.processEvent.bind(this),
                deployment: this.processEvent.bind(this),
                validation: this.processEvent.bind(this),
                workflow: this.processEvent.bind(this),
                recovery: this.processEvent.bind(this)
            });

            // Start webhook handler
            const webhookHandler = this.components.get('webhookHandler');
            await webhookHandler.start();

            this.isRunning = true;
            log('info', 'Webhook System started successfully');

        } catch (error) {
            log('error', `Failed to start webhook system: ${error.message}`);
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

        try {
            log('info', 'Stopping Webhook System...');

            // Stop webhook handler
            const webhookHandler = this.components.get('webhookHandler');
            await webhookHandler.stop();

            // Stop event queue processing
            const eventQueue = this.components.get('eventQueue');
            await eventQueue.stopProcessing();

            this.isRunning = false;
            log('info', 'Webhook System stopped successfully');

        } catch (error) {
            log('error', `Error stopping webhook system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize webhook components
     * @private
     */
    async initializeComponents() {
        // Initialize Event Queue Manager
        const eventQueue = new EventQueueManager(this.config.queue);
        await eventQueue.initialize();
        this.components.set('eventQueue', eventQueue);

        // Initialize Webhook Security
        const security = new WebhookSecurity(this.config.security);
        await security.initialize();
        this.components.set('security', security);

        // Initialize Event Correlation
        const correlation = new EventCorrelation(this.config.correlation);
        await correlation.initialize();
        this.components.set('correlation', correlation);

        // Initialize Event Processor
        const processor = new EventProcessor(this.config.processor);
        await processor.initialize();
        this.components.set('eventProcessor', processor);

        // Initialize GitHub Webhook Handler
        const webhookHandler = new GitHubWebhookHandler({
            ...this.config.webhook,
            queue: eventQueue,
            security: security,
            correlation: correlation
        });
        await webhookHandler.initialize();
        this.components.set('webhookHandler', webhookHandler);

        log('info', 'All webhook components initialized');
    }

    /**
     * Setup event processors for different queue types
     * @private
     */
    async setupEventProcessors() {
        const eventProcessor = this.components.get('eventProcessor');
        
        // Setup processors for different event types
        this.eventProcessors = {
            default: eventProcessor.processEvent.bind(eventProcessor),
            deployment: eventProcessor.processEvent.bind(eventProcessor),
            validation: eventProcessor.processEvent.bind(eventProcessor),
            workflow: eventProcessor.processEvent.bind(eventProcessor),
            recovery: eventProcessor.processEvent.bind(eventProcessor)
        };
    }

    /**
     * Setup event handlers for component communication
     * @private
     */
    setupEventHandlers() {
        const webhookHandler = this.components.get('webhookHandler');
        const eventQueue = this.components.get('eventQueue');
        const eventProcessor = this.components.get('eventProcessor');
        const correlation = this.components.get('correlation');

        // Webhook handler events
        webhookHandler.on('event:processed', (data) => {
            this.metrics.totalEvents++;
            this.metrics.successfulEvents++;
            this.metrics.lastEventTime = new Date();
            log('debug', `Webhook event processed: ${data.event.id}`);
        });

        webhookHandler.on('event:failed', (data) => {
            this.metrics.totalEvents++;
            this.metrics.failedEvents++;
            log('error', `Webhook event failed: ${data.event.id} - ${data.error.message}`);
        });

        // Event queue events
        eventQueue.on('job:completed', (data) => {
            log('debug', `Queue job completed: ${data.jobId}`);
        });

        eventQueue.on('job:failed', (data) => {
            log('error', `Queue job failed: ${data.jobId} - ${data.error.message}`);
        });

        eventQueue.on('job:dead_lettered', (data) => {
            log('warning', `Job moved to dead letter queue: ${data.job.id}`);
        });

        // Event processor events
        eventProcessor.on('event:processed', (data) => {
            log('info', `Event processed successfully: ${data.event.id}`);
        });

        eventProcessor.on('event:failed', (data) => {
            log('error', `Event processing failed: ${data.event.id} - ${data.error.message}`);
        });

        // Correlation events
        correlation.on('workflow:created', (data) => {
            log('info', `Workflow created: ${data.workflowId}`);
        });

        correlation.on('workflow:completed', (data) => {
            log('info', `Workflow completed: ${data.workflowId}`);
        });
    }

    /**
     * Process an event from the queue
     * @param {Object} event - Event to process
     * @param {Object} job - Job metadata
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async processEvent(event, job) {
        try {
            const eventProcessor = this.components.get('eventProcessor');
            return await eventProcessor.processEvent(event, job);
        } catch (error) {
            log('error', `Error processing event ${event.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get webhook system health
     * @returns {Promise<Object>} System health status
     */
    async getHealth() {
        const health = {
            status: 'healthy',
            initialized: this.isInitialized,
            running: this.isRunning,
            components: {},
            metrics: this.getMetrics()
        };

        if (!this.isInitialized) {
            health.status = 'not_initialized';
            return health;
        }

        // Check component health
        for (const [name, component] of this.components) {
            try {
                if (component.getHealth) {
                    health.components[name] = await component.getHealth();
                } else {
                    health.components[name] = { status: 'unknown' };
                }
            } catch (error) {
                health.components[name] = { 
                    status: 'error', 
                    error: error.message 
                };
                health.status = 'degraded';
            }
        }

        return health;
    }

    /**
     * Get webhook system metrics
     * @returns {Object} System metrics
     */
    getMetrics() {
        const baseMetrics = {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            successRate: this.metrics.totalEvents > 0 ? 
                this.metrics.successfulEvents / this.metrics.totalEvents : 0
        };

        if (!this.isInitialized) {
            return baseMetrics;
        }

        // Aggregate component metrics
        const componentMetrics = {};
        for (const [name, component] of this.components) {
            if (component.getMetrics) {
                componentMetrics[name] = component.getMetrics();
            }
        }

        return {
            ...baseMetrics,
            components: componentMetrics
        };
    }

    /**
     * Get active workflows
     * @returns {Promise<Array>} Active workflows
     */
    async getActiveWorkflows() {
        if (!this.isInitialized) {
            return [];
        }

        try {
            const correlation = this.components.get('correlation');
            // This would need to be implemented in EventCorrelation
            // For now, return empty array
            return [];
        } catch (error) {
            log('error', `Error getting active workflows: ${error.message}`);
            return [];
        }
    }

    /**
     * Get queue status
     * @returns {Promise<Object>} Queue status information
     */
    async getQueueStatus() {
        if (!this.isInitialized) {
            return { status: 'not_initialized' };
        }

        try {
            const eventQueue = this.components.get('eventQueue');
            return {
                status: 'healthy',
                metrics: eventQueue.getMetrics(),
                health: await eventQueue.getHealth()
            };
        } catch (error) {
            log('error', `Error getting queue status: ${error.message}`);
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Reprocess dead letter queue items
     * @param {string} jobId - Job ID to reprocess
     * @param {string} queueType - Target queue type
     * @returns {Promise<boolean>} Success status
     */
    async reprocessDeadLetterItem(jobId, queueType = 'default') {
        if (!this.isInitialized) {
            throw new Error('Webhook system not initialized');
        }

        try {
            const eventQueue = this.components.get('eventQueue');
            return await eventQueue.reprocessDeadLetterItem(jobId, queueType);
        } catch (error) {
            log('error', `Error reprocessing dead letter item: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear correlation data
     * @param {string} type - Type of data to clear
     * @returns {Promise<number>} Number of items cleared
     */
    async clearCorrelationData(type = 'all') {
        if (!this.isInitialized) {
            throw new Error('Webhook system not initialized');
        }

        try {
            const correlation = this.components.get('correlation');
            return await correlation.clearCorrelationData(type);
        } catch (error) {
            log('error', `Error clearing correlation data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Shutdown the webhook system
     */
    async shutdown() {
        try {
            await this.stop();

            // Shutdown components in reverse order
            const shutdownOrder = [
                'webhookHandler',
                'eventProcessor',
                'correlation',
                'security',
                'eventQueue'
            ];

            for (const componentName of shutdownOrder) {
                const component = this.components.get(componentName);
                if (component && component.shutdown) {
                    await component.shutdown();
                }
            }

            this.isInitialized = false;
            log('info', 'Webhook System shutdown completed');

        } catch (error) {
            log('error', `Error during webhook system shutdown: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Factory function to create and initialize webhook system
 * @param {Object} config - Webhook system configuration
 * @returns {Promise<WebhookSystem>} Initialized webhook system
 */
export async function createWebhookSystem(config = {}) {
    const system = new WebhookSystem(config);
    await system.initialize();
    return system;
}

// Export individual components for direct use
export {
    GitHubWebhookHandler,
    EventQueueManager,
    EventProcessor,
    WebhookSecurity,
    EventCorrelation
};

export default WebhookSystem;

