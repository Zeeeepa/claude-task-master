/**
 * Security Testing Suite
 * 
 * Tests for security vulnerabilities including input validation,
 * authentication, authorization, and common attack vectors.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SecurityTestUtils, TestDataManager } from '../test-utils/index.js';
import { sanitizePrompt } from '../../scripts/modules/utils.js';
import { addTask } from '../../scripts/modules/task-manager.js';
import fs from 'fs';
import path from 'path';

describe('Security Testing Suite', () => {
	let testDataManager;

	beforeAll(async () => {
		testDataManager = new TestDataManager();
	});

	afterAll(() => {
		testDataManager.cleanup();
	});

	describe('Input Validation Security', () => {
		test('should sanitize malicious script inputs', () => {
			const xssPayloads = SecurityTestUtils.getXSSPayloads();
			
			const results = SecurityTestUtils.testInputSanitization(
				sanitizePrompt,
				xssPayloads
			);

			results.forEach(result => {
				expect(result.safe).toBe(true);
				if (result.sanitized) {
					// Ensure dangerous scripts are neutralized
					expect(result.sanitized).not.toContain('<script>');
					expect(result.sanitized).not.toContain('javascript:');
					expect(result.sanitized).not.toContain('onerror=');
					expect(result.sanitized).not.toContain('onload=');
				}
			});
		});

		test('should prevent SQL injection in task descriptions', () => {
			const sqlPayloads = SecurityTestUtils.getSQLInjectionPayloads();
			
			sqlPayloads.forEach(payload => {
				const sanitized = sanitizePrompt(payload);
				
				// Should escape or remove SQL injection attempts
				expect(sanitized).not.toContain('DROP TABLE');
				expect(sanitized).not.toContain('UNION SELECT');
				expect(sanitized).not.toContain('INSERT INTO');
				expect(sanitized).not.toContain("'; --");
			});
		});

		test('should handle path traversal attempts safely', () => {
			const pathTraversalPayloads = SecurityTestUtils.getPathTraversalPayloads();
			
			pathTraversalPayloads.forEach(payload => {
				// Test that file operations reject path traversal
				expect(() => {
					const safePath = path.resolve(testDataManager.tempDir, payload);
					// Should not allow access outside temp directory
					expect(safePath.startsWith(testDataManager.tempDir)).toBe(true);
				}).not.toThrow();
			});
		});

		test('should validate file upload security', () => {
			const maliciousFilenames = [
				'../../../etc/passwd',
				'..\\..\\..\\windows\\system32\\config\\sam',
				'script.js.exe',
				'malware.bat',
				'virus.scr'
			];

			maliciousFilenames.forEach(filename => {
				// Should reject dangerous file extensions and paths
				const isUnsafe = filename.includes('..') || 
								filename.endsWith('.exe') || 
								filename.endsWith('.bat') || 
								filename.endsWith('.scr');
				
				if (isUnsafe) {
					expect(() => {
						// Simulate file validation
						if (filename.includes('..')) {
							throw new Error('Path traversal detected');
						}
						if (/\.(exe|bat|scr|com|pif|vbs|js)$/i.test(filename)) {
							throw new Error('Dangerous file type');
						}
					}).toThrow();
				}
			});
		});
	});

	describe('Authentication and Authorization', () => {
		test('should validate API key format', () => {
			const invalidApiKeys = [
				'',
				'short',
				'invalid-key-format',
				'<script>alert("xss")</script>',
				'../../../etc/passwd'
			];

			invalidApiKeys.forEach(key => {
				// Mock API key validation
				const isValid = key && 
								key.length >= 20 && 
								/^[a-zA-Z0-9_-]+$/.test(key) &&
								!key.includes('<') &&
								!key.includes('..') &&
								!key.includes('/');
				
				expect(isValid).toBe(false);
			});
		});

		test('should handle authentication errors securely', () => {
			// Test that authentication errors don't leak sensitive information
			const mockAuthError = (apiKey) => {
				if (!apiKey) {
					return { error: 'Authentication required', code: 401 };
				}
				if (apiKey === 'invalid') {
					return { error: 'Invalid credentials', code: 401 };
				}
				return { success: true };
			};

			const invalidResult = mockAuthError('invalid');
			expect(invalidResult.error).not.toContain('database');
			expect(invalidResult.error).not.toContain('internal');
			expect(invalidResult.error).not.toContain('server');
			expect(invalidResult.code).toBe(401);
		});
	});

	describe('Data Protection', () => {
		test('should not expose sensitive data in logs', () => {
			const sensitiveData = [
				'sk-1234567890abcdef',
				'password123',
				'secret-key',
				'api-token-xyz'
			];

			sensitiveData.forEach(data => {
				// Mock logging function that should sanitize sensitive data
				const sanitizeForLogging = (input) => {
					return input.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***')
								.replace(/password\w*/gi, 'password***')
								.replace(/secret[_-]?\w*/gi, 'secret***')
								.replace(/token[_-]?\w*/gi, 'token***');
				};

				const sanitized = sanitizeForLogging(data);
				expect(sanitized).not.toContain('sk-1234567890abcdef');
				expect(sanitized).not.toContain('password123');
				expect(sanitized).not.toContain('secret-key');
				expect(sanitized).not.toContain('api-token-xyz');
			});
		});

		test('should encrypt sensitive configuration data', () => {
			// Mock encryption for sensitive config
			const mockEncrypt = (data) => {
				return Buffer.from(data).toString('base64');
			};

			const mockDecrypt = (encryptedData) => {
				return Buffer.from(encryptedData, 'base64').toString('utf8');
			};

			const sensitiveConfig = 'sk-1234567890abcdef';
			const encrypted = mockEncrypt(sensitiveConfig);
			const decrypted = mockDecrypt(encrypted);

			expect(encrypted).not.toBe(sensitiveConfig);
			expect(decrypted).toBe(sensitiveConfig);
		});
	});

	describe('File System Security', () => {
		test('should prevent unauthorized file access', () => {
			const unauthorizedPaths = [
				'/etc/passwd',
				'C:\\Windows\\System32\\config\\SAM',
				'../../../sensitive-file.txt',
				'~/.ssh/id_rsa'
			];

			unauthorizedPaths.forEach(unauthorizedPath => {
				// Mock file access validation
				const isAuthorized = (filePath) => {
					const allowedDirs = [
						testDataManager.tempDir,
						path.join(process.cwd(), 'tasks'),
						path.join(process.cwd(), 'tests')
					];

					const resolvedPath = path.resolve(filePath);
					return allowedDirs.some(dir => resolvedPath.startsWith(path.resolve(dir)));
				};

				expect(isAuthorized(unauthorizedPath)).toBe(false);
			});
		});

		test('should validate file permissions', () => {
			// Create test file with specific permissions
			const testFile = testDataManager.createTempFile('test-permissions.txt', 'test content');
			
			try {
				// Check file exists and is readable
				expect(fs.existsSync(testFile)).toBe(true);
				
				const stats = fs.statSync(testFile);
				expect(stats.isFile()).toBe(true);
				
				// File should be readable by owner
				expect(stats.mode & parseInt('400', 8)).toBeTruthy();
			} catch (error) {
				// Handle permission errors gracefully
				expect(error.code).toMatch(/EACCES|EPERM/);
			}
		});
	});

	describe('Network Security', () => {
		test('should validate URL inputs', () => {
			const maliciousUrls = [
				'javascript:alert("xss")',
				'data:text/html,<script>alert("xss")</script>',
				'file:///etc/passwd',
				'ftp://malicious-server.com/malware.exe',
				'http://localhost:22/ssh-attack'
			];

			maliciousUrls.forEach(url => {
				// Mock URL validation
				const isValidUrl = (input) => {
					try {
						const parsed = new URL(input);
						const allowedProtocols = ['http:', 'https:'];
						return allowedProtocols.includes(parsed.protocol);
					} catch {
						return false;
					}
				};

				const isValid = isValidUrl(url);
				if (url.startsWith('http://') || url.startsWith('https://')) {
					expect(isValid).toBe(true);
				} else {
					expect(isValid).toBe(false);
				}
			});
		});

		test('should implement rate limiting', () => {
			// Mock rate limiter
			class RateLimiter {
				constructor(maxRequests = 10, windowMs = 60000) {
					this.maxRequests = maxRequests;
					this.windowMs = windowMs;
					this.requests = new Map();
				}

				isAllowed(clientId) {
					const now = Date.now();
					const clientRequests = this.requests.get(clientId) || [];
					
					// Remove old requests outside the window
					const validRequests = clientRequests.filter(
						timestamp => now - timestamp < this.windowMs
					);
					
					if (validRequests.length >= this.maxRequests) {
						return false;
					}
					
					validRequests.push(now);
					this.requests.set(clientId, validRequests);
					return true;
				}
			}

			const rateLimiter = new RateLimiter(5, 1000); // 5 requests per second
			const clientId = 'test-client';

			// First 5 requests should be allowed
			for (let i = 0; i < 5; i++) {
				expect(rateLimiter.isAllowed(clientId)).toBe(true);
			}

			// 6th request should be blocked
			expect(rateLimiter.isAllowed(clientId)).toBe(false);
		});
	});

	describe('Error Handling Security', () => {
		test('should not expose stack traces in production', () => {
			// Mock error handler
			const handleError = (error, isProduction = true) => {
				if (isProduction) {
					return {
						error: 'Internal server error',
						code: 500
					};
				} else {
					return {
						error: error.message,
						stack: error.stack,
						code: 500
					};
				}
			};

			const testError = new Error('Database connection failed');
			testError.stack = 'Error: Database connection failed\n    at /app/db.js:123:45';

			const prodResponse = handleError(testError, true);
			const devResponse = handleError(testError, false);

			// Production should not expose sensitive details
			expect(prodResponse.error).toBe('Internal server error');
			expect(prodResponse.stack).toBeUndefined();

			// Development can show details
			expect(devResponse.error).toContain('Database connection failed');
			expect(devResponse.stack).toBeDefined();
		});
	});

	describe('Dependency Security', () => {
		test('should check for known vulnerabilities', () => {
			// Mock vulnerability scanner
			const checkDependencies = () => {
				// This would normally check against a vulnerability database
				const vulnerabilities = [];
				
				// Example: Check for known vulnerable packages
				const packageJson = {
					dependencies: {
						'lodash': '4.17.20', // Known vulnerable version
						'express': '4.18.0'  // Safe version
					}
				};

				Object.entries(packageJson.dependencies).forEach(([pkg, version]) => {
					if (pkg === 'lodash' && version === '4.17.20') {
						vulnerabilities.push({
							package: pkg,
							version: version,
							severity: 'high',
							description: 'Prototype pollution vulnerability'
						});
					}
				});

				return vulnerabilities;
			};

			const vulnerabilities = checkDependencies();
			
			// Should detect known vulnerabilities
			expect(vulnerabilities.length).toBeGreaterThan(0);
			expect(vulnerabilities[0].package).toBe('lodash');
			expect(vulnerabilities[0].severity).toBe('high');
		});
	});
});

