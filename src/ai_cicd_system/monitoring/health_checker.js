/**
 * @fileoverview Health Checker with Service Dependencies
 * @description Comprehensive health monitoring system with service registration and dependency tracking
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Health Checker with service registration and dependency tracking
 */
export class HealthChecker {
  constructor(config = {}) {
    this.config = {
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      defaultTimeout: config.defaultTimeout || 5000, // 5 seconds
      maxHistorySize: config.maxHistorySize || 100,
      enableAutoHealthChecks: config.enableAutoHealthChecks !== false,
      ...config
    };
    
    this.services = new Map();
    this.healthHistory = new Map();
    this.healthCheckInterval = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the health checker
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    log('debug', 'Initializing health checker...');
    
    if (this.config.enableAutoHealthChecks) {
      this.startHealthChecks();
    }
    
    this.isInitialized = true;
    log('info', 'Health checker initialized successfully');
  }

  /**
   * Register a service for health monitoring
   * @param {string} name - Service name
   * @param {Function} healthCheckFn - Health check function
   * @param {Object} config - Service configuration
   */
  registerService(name, healthCheckFn, config = {}) {
    if (typeof healthCheckFn !== 'function') {
      throw new Error('Health check function must be a function');
    }

    const serviceConfig = {
      name,
      healthCheck: healthCheckFn,
      timeout: config.timeout || this.config.defaultTimeout,
      critical: config.critical !== false,
      dependencies: config.dependencies || [],
      tags: config.tags || {},
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    this.services.set(name, serviceConfig);
    
    // Initialize health history
    if (!this.healthHistory.has(name)) {
      this.healthHistory.set(name, []);
    }
    
    log('info', `Registered service for health monitoring: ${name}`);
  }

  /**
   * Unregister a service
   * @param {string} name - Service name
   */
  unregisterService(name) {
    if (this.services.has(name)) {
      this.services.delete(name);
      this.healthHistory.delete(name);
      log('info', `Unregistered service: ${name}`);
    }
  }

  /**
   * Check health of all services or a specific service
   * @param {string|null} serviceName - Service name (optional)
   * @returns {Promise<Object>} Health check results
   */
  async checkHealth(serviceName = null) {
    if (serviceName) {
      return await this.checkServiceHealth(serviceName);
    }
    
    const results = {};
    const promises = [];
    
    // Check all services in parallel
    for (const [name] of this.services) {
      promises.push(
        this.checkServiceHealth(name).then(result => {
          results[name] = result;
        }).catch(error => {
          results[name] = {
            service: name,
            status: 'unhealthy',
            error: error.message,
            timestamp: Date.now(),
            responseTime: 0
          };
        })
      );
    }
    
    await Promise.allSettled(promises);
    
    const overallHealth = this.calculateOverallHealth(results);
    
    return {
      status: overallHealth.status,
      timestamp: Date.now(),
      services: results,
      summary: overallHealth.summary,
      dependencies: this._analyzeDependencies(results)
    };
  }

  /**
   * Check health of a specific service
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Health check result
   */
  async checkServiceHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    const startTime = Date.now();
    let result;
    let attempt = 0;
    
    while (attempt < service.retryCount) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), service.timeout);
        });
        
        const healthPromise = service.healthCheck();
        const healthResult = await Promise.race([healthPromise, timeoutPromise]);
        
        result = {
          service: serviceName,
          status: 'healthy',
          responseTime: Date.now() - startTime,
          details: healthResult || {},
          timestamp: Date.now(),
          attempt: attempt + 1,
          tags: service.tags
        };
        
        break; // Success, exit retry loop
        
      } catch (error) {
        attempt++;
        
        if (attempt >= service.retryCount) {
          result = {
            service: serviceName,
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            error: error.message,
            timestamp: Date.now(),
            attempt: attempt,
            tags: service.tags
          };
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, service.retryDelay));
        }
      }
    }
    
    this.recordHealthHistory(serviceName, result);
    return result;
  }

  /**
   * Calculate overall system health
   * @param {Object} serviceResults - Service health results
   * @returns {Object} Overall health status
   */
  calculateOverallHealth(serviceResults) {
    let healthyCount = 0;
    let criticalUnhealthy = 0;
    let totalServices = 0;
    let degradedCount = 0;
    
    for (const [serviceName, result] of Object.entries(serviceResults)) {
      const service = this.services.get(serviceName);
      totalServices++;
      
      if (result.status === 'healthy') {
        healthyCount++;
      } else if (result.status === 'degraded') {
        degradedCount++;
      } else if (service && service.critical) {
        criticalUnhealthy++;
      }
    }
    
    let status;
    if (criticalUnhealthy > 0) {
      status = 'critical';
    } else if (degradedCount > 0 || healthyCount < totalServices) {
      status = 'degraded';
    } else if (healthyCount === totalServices && totalServices > 0) {
      status = 'healthy';
    } else {
      status = 'unknown';
    }
    
    return {
      status,
      summary: {
        total: totalServices,
        healthy: healthyCount,
        degraded: degradedCount,
        unhealthy: totalServices - healthyCount - degradedCount,
        criticalUnhealthy
      }
    };
  }

  /**
   * Record health check result in history
   * @param {string} serviceName - Service name
   * @param {Object} result - Health check result
   */
  recordHealthHistory(serviceName, result) {
    if (!this.healthHistory.has(serviceName)) {
      this.healthHistory.set(serviceName, []);
    }
    
    const history = this.healthHistory.get(serviceName);
    history.push(result);
    
    // Keep only recent history
    if (history.length > this.config.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get health history for a service
   * @param {string} serviceName - Service name
   * @param {number} limit - Maximum number of records (optional)
   * @returns {Array} Health history
   */
  getHealthHistory(serviceName, limit = null) {
    const history = this.healthHistory.get(serviceName) || [];
    
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    
    return history.slice();
  }

  /**
   * Get health trends for a service
   * @param {string} serviceName - Service name
   * @param {number} timeWindow - Time window in milliseconds (optional)
   * @returns {Object} Health trends
   */
  getHealthTrends(serviceName, timeWindow = 3600000) { // Default: 1 hour
    const history = this.getHealthHistory(serviceName);
    const cutoff = Date.now() - timeWindow;
    const recentHistory = history.filter(h => h.timestamp >= cutoff);
    
    if (recentHistory.length === 0) {
      return {
        availability: 0,
        averageResponseTime: 0,
        errorRate: 0,
        totalChecks: 0
      };
    }
    
    const healthyChecks = recentHistory.filter(h => h.status === 'healthy').length;
    const totalChecks = recentHistory.length;
    const responseTimes = recentHistory.map(h => h.responseTime || 0);
    const averageResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;
    
    return {
      availability: (healthyChecks / totalChecks) * 100,
      averageResponseTime,
      errorRate: ((totalChecks - healthyChecks) / totalChecks) * 100,
      totalChecks,
      timeWindow
    };
  }

  /**
   * Start automatic health checks
   */
  startHealthChecks() {
    if (this.healthCheckInterval) {
      return;
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        
        if (health.status === 'critical') {
          log('error', '🚨 Critical system health issues detected');
        } else if (health.status === 'degraded') {
          log('warning', '⚠️ System health degraded');
        } else {
          log('debug', `🏥 System health: ${health.status}`);
        }
        
      } catch (error) {
        log('error', `Health check failed: ${error.message}`);
      }
    }, this.config.healthCheckInterval);
    
    log('info', 'Automatic health checks started');
  }

  /**
   * Stop automatic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      log('info', 'Automatic health checks stopped');
    }
  }

  /**
   * Get statistics about the health checker
   * @returns {Object} Statistics
   */
  async getStatistics() {
    let totalHealthChecks = 0;
    
    for (const [serviceName, history] of this.healthHistory) {
      totalHealthChecks += history.length;
    }
    
    return {
      services_registered: this.services.size,
      total_health_checks: totalHealthChecks,
      auto_checks_enabled: this.healthCheckInterval !== null,
      check_interval_ms: this.config.healthCheckInterval,
      default_timeout_ms: this.config.defaultTimeout
    };
  }

  /**
   * Get health status of the health checker itself
   * @returns {Object} Health status
   */
  async getHealth() {
    const stats = await this.getStatistics();
    
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      services_registered: stats.services_registered,
      auto_checks_enabled: stats.auto_checks_enabled
    };
  }

  /**
   * Shutdown the health checker
   */
  async shutdown() {
    log('debug', 'Shutting down health checker...');
    
    this.stopHealthChecks();
    
    this.services.clear();
    this.healthHistory.clear();
    
    this.isInitialized = false;
    log('info', 'Health checker shut down successfully');
  }

  // Private methods

  /**
   * Analyze service dependencies
   * @param {Object} serviceResults - Service health results
   * @returns {Object} Dependency analysis
   * @private
   */
  _analyzeDependencies(serviceResults) {
    const dependencyMap = {};
    const failedDependencies = [];
    
    for (const [serviceName, service] of this.services) {
      if (service.dependencies && service.dependencies.length > 0) {
        dependencyMap[serviceName] = {
          dependencies: service.dependencies,
          status: serviceResults[serviceName]?.status || 'unknown',
          dependencyStatus: {}
        };
        
        for (const dep of service.dependencies) {
          const depStatus = serviceResults[dep]?.status || 'unknown';
          dependencyMap[serviceName].dependencyStatus[dep] = depStatus;
          
          if (depStatus !== 'healthy') {
            failedDependencies.push({
              service: serviceName,
              dependency: dep,
              status: depStatus
            });
          }
        }
      }
    }
    
    return {
      dependencyMap,
      failedDependencies,
      hasDependencyIssues: failedDependencies.length > 0
    };
  }
}

/**
 * Built-in health check functions
 */
export class HealthCheckFunctions {
  /**
   * HTTP endpoint health check
   * @param {string} url - URL to check
   * @param {Object} options - Request options
   * @returns {Function} Health check function
   */
  static httpCheck(url, options = {}) {
    return async () => {
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(url, {
        method: options.method || 'GET',
        timeout: options.timeout || 5000,
        headers: options.headers || {}
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return {
        status: response.status,
        statusText: response.statusText,
        responseTime: response.headers.get('x-response-time')
      };
    };
  }

  /**
   * Database connection health check
   * @param {Object} dbConnection - Database connection object
   * @returns {Function} Health check function
   */
  static databaseCheck(dbConnection) {
    return async () => {
      if (!dbConnection) {
        throw new Error('Database connection not available');
      }
      
      // Simple query to test connection
      const result = await dbConnection.query('SELECT 1 as health_check');
      
      return {
        connected: true,
        queryResult: result
      };
    };
  }

  /**
   * Memory usage health check
   * @param {number} threshold - Memory threshold (0-1)
   * @returns {Function} Health check function
   */
  static memoryCheck(threshold = 0.9) {
    return async () => {
      const memUsage = process.memoryUsage();
      const usage = memUsage.heapUsed / memUsage.heapTotal;
      
      if (usage > threshold) {
        throw new Error(`Memory usage ${(usage * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`);
      }
      
      return {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        usage: usage,
        threshold: threshold
      };
    };
  }

  /**
   * File system health check
   * @param {string} path - Path to check
   * @returns {Function} Health check function
   */
  static fileSystemCheck(path) {
    return async () => {
      const fs = await import('fs/promises');
      
      try {
        const stats = await fs.stat(path);
        return {
          path: path,
          exists: true,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          modified: stats.mtime
        };
      } catch (error) {
        throw new Error(`File system check failed for ${path}: ${error.message}`);
      }
    };
  }

  /**
   * Custom function health check
   * @param {Function} checkFunction - Custom check function
   * @returns {Function} Health check function
   */
  static customCheck(checkFunction) {
    return async () => {
      if (typeof checkFunction !== 'function') {
        throw new Error('Custom check must be a function');
      }
      
      return await checkFunction();
    };
  }
}

export default HealthChecker;

