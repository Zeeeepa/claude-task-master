-- =====================================================
-- PostgreSQL Schema for Unified CI/CD Orchestration System
-- Templates & Learning Data Tables
-- =====================================================

-- =====================================================
-- TEMPLATES TABLE
-- =====================================================
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

-- Add indexes for templates
CREATE INDEX idx_templates_name ON templates(name);
CREATE INDEX idx_templates_type ON templates(type);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_is_active ON templates(is_active);
CREATE INDEX idx_templates_success_rate ON templates(success_rate);
CREATE INDEX idx_templates_usage_count ON templates(usage_count);
CREATE INDEX idx_templates_created_at ON templates(created_at);
CREATE INDEX idx_templates_last_used_at ON templates(last_used_at);

-- GIN index for tags and metadata JSON fields
CREATE INDEX idx_templates_tags_gin ON templates USING GIN (tags);
CREATE INDEX idx_templates_metadata_gin ON templates USING GIN (metadata);

-- =====================================================
-- TEMPLATE USAGE HISTORY TABLE
-- =====================================================
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

-- Add indexes for template usage history
CREATE INDEX idx_template_usage_history_template_id ON template_usage_history(template_id);
CREATE INDEX idx_template_usage_history_workflow_id ON template_usage_history(workflow_id);
CREATE INDEX idx_template_usage_history_task_id ON template_usage_history(task_id);
CREATE INDEX idx_template_usage_history_success ON template_usage_history(success);
CREATE INDEX idx_template_usage_history_used_at ON template_usage_history(used_at);

-- =====================================================
-- EXECUTION HISTORY TABLE
-- =====================================================
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

-- Add indexes for execution history
CREATE INDEX idx_execution_history_workflow_id ON execution_history(workflow_id);
CREATE INDEX idx_execution_history_task_id ON execution_history(task_id);
CREATE INDEX idx_execution_history_component_name ON execution_history(component_name);
CREATE INDEX idx_execution_history_action ON execution_history(action);
CREATE INDEX idx_execution_history_success ON execution_history(success);
CREATE INDEX idx_execution_history_session_id ON execution_history(session_id);
CREATE INDEX idx_execution_history_correlation_id ON execution_history(correlation_id);
CREATE INDEX idx_execution_history_created_at ON execution_history(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_execution_history_component_action ON execution_history(component_name, action, created_at DESC);
CREATE INDEX idx_execution_history_workflow_component ON execution_history(workflow_id, component_name, created_at DESC);

-- =====================================================
-- LEARNING DATA TABLE
-- =====================================================
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

-- Add indexes for learning data
CREATE INDEX idx_learning_data_pattern_type ON learning_data(pattern_type);
CREATE INDEX idx_learning_data_confidence_score ON learning_data(confidence_score);
CREATE INDEX idx_learning_data_effectiveness_score ON learning_data(effectiveness_score);
CREATE INDEX idx_learning_data_usage_frequency ON learning_data(usage_frequency);
CREATE INDEX idx_learning_data_source_workflow_id ON learning_data(source_workflow_id);
CREATE INDEX idx_learning_data_source_task_id ON learning_data(source_task_id);
CREATE INDEX idx_learning_data_last_used_at ON learning_data(last_used_at);
CREATE INDEX idx_learning_data_created_at ON learning_data(created_at);

-- GIN indexes for JSON fields
CREATE INDEX idx_learning_data_pattern_data_gin ON learning_data USING GIN (pattern_data);
CREATE INDEX idx_learning_data_context_tags_gin ON learning_data USING GIN (context_tags);

-- =====================================================
-- KNOWLEDGE BASE TABLE
-- =====================================================
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

-- Add indexes for knowledge base
CREATE INDEX idx_knowledge_base_title ON knowledge_base(title);
CREATE INDEX idx_knowledge_base_content_type ON knowledge_base(content_type);
CREATE INDEX idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX idx_knowledge_base_source_type ON knowledge_base(source_type);
CREATE INDEX idx_knowledge_base_relevance_score ON knowledge_base(relevance_score);
CREATE INDEX idx_knowledge_base_is_public ON knowledge_base(is_public);
CREATE INDEX idx_knowledge_base_created_at ON knowledge_base(created_at);
CREATE INDEX idx_knowledge_base_last_accessed_at ON knowledge_base(last_accessed_at);

-- Full-text search index
CREATE INDEX idx_knowledge_base_content_fts ON knowledge_base USING GIN (to_tsvector('english', title || ' ' || content));

-- GIN indexes for JSON fields
CREATE INDEX idx_knowledge_base_tags_gin ON knowledge_base USING GIN (tags);
CREATE INDEX idx_knowledge_base_metadata_gin ON knowledge_base USING GIN (metadata);

-- =====================================================
-- TRIGGERS FOR TEMPLATES AND LEARNING TABLES
-- =====================================================

-- Apply updated_at triggers
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_data_updated_at BEFORE UPDATE ON learning_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS FOR TEMPLATE MANAGEMENT
-- =====================================================

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
CREATE TRIGGER update_template_stats_on_usage
    AFTER INSERT ON template_usage_history
    FOR EACH ROW EXECUTE FUNCTION update_template_usage_stats();

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- Template performance view
CREATE VIEW template_performance AS
SELECT 
    t.id,
    t.name,
    t.type,
    t.category,
    t.usage_count,
    t.success_rate,
    COUNT(tuh.id) as recent_usage_count,
    AVG(tuh.execution_time_ms) as avg_execution_time,
    AVG(tuh.output_quality_score) as avg_quality_score,
    MAX(tuh.used_at) as last_used
FROM templates t
LEFT JOIN template_usage_history tuh ON t.id = tuh.template_id 
    AND tuh.used_at >= NOW() - INTERVAL '30 days'
GROUP BY t.id, t.name, t.type, t.category, t.usage_count, t.success_rate;

-- Learning patterns effectiveness view
CREATE VIEW learning_patterns_effectiveness AS
SELECT 
    pattern_type,
    COUNT(*) as pattern_count,
    AVG(confidence_score) as avg_confidence,
    AVG(effectiveness_score) as avg_effectiveness,
    SUM(usage_frequency) as total_usage,
    MAX(last_used_at) as most_recent_use
FROM learning_data
WHERE confidence_score > 70  -- Only include high-confidence patterns
GROUP BY pattern_type
ORDER BY avg_effectiveness DESC, total_usage DESC;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE templates IS 'Reusable templates for code patterns, scripts, and configurations';
COMMENT ON TABLE template_usage_history IS 'Historical record of template usage and effectiveness';
COMMENT ON TABLE execution_history IS 'Detailed execution logs for all system operations';
COMMENT ON TABLE learning_data IS 'Machine learning patterns and optimization data';
COMMENT ON TABLE knowledge_base IS 'Centralized knowledge repository for documentation and best practices';

COMMENT ON COLUMN templates.template_content IS 'JSON structure containing the template definition and parameters';
COMMENT ON COLUMN templates.tags IS 'JSON array of tags for categorization and search';
COMMENT ON COLUMN templates.metadata IS 'JSON object with additional template metadata';
COMMENT ON COLUMN learning_data.pattern_data IS 'JSON structure containing the learned pattern data';
COMMENT ON COLUMN learning_data.success_indicators IS 'JSON object defining what constitutes success for this pattern';
COMMENT ON COLUMN learning_data.failure_indicators IS 'JSON object defining failure conditions';
COMMENT ON COLUMN learning_data.optimization_suggestions IS 'JSON array of suggested optimizations';
COMMENT ON COLUMN knowledge_base.metadata IS 'JSON object with additional knowledge base entry metadata';

