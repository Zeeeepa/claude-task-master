/**
 * @fileoverview AgentAPI Middleware - Main Entry Point
 * @description Unified AgentAPI middleware system that consolidates 10 overlapping PRs
 * into a single comprehensive communication layer with zero redundancy.
 * 
 * Consolidates PRs: #43, #46, #47, #60, #61, #76, #83, #84, #85, #92
 */

// Core middleware components
export { AgentAPIMiddleware } from './agentapi_middleware.js';
export { AgentAPIClient } from './agentapi_client.js';
export { TaskQueue } from './task_queue.js';
export { ConfigManager } from './config_manager.js';

// Utility functions for quick setup
import { AgentAPIMiddleware } from './agentapi_middleware.js';
import { ConfigManager } from './config_manager.js';

/**
 * Create a pre-configured AgentAPI middleware instance
 * @param {Object} config - Configuration overrides
 * @returns {AgentAPIMiddleware} Configured middleware instance
 */
export async function createAgentAPIMiddleware(config = {}) {
    const configManager = new ConfigManager();
    await configManager.load();
    
    // Merge provided config with loaded config
    const fullConfig = {
        ...configManager.getAll(),
        ...config
    };
    
    return new AgentAPIMiddleware(fullConfig);
}

/**
 * Quick setup for development environment
 * @param {Object} overrides - Configuration overrides
 * @returns {AgentAPIMiddleware} Development-configured middleware
 */
export async function createDevelopmentMiddleware(overrides = {}) {
    const devConfig = {
        agentapi: {
            baseUrl: 'http://localhost:3284',
            enableEventStream: true,
            healthCheckInterval: 10000
        },
        claudeCode: {
            maxInstances: 2,
            autoStart: true
        },
        taskQueue: {
            maxConcurrentTasks: 2,
            enablePersistence: false
        },
        wsl2: {
            enabled: false // Disabled by default in development
        },
        security: {
            enableAuth: false,
            enableRateLimit: false
        },
        monitoring: {
            enabled: true,
            enableDashboard: true,
            logLevel: 'debug'
        },
        ...overrides
    };
    
    return createAgentAPIMiddleware(devConfig);
}

/**
 * Quick setup for production environment
 * @param {Object} overrides - Configuration overrides
 * @returns {AgentAPIMiddleware} Production-configured middleware
 */
export async function createProductionMiddleware(overrides = {}) {
    const prodConfig = {
        agentapi: {
            baseUrl: process.env.AGENTAPI_URL || 'http://localhost:3284',
            enableEventStream: true,
            healthCheckInterval: 30000,
            retryAttempts: 5
        },
        claudeCode: {
            maxInstances: 5,
            autoStart: false,
            autoRestart: true
        },
        taskQueue: {
            maxConcurrentTasks: 5,
            enablePersistence: true,
            maxQueueSize: 5000
        },
        wsl2: {
            enabled: true,
            maxInstances: 10,
            autoCleanup: true
        },
        security: {
            enableAuth: true,
            enableRateLimit: true,
            enableSSL: true
        },
        sync: {
            enableRealTimeSync: true,
            enablePersistence: true
        },
        monitoring: {
            enabled: true,
            enablePrometheus: true,
            enableTracing: true,
            logLevel: 'info'
        },
        ...overrides
    };
    
    return createAgentAPIMiddleware(prodConfig);
}

/**
 * Create middleware with custom configuration file
 * @param {string} configPath - Path to configuration file
 * @param {Object} overrides - Configuration overrides
 * @returns {AgentAPIMiddleware} Configured middleware
 */
export async function createMiddlewareFromConfig(configPath, overrides = {}) {
    const configManager = new ConfigManager(configPath);
    await configManager.load();
    
    const config = {
        ...configManager.getAll(),
        ...overrides
    };
    
    return new AgentAPIMiddleware(config);
}

/**
 * Validate middleware configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!config.agentapi?.baseUrl) {
        errors.push('agentapi.baseUrl is required');
    }
    
    // Validate URLs
    if (config.agentapi?.baseUrl) {
        try {
            new URL(config.agentapi.baseUrl);
        } catch {
            errors.push('agentapi.baseUrl must be a valid URL');
        }
    }
    
    // Validate numeric ranges
    const numericValidations = [
        { path: 'agentapi.timeout', min: 1000, max: 300000 },
        { path: 'claudeCode.maxInstances', min: 1, max: 50 },
        { path: 'taskQueue.maxConcurrentTasks', min: 1, max: 100 },
        { path: 'monitoring.metricsPort', min: 1024, max: 65535 }
    ];
    
    for (const validation of numericValidations) {
        const value = getNestedValue(config, validation.path);
        if (value !== undefined) {
            if (typeof value !== 'number') {
                errors.push(`${validation.path} must be a number`);
            } else if (value < validation.min || value > validation.max) {
                errors.push(`${validation.path} must be between ${validation.min} and ${validation.max}`);
            }
        }
    }
    
    // Security warnings
    if (config.security?.enableAuth && !config.security?.jwtSecret) {
        warnings.push('JWT secret should be set when authentication is enabled');
    }
    
    if (config.environment === 'production') {
        if (!config.security?.enableAuth) {
            warnings.push('Authentication should be enabled in production');
        }
        if (!config.security?.enableSSL) {
            warnings.push('SSL should be enabled in production');
        }
        if (config.monitoring?.logLevel === 'debug') {
            warnings.push('Debug logging should not be used in production');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get nested object value by path
 * @param {Object} obj - Object to search
 * @param {string} path - Dot-separated path
 * @returns {*} Value at path
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

/**
 * Default export for convenience
 */
export default {
    AgentAPIMiddleware,
    AgentAPIClient,
    TaskQueue,
    ConfigManager,
    createAgentAPIMiddleware,
    createDevelopmentMiddleware,
    createProductionMiddleware,
    createMiddlewareFromConfig,
    validateConfig
};

