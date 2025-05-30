-- Task Management Schema
-- Schema for task and subtask management with hierarchical support
-- Version: 1.0.0

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types for task management
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress', 
    'completed',
    'failed',
    'blocked',
    'cancelled'
);

CREATE TYPE dependency_type AS ENUM (
    'blocks',
    'requires',
    'suggests'
);

CREATE TYPE dependency_status AS ENUM (
    'pending',
    'satisfied',
    'failed',
    'cancelled'
);

-- Main tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 5 CHECK (priority >= 0 AND priority <= 10),
    complexity_score INTEGER DEFAULT 50 CHECK (complexity_score >= 0 AND complexity_score <= 100),
    
    -- Hierarchical support
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL, -- Will reference workflows table
    
    -- Assignment and ownership
    assigned_to VARCHAR(255),
    created_by VARCHAR(255),
    
    -- Timing
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    due_date TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Flexible metadata
    tags JSONB DEFAULT '[]',
    requirements JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT valid_complexity CHECK (complexity_score >= 0 AND complexity_score <= 100),
    CONSTRAINT valid_timing CHECK (
        (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at) AND
        (due_date IS NULL OR created_at <= due_date)
    )
);

-- Subtasks table for ordered task breakdown
CREATE TABLE subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    order_index INTEGER NOT NULL DEFAULT 0,
    
    -- Assignment
    assigned_to VARCHAR(255),
    
    -- Timing
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_subtask_order UNIQUE (parent_task_id, order_index),
    CONSTRAINT valid_subtask_order CHECK (order_index >= 0)
);

-- Task dependencies for complex workflows
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type dependency_type DEFAULT 'blocks',
    status dependency_status DEFAULT 'pending',
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
    CONSTRAINT unique_task_dependency UNIQUE (task_id, depends_on_task_id, dependency_type)
);

-- Task files for generated content
CREATE TABLE task_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    content_hash VARCHAR(64),
    
    -- Content metadata
    content_type VARCHAR(100),
    encoding VARCHAR(50) DEFAULT 'utf-8',
    
    -- File status
    is_generated BOOLEAN DEFAULT true,
    is_validated BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_task_file_path UNIQUE (task_id, file_path),
    CONSTRAINT valid_file_size CHECK (file_size >= 0)
);

-- External dependencies for tasks
CREATE TABLE external_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    external_type VARCHAR(100) NOT NULL, -- 'api', 'service', 'resource', 'tool'
    endpoint_url TEXT,
    status dependency_status DEFAULT 'pending',
    
    -- Validation settings
    validation_method VARCHAR(100), -- 'http_check', 'ping', 'custom'
    validation_config JSONB DEFAULT '{}',
    timeout_seconds INTEGER DEFAULT 30,
    retry_count INTEGER DEFAULT 3,
    
    -- Health check results
    last_check_at TIMESTAMP WITH TIME ZONE,
    last_check_status VARCHAR(50),
    last_check_response JSONB DEFAULT '{}',
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_timeout CHECK (timeout_seconds > 0 AND timeout_seconds <= 300),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 10)
);

-- Dependency validation tracking
CREATE TABLE dependency_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_dependency_id UUID REFERENCES task_dependencies(id) ON DELETE CASCADE,
    external_dependency_id UUID REFERENCES external_dependencies(id) ON DELETE CASCADE,
    validation_type VARCHAR(100) NOT NULL,
    is_satisfied BOOLEAN DEFAULT false,
    
    -- Validation details
    validation_data JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT one_dependency_type CHECK (
        (task_dependency_id IS NOT NULL AND external_dependency_id IS NULL) OR
        (task_dependency_id IS NULL AND external_dependency_id IS NOT NULL)
    )
);

-- Dependency resolution rules
CREATE TABLE dependency_resolution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    rule_type VARCHAR(100) NOT NULL, -- 'auto_resolve', 'manual_review', 'skip'
    condition_expression TEXT,
    action_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_tags_gin ON tasks USING gin(tags);
CREATE INDEX idx_tasks_requirements_gin ON tasks USING gin(requirements);
CREATE INDEX idx_tasks_context_gin ON tasks USING gin(context);
CREATE INDEX idx_tasks_metadata_gin ON tasks USING gin(metadata);

CREATE INDEX idx_subtasks_parent_task_id ON subtasks(parent_task_id);
CREATE INDEX idx_subtasks_status ON subtasks(status);
CREATE INDEX idx_subtasks_order_index ON subtasks(order_index);
CREATE INDEX idx_subtasks_assigned_to ON subtasks(assigned_to);

CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_status ON task_dependencies(status);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

CREATE INDEX idx_task_files_task_id ON task_files(task_id);
CREATE INDEX idx_task_files_file_type ON task_files(file_type);
CREATE INDEX idx_task_files_is_generated ON task_files(is_generated);
CREATE INDEX idx_task_files_generated_at ON task_files(generated_at);

CREATE INDEX idx_external_dependencies_task_id ON external_dependencies(task_id);
CREATE INDEX idx_external_dependencies_status ON external_dependencies(status);
CREATE INDEX idx_external_dependencies_external_type ON external_dependencies(external_type);
CREATE INDEX idx_external_dependencies_last_check_at ON external_dependencies(last_check_at);

-- Full-text search indexes
CREATE INDEX idx_tasks_title_fts ON tasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_tasks_description_fts ON tasks USING gin(to_tsvector('english', description));
CREATE INDEX idx_subtasks_title_fts ON subtasks USING gin(to_tsvector('english', title));

-- Composite indexes for common queries
CREATE INDEX idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority DESC);
CREATE INDEX idx_tasks_assigned_status ON tasks(assigned_to, status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subtasks_updated_at 
    BEFORE UPDATE ON subtasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_dependencies_updated_at 
    BEFORE UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_files_updated_at 
    BEFORE UPDATE ON task_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_dependencies_updated_at 
    BEFORE UPDATE ON external_dependencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to prevent circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if adding this dependency would create a cycle
    IF EXISTS (
        WITH RECURSIVE dependency_chain AS (
            -- Start with the new dependency
            SELECT NEW.depends_on_task_id as task_id, NEW.task_id as depends_on_task_id, 1 as depth
            
            UNION ALL
            
            -- Follow the chain of dependencies
            SELECT td.task_id, dc.depends_on_task_id, dc.depth + 1
            FROM task_dependencies td
            JOIN dependency_chain dc ON td.depends_on_task_id = dc.task_id
            WHERE dc.depth < 50 -- Prevent infinite recursion
        )
        SELECT 1 FROM dependency_chain 
        WHERE task_id = depends_on_task_id
    ) THEN
        RAISE EXCEPTION 'Circular dependency detected: Task % cannot depend on task % as it would create a cycle', 
            NEW.task_id, NEW.depends_on_task_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER check_circular_dependency_trigger
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION check_circular_dependency();

-- Function to update dependency status when tasks complete
CREATE OR REPLACE FUNCTION update_dependency_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When a task is completed, mark dependencies as satisfied
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE task_dependencies 
        SET status = 'satisfied', updated_at = NOW()
        WHERE depends_on_task_id = NEW.id AND status = 'pending';
    END IF;
    
    -- When a task fails, mark dependencies as failed
    IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
        UPDATE task_dependencies 
        SET status = 'failed', updated_at = NOW()
        WHERE depends_on_task_id = NEW.id AND status = 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_dependency_status_trigger
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_dependency_status();

-- Views for common queries
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    COUNT(st.id) as subtask_count,
    COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
    COUNT(td.id) as dependency_count,
    COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) as satisfied_dependencies,
    CASE 
        WHEN COUNT(td.id) = 0 THEN true
        WHEN COUNT(td.id) = COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) THEN true
        ELSE false
    END as is_ready
FROM tasks t
LEFT JOIN subtasks st ON t.id = st.parent_task_id
LEFT JOIN task_dependencies td ON t.id = td.task_id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id;

CREATE VIEW task_dependency_summary AS
SELECT 
    t.id,
    t.title,
    t.status,
    COUNT(td.id) as total_dependencies,
    COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) as satisfied_dependencies,
    COUNT(CASE WHEN td.status = 'pending' THEN 1 END) as pending_dependencies,
    COUNT(CASE WHEN td.status = 'failed' THEN 1 END) as failed_dependencies,
    CASE 
        WHEN COUNT(td.id) = 0 THEN 'no_dependencies'
        WHEN COUNT(td.id) = COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) THEN 'all_satisfied'
        WHEN COUNT(CASE WHEN td.status = 'failed' THEN 1 END) > 0 THEN 'has_failed'
        ELSE 'has_pending'
    END as dependency_status
FROM tasks t
LEFT JOIN task_dependencies td ON t.id = td.task_id
GROUP BY t.id, t.title, t.status;

-- Comments for documentation
COMMENT ON TABLE tasks IS 'Main tasks table with hierarchical support and flexible metadata';
COMMENT ON TABLE subtasks IS 'Ordered subtasks for task breakdown and detailed tracking';
COMMENT ON TABLE task_dependencies IS 'Task-to-task dependencies with circular dependency prevention';
COMMENT ON TABLE task_files IS 'Generated files and content associated with tasks';
COMMENT ON TABLE external_dependencies IS 'External service and resource dependencies for tasks';

COMMENT ON COLUMN tasks.requirements IS 'JSONB field for task requirements and specifications';
COMMENT ON COLUMN tasks.context IS 'JSONB field for task execution context and environment';
COMMENT ON COLUMN tasks.metadata IS 'JSONB field for flexible task attributes and custom data';
COMMENT ON COLUMN tasks.tags IS 'JSONB array field for task categorization and filtering';

COMMENT ON VIEW active_tasks IS 'View showing active tasks with subtask and dependency summaries';
COMMENT ON VIEW task_dependency_summary IS 'Summary view of task dependencies and their status';

