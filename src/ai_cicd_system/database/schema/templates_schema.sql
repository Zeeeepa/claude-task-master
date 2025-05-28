-- Migration: templates_schema.sql
-- Description: Template storage schema for AI prompt instructions and task templates
-- Created: 2025-05-28
-- Version: 1.0.0

-- Create template categories table
CREATE TABLE IF NOT EXISTS template_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_categories_name_check CHECK (length(name) >= 2),
    CONSTRAINT template_categories_sort_order_check CHECK (sort_order >= 0),
    CONSTRAINT template_categories_no_self_reference CHECK (id != parent_category_id)
);

-- Create template types table
CREATE TABLE IF NOT EXISTS template_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    schema_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_rules JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT template_types_name_check CHECK (name IN (
        'prompt_instruction', 'task_template', 'workflow_template', 
        'validation_template', 'deployment_script', 'configuration_template',
        'code_snippet', 'documentation_template', 'test_template'
    ))
);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    template_type_id UUID NOT NULL REFERENCES template_types(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    parameters JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    average_execution_time INTEGER DEFAULT 0, -- in milliseconds
    complexity_score INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT templates_name_check CHECK (length(name) >= 2),
    CONSTRAINT templates_title_check CHECK (length(title) >= 5),
    CONSTRAINT templates_content_check CHECK (length(content) >= 10),
    CONSTRAINT templates_version_check CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    CONSTRAINT templates_complexity_check CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CONSTRAINT templates_success_rate_check CHECK (success_rate >= 0 AND success_rate <= 100),
    CONSTRAINT templates_usage_count_check CHECK (usage_count >= 0),
    CONSTRAINT templates_execution_time_check CHECK (average_execution_time >= 0),
    
    -- Unique constraint for name and version
    UNIQUE(name, version)
);

-- Create template versions table for version history
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    parameters JSONB DEFAULT '{}'::jsonb,
    change_summary TEXT,
    change_type VARCHAR(50) NOT NULL DEFAULT 'minor',
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_versions_version_check CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    CONSTRAINT template_versions_change_type_check CHECK (change_type IN ('major', 'minor', 'patch', 'hotfix')),
    CONSTRAINT template_versions_content_check CHECK (length(content) >= 10),
    
    -- Unique constraint for template and version
    UNIQUE(template_id, version)
);

-- Create template usage logs table
CREATE TABLE IF NOT EXISTS template_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    template_version VARCHAR(20) NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    workflow_id VARCHAR(255),
    used_by VARCHAR(255),
    execution_time INTEGER, -- in milliseconds
    success BOOLEAN,
    error_message TEXT,
    input_parameters JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_usage_logs_execution_time_check CHECK (execution_time >= 0)
);

-- Create template dependencies table
CREATE TABLE IF NOT EXISTS template_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    child_template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL DEFAULT 'includes',
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_dependencies_type_check CHECK (dependency_type IN ('includes', 'extends', 'requires', 'suggests')),
    CONSTRAINT template_dependencies_no_self_reference CHECK (parent_template_id != child_template_id),
    
    -- Unique constraint to prevent duplicate dependencies
    UNIQUE(parent_template_id, child_template_id, dependency_type)
);

-- Create template permissions table
CREATE TABLE IF NOT EXISTS template_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    user_id VARCHAR(255),
    role VARCHAR(50),
    team_id VARCHAR(255),
    permission_type VARCHAR(50) NOT NULL,
    granted_by VARCHAR(255),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_permissions_type_check CHECK (permission_type IN ('read', 'write', 'execute', 'admin', 'approve')),
    CONSTRAINT template_permissions_user_or_role_check CHECK (
        (user_id IS NOT NULL AND role IS NULL AND team_id IS NULL) OR
        (user_id IS NULL AND role IS NOT NULL AND team_id IS NULL) OR
        (user_id IS NULL AND role IS NULL AND team_id IS NOT NULL)
    )
);

-- Create template reviews table
CREATE TABLE IF NOT EXISTS template_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    template_version VARCHAR(20) NOT NULL,
    reviewer_id VARCHAR(255) NOT NULL,
    review_type VARCHAR(50) NOT NULL DEFAULT 'approval',
    status VARCHAR(50) NOT NULL,
    rating INTEGER,
    comments TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT template_reviews_type_check CHECK (review_type IN ('approval', 'quality', 'security', 'performance')),
    CONSTRAINT template_reviews_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
    CONSTRAINT template_reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
);

-- Create indexes for performance

-- Template categories indexes
CREATE INDEX IF NOT EXISTS idx_template_categories_parent ON template_categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_template_categories_active ON template_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_template_categories_sort_order ON template_categories(sort_order);

-- Template types indexes
CREATE INDEX IF NOT EXISTS idx_template_types_name ON template_types(name);
CREATE INDEX IF NOT EXISTS idx_template_types_active ON template_types(is_active);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
CREATE INDEX IF NOT EXISTS idx_templates_type_id ON templates(template_type_id);
CREATE INDEX IF NOT EXISTS idx_templates_category_id ON templates(category_id);
CREATE INDEX IF NOT EXISTS idx_templates_version ON templates(version);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(is_public);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at);
CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_usage_count ON templates(usage_count);
CREATE INDEX IF NOT EXISTS idx_templates_success_rate ON templates(success_rate);
CREATE INDEX IF NOT EXISTS idx_templates_complexity ON templates(complexity_score);

-- Template versions indexes
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_version ON template_versions(version);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_at ON template_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_by ON template_versions(created_by);

-- Template usage logs indexes
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_template_id ON template_usage_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_task_id ON template_usage_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_workflow_id ON template_usage_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_used_by ON template_usage_logs(used_by);
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_used_at ON template_usage_logs(used_at);
CREATE INDEX IF NOT EXISTS idx_template_usage_logs_success ON template_usage_logs(success);

-- Template dependencies indexes
CREATE INDEX IF NOT EXISTS idx_template_dependencies_parent ON template_dependencies(parent_template_id);
CREATE INDEX IF NOT EXISTS idx_template_dependencies_child ON template_dependencies(child_template_id);
CREATE INDEX IF NOT EXISTS idx_template_dependencies_type ON template_dependencies(dependency_type);

-- Template permissions indexes
CREATE INDEX IF NOT EXISTS idx_template_permissions_template_id ON template_permissions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_permissions_user_id ON template_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_template_permissions_role ON template_permissions(role);
CREATE INDEX IF NOT EXISTS idx_template_permissions_team_id ON template_permissions(team_id);
CREATE INDEX IF NOT EXISTS idx_template_permissions_type ON template_permissions(permission_type);
CREATE INDEX IF NOT EXISTS idx_template_permissions_active ON template_permissions(is_active);

-- Template reviews indexes
CREATE INDEX IF NOT EXISTS idx_template_reviews_template_id ON template_reviews(template_id);
CREATE INDEX IF NOT EXISTS idx_template_reviews_reviewer_id ON template_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_template_reviews_status ON template_reviews(status);
CREATE INDEX IF NOT EXISTS idx_template_reviews_reviewed_at ON template_reviews(reviewed_at);

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_templates_variables_gin ON templates USING GIN (variables);
CREATE INDEX IF NOT EXISTS idx_templates_parameters_gin ON templates USING GIN (parameters);
CREATE INDEX IF NOT EXISTS idx_templates_tags_gin ON templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_templates_metadata_gin ON templates USING GIN (metadata);

-- Create triggers for automatic updated_at timestamps

-- Templates table trigger
CREATE TRIGGER update_templates_updated_at 
    BEFORE UPDATE ON templates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Template categories table trigger
CREATE TRIGGER update_template_categories_updated_at 
    BEFORE UPDATE ON template_categories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Template types table trigger
CREATE TRIGGER update_template_types_updated_at 
    BEFORE UPDATE ON template_types 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to update template statistics
CREATE OR REPLACE FUNCTION update_template_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update usage count and success rate for templates
    UPDATE templates 
    SET 
        usage_count = (
            SELECT COUNT(*) 
            FROM template_usage_logs 
            WHERE template_id = NEW.template_id
        ),
        success_rate = (
            SELECT COALESCE(
                (COUNT(*) FILTER (WHERE success = true) * 100.0) / NULLIF(COUNT(*), 0), 
                0
            )
            FROM template_usage_logs 
            WHERE template_id = NEW.template_id
        ),
        average_execution_time = (
            SELECT COALESCE(AVG(execution_time), 0)
            FROM template_usage_logs 
            WHERE template_id = NEW.template_id AND execution_time IS NOT NULL
        )
    WHERE id = NEW.template_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update template statistics
CREATE TRIGGER update_template_stats_trigger
    AFTER INSERT OR UPDATE ON template_usage_logs
    FOR EACH ROW EXECUTE FUNCTION update_template_stats();

-- Create audit triggers for templates
CREATE TRIGGER audit_templates_trigger
    AFTER INSERT OR UPDATE OR DELETE ON templates
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_template_categories_trigger
    AFTER INSERT OR UPDATE OR DELETE ON template_categories
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_template_types_trigger
    AFTER INSERT OR UPDATE OR DELETE ON template_types
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common template queries

-- Active templates view
CREATE OR REPLACE VIEW active_templates AS
SELECT 
    t.*,
    tc.name as category_name,
    tt.name as type_name,
    COUNT(tul.id) as total_usage,
    COUNT(tul.id) FILTER (WHERE tul.success = true) as successful_usage,
    AVG(tul.execution_time) as avg_execution_time
FROM templates t
LEFT JOIN template_categories tc ON t.category_id = tc.id
LEFT JOIN template_types tt ON t.template_type_id = tt.id
LEFT JOIN template_usage_logs tul ON t.id = tul.template_id
WHERE t.is_active = true
GROUP BY t.id, tc.name, tt.name;

-- Popular templates view
CREATE OR REPLACE VIEW popular_templates AS
SELECT 
    t.*,
    tc.name as category_name,
    tt.name as type_name,
    t.usage_count,
    t.success_rate
FROM templates t
LEFT JOIN template_categories tc ON t.category_id = tc.id
LEFT JOIN template_types tt ON t.template_type_id = tt.id
WHERE t.is_active = true
ORDER BY t.usage_count DESC, t.success_rate DESC
LIMIT 50;

-- Template performance view
CREATE OR REPLACE VIEW template_performance AS
SELECT 
    t.id,
    t.name,
    t.version,
    COUNT(tul.id) as usage_count,
    AVG(tul.execution_time) as avg_execution_time,
    COUNT(tul.id) FILTER (WHERE tul.success = true) as success_count,
    COUNT(tul.id) FILTER (WHERE tul.success = false) as failure_count,
    CASE 
        WHEN COUNT(tul.id) > 0 THEN 
            (COUNT(tul.id) FILTER (WHERE tul.success = true) * 100.0) / COUNT(tul.id)
        ELSE 0 
    END as success_rate
FROM templates t
LEFT JOIN template_usage_logs tul ON t.id = tul.template_id
WHERE t.is_active = true
GROUP BY t.id, t.name, t.version;

-- Insert default template types
INSERT INTO template_types (name, description, schema_definition) VALUES
('prompt_instruction', 'AI prompt instruction templates', '{"required_fields": ["prompt", "context"], "optional_fields": ["examples", "constraints"]}'),
('task_template', 'Task definition templates', '{"required_fields": ["title", "description", "acceptance_criteria"], "optional_fields": ["estimated_hours", "complexity"]}'),
('workflow_template', 'Workflow orchestration templates', '{"required_fields": ["steps", "triggers"], "optional_fields": ["conditions", "error_handling"]}'),
('validation_template', 'Validation rule templates', '{"required_fields": ["rules", "criteria"], "optional_fields": ["error_messages", "warnings"]}'),
('deployment_script', 'Deployment script templates', '{"required_fields": ["script", "environment"], "optional_fields": ["rollback", "health_checks"]}'),
('configuration_template', 'Configuration file templates', '{"required_fields": ["config_type", "settings"], "optional_fields": ["environment_overrides", "validation"]}'),
('code_snippet', 'Reusable code snippet templates', '{"required_fields": ["code", "language"], "optional_fields": ["dependencies", "usage_examples"]}'),
('documentation_template', 'Documentation templates', '{"required_fields": ["content", "format"], "optional_fields": ["sections", "examples"]}'),
('test_template', 'Test case templates', '{"required_fields": ["test_cases", "assertions"], "optional_fields": ["setup", "teardown"]}')
ON CONFLICT (name) DO NOTHING;

-- Insert default template categories
INSERT INTO template_categories (name, description, sort_order) VALUES
('AI Prompts', 'AI prompt instruction templates for various tasks', 1),
('Task Management', 'Task definition and management templates', 2),
('Workflows', 'Workflow and process templates', 3),
('Deployment', 'Deployment and infrastructure templates', 4),
('Testing', 'Testing and validation templates', 5),
('Documentation', 'Documentation and knowledge templates', 6),
('Code Snippets', 'Reusable code and script templates', 7),
('Configuration', 'Configuration and settings templates', 8)
ON CONFLICT (name) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE templates IS 'Main templates table storing all template definitions';
COMMENT ON TABLE template_categories IS 'Template categorization and organization';
COMMENT ON TABLE template_types IS 'Template type definitions with schema validation';
COMMENT ON TABLE template_versions IS 'Version history for templates';
COMMENT ON TABLE template_usage_logs IS 'Usage tracking and performance metrics for templates';
COMMENT ON TABLE template_dependencies IS 'Template dependency relationships';
COMMENT ON TABLE template_permissions IS 'Access control and permissions for templates';
COMMENT ON TABLE template_reviews IS 'Template review and approval workflow';

