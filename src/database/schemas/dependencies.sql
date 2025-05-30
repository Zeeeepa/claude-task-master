-- Dependencies Management Schema
-- Schema for managing task and workflow dependencies
-- Version: 1.0.0

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Note: Custom types are defined in tasks.sql and workflows.sql
-- dependency_type: 'blocks', 'requires', 'suggests'
-- dependency_status: 'pending', 'satisfied', 'failed', 'cancelled'

-- Add foreign key constraint to tasks table for workflow_id
-- This will be added after workflows table is created
-- ALTER TABLE tasks ADD CONSTRAINT fk_tasks_workflow_id 
--     FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE;

-- Additional dependency tracking tables

-- Dependency validation history
CREATE TABLE dependency_validation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dependency_validation_id UUID NOT NULL REFERENCES dependency_validations(id) ON DELETE CASCADE,
    
    -- Validation attempt details
    attempt_number INTEGER NOT NULL DEFAULT 1,
    validation_method VARCHAR(100),
    validation_config JSONB DEFAULT '{}',
    
    -- Results
    is_successful BOOLEAN DEFAULT false,
    validation_result JSONB DEFAULT '{}',
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL GENERATED ALWAYS AS (completed_at - started_at) STORED,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_attempt_number CHECK (attempt_number > 0),
    CONSTRAINT valid_validation_timing CHECK (
        (started_at IS NOT NULL) AND
        (completed_at IS NULL OR completed_at >= started_at)
    )
);

-- Dependency resolution logs
CREATE TABLE dependency_resolution_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES dependency_resolution_rules(id) ON DELETE SET NULL,
    task_dependency_id UUID REFERENCES task_dependencies(id) ON DELETE CASCADE,
    external_dependency_id UUID REFERENCES external_dependencies(id) ON DELETE CASCADE,
    
    -- Resolution details
    resolution_type VARCHAR(100) NOT NULL, -- 'auto_resolved', 'manual_override', 'rule_applied'
    resolution_action VARCHAR(100), -- 'satisfied', 'failed', 'skipped', 'retry'
    resolution_reason TEXT,
    
    -- Context
    triggered_by VARCHAR(255),
    trigger_context JSONB DEFAULT '{}',
    
    -- Results
    was_successful BOOLEAN DEFAULT false,
    result_data JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT one_dependency_log_type CHECK (
        (task_dependency_id IS NOT NULL AND external_dependency_id IS NULL) OR
        (task_dependency_id IS NULL AND external_dependency_id IS NOT NULL)
    )
);

-- Dependency impact analysis
CREATE TABLE dependency_impact_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Impact scope
    analysis_type VARCHAR(100) NOT NULL, -- 'status_change', 'dependency_add', 'dependency_remove'
    impact_scope VARCHAR(100), -- 'immediate', 'downstream', 'upstream', 'full_graph'
    
    -- Analysis results
    affected_task_count INTEGER DEFAULT 0,
    affected_task_ids JSONB DEFAULT '[]',
    critical_path_affected BOOLEAN DEFAULT false,
    estimated_delay_hours DECIMAL(8,2),
    
    -- Analysis metadata
    analysis_data JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    
    -- Timing
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_affected_count CHECK (affected_task_count >= 0)
);

-- Dependency notification rules
CREATE TABLE dependency_notification_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    
    -- Trigger conditions
    trigger_event VARCHAR(100) NOT NULL, -- 'dependency_failed', 'dependency_satisfied', 'circular_detected'
    condition_expression TEXT,
    
    -- Notification settings
    notification_type VARCHAR(100) NOT NULL, -- 'email', 'slack', 'webhook', 'linear_comment'
    notification_config JSONB DEFAULT '{}',
    recipients JSONB DEFAULT '[]',
    
    -- Message template
    message_template TEXT,
    include_context BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dependency notification history
CREATE TABLE dependency_notification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES dependency_notification_rules(id) ON DELETE CASCADE,
    task_dependency_id UUID REFERENCES task_dependencies(id) ON DELETE CASCADE,
    external_dependency_id UUID REFERENCES external_dependencies(id) ON DELETE CASCADE,
    
    -- Notification details
    notification_type VARCHAR(100) NOT NULL,
    recipients JSONB DEFAULT '[]',
    message_content TEXT,
    
    -- Delivery status
    delivery_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
    delivery_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    
    -- Response tracking
    response_data JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_delivery_attempts CHECK (delivery_attempts >= 0),
    CONSTRAINT one_dependency_notification_type CHECK (
        (task_dependency_id IS NOT NULL AND external_dependency_id IS NULL) OR
        (task_dependency_id IS NULL AND external_dependency_id IS NOT NULL)
    )
);

-- Indexes for performance optimization
CREATE INDEX idx_dependency_validation_history_dependency_id ON dependency_validation_history(dependency_validation_id);
CREATE INDEX idx_dependency_validation_history_attempt ON dependency_validation_history(attempt_number);
CREATE INDEX idx_dependency_validation_history_successful ON dependency_validation_history(is_successful);
CREATE INDEX idx_dependency_validation_history_started_at ON dependency_validation_history(started_at);

CREATE INDEX idx_dependency_resolution_logs_rule_id ON dependency_resolution_logs(rule_id);
CREATE INDEX idx_dependency_resolution_logs_task_dependency_id ON dependency_resolution_logs(task_dependency_id);
CREATE INDEX idx_dependency_resolution_logs_external_dependency_id ON dependency_resolution_logs(external_dependency_id);
CREATE INDEX idx_dependency_resolution_logs_resolution_type ON dependency_resolution_logs(resolution_type);
CREATE INDEX idx_dependency_resolution_logs_resolved_at ON dependency_resolution_logs(resolved_at);

CREATE INDEX idx_dependency_impact_analysis_source_task_id ON dependency_impact_analysis(source_task_id);
CREATE INDEX idx_dependency_impact_analysis_type ON dependency_impact_analysis(analysis_type);
CREATE INDEX idx_dependency_impact_analysis_critical_path ON dependency_impact_analysis(critical_path_affected);
CREATE INDEX idx_dependency_impact_analysis_analyzed_at ON dependency_impact_analysis(analyzed_at);

CREATE INDEX idx_dependency_notification_rules_trigger_event ON dependency_notification_rules(trigger_event);
CREATE INDEX idx_dependency_notification_rules_is_active ON dependency_notification_rules(is_active);

CREATE INDEX idx_dependency_notification_history_rule_id ON dependency_notification_history(rule_id);
CREATE INDEX idx_dependency_notification_history_delivery_status ON dependency_notification_history(delivery_status);
CREATE INDEX idx_dependency_notification_history_created_at ON dependency_notification_history(created_at);

-- Apply updated_at triggers
CREATE TRIGGER update_dependency_notification_rules_updated_at 
    BEFORE UPDATE ON dependency_notification_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to analyze dependency impact
CREATE OR REPLACE FUNCTION analyze_dependency_impact(
    p_task_id UUID,
    p_analysis_type VARCHAR(100) DEFAULT 'status_change'
)
RETURNS UUID AS $$
DECLARE
    analysis_id UUID;
    affected_tasks UUID[];
    task_count INTEGER;
BEGIN
    -- Create new analysis record
    INSERT INTO dependency_impact_analysis (
        source_task_id,
        analysis_type,
        impact_scope
    ) VALUES (
        p_task_id,
        p_analysis_type,
        'downstream'
    ) RETURNING id INTO analysis_id;
    
    -- Find all downstream tasks affected by this task
    WITH RECURSIVE downstream_tasks AS (
        -- Start with direct dependencies
        SELECT td.task_id, 1 as depth
        FROM task_dependencies td
        WHERE td.depends_on_task_id = p_task_id
        
        UNION ALL
        
        -- Follow the dependency chain
        SELECT td.task_id, dt.depth + 1
        FROM task_dependencies td
        JOIN downstream_tasks dt ON td.depends_on_task_id = dt.task_id
        WHERE dt.depth < 20 -- Prevent infinite recursion
    )
    SELECT array_agg(DISTINCT task_id) INTO affected_tasks
    FROM downstream_tasks;
    
    -- Update analysis with results
    task_count := COALESCE(array_length(affected_tasks, 1), 0);
    
    UPDATE dependency_impact_analysis
    SET 
        affected_task_count = task_count,
        affected_task_ids = to_jsonb(COALESCE(affected_tasks, ARRAY[]::UUID[])),
        analysis_data = jsonb_build_object(
            'analysis_completed_at', NOW(),
            'max_depth_analyzed', 20,
            'analysis_method', 'recursive_cte'
        )
    WHERE id = analysis_id;
    
    RETURN analysis_id;
END;
$$ language 'plpgsql';

-- Function to trigger dependency notifications
CREATE OR REPLACE FUNCTION trigger_dependency_notifications()
RETURNS TRIGGER AS $$
DECLARE
    notification_rule RECORD;
    notification_id UUID;
BEGIN
    -- Check for applicable notification rules
    FOR notification_rule IN 
        SELECT * FROM dependency_notification_rules 
        WHERE is_active = true 
        AND (
            (TG_OP = 'UPDATE' AND trigger_event = 'dependency_satisfied' AND NEW.status = 'satisfied' AND OLD.status != 'satisfied') OR
            (TG_OP = 'UPDATE' AND trigger_event = 'dependency_failed' AND NEW.status = 'failed' AND OLD.status != 'failed')
        )
    LOOP
        -- Create notification record
        INSERT INTO dependency_notification_history (
            rule_id,
            task_dependency_id,
            notification_type,
            message_content,
            delivery_status
        ) VALUES (
            notification_rule.id,
            NEW.id,
            notification_rule.notification_type,
            notification_rule.message_template,
            'pending'
        ) RETURNING id INTO notification_id;
        
        -- Here you would typically trigger the actual notification
        -- This could be done via a background job or external service
        
    END LOOP;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER dependency_notification_trigger
    AFTER UPDATE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION trigger_dependency_notifications();

-- Views for dependency analysis
CREATE VIEW dependency_graph_summary AS
SELECT 
    t.id as task_id,
    t.title,
    t.status,
    COUNT(DISTINCT td_out.id) as dependencies_count,
    COUNT(DISTINCT td_in.id) as dependents_count,
    COUNT(DISTINCT CASE WHEN td_out.status = 'satisfied' THEN td_out.id END) as satisfied_dependencies,
    COUNT(DISTINCT CASE WHEN td_out.status = 'pending' THEN td_out.id END) as pending_dependencies,
    COUNT(DISTINCT CASE WHEN td_out.status = 'failed' THEN td_out.id END) as failed_dependencies,
    CASE 
        WHEN COUNT(DISTINCT td_out.id) = 0 THEN 'no_dependencies'
        WHEN COUNT(DISTINCT td_out.id) = COUNT(DISTINCT CASE WHEN td_out.status = 'satisfied' THEN td_out.id END) THEN 'ready'
        WHEN COUNT(DISTINCT CASE WHEN td_out.status = 'failed' THEN td_out.id END) > 0 THEN 'blocked_by_failure'
        ELSE 'waiting_for_dependencies'
    END as dependency_status
FROM tasks t
LEFT JOIN task_dependencies td_out ON t.id = td_out.task_id
LEFT JOIN task_dependencies td_in ON t.id = td_in.depends_on_task_id
GROUP BY t.id, t.title, t.status;

CREATE VIEW critical_path_analysis AS
WITH RECURSIVE task_paths AS (
    -- Start with tasks that have no dependencies (root tasks)
    SELECT 
        t.id,
        t.title,
        t.estimated_hours,
        ARRAY[t.id] as path,
        COALESCE(t.estimated_hours, 0) as total_hours,
        0 as depth
    FROM tasks t
    LEFT JOIN task_dependencies td ON t.id = td.task_id
    WHERE td.id IS NULL
    
    UNION ALL
    
    -- Follow dependency chains
    SELECT 
        t.id,
        t.title,
        t.estimated_hours,
        tp.path || t.id,
        tp.total_hours + COALESCE(t.estimated_hours, 0),
        tp.depth + 1
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.task_id
    JOIN task_paths tp ON td.depends_on_task_id = tp.id
    WHERE NOT (t.id = ANY(tp.path)) -- Prevent cycles
    AND tp.depth < 50 -- Limit recursion depth
)
SELECT 
    path,
    total_hours,
    depth,
    array_length(path, 1) as task_count
FROM task_paths
WHERE depth > 0
ORDER BY total_hours DESC, depth DESC;

-- Comments for documentation
COMMENT ON TABLE dependency_validation_history IS 'History of dependency validation attempts and results';
COMMENT ON TABLE dependency_resolution_logs IS 'Log of dependency resolution actions and outcomes';
COMMENT ON TABLE dependency_impact_analysis IS 'Analysis of how dependency changes affect the task graph';
COMMENT ON TABLE dependency_notification_rules IS 'Rules for triggering notifications based on dependency events';
COMMENT ON TABLE dependency_notification_history IS 'History of dependency-related notifications sent';

COMMENT ON VIEW dependency_graph_summary IS 'Summary view of task dependencies and their status';
COMMENT ON VIEW critical_path_analysis IS 'Analysis of critical paths through the task dependency graph';

