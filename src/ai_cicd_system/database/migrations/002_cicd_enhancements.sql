-- Migration: 002_cicd_enhancements.sql
-- Description: Add CI/CD specific tables and enhancements for code artifacts, validation results, and execution history
-- Created: 2025-05-28
-- Version: 1.1.0

-- Create code artifacts table for storing generated code, tests, and documentation
CREATE TABLE IF NOT EXISTS code_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_type VARCHAR(50) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    content_size BIGINT NOT NULL,
    content_type VARCHAR(100),
    storage_location VARCHAR(500),
    storage_type VARCHAR(50) DEFAULT 'database',
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT code_artifacts_type_check CHECK (artifact_type IN (
        'source_code', 'test_file', 'documentation', 'configuration', 
        'build_script', 'deployment_config', 'schema_migration', 'other'
    )),
    CONSTRAINT code_artifacts_storage_type_check CHECK (storage_type IN (
        'database', 'file_system', 's3', 'azure_blob', 'gcs'
    )),
    CONSTRAINT code_artifacts_size_check CHECK (content_size >= 0)
);

-- Create validation results table for Claude Code validation outcomes
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES code_artifacts(id) ON DELETE SET NULL,
    validation_type VARCHAR(50) NOT NULL,
    validator_name VARCHAR(100) NOT NULL,
    validation_status VARCHAR(50) NOT NULL,
    score DECIMAL(5,2),
    max_score DECIMAL(5,2),
    issues_found INTEGER DEFAULT 0,
    issues_critical INTEGER DEFAULT 0,
    issues_major INTEGER DEFAULT 0,
    issues_minor INTEGER DEFAULT 0,
    validation_details JSONB DEFAULT '{}'::jsonb,
    suggestions JSONB DEFAULT '[]'::jsonb,
    execution_time_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT validation_results_type_check CHECK (validation_type IN (
        'syntax', 'style', 'security', 'performance', 'testing', 
        'documentation', 'best_practices', 'compatibility', 'integration'
    )),
    CONSTRAINT validation_results_status_check CHECK (validation_status IN (
        'pending', 'running', 'passed', 'failed', 'warning', 'error', 'skipped'
    )),
    CONSTRAINT validation_results_score_check CHECK (
        score IS NULL OR (score >= 0 AND score <= COALESCE(max_score, 100))
    ),
    CONSTRAINT validation_results_issues_check CHECK (
        issues_found >= 0 AND issues_critical >= 0 AND 
        issues_major >= 0 AND issues_minor >= 0
    )
);

-- Create execution history table for detailed tracking of processing attempts
CREATE TABLE IF NOT EXISTS execution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    execution_type VARCHAR(50) NOT NULL,
    execution_phase VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb INTEGER,
    exit_code INTEGER,
    stdout_preview TEXT,
    stderr_preview TEXT,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    retry_of UUID REFERENCES execution_history(id) ON DELETE SET NULL,
    environment_info JSONB DEFAULT '{}'::jsonb,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT execution_history_type_check CHECK (execution_type IN (
        'task_processing', 'code_generation', 'validation', 'testing', 
        'deployment', 'rollback', 'cleanup', 'monitoring'
    )),
    CONSTRAINT execution_history_phase_check CHECK (execution_phase IN (
        'initialization', 'preparation', 'execution', 'validation', 
        'finalization', 'cleanup', 'error_handling'
    )),
    CONSTRAINT execution_history_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled', 
        'timeout', 'retry', 'skipped'
    )),
    CONSTRAINT execution_history_duration_check CHECK (
        duration_ms IS NULL OR duration_ms >= 0
    ),
    CONSTRAINT execution_history_retry_check CHECK (retry_count >= 0)
);

-- Create system metrics table for enhanced monitoring
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    aggregation_type VARCHAR(20) DEFAULT 'gauge',
    tags JSONB DEFAULT '{}'::jsonb,
    dimensions JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retention_policy VARCHAR(50) DEFAULT 'standard',
    
    -- Constraints
    CONSTRAINT system_metrics_category_check CHECK (metric_category IN (
        'database', 'application', 'infrastructure', 'business', 'security'
    )),
    CONSTRAINT system_metrics_aggregation_check CHECK (aggregation_type IN (
        'gauge', 'counter', 'histogram', 'summary', 'timer'
    )),
    CONSTRAINT system_metrics_retention_check CHECK (retention_policy IN (
        'short_term', 'standard', 'long_term', 'permanent'
    ))
);

-- Create task relationships table for complex dependency management
CREATE TABLE IF NOT EXISTS task_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    target_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,
    relationship_strength DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_relationships_type_check CHECK (relationship_type IN (
        'blocks', 'depends_on', 'related', 'duplicates', 'subtask_of', 
        'follows', 'conflicts_with', 'enhances', 'replaces'
    )),
    CONSTRAINT task_relationships_strength_check CHECK (
        relationship_strength >= 0.0 AND relationship_strength <= 1.0
    ),
    CONSTRAINT task_relationships_no_self_reference CHECK (source_task_id != target_task_id),
    
    -- Unique constraint to prevent duplicate relationships
    UNIQUE(source_task_id, target_task_id, relationship_type)
);

-- Create indexes for performance optimization

-- Code artifacts indexes
CREATE INDEX IF NOT EXISTS idx_code_artifacts_task_id ON code_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_type ON code_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_hash ON code_artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_created_at ON code_artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_file_path ON code_artifacts(file_path);

-- Validation results indexes
CREATE INDEX IF NOT EXISTS idx_validation_results_task_id ON validation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_artifact_id ON validation_results(artifact_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_type ON validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_status ON validation_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_validation_results_score ON validation_results(score);
CREATE INDEX IF NOT EXISTS idx_validation_results_completed_at ON validation_results(completed_at);

-- Execution history indexes
CREATE INDEX IF NOT EXISTS idx_execution_history_task_id ON execution_history(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_type ON execution_history(execution_type);
CREATE INDEX IF NOT EXISTS idx_execution_history_phase ON execution_history(execution_phase);
CREATE INDEX IF NOT EXISTS idx_execution_history_status ON execution_history(status);
CREATE INDEX IF NOT EXISTS idx_execution_history_started_at ON execution_history(started_at);
CREATE INDEX IF NOT EXISTS idx_execution_history_duration ON execution_history(duration_ms);
CREATE INDEX IF NOT EXISTS idx_execution_history_retry_of ON execution_history(retry_of);

-- System metrics indexes
CREATE INDEX IF NOT EXISTS idx_system_metrics_category_name ON system_metrics(metric_category, metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_retention ON system_metrics(retention_policy);
CREATE INDEX IF NOT EXISTS idx_system_metrics_tags ON system_metrics USING GIN(tags);

-- Task relationships indexes
CREATE INDEX IF NOT EXISTS idx_task_relationships_source ON task_relationships(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_target ON task_relationships(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_type ON task_relationships(relationship_type);

-- Add triggers for automatic updated_at timestamps

-- Code artifacts trigger
CREATE TRIGGER update_code_artifacts_updated_at
    BEFORE UPDATE ON code_artifacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Validation results trigger
CREATE TRIGGER update_validation_results_updated_at
    BEFORE UPDATE ON validation_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_code_artifacts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON code_artifacts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_validation_results_trigger
    AFTER INSERT OR UPDATE OR DELETE ON validation_results
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_execution_history_trigger
    AFTER INSERT OR UPDATE OR DELETE ON execution_history
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_task_relationships_trigger
    AFTER INSERT OR UPDATE OR DELETE ON task_relationships
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create enhanced views for CI/CD operations

-- Task execution summary view
CREATE OR REPLACE VIEW task_execution_summary AS
SELECT
    t.id,
    t.title,
    t.status,
    t.priority,
    t.complexity_score,
    COUNT(DISTINCT ca.id) as artifact_count,
    COUNT(DISTINCT vr.id) as validation_count,
    COUNT(DISTINCT eh.id) as execution_count,
    AVG(vr.score) as avg_validation_score,
    SUM(CASE WHEN vr.validation_status = 'passed' THEN 1 ELSE 0 END) as validations_passed,
    SUM(CASE WHEN vr.validation_status = 'failed' THEN 1 ELSE 0 END) as validations_failed,
    MAX(eh.completed_at) as last_execution,
    SUM(eh.duration_ms) as total_execution_time_ms,
    t.created_at,
    t.updated_at
FROM tasks t
LEFT JOIN code_artifacts ca ON t.id = ca.task_id
LEFT JOIN validation_results vr ON t.id = vr.task_id
LEFT JOIN execution_history eh ON t.id = eh.task_id
GROUP BY t.id, t.title, t.status, t.priority, t.complexity_score, t.created_at, t.updated_at;

-- CI/CD pipeline status view
CREATE OR REPLACE VIEW cicd_pipeline_status AS
SELECT
    t.id as task_id,
    t.title,
    t.status as task_status,
    CASE 
        WHEN COUNT(ca.id) = 0 THEN 'no_artifacts'
        WHEN COUNT(CASE WHEN vr.validation_status = 'failed' THEN 1 END) > 0 THEN 'validation_failed'
        WHEN COUNT(CASE WHEN vr.validation_status = 'pending' OR vr.validation_status = 'running' THEN 1 END) > 0 THEN 'validation_running'
        WHEN COUNT(CASE WHEN vr.validation_status = 'passed' THEN 1 END) = COUNT(vr.id) AND COUNT(vr.id) > 0 THEN 'validation_passed'
        ELSE 'unknown'
    END as pipeline_status,
    COUNT(DISTINCT ca.id) as total_artifacts,
    COUNT(DISTINCT vr.id) as total_validations,
    SUM(CASE WHEN vr.validation_status = 'passed' THEN 1 ELSE 0 END) as passed_validations,
    SUM(CASE WHEN vr.validation_status = 'failed' THEN 1 ELSE 0 END) as failed_validations,
    AVG(vr.score) as avg_validation_score,
    MAX(vr.completed_at) as last_validation_time,
    SUM(vr.issues_critical) as total_critical_issues,
    SUM(vr.issues_major) as total_major_issues,
    SUM(vr.issues_minor) as total_minor_issues
FROM tasks t
LEFT JOIN code_artifacts ca ON t.id = ca.task_id
LEFT JOIN validation_results vr ON t.id = vr.task_id
WHERE t.status IN ('pending', 'in_progress', 'completed')
GROUP BY t.id, t.title, t.status;

-- Performance metrics view
CREATE OR REPLACE VIEW performance_dashboard AS
SELECT
    DATE_TRUNC('hour', timestamp) as time_bucket,
    metric_category,
    metric_name,
    AVG(metric_value) as avg_value,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    COUNT(*) as sample_count,
    STDDEV(metric_value) as std_deviation
FROM system_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), metric_category, metric_name
ORDER BY time_bucket DESC, metric_category, metric_name;

-- Task dependency graph view
CREATE OR REPLACE VIEW task_dependency_graph AS
SELECT
    tr.source_task_id,
    t1.title as source_task_title,
    t1.status as source_task_status,
    tr.target_task_id,
    t2.title as target_task_title,
    t2.status as target_task_status,
    tr.relationship_type,
    tr.relationship_strength,
    tr.created_at
FROM task_relationships tr
JOIN tasks t1 ON tr.source_task_id = t1.id
JOIN tasks t2 ON tr.target_task_id = t2.id
ORDER BY tr.created_at DESC;

-- Add table comments
COMMENT ON TABLE code_artifacts IS 'Storage for generated code, tests, documentation and other CI/CD artifacts';
COMMENT ON TABLE validation_results IS 'Results from Claude Code and other validation tools';
COMMENT ON TABLE execution_history IS 'Detailed execution tracking for CI/CD operations';
COMMENT ON TABLE system_metrics IS 'Enhanced system performance and business metrics';
COMMENT ON TABLE task_relationships IS 'Complex task relationships beyond simple dependencies';

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('002', 'CI/CD enhancements - code artifacts, validation results, execution history', 'cicd_enhancements_v1_1_0')
ON CONFLICT (version) DO NOTHING;

-- Create partitioning for high-volume tables (execution_history and system_metrics)
-- Note: This creates monthly partitions for better performance with large datasets

-- Enable partitioning for execution_history
CREATE TABLE IF NOT EXISTS execution_history_template (LIKE execution_history INCLUDING ALL);
ALTER TABLE execution_history_template ADD CONSTRAINT execution_history_template_partition_check 
    CHECK (started_at >= '2025-01-01'::timestamp AND started_at < '2025-02-01'::timestamp);

-- Enable partitioning for system_metrics  
CREATE TABLE IF NOT EXISTS system_metrics_template (LIKE system_metrics INCLUDING ALL);
ALTER TABLE system_metrics_template ADD CONSTRAINT system_metrics_template_partition_check 
    CHECK (timestamp >= '2025-01-01'::timestamp AND timestamp < '2025-02-01'::timestamp);

-- Create function for automatic partition creation
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name TEXT, start_date DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    end_date DATE;
BEGIN
    partition_name := table_name || '_' || TO_CHAR(start_date, 'YYYY_MM');
    end_date := start_date + INTERVAL '1 month';
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I 
                    FOR VALUES FROM (%L) TO (%L)',
                   partition_name, table_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;

-- Create initial partitions for current month
SELECT create_monthly_partition('execution_history', DATE_TRUNC('month', CURRENT_DATE)::DATE);
SELECT create_monthly_partition('system_metrics', DATE_TRUNC('month', CURRENT_DATE)::DATE);

