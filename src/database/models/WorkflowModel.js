/**
 * Workflow Model
 * Handles workflow-related database operations
 */

import { BaseModel } from './BaseModel.js';

export class WorkflowModel extends BaseModel {
    constructor() {
        super('workflows');
    }

    /**
     * Create a new workflow
     */
    async createWorkflow(workflowData) {
        const workflow = await this.create({
            name: workflowData.name,
            description: workflowData.description,
            type: workflowData.type,
            status: workflowData.status || 'draft',
            priority: workflowData.priority || 0,
            definition: JSON.stringify(workflowData.definition || {}),
            configuration: JSON.stringify(workflowData.configuration || {}),
            environment_variables: JSON.stringify(workflowData.environment_variables || {}),
            tags: workflowData.tags || [],
            metadata: JSON.stringify(workflowData.metadata || {}),
            created_by: workflowData.created_by,
            parent_workflow_id: workflowData.parent_workflow_id,
            scheduled_at: workflowData.scheduled_at,
            timeout_seconds: workflowData.timeout_seconds || 3600
        });

        return workflow;
    }

    /**
     * Get workflows by status
     */
    async getByStatus(status, options = {}) {
        return this.findBy({ status }, options);
    }

    /**
     * Get workflows by type
     */
    async getByType(type, options = {}) {
        return this.findBy({ type }, options);
    }

    /**
     * Get workflows created by user
     */
    async getByCreator(userId, options = {}) {
        return this.findBy({ created_by: userId }, options);
    }

    /**
     * Get active workflows
     */
    async getActiveWorkflows(options = {}) {
        return this.findBy({ status: 'active' }, options);
    }

    /**
     * Update workflow status
     */
    async updateStatus(id, status, additionalData = {}) {
        const updateData = { status, ...additionalData };
        
        // Set timestamps based on status
        if (status === 'active' && !additionalData.started_at) {
            updateData.started_at = new Date().toISOString();
        } else if (['completed', 'failed', 'cancelled'].includes(status) && !additionalData.completed_at) {
            updateData.completed_at = new Date().toISOString();
        }

        return this.updateById(id, updateData);
    }

    /**
     * Get workflow with tasks
     */
    async getWithTasks(id) {
        const query = `
            SELECT 
                w.*,
                json_agg(
                    json_build_object(
                        'id', t.id,
                        'name', t.name,
                        'type', t.type,
                        'status', t.status,
                        'priority', t.priority,
                        'execution_order', t.execution_order,
                        'depends_on', t.depends_on,
                        'created_at', t.created_at,
                        'started_at', t.started_at,
                        'completed_at', t.completed_at
                    ) ORDER BY t.execution_order
                ) as tasks
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            WHERE w.id = $1
            GROUP BY w.id
        `;

        const result = await this.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Get workflow progress
     */
    async getProgress(id) {
        const query = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN t.status = 'running' THEN 1 END) as running_tasks,
                COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
                CASE 
                    WHEN COUNT(*) = 0 THEN 0
                    ELSE ROUND((COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
                END as progress_percentage
            FROM tasks t
            WHERE t.workflow_id = $1
        `;

        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Get workflow statistics
     */
    async getStatistics(filters = {}) {
        let whereClause = '';
        const params = [];

        if (filters.created_after) {
            params.push(filters.created_after);
            whereClause += ` WHERE created_at >= $${params.length}`;
        }

        const query = `
            SELECT 
                COUNT(*) as total_workflows,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_workflows,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_workflows,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_workflows,
                COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_workflows,
                AVG(CASE 
                    WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at))
                END) as avg_duration_seconds
            FROM workflows
            ${whereClause}
        `;

        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Search workflows
     */
    async search(searchTerm, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const query = `
            SELECT *
            FROM workflows
            WHERE 
                name ILIKE $1 
                OR description ILIKE $1
                OR tags && ARRAY[$2]
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        `;

        const searchPattern = `%${searchTerm}%`;
        const result = await this.query(query, [searchPattern, searchTerm, limit, offset]);
        return result.rows;
    }

    /**
     * Get workflows by priority
     */
    async getByPriority(minPriority = 0, options = {}) {
        const query = `
            SELECT *
            FROM workflows
            WHERE priority >= $1
            ORDER BY priority DESC, created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const { limit = 50, offset = 0 } = options;
        const result = await this.query(query, [minPriority, limit, offset]);
        return result.rows;
    }

    /**
     * Get child workflows
     */
    async getChildWorkflows(parentId, options = {}) {
        return this.findBy({ parent_workflow_id: parentId }, options);
    }

    /**
     * Clone a workflow
     */
    async cloneWorkflow(id, newName, createdBy) {
        const original = await this.findById(id);
        if (!original) {
            throw new Error('Workflow not found');
        }

        const clonedData = {
            name: newName || `${original.name} (Copy)`,
            description: original.description,
            type: original.type,
            status: 'draft',
            priority: original.priority,
            definition: original.definition,
            configuration: original.configuration,
            environment_variables: original.environment_variables,
            tags: original.tags,
            metadata: original.metadata,
            created_by: createdBy,
            timeout_seconds: original.timeout_seconds
        };

        return this.create(clonedData);
    }
}

