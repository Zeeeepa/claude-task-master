# Unified Security Framework

## Overview

The Unified Security Framework consolidates security and authentication implementations from PRs #77 and #84 into a single, comprehensive security layer for the AI CI/CD system. This framework eliminates code duplication while providing enterprise-grade security features.

## Architecture

```
src/security/
├── index.js                    # Main SecurityFramework class
├── config/
│   └── security-config.js      # Configuration management
├── auth/
│   ├── authentication-manager.js  # JWT, API keys, sessions
│   └── authorization-manager.js   # RBAC and permissions
├── core/
│   ├── encryption-service.js   # Data encryption and hashing
│   └── audit-logger.js         # Security event logging
├── middleware/
│   └── security-middleware.js  # Express middleware integration
├── validation/
│   └── input-validator.js      # Input validation and sanitization
└── scanning/
    └── vulnerability-scanner.js # Security vulnerability scanning
```

## Features

### 🔐 Authentication
- **JWT Tokens**: Secure token-based authentication with refresh tokens
- **API Keys**: Long-lived API key authentication with rate limiting
- **Sessions**: Traditional session-based authentication
- **OAuth**: Extensible OAuth provider support (future)

### 🛡️ Authorization
- **RBAC**: Role-Based Access Control with hierarchical roles
- **Permissions**: Fine-grained permission system with wildcards
- **Caching**: Performance-optimized permission caching

### 🔒 Encryption
- **Data at Rest**: AES-256-GCM encryption with key rotation
- **Data in Transit**: TLS configuration and certificate management
- **Hashing**: Secure password hashing with bcrypt/scrypt
- **Key Management**: Cryptographic key generation and rotation

### 📊 Audit Logging
- **Security Events**: Comprehensive security event logging
- **Multiple Destinations**: File, database, syslog, Elasticsearch
- **Data Sanitization**: Automatic removal of sensitive information
- **Retention Policies**: Configurable log retention and archival

### 🛡️ Security Middleware
- **CORS**: Cross-Origin Resource Sharing configuration
- **Security Headers**: Comprehensive security header management
- **Rate Limiting**: Request rate limiting and throttling
- **Input Validation**: Automatic request validation

### ✅ Input Validation
- **Injection Protection**: SQL injection, XSS, command injection detection
- **Data Sanitization**: HTML entity encoding and data cleaning
- **Schema Validation**: Type checking and format validation
- **Size Limits**: Configurable limits for strings, arrays, objects

### 🔍 Vulnerability Scanning
- **Dependency Scanning**: Known vulnerability detection in packages
- **Code Analysis**: Static analysis for security issues
- **Configuration Review**: Security configuration validation
- **Secrets Detection**: Hardcoded secrets and credentials detection

## Quick Start

### Basic Setup

```javascript
import { SecurityFramework } from './src/security/index.js';

// Initialize with default configuration
const security = new SecurityFramework({
  authentication: {
    jwt: {
      secret: process.env.JWT_SECRET,
      issuer: 'ai-cicd-system',
      accessTokenExpiry: '1h'
    }
  },
  encryption: {
    masterKey: process.env.MASTER_KEY
  }
});

// Initialize the framework
await security.initialize();

// Get authentication manager
const authManager = security.getAuthenticationManager();

// Generate JWT token
const tokens = await authManager.generateJWT({
  sub: 'user123',
  email: 'user@example.com'
});

console.log('Access Token:', tokens.accessToken);
```

### Express Middleware Integration

```javascript
import express from 'express';
import { SecurityFramework } from './src/security/index.js';

const app = express();
const security = new SecurityFramework(config);
await security.initialize();

// Apply security middleware
app.use(security.getSecurityMiddleware().middleware());

// Protected route
app.get('/api/protected', (req, res) => {
  res.json({ user: req.user, message: 'Access granted' });
});
```

### Authentication Examples

```javascript
// JWT Authentication
const jwtResult = await authManager.authenticate({
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});

// API Key Authentication
const apiKeyResult = await authManager.authenticate({
  apiKey: 'ak_1234567890abcdef'
});

// Session Authentication
const sessionResult = await authManager.authenticate({
  sessionId: 'sess_abcdef123456'
});
```

### Authorization Examples

```javascript
const authzManager = security.getAuthorizationManager();

// Check user permission
const hasPermission = await authzManager.hasPermission(
  'user123',
  'tasks:write',
  '/api/tasks'
);

// Assign role to user
await authzManager.assignRole('user123', 'admin');

// Get user permissions
const permissions = await authzManager.getUserPermissions('user123');
```

### Encryption Examples

```javascript
const encryptionService = security.getEncryptionService();

// Encrypt sensitive data
const encrypted = await encryptionService.encrypt({
  creditCard: '4111-1111-1111-1111',
  ssn: '123-45-6789'
});

// Decrypt data
const decrypted = await encryptionService.decrypt(encrypted);

// Hash password
const hashedPassword = await encryptionService.hash('userPassword123');

// Verify password
const isValid = await encryptionService.verifyHash('userPassword123', hashedPassword);
```

### Vulnerability Scanning

```javascript
const scanner = security.getVulnerabilityScanner();

// Run comprehensive scan
const scanResults = await scanner.runScan({
  sourceDir: './src',
  packageJsonPath: './package.json'
});

console.log('Vulnerabilities found:', scanResults.summary.totalVulnerabilities);
console.log('Critical issues:', scanResults.summary.criticalCount);
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_ISSUER=ai-cicd-system
JWT_AUDIENCE=ai-cicd-users

# Session Configuration
SESSION_SECRET=your-session-secret-here

# Encryption Configuration
MASTER_KEY=your-master-encryption-key

# Security Settings
SECURITY_DEBUG=false
SECURITY_STRICT_MODE=true
CORS_ORIGIN=https://yourdomain.com

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost/security_db
```

### Configuration File

```javascript
const securityConfig = {
  // Component enablement
  components: {
    authentication: true,
    authorization: true,
    encryption: true,
    auditLogging: true,
    inputValidation: true,
    securityMiddleware: true,
    vulnerabilityScanning: true
  },

  // Authentication settings
  authentication: {
    jwt: {
      secret: process.env.JWT_SECRET,
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '7d'
    },
    apiKeys: {
      enabled: true,
      keyLength: 32,
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000
      }
    },
    sessions: {
      enabled: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: true
    }
  },

  // Authorization settings
  authorization: {
    rbac: {
      enabled: true,
      cachePermissions: true,
      cacheTTL: 300
    }
  },

  // Encryption settings
  encryption: {
    algorithm: 'aes-256-gcm',
    dataAtRest: {
      enabled: true,
      keyRotation: {
        enabled: true,
        intervalDays: 90
      }
    }
  },

  // Audit logging settings
  auditLogging: {
    enabled: true,
    destinations: ['file', 'database'],
    retention: {
      days: 365,
      maxSize: '10GB'
    }
  },

  // Security middleware settings
  securityMiddleware: {
    cors: {
      enabled: true,
      origin: process.env.CORS_ORIGIN
    },
    rateLimiting: {
      enabled: true,
      windowMs: 15 * 60 * 1000,
      maxRequests: 100
    }
  },

  // Input validation settings
  inputValidation: {
    enabled: true,
    strictMode: true,
    limits: {
      maxStringLength: 10000,
      maxArrayLength: 1000
    }
  },

  // Vulnerability scanning settings
  vulnerabilityScanning: {
    enabled: true,
    schedule: {
      enabled: true,
      cron: '0 2 * * *'
    },
    scans: {
      dependencies: true,
      codeAnalysis: true,
      secretsDetection: true
    }
  }
};
```

## Security Best Practices

### 1. Key Management
- Use strong, randomly generated keys
- Rotate keys regularly
- Store keys securely (environment variables, key vaults)
- Never commit keys to version control

### 2. Authentication
- Use strong JWT secrets (minimum 32 characters)
- Implement token refresh mechanisms
- Set appropriate token expiration times
- Use secure session configurations

### 3. Authorization
- Follow principle of least privilege
- Use role-based access control
- Implement permission caching for performance
- Regularly audit user permissions

### 4. Input Validation
- Validate all user inputs
- Sanitize data before processing
- Use parameterized queries
- Implement rate limiting

### 5. Audit Logging
- Log all security events
- Protect log integrity
- Implement log retention policies
- Monitor for suspicious activities

## API Reference

### SecurityFramework

Main class that orchestrates all security components.

```javascript
class SecurityFramework extends EventEmitter {
  constructor(config)
  async initialize()
  getComponent(name)
  getAuthenticationManager()
  getAuthorizationManager()
  getEncryptionService()
  getAuditLogger()
  getSecurityMiddleware()
  getInputValidator()
  getVulnerabilityScanner()
  async healthCheck()
  async shutdown()
}
```

### AuthenticationManager

Handles JWT, API key, and session authentication.

```javascript
class AuthenticationManager extends EventEmitter {
  async authenticate(credentials, method)
  async generateJWT(payload, options)
  async refreshJWT(refreshToken)
  async revokeJWT(token)
  async generateAPIKey(userId, options)
  async revokeAPIKey(keyId)
  async createSession(user, options)
  async destroySession(sessionId)
}
```

### AuthorizationManager

Provides RBAC and permission management.

```javascript
class AuthorizationManager extends EventEmitter {
  async hasPermission(userId, permission, resource)
  async assignRole(userId, roleId)
  async removeRole(userId, roleId)
  async getUserRoles(userId)
  async getUserPermissions(userId)
  async createRole(roleData)
  async updateRole(roleId, updates)
  async deleteRole(roleId)
}
```

## Testing

Run the security framework tests:

```bash
npm test src/security/
```

Run specific component tests:

```bash
npm test src/security/auth/
npm test src/security/core/
npm test src/security/middleware/
```

## Performance Considerations

- **Permission Caching**: Permissions are cached for 5 minutes by default
- **Rate Limiting**: In-memory rate limiting with configurable windows
- **Audit Logging**: Buffered logging with configurable flush intervals
- **Encryption**: Hardware-accelerated AES when available

## Security Considerations

- All sensitive data is automatically sanitized in logs
- Encryption keys are cleared from memory on shutdown
- Rate limiting prevents brute force attacks
- Input validation prevents injection attacks
- Vulnerability scanning detects known security issues

## Migration Guide

### From PR #77 Implementation

1. Replace `AuthManager` imports with `AuthenticationManager`
2. Update configuration structure to new format
3. Use unified `SecurityFramework` instead of individual components

### From PR #84 Implementation

1. Replace individual auth services with `AuthenticationManager`
2. Migrate RBAC logic to `AuthorizationManager`
3. Update middleware integration to use `SecurityMiddleware`

## Contributing

1. Follow security coding best practices
2. Add tests for all new features
3. Update documentation for API changes
4. Run security scans before submitting PRs

## License

This security framework is part of the AI CI/CD system and follows the same license terms.

