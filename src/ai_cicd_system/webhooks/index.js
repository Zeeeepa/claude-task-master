/**
 * @fileoverview GitHub Webhook Integration System
 * @description Main entry point for GitHub webhook integration and event processing
 */

export { GitHubWebhookHandler } from './github_webhook_handler.js';
export { EventProcessor } from './event_processor.js';
export { SignatureValidator } from './signature_validator.js';
export { EventDeduplicator } from './event_deduplicator.js';
export { WebhookIntegrationTest } from './integration_test.js';

// Re-export related components
export { WorkflowDispatcher } from '../triggers/workflow_dispatcher.js';
export { EventQueue } from '../events/event_queue.js';
export { GitHubClient } from '../integrations/github_client.js';

/**
 * Create and configure a complete webhook system
 * @param {Object} config - Configuration options
 * @param {Object} database - Database connection
 * @returns {Object} Configured webhook system
 */
export function createWebhookSystem(config, database) {
    const webhookHandler = new GitHubWebhookHandler(config, database);
    const eventProcessor = new EventProcessor(database, config.event_processor);
    const workflowDispatcher = new WorkflowDispatcher(database, config.workflow_dispatcher);
    const eventQueue = new EventQueue(database, config.event_queue);
    const githubClient = new GitHubClient(config.github_client);

    return {
        webhookHandler,
        eventProcessor,
        workflowDispatcher,
        eventQueue,
        githubClient,
        
        async initialize() {
            await webhookHandler.initialize();
            await eventProcessor.initialize();
            await workflowDispatcher.initialize();
            await eventQueue.initialize();
        },
        
        async shutdown() {
            await webhookHandler.shutdown();
            await eventProcessor.shutdown();
            await workflowDispatcher.shutdown();
            await eventQueue.shutdown();
        },
        
        async getHealth() {
            return {
                webhook_handler: await webhookHandler.getHealth(),
                event_processor: await eventProcessor.getHealth(),
                workflow_dispatcher: await workflowDispatcher.getHealth(),
                event_queue: eventQueue.getHealth(),
                github_client: githubClient.getHealth()
            };
        }
    };
}

export default {
    GitHubWebhookHandler,
    EventProcessor,
    SignatureValidator,
    EventDeduplicator,
    WorkflowDispatcher,
    EventQueue,
    GitHubClient,
    WebhookIntegrationTest,
    createWebhookSystem
};

