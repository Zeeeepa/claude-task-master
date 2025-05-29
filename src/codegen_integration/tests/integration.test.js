/**
 * @fileoverview Comprehensive tests for codegen integration system
 * Tests all major components and workflows
 */

import { jest } from '@jest/globals';
import {
    CodegenIntegration,
    PromptGenerator,
    CodegenClient,
    PRTracker,
    TASK_TYPES,
    CODEGEN_STATUS,
    PR_STATUS
} from '../index.js';
import { MockDataGenerators } from '../examples.js';

describe('Codegen Integration System', () => {
    let integration;
    let mockTask;
    let mockContext;

    beforeEach(() => {
        integration = new CodegenIntegration({
            enableTracking: true,
            maxRetries: 2
        });
        
        mockTask = MockDataGenerators.createMockTask();
        mockContext = MockDataGenerators.createMockContext();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Prompt Generation', () => {
        test('should generate valid prompt for implementation task', () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);

            expect(prompt).toBeDefined();
            expect(prompt.content).toContain(mockTask.title);
            expect(prompt.content).toContain(mockTask.description);
            expect(prompt.task_id).toBe(mockTask.id);
            expect(prompt.task_type).toBe(mockTask.type);
            expect(prompt.metadata).toBeDefined();
            expect(prompt.metadata.estimated_complexity).toBeGreaterThan(0);
        });

        test('should generate prompt for bug fix task', () => {
            const bugTask = MockDataGenerators.createMockTask({
                type: TASK_TYPES.BUG_FIX,
                title: 'Fix critical bug',
                metadata: {
                    severity: 'high',
                    reproduction_steps: ['Step 1', 'Step 2']
                }
            });

            const prompt = integration.generatePrompt(bugTask, mockContext);

            expect(prompt.content).toContain('Bug Fix');
            expect(prompt.task_type).toBe(TASK_TYPES.BUG_FIX);
        });

        test('should handle missing context gracefully', () => {
            const prompt = integration.generatePrompt(mockTask, null);

            expect(prompt).toBeDefined();
            expect(prompt.content).toContain(mockTask.title);
        });

        test('should include codebase context when provided', () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);

            expect(prompt.content).toContain(mockContext.codebase_context.language);
            expect(prompt.content).toContain(mockContext.codebase_context.framework);
        });
    });

    describe('Codegen API Integration', () => {
        test('should send codegen request successfully', async () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);
            const response = await integration.sendCodegenRequest(prompt);

            expect(response).toBeDefined();
            expect(response.request_id).toBeDefined();
            expect(response.status).toBe(CODEGEN_STATUS.COMPLETED);
            expect(response.pr_info).toBeDefined();
            expect(response.pr_info.pr_url).toContain('github.com');
        });

        test('should handle API errors gracefully', async () => {
            // Mock a failing request
            const failingClient = new CodegenClient({ apiKey: 'invalid' });
            integration.codegenClient = failingClient;

            const prompt = integration.generatePrompt(mockTask, mockContext);
            
            await expect(integration.sendCodegenRequest(prompt)).rejects.toThrow();
        });

        test('should track active requests', async () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);
            
            // Start request (don't await to check active state)
            const requestPromise = integration.sendCodegenRequest(prompt);
            
            // Check if request is tracked as active
            expect(integration.activeRequests.has(mockTask.id)).toBe(true);
            
            // Wait for completion
            await requestPromise;
            
            // Should be moved to history
            expect(integration.activeRequests.has(mockTask.id)).toBe(false);
            expect(integration.requestHistory.has(mockTask.id)).toBe(true);
        });
    });

    describe('PR Tracking', () => {
        test('should track PR creation', async () => {
            const mockPRInfo = MockDataGenerators.createMockPRInfo();
            
            await integration.trackPRCreation(mockTask.id, mockPRInfo);
            
            const prStatus = await integration.getPRStatus(mockTask.id);
            expect(prStatus).toBeDefined();
            expect(prStatus.pr_url).toBe(mockPRInfo.pr_url);
            expect(prStatus.pr_number).toBe(mockPRInfo.pr_number);
        });

        test('should update PR status', async () => {
            const mockPRInfo = MockDataGenerators.createMockPRInfo();
            await integration.trackPRCreation(mockTask.id, mockPRInfo);
            
            await integration.prTracker.updatePRStatus(
                mockPRInfo.pr_url, 
                PR_STATUS.MERGED,
                { source: 'test' }
            );
            
            const prStatus = await integration.getPRStatus(mockTask.id);
            expect(prStatus.status).toBe(PR_STATUS.MERGED);
        });

        test('should add check results', async () => {
            const mockPRInfo = MockDataGenerators.createMockPRInfo();
            await integration.trackPRCreation(mockTask.id, mockPRInfo);
            
            await integration.prTracker.addCheckResult(mockPRInfo.pr_url, {
                name: 'CI/CD',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://example.com/check'
            });
            
            const prStatus = await integration.getPRStatus(mockTask.id);
            expect(prStatus.checks).toHaveLength(1);
            expect(prStatus.checks[0].name).toBe('CI/CD');
        });
    });

    describe('Complete Workflow', () => {
        test('should process task end-to-end', async () => {
            const result = await integration.processTask(mockTask, mockContext);

            expect(result).toBeDefined();
            expect(result.workflow_id).toBeDefined();
            expect(result.task_id).toBe(mockTask.id);
            expect(result.status).toBe(CODEGEN_STATUS.COMPLETED);
            expect(result.pr_info).toBeDefined();
            expect(result.completed_at).toBeDefined();
        });

        test('should handle workflow failures', async () => {
            // Create a task that will fail
            const failingTask = MockDataGenerators.createMockTask({
                id: 'failing_task'
            });

            // Mock the client to fail
            integration.codegenClient.sendCodegenRequest = jest.fn().mockRejectedValue(
                new Error('API Error')
            );

            const result = await integration.processTask(failingTask, mockContext);

            expect(result.status).toBe(CODEGEN_STATUS.FAILED);
            expect(result.error_message).toContain('API Error');
            expect(result.pr_info).toBeNull();
        });
    });

    describe('Error Handling and Retries', () => {
        test('should retry failed requests', async () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);
            
            // Mock initial failure
            integration.codegenClient.sendCodegenRequest = jest.fn()
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce({
                    request_id: 'retry_success',
                    status: CODEGEN_STATUS.COMPLETED,
                    pr_info: MockDataGenerators.createMockPRInfo(),
                    error_message: null,
                    metadata: {},
                    timestamp: Date.now()
                });

            // First request should fail
            await expect(integration.sendCodegenRequest(prompt)).rejects.toThrow();

            // Retry should succeed
            const retryResult = await integration.retryFailedRequest(mockTask.id);
            expect(retryResult.status).toBe(CODEGEN_STATUS.COMPLETED);
        });

        test('should get request status', async () => {
            const prompt = integration.generatePrompt(mockTask, mockContext);
            await integration.sendCodegenRequest(prompt);

            const status = await integration.getCodegenStatus(mockTask.id);
            expect(status).toBeDefined();
            expect(status.request_id).toBe(mockTask.id);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should provide integration statistics', async () => {
            // Process a few tasks
            await integration.processTask(mockTask, mockContext);
            
            const anotherTask = MockDataGenerators.createMockTask({
                id: 'task_2'
            });
            await integration.processTask(anotherTask, mockContext);

            const stats = await integration.getStatistics();

            expect(stats).toBeDefined();
            expect(stats.completed_requests).toBeGreaterThan(0);
            expect(stats.success_rate).toBeGreaterThanOrEqual(0);
            expect(stats.pr_stats).toBeDefined();
        });

        test('should calculate success rate correctly', async () => {
            // Process successful task
            await integration.processTask(mockTask, mockContext);

            // Process failing task
            const failingTask = MockDataGenerators.createMockTask({
                id: 'failing_task'
            });
            integration.codegenClient.sendCodegenRequest = jest.fn().mockRejectedValue(
                new Error('Failure')
            );
            await integration.processTask(failingTask, mockContext);

            const stats = await integration.getStatistics();
            expect(stats.success_rate).toBe(50); // 1 success out of 2 total
        });
    });

    describe('Cleanup Operations', () => {
        test('should cleanup old data', async () => {
            // Process some tasks
            await integration.processTask(mockTask, mockContext);

            // Mock old timestamps
            const oldRequest = integration.requestHistory.get(mockTask.id);
            oldRequest.completed_at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
            integration.requestHistory.set(mockTask.id, oldRequest);

            const cleanupResult = await integration.cleanup(7); // 7 days

            expect(cleanupResult.cleaned_requests).toBeGreaterThan(0);
            expect(cleanupResult.cleanup_date).toBeDefined();
        });
    });
});

describe('PromptGenerator', () => {
    let generator;
    let mockTask;
    let mockContext;

    beforeEach(() => {
        generator = new PromptGenerator();
        mockTask = MockDataGenerators.createMockTask();
        mockContext = MockDataGenerators.createMockContext();
    });

    test('should create implementation prompt', () => {
        const prompt = generator.createImplementationPrompt(mockTask);
        
        expect(prompt).toContain(mockTask.title);
        expect(prompt).toContain(mockTask.description);
        expect(prompt).toContain('Implementation Task');
    });

    test('should add codebase context', () => {
        const basePrompt = 'Base prompt with {codebase_context} placeholder';
        const enhanced = generator.addCodebaseContext(basePrompt, mockContext.codebase_context);
        
        expect(enhanced).toContain(mockContext.codebase_context.language);
        expect(enhanced).not.toContain('{codebase_context}');
    });

    test('should include acceptance criteria', () => {
        const basePrompt = 'Base prompt with {acceptance_criteria} placeholder';
        const criteria = ['Criteria 1', 'Criteria 2'];
        const enhanced = generator.includeAcceptanceCriteria(basePrompt, criteria);
        
        expect(enhanced).toContain('1. Criteria 1');
        expect(enhanced).toContain('2. Criteria 2');
    });

    test('should estimate complexity', () => {
        const simpleTask = MockDataGenerators.createMockTask({
            description: 'Simple task'
        });
        const complexTask = MockDataGenerators.createMockTask({
            description: 'Complex task involving database migration, API integration, security, performance optimization, and architectural refactoring'
        });

        const simplePrompt = generator.generatePrompt(simpleTask, mockContext);
        const complexPrompt = generator.generatePrompt(complexTask, mockContext);

        expect(complexPrompt.metadata.estimated_complexity).toBeGreaterThan(
            simplePrompt.metadata.estimated_complexity
        );
    });
});

describe('CodegenClient', () => {
    let client;

    beforeEach(() => {
        client = new CodegenClient(); // Will use mock mode
    });

    test('should create mock response in mock mode', async () => {
        const mockPrompt = {
            content: 'Test prompt',
            task_type: TASK_TYPES.IMPLEMENTATION,
            metadata: {}
        };

        const response = await client.sendCodegenRequest(mockPrompt, 'test_task');

        expect(response.status).toBe(CODEGEN_STATUS.COMPLETED);
        expect(response.pr_info).toBeDefined();
        expect(response.pr_info.pr_url).toContain('github.com');
        expect(response.metadata.mock_mode).toBe(true);
    });

    test('should get mock status', async () => {
        const status = await client.getCodegenStatus('test_request');

        expect(status.status).toBe(CODEGEN_STATUS.COMPLETED);
        expect(status.progress).toBe(100);
    });

    test('should handle retry requests', async () => {
        const response = await client.retryFailedRequest('test_request');

        expect(response.status).toBe(CODEGEN_STATUS.PROCESSING);
        expect(response.metadata.retry_attempt).toBe(true);
    });
});

describe('PRTracker', () => {
    let tracker;
    let mockPRInfo;

    beforeEach(() => {
        tracker = new PRTracker();
        mockPRInfo = MockDataGenerators.createMockPRInfo();
    });

    test('should track PR creation', async () => {
        await tracker.trackPRCreation('test_task', mockPRInfo);

        const status = await tracker.getPRStatus('test_task');
        expect(status).toBeDefined();
        expect(status.pr_url).toBe(mockPRInfo.pr_url);
    });

    test('should update PR status', async () => {
        await tracker.trackPRCreation('test_task', mockPRInfo);
        await tracker.updatePRStatus(mockPRInfo.pr_url, PR_STATUS.MERGED);

        const allPRs = await tracker.getAllTrackedPRs();
        const trackedPR = allPRs.find(pr => pr.pr_info.pr_url === mockPRInfo.pr_url);
        
        expect(trackedPR.pr_info.status).toBe(PR_STATUS.MERGED);
    });

    test('should get PRs by status', async () => {
        await tracker.trackPRCreation('test_task_1', mockPRInfo);
        
        const anotherPR = MockDataGenerators.createMockPRInfo();
        await tracker.trackPRCreation('test_task_2', anotherPR);
        await tracker.updatePRStatus(anotherPR.pr_url, PR_STATUS.MERGED);

        const openPRs = await tracker.getPRsByStatus(PR_STATUS.OPEN);
        const mergedPRs = await tracker.getPRsByStatus(PR_STATUS.MERGED);

        expect(openPRs).toHaveLength(1);
        expect(mergedPRs).toHaveLength(1);
    });

    test('should provide PR statistics', async () => {
        await tracker.trackPRCreation('test_task_1', mockPRInfo);
        
        const anotherPR = MockDataGenerators.createMockPRInfo();
        await tracker.trackPRCreation('test_task_2', anotherPR);
        await tracker.updatePRStatus(anotherPR.pr_url, PR_STATUS.MERGED);

        const stats = await tracker.getPRStatistics();

        expect(stats.total).toBe(2);
        expect(stats.by_status[PR_STATUS.OPEN]).toBe(1);
        expect(stats.by_status[PR_STATUS.MERGED]).toBe(1);
        expect(stats.success_rate).toBe(100); // 1 merged out of 1 closed
    });
});

