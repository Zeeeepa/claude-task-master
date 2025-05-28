/**
 * @fileoverview Integration Test for GitHub Webhook System
 * @description Comprehensive tests for webhook integration and event processing
 */

import { GitHubWebhookHandler } from './github_webhook_handler.js';
import { EventProcessor } from './event_processor.js';
import { SignatureValidator } from './signature_validator.js';
import { EventDeduplicator } from './event_deduplicator.js';
import { WorkflowDispatcher } from '../triggers/workflow_dispatcher.js';
import { EventQueue } from '../events/event_queue.js';
import { log } from '../utils/simple_logger.js';

/**
 * Integration test suite for GitHub webhook system
 */
export class WebhookIntegrationTest {
    constructor(config = {}) {
        this.config = {
            test_webhook_secret: config.test_webhook_secret || 'test_secret_123',
            mock_database: config.mock_database !== false,
            enable_real_github_api: config.enable_real_github_api || false,
            test_timeout: config.test_timeout || 30000,
            ...config
        };

        this.testResults = [];
        this.mockDatabase = null;
        this.webhookHandler = null;
    }

    /**
     * Run all integration tests
     * @returns {Promise<Object>} Test results
     */
    async runAllTests() {
        log('info', 'Starting GitHub webhook integration tests...');

        try {
            await this.setupTestEnvironment();
            
            const tests = [
                this.testSignatureValidation,
                this.testEventDeduplication,
                this.testEventProcessing,
                this.testWorkflowDispatch,
                this.testEventQueue,
                this.testWebhookHandler,
                this.testPullRequestWorkflow,
                this.testErrorHandling,
                this.testRateLimiting,
                this.testEventReplay
            ];

            for (const test of tests) {
                await this.runTest(test.name, test.bind(this));
            }

            await this.cleanupTestEnvironment();

            const summary = this.generateTestSummary();
            log('info', `Integration tests completed: ${summary.passed}/${summary.total} passed`);
            
            return summary;

        } catch (error) {
            log('error', `Integration test suite failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        log('debug', 'Setting up test environment...');

        // Setup mock database
        if (this.config.mock_database) {
            this.mockDatabase = new MockDatabase();
            await this.mockDatabase.initialize();
        }

        // Initialize webhook handler
        const webhookConfig = {
            github: {
                webhook_secret: this.config.test_webhook_secret,
                require_signature: true,
                user_agent_validation: true
            },
            processing: {
                enable_async_processing: false,
                enable_rate_limiting: true,
                rate_limit_max_requests: 10,
                rate_limit_window: 60000
            }
        };

        this.webhookHandler = new GitHubWebhookHandler(webhookConfig, this.mockDatabase);
        await this.webhookHandler.initialize();

        log('debug', 'Test environment setup complete');
    }

    /**
     * Run individual test
     * @param {string} testName - Test name
     * @param {Function} testFunction - Test function
     */
    async runTest(testName, testFunction) {
        const startTime = Date.now();
        
        try {
            log('debug', `Running test: ${testName}`);
            await testFunction();
            
            const duration = Date.now() - startTime;
            this.testResults.push({
                name: testName,
                status: 'passed',
                duration: duration,
                error: null
            });
            
            log('debug', `Test passed: ${testName} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.testResults.push({
                name: testName,
                status: 'failed',
                duration: duration,
                error: error.message
            });
            
            log('error', `Test failed: ${testName} - ${error.message}`);
        }
    }

    /**
     * Test signature validation
     */
    async testSignatureValidation() {
        const validator = new SignatureValidator(this.config.test_webhook_secret);
        const payload = JSON.stringify({ test: 'data' });
        
        // Test valid signature
        const validSignature = validator.generateSignature(payload);
        const isValid = validator.validateSignature(payload, validSignature);
        
        if (!isValid) {
            throw new Error('Valid signature was rejected');
        }

        // Test invalid signature
        const invalidSignature = 'sha256=invalid_signature';
        const isInvalid = validator.validateSignature(payload, invalidSignature);
        
        if (isInvalid) {
            throw new Error('Invalid signature was accepted');
        }

        // Test missing signature
        const isMissing = validator.validateSignature(payload, null);
        
        if (isMissing) {
            throw new Error('Missing signature was accepted');
        }
    }

    /**
     * Test event deduplication
     */
    async testEventDeduplication() {
        const deduplicator = new EventDeduplicator(this.mockDatabase);
        
        const eventData = {
            id: 'test_event_123',
            type: 'pull_request',
            payload: {
                action: 'opened',
                pull_request: { number: 123 },
                repository: { full_name: 'test/repo' }
            }
        };

        // First event should not be duplicate
        const isDuplicate1 = await deduplicator.isDuplicate(eventData);
        if (isDuplicate1) {
            throw new Error('First event was marked as duplicate');
        }

        // Cache the event
        await deduplicator.cacheEvent(eventData);

        // Same event should be duplicate
        const isDuplicate2 = await deduplicator.isDuplicate(eventData);
        if (!isDuplicate2) {
            throw new Error('Duplicate event was not detected');
        }

        // Different event should not be duplicate
        const differentEvent = { ...eventData, id: 'different_event_456' };
        const isDuplicate3 = await deduplicator.isDuplicate(differentEvent);
        if (isDuplicate3) {
            throw new Error('Different event was marked as duplicate');
        }
    }

    /**
     * Test event processing
     */
    async testEventProcessing() {
        const processor = new EventProcessor(this.mockDatabase);
        await processor.initialize();

        const eventData = {
            id: 'test_event_processing',
            type: 'pull_request',
            payload: {
                action: 'opened',
                pull_request: {
                    number: 123,
                    title: 'Test PR',
                    body: 'Test description',
                    head: { ref: 'feature-branch' },
                    base: { ref: 'main' },
                    user: { login: 'testuser' }
                },
                repository: {
                    full_name: 'test/repo',
                    html_url: 'https://github.com/test/repo'
                }
            },
            received_at: new Date()
        };

        const result = await processor.processEvent(eventData);
        
        if (result.status !== 'processed') {
            throw new Error(`Expected processed status, got: ${result.status}`);
        }

        if (!result.workflow_result) {
            throw new Error('No workflow result returned');
        }
    }

    /**
     * Test workflow dispatch
     */
    async testWorkflowDispatch() {
        const dispatcher = new WorkflowDispatcher(this.mockDatabase);
        await dispatcher.initialize();

        const taskData = {
            title: 'Test PR #123',
            description: 'Test description',
            repository_url: 'https://github.com/test/repo',
            pr_number: 123,
            branch_name: 'feature-branch',
            base_branch: 'main',
            author: 'testuser',
            status: 'pending',
            metadata: {
                github_event: 'pull_request',
                action: 'opened'
            }
        };

        const result = await dispatcher.dispatchPRWorkflow('opened', taskData);
        
        if (result.status !== 'workflows_started') {
            throw new Error(`Expected workflows_started status, got: ${result.status}`);
        }

        if (!result.workflows || result.workflows.length === 0) {
            throw new Error('No workflows were started');
        }
    }

    /**
     * Test event queue
     */
    async testEventQueue() {
        const queue = new EventQueue(this.mockDatabase);
        await queue.initialize();

        const eventData = {
            id: 'test_queue_event',
            type: 'pull_request',
            payload: { test: 'data' }
        };

        // Enqueue event
        const queueId = await queue.enqueue(eventData, { priority: 8 });
        
        if (!queueId) {
            throw new Error('Event was not queued');
        }

        // Process event
        const result = await queue.processNext();
        
        if (!result) {
            throw new Error('No event was processed');
        }

        if (result.status !== 'processed') {
            throw new Error(`Expected processed status, got: ${result.status}`);
        }
    }

    /**
     * Test webhook handler
     */
    async testWebhookHandler() {
        const payload = {
            action: 'opened',
            pull_request: {
                number: 123,
                title: 'Test PR',
                body: 'Test description',
                head: { ref: 'feature-branch' },
                base: { ref: 'main' },
                user: { login: 'testuser' }
            },
            repository: {
                full_name: 'test/repo',
                html_url: 'https://github.com/test/repo'
            }
        };

        const payloadString = JSON.stringify(payload);
        const signature = new SignatureValidator(this.config.test_webhook_secret)
            .generateSignature(payloadString);

        const mockReq = {
            headers: {
                'x-hub-signature-256': signature,
                'x-github-event': 'pull_request',
                'x-github-delivery': 'test_delivery_123',
                'user-agent': 'GitHub-Hookshot/test'
            },
            body: payload,
            rawBody: payloadString,
            ip: '127.0.0.1'
        };

        const mockRes = new MockResponse();
        
        await this.webhookHandler.handleWebhook(mockReq, mockRes);
        
        if (mockRes.statusCode !== 200) {
            throw new Error(`Expected 200 status, got: ${mockRes.statusCode}`);
        }

        const responseData = JSON.parse(mockRes.body);
        if (!responseData.success) {
            throw new Error('Webhook handling was not successful');
        }
    }

    /**
     * Test complete pull request workflow
     */
    async testPullRequestWorkflow() {
        // Test PR opened
        await this.simulateWebhookEvent('pull_request', {
            action: 'opened',
            pull_request: {
                number: 456,
                title: 'Feature: Add new functionality',
                body: 'This PR adds new functionality',
                head: { ref: 'feature/new-functionality' },
                base: { ref: 'main' },
                user: { login: 'developer' },
                draft: false
            },
            repository: {
                full_name: 'test/repo',
                html_url: 'https://github.com/test/repo'
            }
        });

        // Test PR updated
        await this.simulateWebhookEvent('pull_request', {
            action: 'synchronize',
            pull_request: {
                number: 456,
                title: 'Feature: Add new functionality',
                body: 'This PR adds new functionality (updated)',
                head: { ref: 'feature/new-functionality' },
                base: { ref: 'main' },
                user: { login: 'developer' }
            },
            repository: {
                full_name: 'test/repo',
                html_url: 'https://github.com/test/repo'
            }
        });

        // Test PR closed
        await this.simulateWebhookEvent('pull_request', {
            action: 'closed',
            pull_request: {
                number: 456,
                title: 'Feature: Add new functionality',
                merged: true,
                head: { ref: 'feature/new-functionality' },
                base: { ref: 'main' },
                user: { login: 'developer' }
            },
            repository: {
                full_name: 'test/repo',
                html_url: 'https://github.com/test/repo'
            }
        });
    }

    /**
     * Test error handling
     */
    async testErrorHandling() {
        // Test invalid signature
        const mockReq = {
            headers: {
                'x-hub-signature-256': 'sha256=invalid',
                'x-github-event': 'pull_request',
                'x-github-delivery': 'test_delivery_error',
                'user-agent': 'GitHub-Hookshot/test'
            },
            body: { test: 'data' },
            rawBody: JSON.stringify({ test: 'data' }),
            ip: '127.0.0.1'
        };

        const mockRes = new MockResponse();
        await this.webhookHandler.handleWebhook(mockReq, mockRes);
        
        if (mockRes.statusCode !== 401) {
            throw new Error(`Expected 401 status for invalid signature, got: ${mockRes.statusCode}`);
        }

        // Test missing headers
        const mockReqMissingHeaders = {
            headers: {
                'user-agent': 'GitHub-Hookshot/test'
            },
            body: { test: 'data' },
            ip: '127.0.0.1'
        };

        const mockRes2 = new MockResponse();
        await this.webhookHandler.handleWebhook(mockReqMissingHeaders, mockRes2);
        
        if (mockRes2.statusCode !== 400) {
            throw new Error(`Expected 400 status for missing headers, got: ${mockRes2.statusCode}`);
        }
    }

    /**
     * Test rate limiting
     */
    async testRateLimiting() {
        const requests = [];
        
        // Send multiple requests rapidly
        for (let i = 0; i < 15; i++) {
            const payload = { test: `data_${i}` };
            const payloadString = JSON.stringify(payload);
            const signature = new SignatureValidator(this.config.test_webhook_secret)
                .generateSignature(payloadString);

            const mockReq = {
                headers: {
                    'x-hub-signature-256': signature,
                    'x-github-event': 'ping',
                    'x-github-delivery': `test_delivery_${i}`,
                    'user-agent': 'GitHub-Hookshot/test'
                },
                body: payload,
                rawBody: payloadString,
                ip: '127.0.0.1'
            };

            const mockRes = new MockResponse();
            requests.push(this.webhookHandler.handleWebhook(mockReq, mockRes));
        }

        await Promise.all(requests);
        
        // Check if some requests were rate limited
        const rateLimitedCount = requests.filter(req => 
            req.statusCode === 429
        ).length;

        if (rateLimitedCount === 0) {
            throw new Error('No requests were rate limited');
        }
    }

    /**
     * Test event replay
     */
    async testEventReplay() {
        const processor = new EventProcessor(this.mockDatabase);
        await processor.initialize();

        const eventData = {
            id: 'test_replay_event',
            type: 'pull_request',
            payload: {
                action: 'opened',
                pull_request: { number: 789 },
                repository: { full_name: 'test/repo' }
            },
            received_at: new Date()
        };

        // Process event first
        await processor.processEvent(eventData);

        // Replay the event
        const replayResult = await processor.replayEvent('test_replay_event');
        
        if (replayResult.status !== 'replayed') {
            throw new Error(`Expected replayed status, got: ${replayResult.status}`);
        }
    }

    /**
     * Simulate webhook event
     * @param {string} eventType - Event type
     * @param {Object} payload - Event payload
     */
    async simulateWebhookEvent(eventType, payload) {
        const payloadString = JSON.stringify(payload);
        const signature = new SignatureValidator(this.config.test_webhook_secret)
            .generateSignature(payloadString);

        const mockReq = {
            headers: {
                'x-hub-signature-256': signature,
                'x-github-event': eventType,
                'x-github-delivery': `test_delivery_${Date.now()}`,
                'user-agent': 'GitHub-Hookshot/test'
            },
            body: payload,
            rawBody: payloadString,
            ip: '127.0.0.1'
        };

        const mockRes = new MockResponse();
        await this.webhookHandler.handleWebhook(mockReq, mockRes);
        
        if (mockRes.statusCode !== 200) {
            throw new Error(`Webhook simulation failed with status: ${mockRes.statusCode}`);
        }
    }

    /**
     * Generate test summary
     * @returns {Object} Test summary
     */
    generateTestSummary() {
        const total = this.testResults.length;
        const passed = this.testResults.filter(r => r.status === 'passed').length;
        const failed = this.testResults.filter(r => r.status === 'failed').length;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        return {
            total: total,
            passed: passed,
            failed: failed,
            success_rate: total > 0 ? (passed / total) * 100 : 0,
            total_duration: totalDuration,
            average_duration: total > 0 ? totalDuration / total : 0,
            results: this.testResults
        };
    }

    /**
     * Cleanup test environment
     */
    async cleanupTestEnvironment() {
        log('debug', 'Cleaning up test environment...');
        
        if (this.webhookHandler) {
            await this.webhookHandler.shutdown();
        }
        
        if (this.mockDatabase) {
            await this.mockDatabase.shutdown();
        }
        
        log('debug', 'Test environment cleanup complete');
    }
}

/**
 * Mock database for testing
 */
class MockDatabase {
    constructor() {
        this.data = new Map();
        this.queries = [];
    }

    async initialize() {
        // Mock initialization
    }

    async query(sql, params = []) {
        this.queries.push({ sql, params, timestamp: new Date() });
        
        // Mock query responses
        if (sql.includes('INSERT INTO webhook_events')) {
            return { rows: [], rowCount: 1 };
        }
        
        if (sql.includes('SELECT') && sql.includes('webhook_events')) {
            return { rows: [], rowCount: 0 };
        }
        
        return { rows: [], rowCount: 0 };
    }

    async shutdown() {
        this.data.clear();
        this.queries.length = 0;
    }
}

/**
 * Mock HTTP response for testing
 */
class MockResponse {
    constructor() {
        this.statusCode = 200;
        this.headers = {};
        this.body = '';
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    header(name, value) {
        this.headers[name] = value;
        return this;
    }

    json(data) {
        this.body = JSON.stringify(data);
        return this;
    }

    sendStatus(code) {
        this.statusCode = code;
        return this;
    }
}

export default WebhookIntegrationTest;

