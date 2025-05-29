/**
 * Unified Codegen Client with Enterprise Security Integration
 * Consolidates Codegen SDK integration with comprehensive security framework
 */

import { EventEmitter } from 'events';
import { AuthManager } from '../../security/auth_manager.js';
import { AuditLogger } from '../../security/audit_logger.js';
import { log } from '../../utils/simple_logger.js';

/**
 * Secure Codegen Client
 * Integrates Codegen SDK with enterprise security framework
 */
export class CodegenClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      api: {
        baseURL: config.api?.baseURL || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
        timeout: config.api?.timeout || 30000,
        enableMock: config.api?.enableMock || false
      },
      auth: {
        token: config.auth?.token || process.env.CODEGEN_API_KEY,
        orgId: config.auth?.orgId || process.env.CODEGEN_ORG_ID,
        validateOnInit: config.auth?.validateOnInit !== false
      },
      security: {
        enableAuditLogging: config.security?.enableAuditLogging !== false,
        enableEncryption: config.security?.enableEncryption !== false,
        validateResponses: config.security?.validateResponses !== false
      },
      rateLimiting: {
        enabled: config.rateLimiting?.enabled !== false,
        requestsPerSecond: config.rateLimiting?.requestsPerSecond || 2,
        requestsPerMinute: config.rateLimiting?.requestsPerMinute || 10,
        requestsPerHour: config.rateLimiting?.requestsPerHour || 100
      },
      retry: {
        enabled: config.retry?.enabled !== false,
        maxRetries: config.retry?.maxRetries || 3,
        baseDelay: config.retry?.baseDelay || 1000,
        maxDelay: config.retry?.maxDelay || 10000
      },
      ...config
    };

    // Initialize security components
    this.authManager = new AuthManager(this.config.auth);
    this.auditLogger = new AuditLogger(this.config.security);
    this.logger = new SimpleLogger('CodegenClient');

    // Initialize client state
    this.isInitialized = false;
    this.requestQueue = [];
    this.activeRequests = new Map();
    this.rateLimitState = {
      requests: [],
      lastReset: Date.now()
    };

    this.logger.info('Secure CodegenClient initialized with enterprise security framework');
  }

  /**
   * Initialize the client with security validation
   */
  async initialize() {
    try {
      // Validate configuration
      await this.validateConfiguration();
      
      // Initialize security components
      await this.authManager.initialize();
      await this.auditLogger.initialize();
      
      // Validate API credentials if required
      if (this.config.auth.validateOnInit) {
        await this.validateCredentials();
      }
      
      this.isInitialized = true;
      
      this.auditLogger.logSecurityEvent('codegen_client_initialized', {
        orgId: this.config.auth.orgId,
        baseURL: this.config.api.baseURL,
        securityEnabled: this.config.security.enableAuditLogging
      });
      
      this.logger.info('CodegenClient initialization completed');
      this.emit('initialized');
      
    } catch (error) {
      this.logger.error('CodegenClient initialization failed', { error: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Validate client configuration
   */
  async validateConfiguration() {
    const errors = [];
    
    if (!this.config.auth.token) {
      errors.push('Codegen API token is required');
    }
    
    if (!this.config.auth.orgId) {
      errors.push('Codegen organization ID is required');
    }
    
    if (!this.config.api.baseURL) {
      errors.push('Codegen API base URL is required');
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Validate API credentials
   */
  async validateCredentials() {
    try {
      const response = await this.makeSecureRequest('GET', '/health', null, {
        skipRateLimit: true,
        skipAudit: true
      });
      
      if (!response.success) {
        throw new Error('API credentials validation failed');
      }
      
      this.logger.info('API credentials validated successfully');
      
    } catch (error) {
      this.logger.error('API credentials validation failed', { error: error.message });
      throw new Error(`Credential validation failed: ${error.message}`);
    }
  }

  /**
   * Create a PR with comprehensive security and audit logging
   */
  async createPR(request, userContext = {}) {
    try {
      this.validateInitialized();
      
      // Validate and sanitize request
      const sanitizedRequest = await this.validateAndSanitizeRequest(request);
      
      // Check rate limits
      await this.checkRateLimit();
      
      // Log request initiation
      const requestId = this.generateRequestId();
      this.auditLogger.logSecurityEvent('codegen_pr_request_initiated', {
        requestId,
        userId: userContext.userId,
        repository: sanitizedRequest.repository,
        description: sanitizedRequest.description?.substring(0, 100) + '...',
        timestamp: new Date().toISOString()
      });
      
      // Make secure API request
      const response = await this.makeSecureRequest('POST', '/pr/create', sanitizedRequest, {
        requestId,
        userContext
      });
      
      // Validate response
      const validatedResponse = await this.validateResponse(response);
      
      // Log successful completion
      this.auditLogger.logSecurityEvent('codegen_pr_request_completed', {
        requestId,
        userId: userContext.userId,
        success: validatedResponse.success,
        prUrl: validatedResponse.prUrl,
        taskId: validatedResponse.taskId,
        processingTime: validatedResponse.metadata?.responseTime
      });
      
      this.logger.info('PR creation request completed', {
        requestId,
        success: validatedResponse.success,
        taskId: validatedResponse.taskId
      });
      
      this.emit('prCreated', {
        requestId,
        response: validatedResponse,
        userContext
      });
      
      return validatedResponse;
      
    } catch (error) {
      this.logger.error('PR creation failed', { 
        error: error.message,
        userId: userContext.userId 
      });
      
      this.auditLogger.logSecurityEvent('codegen_pr_request_failed', {
        userId: userContext.userId,
        error: error.message,
        repository: request?.repository,
        timestamp: new Date().toISOString()
      });
      
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get task status with security validation
   */
  async getTaskStatus(taskId, userContext = {}) {
    try {
      this.validateInitialized();
      
      // Validate task ID
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('Valid task ID is required');
      }
      
      // Check rate limits
      await this.checkRateLimit();
      
      // Make secure API request
      const response = await this.makeSecureRequest('GET', `/tasks/${taskId}/status`, null, {
        userContext
      });
      
      // Validate response
      const validatedResponse = await this.validateResponse(response);
      
      this.auditLogger.logSecurityEvent('codegen_task_status_checked', {
        taskId,
        userId: userContext.userId,
        status: validatedResponse.status,
        timestamp: new Date().toISOString()
      });
      
      return validatedResponse;
      
    } catch (error) {
      this.logger.error('Task status check failed', { 
        error: error.message,
        taskId,
        userId: userContext.userId 
      });
      
      throw error;
    }
  }

  /**
   * Cancel a task with security validation
   */
  async cancelTask(taskId, userContext = {}) {
    try {
      this.validateInitialized();
      
      // Validate task ID
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('Valid task ID is required');
      }
      
      // Make secure API request
      const response = await this.makeSecureRequest('POST', `/tasks/${taskId}/cancel`, null, {
        userContext
      });
      
      this.auditLogger.logSecurityEvent('codegen_task_cancelled', {
        taskId,
        userId: userContext.userId,
        timestamp: new Date().toISOString()
      });
      
      this.logger.info('Task cancelled successfully', { taskId });
      
      return response;
      
    } catch (error) {
      this.logger.error('Task cancellation failed', { 
        error: error.message,
        taskId,
        userId: userContext.userId 
      });
      
      throw error;
    }
  }

  /**
   * Make a secure API request with comprehensive security measures
   */
  async makeSecureRequest(method, endpoint, data = null, options = {}) {
    const requestId = options.requestId || this.generateRequestId();
    const startTime = Date.now();
    
    try {
      // Prepare request headers with security
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.auth.token}`,
        'X-Org-ID': this.config.auth.orgId,
        'X-Request-ID': requestId,
        'User-Agent': 'CodegenClient/1.0 (Enterprise Security Framework)'
      };
      
      // Add user context if available
      if (options.userContext?.userId) {
        headers['X-User-ID'] = options.userContext.userId;
      }
      
      // Prepare request configuration
      const requestConfig = {
        method,
        headers,
        timeout: this.config.api.timeout
      };
      
      if (data) {
        requestConfig.body = JSON.stringify(data);
      }
      
      // Log request (if audit enabled and not skipped)
      if (this.config.security.enableAuditLogging && !options.skipAudit) {
        this.auditLogger.logSecurityEvent('codegen_api_request', {
          requestId,
          method,
          endpoint,
          userId: options.userContext?.userId,
          timestamp: new Date().toISOString()
        });
      }
      
      // Make the actual request
      const url = `${this.config.api.baseURL}${endpoint}`;
      const response = await fetch(url, requestConfig);
      
      // Parse response
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        throw new Error(`Failed to parse response: ${parseError.message}`);
      }
      
      // Check for API errors
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${responseData.error || response.statusText}`);
      }
      
      // Log successful response
      const responseTime = Date.now() - startTime;
      if (this.config.security.enableAuditLogging && !options.skipAudit) {
        this.auditLogger.logSecurityEvent('codegen_api_response', {
          requestId,
          statusCode: response.status,
          responseTime,
          userId: options.userContext?.userId,
          success: true
        });
      }
      
      // Add metadata to response
      responseData.metadata = {
        requestId,
        responseTime,
        timestamp: new Date().toISOString()
      };
      
      return responseData;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Log failed response
      if (this.config.security.enableAuditLogging && !options.skipAudit) {
        this.auditLogger.logSecurityEvent('codegen_api_error', {
          requestId,
          error: error.message,
          responseTime,
          userId: options.userContext?.userId,
          method,
          endpoint
        });
      }
      
      throw error;
    }
  }

  /**
   * Validate and sanitize request data
   */
  async validateAndSanitizeRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Request must be a valid object');
    }
    
    const sanitized = { ...request };
    
    // Validate required fields
    if (!sanitized.description || typeof sanitized.description !== 'string') {
      throw new Error('Description is required and must be a string');
    }
    
    if (!sanitized.repository || typeof sanitized.repository !== 'string') {
      throw new Error('Repository is required and must be a string');
    }
    
    // Sanitize description (remove potential security risks)
    sanitized.description = sanitized.description
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .trim();
    
    // Validate description length
    if (sanitized.description.length > 10000) {
      throw new Error('Description is too long (max 10000 characters)');
    }
    
    // Validate repository format
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(sanitized.repository)) {
      throw new Error('Repository must be in format "owner/repo"');
    }
    
    return sanitized;
  }

  /**
   * Validate API response
   */
  async validateResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response format');
    }
    
    // Check for required response fields
    if (typeof response.success !== 'boolean') {
      throw new Error('Response must include success field');
    }
    
    if (!response.success && !response.error) {
      throw new Error('Failed response must include error message');
    }
    
    return response;
  }

  /**
   * Check rate limits
   */
  async checkRateLimit() {
    if (!this.config.rateLimiting.enabled) {
      return;
    }
    
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    // Clean old requests
    this.rateLimitState.requests = this.rateLimitState.requests.filter(
      timestamp => now - timestamp < windowMs
    );
    
    // Check if we're over the limit
    if (this.rateLimitState.requests.length >= this.config.rateLimiting.requestsPerMinute) {
      const oldestRequest = Math.min(...this.rateLimitState.requests);
      const waitTime = windowMs - (now - oldestRequest);
      
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }
    
    // Add current request
    this.rateLimitState.requests.push(now);
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate client is initialized
   */
  validateInitialized() {
    if (!this.isInitialized) {
      throw new Error('CodegenClient must be initialized before use');
    }
  }

  /**
   * Get client health status
   */
  async getHealth() {
    try {
      const [authHealth, auditHealth] = await Promise.all([
        this.authManager.getHealth(),
        this.auditLogger.getHealth()
      ]);
      
      return {
        status: 'healthy',
        initialized: this.isInitialized,
        components: {
          auth: authHealth,
          audit: auditHealth
        },
        rateLimiting: {
          enabled: this.config.rateLimiting.enabled,
          currentRequests: this.rateLimitState.requests.length,
          limit: this.config.rateLimiting.requestsPerMinute
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      rateLimitState: {
        currentRequests: this.rateLimitState.requests.length,
        limit: this.config.rateLimiting.requestsPerMinute
      },
      config: {
        baseURL: this.config.api.baseURL,
        orgId: this.config.auth.orgId,
        securityEnabled: this.config.security.enableAuditLogging
      }
    };
  }

  /**
   * Shutdown client and cleanup resources
   */
  async shutdown() {
    try {
      // Cancel all active requests
      for (const [requestId, request] of this.activeRequests) {
        try {
          request.abort();
        } catch (error) {
          this.logger.warn('Failed to abort request', { requestId, error: error.message });
        }
      }
      
      // Clear queues
      this.activeRequests.clear();
      this.requestQueue = [];
      
      // Shutdown security components
      await Promise.all([
        this.authManager.shutdown(),
        this.auditLogger.shutdown()
      ]);
      
      this.isInitialized = false;
      
      this.logger.info('CodegenClient shutdown completed');
      this.emit('shutdown');
      
    } catch (error) {
      this.logger.error('CodegenClient shutdown error', { error: error.message });
      throw error;
    }
  }
}

export default CodegenClient;
