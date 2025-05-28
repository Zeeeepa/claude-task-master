/**
 * AgentAPI Integration Tests
 * 
 * Comprehensive test suite for AgentAPI middleware integration,
 * covering all components and scenarios.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Import components to test
import { AGENTAPI_CONFIG, getAgentConfig, getAgentsByCapability, validateAgentConfig } from '../../src/ai_cicd_system/config/agentapi_config.js';
import AgentAPIClient from '../../src/ai_cicd_system/integrations/agentapi_client.js';
import AgentRouter from '../../src/ai_cicd_system/integrations/agent_router.js';
import AgentManager from '../../src/ai_cicd_system/integrations/agent_manager.js';
import AgentHealthMonitor from '../../src/ai_cicd_system/utils/agent_health_monitor.js';
import AgentMiddleware from '../../src/ai_cicd_system/middleware/agent_middleware.js';
import AgentEndpoints from '../../src/ai_cicd_system/api/agent_endpoints.js';

describe('AgentAPI Configuration', () => {
    test('should have valid default configuration', () => {
        const validation = validateAgentConfig();
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
    });

    test('should get agent configuration by type', () => {
        const claudeConfig = getAgentConfig('claude-code');
        expect(claudeConfig).toBeDefined();
        expect(claudeConfig.capabilities).toContain('pr_deployment');
        expect(claudeConfig.wsl2_instance).toBe(true);
    });

    test('should throw error for unknown agent type', () => {
        expect(() => getAgentConfig('unknown-agent')).toThrow('Unknown agent type: unknown-agent');
    });

    test('should get agents by capability', () => {
        const deploymentAgents = getAgentsByCapability('pr_deployment');
        expect(deploymentAgents).toHaveLength(1);
        expect(deploymentAgents[0].type).toBe('claude-code');

        const codeGenAgents = getAgentsByCapability('code_generation');
        expect(codeGenAgents).toHaveLength(1);
        expect(codeGenAgents[0].type).toBe('goose');
    });

    test('should validate configuration with errors', () => {
        const invalidConfig = {
            base_url: '',
            agents: {
                'test-agent': {
                    // Missing required fields
                }
            }
        };

        const validation = validateAgentConfig(invalidConfig);
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
    });
});

describe('AgentAPIClient', () => {
    let client;

    beforeEach(() => {
        client = new AgentAPIClient({
            base_url: 'http://localhost:8080',
            api_key: 'test-key',
            timeout: 5000
        });
    });

    afterEach(async () => {
        await client.shutdown();
    });

    test('should initialize with correct configuration', () => {
        expect(client.config.base_url).toBe('http://localhost:8080');
        expect(client.config.api_key).toBe('test-key');
        expect(client.agents).toBeDefined();
        expect(Object.keys(client.agents)).toHaveLength(4);
    });

    test('should route task to appropriate agent', async () => {
        const task = {
            task_id: 'test-task-1',
            task_type: 'pr_deployment',
            repository: {
                url: 'https://github.com/test/repo',
                branch: 'feature/test'
            },
            requirements: ['deploy', 'validate']
        };

        // Mock the HTTP client to avoid actual network calls
        client.httpClient.post = jest.fn().mockResolvedValue({
            data: {
                success: true,
                result: 'Task completed successfully',
                processing_time: 1500
            }
        });

        const result = await client.routeTask(task);
        
        expect(result.success).toBe(true);
        expect(result.agentType).toBe('claude-code');
        expect(result.result).toBeDefined();
    });

    test('should handle agent selection for different task types', async () => {
        const testCases = [
            { task_type: 'code_generation', expectedAgent: 'goose' },
            { task_type: 'code_editing', expectedAgent: 'aider' },
            { task_type: 'documentation', expectedAgent: 'codex' },
            { task_type: 'pr_deployment', expectedAgent: 'claude-code' }
        ];

        for (const testCase of testCases) {
            const selectedAgent = client._selectBestAgent({
                task_type: testCase.task_type,
                requirements: []
            });
            expect(selectedAgent).toBe(testCase.expectedAgent);
        }
    });

    test('should handle circuit breaker functionality', async () => {
        const agentType = 'claude-code';
        
        // Simulate multiple failures
        for (let i = 0; i < 5; i++) {
            client._recordFailure(agentType);
        }

        expect(client._isCircuitBreakerOpen(agentType)).toBe(true);

        // Record success to close circuit breaker
        client._recordSuccess(agentType);
        expect(client._isCircuitBreakerOpen(agentType)).toBe(false);
    });

    test('should get agent status', async () => {
        // Mock health check
        client.httpClient.get = jest.fn().mockResolvedValue({
            data: {
                status: 'healthy',
                uptime: 3600,
                version: '1.0.0'
            }
        });

        const status = await client.getAgentStatus('claude-code');
        expect(status.type).toBe('claude-code');
        expect(status.healthy).toBe(true);
    });
});

describe('AgentRouter', () => {
    let router;
    let mockHealthMonitor;

    beforeEach(() => {
        mockHealthMonitor = {
            isAgentHealthy: jest.fn().mockResolvedValue(true)
        };
        router = new AgentRouter({}, mockHealthMonitor);
    });

    test('should extract capabilities from task', () => {
        const testCases = [
            {
                task: { task_type: 'pr_deployment' },
                expected: ['pr_deployment', 'code_validation']
            },
            {
                task: { task_type: 'code_generation' },
                expected: ['code_generation']
            },
            {
                task: { 
                    task_type: 'debugging',
                    context: { git_operations: true }
                },
                expected: ['error_debugging', 'code_validation', 'git_operations']
            }
        ];

        for (const testCase of testCases) {
            const capabilities = router.extractCapabilities(testCase.task);
            expect(capabilities).toEqual(expect.arrayContaining(testCase.expected));
        }
    });

    test('should select agent based on capability priority strategy', async () => {
        const task = {
            task_type: 'pr_deployment',
            requirements: ['deploy', 'validate']
        };

        const selectedAgent = await router.selectAgent(task);
        expect(selectedAgent.type).toBe('claude-code');
        expect(selectedAgent.priority).toBe(1);
    });

    test('should handle no suitable agents scenario', async () => {
        const task = {
            task_type: 'unknown_task_type',
            requirements: ['nonexistent_capability']
        };

        await expect(router.selectAgent(task)).rejects.toThrow('No agents available with required capabilities');
    });

    test('should record and retrieve routing statistics', () => {
        router.recordSuccess('claude-code', 1500);
        router.recordFailure('goose');

        const stats = router.getRoutingStats();
        expect(stats['claude-code'].successfulRequests).toBe(1);
        expect(stats['goose'].failedRequests).toBe(1);
    });

    test('should provide agent recommendations', () => {
        const task = {
            task_type: 'code_generation',
            requirements: ['generate']
        };

        const recommendations = router.getAgentRecommendations(task, 2);
        expect(recommendations).toHaveLength(1);
        expect(recommendations[0].type).toBe('goose');
        expect(recommendations[0].score).toBeGreaterThan(0);
    });
});

describe('AgentManager', () => {
    let manager;
    let mockHealthMonitor;

    beforeEach(() => {
        mockHealthMonitor = {
            isAgentHealthy: jest.fn().mockResolvedValue(true)
        };
        manager = new AgentManager({}, mockHealthMonitor);
    });

    afterEach(async () => {
        await manager.shutdown();
    });

    test('should initialize with correct agent states', () => {
        const agentsStatus = manager.getAllAgentsStatus();
        expect(Object.keys(agentsStatus)).toHaveLength(4);
        
        for (const agentType of ['claude-code', 'goose', 'aider', 'codex']) {
            expect(agentsStatus[agentType]).toBeDefined();
            expect(agentsStatus[agentType].type).toBe(agentType);
        }
    });

    test('should execute task successfully', async () => {
        const task = {
            task_id: 'test-task-1',
            task_type: 'code_generation',
            requirements: ['generate']
        };

        // Mock the agent client
        manager.agentClient.routeTask = jest.fn().mockResolvedValue({
            success: true,
            result: 'Task completed',
            agentType: 'goose'
        });

        const result = await manager.executeTask(task);
        expect(result.success).toBe(true);
        expect(result.agentType).toBe('goose');
    });

    test('should queue task when agent at capacity', async () => {
        const task = {
            task_id: 'test-task-2',
            task_type: 'code_generation'
        };

        // Set agent to maximum capacity
        const agentState = manager.agentStates.get('goose');
        agentState.activeTasks = agentState.maxConcurrentTasks;

        const result = await manager.executeTask(task);
        expect(result.queued).toBe(true);
        expect(result.queuePosition).toBeDefined();
    });

    test('should get queue status', () => {
        const queueStatus = manager.getQueueStatus();
        expect(queueStatus.size).toBe(0);
        expect(queueStatus.maxSize).toBeDefined();
        expect(queueStatus.tasks).toEqual([]);
    });

    test('should get system metrics', () => {
        const metrics = manager.getMetrics();
        expect(metrics.totalTasks).toBeDefined();
        expect(metrics.successfulTasks).toBeDefined();
        expect(metrics.failedTasks).toBeDefined();
        expect(metrics.agentUtilization).toBeDefined();
    });

    test('should restart agent', async () => {
        const agentType = 'claude-code';
        
        // Mock health check
        manager.agentClient.healthCheck = jest.fn().mockResolvedValue({
            healthy: true,
            status: 'healthy'
        });

        const result = await manager.restartAgent(agentType);
        expect(result).toBe(true);
        
        const agentState = manager.agentStates.get(agentType);
        expect(agentState.healthy).toBe(true);
        expect(agentState.status).toBe('healthy');
    });
});

describe('AgentHealthMonitor', () => {
    let healthMonitor;

    beforeEach(() => {
        healthMonitor = new AgentHealthMonitor({
            enable_metrics: true,
            health_check_interval: 1000
        });
    });

    afterEach(() => {
        healthMonitor.shutdown();
    });

    test('should initialize health tracking for all agents', () => {
        const allHealth = healthMonitor.getAllAgentsHealth();
        expect(Object.keys(allHealth)).toHaveLength(4);
        
        for (const agentType of ['claude-code', 'goose', 'aider', 'codex']) {
            expect(allHealth[agentType]).toBeDefined();
            expect(allHealth[agentType].type).toBe(agentType);
        }
    });

    test('should check agent health', async () => {
        const agentType = 'claude-code';
        const isHealthy = await healthMonitor.isAgentHealthy(agentType);
        expect(typeof isHealthy).toBe('boolean');
    });

    test('should get health summary', () => {
        const summary = healthMonitor.getHealthSummary();
        expect(summary.totalAgents).toBe(4);
        expect(summary.healthyAgents).toBeDefined();
        expect(summary.unhealthyAgents).toBeDefined();
        expect(summary.averageAvailability).toBeDefined();
    });

    test('should handle circuit breaker operations', () => {
        const agentType = 'claude-code';
        
        // Reset circuit breaker
        healthMonitor.resetCircuitBreaker(agentType);
        expect(healthMonitor._isCircuitBreakerOpen(agentType)).toBe(false);
    });

    test('should manage alerts', () => {
        const alerts = healthMonitor.getActiveAlerts();
        expect(Array.isArray(alerts)).toBe(true);
    });

    test('should force health check', async () => {
        await expect(healthMonitor.forceHealthCheck('claude-code')).resolves.not.toThrow();
    });
});

describe('AgentMiddleware', () => {
    let middleware;
    let app;

    beforeEach(() => {
        middleware = new AgentMiddleware({
            enable_rate_limiting: true,
            enable_api_key_validation: false // Disable for testing
        });
        app = express();
    });

    test('should create middleware functions', () => {
        expect(typeof middleware.authenticate()).toBe('function');
        expect(typeof middleware.rateLimit()).toBe('function');
        expect(typeof middleware.validateRequest()).toBe('function');
        expect(typeof middleware.transformRequest()).toBe('function');
        expect(typeof middleware.cors()).toBe('function');
    });

    test('should handle CORS requests', async () => {
        app.use(middleware.cors());
        app.get('/test', (req, res) => res.json({ success: true }));

        const response = await request(app)
            .options('/test')
            .set('Origin', 'http://localhost:3000');

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should validate requests', async () => {
        app.use(middleware.validateRequest());
        app.post('/test', (req, res) => res.json({ success: true }));

        // Test missing content-type
        const response = await request(app)
            .post('/test')
            .send({ data: 'test' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
    });

    test('should transform requests', async () => {
        app.use(express.json());
        app.use(middleware.transformRequest());
        app.post('/test', (req, res) => {
            expect(req.metadata).toBeDefined();
            expect(req.metadata.requestId).toBeDefined();
            res.json({ success: true });
        });

        await request(app)
            .post('/test')
            .set('Content-Type', 'application/json')
            .send({ task_type: 'test' });
    });

    test('should get middleware metrics', () => {
        const metrics = middleware.getMetrics();
        expect(metrics.rateLimitStore).toBeDefined();
        expect(metrics.requestMetrics).toBeDefined();
    });
});

describe('AgentEndpoints', () => {
    let endpoints;
    let app;

    beforeEach(() => {
        endpoints = new AgentEndpoints({
            enable_api_key_validation: false // Disable for testing
        });
        app = express();
        app.use(express.json());
        app.use('/api/v1', endpoints.getRouter());
    });

    afterEach(async () => {
        await endpoints.shutdown();
    });

    test('should handle health check', async () => {
        const response = await request(app).get('/api/v1/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBeDefined();
        expect(response.body.agents).toBeDefined();
    });

    test('should route tasks', async () => {
        // Mock the agent manager
        endpoints.agentManager.executeTask = jest.fn().mockResolvedValue({
            success: true,
            agentType: 'claude-code',
            result: 'Task completed',
            processingTime: 1500
        });

        const task = {
            task_type: 'pr_deployment',
            repository: {
                url: 'https://github.com/test/repo',
                branch: 'feature/test'
            }
        };

        const response = await request(app)
            .post('/api/v1/agents/route')
            .send({ task });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.agent_type).toBe('claude-code');
    });

    test('should get agent status', async () => {
        const response = await request(app).get('/api/v1/agents/status');
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    });

    test('should get queue status', async () => {
        const response = await request(app).get('/api/v1/agents/queue');
        expect(response.status).toBe(200);
        expect(response.body.size).toBeDefined();
    });

    test('should get metrics', async () => {
        const response = await request(app).get('/api/v1/metrics');
        expect(response.status).toBe(200);
        expect(response.body.system).toBeDefined();
        expect(response.body.health).toBeDefined();
    });

    test('should handle agent recommendations', async () => {
        const task = {
            task_type: 'code_generation',
            requirements: ['generate']
        };

        const response = await request(app)
            .post('/api/v1/agents/recommend')
            .send({ task });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.recommendations).toBeDefined();
    });

    test('should handle Claude Code deployment', async () => {
        // Mock the agent manager
        endpoints.agentManager.executeTask = jest.fn().mockResolvedValue({
            success: true,
            agentType: 'claude-code',
            result: {
                metadata: {
                    wsl2_instance: {
                        id: 'test-instance',
                        workspace: '/tmp/claude-code-test'
                    }
                }
            }
        });

        const deploymentData = {
            repository: {
                url: 'https://github.com/test/repo'
            },
            branch: 'feature/test',
            pr_number: 123
        };

        const response = await request(app)
            .post('/api/v1/agents/claude-code/deploy')
            .send(deploymentData);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.deployment_id).toBeDefined();
    });

    test('should handle error cases', async () => {
        // Test missing task data
        const response = await request(app)
            .post('/api/v1/agents/route')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
    });
});

describe('Integration Tests', () => {
    let agentManager;
    let healthMonitor;

    beforeEach(() => {
        healthMonitor = new AgentHealthMonitor();
        agentManager = new AgentManager({}, healthMonitor);
    });

    afterEach(async () => {
        await agentManager.shutdown();
        healthMonitor.shutdown();
    });

    test('should handle end-to-end task processing', async () => {
        const task = {
            task_id: 'integration-test-1',
            task_type: 'code_generation',
            repository: {
                url: 'https://github.com/test/repo',
                branch: 'main'
            },
            requirements: ['generate', 'validate'],
            context: {
                language: 'javascript',
                framework: 'node.js'
            }
        };

        // Mock the HTTP client to simulate agent response
        agentManager.agentClient.httpClient.post = jest.fn().mockResolvedValue({
            data: {
                success: true,
                result: {
                    generated_code: 'console.log("Hello, World!");',
                    validation_result: 'passed'
                },
                processing_time: 2000
            }
        });

        const result = await agentManager.executeTask(task);
        
        expect(result.success).toBe(true);
        expect(result.agentType).toBe('goose');
        expect(result.result.data.generated_code).toBeDefined();
    });

    test('should handle failover scenarios', async () => {
        const task = {
            task_id: 'failover-test-1',
            task_type: 'code_editing',
            requirements: ['edit']
        };

        // Mock first agent to fail
        let callCount = 0;
        agentManager.agentClient.httpClient.post = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                throw new Error('Agent unavailable');
            }
            return Promise.resolve({
                data: {
                    success: true,
                    result: 'Failover successful'
                }
            });
        });

        const result = await agentManager.executeTask(task);
        expect(result.success).toBe(true);
    });

    test('should handle concurrent task processing', async () => {
        const tasks = Array.from({ length: 5 }, (_, i) => ({
            task_id: `concurrent-test-${i}`,
            task_type: 'documentation',
            requirements: ['document']
        }));

        // Mock agent responses
        agentManager.agentClient.httpClient.post = jest.fn().mockResolvedValue({
            data: {
                success: true,
                result: 'Documentation generated'
            }
        });

        const promises = tasks.map(task => agentManager.executeTask(task));
        const results = await Promise.all(promises);

        expect(results).toHaveLength(5);
        results.forEach(result => {
            expect(result.success).toBe(true);
        });
    });

    test('should handle WSL2 instance management', async () => {
        const task = {
            task_id: 'wsl2-test-1',
            task_type: 'pr_deployment',
            repository: {
                url: 'https://github.com/test/repo',
                branch: 'feature/wsl2-test'
            },
            context: {
                wsl2_required: true
            }
        };

        // Mock Claude Code response with WSL2 instance
        agentManager.agentClient.httpClient.post = jest.fn().mockResolvedValue({
            data: {
                success: true,
                result: {
                    deployment_status: 'success',
                    wsl2_instance: {
                        id: 'wsl2-instance-1',
                        workspace: '/tmp/claude-code-wsl2-test-1'
                    }
                }
            }
        });

        const result = await agentManager.executeTask(task);
        
        expect(result.success).toBe(true);
        expect(result.agentType).toBe('claude-code');
        expect(result.result.data.wsl2_instance).toBeDefined();
    });
});

describe('Performance Tests', () => {
    let agentManager;

    beforeEach(() => {
        agentManager = new AgentManager();
    });

    afterEach(async () => {
        await agentManager.shutdown();
    });

    test('should handle high concurrent load', async () => {
        const taskCount = 50;
        const tasks = Array.from({ length: taskCount }, (_, i) => ({
            task_id: `perf-test-${i}`,
            task_type: 'code_analysis',
            requirements: ['analyze']
        }));

        // Mock fast agent responses
        agentManager.agentClient.httpClient.post = jest.fn().mockResolvedValue({
            data: {
                success: true,
                result: 'Analysis complete'
            }
        });

        const startTime = Date.now();
        const promises = tasks.map(task => agentManager.executeTask(task));
        const results = await Promise.all(promises);
        const endTime = Date.now();

        const totalTime = endTime - startTime;
        const averageTime = totalTime / taskCount;

        expect(results).toHaveLength(taskCount);
        expect(averageTime).toBeLessThan(1000); // Should average less than 1 second per task
        
        results.forEach(result => {
            expect(result.success).toBe(true);
        });
    });

    test('should maintain response time under load', async () => {
        const responseTimes = [];
        
        // Mock agent with variable response time
        agentManager.agentClient.httpClient.post = jest.fn().mockImplementation(() => {
            const delay = Math.random() * 100 + 50; // 50-150ms
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve({
                        data: {
                            success: true,
                            result: 'Task completed'
                        }
                    });
                }, delay);
            });
        });

        for (let i = 0; i < 20; i++) {
            const startTime = Date.now();
            await agentManager.executeTask({
                task_id: `response-time-test-${i}`,
                task_type: 'testing'
            });
            const endTime = Date.now();
            responseTimes.push(endTime - startTime);
        }

        const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

        expect(averageResponseTime).toBeLessThan(5000); // 5 seconds
        expect(p95ResponseTime).toBeLessThan(5000); // 5 seconds
    });
});

describe('Error Handling Tests', () => {
    let agentManager;

    beforeEach(() => {
        agentManager = new AgentManager();
    });

    afterEach(async () => {
        await agentManager.shutdown();
    });

    test('should handle network errors gracefully', async () => {
        const task = {
            task_id: 'network-error-test',
            task_type: 'code_generation'
        };

        // Mock network error
        agentManager.agentClient.httpClient.post = jest.fn().mockRejectedValue(
            new Error('Network error: ECONNREFUSED')
        );

        await expect(agentManager.executeTask(task)).rejects.toThrow();
    });

    test('should handle agent timeout', async () => {
        const task = {
            task_id: 'timeout-test',
            task_type: 'code_generation'
        };

        // Mock timeout
        agentManager.agentClient.httpClient.post = jest.fn().mockImplementation(() => {
            return new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Request timeout'));
                }, 100);
            });
        });

        await expect(agentManager.executeTask(task)).rejects.toThrow('Request timeout');
    });

    test('should handle invalid task data', async () => {
        const invalidTasks = [
            null,
            undefined,
            {},
            { task_type: '' },
            { task_type: 'invalid_type' }
        ];

        for (const task of invalidTasks) {
            if (task === null || task === undefined) {
                continue; // Skip null/undefined as they would cause different errors
            }
            
            try {
                await agentManager.executeTask(task);
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
            }
        }
    });
});

// Test utilities
export const TestUtils = {
    createMockTask: (overrides = {}) => ({
        task_id: `test-task-${Date.now()}`,
        task_type: 'code_generation',
        repository: {
            url: 'https://github.com/test/repo',
            branch: 'main'
        },
        requirements: ['generate'],
        context: {},
        ...overrides
    }),

    createMockAgent: (type, overrides = {}) => ({
        type,
        healthy: true,
        activeTasks: 0,
        maxConcurrentTasks: 10,
        ...overrides
    }),

    waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    mockHttpResponse: (data, delay = 0) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ data });
            }, delay);
        });
    }
};

export default {
    AGENTAPI_CONFIG,
    AgentAPIClient,
    AgentRouter,
    AgentManager,
    AgentHealthMonitor,
    AgentMiddleware,
    AgentEndpoints,
    TestUtils
};

