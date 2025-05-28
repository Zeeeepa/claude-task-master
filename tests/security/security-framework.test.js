/**
 * Security Framework Test Suite
 * Comprehensive tests for the security framework components
 */

import { jest } from '@jest/globals';
import { securityFramework } from '../../security/index.js';
import { taskMasterCredentialManager } from '../../utils/credential-manager.js';

describe('Security Framework', () => {
  beforeAll(async () => {
    // Initialize security framework for testing
    await securityFramework.initialize();
  });

  afterAll(async () => {
    // Cleanup after tests
    await securityFramework.shutdown();
  });

  describe('Credential Manager', () => {
    test('should store and retrieve API keys', async () => {
      const testApiKey = 'test-api-key-12345';
      
      await taskMasterCredentialManager.setApiKey('test-provider', testApiKey);
      const retrievedKey = await taskMasterCredentialManager.getApiKey('test-provider');
      
      expect(retrievedKey).toBe(testApiKey);
    });

    test('should validate API key formats', () => {
      const validOpenAIKey = 'sk-' + 'a'.repeat(48);
      const invalidKey = 'invalid-key';
      
      const validResult = taskMasterCredentialManager.validateApiKeyFormat('openai', validOpenAIKey);
      const invalidResult = taskMasterCredentialManager.validateApiKeyFormat('openai', invalidKey);
      
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
    });

    test('should rotate credentials', async () => {
      const originalKey = 'original-key-12345';
      const newKey = 'new-key-67890';
      
      await taskMasterCredentialManager.setApiKey('rotation-test', originalKey);
      const rotatedKey = await taskMasterCredentialManager.rotateApiKey('rotation-test', newKey);
      
      expect(rotatedKey).toBe(newKey);
      
      const retrievedKey = await taskMasterCredentialManager.getApiKey('rotation-test');
      expect(retrievedKey).toBe(newKey);
    });

    test('should handle database credentials', async () => {
      const dbCredentials = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        sslMode: 'require'
      };
      
      await taskMasterCredentialManager.setDatabaseCredentials(dbCredentials);
      const retrieved = await taskMasterCredentialManager.getDatabaseCredentials();
      
      expect(retrieved.host).toBe(dbCredentials.host);
      expect(retrieved.port).toBe(dbCredentials.port);
      expect(retrieved.database).toBe(dbCredentials.database);
      expect(retrieved.username).toBe(dbCredentials.username);
      expect(retrieved.password).toBe(dbCredentials.password);
    });
  });

  describe('Authentication Manager', () => {
    test('should hash passwords securely', async () => {
      const password = 'test-password-123';
      const hash = await securityFramework.authManager.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    test('should generate and verify JWT tokens', async () => {
      const user = {
        id: 'test-user-1',
        username: 'testuser',
        role: 'developer'
      };
      
      const { accessToken } = await securityFramework.authManager.generateTokens(user);
      const verification = await securityFramework.authManager.verifyToken(accessToken);
      
      expect(verification.valid).toBe(true);
      expect(verification.user.id).toBe(user.id);
      expect(verification.user.username).toBe(user.username);
      expect(verification.user.role).toBe(user.role);
    });

    test('should handle failed login attempts', () => {
      const username = 'test-user';
      const clientInfo = { ip: '192.168.1.100' };
      
      // Record multiple failed attempts
      for (let i = 0; i < 5; i++) {
        securityFramework.authManager.recordFailedAttempt(username, clientInfo);
      }
      
      const isLocked = securityFramework.authManager.isAccountLocked(username);
      expect(isLocked).toBe(true);
    });

    test('should generate MFA codes', () => {
      const userId = 'test-user-123';
      const mfaCode = securityFramework.authManager.generateMFACode(userId);
      
      expect(mfaCode).toBeDefined();
      expect(mfaCode.length).toBe(6);
      expect(/^[a-f0-9]{6}$/.test(mfaCode)).toBe(true);
    });
  });

  describe('Encryption Manager', () => {
    test('should encrypt and decrypt data', () => {
      const plaintext = 'sensitive data to encrypt';
      const key = securityFramework.encryptionManager.generateKey();
      
      const encrypted = securityFramework.encryptionManager.encrypt(plaintext, key);
      const decrypted = securityFramework.encryptionManager.decrypt(encrypted, key);
      
      expect(decrypted).toBe(plaintext);
      expect(encrypted.encrypted).not.toBe(plaintext);
    });

    test('should encrypt and decrypt objects', () => {
      const obj = { secret: 'value', number: 42, nested: { data: 'test' } };
      const key = securityFramework.encryptionManager.generateKey();
      
      const encrypted = securityFramework.encryptionManager.encryptObject(obj, key);
      const decrypted = securityFramework.encryptionManager.decryptObject(encrypted, key);
      
      expect(decrypted).toEqual(obj);
    });

    test('should generate secure random values', () => {
      const randomString = securityFramework.encryptionManager.generateRandomString(32);
      const randomNumber = securityFramework.encryptionManager.generateRandomNumber(1, 100);
      
      expect(randomString.length).toBe(64); // 32 bytes = 64 hex chars
      expect(randomNumber).toBeGreaterThanOrEqual(1);
      expect(randomNumber).toBeLessThanOrEqual(100);
    });

    test('should create and verify signatures', () => {
      const data = 'data to sign';
      const secret = 'signing-secret';
      
      const signature = securityFramework.encryptionManager.sign(data, secret);
      const isValid = securityFramework.encryptionManager.verify(data, signature, secret);
      const isInvalid = securityFramework.encryptionManager.verify(data + 'tampered', signature, secret);
      
      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    test('should generate key pairs', () => {
      const { publicKey, privateKey } = securityFramework.encryptionManager.generateKeyPair();
      
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    test('should encrypt with public key and decrypt with private key', () => {
      const data = 'secret message';
      const { publicKey, privateKey } = securityFramework.encryptionManager.generateKeyPair();
      
      const encrypted = securityFramework.encryptionManager.encryptWithPublicKey(data, publicKey);
      const decrypted = securityFramework.encryptionManager.decryptWithPrivateKey(encrypted, privateKey);
      
      expect(decrypted).toBe(data);
    });
  });

  describe('Audit Logger', () => {
    test('should log security events', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      
      securityFramework.auditLogger.log('authentication', 'test_event', {
        userId: 'test-user',
        action: 'test-action'
      });
      
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('should sanitize sensitive data', () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        token: 'bearer-token-12345',
        normalData: 'not-sensitive'
      };
      
      const sanitized = securityFramework.auditLogger.sanitizeData(sensitiveData);
      
      expect(sanitized.username).toBe('testuser');
      expect(sanitized.password).not.toBe('secret123');
      expect(sanitized.token).not.toBe('bearer-token-12345');
      expect(sanitized.normalData).toBe('not-sensitive');
    });

    test('should determine correct log levels', () => {
      const criticalLevel = securityFramework.auditLogger.getLogLevel('authentication', 'failed_login');
      const warningLevel = securityFramework.auditLogger.getLogLevel('authentication', 'invalid_mfa');
      const infoLevel = securityFramework.auditLogger.getLogLevel('data', 'read');
      
      expect(criticalLevel).toBe('critical');
      expect(warningLevel).toBe('warning');
      expect(infoLevel).toBe('info');
    });
  });

  describe('Security Validation', () => {
    test('should validate system security', async () => {
      const validation = await securityFramework.validateSecurity();
      
      expect(validation).toHaveProperty('timestamp');
      expect(validation).toHaveProperty('issuesFound');
      expect(validation).toHaveProperty('issues');
      expect(validation).toHaveProperty('status');
      expect(['ok', 'warning', 'critical']).toContain(validation.status);
    });

    test('should generate security status', async () => {
      const status = await securityFramework.getSecurityStatus();
      
      expect(status.initialized).toBe(true);
      expect(status).toHaveProperty('components');
      expect(status).toHaveProperty('config');
      expect(status.components).toHaveProperty('credentialManager');
      expect(status.components).toHaveProperty('authManager');
      expect(status.components).toHaveProperty('auditLogger');
    });

    test('should generate security reports', async () => {
      const report = await securityFramework.generateSecurityReport(1);
      
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('categories');
      expect(report).toHaveProperty('events');
      expect(report.period.days).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete authentication flow', async () => {
      // Set up test admin user
      const username = 'test-admin';
      const password = 'TestPassword123!';
      const email = 'test@example.com';
      
      const passwordHash = await securityFramework.authManager.hashPassword(password);
      await securityFramework.credentialManager.setSecret('ADMIN_USERNAME', username);
      await securityFramework.credentialManager.setSecret('ADMIN_PASSWORD_HASH', passwordHash);
      await securityFramework.credentialManager.setSecret('ADMIN_EMAIL', email);
      
      // Test authentication
      const clientInfo = { ip: '127.0.0.1', userAgent: 'test-agent' };
      const authResult = await securityFramework.authManager.authenticate(
        username, 
        password, 
        null, 
        clientInfo
      );
      
      expect(authResult.user.username).toBe(username);
      expect(authResult.accessToken).toBeDefined();
      expect(authResult.refreshToken).toBeDefined();
      
      // Test token verification
      const verification = await securityFramework.authManager.verifyToken(authResult.accessToken);
      expect(verification.valid).toBe(true);
      
      // Test logout
      const logoutResult = await securityFramework.authManager.logout(
        authResult.session.id, 
        authResult.user.id
      );
      expect(logoutResult).toBe(true);
    });

    test('should handle credential migration', async () => {
      // Set up environment variables
      process.env.TEST_API_KEY = 'test-key-value';
      
      const migration = await taskMasterCredentialManager.migrateEnvironmentVariables();
      
      expect(migration.migrated).toContain('TEST_API_KEY');
      
      // Verify migrated credential can be retrieved
      const retrievedKey = await taskMasterCredentialManager.getApiKey('test');
      expect(retrievedKey).toBe('test-key-value');
      
      // Cleanup
      delete process.env.TEST_API_KEY;
    });

    test('should handle webhook signature validation', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'webhook-secret';
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Create signature (this would normally be done by the webhook sender)
      const crypto = require('crypto');
      const data = `${timestamp}.${payload}`;
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(data).digest('hex');
      
      // Verify signature
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(expectedSignature)
      );
      
      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid credentials gracefully', async () => {
      await expect(
        securityFramework.authManager.authenticate('invalid', 'invalid', null, {})
      ).rejects.toThrow('Invalid credentials');
    });

    test('should handle missing secrets gracefully', async () => {
      const result = await taskMasterCredentialManager.getApiKey('nonexistent-provider');
      expect(result).toBeNull();
    });

    test('should handle encryption with wrong key', () => {
      const plaintext = 'test data';
      const key1 = securityFramework.encryptionManager.generateKey();
      const key2 = securityFramework.encryptionManager.generateKey();
      
      const encrypted = securityFramework.encryptionManager.encrypt(plaintext, key1);
      
      expect(() => {
        securityFramework.encryptionManager.decrypt(encrypted, key2);
      }).toThrow();
    });

    test('should handle invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';
      const verification = await securityFramework.authManager.verifyToken(invalidToken);
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should encrypt/decrypt data efficiently', () => {
      const data = 'x'.repeat(10000); // 10KB of data
      const key = securityFramework.encryptionManager.generateKey();
      
      const startTime = Date.now();
      const encrypted = securityFramework.encryptionManager.encrypt(data, key);
      const decrypted = securityFramework.encryptionManager.decrypt(encrypted, key);
      const endTime = Date.now();
      
      expect(decrypted).toBe(data);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    test('should handle multiple concurrent authentications', async () => {
      const username = 'perf-test-user';
      const password = 'PerfTestPassword123!';
      
      // Set up test user
      const passwordHash = await securityFramework.authManager.hashPassword(password);
      await securityFramework.credentialManager.setSecret('PERF_TEST_USERNAME', username);
      await securityFramework.credentialManager.setSecret('PERF_TEST_PASSWORD_HASH', passwordHash);
      
      // Run concurrent authentications
      const promises = Array(10).fill().map(async (_, i) => {
        const clientInfo = { ip: `192.168.1.${i}`, userAgent: 'test-agent' };
        return securityFramework.authManager.authenticate(username, password, null, clientInfo);
      });
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.user.username).toBe(username);
        expect(result.accessToken).toBeDefined();
      });
    });
  });
});

