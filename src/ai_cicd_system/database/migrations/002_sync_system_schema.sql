-- Migration: 002_sync_system_schema.sql
-- Description: Add tables for real-time status synchronization system
-- Created: 2025-05-28
-- Version: 1.0.0

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sync_events table for tracking synchronization events
CREATE TABLE IF NOT EXISTS sync_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_id VARCHAR(255) NOT NULL UNIQUE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    target_systems JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    original_data JSONB NOT NULL,
    mapped_data JSONB DEFAULT '{}'::jsonb,
    conflicts JSONB DEFAULT '[]'::jsonb,
    resolution JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT sync_events_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT sync_events_retry_check CHECK (retry_count >= 0),
    CONSTRAINT sync_events_duration_check CHECK (duration_ms >= 0)
);

-- Create sync_conflicts table for tracking conflict resolution
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_event_id UUID NOT NULL REFERENCES sync_events(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    conflicting_systems JSONB DEFAULT '[]'::jsonb,
    conflict_data JSONB NOT NULL,
    resolution_strategy VARCHAR(50),
    resolution_data JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT FALSE,
    escalated BOOLEAN DEFAULT FALSE,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT sync_conflicts_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT sync_conflicts_type_check CHECK (conflict_type IN (
        'concurrent_update', 'invalid_state_transition', 'dependency_conflict', 
        'business_rule_violation', 'data_inconsistency', 'system_unavailable'
    ))
);

-- Create sync_mappings table for custom status mappings
CREATE TABLE IF NOT EXISTS sync_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_system VARCHAR(50) NOT NULL,
    target_system VARCHAR(50) NOT NULL,
    mapping_type VARCHAR(50) NOT NULL DEFAULT 'status',
    source_value VARCHAR(255) NOT NULL,
    target_value VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT sync_mappings_type_check CHECK (mapping_type IN ('status', 'entityType', 'priority')),
    CONSTRAINT sync_mappings_systems_different CHECK (source_system != target_system),
    
    -- Unique constraint to prevent duplicate mappings
    UNIQUE(source_system, target_system, mapping_type, source_value)
);

-- Create sync_metrics table for performance tracking
CREATE TABLE IF NOT EXISTS sync_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    system VARCHAR(50),
    entity_type VARCHAR(50),
    tags JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT sync_metrics_type_check CHECK (metric_type IN (
        'sync_duration', 'queue_size', 'conflict_rate', 'error_rate', 
        'throughput', 'availability', 'response_time'
    ))
);

-- Create sync_alerts table for monitoring alerts
CREATE TABLE IF NOT EXISTS sync_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id VARCHAR(255) NOT NULL UNIQUE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    system VARCHAR(50),
    metric_value DECIMAL(15,6),
    threshold_value DECIMAL(15,6),
    is_active BOOLEAN DEFAULT TRUE,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT sync_alerts_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
    CONSTRAINT sync_alerts_type_check CHECK (alert_type IN (
        'high_error_rate', 'slow_sync_times', 'large_queue', 'high_conflict_rate',
        'high_memory_usage', 'high_cpu_usage', 'system_unavailable'
    ))
);

-- Create sync_system_status table for tracking system health
CREATE TABLE IF NOT EXISTS sync_system_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    consecutive_failures INTEGER DEFAULT 0,
    total_syncs INTEGER DEFAULT 0,
    successful_syncs INTEGER DEFAULT 0,
    failed_syncs INTEGER DEFAULT 0,
    average_response_time DECIMAL(10,2) DEFAULT 0,
    availability_percentage DECIMAL(5,2) DEFAULT 100.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT sync_system_status_check CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    CONSTRAINT sync_system_status_failures_check CHECK (consecutive_failures >= 0),
    CONSTRAINT sync_system_status_syncs_check CHECK (total_syncs >= 0 AND successful_syncs >= 0 AND failed_syncs >= 0),
    CONSTRAINT sync_system_status_availability_check CHECK (availability_percentage >= 0 AND availability_percentage <= 100),
    
    -- Unique constraint for system name
    UNIQUE(system_name)
);

-- Create sync_websocket_connections table for tracking WebSocket connections
CREATE TABLE IF NOT EXISTS sync_websocket_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_authenticated BOOLEAN DEFAULT FALSE,
    rooms JSONB DEFAULT '[]'::jsonb,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance

-- Sync events indexes
CREATE INDEX IF NOT EXISTS idx_sync_events_sync_id ON sync_events(sync_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_source_system ON sync_events(source_system);
CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events(status);
CREATE INDEX IF NOT EXISTS idx_sync_events_started_at ON sync_events(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_events_completed_at ON sync_events(completed_at);

-- Sync conflicts indexes
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_sync_event_id ON sync_conflicts(sync_event_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_type ON sync_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_severity ON sync_conflicts(severity);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_detected_at ON sync_conflicts(detected_at);

-- Sync mappings indexes
CREATE INDEX IF NOT EXISTS idx_sync_mappings_source_target ON sync_mappings(source_system, target_system);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_type ON sync_mappings(mapping_type);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_active ON sync_mappings(is_active);

-- Sync metrics indexes
CREATE INDEX IF NOT EXISTS idx_sync_metrics_type_name ON sync_metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_sync_metrics_system ON sync_metrics(system);
CREATE INDEX IF NOT EXISTS idx_sync_metrics_recorded_at ON sync_metrics(recorded_at);

-- Sync alerts indexes
CREATE INDEX IF NOT EXISTS idx_sync_alerts_alert_id ON sync_alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_type ON sync_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_severity ON sync_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_active ON sync_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_created_at ON sync_alerts(created_at);

-- Sync system status indexes
CREATE INDEX IF NOT EXISTS idx_sync_system_status_name ON sync_system_status(system_name);
CREATE INDEX IF NOT EXISTS idx_sync_system_status_status ON sync_system_status(status);
CREATE INDEX IF NOT EXISTS idx_sync_system_status_updated_at ON sync_system_status(updated_at);

-- WebSocket connections indexes
CREATE INDEX IF NOT EXISTS idx_sync_websocket_connection_id ON sync_websocket_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_websocket_user_id ON sync_websocket_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_websocket_connected_at ON sync_websocket_connections(connected_at);
CREATE INDEX IF NOT EXISTS idx_sync_websocket_authenticated ON sync_websocket_connections(is_authenticated);

-- Create triggers for automatic updated_at timestamps

-- Trigger for sync_mappings table
CREATE TRIGGER update_sync_mappings_updated_at 
    BEFORE UPDATE ON sync_mappings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for sync_system_status table
CREATE TRIGGER update_sync_system_status_updated_at 
    BEFORE UPDATE ON sync_system_status 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for sync_websocket_connections table
CREATE TRIGGER update_sync_websocket_connections_last_activity 
    BEFORE UPDATE ON sync_websocket_connections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for sync tables
CREATE TRIGGER audit_sync_events_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sync_events
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_sync_conflicts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sync_conflicts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_sync_mappings_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sync_mappings
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common queries

-- Active sync events view
CREATE OR REPLACE VIEW active_sync_events AS
SELECT 
    se.*,
    COUNT(sc.id) as conflict_count,
    CASE 
        WHEN se.status = 'completed' THEN 'success'
        WHEN se.status = 'failed' THEN 'error'
        ELSE 'pending'
    END as result_status
FROM sync_events se
LEFT JOIN sync_conflicts sc ON se.id = sc.sync_event_id
WHERE se.status IN ('pending', 'processing')
GROUP BY se.id;

-- Sync performance summary view
CREATE OR REPLACE VIEW sync_performance_summary AS
SELECT 
    source_system,
    entity_type,
    COUNT(*) as total_syncs,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_syncs,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_syncs,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    ROUND(
        (COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)) * 100, 
        2
    ) as success_rate_percentage
FROM sync_events
WHERE started_at >= NOW() - INTERVAL '24 hours'
GROUP BY source_system, entity_type;

-- Conflict summary view
CREATE OR REPLACE VIEW conflict_summary AS
SELECT 
    conflict_type,
    severity,
    source_system,
    COUNT(*) as total_conflicts,
    COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_conflicts,
    COUNT(CASE WHEN escalated = true THEN 1 END) as escalated_conflicts,
    ROUND(
        (COUNT(CASE WHEN resolved = true THEN 1 END)::DECIMAL / COUNT(*)) * 100, 
        2
    ) as resolution_rate_percentage
FROM sync_conflicts
WHERE detected_at >= NOW() - INTERVAL '24 hours'
GROUP BY conflict_type, severity, source_system;

-- System health view
CREATE OR REPLACE VIEW system_health_summary AS
SELECT 
    system_name,
    status,
    last_sync_at,
    consecutive_failures,
    ROUND(availability_percentage, 2) as availability_percentage,
    ROUND(average_response_time, 2) as avg_response_time_ms,
    CASE 
        WHEN consecutive_failures = 0 AND availability_percentage >= 99 THEN 'excellent'
        WHEN consecutive_failures <= 2 AND availability_percentage >= 95 THEN 'good'
        WHEN consecutive_failures <= 5 AND availability_percentage >= 90 THEN 'fair'
        ELSE 'poor'
    END as health_grade
FROM sync_system_status
ORDER BY availability_percentage DESC;

-- Recent alerts view
CREATE OR REPLACE VIEW recent_alerts AS
SELECT 
    alert_id,
    alert_type,
    severity,
    title,
    message,
    system,
    is_active,
    acknowledged,
    created_at,
    resolved_at
FROM sync_alerts
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Insert initial system status records
INSERT INTO sync_system_status (system_name, status) VALUES 
    ('postgresql', 'healthy'),
    ('linear', 'unknown'),
    ('github', 'unknown'),
    ('agentapi', 'unknown')
ON CONFLICT (system_name) DO NOTHING;

-- Insert default status mappings
INSERT INTO sync_mappings (source_system, target_system, mapping_type, source_value, target_value, created_by) VALUES
    -- PostgreSQL to Linear mappings
    ('postgresql', 'linear', 'status', 'pending', 'Backlog', 'system'),
    ('postgresql', 'linear', 'status', 'in_progress', 'In Progress', 'system'),
    ('postgresql', 'linear', 'status', 'completed', 'Done', 'system'),
    ('postgresql', 'linear', 'status', 'failed', 'Cancelled', 'system'),
    ('postgresql', 'linear', 'status', 'cancelled', 'Cancelled', 'system'),
    
    -- PostgreSQL to GitHub mappings
    ('postgresql', 'github', 'status', 'pending', 'open', 'system'),
    ('postgresql', 'github', 'status', 'in_progress', 'draft', 'system'),
    ('postgresql', 'github', 'status', 'completed', 'merged', 'system'),
    ('postgresql', 'github', 'status', 'failed', 'closed', 'system'),
    ('postgresql', 'github', 'status', 'cancelled', 'closed', 'system'),
    
    -- PostgreSQL to AgentAPI mappings
    ('postgresql', 'agentapi', 'status', 'pending', 'queued', 'system'),
    ('postgresql', 'agentapi', 'status', 'in_progress', 'running', 'system'),
    ('postgresql', 'agentapi', 'status', 'completed', 'success', 'system'),
    ('postgresql', 'agentapi', 'status', 'failed', 'error', 'system'),
    ('postgresql', 'agentapi', 'status', 'cancelled', 'cancelled', 'system')
ON CONFLICT (source_system, target_system, mapping_type, source_value) DO NOTHING;

-- Insert initial migration record
INSERT INTO schema_migrations (version, description, checksum) 
VALUES ('002', 'Real-time status synchronization system schema', 'sync_system_v1_0_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE sync_events IS 'Tracks all synchronization events across systems';
COMMENT ON TABLE sync_conflicts IS 'Records conflicts detected during synchronization';
COMMENT ON TABLE sync_mappings IS 'Custom mappings between different system status values';
COMMENT ON TABLE sync_metrics IS 'Performance metrics for synchronization system';
COMMENT ON TABLE sync_alerts IS 'Monitoring alerts for synchronization issues';
COMMENT ON TABLE sync_system_status IS 'Health status of integrated systems';
COMMENT ON TABLE sync_websocket_connections IS 'Active WebSocket connections for real-time updates';

COMMENT ON VIEW active_sync_events IS 'Currently active synchronization events';
COMMENT ON VIEW sync_performance_summary IS 'Performance summary by system and entity type';
COMMENT ON VIEW conflict_summary IS 'Conflict resolution statistics';
COMMENT ON VIEW system_health_summary IS 'Overall health status of all systems';
COMMENT ON VIEW recent_alerts IS 'Recent monitoring alerts';

