/**
 * Linear Correlations Database Model
 * 
 * Manages correlations between Task Master tasks and Linear issues,
 * including parent-child relationships and bidirectional references.
 */

export class LinearCorrelationsModel {
    constructor(database) {
        this.database = database;
    }

    /**
     * Create correlation
     */
    async createCorrelation(correlationData) {
        const query = `
            INSERT INTO linear_correlations (
                id, task_id, linear_issue_id, parent_task_id, parent_linear_issue_id,
                correlation_type, status, metadata, created_at, updated_at, last_synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;

        const values = [
            correlationData.id,
            correlationData.task_id,
            correlationData.linear_issue_id,
            correlationData.parent_task_id || null,
            correlationData.parent_linear_issue_id || null,
            correlationData.correlation_type || 'task_to_issue',
            correlationData.status || 'active',
            JSON.stringify(correlationData.metadata || {}),
            correlationData.created_at || new Date(),
            correlationData.updated_at || new Date(),
            correlationData.last_synced_at || new Date()
        ];

        const result = await this.database.query(query, values);
        return result.rows[0];
    }

    /**
     * Update correlation
     */
    async updateCorrelation(correlationId, updateData) {
        const setClause = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updateData).forEach(([key, value]) => {
            if (key === 'metadata') {
                setClause.push(`${key} = $${paramIndex++}`);
                values.push(JSON.stringify(value));
            } else {
                setClause.push(`${key} = $${paramIndex++}`);
                values.push(value);
            }
        });

        setClause.push(`updated_at = $${paramIndex++}`);
        values.push(new Date());

        values.push(correlationId);

        const query = `
            UPDATE linear_correlations 
            SET ${setClause.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await this.database.query(query, values);
        return result.rows[0];
    }

    /**
     * Get correlation by ID
     */
    async getCorrelationById(correlationId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE id = $1
        `;

        const result = await this.database.query(query, [correlationId]);
        return result.rows[0] || null;
    }

    /**
     * Get correlation by task ID
     */
    async getCorrelationByTaskId(taskId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE task_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;

        const result = await this.database.query(query, [taskId]);
        return result.rows[0] || null;
    }

    /**
     * Get correlation by Linear issue ID
     */
    async getCorrelationByLinearIssueId(linearIssueId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE linear_issue_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;

        const result = await this.database.query(query, [linearIssueId]);
        return result.rows[0] || null;
    }

    /**
     * Get child correlations
     */
    async getChildCorrelations(parentTaskId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE parent_task_id = $1 AND status = 'active'
            ORDER BY created_at ASC
        `;

        const result = await this.database.query(query, [parentTaskId]);
        return result.rows;
    }

    /**
     * Delete correlation (soft delete)
     */
    async deleteCorrelation(correlationId, reason = 'manual_deletion') {
        const query = `
            UPDATE linear_correlations 
            SET status = 'deleted', deleted_at = NOW(), deletion_reason = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;

        const result = await this.database.query(query, [correlationId, reason]);
        return result.rows[0];
    }

    /**
     * Find orphaned correlations
     */
    async findOrphanedCorrelations(retentionDays = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const query = `
            SELECT lc.* 
            FROM linear_correlations lc
            LEFT JOIN tasks t ON lc.task_id = t.id
            WHERE lc.status = 'active'
            AND (
                t.id IS NULL 
                OR lc.last_synced_at < $1
            )
            ORDER BY lc.created_at ASC
        `;

        const result = await this.database.query(query, [cutoffDate]);
        return result.rows;
    }

    /**
     * Get correlation statistics
     */
    async getStatistics() {
        const queries = {
            total: 'SELECT COUNT(*) as count FROM linear_correlations WHERE status = \'active\'',
            byType: 'SELECT correlation_type, COUNT(*) as count FROM linear_correlations WHERE status = \'active\' GROUP BY correlation_type',
            orphaned: 'SELECT COUNT(*) as count FROM linear_correlations lc LEFT JOIN tasks t ON lc.task_id = t.id WHERE lc.status = \'active\' AND t.id IS NULL',
            hierarchical: 'SELECT COUNT(*) as count FROM linear_correlations WHERE status = \'active\' AND parent_task_id IS NOT NULL'
        };

        const results = {};
        for (const [key, query] of Object.entries(queries)) {
            const result = await this.database.query(query);
            results[key] = result.rows;
        }

        return results;
    }

    /**
     * Ensure correlation tables exist
     */
    async ensureTables() {
        const createTablesQuery = `
            -- Linear correlations table
            CREATE TABLE IF NOT EXISTS linear_correlations (
                id VARCHAR(255) PRIMARY KEY,
                task_id UUID NOT NULL,
                linear_issue_id VARCHAR(255) NOT NULL,
                parent_task_id UUID,
                parent_linear_issue_id VARCHAR(255),
                correlation_type VARCHAR(50) NOT NULL DEFAULT 'task_to_issue',
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                deleted_at TIMESTAMP WITH TIME ZONE,
                deletion_reason VARCHAR(255),
                
                UNIQUE(task_id, linear_issue_id)
            );

            -- Task to Linear references
            CREATE TABLE IF NOT EXISTS task_linear_references (
                id SERIAL PRIMARY KEY,
                task_id UUID NOT NULL,
                linear_issue_id VARCHAR(255) NOT NULL,
                reference_type VARCHAR(50) NOT NULL DEFAULT 'sync',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(task_id, linear_issue_id)
            );

            -- Linear to Task references
            CREATE TABLE IF NOT EXISTS linear_task_references (
                id SERIAL PRIMARY KEY,
                linear_issue_id VARCHAR(255) NOT NULL,
                task_id UUID NOT NULL,
                reference_type VARCHAR(50) NOT NULL DEFAULT 'sync',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(linear_issue_id, task_id)
            );

            -- Correlation hierarchy
            CREATE TABLE IF NOT EXISTS correlation_hierarchy (
                id SERIAL PRIMARY KEY,
                parent_id UUID NOT NULL,
                child_id UUID NOT NULL,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'parent_child',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(parent_id, child_id)
            );

            -- Linear hierarchy
            CREATE TABLE IF NOT EXISTS linear_hierarchy (
                id SERIAL PRIMARY KEY,
                parent_issue_id VARCHAR(255) NOT NULL,
                child_issue_id VARCHAR(255) NOT NULL,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'parent_child',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(parent_issue_id, child_issue_id)
            );

            -- Linear webhook events
            CREATE TABLE IF NOT EXISTS linear_webhook_events (
                id VARCHAR(255) PRIMARY KEY,
                event_key VARCHAR(255) NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                payload JSONB NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'queued',
                attempts INTEGER DEFAULT 0,
                last_error TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Status sync audit trail
            CREATE TABLE IF NOT EXISTS status_sync_audit (
                id SERIAL PRIMARY KEY,
                source VARCHAR(50) NOT NULL,
                target VARCHAR(50),
                task_id UUID,
                linear_issue_id VARCHAR(255),
                old_status VARCHAR(50),
                new_status VARCHAR(50) NOT NULL,
                success BOOLEAN NOT NULL,
                error TEXT,
                context JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Status sync conflicts
            CREATE TABLE IF NOT EXISTS status_sync_conflicts (
                id SERIAL PRIMARY KEY,
                conflict_type VARCHAR(50) NOT NULL,
                conflict_data JSONB NOT NULL,
                context JSONB DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'pending',
                resolution JSONB,
                resolved_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Progress snapshots
            CREATE TABLE IF NOT EXISTS progress_snapshots (
                id SERIAL PRIMARY KEY,
                task_id UUID NOT NULL,
                percentage INTEGER NOT NULL,
                completed_tasks INTEGER DEFAULT 0,
                total_tasks INTEGER DEFAULT 0,
                in_progress_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                details JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Milestone progress
            CREATE TABLE IF NOT EXISTS milestone_progress (
                id SERIAL PRIMARY KEY,
                milestone_id VARCHAR(255) NOT NULL,
                percentage INTEGER NOT NULL,
                total_tasks INTEGER DEFAULT 0,
                completed_tasks INTEGER DEFAULT 0,
                in_progress_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Progress reports
            CREATE TABLE IF NOT EXISTS progress_reports (
                id SERIAL PRIMARY KEY,
                timeframe VARCHAR(50) NOT NULL,
                summary JSONB NOT NULL,
                report_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project assignments
            CREATE TABLE IF NOT EXISTS project_assignments (
                id SERIAL PRIMARY KEY,
                issue_id VARCHAR(255) NOT NULL,
                project_id VARCHAR(255) NOT NULL,
                assigned_by VARCHAR(255) NOT NULL,
                assignment_rule VARCHAR(255),
                metadata JSONB DEFAULT '{}',
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project metadata
            CREATE TABLE IF NOT EXISTS project_metadata (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                template_name VARCHAR(100),
                template_data JSONB DEFAULT '{}',
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project progress
            CREATE TABLE IF NOT EXISTS project_progress (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                percentage INTEGER NOT NULL,
                total_issues INTEGER DEFAULT 0,
                completed_issues INTEGER DEFAULT 0,
                in_progress_issues INTEGER DEFAULT 0,
                todo_issues INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project milestones
            CREATE TABLE IF NOT EXISTS project_milestones (
                id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                target_date DATE,
                status VARCHAR(50) DEFAULT 'active',
                linear_issue_id VARCHAR(255),
                progress_percentage INTEGER DEFAULT 0,
                completed_issues INTEGER DEFAULT 0,
                total_issues INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Project assignment rules
            CREATE TABLE IF NOT EXISTS project_assignment_rules (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                condition TEXT NOT NULL,
                project_id VARCHAR(255),
                priority INTEGER DEFAULT 100,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Linear event logs
            CREATE TABLE IF NOT EXISTS linear_event_logs (
                id VARCHAR(255) PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                level VARCHAR(20) NOT NULL,
                operation VARCHAR(100) NOT NULL,
                log_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_task_id ON linear_correlations(task_id);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_linear_issue_id ON linear_correlations(linear_issue_id);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_status ON linear_correlations(status);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_parent_task_id ON linear_correlations(parent_task_id);
            CREATE INDEX IF NOT EXISTS idx_task_linear_references_task_id ON task_linear_references(task_id);
            CREATE INDEX IF NOT EXISTS idx_linear_task_references_linear_issue_id ON linear_task_references(linear_issue_id);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_event_key ON linear_webhook_events(event_key);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON linear_webhook_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON linear_webhook_events(status);
            CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON linear_webhook_events(created_at);
            CREATE INDEX IF NOT EXISTS idx_status_audit_task_id ON status_sync_audit(task_id);
            CREATE INDEX IF NOT EXISTS idx_status_audit_linear_issue_id ON status_sync_audit(linear_issue_id);
            CREATE INDEX IF NOT EXISTS idx_status_audit_source ON status_sync_audit(source);
            CREATE INDEX IF NOT EXISTS idx_status_conflicts_status ON status_sync_conflicts(status);
            CREATE INDEX IF NOT EXISTS idx_progress_snapshots_task_id ON progress_snapshots(task_id);
            CREATE INDEX IF NOT EXISTS idx_progress_snapshots_created_at ON progress_snapshots(created_at);
            CREATE INDEX IF NOT EXISTS idx_milestone_progress_milestone_id ON milestone_progress(milestone_id);
            CREATE INDEX IF NOT EXISTS idx_project_assignments_issue_id ON project_assignments(issue_id);
            CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_progress_project_id ON project_progress(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_category ON linear_event_logs(category);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_level ON linear_event_logs(level);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_operation ON linear_event_logs(operation);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_created_at ON linear_event_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_category_created_at ON linear_event_logs(category, created_at);
        `;

        await this.database.query(createTablesQuery);
    }
}

export default LinearCorrelationsModel;

