-- Core Database Schema for AI-Driven CI/CD System
-- Description: Enhanced PostgreSQL schema for task management, workflow orchestration, and system monitoring
-- Version: 2.0.0
-- Created: 2025-05-28

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- CORE ENTITY TABLES
-- =====================================================

-- Enhanced tasks table for storing all task information
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_to VARCHAR(255),
    repository_url VARCHAR(500),
    branch_name VARCHAR(255),
    pr_number INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- New fields for enhanced functionality
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    complexity_score INTEGER DEFAULT 5,
    affected_files JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- External integration fields
    linear_issue_id VARCHAR(255),
    github_issue_number INTEGER,
    codegen_session_id VARCHAR(255),
    
    -- Constraints
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked')),
    CONSTRAINT tasks_priority_check CHECK (priority >= 0 AND priority <= 10),
    CONSTRAINT tasks_complexity_check CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CONSTRAINT tasks_hours_check CHECK (estimated_hours >= 0 AND actual_hours >= 0)
);

-- Enhanced workflows table for orchestration state
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'initialized',
    current_step VARCHAR(100),
    steps_completed JSONB DEFAULT '[]'::jsonb,
    error_log JSONB DEFAULT '[]'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- New fields for enhanced workflow management
    workflow_type VARCHAR(50) DEFAULT 'standard',
    total_steps INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_minutes INTEGER DEFAULT 60,
    
    -- External service integration
    codegen_pr_url VARCHAR(500),
    claude_session_id VARCHAR(255),
    validation_results JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflows_status_check CHECK (status IN ('initialized', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
    CONSTRAINT workflows_retry_check CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Enhanced system_metrics table for comprehensive monitoring
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    component VARCHAR(100),
    
    -- New fields for enhanced monitoring
    metric_type VARCHAR(50) NOT NULL DEFAULT 'gauge',
    metric_unit VARCHAR(20),
    tags JSONB DEFAULT '{}'::jsonb,
    source_system VARCHAR(50),
    
    -- Constraints
    CONSTRAINT system_metrics_type_check CHECK (metric_type IN ('gauge', 'counter', 'histogram', 'timer'))
);

-- Task contexts table for storing contextual information
CREATE TABLE IF NOT EXISTS task_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Enhanced context management
    context_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT task_contexts_type_check CHECK (context_type IN (
        'requirement', 'codebase', 'ai_interaction', 'validation', 
        'workflow', 'status_change', 'completion', 'dependency_parent', 
        'dependency_child', 'error', 'performance', 'external_api'
    ))
);

-- Audit logs table for comprehensive audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Enhanced audit capabilities
    correlation_id VARCHAR(255),
    request_id VARCHAR(255),
    api_endpoint VARCHAR(255),
    response_status INTEGER,
    
    -- Constraints
    CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN ('task', 'task_context', 'workflow', 'system_metric')),
    CONSTRAINT audit_logs_action_check CHECK (action IN ('create', 'update', 'delete', 'status_change', 'api_call'))
);

-- Task dependencies table for managing task relationships
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL DEFAULT 'blocks',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Enhanced dependency management
    is_active BOOLEAN DEFAULT true,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT task_dependencies_type_check CHECK (dependency_type IN ('blocks', 'depends_on', 'related', 'subtask')),
    CONSTRAINT task_dependencies_no_self_reference CHECK (parent_task_id != child_task_id),
    
    -- Unique constraint to prevent duplicate dependencies
    UNIQUE(parent_task_id, child_task_id, dependency_type)
);

-- External integrations table for managing API connections
CREATE TABLE IF NOT EXISTS external_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_type VARCHAR(50) NOT NULL,
    integration_name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Health monitoring
    health_check_url VARCHAR(500),
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'unknown',
    
    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    current_usage INTEGER DEFAULT 0,
    usage_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 minute',
    
    -- Constraints
    CONSTRAINT external_integrations_type_check CHECK (integration_type IN ('codegen', 'github', 'linear', 'claude', 'webhook')),
    CONSTRAINT external_integrations_status_check CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    CONSTRAINT external_integrations_health_check CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'timeout'))
);

-- API access logs for external service monitoring
CREATE TABLE IF NOT EXISTS api_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES external_integrations(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    response_time_ms INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Request tracking
    correlation_id VARCHAR(255),
    user_id VARCHAR(255),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT api_access_logs_method_check CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
    CONSTRAINT api_access_logs_status_check CHECK (response_status >= 100 AND response_status < 600)
);

-- Schema migrations table for tracking applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64),
    
    -- Enhanced migration tracking
    migration_type VARCHAR(20) DEFAULT 'schema',
    rollback_available BOOLEAN DEFAULT false,
    execution_time_ms INTEGER,
    
    -- Constraints
    CONSTRAINT schema_migrations_type_check CHECK (migration_type IN ('schema', 'data', 'index', 'function'))
);

-- Comments for documentation
COMMENT ON TABLE tasks IS 'Main tasks table storing all task information with enhanced CI/CD integration';
COMMENT ON TABLE workflows IS 'Workflow execution states and progress tracking with external service integration';
COMMENT ON TABLE system_metrics IS 'Comprehensive system performance metrics and monitoring data';
COMMENT ON TABLE task_contexts IS 'Contextual information and metadata for tasks with versioning';
COMMENT ON TABLE audit_logs IS 'Complete audit trail for all database changes and API calls';
COMMENT ON TABLE task_dependencies IS 'Task dependency relationships with resolution tracking';
COMMENT ON TABLE external_integrations IS 'External service integrations with health monitoring and rate limiting';
COMMENT ON TABLE api_access_logs IS 'API access logs for external service monitoring and debugging';
COMMENT ON TABLE schema_migrations IS 'Database schema version tracking with enhanced metadata';

