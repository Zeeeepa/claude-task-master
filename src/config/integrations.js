/**
 * @fileoverview Integration Configuration
 * @description Centralized configuration for all external service integrations
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Integration configuration for all external services
 */
export const integrationConfig = {
    linear: {
        apiKey: process.env.LINEAR_API_KEY,
        teamId: process.env.LINEAR_TEAM_ID,
        webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
        baseUrl: process.env.LINEAR_BASE_URL || 'https://api.linear.app',
        rateLimits: { 
            requests: 1000, 
            window: 3600,
            burst: 100
        },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
        baseUrl: process.env.GITHUB_BASE_URL || 'https://api.github.com',
        rateLimits: { 
            requests: 5000, 
            window: 3600,
            burst: 200
        },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    codegen: {
        apiKey: process.env.CODEGEN_API_KEY,
        orgId: process.env.CODEGEN_ORG_ID,
        baseUrl: process.env.CODEGEN_BASE_URL || 'https://api.codegen.sh',
        rateLimits: { 
            requests: 2000, 
            window: 3600,
            burst: 150
        },
        timeout: 60000,
        retryAttempts: 5,
        retryDelay: 2000
    },
    claudeCode: {
        baseUrl: process.env.CLAUDE_CODE_BASE_URL || 'https://api.claude-code.com',
        apiKey: process.env.CLAUDE_CODE_API_KEY,
        webhookSecret: process.env.CLAUDE_CODE_WEBHOOK_SECRET,
        rateLimits: { 
            requests: 1500, 
            window: 3600,
            burst: 100
        },
        timeout: 45000,
        retryAttempts: 3,
        retryDelay: 1500
    },
    agentapi: {
        baseUrl: process.env.AGENTAPI_BASE_URL || 'https://api.agentapi.com',
        apiKey: process.env.AGENTAPI_KEY,
        webhookSecret: process.env.AGENTAPI_WEBHOOK_SECRET,
        rateLimits: { 
            requests: 3000, 
            window: 3600,
            burst: 200
        },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    webhook: {
        port: process.env.WEBHOOK_PORT || 3001,
        path: process.env.WEBHOOK_PATH || '/webhooks',
        enableSecurity: process.env.WEBHOOK_SECURITY !== 'false',
        maxPayloadSize: process.env.WEBHOOK_MAX_PAYLOAD || '10mb',
        timeout: 15000
    },
    eventBus: {
        enableWebSocket: process.env.EVENT_BUS_WS !== 'false',
        wsPort: process.env.EVENT_BUS_WS_PORT || 8080,
        maxListeners: 100,
        eventHistory: true,
        historyLimit: 1000,
        enablePersistence: process.env.EVENT_BUS_PERSISTENCE === 'true',
        persistenceFile: process.env.EVENT_BUS_PERSISTENCE_FILE || './events.log'
    },
    healthMonitor: {
        checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        alertThreshold: parseInt(process.env.HEALTH_ALERT_THRESHOLD) || 3,
        enableAlerts: process.env.HEALTH_ALERTS !== 'false',
        alertWebhook: process.env.HEALTH_ALERT_WEBHOOK,
        services: ['linear', 'github', 'codegen', 'claudeCode', 'agentapi']
    },
    circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableAudit: process.env.AUDIT_LOGGING !== 'false',
        auditFile: process.env.AUDIT_LOG_FILE || './audit.log',
        enableMetrics: process.env.METRICS_LOGGING !== 'false'
    }
};

/**
 * Validate configuration
 */
export function validateConfig() {
    const errors = [];
    
    // Check required environment variables
    const requiredVars = [
        'LINEAR_API_KEY',
        'GITHUB_TOKEN',
        'CODEGEN_API_KEY',
        'CODEGEN_ORG_ID'
    ];
    
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            errors.push(`Missing required environment variable: ${varName}`);
        }
    }
    
    // Validate URLs
    const urlFields = [
        ['linear.baseUrl', integrationConfig.linear.baseUrl],
        ['github.baseUrl', integrationConfig.github.baseUrl],
        ['codegen.baseUrl', integrationConfig.codegen.baseUrl],
        ['claudeCode.baseUrl', integrationConfig.claudeCode.baseUrl],
        ['agentapi.baseUrl', integrationConfig.agentapi.baseUrl]
    ];
    
    for (const [field, url] of urlFields) {
        try {
            new URL(url);
        } catch (error) {
            errors.push(`Invalid URL for ${field}: ${url}`);
        }
    }
    
    // Validate numeric values
    const numericFields = [
        ['webhook.port', integrationConfig.webhook.port],
        ['eventBus.wsPort', integrationConfig.eventBus.wsPort],
        ['healthMonitor.checkInterval', integrationConfig.healthMonitor.checkInterval]
    ];
    
    for (const [field, value] of numericFields) {
        if (isNaN(value) || value <= 0) {
            errors.push(`Invalid numeric value for ${field}: ${value}`);
        }
    }
    
    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
}

/**
 * Get configuration for a specific service
 */
export function getServiceConfig(serviceName) {
    if (!integrationConfig[serviceName]) {
        throw new Error(`Unknown service: ${serviceName}`);
    }
    return integrationConfig[serviceName];
}

/**
 * Update configuration at runtime
 */
export function updateConfig(serviceName, updates) {
    if (!integrationConfig[serviceName]) {
        throw new Error(`Unknown service: ${serviceName}`);
    }
    
    integrationConfig[serviceName] = {
        ...integrationConfig[serviceName],
        ...updates
    };
    
    return integrationConfig[serviceName];
}

export default integrationConfig;

