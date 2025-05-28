/**
 * @fileoverview Comprehensive SDK Integration Tests
 * @description Tests for the production Codegen SDK integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CodegenClient, CodegenTask, CodegenError } from '../../src/ai_cicd_system/core/codegen_client.js';
import { NLPProcessor } from '../../src/ai_cicd_system/core/nlp_processor.js';
import { PromptGenerator } from '../../src/ai_cicd_system/core/prompt_generator.js';
import { QualityValidator } from '../../src/ai_cicd_system/core/quality_validator.js';
import { CodegenIntegrator } from '../../src/ai_cicd_system/core/codegen_integrator.js';

// Mock axios for HTTP requests
jest.mock('axios');

describe('Codegen SDK Integration', () => {
    let mockAxios;
    let codegenClient;
    let integrator;

    beforeEach(() => {
        mockAxios = require('axios');
        mockAxios.create = jest.fn(() => mockAxios);
        mockAxios.interceptors = {
            request: { use: jest.fn() },
            response: { use: jest.fn() }
        };

        // Reset mocks
        jest.clearAllMocks();
    });

    afterEach(async () => {
        if (codegenClient && codegenClient.shutdown) {
            await codegenClient.shutdown();
        }
        if (integrator && integrator.shutdown) {
            await integrator.shutdown();
        }
    });

    describe('CodegenClient', () => {
        test('should initialize with valid configuration', () => {
            expect(() => {
                codegenClient = new CodegenClient({
                    apiKey: 'test-api-key',
                    baseUrl: 'https://api.test.com',
                    timeout: 30000,
                    retries: 3
                });
            }).not.toThrow();

            expect(codegenClient).toBeDefined();
            expect(mockAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://api.test.com',
                timeout: 30000,
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master/1.0.0'
                }
            });
        });

        test('should throw error when API key is missing', () => {
            expect(() => {
                new CodegenClient({
                    baseUrl: 'https://api.test.com'
                });
            }).toThrow('API key is required for Codegen client');
        });

        test('should create task successfully', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const mockResponse = {
                data: {
                    id: 'task-123',
                    status: 'pending',
                    prompt: 'Test prompt',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            };

            mockAxios.post.mockResolvedValue(mockResponse);

            const taskData = {
                prompt: 'Test prompt',
                context: { repository: 'test/repo' },
                options: { taskType: 'feature_development' }
            };

            const task = await codegenClient.createTask(taskData);

            expect(task).toBeInstanceOf(CodegenTask);
            expect(task.id).toBe('task-123');
            expect(task.status).toBe('pending');
            expect(mockAxios.post).toHaveBeenCalledWith('/v1/tasks', {
                prompt: 'Test prompt',
                context: { repository: 'test/repo' },
                repository: undefined,
                branch: undefined,
                options: { taskType: 'feature_development' }
            });
        });

        test('should handle API errors gracefully', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const mockError = {
                response: {
                    status: 401,
                    data: { message: 'Unauthorized' }
                }
            };

            mockAxios.post.mockRejectedValue(mockError);

            const taskData = {
                prompt: 'Test prompt',
                context: {},
                options: {}
            };

            await expect(codegenClient.createTask(taskData)).rejects.toThrow(CodegenError);
        });

        test('should validate connection', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            mockAxios.get.mockResolvedValue({
                data: { status: 'healthy' }
            });

            const health = await codegenClient.validateConnection();

            expect(health.status).toBe('healthy');
            expect(mockAxios.get).toHaveBeenCalledWith('/v1/health');
        });

        test('should respect rate limiting', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com',
                rateLimit: {
                    requests: 2,
                    window: 1000
                }
            });

            mockAxios.post.mockResolvedValue({
                data: { id: 'task-123', status: 'pending' }
            });

            const taskData = {
                prompt: 'Test prompt',
                context: {},
                options: {}
            };

            // First two requests should go through
            await codegenClient.createTask(taskData);
            await codegenClient.createTask(taskData);

            // Third request should be delayed
            const startTime = Date.now();
            await codegenClient.createTask(taskData);
            const endTime = Date.now();

            expect(endTime - startTime).toBeGreaterThan(900); // Should wait ~1 second
        });
    });

    describe('CodegenTask', () => {
        test('should refresh task status', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const taskData = {
                id: 'task-123',
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const task = new CodegenTask(taskData, codegenClient);

            mockAxios.get.mockResolvedValue({
                data: {
                    ...taskData,
                    status: 'completed',
                    result: { pr_url: 'https://github.com/test/repo/pull/123' }
                }
            });

            await task.refresh();

            expect(task.status).toBe('completed');
            expect(task.result).toEqual({ pr_url: 'https://github.com/test/repo/pull/123' });
            expect(mockAxios.get).toHaveBeenCalledWith('/v1/tasks/task-123');
        });

        test('should wait for completion with polling', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const taskData = {
                id: 'task-123',
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const task = new CodegenTask(taskData, codegenClient);

            // Mock progression: pending -> running -> completed
            let callCount = 0;
            mockAxios.get.mockImplementation(() => {
                callCount++;
                const statuses = ['running', 'completed'];
                const status = callCount <= statuses.length ? statuses[callCount - 1] : 'completed';
                
                return Promise.resolve({
                    data: {
                        ...taskData,
                        status,
                        result: status === 'completed' ? { pr_url: 'https://github.com/test/repo/pull/123' } : null
                    }
                });
            });

            const result = await task.waitForCompletion({
                pollInterval: 100,
                maxWaitTime: 5000
            });

            expect(result).toEqual({ pr_url: 'https://github.com/test/repo/pull/123' });
            expect(task.status).toBe('completed');
        });

        test('should timeout if task takes too long', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const taskData = {
                id: 'task-123',
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const task = new CodegenTask(taskData, codegenClient);

            // Always return pending status
            mockAxios.get.mockResolvedValue({
                data: { ...taskData, status: 'pending' }
            });

            await expect(task.waitForCompletion({
                pollInterval: 100,
                maxWaitTime: 500
            })).rejects.toThrow('timed out');
        });
    });

    describe('NLP Processor', () => {
        test('should process natural language task description', async () => {
            const nlpProcessor = new NLPProcessor();

            const taskDescription = 'Implement a new user authentication system with JWT tokens and password hashing';
            const context = { repository: 'test/repo' };

            const structuredTask = await nlpProcessor.processTask(taskDescription, context);

            expect(structuredTask).toHaveProperty('id');
            expect(structuredTask).toHaveProperty('type');
            expect(structuredTask).toHaveProperty('objectives');
            expect(structuredTask).toHaveProperty('requirements');
            expect(structuredTask).toHaveProperty('complexity');
            expect(structuredTask.originalDescription).toBe(taskDescription);
        });

        test('should classify task intent correctly', async () => {
            const nlpProcessor = new NLPProcessor();

            const testCases = [
                {
                    description: 'Fix the login bug that prevents users from signing in',
                    expectedType: 'bug_fix'
                },
                {
                    description: 'Add a new feature for user profile management',
                    expectedType: 'feature_development'
                },
                {
                    description: 'Refactor the authentication module to improve performance',
                    expectedType: 'refactoring'
                },
                {
                    description: 'Write unit tests for the payment processing module',
                    expectedType: 'testing'
                }
            ];

            for (const testCase of testCases) {
                const structuredTask = await nlpProcessor.processTask(testCase.description);
                expect(structuredTask.type).toBe(testCase.expectedType);
            }
        });

        test('should analyze task complexity', async () => {
            const nlpProcessor = new NLPProcessor();

            const complexTask = 'Implement a distributed microservices architecture with API gateway, service discovery, load balancing, and comprehensive monitoring across multiple databases';
            const simpleTask = 'Fix a typo in the user interface';

            const complexStructured = await nlpProcessor.processTask(complexTask);
            const simpleStructured = await nlpProcessor.processTask(simpleTask);

            expect(complexStructured.complexity.level).toBe('high');
            expect(simpleStructured.complexity.level).toBe('low');
        });
    });

    describe('Prompt Generator', () => {
        test('should generate optimized prompt from structured task', async () => {
            const promptGenerator = new PromptGenerator();

            const structuredTask = {
                id: 'task-123',
                type: 'feature_development',
                originalDescription: 'Add user authentication',
                objectives: ['Implement secure login', 'Add password hashing'],
                requirements: ['Use JWT tokens', 'Hash passwords with bcrypt'],
                constraints: ['Must be backward compatible'],
                deliverables: ['Working authentication system', 'Unit tests'],
                complexity: { level: 'medium', score: 5 },
                technologies: ['javascript', 'node.js', 'jwt'],
                bestPractices: ['Use secure coding practices']
            };

            const context = { repository: 'test/repo' };

            const promptData = await promptGenerator.generatePrompt(structuredTask, context);

            expect(promptData).toHaveProperty('prompt');
            expect(promptData).toHaveProperty('metadata');
            expect(promptData).toHaveProperty('template');
            expect(promptData.prompt).toContain('feature_development');
            expect(promptData.prompt).toContain('Add user authentication');
            expect(promptData.metadata.taskType).toBe('feature_development');
        });

        test('should select appropriate template based on task type', async () => {
            const promptGenerator = new PromptGenerator();

            const testCases = [
                { type: 'feature_development', expectedTemplate: 'feature_development' },
                { type: 'bug_fix', expectedTemplate: 'bug_fix' },
                { type: 'testing', expectedTemplate: 'testing' },
                { type: 'unknown_type', expectedTemplate: 'default' }
            ];

            for (const testCase of testCases) {
                const structuredTask = {
                    id: 'task-123',
                    type: testCase.type,
                    originalDescription: 'Test task',
                    objectives: ['Test objective'],
                    requirements: ['Test requirement'],
                    constraints: [],
                    deliverables: ['Test deliverable'],
                    complexity: { level: 'low', score: 2 },
                    technologies: [],
                    bestPractices: []
                };

                const promptData = await promptGenerator.generatePrompt(structuredTask);
                expect(promptData.template).toBe(testCase.expectedTemplate);
            }
        });

        test('should optimize prompt length when too long', async () => {
            const promptGenerator = new PromptGenerator({
                maxPromptLength: 500
            });

            const structuredTask = {
                id: 'task-123',
                type: 'feature_development',
                originalDescription: 'A'.repeat(1000), // Very long description
                objectives: ['Objective 1', 'Objective 2'],
                requirements: ['Requirement 1', 'Requirement 2'],
                constraints: ['Constraint 1'],
                deliverables: ['Deliverable 1'],
                complexity: { level: 'medium', score: 5 },
                technologies: ['javascript'],
                bestPractices: ['Best practice 1']
            };

            const promptData = await promptGenerator.generatePrompt(structuredTask);

            expect(promptData.prompt.length).toBeLessThanOrEqual(500);
            expect(promptData.optimization.applied).toBe(true);
        });
    });

    describe('Quality Validator', () => {
        test('should validate prompt quality', async () => {
            const qualityValidator = new QualityValidator();

            const goodPromptData = {
                prompt: `# Task: FEATURE_DEVELOPMENT

## Objective
Implement user authentication system

## Requirements
- Use JWT tokens
- Hash passwords with bcrypt

## Expected Output
Working authentication system with tests`,
                metadata: {
                    taskType: 'feature_development',
                    length: 200
                }
            };

            const validation = await qualityValidator.validatePrompt(goodPromptData);

            expect(validation.isValid).toBe(true);
            expect(validation.score).toBeGreaterThan(70);
            expect(validation.issues).toHaveLength(0);
        });

        test('should identify prompt quality issues', async () => {
            const qualityValidator = new QualityValidator();

            const poorPromptData = {
                prompt: 'Do something', // Very short and unclear
                metadata: {
                    taskType: 'unknown',
                    length: 12
                }
            };

            const validation = await qualityValidator.validatePrompt(poorPromptData);

            expect(validation.isValid).toBe(false);
            expect(validation.score).toBeLessThan(50);
            expect(validation.issues.length).toBeGreaterThan(0);
        });

        test('should validate Codegen response quality', async () => {
            const qualityValidator = new QualityValidator();

            const goodResponse = {
                success: true,
                data: {
                    pr_url: 'https://github.com/test/repo/pull/123',
                    pr_number: 123,
                    branch_name: 'feature/auth',
                    title: 'Add user authentication',
                    modified_files: ['src/auth.js', 'tests/auth.test.js']
                }
            };

            const originalTask = {
                type: 'feature_development',
                objectives: ['Implement authentication'],
                technologies: ['javascript']
            };

            const validation = await qualityValidator.validateResponse(goodResponse, originalTask);

            expect(validation.isValid).toBe(true);
            expect(validation.overallScore).toBeGreaterThan(70);
        });
    });

    describe('Codegen Integrator', () => {
        test('should process complete task pipeline', async () => {
            integrator = new CodegenIntegrator({
                mockMode: true,
                development: { mockMode: true }
            });

            const taskDescription = 'Implement a user registration feature with email validation';
            const context = { repository: 'test/repo' };

            const result = await integrator.processTask(taskDescription, context);

            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('task');
            expect(result).toHaveProperty('prompt');
            expect(result).toHaveProperty('response');
            expect(result).toHaveProperty('validation');
            expect(result.task.type).toBeDefined();
            expect(result.prompt.prompt).toBeDefined();
        });

        test('should handle processing errors gracefully', async () => {
            integrator = new CodegenIntegrator({
                mockMode: false,
                api: { apiKey: 'invalid-key' }
            });

            // Mock failed API call
            mockAxios.post.mockRejectedValue(new Error('API Error'));

            const taskDescription = 'Test task';
            const context = {};

            await expect(integrator.processTask(taskDescription, context)).rejects.toThrow();
        });

        test('should provide system health status', async () => {
            integrator = new CodegenIntegrator({
                mockMode: true,
                development: { mockMode: true }
            });

            const health = await integrator.validateHealth();

            expect(health).toHaveProperty('status');
            expect(health).toHaveProperty('components');
            expect(health.components).toHaveProperty('codegenClient');
            expect(health.components).toHaveProperty('rateLimiter');
            expect(health.components).toHaveProperty('quotaManager');
        });

        test('should provide processing statistics', async () => {
            integrator = new CodegenIntegrator({
                mockMode: true,
                development: { mockMode: true }
            });

            const stats = await integrator.getStatistics();

            expect(stats).toHaveProperty('requests');
            expect(stats).toHaveProperty('rateLimiting');
            expect(stats).toHaveProperty('quota');
            expect(stats).toHaveProperty('performance');
            expect(stats.requests).toHaveProperty('total');
            expect(stats.requests).toHaveProperty('active');
            expect(stats.requests).toHaveProperty('successful');
            expect(stats.requests).toHaveProperty('failed');
        });
    });

    describe('Error Handling', () => {
        test('should handle network errors', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const networkError = new Error('Network Error');
            networkError.code = 'ECONNREFUSED';

            mockAxios.post.mockRejectedValue(networkError);

            const taskData = {
                prompt: 'Test prompt',
                context: {},
                options: {}
            };

            await expect(codegenClient.createTask(taskData)).rejects.toThrow(CodegenError);
        });

        test('should handle timeout errors', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const timeoutError = new Error('Timeout');
            timeoutError.code = 'ETIMEDOUT';

            mockAxios.post.mockRejectedValue(timeoutError);

            const taskData = {
                prompt: 'Test prompt',
                context: {},
                options: {}
            };

            await expect(codegenClient.createTask(taskData)).rejects.toThrow(CodegenError);
        });

        test('should handle rate limit errors', async () => {
            codegenClient = new CodegenClient({
                apiKey: 'test-api-key',
                baseUrl: 'https://api.test.com'
            });

            const rateLimitError = {
                response: {
                    status: 429,
                    data: { message: 'Rate limit exceeded' }
                }
            };

            mockAxios.post.mockRejectedValue(rateLimitError);

            const taskData = {
                prompt: 'Test prompt',
                context: {},
                options: {}
            };

            await expect(codegenClient.createTask(taskData)).rejects.toThrow(CodegenError);
        });
    });

    describe('Performance', () => {
        test('should process tasks within acceptable time limits', async () => {
            integrator = new CodegenIntegrator({
                mockMode: true,
                development: { mockMode: true, mockDelay: 100 }
            });

            const taskDescription = 'Simple test task';
            const context = {};

            const startTime = Date.now();
            const result = await integrator.processTask(taskDescription, context);
            const endTime = Date.now();

            expect(result.success).toBe(true);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('should handle concurrent requests', async () => {
            integrator = new CodegenIntegrator({
                mockMode: true,
                development: { mockMode: true, mockDelay: 100 }
            });

            const taskDescription = 'Concurrent test task';
            const context = {};

            const promises = Array(5).fill().map(() => 
                integrator.processTask(taskDescription, context)
            );

            const results = await Promise.all(promises);

            expect(results).toHaveLength(5);
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });
    });
});

