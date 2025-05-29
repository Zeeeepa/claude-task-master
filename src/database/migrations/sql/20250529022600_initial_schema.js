/**
 * Migration: Initial Schema for CI/CD Orchestration System
 * Created: 2025-05-29T02:26:00.000Z
 */

export async function up(db) {
    // Create projects table
    await db.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            repository_url VARCHAR(500) NOT NULL,
            repository_owner VARCHAR(255) NOT NULL,
            repository_name VARCHAR(255) NOT NULL,
            default_branch VARCHAR(255) DEFAULT 'main',
            webhook_secret VARCHAR(255),
            agentapi_config JSONB DEFAULT '{}',
            claude_code_config JSONB DEFAULT '{}',
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(repository_owner, repository_name)
        )
    `);

    // Create tasks table
    await db.query(`
        CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            type VARCHAR(100) NOT NULL DEFAULT 'feature',
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            priority INTEGER DEFAULT 3,
            assignee VARCHAR(255),
            parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
            dependencies JSONB DEFAULT '[]',
            metadata JSONB DEFAULT '{}',
            estimated_hours DECIMAL(5,2),
            actual_hours DECIMAL(5,2),
            due_date TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE
        )
    `);

    // Create pull_requests table
    await db.query(`
        CREATE TABLE IF NOT EXISTS pull_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
            pr_number INTEGER NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            branch_name VARCHAR(255) NOT NULL,
            base_branch VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'open',
            github_pr_id BIGINT,
            github_url VARCHAR(500),
            created_by VARCHAR(255),
            merged_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            merged_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(project_id, pr_number)
        )
    `);

    // Create ci_cd_pipelines table
    await db.query(`
        CREATE TABLE IF NOT EXISTS ci_cd_pipelines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            pull_request_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
            pipeline_type VARCHAR(100) NOT NULL DEFAULT 'validation',
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            trigger_event VARCHAR(100) NOT NULL,
            branch_name VARCHAR(255) NOT NULL,
            commit_sha VARCHAR(40),
            agentapi_session_id VARCHAR(255),
            claude_code_session_id VARCHAR(255),
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE,
            duration_ms INTEGER,
            metadata JSONB DEFAULT '{}'
        )
    `);

    // Create pipeline_steps table
    await db.query(`
        CREATE TABLE IF NOT EXISTS pipeline_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pipeline_id UUID NOT NULL REFERENCES ci_cd_pipelines(id) ON DELETE CASCADE,
            step_name VARCHAR(255) NOT NULL,
            step_type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            order_index INTEGER NOT NULL,
            command TEXT,
            output TEXT,
            error_message TEXT,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            duration_ms INTEGER,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            metadata JSONB DEFAULT '{}'
        )
    `);

    // Create validation_results table
    await db.query(`
        CREATE TABLE IF NOT EXISTS validation_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pipeline_id UUID NOT NULL REFERENCES ci_cd_pipelines(id) ON DELETE CASCADE,
            pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
            validation_type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            score DECIMAL(3,2),
            issues_found INTEGER DEFAULT 0,
            issues_fixed INTEGER DEFAULT 0,
            claude_code_feedback TEXT,
            recommendations TEXT,
            files_analyzed JSONB DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE
        )
    `);

    // Create webhook_events table
    await db.query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
            event_type VARCHAR(100) NOT NULL,
            event_action VARCHAR(100),
            payload JSONB NOT NULL,
            processed BOOLEAN DEFAULT FALSE,
            processing_started_at TIMESTAMP WITH TIME ZONE,
            processing_completed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);

    // Create prompt_templates table
    await db.query(`
        CREATE TABLE IF NOT EXISTS prompt_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            template_type VARCHAR(100) NOT NULL,
            content TEXT NOT NULL,
            variables JSONB DEFAULT '[]',
            version INTEGER DEFAULT 1,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);

    // Create deployment_environments table
    await db.query(`
        CREATE TABLE IF NOT EXISTS deployment_environments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(100) NOT NULL DEFAULT 'staging',
            url VARCHAR(500),
            wsl2_instance_config JSONB DEFAULT '{}',
            deployment_config JSONB DEFAULT '{}',
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(project_id, name)
        )
    `);

    // Create deployments table
    await db.query(`
        CREATE TABLE IF NOT EXISTS deployments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            environment_id UUID NOT NULL REFERENCES deployment_environments(id) ON DELETE CASCADE,
            pull_request_id UUID REFERENCES pull_requests(id) ON DELETE SET NULL,
            pipeline_id UUID REFERENCES ci_cd_pipelines(id) ON DELETE SET NULL,
            branch_name VARCHAR(255) NOT NULL,
            commit_sha VARCHAR(40) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            deployment_url VARCHAR(500),
            logs TEXT,
            error_message TEXT,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE,
            duration_ms INTEGER
        )
    `);

    // Create indexes for performance
    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_projects_repository ON projects(repository_owner, repository_name);
        CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
        CREATE INDEX IF NOT EXISTS idx_pull_requests_project ON pull_requests(project_id);
        CREATE INDEX IF NOT EXISTS idx_pull_requests_status ON pull_requests(status);
        CREATE INDEX IF NOT EXISTS idx_pipelines_project ON ci_cd_pipelines(project_id);
        CREATE INDEX IF NOT EXISTS idx_pipelines_pr ON ci_cd_pipelines(pull_request_id);
        CREATE INDEX IF NOT EXISTS idx_pipelines_status ON ci_cd_pipelines(status);
        CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline ON pipeline_steps(pipeline_id);
        CREATE INDEX IF NOT EXISTS idx_validation_results_pipeline ON validation_results(pipeline_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at);
        CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment_id);
        CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    `);

    // Create updated_at trigger function
    await db.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    const tablesWithUpdatedAt = ['projects', 'tasks', 'pull_requests', 'prompt_templates', 'deployment_environments'];
    for (const table of tablesWithUpdatedAt) {
        await db.query(`
            CREATE TRIGGER update_${table}_updated_at 
            BEFORE UPDATE ON ${table} 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
    }
}

export async function down(db) {
    // Drop triggers
    const tablesWithUpdatedAt = ['projects', 'tasks', 'pull_requests', 'prompt_templates', 'deployment_environments'];
    for (const table of tablesWithUpdatedAt) {
        await db.query(`DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};`);
    }

    // Drop function
    await db.query(`DROP FUNCTION IF EXISTS update_updated_at_column();`);

    // Drop tables in reverse order (respecting foreign key constraints)
    const tables = [
        'deployments',
        'deployment_environments',
        'prompt_templates',
        'webhook_events',
        'validation_results',
        'pipeline_steps',
        'ci_cd_pipelines',
        'pull_requests',
        'tasks',
        'projects'
    ];

    for (const table of tables) {
        await db.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
}

