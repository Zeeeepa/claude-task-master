/**
 * @fileoverview Tests for Codegen Integration Client
 */

import { jest } from '@jest/globals';
import { CodegenClient } from '../../../src/integrations/codegen/client.js';

// Mock the component modules
jest.mock('../../../src/integrations/codegen/auth.js', () => ({
    CodegenAuth: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        getStatus: jest.fn().mockReturnValue({ authenticated: true }),
        shutdown: jest.fn().mockResolvedValue(),
        on: jest.fn()
    }))
}));

jest.mock('../../../src/integrations/codegen/prompt_generator.js', () => ({
    PromptGenerator: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        generatePrompt: jest.fn().mockResolvedValue({
            content: 'Test prompt',
            metadata: { taskId: 'test-task', template: 'test' }
        }),
        shutdown: jest.fn().mockResolvedValue()
    }))
}));

jest.mock('../../../src/integrations/codegen/pr_manager.js', () => ({
    PRManager: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        createPR: jest.fn().mockResolvedValue({
            url: 'https://github.com/test/repo/pull/123',
            number: 123,
            branchName: 'test-branch'
        }),
        shutdown: jest.fn().mockResolvedValue(),
        on: jest.fn()
    }))
}));

jest.mock('../../../src/integrations/codegen/feedback_handler.js', () => ({
    FeedbackHandler: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        handleError: jest.fn().mockResolvedValue({ action: 'feedback_sent' }),
        shutdown: jest.fn().mockResolvedValue(),
        on: jest.fn()
    }))
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('CodegenClient', () => {
    let client;
    const mockConfig = {
        cloudflareApi: {
            baseUrl: 'https://test-api.com',
            apiKey: 'test-api-key'
        },
        github: {
            token: 'test-github-token',
            repository: 'test/repo'
        },
        processing: {
            maxRetries: 3,
            timeout: 300000,
            batchSize: 10
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        client = new CodegenClient(mockConfig);
    });

    afterEach(async () => {
        if (client && client.isInitialized) {
            await client.shutdown();
        }
    });

    describe('constructor', () => {
        it('should create client with valid config', () => {
            expect(client.config.cloudflareApi.baseUrl).toBe('https://test-api.com');
            expect(client.config.github.repository).toBe('test/repo');
            expect(client.config.processing.maxRetries).toBe(3);
        });

        it('should use default values for missing config', () => {
            const minimalClient = new CodegenClient({
                cloudflareApi: { apiKey: 'key' },
                github: { token: 'token' }
            });

            expect(minimalClient.config.processing.maxRetries).toBe(3);
            expect(minimalClient.config.processing.batchSize).toBe(10);
        });
    });

    describe('initialize', () => {
        it('should initialize successfully with valid config', async () => {
            // Mock Cloudflare health check
            fetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ status: 'healthy' })
            });

            await client.initialize();

            expect(client.isInitialized).toBe(true);
            expect(client.auth.initialize).toHaveBeenCalled();
            expect(client.promptGenerator.initialize).toHaveBeenCalled();
            expect(client.prManager.initialize).toHaveBeenCalled();
            expect(client.feedbackHandler.initialize).toHaveBeenCalled();
        });

        it('should fail initialization with invalid config', async () => {
            const invalidClient = new CodegenClient({});

            await expect(invalidClient.initialize()).rejects.toThrow('Missing required configuration');
        });

        it('should fail initialization if Cloudflare API is unreachable', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(client.initialize()).rejects.toThrow('Failed to connect to Cloudflare API');
        });
    });

    describe('retrieveTasks', () => {
        beforeEach(async () => {
            // Mock successful initialization
            fetch.mockResolvedValue({ ok: true });
            await client.initialize();
        });

        it('should retrieve tasks successfully', async () => {
            const mockTasks = [
                { id: 'task-1', title: 'Test Task 1' },
                { id: 'task-2', title: 'Test Task 2' }
            ];

            fetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ tasks: mockTasks })
            });

            const tasks = await client.retrieveTasks();

            expect(tasks).toEqual(mockTasks);
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/tasks?'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key'
                    })
                })
            );
        });

        it('should handle API errors', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(client.retrieveTasks()).rejects.toThrow('Failed to retrieve tasks: 500 Internal Server Error');
        });

        it('should apply filters correctly', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ tasks: [] })
            });

            await client.retrieveTasks({ status: 'pending', limit: 5 });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('status=pending'),
                expect.any(Object)
            );
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=5'),
                expect.any(Object)
            );
        });
    });

    describe('processTask', () => {
        const mockTask = {
            id: 'test-task-1',
            title: 'Test Task',
            description: 'Test description'
        };

        beforeEach(async () => {
            // Mock successful initialization
            fetch.mockResolvedValue({ ok: true });
            await client.initialize();
        });

        it('should process task successfully', async () => {
            // Mock task status update
            fetch.mockResolvedValue({ ok: true });

            const result = await client.processTask(mockTask);

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('test-task-1');
            expect(result.prUrl).toBe('https://github.com/test/repo/pull/123');
            expect(client.promptGenerator.generatePrompt).toHaveBeenCalledWith(mockTask);
            expect(client.prManager.createPR).toHaveBeenCalled();
        });

        it('should handle task processing errors', async () => {
            // Mock PR creation failure
            client.prManager.createPR.mockRejectedValue(new Error('PR creation failed'));
            fetch.mockResolvedValue({ ok: true });

            await expect(client.processTask(mockTask)).rejects.toThrow('PR creation failed');
            expect(client.feedbackHandler.handleError).toHaveBeenCalled();
        });

        it('should update metrics on success', async () => {
            fetch.mockResolvedValue({ ok: true });

            const initialMetrics = client.getMetrics();
            await client.processTask(mockTask);
            const updatedMetrics = client.getMetrics();

            expect(updatedMetrics.tasksProcessed).toBe(initialMetrics.tasksProcessed + 1);
            expect(updatedMetrics.prsCreated).toBe(initialMetrics.prsCreated + 1);
        });

        it('should update metrics on failure', async () => {
            client.prManager.createPR.mockRejectedValue(new Error('Test error'));
            fetch.mockResolvedValue({ ok: true });

            const initialMetrics = client.getMetrics();
            
            try {
                await client.processTask(mockTask);
            } catch (error) {
                // Expected to throw
            }

            const updatedMetrics = client.getMetrics();
            expect(updatedMetrics.errors).toBe(initialMetrics.errors + 1);
        });
    });

    describe('processBatch', () => {
        const mockTasks = [
            { id: 'task-1', title: 'Task 1' },
            { id: 'task-2', title: 'Task 2' }
        ];

        beforeEach(async () => {
            fetch.mockResolvedValue({ ok: true });
            await client.initialize();
        });

        it('should process batch of tasks', async () => {
            const results = await client.processBatch(mockTasks);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should handle mixed success/failure in batch', async () => {
            // Make second task fail
            client.prManager.createPR
                .mockResolvedValueOnce({
                    url: 'https://github.com/test/repo/pull/123',
                    number: 123
                })
                .mockRejectedValueOnce(new Error('Second task failed'));

            const results = await client.processBatch(mockTasks);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[1].error).toBe('Second task failed');
        });
    });

    describe('getStatus', () => {
        it('should return status information', () => {
            const status = client.getStatus();

            expect(status).toHaveProperty('initialized');
            expect(status).toHaveProperty('processing');
            expect(status).toHaveProperty('activeTasks');
            expect(status).toHaveProperty('metrics');
            expect(status).toHaveProperty('auth');
            expect(status).toHaveProperty('config');
        });
    });

    describe('getMetrics', () => {
        it('should return current metrics', () => {
            const metrics = client.getMetrics();

            expect(metrics).toHaveProperty('tasksProcessed');
            expect(metrics).toHaveProperty('prsCreated');
            expect(metrics).toHaveProperty('errors');
            expect(metrics).toHaveProperty('successRate');
            expect(metrics).toHaveProperty('averageProcessingTime');
        });
    });

    describe('shutdown', () => {
        it('should shutdown all components', async () => {
            fetch.mockResolvedValue({ ok: true });
            await client.initialize();

            await client.shutdown();

            expect(client.auth.shutdown).toHaveBeenCalled();
            expect(client.promptGenerator.shutdown).toHaveBeenCalled();
            expect(client.prManager.shutdown).toHaveBeenCalled();
            expect(client.feedbackHandler.shutdown).toHaveBeenCalled();
            expect(client.isInitialized).toBe(false);
        });
    });
});

