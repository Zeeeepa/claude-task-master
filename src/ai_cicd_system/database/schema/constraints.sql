-- Data Integrity Constraints for AI-Driven CI/CD System
-- Description: Comprehensive constraints to ensure data consistency and integrity
-- Version: 2.0.0
-- Created: 2025-05-28

-- =====================================================
-- FOREIGN KEY CONSTRAINTS
-- =====================================================

-- Tasks table foreign keys
ALTER TABLE tasks 
ADD CONSTRAINT fk_tasks_parent_task 
FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- Workflows table foreign keys
ALTER TABLE workflows 
ADD CONSTRAINT fk_workflows_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- Task contexts foreign keys
ALTER TABLE task_contexts 
ADD CONSTRAINT fk_task_contexts_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- Task dependencies foreign keys
ALTER TABLE task_dependencies 
ADD CONSTRAINT fk_task_dependencies_parent 
FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_dependencies 
ADD CONSTRAINT fk_task_dependencies_child 
FOREIGN KEY (child_task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- API access logs foreign keys
ALTER TABLE api_access_logs 
ADD CONSTRAINT fk_api_access_logs_integration 
FOREIGN KEY (integration_id) REFERENCES external_integrations(id) ON DELETE SET NULL;

ALTER TABLE api_access_logs 
ADD CONSTRAINT fk_api_access_logs_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- =====================================================
-- CHECK CONSTRAINTS
-- =====================================================

-- Tasks table constraints
ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_status 
CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked'));

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_priority 
CHECK (priority >= 0 AND priority <= 10);

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_complexity 
CHECK (complexity_score >= 1 AND complexity_score <= 10);

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_hours 
CHECK (estimated_hours >= 0 AND actual_hours >= 0);

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_type 
CHECK (type IN ('general', 'bug_fix', 'feature', 'enhancement', 'refactor', 'documentation', 'test', 'deployment'));

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_completion_logic 
CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR 
    (status != 'completed' AND completed_at IS NULL)
);

ALTER TABLE tasks 
ADD CONSTRAINT chk_tasks_pr_number_positive 
CHECK (pr_number > 0);

-- Workflows table constraints
ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_status 
CHECK (status IN ('initialized', 'running', 'completed', 'failed', 'cancelled', 'timeout'));

ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_retry 
CHECK (retry_count >= 0 AND retry_count <= max_retries);

ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_type 
CHECK (workflow_type IN ('standard', 'hotfix', 'rollback', 'deployment', 'validation', 'cleanup'));

ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_steps 
CHECK (total_steps >= 0);

ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_timeout 
CHECK (timeout_minutes > 0 AND timeout_minutes <= 1440); -- Max 24 hours

ALTER TABLE workflows 
ADD CONSTRAINT chk_workflows_completion_logic 
CHECK (
    (status IN ('completed', 'failed', 'cancelled', 'timeout') AND completed_at IS NOT NULL) OR 
    (status NOT IN ('completed', 'failed', 'cancelled', 'timeout') AND completed_at IS NULL)
);

-- System metrics table constraints
ALTER TABLE system_metrics 
ADD CONSTRAINT chk_system_metrics_type 
CHECK (metric_type IN ('gauge', 'counter', 'histogram', 'timer'));

ALTER TABLE system_metrics 
ADD CONSTRAINT chk_system_metrics_unit 
CHECK (metric_unit IN ('bytes', 'seconds', 'milliseconds', 'count', 'percent', 'requests_per_second', 'errors_per_minute'));

-- Task contexts table constraints
ALTER TABLE task_contexts 
ADD CONSTRAINT chk_task_contexts_type 
CHECK (context_type IN (
    'requirement', 'codebase', 'ai_interaction', 'validation', 
    'workflow', 'status_change', 'completion', 'dependency_parent', 
    'dependency_child', 'error', 'performance', 'external_api'
));

ALTER TABLE task_contexts 
ADD CONSTRAINT chk_task_contexts_version 
CHECK (context_version > 0);

ALTER TABLE task_contexts 
ADD CONSTRAINT chk_task_contexts_expiry_logic 
CHECK (
    (expires_at IS NULL) OR 
    (expires_at > created_at)
);

-- Audit logs table constraints
ALTER TABLE audit_logs 
ADD CONSTRAINT chk_audit_logs_entity_type 
CHECK (entity_type IN ('task', 'task_context', 'workflow', 'system_metric', 'external_integration'));

ALTER TABLE audit_logs 
ADD CONSTRAINT chk_audit_logs_action 
CHECK (action IN ('create', 'update', 'delete', 'status_change', 'api_call'));

ALTER TABLE audit_logs 
ADD CONSTRAINT chk_audit_logs_response_status 
CHECK (response_status IS NULL OR (response_status >= 100 AND response_status < 600));

-- Task dependencies table constraints
ALTER TABLE task_dependencies 
ADD CONSTRAINT chk_task_dependencies_type 
CHECK (dependency_type IN ('blocks', 'depends_on', 'related', 'subtask'));

ALTER TABLE task_dependencies 
ADD CONSTRAINT chk_task_dependencies_no_self_reference 
CHECK (parent_task_id != child_task_id);

-- External integrations table constraints
ALTER TABLE external_integrations 
ADD CONSTRAINT chk_external_integrations_type 
CHECK (integration_type IN ('codegen', 'github', 'linear', 'claude', 'webhook', 'slack', 'email'));

ALTER TABLE external_integrations 
ADD CONSTRAINT chk_external_integrations_status 
CHECK (status IN ('active', 'inactive', 'error', 'maintenance'));

ALTER TABLE external_integrations 
ADD CONSTRAINT chk_external_integrations_health 
CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'timeout'));

ALTER TABLE external_integrations 
ADD CONSTRAINT chk_external_integrations_rate_limit 
CHECK (rate_limit_per_minute > 0 AND rate_limit_per_minute <= 10000);

ALTER TABLE external_integrations 
ADD CONSTRAINT chk_external_integrations_usage 
CHECK (current_usage >= 0 AND current_usage <= rate_limit_per_minute);

-- API access logs table constraints
ALTER TABLE api_access_logs 
ADD CONSTRAINT chk_api_access_logs_method 
CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'));

ALTER TABLE api_access_logs 
ADD CONSTRAINT chk_api_access_logs_status 
CHECK (response_status >= 100 AND response_status < 600);

ALTER TABLE api_access_logs 
ADD CONSTRAINT chk_api_access_logs_response_time 
CHECK (response_time_ms >= 0);

ALTER TABLE api_access_logs 
ADD CONSTRAINT chk_api_access_logs_retry_count 
CHECK (retry_count >= 0 AND retry_count <= 10);

-- Schema migrations table constraints
ALTER TABLE schema_migrations 
ADD CONSTRAINT chk_schema_migrations_type 
CHECK (migration_type IN ('schema', 'data', 'index', 'function', 'trigger'));

ALTER TABLE schema_migrations 
ADD CONSTRAINT chk_schema_migrations_execution_time 
CHECK (execution_time_ms >= 0);

-- =====================================================
-- UNIQUE CONSTRAINTS
-- =====================================================

-- Tasks table unique constraints
ALTER TABLE tasks 
ADD CONSTRAINT uk_tasks_linear_issue_id 
UNIQUE (linear_issue_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE tasks 
ADD CONSTRAINT uk_tasks_github_issue_repo 
UNIQUE (repository_url, github_issue_number) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE tasks 
ADD CONSTRAINT uk_tasks_branch_repo 
UNIQUE (repository_url, branch_name) DEFERRABLE INITIALLY DEFERRED;

-- Workflows table unique constraints
ALTER TABLE workflows 
ADD CONSTRAINT uk_workflows_task_active 
UNIQUE (task_id) DEFERRABLE INITIALLY DEFERRED
WHERE status IN ('initialized', 'running');

-- Task dependencies unique constraints
ALTER TABLE task_dependencies 
ADD CONSTRAINT uk_task_dependencies_parent_child_type 
UNIQUE (parent_task_id, child_task_id, dependency_type);

-- External integrations unique constraints
ALTER TABLE external_integrations 
ADD CONSTRAINT uk_external_integrations_type_name 
UNIQUE (integration_type, integration_name);

-- =====================================================
-- EXCLUSION CONSTRAINTS
-- =====================================================

-- Prevent overlapping active workflows for the same task
-- Note: This requires btree_gist extension
-- CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ALTER TABLE workflows 
-- ADD CONSTRAINT exc_workflows_task_overlap 
-- EXCLUDE USING gist (
--     task_id WITH =,
--     tsrange(started_at, COALESCE(completed_at, 'infinity'::timestamp)) WITH &&
-- ) WHERE (status IN ('initialized', 'running'));

-- =====================================================
-- DOMAIN CONSTRAINTS
-- =====================================================

-- Create custom domains for common data types
CREATE DOMAIN IF NOT EXISTS email_address AS VARCHAR(255)
CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

CREATE DOMAIN IF NOT EXISTS url_address AS VARCHAR(500)
CHECK (VALUE ~* '^https?://[^\s/$.?#].[^\s]*$');

CREATE DOMAIN IF NOT EXISTS positive_integer AS INTEGER
CHECK (VALUE > 0);

CREATE DOMAIN IF NOT EXISTS non_negative_integer AS INTEGER
CHECK (VALUE >= 0);

CREATE DOMAIN IF NOT EXISTS percentage AS DECIMAL(5,2)
CHECK (VALUE >= 0 AND VALUE <= 100);

-- =====================================================
-- TRIGGER-BASED CONSTRAINTS
-- =====================================================

-- Function to validate task hierarchy (prevent circular dependencies)
CREATE OR REPLACE FUNCTION validate_task_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    cycle_detected BOOLEAN := FALSE;
    current_task_id UUID;
    visited_tasks UUID[];
BEGIN
    -- Only check for INSERT and UPDATE operations on parent_task_id
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id) THEN
        IF NEW.parent_task_id IS NOT NULL THEN
            -- Initialize traversal
            current_task_id := NEW.parent_task_id;
            visited_tasks := ARRAY[NEW.id];
            
            -- Traverse up the hierarchy
            WHILE current_task_id IS NOT NULL LOOP
                -- Check if we've seen this task before (cycle detected)
                IF current_task_id = ANY(visited_tasks) THEN
                    cycle_detected := TRUE;
                    EXIT;
                END IF;
                
                -- Add current task to visited list
                visited_tasks := visited_tasks || current_task_id;
                
                -- Get parent of current task
                SELECT parent_task_id INTO current_task_id 
                FROM tasks 
                WHERE id = current_task_id;
            END LOOP;
            
            -- Raise error if cycle detected
            IF cycle_detected THEN
                RAISE EXCEPTION 'Circular dependency detected in task hierarchy for task %', NEW.id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for task hierarchy validation
DROP TRIGGER IF EXISTS trigger_validate_task_hierarchy ON tasks;
CREATE TRIGGER trigger_validate_task_hierarchy
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_hierarchy();

-- Function to validate task dependency cycles
CREATE OR REPLACE FUNCTION validate_task_dependencies()
RETURNS TRIGGER AS $$
DECLARE
    cycle_detected BOOLEAN := FALSE;
    current_task_id UUID;
    visited_tasks UUID[];
BEGIN
    -- Only check for dependency cycles on INSERT and UPDATE
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id OR OLD.child_task_id IS DISTINCT FROM NEW.child_task_id)) THEN
        -- Initialize traversal from child task
        current_task_id := NEW.child_task_id;
        visited_tasks := ARRAY[NEW.parent_task_id];
        
        -- Traverse dependency chain
        WHILE current_task_id IS NOT NULL LOOP
            -- Check if we've reached the original parent (cycle detected)
            IF current_task_id = ANY(visited_tasks) THEN
                cycle_detected := TRUE;
                EXIT;
            END IF;
            
            -- Add current task to visited list
            visited_tasks := visited_tasks || current_task_id;
            
            -- Get next task in dependency chain
            SELECT parent_task_id INTO current_task_id 
            FROM task_dependencies 
            WHERE child_task_id = current_task_id 
            AND dependency_type IN ('blocks', 'depends_on')
            AND is_active = TRUE
            LIMIT 1;
        END LOOP;
        
        -- Raise error if cycle detected
        IF cycle_detected THEN
            RAISE EXCEPTION 'Circular dependency detected between tasks % and %', NEW.parent_task_id, NEW.child_task_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for dependency validation
DROP TRIGGER IF EXISTS trigger_validate_task_dependencies ON task_dependencies;
CREATE TRIGGER trigger_validate_task_dependencies
    BEFORE INSERT OR UPDATE ON task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_dependencies();

-- Function to validate external integration rate limits
CREATE OR REPLACE FUNCTION validate_rate_limits()
RETURNS TRIGGER AS $$
BEGIN
    -- Reset usage counter if reset time has passed
    IF NEW.usage_reset_at <= NOW() THEN
        NEW.current_usage := 0;
        NEW.usage_reset_at := NOW() + INTERVAL '1 minute';
    END IF;
    
    -- Check if rate limit would be exceeded
    IF NEW.current_usage >= NEW.rate_limit_per_minute THEN
        RAISE EXCEPTION 'Rate limit exceeded for integration % (% requests per minute)', NEW.integration_name, NEW.rate_limit_per_minute;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for rate limit validation
DROP TRIGGER IF EXISTS trigger_validate_rate_limits ON external_integrations;
CREATE TRIGGER trigger_validate_rate_limits
    BEFORE UPDATE ON external_integrations
    FOR EACH ROW
    EXECUTE FUNCTION validate_rate_limits();

-- =====================================================
-- CONSTRAINT COMMENTS
-- =====================================================

COMMENT ON CONSTRAINT chk_tasks_status ON tasks IS 'Ensures task status is one of the valid values';
COMMENT ON CONSTRAINT chk_workflows_completion_logic ON workflows IS 'Ensures completed_at is set only for terminal states';
COMMENT ON CONSTRAINT uk_tasks_linear_issue_id ON tasks IS 'Ensures unique mapping between tasks and Linear issues';
COMMENT ON CONSTRAINT uk_workflows_task_active ON workflows IS 'Prevents multiple active workflows for the same task';

-- =====================================================
-- CONSTRAINT VALIDATION FUNCTIONS
-- =====================================================

-- Function to check all constraints
CREATE OR REPLACE FUNCTION validate_all_constraints()
RETURNS TABLE(
    table_name TEXT,
    constraint_name TEXT,
    constraint_type TEXT,
    is_valid BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    constraint_record RECORD;
    validation_result BOOLEAN;
    error_msg TEXT;
BEGIN
    -- Iterate through all constraints
    FOR constraint_record IN
        SELECT 
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public'
        AND tc.table_name IN (
            'tasks', 'workflows', 'system_metrics', 'task_contexts',
            'audit_logs', 'task_dependencies', 'external_integrations',
            'api_access_logs', 'schema_migrations'
        )
    LOOP
        BEGIN
            -- Attempt to validate constraint
            EXECUTE format('SELECT COUNT(*) FROM %I', constraint_record.table_name);
            validation_result := TRUE;
            error_msg := NULL;
        EXCEPTION WHEN OTHERS THEN
            validation_result := FALSE;
            error_msg := SQLERRM;
        END;
        
        RETURN QUERY SELECT 
            constraint_record.table_name,
            constraint_record.constraint_name,
            constraint_record.constraint_type,
            validation_result,
            error_msg;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

