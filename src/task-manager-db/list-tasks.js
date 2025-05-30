/**
 * @fileoverview Database-enabled List Tasks Component
 * @description Advanced task listing with filtering, pagination, and analytics
 * @version 2.0.0 - Database Migration
 */

import { TaskModel } from '../database/models/task.js';
import { SubtaskModel } from '../database/models/subtask.js';
import { DependencyModel } from '../database/models/dependency.js';
import { DatabaseConnectionManager } from '../database/connection/connection_manager.js';

/**
 * List tasks with advanced filtering and analytics
 * @param {Object} options - Listing options
 * @returns {Promise<Object>} Tasks, statistics, and metadata
 */
export async function listTasks(options = {}) {
    const {
        status,
        assignedAgent,
        projectId,
        search,
        tags,
        priority,
        complexityRange,
        dueDateRange,
        orderBy = 'created_at',
        orderDirection = 'DESC',
        limit = 50,
        offset = 0,
        includeSubtasks = false,
        includeDependencies = false,
        includeAnalytics = true
    } = options;

    const criteria = {
        status: Array.isArray(status) ? status : (status ? [status] : undefined),
        assigned_agent: assignedAgent,
        project_id: projectId,
        search,
        order_by: orderBy,
        order_direction: orderDirection,
        limit,
        offset
    };

    // Add priority filter
    if (priority) {
        if (typeof priority === 'object') {
            criteria.priority_min = priority.min;
            criteria.priority_max = priority.max;
        } else {
            criteria.priority_min = priority;
            criteria.priority_max = priority;
        }
    }

    // Get tasks with basic criteria
    const tasks = await TaskModel.findWithCriteria(criteria);

    // Apply additional filters
    let filteredTasks = tasks;

    // Filter by tags
    if (tags && tags.length > 0) {
        filteredTasks = filteredTasks.filter(task => {
            const taskTags = task.tags || [];
            return tags.some(tag => taskTags.includes(tag));
        });
    }

    // Filter by complexity range
    if (complexityRange) {
        filteredTasks = filteredTasks.filter(task => {
            const complexity = task.context?.complexity_score || 0;
            return complexity >= (complexityRange.min || 0) && 
                   complexity <= (complexityRange.max || 10);
        });
    }

    // Filter by due date range
    if (dueDateRange) {
        filteredTasks = filteredTasks.filter(task => {
            if (!task.due_date) return false;
            const dueDate = new Date(task.due_date);
            const start = dueDateRange.start ? new Date(dueDateRange.start) : new Date(0);
            const end = dueDateRange.end ? new Date(dueDateRange.end) : new Date('2099-12-31');
            return dueDate >= start && dueDate <= end;
        });
    }

    // Enhance tasks with additional data
    const enhancedTasks = await Promise.all(
        filteredTasks.map(async (task) => {
            const enhancements = {};

            if (includeSubtasks) {
                enhancements.subtasks = await SubtaskModel.getByParentId(task.id);
                enhancements.subtaskStats = await SubtaskModel.getCompletionStats(task.id);
            }

            if (includeDependencies) {
                enhancements.dependencies = await DependencyModel.getDependencies(task.id);
                enhancements.dependents = await DependencyModel.getDependents(task.id);
                enhancements.blockingStatus = await DependencyModel.getBlockingStatus(task.id);
            }

            return {
                ...task,
                ...enhancements
            };
        })
    );

    // Get statistics if requested
    let statistics = {};
    if (includeAnalytics) {
        statistics = await getTaskStatistics({ project_id: projectId, assigned_agent: assignedAgent });
    }

    // Get dashboard data
    const dashboard = await generateTaskDashboard(enhancedTasks, statistics);

    return {
        tasks: enhancedTasks,
        statistics,
        dashboard,
        pagination: {
            limit,
            offset,
            total: tasks.length,
            hasMore: tasks.length === limit,
            page: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(tasks.length / limit)
        },
        filters: {
            applied: getAppliedFilters(options),
            available: await getAvailableFilters(projectId)
        }
    };
}

/**
 * Get task statistics
 */
async function getTaskStatistics(filters = {}) {
    const baseStats = await TaskModel.getStatistics(filters);
    
    // Get additional analytics
    const db = new DatabaseConnectionManager();
    await db.connect();

    const analyticsQuery = `
        SELECT 
            -- Complexity distribution
            COUNT(CASE WHEN (context->>'complexity_score')::int BETWEEN 1 AND 3 THEN 1 END) as low_complexity,
            COUNT(CASE WHEN (context->>'complexity_score')::int BETWEEN 4 AND 6 THEN 1 END) as medium_complexity,
            COUNT(CASE WHEN (context->>'complexity_score')::int BETWEEN 7 AND 10 THEN 1 END) as high_complexity,
            
            -- Due date analysis
            COUNT(CASE WHEN due_date < NOW() AND status NOT IN ('completed', 'cancelled') THEN 1 END) as overdue_tasks,
            COUNT(CASE WHEN due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' THEN 1 END) as due_this_week,
            
            -- Agent distribution
            COUNT(CASE WHEN assigned_agent = 'codegen' THEN 1 END) as codegen_tasks,
            COUNT(CASE WHEN assigned_agent = 'claude_code' THEN 1 END) as claude_code_tasks,
            COUNT(CASE WHEN assigned_agent IS NULL THEN 1 END) as unassigned_tasks,
            
            -- Performance metrics
            AVG(EXTRACT(EPOCH FROM actual_duration) / 3600) as avg_completion_hours,
            AVG(priority) as avg_priority
        FROM tasks
        WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;
    let whereClause = '';

    if (filters.project_id) {
        whereClause += ` AND project_id = $${paramIndex}`;
        values.push(filters.project_id);
        paramIndex++;
    }

    if (filters.assigned_agent) {
        whereClause += ` AND assigned_agent = $${paramIndex}`;
        values.push(filters.assigned_agent);
        paramIndex++;
    }

    try {
        const result = await db.query(analyticsQuery + whereClause, values);
        const analytics = result.rows[0];

        return {
            ...baseStats,
            complexity: {
                low: parseInt(analytics.low_complexity) || 0,
                medium: parseInt(analytics.medium_complexity) || 0,
                high: parseInt(analytics.high_complexity) || 0
            },
            schedule: {
                overdue: parseInt(analytics.overdue_tasks) || 0,
                dueThisWeek: parseInt(analytics.due_this_week) || 0
            },
            agents: {
                codegen: parseInt(analytics.codegen_tasks) || 0,
                claudeCode: parseInt(analytics.claude_code_tasks) || 0,
                unassigned: parseInt(analytics.unassigned_tasks) || 0
            },
            performance: {
                avgCompletionHours: parseFloat(analytics.avg_completion_hours) || 0,
                avgPriority: parseFloat(analytics.avg_priority) || 0
            }
        };
    } catch (error) {
        console.warn('Failed to get analytics:', error.message);
        return baseStats;
    }
}

/**
 * Generate task dashboard
 */
async function generateTaskDashboard(tasks, statistics) {
    const dashboard = {
        summary: {
            totalTasks: tasks.length,
            completionRate: statistics.completed_tasks / statistics.total_tasks * 100,
            avgPriority: statistics.performance?.avgPriority || 0
        },
        alerts: [],
        insights: [],
        recommendations: []
    };

    // Generate alerts
    if (statistics.schedule?.overdue > 0) {
        dashboard.alerts.push({
            type: 'overdue',
            severity: 'high',
            message: `${statistics.schedule.overdue} tasks are overdue`,
            count: statistics.schedule.overdue
        });
    }

    if (statistics.agents?.unassigned > 5) {
        dashboard.alerts.push({
            type: 'unassigned',
            severity: 'medium',
            message: `${statistics.agents.unassigned} tasks are unassigned`,
            count: statistics.agents.unassigned
        });
    }

    // Generate insights
    const highComplexityRatio = statistics.complexity?.high / statistics.total_tasks;
    if (highComplexityRatio > 0.3) {
        dashboard.insights.push({
            type: 'complexity',
            message: `${Math.round(highComplexityRatio * 100)}% of tasks have high complexity`,
            impact: 'Consider breaking down complex tasks'
        });
    }

    // Generate recommendations
    if (statistics.in_progress_tasks > statistics.pending_tasks * 2) {
        dashboard.recommendations.push({
            type: 'workflow',
            message: 'Consider focusing on completing in-progress tasks before starting new ones',
            priority: 'medium'
        });
    }

    return dashboard;
}

/**
 * Get applied filters
 */
function getAppliedFilters(options) {
    const applied = [];
    
    if (options.status) applied.push({ type: 'status', value: options.status });
    if (options.assignedAgent) applied.push({ type: 'agent', value: options.assignedAgent });
    if (options.projectId) applied.push({ type: 'project', value: options.projectId });
    if (options.search) applied.push({ type: 'search', value: options.search });
    if (options.tags) applied.push({ type: 'tags', value: options.tags });
    if (options.priority) applied.push({ type: 'priority', value: options.priority });
    if (options.complexityRange) applied.push({ type: 'complexity', value: options.complexityRange });
    if (options.dueDateRange) applied.push({ type: 'dueDate', value: options.dueDateRange });
    
    return applied;
}

/**
 * Get available filter options
 */
async function getAvailableFilters(projectId) {
    const db = new DatabaseConnectionManager();
    await db.connect();

    const query = `
        SELECT 
            ARRAY_AGG(DISTINCT status) as statuses,
            ARRAY_AGG(DISTINCT assigned_agent) FILTER (WHERE assigned_agent IS NOT NULL) as agents,
            ARRAY_AGG(DISTINCT tag) FILTER (WHERE tag IS NOT NULL) as tags,
            MIN(priority) as min_priority,
            MAX(priority) as max_priority,
            MIN((context->>'complexity_score')::int) as min_complexity,
            MAX((context->>'complexity_score')::int) as max_complexity
        FROM tasks
        CROSS JOIN LATERAL jsonb_array_elements_text(tags) as tag
        WHERE ($1::uuid IS NULL OR project_id = $1)
    `;

    try {
        const result = await db.query(query, [projectId]);
        const row = result.rows[0];

        return {
            statuses: row.statuses || [],
            agents: row.agents || [],
            tags: row.tags || [],
            priorityRange: {
                min: row.min_priority || 0,
                max: row.max_priority || 10
            },
            complexityRange: {
                min: row.min_complexity || 1,
                max: row.max_complexity || 10
            }
        };
    } catch (error) {
        console.warn('Failed to get available filters:', error.message);
        return {
            statuses: ['pending', 'in_progress', 'validation', 'completed', 'failed', 'cancelled'],
            agents: ['codegen', 'claude_code', 'webhook_orchestrator', 'task_manager'],
            tags: [],
            priorityRange: { min: 0, max: 10 },
            complexityRange: { min: 1, max: 10 }
        };
    }
}

/**
 * Get tasks by status (convenience function)
 * @param {string} status - Task status
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of tasks
 */
export async function getTasksByStatus(status, options = {}) {
    const result = await listTasks({
        ...options,
        status,
        includeAnalytics: false
    });
    return result.tasks;
}

/**
 * Get overdue tasks
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of overdue tasks
 */
export async function getOverdueTasks(options = {}) {
    const result = await listTasks({
        ...options,
        dueDateRange: {
            end: new Date().toISOString()
        },
        status: ['pending', 'in_progress', 'validation'],
        includeAnalytics: false
    });
    return result.tasks;
}

/**
 * Get high priority tasks
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of high priority tasks
 */
export async function getHighPriorityTasks(options = {}) {
    const result = await listTasks({
        ...options,
        priority: { min: 7 },
        orderBy: 'priority',
        orderDirection: 'DESC',
        includeAnalytics: false
    });
    return result.tasks;
}

export default listTasks;

