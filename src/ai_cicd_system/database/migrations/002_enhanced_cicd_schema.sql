-- Migration: 002_enhanced_cicd_schema.sql
-- Description: Enhanced CI/CD schema for AI task management system
-- Created: 2025-05-28
-- Version: 2.0.0

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update tasks table to match the enhanced requirements
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS project_url VARCHAR(255),
ADD COLUMN IF NOT EXISTS assignee_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS requirements JSONB NOT NULL DEFAULT '{}';

-- Update the requirements column to be NOT NULL with default
UPDATE tasks SET requirements = '{}' WHERE requirements IS NULL;
ALTER TABLE tasks ALTER COLUMN requirements SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN requirements SET DEFAULT '{}';

-- Create deployments table for tracking PR deployments
CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    pr_url VARCHAR(255) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    logs JSONB DEFAULT '{}',
    error_count INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT deployments_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT deployments_error_count_check CHECK (error_count >= 0),
    CONSTRAINT deployments_retry_count_check CHECK (retry_count >= 0)
);

-- Create validation_results table for testing and validation tracking
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
    test_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    output TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT validation_results_status_check CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped')),
    CONSTRAINT validation_results_duration_check CHECK (duration_ms >= 0)
);

-- Create prompt_templates table for AI prompt management
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    template TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT prompt_templates_name_check CHECK (length(name) > 0),
    CONSTRAINT prompt_templates_template_check CHECK (length(template) > 0)
);

-- Create deployment_scripts table for script management
CREATE TABLE IF NOT EXISTS deployment_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    script_content TEXT NOT NULL,
    script_type VARCHAR(50) NOT NULL,
    environment VARCHAR(50) DEFAULT 'development',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT deployment_scripts_name_check CHECK (length(name) > 0),
    CONSTRAINT deployment_scripts_content_check CHECK (length(script_content) > 0),
    CONSTRAINT deployment_scripts_type_check CHECK (script_type IN ('bash', 'python', 'node', 'docker', 'sql', 'yaml', 'json')),
    CONSTRAINT deployment_scripts_env_check CHECK (environment IN ('development', 'staging', 'production', 'test'))
);

-- Create system_logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    component VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT system_logs_level_check CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    CONSTRAINT system_logs_component_check CHECK (length(component) > 0),
    CONSTRAINT system_logs_message_check CHECK (length(message) > 0)
);

-- Create indexes for performance optimization

-- Deployments table indexes
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_task_id ON deployments(task_id);
CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_deployments_branch_name ON deployments(branch_name);
CREATE INDEX IF NOT EXISTS idx_deployments_pr_url ON deployments(pr_url);

-- Validation results table indexes
CREATE INDEX IF NOT EXISTS idx_validation_results_deployment_id ON validation_results(deployment_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_status ON validation_results(status);
CREATE INDEX IF NOT EXISTS idx_validation_results_test_type ON validation_results(test_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_created_at ON validation_results(created_at);

-- Prompt templates table indexes
CREATE INDEX IF NOT EXISTS idx_prompt_templates_name ON prompt_templates(name);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_created_at ON prompt_templates(created_at);

-- Deployment scripts table indexes
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_name ON deployment_scripts(name);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_type ON deployment_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_environment ON deployment_scripts(environment);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_created_at ON deployment_scripts(created_at);

-- System logs table indexes
CREATE INDEX IF NOT EXISTS idx_system_logs_component ON system_logs(component);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_component_level ON system_logs(component, level);

-- Create triggers for automatic updated_at timestamps

-- Deployments table trigger
CREATE TRIGGER update_deployments_updated_at
    BEFORE UPDATE ON deployments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Prompt templates table trigger
CREATE TRIGGER update_prompt_templates_updated_at
    BEFORE UPDATE ON prompt_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Deployment scripts table trigger
CREATE TRIGGER update_deployment_scripts_updated_at
    BEFORE UPDATE ON deployment_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_deployments_trigger
    AFTER INSERT OR UPDATE OR DELETE ON deployments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_validation_results_trigger
    AFTER INSERT OR UPDATE OR DELETE ON validation_results
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_prompt_templates_trigger
    AFTER INSERT OR UPDATE OR DELETE ON prompt_templates
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_deployment_scripts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON deployment_scripts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create enhanced views for CI/CD operations

-- Active deployments view
CREATE OR REPLACE VIEW active_deployments AS
SELECT
    d.*,
    t.title as task_title,
    t.description as task_description,
    t.priority as task_priority,
    COUNT(vr.id) as validation_count,
    COUNT(CASE WHEN vr.status = 'passed' THEN 1 END) as passed_validations,
    COUNT(CASE WHEN vr.status = 'failed' THEN 1 END) as failed_validations
FROM deployments d
LEFT JOIN tasks t ON d.task_id = t.id
LEFT JOIN validation_results vr ON d.id = vr.deployment_id
WHERE d.status IN ('pending', 'running')
GROUP BY d.id, t.id;

-- Deployment summary view
CREATE OR REPLACE VIEW deployment_summary AS
SELECT
    status,
    COUNT(*) as deployment_count,
    AVG(error_count) as avg_error_count,
    AVG(retry_count) as avg_retry_count,
    COUNT(CASE WHEN error_count > 0 THEN 1 END) as deployments_with_errors
FROM deployments
GROUP BY status;

-- System health view
CREATE OR REPLACE VIEW system_health AS
SELECT
    component,
    level,
    COUNT(*) as log_count,
    MAX(created_at) as last_log_time,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_logs
FROM system_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY component, level
ORDER BY component, level;

-- Task deployment status view
CREATE OR REPLACE VIEW task_deployment_status AS
SELECT
    t.id as task_id,
    t.title,
    t.status as task_status,
    t.priority,
    COUNT(d.id) as deployment_count,
    MAX(d.created_at) as last_deployment,
    COUNT(CASE WHEN d.status = 'completed' THEN 1 END) as successful_deployments,
    COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_deployments
FROM tasks t
LEFT JOIN deployments d ON t.id = d.task_id
GROUP BY t.id, t.title, t.status, t.priority;

-- Insert sample prompt templates for common CI/CD operations
INSERT INTO prompt_templates (name, template, variables, category) VALUES
('task_analysis', 'Analyze the following task and break it down into actionable steps:\n\nTask: {{task_title}}\nDescription: {{task_description}}\nRequirements: {{requirements}}\n\nProvide a detailed breakdown with estimated complexity and dependencies.', '{"task_title": "string", "task_description": "string", "requirements": "object"}', 'analysis'),
('code_review', 'Review the following code changes for:\n1. Code quality and best practices\n2. Security vulnerabilities\n3. Performance implications\n4. Test coverage\n\nPR URL: {{pr_url}}\nBranch: {{branch_name}}\nChanges: {{changes}}\n\nProvide detailed feedback and recommendations.', '{"pr_url": "string", "branch_name": "string", "changes": "string"}', 'review'),
('deployment_validation', 'Validate the deployment for the following:\n\nDeployment ID: {{deployment_id}}\nEnvironment: {{environment}}\nServices: {{services}}\nHealth Checks: {{health_checks}}\n\nVerify all systems are operational and provide status report.', '{"deployment_id": "string", "environment": "string", "services": "array", "health_checks": "object"}', 'validation'),
('error_analysis', 'Analyze the following error and provide resolution steps:\n\nError: {{error_message}}\nComponent: {{component}}\nContext: {{context}}\nLogs: {{logs}}\n\nProvide root cause analysis and step-by-step resolution.', '{"error_message": "string", "component": "string", "context": "object", "logs": "string"}', 'troubleshooting')
ON CONFLICT (name) DO NOTHING;

-- Insert sample deployment scripts
INSERT INTO deployment_scripts (name, script_content, script_type, environment) VALUES
('health_check', '#!/bin/bash\n# Health check script for CI/CD system\necho "Checking system health..."\ncurl -f http://localhost:3000/health || exit 1\necho "Health check passed"', 'bash', 'production'),
('database_migration', 'import subprocess\nimport sys\n\ndef run_migrations():\n    """Run database migrations"""\n    try:\n        result = subprocess.run([\"npm\", \"run\", \"migrate\"], check=True, capture_output=True, text=True)\n        print(f"Migration successful: {result.stdout}")\n        return True\n    except subprocess.CalledProcessError as e:\n        print(f"Migration failed: {e.stderr}")\n        return False\n\nif __name__ == "__main__":\n    success = run_migrations()\n    sys.exit(0 if success else 1)', 'python', 'production'),
('docker_build', '{\n  "version": "3.8",\n  "services": {\n    "app": {\n      "build": ".",\n      "ports": ["3000:3000"],\n      "environment": {\n        "NODE_ENV": "production",\n        "DB_HOST": "${DB_HOST}",\n        "DB_PORT": "${DB_PORT}"\n      }\n    }\n  }\n}', 'json', 'production')
ON CONFLICT DO NOTHING;

-- Update audit logs constraint to include new entity types
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_check 
    CHECK (entity_type IN ('task', 'task_context', 'workflow_state', 'deployment', 'validation_result', 'prompt_template', 'deployment_script'));

-- Add comments for documentation
COMMENT ON TABLE deployments IS 'Tracks PR deployments and their execution status';
COMMENT ON TABLE validation_results IS 'Stores validation and testing results for deployments';
COMMENT ON TABLE prompt_templates IS 'AI prompt templates for various CI/CD operations';
COMMENT ON TABLE deployment_scripts IS 'Deployment and automation scripts';
COMMENT ON TABLE system_logs IS 'Comprehensive system logging for monitoring and debugging';

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('002', 'Enhanced CI/CD schema with deployments, validations, and logging', 'enhanced_cicd_v2_0_0')
ON CONFLICT (version) DO NOTHING;

-- Create function for deployment status updates
CREATE OR REPLACE FUNCTION update_deployment_status(
    p_deployment_id UUID,
    p_status VARCHAR(50),
    p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE deployments 
    SET 
        status = p_status,
        updated_at = NOW(),
        last_error = CASE WHEN p_error_message IS NOT NULL THEN p_error_message ELSE last_error END,
        error_count = CASE WHEN p_status = 'failed' THEN error_count + 1 ELSE error_count END
    WHERE id = p_deployment_id;
    
    -- Log the status change
    INSERT INTO system_logs (component, level, message, metadata)
    VALUES (
        'deployment_manager',
        CASE WHEN p_status = 'failed' THEN 'error' ELSE 'info' END,
        'Deployment status updated',
        jsonb_build_object(
            'deployment_id', p_deployment_id,
            'new_status', p_status,
            'error_message', p_error_message
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Create function for logging system events
CREATE OR REPLACE FUNCTION log_system_event(
    p_component VARCHAR(100),
    p_level VARCHAR(20),
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO system_logs (component, level, message, metadata)
    VALUES (p_component, p_level, p_message, p_metadata)
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

