/**
 * Security Framework Main Entry Point
 * Exports all security components and provides initialization
 */

import { SecurityConfig } from './config/security-config.js';
import { credentialManager } from './crypto/credential-manager.js';
import { authManager } from './auth/authentication.js';
import { auditLogger } from './audit/audit-logger.js';
import { encryptionManager } from './crypto/encryption.js';
import authMiddleware from './middleware/auth-middleware.js';

class SecurityFramework {
  constructor() {
    this.config = SecurityConfig;
    this.credentialManager = credentialManager;
    this.authManager = authManager;
    this.auditLogger = auditLogger;
    this.encryptionManager = encryptionManager;
    this.middleware = authMiddleware;
    this.initialized = false;
  }

  /**
   * Initialize the security framework
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('🔐 Initializing Security Framework...');

      // Initialize credential manager
      await this.credentialManager.initialize();
      console.log('✅ Credential Manager initialized');

      // Initialize admin user if needed
      await this.authManager.initializeAdminUser();
      console.log('✅ Authentication Manager initialized');

      // Start cleanup tasks
      this.startCleanupTasks();
      console.log('✅ Cleanup tasks started');

      this.initialized = true;

      this.auditLogger.log('system', 'security_framework_initialized', {
        timestamp: new Date().toISOString()
      });

      console.log('🔐 Security Framework initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Security Framework:', error);
      this.auditLogger.log('system', 'security_framework_init_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Start periodic cleanup tasks
   */
  startCleanupTasks() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.authManager.cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    // Clean up old audit logs daily
    setInterval(() => {
      this.auditLogger.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000);

    // Check for credentials that need rotation weekly
    setInterval(async () => {
      try {
        const needsRotation = await this.credentialManager.checkRotationNeeded();
        if (needsRotation.length > 0) {
          this.auditLogger.log('system', 'credentials_need_rotation', {
            count: needsRotation.length,
            credentials: needsRotation,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        this.auditLogger.log('system', 'rotation_check_failed', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }, 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * Shutdown the security framework
   */
  async shutdown() {
    try {
      console.log('🔐 Shutting down Security Framework...');

      await this.auditLogger.shutdown();
      console.log('✅ Audit Logger shutdown complete');

      this.auditLogger.log('system', 'security_framework_shutdown', {
        timestamp: new Date().toISOString()
      });

      console.log('🔐 Security Framework shutdown complete');
    } catch (error) {
      console.error('❌ Error during Security Framework shutdown:', error);
    }
  }

  /**
   * Get security status
   */
  async getSecurityStatus() {
    const status = {
      initialized: this.initialized,
      timestamp: new Date().toISOString(),
      components: {
        credentialManager: {
          initialized: this.credentialManager.initialized,
          secretsCount: (await this.credentialManager.listSecrets()).length
        },
        authManager: {
          activeSessions: this.authManager.activeSessions.size,
          refreshTokens: this.authManager.refreshTokens.size
        },
        auditLogger: {
          initialized: this.auditLogger.initialized,
          bufferSize: this.auditLogger.logBuffer.length
        }
      },
      config: {
        mfaRequired: this.config.authentication.mfaRequired,
        rbacEnabled: this.config.authorization.rbacEnabled,
        auditEnabled: this.config.audit.enabled,
        encryptionAlgorithm: this.config.encryption.algorithm
      }
    };

    return status;
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(days = 7) {
    return this.auditLogger.generateSecurityReport(days);
  }

  /**
   * Validate system security
   */
  async validateSecurity() {
    const issues = [];

    // Check if admin password is default
    const adminPasswordHash = await this.credentialManager.getSecret('ADMIN_PASSWORD_HASH');
    if (!adminPasswordHash) {
      issues.push({
        severity: 'critical',
        type: 'missing_admin_password',
        message: 'Admin password not set'
      });
    }

    // Check JWT secret
    const jwtSecret = this.config.authentication.jwtSecret();
    if (jwtSecret === 'default-dev-secret-change-in-production') {
      issues.push({
        severity: 'critical',
        type: 'default_jwt_secret',
        message: 'Using default JWT secret in production'
      });
    }

    // Check for credentials needing rotation
    const needsRotation = await this.credentialManager.checkRotationNeeded();
    if (needsRotation.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'credentials_need_rotation',
        message: `${needsRotation.length} credentials need rotation`,
        details: needsRotation
      });
    }

    // Check if running in production without HTTPS
    if (process.env.NODE_ENV === 'production' && !this.config.network.useHttpsOnly) {
      issues.push({
        severity: 'warning',
        type: 'http_in_production',
        message: 'Running in production without HTTPS enforcement'
      });
    }

    return {
      timestamp: new Date().toISOString(),
      issuesFound: issues.length,
      issues,
      status: issues.some(i => i.severity === 'critical') ? 'critical' : 
              issues.some(i => i.severity === 'warning') ? 'warning' : 'ok'
    };
  }
}

// Create and export singleton instance
const securityFramework = new SecurityFramework();

// Export individual components for direct access
export {
  SecurityConfig,
  credentialManager,
  authManager,
  auditLogger,
  encryptionManager,
  authMiddleware,
  securityFramework
};

// Export default instance
export default securityFramework;

