/**
 * @fileoverview Integration Framework Tests
 * @description Comprehensive tests for the component integration framework
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { IntegrationFramework } from '../../src/integrations/integration-framework.js';

describe('Integration Framework', () => {
	let framework;

	beforeEach(async () => {
		framework = new IntegrationFramework({
			serviceRegistry: { storage: 'memory' },
			healthMonitor: { checkInterval: 1000 },
			configManager: { watchFiles: false },
			eventBus: { enableWebSocket: false }
		});
	});

	afterEach(async () => {
		if (framework && framework.isInitialized) {
			await framework.shutdown();
		}
	});

	describe('Initialization', () => {
		test('should initialize successfully', async () => {
			await framework.initialize();
			expect(framework.isInitialized).toBe(true);
		});

		test('should throw error when initializing twice', async () => {
			await framework.initialize();
			await expect(framework.initialize()).rejects.toThrow(
				'already initialized'
			);
		});

		test('should emit initialized event', async () => {
			const initPromise = new Promise((resolve) => {
				framework.once('initialized', resolve);
			});

			await framework.initialize();
			await initPromise;
		});
	});

	describe('Component Registration', () => {
		beforeEach(async () => {
			await framework.initialize();
		});

		test('should register component successfully', async () => {
			const mockComponent = {
				request: jest.fn().mockResolvedValue({ success: true })
			};

			const componentConfig = {
				id: 'test-component',
				name: 'Test Component',
				type: 'service',
				version: '1.0.0',
				endpoints: { health: '/health' }
			};

			const result = await framework.registerComponent(
				componentConfig,
				mockComponent
			);
			expect(result).toHaveProperty('serviceId', 'test-component');
		});

		test('should throw error for duplicate component registration', async () => {
			const mockComponent = { request: jest.fn() };
			const componentConfig = {
				id: 'test-component',
				name: 'Test Component',
				type: 'service'
			};

			await framework.registerComponent(componentConfig, mockComponent);

			await expect(
				framework.registerComponent(componentConfig, mockComponent)
			).rejects.toThrow('already registered');
		});

		test('should require id, name, and type', async () => {
			const mockComponent = { request: jest.fn() };

			await expect(
				framework.registerComponent({ name: 'Test' }, mockComponent)
			).rejects.toThrow('must have id, name, and type');
		});
	});

	describe('Component Discovery', () => {
		beforeEach(async () => {
			await framework.initialize();

			const mockComponent = { request: jest.fn() };
			await framework.registerComponent(
				{
					id: 'test-service',
					name: 'Test Service',
					type: 'api',
					version: '1.0.0'
				},
				mockComponent
			);
		});

		test('should discover component by ID', async () => {
			const component = await framework.discoverComponent('test-service');
			expect(component).toHaveProperty('id', 'test-service');
			expect(component).toHaveProperty('name', 'Test Service');
		});

		test('should discover components by type', async () => {
			const components = await framework.discoverComponent('api');
			expect(
				Array.isArray(components) ? components : [components]
			).toHaveLength(1);
		});

		test('should return null for non-existent component', async () => {
			const component = await framework.discoverComponent('non-existent');
			expect(component).toBeNull();
		});
	});

	describe('Request Handling', () => {
		let mockComponent;

		beforeEach(async () => {
			await framework.initialize();

			mockComponent = {
				request: jest.fn().mockResolvedValue({ data: 'test response' }),
				get: jest.fn().mockResolvedValue({ data: 'get response' })
			};

			await framework.registerComponent(
				{
					id: 'test-service',
					name: 'Test Service',
					type: 'api'
				},
				mockComponent
			);
		});

		test('should send request to component', async () => {
			const result = await framework.sendRequest(
				'test-service',
				'request',
				'/test',
				{ test: 'data' }
			);

			expect(result).toEqual({ data: 'test response' });
			expect(mockComponent.request).toHaveBeenCalledWith(
				'/test',
				{ test: 'data' },
				{}
			);
		});

		test('should call specific method on component', async () => {
			const result = await framework.sendRequest(
				'test-service',
				'get',
				'/test'
			);

			expect(result).toEqual({ data: 'get response' });
			expect(mockComponent.get).toHaveBeenCalledWith('/test', null, {});
		});

		test('should handle component errors', async () => {
			mockComponent.request.mockRejectedValue(new Error('Component error'));

			await expect(
				framework.sendRequest('test-service', 'request', '/test')
			).rejects.toThrow('Component error');
		});

		test('should respect circuit breaker', async () => {
			// Simulate multiple failures to trigger circuit breaker
			mockComponent.request.mockRejectedValue(new Error('Service unavailable'));

			// Make enough requests to trigger circuit breaker
			for (let i = 0; i < 5; i++) {
				try {
					await framework.sendRequest('test-service', 'request', '/test');
				} catch (error) {
					// Expected to fail
				}
			}

			// Next request should be blocked by circuit breaker
			await expect(
				framework.sendRequest('test-service', 'request', '/test')
			).rejects.toThrow('Circuit breaker open');
		});
	});

	describe('Event System', () => {
		beforeEach(async () => {
			await framework.initialize();
		});

		test('should broadcast events', async () => {
			const eventPromise = new Promise((resolve) => {
				framework.subscribe('test.event', (data) => {
					resolve(data);
				});
			});

			await framework.broadcastEvent('test.event', { message: 'test' });
			const receivedData = await eventPromise;

			expect(receivedData).toEqual({ message: 'test' });
		});

		test('should handle event subscriptions', async () => {
			let eventReceived = false;

			framework.subscribe('test.subscription', () => {
				eventReceived = true;
			});

			await framework.broadcastEvent('test.subscription');

			// Give event time to process
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(eventReceived).toBe(true);
		});
	});

	describe('Health Monitoring', () => {
		beforeEach(async () => {
			await framework.initialize();
		});

		test('should get framework health', async () => {
			const health = await framework.getHealth();

			expect(health).toHaveProperty('status');
			expect(health).toHaveProperty('framework');
			expect(health).toHaveProperty('components');
			expect(health).toHaveProperty('timestamp');
		});

		test('should show healthy status when initialized', async () => {
			const health = await framework.getHealth();
			expect(health.status).toBe('healthy');
			expect(health.framework.initialized).toBe(true);
		});
	});

	describe('Metrics', () => {
		beforeEach(async () => {
			await framework.initialize();
		});

		test('should provide framework metrics', () => {
			const metrics = framework.getMetrics();

			expect(metrics).toHaveProperty('uptime');
			expect(metrics).toHaveProperty('componentCount');
			expect(metrics).toHaveProperty('requestCount');
			expect(metrics).toHaveProperty('errorCount');
			expect(metrics).toHaveProperty('errorRate');
		});

		test('should track request metrics', async () => {
			const mockComponent = {
				request: jest.fn().mockResolvedValue({ success: true })
			};

			await framework.registerComponent(
				{
					id: 'metrics-test',
					name: 'Metrics Test',
					type: 'service'
				},
				mockComponent
			);

			await framework.sendRequest('metrics-test', 'request', '/test');

			const metrics = framework.getMetrics();
			expect(metrics.requestCount).toBe(1);
			expect(metrics.errorCount).toBe(0);
		});
	});

	describe('Shutdown', () => {
		test('should shutdown gracefully', async () => {
			await framework.initialize();

			const shutdownPromise = new Promise((resolve) => {
				framework.once('shutdown', resolve);
			});

			await framework.shutdown();
			await shutdownPromise;

			expect(framework.isInitialized).toBe(false);
		});

		test('should handle shutdown when not initialized', async () => {
			// Should not throw error
			await expect(framework.shutdown()).resolves.toBeUndefined();
		});
	});
});

describe('Integration Framework - End-to-End', () => {
	let framework;
	let mockComponents;

	beforeEach(async () => {
		framework = new IntegrationFramework({
			serviceRegistry: { storage: 'memory' },
			healthMonitor: { checkInterval: 1000 },
			configManager: { watchFiles: false },
			eventBus: { enableWebSocket: false }
		});

		mockComponents = {
			database: {
				query: jest.fn().mockResolvedValue({ rows: [] }),
				healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
			},
			api: {
				request: jest.fn().mockResolvedValue({ data: 'api response' }),
				healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
			},
			processor: {
				process: jest.fn().mockResolvedValue({ result: 'processed' }),
				healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
			}
		};

		await framework.initialize();
	});

	afterEach(async () => {
		if (framework && framework.isInitialized) {
			await framework.shutdown();
		}
	});

	test('should handle complete workflow', async () => {
		// Register all components
		await framework.registerComponent(
			{
				id: 'database',
				name: 'Database Service',
				type: 'storage',
				dependencies: []
			},
			mockComponents.database
		);

		await framework.registerComponent(
			{
				id: 'api',
				name: 'API Service',
				type: 'api',
				dependencies: ['database']
			},
			mockComponents.api
		);

		await framework.registerComponent(
			{
				id: 'processor',
				name: 'Processing Service',
				type: 'processor',
				dependencies: ['database', 'api']
			},
			mockComponents.processor
		);

		// Verify all components are registered
		const allComponents = await framework.getAllComponents();
		expect(allComponents).toHaveLength(3);

		// Test component communication
		const dbResult = await framework.sendRequest(
			'database',
			'query',
			'SELECT * FROM test'
		);
		expect(dbResult).toEqual({ rows: [] });

		const apiResult = await framework.sendRequest('api', 'request', '/data');
		expect(apiResult).toEqual({ data: 'api response' });

		const processResult = await framework.sendRequest('processor', 'process', {
			input: 'test'
		});
		expect(processResult).toEqual({ result: 'processed' });

		// Check overall health
		const health = await framework.getHealth();
		expect(health.status).toBe('healthy');
		expect(Object.keys(health.components)).toHaveLength(3);
	});

	test('should handle component failures gracefully', async () => {
		// Register component that will fail
		const failingComponent = {
			request: jest.fn().mockRejectedValue(new Error('Service unavailable'))
		};

		await framework.registerComponent(
			{
				id: 'failing-service',
				name: 'Failing Service',
				type: 'api'
			},
			failingComponent
		);

		// Request should fail but framework should remain stable
		await expect(
			framework.sendRequest('failing-service', 'request', '/test')
		).rejects.toThrow('Service unavailable');

		// Framework should still be healthy
		const health = await framework.getHealth();
		expect(health.status).toBe('healthy'); // Framework itself is healthy
	});
});
