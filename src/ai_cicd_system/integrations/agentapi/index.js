/**
 * AgentAPI Integration Module
 * 
 * Main entry point for the AgentAPI middleware integration system.
 * Exports all components for easy integration with the System Orchestrator.
 */

// Core components
export { AgentAPIClient } from './client.js';
export { AuthManager } from './auth_manager.js';
export { WebhookHandler } from './webhook_handler.js';
export { WSL2DeploymentManager } from './deployment_manager.js';

// Claude Code integration
export { ClaudeCodeValidator } from '../claude_code/validator.js';
export { WSL2EnvironmentManager } from '../claude_code/environment_manager.js';
export { ResultCollector } from '../claude_code/result_collector.js';

// Middleware orchestration
export { CommunicationBridge } from '../../middleware/communication_bridge.js';

// Default export for convenience
export { CommunicationBridge as default } from '../../middleware/communication_bridge.js';

/**
 * Create a fully configured AgentAPI middleware system
 * @param {Object} options - Configuration options
 * @returns {CommunicationBridge} Configured communication bridge
 */
export function createAgentAPIMiddleware(options = {}) {
    const defaultConfig = {
        agentApiUrl: process.env.AGENTAPI_URL || 'http://localhost:3284',
        agentApiKey: process.env.AGENTAPI_KEY,
        webhookPort: process.env.WEBHOOK_PORT || 3002,
        webhookSecret: process.env.WEBHOOK_SECRET,
        enableWebhooks: true,
        enableDeployments: true,
        enableValidation: true,
        enableResultCollection: true,
        maxConcurrentOperations: 5,
        operationTimeout: 30 * 60 * 1000, // 30 minutes
        logLevel: 'info'
    };

    const config = { ...defaultConfig, ...options };
    
    return new CommunicationBridge(config);
}

/**
 * Create a standalone AgentAPI client
 * @param {Object} options - Configuration options
 * @returns {AgentAPIClient} Configured AgentAPI client
 */
export function createAgentAPIClient(options = {}) {
    const defaultConfig = {
        baseURL: process.env.AGENTAPI_URL || 'http://localhost:3284',
        apiKey: process.env.AGENTAPI_KEY,
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        enableSSE: true
    };

    const config = { ...defaultConfig, ...options };
    
    return new AgentAPIClient(config);
}

/**
 * Create a webhook handler
 * @param {Object} options - Configuration options
 * @returns {WebhookHandler} Configured webhook handler
 */
export function createWebhookHandler(options = {}) {
    const defaultConfig = {
        port: process.env.WEBHOOK_PORT || 3002,
        secret: process.env.WEBHOOK_SECRET,
        enableSignatureValidation: true,
        maxPayloadSize: '10mb'
    };

    const config = { ...defaultConfig, ...options };
    
    return new WebhookHandler(config);
}

/**
 * Create an authentication manager
 * @param {Object} options - Configuration options
 * @returns {AuthManager} Configured authentication manager
 */
export function createAuthManager(options = {}) {
    const defaultConfig = {
        jwtSecret: process.env.JWT_SECRET,
        jwtExpiresIn: '24h',
        refreshTokenExpiresIn: '7d',
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000 // 15 minutes
    };

    const config = { ...defaultConfig, ...options };
    
    return new AuthManager(config);
}

/**
 * Create a WSL2 deployment manager
 * @param {Object} options - Configuration options
 * @returns {WSL2DeploymentManager} Configured deployment manager
 */
export function createDeploymentManager(options = {}) {
    const defaultConfig = {
        wslDistribution: 'Ubuntu-22.04',
        maxConcurrentDeployments: 3,
        deploymentTimeout: 30 * 60 * 1000, // 30 minutes
        workspaceRoot: '/tmp/claude-deployments',
        cleanupAfterHours: 24
    };

    const config = { ...defaultConfig, ...options };
    
    return new WSL2DeploymentManager(config);
}

/**
 * Create a Claude Code validator
 * @param {Object} options - Configuration options
 * @returns {ClaudeCodeValidator} Configured validator
 */
export function createClaudeCodeValidator(options = {}) {
    const defaultConfig = {
        agentApiUrl: process.env.AGENTAPI_URL || 'http://localhost:3284',
        agentApiKey: process.env.AGENTAPI_KEY,
        maxConcurrentValidations: 2,
        validationTimeout: 30 * 60 * 1000, // 30 minutes
        workspaceRoot: '/tmp/claude-validations',
        enableDetailedAnalysis: true,
        enableSecurityScan: true,
        enablePerformanceAnalysis: true
    };

    const config = { ...defaultConfig, ...options };
    
    return new ClaudeCodeValidator(config);
}

/**
 * Utility functions for common operations
 */
export const utils = {
    /**
     * Check if AgentAPI is available
     * @param {string} url - AgentAPI URL
     * @returns {Promise<boolean>} True if available
     */
    async checkAgentAPIAvailability(url = process.env.AGENTAPI_URL || 'http://localhost:3284') {
        try {
            const client = createAgentAPIClient({ baseURL: url, timeout: 5000 });
            const health = await client.getHealth();
            return health.success;
        } catch (error) {
            return false;
        }
    },

    /**
     * Check if WSL2 is available
     * @returns {Promise<boolean>} True if available
     */
    async checkWSL2Availability() {
        try {
            const manager = createDeploymentManager();
            const status = await manager.checkWSL2Setup();
            return status.available;
        } catch (error) {
            return false;
        }
    },

    /**
     * Validate system requirements
     * @returns {Promise<Object>} System status
     */
    async validateSystemRequirements() {
        const status = {
            agentapi: await this.checkAgentAPIAvailability(),
            wsl2: await this.checkWSL2Availability(),
            nodejs: true, // If we're running, Node.js is available
            timestamp: new Date().toISOString()
        };

        status.overall = status.agentapi && status.wsl2 && status.nodejs;
        
        return status;
    },

    /**
     * Generate system health report
     * @param {CommunicationBridge} bridge - Communication bridge instance
     * @returns {Object} Health report
     */
    generateHealthReport(bridge) {
        if (!bridge) {
            return {
                status: 'error',
                message: 'No bridge instance provided'
            };
        }

        const status = bridge.getStatus();
        
        return {
            status: status.isInitialized ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            components: status.components,
            operations: {
                active: status.activeOperations,
                queued: status.queuedOperations
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.env.npm_package_version || '1.0.0'
        };
    }
};

/**
 * Configuration presets for common scenarios
 */
export const presets = {
    /**
     * Development configuration
     */
    development: {
        logLevel: 'debug',
        enableWebhooks: true,
        enableDeployments: false, // Disable WSL2 in development
        enableValidation: false,  // Disable Claude Code in development
        maxConcurrentOperations: 2,
        operationTimeout: 5 * 60 * 1000 // 5 minutes
    },

    /**
     * Testing configuration
     */
    testing: {
        logLevel: 'error',
        enableWebhooks: false,
        enableDeployments: false,
        enableValidation: false,
        enableResultCollection: false,
        maxConcurrentOperations: 1,
        operationTimeout: 30000 // 30 seconds
    },

    /**
     * Production configuration
     */
    production: {
        logLevel: 'info',
        enableWebhooks: true,
        enableDeployments: true,
        enableValidation: true,
        enableResultCollection: true,
        maxConcurrentOperations: 10,
        operationTimeout: 30 * 60 * 1000, // 30 minutes
        retryAttempts: 5,
        retryDelay: 2000
    },

    /**
     * High-performance configuration
     */
    highPerformance: {
        logLevel: 'warn',
        enableWebhooks: true,
        enableDeployments: true,
        enableValidation: true,
        enableResultCollection: true,
        maxConcurrentOperations: 20,
        maxConcurrentDeployments: 10,
        maxConcurrentValidations: 5,
        operationTimeout: 45 * 60 * 1000, // 45 minutes
        retryAttempts: 3,
        retryDelay: 1000
    }
};

/**
 * Example usage and quick start
 */
export const examples = {
    /**
     * Basic usage example
     */
    async basicUsage() {
        // Create and initialize the middleware
        const bridge = createAgentAPIMiddleware({
            logLevel: 'info'
        });

        await bridge.initialize();

        // Process a PR validation
        const result = await bridge.processFullPRValidation({
            repository: 'owner/repo',
            number: 123,
            branch: 'feature-branch',
            cloneUrl: 'https://github.com/owner/repo.git'
        });

        console.log('Validation result:', result);

        // Cleanup
        await bridge.shutdown();
    },

    /**
     * Event-driven usage example
     */
    async eventDrivenUsage() {
        const bridge = createAgentAPIMiddleware();

        // Listen for events
        bridge.on('validation.started', (data) => {
            console.log('Validation started:', data);
        });

        bridge.on('validation.completed', (data) => {
            console.log('Validation completed:', data);
        });

        bridge.on('deployment.started', (data) => {
            console.log('Deployment started:', data);
        });

        await bridge.initialize();

        // Process operations...
    },

    /**
     * Custom configuration example
     */
    async customConfiguration() {
        const bridge = createAgentAPIMiddleware({
            ...presets.production,
            agentApiUrl: 'https://custom-agentapi.example.com',
            webhookPort: 3003,
            maxConcurrentOperations: 15,
            customOption: 'custom-value'
        });

        await bridge.initialize();
        
        // Use the bridge...
    }
};

// Export version information
export const version = {
    middleware: '1.0.0',
    agentapi: '1.0.0',
    claudeCode: '1.0.0',
    node: process.version,
    platform: process.platform
};

