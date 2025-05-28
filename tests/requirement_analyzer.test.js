/**
 * Comprehensive tests for the requirement analyzer engine
 */

import { jest } from '@jest/globals';
import {
    RequirementAnalyzer,
    ParsedRequirement,
    AtomicTask,
    DependencyGraph,
    ComplexityScore,
    TaskContext,
    ValidationResult,
    Component,
    CodegenPrompt,
    analyzeRequirement,
    parseNaturalLanguageRequirement,
    decomposeIntoAtomicTasks,
    analyzeTaskDependencies,
    estimateTaskComplexity,
    generateCodegenPrompt,
    extractAffectedComponents,
    validateTaskCompleteness
} from '../src/requirement_analyzer/index.js';

import { sampleRequirements } from '../src/requirement_analyzer/examples.js';

describe('Requirement Analyzer Engine', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new RequirementAnalyzer({
            enableDependencyAnalysis: true,
            enableComplexityEstimation: true,
            maxTasksPerRequirement: 10
        });
    });

    describe('Data Types', () => {
        describe('ParsedRequirement', () => {
            test('should create valid ParsedRequirement', () => {
                const requirement = new ParsedRequirement({
                    id: 'test_req_1',
                    title: 'Test Requirement',
                    description: 'A test requirement for validation',
                    originalText: 'Create a test requirement',
                    technicalSpecs: ['API endpoint'],
                    businessRequirements: ['User can perform action'],
                    acceptanceCriteria: ['System responds correctly'],
                    estimatedComplexity: 3,
                    priority: 'medium',
                    tags: ['test']
                });

                expect(requirement.id).toBe('test_req_1');
                expect(requirement.title).toBe('Test Requirement');
                expect(requirement.estimatedComplexity).toBe(3);
                expect(requirement.priority).toBe('medium');
                expect(requirement.tags).toContain('test');
                expect(requirement.createdAt).toBeDefined();
            });

            test('should validate ParsedRequirement correctly', () => {
                const validRequirement = new ParsedRequirement({
                    id: 'test_req_1',
                    title: 'Test Requirement',
                    description: 'A test requirement',
                    originalText: 'Create a test requirement'
                });

                const validation = validRequirement.validate();
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });

            test('should detect invalid ParsedRequirement', () => {
                const invalidRequirement = new ParsedRequirement({
                    // Missing required fields
                    description: 'A test requirement'
                });

                const validation = invalidRequirement.validate();
                expect(validation.isValid).toBe(false);
                expect(validation.errors.length).toBeGreaterThan(0);
                expect(validation.errors).toContain('ID is required');
                expect(validation.errors).toContain('Title is required');
            });
        });

        describe('AtomicTask', () => {
            test('should create valid AtomicTask', () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'Test Task',
                    description: 'A test task',
                    requirements: ['Requirement 1'],
                    acceptanceCriteria: ['Criteria 1'],
                    affectedFiles: ['src/test.js'],
                    complexityScore: 3,
                    dependencies: [],
                    priority: 'high'
                });

                expect(task.id).toBe('task_1');
                expect(task.title).toBe('Test Task');
                expect(task.complexityScore).toBe(3);
                expect(task.status).toBe('pending');
                expect(task.createdAt).toBeDefined();
            });

            test('should convert task to codegen prompt format', () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'Test Task',
                    description: 'A test task',
                    requirements: ['Requirement 1'],
                    acceptanceCriteria: ['Criteria 1'],
                    complexityScore: 3
                });

                const prompt = task.toCodegenPrompt();
                expect(prompt.title).toBe('Test Task');
                expect(prompt.description).toBe('A test task');
                expect(prompt.requirements).toContain('Requirement 1');
                expect(prompt.acceptanceCriteria).toContain('Criteria 1');
                expect(prompt.estimatedComplexity).toBe(3);
            });

            test('should validate AtomicTask correctly', () => {
                const validTask = new AtomicTask({
                    id: 'task_1',
                    title: 'Test Task',
                    description: 'A test task',
                    complexityScore: 5
                });

                const validation = validTask.validate();
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });

            test('should detect invalid complexity score', () => {
                const invalidTask = new AtomicTask({
                    id: 'task_1',
                    title: 'Test Task',
                    description: 'A test task',
                    complexityScore: 15 // Invalid: > 10
                });

                const validation = invalidTask.validate();
                expect(validation.isValid).toBe(false);
                expect(validation.errors).toContain('Complexity score must be between 1 and 10');
            });
        });

        describe('DependencyGraph', () => {
            test('should create and manage dependency graph', () => {
                const graph = new DependencyGraph();
                const task1 = new AtomicTask({ id: 'task_1', title: 'Task 1', description: 'First task' });
                const task2 = new AtomicTask({ id: 'task_2', title: 'Task 2', description: 'Second task' });

                graph.addTask(task1);
                graph.addTask(task2);
                graph.addDependency('task_1', 'task_2');

                expect(graph.nodes.size).toBe(2);
                expect(graph.edges.get('task_1').has('task_2')).toBe(true);
                expect(graph.reverseEdges.get('task_2').has('task_1')).toBe(true);
            });

            test('should detect circular dependencies', () => {
                const graph = new DependencyGraph();
                const task1 = new AtomicTask({ id: 'task_1', title: 'Task 1', description: 'First task' });
                const task2 = new AtomicTask({ id: 'task_2', title: 'Task 2', description: 'Second task' });
                const task3 = new AtomicTask({ id: 'task_3', title: 'Task 3', description: 'Third task' });

                graph.addTask(task1);
                graph.addTask(task2);
                graph.addTask(task3);
                
                // Create circular dependency: task_1 -> task_2 -> task_3 -> task_1
                graph.addDependency('task_1', 'task_2');
                graph.addDependency('task_2', 'task_3');
                graph.addDependency('task_3', 'task_1');

                const cycles = graph.detectCircularDependencies();
                expect(cycles.length).toBeGreaterThan(0);
            });

            test('should return topological order for acyclic graph', () => {
                const graph = new DependencyGraph();
                const task1 = new AtomicTask({ id: 'task_1', title: 'Task 1', description: 'First task' });
                const task2 = new AtomicTask({ id: 'task_2', title: 'Task 2', description: 'Second task' });
                const task3 = new AtomicTask({ id: 'task_3', title: 'Task 3', description: 'Third task' });

                graph.addTask(task1);
                graph.addTask(task2);
                graph.addTask(task3);
                
                // task_1 -> task_2 -> task_3
                graph.addDependency('task_1', 'task_2');
                graph.addDependency('task_2', 'task_3');

                const order = graph.getTopologicalOrder();
                expect(order).toHaveLength(3);
                expect(order[0].id).toBe('task_1');
                expect(order[1].id).toBe('task_2');
                expect(order[2].id).toBe('task_3');
            });

            test('should throw error for cyclic graph topological sort', () => {
                const graph = new DependencyGraph();
                const task1 = new AtomicTask({ id: 'task_1', title: 'Task 1', description: 'First task' });
                const task2 = new AtomicTask({ id: 'task_2', title: 'Task 2', description: 'Second task' });

                graph.addTask(task1);
                graph.addTask(task2);
                
                // Create cycle
                graph.addDependency('task_1', 'task_2');
                graph.addDependency('task_2', 'task_1');

                expect(() => graph.getTopologicalOrder()).toThrow('Circular dependencies detected');
            });
        });

        describe('ComplexityScore', () => {
            test('should create and calculate complexity score', () => {
                const complexity = new ComplexityScore({
                    technical: 8,
                    business: 6,
                    integration: 4,
                    testing: 3,
                    documentation: 2
                });

                expect(complexity.technical).toBe(8);
                expect(complexity.business).toBe(6);
                expect(complexity.getOverallScore()).toBeGreaterThan(0);
                expect(complexity.getOverallScore()).toBeLessThanOrEqual(10);
            });

            test('should clamp values to valid range', () => {
                const complexity = new ComplexityScore({
                    technical: 15, // Should be clamped to 10
                    business: -5,  // Should be clamped to 1
                    integration: 0 // Should be clamped to 1
                });

                expect(complexity.technical).toBe(10);
                expect(complexity.business).toBe(1);
                expect(complexity.integration).toBe(1);
            });

            test('should categorize complexity correctly', () => {
                const lowComplexity = new ComplexityScore({ technical: 1, business: 1, integration: 1 });
                const highComplexity = new ComplexityScore({ technical: 10, business: 10, integration: 10 });

                expect(lowComplexity.getCategory()).toBe('low');
                expect(highComplexity.getCategory()).toBe('very-high');
            });
        });

        describe('CodegenPrompt', () => {
            test('should create and format codegen prompt', () => {
                const prompt = new CodegenPrompt({
                    title: 'Test Prompt',
                    description: 'A test prompt for codegen',
                    context: { framework: 'React' },
                    requirements: ['Requirement 1'],
                    acceptanceCriteria: ['Criteria 1'],
                    priority: 'high',
                    estimatedComplexity: 5
                });

                expect(prompt.title).toBe('Test Prompt');
                expect(prompt.priority).toBe('high');
                expect(prompt.estimatedComplexity).toBe(5);
                expect(prompt.generatedAt).toBeDefined();

                const formatted = prompt.format();
                expect(formatted).toContain('# Test Prompt');
                expect(formatted).toContain('## Description');
                expect(formatted).toContain('## Requirements');
                expect(formatted).toContain('## Priority: high');
                expect(formatted).toContain('## Estimated Complexity: 5/10');
            });
        });
    });

    describe('RequirementAnalyzer', () => {
        describe('parseRequirements', () => {
            test('should parse simple requirement text', async () => {
                const requirement = await analyzer.parseRequirements(sampleRequirements.simple);

                expect(requirement).toBeInstanceOf(ParsedRequirement);
                expect(requirement.id).toBeDefined();
                expect(requirement.title).toBeDefined();
                expect(requirement.description).toBeDefined();
                expect(requirement.originalText).toBe(sampleRequirements.simple);
                expect(requirement.estimatedComplexity).toBeGreaterThan(0);
                expect(requirement.priority).toBeDefined();
            });

            test('should extract technical specifications', async () => {
                const requirement = await analyzer.parseRequirements(sampleRequirements.complex);

                expect(requirement.technicalSpecs.length).toBeGreaterThan(0);
                expect(requirement.businessRequirements.length).toBeGreaterThan(0);
                expect(requirement.acceptanceCriteria.length).toBeGreaterThan(0);
            });

            test('should handle empty or invalid input', async () => {
                await expect(analyzer.parseRequirements('')).rejects.toThrow();
                await expect(analyzer.parseRequirements(null)).rejects.toThrow();
            });
        });

        describe('decomposeTask', () => {
            test('should decompose requirement into atomic tasks', async () => {
                const requirement = await analyzer.parseRequirements(sampleRequirements.simple);
                const tasks = await analyzer.decomposeTask(requirement);

                expect(Array.isArray(tasks)).toBe(true);
                expect(tasks.length).toBeGreaterThan(0);
                expect(tasks.length).toBeLessThanOrEqual(analyzer.options.maxTasksPerRequirement);

                tasks.forEach(task => {
                    expect(task).toBeInstanceOf(AtomicTask);
                    expect(task.id).toBeDefined();
                    expect(task.title).toBeDefined();
                    expect(task.description).toBeDefined();
                    expect(task.parentRequirementId).toBe(requirement.id);
                });
            });

            test('should create tasks with appropriate complexity', async () => {
                const requirement = await analyzer.parseRequirements(sampleRequirements.complex);
                const tasks = await analyzer.decomposeTask(requirement);

                tasks.forEach(task => {
                    expect(task.complexityScore).toBeGreaterThanOrEqual(1);
                    expect(task.complexityScore).toBeLessThanOrEqual(10);
                });
            });

            test('should handle different requirement types', async () => {
                const workflowRequirement = await analyzer.parseRequirements(sampleRequirements.workflow);
                const workflowTasks = await analyzer.decomposeTask(workflowRequirement);

                const bugfixRequirement = await analyzer.parseRequirements(sampleRequirements.bugfix);
                const bugfixTasks = await analyzer.decomposeTask(bugfixRequirement);

                expect(workflowTasks.length).toBeGreaterThan(0);
                expect(bugfixTasks.length).toBeGreaterThan(0);
            });
        });

        describe('analyzeDependencies', () => {
            test('should analyze dependencies between tasks', async () => {
                const requirement = await analyzer.parseRequirements(sampleRequirements.workflow);
                const tasks = await analyzer.decomposeTask(requirement);
                const dependencyGraph = await analyzer.analyzeDependencies(tasks);

                expect(dependencyGraph).toBeInstanceOf(DependencyGraph);
                expect(dependencyGraph.nodes.size).toBe(tasks.length);

                // Check that all tasks are in the graph
                tasks.forEach(task => {
                    expect(dependencyGraph.nodes.has(task.id)).toBe(true);
                });
            });

            test('should handle tasks with no dependencies', async () => {
                const simpleTasks = [
                    new AtomicTask({ id: 'task_1', title: 'Task 1', description: 'Independent task 1' }),
                    new AtomicTask({ id: 'task_2', title: 'Task 2', description: 'Independent task 2' })
                ];

                const dependencyGraph = await analyzer.analyzeDependencies(simpleTasks);
                expect(dependencyGraph.nodes.size).toBe(2);
                expect(dependencyGraph.edges.get('task_1').size).toBe(0);
                expect(dependencyGraph.edges.get('task_2').size).toBe(0);
            });
        });

        describe('estimateComplexity', () => {
            test('should estimate task complexity', async () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'Complex Integration Task',
                    description: 'Implement complex API integration with external service',
                    affectedFiles: ['src/api/integration.js', 'src/services/external.js'],
                    requirements: ['API integration', 'Error handling', 'Authentication']
                });

                const complexityScore = await analyzer.estimateComplexity(task);

                expect(complexityScore).toBeInstanceOf(ComplexityScore);
                expect(complexityScore.getOverallScore()).toBeGreaterThan(0);
                expect(complexityScore.getOverallScore()).toBeLessThanOrEqual(10);
                expect(complexityScore.getCategory()).toBeDefined();
            });
        });

        describe('generateTaskContext', () => {
            test('should generate comprehensive task context', async () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'API Implementation',
                    description: 'Implement REST API endpoints',
                    affectedFiles: ['src/api/routes.js', 'src/controllers/user.js']
                });

                const context = await analyzer.generateTaskContext(task);

                expect(context).toBeInstanceOf(TaskContext);
                expect(context.codebaseContext).toBeDefined();
                expect(context.technicalConstraints).toBeDefined();
                expect(context.businessContext).toBeDefined();
                expect(context.generatedAt).toBeDefined();
            });
        });

        describe('generateCodegenPrompt', () => {
            test('should generate codegen prompt from task', async () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'User Authentication',
                    description: 'Implement user authentication system',
                    requirements: ['Login functionality', 'Password validation'],
                    acceptanceCriteria: ['Users can login', 'Invalid credentials rejected'],
                    affectedFiles: ['src/auth/login.js'],
                    complexityScore: 4
                });

                const prompt = await analyzer.generateCodegenPrompt(task);

                expect(prompt).toBeInstanceOf(CodegenPrompt);
                expect(prompt.title).toBe(task.title);
                expect(prompt.description).toBe(task.description);
                expect(prompt.requirements).toEqual(task.requirements);
                expect(prompt.acceptanceCriteria).toEqual(task.acceptanceCriteria);
                expect(prompt.estimatedComplexity).toBe(task.complexityScore);
            });
        });

        describe('extractAffectedComponents', () => {
            test('should extract affected components from task', async () => {
                const task = new AtomicTask({
                    id: 'task_1',
                    title: 'Database Migration',
                    description: 'Create user table migration and update user service',
                    affectedFiles: ['migrations/001_create_users.sql', 'src/services/user.js']
                });

                const components = await analyzer.extractAffectedComponents(task);

                expect(Array.isArray(components)).toBe(true);
                components.forEach(component => {
                    expect(component).toBeInstanceOf(Component);
                    expect(component.name).toBeDefined();
                    expect(component.type).toBeDefined();
                    expect(component.path).toBeDefined();
                });
            });
        });

        describe('validateTaskCompleteness', () => {
            test('should validate complete task', async () => {
                const completeTask = new AtomicTask({
                    id: 'task_1',
                    title: 'Complete Task',
                    description: 'A well-defined task with all required information',
                    requirements: ['Requirement 1', 'Requirement 2'],
                    acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
                    affectedFiles: ['src/component.js'],
                    complexityScore: 3,
                    testStrategy: 'Unit tests and integration tests',
                    implementationNotes: 'Use existing patterns and follow coding standards'
                });

                const validation = await analyzer.validateTaskCompleteness(completeTask);

                expect(validation).toBeInstanceOf(ValidationResult);
                expect(validation.isValid).toBe(true);
                expect(validation.score).toBeGreaterThan(80);
            });

            test('should identify incomplete task', async () => {
                const incompleteTask = new AtomicTask({
                    id: 'task_1',
                    title: 'Incomplete Task',
                    description: 'A task missing important information',
                    complexityScore: 9 // High complexity should trigger warning
                });

                const validation = await analyzer.validateTaskCompleteness(incompleteTask);

                expect(validation.warnings.length).toBeGreaterThan(0);
                expect(validation.suggestions.length).toBeGreaterThan(0);
                expect(validation.score).toBeLessThan(100);
            });
        });
    });

    describe('Convenience Functions', () => {
        test('parseNaturalLanguageRequirement should work', async () => {
            const requirement = await parseNaturalLanguageRequirement(sampleRequirements.simple);
            expect(requirement).toBeInstanceOf(ParsedRequirement);
        });

        test('decomposeIntoAtomicTasks should work', async () => {
            const requirement = await parseNaturalLanguageRequirement(sampleRequirements.simple);
            const tasks = await decomposeIntoAtomicTasks(requirement);
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThan(0);
        });

        test('analyzeTaskDependencies should work', async () => {
            const requirement = await parseNaturalLanguageRequirement(sampleRequirements.simple);
            const tasks = await decomposeIntoAtomicTasks(requirement);
            const dependencyGraph = await analyzeTaskDependencies(tasks);
            expect(dependencyGraph).toBeInstanceOf(DependencyGraph);
        });

        test('estimateTaskComplexity should work', async () => {
            const task = new AtomicTask({
                id: 'task_1',
                title: 'Test Task',
                description: 'A test task for complexity estimation'
            });
            const complexity = await estimateTaskComplexity(task);
            expect(complexity).toBeInstanceOf(ComplexityScore);
        });

        test('generateCodegenPrompt should work', async () => {
            const task = new AtomicTask({
                id: 'task_1',
                title: 'Test Task',
                description: 'A test task for prompt generation'
            });
            const prompt = await generateCodegenPrompt(task);
            expect(prompt).toBeInstanceOf(CodegenPrompt);
        });

        test('extractAffectedComponents should work', async () => {
            const task = new AtomicTask({
                id: 'task_1',
                title: 'Test Task',
                description: 'A test task for component extraction',
                affectedFiles: ['src/test.js']
            });
            const components = await extractAffectedComponents(task);
            expect(Array.isArray(components)).toBe(true);
        });

        test('validateTaskCompleteness should work', async () => {
            const task = new AtomicTask({
                id: 'task_1',
                title: 'Test Task',
                description: 'A test task for validation'
            });
            const validation = await validateTaskCompleteness(task);
            expect(validation).toBeInstanceOf(ValidationResult);
        });
    });

    describe('Integration Tests', () => {
        test('complete workflow should work end-to-end', async () => {
            const result = await analyzeRequirement(sampleRequirements.simple, {
                enableDependencyAnalysis: true,
                enableComplexityEstimation: true
            });

            expect(result.requirement).toBeInstanceOf(ParsedRequirement);
            expect(Array.isArray(result.tasks)).toBe(true);
            expect(result.dependencyGraph).toBeInstanceOf(DependencyGraph);
            expect(Array.isArray(result.codegenPrompts)).toBe(true);
            expect(Array.isArray(result.validationResults)).toBe(true);
            expect(result.summary).toBeDefined();

            // Verify summary statistics
            expect(result.summary.totalTasks).toBe(result.tasks.length);
            expect(result.summary.averageComplexity).toBeGreaterThan(0);
            expect(result.summary.validTasks).toBeLessThanOrEqual(result.summary.totalTasks);
        });

        test('should handle complex requirements', async () => {
            const result = await analyzeRequirement(sampleRequirements.complex, {
                maxTasksPerRequirement: 15
            });

            expect(result.tasks.length).toBeGreaterThan(3);
            expect(result.summary.averageComplexity).toBeGreaterThan(2);
            expect(result.codegenPrompts.length).toBe(result.tasks.length);
        });

        test('should handle workflow requirements', async () => {
            const result = await analyzeRequirement(sampleRequirements.workflow);

            expect(result.tasks.length).toBeGreaterThan(2);
            expect(result.dependencyGraph.edges.size).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid requirement text', async () => {
            await expect(analyzer.parseRequirements('')).rejects.toThrow();
            await expect(analyzer.parseRequirements(null)).rejects.toThrow();
            await expect(analyzer.parseRequirements(undefined)).rejects.toThrow();
        });

        test('should handle invalid task decomposition', async () => {
            const invalidRequirement = new ParsedRequirement({
                id: 'invalid',
                title: '',
                description: '',
                originalText: ''
            });

            await expect(analyzer.decomposeTask(invalidRequirement)).rejects.toThrow();
        });

        test('should handle empty task list for dependency analysis', async () => {
            const dependencyGraph = await analyzer.analyzeDependencies([]);
            expect(dependencyGraph.nodes.size).toBe(0);
        });
    });

    describe('Performance Tests', () => {
        test('should handle large requirements efficiently', async () => {
            const largeRequirement = sampleRequirements.complex.repeat(5);
            const startTime = Date.now();

            const result = await analyzeRequirement(largeRequirement, {
                maxTasksPerRequirement: 20
            });

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
            expect(result.tasks.length).toBeGreaterThan(0);
        }, 15000);

        test('should handle multiple concurrent analyses', async () => {
            const promises = [
                analyzeRequirement(sampleRequirements.simple),
                analyzeRequirement(sampleRequirements.bugfix),
                analyzeRequirement(sampleRequirements.integration)
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.requirement).toBeInstanceOf(ParsedRequirement);
                expect(result.tasks.length).toBeGreaterThan(0);
            });
        });
    });
});

