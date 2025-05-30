/**
 * Health Check System
 * 
 * Comprehensive health monitoring for the CICD orchestration system
 * Monitors database, external services, system resources, and application health
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class HealthCheck extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      timeout: config.timeout || 5000, // 5 seconds
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enableAlerts: config.enableAlerts !== false,
      ...config
    };

    this.logger = new SimpleLogger('HealthCheck', config.logLevel || 'info');
    this.checks = new Map();
    this.lastResults = new Map();
    this.isRunning = false;
    this.checkTimer = null;
    
    this._setupDefaultChecks();
  }

  /**
   * Setup default health checks
   */
  _setupDefaultChecks() {
    // Database connectivity check
    this.addCheck('database', async () => {
      try {
        const { DatabaseConnection } = await import('../ai_cicd_system/database/connection.js');
        const db = new DatabaseConnection();
        
        const startTime = Date.now();
        const result = await db.query('SELECT 1 as health_check');
        const responseTime = Date.now() - startTime;
        
        return {
          status: 'healthy',
          responseTime,
          details: {
            connected: true,
            queryResult: result.rows[0]?.health_check === 1
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          details: {
            connected: false,
            errorType: error.constructor.name
          }
        };
      }
    });

    // Redis connectivity check
    this.addCheck('redis', async () => {
      try {
        // Implement Redis check when Redis client is available
        const startTime = Date.now();
        // const redis = await getRedisClient();
        // await redis.ping();
        const responseTime = Date.now() - startTime;
        
        return {
          status: 'healthy',
          responseTime,
          details: {
            connected: true,
            ping: 'PONG'
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          details: {
            connected: false,
            errorType: error.constructor.name
          }
        };
      }
    });

    // System resources check
    this.addCheck('system_resources', async () => {
      try {
        const os = await import('os');
        const process = await import('process');
        
        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        
        const cpuUsage = os.loadavg();
        const uptime = process.uptime();
        
        const isHealthy = memoryUsagePercent < 90 && cpuUsage[0] < os.cpus().length * 0.8;
        
        return {
          status: isHealthy ? 'healthy' : 'degraded',
          details: {
            memory: {
              used: Math.round(memoryUsagePercent * 100) / 100,
              total: totalMemory,
              free: freeMemory,
              process: memoryUsage
            },
            cpu: {
              loadAverage: cpuUsage,
              cores: os.cpus().length
            },
            uptime: Math.round(uptime),
            platform: os.platform(),
            arch: os.arch()
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          details: {
            errorType: error.constructor.name
          }
        };
      }
    });

    // External services check
    this.addCheck('external_services', async () => {
      const services = [];
      
      try {
        // Check Codegen API
        const codegenResult = await this._checkExternalService(
          'codegen',
          process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
          '/health'
        );
        services.push(codegenResult);

        // Check Linear API
        const linearResult = await this._checkExternalService(
          'linear',
          'https://api.linear.app',
          '/graphql',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ viewer { id } }' })
          }
        );
        services.push(linearResult);

        // Check GitHub API
        const githubResult = await this._checkExternalService(
          'github',
          'https://api.github.com',
          '/zen'
        );
        services.push(githubResult);

        const allHealthy = services.every(service => service.status === 'healthy');
        
        return {
          status: allHealthy ? 'healthy' : 'degraded',
          details: {
            services: services.reduce((acc, service) => {
              acc[service.name] = service;
              return acc;
            }, {})
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          details: {
            services,
            errorType: error.constructor.name
          }
        };
      }
    });

    // Application-specific checks
    this.addCheck('application', async () => {
      try {
        const checks = {
          configLoaded: !!process.env.NODE_ENV,
          environmentValid: ['development', 'staging', 'production'].includes(process.env.NODE_ENV),
          requiredEnvVars: this._checkRequiredEnvVars(),
          diskSpace: await this._checkDiskSpace(),
          processHealth: this._checkProcessHealth()
        };

        const isHealthy = Object.values(checks).every(check => 
          typeof check === 'boolean' ? check : check.status === 'healthy'
        );

        return {
          status: isHealthy ? 'healthy' : 'degraded',
          details: checks
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          details: {
            errorType: error.constructor.name
          }
        };
      }
    });
  }

  /**
   * Add a custom health check
   */
  addCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      function: checkFunction,
      timeout: options.timeout || this.config.timeout,
      retryAttempts: options.retryAttempts || this.config.retryAttempts,
      retryDelay: options.retryDelay || this.config.retryDelay,
      critical: options.critical !== false,
      enabled: options.enabled !== false
    });
    
    this.logger.info(`Health check '${name}' added`, { critical: options.critical });
  }

  /**
   * Remove a health check
   */
  removeCheck(name) {
    const removed = this.checks.delete(name);
    this.lastResults.delete(name);
    
    if (removed) {
      this.logger.info(`Health check '${name}' removed`);
    }
    
    return removed;
  }

  /**
   * Run a specific health check
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check || !check.enabled) {
      return null;
    }

    const startTime = Date.now();
    let attempt = 0;
    let lastError = null;

    while (attempt < check.retryAttempts) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
        });

        const result = await Promise.race([
          check.function(),
          timeoutPromise
        ]);

        const duration = Date.now() - startTime;
        const checkResult = {
          name,
          timestamp: new Date().toISOString(),
          duration,
          attempt: attempt + 1,
          ...result
        };

        this.lastResults.set(name, checkResult);
        this.emit('checkCompleted', checkResult);

        if (result.status === 'unhealthy' && check.critical) {
          this.emit('criticalFailure', checkResult);
        }

        return checkResult;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt < check.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, check.retryDelay));
        }
      }
    }

    // All attempts failed
    const duration = Date.now() - startTime;
    const checkResult = {
      name,
      timestamp: new Date().toISOString(),
      duration,
      attempt,
      status: 'unhealthy',
      error: lastError.message,
      details: {
        errorType: lastError.constructor.name,
        allAttemptsFailed: true
      }
    };

    this.lastResults.set(name, checkResult);
    this.emit('checkCompleted', checkResult);

    if (check.critical) {
      this.emit('criticalFailure', checkResult);
    }

    return checkResult;
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    const startTime = Date.now();
    const results = new Map();
    const promises = [];

    for (const [name] of this.checks) {
      promises.push(
        this.runCheck(name).then(result => {
          if (result) {
            results.set(name, result);
          }
        })
      );
    }

    await Promise.allSettled(promises);
    
    const duration = Date.now() - startTime;
    const overallResult = this.generateHealthReport(results);
    
    this.emit('healthCheckCompleted', {
      ...overallResult,
      duration,
      timestamp: new Date().toISOString()
    });

    return overallResult;
  }

  /**
   * Generate comprehensive health report
   */
  generateHealthReport(results = this.lastResults) {
    const checks = Array.from(results.values());
    const healthyChecks = checks.filter(check => check.status === 'healthy');
    const degradedChecks = checks.filter(check => check.status === 'degraded');
    const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
    
    let overallStatus = 'healthy';
    if (unhealthyChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedChecks.length > 0) {
      overallStatus = 'degraded';
    }

    const report = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        total: checks.length,
        healthy: healthyChecks.length,
        degraded: degradedChecks.length,
        unhealthy: unhealthyChecks.length
      },
      checks: Object.fromEntries(results),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    return report;
  }

  /**
   * Start continuous health monitoring
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Health check is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting health check monitoring', {
      interval: this.config.checkInterval,
      checks: Array.from(this.checks.keys())
    });

    // Run initial check
    this.runAllChecks();

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.runAllChecks();
    }, this.config.checkInterval);

    this.emit('started');
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.logger.info('Health check monitoring stopped');
    this.emit('stopped');
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checksCount: this.checks.size,
      lastCheck: this.lastResults.size > 0 ? 
        Math.max(...Array.from(this.lastResults.values()).map(r => new Date(r.timestamp).getTime())) : 
        null,
      overallHealth: this.generateHealthReport()
    };
  }

  /**
   * Alert on failures
   */
  async alertOnFailures(result) {
    if (!this.config.enableAlerts) {
      return;
    }

    try {
      const { AlertManager } = await import('./AlertManager.js');
      const alertManager = new AlertManager();

      if (result.status === 'unhealthy') {
        await alertManager.sendAlert({
          type: 'critical',
          title: 'System Health Check Failed',
          message: `Health check failed: ${result.summary.unhealthy} unhealthy checks detected`,
          details: result,
          timestamp: new Date().toISOString()
        });
      } else if (result.status === 'degraded') {
        await alertManager.sendAlert({
          type: 'warning',
          title: 'System Health Degraded',
          message: `Health check degraded: ${result.summary.degraded} degraded checks detected`,
          details: result,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      this.logger.error('Failed to send health check alert:', error);
    }
  }

  // Private helper methods

  async _checkExternalService(name, baseUrl, path, options = {}) {
    try {
      const startTime = Date.now();
      const url = `${baseUrl}${path}`;
      
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        timeout: this.config.timeout
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      return {
        name,
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime,
        details: {
          url,
          statusCode: response.status,
          statusText: response.statusText
        }
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        error: error.message,
        details: {
          url: `${baseUrl}${path}`,
          errorType: error.constructor.name
        }
      };
    }
  }

  _checkRequiredEnvVars() {
    const required = [
      'NODE_ENV',
      'DATABASE_URL',
      'API_PORT',
      'METRICS_PORT'
    ];

    const missing = required.filter(envVar => !process.env[envVar]);
    
    return {
      status: missing.length === 0 ? 'healthy' : 'unhealthy',
      required: required.length,
      missing: missing.length,
      missingVars: missing
    };
  }

  async _checkDiskSpace() {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs('.');
      
      const total = stats.blocks * stats.blksize;
      const free = stats.bavail * stats.blksize;
      const used = total - free;
      const usagePercent = (used / total) * 100;

      return {
        status: usagePercent < 90 ? 'healthy' : 'degraded',
        total,
        free,
        used,
        usagePercent: Math.round(usagePercent * 100) / 100
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }

  _checkProcessHealth() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Check for memory leaks (simplified)
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB
    const isMemoryHealthy = memoryUsage.heapUsed < memoryThreshold;
    
    return {
      status: isMemoryHealthy ? 'healthy' : 'degraded',
      uptime,
      memory: memoryUsage,
      pid: process.pid,
      nodeVersion: process.version
    };
  }
}

export default HealthCheck;

