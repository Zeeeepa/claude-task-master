/**
 * Authentication Module for AgentAPI
 * 
 * Handles authentication, authorization, and security for
 * AgentAPI communications and WSL2 instance access.
 */

import crypto from 'crypto';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class AuthManager {
  constructor(config = {}) {
    this.config = {
      tokenType: config.tokenType || 'bearer',
      tokenExpiry: config.tokenExpiry || 3600000, // 1 hour
      refreshTokenExpiry: config.refreshTokenExpiry || 7 * 24 * 60 * 60 * 1000, // 7 days
      secretKey: config.secretKey || process.env.AGENTAPI_SECRET_KEY,
      enableTokenRefresh: config.enableTokenRefresh !== false,
      enableApiKeyAuth: config.enableApiKeyAuth !== false,
      rateLimitEnabled: config.rateLimitEnabled !== false,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
      ...config
    };

    this.logger = new SimpleLogger('AuthManager');
    
    this.tokens = new Map();
    this.refreshTokens = new Map();
    this.apiKeys = new Map();
    this.loginAttempts = new Map();
    this.lockedAccounts = new Map();
    
    // Initialize default API keys if provided
    this._initializeApiKeys();
  }

  /**
   * Authenticate with username/password or API key
   * @param {Object} credentials - Authentication credentials
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(credentials) {
    try {
      const { username, password, apiKey, clientId } = credentials;

      // Check for account lockout
      if (this._isAccountLocked(username || clientId)) {
        throw new Error('Account is temporarily locked due to too many failed attempts');
      }

      let authResult;

      if (apiKey) {
        authResult = await this._authenticateWithApiKey(apiKey, clientId);
      } else if (username && password) {
        authResult = await this._authenticateWithPassword(username, password);
      } else {
        throw new Error('Invalid credentials provided');
      }

      if (authResult.success) {
        // Clear failed login attempts on successful authentication
        this._clearLoginAttempts(username || clientId);
        
        // Generate tokens
        const tokens = await this._generateTokens(authResult.user);
        
        this.logger.info('Authentication successful', {
          userId: authResult.user.id,
          method: apiKey ? 'api_key' : 'password'
        });

        return {
          success: true,
          user: authResult.user,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: this.config.tokenExpiry,
          tokenType: this.config.tokenType
        };
      } else {
        // Record failed login attempt
        this._recordFailedLogin(username || clientId);
        
        throw new Error(authResult.message || 'Authentication failed');
      }
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Validate an access token
   * @param {string} token - Access token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(token) {
    try {
      if (!token) {
        return { valid: false, error: 'No token provided' };
      }

      // Remove bearer prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      
      const tokenData = this.tokens.get(cleanToken);
      if (!tokenData) {
        return { valid: false, error: 'Invalid token' };
      }

      // Check if token has expired
      if (Date.now() > tokenData.expiresAt) {
        this.tokens.delete(cleanToken);
        return { valid: false, error: 'Token expired' };
      }

      // Update last used timestamp
      tokenData.lastUsed = new Date().toISOString();

      return {
        valid: true,
        user: tokenData.user,
        expiresAt: tokenData.expiresAt,
        scopes: tokenData.scopes || []
      };
    } catch (error) {
      this.logger.error('Token validation failed:', error);
      return { valid: false, error: 'Token validation error' };
    }
  }

  /**
   * Refresh an access token using a refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} Refresh result
   */
  async refreshToken(refreshToken) {
    try {
      if (!this.config.enableTokenRefresh) {
        throw new Error('Token refresh is disabled');
      }

      const refreshData = this.refreshTokens.get(refreshToken);
      if (!refreshData) {
        throw new Error('Invalid refresh token');
      }

      // Check if refresh token has expired
      if (Date.now() > refreshData.expiresAt) {
        this.refreshTokens.delete(refreshToken);
        throw new Error('Refresh token expired');
      }

      // Generate new access token
      const tokens = await this._generateTokens(refreshData.user);
      
      // Remove old refresh token and create new one
      this.refreshTokens.delete(refreshToken);

      this.logger.info('Token refreshed successfully', {
        userId: refreshData.user.id
      });

      return {
        success: true,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.config.tokenExpiry,
        tokenType: this.config.tokenType
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Revoke a token (logout)
   * @param {string} token - Token to revoke
   * @returns {Promise<boolean>} Revocation success
   */
  async revokeToken(token) {
    try {
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      
      const tokenData = this.tokens.get(cleanToken);
      if (tokenData) {
        this.tokens.delete(cleanToken);
        
        // Also revoke associated refresh token
        for (const [refreshToken, refreshData] of this.refreshTokens.entries()) {
          if (refreshData.user.id === tokenData.user.id) {
            this.refreshTokens.delete(refreshToken);
            break;
          }
        }
        
        this.logger.info('Token revoked successfully', {
          userId: tokenData.user.id
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Token revocation failed:', error);
      return false;
    }
  }

  /**
   * Create a new API key
   * @param {Object} keyData - API key data
   * @returns {Promise<Object>} API key creation result
   */
  async createApiKey(keyData) {
    try {
      const { name, userId, scopes = [], expiresIn } = keyData;
      
      const apiKey = this._generateApiKey();
      const keyInfo = {
        id: crypto.randomUUID(),
        key: apiKey,
        name,
        userId,
        scopes,
        createdAt: new Date().toISOString(),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null,
        lastUsed: null,
        active: true
      };

      this.apiKeys.set(apiKey, keyInfo);
      
      this.logger.info('API key created', {
        keyId: keyInfo.id,
        userId,
        name
      });

      return {
        success: true,
        apiKey,
        keyId: keyInfo.id,
        expiresAt: keyInfo.expiresAt
      };
    } catch (error) {
      this.logger.error('API key creation failed:', error);
      throw error;
    }
  }

  /**
   * Revoke an API key
   * @param {string} apiKey - API key to revoke
   * @returns {Promise<boolean>} Revocation success
   */
  async revokeApiKey(apiKey) {
    try {
      const keyInfo = this.apiKeys.get(apiKey);
      if (keyInfo) {
        keyInfo.active = false;
        keyInfo.revokedAt = new Date().toISOString();
        
        this.logger.info('API key revoked', {
          keyId: keyInfo.id,
          userId: keyInfo.userId
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('API key revocation failed:', error);
      return false;
    }
  }

  /**
   * Get user permissions for a resource
   * @param {Object} user - User object
   * @param {string} resource - Resource identifier
   * @param {string} action - Action to check
   * @returns {boolean} Permission granted
   */
  hasPermission(user, resource, action) {
    try {
      // Default permissions for system users
      if (user.role === 'system' || user.role === 'admin') {
        return true;
      }

      // Check user-specific permissions
      const permissions = user.permissions || [];
      const permission = `${resource}:${action}`;
      
      return permissions.includes(permission) || permissions.includes(`${resource}:*`);
    } catch (error) {
      this.logger.error('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Create Express middleware for authentication
   * @param {Object} options - Middleware options
   * @returns {Function} Express middleware
   */
  createMiddleware(options = {}) {
    const { requireAuth = true, requiredScopes = [] } = options;

    return async (req, res, next) => {
      try {
        if (!requireAuth) {
          return next();
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization header required'
          });
        }

        const token = authHeader.replace(/^Bearer\s+/i, '');
        const validation = await this.validateToken(token);

        if (!validation.valid) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: validation.error
          });
        }

        // Check required scopes
        if (requiredScopes.length > 0) {
          const userScopes = validation.scopes || [];
          const hasRequiredScope = requiredScopes.some(scope => 
            userScopes.includes(scope) || userScopes.includes('*')
          );

          if (!hasRequiredScope) {
            return res.status(403).json({
              error: 'Forbidden',
              message: 'Insufficient permissions'
            });
          }
        }

        // Add user and token info to request
        req.user = validation.user;
        req.token = token;
        req.tokenExpiry = validation.expiresAt;

        next();
      } catch (error) {
        this.logger.error('Authentication middleware error:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Authentication error'
        });
      }
    };
  }

  /**
   * Authenticate with API key
   * @param {string} apiKey - API key
   * @param {string} clientId - Client identifier
   * @returns {Promise<Object>} Authentication result
   */
  async _authenticateWithApiKey(apiKey, clientId) {
    const keyInfo = this.apiKeys.get(apiKey);
    
    if (!keyInfo || !keyInfo.active) {
      return { success: false, message: 'Invalid API key' };
    }

    // Check if API key has expired
    if (keyInfo.expiresAt && Date.now() > new Date(keyInfo.expiresAt).getTime()) {
      return { success: false, message: 'API key expired' };
    }

    // Update last used timestamp
    keyInfo.lastUsed = new Date().toISOString();

    // Create user object from API key
    const user = {
      id: keyInfo.userId || `api_key_${keyInfo.id}`,
      name: keyInfo.name || 'API Key User',
      role: 'api_user',
      permissions: keyInfo.scopes || [],
      authMethod: 'api_key',
      keyId: keyInfo.id
    };

    return { success: true, user };
  }

  /**
   * Authenticate with username/password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Authentication result
   */
  async _authenticateWithPassword(username, password) {
    // This would integrate with your user database
    // For now, implement basic validation
    
    if (username === 'admin' && password === 'admin123') {
      const user = {
        id: 'admin_user',
        name: 'Administrator',
        username: 'admin',
        role: 'admin',
        permissions: ['*'],
        authMethod: 'password'
      };
      
      return { success: true, user };
    }

    return { success: false, message: 'Invalid username or password' };
  }

  /**
   * Generate access and refresh tokens
   * @param {Object} user - User object
   * @returns {Promise<Object>} Generated tokens
   */
  async _generateTokens(user) {
    const accessToken = this._generateSecureToken();
    const refreshToken = this._generateSecureToken();
    
    const now = Date.now();
    const accessTokenData = {
      user,
      createdAt: new Date().toISOString(),
      expiresAt: now + this.config.tokenExpiry,
      lastUsed: new Date().toISOString(),
      scopes: user.permissions || []
    };

    const refreshTokenData = {
      user,
      createdAt: new Date().toISOString(),
      expiresAt: now + this.config.refreshTokenExpiry
    };

    this.tokens.set(accessToken, accessTokenData);
    
    if (this.config.enableTokenRefresh) {
      this.refreshTokens.set(refreshToken, refreshTokenData);
    }

    return {
      accessToken,
      refreshToken: this.config.enableTokenRefresh ? refreshToken : null
    };
  }

  /**
   * Generate a secure token
   * @returns {string} Secure token
   */
  _generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate an API key
   * @returns {string} API key
   */
  _generateApiKey() {
    const prefix = 'ak_';
    const key = crypto.randomBytes(24).toString('hex');
    return `${prefix}${key}`;
  }

  /**
   * Initialize default API keys from environment
   */
  _initializeApiKeys() {
    const defaultApiKey = process.env.AGENTAPI_TOKEN || process.env.AGENTAPI_API_KEY;
    
    if (defaultApiKey && this.config.enableApiKeyAuth) {
      const keyInfo = {
        id: 'default_key',
        key: defaultApiKey,
        name: 'Default API Key',
        userId: 'system',
        scopes: ['*'],
        createdAt: new Date().toISOString(),
        expiresAt: null,
        lastUsed: null,
        active: true
      };

      this.apiKeys.set(defaultApiKey, keyInfo);
      
      this.logger.info('Default API key initialized');
    }
  }

  /**
   * Record a failed login attempt
   * @param {string} identifier - User identifier
   */
  _recordFailedLogin(identifier) {
    if (!identifier) return;

    const attempts = this.loginAttempts.get(identifier) || [];
    attempts.push(new Date().toISOString());
    
    // Keep only recent attempts (within lockout duration)
    const cutoff = Date.now() - this.config.lockoutDuration;
    const recentAttempts = attempts.filter(attempt => 
      new Date(attempt).getTime() > cutoff
    );
    
    this.loginAttempts.set(identifier, recentAttempts);
    
    // Lock account if too many attempts
    if (recentAttempts.length >= this.config.maxLoginAttempts) {
      this.lockedAccounts.set(identifier, {
        lockedAt: new Date().toISOString(),
        unlockAt: new Date(Date.now() + this.config.lockoutDuration).toISOString()
      });
      
      this.logger.warn(`Account locked due to failed login attempts: ${identifier}`);
    }
  }

  /**
   * Clear failed login attempts
   * @param {string} identifier - User identifier
   */
  _clearLoginAttempts(identifier) {
    if (!identifier) return;
    
    this.loginAttempts.delete(identifier);
    this.lockedAccounts.delete(identifier);
  }

  /**
   * Check if account is locked
   * @param {string} identifier - User identifier
   * @returns {boolean} Lock status
   */
  _isAccountLocked(identifier) {
    if (!identifier) return false;
    
    const lockInfo = this.lockedAccounts.get(identifier);
    if (!lockInfo) return false;
    
    // Check if lock has expired
    if (Date.now() > new Date(lockInfo.unlockAt).getTime()) {
      this.lockedAccounts.delete(identifier);
      this.loginAttempts.delete(identifier);
      return false;
    }
    
    return true;
  }

  /**
   * Get authentication statistics
   * @returns {Object} Authentication stats
   */
  getStats() {
    return {
      activeTokens: this.tokens.size,
      activeRefreshTokens: this.refreshTokens.size,
      activeApiKeys: Array.from(this.apiKeys.values()).filter(key => key.active).length,
      lockedAccounts: this.lockedAccounts.size,
      failedLoginAttempts: this.loginAttempts.size
    };
  }

  /**
   * Cleanup expired tokens and unlock accounts
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean expired access tokens
    for (const [token, tokenData] of this.tokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }

    // Clean expired refresh tokens
    for (const [refreshToken, refreshData] of this.refreshTokens.entries()) {
      if (now > refreshData.expiresAt) {
        this.refreshTokens.delete(refreshToken);
        cleanedCount++;
      }
    }

    // Unlock expired account locks
    for (const [identifier, lockInfo] of this.lockedAccounts.entries()) {
      if (now > new Date(lockInfo.unlockAt).getTime()) {
        this.lockedAccounts.delete(identifier);
        this.loginAttempts.delete(identifier);
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired tokens`);
    }
  }
}

export default AuthManager;

