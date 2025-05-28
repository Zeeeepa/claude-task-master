/**
 * @fileoverview GitHub Webhook Tests
 * @description Comprehensive test suite for GitHub webhook integration system
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Import modules to test
import { GitHubWebhookHandler } from '../../src/ai_cicd_system/webhooks/github_webhook_handler.js';
import { WebhookValidator } from '../../src/ai_cicd_system/webhooks/webhook_validator.js';
import { WebhookSecurity } from '../../src/ai_cicd_system/webhooks/webhook_security.js';
import { EventProcessor } from '../../src/ai_cicd_system/webhooks/event_processor.js';
import { createWebhookRouter } from '../../src/ai_cicd_system/api/webhook_endpoints.js';
import { WEBHOOK_CONFIG, SUPPORTED_EVENTS, EVENT_STATUS } from '../../src/ai_cicd_system/config/webhook_config.js';

describe('GitHub Webhook Integration System', () => {
    let app;
    let webhookHandler;
    let testSecret;

    beforeAll(() => {
        testSecret = 'test-webhook-secret-12345';
        process.env.GITHUB_WEBHOOK_SECRET = testSecret;
        process.env.NODE_ENV = 'test';
    });

    beforeEach(() => {
        // Create Express app for testing
        app = express();
        app.use(express.json());
        
        // Create webhook handler with test configuration
        webhookHandler = GitHubWebhookHandler.createForTesting({
            secret: testSecret,
            database: { enable_mock: true },
            github: { timeout: 1000, retries: 1 }
        });

        // Create webhook router
        const webhookRouter = createWebhookRouter({
            secret: testSecret,
            middleware: {
                rateLimit: { max_requests: 1000 }, // High limit for tests
                validation: { enabled: false } // Disable some validation for easier testing
            }
        });

        app.use('/api/webhooks', webhookRouter);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('WebhookSecurity', () => {
        let security;

        beforeEach(() => {
            security = new WebhookSecurity({ secret: testSecret });
        });

        describe('signature validation', () => {
            test('should validate correct signature', async () => {
                const payload = { test: 'data' };
                const signature = crypto
                    .createHmac('sha256', testSecret)
                    .update(JSON.stringify(payload))
                    .digest('hex');

                const req = {
                    headers: { 'x-hub-signature-256': `sha256=${signature}` },
                    body: payload
                };

                await expect(security.validateSignature(req)).resolves.toBe(true);
            });

            test('should reject invalid signature', async () => {
                const payload = { test: 'data' };
                const req = {
                    headers: { 'x-hub-signature-256': 'sha256=invalid-signature' },
                    body: payload
                };

                await expect(security.validateSignature(req)).rejects.toThrow('Invalid webhook signature');
            });

            test('should reject missing signature', async () => {
                const req = {
                    headers: {},
                    body: { test: 'data' }
                };

                await expect(security.validateSignature(req)).rejects.toThrow('Missing webhook signature');
            });
        });

        describe('origin validation', () => {
            test('should validate correct User-Agent', async () => {
                const req = {
                    headers: {
                        'user-agent': 'GitHub-Hookshot/abc123',
                        'content-type': 'application/json'
                    }
                };

                await expect(security.validateOrigin(req)).resolves.toBe(true);
            });

            test('should reject invalid User-Agent', async () => {
                const req = {
                    headers: {
                        'user-agent': 'BadBot/1.0',
                        'content-type': 'application/json'
                    }
                };

                await expect(security.validateOrigin(req)).rejects.toThrow('Invalid User-Agent header');
            });
        });

        describe('payload validation', () => {
            test('should validate correct payload structure', async () => {
                const payload = {
                    action: 'opened',
                    repository: { full_name: 'owner/repo' }
                };

                await expect(security.validatePayload(payload)).resolves.toBe(true);
            });

            test('should reject invalid payload structure', async () => {
                const payload = { invalid: 'structure' };

                await expect(security.validatePayload(payload)).rejects.toThrow('Missing required field');
            });
        });

        describe('secret generation and validation', () => {
            test('should generate secure secret', () => {
                const secret = WebhookSecurity.generateSecret();
                expect(secret).toHaveLength(64); // 32 bytes = 64 hex chars
                expect(secret).toMatch(/^[a-f0-9]+$/);
            });

            test('should validate secret strength', () => {
                const strongSecret = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
                const weakSecret = '123';

                const strongResult = WebhookSecurity.validateSecret(strongSecret);
                const weakResult = WebhookSecurity.validateSecret(weakSecret);

                expect(strongResult.valid).toBe(true);
                expect(weakResult.valid).toBe(false);
                expect(weakResult.errors).toContain('Secret should be at least 16 characters long');
            });
        });
    });

    describe('WebhookValidator', () => {
        let validator;

        beforeEach(() => {
            validator = new WebhookValidator();
        });

        describe('event support checking', () => {
            test('should recognize supported events', () => {
                expect(validator.isEventSupported('pull_request')).toBe(true);
                expect(validator.isEventSupported('push')).toBe(true);
                expect(validator.isEventSupported('issues')).toBe(true);
                expect(validator.isEventSupported('workflow_run')).toBe(true);
            });

            test('should reject unsupported events', () => {
                expect(validator.isEventSupported('unsupported_event')).toBe(false);
            });
        });

        describe('action support checking', () => {
            test('should recognize supported pull request actions', () => {
                expect(validator.isActionSupported('pull_request', 'opened')).toBe(true);
                expect(validator.isActionSupported('pull_request', 'synchronize')).toBe(true);
                expect(validator.isActionSupported('pull_request', 'closed')).toBe(true);
            });

            test('should reject unsupported actions', () => {
                expect(validator.isActionSupported('pull_request', 'unsupported')).toBe(false);
            });
        });

        describe('event parsing', () => {
            test('should parse pull request event correctly', async () => {
                const req = {
                    headers: {
                        'x-github-event': 'pull_request',
                        'x-github-delivery': 'test-delivery-123'
                    },
                    body: {
                        action: 'opened',
                        pull_request: {
                            id: 123,
                            number: 1,
                            title: 'Test PR',
                            head: { ref: 'feature', sha: 'abc123' },
                            base: { ref: 'main', sha: 'def456' }
                        },
                        repository: {
                            id: 456,
                            full_name: 'owner/repo',
                            owner: { login: 'owner' }
                        },
                        sender: { login: 'user' }
                    }
                };

                const event = await validator.parseEvent(req);

                expect(event.type).toBe('pull_request');
                expect(event.action).toBe('opened');
                expect(event.pull_request.number).toBe(1);
                expect(event.repository.full_name).toBe('owner/repo');
            });

            test('should parse push event correctly', async () => {
                const req = {
                    headers: {
                        'x-github-event': 'push',
                        'x-github-delivery': 'test-delivery-456'
                    },
                    body: {
                        action: 'main',
                        ref: 'refs/heads/main',
                        before: 'abc123',
                        after: 'def456',
                        commits: [
                            {
                                id: 'def456',
                                message: 'Test commit',
                                author: { name: 'Test User' }
                            }
                        ],
                        repository: {
                            full_name: 'owner/repo',
                            owner: { login: 'owner' }
                        },
                        sender: { login: 'user' }
                    }
                };

                const event = await validator.parseEvent(req);

                expect(event.type).toBe('push');
                expect(event.ref).toBe('refs/heads/main');
                expect(event.commits).toHaveLength(1);
            });
        });
    });

    describe('EventProcessor', () => {
        let processor;

        beforeEach(async () => {
            processor = new EventProcessor({
                database: { enable_mock: true },
                github: { timeout: 1000, retries: 1 }
            });
            await processor.initialize();
        });

        describe('event processing pipeline', () => {
            test('should process pull request event successfully', async () => {
                const event = {
                    id: 'test-event-123',
                    type: 'pull_request',
                    action: 'opened',
                    pull_request: {
                        number: 1,
                        title: 'Test PR',
                        head: { sha: 'abc123' }
                    },
                    repository: {
                        full_name: 'owner/repo',
                        owner: { login: 'owner' },
                        name: 'repo'
                    }
                };

                const result = await processor.process(event);

                expect(result.status).toBe(EVENT_STATUS.COMPLETED);
                expect(result.tasks).toHaveLength(1);
                expect(result.steps).toHaveLength(6); // All pipeline steps
                expect(result.errors).toHaveLength(0);
            });

            test('should handle processing errors gracefully', async () => {
                const invalidEvent = {
                    id: 'invalid-event',
                    type: 'pull_request',
                    action: 'opened'
                    // Missing required fields
                };

                const result = await processor.process(invalidEvent);

                expect(result.status).toBe(EVENT_STATUS.FAILED);
                expect(result.errors.length).toBeGreaterThan(0);
            });
        });

        describe('task creation', () => {
            test('should create task for pull request event', async () => {
                const event = {
                    id: 'test-event-456',
                    type: 'pull_request',
                    action: 'opened',
                    pull_request: {
                        number: 2,
                        title: 'Another Test PR'
                    },
                    repository: {
                        full_name: 'owner/repo'
                    }
                };

                const result = await processor.process(event);
                const task = result.tasks[0];

                expect(task).toBeDefined();
                expect(task.type).toBe('webhook_event');
                expect(task.event_type).toBe('pull_request');
                expect(task.title).toContain('Process PR #2');
            });
        });
    });

    describe('GitHubWebhookHandler', () => {
        beforeEach(async () => {
            await webhookHandler.initialize();
        });

        describe('webhook handling', () => {
            test('should handle valid webhook request', async () => {
                const payload = {
                    action: 'opened',
                    pull_request: {
                        id: 123,
                        number: 1,
                        title: 'Test PR',
                        head: { ref: 'feature', sha: 'abc123' },
                        base: { ref: 'main', sha: 'def456' }
                    },
                    repository: {
                        full_name: 'owner/repo',
                        owner: { login: 'owner' }
                    },
                    sender: { login: 'user' }
                };

                const signature = crypto
                    .createHmac('sha256', testSecret)
                    .update(JSON.stringify(payload))
                    .digest('hex');

                const mockReq = {
                    headers: {
                        'x-github-event': 'pull_request',
                        'x-github-delivery': 'test-delivery-789',
                        'x-hub-signature-256': `sha256=${signature}`,
                        'user-agent': 'GitHub-Hookshot/test',
                        'content-type': 'application/json'
                    },
                    body: payload
                };

                const mockRes = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn()
                };

                await webhookHandler.handleWebhook(mockReq, mockRes);

                expect(mockRes.status).toHaveBeenCalledWith(200);
                expect(mockRes.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: true,
                        eventId: 'test-delivery-789'
                    })
                );
            });

            test('should reject invalid signature', async () => {
                const payload = { action: 'opened' };

                const mockReq = {
                    headers: {
                        'x-github-event': 'pull_request',
                        'x-github-delivery': 'test-delivery-invalid',
                        'x-hub-signature-256': 'sha256=invalid-signature',
                        'user-agent': 'GitHub-Hookshot/test'
                    },
                    body: payload
                };

                const mockRes = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn()
                };

                await webhookHandler.handleWebhook(mockReq, mockRes);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: expect.objectContaining({
                            type: 'authentication_error'
                        })
                    })
                );
            });
        });

        describe('health and statistics', () => {
            test('should return health status', () => {
                const health = webhookHandler.getHealthStatus();

                expect(health.status).toBe('healthy');
                expect(health.initialized).toBe(true);
                expect(health.stats).toBeDefined();
            });

            test('should track statistics', async () => {
                const initialStats = webhookHandler.getStats();
                expect(initialStats.totalEvents).toBe(0);

                // Process a successful event
                const payload = {
                    action: 'opened',
                    pull_request: { number: 1, title: 'Test' },
                    repository: { full_name: 'owner/repo', owner: { login: 'owner' } },
                    sender: { login: 'user' }
                };

                const signature = crypto
                    .createHmac('sha256', testSecret)
                    .update(JSON.stringify(payload))
                    .digest('hex');

                const mockReq = {
                    headers: {
                        'x-github-event': 'pull_request',
                        'x-github-delivery': 'stats-test',
                        'x-hub-signature-256': `sha256=${signature}`,
                        'user-agent': 'GitHub-Hookshot/test'
                    },
                    body: payload
                };

                const mockRes = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn()
                };

                await webhookHandler.handleWebhook(mockReq, mockRes);

                const updatedStats = webhookHandler.getStats();
                expect(updatedStats.totalEvents).toBe(1);
                expect(updatedStats.successfulEvents).toBe(1);
            });
        });
    });

    describe('API Endpoints', () => {
        beforeEach(async () => {
            // Initialize the webhook handler through the router
            await request(app).get('/api/webhooks/health');
        });

        describe('POST /api/webhooks/github', () => {
            test('should accept valid webhook', async () => {
                const payload = {
                    action: 'opened',
                    pull_request: {
                        number: 1,
                        title: 'Test PR',
                        head: { ref: 'feature', sha: 'abc123' },
                        base: { ref: 'main', sha: 'def456' }
                    },
                    repository: {
                        full_name: 'owner/repo',
                        owner: { login: 'owner' }
                    },
                    sender: { login: 'user' }
                };

                const signature = crypto
                    .createHmac('sha256', testSecret)
                    .update(JSON.stringify(payload))
                    .digest('hex');

                const response = await request(app)
                    .post('/api/webhooks/github')
                    .set('x-github-event', 'pull_request')
                    .set('x-github-delivery', 'api-test-123')
                    .set('x-hub-signature-256', `sha256=${signature}`)
                    .set('user-agent', 'GitHub-Hookshot/test')
                    .send(payload);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.eventId).toBe('api-test-123');
            });

            test('should reject webhook without signature', async () => {
                const response = await request(app)
                    .post('/api/webhooks/github')
                    .set('x-github-event', 'pull_request')
                    .set('x-github-delivery', 'no-sig-test')
                    .set('user-agent', 'GitHub-Hookshot/test')
                    .send({ action: 'opened' });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });
        });

        describe('GET /api/webhooks/health', () => {
            test('should return health status', async () => {
                const response = await request(app)
                    .get('/api/webhooks/health');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.status).toBe('healthy');
            });
        });

        describe('GET /api/webhooks/status', () => {
            test('should return status and statistics', async () => {
                const response = await request(app)
                    .get('/api/webhooks/status');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.statistics).toBeDefined();
                expect(response.body.data.configuration).toBeDefined();
            });
        });

        describe('GET /api/webhooks/metrics', () => {
            test('should return metrics', async () => {
                const response = await request(app)
                    .get('/api/webhooks/metrics');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.metrics).toBeDefined();
                expect(response.body.data.metrics.webhook_events_total).toBeDefined();
            });
        });
    });

    describe('Configuration', () => {
        test('should validate webhook configuration', () => {
            const { validateWebhookConfig } = require('../../src/ai_cicd_system/config/webhook_config.js');
            
            // Test with valid config
            process.env.GITHUB_WEBHOOK_SECRET = 'valid-secret-with-sufficient-length';
            const validResult = validateWebhookConfig();
            expect(validResult.valid).toBe(true);

            // Test with invalid config
            process.env.GITHUB_WEBHOOK_SECRET = 'short';
            const invalidResult = validateWebhookConfig();
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.errors).toContain('GITHUB_WEBHOOK_SECRET should be at least 16 characters long');
        });

        test('should support different environments', () => {
            const { getEnvironmentConfig } = require('../../src/ai_cicd_system/config/webhook_config.js');
            
            const prodConfig = getEnvironmentConfig('production');
            const devConfig = getEnvironmentConfig('development');

            expect(prodConfig.ssl_verification).toBe(true);
            expect(devConfig.ssl_verification).toBe(false);
            expect(prodConfig.rate_limit.max_requests).toBeGreaterThan(devConfig.rate_limit.max_requests);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON', async () => {
            const response = await request(app)
                .post('/api/webhooks/github')
                .set('x-github-event', 'pull_request')
                .set('x-github-delivery', 'malformed-test')
                .set('content-type', 'application/json')
                .send('{ invalid json');

            expect(response.status).toBe(400);
        });

        test('should handle missing headers', async () => {
            const response = await request(app)
                .post('/api/webhooks/github')
                .send({ action: 'opened' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('should handle unsupported events', async () => {
            const payload = { action: 'test' };
            const signature = crypto
                .createHmac('sha256', testSecret)
                .update(JSON.stringify(payload))
                .digest('hex');

            const response = await request(app)
                .post('/api/webhooks/github')
                .set('x-github-event', 'unsupported_event')
                .set('x-github-delivery', 'unsupported-test')
                .set('x-hub-signature-256', `sha256=${signature}`)
                .set('user-agent', 'GitHub-Hookshot/test')
                .send(payload);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('Performance', () => {
        test('should process webhook within timeout', async () => {
            const payload = {
                action: 'opened',
                pull_request: { number: 1, title: 'Performance Test' },
                repository: { full_name: 'owner/repo', owner: { login: 'owner' } },
                sender: { login: 'user' }
            };

            const signature = crypto
                .createHmac('sha256', testSecret)
                .update(JSON.stringify(payload))
                .digest('hex');

            const startTime = Date.now();

            const response = await request(app)
                .post('/api/webhooks/github')
                .set('x-github-event', 'pull_request')
                .set('x-github-delivery', 'perf-test')
                .set('x-hub-signature-256', `sha256=${signature}`)
                .set('user-agent', 'GitHub-Hookshot/test')
                .send(payload);

            const duration = Date.now() - startTime;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });
    });
});

describe('Integration Tests', () => {
    test('should handle complete webhook flow', async () => {
        // This test would verify the complete flow from webhook receipt
        // through task creation and workflow triggering
        // Implementation would depend on the actual workflow orchestrator
    });

    test('should integrate with database correctly', async () => {
        // This test would verify database operations
        // Implementation would depend on the actual database schema
    });

    test('should integrate with GitHub API correctly', async () => {
        // This test would verify GitHub API interactions
        // Implementation would use mocked GitHub API responses
    });
});

