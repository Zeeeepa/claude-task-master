-- Migration: 003_row_level_security.sql
-- Description: Implement Row-Level Security (RLS) policies for data isolation and access control
-- Created: 2025-05-28
-- Version: 1.2.0

-- Enable Row-Level Security on all tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create function to get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get role from current user context
    SELECT ur.role_name INTO user_role
    FROM users u
    JOIN user_roles ur ON u.role_id = ur.id
    WHERE u.username = current_user;
    
    -- Default to 'viewer' if no role found
    RETURN COALESCE(user_role, 'viewer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_permissions JSONB;
    has_permission BOOLEAN := FALSE;
BEGIN
    -- Get user permissions
    SELECT ur.permissions INTO user_permissions
    FROM users u
    JOIN user_roles ur ON u.role_id = ur.id
    WHERE u.username = current_user;
    
    -- Check for wildcard permission (admin)
    IF user_permissions ? '*' THEN
        RETURN TRUE;
    END IF;
    
    -- Check for specific permission
    IF user_permissions ? required_permission THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's accessible task IDs
CREATE OR REPLACE FUNCTION get_user_accessible_tasks()
RETURNS TABLE(task_id UUID) AS $$
BEGIN
    -- Admin can see all tasks
    IF get_current_user_role() = 'admin' THEN
        RETURN QUERY SELECT t.id FROM tasks t;
    -- Developers can see tasks assigned to them or unassigned
    ELSIF get_current_user_role() = 'developer' THEN
        RETURN QUERY 
        SELECT t.id FROM tasks t 
        WHERE t.assigned_to = current_user OR t.assigned_to IS NULL;
    -- API clients can see all tasks (for integration purposes)
    ELSIF get_current_user_role() = 'api_client' THEN
        RETURN QUERY SELECT t.id FROM tasks t;
    -- Viewers can see all tasks (read-only)
    ELSE
        RETURN QUERY SELECT t.id FROM tasks t;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for tasks table
CREATE POLICY tasks_select_policy ON tasks
    FOR SELECT
    USING (
        user_has_permission('tasks:read') AND
        id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY tasks_insert_policy ON tasks
    FOR INSERT
    WITH CHECK (
        user_has_permission('tasks:write')
    );

CREATE POLICY tasks_update_policy ON tasks
    FOR UPDATE
    USING (
        user_has_permission('tasks:write') AND
        id IN (SELECT task_id FROM get_user_accessible_tasks())
    )
    WITH CHECK (
        user_has_permission('tasks:write') AND
        id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY tasks_delete_policy ON tasks
    FOR DELETE
    USING (
        get_current_user_role() = 'admin' OR
        (user_has_permission('tasks:write') AND assigned_to = current_user)
    );

-- RLS Policies for task_contexts table
CREATE POLICY task_contexts_select_policy ON task_contexts
    FOR SELECT
    USING (
        user_has_permission('tasks:read') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY task_contexts_insert_policy ON task_contexts
    FOR INSERT
    WITH CHECK (
        user_has_permission('tasks:write') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY task_contexts_update_policy ON task_contexts
    FOR UPDATE
    USING (
        user_has_permission('tasks:write') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY task_contexts_delete_policy ON task_contexts
    FOR DELETE
    USING (
        get_current_user_role() = 'admin' OR
        (user_has_permission('tasks:write') AND 
         task_id IN (SELECT task_id FROM get_user_accessible_tasks()))
    );

-- RLS Policies for workflow_states table
CREATE POLICY workflow_states_select_policy ON workflow_states
    FOR SELECT
    USING (
        user_has_permission('tasks:read') AND
        (task_id IS NULL OR task_id IN (SELECT task_id FROM get_user_accessible_tasks()))
    );

CREATE POLICY workflow_states_insert_policy ON workflow_states
    FOR INSERT
    WITH CHECK (
        user_has_permission('tasks:write')
    );

CREATE POLICY workflow_states_update_policy ON workflow_states
    FOR UPDATE
    USING (
        user_has_permission('tasks:write')
    );

CREATE POLICY workflow_states_delete_policy ON workflow_states
    FOR DELETE
    USING (
        get_current_user_role() = 'admin'
    );

-- RLS Policies for validation_results table
CREATE POLICY validation_results_select_policy ON validation_results
    FOR SELECT
    USING (
        user_has_permission('validations:read') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY validation_results_insert_policy ON validation_results
    FOR INSERT
    WITH CHECK (
        user_has_permission('validations:write') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY validation_results_update_policy ON validation_results
    FOR UPDATE
    USING (
        user_has_permission('validations:write') AND
        task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY validation_results_delete_policy ON validation_results
    FOR DELETE
    USING (
        get_current_user_role() = 'admin'
    );

-- RLS Policies for error_logs table
CREATE POLICY error_logs_select_policy ON error_logs
    FOR SELECT
    USING (
        user_has_permission('errors:read') AND
        (task_id IS NULL OR task_id IN (SELECT task_id FROM get_user_accessible_tasks()))
    );

CREATE POLICY error_logs_insert_policy ON error_logs
    FOR INSERT
    WITH CHECK (
        user_has_permission('errors:write') OR
        get_current_user_role() IN ('admin', 'api_client')
    );

CREATE POLICY error_logs_update_policy ON error_logs
    FOR UPDATE
    USING (
        user_has_permission('errors:write') OR
        get_current_user_role() = 'admin'
    );

CREATE POLICY error_logs_delete_policy ON error_logs
    FOR DELETE
    USING (
        get_current_user_role() = 'admin'
    );

-- RLS Policies for audit_logs table (admin only)
CREATE POLICY audit_logs_select_policy ON audit_logs
    FOR SELECT
    USING (
        get_current_user_role() = 'admin'
    );

-- No insert/update/delete policies for audit_logs as they're managed by triggers

-- RLS Policies for task_dependencies table
CREATE POLICY task_dependencies_select_policy ON task_dependencies
    FOR SELECT
    USING (
        user_has_permission('tasks:read') AND
        (parent_task_id IN (SELECT task_id FROM get_user_accessible_tasks()) OR
         child_task_id IN (SELECT task_id FROM get_user_accessible_tasks()))
    );

CREATE POLICY task_dependencies_insert_policy ON task_dependencies
    FOR INSERT
    WITH CHECK (
        user_has_permission('tasks:write') AND
        parent_task_id IN (SELECT task_id FROM get_user_accessible_tasks()) AND
        child_task_id IN (SELECT task_id FROM get_user_accessible_tasks())
    );

CREATE POLICY task_dependencies_update_policy ON task_dependencies
    FOR UPDATE
    USING (
        user_has_permission('tasks:write') AND
        (parent_task_id IN (SELECT task_id FROM get_user_accessible_tasks()) OR
         child_task_id IN (SELECT task_id FROM get_user_accessible_tasks()))
    );

CREATE POLICY task_dependencies_delete_policy ON task_dependencies
    FOR DELETE
    USING (
        get_current_user_role() = 'admin' OR
        (user_has_permission('tasks:write') AND
         (parent_task_id IN (SELECT task_id FROM get_user_accessible_tasks()) OR
          child_task_id IN (SELECT task_id FROM get_user_accessible_tasks())))
    );

-- RLS Policies for performance_metrics table
CREATE POLICY performance_metrics_select_policy ON performance_metrics
    FOR SELECT
    USING (
        get_current_user_role() IN ('admin', 'developer')
    );

CREATE POLICY performance_metrics_insert_policy ON performance_metrics
    FOR INSERT
    WITH CHECK (
        get_current_user_role() IN ('admin', 'api_client')
    );

CREATE POLICY performance_metrics_update_policy ON performance_metrics
    FOR UPDATE
    USING (
        get_current_user_role() = 'admin'
    );

CREATE POLICY performance_metrics_delete_policy ON performance_metrics
    FOR DELETE
    USING (
        get_current_user_role() = 'admin'
    );

-- RLS Policies for user_roles table (admin only)
CREATE POLICY user_roles_select_policy ON user_roles
    FOR SELECT
    USING (
        get_current_user_role() = 'admin'
    );

CREATE POLICY user_roles_insert_policy ON user_roles
    FOR INSERT
    WITH CHECK (
        get_current_user_role() = 'admin'
    );

CREATE POLICY user_roles_update_policy ON user_roles
    FOR UPDATE
    USING (
        get_current_user_role() = 'admin'
    );

CREATE POLICY user_roles_delete_policy ON user_roles
    FOR DELETE
    USING (
        get_current_user_role() = 'admin'
    );

-- RLS Policies for users table
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
        get_current_user_role() = 'admin' OR
        username = current_user
    );

CREATE POLICY users_insert_policy ON users
    FOR INSERT
    WITH CHECK (
        get_current_user_role() = 'admin'
    );

CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (
        get_current_user_role() = 'admin' OR
        username = current_user
    )
    WITH CHECK (
        get_current_user_role() = 'admin' OR
        (username = current_user AND role_id = OLD.role_id) -- Users can't change their own role
    );

CREATE POLICY users_delete_policy ON users
    FOR DELETE
    USING (
        get_current_user_role() = 'admin' AND
        username != current_user -- Admin can't delete themselves
    );

-- Create database roles for different access levels
DO $$
BEGIN
    -- Create roles if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskmaster_admin') THEN
        CREATE ROLE taskmaster_admin;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskmaster_developer') THEN
        CREATE ROLE taskmaster_developer;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskmaster_viewer') THEN
        CREATE ROLE taskmaster_viewer;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskmaster_api_client') THEN
        CREATE ROLE taskmaster_api_client;
    END IF;
END
$$;

-- Grant appropriate permissions to roles
GRANT USAGE ON SCHEMA public TO taskmaster_admin, taskmaster_developer, taskmaster_viewer, taskmaster_api_client;

-- Admin role - full access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO taskmaster_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO taskmaster_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO taskmaster_admin;

-- Developer role - read/write access to tasks and validations
GRANT SELECT, INSERT, UPDATE ON tasks, task_contexts, validation_results, error_logs TO taskmaster_developer;
GRANT SELECT ON workflow_states, task_dependencies, performance_metrics, audit_logs TO taskmaster_developer;
GRANT SELECT ON users, user_roles TO taskmaster_developer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO taskmaster_developer;
GRANT EXECUTE ON FUNCTION get_current_user_role(), user_has_permission(TEXT), get_user_accessible_tasks() TO taskmaster_developer;

-- Viewer role - read-only access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO taskmaster_viewer;
GRANT EXECUTE ON FUNCTION get_current_user_role(), user_has_permission(TEXT), get_user_accessible_tasks() TO taskmaster_viewer;

-- API client role - specific access for external integrations
GRANT SELECT, INSERT, UPDATE ON tasks, task_contexts, validation_results, error_logs, performance_metrics TO taskmaster_api_client;
GRANT SELECT ON workflow_states, task_dependencies, users, user_roles TO taskmaster_api_client;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO taskmaster_api_client;
GRANT EXECUTE ON FUNCTION get_current_user_role(), user_has_permission(TEXT), get_user_accessible_tasks() TO taskmaster_api_client;

-- Create function to set user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(username_param TEXT)
RETURNS VOID AS $$
BEGIN
    -- Set the current user for RLS policies
    PERFORM set_config('role', username_param, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to create application user
CREATE OR REPLACE FUNCTION create_app_user(
    username_param TEXT,
    email_param TEXT,
    role_name_param TEXT,
    password_hash_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    role_id_var UUID;
    user_id_var UUID;
BEGIN
    -- Get role ID
    SELECT id INTO role_id_var FROM user_roles WHERE role_name = role_name_param;
    
    IF role_id_var IS NULL THEN
        RAISE EXCEPTION 'Role % does not exist', role_name_param;
    END IF;
    
    -- Create user
    INSERT INTO users (username, email, role_id, password_hash)
    VALUES (username_param, email_param, role_id_var, password_hash_param)
    RETURNING id INTO user_id_var;
    
    RETURN user_id_var;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('003', 'Implement Row-Level Security policies', 'rls_policies_v1_2_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments for documentation
COMMENT ON FUNCTION get_current_user_role() IS 'Get the role of the current database user';
COMMENT ON FUNCTION user_has_permission(TEXT) IS 'Check if current user has specific permission';
COMMENT ON FUNCTION get_user_accessible_tasks() IS 'Get task IDs accessible to current user based on role';
COMMENT ON FUNCTION set_user_context(TEXT) IS 'Set user context for RLS policies';
COMMENT ON FUNCTION create_app_user(TEXT, TEXT, TEXT, TEXT) IS 'Create new application user with specified role';

