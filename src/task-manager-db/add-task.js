/**
 * @fileoverview Database-enabled Add Task Component
 * @description Enhanced task creation with database persistence and advanced features
 * @version 2.0.0 - Database Migration
 */

import { TaskModel } from '../database/models/task.js';
import { SubtaskModel } from '../database/models/subtask.js';
import { DependencyModel } from '../database/models/dependency.js';
import { DatabaseConnectionManager } from '../database/connection/connection_manager.js';
import { z } from 'zod';

// Define Zod schema for task validation
const TaskDataSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    requirements: z.record(z.any()).optional(),
    dependencies: z.array(z.string().uuid()).optional(),
    context: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['pending', 'in_progress', 'validation', 'completed', 'failed', 'cancelled']).optional(),
    priority: z.number().int().min(0).max(10).optional(),
    projectId: z.string().uuid().optional(),
    assignedAgent: z.enum(['codegen', 'claude_code', 'webhook_orchestrator', 'task_manager']).optional(),
    estimatedDuration: z.string().optional(), // PostgreSQL interval format
    dueDate: z.string().datetime().optional(),
    createdBy: z.string().optional(),
    subtasks: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        requirements: z.record(z.any()).optional()
    })).optional()
});

/**
 * Add a new task with database persistence
 * @param {Object} taskData - Task data
 * @param {Object} options - Options for task creation
 * @returns {Promise<Object>} Created task with metadata
 */
export async function addTask(taskData, options = {}) {
    // Validate input
    const validation = TaskDataSchema.safeParse(taskData);
    if (!validation.success) {
        throw new Error(`Invalid task data: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }

    const validatedData = validation.data;
    const db = new DatabaseConnectionManager();
    await db.connect();

    // Begin transaction for atomic task creation
    return await db.transaction(async (client) => {
        // Calculate complexity score
        const complexityScore = await calculateComplexity(validatedData);
        
        // Create main task
        const task = await TaskModel.create(client, {
            title: validatedData.title,
            description: validatedData.description,
            requirements: validatedData.requirements || {},
            dependencies: validatedData.dependencies || [],
            context: validatedData.context || {},
            tags: validatedData.tags || [],
            status: validatedData.status || 'pending',
            priority: validatedData.priority || 0,
            project_id: validatedData.projectId,
            assigned_agent: validatedData.assignedAgent,
            estimated_duration: validatedData.estimatedDuration,
            due_date: validatedData.dueDate,
            created_by: validatedData.createdBy || 'system'
        });

        // Create subtasks if provided
        if (validatedData.subtasks && validatedData.subtasks.length > 0) {
            for (let i = 0; i < validatedData.subtasks.length; i++) {
                const subtaskData = {
                    ...validatedData.subtasks[i],
                    parent_task_id: task.id,
                    status: 'pending',
                    project_id: validatedData.projectId,
                    created_by: validatedData.createdBy || 'system'
                };
                
                const subtask = await TaskModel.create(client, subtaskData);
                await SubtaskModel.create(client, task.id, subtask.id, i);
            }
        }

        // Create dependencies if provided
        if (validatedData.dependencies && validatedData.dependencies.length > 0) {
            for (const depId of validatedData.dependencies) {
                await DependencyModel.create(client, task.id, depId, 'blocks');
            }
        }

        // Log task creation event
        await logTaskEvent(client, task.id, 'created', {
            createdBy: validatedData.createdBy,
            initialData: validatedData,
            complexityScore
        });

        return {
            ...task,
            complexityScore,
            subtaskCount: validatedData.subtasks?.length || 0,
            dependencyCount: validatedData.dependencies?.length || 0
        };
    });
}

/**
 * Enhanced complexity calculation with ML insights
 */
async function calculateComplexity(taskData) {
    const factors = {
        descriptionLength: taskData.description?.length || 0,
        requirementsCount: Object.keys(taskData.requirements || {}).length,
        subtaskCount: taskData.subtasks?.length || 0,
        dependencyCount: taskData.dependencies?.length || 0
    };

    // Base complexity calculation
    let complexity = Math.min(10, Math.max(1, 
        Math.ceil((factors.descriptionLength / 100) + 
                 (factors.requirementsCount * 0.5) + 
                 (factors.subtaskCount * 0.3) + 
                 (factors.dependencyCount * 0.2))
    ));

    // AI-enhanced complexity estimation
    if (taskData.description) {
        try {
            const aiComplexity = await estimateComplexityWithAI(taskData.description);
            complexity = Math.round((complexity + aiComplexity) / 2);
        } catch (error) {
            console.warn('AI complexity estimation failed:', error.message);
        }
    }

    return complexity;
}

/**
 * AI-powered complexity estimation (placeholder for ML integration)
 */
async function estimateComplexityWithAI(description) {
    // This would integrate with an AI service for complexity analysis
    // For now, return a simple heuristic based on keywords
    const complexKeywords = ['algorithm', 'optimization', 'integration', 'architecture', 'refactor'];
    const simpleKeywords = ['fix', 'update', 'add', 'remove', 'change'];
    
    const text = description.toLowerCase();
    let score = 5; // Base score
    
    for (const keyword of complexKeywords) {
        if (text.includes(keyword)) score += 1;
    }
    
    for (const keyword of simpleKeywords) {
        if (text.includes(keyword)) score -= 0.5;
    }
    
    return Math.min(10, Math.max(1, Math.round(score)));
}

/**
 * Log task events for audit trail
 */
async function logTaskEvent(client, taskId, eventType, eventData) {
    const query = `
        INSERT INTO task_events (task_id, event_type, event_data, created_at)
        VALUES ($1, $2, $3, NOW())
    `;
    
    try {
        await client.query(query, [taskId, eventType, JSON.stringify(eventData)]);
    } catch (error) {
        console.warn('Failed to log task event:', error.message);
        // Don't fail the main operation if logging fails
    }
}

export default addTask;

