/**
 * @fileoverview Workflow Data Model
 * @description Data access layer for workflow operations
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Workflow data model for managing workflow states and configurations
 */
export class WorkflowModel {
    constructor(dbManager) {
        this.db = dbManager;
    }

    /**
     * Create a new workflow
     * @param {object} workflowData - Workflow data
     * @returns {Promise<object>} Created workflow
     */
    async create(workflowData) {
        try {
            const query = `
                INSERT INTO workflows (
                    name, status, configuration, state, task_ids, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const values = [
                workflowData.name,
                workflowData.status || 'pending',
                JSON.stringify(workflowData.configuration || {}),
                JSON.stringify(workflowData.state || {}),
                JSON.stringify(workflowData.taskIds || []),
                JSON.stringify(workflowData.metadata || {})
            ];

            const result = await this.db.query(query, values);
            const workflow = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Workflow created: ${workflow.id}`, {
                name: workflow.name,
                status: workflow.status
            });
            
            return workflow;
            
        } catch (error) {
            log('error', '❌ Failed to create workflow', {
                error: error.message,
                name: workflowData.name
            });
            throw error;
        }
    }

    /**
     * Find workflow by ID
     * @param {string} id - Workflow ID
     * @returns {Promise<object|null>} Workflow or null
     */
    async findById(id) {
        try {
            const query = 'SELECT * FROM workflows WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return this.transformRow(result.rows[0]);
            
        } catch (error) {
            log('error', '❌ Failed to find workflow by ID', {
                error: error.message,
                workflowId: id
            });
            throw error;
        }
    }

    /**
     * Find workflow by name
     * @param {string} name - Workflow name
     * @returns {Promise<object|null>} Workflow or null
     */
    async findByName(name) {
        try {
            const query = 'SELECT * FROM workflows WHERE name = $1 ORDER BY created_at DESC LIMIT 1';
            const result = await this.db.query(query, [name]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return this.transformRow(result.rows[0]);
            
        } catch (error) {
            log('error', '❌ Failed to find workflow by name', {
                error: error.message,
                name
            });
            throw error;
        }
    }

    /**
     * Update workflow status
     * @param {string} id - Workflow ID
     * @param {string} status - New status
     * @param {Date} completedAt - Completion timestamp
     * @returns {Promise<object|null>} Updated workflow
     */
    async updateStatus(id, status, completedAt = null) {
        try {
            const query = `
                UPDATE workflows 
                SET status = $1, completed_at = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
            `;
            
            const result = await this.db.query(query, [status, completedAt, id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const workflow = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Workflow status updated: ${id}`, {
                status,
                completedAt
            });
            
            return workflow;
            
        } catch (error) {
            log('error', '❌ Failed to update workflow status', {
                error: error.message,
                workflowId: id,
                status
            });
            throw error;
        }
    }

    /**
     * Update workflow state
     * @param {string} id - Workflow ID
     * @param {object} state - New state
     * @returns {Promise<object|null>} Updated workflow
     */
    async updateState(id, state) {
        try {
            const query = `
                UPDATE workflows 
                SET state = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await this.db.query(query, [JSON.stringify(state), id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const workflow = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Workflow state updated: ${id}`);
            
            return workflow;
            
        } catch (error) {
            log('error', '❌ Failed to update workflow state', {
                error: error.message,
                workflowId: id
            });
            throw error;
        }
    }

    /**
     * Add task to workflow
     * @param {string} id - Workflow ID
     * @param {string} taskId - Task ID to add
     * @returns {Promise<object|null>} Updated workflow
     */
    async addTask(id, taskId) {
        try {
            const query = `
                UPDATE workflows 
                SET task_ids = task_ids || $1::jsonb, updated_at = NOW()
                WHERE id = $2 AND NOT task_ids ? $3
                RETURNING *
            `;
            
            const result = await this.db.query(query, [
                JSON.stringify([taskId]), 
                id, 
                taskId
            ]);
            
            if (result.rows.length === 0) {
                // Task might already be in the workflow or workflow doesn't exist
                const existing = await this.findById(id);
                if (!existing) {
                    return null;
                }
                return existing; // Task already exists in workflow
            }
            
            const workflow = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Task added to workflow: ${taskId} -> ${id}`);
            
            return workflow;
            
        } catch (error) {
            log('error', '❌ Failed to add task to workflow', {
                error: error.message,
                workflowId: id,
                taskId
            });
            throw error;
        }
    }

    /**
     * Remove task from workflow
     * @param {string} id - Workflow ID
     * @param {string} taskId - Task ID to remove
     * @returns {Promise<object|null>} Updated workflow
     */
    async removeTask(id, taskId) {
        try {
            const query = `
                UPDATE workflows 
                SET task_ids = task_ids - $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await this.db.query(query, [taskId, id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const workflow = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Task removed from workflow: ${taskId} <- ${id}`);
            
            return workflow;
            
        } catch (error) {
            log('error', '❌ Failed to remove task from workflow', {
                error: error.message,
                workflowId: id,
                taskId
            });
            throw error;
        }
    }

    /**
     * Find workflows by status
     * @param {string} status - Workflow status
     * @param {number} limit - Maximum number of results
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Array>} Array of workflows
     */
    async findByStatus(status, limit = 100, offset = 0) {
        try {
            const query = `
                SELECT * FROM workflows 
                WHERE status = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            
            const result = await this.db.query(query, [status, limit, offset]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find workflows by status', {
                error: error.message,
                status
            });
            throw error;
        }
    }

    /**
     * Find workflows containing a specific task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of workflows
     */
    async findByTaskId(taskId) {
        try {
            const query = `
                SELECT * FROM workflows 
                WHERE task_ids ? $1
                ORDER BY created_at DESC
            `;
            
            const result = await this.db.query(query, [taskId]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find workflows by task ID', {
                error: error.message,
                taskId
            });
            throw error;
        }
    }

    /**
     * Get workflow progress statistics
     * @param {string} id - Workflow ID
     * @returns {Promise<object>} Progress statistics
     */
    async getProgress(id) {
        try {
            const workflow = await this.findById(id);
            if (!workflow) {
                return null;
            }

            if (workflow.taskIds.length === 0) {
                return {
                    workflowId: id,
                    totalTasks: 0,
                    completedTasks: 0,
                    inProgressTasks: 0,
                    pendingTasks: 0,
                    failedTasks: 0,
                    progressPercentage: 0
                };
            }

            const query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                FROM tasks 
                WHERE id = ANY($1::uuid[])
            `;
            
            const result = await this.db.query(query, [workflow.taskIds]);
            const stats = result.rows[0];
            
            const totalTasks = parseInt(stats.total);
            const completedTasks = parseInt(stats.completed);
            const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
            return {
                workflowId: id,
                totalTasks,
                completedTasks,
                inProgressTasks: parseInt(stats.in_progress),
                pendingTasks: parseInt(stats.pending),
                failedTasks: parseInt(stats.failed),
                progressPercentage
            };
            
        } catch (error) {
            log('error', '❌ Failed to get workflow progress', {
                error: error.message,
                workflowId: id
            });
            throw error;
        }
    }

    /**
     * Get workflow statistics
     * @returns {Promise<object>} Workflow statistics
     */
    async getStatistics() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_workflows,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_workflows,
                    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_workflows,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_workflows,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_workflows,
                    COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused_workflows,
                    AVG(jsonb_array_length(task_ids)) as avg_tasks_per_workflow
                FROM workflows
            `;
            
            const result = await this.db.query(query);
            const stats = result.rows[0];
            
            return {
                totalWorkflows: parseInt(stats.total_workflows),
                pendingWorkflows: parseInt(stats.pending_workflows),
                runningWorkflows: parseInt(stats.running_workflows),
                completedWorkflows: parseInt(stats.completed_workflows),
                failedWorkflows: parseInt(stats.failed_workflows),
                pausedWorkflows: parseInt(stats.paused_workflows),
                avgTasksPerWorkflow: parseFloat(stats.avg_tasks_per_workflow) || 0
            };
            
        } catch (error) {
            log('error', '❌ Failed to get workflow statistics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete workflow by ID
     * @param {string} id - Workflow ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        try {
            const query = 'DELETE FROM workflows WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            const deleted = result.rowCount > 0;
            
            if (deleted) {
                log('debug', `✅ Workflow deleted: ${id}`);
            }
            
            return deleted;
            
        } catch (error) {
            log('error', '❌ Failed to delete workflow', {
                error: error.message,
                workflowId: id
            });
            throw error;
        }
    }

    /**
     * Transform database row to application object
     * @param {object} row - Database row
     * @returns {object} Transformed workflow object
     */
    transformRow(row) {
        return {
            id: row.id,
            name: row.name,
            status: row.status,
            configuration: row.configuration || {},
            state: row.state || {},
            taskIds: row.task_ids || [],
            metadata: row.metadata || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            completedAt: row.completed_at
        };
    }
}

export default WorkflowModel;

