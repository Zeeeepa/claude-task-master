-- PostgreSQL Database Schema for Task Orchestration
-- Claude Task Master AI-Driven CI/CD System
-- Version: 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create custom types
CREATE TYPE task_status_enum AS ENUM (
    'pending',
    'in-progress', 
    'done',
    'deferred',
    'blocked',
    'cancelled'
);

CREATE TYPE task_priority_enum AS ENUM (
    'low',
    'medium', 
    'high',
    'critical'
);

CREATE TYPE workflow_state_enum AS ENUM (
    'created',
    'planning',
    'development',
    'testing',
    'review',
    'deployment',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE deployment_status_enum AS ENUM (
    'pending',
    'running',
    'success',
    'failed',
    'cancelled',
    'rollback'
);

CREATE TYPE error_severity_enum AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

CREATE TYPE pr_status_enum AS ENUM (
    'draft',
    'open',
    'merged',
    'closed',
    'conflict'
);

-- Core tasks table with atomic granularity
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legacy_id INTEGER UNIQUE, -- For migration from existing JSON system
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details TEXT,
    test_strategy TEXT,
    requirements JSONB,
    implementation_files TEXT[],
    status task_status_enum DEFAULT 'pending',
    priority task_priority_enum DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    linear_issue_id VARCHAR(50),
    repository_url VARCHAR(255),
    estimated_complexity INTEGER CHECK (estimated_complexity >= 1 AND estimated_complexity <= 10),
    actual_complexity INTEGER CHECK (actual_complexity >= 1 AND actual_complexity <= 10),
    acceptance_criteria TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    version INTEGER DEFAULT 1,
    
    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', 
            COALESCE(title, '') || ' ' || 
            COALESCE(description, '') || ' ' || 
            COALESCE(details, '') || ' ' ||
            COALESCE(array_to_string(tags, ' '), '')
        )
    ) STORED
);

-- Task dependencies with cycle detection support
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dependent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks', -- blocks, suggests, related
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(dependent_task_id, dependency_task_id),
    CHECK (dependent_task_id != dependency_task_id)
);

-- Workflow states for comprehensive state tracking
CREATE TABLE workflow_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    pr_id UUID, -- References pr_metadata.id
    state workflow_state_enum NOT NULL,
    previous_state workflow_state_enum,
    state_data JSONB DEFAULT '{}',
    entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exited_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    triggered_by VARCHAR(100),
    trigger_reason TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Deployment scripts for reusable automation
CREATE TABLE deployment_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    script_type VARCHAR(50) NOT NULL, -- setup, deploy, rollback, test, cleanup
    script_content TEXT NOT NULL,
    script_language VARCHAR(50) DEFAULT 'bash', -- bash, python, node, sql
    environment VARCHAR(50), -- development, staging, production
    version VARCHAR(50) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    execution_timeout_seconds INTEGER DEFAULT 300,
    required_permissions TEXT[],
    environment_variables JSONB DEFAULT '{}',
    dependencies TEXT[], -- Other script names this depends on
    tags TEXT[],
    metadata JSONB DEFAULT '{}'
);

-- Comprehensive error tracking and analysis
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    pr_id UUID, -- References pr_metadata.id
    workflow_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
    deployment_script_id UUID REFERENCES deployment_scripts(id) ON DELETE SET NULL,
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}',
    stack_trace TEXT,
    severity error_severity_enum DEFAULT 'medium',
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    resolved_by VARCHAR(100),
    context JSONB DEFAULT '{}', -- Request context, environment info, etc.
    retry_count INTEGER DEFAULT 0,
    is_resolved BOOLEAN DEFAULT false,
    tags TEXT[],
    metadata JSONB DEFAULT '{}'
);

-- GitHub PR information and status tracking
CREATE TABLE pr_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_number INTEGER NOT NULL,
    repository_url VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status pr_status_enum DEFAULT 'draft',
    branch_name VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) DEFAULT 'main',
    author VARCHAR(100),
    assignees TEXT[],
    reviewers TEXT[],
    labels TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    commits_count INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    checks_status VARCHAR(50), -- pending, success, failure
    review_status VARCHAR(50), -- pending, approved, changes_requested
    merge_status VARCHAR(50), -- mergeable, conflicted, unknown
    auto_merge_enabled BOOLEAN DEFAULT false,
    draft BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(repository_url, pr_number)
);

-- Linear ticket synchronization data
CREATE TABLE linear_sync (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    linear_issue_id VARCHAR(50) NOT NULL,
    linear_team_id VARCHAR(50),
    linear_project_id VARCHAR(50),
    linear_state_id VARCHAR(50),
    linear_assignee_id VARCHAR(50),
    linear_priority INTEGER,
    linear_title VARCHAR(255),
    linear_description TEXT,
    linear_url VARCHAR(255),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_direction VARCHAR(20) DEFAULT 'bidirectional', -- to_linear, from_linear, bidirectional
    sync_status VARCHAR(50) DEFAULT 'synced', -- synced, pending, failed, conflict
    sync_errors JSONB DEFAULT '[]',
    linear_created_at TIMESTAMP WITH TIME ZONE,
    linear_updated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(linear_issue_id)
);

-- Task-PR relationship mapping
CREATE TABLE task_pr_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    pr_id UUID NOT NULL REFERENCES pr_metadata(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) DEFAULT 'implements', -- implements, fixes, relates_to
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    
    UNIQUE(task_id, pr_id)
);

-- Deployment execution history
CREATE TABLE deployment_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_script_id UUID NOT NULL REFERENCES deployment_scripts(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    pr_id UUID REFERENCES pr_metadata(id) ON DELETE SET NULL,
    status deployment_status_enum DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    exit_code INTEGER,
    stdout_log TEXT,
    stderr_log TEXT,
    environment VARCHAR(50),
    executed_by VARCHAR(100),
    execution_context JSONB DEFAULT '{}',
    rollback_execution_id UUID REFERENCES deployment_executions(id),
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance optimization

-- Tasks table indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_search_vector ON tasks USING GIN(search_vector);
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX idx_tasks_requirements ON tasks USING GIN(requirements);
CREATE INDEX idx_tasks_metadata ON tasks USING GIN(metadata);

-- Task dependencies indexes
CREATE INDEX idx_task_dependencies_dependent ON task_dependencies(dependent_task_id);
CREATE INDEX idx_task_dependencies_dependency ON task_dependencies(dependency_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

-- Workflow states indexes
CREATE INDEX idx_workflow_states_task_id ON workflow_states(task_id);
CREATE INDEX idx_workflow_states_pr_id ON workflow_states(pr_id);
CREATE INDEX idx_workflow_states_state ON workflow_states(state);
CREATE INDEX idx_workflow_states_entered_at ON workflow_states(entered_at);

-- Error logs indexes
CREATE INDEX idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX idx_error_logs_pr_id ON error_logs(pr_id);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);
CREATE INDEX idx_error_logs_occurred_at ON error_logs(occurred_at);
CREATE INDEX idx_error_logs_is_resolved ON error_logs(is_resolved);
CREATE INDEX idx_error_logs_error_code ON error_logs(error_code);

-- PR metadata indexes
CREATE INDEX idx_pr_metadata_repository_url ON pr_metadata(repository_url);
CREATE INDEX idx_pr_metadata_status ON pr_metadata(status);
CREATE INDEX idx_pr_metadata_branch_name ON pr_metadata(branch_name);
CREATE INDEX idx_pr_metadata_author ON pr_metadata(author);
CREATE INDEX idx_pr_metadata_created_at ON pr_metadata(created_at);

-- Linear sync indexes
CREATE INDEX idx_linear_sync_task_id ON linear_sync(task_id);
CREATE INDEX idx_linear_sync_linear_issue_id ON linear_sync(linear_issue_id);
CREATE INDEX idx_linear_sync_sync_status ON linear_sync(sync_status);
CREATE INDEX idx_linear_sync_last_synced_at ON linear_sync(last_synced_at);

-- Deployment scripts indexes
CREATE INDEX idx_deployment_scripts_script_type ON deployment_scripts(script_type);
CREATE INDEX idx_deployment_scripts_environment ON deployment_scripts(environment);
CREATE INDEX idx_deployment_scripts_is_active ON deployment_scripts(is_active);
CREATE INDEX idx_deployment_scripts_tags ON deployment_scripts USING GIN(tags);

-- Deployment executions indexes
CREATE INDEX idx_deployment_executions_script_id ON deployment_executions(deployment_script_id);
CREATE INDEX idx_deployment_executions_task_id ON deployment_executions(task_id);
CREATE INDEX idx_deployment_executions_status ON deployment_executions(status);
CREATE INDEX idx_deployment_executions_started_at ON deployment_executions(started_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX idx_tasks_parent_status ON tasks(parent_task_id, status);
CREATE INDEX idx_workflow_states_task_state ON workflow_states(task_id, state);
CREATE INDEX idx_error_logs_task_severity ON error_logs(task_id, severity);
CREATE INDEX idx_pr_metadata_repo_status ON pr_metadata(repository_url, status);

