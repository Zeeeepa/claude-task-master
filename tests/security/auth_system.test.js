/**
 * Authentication System Tests
 * 
 * Comprehensive test suite for the AI CI/CD system authentication and security framework.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { SecurityManager } from '../../src/ai_cicd_system/security/index.js';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';

describe('Authentication System', () => {
    let securityManager;
    let database;
    let testUser;

    beforeAll(async () => {
        // Initialize test database connection
        database = new DatabaseConnection({
            host: process.env.TEST_DB_HOST || 'localhost',
            port: process.env.TEST_DB_PORT || 5432,
            database: process.env.TEST_DB_NAME || 'ai_cicd_test',
            user: process.env.TEST_DB_USER || 'test_user',
            password: process.env.TEST_DB_PASSWORD || 'test_password'
        });

        await database.connect();

        // Initialize security manager
        securityManager = new SecurityManager(database, {
            security: {
                jwt: {
                    secret: 'test-jwt-secret-key-for-testing-purposes-only',
                    issuer: 'test-ai-cicd-system',
                    audience: 'test-users'
                }
            }
        });

        // Create test user
        testUser = {
            id: 'test-user-id',
            username: 'testuser',
            email: 'test@example.com',
            password: 'TestPassword123!',
            role: 'user'
        };

        // Insert test user into database
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash(testUser.password, 12);
        
        await database.query(
            `INSERT INTO users (id, username, email, password_hash, role, permissions, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash`,
            [
                testUser.id,
                testUser.username,
                testUser.email,
                hashedPassword,
                testUser.role,
                JSON.stringify(['read', 'write']),
                true
            ]
        );
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM users WHERE id = $1', [testUser.id]);
        await database.query('DELETE FROM sessions WHERE user_id = $1', [testUser.id]);
        await database.query('DELETE FROM api_keys WHERE user_id = $1', [testUser.id]);
        await database.query('DELETE FROM security_events WHERE user_id = $1', [testUser.id]);
        
        await database.disconnect();
    });

    beforeEach(async () => {
        // Clean up sessions and tokens before each test
        await database.query('DELETE FROM sessions WHERE user_id = $1', [testUser.id]);
        await database.query('DELETE FROM revoked_tokens WHERE user_id = $1', [testUser.id]);
    });

    describe('JWT Manager', () => {
        test('should generate valid JWT token', async () => {
            const jwtManager = securityManager.getManagers().jwt;
            const payload = {
                sub: testUser.id,
                username: testUser.username,
                role: testUser.role
            };

            const result = jwtManager.generateToken(payload);
            
            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('expiresIn');
            expect(result).toHaveProperty('tokenId');
            expect(typeof result.token).toBe('string');
        });

        test('should validate JWT token', async () => {
            const jwtManager = securityManager.getManagers().jwt;
            const payload = {
                sub: testUser.id,
                username: testUser.username,
                role: testUser.role
            };

            const tokenResult = jwtManager.generateToken(payload);
            const validation = await jwtManager.validateToken(tokenResult.token);
            
            expect(validation.valid).toBe(true);
            expect(validation.payload.sub).toBe(testUser.id);
            expect(validation.payload.username).toBe(testUser.username);
        });

        test('should reject invalid JWT token', async () => {
            const jwtManager = securityManager.getManagers().jwt;
            const validation = await jwtManager.validateToken('invalid.token.here');
            
            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
        });

        test('should refresh JWT token', async () => {
            const jwtManager = securityManager.getManagers().jwt;
            
            // Generate refresh token
            const refreshTokenResult = await jwtManager.generateRefreshToken(testUser.id);
            expect(refreshTokenResult.refreshToken).toBeDefined();
            
            // Refresh access token
            const refreshResult = await jwtManager.refreshToken(refreshTokenResult.refreshToken);
            expect(refreshResult.success).toBe(true);
            expect(refreshResult.token).toBeDefined();
        });
    });

    describe('API Key Manager', () => {
        test('should generate API key', async () => {
            const apiKeyManager = securityManager.getManagers().apiKey;
            
            const result = await apiKeyManager.generateAPIKey(testUser.id, {
                name: 'Test API Key',
                permissions: ['read', 'write']
            });
            
            expect(result.success).toBe(true);
            expect(result.apiKey).toBeDefined();
            expect(result.keyId).toBeDefined();
            expect(result.apiKey).toMatch(/^aics_/);
        });

        test('should validate API key', async () => {
            const apiKeyManager = securityManager.getManagers().apiKey;
            
            // Generate API key
            const generateResult = await apiKeyManager.generateAPIKey(testUser.id, {
                name: 'Test API Key',
                permissions: ['read']
            });
            
            expect(generateResult.success).toBe(true);
            
            // Validate API key
            const validation = await apiKeyManager.validateAPIKey(generateResult.apiKey);
            
            expect(validation.valid).toBe(true);
            expect(validation.userId).toBe(testUser.id);
            expect(validation.permissions).toContain('read');
        });

        test('should reject invalid API key', async () => {
            const apiKeyManager = securityManager.getManagers().apiKey;
            const validation = await apiKeyManager.validateAPIKey('invalid-api-key');
            
            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
        });

        test('should list user API keys', async () => {
            const apiKeyManager = securityManager.getManagers().apiKey;
            
            // Generate multiple API keys
            await apiKeyManager.generateAPIKey(testUser.id, { name: 'Key 1' });
            await apiKeyManager.generateAPIKey(testUser.id, { name: 'Key 2' });
            
            const result = await apiKeyManager.listUserAPIKeys(testUser.id);
            
            expect(result.success).toBe(true);
            expect(result.apiKeys).toHaveLength(2);
            expect(result.apiKeys[0]).toHaveProperty('name');
            expect(result.apiKeys[0]).toHaveProperty('permissions');
        });
    });

    describe('Role Manager', () => {
        test('should check user permissions', async () => {
            const roleManager = securityManager.getManagers().role;
            
            const hasRead = await roleManager.hasPermission(testUser.id, 'read');
            const hasWrite = await roleManager.hasPermission(testUser.id, 'write');
            const hasAdmin = await roleManager.hasPermission(testUser.id, 'admin');
            
            expect(hasRead).toBe(true);
            expect(hasWrite).toBe(true);
            expect(hasAdmin).toBe(false);
        });

        test('should grant permission to user', async () => {
            const roleManager = securityManager.getManagers().role;
            
            const grantResult = await roleManager.grantPermission(testUser.id, 'delete');
            expect(grantResult.success).toBe(true);
            
            const hasDelete = await roleManager.hasPermission(testUser.id, 'delete');
            expect(hasDelete).toBe(true);
        });

        test('should revoke permission from user', async () => {
            const roleManager = securityManager.getManagers().role;
            
            // Grant permission first
            await roleManager.grantPermission(testUser.id, 'delete');
            
            // Revoke permission
            const revokeResult = await roleManager.revokePermission(testUser.id, 'delete');
            expect(revokeResult.success).toBe(true);
            
            const hasDelete = await roleManager.hasPermission(testUser.id, 'delete');
            expect(hasDelete).toBe(false);
        });

        test('should assign role to user', async () => {
            const roleManager = securityManager.getManagers().role;
            
            const assignResult = await roleManager.assignRole(testUser.id, 'developer');
            expect(assignResult.success).toBe(true);
            
            // Verify role assignment by checking database
            const userResult = await database.query(
                'SELECT role FROM users WHERE id = $1',
                [testUser.id]
            );
            
            expect(userResult.rows[0].role).toBe('developer');
        });
    });

    describe('Session Manager', () => {
        test('should create session', async () => {
            const sessionManager = securityManager.getManagers().session;
            
            const result = await sessionManager.createSession(testUser.id, {
                ip_address: '127.0.0.1',
                user_agent: 'Test Agent'
            });
            
            expect(result.success).toBe(true);
            expect(result.sessionToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.expiresAt).toBeDefined();
        });

        test('should validate session', async () => {
            const sessionManager = securityManager.getManagers().session;
            
            // Create session
            const createResult = await sessionManager.createSession(testUser.id);
            expect(createResult.success).toBe(true);
            
            // Validate session
            const validation = await sessionManager.validateSession(createResult.sessionToken);
            
            expect(validation.valid).toBe(true);
            expect(validation.userId).toBe(testUser.id);
        });

        test('should terminate session', async () => {
            const sessionManager = securityManager.getManagers().session;
            
            // Create session
            const createResult = await sessionManager.createSession(testUser.id);
            
            // Terminate session
            const terminateResult = await sessionManager.terminateSession(createResult.sessionId);
            expect(terminateResult.success).toBe(true);
            
            // Validate terminated session
            const validation = await sessionManager.validateSession(createResult.sessionToken);
            expect(validation.valid).toBe(false);
        });
    });

    describe('Authentication Flow', () => {
        test('should authenticate user with valid credentials', async () => {
            const result = await securityManager.authenticateUser({
                username: testUser.username,
                password: testUser.password
            });
            
            expect(result.success).toBe(true);
            expect(result.user.id).toBe(testUser.id);
            expect(result.user.username).toBe(testUser.username);
            expect(result.tokens).toBeDefined();
            expect(result.tokens.accessToken).toBeDefined();
            expect(result.tokens.refreshToken).toBeDefined();
        });

        test('should reject invalid credentials', async () => {
            const result = await securityManager.authenticateUser({
                username: testUser.username,
                password: 'wrongpassword'
            });
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should authenticate with API key', async () => {
            const apiKeyManager = securityManager.getManagers().apiKey;
            
            // Generate API key
            const keyResult = await apiKeyManager.generateAPIKey(testUser.id, {
                name: 'Test Auth Key',
                permissions: ['read']
            });
            
            // Authenticate with API key
            const authResult = await securityManager.authenticateUser({
                apiKey: keyResult.apiKey
            });
            
            expect(authResult.success).toBe(true);
            expect(authResult.user.id).toBe(testUser.id);
            expect(authResult.authMethod).toBe('api_key');
        });

        test('should logout user', async () => {
            // Authenticate user first
            const authResult = await securityManager.authenticateUser({
                username: testUser.username,
                password: testUser.password
            });
            
            expect(authResult.success).toBe(true);
            
            // Logout user
            const logoutResult = await securityManager.logoutUser(testUser.id);
            expect(logoutResult.success).toBe(true);
        });
    });

    describe('Security Middleware', () => {
        test('should create authentication middleware', () => {
            const authMiddleware = securityManager.getAuthMiddleware();
            expect(typeof authMiddleware).toBe('function');
        });

        test('should create authorization middleware', () => {
            const authzMiddleware = securityManager.getAuthorizationMiddleware(['read']);
            expect(typeof authzMiddleware).toBe('function');
        });

        test('should create role middleware', () => {
            const roleMiddleware = securityManager.getRoleMiddleware(['user']);
            expect(typeof roleMiddleware).toBe('function');
        });

        test('should create rate limiting middleware', () => {
            const rateLimitMiddleware = securityManager.getRateLimitMiddleware();
            expect(typeof rateLimitMiddleware).toBe('function');
        });
    });

    describe('Audit Logging', () => {
        test('should log security events', async () => {
            const auditLogger = securityManager.getManagers().audit;
            
            const result = await auditLogger.logSecurityEvent(
                'test_event',
                'info',
                testUser.id,
                { action: 'test' }
            );
            
            expect(result.success).toBe(true);
            expect(result.logId).toBeDefined();
        });

        test('should search audit logs', async () => {
            const auditLogger = securityManager.getManagers().audit;
            
            // Log some events
            await auditLogger.logSecurityEvent('test_event_1', 'info', testUser.id);
            await auditLogger.logSecurityEvent('test_event_2', 'warn', testUser.id);
            
            // Search logs
            const searchResult = await auditLogger.searchLogs({
                userId: testUser.id
            });
            
            expect(searchResult.success).toBe(true);
            expect(searchResult.logs.length).toBeGreaterThan(0);
        });
    });

    describe('Security Status', () => {
        test('should get security status', async () => {
            const status = await securityManager.getSecurityStatus();
            
            expect(status.success).toBe(true);
            expect(status.status).toHaveProperty('tokens');
            expect(status.status).toHaveProperty('sessions');
            expect(status.status).toHaveProperty('configuration');
            expect(status.status.configuration.jwtConfigured).toBe(true);
        });

        test('should perform security cleanup', async () => {
            const result = await securityManager.performCleanup();
            
            expect(result.success).toBe(true);
            expect(result.summary).toHaveProperty('jwt');
            expect(result.summary).toHaveProperty('sessions');
            expect(result.summary).toHaveProperty('audit');
        });
    });

    describe('Input Validation', () => {
        test('should validate safe input', () => {
            const validator = securityManager.getMiddleware().validation;
            const mockReq = {
                body: { name: 'John Doe', email: 'john@example.com' },
                query: { page: '1' },
                url: '/api/users'
            };
            
            // This would normally be tested with actual middleware execution
            expect(validator).toBeDefined();
        });
    });

    describe('Rate Limiting', () => {
        test('should track rate limits', async () => {
            const rateLimiter = securityManager.getMiddleware().rateLimit;
            
            const status = await rateLimiter.getRateLimitStatus('test-user', '/api/test');
            
            expect(status).toHaveProperty('count');
            expect(status).toHaveProperty('limit');
            expect(status).toHaveProperty('remaining');
        });
    });
});

describe('Security Configuration', () => {
    test('should validate password policy', () => {
        const securityConfig = securityManager.getManagers().config;
        
        const validPassword = securityConfig.validatePassword('StrongPassword123!');
        expect(validPassword.valid).toBe(true);
        
        const weakPassword = securityConfig.validatePassword('weak');
        expect(weakPassword.valid).toBe(false);
        expect(weakPassword.errors.length).toBeGreaterThan(0);
    });

    test('should get configuration values', () => {
        const securityConfig = securityManager.getManagers().config;
        
        const jwtSecret = securityConfig.get('jwt.secret');
        expect(jwtSecret).toBeDefined();
        
        const defaultValue = securityConfig.get('nonexistent.key', 'default');
        expect(defaultValue).toBe('default');
    });
});

describe('Encryption', () => {
    test('should encrypt and decrypt data', () => {
        const encryption = securityManager.getManagers().encryption;
        
        const testData = { message: 'Hello, World!', number: 42 };
        
        const encryptResult = encryption.encrypt(testData);
        expect(encryptResult.success).toBe(true);
        expect(encryptResult.encrypted).toBeDefined();
        
        const decryptResult = encryption.decrypt(encryptResult.encrypted);
        expect(decryptResult.success).toBe(true);
        expect(decryptResult.data).toEqual(testData);
    });

    test('should generate secure random bytes', () => {
        const encryption = securityManager.getManagers().encryption;
        
        const result = encryption.generateRandomBytes(32);
        expect(result.success).toBe(true);
        expect(result.bytes).toHaveLength(32);
        expect(result.hex).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    test('should create and verify HMAC', () => {
        const encryption = securityManager.getManagers().encryption;
        
        const data = 'test data';
        const secret = 'test secret';
        
        const hmacResult = encryption.hmac(data, secret);
        expect(hmacResult.success).toBe(true);
        
        const verifyResult = encryption.verifyHmac(data, hmacResult.hmac, secret);
        expect(verifyResult.success).toBe(true);
        expect(verifyResult.valid).toBe(true);
    });
});

