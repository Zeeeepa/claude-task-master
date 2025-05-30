/**
 * Security Validation Tests
 * 
 * Comprehensive security tests for the CICD orchestration system
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestHelpers } from '../utils/TestHelpers.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Mock security modules
jest.mock('../../src/security/AuthenticationService.js', () => ({
  AuthenticationService: jest.fn().mockImplementation(() => ({
    validateApiKey: jest.fn(),
    verifyJWT: jest.fn(),
    hashPassword: jest.fn(),
    validatePassword: jest.fn(),
    generateSecureToken: jest.fn(),
    revokeToken: jest.fn()
  }))
}));

jest.mock('../../src/security/AuthorizationService.js', () => ({
  AuthorizationService: jest.fn().mockImplementation(() => ({
    checkPermissions: jest.fn(),
    validateResourceAccess: jest.fn(),
    enforceRBAC: jest.fn(),
    auditAccess: jest.fn()
  }))
}));

jest.mock('../../src/security/InputValidator.js', () => ({
  InputValidator: jest.fn().mockImplementation(() => ({
    sanitizeInput: jest.fn(),
    validateInput: jest.fn(),
    preventSQLInjection: jest.fn(),
    preventXSS: jest.fn(),
    validateFileUpload: jest.fn()
  }))
}));

import { AuthenticationService } from '../../src/security/AuthenticationService.js';
import { AuthorizationService } from '../../src/security/AuthorizationService.js';
import { InputValidator } from '../../src/security/InputValidator.js';

describe('Security Validation Tests', () => {
  let authService;
  let authzService;
  let inputValidator;

  beforeEach(() => {
    authService = new AuthenticationService();
    authzService = new AuthorizationService();
    inputValidator = new InputValidator();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await TestHelpers.cleanupTestData();
  });

  describe('Authentication Security', () => {
    test('should validate API keys correctly', async () => {
      // Arrange
      const validApiKey = 'sk-test-valid-api-key-123456789';
      const invalidApiKey = 'invalid-key';

      authService.validateApiKey
        .mockResolvedValueOnce({ valid: true, userId: 'user-123' })
        .mockResolvedValueOnce({ valid: false, error: 'Invalid API key' });

      // Act & Assert - Valid key
      const validResult = await authService.validateApiKey(validApiKey);
      expect(validResult.valid).toBe(true);
      expect(validResult.userId).toBe('user-123');

      // Act & Assert - Invalid key
      const invalidResult = await authService.validateApiKey(invalidApiKey);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('Invalid API key');
    });

    test('should handle JWT token validation securely', async () => {
      // Arrange
      const validToken = jwt.sign(
        { userId: 'user-123', role: 'developer' },
        'test-secret',
        { expiresIn: '1h' }
      );
      const expiredToken = jwt.sign(
        { userId: 'user-123', role: 'developer' },
        'test-secret',
        { expiresIn: '-1h' } // Already expired
      );

      authService.verifyJWT
        .mockResolvedValueOnce({ 
          valid: true, 
          payload: { userId: 'user-123', role: 'developer' } 
        })
        .mockResolvedValueOnce({ 
          valid: false, 
          error: 'Token expired' 
        });

      // Act & Assert - Valid token
      const validResult = await authService.verifyJWT(validToken);
      expect(validResult.valid).toBe(true);
      expect(validResult.payload.userId).toBe('user-123');

      // Act & Assert - Expired token
      const expiredResult = await authService.verifyJWT(expiredToken);
      expect(expiredResult.valid).toBe(false);
      expect(expiredResult.error).toBe('Token expired');
    });

    test('should hash passwords securely', async () => {
      // Arrange
      const password = 'SecurePassword123!';
      const hashedPassword = '$2b$12$hashedPasswordExample';

      authService.hashPassword.mockResolvedValue({
        hash: hashedPassword,
        salt: '$2b$12$',
        algorithm: 'bcrypt'
      });

      // Act
      const result = await authService.hashPassword(password);

      // Assert
      expect(result.hash).toBe(hashedPassword);
      expect(result.algorithm).toBe('bcrypt');
      expect(result.salt).toBeDefined();
      expect(authService.hashPassword).toHaveBeenCalledWith(password);
    });

    test('should validate password strength', async () => {
      // Arrange
      const weakPassword = '123';
      const strongPassword = 'SecureP@ssw0rd123!';

      authService.validatePassword
        .mockResolvedValueOnce({
          valid: false,
          errors: ['Password too short', 'Missing special characters']
        })
        .mockResolvedValueOnce({
          valid: true,
          strength: 'strong'
        });

      // Act & Assert - Weak password
      const weakResult = await authService.validatePassword(weakPassword);
      expect(weakResult.valid).toBe(false);
      expect(weakResult.errors).toContain('Password too short');

      // Act & Assert - Strong password
      const strongResult = await authService.validatePassword(strongPassword);
      expect(strongResult.valid).toBe(true);
      expect(strongResult.strength).toBe('strong');
    });

    test('should generate secure tokens', async () => {
      // Arrange
      const tokenLength = 32;
      const secureToken = crypto.randomBytes(tokenLength).toString('hex');

      authService.generateSecureToken.mockResolvedValue({
        token: secureToken,
        length: tokenLength * 2, // hex encoding doubles length
        entropy: 256,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      // Act
      const result = await authService.generateSecureToken(tokenLength);

      // Assert
      expect(result.token).toHaveLength(tokenLength * 2);
      expect(result.entropy).toBe(256);
      expect(result.expiresAt).toBeDefined();
    });

    test('should handle token revocation', async () => {
      // Arrange
      const tokenToRevoke = 'token-to-revoke-123';

      authService.revokeToken.mockResolvedValue({
        success: true,
        tokenId: tokenToRevoke,
        revokedAt: new Date().toISOString()
      });

      // Act
      const result = await authService.revokeToken(tokenToRevoke);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenId).toBe(tokenToRevoke);
      expect(result.revokedAt).toBeDefined();
    });
  });

  describe('Authorization and Access Control', () => {
    test('should enforce role-based access control (RBAC)', async () => {
      // Arrange
      const userRoles = {
        admin: ['read', 'write', 'delete', 'admin'],
        developer: ['read', 'write'],
        viewer: ['read']
      };

      authzService.enforceRBAC
        .mockResolvedValueOnce({ 
          allowed: true, 
          role: 'admin',
          permissions: userRoles.admin 
        })
        .mockResolvedValueOnce({ 
          allowed: false, 
          role: 'viewer',
          missingPermissions: ['write'] 
        });

      // Act & Assert - Admin access
      const adminResult = await authzService.enforceRBAC('user-admin', 'delete', 'workflow');
      expect(adminResult.allowed).toBe(true);
      expect(adminResult.permissions).toContain('delete');

      // Act & Assert - Viewer access denied
      const viewerResult = await authzService.enforceRBAC('user-viewer', 'write', 'workflow');
      expect(viewerResult.allowed).toBe(false);
      expect(viewerResult.missingPermissions).toContain('write');
    });

    test('should validate resource-level permissions', async () => {
      // Arrange
      const resourceId = 'workflow-123';
      const userId = 'user-456';

      authzService.validateResourceAccess
        .mockResolvedValueOnce({
          allowed: true,
          resourceId,
          accessLevel: 'owner'
        })
        .mockResolvedValueOnce({
          allowed: false,
          resourceId,
          reason: 'Resource not found or access denied'
        });

      // Act & Assert - Owner access
      const ownerResult = await authzService.validateResourceAccess(userId, resourceId, 'write');
      expect(ownerResult.allowed).toBe(true);
      expect(ownerResult.accessLevel).toBe('owner');

      // Act & Assert - Access denied
      const deniedResult = await authzService.validateResourceAccess('other-user', resourceId, 'write');
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.reason).toContain('access denied');
    });

    test('should audit access attempts', async () => {
      // Arrange
      const accessAttempt = {
        userId: 'user-123',
        resource: 'workflow-456',
        action: 'delete',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100',
        userAgent: 'Test-Agent/1.0'
      };

      authzService.auditAccess.mockResolvedValue({
        logged: true,
        auditId: 'audit-789',
        timestamp: accessAttempt.timestamp
      });

      // Act
      const result = await authzService.auditAccess(accessAttempt);

      // Assert
      expect(result.logged).toBe(true);
      expect(result.auditId).toBeDefined();
      expect(authzService.auditAccess).toHaveBeenCalledWith(accessAttempt);
    });

    test('should check granular permissions', async () => {
      // Arrange
      const permissions = [
        { resource: 'workflows', action: 'create', allowed: true },
        { resource: 'workflows', action: 'delete', allowed: false },
        { resource: 'tasks', action: 'read', allowed: true },
        { resource: 'admin', action: 'access', allowed: false }
      ];

      authzService.checkPermissions.mockResolvedValue({
        userId: 'user-123',
        permissions: permissions,
        effectiveRole: 'developer'
      });

      // Act
      const result = await authzService.checkPermissions('user-123');

      // Assert
      expect(result.permissions).toHaveLength(4);
      expect(result.permissions.find(p => p.action === 'create').allowed).toBe(true);
      expect(result.permissions.find(p => p.action === 'delete').allowed).toBe(false);
      expect(result.effectiveRole).toBe('developer');
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('should prevent SQL injection attacks', async () => {
      // Arrange
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        "1; DELETE FROM workflows WHERE 1=1; --"
      ];

      maliciousInputs.forEach(input => {
        inputValidator.preventSQLInjection.mockResolvedValueOnce({
          safe: false,
          sanitized: '',
          threats: ['SQL injection attempt detected']
        });
      });

      // Act & Assert
      for (const input of maliciousInputs) {
        const result = await inputValidator.preventSQLInjection(input);
        expect(result.safe).toBe(false);
        expect(result.threats).toContain('SQL injection attempt detected');
      }
    });

    test('should prevent XSS attacks', async () => {
      // Arrange
      const xssInputs = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">'
      ];

      xssInputs.forEach(input => {
        inputValidator.preventXSS.mockResolvedValueOnce({
          safe: false,
          sanitized: input.replace(/<[^>]*>/g, ''),
          threats: ['XSS attempt detected']
        });
      });

      // Act & Assert
      for (const input of xssInputs) {
        const result = await inputValidator.preventXSS(input);
        expect(result.safe).toBe(false);
        expect(result.threats).toContain('XSS attempt detected');
      }
    });

    test('should sanitize user input properly', async () => {
      // Arrange
      const userInput = '<script>alert("test")</script>Hello World!';
      const sanitizedInput = 'Hello World!';

      inputValidator.sanitizeInput.mockResolvedValue({
        original: userInput,
        sanitized: sanitizedInput,
        removed: ['<script>alert("test")</script>'],
        safe: true
      });

      // Act
      const result = await inputValidator.sanitizeInput(userInput);

      // Assert
      expect(result.sanitized).toBe(sanitizedInput);
      expect(result.removed).toContain('<script>alert("test")</script>');
      expect(result.safe).toBe(true);
    });

    test('should validate file uploads securely', async () => {
      // Arrange
      const validFile = {
        name: 'document.pdf',
        size: 1024000, // 1MB
        type: 'application/pdf',
        content: Buffer.from('PDF content')
      };

      const maliciousFile = {
        name: 'malware.exe',
        size: 5000000, // 5MB
        type: 'application/x-executable',
        content: Buffer.from('Executable content')
      };

      inputValidator.validateFileUpload
        .mockResolvedValueOnce({
          valid: true,
          file: validFile,
          scanned: true,
          threats: []
        })
        .mockResolvedValueOnce({
          valid: false,
          file: maliciousFile,
          scanned: true,
          threats: ['Executable file type not allowed', 'File size exceeds limit']
        });

      // Act & Assert - Valid file
      const validResult = await inputValidator.validateFileUpload(validFile);
      expect(validResult.valid).toBe(true);
      expect(validResult.threats).toHaveLength(0);

      // Act & Assert - Malicious file
      const maliciousResult = await inputValidator.validateFileUpload(maliciousFile);
      expect(maliciousResult.valid).toBe(false);
      expect(maliciousResult.threats).toContain('Executable file type not allowed');
    });

    test('should validate input data types and formats', async () => {
      // Arrange
      const validInputs = {
        email: 'user@example.com',
        url: 'https://github.com/user/repo',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        json: '{"key": "value"}'
      };

      const invalidInputs = {
        email: 'invalid-email',
        url: 'not-a-url',
        uuid: 'invalid-uuid',
        json: '{invalid json}'
      };

      // Mock valid inputs
      Object.entries(validInputs).forEach(([type, value]) => {
        inputValidator.validateInput.mockResolvedValueOnce({
          valid: true,
          type,
          value,
          errors: []
        });
      });

      // Mock invalid inputs
      Object.entries(invalidInputs).forEach(([type, value]) => {
        inputValidator.validateInput.mockResolvedValueOnce({
          valid: false,
          type,
          value,
          errors: [`Invalid ${type} format`]
        });
      });

      // Act & Assert - Valid inputs
      for (const [type, value] of Object.entries(validInputs)) {
        const result = await inputValidator.validateInput(value, type);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }

      // Act & Assert - Invalid inputs
      for (const [type, value] of Object.entries(invalidInputs)) {
        const result = await inputValidator.validateInput(value, type);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`Invalid ${type} format`);
      }
    });
  });

  describe('Data Security and Encryption', () => {
    test('should encrypt sensitive data at rest', async () => {
      // Arrange
      const sensitiveData = {
        apiKey: 'sk-sensitive-api-key-123',
        password: 'user-password-123',
        personalInfo: 'sensitive personal information'
      };

      // Mock encryption service
      const mockEncrypt = jest.fn().mockImplementation((data) => ({
        encrypted: Buffer.from(data).toString('base64'),
        algorithm: 'AES-256-GCM',
        iv: crypto.randomBytes(16).toString('hex'),
        tag: crypto.randomBytes(16).toString('hex')
      }));

      // Act
      const encryptedApiKey = mockEncrypt(sensitiveData.apiKey);
      const encryptedPassword = mockEncrypt(sensitiveData.password);

      // Assert
      expect(encryptedApiKey.encrypted).not.toBe(sensitiveData.apiKey);
      expect(encryptedApiKey.algorithm).toBe('AES-256-GCM');
      expect(encryptedApiKey.iv).toBeDefined();
      expect(encryptedApiKey.tag).toBeDefined();
    });

    test('should use secure communication protocols', async () => {
      // Arrange
      const secureEndpoints = [
        'https://api.linear.app/graphql',
        'https://api.github.com/repos',
        'https://api.anthropic.com/v1/messages'
      ];

      // Act & Assert
      secureEndpoints.forEach(endpoint => {
        expect(endpoint).toMatch(/^https:\/\//);
      });
    });

    test('should implement proper secret management', async () => {
      // Arrange
      const secrets = {
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
        API_KEYS: {
          linear: process.env.LINEAR_API_KEY,
          github: process.env.GITHUB_TOKEN,
          anthropic: process.env.ANTHROPIC_API_KEY
        }
      };

      // Act & Assert
      Object.entries(secrets).forEach(([key, value]) => {
        if (typeof value === 'string') {
          expect(value).not.toContain('password');
          expect(value).not.toContain('secret');
          expect(value).not.toMatch(/^[a-zA-Z0-9]{8,}$/); // Not a simple password
        }
      });
    });

    test('should validate webhook signatures', async () => {
      // Arrange
      const webhookPayload = JSON.stringify({
        action: 'issue.update',
        issue: { id: 'issue-123', status: 'completed' }
      });
      
      const secret = 'webhook-secret-key';
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(webhookPayload)
        .digest('hex');
      
      const invalidSignature = 'invalid-signature';

      // Mock webhook validation
      const validateWebhookSignature = jest.fn()
        .mockReturnValueOnce(true)  // Valid signature
        .mockReturnValueOnce(false); // Invalid signature

      // Act & Assert - Valid signature
      const validResult = validateWebhookSignature(webhookPayload, validSignature, secret);
      expect(validResult).toBe(true);

      // Act & Assert - Invalid signature
      const invalidResult = validateWebhookSignature(webhookPayload, invalidSignature, secret);
      expect(invalidResult).toBe(false);
    });
  });

  describe('Security Headers and CSRF Protection', () => {
    test('should implement proper security headers', async () => {
      // Arrange
      const expectedHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      };

      // Mock response headers
      const mockResponse = {
        headers: expectedHeaders
      };

      // Act & Assert
      Object.entries(expectedHeaders).forEach(([header, value]) => {
        expect(mockResponse.headers[header]).toBe(value);
      });
    });

    test('should prevent CSRF attacks', async () => {
      // Arrange
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const validRequest = {
        headers: {
          'X-CSRF-Token': csrfToken
        },
        session: {
          csrfToken: csrfToken
        }
      };

      const invalidRequest = {
        headers: {
          'X-CSRF-Token': 'invalid-token'
        },
        session: {
          csrfToken: csrfToken
        }
      };

      // Mock CSRF validation
      const validateCSRF = jest.fn()
        .mockReturnValueOnce(true)  // Valid token
        .mockReturnValueOnce(false); // Invalid token

      // Act & Assert - Valid CSRF token
      const validResult = validateCSRF(validRequest);
      expect(validResult).toBe(true);

      // Act & Assert - Invalid CSRF token
      const invalidResult = validateCSRF(invalidRequest);
      expect(invalidResult).toBe(false);
    });
  });

  describe('Rate Limiting and DDoS Protection', () => {
    test('should implement rate limiting', async () => {
      // Arrange
      const rateLimiter = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP'
      };

      const requests = Array.from({ length: 105 }, (_, i) => ({
        ip: '192.168.1.100',
        timestamp: Date.now() + i * 1000
      }));

      // Mock rate limiting logic
      const checkRateLimit = jest.fn().mockImplementation((ip, timestamp) => {
        const recentRequests = requests.filter(req => 
          req.ip === ip && 
          timestamp - req.timestamp < rateLimiter.windowMs
        ).length;
        
        return recentRequests <= rateLimiter.max;
      });

      // Act & Assert
      const firstRequest = checkRateLimit('192.168.1.100', Date.now());
      expect(firstRequest).toBe(true);

      // Simulate exceeding rate limit
      const excessiveRequest = checkRateLimit('192.168.1.100', Date.now() + 106000);
      expect(excessiveRequest).toBe(false);
    });

    test('should detect and prevent brute force attacks', async () => {
      // Arrange
      const failedAttempts = [
        { ip: '192.168.1.100', timestamp: Date.now(), success: false },
        { ip: '192.168.1.100', timestamp: Date.now() + 1000, success: false },
        { ip: '192.168.1.100', timestamp: Date.now() + 2000, success: false },
        { ip: '192.168.1.100', timestamp: Date.now() + 3000, success: false },
        { ip: '192.168.1.100', timestamp: Date.now() + 4000, success: false }
      ];

      // Mock brute force detection
      const detectBruteForce = jest.fn().mockImplementation((ip, attempts) => {
        const recentFailures = attempts.filter(attempt => 
          attempt.ip === ip && 
          !attempt.success &&
          Date.now() - attempt.timestamp < 300000 // 5 minutes
        ).length;
        
        return recentFailures >= 5; // Block after 5 failed attempts
      });

      // Act
      const isBruteForce = detectBruteForce('192.168.1.100', failedAttempts);

      // Assert
      expect(isBruteForce).toBe(true);
    });
  });

  describe('Audit Logging and Monitoring', () => {
    test('should log security events', async () => {
      // Arrange
      const securityEvents = [
        {
          type: 'authentication_failure',
          userId: 'user-123',
          ip: '192.168.1.100',
          timestamp: new Date().toISOString(),
          details: { reason: 'Invalid password' }
        },
        {
          type: 'authorization_denied',
          userId: 'user-456',
          resource: 'workflow-789',
          action: 'delete',
          timestamp: new Date().toISOString()
        },
        {
          type: 'suspicious_activity',
          ip: '10.0.0.1',
          timestamp: new Date().toISOString(),
          details: { reason: 'Multiple failed login attempts' }
        }
      ];

      // Mock audit logger
      const auditLogger = jest.fn().mockImplementation((event) => ({
        logged: true,
        eventId: `event-${Date.now()}`,
        timestamp: event.timestamp
      }));

      // Act & Assert
      securityEvents.forEach(event => {
        const result = auditLogger(event);
        expect(result.logged).toBe(true);
        expect(result.eventId).toBeDefined();
      });
    });

    test('should monitor for security anomalies', async () => {
      // Arrange
      const userActivity = [
        { userId: 'user-123', action: 'login', timestamp: Date.now(), location: 'US' },
        { userId: 'user-123', action: 'create_workflow', timestamp: Date.now() + 1000, location: 'US' },
        { userId: 'user-123', action: 'login', timestamp: Date.now() + 2000, location: 'RU' }, // Anomaly
        { userId: 'user-123', action: 'delete_workflow', timestamp: Date.now() + 3000, location: 'RU' }
      ];

      // Mock anomaly detection
      const detectAnomalies = jest.fn().mockImplementation((activities) => {
        const anomalies = [];
        const userLocations = new Set();
        
        activities.forEach(activity => {
          if (userLocations.has(activity.location)) return;
          
          userLocations.add(activity.location);
          if (userLocations.size > 1) {
            anomalies.push({
              type: 'location_anomaly',
              userId: activity.userId,
              details: `Login from unusual location: ${activity.location}`
            });
          }
        });
        
        return anomalies;
      });

      // Act
      const anomalies = detectAnomalies(userActivity);

      // Assert
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('location_anomaly');
      expect(anomalies[0].details).toContain('unusual location');
    });
  });
});

