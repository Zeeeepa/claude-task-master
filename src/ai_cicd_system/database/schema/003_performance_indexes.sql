-- Migration: 003_performance_indexes.sql
-- Description: Performance optimization indexes for AI-driven CI/CD task orchestration
-- Created: 2025-05-28
-- Version: 2.0.0

-- ============================================================================
-- WORKFLOWS TABLE INDEXES
-- ============================================================================

-- Primary query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_status 
    ON workflows(status) WHERE status IN ('pending', 'running');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_type_status 
    ON workflows(workflow_type, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_priority_status 
    ON workflows(priority DESC, status) WHERE status IN ('pending', 'running');

-- Time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_created_at 
    ON workflows(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_started_at 
    ON workflows(started_at DESC) WHERE started_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_completed_at 
    ON workflows(completed_at DESC) WHERE completed_at IS NOT NULL;

-- Relationship queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_parent_workflow_id 
    ON workflows(parent_workflow_id) WHERE parent_workflow_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_triggered_by 
    ON workflows(triggered_by);

-- JSONB indexes for metadata queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_tags_gin 
    ON workflows USING GIN(tags);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_metadata_gin 
    ON workflows USING GIN(metadata);

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_env_status_priority 
    ON workflows(environment, status, priority DESC);

-- ============================================================================
-- AGENT SESSIONS TABLE INDEXES
-- ============================================================================

-- Session lookup and status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_session_id 
    ON agent_sessions(session_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_status 
    ON agent_sessions(status) WHERE status IN ('active', 'busy');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_agent_name_status 
    ON agent_sessions(agent_name, status);

-- Time-based queries for session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_last_activity 
    ON agent_sessions(last_activity_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_expires_at 
    ON agent_sessions(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- Performance monitoring indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_performance 
    ON agent_sessions(agent_name, avg_response_time_ms, total_requests) 
    WHERE status = 'active';

-- Relationship indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_workflow_id 
    ON agent_sessions(workflow_id) WHERE workflow_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_task_id 
    ON agent_sessions(task_id) WHERE task_id IS NOT NULL;

-- Resource usage tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_cost_tracking 
    ON agent_sessions(agent_name, cost_usd DESC, tokens_used DESC);

-- ============================================================================
-- PR TRACKING TABLE INDEXES
-- ============================================================================

-- Repository and PR lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_repo_pr 
    ON pr_tracking(repository_name, pr_number);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_repo_status 
    ON pr_tracking(repository_name, status);

-- Status tracking indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_status 
    ON pr_tracking(status) WHERE status IN ('open', 'draft');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_merge_status 
    ON pr_tracking(merge_status) WHERE merge_status IN ('pending', 'mergeable');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_ci_status 
    ON pr_tracking(ci_status) WHERE ci_status IN ('pending', 'running');

-- Quality and metrics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_quality_score 
    ON pr_tracking(quality_score DESC) WHERE quality_score IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_test_coverage 
    ON pr_tracking(test_coverage_percentage DESC) WHERE test_coverage_percentage IS NOT NULL;

-- Time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_created_at 
    ON pr_tracking(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_updated_at 
    ON pr_tracking(updated_at DESC);

-- Relationship indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_workflow_id 
    ON pr_tracking(workflow_id) WHERE workflow_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_task_id 
    ON pr_tracking(task_id) WHERE task_id IS NOT NULL;

-- Author and assignee queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_author 
    ON pr_tracking(author);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_assignees_gin 
    ON pr_tracking USING GIN(assignees);

-- Branch tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_branch_name 
    ON pr_tracking(repository_name, branch_name);

-- ============================================================================
-- SYSTEM METRICS TABLE INDEXES
-- ============================================================================

-- Metric lookup patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_category_name 
    ON system_metrics(metric_category, metric_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_name_timestamp 
    ON system_metrics(metric_name, timestamp DESC);

-- Time-series queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_timestamp 
    ON system_metrics(timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_recorded_at 
    ON system_metrics(recorded_at DESC);

-- Aggregation support
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_aggregation 
    ON system_metrics(metric_category, metric_name, aggregation_period, timestamp DESC);

-- Relationship indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_workflow_id 
    ON system_metrics(workflow_id, timestamp DESC) WHERE workflow_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_task_id 
    ON system_metrics(task_id, timestamp DESC) WHERE task_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_session_id 
    ON system_metrics(session_id, timestamp DESC) WHERE session_id IS NOT NULL;

-- Source system tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_source 
    ON system_metrics(source_system, source_component, timestamp DESC);

-- JSONB indexes for dimensions and tags
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_dimensions_gin 
    ON system_metrics USING GIN(dimensions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_tags_gin 
    ON system_metrics USING GIN(tags);

-- Numeric value queries for performance metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_numeric_value 
    ON system_metrics(metric_category, metric_name, numeric_value DESC) 
    WHERE numeric_value IS NOT NULL;

-- ============================================================================
-- AUDIT LOGS ENHANCED TABLE INDEXES
-- ============================================================================

-- Entity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_entity 
    ON audit_logs_enhanced(entity_type, entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_entity_timestamp 
    ON audit_logs_enhanced(entity_type, entity_id, timestamp DESC);

-- Action tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_action 
    ON audit_logs_enhanced(action, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_action_category 
    ON audit_logs_enhanced(action_category, timestamp DESC);

-- Actor tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_actor 
    ON audit_logs_enhanced(actor_type, actor_id, timestamp DESC);

-- Time-based queries (partitioned by month for performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_timestamp 
    ON audit_logs_enhanced(timestamp DESC);

-- Session and workflow context
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_session_id 
    ON audit_logs_enhanced(session_id, timestamp DESC) WHERE session_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_workflow_id 
    ON audit_logs_enhanced(workflow_id, timestamp DESC) WHERE workflow_id IS NOT NULL;

-- Security and compliance queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_security_level 
    ON audit_logs_enhanced(security_level, timestamp DESC) 
    WHERE security_level IN ('high', 'critical');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_compliance_gin 
    ON audit_logs_enhanced USING GIN(compliance_tags);

-- Error tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_errors 
    ON audit_logs_enhanced(action_result, timestamp DESC) 
    WHERE action_result IN ('failure', 'timeout');

-- Request correlation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_correlation 
    ON audit_logs_enhanced(correlation_id, timestamp DESC) 
    WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- WORKFLOW TASKS TABLE INDEXES
-- ============================================================================

-- Workflow execution order
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_execution_order 
    ON workflow_tasks(workflow_id, execution_order, status);

-- Status tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_status 
    ON workflow_tasks(status, updated_at DESC) 
    WHERE status IN ('pending', 'running');

-- Task lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_task_id 
    ON workflow_tasks(task_id, status);

-- Parallel execution queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_parallel 
    ON workflow_tasks(workflow_id, execution_order, is_parallel) 
    WHERE is_parallel = TRUE;

-- Critical path analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_critical 
    ON workflow_tasks(workflow_id, is_critical, execution_order) 
    WHERE is_critical = TRUE;

-- Retry tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_tasks_retries 
    ON workflow_tasks(retry_count, max_retries, status) 
    WHERE retry_count > 0;

-- ============================================================================
-- AGENT INTERACTIONS TABLE INDEXES
-- ============================================================================

-- Session interaction tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_session 
    ON agent_interactions(session_id, interaction_sequence);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_session_type 
    ON agent_interactions(session_id, interaction_type, started_at DESC);

-- Performance monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_performance 
    ON agent_interactions(interaction_type, duration_ms DESC, started_at DESC) 
    WHERE duration_ms IS NOT NULL;

-- Cost tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_cost 
    ON agent_interactions(session_id, cost_usd DESC, tokens_used DESC);

-- Status and error tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_status 
    ON agent_interactions(status, started_at DESC) 
    WHERE status IN ('pending', 'processing');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_errors 
    ON agent_interactions(status, error_code, started_at DESC) 
    WHERE status = 'failed';

-- Relationship indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_workflow_id 
    ON agent_interactions(workflow_id, started_at DESC) WHERE workflow_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_interactions_task_id 
    ON agent_interactions(task_id, started_at DESC) WHERE task_id IS NOT NULL;

-- ============================================================================
-- ENHANCED EXISTING TABLE INDEXES
-- ============================================================================

-- Additional indexes for existing tables to support new relationships

-- Tasks table enhancements
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_status_priority_updated 
    ON tasks(status, priority DESC, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_complexity_estimated_hours 
    ON tasks(complexity_score DESC, estimated_hours DESC) 
    WHERE status IN ('pending', 'in_progress');

-- Task contexts table enhancements
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_contexts_type_created 
    ON task_contexts(context_type, created_at DESC);

-- Performance metrics table enhancements (existing table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_performance_metrics_value_timestamp 
    ON performance_metrics(metric_type, metric_name, metric_value DESC, timestamp DESC);

-- ============================================================================
-- PARTIAL INDEXES FOR HIGH-PERFORMANCE QUERIES
-- ============================================================================

-- Active workflows only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_active_priority 
    ON workflows(priority DESC, created_at DESC) 
    WHERE status IN ('pending', 'running');

-- Active agent sessions only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_sessions_active_performance 
    ON agent_sessions(avg_response_time_ms ASC, total_requests DESC) 
    WHERE status = 'active' AND last_activity_at > NOW() - INTERVAL '1 hour';

-- Open PRs only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_open_quality 
    ON pr_tracking(quality_score DESC, test_coverage_percentage DESC) 
    WHERE status = 'open';

-- Recent metrics only (last 24 hours)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_recent 
    ON system_metrics(metric_category, metric_name, timestamp DESC) 
    WHERE timestamp > NOW() - INTERVAL '24 hours';

-- Failed operations for monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_enhanced_recent_failures 
    ON audit_logs_enhanced(entity_type, timestamp DESC) 
    WHERE action_result = 'failure' AND timestamp > NOW() - INTERVAL '7 days';

-- ============================================================================
-- TEXT SEARCH INDEXES
-- ============================================================================

-- Full-text search for workflows
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_text_search 
    ON workflows USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Full-text search for PR tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pr_tracking_text_search 
    ON pr_tracking USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_workflows_status IS 'Optimizes queries for active workflow status filtering';
COMMENT ON INDEX idx_agent_sessions_expires_at IS 'Supports session cleanup and expiration monitoring';
COMMENT ON INDEX idx_pr_tracking_quality_score IS 'Enables fast quality-based PR ranking';
COMMENT ON INDEX idx_system_metrics_aggregation IS 'Optimizes time-series aggregation queries';
COMMENT ON INDEX idx_audit_logs_enhanced_security_level IS 'Fast security event monitoring';
COMMENT ON INDEX idx_workflow_tasks_execution_order IS 'Critical for workflow execution ordering';
COMMENT ON INDEX idx_agent_interactions_performance IS 'Performance monitoring and optimization';

