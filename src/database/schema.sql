-- PostgreSQL Database Schema for AI CI/CD System
-- Description: Comprehensive schema for tasks, executions, validations, and audit trails
-- Version: 1.0.0
-- Created: 2025-05-28

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core task management
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    requirements JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_by VARCHAR(255),
    assigned_to VARCHAR(255),
    parent_task_id UUID REFERENCES tasks(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    CONSTRAINT tasks_priority_check CHECK (priority >= 0 AND priority <= 10)
);

-- Task execution tracking
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL,
    agent_config JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    logs JSONB DEFAULT '[]',
    error_details JSONB,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT task_executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT task_executions_agent_type_check CHECK (agent_type IN ('claude-code', 'codegen', 'webhook-handler', 'validation-engine'))
);

-- PR validation tracking
CREATE TABLE pr_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES task_executions(id),
    pr_number INTEGER NOT NULL,
    repository VARCHAR(255) NOT NULL,
    branch_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    validation_results JSONB DEFAULT '{}',
    webhook_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT pr_validations_status_check CHECK (status IN ('pending', 'running', 'passed', 'failed', 'cancelled')),
    CONSTRAINT pr_validations_pr_number_check CHECK (pr_number > 0)
);

-- Error tracking and recovery
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    execution_id UUID REFERENCES task_executions(id),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    context JSONB DEFAULT '{}',
    recovery_attempts INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT error_logs_recovery_attempts_check CHECK (recovery_attempts >= 0),
    CONSTRAINT error_logs_error_type_check CHECK (error_type IN ('database', 'api', 'validation', 'network', 'timeout', 'authentication', 'authorization', 'system'))
);

-- System configuration
CREATE TABLE system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN ('task', 'task_execution', 'pr_validation', 'error_log', 'system_config')),
    CONSTRAINT audit_logs_action_check CHECK (action IN ('create', 'update', 'delete', 'status_change'))
);

-- Create indexes for performance

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

-- Task executions table indexes
CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_agent_type ON task_executions(agent_type);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_created_at ON task_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_task_executions_started_at ON task_executions(started_at);

-- PR validations table indexes
CREATE INDEX IF NOT EXISTS idx_pr_validations_task_id ON pr_validations(task_id);
CREATE INDEX IF NOT EXISTS idx_pr_validations_execution_id ON pr_validations(execution_id);
CREATE INDEX IF NOT EXISTS idx_pr_validations_repository ON pr_validations(repository);
CREATE INDEX IF NOT EXISTS idx_pr_validations_pr_number ON pr_validations(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_validations_status ON pr_validations(status);
CREATE INDEX IF NOT EXISTS idx_pr_validations_created_at ON pr_validations(created_at);

-- Error logs table indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_execution_id ON error_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);

-- System config table indexes
CREATE INDEX IF NOT EXISTS idx_system_config_updated_at ON system_config(updated_at);

-- Audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create triggers for automatic updated_at timestamps

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for tasks table
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for pr_validations table
CREATE TRIGGER update_pr_validations_updated_at 
    BEFORE UPDATE ON pr_validations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for system_config table
CREATE TRIGGER update_system_config_updated_at 
    BEFORE UPDATE ON system_config 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'create', row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, old_values, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'update', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (entity_type, entity_id, action, old_values)
        VALUES (TG_TABLE_NAME, OLD.id, 'delete', row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create audit triggers
CREATE TRIGGER audit_tasks_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_task_executions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON task_executions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_pr_validations_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pr_validations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_error_logs_trigger
    AFTER INSERT OR UPDATE OR DELETE ON error_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_system_config_trigger
    AFTER INSERT OR UPDATE OR DELETE ON system_config
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common queries

-- Active tasks view
CREATE OR REPLACE VIEW active_tasks AS
SELECT 
    t.*,
    COUNT(te.id) as execution_count,
    COUNT(pv.id) as validation_count,
    COUNT(el.id) as error_count
FROM tasks t
LEFT JOIN task_executions te ON t.id = te.task_id
LEFT JOIN pr_validations pv ON t.id = pv.task_id
LEFT JOIN error_logs el ON t.id = el.task_id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id;

-- Task execution summary view
CREATE OR REPLACE VIEW task_execution_summary AS
SELECT 
    te.agent_type,
    te.status,
    COUNT(*) as execution_count,
    AVG(EXTRACT(EPOCH FROM (te.completed_at - te.started_at))) as avg_duration_seconds
FROM task_executions te
WHERE te.started_at IS NOT NULL
GROUP BY te.agent_type, te.status;

-- PR validation summary view
CREATE OR REPLACE VIEW pr_validation_summary AS
SELECT 
    pv.repository,
    pv.status,
    COUNT(*) as validation_count,
    COUNT(DISTINCT pv.pr_number) as unique_pr_count
FROM pr_validations pv
GROUP BY pv.repository, pv.status;

-- Error summary view
CREATE OR REPLACE VIEW error_summary AS
SELECT 
    el.error_type,
    COUNT(*) as error_count,
    COUNT(CASE WHEN el.resolved THEN 1 END) as resolved_count,
    AVG(el.recovery_attempts) as avg_recovery_attempts
FROM error_logs el
GROUP BY el.error_type;

-- Recent activity view
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
    al.created_at,
    al.entity_type,
    al.entity_id,
    al.action,
    al.user_id,
    t.title as task_title
FROM audit_logs al
LEFT JOIN tasks t ON al.entity_id = t.id AND al.entity_type = 'task'
ORDER BY al.created_at DESC
LIMIT 100;

-- Add table comments
COMMENT ON TABLE tasks IS 'Core task management table storing all task information';
COMMENT ON TABLE task_executions IS 'Task execution tracking with agent information and logs';
COMMENT ON TABLE pr_validations IS 'PR validation tracking for GitHub integration';
COMMENT ON TABLE error_logs IS 'Error tracking and recovery management';
COMMENT ON TABLE system_config IS 'System configuration key-value store';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all database changes';

-- Add column comments
COMMENT ON COLUMN tasks.requirements IS 'JSONB field containing task requirements and specifications';
COMMENT ON COLUMN task_executions.agent_config IS 'JSONB field containing agent-specific configuration';
COMMENT ON COLUMN task_executions.logs IS 'JSONB array containing execution logs and output';
COMMENT ON COLUMN pr_validations.validation_results IS 'JSONB field containing validation results and metrics';
COMMENT ON COLUMN pr_validations.webhook_payload IS 'JSONB field containing original webhook payload data';
COMMENT ON COLUMN error_logs.context IS 'JSONB field containing error context and debugging information';
COMMENT ON COLUMN system_config.value IS 'JSONB field containing configuration values';

