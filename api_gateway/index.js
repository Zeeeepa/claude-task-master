/**
 * API Gateway Main Module
 * 
 * Main entry point for the API Gateway that provides:
 * - Core authentication and authorization
 * - Request routing and proxying
 * - Rate limiting and circuit breakers
 * - Comprehensive logging and monitoring
 * - Mock implementations for immediate testing
 */

import express from 'express';
import AuthenticationService from '../auth/authentication-service.js';
import APIGateway from './gateway.js';
import {
  createAuthMiddleware,
  requirePermissions,
  requireRoles,
  serviceAuthMiddleware,
  requestContextMiddleware,
  errorHandlerMiddleware,
  validateRequestMiddleware
} from '../middleware/auth-middleware.js';

/**
 * Core API Gateway functions as specified in the requirements
 */

/**
 * Authenticate user with credentials
 * @param {Object} credentials - User credentials
 * @returns {Promise<Object>} Authentication result
 */
export async function authenticate_user(credentials) {
  const authService = new AuthenticationService();
  return await authService.authenticate(credentials);
}

/**
 * Validate API token
 * @param {string} token - JWT token to validate
 * @returns {Promise<Object>} Token validation result
 */
export async function validate_api_token(token) {
  const authService = new AuthenticationService();
  return await authService.validateToken(token);
}

/**
 * Check user permission for resource and action
 * @param {string} user_id - User ID
 * @param {string} resource - Resource identifier
 * @param {string} action - Action identifier
 * @returns {Promise<boolean>} Permission granted
 */
export async function check_user_permission(user_id, resource, action) {
  const authService = new AuthenticationService();
  return await authService.checkPermission(user_id, resource, action);
}

/**
 * Register API route with the gateway
 * @param {string} path - Route path
 * @param {Function} handler - Route handler function
 * @param {Array<string>} permissions - Required permissions
 * @returns {string} Route ID
 */
export function register_api_route(path, handler, permissions = []) {
  // This would be called during gateway initialization
  // For now, return a mock route ID
  const routeId = `route_${Date.now()}`;
  console.log(`Registered route: ${path} with permissions: ${permissions.join(', ')}`);
  return routeId;
}

/**
 * Proxy API request to backend service
 * @param {Object} request - API request object
 * @returns {Promise<Object>} API response
 */
export async function proxy_api_request(request) {
  const authService = new AuthenticationService();
  const gateway = new APIGateway(authService);
  return await gateway.proxyRequest(request);
}

/**
 * Log API access for audit trails
 * @param {Object} request - API request object
 * @param {Object} response - API response object
 * @param {string} user_id - User ID
 */
export function log_api_access(request, response, user_id) {
  const authService = new AuthenticationService();
  const gateway = new APIGateway(authService);
  gateway.logRequest(request, response, user_id);
}

/**
 * Check rate limit for user and endpoint
 * @param {string} user_id - User ID
 * @param {string} endpoint - API endpoint
 * @returns {Promise<Object>} Rate limit result
 */
export async function rate_limit_check(user_id, endpoint) {
  const authService = new AuthenticationService();
  const gateway = new APIGateway(authService);
  return await gateway.rateLimitCheck(user_id, endpoint);
}

/**
 * Create and configure API Gateway instance
 * @param {Object} options - Gateway configuration options
 * @returns {Object} Configured gateway instance with Express app
 */
export function createAPIGateway(options = {}) {
  const authService = new AuthenticationService(options.auth);
  const gateway = new APIGateway(authService, options.gateway);

  // Setup authentication routes
  setupAuthRoutes(gateway.app, authService);

  // Setup middleware
  setupMiddleware(gateway.app, authService, options.middleware);

  // Register default routes
  registerDefaultRoutes(gateway);

  return {
    gateway,
    authService,
    app: gateway.app,
    start: () => gateway.start(),
    stop: () => gateway.stop()
  };
}

/**
 * Setup authentication routes
 * @private
 */
function setupAuthRoutes(app, authService) {
  // Login endpoint
  app.post('/auth/login', async (req, res) => {
    try {
      const result = await authService.authenticate(req.body);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      res.status(500).json({
        error: 'authentication_error',
        message: error.message,
        request_id: req.requestId
      });
    }
  });

  // Token refresh endpoint
  app.post('/auth/refresh', async (req, res) => {
    try {
      const { refresh_token } = req.body;
      
      if (!refresh_token) {
        return res.status(400).json({
          error: 'missing_refresh_token',
          message: 'Refresh token is required'
        });
      }

      const result = await authService.refreshToken(refresh_token);
      res.json(result);
    } catch (error) {
      res.status(401).json({
        error: 'token_refresh_failed',
        message: error.message,
        request_id: req.requestId
      });
    }
  });

  // Logout endpoint
  app.post('/auth/logout', 
    createAuthMiddleware(authService),
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          await authService.revokeToken(token);
        }

        res.json({ message: 'Successfully logged out' });
      } catch (error) {
        res.status(500).json({
          error: 'logout_error',
          message: error.message,
          request_id: req.requestId
        });
      }
    }
  );

  // Token validation endpoint
  app.get('/auth/validate',
    createAuthMiddleware(authService),
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader.replace('Bearer ', '');
        const validation = await authService.validateToken(token);
        
        res.json(validation);
      } catch (error) {
        res.status(500).json({
          error: 'validation_error',
          message: error.message,
          request_id: req.requestId
        });
      }
    }
  );

  // User permissions endpoint
  app.get('/auth/permissions',
    createAuthMiddleware(authService),
    async (req, res) => {
      try {
        res.json({
          user_id: req.user.id,
          roles: req.user.roles,
          permissions: req.user.permissions
        });
      } catch (error) {
        res.status(500).json({
          error: 'permissions_error',
          message: error.message,
          request_id: req.requestId
        });
      }
    }
  );
}

/**
 * Setup middleware pipeline
 * @private
 */
function setupMiddleware(app, authService, middlewareOptions = {}) {
  // Request context middleware (must be first)
  app.use(requestContextMiddleware());

  // Auth middleware for protected routes
  const authMiddleware = createAuthMiddleware(authService, {
    skipPaths: [
      '/gateway/health',
      '/auth/login',
      '/auth/refresh',
      '/docs',
      '/openapi.yaml'
    ],
    requireAuth: false, // Let individual routes decide
    ...middlewareOptions.auth
  });

  app.use(authMiddleware);

  // Error handling middleware (must be last)
  app.use(errorHandlerMiddleware());
}

/**
 * Register default API routes
 * @private
 */
function registerDefaultRoutes(gateway) {
  // Register sample routes for testing
  gateway.registerRoute({
    path: '/api/v1/tasks',
    method: 'GET',
    service: 'tasks',
    permissions: ['tasks:read'],
    rate_limit: { requests_per_minute: 100 }
  });

  gateway.registerRoute({
    path: '/api/v1/tasks',
    method: 'POST',
    service: 'tasks',
    permissions: ['tasks:write'],
    rate_limit: { requests_per_minute: 50 }
  });

  gateway.registerRoute({
    path: '/api/v1/webhooks/process',
    method: 'POST',
    service: 'webhooks',
    permissions: ['webhooks:process'],
    rate_limit: { requests_per_minute: 200 }
  });

  gateway.registerRoute({
    path: '/api/v1/linear/sync',
    method: 'POST',
    service: 'linear',
    permissions: ['linear:sync'],
    rate_limit: { requests_per_minute: 30 }
  });

  console.log('✅ Default API routes registered');
}

/**
 * Mock implementations for immediate testing
 */
export const MockImplementations = {
  /**
   * Mock authentication service with predefined users
   */
  createMockAuthService() {
    return new AuthenticationService({
      jwtSecret: 'mock-jwt-secret',
      jwtRefreshSecret: 'mock-refresh-secret'
    });
  },

  /**
   * Mock API gateway with sample routes
   */
  createMockGateway() {
    const authService = this.createMockAuthService();
    const gateway = new APIGateway(authService, {
      port: 3000,
      enableLogging: true
    });

    // Register mock routes
    gateway.registerRoute({
      path: '/api/v1/mock/test',
      method: 'GET',
      service: 'mock',
      permissions: [],
      rate_limit: { requests_per_minute: 1000 }
    });

    return { gateway, authService };
  },

  /**
   * Sample API requests for testing
   */
  getSampleRequests() {
    return {
      login: {
        type: 'password',
        email: 'user@example.com',
        password: 'password123'
      },
      apiKeyLogin: {
        type: 'api_key',
        api_key: 'ak_1234567890abcdef'
      },
      serviceLogin: {
        type: 'service_token',
        service_token: 'st_ai_agent_1_secret',
        service_id: 'ai-agent-1'
      },
      proxyRequest: {
        method: 'GET',
        path: '/api/v1/tasks',
        headers: {
          'authorization': 'Bearer <token>',
          'content-type': 'application/json'
        },
        query: { limit: 10 },
        body: null,
        user_id: 'user_123'
      }
    };
  }
};

// Export all components
export {
  AuthenticationService,
  APIGateway,
  createAuthMiddleware,
  requirePermissions,
  requireRoles,
  serviceAuthMiddleware,
  requestContextMiddleware,
  errorHandlerMiddleware,
  validateRequestMiddleware
};

export default {
  createAPIGateway,
  MockImplementations,
  // Core functions
  authenticate_user,
  validate_api_token,
  check_user_permission,
  register_api_route,
  proxy_api_request,
  log_api_access,
  rate_limit_check
};

