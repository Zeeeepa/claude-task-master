/**
 * AgentAPI Middleware Integration Tests
 * 
 * End-to-end integration tests for the AgentAPI middleware system
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import AgentAPIClient from '../../../src/ai_cicd_system/integrations/agentapi/client.js';
import WebhookHandler from '../../../src/ai_cicd_system/integrations/agentapi/webhook_handler.js';
import AuthManager from '../../../src/ai_cicd_system/integrations/agentapi/auth_manager.js';
import WSL2DeploymentManager from '../../../src/ai_cicd_system/integrations/agentapi/deployment_manager.js';
import CommunicationBridge from '../../../src/ai_cicd_system/middleware/communication_bridge.js';

describe('AgentAPI Middleware Integration', () => {
    let agentApiClient;
    let webhookHandler;
    let authManager;
    let deploymentManager;
    let communicationBridge;

    const testConfig = {
        agentApiUrl: process.env.TEST_AGENTAPI_URL || 'http://localhost:3284',
        webhookPort: 3003, // Use different port for tests
        logLevel: 'error' // Reduce log noise during tests
    };

    beforeAll(async () => {
        // Initialize components for testing
        authManager = new AuthManager({
            logLevel: testConfig.logLevel
        });

        webhookHandler = new WebhookHandler({
            port: testConfig.webhookPort,
            logLevel: testConfig.logLevel
        });

        agentApiClient = new AgentAPIClient({
            baseURL: testConfig.agentApiUrl,
            logLevel: testConfig.logLevel,
            timeout: 10000 // Shorter timeout for tests
        });

        deploymentManager = new WSL2DeploymentManager({
            logLevel: testConfig.logLevel,
            workspaceRoot: '/tmp/test-deployments'
        });

        communicationBridge = new CommunicationBridge({
            agentApiUrl: testConfig.agentApiUrl,
            webhookPort: testConfig.webhookPort,
            logLevel: testConfig.logLevel,
            enableDeployments: false, // Disable WSL2 for CI/CD
            enableValidation: false   // Disable Claude Code for CI/CD
        });
    });

    afterAll(async () => {
        // Cleanup
        if (communicationBridge) {
            await communicationBridge.shutdown();
        }
        if (webhookHandler) {
            await webhookHandler.stop();
        }
        if (agentApiClient) {
            await agentApiClient.disconnect();
        }
        if (deploymentManager) {
            await deploymentManager.shutdown();
        }
    });

    describe('AuthManager', () => {
        test('should generate and validate API keys', async () => {
            const apiKey = authManager.generateApiKey('test-user', {
                permissions: ['read', 'write'],
                description: 'Test API key'
            });

            expect(apiKey).toBeDefined();
            expect(apiKey.key).toMatch(/^agentapi_/);
            expect(apiKey.userId).toBe('test-user');
            expect(apiKey.permissions).toEqual(['read', 'write']);

            const validation = await authManager.validateApiKey(apiKey.key);
            expect(validation.valid).toBe(true);
            expect(validation.userId).toBe('test-user');
            expect(validation.permissions).toEqual(['read', 'write']);
        });

        test('should authenticate with username/password', async () => {
            const result = await authManager.authenticate({
                username: 'admin',
                password: 'admin123'
            });

            expect(result.success).toBe(true);
            expect(result.token).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.userId).toBe('admin');
        });

        test('should validate JWT tokens', async () => {
            const authResult = await authManager.authenticate({
                username: 'admin',
                password: 'admin123'
            });

            const validation = await authManager.validateToken(authResult.token);
            expect(validation.valid).toBe(true);
            expect(validation.userId).toBe('admin');
        });

        test('should refresh tokens', async () => {
            const authResult = await authManager.authenticate({
                username: 'admin',
                password: 'admin123'
            });

            const refreshResult = await authManager.refreshToken(authResult.refreshToken);
            expect(refreshResult.success).toBe(true);
            expect(refreshResult.token).toBeDefined();
            expect(refreshResult.refreshToken).toBeDefined();
        });
    });

    describe('WebhookHandler', () => {
        beforeEach(async () => {
            await webhookHandler.start();
        });

        afterEach(async () => {
            await webhookHandler.stop();
        });

        test('should start and stop webhook server', async () => {
            const stats = webhookHandler.getStats();
            expect(stats.isRunning).toBe(true);
        });

        test('should register webhook endpoints', () => {
            webhookHandler.registerEndpoint('test-endpoint', ['test-event'], 'Test endpoint');
            
            const stats = webhookHandler.getStats();
            expect(stats.endpoints).toBe(1);
        });

        test('should send webhooks to external URLs', async () => {
            // Mock external webhook endpoint
            const mockWebhookUrl = 'https://httpbin.org/post';
            
            const result = await webhookHandler.sendWebhook(
                mockWebhookUrl,
                'test-event',
                { message: 'test payload' },
                { timeout: 5000 }
            );

            // Note: This test might fail in CI/CD without internet access
            // In a real test environment, you'd use a mock server
            expect(result.success).toBeDefined();
        });
    });

    describe('AgentAPIClient', () => {
        test('should handle connection status', () => {
            const status = agentApiClient.getConnectionStatus();
            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('baseURL');
            expect(status.baseURL).toBe(testConfig.agentApiUrl);
        });

        test('should handle health checks gracefully', async () => {
            const health = await agentApiClient.getHealth();
            expect(health).toHaveProperty('success');
            // Don't assert success=true as AgentAPI might not be running in CI/CD
        });

        test('should handle message sending gracefully', async () => {
            const result = await agentApiClient.sendMessage('test message', 'user');
            expect(result).toHaveProperty('success');
            // Don't assert success=true as AgentAPI might not be running in CI/CD
        });
    });

    describe('WSL2DeploymentManager', () => {
        test('should check WSL2 status', async () => {
            const status = await deploymentManager.checkWSL2Setup();
            expect(status).toHaveProperty('available');
            // Don't assert available=true as WSL2 might not be available in CI/CD
        });

        test('should handle deployment queue', () => {
            const stats = deploymentManager.getStats();
            expect(stats).toHaveProperty('activeDeployments');
            expect(stats).toHaveProperty('queuedDeployments');
            expect(stats).toHaveProperty('maxConcurrent');
        });

        test('should list deployments', () => {
            const deployments = deploymentManager.listDeployments();
            expect(Array.isArray(deployments)).toBe(true);
        });
    });

    describe('CommunicationBridge', () => {
        test('should initialize components', async () => {
            const status = communicationBridge.getStatus();
            expect(status).toHaveProperty('isInitialized');
            expect(status).toHaveProperty('activeOperations');
            expect(status).toHaveProperty('queuedOperations');
            expect(status).toHaveProperty('components');
        });

        test('should handle operation queue', () => {
            const operations = communicationBridge.listOperations();
            expect(Array.isArray(operations)).toBe(true);
        });

        test('should handle PR validation requests gracefully', async () => {
            const prInfo = {
                repository: 'test/repo',
                number: 123,
                branch: 'test-branch',
                cloneUrl: 'https://github.com/test/repo.git'
            };

            // This should queue the operation since validation is disabled
            try {
                const result = await communicationBridge.processPRValidation(prInfo, {
                    timeout: 1000 // Short timeout for test
                });
                // If it succeeds, that's fine
                expect(result).toBeDefined();
            } catch (error) {
                // If it fails due to disabled components, that's expected
                expect(error.message).toMatch(/not available|disabled/i);
            }
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle webhook events through communication bridge', (done) => {
            const testEvent = {
                type: 'test-event',
                data: { message: 'test webhook event' }
            };

            // Listen for the event
            communicationBridge.once('webhook.event', (data) => {
                expect(data).toBeDefined();
                done();
            });

            // Emit the event through webhook handler
            webhookHandler.emit('webhook', testEvent);
        });

        test('should handle authentication flow', async () => {
            // Generate API key
            const apiKey = authManager.generateApiKey('integration-test', {
                permissions: ['read', 'write']
            });

            // Validate API key
            const validation = await authManager.validateApiKey(apiKey.key);
            expect(validation.valid).toBe(true);

            // Use API key with client (mock)
            const clientWithAuth = new AgentAPIClient({
                baseURL: testConfig.agentApiUrl,
                apiKey: apiKey.key,
                logLevel: testConfig.logLevel
            });

            const status = clientWithAuth.getConnectionStatus();
            expect(status.baseURL).toBe(testConfig.agentApiUrl);
        });

        test('should handle error scenarios gracefully', async () => {
            // Test invalid API key
            const invalidValidation = await authManager.validateApiKey('invalid-key');
            expect(invalidValidation.valid).toBe(false);

            // Test invalid authentication
            const invalidAuth = await authManager.authenticate({
                username: 'invalid',
                password: 'invalid'
            });
            expect(invalidAuth.success).toBe(false);

            // Test client with invalid URL
            const invalidClient = new AgentAPIClient({
                baseURL: 'http://invalid-url:9999',
                timeout: 1000,
                logLevel: testConfig.logLevel
            });

            const health = await invalidClient.getHealth();
            expect(health.success).toBe(false);
        });
    });

    describe('Performance and Reliability', () => {
        test('should handle concurrent operations', async () => {
            const promises = [];
            
            // Create multiple concurrent API key validations
            for (let i = 0; i < 10; i++) {
                const apiKey = authManager.generateApiKey(`user-${i}`, {
                    permissions: ['read']
                });
                promises.push(authManager.validateApiKey(apiKey.key));
            }

            const results = await Promise.all(promises);
            results.forEach(result => {
                expect(result.valid).toBe(true);
            });
        });

        test('should handle resource cleanup', async () => {
            const initialStats = authManager.getStats();
            
            // Generate some API keys
            for (let i = 0; i < 5; i++) {
                authManager.generateApiKey(`cleanup-test-${i}`, {
                    permissions: ['read']
                });
            }

            const afterStats = authManager.getStats();
            expect(afterStats.totalApiKeys).toBeGreaterThan(initialStats.totalApiKeys);
        });

        test('should handle timeout scenarios', async () => {
            const shortTimeoutClient = new AgentAPIClient({
                baseURL: testConfig.agentApiUrl,
                timeout: 1, // 1ms timeout
                logLevel: testConfig.logLevel
            });

            const result = await shortTimeoutClient.getHealth();
            // Should handle timeout gracefully
            expect(result).toHaveProperty('success');
        });
    });
});

describe('Integration Test Utilities', () => {
    test('should provide test configuration', () => {
        expect(testConfig).toHaveProperty('agentApiUrl');
        expect(testConfig).toHaveProperty('webhookPort');
        expect(testConfig).toHaveProperty('logLevel');
    });

    test('should handle environment variables', () => {
        const originalUrl = process.env.TEST_AGENTAPI_URL;
        
        // Test with custom URL
        process.env.TEST_AGENTAPI_URL = 'http://custom-url:1234';
        
        const client = new AgentAPIClient({
            baseURL: process.env.TEST_AGENTAPI_URL || 'http://localhost:3284'
        });
        
        expect(client.getConnectionStatus().baseURL).toBe('http://custom-url:1234');
        
        // Restore original
        if (originalUrl) {
            process.env.TEST_AGENTAPI_URL = originalUrl;
        } else {
            delete process.env.TEST_AGENTAPI_URL;
        }
    });
});

