-- PR Tracking Table Schema
-- Tracks pull requests associated with tasks

CREATE TABLE IF NOT EXISTS pr_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    pr_url VARCHAR(500),
    pr_number INTEGER,
    branch_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'merged', 'draft')),
    repository VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pr_tracking_task_id ON pr_tracking(task_id);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_status ON pr_tracking(status);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_repository ON pr_tracking(repository);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_pr_number ON pr_tracking(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_tracking_branch_name ON pr_tracking(branch_name);

-- Unique constraint to prevent duplicate PR tracking for same task/PR
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_tracking_unique_task_pr 
    ON pr_tracking(task_id, pr_number) 
    WHERE pr_number IS NOT NULL;

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_pr_tracking_updated_at 
    BEFORE UPDATE ON pr_tracking 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

