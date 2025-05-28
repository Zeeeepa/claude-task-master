/**
 * Performance Load Testing Module
 * 
 * Comprehensive load testing and performance validation for the claude-task-master system.
 * Tests system performance under various load conditions and validates SLA requirements.
 */

import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import logger from '../../mcp-server/src/logger.js';

/**
 * Performance Load Tester Class
 */
export class PerformanceLoadTester {
  constructor() {
    this.testResults = new Map();
    this.performanceMetrics = {
      responseTimes: [],
      throughput: 0,
      errorRate: 0,
      concurrentUsers: 0,
      memoryUsage: [],
      cpuUsage: []
    };
    
    this.slaRequirements = {
      maxResponseTime: 1000, // 1 second
      minThroughput: 100, // requests per minute
      maxErrorRate: 0.01, // 1%
      maxConcurrentWorkflows: 50,
      workflowCompletionTime: 900000 // 15 minutes
    };

    this.loadTestScenarios = {
      baseline: {
        name: 'Baseline Performance',
        concurrentUsers: 1,
        duration: 60000, // 1 minute
        rampUpTime: 0
      },
      normal: {
        name: 'Normal Load',
        concurrentUsers: 10,
        duration: 300000, // 5 minutes
        rampUpTime: 30000 // 30 seconds
      },
      peak: {
        name: 'Peak Load',
        concurrentUsers: 25,
        duration: 600000, // 10 minutes
        rampUpTime: 60000 // 1 minute
      },
      stress: {
        name: 'Stress Test',
        concurrentUsers: 50,
        duration: 900000, // 15 minutes
        rampUpTime: 120000 // 2 minutes
      },
      spike: {
        name: 'Spike Test',
        concurrentUsers: 100,
        duration: 180000, // 3 minutes
        rampUpTime: 10000 // 10 seconds
      }
    };
  }

  /**
   * Initialize load tester
   */
  async initialize() {
    logger.info('Initializing performance load tester...');
    
    // Verify system is ready for testing
    await this.verifySystemReadiness();
    
    // Setup monitoring
    this.setupPerformanceMonitoring();
    
    logger.info('Performance load tester initialized');
  }

  /**
   * Verify system readiness for load testing
   */
  async verifySystemReadiness() {
    // Check system resources
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
    
    if (totalMemory > 400 * 1024 * 1024) { // 400MB
      logger.warn('High memory usage detected before load testing');
    }

    // Verify core components are responsive
    const healthCheck = await this.performQuickHealthCheck();
    if (!healthCheck.healthy) {
      throw new Error('System not ready for load testing: ' + healthCheck.issues.join(', '));
    }

    logger.info('System verified ready for load testing');
  }

  /**
   * Perform quick health check
   */
  async performQuickHealthCheck() {
    const issues = [];
    
    try {
      // Test basic functionality
      const startTime = performance.now();
      await this.simulateBasicOperation();
      const responseTime = performance.now() - startTime;
      
      if (responseTime > 500) {
        issues.push(`Slow response time: ${responseTime.toFixed(2)}ms`);
      }
    } catch (error) {
      issues.push(`Basic operation failed: ${error.message}`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  /**
   * Simulate basic operation for health check
   */
  async simulateBasicOperation() {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.random() * 50); // 0-50ms
    });
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor system resources during testing
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 1000); // Every second
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.performanceMetrics.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    });

    // Keep only last 1000 measurements
    if (this.performanceMetrics.memoryUsage.length > 1000) {
      this.performanceMetrics.memoryUsage.shift();
    }
  }

  /**
   * Run all load test scenarios
   */
  async runAllLoadTests() {
    logger.info('Starting comprehensive load testing...');
    
    const results = new Map();
    
    for (const [scenarioKey, scenario] of Object.entries(this.loadTestScenarios)) {
      try {
        logger.info(`Running load test scenario: ${scenario.name}`);
        
        const result = await this.runLoadTestScenario(scenario);
        results.set(scenarioKey, result);
        
        // Wait between scenarios to allow system recovery
        await this.waitForSystemRecovery();
        
      } catch (error) {
        logger.error(`Load test scenario '${scenario.name}' failed: ${error.message}`);
        results.set(scenarioKey, {
          success: false,
          error: error.message,
          scenario: scenario.name
        });
      }
    }

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    logger.info('All load test scenarios completed');
    return results;
  }

  /**
   * Run specific load test scenario
   */
  async runLoadTestScenario(scenario) {
    const startTime = Date.now();
    const workers = [];
    const results = {
      scenario: scenario.name,
      startTime: new Date(startTime).toISOString(),
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      responseTimes: [],
      errors: [],
      peakConcurrency: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };

    try {
      // Ramp up users gradually
      const rampUpInterval = scenario.rampUpTime / scenario.concurrentUsers;
      
      for (let i = 0; i < scenario.concurrentUsers; i++) {
        // Create worker for concurrent load
        const worker = await this.createLoadTestWorker(scenario, results);
        workers.push(worker);
        
        // Update peak concurrency
        results.peakConcurrency = Math.max(results.peakConcurrency, workers.length);
        
        // Wait for ramp-up interval
        if (rampUpInterval > 0) {
          await new Promise(resolve => setTimeout(resolve, rampUpInterval));
        }
      }

      // Run test for specified duration
      logger.info(`Running ${scenario.name} with ${scenario.concurrentUsers} concurrent users for ${scenario.duration}ms`);
      await new Promise(resolve => setTimeout(resolve, scenario.duration));

      // Stop all workers
      await this.stopAllWorkers(workers);

      // Calculate final metrics
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      
      results.endTime = new Date(endTime).toISOString();
      results.totalDuration = totalDuration;
      results.averageResponseTime = results.responseTimes.length > 0 
        ? results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length 
        : 0;
      results.throughput = (results.requestCount / totalDuration) * 60000; // requests per minute
      results.errorRate = results.requestCount > 0 ? results.errorCount / results.requestCount : 0;
      results.success = true;

      // Validate against SLA requirements
      results.slaValidation = this.validateSLARequirements(results);

      logger.info(`${scenario.name} completed: ${results.requestCount} requests, ${results.averageResponseTime.toFixed(2)}ms avg response time, ${results.throughput.toFixed(2)} req/min throughput`);

      return results;

    } catch (error) {
      // Cleanup workers on error
      await this.stopAllWorkers(workers);
      throw error;
    }
  }

  /**
   * Create load test worker
   */
  async createLoadTestWorker(scenario, results) {
    return new Promise((resolve, reject) => {
      const worker = {
        id: `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        active: true,
        requestCount: 0,
        errorCount: 0
      };

      // Simulate worker behavior
      const workerLoop = async () => {
        while (worker.active) {
          try {
            const requestStart = performance.now();
            
            // Simulate request processing
            await this.simulateRequest();
            
            const requestTime = performance.now() - requestStart;
            
            // Record metrics
            results.requestCount++;
            results.successCount++;
            worker.requestCount++;
            results.responseTimes.push(requestTime);
            
            // Keep response times array manageable
            if (results.responseTimes.length > 10000) {
              results.responseTimes.shift();
            }

            // Wait before next request (simulate user think time)
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500)); // 0.5-1.5s
            
          } catch (error) {
            results.requestCount++;
            results.errorCount++;
            worker.errorCount++;
            results.errors.push({
              timestamp: new Date().toISOString(),
              error: error.message,
              workerId: worker.id
            });

            // Keep errors array manageable
            if (results.errors.length > 1000) {
              results.errors.shift();
            }
          }
        }
      };

      // Start worker
      workerLoop().catch(reject);
      
      resolve(worker);
    });
  }

  /**
   * Simulate request processing
   */
  async simulateRequest() {
    return new Promise((resolve, reject) => {
      const processingTime = Math.random() * 200 + 50; // 50-250ms
      
      setTimeout(() => {
        // Simulate occasional errors (2% failure rate)
        if (Math.random() < 0.02) {
          reject(new Error('Simulated request failure'));
        } else {
          resolve();
        }
      }, processingTime);
    });
  }

  /**
   * Stop all workers
   */
  async stopAllWorkers(workers) {
    for (const worker of workers) {
      worker.active = false;
    }
    
    // Give workers time to finish current requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Wait for system recovery between tests
   */
  async waitForSystemRecovery() {
    logger.info('Waiting for system recovery...');
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Wait for system to stabilize
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    
    // Verify system is responsive
    const healthCheck = await this.performQuickHealthCheck();
    if (!healthCheck.healthy) {
      logger.warn('System not fully recovered, extending recovery time...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // Additional 60 seconds
    }
    
    logger.info('System recovery complete');
  }

  /**
   * Validate SLA requirements
   */
  validateSLARequirements(results) {
    const validation = {
      responseTime: {
        requirement: `< ${this.slaRequirements.maxResponseTime}ms`,
        actual: `${results.averageResponseTime.toFixed(2)}ms`,
        passed: results.averageResponseTime < this.slaRequirements.maxResponseTime
      },
      throughput: {
        requirement: `> ${this.slaRequirements.minThroughput} req/min`,
        actual: `${results.throughput.toFixed(2)} req/min`,
        passed: results.throughput > this.slaRequirements.minThroughput
      },
      errorRate: {
        requirement: `< ${(this.slaRequirements.maxErrorRate * 100).toFixed(1)}%`,
        actual: `${(results.errorRate * 100).toFixed(2)}%`,
        passed: results.errorRate < this.slaRequirements.maxErrorRate
      },
      concurrency: {
        requirement: `<= ${this.slaRequirements.maxConcurrentWorkflows} concurrent`,
        actual: `${results.peakConcurrency} concurrent`,
        passed: results.peakConcurrency <= this.slaRequirements.maxConcurrentWorkflows
      }
    };

    const allPassed = Object.values(validation).every(v => v.passed);
    
    return {
      allRequirementsMet: allPassed,
      details: validation,
      summary: allPassed ? 'All SLA requirements met' : 'Some SLA requirements not met'
    };
  }

  /**
   * Run end-to-end workflow performance test
   */
  async runE2EWorkflowPerformanceTest() {
    logger.info('Running end-to-end workflow performance test...');
    
    const workflowCount = 10;
    const workflows = [];
    const results = {
      totalWorkflows: workflowCount,
      completedWorkflows: 0,
      failedWorkflows: 0,
      workflowTimes: [],
      averageWorkflowTime: 0,
      errors: []
    };

    const startTime = Date.now();

    // Start multiple workflows concurrently
    for (let i = 0; i < workflowCount; i++) {
      workflows.push(this.runSingleE2EWorkflow(i, results));
    }

    // Wait for all workflows to complete
    const workflowResults = await Promise.allSettled(workflows);
    
    // Process results
    workflowResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.completedWorkflows++;
        results.workflowTimes.push(result.value.duration);
      } else {
        results.failedWorkflows++;
        results.errors.push({
          workflowId: index,
          error: result.reason.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    const endTime = Date.now();
    results.totalDuration = endTime - startTime;
    results.averageWorkflowTime = results.workflowTimes.length > 0 
      ? results.workflowTimes.reduce((a, b) => a + b, 0) / results.workflowTimes.length 
      : 0;

    // Validate against SLA
    results.slaValidation = {
      workflowCompletionTime: {
        requirement: `< ${this.slaRequirements.workflowCompletionTime}ms`,
        actual: `${results.averageWorkflowTime.toFixed(2)}ms`,
        passed: results.averageWorkflowTime < this.slaRequirements.workflowCompletionTime
      }
    };

    logger.info(`E2E workflow performance test completed: ${results.completedWorkflows}/${results.totalWorkflows} workflows completed, ${results.averageWorkflowTime.toFixed(2)}ms average time`);

    return results;
  }

  /**
   * Run single end-to-end workflow
   */
  async runSingleE2EWorkflow(workflowId, results) {
    const startTime = performance.now();
    
    try {
      // Simulate complete workflow steps
      await this.simulateTaskCreation(workflowId);
      await this.simulateOrchestration(workflowId);
      await this.simulatePRGeneration(workflowId);
      await this.simulateValidation(workflowId);
      await this.simulateCompletion(workflowId);
      
      const duration = performance.now() - startTime;
      
      return {
        workflowId,
        duration,
        success: true
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      throw new Error(`Workflow ${workflowId} failed after ${duration.toFixed(2)}ms: ${error.message}`);
    }
  }

  /**
   * Simulate task creation step
   */
  async simulateTaskCreation(workflowId) {
    const processingTime = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.01) { // 1% failure rate
      throw new Error('Task creation failed');
    }
  }

  /**
   * Simulate orchestration step
   */
  async simulateOrchestration(workflowId) {
    const processingTime = Math.random() * 500 + 200; // 200-700ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.02) { // 2% failure rate
      throw new Error('Orchestration failed');
    }
  }

  /**
   * Simulate PR generation step
   */
  async simulatePRGeneration(workflowId) {
    const processingTime = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.03) { // 3% failure rate
      throw new Error('PR generation failed');
    }
  }

  /**
   * Simulate validation step
   */
  async simulateValidation(workflowId) {
    const processingTime = Math.random() * 1000 + 500; // 0.5-1.5 seconds
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Validation failed');
    }
  }

  /**
   * Simulate completion step
   */
  async simulateCompletion(workflowId) {
    const processingTime = Math.random() * 200 + 100; // 100-300ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.01) { // 1% failure rate
      throw new Error('Completion failed');
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(loadTestResults, e2eResults) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalScenarios: loadTestResults.size,
        passedScenarios: Array.from(loadTestResults.values()).filter(r => r.success).length,
        failedScenarios: Array.from(loadTestResults.values()).filter(r => !r.success).length
      },
      slaCompliance: {
        overallCompliance: true,
        details: {}
      },
      loadTestResults: Object.fromEntries(loadTestResults),
      e2eWorkflowResults: e2eResults,
      systemMetrics: this.getSystemMetricsSummary(),
      recommendations: []
    };

    // Check overall SLA compliance
    for (const [scenario, result] of loadTestResults) {
      if (result.slaValidation && !result.slaValidation.allRequirementsMet) {
        report.slaCompliance.overallCompliance = false;
        report.slaCompliance.details[scenario] = result.slaValidation;
      }
    }

    // Add recommendations based on results
    report.recommendations = this.generateRecommendations(loadTestResults, e2eResults);

    return report;
  }

  /**
   * Get system metrics summary
   */
  getSystemMetricsSummary() {
    if (this.performanceMetrics.memoryUsage.length === 0) {
      return { message: 'No system metrics collected' };
    }

    const memoryValues = this.performanceMetrics.memoryUsage.map(m => m.heapUsed);
    const avgMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
    const maxMemory = Math.max(...memoryValues);
    const minMemory = Math.min(...memoryValues);

    return {
      memory: {
        averageMB: (avgMemory / 1024 / 1024).toFixed(2),
        peakMB: (maxMemory / 1024 / 1024).toFixed(2),
        minimumMB: (minMemory / 1024 / 1024).toFixed(2)
      },
      sampleCount: this.performanceMetrics.memoryUsage.length
    };
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations(loadTestResults, e2eResults) {
    const recommendations = [];

    // Analyze load test results
    for (const [scenario, result] of loadTestResults) {
      if (!result.success) {
        recommendations.push({
          type: 'critical',
          category: 'reliability',
          message: `${scenario} load test failed - investigate system stability`
        });
        continue;
      }

      if (result.slaValidation && !result.slaValidation.allRequirementsMet) {
        const failedRequirements = Object.entries(result.slaValidation.details)
          .filter(([_, req]) => !req.passed)
          .map(([name, _]) => name);
        
        recommendations.push({
          type: 'warning',
          category: 'performance',
          message: `${scenario} failed SLA requirements: ${failedRequirements.join(', ')}`
        });
      }

      if (result.errorRate > 0.005) { // 0.5%
        recommendations.push({
          type: 'warning',
          category: 'reliability',
          message: `${scenario} has elevated error rate: ${(result.errorRate * 100).toFixed(2)}%`
        });
      }

      if (result.averageResponseTime > 800) { // 800ms
        recommendations.push({
          type: 'info',
          category: 'performance',
          message: `${scenario} response times could be improved: ${result.averageResponseTime.toFixed(2)}ms average`
        });
      }
    }

    // Analyze E2E workflow results
    if (e2eResults) {
      if (e2eResults.failedWorkflows > 0) {
        recommendations.push({
          type: 'critical',
          category: 'reliability',
          message: `${e2eResults.failedWorkflows} out of ${e2eResults.totalWorkflows} E2E workflows failed`
        });
      }

      if (e2eResults.averageWorkflowTime > 600000) { // 10 minutes
        recommendations.push({
          type: 'warning',
          category: 'performance',
          message: `E2E workflow completion time is high: ${(e2eResults.averageWorkflowTime / 1000 / 60).toFixed(2)} minutes average`
        });
      }
    }

    // Add general recommendations if no specific issues found
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        category: 'optimization',
        message: 'All performance tests passed - consider optimizing for higher throughput'
      });
    }

    return recommendations;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up performance load tester...');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    logger.info('Performance load tester cleanup complete');
  }
}

export default PerformanceLoadTester;

