-- Migration: 002_pr_validation_schema.sql
-- Description: Add PR validation tracking tables for Claude Code integration
-- Created: 2025-05-28
-- Version: 1.1.0

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create PR tracking table
CREATE TABLE IF NOT EXISTS pr_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_number INTEGER NOT NULL,
    pr_title VARCHAR(500),
    pr_description TEXT,
    pr_author VARCHAR(255),
    repository_name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(500),
    branch_name VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) DEFAULT 'main',
    pr_url VARCHAR(500),
    pr_status VARCHAR(50) DEFAULT 'open',
    changed_files JSONB DEFAULT '[]'::jsonb,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    merged_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT pr_tracking_status_check CHECK (pr_status IN ('open', 'closed', 'merged', 'draft')),
    CONSTRAINT pr_tracking_lines_check CHECK (lines_added >= 0 AND lines_deleted >= 0),
    
    -- Unique constraint for PR per repository
    UNIQUE(repository_name, pr_number)
);

-- Create PR validation tracking table
CREATE TABLE IF NOT EXISTS pr_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id VARCHAR(255) UNIQUE NOT NULL,
    pr_id UUID REFERENCES pr_tracking(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    validation_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    overall_score INTEGER DEFAULT 0,
    grade VARCHAR(2) DEFAULT 'F',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    validation_results JSONB DEFAULT '{}'::jsonb,
    error_contexts JSONB DEFAULT '[]'::jsonb,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    workspace_path VARCHAR(500),
    claude_code_version VARCHAR(50),
    executor_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT pr_validations_status_check CHECK (validation_status IN (
        'pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'
    )),
    CONSTRAINT pr_validations_score_check CHECK (overall_score >= 0 AND overall_score <= 100),
    CONSTRAINT pr_validations_grade_check CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
    CONSTRAINT pr_validations_duration_check CHECK (duration_ms >= 0)
);

-- Create validation stage results table
CREATE TABLE IF NOT EXISTS validation_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    stage_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER DEFAULT 0,
    stage_result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    error_stack TEXT,
    stage_config JSONB DEFAULT '{}'::jsonb,
    resource_usage JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT validation_stages_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'skipped', 'timeout'
    )),
    CONSTRAINT validation_stages_type_check CHECK (stage_type IN (
        'syntax_check', 'linting', 'unit_tests', 'integration_tests', 
        'security_scan', 'performance_test', 'dependency_check', 'code_quality'
    )),
    CONSTRAINT validation_stages_duration_check CHECK (duration_ms >= 0)
);

-- Create error contexts table for Codegen integration
CREATE TABLE IF NOT EXISTS error_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_id VARCHAR(255) UNIQUE NOT NULL,
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES validation_stages(id) ON DELETE CASCADE,
    error_category VARCHAR(50) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    error_message TEXT NOT NULL,
    file_path VARCHAR(500),
    line_number INTEGER,
    column_number INTEGER,
    code_snippet TEXT,
    codegen_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    technical_metadata JSONB DEFAULT '{}'::jsonb,
    fix_applied BOOLEAN DEFAULT FALSE,
    fix_applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT error_contexts_category_check CHECK (error_category IN (
        'syntax', 'logic', 'security', 'performance', 'testing', 
        'dependency', 'style', 'documentation'
    )),
    CONSTRAINT error_contexts_severity_check CHECK (severity IN (
        'critical', 'high', 'medium', 'low', 'info'
    )),
    CONSTRAINT error_contexts_line_check CHECK (line_number >= 0),
    CONSTRAINT error_contexts_column_check CHECK (column_number >= 0)
);

-- Create validation reports table
CREATE TABLE IF NOT EXISTS validation_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL DEFAULT 'comprehensive',
    report_format VARCHAR(20) NOT NULL DEFAULT 'json',
    report_content JSONB NOT NULL,
    summary TEXT,
    recommendations JSONB DEFAULT '[]'::jsonb,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_path VARCHAR(500),
    file_size_bytes INTEGER,
    
    -- Constraints
    CONSTRAINT validation_reports_type_check CHECK (report_type IN (
        'comprehensive', 'summary', 'security', 'performance', 'quality'
    )),
    CONSTRAINT validation_reports_format_check CHECK (report_format IN (
        'json', 'markdown', 'html', 'pdf'
    )),
    CONSTRAINT validation_reports_size_check CHECK (file_size_bytes >= 0)
);

-- Create workspace tracking table
CREATE TABLE IF NOT EXISTS validation_workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id VARCHAR(255) UNIQUE NOT NULL,
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    workspace_path VARCHAR(500) NOT NULL,
    workspace_size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cleaned_up_at TIMESTAMP WITH TIME ZONE,
    cleanup_status VARCHAR(50) DEFAULT 'pending',
    security_sandbox_used BOOLEAN DEFAULT FALSE,
    container_id VARCHAR(255),
    resource_limits JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT validation_workspaces_cleanup_check CHECK (cleanup_status IN (
        'pending', 'completed', 'failed', 'partial'
    )),
    CONSTRAINT validation_workspaces_size_check CHECK (workspace_size_bytes >= 0)
);

-- Create security findings table
CREATE TABLE IF NOT EXISTS security_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    file_path VARCHAR(500),
    line_number INTEGER,
    cwe_id VARCHAR(20),
    cvss_score DECIMAL(3,1),
    remediation_advice TEXT,
    false_positive BOOLEAN DEFAULT FALSE,
    suppressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT security_findings_severity_check CHECK (severity IN (
        'critical', 'high', 'medium', 'low', 'info'
    )),
    CONSTRAINT security_findings_cvss_check CHECK (cvss_score >= 0.0 AND cvss_score <= 10.0),
    CONSTRAINT security_findings_line_check CHECK (line_number >= 0)
);

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS validation_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validation_id UUID REFERENCES pr_validations(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    measurement_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stage_name VARCHAR(100),
    context JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT validation_performance_metrics_value_check CHECK (metric_value >= 0)
);

-- Create indexes for performance

-- PR tracking indexes
CREATE INDEX IF NOT EXISTS idx_pr_tracking_repository ON pr_tracking(repository_name);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_status ON pr_tracking(pr_status);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_created_at ON pr_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_pr_number ON pr_tracking(pr_number);

-- PR validations indexes
CREATE INDEX IF NOT EXISTS idx_pr_validations_validation_id ON pr_validations(validation_id);
CREATE INDEX IF NOT EXISTS idx_pr_validations_pr_id ON pr_validations(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_validations_task_id ON pr_validations(task_id);
CREATE INDEX IF NOT EXISTS idx_pr_validations_status ON pr_validations(validation_status);
CREATE INDEX IF NOT EXISTS idx_pr_validations_started_at ON pr_validations(started_at);
CREATE INDEX IF NOT EXISTS idx_pr_validations_score ON pr_validations(overall_score);
CREATE INDEX IF NOT EXISTS idx_pr_validations_grade ON pr_validations(grade);

-- Validation stages indexes
CREATE INDEX IF NOT EXISTS idx_validation_stages_validation_id ON validation_stages(validation_id);
CREATE INDEX IF NOT EXISTS idx_validation_stages_stage_name ON validation_stages(stage_name);
CREATE INDEX IF NOT EXISTS idx_validation_stages_stage_type ON validation_stages(stage_type);
CREATE INDEX IF NOT EXISTS idx_validation_stages_status ON validation_stages(status);
CREATE INDEX IF NOT EXISTS idx_validation_stages_started_at ON validation_stages(started_at);

-- Error contexts indexes
CREATE INDEX IF NOT EXISTS idx_error_contexts_context_id ON error_contexts(context_id);
CREATE INDEX IF NOT EXISTS idx_error_contexts_validation_id ON error_contexts(validation_id);
CREATE INDEX IF NOT EXISTS idx_error_contexts_stage_id ON error_contexts(stage_id);
CREATE INDEX IF NOT EXISTS idx_error_contexts_category ON error_contexts(error_category);
CREATE INDEX IF NOT EXISTS idx_error_contexts_severity ON error_contexts(severity);
CREATE INDEX IF NOT EXISTS idx_error_contexts_file_path ON error_contexts(file_path);
CREATE INDEX IF NOT EXISTS idx_error_contexts_fix_applied ON error_contexts(fix_applied);

-- Validation reports indexes
CREATE INDEX IF NOT EXISTS idx_validation_reports_validation_id ON validation_reports(validation_id);
CREATE INDEX IF NOT EXISTS idx_validation_reports_type ON validation_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_validation_reports_generated_at ON validation_reports(generated_at);

-- Workspace tracking indexes
CREATE INDEX IF NOT EXISTS idx_validation_workspaces_workspace_id ON validation_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_validation_workspaces_validation_id ON validation_workspaces(validation_id);
CREATE INDEX IF NOT EXISTS idx_validation_workspaces_cleanup_status ON validation_workspaces(cleanup_status);

-- Security findings indexes
CREATE INDEX IF NOT EXISTS idx_security_findings_validation_id ON security_findings(validation_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(severity);
CREATE INDEX IF NOT EXISTS idx_security_findings_type ON security_findings(finding_type);
CREATE INDEX IF NOT EXISTS idx_security_findings_file_path ON security_findings(file_path);
CREATE INDEX IF NOT EXISTS idx_security_findings_resolved ON security_findings(resolved_at);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_validation_performance_metrics_validation_id ON validation_performance_metrics(validation_id);
CREATE INDEX IF NOT EXISTS idx_validation_performance_metrics_name ON validation_performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_validation_performance_metrics_time ON validation_performance_metrics(measurement_time);
CREATE INDEX IF NOT EXISTS idx_validation_performance_metrics_stage ON validation_performance_metrics(stage_name);

-- Create triggers for automatic updated_at timestamps

-- Triggers for pr_tracking table
CREATE TRIGGER update_pr_tracking_updated_at 
    BEFORE UPDATE ON pr_tracking 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for pr_validations table
CREATE TRIGGER update_pr_validations_updated_at 
    BEFORE UPDATE ON pr_validations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_pr_tracking_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pr_tracking
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_pr_validations_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pr_validations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_validation_stages_trigger
    AFTER INSERT OR UPDATE OR DELETE ON validation_stages
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_error_contexts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON error_contexts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common queries

-- Active PR validations view
CREATE OR REPLACE VIEW active_pr_validations AS
SELECT 
    pv.*,
    pt.pr_number,
    pt.pr_title,
    pt.repository_name,
    pt.branch_name,
    COUNT(vs.id) as stage_count,
    COUNT(CASE WHEN vs.status = 'completed' THEN 1 END) as completed_stages,
    COUNT(CASE WHEN vs.status = 'failed' THEN 1 END) as failed_stages,
    COUNT(ec.id) as error_count
FROM pr_validations pv
LEFT JOIN pr_tracking pt ON pv.pr_id = pt.id
LEFT JOIN validation_stages vs ON pv.id = vs.validation_id
LEFT JOIN error_contexts ec ON pv.id = ec.validation_id
WHERE pv.validation_status IN ('pending', 'running')
GROUP BY pv.id, pt.pr_number, pt.pr_title, pt.repository_name, pt.branch_name;

-- Validation summary view
CREATE OR REPLACE VIEW validation_summary AS
SELECT 
    validation_status,
    COUNT(*) as validation_count,
    AVG(overall_score) as avg_score,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(CASE WHEN grade = 'A' THEN 1 END) as grade_a_count,
    COUNT(CASE WHEN grade = 'B' THEN 1 END) as grade_b_count,
    COUNT(CASE WHEN grade = 'C' THEN 1 END) as grade_c_count,
    COUNT(CASE WHEN grade = 'D' THEN 1 END) as grade_d_count,
    COUNT(CASE WHEN grade = 'F' THEN 1 END) as grade_f_count
FROM pr_validations
GROUP BY validation_status;

-- Error context summary view
CREATE OR REPLACE VIEW error_context_summary AS
SELECT 
    error_category,
    severity,
    COUNT(*) as error_count,
    COUNT(CASE WHEN fix_applied = TRUE THEN 1 END) as fixed_count,
    ROUND(AVG(CASE WHEN fix_applied = TRUE THEN 1.0 ELSE 0.0 END) * 100, 2) as fix_rate_percent
FROM error_contexts
GROUP BY error_category, severity
ORDER BY error_category, 
    CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        WHEN 'info' THEN 5 
    END;

-- Recent validation activity view
CREATE OR REPLACE VIEW recent_validation_activity AS
SELECT 
    pv.validation_id,
    pv.validation_status,
    pv.overall_score,
    pv.grade,
    pv.started_at,
    pv.completed_at,
    pt.pr_number,
    pt.pr_title,
    pt.repository_name,
    pt.pr_author,
    COUNT(ec.id) as error_count
FROM pr_validations pv
LEFT JOIN pr_tracking pt ON pv.pr_id = pt.id
LEFT JOIN error_contexts ec ON pv.id = ec.validation_id
WHERE pv.started_at >= NOW() - INTERVAL '7 days'
GROUP BY pv.id, pt.pr_number, pt.pr_title, pt.repository_name, pt.pr_author
ORDER BY pv.started_at DESC
LIMIT 100;

-- Security findings summary view
CREATE OR REPLACE VIEW security_findings_summary AS
SELECT 
    pv.validation_id,
    pt.pr_number,
    pt.repository_name,
    COUNT(sf.id) as total_findings,
    COUNT(CASE WHEN sf.severity = 'critical' THEN 1 END) as critical_findings,
    COUNT(CASE WHEN sf.severity = 'high' THEN 1 END) as high_findings,
    COUNT(CASE WHEN sf.severity = 'medium' THEN 1 END) as medium_findings,
    COUNT(CASE WHEN sf.severity = 'low' THEN 1 END) as low_findings,
    COUNT(CASE WHEN sf.resolved_at IS NOT NULL THEN 1 END) as resolved_findings,
    AVG(sf.cvss_score) as avg_cvss_score
FROM pr_validations pv
LEFT JOIN pr_tracking pt ON pv.pr_id = pt.id
LEFT JOIN security_findings sf ON pv.id = sf.validation_id
GROUP BY pv.id, pv.validation_id, pt.pr_number, pt.repository_name
HAVING COUNT(sf.id) > 0
ORDER BY critical_findings DESC, high_findings DESC;

-- Add table comments
COMMENT ON TABLE pr_tracking IS 'Tracks pull request information and metadata';
COMMENT ON TABLE pr_validations IS 'Main table for tracking PR validation executions';
COMMENT ON TABLE validation_stages IS 'Individual validation stage results and metrics';
COMMENT ON TABLE error_contexts IS 'Error contexts generated for Codegen processing';
COMMENT ON TABLE validation_reports IS 'Generated validation reports in various formats';
COMMENT ON TABLE validation_workspaces IS 'Workspace tracking for cleanup and resource management';
COMMENT ON TABLE security_findings IS 'Security vulnerabilities and findings from validation';
COMMENT ON TABLE validation_performance_metrics IS 'Performance metrics collected during validation';

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum) 
VALUES ('002', 'PR validation schema for Claude Code integration', 'pr_validation_schema_v1_1_0')
ON CONFLICT (version) DO NOTHING;

-- Create stored procedures for common operations

-- Function to get validation statistics
CREATE OR REPLACE FUNCTION get_validation_statistics(
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_validations BIGINT,
    successful_validations BIGINT,
    failed_validations BIGINT,
    avg_score NUMERIC,
    avg_duration_ms NUMERIC,
    total_errors BIGINT,
    critical_errors BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_validations,
        COUNT(CASE WHEN pv.validation_status = 'completed' THEN 1 END) as successful_validations,
        COUNT(CASE WHEN pv.validation_status = 'failed' THEN 1 END) as failed_validations,
        ROUND(AVG(pv.overall_score), 2) as avg_score,
        ROUND(AVG(pv.duration_ms), 2) as avg_duration_ms,
        COUNT(ec.id) as total_errors,
        COUNT(CASE WHEN ec.severity = 'critical' THEN 1 END) as critical_errors
    FROM pr_validations pv
    LEFT JOIN error_contexts ec ON pv.id = ec.validation_id
    WHERE pv.started_at BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old validation data
CREATE OR REPLACE FUNCTION cleanup_old_validation_data(
    retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    -- Delete old validation data (cascades to related tables)
    DELETE FROM pr_validations 
    WHERE completed_at < cutoff_date 
    AND validation_status IN ('completed', 'failed');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO audit_logs (entity_type, entity_id, action, new_values)
    VALUES ('pr_validations', uuid_generate_v4(), 'cleanup', 
            json_build_object('deleted_count', deleted_count, 'cutoff_date', cutoff_date));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

