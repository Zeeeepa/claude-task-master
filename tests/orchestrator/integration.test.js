/**
 * @fileoverview Orchestrator Integration Tests
 * @description Integration tests for the complete orchestrator system
 */

import { SystemOrchestrator } from '../../src/ai_cicd_system/orchestrator/system_orchestrator.js';
import { UnifiedSystem } from '../../src/ai_cicd_system/core/unified_system.js';
import { SystemConfig } from '../../src/ai_cicd_system/config/system_config.js';
import { ComponentInterface, ServiceComponentInterface } from '../../src/ai_cicd_system/core/component_interface.js';

// Test service component
class TestServiceComponent extends ServiceComponentInterface {
    constructor(config = {}) {
        super(config);
        this.name = 'TestService';
        this.version = '1.0.0';
        this.requestCount = 0;
    }

    async initialize() {
        this.registerEndpoint('ping', this.ping.bind(this));
        this.registerEndpoint('echo', this.echo.bind(this));
        this.registerEndpoint('process', this.process.bind(this));
        this.isInitialized = true;
    }

    async ping() {
        return { status: 'pong', timestamp: new Date().toISOString() };
    }

    async echo(message) {
        return { echo: message, service: this.name };
    }

    async process(data) {
        this.requestCount++;
        return {
            processed: true,
            data,
            request_count: this.requestCount,
            processed_at: new Date().toISOString()
        };
    }

    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            name: this.name,
            version: this.version,
            request_count: this.requestCount,
            endpoints: this.getEndpoints()
        };
    }
}

// Test storage component
class TestStorageComponent extends ComponentInterface {
    constructor(config = {}) {
        super(config);
        this.name = 'TestStorage';
        this.version = '1.0.0';
        this.storage = new Map();
        this.dependencies = ['TestService'];
    }

    async initialize() {
        this.isInitialized = true;
    }

    async store(key, value) {
        this.storage.set(key, {
            value,
            stored_at: new Date().toISOString()
        });
        return true;
    }

    async retrieve(key) {
        return this.storage.get(key) || null;
    }

    async delete(key) {
        return this.storage.delete(key);
    }

    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            name: this.name,
            version: this.version,
            stored_items: this.storage.size
        };
    }
}

describe('Orchestrator Integration Tests', () => {
    let config;
    let orchestrator;

    beforeEach(() => {
        config = new SystemConfig({
            mode: 'testing',
            orchestrator: {
                enable_parallel_initialization: true,
                component_initialization_timeout: 5000
            }
        });
    });

    afterEach(async () => {
        if (orchestrator && orchestrator.isInitialized) {
            await orchestrator.shutdown();
        }
    });

    describe('Basic Orchestrator Integration', () => {
        test('should initialize orchestrator with custom components', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const serviceComponent = new TestServiceComponent();
            const storageComponent = new TestStorageComponent();
            
            orchestrator.registerComponent('testService', serviceComponent, {
                priority: 10,
                healthCheck: () => serviceComponent.getHealth()
            });
            
            orchestrator.registerComponent('testStorage', storageComponent, {
                dependencies: ['testService'],
                priority: 20,
                healthCheck: () => storageComponent.getHealth()
            });
            
            const results = await orchestrator.initialize();
            
            expect(results.successful).toBe(4); // 2 custom + 2 core components
            expect(results.failed).toBe(0);
            expect(orchestrator.isInitialized).toBe(true);
            
            // Verify components are accessible
            expect(orchestrator.getComponent('testService')).toBe(serviceComponent);
            expect(orchestrator.getComponent('testStorage')).toBe(storageComponent);
            
            // Verify initialization order respects dependencies
            const initOrder = orchestrator.lifecycleManager.initializationOrder;
            const serviceIndex = initOrder.indexOf('testService');
            const storageIndex = initOrder.indexOf('testStorage');
            expect(serviceIndex).toBeLessThan(storageIndex);
        });

        test('should handle component dependencies correctly', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const comp1 = new TestServiceComponent();
            const comp2 = new TestStorageComponent();
            const comp3 = new TestServiceComponent();
            
            comp1.name = 'Service1';
            comp2.name = 'Storage1';
            comp2.dependencies = ['Service1'];
            comp3.name = 'Service2';
            comp3.dependencies = ['Storage1'];
            
            orchestrator.registerComponent('service1', comp1);
            orchestrator.registerComponent('storage1', comp2);
            orchestrator.registerComponent('service2', comp3);
            
            await orchestrator.initialize();
            
            const initOrder = orchestrator.lifecycleManager.initializationOrder;
            const service1Index = initOrder.indexOf('service1');
            const storage1Index = initOrder.indexOf('storage1');
            const service2Index = initOrder.indexOf('service2');
            
            expect(service1Index).toBeLessThan(storage1Index);
            expect(storage1Index).toBeLessThan(service2Index);
        });

        test('should run health checks for all components', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const serviceComponent = new TestServiceComponent();
            const storageComponent = new TestStorageComponent();
            
            orchestrator.registerComponent('testService', serviceComponent, {
                healthCheck: () => serviceComponent.getHealth()
            });
            
            orchestrator.registerComponent('testStorage', storageComponent, {
                dependencies: ['testService'],
                healthCheck: () => storageComponent.getHealth()
            });
            
            await orchestrator.initialize();
            
            const health = await orchestrator.getHealth();
            
            expect(health.status).toBe('healthy');
            expect(health.component_health.testService.status).toBe('healthy');
            expect(health.component_health.testStorage.status).toBe('healthy');
        });

        test('should handle component initialization failure gracefully', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const failingComponent = {
                initialize: jest.fn().mockRejectedValue(new Error('Initialization failed')),
                getHealth: jest.fn().mockResolvedValue({ status: 'unhealthy' })
            };
            
            orchestrator.registerComponent('failing', failingComponent);
            
            await expect(orchestrator.initialize()).rejects.toThrow('Initialization failed');
            expect(orchestrator.isInitialized).toBe(false);
        });
    });

    describe('Service Component Integration', () => {
        beforeEach(async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const serviceComponent = new TestServiceComponent();
            orchestrator.registerComponent('testService', serviceComponent, {
                healthCheck: () => serviceComponent.getHealth()
            });
            
            await orchestrator.initialize();
        });

        test('should call service endpoints', async () => {
            const service = orchestrator.getComponent('testService');
            
            const pingResult = await service.callEndpoint('ping');
            expect(pingResult.status).toBe('pong');
            
            const echoResult = await service.callEndpoint('echo', 'Hello World');
            expect(echoResult.echo).toBe('Hello World');
            expect(echoResult.service).toBe('TestService');
            
            const processResult = await service.callEndpoint('process', { test: 'data' });
            expect(processResult.processed).toBe(true);
            expect(processResult.data).toEqual({ test: 'data' });
        });

        test('should track service usage in health checks', async () => {
            const service = orchestrator.getComponent('testService');
            
            await service.callEndpoint('process', { test: 'data' });
            await service.callEndpoint('process', { test: 'data2' });
            
            const health = await orchestrator.getHealth();
            expect(health.component_health.testService.request_count).toBe(2);
        });
    });

    describe('Unified System Integration', () => {
        test('should create and start unified system', async () => {
            const unifiedSystem = new UnifiedSystem(config);
            
            const serviceComponent = new TestServiceComponent();
            unifiedSystem.registerComponent('testService', serviceComponent, {
                healthCheck: () => serviceComponent.getHealth()
            });
            
            const results = await unifiedSystem.start();
            
            expect(results.started).toBe(true);
            expect(results.startup_time_ms).toBeGreaterThan(0);
            expect(results.initialization_results.successful).toBeGreaterThan(0);
            expect(unifiedSystem.isStarted).toBe(true);
            
            await unifiedSystem.stop();
        });

        test('should process tasks through unified system', async () => {
            const unifiedSystem = new UnifiedSystem(config);
            await unifiedSystem.start();
            
            const task = {
                id: 'integration-test-task',
                title: 'Integration Test Task',
                description: 'A task for integration testing'
            };
            
            const result = await unifiedSystem.processTask(task);
            
            expect(result).toBeDefined();
            expect(result.system_metadata).toBeDefined();
            expect(result.system_metadata.request_id).toBeDefined();
            expect(result.system_metadata.processing_time_ms).toBeGreaterThan(0);
            
            await unifiedSystem.stop();
        });

        test('should handle batch processing', async () => {
            const unifiedSystem = new UnifiedSystem(config);
            await unifiedSystem.start();
            
            const tasks = [
                { id: 'task-1', title: 'Task 1' },
                { id: 'task-2', title: 'Task 2' },
                { id: 'task-3', title: 'Task 3' }
            ];
            
            const results = await unifiedSystem.processBatch(tasks, {
                parallel: true,
                continueOnError: true
            });
            
            expect(results.total).toBe(3);
            expect(results.successful).toBe(3);
            expect(results.failed).toBe(0);
            expect(results.results).toHaveLength(3);
            
            await unifiedSystem.stop();
        });

        test('should get system statistics and health', async () => {
            const unifiedSystem = new UnifiedSystem(config);
            await unifiedSystem.start();
            
            const stats = await unifiedSystem.getStatistics();
            expect(stats.is_started).toBe(true);
            expect(stats.uptime_ms).toBeGreaterThan(0);
            expect(stats.system_metrics).toBeDefined();
            
            const health = await unifiedSystem.getHealth();
            expect(health.status).toBe('healthy');
            expect(health.is_started).toBe(true);
            
            await unifiedSystem.stop();
        });
    });

    describe('Environment-specific Configuration', () => {
        test('should create system for different environments', async () => {
            const devSystem = UnifiedSystem.forDevelopment();
            const testSystem = UnifiedSystem.forTesting();
            const prodSystem = UnifiedSystem.forProduction();
            
            expect(devSystem.config.config.mode).toBe('development');
            expect(testSystem.config.config.mode).toBe('testing');
            expect(prodSystem.config.config.mode).toBe('production');
            
            // Test that mock mode is enabled for dev/test
            expect(devSystem.config.isMockMode).toBe(true);
            expect(testSystem.config.isMockMode).toBe(true);
        });

        test('should apply configuration overrides', async () => {
            const system = UnifiedSystem.forTesting({
                workflow: { max_concurrent_workflows: 15 }
            });
            
            expect(system.config.workflow.max_concurrent_workflows).toBe(15);
        });
    });

    describe('Error Recovery and Resilience', () => {
        test('should restart failed components', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const component = new TestServiceComponent();
            let initializeCallCount = 0;
            
            const originalInitialize = component.initialize.bind(component);
            component.initialize = jest.fn().mockImplementation(async () => {
                initializeCallCount++;
                if (initializeCallCount === 1) {
                    throw new Error('First initialization failed');
                }
                return originalInitialize();
            });
            
            orchestrator.registerComponent('testService', component);
            
            // First initialization should fail
            await expect(orchestrator.initialize()).rejects.toThrow('First initialization failed');
            
            // Restart should succeed
            await orchestrator.restartComponent('testService');
            
            expect(component.isInitialized).toBe(true);
            expect(initializeCallCount).toBe(2);
        });

        test('should handle partial system failures', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const goodComponent = new TestServiceComponent();
            const badComponent = {
                initialize: jest.fn().mockRejectedValue(new Error('Bad component')),
                getHealth: jest.fn().mockResolvedValue({ status: 'unhealthy' })
            };
            
            orchestrator.registerComponent('good', goodComponent);
            orchestrator.registerComponent('bad', badComponent);
            
            await expect(orchestrator.initialize()).rejects.toThrow('Bad component');
            
            // Good component should still be accessible if we had used continueOnError
            // This test demonstrates the importance of error handling strategies
        });
    });

    describe('Performance and Scalability', () => {
        test('should handle multiple components efficiently', async () => {
            orchestrator = new SystemOrchestrator(config);
            
            const componentCount = 10;
            const components = [];
            
            for (let i = 0; i < componentCount; i++) {
                const component = new TestServiceComponent();
                component.name = `Service${i}`;
                components.push(component);
                
                orchestrator.registerComponent(`service${i}`, component, {
                    healthCheck: () => component.getHealth()
                });
            }
            
            const startTime = Date.now();
            await orchestrator.initialize({ parallel: true });
            const duration = Date.now() - startTime;
            
            expect(orchestrator.isInitialized).toBe(true);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
            
            // Verify all components are initialized
            for (let i = 0; i < componentCount; i++) {
                expect(components[i].isInitialized).toBe(true);
            }
        });

        test('should maintain performance under load', async () => {
            const unifiedSystem = new UnifiedSystem(config);
            await unifiedSystem.start();
            
            const taskCount = 50;
            const tasks = Array.from({ length: taskCount }, (_, i) => ({
                id: `load-test-task-${i}`,
                title: `Load Test Task ${i}`
            }));
            
            const startTime = Date.now();
            const results = await unifiedSystem.processBatch(tasks, {
                parallel: true,
                maxConcurrency: 10
            });
            const duration = Date.now() - startTime;
            
            expect(results.successful).toBe(taskCount);
            expect(results.failed).toBe(0);
            expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
            
            await unifiedSystem.stop();
        });
    });
});

