-- Migration: 20250528162700_add_connection_pool_monitoring.sql
-- Description: Add connection pool monitoring and performance tracking tables
-- Created: 2025-05-28
-- Version: 20250528162700
-- @zero-downtime: true
-- @estimated-duration: 45 seconds
-- @risk-level: low
-- @dependencies: 001_initial_schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create connection pool metrics table
CREATE TABLE IF NOT EXISTS connection_pool_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_name VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_connections INTEGER NOT NULL,
    active_connections INTEGER NOT NULL,
    idle_connections INTEGER NOT NULL,
    waiting_connections INTEGER NOT NULL,
    utilization_rate DECIMAL(5,4) NOT NULL,
    avg_response_time_ms INTEGER,
    query_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT pool_metrics_utilization_check CHECK (utilization_rate >= 0 AND utilization_rate <= 1),
    CONSTRAINT pool_metrics_connections_check CHECK (
        total_connections >= 0 AND 
        active_connections >= 0 AND 
        idle_connections >= 0 AND
        waiting_connections >= 0
    )
);

-- Create health check results table
CREATE TABLE IF NOT EXISTS health_check_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    overall_status VARCHAR(20) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    pools_checked INTEGER NOT NULL,
    healthy_pools INTEGER NOT NULL,
    issues_detected JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT health_status_check CHECK (overall_status IN ('healthy', 'warning', 'critical', 'unknown')),
    CONSTRAINT health_pools_check CHECK (healthy_pools <= pools_checked)
);

-- Create migration performance tracking table
CREATE TABLE IF NOT EXISTS migration_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    migration_version VARCHAR(50) NOT NULL,
    operation_type VARCHAR(20) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    success BOOLEAN,
    error_message TEXT,
    pre_migration_health JSONB,
    post_migration_health JSONB,
    backup_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT migration_operation_check CHECK (operation_type IN ('apply', 'rollback', 'validate')),
    CONSTRAINT migration_duration_check CHECK (duration_ms >= 0 OR duration_ms IS NULL)
);

-- Create query performance tracking table
CREATE TABLE IF NOT EXISTS query_performance_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id VARCHAR(100) NOT NULL,
    pool_name VARCHAR(50) NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    query_type VARCHAR(20),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    connection_acquisition_time_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT query_execution_time_check CHECK (execution_time_ms >= 0),
    CONSTRAINT query_acquisition_time_check CHECK (connection_acquisition_time_ms >= 0 OR connection_acquisition_time_ms IS NULL)
);

-- Create alert history table
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    pool_name VARCHAR(50),
    message TEXT NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_method VARCHAR(50),
    alert_data JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT alert_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT alert_resolution_check CHECK (resolved_at IS NULL OR resolved_at >= triggered_at)
);

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_metrics_pool_timestamp 
    ON connection_pool_metrics(pool_name, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_metrics_timestamp 
    ON connection_pool_metrics(timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_health_check_timestamp 
    ON health_check_results(check_timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_health_check_status 
    ON health_check_results(overall_status, check_timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_migration_performance_version 
    ON migration_performance(migration_version, operation_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_migration_performance_timestamp 
    ON migration_performance(started_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_pool_timestamp 
    ON query_performance_log(pool_name, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_hash 
    ON query_performance_log(query_hash, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_slow 
    ON query_performance_log(execution_time_ms DESC, timestamp DESC) 
    WHERE execution_time_ms > 1000;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_history_type_severity 
    ON alert_history(alert_type, severity, triggered_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_history_pool 
    ON alert_history(pool_name, triggered_at DESC) 
    WHERE pool_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_history_unresolved 
    ON alert_history(triggered_at DESC) 
    WHERE resolved_at IS NULL;

-- Create partitioning for large tables (optional, for high-volume environments)
-- This would be enabled in production environments with high data volume

-- Create views for common queries
CREATE OR REPLACE VIEW pool_health_summary AS
SELECT 
    pool_name,
    COUNT(*) as total_checks,
    AVG(utilization_rate) as avg_utilization,
    AVG(avg_response_time_ms) as avg_response_time,
    MAX(timestamp) as last_check,
    CASE 
        WHEN AVG(utilization_rate) > 0.9 THEN 'critical'
        WHEN AVG(utilization_rate) > 0.7 THEN 'warning'
        ELSE 'healthy'
    END as health_status
FROM connection_pool_metrics 
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY pool_name;

CREATE OR REPLACE VIEW recent_alerts AS
SELECT 
    alert_type,
    severity,
    pool_name,
    message,
    triggered_at,
    resolved_at,
    CASE 
        WHEN resolved_at IS NULL THEN 'active'
        ELSE 'resolved'
    END as status
FROM alert_history 
WHERE triggered_at > NOW() - INTERVAL '24 hours'
ORDER BY triggered_at DESC;

CREATE OR REPLACE VIEW slow_queries_summary AS
SELECT 
    pool_name,
    query_type,
    COUNT(*) as query_count,
    AVG(execution_time_ms) as avg_execution_time,
    MAX(execution_time_ms) as max_execution_time,
    COUNT(*) FILTER (WHERE NOT success) as error_count
FROM query_performance_log 
WHERE timestamp > NOW() - INTERVAL '1 hour'
    AND execution_time_ms > 1000
GROUP BY pool_name, query_type
ORDER BY avg_execution_time DESC;

-- Create functions for data cleanup (retention management)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Clean up metrics older than 30 days
    DELETE FROM connection_pool_metrics 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up query logs older than 7 days
    DELETE FROM query_performance_log 
    WHERE timestamp < NOW() - INTERVAL '7 days';
    
    -- Clean up resolved alerts older than 90 days
    DELETE FROM alert_history 
    WHERE resolved_at IS NOT NULL 
        AND resolved_at < NOW() - INTERVAL '90 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get pool statistics
CREATE OR REPLACE FUNCTION get_pool_statistics(p_pool_name VARCHAR DEFAULT NULL)
RETURNS TABLE (
    pool_name VARCHAR,
    current_utilization DECIMAL,
    avg_response_time INTEGER,
    total_queries BIGINT,
    error_rate DECIMAL,
    last_updated TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.pool_name,
        m.utilization_rate as current_utilization,
        m.avg_response_time_ms as avg_response_time,
        COALESCE(q.total_queries, 0) as total_queries,
        COALESCE(q.error_rate, 0) as error_rate,
        m.timestamp as last_updated
    FROM (
        SELECT DISTINCT ON (pm.pool_name) 
            pm.pool_name,
            pm.utilization_rate,
            pm.avg_response_time_ms,
            pm.timestamp
        FROM connection_pool_metrics pm
        WHERE (p_pool_name IS NULL OR pm.pool_name = p_pool_name)
        ORDER BY pm.pool_name, pm.timestamp DESC
    ) m
    LEFT JOIN (
        SELECT 
            qpl.pool_name,
            COUNT(*) as total_queries,
            CASE 
                WHEN COUNT(*) > 0 THEN 
                    ROUND(COUNT(*) FILTER (WHERE NOT qpl.success)::DECIMAL / COUNT(*), 4)
                ELSE 0
            END as error_rate
        FROM query_performance_log qpl
        WHERE qpl.timestamp > NOW() - INTERVAL '1 hour'
            AND (p_pool_name IS NULL OR qpl.pool_name = p_pool_name)
        GROUP BY qpl.pool_name
    ) q ON m.pool_name = q.pool_name;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE connection_pool_metrics IS 'Stores real-time connection pool performance metrics';
COMMENT ON TABLE health_check_results IS 'Stores database health check results and status';
COMMENT ON TABLE migration_performance IS 'Tracks migration execution performance and outcomes';
COMMENT ON TABLE query_performance_log IS 'Logs individual query performance for analysis';
COMMENT ON TABLE alert_history IS 'Maintains history of system alerts and their resolution';

COMMENT ON VIEW pool_health_summary IS 'Provides aggregated pool health metrics for the last hour';
COMMENT ON VIEW recent_alerts IS 'Shows recent alerts from the last 24 hours';
COMMENT ON VIEW slow_queries_summary IS 'Summarizes slow query performance by pool and type';

COMMENT ON FUNCTION cleanup_old_metrics() IS 'Cleans up old monitoring data based on retention policies';
COMMENT ON FUNCTION get_pool_statistics(VARCHAR) IS 'Returns current statistics for specified pool or all pools';

-- Grant appropriate permissions (adjust based on your security model)
-- GRANT SELECT, INSERT ON connection_pool_metrics TO monitoring_user;
-- GRANT SELECT, INSERT ON health_check_results TO monitoring_user;
-- GRANT SELECT, INSERT ON migration_performance TO migration_user;
-- GRANT SELECT, INSERT ON query_performance_log TO monitoring_user;
-- GRANT SELECT, INSERT ON alert_history TO monitoring_user;

-- Create a trigger to automatically update metadata timestamps
CREATE OR REPLACE FUNCTION update_monitoring_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('updated_at', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
CREATE TRIGGER update_pool_metrics_timestamp
    BEFORE INSERT OR UPDATE ON connection_pool_metrics
    FOR EACH ROW EXECUTE FUNCTION update_monitoring_timestamp();

CREATE TRIGGER update_health_check_timestamp
    BEFORE INSERT OR UPDATE ON health_check_results
    FOR EACH ROW EXECUTE FUNCTION update_monitoring_timestamp();

-- Insert initial monitoring configuration
INSERT INTO connection_pool_metrics (
    pool_name, 
    total_connections, 
    active_connections, 
    idle_connections, 
    waiting_connections, 
    utilization_rate,
    metadata
) VALUES (
    'primary',
    0,
    0,
    0,
    0,
    0.0,
    jsonb_build_object(
        'created_by', 'migration_20250528162700',
        'purpose', 'initial_monitoring_setup',
        'version', '1.0.0'
    )
) ON CONFLICT DO NOTHING;

-- Log this migration
INSERT INTO migration_performance (
    migration_version,
    operation_type,
    started_at,
    success,
    metadata
) VALUES (
    '20250528162700',
    'apply',
    NOW(),
    true,
    jsonb_build_object(
        'description', 'Add connection pool monitoring tables',
        'tables_created', ARRAY['connection_pool_metrics', 'health_check_results', 'migration_performance', 'query_performance_log', 'alert_history'],
        'indexes_created', 11,
        'views_created', 3,
        'functions_created', 2
    )
);

