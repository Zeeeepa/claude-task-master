/**
 * Authentication Middleware
 * 
 * Express middleware for handling authentication and authorization in the AI CI/CD system.
 * Supports JWT tokens, API keys, and role-based access control.
 */

import { JWTManager } from '../auth/jwt_manager.js';
import { APIKeyManager } from '../auth/api_key_manager.js';
import { RoleManager } from '../auth/role_manager.js';
import { SessionManager } from '../auth/session_manager.js';
import { SimpleLogger } from '../utils/simple_logger.js';

export class AuthMiddleware {
    constructor(config, database) {
        this.config = {
            jwt: {
                jwt_secret: config.jwt_secret || process.env.JWT_SECRET,
                issuer: config.issuer || 'ai-cicd-system',
                audience: config.audience || 'ai-cicd-users',
                token_expiry: config.token_expiry || '1h',
                ...config.jwt
            },
            apiKey: {
                keyPrefix: 'aics_',
                ...config.apiKey
            },
            session: {
                sessionTimeout: '24h',
                ...config.session
            },
            role: {
                defaultRole: 'user',
                ...config.role
            },
            ...config
        };

        this.db = database;
        this.logger = new SimpleLogger('AuthMiddleware');

        // Initialize managers
        this.jwtManager = new JWTManager(this.config.jwt, database);
        this.apiKeyManager = new APIKeyManager(database, this.config.apiKey);
        this.roleManager = new RoleManager(database, this.config.role);
        this.sessionManager = new SessionManager(database, this.config.session);
    }

    /**
     * Main authentication middleware
     */
    authenticate(options = {}) {
        const {
            optional = false,
            methods = ['jwt', 'apikey'], // Supported auth methods
            skipRevocationCheck = false
        } = options;

        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                const apiKey = req.headers['x-api-key'];
                const sessionToken = req.headers['x-session-token'];

                let authResult = null;

                // Try JWT authentication
                if (methods.includes('jwt') && authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    authResult = await this._authenticateJWT(token, skipRevocationCheck);
                    if (authResult.success) {
                        req.authMethod = 'jwt';
                    }
                }

                // Try API key authentication if JWT failed
                if (!authResult?.success && methods.includes('apikey') && apiKey) {
                    authResult = await this._authenticateAPIKey(apiKey);
                    if (authResult.success) {
                        req.authMethod = 'apikey';
                    }
                }

                // Try session authentication if others failed
                if (!authResult?.success && methods.includes('session') && sessionToken) {
                    authResult = await this._authenticateSession(sessionToken);
                    if (authResult.success) {
                        req.authMethod = 'session';
                    }
                }

                // Handle authentication result
                if (authResult?.success) {
                    req.user = authResult.user;
                    req.authData = authResult.authData;
                    
                    // Log successful authentication
                    await this._logSecurityEvent('authentication_success', 'info', req.user.id, {
                        method: req.authMethod,
                        ip_address: this._getClientIP(req),
                        user_agent: req.get('User-Agent')
                    });

                    return next();
                } else {
                    // Authentication failed
                    if (optional) {
                        req.user = null;
                        req.authMethod = null;
                        return next();
                    }

                    // Log failed authentication
                    await this._logSecurityEvent('authentication_failure', 'medium', null, {
                        attempted_methods: methods,
                        ip_address: this._getClientIP(req),
                        user_agent: req.get('User-Agent'),
                        error: authResult?.error || 'No valid authentication provided'
                    });

                    return res.status(401).json({
                        error: 'Authentication required',
                        message: authResult?.error || 'Valid authentication credentials required',
                        code: authResult?.code || 'AUTH_REQUIRED'
                    });
                }

            } catch (error) {
                this.logger.error('Authentication middleware error:', error);
                
                await this._logSecurityEvent('authentication_error', 'high', null, {
                    error: error.message,
                    ip_address: this._getClientIP(req),
                    user_agent: req.get('User-Agent')
                });

                return res.status(500).json({
                    error: 'Authentication system error',
                    message: 'Internal authentication error'
                });
            }
        };
    }

    /**
     * Authorization middleware - check permissions
     */
    authorize(requiredPermissions = [], options = {}) {
        const {
            requireAll = true, // If true, user must have ALL permissions; if false, ANY permission
            allowSuperuser = true // If true, superuser/admin bypasses permission checks
        } = options;

        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        message: 'User must be authenticated to access this resource'
                    });
                }

                // Check if user has required permissions
                let hasPermission = false;

                if (requiredPermissions.length === 0) {
                    // No specific permissions required, just need to be authenticated
                    hasPermission = true;
                } else {
                    if (requireAll) {
                        hasPermission = await this.roleManager.hasAllPermissions(req.user.id, requiredPermissions);
                    } else {
                        hasPermission = await this.roleManager.hasAnyPermission(req.user.id, requiredPermissions);
                    }

                    // Check for superuser bypass
                    if (!hasPermission && allowSuperuser) {
                        hasPermission = await this.roleManager.hasPermission(req.user.id, '*') ||
                                      await this.roleManager.hasPermission(req.user.id, 'system_admin');
                    }
                }

                if (!hasPermission) {
                    // Log permission denied
                    await this._logSecurityEvent('permission_denied', 'medium', req.user.id, {
                        required_permissions: requiredPermissions,
                        user_permissions: req.user.permissions || [],
                        resource: req.path,
                        method: req.method,
                        ip_address: this._getClientIP(req)
                    });

                    return res.status(403).json({
                        error: 'Insufficient permissions',
                        message: 'You do not have the required permissions to access this resource',
                        required: requiredPermissions,
                        code: 'INSUFFICIENT_PERMISSIONS'
                    });
                }

                next();

            } catch (error) {
                this.logger.error('Authorization middleware error:', error);
                return res.status(500).json({
                    error: 'Authorization system error',
                    message: 'Internal authorization error'
                });
            }
        };
    }

    /**
     * Role-based authorization middleware
     */
    requireRole(requiredRoles = [], options = {}) {
        const {
            allowHigherRoles = true // If true, higher roles can access lower role resources
        } = options;

        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        message: 'User must be authenticated to access this resource'
                    });
                }

                const userRole = req.user.role;
                let hasRole = false;

                if (requiredRoles.includes(userRole)) {
                    hasRole = true;
                } else if (allowHigherRoles) {
                    // Check if user has a higher role
                    const roleHierarchy = this.roleManager.getRoleHierarchy();
                    const userRoleLevel = roleHierarchy[userRole] || 0;
                    
                    for (const requiredRole of requiredRoles) {
                        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
                        if (userRoleLevel >= requiredRoleLevel) {
                            hasRole = true;
                            break;
                        }
                    }
                }

                if (!hasRole) {
                    await this._logSecurityEvent('role_access_denied', 'medium', req.user.id, {
                        required_roles: requiredRoles,
                        user_role: userRole,
                        resource: req.path,
                        method: req.method,
                        ip_address: this._getClientIP(req)
                    });

                    return res.status(403).json({
                        error: 'Insufficient role',
                        message: 'Your role does not have access to this resource',
                        required: requiredRoles,
                        current: userRole,
                        code: 'INSUFFICIENT_ROLE'
                    });
                }

                next();

            } catch (error) {
                this.logger.error('Role authorization middleware error:', error);
                return res.status(500).json({
                    error: 'Role authorization system error',
                    message: 'Internal role authorization error'
                });
            }
        };
    }

    /**
     * Authenticate using JWT token
     */
    async _authenticateJWT(token, skipRevocationCheck = false) {
        try {
            const validation = await this.jwtManager.validateToken(token);
            
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code
                };
            }

            // Get user details from database
            const userResult = await this.db.query(
                'SELECT id, username, email, role, permissions, is_active FROM users WHERE id = $1',
                [validation.userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = userResult.rows[0];
            if (!user.is_active) {
                return {
                    success: false,
                    error: 'User account is inactive',
                    code: 'USER_INACTIVE'
                };
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    permissions: JSON.parse(user.permissions || '[]')
                },
                authData: {
                    tokenId: validation.tokenId,
                    expiresAt: validation.expiresAt
                }
            };

        } catch (error) {
            this.logger.error('JWT authentication failed:', error);
            return {
                success: false,
                error: 'JWT authentication failed',
                code: 'JWT_AUTH_FAILED'
            };
        }
    }

    /**
     * Authenticate using API key
     */
    async _authenticateAPIKey(apiKey) {
        try {
            const validation = await this.apiKeyManager.validateAPIKey(apiKey);
            
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code
                };
            }

            return {
                success: true,
                user: {
                    id: validation.userId,
                    username: validation.username,
                    role: validation.role,
                    permissions: validation.permissions
                },
                authData: {
                    keyId: validation.keyId,
                    keyName: validation.keyName,
                    expiresAt: validation.expiresAt
                }
            };

        } catch (error) {
            this.logger.error('API key authentication failed:', error);
            return {
                success: false,
                error: 'API key authentication failed',
                code: 'APIKEY_AUTH_FAILED'
            };
        }
    }

    /**
     * Authenticate using session token
     */
    async _authenticateSession(sessionToken) {
        try {
            const validation = await this.sessionManager.validateSession(sessionToken);
            
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code
                };
            }

            // Get user details from database
            const userResult = await this.db.query(
                'SELECT id, username, email, role, permissions, is_active FROM users WHERE id = $1',
                [validation.userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = userResult.rows[0];

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    permissions: JSON.parse(user.permissions || '[]')
                },
                authData: {
                    sessionId: validation.sessionId,
                    expiresAt: validation.expiresAt
                }
            };

        } catch (error) {
            this.logger.error('Session authentication failed:', error);
            return {
                success: false,
                error: 'Session authentication failed',
                code: 'SESSION_AUTH_FAILED'
            };
        }
    }

    /**
     * Get client IP address
     */
    _getClientIP(req) {
        return req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'];
    }

    /**
     * Log security event
     */
    async _logSecurityEvent(eventType, severity, userId, eventData) {
        try {
            await this.db.query(
                'INSERT INTO security_events (event_type, severity, user_id, event_data) VALUES ($1, $2, $3, $4)',
                [eventType, severity, userId, JSON.stringify(eventData)]
            );
        } catch (error) {
            this.logger.error('Failed to log security event:', error);
        }
    }

    /**
     * Get authentication managers (for external use)
     */
    getManagers() {
        return {
            jwt: this.jwtManager,
            apiKey: this.apiKeyManager,
            role: this.roleManager,
            session: this.sessionManager
        };
    }
}

export default AuthMiddleware;

