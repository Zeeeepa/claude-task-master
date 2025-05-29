-- Migration: 002_add_error_logs_and_api_keys.sql
-- Description: Add error logs and API keys tables for comprehensive error tracking and secure credential management
-- Created: 2025-05-28
-- Version: 1.1.0

-- Create error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_type VARCHAR(50) NOT NULL DEFAULT 'general',
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    workflow_id VARCHAR(255),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT error_logs_type_check CHECK (error_type IN (
        'general', 'validation', 'database', 'network', 'authentication',
        'authorization', 'business_logic', 'external_api', 'system',
        'configuration', 'timeout', 'rate_limit'
    )),
    CONSTRAINT error_logs_severity_check CHECK (severity IN ('debug', 'info', 'warn', 'error', 'fatal'))
);

-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    service VARCHAR(50) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(20),
    permissions JSONB DEFAULT '[]'::jsonb,
    environment VARCHAR(20) NOT NULL DEFAULT 'development',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    rate_limit JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT api_keys_service_check CHECK (service IN (
        'codegen', 'linear', 'claude_code', 'agentapi', 'github',
        'openai', 'anthropic', 'database', 'monitoring', 'webhook'
    )),
    CONSTRAINT api_keys_environment_check CHECK (environment IN ('development', 'staging', 'production')),
    CONSTRAINT api_keys_usage_count_check CHECK (usage_count >= 0),
    
    -- Unique constraint for name per service per environment
    UNIQUE(name, service, environment)
);

-- Create indexes for error logs table
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_workflow_id ON error_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_created ON error_logs(severity, created_at);

-- Create indexes for API keys table
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
CREATE INDEX IF NOT EXISTS idx_api_keys_environment ON api_keys(environment);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_service_active ON api_keys(service, is_active);

-- Create triggers for automatic updated_at timestamps

-- Triggers for error_logs table (no updated_at field, but we'll add one for consistency)
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE TRIGGER update_error_logs_updated_at
    BEFORE UPDATE ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for api_keys table
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_error_logs_trigger
    AFTER INSERT OR UPDATE OR DELETE ON error_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_api_keys_trigger
    AFTER INSERT OR UPDATE OR DELETE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common error log queries

-- Critical errors view
CREATE OR REPLACE VIEW critical_errors AS
SELECT
    el.*,
    t.title as task_title,
    t.status as task_status
FROM error_logs el
LEFT JOIN tasks t ON el.task_id = t.id
WHERE el.severity IN ('error', 'fatal')
    AND el.resolved = FALSE
ORDER BY el.created_at DESC;

-- Error summary view
CREATE OR REPLACE VIEW error_summary AS
SELECT
    error_type,
    severity,
    COUNT(*) as error_count,
    COUNT(CASE WHEN resolved = FALSE THEN 1 END) as unresolved_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at))/3600) as avg_resolution_hours,
    MAX(created_at) as latest_occurrence
FROM error_logs
GROUP BY error_type, severity
ORDER BY error_count DESC;

-- Active API keys view
CREATE OR REPLACE VIEW active_api_keys AS
SELECT
    ak.*,
    CASE 
        WHEN expires_at IS NULL THEN FALSE
        WHEN expires_at <= NOW() THEN TRUE
        ELSE FALSE
    END as is_expired
FROM api_keys ak
WHERE is_active = TRUE
ORDER BY last_used_at DESC NULLS LAST;

-- API key usage summary view
CREATE OR REPLACE VIEW api_key_usage_summary AS
SELECT
    service,
    environment,
    COUNT(*) as total_keys,
    COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_keys,
    COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_keys,
    SUM(usage_count) as total_usage,
    MAX(last_used_at) as latest_usage
FROM api_keys
GROUP BY service, environment
ORDER BY service, environment;

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('002', 'Add error logs and API keys tables', 'error_logs_api_keys_v1_1_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE error_logs IS 'Comprehensive error logging and tracking system';
COMMENT ON TABLE api_keys IS 'Secure API key storage and management';

COMMENT ON COLUMN error_logs.error_type IS 'Category of error for classification and filtering';
COMMENT ON COLUMN error_logs.severity IS 'Error severity level for prioritization';
COMMENT ON COLUMN error_logs.context IS 'Additional context data for debugging';
COMMENT ON COLUMN error_logs.resolved IS 'Whether the error has been resolved';

COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key for secure storage';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of key for identification';
COMMENT ON COLUMN api_keys.permissions IS 'Array of permissions granted to this API key';
COMMENT ON COLUMN api_keys.rate_limit IS 'Rate limiting configuration for this API key';
COMMENT ON COLUMN api_keys.usage_count IS 'Number of times this API key has been used';

