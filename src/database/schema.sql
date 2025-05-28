-- =====================================================
-- PostgreSQL Database Schema for AI-Powered CI/CD System
-- =====================================================
-- Description: Comprehensive database schema with all required tables
-- for the TaskMaster AI CI/CD orchestration hub
-- Created: 2025-05-28
-- Version: 1.0.0
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Tasks Table: Store task details, requirements, status, dependencies
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
    linear_issue_id VARCHAR(255),
    linear_issue_url VARCHAR(500),
    github_pr_url VARCHAR(500),
    github_branch VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked')),
    CONSTRAINT tasks_priority_check CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT tasks_complexity_check CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CONSTRAINT tasks_hours_check CHECK (estimated_hours >= 0 AND actual_hours >= 0)
);

-- Workflows Table: Track CI/CD pipeline stages and states
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    current_stage VARCHAR(100),
    total_stages INTEGER DEFAULT 0,
    completed_stages INTEGER DEFAULT 0,
    pipeline_config JSONB DEFAULT '{}'::jsonb,
    stage_results JSONB DEFAULT '[]'::jsonb,
    error_details JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflows_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
    CONSTRAINT workflows_stages_check CHECK (completed_stages >= 0 AND completed_stages <= total_stages)
);

-- Integrations Table: Manage connections to Linear, AgentAPI, Claude Code
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    credentials JSONB DEFAULT '{}'::jsonb, -- Encrypted credentials
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    rate_limit_config JSONB DEFAULT '{}'::jsonb,
    usage_stats JSONB DEFAULT '{}'::jsonb,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT integrations_type_check CHECK (type IN ('linear', 'agentapi', 'claude_code', 'github', 'codegen', 'webhook', 'custom')),
    CONSTRAINT integrations_status_check CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    CONSTRAINT integrations_health_check CHECK (health_status IN ('healthy', 'unhealthy', 'degraded', 'unknown'))
);

-- Logs Table: Comprehensive logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(100),
    component VARCHAR(100),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    correlation_id VARCHAR(255),
    context JSONB DEFAULT '{}'::jsonb,
    stack_trace TEXT,
    duration_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT logs_level_check CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    CONSTRAINT logs_duration_check CHECK (duration_ms >= 0)
);

-- Templates Table: Store prompt templates for Codegen integration
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    template_content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    category VARCHAR(100),
    tags JSONB DEFAULT '[]'::jsonb,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    average_execution_time_ms INTEGER DEFAULT 0,
    created_by VARCHAR(255),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT templates_type_check CHECK (type IN ('code_generation', 'code_review', 'testing', 'documentation', 'deployment', 'analysis', 'custom')),
    CONSTRAINT templates_status_check CHECK (status IN ('active', 'inactive', 'deprecated', 'draft')),
    CONSTRAINT templates_success_rate_check CHECK (success_rate >= 0 AND success_rate <= 100),
    CONSTRAINT templates_execution_time_check CHECK (average_execution_time_ms >= 0)
);

-- Deployments Table: Track deployment history and status
CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_id VARCHAR(255) NOT NULL UNIQUE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    environment VARCHAR(100) NOT NULL,
    version VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    deployment_type VARCHAR(100) NOT NULL,
    source_branch VARCHAR(255),
    target_branch VARCHAR(255),
    commit_sha VARCHAR(255),
    pr_number INTEGER,
    deployment_config JSONB DEFAULT '{}'::jsonb,
    artifacts JSONB DEFAULT '[]'::jsonb,
    health_checks JSONB DEFAULT '[]'::jsonb,
    rollback_info JSONB DEFAULT '{}'::jsonb,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    deployed_by VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT deployments_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'rolled_back')),
    CONSTRAINT deployments_type_check CHECK (deployment_type IN ('production', 'staging', 'development', 'testing', 'preview', 'hotfix')),
    CONSTRAINT deployments_environment_check CHECK (environment IN ('production', 'staging', 'development', 'testing', 'preview', 'local'))
);

-- =====================================================
-- RELATIONSHIP TABLES
-- =====================================================

-- Task Dependencies: Track task relationships and dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL DEFAULT 'blocks',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_dependencies_type_check CHECK (dependency_type IN ('blocks', 'depends_on', 'related', 'subtask')),
    CONSTRAINT task_dependencies_status_check CHECK (status IN ('active', 'resolved', 'cancelled')),
    CONSTRAINT task_dependencies_no_self_reference CHECK (parent_task_id != child_task_id),
    
    -- Unique constraint to prevent duplicate dependencies
    UNIQUE(parent_task_id, child_task_id, dependency_type)
);

-- Workflow Stages: Track individual stages within workflows
CREATE TABLE IF NOT EXISTS workflow_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    stage_name VARCHAR(255) NOT NULL,
    stage_order INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    stage_type VARCHAR(100) NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    error_details JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 300,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflow_stages_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
    CONSTRAINT workflow_stages_type_check CHECK (stage_type IN ('validation', 'build', 'test', 'deploy', 'review', 'approval', 'notification', 'custom')),
    CONSTRAINT workflow_stages_order_check CHECK (stage_order >= 0),
    CONSTRAINT workflow_stages_retry_check CHECK (retry_count >= 0 AND retry_count <= max_retries),
    CONSTRAINT workflow_stages_timeout_check CHECK (timeout_seconds > 0),
    
    -- Unique constraint for stage order within workflow
    UNIQUE(workflow_id, stage_order)
);

-- Integration Events: Track integration usage and events
CREATE TABLE IF NOT EXISTS integration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL,
    response_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    duration_ms INTEGER,
    rate_limit_remaining INTEGER,
    rate_limit_reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT integration_events_type_check CHECK (event_type IN ('api_call', 'webhook', 'health_check', 'auth', 'sync', 'notification')),
    CONSTRAINT integration_events_status_check CHECK (status IN ('success', 'failure', 'timeout', 'rate_limited')),
    CONSTRAINT integration_events_duration_check CHECK (duration_ms >= 0)
);

-- =====================================================
-- AUDIT AND MONITORING TABLES
-- =====================================================

-- Audit Trail: Track all database changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB DEFAULT '{}'::jsonb,
    new_values JSONB DEFAULT '{}'::jsonb,
    changed_fields JSONB DEFAULT '[]'::jsonb,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT audit_logs_action_check CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT'))
);

-- Performance Metrics: Track system performance
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    value DECIMAL(15,4) NOT NULL,
    unit VARCHAR(50),
    tags JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT performance_metrics_type_check CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timer', 'rate'))
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_metadata ON tasks USING GIN(metadata);

-- Workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_workflow_id ON workflows(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflows_task_id ON workflows(task_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_current_stage ON workflows(current_stage);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at);

-- Integrations indexes
CREATE INDEX IF NOT EXISTS idx_integrations_name ON integrations(name);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integrations_health_status ON integrations(health_status);
CREATE INDEX IF NOT EXISTS idx_integrations_last_health_check ON integrations(last_health_check);

-- Logs indexes
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_component ON logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_workflow_id ON logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_logs_integration_id ON logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_correlation_id ON logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_logs_context ON logs USING GIN(context);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_last_used_at ON templates(last_used_at);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON templates USING GIN(tags);

-- Deployments indexes
CREATE INDEX IF NOT EXISTS idx_deployments_deployment_id ON deployments(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployments_task_id ON deployments(task_id);
CREATE INDEX IF NOT EXISTS idx_deployments_workflow_id ON deployments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_deployment_type ON deployments(deployment_type);
CREATE INDEX IF NOT EXISTS idx_deployments_deployed_by ON deployments(deployed_by);
CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_deployments_commit_sha ON deployments(commit_sha);

-- Workflow stages indexes
CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow_id ON workflow_stages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_status ON workflow_stages(status);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_stage_type ON workflow_stages(stage_type);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_order ON workflow_stages(workflow_id, stage_order);

-- Integration events indexes
CREATE INDEX IF NOT EXISTS idx_integration_events_integration_id ON integration_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_event_type ON integration_events(event_type);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);
CREATE INDEX IF NOT EXISTS idx_integration_events_created_at ON integration_events(created_at);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);

-- Task dependencies indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent ON task_dependencies(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_child ON task_dependencies(child_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_type ON task_dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_status ON task_dependencies(status);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_stages_updated_at BEFORE UPDATE ON workflow_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- AUDIT TRIGGER FUNCTIONS
-- =====================================================

-- Function to create audit log entries
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    changed_fields JSONB;
BEGIN
    -- Handle different trigger operations
    IF TG_OP = 'DELETE' THEN
        old_data = to_jsonb(OLD);
        new_data = '{}'::jsonb;
        changed_fields = '[]'::jsonb;
    ELSIF TG_OP = 'INSERT' THEN
        old_data = '{}'::jsonb;
        new_data = to_jsonb(NEW);
        changed_fields = '[]'::jsonb;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data = to_jsonb(OLD);
        new_data = to_jsonb(NEW);
        -- Calculate changed fields
        SELECT jsonb_agg(key) INTO changed_fields
        FROM (
            SELECT key
            FROM jsonb_each(old_data)
            WHERE old_data->key IS DISTINCT FROM new_data->key
        ) AS changed;
    END IF;

    -- Insert audit log entry
    INSERT INTO audit_logs (
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        changed_fields,
        user_id,
        session_id,
        ip_address
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        old_data,
        new_data,
        COALESCE(changed_fields, '[]'::jsonb),
        current_setting('app.current_user_id', true),
        current_setting('app.current_session_id', true),
        inet(current_setting('app.current_ip_address', true))
    );

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ language 'plpgsql';

-- Apply audit triggers to main tables
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_workflows AFTER INSERT OR UPDATE OR DELETE ON workflows
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_integrations AFTER INSERT OR UPDATE OR DELETE ON integrations
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_templates AFTER INSERT OR UPDATE OR DELETE ON templates
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_deployments AFTER INSERT OR UPDATE OR DELETE ON deployments
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for task summary with dependencies
CREATE OR REPLACE VIEW task_summary AS
SELECT 
    t.id,
    t.title,
    t.description,
    t.type,
    t.status,
    t.priority,
    t.complexity_score,
    t.assigned_to,
    t.estimated_hours,
    t.actual_hours,
    t.linear_issue_id,
    t.github_pr_url,
    t.created_at,
    t.updated_at,
    t.completed_at,
    COUNT(td_parent.child_task_id) as dependent_tasks_count,
    COUNT(td_child.parent_task_id) as dependency_count,
    CASE 
        WHEN COUNT(td_child.parent_task_id) = 0 THEN true
        ELSE false
    END as can_start
FROM tasks t
LEFT JOIN task_dependencies td_parent ON t.id = td_parent.parent_task_id AND td_parent.status = 'active'
LEFT JOIN task_dependencies td_child ON t.id = td_child.child_task_id AND td_child.status = 'active'
GROUP BY t.id, t.title, t.description, t.type, t.status, t.priority, t.complexity_score, 
         t.assigned_to, t.estimated_hours, t.actual_hours, t.linear_issue_id, t.github_pr_url,
         t.created_at, t.updated_at, t.completed_at;

-- View for workflow progress
CREATE OR REPLACE VIEW workflow_progress AS
SELECT 
    w.id,
    w.workflow_id,
    w.name,
    w.task_id,
    w.status,
    w.current_stage,
    w.total_stages,
    w.completed_stages,
    CASE 
        WHEN w.total_stages > 0 THEN (w.completed_stages::decimal / w.total_stages * 100)
        ELSE 0
    END as progress_percentage,
    w.started_at,
    w.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(w.completed_at, NOW()) - w.started_at)) as duration_seconds
FROM workflows w;

-- View for integration health
CREATE OR REPLACE VIEW integration_health AS
SELECT 
    i.id,
    i.name,
    i.type,
    i.status,
    i.health_status,
    i.last_health_check,
    i.error_count,
    i.last_error_at,
    CASE 
        WHEN i.last_health_check > NOW() - INTERVAL '5 minutes' THEN 'recent'
        WHEN i.last_health_check > NOW() - INTERVAL '1 hour' THEN 'stale'
        ELSE 'outdated'
    END as health_check_status,
    COUNT(ie.id) as total_events,
    COUNT(CASE WHEN ie.status = 'success' THEN 1 END) as successful_events,
    COUNT(CASE WHEN ie.status = 'failure' THEN 1 END) as failed_events
FROM integrations i
LEFT JOIN integration_events ie ON i.id = ie.integration_id 
    AND ie.created_at > NOW() - INTERVAL '24 hours'
GROUP BY i.id, i.name, i.type, i.status, i.health_status, i.last_health_check, 
         i.error_count, i.last_error_at;

-- =====================================================
-- INITIAL DATA SETUP
-- =====================================================

-- Insert default integrations
INSERT INTO integrations (name, type, description, status) VALUES
('Linear Integration', 'linear', 'Integration with Linear for issue management', 'inactive'),
('AgentAPI Integration', 'agentapi', 'Middleware for Claude Code communication', 'inactive'),
('Claude Code Integration', 'claude_code', 'Automated PR validation and deployment', 'inactive'),
('GitHub Integration', 'github', 'GitHub repository and PR management', 'inactive'),
('Codegen Integration', 'codegen', 'AI-powered code generation', 'inactive')
ON CONFLICT (name) DO NOTHING;

-- Insert default templates
INSERT INTO templates (name, type, description, template_content, category) VALUES
('Code Generation Template', 'code_generation', 'Template for generating code from requirements', 
 'Generate code for the following requirements:\n\n{requirements}\n\nEnsure the code follows best practices and includes proper error handling.', 
 'development'),
('Code Review Template', 'code_review', 'Template for automated code review', 
 'Review the following code changes:\n\n{code_changes}\n\nProvide feedback on:\n- Code quality\n- Security issues\n- Performance concerns\n- Best practices', 
 'review'),
('Testing Template', 'testing', 'Template for generating test cases', 
 'Generate comprehensive test cases for:\n\n{code_or_feature}\n\nInclude:\n- Unit tests\n- Integration tests\n- Edge cases', 
 'testing'),
('Documentation Template', 'documentation', 'Template for generating documentation', 
 'Generate documentation for:\n\n{code_or_feature}\n\nInclude:\n- Overview\n- Usage examples\n- API reference\n- Configuration options', 
 'documentation')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SCHEMA VERSION TRACKING
-- =====================================================

-- Create schema version table
CREATE TABLE IF NOT EXISTS schema_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(255)
);

-- Insert current schema version
INSERT INTO schema_versions (version, description, checksum) VALUES
('1.0.0', 'Initial comprehensive schema for AI-powered CI/CD system', 'sha256:initial')
ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE tasks IS 'Main tasks table storing all task information and metadata';
COMMENT ON TABLE workflows IS 'CI/CD pipeline workflows with stage tracking and execution state';
COMMENT ON TABLE integrations IS 'External service integrations with health monitoring and configuration';
COMMENT ON TABLE logs IS 'Comprehensive system logging for debugging and monitoring';
COMMENT ON TABLE templates IS 'Prompt templates for AI code generation and processing';
COMMENT ON TABLE deployments IS 'Deployment tracking with environment and status management';
COMMENT ON TABLE task_dependencies IS 'Task relationship and dependency management';
COMMENT ON TABLE workflow_stages IS 'Individual stages within workflows with execution tracking';
COMMENT ON TABLE integration_events IS 'Integration usage tracking and event logging';
COMMENT ON TABLE audit_logs IS 'Audit trail for all database changes and user actions';
COMMENT ON TABLE performance_metrics IS 'System performance metrics and monitoring data';

-- =====================================================
-- END OF SCHEMA
-- =====================================================

