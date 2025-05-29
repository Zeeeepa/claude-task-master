-- =====================================================
-- Tasks Schema Definition
-- =====================================================
-- Description: Enhanced tasks table schema for AI CI/CD orchestration system
-- Version: 2.0.0
-- Created: 2025-05-28

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Drop existing tasks table if exists (for clean migration)
-- DROP TABLE IF EXISTS tasks CASCADE;

-- Create enhanced tasks table with CI/CD specific fields
CREATE TABLE IF NOT EXISTS tasks (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Task requirements and criteria
    requirements JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    
    -- Task classification and priority
    complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10) DEFAULT 5,
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Technology stack information
    language VARCHAR(50),
    framework VARCHAR(100),
    testing_framework VARCHAR(100),
    
    -- Repository and CI/CD integration
    repository_url VARCHAR(500),
    branch_name VARCHAR(255),
    pr_number INTEGER,
    pr_url VARCHAR(500),
    codegen_request_id VARCHAR(255),
    
    -- Error handling and retry logic
    error_logs JSONB DEFAULT '[]'::jsonb,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Assignment and hierarchy
    assigned_to VARCHAR(255),
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    workflow_id UUID,
    
    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Additional constraints
    CONSTRAINT tasks_status_check CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed', 'cancelled', 
        'blocked', 'review', 'testing', 'deployed'
    )),
    CONSTRAINT tasks_retry_limit CHECK (retry_count <= 10),
    CONSTRAINT tasks_title_length CHECK (char_length(title) >= 3)
);

-- Create comprehensive indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);
CREATE INDEX IF NOT EXISTS idx_tasks_language ON tasks(language);
CREATE INDEX IF NOT EXISTS idx_tasks_framework ON tasks(framework);
CREATE INDEX IF NOT EXISTS idx_tasks_repository_url ON tasks(repository_url);
CREATE INDEX IF NOT EXISTS idx_tasks_branch_name ON tasks(branch_name);
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);
CREATE INDEX IF NOT EXISTS idx_tasks_codegen_request_id ON tasks(codegen_request_id);
CREATE INDEX IF NOT EXISTS idx_tasks_retry_count ON tasks(retry_count);

-- GIN indexes for JSONB fields for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_requirements_gin ON tasks USING GIN (requirements);
CREATE INDEX IF NOT EXISTS idx_tasks_acceptance_criteria_gin ON tasks USING GIN (acceptance_criteria);
CREATE INDEX IF NOT EXISTS idx_tasks_error_logs_gin ON tasks USING GIN (error_logs);
CREATE INDEX IF NOT EXISTS idx_tasks_metadata_gin ON tasks USING GIN (metadata);

-- Text search indexes for full-text search capabilities
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm ON tasks USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm ON tasks USING GIN (description gin_trgm_ops);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_status ON tasks(parent_task_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_status ON tasks(created_at, status);

-- Partial indexes for active tasks (performance optimization)
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(id, status, priority) 
WHERE status IN ('pending', 'in_progress', 'blocked', 'review', 'testing');

-- Index for failed tasks with retry potential
CREATE INDEX IF NOT EXISTS idx_tasks_failed_retryable ON tasks(id, retry_count, status) 
WHERE status = 'failed' AND retry_count < 10;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic updated_at timestamp
DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON tasks;
CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_tasks_updated_at();

-- Function to validate task status transitions
CREATE OR REPLACE FUNCTION validate_task_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow any transition for new records
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Define valid status transitions
    IF OLD.status = 'pending' AND NEW.status NOT IN ('in_progress', 'cancelled', 'blocked') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
    
    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed', 'failed', 'blocked', 'review', 'testing', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
    
    IF OLD.status = 'completed' AND NEW.status NOT IN ('review', 'testing', 'deployed') THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
    
    -- Set completion timestamp for completed tasks
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;
    
    -- Clear completion timestamp if moving away from completed
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
        NEW.completed_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status transition validation
DROP TRIGGER IF EXISTS trigger_validate_task_status_transition ON tasks;
CREATE TRIGGER trigger_validate_task_status_transition
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_status_transition();

-- Function to prevent circular dependencies
CREATE OR REPLACE FUNCTION prevent_circular_task_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if setting parent would create a circular dependency
    IF NEW.parent_task_id IS NOT NULL THEN
        -- Use recursive CTE to check for cycles
        WITH RECURSIVE task_hierarchy AS (
            -- Base case: start with the new parent
            SELECT NEW.parent_task_id as task_id, 1 as level
            UNION ALL
            -- Recursive case: follow parent relationships
            SELECT t.parent_task_id, th.level + 1
            FROM tasks t
            JOIN task_hierarchy th ON t.id = th.task_id
            WHERE t.parent_task_id IS NOT NULL AND th.level < 10 -- Prevent infinite recursion
        )
        SELECT 1 FROM task_hierarchy WHERE task_id = NEW.id LIMIT 1;
        
        IF FOUND THEN
            RAISE EXCEPTION 'Circular dependency detected: task % cannot be a child of %', NEW.id, NEW.parent_task_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for circular dependency prevention
DROP TRIGGER IF EXISTS trigger_prevent_circular_task_dependency ON tasks;
CREATE TRIGGER trigger_prevent_circular_task_dependency
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION prevent_circular_task_dependency();

-- Create views for common queries

-- Active tasks view with enhanced information
CREATE OR REPLACE VIEW v_active_tasks AS
SELECT 
    t.*,
    CASE 
        WHEN t.status = 'pending' THEN 0
        WHEN t.status = 'in_progress' THEN 50
        WHEN t.status = 'review' THEN 75
        WHEN t.status = 'testing' THEN 85
        WHEN t.status = 'completed' THEN 100
        WHEN t.status = 'deployed' THEN 100
        ELSE 0
    END as progress_percentage,
    EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 as age_hours,
    (SELECT COUNT(*) FROM tasks ct WHERE ct.parent_task_id = t.id) as child_count,
    pt.title as parent_title
FROM tasks t
LEFT JOIN tasks pt ON t.parent_task_id = pt.id
WHERE t.status IN ('pending', 'in_progress', 'blocked', 'review', 'testing');

-- Task statistics view
CREATE OR REPLACE VIEW v_task_statistics AS
SELECT 
    status,
    COUNT(*) as task_count,
    AVG(complexity_score) as avg_complexity,
    MIN(created_at) as oldest_task,
    MAX(created_at) as newest_task,
    COUNT(CASE WHEN retry_count > 0 THEN 1 END) as tasks_with_retries,
    AVG(retry_count) as avg_retry_count
FROM tasks
GROUP BY status;

-- High priority tasks view
CREATE OR REPLACE VIEW v_high_priority_tasks AS
SELECT 
    t.*,
    EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 as age_hours
FROM tasks t
WHERE t.priority IN ('high', 'critical')
    AND t.status NOT IN ('completed', 'cancelled', 'deployed')
ORDER BY 
    CASE t.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        ELSE 3 
    END,
    t.created_at;

-- Failed tasks that can be retried
CREATE OR REPLACE VIEW v_retryable_failed_tasks AS
SELECT 
    t.*,
    10 - t.retry_count as remaining_retries
FROM tasks t
WHERE t.status = 'failed' 
    AND t.retry_count < 10
ORDER BY t.retry_count, t.updated_at;

-- Task hierarchy view (parent-child relationships)
CREATE OR REPLACE VIEW v_task_hierarchy AS
WITH RECURSIVE task_tree AS (
    -- Root tasks (no parent)
    SELECT 
        id, title, parent_task_id, status, 0 as level,
        ARRAY[id] as path,
        id::text as hierarchy_path
    FROM tasks 
    WHERE parent_task_id IS NULL
    
    UNION ALL
    
    -- Child tasks
    SELECT 
        t.id, t.title, t.parent_task_id, t.status, tt.level + 1,
        tt.path || t.id,
        tt.hierarchy_path || ' > ' || t.id::text
    FROM tasks t
    JOIN task_tree tt ON t.parent_task_id = tt.id
    WHERE NOT t.id = ANY(tt.path) -- Prevent infinite recursion
)
SELECT * FROM task_tree ORDER BY hierarchy_path;

-- Comments on tables and columns for documentation
COMMENT ON TABLE tasks IS 'Enhanced tasks table for AI CI/CD orchestration system with comprehensive task management capabilities';
COMMENT ON COLUMN tasks.id IS 'Unique task identifier using UUID';
COMMENT ON COLUMN tasks.title IS 'Human-readable task title (3-255 characters)';
COMMENT ON COLUMN tasks.description IS 'Detailed task description';
COMMENT ON COLUMN tasks.requirements IS 'JSONB array of task requirements';
COMMENT ON COLUMN tasks.acceptance_criteria IS 'JSONB array of acceptance criteria';
COMMENT ON COLUMN tasks.complexity_score IS 'Task complexity rating (1-10 scale)';
COMMENT ON COLUMN tasks.priority IS 'Task priority level (low, medium, high, critical)';
COMMENT ON COLUMN tasks.status IS 'Current task status with workflow states';
COMMENT ON COLUMN tasks.language IS 'Primary programming language for the task';
COMMENT ON COLUMN tasks.framework IS 'Framework or technology stack used';
COMMENT ON COLUMN tasks.testing_framework IS 'Testing framework for validation';
COMMENT ON COLUMN tasks.repository_url IS 'Git repository URL for the task';
COMMENT ON COLUMN tasks.branch_name IS 'Git branch name for task implementation';
COMMENT ON COLUMN tasks.pr_number IS 'Pull request number if applicable';
COMMENT ON COLUMN tasks.pr_url IS 'Pull request URL for code review';
COMMENT ON COLUMN tasks.codegen_request_id IS 'Codegen system request identifier';
COMMENT ON COLUMN tasks.error_logs IS 'JSONB array of error logs and debugging information';
COMMENT ON COLUMN tasks.retry_count IS 'Number of retry attempts (0-10 limit)';
COMMENT ON COLUMN tasks.created_at IS 'Task creation timestamp';
COMMENT ON COLUMN tasks.updated_at IS 'Last modification timestamp (auto-updated)';
COMMENT ON COLUMN tasks.completed_at IS 'Task completion timestamp';
COMMENT ON COLUMN tasks.assigned_to IS 'User or system assigned to the task';
COMMENT ON COLUMN tasks.parent_task_id IS 'Parent task ID for hierarchical relationships';
COMMENT ON COLUMN tasks.workflow_id IS 'Associated workflow identifier';
COMMENT ON COLUMN tasks.metadata IS 'Flexible JSONB metadata storage';

