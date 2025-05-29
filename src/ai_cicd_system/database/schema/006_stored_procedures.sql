-- Migration: 006_stored_procedures.sql
-- Description: Stored procedures for complex operations in AI-driven CI/CD task orchestration
-- Created: 2025-05-28
-- Version: 2.0.0

-- ============================================================================
-- WORKFLOW MANAGEMENT PROCEDURES
-- ============================================================================

-- Create a complete workflow with tasks and dependencies
CREATE OR REPLACE FUNCTION create_workflow_with_tasks(
    p_workflow_name VARCHAR(255),
    p_workflow_type VARCHAR(50) DEFAULT 'ci_cd',
    p_description TEXT DEFAULT NULL,
    p_environment VARCHAR(50) DEFAULT 'development',
    p_priority INTEGER DEFAULT 0,
    p_configuration JSONB DEFAULT '{}'::jsonb,
    p_tasks JSONB DEFAULT '[]'::jsonb,
    p_triggered_by VARCHAR(255) DEFAULT 'system'
)
RETURNS TABLE(
    workflow_id UUID,
    task_ids UUID[],
    created_count INTEGER
) AS $$
DECLARE
    v_workflow_id UUID;
    v_task_id UUID;
    v_task_ids UUID[] := ARRAY[]::UUID[];
    v_task JSONB;
    v_execution_order INTEGER := 1;
    v_created_count INTEGER := 0;
BEGIN
    -- Create the workflow
    INSERT INTO workflows (
        name, workflow_type, description, environment, priority,
        configuration, triggered_by, status
    ) VALUES (
        p_workflow_name, p_workflow_type, p_description, p_environment, p_priority,
        p_configuration, p_triggered_by, 'pending'
    ) RETURNING id INTO v_workflow_id;
    
    -- Create tasks if provided
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks)
    LOOP
        -- Create the task
        INSERT INTO tasks (
            title, description, type, priority, complexity_score,
            requirements, acceptance_criteria, estimated_hours
        ) VALUES (
            v_task->>'title',
            v_task->>'description',
            COALESCE(v_task->>'type', 'general'),
            COALESCE((v_task->>'priority')::INTEGER, 0),
            COALESCE((v_task->>'complexity_score')::INTEGER, 5),
            COALESCE(v_task->'requirements', '[]'::jsonb),
            COALESCE(v_task->'acceptance_criteria', '[]'::jsonb),
            COALESCE((v_task->>'estimated_hours')::DECIMAL, NULL)
        ) RETURNING id INTO v_task_id;
        
        -- Link task to workflow
        INSERT INTO workflow_tasks (
            workflow_id, task_id, execution_order, is_parallel, is_optional, is_critical
        ) VALUES (
            v_workflow_id, v_task_id, v_execution_order,
            COALESCE((v_task->>'is_parallel')::BOOLEAN, FALSE),
            COALESCE((v_task->>'is_optional')::BOOLEAN, FALSE),
            COALESCE((v_task->>'is_critical')::BOOLEAN, TRUE)
        );
        
        v_task_ids := array_append(v_task_ids, v_task_id);
        v_execution_order := v_execution_order + 1;
        v_created_count := v_created_count + 1;
    END LOOP;
    
    RETURN QUERY SELECT v_workflow_id, v_task_ids, v_created_count;
END;
$$ LANGUAGE plpgsql;

-- Start a workflow and initialize first tasks
CREATE OR REPLACE FUNCTION start_workflow(
    p_workflow_id UUID,
    p_started_by VARCHAR(255) DEFAULT 'system'
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    started_tasks UUID[]
) AS $$
DECLARE
    v_workflow_status VARCHAR(50);
    v_started_tasks UUID[] := ARRAY[]::UUID[];
    v_task_id UUID;
    v_message TEXT;
BEGIN
    -- Check workflow exists and is in correct state
    SELECT status INTO v_workflow_status
    FROM workflows
    WHERE id = p_workflow_id;
    
    IF v_workflow_status IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Workflow not found', ARRAY[]::UUID[];
        RETURN;
    END IF;
    
    IF v_workflow_status != 'pending' THEN
        RETURN QUERY SELECT FALSE, 'Workflow is not in pending state', ARRAY[]::UUID[];
        RETURN;
    END IF;
    
    -- Update workflow status
    UPDATE workflows 
    SET status = 'running', started_at = NOW(), updated_by = p_started_by
    WHERE id = p_workflow_id;
    
    -- Start first tasks (execution_order = 1 or parallel tasks)
    FOR v_task_id IN 
        SELECT wt.task_id
        FROM workflow_tasks wt
        WHERE wt.workflow_id = p_workflow_id
          AND (wt.execution_order = 1 OR wt.is_parallel = TRUE)
          AND wt.status = 'pending'
    LOOP
        UPDATE workflow_tasks
        SET status = 'running', started_at = NOW()
        WHERE workflow_id = p_workflow_id AND task_id = v_task_id;
        
        UPDATE tasks
        SET status = 'in_progress'
        WHERE id = v_task_id;
        
        v_started_tasks := array_append(v_started_tasks, v_task_id);
    END LOOP;
    
    v_message := format('Workflow started successfully. %s tasks initiated.', array_length(v_started_tasks, 1));
    
    RETURN QUERY SELECT TRUE, v_message, v_started_tasks;
END;
$$ LANGUAGE plpgsql;

-- Complete a workflow task and trigger next tasks
CREATE OR REPLACE FUNCTION complete_workflow_task(
    p_workflow_id UUID,
    p_task_id UUID,
    p_result_data JSONB DEFAULT '{}'::jsonb,
    p_completed_by VARCHAR(255) DEFAULT 'system'
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    next_tasks UUID[],
    workflow_completed BOOLEAN
) AS $$
DECLARE
    v_task_order INTEGER;
    v_next_tasks UUID[] := ARRAY[]::UUID[];
    v_next_task_id UUID;
    v_pending_tasks INTEGER;
    v_workflow_completed BOOLEAN := FALSE;
    v_message TEXT;
BEGIN
    -- Get current task execution order
    SELECT execution_order INTO v_task_order
    FROM workflow_tasks
    WHERE workflow_id = p_workflow_id AND task_id = p_task_id;
    
    IF v_task_order IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Task not found in workflow', ARRAY[]::UUID[], FALSE;
        RETURN;
    END IF;
    
    -- Complete the current task
    UPDATE workflow_tasks
    SET status = 'completed', completed_at = NOW(), result_data = p_result_data
    WHERE workflow_id = p_workflow_id AND task_id = p_task_id;
    
    UPDATE tasks
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_task_id;
    
    -- Find and start next tasks
    FOR v_next_task_id IN
        SELECT wt.task_id
        FROM workflow_tasks wt
        WHERE wt.workflow_id = p_workflow_id
          AND wt.execution_order = v_task_order + 1
          AND wt.status = 'pending'
          AND NOT EXISTS (
              -- Check that all dependencies are completed
              SELECT 1 FROM workflow_tasks wt2
              WHERE wt2.workflow_id = p_workflow_id
                AND wt2.execution_order < wt.execution_order
                AND wt2.status NOT IN ('completed', 'skipped')
                AND wt2.is_parallel = FALSE
          )
    LOOP
        UPDATE workflow_tasks
        SET status = 'running', started_at = NOW()
        WHERE workflow_id = p_workflow_id AND task_id = v_next_task_id;
        
        UPDATE tasks
        SET status = 'in_progress'
        WHERE id = v_next_task_id;
        
        v_next_tasks := array_append(v_next_tasks, v_next_task_id);
    END LOOP;
    
    -- Check if workflow is completed
    SELECT COUNT(*) INTO v_pending_tasks
    FROM workflow_tasks
    WHERE workflow_id = p_workflow_id
      AND status IN ('pending', 'running')
      AND is_optional = FALSE;
    
    IF v_pending_tasks = 0 THEN
        UPDATE workflows
        SET status = 'completed', completed_at = NOW(), updated_by = p_completed_by
        WHERE id = p_workflow_id;
        
        v_workflow_completed := TRUE;
        v_message := 'Task completed. Workflow finished successfully.';
    ELSE
        v_message := format('Task completed. %s next tasks started.', array_length(v_next_tasks, 1));
    END IF;
    
    RETURN QUERY SELECT TRUE, v_message, v_next_tasks, v_workflow_completed;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AGENT SESSION MANAGEMENT PROCEDURES
-- ============================================================================

-- Create and initialize an agent session
CREATE OR REPLACE FUNCTION create_agent_session(
    p_agent_name VARCHAR(100),
    p_agent_type VARCHAR(50) DEFAULT 'ai_assistant',
    p_agent_version VARCHAR(50) DEFAULT NULL,
    p_workflow_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_session_data JSONB DEFAULT '{}'::jsonb,
    p_expires_in_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
    session_id UUID,
    session_key VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_session_id UUID;
    v_session_key VARCHAR(255);
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Generate session ID and key
    v_session_id := uuid_generate_v4();
    v_session_key := encode(gen_random_bytes(32), 'hex');
    v_expires_at := NOW() + (p_expires_in_hours || ' hours')::INTERVAL;
    
    -- Create the session
    INSERT INTO agent_sessions (
        id, session_id, agent_name, agent_type, agent_version,
        workflow_id, task_id, session_data, expires_at, status
    ) VALUES (
        v_session_id, v_session_key, p_agent_name, p_agent_type, p_agent_version,
        p_workflow_id, p_task_id, p_session_data, v_expires_at, 'active'
    );
    
    RETURN QUERY SELECT v_session_id, v_session_key, v_expires_at;
END;
$$ LANGUAGE plpgsql;

-- Record an agent interaction with automatic session updates
CREATE OR REPLACE FUNCTION record_agent_interaction(
    p_session_id UUID,
    p_interaction_type VARCHAR(50),
    p_request_data JSONB,
    p_response_data JSONB DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL,
    p_tokens_used INTEGER DEFAULT 0,
    p_cost_usd DECIMAL(10,4) DEFAULT 0,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_code VARCHAR(50) DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS TABLE(
    interaction_id UUID,
    session_updated BOOLEAN
) AS $$
DECLARE
    v_interaction_id UUID;
    v_session_exists BOOLEAN;
    v_interaction_sequence INTEGER;
BEGIN
    -- Check if session exists and get next sequence number
    SELECT 
        TRUE,
        COALESCE(MAX(ai.interaction_sequence), 0) + 1
    INTO v_session_exists, v_interaction_sequence
    FROM agent_sessions ags
    LEFT JOIN agent_interactions ai ON ags.id = ai.session_id
    WHERE ags.id = p_session_id
    GROUP BY ags.id;
    
    IF NOT v_session_exists THEN
        RAISE EXCEPTION 'Agent session not found: %', p_session_id;
    END IF;
    
    -- Create the interaction record
    INSERT INTO agent_interactions (
        session_id, interaction_type, interaction_sequence,
        request_data, response_data, duration_ms, tokens_used, cost_usd,
        status, success, error_code, error_message, completed_at
    ) VALUES (
        p_session_id, p_interaction_type, v_interaction_sequence,
        p_request_data, p_response_data, p_duration_ms, p_tokens_used, p_cost_usd,
        CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        p_success, p_error_code, p_error_message, NOW()
    ) RETURNING id INTO v_interaction_id;
    
    -- Session statistics will be updated automatically by trigger
    
    RETURN QUERY SELECT v_interaction_id, TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PR TRACKING PROCEDURES
-- ============================================================================

-- Create or update PR tracking record
CREATE OR REPLACE FUNCTION upsert_pr_tracking(
    p_pr_number INTEGER,
    p_repository_name VARCHAR(255),
    p_pr_url VARCHAR(500),
    p_title VARCHAR(500),
    p_description TEXT DEFAULT NULL,
    p_branch_name VARCHAR(255),
    p_base_branch VARCHAR(255) DEFAULT 'main',
    p_author VARCHAR(255) DEFAULT NULL,
    p_workflow_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    pr_id UUID,
    is_new_record BOOLEAN
) AS $$
DECLARE
    v_pr_id UUID;
    v_is_new BOOLEAN;
BEGIN
    -- Try to update existing record
    UPDATE pr_tracking
    SET 
        title = p_title,
        description = p_description,
        pr_url = p_pr_url,
        workflow_id = COALESCE(p_workflow_id, workflow_id),
        task_id = COALESCE(p_task_id, task_id),
        metadata = p_metadata,
        updated_at = NOW()
    WHERE repository_name = p_repository_name AND pr_number = p_pr_number
    RETURNING id INTO v_pr_id;
    
    IF v_pr_id IS NOT NULL THEN
        v_is_new := FALSE;
    ELSE
        -- Create new record
        INSERT INTO pr_tracking (
            pr_number, repository_name, pr_url, title, description,
            branch_name, base_branch, author, workflow_id, task_id, metadata
        ) VALUES (
            p_pr_number, p_repository_name, p_pr_url, p_title, p_description,
            p_branch_name, p_base_branch, p_author, p_workflow_id, p_task_id, p_metadata
        ) RETURNING id INTO v_pr_id;
        
        v_is_new := TRUE;
    END IF;
    
    RETURN QUERY SELECT v_pr_id, v_is_new;
END;
$$ LANGUAGE plpgsql;

-- Update PR validation results
CREATE OR REPLACE FUNCTION update_pr_validation_results(
    p_pr_id UUID,
    p_ci_status VARCHAR(50) DEFAULT NULL,
    p_test_coverage_percentage DECIMAL(5,2) DEFAULT NULL,
    p_quality_score DECIMAL(5,2) DEFAULT NULL,
    p_security_scan_status VARCHAR(50) DEFAULT NULL,
    p_review_status VARCHAR(50) DEFAULT NULL,
    p_merge_status VARCHAR(50) DEFAULT NULL,
    p_validation_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    success BOOLEAN,
    updated_fields TEXT[]
) AS $$
DECLARE
    v_updated_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
    UPDATE pr_tracking
    SET 
        ci_status = COALESCE(p_ci_status, ci_status),
        test_coverage_percentage = COALESCE(p_test_coverage_percentage, test_coverage_percentage),
        quality_score = COALESCE(p_quality_score, quality_score),
        security_scan_status = COALESCE(p_security_scan_status, security_scan_status),
        review_status = COALESCE(p_review_status, review_status),
        merge_status = COALESCE(p_merge_status, merge_status),
        metadata = metadata || p_validation_metadata,
        updated_at = NOW()
    WHERE id = p_pr_id;
    
    IF FOUND THEN
        -- Track which fields were updated
        IF p_ci_status IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'ci_status');
        END IF;
        IF p_test_coverage_percentage IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'test_coverage_percentage');
        END IF;
        IF p_quality_score IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'quality_score');
        END IF;
        IF p_security_scan_status IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'security_scan_status');
        END IF;
        IF p_review_status IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'review_status');
        END IF;
        IF p_merge_status IS NOT NULL THEN
            v_updated_fields := array_append(v_updated_fields, 'merge_status');
        END IF;
        
        RETURN QUERY SELECT TRUE, v_updated_fields;
    ELSE
        RETURN QUERY SELECT FALSE, ARRAY[]::TEXT[];
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- METRICS AND ANALYTICS PROCEDURES
-- ============================================================================

-- Bulk insert system metrics with deduplication
CREATE OR REPLACE FUNCTION bulk_insert_system_metrics(
    p_metrics JSONB
)
RETURNS TABLE(
    inserted_count INTEGER,
    skipped_count INTEGER,
    error_count INTEGER
) AS $$
DECLARE
    v_metric JSONB;
    v_inserted_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    FOR v_metric IN SELECT * FROM jsonb_array_elements(p_metrics)
    LOOP
        BEGIN
            INSERT INTO system_metrics (
                metric_category, metric_name, metric_type,
                numeric_value, string_value, boolean_value, json_value,
                dimensions, tags, workflow_id, task_id, session_id,
                source_system, source_component, timestamp
            ) VALUES (
                v_metric->>'metric_category',
                v_metric->>'metric_name',
                COALESCE(v_metric->>'metric_type', 'gauge'),
                (v_metric->>'numeric_value')::DECIMAL,
                v_metric->>'string_value',
                (v_metric->>'boolean_value')::BOOLEAN,
                v_metric->'json_value',
                COALESCE(v_metric->'dimensions', '{}'::jsonb),
                COALESCE(v_metric->'tags', '{}'::jsonb),
                (v_metric->>'workflow_id')::UUID,
                (v_metric->>'task_id')::UUID,
                (v_metric->>'session_id')::UUID,
                v_metric->>'source_system',
                v_metric->>'source_component',
                COALESCE((v_metric->>'timestamp')::TIMESTAMP WITH TIME ZONE, NOW())
            );
            
            v_inserted_count := v_inserted_count + 1;
            
        EXCEPTION 
            WHEN unique_violation THEN
                v_skipped_count := v_skipped_count + 1;
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_inserted_count, v_skipped_count, v_error_count;
END;
$$ LANGUAGE plpgsql;

-- Calculate workflow performance summary
CREATE OR REPLACE FUNCTION calculate_workflow_performance_summary(
    p_workflow_type VARCHAR(50) DEFAULT NULL,
    p_environment VARCHAR(50) DEFAULT NULL,
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE(
    workflow_type VARCHAR(50),
    environment VARCHAR(50),
    total_workflows BIGINT,
    completed_workflows BIGINT,
    failed_workflows BIGINT,
    success_rate DECIMAL(5,2),
    avg_duration_minutes DECIMAL(10,2),
    median_duration_minutes DECIMAL(10,2),
    p95_duration_minutes DECIMAL(10,2),
    avg_tasks_per_workflow DECIMAL(10,2),
    avg_estimation_accuracy DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.workflow_type,
        w.environment,
        COUNT(*) as total_workflows,
        COUNT(*) FILTER (WHERE w.status = 'completed') as completed_workflows,
        COUNT(*) FILTER (WHERE w.status = 'failed') as failed_workflows,
        ROUND((COUNT(*) FILTER (WHERE w.status = 'completed')::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
        ROUND(AVG(w.actual_duration_minutes) FILTER (WHERE w.status = 'completed'), 2) as avg_duration_minutes,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY w.actual_duration_minutes) 
              FILTER (WHERE w.status = 'completed'), 2) as median_duration_minutes,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY w.actual_duration_minutes) 
              FILTER (WHERE w.status = 'completed'), 2) as p95_duration_minutes,
        ROUND(AVG(task_counts.task_count), 2) as avg_tasks_per_workflow,
        ROUND(AVG(
            CASE 
                WHEN w.estimated_duration_minutes > 0 AND w.actual_duration_minutes IS NOT NULL THEN
                    (1 - ABS(w.actual_duration_minutes - w.estimated_duration_minutes) / w.estimated_duration_minutes) * 100
                ELSE NULL
            END
        ), 2) as avg_estimation_accuracy
    FROM workflows w
    LEFT JOIN (
        SELECT wt.workflow_id, COUNT(*) as task_count
        FROM workflow_tasks wt
        GROUP BY wt.workflow_id
    ) task_counts ON w.id = task_counts.workflow_id
    WHERE w.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
      AND (p_workflow_type IS NULL OR w.workflow_type = p_workflow_type)
      AND (p_environment IS NULL OR w.environment = p_environment)
    GROUP BY w.workflow_type, w.environment
    ORDER BY w.workflow_type, w.environment;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MAINTENANCE AND CLEANUP PROCEDURES
-- ============================================================================

-- Comprehensive database maintenance procedure
CREATE OR REPLACE FUNCTION perform_database_maintenance(
    p_vacuum_analyze BOOLEAN DEFAULT TRUE,
    p_cleanup_old_data BOOLEAN DEFAULT TRUE,
    p_update_statistics BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    operation VARCHAR(50),
    status VARCHAR(20),
    details TEXT,
    duration_seconds INTEGER
) AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_duration INTEGER;
    v_deleted_count INTEGER;
BEGIN
    -- Vacuum and analyze tables
    IF p_vacuum_analyze THEN
        v_start_time := clock_timestamp();
        
        VACUUM ANALYZE workflows;
        VACUUM ANALYZE tasks;
        VACUUM ANALYZE agent_sessions;
        VACUUM ANALYZE agent_interactions;
        VACUUM ANALYZE pr_tracking;
        VACUUM ANALYZE system_metrics;
        VACUUM ANALYZE audit_logs_enhanced;
        
        v_end_time := clock_timestamp();
        v_duration := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER;
        
        RETURN QUERY SELECT 'vacuum_analyze'::VARCHAR(50), 'completed'::VARCHAR(20), 
                           'All tables vacuumed and analyzed'::TEXT, v_duration;
    END IF;
    
    -- Cleanup old data
    IF p_cleanup_old_data THEN
        v_start_time := clock_timestamp();
        
        -- Cleanup old audit logs (older than 90 days)
        SELECT cleanup_old_audit_logs() INTO v_deleted_count;
        
        -- Cleanup expired sessions
        SELECT expire_inactive_sessions() INTO v_deleted_count;
        
        -- Cleanup old system metrics (older than 1 year)
        DELETE FROM system_metrics 
        WHERE timestamp < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        
        v_end_time := clock_timestamp();
        v_duration := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER;
        
        RETURN QUERY SELECT 'cleanup_old_data'::VARCHAR(50), 'completed'::VARCHAR(20),
                           format('Cleaned up old data, %s records affected', v_deleted_count)::TEXT, v_duration;
    END IF;
    
    -- Update statistics
    IF p_update_statistics THEN
        v_start_time := clock_timestamp();
        
        -- Calculate aggregated metrics
        PERFORM calculate_aggregated_metrics();
        
        v_end_time := clock_timestamp();
        v_duration := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER;
        
        RETURN QUERY SELECT 'update_statistics'::VARCHAR(50), 'completed'::VARCHAR(20),
                           'Statistics updated successfully'::TEXT, v_duration;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Health check procedure
CREATE OR REPLACE FUNCTION database_health_check()
RETURNS TABLE(
    check_name VARCHAR(50),
    status VARCHAR(20),
    value TEXT,
    threshold TEXT,
    message TEXT
) AS $$
DECLARE
    v_connection_count INTEGER;
    v_slow_queries INTEGER;
    v_table_sizes RECORD;
    v_index_usage RECORD;
BEGIN
    -- Check connection count
    SELECT count(*) INTO v_connection_count
    FROM pg_stat_activity
    WHERE state = 'active';
    
    RETURN QUERY SELECT 
        'active_connections'::VARCHAR(50),
        CASE WHEN v_connection_count < 50 THEN 'healthy' ELSE 'warning' END::VARCHAR(20),
        v_connection_count::TEXT,
        '< 50'::TEXT,
        CASE WHEN v_connection_count < 50 THEN 'Connection count is normal' 
             ELSE 'High connection count detected' END::TEXT;
    
    -- Check for slow queries
    SELECT count(*) INTO v_slow_queries
    FROM pg_stat_activity
    WHERE state = 'active' 
      AND query_start < NOW() - INTERVAL '30 seconds'
      AND query NOT LIKE '%pg_stat_activity%';
    
    RETURN QUERY SELECT 
        'slow_queries'::VARCHAR(50),
        CASE WHEN v_slow_queries = 0 THEN 'healthy' ELSE 'warning' END::VARCHAR(20),
        v_slow_queries::TEXT,
        '0'::TEXT,
        CASE WHEN v_slow_queries = 0 THEN 'No slow queries detected' 
             ELSE format('%s slow queries detected', v_slow_queries) END::TEXT;
    
    -- Check table sizes
    FOR v_table_sizes IN
        SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename IN ('workflows', 'tasks', 'agent_sessions', 'system_metrics', 'audit_logs_enhanced')
    LOOP
        RETURN QUERY SELECT 
            ('table_size_' || v_table_sizes.tablename)::VARCHAR(50),
            'info'::VARCHAR(20),
            v_table_sizes.size::TEXT,
            'N/A'::TEXT,
            format('Table %s size: %s', v_table_sizes.tablename, v_table_sizes.size)::TEXT;
    END LOOP;
    
    -- Check recent activity
    RETURN QUERY SELECT 
        'recent_workflows'::VARCHAR(50),
        'info'::VARCHAR(20),
        (SELECT count(*)::TEXT FROM workflows WHERE created_at >= NOW() - INTERVAL '24 hours'),
        'N/A'::TEXT,
        'Workflows created in last 24 hours'::TEXT;
    
    RETURN QUERY SELECT 
        'recent_tasks'::VARCHAR(50),
        'info'::VARCHAR(20),
        (SELECT count(*)::TEXT FROM tasks WHERE created_at >= NOW() - INTERVAL '24 hours'),
        'N/A'::TEXT,
        'Tasks created in last 24 hours'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION create_workflow_with_tasks IS 'Creates a complete workflow with associated tasks and dependencies';
COMMENT ON FUNCTION start_workflow IS 'Starts a workflow and initializes the first set of tasks';
COMMENT ON FUNCTION complete_workflow_task IS 'Completes a workflow task and triggers next tasks in sequence';
COMMENT ON FUNCTION create_agent_session IS 'Creates and initializes a new agent session with expiration';
COMMENT ON FUNCTION record_agent_interaction IS 'Records an agent interaction and updates session statistics';
COMMENT ON FUNCTION upsert_pr_tracking IS 'Creates or updates PR tracking record with conflict resolution';
COMMENT ON FUNCTION update_pr_validation_results IS 'Updates PR validation results from CI/CD pipeline';
COMMENT ON FUNCTION bulk_insert_system_metrics IS 'Bulk inserts system metrics with error handling';
COMMENT ON FUNCTION calculate_workflow_performance_summary IS 'Calculates comprehensive workflow performance metrics';
COMMENT ON FUNCTION perform_database_maintenance IS 'Performs comprehensive database maintenance operations';
COMMENT ON FUNCTION database_health_check IS 'Performs database health check and returns status information';

