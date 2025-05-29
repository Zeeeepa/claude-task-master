-- Advanced Indexing Strategies for AI-Powered Development Workflow System
-- Optimized for JSONB queries, performance, and concurrent access patterns

-- ============================================================================
-- PRIMARY INDEXES FOR CORE QUERIES
-- ============================================================================

-- Projects indexes
CREATE INDEX idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops);
CREATE INDEX idx_projects_repository_name ON projects (repository_name) WHERE archived_at IS NULL;
CREATE INDEX idx_projects_active ON projects (created_at DESC) WHERE archived_at IS NULL;

-- Tasks indexes - Core performance critical
CREATE INDEX idx_tasks_project_status ON tasks (project_id, status);
CREATE INDEX idx_tasks_status_priority ON tasks (status, priority DESC) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_tasks_assigned_agent ON tasks (assigned_agent, assigned_at DESC) WHERE assigned_agent IS NOT NULL;
CREATE INDEX idx_tasks_parent_child ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_tasks_created_at ON tasks (created_at DESC);
CREATE INDEX idx_tasks_updated_at ON tasks (updated_at DESC);

-- Task executions indexes
CREATE INDEX idx_task_executions_task_status ON task_executions (task_id, execution_status);
CREATE INDEX idx_task_executions_agent_type ON task_executions (agent_type, started_at DESC);
CREATE INDEX idx_task_executions_status_started ON task_executions (execution_status, started_at DESC);
CREATE INDEX idx_task_executions_duration ON task_executions (duration DESC) WHERE duration IS NOT NULL;
CREATE INDEX idx_task_executions_recent ON task_executions (created_at DESC);

-- Pull requests indexes
CREATE INDEX idx_pull_requests_project_status ON pull_requests (project_id, status);
CREATE INDEX idx_pull_requests_task_id ON pull_requests (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_pull_requests_repository_pr ON pull_requests (repository_url, pr_number);
CREATE INDEX idx_pull_requests_branch ON pull_requests (repository_url, branch_name);
CREATE INDEX idx_pull_requests_status_updated ON pull_requests (status, updated_at DESC);
CREATE INDEX idx_pull_requests_created_at ON pull_requests (created_at DESC);

-- Validations indexes
CREATE INDEX idx_validations_pr_type_result ON validations (pr_id, validation_type, result);
CREATE INDEX idx_validations_execution_type ON validations (task_execution_id, validation_type) WHERE task_execution_id IS NOT NULL;
CREATE INDEX idx_validations_result_score ON validations (result, score DESC) WHERE score IS NOT NULL;
CREATE INDEX idx_validations_type_completed ON validations (validation_type, completed_at DESC);

-- Workflow events indexes
CREATE INDEX idx_workflow_events_category_type ON workflow_events (event_category, event_type);
CREATE INDEX idx_workflow_events_occurred_at ON workflow_events (occurred_at DESC);
CREATE INDEX idx_workflow_events_project_occurred ON workflow_events (project_id, occurred_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX idx_workflow_events_task_occurred ON workflow_events (task_id, occurred_at DESC) WHERE task_id IS NOT NULL;
CREATE INDEX idx_workflow_events_actor ON workflow_events (actor, occurred_at DESC) WHERE actor IS NOT NULL;

-- Agent configurations indexes
CREATE INDEX idx_agent_configurations_project_type ON agent_configurations (project_id, agent_type);
CREATE INDEX idx_agent_configurations_active ON agent_configurations (agent_type, is_active) WHERE is_active = true;
CREATE INDEX idx_agent_configurations_health ON agent_configurations (health_status, last_health_check DESC);

-- Dependencies indexes
CREATE INDEX idx_dependencies_dependent_task ON dependencies (dependent_task_id, is_satisfied);
CREATE INDEX idx_dependencies_dependency_task ON dependencies (dependency_task_id);
CREATE INDEX idx_dependencies_unsatisfied ON dependencies (dependency_type, is_satisfied) WHERE is_satisfied = false;

-- ============================================================================
-- ADVANCED JSONB INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- Tasks JSONB indexes for requirements, dependencies, and context
CREATE INDEX idx_tasks_requirements_gin ON tasks USING gin (requirements);
CREATE INDEX idx_tasks_dependencies_gin ON tasks USING gin (dependencies);
CREATE INDEX idx_tasks_context_gin ON tasks USING gin (context);
CREATE INDEX idx_tasks_tags_gin ON tasks USING gin (tags);

-- Specific JSONB path indexes for common query patterns
CREATE INDEX idx_tasks_requirements_priority ON tasks USING gin ((requirements->'priority'));
CREATE INDEX idx_tasks_requirements_type ON tasks USING gin ((requirements->'type'));
CREATE INDEX idx_tasks_context_files ON tasks USING gin ((context->'files'));
CREATE INDEX idx_tasks_context_repository ON tasks USING gin ((context->'repository'));

-- Task executions JSONB indexes
CREATE INDEX idx_task_executions_input_gin ON task_executions USING gin (input_context);
CREATE INDEX idx_task_executions_output_gin ON task_executions USING gin (output_results);
CREATE INDEX idx_task_executions_errors_gin ON task_executions USING gin (error_details);

-- Specific execution context indexes
CREATE INDEX idx_task_executions_input_agent_config ON task_executions USING gin ((input_context->'agent_config'));
CREATE INDEX idx_task_executions_output_artifacts ON task_executions USING gin ((output_results->'artifacts'));
CREATE INDEX idx_task_executions_error_type ON task_executions USING gin ((error_details->'error_type'));

-- Pull requests JSONB indexes
CREATE INDEX idx_pull_requests_validation_gin ON pull_requests USING gin (validation_results);
CREATE INDEX idx_pull_requests_reviews_gin ON pull_requests USING gin (review_comments);

-- Specific PR validation indexes
CREATE INDEX idx_pull_requests_validation_status ON pull_requests USING gin ((validation_results->'status'));
CREATE INDEX idx_pull_requests_validation_scores ON pull_requests USING gin ((validation_results->'scores'));

-- Validations JSONB indexes
CREATE INDEX idx_validations_details_gin ON validations USING gin (details);
CREATE INDEX idx_validations_suggestions_gin ON validations USING gin (suggestions);

-- Workflow events JSONB indexes
CREATE INDEX idx_workflow_events_data_gin ON workflow_events USING gin (event_data);
CREATE INDEX idx_workflow_events_metadata_gin ON workflow_events USING gin (metadata);

-- Agent configurations JSONB indexes
CREATE INDEX idx_agent_configurations_config_gin ON agent_configurations USING gin (configuration);
CREATE INDEX idx_agent_configurations_capabilities_gin ON agent_configurations USING gin (capabilities);
CREATE INDEX idx_agent_configurations_constraints_gin ON agent_configurations USING gin (constraints);

-- ============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- Multi-column indexes for common query patterns
CREATE INDEX idx_tasks_project_status_priority ON tasks (project_id, status, priority DESC);
CREATE INDEX idx_tasks_agent_status_assigned ON tasks (assigned_agent, status, assigned_at DESC);
CREATE INDEX idx_task_executions_task_agent_status ON task_executions (task_id, agent_type, execution_status);
CREATE INDEX idx_pull_requests_repo_status_updated ON pull_requests (repository_url, status, updated_at DESC);
CREATE INDEX idx_validations_pr_type_result_score ON validations (pr_id, validation_type, result, score DESC);

-- ============================================================================
-- PARTIAL INDEXES FOR ACTIVE RECORDS
-- ============================================================================

-- Only index active/relevant records to improve performance
CREATE INDEX idx_tasks_active_status ON tasks (status, priority DESC, created_at DESC) 
    WHERE status IN ('pending', 'in_progress', 'validation');

CREATE INDEX idx_task_executions_running ON task_executions (agent_type, started_at DESC) 
    WHERE execution_status IN ('queued', 'running');

CREATE INDEX idx_pull_requests_open ON pull_requests (repository_url, status, updated_at DESC) 
    WHERE status IN ('draft', 'open', 'review_requested');

CREATE INDEX idx_validations_pending ON validations (validation_type, started_at DESC) 
    WHERE completed_at IS NULL;

CREATE INDEX idx_workflow_events_recent ON workflow_events (event_category, occurred_at DESC) 
    WHERE occurred_at > NOW() - INTERVAL '30 days';

-- ============================================================================
-- PERFORMANCE MONITORING INDEXES
-- ============================================================================

-- Indexes for performance analysis and monitoring
CREATE INDEX idx_task_executions_performance ON task_executions (agent_type, duration DESC, memory_usage_mb DESC) 
    WHERE duration IS NOT NULL;

CREATE INDEX idx_validations_performance ON validations (validation_type, execution_time_ms DESC) 
    WHERE execution_time_ms IS NOT NULL;

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- Full-text search capabilities for text fields
CREATE INDEX idx_projects_name_description_fts ON projects USING gin (to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_tasks_title_description_fts ON tasks USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_pull_requests_title_description_fts ON pull_requests USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- ============================================================================
-- UNIQUE CONSTRAINTS AND ADDITIONAL CONSTRAINTS
-- ============================================================================

-- Additional unique constraints for data integrity
CREATE UNIQUE INDEX idx_agent_configurations_unique_active ON agent_configurations (project_id, agent_type) 
    WHERE is_active = true;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_tasks_requirements_gin IS 'GIN index for flexible JSONB requirements queries';
COMMENT ON INDEX idx_tasks_context_gin IS 'GIN index for execution context searches';
COMMENT ON INDEX idx_task_executions_input_gin IS 'GIN index for execution input context queries';
COMMENT ON INDEX idx_pull_requests_validation_gin IS 'GIN index for PR validation results queries';
COMMENT ON INDEX idx_workflow_events_data_gin IS 'GIN index for workflow event data searches';

-- ============================================================================
-- INDEX MAINTENANCE NOTES
-- ============================================================================

-- Notes for index maintenance:
-- 1. Monitor index usage with pg_stat_user_indexes
-- 2. Consider dropping unused indexes periodically
-- 3. REINDEX CONCURRENTLY for maintenance without downtime
-- 4. Monitor index bloat and rebuild when necessary
-- 5. Adjust partial index conditions based on actual data patterns

