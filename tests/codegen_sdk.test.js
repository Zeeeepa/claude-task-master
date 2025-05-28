/**
 * @fileoverview Codegen SDK Tests
 * @description Comprehensive tests for the real Codegen SDK integration
 */

import { jest } from '@jest/globals';
import { CodegenSDKWrapper } from '../src/ai_cicd_system/utils/codegen_sdk_wrapper.js';
import { PromptOptimizer } from '../src/ai_cicd_system/utils/prompt_optimizer.js';
import { RetryManager } from '../src/ai_cicd_system/utils/retry_manager.js';
import { CodegenClient } from '../src/ai_cicd_system/core/codegen_client.js';
import { CodegenIntegrator } from '../src/ai_cicd_system/core/codegen_integrator.js';
import { createCodegenConfig } from '../src/ai_cicd_system/config/codegen_config.js';

// Mock child_process for testing
jest.mock('child_process');
jest.mock('fs');

describe('Codegen SDK Integration', () => {
    let testConfig;
    let mockConfig;

    beforeEach(() => {
        testConfig = {
            token: 'sk-test-token-12345',
            org_id: '123',
            api_url: 'https://api.codegen.sh',
            timeout: 30000,
            enable_mock: false,
            environment: 'testing'
        };

        mockConfig = {
            ...testConfig,
            enable_mock: true
        };
    });

    describe('CodegenSDKWrapper', () => {
        test('should initialize with valid configuration', () => {
            const wrapper = new CodegenSDKWrapper(testConfig);
            
            expect(wrapper.orgId).toBe('123');
            expect(wrapper.token).toBe('sk-test-token-12345');
            expect(wrapper.apiUrl).toBe('https://api.codegen.sh');
            expect(wrapper.timeout).toBe(30000);
        });

        test('should throw error without token', () => {
            const invalidConfig = { ...testConfig };
            delete invalidConfig.token;
            
            expect(() => new CodegenSDKWrapper(invalidConfig)).toThrow('Codegen API token is required');
        });

        test('should classify errors correctly', () => {
            const wrapper = new CodegenSDKWrapper(testConfig);
            
            expect(wrapper._classifyError(new Error('timeout'))).toBe('timeout');
            expect(wrapper._classifyError(new Error('connection refused'))).toBe('connection');
            expect(wrapper._classifyError(new Error('401 unauthorized'))).toBe('authentication');
            expect(wrapper._classifyError(new Error('rate limit exceeded'))).toBe('rate_limit');
            expect(wrapper._classifyError(new Error('500 server error'))).toBe('server_error');
            expect(wrapper._classifyError(new Error('import error'))).toBe('import_error');
            expect(wrapper._classifyError(new Error('python spawn failed'))).toBe('python_error');
        });

        test('should generate correct Python script', () => {
            const wrapper = new CodegenSDKWrapper(testConfig);
            const prompt = {
                task_id: 'test-task-123',
                content: 'Create a simple function',
                metadata: { complexity: 5 }
            };

            const script = wrapper._generatePythonScript(prompt);
            
            expect(script).toContain('from codegen import Agent');
            expect(script).toContain(`org_id="${testConfig.org_id}"`);
            expect(script).toContain(`token="${testConfig.token}"`);
            expect(script).toContain('Create a simple function');
            expect(script).toContain('"task_id": "test-task-123"');
        });
    });

    describe('PromptOptimizer', () => {
        test('should initialize with default configuration', () => {
            const optimizer = new PromptOptimizer();
            
            expect(optimizer.config.max_prompt_length).toBe(8000);
            expect(optimizer.config.include_context).toBe(true);
            expect(optimizer.config.optimization_level).toBe('standard');
        });

        test('should enhance prompt with task data', async () => {
            const optimizer = new PromptOptimizer();
            const task = {
                id: 'test-task-123',
                title: 'Test Feature',
                description: 'Create a test feature',
                requirements: ['Requirement 1', 'Requirement 2'],
                acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
                complexityScore: 7,
                priority: 'high',
                language: 'JavaScript',
                framework: 'Node.js'
            };

            const context = {
                codebase_context: {
                    repository: 'test/repo',
                    branch: 'feature/test',
                    existing_files: ['src/main.js']
                }
            };

            const result = await optimizer.enhance(task, context);
            
            expect(result.task_id).toBe('test-task-123');
            expect(result.content).toContain('Test Feature');
            expect(result.content).toContain('Requirement 1');
            expect(result.content).toContain('Criteria 1');
            expect(result.content).toContain('Repository**: test/repo');
            expect(result.metadata.complexity).toBe(7);
            expect(result.metadata.priority).toBe('high');
        });

        test('should format requirements and criteria correctly', () => {
            const optimizer = new PromptOptimizer();
            
            const requirements = ['First requirement', 'Second requirement'];
            const formatted = optimizer._formatRequirements(requirements);
            
            expect(formatted).toBe('1. First requirement\n2. Second requirement');
        });

        test('should truncate long prompts', () => {
            const optimizer = new PromptOptimizer({ max_prompt_length: 100 });
            const longContent = 'a'.repeat(200);
            
            const truncated = optimizer._truncatePrompt(longContent, 100);
            
            expect(truncated.length).toBeLessThanOrEqual(100);
            expect(truncated).toContain('[Prompt truncated due to length limits]');
        });
    });

    describe('RetryManager', () => {
        test('should initialize with default configuration', () => {
            const retryManager = new RetryManager();
            
            expect(retryManager.config.max_retries).toBe(3);
            expect(retryManager.config.base_delay).toBe(1000);
            expect(retryManager.config.backoff_multiplier).toBe(2);
        });

        test('should execute operation successfully on first try', async () => {
            const retryManager = new RetryManager();
            const mockOperation = jest.fn().mockResolvedValue('success');
            
            const result = await retryManager.executeWithRetry(mockOperation);
            
            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        test('should retry on retryable errors', async () => {
            const retryManager = new RetryManager({ max_retries: 2 });
            const mockOperation = jest.fn()
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValue('success');
            
            const result = await retryManager.executeWithRetry(mockOperation);
            
            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        test('should not retry on non-retryable errors', async () => {
            const retryManager = new RetryManager();
            const mockOperation = jest.fn().mockRejectedValue(new Error('401 unauthorized'));
            
            await expect(retryManager.executeWithRetry(mockOperation)).rejects.toThrow();
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        test('should calculate delay with exponential backoff', () => {
            const retryManager = new RetryManager({ 
                base_delay: 1000, 
                backoff_multiplier: 2,
                jitter: false 
            });
            
            expect(retryManager._calculateDelay(1, 'timeout')).toBe(1000);
            expect(retryManager._calculateDelay(2, 'timeout')).toBe(2000);
            expect(retryManager._calculateDelay(3, 'timeout')).toBe(4000);
        });

        test('should enhance errors with retry information', () => {
            const retryManager = new RetryManager();
            const originalError = new Error('Test error');
            
            const enhanced = retryManager._enhanceError(originalError, 3, 'test-op-123');
            
            expect(enhanced.message).toContain('Operation failed after 3 attempts');
            expect(enhanced.attempts).toBe(3);
            expect(enhanced.operationId).toBe('test-op-123');
            expect(enhanced.guidance).toBeDefined();
        });
    });

    describe('CodegenConfig', () => {
        test('should create configuration with environment defaults', () => {
            const config = createCodegenConfig({}, 'development');
            
            expect(config.environment).toBe('development');
            expect(config.get('enable_mock')).toBe(true);
            expect(config.get('log_level')).toBe('debug');
        });

        test('should merge user config with defaults', () => {
            const userConfig = {
                token: 'user-token',
                timeout: 60000
            };
            
            const config = createCodegenConfig(userConfig, 'production');
            
            expect(config.get('token')).toBe('user-token');
            expect(config.get('timeout')).toBe(60000);
            expect(config.get('enable_mock')).toBe(false);
        });

        test('should validate required fields', () => {
            expect(() => {
                createCodegenConfig({ 
                    enable_mock: false 
                }, 'production');
            }).toThrow('Configuration validation failed');
        });

        test('should provide component-specific configurations', () => {
            const config = createCodegenConfig(testConfig, 'testing');
            
            const sdkConfig = config.getSDKConfig();
            expect(sdkConfig.org_id).toBe('123');
            expect(sdkConfig.token).toBe('sk-test-token-12345');
            
            const retryConfig = config.getRetryConfig();
            expect(retryConfig.max_retries).toBeDefined();
            
            const promptConfig = config.getPromptConfig();
            expect(promptConfig.max_prompt_length).toBeDefined();
        });
    });

    describe('CodegenClient', () => {
        test('should initialize in mock mode', async () => {
            const client = new CodegenClient(mockConfig);
            
            await client.initialize();
            
            expect(client.isConnected).toBe(true);
        });

        test('should send mock request successfully', async () => {
            const client = new CodegenClient(mockConfig);
            await client.initialize();
            
            const prompt = {
                task_id: 'test-task',
                content: '# Test Task\nCreate a test function'
            };
            
            const result = await client.sendCodegenRequest(prompt, 'test-task');
            
            expect(result.success).toBe(true);
            expect(result.data.pr_url).toContain('github.com');
            expect(result.data.task_id).toBe('test-task');
        });

        test('should track request statistics', async () => {
            const client = new CodegenClient(mockConfig);
            await client.initialize();
            
            const prompt = { task_id: 'test', content: 'test' };
            await client.sendCodegenRequest(prompt, 'test');
            
            const stats = client._getRequestStats();
            
            expect(stats.total).toBe(1);
            expect(stats.completed).toBe(1);
            expect(stats.success_rate).toBe(100);
        });

        test('should provide health status', async () => {
            const client = new CodegenClient(mockConfig);
            await client.initialize();
            
            const health = await client.getHealth();
            
            expect(health.status).toBe('healthy');
            expect(health.mode).toBe('mock');
            expect(health.connected).toBe(true);
        });
    });

    describe('CodegenIntegrator', () => {
        test('should initialize with real SDK components', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            
            await integrator.initialize();
            
            expect(integrator.promptOptimizer).toBeDefined();
            expect(integrator.codegenClient).toBeDefined();
            expect(integrator.retryManager).toBeDefined();
            expect(integrator.prTracker).toBeDefined();
        });

        test('should process task end-to-end', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            const task = {
                id: 'test-task-123',
                title: 'Test Feature',
                description: 'Create a test feature',
                requirements: ['Requirement 1'],
                acceptanceCriteria: ['Criteria 1'],
                complexityScore: 5
            };
            
            const context = {
                codebase_context: {
                    repository: 'test/repo'
                }
            };
            
            const result = await integrator.processTask(task, context);
            
            expect(result.status).toBe('completed');
            expect(result.task_id).toBe('test-task-123');
            expect(result.prompt).toBeDefined();
            expect(result.codegen_response).toBeDefined();
            expect(result.pr_info).toBeDefined();
            expect(result.sdk_version).toBe('real');
        });

        test('should provide comprehensive health status', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            const health = await integrator.getHealth();
            
            expect(health.status).toBe('healthy');
            expect(health.mode).toBe('mock');
            expect(health.components).toBeDefined();
            expect(health.components.prompt_optimizer).toBeDefined();
            expect(health.components.codegen_client).toBeDefined();
            expect(health.components.retry_manager).toBeDefined();
        });

        test('should provide detailed statistics', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            const stats = await integrator.getStatistics();
            
            expect(stats.total_requests).toBe(0);
            expect(stats.success_rate).toBe(0);
            expect(stats.sdk_stats).toBeDefined();
            expect(stats.retry_stats).toBeDefined();
            expect(stats.prompt_stats).toBeDefined();
        });

        test('should handle errors gracefully', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            // Mock a failing prompt optimizer
            integrator.promptOptimizer.enhance = jest.fn().mockRejectedValue(new Error('Prompt optimization failed'));
            
            const task = { id: 'test-task', title: 'Test' };
            
            await expect(integrator.processTask(task, {})).rejects.toThrow('Prompt optimization failed');
        });

        test('should shutdown cleanly', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            // Add some active requests
            integrator.activeRequests.set('req1', { status: 'processing' });
            
            await integrator.shutdown();
            
            expect(integrator.activeRequests.get('req1').status).toBe('cancelled');
        });
    });

    describe('Integration Tests', () => {
        test('should work with real configuration structure', async () => {
            const realConfig = {
                token: 'sk-test-token',
                org_id: '123',
                environment: 'testing',
                enable_mock: true,
                timeout: 30000,
                max_retries: 2,
                optimization_level: 'comprehensive'
            };
            
            const integrator = new CodegenIntegrator(realConfig);
            await integrator.initialize();
            
            const task = {
                id: 'integration-test',
                title: 'Integration Test Feature',
                description: 'Test the complete integration',
                requirements: ['Must work end-to-end'],
                acceptanceCriteria: ['All components integrated'],
                complexityScore: 8,
                priority: 'high',
                language: 'JavaScript',
                framework: 'Node.js',
                testingFramework: 'Jest'
            };
            
            const result = await integrator.processTask(task, {});
            
            expect(result.status).toBe('completed');
            expect(result.metrics.optimization_level).toBe('comprehensive');
            expect(result.environment).toBe('testing');
        });

        test('should handle concurrent requests', async () => {
            const integrator = new CodegenIntegrator(mockConfig);
            await integrator.initialize();
            
            const tasks = Array.from({ length: 5 }, (_, i) => ({
                id: `concurrent-task-${i}`,
                title: `Concurrent Task ${i}`,
                description: 'Test concurrent processing'
            }));
            
            const promises = tasks.map(task => integrator.processTask(task, {}));
            const results = await Promise.all(promises);
            
            expect(results).toHaveLength(5);
            results.forEach((result, i) => {
                expect(result.status).toBe('completed');
                expect(result.task_id).toBe(`concurrent-task-${i}`);
            });
        });
    });
});

describe('Error Scenarios', () => {
    test('should handle Python SDK not installed', async () => {
        const config = {
            token: 'sk-test-token',
            org_id: '123',
            enable_mock: false
        };
        
        const wrapper = new CodegenSDKWrapper(config);
        
        // Mock Python execution to simulate import error
        wrapper._executePythonScript = jest.fn().mockRejectedValue(
            new Error('Python execution failed: ModuleNotFoundError: No module named \'codegen\'')
        );
        
        const result = await wrapper.executeTask({
            task_id: 'test',
            content: 'test'
        });
        
        expect(result.success).toBe(false);
        expect(result.error_type).toBe('python_error');
    });

    test('should handle API authentication errors', async () => {
        const config = {
            token: 'invalid-token',
            org_id: '123',
            enable_mock: false
        };
        
        const wrapper = new CodegenSDKWrapper(config);
        
        // Mock Python execution to simulate auth error
        wrapper._executePythonScript = jest.fn().mockResolvedValue({
            status: 'error',
            error: 'Authentication failed',
            error_type: 'authentication_error'
        });
        
        const result = await wrapper.executeTask({
            task_id: 'test',
            content: 'test'
        });
        
        expect(result.success).toBe(false);
        expect(result.data.error_type).toBe('authentication_error');
    });
});

export { testConfig, mockConfig };

