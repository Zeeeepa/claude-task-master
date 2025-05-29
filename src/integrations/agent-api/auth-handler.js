/**
 * Authentication Handler - Unified Security Framework Integration
 * Consolidates authentication mechanisms with enterprise security framework
 */

import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { AuthManager } from '../../ai_cicd_system/security/auth_manager.js';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

/**
 * Unified Authentication Handler
 * Integrates with the enterprise security framework while maintaining API compatibility
 */
export class AuthHandler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      jwt: {
        secret: config.jwt?.secret || process.env.JWT_SECRET || 'default-secret',
        expiresIn: config.jwt?.expiresIn || '24h',
        issuer: config.jwt?.issuer || 'ai-cicd-system',
        audience: config.jwt?.audience || 'ai-cicd-api'
      },
      auth: config.auth || {},
      rateLimiting: config.rateLimiting || { enabled: false },
      ...config
    };

    // Initialize enterprise authentication manager
    this.authManager = new AuthManager(this.config.auth);
    this.logger = new SimpleLogger('AuthHandler');
    
    // Set up event forwarding from AuthManager
    this.setupEventForwarding();
    
    this.logger.info('Unified AuthHandler initialized with enterprise security framework');
  }

  /**
   * Set up event forwarding from AuthManager to maintain compatibility
   */
  setupEventForwarding() {
    this.authManager.on('userAuthenticated', (data) => {
      this.emit('userAuthenticated', data);
    });
    
    this.authManager.on('authenticationFailed', (data) => {
      this.emit('authenticationFailed', data);
    });
    
    this.authManager.on('userLoggedOut', (data) => {
      this.emit('userLoggedOut', data);
    });
    
    this.authManager.on('tokenRefreshed', (data) => {
      this.emit('tokenRefreshed', data);
    });
  }

  /**
   * Authenticate user using enterprise security framework
   */
  async authenticate(credentials) {
    try {
      const { username, password, mfaToken, clientInfo } = credentials;
      
      // Use AuthManager for authentication
      const authResult = await this.authManager.authenticate(
        username, 
        password, 
        mfaToken, 
        clientInfo
      );
      
      this.logger.info('User authenticated successfully', { 
        userId: authResult.user.id,
        method: 'enterprise_auth'
      });
      
      return {
        success: true,
        user: authResult.user,
        tokens: authResult.tokens,
        session: authResult.session
      };
      
    } catch (error) {
      this.logger.error('Authentication failed', { 
        error: error.message,
        username: credentials.username 
      });
      
      return {
        success: false,
        error: error.message,
        code: error.code || 'AUTH_FAILED'
      };
    }
  }

  /**
   * Validate token using enterprise security framework
   */
  async validateToken(token) {
    try {
      const decoded = await this.authManager.verifyToken(token);
      const session = this.authManager.getActiveSession(decoded.userId);
      
      if (!session) {
        throw new Error('Session not found or expired');
      }
      
      return {
        valid: true,
        decoded,
        session,
        user: session.user
      };
      
    } catch (error) {
      this.logger.warn('Token validation failed', { error: error.message });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh token using enterprise security framework
   */
  async refreshToken(refreshToken) {
    try {
      const result = await this.authManager.refreshToken(refreshToken);
      
      this.logger.info('Token refreshed successfully', { 
        userId: result.user.id 
      });
      
      return {
        success: true,
        tokens: result.tokens,
        user: result.user
      };
      
    } catch (error) {
      this.logger.error('Token refresh failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Revoke token using enterprise security framework
   */
  async revokeToken(token) {
    try {
      await this.authManager.revokeToken(token);
      this.logger.info('Token revoked successfully');
      return { success: true };
      
    } catch (error) {
      this.logger.error('Token revocation failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create API key using enterprise security framework
   */
  async createApiKey(userId, options = {}) {
    try {
      const apiKey = await this.authManager.createApiKey(userId, options);
      
      this.logger.info('API key created', { 
        userId,
        keyId: apiKey.id 
      });
      
      return {
        success: true,
        apiKey
      };
      
    } catch (error) {
      this.logger.error('API key creation failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate API key using enterprise security framework
   */
  async validateApiKey(apiKey) {
    try {
      const keyData = await this.authManager.validateApiKey(apiKey);
      return {
        valid: true,
        keyData,
        user: keyData.user
      };
      
    } catch (error) {
      this.logger.warn('API key validation failed', { error: error.message });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Express middleware for authentication
   */
  requireAuth() {
    return async (req, res, next) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'NO_TOKEN'
          });
        }

        const validation = await this.validateToken(token);
        if (!validation.valid) {
          return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
        }

        req.user = validation.user;
        req.session = validation.session;
        req.token = token;
        
        next();
        
      } catch (error) {
        this.logger.error('Authentication middleware error', { error: error.message });
        res.status(500).json({
          error: 'Authentication error',
          code: 'AUTH_ERROR'
        });
      }
    };
  }

  /**
   * Express middleware for API key authentication
   */
  requireApiKey() {
    return async (req, res, next) => {
      try {
        const apiKey = this.extractApiKey(req);
        if (!apiKey) {
          return res.status(401).json({
            error: 'API key required',
            code: 'NO_API_KEY'
          });
        }

        const validation = await this.validateApiKey(apiKey);
        if (!validation.valid) {
          return res.status(401).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY'
          });
        }

        req.user = validation.user;
        req.apiKey = validation.keyData;
        
        next();
        
      } catch (error) {
        this.logger.error('API key middleware error', { error: error.message });
        res.status(500).json({
          error: 'API key authentication error',
          code: 'API_KEY_ERROR'
        });
      }
    };
  }

  /**
   * Extract token from request
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return req.query.token || req.body.token;
  }

  /**
   * Extract API key from request
   */
  extractApiKey(req) {
    return req.headers['x-api-key'] || 
           req.query.api_key || 
           req.body.api_key;
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    return this.authManager.getStats();
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const authManagerHealth = await this.authManager.getHealth();
      return {
        status: 'healthy',
        authManager: authManagerHealth,
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Shutdown handler
   */
  async shutdown() {
    try {
      await this.authManager.shutdown();
      this.logger.info('AuthHandler shutdown completed');
    } catch (error) {
      this.logger.error('AuthHandler shutdown error', { error: error.message });
    }
  }
}

export default AuthHandler;
