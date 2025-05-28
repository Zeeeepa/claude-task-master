/**
 * Core data structures for requirement analysis and task decomposition
 * These types define the interface contracts for the requirement analysis engine
 */

/**
 * Represents a parsed requirement with structured metadata
 */
export class ParsedRequirement {
    constructor({
        id,
        title,
        description,
        originalText,
        technicalSpecs = [],
        businessRequirements = [],
        acceptanceCriteria = [],
        estimatedComplexity = 0,
        priority = 'medium',
        tags = [],
        metadata = {}
    }) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.originalText = originalText;
        this.technicalSpecs = technicalSpecs;
        this.businessRequirements = businessRequirements;
        this.acceptanceCriteria = acceptanceCriteria;
        this.estimatedComplexity = estimatedComplexity;
        this.priority = priority;
        this.tags = tags;
        this.metadata = metadata;
        this.createdAt = new Date().toISOString();
    }

    /**
     * Validates the parsed requirement structure
     */
    validate() {
        const errors = [];
        
        if (!this.id) errors.push('ID is required');
        if (!this.title) errors.push('Title is required');
        if (!this.description) errors.push('Description is required');
        if (!this.originalText) errors.push('Original text is required');
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

/**
 * Represents an atomic, implementable task
 */
export class AtomicTask {
    constructor({
        id,
        title,
        description,
        requirements = [],
        acceptanceCriteria = [],
        affectedFiles = [],
        complexityScore = 1,
        dependencies = [],
        context = {},
        parentRequirementId = null,
        estimatedHours = 0,
        priority = 'medium',
        tags = [],
        implementationNotes = '',
        testStrategy = ''
    }) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.requirements = requirements;
        this.acceptanceCriteria = acceptanceCriteria;
        this.affectedFiles = affectedFiles;
        this.complexityScore = complexityScore;
        this.dependencies = dependencies;
        this.context = context;
        this.parentRequirementId = parentRequirementId;
        this.estimatedHours = estimatedHours;
        this.priority = priority;
        this.tags = tags;
        this.implementationNotes = implementationNotes;
        this.testStrategy = testStrategy;
        this.createdAt = new Date().toISOString();
        this.status = 'pending';
    }

    /**
     * Validates the atomic task structure
     */
    validate() {
        const errors = [];
        
        if (!this.id) errors.push('ID is required');
        if (!this.title) errors.push('Title is required');
        if (!this.description) errors.push('Description is required');
        if (this.complexityScore < 1 || this.complexityScore > 10) {
            errors.push('Complexity score must be between 1 and 10');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Converts task to codegen prompt format
     */
    toCodegenPrompt() {
        return {
            title: this.title,
            description: this.description,
            requirements: this.requirements,
            acceptanceCriteria: this.acceptanceCriteria,
            affectedFiles: this.affectedFiles,
            context: this.context,
            implementationNotes: this.implementationNotes,
            testStrategy: this.testStrategy,
            priority: this.priority,
            estimatedComplexity: this.complexityScore
        };
    }
}

/**
 * Represents task dependencies and relationships
 */
export class DependencyGraph {
    constructor() {
        this.nodes = new Map(); // taskId -> AtomicTask
        this.edges = new Map(); // taskId -> Set of dependent taskIds
        this.reverseEdges = new Map(); // taskId -> Set of prerequisite taskIds
    }

    /**
     * Adds a task to the dependency graph
     */
    addTask(task) {
        this.nodes.set(task.id, task);
        if (!this.edges.has(task.id)) {
            this.edges.set(task.id, new Set());
        }
        if (!this.reverseEdges.has(task.id)) {
            this.reverseEdges.set(task.id, new Set());
        }
    }

    /**
     * Adds a dependency relationship between tasks
     */
    addDependency(fromTaskId, toTaskId) {
        if (!this.nodes.has(fromTaskId) || !this.nodes.has(toTaskId)) {
            throw new Error('Both tasks must exist in the graph before adding dependency');
        }

        this.edges.get(fromTaskId).add(toTaskId);
        this.reverseEdges.get(toTaskId).add(fromTaskId);
    }

    /**
     * Detects circular dependencies in the graph
     */
    detectCircularDependencies() {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const dfs = (taskId, path = []) => {
            if (recursionStack.has(taskId)) {
                const cycleStart = path.indexOf(taskId);
                cycles.push(path.slice(cycleStart).concat([taskId]));
                return;
            }

            if (visited.has(taskId)) return;

            visited.add(taskId);
            recursionStack.add(taskId);
            path.push(taskId);

            const dependencies = this.edges.get(taskId) || new Set();
            for (const depId of dependencies) {
                dfs(depId, [...path]);
            }

            recursionStack.delete(taskId);
        };

        for (const taskId of this.nodes.keys()) {
            if (!visited.has(taskId)) {
                dfs(taskId);
            }
        }

        return cycles;
    }

    /**
     * Returns tasks in topological order (prerequisites first)
     */
    getTopologicalOrder() {
        const cycles = this.detectCircularDependencies();
        if (cycles.length > 0) {
            throw new Error(`Circular dependencies detected: ${cycles.map(c => c.join(' -> ')).join(', ')}`);
        }

        const inDegree = new Map();
        const queue = [];
        const result = [];

        // Initialize in-degree count
        for (const taskId of this.nodes.keys()) {
            inDegree.set(taskId, this.reverseEdges.get(taskId).size);
            if (inDegree.get(taskId) === 0) {
                queue.push(taskId);
            }
        }

        // Process tasks with no dependencies first
        while (queue.length > 0) {
            const taskId = queue.shift();
            result.push(this.nodes.get(taskId));

            // Reduce in-degree for dependent tasks
            const dependencies = this.edges.get(taskId) || new Set();
            for (const depId of dependencies) {
                inDegree.set(depId, inDegree.get(depId) - 1);
                if (inDegree.get(depId) === 0) {
                    queue.push(depId);
                }
            }
        }

        return result;
    }
}

/**
 * Represents complexity scoring for tasks
 */
export class ComplexityScore {
    constructor({
        technical = 1,
        business = 1,
        integration = 1,
        testing = 1,
        documentation = 1
    }) {
        this.technical = Math.max(1, Math.min(10, technical));
        this.business = Math.max(1, Math.min(10, business));
        this.integration = Math.max(1, Math.min(10, integration));
        this.testing = Math.max(1, Math.min(10, testing));
        this.documentation = Math.max(1, Math.min(10, documentation));
    }

    /**
     * Calculates overall complexity score
     */
    getOverallScore() {
        const weights = {
            technical: 0.4,
            business: 0.2,
            integration: 0.2,
            testing: 0.1,
            documentation: 0.1
        };

        return Math.round(
            this.technical * weights.technical +
            this.business * weights.business +
            this.integration * weights.integration +
            this.testing * weights.testing +
            this.documentation * weights.documentation
        );
    }

    /**
     * Returns complexity category
     */
    getCategory() {
        const score = this.getOverallScore();
        if (score <= 3) return 'low';
        if (score <= 6) return 'medium';
        if (score <= 8) return 'high';
        return 'very-high';
    }
}

/**
 * Represents task context for AI agents
 */
export class TaskContext {
    constructor({
        codebaseContext = {},
        technicalConstraints = [],
        businessContext = {},
        relatedTasks = [],
        externalDependencies = [],
        riskFactors = [],
        successMetrics = []
    }) {
        this.codebaseContext = codebaseContext;
        this.technicalConstraints = technicalConstraints;
        this.businessContext = businessContext;
        this.relatedTasks = relatedTasks;
        this.externalDependencies = externalDependencies;
        this.riskFactors = riskFactors;
        this.successMetrics = successMetrics;
        this.generatedAt = new Date().toISOString();
    }
}

/**
 * Represents validation results
 */
export class ValidationResult {
    constructor({
        isValid = false,
        errors = [],
        warnings = [],
        suggestions = [],
        score = 0
    }) {
        this.isValid = isValid;
        this.errors = errors;
        this.warnings = warnings;
        this.suggestions = suggestions;
        this.score = score;
        this.validatedAt = new Date().toISOString();
    }
}

/**
 * Represents a component that might be affected by a task
 */
export class Component {
    constructor({
        name,
        type,
        path,
        dependencies = [],
        interfaces = [],
        complexity = 1
    }) {
        this.name = name;
        this.type = type; // 'file', 'module', 'service', 'database', etc.
        this.path = path;
        this.dependencies = dependencies;
        this.interfaces = interfaces;
        this.complexity = complexity;
    }
}

/**
 * Represents a codegen prompt
 */
export class CodegenPrompt {
    constructor({
        title,
        description,
        context,
        requirements = [],
        acceptanceCriteria = [],
        technicalSpecs = [],
        affectedFiles = [],
        priority = 'medium',
        estimatedComplexity = 1
    }) {
        this.title = title;
        this.description = description;
        this.context = context;
        this.requirements = requirements;
        this.acceptanceCriteria = acceptanceCriteria;
        this.technicalSpecs = technicalSpecs;
        this.affectedFiles = affectedFiles;
        this.priority = priority;
        this.estimatedComplexity = estimatedComplexity;
        this.generatedAt = new Date().toISOString();
    }

    /**
     * Formats the prompt for AI consumption
     */
    format() {
        return `
# ${this.title}

## Description
${this.description}

## Requirements
${this.requirements.map(req => `- ${req}`).join('\n')}

## Acceptance Criteria
${this.acceptanceCriteria.map(criteria => `- ${criteria}`).join('\n')}

## Technical Specifications
${this.technicalSpecs.map(spec => `- ${spec}`).join('\n')}

## Affected Files
${this.affectedFiles.map(file => `- ${file}`).join('\n')}

## Context
${JSON.stringify(this.context, null, 2)}

## Priority: ${this.priority}
## Estimated Complexity: ${this.estimatedComplexity}/10
        `.trim();
    }
}

