/**
 * @fileoverview Webhook Configuration
 * @description Configuration settings for GitHub webhook handling and event processing
 */

/**
 * Default webhook configuration
 */
export const defaultWebhookConfig = {
    // GitHub webhook settings
    github: {
        secret: process.env.GITHUB_WEBHOOK_SECRET,
        endpoint_path: process.env.GITHUB_WEBHOOK_PATH || '/webhooks/github',
        signature_validation: process.env.GITHUB_WEBHOOK_SIGNATURE_VALIDATION !== 'false',
        supported_events: [
            'pull_request',
            'push',
            'issues',
            'check_run',
            'check_suite',
            'workflow_run',
            'release',
            'deployment',
            'deployment_status'
        ]
    },

    // Rate limiting configuration
    rate_limiting: {
        enabled: process.env.WEBHOOK_RATE_LIMITING !== 'false',
        max_requests: parseInt(process.env.WEBHOOK_MAX_REQUESTS) || 100,
        window_ms: parseInt(process.env.WEBHOOK_RATE_WINDOW_MS) || 60000, // 1 minute
        skip_successful_requests: true,
        skip_failed_requests: false
    },

    // Replay protection
    replay_protection: {
        enabled: process.env.WEBHOOK_REPLAY_PROTECTION !== 'false',
        window_ms: parseInt(process.env.WEBHOOK_REPLAY_WINDOW_MS) || 300000, // 5 minutes
        store_delivery_ids: true,
        max_stored_ids: 10000
    },

    // Event processing configuration
    event_processing: {
        queue_size: parseInt(process.env.WEBHOOK_QUEUE_SIZE) || 1000,
        processing_timeout: parseInt(process.env.WEBHOOK_PROCESSING_TIMEOUT) || 300000, // 5 minutes
        batch_size: parseInt(process.env.WEBHOOK_BATCH_SIZE) || 10,
        processing_interval: parseInt(process.env.WEBHOOK_PROCESSING_INTERVAL) || 5000, // 5 seconds
        retry_attempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3,
        retry_delay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 2000,
        dead_letter_queue: process.env.WEBHOOK_DEAD_LETTER_QUEUE !== 'false'
    },

    // Priority configuration
    priority_mapping: {
        'pull_request.opened': 'high',
        'pull_request.synchronize': 'high',
        'pull_request.closed': 'medium',
        'check_run.completed': 'high',
        'check_suite.completed': 'high',
        'workflow_run.completed': 'medium',
        'push': 'medium',
        'issues.opened': 'low',
        'issues.closed': 'low',
        'release.published': 'low'
    },

    // Event filtering
    event_filters: {
        // Only process PRs for specific branches
        pull_request_branches: process.env.WEBHOOK_PR_BRANCHES ? 
            process.env.WEBHOOK_PR_BRANCHES.split(',') : 
            ['main', 'master', 'develop', 'staging'],
        
        // Only process pushes to specific branches
        push_branches: process.env.WEBHOOK_PUSH_BRANCHES ? 
            process.env.WEBHOOK_PUSH_BRANCHES.split(',') : 
            ['main', 'master'],
        
        // Skip draft PRs
        skip_draft_prs: process.env.WEBHOOK_SKIP_DRAFT_PRS !== 'false',
        
        // Skip bot-created events
        skip_bot_events: process.env.WEBHOOK_SKIP_BOT_EVENTS !== 'false',
        
        // Repository whitelist (if specified)
        repository_whitelist: process.env.WEBHOOK_REPO_WHITELIST ? 
            process.env.WEBHOOK_REPO_WHITELIST.split(',') : 
            null
    },

    // Security settings
    security: {
        require_https: process.env.NODE_ENV === 'production',
        validate_github_ip: process.env.WEBHOOK_VALIDATE_GITHUB_IP !== 'false',
        github_ip_ranges: [
            '192.30.252.0/22',
            '185.199.108.0/22',
            '140.82.112.0/20',
            '143.55.64.0/20'
        ],
        max_payload_size: parseInt(process.env.WEBHOOK_MAX_PAYLOAD_SIZE) || 1048576, // 1MB
        request_timeout: parseInt(process.env.WEBHOOK_REQUEST_TIMEOUT) || 30000 // 30 seconds
    },

    // Logging and monitoring
    logging: {
        level: process.env.WEBHOOK_LOG_LEVEL || 'info',
        log_payloads: process.env.WEBHOOK_LOG_PAYLOADS === 'true',
        log_headers: process.env.WEBHOOK_LOG_HEADERS === 'true',
        log_processing_time: process.env.WEBHOOK_LOG_PROCESSING_TIME !== 'false'
    },

    // Metrics and monitoring
    metrics: {
        enabled: process.env.WEBHOOK_METRICS_ENABLED !== 'false',
        collection_interval: parseInt(process.env.WEBHOOK_METRICS_INTERVAL) || 60000, // 1 minute
        retention_period: parseInt(process.env.WEBHOOK_METRICS_RETENTION) || 86400000, // 24 hours
        export_prometheus: process.env.WEBHOOK_PROMETHEUS_METRICS === 'true'
    },

    // Integration settings
    integrations: {
        // Database integration
        database: {
            enabled: process.env.WEBHOOK_DATABASE_INTEGRATION !== 'false',
            store_events: process.env.WEBHOOK_STORE_EVENTS !== 'false',
            store_processing_results: process.env.WEBHOOK_STORE_RESULTS !== 'false'
        },
        
        // Notification integrations
        notifications: {
            slack: {
                enabled: process.env.WEBHOOK_SLACK_NOTIFICATIONS === 'true',
                webhook_url: process.env.SLACK_WEBHOOK_URL,
                channels: {
                    errors: process.env.SLACK_ERROR_CHANNEL || '#alerts',
                    info: process.env.SLACK_INFO_CHANNEL || '#deployments'
                }
            },
            
            email: {
                enabled: process.env.WEBHOOK_EMAIL_NOTIFICATIONS === 'true',
                smtp_config: {
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                },
                recipients: {
                    errors: process.env.EMAIL_ERROR_RECIPIENTS ? 
                        process.env.EMAIL_ERROR_RECIPIENTS.split(',') : [],
                    info: process.env.EMAIL_INFO_RECIPIENTS ? 
                        process.env.EMAIL_INFO_RECIPIENTS.split(',') : []
                }
            }
        }
    }
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
    development: {
        ...defaultWebhookConfig,
        github: {
            ...defaultWebhookConfig.github,
            signature_validation: false // Easier for local development
        },
        security: {
            ...defaultWebhookConfig.security,
            require_https: false,
            validate_github_ip: false
        },
        logging: {
            ...defaultWebhookConfig.logging,
            level: 'debug',
            log_payloads: true,
            log_headers: true
        }
    },

    test: {
        ...defaultWebhookConfig,
        github: {
            ...defaultWebhookConfig.github,
            signature_validation: false
        },
        event_processing: {
            ...defaultWebhookConfig.event_processing,
            queue_size: 100,
            processing_timeout: 10000,
            batch_size: 5
        },
        security: {
            ...defaultWebhookConfig.security,
            require_https: false,
            validate_github_ip: false
        },
        metrics: {
            ...defaultWebhookConfig.metrics,
            enabled: false
        }
    },

    staging: {
        ...defaultWebhookConfig,
        event_processing: {
            ...defaultWebhookConfig.event_processing,
            queue_size: 500,
            batch_size: 5
        },
        logging: {
            ...defaultWebhookConfig.logging,
            level: 'info',
            log_payloads: false
        }
    },

    production: {
        ...defaultWebhookConfig,
        security: {
            ...defaultWebhookConfig.security,
            require_https: true,
            validate_github_ip: true
        },
        logging: {
            ...defaultWebhookConfig.logging,
            level: 'warn',
            log_payloads: false,
            log_headers: false
        },
        metrics: {
            ...defaultWebhookConfig.metrics,
            enabled: true,
            export_prometheus: true
        }
    }
};

/**
 * Get configuration for current environment
 * @param {string} environment - Environment name
 * @returns {Object} Configuration object
 */
export function getWebhookConfig(environment = process.env.NODE_ENV || 'development') {
    const config = environmentConfigs[environment] || environmentConfigs.development;
    
    // Validate required configuration
    validateWebhookConfig(config);
    
    return config;
}

/**
 * Validate webhook configuration
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateWebhookConfig(config) {
    const errors = [];

    // Validate GitHub configuration
    if (config.github.signature_validation && !config.github.secret) {
        errors.push('GitHub webhook secret is required when signature validation is enabled');
    }

    // Validate rate limiting
    if (config.rate_limiting.enabled) {
        if (!config.rate_limiting.max_requests || config.rate_limiting.max_requests <= 0) {
            errors.push('Rate limiting max_requests must be a positive number');
        }
        if (!config.rate_limiting.window_ms || config.rate_limiting.window_ms <= 0) {
            errors.push('Rate limiting window_ms must be a positive number');
        }
    }

    // Validate event processing
    if (!config.event_processing.queue_size || config.event_processing.queue_size <= 0) {
        errors.push('Event processing queue_size must be a positive number');
    }

    // Validate security settings
    if (config.security.max_payload_size <= 0) {
        errors.push('Security max_payload_size must be a positive number');
    }

    // Validate notification integrations
    if (config.integrations.notifications.slack.enabled && !config.integrations.notifications.slack.webhook_url) {
        errors.push('Slack webhook URL is required when Slack notifications are enabled');
    }

    if (config.integrations.notifications.email.enabled) {
        const emailConfig = config.integrations.notifications.email.smtp_config;
        if (!emailConfig.host || !emailConfig.auth.user || !emailConfig.auth.pass) {
            errors.push('SMTP configuration is incomplete for email notifications');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Webhook configuration validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Create webhook configuration with overrides
 * @param {Object} overrides - Configuration overrides
 * @param {string} environment - Environment name
 * @returns {Object} Merged configuration
 */
export function createWebhookConfig(overrides = {}, environment = process.env.NODE_ENV || 'development') {
    const baseConfig = getWebhookConfig(environment);
    
    // Deep merge overrides
    const mergedConfig = deepMerge(baseConfig, overrides);
    
    // Validate merged configuration
    validateWebhookConfig(mergedConfig);
    
    return mergedConfig;
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

/**
 * Get event priority based on configuration
 * @param {string} eventType - Event type (e.g., 'pull_request.opened')
 * @param {Object} config - Webhook configuration
 * @returns {string} Priority level
 */
export function getEventPriority(eventType, config = getWebhookConfig()) {
    return config.priority_mapping[eventType] || 'medium';
}

/**
 * Check if event should be processed based on filters
 * @param {Object} event - Webhook event
 * @param {Object} config - Webhook configuration
 * @returns {boolean} True if event should be processed
 */
export function shouldProcessEvent(event, config = getWebhookConfig()) {
    const filters = config.event_filters;
    
    // Check repository whitelist
    if (filters.repository_whitelist && filters.repository_whitelist.length > 0) {
        const repoName = event.repository?.full_name;
        if (!repoName || !filters.repository_whitelist.includes(repoName)) {
            return false;
        }
    }
    
    // Check if it's a bot event and should be skipped
    if (filters.skip_bot_events && event.sender?.type === 'Bot') {
        return false;
    }
    
    // Event-specific filtering
    switch (event.type || event.action) {
        case 'pull_request':
            // Skip draft PRs if configured
            if (filters.skip_draft_prs && event.pull_request?.draft) {
                return false;
            }
            
            // Check branch filtering
            const prBranch = event.pull_request?.base?.ref;
            if (filters.pull_request_branches && !filters.pull_request_branches.includes(prBranch)) {
                return false;
            }
            break;
            
        case 'push':
            // Check branch filtering for pushes
            const pushBranch = event.ref?.replace('refs/heads/', '');
            if (filters.push_branches && !filters.push_branches.includes(pushBranch)) {
                return false;
            }
            break;
    }
    
    return true;
}

export default {
    defaultWebhookConfig,
    environmentConfigs,
    getWebhookConfig,
    validateWebhookConfig,
    createWebhookConfig,
    getEventPriority,
    shouldProcessEvent
};

