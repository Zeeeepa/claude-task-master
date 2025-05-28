/**
 * @fileoverview System Orchestrator Tests
 * @description Unit tests for the SystemOrchestrator class
 */

import { SystemOrchestrator } from '../../src/ai_cicd_system/orchestrator/system_orchestrator.js';
import { SystemConfig } from '../../src/ai_cicd_system/config/system_config.js';

// Mock WorkflowOrchestrator
class MockWorkflowOrchestrator {
    constructor(config) {
        this.config = config;
        this.isInitialized = false;
        this.workflows = new Map();
    }

    async initialize() {
        this.isInitialized = true;
    }

    async shutdown() {
        this.isInitialized = false;
        this.workflows.clear();
    }

    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            executing_workflows: this.workflows.size
        };
    }

    async startWorkflow(workflowDefinition) {
        const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.workflows.set(workflowId, {
            id: workflowId,
            definition: workflowDefinition,
            status: 'running',
            startedAt: new Date()
        });
        return workflowId;
    }

    async getWorkflowStatus(workflowId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            return { workflow_id: workflowId, status: 'not_found' };
        }

        // Simulate workflow completion after a short delay
        setTimeout(() => {
            if (this.workflows.has(workflowId)) {
                workflow.status = 'completed';
                workflow.result = {
                    workflow_id: workflowId,
                    status: 'completed',
                    result: { success: true }
                };
            }
        }, 50);

        return {
            workflow_id: workflowId,
            status: workflow.status,
            result: workflow.result
        };
    }
}

// Mock component for testing
class MockComponent {
    constructor(name = 'MockComponent') {
        this.name = name;
        this.isInitialized = false;
    }

    async initialize() {
        this.isInitialized = true;
    }

    async shutdown() {
        this.isInitialized = false;
    }

    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            name: this.name
        };
    }
}

// Mock the WorkflowOrchestrator import
jest.mock('../../src/ai_cicd_system/core/workflow_orchestrator.js', () => ({
    WorkflowOrchestrator: MockWorkflowOrchestrator
}));

describe('SystemOrchestrator', () => {
    let orchestrator;
    let config;

    beforeEach(() => {
        config = new SystemConfig({
            mode: 'testing',
            workflow: { max_concurrent_workflows: 5 },
            orchestrator: { enable_parallel_initialization: true }
        });
        orchestrator = new SystemOrchestrator(config);
    });

    afterEach(async () => {
        if (orchestrator.isInitialized) {
            await orchestrator.shutdown();
        }
    });

    describe('Initialization', () => {
        test('should initialize with SystemConfig instance', () => {
            expect(orchestrator.config).toBeInstanceOf(SystemConfig);
            expect(orchestrator.isInitialized).toBe(false);
        });

        test('should initialize with plain config object', () => {
            const plainConfig = { mode: 'testing' };
            const orch = new SystemOrchestrator(plainConfig);
            
            expect(orch.config).toBeInstanceOf(SystemConfig);
            expect(orch.config.config.mode).toBe('testing');
        });

        test('should initialize successfully', async () => {
            const results = await orchestrator.initialize();
            
            expect(orchestrator.isInitialized).toBe(true);
            expect(results.orchestrator_initialized).toBe(true);
            expect(results.total_time_ms).toBeGreaterThan(0);
            expect(orchestrator.startTime).toBeDefined();
        });

        test('should register core components by default', async () => {
            await orchestrator.initialize();
            
            expect(orchestrator.hasComponent('workflowOrchestrator')).toBe(true);
            expect(orchestrator.hasComponent('systemConfig')).toBe(true);
        });

        test('should skip core component registration when requested', async () => {
            await orchestrator.initialize({ registerCoreComponents: false });
            
            expect(orchestrator.getComponentNames()).toEqual([]);
        });

        test('should handle initialization failure', async () => {
            // Register a component that will fail initialization
            const failingComponent = {
                initialize: jest.fn().mockRejectedValue(new Error('Initialization failed'))
            };
            
            orchestrator.registerComponent('failing', failingComponent);
            
            await expect(orchestrator.initialize()).rejects.toThrow();
            expect(orchestrator.isInitialized).toBe(false);
        });

        test('should not initialize twice', async () => {
            await orchestrator.initialize();
            const firstMetrics = orchestrator.initializationMetrics;
            
            const secondResults = await orchestrator.initialize();
            
            expect(secondResults).toBe(firstMetrics);
        });
    });

    describe('Component Management', () => {
        test('should register component before initialization', () => {
            const component = new MockComponent('TestComponent');
            
            orchestrator.registerComponent('test', component);
            
            expect(orchestrator.hasComponent('test')).toBe(true);
            expect(orchestrator.getComponent('test')).toBe(component);
        });

        test('should not allow registration after initialization', async () => {
            await orchestrator.initialize();
            
            const component = new MockComponent('TestComponent');
            
            expect(() => orchestrator.registerComponent('test', component))
                .toThrow('Cannot register components after orchestrator is initialized');
        });

        test('should get component names', async () => {
            const component = new MockComponent('TestComponent');
            orchestrator.registerComponent('test', component);
            
            await orchestrator.initialize();
            
            const names = orchestrator.getComponentNames();
            expect(names).toContain('test');
            expect(names).toContain('workflowOrchestrator');
            expect(names).toContain('systemConfig');
        });

        test('should restart component', async () => {
            const component = new MockComponent('TestComponent');
            orchestrator.registerComponent('test', component);
            
            await orchestrator.initialize();
            
            expect(component.isInitialized).toBe(true);
            
            await orchestrator.restartComponent('test');
            
            expect(component.isInitialized).toBe(true);
        });

        test('should handle restart of non-existent component', async () => {
            await orchestrator.initialize();
            
            await expect(orchestrator.restartComponent('nonexistent'))
                .rejects.toThrow();
        });
    });

    describe('Task Processing', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should process task successfully', async () => {
            const task = {
                id: 'test-task-1',
                title: 'Test Task',
                description: 'A test task'
            };
            
            const result = await orchestrator.processTask(task);
            
            expect(result).toBeDefined();
            expect(result.workflow_id).toBeDefined();
        });

        test('should process task with context', async () => {
            const task = { id: 'test-task-1', title: 'Test Task' };
            const context = { user: 'test-user', priority: 'high' };
            
            const result = await orchestrator.processTask(task, context);
            
            expect(result).toBeDefined();
        });

        test('should throw error when not initialized', async () => {
            const uninitializedOrchestrator = new SystemOrchestrator(config);
            const task = { id: 'test-task-1' };
            
            await expect(uninitializedOrchestrator.processTask(task))
                .rejects.toThrow('System orchestrator not initialized');
        });

        test('should throw error when WorkflowOrchestrator not available', async () => {
            // Initialize without core components
            await orchestrator.initialize({ registerCoreComponents: false });
            
            const task = { id: 'test-task-1' };
            
            await expect(orchestrator.processTask(task))
                .rejects.toThrow('WorkflowOrchestrator component not available');
        });

        test('should handle workflow execution timeout', async () => {
            const task = { id: 'test-task-1' };
            
            // Mock workflow orchestrator to never complete
            const workflowOrchestrator = orchestrator.getComponent('workflowOrchestrator');
            workflowOrchestrator.getWorkflowStatus = jest.fn().mockResolvedValue({
                workflow_id: 'test-workflow',
                status: 'running'
            });
            
            await expect(orchestrator.processTask(task)).rejects.toThrow('Workflow execution timeout');
        }, 10000);
    });

    describe('Health and Statistics', () => {
        test('should return unhealthy when not initialized', async () => {
            const health = await orchestrator.getHealth();
            
            expect(health.status).toBe('unhealthy');
            expect(health.reason).toBe('System orchestrator not initialized');
            expect(health.is_initialized).toBe(false);
        });

        test('should return healthy when initialized', async () => {
            await orchestrator.initialize();
            
            const health = await orchestrator.getHealth();
            
            expect(health.status).toBe('healthy');
            expect(health.is_initialized).toBe(true);
            expect(health.uptime_ms).toBeGreaterThan(0);
            expect(health.total_components).toBeGreaterThan(0);
        });

        test('should handle health check failure', async () => {
            await orchestrator.initialize();
            
            // Mock health check to throw error
            orchestrator.lifecycleManager.getHealth = jest.fn().mockRejectedValue(new Error('Health check failed'));
            
            const health = await orchestrator.getHealth();
            
            expect(health.status).toBe('unhealthy');
            expect(health.reason).toContain('Health check failed');
        });

        test('should get system statistics', async () => {
            await orchestrator.initialize();
            
            const stats = await orchestrator.getStatistics();
            
            expect(stats.is_initialized).toBe(true);
            expect(stats.uptime_ms).toBeGreaterThan(0);
            expect(stats.initialization_metrics).toBeDefined();
            expect(stats.lifecycle_stats).toBeDefined();
            expect(stats.registry_stats).toBeDefined();
            expect(stats.config_summary).toBeDefined();
        });

        test('should get component details', async () => {
            const component = new MockComponent('TestComponent');
            orchestrator.registerComponent('test', component);
            
            await orchestrator.initialize();
            
            const details = orchestrator.getComponentDetails();
            
            expect(details).toBeInstanceOf(Array);
            expect(details.length).toBeGreaterThan(0);
            expect(details.some(d => d.name === 'test')).toBe(true);
        });
    });

    describe('Pause and Resume', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should pause orchestrator', async () => {
            await expect(orchestrator.pause('Test pause')).resolves.not.toThrow();
        });

        test('should resume orchestrator', async () => {
            await expect(orchestrator.resume()).resolves.not.toThrow();
        });

        test('should throw error when pausing uninitialized orchestrator', async () => {
            const uninitializedOrchestrator = new SystemOrchestrator(config);
            
            await expect(uninitializedOrchestrator.pause())
                .rejects.toThrow('System orchestrator not initialized');
        });

        test('should throw error when resuming uninitialized orchestrator', async () => {
            const uninitializedOrchestrator = new SystemOrchestrator(config);
            
            await expect(uninitializedOrchestrator.resume())
                .rejects.toThrow('System orchestrator not initialized');
        });
    });

    describe('Shutdown', () => {
        test('should shutdown successfully', async () => {
            await orchestrator.initialize();
            
            const results = await orchestrator.shutdown();
            
            expect(orchestrator.isInitialized).toBe(false);
            expect(results.orchestrator_shutdown).toBe(true);
            expect(results.total_uptime_ms).toBeGreaterThan(0);
            expect(orchestrator.components.size).toBe(0);
        });

        test('should handle shutdown failure', async () => {
            await orchestrator.initialize();
            
            // Mock lifecycle manager to fail shutdown
            orchestrator.lifecycleManager.shutdownAll = jest.fn().mockRejectedValue(new Error('Shutdown failed'));
            
            await expect(orchestrator.shutdown()).rejects.toThrow('Shutdown failed');
        });

        test('should shutdown with custom options', async () => {
            await orchestrator.initialize();
            
            const results = await orchestrator.shutdown({
                force: false,
                timeout: 5000
            });
            
            expect(results.orchestrator_shutdown).toBe(true);
        });
    });

    describe('Error Handling', () => {
        test('should handle component registration errors', () => {
            expect(() => orchestrator.registerComponent('', new MockComponent()))
                .toThrow();
        });

        test('should handle invalid component registration', () => {
            expect(() => orchestrator.registerComponent('test', null))
                .toThrow();
        });

        test('should handle workflow creation errors', async () => {
            await orchestrator.initialize();
            
            // Mock workflow orchestrator to fail
            const workflowOrchestrator = orchestrator.getComponent('workflowOrchestrator');
            workflowOrchestrator.startWorkflow = jest.fn().mockRejectedValue(new Error('Workflow creation failed'));
            
            const task = { id: 'test-task-1' };
            
            await expect(orchestrator.processTask(task))
                .rejects.toThrow('Workflow creation failed');
        });
    });

    describe('Configuration', () => {
        test('should use provided configuration', () => {
            const customConfig = new SystemConfig({
                mode: 'production',
                workflow: { max_concurrent_workflows: 20 }
            });
            
            const orch = new SystemOrchestrator(customConfig);
            
            expect(orch.config.config.mode).toBe('production');
            expect(orch.config.workflow.max_concurrent_workflows).toBe(20);
        });

        test('should create SystemConfig from plain object', () => {
            const plainConfig = {
                mode: 'development',
                workflow: { max_concurrent_workflows: 3 }
            };
            
            const orch = new SystemOrchestrator(plainConfig);
            
            expect(orch.config).toBeInstanceOf(SystemConfig);
            expect(orch.config.config.mode).toBe('development');
        });
    });
});

