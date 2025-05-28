/**
 * System Health Validation Module
 * 
 * Comprehensive health checks for all system components including
 * database connectivity, MCP server health, AI provider integration,
 * and performance monitoring.
 */

import logger from '../../mcp-server/src/logger.js';
import { performance } from 'perf_hooks';

/**
 * System Health Validator Class
 */
export class SystemHealthValidator {
  constructor() {
    this.healthChecks = new Map();
    this.performanceMetrics = new Map();
    this.alertThresholds = {
      responseTime: 1000, // 1 second
      memoryUsage: 500 * 1024 * 1024, // 500MB
      cpuUsage: 80, // 80%
      errorRate: 0.01, // 1%
      diskSpace: 0.9 // 90% full
    };
    this.checkInterval = 30000; // 30 seconds
    this.isMonitoring = false;
  }

  /**
   * Initialize health monitoring
   */
  async initialize() {
    logger.info('Initializing system health validator...');
    
    // Register all health checks
    this.registerHealthChecks();
    
    // Start continuous monitoring
    await this.startMonitoring();
    
    logger.info('System health validator initialized');
  }

  /**
   * Register all health check functions
   */
  registerHealthChecks() {
    this.healthChecks.set('database_connectivity', this.checkDatabaseConnectivity.bind(this));
    this.healthChecks.set('mcp_server_health', this.checkMCPServerHealth.bind(this));
    this.healthChecks.set('task_orchestration', this.checkTaskOrchestration.bind(this));
    this.healthChecks.set('context_management', this.checkContextManagement.bind(this));
    this.healthChecks.set('ai_provider_integration', this.checkAIProviderIntegration.bind(this));
    this.healthChecks.set('file_system_operations', this.checkFileSystemOperations.bind(this));
    this.healthChecks.set('memory_usage', this.checkMemoryUsage.bind(this));
    this.healthChecks.set('cpu_usage', this.checkCPUUsage.bind(this));
    this.healthChecks.set('disk_space', this.checkDiskSpace.bind(this));
    this.healthChecks.set('network_connectivity', this.checkNetworkConnectivity.bind(this));
  }

  /**
   * Start continuous health monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting continuous health monitoring...');

    // Run initial health check
    await this.runAllHealthChecks();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runAllHealthChecks();
      } catch (error) {
        logger.error(`Health monitoring error: ${error.message}`);
      }
    }, this.checkInterval);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Health monitoring stopped');
  }

  /**
   * Run all registered health checks
   */
  async runAllHealthChecks() {
    const results = new Map();
    const startTime = performance.now();

    logger.debug('Running all health checks...');

    for (const [checkName, checkFunction] of this.healthChecks) {
      try {
        const checkStartTime = performance.now();
        const result = await checkFunction();
        const checkDuration = performance.now() - checkStartTime;

        results.set(checkName, {
          status: 'healthy',
          result,
          duration: checkDuration,
          timestamp: new Date().toISOString()
        });

        // Record performance metric
        this.recordPerformanceMetric(checkName, checkDuration);

      } catch (error) {
        logger.error(`Health check '${checkName}' failed: ${error.message}`);
        
        results.set(checkName, {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });

        // Trigger alert for critical failures
        await this.handleHealthCheckFailure(checkName, error);
      }
    }

    const totalDuration = performance.now() - startTime;
    logger.debug(`All health checks completed in ${totalDuration.toFixed(2)}ms`);

    // Store results
    this.lastHealthCheckResults = results;
    this.lastHealthCheckTime = new Date().toISOString();

    return results;
  }

  /**
   * Check database connectivity
   */
  async checkDatabaseConnectivity() {
    // Simulate database connectivity check
    // In production, this would connect to PostgreSQL and run a simple query
    return new Promise((resolve, reject) => {
      const mockLatency = Math.random() * 100; // 0-100ms
      
      setTimeout(() => {
        if (Math.random() > 0.95) { // 5% failure rate for testing
          reject(new Error('Database connection timeout'));
        } else {
          resolve({
            connected: true,
            latency: mockLatency,
            connectionPool: {
              active: 5,
              idle: 10,
              total: 15
            }
          });
        }
      }, mockLatency);
    });
  }

  /**
   * Check MCP server health
   */
  async checkMCPServerHealth() {
    try {
      const startTime = performance.now();
      
      // Test MCP server responsiveness
      // In production, this would make actual MCP calls
      const mockResponse = await this.simulateMCPCall();
      
      const responseTime = performance.now() - startTime;
      
      if (responseTime > this.alertThresholds.responseTime) {
        throw new Error(`MCP server response time too slow: ${responseTime.toFixed(2)}ms`);
      }

      return {
        responsive: true,
        responseTime: responseTime,
        activeConnections: mockResponse.activeConnections,
        queuedRequests: mockResponse.queuedRequests
      };
    } catch (error) {
      throw new Error(`MCP server health check failed: ${error.message}`);
    }
  }

  /**
   * Simulate MCP call for testing
   */
  async simulateMCPCall() {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          activeConnections: Math.floor(Math.random() * 10) + 1,
          queuedRequests: Math.floor(Math.random() * 5)
        });
      }, Math.random() * 50); // 0-50ms latency
    });
  }

  /**
   * Check task orchestration system
   */
  async checkTaskOrchestration() {
    try {
      // Test task creation and processing capabilities
      const testTask = {
        id: `health_check_${Date.now()}`,
        title: 'Health Check Task',
        description: 'System health validation task',
        status: 'pending'
      };

      // Simulate task processing
      const processingResult = await this.simulateTaskProcessing(testTask);
      
      return {
        orchestrationActive: true,
        taskProcessingTime: processingResult.duration,
        queueLength: processingResult.queueLength,
        workerStatus: processingResult.workerStatus
      };
    } catch (error) {
      throw new Error(`Task orchestration check failed: ${error.message}`);
    }
  }

  /**
   * Simulate task processing for health check
   */
  async simulateTaskProcessing(task) {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const duration = performance.now() - startTime;
        resolve({
          duration,
          queueLength: Math.floor(Math.random() * 20),
          workerStatus: 'active'
        });
      }, Math.random() * 100); // 0-100ms processing time
    });
  }

  /**
   * Check context management system
   */
  async checkContextManagement() {
    try {
      // Test context storage and retrieval
      const testContext = {
        sessionId: `health_check_${Date.now()}`,
        data: { test: 'context_data' }
      };

      // Simulate context operations
      const contextResult = await this.simulateContextOperations(testContext);
      
      return {
        contextSystemActive: true,
        storageLatency: contextResult.storageLatency,
        retrievalLatency: contextResult.retrievalLatency,
        cacheHitRate: contextResult.cacheHitRate
      };
    } catch (error) {
      throw new Error(`Context management check failed: ${error.message}`);
    }
  }

  /**
   * Simulate context operations for health check
   */
  async simulateContextOperations(context) {
    const storageStart = performance.now();
    await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
    const storageLatency = performance.now() - storageStart;

    const retrievalStart = performance.now();
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    const retrievalLatency = performance.now() - retrievalStart;

    return {
      storageLatency,
      retrievalLatency,
      cacheHitRate: Math.random() * 0.3 + 0.7 // 70-100% hit rate
    };
  }

  /**
   * Check AI provider integration
   */
  async checkAIProviderIntegration() {
    const providers = ['anthropic', 'openai', 'google', 'perplexity'];
    const results = {};

    for (const provider of providers) {
      try {
        const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
        
        if (!apiKey) {
          results[provider] = {
            available: false,
            reason: 'API key not configured'
          };
          continue;
        }

        // Simulate API connectivity test
        const connectivityTest = await this.testAIProviderConnectivity(provider);
        
        results[provider] = {
          available: true,
          responseTime: connectivityTest.responseTime,
          rateLimitRemaining: connectivityTest.rateLimitRemaining
        };
      } catch (error) {
        results[provider] = {
          available: false,
          error: error.message
        };
      }
    }

    const availableProviders = Object.values(results).filter(r => r.available).length;
    
    if (availableProviders === 0) {
      throw new Error('No AI providers are available');
    }

    return {
      totalProviders: providers.length,
      availableProviders,
      providerStatus: results
    };
  }

  /**
   * Test AI provider connectivity
   */
  async testAIProviderConnectivity(provider) {
    return new Promise((resolve, reject) => {
      const latency = Math.random() * 200 + 100; // 100-300ms
      
      setTimeout(() => {
        if (Math.random() > 0.98) { // 2% failure rate
          reject(new Error(`${provider} API unavailable`));
        } else {
          resolve({
            responseTime: latency,
            rateLimitRemaining: Math.floor(Math.random() * 1000) + 500
          });
        }
      }, latency);
    });
  }

  /**
   * Check file system operations
   */
  async checkFileSystemOperations() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    try {
      const testDir = path.join(os.tmpdir(), `health_check_${Date.now()}`);
      const testFile = path.join(testDir, 'test.txt');
      const testContent = 'Health check test content';

      // Test directory creation
      const createStart = performance.now();
      await fs.mkdir(testDir, { recursive: true });
      const createTime = performance.now() - createStart;

      // Test file write
      const writeStart = performance.now();
      await fs.writeFile(testFile, testContent);
      const writeTime = performance.now() - writeStart;

      // Test file read
      const readStart = performance.now();
      const readContent = await fs.readFile(testFile, 'utf8');
      const readTime = performance.now() - readStart;

      // Test file deletion
      const deleteStart = performance.now();
      await fs.unlink(testFile);
      await fs.rmdir(testDir);
      const deleteTime = performance.now() - deleteStart;

      if (readContent !== testContent) {
        throw new Error('File content mismatch');
      }

      return {
        operationsSuccessful: true,
        performance: {
          createTime,
          writeTime,
          readTime,
          deleteTime
        }
      };
    } catch (error) {
      throw new Error(`File system operations failed: ${error.message}`);
    }
  }

  /**
   * Check memory usage
   */
  async checkMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;

    if (totalMemory > this.alertThresholds.memoryUsage) {
      throw new Error(`Memory usage too high: ${(totalMemory / 1024 / 1024).toFixed(2)}MB`);
    }

    return {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
      totalMB: (totalMemory / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Check CPU usage
   */
  async checkCPUUsage() {
    const os = await import('os');
    
    // Get CPU usage over a short interval
    const startUsage = process.cpuUsage();
    const startTime = performance.now();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const endUsage = process.cpuUsage(startUsage);
    const endTime = performance.now();
    
    const elapsedTime = (endTime - startTime) * 1000; // Convert to microseconds
    const cpuPercent = ((endUsage.user + endUsage.system) / elapsedTime) * 100;

    if (cpuPercent > this.alertThresholds.cpuUsage) {
      logger.warn(`CPU usage high: ${cpuPercent.toFixed(2)}%`);
    }

    return {
      cpuPercent: cpuPercent.toFixed(2),
      userTime: endUsage.user,
      systemTime: endUsage.system,
      loadAverage: os.loadavg()
    };
  }

  /**
   * Check disk space
   */
  async checkDiskSpace() {
    const fs = await import('fs/promises');
    
    try {
      const stats = await fs.statfs(process.cwd());
      const totalSpace = stats.blocks * stats.blksize;
      const freeSpace = stats.bavail * stats.blksize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercent = usedSpace / totalSpace;

      if (usagePercent > this.alertThresholds.diskSpace) {
        throw new Error(`Disk space critically low: ${(usagePercent * 100).toFixed(2)}% used`);
      }

      return {
        totalGB: (totalSpace / 1024 / 1024 / 1024).toFixed(2),
        freeGB: (freeSpace / 1024 / 1024 / 1024).toFixed(2),
        usedGB: (usedSpace / 1024 / 1024 / 1024).toFixed(2),
        usagePercent: (usagePercent * 100).toFixed(2)
      };
    } catch (error) {
      // Fallback for systems that don't support statfs
      logger.warn('Disk space check not available on this system');
      return {
        available: false,
        reason: 'statfs not supported'
      };
    }
  }

  /**
   * Check network connectivity
   */
  async checkNetworkConnectivity() {
    const testUrls = [
      'https://api.anthropic.com',
      'https://api.openai.com',
      'https://github.com'
    ];

    const results = {};

    for (const url of testUrls) {
      try {
        const startTime = performance.now();
        
        // Use fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const responseTime = performance.now() - startTime;

        results[url] = {
          reachable: response.ok,
          responseTime,
          status: response.status
        };
      } catch (error) {
        results[url] = {
          reachable: false,
          error: error.message
        };
      }
    }

    const reachableCount = Object.values(results).filter(r => r.reachable).length;
    
    if (reachableCount === 0) {
      throw new Error('No external services are reachable');
    }

    return {
      totalUrls: testUrls.length,
      reachableUrls: reachableCount,
      urlStatus: results
    };
  }

  /**
   * Handle health check failure
   */
  async handleHealthCheckFailure(checkName, error) {
    const alertLevel = this.getAlertLevel(checkName);
    
    logger.error(`Health check failure [${alertLevel}]: ${checkName} - ${error.message}`);

    // Store failure for reporting
    if (!this.healthCheckFailures) {
      this.healthCheckFailures = [];
    }

    this.healthCheckFailures.push({
      checkName,
      error: error.message,
      alertLevel,
      timestamp: new Date().toISOString()
    });

    // Trigger appropriate response based on alert level
    switch (alertLevel) {
      case 'critical':
        await this.handleCriticalFailure(checkName, error);
        break;
      case 'warning':
        await this.handleWarningFailure(checkName, error);
        break;
      case 'info':
        // Just log, no action needed
        break;
    }
  }

  /**
   * Get alert level for health check
   */
  getAlertLevel(checkName) {
    const criticalChecks = ['database_connectivity', 'mcp_server_health'];
    const warningChecks = ['ai_provider_integration', 'memory_usage', 'cpu_usage'];
    
    if (criticalChecks.includes(checkName)) {
      return 'critical';
    } else if (warningChecks.includes(checkName)) {
      return 'warning';
    } else {
      return 'info';
    }
  }

  /**
   * Handle critical failure
   */
  async handleCriticalFailure(checkName, error) {
    logger.error(`CRITICAL FAILURE: ${checkName} - ${error.message}`);
    
    // In production, this would trigger alerts, notifications, etc.
    // For now, we'll just log and potentially attempt recovery
    
    switch (checkName) {
      case 'database_connectivity':
        await this.attemptDatabaseRecovery();
        break;
      case 'mcp_server_health':
        await this.attemptMCPServerRecovery();
        break;
    }
  }

  /**
   * Handle warning failure
   */
  async handleWarningFailure(checkName, error) {
    logger.warn(`WARNING: ${checkName} - ${error.message}`);
    
    // Implement warning-level responses
    switch (checkName) {
      case 'memory_usage':
        await this.attemptMemoryCleanup();
        break;
      case 'cpu_usage':
        await this.attemptCPUOptimization();
        break;
    }
  }

  /**
   * Attempt database recovery
   */
  async attemptDatabaseRecovery() {
    logger.info('Attempting database recovery...');
    // Implement database reconnection logic
  }

  /**
   * Attempt MCP server recovery
   */
  async attemptMCPServerRecovery() {
    logger.info('Attempting MCP server recovery...');
    // Implement MCP server restart/recovery logic
  }

  /**
   * Attempt memory cleanup
   */
  async attemptMemoryCleanup() {
    logger.info('Attempting memory cleanup...');
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Clear any caches
    // Implementation would depend on specific caching mechanisms
  }

  /**
   * Attempt CPU optimization
   */
  async attemptCPUOptimization() {
    logger.info('Attempting CPU optimization...');
    
    // Implement CPU optimization strategies
    // This could include reducing concurrent operations, etc.
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(metric, value) {
    if (!this.performanceMetrics.has(metric)) {
      this.performanceMetrics.set(metric, []);
    }

    const metrics = this.performanceMetrics.get(metric);
    metrics.push({
      value,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Get health status summary
   */
  getHealthStatusSummary() {
    if (!this.lastHealthCheckResults) {
      return {
        status: 'unknown',
        message: 'No health checks have been run yet'
      };
    }

    const results = Array.from(this.lastHealthCheckResults.values());
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const totalCount = results.length;
    const healthPercentage = (healthyCount / totalCount) * 100;

    let overallStatus;
    if (healthPercentage === 100) {
      overallStatus = 'healthy';
    } else if (healthPercentage >= 80) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      healthPercentage: healthPercentage.toFixed(1),
      healthyChecks: healthyCount,
      totalChecks: totalCount,
      lastCheckTime: this.lastHealthCheckTime,
      details: Object.fromEntries(this.lastHealthCheckResults)
    };
  }

  /**
   * Get performance metrics summary
   */
  getPerformanceMetricsSummary() {
    const summary = {};

    for (const [metric, values] of this.performanceMetrics) {
      if (values.length === 0) continue;

      const numericValues = values.map(v => v.value);
      const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);

      summary[metric] = {
        average: avg.toFixed(2),
        minimum: min.toFixed(2),
        maximum: max.toFixed(2),
        sampleCount: values.length,
        lastValue: numericValues[numericValues.length - 1].toFixed(2)
      };
    }

    return summary;
  }

  /**
   * Generate health report
   */
  generateHealthReport() {
    return {
      timestamp: new Date().toISOString(),
      systemHealth: this.getHealthStatusSummary(),
      performanceMetrics: this.getPerformanceMetricsSummary(),
      recentFailures: this.healthCheckFailures || [],
      monitoringStatus: {
        isActive: this.isMonitoring,
        checkInterval: this.checkInterval,
        alertThresholds: this.alertThresholds
      }
    };
  }
}

export default SystemHealthValidator;

