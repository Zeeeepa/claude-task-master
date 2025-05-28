-- Rollback: 20250528162700_add_connection_pool_monitoring_rollback.sql
-- Description: Rollback for adding connection pool monitoring tables
-- Created: 2025-05-28
-- Version: 20250528162700

-- WARNING: This rollback will remove all monitoring data
-- Make sure to backup any important monitoring data before proceeding

-- Drop triggers first
DROP TRIGGER IF EXISTS update_pool_metrics_timestamp ON connection_pool_metrics;
DROP TRIGGER IF EXISTS update_health_check_timestamp ON health_check_results;

-- Drop functions
DROP FUNCTION IF EXISTS update_monitoring_timestamp();
DROP FUNCTION IF EXISTS cleanup_old_metrics();
DROP FUNCTION IF EXISTS get_pool_statistics(VARCHAR);

-- Drop views
DROP VIEW IF EXISTS pool_health_summary;
DROP VIEW IF EXISTS recent_alerts;
DROP VIEW IF EXISTS slow_queries_summary;

-- Drop indexes (they will be dropped automatically with tables, but explicit for clarity)
DROP INDEX IF EXISTS idx_pool_metrics_pool_timestamp;
DROP INDEX IF EXISTS idx_pool_metrics_timestamp;
DROP INDEX IF EXISTS idx_health_check_timestamp;
DROP INDEX IF EXISTS idx_health_check_status;
DROP INDEX IF EXISTS idx_migration_performance_version;
DROP INDEX IF EXISTS idx_migration_performance_timestamp;
DROP INDEX IF EXISTS idx_query_performance_pool_timestamp;
DROP INDEX IF EXISTS idx_query_performance_hash;
DROP INDEX IF EXISTS idx_query_performance_slow;
DROP INDEX IF EXISTS idx_alert_history_type_severity;
DROP INDEX IF EXISTS idx_alert_history_pool;
DROP INDEX IF EXISTS idx_alert_history_unresolved;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS alert_history;
DROP TABLE IF EXISTS query_performance_log;
DROP TABLE IF EXISTS migration_performance;
DROP TABLE IF EXISTS health_check_results;
DROP TABLE IF EXISTS connection_pool_metrics;

-- Note: We don't drop the uuid-ossp extension as it might be used by other parts of the system

