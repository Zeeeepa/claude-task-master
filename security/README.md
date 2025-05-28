# Security Framework

A comprehensive security framework for the Claude Task Master CI/CD system providing credential management, authentication, authorization, and audit logging.

## 🔐 Features

- **Secure Credential Management**: Encrypted storage and rotation of API keys and secrets
- **Multi-Factor Authentication**: JWT-based authentication with MFA support
- **Role-Based Access Control**: Fine-grained permissions system
- **Comprehensive Audit Logging**: Real-time security event monitoring
- **End-to-End Encryption**: AES-256-GCM encryption for sensitive data
- **Webhook Security**: Signature validation and replay attack prevention
- **Input Validation**: Protection against injection attacks and malicious payloads

## 🚀 Quick Start

### 1. Initialize the Security Framework

```bash
# Run the security initialization script
node scripts/security-init.js
```

### 2. Basic Usage

```javascript
import { securityFramework } from './security/index.js';

// Initialize the framework
await securityFramework.initialize();

// Get security status
const status = await securityFramework.getSecurityStatus();
console.log(status);
```

### 3. Express Integration

```javascript
import express from 'express';
import { setupSecurity } from './middleware/auth.js';

const app = express();

// Configure complete security setup
setupSecurity(app);

app.listen(3000, () => {
  console.log('Server running with security framework');
});
```

## 📁 Directory Structure

```
security/
├── auth/                    # Authentication components
│   └── authentication.js   # JWT auth, MFA, session management
├── audit/                   # Audit logging
│   └── audit-logger.js     # Security event logging
├── config/                  # Configuration
│   └── security-config.js  # Security settings and policies
├── crypto/                  # Cryptographic components
│   ├── credential-manager.js # Secure credential storage
│   └── encryption.js       # Encryption utilities
├── middleware/              # Express middleware
│   └── auth-middleware.js   # Authentication/authorization middleware
├── index.js                 # Main framework entry point
└── README.md               # This file
```

## 🔑 Core Components

### Credential Manager

Secure storage and management of API keys and secrets:

```javascript
import { credentialManager } from './security/index.js';

// Store an API key
await credentialManager.setSecret('OPENAI_API_KEY', 'sk-...');

// Retrieve an API key
const apiKey = await credentialManager.getSecret('OPENAI_API_KEY');

// Rotate credentials
await credentialManager.rotateSecret('OPENAI_API_KEY');
```

### Authentication Manager

JWT-based authentication with MFA support:

```javascript
import { authManager } from './security/index.js';

// Authenticate user
const result = await authManager.authenticate(
  'username', 
  'password', 
  'mfaCode', 
  clientInfo
);

// Verify token
const verification = await authManager.verifyToken(token);
```

### Encryption Manager

AES-256-GCM encryption for sensitive data:

```javascript
import { encryptionManager } from './security/index.js';

// Encrypt data
const encrypted = encryptionManager.encrypt('sensitive data');

// Decrypt data
const decrypted = encryptionManager.decrypt(encrypted, key);
```

### Audit Logger

Comprehensive security event logging:

```javascript
import { auditLogger } from './security/index.js';

// Log security event
auditLogger.log('authentication', 'login_attempt', {
  userId: 'user123',
  success: true
});

// Query logs
const logs = await auditLogger.queryLogs({
  category: 'authentication',
  startDate: '2024-01-01'
});
```

## 🛡️ Security Configuration

The framework is configured through `security/config/security-config.js`:

```javascript
export const SecurityConfig = {
  encryption: {
    algorithm: 'AES-256-GCM',
    keyRotationInterval: '30d'
  },
  authentication: {
    mfaRequired: true,
    sessionTimeout: '8h',
    maxLoginAttempts: 5
  },
  authorization: {
    rbacEnabled: true,
    defaultRole: 'viewer'
  }
};
```

## 🔐 Roles and Permissions

### Built-in Roles

- **admin**: Full system access (`*` permission)
- **developer**: Development and task management access
- **viewer**: Read-only access
- **service**: Service account for automated processes

### Permission Format

Permissions follow the format: `resource:action`

Examples:
- `tasks:read` - Read tasks
- `tasks:write` - Create/update tasks
- `credentials:rotate` - Rotate credentials
- `system:admin` - System administration

## 🔧 Middleware Usage

### Authentication

```javascript
import { authMiddleware } from './security/index.js';

// Require authentication
app.get('/protected', authMiddleware.authenticate(), handler);

// Require specific role
app.get('/admin', authMiddleware.authenticate({ roles: ['admin'] }), handler);
```

### Authorization

```javascript
// Require specific permission
app.get('/tasks', 
  authMiddleware.authenticate(),
  authMiddleware.authorize('tasks', 'read'),
  handler
);
```

### Input Validation

```javascript
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(1).max(100)
});

app.post('/tasks',
  authMiddleware.validateInput(schema),
  handler
);
```

### Rate Limiting

```javascript
// Apply rate limiting
app.use(authMiddleware.rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100
}));
```

### Webhook Security

```javascript
// Validate webhook signatures
app.post('/webhooks/github',
  authMiddleware.validateWebhookSignature('GITHUB_WEBHOOK_SECRET'),
  handler
);
```

## 📊 Monitoring and Reporting

### Security Status

```javascript
const status = await securityFramework.getSecurityStatus();
console.log(status);
```

### Security Reports

```javascript
const report = await securityFramework.generateSecurityReport(7); // Last 7 days
console.log(report);
```

### Security Validation

```javascript
const validation = await securityFramework.validateSecurity();
if (validation.status !== 'ok') {
  console.warn('Security issues found:', validation.issues);
}
```

## 🔄 Credential Rotation

### Automatic Rotation

The framework supports automatic credential rotation:

```javascript
// Check which credentials need rotation
const needsRotation = await credentialManager.checkRotationNeeded();

// Rotate specific credential
await credentialManager.rotateSecret('API_KEY_NAME');
```

### Manual Rotation

```bash
# Using the API
curl -X POST http://localhost:3000/security/credentials/OPENAI_API_KEY/rotate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newValue": "new-api-key"}'
```

## 🔍 Audit Logging

### Log Categories

- **authentication**: Login, logout, failed attempts
- **authorization**: Permission checks, role changes
- **data**: CRUD operations on sensitive data
- **system**: System events, errors, security incidents

### Log Levels

- **critical**: Security breaches, unauthorized access
- **warning**: Suspicious activity, policy violations
- **info**: Normal operations, successful authentications
- **debug**: Detailed debugging information

### Querying Logs

```javascript
// Get failed login attempts
const failedLogins = await auditLogger.queryLogs({
  event: 'failed_login',
  startDate: '2024-01-01',
  limit: 100
});

// Get all critical events
const criticalEvents = await auditLogger.queryLogs({
  level: 'critical',
  startDate: '2024-01-01'
});
```

## 🚨 Incident Response

The framework includes comprehensive incident response capabilities:

1. **Automated Detection**: Real-time monitoring for suspicious activity
2. **Immediate Containment**: Automatic account lockouts and IP blocking
3. **Evidence Preservation**: Comprehensive audit trails
4. **Recovery Procedures**: Credential rotation and system restoration

See `docs/INCIDENT_RESPONSE.md` for detailed procedures.

## 🧪 Testing

Run the security framework tests:

```bash
# Run all security tests
npm test tests/security/

# Run specific test file
npm test tests/security/security-framework.test.js
```

## 🔧 Configuration Options

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key

# Admin User
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourdomain.com

# Network Security
ALLOWED_ORIGINS=https://yourdomain.com
ALLOWED_IPS=192.168.1.0/24

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskmaster
DB_USER=taskmaster_user
DB_PASSWORD=secure_password
```

### Security Policies

Customize security policies in `security/config/security-config.js`:

```javascript
// Example: Stricter authentication
SecurityConfig.authentication.maxLoginAttempts = 3;
SecurityConfig.authentication.lockoutDuration = '30m';
SecurityConfig.authentication.sessionTimeout = '4h';

// Example: Enhanced rate limiting
SecurityConfig.api.rateLimiting.maxRequests = 50;
SecurityConfig.api.rateLimiting.windowMs = 10 * 60 * 1000; // 10 minutes
```

## 📚 API Reference

### Security Framework

- `initialize()` - Initialize the security framework
- `getSecurityStatus()` - Get current security status
- `generateSecurityReport(days)` - Generate security report
- `validateSecurity()` - Validate system security
- `shutdown()` - Shutdown the framework

### Credential Manager

- `setSecret(key, value, metadata)` - Store a secret
- `getSecret(key, session)` - Retrieve a secret
- `rotateSecret(key, newValue)` - Rotate a secret
- `deleteSecret(key)` - Delete a secret
- `listSecrets()` - List all secrets (metadata only)
- `checkRotationNeeded()` - Check rotation status

### Authentication Manager

- `authenticate(username, password, mfaCode, clientInfo)` - Authenticate user
- `verifyToken(token)` - Verify JWT token
- `refreshAccessToken(refreshToken)` - Refresh access token
- `logout(sessionId, userId)` - Logout user
- `generateTokens(user)` - Generate JWT tokens
- `hashPassword(password)` - Hash password

### Encryption Manager

- `encrypt(data, key)` - Encrypt data
- `decrypt(encryptedData, key)` - Decrypt data
- `encryptObject(obj, key)` - Encrypt object
- `decryptObject(encryptedData, key)` - Decrypt object
- `generateKey()` - Generate encryption key
- `sign(data, secret)` - Create HMAC signature
- `verify(data, signature, secret)` - Verify signature

### Audit Logger

- `log(category, event, data)` - Log security event
- `queryLogs(filters)` - Query audit logs
- `generateSecurityReport(days)` - Generate report
- `cleanupOldLogs()` - Clean up old logs

## 🤝 Contributing

1. Follow security best practices
2. Add comprehensive tests for new features
3. Update documentation
4. Ensure backward compatibility
5. Review security implications

## 📄 License

This security framework is part of the Claude Task Master project and follows the same license terms.

## 🔒 Security Disclosure

For security vulnerabilities, please contact the maintainers directly rather than creating public issues.

