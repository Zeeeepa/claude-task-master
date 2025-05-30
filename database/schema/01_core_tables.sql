-- =====================================================
-- PostgreSQL Schema for Unified CI/CD Orchestration System
-- Core Tables: Projects, Workflows, Tasks
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROJECTS TABLE
-- =====================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repository_url VARCHAR(500),
    github_repo_id BIGINT,
    linear_team_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for projects
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_github_repo_id ON projects(github_repo_id);
CREATE INDEX idx_projects_linear_team_id ON projects(linear_team_id);
CREATE INDEX idx_projects_name ON projects(name);

-- =====================================================
-- WORKFLOWS TABLE
-- =====================================================
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    requirements TEXT NOT NULL,
    current_phase VARCHAR(50) DEFAULT 'initiation' CHECK (current_phase IN ('initiation', 'planning', 'development', 'testing', 'deployment', 'completed', 'failed')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'failed', 'cancelled')),
    progress JSONB DEFAULT '{"completed": 0, "total": 0, "percentage": 0}',
    metrics JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for workflows
CREATE INDEX idx_workflows_project_id ON workflows(project_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_current_phase ON workflows(current_phase);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);

-- =====================================================
-- TASKS TABLE
-- =====================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]',
    acceptance_criteria JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    estimated_effort INTEGER, -- in hours
    actual_effort INTEGER, -- in hours
    assigned_component VARCHAR(100),
    assigned_user_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'blocked', 'review', 'testing', 'done', 'cancelled', 'deferred')),
    linear_issue_id VARCHAR(100),
    github_pr_number INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for tasks
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_component ON tasks(assigned_component);
CREATE INDEX idx_tasks_assigned_user_id ON tasks(assigned_user_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX idx_tasks_github_pr_number ON tasks(github_pr_number);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_tasks_composite_status_priority ON tasks(status, priority DESC, created_at ASC);
CREATE INDEX idx_tasks_composite_workflow_status ON tasks(workflow_id, status);

-- =====================================================
-- TASK DEPENDENCIES TABLE (for better relationship management)
-- =====================================================
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates_to', 'subtask_of')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id, depends_on_task_id, dependency_type)
);

-- Add indexes for task dependencies
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at columns
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE projects IS 'Core projects table storing project metadata and configuration';
COMMENT ON TABLE workflows IS 'Workflows represent a collection of tasks working towards a common goal';
COMMENT ON TABLE tasks IS 'Individual tasks that make up workflows, with support for hierarchical relationships';
COMMENT ON TABLE task_dependencies IS 'Explicit task dependency relationships for better query performance';

COMMENT ON COLUMN projects.settings IS 'JSON configuration specific to the project';
COMMENT ON COLUMN workflows.progress IS 'JSON object tracking workflow completion progress';
COMMENT ON COLUMN workflows.metrics IS 'JSON object storing workflow performance metrics';
COMMENT ON COLUMN workflows.errors IS 'JSON array of errors encountered during workflow execution';
COMMENT ON COLUMN tasks.requirements IS 'JSON array of task requirements';
COMMENT ON COLUMN tasks.acceptance_criteria IS 'JSON array of acceptance criteria for task completion';
COMMENT ON COLUMN tasks.dependencies IS 'JSON array of task IDs this task depends on (legacy, use task_dependencies table)';
COMMENT ON COLUMN tasks.metadata IS 'JSON object for storing additional task-specific data';

