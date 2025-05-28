/**
 * Initial Data Seeding
 * Populates the database with essential system data
 */

export async function seed(knex) {
    // Clear existing data (in reverse order of dependencies)
    await knex('system_metrics').del();
    await knex('task_executions').del();
    await knex('workflow_executions').del();
    await knex('logs').del();
    await knex('tasks').del();
    await knex('workflows').del();
    await knex('components').del();
    await knex('configurations').del();
    await knex('users').del();

    // Insert default system user
    const [systemUser] = await knex('users').insert([
        {
            id: knex.raw('uuid_generate_v4()'),
            email: 'system@claude-task-master.ai',
            username: 'system',
            full_name: 'System User',
            role: 'admin',
            is_active: true,
            permissions: JSON.stringify({
                'system:admin': true,
                'workflows:manage': true,
                'tasks:manage': true,
                'components:manage': true,
                'users:manage': true
            }),
            preferences: JSON.stringify({
                'notifications:enabled': true,
                'theme': 'dark',
                'timezone': 'UTC'
            })
        }
    ]).returning('*');

    // Insert default admin user
    const [adminUser] = await knex('users').insert([
        {
            id: knex.raw('uuid_generate_v4()'),
            email: 'admin@claude-task-master.ai',
            username: 'admin',
            full_name: 'Administrator',
            role: 'admin',
            is_active: true,
            permissions: JSON.stringify({
                'workflows:manage': true,
                'tasks:manage': true,
                'components:view': true,
                'users:view': true
            }),
            preferences: JSON.stringify({
                'notifications:enabled': true,
                'theme': 'light',
                'timezone': 'UTC'
            })
        }
    ]).returning('*');

    // Insert system configurations
    await knex('configurations').insert([
        {
            key: 'system.version',
            value: JSON.stringify('1.0.0'),
            type: 'system',
            description: 'System version',
            is_readonly: true,
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'system.environment',
            value: JSON.stringify('development'),
            type: 'system',
            description: 'System environment',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'database.max_connections',
            value: JSON.stringify(100),
            type: 'system',
            description: 'Maximum database connections',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'monitoring.enabled',
            value: JSON.stringify(true),
            type: 'system',
            description: 'Enable system monitoring',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'logging.level',
            value: JSON.stringify('info'),
            type: 'system',
            description: 'Default logging level',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'backup.enabled',
            value: JSON.stringify(true),
            type: 'system',
            description: 'Enable automated backups',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'backup.retention_days',
            value: JSON.stringify(30),
            type: 'system',
            description: 'Backup retention period in days',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'metrics.retention_days',
            value: JSON.stringify(30),
            type: 'system',
            description: 'Metrics retention period in days',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'logs.retention_days',
            value: JSON.stringify(30),
            type: 'system',
            description: 'Logs retention period in days',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'workflow.default_timeout',
            value: JSON.stringify(3600),
            type: 'system',
            description: 'Default workflow timeout in seconds',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'task.default_timeout',
            value: JSON.stringify(1800),
            type: 'system',
            description: 'Default task timeout in seconds',
            scope: 'global',
            created_by: systemUser.id
        },
        {
            key: 'task.max_retries',
            value: JSON.stringify(3),
            type: 'system',
            description: 'Maximum task retry attempts',
            scope: 'global',
            created_by: systemUser.id
        }
    ]);

    // Insert system components
    await knex('components').insert([
        {
            name: 'system-orchestrator',
            type: 'orchestrator',
            status: 'active',
            version: '1.0.0',
            description: 'Central coordination hub managing all workflows',
            configuration: JSON.stringify({
                'max_concurrent_workflows': 10,
                'health_check_interval': 30000,
                'retry_failed_tasks': true
            }),
            endpoints: JSON.stringify({
                'health': '/health',
                'metrics': '/metrics',
                'api': '/api/v1'
            }),
            health_status: 'healthy',
            dependencies: [],
            dependent_components: ['database', 'monitoring', 'codegen_sdk']
        },
        {
            name: 'database-manager',
            type: 'database',
            status: 'active',
            version: '1.0.0',
            description: 'PostgreSQL database management and connection pooling',
            configuration: JSON.stringify({
                'pool_size': 20,
                'connection_timeout': 10000,
                'query_timeout': 30000
            }),
            endpoints: JSON.stringify({
                'health': '/db/health',
                'metrics': '/db/metrics'
            }),
            health_status: 'healthy',
            dependencies: [],
            dependent_components: ['orchestrator', 'monitoring']
        },
        {
            name: 'monitoring-system',
            type: 'monitoring',
            status: 'active',
            version: '1.0.0',
            description: 'Real-time system health and performance monitoring',
            configuration: JSON.stringify({
                'metrics_interval': 15000,
                'alert_thresholds': {
                    'cpu_usage': 80,
                    'memory_usage': 85,
                    'disk_usage': 90
                }
            }),
            endpoints: JSON.stringify({
                'health': '/monitoring/health',
                'metrics': '/monitoring/metrics',
                'alerts': '/monitoring/alerts'
            }),
            health_status: 'healthy',
            dependencies: ['database'],
            dependent_components: []
        },
        {
            name: 'codegen-sdk',
            type: 'codegen_sdk',
            status: 'inactive',
            version: '1.0.0',
            description: 'Codegen SDK integration for PR creation and management',
            configuration: JSON.stringify({
                'api_endpoint': 'https://api.codegen.sh',
                'timeout': 30000,
                'retry_attempts': 3
            }),
            endpoints: JSON.stringify({
                'health': '/codegen/health',
                'api': '/codegen/api'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator'],
            dependent_components: []
        },
        {
            name: 'claude-code',
            type: 'claude_code',
            status: 'inactive',
            version: '1.0.0',
            description: 'Claude Code integration for PR validation and debugging',
            configuration: JSON.stringify({
                'cli_path': '/usr/local/bin/claude-code',
                'timeout': 60000,
                'max_file_size': 1048576
            }),
            endpoints: JSON.stringify({
                'health': '/claude-code/health'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator'],
            dependent_components: []
        },
        {
            name: 'agent-api',
            type: 'agent_api',
            status: 'inactive',
            version: '1.0.0',
            description: 'AgentAPI middleware for communication bridge',
            configuration: JSON.stringify({
                'port': 8080,
                'timeout': 30000,
                'max_requests_per_minute': 100
            }),
            endpoints: JSON.stringify({
                'health': '/agent-api/health',
                'api': '/agent-api/v1'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator', 'claude-code'],
            dependent_components: []
        },
        {
            name: 'linear-integration',
            type: 'linear',
            status: 'inactive',
            version: '1.0.0',
            description: 'Linear integration for issue management and status updates',
            configuration: JSON.stringify({
                'api_endpoint': 'https://api.linear.app',
                'webhook_url': '/webhooks/linear',
                'sync_interval': 300000
            }),
            endpoints: JSON.stringify({
                'health': '/linear/health',
                'webhook': '/linear/webhook'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator'],
            dependent_components: []
        },
        {
            name: 'wsl2-deployment',
            type: 'wsl2',
            status: 'inactive',
            version: '1.0.0',
            description: 'WSL2 deployment pipeline for automated PR validation',
            configuration: JSON.stringify({
                'wsl_distro': 'Ubuntu-20.04',
                'timeout': 1800000,
                'max_concurrent_deployments': 3
            }),
            endpoints: JSON.stringify({
                'health': '/wsl2/health',
                'deploy': '/wsl2/deploy'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator', 'codegen-sdk'],
            dependent_components: []
        },
        {
            name: 'nlp-processor',
            type: 'nlp',
            status: 'inactive',
            version: '1.0.0',
            description: 'Natural language processing pipeline for task-to-PR conversion',
            configuration: JSON.stringify({
                'model': 'claude-3-sonnet',
                'max_tokens': 4096,
                'temperature': 0.1
            }),
            endpoints: JSON.stringify({
                'health': '/nlp/health',
                'process': '/nlp/process'
            }),
            health_status: 'unknown',
            dependencies: ['orchestrator'],
            dependent_components: ['codegen-sdk']
        }
    ]);

    // Insert sample workflow
    const [sampleWorkflow] = await knex('workflows').insert([
        {
            id: knex.raw('uuid_generate_v4()'),
            name: 'Sample CI/CD Workflow',
            description: 'A sample workflow demonstrating the unified AI CI/CD system capabilities',
            type: 'ci_cd',
            status: 'draft',
            priority: 5,
            definition: JSON.stringify({
                'trigger': 'manual',
                'stages': ['validation', 'testing', 'deployment'],
                'notifications': ['email', 'slack']
            }),
            configuration: JSON.stringify({
                'parallel_execution': true,
                'fail_fast': false,
                'timeout_strategy': 'graceful'
            }),
            environment_variables: JSON.stringify({
                'NODE_ENV': 'production',
                'LOG_LEVEL': 'info'
            }),
            tags: ['sample', 'ci-cd', 'demo'],
            metadata: JSON.stringify({
                'created_for': 'demonstration',
                'complexity': 'medium'
            }),
            created_by: adminUser.id,
            timeout_seconds: 7200
        }
    ]).returning('*');

    // Insert sample tasks for the workflow
    await knex('tasks').insert([
        {
            id: knex.raw('uuid_generate_v4()'),
            workflow_id: sampleWorkflow.id,
            name: 'Code Validation',
            description: 'Validate code quality and syntax',
            type: 'validation',
            status: 'pending',
            priority: 8,
            command: 'npm run lint && npm run type-check',
            parameters: JSON.stringify({
                'lint_config': '.eslintrc.js',
                'typescript_config': 'tsconfig.json'
            }),
            environment: JSON.stringify({
                'NODE_ENV': 'test'
            }),
            working_directory: '/workspace',
            depends_on: [],
            execution_order: 1,
            max_retries: 2,
            estimated_duration_seconds: 120,
            timeout_seconds: 300,
            tags: ['validation', 'lint', 'typescript'],
            metadata: JSON.stringify({
                'stage': 'validation',
                'critical': true
            }),
            created_by: adminUser.id
        },
        {
            id: knex.raw('uuid_generate_v4()'),
            workflow_id: sampleWorkflow.id,
            name: 'Unit Tests',
            description: 'Run unit tests and generate coverage report',
            type: 'testing',
            status: 'pending',
            priority: 7,
            command: 'npm test -- --coverage',
            parameters: JSON.stringify({
                'test_pattern': '**/*.test.js',
                'coverage_threshold': 80
            }),
            environment: JSON.stringify({
                'NODE_ENV': 'test',
                'CI': 'true'
            }),
            working_directory: '/workspace',
            depends_on: [], // Will be updated with the validation task ID
            execution_order: 2,
            max_retries: 1,
            estimated_duration_seconds: 300,
            timeout_seconds: 600,
            tags: ['testing', 'unit-tests', 'coverage'],
            metadata: JSON.stringify({
                'stage': 'testing',
                'coverage_required': true
            }),
            created_by: adminUser.id
        },
        {
            id: knex.raw('uuid_generate_v4()'),
            workflow_id: sampleWorkflow.id,
            name: 'Build Application',
            description: 'Build the application for production',
            type: 'deployment',
            status: 'pending',
            priority: 6,
            command: 'npm run build',
            parameters: JSON.stringify({
                'build_mode': 'production',
                'optimization': true
            }),
            environment: JSON.stringify({
                'NODE_ENV': 'production'
            }),
            working_directory: '/workspace',
            depends_on: [], // Will be updated with the test task ID
            execution_order: 3,
            max_retries: 2,
            estimated_duration_seconds: 180,
            timeout_seconds: 900,
            tags: ['build', 'production', 'deployment'],
            metadata: JSON.stringify({
                'stage': 'deployment',
                'artifact_required': true
            }),
            created_by: adminUser.id
        }
    ]);

    // Insert initial system logs
    await knex('logs').insert([
        {
            level: 'info',
            message: 'Database schema initialized successfully',
            component_name: 'database-manager',
            data: JSON.stringify({
                'tables_created': 9,
                'indexes_created': 25,
                'functions_created': 3
            }),
            timestamp: knex.fn.now()
        },
        {
            level: 'info',
            message: 'System components registered',
            component_name: 'system-orchestrator',
            data: JSON.stringify({
                'components_count': 9,
                'active_components': 3
            }),
            timestamp: knex.fn.now()
        },
        {
            level: 'info',
            message: 'Initial data seeding completed',
            component_name: 'database-manager',
            data: JSON.stringify({
                'users_created': 2,
                'configurations_created': 12,
                'components_created': 9,
                'workflows_created': 1,
                'tasks_created': 3
            }),
            timestamp: knex.fn.now()
        }
    ]);

    console.log('Initial data seeding completed successfully');
}

