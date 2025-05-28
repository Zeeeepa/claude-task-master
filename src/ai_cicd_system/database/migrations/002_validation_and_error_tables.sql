-- Migration: 002_validation_and_error_tables.sql
-- Description: Add validation results and error logs tables for Claude Code integration
-- Created: 2025-05-28
-- Version: 1.1.0

-- Create validation results table for Claude Code validation outcomes
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    validation_type VARCHAR(50) NOT NULL,
    validation_status VARCHAR(50) NOT NULL,
    validation_score DECIMAL(5,2),
    validation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    claude_code_version VARCHAR(50),
    validation_environment JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT validation_results_type_check CHECK (validation_type IN (
        'syntax', 'security', 'performance', 'style', 'testing', 
        'integration', 'deployment', 'compliance', 'documentation'
    )),
    CONSTRAINT validation_results_status_check CHECK (validation_status IN (
        'pending', 'running', 'passed', 'failed', 'warning', 'skipped', 'error'
    )),
    CONSTRAINT validation_results_score_check CHECK (validation_score >= 0 AND validation_score <= 100),
    CONSTRAINT validation_results_retry_check CHECK (retry_count >= 0 AND retry_count <= 10),
    CONSTRAINT validation_results_execution_time_check CHECK (execution_time_ms >= 0)
);

-- Create error logs table for comprehensive error tracking
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    validation_result_id UUID REFERENCES validation_results(id) ON DELETE SET NULL,
    workflow_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
    error_code VARCHAR(50) NOT NULL,
    error_category VARCHAR(50) NOT NULL,
    error_severity VARCHAR(20) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}'::jsonb,
    stack_trace TEXT,
    context_data JSONB DEFAULT '{}'::jsonb,
    resolution_status VARCHAR(50) DEFAULT 'unresolved',
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    occurrence_count INTEGER DEFAULT 1,
    first_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    environment VARCHAR(50) DEFAULT 'production',
    service_name VARCHAR(100),
    service_version VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT error_logs_category_check CHECK (error_category IN (
        'database', 'validation', 'workflow', 'integration', 'authentication',
        'authorization', 'network', 'configuration', 'business_logic', 'system'
    )),
    CONSTRAINT error_logs_severity_check CHECK (error_severity IN (
        'critical', 'high', 'medium', 'low', 'info'
    )),
    CONSTRAINT error_logs_resolution_check CHECK (resolution_status IN (
        'unresolved', 'investigating', 'resolved', 'wont_fix', 'duplicate'
    )),
    CONSTRAINT error_logs_occurrence_check CHECK (occurrence_count > 0),
    CONSTRAINT error_logs_environment_check CHECK (environment IN (
        'development', 'testing', 'staging', 'production'
    ))
);

-- Create user roles table for authentication and authorization
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_roles_name_check CHECK (role_name ~ '^[a-z_]+$')
);

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role_id UUID NOT NULL REFERENCES user_roles(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    api_key_hash VARCHAR(255),
    api_key_expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT users_username_check CHECK (username ~ '^[a-zA-Z0-9_.-]+$'),
    CONSTRAINT users_email_check CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$'),
    CONSTRAINT users_login_attempts_check CHECK (login_attempts >= 0 AND login_attempts <= 10)
);

-- Create indexes for performance

-- Validation results table indexes
CREATE INDEX IF NOT EXISTS idx_validation_results_task_id ON validation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_type ON validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_status ON validation_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_validation_results_started_at ON validation_results(started_at);
CREATE INDEX IF NOT EXISTS idx_validation_results_completed_at ON validation_results(completed_at);
CREATE INDEX IF NOT EXISTS idx_validation_results_score ON validation_results(validation_score);
CREATE INDEX IF NOT EXISTS idx_validation_results_retry_count ON validation_results(retry_count);

-- Error logs table indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_validation_result_id ON error_logs(validation_result_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_workflow_state_id ON error_logs(workflow_state_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_code ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(error_category);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(error_severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolution_status ON error_logs(resolution_status);
CREATE INDEX IF NOT EXISTS idx_error_logs_first_occurred_at ON error_logs(first_occurred_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_last_occurred_at ON error_logs(last_occurred_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_environment ON error_logs(environment);
CREATE INDEX IF NOT EXISTS idx_error_logs_service_name ON error_logs(service_name);

-- User management indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_name ON user_roles(role_name);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_api_key_expires ON users(api_key_expires_at);

-- Create triggers for automatic updated_at timestamps

-- Validation results triggers
CREATE TRIGGER update_validation_results_updated_at
    BEFORE UPDATE ON validation_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Error logs triggers
CREATE TRIGGER update_error_logs_updated_at
    BEFORE UPDATE ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- User roles triggers
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Users triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_validation_results_trigger
    AFTER INSERT OR UPDATE OR DELETE ON validation_results
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_error_logs_trigger
    AFTER INSERT OR UPDATE OR DELETE ON error_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_user_roles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common queries

-- Validation summary view
CREATE OR REPLACE VIEW validation_summary AS
SELECT
    vr.validation_type,
    vr.validation_status,
    COUNT(*) as total_validations,
    AVG(vr.validation_score) as avg_score,
    AVG(vr.execution_time_ms) as avg_execution_time_ms,
    COUNT(CASE WHEN vr.retry_count > 0 THEN 1 END) as retried_validations,
    MAX(vr.completed_at) as last_validation
FROM validation_results vr
WHERE vr.completed_at IS NOT NULL
GROUP BY vr.validation_type, vr.validation_status;

-- Error summary view
CREATE OR REPLACE VIEW error_summary AS
SELECT
    el.error_category,
    el.error_severity,
    el.resolution_status,
    COUNT(*) as error_count,
    SUM(el.occurrence_count) as total_occurrences,
    MIN(el.first_occurred_at) as first_seen,
    MAX(el.last_occurred_at) as last_seen,
    COUNT(CASE WHEN el.resolution_status = 'resolved' THEN 1 END) as resolved_count
FROM error_logs el
GROUP BY el.error_category, el.error_severity, el.resolution_status;

-- Task validation status view
CREATE OR REPLACE VIEW task_validation_status AS
SELECT
    t.id as task_id,
    t.title,
    t.status as task_status,
    COUNT(vr.id) as total_validations,
    COUNT(CASE WHEN vr.validation_status = 'passed' THEN 1 END) as passed_validations,
    COUNT(CASE WHEN vr.validation_status = 'failed' THEN 1 END) as failed_validations,
    COUNT(CASE WHEN vr.validation_status = 'warning' THEN 1 END) as warning_validations,
    AVG(vr.validation_score) as avg_validation_score,
    MAX(vr.completed_at) as last_validation_at
FROM tasks t
LEFT JOIN validation_results vr ON t.id = vr.task_id
GROUP BY t.id, t.title, t.status;

-- Recent errors view
CREATE OR REPLACE VIEW recent_errors AS
SELECT
    el.id,
    el.error_code,
    el.error_category,
    el.error_severity,
    el.error_message,
    el.resolution_status,
    el.last_occurred_at,
    el.occurrence_count,
    t.title as task_title,
    vr.validation_type
FROM error_logs el
LEFT JOIN tasks t ON el.task_id = t.id
LEFT JOIN validation_results vr ON el.validation_result_id = vr.id
ORDER BY el.last_occurred_at DESC
LIMIT 100;

-- Insert default user roles
INSERT INTO user_roles (role_name, role_description, permissions) VALUES
('admin', 'System administrator with full access', '["*"]'::jsonb),
('developer', 'Software developer with task and validation access', '["tasks:read", "tasks:write", "validations:read", "validations:write", "errors:read"]'::jsonb),
('viewer', 'Read-only access to tasks and validations', '["tasks:read", "validations:read", "errors:read"]'::jsonb),
('api_client', 'External API client with limited access', '["tasks:read", "tasks:write", "validations:write"]'::jsonb)
ON CONFLICT (role_name) DO NOTHING;

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('002', 'Add validation results and error logs tables', 'validation_error_tables_v1_1_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE validation_results IS 'Claude Code validation outcomes and metrics';
COMMENT ON TABLE error_logs IS 'Comprehensive error tracking and resolution history';
COMMENT ON TABLE user_roles IS 'User role definitions and permissions';
COMMENT ON TABLE users IS 'User authentication and authorization data';

COMMENT ON COLUMN validation_results.validation_score IS 'Validation score from 0-100, higher is better';
COMMENT ON COLUMN validation_results.execution_time_ms IS 'Time taken for validation in milliseconds';
COMMENT ON COLUMN error_logs.occurrence_count IS 'Number of times this error has occurred';
COMMENT ON COLUMN error_logs.resolution_status IS 'Current status of error resolution';

