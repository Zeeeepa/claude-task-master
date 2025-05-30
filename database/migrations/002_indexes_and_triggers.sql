-- =====================================================
-- Migration 002: Indexes and Triggers
-- Creates all performance indexes and automated triggers
-- =====================================================

-- =====================================================
-- CORE TABLE INDEXES
-- =====================================================

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_github_repo_id ON projects(github_repo_id);
CREATE INDEX IF NOT EXISTS idx_projects_linear_team_id ON projects(linear_team_id);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- Workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_project_id ON workflows(project_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_current_phase ON workflows(current_phase);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_component ON tasks(assigned_component);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user_id ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_github_pr_number ON tasks(github_pr_number);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_composite_status_priority ON tasks(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_composite_workflow_status ON tasks(workflow_id, status);

-- Task dependencies indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_task_id ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_type ON task_dependencies(dependency_type);

-- =====================================================
-- COMPONENT INTEGRATION INDEXES
-- =====================================================

-- Components indexes
CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);
CREATE INDEX IF NOT EXISTS idx_components_type ON components(type);
CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);
CREATE INDEX IF NOT EXISTS idx_components_health_status ON components(health_status);

-- Component communications indexes
CREATE INDEX IF NOT EXISTS idx_component_communications_source ON component_communications(source_component_id);
CREATE INDEX IF NOT EXISTS idx_component_communications_target ON component_communications(target_component_id);
CREATE INDEX IF NOT EXISTS idx_component_communications_status ON component_communications(status);
CREATE INDEX IF NOT EXISTS idx_component_communications_message_type ON component_communications(message_type);
CREATE INDEX IF NOT EXISTS idx_component_communications_created_at ON component_communications(created_at);
CREATE INDEX IF NOT EXISTS idx_component_communications_expires_at ON component_communications(expires_at);

-- Events indexes
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_source_component ON events(source_component);
CREATE INDEX IF NOT EXISTS idx_events_target_component ON events(target_component);
CREATE INDEX IF NOT EXISTS idx_events_workflow_id ON events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_trace_id ON events(trace_id);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- Composite indexes for events
CREATE INDEX IF NOT EXISTS idx_events_composite_workflow_type ON events(workflow_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_composite_task_type ON events(task_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_composite_trace ON events(trace_id, created_at ASC);

-- =====================================================
-- TEMPLATES & LEARNING INDEXES
-- =====================================================

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_templates_success_rate ON templates(success_rate);
CREATE INDEX IF NOT EXISTS idx_templates_usage_count ON templates(usage_count);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at);
CREATE INDEX IF NOT EXISTS idx_templates_last_used_at ON templates(last_used_at);

-- GIN indexes for JSON fields
CREATE INDEX IF NOT EXISTS idx_templates_tags_gin ON templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_templates_metadata_gin ON templates USING GIN (metadata);

-- Template usage history indexes
CREATE INDEX IF NOT EXISTS idx_template_usage_history_template_id ON template_usage_history(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_history_workflow_id ON template_usage_history(workflow_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_history_task_id ON template_usage_history(task_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_history_success ON template_usage_history(success);
CREATE INDEX IF NOT EXISTS idx_template_usage_history_used_at ON template_usage_history(used_at);

-- Execution history indexes
CREATE INDEX IF NOT EXISTS idx_execution_history_workflow_id ON execution_history(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_task_id ON execution_history(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_component_name ON execution_history(component_name);
CREATE INDEX IF NOT EXISTS idx_execution_history_action ON execution_history(action);
CREATE INDEX IF NOT EXISTS idx_execution_history_success ON execution_history(success);
CREATE INDEX IF NOT EXISTS idx_execution_history_session_id ON execution_history(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_correlation_id ON execution_history(correlation_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_created_at ON execution_history(created_at);

-- Composite indexes for execution history
CREATE INDEX IF NOT EXISTS idx_execution_history_component_action ON execution_history(component_name, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_history_workflow_component ON execution_history(workflow_id, component_name, created_at DESC);

-- Learning data indexes
CREATE INDEX IF NOT EXISTS idx_learning_data_pattern_type ON learning_data(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learning_data_confidence_score ON learning_data(confidence_score);
CREATE INDEX IF NOT EXISTS idx_learning_data_effectiveness_score ON learning_data(effectiveness_score);
CREATE INDEX IF NOT EXISTS idx_learning_data_usage_frequency ON learning_data(usage_frequency);
CREATE INDEX IF NOT EXISTS idx_learning_data_source_workflow_id ON learning_data(source_workflow_id);
CREATE INDEX IF NOT EXISTS idx_learning_data_source_task_id ON learning_data(source_task_id);
CREATE INDEX IF NOT EXISTS idx_learning_data_last_used_at ON learning_data(last_used_at);
CREATE INDEX IF NOT EXISTS idx_learning_data_created_at ON learning_data(created_at);

-- GIN indexes for learning data JSON fields
CREATE INDEX IF NOT EXISTS idx_learning_data_pattern_data_gin ON learning_data USING GIN (pattern_data);
CREATE INDEX IF NOT EXISTS idx_learning_data_context_tags_gin ON learning_data USING GIN (context_tags);

-- Knowledge base indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_base_title ON knowledge_base(title);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_type ON knowledge_base(content_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_type ON knowledge_base(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_relevance_score ON knowledge_base(relevance_score);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_is_public ON knowledge_base(is_public);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_last_accessed_at ON knowledge_base(last_accessed_at);

-- Full-text search index for knowledge base
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_fts ON knowledge_base USING GIN (to_tsvector('english', title || ' ' || content));

-- GIN indexes for knowledge base JSON fields
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags_gin ON knowledge_base USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_metadata_gin ON knowledge_base USING GIN (metadata);

-- =====================================================
-- PERFORMANCE MONITORING INDEXES
-- =====================================================

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_component_name ON performance_metrics(component_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric_type ON performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_workflow_id ON performance_metrics(workflow_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_task_id ON performance_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);

-- Composite indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timeseries ON performance_metrics(component_name, metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_workflow_timeseries ON performance_metrics(workflow_id, metric_name, timestamp DESC);

-- GIN index for performance metrics tags
CREATE INDEX IF NOT EXISTS idx_performance_metrics_tags_gin ON performance_metrics USING GIN (tags);

-- System health indexes
CREATE INDEX IF NOT EXISTS idx_system_health_component_name ON system_health(component_name);
CREATE INDEX IF NOT EXISTS idx_system_health_status ON system_health(status);
CREATE INDEX IF NOT EXISTS idx_system_health_last_check_at ON system_health(last_check_at);
CREATE INDEX IF NOT EXISTS idx_system_health_cpu_usage ON system_health(cpu_usage);
CREATE INDEX IF NOT EXISTS idx_system_health_memory_usage ON system_health(memory_usage);
CREATE INDEX IF NOT EXISTS idx_system_health_error_rate ON system_health(error_rate);

-- Workflow analytics indexes
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_workflow_id ON workflow_analytics(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_completion_percentage ON workflow_analytics(completion_percentage);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_efficiency_score ON workflow_analytics(efficiency_score);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_quality_score ON workflow_analytics(quality_score);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_calculated_at ON workflow_analytics(calculated_at);

-- Task analytics indexes
CREATE INDEX IF NOT EXISTS idx_task_analytics_task_id ON task_analytics(task_id);
CREATE INDEX IF NOT EXISTS idx_task_analytics_complexity_score ON task_analytics(complexity_score);
CREATE INDEX IF NOT EXISTS idx_task_analytics_efficiency_ratio ON task_analytics(efficiency_ratio);
CREATE INDEX IF NOT EXISTS idx_task_analytics_quality_score ON task_analytics((quality_metrics->>'overall_score'));
CREATE INDEX IF NOT EXISTS idx_task_analytics_calculated_at ON task_analytics(calculated_at);

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_component_name ON alerts(component_name);
CREATE INDEX IF NOT EXISTS idx_alerts_workflow_id ON alerts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_alerts_task_id ON alerts(task_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);

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
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_components_updated_at ON components;
CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learning_data_updated_at ON learning_data;
CREATE TRIGGER update_learning_data_updated_at BEFORE UPDATE ON learning_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_analytics_updated_at ON workflow_analytics;
CREATE TRIGGER update_workflow_analytics_updated_at BEFORE UPDATE ON workflow_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_analytics_updated_at ON task_analytics;
CREATE TRIGGER update_task_analytics_updated_at BEFORE UPDATE ON task_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts;
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update template usage statistics
CREATE OR REPLACE FUNCTION update_template_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update usage count and last used timestamp
    UPDATE templates 
    SET 
        usage_count = usage_count + 1,
        last_used_at = NEW.used_at
    WHERE id = NEW.template_id;
    
    -- Update success rate based on recent usage
    UPDATE templates 
    SET success_rate = (
        SELECT ROUND(
            (COUNT(CASE WHEN success = true THEN 1 END) * 100.0 / COUNT(*))::numeric, 2
        )
        FROM template_usage_history 
        WHERE template_id = NEW.template_id 
        AND used_at >= NOW() - INTERVAL '30 days'
    )
    WHERE id = NEW.template_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update template stats on usage
DROP TRIGGER IF EXISTS update_template_stats_on_usage ON template_usage_history;
CREATE TRIGGER update_template_stats_on_usage
    AFTER INSERT ON template_usage_history
    FOR EACH ROW EXECUTE FUNCTION update_template_usage_stats();

-- =====================================================
-- RECORD MIGRATION
-- =====================================================

INSERT INTO schema_migrations (version, description) 
VALUES ('002', 'Added all performance indexes and automated triggers')
ON CONFLICT (version) DO NOTHING;

