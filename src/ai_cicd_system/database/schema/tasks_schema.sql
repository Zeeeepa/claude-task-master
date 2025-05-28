-- Migration: tasks_schema_enhanced.sql
-- Description: Enhanced task storage schema with software development criteria and robustness improvements
-- Created: 2025-05-28
-- Version: 2.0.0

-- Enable additional extensions for enhanced functionality
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- Create enhanced task priorities enum
CREATE TYPE task_priority_level AS ENUM (
    'critical', 'high', 'medium', 'low', 'backlog'
);

-- Create task status enum with more granular states
CREATE TYPE task_status_type AS ENUM (
    'draft', 'pending', 'ready', 'in_progress', 'blocked', 
    'review', 'testing', 'completed', 'failed', 'cancelled', 'archived'
);

-- Create task complexity enum
CREATE TYPE task_complexity_level AS ENUM (
    'trivial', 'simple', 'moderate', 'complex', 'expert'
);

-- Create enhanced tasks table with software development criteria
CREATE TABLE IF NOT EXISTS tasks_enhanced (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic task information
    title VARCHAR(255) NOT NULL,
    description TEXT,
    summary TEXT, -- Brief summary for quick reference
    
    -- Task classification
    type VARCHAR(50) NOT NULL DEFAULT 'feature',
    category VARCHAR(100),
    priority task_priority_level DEFAULT 'medium',
    status task_status_type DEFAULT 'draft',
    complexity task_complexity_level DEFAULT 'moderate',
    
    -- Software development specific fields
    epic_id UUID REFERENCES tasks_enhanced(id) ON DELETE SET NULL,
    story_points INTEGER,
    business_value INTEGER DEFAULT 5,
    technical_debt_score INTEGER DEFAULT 0,
    risk_level INTEGER DEFAULT 3,
    
    -- Requirements and criteria
    requirements JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    definition_of_done JSONB DEFAULT '[]'::jsonb,
    test_criteria JSONB DEFAULT '[]'::jsonb,
    
    -- Technical specifications
    affected_files JSONB DEFAULT '[]'::jsonb,
    affected_components JSONB DEFAULT '[]'::jsonb,
    dependencies JSONB DEFAULT '[]'::jsonb,
    technical_notes TEXT,
    architecture_notes TEXT,
    
    -- Assignment and ownership
    assigned_to VARCHAR(255),
    reporter VARCHAR(255),
    product_owner VARCHAR(255),
    tech_lead VARCHAR(255),
    reviewer VARCHAR(255),
    
    -- Time tracking
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    remaining_hours DECIMAL(8,2),
    
    -- Dates and timeline
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    
    -- Sprint and release management
    sprint_id VARCHAR(100),
    release_version VARCHAR(50),
    milestone VARCHAR(100),
    
    -- Labels and organization
    labels JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    
    -- External references
    external_id VARCHAR(255), -- For integration with external systems
    github_issue_url VARCHAR(500),
    github_pr_url VARCHAR(500),
    linear_issue_id VARCHAR(100),
    jira_key VARCHAR(50),
    
    -- Quality and metrics
    code_quality_score INTEGER,
    test_coverage_target INTEGER DEFAULT 80,
    performance_requirements JSONB DEFAULT '{}'::jsonb,
    security_requirements JSONB DEFAULT '{}'::jsonb,
    
    -- Workflow and automation
    automation_level INTEGER DEFAULT 0, -- 0-100% automated
    ci_cd_pipeline VARCHAR(255),
    deployment_strategy VARCHAR(100),
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT tasks_enhanced_title_check CHECK (length(title) >= 5),
    CONSTRAINT tasks_enhanced_story_points_check CHECK (story_points >= 0 AND story_points <= 100),
    CONSTRAINT tasks_enhanced_business_value_check CHECK (business_value >= 1 AND business_value <= 10),
    CONSTRAINT tasks_enhanced_technical_debt_check CHECK (technical_debt_score >= 0 AND technical_debt_score <= 100),
    CONSTRAINT tasks_enhanced_risk_level_check CHECK (risk_level >= 1 AND risk_level <= 10),
    CONSTRAINT tasks_enhanced_hours_check CHECK (
        estimated_hours >= 0 AND 
        actual_hours >= 0 AND 
        remaining_hours >= 0
    ),
    CONSTRAINT tasks_enhanced_quality_score_check CHECK (code_quality_score >= 0 AND code_quality_score <= 100),
    CONSTRAINT tasks_enhanced_test_coverage_check CHECK (test_coverage_target >= 0 AND test_coverage_target <= 100),
    CONSTRAINT tasks_enhanced_automation_check CHECK (automation_level >= 0 AND automation_level <= 100),
    CONSTRAINT tasks_enhanced_type_check CHECK (type IN (
        'feature', 'bug', 'enhancement', 'task', 'story', 'epic', 
        'spike', 'refactor', 'documentation', 'test', 'deployment', 
        'security', 'performance', 'maintenance'
    ))
);

-- Create task relationships table for complex dependencies
CREATE TABLE IF NOT EXISTS task_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    target_task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,
    strength INTEGER DEFAULT 5, -- 1-10 strength of relationship
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_relationships_type_check CHECK (relationship_type IN (
        'blocks', 'blocked_by', 'depends_on', 'dependency_of', 
        'relates_to', 'duplicates', 'duplicated_by', 'parent_of', 
        'child_of', 'follows', 'precedes', 'conflicts_with'
    )),
    CONSTRAINT task_relationships_strength_check CHECK (strength >= 1 AND strength <= 10),
    CONSTRAINT task_relationships_no_self_reference CHECK (source_task_id != target_task_id),
    
    -- Unique constraint to prevent duplicate relationships
    UNIQUE(source_task_id, target_task_id, relationship_type)
);

-- Create task comments table for communication
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    author VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'general',
    is_internal BOOLEAN DEFAULT false,
    parent_comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_comments_content_check CHECK (length(content) >= 1),
    CONSTRAINT task_comments_type_check CHECK (comment_type IN (
        'general', 'technical', 'review', 'question', 'decision', 
        'blocker', 'solution', 'update', 'approval'
    ))
);

-- Create task attachments table
CREATE TABLE IF NOT EXISTS task_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000),
    file_size INTEGER,
    file_type VARCHAR(100),
    mime_type VARCHAR(100),
    description TEXT,
    uploaded_by VARCHAR(255),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_public BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_attachments_filename_check CHECK (length(filename) >= 1),
    CONSTRAINT task_attachments_file_size_check CHECK (file_size >= 0)
);

-- Create task time logs table for detailed time tracking
CREATE TABLE IF NOT EXISTS task_time_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    activity_type VARCHAR(100),
    description TEXT,
    hours_logged DECIMAL(8,2) NOT NULL,
    log_date DATE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    is_billable BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT task_time_logs_hours_check CHECK (hours_logged > 0 AND hours_logged <= 24),
    CONSTRAINT task_time_logs_date_check CHECK (log_date <= CURRENT_DATE),
    CONSTRAINT task_time_logs_time_range_check CHECK (
        (started_at IS NULL AND ended_at IS NULL) OR 
        (started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at)
    )
);

-- Create task status history table
CREATE TABLE IF NOT EXISTS task_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks_enhanced(id) ON DELETE CASCADE,
    from_status task_status_type,
    to_status task_status_type NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create comprehensive indexes for performance

-- Primary task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_status ON tasks_enhanced(status);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_priority ON tasks_enhanced(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_type ON tasks_enhanced(type);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_assigned_to ON tasks_enhanced(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_epic_id ON tasks_enhanced(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_created_at ON tasks_enhanced(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_updated_at ON tasks_enhanced(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_due_date ON tasks_enhanced(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_sprint_id ON tasks_enhanced(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_release_version ON tasks_enhanced(release_version);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_external_id ON tasks_enhanced(external_id);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_linear_issue_id ON tasks_enhanced(linear_issue_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_status_priority ON tasks_enhanced(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_assigned_status ON tasks_enhanced(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_sprint_status ON tasks_enhanced(sprint_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_type_status ON tasks_enhanced(type, status);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_title_trgm ON tasks_enhanced USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_description_trgm ON tasks_enhanced USING GIN (description gin_trgm_ops);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_labels_gin ON tasks_enhanced USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_tags_gin ON tasks_enhanced USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_requirements_gin ON tasks_enhanced USING GIN (requirements);
CREATE INDEX IF NOT EXISTS idx_tasks_enhanced_metadata_gin ON tasks_enhanced USING GIN (metadata);

-- Task relationships indexes
CREATE INDEX IF NOT EXISTS idx_task_relationships_source ON task_relationships(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_target ON task_relationships(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relationships_type ON task_relationships(relationship_type);

-- Task comments indexes
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author ON task_comments(author);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent ON task_comments(parent_comment_id);

-- Task attachments indexes
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON task_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_task_attachments_file_type ON task_attachments(file_type);

-- Task time logs indexes
CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_user_id ON task_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_log_date ON task_time_logs(log_date);

-- Task status history indexes
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_changed_at ON task_status_history(changed_at);

-- Create triggers for automatic updates

-- Updated_at trigger for tasks
CREATE TRIGGER update_tasks_enhanced_updated_at 
    BEFORE UPDATE ON tasks_enhanced 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Updated_at trigger for comments
CREATE TRIGGER update_task_comments_updated_at 
    BEFORE UPDATE ON task_comments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Status change tracking trigger
CREATE OR REPLACE FUNCTION track_task_status_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, reason)
        VALUES (
            NEW.id, 
            OLD.status, 
            NEW.status, 
            COALESCE(NEW.updated_by, 'system'),
            CASE 
                WHEN NEW.status = 'in_progress' AND OLD.status = 'pending' THEN 'Task started'
                WHEN NEW.status = 'completed' THEN 'Task completed'
                WHEN NEW.status = 'blocked' THEN 'Task blocked'
                ELSE 'Status changed'
            END
        );
        
        -- Update started_at when task moves to in_progress
        IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' AND NEW.started_at IS NULL THEN
            NEW.started_at = NOW();
        END IF;
        
        -- Update completed_at when task is completed
        IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            NEW.completed_at = NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER track_task_status_changes_trigger
    BEFORE UPDATE ON tasks_enhanced
    FOR EACH ROW EXECUTE FUNCTION track_task_status_changes();

-- Time tracking update trigger
CREATE OR REPLACE FUNCTION update_task_time_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update actual hours from time logs
    UPDATE tasks_enhanced 
    SET actual_hours = (
        SELECT COALESCE(SUM(hours_logged), 0)
        FROM task_time_logs 
        WHERE task_id = COALESCE(NEW.task_id, OLD.task_id)
    )
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER update_task_time_totals_trigger
    AFTER INSERT OR UPDATE OR DELETE ON task_time_logs
    FOR EACH ROW EXECUTE FUNCTION update_task_time_totals();

-- Create audit triggers
CREATE TRIGGER audit_tasks_enhanced_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tasks_enhanced
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_task_relationships_trigger
    AFTER INSERT OR UPDATE OR DELETE ON task_relationships
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create enhanced views for common queries

-- Active tasks with full details
CREATE OR REPLACE VIEW active_tasks_detailed AS
SELECT 
    t.*,
    COUNT(tc.id) as comment_count,
    COUNT(ta.id) as attachment_count,
    COUNT(tr_source.target_task_id) as blocking_count,
    COUNT(tr_target.source_task_id) as blocked_by_count,
    SUM(ttl.hours_logged) as total_logged_hours,
    CASE 
        WHEN t.estimated_hours > 0 THEN 
            ROUND((COALESCE(SUM(ttl.hours_logged), 0) / t.estimated_hours) * 100, 2)
        ELSE 0 
    END as progress_percentage
FROM tasks_enhanced t
LEFT JOIN task_comments tc ON t.id = tc.task_id
LEFT JOIN task_attachments ta ON t.id = ta.task_id
LEFT JOIN task_relationships tr_source ON t.id = tr_source.source_task_id AND tr_source.relationship_type = 'blocks'
LEFT JOIN task_relationships tr_target ON t.id = tr_target.target_task_id AND tr_target.relationship_type = 'blocks'
LEFT JOIN task_time_logs ttl ON t.id = ttl.task_id
WHERE t.status NOT IN ('completed', 'cancelled', 'archived')
GROUP BY t.id;

-- Sprint dashboard view
CREATE OR REPLACE VIEW sprint_dashboard AS
SELECT 
    sprint_id,
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
    COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks,
    SUM(story_points) as total_story_points,
    SUM(story_points) FILTER (WHERE status = 'completed') as completed_story_points,
    SUM(estimated_hours) as total_estimated_hours,
    SUM(actual_hours) as total_actual_hours,
    ROUND(AVG(business_value), 2) as avg_business_value,
    ROUND(AVG(technical_debt_score), 2) as avg_technical_debt
FROM tasks_enhanced
WHERE sprint_id IS NOT NULL
GROUP BY sprint_id;

-- Team workload view
CREATE OR REPLACE VIEW team_workload AS
SELECT 
    assigned_to,
    COUNT(*) as assigned_tasks,
    COUNT(*) FILTER (WHERE status = 'in_progress') as active_tasks,
    SUM(story_points) FILTER (WHERE status NOT IN ('completed', 'cancelled')) as active_story_points,
    SUM(estimated_hours) FILTER (WHERE status NOT IN ('completed', 'cancelled')) as estimated_workload,
    SUM(actual_hours) as total_hours_logged,
    COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled')) as overdue_tasks
FROM tasks_enhanced
WHERE assigned_to IS NOT NULL
GROUP BY assigned_to;

-- Task dependency graph view
CREATE OR REPLACE VIEW task_dependency_graph AS
SELECT 
    tr.source_task_id,
    ts.title as source_title,
    ts.status as source_status,
    tr.target_task_id,
    tt.title as target_title,
    tt.status as target_status,
    tr.relationship_type,
    tr.strength,
    tr.description
FROM task_relationships tr
JOIN tasks_enhanced ts ON tr.source_task_id = ts.id
JOIN tasks_enhanced tt ON tr.target_task_id = tt.id
WHERE tr.relationship_type IN ('blocks', 'depends_on');

-- Performance metrics view
CREATE OR REPLACE VIEW task_performance_metrics AS
SELECT 
    type,
    priority,
    complexity,
    COUNT(*) as task_count,
    AVG(actual_hours) as avg_actual_hours,
    AVG(estimated_hours) as avg_estimated_hours,
    CASE 
        WHEN AVG(estimated_hours) > 0 THEN 
            ROUND((AVG(actual_hours) / AVG(estimated_hours)) * 100, 2)
        ELSE 0 
    END as estimation_accuracy,
    AVG(code_quality_score) as avg_quality_score,
    AVG(business_value) as avg_business_value
FROM tasks_enhanced
WHERE status = 'completed' AND actual_hours > 0
GROUP BY type, priority, complexity;

-- Add table comments
COMMENT ON TABLE tasks_enhanced IS 'Enhanced tasks table with comprehensive software development criteria';
COMMENT ON TABLE task_relationships IS 'Complex task dependency and relationship management';
COMMENT ON TABLE task_comments IS 'Task communication and collaboration';
COMMENT ON TABLE task_attachments IS 'File attachments and documentation for tasks';
COMMENT ON TABLE task_time_logs IS 'Detailed time tracking and activity logging';
COMMENT ON TABLE task_status_history IS 'Complete audit trail of task status changes';

