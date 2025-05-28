#!/usr/bin/env node

/**
 * Integration Test Runner Script
 * 
 * Main entry point for running comprehensive integration tests for the claude-task-master system.
 * This script orchestrates E2E testing, system health validation, performance testing, and security validation.
 */

import { IntegrationTestRunner } from './integration/integration-test-runner.js';
import logger from './mcp-server/src/logger.js';
import { fileURLToPath } from 'url';
import path from 'path';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse command line arguments and environment variables
 */
function parseOptions() {
    const options = {
        runE2ETests: process.env.RUN_E2E_TESTS !== 'false',
        runHealthChecks: process.env.RUN_HEALTH_CHECKS !== 'false',
        runPerformanceTests: process.env.RUN_PERFORMANCE_TESTS !== 'false',
        runSecurityTests: process.env.RUN_SECURITY_TESTS !== 'false',
        generateReports: process.env.GENERATE_REPORTS !== 'false',
        outputDirectory: process.env.INTEGRATION_REPORTS_DIR || './integration-reports',
        timeout: parseInt(process.env.INTEGRATION_TEST_TIMEOUT) || 300000,
        retries: parseInt(process.env.INTEGRATION_TEST_RETRIES) || 3,
        verbose: process.env.LOG_LEVEL === 'debug' || process.argv.includes('--verbose'),
        dryRun: process.argv.includes('--dry-run'),
        help: process.argv.includes('--help') || process.argv.includes('-h')
    };

    // Parse command line flags
    const args = process.argv.slice(2);
    for (const arg of args) {
        switch (arg) {
            case '--e2e-only':
                options.runHealthChecks = false;
                options.runPerformanceTests = false;
                options.runSecurityTests = false;
                break;
            case '--health-only':
                options.runE2ETests = false;
                options.runPerformanceTests = false;
                options.runSecurityTests = false;
                break;
            case '--performance-only':
                options.runE2ETests = false;
                options.runHealthChecks = false;
                options.runSecurityTests = false;
                break;
            case '--security-only':
                options.runE2ETests = false;
                options.runHealthChecks = false;
                options.runPerformanceTests = false;
                break;
            case '--no-reports':
                options.generateReports = false;
                break;
            case '--quick':
                options.timeout = 60000; // 1 minute
                options.runPerformanceTests = false;
                break;
        }
    }

    return options;
}

/**
 * Display help information
 */
function showHelp() {
    console.log(`
Claude Task Master - Integration Test Runner

Usage: node run-integration-tests.js [options]

Options:
  --e2e-only           Run only end-to-end tests
  --health-only        Run only health checks
  --performance-only   Run only performance tests
  --security-only      Run only security tests
  --no-reports         Skip report generation
  --quick              Quick test run (reduced timeout, no performance tests)
  --dry-run            Show what would be run without executing
  --verbose            Enable verbose logging
  --help, -h           Show this help message

Environment Variables:
  RUN_E2E_TESTS              Enable/disable E2E tests (default: true)
  RUN_HEALTH_CHECKS          Enable/disable health checks (default: true)
  RUN_PERFORMANCE_TESTS      Enable/disable performance tests (default: true)
  RUN_SECURITY_TESTS         Enable/disable security tests (default: true)
  GENERATE_REPORTS           Enable/disable report generation (default: true)
  INTEGRATION_REPORTS_DIR    Output directory for reports (default: ./integration-reports)
  INTEGRATION_TEST_TIMEOUT   Test timeout in milliseconds (default: 300000)
  INTEGRATION_TEST_RETRIES   Number of retry attempts (default: 3)
  LOG_LEVEL                  Logging level (debug, info, warn, error)

Examples:
  # Run all tests
  npm run test:integration

  # Run only E2E tests
  npm run test:integration:e2e

  # Run with debug logging
  LOG_LEVEL=debug npm run test:integration

  # Quick health check
  node run-integration-tests.js --health-only --quick

  # Dry run to see what would be executed
  node run-integration-tests.js --dry-run
`);
}

/**
 * Validate environment and prerequisites
 */
async function validateEnvironment() {
    const issues = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 14) {
        issues.push(`Node.js version ${nodeVersion} is below minimum required version 14.0.0`);
    }

    // Check required environment variables
    const requiredEnvVars = ['NODE_ENV'];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            issues.push(`Missing required environment variable: ${envVar}`);
        }
    }

    // Check for API keys (warn if missing)
    const apiKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
    const missingKeys = apiKeys.filter(key => !process.env[key]);
    if (missingKeys.length > 0) {
        logger.warn(`Missing API keys (some tests may be skipped): ${missingKeys.join(', ')}`);
    }

    // Check file system permissions
    try {
        const fs = await import('fs/promises');
        const testFile = path.join(__dirname, 'test-write-permissions.tmp');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
    } catch (error) {
        issues.push(`File system write permissions check failed: ${error.message}`);
    }

    if (issues.length > 0) {
        throw new Error(`Environment validation failed:\n${issues.map(issue => `  - ${issue}`).join('\n')}`);
    }

    logger.info('Environment validation passed');
}

/**
 * Display test configuration
 */
function displayConfiguration(options) {
    logger.info('Integration Test Configuration:');
    logger.info(`  E2E Tests: ${options.runE2ETests ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`  Health Checks: ${options.runHealthChecks ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`  Performance Tests: ${options.runPerformanceTests ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`  Security Tests: ${options.runSecurityTests ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`  Generate Reports: ${options.generateReports ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`  Output Directory: ${options.outputDirectory}`);
    logger.info(`  Timeout: ${options.timeout}ms`);
    logger.info(`  Retries: ${options.retries}`);
    logger.info(`  Verbose Logging: ${options.verbose ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Display test results summary
 */
function displayResults(results) {
    logger.info('\n' + '='.repeat(60));
    logger.info('INTEGRATION TEST RESULTS SUMMARY');
    logger.info('='.repeat(60));
    
    logger.info(`Overall Status: ${results.overallStatus.toUpperCase()}`);
    logger.info(`Total Duration: ${(results.duration / 1000 / 60).toFixed(2)} minutes`);
    
    if (results.summary) {
        logger.info(`\nTest Summary:`);
        logger.info(`  Total Tests: ${results.summary.testsRun}`);
        logger.info(`  Passed: ${results.summary.testsPassed}`);
        logger.info(`  Failed: ${results.summary.testsFailed}`);
        logger.info(`  Success Rate: ${results.summary.overallSuccessRate}`);
    }

    if (results.summary?.categories) {
        logger.info(`\nResults by Category:`);
        for (const [category, stats] of Object.entries(results.summary.categories)) {
            logger.info(`  ${category.toUpperCase()}:`);
            logger.info(`    Passed: ${stats.passed || 0}`);
            logger.info(`    Failed: ${stats.failed || 0}`);
            if (stats.successRate) {
                logger.info(`    Success Rate: ${stats.successRate}`);
            }
        }
    }

    // Display critical issues
    const criticalIssues = [];
    
    if (results.securityResults?.vulnerabilities?.critical > 0) {
        criticalIssues.push(`${results.securityResults.vulnerabilities.critical} critical security vulnerabilities`);
    }
    
    if (results.healthResults?.healthReport?.systemHealth?.status === 'unhealthy') {
        criticalIssues.push('System health checks failing');
    }
    
    if (results.performanceResults && !results.performanceResults.slaCompliance) {
        criticalIssues.push('Performance SLA requirements not met');
    }

    if (criticalIssues.length > 0) {
        logger.error(`\nCRITICAL ISSUES FOUND:`);
        criticalIssues.forEach(issue => logger.error(`  ⚠️  ${issue}`));
    }

    // Display report locations
    if (results.overallStatus !== 'failed') {
        logger.info(`\nDetailed reports available in: ${results.outputDirectory || './integration-reports'}`);
        logger.info(`  - integration-test-report.json (comprehensive report)`);
        logger.info(`  - executive-summary.json (executive summary)`);
        if (results.e2eResults) {
            logger.info(`  - e2e-test-report.json (E2E test details)`);
        }
        if (results.healthResults) {
            logger.info(`  - health-validation-report.json (health check details)`);
        }
        if (results.performanceResults) {
            logger.info(`  - performance-test-report.json (performance test details)`);
        }
        if (results.securityResults) {
            logger.info(`  - security-validation-report.json (security test details)`);
        }
    }

    logger.info('='.repeat(60));
}

/**
 * Main execution function
 */
async function main() {
    const startTime = Date.now();
    let exitCode = 0;

    try {
        // Parse options
        const options = parseOptions();

        // Show help if requested
        if (options.help) {
            showHelp();
            return;
        }

        // Set log level if verbose
        if (options.verbose) {
            process.env.LOG_LEVEL = 'debug';
        }

        logger.info('🚀 Starting Claude Task Master Integration Tests...');
        logger.info(`Timestamp: ${new Date().toISOString()}`);
        logger.info(`Node.js Version: ${process.version}`);
        logger.info(`Platform: ${process.platform} ${process.arch}`);

        // Display configuration
        displayConfiguration(options);

        // Dry run mode
        if (options.dryRun) {
            logger.info('\n🔍 DRY RUN MODE - No tests will be executed');
            logger.info('Configuration validated successfully');
            return;
        }

        // Validate environment
        await validateEnvironment();

        // Initialize and run integration tests
        const runner = new IntegrationTestRunner(options);
        
        logger.info('\n📋 Initializing integration test framework...');
        await runner.initialize();
        
        logger.info('🧪 Running integration tests...');
        const results = await runner.runAllTests();
        
        // Display results
        displayResults(results);
        
        // Set exit code based on results
        if (results.overallStatus === 'failed') {
            exitCode = 1;
            logger.error('❌ Integration tests FAILED');
        } else if (results.overallStatus === 'warning') {
            exitCode = 0; // Don't fail CI for warnings
            logger.warn('⚠️  Integration tests completed with WARNINGS');
        } else {
            logger.info('✅ Integration tests PASSED');
        }

        const duration = Date.now() - startTime;
        logger.info(`\n⏱️  Total execution time: ${(duration / 1000 / 60).toFixed(2)} minutes`);
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`❌ Integration test suite failed after ${(duration / 1000 / 60).toFixed(2)} minutes:`);
        logger.error(error.message);
        
        if (process.env.LOG_LEVEL === 'debug') {
            logger.error('Stack trace:', error.stack);
        }
        
        exitCode = 1;
    }

    // Exit with appropriate code
    process.exit(exitCode);
}

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise);
    logger.error('Reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error.message);
    if (process.env.LOG_LEVEL === 'debug') {
        logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(130); // 128 + SIGINT
});

process.on('SIGTERM', () => {
    logger.info('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(143); // 128 + SIGTERM
});

// Start the integration test runner
main();

