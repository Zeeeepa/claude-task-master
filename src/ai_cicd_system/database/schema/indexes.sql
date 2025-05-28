-- Performance Indexes for AI-Driven CI/CD System
-- Description: Optimized indexes for high-throughput operations and query performance
-- Version: 2.0.0
-- Created: 2025-05-28

-- =====================================================
-- TASKS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);

-- Temporal indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);

-- Hierarchical relationships
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);

-- External integration indexes
CREATE INDEX IF NOT EXISTS idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_github_issue_number ON tasks(github_issue_number);
CREATE INDEX IF NOT EXISTS idx_tasks_codegen_session_id ON tasks(codegen_session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_repository_url ON tasks(repository_url);
CREATE INDEX IF NOT EXISTS idx_tasks_branch_name ON tasks(branch_name);
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_status ON tasks(created_at DESC, status);

-- JSONB indexes for metadata queries
CREATE INDEX IF NOT EXISTS idx_tasks_tags_gin ON tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_requirements_gin ON tasks USING GIN(requirements);
CREATE INDEX IF NOT EXISTS idx_tasks_metadata_gin ON tasks USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_tasks_affected_files_gin ON tasks USING GIN(affected_files);
CREATE INDEX IF NOT EXISTS idx_tasks_acceptance_criteria_gin ON tasks USING GIN(acceptance_criteria);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm ON tasks USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm ON tasks USING GIN(description gin_trgm_ops);

-- =====================================================
-- WORKFLOWS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_workflows_task_id ON workflows(task_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_workflow_type ON workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflows_current_step ON workflows(current_step);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_workflows_started_at ON workflows(started_at);
CREATE INDEX IF NOT EXISTS idx_workflows_completed_at ON workflows(completed_at);

-- External integration indexes
CREATE INDEX IF NOT EXISTS idx_workflows_codegen_pr_url ON workflows(codegen_pr_url);
CREATE INDEX IF NOT EXISTS idx_workflows_claude_session_id ON workflows(claude_session_id);

-- Composite indexes for monitoring
CREATE INDEX IF NOT EXISTS idx_workflows_status_started ON workflows(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_task_status ON workflows(task_id, status);
CREATE INDEX IF NOT EXISTS idx_workflows_type_status ON workflows(workflow_type, status);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_workflows_steps_completed_gin ON workflows USING GIN(steps_completed);
CREATE INDEX IF NOT EXISTS idx_workflows_error_log_gin ON workflows USING GIN(error_log);
CREATE INDEX IF NOT EXISTS idx_workflows_metadata_gin ON workflows USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_workflows_validation_results_gin ON workflows USING GIN(validation_results);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_workflows_retry_count ON workflows(retry_count);
CREATE INDEX IF NOT EXISTS idx_workflows_timeout_minutes ON workflows(timeout_minutes);

-- =====================================================
-- SYSTEM_METRICS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_component ON system_metrics(component);
CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_type ON system_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_source_system ON system_metrics(source_system);

-- Temporal indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);

-- Composite indexes for common aggregations
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_recorded ON system_metrics(metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_component_recorded ON system_metrics(component, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_type_name ON system_metrics(metric_type, metric_name);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_system_metrics_metadata_gin ON system_metrics USING GIN(metric_metadata);
CREATE INDEX IF NOT EXISTS idx_system_metrics_tags_gin ON system_metrics USING GIN(tags);

-- Value-based indexes for numerical queries
CREATE INDEX IF NOT EXISTS idx_system_metrics_value ON system_metrics(metric_value);

-- =====================================================
-- TASK_CONTEXTS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_id ON task_contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_task_contexts_type ON task_contexts(context_type);
CREATE INDEX IF NOT EXISTS idx_task_contexts_version ON task_contexts(context_version);
CREATE INDEX IF NOT EXISTS idx_task_contexts_is_active ON task_contexts(is_active);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_task_contexts_created_at ON task_contexts(created_at);
CREATE INDEX IF NOT EXISTS idx_task_contexts_updated_at ON task_contexts(updated_at);
CREATE INDEX IF NOT EXISTS idx_task_contexts_expires_at ON task_contexts(expires_at);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_type ON task_contexts(task_id, context_type);
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_active ON task_contexts(task_id, is_active);
CREATE INDEX IF NOT EXISTS idx_task_contexts_type_active ON task_contexts(context_type, is_active);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_task_contexts_data_gin ON task_contexts USING GIN(context_data);
CREATE INDEX IF NOT EXISTS idx_task_contexts_metadata_gin ON task_contexts USING GIN(metadata);

-- =====================================================
-- AUDIT_LOGS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_timestamp ON audit_logs(entity_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);

-- Session and request tracking
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- API monitoring indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_api_endpoint ON audit_logs(api_endpoint);
CREATE INDEX IF NOT EXISTS idx_audit_logs_response_status ON audit_logs(response_status);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_values_gin ON audit_logs USING GIN(old_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_values_gin ON audit_logs USING GIN(new_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN(metadata);

-- =====================================================
-- TASK_DEPENDENCIES TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent ON task_dependencies(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_child ON task_dependencies(child_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_type ON task_dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_is_active ON task_dependencies(is_active);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_created_at ON task_dependencies(created_at);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_resolved_at ON task_dependencies(resolved_at);

-- Composite indexes for dependency resolution
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent_type ON task_dependencies(parent_task_id, dependency_type);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_child_type ON task_dependencies(child_task_id, dependency_type);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent_active ON task_dependencies(parent_task_id, is_active);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_child_active ON task_dependencies(child_task_id, is_active);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_metadata_gin ON task_dependencies USING GIN(metadata);

-- =====================================================
-- EXTERNAL_INTEGRATIONS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_external_integrations_type ON external_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_external_integrations_name ON external_integrations(integration_name);
CREATE INDEX IF NOT EXISTS idx_external_integrations_status ON external_integrations(status);
CREATE INDEX IF NOT EXISTS idx_external_integrations_health_status ON external_integrations(health_status);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_external_integrations_created_at ON external_integrations(created_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_updated_at ON external_integrations(updated_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_last_used_at ON external_integrations(last_used_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_last_health_check ON external_integrations(last_health_check);

-- Rate limiting indexes
CREATE INDEX IF NOT EXISTS idx_external_integrations_usage_reset ON external_integrations(usage_reset_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_current_usage ON external_integrations(current_usage);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_external_integrations_type_status ON external_integrations(integration_type, status);
CREATE INDEX IF NOT EXISTS idx_external_integrations_name_status ON external_integrations(integration_name, status);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_external_integrations_config_gin ON external_integrations USING GIN(configuration);

-- =====================================================
-- API_ACCESS_LOGS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_api_access_logs_integration_id ON api_access_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint ON api_access_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_method ON api_access_logs(method);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_status ON api_access_logs(response_status);

-- Temporal indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_timestamp ON api_access_logs(timestamp DESC);

-- Request tracking indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_correlation_id ON api_access_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_user_id ON api_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_task_id ON api_access_logs(task_id);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_time ON api_access_logs(response_time_ms);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_retry_count ON api_access_logs(retry_count);

-- Composite indexes for monitoring
CREATE INDEX IF NOT EXISTS idx_api_access_logs_integration_timestamp ON api_access_logs(integration_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint_timestamp ON api_access_logs(endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_status_timestamp ON api_access_logs(response_status, timestamp DESC);

-- Error tracking indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_error_message ON api_access_logs(error_message) WHERE error_message IS NOT NULL;

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_request_headers_gin ON api_access_logs USING GIN(request_headers);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_headers_gin ON api_access_logs USING GIN(response_headers);

-- =====================================================
-- SCHEMA_MIGRATIONS TABLE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_type ON schema_migrations(migration_type);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_rollback_available ON schema_migrations(rollback_available);

-- Performance monitoring
CREATE INDEX IF NOT EXISTS idx_schema_migrations_execution_time ON schema_migrations(execution_time_ms);

-- =====================================================
-- PARTIAL INDEXES FOR OPTIMIZATION
-- =====================================================

-- Partial indexes for active records only
CREATE INDEX IF NOT EXISTS idx_tasks_active_status ON tasks(status, priority DESC) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_workflows_active_status ON workflows(status, started_at DESC) WHERE status IN ('initialized', 'running');
CREATE INDEX IF NOT EXISTS idx_task_contexts_active ON task_contexts(task_id, context_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_task_dependencies_active ON task_dependencies(parent_task_id, child_task_id) WHERE is_active = true;

-- Partial indexes for error tracking
CREATE INDEX IF NOT EXISTS idx_workflows_failed ON workflows(started_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_api_access_logs_errors ON api_access_logs(timestamp DESC) WHERE response_status >= 400;

-- Partial indexes for recent data
CREATE INDEX IF NOT EXISTS idx_audit_logs_recent ON audit_logs(timestamp DESC) WHERE timestamp > NOW() - INTERVAL '30 days';
CREATE INDEX IF NOT EXISTS idx_system_metrics_recent ON system_metrics(recorded_at DESC) WHERE recorded_at > NOW() - INTERVAL '7 days';

-- =====================================================
-- COVERING INDEXES FOR QUERY OPTIMIZATION
-- =====================================================

-- Covering index for task list queries
CREATE INDEX IF NOT EXISTS idx_tasks_list_covering ON tasks(status, priority DESC) 
INCLUDE (id, title, assigned_to, created_at, updated_at);

-- Covering index for workflow monitoring
CREATE INDEX IF NOT EXISTS idx_workflows_monitoring_covering ON workflows(status, started_at DESC) 
INCLUDE (id, task_id, current_step, retry_count);

-- Covering index for metrics aggregation
CREATE INDEX IF NOT EXISTS idx_metrics_aggregation_covering ON system_metrics(metric_name, recorded_at DESC) 
INCLUDE (metric_value, metric_type, component);

-- Comments for documentation
COMMENT ON INDEX idx_tasks_status IS 'Primary index for task status queries';
COMMENT ON INDEX idx_tasks_status_priority IS 'Composite index for task listing with priority ordering';
COMMENT ON INDEX idx_workflows_task_status IS 'Composite index for workflow-task relationship queries';
COMMENT ON INDEX idx_system_metrics_name_recorded IS 'Time-series index for metrics queries';
COMMENT ON INDEX idx_audit_logs_entity_type_id IS 'Primary audit trail lookup index';
COMMENT ON INDEX idx_api_access_logs_integration_timestamp IS 'API monitoring index for integration-specific queries';

