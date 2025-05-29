/**
 * @fileoverview Lifecycle Manager Tests
 * @description Unit tests for the LifecycleManager class
 */

import { jest } from '@jest/globals';
import { LifecycleManager } from '../../src/ai_cicd_system/orchestrator/lifecycle_manager.js';
import { ComponentRegistry } from '../../src/ai_cicd_system/orchestrator/component_registry.js';

// Mock component for testing
class MockComponent {
    constructor(name = 'MockComponent', options = {}) {
        this.name = name;
        this.isInitialized = false;
        this.initializeCallCount = 0;
        this.shutdownCallCount = 0;
        this.initializeDelay = options.initializeDelay || 0;
        this.shutdownDelay = options.shutdownDelay || 0;
        this.shouldFailInitialize = options.shouldFailInitialize || false;
        this.shouldFailShutdown = options.shouldFailShutdown || false;
    }

    async initialize() {
        if (this.initializeDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.initializeDelay));
        }
        
        if (this.shouldFailInitialize) {
            throw new Error(`${this.name} initialization failed`);
        }
        
        this.initializeCallCount++;
        this.isInitialized = true;
    }

    async shutdown() {
        if (this.shutdownDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.shutdownDelay));
        }
        
        if (this.shouldFailShutdown) {
            throw new Error(`${this.name} shutdown failed`);
        }
        
        this.shutdownCallCount++;
        this.isInitialized = false;
    }

    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            name: this.name
        };
    }
}

describe('LifecycleManager', () => {
    let registry;
    let lifecycleManager;

    beforeEach(async () => {
        registry = new ComponentRegistry();
        await registry.initialize();
        lifecycleManager = new LifecycleManager(registry);
    });

    afterEach(async () => {
        if (lifecycleManager.isInitialized) {
            await lifecycleManager.shutdown();
        }
        if (registry.isInitialized) {
            await registry.shutdown();
        }
    });

    describe('Initialization', () => {
        test('should require ComponentRegistry', () => {
            expect(() => new LifecycleManager()).toThrow('ComponentRegistry is required');
        });

        test('should initialize successfully', async () => {
            expect(lifecycleManager.isInitialized).toBe(false);
            
            await lifecycleManager.initialize();
            
            expect(lifecycleManager.isInitialized).toBe(true);
        });

        test('should start with empty initialization order', () => {
            expect(lifecycleManager.initializationOrder).toEqual([]);
            expect(lifecycleManager.shutdownOrder).toEqual([]);
        });
    });

    describe('Component Initialization', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should initialize single component', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            
            await lifecycleManager.initializeComponent('test');
            
            expect(component.initializeCallCount).toBe(1);
            expect(component.isInitialized).toBe(true);
            expect(registry.getMetadata('test').status).toBe('initialized');
        });

        test('should skip already initialized component', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            registry.updateStatus('test', 'initialized');
            
            await lifecycleManager.initializeComponent('test');
            
            expect(component.initializeCallCount).toBe(0);
        });

        test('should throw error for non-existent component', async () => {
            await expect(lifecycleManager.initializeComponent('nonexistent'))
                .rejects.toThrow('Component \'nonexistent\' not found in registry');
        });

        test('should handle component initialization failure', async () => {
            const component = new MockComponent('TestComponent', { shouldFailInitialize: true });
            registry.register('test', component);
            
            await expect(lifecycleManager.initializeComponent('test'))
                .rejects.toThrow('TestComponent initialization failed');
            
            expect(registry.getMetadata('test').status).toBe('failed');
        });

        test('should check dependencies before initialization', async () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2);
            
            await expect(lifecycleManager.initializeComponent('comp1'))
                .rejects.toThrow('Dependency \'comp2\' of component \'comp1\' is not initialized');
        });

        test('should initialize component with satisfied dependencies', async () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2);
            
            await lifecycleManager.initializeComponent('comp2');
            await lifecycleManager.initializeComponent('comp1');
            
            expect(comp1.isInitialized).toBe(true);
            expect(comp2.isInitialized).toBe(true);
        });
    });

    describe('Batch Initialization', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should initialize all components in dependency order', async () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            const comp3 = new MockComponent('Component3');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2, { dependencies: ['comp3'] });
            registry.register('comp3', comp3);
            
            const results = await lifecycleManager.initializeAll();
            
            expect(results.successful).toBe(3);
            expect(results.failed).toBe(0);
            expect(lifecycleManager.initializationOrder).toEqual(['comp3', 'comp2', 'comp1']);
            expect(lifecycleManager.shutdownOrder).toEqual(['comp1', 'comp2', 'comp3']);
        });

        test('should initialize components in parallel when possible', async () => {
            const comp1 = new MockComponent('Component1', { initializeDelay: 100 });
            const comp2 = new MockComponent('Component2', { initializeDelay: 100 });
            const comp3 = new MockComponent('Component3', { initializeDelay: 100 });
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            registry.register('comp3', comp3);
            
            const startTime = Date.now();
            const results = await lifecycleManager.initializeAll({ parallel: true });
            const duration = Date.now() - startTime;
            
            expect(results.successful).toBe(3);
            expect(duration).toBeLessThan(200); // Should be much less than 300ms (3 * 100ms)
        });

        test('should initialize components sequentially when requested', async () => {
            const comp1 = new MockComponent('Component1', { initializeDelay: 50 });
            const comp2 = new MockComponent('Component2', { initializeDelay: 50 });
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            const startTime = Date.now();
            const results = await lifecycleManager.initializeAll({ parallel: false });
            const duration = Date.now() - startTime;
            
            expect(results.successful).toBe(2);
            expect(duration).toBeGreaterThanOrEqual(100); // Should be at least 100ms (2 * 50ms)
        });

        test('should handle initialization timeout', async () => {
            const component = new MockComponent('TestComponent', { initializeDelay: 1000 });
            registry.register('test', component);
            
            await expect(lifecycleManager.initializeAll({ timeout: 100 }))
                .rejects.toThrow('Component initialization timeout: test');
        });

        test('should continue on error when requested', async () => {
            const comp1 = new MockComponent('Component1', { shouldFailInitialize: true });
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            const results = await lifecycleManager.initializeAll({ continueOnError: true });
            
            expect(results.successful).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors).toHaveLength(1);
            expect(comp2.isInitialized).toBe(true);
        });

        test('should stop on first error by default', async () => {
            const comp1 = new MockComponent('Component1', { shouldFailInitialize: true });
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1, { priority: 1 });
            registry.register('comp2', comp2, { priority: 2 });
            
            await expect(lifecycleManager.initializeAll({ continueOnError: false }))
                .rejects.toThrow('Component1 initialization failed');
        });
    });

    describe('Component Shutdown', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should shutdown single component', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            registry.updateStatus('test', 'initialized');
            
            await lifecycleManager.shutdownComponent('test');
            
            expect(component.shutdownCallCount).toBe(1);
            expect(component.isInitialized).toBe(false);
            expect(registry.getMetadata('test').status).toBe('shutdown');
        });

        test('should skip already shutdown component', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            registry.updateStatus('test', 'shutdown');
            
            await lifecycleManager.shutdownComponent('test');
            
            expect(component.shutdownCallCount).toBe(0);
        });

        test('should handle component without shutdown method', async () => {
            const component = { initialize: jest.fn() };
            registry.register('test', component);
            registry.updateStatus('test', 'initialized');
            
            await expect(lifecycleManager.shutdownComponent('test')).resolves.not.toThrow();
            expect(registry.getMetadata('test').status).toBe('shutdown');
        });

        test('should handle component shutdown failure', async () => {
            const component = new MockComponent('TestComponent', { shouldFailShutdown: true });
            registry.register('test', component);
            registry.updateStatus('test', 'initialized');
            
            await expect(lifecycleManager.shutdownComponent('test'))
                .rejects.toThrow('TestComponent shutdown failed');
            
            expect(registry.getMetadata('test').status).toBe('failed');
        });

        test('should handle non-existent component gracefully', async () => {
            await expect(lifecycleManager.shutdownComponent('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('Batch Shutdown', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should shutdown all components in reverse order', async () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            const comp3 = new MockComponent('Component3');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2, { dependencies: ['comp3'] });
            registry.register('comp3', comp3);
            
            await lifecycleManager.initializeAll();
            const results = await lifecycleManager.shutdownAll();
            
            expect(results.successful).toBe(3);
            expect(results.failed).toBe(0);
            expect(comp1.shutdownCallCount).toBe(1);
            expect(comp2.shutdownCallCount).toBe(1);
            expect(comp3.shutdownCallCount).toBe(1);
        });

        test('should handle shutdown timeout', async () => {
            const component = new MockComponent('TestComponent', { shutdownDelay: 1000 });
            registry.register('test', component);
            
            await lifecycleManager.initializeAll();
            
            await expect(lifecycleManager.shutdownAll({ timeout: 100 }))
                .rejects.toThrow('Component shutdown timeout: test');
        });

        test('should force shutdown on error when requested', async () => {
            const comp1 = new MockComponent('Component1', { shouldFailShutdown: true });
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            await lifecycleManager.initializeAll();
            const results = await lifecycleManager.shutdownAll({ force: true });
            
            expect(results.successful).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors).toHaveLength(1);
        });

        test('should stop on first error when force is false', async () => {
            const comp1 = new MockComponent('Component1', { shouldFailShutdown: true });
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            await lifecycleManager.initializeAll();
            
            await expect(lifecycleManager.shutdownAll({ force: false }))
                .rejects.toThrow('Component1 shutdown failed');
        });
    });

    describe('Component Restart', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should restart component successfully', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            
            await lifecycleManager.initializeComponent('test');
            await lifecycleManager.restartComponent('test');
            
            expect(component.shutdownCallCount).toBe(1);
            expect(component.initializeCallCount).toBe(2);
            expect(component.isInitialized).toBe(true);
        });

        test('should handle restart timeout', async () => {
            const component = new MockComponent('TestComponent', { initializeDelay: 1000 });
            registry.register('test', component);
            
            await lifecycleManager.initializeComponent('test');
            
            await expect(lifecycleManager.restartComponent('test', { timeout: 100 }))
                .rejects.toThrow('Component initialization timeout: test');
        });
    });

    describe('Health and Statistics', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should get lifecycle statistics', () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            const stats = lifecycleManager.getStatistics();
            
            expect(stats).toMatchObject({
                is_initialized: true,
                initialization_order: [],
                shutdown_order: [],
                active_initializations: 0,
                active_shutdowns: 0
            });
            expect(stats.registry_stats).toBeDefined();
        });

        test('should get health status', async () => {
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            
            await lifecycleManager.initializeComponent('test');
            
            const health = await lifecycleManager.getHealth();
            
            expect(health.status).toBe('healthy');
            expect(health.is_initialized).toBe(true);
            expect(health.total_components).toBe(1);
            expect(health.unhealthy_components).toEqual([]);
        });

        test('should report degraded health for unhealthy components', async () => {
            const component = new MockComponent('TestComponent');
            const healthCheck = jest.fn().mockResolvedValue({ status: 'unhealthy' });
            
            registry.register('test', component, { healthCheck });
            await lifecycleManager.initializeComponent('test');
            
            const health = await lifecycleManager.getHealth();
            
            expect(health.status).toBe('degraded');
            expect(health.unhealthy_components).toContain('test');
        });
    });

    describe('Concurrent Operations', () => {
        beforeEach(async () => {
            await lifecycleManager.initialize();
        });

        test('should handle concurrent initialization of same component', async () => {
            const component = new MockComponent('TestComponent', { initializeDelay: 100 });
            registry.register('test', component);
            
            const promise1 = lifecycleManager.initializeComponent('test');
            const promise2 = lifecycleManager.initializeComponent('test');
            
            await Promise.all([promise1, promise2]);
            
            expect(component.initializeCallCount).toBe(1);
            expect(component.isInitialized).toBe(true);
        });

        test('should handle concurrent shutdown of same component', async () => {
            const component = new MockComponent('TestComponent', { shutdownDelay: 100 });
            registry.register('test', component);
            
            await lifecycleManager.initializeComponent('test');
            
            const promise1 = lifecycleManager.shutdownComponent('test');
            const promise2 = lifecycleManager.shutdownComponent('test');
            
            await Promise.all([promise1, promise2]);
            
            expect(component.shutdownCallCount).toBe(1);
            expect(component.isInitialized).toBe(false);
        });
    });

    describe('Cleanup', () => {
        test('should shutdown properly', async () => {
            await lifecycleManager.initialize();
            
            const component = new MockComponent('TestComponent');
            registry.register('test', component);
            await lifecycleManager.initializeComponent('test');
            
            await lifecycleManager.shutdown();
            
            expect(lifecycleManager.isInitialized).toBe(false);
            expect(component.shutdownCallCount).toBe(1);
            expect(lifecycleManager.initializationOrder).toEqual([]);
            expect(lifecycleManager.shutdownOrder).toEqual([]);
        });
    });
});
