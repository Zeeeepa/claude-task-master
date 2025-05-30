-- =====================================================
-- Seed Data: Initial System Components
-- Registers core system components for the orchestration system
-- =====================================================

-- Insert core system components
INSERT INTO components (name, type, version, api_endpoint, status, configuration, capabilities) VALUES
(
    'openevolve-orchestrator',
    'orchestrator',
    '1.0.0',
    'http://localhost:3001/api',
    'active',
    '{"max_concurrent_workflows": 10, "timeout_seconds": 300, "retry_attempts": 3}',
    '["workflow_orchestration", "task_coordination", "component_management", "event_processing"]'
),
(
    'codegen-generator',
    'generator',
    '1.0.0',
    'http://localhost:3002/api',
    'active',
    '{"supported_languages": ["javascript", "python", "typescript"], "max_file_size": "10MB", "template_cache_size": 100}',
    '["code_generation", "template_processing", "file_creation", "syntax_validation"]'
),
(
    'claude-code-validator',
    'validator',
    '1.0.0',
    'http://localhost:3003/api',
    'active',
    '{"validation_rules": ["syntax", "security", "performance"], "max_validation_time": 60}',
    '["code_validation", "security_scanning", "performance_analysis", "quality_assessment"]'
),
(
    'linear-task-manager',
    'manager',
    '1.0.0',
    'https://api.linear.app/graphql',
    'active',
    '{"api_version": "2023-01-01", "rate_limit": 1000, "batch_size": 50}',
    '["task_management", "issue_tracking", "project_coordination", "status_updates"]'
),
(
    'github-integration',
    'manager',
    '1.0.0',
    'https://api.github.com',
    'active',
    '{"api_version": "2022-11-28", "webhook_secret": "[REDACTED]", "max_pr_size": "100MB"}',
    '["repository_management", "pr_creation", "code_review", "branch_management"]'
),
(
    'performance-analyzer',
    'analyzer',
    '1.0.0',
    'http://localhost:3004/api',
    'active',
    '{"metrics_retention_days": 30, "alert_thresholds": {"cpu": 80, "memory": 85, "error_rate": 5}}',
    '["performance_monitoring", "metrics_collection", "anomaly_detection", "alerting"]'
),
(
    'deployment-engine',
    'deployer',
    '1.0.0',
    'http://localhost:3005/api',
    'active',
    '{"supported_platforms": ["docker", "kubernetes", "serverless"], "max_deployment_time": 600}',
    '["application_deployment", "infrastructure_management", "rollback_support", "health_monitoring"]'
);

-- Insert initial system health records
INSERT INTO system_health (component_name, status, cpu_usage, memory_usage, disk_usage, response_time_ms, error_rate, details) VALUES
('openevolve-orchestrator', 'healthy', 15.5, 32.1, 45.0, 120, 0.1, '{"last_restart": "2024-01-01T00:00:00Z", "uptime_hours": 168}'),
('codegen-generator', 'healthy', 25.3, 28.7, 52.3, 95, 0.2, '{"cache_hit_rate": 85.5, "templates_loaded": 45}'),
('claude-code-validator', 'healthy', 18.9, 41.2, 38.7, 150, 0.05, '{"validations_per_hour": 120, "average_validation_time": 2.3}'),
('linear-task-manager', 'healthy', 8.2, 15.6, 25.1, 200, 0.0, '{"api_calls_remaining": 950, "sync_status": "up_to_date"}'),
('github-integration', 'healthy', 12.1, 22.4, 31.8, 180, 0.1, '{"webhook_queue_size": 0, "rate_limit_remaining": 4800}'),
('performance-analyzer', 'healthy', 22.7, 35.9, 48.2, 75, 0.0, '{"metrics_processed_per_minute": 1500, "storage_usage": "2.1GB"}'),
('deployment-engine', 'healthy', 19.4, 29.8, 42.6, 300, 0.3, '{"active_deployments": 3, "success_rate": 98.7}');

-- Insert sample performance metrics
INSERT INTO performance_metrics (component_name, metric_name, metric_value, metric_unit, metric_type, tags) VALUES
('openevolve-orchestrator', 'workflows_processed', 1250, 'count', 'counter', '{"period": "daily"}'),
('openevolve-orchestrator', 'average_workflow_duration', 45.5, 'minutes', 'gauge', '{"period": "hourly"}'),
('openevolve-orchestrator', 'concurrent_workflows', 7, 'count', 'gauge', '{"current": true}'),
('codegen-generator', 'files_generated', 890, 'count', 'counter', '{"period": "daily"}'),
('codegen-generator', 'generation_success_rate', 97.8, 'percentage', 'gauge', '{"period": "hourly"}'),
('codegen-generator', 'average_generation_time', 3.2, 'seconds', 'gauge', '{"period": "hourly"}'),
('claude-code-validator', 'validations_completed', 2100, 'count', 'counter', '{"period": "daily"}'),
('claude-code-validator', 'validation_success_rate', 94.5, 'percentage', 'gauge', '{"period": "hourly"}'),
('claude-code-validator', 'critical_issues_found', 12, 'count', 'counter', '{"severity": "critical"}'),
('linear-task-manager', 'tasks_synchronized', 450, 'count', 'counter', '{"period": "daily"}'),
('linear-task-manager', 'sync_latency', 2.1, 'seconds', 'gauge', '{"period": "hourly"}'),
('github-integration', 'prs_created', 78, 'count', 'counter', '{"period": "daily"}'),
('github-integration', 'pr_merge_rate', 89.2, 'percentage', 'gauge', '{"period": "daily"}'),
('performance-analyzer', 'alerts_generated', 5, 'count', 'counter', '{"period": "daily"}'),
('deployment-engine', 'deployments_completed', 23, 'count', 'counter', '{"period": "daily"}'),
('deployment-engine', 'deployment_success_rate', 95.7, 'percentage', 'gauge', '{"period": "daily"}');

-- Insert sample templates
INSERT INTO templates (name, type, category, description, template_content, tags, version, created_by) VALUES
(
    'javascript-module-template',
    'code_pattern',
    'javascript',
    'Standard JavaScript module template with ES6 imports/exports',
    '{
        "structure": {
            "imports": "// Import statements",
            "constants": "// Constants and configuration",
            "functions": "// Main functions",
            "exports": "// Export statements"
        },
        "patterns": {
            "function_declaration": "function ${name}(${params}) {\n    ${body}\n}",
            "arrow_function": "const ${name} = (${params}) => {\n    ${body}\n};",
            "export_default": "export default ${name};",
            "export_named": "export { ${names} };"
        }
    }',
    '["javascript", "es6", "module", "template"]',
    '1.0.0',
    'system'
),
(
    'rest-api-endpoint',
    'code_pattern',
    'api',
    'RESTful API endpoint template with error handling',
    '{
        "structure": {
            "route_definition": "app.${method}(\"${path}\", ${middleware}, ${handler})",
            "handler_function": "async (req, res) => {\n    try {\n        ${logic}\n        res.json(${response});\n    } catch (error) {\n        res.status(500).json({ error: error.message });\n    }\n}",
            "validation": "const { error, value } = ${schema}.validate(req.body);",
            "response_format": "{ success: true, data: ${data}, message: \"${message}\" }"
        }
    }',
    '["api", "rest", "express", "error-handling"]',
    '1.0.0',
    'system'
),
(
    'database-migration',
    'deployment_script',
    'database',
    'Database migration script template',
    '{
        "structure": {
            "up_migration": "-- Migration: ${name}\n-- Created: ${date}\n\n${up_sql}",
            "down_migration": "-- Rollback: ${name}\n\n${down_sql}",
            "validation": "-- Validation queries\n${validation_sql}"
        },
        "patterns": {
            "create_table": "CREATE TABLE ${table_name} (\n    ${columns}\n);",
            "add_column": "ALTER TABLE ${table_name} ADD COLUMN ${column_definition};",
            "create_index": "CREATE INDEX ${index_name} ON ${table_name}(${columns});"
        }
    }',
    '["database", "migration", "sql", "schema"]',
    '1.0.0',
    'system'
),
(
    'unit-test-template',
    'test_template',
    'testing',
    'Unit test template with setup and teardown',
    '{
        "structure": {
            "test_suite": "describe(\"${suite_name}\", () => {\n    ${setup}\n    ${tests}\n    ${teardown}\n});",
            "test_case": "it(\"${description}\", async () => {\n    ${arrange}\n    ${act}\n    ${assert}\n});",
            "setup": "beforeEach(() => {\n    ${setup_code}\n});",
            "teardown": "afterEach(() => {\n    ${cleanup_code}\n});"
        },
        "assertions": {
            "expect_equal": "expect(${actual}).toBe(${expected});",
            "expect_truthy": "expect(${value}).toBeTruthy();",
            "expect_error": "expect(() => ${code}).toThrow(${error});"
        }
    }',
    '["testing", "unit-test", "jest", "mocha"]',
    '1.0.0',
    'system'
),
(
    'docker-deployment',
    'deployment_script',
    'containerization',
    'Docker deployment configuration template',
    '{
        "dockerfile": {
            "base_image": "FROM ${base_image}:${tag}",
            "workdir": "WORKDIR ${app_dir}",
            "copy_files": "COPY ${source} ${destination}",
            "install_deps": "RUN ${install_command}",
            "expose_port": "EXPOSE ${port}",
            "start_command": "CMD [\"${command}\", \"${args}\"]"
        },
        "docker_compose": {
            "version": "version: \"3.8\"",
            "services": "services:\n  ${service_name}:\n    ${config}",
            "networks": "networks:\n  ${network_name}:\n    ${network_config}",
            "volumes": "volumes:\n  ${volume_name}:\n    ${volume_config}"
        }
    }',
    '["docker", "deployment", "containerization", "devops"]',
    '1.0.0',
    'system'
);

-- Insert sample knowledge base entries
INSERT INTO knowledge_base (title, content, content_type, category, tags, source_type, relevance_score, created_by) VALUES
(
    'System Architecture Overview',
    '# Unified CI/CD Orchestration System Architecture

## Core Components

### 1. OpenEvolve Orchestrator
- Central coordination hub
- Workflow management
- Component communication
- Event processing

### 2. Codegen Generator
- AI-powered code generation
- Template processing
- Multi-language support
- Quality validation

### 3. Claude Code Validator
- Code quality analysis
- Security scanning
- Performance optimization
- Best practices enforcement

### 4. Integration Layer
- Linear API integration
- GitHub API integration
- Webhook processing
- Real-time synchronization

## Data Flow

1. **Task Creation**: Tasks are created in Linear and synchronized to the database
2. **Workflow Orchestration**: OpenEvolve coordinates task execution across components
3. **Code Generation**: Codegen generates implementation based on requirements
4. **Validation**: Claude Code validates generated code for quality and security
5. **Deployment**: Automated deployment through GitHub integration
6. **Monitoring**: Continuous monitoring and performance tracking

## Key Features

- **Autonomous Operation**: Minimal human intervention required
- **Scalable Architecture**: Supports multiple concurrent workflows
- **Quality Assurance**: Multi-layer validation and testing
- **Real-time Monitoring**: Comprehensive performance tracking
- **Learning Capabilities**: Continuous improvement through pattern recognition',
    'markdown',
    'architecture',
    '["architecture", "system-design", "components", "workflow"]',
    'manual',
    9.5,
    'system'
),
(
    'Database Schema Guide',
    '# Database Schema Documentation

## Core Tables

### Projects
- Central project management
- Repository linking
- Configuration storage

### Workflows
- Task orchestration
- Progress tracking
- Phase management

### Tasks
- Individual work items
- Dependency management
- Status tracking

### Components
- System component registry
- Health monitoring
- Configuration management

## Performance Considerations

### Indexing Strategy
- Composite indexes for common queries
- GIN indexes for JSON fields
- Time-series optimization for metrics

### Partitioning
- Execution history partitioned by date
- Performance metrics partitioned by component

### Monitoring
- Real-time health checks
- Performance metrics collection
- Automated alerting

## Best Practices

1. **Use UUIDs** for all primary keys
2. **JSONB fields** for flexible metadata
3. **Proper constraints** for data integrity
4. **Regular maintenance** for optimal performance',
    'markdown',
    'database',
    '["database", "schema", "postgresql", "performance"]',
    'manual',
    8.5,
    'system'
),
(
    'API Integration Patterns',
    '# API Integration Best Practices

## Authentication
- Use API keys for service-to-service communication
- Implement OAuth 2.0 for user authentication
- Rotate keys regularly for security

## Error Handling
- Implement exponential backoff for retries
- Log all API errors with context
- Provide meaningful error messages

## Rate Limiting
- Respect API rate limits
- Implement client-side throttling
- Use queuing for high-volume operations

## Data Synchronization
- Use webhooks for real-time updates
- Implement polling fallback for reliability
- Handle duplicate events gracefully

## Monitoring
- Track API response times
- Monitor error rates
- Set up alerts for failures

## Example Implementation

```javascript
class APIClient {
    async makeRequest(endpoint, options = {}) {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                const response = await fetch(endpoint, {
                    ...options,
                    headers: {
                        \"Authorization\": `Bearer ${this.apiKey}`,
                        \"Content-Type\": \"application/json\",
                        ...options.headers
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) throw error;
                await this.delay(Math.pow(2, attempt) * 1000);
            }
        }
    }
}
```',
    'markdown',
    'integration',
    '["api", "integration", "best-practices", "error-handling"]',
    'manual',
    8.0,
    'system'
);

-- Record seed data application
INSERT INTO schema_migrations (version, description) 
VALUES ('seed_001', 'Initial component and template seed data')
ON CONFLICT (version) DO NOTHING;

