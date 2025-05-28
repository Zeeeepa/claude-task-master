# AI CI/CD System - Authentication & Security Framework

## Overview

This document describes the comprehensive authentication and security framework implemented for the AI-driven CI/CD system. The framework provides enterprise-grade security features including JWT authentication, API key management, role-based access control, and comprehensive security middleware.

## Architecture

### Core Components

1. **Authentication System**
   - JWT Manager: Token generation, validation, and refresh
   - API Key Manager: API key lifecycle management
   - Role Manager: Role-based access control (RBAC)
   - Session Manager: User session management and cleanup

2. **Security Middleware**
   - Auth Middleware: Authentication and authorization
   - Rate Limiter: Request rate limiting and abuse prevention
   - Security Headers: HTTP security headers implementation
   - Input Validator: Input validation and sanitization

3. **Security Configuration**
   - Security Config: Centralized security settings
   - Encryption Config: Cryptographic operations and key management

4. **Audit and Monitoring**
   - Audit Logger: Comprehensive security event logging
   - Security Events: Real-time security monitoring

## Features

### 🔐 Authentication Methods

#### JWT Authentication
- **Algorithm**: HS256 (configurable)
- **Token Expiry**: 1 hour (configurable)
- **Refresh Tokens**: 7 days (configurable)
- **Revocation**: Database-backed token revocation
- **Claims**: Standard JWT claims with custom payload

```javascript
// Generate JWT token
const tokenResult = jwtManager.generateToken({
    sub: userId,
    username: 'john.doe',
    role: 'developer',
    permissions: ['read', 'write']
});

// Validate JWT token
const validation = await jwtManager.validateToken(token);
if (validation.valid) {
    console.log('User:', validation.payload);
}
```

#### API Key Authentication
- **Format**: `aics_{keyId}_{secret}`
- **Permissions**: Granular permission assignment
- **Expiration**: Configurable expiration dates
- **Usage Tracking**: Last used timestamps
- **Rate Limiting**: Per-key rate limiting

```javascript
// Generate API key
const keyResult = await apiKeyManager.generateAPIKey(userId, {
    name: 'Production API Key',
    permissions: ['read', 'write', 'execute_workflows'],
    expiresAt: new Date('2025-12-31')
});

// Validate API key
const validation = await apiKeyManager.validateAPIKey(apiKey);
```

### 👥 Role-Based Access Control (RBAC)

#### Role Hierarchy
- **Guest**: Read-only access
- **User**: Basic operations
- **Developer**: Development operations
- **Admin**: Administrative functions
- **Superadmin**: Full system access

#### Permission System
- **Granular Permissions**: Fine-grained access control
- **Hierarchical Roles**: Higher roles inherit lower permissions
- **Dynamic Assignment**: Runtime permission management
- **Wildcard Support**: `*` permission for superusers

```javascript
// Check permissions
const hasPermission = await roleManager.hasPermission(userId, 'manage_workflows');

// Grant permission
await roleManager.grantPermission(userId, 'delete_tasks');

// Assign role
await roleManager.assignRole(userId, 'developer');
```

### 🛡️ Security Middleware

#### Authentication Middleware
```javascript
// Require authentication
app.use('/api', authMiddleware.authenticate());

// Require specific permissions
app.use('/api/admin', authMiddleware.authorize(['admin']));

// Require specific roles
app.use('/api/workflows', authMiddleware.requireRole(['developer', 'admin']));
```

#### Rate Limiting
- **Multiple Strategies**: IP-based, user-based, endpoint-specific
- **Configurable Limits**: Per endpoint and role customization
- **Database Persistence**: Distributed rate limiting
- **Whitelist Support**: IP whitelist for trusted sources

```javascript
// Global rate limiting
app.use(rateLimiter.limit({
    requests: 100,
    windowSeconds: 900 // 15 minutes
}));

// Endpoint-specific limiting
app.use('/api/auth/login', rateLimiter.limitEndpoint('/api/auth/login', 5, 300));
```

#### Security Headers
- **HSTS**: HTTP Strict Transport Security
- **CSP**: Content Security Policy
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME type sniffing protection
- **Referrer Policy**: Referrer information control

```javascript
// Apply security headers
app.use(securityHeaders.middleware());

// Custom configuration
const customHeaders = new SecurityHeaders({
    csp: {
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"]
        }
    }
});
```

#### Input Validation
- **Injection Protection**: SQL, XSS, Command injection detection
- **Data Sanitization**: HTML stripping, Unicode normalization
- **File Upload Security**: Extension and MIME type validation
- **Custom Rules**: Schema-based validation

```javascript
// Validate request input
app.use('/api', inputValidator.validate({
    body: {
        username: { type: 'string', minLength: 3, maxLength: 50 },
        email: { type: 'string', format: 'email' }
    }
}));
```

### 📊 Audit and Monitoring

#### Security Event Logging
- **Comprehensive Tracking**: All security events logged
- **Structured Data**: JSON-formatted event data
- **Retention Policy**: Configurable retention periods
- **Search Capabilities**: Advanced log searching

```javascript
// Log security events
await auditLogger.logSecurityEvent('login_failure', 'medium', userId, {
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0...',
    reason: 'invalid_password'
});

// Search audit logs
const logs = await auditLogger.searchLogs({
    userId: 'user-123',
    startDate: new Date('2024-01-01'),
    eventType: 'login_failure'
});
```

#### Security Monitoring
- **Real-time Alerts**: Threshold-based alerting
- **Anomaly Detection**: Suspicious activity identification
- **Dashboard Integration**: Security metrics visualization
- **Compliance Reporting**: Automated compliance reports

### 🔒 Encryption and Cryptography

#### Data Encryption
- **Algorithm**: AES-256-GCM (configurable)
- **Key Management**: Automatic key rotation
- **Field-level Encryption**: Selective data encryption
- **Backup Encryption**: Encrypted backups

```javascript
// Encrypt sensitive data
const encryptResult = encryption.encrypt({
    creditCard: '4111-1111-1111-1111',
    ssn: '123-45-6789'
});

// Decrypt data
const decryptResult = encryption.decrypt(encryptResult.encrypted);
```

#### Cryptographic Operations
- **HMAC**: Message authentication codes
- **Key Derivation**: PBKDF2 key derivation
- **Random Generation**: Cryptographically secure random bytes
- **Digital Signatures**: Data integrity verification

## Database Schema

### Authentication Tables

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security events table
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    user_id UUID REFERENCES users(id),
    event_data JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_ISSUER=ai-cicd-system
JWT_AUDIENCE=ai-cicd-users
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# API Key Configuration
API_KEY_PREFIX=aics_
API_KEY_DEFAULT_EXPIRY=1y
API_KEY_MAX_PER_USER=10

# Session Configuration
SESSION_TIMEOUT=24h
MAX_SESSIONS_PER_USER=5
SESSION_TRACK_IP=true
SESSION_TRACK_USER_AGENT=true

# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_SALT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=900
RATE_LIMIT_WHITELIST=127.0.0.1,::1

# Security Headers
HSTS_ENABLED=true
HSTS_MAX_AGE=31536000
CSP_ENABLED=true
X_FRAME_OPTIONS=DENY

# Audit Logging
AUDIT_ENABLED=true
AUDIT_LOG_LEVEL=info
AUDIT_RETENTION_DAYS=90

# Database Security
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_CONNECTION_TIMEOUT=30000
```

### Programmatic Configuration

```javascript
const securityManager = new SecurityManager(database, {
    security: {
        jwt: {
            secret: process.env.JWT_SECRET,
            issuer: 'ai-cicd-system',
            audience: 'ai-cicd-users',
            accessTokenExpiry: '1h',
            refreshTokenExpiry: '7d'
        },
        password: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            saltRounds: 12
        },
        rateLimit: {
            enabled: true,
            defaultRequests: 100,
            defaultWindowSeconds: 900,
            endpointLimits: {
                '/api/auth/login': { requests: 5, windowSeconds: 300 }
            }
        }
    }
});
```

## Usage Examples

### Express.js Integration

```javascript
import express from 'express';
import { SecurityManager } from './src/ai_cicd_system/security/index.js';

const app = express();
const securityManager = new SecurityManager(database);

// Apply security middleware
app.use(securityManager.getSecurityHeadersMiddleware());
app.use(securityManager.getRateLimitMiddleware());

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
    const result = await securityManager.authenticateUser(req.body, {
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
    });
    
    if (result.success) {
        res.json({
            user: result.user,
            tokens: result.tokens
        });
    } else {
        res.status(401).json({ error: result.error });
    }
});

// Protected routes
app.use('/api/protected', securityManager.getAuthMiddleware());
app.use('/api/admin', securityManager.getAuthorizationMiddleware(['admin']));

// API endpoints
app.get('/api/tasks', 
    securityManager.getAuthMiddleware(),
    securityManager.getAuthorizationMiddleware(['read']),
    async (req, res) => {
        // Handle authenticated request
        res.json({ tasks: [] });
    }
);
```

### API Key Usage

```javascript
// Generate API key for user
const keyResult = await securityManager.getManagers().apiKey.generateAPIKey(
    userId,
    {
        name: 'CI/CD Pipeline Key',
        permissions: ['read', 'write', 'execute_workflows'],
        expiresAt: new Date('2025-12-31')
    }
);

// Use API key in requests
const response = await fetch('/api/workflows', {
    headers: {
        'X-API-Key': keyResult.apiKey,
        'Content-Type': 'application/json'
    }
});
```

### Role Management

```javascript
// Create user with specific role
await securityManager.getManagers().role.assignRole(userId, 'developer');

// Grant additional permissions
await securityManager.getManagers().role.grantPermission(userId, 'manage_workflows');

// Check permissions in middleware
app.use('/api/workflows', (req, res, next) => {
    if (req.user.permissions.includes('manage_workflows')) {
        next();
    } else {
        res.status(403).json({ error: 'Insufficient permissions' });
    }
});
```

## Security Best Practices

### 1. Token Management
- Use short-lived access tokens (1 hour)
- Implement secure refresh token rotation
- Store refresh tokens securely in database
- Implement token revocation for logout

### 2. Password Security
- Enforce strong password policies
- Use bcrypt with high salt rounds (12+)
- Implement account lockout after failed attempts
- Require password changes for compromised accounts

### 3. API Security
- Use HTTPS for all communications
- Implement proper CORS policies
- Validate all input data
- Use rate limiting to prevent abuse

### 4. Session Management
- Limit concurrent sessions per user
- Track session metadata (IP, User-Agent)
- Implement session timeout
- Secure session storage

### 5. Audit and Monitoring
- Log all security events
- Monitor for suspicious activities
- Implement real-time alerting
- Regular security audits

## Testing

### Running Security Tests

```bash
# Install dependencies
npm install

# Run security test suite
npm test tests/security/

# Run specific test file
npm test tests/security/auth_system.test.js

# Run with coverage
npm run test:coverage
```

### Test Coverage

The security framework includes comprehensive tests covering:
- JWT token generation and validation
- API key management
- Role-based access control
- Session management
- Authentication flows
- Security middleware
- Input validation
- Audit logging
- Encryption operations

## Deployment

### Production Checklist

- [ ] Set strong JWT secret (64+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS policies
- [ ] Set up database SSL
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerting
- [ ] Review security headers
- [ ] Test backup and recovery
- [ ] Perform security audit

### Docker Configuration

```dockerfile
# Security-focused Dockerfile
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set security headers
ENV NODE_ENV=production
ENV JWT_SECRET=${JWT_SECRET}
ENV DB_SSL=true

# Copy application
COPY --chown=nextjs:nodejs . .

USER nextjs
EXPOSE 3000

CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **JWT Token Validation Fails**
   - Check JWT secret configuration
   - Verify token expiration
   - Check issuer/audience claims

2. **API Key Authentication Fails**
   - Verify API key format
   - Check key expiration
   - Validate permissions

3. **Rate Limiting Issues**
   - Check rate limit configuration
   - Verify IP whitelist
   - Review endpoint-specific limits

4. **Session Management Problems**
   - Check session timeout settings
   - Verify database connectivity
   - Review session cleanup process

### Debug Mode

```javascript
// Enable debug logging
const securityManager = new SecurityManager(database, {
    security: {
        audit: {
            logLevel: 'debug'
        }
    }
});

// Check security status
const status = await securityManager.getSecurityStatus();
console.log('Security Status:', status);
```

## Support

For security-related issues or questions:
1. Check this documentation
2. Review test cases for examples
3. Check audit logs for security events
4. Contact the security team for critical issues

## License

This security framework is part of the AI CI/CD System and is licensed under the MIT License with Commons Clause.

