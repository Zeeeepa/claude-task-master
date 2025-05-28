/**
 * @fileoverview Integration Framework Usage Example
 * @description Demonstrates how to use the component integration framework
 */

import { createIntegrationFramework } from '../index.js';

/**
 * Example component implementations
 */

// Mock Database Component
class DatabaseComponent {
	constructor() {
		this.connected = false;
		this.data = new Map();
	}

	async connect() {
		this.connected = true;
		console.log('📊 Database connected');
	}

	async query(sql, params = []) {
		if (!this.connected) {
			throw new Error('Database not connected');
		}

		// Mock query execution
		console.log(`🔍 Executing query: ${sql}`);
		return { rows: [], rowCount: 0 };
	}

	async insert(table, data) {
		if (!this.connected) {
			throw new Error('Database not connected');
		}

		const id = Math.random().toString(36).substr(2, 9);
		this.data.set(id, { ...data, id, table });
		console.log(`➕ Inserted data into ${table}: ${id}`);
		return { id, ...data };
	}

	async healthCheck() {
		return {
			status: this.connected ? 'healthy' : 'unhealthy',
			details: {
				connected: this.connected,
				recordCount: this.data.size
			}
		};
	}

	async request(method, endpoint, data) {
		switch (method) {
			case 'GET':
				return this.query(endpoint);
			case 'POST':
				return this.insert(endpoint, data);
			default:
				throw new Error(`Unsupported method: ${method}`);
		}
	}
}

// Mock API Component
class APIComponent {
	constructor() {
		this.routes = new Map();
		this.middleware = [];
	}

	addRoute(path, handler) {
		this.routes.set(path, handler);
	}

	addMiddleware(middleware) {
		this.middleware.push(middleware);
	}

	async request(method, path, data, options = {}) {
		console.log(`🌐 API ${method} ${path}`);

		// Apply middleware
		for (const mw of this.middleware) {
			await mw(method, path, data, options);
		}

		// Find and execute route handler
		const handler = this.routes.get(path);
		if (handler) {
			return await handler(data, options);
		}

		return {
			status: 'success',
			method,
			path,
			data,
			timestamp: new Date().toISOString()
		};
	}

	async healthCheck() {
		return {
			status: 'healthy',
			details: {
				routes: this.routes.size,
				middleware: this.middleware.length
			}
		};
	}
}

// Mock Processing Component
class ProcessingComponent {
	constructor() {
		this.processors = new Map();
		this.queue = [];
		this.processing = false;
	}

	addProcessor(name, processor) {
		this.processors.set(name, processor);
	}

	async process(type, data, options = {}) {
		console.log(`⚙️ Processing ${type}`);

		const processor = this.processors.get(type);
		if (!processor) {
			throw new Error(`No processor found for type: ${type}`);
		}

		return await processor(data, options);
	}

	async request(method, endpoint, data) {
		if (method === 'POST' && endpoint.startsWith('/process/')) {
			const type = endpoint.replace('/process/', '');
			return this.process(type, data);
		}

		throw new Error(`Unsupported request: ${method} ${endpoint}`);
	}

	async healthCheck() {
		return {
			status: 'healthy',
			details: {
				processors: this.processors.size,
				queueSize: this.queue.length,
				processing: this.processing
			}
		};
	}
}

/**
 * Main example function
 */
async function runExample() {
	console.log('🚀 Starting Integration Framework Example...\n');

	try {
		// Create and initialize the integration framework
		const framework = await createIntegrationFramework({
			serviceRegistry: {
				storage: 'memory',
				heartbeatInterval: 10000
			},
			healthMonitor: {
				checkInterval: 5000,
				timeout: 3000
			},
			configManager: {
				watchFiles: false,
				hotReload: true
			},
			eventBus: {
				enableWebSocket: false,
				eventHistory: true
			}
		});

		console.log('✅ Integration Framework initialized\n');

		// Create component instances
		const database = new DatabaseComponent();
		const api = new APIComponent();
		const processor = new ProcessingComponent();

		// Connect database
		await database.connect();

		// Setup API routes
		api.addRoute('/users', async (data) => {
			return { users: [{ id: 1, name: 'John Doe' }] };
		});

		api.addRoute('/health', async () => {
			return { status: 'healthy', timestamp: new Date().toISOString() };
		});

		// Setup processors
		processor.addProcessor('nlp', async (text) => {
			return {
				processed: text.toUpperCase(),
				tokens: text.split(' ').length
			};
		});

		processor.addProcessor('validation', async (data) => {
			return {
				valid: typeof data === 'object' && data !== null,
				errors: []
			};
		});

		// Register components with the framework
		console.log('📝 Registering components...\n');

		await framework.registerComponent(
			{
				id: 'database',
				name: 'Database Service',
				type: 'storage',
				version: '1.0.0',
				endpoints: {
					health: '/health',
					query: '/query'
				},
				dependencies: [],
				healthCheck: () => database.healthCheck()
			},
			database
		);

		await framework.registerComponent(
			{
				id: 'api',
				name: 'API Gateway',
				type: 'gateway',
				version: '1.0.0',
				endpoints: {
					health: '/health',
					users: '/users'
				},
				dependencies: ['database'],
				healthCheck: () => api.healthCheck()
			},
			api
		);

		await framework.registerComponent(
			{
				id: 'processor',
				name: 'Processing Engine',
				type: 'processor',
				version: '1.0.0',
				endpoints: {
					health: '/health',
					process: '/process'
				},
				dependencies: ['database'],
				healthCheck: () => processor.healthCheck()
			},
			processor
		);

		console.log('✅ All components registered\n');

		// Demonstrate service discovery
		console.log('🔍 Testing service discovery...\n');

		const dbService = await framework.discoverComponent('database');
		console.log('Found database service:', dbService.name);

		const storageServices = await framework.discoverComponent('storage');
		console.log(
			'Found storage services:',
			Array.isArray(storageServices)
				? storageServices.map((s) => s.name)
				: [storageServices.name]
		);

		const allServices = await framework.getAllComponents();
		console.log(
			'All registered services:',
			allServices.map((s) => s.name)
		);
		console.log();

		// Demonstrate component communication
		console.log('💬 Testing component communication...\n');

		// Database operations
		const insertResult = await framework.sendRequest(
			'database',
			'request',
			'users',
			{ name: 'Alice', email: 'alice@example.com' }
		);
		console.log('Database insert result:', insertResult);

		const queryResult = await framework.sendRequest(
			'database',
			'request',
			'SELECT * FROM users'
		);
		console.log('Database query result:', queryResult);

		// API requests
		const usersResult = await framework.sendRequest(
			'api',
			'request',
			'GET',
			'/users'
		);
		console.log('API users result:', usersResult);

		// Processing requests
		const nlpResult = await framework.sendRequest(
			'processor',
			'request',
			'POST',
			'/process/nlp',
			'hello world this is a test'
		);
		console.log('NLP processing result:', nlpResult);

		const validationResult = await framework.sendRequest(
			'processor',
			'request',
			'POST',
			'/process/validation',
			{ name: 'test', value: 123 }
		);
		console.log('Validation result:', validationResult);
		console.log();

		// Demonstrate event system
		console.log('📡 Testing event system...\n');

		// Subscribe to events
		framework.subscribe('user.created', (data) => {
			console.log('🎉 User created event received:', data);
		});

		framework.subscribe('data.processed', (data) => {
			console.log('⚙️ Data processed event received:', data);
		});

		// Broadcast events
		await framework.broadcastEvent('user.created', {
			userId: insertResult.id,
			name: insertResult.name,
			timestamp: new Date().toISOString()
		});

		await framework.broadcastEvent('data.processed', {
			type: 'nlp',
			result: nlpResult,
			timestamp: new Date().toISOString()
		});

		// Wait for events to process
		await new Promise((resolve) => setTimeout(resolve, 100));
		console.log();

		// Demonstrate health monitoring
		console.log('🏥 Testing health monitoring...\n');

		const overallHealth = await framework.getHealth();
		console.log('Overall system health:', {
			status: overallHealth.status,
			componentCount: overallHealth.framework.componentCount,
			uptime: Math.round(overallHealth.framework.uptime / 1000) + 's'
		});

		for (const [componentId, health] of Object.entries(
			overallHealth.components
		)) {
			console.log(`Component ${componentId} health:`, health.status);
		}
		console.log();

		// Demonstrate metrics
		console.log('📊 Framework metrics...\n');

		const metrics = framework.getMetrics();
		console.log('Framework metrics:', {
			uptime: Math.round(metrics.uptime / 1000) + 's',
			componentCount: metrics.componentsRegistered,
			requestCount: metrics.requestCount,
			errorCount: metrics.errorCount,
			errorRate: Math.round(metrics.errorRate * 100) + '%'
		});
		console.log();

		// Demonstrate error handling and circuit breaker
		console.log('🔧 Testing error handling...\n');

		try {
			await framework.sendRequest('non-existent', 'request', '/test');
		} catch (error) {
			console.log('Expected error for non-existent component:', error.message);
		}

		// Simulate component failure
		const failingComponent = {
			request: async () => {
				throw new Error('Service temporarily unavailable');
			}
		};

		await framework.registerComponent(
			{
				id: 'failing-service',
				name: 'Failing Service',
				type: 'test'
			},
			failingComponent
		);

		// Try multiple requests to trigger circuit breaker
		for (let i = 0; i < 3; i++) {
			try {
				await framework.sendRequest('failing-service', 'request', '/test');
			} catch (error) {
				console.log(`Request ${i + 1} failed:`, error.message);
			}
		}
		console.log();

		// Final status
		console.log('📈 Final system status...\n');

		const finalHealth = await framework.getHealth();
		const finalMetrics = framework.getMetrics();

		console.log('System Status:', {
			health: finalHealth.status,
			components: Object.keys(finalHealth.components).length,
			requests: finalMetrics.requestCount,
			errors: finalMetrics.errorCount,
			uptime: Math.round(finalMetrics.uptime / 1000) + 's'
		});

		// Cleanup
		console.log('\n🛑 Shutting down framework...');
		await framework.shutdown();
		console.log('✅ Framework shutdown completed');
	} catch (error) {
		console.error('❌ Example failed:', error);
		process.exit(1);
	}
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runExample().catch(console.error);
}

export { runExample };
export default runExample;
