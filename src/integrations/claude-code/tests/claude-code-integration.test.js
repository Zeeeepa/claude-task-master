/**
 * Claude Code Integration Tests
 *
 * Comprehensive test suite for Claude Code integration functionality
 * including unit tests, integration tests, and end-to-end scenarios.
 */

import { jest } from '@jest/globals';
import {
	ClaudeCodeIntegration,
	ClaudeCodeClient,
	PRValidator,
	CodeAnalyzer,
	FeedbackProcessor
} from '../index.js';

// Mock child_process for testing
jest.mock('child_process', () => ({
	spawn: jest.fn()
}));

// Mock fs operations
jest.mock('fs', () => ({
	readFileSync: jest.fn(),
	writeFileSync: jest.fn(),
	existsSync: jest.fn(),
	readdirSync: jest.fn(),
	statSync: jest.fn(),
	unlinkSync: jest.fn()
}));

describe('Claude Code Integration', () => {
	let integration;
	let mockSpawn;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Setup spawn mock
		const { spawn } = require('child_process');
		mockSpawn = spawn;

		// Create integration instance
		integration = new ClaudeCodeIntegration({
			config: {
				outputFormat: 'json',
				maxTurns: 3,
				verbose: false
			}
		});
	});

	describe('Initialization', () => {
		test('should initialize successfully with valid configuration', async () => {
			// Mock successful Claude Code installation check
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10); // Success exit code
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.initialize();
			expect(result).toBe(true);
			expect(integration.isInitialized).toBe(true);
		});

		test('should fail initialization when Claude Code is not installed', async () => {
			// Mock failed Claude Code installation check
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(1), 10); // Failure exit code
						} else if (event === 'error') {
							setTimeout(() => callback(new Error('Command not found')), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.initialize();
			expect(result).toBe(false);
			expect(integration.isInitialized).toBe(false);
		});
	});

	describe('PR Validation', () => {
		beforeEach(async () => {
			// Mock successful initialization
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			await integration.initialize();
		});

		test('should validate PR successfully', async () => {
			// Mock git commands and Claude Code responses
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'git') {
								callback('M\tsrc/test.js\nA\tsrc/new.js\n');
							} else if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Code quality analysis complete. Score: 8.5/10. No critical issues found.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const prInfo = {
				prNumber: 123,
				sourceBranch: 'feature/test',
				targetBranch: 'main',
				title: 'Add new feature',
				description: 'This PR adds a new feature',
				author: 'developer'
			};

			const result = await integration.validatePullRequest(prInfo);

			expect(result.success).toBe(true);
			expect(result.validation).toBeDefined();
			expect(result.feedback).toBeDefined();
			expect(result.metrics.validationTime).toBeGreaterThan(0);
		});

		test('should handle PR validation failure gracefully', async () => {
			// Mock failed git command
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: {
						on: jest.fn((event, callback) => {
							callback('fatal: not a git repository');
						})
					},
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(1), 10); // Failure
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const prInfo = {
				prNumber: 123,
				sourceBranch: 'feature/test',
				targetBranch: 'main',
				title: 'Add new feature'
			};

			const result = await integration.validatePullRequest(prInfo);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.validationTime).toBeGreaterThan(0);
		});
	});

	describe('Code Quality Analysis', () => {
		beforeEach(async () => {
			// Mock successful initialization
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			await integration.initialize();
		});

		test('should analyze code quality successfully', async () => {
			// Mock file system operations
			const fs = require('fs');
			fs.statSync.mockReturnValue({
				isFile: () => true,
				isDirectory: () => false,
				size: 1000
			});
			fs.readFileSync.mockReturnValue('console.log("Hello World");');

			// Mock Claude Code response
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Code quality score: 7.5/10. Issues: Missing error handling. Recommendations: Add try-catch blocks.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.analyzeCodeQuality('./src/test.js');

			expect(result.success).toBe(true);
			expect(result.analysis).toBeDefined();
			expect(result.feedback).toBeDefined();
			expect(result.metrics.analysisTime).toBeGreaterThan(0);
		});

		test('should handle directory analysis', async () => {
			// Mock directory structure
			const fs = require('fs');
			fs.statSync.mockImplementation((path) => {
				if (path === './src') {
					return { isFile: () => false, isDirectory: () => true };
				}
				return { isFile: () => true, isDirectory: () => false, size: 1000 };
			});

			fs.readdirSync.mockReturnValue(['test.js', 'utils.js']);
			fs.readFileSync.mockReturnValue('console.log("Hello World");');

			// Mock Claude Code response
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Project analysis complete. Overall score: 8.0/10.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.analyzeCodeQuality('./src');

			expect(result.success).toBe(true);
			expect(result.analysis.summary.filesAnalyzed).toBeGreaterThan(0);
		});
	});

	describe('Debug Assistance', () => {
		beforeEach(async () => {
			// Mock successful initialization
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			await integration.initialize();
		});

		test('should provide debug assistance for build failures', async () => {
			// Mock Claude Code debug response
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Root cause: Missing dependency. Solution: Run npm install missing-package.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const errorLog = `
                Error: Cannot find module 'missing-package'
                at Function.Module._resolveFilename (internal/modules/cjs/loader.js:636:15)
                at Function.Module._load (internal/modules/cjs/loader.js:562:25)
            `;

			const result = await integration.debugBuildFailure(errorLog);

			expect(result.success).toBe(true);
			expect(result.debug).toBeDefined();
			expect(result.feedback).toBeDefined();
		});
	});

	describe('Security Scanning', () => {
		beforeEach(async () => {
			// Mock successful initialization
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			await integration.initialize();
		});

		test('should perform security scan successfully', async () => {
			// Mock Claude Code security scan response
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Security scan complete. Found 2 medium severity issues: SQL injection risk, XSS vulnerability.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.performSecurityScan('./src');

			expect(result.success).toBe(true);
			expect(result.scan).toBeDefined();
			expect(result.feedback).toBeDefined();
		});
	});

	describe('Performance Analysis', () => {
		beforeEach(async () => {
			// Mock successful initialization
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			await integration.initialize();
		});

		test('should analyze performance successfully', async () => {
			// Mock Claude Code performance analysis response
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: {
						on: jest.fn((event, callback) => {
							if (command === 'claude') {
								callback(
									JSON.stringify({
										role: 'assistant',
										content:
											'Performance analysis complete. Bottleneck detected in database queries. Recommendation: Add indexing.',
										type: 'message'
									})
								);
							}
						})
					},
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn((event, callback) => {
						if (event === 'close') {
							setTimeout(() => callback(0), 10);
						}
					}),
					kill: jest.fn()
				};
				return mockProcess;
			});

			const result = await integration.analyzePerformance('./src');

			expect(result.success).toBe(true);
			expect(result.analysis).toBeDefined();
			expect(result.feedback).toBeDefined();
		});
	});

	describe('Metrics and Status', () => {
		test('should track metrics correctly', async () => {
			const initialStatus = integration.getStatus();
			expect(initialStatus.metrics.validationsPerformed).toBe(0);
			expect(initialStatus.metrics.analysesCompleted).toBe(0);

			// Simulate successful operations
			integration.updateMetrics('validation', 5000, true);
			integration.updateMetrics('analysis', 3000, true);

			const updatedStatus = integration.getStatus();
			expect(updatedStatus.metrics.validationsPerformed).toBe(1);
			expect(updatedStatus.metrics.analysesCompleted).toBe(1);
			expect(updatedStatus.metrics.successRate).toBe(1);
		});

		test('should calculate success rate correctly', () => {
			integration.updateMetrics('validation', 1000, true);
			integration.updateMetrics('validation', 1000, false);
			integration.updateMetrics('analysis', 1000, true);

			const status = integration.getStatus();
			expect(status.metrics.successRate).toBe(2 / 3); // 2 successful out of 3 total
		});
	});

	describe('Error Handling', () => {
		test('should throw error when not initialized', async () => {
			const uninitializedIntegration = new ClaudeCodeIntegration();

			await expect(
				uninitializedIntegration.validatePullRequest({})
			).rejects.toThrow('Claude Code integration not initialized');

			await expect(
				uninitializedIntegration.analyzeCodeQuality('./src')
			).rejects.toThrow('Claude Code integration not initialized');
		});

		test('should handle timeout errors gracefully', async () => {
			// Mock timeout scenario
			mockSpawn.mockImplementation((command, args, options) => {
				const mockProcess = {
					stdout: { on: jest.fn() },
					stderr: { on: jest.fn() },
					stdin: { write: jest.fn(), end: jest.fn() },
					on: jest.fn(),
					kill: jest.fn()
				};

				// Don't call the close callback to simulate timeout
				return mockProcess;
			});

			await integration.initialize();

			const prInfo = {
				prNumber: 123,
				sourceBranch: 'feature/test',
				targetBranch: 'main',
				title: 'Test PR'
			};

			// This should timeout and be handled gracefully
			const result = await integration.validatePullRequest(prInfo, {
				timeout: 100
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain('timeout');
		});
	});

	describe('Configuration', () => {
		test('should use custom configuration', () => {
			const customConfig = {
				outputFormat: 'text',
				maxTurns: 10,
				verbose: true
			};

			const customIntegration = new ClaudeCodeIntegration({
				config: customConfig
			});

			const status = customIntegration.getStatus();
			expect(status.config.outputFormat).toBe('text');
			expect(status.config.maxTurns).toBe(10);
			expect(status.config.verbose).toBe(true);
		});
	});

	describe('Session Management', () => {
		test('should reset session correctly', async () => {
			await integration.initialize();

			// Simulate setting a session ID
			integration.client.sessionId = 'test-session-123';

			integration.reset();

			expect(integration.client.sessionId).toBeNull();
		});

		test('should shutdown gracefully', async () => {
			await integration.initialize();
			expect(integration.isInitialized).toBe(true);

			await integration.shutdown();
			expect(integration.isInitialized).toBe(false);
		});
	});
});

describe('Individual Components', () => {
	describe('ClaudeCodeClient', () => {
		test('should create client with default configuration', () => {
			const client = new ClaudeCodeClient();
			expect(client.config).toBeDefined();
			expect(client.sessionId).toBeNull();
			expect(client.isAuthenticated).toBe(false);
		});

		test('should parse JSON output correctly', () => {
			const client = new ClaudeCodeClient();
			const jsonOutput = `
                {"role": "system", "content": {"sessionId": "abc123"}, "type": "system"}
                {"role": "assistant", "content": "Analysis complete", "type": "message"}
                {"role": "system", "content": {"stats": {"duration": 5000}}, "type": "system"}
            `;

			const parsed = client.parseJsonOutput(jsonOutput);
			expect(parsed.sessionId).toBe('abc123');
			expect(parsed.messages).toHaveLength(3);
			expect(parsed.lastResponse).toBe('Analysis complete');
			expect(parsed.stats.duration).toBe(5000);
		});
	});

	describe('FeedbackProcessor', () => {
		test('should generate GitHub feedback correctly', async () => {
			const processor = new FeedbackProcessor();
			const analysisResults = {
				type: 'code-analysis',
				summary: { filesAnalyzed: 5, overallScore: 0.8 },
				metrics: { overallScore: 0.8, issueCount: 3 },
				fileAnalyses: [
					{
						success: true,
						file: 'test.js',
						analysis: {
							score: 0.7,
							issues: ['Missing error handling'],
							recommendations: ['Add try-catch blocks']
						}
					}
				]
			};

			const result = await processor.processFeedback(analysisResults, {
				target: 'github'
			});

			expect(result.success).toBe(true);
			expect(result.feedback.formats.github).toBeDefined();
			expect(result.feedback.formats.github.content).toContain(
				'Code Quality Analysis Report'
			);
			expect(result.feedback.formats.github.content).toContain('80.0%');
		});

		test('should determine severity correctly', () => {
			const processor = new FeedbackProcessor();

			expect(
				processor.determineSeverity('security vulnerability detected', 0.5)
			).toBe('critical');
			expect(processor.determineSeverity('missing error handling', 0.4)).toBe(
				'high'
			);
			expect(processor.determineSeverity('code style issue', 0.8)).toBe('low');
		});
	});
});

// Integration test scenarios
describe('End-to-End Scenarios', () => {
	test('should handle complete PR validation workflow', async () => {
		// This would be a more comprehensive test that mocks the entire workflow
		// from PR creation to feedback delivery
		const integration = new ClaudeCodeIntegration();

		// Mock all external dependencies
		const { spawn } = require('child_process');
		spawn.mockImplementation(() => ({
			stdout: {
				on: jest.fn((event, cb) =>
					cb('{"role": "assistant", "content": "Analysis complete"}')
				)
			},
			stderr: { on: jest.fn() },
			stdin: { write: jest.fn(), end: jest.fn() },
			on: jest.fn(
				(event, cb) => event === 'close' && setTimeout(() => cb(0), 10)
			),
			kill: jest.fn()
		}));

		const fs = require('fs');
		fs.statSync.mockReturnValue({ isFile: () => true, size: 1000 });
		fs.readFileSync.mockReturnValue('console.log("test");');

		await integration.initialize();

		const prInfo = {
			prNumber: 123,
			sourceBranch: 'feature/test',
			targetBranch: 'main',
			title: 'Test feature',
			description: 'Adding test feature'
		};

		const result = await integration.validatePullRequest(prInfo, {
			feedbackTarget: 'all',
			includeFileBreakdown: true
		});

		expect(result.success).toBe(true);
		expect(result.feedback.formats.github).toBeDefined();
		expect(result.feedback.formats.linear).toBeDefined();
		expect(result.feedback.formats.slack).toBeDefined();
	});
});
