-- =====================================================
-- PostgreSQL Schema for Unified CI/CD Orchestration System
-- Component Integration & Communication Tables
-- =====================================================

-- =====================================================
-- COMPONENTS TABLE
-- =====================================================
CREATE TABLE components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('orchestrator', 'generator', 'validator', 'manager', 'analyzer', 'deployer')),
    version VARCHAR(50),
    api_endpoint VARCHAR(500),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'error')),
    health_check_url VARCHAR(500),
    configuration JSONB DEFAULT '{}',
    capabilities JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown'))
);

-- Add indexes for components
CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_type ON components(type);
CREATE INDEX idx_components_status ON components(status);
CREATE INDEX idx_components_health_status ON components(health_status);

-- =====================================================
-- COMPONENT COMMUNICATIONS TABLE
-- =====================================================
CREATE TABLE component_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_component_id UUID REFERENCES components(id) ON DELETE SET NULL,
    target_component_id UUID REFERENCES components(id) ON DELETE SET NULL,
    message_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'processed', 'failed', 'timeout')),
    response JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for component communications
CREATE INDEX idx_component_communications_source ON component_communications(source_component_id);
CREATE INDEX idx_component_communications_target ON component_communications(target_component_id);
CREATE INDEX idx_component_communications_status ON component_communications(status);
CREATE INDEX idx_component_communications_message_type ON component_communications(message_type);
CREATE INDEX idx_component_communications_created_at ON component_communications(created_at);
CREATE INDEX idx_component_communications_expires_at ON component_communications(expires_at);

-- =====================================================
-- EVENTS TABLE
-- =====================================================
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    source_component VARCHAR(100) NOT NULL,
    target_component VARCHAR(100),
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    correlation_id UUID,
    trace_id UUID,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_duration_ms INTEGER
);

-- Add indexes for events
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_source_component ON events(source_component);
CREATE INDEX idx_events_target_component ON events(target_component);
CREATE INDEX idx_events_workflow_id ON events(workflow_id);
CREATE INDEX idx_events_task_id ON events(task_id);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);
CREATE INDEX idx_events_trace_id ON events(trace_id);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_created_at ON events(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_events_composite_workflow_type ON events(workflow_id, event_type, created_at DESC);
CREATE INDEX idx_events_composite_task_type ON events(task_id, event_type, created_at DESC);
CREATE INDEX idx_events_composite_trace ON events(trace_id, created_at ASC);

-- =====================================================
-- COMPONENT HEALTH CHECKS TABLE
-- =====================================================
CREATE TABLE component_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID REFERENCES components(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL CHECK (check_type IN ('ping', 'api', 'database', 'memory', 'cpu', 'disk')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'timeout', 'error')),
    response_time_ms INTEGER,
    details JSONB DEFAULT '{}',
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for component health checks
CREATE INDEX idx_component_health_checks_component_id ON component_health_checks(component_id);
CREATE INDEX idx_component_health_checks_check_type ON component_health_checks(check_type);
CREATE INDEX idx_component_health_checks_status ON component_health_checks(status);
CREATE INDEX idx_component_health_checks_checked_at ON component_health_checks(checked_at);

-- =====================================================
-- COMPONENT METRICS TABLE
-- =====================================================
CREATE TABLE component_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID REFERENCES components(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(50),
    metric_type VARCHAR(50) DEFAULT 'gauge' CHECK (metric_type IN ('gauge', 'counter', 'histogram', 'summary')),
    tags JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for component metrics
CREATE INDEX idx_component_metrics_component_id ON component_metrics(component_id);
CREATE INDEX idx_component_metrics_name ON component_metrics(metric_name);
CREATE INDEX idx_component_metrics_type ON component_metrics(metric_type);
CREATE INDEX idx_component_metrics_recorded_at ON component_metrics(recorded_at);

-- Composite index for time-series queries
CREATE INDEX idx_component_metrics_timeseries ON component_metrics(component_id, metric_name, recorded_at DESC);

-- =====================================================
-- TRIGGERS FOR COMPONENT TABLES
-- =====================================================

-- Apply updated_at triggers
CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS FOR COMPONENT MONITORING
-- =====================================================

-- Latest health status for each component
CREATE VIEW component_latest_health AS
SELECT DISTINCT ON (c.id)
    c.id,
    c.name,
    c.type,
    c.status,
    c.health_status,
    chc.status as latest_check_status,
    chc.response_time_ms,
    chc.checked_at as last_check_at,
    chc.error_message
FROM components c
LEFT JOIN component_health_checks chc ON c.id = chc.component_id
ORDER BY c.id, chc.checked_at DESC;

-- Component communication summary
CREATE VIEW component_communication_summary AS
SELECT 
    sc.name as source_component,
    tc.name as target_component,
    cc.message_type,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN cc.status = 'processed' THEN 1 END) as successful_messages,
    COUNT(CASE WHEN cc.status = 'failed' THEN 1 END) as failed_messages,
    AVG(EXTRACT(EPOCH FROM (cc.processed_at - cc.created_at)) * 1000) as avg_processing_time_ms,
    MAX(cc.created_at) as last_communication
FROM component_communications cc
LEFT JOIN components sc ON cc.source_component_id = sc.id
LEFT JOIN components tc ON cc.target_component_id = tc.id
WHERE cc.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY sc.name, tc.name, cc.message_type;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE components IS 'Registry of all system components with their configuration and status';
COMMENT ON TABLE component_communications IS 'Inter-component communication logs and message tracking';
COMMENT ON TABLE events IS 'System-wide event log for monitoring and debugging';
COMMENT ON TABLE component_health_checks IS 'Health check results for all components';
COMMENT ON TABLE component_metrics IS 'Time-series metrics data for component monitoring';

COMMENT ON COLUMN components.capabilities IS 'JSON array of component capabilities and supported operations';
COMMENT ON COLUMN component_communications.payload IS 'JSON message payload sent between components';
COMMENT ON COLUMN component_communications.response IS 'JSON response received from target component';
COMMENT ON COLUMN events.payload IS 'JSON event data and context information';
COMMENT ON COLUMN events.metadata IS 'JSON metadata for event categorization and filtering';
COMMENT ON COLUMN component_health_checks.details IS 'JSON object with detailed health check results';
COMMENT ON COLUMN component_metrics.tags IS 'JSON object with metric tags for filtering and grouping';

