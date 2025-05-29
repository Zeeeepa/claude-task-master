/**
 * Authentication Handler
 * 
 * Handles secure authentication and authorization for the AgentAPI middleware.
 * Supports JWT-based authentication with refresh tokens.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { SimpleLogger } from '../../ai_cicd_system/utils/simple_logger.js';

export class AuthHandler {
  constructor(config = {}) {
    this.config = {
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || this._generateSecret(),
      jwtExpiresIn: config.jwtExpiresIn || '1h',
      refreshTokenExpiresIn: config.refreshTokenExpiresIn || '7d',
      saltRounds: config.saltRounds || 12,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
      ...config
    };

    this.logger = new SimpleLogger('AuthHandler');
    this.refreshTokens = new Map(); // In production, use Redis or database
    this.loginAttempts = new Map(); // Track failed login attempts
    this.revokedTokens = new Set(); // Track revoked tokens
  }

  /**
   * Generate a secure secret if none provided
   */
  _generateSecret() {
    const secret = crypto.randomBytes(64).toString('hex');
    this.logger.warn('Using generated JWT secret. Set JWT_SECRET environment variable for production.');
    return secret;
  }

  /**
   * Hash a password
   */
  async hashPassword(password) {
    return bcrypt.hash(password, this.config.saltRounds);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(payload) {
    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiresIn,
      issuer: 'agent-api-middleware',
      audience: 'agent-api-clients'
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId) {
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + this._parseTimeToMs(this.config.refreshTokenExpiresIn));
    
    this.refreshTokens.set(refreshToken, {
      userId,
      expiresAt,
      createdAt: new Date()
    });

    return refreshToken;
  }

  /**
   * Parse time string to milliseconds
   */
  _parseTimeToMs(timeStr) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    try {
      if (this.revokedTokens.has(token)) {
        return { valid: false, error: 'Token has been revoked' };
      }

      const decoded = jwt.verify(token, this.config.jwtSecret, {
        issuer: 'agent-api-middleware',
        audience: 'agent-api-clients'
      });

      return {
        valid: true,
        payload: decoded,
        userId: decoded.sub,
        expiresAt: new Date(decoded.exp * 1000)
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate refresh token
   */
  validateRefreshToken(refreshToken) {
    const tokenData = this.refreshTokens.get(refreshToken);
    
    if (!tokenData) {
      return { valid: false, error: 'Invalid refresh token' };
    }

    if (tokenData.expiresAt < new Date()) {
      this.refreshTokens.delete(refreshToken);
      return { valid: false, error: 'Refresh token expired' };
    }

    return {
      valid: true,
      userId: tokenData.userId
    };
  }

  /**
   * Check if user is locked out due to failed login attempts
   */
  _isLockedOut(identifier) {
    const attempts = this.loginAttempts.get(identifier);
    if (!attempts) return false;

    if (attempts.count >= this.config.maxLoginAttempts) {
      const lockoutEnd = new Date(attempts.lastAttempt.getTime() + this.config.lockoutDuration);
      if (new Date() < lockoutEnd) {
        return true;
      } else {
        // Lockout period has expired, reset attempts
        this.loginAttempts.delete(identifier);
        return false;
      }
    }

    return false;
  }

  /**
   * Record failed login attempt
   */
  _recordFailedAttempt(identifier) {
    const attempts = this.loginAttempts.get(identifier) || { count: 0, lastAttempt: null };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.loginAttempts.set(identifier, attempts);

    this.logger.warn(`Failed login attempt for ${identifier}. Count: ${attempts.count}`);
  }

  /**
   * Clear failed login attempts
   */
  _clearFailedAttempts(identifier) {
    this.loginAttempts.delete(identifier);
  }

  /**
   * Authenticate user with username/password or API key
   */
  async authenticate(credentials) {
    const { username, password, apiKey } = credentials;
    const identifier = username || apiKey;

    // Check if user is locked out
    if (this._isLockedOut(identifier)) {
      return {
        success: false,
        message: 'Account temporarily locked due to too many failed attempts'
      };
    }

    try {
      let user;

      if (apiKey) {
        // API key authentication
        user = await this._authenticateWithApiKey(apiKey);
      } else {
        // Username/password authentication
        user = await this._authenticateWithPassword(username, password);
      }

      if (!user) {
        this._recordFailedAttempt(identifier);
        return {
          success: false,
          message: 'Invalid credentials'
        };
      }

      // Clear failed attempts on successful login
      this._clearFailedAttempts(identifier);

      // Generate tokens
      const tokenPayload = {
        sub: user.id,
        username: user.username,
        role: user.role || 'user',
        permissions: user.permissions || []
      };

      const token = this.generateToken(tokenPayload);
      const refreshToken = this.generateRefreshToken(user.id);

      this.logger.info(`User authenticated successfully: ${user.username}`);

      return {
        success: true,
        token,
        refreshToken,
        expiresIn: this.config.jwtExpiresIn,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions
        }
      };

    } catch (error) {
      this.logger.error('Authentication error:', error);
      this._recordFailedAttempt(identifier);
      return {
        success: false,
        message: 'Authentication failed'
      };
    }
  }

  /**
   * Authenticate with API key (mock implementation)
   */
  async _authenticateWithApiKey(apiKey) {
    // In production, this would query a database
    const validApiKeys = {
      'test-api-key-123': {
        id: 'api-user-1',
        username: 'api-user',
        role: 'api',
        permissions: ['read', 'write']
      }
    };

    return validApiKeys[apiKey] || null;
  }

  /**
   * Authenticate with username/password (mock implementation)
   */
  async _authenticateWithPassword(username, password) {
    // In production, this would query a database
    const users = {
      'admin': {
        id: 'user-1',
        username: 'admin',
        passwordHash: await this.hashPassword('admin123'), // In production, this would be pre-hashed
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      },
      'user': {
        id: 'user-2',
        username: 'user',
        passwordHash: await this.hashPassword('user123'),
        role: 'user',
        permissions: ['read']
      }
    };

    const user = users[username];
    if (!user) return null;

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) return null;

    return user;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    const validation = this.validateRefreshToken(refreshToken);
    
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error
      };
    }

    try {
      // Get user data (in production, query database)
      const user = await this._getUserById(validation.userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Generate new access token
      const tokenPayload = {
        sub: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      };

      const newToken = this.generateToken(tokenPayload);

      this.logger.info(`Token refreshed for user: ${user.username}`);

      return {
        success: true,
        token: newToken,
        expiresIn: this.config.jwtExpiresIn
      };

    } catch (error) {
      this.logger.error('Token refresh error:', error);
      return {
        success: false,
        message: 'Token refresh failed'
      };
    }
  }

  /**
   * Get user by ID (mock implementation)
   */
  async _getUserById(userId) {
    const users = {
      'user-1': {
        id: 'user-1',
        username: 'admin',
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      },
      'user-2': {
        id: 'user-2',
        username: 'user',
        role: 'user',
        permissions: ['read']
      },
      'api-user-1': {
        id: 'api-user-1',
        username: 'api-user',
        role: 'api',
        permissions: ['read', 'write']
      }
    };

    return users[userId] || null;
  }

  /**
   * Revoke token
   */
  async revokeToken(token) {
    this.revokedTokens.add(token);
    this.logger.info('Token revoked');
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(refreshToken) {
    this.refreshTokens.delete(refreshToken);
    this.logger.info('Refresh token revoked');
  }

  /**
   * Express middleware for requiring authentication
   */
  requireAuth(permissions = []) {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization header required'
          });
        }

        const token = authHeader.substring(7);
        const validation = await this.verifyToken(token);

        if (!validation.valid) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: validation.error
          });
        }

        // Check permissions if specified
        if (permissions.length > 0) {
          const userPermissions = validation.payload.permissions || [];
          const hasPermission = permissions.some(permission => 
            userPermissions.includes(permission) || userPermissions.includes('admin')
          );

          if (!hasPermission) {
            return res.status(403).json({
              error: 'Forbidden',
              message: 'Insufficient permissions'
            });
          }
        }

        // Add user info to request
        req.user = {
          id: validation.userId,
          username: validation.payload.username,
          role: validation.payload.role,
          permissions: validation.payload.permissions
        };
        req.token = token;
        req.tokenExpiry = validation.expiresAt;

        next();

      } catch (error) {
        this.logger.error('Auth middleware error:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Authentication error'
        });
      }
    };
  }

  /**
   * Validate token (for external use)
   */
  async validateToken(token) {
    return this.verifyToken(token);
  }

  /**
   * Clean up expired tokens (should be called periodically)
   */
  cleanup() {
    const now = new Date();
    
    // Clean up expired refresh tokens
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.expiresAt < now) {
        this.refreshTokens.delete(token);
      }
    }

    // Clean up old login attempts
    for (const [identifier, attempts] of this.loginAttempts.entries()) {
      const cutoff = new Date(now.getTime() - this.config.lockoutDuration * 2);
      if (attempts.lastAttempt < cutoff) {
        this.loginAttempts.delete(identifier);
      }
    }

    this.logger.debug('Auth cleanup completed');
  }
}

export default AuthHandler;

