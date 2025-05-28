/**
 * AgentAPI Configuration
 * 
 * Comprehensive configuration for AgentAPI middleware integration,
 * including agent definitions, routing rules, and system settings.
 */

export const AGENTAPI_CONFIG = {
    base_url: process.env.AGENTAPI_URL || 'http://localhost:8080',
    api_key: process.env.AGENTAPI_KEY,
    timeout: 30000,
    retry_config: {
        max_retries: 3,
        backoff_multiplier: 2,
        base_delay: 1000,
        max_delay: 10000
    },
    
    // Agent definitions with capabilities and priorities
    agents: {
        'claude-code': {
            endpoint: '/api/claude-code',
            capabilities: ['pr_deployment', 'code_validation', 'error_debugging', 'code_review'],
            priority: 1,
            wsl2_instance: true,
            max_concurrent_tasks: 5,
            timeout: 300000, // 5 minutes for complex operations
            health_check_interval: 30000,
            config: {
                workspace_base: '/tmp/claude-code-workspaces',
                max_workspace_size: '10GB',
                cleanup_interval: 3600000, // 1 hour
                enable_git_operations: true,
                enable_file_operations: true,
                enable_shell_access: true
            }
        },
        'goose': {
            endpoint: '/api/goose',
            capabilities: ['code_generation', 'refactoring', 'optimization', 'documentation'],
            priority: 2,
            wsl2_instance: false,
            max_concurrent_tasks: 10,
            timeout: 120000, // 2 minutes
            health_check_interval: 15000,
            config: {
                model_config: {
                    temperature: 0.7,
                    max_tokens: 4096
                },
                enable_context_awareness: true,
                enable_multi_file_operations: true
            }
        },
        'aider': {
            endpoint: '/api/aider',
            capabilities: ['code_editing', 'file_management', 'git_operations', 'refactoring'],
            priority: 3,
            wsl2_instance: false,
            max_concurrent_tasks: 8,
            timeout: 180000, // 3 minutes
            health_check_interval: 20000,
            config: {
                git_integration: true,
                auto_commit: false,
                diff_context_lines: 3,
                enable_tree_sitter: true
            }
        },
        'codex': {
            endpoint: '/api/codex',
            capabilities: ['code_completion', 'documentation', 'testing', 'code_analysis'],
            priority: 4,
            wsl2_instance: false,
            max_concurrent_tasks: 15,
            timeout: 60000, // 1 minute
            health_check_interval: 10000,
            config: {
                completion_engine: 'codex-002',
                max_completion_length: 2048,
                enable_context_injection: true,
                enable_test_generation: true
            }
        }
    },

    // WSL2 instance management configuration
    wsl2_config: {
        max_instances: 5,
        instance_timeout: 1800000, // 30 minutes
        cleanup_interval: 300000, // 5 minutes
        base_image: 'ubuntu:22.04',
        resource_limits: {
            memory: '4GB',
            cpu: '2',
            disk: '20GB'
        },
        networking: {
            enable_internet: true,
            allowed_ports: [22, 80, 443, 3000, 8080],
            enable_port_forwarding: true
        }
    },

    // Load balancing and routing configuration
    routing_config: {
        strategy: 'capability_priority', // 'round_robin', 'least_loaded', 'capability_priority'
        enable_failover: true,
        failover_timeout: 5000,
        health_check_required: true,
        circuit_breaker: {
            failure_threshold: 5,
            recovery_timeout: 30000,
            half_open_max_calls: 3
        }
    },

    // Monitoring and metrics configuration
    monitoring: {
        enable_metrics: true,
        metrics_interval: 60000,
        enable_performance_tracking: true,
        enable_error_tracking: true,
        alert_thresholds: {
            response_time_ms: 5000,
            error_rate_percent: 5,
            availability_percent: 95
        }
    },

    // Security configuration
    security: {
        enable_api_key_validation: true,
        enable_request_signing: false,
        enable_rate_limiting: true,
        rate_limits: {
            requests_per_minute: 100,
            requests_per_hour: 1000,
            concurrent_requests: 20
        },
        allowed_origins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
        enable_cors: true
    },

    // Task queue configuration
    queue_config: {
        enable_queue: true,
        max_queue_size: 1000,
        queue_timeout: 600000, // 10 minutes
        priority_levels: ['high', 'normal', 'low'],
        enable_dead_letter_queue: true,
        retry_failed_tasks: true
    }
};

/**
 * Get agent configuration by type
 */
export function getAgentConfig(agentType) {
    const agent = AGENTAPI_CONFIG.agents[agentType];
    if (!agent) {
        throw new Error(`Unknown agent type: ${agentType}`);
    }
    return {
        ...agent,
        base_url: AGENTAPI_CONFIG.base_url,
        api_key: AGENTAPI_CONFIG.api_key,
        timeout: agent.timeout || AGENTAPI_CONFIG.timeout,
        retry_config: AGENTAPI_CONFIG.retry_config
    };
}

/**
 * Get agents by capability
 */
export function getAgentsByCapability(capability) {
    return Object.entries(AGENTAPI_CONFIG.agents)
        .filter(([_, agent]) => agent.capabilities.includes(capability))
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(([type, agent]) => ({ type, ...agent }));
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config = AGENTAPI_CONFIG) {
    const errors = [];

    // Validate base configuration
    if (!config.base_url) {
        errors.push('Base URL is required');
    }

    if (!config.api_key && process.env.NODE_ENV === 'production') {
        errors.push('API key is required for production');
    }

    // Validate agent configurations
    for (const [agentType, agentConfig] of Object.entries(config.agents)) {
        if (!agentConfig.endpoint) {
            errors.push(`Agent ${agentType} missing endpoint`);
        }

        if (!agentConfig.capabilities || agentConfig.capabilities.length === 0) {
            errors.push(`Agent ${agentType} missing capabilities`);
        }

        if (typeof agentConfig.priority !== 'number' || agentConfig.priority < 1) {
            errors.push(`Agent ${agentType} invalid priority`);
        }

        if (agentConfig.max_concurrent_tasks < 1) {
            errors.push(`Agent ${agentType} invalid max_concurrent_tasks`);
        }
    }

    // Validate WSL2 configuration
    if (config.wsl2_config.max_instances < 1) {
        errors.push('WSL2 max_instances must be at least 1');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(env = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...AGENTAPI_CONFIG };

    switch (env) {
        case 'development':
            return {
                ...baseConfig,
                timeout: 60000,
                retry_config: {
                    ...baseConfig.retry_config,
                    max_retries: 1
                },
                monitoring: {
                    ...baseConfig.monitoring,
                    metrics_interval: 30000
                }
            };

        case 'test':
            return {
                ...baseConfig,
                timeout: 5000,
                retry_config: {
                    ...baseConfig.retry_config,
                    max_retries: 0
                },
                monitoring: {
                    ...baseConfig.monitoring,
                    enable_metrics: false
                },
                wsl2_config: {
                    ...baseConfig.wsl2_config,
                    max_instances: 1
                }
            };

        case 'production':
            return {
                ...baseConfig,
                security: {
                    ...baseConfig.security,
                    enable_request_signing: true,
                    rate_limits: {
                        requests_per_minute: 60,
                        requests_per_hour: 500,
                        concurrent_requests: 10
                    }
                }
            };

        default:
            return baseConfig;
    }
}

export default AGENTAPI_CONFIG;

