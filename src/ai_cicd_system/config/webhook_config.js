/**
 * @fileoverview Webhook Configuration
 * @description Configuration for GitHub webhook integration and event processing
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Supported GitHub webhook events and their configurations
 */
export const SUPPORTED_EVENTS = {
    'pull_request': {
        actions: ['opened', 'synchronize', 'reopened', 'closed'],
        priority: 'high'
    },
    'push': {
        actions: ['main', 'master', 'develop'],
        priority: 'medium'
    },
    'issues': {
        actions: ['opened', 'edited', 'labeled'],
        priority: 'low'
    },
    'workflow_run': {
        actions: ['completed', 'failed'],
        priority: 'high'
    }
};

/**
 * Event processing pipeline stages
 */
export const PROCESSING_PIPELINE = [
    'validateEvent',
    'extractMetadata',
    'createTask',
    'triggerWorkflow',
    'updateStatus',
    'notifyStakeholders'
];

/**
 * Webhook configuration with environment-based settings
 */
export const WEBHOOK_CONFIG = {
    // Webhook endpoint configuration
    endpoint: process.env.WEBHOOK_ENDPOINT || '/api/webhooks/github',
    secret: process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret-here',
    
    // Supported events
    events: ['pull_request', 'push', 'issues', 'workflow_run'],
    content_type: 'application/json',
    ssl_verification: process.env.WEBHOOK_SSL_VERIFICATION !== 'false',
    
    // Retry configuration for failed webhook processing
    retry_config: {
        max_retries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
        backoff_multiplier: parseFloat(process.env.WEBHOOK_BACKOFF_MULTIPLIER) || 2,
        base_delay: parseInt(process.env.WEBHOOK_BASE_DELAY) || 1000,
        max_delay: parseInt(process.env.WEBHOOK_MAX_DELAY) || 30000
    },
    
    // Rate limiting configuration
    rate_limit: {
        window_ms: parseInt(process.env.WEBHOOK_RATE_WINDOW_MS) || 60000, // 1 minute
        max_requests: parseInt(process.env.WEBHOOK_RATE_MAX_REQUESTS) || 100,
        skip_successful: process.env.WEBHOOK_RATE_SKIP_SUCCESSFUL === 'true'
    },
    
    // Security configuration
    security: {
        signature_header: 'x-hub-signature-256',
        user_agent_pattern: /^GitHub-Hookshot\//,
        allowed_ips: process.env.GITHUB_WEBHOOK_IPS ? 
            process.env.GITHUB_WEBHOOK_IPS.split(',') : 
            [
                '192.30.252.0/22',
                '185.199.108.0/22',
                '140.82.112.0/20',
                '143.55.64.0/20'
            ]
    },
    
    // Processing configuration
    processing: {
        timeout_ms: parseInt(process.env.WEBHOOK_PROCESSING_TIMEOUT) || 30000,
        concurrent_limit: parseInt(process.env.WEBHOOK_CONCURRENT_LIMIT) || 10,
        queue_max_size: parseInt(process.env.WEBHOOK_QUEUE_MAX_SIZE) || 1000
    },
    
    // Database configuration for webhook events
    database: {
        table_name: process.env.WEBHOOK_EVENTS_TABLE || 'webhook_events',
        retention_days: parseInt(process.env.WEBHOOK_RETENTION_DAYS) || 30,
        cleanup_interval_hours: parseInt(process.env.WEBHOOK_CLEANUP_INTERVAL) || 24
    },
    
    // Monitoring and logging
    monitoring: {
        enabled: process.env.WEBHOOK_MONITORING_ENABLED !== 'false',
        metrics_endpoint: process.env.WEBHOOK_METRICS_ENDPOINT || '/api/webhooks/metrics',
        health_endpoint: process.env.WEBHOOK_HEALTH_ENDPOINT || '/api/webhooks/health'
    }
};

/**
 * Priority levels for event processing
 */
export const PRIORITY_LEVELS = {
    'critical': 0,
    'high': 1,
    'medium': 2,
    'low': 3
};

/**
 * Event status constants
 */
export const EVENT_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying',
    SKIPPED: 'skipped'
};

/**
 * Validate webhook configuration
 * @returns {Object} Validation result
 */
export function validateWebhookConfig() {
    const errors = [];
    
    if (!WEBHOOK_CONFIG.secret || WEBHOOK_CONFIG.secret === 'your-webhook-secret-here') {
        errors.push('GITHUB_WEBHOOK_SECRET must be set to a secure value');
    }
    
    if (WEBHOOK_CONFIG.secret && WEBHOOK_CONFIG.secret.length < 16) {
        errors.push('GITHUB_WEBHOOK_SECRET should be at least 16 characters long');
    }
    
    if (WEBHOOK_CONFIG.retry_config.max_retries < 0 || WEBHOOK_CONFIG.retry_config.max_retries > 10) {
        errors.push('max_retries should be between 0 and 10');
    }
    
    if (WEBHOOK_CONFIG.processing.timeout_ms < 1000 || WEBHOOK_CONFIG.processing.timeout_ms > 300000) {
        errors.push('processing timeout should be between 1 second and 5 minutes');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get configuration for specific environment
 * @param {string} env - Environment name
 * @returns {Object} Environment-specific configuration
 */
export function getEnvironmentConfig(env = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...WEBHOOK_CONFIG };
    
    switch (env) {
        case 'production':
            return {
                ...baseConfig,
                ssl_verification: true,
                rate_limit: {
                    ...baseConfig.rate_limit,
                    max_requests: 1000
                },
                processing: {
                    ...baseConfig.processing,
                    concurrent_limit: 50
                }
            };
            
        case 'staging':
            return {
                ...baseConfig,
                rate_limit: {
                    ...baseConfig.rate_limit,
                    max_requests: 500
                },
                processing: {
                    ...baseConfig.processing,
                    concurrent_limit: 25
                }
            };
            
        case 'development':
        case 'test':
            return {
                ...baseConfig,
                ssl_verification: false,
                rate_limit: {
                    ...baseConfig.rate_limit,
                    max_requests: 100
                },
                processing: {
                    ...baseConfig.processing,
                    concurrent_limit: 5
                }
            };
            
        default:
            return baseConfig;
    }
}

export default WEBHOOK_CONFIG;

