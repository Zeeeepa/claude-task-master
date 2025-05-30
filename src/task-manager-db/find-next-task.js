/**
 * @fileoverview Database-enabled Find Next Task Component
 * @description Intelligent task finder with advanced querying and dependency awareness
 * @version 2.0.0 - Database Migration
 */

import { TaskModel } from '../database/models/task.js';
import { DependencyModel } from '../database/models/dependency.js';
import { DatabaseConnectionManager } from '../database/connection/connection_manager.js';

/**
 * Find the next optimal task to work on
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Array of recommended tasks
 */
export async function findNextTask(criteria = {}) {
    const {
        assigneeId,
        projectId,
        maxComplexity = 10,
        preferredTypes = [],
        excludeBlocked = true,
        prioritizeBy = 'priority', // 'priority', 'complexity', 'dependencies', 'deadline'
        limit = 10
    } = criteria;

    const db = new DatabaseConnectionManager();
    await db.connect();

    // Build dynamic query based on criteria
    let query = `
        SELECT t.*, 
               COUNT(d.depends_on_task_id) as dependency_count,
               COUNT(st.id) as subtask_count,
               COALESCE(AVG(h.actual_duration), INTERVAL '0') as avg_completion_time,
               p.name as project_name
        FROM tasks t
        LEFT JOIN task_dependencies d ON t.id = d.task_id
        LEFT JOIN tasks st ON t.id = st.parent_task_id
        LEFT JOIN tasks h ON t.id = h.id AND h.status = 'completed'
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.status IN ('pending', 'ready')
    `;

    const params = [];
    let paramIndex = 1;

    // Add filters
    if (assigneeId) {
        query += ` AND (t.assigned_agent = $${paramIndex} OR t.assigned_agent IS NULL)`;
        params.push(assigneeId);
        paramIndex++;
    }

    if (projectId) {
        query += ` AND t.project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
    }

    if (maxComplexity) {
        query += ` AND (t.context->>'complexity_score')::int <= $${paramIndex}`;
        params.push(maxComplexity);
        paramIndex++;
    }

    if (preferredTypes.length > 0) {
        query += ` AND (t.context->>'type') = ANY($${paramIndex})`;
        params.push(preferredTypes);
        paramIndex++;
    }

    // Exclude blocked tasks
    if (excludeBlocked) {
        query += ` AND NOT EXISTS (
            SELECT 1 FROM task_dependencies td 
            JOIN tasks dt ON td.depends_on_task_id = dt.id 
            WHERE td.task_id = t.id 
              AND td.dependency_type = 'blocks'
              AND dt.status NOT IN ('completed', 'cancelled')
        )`;
    }

    query += ` GROUP BY t.id, p.name`;

    // Add ordering based on prioritization strategy
    switch (prioritizeBy) {
        case 'priority':
            query += ` ORDER BY t.priority DESC, (t.context->>'complexity_score')::int ASC, t.created_at ASC`;
            break;
        case 'complexity':
            query += ` ORDER BY (t.context->>'complexity_score')::int ASC, t.priority DESC, t.created_at ASC`;
            break;
        case 'dependencies':
            query += ` ORDER BY dependency_count ASC, t.priority DESC, t.created_at ASC`;
            break;
        case 'deadline':
            query += ` ORDER BY t.due_date ASC NULLS LAST, t.priority DESC, t.created_at ASC`;
            break;
        default:
            query += ` ORDER BY t.priority DESC, t.created_at ASC`;
    }

    query += ` LIMIT $${paramIndex}`;
    params.push(limit * 2); // Get more to allow for filtering

    const result = await db.query(query, params);
    
    // Enhance results with additional context
    const enhancedTasks = await Promise.all(
        result.rows.slice(0, limit).map(async (task) => {
            const [readinessScore, estimatedEffort, blockers, prerequisites] = await Promise.all([
                calculateReadinessScore(task),
                getEstimatedEffort(task.id),
                getBlockers(task.id),
                getPrerequisites(task.id)
            ]);

            return {
                ...task,
                readinessScore,
                estimatedEffort,
                blockers,
                prerequisites,
                recommendationScore: calculateRecommendationScore(task, criteria)
            };
        })
    );

    // Sort by recommendation score
    enhancedTasks.sort((a, b) => b.recommendationScore - a.recommendationScore);

    return enhancedTasks;
}

/**
 * Calculate task readiness score
 */
async function calculateReadinessScore(task) {
    let score = 100;

    // Reduce score for missing information
    if (!task.description || task.description.length < 50) score -= 20;
    if (!task.requirements || Object.keys(task.requirements).length === 0) score -= 15;
    if (!task.context || Object.keys(task.context).length === 0) score -= 10;

    // Reduce score for dependencies
    const dependencyCount = parseInt(task.dependency_count) || 0;
    score -= dependencyCount * 5;

    // Increase score for clear specifications
    const complexityScore = task.context?.complexity_score;
    if (complexityScore && complexityScore > 0) score += 5;
    if (task.estimated_duration) score += 5;

    return Math.max(0, Math.min(100, score));
}

/**
 * Get estimated effort for task
 */
async function getEstimatedEffort(taskId) {
    const db = new DatabaseConnectionManager();
    await db.connect();

    const query = `
        SELECT AVG(
            EXTRACT(EPOCH FROM actual_duration) / 3600
        ) as avg_hours
        FROM tasks 
        WHERE status = 'completed' 
          AND (context->>'complexity_score')::int = (
              SELECT (context->>'complexity_score')::int 
              FROM tasks 
              WHERE id = $1
          )
          AND actual_duration IS NOT NULL
    `;

    try {
        const result = await db.query(query, [taskId]);
        return result.rows[0]?.avg_hours || null;
    } catch (error) {
        console.warn('Failed to get estimated effort:', error.message);
        return null;
    }
}

/**
 * Get blocking tasks
 */
async function getBlockers(taskId) {
    try {
        const blockingStatus = await DependencyModel.getBlockingStatus(taskId);
        return blockingStatus.blockingTasks;
    } catch (error) {
        console.warn('Failed to get blockers:', error.message);
        return [];
    }
}

/**
 * Get prerequisite tasks
 */
async function getPrerequisites(taskId) {
    try {
        const dependencies = await DependencyModel.getDependencies(taskId);
        return dependencies.filter(dep => dep.dependency_type === 'blocks');
    } catch (error) {
        console.warn('Failed to get prerequisites:', error.message);
        return [];
    }
}

/**
 * Calculate recommendation score based on criteria
 */
function calculateRecommendationScore(task, criteria) {
    let score = 0;

    // Priority weight (0-10 scale, multiply by 10 for significant impact)
    score += (task.priority || 0) * 10;

    // Complexity preference (lower complexity = higher score if not specified)
    const complexity = task.context?.complexity_score || 5;
    if (!criteria.maxComplexity) {
        score += (10 - complexity) * 2;
    }

    // Readiness score weight
    score += (task.readinessScore || 0) * 0.5;

    // Due date urgency
    if (task.due_date) {
        const daysUntilDue = (new Date(task.due_date) - new Date()) / (1000 * 60 * 60 * 24);
        if (daysUntilDue < 1) score += 50; // Critical
        else if (daysUntilDue < 3) score += 30; // Very urgent
        else if (daysUntilDue < 7) score += 20; // Urgent
        else if (daysUntilDue < 30) score += 10; // Soon
    }

    // Dependency count (fewer dependencies = higher score)
    const dependencyCount = parseInt(task.dependency_count) || 0;
    score += Math.max(0, (10 - dependencyCount) * 2);

    // Subtask count (fewer subtasks = easier to start)
    const subtaskCount = parseInt(task.subtask_count) || 0;
    score += Math.max(0, (5 - subtaskCount) * 1);

    return Math.round(score);
}

/**
 * Get tasks ready to start (convenience function)
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of ready tasks
 */
export async function getReadyTasks(filters = {}) {
    return await findNextTask({
        ...filters,
        excludeBlocked: true,
        prioritizeBy: 'priority'
    });
}

/**
 * Get high priority tasks
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of high priority tasks
 */
export async function getHighPriorityTasks(filters = {}) {
    return await findNextTask({
        ...filters,
        prioritizeBy: 'priority',
        limit: 5
    });
}

export default findNextTask;

