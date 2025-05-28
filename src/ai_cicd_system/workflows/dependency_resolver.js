/**
 * Dependency Resolver
 * Handles workflow step dependency resolution and execution planning
 */

export class DependencyResolver {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Creates an execution plan from workflow steps
     * @param {Array} steps - Array of workflow steps
     * @returns {Array} Array of execution batches
     */
    createExecutionPlan(steps) {
        const cacheKey = this.generateCacheKey(steps);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const plan = this.resolveDependencies(steps);
        this.cache.set(cacheKey, plan);
        return plan;
    }

    /**
     * Resolves dependencies and creates execution batches
     * @param {Array} steps - Array of workflow steps
     * @returns {Array} Array of execution batches
     */
    resolveDependencies(steps) {
        // Validate for circular dependencies first
        this.validateNoCycles(steps);

        const plan = [];
        const completed = new Set();
        const remaining = [...steps];
        const stepMap = new Map(steps.map(step => [step.id, step]));

        while (remaining.length > 0) {
            const batch = [];
            const parallelBatch = [];
            const sequentialBatch = [];
            
            // Find steps with satisfied dependencies
            for (let i = remaining.length - 1; i >= 0; i--) {
                const step = remaining[i];
                if (this.dependenciesSatisfied(step, completed)) {
                    if (step.parallel === true) {
                        parallelBatch.push(step);
                    } else {
                        sequentialBatch.push(step);
                    }
                    remaining.splice(i, 1);
                    completed.add(step.id);
                }
            }

            // Process sequential steps first, then parallel
            if (sequentialBatch.length > 0) {
                // Sequential steps are processed one by one
                sequentialBatch.forEach(step => {
                    plan.push([step]);
                });
            }

            // Parallel steps can be batched together
            if (parallelBatch.length > 0) {
                plan.push(parallelBatch);
            }

            // If no steps were processed, we have an unresolvable dependency
            if (sequentialBatch.length === 0 && parallelBatch.length === 0) {
                const unresolvedSteps = remaining.map(s => s.id).join(', ');
                throw new Error(`Unresolvable dependencies detected for steps: ${unresolvedSteps}`);
            }
        }

        return plan;
    }

    /**
     * Checks if all dependencies for a step are satisfied
     * @param {Object} step - The workflow step
     * @param {Set} completed - Set of completed step IDs
     * @returns {boolean} True if dependencies are satisfied
     */
    dependenciesSatisfied(step, completed) {
        if (!step.dependencies || step.dependencies.length === 0) {
            return true;
        }
        return step.dependencies.every(dep => completed.has(dep));
    }

    /**
     * Validates that there are no circular dependencies
     * @param {Array} steps - Array of workflow steps
     * @throws {Error} If circular dependencies are detected
     */
    validateNoCycles(steps) {
        const stepMap = new Map(steps.map(step => [step.id, step]));
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (stepId, path = []) => {
            if (recursionStack.has(stepId)) {
                const cycleStart = path.indexOf(stepId);
                const cycle = path.slice(cycleStart).concat(stepId);
                throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
            }

            if (visited.has(stepId)) {
                return false;
            }

            visited.add(stepId);
            recursionStack.add(stepId);

            const step = stepMap.get(stepId);
            if (step && step.dependencies) {
                for (const dep of step.dependencies) {
                    if (!stepMap.has(dep)) {
                        throw new Error(`Step ${stepId} depends on non-existent step: ${dep}`);
                    }
                    if (hasCycle(dep, [...path, stepId])) {
                        return true;
                    }
                }
            }

            recursionStack.delete(stepId);
            return false;
        };

        for (const step of steps) {
            if (!visited.has(step.id)) {
                hasCycle(step.id);
            }
        }
    }

    /**
     * Analyzes the critical path of the workflow
     * @param {Array} steps - Array of workflow steps
     * @returns {Object} Critical path analysis
     */
    analyzeCriticalPath(steps) {
        const stepMap = new Map(steps.map(step => [step.id, step]));
        const durations = new Map();
        const criticalPath = [];

        // Calculate step durations (using timeout as estimate)
        steps.forEach(step => {
            durations.set(step.id, step.timeout || 60000);
        });

        // Find the longest path through the workflow
        const findLongestPath = (stepId, visited = new Set()) => {
            if (visited.has(stepId)) return 0;
            
            visited.add(stepId);
            const step = stepMap.get(stepId);
            const stepDuration = durations.get(stepId) || 0;
            
            if (!step.dependencies || step.dependencies.length === 0) {
                return stepDuration;
            }

            let maxDependencyDuration = 0;
            for (const dep of step.dependencies) {
                const depDuration = findLongestPath(dep, new Set(visited));
                maxDependencyDuration = Math.max(maxDependencyDuration, depDuration);
            }

            return stepDuration + maxDependencyDuration;
        };

        // Calculate total workflow duration
        let totalDuration = 0;
        const endSteps = steps.filter(step => 
            !steps.some(s => s.dependencies && s.dependencies.includes(step.id))
        );

        endSteps.forEach(step => {
            const pathDuration = findLongestPath(step.id);
            if (pathDuration > totalDuration) {
                totalDuration = pathDuration;
            }
        });

        return {
            totalDuration,
            criticalPath,
            parallelizationOpportunities: this.findParallelizationOpportunities(steps),
            bottlenecks: this.identifyBottlenecks(steps)
        };
    }

    /**
     * Identifies parallelization opportunities
     * @param {Array} steps - Array of workflow steps
     * @returns {Array} Array of step groups that can be parallelized
     */
    findParallelizationOpportunities(steps) {
        const opportunities = [];
        const stepMap = new Map(steps.map(step => [step.id, step]));

        // Find steps that can run in parallel
        steps.forEach(step => {
            if (step.parallel !== false) {
                const siblings = steps.filter(s => 
                    s.id !== step.id &&
                    s.parallel !== false &&
                    this.haveSameDependencies(step, s) &&
                    !this.areDependent(step, s, stepMap)
                );

                if (siblings.length > 0) {
                    opportunities.push({
                        primary: step.id,
                        parallel: siblings.map(s => s.id),
                        estimatedTimeSaving: this.calculateTimeSaving(step, siblings)
                    });
                }
            }
        });

        return opportunities;
    }

    /**
     * Identifies potential bottlenecks in the workflow
     * @param {Array} steps - Array of workflow steps
     * @returns {Array} Array of potential bottlenecks
     */
    identifyBottlenecks(steps) {
        const bottlenecks = [];

        steps.forEach(step => {
            const dependents = steps.filter(s => 
                s.dependencies && s.dependencies.includes(step.id)
            );

            if (dependents.length > 2) {
                bottlenecks.push({
                    stepId: step.id,
                    dependentCount: dependents.length,
                    dependents: dependents.map(s => s.id),
                    severity: dependents.length > 5 ? 'high' : 'medium'
                });
            }

            // Check for long-running steps
            if (step.timeout > 300000) { // 5 minutes
                bottlenecks.push({
                    stepId: step.id,
                    type: 'long_running',
                    duration: step.timeout,
                    severity: step.timeout > 600000 ? 'high' : 'medium'
                });
            }
        });

        return bottlenecks;
    }

    /**
     * Checks if two steps have the same dependencies
     * @param {Object} step1 - First step
     * @param {Object} step2 - Second step
     * @returns {boolean} True if they have the same dependencies
     */
    haveSameDependencies(step1, step2) {
        const deps1 = new Set(step1.dependencies || []);
        const deps2 = new Set(step2.dependencies || []);
        
        if (deps1.size !== deps2.size) return false;
        
        for (const dep of deps1) {
            if (!deps2.has(dep)) return false;
        }
        
        return true;
    }

    /**
     * Checks if two steps are dependent on each other
     * @param {Object} step1 - First step
     * @param {Object} step2 - Second step
     * @param {Map} stepMap - Map of step IDs to steps
     * @returns {boolean} True if they are dependent
     */
    areDependent(step1, step2, stepMap) {
        const isDependent = (sourceId, targetId, visited = new Set()) => {
            if (visited.has(sourceId)) return false;
            visited.add(sourceId);
            
            const source = stepMap.get(sourceId);
            if (!source || !source.dependencies) return false;
            
            if (source.dependencies.includes(targetId)) return true;
            
            return source.dependencies.some(dep => 
                isDependent(dep, targetId, new Set(visited))
            );
        };

        return isDependent(step1.id, step2.id) || isDependent(step2.id, step1.id);
    }

    /**
     * Calculates potential time saving from parallelization
     * @param {Object} primaryStep - Primary step
     * @param {Array} parallelSteps - Steps that can run in parallel
     * @returns {number} Estimated time saving in milliseconds
     */
    calculateTimeSaving(primaryStep, parallelSteps) {
        const totalSequentialTime = parallelSteps.reduce(
            (sum, step) => sum + (step.timeout || 60000), 
            primaryStep.timeout || 60000
        );
        
        const maxParallelTime = Math.max(
            primaryStep.timeout || 60000,
            ...parallelSteps.map(step => step.timeout || 60000)
        );
        
        return totalSequentialTime - maxParallelTime;
    }

    /**
     * Generates a cache key for the execution plan
     * @param {Array} steps - Array of workflow steps
     * @returns {string} Cache key
     */
    generateCacheKey(steps) {
        const stepSignature = steps
            .map(step => `${step.id}:${(step.dependencies || []).join(',')}:${step.parallel}`)
            .sort()
            .join('|');
        
        return `plan:${stepSignature}`;
    }

    /**
     * Optimizes the execution plan for better performance
     * @param {Array} plan - Original execution plan
     * @param {Object} constraints - Resource and timing constraints
     * @returns {Array} Optimized execution plan
     */
    optimizeExecutionPlan(plan, constraints = {}) {
        const optimized = [];
        const maxConcurrent = constraints.maxConcurrentSteps || 5;

        for (const batch of plan) {
            if (batch.length <= maxConcurrent) {
                optimized.push(batch);
            } else {
                // Split large batches into smaller ones
                const chunks = [];
                for (let i = 0; i < batch.length; i += maxConcurrent) {
                    chunks.push(batch.slice(i, i + maxConcurrent));
                }
                optimized.push(...chunks);
            }
        }

        return optimized;
    }

    /**
     * Clears the dependency resolution cache
     */
    clearCache() {
        this.cache.clear();
    }
}

