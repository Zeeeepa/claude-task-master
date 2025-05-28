/**
 * @fileoverview Task Processing Workflow Tests
 * @description Comprehensive tests for the TaskProcessingWorkflow class
 */

import { jest } from '@jest/globals';
import { TaskProcessingWorkflow } from '../../../src/ai_cicd_system/orchestrator/workflow_definitions/task_processing_workflow.js';

describe('TaskProcessingWorkflow', () => {
    let mockEventBus;
    let mockOrchestrator;

    beforeEach(() => {
        mockEventBus = {
            emit: jest.fn()
        };

        mockOrchestrator = {
            taskManager: {
                updateTaskStatus: jest.fn()
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        test('should initialize with valid context', () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task description',
                    type: 'feature',
                    priority: 'high'
                },
                orchestrator: mockOrchestrator,
                eventBus: mockEventBus
            };

            const workflow = new TaskProcessingWorkflow(context);

            expect(workflow.context).toBe(context);
            expect(workflow.steps).toHaveLength(6);
            expect(workflow.getStepNames()).toEqual([
                'initialize',
                'analyze_requirements',
                'plan_execution',
                'execute_processing',
                'validate_results',
                'finalize'
            ]);
        });

        test('should setup steps correctly', () => {
            const workflow = new TaskProcessingWorkflow({
                task: { id: 'test', description: 'test' }
            });

            const stepNames = workflow.getStepNames();
            expect(stepNames).toContain('initialize');
            expect(stepNames).toContain('analyze_requirements');
            expect(stepNames).toContain('plan_execution');
            expect(stepNames).toContain('execute_processing');
            expect(stepNames).toContain('validate_results');
            expect(stepNames).toContain('finalize');
        });
    });

    describe('Context Validation', () => {
        test('should validate required task context', () => {
            const workflow = new TaskProcessingWorkflow({});

            expect(() => workflow.validateContext()).toThrow('Task is required for TaskProcessingWorkflow');
        });

        test('should validate task ID requirement', () => {
            const workflow = new TaskProcessingWorkflow({
                task: { description: 'test' }
            });

            expect(() => workflow.validateContext()).toThrow('Task ID is required');
        });

        test('should validate task description requirement', () => {
            const workflow = new TaskProcessingWorkflow({
                task: { id: 'test_id' }
            });

            expect(() => workflow.validateContext()).toThrow('Task description is required');
        });

        test('should pass validation with valid context', () => {
            const workflow = new TaskProcessingWorkflow({
                task: {
                    id: 'test_id',
                    description: 'Test description'
                }
            });

            expect(() => workflow.validateContext()).not.toThrow();
        });
    });

    describe('Workflow Execution', () => {
        let validContext;

        beforeEach(() => {
            validContext = {
                task: {
                    id: 'task_123',
                    description: 'Implement user authentication system with JWT tokens and password hashing',
                    type: 'feature',
                    priority: 'high',
                    requirements: ['security', 'performance'],
                    dependencies: [{ id: 'dep1', type: 'api' }],
                    assignee: 'developer1'
                },
                orchestrator: mockOrchestrator,
                eventBus: mockEventBus
            };
        });

        test('should execute complete workflow successfully', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            workflow.id = 'test_workflow_id';

            const result = await workflow.execute();

            expect(result).toBeDefined();
            expect(result.taskId).toBe('task_123');
            expect(result.taskType).toBe('feature');
            expect(result.finalStatus).toBeDefined();
            expect(workflow.status).toBe('completed');
        });

        test('should initialize task metadata correctly', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            // Execute just the first step
            const initStep = workflow.getStep('initialize');
            const result = await initStep.execute(validContext, []);

            expect(result.status).toBe('initialized');
            expect(result.taskId).toBe('task_123');
            expect(result.metadata).toBeDefined();
            expect(result.metadata.taskType).toBe('feature');
            expect(result.metadata.priority).toBe('high');
        });

        test('should analyze task requirements', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            const analyzeStep = workflow.getStep('analyze_requirements');
            const initResult = { metadata: { taskId: 'task_123' } };
            const result = await analyzeStep.execute(validContext, [initResult]);

            expect(result.status).toBe('analyzed');
            expect(result.analysis).toBeDefined();
            expect(result.analysis.complexity).toMatch(/low|medium|high/);
            expect(result.analysis.requiredSkills).toBeInstanceOf(Array);
            expect(result.analysis.estimatedEffort).toBeDefined();
            expect(result.recommendations).toBeInstanceOf(Array);
        });

        test('should create execution plan', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            const planStep = workflow.getStep('plan_execution');
            const analysisResult = {
                analysis: {
                    complexity: 'medium',
                    estimatedEffort: { estimatedHours: 8 },
                    riskFactors: [],
                    dependencies: { count: 1 }
                }
            };
            const result = await planStep.execute(validContext, [null, analysisResult]);

            expect(result.status).toBe('planned');
            expect(result.executionPlan).toBeDefined();
            expect(result.executionPlan.phases).toBeInstanceOf(Array);
            expect(result.executionPlan.timeline).toBeDefined();
            expect(result.nextSteps).toBeInstanceOf(Array);
        });

        test('should execute task processing', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            const executeStep = workflow.getStep('execute_processing');
            const planResult = {
                executionPlan: {
                    phases: [
                        { name: 'preparation', steps: ['setup'] },
                        { name: 'implementation', steps: ['code'] }
                    ]
                }
            };
            
            const result = await executeStep.execute(validContext, [null, null, planResult]);

            expect(result.status).toBe('processed');
            expect(result.result).toBeDefined();
            expect(result.artifacts).toBeInstanceOf(Array);
            expect(result.metrics).toBeDefined();
        });

        test('should validate processing results', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            const validateStep = workflow.getStep('validate_results');
            const processingResult = {
                result: { taskId: 'task_123' },
                artifacts: [{ type: 'code', path: '/src/test.js' }],
                metrics: { testCoverage: 85, processingTime: 5000 }
            };
            
            const result = await validateStep.execute(validContext, [null, null, null, processingResult]);

            expect(result.status).toBe('validated');
            expect(result.validation).toBeDefined();
            expect(result.isValid).toBeDefined();
            expect(result.validation.validationChecks).toBeInstanceOf(Array);
        });

        test('should finalize task successfully', async () => {
            const workflow = new TaskProcessingWorkflow(validContext);
            
            const finalizeStep = workflow.getStep('finalize');
            const validationResult = {
                validation: { isValid: true, issues: [] }
            };
            const processingResult = {
                result: { taskId: 'task_123' },
                artifacts: [{ type: 'code' }],
                metrics: { testCoverage: 85 }
            };
            
            const result = await finalizeStep.execute(
                validContext, 
                [null, null, null, processingResult, validationResult]
            );

            expect(result.taskId).toBe('task_123');
            expect(result.status).toMatch(/completed|completed_with_issues/);
            expect(result.summary).toBeDefined();
            expect(mockOrchestrator.taskManager.updateTaskStatus).toHaveBeenCalled();
        });
    });

    describe('Task Analysis', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TaskProcessingWorkflow({
                task: { id: 'test', description: 'test' }
            });
        });

        test('should analyze low complexity task', () => {
            const task = {
                description: 'Fix typo in documentation',
                requirements: []
            };

            const complexity = workflow._analyzeComplexity(task);
            expect(complexity).toBe('low');
        });

        test('should analyze medium complexity task', () => {
            const task = {
                description: 'Implement user authentication with JWT tokens and session management',
                requirements: ['security', 'performance', 'testing']
            };

            const complexity = workflow._analyzeComplexity(task);
            expect(complexity).toBe('medium');
        });

        test('should analyze high complexity task', () => {
            const task = {
                description: 'Complete system architecture refactor with microservices migration, performance optimization, and integration testing across multiple services',
                requirements: ['architecture', 'performance', 'testing', 'migration', 'integration']
            };

            const complexity = workflow._analyzeComplexity(task);
            expect(complexity).toBe('high');
        });

        test('should extract required skills from task description', () => {
            const task = {
                description: 'Implement React frontend with TypeScript, integrate with Node.js backend, deploy using Docker and AWS'
            };

            const skills = workflow._extractRequiredSkills(task);
            expect(skills).toContain('javascript');
            expect(skills).toContain('typescript');
            expect(skills).toContain('react');
            expect(skills).toContain('node');
            expect(skills).toContain('docker');
            expect(skills).toContain('aws');
        });

        test('should estimate effort based on complexity', () => {
            const lowTask = { description: 'Simple fix', requirements: [] };
            const mediumTask = { description: 'Medium complexity task', requirements: ['req1', 'req2'] };
            const highTask = { description: 'Complex integration task', requirements: ['req1', 'req2', 'req3', 'req4'] };

            const lowEffort = workflow._estimateEffort(lowTask);
            const mediumEffort = workflow._estimateEffort(mediumTask);
            const highEffort = workflow._estimateEffort(highTask);

            expect(lowEffort.estimatedHours).toBe(2);
            expect(mediumEffort.estimatedHours).toBe(8);
            expect(highEffort.estimatedHours).toBe(24);
        });

        test('should identify risk factors', () => {
            const riskyTask = {
                description: 'Migrate legacy system with data migration',
                dependencies: [1, 2, 3, 4] // More than 3 dependencies
            };

            const risks = workflow._identifyRiskFactors(riskyTask);
            expect(risks.length).toBeGreaterThan(0);
            expect(risks.some(risk => risk.type === 'technical')).toBe(true);
            expect(risks.some(risk => risk.type === 'dependency')).toBe(true);
        });
    });

    describe('Execution Planning', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TaskProcessingWorkflow({
                task: { id: 'test', description: 'test' }
            });
        });

        test('should create execution phases', () => {
            const analysis = {
                complexity: 'medium',
                estimatedEffort: { estimatedHours: 8 }
            };

            const phases = workflow._createExecutionPhases(analysis);
            expect(phases).toHaveLength(4);
            expect(phases[0].name).toBe('preparation');
            expect(phases[1].name).toBe('implementation');
            expect(phases[2].name).toBe('testing');
            expect(phases[3].name).toBe('finalization');
        });

        test('should create timeline from phases', () => {
            const analysis = {
                complexity: 'medium',
                estimatedEffort: { estimatedHours: 4 }
            };

            const timeline = workflow._createTimeline(analysis);
            expect(timeline).toHaveLength(4);
            expect(timeline[0].phase).toBe('preparation');
            expect(timeline[0].startTime).toBeInstanceOf(Date);
            expect(timeline[0].endTime).toBeInstanceOf(Date);
        });

        test('should determine resource requirements', () => {
            const highComplexityAnalysis = { complexity: 'high', requiredSkills: ['docker'] };
            const mediumComplexityAnalysis = { complexity: 'medium', requiredSkills: [] };

            const highResources = workflow._determineResourceRequirements(highComplexityAnalysis);
            const mediumResources = workflow._determineResourceRequirements(mediumComplexityAnalysis);

            expect(highResources.cpu).toBe('high');
            expect(highResources.memory).toBe('2GB');
            expect(highResources.specialTools).toContain('docker');

            expect(mediumResources.cpu).toBe('medium');
            expect(mediumResources.memory).toBe('1GB');
        });
    });

    describe('Validation Logic', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TaskProcessingWorkflow({
                task: { id: 'test', description: 'test' }
            });
        });

        test('should perform validation checks', async () => {
            const context = { task: { id: 'test_task' } };
            const processingResult = {
                artifacts: [{ type: 'code', path: '/src/test.js' }],
                metrics: { testCoverage: 85, processingTime: 5000 }
            };

            const checks = await workflow._performValidationChecks(context, processingResult);
            expect(checks).toBeInstanceOf(Array);
            expect(checks.length).toBeGreaterThan(0);
            
            const artifactCheck = checks.find(check => check.type === 'artifacts');
            expect(artifactCheck).toBeDefined();
            expect(artifactCheck.passed).toBe(true);
        });

        test('should calculate quality score', () => {
            const processingResult = {
                metrics: { testCoverage: 90 }
            };
            const validationResult = {
                validation: { issues: [] }
            };

            const score = workflow._calculateQualityScore(processingResult, validationResult);
            expect(score).toBeGreaterThan(90); // High coverage + no issues + bonus
        });

        test('should generate task summary', () => {
            const stepResults = [
                null, null, null, null, null,
                { status: 'completed' }
            ];
            workflow.context = { task: { id: 'test_task' } };

            const summary = workflow._generateTaskSummary(stepResults);
            expect(summary).toContain('test_task');
            expect(summary).toContain('completed');
        });
    });

    describe('Result Building', () => {
        test('should build comprehensive result', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task',
                    type: 'feature'
                },
                orchestrator: mockOrchestrator,
                eventBus: mockEventBus
            };

            const workflow = new TaskProcessingWorkflow(context);
            const result = await workflow.execute();

            expect(result.taskId).toBe('task_123');
            expect(result.taskType).toBe('feature');
            expect(result.processingMetrics).toBeDefined();
            expect(result.validationResult).toBeDefined();
            expect(result.executionPlan).toBeDefined();
            expect(result.finalStatus).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle missing orchestrator gracefully', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task'
                }
                // No orchestrator
            };

            const workflow = new TaskProcessingWorkflow(context);
            const result = await workflow.execute();

            expect(result).toBeDefined();
            expect(result.taskId).toBe('task_123');
        });

        test('should handle task processing failure', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task'
                }
            };

            const workflow = new TaskProcessingWorkflow(context);
            
            // Mock the processing step to fail
            const originalStep = workflow.getStep('execute_processing');
            workflow.removeStep('execute_processing');
            workflow.addStep('execute_processing', async () => {
                throw new Error('Processing failed');
            });

            await expect(workflow.execute()).rejects.toThrow('Processing failed');
        });
    });

    describe('Performance', () => {
        test('should complete workflow within reasonable time', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Performance test task',
                    type: 'feature'
                }
            };

            const workflow = new TaskProcessingWorkflow(context);
            
            const startTime = Date.now();
            await workflow.execute();
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
        });

        test('should handle large task descriptions efficiently', () => {
            const largeDescription = 'A'.repeat(10000); // 10KB description
            const task = {
                description: largeDescription,
                requirements: []
            };

            const workflow = new TaskProcessingWorkflow({
                task: { id: 'test', description: 'test' }
            });

            const startTime = Date.now();
            const complexity = workflow._analyzeComplexity(task);
            const endTime = Date.now();

            expect(complexity).toBeDefined();
            expect(endTime - startTime).toBeLessThan(100); // Should analyze within 100ms
        });
    });

    describe('Integration', () => {
        test('should emit events during execution', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task'
                },
                eventBus: mockEventBus
            };

            const workflow = new TaskProcessingWorkflow(context);
            workflow.id = 'test_workflow_id';

            await workflow.execute();

            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.started', expect.any(Object));
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.completed', expect.any(Object));
        });

        test('should update task status through orchestrator', async () => {
            const context = {
                task: {
                    id: 'task_123',
                    description: 'Test task'
                },
                orchestrator: mockOrchestrator
            };

            const workflow = new TaskProcessingWorkflow(context);
            await workflow.execute();

            expect(mockOrchestrator.taskManager.updateTaskStatus).toHaveBeenCalledWith(
                'task_123',
                expect.any(String),
                expect.any(Object)
            );
        });
    });
});

