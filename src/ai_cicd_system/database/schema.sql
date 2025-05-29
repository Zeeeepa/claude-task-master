-- TaskMaster Workflow Orchestration Database Schema
-- Consolidated from PR #63 with workflow-specific enhancements
-- Supports workflow state management, task orchestration, and validation tracking

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ============================================================================
-- WORKFLOW ORCHESTRATION TABLES
-- ============================================================================

-- Workflow Definitions Table
CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    definition JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Workflow Executions Table
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id VARCHAR(100) NOT NULL UNIQUE,
    workflow_id VARCHAR(100) NOT NULL REFERENCES workflow_definitions(workflow_id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    context JSONB DEFAULT '{}'::jsonb,
    result JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    parent_execution_id UUID REFERENCES workflow_executions(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Workflow States Table (for pause/resume functionality)
CREATE TABLE workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    step_id VARCHAR(100) NOT NULL,
    step_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    step_result JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    agent_used VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TASK MANAGEMENT TABLES (Enhanced from PR #63)
-- ============================================================================

-- Tasks Table
CREATE TABLE tasks (
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
    workflow_execution_id UUID REFERENCES workflow_executions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Task Contexts Table
CREATE TABLE task_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    file_path VARCHAR(500),
    line_start INTEGER,
    line_end INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Task Dependencies Table
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_task_id, child_task_id)
);

-- ============================================================================
-- VALIDATION AND ERROR TRACKING TABLES
-- ============================================================================

-- Validation Results Table
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
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
    agent_used VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Error Logs Table (Enhanced)
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    validation_result_id UUID REFERENCES validation_results(id) ON DELETE SET NULL,
    workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- USER MANAGEMENT TABLES
-- ============================================================================

-- User Roles Table
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users Table
CREATE TABLE users (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- AGENT MANAGEMENT TABLES
-- ============================================================================

-- Agent Instances Table
CREATE TABLE agent_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_name VARCHAR(100) NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    capabilities JSONB DEFAULT '[]'::jsonb,
    configuration JSONB DEFAULT '{}'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Executions Table
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_instance_id UUID NOT NULL REFERENCES agent_instances(id),
    workflow_state_id UUID REFERENCES workflow_states(id),
    task_id UUID REFERENCES tasks(id),
    execution_type VARCHAR(50) NOT NULL,
    request_data JSONB DEFAULT '{}'::jsonb,
    response_data JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Workflow Indexes
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_workflow_states_execution_id ON workflow_states(execution_id);
CREATE INDEX idx_workflow_states_step_status ON workflow_states(step_status);

-- Task Indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_workflow_execution_id ON tasks(workflow_execution_id);
CREATE INDEX idx_task_contexts_task_id ON task_contexts(task_id);
CREATE INDEX idx_task_contexts_context_type ON task_contexts(context_type);

-- Validation Indexes
CREATE INDEX idx_validation_results_task_id ON validation_results(task_id);
CREATE INDEX idx_validation_results_workflow_execution_id ON validation_results(workflow_execution_id);
CREATE INDEX idx_validation_results_validation_type ON validation_results(validation_type);
CREATE INDEX idx_validation_results_validation_status ON validation_results(validation_status);
CREATE INDEX idx_validation_results_started_at ON validation_results(started_at);

-- Error Indexes
CREATE INDEX idx_error_logs_error_category ON error_logs(error_category);
CREATE INDEX idx_error_logs_error_severity ON error_logs(error_severity);
CREATE INDEX idx_error_logs_resolution_status ON error_logs(resolution_status);
CREATE INDEX idx_error_logs_first_occurred_at ON error_logs(first_occurred_at);
CREATE INDEX idx_error_logs_workflow_execution_id ON error_logs(workflow_execution_id);

-- Agent Indexes
CREATE INDEX idx_agent_instances_agent_name ON agent_instances(agent_name);
CREATE INDEX idx_agent_instances_status ON agent_instances(status);
CREATE INDEX idx_agent_instances_health_status ON agent_instances(health_status);
CREATE INDEX idx_agent_executions_agent_instance_id ON agent_executions(agent_instance_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);
CREATE INDEX idx_agent_executions_started_at ON agent_executions(started_at);

-- User Indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_is_active ON users(is_active);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active Workflows View
CREATE VIEW active_workflows AS
SELECT
    we.*,
    wd.name as workflow_name,
    wd.description as workflow_description,
    COUNT(ws.id) as total_steps,
    COUNT(CASE WHEN ws.step_status = 'completed' THEN 1 END) as completed_steps,
    COUNT(CASE WHEN ws.step_status = 'failed' THEN 1 END) as failed_steps
FROM workflow_executions we
JOIN workflow_definitions wd ON we.workflow_id = wd.workflow_id
LEFT JOIN workflow_states ws ON we.id = ws.execution_id
WHERE we.status IN ('pending', 'running', 'paused')
GROUP BY we.id, wd.name, wd.description;

-- Active Tasks View
CREATE VIEW active_tasks AS
SELECT
    t.*,
    COUNT(tc.id) as context_count,
    COUNT(td_parent.child_task_id) as child_task_count,
    COUNT(td_child.parent_task_id) as dependency_count,
    we.workflow_id,
    we.status as workflow_status
FROM tasks t
LEFT JOIN task_contexts tc ON t.id = tc.task_id
LEFT JOIN task_dependencies td_parent ON t.id = td_parent.parent_task_id
LEFT JOIN task_dependencies td_child ON t.id = td_child.child_task_id
LEFT JOIN workflow_executions we ON t.workflow_execution_id = we.id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id, we.workflow_id, we.status;

-- Workflow Performance View
CREATE VIEW workflow_performance AS
SELECT
    wd.workflow_id,
    wd.name,
    COUNT(we.id) as total_executions,
    COUNT(CASE WHEN we.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN we.status = 'failed' THEN 1 END) as failed_executions,
    AVG(we.duration_ms) as avg_duration_ms,
    MIN(we.duration_ms) as min_duration_ms,
    MAX(we.duration_ms) as max_duration_ms,
    AVG(CASE WHEN we.status = 'completed' THEN we.duration_ms END) as avg_success_duration_ms
FROM workflow_definitions wd
LEFT JOIN workflow_executions we ON wd.workflow_id = we.workflow_id
WHERE we.started_at >= NOW() - INTERVAL '30 days'
GROUP BY wd.workflow_id, wd.name;

-- Agent Performance View
CREATE VIEW agent_performance AS
SELECT
    ai.agent_name,
    ai.agent_type,
    COUNT(ae.id) as total_executions,
    COUNT(CASE WHEN ae.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN ae.status = 'failed' THEN 1 END) as failed_executions,
    AVG(ae.duration_ms) as avg_duration_ms,
    ai.health_status,
    ai.last_health_check
FROM agent_instances ai
LEFT JOIN agent_executions ae ON ai.id = ae.agent_instance_id
WHERE ae.started_at >= NOW() - INTERVAL '24 hours' OR ae.started_at IS NULL
GROUP BY ai.id, ai.agent_name, ai.agent_type, ai.health_status, ai.last_health_check;

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_workflow_definitions_updated_at BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_states_updated_at BEFORE UPDATE ON workflow_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_validation_results_updated_at BEFORE UPDATE ON validation_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_error_logs_updated_at BEFORE UPDATE ON error_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_instances_updated_at BEFORE UPDATE ON agent_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate workflow execution duration
CREATE OR REPLACE FUNCTION calculate_workflow_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply duration calculation triggers
CREATE TRIGGER calculate_workflow_execution_duration BEFORE UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION calculate_workflow_duration();
CREATE TRIGGER calculate_workflow_state_duration BEFORE UPDATE ON workflow_states FOR EACH ROW EXECUTE FUNCTION calculate_workflow_duration();
CREATE TRIGGER calculate_agent_execution_duration BEFORE UPDATE ON agent_executions FOR EACH ROW EXECUTE FUNCTION calculate_workflow_duration();

-- ============================================================================
-- INITIAL DATA SETUP
-- ============================================================================

-- Insert default user roles
INSERT INTO user_roles (role_name, role_description, permissions) VALUES
('admin', 'Full system access', '["*"]'::jsonb),
('developer', 'Task and validation access', '["tasks:read", "tasks:write", "validations:read", "validations:write", "workflows:read", "workflows:execute", "errors:read"]'::jsonb),
('operator', 'Workflow execution access', '["workflows:read", "workflows:execute", "workflows:pause", "workflows:resume", "tasks:read"]'::jsonb),
('viewer', 'Read-only access', '["tasks:read", "validations:read", "workflows:read", "errors:read"]'::jsonb),
('api_client', 'External integration access', '["tasks:read", "tasks:write", "validations:write", "workflows:execute"]'::jsonb);

-- Insert default agent instances
INSERT INTO agent_instances (agent_name, agent_type, endpoint, capabilities) VALUES
('claude-code-primary', 'claude-code', 'http://localhost:3001', '["code_analysis", "validation", "testing", "documentation"]'::jsonb),
('codegen-primary', 'codegen', 'http://localhost:3002', '["code_generation", "pr_creation", "natural_language_processing"]'::jsonb),
('aider-primary', 'aider', 'http://localhost:3003', '["code_editing", "refactoring", "linting"]'::jsonb),
('goose-primary', 'goose', 'http://localhost:3004', '["security_scanning", "dependency_analysis"]'::jsonb);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic examples - should be customized based on requirements)
CREATE POLICY workflow_access_policy ON workflow_executions
    FOR ALL
    USING (true); -- Placeholder - implement proper access control

CREATE POLICY task_access_policy ON tasks
    FOR ALL
    USING (true); -- Placeholder - implement proper access control

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE workflow_definitions IS 'Stores workflow definitions and their configurations';
COMMENT ON TABLE workflow_executions IS 'Tracks individual workflow execution instances';
COMMENT ON TABLE workflow_states IS 'Stores state of individual workflow steps for pause/resume functionality';
COMMENT ON TABLE tasks IS 'Core task management with workflow integration';
COMMENT ON TABLE validation_results IS 'Results from Claude Code and other validation agents';
COMMENT ON TABLE error_logs IS 'Comprehensive error tracking and resolution history';
COMMENT ON TABLE agent_instances IS 'Registered agent instances and their capabilities';
COMMENT ON TABLE agent_executions IS 'Individual agent execution tracking';

COMMENT ON COLUMN workflow_executions.status IS 'Workflow status: pending, running, paused, completed, failed, cancelled';
COMMENT ON COLUMN workflow_states.step_status IS 'Step status: pending, running, completed, failed, skipped';
COMMENT ON COLUMN tasks.status IS 'Task status: pending, in_progress, completed, failed, cancelled';
COMMENT ON COLUMN validation_results.validation_type IS 'Type: syntax, security, performance, style, testing, integration, deployment, compliance, documentation';
COMMENT ON COLUMN error_logs.error_severity IS 'Severity: low, medium, high, critical';
COMMENT ON COLUMN agent_instances.health_status IS 'Health: healthy, degraded, unhealthy, unknown';

