# 🔐 Enterprise Security & Authentication Framework

A comprehensive, enterprise-grade security framework for the AI CI/CD system providing authentication, authorization, input validation, encryption, audit logging, and vulnerability management.

## 🎯 Features

### 🔑 Authentication & Authorization
- **Multi-Factor Authentication (MFA)** - TOTP, SMS, Email support
- **JWT Token Management** - Secure token generation and validation
- **OAuth2 Integration** - Google, GitHub, Microsoft providers
- **API Key Management** - Secure service-to-service authentication
- **Role-Based Access Control (RBAC)** - Granular permission system
- **Session Management** - Secure session handling with timeout

### 🛡️ Security Hardening
- **Input Validation & Sanitization** - Prevent injection attacks
- **SQL Injection Prevention** - Pattern detection and blocking
- **XSS Protection** - Cross-site scripting prevention
- **Command Injection Prevention** - System command protection
- **Rate Limiting & DDoS Protection** - Request throttling
- **Security Headers** - HSTS, CSP, X-Frame-Options, etc.

### 🔒 Encryption & Data Protection
- **Data Encryption at Rest** - AES-256-GCM encryption
- **Data Encryption in Transit** - TLS/SSL enforcement
- **Key Management** - Automatic key rotation
- **Digital Signatures** - Data integrity verification
- **Secure Random Generation** - Cryptographically secure tokens

### 📊 Compliance & Auditing
- **Comprehensive Audit Logging** - All security events logged
- **SOC2 Compliance** - Security control mappings
- **GDPR Compliance** - Data protection requirements
- **Compliance Reporting** - Automated report generation
- **Security Incident Response** - Automated alerting

### 🔍 Vulnerability Management
- **Automated Security Scanning** - NPM audit, Snyk, OWASP ZAP
- **Static Code Analysis** - Security pattern detection
- **Dependency Vulnerability Scanning** - Known CVE detection
- **Configuration Security Checks** - Misconfigurations detection
- **Continuous Monitoring** - Scheduled security scans

## 🚀 Quick Start

### Basic Setup

```javascript
import SecurityFramework from './security/index.js';

// Initialize security framework
const security = new SecurityFramework({
    enableAuth: true,
    enableRBAC: true,
    enableInputValidation: true,
    enableEncryption: true,
    enableAuditLogging: true,
    enableVulnerabilityScanning: true,
    auth: {
        jwtSecret: process.env.JWT_SECRET,
        mfaRequired: false,
        sessionTimeout: 30 * 60 * 1000 // 30 minutes
    },
    rbac: {
        strictMode: true,
        inheritanceEnabled: true
    },
    encryption: {
        algorithm: 'aes-256-gcm',
        enableKeyRotation: true
    }
});

// Initialize components
await security.initializeComponents();
```

### Express.js Integration

```javascript
import express from 'express';
import SecurityFramework from './security/index.js';

const app = express();
const security = new SecurityFramework();
await security.initializeComponents();

const securityMiddleware = security.getSecurityMiddleware();

// Apply security middleware
app.use(...securityMiddleware.getAllMiddleware());

// Protected route with authentication and authorization
app.get('/api/admin/users',
    ...securityMiddleware.createRouteMiddleware({
        auth: 'jwt',
        permission: 'users:read',
        validateInput: 'api'
    }),
    async (req, res) => {
        // Route handler
        res.json({ users: [] });
    }
);

// API key protected route
app.post('/api/tasks',
    ...securityMiddleware.createRouteMiddleware({
        auth: 'api_key',
        permission: 'tasks:write',
        validateInput: 'task'
    }),
    async (req, res) => {
        // Route handler
        res.json({ success: true });
    }
);
```

### Authentication Example

```javascript
// User login
try {
    const result = await security.authenticateUser(
        'username',
        'password',
        '123456', // MFA token
        {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        }
    );
    
    console.log('Authentication successful:', result);
    // {
    //   user: { id: '1', username: 'user', roles: ['developer'] },
    //   tokens: { accessToken: '...', refreshToken: '...' },
    //   session: { id: 'session_id', expiresAt: '...' }
    // }
} catch (error) {
    console.error('Authentication failed:', error.message);
}
```

### Permission Checking

```javascript
// Check user permission
const hasPermission = await security.checkPermission(
    'user_id',
    'tasks:write',
    'tasks:123', // specific resource
    { userId: 'user_id', ip: '127.0.0.1' }
);

if (hasPermission) {
    // User can write to task 123
} else {
    // Access denied
}
```

### Input Validation

```javascript
// Validate user input
try {
    const validatedData = await security.validateInput(
        {
            username: 'john_doe',
            email: 'john@example.com',
            password: 'SecurePass123!'
        },
        'user', // schema name
        { userId: 'admin_id' }
    );
    
    console.log('Validation successful:', validatedData);
} catch (error) {
    console.error('Validation failed:', error.violations);
}
```

### Data Encryption

```javascript
// Encrypt sensitive data
const encrypted = await security.encryptData('sensitive information');
console.log('Encrypted:', encrypted);
// {
//   data: 'encrypted_base64_string',
//   iv: 'initialization_vector',
//   tag: 'authentication_tag',
//   keyVersion: 1,
//   algorithm: 'aes-256-gcm'
// }

// Decrypt data
const decrypted = await security.decryptData(encrypted);
console.log('Decrypted:', decrypted); // 'sensitive information'
```

### Security Scanning

```javascript
// Run comprehensive security scan
const scanResults = await security.runSecurityScan({
    targetDirectory: './src',
    scanners: ['npm-audit', 'static-analysis', 'config-check']
});

console.log('Scan completed:', scanResults.summary);
// {
//   total: 5,
//   bySeverity: { critical: 0, high: 2, medium: 2, low: 1 },
//   riskScore: 18
// }
```

## 📋 Configuration

### Authentication Configuration

```json
{
  "auth": {
    "jwtSecret": "your-secret-key",
    "jwtExpiresIn": "24h",
    "refreshTokenExpiresIn": "7d",
    "mfaRequired": false,
    "sessionTimeout": 1800000,
    "maxLoginAttempts": 5,
    "lockoutDuration": 900000,
    "passwordPolicy": {
      "minLength": 8,
      "requireUppercase": true,
      "requireLowercase": true,
      "requireNumbers": true,
      "requireSpecialChars": true
    }
  }
}
```

### RBAC Configuration

```json
{
  "rbac": {
    "strictMode": true,
    "inheritanceEnabled": true,
    "cacheTimeout": 300000,
    "defaultRoles": ["user"],
    "adminRoles": ["admin", "super_admin"]
  }
}
```

### Security Middleware Configuration

```json
{
  "securityMiddleware": {
    "enableRateLimit": true,
    "enableHelmet": true,
    "enableCors": true,
    "rateLimit": {
      "windowMs": 900000,
      "max": 100,
      "skipPaths": ["/health", "/metrics"]
    },
    "cors": {
      "origin": ["http://localhost:3000"],
      "credentials": true
    }
  }
}
```

## 🔧 API Reference

### SecurityFramework

Main framework class that orchestrates all security components.

#### Methods

- `initializeComponents()` - Initialize all security components
- `authenticateUser(username, password, mfaToken, clientInfo)` - Authenticate user
- `checkPermission(userId, permission, resource, context)` - Check user permission
- `validateInput(input, schemaName, context)` - Validate input data
- `encryptData(data, options)` - Encrypt sensitive data
- `decryptData(encryptedData, options)` - Decrypt data
- `runSecurityScan(options)` - Run security vulnerability scan
- `getSecurityStatus()` - Get current security status
- `generateSecurityReport(options)` - Generate comprehensive security report
- `performHealthCheck()` - Perform security health check

### AuthManager

Handles authentication, session management, and token operations.

#### Methods

- `authenticate(username, password, mfaToken, clientInfo)` - Authenticate user
- `generateTokens(user)` - Generate JWT and refresh tokens
- `verifyToken(token)` - Verify JWT token
- `refreshAccessToken(refreshToken)` - Refresh access token
- `logout(sessionId, userId)` - Logout user
- `createApiKey(userId, name, permissions)` - Create API key
- `validateApiKey(apiKey)` - Validate API key

### RBACController

Manages roles, permissions, and access control policies.

#### Methods

- `hasPermission(userId, permission, resource, context)` - Check permission
- `assignRole(userId, roleId, assignedBy)` - Assign role to user
- `removeRole(userId, roleId, removedBy)` - Remove role from user
- `getUserRoles(userId)` - Get user roles
- `getUserPermissions(userId)` - Get user permissions
- `createRole(roleData, createdBy)` - Create custom role
- `createPermission(permissionData, createdBy)` - Create custom permission

### InputValidator

Validates and sanitizes input data to prevent security vulnerabilities.

#### Methods

- `validateInput(input, schemaName, context)` - Validate input against schema
- `validateFile(file, context)` - Validate file upload
- `addSchema(name, schema)` - Add custom validation schema
- `detectSQLInjection(value)` - Detect SQL injection patterns
- `detectXSS(value)` - Detect XSS patterns
- `detectCommandInjection(value)` - Detect command injection patterns

### EncryptionService

Provides encryption, decryption, and key management capabilities.

#### Methods

- `encrypt(data, options)` - Encrypt data
- `decrypt(encryptedData, options)` - Decrypt data
- `hashData(data, options)` - Hash data with salt
- `verifyHash(data, hashData)` - Verify hashed data
- `generateKeyPair(options)` - Generate asymmetric key pair
- `rotateKeys()` - Rotate encryption keys
- `generateSecureToken(options)` - Generate secure token

### VulnerabilityScanner

Automated security scanning and vulnerability management.

#### Methods

- `runScan(options)` - Run comprehensive security scan
- `getScanHistory(limit)` - Get scan history
- `getVulnerabilities(filters)` - Get vulnerability database
- `markVulnerabilityFixed(vulnerabilityId, fixedBy)` - Mark vulnerability as fixed

## 🛡️ Security Best Practices

### 1. Authentication
- Always use strong passwords with complexity requirements
- Enable MFA for administrative accounts
- Implement account lockout after failed attempts
- Use secure session management with proper timeouts

### 2. Authorization
- Follow principle of least privilege
- Implement role-based access control
- Regularly review and audit permissions
- Use resource-specific permissions when possible

### 3. Input Validation
- Validate all input on both client and server side
- Use whitelist validation when possible
- Sanitize output to prevent XSS
- Implement proper error handling

### 4. Encryption
- Encrypt sensitive data at rest and in transit
- Use strong encryption algorithms (AES-256)
- Implement proper key management
- Rotate encryption keys regularly

### 5. Monitoring & Auditing
- Log all security-relevant events
- Monitor for suspicious activities
- Implement real-time alerting
- Regular security assessments

## 🔍 Security Scanning

The framework includes automated security scanning capabilities:

### Command Line Usage

```bash
# Run all security scans
./scripts/security/security_scan.sh

# Run specific scans
./scripts/security/security_scan.sh -d -s  # Dependencies and static analysis
./scripts/security/security_scan.sh -w    # Web security scan
./scripts/security/security_scan.sh -c    # Configuration check

# Auto-fix vulnerabilities
./scripts/security/security_scan.sh -f

# Generate HTML report
./scripts/security/security_scan.sh --output-format html
```

### Programmatic Usage

```javascript
const scanner = security.getVulnerabilityScanner();

// Run scan
const results = await scanner.runScan({
    targetDirectory: './src',
    scanners: ['npm-audit', 'snyk', 'static-analysis'],
    autoFix: false
});

console.log('Vulnerabilities found:', results.vulnerabilities.length);
```

## 📊 Compliance & Reporting

### SOC2 Compliance

The framework supports SOC2 compliance with mappings for:
- CC6.1 - Logical Access Controls
- CC6.2 - Authentication Controls  
- CC6.3 - Authorization Controls
- CC6.6 - Logical Access Removal
- CC6.7 - Data Transmission Controls

### GDPR Compliance

GDPR compliance features include:
- Data subject rights management
- Data processing activity logging
- Consent management
- Data breach detection and reporting
- Data retention policies

### Compliance Reporting

```javascript
// Generate compliance report
const report = await security.generateSecurityReport({
    startDate: new Date('2024-01-01'),
    endDate: new Date(),
    format: 'json'
});

console.log('Compliance status:', report.compliance);
```

## 🚨 Incident Response

The framework provides automated incident response capabilities:

### Critical Event Handling

```javascript
// Listen for critical security events
security.on('criticalSecurityEvent', async (event) => {
    console.log('Critical security event:', event);
    
    // Automated response actions
    if (event.eventType === 'MULTIPLE_FAILED_LOGINS') {
        // Lock account, send alert
    }
    
    if (event.eventType === 'CRITICAL_VULNERABILITIES_FOUND') {
        // Notify security team, create incident
    }
});
```

### Security Alerts

Configure alerting for security events:

```javascript
const auditLogger = security.getAuditLogger();

auditLogger.on('criticalSecurityEvent', async (event) => {
    // Send to alerting system (Slack, PagerDuty, etc.)
    await sendSecurityAlert(event);
});
```

## 🔧 Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Check JWT secret configuration
   - Verify token expiration settings
   - Ensure proper session management

2. **Permission Denied Errors**
   - Verify user roles and permissions
   - Check RBAC policy configuration
   - Review resource-specific access rules

3. **Validation Errors**
   - Check input validation schemas
   - Verify data types and formats
   - Review security pattern detection

4. **Encryption Issues**
   - Verify encryption key configuration
   - Check key rotation settings
   - Ensure proper algorithm selection

### Debug Mode

Enable debug logging for troubleshooting:

```javascript
const security = new SecurityFramework({
    auditLogger: {
        logLevel: 'debug',
        enableConsoleOutput: true
    }
});
```

## 📚 Additional Resources

- [Security Configuration Guide](./docs/security-config.md)
- [RBAC Policy Examples](./docs/rbac-examples.md)
- [Vulnerability Scanning Guide](./docs/vulnerability-scanning.md)
- [Compliance Checklist](./docs/compliance-checklist.md)
- [API Security Best Practices](./docs/api-security.md)

## 🤝 Contributing

Please read our [Security Contributing Guidelines](./SECURITY_CONTRIBUTING.md) before submitting security-related contributions.

## 📄 License

This security framework is licensed under the MIT License with Commons Clause. See [LICENSE](./LICENSE) for details.

## 🔒 Security Disclosure

For security vulnerabilities, please follow our [Security Disclosure Policy](./SECURITY.md).

