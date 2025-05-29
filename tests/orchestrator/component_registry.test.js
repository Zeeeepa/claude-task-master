/**
 * @fileoverview Component Registry Tests
 * @description Unit tests for the ComponentRegistry class
 */

import { jest } from '@jest/globals';
import { ComponentRegistry } from '../../src/ai_cicd_system/orchestrator/component_registry.js';

// Mock component for testing
class MockComponent {
    constructor(name = 'MockComponent') {
        this.name = name;
        this.isInitialized = false;
        this.initializeCallCount = 0;
        this.shutdownCallCount = 0;
    }

    async initialize() {
        this.initializeCallCount++;
        this.isInitialized = true;
    }

    async shutdown() {
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

// Mock component without required methods
class InvalidComponent {
    constructor() {
        this.name = 'InvalidComponent';
    }
}

describe('ComponentRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new ComponentRegistry();
    });

    afterEach(async () => {
        if (registry.isInitialized) {
            await registry.shutdown();
        }
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            expect(registry.isInitialized).toBe(false);
            
            await registry.initialize();
            
            expect(registry.isInitialized).toBe(true);
        });

        test('should start with empty registry', () => {
            expect(registry.getComponentNames()).toEqual([]);
            expect(registry.components.size).toBe(0);
        });
    });

    describe('Component Registration', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should register a valid component', () => {
            const component = new MockComponent('TestComponent');
            
            registry.register('test', component);
            
            expect(registry.has('test')).toBe(true);
            expect(registry.get('test')).toBe(component);
            expect(registry.getComponentNames()).toContain('test');
        });

        test('should register component with dependencies', () => {
            const component = new MockComponent('TestComponent');
            const config = {
                dependencies: ['dep1', 'dep2'],
                priority: 50
            };
            
            registry.register('test', component, config);
            
            const metadata = registry.getMetadata('test');
            expect(metadata.dependencies).toEqual(['dep1', 'dep2']);
            expect(metadata.priority).toBe(50);
        });

        test('should register component with health check', () => {
            const component = new MockComponent('TestComponent');
            const healthCheck = jest.fn().mockResolvedValue({ status: 'healthy' });
            
            registry.register('test', component, { healthCheck });
            
            expect(registry.healthChecks.has('test')).toBe(true);
        });

        test('should throw error for invalid component name', () => {
            const component = new MockComponent();
            
            expect(() => registry.register('', component)).toThrow('Component name must be a non-empty string');
            expect(() => registry.register(null, component)).toThrow('Component name must be a non-empty string');
        });

        test('should throw error for missing component', () => {
            expect(() => registry.register('test', null)).toThrow('Component instance is required');
        });

        test('should throw error for component without initialize method', () => {
            const component = new InvalidComponent();
            
            expect(() => registry.register('test', component)).toThrow('Component must implement initialize() method');
        });

        test('should set default values for missing config', () => {
            const component = new MockComponent();
            
            registry.register('test', component);
            
            const metadata = registry.getMetadata('test');
            expect(metadata.dependencies).toEqual([]);
            expect(metadata.priority).toBe(100);
            expect(metadata.status).toBe('registered');
        });
    });

    describe('Component Retrieval', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should retrieve registered component', () => {
            const component = new MockComponent();
            registry.register('test', component);
            
            expect(registry.get('test')).toBe(component);
        });

        test('should return null for non-existent component', () => {
            expect(registry.get('nonexistent')).toBeNull();
        });

        test('should get component metadata', () => {
            const component = new MockComponent();
            registry.register('test', component, { priority: 50 });
            
            const metadata = registry.getMetadata('test');
            expect(metadata).toMatchObject({
                instance: component,
                status: 'registered',
                priority: 50,
                dependencies: []
            });
            expect(metadata.registeredAt).toBeInstanceOf(Date);
        });

        test('should return null for non-existent component metadata', () => {
            expect(registry.getMetadata('nonexistent')).toBeNull();
        });
    });

    describe('Component Status Management', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should update component status', () => {
            const component = new MockComponent();
            registry.register('test', component);
            
            registry.updateStatus('test', 'initialized');
            
            const metadata = registry.getMetadata('test');
            expect(metadata.status).toBe('initialized');
            expect(metadata.initializedAt).toBeInstanceOf(Date);
        });

        test('should update component status with error', () => {
            const component = new MockComponent();
            registry.register('test', component);
            const error = new Error('Test error');
            
            registry.updateStatus('test', 'failed', error);
            
            const metadata = registry.getMetadata('test');
            expect(metadata.status).toBe('failed');
            expect(metadata.error).toBe(error);
        });

        test('should get components by status', () => {
            const component1 = new MockComponent('Component1');
            const component2 = new MockComponent('Component2');
            
            registry.register('test1', component1);
            registry.register('test2', component2);
            registry.updateStatus('test1', 'initialized');
            
            const initializedComponents = registry.getComponentsByStatus('initialized');
            const registeredComponents = registry.getComponentsByStatus('registered');
            
            expect(initializedComponents).toHaveLength(1);
            expect(initializedComponents[0].name).toBe('test1');
            expect(registeredComponents).toHaveLength(1);
            expect(registeredComponents[0].name).toBe('test2');
        });
    });

    describe('Dependency Resolution', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should resolve dependencies with topological sort', () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            const comp3 = new MockComponent('Component3');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2, { dependencies: ['comp3'] });
            registry.register('comp3', comp3, { dependencies: [] });
            
            const sorted = registry.topologicalSort();
            
            expect(sorted).toEqual(['comp3', 'comp2', 'comp1']);
        });

        test('should handle components with no dependencies', () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1);
            registry.register('comp2', comp2);
            
            const sorted = registry.topologicalSort();
            
            expect(sorted).toContain('comp1');
            expect(sorted).toContain('comp2');
            expect(sorted).toHaveLength(2);
        });

        test('should sort by priority when no dependencies', () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1, { priority: 200 });
            registry.register('comp2', comp2, { priority: 100 });
            
            const sorted = registry.topologicalSort();
            
            expect(sorted).toEqual(['comp2', 'comp1']);
        });

        test('should throw error for circular dependencies', () => {
            const comp1 = new MockComponent('Component1');
            const comp2 = new MockComponent('Component2');
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2, { dependencies: ['comp1'] });
            
            expect(() => registry.topologicalSort()).toThrow('Circular dependency detected');
        });

        test('should throw error for missing dependency', () => {
            const comp1 = new MockComponent('Component1');
            
            registry.register('comp1', comp1, { dependencies: ['nonexistent'] });
            
            expect(() => registry.topologicalSort()).toThrow('depends on unregistered component');
        });
    });

    describe('Health Checks', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should run health checks for initialized components', async () => {
            const component = new MockComponent();
            const healthCheck = jest.fn().mockResolvedValue({ status: 'healthy' });
            
            registry.register('test', component, { healthCheck });
            registry.updateStatus('test', 'initialized');
            
            const results = await registry.runHealthChecks();
            
            expect(healthCheck).toHaveBeenCalled();
            expect(results.test).toEqual({ status: 'healthy' });
        });

        test('should handle health check failures', async () => {
            const component = new MockComponent();
            const healthCheck = jest.fn().mockRejectedValue(new Error('Health check failed'));
            
            registry.register('test', component, { healthCheck });
            registry.updateStatus('test', 'initialized');
            
            const results = await registry.runHealthChecks();
            
            expect(results.test).toMatchObject({
                status: 'unhealthy',
                error: 'Health check failed'
            });
        });

        test('should handle health check timeout', async () => {
            const component = new MockComponent();
            const healthCheck = jest.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 10000))
            );
            
            registry.register('test', component, { healthCheck });
            registry.updateStatus('test', 'initialized');
            
            const results = await registry.runHealthChecks();
            
            expect(results.test).toMatchObject({
                status: 'unhealthy',
                error: 'Health check timeout'
            });
        });

        test('should skip health checks for non-initialized components', async () => {
            const component = new MockComponent();
            const healthCheck = jest.fn().mockResolvedValue({ status: 'healthy' });
            
            registry.register('test', component, { healthCheck });
            // Don't update status to initialized
            
            const results = await registry.runHealthChecks();
            
            expect(healthCheck).not.toHaveBeenCalled();
            expect(results.test).toEqual({ status: 'not_initialized' });
        });
    });

    describe('Component Unregistration', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should unregister component', () => {
            const component = new MockComponent();
            registry.register('test', component);
            
            expect(registry.has('test')).toBe(true);
            
            const removed = registry.unregister('test');
            
            expect(removed).toBe(true);
            expect(registry.has('test')).toBe(false);
            expect(registry.get('test')).toBeNull();
        });

        test('should return false for non-existent component', () => {
            const removed = registry.unregister('nonexistent');
            expect(removed).toBe(false);
        });

        test('should clean up dependencies and health checks', () => {
            const component = new MockComponent();
            const healthCheck = jest.fn();
            
            registry.register('test', component, {
                dependencies: ['dep1'],
                healthCheck
            });
            
            registry.unregister('test');
            
            expect(registry.dependencies.has('test')).toBe(false);
            expect(registry.healthChecks.has('test')).toBe(false);
        });
    });

    describe('Statistics and Information', () => {
        beforeEach(async () => {
            await registry.initialize();
        });

        test('should get registry statistics', () => {
            const comp1 = new MockComponent();
            const comp2 = new MockComponent();
            
            registry.register('comp1', comp1, { dependencies: ['comp2'] });
            registry.register('comp2', comp2);
            registry.updateStatus('comp1', 'initialized');
            
            const stats = registry.getStatistics();
            
            expect(stats).toMatchObject({
                total_components: 2,
                status_counts: {
                    initialized: 1,
                    registered: 1
                },
                total_dependencies: 1,
                health_checks_registered: 0,
                is_initialized: true
            });
        });

        test('should get detailed component information', () => {
            const comp1 = new MockComponent();
            const comp2 = new MockComponent();
            
            registry.register('comp1', comp1, { priority: 200 });
            registry.register('comp2', comp2, { priority: 100 });
            
            const details = registry.getDetailedInfo();
            
            expect(details).toHaveLength(2);
            expect(details[0].name).toBe('comp2'); // Lower priority first
            expect(details[1].name).toBe('comp1');
            expect(details[0].priority).toBe(100);
            expect(details[1].priority).toBe(200);
        });
    });

    describe('Cleanup', () => {
        test('should clear all components', async () => {
            await registry.initialize();
            
            const component = new MockComponent();
            registry.register('test', component);
            
            expect(registry.components.size).toBe(1);
            
            registry.clear();
            
            expect(registry.components.size).toBe(0);
            expect(registry.dependencies.size).toBe(0);
            expect(registry.healthChecks.size).toBe(0);
        });

        test('should shutdown properly', async () => {
            await registry.initialize();
            
            const component = new MockComponent();
            registry.register('test', component);
            
            await registry.shutdown();
            
            expect(registry.isInitialized).toBe(false);
            expect(registry.components.size).toBe(0);
        });
    });
});
