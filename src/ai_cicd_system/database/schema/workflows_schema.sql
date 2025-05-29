-- =====================================================
-- Workflows Schema Definition
-- =====================================================
-- Description: Comprehensive workflows table schema for AI CI/CD orchestration system
-- Version: 2.0.0
-- Created: 2025-05-28

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create workflows table for complex multi-step CI/CD processes
CREATE TABLE IF NOT EXISTS workflows (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Workflow state and control
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active', 'paused', 'completed', 'failed', 'cancelled', 'archived'
    )),
    
    -- Trigger configuration
    trigger_type VARCHAR(100) CHECK (trigger_type IN (
        'manual', 'webhook', 'schedule', 'event', 'dependency', 'api', 'git_push', 'pr_created', 'pr_merged'
    )),
    trigger_config JSONB DEFAULT '{}'::jsonb,
    
    -- Workflow steps and execution
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step INTEGER DEFAULT 0 CHECK (current_step >= 0),
    total_steps INTEGER DEFAULT 0 CHECK (total_steps >= 0),
    
    -- Execution timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 10),
    
    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Workflow configuration
    timeout_minutes INTEGER DEFAULT 60 CHECK (timeout_minutes > 0),
    max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional constraints
    CONSTRAINT workflows_name_length CHECK (char_length(name) >= 3),
    CONSTRAINT workflows_current_step_valid CHECK (current_step <= total_steps),
    CONSTRAINT workflows_completion_logic CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR 
        (status != 'completed' AND completed_at IS NULL)
    )
);

-- Create comprehensive indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at);
CREATE INDEX IF NOT EXISTS idx_workflows_started_at ON workflows(started_at);
CREATE INDEX IF NOT EXISTS idx_workflows_completed_at ON workflows(completed_at);
CREATE INDEX IF NOT EXISTS idx_workflows_current_step ON workflows(current_step);
CREATE INDEX IF NOT EXISTS idx_workflows_retry_count ON workflows(retry_count);

-- GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_config_gin ON workflows USING GIN (trigger_config);
CREATE INDEX IF NOT EXISTS idx_workflows_steps_gin ON workflows USING GIN (steps);
CREATE INDEX IF NOT EXISTS idx_workflows_metadata_gin ON workflows USING GIN (metadata);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_workflows_name_trgm ON workflows USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_workflows_description_trgm ON workflows USING GIN (description gin_trgm_ops);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflows_status_trigger ON workflows(status, trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflows_status_created ON workflows(status, created_at);
CREATE INDEX IF NOT EXISTS idx_workflows_active_current_step ON workflows(current_step, total_steps) 
WHERE status IN ('active', 'paused');

-- Partial indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(id, status, current_step) 
WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_workflows_failed_retryable ON workflows(id, retry_count, status) 
WHERE status = 'failed' AND retry_count < max_retries;

-- Create workflow execution steps table for detailed step tracking
CREATE TABLE IF NOT EXISTS workflow_execution_steps (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Step identification
    step_number INTEGER NOT NULL CHECK (step_number >= 0),
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL CHECK (step_type IN (
        'task_creation', 'code_generation', 'validation', 'testing', 'deployment', 
        'notification', 'approval', 'conditional', 'parallel', 'sequential'
    )),
    
    -- Step configuration
    step_config JSONB DEFAULT '{}'::jsonb,
    
    -- Execution state
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'
    )),
    
    -- Execution results
    result JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    
    -- Timing information
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    
    -- Dependencies
    depends_on_steps INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(workflow_id, step_number),
    CONSTRAINT workflow_execution_steps_timing_logic CHECK (
        (status IN ('completed', 'failed') AND completed_at IS NOT NULL) OR 
        (status NOT IN ('completed', 'failed'))
    )
);

-- Indexes for workflow execution steps
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_workflow_id ON workflow_execution_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_step_number ON workflow_execution_steps(step_number);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_status ON workflow_execution_steps(status);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_step_type ON workflow_execution_steps(step_type);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_started_at ON workflow_execution_steps(started_at);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_workflow_step ON workflow_execution_steps(workflow_id, step_number);

-- GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_config_gin ON workflow_execution_steps USING GIN (step_config);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_result_gin ON workflow_execution_steps USING GIN (result);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_output_gin ON workflow_execution_steps USING GIN (output_data);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_error_gin ON workflow_execution_steps USING GIN (error_details);

-- Function to update updated_at timestamp for workflows
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp for workflow execution steps
CREATE OR REPLACE FUNCTION update_workflow_execution_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updated_at timestamps
DROP TRIGGER IF EXISTS trigger_workflows_updated_at ON workflows;
CREATE TRIGGER trigger_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_workflows_updated_at();

DROP TRIGGER IF EXISTS trigger_workflow_execution_steps_updated_at ON workflow_execution_steps;
CREATE TRIGGER trigger_workflow_execution_steps_updated_at
    BEFORE UPDATE ON workflow_execution_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_execution_steps_updated_at();

-- Function to automatically update workflow progress
CREATE OR REPLACE FUNCTION update_workflow_progress()
RETURNS TRIGGER AS $$
DECLARE
    workflow_rec RECORD;
    completed_steps INTEGER;
    total_steps INTEGER;
BEGIN
    -- Get workflow information
    SELECT * INTO workflow_rec FROM workflows WHERE id = NEW.workflow_id;
    
    -- Count completed steps
    SELECT COUNT(*) INTO completed_steps 
    FROM workflow_execution_steps 
    WHERE workflow_id = NEW.workflow_id AND status = 'completed';
    
    -- Get total steps
    SELECT COUNT(*) INTO total_steps 
    FROM workflow_execution_steps 
    WHERE workflow_id = NEW.workflow_id;
    
    -- Update workflow current_step and total_steps
    UPDATE workflows 
    SET 
        current_step = completed_steps,
        total_steps = total_steps,
        updated_at = NOW()
    WHERE id = NEW.workflow_id;
    
    -- Check if workflow is completed
    IF completed_steps = total_steps AND total_steps > 0 THEN
        UPDATE workflows 
        SET 
            status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.workflow_id AND status != 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update workflow progress when steps complete
DROP TRIGGER IF EXISTS trigger_update_workflow_progress ON workflow_execution_steps;
CREATE TRIGGER trigger_update_workflow_progress
    AFTER UPDATE ON workflow_execution_steps
    FOR EACH ROW
    WHEN (OLD.status != NEW.status)
    EXECUTE FUNCTION update_workflow_progress();

-- Function to calculate step duration
CREATE OR REPLACE FUNCTION calculate_step_duration()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate duration when step completes
    IF NEW.status IN ('completed', 'failed') AND NEW.started_at IS NOT NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, NOW()) - NEW.started_at)) * 1000;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate step duration
DROP TRIGGER IF EXISTS trigger_calculate_step_duration ON workflow_execution_steps;
CREATE TRIGGER trigger_calculate_step_duration
    BEFORE UPDATE ON workflow_execution_steps
    FOR EACH ROW
    EXECUTE FUNCTION calculate_step_duration();

-- Create views for common workflow queries

-- Active workflows view with progress information
CREATE OR REPLACE VIEW v_active_workflows AS
SELECT 
    w.*,
    CASE 
        WHEN w.total_steps = 0 THEN 0
        ELSE ROUND((w.current_step::DECIMAL / w.total_steps) * 100, 2)
    END as progress_percentage,
    EXTRACT(EPOCH FROM (NOW() - w.started_at))/60 as runtime_minutes,
    (SELECT COUNT(*) FROM workflow_execution_steps wes 
     WHERE wes.workflow_id = w.id AND wes.status = 'failed') as failed_steps,
    (SELECT COUNT(*) FROM workflow_execution_steps wes 
     WHERE wes.workflow_id = w.id AND wes.status = 'running') as running_steps
FROM workflows w
WHERE w.status IN ('active', 'paused');

-- Workflow statistics view
CREATE OR REPLACE VIEW v_workflow_statistics AS
SELECT 
    status,
    trigger_type,
    COUNT(*) as workflow_count,
    AVG(total_steps) as avg_total_steps,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_duration_minutes,
    COUNT(CASE WHEN retry_count > 0 THEN 1 END) as workflows_with_retries,
    AVG(retry_count) as avg_retry_count
FROM workflows
GROUP BY status, trigger_type;

-- Failed workflows that can be retried
CREATE OR REPLACE VIEW v_retryable_failed_workflows AS
SELECT 
    w.*,
    w.max_retries - w.retry_count as remaining_retries,
    EXTRACT(EPOCH FROM (NOW() - w.updated_at))/60 as minutes_since_failure
FROM workflows w
WHERE w.status = 'failed' 
    AND w.retry_count < w.max_retries
ORDER BY w.retry_count, w.updated_at;

-- Workflow execution timeline view
CREATE OR REPLACE VIEW v_workflow_execution_timeline AS
SELECT 
    w.id as workflow_id,
    w.name as workflow_name,
    w.status as workflow_status,
    wes.step_number,
    wes.step_name,
    wes.step_type,
    wes.status as step_status,
    wes.started_at,
    wes.completed_at,
    wes.duration_ms,
    wes.error_message
FROM workflows w
LEFT JOIN workflow_execution_steps wes ON w.id = wes.workflow_id
ORDER BY w.created_at DESC, wes.step_number;

-- Long running workflows view
CREATE OR REPLACE VIEW v_long_running_workflows AS
SELECT 
    w.*,
    EXTRACT(EPOCH FROM (NOW() - w.started_at))/60 as runtime_minutes,
    w.timeout_minutes,
    CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - w.started_at))/60 > w.timeout_minutes THEN true
        ELSE false
    END as is_timed_out
FROM workflows w
WHERE w.status IN ('active', 'paused')
    AND EXTRACT(EPOCH FROM (NOW() - w.started_at))/60 > 30 -- Running for more than 30 minutes
ORDER BY runtime_minutes DESC;

-- Comments on tables and columns for documentation
COMMENT ON TABLE workflows IS 'Comprehensive workflows table for AI CI/CD orchestration system with multi-step process management';
COMMENT ON COLUMN workflows.id IS 'Unique workflow identifier using UUID';
COMMENT ON COLUMN workflows.name IS 'Human-readable workflow name (3-255 characters)';
COMMENT ON COLUMN workflows.description IS 'Detailed workflow description';
COMMENT ON COLUMN workflows.status IS 'Current workflow status (active, paused, completed, failed, cancelled, archived)';
COMMENT ON COLUMN workflows.trigger_type IS 'Type of trigger that initiated the workflow';
COMMENT ON COLUMN workflows.trigger_config IS 'JSONB configuration for the workflow trigger';
COMMENT ON COLUMN workflows.steps IS 'JSONB array defining workflow steps and configuration';
COMMENT ON COLUMN workflows.current_step IS 'Current step number in execution (0-based)';
COMMENT ON COLUMN workflows.total_steps IS 'Total number of steps in the workflow';
COMMENT ON COLUMN workflows.started_at IS 'Workflow execution start timestamp';
COMMENT ON COLUMN workflows.completed_at IS 'Workflow completion timestamp';
COMMENT ON COLUMN workflows.error_message IS 'Error message if workflow failed';
COMMENT ON COLUMN workflows.retry_count IS 'Number of retry attempts (0-10 limit)';
COMMENT ON COLUMN workflows.metadata IS 'Flexible JSONB metadata storage';
COMMENT ON COLUMN workflows.timeout_minutes IS 'Workflow timeout in minutes';
COMMENT ON COLUMN workflows.max_retries IS 'Maximum number of retry attempts allowed';

COMMENT ON TABLE workflow_execution_steps IS 'Detailed tracking of individual workflow step execution';
COMMENT ON COLUMN workflow_execution_steps.workflow_id IS 'Reference to parent workflow';
COMMENT ON COLUMN workflow_execution_steps.step_number IS 'Sequential step number within workflow';
COMMENT ON COLUMN workflow_execution_steps.step_name IS 'Human-readable step name';
COMMENT ON COLUMN workflow_execution_steps.step_type IS 'Type of step (task_creation, code_generation, etc.)';
COMMENT ON COLUMN workflow_execution_steps.step_config IS 'JSONB configuration for the step';
COMMENT ON COLUMN workflow_execution_steps.status IS 'Current step status';
COMMENT ON COLUMN workflow_execution_steps.result IS 'JSONB result data from step execution';
COMMENT ON COLUMN workflow_execution_steps.output_data IS 'JSONB output data produced by the step';
COMMENT ON COLUMN workflow_execution_steps.duration_ms IS 'Step execution duration in milliseconds';
COMMENT ON COLUMN workflow_execution_steps.depends_on_steps IS 'Array of step numbers this step depends on';
COMMENT ON COLUMN workflow_execution_steps.error_details IS 'JSONB detailed error information';

