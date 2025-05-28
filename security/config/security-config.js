/**
 * Security Configuration
 * Centralized security settings and policies for the CI/CD system
 */

import { resolveEnvVariable } from '../../scripts/modules/utils.js';

export const SecurityConfig = {
  // Encryption settings
  encryption: {
    algorithm: 'AES-256-GCM',
    keyLength: 32, // 256 bits
    ivLength: 16,  // 128 bits
    tagLength: 16, // 128 bits
    keyRotationInterval: '30d',
    saltRounds: 12
  },

  // Authentication settings
  authentication: {
    mfaRequired: true,
    sessionTimeout: '8h',
    maxLoginAttempts: 5,
    lockoutDuration: '15m',
    passwordMinLength: 12,
    passwordRequireSpecialChars: true,
    jwtSecret: () => resolveEnvVariable('JWT_SECRET') || 'default-dev-secret-change-in-production',
    jwtExpiresIn: '8h',
    refreshTokenExpiresIn: '7d'
  },

  // Authorization settings
  authorization: {
    rbacEnabled: true,
    defaultRole: 'viewer',
    roles: {
      admin: {
        permissions: ['*'],
        description: 'Full system access'
      },
      developer: {
        permissions: [
          'tasks:read',
          'tasks:write',
          'tasks:execute',
          'webhooks:read',
          'webhooks:write',
          'agents:read',
          'agents:execute'
        ],
        description: 'Development and task management access'
      },
      viewer: {
        permissions: [
          'tasks:read',
          'webhooks:read',
          'agents:read'
        ],
        description: 'Read-only access'
      },
      service: {
        permissions: [
          'tasks:read',
          'tasks:write',
          'webhooks:execute',
          'agents:execute'
        ],
        description: 'Service account for automated processes'
      }
    }
  },

  // API Security
  api: {
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? [resolveEnvVariable('ALLOWED_ORIGINS')?.split(',') || []]
        : ['http://localhost:3000', 'http://localhost:8080'],
      credentials: true,
      optionsSuccessStatus: 200
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  },

  // Audit logging
  audit: {
    enabled: true,
    logLevel: 'info',
    retentionDays: 90,
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie'
    ],
    events: {
      authentication: ['login', 'logout', 'failed_login', 'password_change'],
      authorization: ['permission_denied', 'role_change'],
      data: ['create', 'read', 'update', 'delete'],
      system: ['startup', 'shutdown', 'error', 'security_event']
    }
  },

  // Webhook security
  webhooks: {
    signatureHeader: 'X-Hub-Signature-256',
    timestampHeader: 'X-Hub-Timestamp',
    timestampTolerance: 300, // 5 minutes
    secretRotationInterval: '90d',
    maxPayloadSize: '10mb'
  },

  // Database security
  database: {
    encryptionAtRest: true,
    connectionTimeout: 30000,
    maxConnections: 10,
    sslMode: 'require',
    auditQueries: true
  },

  // Network security
  network: {
    allowedIPs: resolveEnvVariable('ALLOWED_IPS')?.split(',') || [],
    blockSuspiciousIPs: true,
    useHttpsOnly: process.env.NODE_ENV === 'production',
    trustProxy: true
  },

  // Input validation
  validation: {
    maxInputLength: 10000,
    allowedFileTypes: ['.js', '.json', '.md', '.txt', '.yml', '.yaml'],
    maxFileSize: '5mb',
    sanitizeHtml: true,
    validateSqlInjection: true,
    validateXss: true
  }
};

export default SecurityConfig;

