/**
 * @fileoverview Unified Monitoring Configuration
 * @description Consolidated configuration management for monitoring & analytics system
 * Combines configuration from PRs #51, #67, #71, #72, #94 with zero redundancy
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Default unified monitoring configuration
 * Consolidates all configuration options from source PRs
 */
export const DEFAULT_MONITORING_CONFIG = {
    // System-wide settings
    enabled: true,
    debug_mode: false,
    environment: process.env.NODE_ENV || 'development',
    
    // Metrics collection (from PR #51, #71)
    metrics: {
        enabled: true,
        collection_interval: 30000, // 30 seconds
        batch_size: 100,
        max_retries: 3,
        retry_delay: 1000,
        async_collection: true,
        retention_days: 30,
        auto_start: true,
        
        // Sampling configuration
        sampling: {
            enabled: true,
            rate: 0.1, // 10% sampling for high-volume metrics
            high_volume_metrics: ['webhook_events', 'api_requests', 'database_queries']
        },
        
        // Compression settings
        compression: {
            enabled: true,
            algorithm: 'gzip',
            threshold_bytes: 1024
        },
        
        // Caching configuration
        caching: {
            enabled: true,
            size: 10000,
            ttl: 300000 // 5 minutes
        },
        
        // Component-specific collectors
        collectors: {
            system: { 
                enabled: true, 
                interval: 15000,
                metrics: [
                    'memory_heap_used_mb',
                    'memory_heap_total_mb',
                    'cpu_user_ms',
                    'cpu_system_ms',
                    'uptime_seconds',
                    'event_loop_lag_ms'
                ]
            },
            workflow: { 
                enabled: true, 
                interval: 45000,
                metrics: [
                    'workflows_active',
                    'workflows_completed',
                    'workflows_failed',
                    'avg_workflow_duration_ms'
                ]
            },
            agent: { 
                enabled: true, 
                interval: 30000,
                metrics: [
                    'agents_active',
                    'agent_requests_total',
                    'agent_requests_successful',
                    'avg_agent_response_time_ms'
                ]
            },
            database: { 
                enabled: true, 
                interval: 30000,
                metrics: [
                    'connections_active',
                    'query_time_avg_ms',
                    'queries_per_second',
                    'cache_hit_rate'
                ]
            },
            api: { 
                enabled: true, 
                interval: 30000,
                metrics: [
                    'requests_total',
                    'requests_successful',
                    'avg_response_time_ms',
                    'error_rate'
                ]
            },
            codegen: {
                enabled: true,
                interval: 15000,
                metrics: [
                    'requests_total',
                    'requests_successful',
                    'quality_score',
                    'code_lines_generated'
                ]
            },
            validation: {
                enabled: true,
                interval: 30000,
                metrics: [
                    'validations_total',
                    'validations_successful',
                    'security_issues_found',
                    'code_quality_score'
                ]
            },
            webhooks: {
                enabled: true,
                interval: 20000,
                metrics: [
                    'webhooks_received',
                    'webhooks_processed',
                    'avg_processing_time_ms',
                    'webhook_queue_size'
                ]
            }
        }
    },

    // Health monitoring (from PR #71)
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
                endpoint: '/health/database'
            },
            agentapi: { 
                enabled: true, 
                timeout: 3000, 
                critical: true,
                endpoint: '/health/agentapi'
            },
            codegen: { 
                enabled: true, 
                timeout: 10000, 
                critical: false,
                endpoint: '/health/codegen'
            },
            webhooks: { 
                enabled: true, 
                timeout: 2000, 
                critical: true,
                endpoint: '/health/webhooks'
            },
            system_resources: { 
                enabled: true, 
                timeout: 1000, 
                critical: true,
                thresholds: {
                    memory_usage: 0.9,
                    cpu_usage: 0.8,
                    disk_usage: 0.9
                }
            },
            external_deps: { 
                enabled: true, 
                timeout: 5000, 
                critical: false,
                services: ['github', 'codegen_api']
            }
        }
    },

    // Performance monitoring (from PR #51, #71)
    performance: {
        enabled: true,
        real_time_monitoring: true,
        analysis_interval: 300000, // 5 minutes
        sampling_interval: 5000,
        trend_window: 3600000, // 1 hour
        prediction_horizon: 3600000, // 1 hour
        retention_period: 86400000, // 24 hours
        auto_start: true,
        
        // Performance thresholds
        thresholds: {
            api_response_time: { warning: 2000, critical: 5000 },
            database_query_time: { warning: 1000, critical: 3000 },
            workflow_execution_time: { warning: 300000, critical: 600000 },
            memory_usage: { warning: 0.8, critical: 0.95 },
            cpu_usage: { warning: 0.7, critical: 0.9 },
            error_rate: { warning: 0.05, critical: 0.1 },
            agent_response_time: { warning: 5000, critical: 10000 },
            webhook_processing_time: { warning: 5000, critical: 10000 }
        },
        
        // Baseline establishment
        baseline_establishment: {
            enabled: true,
            learning_period: 604800000, // 7 days
            confidence_threshold: 0.8
        },
        
        // Trend analysis
        trend_analysis: {
            enabled: true,
            window_size: 3600000, // 1 hour
            prediction_horizon: 86400000, // 24 hours
            confidence_threshold: 0.7
        },
        
        // Optimization features
        predictive_analysis: true,
        bottleneck_detection: true,
        optimization_suggestions: true
    },

    // Alert management (from PR #51, #71)
    alerts: {
        enabled: true,
        evaluation_interval: 60000, // 1 minute
        auto_start: true,
        default_channels: ['console', 'ai_quality_channel'],
        escalation_enabled: true,
        auto_resolve_enabled: true,
        suppression_enabled: true,
        
        // AI-specific features
        ai_specific_features: {
            intelligent_throttling: true,
            predictive_alerting: true,
            quality_tracking: true,
            trend_analysis: true
        },
        
        // Alert thresholds
        thresholds: {
            codegen_quality: 0.7,
            validation_success_rate: 0.8,
            workflow_timeout: 300000,
            error_rate_window: 300000,
            performance_degradation: 0.2,
            alert_aggregation_window: 60000
        },
        
        // Escalation policies
        escalation_policies: {
            critical_ai_failure: {
                steps: [
                    {
                        delay: 300000, // 5 minutes
                        severity: 'critical',
                        channels: ['escalation_channel', 'email']
                    },
                    {
                        delay: 900000, // 15 minutes
                        severity: 'critical',
                        channels: ['escalation_channel', 'email', 'pagerduty']
                    }
                ]
            },
            performance_degradation: {
                steps: [
                    {
                        delay: 600000, // 10 minutes
                        severity: 'warning',
                        channels: ['performance_channel']
                    },
                    {
                        delay: 1800000, // 30 minutes
                        severity: 'critical',
                        channels: ['escalation_channel', 'email']
                    }
                ]
            }
        }
    },

    // Notification channels (from PR #51, #71)
    notifications: {
        console: {
            enabled: true,
            severity_filter: ['info', 'warning', 'critical']
        },
        ai_quality_channel: {
            enabled: true,
            severity_filter: ['warning', 'critical'],
            components: ['codegen', 'validation', 'quality']
        },
        performance_channel: {
            enabled: true,
            severity_filter: ['warning', 'critical'],
            components: ['performance', 'database', 'api']
        },
        escalation_channel: {
            enabled: true,
            severity_filter: ['critical'],
            escalation_delay: 300000
        },
        email: {
            enabled: false,
            smtp_host: process.env.SMTP_HOST || 'localhost',
            smtp_port: parseInt(process.env.SMTP_PORT) || 587,
            smtp_secure: process.env.SMTP_SECURE === 'true',
            smtp_user: process.env.SMTP_USER || '',
            smtp_pass: process.env.SMTP_PASS || '',
            from_address: process.env.EMAIL_FROM || 'monitoring@example.com',
            to_addresses: (process.env.EMAIL_TO || '').split(',').filter(Boolean),
            severity_filter: ['critical']
        },
        slack: {
            enabled: false,
            webhook_url: process.env.SLACK_WEBHOOK_URL || '',
            channel: process.env.SLACK_CHANNEL || '#ai-cicd-alerts',
            username: process.env.SLACK_USERNAME || 'AI-CICD Monitoring',
            icon_emoji: process.env.SLACK_ICON || ':warning:',
            severity_filter: ['warning', 'critical']
        },
        pagerduty: {
            enabled: false,
            integration_key: process.env.PAGERDUTY_INTEGRATION_KEY || '',
            service_key: process.env.PAGERDUTY_SERVICE_KEY || '',
            severity_filter: ['critical']
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
            severity_filter: ['warning', 'critical']
        }
    },

    // Webhook handling (from PR #67)
    webhooks: {
        enabled: true,
        server: {
            port: parseInt(process.env.WEBHOOK_PORT) || 3000,
            host: process.env.WEBHOOK_HOST || '0.0.0.0',
            path: '/webhooks'
        },
        github: {
            enabled: true,
            secret: process.env.GITHUB_WEBHOOK_SECRET || '',
            events: ['pull_request', 'push', 'issues'],
            validation: {
                enabled: true,
                signature_verification: true,
                ip_whitelist: []
            }
        },
        security: {
            rate_limiting: {
                enabled: true,
                window_ms: 60000,
                max_requests: 100
            },
            ddos_protection: {
                enabled: true,
                threshold: 1000,
                window_ms: 60000
            }
        },
        processing: {
            timeout: 30000,
            retry_attempts: 3,
            retry_delay: 1000,
            queue_size: 1000
        }
    },

    // Testing framework (from PR #72, #94)
    testing: {
        enabled: true,
        auto_start: false, // Manual start for testing
        
        // Test suites configuration
        suites: {
            unit: {
                enabled: true,
                timeout: 30000,
                coverage_threshold: 95,
                parallel: true
            },
            integration: {
                enabled: true,
                timeout: 120000,
                setup_services: true,
                teardown_services: true
            },
            e2e: {
                enabled: true,
                timeout: 300000,
                browser_tests: false,
                api_tests: true
            },
            performance: {
                enabled: true,
                timeout: 600000,
                load_testing: {
                    concurrent_users: [10, 25, 50],
                    duration: 300000
                }
            },
            security: {
                enabled: true,
                timeout: 300000,
                vulnerability_scanning: {
                    fail_on_critical: true,
                    fail_on_high: false
                }
            },
            workflow: {
                enabled: true,
                timeout: 600000,
                end_to_end_validation: true
            }
        },
        
        // Execution configuration
        execution: {
            parallel: true,
            max_workers: '50%',
            bail_on_failure: false,
            verbose: true
        },
        
        // Quality gates
        quality_gates: {
            coverage_threshold: 95,
            performance_threshold_p95: 2000,
            security_critical_threshold: 0,
            success_rate_threshold: 95
        },
        
        // CI/CD integration
        ci_cd: {
            enabled: true,
            github_actions: true,
            quality_gates: {
                coverage_threshold: 95,
                performance_threshold_p95: 2000,
                security_critical_threshold: 0,
                success_rate_threshold: 95
            }
        }
    },

    // Dashboard configuration (from PR #51, #71)
    dashboard: {
        enabled: true,
        port: parseInt(process.env.DASHBOARD_PORT) || 8080,
        host: process.env.DASHBOARD_HOST || '0.0.0.0',
        auto_start: false, // Manual start
        
        cors_origins: [
            'http://localhost:3000',
            'http://localhost:8080',
            process.env.DASHBOARD_CORS_ORIGIN
        ].filter(Boolean),
        
        rate_limiting: {
            enabled: true,
            window_ms: 60000,
            max_requests: 100
        },
        
        real_time_updates: {
            enabled: true,
            update_interval: 30000,
            websocket: true
        },
        
        authentication: {
            enabled: false,
            method: 'jwt',
            secret: process.env.DASHBOARD_JWT_SECRET || ''
        }
    },

    // External services (from PR #67, #71)
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
            base_url: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
            api_key: process.env.CODEGEN_API_KEY || '',
            timeout: 10000
        }
    },

    // Data retention (from PR #51)
    data_retention: {
        metrics: {
            raw_data: '24h',
            aggregated_1m: '7d',
            aggregated_5m: '30d',
            aggregated_1h: '90d',
            aggregated_1d: '1y'
        },
        alerts: {
            active: '30d',
            resolved: '90d',
            history: '1y'
        },
        test_results: {
            detailed: '7d',
            aggregated: '30d',
            reports: '90d'
        },
        webhook_logs: {
            successful: '7d',
            failed: '30d',
            security_events: '90d'
        }
    },

    // Security configuration
    security: {
        authentication: {
            enabled: true,
            method: 'jwt',
            secret: process.env.MONITORING_JWT_SECRET || ''
        },
        authorization: {
            enabled: true,
            roles: {
                admin: ['read', 'write', 'configure'],
                operator: ['read', 'write'],
                viewer: ['read']
            }
        },
        encryption: {
            enabled: true,
            algorithm: 'AES-256-GCM',
            key: process.env.MONITORING_ENCRYPTION_KEY || ''
        },
        audit_logging: {
            enabled: true,
            log_file: 'logs/monitoring_audit.log',
            retention: '1y'
        }
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        metrics_logging: false,
        performance_logging: true,
        alert_logging: true,
        webhook_logging: true,
        test_logging: true
    }
};

/**
 * Unified monitoring configuration manager
 * Consolidates configuration management from all source PRs
 */
export class MonitoringConfig {
    constructor(customConfig = {}) {
        this.config = this.mergeConfigs(DEFAULT_MONITORING_CONFIG, customConfig);
        this.validateConfig();
        
        log('debug', 'Monitoring configuration initialized');
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
     * Comprehensive configuration validation
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

        // Validate webhook configuration
        if (this.config.webhooks.enabled) {
            if (this.config.webhooks.github.enabled && !this.config.webhooks.github.secret) {
                log('warning', 'GitHub webhook secret not configured - signature verification disabled');
            }
        }

        // Validate testing configuration
        if (this.config.testing.enabled) {
            const coverageThreshold = this.config.testing.quality_gates.coverage_threshold;
            if (coverageThreshold < 0 || coverageThreshold > 100) {
                errors.push('Coverage threshold must be between 0 and 100');
            }
        }

        // Validate dashboard settings
        if (this.config.dashboard.enabled) {
            const port = this.config.dashboard.port;
            if (port < 1 || port > 65535) {
                errors.push('Dashboard port must be between 1 and 65535');
            }
        }

        if (errors.length > 0) {
            log('error', 'Monitoring configuration validation failed:');
            errors.forEach(error => log('error', `  - ${error}`));
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        log('debug', 'Monitoring configuration validated successfully');
    }

    /**
     * Get configuration value by path
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
     * Set configuration value by path
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
                    collection_interval: 15000, // More frequent in dev
                    retention_days: 7 // Shorter retention in dev
                },
                health: {
                    check_interval: 15000 // More frequent health checks
                },
                dashboard: {
                    auto_start: true // Auto-start dashboard in dev
                },
                testing: {
                    auto_start: true // Auto-start testing in dev
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
                webhooks: {
                    enabled: false
                },
                dashboard: {
                    enabled: false
                },
                testing: {
                    enabled: true,
                    auto_start: true
                }
            },
            production: {
                debug_mode: false,
                metrics: {
                    collection_interval: 30000,
                    retention_days: 90 // Longer retention in prod
                },
                health: {
                    check_interval: 30000
                },
                dashboard: {
                    auto_start: false // Manual start in prod
                },
                testing: {
                    auto_start: false // Manual testing in prod
                },
                notifications: {
                    email: {
                        enabled: true
                    },
                    pagerduty: {
                        enabled: true
                    }
                },
                security: {
                    authentication: {
                        enabled: true
                    },
                    encryption: {
                        enabled: true
                    }
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
            environment: this.config.environment,
            metrics_enabled: this.config.metrics.enabled,
            health_enabled: this.config.health.enabled,
            alerts_enabled: this.config.alerts.enabled,
            webhooks_enabled: this.config.webhooks.enabled,
            testing_enabled: this.config.testing.enabled,
            dashboard_enabled: this.config.dashboard.enabled,
            notification_channels: Object.keys(this.config.notifications).filter(
                channel => this.config.notifications[channel].enabled
            ),
            collection_interval: this.config.metrics.collection_interval,
            health_interval: this.config.health.check_interval,
            alert_interval: this.config.alerts.evaluation_interval,
            retention_days: this.config.metrics.retention_days,
            consolidation_info: {
                source_prs: ['#51', '#67', '#71', '#72', '#94'],
                zero_redundancy: true,
                unified_configuration: true
            }
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

