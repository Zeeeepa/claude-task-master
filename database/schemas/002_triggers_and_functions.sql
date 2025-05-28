-- Database Triggers and Functions for Task Orchestration
-- Claude Task Master AI-Driven CI/CD System

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to increment version on updates
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate workflow state duration
CREATE OR REPLACE FUNCTION calculate_workflow_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.exited_at IS NOT NULL AND OLD.exited_at IS NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.exited_at - NEW.entered_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate deployment execution duration
CREATE OR REPLACE FUNCTION calculate_deployment_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to validate task dependencies and prevent cycles
CREATE OR REPLACE FUNCTION check_dependency_cycles()
RETURNS TRIGGER AS $$
DECLARE
    cycle_found BOOLEAN := FALSE;
BEGIN
    -- Use recursive CTE to detect cycles
    WITH RECURSIVE dependency_path AS (
        -- Base case: start from the new dependency
        SELECT 
            NEW.dependent_task_id as task_id,
            NEW.dependency_task_id as depends_on,
            1 as depth,
            ARRAY[NEW.dependent_task_id] as path
        
        UNION ALL
        
        -- Recursive case: follow the dependency chain
        SELECT 
            td.dependent_task_id,
            td.dependency_task_id,
            dp.depth + 1,
            dp.path || td.dependent_task_id
        FROM task_dependencies td
        JOIN dependency_path dp ON td.dependent_task_id = dp.depends_on
        WHERE dp.depth < 50 -- Prevent infinite recursion
        AND NOT (td.dependent_task_id = ANY(dp.path)) -- Prevent cycles in path
    )
    SELECT EXISTS(
        SELECT 1 FROM dependency_path 
        WHERE depends_on = NEW.dependent_task_id
    ) INTO cycle_found;
    
    IF cycle_found THEN
        RAISE EXCEPTION 'Dependency cycle detected: Task % cannot depend on task % as it would create a circular dependency', 
            NEW.dependent_task_id, NEW.dependency_task_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to auto-resolve errors when tasks are completed
CREATE OR REPLACE FUNCTION auto_resolve_task_errors()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        UPDATE error_logs 
        SET 
            is_resolved = true,
            resolved_at = NOW(),
            resolved_by = 'system',
            resolution_notes = 'Auto-resolved: Task completed successfully'
        WHERE task_id = NEW.id 
        AND is_resolved = false 
        AND severity IN ('low', 'medium');
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update task completion timestamp
CREATE OR REPLACE FUNCTION update_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        NEW.completed_at = NOW();
    ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
        NEW.completed_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to sync Linear issue updates
CREATE OR REPLACE FUNCTION sync_linear_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Update Linear sync record when task is modified
    UPDATE linear_sync 
    SET 
        last_synced_at = NOW(),
        sync_status = 'pending'
    WHERE task_id = NEW.id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to validate PR metadata consistency
CREATE OR REPLACE FUNCTION validate_pr_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure merged PRs have merged_at timestamp
    IF NEW.status = 'merged' AND NEW.merged_at IS NULL THEN
        NEW.merged_at = NOW();
    END IF;
    
    -- Ensure closed PRs have closed_at timestamp
    IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
        NEW.closed_at = NOW();
    END IF;
    
    -- Reset timestamps if status changes back
    IF NEW.status != 'merged' AND OLD.status = 'merged' THEN
        NEW.merged_at = NULL;
    END IF;
    
    IF NEW.status != 'closed' AND OLD.status = 'closed' THEN
        NEW.closed_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers

-- Updated_at triggers
CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_deployment_scripts_updated_at
    BEFORE UPDATE ON deployment_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_pr_metadata_updated_at
    BEFORE UPDATE ON pr_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Version increment triggers
CREATE TRIGGER trigger_tasks_version_increment
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

-- Duration calculation triggers
CREATE TRIGGER trigger_workflow_duration
    BEFORE UPDATE ON workflow_states
    FOR EACH ROW
    EXECUTE FUNCTION calculate_workflow_duration();

CREATE TRIGGER trigger_deployment_duration
    BEFORE UPDATE ON deployment_executions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_deployment_duration();

-- Dependency cycle prevention
CREATE TRIGGER trigger_check_dependency_cycles
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION check_dependency_cycles();

-- Task completion and error resolution
CREATE TRIGGER trigger_task_completion
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_completion();

CREATE TRIGGER trigger_auto_resolve_errors
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION auto_resolve_task_errors();

-- Linear synchronization
CREATE TRIGGER trigger_sync_linear
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION sync_linear_updates();

-- PR metadata validation
CREATE TRIGGER trigger_validate_pr_metadata
    BEFORE INSERT OR UPDATE ON pr_metadata
    FOR EACH ROW
    EXECUTE FUNCTION validate_pr_metadata();

-- Create audit log table for tracking all changes
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    changed_by VARCHAR(100),
    session_id VARCHAR(100),
    application_name VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Create audit log indexes
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_audit_log_operation ON audit_log(operation);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);

-- Generic audit function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_values JSONB := NULL;
    new_values JSONB := NULL;
    changed_fields TEXT[] := ARRAY[]::TEXT[];
    field_name TEXT;
BEGIN
    -- Determine operation type and set values
    IF TG_OP = 'DELETE' THEN
        old_values := to_jsonb(OLD);
        INSERT INTO audit_log (
            table_name, record_id, operation, old_values, changed_at
        ) VALUES (
            TG_TABLE_NAME, OLD.id, TG_OP, old_values, NOW()
        );
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        new_values := to_jsonb(NEW);
        INSERT INTO audit_log (
            table_name, record_id, operation, new_values, changed_at
        ) VALUES (
            TG_TABLE_NAME, NEW.id, TG_OP, new_values, NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        old_values := to_jsonb(OLD);
        new_values := to_jsonb(NEW);
        
        -- Identify changed fields
        FOR field_name IN SELECT jsonb_object_keys(new_values) LOOP
            IF old_values->field_name IS DISTINCT FROM new_values->field_name THEN
                changed_fields := array_append(changed_fields, field_name);
            END IF;
        END LOOP;
        
        -- Only log if there are actual changes
        IF array_length(changed_fields, 1) > 0 THEN
            INSERT INTO audit_log (
                table_name, record_id, operation, old_values, new_values, changed_fields, changed_at
            ) VALUES (
                TG_TABLE_NAME, NEW.id, TG_OP, old_values, new_values, changed_fields, NOW()
            );
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create audit triggers for all main tables
CREATE TRIGGER audit_tasks
    AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_task_dependencies
    AFTER INSERT OR UPDATE OR DELETE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_workflow_states
    AFTER INSERT OR UPDATE OR DELETE ON workflow_states
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_deployment_scripts
    AFTER INSERT OR UPDATE OR DELETE ON deployment_scripts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_error_logs
    AFTER INSERT OR UPDATE OR DELETE ON error_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_pr_metadata
    AFTER INSERT OR UPDATE OR DELETE ON pr_metadata
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_linear_sync
    AFTER INSERT OR UPDATE OR DELETE ON linear_sync
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create performance monitoring views
CREATE VIEW task_performance_metrics AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.priority,
    t.estimated_complexity,
    t.actual_complexity,
    EXTRACT(EPOCH FROM (COALESCE(t.completed_at, NOW()) - t.created_at))::INTEGER as total_duration_seconds,
    COUNT(ws.id) as state_changes,
    COUNT(el.id) as error_count,
    COUNT(CASE WHEN el.severity IN ('high', 'critical') THEN 1 END) as critical_errors
FROM tasks t
LEFT JOIN workflow_states ws ON t.id = ws.task_id
LEFT JOIN error_logs el ON t.id = el.task_id
GROUP BY t.id, t.title, t.status, t.priority, t.estimated_complexity, t.actual_complexity, t.created_at, t.completed_at;

-- Create dependency analysis view
CREATE VIEW task_dependency_analysis AS
WITH RECURSIVE task_hierarchy AS (
    -- Root tasks (no dependencies)
    SELECT 
        t.id,
        t.title,
        t.status,
        0 as depth,
        ARRAY[t.id] as path,
        t.id as root_task_id
    FROM tasks t
    WHERE NOT EXISTS (
        SELECT 1 FROM task_dependencies td 
        WHERE td.dependent_task_id = t.id
    )
    
    UNION ALL
    
    -- Dependent tasks
    SELECT 
        t.id,
        t.title,
        t.status,
        th.depth + 1,
        th.path || t.id,
        th.root_task_id
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.dependent_task_id
    JOIN task_hierarchy th ON td.dependency_task_id = th.id
    WHERE NOT (t.id = ANY(th.path)) -- Prevent cycles
    AND th.depth < 20 -- Limit recursion depth
)
SELECT 
    id,
    title,
    status,
    depth,
    root_task_id,
    (SELECT title FROM tasks WHERE id = root_task_id) as root_task_title,
    array_length(path, 1) as dependency_chain_length
FROM task_hierarchy
ORDER BY root_task_id, depth, title;

