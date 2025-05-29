-- Performance Indexes for Consolidated Database Schema
-- Optimized for common query patterns across all consolidated PRs
-- Version: 2.0.0

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);

-- JSONB indexes for metadata queries
CREATE INDEX IF NOT EXISTS idx_tasks_tags_gin ON tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_requirements_gin ON tasks USING GIN(requirements);
CREATE INDEX IF NOT EXISTS idx_tasks_acceptance_criteria_gin ON tasks USING GIN(acceptance_criteria);
CREATE INDEX IF NOT EXISTS idx_tasks_metadata_gin ON tasks USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_tasks_affected_files_gin ON tasks USING GIN(affected_files);

-- External integration indexes
CREATE INDEX IF NOT EXISTS idx_tasks_linear_issue_id ON tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_github_issue_number ON tasks(github_issue_number);
CREATE INDEX IF NOT EXISTS idx_tasks_codegen_session_id ON tasks(codegen_session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_repository_url ON tasks(repository_url);
CREATE INDEX IF NOT EXISTS idx_tasks_branch_name ON tasks(branch_name);
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);

-- Task executions table indexes
CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_agent_type ON task_executions(agent_type);
CREATE INDEX IF NOT EXISTS idx_task_executions_created_at ON task_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_task_executions_started_at ON task_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_task_executions_completed_at ON task_executions(completed_at);

-- Composite indexes for task executions
CREATE INDEX IF NOT EXISTS idx_task_executions_task_status ON task_executions(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_executions_agent_status ON task_executions(agent_type, status);
CREATE INDEX IF NOT EXISTS idx_task_executions_status_created ON task_executions(status, created_at);

-- JSONB indexes for task executions
CREATE INDEX IF NOT EXISTS idx_task_executions_agent_config_gin ON task_executions USING GIN(agent_config);
CREATE INDEX IF NOT EXISTS idx_task_executions_logs_gin ON task_executions USING GIN(logs);
CREATE INDEX IF NOT EXISTS idx_task_executions_error_details_gin ON task_executions USING GIN(error_details);

-- Task contexts table indexes
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_id ON task_contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_task_contexts_context_type ON task_contexts(context_type);
CREATE INDEX IF NOT EXISTS idx_task_contexts_created_at ON task_contexts(created_at);
CREATE INDEX IF NOT EXISTS idx_task_contexts_updated_at ON task_contexts(updated_at);

-- Composite indexes for task contexts
CREATE INDEX IF NOT EXISTS idx_task_contexts_task_type ON task_contexts(task_id, context_type);
CREATE INDEX IF NOT EXISTS idx_task_contexts_type_created ON task_contexts(context_type, created_at);

-- JSONB indexes for task contexts
CREATE INDEX IF NOT EXISTS idx_task_contexts_data_gin ON task_contexts USING GIN(context_data);
CREATE INDEX IF NOT EXISTS idx_task_contexts_metadata_gin ON task_contexts USING GIN(metadata);

-- Deployment scripts table indexes
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_task_id ON deployment_scripts(task_id);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_status ON deployment_scripts(status);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_script_type ON deployment_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_environment ON deployment_scripts(environment);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_created_at ON deployment_scripts(created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_executed_at ON deployment_scripts(executed_at);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_execution_order ON deployment_scripts(execution_order);

-- Composite indexes for deployment scripts
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_task_status ON deployment_scripts(task_id, status);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_type_status ON deployment_scripts(script_type, status);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_env_status ON deployment_scripts(environment, status);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_task_order ON deployment_scripts(task_id, execution_order);

-- JSONB indexes for deployment scripts
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_parameters_gin ON deployment_scripts USING GIN(parameters);
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_metadata_gin ON deployment_scripts USING GIN(metadata);

-- Error logs table indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_task_id ON error_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_task_execution_id ON error_logs(task_execution_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_deployment_script_id ON error_logs(deployment_script_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_at ON error_logs(resolved_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_source_component ON error_logs(source_component);

-- Composite indexes for error logs
CREATE INDEX IF NOT EXISTS idx_error_logs_type_severity ON error_logs(error_type, severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_created ON error_logs(resolved, created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_component_type ON error_logs(source_component, error_type);

-- JSONB indexes for error logs
CREATE INDEX IF NOT EXISTS idx_error_logs_error_details_gin ON error_logs USING GIN(error_details);
CREATE INDEX IF NOT EXISTS idx_error_logs_context_gin ON error_logs USING GIN(context);
CREATE INDEX IF NOT EXISTS idx_error_logs_metadata_gin ON error_logs USING GIN(metadata);

-- External integrations table indexes
CREATE INDEX IF NOT EXISTS idx_external_integrations_type ON external_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_external_integrations_name ON external_integrations(integration_name);
CREATE INDEX IF NOT EXISTS idx_external_integrations_status ON external_integrations(status);
CREATE INDEX IF NOT EXISTS idx_external_integrations_health_status ON external_integrations(health_status);
CREATE INDEX IF NOT EXISTS idx_external_integrations_created_at ON external_integrations(created_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_last_used_at ON external_integrations(last_used_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_last_health_check ON external_integrations(last_health_check);

-- Composite indexes for external integrations
CREATE INDEX IF NOT EXISTS idx_external_integrations_type_status ON external_integrations(integration_type, status);
CREATE INDEX IF NOT EXISTS idx_external_integrations_status_health ON external_integrations(status, health_status);

-- JSONB indexes for external integrations
CREATE INDEX IF NOT EXISTS idx_external_integrations_config_gin ON external_integrations USING GIN(configuration);

-- API access logs table indexes
CREATE INDEX IF NOT EXISTS idx_api_access_logs_integration_id ON api_access_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint ON api_access_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_method ON api_access_logs(method);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_user_id ON api_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_api_key_id ON api_access_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_ip_address ON api_access_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_status ON api_access_logs(response_status);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_timestamp ON api_access_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_task_id ON api_access_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_correlation_id ON api_access_logs(correlation_id);

-- Composite indexes for API access logs
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint_method ON api_access_logs(endpoint, method);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_user_timestamp ON api_access_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_status_timestamp ON api_access_logs(response_status, timestamp);

-- JSONB indexes for API access logs
CREATE INDEX IF NOT EXISTS idx_api_access_logs_request_headers_gin ON api_access_logs USING GIN(request_headers);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_response_headers_gin ON api_access_logs USING GIN(response_headers);

-- System metrics table indexes
CREATE INDEX IF NOT EXISTS idx_system_metrics_category ON system_metrics(metric_category);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_aggregation_period ON system_metrics(aggregation_period);

-- Composite indexes for system metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_category_name ON system_metrics(metric_category, metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_timestamp ON system_metrics(metric_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_category_timestamp ON system_metrics(metric_category, timestamp);

-- JSONB indexes for system metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_dimensions_gin ON system_metrics USING GIN(dimensions);

-- Configuration settings table indexes
CREATE INDEX IF NOT EXISTS idx_configuration_settings_key ON configuration_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_type ON configuration_settings(setting_type);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_environment ON configuration_settings(environment);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_is_sensitive ON configuration_settings(is_sensitive);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_created_at ON configuration_settings(created_at);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_updated_at ON configuration_settings(updated_at);

-- Composite indexes for configuration settings
CREATE INDEX IF NOT EXISTS idx_configuration_settings_type_env ON configuration_settings(setting_type, environment);
CREATE INDEX IF NOT EXISTS idx_configuration_settings_sensitive_env ON configuration_settings(is_sensitive, environment);

-- JSONB indexes for configuration settings
CREATE INDEX IF NOT EXISTS idx_configuration_settings_value_gin ON configuration_settings USING GIN(setting_value);

-- API keys table indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys(created_at);

-- Composite indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_active_expires ON api_keys(is_active, expires_at);

-- JSONB indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_permissions_gin ON api_keys USING GIN(permissions);
CREATE INDEX IF NOT EXISTS idx_api_keys_allowed_ips_gin ON api_keys USING GIN(allowed_ips);
CREATE INDEX IF NOT EXISTS idx_api_keys_allowed_endpoints_gin ON api_keys USING GIN(allowed_endpoints);
CREATE INDEX IF NOT EXISTS idx_api_keys_metadata_gin ON api_keys USING GIN(metadata);

-- Webhook events table indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_task_id ON webhook_events(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_source ON webhook_events(event_source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_signature_verified ON webhook_events(signature_verified);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_next_retry_at ON webhook_events(next_retry_at);

-- Composite indexes for webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_source ON webhook_events(event_type, event_source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_created ON webhook_events(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_processed ON webhook_events(event_source, processed);

-- JSONB indexes for webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_data_gin ON webhook_events USING GIN(event_data);
CREATE INDEX IF NOT EXISTS idx_webhook_events_headers_gin ON webhook_events USING GIN(headers);
CREATE INDEX IF NOT EXISTS idx_webhook_events_response_data_gin ON webhook_events USING GIN(response_data);
CREATE INDEX IF NOT EXISTS idx_webhook_events_metadata_gin ON webhook_events USING GIN(metadata);

-- Audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Composite indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action ON audit_logs(entity_type, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at);

-- JSONB indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_values_gin ON audit_logs USING GIN(old_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_values_gin ON audit_logs USING GIN(new_values);

-- Schema migrations table indexes
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_success ON schema_migrations(success);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_by ON schema_migrations(applied_by);

-- Partial indexes for active/pending records only
CREATE INDEX IF NOT EXISTS idx_tasks_active_status ON tasks(status, created_at) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_task_executions_active_status ON task_executions(status, created_at) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_deployment_scripts_active_status ON deployment_scripts(status, created_at) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs(created_at, severity) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON webhook_events(created_at, processing_attempts) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, created_at) WHERE is_active = TRUE;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm ON tasks USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm ON tasks USING GIN(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_error_logs_message_trgm ON error_logs USING GIN(error_message gin_trgm_ops);

-- Covering indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_covering ON tasks(status) INCLUDE (id, title, priority, assigned_to, created_at);
CREATE INDEX IF NOT EXISTS idx_task_executions_task_covering ON task_executions(task_id) INCLUDE (id, status, agent_type, started_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_external_integrations_type_covering ON external_integrations(integration_type) INCLUDE (id, integration_name, status, health_status);

-- Comments for index documentation
COMMENT ON INDEX idx_tasks_status IS 'Primary index for task status queries';
COMMENT ON INDEX idx_tasks_status_priority IS 'Composite index for status and priority filtering';
COMMENT ON INDEX idx_tasks_requirements_gin IS 'GIN index for JSONB requirements queries';
COMMENT ON INDEX idx_task_executions_task_id IS 'Foreign key index for task executions';
COMMENT ON INDEX idx_api_access_logs_timestamp IS 'Time-based queries for API access logs';
COMMENT ON INDEX idx_system_metrics_category_name IS 'Composite index for metrics queries';
COMMENT ON INDEX idx_webhook_events_unprocessed IS 'Partial index for unprocessed webhook events';
COMMENT ON INDEX idx_tasks_active_status IS 'Partial index for active tasks only';

-- Analyze tables for optimal query planning
ANALYZE tasks;
ANALYZE task_executions;
ANALYZE task_contexts;
ANALYZE deployment_scripts;
ANALYZE error_logs;
ANALYZE external_integrations;
ANALYZE api_access_logs;
ANALYZE system_metrics;
ANALYZE configuration_settings;
ANALYZE api_keys;
ANALYZE webhook_events;
ANALYZE audit_logs;
ANALYZE schema_migrations;

