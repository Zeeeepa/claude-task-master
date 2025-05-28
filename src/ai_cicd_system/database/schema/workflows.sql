-- Workflows Table Schema
-- Stores workflow configurations and states

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused')),
    configuration JSONB DEFAULT '{}',
    state JSONB DEFAULT '{}',
    task_ids JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_workflows_configuration_gin ON workflows USING GIN(configuration);
CREATE INDEX IF NOT EXISTS idx_workflows_state_gin ON workflows USING GIN(state);
CREATE INDEX IF NOT EXISTS idx_workflows_task_ids_gin ON workflows USING GIN(task_ids);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_workflows_updated_at 
    BEFORE UPDATE ON workflows 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

