/**
 * @fileoverview Consolidated Monitoring Configuration
 * @description Unified configuration for the consolidated monitoring & analytics system
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Default consolidated monitoring configuration
 */
export const DEFAULT_CONSOLIDATED_MONITORING_CONFIG = {
    // System-wide settings
    enabled: true,
    debug_mode: false,
    environment: process.env.NODE_ENV || 'development',
    
    // Performance monitoring configuration
    performance: {
        enabled: true,
        collection_interval: 30000, // 30 seconds
        optimization_enabled: true,
        thresholds: {
            cpu_usage: { warning: 70, critical: 90 },
            memory_usage: { warning: 80, critical: 95 },
            response_time: { warning: 2000, critical: 5000 },
            error_rate: { warning: 5, critical: 10 },
            query_time: { warning: 1000, critical: 3000 },
            workflow_execution_time: { warning: 300000, critical: 600000 },
            agent_response_time: { warning: 5000, critical: 10000 }
        },
        auto_optimization: {
            enabled: true,
            cpu_threshold: 85,
            memory_threshold: 90,
            response_time_threshold: 3000
        }
    },
    
    // Health checking configuration
    health: {
        enabled: true,
        check_interval: 30000, // 30 seconds
        timeout: 5000,
        auto_start: true,
        checks: {
            database: { 
                enabled: true, 
                timeout: 5000, 
                critical: true,
                query: 'SELECT 1',
                max_connections: 100
            },
            agentapi: { 
                enabled: true, 
                timeout: 3000, 
                critical: true,
                endpoint: '/health',
                expected_status: 200
            },
            codegen: { 
                enabled: true, 
                timeout: 10000, 
                critical: false,
                api_key_required: true
            },
            webhooks: { 
                enabled: true, 
                timeout: 2000, 
                critical: true,
                test_endpoint: '/webhook/test'
            },
            system_resources: { 
                enabled: true, 
                timeout: 1000, 
                critical: true,
                disk_threshold: 90,
                memory_threshold: 95
            },
            external_deps: { 
                enabled: true, 
                timeout: 5000, 
                critical: false,
                services: ['github', 'linear']
            },
            app_services: { 
                enabled: true, 
                timeout: 3000, 
                critical: true,
                services: ['task-manager', 'mcp-server']
            }
        }
    },
    
    // Metrics collection configuration
    metrics: {
        enabled: true,
        collection_interval: 60000, // 1 minute
        batch_size: 100,
        retention_days: 30,
        auto_start: true,
        export_formats: ['json', 'prometheus', 'csv'],
        collectors: {
            system: { 
                enabled: true, 
                interval: 30000,
                metrics: ['cpu', 'memory', 'disk', 'network']
            },
            workflow: { 
                enabled: true, 
                interval: 60000,
                metrics: ['execution_time', 'success_rate', 'error_rate']
            },
            agent: { 
                enabled: true, 
                interval: 60000,
                metrics: ['response_time', 'success_rate', 'token_usage']
            },
            database: { 
                enabled: true, 
                interval: 120000,
                metrics: ['query_time', 'connections', 'slow_queries']
            },
            api: { 
                enabled: true, 
                interval: 30000,
                metrics: ['response_time', 'throughput', 'error_rate']
            }
        }
    },
    
    // Alert management configuration
    alerts: {
        enabled: true,
        evaluation_interval: 60000, // 1 minute
        auto_start: true,
        escalation_enabled: true,
        auto_resolve_enabled: true,
        suppression_enabled: true,
        default_channels: ['email', 'slack'],
        rules: {
            high_cpu_usage: {
                enabled: true,
                metric: 'system.cpu_usage',
                operator: 'greater_than',
                threshold: 80,
                critical_threshold: 95,
                duration: 120000, // 2 minutes
                severity: 'warning',
                critical_severity: 'critical'
            },
            high_memory_usage: {
                enabled: true,
                metric: 'system.memory_usage',
                operator: 'greater_than',
                threshold: 85,
                critical_threshold: 95,
                duration: 180000, // 3 minutes
                severity: 'warning',
                critical_severity: 'critical'
            },
            workflow_failure_rate: {
                enabled: true,
                metric: 'workflow.success_rate',
                operator: 'less_than',
                threshold: 95,
                critical_threshold: 90,
                duration: 300000, // 5 minutes
                severity: 'warning',
                critical_severity: 'critical'
            },
            slow_api_response: {
                enabled: true,
                metric: 'api.avg_response_time',
                operator: 'greater_than',
                threshold: 2000,
                critical_threshold: 5000,
                duration: 120000, // 2 minutes
                severity: 'warning',
                critical_severity: 'critical'
            }
        }
    },
    
    // Caching configuration
    cache: {
        enabled: true,
        strategy: 'lru', // lru, lfu, ttl, fifo
        max_size: 1000,
        ttl: 300000, // 5 minutes
        enable_compression: true,
        compression_threshold: 1024, // bytes
        enable_statistics: true,
        eviction_policy: {
            max_memory_usage: 100 * 1024 * 1024, // 100MB
            cleanup_interval: 60000 // 1 minute
        }
    },
    
    // Database optimization configuration
    database: {
        enabled: true,
        query_optimization: true,
        slow_query_threshold: 1000, // ms
        connection_pooling: {
            enabled: true,
            min_connections: 5,
            max_connections: 20,
            idle_timeout: 30000,
            connection_timeout: 5000
        },
        query_analysis: {
            enabled: true,
            log_slow_queries: true,
            analyze_execution_plans: true,
            suggest_indexes: true
        },
        retry_logic: {
            enabled: true,
            max_retries: 3,
            retry_delay: 1000,
            exponential_backoff: true
        }
    },
    
    // Load balancing configuration
    load_balancer: {
        enabled: false, // Disabled by default
        strategy: 'round_robin', // round_robin, weighted_round_robin, least_connections, least_response_time, resource_based, hash
        health_check_interval: 30000,
        servers: [],
        circuit_breaker: {
            enabled: true,
            failure_threshold: 5,
            recovery_timeout: 30000,
            half_open_max_calls: 3
        }
    },
    
    // Dashboard API configuration
    dashboard: {
        enabled: true,
        port: 8080,
        auto_start: false, // Start manually in production
        cors_origins: ['http://localhost:3000', 'http://localhost:8080'],
        rate_limiting: {
            enabled: true,
            window_ms: 60000,
            max_requests: 100
        },
        real_time_updates: {
            enabled: true,
            update_interval: 30000,
            websocket_enabled: true
        },
        authentication: {
            enabled: false, // Disabled by default for development
            jwt_secret: process.env.DASHBOARD_JWT_SECRET || 'default-secret',
            session_timeout: 3600000 // 1 hour
        }
    },
    
    // Notification channels configuration
    notifications: {
        email: {
            enabled: false,
            smtp_host: process.env.SMTP_HOST || 'localhost',
            smtp_port: parseInt(process.env.SMTP_PORT) || 587,
            smtp_secure: process.env.SMTP_SECURE === 'true',
            smtp_user: process.env.SMTP_USER || '',
            smtp_pass: process.env.SMTP_PASS || '',
            from_address: process.env.EMAIL_FROM || 'monitoring@example.com',
            to_addresses: (process.env.EMAIL_TO || '').split(',').filter(Boolean),
            template_path: 'templates/email'
        },
        slack: {
            enabled: false,
            webhook_url: process.env.SLACK_WEBHOOK_URL || '',
            channel: process.env.SLACK_CHANNEL || '#monitoring',
            username: process.env.SLACK_USERNAME || 'Monitoring Bot',
            icon_emoji: process.env.SLACK_ICON || ':warning:',
            mention_users: (process.env.SLACK_MENTIONS || '').split(',').filter(Boolean)
        },
        pagerduty: {
            enabled: false,
            integration_key: process.env.PAGERDUTY_INTEGRATION_KEY || '',
            service_key: process.env.PAGERDUTY_SERVICE_KEY || '',
            severity_mapping: {
                'critical': 'critical',
                'warning': 'warning',
                'info': 'info'
            }
        },
        webhook: {
            enabled: false,
            url: process.env.WEBHOOK_URL || '',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': process.env.WEBHOOK_AUTH || ''
            },
            timeout: 5000,
            retry_attempts: 3
        }
    },
    
    // External services configuration
    external_services: {
        github: {
            api_url: 'https://api.github.com',
            token: process.env.GITHUB_TOKEN || '',
            timeout: 5000,
            rate_limit_aware: true
        },
        agentapi: {
            url: process.env.AGENTAPI_URL || 'http://localhost:3001',
            timeout: 3000,
            api_key: process.env.AGENTAPI_KEY || ''
        },
        codegen: {
            api_url: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
            api_key: process.env.CODEGEN_API_KEY || '',
            timeout: 10000
        },
        linear: {
            api_url: 'https://api.linear.app/graphql',
            api_key: process.env.LINEAR_API_KEY || '',
            timeout: 5000
        }
    },
    
    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        metrics_logging: false,
        performance_logging: true,
        alert_logging: true,
        health_logging: true,
        error_logging: true,
        log_file: process.env.LOG_FILE || null,
        log_rotation: {
            enabled: false,
            max_size: '10m',
            max_files: 5
        }
    }
};

/**
 * Environment-specific configuration overrides
 */
export const ENVIRONMENT_CONFIGS = {
    development: {
        debug_mode: true,
        performance: {
            collection_interval: 15000, // More frequent in dev
            thresholds: {
                cpu_usage: { warning: 80, critical: 95 },
                memory_usage: { warning: 85, critical: 98 }
            }
        },
        health: {
            check_interval: 15000 // More frequent health checks
        },
        metrics: {
            retention_days: 7 // Shorter retention in dev
        },
        dashboard: {
            auto_start: true, // Auto-start dashboard in dev
            authentication: {
                enabled: false // No auth in dev
            }
        },
        logging: {
            level: 'debug',
            metrics_logging: true
        }
    },
    
    test: {
        enabled: false, // Disable monitoring in tests by default
        performance: {
            enabled: false
        },
        health: {
            auto_start: false
        },
        metrics: {
            auto_start: false,
            retention_days: 1
        },
        alerts: {
            auto_start: false
        },
        dashboard: {
            enabled: false
        },
        notifications: {
            email: { enabled: false },
            slack: { enabled: false },
            pagerduty: { enabled: false },
            webhook: { enabled: false }
        }
    },
    
    production: {
        debug_mode: false,
        performance: {
            collection_interval: 60000,
            thresholds: {
                cpu_usage: { warning: 70, critical: 90 },
                memory_usage: { warning: 80, critical: 95 }
            }
        },
        health: {
            check_interval: 30000
        },
        metrics: {
            retention_days: 90 // Longer retention in prod
        },
        dashboard: {
            auto_start: false, // Manual start in prod
            authentication: {
                enabled: true // Enable auth in prod
            }
        },
        logging: {
            level: 'info',
            metrics_logging: false,
            log_file: '/var/log/monitoring.log',
            log_rotation: {
                enabled: true
            }
        },
        notifications: {
            email: { enabled: true },
            slack: { enabled: true },
            pagerduty: { enabled: true }
        }
    },
    
    staging: {
        debug_mode: false,
        performance: {
            collection_interval: 45000,
            thresholds: {
                cpu_usage: { warning: 75, critical: 92 },
                memory_usage: { warning: 82, critical: 96 }
            }
        },
        metrics: {
            retention_days: 30
        },
        dashboard: {
            auto_start: true,
            authentication: {
                enabled: true
            }
        },
        logging: {
            level: 'info',
            metrics_logging: false
        },
        notifications: {
            slack: { enabled: true }
        }
    }
};

/**
 * Get consolidated monitoring configuration for environment
 */
export function getConsolidatedMonitoringConfig(environment = null, customConfig = {}) {
    const env = environment || process.env.NODE_ENV || 'development';
    
    // Start with default config
    let config = JSON.parse(JSON.stringify(DEFAULT_CONSOLIDATED_MONITORING_CONFIG));
    
    // Apply environment-specific overrides
    if (ENVIRONMENT_CONFIGS[env]) {
        config = deepMerge(config, ENVIRONMENT_CONFIGS[env]);
    }
    
    // Apply custom configuration
    if (customConfig && Object.keys(customConfig).length > 0) {
        config = deepMerge(config, customConfig);
    }
    
    // Validate configuration
    validateConsolidatedMonitoringConfig(config);
    
    return config;
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

/**
 * Validate consolidated monitoring configuration
 */
function validateConsolidatedMonitoringConfig(config) {
    const errors = [];
    
    // Validate intervals
    if (config.performance.collection_interval < 1000) {
        errors.push('Performance collection interval must be at least 1000ms');
    }
    
    if (config.health.check_interval < 5000) {
        errors.push('Health check interval must be at least 5000ms');
    }
    
    if (config.metrics.collection_interval < 10000) {
        errors.push('Metrics collection interval must be at least 10000ms');
    }
    
    if (config.alerts.evaluation_interval < 10000) {
        errors.push('Alert evaluation interval must be at least 10000ms');
    }
    
    // Validate thresholds
    const thresholds = config.performance.thresholds;
    Object.keys(thresholds).forEach(key => {
        const threshold = thresholds[key];
        if (threshold.warning >= threshold.critical) {
            errors.push(`Warning threshold must be less than critical threshold for ${key}`);
        }
    });
    
    // Validate cache configuration
    if (config.cache.max_size < 1) {
        errors.push('Cache max size must be at least 1');
    }
    
    if (config.cache.ttl < 1000) {
        errors.push('Cache TTL must be at least 1000ms');
    }
    
    // Validate database configuration
    if (config.database.connection_pooling.min_connections < 1) {
        errors.push('Database minimum connections must be at least 1');
    }
    
    if (config.database.connection_pooling.max_connections < config.database.connection_pooling.min_connections) {
        errors.push('Database maximum connections must be greater than minimum connections');
    }
    
    // Validate dashboard configuration
    if (config.dashboard.enabled && (config.dashboard.port < 1 || config.dashboard.port > 65535)) {
        errors.push('Dashboard port must be between 1 and 65535');
    }
    
    // Validate notification channels
    if (config.notifications.email.enabled && !config.notifications.email.smtp_host) {
        errors.push('SMTP host is required when email notifications are enabled');
    }
    
    if (config.notifications.slack.enabled && !config.notifications.slack.webhook_url) {
        errors.push('Slack webhook URL is required when Slack notifications are enabled');
    }
    
    if (config.notifications.pagerduty.enabled && !config.notifications.pagerduty.integration_key) {
        errors.push('PagerDuty integration key is required when PagerDuty notifications are enabled');
    }
    
    if (errors.length > 0) {
        log('error', 'Consolidated monitoring configuration validation failed:');
        errors.forEach(error => log('error', `  - ${error}`));
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
    
    log('debug', 'Consolidated monitoring configuration validated successfully');
}

/**
 * Create monitoring configuration instance
 */
export function createConsolidatedMonitoringConfig(environment = null, customConfig = {}) {
    return getConsolidatedMonitoringConfig(environment, customConfig);
}

export default {
    getConsolidatedMonitoringConfig,
    createConsolidatedMonitoringConfig,
    DEFAULT_CONSOLIDATED_MONITORING_CONFIG,
    ENVIRONMENT_CONFIGS
};

