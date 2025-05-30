-- Migration: 001_task_components
-- Description: Comprehensive database schema for task composition components
-- Version: 1.0.0
-- Created: 2025-05-30
-- 
-- This migration creates the complete database schema for the task management system
-- including tasks, workflows, dependencies, and all related tables with proper
-- relationships, indexes, and constraints.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

-- Task-related types
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed'
);

-- Workflow-related types
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

-- Dependency-related types
CREATE TYPE dependency_type AS ENUM (
    'blocks',      -- Blocking dependency
    'requires',    -- Required dependency
    'suggests'     -- Suggested dependency
);

CREATE TYPE dependency_status AS ENUM (
    'pending',     -- Dependency not yet satisfied
    'satisfied',   -- Dependency has been satisfied
    'failed',      -- Dependency failed
    'skipped'      -- Dependency was skipped
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Workflows table (must be created first due to foreign key references)
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

-- Main tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    complexity_score INTEGER DEFAULT 0,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    -- Additional fields for enhanced task management
    estimated_duration INTERVAL,
    actual_duration INTERVAL,
    assigned_to VARCHAR(255),
    tags JSONB DEFAULT '[]',
    requirements JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT valid_complexity CHECK (complexity_score >= 0 AND complexity_score <= 100),
    CONSTRAINT no_self_parent CHECK (id != parent_task_id)
);

-- Subtasks table for hierarchical task management
CREATE TABLE subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional subtask fields
    estimated_duration INTERVAL,
    actual_duration INTERVAL,
    assigned_to VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_order_index CHECK (order_index >= 0),
    CONSTRAINT unique_subtask_order UNIQUE (parent_task_id, order_index)
);

-- Task dependencies table
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type dependency_type DEFAULT 'blocks',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Enhanced dependency fields
    description TEXT,
    status dependency_status DEFAULT 'pending',
    satisfied_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Conditional dependencies
    condition_expression TEXT,
    condition_metadata JSONB DEFAULT '{}',
    
    -- Priority and ordering
    priority INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    
    -- Metadata and configuration
    metadata JSONB DEFAULT '{}',
    configuration JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
    CONSTRAINT unique_task_dependency UNIQUE (task_id, depends_on_task_id),
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT valid_order_index CHECK (order_index >= 0),
    CONSTRAINT valid_status_timing CHECK (
        (status = 'pending' AND satisfied_at IS NULL AND failed_at IS NULL) OR
        (status = 'satisfied' AND satisfied_at IS NOT NULL AND failed_at IS NULL) OR
        (status = 'failed' AND failed_at IS NOT NULL AND satisfied_at IS NULL) OR
        (status = 'skipped')
    )
);

-- Task files table for generated content
CREATE TABLE task_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_content TEXT,
    file_type VARCHAR(100),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Additional file metadata
    file_size INTEGER,
    checksum VARCHAR(64),
    encoding VARCHAR(50) DEFAULT 'utf-8',
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT unique_task_file_path UNIQUE (task_id, file_path),
    CONSTRAINT valid_file_size CHECK (file_size IS NULL OR file_size >= 0)
);

-- ============================================================================
-- WORKFLOW EXECUTION TABLES
-- ============================================================================

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
    step_type VARCHAR(100) NOT NULL,
    order_index INTEGER NOT NULL,
    
    -- Step configuration
    configuration JSONB DEFAULT '{}',
    input_schema JSONB DEFAULT '{}',
    output_schema JSONB DEFAULT '{}',
    
    -- Conditional execution
    condition_expression TEXT,
    depends_on_steps JSONB DEFAULT '[]',
    
    -- Error handling
    on_failure VARCHAR(50) DEFAULT 'stop',
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

-- ============================================================================
-- EXTERNAL DEPENDENCIES
-- ============================================================================

-- External dependencies table for non-task dependencies
CREATE TABLE external_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- External dependency details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dependency_type dependency_type DEFAULT 'requires',
    external_type VARCHAR(100) NOT NULL,
    
    -- Connection and validation details
    endpoint_url TEXT,
    validation_method VARCHAR(50),
    validation_config JSONB DEFAULT '{}',
    
    -- Status tracking
    status dependency_status DEFAULT 'pending',
    last_checked_at TIMESTAMP WITH TIME ZONE,
    satisfied_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Retry and timeout configuration
    max_retries INTEGER DEFAULT 3,
    retry_interval_seconds INTEGER DEFAULT 30,
    timeout_seconds INTEGER DEFAULT 60,
    current_retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_max_retries CHECK (max_retries >= 0 AND max_retries <= 10),
    CONSTRAINT valid_retry_interval CHECK (retry_interval_seconds > 0),
    CONSTRAINT valid_timeout CHECK (timeout_seconds > 0),
    CONSTRAINT valid_current_retries CHECK (current_retry_count >= 0 AND current_retry_count <= max_retries),
    CONSTRAINT unique_task_external_dependency UNIQUE (task_id, name)
);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to check for circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Use recursive CTE to detect circular dependencies
    WITH RECURSIVE dependency_chain AS (
        -- Start with the new dependency
        SELECT 
            NEW.task_id as original_task,
            NEW.depends_on_task_id as current_task,
            1 as depth,
            ARRAY[NEW.task_id, NEW.depends_on_task_id] as path
        
        UNION ALL
        
        -- Follow the dependency chain
        SELECT 
            dc.original_task,
            td.depends_on_task_id,
            dc.depth + 1,
            dc.path || td.depends_on_task_id
        FROM dependency_chain dc
        JOIN task_dependencies td ON dc.current_task = td.task_id
        WHERE dc.depth < 50 -- Prevent infinite recursion
          AND NOT (td.depends_on_task_id = ANY(dc.path)) -- Avoid cycles in path
    )
    SELECT 1 FROM dependency_chain 
    WHERE current_task = original_task
    LIMIT 1;
    
    -- If we found a circular dependency, raise an error
    IF FOUND THEN
        RAISE EXCEPTION 'Circular dependency detected: Task % would create a dependency cycle', NEW.task_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to automatically update dependency status
CREATE OR REPLACE FUNCTION update_dependency_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When a task is completed, mark dependencies as satisfied
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE task_dependencies 
        SET 
            status = 'satisfied',
            satisfied_at = NOW()
        WHERE depends_on_task_id = NEW.id 
          AND status = 'pending';
    
    -- When a task fails, mark blocking dependencies as failed
    ELSIF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
        UPDATE task_dependencies 
        SET 
            status = 'failed',
            failed_at = NOW()
        WHERE depends_on_task_id = NEW.id 
          AND status = 'pending'
          AND dependency_type = 'blocks';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update workflow execution statistics
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

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE TRIGGER update_workflows_updated_at 
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subtasks_updated_at 
    BEFORE UPDATE ON subtasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_steps_updated_at 
    BEFORE UPDATE ON workflow_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_dependencies_updated_at 
    BEFORE UPDATE ON external_dependencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Business logic triggers
CREATE TRIGGER check_circular_dependency_trigger
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION check_circular_dependency();

CREATE TRIGGER update_dependency_status_trigger
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_dependency_status();

CREATE TRIGGER update_workflow_stats_trigger
    AFTER INSERT OR UPDATE ON workflow_executions
    FOR EACH ROW EXECUTE FUNCTION update_workflow_execution_stats();

-- ============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Workflows indexes
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);
CREATE INDEX idx_workflows_updated_at ON workflows(updated_at);
CREATE INDEX idx_workflows_owner ON workflows(owner);
CREATE INDEX idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX idx_workflows_linear_issue_id ON workflows(linear_issue_id);
CREATE INDEX idx_workflows_metadata_gin ON workflows USING gin(metadata);
CREATE INDEX idx_workflows_tags_gin ON workflows USING gin(tags);

-- Tasks indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_metadata_gin ON tasks USING gin(metadata);
CREATE INDEX idx_tasks_tags_gin ON tasks USING gin(tags);
CREATE INDEX idx_tasks_requirements_gin ON tasks USING gin(requirements);

-- Subtasks indexes
CREATE INDEX idx_subtasks_parent_task_id ON subtasks(parent_task_id);
CREATE INDEX idx_subtasks_status ON subtasks(status);
CREATE INDEX idx_subtasks_order_index ON subtasks(order_index);
CREATE INDEX idx_subtasks_created_at ON subtasks(created_at);

-- Task dependencies indexes
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_dependency_type ON task_dependencies(dependency_type);
CREATE INDEX idx_task_dependencies_status ON task_dependencies(status);
CREATE INDEX idx_task_dependencies_priority ON task_dependencies(priority);
CREATE INDEX idx_task_dependencies_created_at ON task_dependencies(created_at);

-- Task files indexes
CREATE INDEX idx_task_files_task_id ON task_files(task_id);
CREATE INDEX idx_task_files_file_type ON task_files(file_type);
CREATE INDEX idx_task_files_generated_at ON task_files(generated_at);
CREATE INDEX idx_task_files_path_trgm ON task_files USING gin(file_path gin_trgm_ops);

-- Workflow execution indexes
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_workflow_executions_triggered_by ON workflow_executions(triggered_by);

-- External dependencies indexes
CREATE INDEX idx_external_dependencies_task_id ON external_dependencies(task_id);
CREATE INDEX idx_external_dependencies_external_type ON external_dependencies(external_type);
CREATE INDEX idx_external_dependencies_status ON external_dependencies(status);
CREATE INDEX idx_external_dependencies_last_checked_at ON external_dependencies(last_checked_at);

-- Full-text search indexes
CREATE INDEX idx_tasks_title_fts ON tasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_tasks_description_fts ON tasks USING gin(to_tsvector('english', description));
CREATE INDEX idx_workflows_name_fts ON workflows USING gin(to_tsvector('english', name));
CREATE INDEX idx_workflows_description_fts ON workflows USING gin(to_tsvector('english', description));

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active tasks view
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    COUNT(st.id) as subtask_count,
    COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
    COUNT(tf.id) as file_count,
    w.name as workflow_name
FROM tasks t
LEFT JOIN subtasks st ON t.id = st.parent_task_id
LEFT JOIN task_files tf ON t.id = tf.task_id
LEFT JOIN workflows w ON t.workflow_id = w.id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id, w.name;

-- Task dependency summary view
CREATE VIEW task_dependency_summary AS
SELECT 
    t.id as task_id,
    t.title as task_title,
    t.status as task_status,
    COUNT(td_out.id) as dependencies_count,
    COUNT(CASE WHEN td_out.status = 'satisfied' THEN 1 END) as satisfied_dependencies,
    COUNT(CASE WHEN td_out.status = 'failed' THEN 1 END) as failed_dependencies,
    COUNT(CASE WHEN td_out.status = 'pending' THEN 1 END) as pending_dependencies,
    COUNT(td_in.id) as dependents_count,
    COUNT(ed.id) as external_dependencies_count,
    CASE 
        WHEN COUNT(td_out.id) + COUNT(ed.id) = 0 THEN true
        ELSE COUNT(CASE WHEN td_out.status = 'satisfied' THEN 1 END) + 
             COUNT(CASE WHEN ed.status = 'satisfied' THEN 1 END) = 
             COUNT(td_out.id) + COUNT(ed.id)
    END as all_dependencies_satisfied
FROM tasks t
LEFT JOIN task_dependencies td_out ON t.id = td_out.task_id
LEFT JOIN task_dependencies td_in ON t.id = td_in.depends_on_task_id
LEFT JOIN external_dependencies ed ON t.id = ed.task_id
GROUP BY t.id, t.title, t.status;

-- Workflow execution summary view
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
    END as completion_percentage
FROM workflow_executions we
JOIN workflows w ON we.workflow_id = w.id;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE workflows IS 'Main workflows table for orchestrating task execution and management';
COMMENT ON TABLE tasks IS 'Main tasks table for task composition and management';
COMMENT ON TABLE subtasks IS 'Hierarchical subtasks for breaking down complex tasks';
COMMENT ON TABLE task_dependencies IS 'Task-to-task dependencies for managing execution order';
COMMENT ON TABLE task_files IS 'Generated files and content associated with tasks';
COMMENT ON TABLE workflow_executions IS 'Execution history and tracking for workflow runs';
COMMENT ON TABLE external_dependencies IS 'External dependencies on services, APIs, and resources';

COMMENT ON COLUMN tasks.metadata IS 'JSONB field for flexible task attributes and custom data';
COMMENT ON COLUMN tasks.requirements IS 'JSONB field for task requirements and specifications';
COMMENT ON COLUMN tasks.context IS 'JSONB field for execution context and environment data';
COMMENT ON COLUMN workflows.linear_issue_id IS 'Reference to Linear issue for tracking and integration';
COMMENT ON COLUMN workflows.github_repo_url IS 'GitHub repository URL for code integration';

-- Migration completed successfully
-- This migration creates a comprehensive database schema for task composition
-- components with proper relationships, constraints, indexes, and views.

