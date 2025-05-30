/**
 * DatabaseManager.js
 * Database connection and query layer for the Unified CI/CD Orchestration System
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

class DatabaseManager {
    constructor(connectionString) {
        this.pool = new Pool({ 
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        
        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }

    /**
     * Execute a query with parameters
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async query(query, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(query, params);
            return result;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Function containing queries to execute in transaction
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================
    // PROJECT MANAGEMENT OPERATIONS
    // =====================================================

    /**
     * Create a new project
     * @param {Object} projectData - Project data
     * @returns {Promise<Object>} Created project
     */
    async createProject(projectData) {
        const query = `
            INSERT INTO projects (name, description, repository_url, github_repo_id, 
                                linear_team_id, status, settings)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [
            projectData.name,
            projectData.description,
            projectData.repository_url,
            projectData.github_repo_id,
            projectData.linear_team_id,
            projectData.status || 'active',
            JSON.stringify(projectData.settings || {})
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Get project by ID
     * @param {string} projectId - Project UUID
     * @returns {Promise<Object>} Project data
     */
    async getProject(projectId) {
        const query = 'SELECT * FROM projects WHERE id = $1';
        const result = await this.query(query, [projectId]);
        return result.rows[0];
    }

    /**
     * Update project
     * @param {string} projectId - Project UUID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Updated project
     */
    async updateProject(projectId, updateData) {
        const setClause = Object.keys(updateData)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        
        const query = `
            UPDATE projects 
            SET ${setClause}
            WHERE id = $1
            RETURNING *
        `;
        const values = [projectId, ...Object.values(updateData)];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // =====================================================
    // WORKFLOW MANAGEMENT OPERATIONS
    // =====================================================

    /**
     * Create a new workflow
     * @param {Object} workflowData - Workflow data
     * @returns {Promise<Object>} Created workflow
     */
    async createWorkflow(workflowData) {
        const query = `
            INSERT INTO workflows (project_id, name, description, requirements, 
                                 current_phase, status, progress, metrics, errors)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            workflowData.project_id,
            workflowData.name,
            workflowData.description,
            workflowData.requirements,
            workflowData.current_phase || 'initiation',
            workflowData.status || 'pending',
            JSON.stringify(workflowData.progress || {"completed": 0, "total": 0, "percentage": 0}),
            JSON.stringify(workflowData.metrics || {}),
            JSON.stringify(workflowData.errors || [])
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Get workflow by ID
     * @param {string} workflowId - Workflow UUID
     * @returns {Promise<Object>} Workflow data
     */
    async getWorkflow(workflowId) {
        const query = `
            SELECT w.*, p.name as project_name 
            FROM workflows w
            LEFT JOIN projects p ON w.project_id = p.id
            WHERE w.id = $1
        `;
        const result = await this.query(query, [workflowId]);
        return result.rows[0];
    }

    /**
     * Update workflow status and progress
     * @param {string} workflowId - Workflow UUID
     * @param {string} status - New status
     * @param {Object} progress - Progress data
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Updated workflow
     */
    async updateWorkflowStatus(workflowId, status, progress = null, metadata = {}) {
        let query = `
            UPDATE workflows 
            SET status = $2, updated_at = NOW()
        `;
        let values = [workflowId, status];
        let paramIndex = 3;

        if (progress) {
            query += `, progress = $${paramIndex}`;
            values.push(JSON.stringify(progress));
            paramIndex++;
        }

        if (Object.keys(metadata).length > 0) {
            query += `, metrics = metrics || $${paramIndex}`;
            values.push(JSON.stringify(metadata));
        }

        query += ` WHERE id = $1 RETURNING *`;
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // =====================================================
    // TASK MANAGEMENT OPERATIONS
    // =====================================================

    /**
     * Create a new task
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Created task
     */
    async createTask(taskData) {
        const query = `
            INSERT INTO tasks (workflow_id, parent_task_id, title, description, 
                             requirements, acceptance_criteria, dependencies, 
                             priority, estimated_effort, assigned_component, 
                             assigned_user_id, status, linear_issue_id, 
                             github_pr_number, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `;
        const values = [
            taskData.workflow_id,
            taskData.parent_task_id,
            taskData.title,
            taskData.description,
            JSON.stringify(taskData.requirements || []),
            JSON.stringify(taskData.acceptance_criteria || []),
            JSON.stringify(taskData.dependencies || []),
            taskData.priority || 5,
            taskData.estimated_effort,
            taskData.assigned_component,
            taskData.assigned_user_id,
            taskData.status || 'pending',
            taskData.linear_issue_id,
            taskData.github_pr_number,
            JSON.stringify(taskData.metadata || {})
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Get task by ID
     * @param {string} taskId - Task UUID
     * @returns {Promise<Object>} Task data
     */
    async getTask(taskId) {
        const query = `
            SELECT t.*, w.name as workflow_name, p.name as project_name
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN projects p ON w.project_id = p.id
            WHERE t.id = $1
        `;
        const result = await this.query(query, [taskId]);
        return result.rows[0];
    }

    /**
     * Update task status
     * @param {string} taskId - Task UUID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Updated task
     */
    async updateTaskStatus(taskId, status, metadata = {}) {
        const query = `
            UPDATE tasks 
            SET status = $2, metadata = metadata || $3, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const result = await this.query(query, [taskId, status, JSON.stringify(metadata)]);
        return result.rows[0];
    }

    /**
     * Get tasks by workflow
     * @param {string} workflowId - Workflow UUID
     * @param {string} status - Optional status filter
     * @returns {Promise<Array>} Array of tasks
     */
    async getTasksByWorkflow(workflowId, status = null) {
        let query = `
            SELECT t.*, w.name as workflow_name 
            FROM tasks t 
            JOIN workflows w ON t.workflow_id = w.id 
            WHERE t.workflow_id = $1
        `;
        const values = [workflowId];
        
        if (status) {
            query += ` AND t.status = $2`;
            values.push(status);
        }
        
        query += ` ORDER BY t.priority DESC, t.created_at ASC`;
        const result = await this.query(query, values);
        return result.rows;
    }

    /**
     * Create task dependency
     * @param {string} taskId - Task UUID
     * @param {string} dependsOnTaskId - Dependency task UUID
     * @param {string} dependencyType - Type of dependency
     * @returns {Promise<Object>} Created dependency
     */
    async createTaskDependency(taskId, dependsOnTaskId, dependencyType = 'blocks') {
        const query = `
            INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (task_id, depends_on_task_id, dependency_type) DO NOTHING
            RETURNING *
        `;
        const result = await this.query(query, [taskId, dependsOnTaskId, dependencyType]);
        return result.rows[0];
    }

    // =====================================================
    // COMPONENT MANAGEMENT OPERATIONS
    // =====================================================

    /**
     * Register a component
     * @param {Object} componentData - Component data
     * @returns {Promise<Object>} Registered component
     */
    async registerComponent(componentData) {
        const query = `
            INSERT INTO components (name, type, version, api_endpoint, status, 
                                  health_check_url, configuration, capabilities)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (name) DO UPDATE SET
                type = EXCLUDED.type,
                version = EXCLUDED.version,
                api_endpoint = EXCLUDED.api_endpoint,
                status = EXCLUDED.status,
                health_check_url = EXCLUDED.health_check_url,
                configuration = EXCLUDED.configuration,
                capabilities = EXCLUDED.capabilities,
                updated_at = NOW()
            RETURNING *
        `;
        const values = [
            componentData.name,
            componentData.type,
            componentData.version,
            componentData.api_endpoint,
            componentData.status || 'active',
            componentData.health_check_url,
            JSON.stringify(componentData.configuration || {}),
            JSON.stringify(componentData.capabilities || [])
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Update component health status
     * @param {string} componentName - Component name
     * @param {string} healthStatus - Health status
     * @returns {Promise<Object>} Updated component
     */
    async updateComponentHealth(componentName, healthStatus) {
        const query = `
            UPDATE components 
            SET health_status = $2, last_health_check = NOW(), updated_at = NOW()
            WHERE name = $1
            RETURNING *
        `;
        const result = await this.query(query, [componentName, healthStatus]);
        return result.rows[0];
    }

    // =====================================================
    // EVENT AND COMMUNICATION OPERATIONS
    // =====================================================

    /**
     * Log an event
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Logged event
     */
    async logEvent(eventData) {
        const query = `
            INSERT INTO events (event_type, source_component, target_component,
                              workflow_id, task_id, payload, metadata, 
                              correlation_id, trace_id, severity)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        const values = [
            eventData.event_type,
            eventData.source_component,
            eventData.target_component,
            eventData.workflow_id,
            eventData.task_id,
            JSON.stringify(eventData.payload),
            JSON.stringify(eventData.metadata || {}),
            eventData.correlation_id,
            eventData.trace_id,
            eventData.severity || 'info'
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Record component communication
     * @param {Object} communicationData - Communication data
     * @returns {Promise<Object>} Recorded communication
     */
    async recordCommunication(communicationData) {
        const query = `
            INSERT INTO component_communications (source_component_id, target_component_id,
                                                message_type, payload, status, response,
                                                error_message, retry_count, max_retries)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            communicationData.source_component_id,
            communicationData.target_component_id,
            communicationData.message_type,
            JSON.stringify(communicationData.payload),
            communicationData.status || 'pending',
            JSON.stringify(communicationData.response),
            communicationData.error_message,
            communicationData.retry_count || 0,
            communicationData.max_retries || 3
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // =====================================================
    // PERFORMANCE MONITORING OPERATIONS
    // =====================================================

    /**
     * Record performance metric
     * @param {string} componentName - Component name
     * @param {string} metricName - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     * @param {string} workflowId - Optional workflow ID
     * @param {string} taskId - Optional task ID
     * @param {Object} tags - Optional tags
     * @returns {Promise<Object>} Recorded metric
     */
    async recordMetric(componentName, metricName, value, unit, workflowId = null, taskId = null, tags = {}) {
        const query = `
            INSERT INTO performance_metrics (component_name, metric_name, metric_value,
                                           metric_unit, workflow_id, task_id, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [componentName, metricName, value, unit, workflowId, taskId, JSON.stringify(tags)];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Update system health
     * @param {Object} healthData - Health data
     * @returns {Promise<Object>} Updated health record
     */
    async updateSystemHealth(healthData) {
        const query = `
            INSERT INTO system_health (component_name, status, cpu_usage, memory_usage,
                                     disk_usage, network_latency_ms, response_time_ms,
                                     error_rate, throughput_per_second, active_connections,
                                     queue_size, details, alerts)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (component_name) DO UPDATE SET
                status = EXCLUDED.status,
                cpu_usage = EXCLUDED.cpu_usage,
                memory_usage = EXCLUDED.memory_usage,
                disk_usage = EXCLUDED.disk_usage,
                network_latency_ms = EXCLUDED.network_latency_ms,
                response_time_ms = EXCLUDED.response_time_ms,
                error_rate = EXCLUDED.error_rate,
                throughput_per_second = EXCLUDED.throughput_per_second,
                active_connections = EXCLUDED.active_connections,
                queue_size = EXCLUDED.queue_size,
                details = EXCLUDED.details,
                alerts = EXCLUDED.alerts,
                last_check_at = NOW()
            RETURNING *
        `;
        const values = [
            healthData.component_name,
            healthData.status,
            healthData.cpu_usage,
            healthData.memory_usage,
            healthData.disk_usage,
            healthData.network_latency_ms,
            healthData.response_time_ms,
            healthData.error_rate,
            healthData.throughput_per_second,
            healthData.active_connections,
            healthData.queue_size,
            JSON.stringify(healthData.details || {}),
            JSON.stringify(healthData.alerts || [])
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // =====================================================
    // TEMPLATE OPERATIONS
    // =====================================================

    /**
     * Create or update template
     * @param {Object} templateData - Template data
     * @returns {Promise<Object>} Created/updated template
     */
    async saveTemplate(templateData) {
        const query = `
            INSERT INTO templates (name, type, category, description, template_content,
                                 tags, metadata, version, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (name, type) DO UPDATE SET
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                template_content = EXCLUDED.template_content,
                tags = EXCLUDED.tags,
                metadata = EXCLUDED.metadata,
                version = EXCLUDED.version,
                updated_at = NOW()
            RETURNING *
        `;
        const values = [
            templateData.name,
            templateData.type,
            templateData.category,
            templateData.description,
            JSON.stringify(templateData.template_content),
            JSON.stringify(templateData.tags || []),
            JSON.stringify(templateData.metadata || {}),
            templateData.version || '1.0.0',
            templateData.created_by
        ];
        const result = await this.query(query, values);
        return result.rows[0];
    }

    /**
     * Get template by name and type
     * @param {string} name - Template name
     * @param {string} type - Template type
     * @returns {Promise<Object>} Template data
     */
    async getTemplate(name, type) {
        const query = `
            SELECT * FROM templates 
            WHERE name = $1 AND type = $2 AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await this.query(query, [name, type]);
        return result.rows[0];
    }

    // =====================================================
    // ANALYTICS OPERATIONS
    // =====================================================

    /**
     * Calculate and update workflow analytics
     * @param {string} workflowId - Workflow UUID
     * @returns {Promise<Object>} Updated analytics
     */
    async calculateWorkflowAnalytics(workflowId) {
        const query = `
            WITH task_stats AS (
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'done' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status IN ('failed', 'cancelled') THEN 1 END) as failed_tasks,
                    COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked_tasks,
                    SUM(estimated_effort) as estimated_total,
                    SUM(actual_effort) as actual_total
                FROM tasks 
                WHERE workflow_id = $1
            )
            INSERT INTO workflow_analytics (
                workflow_id, total_tasks, completed_tasks, failed_tasks, blocked_tasks,
                completion_percentage, efficiency_score, calculated_at
            )
            SELECT 
                $1,
                total_tasks,
                completed_tasks,
                failed_tasks,
                blocked_tasks,
                CASE WHEN total_tasks > 0 THEN (completed_tasks::DECIMAL / total_tasks) * 100 ELSE 0 END,
                CASE WHEN estimated_total > 0 AND actual_total > 0 
                     THEN (estimated_total::DECIMAL / actual_total) * 100 
                     ELSE NULL END,
                NOW()
            FROM task_stats
            ON CONFLICT (workflow_id) DO UPDATE SET
                total_tasks = EXCLUDED.total_tasks,
                completed_tasks = EXCLUDED.completed_tasks,
                failed_tasks = EXCLUDED.failed_tasks,
                blocked_tasks = EXCLUDED.blocked_tasks,
                completion_percentage = EXCLUDED.completion_percentage,
                efficiency_score = EXCLUDED.efficiency_score,
                calculated_at = EXCLUDED.calculated_at,
                updated_at = NOW()
            RETURNING *
        `;
        const result = await this.query(query, [workflowId]);
        return result.rows[0];
    }

    // =====================================================
    // UTILITY OPERATIONS
    // =====================================================

    /**
     * Close database connection pool
     */
    async close() {
        await this.pool.end();
    }

    /**
     * Check database connection
     * @returns {Promise<boolean>} Connection status
     */
    async isConnected() {
        try {
            const result = await this.query('SELECT 1');
            return result.rows.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} Database statistics
     */
    async getStats() {
        const queries = [
            'SELECT COUNT(*) as projects FROM projects',
            'SELECT COUNT(*) as workflows FROM workflows',
            'SELECT COUNT(*) as tasks FROM tasks',
            'SELECT COUNT(*) as components FROM components',
            'SELECT COUNT(*) as events FROM events',
            'SELECT COUNT(*) as templates FROM templates'
        ];

        const results = await Promise.all(
            queries.map(query => this.query(query))
        );

        return {
            projects: parseInt(results[0].rows[0].projects),
            workflows: parseInt(results[1].rows[0].workflows),
            tasks: parseInt(results[2].rows[0].tasks),
            components: parseInt(results[3].rows[0].components),
            events: parseInt(results[4].rows[0].events),
            templates: parseInt(results[5].rows[0].templates)
        };
    }
}

export default DatabaseManager;

