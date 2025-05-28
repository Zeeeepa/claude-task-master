-- Migration: 002_enhanced_cicd_schema.sql
-- Description: Enhanced schema for AI CI/CD operations with security and scalability improvements
-- Created: 2025-05-28
-- Version: 2.0.0

-- Enable additional extensions for enhanced functionality
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create deployment scripts table for CI/CD pipeline management
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
    CONSTRAINT deployment_scripts_type_check CHECK (script_type IN (
        'build', 'test', 'deploy', 'rollback', 'migration', 'validation', 'cleanup'
    )),
    CONSTRAINT deployment_scripts_environment_check CHECK (environment IN (
        'development', 'staging', 'production', 'testing'
    )),
    CONSTRAINT deployment_scripts_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled', 'skipped'
    )),
    CONSTRAINT deployment_scripts_retry_check CHECK (retry_count >= 0 AND retry_count <= max_retries),
    CONSTRAINT deployment_scripts_timeout_check CHECK (timeout_seconds > 0)
);

-- Create error logs table for comprehensive error tracking
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    deployment_script_id UUID REFERENCES deployment_scripts(id) ON DELETE SET NULL,
    workflow_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
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
    CONSTRAINT error_logs_severity_check CHECK (severity IN (
        'debug', 'info', 'warning', 'error', 'critical', 'fatal'
    ))
);

-- Create webhook events table for external integrations
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
    CONSTRAINT webhook_events_attempts_check CHECK (processing_attempts >= 0 AND processing_attempts <= max_processing_attempts)
);

-- Create API access logs table for security monitoring
CREATE TABLE IF NOT EXISTS api_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL,
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
    execution_time_ms INTEGER,
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT api_access_logs_method_check CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'))
);

-- Create API keys table for authentication
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
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT api_keys_rate_limits_check CHECK (rate_limit_per_hour > 0 AND rate_limit_per_day > 0)
);

-- Create system metrics table for enhanced monitoring
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
    )),
    CONSTRAINT system_metrics_aggregation_check CHECK (aggregation_period IN (
        'instant', '1min', '5min', '15min', '1hour', '1day'
    ))
);

-- Create configuration settings table for dynamic configuration
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
    CONSTRAINT configuration_settings_type_check CHECK (setting_type IN (
        'string', 'number', 'boolean', 'json', 'array', 'encrypted'
    )),
    CONSTRAINT configuration_settings_environment_check CHECK (environment IN (
        'all', 'development', 'staging', 'production', 'testing'
    ))
);

-- Enhanced indexes for new tables

-- Deployment scripts indexes
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_task_id ON deployment_scripts(task_id);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_status ON deployment_scripts(status);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_environment ON deployment_scripts(environment);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_type ON deployment_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_execution_order ON deployment_scripts(execution_order);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_created_at ON deployment_scripts(created_at);

-- Error logs indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_source_component ON error_logs(source_component);

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_task_id ON webhook_events(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(event_source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_next_retry ON webhook_events(next_retry_at);

-- API access logs indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_request_id ON api_access_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint ON api_access_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_user_id ON api_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_api_key_id ON api_access_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_ip_address ON api_access_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_created_at ON api_access_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_status ON api_access_logs(response_status);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);

-- System metrics indexes
CREATE INDEX IF NOT EXISTS idx_system_metrics_category_name ON system_metrics(metric_category, metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_aggregation ON system_metrics(aggregation_period);

-- Configuration settings indexes
CREATE INDEX IF NOT EXISTS idx_configuration_settings_environment ON configuration_settings(environment);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_type ON configuration_settings(setting_type);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_sensitive ON configuration_settings(is_sensitive);

-- Add triggers for automatic updated_at timestamps on new tables
CREATE TRIGGER update_deployment_scripts_updated_at 
    BEFORE UPDATE ON deployment_scripts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at 
    BEFORE UPDATE ON api_keys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuration_settings_updated_at 
    BEFORE UPDATE ON configuration_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add audit triggers for new tables
CREATE TRIGGER audit_deployment_scripts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON deployment_scripts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_error_logs_trigger
    AFTER INSERT OR UPDATE OR DELETE ON error_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_webhook_events_trigger
    AFTER INSERT OR UPDATE OR DELETE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_api_keys_trigger
    AFTER INSERT OR UPDATE OR DELETE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create materialized views for complex queries and performance optimization

-- Task dependency tree view for efficient dependency resolution
CREATE MATERIALIZED VIEW IF NOT EXISTS task_dependency_tree AS
WITH RECURSIVE dependency_tree AS (
    -- Base case: tasks with no dependencies
    SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        0 as depth,
        ARRAY[t.id] as path,
        t.id as root_task_id
    FROM tasks t
    WHERE NOT EXISTS (
        SELECT 1 FROM task_dependencies td 
        WHERE td.child_task_id = t.id AND td.dependency_type = 'depends_on'
    )
    
    UNION ALL
    
    -- Recursive case: tasks that depend on others
    SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        dt.depth + 1,
        dt.path || t.id,
        dt.root_task_id
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.child_task_id
    JOIN dependency_tree dt ON td.parent_task_id = dt.id
    WHERE td.dependency_type = 'depends_on'
    AND NOT t.id = ANY(dt.path) -- Prevent cycles
)
SELECT * FROM dependency_tree;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_dependency_tree_id_root ON task_dependency_tree(id, root_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependency_tree_depth ON task_dependency_tree(depth);
CREATE INDEX IF NOT EXISTS idx_task_dependency_tree_status ON task_dependency_tree(status);

-- Task performance summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS task_performance_summary AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.complexity_score,
    t.estimated_hours,
    t.actual_hours,
    CASE 
        WHEN t.estimated_hours > 0 THEN (t.actual_hours / t.estimated_hours) * 100
        ELSE NULL 
    END as accuracy_percentage,
    COUNT(el.id) as error_count,
    COUNT(ds.id) as deployment_script_count,
    COUNT(CASE WHEN ds.status = 'completed' THEN 1 END) as successful_deployments,
    COUNT(CASE WHEN ds.status = 'failed' THEN 1 END) as failed_deployments,
    AVG(ds.execution_duration_ms) as avg_deployment_duration_ms,
    t.created_at,
    t.updated_at,
    t.completed_at
FROM tasks t
LEFT JOIN error_logs el ON t.id = el.task_id
LEFT JOIN deployment_scripts ds ON t.id = ds.task_id
GROUP BY t.id, t.title, t.status, t.complexity_score, t.estimated_hours, t.actual_hours, t.created_at, t.updated_at, t.completed_at;

-- Create index on performance summary view
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_performance_summary_id ON task_performance_summary(id);
CREATE INDEX IF NOT EXISTS idx_task_performance_summary_status ON task_performance_summary(status);
CREATE INDEX IF NOT EXISTS idx_task_performance_summary_accuracy ON task_performance_summary(accuracy_percentage);

-- System health dashboard view
CREATE OR REPLACE VIEW system_health_dashboard AS
SELECT 
    'tasks' as metric_category,
    'total_count' as metric_name,
    COUNT(*)::decimal as metric_value,
    'count' as metric_unit,
    NOW() as timestamp
FROM tasks
UNION ALL
SELECT 
    'tasks' as metric_category,
    'active_count' as metric_name,
    COUNT(*)::decimal as metric_value,
    'count' as metric_unit,
    NOW() as timestamp
FROM tasks 
WHERE status IN ('pending', 'in_progress')
UNION ALL
SELECT 
    'errors' as metric_category,
    'unresolved_count' as metric_name,
    COUNT(*)::decimal as metric_value,
    'count' as metric_unit,
    NOW() as timestamp
FROM error_logs 
WHERE resolved = FALSE
UNION ALL
SELECT 
    'api' as metric_category,
    'requests_last_hour' as metric_name,
    COUNT(*)::decimal as metric_value,
    'count' as metric_unit,
    NOW() as timestamp
FROM api_access_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
    'webhooks' as metric_category,
    'pending_count' as metric_name,
    COUNT(*)::decimal as metric_value,
    'count' as metric_unit,
    NOW() as timestamp
FROM webhook_events 
WHERE processed = FALSE;

-- Create functions for common operations

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY task_dependency_tree;
    REFRESH MATERIALIZED VIEW CONCURRENTLY task_performance_summary;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old logs
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up old audit logs
    DELETE FROM audit_logs WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old API access logs
    DELETE FROM api_access_logs WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Clean up old system metrics
    DELETE FROM system_metrics WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Clean up resolved error logs older than retention period
    DELETE FROM error_logs 
    WHERE resolved = TRUE 
    AND resolved_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate API key
CREATE OR REPLACE FUNCTION generate_api_key(
    p_key_name VARCHAR(255),
    p_user_id VARCHAR(255),
    p_permissions JSONB DEFAULT '[]'::jsonb,
    p_rate_limit_per_hour INTEGER DEFAULT 1000,
    p_expires_days INTEGER DEFAULT 365
)
RETURNS TABLE(api_key_id UUID, api_key VARCHAR(255)) AS $$
DECLARE
    v_key_id UUID;
    v_api_key VARCHAR(255);
    v_key_hash VARCHAR(255);
    v_key_prefix VARCHAR(20);
BEGIN
    -- Generate API key
    v_key_id := uuid_generate_v4();
    v_api_key := 'ctm_' || encode(gen_random_bytes(32), 'hex');
    v_key_prefix := substring(v_api_key from 1 for 20);
    v_key_hash := encode(digest(v_api_key, 'sha256'), 'hex');
    
    -- Insert API key record
    INSERT INTO api_keys (
        id, key_name, key_hash, key_prefix, user_id, permissions,
        rate_limit_per_hour, rate_limit_per_day, expires_at
    ) VALUES (
        v_key_id, p_key_name, v_key_hash, v_key_prefix, p_user_id, p_permissions,
        p_rate_limit_per_hour, p_rate_limit_per_hour * 24,
        NOW() + (p_expires_days || ' days')::INTERVAL
    );
    
    RETURN QUERY SELECT v_key_id, v_api_key;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies for multi-tenant access

-- Enable RLS on sensitive tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for API keys (users can only see their own keys)
CREATE POLICY api_keys_user_policy ON api_keys
    FOR ALL
    TO authenticated_users
    USING (user_id = current_setting('app.current_user_id', true));

-- Create RLS policy for API access logs (users can only see their own logs)
CREATE POLICY api_access_logs_user_policy ON api_access_logs
    FOR SELECT
    TO authenticated_users
    USING (user_id = current_setting('app.current_user_id', true));

-- Create RLS policy for configuration settings (environment-based access)
CREATE POLICY configuration_settings_environment_policy ON configuration_settings
    FOR SELECT
    TO authenticated_users
    USING (
        environment = 'all' OR 
        environment = current_setting('app.current_environment', true) OR
        current_setting('app.user_role', true) = 'admin'
    );

-- Create database roles for different access levels
DO $$
BEGIN
    -- Create roles if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated_users') THEN
        CREATE ROLE authenticated_users;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_users') THEN
        CREATE ROLE api_users;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_users') THEN
        CREATE ROLE readonly_users;
    END IF;
END
$$;

-- Grant appropriate permissions to roles
GRANT USAGE ON SCHEMA public TO authenticated_users, api_users, readonly_users;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON tasks, task_contexts, workflow_states TO api_users;
GRANT SELECT, INSERT, UPDATE ON deployment_scripts, error_logs, webhook_events TO api_users;
GRANT SELECT, INSERT ON api_access_logs, system_metrics TO api_users;
GRANT SELECT ON api_keys TO api_users;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_users;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO api_users;

-- Insert initial configuration settings
INSERT INTO configuration_settings (setting_key, setting_value, setting_type, description, environment) VALUES
('api.rate_limit.default_per_hour', '1000', 'number', 'Default API rate limit per hour', 'all'),
('api.rate_limit.default_per_day', '10000', 'number', 'Default API rate limit per day', 'all'),
('api.request_timeout_ms', '30000', 'number', 'API request timeout in milliseconds', 'all'),
('database.connection_pool.min', '2', 'number', 'Minimum database connections in pool', 'all'),
('database.connection_pool.max', '20', 'number', 'Maximum database connections in pool', 'all'),
('security.api_key_expiry_days', '365', 'number', 'Default API key expiry in days', 'all'),
('monitoring.metrics_retention_days', '90', 'number', 'Metrics retention period in days', 'all'),
('webhook.max_retry_attempts', '3', 'number', 'Maximum webhook retry attempts', 'all'),
('deployment.default_timeout_seconds', '300', 'number', 'Default deployment script timeout', 'all')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum) 
VALUES ('002', 'Enhanced CI/CD schema with security and scalability improvements', 'enhanced_cicd_schema_v2_0_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE deployment_scripts IS 'CI/CD deployment scripts and execution tracking';
COMMENT ON TABLE error_logs IS 'Comprehensive error logging and tracking system';
COMMENT ON TABLE webhook_events IS 'Webhook events for external system integration';
COMMENT ON TABLE api_access_logs IS 'API access logging for security monitoring';
COMMENT ON TABLE api_keys IS 'API authentication keys and permissions';
COMMENT ON TABLE system_metrics IS 'System performance and health metrics';
COMMENT ON TABLE configuration_settings IS 'Dynamic system configuration settings';

COMMENT ON MATERIALIZED VIEW task_dependency_tree IS 'Materialized view for efficient task dependency resolution';
COMMENT ON MATERIALIZED VIEW task_performance_summary IS 'Performance analytics for tasks and deployments';
COMMENT ON VIEW system_health_dashboard IS 'Real-time system health metrics dashboard';

