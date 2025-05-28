/**
 * @fileoverview Consolidated Testing Configuration
 * @description Unified configuration for the consolidated testing & validation framework
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Default consolidated testing configuration
 */
export const DEFAULT_CONSOLIDATED_TESTING_CONFIG = {
    // System-wide settings
    enabled: true,
    debug_mode: false,
    environment: process.env.NODE_ENV || 'development',
    
    // Test execution configuration
    execution: {
        parallel: true,
        max_workers: '50%',
        timeout: 300000, // 5 minutes
        retry_failed: true,
        max_retries: 2,
        fail_fast: false,
        bail: false,
        verbose: true,
        silent: false,
        force_exit: true,
        detect_open_handles: true
    },
    
    // Test suites configuration
    suites: {
        unit: {
            enabled: true,
            pattern: 'tests/unit/**/*.test.js',
            coverage_threshold: 95,
            timeout: 30000,
            setup_files: ['<rootDir>/tests/unit/setup.js'],
            test_environment: 'node',
            collect_coverage: true,
            coverage_paths: ['src/**/*.js'],
            coverage_ignore: ['src/**/*.test.js', 'src/**/examples/**', 'src/**/demo/**']
        },
        integration: {
            enabled: true,
            pattern: 'tests/integration/**/*.test.js',
            setup_required: true,
            timeout: 120000,
            setup_files: ['<rootDir>/tests/integration/setup.js'],
            teardown_files: ['<rootDir>/tests/integration/teardown.js'],
            test_environment: 'node',
            max_workers: 1, // Run sequentially
            services_required: ['database', 'redis']
        },
        e2e: {
            enabled: true,
            pattern: 'tests/e2e/**/*.test.js',
            setup_required: true,
            timeout: 300000,
            setup_files: ['<rootDir>/tests/e2e/setup.js'],
            teardown_files: ['<rootDir>/tests/e2e/teardown.js'],
            test_environment: 'node',
            max_workers: 1, // Run sequentially
            services_required: ['database', 'redis', 'agentapi'],
            browser_testing: false // Set to true if using browser automation
        },
        performance: {
            enabled: true,
            pattern: 'tests/performance/**/*.test.js',
            timeout: 600000, // 10 minutes
            thresholds: {
                response_time_p95: 2000, // ms
                response_time_p99: 5000, // ms
                throughput_min: 100, // requests/second
                error_rate_max: 5, // percentage
                memory_usage_max: 1024, // MB
                cpu_usage_max: 80 // percentage
            },
            load_testing: {
                enabled: true,
                concurrent_users: [10, 50, 100],
                duration: 300000, // 5 minutes
                ramp_up_time: 60000 // 1 minute
            },
            stress_testing: {
                enabled: true,
                max_users: 200,
                duration: 600000, // 10 minutes
                ramp_up_time: 120000 // 2 minutes
            },
            endurance_testing: {
                enabled: false,
                duration: 3600000, // 1 hour
                users: 50,
                ramp_up_time: 300000 // 5 minutes
            }
        },
        security: {
            enabled: true,
            pattern: 'tests/security/**/*.test.js',
            critical_threshold: 0,
            timeout: 300000,
            vulnerability_scanning: {
                enabled: true,
                tools: ['npm-audit', 'snyk', 'semgrep'],
                fail_on_critical: true,
                fail_on_high: false
            },
            dependency_check: {
                enabled: true,
                check_dev_dependencies: false,
                ignore_vulnerabilities: []
            },
            code_analysis: {
                enabled: true,
                rules: ['security', 'best-practices'],
                exclude_patterns: ['tests/**', 'node_modules/**']
            },
            penetration_testing: {
                enabled: false, // Disabled by default
                tools: ['zap', 'nikto'],
                target_urls: []
            }
        },
        workflow: {
            enabled: true,
            pattern: 'tests/workflow/**/*.test.js',
            end_to_end: true,
            timeout: 600000, // 10 minutes
            setup_files: ['<rootDir>/tests/workflow/setup.js'],
            teardown_files: ['<rootDir>/tests/workflow/teardown.js'],
            test_environment: 'node',
            max_workers: 1, // Run sequentially
            services_required: ['database', 'redis', 'agentapi', 'codegen'],
            scenarios: {
                task_creation_to_pr: true,
                error_recovery: true,
                performance_validation: true,
                security_validation: true
            }
        }
    },
    
    // Environment management configuration
    environments: {
        test: {
            database_url: process.env.TEST_DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/taskmaster_test',
            redis_url: process.env.TEST_REDIS_URL || 'redis://localhost:6379',
            agentapi_url: process.env.TEST_AGENTAPI_URL || 'http://localhost:3001',
            codegen_api_url: process.env.TEST_CODEGEN_API_URL || 'http://localhost:3002',
            setup_script: 'scripts/setup-test-env.sh',
            teardown_script: 'scripts/teardown-test-env.sh',
            data_fixtures: 'tests/fixtures',
            cleanup_after_tests: true
        },
        ci: {
            database_url: process.env.CI_DATABASE_URL,
            redis_url: process.env.CI_REDIS_URL,
            agentapi_url: process.env.CI_AGENTAPI_URL,
            codegen_api_url: process.env.CI_CODEGEN_API_URL,
            parallel_jobs: 4,
            artifact_retention: 30,
            cache_dependencies: true,
            setup_timeout: 300000, // 5 minutes
            cleanup_timeout: 120000 // 2 minutes
        },
        staging: {
            database_url: process.env.STAGING_DATABASE_URL,
            redis_url: process.env.STAGING_REDIS_URL,
            agentapi_url: process.env.STAGING_AGENTAPI_URL,
            codegen_api_url: process.env.STAGING_CODEGEN_API_URL,
            parallel_jobs: 2,
            artifact_retention: 14,
            performance_testing_enabled: true
        },
        production: {
            // Production testing configuration (smoke tests only)
            database_url: process.env.PROD_DATABASE_URL,
            redis_url: process.env.PROD_REDIS_URL,
            agentapi_url: process.env.PROD_AGENTAPI_URL,
            codegen_api_url: process.env.PROD_CODEGEN_API_URL,
            smoke_tests_only: true,
            parallel_jobs: 1,
            timeout_multiplier: 0.5 // Shorter timeouts for smoke tests
        }
    },
    
    // Reporting configuration
    reporting: {
        enabled: true,
        formats: ['json', 'html', 'junit', 'lcov', 'text'],
        output_dir: 'tests/reports',
        real_time_updates: true,
        dashboard_enabled: true,
        dashboard_port: 8081,
        dashboard_auto_start: false,
        generate_badges: true,
        upload_artifacts: true,
        artifact_retention_days: 30,
        reporters: [
            'default',
            'jest-html-reporters',
            'jest-junit'
        ],
        coverage_reporters: ['text', 'lcov', 'html', 'json-summary'],
        test_results_processor: null
    },
    
    // CI/CD integration configuration
    ci_cd: {
        enabled: true,
        github_actions: {
            enabled: true,
            workflow_file: '.github/workflows/consolidated-testing.yml',
            trigger_on: ['push', 'pull_request'],
            branches: ['main', 'develop'],
            schedule: '0 2 * * *' // Daily at 2 AM UTC
        },
        quality_gates: {
            coverage_threshold: 95,
            performance_threshold_p95: 2000,
            performance_threshold_p99: 5000,
            security_critical_threshold: 0,
            security_high_threshold: 5,
            success_rate_threshold: 95,
            flaky_test_threshold: 5 // percentage
        },
        auto_deployment: {
            enabled: false,
            environments: ['staging'],
            require_manual_approval: true,
            rollback_on_failure: true
        },
        notifications: {
            on_failure: true,
            on_success: false,
            on_quality_gate_failure: true,
            channels: ['slack', 'email']
        }
    },
    
    // Performance testing configuration
    performance: {
        enabled: true,
        tools: ['artillery', 'k6', 'autocannon'],
        default_tool: 'artillery',
        load_testing: {
            enabled: true,
            scenarios: [
                {
                    name: 'light_load',
                    concurrent_users: 10,
                    duration: 300000, // 5 minutes
                    ramp_up_time: 60000 // 1 minute
                },
                {
                    name: 'normal_load',
                    concurrent_users: 50,
                    duration: 300000,
                    ramp_up_time: 60000
                },
                {
                    name: 'heavy_load',
                    concurrent_users: 100,
                    duration: 300000,
                    ramp_up_time: 120000 // 2 minutes
                }
            ]
        },
        stress_testing: {
            enabled: true,
            max_users: 200,
            duration: 600000, // 10 minutes
            ramp_up_time: 120000, // 2 minutes
            break_point_detection: true
        },
        spike_testing: {
            enabled: true,
            baseline_users: 10,
            spike_users: 100,
            spike_duration: 60000, // 1 minute
            recovery_time: 120000 // 2 minutes
        },
        volume_testing: {
            enabled: false,
            data_volume_multiplier: 10,
            concurrent_users: 50,
            duration: 1800000 // 30 minutes
        },
        monitoring: {
            enabled: true,
            metrics: ['response_time', 'throughput', 'error_rate', 'cpu_usage', 'memory_usage'],
            real_time_dashboard: true,
            alert_on_threshold_breach: true
        }
    },
    
    // Security testing configuration
    security: {
        enabled: true,
        vulnerability_scanning: {
            enabled: true,
            tools: ['npm-audit', 'snyk', 'semgrep'],
            schedule: 'daily',
            fail_on_critical: true,
            fail_on_high: false,
            ignore_dev_dependencies: true,
            custom_rules: []
        },
        dependency_check: {
            enabled: true,
            check_licenses: true,
            allowed_licenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'],
            check_outdated: true,
            auto_update_minor: false
        },
        static_analysis: {
            enabled: true,
            tools: ['eslint-plugin-security', 'semgrep'],
            rules: ['security', 'best-practices', 'owasp-top-10'],
            exclude_patterns: ['tests/**', 'node_modules/**', 'coverage/**']
        },
        dynamic_analysis: {
            enabled: false, // Disabled by default
            tools: ['zap', 'nikto'],
            target_urls: [],
            authentication: {
                enabled: false,
                username: '',
                password: ''
            }
        },
        compliance: {
            enabled: true,
            standards: ['owasp', 'gdpr', 'pci-dss'],
            generate_reports: true,
            fail_on_non_compliance: false
        }
    },
    
    // Test data management configuration
    test_data: {
        fixtures: {
            enabled: true,
            directory: 'tests/fixtures',
            auto_load: true,
            cleanup_after_tests: true
        },
        factories: {
            enabled: true,
            directory: 'tests/factories',
            auto_register: true
        },
        mocking: {
            enabled: true,
            mock_external_apis: true,
            mock_database: false,
            mock_file_system: true,
            preserve_mocks_between_tests: false
        },
        seeding: {
            enabled: true,
            seed_database: true,
            seed_cache: false,
            cleanup_after_suite: true
        }
    },
    
    // Notification configuration
    notifications: {
        enabled: true,
        on_failure: true,
        on_success: false,
        on_quality_gate_failure: true,
        on_performance_regression: true,
        on_security_vulnerability: true,
        channels: {
            email: {
                enabled: false,
                smtp_host: process.env.SMTP_HOST || 'localhost',
                smtp_port: parseInt(process.env.SMTP_PORT) || 587,
                smtp_secure: process.env.SMTP_SECURE === 'true',
                smtp_user: process.env.SMTP_USER || '',
                smtp_pass: process.env.SMTP_PASS || '',
                from_address: process.env.EMAIL_FROM || 'testing@example.com',
                to_addresses: (process.env.EMAIL_TO || '').split(',').filter(Boolean),
                template_path: 'templates/email'
            },
            slack: {
                enabled: false,
                webhook_url: process.env.SLACK_WEBHOOK_URL || '',
                channel: process.env.SLACK_CHANNEL || '#testing',
                username: process.env.SLACK_USERNAME || 'Testing Bot',
                icon_emoji: process.env.SLACK_ICON || ':test_tube:',
                mention_on_failure: true,
                mention_users: (process.env.SLACK_MENTIONS || '').split(',').filter(Boolean)
            },
            teams: {
                enabled: false,
                webhook_url: process.env.TEAMS_WEBHOOK_URL || '',
                mention_on_failure: false
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
        }
    },
    
    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        test_logging: true,
        performance_logging: true,
        security_logging: true,
        error_logging: true,
        debug_logging: false,
        log_file: process.env.TEST_LOG_FILE || null,
        log_rotation: {
            enabled: false,
            max_size: '10m',
            max_files: 5
        },
        structured_logging: true,
        include_stack_traces: true
    }
};

/**
 * Environment-specific configuration overrides
 */
export const ENVIRONMENT_CONFIGS = {
    development: {
        debug_mode: true,
        execution: {
            timeout: 600000, // Longer timeout in dev
            verbose: true,
            detect_open_handles: true
        },
        suites: {
            unit: {
                coverage_threshold: 80 // Lower threshold in dev
            },
            performance: {
                enabled: false // Disable performance tests in dev
            },
            security: {
                vulnerability_scanning: {
                    fail_on_high: false
                }
            }
        },
        reporting: {
            dashboard_auto_start: true,
            real_time_updates: true
        },
        ci_cd: {
            quality_gates: {
                coverage_threshold: 80,
                success_rate_threshold: 90
            }
        },
        logging: {
            level: 'debug',
            debug_logging: true,
            test_logging: true
        }
    },
    
    test: {
        execution: {
            parallel: false, // Run tests sequentially in test env
            max_workers: 1,
            timeout: 120000, // Shorter timeout for unit tests
            silent: true
        },
        suites: {
            unit: {
                enabled: true,
                coverage_threshold: 95
            },
            integration: {
                enabled: false // Disable integration tests in unit test runs
            },
            e2e: {
                enabled: false
            },
            performance: {
                enabled: false
            },
            security: {
                enabled: false
            },
            workflow: {
                enabled: false
            }
        },
        reporting: {
            dashboard_enabled: false,
            real_time_updates: false,
            formats: ['json'] // Minimal reporting in test env
        },
        notifications: {
            enabled: false
        },
        logging: {
            level: 'error', // Minimal logging in test env
            test_logging: false
        }
    },
    
    ci: {
        execution: {
            parallel: true,
            max_workers: '50%',
            timeout: 300000,
            fail_fast: true,
            force_exit: true
        },
        suites: {
            unit: {
                coverage_threshold: 95
            },
            integration: {
                enabled: true,
                timeout: 180000
            },
            e2e: {
                enabled: true,
                timeout: 400000
            },
            performance: {
                enabled: true,
                load_testing: {
                    concurrent_users: [10, 25] // Reduced load in CI
                }
            },
            security: {
                enabled: true,
                vulnerability_scanning: {
                    fail_on_critical: true,
                    fail_on_high: true
                }
            }
        },
        reporting: {
            dashboard_enabled: false,
            upload_artifacts: true,
            generate_badges: true
        },
        ci_cd: {
            quality_gates: {
                coverage_threshold: 95,
                success_rate_threshold: 95
            },
            notifications: {
                on_failure: true,
                on_quality_gate_failure: true
            }
        },
        logging: {
            level: 'info',
            structured_logging: true
        }
    },
    
    staging: {
        execution: {
            parallel: true,
            max_workers: '25%', // Conservative in staging
            timeout: 400000
        },
        suites: {
            performance: {
                enabled: true,
                load_testing: {
                    concurrent_users: [10, 50, 100]
                },
                stress_testing: {
                    enabled: true,
                    max_users: 150 // Reduced for staging
                }
            },
            security: {
                enabled: true,
                dynamic_analysis: {
                    enabled: true // Enable dynamic analysis in staging
                }
            }
        },
        reporting: {
            dashboard_enabled: true,
            dashboard_auto_start: true
        },
        notifications: {
            enabled: true,
            channels: {
                slack: {
                    enabled: true
                }
            }
        }
    },
    
    production: {
        execution: {
            parallel: false, // Sequential for production smoke tests
            max_workers: 1,
            timeout: 60000, // Short timeout for smoke tests
            fail_fast: true
        },
        suites: {
            unit: {
                enabled: false // No unit tests in production
            },
            integration: {
                enabled: false
            },
            e2e: {
                enabled: true,
                pattern: 'tests/smoke/**/*.test.js', // Smoke tests only
                timeout: 120000
            },
            performance: {
                enabled: false // No performance tests in production
            },
            security: {
                enabled: true,
                vulnerability_scanning: {
                    enabled: true,
                    schedule: 'weekly'
                }
            },
            workflow: {
                enabled: false
            }
        },
        reporting: {
            dashboard_enabled: false,
            formats: ['json', 'junit']
        },
        notifications: {
            enabled: true,
            on_failure: true,
            on_success: false,
            channels: {
                email: {
                    enabled: true
                },
                slack: {
                    enabled: true,
                    mention_on_failure: true
                }
            }
        },
        logging: {
            level: 'warn',
            test_logging: false
        }
    }
};

/**
 * Get consolidated testing configuration for environment
 */
export function getConsolidatedTestingConfig(environment = null, customConfig = {}) {
    const env = environment || process.env.NODE_ENV || 'development';
    
    // Start with default config
    let config = JSON.parse(JSON.stringify(DEFAULT_CONSOLIDATED_TESTING_CONFIG));
    
    // Apply environment-specific overrides
    if (ENVIRONMENT_CONFIGS[env]) {
        config = deepMerge(config, ENVIRONMENT_CONFIGS[env]);
    }
    
    // Apply custom configuration
    if (customConfig && Object.keys(customConfig).length > 0) {
        config = deepMerge(config, customConfig);
    }
    
    // Validate configuration
    validateConsolidatedTestingConfig(config);
    
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
 * Validate consolidated testing configuration
 */
function validateConsolidatedTestingConfig(config) {
    const errors = [];
    
    // Validate execution settings
    if (config.execution.timeout < 1000) {
        errors.push('Execution timeout must be at least 1000ms');
    }
    
    if (config.execution.max_retries < 0) {
        errors.push('Max retries must be non-negative');
    }
    
    // Validate suite configurations
    Object.keys(config.suites).forEach(suiteName => {
        const suite = config.suites[suiteName];
        
        if (suite.enabled && !suite.pattern) {
            errors.push(`Test pattern is required for enabled suite: ${suiteName}`);
        }
        
        if (suite.timeout && suite.timeout < 1000) {
            errors.push(`Timeout for ${suiteName} suite must be at least 1000ms`);
        }
        
        if (suite.coverage_threshold && (suite.coverage_threshold < 0 || suite.coverage_threshold > 100)) {
            errors.push(`Coverage threshold for ${suiteName} suite must be between 0 and 100`);
        }
    });
    
    // Validate performance thresholds
    if (config.suites.performance.enabled) {
        const thresholds = config.suites.performance.thresholds;
        
        if (thresholds.response_time_p95 <= 0) {
            errors.push('Performance P95 response time threshold must be positive');
        }
        
        if (thresholds.response_time_p99 <= thresholds.response_time_p95) {
            errors.push('Performance P99 response time threshold must be greater than P95');
        }
        
        if (thresholds.error_rate_max < 0 || thresholds.error_rate_max > 100) {
            errors.push('Performance error rate threshold must be between 0 and 100');
        }
    }
    
    // Validate reporting configuration
    if (config.reporting.dashboard_enabled && (config.reporting.dashboard_port < 1 || config.reporting.dashboard_port > 65535)) {
        errors.push('Dashboard port must be between 1 and 65535');
    }
    
    // Validate CI/CD quality gates
    const gates = config.ci_cd.quality_gates;
    if (gates.coverage_threshold < 0 || gates.coverage_threshold > 100) {
        errors.push('Coverage threshold must be between 0 and 100');
    }
    
    if (gates.success_rate_threshold < 0 || gates.success_rate_threshold > 100) {
        errors.push('Success rate threshold must be between 0 and 100');
    }
    
    // Validate notification channels
    if (config.notifications.enabled) {
        if (config.notifications.channels.email.enabled && !config.notifications.channels.email.smtp_host) {
            errors.push('SMTP host is required when email notifications are enabled');
        }
        
        if (config.notifications.channels.slack.enabled && !config.notifications.channels.slack.webhook_url) {
            errors.push('Slack webhook URL is required when Slack notifications are enabled');
        }
    }
    
    if (errors.length > 0) {
        log('error', 'Consolidated testing configuration validation failed:');
        errors.forEach(error => log('error', `  - ${error}`));
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
    
    log('debug', 'Consolidated testing configuration validated successfully');
}

/**
 * Create testing configuration instance
 */
export function createConsolidatedTestingConfig(environment = null, customConfig = {}) {
    return getConsolidatedTestingConfig(environment, customConfig);
}

export default {
    getConsolidatedTestingConfig,
    createConsolidatedTestingConfig,
    DEFAULT_CONSOLIDATED_TESTING_CONFIG,
    ENVIRONMENT_CONFIGS
};

