/**
 * Fault Tolerance Utilities
 * 
 * Provides comprehensive fault tolerance mechanisms including bulkheads,
 * timeouts, rate limiting, and health checks for the AI CI/CD system.
 */

import { ErrorTypes, SystemError, TimeoutError } from './error_types.js';

/**
 * Bulkhead Pattern Implementation
 * Isolates resources to prevent cascading failures
 */
export class Bulkhead {
  constructor(config = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent || 10,
      queueSize: config.queueSize || 50,
      timeout: config.timeout || 30000,
      name: config.name || 'unnamed'
    };
    
    this.activeRequests = 0;
    this.queue = [];
    this.metrics = {
      totalRequests: 0,
      completedRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      timeouts: 0
    };
  }

  /**
   * Execute operation within bulkhead constraints
   */
  async execute(operation, context = {}) {
    this.metrics.totalRequests++;
    
    return new Promise((resolve, reject) => {
      const request = {
        operation,
        context,
        resolve,
        reject,
        timestamp: Date.now(),
        operationId: context.operationId || `bulk_${Date.now()}`
      };

      if (this.activeRequests < this.config.maxConcurrent) {
        this.executeRequest(request);
      } else if (this.queue.length < this.config.queueSize) {
        this.queue.push(request);
        this.metrics.queuedRequests++;
        console.log(`📦 Request queued in bulkhead '${this.config.name}' (${this.queue.length}/${this.config.queueSize})`);
      } else {
        this.metrics.rejectedRequests++;
        reject(new SystemError(
          `Bulkhead '${this.config.name}' is at capacity`,
          ErrorTypes.RESOURCE_EXHAUSTED,
          true,
          { 
            activeRequests: this.activeRequests,
            queueSize: this.queue.length,
            maxConcurrent: this.config.maxConcurrent
          }
        ));
      }
    });
  }

  /**
   * Execute a request
   */
  async executeRequest(request) {
    this.activeRequests++;
    
    const timeoutId = setTimeout(() => {
      this.metrics.timeouts++;
      request.reject(new TimeoutError(
        `Operation timed out in bulkhead '${this.config.name}'`,
        { 
          timeout: this.config.timeout,
          operationId: request.operationId
        }
      ));
    }, this.config.timeout);

    try {
      const result = await request.operation();
      clearTimeout(timeoutId);
      this.metrics.completedRequests++;
      request.resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      request.reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  /**
   * Process queued requests
   */
  processQueue() {
    if (this.queue.length > 0 && this.activeRequests < this.config.maxConcurrent) {
      const request = this.queue.shift();
      this.executeRequest(request);
    }
  }

  /**
   * Get bulkhead status
   */
  getStatus() {
    return {
      name: this.config.name,
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      queueSize: this.config.queueSize,
      utilization: this.activeRequests / this.config.maxConcurrent,
      metrics: this.metrics
    };
  }
}

/**
 * Rate Limiter Implementation
 * Controls the rate of operations to prevent overwhelming services
 */
export class RateLimiter {
  constructor(config = {}) {
    this.config = {
      maxRequests: config.maxRequests || 100,
      windowMs: config.windowMs || 60000, // 1 minute
      name: config.name || 'unnamed'
    };
    
    this.requests = [];
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      rejectedRequests: 0
    };
  }

  /**
   * Check if request is allowed
   */
  isAllowed() {
    this.metrics.totalRequests++;
    
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Remove old requests
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);
    
    if (this.requests.length < this.config.maxRequests) {
      this.requests.push(now);
      this.metrics.allowedRequests++;
      return true;
    }
    
    this.metrics.rejectedRequests++;
    return false;
  }

  /**
   * Execute operation with rate limiting
   */
  async execute(operation, context = {}) {
    if (!this.isAllowed()) {
      const resetTime = Math.min(...this.requests) + this.config.windowMs;
      const waitTime = resetTime - Date.now();
      
      throw new SystemError(
        `Rate limit exceeded for '${this.config.name}'`,
        ErrorTypes.RATE_LIMIT_ERROR,
        true,
        {
          retryAfter: Math.ceil(waitTime / 1000),
          maxRequests: this.config.maxRequests,
          windowMs: this.config.windowMs
        }
      );
    }
    
    return await operation();
  }

  /**
   * Get rate limiter status
   */
  getStatus() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const currentRequests = this.requests.filter(timestamp => timestamp > windowStart).length;
    
    return {
      name: this.config.name,
      currentRequests,
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
      remaining: this.config.maxRequests - currentRequests,
      resetTime: Math.min(...this.requests) + this.config.windowMs,
      metrics: this.metrics
    };
  }
}

/**
 * Health Check Implementation
 * Monitors service health and provides status information
 */
export class HealthCheck {
  constructor(config = {}) {
    this.config = {
      name: config.name || 'unnamed',
      checkInterval: config.checkInterval || 30000, // 30 seconds
      timeout: config.timeout || 5000,
      healthyThreshold: config.healthyThreshold || 2,
      unhealthyThreshold: config.unhealthyThreshold || 3
    };
    
    this.status = 'UNKNOWN';
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.lastCheck = null;
    this.lastError = null;
    
    this.metrics = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      uptime: 0,
      downtime: 0
    };
    
    this.healthCheckFunction = config.healthCheckFunction || this.defaultHealthCheck;
    
    if (config.autoStart !== false) {
      this.start();
    }
  }

  /**
   * Default health check function
   */
  async defaultHealthCheck() {
    return { status: 'OK', timestamp: new Date().toISOString() };
  }

  /**
   * Perform health check
   */
  async performCheck() {
    this.metrics.totalChecks++;
    this.lastCheck = Date.now();
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new TimeoutError('Health check timeout')), this.config.timeout);
      });
      
      const result = await Promise.race([
        this.healthCheckFunction(),
        timeoutPromise
      ]);
      
      this.onSuccess(result);
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful health check
   */
  onSuccess(result) {
    this.metrics.successfulChecks++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastError = null;
    
    if (this.status !== 'HEALTHY' && this.consecutiveSuccesses >= this.config.healthyThreshold) {
      this.setStatus('HEALTHY');
    }
  }

  /**
   * Handle failed health check
   */
  onFailure(error) {
    this.metrics.failedChecks++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastError = error.message;
    
    if (this.status !== 'UNHEALTHY' && this.consecutiveFailures >= this.config.unhealthyThreshold) {
      this.setStatus('UNHEALTHY');
    }
  }

  /**
   * Set health status
   */
  setStatus(newStatus) {
    const oldStatus = this.status;
    this.status = newStatus;
    
    console.log(`🏥 Health check '${this.config.name}' status changed: ${oldStatus} → ${newStatus}`);
    
    if (this.config.onStatusChange) {
      this.config.onStatusChange(newStatus, oldStatus);
    }
  }

  /**
   * Start health checking
   */
  start() {
    if (this.interval) {
      return;
    }
    
    this.interval = setInterval(async () => {
      try {
        await this.performCheck();
      } catch (error) {
        // Error already handled in performCheck
      }
    }, this.config.checkInterval);
    
    // Perform initial check
    this.performCheck().catch(() => {});
  }

  /**
   * Stop health checking
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get health status
   */
  getStatus() {
    return {
      name: this.config.name,
      status: this.status,
      lastCheck: this.lastCheck,
      lastError: this.lastError,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      metrics: this.metrics,
      uptime: this.calculateUptime()
    };
  }

  /**
   * Calculate uptime percentage
   */
  calculateUptime() {
    if (this.metrics.totalChecks === 0) {
      return 0;
    }
    
    return this.metrics.successfulChecks / this.metrics.totalChecks;
  }
}

/**
 * Timeout Wrapper
 * Adds timeout functionality to any operation
 */
export class TimeoutWrapper {
  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Execute operation with timeout
   */
  async execute(operation, context = {}) {
    const operationId = context.operationId || `timeout_${Date.now()}`;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(
          `Operation ${operationId} timed out after ${this.timeoutMs}ms`,
          { timeoutMs: this.timeoutMs, operationId }
        ));
      }, this.timeoutMs);

      try {
        const result = await operation();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Create a timeout wrapper for a specific duration
   */
  static withTimeout(timeoutMs) {
    return new TimeoutWrapper(timeoutMs);
  }
}

/**
 * Resource Pool
 * Manages a pool of resources with fault tolerance
 */
export class ResourcePool {
  constructor(config = {}) {
    this.config = {
      minSize: config.minSize || 1,
      maxSize: config.maxSize || 10,
      acquireTimeout: config.acquireTimeout || 10000,
      idleTimeout: config.idleTimeout || 300000, // 5 minutes
      name: config.name || 'unnamed'
    };
    
    this.resources = [];
    this.available = [];
    this.inUse = new Set();
    this.waitingQueue = [];
    
    this.resourceFactory = config.resourceFactory;
    this.resourceValidator = config.resourceValidator || (() => true);
    this.resourceDestroyer = config.resourceDestroyer || (() => {});
    
    this.metrics = {
      created: 0,
      destroyed: 0,
      acquired: 0,
      released: 0,
      timeouts: 0
    };
    
    this.initialize();
  }

  /**
   * Initialize the pool
   */
  async initialize() {
    for (let i = 0; i < this.config.minSize; i++) {
      try {
        const resource = await this.createResource();
        this.available.push(resource);
      } catch (error) {
        console.log(`⚠️ Failed to create initial resource for pool '${this.config.name}': ${error.message}`);
      }
    }
  }

  /**
   * Create a new resource
   */
  async createResource() {
    if (!this.resourceFactory) {
      throw new SystemError(
        'No resource factory provided',
        ErrorTypes.CONFIGURATION_ERROR,
        false
      );
    }
    
    const resource = await this.resourceFactory();
    this.resources.push(resource);
    this.metrics.created++;
    
    return resource;
  }

  /**
   * Acquire a resource from the pool
   */
  async acquire() {
    this.metrics.acquired++;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.metrics.timeouts++;
        reject(new TimeoutError(
          `Resource acquisition timeout for pool '${this.config.name}'`,
          { timeout: this.config.acquireTimeout }
        ));
      }, this.config.acquireTimeout);

      try {
        const resource = await this.getAvailableResource();
        clearTimeout(timeoutId);
        this.inUse.add(resource);
        resolve(resource);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Get an available resource
   */
  async getAvailableResource() {
    // Check for available resources
    while (this.available.length > 0) {
      const resource = this.available.shift();
      
      if (await this.validateResource(resource)) {
        return resource;
      } else {
        // Resource is invalid, destroy it
        await this.destroyResource(resource);
      }
    }
    
    // No available resources, try to create a new one
    if (this.resources.length < this.config.maxSize) {
      return await this.createResource();
    }
    
    // Pool is at capacity, wait for a resource to be released
    return new Promise((resolve, reject) => {
      this.waitingQueue.push({ resolve, reject });
    });
  }

  /**
   * Validate a resource
   */
  async validateResource(resource) {
    try {
      return await this.resourceValidator(resource);
    } catch (error) {
      return false;
    }
  }

  /**
   * Release a resource back to the pool
   */
  async release(resource) {
    this.metrics.released++;
    this.inUse.delete(resource);
    
    if (await this.validateResource(resource)) {
      // Check if anyone is waiting
      if (this.waitingQueue.length > 0) {
        const waiter = this.waitingQueue.shift();
        this.inUse.add(resource);
        waiter.resolve(resource);
      } else {
        this.available.push(resource);
      }
    } else {
      // Resource is invalid, destroy it
      await this.destroyResource(resource);
    }
  }

  /**
   * Destroy a resource
   */
  async destroyResource(resource) {
    try {
      await this.resourceDestroyer(resource);
    } catch (error) {
      console.log(`⚠️ Error destroying resource: ${error.message}`);
    }
    
    const index = this.resources.indexOf(resource);
    if (index > -1) {
      this.resources.splice(index, 1);
    }
    
    this.metrics.destroyed++;
  }

  /**
   * Get pool status
   */
  getStatus() {
    return {
      name: this.config.name,
      totalResources: this.resources.length,
      availableResources: this.available.length,
      inUseResources: this.inUse.size,
      waitingRequests: this.waitingQueue.length,
      config: this.config,
      metrics: this.metrics
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown() {
    // Destroy all resources
    for (const resource of this.resources) {
      await this.destroyResource(resource);
    }
    
    this.resources = [];
    this.available = [];
    this.inUse.clear();
    
    // Reject all waiting requests
    for (const waiter of this.waitingQueue) {
      waiter.reject(new SystemError(
        'Resource pool is shutting down',
        ErrorTypes.RESOURCE_EXHAUSTED,
        false
      ));
    }
    
    this.waitingQueue = [];
  }
}

/**
 * Fault Tolerance Manager
 * Coordinates multiple fault tolerance mechanisms
 */
export class FaultToleranceManager {
  constructor() {
    this.bulkheads = new Map();
    this.rateLimiters = new Map();
    this.healthChecks = new Map();
    this.resourcePools = new Map();
  }

  /**
   * Create or get a bulkhead
   */
  getBulkhead(name, config = {}) {
    if (!this.bulkheads.has(name)) {
      this.bulkheads.set(name, new Bulkhead({ ...config, name }));
    }
    return this.bulkheads.get(name);
  }

  /**
   * Create or get a rate limiter
   */
  getRateLimiter(name, config = {}) {
    if (!this.rateLimiters.has(name)) {
      this.rateLimiters.set(name, new RateLimiter({ ...config, name }));
    }
    return this.rateLimiters.get(name);
  }

  /**
   * Create or get a health check
   */
  getHealthCheck(name, config = {}) {
    if (!this.healthChecks.has(name)) {
      this.healthChecks.set(name, new HealthCheck({ ...config, name }));
    }
    return this.healthChecks.get(name);
  }

  /**
   * Create or get a resource pool
   */
  getResourcePool(name, config = {}) {
    if (!this.resourcePools.has(name)) {
      this.resourcePools.set(name, new ResourcePool({ ...config, name }));
    }
    return this.resourcePools.get(name);
  }

  /**
   * Get overall system status
   */
  getSystemStatus() {
    const bulkheadStatus = {};
    this.bulkheads.forEach((bulkhead, name) => {
      bulkheadStatus[name] = bulkhead.getStatus();
    });

    const rateLimiterStatus = {};
    this.rateLimiters.forEach((rateLimiter, name) => {
      rateLimiterStatus[name] = rateLimiter.getStatus();
    });

    const healthCheckStatus = {};
    this.healthChecks.forEach((healthCheck, name) => {
      healthCheckStatus[name] = healthCheck.getStatus();
    });

    const resourcePoolStatus = {};
    this.resourcePools.forEach((resourcePool, name) => {
      resourcePoolStatus[name] = resourcePool.getStatus();
    });

    return {
      bulkheads: bulkheadStatus,
      rateLimiters: rateLimiterStatus,
      healthChecks: healthCheckStatus,
      resourcePools: resourcePoolStatus,
      timestamp: new Date().toISOString()
    };
  }
}

export default {
  Bulkhead,
  RateLimiter,
  HealthCheck,
  TimeoutWrapper,
  ResourcePool,
  FaultToleranceManager
};

