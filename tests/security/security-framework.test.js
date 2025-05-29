/**
 * Security Framework Integration Tests
 * 
 * Tests the unified security framework consolidation from PRs #77 and #84
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SecurityFramework } from '../../src/security/index.js';

describe('Unified Security Framework', () => {
    let securityFramework;
    
    const testConfig = {
        framework: {
            environment: 'test',
            debug: false
        },
        authentication: {
            jwt: {
                secret: 'test-jwt-secret-for-testing-purposes-only',
                issuer: 'test-issuer',
                audience: 'test-audience',
                accessTokenExpiry: '1h'
            },
            apiKeys: {
                enabled: true,
                keyLength: 32
            },
            sessions: {
                enabled: true,
                maxAge: 24 * 60 * 60 * 1000
            }
        },
        authorization: {
            rbac: {
                enabled: true,
                cachePermissions: true
            }
        },
        encryption: {
            algorithm: 'aes-256-gcm',
            masterKey: 'test-master-key-for-testing-only'
        },
        auditLogging: {
            enabled: true,
            destinations: ['file'],
            logDirectory: './tests/logs'
        },
        inputValidation: {
            enabled: true,
            strictMode: true
        },
        securityMiddleware: {
            enabled: true,
            cors: {
                enabled: true,
                origin: 'http://localhost:3000'
            },
            rateLimiting: {
                enabled: true,
                windowMs: 60000,
                maxRequests: 100
            }
        },
        vulnerabilityScanning: {
            enabled: true,
            schedule: {
                enabled: false // Disable scheduling in tests
            }
        }
    };

    beforeAll(async () => {
        securityFramework = new SecurityFramework(testConfig);
        await securityFramework.initialize();
    });

    afterAll(async () => {
        if (securityFramework) {
            await securityFramework.shutdown();
        }
    });

    describe('Framework Initialization', () => {
        test('should initialize successfully', () => {
            expect(securityFramework.initialized).toBe(true);
        });

        test('should have all components initialized', () => {
            expect(securityFramework.getAuthenticationManager()).toBeDefined();
            expect(securityFramework.getAuthorizationManager()).toBeDefined();
            expect(securityFramework.getEncryptionService()).toBeDefined();
            expect(securityFramework.getAuditLogger()).toBeDefined();
            expect(securityFramework.getSecurityMiddleware()).toBeDefined();
            expect(securityFramework.getInputValidator()).toBeDefined();
            expect(securityFramework.getVulnerabilityScanner()).toBeDefined();
        });

        test('should pass health check', async () => {
            const health = await securityFramework.healthCheck();
            expect(health.framework.status).toBe('ok');
            expect(health.components).toBeDefined();
        });
    });

    describe('Authentication Manager', () => {
        let authManager;

        beforeAll(() => {
            authManager = securityFramework.getAuthenticationManager();
        });

        test('should generate JWT tokens', async () => {
            const tokens = await authManager._generateJWT({
                sub: 'test-user-123',
                email: 'test@example.com'
            });

            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
            expect(tokens.tokenType).toBe('Bearer');
            expect(tokens.expiresIn).toBeGreaterThan(0);
        });

        test('should authenticate JWT tokens', async () => {
            const tokens = await authManager._generateJWT({
                sub: 'test-user-123',
                email: 'test@example.com'
            });

            const result = await authManager.authenticate({
                token: tokens.accessToken
            });

            expect(result.success).toBe(true);
            expect(result.method).toBe('jwt');
            expect(result.user.sub).toBe('test-user-123');
        });

        test('should generate API keys', async () => {
            const apiKey = await authManager._generateAPIKey('test-user-123', {
                name: 'Test API Key',
                permissions: ['tasks:read', 'tasks:write']
            });

            expect(apiKey.keyId).toBeDefined();
            expect(apiKey.apiKey).toBeDefined();
            expect(apiKey.name).toBe('Test API Key');
            expect(apiKey.permissions).toEqual(['tasks:read', 'tasks:write']);
        });

        test('should create and authenticate sessions', async () => {
            const session = await authManager._createSession({
                id: 'test-user-123',
                email: 'test@example.com'
            });

            expect(session.sessionId).toBeDefined();
            expect(session.expiresAt).toBeDefined();

            const result = await authManager.authenticate({
                sessionId: session.sessionId
            });

            expect(result.success).toBe(true);
            expect(result.method).toBe('session');
            expect(result.user.id).toBe('test-user-123');
        });
    });

    describe('Authorization Manager', () => {
        let authzManager;

        beforeAll(async () => {
            authzManager = securityFramework.getAuthorizationManager();
            
            // Assign test user to user role
            await authzManager.assignRole('test-user-123', 'user');
        });

        test('should check user permissions', async () => {
            const hasReadPermission = await authzManager.hasPermission(
                'test-user-123',
                'tasks:read'
            );
            expect(hasReadPermission).toBe(true);

            const hasAdminPermission = await authzManager.hasPermission(
                'test-user-123',
                'system:admin'
            );
            expect(hasAdminPermission).toBe(false);
        });

        test('should get user roles', async () => {
            const roles = await authzManager.getUserRoles('test-user-123');
            expect(roles).toHaveLength(1);
            expect(roles[0].id).toBe('user');
        });

        test('should get user permissions', async () => {
            const permissions = await authzManager.getUserPermissions('test-user-123');
            expect(permissions).toContain('tasks:read');
            expect(permissions).toContain('api:read');
        });

        test('should create custom roles', async () => {
            const customRole = await authzManager.createRole({
                id: 'test-role',
                name: 'Test Role',
                description: 'Role for testing',
                level: 50,
                permissions: ['custom:permission']
            });

            expect(customRole.id).toBe('test-role');
            expect(customRole.name).toBe('Test Role');
        });
    });

    describe('Encryption Service', () => {
        let encryptionService;

        beforeAll(() => {
            encryptionService = securityFramework.getEncryptionService();
        });

        test('should encrypt and decrypt data', async () => {
            const originalData = {
                message: 'This is sensitive data',
                number: 12345,
                array: ['item1', 'item2']
            };

            const encrypted = await encryptionService.encrypt(originalData);
            expect(encrypted.algorithm).toBe('aes-256-gcm');
            expect(encrypted.data).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.authTag).toBeDefined();

            const decrypted = await encryptionService.decrypt(encrypted);
            expect(decrypted).toEqual(originalData);
        });

        test('should hash and verify passwords', async () => {
            const password = 'test-password-123';
            
            const hashResult = await encryptionService.hash(password);
            expect(hashResult.hash).toBeDefined();
            expect(hashResult.salt).toBeDefined();
            expect(hashResult.algorithm).toBeDefined();

            const isValid = await encryptionService.verifyHash(password, hashResult);
            expect(isValid).toBe(true);

            const isInvalid = await encryptionService.verifyHash('wrong-password', hashResult);
            expect(isInvalid).toBe(false);
        });

        test('should generate secure random data', async () => {
            const random1 = await encryptionService.generateRandom(32);
            const random2 = await encryptionService.generateRandom(32);
            
            expect(random1).toHaveLength(64); // 32 bytes = 64 hex chars
            expect(random2).toHaveLength(64);
            expect(random1).not.toBe(random2);
        });
    });

    describe('Input Validator', () => {
        let inputValidator;

        beforeAll(() => {
            inputValidator = securityFramework.getInputValidator();
        });

        test('should validate clean input', async () => {
            const cleanData = {
                name: 'John Doe',
                email: 'john@example.com',
                age: 30
            };

            const result = await inputValidator.validate(cleanData);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should detect SQL injection attempts', async () => {
            const maliciousData = {
                query: "SELECT * FROM users WHERE id = 1; DROP TABLE users; --"
            };

            const result = await inputValidator.validate(maliciousData);
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.code === 'SQL_INJECTION')).toBe(true);
        });

        test('should detect XSS attempts', async () => {
            const xssData = {
                comment: '<script>alert("XSS")</script>'
            };

            const result = await inputValidator.validate(xssData);
            expect(result.valid).toBe(false);
            expect(result.errors.some(error => error.code === 'XSS_ATTACK')).toBe(true);
        });

        test('should sanitize input data', async () => {
            const dirtyData = {
                message: '<p>Hello & welcome</p>'
            };

            const result = await inputValidator.validate(dirtyData);
            expect(result.sanitized.message).toBe('&lt;p&gt;Hello &amp; welcome&lt;&#x2F;p&gt;');
        });
    });

    describe('Vulnerability Scanner', () => {
        let vulnerabilityScanner;

        beforeAll(() => {
            vulnerabilityScanner = securityFramework.getVulnerabilityScanner();
        });

        test('should run vulnerability scan', async () => {
            const scanResults = await vulnerabilityScanner.runScan({
                sourceDir: './tests',
                packageJsonPath: './package.json'
            });

            expect(scanResults.scanId).toBeDefined();
            expect(scanResults.timestamp).toBeDefined();
            expect(scanResults.results).toBeDefined();
            expect(scanResults.summary).toBeDefined();
            expect(scanResults.duration).toBeGreaterThan(0);
        });

        test('should detect secrets in code', async () => {
            // This would be tested with actual files containing test secrets
            const scanResults = await vulnerabilityScanner.runScan({
                sourceDir: './tests'
            });

            expect(scanResults.results.secrets).toBeDefined();
            expect(scanResults.results.secrets.type).toBe('secrets');
        });
    });

    describe('Security Middleware', () => {
        let securityMiddleware;

        beforeAll(() => {
            securityMiddleware = securityFramework.getSecurityMiddleware();
        });

        test('should create middleware function', () => {
            const middleware = securityMiddleware.middleware();
            expect(typeof middleware).toBe('function');
        });

        test('should pass health check', async () => {
            const health = await securityMiddleware.healthCheck();
            expect(health.status).toBe('ok');
            expect(health.features).toBeDefined();
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete authentication flow', async () => {
            const authManager = securityFramework.getAuthenticationManager();
            const authzManager = securityFramework.getAuthorizationManager();

            // Generate JWT token
            const tokens = await authManager._generateJWT({
                sub: 'integration-test-user',
                email: 'integration@example.com'
            });

            // Authenticate with token
            const authResult = await authManager.authenticate({
                token: tokens.accessToken
            });

            expect(authResult.success).toBe(true);

            // Assign role
            await authzManager.assignRole('integration-test-user', 'user');

            // Check permissions
            const hasPermission = await authzManager.hasPermission(
                'integration-test-user',
                'tasks:read'
            );

            expect(hasPermission).toBe(true);
        });

        test('should handle encryption with audit logging', async () => {
            const encryptionService = securityFramework.getEncryptionService();
            const auditLogger = securityFramework.getAuditLogger();

            // Encrypt sensitive data
            const sensitiveData = { creditCard: '4111-1111-1111-1111' };
            const encrypted = await encryptionService.encrypt(sensitiveData);

            // Log the encryption event
            await auditLogger.logSecurityEvent('DATA_ENCRYPTED', {
                dataType: 'creditCard',
                algorithm: encrypted.algorithm
            });

            // Verify encryption worked
            expect(encrypted.data).toBeDefined();
            expect(encrypted.data).not.toContain('4111-1111-1111-1111');

            // Decrypt and verify
            const decrypted = await encryptionService.decrypt(encrypted);
            expect(decrypted.creditCard).toBe('4111-1111-1111-1111');
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid JWT tokens gracefully', async () => {
            const authManager = securityFramework.getAuthenticationManager();

            await expect(authManager.authenticate({
                token: 'invalid.jwt.token'
            })).rejects.toThrow();
        });

        test('should handle encryption with invalid data gracefully', async () => {
            const encryptionService = securityFramework.getEncryptionService();

            await expect(encryptionService.decrypt({
                algorithm: 'aes-256-gcm',
                keyId: 'nonexistent',
                iv: 'invalid',
                data: 'invalid',
                authTag: 'invalid'
            })).rejects.toThrow();
        });
    });
});

// Export for use in other test files
export { SecurityFramework };

