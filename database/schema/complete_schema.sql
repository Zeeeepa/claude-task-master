-- =====================================================
-- Complete PostgreSQL Schema for Unified CI/CD Orchestration System
-- This file combines all schema components into a single deployable script
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- CORE TABLES (Projects, Workflows, Tasks)
-- =====================================================

-- PROJECTS TABLE
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repository_url VARCHAR(500),
    github_repo_id BIGINT,
    linear_team_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- WORKFLOWS TABLE
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    requirements TEXT NOT NULL,
    current_phase VARCHAR(50) DEFAULT 'initiation' CHECK (current_phase IN ('initiation', 'planning', 'development', 'testing', 'deployment', 'completed', 'failed')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'failed', 'cancelled')),
    progress JSONB DEFAULT '{"completed": 0, "total": 0, "percentage": 0}',
    metrics JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- TASKS TABLE
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]',
    acceptance_criteria JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    estimated_effort INTEGER, -- in hours
    actual_effort INTEGER, -- in hours
    assigned_component VARCHAR(100),
    assigned_user_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'blocked', 'review', 'testing', 'done', 'cancelled', 'deferred')),
    linear_issue_id VARCHAR(100),
    github_pr_number INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- TASK DEPENDENCIES TABLE
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates_to', 'subtask_of')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id, depends_on_task_id, dependency_type)
);

-- =====================================================
-- COMPONENT INTEGRATION TABLES
-- =====================================================

-- COMPONENTS TABLE
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

-- COMPONENT COMMUNICATIONS TABLE
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

-- EVENTS TABLE
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

-- =====================================================
-- TEMPLATES & LEARNING TABLES
-- =====================================================

-- TEMPLATES TABLE
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL CHECK (type IN ('code_pattern', 'deployment_script', 'test_template', 'workflow_template', 'task_template', 'configuration')),
    category VARCHAR(100),
    description TEXT,
    template_content JSONB NOT NULL,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00 CHECK (success_rate >= 0 AND success_rate <= 100),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- TEMPLATE USAGE HISTORY TABLE
CREATE TABLE template_usage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    used_by_component VARCHAR(100),
    usage_context JSONB DEFAULT '{}',
    success BOOLEAN,
    execution_time_ms INTEGER,
    error_message TEXT,
    output_quality_score DECIMAL(3,2) CHECK (output_quality_score >= 0 AND output_quality_score <= 10),
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EXECUTION HISTORY TABLE
CREATE TABLE execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    component_name VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    session_id UUID,
    correlation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LEARNING DATA TABLE
CREATE TABLE learning_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type VARCHAR(100) NOT NULL,
    pattern_data JSONB NOT NULL,
    success_indicators JSONB DEFAULT '{}',
    failure_indicators JSONB DEFAULT '{}',
    optimization_suggestions JSONB DEFAULT '[]',
    confidence_score DECIMAL(5,2) DEFAULT 0.00 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    usage_frequency INTEGER DEFAULT 1,
    effectiveness_score DECIMAL(3,2) CHECK (effectiveness_score >= 0 AND effectiveness_score <= 10),
    context_tags JSONB DEFAULT '[]',
    source_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KNOWLEDGE BASE TABLE
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'markdown' CHECK (content_type IN ('markdown', 'json', 'yaml', 'code', 'documentation')),
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    source_type VARCHAR(50) CHECK (source_type IN ('manual', 'extracted', 'generated', 'imported')),
    source_reference VARCHAR(500),
    relevance_score DECIMAL(3,2) DEFAULT 5.0 CHECK (relevance_score >= 0 AND relevance_score <= 10),
    access_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- PERFORMANCE MONITORING TABLES
-- =====================================================

-- PERFORMANCE METRICS TABLE
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

-- SYSTEM HEALTH TABLE
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

-- WORKFLOW ANALYTICS TABLE
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_id)
);

-- TASK ANALYTICS TABLE
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id)
);

-- ALERTS TABLE
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

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Projects indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_github_repo_id ON projects(github_repo_id);
CREATE INDEX idx_projects_linear_team_id ON projects(linear_team_id);
CREATE INDEX idx_projects_name ON projects(name);

-- Workflows indexes
CREATE INDEX idx_workflows_project_id ON workflows(project_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_current_phase ON workflows(current_phase);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);

-- Tasks indexes
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_component ON tasks(assigned_component);
CREATE INDEX idx_tasks_assigned_user_id ON tasks(assigned_user_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX idx_tasks_github_pr_number ON tasks(github_pr_number);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_composite_status_priority ON tasks(status, priority DESC, created_at ASC);
CREATE INDEX idx_tasks_composite_workflow_status ON tasks(workflow_id, status);

-- Task dependencies indexes
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);

-- Components indexes
CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_type ON components(type);
CREATE INDEX idx_components_status ON components(status);
CREATE INDEX idx_components_health_status ON components(health_status);

-- Events indexes
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_source_component ON events(source_component);
CREATE INDEX idx_events_workflow_id ON events(workflow_id);
CREATE INDEX idx_events_task_id ON events(task_id);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);
CREATE INDEX idx_events_trace_id ON events(trace_id);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_composite_workflow_type ON events(workflow_id, event_type, created_at DESC);
CREATE INDEX idx_events_composite_task_type ON events(task_id, event_type, created_at DESC);

-- Templates indexes
CREATE INDEX idx_templates_name ON templates(name);
CREATE INDEX idx_templates_type ON templates(type);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_is_active ON templates(is_active);
CREATE INDEX idx_templates_success_rate ON templates(success_rate);
CREATE INDEX idx_templates_usage_count ON templates(usage_count);
CREATE INDEX idx_templates_tags_gin ON templates USING GIN (tags);

-- Execution history indexes
CREATE INDEX idx_execution_history_workflow_id ON execution_history(workflow_id);
CREATE INDEX idx_execution_history_task_id ON execution_history(task_id);
CREATE INDEX idx_execution_history_component_name ON execution_history(component_name);
CREATE INDEX idx_execution_history_action ON execution_history(action);
CREATE INDEX idx_execution_history_success ON execution_history(success);
CREATE INDEX idx_execution_history_created_at ON execution_history(created_at);

-- Performance metrics indexes
CREATE INDEX idx_performance_metrics_component_name ON performance_metrics(component_name);
CREATE INDEX idx_performance_metrics_metric_name ON performance_metrics(metric_name);
CREATE INDEX idx_performance_metrics_timestamp ON performance_metrics(timestamp);
CREATE INDEX idx_performance_metrics_timeseries ON performance_metrics(component_name, metric_name, timestamp DESC);

-- System health indexes
CREATE INDEX idx_system_health_component_name ON system_health(component_name);
CREATE INDEX idx_system_health_status ON system_health(status);
CREATE INDEX idx_system_health_last_check_at ON system_health(last_check_at);

-- Analytics indexes
CREATE INDEX idx_workflow_analytics_workflow_id ON workflow_analytics(workflow_id);
CREATE INDEX idx_workflow_analytics_completion_percentage ON workflow_analytics(completion_percentage);
CREATE INDEX idx_task_analytics_task_id ON task_analytics(task_id);
CREATE INDEX idx_task_analytics_complexity_score ON task_analytics(complexity_score);

-- Alerts indexes
CREATE INDEX idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_component_name ON alerts(component_name);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);

-- =====================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at columns
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_data_updated_at BEFORE UPDATE ON learning_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_analytics_updated_at BEFORE UPDATE ON workflow_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_analytics_updated_at BEFORE UPDATE ON task_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON DATABASE postgres IS 'Unified CI/CD Orchestration System Database';

-- Table comments
COMMENT ON TABLE projects IS 'Core projects table storing project metadata and configuration';
COMMENT ON TABLE workflows IS 'Workflows represent a collection of tasks working towards a common goal';
COMMENT ON TABLE tasks IS 'Individual tasks that make up workflows, with support for hierarchical relationships';
COMMENT ON TABLE task_dependencies IS 'Explicit task dependency relationships for better query performance';
COMMENT ON TABLE components IS 'Registry of all system components with their configuration and status';
COMMENT ON TABLE events IS 'System-wide event log for monitoring and debugging';
COMMENT ON TABLE templates IS 'Reusable templates for code patterns, scripts, and configurations';
COMMENT ON TABLE execution_history IS 'Detailed execution logs for all system operations';
COMMENT ON TABLE learning_data IS 'Machine learning patterns and optimization data';
COMMENT ON TABLE performance_metrics IS 'Time-series performance metrics for all system components';
COMMENT ON TABLE system_health IS 'Current health status and resource utilization for system components';
COMMENT ON TABLE workflow_analytics IS 'Calculated analytics and performance metrics for workflows';
COMMENT ON TABLE task_analytics IS 'Detailed analytics and performance metrics for individual tasks';
COMMENT ON TABLE alerts IS 'System alerts and notifications for performance issues';

