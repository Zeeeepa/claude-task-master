/**
 * Authentication System
 * Multi-factor authentication and session management
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { SecurityConfig } from '../config/security-config.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { credentialManager } from '../crypto/credential-manager.js';

class AuthenticationManager {
  constructor() {
    this.config = SecurityConfig.authentication;
    this.auditLogger = new AuditLogger();
    this.loginAttempts = new Map(); // Track failed login attempts
    this.activeSessions = new Map(); // Track active sessions
    this.refreshTokens = new Map(); // Track refresh tokens
  }

  /**
   * Authenticate user with username/password
   */
  async authenticate(username, password, mfaCode = null, clientInfo = {}) {
    const startTime = Date.now();
    
    try {
      // Check if account is locked
      if (this.isAccountLocked(username)) {
        this.auditLogger.log('authentication', 'login_attempt_locked_account', {
          username,
          clientInfo,
          timestamp: new Date().toISOString()
        });
        throw new Error('Account is temporarily locked due to too many failed attempts');
      }

      // Validate credentials
      const user = await this.validateCredentials(username, password);
      if (!user) {
        this.recordFailedAttempt(username, clientInfo);
        this.auditLogger.log('authentication', 'failed_login', {
          username,
          reason: 'invalid_credentials',
          clientInfo,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid credentials');
      }

      // Check MFA if required
      if (this.config.mfaRequired && !await this.validateMFA(user, mfaCode)) {
        this.auditLogger.log('authentication', 'failed_login', {
          username,
          reason: 'invalid_mfa',
          clientInfo,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid MFA code');
      }

      // Clear failed attempts on successful login
      this.clearFailedAttempts(username);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(user);

      // Create session
      const session = await this.createSession(user, accessToken, refreshToken, clientInfo);

      this.auditLogger.log('authentication', 'successful_login', {
        userId: user.id,
        username,
        sessionId: session.id,
        clientInfo,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

      return {
        user: this.sanitizeUser(user),
        accessToken,
        refreshToken,
        session,
        expiresIn: this.config.jwtExpiresIn
      };

    } catch (error) {
      this.auditLogger.log('authentication', 'authentication_error', {
        username,
        error: error.message,
        clientInfo,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(username, password) {
    // In a real implementation, this would query a user database
    // For now, we'll use environment variables for admin user
    const adminUsername = await credentialManager.getSecret('ADMIN_USERNAME') || 'admin';
    const adminPasswordHash = await credentialManager.getSecret('ADMIN_PASSWORD_HASH');

    if (username === adminUsername && adminPasswordHash) {
      const isValid = await bcrypt.compare(password, adminPasswordHash);
      if (isValid) {
        return {
          id: 'admin-001',
          username: adminUsername,
          role: 'admin',
          email: await credentialManager.getSecret('ADMIN_EMAIL') || 'admin@localhost',
          mfaEnabled: true,
          createdAt: new Date().toISOString()
        };
      }
    }

    return null;
  }

  /**
   * Validate MFA code
   */
  async validateMFA(user, mfaCode) {
    if (!this.config.mfaRequired) {
      return true;
    }

    if (!mfaCode) {
      return false;
    }

    // In a real implementation, this would validate TOTP/SMS codes
    // For demo purposes, we'll accept a simple pattern
    const expectedCode = this.generateMFACode(user.id);
    return mfaCode === expectedCode;
  }

  /**
   * Generate MFA code (demo implementation)
   */
  generateMFACode(userId) {
    // In production, use proper TOTP library like 'speakeasy'
    const secret = crypto.createHash('sha256').update(userId + 'mfa-secret').digest('hex');
    const timeWindow = Math.floor(Date.now() / 30000); // 30-second window
    const code = crypto.createHash('sha256').update(secret + timeWindow).digest('hex').substring(0, 6);
    return code;
  }

  /**
   * Generate JWT tokens
   */
  async generateTokens(user) {
    const jwtSecret = this.config.jwtSecret();
    
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(payload, jwtSecret, {
      expiresIn: this.config.jwtExpiresIn,
      issuer: 'claude-task-master',
      audience: 'task-master-api'
    });

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      jwtSecret,
      {
        expiresIn: this.config.refreshTokenExpiresIn,
        issuer: 'claude-task-master',
        audience: 'task-master-api'
      }
    );

    // Store refresh token
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      createdAt: new Date(),
      lastUsed: new Date()
    });

    return { accessToken, refreshToken };
  }

  /**
   * Create user session
   */
  async createSession(user, accessToken, refreshToken, clientInfo) {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      userId: user.id,
      accessToken,
      refreshToken,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.parseInterval(this.config.sessionTimeout)),
      clientInfo: {
        userAgent: clientInfo.userAgent,
        ip: clientInfo.ip,
        platform: clientInfo.platform
      }
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    try {
      const jwtSecret = this.config.jwtSecret();
      const decoded = jwt.verify(token, jwtSecret, {
        issuer: 'claude-task-master',
        audience: 'task-master-api'
      });

      // Check if session is still active
      const session = this.findSessionByUserId(decoded.userId);
      if (!session || session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      // Update last activity
      session.lastActivity = new Date();

      return {
        valid: true,
        user: {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role
        },
        session
      };
    } catch (error) {
      this.auditLogger.log('authentication', 'token_verification_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return { valid: false, error: error.message };
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const jwtSecret = this.config.jwtSecret();
      const decoded = jwt.verify(refreshToken, jwtSecret);

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token exists and is valid
      const tokenData = this.refreshTokens.get(refreshToken);
      if (!tokenData) {
        throw new Error('Refresh token not found');
      }

      // Update last used
      tokenData.lastUsed = new Date();

      // Generate new access token
      const user = { id: decoded.userId, username: decoded.username, role: decoded.role };
      const { accessToken } = await this.generateTokens(user);

      this.auditLogger.log('authentication', 'token_refreshed', {
        userId: decoded.userId,
        timestamp: new Date().toISOString()
      });

      return { accessToken, expiresIn: this.config.jwtExpiresIn };
    } catch (error) {
      this.auditLogger.log('authentication', 'token_refresh_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(sessionId, userId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Remove session
      this.activeSessions.delete(sessionId);

      // Remove refresh token
      for (const [token, data] of this.refreshTokens.entries()) {
        if (data.userId === userId) {
          this.refreshTokens.delete(token);
        }
      }

      this.auditLogger.log('authentication', 'logout', {
        userId,
        sessionId,
        timestamp: new Date().toISOString()
      });

      return true;
    }

    return false;
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(username, clientInfo) {
    const key = username;
    const attempts = this.loginAttempts.get(key) || { count: 0, lastAttempt: null };
    
    attempts.count++;
    attempts.lastAttempt = new Date();
    attempts.clientInfo = clientInfo;

    this.loginAttempts.set(key, attempts);

    // Auto-clear after lockout duration
    setTimeout(() => {
      this.clearFailedAttempts(username);
    }, this.parseInterval(this.config.lockoutDuration));
  }

  /**
   * Clear failed login attempts
   */
  clearFailedAttempts(username) {
    this.loginAttempts.delete(username);
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(username) {
    const attempts = this.loginAttempts.get(username);
    if (!attempts) return false;

    const lockoutTime = this.parseInterval(this.config.lockoutDuration);
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();

    return attempts.count >= this.config.maxLoginAttempts && timeSinceLastAttempt < lockoutTime;
  }

  /**
   * Find session by user ID
   */
  findSessionByUserId(userId) {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.expiresAt < now) {
        this.activeSessions.delete(sessionId);
        this.auditLogger.log('authentication', 'session_expired', {
          sessionId,
          userId: session.userId,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get active sessions for a user
   */
  getUserSessions(userId) {
    const sessions = [];
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        sessions.push({
          id: session.id,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          clientInfo: session.clientInfo
        });
      }
    }
    return sessions;
  }

  /**
   * Sanitize user object for client response
   */
  sanitizeUser(user) {
    const { password, passwordHash, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Parse interval string to milliseconds
   */
  parseInterval(interval) {
    const units = {
      'd': 24 * 60 * 60 * 1000,
      'h': 60 * 60 * 1000,
      'm': 60 * 1000,
      's': 1000
    };

    const match = interval.match(/^(\d+)([dhms])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Hash password for storage
   */
  async hashPassword(password) {
    return bcrypt.hash(password, this.config.saltRounds);
  }

  /**
   * Initialize admin user if not exists
   */
  async initializeAdminUser() {
    const adminUsername = await credentialManager.getSecret('ADMIN_USERNAME');
    if (!adminUsername) {
      const defaultPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await this.hashPassword(defaultPassword);
      
      await credentialManager.setSecret('ADMIN_USERNAME', 'admin');
      await credentialManager.setSecret('ADMIN_PASSWORD_HASH', passwordHash);
      await credentialManager.setSecret('ADMIN_EMAIL', 'admin@localhost');

      console.log('🔐 Admin user created:');
      console.log(`Username: admin`);
      console.log(`Password: ${defaultPassword}`);
      console.log('⚠️  Please change the default password immediately!');

      this.auditLogger.log('system', 'admin_user_created', {
        username: 'admin',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Export singleton instance
export const authManager = new AuthenticationManager();
export default AuthenticationManager;

