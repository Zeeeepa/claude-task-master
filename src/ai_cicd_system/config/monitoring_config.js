/**
 * @fileoverview Monitoring Configuration
 * @description Configuration settings for the monitoring and analytics system
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Default monitoring configuration
 */
export const DEFAULT_MONITORING_CONFIG = {
    // General monitoring settings
    enabled: true,
    debug_mode: false,
    
    // Metrics collection settings
    metrics: {
        collection_interval: 60000, // 1 minute
        batch_size: 100,
        retention_days: 30,
        auto_start: true,
        collectors: {
            system: { enabled: true, interval: 30000 },
            workflow: { enabled: true, interval: 60000 },
            agent: { enabled: true, interval: 60000 },
            database: { enabled: true, interval: 120000 },
            api: { enabled: true, interval: 30000 }
        }
    },

    // Health check settings
    health: {
        check_interval: 30000, // 30 seconds
        timeout: 5000,
        auto_start: true,
        checks: {
            database: { enabled: true, timeout: 5000, critical: true },
            agentapi: { enabled: true, timeout: 3000, critical: true },
            codegen: { enabled: true, timeout: 10000, critical: false },
            webhooks: { enabled: true, timeout: 2000, critical: true },
            system_resources: { enabled: true, timeout: 1000, critical: true },
            external_deps: { enabled: true, timeout: 5000, critical: false },
            app_services: { enabled: true, timeout: 3000, critical: true }
        }
    },

    // Performance analysis settings
    performance: {
        analysis_interval: 300000, // 5 minutes
        trend_window: 3600000, // 1 hour
        prediction_horizon: 3600000, // 1 hour
        auto_start: true,
        thresholds: {
            cpu_usage: { warning: 70, critical: 90 },
            memory_usage: { warning: 80, critical: 95 },
            response_time: { warning: 2000, critical: 5000 },
            error_rate: { warning: 5, critical: 10 },
            query_time: { warning: 1000, critical: 3000 },
            workflow_execution_time: { warning: 300000, critical: 600000 },
            agent_response_time: { warning: 5000, critical: 10000 }
        }
    },

    // Alert management settings
    alerts: {
        evaluation_interval: 60000, // 1 minute
        auto_start: true,
        default_channels: ['email', 'slack'],
        escalation_enabled: true,
        auto_resolve_enabled: true,
        suppression_enabled: true,
        rules: {
            // Rules are defined in AlertManager
        }
    },

    // Dashboard API settings
    dashboard: {
        enabled: true,
        port: 8080,
        auto_start: false, // Start manually
        cors_origins: ['http://localhost:3000', 'http://localhost:8080'],
        rate_limiting: {
            enabled: true,
            window_ms: 60000,
            max_requests: 100
        },
        real_time_updates: {
            enabled: true,
            update_interval: 30000
        }
    },

    // Notification channels
    notifications: {
        email: {
            enabled: false,
            smtp_host: process.env.SMTP_HOST || 'localhost',
            smtp_port: parseInt(process.env.SMTP_PORT) || 587,
            smtp_secure: process.env.SMTP_SECURE === 'true',
            smtp_user: process.env.SMTP_USER || '',
            smtp_pass: process.env.SMTP_PASS || '',
            from_address: process.env.EMAIL_FROM || 'monitoring@example.com',
            to_addresses: (process.env.EMAIL_TO || '').split(',').filter(Boolean)
        },
        slack: {
            enabled: false,
            webhook_url: process.env.SLACK_WEBHOOK_URL || '',
            channel: process.env.SLACK_CHANNEL || '#monitoring',
            username: process.env.SLACK_USERNAME || 'Monitoring Bot',
            icon_emoji: process.env.SLACK_ICON || ':warning:'
        },
        pagerduty: {
            enabled: false,
            integration_key: process.env.PAGERDUTY_INTEGRATION_KEY || '',
            service_key: process.env.PAGERDUTY_SERVICE_KEY || ''
        },
        webhook: {
            enabled: false,
            url: process.env.WEBHOOK_URL || '',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': process.env.WEBHOOK_AUTH || ''
            },
            timeout: 5000
        }
    },

    // Database settings (inherited from main config)
    database: {
        // Will be populated from main database config
    },

    // External service settings
    external_services: {
        github: {
            api_url: 'https://api.github.com',
            token: process.env.GITHUB_TOKEN || '',
            timeout: 5000
        },
        agentapi: {
            url: process.env.AGENTAPI_URL || 'http://localhost:3001',
            timeout: 3000
        },
        codegen: {
            api_key: process.env.CODEGEN_API_KEY || '',
            timeout: 10000
        }
    },

    // Logging settings
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        metrics_logging: false,
        performance_logging: true,
        alert_logging: true
    }
};

/**
 * Monitoring configuration manager
 */
export class MonitoringConfig {
    constructor(customConfig = {}) {
        this.config = this.mergeConfigs(DEFAULT_MONITORING_CONFIG, customConfig);
        this.validateConfig();
    }

    /**
     * Merge default config with custom config
     */
    mergeConfigs(defaultConfig, customConfig) {
        const merged = JSON.parse(JSON.stringify(defaultConfig));
        
        return this.deepMerge(merged, customConfig);
    }

    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Validate configuration
     */
    validateConfig() {
        const errors = [];

        // Validate intervals
        if (this.config.metrics.collection_interval < 1000) {
            errors.push('Metrics collection interval must be at least 1000ms');
        }

        if (this.config.health.check_interval < 5000) {
            errors.push('Health check interval must be at least 5000ms');
        }

        if (this.config.alerts.evaluation_interval < 10000) {
            errors.push('Alert evaluation interval must be at least 10000ms');
        }

        // Validate thresholds
        const thresholds = this.config.performance.thresholds;
        Object.keys(thresholds).forEach(key => {
            const threshold = thresholds[key];
            if (threshold.warning >= threshold.critical) {
                errors.push(`Warning threshold must be less than critical threshold for ${key}`);
            }
        });

        // Validate notification channels
        if (this.config.notifications.email.enabled && !this.config.notifications.email.smtp_host) {
            errors.push('SMTP host is required when email notifications are enabled');
        }

        if (this.config.notifications.slack.enabled && !this.config.notifications.slack.webhook_url) {
            errors.push('Slack webhook URL is required when Slack notifications are enabled');
        }

        if (this.config.notifications.pagerduty.enabled && !this.config.notifications.pagerduty.integration_key) {
            errors.push('PagerDuty integration key is required when PagerDuty notifications are enabled');
        }

        // Validate dashboard settings
        if (this.config.dashboard.enabled && (this.config.dashboard.port < 1 || this.config.dashboard.port > 65535)) {
            errors.push('Dashboard port must be between 1 and 65535');
        }

        if (errors.length > 0) {
            log('error', 'Monitoring configuration validation failed:');
            errors.forEach(error => log('error', `  - ${error}`));
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        log('debug', 'Monitoring configuration validated successfully');
    }

    /**
     * Get configuration value
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set configuration value
     */
    set(path, value) {
        const keys = path.split('.');
        let target = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }

        target[keys[keys.length - 1]] = value;
        log('debug', `Configuration updated: ${path} = ${JSON.stringify(value)}`);
    }

    /**
     * Get full configuration
     */
    getAll() {
        return JSON.parse(JSON.stringify(this.config));
    }

    /**
     * Update configuration
     */
    update(updates) {
        this.config = this.deepMerge(this.config, updates);
        this.validateConfig();
        log('info', 'Monitoring configuration updated');
    }

    /**
     * Reset to default configuration
     */
    reset() {
        this.config = JSON.parse(JSON.stringify(DEFAULT_MONITORING_CONFIG));
        this.validateConfig();
        log('info', 'Monitoring configuration reset to defaults');
    }

    /**
     * Get environment-specific configuration
     */
    static getEnvironmentConfig() {
        const env = process.env.NODE_ENV || 'development';
        
        const envConfigs = {
            development: {
                debug_mode: true,
                metrics: {
                    collection_interval: 30000, // More frequent in dev
                    retention_days: 7 // Shorter retention in dev
                },
                health: {
                    check_interval: 15000 // More frequent health checks
                },
                dashboard: {
                    auto_start: true // Auto-start dashboard in dev
                },
                logging: {
                    level: 'debug',
                    metrics_logging: true
                }
            },
            test: {
                enabled: false, // Disable monitoring in tests
                metrics: {
                    auto_start: false
                },
                health: {
                    auto_start: false
                },
                alerts: {
                    auto_start: false
                },
                dashboard: {
                    enabled: false
                }
            },
            production: {
                debug_mode: false,
                metrics: {
                    collection_interval: 60000,
                    retention_days: 90 // Longer retention in prod
                },
                health: {
                    check_interval: 30000
                },
                dashboard: {
                    auto_start: false // Manual start in prod
                },
                logging: {
                    level: 'info',
                    metrics_logging: false
                }
            }
        };

        return envConfigs[env] || envConfigs.development;
    }

    /**
     * Create configuration from environment
     */
    static fromEnvironment(customConfig = {}) {
        const envConfig = MonitoringConfig.getEnvironmentConfig();
        const mergedConfig = new MonitoringConfig().deepMerge(envConfig, customConfig);
        
        return new MonitoringConfig(mergedConfig);
    }

    /**
     * Export configuration to JSON
     */
    toJSON() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Load configuration from JSON
     */
    static fromJSON(jsonString) {
        try {
            const config = JSON.parse(jsonString);
            return new MonitoringConfig(config);
        } catch (error) {
            throw new Error(`Failed to parse configuration JSON: ${error.message}`);
        }
    }

    /**
     * Get configuration summary
     */
    getSummary() {
        return {
            enabled: this.config.enabled,
            metrics_enabled: this.config.metrics.auto_start,
            health_enabled: this.config.health.auto_start,
            alerts_enabled: this.config.alerts.auto_start,
            dashboard_enabled: this.config.dashboard.enabled,
            notification_channels: Object.keys(this.config.notifications).filter(
                channel => this.config.notifications[channel].enabled
            ),
            collection_interval: this.config.metrics.collection_interval,
            health_interval: this.config.health.check_interval,
            alert_interval: this.config.alerts.evaluation_interval,
            retention_days: this.config.metrics.retention_days
        };
    }
}

/**
 * Create monitoring configuration instance
 */
export function createMonitoringConfig(customConfig = {}) {
    return new MonitoringConfig(customConfig);
}

/**
 * Create environment-specific monitoring configuration
 */
export function createEnvironmentMonitoringConfig(customConfig = {}) {
    return MonitoringConfig.fromEnvironment(customConfig);
}

export default MonitoringConfig;

