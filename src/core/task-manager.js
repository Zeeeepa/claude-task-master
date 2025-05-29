import { getConnection } from '../database/connection/connection_manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Comprehensive task management system for AI-powered CI/CD orchestration
 */
export class TaskManager {
    constructor() {
        this.db = null;
    }

    async initialize() {
        this.db = getConnection();
        console.log('✅ Task Manager initialized');
    }

    /**
     * Parse PRD and generate tasks using AI
     */
    async parsePRD(filePath, projectId, options = {}) {
        try {
            console.log(`🔄 Parsing PRD: ${filePath}`);
            
            // Read PRD file
            const fs = await import('fs/promises');
            const prdContent = await fs.readFile(filePath, 'utf8');
            
            // Get project context
            const project = await this.getProject(projectId);
            if (!project) {
                throw new Error(`Project not found: ${projectId}`);
            }

            // Generate tasks using AI (placeholder for now)
            const tasks = await this._generateTasksFromPRD(prdContent, project, options);
            
            // Store tasks in database
            const createdTasks = [];
            for (const taskData of tasks) {
                const task = await this.createTask(projectId, taskData);
                createdTasks.push(task);
            }

            console.log(`✅ Generated ${createdTasks.length} tasks from PRD`);
            return createdTasks;
        } catch (error) {
            console.error('❌ Failed to parse PRD:', error);
            throw error;
        }
    }

    /**
     * List tasks with filtering and pagination
     */
    async listTasks(projectId, options = {}) {
        const {
            status,
            type,
            assignee,
            priority,
            parentTaskId,
            limit = 50,
            offset = 0,
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = options;

        let query = `
            SELECT 
                t.*,
                p.name as project_name,
                parent.title as parent_task_title,
                (
                    SELECT COUNT(*) 
                    FROM tasks child 
                    WHERE child.parent_task_id = t.id
                ) as subtask_count
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            LEFT JOIN tasks parent ON t.parent_task_id = parent.id
            WHERE t.project_id = $1
        `;

        const params = [projectId];
        let paramIndex = 2;

        if (status) {
            query += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (type) {
            query += ` AND t.type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        if (assignee) {
            query += ` AND t.assignee = $${paramIndex}`;
            params.push(assignee);
            paramIndex++;
        }

        if (priority) {
            query += ` AND t.priority = $${paramIndex}`;
            params.push(priority);
            paramIndex++;
        }

        if (parentTaskId) {
            query += ` AND t.parent_task_id = $${paramIndex}`;
            params.push(parentTaskId);
            paramIndex++;
        }

        query += ` ORDER BY t.${sortBy} ${sortOrder}`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await this.db.query(query, params);
        return result.rows;
    }

    /**
     * Get the next task to work on based on priority and dependencies
     */
    async getNextTask(projectId, assignee = null) {
        let query = `
            WITH available_tasks AS (
                SELECT t.*
                FROM tasks t
                WHERE t.project_id = $1
                AND t.status = 'pending'
                AND (
                    t.parent_task_id IS NULL 
                    OR EXISTS (
                        SELECT 1 FROM tasks parent 
                        WHERE parent.id = t.parent_task_id 
                        AND parent.status = 'completed'
                    )
                )
                AND NOT EXISTS (
                    SELECT 1 FROM tasks dep
                    WHERE dep.id = ANY(
                        SELECT jsonb_array_elements_text(t.dependencies)::uuid
                    )
                    AND dep.status != 'completed'
                )
        `;

        const params = [projectId];
        let paramIndex = 2;

        if (assignee) {
            query += ` AND (t.assignee IS NULL OR t.assignee = $${paramIndex})`;
            params.push(assignee);
            paramIndex++;
        }

        query += `
            )
            SELECT * FROM available_tasks
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
        `;

        const result = await this.db.query(query, params);
        return result.rows[0] || null;
    }

    /**
     * Create a new task
     */
    async createTask(projectId, taskData) {
        const {
            title,
            description,
            type = 'feature',
            priority = 3,
            assignee,
            parentTaskId,
            dependencies = [],
            metadata = {},
            estimatedHours,
            dueDate
        } = taskData;

        const id = uuidv4();
        
        const result = await this.db.query(`
            INSERT INTO tasks (
                id, project_id, title, description, type, priority, 
                assignee, parent_task_id, dependencies, metadata, 
                estimated_hours, due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            id, projectId, title, description, type, priority,
            assignee, parentTaskId, JSON.stringify(dependencies), 
            JSON.stringify(metadata), estimatedHours, dueDate
        ]);

        console.log(`✅ Created task: ${title}`);
        return result.rows[0];
    }

    /**
     * Update task status and metadata
     */
    async updateTask(taskId, updates) {
        const allowedFields = [
            'title', 'description', 'status', 'priority', 'assignee',
            'dependencies', 'metadata', 'estimated_hours', 'actual_hours', 'due_date'
        ];

        const setClause = [];
        const params = [];
        let paramIndex = 1;

        for (const [field, value] of Object.entries(updates)) {
            if (allowedFields.includes(field)) {
                setClause.push(`${field} = $${paramIndex}`);
                
                if (field === 'dependencies' || field === 'metadata') {
                    params.push(JSON.stringify(value));
                } else {
                    params.push(value);
                }
                paramIndex++;
            }
        }

        if (updates.status === 'completed') {
            setClause.push(`completed_at = NOW()`);
        }

        if (setClause.length === 0) {
            throw new Error('No valid fields to update');
        }

        params.push(taskId);
        
        const result = await this.db.query(`
            UPDATE tasks 
            SET ${setClause.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);

        if (result.rows.length === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }

        console.log(`✅ Updated task: ${taskId}`);
        return result.rows[0];
    }

    /**
     * Get task by ID with full context
     */
    async getTask(taskId) {
        const result = await this.db.query(`
            SELECT 
                t.*,
                p.name as project_name,
                p.repository_url,
                parent.title as parent_task_title,
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', child.id,
                            'title', child.title,
                            'status', child.status,
                            'priority', child.priority
                        )
                    )
                    FROM tasks child 
                    WHERE child.parent_task_id = t.id
                ) as subtasks,
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', dep.id,
                            'title', dep.title,
                            'status', dep.status
                        )
                    )
                    FROM tasks dep
                    WHERE dep.id = ANY(
                        SELECT jsonb_array_elements_text(t.dependencies)::uuid
                    )
                ) as dependency_tasks
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            LEFT JOIN tasks parent ON t.parent_task_id = parent.id
            WHERE t.id = $1
        `, [taskId]);

        return result.rows[0] || null;
    }

    /**
     * Get project by ID
     */
    async getProject(projectId) {
        const result = await this.db.query(`
            SELECT * FROM projects WHERE id = $1
        `, [projectId]);

        return result.rows[0] || null;
    }

    /**
     * Create a new project
     */
    async createProject(projectData) {
        const {
            name,
            description,
            repositoryUrl,
            repositoryOwner,
            repositoryName,
            defaultBranch = 'main',
            webhookSecret,
            agentapiConfig = {},
            claudeCodeConfig = {}
        } = projectData;

        const id = uuidv4();
        
        const result = await this.db.query(`
            INSERT INTO projects (
                id, name, description, repository_url, repository_owner,
                repository_name, default_branch, webhook_secret,
                agentapi_config, claude_code_config
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            id, name, description, repositoryUrl, repositoryOwner,
            repositoryName, defaultBranch, webhookSecret,
            JSON.stringify(agentapiConfig), JSON.stringify(claudeCodeConfig)
        ]);

        console.log(`✅ Created project: ${name}`);
        return result.rows[0];
    }

    /**
     * Get task statistics for a project
     */
    async getTaskStatistics(projectId) {
        const result = await this.db.query(`
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
                COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks,
                AVG(priority) as average_priority,
                SUM(estimated_hours) as total_estimated_hours,
                SUM(actual_hours) as total_actual_hours
            FROM tasks
            WHERE project_id = $1
        `, [projectId]);

        return result.rows[0];
    }

    // Private methods
    async _generateTasksFromPRD(prdContent, project, options) {
        // This is a placeholder for AI-powered task generation
        // In a real implementation, this would use the AI providers
        // to analyze the PRD and generate structured tasks
        
        console.log('🤖 Generating tasks from PRD using AI...');
        
        // For now, return a sample task structure
        // This would be replaced with actual AI integration
        return [
            {
                title: 'Setup project infrastructure',
                description: 'Initialize project structure and basic configuration',
                type: 'setup',
                priority: 5,
                estimatedHours: 4
            },
            {
                title: 'Implement core features',
                description: 'Develop main functionality as described in PRD',
                type: 'feature',
                priority: 4,
                estimatedHours: 16
            },
            {
                title: 'Add comprehensive testing',
                description: 'Create unit tests, integration tests, and e2e tests',
                type: 'testing',
                priority: 3,
                estimatedHours: 8
            },
            {
                title: 'Documentation and deployment',
                description: 'Create documentation and setup deployment pipeline',
                type: 'documentation',
                priority: 2,
                estimatedHours: 6
            }
        ];
    }
}

