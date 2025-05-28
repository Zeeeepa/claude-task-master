-- Tasks Table Schema
-- Stores all task information with comprehensive metadata

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]',
    acceptance_criteria JSONB DEFAULT '[]',
    complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10) DEFAULT 5,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked')),
    priority INTEGER DEFAULT 0,
    dependencies JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    affected_files JSONB DEFAULT '[]',
    assigned_to VARCHAR(255),
    tags JSONB DEFAULT '[]',
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity_score ON tasks(complexity_score);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_tasks_requirements_gin ON tasks USING GIN(requirements);
CREATE INDEX IF NOT EXISTS idx_tasks_metadata_gin ON tasks USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_tasks_tags_gin ON tasks USING GIN(tags);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

