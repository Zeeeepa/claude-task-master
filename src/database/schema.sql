-- PostgreSQL Database Schema for Claude Task Master
-- Version: 2.0.0
-- Description: Comprehensive schema for task management, migration system, and AI optimization

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types
CREATE TYPE task_status AS ENUM (
    'backlog',
    'todo', 
    'in-progress',
    'done',
    'deferred',
    'cancelled'
);

CREATE TYPE dependency_type AS ENUM (
    'blocks',
    'depends_on',
    'related',
    'subtask'
);

CREATE TYPE execution_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'timeout',
    'cancelled'
);

CREATE TYPE template_type AS ENUM (
    'task',
    'project',
    'workflow',
    'test',
    'deployment'
);

-- Core Tasks Table with JSONB support
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB,
    dependencies JSONB,
    acceptance_criteria JSONB,
    complexity_score INTEGER DEFAULT 0,
    status task_status DEFAULT 'backlog',
    priority VARCHAR(50) DEFAULT 'medium',
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    assigned_to VARCHAR(255),
    details TEXT,
    test_strategy TEXT,
    previous_status task_status,
    
    -- Additional fields for compatibility with existing task structure
    legacy_id INTEGER UNIQUE,
    
    -- Constraints
    CONSTRAINT valid_complexity_score CHECK (complexity_score >= 0 AND complexity_score <= 100),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- Subtasks relationship table
CREATE TABLE subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent circular dependencies
    CONSTRAINT no_self_reference CHECK (parent_task_id != child_task_id),
    CONSTRAINT unique_parent_child UNIQUE (parent_task_id, child_task_id)
);

-- Task Dependencies
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type dependency_type DEFAULT 'blocks',
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent circular dependencies
    CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
    CONSTRAINT unique_task_dependency UNIQUE (task_id, depends_on_task_id)
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    repository_url VARCHAR(500),
    context JSONB,
    architecture JSONB,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'archived', 'completed'))
);

-- Templates for reusable patterns
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type template_type NOT NULL,
    content JSONB NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    
    -- Constraints
    CONSTRAINT unique_template_name_type UNIQUE (name, type),
    CONSTRAINT positive_usage_count CHECK (usage_count >= 0)
);

-- Execution history for learning
CREATE TABLE execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    attempt_number INTEGER DEFAULT 1,
    status execution_status NOT NULL,
    error_logs JSONB,
    success_patterns JSONB,
    execution_time INTERVAL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_attempt_number CHECK (attempt_number > 0),
    CONSTRAINT valid_execution_time CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL) OR
        (status != 'completed')
    )
);

-- Learning data for AI optimization
CREATE TABLE learning_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type VARCHAR(100) NOT NULL,
    pattern_data JSONB NOT NULL,
    success_rate DECIMAL(5,2),
    usage_frequency INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_success_rate CHECK (success_rate >= 0 AND success_rate <= 100),
    CONSTRAINT positive_usage_frequency CHECK (usage_frequency >= 0)
);

-- Migration tracking table
CREATE TABLE schema_migrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW(),
    execution_time INTERVAL,
    checksum VARCHAR(64),
    
    -- Constraints
    CONSTRAINT valid_version CHECK (version ~ '^[0-9]{3}_[a-zA-Z0-9_]+$')
);

-- Configuration table for system settings
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_complexity_score ON tasks(complexity_score);
CREATE INDEX idx_tasks_legacy_id ON tasks(legacy_id);

-- JSONB indexes for efficient querying
CREATE INDEX idx_tasks_requirements_gin ON tasks USING GIN (requirements);
CREATE INDEX idx_tasks_dependencies_gin ON tasks USING GIN (dependencies);
CREATE INDEX idx_tasks_acceptance_criteria_gin ON tasks USING GIN (acceptance_criteria);

-- Subtasks indexes
CREATE INDEX idx_subtasks_parent ON subtasks(parent_task_id);
CREATE INDEX idx_subtasks_child ON subtasks(child_task_id);
CREATE INDEX idx_subtasks_order ON subtasks(parent_task_id, order_index);

-- Task dependencies indexes
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

-- Projects indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_created_at ON projects(created_at);

-- Templates indexes
CREATE INDEX idx_templates_type ON templates(type);
CREATE INDEX idx_templates_name ON templates(name);
CREATE INDEX idx_templates_usage_count ON templates(usage_count DESC);

-- Execution history indexes
CREATE INDEX idx_execution_history_task_id ON execution_history(task_id);
CREATE INDEX idx_execution_history_status ON execution_history(status);
CREATE INDEX idx_execution_history_started_at ON execution_history(started_at);
CREATE INDEX idx_execution_history_attempt ON execution_history(task_id, attempt_number);

-- Learning data indexes
CREATE INDEX idx_learning_data_pattern_type ON learning_data(pattern_type);
CREATE INDEX idx_learning_data_success_rate ON learning_data(success_rate DESC);
CREATE INDEX idx_learning_data_usage_frequency ON learning_data(usage_frequency DESC);

-- Full-text search indexes
CREATE INDEX idx_tasks_title_search ON tasks USING GIN (to_tsvector('english', title));
CREATE INDEX idx_tasks_description_search ON tasks USING GIN (to_tsvector('english', description));
CREATE INDEX idx_projects_name_search ON projects USING GIN (to_tsvector('english', name));

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

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_data_updated_at BEFORE UPDATE ON learning_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to prevent circular dependencies in subtasks
CREATE OR REPLACE FUNCTION check_circular_subtask_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if adding this subtask would create a circular dependency
    IF EXISTS (
        WITH RECURSIVE subtask_tree AS (
            SELECT child_task_id as task_id, parent_task_id, 1 as depth
            FROM subtasks 
            WHERE parent_task_id = NEW.child_task_id
            
            UNION ALL
            
            SELECT s.child_task_id, s.parent_task_id, st.depth + 1
            FROM subtasks s
            JOIN subtask_tree st ON s.parent_task_id = st.task_id
            WHERE st.depth < 10 -- Prevent infinite recursion
        )
        SELECT 1 FROM subtask_tree WHERE task_id = NEW.parent_task_id
    ) THEN
        RAISE EXCEPTION 'Circular subtask dependency detected: task % cannot be a subtask of task %', 
            NEW.child_task_id, NEW.parent_task_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_circular_subtasks
    BEFORE INSERT OR UPDATE ON subtasks
    FOR EACH ROW EXECUTE FUNCTION check_circular_subtask_dependency();

-- Function to prevent circular dependencies in task_dependencies
CREATE OR REPLACE FUNCTION check_circular_task_dependency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if adding this dependency would create a circular dependency
    IF EXISTS (
        WITH RECURSIVE dependency_tree AS (
            SELECT depends_on_task_id as task_id, task_id as dependent_task_id, 1 as depth
            FROM task_dependencies 
            WHERE task_id = NEW.depends_on_task_id
            
            UNION ALL
            
            SELECT td.depends_on_task_id, td.task_id, dt.depth + 1
            FROM task_dependencies td
            JOIN dependency_tree dt ON td.task_id = dt.task_id
            WHERE dt.depth < 10 -- Prevent infinite recursion
        )
        SELECT 1 FROM dependency_tree WHERE task_id = NEW.task_id
    ) THEN
        RAISE EXCEPTION 'Circular task dependency detected: task % cannot depend on task %', 
            NEW.task_id, NEW.depends_on_task_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_circular_dependencies
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION check_circular_task_dependency();

-- Insert initial system configuration
INSERT INTO system_config (key, value, description) VALUES
('database_version', '"2.0.0"', 'Current database schema version'),
('migration_enabled', 'true', 'Whether migrations are enabled'),
('backup_enabled', 'true', 'Whether automatic backups are enabled'),
('max_task_depth', '10', 'Maximum depth for task hierarchies'),
('default_project_id', 'null', 'Default project ID for new tasks');

-- Create initial default project
INSERT INTO projects (id, name, description, status) VALUES
(gen_random_uuid(), 'Default Project', 'Default project for tasks without specific project assignment', 'active');

