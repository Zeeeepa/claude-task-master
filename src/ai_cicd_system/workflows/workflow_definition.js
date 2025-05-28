/**
 * Workflow Definition Schema
 * Defines the structure and configuration for various CI/CD workflows
 */

export const WORKFLOW_DEFINITIONS = {
    'pr_processing': {
        id: 'pr_processing',
        name: 'Pull Request Processing Workflow',
        description: 'Complete PR analysis, code generation, and deployment',
        version: '1.0.0',
        steps: [
            {
                id: 'analyze_pr',
                name: 'Analyze Pull Request',
                type: 'analysis',
                agent: 'claude-code',
                dependencies: [],
                timeout: 60000,
                retry_count: 3,
                parallel: false,
                config: {
                    analysis_depth: 'comprehensive',
                    include_dependencies: true,
                    check_security: true
                }
            },
            {
                id: 'generate_tasks',
                name: 'Generate AI Tasks',
                type: 'generation',
                agent: 'codegen',
                dependencies: ['analyze_pr'],
                timeout: 120000,
                retry_count: 2,
                parallel: false,
                config: {
                    task_complexity: 'medium',
                    auto_assign: true,
                    priority_level: 'high'
                }
            },
            {
                id: 'deploy_branch',
                name: 'Deploy PR Branch',
                type: 'deployment',
                agent: 'claude-code',
                dependencies: ['generate_tasks'],
                timeout: 300000,
                retry_count: 3,
                parallel: false,
                config: {
                    environment: 'staging',
                    health_check: true,
                    rollback_on_failure: true
                }
            },
            {
                id: 'validate_code',
                name: 'Validate Code Quality',
                type: 'validation',
                agent: 'aider',
                dependencies: ['deploy_branch'],
                timeout: 180000,
                retry_count: 2,
                parallel: true,
                config: {
                    linting: true,
                    type_checking: true,
                    security_scan: true,
                    performance_check: true
                }
            },
            {
                id: 'run_tests',
                name: 'Execute Test Suite',
                type: 'testing',
                agent: 'claude-code',
                dependencies: ['deploy_branch'],
                timeout: 600000,
                retry_count: 1,
                parallel: true,
                config: {
                    test_types: ['unit', 'integration', 'e2e'],
                    coverage_threshold: 80,
                    parallel_execution: true
                }
            },
            {
                id: 'security_audit',
                name: 'Security Audit',
                type: 'security',
                agent: 'goose',
                dependencies: ['validate_code', 'run_tests'],
                timeout: 240000,
                retry_count: 2,
                parallel: false,
                config: {
                    vulnerability_scan: true,
                    dependency_check: true,
                    compliance_check: true
                }
            }
        ],
        error_handling: {
            strategy: 'retry_with_fallback',
            max_retries: 3,
            fallback_agents: ['goose', 'aider'],
            escalation_policy: 'notify_admin',
            recovery_actions: ['rollback', 'retry', 'skip']
        },
        notifications: {
            on_start: true,
            on_complete: true,
            on_failure: true,
            channels: ['slack', 'email', 'webhook']
        },
        resource_limits: {
            max_concurrent_steps: 5,
            memory_limit: '2GB',
            cpu_limit: '2 cores',
            disk_space: '10GB'
        }
    },

    'hotfix_deployment': {
        id: 'hotfix_deployment',
        name: 'Hotfix Deployment Workflow',
        description: 'Fast-track deployment for critical fixes',
        version: '1.0.0',
        steps: [
            {
                id: 'validate_hotfix',
                name: 'Validate Hotfix',
                type: 'validation',
                agent: 'claude-code',
                dependencies: [],
                timeout: 30000,
                retry_count: 1,
                parallel: false,
                config: {
                    quick_validation: true,
                    security_check: true
                }
            },
            {
                id: 'emergency_tests',
                name: 'Emergency Test Suite',
                type: 'testing',
                agent: 'aider',
                dependencies: ['validate_hotfix'],
                timeout: 120000,
                retry_count: 1,
                parallel: false,
                config: {
                    test_types: ['critical', 'smoke'],
                    fast_execution: true
                }
            },
            {
                id: 'deploy_production',
                name: 'Deploy to Production',
                type: 'deployment',
                agent: 'claude-code',
                dependencies: ['emergency_tests'],
                timeout: 180000,
                retry_count: 2,
                parallel: false,
                config: {
                    environment: 'production',
                    canary_deployment: true,
                    immediate_rollback: true
                }
            }
        ],
        error_handling: {
            strategy: 'immediate_escalation',
            max_retries: 1,
            fallback_agents: ['goose'],
            escalation_policy: 'immediate_admin_notify',
            recovery_actions: ['immediate_rollback']
        },
        notifications: {
            on_start: true,
            on_complete: true,
            on_failure: true,
            channels: ['slack', 'sms', 'webhook'],
            priority: 'critical'
        },
        resource_limits: {
            max_concurrent_steps: 1,
            memory_limit: '1GB',
            cpu_limit: '1 core',
            disk_space: '5GB'
        }
    },

    'feature_integration': {
        id: 'feature_integration',
        name: 'Feature Integration Workflow',
        description: 'Comprehensive feature integration and testing',
        version: '1.0.0',
        steps: [
            {
                id: 'feature_analysis',
                name: 'Analyze Feature Impact',
                type: 'analysis',
                agent: 'codegen',
                dependencies: [],
                timeout: 90000,
                retry_count: 2,
                parallel: false,
                config: {
                    impact_analysis: true,
                    dependency_mapping: true,
                    risk_assessment: true
                }
            },
            {
                id: 'integration_tests',
                name: 'Integration Testing',
                type: 'testing',
                agent: 'claude-code',
                dependencies: ['feature_analysis'],
                timeout: 480000,
                retry_count: 2,
                parallel: false,
                config: {
                    test_types: ['integration', 'regression', 'performance'],
                    comprehensive_coverage: true
                }
            },
            {
                id: 'compatibility_check',
                name: 'Compatibility Verification',
                type: 'validation',
                agent: 'aider',
                dependencies: ['feature_analysis'],
                timeout: 240000,
                retry_count: 2,
                parallel: true,
                config: {
                    browser_compatibility: true,
                    api_compatibility: true,
                    backward_compatibility: true
                }
            },
            {
                id: 'performance_benchmark',
                name: 'Performance Benchmarking',
                type: 'performance',
                agent: 'goose',
                dependencies: ['integration_tests', 'compatibility_check'],
                timeout: 360000,
                retry_count: 1,
                parallel: false,
                config: {
                    load_testing: true,
                    stress_testing: true,
                    memory_profiling: true
                }
            }
        ],
        error_handling: {
            strategy: 'retry_with_analysis',
            max_retries: 2,
            fallback_agents: ['aider', 'goose'],
            escalation_policy: 'team_notify',
            recovery_actions: ['retry', 'skip_non_critical']
        },
        notifications: {
            on_start: false,
            on_complete: true,
            on_failure: true,
            channels: ['slack', 'email']
        },
        resource_limits: {
            max_concurrent_steps: 3,
            memory_limit: '4GB',
            cpu_limit: '4 cores',
            disk_space: '20GB'
        }
    }
};

/**
 * Workflow step types and their configurations
 */
export const STEP_TYPES = {
    'analysis': {
        default_timeout: 60000,
        default_retry_count: 2,
        resource_requirements: { memory: '512MB', cpu: '0.5 cores' }
    },
    'generation': {
        default_timeout: 120000,
        default_retry_count: 2,
        resource_requirements: { memory: '1GB', cpu: '1 core' }
    },
    'deployment': {
        default_timeout: 300000,
        default_retry_count: 3,
        resource_requirements: { memory: '1GB', cpu: '1 core' }
    },
    'validation': {
        default_timeout: 180000,
        default_retry_count: 2,
        resource_requirements: { memory: '512MB', cpu: '0.5 cores' }
    },
    'testing': {
        default_timeout: 600000,
        default_retry_count: 1,
        resource_requirements: { memory: '2GB', cpu: '2 cores' }
    },
    'security': {
        default_timeout: 240000,
        default_retry_count: 2,
        resource_requirements: { memory: '1GB', cpu: '1 core' }
    },
    'performance': {
        default_timeout: 360000,
        default_retry_count: 1,
        resource_requirements: { memory: '2GB', cpu: '2 cores' }
    }
};

/**
 * Available agents and their capabilities
 */
export const AGENT_CAPABILITIES = {
    'claude-code': {
        types: ['analysis', 'deployment', 'testing', 'validation'],
        max_concurrent: 3,
        reliability_score: 0.95
    },
    'codegen': {
        types: ['generation', 'analysis', 'validation'],
        max_concurrent: 5,
        reliability_score: 0.92
    },
    'aider': {
        types: ['validation', 'testing', 'security'],
        max_concurrent: 2,
        reliability_score: 0.88
    },
    'goose': {
        types: ['security', 'performance', 'validation'],
        max_concurrent: 2,
        reliability_score: 0.85
    }
};

/**
 * Validates a workflow definition
 * @param {Object} workflow - The workflow definition to validate
 * @returns {Object} Validation result with errors if any
 */
export function validateWorkflowDefinition(workflow) {
    const errors = [];
    
    // Required fields validation
    if (!workflow.id) errors.push('Workflow ID is required');
    if (!workflow.name) errors.push('Workflow name is required');
    if (!workflow.steps || !Array.isArray(workflow.steps)) {
        errors.push('Workflow steps must be an array');
    }
    
    // Steps validation
    if (workflow.steps) {
        const stepIds = new Set();
        workflow.steps.forEach((step, index) => {
            if (!step.id) errors.push(`Step ${index} missing ID`);
            if (stepIds.has(step.id)) errors.push(`Duplicate step ID: ${step.id}`);
            stepIds.add(step.id);
            
            if (!step.agent) errors.push(`Step ${step.id} missing agent`);
            if (!step.type) errors.push(`Step ${step.id} missing type`);
            
            // Validate dependencies exist
            if (step.dependencies) {
                step.dependencies.forEach(dep => {
                    if (!stepIds.has(dep) && !workflow.steps.some(s => s.id === dep)) {
                        errors.push(`Step ${step.id} has invalid dependency: ${dep}`);
                    }
                });
            }
            
            // Validate agent capabilities
            const agent = AGENT_CAPABILITIES[step.agent];
            if (agent && !agent.types.includes(step.type)) {
                errors.push(`Agent ${step.agent} cannot handle step type ${step.type}`);
            }
        });
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Gets a workflow definition by ID
 * @param {string} workflowId - The workflow ID
 * @returns {Object|null} The workflow definition or null if not found
 */
export function getWorkflowDefinition(workflowId) {
    return WORKFLOW_DEFINITIONS[workflowId] || null;
}

/**
 * Lists all available workflow definitions
 * @returns {Array} Array of workflow definitions
 */
export function listWorkflowDefinitions() {
    return Object.values(WORKFLOW_DEFINITIONS);
}

