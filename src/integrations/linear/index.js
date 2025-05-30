/**
 * Linear Integration Module
 * Main entry point for Linear API integration and issue orchestration
 */

// Core components
export { LinearIntegration } from './client.js';
export { LinearOrchestrator } from './orchestrator.js';
export { LinearWebhookHandler } from './webhooks.js';
export { LinearStatusManager } from './status-manager.js';

// Templates
export {
    MainIssueTemplate,
    SubIssueTemplate,
    BugReportTemplate,
    FeatureRequestTemplate,
    RestructureTemplate,
    TemplateFactory
} from './templates.js';

// Configuration
export {
    getConfig,
    validateConfig,
    getWebhookConfig,
    getStatusMapping,
    getLabelConfig,
    getTemplateConfig,
    getPerformanceConfig,
    createClientConfig,
    createOrchestratorConfig,
    createWebhookConfig,
    createStatusManagerConfig
} from '../config/linear.js';

// Authentication middleware
export {
    validateApiKey,
    validateWebhookSignature,
    webhookAuthMiddleware,
    apiAuthMiddleware,
    rateLimitMiddleware,
    corsMiddleware,
    loggingMiddleware,
    errorHandlingMiddleware,
    rawBodyMiddleware,
    securityHeadersMiddleware,
    createAuthMiddlewareStack,
    createWebhookMiddlewareStack,
    createApiMiddlewareStack
} from '../middleware/linear-auth.js';

// Formatting utilities
export {
    formatIssueTitle,
    formatMarkdownDescription,
    formatProgressComment,
    formatErrorComment,
    formatStatusComment,
    formatCompletionComment,
    formatTable,
    createProgressBar,
    getStatusEmoji,
    formatDuration,
    formatFileSize,
    formatCodeBlock,
    formatInlineCode,
    formatLink,
    formatList,
    formatChecklist,
    sanitizeMarkdown,
    truncateText
} from '../utils/linear-formatter.js';

/**
 * Linear Integration Factory
 * Factory class for creating and configuring Linear integration components
 */
export class LinearIntegrationFactory {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Create Linear client instance
     * @param {Object} overrides - Configuration overrides
     * @returns {LinearIntegration} Linear client instance
     */
    createClient(overrides = {}) {
        const { LinearIntegration } = require('./client.js');
        const clientConfig = createClientConfig({ ...this.config, ...overrides });
        
        return new LinearIntegration(
            clientConfig.apiKey,
            clientConfig.teamId,
            clientConfig
        );
    }

    /**
     * Create orchestrator instance
     * @param {LinearIntegration} linearClient - Linear client instance
     * @param {Object} database - Database connection
     * @param {Object} overrides - Configuration overrides
     * @returns {LinearOrchestrator} Orchestrator instance
     */
    createOrchestrator(linearClient, database, overrides = {}) {
        const { LinearOrchestrator } = require('./orchestrator.js');
        const orchestratorConfig = createOrchestratorConfig({ ...this.config, ...overrides });
        
        return new LinearOrchestrator(linearClient, database, orchestratorConfig);
    }

    /**
     * Create webhook handler instance
     * @param {LinearOrchestrator} orchestrator - Orchestrator instance
     * @param {Object} overrides - Configuration overrides
     * @returns {LinearWebhookHandler} Webhook handler instance
     */
    createWebhookHandler(orchestrator, overrides = {}) {
        const { LinearWebhookHandler } = require('./webhooks.js');
        const webhookConfig = createWebhookConfig({ ...this.config, ...overrides });
        
        return new LinearWebhookHandler(orchestrator, webhookConfig);
    }

    /**
     * Create status manager instance
     * @param {LinearIntegration} linearClient - Linear client instance
     * @param {Object} overrides - Configuration overrides
     * @returns {LinearStatusManager} Status manager instance
     */
    createStatusManager(linearClient, overrides = {}) {
        const { LinearStatusManager } = require('./status-manager.js');
        const statusConfig = createStatusManagerConfig({ ...this.config, ...overrides });
        
        return new LinearStatusManager(linearClient, statusConfig);
    }

    /**
     * Create complete Linear integration stack
     * @param {Object} database - Database connection
     * @param {Object} overrides - Configuration overrides
     * @returns {Object} Complete integration stack
     */
    createIntegrationStack(database, overrides = {}) {
        const config = { ...this.config, ...overrides };
        
        // Create client
        const client = this.createClient(config);
        
        // Create orchestrator
        const orchestrator = this.createOrchestrator(client, database, config);
        
        // Create webhook handler
        const webhookHandler = this.createWebhookHandler(orchestrator, config);
        
        // Create status manager
        const statusManager = this.createStatusManager(client, config);
        
        return {
            client,
            orchestrator,
            webhookHandler,
            statusManager,
            config
        };
    }
}

/**
 * Create Linear integration factory
 * @param {Object} config - Configuration object
 * @returns {LinearIntegrationFactory} Factory instance
 */
export function createLinearIntegration(config = {}) {
    return new LinearIntegrationFactory(config);
}

/**
 * Quick setup function for Linear integration
 * @param {Object} options - Setup options
 * @returns {Promise<Object>} Integration components
 */
export async function setupLinearIntegration(options = {}) {
    const {
        apiKey,
        teamId,
        database,
        webhookSecret,
        environment = 'development',
        ...otherOptions
    } = options;

    // Get environment-specific config
    const config = getConfig(environment);
    
    // Override with provided options
    const finalConfig = {
        ...config,
        apiKey: apiKey || config.apiKey,
        teamId: teamId || config.teamId,
        webhookSecret: webhookSecret || config.webhookSecret,
        ...otherOptions
    };

    // Validate configuration
    validateConfig(finalConfig);

    // Create factory
    const factory = new LinearIntegrationFactory(finalConfig);
    
    // Create integration stack
    const integration = factory.createIntegrationStack(database);
    
    // Perform health check
    const isHealthy = await integration.client.healthCheck();
    if (!isHealthy) {
        throw new Error('Linear API health check failed');
    }

    return integration;
}

/**
 * Express.js router setup for Linear webhooks
 * @param {LinearWebhookHandler} webhookHandler - Webhook handler instance
 * @param {Object} options - Router options
 * @returns {Function} Express router
 */
export function createLinearWebhookRouter(webhookHandler, options = {}) {
    const express = require('express');
    const router = express.Router();
    
    const {
        path = '/webhooks/linear',
        enableAuth = true,
        enableRateLimit = true,
        enableLogging = true
    } = options;

    // Apply middleware
    if (enableAuth || enableRateLimit || enableLogging) {
        const middlewareStack = createWebhookMiddlewareStack({
            enableRateLimit,
            enableLogging,
            enableSecurity: true
        });
        
        router.use(path, ...middlewareStack);
    }

    // Webhook endpoint
    router.post(path, async (req, res) => {
        try {
            const signature = req.headers['linear-signature'] || req.headers['x-linear-signature'];
            const result = await webhookHandler.processWebhook(req.body, signature);
            
            res.status(200).json({
                success: true,
                eventId: result.eventId,
                message: 'Webhook processed successfully'
            });
        } catch (error) {
            console.error('Webhook processing error:', error);
            
            res.status(500).json({
                success: false,
                error: error.message,
                requestId: req.requestId
            });
        }
    });

    // Health check endpoint
    router.get(`${path}/health`, (req, res) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'linear-webhook-handler'
        });
    });

    return router;
}

/**
 * Express.js router setup for Linear API endpoints
 * @param {Object} integration - Integration components
 * @param {Object} options - Router options
 * @returns {Function} Express router
 */
export function createLinearApiRouter(integration, options = {}) {
    const express = require('express');
    const router = express.Router();
    
    const {
        basePath = '/api/linear',
        enableAuth = true,
        enableRateLimit = true,
        enableLogging = true
    } = options;

    const { client, orchestrator, statusManager } = integration;

    // Apply middleware
    if (enableAuth || enableRateLimit || enableLogging) {
        const middlewareStack = createApiMiddlewareStack({
            enableRateLimit,
            enableLogging,
            enableSecurity: true
        });
        
        router.use(basePath, ...middlewareStack);
    }

    // Create issue endpoint
    router.post(`${basePath}/issues`, async (req, res) => {
        try {
            const issue = await client.createTaskIssue(req.body);
            res.status(201).json({ success: true, issue });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Update issue status endpoint
    router.patch(`${basePath}/issues/:id/status`, async (req, res) => {
        try {
            const { id } = req.params;
            const { status, metadata } = req.body;
            
            const result = await statusManager.updateTaskStatus(id, status, metadata);
            res.status(200).json({ success: true, result });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Create project issues endpoint
    router.post(`${basePath}/projects`, async (req, res) => {
        try {
            const result = await orchestrator.createProjectIssues(req.body);
            res.status(201).json({ success: true, result });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Get progress endpoint
    router.get(`${basePath}/issues/:id/progress`, async (req, res) => {
        try {
            const { id } = req.params;
            const progress = await orchestrator.validateSubIssueProgress(id);
            res.status(200).json({ success: true, progress });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Health check endpoint
    router.get(`${basePath}/health`, async (req, res) => {
        try {
            const isHealthy = await client.healthCheck();
            res.status(200).json({
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                service: 'linear-api'
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    return router;
}

// Default export
export default {
    LinearIntegration,
    LinearOrchestrator,
    LinearWebhookHandler,
    LinearStatusManager,
    LinearIntegrationFactory,
    TemplateFactory,
    createLinearIntegration,
    setupLinearIntegration,
    createLinearWebhookRouter,
    createLinearApiRouter,
    getConfig,
    validateConfig
};

