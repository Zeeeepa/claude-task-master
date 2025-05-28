/**
 * Workflow Validator - Workflow Validation Framework
 * 
 * Validates workflow execution, state management, step validation,
 * and workflow integrity across the entire system.
 */

import { EventEmitter } from 'events';

export class WorkflowValidator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            strictValidation: config.strictValidation !== false,
            validateStateTransitions: config.validateStateTransitions !== false,
            validateStepDependencies: config.validateStepDependencies !== false,
            validateDataFlow: config.validateDataFlow !== false,
            validateTiming: config.validateTiming !== false,
            maxValidationTime: config.maxValidationTime || 30000,
            ...config
        };
        
        this.validationRules = new Map();
        this.validationHistory = new Map();
        this.stateValidators = new Map();
        this.stepValidators = new Map();
        
        this.initializeValidators();
    }

    /**
     * Initialize validation rules and validators
     */
    initializeValidators() {
        // Initialize state transition validators
        this.initializeStateValidators();
        
        // Initialize step validators
        this.initializeStepValidators();
        
        // Initialize workflow validators
        this.initializeWorkflowValidators();
        
        // Initialize data flow validators
        this.initializeDataFlowValidators();
    }

    /**
     * Validate workflow steps
     */
    async validateWorkflowSteps(steps) {
        const validationId = this.generateValidationId();
        const startTime = Date.now();
        
        try {
            this.emit('validation:started', { validationId, type: 'workflow_steps' });
            
            const validation = {
                validationId,
                type: 'workflow_steps',
                startTime,
                steps: steps.length,
                results: {
                    allStepsValid: true,
                    stepValidations: [],
                    stateTransitions: [],
                    dependencies: [],
                    dataFlow: [],
                    timing: []
                },
                issues: [],
                warnings: [],
                recommendations: []
            };

            // Validate each step
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const stepValidation = await this.validateStep(step, i, steps);
                validation.results.stepValidations.push(stepValidation);
                
                if (!stepValidation.valid) {
                    validation.results.allStepsValid = false;
                    validation.issues.push(...stepValidation.issues);
                }
                
                validation.warnings.push(...stepValidation.warnings);
            }

            // Validate state transitions
            if (this.config.validateStateTransitions) {
                const stateValidation = await this.validateStateTransitions(steps);
                validation.results.stateTransitions = stateValidation;
                
                if (!stateValidation.valid) {
                    validation.results.allStepsValid = false;
                    validation.issues.push(...stateValidation.issues);
                }
            }

            // Validate step dependencies
            if (this.config.validateStepDependencies) {
                const dependencyValidation = await this.validateStepDependencies(steps);
                validation.results.dependencies = dependencyValidation;
                
                if (!dependencyValidation.valid) {
                    validation.results.allStepsValid = false;
                    validation.issues.push(...dependencyValidation.issues);
                }
            }

            // Validate data flow
            if (this.config.validateDataFlow) {
                const dataFlowValidation = await this.validateWorkflowDataFlow(steps);
                validation.results.dataFlow = dataFlowValidation;
                
                if (!dataFlowValidation.valid) {
                    validation.results.allStepsValid = false;
                    validation.issues.push(...dataFlowValidation.issues);
                }
            }

            // Validate timing
            if (this.config.validateTiming) {
                const timingValidation = await this.validateWorkflowTiming(steps);
                validation.results.timing = timingValidation;
                
                if (!timingValidation.valid) {
                    validation.warnings.push(...timingValidation.warnings);
                }
            }

            // Generate recommendations
            validation.recommendations = this.generateWorkflowRecommendations(validation);

            validation.endTime = Date.now();
            validation.duration = validation.endTime - validation.startTime;
            validation.status = validation.results.allStepsValid ? 'passed' : 'failed';

            this.validationHistory.set(validationId, validation);
            this.emit('validation:completed', { validationId, validation });

            return validation;
            
        } catch (error) {
            this.emit('validation:failed', { validationId, error: error.message });
            throw new Error(`Workflow validation failed: ${error.message}`);
        }
    }

    /**
     * Validate individual step
     */
    async validateStep(step, index, allSteps) {
        const stepValidation = {
            stepIndex: index,
            stepName: step.name,
            stepType: step.type || 'unknown',
            valid: true,
            issues: [],
            warnings: [],
            checks: {}
        };

        // Validate step structure
        stepValidation.checks.structure = this.validateStepStructure(step);
        if (!stepValidation.checks.structure.valid) {
            stepValidation.valid = false;
            stepValidation.issues.push(...stepValidation.checks.structure.issues);
        }

        // Validate step configuration
        stepValidation.checks.configuration = this.validateStepConfiguration(step);
        if (!stepValidation.checks.configuration.valid) {
            stepValidation.valid = false;
            stepValidation.issues.push(...stepValidation.checks.configuration.issues);
        }

        // Validate step dependencies
        stepValidation.checks.dependencies = this.validateStepDependenciesForStep(step, allSteps);
        if (!stepValidation.checks.dependencies.valid) {
            stepValidation.valid = false;
            stepValidation.issues.push(...stepValidation.checks.dependencies.issues);
        }

        // Validate step inputs/outputs
        stepValidation.checks.inputOutput = this.validateStepInputOutput(step, index, allSteps);
        if (!stepValidation.checks.inputOutput.valid) {
            stepValidation.valid = false;
            stepValidation.issues.push(...stepValidation.checks.inputOutput.issues);
        }

        // Validate step execution requirements
        stepValidation.checks.execution = this.validateStepExecution(step);
        if (!stepValidation.checks.execution.valid) {
            stepValidation.warnings.push(...stepValidation.checks.execution.warnings);
        }

        return stepValidation;
    }

    /**
     * Validate step structure
     */
    validateStepStructure(step) {
        const validation = {
            valid: true,
            issues: [],
            checks: {}
        };

        // Check required fields
        const requiredFields = ['name', 'type'];
        for (const field of requiredFields) {
            if (!step[field]) {
                validation.valid = false;
                validation.issues.push(`Missing required field: ${field}`);
            }
        }

        // Check step name format
        if (step.name && !/^[a-zA-Z0-9_-]+$/.test(step.name)) {
            validation.valid = false;
            validation.issues.push('Step name contains invalid characters');
        }

        // Check step type
        const validTypes = ['action', 'condition', 'loop', 'parallel', 'sequential', 'custom'];
        if (step.type && !validTypes.includes(step.type)) {
            validation.valid = false;
            validation.issues.push(`Invalid step type: ${step.type}`);
        }

        validation.checks.requiredFields = requiredFields.every(field => step[field]);
        validation.checks.nameFormat = step.name ? /^[a-zA-Z0-9_-]+$/.test(step.name) : false;
        validation.checks.validType = step.type ? validTypes.includes(step.type) : false;

        return validation;
    }

    /**
     * Validate step configuration
     */
    validateStepConfiguration(step) {
        const validation = {
            valid: true,
            issues: [],
            checks: {}
        };

        // Validate timeout configuration
        if (step.timeout !== undefined) {
            if (typeof step.timeout !== 'number' || step.timeout < 0) {
                validation.valid = false;
                validation.issues.push('Invalid timeout configuration');
            }
        }

        // Validate retry policy
        if (step.retryPolicy) {
            const retryValidation = this.validateRetryPolicy(step.retryPolicy);
            if (!retryValidation.valid) {
                validation.valid = false;
                validation.issues.push(...retryValidation.issues);
            }
        }

        // Validate step-specific configuration
        const typeValidation = this.validateStepTypeConfiguration(step);
        if (!typeValidation.valid) {
            validation.valid = false;
            validation.issues.push(...typeValidation.issues);
        }

        validation.checks.timeout = step.timeout === undefined || (typeof step.timeout === 'number' && step.timeout >= 0);
        validation.checks.retryPolicy = !step.retryPolicy || this.validateRetryPolicy(step.retryPolicy).valid;
        validation.checks.typeSpecific = typeValidation.valid;

        return validation;
    }

    /**
     * Validate retry policy
     */
    validateRetryPolicy(retryPolicy) {
        const validation = {
            valid: true,
            issues: []
        };

        if (retryPolicy.maxAttempts !== undefined) {
            if (typeof retryPolicy.maxAttempts !== 'number' || retryPolicy.maxAttempts < 0) {
                validation.valid = false;
                validation.issues.push('Invalid maxAttempts in retry policy');
            }
        }

        if (retryPolicy.backoffStrategy) {
            const validStrategies = ['linear', 'exponential', 'fixed'];
            if (!validStrategies.includes(retryPolicy.backoffStrategy)) {
                validation.valid = false;
                validation.issues.push('Invalid backoff strategy in retry policy');
            }
        }

        if (retryPolicy.initialDelay !== undefined) {
            if (typeof retryPolicy.initialDelay !== 'number' || retryPolicy.initialDelay < 0) {
                validation.valid = false;
                validation.issues.push('Invalid initialDelay in retry policy');
            }
        }

        return validation;
    }

    /**
     * Validate step type configuration
     */
    validateStepTypeConfiguration(step) {
        const validation = {
            valid: true,
            issues: []
        };

        switch (step.type) {
            case 'condition':
                if (!step.condition) {
                    validation.valid = false;
                    validation.issues.push('Condition step missing condition configuration');
                }
                break;
            case 'loop':
                if (!step.loopCondition && !step.iterations) {
                    validation.valid = false;
                    validation.issues.push('Loop step missing loop condition or iterations');
                }
                break;
            case 'parallel':
                if (!step.parallelSteps || !Array.isArray(step.parallelSteps)) {
                    validation.valid = false;
                    validation.issues.push('Parallel step missing parallel steps configuration');
                }
                break;
        }

        return validation;
    }

    /**
     * Validate state transitions
     */
    async validateStateTransitions(steps) {
        const validation = {
            valid: true,
            issues: [],
            transitions: [],
            stateGraph: new Map()
        };

        // Build state transition graph
        let currentState = 'initial';
        validation.stateGraph.set('initial', new Set());

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const nextState = this.getStepNextState(step, i, steps);
            
            const transition = {
                from: currentState,
                to: nextState,
                step: step.name,
                stepIndex: i,
                valid: true,
                issues: []
            };

            // Validate transition
            const transitionValidation = this.validateStateTransition(currentState, nextState, step);
            if (!transitionValidation.valid) {
                transition.valid = false;
                transition.issues = transitionValidation.issues;
                validation.valid = false;
                validation.issues.push(...transitionValidation.issues);
            }

            validation.transitions.push(transition);
            
            // Update state graph
            if (!validation.stateGraph.has(currentState)) {
                validation.stateGraph.set(currentState, new Set());
            }
            validation.stateGraph.get(currentState).add(nextState);
            
            currentState = nextState;
        }

        // Validate final state
        const finalStateValidation = this.validateFinalState(currentState);
        if (!finalStateValidation.valid) {
            validation.valid = false;
            validation.issues.push(...finalStateValidation.issues);
        }

        return validation;
    }

    /**
     * Validate step dependencies
     */
    async validateStepDependencies(steps) {
        const validation = {
            valid: true,
            issues: [],
            dependencyGraph: new Map(),
            circularDependencies: [],
            unresolvedDependencies: []
        };

        // Build dependency graph
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            validation.dependencyGraph.set(step.name, {
                index: i,
                dependencies: step.dependencies || [],
                dependents: []
            });
        }

        // Populate dependents
        for (const [stepName, stepInfo] of validation.dependencyGraph) {
            for (const dependency of stepInfo.dependencies) {
                if (validation.dependencyGraph.has(dependency)) {
                    validation.dependencyGraph.get(dependency).dependents.push(stepName);
                } else {
                    validation.unresolvedDependencies.push({
                        step: stepName,
                        dependency: dependency
                    });
                }
            }
        }

        // Check for circular dependencies
        validation.circularDependencies = this.detectCircularDependencies(validation.dependencyGraph);

        // Validate dependency order
        const orderValidation = this.validateDependencyOrder(steps, validation.dependencyGraph);
        if (!orderValidation.valid) {
            validation.valid = false;
            validation.issues.push(...orderValidation.issues);
        }

        // Report issues
        if (validation.unresolvedDependencies.length > 0) {
            validation.valid = false;
            validation.issues.push(`Unresolved dependencies: ${validation.unresolvedDependencies.map(d => `${d.step} -> ${d.dependency}`).join(', ')}`);
        }

        if (validation.circularDependencies.length > 0) {
            validation.valid = false;
            validation.issues.push(`Circular dependencies detected: ${validation.circularDependencies.join(', ')}`);
        }

        return validation;
    }

    /**
     * Validate workflow data flow
     */
    async validateWorkflowDataFlow(steps) {
        const validation = {
            valid: true,
            issues: [],
            dataFlow: new Map(),
            missingInputs: [],
            unusedOutputs: []
        };

        // Analyze data flow
        const dataProducers = new Map(); // output -> step
        const dataConsumers = new Map(); // input -> steps[]

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Track outputs
            if (step.outputs) {
                for (const output of step.outputs) {
                    dataProducers.set(output, step.name);
                }
            }
            
            // Track inputs
            if (step.inputs) {
                for (const input of step.inputs) {
                    if (!dataConsumers.has(input)) {
                        dataConsumers.set(input, []);
                    }
                    dataConsumers.get(input).push(step.name);
                }
            }
        }

        // Check for missing inputs
        for (const [input, consumers] of dataConsumers) {
            if (!dataProducers.has(input)) {
                validation.missingInputs.push({
                    input,
                    consumers
                });
            }
        }

        // Check for unused outputs
        for (const [output, producer] of dataProducers) {
            if (!dataConsumers.has(output)) {
                validation.unusedOutputs.push({
                    output,
                    producer
                });
            }
        }

        // Report issues
        if (validation.missingInputs.length > 0) {
            validation.valid = false;
            validation.issues.push(`Missing data inputs: ${validation.missingInputs.map(m => m.input).join(', ')}`);
        }

        // Unused outputs are warnings, not errors
        validation.dataFlow.set('producers', dataProducers);
        validation.dataFlow.set('consumers', dataConsumers);

        return validation;
    }

    /**
     * Validate workflow timing
     */
    async validateWorkflowTiming(steps) {
        const validation = {
            valid: true,
            warnings: [],
            timing: {
                totalEstimatedTime: 0,
                criticalPath: [],
                bottlenecks: []
            }
        };

        // Calculate estimated execution time
        let totalTime = 0;
        const stepTimes = new Map();

        for (const step of steps) {
            const estimatedTime = step.estimatedDuration || 1000; // Default 1 second
            stepTimes.set(step.name, estimatedTime);
            totalTime += estimatedTime;
        }

        validation.timing.totalEstimatedTime = totalTime;

        // Identify potential bottlenecks
        const averageTime = totalTime / steps.length;
        for (const [stepName, time] of stepTimes) {
            if (time > averageTime * 3) { // 3x average is considered a bottleneck
                validation.timing.bottlenecks.push({
                    step: stepName,
                    estimatedTime: time,
                    ratio: time / averageTime
                });
            }
        }

        // Calculate critical path (simplified)
        validation.timing.criticalPath = this.calculateCriticalPath(steps, stepTimes);

        // Generate timing warnings
        if (validation.timing.bottlenecks.length > 0) {
            validation.warnings.push(`Potential bottlenecks detected: ${validation.timing.bottlenecks.map(b => b.step).join(', ')}`);
        }

        if (totalTime > 300000) { // 5 minutes
            validation.warnings.push(`Workflow estimated time is very long: ${totalTime}ms`);
        }

        return validation;
    }

    // Helper methods

    initializeStateValidators() {
        this.stateValidators.set('initial', {
            validTransitions: ['executing', 'pending', 'skipped'],
            validator: (fromState, toState, step) => true
        });
        
        this.stateValidators.set('executing', {
            validTransitions: ['completed', 'failed', 'cancelled', 'paused'],
            validator: (fromState, toState, step) => true
        });
        
        this.stateValidators.set('completed', {
            validTransitions: ['archived'],
            validator: (fromState, toState, step) => true
        });
    }

    initializeStepValidators() {
        this.stepValidators.set('action', {
            requiredFields: ['name', 'action'],
            validator: (step) => !!step.action
        });
        
        this.stepValidators.set('condition', {
            requiredFields: ['name', 'condition'],
            validator: (step) => !!step.condition
        });
    }

    initializeWorkflowValidators() {
        // Initialize workflow-level validation rules
    }

    initializeDataFlowValidators() {
        // Initialize data flow validation rules
    }

    getStepNextState(step, index, allSteps) {
        if (index === allSteps.length - 1) {
            return 'completed';
        }
        return `step_${index + 1}`;
    }

    validateStateTransition(fromState, toState, step) {
        const validator = this.stateValidators.get(fromState);
        if (!validator) {
            return { valid: true, issues: [] };
        }

        if (!validator.validTransitions.includes(toState)) {
            return {
                valid: false,
                issues: [`Invalid state transition from ${fromState} to ${toState}`]
            };
        }

        return { valid: true, issues: [] };
    }

    validateFinalState(state) {
        const validFinalStates = ['completed', 'failed', 'cancelled'];
        if (!validFinalStates.includes(state)) {
            return {
                valid: false,
                issues: [`Invalid final state: ${state}`]
            };
        }
        return { valid: true, issues: [] };
    }

    detectCircularDependencies(dependencyGraph) {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const dfs = (node, path) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                cycles.push(path.slice(cycleStart).join(' -> '));
                return;
            }

            if (visited.has(node)) {
                return;
            }

            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const nodeInfo = dependencyGraph.get(node);
            if (nodeInfo) {
                for (const dependency of nodeInfo.dependencies) {
                    dfs(dependency, [...path]);
                }
            }

            recursionStack.delete(node);
            path.pop();
        };

        for (const node of dependencyGraph.keys()) {
            if (!visited.has(node)) {
                dfs(node, []);
            }
        }

        return cycles;
    }

    validateDependencyOrder(steps, dependencyGraph) {
        const validation = { valid: true, issues: [] };
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepInfo = dependencyGraph.get(step.name);
            
            if (stepInfo) {
                for (const dependency of stepInfo.dependencies) {
                    const depInfo = dependencyGraph.get(dependency);
                    if (depInfo && depInfo.index >= i) {
                        validation.valid = false;
                        validation.issues.push(`Step ${step.name} depends on ${dependency} which appears later in the workflow`);
                    }
                }
            }
        }
        
        return validation;
    }

    calculateCriticalPath(steps, stepTimes) {
        // Simplified critical path calculation
        return steps
            .map(step => ({
                name: step.name,
                time: stepTimes.get(step.name) || 1000
            }))
            .sort((a, b) => b.time - a.time)
            .slice(0, Math.ceil(steps.length * 0.3)); // Top 30% of steps by time
    }

    generateWorkflowRecommendations(validation) {
        const recommendations = [];

        if (validation.issues.length > 0) {
            recommendations.push({
                type: 'critical',
                message: 'Fix validation issues before proceeding',
                issues: validation.issues
            });
        }

        if (validation.warnings.length > 0) {
            recommendations.push({
                type: 'warning',
                message: 'Consider addressing validation warnings',
                warnings: validation.warnings
            });
        }

        if (validation.results.timing?.bottlenecks?.length > 0) {
            recommendations.push({
                type: 'optimization',
                message: 'Optimize bottleneck steps for better performance',
                bottlenecks: validation.results.timing.bottlenecks
            });
        }

        return recommendations;
    }

    generateValidationId() {
        return `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getter methods
    getValidationHistory(validationId) {
        return this.validationHistory.get(validationId);
    }

    getAllValidations() {
        return Array.from(this.validationHistory.values());
    }

    getValidationRules() {
        return Array.from(this.validationRules.entries());
    }
}

