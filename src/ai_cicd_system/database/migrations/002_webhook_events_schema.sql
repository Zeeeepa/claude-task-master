-- Migration: 002_webhook_events_schema.sql
-- Description: Add webhook events and GitHub integration tables
-- Created: 2025-05-28
-- Version: 1.0.0

-- Create webhook events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(255) PRIMARY KEY, -- GitHub delivery ID
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    failed BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT webhook_events_type_check CHECK (type IN (
        'pull_request', 'pull_request_review', 'push', 'issues', 'issue_comment'
    )),
    CONSTRAINT webhook_events_retry_check CHECK (retry_count >= 0)
);

-- Create GitHub repositories table
CREATE TABLE IF NOT EXISTS github_repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id BIGINT UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    clone_url VARCHAR(500) NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main',
    is_private BOOLEAN DEFAULT FALSE,
    webhook_configured BOOLEAN DEFAULT FALSE,
    webhook_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create pull requests table
CREATE TABLE IF NOT EXISTS pull_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id BIGINT UNIQUE NOT NULL,
    repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    state VARCHAR(20) NOT NULL DEFAULT 'open',
    head_branch VARCHAR(255) NOT NULL,
    base_branch VARCHAR(255) NOT NULL,
    head_sha VARCHAR(40),
    base_sha VARCHAR(40),
    author VARCHAR(255) NOT NULL,
    assignees JSONB DEFAULT '[]'::jsonb,
    reviewers JSONB DEFAULT '[]'::jsonb,
    labels JSONB DEFAULT '[]'::jsonb,
    commits INTEGER DEFAULT 0,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    mergeable BOOLEAN,
    merged BOOLEAN DEFAULT FALSE,
    merged_at TIMESTAMP WITH TIME ZONE,
    merged_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT pull_requests_state_check CHECK (state IN ('open', 'closed', 'merged')),
    CONSTRAINT pull_requests_number_repo_unique UNIQUE (repository_id, number)
);

-- Create event processing queue table
CREATE TABLE IF NOT EXISTS event_processing_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(255) NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    processing_data JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT event_queue_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT event_queue_priority_check CHECK (priority >= 1 AND priority <= 10),
    CONSTRAINT event_queue_retry_check CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Create workflow triggers table
CREATE TABLE IF NOT EXISTS workflow_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_action VARCHAR(50),
    repository_id UUID REFERENCES github_repositories(id) ON DELETE CASCADE,
    workflow_type VARCHAR(50) NOT NULL,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT workflow_triggers_event_type_check CHECK (event_type IN (
        'pull_request', 'pull_request_review', 'push', 'issues', 'issue_comment'
    )),
    CONSTRAINT workflow_triggers_workflow_type_check CHECK (workflow_type IN (
        'pr_validation', 'code_review', 'deployment', 'testing', 'security_scan'
    ))
);

-- Create indexes for performance

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_failed ON webhook_events(failed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry_count ON webhook_events(retry_count);

-- GitHub repositories indexes
CREATE INDEX IF NOT EXISTS idx_github_repositories_github_id ON github_repositories(github_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_full_name ON github_repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_github_repositories_owner ON github_repositories(owner);
CREATE INDEX IF NOT EXISTS idx_github_repositories_webhook_configured ON github_repositories(webhook_configured);

-- Pull requests indexes
CREATE INDEX IF NOT EXISTS idx_pull_requests_github_id ON pull_requests(github_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repository_id ON pull_requests(repository_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_number ON pull_requests(number);
CREATE INDEX IF NOT EXISTS idx_pull_requests_state ON pull_requests(state);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author);
CREATE INDEX IF NOT EXISTS idx_pull_requests_head_branch ON pull_requests(head_branch);
CREATE INDEX IF NOT EXISTS idx_pull_requests_base_branch ON pull_requests(base_branch);
CREATE INDEX IF NOT EXISTS idx_pull_requests_created_at ON pull_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_pull_requests_updated_at ON pull_requests(updated_at);

-- Event processing queue indexes
CREATE INDEX IF NOT EXISTS idx_event_queue_event_id ON event_processing_queue(event_id);
CREATE INDEX IF NOT EXISTS idx_event_queue_status ON event_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_event_queue_priority ON event_processing_queue(priority);
CREATE INDEX IF NOT EXISTS idx_event_queue_scheduled_at ON event_processing_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_event_queue_retry_count ON event_processing_queue(retry_count);

-- Workflow triggers indexes
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_event_type ON workflow_triggers(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_repository_id ON workflow_triggers(repository_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_is_active ON workflow_triggers(is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_last_triggered_at ON workflow_triggers(last_triggered_at);

-- Create triggers for automatic updated_at timestamps

-- Triggers for github_repositories table
CREATE TRIGGER update_github_repositories_updated_at
    BEFORE UPDATE ON github_repositories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for pull_requests table
CREATE TRIGGER update_pull_requests_updated_at
    BEFORE UPDATE ON pull_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for workflow_triggers table
CREATE TRIGGER update_workflow_triggers_updated_at
    BEFORE UPDATE ON workflow_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit triggers for new tables
CREATE TRIGGER audit_webhook_events_trigger
    AFTER INSERT OR UPDATE OR DELETE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_github_repositories_trigger
    AFTER INSERT OR UPDATE OR DELETE ON github_repositories
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_pull_requests_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pull_requests
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create views for common queries

-- Active webhook events view
CREATE OR REPLACE VIEW active_webhook_events AS
SELECT 
    we.*,
    epq.status as queue_status,
    epq.retry_count as queue_retry_count,
    epq.scheduled_at as queue_scheduled_at
FROM webhook_events we
LEFT JOIN event_processing_queue epq ON we.id = epq.event_id
WHERE we.processed = FALSE AND we.failed = FALSE;

-- Repository webhook status view
CREATE OR REPLACE VIEW repository_webhook_status AS
SELECT 
    gr.*,
    COUNT(we.id) as total_events,
    COUNT(CASE WHEN we.processed = TRUE THEN 1 END) as processed_events,
    COUNT(CASE WHEN we.failed = TRUE THEN 1 END) as failed_events,
    MAX(we.received_at) as last_event_received
FROM github_repositories gr
LEFT JOIN webhook_events we ON we.payload->>'repository'->>'full_name' = gr.full_name
GROUP BY gr.id;

-- Pull request workflow status view
CREATE OR REPLACE VIEW pr_workflow_status AS
SELECT 
    pr.*,
    COUNT(ws.id) as workflow_count,
    COUNT(CASE WHEN ws.status = 'completed' THEN 1 END) as completed_workflows,
    COUNT(CASE WHEN ws.status = 'failed' THEN 1 END) as failed_workflows,
    MAX(ws.started_at) as last_workflow_started
FROM pull_requests pr
LEFT JOIN workflow_states ws ON ws.task_id::text = pr.id::text
GROUP BY pr.id;

-- Event processing metrics view
CREATE OR REPLACE VIEW event_processing_metrics AS
SELECT 
    event_type,
    COUNT(*) as total_events,
    COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed_events,
    COUNT(CASE WHEN failed = TRUE THEN 1 END) as failed_events,
    AVG(EXTRACT(EPOCH FROM (processed_at - received_at))) as avg_processing_time_seconds,
    MAX(received_at) as last_event_received
FROM webhook_events
GROUP BY event_type;

-- Insert migration record
INSERT INTO schema_migrations (version, description, checksum)
VALUES ('002', 'Webhook events and GitHub integration schema', 'webhook_events_v1_0_0')
ON CONFLICT (version) DO NOTHING;

-- Add comments
COMMENT ON TABLE webhook_events IS 'GitHub webhook events storage and processing tracking';
COMMENT ON TABLE github_repositories IS 'GitHub repository information and webhook configuration';
COMMENT ON TABLE pull_requests IS 'GitHub pull request data and metadata';
COMMENT ON TABLE event_processing_queue IS 'Queue for processing webhook events with retry logic';
COMMENT ON TABLE workflow_triggers IS 'Configuration for triggering workflows based on GitHub events';

