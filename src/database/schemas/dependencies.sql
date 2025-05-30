-- Task Dependencies Schema
-- Schema for managing task dependencies and relationships
-- Version: 1.0.0

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types for dependency management
CREATE TYPE dependency_type AS ENUM (
    'blocks',      -- Blocking dependency - dependent task cannot start until dependency is complete
    'requires',    -- Required dependency - dependent task needs dependency to be available
    'suggests'     -- Suggested dependency - dependency is recommended but not required
);

CREATE TYPE dependency_status AS ENUM (
    'pending',     -- Dependency not yet satisfied
    'satisfied',   -- Dependency has been satisfied
    'failed',      -- Dependency failed and cannot be satisfied
    'skipped'      -- Dependency was skipped or bypassed
);

-- Main task dependencies table
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

-- External dependencies table for non-task dependencies
CREATE TABLE external_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- External dependency details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dependency_type dependency_type DEFAULT 'requires',
    external_type VARCHAR(100) NOT NULL, -- 'api', 'service', 'file', 'environment', 'resource'
    
    -- Connection and validation details
    endpoint_url TEXT,
    validation_method VARCHAR(50), -- 'http_check', 'file_exists', 'command', 'custom'
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

-- Dependency validation history for tracking checks
CREATE TABLE dependency_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference to dependency (either task or external)
    task_dependency_id UUID REFERENCES task_dependencies(id) ON DELETE CASCADE,
    external_dependency_id UUID REFERENCES external_dependencies(id) ON DELETE CASCADE,
    
    -- Validation details
    validation_type VARCHAR(100) NOT NULL,
    validation_method VARCHAR(100),
    
    -- Results
    is_satisfied BOOLEAN NOT NULL,
    validation_data JSONB DEFAULT '{}',
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL GENERATED ALWAYS AS (completed_at - started_at) STORED,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT require_dependency_reference CHECK (
        (task_dependency_id IS NOT NULL AND external_dependency_id IS NULL) OR
        (task_dependency_id IS NULL AND external_dependency_id IS NOT NULL)
    ),
    CONSTRAINT valid_validation_timing CHECK (
        (started_at IS NOT NULL) AND
        (completed_at IS NULL OR completed_at >= started_at)
    )
);

-- Dependency resolution rules for complex dependency logic
CREATE TABLE dependency_resolution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rule identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(100) NOT NULL, -- 'conditional', 'aggregate', 'custom'
    
    -- Rule definition
    condition_expression TEXT NOT NULL,
    action_on_true VARCHAR(100) DEFAULT 'satisfy', -- 'satisfy', 'fail', 'skip', 'retry'
    action_on_false VARCHAR(100) DEFAULT 'pending',
    
    -- Rule scope
    applies_to_tasks JSONB DEFAULT '[]', -- Array of task IDs or patterns
    applies_to_dependency_types JSONB DEFAULT '[]', -- Array of dependency types
    
    -- Rule configuration
    configuration JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Status and lifecycle
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    
    -- Constraints
    CONSTRAINT unique_rule_name UNIQUE (name),
    CONSTRAINT valid_rule_priority CHECK (priority >= 0 AND priority <= 10)
);

-- Indexes for performance optimization
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_dependency_type ON task_dependencies(dependency_type);
CREATE INDEX idx_task_dependencies_status ON task_dependencies(status);
CREATE INDEX idx_task_dependencies_priority ON task_dependencies(priority);
CREATE INDEX idx_task_dependencies_created_at ON task_dependencies(created_at);
CREATE INDEX idx_task_dependencies_metadata_gin ON task_dependencies USING gin(metadata);

CREATE INDEX idx_external_dependencies_task_id ON external_dependencies(task_id);
CREATE INDEX idx_external_dependencies_external_type ON external_dependencies(external_type);
CREATE INDEX idx_external_dependencies_status ON external_dependencies(status);
CREATE INDEX idx_external_dependencies_last_checked_at ON external_dependencies(last_checked_at);
CREATE INDEX idx_external_dependencies_name ON external_dependencies(name);

CREATE INDEX idx_dependency_validations_task_dependency_id ON dependency_validations(task_dependency_id);
CREATE INDEX idx_dependency_validations_external_dependency_id ON dependency_validations(external_dependency_id);
CREATE INDEX idx_dependency_validations_validation_type ON dependency_validations(validation_type);
CREATE INDEX idx_dependency_validations_is_satisfied ON dependency_validations(is_satisfied);
CREATE INDEX idx_dependency_validations_started_at ON dependency_validations(started_at);

CREATE INDEX idx_dependency_resolution_rules_rule_type ON dependency_resolution_rules(rule_type);
CREATE INDEX idx_dependency_resolution_rules_is_active ON dependency_resolution_rules(is_active);
CREATE INDEX idx_dependency_resolution_rules_priority ON dependency_resolution_rules(priority);

-- Apply updated_at triggers
CREATE TRIGGER update_external_dependencies_updated_at 
    BEFORE UPDATE ON external_dependencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dependency_resolution_rules_updated_at 
    BEFORE UPDATE ON dependency_resolution_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Apply circular dependency check trigger
CREATE TRIGGER check_circular_dependency_trigger
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION check_circular_dependency();

-- Function to automatically update dependency status based on dependent task status
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
    
    -- When a task fails, mark dependencies as failed
    ELSIF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
        UPDATE task_dependencies 
        SET 
            status = 'failed',
            failed_at = NOW()
        WHERE depends_on_task_id = NEW.id 
          AND status = 'pending'
          AND dependency_type = 'blocks'; -- Only blocking dependencies fail
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply dependency status update trigger
CREATE TRIGGER update_dependency_status_trigger
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_dependency_status();

-- Views for common dependency queries
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
    COUNT(CASE WHEN ed.status = 'satisfied' THEN 1 END) as satisfied_external_dependencies,
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

CREATE VIEW dependency_graph AS
SELECT 
    td.id,
    td.task_id,
    t1.title as task_title,
    t1.status as task_status,
    td.depends_on_task_id,
    t2.title as dependency_title,
    t2.status as dependency_status,
    td.dependency_type,
    td.status as dependency_status_check,
    td.priority,
    td.description,
    td.created_at
FROM task_dependencies td
JOIN tasks t1 ON td.task_id = t1.id
JOIN tasks t2 ON td.depends_on_task_id = t2.id
ORDER BY td.priority DESC, td.created_at;

CREATE VIEW blocked_tasks AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.priority,
    COUNT(td.id) as blocking_dependencies,
    STRING_AGG(t2.title, ', ' ORDER BY td.priority DESC) as blocked_by_tasks,
    MIN(td.created_at) as oldest_dependency_created
FROM tasks t
JOIN task_dependencies td ON t.id = td.task_id
JOIN tasks t2 ON td.depends_on_task_id = t2.id
WHERE td.status = 'pending' 
  AND td.dependency_type = 'blocks'
  AND t.status IN ('pending', 'in_progress')
GROUP BY t.id, t.title, t.status, t.priority
ORDER BY t.priority DESC, oldest_dependency_created;

CREATE VIEW external_dependency_status AS
SELECT 
    ed.id,
    ed.task_id,
    t.title as task_title,
    ed.name as dependency_name,
    ed.external_type,
    ed.status,
    ed.last_checked_at,
    ed.current_retry_count,
    ed.max_retries,
    CASE 
        WHEN ed.status = 'failed' AND ed.current_retry_count >= ed.max_retries THEN true
        ELSE false
    END as max_retries_exceeded,
    ed.error_details,
    ed.created_at
FROM external_dependencies ed
JOIN tasks t ON ed.task_id = t.id
ORDER BY ed.status, ed.last_checked_at DESC;

-- Comments for documentation
COMMENT ON TABLE task_dependencies IS 'Task-to-task dependencies for managing execution order and requirements';
COMMENT ON TABLE external_dependencies IS 'External dependencies on services, APIs, files, and other resources';
COMMENT ON TABLE dependency_validations IS 'History of dependency validation checks and results';
COMMENT ON TABLE dependency_resolution_rules IS 'Rules for complex dependency resolution logic';

COMMENT ON COLUMN task_dependencies.dependency_type IS 'Type of dependency: blocks (must complete first), requires (must be available), suggests (recommended)';
COMMENT ON COLUMN task_dependencies.condition_expression IS 'Optional condition that must be met for dependency to be considered';
COMMENT ON COLUMN external_dependencies.validation_method IS 'Method used to validate external dependency availability';
COMMENT ON COLUMN external_dependencies.validation_config IS 'Configuration for dependency validation (URLs, credentials, etc.)';

COMMENT ON VIEW task_dependency_summary IS 'Summary of dependencies and dependents for each task';
COMMENT ON VIEW dependency_graph IS 'Complete dependency graph showing task relationships';
COMMENT ON VIEW blocked_tasks IS 'Tasks that are blocked by unsatisfied dependencies';
COMMENT ON VIEW external_dependency_status IS 'Status and health of external dependencies';

