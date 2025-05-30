-- =====================================================
-- PostgreSQL Schema for Unified CI/CD Orchestration System
-- Performance Monitoring & Analytics Tables
-- =====================================================

-- =====================================================
-- PERFORMANCE METRICS TABLE
-- =====================================================
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(50),
    metric_type VARCHAR(50) DEFAULT 'gauge' CHECK (metric_type IN ('gauge', 'counter', 'histogram', 'summary', 'timer')),
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    tags JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Add indexes for performance metrics
CREATE INDEX idx_performance_metrics_component_name ON performance_metrics(component_name);
CREATE INDEX idx_performance_metrics_metric_name ON performance_metrics(metric_name);
CREATE INDEX idx_performance_metrics_metric_type ON performance_metrics(metric_type);
CREATE INDEX idx_performance_metrics_workflow_id ON performance_metrics(workflow_id);
CREATE INDEX idx_performance_metrics_task_id ON performance_metrics(task_id);
CREATE INDEX idx_performance_metrics_timestamp ON performance_metrics(timestamp);

-- Composite indexes for time-series queries
CREATE INDEX idx_performance_metrics_timeseries ON performance_metrics(component_name, metric_name, timestamp DESC);
CREATE INDEX idx_performance_metrics_workflow_timeseries ON performance_metrics(workflow_id, metric_name, timestamp DESC);

-- GIN index for tags
CREATE INDEX idx_performance_metrics_tags_gin ON performance_metrics USING GIN (tags);

-- =====================================================
-- SYSTEM HEALTH TABLE
-- =====================================================
CREATE TABLE system_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'critical', 'unknown')),
    cpu_usage DECIMAL(5,2) CHECK (cpu_usage >= 0 AND cpu_usage <= 100),
    memory_usage DECIMAL(5,2) CHECK (memory_usage >= 0 AND memory_usage <= 100),
    disk_usage DECIMAL(5,2) CHECK (disk_usage >= 0 AND disk_usage <= 100),
    network_latency_ms INTEGER,
    response_time_ms INTEGER,
    error_rate DECIMAL(5,2) CHECK (error_rate >= 0 AND error_rate <= 100),
    throughput_per_second DECIMAL(10,2),
    active_connections INTEGER,
    queue_size INTEGER,
    last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    details JSONB DEFAULT '{}',
    alerts JSONB DEFAULT '[]'
);

-- Add indexes for system health
CREATE INDEX idx_system_health_component_name ON system_health(component_name);
CREATE INDEX idx_system_health_status ON system_health(status);
CREATE INDEX idx_system_health_last_check_at ON system_health(last_check_at);
CREATE INDEX idx_system_health_cpu_usage ON system_health(cpu_usage);
CREATE INDEX idx_system_health_memory_usage ON system_health(memory_usage);
CREATE INDEX idx_system_health_error_rate ON system_health(error_rate);

-- =====================================================
-- WORKFLOW ANALYTICS TABLE
-- =====================================================
CREATE TABLE workflow_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    failed_tasks INTEGER DEFAULT 0,
    blocked_tasks INTEGER DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    estimated_duration_hours INTEGER,
    actual_duration_hours INTEGER,
    efficiency_score DECIMAL(5,2),
    quality_score DECIMAL(5,2),
    complexity_score DECIMAL(5,2),
    resource_utilization JSONB DEFAULT '{}',
    bottlenecks JSONB DEFAULT '[]',
    optimization_opportunities JSONB DEFAULT '[]',
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for workflow analytics
CREATE INDEX idx_workflow_analytics_workflow_id ON workflow_analytics(workflow_id);
CREATE INDEX idx_workflow_analytics_completion_percentage ON workflow_analytics(completion_percentage);
CREATE INDEX idx_workflow_analytics_efficiency_score ON workflow_analytics(efficiency_score);
CREATE INDEX idx_workflow_analytics_quality_score ON workflow_analytics(quality_score);
CREATE INDEX idx_workflow_analytics_calculated_at ON workflow_analytics(calculated_at);

-- =====================================================
-- TASK ANALYTICS TABLE
-- =====================================================
CREATE TABLE task_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    complexity_score DECIMAL(5,2),
    estimated_effort_hours INTEGER,
    actual_effort_hours INTEGER,
    efficiency_ratio DECIMAL(5,2),
    quality_metrics JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}',
    dependency_impact_score DECIMAL(5,2),
    blocking_factor DECIMAL(5,2),
    completion_velocity DECIMAL(5,2),
    error_count INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    code_quality_score DECIMAL(5,2),
    test_coverage_percentage DECIMAL(5,2),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for task analytics
CREATE INDEX idx_task_analytics_task_id ON task_analytics(task_id);
CREATE INDEX idx_task_analytics_complexity_score ON task_analytics(complexity_score);
CREATE INDEX idx_task_analytics_efficiency_ratio ON task_analytics(efficiency_ratio);
CREATE INDEX idx_task_analytics_quality_score ON task_analytics((quality_metrics->>'overall_score'));
CREATE INDEX idx_task_analytics_calculated_at ON task_analytics(calculated_at);

-- =====================================================
-- ALERTS TABLE
-- =====================================================
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    component_name VARCHAR(100),
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    metric_name VARCHAR(100),
    threshold_value DECIMAL(15,4),
    actual_value DECIMAL(15,4),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'suppressed')),
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for alerts
CREATE INDEX idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_component_name ON alerts(component_name);
CREATE INDEX idx_alerts_workflow_id ON alerts(workflow_id);
CREATE INDEX idx_alerts_task_id ON alerts(task_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);

-- =====================================================
-- PERFORMANCE BASELINES TABLE
-- =====================================================
CREATE TABLE performance_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    baseline_value DECIMAL(15,4) NOT NULL,
    baseline_type VARCHAR(50) DEFAULT 'average' CHECK (baseline_type IN ('average', 'median', 'p95', 'p99', 'max', 'min')),
    confidence_interval DECIMAL(5,2),
    sample_size INTEGER,
    calculation_period_days INTEGER DEFAULT 30,
    tags JSONB DEFAULT '{}',
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    UNIQUE(component_name, metric_name, baseline_type)
);

-- Add indexes for performance baselines
CREATE INDEX idx_performance_baselines_component_metric ON performance_baselines(component_name, metric_name);
CREATE INDEX idx_performance_baselines_calculated_at ON performance_baselines(calculated_at);
CREATE INDEX idx_performance_baselines_valid_until ON performance_baselines(valid_until);

-- =====================================================
-- TRIGGERS FOR ANALYTICS TABLES
-- =====================================================

-- Apply updated_at triggers
CREATE TRIGGER update_workflow_analytics_updated_at BEFORE UPDATE ON workflow_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_analytics_updated_at BEFORE UPDATE ON task_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MATERIALIZED VIEWS FOR PERFORMANCE DASHBOARDS
-- =====================================================

-- Real-time system overview
CREATE MATERIALIZED VIEW system_overview AS
SELECT 
    COUNT(DISTINCT c.name) as total_components,
    COUNT(CASE WHEN sh.status = 'healthy' THEN 1 END) as healthy_components,
    COUNT(CASE WHEN sh.status = 'degraded' THEN 1 END) as degraded_components,
    COUNT(CASE WHEN sh.status = 'unhealthy' THEN 1 END) as unhealthy_components,
    AVG(sh.cpu_usage) as avg_cpu_usage,
    AVG(sh.memory_usage) as avg_memory_usage,
    AVG(sh.response_time_ms) as avg_response_time,
    COUNT(CASE WHEN a.status = 'active' AND a.severity = 'critical' THEN 1 END) as critical_alerts,
    COUNT(CASE WHEN a.status = 'active' AND a.severity = 'high' THEN 1 END) as high_alerts,
    NOW() as last_updated
FROM components c
LEFT JOIN system_health sh ON c.name = sh.component_name
LEFT JOIN alerts a ON c.name = a.component_name
WHERE sh.last_check_at >= NOW() - INTERVAL '5 minutes'
   OR sh.last_check_at IS NULL;

-- Workflow performance summary
CREATE MATERIALIZED VIEW workflow_performance_summary AS
SELECT 
    w.id,
    w.name,
    w.status,
    w.current_phase,
    wa.completion_percentage,
    wa.efficiency_score,
    wa.quality_score,
    COUNT(t.id) as total_tasks,
    COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks,
    AVG(ta.complexity_score) as avg_task_complexity,
    MAX(t.updated_at) as last_activity,
    w.created_at,
    EXTRACT(EPOCH FROM (COALESCE(w.completed_at, NOW()) - w.created_at)) / 3600 as duration_hours
FROM workflows w
LEFT JOIN workflow_analytics wa ON w.id = wa.workflow_id
LEFT JOIN tasks t ON w.id = t.workflow_id
LEFT JOIN task_analytics ta ON t.id = ta.task_id
GROUP BY w.id, w.name, w.status, w.current_phase, wa.completion_percentage, 
         wa.efficiency_score, wa.quality_score, w.created_at, w.completed_at;

-- Component performance metrics
CREATE MATERIALIZED VIEW component_performance_metrics AS
SELECT 
    component_name,
    metric_name,
    AVG(metric_value) as avg_value,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99_value,
    COUNT(*) as sample_count,
    MAX(timestamp) as last_recorded
FROM performance_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY component_name, metric_name;

-- =====================================================
-- FUNCTIONS FOR ANALYTICS CALCULATIONS
-- =====================================================

-- Function to calculate workflow analytics
CREATE OR REPLACE FUNCTION calculate_workflow_analytics(workflow_uuid UUID)
RETURNS void AS $$
DECLARE
    task_stats RECORD;
    duration_hours INTEGER;
    efficiency DECIMAL(5,2);
BEGIN
    -- Get task statistics
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as completed,
        COUNT(CASE WHEN status IN ('failed', 'cancelled') THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        SUM(estimated_effort) as estimated_total,
        SUM(actual_effort) as actual_total
    INTO task_stats
    FROM tasks 
    WHERE workflow_id = workflow_uuid;
    
    -- Calculate efficiency
    IF task_stats.estimated_total > 0 AND task_stats.actual_total > 0 THEN
        efficiency := (task_stats.estimated_total::DECIMAL / task_stats.actual_total) * 100;
    ELSE
        efficiency := NULL;
    END IF;
    
    -- Insert or update analytics
    INSERT INTO workflow_analytics (
        workflow_id,
        total_tasks,
        completed_tasks,
        failed_tasks,
        blocked_tasks,
        completion_percentage,
        efficiency_score,
        calculated_at
    ) VALUES (
        workflow_uuid,
        task_stats.total,
        task_stats.completed,
        task_stats.failed,
        task_stats.blocked,
        CASE WHEN task_stats.total > 0 THEN (task_stats.completed::DECIMAL / task_stats.total) * 100 ELSE 0 END,
        efficiency,
        NOW()
    )
    ON CONFLICT (workflow_id) DO UPDATE SET
        total_tasks = EXCLUDED.total_tasks,
        completed_tasks = EXCLUDED.completed_tasks,
        failed_tasks = EXCLUDED.failed_tasks,
        blocked_tasks = EXCLUDED.blocked_tasks,
        completion_percentage = EXCLUDED.completion_percentage,
        efficiency_score = EXCLUDED.efficiency_score,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_performance_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW system_overview;
    REFRESH MATERIALIZED VIEW workflow_performance_summary;
    REFRESH MATERIALIZED VIEW component_performance_metrics;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE performance_metrics IS 'Time-series performance metrics for all system components';
COMMENT ON TABLE system_health IS 'Current health status and resource utilization for system components';
COMMENT ON TABLE workflow_analytics IS 'Calculated analytics and performance metrics for workflows';
COMMENT ON TABLE task_analytics IS 'Detailed analytics and performance metrics for individual tasks';
COMMENT ON TABLE alerts IS 'System alerts and notifications for performance issues';
COMMENT ON TABLE performance_baselines IS 'Baseline performance metrics for anomaly detection';

COMMENT ON COLUMN performance_metrics.tags IS 'JSON object with metric tags for filtering and grouping';
COMMENT ON COLUMN system_health.details IS 'JSON object with detailed health check information';
COMMENT ON COLUMN system_health.alerts IS 'JSON array of active alerts for this component';
COMMENT ON COLUMN workflow_analytics.resource_utilization IS 'JSON object tracking resource usage patterns';
COMMENT ON COLUMN workflow_analytics.bottlenecks IS 'JSON array identifying workflow bottlenecks';
COMMENT ON COLUMN workflow_analytics.optimization_opportunities IS 'JSON array of suggested optimizations';
COMMENT ON COLUMN task_analytics.quality_metrics IS 'JSON object with detailed quality measurements';
COMMENT ON COLUMN task_analytics.performance_metrics IS 'JSON object with task-specific performance data';

