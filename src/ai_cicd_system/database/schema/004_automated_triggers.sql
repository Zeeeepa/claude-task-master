-- Migration: 004_automated_triggers.sql
-- Description: Automated triggers for state management and audit logging
-- Created: 2025-05-28
-- Version: 2.0.0

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Enhanced function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update last_activity_at for agent sessions
CREATE OR REPLACE FUNCTION update_last_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate workflow duration
CREATE OR REPLACE FUNCTION calculate_workflow_duration()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate actual duration when workflow is completed
    IF NEW.status IN ('completed', 'failed', 'cancelled') AND NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.actual_duration_minutes = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 60;
    END IF;
    
    -- Set completed_at when status changes to completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;
    
    -- Set started_at when status changes from pending to running
    IF NEW.status = 'running' AND OLD.status = 'pending' AND NEW.started_at IS NULL THEN
        NEW.started_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update agent session statistics
CREATE OR REPLACE FUNCTION update_agent_session_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update session statistics based on interaction results
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE agent_sessions 
        SET 
            total_requests = (
                SELECT COUNT(*) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id
            ),
            successful_requests = (
                SELECT COUNT(*) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id AND success = TRUE
            ),
            failed_requests = (
                SELECT COUNT(*) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id AND success = FALSE
            ),
            avg_response_time_ms = (
                SELECT AVG(duration_ms) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id AND duration_ms IS NOT NULL
            ),
            tokens_used = (
                SELECT COALESCE(SUM(tokens_used), 0) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id
            ),
            cost_usd = (
                SELECT COALESCE(SUM(cost_usd), 0) 
                FROM agent_interactions 
                WHERE session_id = NEW.session_id
            ),
            last_activity_at = NOW()
        WHERE id = NEW.session_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Function to validate workflow task dependencies
CREATE OR REPLACE FUNCTION validate_workflow_task_dependencies()
RETURNS TRIGGER AS $$
DECLARE
    dependent_tasks_pending INTEGER;
BEGIN
    -- Check if there are any pending tasks with lower execution order
    SELECT COUNT(*) INTO dependent_tasks_pending
    FROM workflow_tasks wt
    WHERE wt.workflow_id = NEW.workflow_id
      AND wt.execution_order < NEW.execution_order
      AND wt.status IN ('pending', 'running')
      AND wt.is_parallel = FALSE;
    
    -- Prevent starting a task if dependencies are not completed (unless it's parallel)
    IF NEW.status = 'running' AND dependent_tasks_pending > 0 AND NEW.is_parallel = FALSE THEN
        RAISE EXCEPTION 'Cannot start task: dependent tasks with lower execution order are still pending';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to auto-expire agent sessions
CREATE OR REPLACE FUNCTION auto_expire_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-expire sessions that haven't been active
    IF NEW.last_activity_at < NOW() - INTERVAL '1 hour' AND NEW.status = 'active' THEN
        NEW.status = 'expired';
        NEW.ended_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Enhanced audit trigger function with more context
CREATE OR REPLACE FUNCTION enhanced_audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    actor_info JSONB;
    session_context JSONB;
    change_summary JSONB;
    changed_fields_array TEXT[];
    field_name TEXT;
BEGIN
    -- Build changed fields array for UPDATE operations
    IF TG_OP = 'UPDATE' THEN
        changed_fields_array := ARRAY[]::TEXT[];
        
        -- Compare OLD and NEW records to identify changed fields
        FOR field_name IN 
            SELECT jsonb_object_keys(to_jsonb(NEW)) 
            INTERSECT 
            SELECT jsonb_object_keys(to_jsonb(OLD))
        LOOP
            IF to_jsonb(NEW)->>field_name IS DISTINCT FROM to_jsonb(OLD)->>field_name THEN
                changed_fields_array := array_append(changed_fields_array, field_name);
            END IF;
        END LOOP;
    END IF;
    
    -- Determine actor information from current session
    actor_info := jsonb_build_object(
        'session_user', session_user,
        'current_user', current_user,
        'application_name', current_setting('application_name', true),
        'client_addr', inet_client_addr(),
        'client_port', inet_client_port()
    );
    
    -- Build session context
    session_context := jsonb_build_object(
        'transaction_id', txid_current(),
        'backend_pid', pg_backend_pid(),
        'timestamp', NOW()
    );
    
    -- Insert audit record
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs_enhanced (
            entity_type, entity_id, entity_name, action, action_category,
            new_values, actor_type, actor_id, timestamp, metadata
        ) VALUES (
            TG_TABLE_NAME, 
            NEW.id, 
            COALESCE(NEW.name, NEW.title, NEW.session_id, NEW.id::TEXT),
            'create', 
            'data',
            to_jsonb(NEW), 
            'system', 
            session_user, 
            NOW(),
            jsonb_build_object(
                'trigger_info', jsonb_build_object(
                    'table', TG_TABLE_NAME,
                    'operation', TG_OP,
                    'when', TG_WHEN,
                    'level', TG_LEVEL
                ),
                'actor_info', actor_info,
                'session_context', session_context
            )
        );
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs_enhanced (
            entity_type, entity_id, entity_name, action, action_category,
            old_values, new_values, changed_fields, actor_type, actor_id, timestamp, metadata
        ) VALUES (
            TG_TABLE_NAME, 
            NEW.id, 
            COALESCE(NEW.name, NEW.title, NEW.session_id, NEW.id::TEXT),
            'update', 
            'data',
            to_jsonb(OLD), 
            to_jsonb(NEW), 
            to_jsonb(changed_fields_array),
            'system', 
            session_user, 
            NOW(),
            jsonb_build_object(
                'trigger_info', jsonb_build_object(
                    'table', TG_TABLE_NAME,
                    'operation', TG_OP,
                    'when', TG_WHEN,
                    'level', TG_LEVEL
                ),
                'actor_info', actor_info,
                'session_context', session_context,
                'changes_count', array_length(changed_fields_array, 1)
            )
        );
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs_enhanced (
            entity_type, entity_id, entity_name, action, action_category,
            old_values, actor_type, actor_id, timestamp, metadata
        ) VALUES (
            TG_TABLE_NAME, 
            OLD.id, 
            COALESCE(OLD.name, OLD.title, OLD.session_id, OLD.id::TEXT),
            'delete', 
            'data',
            to_jsonb(OLD), 
            'system', 
            session_user, 
            NOW(),
            jsonb_build_object(
                'trigger_info', jsonb_build_object(
                    'table', TG_TABLE_NAME,
                    'operation', TG_OP,
                    'when', TG_WHEN,
                    'level', TG_LEVEL
                ),
                'actor_info', actor_info,
                'session_context', session_context
            )
        );
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Function to automatically create system metrics for performance tracking
CREATE OR REPLACE FUNCTION create_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Create metrics for workflow completion
    IF TG_TABLE_NAME = 'workflows' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO system_metrics (
            metric_category, metric_name, metric_type, numeric_value,
            workflow_id, dimensions, source_system
        ) VALUES (
            'performance', 'workflow_duration_minutes', 'gauge', NEW.actual_duration_minutes,
            NEW.id, 
            jsonb_build_object(
                'workflow_type', NEW.workflow_type,
                'environment', NEW.environment,
                'priority', NEW.priority
            ),
            'workflow_engine'
        );
        
        INSERT INTO system_metrics (
            metric_category, metric_name, metric_type, numeric_value,
            workflow_id, dimensions, source_system
        ) VALUES (
            'business', 'workflow_completed', 'counter', 1,
            NEW.id,
            jsonb_build_object(
                'workflow_type', NEW.workflow_type,
                'environment', NEW.environment
            ),
            'workflow_engine'
        );
    END IF;
    
    -- Create metrics for task completion
    IF TG_TABLE_NAME = 'tasks' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO system_metrics (
            metric_category, metric_name, metric_type, numeric_value,
            task_id, dimensions, source_system
        ) VALUES (
            'performance', 'task_actual_hours', 'gauge', NEW.actual_hours,
            NEW.id,
            jsonb_build_object(
                'task_type', NEW.type,
                'complexity_score', NEW.complexity_score,
                'priority', NEW.priority
            ),
            'task_engine'
        );
    END IF;
    
    -- Create metrics for PR events
    IF TG_TABLE_NAME = 'pr_tracking' THEN
        IF NEW.status = 'merged' AND OLD.status != 'merged' THEN
            INSERT INTO system_metrics (
                metric_category, metric_name, metric_type, numeric_value,
                pr_id, dimensions, source_system
            ) VALUES (
                'business', 'pr_merged', 'counter', 1,
                NEW.id,
                jsonb_build_object(
                    'repository', NEW.repository_name,
                    'lines_changed', NEW.lines_added + NEW.lines_deleted,
                    'files_changed', NEW.files_changed
                ),
                'pr_tracker'
            );
        END IF;
        
        IF NEW.ci_status = 'success' AND OLD.ci_status != 'success' THEN
            INSERT INTO system_metrics (
                metric_category, metric_name, metric_type, numeric_value,
                pr_id, dimensions, source_system
            ) VALUES (
                'quality', 'ci_success', 'counter', 1,
                NEW.id,
                jsonb_build_object(
                    'repository', NEW.repository_name,
                    'test_coverage', NEW.test_coverage_percentage
                ),
                'ci_system'
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- ============================================================================
-- TRIGGERS FOR WORKFLOWS TABLE
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_workflows_updated_at 
    BEFORE UPDATE ON workflows 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Calculate workflow duration and manage state transitions
CREATE TRIGGER calculate_workflows_duration 
    BEFORE UPDATE ON workflows 
    FOR EACH ROW 
    EXECUTE FUNCTION calculate_workflow_duration();

-- Audit logging
CREATE TRIGGER audit_workflows_trigger
    AFTER INSERT OR UPDATE OR DELETE ON workflows
    FOR EACH ROW 
    EXECUTE FUNCTION enhanced_audit_trigger_function();

-- Performance metrics
CREATE TRIGGER workflows_performance_metrics
    AFTER UPDATE ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION create_performance_metrics();

-- ============================================================================
-- TRIGGERS FOR AGENT SESSIONS TABLE
-- ============================================================================

-- Update last activity timestamp
CREATE TRIGGER update_agent_sessions_activity 
    BEFORE UPDATE ON agent_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_last_activity();

-- Auto-expire inactive sessions
CREATE TRIGGER auto_expire_agent_sessions 
    BEFORE UPDATE ON agent_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION auto_expire_sessions();

-- Audit logging
CREATE TRIGGER audit_agent_sessions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON agent_sessions
    FOR EACH ROW 
    EXECUTE FUNCTION enhanced_audit_trigger_function();

-- ============================================================================
-- TRIGGERS FOR PR TRACKING TABLE
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_pr_tracking_updated_at 
    BEFORE UPDATE ON pr_tracking 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Audit logging
CREATE TRIGGER audit_pr_tracking_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pr_tracking
    FOR EACH ROW 
    EXECUTE FUNCTION enhanced_audit_trigger_function();

-- Performance metrics
CREATE TRIGGER pr_tracking_performance_metrics
    AFTER UPDATE ON pr_tracking
    FOR EACH ROW
    EXECUTE FUNCTION create_performance_metrics();

-- ============================================================================
-- TRIGGERS FOR WORKFLOW TASKS TABLE
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_workflow_tasks_updated_at 
    BEFORE UPDATE ON workflow_tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Validate dependencies before starting tasks
CREATE TRIGGER validate_workflow_tasks_dependencies 
    BEFORE UPDATE ON workflow_tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION validate_workflow_task_dependencies();

-- Audit logging
CREATE TRIGGER audit_workflow_tasks_trigger
    AFTER INSERT OR UPDATE OR DELETE ON workflow_tasks
    FOR EACH ROW 
    EXECUTE FUNCTION enhanced_audit_trigger_function();

-- ============================================================================
-- TRIGGERS FOR AGENT INTERACTIONS TABLE
-- ============================================================================

-- Update agent session statistics when interactions are added/updated
CREATE TRIGGER update_agent_interactions_stats 
    AFTER INSERT OR UPDATE ON agent_interactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_agent_session_stats();

-- Audit logging
CREATE TRIGGER audit_agent_interactions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON agent_interactions
    FOR EACH ROW 
    EXECUTE FUNCTION enhanced_audit_trigger_function();

-- ============================================================================
-- TRIGGERS FOR ENHANCED EXISTING TABLES
-- ============================================================================

-- Enhanced triggers for existing tasks table
CREATE TRIGGER tasks_performance_metrics
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION create_performance_metrics();

-- ============================================================================
-- SCHEDULED FUNCTIONS (for background maintenance)
-- ============================================================================

-- Function to clean up old audit logs based on retention policy
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    retention_days INTEGER := 90; -- Default retention
BEGIN
    -- Get retention setting from configuration if available
    SELECT COALESCE(
        (SELECT (metadata->>'audit_retention_days')::INTEGER 
         FROM system_metrics 
         WHERE metric_name = 'audit_retention_days' 
         ORDER BY timestamp DESC LIMIT 1), 
        90
    ) INTO retention_days;
    
    -- Delete old audit logs
    DELETE FROM audit_logs_enhanced 
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO system_metrics (
        metric_category, metric_name, metric_type, numeric_value,
        dimensions, source_system
    ) VALUES (
        'infrastructure', 'audit_logs_cleaned', 'counter', deleted_count,
        jsonb_build_object('retention_days', retention_days),
        'maintenance_system'
    );
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to update session expiration status
CREATE OR REPLACE FUNCTION expire_inactive_sessions()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Expire sessions that haven't been active for more than 1 hour
    UPDATE agent_sessions 
    SET status = 'expired', ended_at = NOW()
    WHERE status = 'active' 
      AND last_activity_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log the expiration operation
    INSERT INTO system_metrics (
        metric_category, metric_name, metric_type, numeric_value,
        source_system
    ) VALUES (
        'infrastructure', 'sessions_expired', 'counter', expired_count,
        'session_manager'
    );
    
    RETURN expired_count;
END;
$$ language 'plpgsql';

-- Function to calculate and store aggregated metrics
CREATE OR REPLACE FUNCTION calculate_aggregated_metrics()
RETURNS VOID AS $$
BEGIN
    -- Calculate hourly aggregations
    INSERT INTO system_metrics (
        metric_category, metric_name, metric_type, aggregation_period,
        aggregation_function, numeric_value, dimensions, source_system
    )
    SELECT 
        'performance',
        'avg_workflow_duration_hourly',
        'gauge',
        'hour',
        'avg',
        AVG(actual_duration_minutes),
        jsonb_build_object(
            'hour', EXTRACT(HOUR FROM created_at),
            'date', DATE(created_at)
        ),
        'metrics_aggregator'
    FROM workflows 
    WHERE status = 'completed' 
      AND created_at >= NOW() - INTERVAL '1 hour'
      AND created_at < DATE_TRUNC('hour', NOW())
    GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at)
    ON CONFLICT DO NOTHING;
    
    -- Calculate daily success rates
    INSERT INTO system_metrics (
        metric_category, metric_name, metric_type, aggregation_period,
        aggregation_function, numeric_value, dimensions, source_system
    )
    SELECT 
        'quality',
        'workflow_success_rate_daily',
        'gauge',
        'day',
        'avg',
        (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100,
        jsonb_build_object('date', DATE(created_at)),
        'metrics_aggregator'
    FROM workflows 
    WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
      AND created_at < CURRENT_DATE
    GROUP BY DATE(created_at)
    ON CONFLICT DO NOTHING;
END;
$$ language 'plpgsql';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates updated_at timestamp on row changes';
COMMENT ON FUNCTION calculate_workflow_duration() IS 'Calculates workflow duration and manages state transitions';
COMMENT ON FUNCTION update_agent_session_stats() IS 'Updates agent session statistics based on interactions';
COMMENT ON FUNCTION validate_workflow_task_dependencies() IS 'Validates task execution order and dependencies';
COMMENT ON FUNCTION enhanced_audit_trigger_function() IS 'Enhanced audit logging with detailed change tracking';
COMMENT ON FUNCTION create_performance_metrics() IS 'Automatically creates performance metrics for key events';
COMMENT ON FUNCTION cleanup_old_audit_logs() IS 'Maintenance function to clean up old audit logs';
COMMENT ON FUNCTION expire_inactive_sessions() IS 'Expires inactive agent sessions automatically';
COMMENT ON FUNCTION calculate_aggregated_metrics() IS 'Calculates and stores aggregated performance metrics';

