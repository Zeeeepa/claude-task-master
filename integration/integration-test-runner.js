/**
 * Integration Test Runner
 * 
 * Main orchestrator for running comprehensive integration tests, system validation,
 * performance testing, and security validation for the claude-task-master system.
 */

import { IntegrationTestSuite } from './tests/e2e-scenarios.js';
import { SystemHealthValidator } from './health-checks/system-validator.js';
import { PerformanceLoadTester } from './performance/load-tester.js';
import { SecurityValidator } from './security/security-validator.js';
import logger from '../mcp-server/src/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Integration Test Runner Class
 */
export class IntegrationTestRunner {
  constructor(options = {}) {
    this.options = {
      runE2ETests: true,
      runHealthChecks: true,
      runPerformanceTests: true,
      runSecurityTests: true,
      generateReports: true,
      outputDirectory: './integration-reports',
      ...options
    };

    this.testSuite = null;
    this.healthValidator = null;
    this.loadTester = null;
    this.securityValidator = null;
    
    this.results = {
      startTime: null,
      endTime: null,
      duration: null,
      e2eResults: null,
      healthResults: null,
      performanceResults: null,
      securityResults: null,
      overallStatus: 'unknown',
      summary: {}
    };
  }

  /**
   * Initialize all test components
   */
  async initialize() {
    logger.info('Initializing integration test runner...');

    try {
      // Create output directory
      await this.ensureOutputDirectory();

      // Initialize test components
      if (this.options.runE2ETests) {
        this.testSuite = new IntegrationTestSuite();
        await this.testSuite.setup();
      }

      if (this.options.runHealthChecks) {
        this.healthValidator = new SystemHealthValidator();
        await this.healthValidator.initialize();
      }

      if (this.options.runPerformanceTests) {
        this.loadTester = new PerformanceLoadTester();
        await this.loadTester.initialize();
      }

      if (this.options.runSecurityTests) {
        this.securityValidator = new SecurityValidator();
        await this.securityValidator.initialize();
      }

      logger.info('Integration test runner initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize integration test runner: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    try {
      await fs.mkdir(this.options.outputDirectory, { recursive: true });
      logger.info(`Output directory created: ${this.options.outputDirectory}`);
    } catch (error) {
      logger.error(`Failed to create output directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    logger.info('Starting comprehensive integration testing...');
    
    this.results.startTime = new Date().toISOString();
    const startTime = Date.now();

    try {
      // Run E2E integration tests
      if (this.options.runE2ETests && this.testSuite) {
        logger.info('Running E2E integration tests...');
        this.results.e2eResults = await this.runE2ETests();
      }

      // Run system health validation
      if (this.options.runHealthChecks && this.healthValidator) {
        logger.info('Running system health validation...');
        this.results.healthResults = await this.runHealthValidation();
      }

      // Run performance tests
      if (this.options.runPerformanceTests && this.loadTester) {
        logger.info('Running performance tests...');
        this.results.performanceResults = await this.runPerformanceTests();
      }

      // Run security validation
      if (this.options.runSecurityTests && this.securityValidator) {
        logger.info('Running security validation...');
        this.results.securityResults = await this.runSecurityValidation();
      }

      // Calculate overall results
      const endTime = Date.now();
      this.results.endTime = new Date().toISOString();
      this.results.duration = endTime - startTime;
      this.results.overallStatus = this.calculateOverallStatus();
      this.results.summary = this.generateSummary();

      logger.info(`Integration testing completed in ${(this.results.duration / 1000).toFixed(2)} seconds`);
      logger.info(`Overall status: ${this.results.overallStatus}`);

      // Generate reports
      if (this.options.generateReports) {
        await this.generateReports();
      }

      return this.results;

    } catch (error) {
      logger.error(`Integration testing failed: ${error.message}`);
      this.results.overallStatus = 'failed';
      this.results.error = error.message;
      throw error;
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  /**
   * Run E2E integration tests
   */
  async runE2ETests() {
    try {
      const results = {
        happyPath: null,
        errorRecovery: null,
        concurrentOperations: null,
        edgeCases: null,
        testReport: null
      };

      // Run happy path scenario
      try {
        results.happyPath = await this.testSuite.runHappyPathScenario();
        logger.info('Happy path scenario completed successfully');
      } catch (error) {
        logger.error(`Happy path scenario failed: ${error.message}`);
        results.happyPath = { success: false, error: error.message };
      }

      // Run error recovery scenarios
      try {
        results.errorRecovery = await this.testSuite.runErrorRecoveryScenarios();
        logger.info('Error recovery scenarios completed');
      } catch (error) {
        logger.error(`Error recovery scenarios failed: ${error.message}`);
        results.errorRecovery = { success: false, error: error.message };
      }

      // Run concurrent operations test
      try {
        results.concurrentOperations = await this.testSuite.runConcurrentOperationsTest();
        logger.info('Concurrent operations test completed');
      } catch (error) {
        logger.error(`Concurrent operations test failed: ${error.message}`);
        results.concurrentOperations = { success: false, error: error.message };
      }

      // Run edge cases test
      try {
        results.edgeCases = await this.testSuite.runEdgeCasesTest();
        logger.info('Edge cases test completed');
      } catch (error) {
        logger.error(`Edge cases test failed: ${error.message}`);
        results.edgeCases = { success: false, error: error.message };
      }

      // Generate test report
      results.testReport = this.testSuite.generateTestReport();

      return results;

    } catch (error) {
      logger.error(`E2E tests failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run system health validation
   */
  async runHealthValidation() {
    try {
      const healthCheckResults = await this.healthValidator.runAllHealthChecks();
      const healthReport = this.healthValidator.generateHealthReport();

      return {
        healthChecks: healthCheckResults,
        healthReport,
        status: healthReport.systemHealth.status
      };

    } catch (error) {
      logger.error(`Health validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run performance tests
   */
  async runPerformanceTests() {
    try {
      // Run load tests
      const loadTestResults = await this.loadTester.runAllLoadTests();
      
      // Run E2E workflow performance test
      const e2eWorkflowResults = await this.loadTester.runE2EWorkflowPerformanceTest();
      
      // Generate performance report
      const performanceReport = this.loadTester.generatePerformanceReport(
        loadTestResults, 
        e2eWorkflowResults
      );

      return {
        loadTests: loadTestResults,
        e2eWorkflows: e2eWorkflowResults,
        performanceReport,
        slaCompliance: performanceReport.slaCompliance.overallCompliance
      };

    } catch (error) {
      logger.error(`Performance tests failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run security validation
   */
  async runSecurityValidation() {
    try {
      const securityTestResults = await this.securityValidator.runAllSecurityTests();
      const securityReport = this.securityValidator.generateSecurityReport(securityTestResults);

      return {
        securityTests: securityTestResults,
        securityReport,
        securityScore: securityReport.summary.securityScore,
        vulnerabilities: securityReport.vulnerabilities
      };

    } catch (error) {
      logger.error(`Security validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate overall status
   */
  calculateOverallStatus() {
    const statuses = [];

    // Check E2E test results
    if (this.results.e2eResults) {
      const e2eSuccess = this.results.e2eResults.testReport?.summary?.successRate;
      if (e2eSuccess && parseFloat(e2eSuccess) >= 80) {
        statuses.push('pass');
      } else {
        statuses.push('fail');
      }
    }

    // Check health validation results
    if (this.results.healthResults) {
      const healthStatus = this.results.healthResults.status;
      if (healthStatus === 'healthy') {
        statuses.push('pass');
      } else if (healthStatus === 'degraded') {
        statuses.push('warning');
      } else {
        statuses.push('fail');
      }
    }

    // Check performance test results
    if (this.results.performanceResults) {
      const slaCompliance = this.results.performanceResults.slaCompliance;
      if (slaCompliance) {
        statuses.push('pass');
      } else {
        statuses.push('fail');
      }
    }

    // Check security validation results
    if (this.results.securityResults) {
      const securityScore = parseFloat(this.results.securityResults.securityScore);
      const criticalVulns = this.results.securityResults.vulnerabilities?.critical || 0;
      
      if (criticalVulns > 0) {
        statuses.push('fail');
      } else if (securityScore >= 85) {
        statuses.push('pass');
      } else {
        statuses.push('warning');
      }
    }

    // Determine overall status
    if (statuses.includes('fail')) {
      return 'failed';
    } else if (statuses.includes('warning')) {
      return 'warning';
    } else if (statuses.length > 0) {
      return 'passed';
    } else {
      return 'unknown';
    }
  }

  /**
   * Generate summary
   */
  generateSummary() {
    const summary = {
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      categories: {}
    };

    // E2E test summary
    if (this.results.e2eResults?.testReport) {
      const e2eReport = this.results.e2eResults.testReport.summary;
      summary.categories.e2e = {
        total: e2eReport.total,
        passed: e2eReport.passed,
        failed: e2eReport.failed,
        successRate: e2eReport.successRate
      };
      summary.testsRun += e2eReport.total;
      summary.testsPassed += e2eReport.passed;
      summary.testsFailed += e2eReport.failed;
    }

    // Health check summary
    if (this.results.healthResults?.healthReport) {
      const healthReport = this.results.healthResults.healthReport.systemHealth;
      summary.categories.health = {
        total: healthReport.totalChecks,
        passed: healthReport.healthyChecks,
        failed: healthReport.totalChecks - healthReport.healthyChecks,
        healthPercentage: healthReport.healthPercentage
      };
      summary.testsRun += healthReport.totalChecks;
      summary.testsPassed += healthReport.healthyChecks;
      summary.testsFailed += (healthReport.totalChecks - healthReport.healthyChecks);
    }

    // Performance test summary
    if (this.results.performanceResults?.performanceReport) {
      const perfReport = this.results.performanceResults.performanceReport.summary;
      summary.categories.performance = {
        total: perfReport.totalScenarios,
        passed: perfReport.passedScenarios,
        failed: perfReport.failedScenarios,
        slaCompliance: this.results.performanceResults.slaCompliance
      };
      summary.testsRun += perfReport.totalScenarios;
      summary.testsPassed += perfReport.passedScenarios;
      summary.testsFailed += perfReport.failedScenarios;
    }

    // Security test summary
    if (this.results.securityResults?.securityReport) {
      const secReport = this.results.securityResults.securityReport.summary;
      summary.categories.security = {
        total: secReport.totalTests,
        passed: secReport.passedTests,
        failed: secReport.failedTests,
        securityScore: secReport.securityScore,
        criticalVulnerabilities: this.results.securityResults.vulnerabilities?.critical || 0
      };
      summary.testsRun += secReport.totalTests;
      summary.testsPassed += secReport.passedTests;
      summary.testsFailed += secReport.failedTests;
    }

    // Calculate overall success rate
    summary.overallSuccessRate = summary.testsRun > 0 
      ? `${((summary.testsPassed / summary.testsRun) * 100).toFixed(1)}%`
      : '0%';

    return summary;
  }

  /**
   * Generate comprehensive reports
   */
  async generateReports() {
    logger.info('Generating integration test reports...');

    try {
      // Generate main integration report
      await this.generateMainReport();

      // Generate individual component reports
      if (this.results.e2eResults) {
        await this.generateE2EReport();
      }

      if (this.results.healthResults) {
        await this.generateHealthReport();
      }

      if (this.results.performanceResults) {
        await this.generatePerformanceReport();
      }

      if (this.results.securityResults) {
        await this.generateSecurityReport();
      }

      // Generate executive summary
      await this.generateExecutiveSummary();

      logger.info(`Reports generated in: ${this.options.outputDirectory}`);

    } catch (error) {
      logger.error(`Failed to generate reports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate main integration report
   */
  async generateMainReport() {
    const report = {
      title: 'Claude Task Master - Integration Test Report',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      duration: this.results.duration,
      overallStatus: this.results.overallStatus,
      summary: this.results.summary,
      results: {
        e2e: this.results.e2eResults,
        health: this.results.healthResults,
        performance: this.results.performanceResults,
        security: this.results.securityResults
      },
      recommendations: this.generateRecommendations()
    };

    const reportPath = path.join(this.options.outputDirectory, 'integration-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    logger.info(`Main integration report saved: ${reportPath}`);
  }

  /**
   * Generate E2E test report
   */
  async generateE2EReport() {
    const reportPath = path.join(this.options.outputDirectory, 'e2e-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results.e2eResults, null, 2));
    
    logger.info(`E2E test report saved: ${reportPath}`);
  }

  /**
   * Generate health validation report
   */
  async generateHealthReport() {
    const reportPath = path.join(this.options.outputDirectory, 'health-validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results.healthResults, null, 2));
    
    logger.info(`Health validation report saved: ${reportPath}`);
  }

  /**
   * Generate performance test report
   */
  async generatePerformanceReport() {
    const reportPath = path.join(this.options.outputDirectory, 'performance-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results.performanceResults, null, 2));
    
    logger.info(`Performance test report saved: ${reportPath}`);
  }

  /**
   * Generate security validation report
   */
  async generateSecurityReport() {
    const reportPath = path.join(this.options.outputDirectory, 'security-validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results.securityResults, null, 2));
    
    logger.info(`Security validation report saved: ${reportPath}`);
  }

  /**
   * Generate executive summary
   */
  async generateExecutiveSummary() {
    const summary = {
      title: 'Claude Task Master - Integration Test Executive Summary',
      timestamp: new Date().toISOString(),
      overallStatus: this.results.overallStatus,
      keyMetrics: {
        totalTestsRun: this.results.summary.testsRun,
        overallSuccessRate: this.results.summary.overallSuccessRate,
        testDuration: `${(this.results.duration / 1000 / 60).toFixed(1)} minutes`,
        criticalIssues: this.getCriticalIssuesCount()
      },
      statusByCategory: this.results.summary.categories,
      topRecommendations: this.getTopRecommendations(),
      nextSteps: this.getNextSteps()
    };

    const summaryPath = path.join(this.options.outputDirectory, 'executive-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    logger.info(`Executive summary saved: ${summaryPath}`);
  }

  /**
   * Get critical issues count
   */
  getCriticalIssuesCount() {
    let criticalIssues = 0;

    // Count critical security vulnerabilities
    if (this.results.securityResults?.vulnerabilities?.critical) {
      criticalIssues += this.results.securityResults.vulnerabilities.critical;
    }

    // Count critical health issues
    if (this.results.healthResults?.healthReport?.systemHealth?.status === 'unhealthy') {
      criticalIssues += 1;
    }

    // Count critical performance issues
    if (this.results.performanceResults && !this.results.performanceResults.slaCompliance) {
      criticalIssues += 1;
    }

    return criticalIssues;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    // E2E test recommendations
    if (this.results.e2eResults?.testReport?.summary) {
      const successRate = parseFloat(this.results.e2eResults.testReport.summary.successRate);
      if (successRate < 90) {
        recommendations.push({
          priority: 'high',
          category: 'reliability',
          message: `E2E test success rate is ${successRate}% - investigate failing scenarios`
        });
      }
    }

    // Health check recommendations
    if (this.results.healthResults?.healthReport?.systemHealth?.status !== 'healthy') {
      recommendations.push({
        priority: 'high',
        category: 'system_health',
        message: 'System health issues detected - review health check failures'
      });
    }

    // Performance recommendations
    if (this.results.performanceResults && !this.results.performanceResults.slaCompliance) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        message: 'Performance SLA requirements not met - optimize system performance'
      });
    }

    // Security recommendations
    if (this.results.securityResults?.vulnerabilities?.critical > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'security',
        message: `${this.results.securityResults.vulnerabilities.critical} critical security vulnerabilities found - address immediately`
      });
    }

    return recommendations;
  }

  /**
   * Get top recommendations
   */
  getTopRecommendations() {
    const allRecommendations = this.generateRecommendations();
    
    // Sort by priority and return top 5
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    return allRecommendations
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 5);
  }

  /**
   * Get next steps
   */
  getNextSteps() {
    const nextSteps = [];

    if (this.results.overallStatus === 'failed') {
      nextSteps.push('Address critical failures before deployment');
      nextSteps.push('Re-run integration tests after fixes');
    } else if (this.results.overallStatus === 'warning') {
      nextSteps.push('Review and address warning-level issues');
      nextSteps.push('Consider deployment with monitoring');
    } else {
      nextSteps.push('System ready for deployment');
      nextSteps.push('Continue monitoring in production');
    }

    nextSteps.push('Schedule regular integration testing');
    nextSteps.push('Update test scenarios based on findings');

    return nextSteps;
  }

  /**
   * Cleanup all test components
   */
  async cleanup() {
    logger.info('Cleaning up integration test runner...');

    try {
      if (this.testSuite) {
        await this.testSuite.cleanup();
      }

      if (this.healthValidator) {
        this.healthValidator.stopMonitoring();
      }

      if (this.loadTester) {
        await this.loadTester.cleanup();
      }

      if (this.securityValidator) {
        await this.securityValidator.cleanup();
      }

      logger.info('Integration test runner cleanup complete');

    } catch (error) {
      logger.error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Get test results summary
   */
  getResultsSummary() {
    return {
      overallStatus: this.results.overallStatus,
      duration: this.results.duration,
      summary: this.results.summary,
      criticalIssues: this.getCriticalIssuesCount(),
      recommendations: this.getTopRecommendations()
    };
  }
}

export default IntegrationTestRunner;

