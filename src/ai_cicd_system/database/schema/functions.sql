-- Stored Procedures and Functions for AI-Driven CI/CD System
-- Description: Database functions for business logic, monitoring, and automation
-- Version: 2.0.0
-- Created: 2025-05-28

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate correlation IDs
CREATE OR REPLACE FUNCTION generate_correlation_id()
RETURNS VARCHAR(255) AS $$
BEGIN
    RETURN 'corr_' || to_char(NOW(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to validate JSON schema (basic validation)
CREATE OR REPLACE FUNCTION validate_json_schema(json_data JSONB, required_fields TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    field TEXT;
BEGIN
    -- Check if all required fields are present
    FOREACH field IN ARRAY required_fields
    LOOP
        IF NOT (json_data ? field) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TASK MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to create a new task with validation
CREATE OR REPLACE FUNCTION create_task(
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_type VARCHAR(50) DEFAULT 'general',
    p_priority INTEGER DEFAULT 0,
    p_assigned_to VARCHAR(255) DEFAULT NULL,
    p_parent_task_id UUID DEFAULT NULL,
    p_requirements JSONB DEFAULT '[]'::jsonb,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    new_task_id UUID;
    parent_complexity INTEGER;
BEGIN
    -- Validate inputs
    IF p_title IS NULL OR trim(p_title) = '' THEN
        RAISE EXCEPTION 'Task title cannot be empty';
    END IF;
    
    IF p_priority < 0 OR p_priority > 10 THEN
        RAISE EXCEPTION 'Task priority must be between 0 and 10';
    END IF;
    
    -- If parent task exists, inherit some properties
    IF p_parent_task_id IS NOT NULL THEN
        SELECT complexity_score INTO parent_complexity
        FROM tasks 
        WHERE id = p_parent_task_id;
        
        IF parent_complexity IS NULL THEN
            RAISE EXCEPTION 'Parent task % does not exist', p_parent_task_id;
        END IF;
    END IF;
    
    -- Create the task
    INSERT INTO tasks (
        title, description, type, priority, assigned_to, 
        parent_task_id, requirements, metadata
    ) VALUES (
        p_title, p_description, p_type, p_priority, p_assigned_to,
        p_parent_task_id, p_requirements, p_metadata
    ) RETURNING id INTO new_task_id;
    
    -- Create initial context
    INSERT INTO task_contexts (task_id, context_type, context_data)
    VALUES (new_task_id, 'requirement', jsonb_build_object(
        'created_by', 'system',
        'initial_requirements', p_requirements,
        'creation_timestamp', NOW()
    ));
    
    RETURN new_task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update task status with validation
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id UUID,
    p_new_status VARCHAR(50),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_status VARCHAR(50);
    valid_transitions TEXT[];
BEGIN
    -- Get current status
    SELECT status INTO current_status
    FROM tasks 
    WHERE id = p_task_id;
    
    IF current_status IS NULL THEN
        RAISE EXCEPTION 'Task % does not exist', p_task_id;
    END IF;
    
    -- Define valid status transitions
    CASE current_status
        WHEN 'pending' THEN
            valid_transitions := ARRAY['in_progress', 'cancelled', 'blocked'];
        WHEN 'in_progress' THEN
            valid_transitions := ARRAY['completed', 'failed', 'cancelled', 'blocked'];
        WHEN 'blocked' THEN
            valid_transitions := ARRAY['pending', 'in_progress', 'cancelled'];
        WHEN 'completed' THEN
            valid_transitions := ARRAY['in_progress']; -- Allow reopening
        WHEN 'failed' THEN
            valid_transitions := ARRAY['pending', 'in_progress'];
        WHEN 'cancelled' THEN
            valid_transitions := ARRAY['pending'];
        ELSE
            RAISE EXCEPTION 'Unknown current status: %', current_status;
    END CASE;
    
    -- Validate transition
    IF NOT (p_new_status = ANY(valid_transitions)) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', current_status, p_new_status;
    END IF;
    
    -- Update task status
    UPDATE tasks 
    SET 
        status = p_new_status,
        completed_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_task_id;
    
    -- Log status change
    INSERT INTO task_contexts (task_id, context_type, context_data)
    VALUES (p_task_id, 'status_change', jsonb_build_object(
        'from_status', current_status,
        'to_status', p_new_status,
        'changed_by', COALESCE(p_user_id, 'system'),
        'notes', p_notes,
        'timestamp', NOW()
    ));
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get task hierarchy
CREATE OR REPLACE FUNCTION get_task_hierarchy(p_task_id UUID)
RETURNS TABLE(
    task_id UUID,
    title VARCHAR(255),
    status VARCHAR(50),
    level INTEGER,
    path TEXT
) AS $$
WITH RECURSIVE task_tree AS (
    -- Base case: start with the given task
    SELECT 
        t.id as task_id,
        t.title,
        t.status,
        0 as level,
        t.title as path
    FROM tasks t
    WHERE t.id = p_task_id
    
    UNION ALL
    
    -- Recursive case: find child tasks
    SELECT 
        t.id as task_id,
        t.title,
        t.status,
        tt.level + 1,
        tt.path || ' > ' || t.title
    FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.task_id
)
SELECT * FROM task_tree ORDER BY level, title;
$$ LANGUAGE sql;

-- Function to calculate task completion percentage
CREATE OR REPLACE FUNCTION calculate_task_completion(p_task_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_subtasks INTEGER;
    completed_subtasks INTEGER;
    completion_percentage DECIMAL(5,2);
BEGIN
    -- Count total and completed subtasks
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END)
    INTO total_subtasks, completed_subtasks
    FROM tasks
    WHERE parent_task_id = p_task_id;
    
    -- If no subtasks, check if main task is completed
    IF total_subtasks = 0 THEN
        SELECT CASE WHEN status = 'completed' THEN 100.0 ELSE 0.0 END
        INTO completion_percentage
        FROM tasks
        WHERE id = p_task_id;
    ELSE
        completion_percentage := (completed_subtasks::DECIMAL / total_subtasks::DECIMAL) * 100.0;
    END IF;
    
    RETURN completion_percentage;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- WORKFLOW MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to create a new workflow
CREATE OR REPLACE FUNCTION create_workflow(
    p_task_id UUID,
    p_workflow_type VARCHAR(50) DEFAULT 'standard',
    p_total_steps INTEGER DEFAULT 0,
    p_timeout_minutes INTEGER DEFAULT 60
)
RETURNS UUID AS $$
DECLARE
    new_workflow_id UUID;
    task_exists BOOLEAN;
BEGIN
    -- Validate task exists
    SELECT EXISTS(SELECT 1 FROM tasks WHERE id = p_task_id) INTO task_exists;
    IF NOT task_exists THEN
        RAISE EXCEPTION 'Task % does not exist', p_task_id;
    END IF;
    
    -- Create workflow
    INSERT INTO workflows (
        task_id, workflow_type, total_steps, timeout_minutes
    ) VALUES (
        p_task_id, p_workflow_type, p_total_steps, p_timeout_minutes
    ) RETURNING id INTO new_workflow_id;
    
    RETURN new_workflow_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update workflow step
CREATE OR REPLACE FUNCTION update_workflow_step(
    p_workflow_id UUID,
    p_step_name VARCHAR(100),
    p_step_status VARCHAR(50),
    p_step_result JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_steps JSONB;
    new_step JSONB;
BEGIN
    -- Get current steps
    SELECT steps_completed INTO current_steps
    FROM workflows
    WHERE id = p_workflow_id;
    
    IF current_steps IS NULL THEN
        RAISE EXCEPTION 'Workflow % does not exist', p_workflow_id;
    END IF;
    
    -- Create new step entry
    new_step := jsonb_build_object(
        'step_name', p_step_name,
        'status', p_step_status,
        'timestamp', NOW(),
        'result', p_step_result,
        'error_message', p_error_message
    );
    
    -- Update workflow
    UPDATE workflows
    SET 
        current_step = p_step_name,
        steps_completed = current_steps || new_step,
        status = CASE 
            WHEN p_step_status = 'failed' THEN 'failed'
            WHEN p_step_status = 'completed' AND current_step = 'final' THEN 'completed'
            ELSE status
        END,
        completed_at = CASE 
            WHEN p_step_status = 'failed' OR (p_step_status = 'completed' AND current_step = 'final') 
            THEN NOW() 
            ELSE completed_at 
        END,
        error_log = CASE 
            WHEN p_error_message IS NOT NULL 
            THEN error_log || jsonb_build_object(
                'step', p_step_name,
                'error', p_error_message,
                'timestamp', NOW()
            )
            ELSE error_log
        END
    WHERE id = p_workflow_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MONITORING AND METRICS FUNCTIONS
-- =====================================================

-- Function to record system metric
CREATE OR REPLACE FUNCTION record_metric(
    p_metric_name VARCHAR(100),
    p_metric_value NUMERIC,
    p_component VARCHAR(100) DEFAULT NULL,
    p_metric_type VARCHAR(50) DEFAULT 'gauge',
    p_tags JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    metric_id UUID;
BEGIN
    INSERT INTO system_metrics (
        metric_name, metric_value, component, metric_type, tags
    ) VALUES (
        p_metric_name, p_metric_value, p_component, p_metric_type, p_tags
    ) RETURNING id INTO metric_id;
    
    RETURN metric_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get system health summary
CREATE OR REPLACE FUNCTION get_system_health()
RETURNS TABLE(
    component VARCHAR(100),
    status VARCHAR(20),
    last_check TIMESTAMP WITH TIME ZONE,
    metrics_count BIGINT,
    avg_response_time NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sm.component,
        CASE 
            WHEN MAX(sm.recorded_at) < NOW() - INTERVAL '5 minutes' THEN 'stale'
            WHEN AVG(sm.metric_value) > 1000 THEN 'slow'
            ELSE 'healthy'
        END as status,
        MAX(sm.recorded_at) as last_check,
        COUNT(*) as metrics_count,
        AVG(sm.metric_value) as avg_response_time
    FROM system_metrics sm
    WHERE sm.recorded_at > NOW() - INTERVAL '1 hour'
    AND sm.metric_name LIKE '%response_time%'
    GROUP BY sm.component
    ORDER BY sm.component;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_data(
    p_audit_retention_days INTEGER DEFAULT 90,
    p_metrics_retention_days INTEGER DEFAULT 30,
    p_api_logs_retention_days INTEGER DEFAULT 7
)
RETURNS TABLE(
    table_name TEXT,
    deleted_count BIGINT
) AS $$
DECLARE
    audit_deleted BIGINT;
    metrics_deleted BIGINT;
    api_logs_deleted BIGINT;
BEGIN
    -- Cleanup audit logs
    DELETE FROM audit_logs 
    WHERE timestamp < NOW() - (p_audit_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS audit_deleted = ROW_COUNT;
    
    -- Cleanup old metrics
    DELETE FROM system_metrics 
    WHERE recorded_at < NOW() - (p_metrics_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS metrics_deleted = ROW_COUNT;
    
    -- Cleanup API access logs
    DELETE FROM api_access_logs 
    WHERE timestamp < NOW() - (p_api_logs_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS api_logs_deleted = ROW_COUNT;
    
    -- Return results
    RETURN QUERY VALUES 
        ('audit_logs', audit_deleted),
        ('system_metrics', metrics_deleted),
        ('api_access_logs', api_logs_deleted);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- EXTERNAL INTEGRATION FUNCTIONS
-- =====================================================

-- Function to log API call
CREATE OR REPLACE FUNCTION log_api_call(
    p_integration_name VARCHAR(100),
    p_endpoint VARCHAR(255),
    p_method VARCHAR(10),
    p_response_status INTEGER,
    p_response_time_ms INTEGER,
    p_task_id UUID DEFAULT NULL,
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    integration_id UUID;
    log_id UUID;
BEGIN
    -- Get integration ID
    SELECT id INTO integration_id
    FROM external_integrations
    WHERE integration_name = p_integration_name;
    
    -- Create API log entry
    INSERT INTO api_access_logs (
        integration_id, endpoint, method, response_status, 
        response_time_ms, task_id, user_id, error_message,
        correlation_id
    ) VALUES (
        integration_id, p_endpoint, p_method, p_response_status,
        p_response_time_ms, p_task_id, p_user_id, p_error_message,
        generate_correlation_id()
    ) RETURNING id INTO log_id;
    
    -- Update integration usage
    UPDATE external_integrations
    SET 
        current_usage = current_usage + 1,
        last_used_at = NOW()
    WHERE id = integration_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(p_integration_name VARCHAR(100))
RETURNS BOOLEAN AS $$
DECLARE
    current_usage INTEGER;
    rate_limit INTEGER;
    reset_time TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT current_usage, rate_limit_per_minute, usage_reset_at
    INTO current_usage, rate_limit, reset_time
    FROM external_integrations
    WHERE integration_name = p_integration_name;
    
    -- Reset if time has passed
    IF reset_time <= NOW() THEN
        UPDATE external_integrations
        SET 
            current_usage = 0,
            usage_reset_at = NOW() + INTERVAL '1 minute'
        WHERE integration_name = p_integration_name;
        RETURN TRUE;
    END IF;
    
    -- Check if under limit
    RETURN current_usage < rate_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- REPORTING FUNCTIONS
-- =====================================================

-- Function to get task statistics
CREATE OR REPLACE FUNCTION get_task_statistics(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    status VARCHAR(50),
    count BIGINT,
    avg_completion_time INTERVAL,
    avg_complexity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.status,
        COUNT(*) as count,
        AVG(t.completed_at - t.created_at) as avg_completion_time,
        AVG(t.complexity_score) as avg_complexity
    FROM tasks t
    WHERE t.created_at::DATE BETWEEN p_start_date AND p_end_date
    GROUP BY t.status
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get workflow performance metrics
CREATE OR REPLACE FUNCTION get_workflow_performance()
RETURNS TABLE(
    workflow_type VARCHAR(50),
    total_workflows BIGINT,
    success_rate NUMERIC,
    avg_duration INTERVAL,
    avg_retry_count NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.workflow_type,
        COUNT(*) as total_workflows,
        (COUNT(CASE WHEN w.status = 'completed' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate,
        AVG(w.completed_at - w.started_at) as avg_duration,
        AVG(w.retry_count) as avg_retry_count
    FROM workflows w
    WHERE w.started_at > NOW() - INTERVAL '30 days'
    GROUP BY w.workflow_type
    ORDER BY total_workflows DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- AUDIT TRIGGER FUNCTION
-- =====================================================

-- Enhanced audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    correlation_id VARCHAR(255);
BEGIN
    -- Generate correlation ID for this operation
    correlation_id := generate_correlation_id();
    
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (
            entity_type, entity_id, action, new_values, 
            correlation_id, timestamp
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'create', row_to_json(NEW),
            correlation_id, NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (
            entity_type, entity_id, action, old_values, new_values,
            correlation_id, timestamp
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'update', row_to_json(OLD), row_to_json(NEW),
            correlation_id, NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (
            entity_type, entity_id, action, old_values,
            correlation_id, timestamp
        ) VALUES (
            TG_TABLE_NAME, OLD.id, 'delete', row_to_json(OLD),
            correlation_id, NOW()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION COMMENTS
-- =====================================================

COMMENT ON FUNCTION create_task IS 'Creates a new task with validation and initial context';
COMMENT ON FUNCTION update_task_status IS 'Updates task status with transition validation and logging';
COMMENT ON FUNCTION get_task_hierarchy IS 'Returns hierarchical view of tasks and subtasks';
COMMENT ON FUNCTION calculate_task_completion IS 'Calculates completion percentage based on subtasks';
COMMENT ON FUNCTION create_workflow IS 'Creates a new workflow for task execution';
COMMENT ON FUNCTION update_workflow_step IS 'Updates workflow step progress and status';
COMMENT ON FUNCTION record_metric IS 'Records a system performance metric';
COMMENT ON FUNCTION get_system_health IS 'Returns system health summary by component';
COMMENT ON FUNCTION cleanup_old_data IS 'Removes old data based on retention policies';
COMMENT ON FUNCTION log_api_call IS 'Logs external API calls for monitoring';
COMMENT ON FUNCTION check_rate_limit IS 'Checks if API rate limit allows new requests';
COMMENT ON FUNCTION get_task_statistics IS 'Returns task statistics for a date range';
COMMENT ON FUNCTION get_workflow_performance IS 'Returns workflow performance metrics';

