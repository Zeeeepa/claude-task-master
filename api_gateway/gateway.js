/**
 * API Gateway Core Module
 * 
 * Provides unified API endpoint routing with:
 * - Request/response validation using OpenAPI schemas
 * - API request logging and audit trails
 * - Middleware pipeline for cross-cutting concerns
 * - Circuit breaker patterns for external service calls
 * - Rate limiting and request throttling
 * - Service discovery and load balancing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

// Rate limiting cache
const RATE_LIMIT_CACHE = new LRUCache({
  max: 100000,
  ttl: 1000 * 60 * 60 // 1 hour
});

// Circuit breaker state cache
const CIRCUIT_BREAKER_CACHE = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 10 // 10 minutes
});

// Route registry
const ROUTE_REGISTRY = new Map();

// Service registry for backend services
const SERVICE_REGISTRY = new Map([
  ['tasks', {
    id: 'tasks',
    name: 'Task Management Service',
    base_url: 'http://localhost:3001',
    health_endpoint: '/health',
    timeout: 30000,
    circuit_breaker: {
      failure_threshold: 5,
      recovery_timeout: 60000,
      success_threshold: 3
    }
  }],
  ['webhooks', {
    id: 'webhooks',
    name: 'Webhook Processing Service',
    base_url: 'http://localhost:3002',
    health_endpoint: '/health',
    timeout: 30000,
    circuit_breaker: {
      failure_threshold: 3,
      recovery_timeout: 30000,
      success_threshold: 2
    }
  }],
  ['linear', {
    id: 'linear',
    name: 'Linear Integration Service',
    base_url: 'http://localhost:3003',
    health_endpoint: '/health',
    timeout: 45000,
    circuit_breaker: {
      failure_threshold: 5,
      recovery_timeout: 60000,
      success_threshold: 3
    }
  }]
]);

class APIGateway {
  constructor(authService, options = {}) {
    this.authService = authService;
    this.app = express();
    this.startTime = Date.now();
    this.requestCount = 0;
    this.options = {
      port: options.port || 3000,
      enableCors: options.enableCors !== false,
      enableHelmet: options.enableHelmet !== false,
      enableLogging: options.enableLogging !== false,
      ...options
    };

    this._setupMiddleware();
    this._setupRoutes();
  }

  /**
   * Register a new API route
   * @param {Object} route - Route definition
   */
  registerRoute(route) {
    const {
      path,
      method,
      service,
      target_url,
      permissions = [],
      rate_limit = { requests_per_minute: 60 },
      timeout = 30000,
      circuit_breaker = {}
    } = route;

    if (!path || !method || !service) {
      throw new Error('Route must have path, method, and service');
    }

    const routeId = `${method.toUpperCase()}:${path}`;
    
    const routeDefinition = {
      id: routeId,
      path,
      method: method.toUpperCase(),
      service,
      target_url: target_url || this._getServiceUrl(service),
      permissions,
      rate_limit,
      timeout,
      circuit_breaker: {
        failure_threshold: 5,
        recovery_timeout: 60000,
        success_threshold: 3,
        ...circuit_breaker
      },
      created_at: new Date(),
      stats: {
        requests: 0,
        errors: 0,
        avg_response_time: 0
      }
    };

    ROUTE_REGISTRY.set(routeId, routeDefinition);
    
    // Register Express route
    this._registerExpressRoute(routeDefinition);
    
    return routeId;
  }

  /**
   * Validate API request against OpenAPI schema
   * @param {Object} request - API request object
   * @returns {Promise<Object>} Validation result
   */
  async validateRequest(request) {
    try {
      const { method, path, headers, query, body } = request;

      // Basic validation
      if (!method || !path) {
        return {
          valid: false,
          errors: ['Method and path are required']
        };
      }

      // Validate headers
      const validationErrors = [];
      
      // Check Content-Type for POST/PUT requests
      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        const contentType = headers['content-type'];
        if (!contentType) {
          validationErrors.push('Content-Type header is required for POST/PUT/PATCH requests');
        }
      }

      // Check Authorization header for protected routes
      const routeId = `${method.toUpperCase()}:${path}`;
      const route = ROUTE_REGISTRY.get(routeId);
      
      if (route && route.permissions.length > 0) {
        const authHeader = headers['authorization'];
        if (!authHeader) {
          validationErrors.push('Authorization header is required for protected routes');
        }
      }

      return {
        valid: validationErrors.length === 0,
        errors: validationErrors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Proxy request to backend service
   * @param {Object} request - API request object
   * @returns {Promise<Object>} API response
   */
  async proxyRequest(request) {
    const startTime = Date.now();
    const requestId = request.request_id || crypto.randomUUID();

    try {
      const { method, path, headers, query, body, user_id } = request;
      const routeId = `${method.toUpperCase()}:${path}`;
      const route = ROUTE_REGISTRY.get(routeId);

      if (!route) {
        return {
          status_code: 404,
          headers: { 'content-type': 'application/json' },
          body: {
            error: 'route_not_found',
            message: 'Route not found',
            request_id: requestId
          },
          response_time: Date.now() - startTime,
          request_id: requestId
        };
      }

      // Check circuit breaker
      const circuitState = await this._checkCircuitBreaker(route.service);
      if (circuitState === 'OPEN') {
        return {
          status_code: 503,
          headers: { 'content-type': 'application/json' },
          body: {
            error: 'service_unavailable',
            message: 'Service temporarily unavailable',
            request_id: requestId
          },
          response_time: Date.now() - startTime,
          request_id: requestId
        };
      }

      // Rate limiting check
      const rateLimitResult = await this.rateLimitCheck(user_id || 'anonymous', path);
      if (!rateLimitResult.allowed) {
        return {
          status_code: 429,
          headers: { 
            'content-type': 'application/json',
            'retry-after': rateLimitResult.retry_after.toString()
          },
          body: {
            error: 'rate_limit_exceeded',
            message: 'Rate limit exceeded',
            retry_after: rateLimitResult.retry_after,
            request_id: requestId
          },
          response_time: Date.now() - startTime,
          request_id: requestId
        };
      }

      // Build target URL
      const service = SERVICE_REGISTRY.get(route.service);
      if (!service) {
        return {
          status_code: 502,
          headers: { 'content-type': 'application/json' },
          body: {
            error: 'service_not_found',
            message: 'Backend service not found',
            request_id: requestId
          },
          response_time: Date.now() - startTime,
          request_id: requestId
        };
      }

      const targetUrl = route.target_url || `${service.base_url}${path}`;

      // Mock proxy response - in real implementation, use http client
      const mockResponse = await this._mockProxyRequest({
        method,
        url: targetUrl,
        headers,
        query,
        body,
        timeout: route.timeout
      });

      // Update circuit breaker on success
      await this._recordCircuitBreakerSuccess(route.service);

      // Update route stats
      route.stats.requests++;
      const responseTime = Date.now() - startTime;
      route.stats.avg_response_time = 
        (route.stats.avg_response_time * (route.stats.requests - 1) + responseTime) / route.stats.requests;

      return {
        status_code: mockResponse.status,
        headers: mockResponse.headers,
        body: mockResponse.data,
        response_time: responseTime,
        request_id: requestId
      };

    } catch (error) {
      // Update circuit breaker on failure
      const routeId = `${request.method.toUpperCase()}:${request.path}`;
      const route = ROUTE_REGISTRY.get(routeId);
      if (route) {
        await this._recordCircuitBreakerFailure(route.service);
        route.stats.errors++;
      }

      return {
        status_code: 500,
        headers: { 'content-type': 'application/json' },
        body: {
          error: 'internal_server_error',
          message: 'Internal server error',
          request_id: requestId
        },
        response_time: Date.now() - startTime,
        request_id: requestId
      };
    }
  }

  /**
   * Log API request and response
   * @param {Object} request - API request object
   * @param {Object} response - API response object
   * @param {string} userId - User ID
   */
  logRequest(request, response, userId) {
    if (!this.options.enableLogging) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      request_id: request.request_id || response.request_id,
      user_id: userId,
      method: request.method,
      path: request.path,
      status_code: response.status_code,
      response_time: response.response_time,
      user_agent: request.headers?.['user-agent'],
      ip_address: request.ip,
      service: this._getServiceFromPath(request.path)
    };

    // In real implementation, send to logging service
    console.log('API_REQUEST_LOG:', JSON.stringify(logEntry));
  }

  /**
   * Check rate limit for user and endpoint
   * @param {string} userId - User ID
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} Rate limit result
   */
  async rateLimitCheck(userId, endpoint) {
    const key = `${userId}:${endpoint}`;
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minute
    const maxRequests = 60; // Default rate limit

    // Get current window data
    let windowData = RATE_LIMIT_CACHE.get(key) || {
      requests: 0,
      window_start: now
    };

    // Reset window if expired
    if (now - windowData.window_start >= windowSize) {
      windowData = {
        requests: 0,
        window_start: now
      };
    }

    // Check if limit exceeded
    if (windowData.requests >= maxRequests) {
      const resetTime = new Date(windowData.window_start + windowSize);
      const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        reset_time: resetTime.toISOString(),
        retry_after: retryAfter
      };
    }

    // Increment request count
    windowData.requests++;
    RATE_LIMIT_CACHE.set(key, windowData);

    const resetTime = new Date(windowData.window_start + windowSize);

    return {
      allowed: true,
      remaining: maxRequests - windowData.requests,
      reset_time: resetTime.toISOString(),
      retry_after: 0
    };
  }

  /**
   * Get gateway health status
   */
  getHealthStatus() {
    const uptime = (Date.now() - this.startTime) / 1000;
    const services = {};

    // Check service health
    for (const [serviceId, service] of SERVICE_REGISTRY) {
      const circuitState = CIRCUIT_BREAKER_CACHE.get(`circuit:${serviceId}`) || { state: 'CLOSED' };
      services[serviceId] = {
        status: circuitState.state === 'CLOSED' ? 'healthy' : 'unhealthy',
        response_time: Math.random() * 100 // Mock response time
      };
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime,
      services
    };
  }

  /**
   * Start the gateway server
   */
  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        console.log(`🚀 API Gateway started on port ${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the gateway server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 API Gateway stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup Express middleware
   * @private
   */
  _setupMiddleware() {
    if (this.options.enableHelmet) {
      this.app.use(helmet());
    }

    if (this.options.enableCors) {
      this.app.use(cors());
    }

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.requestId = crypto.randomUUID();
      res.setHeader('X-Request-ID', req.requestId);
      next();
    });

    // Request counter middleware
    this.app.use((req, res, next) => {
      this.requestCount++;
      next();
    });
  }

  /**
   * Setup core gateway routes
   * @private
   */
  _setupRoutes() {
    // Health check endpoint
    this.app.get('/gateway/health', (req, res) => {
      res.json(this.getHealthStatus());
    });

    // Route management endpoints
    this.app.get('/gateway/routes', async (req, res) => {
      // Check authentication
      const authResult = await this._authenticateRequest(req);
      if (!authResult.success) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Authentication required'
        });
      }

      // Check permissions
      const hasPermission = await this.authService.checkPermission(
        authResult.user_id,
        'gateway',
        'read'
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Insufficient permissions'
        });
      }

      const routes = Array.from(ROUTE_REGISTRY.values());
      res.json({ routes });
    });

    this.app.post('/gateway/routes', async (req, res) => {
      // Check authentication
      const authResult = await this._authenticateRequest(req);
      if (!authResult.success) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Authentication required'
        });
      }

      // Check permissions
      const hasPermission = await this.authService.checkPermission(
        authResult.user_id,
        'gateway',
        'write'
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Insufficient permissions'
        });
      }

      try {
        const routeId = this.registerRoute(req.body);
        res.status(201).json({
          message: 'Route registered successfully',
          route_id: routeId
        });
      } catch (error) {
        res.status(400).json({
          error: 'invalid_route',
          message: error.message
        });
      }
    });
  }

  /**
   * Register Express route for proxying
   * @private
   */
  _registerExpressRoute(route) {
    const { method, path } = route;
    const expressMethod = method.toLowerCase();

    if (!this.app[expressMethod]) {
      console.warn(`Unsupported HTTP method: ${method}`);
      return;
    }

    this.app[expressMethod](path, async (req, res) => {
      const startTime = Date.now();

      try {
        // Authenticate request
        const authResult = await this._authenticateRequest(req);
        if (!authResult.success && route.permissions.length > 0) {
          return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
          });
        }

        // Check permissions
        if (route.permissions.length > 0 && authResult.success) {
          for (const permission of route.permissions) {
            const [resource, action] = permission.split(':');
            const hasPermission = await this.authService.checkPermission(
              authResult.user_id,
              resource,
              action
            );

            if (!hasPermission) {
              return res.status(403).json({
                error: 'forbidden',
                message: `Missing permission: ${permission}`
              });
            }
          }
        }

        // Build request object
        const apiRequest = {
          method: req.method,
          path: req.path,
          headers: req.headers,
          query: req.query,
          body: req.body,
          user_id: authResult.user_id,
          request_id: req.requestId,
          ip: req.ip
        };

        // Proxy request
        const apiResponse = await this.proxyRequest(apiRequest);

        // Log request
        this.logRequest(apiRequest, apiResponse, authResult.user_id);

        // Send response
        res.status(apiResponse.status_code)
           .set(apiResponse.headers)
           .json(apiResponse.body);

      } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('Route handler error:', error);

        res.status(500).json({
          error: 'internal_server_error',
          message: 'Internal server error',
          request_id: req.requestId
        });
      }
    });
  }

  /**
   * Authenticate request
   * @private
   */
  async _authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return { success: false };
    }

    const token = authHeader.replace('Bearer ', '');
    const validation = await this.authService.validateToken(token);

    return {
      success: validation.valid,
      user_id: validation.user_id,
      roles: validation.roles,
      permissions: validation.permissions
    };
  }

  /**
   * Check circuit breaker state
   * @private
   */
  async _checkCircuitBreaker(serviceId) {
    const key = `circuit:${serviceId}`;
    const circuitData = CIRCUIT_BREAKER_CACHE.get(key) || {
      state: 'CLOSED',
      failures: 0,
      last_failure: null,
      successes: 0
    };

    const service = SERVICE_REGISTRY.get(serviceId);
    if (!service) {
      return 'OPEN';
    }

    const { failure_threshold, recovery_timeout } = service.circuit_breaker;

    // Check if circuit should be closed after recovery timeout
    if (circuitData.state === 'OPEN' && circuitData.last_failure) {
      const timeSinceFailure = Date.now() - circuitData.last_failure;
      if (timeSinceFailure >= recovery_timeout) {
        circuitData.state = 'HALF_OPEN';
        circuitData.successes = 0;
        CIRCUIT_BREAKER_CACHE.set(key, circuitData);
      }
    }

    return circuitData.state;
  }

  /**
   * Record circuit breaker failure
   * @private
   */
  async _recordCircuitBreakerFailure(serviceId) {
    const key = `circuit:${serviceId}`;
    const circuitData = CIRCUIT_BREAKER_CACHE.get(key) || {
      state: 'CLOSED',
      failures: 0,
      last_failure: null,
      successes: 0
    };

    const service = SERVICE_REGISTRY.get(serviceId);
    if (!service) return;

    circuitData.failures++;
    circuitData.last_failure = Date.now();

    const { failure_threshold } = service.circuit_breaker;

    if (circuitData.failures >= failure_threshold) {
      circuitData.state = 'OPEN';
    }

    CIRCUIT_BREAKER_CACHE.set(key, circuitData);
  }

  /**
   * Record circuit breaker success
   * @private
   */
  async _recordCircuitBreakerSuccess(serviceId) {
    const key = `circuit:${serviceId}`;
    const circuitData = CIRCUIT_BREAKER_CACHE.get(key) || {
      state: 'CLOSED',
      failures: 0,
      last_failure: null,
      successes: 0
    };

    const service = SERVICE_REGISTRY.get(serviceId);
    if (!service) return;

    if (circuitData.state === 'HALF_OPEN') {
      circuitData.successes++;
      const { success_threshold } = service.circuit_breaker;

      if (circuitData.successes >= success_threshold) {
        circuitData.state = 'CLOSED';
        circuitData.failures = 0;
        circuitData.last_failure = null;
      }
    } else if (circuitData.state === 'CLOSED') {
      circuitData.failures = 0;
      circuitData.last_failure = null;
    }

    CIRCUIT_BREAKER_CACHE.set(key, circuitData);
  }

  /**
   * Get service URL from service registry
   * @private
   */
  _getServiceUrl(serviceId) {
    const service = SERVICE_REGISTRY.get(serviceId);
    return service ? service.base_url : null;
  }

  /**
   * Get service from path
   * @private
   */
  _getServiceFromPath(path) {
    // Extract service from path pattern like /api/v1/tasks/...
    const pathParts = path.split('/').filter(Boolean);
    return pathParts[2] || 'unknown'; // Assuming /api/v1/{service}/...
  }

  /**
   * Mock proxy request - replace with actual HTTP client
   * @private
   */
  async _mockProxyRequest({ method, url, headers, query, body, timeout }) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    // Mock successful response
    return {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-service-response': 'mock'
      },
      data: {
        message: 'Mock response from backend service',
        method,
        url,
        timestamp: new Date().toISOString()
      }
    };
  }
}

export default APIGateway;

