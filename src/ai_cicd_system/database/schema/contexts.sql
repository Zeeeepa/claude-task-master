-- Contexts Table Schema
-- Stores contextual information for tasks

CREATE TABLE IF NOT EXISTS contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN (
        'requirement', 'codebase', 'ai_interaction', 'validation', 
        'workflow', 'status_change', 'completion', 'dependency_parent', 
        'dependency_child', 'task_context'
    )),
    context_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contexts_task_id ON contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts(context_type);
CREATE INDEX IF NOT EXISTS idx_contexts_created_at ON contexts(created_at);
CREATE INDEX IF NOT EXISTS idx_contexts_task_type ON contexts(task_id, context_type);

-- GIN index for JSONB context_data
CREATE INDEX IF NOT EXISTS idx_contexts_data_gin ON contexts USING GIN(context_data);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_contexts_updated_at 
    BEFORE UPDATE ON contexts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

