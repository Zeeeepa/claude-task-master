-- Database Initialization Script
-- Creates all tables and indexes for the Claude Task Master system

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the update timestamp function (used by all tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Load all table schemas
\i tasks.sql
\i contexts.sql
\i workflows.sql
\i pr_tracking.sql

-- Create additional indexes for cross-table queries
CREATE INDEX IF NOT EXISTS idx_contexts_task_workflow 
    ON contexts(task_id) 
    WHERE context_type = 'workflow';

CREATE INDEX IF NOT EXISTS idx_contexts_ai_interactions 
    ON contexts(task_id, created_at) 
    WHERE context_type = 'ai_interaction';

-- Create a view for task summaries with context counts
CREATE OR REPLACE VIEW task_summary AS
SELECT 
    t.id,
    t.title,
    t.status,
    t.priority,
    t.complexity_score,
    t.assigned_to,
    t.created_at,
    t.updated_at,
    COUNT(c.id) as context_count,
    COUNT(CASE WHEN c.context_type = 'ai_interaction' THEN 1 END) as ai_interaction_count,
    COUNT(CASE WHEN c.context_type = 'validation' THEN 1 END) as validation_count
FROM tasks t
LEFT JOIN contexts c ON t.id = c.task_id
GROUP BY t.id, t.title, t.status, t.priority, t.complexity_score, t.assigned_to, t.created_at, t.updated_at;

-- Create a view for workflow progress
CREATE OR REPLACE VIEW workflow_progress AS
SELECT 
    w.id,
    w.name,
    w.status,
    w.created_at,
    w.updated_at,
    jsonb_array_length(w.task_ids) as total_tasks,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
    COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks
FROM workflows w
LEFT JOIN tasks t ON t.id::text = ANY(SELECT jsonb_array_elements_text(w.task_ids))
GROUP BY w.id, w.name, w.status, w.created_at, w.updated_at, w.task_ids;

