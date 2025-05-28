-- =====================================================
-- Audit Schema Definition
-- =====================================================
-- Description: Comprehensive audit logging schema for AI CI/CD orchestration system
-- Version: 2.0.0
-- Created: 2025-05-28

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create comprehensive audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity information
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'task', 'workflow', 'workflow_step', 'user', 'system', 'configuration', 
        'deployment', 'repository', 'pull_request', 'branch'
    )),
    entity_id UUID NOT NULL,
    
    -- Action information
    action VARCHAR(100) NOT NULL CHECK (action IN (
        'create', 'update', 'delete', 'status_change', 'assign', 'unassign',
        'start', 'complete', 'fail', 'retry', 'cancel', 'pause', 'resume',
        'deploy', 'rollback', 'approve', 'reject', 'merge', 'branch_create',
        'branch_delete', 'pr_create', 'pr_merge', 'pr_close', 'config_change'
    )),
    
    -- Change tracking
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[], -- Array of field names that changed
    
    -- User and session information
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    session_id VARCHAR(255),
    
    -- Request information
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),
    api_endpoint VARCHAR(500),
    http_method VARCHAR(10),
    
    -- Timing information
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_time_ms INTEGER,
    
    -- Context and metadata
    context JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Severity and classification
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN (
        'debug', 'info', 'warning', 'error', 'critical'
    )),
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN (
        'general', 'security', 'performance', 'business', 'system', 
        'integration', 'compliance', 'data_change'
    )),
    
    -- Additional tracking
    correlation_id VARCHAR(255), -- For tracking related events
    parent_audit_id UUID REFERENCES audit_logs(id), -- For hierarchical events
    
    -- Constraints
    CONSTRAINT audit_logs_entity_check CHECK (entity_id IS NOT NULL),
    CONSTRAINT audit_logs_timestamp_check CHECK (timestamp <= NOW() + INTERVAL '1 minute')
);

-- Create comprehensive indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_parent_audit_id ON audit_logs(parent_audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_values_gin ON audit_logs USING GIN (old_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_values_gin ON audit_logs USING GIN (new_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_context_gin ON audit_logs USING GIN (context);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata);

-- GIN index for changed_fields array
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_fields_gin ON audit_logs USING GIN (changed_fields);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_timestamp ON audit_logs(entity_type, entity_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_timestamp ON audit_logs(severity, timestamp);

-- Partial indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_audit_logs_errors ON audit_logs(id, entity_type, entity_id, timestamp) 
WHERE severity IN ('error', 'critical');

CREATE INDEX IF NOT EXISTS idx_audit_logs_recent ON audit_logs(timestamp, entity_type, action) 
WHERE timestamp > NOW() - INTERVAL '7 days';

CREATE INDEX IF NOT EXISTS idx_audit_logs_security ON audit_logs(timestamp, user_id, ip_address) 
WHERE category = 'security';

-- Create audit summary table for aggregated statistics
CREATE TABLE IF NOT EXISTS audit_summary (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Summary period
    summary_date DATE NOT NULL,
    summary_hour INTEGER CHECK (summary_hour >= 0 AND summary_hour <= 23),
    
    -- Entity and action statistics
    entity_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    
    -- Counts and metrics
    event_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    unique_entities INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_processing_time_ms DECIMAL(10,2),
    max_processing_time_ms INTEGER,
    min_processing_time_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(summary_date, summary_hour, entity_type, action)
);

-- Indexes for audit summary
CREATE INDEX IF NOT EXISTS idx_audit_summary_date ON audit_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_audit_summary_entity_type ON audit_summary(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_summary_action ON audit_summary(action);
CREATE INDEX IF NOT EXISTS idx_audit_summary_date_hour ON audit_summary(summary_date, summary_hour);

-- Function to create audit log entries
CREATE OR REPLACE FUNCTION create_audit_log(
    p_entity_type VARCHAR(50),
    p_entity_id UUID,
    p_action VARCHAR(100),
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_context JSONB DEFAULT '{}'::jsonb,
    p_severity VARCHAR(20) DEFAULT 'info',
    p_category VARCHAR(50) DEFAULT 'general'
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    changed_fields_array TEXT[];
BEGIN
    -- Generate new audit ID
    audit_id := gen_random_uuid();
    
    -- Calculate changed fields if both old and new values provided
    IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
        SELECT ARRAY(
            SELECT key 
            FROM jsonb_each(p_new_values) 
            WHERE p_old_values->key IS DISTINCT FROM p_new_values->key
        ) INTO changed_fields_array;
    END IF;
    
    -- Insert audit log entry
    INSERT INTO audit_logs (
        id, entity_type, entity_id, action, old_values, new_values, 
        changed_fields, user_id, context, severity, category, timestamp
    ) VALUES (
        audit_id, p_entity_type, p_entity_id, p_action, p_old_values, p_new_values,
        changed_fields_array, p_user_id, p_context, p_severity, p_category, NOW()
    );
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically audit table changes
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    audit_id UUID;
    old_values JSONB;
    new_values JSONB;
    action_name VARCHAR(100);
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        action_name := 'create';
        new_values := row_to_json(NEW)::jsonb;
        old_values := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        action_name := 'update';
        old_values := row_to_json(OLD)::jsonb;
        new_values := row_to_json(NEW)::jsonb;
        
        -- Special handling for status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            action_name := 'status_change';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_name := 'delete';
        old_values := row_to_json(OLD)::jsonb;
        new_values := NULL;
    END IF;
    
    -- Create audit log entry
    SELECT create_audit_log(
        TG_TABLE_NAME::VARCHAR(50),
        COALESCE(NEW.id, OLD.id),
        action_name,
        old_values,
        new_values,
        COALESCE(
            current_setting('audit.user_id', true),
            'system'
        ),
        jsonb_build_object(
            'table_name', TG_TABLE_NAME,
            'operation', TG_OP,
            'trigger_name', TG_NAME
        ),
        'info',
        'data_change'
    ) INTO audit_id;
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update audit summary statistics
CREATE OR REPLACE FUNCTION update_audit_summary()
RETURNS TRIGGER AS $$
DECLARE
    summary_date DATE;
    summary_hour INTEGER;
BEGIN
    -- Extract date and hour from timestamp
    summary_date := NEW.timestamp::DATE;
    summary_hour := EXTRACT(HOUR FROM NEW.timestamp);
    
    -- Update or insert summary record
    INSERT INTO audit_summary (
        summary_date, summary_hour, entity_type, action,
        event_count, unique_users, unique_entities, error_count,
        avg_processing_time_ms, max_processing_time_ms, min_processing_time_ms
    ) VALUES (
        summary_date, summary_hour, NEW.entity_type, NEW.action,
        1, 
        CASE WHEN NEW.user_id IS NOT NULL THEN 1 ELSE 0 END,
        1,
        CASE WHEN NEW.severity IN ('error', 'critical') THEN 1 ELSE 0 END,
        NEW.processing_time_ms,
        NEW.processing_time_ms,
        NEW.processing_time_ms
    )
    ON CONFLICT (summary_date, summary_hour, entity_type, action)
    DO UPDATE SET
        event_count = audit_summary.event_count + 1,
        error_count = audit_summary.error_count + 
            CASE WHEN NEW.severity IN ('error', 'critical') THEN 1 ELSE 0 END,
        avg_processing_time_ms = (
            COALESCE(audit_summary.avg_processing_time_ms * audit_summary.event_count, 0) + 
            COALESCE(NEW.processing_time_ms, 0)
        ) / (audit_summary.event_count + 1),
        max_processing_time_ms = GREATEST(
            COALESCE(audit_summary.max_processing_time_ms, 0), 
            COALESCE(NEW.processing_time_ms, 0)
        ),
        min_processing_time_ms = LEAST(
            COALESCE(audit_summary.min_processing_time_ms, 999999), 
            COALESCE(NEW.processing_time_ms, 999999)
        ),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update audit summary
DROP TRIGGER IF EXISTS trigger_update_audit_summary ON audit_logs;
CREATE TRIGGER trigger_update_audit_summary
    AFTER INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_audit_summary();

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete audit logs older than retention period
    DELETE FROM audit_logs 
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    PERFORM create_audit_log(
        'system',
        gen_random_uuid(),
        'cleanup',
        NULL,
        jsonb_build_object(
            'deleted_count', deleted_count,
            'retention_days', retention_days
        ),
        'system',
        jsonb_build_object('operation', 'audit_cleanup'),
        'info',
        'system'
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create views for common audit queries

-- Recent activity view
CREATE OR REPLACE VIEW v_recent_audit_activity AS
SELECT 
    al.timestamp,
    al.entity_type,
    al.entity_id,
    al.action,
    al.user_id,
    al.user_name,
    al.severity,
    al.category,
    CASE 
        WHEN al.entity_type = 'task' THEN (
            SELECT t.title FROM tasks t WHERE t.id = al.entity_id
        )
        WHEN al.entity_type = 'workflow' THEN (
            SELECT w.name FROM workflows w WHERE w.id = al.entity_id
        )
        ELSE al.entity_id::text
    END as entity_name,
    al.changed_fields,
    al.correlation_id
FROM audit_logs al
ORDER BY al.timestamp DESC
LIMIT 1000;

-- User activity summary view
CREATE OR REPLACE VIEW v_user_activity_summary AS
SELECT 
    user_id,
    user_name,
    COUNT(*) as total_actions,
    COUNT(DISTINCT entity_type) as entity_types_accessed,
    COUNT(DISTINCT DATE(timestamp)) as active_days,
    MAX(timestamp) as last_activity,
    COUNT(CASE WHEN severity IN ('error', 'critical') THEN 1 END) as error_count,
    array_agg(DISTINCT action ORDER BY action) as actions_performed
FROM audit_logs
WHERE user_id IS NOT NULL
    AND timestamp > NOW() - INTERVAL '30 days'
GROUP BY user_id, user_name
ORDER BY total_actions DESC;

-- Security events view
CREATE OR REPLACE VIEW v_security_events AS
SELECT 
    al.*,
    CASE 
        WHEN al.action IN ('delete', 'config_change') THEN 'high'
        WHEN al.severity = 'critical' THEN 'high'
        WHEN al.category = 'security' THEN 'medium'
        ELSE 'low'
    END as risk_level
FROM audit_logs al
WHERE al.category = 'security'
    OR al.action IN ('delete', 'config_change', 'assign', 'unassign')
    OR al.severity IN ('error', 'critical')
ORDER BY al.timestamp DESC;

-- Error analysis view
CREATE OR REPLACE VIEW v_error_analysis AS
SELECT 
    entity_type,
    action,
    severity,
    COUNT(*) as error_count,
    COUNT(DISTINCT entity_id) as affected_entities,
    COUNT(DISTINCT user_id) as affected_users,
    MIN(timestamp) as first_occurrence,
    MAX(timestamp) as last_occurrence,
    array_agg(DISTINCT correlation_id) FILTER (WHERE correlation_id IS NOT NULL) as correlation_ids
FROM audit_logs
WHERE severity IN ('error', 'critical')
    AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY entity_type, action, severity
ORDER BY error_count DESC;

-- Audit statistics view
CREATE OR REPLACE VIEW v_audit_statistics AS
SELECT 
    DATE(timestamp) as audit_date,
    entity_type,
    action,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT entity_id) as unique_entities,
    COUNT(CASE WHEN severity IN ('error', 'critical') THEN 1 END) as error_count,
    AVG(processing_time_ms) as avg_processing_time_ms
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp), entity_type, action
ORDER BY audit_date DESC, event_count DESC;

-- Comments on tables and columns for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit logging table for tracking all system changes and activities';
COMMENT ON COLUMN audit_logs.id IS 'Unique audit log entry identifier using UUID';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity being audited (task, workflow, user, etc.)';
COMMENT ON COLUMN audit_logs.entity_id IS 'UUID of the specific entity being audited';
COMMENT ON COLUMN audit_logs.action IS 'Action performed on the entity';
COMMENT ON COLUMN audit_logs.old_values IS 'JSONB snapshot of entity values before change';
COMMENT ON COLUMN audit_logs.new_values IS 'JSONB snapshot of entity values after change';
COMMENT ON COLUMN audit_logs.changed_fields IS 'Array of field names that were modified';
COMMENT ON COLUMN audit_logs.user_id IS 'ID of user who performed the action';
COMMENT ON COLUMN audit_logs.session_id IS 'Session identifier for tracking user sessions';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the client making the request';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string from the client request';
COMMENT ON COLUMN audit_logs.timestamp IS 'Exact timestamp when the action occurred';
COMMENT ON COLUMN audit_logs.context IS 'JSONB additional context information';
COMMENT ON COLUMN audit_logs.metadata IS 'JSONB flexible metadata storage';
COMMENT ON COLUMN audit_logs.severity IS 'Severity level of the audit event';
COMMENT ON COLUMN audit_logs.category IS 'Category classification for the audit event';
COMMENT ON COLUMN audit_logs.correlation_id IS 'Identifier for tracking related events across the system';
COMMENT ON COLUMN audit_logs.parent_audit_id IS 'Reference to parent audit event for hierarchical tracking';

COMMENT ON TABLE audit_summary IS 'Aggregated audit statistics for performance and reporting';
COMMENT ON FUNCTION create_audit_log IS 'Function to create standardized audit log entries';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Function to clean up audit logs older than specified retention period';

