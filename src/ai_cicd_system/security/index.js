/**
 * Security Module Index
 * 
 * Main entry point for the AI CI/CD system security framework.
 * Exports all security components and provides a unified security manager.
 */

// Authentication components
export { JWTManager } from '../auth/jwt_manager.js';
export { APIKeyManager } from '../auth/api_key_manager.js';
export { RoleManager } from '../auth/role_manager.js';
export { SessionManager } from '../auth/session_manager.js';

// Middleware components
export { AuthMiddleware } from '../middleware/auth_middleware.js';
export { RateLimiter } from '../middleware/rate_limiter.js';
export { SecurityHeaders } from '../middleware/security_headers.js';
export { InputValidator } from '../middleware/input_validator.js';

// Configuration components
export { SecurityConfig } from '../config/security_config.js';
export { EncryptionConfig } from '../config/encryption_config.js';

// Security utilities
export { AuditLogger } from './audit_logger.js';

import { JWTManager } from '../auth/jwt_manager.js';
import { APIKeyManager } from '../auth/api_key_manager.js';
import { RoleManager } from '../auth/role_manager.js';
import { SessionManager } from '../auth/session_manager.js';
import { AuthMiddleware } from '../middleware/auth_middleware.js';
import { RateLimiter } from '../middleware/rate_limiter.js';
import { SecurityHeaders } from '../middleware/security_headers.js';
import { InputValidator } from '../middleware/input_validator.js';
import { SecurityConfig } from '../config/security_config.js';
import { EncryptionConfig } from '../config/encryption_config.js';
import { AuditLogger } from './audit_logger.js';
import { SimpleLogger } from '../utils/simple_logger.js';

/**
 * Unified Security Manager
 * 
 * Provides a centralized interface for all security operations
 */
export class SecurityManager {
    constructor(database, config = {}) {
        this.db = database;
        this.logger = new SimpleLogger('SecurityManager');
        
        // Initialize security configuration
        this.securityConfig = new SecurityConfig(config.security);
        this.encryptionConfig = new EncryptionConfig(config.encryption);
        
        // Initialize core managers
        this.jwtManager = new JWTManager(this.securityConfig.getJWTConfig(), database);
        this.apiKeyManager = new APIKeyManager(database, this.securityConfig.getAPIKeyConfig());
        this.roleManager = new RoleManager(database, this.securityConfig.get('role', {}));
        this.sessionManager = new SessionManager(database, this.securityConfig.getSessionConfig());
        
        // Initialize middleware
        this.authMiddleware = new AuthMiddleware(this.securityConfig.config, database);
        this.rateLimiter = new RateLimiter(database, this.securityConfig.getRateLimitConfig());
        this.securityHeaders = new SecurityHeaders(this.securityConfig.getHeadersConfig());
        this.inputValidator = new InputValidator(config.inputValidation);
        
        // Initialize audit logger
        this.auditLogger = new AuditLogger(database, this.securityConfig.get('audit', {}));
        
        this.logger.info('Security Manager initialized');
    }

    /**
     * Get authentication middleware
     */
    getAuthMiddleware(options = {}) {
        return this.authMiddleware.authenticate(options);
    }

    /**
     * Get authorization middleware
     */
    getAuthorizationMiddleware(permissions = [], options = {}) {
        return this.authMiddleware.authorize(permissions, options);
    }

    /**
     * Get role-based authorization middleware
     */
    getRoleMiddleware(roles = [], options = {}) {
        return this.authMiddleware.requireRole(roles, options);
    }

    /**
     * Get rate limiting middleware
     */
    getRateLimitMiddleware(options = {}) {
        return this.rateLimiter.limit(options);
    }

    /**
     * Get security headers middleware
     */
    getSecurityHeadersMiddleware() {
        return this.securityHeaders.middleware();
    }

    /**
     * Get input validation middleware
     */
    getInputValidationMiddleware(rules = {}) {
        return this.inputValidator.validate(rules);
    }

    /**
     * Authenticate user with credentials
     */
    async authenticateUser(credentials, sessionData = {}) {
        try {
            // Log authentication attempt
            await this.auditLogger.logAuthentication(
                'login_attempt',
                null,
                false,
                { method: credentials.apiKey ? 'api_key' : 'password' },
                sessionData
            );

            let authResult;
            
            if (credentials.apiKey) {
                // API key authentication
                authResult = await this.apiKeyManager.validateAPIKey(credentials.apiKey);
                
                if (authResult.valid) {
                    // Log successful authentication
                    await this.auditLogger.logAuthentication(
                        'api_key_login',
                        authResult.userId,
                        true,
                        { key_id: authResult.keyId },
                        sessionData
                    );
                    
                    return {
                        success: true,
                        user: {
                            id: authResult.userId,
                            username: authResult.username,
                            role: authResult.role,
                            permissions: authResult.permissions
                        },
                        authMethod: 'api_key'
                    };
                }
            } else if (credentials.username && credentials.password) {
                // Username/password authentication
                const userResult = await this.db.query(
                    'SELECT id, username, email, password_hash, role, permissions, is_active FROM users WHERE username = $1 OR email = $1',
                    [credentials.username]
                );

                if (userResult.rows.length === 0) {
                    await this.auditLogger.logAuthentication(
                        'login_failure',
                        null,
                        false,
                        { reason: 'user_not_found', username: credentials.username },
                        sessionData
                    );
                    
                    return {
                        success: false,
                        error: 'Invalid credentials',
                        code: 'INVALID_CREDENTIALS'
                    };
                }

                const user = userResult.rows[0];
                
                if (!user.is_active) {
                    await this.auditLogger.logAuthentication(
                        'login_failure',
                        user.id,
                        false,
                        { reason: 'account_inactive' },
                        sessionData
                    );
                    
                    return {
                        success: false,
                        error: 'Account is inactive',
                        code: 'ACCOUNT_INACTIVE'
                    };
                }

                // Verify password (assuming bcrypt is used)
                const bcrypt = await import('bcrypt');
                const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
                
                if (!isValidPassword) {
                    await this.auditLogger.logAuthentication(
                        'login_failure',
                        user.id,
                        false,
                        { reason: 'invalid_password' },
                        sessionData
                    );
                    
                    return {
                        success: false,
                        error: 'Invalid credentials',
                        code: 'INVALID_CREDENTIALS'
                    };
                }

                // Generate tokens
                const tokenPayload = {
                    sub: user.id,
                    username: user.username,
                    role: user.role,
                    permissions: JSON.parse(user.permissions || '[]')
                };

                const tokenResult = this.jwtManager.generateToken(tokenPayload);
                const refreshTokenResult = await this.jwtManager.generateRefreshToken(user.id, sessionData);

                // Log successful authentication
                await this.auditLogger.logAuthentication(
                    'password_login',
                    user.id,
                    true,
                    { session_id: refreshTokenResult.sessionId },
                    sessionData
                );

                return {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        permissions: JSON.parse(user.permissions || '[]')
                    },
                    tokens: {
                        accessToken: tokenResult.token,
                        refreshToken: refreshTokenResult.refreshToken,
                        expiresIn: tokenResult.expiresIn
                    },
                    authMethod: 'password'
                };
            }

            return {
                success: false,
                error: 'Invalid authentication method',
                code: 'INVALID_AUTH_METHOD'
            };

        } catch (error) {
            this.logger.error('Authentication failed:', error);
            
            await this.auditLogger.logError(
                'authentication_error',
                error.message,
                null,
                error.stack,
                sessionData
            );

            return {
                success: false,
                error: 'Authentication system error',
                code: 'AUTH_SYSTEM_ERROR'
            };
        }
    }

    /**
     * Logout user
     */
    async logoutUser(userId, sessionId = null, reason = 'user_logout') {
        try {
            // Revoke all user sessions if no specific session
            if (sessionId) {
                await this.sessionManager.terminateSession(sessionId, reason);
            } else {
                await this.sessionManager.terminateAllUserSessions(userId, reason);
            }

            // Log logout
            await this.auditLogger.logAuthentication(
                'logout',
                userId,
                true,
                { reason: reason, session_id: sessionId }
            );

            return { success: true };

        } catch (error) {
            this.logger.error('Logout failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check user permissions
     */
    async checkPermission(userId, permission) {
        return this.roleManager.hasPermission(userId, permission);
    }

    /**
     * Get security status
     */
    async getSecurityStatus() {
        try {
            const [
                tokenStats,
                apiKeyStats,
                sessionStats,
                rateLimitStats,
                auditStats
            ] = await Promise.all([
                this.jwtManager.getTokenStats(),
                this.apiKeyManager.getAPIKeyStats(),
                this.sessionManager.getSessionStats(),
                this.rateLimiter.getStats(),
                this.auditLogger.getStatistics('24h')
            ]);

            return {
                success: true,
                status: {
                    tokens: tokenStats,
                    apiKeys: apiKeyStats.success ? apiKeyStats.stats : null,
                    sessions: sessionStats.success ? sessionStats.stats : null,
                    rateLimit: rateLimitStats.success ? rateLimitStats.stats : null,
                    audit: auditStats.success ? auditStats : null,
                    encryption: this.encryptionConfig.getStats(),
                    configuration: {
                        environment: this.securityConfig.get('environment'),
                        jwtConfigured: !!this.securityConfig.get('jwt.secret'),
                        rateLimitEnabled: this.securityConfig.get('rateLimit.enabled'),
                        auditEnabled: this.securityConfig.get('audit.enabled')
                    }
                }
            };

        } catch (error) {
            this.logger.error('Failed to get security status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Perform security cleanup
     */
    async performCleanup() {
        try {
            const results = await Promise.allSettled([
                this.jwtManager.cleanup(),
                this.apiKeyManager.cleanup(),
                this.sessionManager.cleanup(),
                this.rateLimiter.cleanup(),
                this.auditLogger.cleanup()
            ]);

            const summary = {
                jwt: results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason.message },
                apiKeys: results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason.message },
                sessions: results[2].status === 'fulfilled' ? results[2].value : { error: results[2].reason.message },
                rateLimit: results[3].status === 'fulfilled' ? results[3].value : { error: results[3].reason.message },
                audit: results[4].status === 'fulfilled' ? results[4].value : { error: results[4].reason.message }
            };

            this.logger.info('Security cleanup completed', summary);
            
            return {
                success: true,
                summary
            };

        } catch (error) {
            this.logger.error('Security cleanup failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all managers for external access
     */
    getManagers() {
        return {
            jwt: this.jwtManager,
            apiKey: this.apiKeyManager,
            role: this.roleManager,
            session: this.sessionManager,
            audit: this.auditLogger,
            encryption: this.encryptionConfig,
            config: this.securityConfig
        };
    }

    /**
     * Get all middleware for external access
     */
    getMiddleware() {
        return {
            auth: this.authMiddleware,
            rateLimit: this.rateLimiter,
            headers: this.securityHeaders,
            validation: this.inputValidator
        };
    }
}

export default SecurityManager;

