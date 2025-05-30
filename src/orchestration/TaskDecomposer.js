/**
 * @fileoverview Task Decomposer
 * @description Advanced task decomposition with dependency analysis and optimization
 */

import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';

/**
 * Advanced Task Decomposer
 * Handles requirement decomposition into hierarchical tasks with dependency analysis
 */
export class TaskDecomposer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxTasksPerRequirement: config.maxTasksPerRequirement || 15,
            maxSubtasksPerTask: config.maxSubtasksPerTask || 8,
            enableDependencyAnalysis: config.enableDependencyAnalysis !== false,
            enableComplexityEstimation: config.enableComplexityEstimation !== false,
            enablePriorityAssignment: config.enablePriorityAssignment !== false,
            enableTaskOptimization: config.enableTaskOptimization !== false,
            complexityThreshold: config.complexityThreshold || 7,
            dependencyDepthLimit: config.dependencyDepthLimit || 5,
            ...config
        };

        this.taskIdCounter = 1;
        this.isInitialized = false;
    }

    /**
     * Initialize the task decomposer
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Task Decomposer...');
        this.isInitialized = true;
        this.emit('initialized');
        log('info', 'Task Decomposer initialized successfully');
    }

    /**
     * Decompose requirements into hierarchical tasks
     * @param {Object} requirements - Processed requirements object
     * @returns {Promise<Array>} Array of decomposed tasks
     */
    async decomposeRequirements(requirements) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        log('info', 'Starting requirement decomposition...');
        this.emit('decompositionStarted', { requirements });

        try {
            // Step 1: Extract high-level tasks from requirements
            const highLevelTasks = await this._extractHighLevelTasks(requirements);
            
            // Step 2: Decompose each high-level task into subtasks
            const decomposedTasks = await this._decomposeIntoSubtasks(highLevelTasks);
            
            // Step 3: Create task hierarchy
            const taskHierarchy = await this.createTaskHierarchy(decomposedTasks);
            
            // Step 4: Assign priorities
            const prioritizedTasks = await this.assignTaskPriorities(taskHierarchy);
            
            // Step 5: Validate dependencies
            const validatedTasks = await this.validateTaskDependencies(prioritizedTasks);
            
            // Step 6: Optimize task order
            const optimizedTasks = await this.optimizeTaskOrder(validatedTasks);

            log('info', `Successfully decomposed requirements into ${optimizedTasks.length} tasks`);
            this.emit('decompositionCompleted', { tasks: optimizedTasks });

            return optimizedTasks;
        } catch (error) {
            log('error', 'Failed to decompose requirements:', error);
            this.emit('decompositionFailed', { error });
            throw error;
        }
    }

    /**
     * Create task hierarchy from decomposed tasks
     * @param {Array} decomposedTasks - Array of decomposed tasks
     * @returns {Promise<Array>} Hierarchical task structure
     */
    async createTaskHierarchy(decomposedTasks) {
        log('debug', 'Creating task hierarchy...');

        const hierarchy = [];
        const taskMap = new Map();

        // First pass: Create all tasks and map them
        for (const task of decomposedTasks) {
            const hierarchicalTask = {
                id: task.id,
                title: task.title,
                description: task.description,
                type: task.type || 'implementation',
                complexity: task.complexity || 5,
                estimatedHours: task.estimatedHours || 4,
                priority: task.priority || 'medium',
                dependencies: task.dependencies || [],
                subtasks: [],
                parent: null,
                level: 0,
                status: 'pending',
                metadata: {
                    createdAt: new Date(),
                    source: 'decomposer',
                    ...task.metadata
                }
            };

            taskMap.set(task.id, hierarchicalTask);
            hierarchy.push(hierarchicalTask);
        }

        // Second pass: Establish parent-child relationships
        for (const task of hierarchy) {
            if (task.dependencies && task.dependencies.length > 0) {
                for (const depId of task.dependencies) {
                    const parentTask = taskMap.get(depId);
                    if (parentTask && this._isParentChildRelationship(parentTask, task)) {
                        task.parent = parentTask.id;
                        task.level = parentTask.level + 1;
                        parentTask.subtasks.push(task.id);
                    }
                }
            }
        }

        // Third pass: Validate hierarchy depth
        this._validateHierarchyDepth(hierarchy);

        log('debug', `Created task hierarchy with ${hierarchy.length} tasks`);
        return hierarchy;
    }

    /**
     * Assign priorities to tasks based on dependencies and complexity
     * @param {Array} tasks - Array of tasks
     * @returns {Promise<Array>} Tasks with assigned priorities
     */
    async assignTaskPriorities(tasks) {
        if (!this.config.enablePriorityAssignment) {
            return tasks;
        }

        log('debug', 'Assigning task priorities...');

        for (const task of tasks) {
            const priority = this._calculateTaskPriority(task, tasks);
            task.priority = priority;
            task.priorityScore = this._getPriorityScore(priority);
        }

        // Sort tasks by priority score (higher score = higher priority)
        tasks.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

        log('debug', 'Task priorities assigned successfully');
        return tasks;
    }

    /**
     * Validate task dependencies for circular references and consistency
     * @param {Array} tasks - Array of tasks
     * @returns {Promise<Array>} Validated tasks
     */
    async validateTaskDependencies(tasks) {
        if (!this.config.enableDependencyAnalysis) {
            return tasks;
        }

        log('debug', 'Validating task dependencies...');

        const taskMap = new Map(tasks.map(task => [task.id, task]));
        const validationErrors = [];

        for (const task of tasks) {
            // Check for circular dependencies
            const circularDeps = this._detectCircularDependencies(task, taskMap, new Set());
            if (circularDeps.length > 0) {
                validationErrors.push({
                    taskId: task.id,
                    type: 'circular_dependency',
                    dependencies: circularDeps
                });
            }

            // Check for missing dependencies
            const missingDeps = task.dependencies.filter(depId => !taskMap.has(depId));
            if (missingDeps.length > 0) {
                validationErrors.push({
                    taskId: task.id,
                    type: 'missing_dependency',
                    dependencies: missingDeps
                });
            }

            // Check dependency depth
            const depth = this._calculateDependencyDepth(task, taskMap);
            if (depth > this.config.dependencyDepthLimit) {
                validationErrors.push({
                    taskId: task.id,
                    type: 'excessive_depth',
                    depth
                });
            }
        }

        // Fix validation errors
        if (validationErrors.length > 0) {
            log('warn', `Found ${validationErrors.length} dependency validation errors, attempting to fix...`);
            this._fixDependencyErrors(tasks, validationErrors);
        }

        log('debug', 'Task dependencies validated successfully');
        return tasks;
    }

    /**
     * Optimize task order for efficient execution
     * @param {Array} tasks - Array of tasks
     * @returns {Promise<Array>} Optimized task order
     */
    async optimizeTaskOrder(tasks) {
        if (!this.config.enableTaskOptimization) {
            return tasks;
        }

        log('debug', 'Optimizing task order...');

        // Topological sort based on dependencies
        const optimizedTasks = this._topologicalSort(tasks);

        // Apply additional optimizations
        const finalOptimized = this._applyExecutionOptimizations(optimizedTasks);

        log('debug', 'Task order optimized successfully');
        return finalOptimized;
    }

    /**
     * Extract high-level tasks from requirements
     * @private
     */
    async _extractHighLevelTasks(requirements) {
        const tasks = [];
        
        // Extract from technical specifications
        if (requirements.technicalSpecs) {
            for (const spec of requirements.technicalSpecs) {
                tasks.push({
                    id: this._generateTaskId(),
                    title: spec.title || `Implement ${spec.component}`,
                    description: spec.description || spec.details,
                    type: 'implementation',
                    complexity: spec.complexity || 5,
                    estimatedHours: spec.estimatedHours || 4,
                    dependencies: [],
                    source: 'technical_spec',
                    metadata: { spec }
                });
            }
        }

        // Extract from functional requirements
        if (requirements.functionalRequirements) {
            for (const req of requirements.functionalRequirements) {
                tasks.push({
                    id: this._generateTaskId(),
                    title: req.title || `Implement ${req.feature}`,
                    description: req.description,
                    type: 'feature',
                    complexity: req.complexity || 6,
                    estimatedHours: req.estimatedHours || 6,
                    dependencies: [],
                    source: 'functional_requirement',
                    metadata: { requirement: req }
                });
            }
        }

        // Extract from integration points
        if (requirements.integrationPoints) {
            for (const integration of requirements.integrationPoints) {
                tasks.push({
                    id: this._generateTaskId(),
                    title: `Integrate with ${integration.service}`,
                    description: integration.description,
                    type: 'integration',
                    complexity: integration.complexity || 7,
                    estimatedHours: integration.estimatedHours || 8,
                    dependencies: [],
                    source: 'integration_point',
                    metadata: { integration }
                });
            }
        }

        return tasks;
    }

    /**
     * Decompose high-level tasks into subtasks
     * @private
     */
    async _decomposeIntoSubtasks(highLevelTasks) {
        const allTasks = [...highLevelTasks];

        for (const task of highLevelTasks) {
            if (task.complexity >= this.config.complexityThreshold) {
                const subtasks = await this._generateSubtasks(task);
                allTasks.push(...subtasks);
                
                // Update parent task to reference subtasks
                task.subtasks = subtasks.map(st => st.id);
                task.type = 'epic';
            }
        }

        return allTasks;
    }

    /**
     * Generate subtasks for a complex task
     * @private
     */
    async _generateSubtasks(parentTask) {
        const subtasks = [];
        const subtaskTemplates = this._getSubtaskTemplates(parentTask.type);

        for (const template of subtaskTemplates) {
            subtasks.push({
                id: this._generateTaskId(),
                title: template.title.replace('{parent}', parentTask.title),
                description: template.description.replace('{parent}', parentTask.description),
                type: template.type,
                complexity: template.complexity,
                estimatedHours: template.estimatedHours,
                dependencies: [parentTask.id],
                parent: parentTask.id,
                source: 'subtask_generation',
                metadata: { 
                    parentTask: parentTask.id,
                    template: template.name
                }
            });
        }

        return subtasks;
    }

    /**
     * Get subtask templates based on task type
     * @private
     */
    _getSubtaskTemplates(taskType) {
        const templates = {
            implementation: [
                {
                    name: 'design',
                    title: 'Design {parent}',
                    description: 'Create technical design for {parent}',
                    type: 'design',
                    complexity: 3,
                    estimatedHours: 2
                },
                {
                    name: 'code',
                    title: 'Implement {parent}',
                    description: 'Write code for {parent}',
                    type: 'coding',
                    complexity: 5,
                    estimatedHours: 4
                },
                {
                    name: 'test',
                    title: 'Test {parent}',
                    description: 'Create and run tests for {parent}',
                    type: 'testing',
                    complexity: 3,
                    estimatedHours: 2
                }
            ],
            feature: [
                {
                    name: 'analysis',
                    title: 'Analyze {parent}',
                    description: 'Analyze requirements for {parent}',
                    type: 'analysis',
                    complexity: 2,
                    estimatedHours: 1
                },
                {
                    name: 'ui_design',
                    title: 'Design UI for {parent}',
                    description: 'Create user interface design for {parent}',
                    type: 'ui_design',
                    complexity: 4,
                    estimatedHours: 3
                },
                {
                    name: 'backend',
                    title: 'Implement backend for {parent}',
                    description: 'Implement backend logic for {parent}',
                    type: 'backend',
                    complexity: 6,
                    estimatedHours: 5
                },
                {
                    name: 'frontend',
                    title: 'Implement frontend for {parent}',
                    description: 'Implement frontend for {parent}',
                    type: 'frontend',
                    complexity: 5,
                    estimatedHours: 4
                }
            ],
            integration: [
                {
                    name: 'api_analysis',
                    title: 'Analyze API for {parent}',
                    description: 'Analyze external API for {parent}',
                    type: 'analysis',
                    complexity: 3,
                    estimatedHours: 2
                },
                {
                    name: 'adapter',
                    title: 'Create adapter for {parent}',
                    description: 'Create integration adapter for {parent}',
                    type: 'adapter',
                    complexity: 5,
                    estimatedHours: 4
                },
                {
                    name: 'integration_test',
                    title: 'Test {parent}',
                    description: 'Test integration for {parent}',
                    type: 'integration_testing',
                    complexity: 4,
                    estimatedHours: 3
                }
            ]
        };

        return templates[taskType] || templates.implementation;
    }

    /**
     * Calculate task priority based on dependencies and complexity
     * @private
     */
    _calculateTaskPriority(task, allTasks) {
        let score = 0;

        // Base score from complexity
        score += task.complexity * 10;

        // Dependency score (tasks with more dependents get higher priority)
        const dependents = allTasks.filter(t => t.dependencies.includes(task.id));
        score += dependents.length * 20;

        // Parent task bonus
        if (task.type === 'epic') {
            score += 30;
        }

        // Critical path bonus
        if (this._isOnCriticalPath(task, allTasks)) {
            score += 50;
        }

        // Convert score to priority
        if (score >= 100) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    /**
     * Get numeric priority score
     * @private
     */
    _getPriorityScore(priority) {
        const scores = {
            critical: 100,
            high: 75,
            medium: 50,
            low: 25
        };
        return scores[priority] || 50;
    }

    /**
     * Detect circular dependencies
     * @private
     */
    _detectCircularDependencies(task, taskMap, visited) {
        if (visited.has(task.id)) {
            return [task.id];
        }

        visited.add(task.id);
        
        for (const depId of task.dependencies) {
            const depTask = taskMap.get(depId);
            if (depTask) {
                const circular = this._detectCircularDependencies(depTask, taskMap, new Set(visited));
                if (circular.length > 0) {
                    return [task.id, ...circular];
                }
            }
        }

        return [];
    }

    /**
     * Calculate dependency depth
     * @private
     */
    _calculateDependencyDepth(task, taskMap, depth = 0) {
        if (depth > this.config.dependencyDepthLimit) {
            return depth;
        }

        let maxDepth = depth;
        for (const depId of task.dependencies) {
            const depTask = taskMap.get(depId);
            if (depTask) {
                const depDepth = this._calculateDependencyDepth(depTask, taskMap, depth + 1);
                maxDepth = Math.max(maxDepth, depDepth);
            }
        }

        return maxDepth;
    }

    /**
     * Fix dependency validation errors
     * @private
     */
    _fixDependencyErrors(tasks, errors) {
        for (const error of errors) {
            const task = tasks.find(t => t.id === error.taskId);
            if (!task) continue;

            switch (error.type) {
                case 'circular_dependency':
                    // Remove circular dependencies
                    task.dependencies = task.dependencies.filter(depId => 
                        !error.dependencies.includes(depId)
                    );
                    break;
                case 'missing_dependency':
                    // Remove missing dependencies
                    task.dependencies = task.dependencies.filter(depId => 
                        !error.dependencies.includes(depId)
                    );
                    break;
                case 'excessive_depth':
                    // Flatten excessive dependencies
                    task.dependencies = task.dependencies.slice(0, 2);
                    break;
            }
        }
    }

    /**
     * Topological sort for dependency ordering
     * @private
     */
    _topologicalSort(tasks) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        const taskMap = new Map(tasks.map(task => [task.id, task]));

        const visit = (task) => {
            if (visiting.has(task.id)) {
                // Circular dependency detected, skip
                return;
            }
            if (visited.has(task.id)) {
                return;
            }

            visiting.add(task.id);

            // Visit dependencies first
            for (const depId of task.dependencies) {
                const depTask = taskMap.get(depId);
                if (depTask) {
                    visit(depTask);
                }
            }

            visiting.delete(task.id);
            visited.add(task.id);
            sorted.push(task);
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                visit(task);
            }
        }

        return sorted;
    }

    /**
     * Apply execution optimizations
     * @private
     */
    _applyExecutionOptimizations(tasks) {
        // Group tasks by type for batch processing
        const grouped = this._groupTasksByType(tasks);
        
        // Optimize within groups
        const optimized = [];
        for (const [type, typeTasks] of grouped) {
            optimized.push(...this._optimizeTaskGroup(typeTasks));
        }

        return optimized;
    }

    /**
     * Group tasks by type
     * @private
     */
    _groupTasksByType(tasks) {
        const groups = new Map();
        
        for (const task of tasks) {
            const type = task.type || 'default';
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            groups.get(type).push(task);
        }

        return groups;
    }

    /**
     * Optimize task group
     * @private
     */
    _optimizeTaskGroup(tasks) {
        // Sort by priority and complexity
        return tasks.sort((a, b) => {
            const priorityDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
            if (priorityDiff !== 0) return priorityDiff;
            
            return (a.complexity || 0) - (b.complexity || 0);
        });
    }

    /**
     * Check if task is on critical path
     * @private
     */
    _isOnCriticalPath(task, allTasks) {
        // Simplified critical path detection
        const dependents = allTasks.filter(t => t.dependencies.includes(task.id));
        return dependents.length > 2 || task.complexity >= 8;
    }

    /**
     * Check if relationship is parent-child
     * @private
     */
    _isParentChildRelationship(parentTask, childTask) {
        // Simple heuristic: if child depends on parent and they're related by type
        return childTask.dependencies.includes(parentTask.id) && 
               (parentTask.type === 'epic' || childTask.type === 'subtask');
    }

    /**
     * Validate hierarchy depth
     * @private
     */
    _validateHierarchyDepth(hierarchy) {
        const maxDepth = Math.max(...hierarchy.map(task => task.level));
        if (maxDepth > this.config.dependencyDepthLimit) {
            log('warn', `Task hierarchy depth (${maxDepth}) exceeds limit (${this.config.dependencyDepthLimit})`);
        }
    }

    /**
     * Generate unique task ID
     * @private
     */
    _generateTaskId() {
        return this.taskIdCounter++;
    }
}

