/**
 * @fileoverview Enhanced Codegen Integration Tests
 * @description Comprehensive tests for the enhanced codegen integration features
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedCodegenIntegrator } from '../src/ai_cicd_system/core/enhanced_codegen_integrator.js';
import { DatabasePromptGenerator } from '../src/ai_cicd_system/core/database_prompt_generator.js';
import { AdvancedErrorRecovery } from '../src/ai_cicd_system/core/advanced_error_recovery.js';
import { GitHubWebhookHandler } from '../src/ai_cicd_system/webhooks/github_webhook_handler.js';
import { EventProcessor } from '../src/ai_cicd_system/webhooks/event_processor.js';
import { TemplateManager } from '../src/ai_cicd_system/prompts/template_manager.js';
import { ContextEnricher } from '../src/ai_cicd_system/prompts/context_enricher.js';

describe('Enhanced Codegen Integration', () => {
    let enhancedIntegrator;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            database: {
                enabled: true,
                connection_pool_size: 5,
                query_timeout: 10000
            },
            webhooks: {
                enabled: true,
                github_secret: 'test-secret',
                signature_validation: false
            },
            prompts: {
                versioning_enabled: true,
                context_enrichment: true,
                max_context_size: 25000
            },
            error_recovery: {
                max_retry_attempts: 3,
                backoff_strategy: 'exponential'
            },
            enable_mock: true
        };

        enhancedIntegrator = new EnhancedCodegenIntegrator(mockConfig);
    });

    afterEach(async () => {
        if (enhancedIntegrator) {
            await enhancedIntegrator.shutdown();
        }
    });

    describe('Initialization', () => {
        it('should initialize with enhanced components', async () => {
            await enhancedIntegrator.initialize();

            expect(enhancedIntegrator.databasePromptGenerator).toBeDefined();
            expect(enhancedIntegrator.templateManager).toBeDefined();
            expect(enhancedIntegrator.contextEnricher).toBeDefined();
            expect(enhancedIntegrator.webhookHandler).toBeDefined();
            expect(enhancedIntegrator.eventProcessor).toBeDefined();
            expect(enhancedIntegrator.errorRecovery).toBeDefined();
        });

        it('should handle disabled components gracefully', async () => {
            const configWithDisabledFeatures = {
                ...mockConfig,
                database: { enabled: false },
                webhooks: { enabled: false }
            };

            const integrator = new EnhancedCodegenIntegrator(configWithDisabledFeatures);
            await integrator.initialize();

            expect(integrator.databasePromptGenerator).toBeUndefined();
            expect(integrator.webhookHandler).toBeUndefined();
            expect(integrator.templateManager).toBeDefined();
            expect(integrator.contextEnricher).toBeDefined();

            await integrator.shutdown();
        });
    });

    describe('Enhanced Task Processing', () => {
        beforeEach(async () => {
            await enhancedIntegrator.initialize();
        });

        it('should process task with database-driven prompts', async () => {
            const task = {
                id: 'test-task-1',
                title: 'Test Feature Implementation',
                description: 'Implement a test feature',
                type: 'feature',
                complexity: 5
            };

            const context = {
                requirements: ['Requirement 1', 'Requirement 2'],
                acceptance_criteria: ['Criteria 1', 'Criteria 2']
            };

            const result = await enhancedIntegrator.processTask(task, context);

            expect(result).toBeDefined();
            expect(result.task_id).toBe(task.id);
            expect(result.status).toBe('completed');
            expect(result.context_used).toBeDefined();
            expect(result.context_used.database_driven).toBe(true);
            expect(result.context_used.enriched).toBe(true);
            expect(result.metrics).toBeDefined();
        });

        it('should handle task processing with error recovery', async () => {
            const task = {
                id: 'test-task-error',
                title: 'Task That Will Fail',
                description: 'This task is designed to test error recovery',
                type: 'feature'
            };

            // Mock the codegen client to fail initially
            const originalSendRequest = enhancedIntegrator.codegenClient.sendCodegenRequest;
            let attemptCount = 0;
            enhancedIntegrator.codegenClient.sendCodegenRequest = jest.fn().mockImplementation(async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Simulated API failure');
                }
                return originalSendRequest.call(enhancedIntegrator.codegenClient, ...arguments);
            });

            const result = await enhancedIntegrator.processTask(task);

            expect(result).toBeDefined();
            expect(attemptCount).toBeGreaterThan(1); // Should have retried
        });

        it('should process multiple tasks concurrently', async () => {
            const tasks = [
                {
                    id: 'task-1',
                    title: 'Task 1',
                    description: 'First task',
                    type: 'feature',
                    priority: 1
                },
                {
                    id: 'task-2',
                    title: 'Task 2',
                    description: 'Second task',
                    type: 'bug_fix',
                    priority: 2
                },
                {
                    id: 'task-3',
                    title: 'Task 3',
                    description: 'Third task',
                    type: 'refactor',
                    priority: 3
                }
            ];

            const results = await enhancedIntegrator.processTasks(tasks, {}, {
                concurrency: 2,
                batch_size: 2,
                priority_ordering: true
            });

            expect(results).toHaveLength(3);
            expect(results.every(result => result.status === 'completed')).toBe(true);
            
            // Check priority ordering (higher priority first)
            expect(results[0].task_id).toBe('task-3'); // Priority 3
            expect(results[1].task_id).toBe('task-2'); // Priority 2
            expect(results[2].task_id).toBe('task-1'); // Priority 1
        });
    });

    describe('Webhook Integration', () => {
        beforeEach(async () => {
            await enhancedIntegrator.initialize();
        });

        it('should handle GitHub webhook events', async () => {
            const webhookEvent = {
                type: 'pull_request',
                action: 'opened',
                pull_request: {
                    number: 123,
                    title: 'Test PR',
                    html_url: 'https://github.com/test/repo/pull/123',
                    head: { ref: 'feature-branch' },
                    base: { ref: 'main' },
                    user: { login: 'testuser' }
                },
                repository: {
                    full_name: 'test/repo'
                }
            };

            const result = await enhancedIntegrator.handleWebhookEvent(webhookEvent);

            expect(result).toBeDefined();
            expect(result.status).toBe('processed');
            expect(result.event_type).toBe('pull_request.opened');
            expect(result.requires_processing).toBe(true);
        });

        it('should validate webhook signatures when enabled', async () => {
            const configWithValidation = {
                ...mockConfig,
                webhooks: {
                    ...mockConfig.webhooks,
                    signature_validation: true
                }
            };

            const integrator = new EnhancedCodegenIntegrator(configWithValidation);
            await integrator.initialize();

            const event = { type: 'test' };
            const rawBody = JSON.stringify(event);
            const crypto = require('crypto');
            const signature = 'sha256=' + crypto
                .createHmac('sha256', 'test-secret')
                .update(rawBody)
                .digest('hex');

            const isValid = await integrator.webhookHandler.validateSignature(rawBody, signature);
            expect(isValid).toBe(true);

            await integrator.shutdown();
        });
    });

    describe('Database-Driven Prompt Generation', () => {
        let promptGenerator;

        beforeEach(async () => {
            promptGenerator = new DatabasePromptGenerator({
                connection_pool_size: 5,
                query_timeout: 10000,
                template_cache_ttl: 60000
            });
            
            // Mock database connection
            promptGenerator.dbConnection = {
                connect: jest.fn(),
                query: jest.fn(),
                close: jest.fn()
            };
        });

        afterEach(async () => {
            if (promptGenerator) {
                await promptGenerator.shutdown();
            }
        });

        it('should generate prompts from database context', async () => {
            // Mock database responses
            promptGenerator.dbConnection.query
                .mockResolvedValueOnce({ rows: [] }) // task_contexts
                .mockResolvedValueOnce({ rows: [] }) // related tasks
                .mockResolvedValueOnce({ rows: [] }); // codebase analysis

            const task = {
                id: 'test-task',
                title: 'Test Task',
                description: 'Test description',
                type: 'feature'
            };

            const context = {
                requirements: { req1: 'value1' },
                dependencies: ['dep1', 'dep2']
            };

            const prompt = await promptGenerator.generatePrompt(task, context);

            expect(prompt).toBeDefined();
            expect(prompt.task_id).toBe(task.id);
            expect(prompt.template_type).toBe('feature');
            expect(prompt.content).toContain(task.title);
            expect(prompt.metadata).toBeDefined();
            expect(prompt.metadata.generated_at).toBeDefined();
        });

        it('should cache prompt versions', async () => {
            const task = { id: 'test-task' };
            const prompt = {
                task_id: 'test-task',
                template_id: 'test-template',
                content: 'test content',
                context: {},
                metadata: {}
            };

            promptGenerator.dbConnection.query.mockResolvedValue({ rows: [] });

            await promptGenerator.storePromptVersion('test-task', prompt, 'v1.0.0');

            expect(promptGenerator.dbConnection.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO prompt_versions'),
                expect.arrayContaining(['test-task', 'v1.0.0'])
            );
        });
    });

    describe('Template Management', () => {
        let templateManager;

        beforeEach(async () => {
            templateManager = new TemplateManager({
                template_cache_size: 50,
                template_directory: './test-templates',
                versioning_enabled: true
            });
            await templateManager.initialize();
        });

        afterEach(async () => {
            if (templateManager) {
                await templateManager.shutdown();
            }
        });

        it('should select appropriate template based on task type and complexity', async () => {
            const template = await templateManager.selectTemplate('feature', 7);

            expect(template).toBeDefined();
            expect(template.type).toBe('feature');
            expect(['simple', 'medium', 'complex']).toContain(template.complexity_level);
        });

        it('should generate prompts from templates', async () => {
            const template = await templateManager.selectTemplate('bug_fix', 3);
            const task = {
                id: 'bug-task',
                title: 'Fix Login Bug',
                description: 'Users cannot log in',
                type: 'bug_fix'
            };
            const context = {
                bug_description: 'Login form not submitting',
                expected_behavior: 'Form should submit successfully'
            };

            const prompt = await templateManager.generatePrompt(template, task, context);

            expect(prompt).toBeDefined();
            expect(prompt.template_id).toBe(template.id);
            expect(prompt.content).toContain(task.title);
            expect(prompt.metadata.generation_time_ms).toBeGreaterThan(0);
        });

        it('should cache template selections', async () => {
            // First call
            const template1 = await templateManager.selectTemplate('feature', 5);
            
            // Second call with same parameters
            const template2 = await templateManager.selectTemplate('feature', 5);

            expect(template1).toBe(template2);
            
            const stats = templateManager.getCacheStatistics();
            expect(stats.hit_rate).toBeGreaterThan(0);
        });
    });

    describe('Context Enrichment', () => {
        let contextEnricher;

        beforeEach(async () => {
            contextEnricher = new ContextEnricher({
                max_context_size: 25000,
                cache_enabled: true,
                file_analysis: { enabled: true },
                dependency_analysis: { enabled: true }
            });
            await contextEnricher.initialize();
        });

        afterEach(async () => {
            if (contextEnricher) {
                await contextEnricher.shutdown();
            }
        });

        it('should enrich context with additional information', async () => {
            const baseContext = {
                requirements: ['Basic requirement']
            };

            const task = {
                id: 'test-task',
                type: 'feature',
                project_id: 'test-project'
            };

            const enrichedContext = await contextEnricher.enrichContext(baseContext, task);

            expect(enrichedContext).toBeDefined();
            expect(enrichedContext.requirements).toEqual(baseContext.requirements);
            expect(enrichedContext.file_analysis).toBeDefined();
            expect(enrichedContext.dependency_analysis).toBeDefined();
            expect(enrichedContext.pattern_analysis).toBeDefined();
        });

        it('should enforce context size limits', async () => {
            const largeContext = {
                large_data: 'x'.repeat(30000) // Exceeds max_context_size
            };

            const task = { id: 'test-task', type: 'feature' };
            const enrichedContext = await contextEnricher.enrichContext(largeContext, task);

            const contextSize = JSON.stringify(enrichedContext).length;
            expect(contextSize).toBeLessThanOrEqual(25000);
        });
    });

    describe('Advanced Error Recovery', () => {
        let errorRecovery;

        beforeEach(async () => {
            errorRecovery = new AdvancedErrorRecovery({
                max_retry_attempts: 3,
                backoff_strategy: 'exponential',
                base_delay: 100,
                fallback_providers: [
                    { name: 'fallback1', operation: jest.fn().mockResolvedValue('fallback result') }
                ]
            });
            await errorRecovery.initialize();
        });

        afterEach(async () => {
            if (errorRecovery) {
                await errorRecovery.shutdown();
            }
        });

        it('should retry failed operations', async () => {
            let attemptCount = 0;
            const operation = jest.fn().mockImplementation(async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Temporary failure');
                }
                return 'success';
            });

            const result = await errorRecovery.executeWithRecovery(operation, {
                operation: 'test_operation'
            });

            expect(result).toBe('success');
            expect(attemptCount).toBe(3);
        });

        it('should use fallback providers when primary fails', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Primary failure'));

            const result = await errorRecovery.executeWithRecovery(failingOperation, {
                operation: 'test_operation'
            });

            expect(result).toBe('fallback result');
        });

        it('should categorize errors correctly', async () => {
            const networkError = new Error('ECONNREFUSED');
            const authError = new Error('Unauthorized access');
            const rateLimitError = new Error('Rate limit exceeded');

            expect(errorRecovery._categorizeError(networkError)).toBe('network');
            expect(errorRecovery._categorizeError(authError)).toBe('authentication');
            expect(errorRecovery._categorizeError(rateLimitError)).toBe('rate_limit');
        });
    });

    describe('Event Processing', () => {
        let eventProcessor;

        beforeEach(async () => {
            eventProcessor = new EventProcessor({
                queue_size: 100,
                processing_timeout: 5000,
                batch_size: 5,
                processing_interval: 1000
            });
            await eventProcessor.initialize();
        });

        afterEach(async () => {
            if (eventProcessor) {
                await eventProcessor.shutdown();
            }
        });

        it('should queue and process events', async () => {
            const event = {
                type: 'pr_created',
                task_id: 'test-task',
                pr_info: { number: 123 }
            };

            const eventId = await eventProcessor.queueEvent(event, 'high');
            expect(eventId).toBeDefined();

            // Process events
            await eventProcessor.processEvents();

            const stats = eventProcessor.getQueueStatistics();
            expect(stats.total_queued).toBe(0); // Should be processed
        });

        it('should handle event processing failures with retries', async () => {
            // Mock a handler that fails initially
            let callCount = 0;
            eventProcessor.eventHandlers.set('failing_event', jest.fn().mockImplementation(async () => {
                callCount++;
                if (callCount < 3) {
                    throw new Error('Processing failed');
                }
                return { status: 'success' };
            }));

            const event = { type: 'failing_event', data: 'test' };
            await eventProcessor.queueEvent(event);

            // Process multiple times to trigger retries
            await eventProcessor.processEvents();
            await new Promise(resolve => setTimeout(resolve, 100));
            await eventProcessor.processEvents();
            await new Promise(resolve => setTimeout(resolve, 100));
            await eventProcessor.processEvents();

            expect(callCount).toBeGreaterThan(1);
        });

        it('should prioritize high priority events', async () => {
            const processedEvents = [];
            
            // Mock handler to track processing order
            eventProcessor.eventHandlers.set('test_event', jest.fn().mockImplementation(async (event) => {
                processedEvents.push(event.priority);
                return { status: 'processed' };
            }));

            // Queue events with different priorities
            await eventProcessor.queueEvent({ type: 'test_event', id: 1 }, 'low');
            await eventProcessor.queueEvent({ type: 'test_event', id: 2 }, 'high');
            await eventProcessor.queueEvent({ type: 'test_event', id: 3 }, 'medium');

            await eventProcessor.processEvents();

            // High priority should be processed first
            expect(processedEvents[0]).toBe('high');
        });
    });

    describe('Integration Statistics and Health', () => {
        beforeEach(async () => {
            await enhancedIntegrator.initialize();
        });

        it('should provide enhanced statistics', async () => {
            const stats = await enhancedIntegrator.getEnhancedStatistics();

            expect(stats).toBeDefined();
            expect(stats.database).toBeDefined();
            expect(stats.webhooks).toBeDefined();
            expect(stats.prompts).toBeDefined();
            expect(stats.error_recovery).toBeDefined();
            expect(stats.requests).toBeDefined();
            expect(stats.performance).toBeDefined();
        });

        it('should provide enhanced health status', async () => {
            const health = await enhancedIntegrator.getEnhancedHealth();

            expect(health).toBeDefined();
            expect(health.status).toBeDefined();
            expect(health.enhanced_components).toBeDefined();
            expect(health.enhanced_components.database_prompt_generator).toBeDefined();
            expect(health.enhanced_components.template_manager).toBeDefined();
            expect(health.enhanced_components.context_enricher).toBeDefined();
            expect(health.enhanced_components.webhook_handler).toBeDefined();
            expect(health.enhanced_components.event_processor).toBeDefined();
            expect(health.enhanced_components.error_recovery).toBeDefined();
        });
    });

    describe('Configuration Validation', () => {
        it('should validate configuration on initialization', async () => {
            const invalidConfig = {
                database: { enabled: true }, // Missing required database config
                webhooks: { 
                    enabled: true,
                    signature_validation: true
                    // Missing github_secret
                }
            };

            expect(() => {
                new EnhancedCodegenIntegrator(invalidConfig);
            }).not.toThrow(); // Should handle gracefully with defaults
        });

        it('should use default configuration values', () => {
            const integrator = new EnhancedCodegenIntegrator({});

            expect(integrator.enhancedConfig.database.enabled).toBe(true);
            expect(integrator.enhancedConfig.webhooks.enabled).toBe(true);
            expect(integrator.enhancedConfig.prompts.versioning_enabled).toBe(true);
            expect(integrator.enhancedConfig.error_recovery.max_retry_attempts).toBe(5);
        });
    });
});

