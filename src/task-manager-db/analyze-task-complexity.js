/**
 * @fileoverview Database-enabled Task Complexity Analysis Component
 * @description Enhanced complexity analysis with AI insights and database storage
 * @version 2.0.0 - Database Migration
 */

import { TaskModel } from '../database/models/task.js';
import { DependencyModel } from '../database/models/dependency.js';
import { DatabaseConnectionManager } from '../database/connection/connection_manager.js';

/**
 * Analyze task complexity with multiple dimensions
 * @param {string} taskId - Task ID to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Comprehensive complexity analysis
 */
export async function analyzeTaskComplexity(taskId, options = {}) {
    const task = await TaskModel.findById(taskId);
    if (!task) {
        throw new Error(`Task not found: ${taskId}`);
    }

    const analysis = {
        taskId,
        analyzedAt: new Date(),
        complexity: {},
        recommendations: [],
        estimatedEffort: 0,
        riskFactors: []
    };

    // Static complexity analysis
    analysis.complexity.static = await analyzeStaticComplexity(task);
    
    // Dynamic complexity analysis (dependencies, context)
    analysis.complexity.dynamic = await analyzeDynamicComplexity(task);
    
    // AI-powered complexity analysis
    if (options.useAI !== false) {
        analysis.complexity.ai = await analyzeAIComplexity(task);
    }

    // Historical complexity analysis
    analysis.complexity.historical = await analyzeHistoricalComplexity(task);

    // Calculate final complexity score
    analysis.finalComplexity = calculateFinalComplexity(analysis.complexity);
    
    // Generate recommendations
    analysis.recommendations = await generateComplexityRecommendations(analysis);
    
    // Estimate effort in hours
    analysis.estimatedEffort = calculateEffortEstimate(analysis.finalComplexity, task);

    // Identify risk factors
    analysis.riskFactors = identifyRiskFactors(task, analysis);

    // Store analysis in database
    await storeAnalysis(taskId, analysis);

    return analysis;
}

/**
 * Analyze static complexity factors
 */
async function analyzeStaticComplexity(task) {
    return {
        descriptionComplexity: calculateTextComplexity(task.description),
        requirementsComplexity: calculateRequirementsComplexity(task.requirements),
        contextComplexity: calculateContextComplexity(task.context),
        tagsComplexity: calculateTagsComplexity(task.tags),
        subtaskCount: await getSubtaskCount(task.id),
        dependencyCount: await getDependencyCount(task.id)
    };
}

/**
 * Analyze dynamic complexity factors
 */
async function analyzeDynamicComplexity(task) {
    const dependencies = await DependencyModel.getDependencies(task.id);
    const dependents = await DependencyModel.getDependents(task.id);
    const projectContext = await getProjectContext(task.project_id);

    return {
        dependencyComplexity: calculateDependencyComplexity(dependencies),
        impactComplexity: calculateImpactComplexity(dependents),
        projectContextComplexity: calculateProjectContextComplexity(projectContext),
        integrationComplexity: await calculateIntegrationComplexity(task, projectContext)
    };
}

/**
 * AI-powered complexity analysis
 */
async function analyzeAIComplexity(task) {
    // This would integrate with an AI service for advanced analysis
    // For now, implement rule-based analysis with AI-like scoring
    
    const text = (task.description || '') + ' ' + JSON.stringify(task.requirements || {});
    const aiFactors = {
        technicalKeywords: countTechnicalKeywords(text),
        architecturalComplexity: assessArchitecturalComplexity(text),
        integrationComplexity: assessIntegrationComplexity(text),
        algorithmicComplexity: assessAlgorithmicComplexity(text),
        dataComplexity: assessDataComplexity(text)
    };

    const aiScore = Object.values(aiFactors).reduce((sum, score) => sum + score, 0) / Object.keys(aiFactors).length;

    return {
        ...aiFactors,
        aiScore: Math.min(10, Math.max(1, Math.round(aiScore)))
    };
}

/**
 * Historical complexity analysis
 */
async function analyzeHistoricalComplexity(task) {
    const db = new DatabaseConnectionManager();
    await db.connect();

    const query = `
        SELECT 
            AVG((context->>'complexity_score')::int) as avg_complexity,
            AVG(EXTRACT(EPOCH FROM actual_duration) / 3600) as avg_hours,
            COUNT(*) as similar_tasks
        FROM tasks 
        WHERE status = 'completed'
          AND project_id = $1
          AND (
              title ILIKE '%' || $2 || '%' OR
              description ILIKE '%' || $2 || '%' OR
              (context->>'type') = (SELECT context->>'type' FROM tasks WHERE id = $3)
          )
    `;

    try {
        const result = await db.query(query, [task.project_id, task.title.split(' ')[0], task.id]);
        const row = result.rows[0];
        
        return {
            averageComplexity: parseFloat(row.avg_complexity) || 5,
            averageHours: parseFloat(row.avg_hours) || 0,
            similarTasksCount: parseInt(row.similar_tasks) || 0
        };
    } catch (error) {
        console.warn('Failed to analyze historical complexity:', error.message);
        return {
            averageComplexity: 5,
            averageHours: 0,
            similarTasksCount: 0
        };
    }
}

/**
 * Calculate text complexity
 */
function calculateTextComplexity(text) {
    if (!text) return 1;
    
    const length = text.length;
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;
    
    let complexity = 1;
    
    // Length factor
    if (length > 1000) complexity += 3;
    else if (length > 500) complexity += 2;
    else if (length > 200) complexity += 1;
    
    // Sentence complexity
    if (avgWordsPerSentence > 20) complexity += 2;
    else if (avgWordsPerSentence > 15) complexity += 1;
    
    return Math.min(10, complexity);
}

/**
 * Calculate requirements complexity
 */
function calculateRequirementsComplexity(requirements) {
    if (!requirements || typeof requirements !== 'object') return 1;
    
    const reqCount = Object.keys(requirements).length;
    const nestedLevels = getMaxNestedLevel(requirements);
    
    let complexity = 1;
    complexity += Math.min(3, reqCount * 0.5);
    complexity += Math.min(2, nestedLevels);
    
    return Math.min(10, Math.round(complexity));
}

/**
 * Calculate context complexity
 */
function calculateContextComplexity(context) {
    if (!context || typeof context !== 'object') return 1;
    
    const contextSize = JSON.stringify(context).length;
    const keyCount = Object.keys(context).length;
    
    let complexity = 1;
    if (contextSize > 1000) complexity += 2;
    else if (contextSize > 500) complexity += 1;
    
    complexity += Math.min(2, keyCount * 0.3);
    
    return Math.min(10, Math.round(complexity));
}

/**
 * Calculate tags complexity
 */
function calculateTagsComplexity(tags) {
    if (!Array.isArray(tags)) return 1;
    
    const complexTags = ['architecture', 'integration', 'migration', 'refactor', 'optimization'];
    const complexTagCount = tags.filter(tag => 
        complexTags.some(complexTag => tag.toLowerCase().includes(complexTag))
    ).length;
    
    return Math.min(10, 1 + complexTagCount);
}

/**
 * Count technical keywords
 */
function countTechnicalKeywords(text) {
    const keywords = [
        'algorithm', 'optimization', 'performance', 'scalability', 'architecture',
        'integration', 'api', 'database', 'migration', 'refactor', 'framework',
        'security', 'authentication', 'authorization', 'encryption', 'protocol'
    ];
    
    const lowerText = text.toLowerCase();
    const count = keywords.filter(keyword => lowerText.includes(keyword)).length;
    
    return Math.min(10, 1 + count * 0.5);
}

/**
 * Assess architectural complexity
 */
function assessArchitecturalComplexity(text) {
    const archKeywords = ['microservice', 'distributed', 'architecture', 'design pattern', 'system design'];
    const lowerText = text.toLowerCase();
    const matches = archKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    return Math.min(10, 1 + matches * 2);
}

/**
 * Assess integration complexity
 */
function assessIntegrationComplexity(text) {
    const integrationKeywords = ['api', 'integration', 'webhook', 'third-party', 'external'];
    const lowerText = text.toLowerCase();
    const matches = integrationKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    return Math.min(10, 1 + matches * 1.5);
}

/**
 * Assess algorithmic complexity
 */
function assessAlgorithmicComplexity(text) {
    const algoKeywords = ['algorithm', 'optimization', 'sorting', 'search', 'complexity', 'performance'];
    const lowerText = text.toLowerCase();
    const matches = algoKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    return Math.min(10, 1 + matches * 1.5);
}

/**
 * Assess data complexity
 */
function assessDataComplexity(text) {
    const dataKeywords = ['database', 'migration', 'schema', 'query', 'transaction', 'data model'];
    const lowerText = text.toLowerCase();
    const matches = dataKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    return Math.min(10, 1 + matches * 1.5);
}

/**
 * Get maximum nested level in object
 */
function getMaxNestedLevel(obj, currentLevel = 0) {
    if (typeof obj !== 'object' || obj === null) return currentLevel;
    
    let maxLevel = currentLevel;
    for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null) {
            maxLevel = Math.max(maxLevel, getMaxNestedLevel(value, currentLevel + 1));
        }
    }
    
    return maxLevel;
}

/**
 * Get subtask count
 */
async function getSubtaskCount(taskId) {
    try {
        const subtasks = await TaskModel.getSubtasks(taskId);
        return subtasks.length;
    } catch (error) {
        return 0;
    }
}

/**
 * Get dependency count
 */
async function getDependencyCount(taskId) {
    try {
        const dependencies = await DependencyModel.getDependencies(taskId);
        return dependencies.length;
    } catch (error) {
        return 0;
    }
}

/**
 * Calculate dependency complexity
 */
function calculateDependencyComplexity(dependencies) {
    const count = dependencies.length;
    const blockingCount = dependencies.filter(dep => dep.dependency_type === 'blocks').length;
    
    return Math.min(10, 1 + count * 0.5 + blockingCount * 0.5);
}

/**
 * Calculate impact complexity
 */
function calculateImpactComplexity(dependents) {
    const count = dependents.length;
    return Math.min(10, 1 + count * 0.3);
}

/**
 * Get project context
 */
async function getProjectContext(projectId) {
    if (!projectId) return {};
    
    const db = new DatabaseConnectionManager();
    await db.connect();
    
    try {
        const query = `SELECT context FROM projects WHERE id = $1`;
        const result = await db.query(query, [projectId]);
        return result.rows[0]?.context || {};
    } catch (error) {
        return {};
    }
}

/**
 * Calculate project context complexity
 */
function calculateProjectContextComplexity(projectContext) {
    const contextSize = JSON.stringify(projectContext).length;
    return Math.min(10, 1 + contextSize / 1000);
}

/**
 * Calculate integration complexity
 */
async function calculateIntegrationComplexity(task, projectContext) {
    // Analyze integration points based on task and project context
    let complexity = 1;
    
    if (projectContext.integrations) {
        complexity += Object.keys(projectContext.integrations).length * 0.5;
    }
    
    if (task.context?.integrations) {
        complexity += Object.keys(task.context.integrations).length * 0.5;
    }
    
    return Math.min(10, Math.round(complexity));
}

/**
 * Calculate final complexity score
 */
function calculateFinalComplexity(complexityData) {
    const weights = {
        static: 0.3,
        dynamic: 0.3,
        ai: 0.25,
        historical: 0.15
    };
    
    let finalScore = 0;
    let totalWeight = 0;
    
    for (const [type, data] of Object.entries(complexityData)) {
        if (weights[type] && data) {
            let typeScore = 0;
            let typeCount = 0;
            
            for (const value of Object.values(data)) {
                if (typeof value === 'number') {
                    typeScore += value;
                    typeCount++;
                }
            }
            
            if (typeCount > 0) {
                finalScore += (typeScore / typeCount) * weights[type];
                totalWeight += weights[type];
            }
        }
    }
    
    return totalWeight > 0 ? Math.round(finalScore / totalWeight) : 5;
}

/**
 * Generate complexity recommendations
 */
async function generateComplexityRecommendations(analysis) {
    const recommendations = [];
    const complexity = analysis.finalComplexity;
    
    if (complexity >= 8) {
        recommendations.push({
            type: 'high_complexity',
            message: 'Consider breaking this task into smaller subtasks',
            priority: 'high'
        });
    }
    
    if (analysis.complexity.dynamic?.dependencyComplexity >= 7) {
        recommendations.push({
            type: 'dependency_management',
            message: 'Review and optimize task dependencies',
            priority: 'medium'
        });
    }
    
    if (analysis.complexity.static?.descriptionComplexity <= 3) {
        recommendations.push({
            type: 'documentation',
            message: 'Add more detailed description and requirements',
            priority: 'medium'
        });
    }
    
    return recommendations;
}

/**
 * Calculate effort estimate
 */
function calculateEffortEstimate(complexity, task) {
    // Base hours by complexity
    const baseHours = {
        1: 1, 2: 2, 3: 4, 4: 6, 5: 8,
        6: 12, 7: 16, 8: 24, 9: 32, 10: 40
    };
    
    let hours = baseHours[complexity] || 8;
    
    // Adjust based on task type
    const taskType = task.context?.type;
    if (taskType === 'research') hours *= 1.5;
    if (taskType === 'architecture') hours *= 2;
    if (taskType === 'bug_fix') hours *= 0.5;
    
    return Math.round(hours);
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(task, analysis) {
    const risks = [];
    
    if (analysis.finalComplexity >= 8) {
        risks.push({
            type: 'high_complexity',
            level: 'high',
            description: 'Task has high complexity score'
        });
    }
    
    if (!task.description || task.description.length < 50) {
        risks.push({
            type: 'insufficient_documentation',
            level: 'medium',
            description: 'Task lacks detailed description'
        });
    }
    
    if (analysis.complexity.dynamic?.dependencyComplexity >= 6) {
        risks.push({
            type: 'dependency_risk',
            level: 'medium',
            description: 'Task has complex dependency chain'
        });
    }
    
    return risks;
}

/**
 * Store analysis in database
 */
async function storeAnalysis(taskId, analysis) {
    const db = new DatabaseConnectionManager();
    await db.connect();
    
    const query = `
        INSERT INTO task_analysis (task_id, analysis_type, analysis_data, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (task_id, analysis_type) 
        DO UPDATE SET analysis_data = $3, updated_at = NOW()
    `;
    
    try {
        await db.query(query, [taskId, 'complexity', JSON.stringify(analysis)]);
    } catch (error) {
        console.warn('Failed to store complexity analysis:', error.message);
    }
}

export default analyzeTaskComplexity;

