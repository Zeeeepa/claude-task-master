/**
 * @fileoverview Integration Layer Main Export
 * @description Comprehensive integration layer for all external services
 */

// Core integration framework
export { IntegrationFramework } from './integration-framework.js';
export { EventBus } from './EventBus.js';
export { WebhookManager } from './WebhookManager.js';
export { IntegrationHealthMonitor } from './IntegrationHealthMonitor.js';

// Service integrations
export { LinearIntegration } from './LinearIntegration.js';
export { GitHubIntegration } from './GitHubIntegration.js';
export { CodegenSDKIntegration } from './CodegenSDKIntegration.js';
export { ClaudeCodeIntegration } from './ClaudeCodeIntegration.js';
export { AgentAPIIntegration } from './AgentAPIIntegration.js';

// Configuration
export { integrationConfig, validateConfig, getServiceConfig, updateConfig } from '../config/integrations.js';

// Middleware
export { 
    createWebhookMiddleware, 
    createWebhookMiddlewareStack,
    webhookSecurityMiddleware,
    webhookLoggingMiddleware,
    webhookErrorHandler
} from '../middleware/webhooks.js';

// Integration flows
export { 
    integrationFlows,
    setupEventRouting,
    setupWebhookRouting,
    setupHealthMonitoring
} from './IntegrationFlows.js';

// Re-export default as main framework
export { IntegrationFramework as default } from './integration-framework.js';

/**
 * Create a complete integration framework instance with all services
 */
export async function createIntegrationFramework(config = {}) {
    const { IntegrationFramework } = await import('./integration-framework.js');
    const { EventBus } = await import('./EventBus.js');
    const { WebhookManager } = await import('./WebhookManager.js');
    const { IntegrationHealthMonitor } = await import('./IntegrationHealthMonitor.js');
    
    // Import service integrations
    const { LinearIntegration } = await import('./LinearIntegration.js');
    const { GitHubIntegration } = await import('./GitHubIntegration.js');
    const { CodegenSDKIntegration } = await import('./CodegenSDKIntegration.js');
    const { ClaudeCodeIntegration } = await import('./ClaudeCodeIntegration.js');
    const { AgentAPIIntegration } = await import('./AgentAPIIntegration.js');
    
    // Import helper functions
    const { 
        setupEventRouting, 
        setupWebhookRouting, 
        setupHealthMonitoring 
    } = await import('./IntegrationFlows.js');
    
    // Create framework instance
    const framework = new IntegrationFramework(config);
    
    // Initialize core components
    const eventBus = new EventBus(config.eventBus);
    const webhookManager = new WebhookManager(config.webhook);
    const healthMonitor = new IntegrationHealthMonitor(config.healthMonitor);
    
    // Create service integrations
    const linearIntegration = new LinearIntegration(config.linear);
    const githubIntegration = new GitHubIntegration(config.github);
    const codegenIntegration = new CodegenSDKIntegration(config.codegen);
    const claudeCodeIntegration = new ClaudeCodeIntegration(config.claudeCode);
    const agentAPIIntegration = new AgentAPIIntegration(config.agentapi);
    
    // Register components with framework
    framework.registerComponent('eventBus', eventBus);
    framework.registerComponent('webhookManager', webhookManager);
    framework.registerComponent('healthMonitor', healthMonitor);
    framework.registerComponent('linearIntegration', linearIntegration);
    framework.registerComponent('githubIntegration', githubIntegration);
    framework.registerComponent('codegenIntegration', codegenIntegration);
    framework.registerComponent('claudeCodeIntegration', claudeCodeIntegration);
    framework.registerComponent('agentAPIIntegration', agentAPIIntegration);
    
    // Set up event routing between components
    setupEventRouting(framework, eventBus, webhookManager, healthMonitor);
    
    // Set up webhook routing
    setupWebhookRouting(webhookManager, {
        linearIntegration,
        githubIntegration,
        claudeCodeIntegration,
        agentAPIIntegration
    });
    
    // Set up health monitoring
    setupHealthMonitoring(healthMonitor, {
        linearIntegration,
        githubIntegration,
        codegenIntegration,
        claudeCodeIntegration,
        agentAPIIntegration
    });
    
    return framework;
}

/**
 * Framework version
 */
export const VERSION = '1.0.0';

/**
 * Framework metadata
 */
export const METADATA = {
    name: 'Component Integration Framework',
    version: VERSION,
    description: 'Comprehensive component integration framework for AI CI/CD systems',
    features: [
        'Service Discovery',
        'Health Monitoring', 
        'Configuration Management',
        'Event-Driven Communication',
        'Circuit Breaker Pattern',
        'Rate Limiting',
        'Load Balancing',
        'Hot Configuration Reloading'
    ],
    author: 'AI CI/CD Development Team',
    license: 'MIT'
};
