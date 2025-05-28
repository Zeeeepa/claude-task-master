/**
 * Authentication Middleware for Task Master
 * Express middleware integration with the security framework
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { securityFramework, authMiddleware } from '../security/index.js';
import { SecurityConfig } from '../security/config/security-config.js';

/**
 * Configure security middleware for Express app
 */
export function configureSecurityMiddleware(app) {
  // Initialize security framework
  securityFramework.initialize().catch(console.error);

  // Helmet for security headers
  app.use(helmet(SecurityConfig.api.helmet));

  // CORS configuration
  app.use(cors(SecurityConfig.api.cors));

  // Rate limiting
  app.use(authMiddleware.rateLimit());

  // Parse JSON with size limit
  app.use(express.json({ 
    limit: SecurityConfig.validation.maxFileSize,
    verify: (req, res, buf) => {
      // Store raw body for webhook signature verification
      req.rawBody = buf;
    }
  }));

  // Parse URL-encoded data
  app.use(express.urlencoded({ 
    extended: true, 
    limit: SecurityConfig.validation.maxFileSize 
  }));

  // Trust proxy for accurate IP addresses
  if (SecurityConfig.network.trustProxy) {
    app.set('trust proxy', true);
  }

  console.log('🔐 Security middleware configured');
}

/**
 * Authentication routes
 */
export function configureAuthRoutes(app) {
  const router = express.Router();

  // Login endpoint
  router.post('/login', async (req, res) => {
    try {
      const { username, password, mfaCode } = req.body;
      const clientInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        platform: req.get('X-Platform') || 'unknown'
      };

      const result = await securityFramework.authManager.authenticate(
        username, 
        password, 
        mfaCode, 
        clientInfo
      );

      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: 'LOGIN_FAILED'
      });
    }
  });

  // Refresh token endpoint
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN'
        });
      }

      const result = await securityFramework.authManager.refreshAccessToken(refreshToken);

      res.json({
        success: true,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: 'REFRESH_FAILED'
      });
    }
  });

  // Logout endpoint
  router.post('/logout', authMiddleware.authenticate(), async (req, res) => {
    try {
      await securityFramework.authManager.logout(req.session.id, req.user.id);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'LOGOUT_FAILED'
      });
    }
  });

  // Get current user info
  router.get('/me', authMiddleware.authenticate(), (req, res) => {
    res.json({
      success: true,
      user: req.user,
      session: {
        id: req.session.id,
        createdAt: req.session.createdAt,
        lastActivity: req.session.lastActivity
      }
    });
  });

  // Get user sessions
  router.get('/sessions', authMiddleware.authenticate(), (req, res) => {
    const sessions = securityFramework.authManager.getUserSessions(req.user.id);
    res.json({
      success: true,
      sessions
    });
  });

  // Change password
  router.post('/change-password', authMiddleware.authenticate(), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      // Validate current password
      const user = await securityFramework.authManager.validateCredentials(
        req.user.username, 
        currentPassword
      );
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        });
      }

      // Hash new password and store
      const newPasswordHash = await securityFramework.authManager.hashPassword(newPassword);
      await securityFramework.credentialManager.setSecret(
        'ADMIN_PASSWORD_HASH', 
        newPasswordHash
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'PASSWORD_CHANGE_FAILED'
      });
    }
  });

  app.use('/auth', router);
  console.log('🔐 Authentication routes configured');
}

/**
 * Security status and management routes
 */
export function configureSecurityRoutes(app) {
  const router = express.Router();

  // Get security status
  router.get('/status', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('system', 'read'),
    async (req, res) => {
      try {
        const status = await securityFramework.getSecurityStatus();
        res.json({
          success: true,
          status
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'STATUS_ERROR'
        });
      }
    }
  );

  // Generate security report
  router.get('/report', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('system', 'read'),
    async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const report = await securityFramework.generateSecurityReport(days);
        res.json({
          success: true,
          report
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'REPORT_ERROR'
        });
      }
    }
  );

  // Validate system security
  router.get('/validate', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('system', 'read'),
    async (req, res) => {
      try {
        const validation = await securityFramework.validateSecurity();
        res.json({
          success: true,
          validation
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR'
        });
      }
    }
  );

  // List credentials (metadata only)
  router.get('/credentials', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('credentials', 'read'),
    async (req, res) => {
      try {
        const credentials = await securityFramework.credentialManager.listSecrets();
        res.json({
          success: true,
          credentials
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'CREDENTIALS_LIST_ERROR'
        });
      }
    }
  );

  // Rotate credential
  router.post('/credentials/:key/rotate', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('credentials', 'write'),
    async (req, res) => {
      try {
        const { key } = req.params;
        const { newValue } = req.body;
        
        const rotatedValue = await securityFramework.credentialManager.rotateSecret(key, newValue);
        
        res.json({
          success: true,
          message: 'Credential rotated successfully',
          // Don't return the actual value for security
          rotated: true
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'ROTATION_ERROR'
        });
      }
    }
  );

  // Check rotation status
  router.get('/credentials/rotation-status', 
    authMiddleware.authenticate(),
    authMiddleware.authorize('credentials', 'read'),
    async (req, res) => {
      try {
        const needsRotation = await securityFramework.credentialManager.checkRotationNeeded();
        res.json({
          success: true,
          needsRotation
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'ROTATION_CHECK_ERROR'
        });
      }
    }
  );

  app.use('/security', router);
  console.log('🔐 Security management routes configured');
}

/**
 * Webhook security routes
 */
export function configureWebhookRoutes(app) {
  const router = express.Router();

  // GitHub webhook endpoint
  router.post('/github', 
    authMiddleware.validateWebhookSignature('GITHUB_WEBHOOK_SECRET'),
    (req, res) => {
      // Handle GitHub webhook
      console.log('GitHub webhook received:', req.body);
      res.json({ success: true });
    }
  );

  // Linear webhook endpoint
  router.post('/linear', 
    authMiddleware.validateWebhookSignature('LINEAR_WEBHOOK_SECRET'),
    (req, res) => {
      // Handle Linear webhook
      console.log('Linear webhook received:', req.body);
      res.json({ success: true });
    }
  );

  // Generic webhook endpoint
  router.post('/generic/:service', 
    (req, res, next) => {
      const { service } = req.params;
      const secretKey = `${service.toUpperCase()}_WEBHOOK_SECRET`;
      return authMiddleware.validateWebhookSignature(secretKey)(req, res, next);
    },
    (req, res) => {
      const { service } = req.params;
      console.log(`${service} webhook received:`, req.body);
      res.json({ success: true });
    }
  );

  app.use('/webhooks', router);
  console.log('🔐 Webhook security routes configured');
}

/**
 * Error handling middleware
 */
export function configureErrorHandling(app) {
  // 404 handler
  app.use((req, res) => {
    securityFramework.auditLogger.log('system', 'not_found', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    res.status(404).json({
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND'
    });
  });

  // Global error handler
  app.use((error, req, res, next) => {
    securityFramework.auditLogger.log('system', 'unhandled_error', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'INTERNAL_ERROR'
    });
  });

  console.log('🔐 Error handling configured');
}

/**
 * Complete security setup for Express app
 */
export function setupSecurity(app) {
  configureSecurityMiddleware(app);
  configureAuthRoutes(app);
  configureSecurityRoutes(app);
  configureWebhookRoutes(app);
  configureErrorHandling(app);
  
  console.log('🔐 Complete security setup finished');
}

export default {
  configureSecurityMiddleware,
  configureAuthRoutes,
  configureSecurityRoutes,
  configureWebhookRoutes,
  configureErrorHandling,
  setupSecurity
};

