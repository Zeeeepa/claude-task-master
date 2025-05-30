/**
 * @fileoverview Dependency Mapper
 * @description Intelligent dependency mapping engine that analyzes task relationships,
 * creates dependency graphs, and validates execution order constraints.
 */

import { log } from '../../scripts/modules/utils.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Dependency Mapper for task relationship analysis
 */
export class DependencyMapper {
    constructor() {
        // Define dependency rules for different task types
        this.dependencyRules = new Map([
            ['database', ['schema', 'models', 'migrations']],
            ['api', ['database', 'models']],
            ['frontend', ['api', 'backend']],
            ['testing', ['implementation']],
            ['documentation', ['implementation', 'testing']],
            ['validation', ['implementation', 'testing']],
            ['deployment', ['testing', 'validation', 'documentation']],
            ['performance', ['implementation']],
            ['security', ['implementation']]
        ]);
        
        // Content-based dependency keywords
        this.dependencyKeywords = new Map([
            ['database', ['schema', 'model', 'migration', 'table', 'query']],
            ['api', ['endpoint', 'route', 'controller', 'service']],
            ['frontend', ['component', 'view', 'ui', 'interface']],
            ['backend', ['server', 'logic', 'business', 'service']],
            ['testing', ['test', 'spec', 'unit', 'integration']],
            ['security', ['auth', 'permission', 'role', 'token']],
            ['performance', ['cache', 'optimize', 'benchmark', 'speed']]
        ]);
        
        this.isInitialized = false;
        
        log('debug', 'Dependency Mapper created');
    }

    /**
     * Initialize the dependency mapper
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Dependency Mapper...');
        
        try {
            // Initialize dependency analysis components
            this.isInitialized = true;
            log('info', 'Dependency Mapper initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Dependency Mapper:', error);
            throw error;
        }
    }

    /**
     * Map dependencies between tasks
     * @param {Array} tasks - Array of tasks to analyze
     * @returns {Promise<Object>} Dependency graph
     */
    async mapDependencies(tasks) {
        this._ensureInitialized();
        
        log('info', 'Starting dependency mapping', {
            taskCount: tasks.length
        });

        const graph = {
            nodes: tasks.map(task => ({ 
                id: task.id, 
                task: task,
                inDegree: 0,
                outDegree: 0
            })),
            edges: []
        };

        try {
            // Identify dependencies based on task types and content
            for (const task of tasks) {
                const dependencies = await this.identifyTaskDependencies(task, tasks);
                
                for (const depId of dependencies) {
                    const edge = {
                        id: uuidv4(),
                        from: depId,
                        to: task.id,
                        type: 'blocks',
                        strength: this.calculateDependencyStrength(depId, task.id, tasks),
                        reason: this.getDependencyReason(depId, task.id, tasks)
                    };
                    
                    graph.edges.push(edge);
                }
            }

            // Update node degrees
            this.updateNodeDegrees(graph);

            // Add implicit dependencies
            await this.addImplicitDependencies(graph, tasks);

            // Validate dependency graph (no cycles)
            await this.validateDependencyGraph(graph);

            // Optimize dependency graph
            await this.optimizeDependencyGraph(graph);

            log('info', 'Dependency mapping completed', {
                nodes: graph.nodes.length,
                edges: graph.edges.length,
                maxInDegree: Math.max(...graph.nodes.map(n => n.inDegree)),
                maxOutDegree: Math.max(...graph.nodes.map(n => n.outDegree))
            });

            return graph;
        } catch (error) {
            log('error', 'Failed to map dependencies:', error);
            throw error;
        }
    }

    /**
     * Identify dependencies for a specific task
     * @param {Object} task - Task to analyze
     * @param {Array} allTasks - All tasks in the project
     * @returns {Promise<Array>} Array of dependency task IDs
     */
    async identifyTaskDependencies(task, allTasks) {
        const dependencies = new Set();

        try {
            // Rule-based dependencies
            const ruleDeps = await this.getRuleBasedDependencies(task, allTasks);
            ruleDeps.forEach(dep => dependencies.add(dep));

            // Content-based dependencies
            const contentDeps = await this.analyzeContentDependencies(task, allTasks);
            contentDeps.forEach(dep => dependencies.add(dep));

            // Type-based dependencies
            const typeDeps = await this.getTypeBasedDependencies(task, allTasks);
            typeDeps.forEach(dep => dependencies.add(dep));

            // Explicit dependencies from task definition
            if (task.dependencies && Array.isArray(task.dependencies)) {
                task.dependencies.forEach(dep => {
                    // Find task by ID or title
                    const depTask = allTasks.find(t => t.id === dep || t.title === dep);
                    if (depTask) {
                        dependencies.add(depTask.id);
                    }
                });
            }

            // Remove self-dependencies
            dependencies.delete(task.id);

            return Array.from(dependencies);
        } catch (error) {
            log('error', `Failed to identify dependencies for task ${task.id}:`, error);
            return [];
        }
    }

    /**
     * Get rule-based dependencies
     * @param {Object} task - Task to analyze
     * @param {Array} allTasks - All tasks
     * @returns {Promise<Array>} Rule-based dependencies
     */
    async getRuleBasedDependencies(task, allTasks) {
        const dependencies = [];
        const rules = this.dependencyRules.get(task.type);
        
        if (rules) {
            for (const rule of rules) {
                const dependentTasks = allTasks.filter(t => 
                    t.type === rule || 
                    t.category === rule ||
                    (t.tags && t.tags.includes(rule))
                );
                dependencies.push(...dependentTasks.map(t => t.id));
            }
        }

        return dependencies;
    }

    /**
     * Analyze content-based dependencies
     * @param {Object} task - Task to analyze
     * @param {Array} allTasks - All tasks
     * @returns {Promise<Array>} Content-based dependencies
     */
    async analyzeContentDependencies(task, allTasks) {
        const dependencies = [];
        
        try {
            // Look for references to other tasks in description
            for (const otherTask of allTasks) {
                if (otherTask.id === task.id) continue;
                
                if (this.hasContentDependency(task, otherTask)) {
                    dependencies.push(otherTask.id);
                }
            }

            // Keyword-based dependencies
            const keywordDeps = await this.getKeywordBasedDependencies(task, allTasks);
            dependencies.push(...keywordDeps);

            return dependencies;
        } catch (error) {
            log('error', 'Failed to analyze content dependencies:', error);
            return [];
        }
    }

    /**
     * Get type-based dependencies
     * @param {Object} task - Task to analyze
     * @param {Array} allTasks - All tasks
     * @returns {Promise<Array>} Type-based dependencies
     */
    async getTypeBasedDependencies(task, allTasks) {
        const dependencies = [];

        // Setup tasks should come first
        if (task.type !== 'setup') {
            const setupTasks = allTasks.filter(t => t.type === 'setup');
            dependencies.push(...setupTasks.map(t => t.id));
        }

        // Implementation before testing
        if (task.type === 'testing') {
            const implTasks = allTasks.filter(t => 
                t.type === 'implementation' && 
                this.isRelatedTask(task, t)
            );
            dependencies.push(...implTasks.map(t => t.id));
        }

        // Testing before validation
        if (task.type === 'validation') {
            const testTasks = allTasks.filter(t => 
                t.type === 'testing' && 
                this.isRelatedTask(task, t)
            );
            dependencies.push(...testTasks.map(t => t.id));
        }

        // Implementation and testing before documentation
        if (task.type === 'documentation') {
            const implAndTestTasks = allTasks.filter(t => 
                (t.type === 'implementation' || t.type === 'testing') &&
                this.isRelatedTask(task, t)
            );
            dependencies.push(...implAndTestTasks.map(t => t.id));
        }

        // Everything before deployment
        if (task.type === 'deployment') {
            const preTasks = allTasks.filter(t => 
                t.type !== 'deployment' && t.type !== 'teardown'
            );
            dependencies.push(...preTasks.map(t => t.id));
        }

        return dependencies;
    }

    /**
     * Get keyword-based dependencies
     * @param {Object} task - Task to analyze
     * @param {Array} allTasks - All tasks
     * @returns {Promise<Array>} Keyword-based dependencies
     */
    async getKeywordBasedDependencies(task, allTasks) {
        const dependencies = [];
        const taskText = `${task.title} ${task.description}`.toLowerCase();

        for (const [category, keywords] of this.dependencyKeywords) {
            const hasKeyword = keywords.some(keyword => taskText.includes(keyword));
            
            if (hasKeyword) {
                // Find tasks of this category that should come before
                const categoryTasks = allTasks.filter(t => 
                    t.category === category && 
                    t.id !== task.id &&
                    this.shouldComeBefore(t, task)
                );
                dependencies.push(...categoryTasks.map(t => t.id));
            }
        }

        return dependencies;
    }

    /**
     * Check if task has content dependency on another task
     * @param {Object} task - Task to check
     * @param {Object} otherTask - Potential dependency
     * @returns {boolean} True if dependency exists
     */
    hasContentDependency(task, otherTask) {
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        const otherTaskKeywords = this.extractKeywords(otherTask);
        
        return otherTaskKeywords.some(keyword => 
            taskText.includes(keyword.toLowerCase())
        );
    }

    /**
     * Extract keywords from a task
     * @param {Object} task - Task to extract keywords from
     * @returns {Array} Keywords
     */
    extractKeywords(task) {
        const keywords = [];
        
        // Extract from title
        const titleWords = task.title.split(/\s+/).filter(word => word.length > 3);
        keywords.push(...titleWords);
        
        // Extract from tags
        if (task.tags) {
            keywords.push(...task.tags);
        }
        
        // Extract from category
        if (task.category) {
            keywords.push(task.category);
        }
        
        // Extract from type
        keywords.push(task.type);
        
        return keywords;
    }

    /**
     * Check if tasks are related
     * @param {Object} task1 - First task
     * @param {Object} task2 - Second task
     * @returns {boolean} True if related
     */
    isRelatedTask(task1, task2) {
        // Same feature
        if (task1.context?.feature?.id && task2.context?.feature?.id) {
            return task1.context.feature.id === task2.context.feature.id;
        }
        
        // Same category
        if (task1.category === task2.category) {
            return true;
        }
        
        // Overlapping tags
        if (task1.tags && task2.tags) {
            const overlap = task1.tags.filter(tag => task2.tags.includes(tag));
            return overlap.length > 0;
        }
        
        return false;
    }

    /**
     * Check if one task should come before another
     * @param {Object} task1 - First task
     * @param {Object} task2 - Second task
     * @returns {boolean} True if task1 should come before task2
     */
    shouldComeBefore(task1, task2) {
        const typeOrder = {
            'setup': 0,
            'implementation': 1,
            'testing': 2,
            'validation': 3,
            'documentation': 4,
            'deployment': 5,
            'teardown': 6
        };
        
        const order1 = typeOrder[task1.type] ?? 1;
        const order2 = typeOrder[task2.type] ?? 1;
        
        return order1 < order2;
    }

    /**
     * Add implicit dependencies
     * @param {Object} graph - Dependency graph
     * @param {Array} tasks - All tasks
     */
    async addImplicitDependencies(graph, tasks) {
        // Add dependencies for parallel tasks that share resources
        const resourceGroups = this.groupTasksByResource(tasks);
        
        for (const [resource, resourceTasks] of resourceGroups) {
            if (resourceTasks.length > 1) {
                // Add sequential dependencies for resource-sharing tasks
                for (let i = 1; i < resourceTasks.length; i++) {
                    const edge = {
                        id: uuidv4(),
                        from: resourceTasks[i-1].id,
                        to: resourceTasks[i].id,
                        type: 'resource-conflict',
                        strength: 0.5,
                        reason: `Resource conflict: ${resource}`
                    };
                    graph.edges.push(edge);
                }
            }
        }
    }

    /**
     * Group tasks by shared resources
     * @param {Array} tasks - All tasks
     * @returns {Map} Resource groups
     */
    groupTasksByResource(tasks) {
        const resourceGroups = new Map();
        
        for (const task of tasks) {
            // Group by database operations
            if (task.type === 'database' || task.category === 'database') {
                this.addToResourceGroup(resourceGroups, 'database', task);
            }
            
            // Group by file system operations
            if (task.description.includes('file') || task.description.includes('config')) {
                this.addToResourceGroup(resourceGroups, 'filesystem', task);
            }
            
            // Group by external API operations
            if (task.description.includes('api') || task.description.includes('external')) {
                this.addToResourceGroup(resourceGroups, 'external-api', task);
            }
        }
        
        return resourceGroups;
    }

    /**
     * Add task to resource group
     * @param {Map} resourceGroups - Resource groups map
     * @param {string} resource - Resource name
     * @param {Object} task - Task to add
     */
    addToResourceGroup(resourceGroups, resource, task) {
        if (!resourceGroups.has(resource)) {
            resourceGroups.set(resource, []);
        }
        resourceGroups.get(resource).push(task);
    }

    /**
     * Update node degrees in the graph
     * @param {Object} graph - Dependency graph
     */
    updateNodeDegrees(graph) {
        // Reset degrees
        for (const node of graph.nodes) {
            node.inDegree = 0;
            node.outDegree = 0;
        }
        
        // Calculate degrees
        for (const edge of graph.edges) {
            const fromNode = graph.nodes.find(n => n.id === edge.from);
            const toNode = graph.nodes.find(n => n.id === edge.to);
            
            if (fromNode) fromNode.outDegree++;
            if (toNode) toNode.inDegree++;
        }
    }

    /**
     * Validate dependency graph for cycles
     * @param {Object} graph - Dependency graph
     */
    async validateDependencyGraph(graph) {
        const visited = new Set();
        const recursionStack = new Set();
        const path = [];

        const hasCycle = (nodeId) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const outgoingEdges = graph.edges.filter(edge => edge.from === nodeId);
            
            for (const edge of outgoingEdges) {
                if (!visited.has(edge.to)) {
                    if (hasCycle(edge.to)) return true;
                } else if (recursionStack.has(edge.to)) {
                    const cycleStart = path.indexOf(edge.to);
                    const cycle = path.slice(cycleStart).concat(edge.to);
                    log('error', 'Circular dependency detected:', {
                        cycle: cycle,
                        tasks: cycle.map(id => {
                            const node = graph.nodes.find(n => n.id === id);
                            return node ? node.task.title : id;
                        })
                    });
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            path.pop();
            return false;
        };

        for (const node of graph.nodes) {
            if (!visited.has(node.id)) {
                if (hasCycle(node.id)) {
                    throw new Error('Circular dependency detected in task graph');
                }
            }
        }

        log('debug', 'Dependency graph validation passed - no cycles detected');
    }

    /**
     * Optimize dependency graph
     * @param {Object} graph - Dependency graph
     */
    async optimizeDependencyGraph(graph) {
        // Remove redundant edges (transitive reduction)
        const redundantEdges = [];
        
        for (const edge of graph.edges) {
            if (this.isRedundantEdge(edge, graph)) {
                redundantEdges.push(edge);
            }
        }
        
        // Remove redundant edges
        for (const edge of redundantEdges) {
            const index = graph.edges.indexOf(edge);
            if (index > -1) {
                graph.edges.splice(index, 1);
            }
        }
        
        if (redundantEdges.length > 0) {
            log('debug', `Removed ${redundantEdges.length} redundant dependencies`);
            this.updateNodeDegrees(graph);
        }
    }

    /**
     * Check if an edge is redundant
     * @param {Object} edge - Edge to check
     * @param {Object} graph - Dependency graph
     * @returns {boolean} True if redundant
     */
    isRedundantEdge(edge, graph) {
        // An edge is redundant if there's already a path from source to target
        // through other edges
        return this.hasAlternatePath(edge.from, edge.to, graph, new Set([edge.id]));
    }

    /**
     * Check if there's an alternate path between nodes
     * @param {string} from - Source node ID
     * @param {string} to - Target node ID
     * @param {Object} graph - Dependency graph
     * @param {Set} excludeEdges - Edges to exclude
     * @returns {boolean} True if alternate path exists
     */
    hasAlternatePath(from, to, graph, excludeEdges) {
        const visited = new Set();
        const queue = [from];
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (current === to) {
                return true;
            }
            
            if (visited.has(current)) {
                continue;
            }
            
            visited.add(current);
            
            // Find outgoing edges not in exclude set
            const outgoingEdges = graph.edges.filter(edge => 
                edge.from === current && !excludeEdges.has(edge.id)
            );
            
            for (const edge of outgoingEdges) {
                if (!visited.has(edge.to)) {
                    queue.push(edge.to);
                }
            }
        }
        
        return false;
    }

    /**
     * Calculate dependency strength
     * @param {string} fromId - Source task ID
     * @param {string} toId - Target task ID
     * @param {Array} tasks - All tasks
     * @returns {number} Dependency strength (0-1)
     */
    calculateDependencyStrength(fromId, toId, tasks) {
        const fromTask = tasks.find(t => t.id === fromId);
        const toTask = tasks.find(t => t.id === toId);
        
        if (!fromTask || !toTask) return 0.5;
        
        let strength = 0.5; // Base strength
        
        // Increase strength for same feature
        if (fromTask.context?.feature?.id === toTask.context?.feature?.id) {
            strength += 0.3;
        }
        
        // Increase strength for type-based dependencies
        if (this.shouldComeBefore(fromTask, toTask)) {
            strength += 0.2;
        }
        
        return Math.min(strength, 1.0);
    }

    /**
     * Get dependency reason
     * @param {string} fromId - Source task ID
     * @param {string} toId - Target task ID
     * @param {Array} tasks - All tasks
     * @returns {string} Dependency reason
     */
    getDependencyReason(fromId, toId, tasks) {
        const fromTask = tasks.find(t => t.id === fromId);
        const toTask = tasks.find(t => t.id === toId);
        
        if (!fromTask || !toTask) return 'Unknown dependency';
        
        // Type-based reason
        if (this.shouldComeBefore(fromTask, toTask)) {
            return `${fromTask.type} must complete before ${toTask.type}`;
        }
        
        // Feature-based reason
        if (fromTask.context?.feature?.id === toTask.context?.feature?.id) {
            return `Same feature dependency: ${fromTask.context.feature.description}`;
        }
        
        // Content-based reason
        if (this.hasContentDependency(toTask, fromTask)) {
            return 'Content reference dependency';
        }
        
        return 'Implicit dependency';
    }

    /**
     * Ensure mapper is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Dependency Mapper not initialized. Call initialize() first.');
        }
    }

    /**
     * Get mapper statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            rulesCount: this.dependencyRules.size,
            keywordsCount: this.dependencyKeywords.size
        };
    }
}

export default DependencyMapper;

