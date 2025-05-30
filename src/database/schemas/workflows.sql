-- Workflow Management Schema
-- Schema for workflow orchestration and management
-- Version: 1.0.0

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types for workflow management
CREATE TYPE workflow_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed',
    'failed'
);

CREATE TYPE workflow_trigger_type AS ENUM (
    'manual',
    'scheduled',
    'webhook',
    'event_driven'
);

-- Main workflows table
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    github_repo_url TEXT,
    requirements_text TEXT,
    status workflow_status DEFAULT 'draft',
    linear_issue_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Enhanced workflow fields
    version VARCHAR(50) DEFAULT '1.0.0',
    trigger_type workflow_trigger_type DEFAULT 'manual',
    schedule_cron VARCHAR(100),
    timeout_minutes INTEGER DEFAULT 60,
    max_retries INTEGER DEFAULT 3,
    
    -- Configuration and metadata
    configuration JSONB DEFAULT '{}',
    environment_variables JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    
    -- Ownership and permissions
    created_by VARCHAR(255),
    owner VARCHAR(255),
    permissions JSONB DEFAULT '{}',
    
    -- Execution tracking
    last_execution_id UUID,
    last_execution_at TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT valid_timeout CHECK (timeout_minutes > 0 AND timeout_minutes <= 1440),
    CONSTRAINT valid_retries CHECK (max_retries >= 0 AND max_retries <= 10),
    CONSTRAINT valid_github_url CHECK (
        github_repo_url IS NULL OR 
        github_repo_url ~ '^https://github\.com/[^/]+/[^/]+/?$'
    ),
    CONSTRAINT unique_workflow_name UNIQUE (name)
);

-- Workflow executions table for tracking execution history
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Execution details
    status workflow_status DEFAULT 'active',
    trigger_type workflow_trigger_type DEFAULT 'manual',
    triggered_by VARCHAR(255),
    trigger_data JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL GENERATED ALWAYS AS (completed_at - started_at) STORED,
    
    -- Results and metrics
    result_data JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    logs TEXT,
    
    -- Task tracking
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    failed_tasks INTEGER DEFAULT 0,
    
    -- Resource usage
    memory_usage_mb INTEGER,
    cpu_time_ms INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_execution_timing CHECK (
        (started_at IS NOT NULL) AND
        (completed_at IS NULL OR completed_at >= started_at)
    ),
    CONSTRAINT valid_task_counts CHECK (
        total_tasks >= 0 AND
        completed_tasks >= 0 AND
        failed_tasks >= 0 AND
        (completed_tasks + failed_tasks) <= total_tasks
    )
);

-- Workflow steps table for defining workflow structure
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Step definition
    name VARCHAR(255) NOT NULL,
    description TEXT,
    step_type VARCHAR(100) NOT NULL, -- 'task_creation', 'execution', 'validation', 'notification'
    order_index INTEGER NOT NULL,
    
    -- Step configuration
    configuration JSONB DEFAULT '{}',
    input_schema JSONB DEFAULT '{}',
    output_schema JSONB DEFAULT '{}',
    
    -- Conditional execution
    condition_expression TEXT,
    depends_on_steps JSONB DEFAULT '[]', -- Array of step IDs this step depends on
    
    -- Error handling
    on_failure VARCHAR(50) DEFAULT 'stop', -- 'stop', 'continue', 'retry'
    retry_count INTEGER DEFAULT 0,
    timeout_minutes INTEGER DEFAULT 30,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_workflow_step_order UNIQUE (workflow_id, order_index),
    CONSTRAINT unique_workflow_step_name UNIQUE (workflow_id, name),
    CONSTRAINT valid_step_order CHECK (order_index >= 0),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 5),
    CONSTRAINT valid_step_timeout CHECK (timeout_minutes > 0 AND timeout_minutes <= 240)
);

-- Workflow step executions for tracking individual step execution
CREATE TABLE workflow_step_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    
    -- Execution details
    status workflow_status DEFAULT 'active',
    attempt_number INTEGER DEFAULT 1,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL GENERATED ALWAYS AS (completed_at - started_at) STORED,
    
    -- Input/Output
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    logs TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_step_execution_timing CHECK (
        (started_at IS NOT NULL) AND
        (completed_at IS NULL OR completed_at >= started_at)
    ),
    CONSTRAINT valid_attempt_number CHECK (attempt_number > 0)
);

-- Indexes for performance optimization
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);
CREATE INDEX idx_workflows_updated_at ON workflows(updated_at);
CREATE INDEX idx_workflows_owner ON workflows(owner);
CREATE INDEX idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX idx_workflows_linear_issue_id ON workflows(linear_issue_id);
CREATE INDEX idx_workflows_metadata_gin ON workflows USING gin(metadata);
CREATE INDEX idx_workflows_tags_gin ON workflows USING gin(tags);

CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_workflow_executions_triggered_by ON workflow_executions(triggered_by);

CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_order_index ON workflow_steps(order_index);
CREATE INDEX idx_workflow_steps_step_type ON workflow_steps(step_type);
CREATE INDEX idx_workflow_steps_is_active ON workflow_steps(is_active);

CREATE INDEX idx_workflow_step_executions_workflow_execution_id ON workflow_step_executions(workflow_execution_id);
CREATE INDEX idx_workflow_step_executions_workflow_step_id ON workflow_step_executions(workflow_step_id);
CREATE INDEX idx_workflow_step_executions_status ON workflow_step_executions(status);
CREATE INDEX idx_workflow_step_executions_started_at ON workflow_step_executions(started_at);

-- Full-text search indexes
CREATE INDEX idx_workflows_name_fts ON workflows USING gin(to_tsvector('english', name));
CREATE INDEX idx_workflows_description_fts ON workflows USING gin(to_tsvector('english', description));
CREATE INDEX idx_workflows_requirements_fts ON workflows USING gin(to_tsvector('english', requirements_text));

-- Apply updated_at triggers
CREATE TRIGGER update_workflows_updated_at 
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_steps_updated_at 
    BEFORE UPDATE ON workflow_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update workflow execution statistics trigger
CREATE OR REPLACE FUNCTION update_workflow_execution_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update execution count
        UPDATE workflows 
        SET 
            execution_count = execution_count + 1,
            last_execution_id = NEW.id,
            last_execution_at = NEW.started_at
        WHERE id = NEW.workflow_id;
        
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Update success/failure counts when execution completes
        IF NEW.status = 'completed' THEN
            UPDATE workflows 
            SET success_count = success_count + 1
            WHERE id = NEW.workflow_id;
        ELSIF NEW.status = 'failed' THEN
            UPDATE workflows 
            SET failure_count = failure_count + 1
            WHERE id = NEW.workflow_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflow_stats_trigger
    AFTER INSERT OR UPDATE ON workflow_executions
    FOR EACH ROW EXECUTE FUNCTION update_workflow_execution_stats();

-- Views for common queries
CREATE VIEW active_workflows AS
SELECT 
    w.*,
    COUNT(we.id) as total_executions,
    COUNT(CASE WHEN we.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN we.status = 'failed' THEN 1 END) as failed_executions,
    MAX(we.started_at) as last_execution_time,
    COUNT(ws.id) as step_count,
    COUNT(CASE WHEN ws.is_active = true THEN 1 END) as active_steps
FROM workflows w
LEFT JOIN workflow_executions we ON w.id = we.workflow_id
LEFT JOIN workflow_steps ws ON w.id = ws.workflow_id
WHERE w.status IN ('draft', 'active', 'paused')
GROUP BY w.id;

CREATE VIEW workflow_execution_summary AS
SELECT 
    we.id,
    we.workflow_id,
    w.name as workflow_name,
    we.status,
    we.trigger_type,
    we.triggered_by,
    we.started_at,
    we.completed_at,
    we.duration,
    we.total_tasks,
    we.completed_tasks,
    we.failed_tasks,
    CASE 
        WHEN we.total_tasks = 0 THEN 0
        ELSE ROUND((we.completed_tasks::DECIMAL / we.total_tasks) * 100, 2)
    END as completion_percentage,
    COUNT(wse.id) as step_executions,
    COUNT(CASE WHEN wse.status = 'completed' THEN 1 END) as completed_steps,
    COUNT(CASE WHEN wse.status = 'failed' THEN 1 END) as failed_steps
FROM workflow_executions we
JOIN workflows w ON we.workflow_id = w.id
LEFT JOIN workflow_step_executions wse ON we.id = wse.workflow_execution_id
GROUP BY we.id, w.name, we.status, we.trigger_type, we.triggered_by, 
         we.started_at, we.completed_at, we.duration, we.total_tasks, 
         we.completed_tasks, we.failed_tasks;

CREATE VIEW workflow_performance_metrics AS
SELECT 
    w.id,
    w.name,
    w.status,
    w.execution_count,
    w.success_count,
    w.failure_count,
    CASE 
        WHEN w.execution_count = 0 THEN 0
        ELSE ROUND((w.success_count::DECIMAL / w.execution_count) * 100, 2)
    END as success_rate,
    AVG(EXTRACT(EPOCH FROM we.duration)) as avg_duration_seconds,
    MIN(EXTRACT(EPOCH FROM we.duration)) as min_duration_seconds,
    MAX(EXTRACT(EPOCH FROM we.duration)) as max_duration_seconds,
    AVG(we.total_tasks) as avg_tasks_per_execution,
    w.last_execution_at,
    COUNT(ws.id) as total_steps
FROM workflows w
LEFT JOIN workflow_executions we ON w.id = we.workflow_id AND we.status = 'completed'
LEFT JOIN workflow_steps ws ON w.id = ws.workflow_id
GROUP BY w.id, w.name, w.status, w.execution_count, w.success_count, 
         w.failure_count, w.last_execution_at;

-- Comments for documentation
COMMENT ON TABLE workflows IS 'Main workflows table for orchestrating task execution and management';
COMMENT ON TABLE workflow_executions IS 'Execution history and tracking for workflow runs';
COMMENT ON TABLE workflow_steps IS 'Individual steps that make up a workflow';
COMMENT ON TABLE workflow_step_executions IS 'Execution tracking for individual workflow steps';

COMMENT ON COLUMN workflows.configuration IS 'JSONB field for workflow-specific configuration and settings';
COMMENT ON COLUMN workflows.environment_variables IS 'JSONB field for environment variables used in workflow execution';
COMMENT ON COLUMN workflows.metadata IS 'JSONB field for flexible workflow attributes and custom data';
COMMENT ON COLUMN workflows.linear_issue_id IS 'Reference to Linear issue for tracking and integration';
COMMENT ON COLUMN workflows.github_repo_url IS 'GitHub repository URL for code integration and deployment';

COMMENT ON VIEW active_workflows IS 'View showing active workflows with execution statistics';
COMMENT ON VIEW workflow_execution_summary IS 'Summary view of workflow executions with progress metrics';
COMMENT ON VIEW workflow_performance_metrics IS 'Performance metrics and analytics for workflows';

