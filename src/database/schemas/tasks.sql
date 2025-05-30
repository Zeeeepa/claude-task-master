-- Task Management Schema
-- Comprehensive schema for task composition components
-- Version: 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types for task management
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed'
);

CREATE TYPE task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

-- Main tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    complexity_score INTEGER DEFAULT 0 CHECK (complexity_score >= 0 AND complexity_score <= 100),
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

-- Indexes for performance optimization
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_metadata_gin ON tasks USING gin(metadata);
CREATE INDEX idx_tasks_tags_gin ON tasks USING gin(tags);
CREATE INDEX idx_tasks_requirements_gin ON tasks USING gin(requirements);

CREATE INDEX idx_subtasks_parent_task_id ON subtasks(parent_task_id);
CREATE INDEX idx_subtasks_status ON subtasks(status);
CREATE INDEX idx_subtasks_order_index ON subtasks(order_index);
CREATE INDEX idx_subtasks_created_at ON subtasks(created_at);

CREATE INDEX idx_task_files_task_id ON task_files(task_id);
CREATE INDEX idx_task_files_file_type ON task_files(file_type);
CREATE INDEX idx_task_files_generated_at ON task_files(generated_at);
CREATE INDEX idx_task_files_path_trgm ON task_files USING gin(file_path gin_trgm_ops);

-- Full-text search indexes
CREATE INDEX idx_tasks_title_fts ON tasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_tasks_description_fts ON tasks USING gin(to_tsvector('english', description));
CREATE INDEX idx_subtasks_title_fts ON subtasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_subtasks_description_fts ON subtasks USING gin(to_tsvector('english', description));

-- Trigger function for updating updated_at timestamp
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

-- Views for common queries
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    COUNT(st.id) as subtask_count,
    COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
    COUNT(tf.id) as file_count
FROM tasks t
LEFT JOIN subtasks st ON t.id = st.parent_task_id
LEFT JOIN task_files tf ON t.id = tf.task_id
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.id;

CREATE VIEW task_hierarchy AS
WITH RECURSIVE task_tree AS (
    -- Base case: root tasks (no parent)
    SELECT 
        id,
        title,
        status,
        priority,
        parent_task_id,
        workflow_id,
        0 as level,
        ARRAY[id] as path,
        title as full_path
    FROM tasks 
    WHERE parent_task_id IS NULL
    
    UNION ALL
    
    -- Recursive case: child tasks
    SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        t.parent_task_id,
        t.workflow_id,
        tt.level + 1,
        tt.path || t.id,
        tt.full_path || ' > ' || t.title
    FROM tasks t
    JOIN task_tree tt ON t.parent_task_id = tt.id
)
SELECT * FROM task_tree ORDER BY path;

CREATE VIEW task_progress_summary AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.priority,
    t.complexity_score,
    COUNT(st.id) as total_subtasks,
    COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
    COUNT(CASE WHEN st.status = 'failed' THEN 1 END) as failed_subtasks,
    CASE 
        WHEN COUNT(st.id) = 0 THEN 0
        ELSE ROUND((COUNT(CASE WHEN st.status = 'completed' THEN 1 END)::DECIMAL / COUNT(st.id)) * 100, 2)
    END as completion_percentage,
    COUNT(tf.id) as generated_files,
    t.created_at,
    t.updated_at
FROM tasks t
LEFT JOIN subtasks st ON t.id = st.parent_task_id
LEFT JOIN task_files tf ON t.id = tf.task_id
GROUP BY t.id, t.title, t.status, t.priority, t.complexity_score, t.created_at, t.updated_at;

-- Comments for documentation
COMMENT ON TABLE tasks IS 'Main tasks table for task composition and management';
COMMENT ON TABLE subtasks IS 'Hierarchical subtasks for breaking down complex tasks';
COMMENT ON TABLE task_files IS 'Generated files and content associated with tasks';

COMMENT ON COLUMN tasks.metadata IS 'JSONB field for flexible task attributes and custom data';
COMMENT ON COLUMN tasks.requirements IS 'JSONB field for task requirements and specifications';
COMMENT ON COLUMN tasks.context IS 'JSONB field for execution context and environment data';
COMMENT ON COLUMN tasks.tags IS 'JSONB array for task categorization and filtering';
COMMENT ON COLUMN tasks.complexity_score IS 'Numeric score (0-100) indicating task complexity';

COMMENT ON VIEW active_tasks IS 'View showing active tasks with subtask and file counts';
COMMENT ON VIEW task_hierarchy IS 'Recursive view showing task hierarchy and relationships';
COMMENT ON VIEW task_progress_summary IS 'Summary view showing task progress and completion metrics';

