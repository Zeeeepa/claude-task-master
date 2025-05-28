-- Migration: 001_initial_schema.sql
-- Description: Create initial database schema for TaskMaster AI CI/CD System
-- Created: 2025-05-28
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    complexity_score INTEGER DEFAULT 5,
    affected_files JSONB DEFAULT '[]'::jsonb,
    requirements JSONB DEFAULT '[]'::jsonb,
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
    
    -- Constraints
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    CONSTRAINT tasks_priority_check CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT tasks_complexity_check CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CONSTRAINT tasks_hours_check CHECK (estimated_hours >= 0 AND actual_hours >= 0)
);

-- Create task contexts table
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
        'requirement', 'codebase', 'ai_interaction', 'validation', 
        'workflow', 'status_change', 'completion', 'dependency_parent', 
        'dependency_child', 'error', 'performance'
    ))
);

-- Create workflow states table
CREATE TABLE IF NOT EXISTS workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id VARCHAR(255) NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    step VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    result JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflow_states_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    CONSTRAINT workflow_states_retry_check CHECK (retry_count >= 0)
);

-- Create audit logs table
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
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN ('task', 'task_context', 'workflow_state')),
    CONSTRAINT audit_logs_action_check CHECK (action IN ('create', 'update', 'delete', 'status_change'))
);

-- Create task dependencies table
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL DEFAULT 'blocks',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_dependencies_type_check CHECK (dependency_type IN ('blocks', 'depends_on', 'related')),
    CONSTRAINT task_dependencies_no_self_reference CHECK (parent_task_id != child_task_id),
    
    -- Unique constraint to prevent duplicate dependencies
    UNIQUE(parent_task_id, child_task_id, dependency_type)
);

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    tags JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT performance_metrics_type_check CHECK (metric_type IN ('query', 'task', 'workflow', 'system'))
);

-- Create schema migrations table for tracking applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64)
);

-- Create indexes for performance

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);

-- Task contexts table indexes
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_id ON task_contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_task_contexts_type ON task_contexts(context_type);
CREATE INDEX IF NOT EXISTS idx_task_contexts_created_at ON task_contexts(created_at);

-- Workflow states table indexes
CREATE INDEX IF NOT EXISTS idx_workflow_states_workflow_id ON workflow_states(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_task_id ON workflow_states(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_status ON workflow_states(status);
CREATE INDEX IF NOT EXISTS idx_workflow_states_started_at ON workflow_states(started_at);

-- Audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Task dependencies table indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent ON task_dependencies(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_child ON task_dependencies(child_task_id);

-- Performance metrics table indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_name ON performance_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);

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

-- Triggers for task_contexts table
CREATE TRIGGER update_task_contexts_updated_at 
    BEFORE UPDATE ON task_contexts 
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

CREATE TRIGGER audit_task_contexts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON task_contexts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_workflow_states_trigger
    AFTER INSERT OR UPDATE OR DELETE ON workflow_states
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Insert initial migration record
INSERT INTO schema_migrations (version, description, checksum) 
VALUES ('001', 'Initial schema creation', 'initial_schema_v1_0_0')
ON CONFLICT (version) DO NOTHING;

-- Create views for common queries

-- Active tasks view
CREATE OR REPLACE VIEW active_tasks AS
SELECT 
    t.*,
    COUNT(tc.id) as context_count,
    COUNT(td_parent.child_task_id) as child_task_count,
    COUNT(td_child.parent_task_id) as dependency_count
FROM tasks t
LEFT JOIN task_contexts tc ON t.id = tc.task_id
LEFT JOIN task_dependencies td_parent ON t.id = td_parent.parent_task_id
LEFT JOIN task_dependencies td_child ON t.id = td_child.child_task_id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id;

-- Task summary view
CREATE OR REPLACE VIEW task_summary AS
SELECT 
    status,
    COUNT(*) as task_count,
    AVG(complexity_score) as avg_complexity,
    SUM(estimated_hours) as total_estimated_hours,
    SUM(actual_hours) as total_actual_hours
FROM tasks
GROUP BY status;

-- Recent activity view
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
    al.timestamp,
    al.entity_type,
    al.entity_id,
    al.action,
    t.title as task_title,
    al.user_id
FROM audit_logs al
LEFT JOIN tasks t ON al.entity_id = t.id AND al.entity_type = 'task'
ORDER BY al.timestamp DESC
LIMIT 100;

COMMENT ON TABLE tasks IS 'Main tasks table storing all task information';
COMMENT ON TABLE task_contexts IS 'Contextual information and metadata for tasks';
COMMENT ON TABLE workflow_states IS 'Workflow execution states and progress tracking';
COMMENT ON TABLE audit_logs IS 'Audit trail for all database changes';
COMMENT ON TABLE task_dependencies IS 'Task dependency relationships';
COMMENT ON TABLE performance_metrics IS 'System performance metrics and monitoring data';
COMMENT ON TABLE schema_migrations IS 'Database schema version tracking';

