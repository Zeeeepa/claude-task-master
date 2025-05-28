/**
 * Data Access Layer (DAL)
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Provides unified interface for both JSON file and PostgreSQL backends
 * Enables seamless switching between local and remote database modes
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction, getDatabaseConfig } from './database.js';

/**
 * Base Data Access Layer class
 */
class DataAccessLayer {
    constructor() {
        this.config = getDatabaseConfig();
    }

    /**
     * Get the appropriate implementation based on database mode
     */
    getImplementation() {
        return this.config.mode === 'postgres' ? new PostgreSQLDAL() : new LocalFileDAL();
    }
}

/**
 * PostgreSQL Data Access Layer
 */
class PostgreSQLDAL {
    
    // Task operations
    async getTasks(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            whereClause += ` AND status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.priority) {
            whereClause += ` AND priority = $${paramIndex++}`;
            params.push(filters.priority);
        }

        if (filters.parentTaskId) {
            whereClause += ` AND parent_task_id = $${paramIndex++}`;
            params.push(filters.parentTaskId);
        }

        if (filters.search) {
            whereClause += ` AND search_vector @@ plainto_tsquery('english', $${paramIndex++})`;
            params.push(filters.search);
        }

        if (filters.tags && filters.tags.length > 0) {
            whereClause += ` AND tags && $${paramIndex++}`;
            params.push(filters.tags);
        }

        const result = await query(`
            SELECT 
                t.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', td.dependency_task_id,
                            'type', td.dependency_type
                        )
                    ) FILTER (WHERE td.dependency_task_id IS NOT NULL),
                    '[]'
                ) as dependencies
            FROM tasks t
            LEFT JOIN task_dependencies td ON t.id = td.dependent_task_id
            ${whereClause}
            GROUP BY t.id
            ORDER BY t.created_at DESC
            ${filters.limit ? `LIMIT ${parseInt(filters.limit)}` : ''}
            ${filters.offset ? `OFFSET ${parseInt(filters.offset)}` : ''}
        `, params);

        return result.rows.map(this.transformTaskFromDB);
    }

    async getTaskById(id) {
        const result = await query(`
            SELECT 
                t.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', td.dependency_task_id,
                            'type', td.dependency_type
                        )
                    ) FILTER (WHERE td.dependency_task_id IS NOT NULL),
                    '[]'
                ) as dependencies
            FROM tasks t
            LEFT JOIN task_dependencies td ON t.id = td.dependent_task_id
            WHERE t.id = $1 OR t.legacy_id = $2
            GROUP BY t.id
        `, [id, parseInt(id) || null]);

        return result.rows.length > 0 ? this.transformTaskFromDB(result.rows[0]) : null;
    }

    async createTask(taskData) {
        const id = uuidv4();
        const dependencies = taskData.dependencies || [];
        delete taskData.dependencies;

        return await transaction(async (client) => {
            // Insert task
            const result = await client.query(`
                INSERT INTO tasks (
                    id, legacy_id, title, description, details, test_strategy,
                    requirements, implementation_files, status, priority,
                    parent_task_id, linear_issue_id, repository_url,
                    estimated_complexity, actual_complexity, acceptance_criteria,
                    tags, metadata, created_by, updated_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
                ) RETURNING *
            `, [
                id,
                taskData.legacy_id || null,
                taskData.title,
                taskData.description || null,
                taskData.details || null,
                taskData.test_strategy || null,
                taskData.requirements || null,
                taskData.implementation_files || null,
                taskData.status || 'pending',
                taskData.priority || 'medium',
                taskData.parent_task_id || null,
                taskData.linear_issue_id || null,
                taskData.repository_url || null,
                taskData.estimated_complexity || null,
                taskData.actual_complexity || null,
                taskData.acceptance_criteria || null,
                taskData.tags || null,
                taskData.metadata || {},
                taskData.created_by || 'system',
                taskData.updated_by || 'system'
            ]);

            // Insert dependencies
            for (const depId of dependencies) {
                await client.query(`
                    INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
                    VALUES ($1, $2, $3)
                `, [id, depId, taskData.created_by || 'system']);
            }

            return this.transformTaskFromDB({ ...result.rows[0], dependencies });
        });
    }

    async updateTask(id, updates) {
        const dependencies = updates.dependencies;
        delete updates.dependencies;

        return await transaction(async (client) => {
            // Build dynamic update query
            const setClause = [];
            const params = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (key !== 'id' && key !== 'created_at') {
                    setClause.push(`${key} = $${paramIndex++}`);
                    params.push(value);
                }
            }

            if (setClause.length === 0) {
                throw new Error('No valid fields to update');
            }

            setClause.push(`updated_at = NOW()`);
            params.push(id);

            const result = await client.query(`
                UPDATE tasks 
                SET ${setClause.join(', ')}
                WHERE id = $${paramIndex} OR legacy_id = $${paramIndex}
                RETURNING *
            `, params);

            if (result.rows.length === 0) {
                throw new Error(`Task with id ${id} not found`);
            }

            // Update dependencies if provided
            if (dependencies !== undefined) {
                await client.query(`
                    DELETE FROM task_dependencies WHERE dependent_task_id = $1
                `, [result.rows[0].id]);

                for (const depId of dependencies) {
                    await client.query(`
                        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
                        VALUES ($1, $2, $3)
                    `, [result.rows[0].id, depId, updates.updated_by || 'system']);
                }
            }

            return this.transformTaskFromDB(result.rows[0]);
        });
    }

    async deleteTask(id) {
        const result = await query(`
            DELETE FROM tasks 
            WHERE id = $1 OR legacy_id = $2
            RETURNING *
        `, [id, parseInt(id) || null]);

        return result.rows.length > 0;
    }

    // Workflow state operations
    async createWorkflowState(stateData) {
        const result = await query(`
            INSERT INTO workflow_states (
                task_id, pr_id, state, previous_state, state_data,
                triggered_by, trigger_reason, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            stateData.task_id,
            stateData.pr_id || null,
            stateData.state,
            stateData.previous_state || null,
            stateData.state_data || {},
            stateData.triggered_by || 'system',
            stateData.trigger_reason || null,
            stateData.metadata || {}
        ]);

        return result.rows[0];
    }

    async getWorkflowStates(taskId) {
        const result = await query(`
            SELECT * FROM workflow_states 
            WHERE task_id = $1 
            ORDER BY entered_at DESC
        `, [taskId]);

        return result.rows;
    }

    // Error logging operations
    async logError(errorData) {
        const result = await query(`
            INSERT INTO error_logs (
                task_id, pr_id, workflow_state_id, deployment_script_id,
                error_code, error_message, error_details, stack_trace,
                severity, context, retry_count, tags, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            errorData.task_id || null,
            errorData.pr_id || null,
            errorData.workflow_state_id || null,
            errorData.deployment_script_id || null,
            errorData.error_code || null,
            errorData.error_message,
            errorData.error_details || {},
            errorData.stack_trace || null,
            errorData.severity || 'medium',
            errorData.context || {},
            errorData.retry_count || 0,
            errorData.tags || null,
            errorData.metadata || {}
        ]);

        return result.rows[0];
    }

    // PR metadata operations
    async createPRMetadata(prData) {
        const result = await query(`
            INSERT INTO pr_metadata (
                pr_number, repository_url, title, description, status,
                branch_name, base_branch, author, assignees, reviewers,
                labels, commits_count, files_changed, additions, deletions,
                checks_status, review_status, merge_status, auto_merge_enabled,
                draft, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *
        `, [
            prData.pr_number,
            prData.repository_url,
            prData.title,
            prData.description || null,
            prData.status || 'draft',
            prData.branch_name,
            prData.base_branch || 'main',
            prData.author || null,
            prData.assignees || null,
            prData.reviewers || null,
            prData.labels || null,
            prData.commits_count || 0,
            prData.files_changed || 0,
            prData.additions || 0,
            prData.deletions || 0,
            prData.checks_status || null,
            prData.review_status || null,
            prData.merge_status || null,
            prData.auto_merge_enabled || false,
            prData.draft || false,
            prData.metadata || {}
        ]);

        return result.rows[0];
    }

    // Linear sync operations
    async createLinearSync(syncData) {
        const result = await query(`
            INSERT INTO linear_sync (
                task_id, linear_issue_id, linear_team_id, linear_project_id,
                linear_state_id, linear_assignee_id, linear_priority,
                linear_title, linear_description, linear_url, sync_direction,
                sync_status, linear_created_at, linear_updated_at, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            syncData.task_id,
            syncData.linear_issue_id,
            syncData.linear_team_id || null,
            syncData.linear_project_id || null,
            syncData.linear_state_id || null,
            syncData.linear_assignee_id || null,
            syncData.linear_priority || null,
            syncData.linear_title || null,
            syncData.linear_description || null,
            syncData.linear_url || null,
            syncData.sync_direction || 'bidirectional',
            syncData.sync_status || 'synced',
            syncData.linear_created_at || null,
            syncData.linear_updated_at || null,
            syncData.metadata || {}
        ]);

        return result.rows[0];
    }

    // Transform database row to application format
    transformTaskFromDB(row) {
        return {
            id: row.legacy_id || row.id,
            uuid: row.id,
            title: row.title,
            description: row.description,
            details: row.details,
            testStrategy: row.test_strategy,
            status: row.status,
            priority: row.priority,
            dependencies: row.dependencies || [],
            parentTaskId: row.parent_task_id,
            linearIssueId: row.linear_issue_id,
            repositoryUrl: row.repository_url,
            estimatedComplexity: row.estimated_complexity,
            actualComplexity: row.actual_complexity,
            acceptanceCriteria: row.acceptance_criteria,
            tags: row.tags || [],
            requirements: row.requirements,
            implementationFiles: row.implementation_files || [],
            metadata: row.metadata || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            completedAt: row.completed_at,
            createdBy: row.created_by,
            updatedBy: row.updated_by,
            version: row.version
        };
    }
}

/**
 * Local File Data Access Layer
 */
class LocalFileDAL {
    constructor() {
        this.tasksFile = 'tasks/tasks.json';
    }

    async loadTasks() {
        try {
            const data = await fs.readFile(this.tasksFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return { metadata: { version: '1.0.0', created: new Date().toISOString() }, tasks: [] };
            }
            throw error;
        }
    }

    async saveTasks(data) {
        data.metadata.updated = new Date().toISOString();
        await fs.writeFile(this.tasksFile, JSON.stringify(data, null, 2));
    }

    async getTasks(filters = {}) {
        const data = await this.loadTasks();
        let tasks = data.tasks || [];

        // Apply filters
        if (filters.status) {
            tasks = tasks.filter(task => task.status === filters.status);
        }

        if (filters.priority) {
            tasks = tasks.filter(task => task.priority === filters.priority);
        }

        if (filters.parentTaskId) {
            tasks = tasks.filter(task => task.parentTaskId === filters.parentTaskId);
        }

        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            tasks = tasks.filter(task => 
                task.title?.toLowerCase().includes(searchLower) ||
                task.description?.toLowerCase().includes(searchLower) ||
                task.details?.toLowerCase().includes(searchLower)
            );
        }

        if (filters.tags && filters.tags.length > 0) {
            tasks = tasks.filter(task => 
                task.tags && task.tags.some(tag => filters.tags.includes(tag))
            );
        }

        // Apply pagination
        if (filters.offset) {
            tasks = tasks.slice(parseInt(filters.offset));
        }

        if (filters.limit) {
            tasks = tasks.slice(0, parseInt(filters.limit));
        }

        return tasks;
    }

    async getTaskById(id) {
        const data = await this.loadTasks();
        return data.tasks.find(task => task.id === parseInt(id) || task.id === id);
    }

    async createTask(taskData) {
        const data = await this.loadTasks();
        
        // Generate new ID
        const maxId = data.tasks.length > 0 ? Math.max(...data.tasks.map(t => t.id)) : 0;
        const newTask = {
            id: maxId + 1,
            uuid: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            ...taskData
        };

        data.tasks.push(newTask);
        await this.saveTasks(data);
        
        return newTask;
    }

    async updateTask(id, updates) {
        const data = await this.loadTasks();
        const taskIndex = data.tasks.findIndex(task => task.id === parseInt(id) || task.id === id);
        
        if (taskIndex === -1) {
            throw new Error(`Task with id ${id} not found`);
        }

        const currentTask = data.tasks[taskIndex];
        data.tasks[taskIndex] = {
            ...currentTask,
            ...updates,
            id: currentTask.id, // Preserve original ID
            updatedAt: new Date().toISOString(),
            version: (currentTask.version || 1) + 1
        };

        await this.saveTasks(data);
        return data.tasks[taskIndex];
    }

    async deleteTask(id) {
        const data = await this.loadTasks();
        const taskIndex = data.tasks.findIndex(task => task.id === parseInt(id) || task.id === id);
        
        if (taskIndex === -1) {
            return false;
        }

        data.tasks.splice(taskIndex, 1);
        await this.saveTasks(data);
        return true;
    }

    // Stub implementations for PostgreSQL-only features
    async createWorkflowState(stateData) {
        console.warn('Workflow states not supported in local file mode');
        return null;
    }

    async getWorkflowStates(taskId) {
        console.warn('Workflow states not supported in local file mode');
        return [];
    }

    async logError(errorData) {
        console.warn('Error logging not supported in local file mode');
        console.error('Error:', errorData);
        return null;
    }

    async createPRMetadata(prData) {
        console.warn('PR metadata not supported in local file mode');
        return null;
    }

    async createLinearSync(syncData) {
        console.warn('Linear sync not supported in local file mode');
        return null;
    }
}

// Export unified interface
export class TaskDataAccess {
    constructor() {
        this.dal = new DataAccessLayer().getImplementation();
    }

    // Delegate all methods to the appropriate implementation
    async getTasks(filters) { return this.dal.getTasks(filters); }
    async getTaskById(id) { return this.dal.getTaskById(id); }
    async createTask(taskData) { return this.dal.createTask(taskData); }
    async updateTask(id, updates) { return this.dal.updateTask(id, updates); }
    async deleteTask(id) { return this.dal.deleteTask(id); }
    async createWorkflowState(stateData) { return this.dal.createWorkflowState(stateData); }
    async getWorkflowStates(taskId) { return this.dal.getWorkflowStates(taskId); }
    async logError(errorData) { return this.dal.logError(errorData); }
    async createPRMetadata(prData) { return this.dal.createPRMetadata(prData); }
    async createLinearSync(syncData) { return this.dal.createLinearSync(syncData); }
}

export default TaskDataAccess;

