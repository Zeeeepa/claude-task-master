-- Migration: 005_analytics_views.sql
-- Description: Reporting and analytics views for AI-driven CI/CD task orchestration
-- Created: 2025-05-28
-- Version: 2.0.0

-- ============================================================================
-- WORKFLOW ANALYTICS VIEWS
-- ============================================================================

-- Comprehensive workflow dashboard view
CREATE OR REPLACE VIEW workflow_dashboard AS
SELECT 
    w.id,
    w.name,
    w.workflow_type,
    w.status,
    w.priority,
    w.environment,
    w.started_at,
    w.completed_at,
    w.estimated_duration_minutes,
    w.actual_duration_minutes,
    w.created_at,
    w.triggered_by,
    
    -- Task statistics
    COUNT(wt.task_id) as total_tasks,
    COUNT(wt.task_id) FILTER (WHERE wt.status = 'completed') as completed_tasks,
    COUNT(wt.task_id) FILTER (WHERE wt.status = 'failed') as failed_tasks,
    COUNT(wt.task_id) FILTER (WHERE wt.status = 'running') as running_tasks,
    COUNT(wt.task_id) FILTER (WHERE wt.status = 'pending') as pending_tasks,
    
    -- Progress calculation
    CASE 
        WHEN COUNT(wt.task_id) = 0 THEN 0
        ELSE ROUND((COUNT(wt.task_id) FILTER (WHERE wt.status = 'completed')::DECIMAL / COUNT(wt.task_id)) * 100, 2)
    END as progress_percentage,
    
    -- Duration analysis
    CASE 
        WHEN w.actual_duration_minutes IS NOT NULL AND w.estimated_duration_minutes IS NOT NULL THEN
            ROUND(((w.actual_duration_minutes - w.estimated_duration_minutes) / w.estimated_duration_minutes::DECIMAL) * 100, 2)
        ELSE NULL
    END as duration_variance_percentage,
    
    -- Agent session count
    COUNT(DISTINCT ags.id) as agent_sessions_count,
    
    -- PR count
    COUNT(DISTINCT pr.id) as pr_count,
    COUNT(DISTINCT pr.id) FILTER (WHERE pr.status = 'merged') as merged_pr_count
    
FROM workflows w
LEFT JOIN workflow_tasks wt ON w.id = wt.workflow_id
LEFT JOIN agent_sessions ags ON w.id = ags.workflow_id
LEFT JOIN pr_tracking pr ON w.id = pr.workflow_id
GROUP BY w.id, w.name, w.workflow_type, w.status, w.priority, w.environment,
         w.started_at, w.completed_at, w.estimated_duration_minutes, 
         w.actual_duration_minutes, w.created_at, w.triggered_by;

-- Workflow performance metrics view
CREATE OR REPLACE VIEW workflow_performance_metrics AS
SELECT 
    workflow_type,
    environment,
    COUNT(*) as total_workflows,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_workflows,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_workflows,
    
    -- Success rate
    ROUND((COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
    
    -- Duration statistics
    AVG(actual_duration_minutes) FILTER (WHERE status = 'completed') as avg_duration_minutes,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY actual_duration_minutes) 
        FILTER (WHERE status = 'completed') as median_duration_minutes,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY actual_duration_minutes) 
        FILTER (WHERE status = 'completed') as p95_duration_minutes,
    
    -- Estimation accuracy
    AVG(
        CASE 
            WHEN estimated_duration_minutes > 0 AND actual_duration_minutes IS NOT NULL THEN
                ABS(actual_duration_minutes - estimated_duration_minutes) / estimated_duration_minutes::DECIMAL
            ELSE NULL
        END
    ) as avg_estimation_error_rate,
    
    -- Recent performance (last 7 days)
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as recent_workflows,
    AVG(actual_duration_minutes) FILTER (
        WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '7 days'
    ) as recent_avg_duration,
    
    -- Trend indicators
    CASE 
        WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') > 
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') 
        THEN 'increasing'
        WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') < 
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') 
        THEN 'decreasing'
        ELSE 'stable'
    END as volume_trend
    
FROM workflows
GROUP BY workflow_type, environment;

-- ============================================================================
-- TASK ANALYTICS VIEWS
-- ============================================================================

-- Task performance and complexity analysis
CREATE OR REPLACE VIEW task_analytics AS
SELECT 
    t.type as task_type,
    t.status,
    COUNT(*) as task_count,
    
    -- Complexity analysis
    AVG(t.complexity_score) as avg_complexity,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.complexity_score) as median_complexity,
    
    -- Time analysis
    AVG(t.actual_hours) FILTER (WHERE t.status = 'completed') as avg_actual_hours,
    AVG(t.estimated_hours) FILTER (WHERE t.status = 'completed') as avg_estimated_hours,
    
    -- Estimation accuracy
    AVG(
        CASE 
            WHEN t.estimated_hours > 0 AND t.actual_hours IS NOT NULL THEN
                ABS(t.actual_hours - t.estimated_hours) / t.estimated_hours
            ELSE NULL
        END
    ) as avg_estimation_error_rate,
    
    -- Productivity metrics
    AVG(t.complexity_score / NULLIF(t.actual_hours, 0)) FILTER (WHERE t.status = 'completed') as complexity_per_hour,
    
    -- Age analysis
    AVG(EXTRACT(EPOCH FROM (COALESCE(t.completed_at, NOW()) - t.created_at)) / 3600) as avg_age_hours,
    
    -- Context richness
    AVG((
        SELECT COUNT(*) 
        FROM task_contexts tc 
        WHERE tc.task_id = t.id
    )) as avg_context_count
    
FROM tasks t
GROUP BY t.type, t.status;

-- Task dependency analysis view
CREATE OR REPLACE VIEW task_dependency_analysis AS
SELECT 
    t.id as task_id,
    t.title,
    t.type,
    t.status,
    t.complexity_score,
    
    -- Dependency counts
    COUNT(td_parent.child_task_id) as child_dependencies,
    COUNT(td_child.parent_task_id) as parent_dependencies,
    
    -- Dependency depth (how many levels deep in the dependency tree)
    (
        WITH RECURSIVE dependency_depth AS (
            SELECT t.id, 0 as depth
            UNION ALL
            SELECT td.child_task_id, dd.depth + 1
            FROM task_dependencies td
            JOIN dependency_depth dd ON td.parent_task_id = dd.id
            WHERE dd.depth < 10 -- Prevent infinite recursion
        )
        SELECT MAX(depth) FROM dependency_depth WHERE id = t.id
    ) as dependency_depth,
    
    -- Critical path indicator
    CASE 
        WHEN COUNT(td_child.parent_task_id) = 0 THEN 'leaf_task'
        WHEN COUNT(td_parent.child_task_id) = 0 THEN 'root_task'
        ELSE 'intermediate_task'
    END as dependency_role,
    
    -- Blocking potential (how many tasks this could block)
    (
        WITH RECURSIVE blocking_count AS (
            SELECT t.id, 0 as blocked_count
            UNION ALL
            SELECT td.parent_task_id, bc.blocked_count + 1
            FROM task_dependencies td
            JOIN blocking_count bc ON td.child_task_id = bc.id
            WHERE bc.blocked_count < 10 -- Prevent infinite recursion
        )
        SELECT COUNT(DISTINCT id) - 1 FROM blocking_count WHERE id = t.id
    ) as potential_blocking_impact
    
FROM tasks t
LEFT JOIN task_dependencies td_parent ON t.id = td_parent.parent_task_id
LEFT JOIN task_dependencies td_child ON t.id = td_child.child_task_id
GROUP BY t.id, t.title, t.type, t.status, t.complexity_score;

-- ============================================================================
-- AGENT PERFORMANCE VIEWS
-- ============================================================================

-- Agent session performance dashboard
CREATE OR REPLACE VIEW agent_performance_dashboard AS
SELECT 
    ags.agent_name,
    ags.agent_type,
    COUNT(DISTINCT ags.id) as total_sessions,
    COUNT(DISTINCT ags.id) FILTER (WHERE ags.status = 'active') as active_sessions,
    
    -- Performance metrics
    AVG(ags.avg_response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ags.avg_response_time_ms) as p95_response_time_ms,
    
    -- Success rates
    AVG(
        CASE 
            WHEN ags.total_requests > 0 THEN 
                (ags.successful_requests::DECIMAL / ags.total_requests) * 100
            ELSE NULL
        END
    ) as avg_success_rate,
    
    -- Resource usage
    SUM(ags.tokens_used) as total_tokens_used,
    SUM(ags.cost_usd) as total_cost_usd,
    AVG(ags.cost_usd / NULLIF(ags.total_requests, 0)) as avg_cost_per_request,
    
    -- Session duration analysis
    AVG(EXTRACT(EPOCH FROM (COALESCE(ags.ended_at, NOW()) - ags.started_at)) / 60) as avg_session_duration_minutes,
    
    -- Recent activity (last 24 hours)
    COUNT(DISTINCT ags.id) FILTER (WHERE ags.started_at >= NOW() - INTERVAL '24 hours') as recent_sessions,
    AVG(ags.avg_response_time_ms) FILTER (WHERE ags.started_at >= NOW() - INTERVAL '24 hours') as recent_avg_response_time,
    
    -- Interaction analysis
    AVG(ai.duration_ms) as avg_interaction_duration_ms,
    COUNT(ai.id) as total_interactions,
    COUNT(ai.id) FILTER (WHERE ai.success = true) as successful_interactions
    
FROM agent_sessions ags
LEFT JOIN agent_interactions ai ON ags.id = ai.session_id
GROUP BY ags.agent_name, ags.agent_type;

-- Agent interaction patterns view
CREATE OR REPLACE VIEW agent_interaction_patterns AS
SELECT 
    ai.interaction_type,
    ags.agent_name,
    ags.agent_type,
    COUNT(*) as interaction_count,
    
    -- Performance metrics
    AVG(ai.duration_ms) as avg_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ai.duration_ms) as median_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ai.duration_ms) as p95_duration_ms,
    
    -- Success analysis
    COUNT(*) FILTER (WHERE ai.success = true) as successful_interactions,
    ROUND((COUNT(*) FILTER (WHERE ai.success = true)::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
    
    -- Cost analysis
    AVG(ai.cost_usd) as avg_cost_usd,
    SUM(ai.cost_usd) as total_cost_usd,
    AVG(ai.tokens_used) as avg_tokens_used,
    
    -- Error analysis
    COUNT(DISTINCT ai.error_code) FILTER (WHERE ai.error_code IS NOT NULL) as unique_error_types,
    MODE() WITHIN GROUP (ORDER BY ai.error_code) FILTER (WHERE ai.error_code IS NOT NULL) as most_common_error,
    
    -- Temporal patterns
    EXTRACT(HOUR FROM ai.started_at) as hour_of_day,
    COUNT(*) as interactions_by_hour
    
FROM agent_interactions ai
JOIN agent_sessions ags ON ai.session_id = ags.id
GROUP BY ai.interaction_type, ags.agent_name, ags.agent_type, EXTRACT(HOUR FROM ai.started_at);

-- ============================================================================
-- PR AND CODE QUALITY VIEWS
-- ============================================================================

-- PR quality and velocity dashboard
CREATE OR REPLACE VIEW pr_quality_dashboard AS
SELECT 
    pr.repository_name,
    COUNT(*) as total_prs,
    COUNT(*) FILTER (WHERE pr.status = 'merged') as merged_prs,
    COUNT(*) FILTER (WHERE pr.status = 'open') as open_prs,
    
    -- Quality metrics
    AVG(pr.quality_score) FILTER (WHERE pr.quality_score IS NOT NULL) as avg_quality_score,
    AVG(pr.test_coverage_percentage) FILTER (WHERE pr.test_coverage_percentage IS NOT NULL) as avg_test_coverage,
    
    -- Size metrics
    AVG(pr.lines_added + pr.lines_deleted) as avg_lines_changed,
    AVG(pr.files_changed) as avg_files_changed,
    AVG(pr.commits_count) as avg_commits_count,
    
    -- Velocity metrics
    AVG(
        EXTRACT(EPOCH FROM (COALESCE(pr.merged_at, pr.closed_at, NOW()) - pr.created_at)) / 3600
    ) as avg_pr_lifecycle_hours,
    
    -- CI/CD success rates
    COUNT(*) FILTER (WHERE pr.ci_status = 'success') as ci_success_count,
    ROUND((COUNT(*) FILTER (WHERE pr.ci_status = 'success')::DECIMAL / COUNT(*)) * 100, 2) as ci_success_rate,
    
    -- Security scan results
    COUNT(*) FILTER (WHERE pr.security_scan_status = 'passed') as security_passed_count,
    ROUND((COUNT(*) FILTER (WHERE pr.security_scan_status = 'passed')::DECIMAL / COUNT(*)) * 100, 2) as security_pass_rate,
    
    -- Review metrics
    COUNT(*) FILTER (WHERE pr.review_status = 'approved') as approved_prs,
    ROUND((COUNT(*) FILTER (WHERE pr.review_status = 'approved')::DECIMAL / COUNT(*)) * 100, 2) as approval_rate,
    
    -- Recent trends (last 30 days)
    COUNT(*) FILTER (WHERE pr.created_at >= NOW() - INTERVAL '30 days') as recent_prs,
    AVG(pr.quality_score) FILTER (
        WHERE pr.quality_score IS NOT NULL AND pr.created_at >= NOW() - INTERVAL '30 days'
    ) as recent_avg_quality_score
    
FROM pr_tracking pr
GROUP BY pr.repository_name;

-- PR workflow integration view
CREATE OR REPLACE VIEW pr_workflow_integration AS
SELECT 
    w.id as workflow_id,
    w.name as workflow_name,
    w.workflow_type,
    w.status as workflow_status,
    COUNT(pr.id) as pr_count,
    
    -- PR status distribution
    COUNT(pr.id) FILTER (WHERE pr.status = 'open') as open_prs,
    COUNT(pr.id) FILTER (WHERE pr.status = 'merged') as merged_prs,
    COUNT(pr.id) FILTER (WHERE pr.status = 'closed') as closed_prs,
    
    -- Quality aggregation
    AVG(pr.quality_score) as avg_pr_quality_score,
    AVG(pr.test_coverage_percentage) as avg_test_coverage,
    
    -- Workflow-PR timing correlation
    AVG(
        EXTRACT(EPOCH FROM (pr.created_at - w.started_at)) / 60
    ) FILTER (WHERE w.started_at IS NOT NULL) as avg_minutes_to_pr_creation,
    
    -- Success correlation
    CASE 
        WHEN w.status = 'completed' AND COUNT(pr.id) FILTER (WHERE pr.status = 'merged') > 0 THEN 'successful_with_merged_prs'
        WHEN w.status = 'completed' AND COUNT(pr.id) = 0 THEN 'successful_no_prs'
        WHEN w.status = 'failed' THEN 'failed_workflow'
        ELSE 'in_progress'
    END as workflow_pr_outcome
    
FROM workflows w
LEFT JOIN pr_tracking pr ON w.id = pr.workflow_id
GROUP BY w.id, w.name, w.workflow_type, w.status;

-- ============================================================================
-- SYSTEM METRICS AND MONITORING VIEWS
-- ============================================================================

-- System health dashboard
CREATE OR REPLACE VIEW system_health_dashboard AS
SELECT 
    sm.metric_category,
    sm.source_system,
    COUNT(DISTINCT sm.metric_name) as unique_metrics,
    
    -- Recent activity (last hour)
    COUNT(*) FILTER (WHERE sm.timestamp >= NOW() - INTERVAL '1 hour') as recent_metrics_count,
    
    -- Performance indicators
    AVG(sm.numeric_value) FILTER (
        WHERE sm.metric_name LIKE '%duration%' OR sm.metric_name LIKE '%time%'
    ) as avg_duration_metrics,
    
    AVG(sm.numeric_value) FILTER (
        WHERE sm.metric_name LIKE '%success%' OR sm.metric_name LIKE '%rate%'
    ) as avg_success_metrics,
    
    -- Error indicators
    COUNT(*) FILTER (
        WHERE sm.metric_name LIKE '%error%' OR sm.metric_name LIKE '%fail%'
    ) as error_metric_count,
    
    -- Resource usage
    AVG(sm.numeric_value) FILTER (
        WHERE sm.metric_name LIKE '%cpu%' OR sm.metric_name LIKE '%memory%'
    ) as avg_resource_usage,
    
    -- Latest values for key metrics
    (
        SELECT sm2.numeric_value 
        FROM system_metrics sm2 
        WHERE sm2.metric_category = sm.metric_category 
          AND sm2.source_system = sm.source_system
          AND sm2.metric_name = 'availability'
        ORDER BY sm2.timestamp DESC 
        LIMIT 1
    ) as latest_availability,
    
    MAX(sm.timestamp) as last_metric_timestamp
    
FROM system_metrics sm
WHERE sm.timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY sm.metric_category, sm.source_system;

-- Performance trends view
CREATE OR REPLACE VIEW performance_trends AS
SELECT 
    DATE_TRUNC('hour', sm.timestamp) as time_bucket,
    sm.metric_category,
    sm.metric_name,
    
    -- Aggregated values
    AVG(sm.numeric_value) as avg_value,
    MIN(sm.numeric_value) as min_value,
    MAX(sm.numeric_value) as max_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sm.numeric_value) as median_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY sm.numeric_value) as p95_value,
    
    -- Trend calculation (compared to previous hour)
    AVG(sm.numeric_value) - LAG(AVG(sm.numeric_value)) OVER (
        PARTITION BY sm.metric_category, sm.metric_name 
        ORDER BY DATE_TRUNC('hour', sm.timestamp)
    ) as hourly_change,
    
    COUNT(*) as sample_count
    
FROM system_metrics sm
WHERE sm.timestamp >= NOW() - INTERVAL '7 days'
  AND sm.numeric_value IS NOT NULL
GROUP BY DATE_TRUNC('hour', sm.timestamp), sm.metric_category, sm.metric_name
ORDER BY time_bucket DESC, sm.metric_category, sm.metric_name;

-- ============================================================================
-- AUDIT AND COMPLIANCE VIEWS
-- ============================================================================

-- Audit activity summary
CREATE OR REPLACE VIEW audit_activity_summary AS
SELECT 
    ale.entity_type,
    ale.action,
    ale.actor_type,
    COUNT(*) as activity_count,
    
    -- Temporal distribution
    COUNT(*) FILTER (WHERE ale.timestamp >= NOW() - INTERVAL '1 hour') as last_hour_count,
    COUNT(*) FILTER (WHERE ale.timestamp >= NOW() - INTERVAL '24 hours') as last_day_count,
    COUNT(*) FILTER (WHERE ale.timestamp >= NOW() - INTERVAL '7 days') as last_week_count,
    
    -- Success/failure analysis
    COUNT(*) FILTER (WHERE ale.action_result = 'success') as successful_actions,
    COUNT(*) FILTER (WHERE ale.action_result = 'failure') as failed_actions,
    ROUND((COUNT(*) FILTER (WHERE ale.action_result = 'success')::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
    
    -- Security level distribution
    COUNT(*) FILTER (WHERE ale.security_level = 'high') as high_security_events,
    COUNT(*) FILTER (WHERE ale.security_level = 'critical') as critical_security_events,
    
    -- Recent activity indicators
    MAX(ale.timestamp) as last_activity,
    MIN(ale.timestamp) as first_activity,
    
    -- Unique actors
    COUNT(DISTINCT ale.actor_id) as unique_actors
    
FROM audit_logs_enhanced ale
WHERE ale.timestamp >= NOW() - INTERVAL '30 days'
GROUP BY ale.entity_type, ale.action, ale.actor_type;

-- Security events view
CREATE OR REPLACE VIEW security_events_view AS
SELECT 
    ale.timestamp,
    ale.entity_type,
    ale.entity_id,
    ale.action,
    ale.actor_type,
    ale.actor_id,
    ale.security_level,
    ale.ip_address,
    ale.error_message,
    
    -- Risk scoring
    CASE 
        WHEN ale.security_level = 'critical' THEN 10
        WHEN ale.security_level = 'high' THEN 7
        WHEN ale.action_result = 'failure' AND ale.security_level = 'normal' THEN 5
        WHEN ale.action IN ('delete', 'execute') THEN 4
        ELSE 1
    END as risk_score,
    
    -- Context enrichment
    (
        SELECT COUNT(*) 
        FROM audit_logs_enhanced ale2 
        WHERE ale2.actor_id = ale.actor_id 
          AND ale2.action_result = 'failure'
          AND ale2.timestamp >= ale.timestamp - INTERVAL '1 hour'
          AND ale2.timestamp <= ale.timestamp
    ) as recent_failures_by_actor,
    
    -- Compliance tags
    ale.compliance_tags,
    ale.data_classification
    
FROM audit_logs_enhanced ale
WHERE ale.security_level IN ('high', 'critical')
   OR ale.action_result = 'failure'
   OR ale.action IN ('delete', 'execute')
ORDER BY ale.timestamp DESC;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON VIEW workflow_dashboard IS 'Comprehensive workflow status and progress tracking';
COMMENT ON VIEW workflow_performance_metrics IS 'Workflow performance analysis and trends';
COMMENT ON VIEW task_analytics IS 'Task performance and complexity analysis';
COMMENT ON VIEW task_dependency_analysis IS 'Task dependency relationships and critical path analysis';
COMMENT ON VIEW agent_performance_dashboard IS 'AI agent performance metrics and resource usage';
COMMENT ON VIEW agent_interaction_patterns IS 'Agent interaction patterns and success rates';
COMMENT ON VIEW pr_quality_dashboard IS 'Pull request quality metrics and velocity tracking';
COMMENT ON VIEW pr_workflow_integration IS 'Integration analysis between workflows and PRs';
COMMENT ON VIEW system_health_dashboard IS 'Overall system health and performance indicators';
COMMENT ON VIEW performance_trends IS 'Time-series performance trend analysis';
COMMENT ON VIEW audit_activity_summary IS 'Audit activity patterns and compliance tracking';
COMMENT ON VIEW security_events_view IS 'Security events monitoring and risk assessment';

