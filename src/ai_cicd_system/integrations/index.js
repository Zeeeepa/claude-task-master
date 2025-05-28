/**
 * AgentAPI Integration Module
 * 
 * Main entry point for the comprehensive AgentAPI middleware integration system.
 * Exports all components for easy integration with the claude-task-master system.
 */

// Configuration
export { 
    AGENTAPI_CONFIG, 
    getAgentConfig, 
    getAgentsByCapability, 
    validateAgentConfig,
    getEnvironmentConfig 
} from '../config/agentapi_config.js';

// Core Integration Components
export { default as AgentAPIClient } from './agentapi_client.js';
export { default as AgentRouter } from './agent_router.js';
export { default as AgentManager } from './agent_manager.js';

// Utilities and Monitoring
export { default as AgentHealthMonitor } from '../utils/agent_health_monitor.js';

// Middleware and API
export { default as AgentMiddleware } from '../middleware/agent_middleware.js';
export { default as AgentEndpoints } from '../api/agent_endpoints.js';

/**
 * AgentAPI Integration Factory
 * 
 * Factory class for creating and managing the complete AgentAPI integration system.
 */
export class AgentAPIIntegration {
    constructor(config = {}) {
        this.config = config;
        this.components = {};
        this.initialized = false;
    }

    /**
     * Initialize the complete AgentAPI integration system
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('AgentAPI integration already initialized');
        }

        try {
            // Initialize health monitor
            const { default: AgentHealthMonitor } = await import('../utils/agent_health_monitor.js');
            this.components.healthMonitor = new AgentHealthMonitor(this.config);

            // Initialize agent manager
            const { default: AgentManager } = await import('./agent_manager.js');
            this.components.agentManager = new AgentManager(this.config, this.components.healthMonitor);

            // Initialize middleware
            const { default: AgentMiddleware } = await import('../middleware/agent_middleware.js');
            this.components.middleware = new AgentMiddleware(this.config);

            // Initialize API endpoints
            const { default: AgentEndpoints } = await import('../api/agent_endpoints.js');
            this.components.endpoints = new AgentEndpoints(this.config);

            this.initialized = true;

            console.log('AgentAPI integration system initialized successfully');
            
            return this.components;

        } catch (error) {
            console.error('Failed to initialize AgentAPI integration:', error);
            throw error;
        }
    }

    /**
     * Get initialized components
     */
    getComponents() {
        if (!this.initialized) {
            throw new Error('AgentAPI integration not initialized. Call initialize() first.');
        }
        return this.components;
    }

    /**
     * Get agent manager
     */
    getAgentManager() {
        return this.components.agentManager;
    }

    /**
     * Get health monitor
     */
    getHealthMonitor() {
        return this.components.healthMonitor;
    }

    /**
     * Get API endpoints router
     */
    getAPIRouter() {
        return this.components.endpoints.getRouter();
    }

    /**
     * Get middleware functions
     */
    getMiddleware() {
        return this.components.middleware;
    }

    /**
     * Execute a task through the agent system
     */
    async executeTask(task) {
        if (!this.initialized) {
            throw new Error('AgentAPI integration not initialized');
        }
        return await this.components.agentManager.executeTask(task);
    }

    /**
     * Get system health status
     */
    getHealthStatus() {
        if (!this.initialized) {
            throw new Error('AgentAPI integration not initialized');
        }
        return this.components.healthMonitor.getHealthSummary();
    }

    /**
     * Get system metrics
     */
    getMetrics() {
        if (!this.initialized) {
            throw new Error('AgentAPI integration not initialized');
        }
        return this.components.agentManager.getMetrics();
    }

    /**
     * Shutdown the integration system
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }

        try {
            await this.components.agentManager.shutdown();
            this.components.healthMonitor.shutdown();
            await this.components.endpoints.shutdown();

            this.initialized = false;
            console.log('AgentAPI integration system shut down successfully');

        } catch (error) {
            console.error('Error during AgentAPI integration shutdown:', error);
            throw error;
        }
    }
}

/**
 * Create and initialize AgentAPI integration
 */
export async function createAgentAPIIntegration(config = {}) {
    const integration = new AgentAPIIntegration(config);
    await integration.initialize();
    return integration;
}

/**
 * Default export for convenience
 */
export default AgentAPIIntegration;

