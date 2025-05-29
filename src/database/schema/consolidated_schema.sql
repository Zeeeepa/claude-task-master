-- AI-Powered Development Workflow System Database Schema
-- Version: 1.0.0
-- Description: Comprehensive PostgreSQL schema for task management, execution tracking, and PR lifecycle

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress', 
    'validation',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE agent_type AS ENUM (
    'codegen',
    'claude_code',
    'webhook_orchestrator',
    'task_manager'
);

CREATE TYPE pr_status AS ENUM (
    'draft',
    'open',
    'review_requested',
    'approved',
    'merged',
    'closed',
    'failed_validation'
);

CREATE TYPE execution_status AS ENUM (
    'queued',
    'running',
    'completed',
    'failed',
    'timeout',
    'cancelled'
);

CREATE TYPE validation_result AS ENUM (
    'passed',
    'failed',
    'warning',
    'skipped'
);

-- Core Tables

-- 1. Projects table - Top-level project organization
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repository_url VARCHAR(500),
    repository_name VARCHAR(255),
    default_branch VARCHAR(100) DEFAULT 'main',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_project_name UNIQUE (name),
    CONSTRAINT valid_repository_url CHECK (repository_url ~ '^https?://.*')
);

-- 2. Tasks table - Core task management with flexible metadata
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

    -- Basic task information
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0,

    -- Flexible metadata using JSONB
    requirements JSONB DEFAULT '{}',
    dependencies JSONB DEFAULT '[]',
    context JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',

    -- Assignment and tracking
    assigned_agent agent_type,
    assigned_at TIMESTAMP WITH TIME ZONE,

    -- Timing
    estimated_duration INTERVAL,
    actual_duration INTERVAL,
    due_date TIMESTAMP WITH TIME ZONE,

    -- Audit fields
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT valid_status_transition CHECK (
        (status = 'pending') OR
        (status = 'in_progress' AND assigned_agent IS NOT NULL) OR
        (status IN ('validation', 'completed', 'failed', 'cancelled'))
    )
);

-- 3. Task executions table - Track individual execution attempts
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

    -- Execution details
    agent_type agent_type NOT NULL,
    agent_instance_id VARCHAR(255),
    execution_status execution_status DEFAULT 'queued',

    -- Execution context and results
    input_context JSONB DEFAULT '{}',
    output_results JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    logs TEXT,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL GENERATED ALWAYS AS (completed_at - started_at) STORED,

    -- Resource usage
    memory_usage_mb INTEGER,
    cpu_time_ms INTEGER,

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_execution_timing CHECK (
        (started_at IS NULL AND completed_at IS NULL) OR
        (started_at IS NOT NULL AND (completed_at IS NULL OR completed_at >= started_at))
    )
);

-- 4. Pull requests table - PR lifecycle management
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- GitHub/Git information
    pr_number INTEGER,
    repository_url VARCHAR(500) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) DEFAULT 'main',

    -- PR details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status pr_status DEFAULT 'draft',

    -- URLs and references
    pr_url VARCHAR(500),
    commit_sha VARCHAR(40),

    -- Validation and review
    validation_results JSONB DEFAULT '{}',
    review_comments JSONB DEFAULT '[]',

    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT unique_pr_per_repo UNIQUE (repository_url, pr_number),
    CONSTRAINT valid_commit_sha CHECK (commit_sha ~ '^[a-f0-9]{40}$' OR commit_sha IS NULL),
    CONSTRAINT valid_pr_url CHECK (pr_url ~ '^https?://.*' OR pr_url IS NULL)
);

-- 5. Validations table - Track validation results across different tools
CREATE TABLE validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
    task_execution_id UUID REFERENCES task_executions(id) ON DELETE CASCADE,

    -- Validation details
    validation_type VARCHAR(100) NOT NULL, -- e.g., 'tests', 'linting', 'security', 'performance'
    validator_name VARCHAR(100) NOT NULL,  -- e.g., 'pytest', 'eslint', 'sonarqube'
    result validation_result NOT NULL,

    -- Results and feedback
    details JSONB DEFAULT '{}',
    error_message TEXT,
    suggestions JSONB DEFAULT '[]',

    -- Metrics
    score DECIMAL(5,2), -- 0-100 score if applicable
    execution_time_ms INTEGER,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_score CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    CONSTRAINT require_pr_or_execution CHECK (
        (pr_id IS NOT NULL AND task_execution_id IS NULL) OR
        (pr_id IS NULL AND task_execution_id IS NOT NULL) OR
        (pr_id IS NOT NULL AND task_execution_id IS NOT NULL)
    )
);

-- 6. Workflow events table - Audit trail for all workflow operations
CREATE TABLE workflow_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Event classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL, -- 'task', 'execution', 'pr', 'validation', 'system'

    -- Related entities (nullable for flexibility)
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES task_executions(id) ON DELETE CASCADE,
    pr_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,

    -- Event details
    actor VARCHAR(255), -- user, agent, or system component
    action VARCHAR(100) NOT NULL,
    description TEXT,

    -- Event data
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Timing
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexing hints
    CONSTRAINT valid_event_category CHECK (
        event_category IN ('task', 'execution', 'pr', 'validation', 'system', 'webhook')
    )
);

-- 7. Agent configurations table - Store agent-specific settings
CREATE TABLE agent_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Agent details
    agent_type agent_type NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    version VARCHAR(50),

    -- Configuration
    configuration JSONB NOT NULL DEFAULT '{}',
    capabilities JSONB DEFAULT '[]',
    constraints JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(50) DEFAULT 'unknown',

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_agent_per_project UNIQUE (project_id, agent_type, agent_name)
);

-- 8. Dependencies table - Track task and execution dependencies
CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Dependency relationship
    dependent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

    -- Dependency details
    dependency_type VARCHAR(50) DEFAULT 'blocks', -- 'blocks', 'requires', 'suggests'
    description TEXT,

    -- Status
    is_satisfied BOOLEAN DEFAULT false,
    satisfied_at TIMESTAMP WITH TIME ZONE,

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT no_self_dependency CHECK (dependent_task_id != dependency_task_id),
    CONSTRAINT unique_dependency UNIQUE (dependent_task_id, dependency_task_id)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pull_requests_updated_at BEFORE UPDATE ON pull_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_configurations_updated_at BEFORE UPDATE ON agent_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries

-- Active tasks view
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    p.name as project_name,
    p.repository_name,
    COUNT(te.id) as execution_count,
    MAX(te.completed_at) as last_execution
FROM tasks t
JOIN projects p ON t.project_id = p.id
LEFT JOIN task_executions te ON t.id = te.task_id
WHERE t.status IN ('pending', 'in_progress', 'validation')
    AND p.archived_at IS NULL
GROUP BY t.id, p.name, p.repository_name;

-- Task execution summary view
CREATE VIEW task_execution_summary AS
SELECT 
    t.id as task_id,
    t.title,
    t.status as task_status,
    COUNT(te.id) as total_executions,
    COUNT(CASE WHEN te.execution_status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN te.execution_status = 'failed' THEN 1 END) as failed_executions,
    AVG(EXTRACT(EPOCH FROM te.duration)) as avg_duration_seconds,
    MAX(te.completed_at) as last_execution_time
FROM tasks t
LEFT JOIN task_executions te ON t.id = te.task_id
GROUP BY t.id, t.title, t.status;

-- PR validation status view
CREATE VIEW pr_validation_status AS
SELECT 
    pr.id as pr_id,
    pr.title,
    pr.status as pr_status,
    COUNT(v.id) as total_validations,
    COUNT(CASE WHEN v.result = 'passed' THEN 1 END) as passed_validations,
    COUNT(CASE WHEN v.result = 'failed' THEN 1 END) as failed_validations,
    COUNT(CASE WHEN v.result = 'warning' THEN 1 END) as warning_validations,
    AVG(v.score) as avg_validation_score
FROM pull_requests pr
LEFT JOIN validations v ON pr.id = v.pr_id
GROUP BY pr.id, pr.title, pr.status;

-- Comments
COMMENT ON TABLE projects IS 'Top-level project organization and repository information';
COMMENT ON TABLE tasks IS 'Core task management with flexible JSONB metadata for requirements and context';
COMMENT ON TABLE task_executions IS 'Individual execution attempts with detailed tracking and resource usage';
COMMENT ON TABLE pull_requests IS 'PR lifecycle management with validation results and review tracking';
COMMENT ON TABLE validations IS 'Validation results from various tools and processes';
COMMENT ON TABLE workflow_events IS 'Comprehensive audit trail for all workflow operations';
COMMENT ON TABLE agent_configurations IS 'Agent-specific configurations and health monitoring';
COMMENT ON TABLE dependencies IS 'Task dependency relationships and satisfaction tracking';

COMMENT ON COLUMN tasks.requirements IS 'JSONB field for flexible requirement specifications';
COMMENT ON COLUMN tasks.dependencies IS 'JSONB array of task dependencies and external requirements';
COMMENT ON COLUMN tasks.context IS 'JSONB field for execution context, file paths, and environment data';
COMMENT ON COLUMN task_executions.input_context IS 'JSONB field for execution input parameters and context';
COMMENT ON COLUMN task_executions.output_results IS 'JSONB field for execution results and generated artifacts';
COMMENT ON COLUMN pull_requests.validation_results IS 'JSONB field for aggregated validation results and metrics';

