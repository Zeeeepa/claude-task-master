-- Claude Task Master Database Initialization Script
-- This script sets up the initial database structure and configuration

-- Create database if it doesn't exist (for Docker initialization)
-- Note: This will only run if the database doesn't exist

-- Set timezone
SET timezone = 'UTC';

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create application user (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'claude_task_master_app') THEN
        CREATE ROLE claude_task_master_app WITH LOGIN PASSWORD 'secure_app_password';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE claude_task_master TO claude_task_master_app;
GRANT USAGE ON SCHEMA public TO claude_task_master_app;
GRANT CREATE ON SCHEMA public TO claude_task_master_app;

-- Create monitoring user for health checks
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'claude_task_master_monitor') THEN
        CREATE ROLE claude_task_master_monitor WITH LOGIN PASSWORD 'monitor_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE claude_task_master TO claude_task_master_monitor;
GRANT USAGE ON SCHEMA public TO claude_task_master_monitor;

-- Set up connection limits
ALTER ROLE claude_task_master_app CONNECTION LIMIT 20;
ALTER ROLE claude_task_master_monitor CONNECTION LIMIT 5;

-- Create initial tables (if they don't exist)
-- These will be managed by the migration system, but we include basic structure for initialization

-- Health check table for monitoring
CREATE TABLE IF NOT EXISTS health_checks (
    id SERIAL PRIMARY KEY,
    check_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for health checks
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_health_checks_name_status ON health_checks(check_name, status);

-- Grant permissions on health check table
GRANT SELECT, INSERT ON health_checks TO claude_task_master_monitor;
GRANT USAGE ON SEQUENCE health_checks_id_seq TO claude_task_master_monitor;

-- Create metrics table for storing application metrics
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(20) NOT NULL, -- counter, gauge, histogram
    value DOUBLE PRECISION NOT NULL,
    labels JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for metrics
CREATE INDEX IF NOT EXISTS idx_metrics_name_type ON metrics(metric_name, metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_metrics_labels ON metrics USING GIN(labels);

-- Grant permissions on metrics table
GRANT SELECT, INSERT ON metrics TO claude_task_master_app;
GRANT USAGE ON SEQUENCE metrics_id_seq TO claude_task_master_app;

-- Create alerts table for storing alert history
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(100) NOT NULL UNIQUE,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    status VARCHAR(20) DEFAULT 'active', -- active, acknowledged, resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100)
);

-- Create indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_type_severity ON alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);

-- Grant permissions on alerts table
GRANT SELECT, INSERT, UPDATE ON alerts TO claude_task_master_app;
GRANT USAGE ON SEQUENCE alerts_id_seq TO claude_task_master_app;

-- Create function for cleanup old records
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS void AS $$
BEGIN
    -- Clean up health checks older than 7 days
    DELETE FROM health_checks WHERE checked_at < NOW() - INTERVAL '7 days';
    
    -- Clean up metrics older than 30 days
    DELETE FROM metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
    
    -- Clean up resolved alerts older than 90 days
    DELETE FROM alerts WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create a view for current system health
CREATE OR REPLACE VIEW current_health AS
SELECT 
    check_name,
    status,
    details,
    checked_at,
    ROW_NUMBER() OVER (PARTITION BY check_name ORDER BY checked_at DESC) as rn
FROM health_checks
WHERE checked_at > NOW() - INTERVAL '1 hour';

-- Grant permissions on view
GRANT SELECT ON current_health TO claude_task_master_monitor;
GRANT SELECT ON current_health TO claude_task_master_app;

-- Create a view for active alerts
CREATE OR REPLACE VIEW active_alerts AS
SELECT 
    alert_id,
    alert_type,
    severity,
    title,
    message,
    details,
    created_at,
    acknowledged_at,
    acknowledged_by
FROM alerts 
WHERE status IN ('active', 'acknowledged')
ORDER BY 
    CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'warning' THEN 2 
        WHEN 'info' THEN 3 
        ELSE 4 
    END,
    created_at DESC;

-- Grant permissions on view
GRANT SELECT ON active_alerts TO claude_task_master_app;
GRANT SELECT ON active_alerts TO claude_task_master_monitor;

-- Insert initial health check
INSERT INTO health_checks (check_name, status, details) 
VALUES ('database_initialization', 'healthy', '{"message": "Database initialized successfully"}')
ON CONFLICT DO NOTHING;

-- Create notification for successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Claude Task Master database initialization completed successfully';
END
$$;

