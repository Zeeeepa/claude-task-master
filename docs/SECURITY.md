# Security Framework Documentation

## Overview

The Claude Task Master security framework provides comprehensive protection for the entire CI/CD system with secure credential management, authentication, authorization, and audit logging.

## Features

### 🔐 Credential Management
- Secure storage and encryption of API keys and secrets
- Automatic key rotation with configurable intervals
- Environment variable fallback for backward compatibility
- Audit logging for all credential operations

### 🔑 Authentication
- Multi-factor authentication (MFA) support
- JWT-based session management
- Account lockout protection
- Session timeout and cleanup

### 🛡️ Authorization
- Role-based access control (RBAC)
- Fine-grained permissions system
- Resource-level access control
- Audit logging for authorization decisions

### 📊 Audit Logging
- Comprehensive security event logging
- Real-time monitoring and alerting
- Log retention and cleanup
- Security report generation

### 🔒 Encryption
- AES-256-GCM encryption for data at rest
- End-to-end encryption for data transmission
- Secure key generation and management
- File and stream encryption support

## Quick Start

### 1. Installation

The security framework is included with the Task Master installation. Ensure you have the required dependencies:

```bash
npm install bcrypt jsonwebtoken
```

### 2. Basic Setup

```javascript
import { securityFramework } from './security/index.js';

// Initialize the security framework
await securityFramework.initialize();

// Configure Express app with security middleware
import { setupSecurity } from './middleware/auth.js';
setupSecurity(app);
```

### 3. Environment Variables

Create a `.env` file with your configuration:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Admin User (will be created automatically)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourdomain.com

# API Keys (optional - can be stored securely instead)
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
PERPLEXITY_API_KEY=your-perplexity-key

# Webhook Secrets
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret
LINEAR_WEBHOOK_SECRET=your-linear-webhook-secret

# Network Security
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

## Configuration

### Security Configuration

The security framework is configured through `security/config/security-config.js`:

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

### Roles and Permissions

The framework includes predefined roles:

- **admin**: Full system access (`*` permission)
- **developer**: Development and task management access
- **viewer**: Read-only access
- **service**: Service account for automated processes

## API Endpoints

### Authentication

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password",
  "mfaCode": "123456"
}
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer your-access-token
```

### Security Management

#### Get Security Status
```http
GET /security/status
Authorization: Bearer your-access-token
```

#### Generate Security Report
```http
GET /security/report?days=7
Authorization: Bearer your-access-token
```

#### List Credentials
```http
GET /security/credentials
Authorization: Bearer your-access-token
```

#### Rotate Credential
```http
POST /security/credentials/OPENAI_API_KEY/rotate
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "newValue": "new-api-key-value"
}
```

### Webhooks

#### GitHub Webhook
```http
POST /webhooks/github
X-Hub-Signature-256: sha256=signature
X-Hub-Timestamp: 1234567890
Content-Type: application/json

{
  "action": "opened",
  "pull_request": { ... }
}
```

## Credential Management

### Storing API Keys

```javascript
import { taskMasterCredentialManager } from './utils/credential-manager.js';

// Store an API key securely
await taskMasterCredentialManager.setApiKey('openai', 'sk-...');

// Retrieve an API key
const apiKey = await taskMasterCredentialManager.getApiKey('openai');

// Check if API key exists
const hasKey = await taskMasterCredentialManager.hasApiKey('anthropic');
```

### Database Credentials

```javascript
// Store database credentials
await taskMasterCredentialManager.setDatabaseCredentials({
  host: 'localhost',
  port: 5432,
  database: 'taskmaster',
  username: 'dbuser',
  password: 'dbpass',
  sslMode: 'require'
});

// Retrieve database credentials
const dbConfig = await taskMasterCredentialManager.getDatabaseCredentials();
```

### Webhook Secrets

```javascript
// Store webhook secret
await taskMasterCredentialManager.setWebhookSecret('github', 'webhook-secret');

// Retrieve webhook secret
const secret = await taskMasterCredentialManager.getWebhookSecret('github');
```

## Middleware Usage

### Authentication Middleware

```javascript
import { authMiddleware } from './security/index.js';

// Require authentication
app.get('/protected', authMiddleware.authenticate(), (req, res) => {
  res.json({ user: req.user });
});

// Require specific role
app.get('/admin', authMiddleware.authenticate({ roles: ['admin'] }), (req, res) => {
  res.json({ message: 'Admin only' });
});
```

### Authorization Middleware

```javascript
// Require specific permission
app.get('/tasks', 
  authMiddleware.authenticate(),
  authMiddleware.authorize('tasks', 'read'),
  (req, res) => {
    // Handle request
  }
);
```

### Input Validation

```javascript
import { z } from 'zod';

const taskSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000)
});

app.post('/tasks',
  authMiddleware.authenticate(),
  authMiddleware.validateInput(taskSchema),
  (req, res) => {
    // req.validatedBody contains validated data
  }
);
```

## Audit Logging

### Manual Logging

```javascript
import { auditLogger } from './security/index.js';

// Log a security event
auditLogger.log('authentication', 'login_attempt', {
  username: 'user@example.com',
  ip: '192.168.1.100',
  success: true
});
```

### Query Logs

```javascript
// Query audit logs
const logs = await auditLogger.queryLogs({
  category: 'authentication',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  limit: 100
});
```

### Generate Reports

```javascript
// Generate security report
const report = await auditLogger.generateSecurityReport(30); // Last 30 days
```

## Encryption

### Basic Encryption

```javascript
import { encryptionManager } from './security/index.js';

// Encrypt data
const encrypted = encryptionManager.encrypt('sensitive data');

// Decrypt data
const decrypted = encryptionManager.decrypt(encrypted, key);
```

### File Encryption

```javascript
// Encrypt file
const key = await encryptionManager.encryptFile('input.txt', 'output.enc');

// Decrypt file
await encryptionManager.decryptFile('output.enc', 'decrypted.txt', key);
```

## Security Best Practices

### 1. Environment Variables
- Never commit sensitive data to version control
- Use strong, unique secrets for production
- Rotate credentials regularly

### 2. Network Security
- Use HTTPS in production
- Configure proper CORS settings
- Implement IP whitelisting where appropriate

### 3. Authentication
- Enable MFA for all users
- Use strong passwords
- Monitor failed login attempts

### 4. Authorization
- Follow principle of least privilege
- Regularly review user permissions
- Use service accounts for automated processes

### 5. Monitoring
- Enable audit logging
- Monitor security events
- Set up alerting for suspicious activity

## Troubleshooting

### Common Issues

#### 1. JWT Secret Not Set
```
Error: JWT secret not configured
```
**Solution**: Set `JWT_SECRET` environment variable

#### 2. Credential Manager Not Initialized
```
Error: Credential manager not initialized
```
**Solution**: Call `await securityFramework.initialize()` before using

#### 3. Permission Denied
```
Error: Access denied
```
**Solution**: Check user role and permissions

#### 4. Webhook Signature Invalid
```
Error: Invalid webhook signature
```
**Solution**: Verify webhook secret configuration

### Debug Mode

Enable debug logging:

```bash
DEBUG=security:* npm start
```

### Health Check

Check security framework status:

```javascript
const status = await securityFramework.getSecurityStatus();
console.log(status);
```

## Migration Guide

### From Environment Variables

If you're currently using environment variables for API keys, you can migrate to the secure credential store:

```javascript
// Migrate existing environment variables
const result = await taskMasterCredentialManager.migrateEnvironmentVariables();
console.log(`Migrated ${result.migrated.length} credentials`);
```

### Backward Compatibility

The security framework maintains backward compatibility with existing code:

- Environment variables are checked first
- Existing API key access patterns continue to work
- Gradual migration is supported

## Security Validation

Run security validation to check for common issues:

```javascript
const validation = await securityFramework.validateSecurity();
if (validation.status !== 'ok') {
  console.warn('Security issues found:', validation.issues);
}
```

## Support

For security-related questions or issues:

1. Check the troubleshooting section
2. Review audit logs for error details
3. Enable debug logging for more information
4. Consult the API documentation

## Security Disclosure

If you discover a security vulnerability, please report it responsibly:

1. Do not create public issues for security vulnerabilities
2. Contact the maintainers directly
3. Provide detailed information about the vulnerability
4. Allow time for the issue to be addressed before public disclosure

