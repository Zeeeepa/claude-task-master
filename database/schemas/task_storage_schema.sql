-- PostgreSQL Task Storage and Context Engine Schema
-- Foundation for AI-driven task management with comprehensive context preservation

-- Enable UUID extension for generating unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core task storage table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB,
    acceptance_criteria JSONB,
    affected_files TEXT[],
    complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'done', 'deferred', 'blocked', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    assigned_to VARCHAR(100),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    tags TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Task dependencies table for managing complex dependency graphs
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'requires', 'relates_to', 'subtask')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_task_id, child_task_id, dependency_type)
);

-- Task context storage for comprehensive context preservation
CREATE TABLE task_context (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(100) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true
);

-- AI interactions table for tracking all AI agent communications
CREATE TABLE ai_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('prompt', 'response', 'validation', 'feedback', 'error', 'completion')),
    request_data JSONB,
    response_data JSONB,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id UUID,
    parent_interaction_id UUID REFERENCES ai_interactions(id)
);

-- Task status history for audit trail
CREATE TABLE task_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100),
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    additional_data JSONB
);

-- Codebase context for tracking file relationships and changes
CREATE TABLE codebase_context (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    change_type VARCHAR(50) CHECK (change_type IN ('created', 'modified', 'deleted', 'moved', 'renamed')),
    content_hash VARCHAR(64),
    diff_data TEXT,
    line_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Validation results for storing PR validation and feedback
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    validation_type VARCHAR(50) NOT NULL CHECK (validation_type IN ('syntax', 'tests', 'linting', 'security', 'performance', 'integration')),
    validator_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed', 'warning', 'skipped')),
    score DECIMAL(5,2),
    details JSONB,
    suggestions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Performance metrics for system monitoring
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4),
    unit VARCHAR(20),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tags JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Workflow states for advanced state tracking
CREATE TABLE workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    state_name VARCHAR(100) NOT NULL,
    state_data JSONB NOT NULL,
    entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exited_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    is_current BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance optimization
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_complexity_score ON tasks(complexity_score);
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX idx_tasks_metadata ON tasks USING GIN(metadata);

CREATE INDEX idx_task_dependencies_parent ON task_dependencies(parent_task_id);
CREATE INDEX idx_task_dependencies_child ON task_dependencies(child_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

CREATE INDEX idx_task_context_task_id ON task_context(task_id);
CREATE INDEX idx_task_context_type ON task_context(context_type);
CREATE INDEX idx_task_context_active ON task_context(is_active);
CREATE INDEX idx_task_context_data ON task_context USING GIN(context_data);

CREATE INDEX idx_ai_interactions_task_id ON ai_interactions(task_id);
CREATE INDEX idx_ai_interactions_agent ON ai_interactions(agent_name);
CREATE INDEX idx_ai_interactions_type ON ai_interactions(interaction_type);
CREATE INDEX idx_ai_interactions_session ON ai_interactions(session_id);
CREATE INDEX idx_ai_interactions_created_at ON ai_interactions(created_at);

CREATE INDEX idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX idx_task_status_history_created_at ON task_status_history(created_at);

CREATE INDEX idx_codebase_context_task_id ON codebase_context(task_id);
CREATE INDEX idx_codebase_context_file_path ON codebase_context(file_path);
CREATE INDEX idx_codebase_context_change_type ON codebase_context(change_type);

CREATE INDEX idx_validation_results_task_id ON validation_results(task_id);
CREATE INDEX idx_validation_results_type ON validation_results(validation_type);
CREATE INDEX idx_validation_results_status ON validation_results(status);
CREATE INDEX idx_validation_results_created_at ON validation_results(created_at);

CREATE INDEX idx_performance_metrics_task_id ON performance_metrics(task_id);
CREATE INDEX idx_performance_metrics_type ON performance_metrics(metric_type);
CREATE INDEX idx_performance_metrics_timestamp ON performance_metrics(timestamp);

CREATE INDEX idx_workflow_states_task_id ON workflow_states(task_id);
CREATE INDEX idx_workflow_states_current ON workflow_states(is_current);
CREATE INDEX idx_workflow_states_entered_at ON workflow_states(entered_at);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_context_updated_at BEFORE UPDATE ON task_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to prevent circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if adding this dependency would create a cycle
    IF EXISTS (
        WITH RECURSIVE dependency_chain AS (
            SELECT child_task_id as task_id, parent_task_id, 1 as depth
            FROM task_dependencies 
            WHERE child_task_id = NEW.parent_task_id
            
            UNION ALL
            
            SELECT td.child_task_id, td.parent_task_id, dc.depth + 1
            FROM task_dependencies td
            JOIN dependency_chain dc ON td.child_task_id = dc.parent_task_id
            WHERE dc.depth < 50 -- Prevent infinite recursion
        )
        SELECT 1 FROM dependency_chain WHERE task_id = NEW.child_task_id
    ) THEN
        RAISE EXCEPTION 'Circular dependency detected: task % cannot depend on task %', 
            NEW.child_task_id, NEW.parent_task_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_circular_dependencies
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION check_circular_dependency();

-- Function to automatically update task status history
CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_status_history (task_id, old_status, new_status, changed_by, change_reason)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.assigned_to, 'Status updated');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_task_status_changes
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION log_task_status_change();

-- Views for common queries
CREATE VIEW task_summary AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.priority,
    t.complexity_score,
    t.created_at,
    t.updated_at,
    t.assigned_to,
    COALESCE(dep_count.dependencies, 0) as dependency_count,
    COALESCE(ctx_count.contexts, 0) as context_count,
    COALESCE(ai_count.interactions, 0) as ai_interaction_count
FROM tasks t
LEFT JOIN (
    SELECT parent_task_id, COUNT(*) as dependencies
    FROM task_dependencies
    GROUP BY parent_task_id
) dep_count ON t.id = dep_count.parent_task_id
LEFT JOIN (
    SELECT task_id, COUNT(*) as contexts
    FROM task_context
    WHERE is_active = true
    GROUP BY task_id
) ctx_count ON t.id = ctx_count.task_id
LEFT JOIN (
    SELECT task_id, COUNT(*) as interactions
    FROM ai_interactions
    GROUP BY task_id
) ai_count ON t.id = ai_count.task_id;

-- View for pending tasks with satisfied dependencies
CREATE VIEW ready_tasks AS
SELECT t.*
FROM tasks t
WHERE t.status = 'pending'
AND NOT EXISTS (
    SELECT 1 
    FROM task_dependencies td
    JOIN tasks dep_task ON td.parent_task_id = dep_task.id
    WHERE td.child_task_id = t.id
    AND dep_task.status NOT IN ('done')
    AND td.dependency_type IN ('blocks', 'requires')
);

-- Comments for documentation
COMMENT ON TABLE tasks IS 'Core task storage with comprehensive metadata and context tracking';
COMMENT ON TABLE task_dependencies IS 'Task dependency relationships with support for complex dependency graphs';
COMMENT ON TABLE task_context IS 'Comprehensive context storage for AI prompt generation and workflow tracking';
COMMENT ON TABLE ai_interactions IS 'Complete history of AI agent interactions for learning and debugging';
COMMENT ON TABLE task_status_history IS 'Audit trail for all task status changes';
COMMENT ON TABLE codebase_context IS 'File-level context tracking for code changes and relationships';
COMMENT ON TABLE validation_results IS 'PR validation results and feedback from various validators';
COMMENT ON TABLE performance_metrics IS 'System performance monitoring and optimization data';
COMMENT ON TABLE workflow_states IS 'Advanced workflow state tracking for complex processes';

COMMENT ON VIEW task_summary IS 'Aggregated view of tasks with dependency and context counts';
COMMENT ON VIEW ready_tasks IS 'Tasks that are ready to be worked on (pending with satisfied dependencies)';

