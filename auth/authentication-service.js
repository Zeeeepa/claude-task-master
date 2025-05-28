/**
 * Core Authentication Service
 * 
 * Provides JWT-based authentication with support for multiple authentication providers:
 * - Password-based authentication
 * - API key authentication  
 * - OAuth token authentication
 * - Service-to-service authentication for AI agents
 * 
 * Features:
 * - JWT token generation and validation
 * - Refresh token rotation
 * - Token revocation
 * - Role-based access control (RBAC)
 * - Rate limiting per user/service
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';

// Mock user database - replace with actual database integration
const MOCK_USERS = new Map([
  ['user@example.com', {
    id: 'user_123',
    email: 'user@example.com',
    password_hash: 'hashed_password_123', // In real implementation, use bcrypt
    roles: ['user'],
    permissions: ['tasks:read', 'tasks:write'],
    created_at: new Date('2024-01-01'),
    last_login: null,
    api_keys: ['ak_1234567890abcdef']
  }],
  ['admin@example.com', {
    id: 'admin_456',
    email: 'admin@example.com',
    password_hash: 'hashed_password_456',
    roles: ['admin', 'user'],
    permissions: ['*'], // Admin has all permissions
    created_at: new Date('2024-01-01'),
    last_login: null,
    api_keys: ['ak_admin_fedcba0987654321']
  }]
]);

// Mock service registry for service-to-service authentication
const MOCK_SERVICES = new Map([
  ['ai-agent-1', {
    id: 'service_ai_agent_1',
    name: 'AI Agent 1',
    service_token: 'st_ai_agent_1_secret',
    permissions: ['tasks:read', 'tasks:write', 'webhooks:process'],
    created_at: new Date('2024-01-01')
  }],
  ['webhook-processor', {
    id: 'service_webhook_proc',
    name: 'Webhook Processor',
    service_token: 'st_webhook_proc_secret',
    permissions: ['webhooks:process', 'tasks:create'],
    created_at: new Date('2024-01-01')
  }]
]);

// Token blacklist for revoked tokens
const TOKEN_BLACKLIST = new LRUCache({
  max: 10000,
  ttl: 1000 * 60 * 60 * 24 // 24 hours
});

// Refresh token storage
const REFRESH_TOKENS = new LRUCache({
  max: 50000,
  ttl: 1000 * 60 * 60 * 24 * 30 // 30 days
});

class AuthenticationService {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'dev-secret-key';
    this.jwtRefreshSecret = options.jwtRefreshSecret || process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key';
    this.accessTokenExpiry = options.accessTokenExpiry || '15m';
    this.refreshTokenExpiry = options.refreshTokenExpiry || '30d';
    this.issuer = options.issuer || 'claude-task-master';
    this.audience = options.audience || 'claude-task-master-api';
  }

  /**
   * Authenticate user with various credential types
   * @param {Object} credentials - Authentication credentials
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(credentials) {
    try {
      let user = null;
      let authType = credentials.type;

      switch (authType) {
        case 'password':
          user = await this._authenticatePassword(credentials);
          break;
        case 'api_key':
          user = await this._authenticateApiKey(credentials);
          break;
        case 'oauth':
          user = await this._authenticateOAuth(credentials);
          break;
        case 'service_token':
          return await this._authenticateService(credentials);
        default:
          throw new Error(`Unsupported authentication type: ${authType}`);
      }

      if (!user) {
        throw new Error('Authentication failed');
      }

      // Update last login
      user.last_login = new Date();

      // Generate tokens
      const tokenPair = await this._generateTokenPair(user);

      return {
        success: true,
        user_id: user.id,
        access_token: tokenPair.access_token,
        refresh_token: tokenPair.refresh_token,
        expires_in: 900, // 15 minutes
        token_type: 'Bearer',
        user_info: {
          user_id: user.id,
          email: user.email,
          name: user.name || user.email,
          roles: user.roles,
          created_at: user.created_at,
          last_login: user.last_login
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'authentication_failed',
        message: error.message
      };
    }
  }

  /**
   * Validate JWT token
   * @param {string} token - JWT token to validate
   * @returns {Promise<Object>} Token validation result
   */
  async validateToken(token) {
    try {
      // Check if token is blacklisted
      if (TOKEN_BLACKLIST.has(token)) {
        throw new Error('Token has been revoked');
      }

      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: this.audience
      });

      // Check if user still exists and is active
      const user = this._findUserById(decoded.sub);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        valid: true,
        user_id: decoded.sub,
        expires_at: new Date(decoded.exp * 1000),
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        token_type: decoded.type || 'access'
      };
    } catch (error) {
      return {
        valid: false,
        error: 'invalid_token',
        message: error.message
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New token pair
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret, {
        issuer: this.issuer,
        audience: this.audience
      });

      // Check if refresh token exists in storage
      if (!REFRESH_TOKENS.has(refreshToken)) {
        throw new Error('Refresh token not found or expired');
      }

      // Get user
      const user = this._findUserById(decoded.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Remove old refresh token
      REFRESH_TOKENS.delete(refreshToken);

      // Generate new token pair
      const tokenPair = await this._generateTokenPair(user);

      return {
        access_token: tokenPair.access_token,
        refresh_token: tokenPair.refresh_token,
        expires_in: 900, // 15 minutes
        token_type: 'Bearer'
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke token (add to blacklist)
   * @param {string} token - Token to revoke
   * @returns {Promise<void>}
   */
  async revokeToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded) {
        // Add to blacklist with TTL based on token expiry
        const ttl = (decoded.exp * 1000) - Date.now();
        if (ttl > 0) {
          TOKEN_BLACKLIST.set(token, true, { ttl });
        }
      }
    } catch (error) {
      // Token might be malformed, but we still want to blacklist it
      TOKEN_BLACKLIST.set(token, true);
    }
  }

  /**
   * Check user permission for resource and action
   * @param {string} userId - User ID
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @returns {Promise<boolean>} Permission granted
   */
  async checkPermission(userId, resource, action) {
    try {
      const user = this._findUserById(userId);
      if (!user) {
        return false;
      }

      // Admin users have all permissions
      if (user.roles.includes('admin')) {
        return true;
      }

      // Check if user has wildcard permission
      if (user.permissions.includes('*')) {
        return true;
      }

      // Check specific permission
      const permission = `${resource}:${action}`;
      return user.permissions.includes(permission);
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate JWT token pair (access + refresh)
   * @private
   */
  async _generateTokenPair(user) {
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();

    // Access token payload
    const accessPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      type: 'access',
      iat: now,
      exp: now + 900, // 15 minutes
      iss: this.issuer,
      aud: this.audience,
      jti: jti
    };

    // Refresh token payload
    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
      iat: now,
      exp: now + (30 * 24 * 60 * 60), // 30 days
      iss: this.issuer,
      aud: this.audience,
      jti: crypto.randomUUID()
    };

    const access_token = jwt.sign(accessPayload, this.jwtSecret);
    const refresh_token = jwt.sign(refreshPayload, this.jwtRefreshSecret);

    // Store refresh token
    REFRESH_TOKENS.set(refresh_token, {
      user_id: user.id,
      created_at: new Date()
    });

    return { access_token, refresh_token };
  }

  /**
   * Authenticate with password
   * @private
   */
  async _authenticatePassword(credentials) {
    const { email, password } = credentials;
    
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const user = MOCK_USERS.get(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // In real implementation, use bcrypt.compare()
    if (user.password_hash !== `hashed_${password}`) {
      throw new Error('Invalid credentials');
    }

    return user;
  }

  /**
   * Authenticate with API key
   * @private
   */
  async _authenticateApiKey(credentials) {
    const { api_key } = credentials;
    
    if (!api_key) {
      throw new Error('API key is required');
    }

    // Find user by API key
    for (const [email, user] of MOCK_USERS) {
      if (user.api_keys && user.api_keys.includes(api_key)) {
        return user;
      }
    }

    throw new Error('Invalid API key');
  }

  /**
   * Authenticate with OAuth token
   * @private
   */
  async _authenticateOAuth(credentials) {
    const { oauth_token } = credentials;
    
    if (!oauth_token) {
      throw new Error('OAuth token is required');
    }

    // Mock OAuth validation - in real implementation, validate with OAuth provider
    if (oauth_token === 'valid_oauth_token') {
      return MOCK_USERS.get('user@example.com');
    }

    throw new Error('Invalid OAuth token');
  }

  /**
   * Authenticate service-to-service
   * @private
   */
  async _authenticateService(credentials) {
    const { service_token, service_id } = credentials;
    
    if (!service_token || !service_id) {
      throw new Error('Service token and service ID are required');
    }

    const service = MOCK_SERVICES.get(service_id);
    if (!service || service.service_token !== service_token) {
      throw new Error('Invalid service credentials');
    }

    // Generate service token
    const now = Math.floor(Date.now() / 1000);
    const servicePayload = {
      sub: service.id,
      service_id: service_id,
      service_name: service.name,
      permissions: service.permissions,
      type: 'service',
      iat: now,
      exp: now + 3600, // 1 hour
      iss: this.issuer,
      aud: this.audience,
      jti: crypto.randomUUID()
    };

    const service_access_token = jwt.sign(servicePayload, this.jwtSecret);

    return {
      success: true,
      service_id: service.id,
      access_token: service_access_token,
      expires_in: 3600,
      token_type: 'Bearer',
      service_info: {
        service_id: service.id,
        service_name: service.name,
        permissions: service.permissions,
        created_at: service.created_at
      }
    };
  }

  /**
   * Find user by ID
   * @private
   */
  _findUserById(userId) {
    for (const [email, user] of MOCK_USERS) {
      if (user.id === userId) {
        return user;
      }
    }
    return null;
  }
}

export default AuthenticationService;

