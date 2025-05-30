/**
 * @fileoverview Tests for Codegen Integration Client
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CodegenIntegration } from '../../../src/integrations/codegen/client.js';

// Mock the Codegen SDK
jest.mock('@codegen/sdk', () => ({
    CodegenSDK: jest.fn().mockImplementation(() => ({
        generate: jest.fn(),
        getTask: jest.fn(),
        createPR: jest.fn(),
        health: jest.fn(),
        close: jest.fn()
    }))
}));

describe('CodegenIntegration', () => {
    let codegenIntegration;
    let mockSDK;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Create instance
        codegenIntegration = new CodegenIntegration('test-api-key', 'test-org-id');
        mockSDK = codegenIntegration.client;
    });

    afterEach(async () => {
        if (codegenIntegration) {
            await codegenIntegration.shutdown();
        }
    });

    describe('constructor', () => {
        test('should initialize with required parameters', () => {
            expect(codegenIntegration.apiKey).toBe('test-api-key');
            expect(codegenIntegration.orgId).toBe('test-org-id');
            expect(codegenIntegration.client).toBeDefined();
        });

        test('should throw error without API key', () => {
            expect(() => {
                new CodegenIntegration(null, 'test-org-id');
            }).toThrow('Codegen Integration requires apiKey and orgId');
        });

        test('should throw error without org ID', () => {
            expect(() => {
                new CodegenIntegration('test-api-key', null);
            }).toThrow('Codegen Integration requires apiKey and orgId');
        });

        test('should accept custom options', () => {
            const customOptions = {
                baseURL: 'https://custom.api.com',
                timeout: 60000
            };
            
            const integration = new CodegenIntegration('key', 'org', customOptions);
            expect(integration.options.baseURL).toBe('https://custom.api.com');
            expect(integration.options.timeout).toBe(60000);
        });
    });

    describe('generateCode', () => {
        test('should generate code successfully', async () => {
            const mockResponse = {
                id: 'task-123',
                status: 'pending'
            };
            
            mockSDK.generate.mockResolvedValue(mockResponse);

            const requirements = {
                title: 'Test Feature',
                description: 'Test description',
                technicalSpecs: ['Use React', 'Add tests'],
                acceptanceCriteria: ['Should work', 'Should be tested']
            };

            const result = await codegenIntegration.generateCode(requirements);

            expect(mockSDK.generate).toHaveBeenCalledWith({
                prompt: expect.stringContaining('Test Feature'),
                context: {
                    repository: undefined,
                    branch: 'main',
                    files: []
                },
                options: {
                    createPR: true,
                    runTests: true,
                    autoFix: true
                }
            });

            expect(result).toEqual(mockResponse);
        });

        test('should handle generation errors', async () => {
            mockSDK.generate.mockRejectedValue(new Error('API Error'));

            const requirements = {
                title: 'Test Feature',
                description: 'Test description'
            };

            await expect(codegenIntegration.generateCode(requirements))
                .rejects.toThrow('Code generation failed: API Error');
        });

        test('should format requirements correctly', async () => {
            mockSDK.generate.mockResolvedValue({ id: 'task-123' });

            const requirements = {
                title: 'Complex Feature',
                description: 'A complex feature implementation',
                technicalSpecs: ['Use TypeScript', 'Add validation'],
                acceptanceCriteria: ['Must be type-safe', 'Must validate input'],
                affectedFiles: ['src/feature.ts', 'tests/feature.test.ts'],
                dependencies: ['lodash', 'joi']
            };

            await codegenIntegration.generateCode(requirements);

            const calledPrompt = mockSDK.generate.mock.calls[0][0].prompt;
            
            expect(calledPrompt).toContain('# Task: Complex Feature');
            expect(calledPrompt).toContain('## Description');
            expect(calledPrompt).toContain('A complex feature implementation');
            expect(calledPrompt).toContain('## Technical Requirements');
            expect(calledPrompt).toContain('- Use TypeScript');
            expect(calledPrompt).toContain('## Acceptance Criteria');
            expect(calledPrompt).toContain('- Must be type-safe');
            expect(calledPrompt).toContain('## Files to Modify/Create');
            expect(calledPrompt).toContain('- src/feature.ts');
            expect(calledPrompt).toContain('## Dependencies');
            expect(calledPrompt).toContain('- lodash');
        });
    });

    describe('monitorTask', () => {
        test('should monitor task successfully', async () => {
            const mockTaskStatus = {
                id: 'task-123',
                status: 'running',
                progress: 50
            };
            
            mockSDK.getTask.mockResolvedValue(mockTaskStatus);

            const result = await codegenIntegration.monitorTask('task-123');

            expect(mockSDK.getTask).toHaveBeenCalledWith('task-123');
            expect(result).toEqual(mockTaskStatus);
        });

        test('should handle monitoring errors', async () => {
            mockSDK.getTask.mockRejectedValue(new Error('Task not found'));

            await expect(codegenIntegration.monitorTask('invalid-task'))
                .rejects.toThrow('Task monitoring failed: Task not found');
        });
    });

    describe('createPR', () => {
        test('should create PR successfully', async () => {
            const mockPRResponse = {
                id: 'pr-123',
                url: 'https://github.com/org/repo/pull/123',
                number: 123
            };
            
            mockSDK.createPR.mockResolvedValue(mockPRResponse);

            const taskData = {
                id: 'task-123',
                title: 'Test Feature',
                description: 'Test description',
                generatedFiles: ['src/feature.js', 'tests/feature.test.js']
            };

            const result = await codegenIntegration.createPR(taskData);

            expect(mockSDK.createPR).toHaveBeenCalledWith({
                title: '🤖 Test Feature',
                description: expect.stringContaining('# 🤖 Automated Implementation: Test Feature'),
                branch: 'codegen-bot/task-123',
                baseBranch: 'main',
                files: ['src/feature.js', 'tests/feature.test.js']
            });

            expect(result).toEqual(mockPRResponse);
        });

        test('should handle PR creation errors', async () => {
            mockSDK.createPR.mockRejectedValue(new Error('PR creation failed'));

            const taskData = {
                id: 'task-123',
                title: 'Test Feature'
            };

            await expect(codegenIntegration.createPR(taskData))
                .rejects.toThrow('PR creation failed: PR creation failed');
        });

        test('should format PR description correctly', async () => {
            mockSDK.createPR.mockResolvedValue({ id: 'pr-123' });

            const taskData = {
                id: 'task-123',
                title: 'Complex Feature',
                description: 'A complex feature',
                generatedFiles: ['src/feature.ts', 'tests/feature.test.ts'],
                testResults: {
                    total: 10,
                    passed: 9,
                    failed: 1
                },
                linearIssueId: 'linear-456',
                taskId: 'internal-789'
            };

            await codegenIntegration.createPR(taskData);

            const calledDescription = mockSDK.createPR.mock.calls[0][0].description;
            
            expect(calledDescription).toContain('# 🤖 Automated Implementation: Complex Feature');
            expect(calledDescription).toContain('## Generated Files');
            expect(calledDescription).toContain('- src/feature.ts');
            expect(calledDescription).toContain('## Test Results');
            expect(calledDescription).toContain('- Tests Run: 10');
            expect(calledDescription).toContain('- Tests Passed: 9');
            expect(calledDescription).toContain('**Related Linear Issue:** linear-456');
            expect(calledDescription).toContain('**Task ID:** internal-789');
        });
    });

    describe('formatRequirements', () => {
        test('should format minimal requirements', () => {
            const requirements = {
                title: 'Simple Feature'
            };

            const formatted = codegenIntegration.formatRequirements(requirements);

            expect(formatted).toContain('# Task: Simple Feature');
            expect(formatted).toContain('Please implement this feature following best practices');
        });

        test('should handle empty arrays gracefully', () => {
            const requirements = {
                title: 'Feature',
                technicalSpecs: [],
                acceptanceCriteria: [],
                affectedFiles: [],
                dependencies: []
            };

            const formatted = codegenIntegration.formatRequirements(requirements);

            expect(formatted).toContain('# Task: Feature');
            expect(formatted).not.toContain('## Technical Requirements');
            expect(formatted).not.toContain('## Acceptance Criteria');
        });
    });

    describe('getHealth', () => {
        test('should return health status successfully', async () => {
            const mockHealth = {
                status: 'healthy',
                version: '1.0.0'
            };
            
            mockSDK.health.mockResolvedValue(mockHealth);

            const health = await codegenIntegration.getHealth();

            expect(health.status).toBe('healthy');
            expect(health.apiKey).toBe(true);
            expect(health.orgId).toBe('test-org-id');
            expect(health.baseURL).toBe('https://api.codegen.sh');
        });

        test('should handle health check errors', async () => {
            mockSDK.health.mockRejectedValue(new Error('Service unavailable'));

            const health = await codegenIntegration.getHealth();

            expect(health.status).toBe('error');
            expect(health.error).toBe('Service unavailable');
        });
    });

    describe('shutdown', () => {
        test('should shutdown gracefully', async () => {
            await codegenIntegration.shutdown();

            expect(mockSDK.close).toHaveBeenCalled();
        });

        test('should handle shutdown when client has no close method', async () => {
            delete mockSDK.close;

            // Should not throw
            await expect(codegenIntegration.shutdown()).resolves.toBeUndefined();
        });
    });
});

