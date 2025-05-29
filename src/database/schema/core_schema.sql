-- Consolidated Database Schema for AI CI/CD System
-- Consolidates functionality from PRs #41,42,53,59,62,64,65,69,70,74,79,81
-- Version: 2.0.0
-- Created: 2025-05-29

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Core Tables

-- Tasks table - Main task management
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    complexity_score INTEGER DEFAULT 5,
    affected_files JSONB DEFAULT '[]'::jsonb,
    requirements JSONB DEFAULT '{}'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    assigned_to VARCHAR(255),
    tags JSONB DEFAULT '[]'::jsonb,
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- External integration fields
    linear_issue_id VARCHAR(255),
    github_issue_number INTEGER,
    codegen_session_id VARCHAR(255),
    repository_url VARCHAR(500),
    branch_name VARCHAR(255),
    pr_number INTEGER,
    
    -- Constraints
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    CONSTRAINT tasks_priority_check CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT tasks_complexity_check CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CONSTRAINT tasks_title_check CHECK (length(title) > 0)
);

-- Task executions table - Track task execution with agents
CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL,
    agent_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    logs JSONB DEFAULT '[]'::jsonb,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Performance tracking
    execution_duration_ms INTEGER,
    memory_usage_mb INTEGER,
    cpu_usage_percent DECIMAL(5,2),
    
    -- Constraints
    CONSTRAINT task_executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT task_executions_agent_type_check CHECK (agent_type IN ('claude-code', 'codegen', 'webhook-handler', 'validation-engine', 'agentapi'))
);

-- Task contexts table - Store contextual information
CREATE TABLE IF NOT EXISTS task_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_contexts_type_check CHECK (context_type IN (
        'requirement', 'codebase', 'ai_interaction', 'validation', 'workflow',
        'status_change', 'completion', 'dependency_parent', 'dependency_child',
        'error', 'performance'
    ))
);

-- Deployment scripts table - CI/CD deployment management
CREATE TABLE IF NOT EXISTS deployment_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    script_name VARCHAR(255) NOT NULL,
    script_type VARCHAR(50) NOT NULL,
    script_content TEXT NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'development',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    parameters JSONB DEFAULT '{}'::jsonb,
    execution_order INTEGER DEFAULT 0,
    timeout_seconds INTEGER DEFAULT 300,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_duration_ms INTEGER,
    exit_code INTEGER,
    stdout_log TEXT,
    stderr_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT deployment_scripts_type_check CHECK (script_type IN ('build', 'test', 'deploy', 'rollback', 'migration', 'validation', 'cleanup')),
    CONSTRAINT deployment_scripts_env_check CHECK (environment IN ('development', 'staging', 'production', 'test')),
    CONSTRAINT deployment_scripts_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- Error logs table - Comprehensive error tracking
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    task_execution_id UUID REFERENCES task_executions(id) ON DELETE SET NULL,
    deployment_script_id UUID REFERENCES deployment_scripts(id) ON DELETE SET NULL,
    error_type VARCHAR(50) NOT NULL,
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}'::jsonb,
    stack_trace TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    source_component VARCHAR(100),
    source_file VARCHAR(255),
    source_line INTEGER,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT error_logs_type_check CHECK (error_type IN (
        'validation', 'compilation', 'runtime', 'network', 'database',
        'authentication', 'authorization', 'timeout', 'resource', 'configuration'
    )),
    CONSTRAINT error_logs_severity_check CHECK (severity IN ('debug', 'info', 'warn', 'error', 'fatal'))
);

-- External integrations table - Manage external service connections
CREATE TABLE IF NOT EXISTS external_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_type VARCHAR(50) NOT NULL,
    integration_name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Health monitoring
    health_check_url VARCHAR(500),
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'unknown',
    
    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    current_usage INTEGER DEFAULT 0,
    usage_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 minute',
    
    -- Constraints
    CONSTRAINT external_integrations_type_check CHECK (integration_type IN ('codegen', 'github', 'linear', 'claude', 'agentapi', 'webhook')),
    CONSTRAINT external_integrations_status_check CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    CONSTRAINT external_integrations_health_check CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown'))
);

-- API access logs table - Security monitoring and access logging
CREATE TABLE IF NOT EXISTS api_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES external_integrations(id),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id VARCHAR(255),
    api_key_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    response_time_ms INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Request tracking
    correlation_id VARCHAR(255),
    task_id UUID REFERENCES tasks(id),
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Rate limiting info
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMP WITH TIME ZONE
);

-- System metrics table - Performance and health metrics
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    dimensions JSONB DEFAULT '{}'::jsonb,
    aggregation_period VARCHAR(20) DEFAULT 'instant',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT system_metrics_category_check CHECK (metric_category IN (
        'database', 'api', 'task_processing', 'deployment', 'error_rate',
        'performance', 'security', 'resource_usage'
    ))
);

-- Configuration settings table - Dynamic system configuration
CREATE TABLE IF NOT EXISTS configuration_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    is_sensitive BOOLEAN DEFAULT FALSE,
    environment VARCHAR(50) DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255),
    
    -- Constraints
    CONSTRAINT configuration_settings_type_check CHECK (setting_type IN ('string', 'number', 'boolean', 'object', 'array')),
    CONSTRAINT configuration_settings_env_check CHECK (environment IN ('all', 'development', 'staging', 'production', 'test'))
);

-- API keys table - API authentication management
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,
    allowed_ips JSONB DEFAULT '[]'::jsonb,
    allowed_endpoints JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Webhook events table - External system integration via webhooks
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_source VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    headers JSONB DEFAULT '{}'::jsonb,
    signature VARCHAR(255),
    signature_verified BOOLEAN DEFAULT FALSE,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_attempts INTEGER DEFAULT 0,
    max_processing_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    response_status INTEGER,
    response_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT webhook_events_type_check CHECK (event_type IN (
        'task_created', 'task_updated', 'task_completed', 'task_failed',
        'deployment_started', 'deployment_completed', 'deployment_failed',
        'pr_created', 'pr_updated', 'pr_merged', 'pr_closed',
        'build_started', 'build_completed', 'build_failed',
        'test_started', 'test_completed', 'test_failed'
    )),
    CONSTRAINT webhook_events_source_check CHECK (event_source IN ('github', 'linear', 'codegen', 'agentapi', 'claude', 'system'))
);

-- Audit logs table - Comprehensive audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT audit_logs_action_check CHECK (action IN ('create', 'update', 'delete', 'read', 'execute', 'login', 'logout'))
);

-- Schema migrations table - Track database migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by VARCHAR(255),
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_contexts_updated_at BEFORE UPDATE ON task_contexts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deployment_scripts_updated_at BEFORE UPDATE ON deployment_scripts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_external_integrations_updated_at BEFORE UPDATE ON external_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_configuration_settings_updated_at BEFORE UPDATE ON configuration_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, new_values, user_id)
        VALUES (TG_TABLE_NAME, NEW.id, 'create', to_jsonb(NEW), current_setting('app.current_user_id', true));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, old_values, new_values, user_id)
        VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), current_setting('app.current_user_id', true));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, old_values, user_id)
        VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), current_setting('app.current_user_id', true));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Apply audit triggers to key tables
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_task_executions AFTER INSERT OR UPDATE OR DELETE ON task_executions FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_external_integrations AFTER INSERT OR UPDATE OR DELETE ON external_integrations FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_api_keys AFTER INSERT OR UPDATE OR DELETE ON api_keys FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Insert initial configuration
INSERT INTO configuration_settings (setting_key, setting_value, setting_type, description) VALUES
('system.version', '"2.0.0"', 'string', 'Current system version'),
('database.schema_version', '"2.0.0"', 'string', 'Current database schema version'),
('features.cloudflare_enabled', 'true', 'boolean', 'Enable Cloudflare integration'),
('features.health_monitoring_enabled', 'true', 'boolean', 'Enable health monitoring'),
('features.audit_logging_enabled', 'true', 'boolean', 'Enable audit logging'),
('performance.query_timeout_ms', '30000', 'number', 'Default query timeout in milliseconds'),
('performance.connection_pool_max', '20', 'number', 'Maximum database connections'),
('security.rate_limit_enabled', 'true', 'boolean', 'Enable API rate limiting'),
('security.encryption_enabled', 'true', 'boolean', 'Enable data encryption')
ON CONFLICT (setting_key) DO NOTHING;

-- Record schema migration
INSERT INTO schema_migrations (version, name, checksum, applied_by, execution_time_ms) VALUES
('2.0.0', 'Consolidated Database Schema', 'consolidated-schema-v2', 'system', 0)
ON CONFLICT (version) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE tasks IS 'Main task management table storing all task information';
COMMENT ON TABLE task_executions IS 'Task execution tracking with agent information and logs';
COMMENT ON TABLE task_contexts IS 'Contextual information and metadata for tasks';
COMMENT ON TABLE deployment_scripts IS 'CI/CD deployment scripts and execution tracking';
COMMENT ON TABLE error_logs IS 'Comprehensive error tracking and resolution system';
COMMENT ON TABLE external_integrations IS 'External service integration management';
COMMENT ON TABLE api_access_logs IS 'Security monitoring and access logging';
COMMENT ON TABLE system_metrics IS 'System performance and health metrics';
COMMENT ON TABLE configuration_settings IS 'Dynamic system configuration management';
COMMENT ON TABLE api_keys IS 'API authentication and authorization management';
COMMENT ON TABLE webhook_events IS 'External system integration via webhooks';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all database changes';
COMMENT ON TABLE schema_migrations IS 'Database migration tracking and versioning';

