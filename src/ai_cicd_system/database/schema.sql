-- Complete PostgreSQL Database Schema for AI CI/CD Task Management
-- Version: 2.0.0
-- Description: Comprehensive schema combining initial and enhanced features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Import initial schema
\i src/ai_cicd_system/database/migrations/001_initial_schema.sql

-- Import enhanced schema
\i src/ai_cicd_system/database/migrations/002_enhanced_cicd_schema.sql

-- Additional utility functions and views for production use

-- Function to get task statistics
CREATE OR REPLACE FUNCTION get_task_statistics()
RETURNS TABLE(
    total_tasks BIGINT,
    pending_tasks BIGINT,
    in_progress_tasks BIGINT,
    completed_tasks BIGINT,
    failed_tasks BIGINT,
    avg_completion_time INTERVAL,
    avg_complexity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_tasks,
        AVG(completed_at - created_at) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_time,
        AVG(complexity_score) as avg_complexity
    FROM tasks;
END;
$$ LANGUAGE plpgsql;

-- Function to get deployment statistics
CREATE OR REPLACE FUNCTION get_deployment_statistics()
RETURNS TABLE(
    total_deployments BIGINT,
    successful_deployments BIGINT,
    failed_deployments BIGINT,
    avg_deployment_time NUMERIC,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_deployments,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_deployments,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_deployments,
        AVG(execution_duration_ms) as avg_deployment_time,
        (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0) * 100) as success_rate
    FROM deployment_scripts
    WHERE executed_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get error statistics
CREATE OR REPLACE FUNCTION get_error_statistics()
RETURNS TABLE(
    total_errors BIGINT,
    unresolved_errors BIGINT,
    critical_errors BIGINT,
    error_rate NUMERIC,
    avg_resolution_time INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_errors,
        COUNT(*) FILTER (WHERE resolved = FALSE) as unresolved_errors,
        COUNT(*) FILTER (WHERE severity IN ('critical', 'fatal')) as critical_errors,
        (COUNT(*)::NUMERIC / NULLIF((SELECT COUNT(*) FROM tasks), 0) * 100) as error_rate,
        AVG(resolved_at - created_at) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time
    FROM error_logs;
END;
$$ LANGUAGE plpgsql;

-- Comprehensive dashboard view
CREATE OR REPLACE VIEW comprehensive_dashboard AS
SELECT 
    'system_overview' as metric_type,
    json_build_object(
        'tasks', (SELECT row_to_json(get_task_statistics())),
        'deployments', (SELECT row_to_json(get_deployment_statistics())),
        'errors', (SELECT row_to_json(get_error_statistics())),
        'timestamp', NOW()
    ) as metrics;

-- Performance monitoring view
CREATE OR REPLACE VIEW performance_monitoring AS
SELECT 
    'database_performance' as category,
    json_build_object(
        'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
        'idle_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle'),
        'slow_queries', (SELECT count(*) FROM pg_stat_statements WHERE mean_time > 5000),
        'cache_hit_ratio', (SELECT round((sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 2) FROM pg_statio_user_tables),
        'database_size', (SELECT pg_size_pretty(pg_database_size(current_database()))),
        'timestamp', NOW()
    ) as metrics;

COMMENT ON SCHEMA public IS 'AI CI/CD Task Management Database Schema v2.0.0';
