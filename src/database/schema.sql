-- =====================================================
-- Claude Task Master - Unified AI CI/CD Database Schema
-- =====================================================
-- PostgreSQL 14+ Compatible Schema
-- Supports workflows, tasks, components, logs, and system state management
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_stat_statements for performance monitoring
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    permissions JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- WORKFLOWS TABLE
-- =====================================================
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL CHECK (type IN ('ci_cd', 'deployment', 'testing', 'monitoring', 'custom')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    
    -- Workflow definition and configuration
    definition JSONB NOT NULL DEFAULT '{}',
    configuration JSONB DEFAULT '{}',
    environment_variables JSONB DEFAULT '{}',
    
    -- Metadata
    version INTEGER DEFAULT 1,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Relationships
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    parent_workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Timing
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    timeout_seconds INTEGER DEFAULT 3600,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TASKS TABLE
-- =====================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL CHECK (type IN ('code_generation', 'testing', 'deployment', 'validation', 'monitoring', 'custom')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    
    -- Task execution details
    command TEXT,
    parameters JSONB DEFAULT '{}',
    environment JSONB DEFAULT '{}',
    working_directory TEXT,
    
    -- Dependencies and ordering
    depends_on UUID[] DEFAULT '{}',
    execution_order INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Results and output
    result JSONB,
    output TEXT,
    error_message TEXT,
    exit_code INTEGER,
    
    -- Timing
    estimated_duration_seconds INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    timeout_seconds INTEGER DEFAULT 1800,
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Relationships
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- COMPONENTS TABLE
-- =====================================================
CREATE TABLE components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(100) NOT NULL CHECK (type IN ('orchestrator', 'database', 'monitoring', 'codegen_sdk', 'claude_code', 'agent_api', 'linear', 'wsl2', 'nlp', 'custom')),
    status VARCHAR(50) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'maintenance', 'error', 'unknown')),
    version VARCHAR(50),
    
    -- Component configuration
    configuration JSONB DEFAULT '{}',
    endpoints JSONB DEFAULT '{}',
    health_check_url TEXT,
    
    -- Health and performance metrics
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'degraded', 'unknown')),
    performance_metrics JSONB DEFAULT '{}',
    
    -- Dependencies
    dependencies TEXT[] DEFAULT '{}',
    dependent_components TEXT[] DEFAULT '{}',
    
    -- Metadata
    description TEXT,
    documentation_url TEXT,
    repository_url TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LOGS TABLE
-- =====================================================
CREATE TABLE logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    message TEXT NOT NULL,
    
    -- Context
    component_name VARCHAR(255),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Additional data
    data JSONB DEFAULT '{}',
    stack_trace TEXT,
    request_id VARCHAR(255),
    session_id VARCHAR(255),
    
    -- Source information
    source_file VARCHAR(500),
    source_line INTEGER,
    source_function VARCHAR(255),
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexing hints
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CONFIGURATIONS TABLE
-- =====================================================
CREATE TABLE configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    type VARCHAR(50) DEFAULT 'system' CHECK (type IN ('system', 'user', 'component', 'workflow', 'environment')),
    
    -- Metadata
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    is_readonly BOOLEAN DEFAULT false,
    validation_schema JSONB,
    
    -- Scope and access
    scope VARCHAR(100) DEFAULT 'global',
    component_name VARCHAR(255),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    previous_value JSONB,
    
    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- WORKFLOW_EXECUTIONS TABLE
-- =====================================================
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    execution_number INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    
    -- Execution context
    triggered_by VARCHAR(100) CHECK (triggered_by IN ('manual', 'scheduled', 'webhook', 'api', 'dependency')),
    trigger_data JSONB DEFAULT '{}',
    environment JSONB DEFAULT '{}',
    
    -- Results
    result JSONB,
    error_message TEXT,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Relationships
    triggered_by_user UUID REFERENCES users(id) ON DELETE SET NULL,
    parent_execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(workflow_id, execution_number)
);

-- =====================================================
-- TASK_EXECUTIONS TABLE
-- =====================================================
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    workflow_execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    execution_number INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
    
    -- Execution details
    command_executed TEXT,
    parameters_used JSONB DEFAULT '{}',
    environment_used JSONB DEFAULT '{}',
    
    -- Results
    result JSONB,
    output TEXT,
    error_message TEXT,
    exit_code INTEGER,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Retry information
    retry_attempt INTEGER DEFAULT 0,
    is_retry BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(task_id, workflow_execution_id, execution_number)
);

-- =====================================================
-- SYSTEM_METRICS TABLE
-- =====================================================
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary')),
    value NUMERIC NOT NULL,
    unit VARCHAR(50),
    
    -- Context
    component_name VARCHAR(255),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Labels and dimensions
    labels JSONB DEFAULT '{}',
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Retention hint
    retention_days INTEGER DEFAULT 30
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Workflows indexes
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_type ON workflows(type);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);
CREATE INDEX idx_workflows_parent_workflow_id ON workflows(parent_workflow_id);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);
CREATE INDEX idx_workflows_priority ON workflows(priority);

-- Tasks indexes
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_execution_order ON tasks(execution_order);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- Components indexes
CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_type ON components(type);
CREATE INDEX idx_components_status ON components(status);
CREATE INDEX idx_components_health_status ON components(health_status);

-- Logs indexes
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_component_name ON logs(component_name);
CREATE INDEX idx_logs_workflow_id ON logs(workflow_id);
CREATE INDEX idx_logs_task_id ON logs(task_id);
CREATE INDEX idx_logs_user_id ON logs(user_id);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_request_id ON logs(request_id);

-- Configurations indexes
CREATE INDEX idx_configurations_key ON configurations(key);
CREATE INDEX idx_configurations_type ON configurations(type);
CREATE INDEX idx_configurations_scope ON configurations(scope);
CREATE INDEX idx_configurations_component_name ON configurations(component_name);
CREATE INDEX idx_configurations_user_id ON configurations(user_id);

-- Workflow executions indexes
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_triggered_by ON workflow_executions(triggered_by);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_workflow_executions_parent_execution_id ON workflow_executions(parent_execution_id);

-- Task executions indexes
CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_task_executions_workflow_execution_id ON task_executions(workflow_execution_id);
CREATE INDEX idx_task_executions_status ON task_executions(status);
CREATE INDEX idx_task_executions_started_at ON task_executions(started_at);

-- System metrics indexes
CREATE INDEX idx_system_metrics_metric_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_metric_type ON system_metrics(metric_type);
CREATE INDEX idx_system_metrics_component_name ON system_metrics(component_name);
CREATE INDEX idx_system_metrics_workflow_id ON system_metrics(workflow_id);
CREATE INDEX idx_system_metrics_task_id ON system_metrics(task_id);
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp);

-- Composite indexes for common queries
CREATE INDEX idx_workflows_status_created_at ON workflows(status, created_at);
CREATE INDEX idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX idx_logs_component_level_timestamp ON logs(component_name, level, timestamp);
CREATE INDEX idx_system_metrics_name_timestamp ON system_metrics(metric_name, timestamp);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_executions_updated_at BEFORE UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_executions_updated_at BEFORE UPDATE ON task_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Active workflows with task counts
CREATE VIEW active_workflows_summary AS
SELECT 
    w.id,
    w.name,
    w.type,
    w.status,
    w.priority,
    w.created_at,
    w.started_at,
    COUNT(t.id) as total_tasks,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_tasks,
    COUNT(CASE WHEN t.status = 'running' THEN 1 END) as running_tasks
FROM workflows w
LEFT JOIN tasks t ON w.id = t.workflow_id
WHERE w.status IN ('active', 'running')
GROUP BY w.id, w.name, w.type, w.status, w.priority, w.created_at, w.started_at;

-- System health overview
CREATE VIEW system_health_overview AS
SELECT 
    c.type as component_type,
    COUNT(*) as total_components,
    COUNT(CASE WHEN c.health_status = 'healthy' THEN 1 END) as healthy_count,
    COUNT(CASE WHEN c.health_status = 'unhealthy' THEN 1 END) as unhealthy_count,
    COUNT(CASE WHEN c.health_status = 'degraded' THEN 1 END) as degraded_count,
    COUNT(CASE WHEN c.health_status = 'unknown' THEN 1 END) as unknown_count
FROM components c
GROUP BY c.type;

-- Recent error logs
CREATE VIEW recent_error_logs AS
SELECT 
    l.id,
    l.level,
    l.message,
    l.component_name,
    l.workflow_id,
    l.task_id,
    l.timestamp,
    w.name as workflow_name,
    t.name as task_name
FROM logs l
LEFT JOIN workflows w ON l.workflow_id = w.id
LEFT JOIN tasks t ON l.task_id = t.id
WHERE l.level IN ('error', 'fatal')
AND l.timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY l.timestamp DESC;

-- =====================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- =====================================================

-- Function to get workflow progress
CREATE OR REPLACE FUNCTION get_workflow_progress(workflow_uuid UUID)
RETURNS TABLE(
    total_tasks INTEGER,
    completed_tasks INTEGER,
    failed_tasks INTEGER,
    running_tasks INTEGER,
    pending_tasks INTEGER,
    progress_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::INTEGER as completed_tasks,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END)::INTEGER as failed_tasks,
        COUNT(CASE WHEN t.status = 'running' THEN 1 END)::INTEGER as running_tasks,
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END)::INTEGER as pending_tasks,
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        END as progress_percentage
    FROM tasks t
    WHERE t.workflow_id = workflow_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old logs
CREATE OR REPLACE FUNCTION clean_old_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM logs 
    WHERE timestamp < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old metrics
CREATE OR REPLACE FUNCTION clean_old_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_metrics 
    WHERE timestamp < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL SYSTEM CONFIGURATIONS
-- =====================================================

-- Insert default system configurations
INSERT INTO configurations (key, value, type, description, is_readonly) VALUES
('system.version', '"1.0.0"', 'system', 'System version', true),
('system.environment', '"development"', 'system', 'System environment', false),
('database.max_connections', '100', 'system', 'Maximum database connections', false),
('monitoring.enabled', 'true', 'system', 'Enable system monitoring', false),
('logging.level', '"info"', 'system', 'Default logging level', false),
('backup.enabled', 'true', 'system', 'Enable automated backups', false),
('backup.retention_days', '30', 'system', 'Backup retention period in days', false),
('metrics.retention_days', '30', 'system', 'Metrics retention period in days', false),
('logs.retention_days', '30', 'system', 'Logs retention period in days', false);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE users IS 'User accounts and authentication information';
COMMENT ON TABLE workflows IS 'Workflow definitions and metadata';
COMMENT ON TABLE tasks IS 'Individual tasks within workflows';
COMMENT ON TABLE components IS 'System components and their health status';
COMMENT ON TABLE logs IS 'System and application logs';
COMMENT ON TABLE configurations IS 'System and user configurations';
COMMENT ON TABLE workflow_executions IS 'Workflow execution instances';
COMMENT ON TABLE task_executions IS 'Task execution instances';
COMMENT ON TABLE system_metrics IS 'System performance and monitoring metrics';

-- =====================================================
-- SCHEMA VALIDATION
-- =====================================================

-- Verify all tables were created successfully
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name IN ('users', 'workflows', 'tasks', 'components', 'logs', 'configurations', 'workflow_executions', 'task_executions', 'system_metrics');
    
    IF table_count = 9 THEN
        RAISE NOTICE 'Database schema created successfully. All % tables are present.', table_count;
    ELSE
        RAISE EXCEPTION 'Database schema creation failed. Expected 9 tables, found %.', table_count;
    END IF;
END $$;

