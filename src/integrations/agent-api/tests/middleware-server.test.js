/**
 * MiddlewareServer Tests
 *
 * Comprehensive test suite for the AgentAPI MiddlewareServer.
 */

import {
	describe,
	test,
	expect,
	beforeEach,
	afterEach,
	beforeAll,
	afterAll
} from '@jest/globals';
import request from 'supertest';
import { MiddlewareServer } from '../middleware-server.js';
import { getEnvironmentConfig } from '../config.js';

describe('MiddlewareServer', () => {
	let server;
	let app;
	let config;

	beforeAll(() => {
		config = getEnvironmentConfig('test');
	});

	beforeEach(async () => {
		server = new MiddlewareServer(config);
		await server.start();
		app = server.app;
	});

	afterEach(async () => {
		if (server && server.isRunning) {
			await server.stop();
		}
	});

	describe('Server Initialization', () => {
		test('should start server successfully', () => {
			expect(server.isRunning).toBe(true);
			expect(server.getStatus().isRunning).toBe(true);
		});

		test('should have correct configuration', () => {
			const status = server.getStatus();
			expect(status.config).toBeDefined();
			expect(status.config.enableWebSocket).toBeDefined();
		});

		test('should throw error when starting already running server', async () => {
			await expect(server.start()).rejects.toThrow('Server is already running');
		});
	});

	describe('Health Endpoints', () => {
		test('GET /health should return server health', async () => {
			const response = await request(app).get('/health').expect(200);

			expect(response.body).toMatchObject({
				status: 'healthy',
				timestamp: expect.any(String),
				uptime: expect.any(Number),
				version: expect.any(String),
				environment: expect.any(String)
			});
		});

		test('GET / should return server info', async () => {
			const response = await request(app).get('/').expect(200);

			expect(response.body).toMatchObject({
				name: 'AgentAPI Middleware Server',
				version: expect.any(String),
				description: expect.any(String),
				endpoints: expect.any(Object)
			});
		});
	});

	describe('Authentication Endpoints', () => {
		test('POST /api/v1/auth/login should authenticate valid user', async () => {
			const response = await request(app)
				.post('/api/v1/auth/login')
				.send({
					username: 'admin',
					password: 'admin123'
				})
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				token: expect.any(String),
				refreshToken: expect.any(String),
				expiresIn: expect.any(String),
				user: expect.any(Object)
			});
		});

		test('POST /api/v1/auth/login should reject invalid credentials', async () => {
			const response = await request(app)
				.post('/api/v1/auth/login')
				.send({
					username: 'admin',
					password: 'wrongpassword'
				})
				.expect(401);

			expect(response.body).toMatchObject({
				success: false,
				message: expect.any(String)
			});
		});

		test('POST /api/v1/auth/login should require username and password', async () => {
			const response = await request(app)
				.post('/api/v1/auth/login')
				.send({
					username: 'admin'
				})
				.expect(400);

			expect(response.body).toMatchObject({
				error: 'Bad Request',
				message: expect.stringContaining('password')
			});
		});

		test('GET /api/v1/auth/validate should require authentication', async () => {
			await request(app).get('/api/v1/auth/validate').expect(401);
		});

		test('GET /api/v1/auth/validate should validate valid token', async () => {
			// First login to get token
			const loginResponse = await request(app).post('/api/v1/auth/login').send({
				username: 'admin',
				password: 'admin123'
			});

			const token = loginResponse.body.token;

			// Then validate token
			const response = await request(app)
				.get('/api/v1/auth/validate')
				.set('Authorization', `Bearer ${token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				valid: true,
				user: expect.any(Object),
				expiresAt: expect.any(String)
			});
		});
	});

	describe('Orchestrator Endpoints', () => {
		let authToken;

		beforeEach(async () => {
			const loginResponse = await request(app).post('/api/v1/auth/login').send({
				username: 'admin',
				password: 'admin123'
			});
			authToken = loginResponse.body.token;
		});

		test('POST /api/v1/orchestrator/workflow should accept workflow command', async () => {
			const response = await request(app)
				.post('/api/v1/orchestrator/workflow')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					workflowId: 'test-workflow-123',
					command: 'analyze',
					payload: {
						codebase: {
							repository: 'https://github.com/test/repo.git',
							branch: 'main'
						}
					}
				})
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				workflowId: 'test-workflow-123',
				command: 'analyze',
				result: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('POST /api/v1/orchestrator/workflow should require authentication', async () => {
			await request(app)
				.post('/api/v1/orchestrator/workflow')
				.send({
					workflowId: 'test-workflow-123',
					command: 'analyze'
				})
				.expect(401);
		});

		test('POST /api/v1/orchestrator/workflow should validate required fields', async () => {
			const response = await request(app)
				.post('/api/v1/orchestrator/workflow')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					workflowId: 'test-workflow-123'
					// Missing command
				})
				.expect(400);

			expect(response.body).toMatchObject({
				error: 'Bad Request',
				message: expect.stringContaining('command')
			});
		});

		test('GET /api/v1/orchestrator/workflow/:workflowId/status should return workflow status', async () => {
			const response = await request(app)
				.get('/api/v1/orchestrator/workflow/test-workflow-123/status')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toMatchObject({
				workflowId: 'test-workflow-123',
				status: expect.any(Object),
				timestamp: expect.any(String)
			});
		});
	});

	describe('Claude Code Endpoints', () => {
		let authToken;

		beforeEach(async () => {
			const loginResponse = await request(app).post('/api/v1/auth/login').send({
				username: 'admin',
				password: 'admin123'
			});
			authToken = loginResponse.body.token;
		});

		test('POST /api/v1/claude-code/analyze should accept analysis request', async () => {
			const response = await request(app)
				.post('/api/v1/claude-code/analyze')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					codebase: {
						repository: 'https://github.com/test/repo.git',
						branch: 'main'
					},
					analysisType: 'security',
					options: {
						depth: 'medium'
					}
				})
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				analysisType: 'security',
				result: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('GET /api/v1/claude-code/status should return Claude Code status', async () => {
			const response = await request(app)
				.get('/api/v1/claude-code/status')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toMatchObject({
				status: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('POST /api/v1/claude-code/execute should execute commands', async () => {
			const response = await request(app)
				.post('/api/v1/claude-code/execute')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					command: 'validate',
					parameters: {
						file: 'test.js'
					}
				})
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				command: 'validate',
				result: expect.any(Object),
				timestamp: expect.any(String)
			});
		});
	});

	describe('Data Transformation Endpoints', () => {
		let authToken;

		beforeEach(async () => {
			const loginResponse = await request(app).post('/api/v1/auth/login').send({
				username: 'admin',
				password: 'admin123'
			});
			authToken = loginResponse.body.token;
		});

		test('POST /api/v1/transform/to-claude-code should transform data', async () => {
			const response = await request(app)
				.post('/api/v1/transform/to-claude-code')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					data: {
						workflowId: 'test-123',
						command: 'analyze',
						payload: { test: 'data' }
					}
				})
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				original: expect.any(Object),
				transformed: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('POST /api/v1/transform/validate should validate data', async () => {
			const response = await request(app)
				.post('/api/v1/transform/validate')
				.set('Authorization', `Bearer ${authToken}`)
				.send({
					data: {
						workflowId: 'test-123',
						command: 'analyze'
					}
				})
				.expect(200);

			expect(response.body).toMatchObject({
				valid: expect.any(Boolean),
				errors: expect.any(Array),
				data: expect.any(Object),
				timestamp: expect.any(String)
			});
		});
	});

	describe('Monitoring Endpoints', () => {
		let authToken;

		beforeEach(async () => {
			const loginResponse = await request(app).post('/api/v1/auth/login').send({
				username: 'admin',
				password: 'admin123'
			});
			authToken = loginResponse.body.token;
		});

		test('GET /api/v1/monitoring/metrics should return metrics', async () => {
			const response = await request(app)
				.get('/api/v1/monitoring/metrics')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toMatchObject({
				metrics: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('GET /api/v1/monitoring/performance should return performance stats', async () => {
			const response = await request(app)
				.get('/api/v1/monitoring/performance')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toMatchObject({
				performance: expect.any(Object),
				timestamp: expect.any(String)
			});
		});

		test('GET /api/v1/monitoring/errors should return error logs', async () => {
			const response = await request(app)
				.get('/api/v1/monitoring/errors')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toMatchObject({
				errors: expect.any(Array),
				limit: expect.any(Number),
				offset: expect.any(Number),
				timestamp: expect.any(String)
			});
		});
	});

	describe('Error Handling', () => {
		test('should return 404 for unknown endpoints', async () => {
			const response = await request(app)
				.get('/api/v1/unknown-endpoint')
				.expect(404);

			expect(response.body).toMatchObject({
				error: 'Not Found',
				message: expect.stringContaining('not found'),
				timestamp: expect.any(String)
			});
		});

		test('should handle malformed JSON', async () => {
			const response = await request(app)
				.post('/api/v1/auth/login')
				.set('Content-Type', 'application/json')
				.send('{ invalid json }')
				.expect(400);
		});
	});

	describe('Rate Limiting', () => {
		test('should apply rate limiting', async () => {
			// Make multiple requests quickly to trigger rate limiting
			const requests = Array(config.rateLimit.maxRequests + 5)
				.fill()
				.map(() => request(app).get('/health'));

			const responses = await Promise.all(requests);

			// Some requests should be rate limited
			const rateLimitedResponses = responses.filter(
				(res) => res.status === 429
			);
			expect(rateLimitedResponses.length).toBeGreaterThan(0);
		});
	});

	describe('CORS', () => {
		test('should include CORS headers', async () => {
			const response = await request(app).get('/health').expect(200);

			expect(response.headers['access-control-allow-origin']).toBeDefined();
		});

		test('should handle OPTIONS requests', async () => {
			await request(app).options('/api/v1/auth/login').expect(204);
		});
	});
});
