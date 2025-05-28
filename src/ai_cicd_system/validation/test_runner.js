/**
 * @fileoverview Test Runner
 * @description Comprehensive test execution for unit and integration tests
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Test Runner for comprehensive test execution and analysis
 */
export class TestRunner {
    constructor(config = {}) {
        this.config = {
            enable_unit_tests: config.enable_unit_tests !== false,
            enable_integration_tests: config.enable_integration_tests !== false,
            enable_coverage: config.enable_coverage !== false,
            timeout: config.timeout || 600000, // 10 minutes
            coverage_threshold: config.coverage_threshold || 80,
            parallel_execution: config.parallel_execution !== false,
            max_parallel_tests: config.max_parallel_tests || 4,
            ...config
        };

        this.testFrameworks = {
            javascript: {
                unit: {
                    jest: {
                        command: 'npx',
                        args: ['jest', '--json', '--coverage'],
                        config_files: ['jest.config.js', 'jest.config.json', 'package.json']
                    },
                    mocha: {
                        command: 'npx',
                        args: ['mocha', '--reporter', 'json'],
                        config_files: ['.mocharc.json', 'mocha.opts']
                    }
                },
                integration: {
                    cypress: {
                        command: 'npx',
                        args: ['cypress', 'run', '--reporter', 'json'],
                        config_files: ['cypress.config.js']
                    },
                    playwright: {
                        command: 'npx',
                        args: ['playwright', 'test', '--reporter=json'],
                        config_files: ['playwright.config.js']
                    }
                }
            },
            python: {
                unit: {
                    pytest: {
                        command: 'python',
                        args: ['-m', 'pytest', '--json-report', '--json-report-file=test-results.json'],
                        config_files: ['pytest.ini', 'pyproject.toml', 'setup.cfg']
                    },
                    unittest: {
                        command: 'python',
                        args: ['-m', 'unittest', 'discover', '-v'],
                        config_files: []
                    }
                }
            },
            java: {
                unit: {
                    junit: {
                        command: 'mvn',
                        args: ['test', '-Dmaven.test.failure.ignore=true'],
                        config_files: ['pom.xml']
                    }
                }
            }
        };

        this.testMetrics = {
            total_tests: 0,
            passed_tests: 0,
            failed_tests: 0,
            skipped_tests: 0,
            coverage_percentage: 0,
            test_duration: 0
        };
    }

    /**
     * Initialize the test runner
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Test Runner...');
        
        // Check available test frameworks
        await this.detectAvailableFrameworks();
        
        log('debug', 'Test Runner initialized');
    }

    /**
     * Run unit tests
     * @param {Object} config - Test configuration
     * @returns {Promise<Object>} Unit test results
     */
    async runUnitTests(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running unit tests in workspace: ${workspace.path}`);
        
        try {
            // Reset metrics
            this.testMetrics = {
                total_tests: 0,
                passed_tests: 0,
                failed_tests: 0,
                skipped_tests: 0,
                coverage_percentage: 0,
                test_duration: 0
            };

            // Detect test frameworks and configurations
            const detectedFrameworks = await this.detectTestFrameworks(workspace.path, 'unit');
            
            if (detectedFrameworks.length === 0) {
                return {
                    status: 'completed',
                    result: {
                        test_results: [],
                        coverage: null,
                        summary: 'No unit test frameworks detected',
                        metrics: {
                            duration_ms: Date.now() - startTime,
                            frameworks_detected: 0
                        }
                    }
                };
            }

            // Run tests for each detected framework
            const testResults = [];
            for (const framework of detectedFrameworks) {
                const result = await this.runFrameworkTests(
                    framework,
                    workspace.path,
                    secureEnvironment,
                    'unit'
                );
                testResults.push(result);
            }

            // Aggregate results
            const aggregatedResult = this.aggregateTestResults(testResults, 'unit');
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        ...this.testMetrics,
                        duration_ms: Date.now() - startTime,
                        frameworks_used: detectedFrameworks.map(f => f.name)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Unit tests failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    test_results: [],
                    issues: [{
                        type: 'test_execution_error',
                        severity: 'high',
                        message: `Unit test execution failed: ${error.message}`,
                        category: 'testing'
                    }],
                    metrics: {
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Run integration tests
     * @param {Object} config - Test configuration
     * @returns {Promise<Object>} Integration test results
     */
    async runIntegrationTests(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running integration tests in workspace: ${workspace.path}`);
        
        try {
            // Detect integration test frameworks
            const detectedFrameworks = await this.detectTestFrameworks(workspace.path, 'integration');
            
            if (detectedFrameworks.length === 0) {
                return {
                    status: 'completed',
                    result: {
                        test_results: [],
                        summary: 'No integration test frameworks detected',
                        metrics: {
                            duration_ms: Date.now() - startTime,
                            frameworks_detected: 0
                        }
                    }
                };
            }

            // Run integration tests
            const testResults = [];
            for (const framework of detectedFrameworks) {
                const result = await this.runFrameworkTests(
                    framework,
                    workspace.path,
                    secureEnvironment,
                    'integration'
                );
                testResults.push(result);
            }

            // Aggregate results
            const aggregatedResult = this.aggregateTestResults(testResults, 'integration');
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        duration_ms: Date.now() - startTime,
                        frameworks_used: detectedFrameworks.map(f => f.name)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Integration tests failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    test_results: [],
                    issues: [{
                        type: 'integration_test_error',
                        severity: 'high',
                        message: `Integration test execution failed: ${error.message}`,
                        category: 'testing'
                    }],
                    metrics: {
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Detect available test frameworks in workspace
     * @param {string} workspacePath - Workspace path
     * @param {string} testType - Type of tests ('unit' or 'integration')
     * @returns {Promise<Array>} Array of detected frameworks
     */
    async detectTestFrameworks(workspacePath, testType) {
        const detected = [];
        
        // Check for package.json to determine language
        const packageJsonPath = join(workspacePath, 'package.json');
        if (await this.fileExists(packageJsonPath)) {
            // JavaScript/TypeScript project
            const jsFrameworks = this.testFrameworks.javascript[testType];
            
            for (const [name, framework] of Object.entries(jsFrameworks)) {
                // Check if framework is configured
                const isConfigured = await this.isFrameworkConfigured(
                    workspacePath, 
                    framework.config_files
                );
                
                if (isConfigured) {
                    detected.push({
                        name,
                        language: 'javascript',
                        type: testType,
                        framework: framework
                    });
                }
            }
        }
        
        // Check for Python projects
        const pythonFiles = ['requirements.txt', 'pyproject.toml', 'setup.py'];
        for (const file of pythonFiles) {
            if (await this.fileExists(join(workspacePath, file))) {
                const pythonFrameworks = this.testFrameworks.python[testType];
                
                for (const [name, framework] of Object.entries(pythonFrameworks)) {
                    const isConfigured = await this.isFrameworkConfigured(
                        workspacePath, 
                        framework.config_files
                    );
                    
                    if (isConfigured || name === 'pytest') { // pytest is default
                        detected.push({
                            name,
                            language: 'python',
                            type: testType,
                            framework: framework
                        });
                    }
                }
                break;
            }
        }
        
        return detected;
    }

    /**
     * Check if a test framework is configured
     * @param {string} workspacePath - Workspace path
     * @param {Array} configFiles - Array of possible config files
     * @returns {Promise<boolean>} True if framework is configured
     */
    async isFrameworkConfigured(workspacePath, configFiles) {
        if (configFiles.length === 0) return true; // No config required
        
        for (const configFile of configFiles) {
            if (await this.fileExists(join(workspacePath, configFile))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Run tests for a specific framework
     * @param {Object} frameworkInfo - Framework information
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @param {string} testType - Test type
     * @returns {Promise<Object>} Test execution result
     */
    async runFrameworkTests(frameworkInfo, workspacePath, secureEnvironment, testType) {
        const { name, framework } = frameworkInfo;
        const startTime = Date.now();
        
        log('debug', `Running ${name} ${testType} tests`);
        
        try {
            // Prepare test command
            const command = [framework.command, ...framework.args];
            
            // Execute tests
            const result = await this.executeCommand(command, workspacePath, secureEnvironment);
            
            // Parse test results
            const parsedResults = await this.parseTestResults(result, name, workspacePath);
            
            return {
                framework: name,
                type: testType,
                success: result.success,
                duration_ms: Date.now() - startTime,
                results: parsedResults,
                raw_output: {
                    stdout: result.stdout,
                    stderr: result.stderr
                }
            };
            
        } catch (error) {
            log('error', `Failed to run ${name} tests: ${error.message}`);
            return {
                framework: name,
                type: testType,
                success: false,
                duration_ms: Date.now() - startTime,
                error: error.message,
                results: {
                    total: 0,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    tests: [],
                    coverage: null
                }
            };
        }
    }

    /**
     * Parse test results from framework output
     * @param {Object} commandResult - Command execution result
     * @param {string} framework - Framework name
     * @param {string} workspacePath - Workspace path
     * @returns {Promise<Object>} Parsed test results
     */
    async parseTestResults(commandResult, framework, workspacePath) {
        const defaultResult = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: [],
            coverage: null
        };
        
        try {
            if (framework === 'jest') {
                return await this.parseJestResults(commandResult, workspacePath);
            } else if (framework === 'mocha') {
                return await this.parseMochaResults(commandResult);
            } else if (framework === 'pytest') {
                return await this.parsePytestResults(commandResult, workspacePath);
            } else if (framework === 'cypress') {
                return await this.parseCypressResults(commandResult);
            } else if (framework === 'playwright') {
                return await this.parsePlaywrightResults(commandResult);
            }
            
            // Fallback: parse from stdout/stderr
            return this.parseGenericTestOutput(commandResult);
            
        } catch (error) {
            log('warning', `Failed to parse ${framework} results: ${error.message}`);
            return defaultResult;
        }
    }

    /**
     * Parse Jest test results
     * @param {Object} commandResult - Command result
     * @param {string} workspacePath - Workspace path
     * @returns {Promise<Object>} Parsed Jest results
     */
    async parseJestResults(commandResult, workspacePath) {
        try {
            const output = commandResult.stdout;
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const jestResult = JSON.parse(jsonMatch[0]);
                
                const tests = [];
                if (jestResult.testResults) {
                    for (const testFile of jestResult.testResults) {
                        for (const test of testFile.assertionResults || []) {
                            tests.push({
                                name: test.title,
                                file: testFile.name,
                                status: test.status,
                                duration: test.duration,
                                error: test.failureMessages?.[0]
                            });
                        }
                    }
                }
                
                return {
                    total: jestResult.numTotalTests || 0,
                    passed: jestResult.numPassedTests || 0,
                    failed: jestResult.numFailedTests || 0,
                    skipped: jestResult.numPendingTests || 0,
                    tests: tests,
                    coverage: jestResult.coverageMap ? this.parseCoverage(jestResult.coverageMap) : null
                };
            }
        } catch (error) {
            log('warning', `Failed to parse Jest JSON output: ${error.message}`);
        }
        
        return this.parseGenericTestOutput(commandResult);
    }

    /**
     * Parse pytest results
     * @param {Object} commandResult - Command result
     * @param {string} workspacePath - Workspace path
     * @returns {Promise<Object>} Parsed pytest results
     */
    async parsePytestResults(commandResult, workspacePath) {
        try {
            // Check for JSON report file
            const reportPath = join(workspacePath, 'test-results.json');
            if (await this.fileExists(reportPath)) {
                const reportContent = await fs.readFile(reportPath, 'utf8');
                const pytestResult = JSON.parse(reportContent);
                
                const tests = [];
                if (pytestResult.tests) {
                    for (const test of pytestResult.tests) {
                        tests.push({
                            name: test.nodeid,
                            file: test.file,
                            status: test.outcome,
                            duration: test.duration,
                            error: test.call?.longrepr
                        });
                    }
                }
                
                return {
                    total: pytestResult.summary?.total || 0,
                    passed: pytestResult.summary?.passed || 0,
                    failed: pytestResult.summary?.failed || 0,
                    skipped: pytestResult.summary?.skipped || 0,
                    tests: tests,
                    coverage: null // Coverage would need separate tool
                };
            }
        } catch (error) {
            log('warning', `Failed to parse pytest JSON report: ${error.message}`);
        }
        
        return this.parseGenericTestOutput(commandResult);
    }

    /**
     * Parse generic test output
     * @param {Object} commandResult - Command result
     * @returns {Object} Basic parsed results
     */
    parseGenericTestOutput(commandResult) {
        const output = commandResult.stdout + commandResult.stderr;
        
        // Basic pattern matching for common test output formats
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        
        // Look for common patterns
        const passedMatch = output.match(/(\d+)\s+passed/i);
        const failedMatch = output.match(/(\d+)\s+failed/i);
        const skippedMatch = output.match(/(\d+)\s+skipped/i);
        
        if (passedMatch) passed = parseInt(passedMatch[1]);
        if (failedMatch) failed = parseInt(failedMatch[1]);
        if (skippedMatch) skipped = parseInt(skippedMatch[1]);
        
        return {
            total: passed + failed + skipped,
            passed: passed,
            failed: failed,
            skipped: skipped,
            tests: [],
            coverage: null
        };
    }

    /**
     * Parse coverage information
     * @param {Object} coverageMap - Coverage map from test framework
     * @returns {Object} Parsed coverage information
     */
    parseCoverage(coverageMap) {
        // Simplified coverage parsing
        let totalLines = 0;
        let coveredLines = 0;
        
        for (const file of Object.values(coverageMap)) {
            if (file.s) { // Statement coverage
                const statements = Object.values(file.s);
                totalLines += statements.length;
                coveredLines += statements.filter(count => count > 0).length;
            }
        }
        
        const percentage = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
        
        return {
            percentage: Math.round(percentage * 100) / 100,
            lines_covered: coveredLines,
            lines_total: totalLines,
            threshold_met: percentage >= this.config.coverage_threshold
        };
    }

    /**
     * Aggregate test results from multiple frameworks
     * @param {Array} testResults - Array of test results
     * @param {string} testType - Test type
     * @returns {Object} Aggregated results
     */
    aggregateTestResults(testResults, testType) {
        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;
        let skippedTests = 0;
        let totalDuration = 0;
        
        const allTests = [];
        const issues = [];
        let coverage = null;
        
        for (const result of testResults) {
            if (result.results) {
                totalTests += result.results.total || 0;
                passedTests += result.results.passed || 0;
                failedTests += result.results.failed || 0;
                skippedTests += result.results.skipped || 0;
                totalDuration += result.duration_ms || 0;
                
                if (result.results.tests) {
                    allTests.push(...result.results.tests);
                }
                
                if (result.results.coverage && !coverage) {
                    coverage = result.results.coverage;
                }
                
                // Add failed tests as issues
                if (result.results.tests) {
                    for (const test of result.results.tests) {
                        if (test.status === 'failed' || test.status === 'error') {
                            issues.push({
                                type: 'test_failure',
                                severity: 'high',
                                message: `Test failed: ${test.name}`,
                                file: test.file,
                                category: 'testing',
                                details: {
                                    test_name: test.name,
                                    error_message: test.error,
                                    framework: result.framework
                                }
                            });
                        }
                    }
                }
            }
            
            if (!result.success && result.error) {
                issues.push({
                    type: 'test_execution_error',
                    severity: 'high',
                    message: `${result.framework} execution failed: ${result.error}`,
                    category: 'testing'
                });
            }
        }
        
        // Update metrics
        this.testMetrics = {
            total_tests: totalTests,
            passed_tests: passedTests,
            failed_tests: failedTests,
            skipped_tests: skippedTests,
            coverage_percentage: coverage?.percentage || 0,
            test_duration: totalDuration
        };
        
        const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
        
        return {
            test_results: allTests,
            summary: {
                total: totalTests,
                passed: passedTests,
                failed: failedTests,
                skipped: skippedTests,
                success_rate: Math.round(successRate * 100) / 100,
                duration_ms: totalDuration
            },
            coverage: coverage,
            issues: issues,
            quality_gate: {
                passed: failedTests === 0 && (coverage?.threshold_met !== false),
                tests_passed: failedTests === 0,
                coverage_met: coverage?.threshold_met !== false
            },
            recommendations: this.generateTestRecommendations(totalTests, failedTests, coverage)
        };
    }

    /**
     * Generate test recommendations
     * @param {number} totalTests - Total number of tests
     * @param {number} failedTests - Number of failed tests
     * @param {Object} coverage - Coverage information
     * @returns {Array} Array of recommendations
     */
    generateTestRecommendations(totalTests, failedTests, coverage) {
        const recommendations = [];
        
        if (totalTests === 0) {
            recommendations.push('Add unit tests to improve code quality and reliability');
        }
        
        if (failedTests > 0) {
            recommendations.push(`Fix ${failedTests} failing test${failedTests > 1 ? 's' : ''}`);
        }
        
        if (coverage && coverage.percentage < this.config.coverage_threshold) {
            recommendations.push(`Increase test coverage from ${coverage.percentage}% to at least ${this.config.coverage_threshold}%`);
        }
        
        if (totalTests > 0 && totalTests < 10) {
            recommendations.push('Consider adding more comprehensive test coverage');
        }
        
        return recommendations;
    }

    /**
     * Execute command in secure environment
     * @param {Array} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Command result
     */
    async executeCommand(command, cwd, secureEnvironment) {
        return new Promise((resolve, reject) => {
            const process = spawn(command[0], command.slice(1), {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    CI: 'true', // Set CI environment for test frameworks
                    NODE_ENV: 'test'
                }
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutId = setTimeout(() => {
                process.kill('SIGTERM');
                reject(new Error(`Test execution timed out after ${this.config.timeout}ms`));
            }, this.config.timeout);

            process.on('close', (code) => {
                clearTimeout(timeoutId);
                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    command: command.join(' ')
                });
            });

            process.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Utility methods
     */

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async detectAvailableFrameworks() {
        const frameworks = ['jest', 'mocha', 'pytest', 'cypress', 'playwright'];
        const available = {};
        
        for (const framework of frameworks) {
            try {
                await this.executeCommand(['npx', framework, '--version'], process.cwd(), null);
                available[framework] = true;
            } catch {
                available[framework] = false;
            }
        }
        
        log('debug', `Available test frameworks: ${JSON.stringify(available)}`);
        return available;
    }

    /**
     * Get test runner health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            config: this.config,
            metrics: this.testMetrics,
            supported_frameworks: Object.keys(this.testFrameworks)
        };
    }

    /**
     * Shutdown the test runner
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Test Runner...');
        // No specific cleanup needed
        log('info', 'Test Runner shutdown complete');
    }
}

export default TestRunner;

