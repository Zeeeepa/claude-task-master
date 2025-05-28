-- Migration: 002_enhanced_schema.sql
-- Description: Enhanced PostgreSQL schema for AI-driven CI/CD task orchestration
-- Created: 2025-05-28
-- Version: 2.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- ENHANCED WORKFLOWS TABLE
-- Track end-to-end development workflows from requirement to deployment
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    workflow_type VARCHAR(50) NOT NULL DEFAULT 'ci_cd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    
    -- Workflow configuration
    configuration JSONB DEFAULT '{}'::jsonb,
    environment VARCHAR(50) DEFAULT 'development',
    
    -- Timing information
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    
    -- Relationships
    parent_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    triggered_by VARCHAR(255), -- user, webhook, schedule, etc.
    
    -- Metadata and tracking
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    
    -- Constraints
    CONSTRAINT workflows_status_check CHECK (status IN (
        'pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout'
    )),
    CONSTRAINT workflows_type_check CHECK (workflow_type IN (
        'ci_cd', 'deployment', 'testing', 'code_review', 'hotfix', 'rollback'
    )),
    CONSTRAINT workflows_priority_check CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT workflows_duration_check CHECK (
        estimated_duration_minutes >= 0 AND actual_duration_minutes >= 0
    )
);

-- ============================================================================
-- AGENT SESSIONS TABLE
-- Manage AI agent communication sessions and state
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    agent_version VARCHAR(50),
    agent_type VARCHAR(50) NOT NULL DEFAULT 'ai_assistant',
    
    -- Session state
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    session_data JSONB DEFAULT '{}'::jsonb,
    context_data JSONB DEFAULT '{}'::jsonb,
    
    -- Performance tracking
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time_ms DECIMAL(10,2),
    
    -- Resource usage
    tokens_used INTEGER DEFAULT 0,
    api_calls_made INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    
    -- Relationships
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    parent_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    
    -- Session lifecycle
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Connection info
    client_ip INET,
    user_agent TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT agent_sessions_status_check CHECK (status IN (
        'active', 'idle', 'busy', 'paused', 'completed', 'failed', 'expired', 'terminated'
    )),
    CONSTRAINT agent_sessions_type_check CHECK (agent_type IN (
        'ai_assistant', 'code_generator', 'reviewer', 'tester', 'deployer', 'monitor'
    )),
    CONSTRAINT agent_sessions_counters_check CHECK (
        total_requests >= 0 AND successful_requests >= 0 AND failed_requests >= 0 AND
        successful_requests + failed_requests <= total_requests
    )
);

-- ============================================================================
-- PR TRACKING TABLE
-- Monitor pull request lifecycle and validation status
-- ============================================================================

CREATE TABLE IF NOT EXISTS pr_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_number INTEGER NOT NULL,
    pr_url VARCHAR(500) NOT NULL,
    repository_name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(500),
    
    -- PR details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    branch_name VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) NOT NULL DEFAULT 'main',
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    merge_status VARCHAR(50) DEFAULT 'pending',
    review_status VARCHAR(50) DEFAULT 'pending',
    
    -- Validation results
    ci_status VARCHAR(50) DEFAULT 'pending',
    test_coverage_percentage DECIMAL(5,2),
    quality_score DECIMAL(5,2),
    security_scan_status VARCHAR(50) DEFAULT 'pending',
    
    -- Metrics
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    commits_count INTEGER DEFAULT 0,
    
    -- Relationships
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    created_by_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- People
    author VARCHAR(255),
    assignees JSONB DEFAULT '[]'::jsonb,
    reviewers JSONB DEFAULT '[]'::jsonb,
    
    -- Additional data
    labels JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT pr_tracking_status_check CHECK (status IN (
        'open', 'closed', 'merged', 'draft'
    )),
    CONSTRAINT pr_tracking_merge_status_check CHECK (merge_status IN (
        'pending', 'mergeable', 'conflicted', 'blocked', 'merged'
    )),
    CONSTRAINT pr_tracking_review_status_check CHECK (review_status IN (
        'pending', 'approved', 'changes_requested', 'dismissed'
    )),
    CONSTRAINT pr_tracking_ci_status_check CHECK (ci_status IN (
        'pending', 'running', 'success', 'failure', 'cancelled', 'skipped'
    )),
    CONSTRAINT pr_tracking_security_status_check CHECK (security_scan_status IN (
        'pending', 'running', 'passed', 'failed', 'skipped'
    )),
    CONSTRAINT pr_tracking_metrics_check CHECK (
        lines_added >= 0 AND lines_deleted >= 0 AND files_changed >= 0 AND commits_count >= 0
    ),
    CONSTRAINT pr_tracking_coverage_check CHECK (
        test_coverage_percentage IS NULL OR (test_coverage_percentage >= 0 AND test_coverage_percentage <= 100)
    ),
    CONSTRAINT pr_tracking_quality_check CHECK (
        quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)
    ),
    
    -- Unique constraint for repository + PR number
    UNIQUE(repository_name, pr_number)
);

-- ============================================================================
-- ENHANCED SYSTEM METRICS TABLE
-- Store performance and quality metrics for continuous improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL DEFAULT 'gauge',
    
    -- Metric values (support different data types)
    numeric_value DECIMAL(20,6),
    string_value TEXT,
    boolean_value BOOLEAN,
    json_value JSONB,
    
    -- Aggregation support
    aggregation_period VARCHAR(50) DEFAULT 'instant',
    aggregation_function VARCHAR(50) DEFAULT 'last',
    
    -- Context and dimensions
    dimensions JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '{}'::jsonb,
    
    -- Relationships
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    pr_id UUID REFERENCES pr_tracking(id) ON DELETE SET NULL,
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Source information
    source_system VARCHAR(100),
    source_component VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT system_metrics_category_check CHECK (metric_category IN (
        'performance', 'quality', 'usage', 'error', 'business', 'infrastructure', 'security'
    )),
    CONSTRAINT system_metrics_type_check CHECK (metric_type IN (
        'counter', 'gauge', 'histogram', 'summary', 'timer'
    )),
    CONSTRAINT system_metrics_aggregation_period_check CHECK (aggregation_period IN (
        'instant', 'minute', 'hour', 'day', 'week', 'month'
    )),
    CONSTRAINT system_metrics_aggregation_function_check CHECK (aggregation_function IN (
        'sum', 'avg', 'min', 'max', 'count', 'last', 'first', 'percentile'
    ))
);

-- ============================================================================
-- ENHANCED AUDIT LOGS TABLE
-- Comprehensive logging for debugging and compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs_enhanced (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Entity information
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name VARCHAR(255),
    
    -- Action details
    action VARCHAR(50) NOT NULL,
    action_category VARCHAR(50) NOT NULL DEFAULT 'data',
    action_result VARCHAR(50) DEFAULT 'success',
    
    -- Change tracking
    old_values JSONB,
    new_values JSONB,
    changed_fields JSONB DEFAULT '[]'::jsonb,
    
    -- Actor information
    actor_type VARCHAR(50) NOT NULL DEFAULT 'user',
    actor_id VARCHAR(255),
    actor_name VARCHAR(255),
    
    -- Session context
    session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Request context
    request_id VARCHAR(255),
    correlation_id VARCHAR(255),
    
    -- Network information
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_url TEXT,
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_ms INTEGER,
    
    -- Error information
    error_code VARCHAR(50),
    error_message TEXT,
    error_stack TEXT,
    
    -- Compliance and security
    compliance_tags JSONB DEFAULT '[]'::jsonb,
    security_level VARCHAR(20) DEFAULT 'normal',
    data_classification VARCHAR(20) DEFAULT 'internal',
    
    -- Additional context
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT audit_logs_enhanced_entity_type_check CHECK (entity_type IN (
        'task', 'workflow', 'agent_session', 'pr_tracking', 'system_metrics', 
        'user', 'configuration', 'deployment', 'security_event'
    )),
    CONSTRAINT audit_logs_enhanced_action_check CHECK (action IN (
        'create', 'read', 'update', 'delete', 'execute', 'approve', 'reject', 
        'start', 'stop', 'pause', 'resume', 'deploy', 'rollback', 'login', 'logout'
    )),
    CONSTRAINT audit_logs_enhanced_action_category_check CHECK (action_category IN (
        'data', 'security', 'system', 'business', 'compliance'
    )),
    CONSTRAINT audit_logs_enhanced_action_result_check CHECK (action_result IN (
        'success', 'failure', 'partial', 'timeout', 'cancelled'
    )),
    CONSTRAINT audit_logs_enhanced_actor_type_check CHECK (actor_type IN (
        'user', 'agent', 'system', 'api', 'webhook', 'scheduler'
    )),
    CONSTRAINT audit_logs_enhanced_security_level_check CHECK (security_level IN (
        'low', 'normal', 'high', 'critical'
    )),
    CONSTRAINT audit_logs_enhanced_data_classification_check CHECK (data_classification IN (
        'public', 'internal', 'confidential', 'restricted'
    ))
);

-- ============================================================================
-- WORKFLOW TASK RELATIONSHIPS TABLE
-- Enhanced task-workflow relationships with execution order
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Execution order and dependencies
    execution_order INTEGER NOT NULL DEFAULT 0,
    is_parallel BOOLEAN DEFAULT FALSE,
    is_optional BOOLEAN DEFAULT FALSE,
    is_critical BOOLEAN DEFAULT TRUE,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    
    -- Results
    result_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflow_tasks_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'
    )),
    CONSTRAINT workflow_tasks_retry_check CHECK (retry_count >= 0 AND max_retries >= 0),
    CONSTRAINT workflow_tasks_order_check CHECK (execution_order >= 0),
    
    -- Unique constraint to prevent duplicate task assignments
    UNIQUE(workflow_id, task_id)
);

-- ============================================================================
-- AGENT INTERACTIONS TABLE
-- Detailed logging of AI agent interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    
    -- Interaction details
    interaction_type VARCHAR(50) NOT NULL,
    interaction_sequence INTEGER NOT NULL DEFAULT 1,
    
    -- Request/Response data
    request_data JSONB NOT NULL,
    response_data JSONB,
    
    -- Performance metrics
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    
    -- Status and results
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    success BOOLEAN,
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Context
    context_data JSONB DEFAULT '{}'::jsonb,
    
    -- Relationships
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT agent_interactions_type_check CHECK (interaction_type IN (
        'chat', 'code_generation', 'code_review', 'testing', 'deployment', 
        'analysis', 'planning', 'validation', 'monitoring'
    )),
    CONSTRAINT agent_interactions_status_check CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'timeout', 'cancelled'
    )),
    CONSTRAINT agent_interactions_sequence_check CHECK (interaction_sequence > 0),
    CONSTRAINT agent_interactions_duration_check CHECK (duration_ms >= 0),
    CONSTRAINT agent_interactions_tokens_check CHECK (tokens_used >= 0),
    CONSTRAINT agent_interactions_cost_check CHECK (cost_usd >= 0)
);

-- ============================================================================
-- COMMENTS AND METADATA
-- ============================================================================

COMMENT ON TABLE workflows IS 'End-to-end development workflows from requirement to deployment';
COMMENT ON TABLE agent_sessions IS 'AI agent communication sessions and state management';
COMMENT ON TABLE pr_tracking IS 'Pull request lifecycle and validation status monitoring';
COMMENT ON TABLE system_metrics IS 'Performance and quality metrics for continuous improvement';
COMMENT ON TABLE audit_logs_enhanced IS 'Comprehensive audit logging for debugging and compliance';
COMMENT ON TABLE workflow_tasks IS 'Task-workflow relationships with execution order';
COMMENT ON TABLE agent_interactions IS 'Detailed AI agent interaction logging';

-- Add comments for key columns
COMMENT ON COLUMN workflows.configuration IS 'JSONB configuration for workflow execution parameters';
COMMENT ON COLUMN agent_sessions.session_data IS 'Current session state and context information';
COMMENT ON COLUMN pr_tracking.metadata IS 'Additional PR metadata including CI/CD pipeline results';
COMMENT ON COLUMN system_metrics.dimensions IS 'Metric dimensions for filtering and grouping';
COMMENT ON COLUMN audit_logs_enhanced.compliance_tags IS 'Tags for compliance and regulatory tracking';

