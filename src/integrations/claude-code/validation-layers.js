/**
 * Validation Layers System
 * 
 * Multi-layer validation system for comprehensive code quality assurance
 * including syntax, testing, performance, security, and regression validation.
 */

export class ValidationLayers {
    constructor(claudeCodeClient) {
        this.claudeCode = claudeCodeClient;
        
        // Validation layer configurations
        this.layerConfigs = {
            syntax: {
                timeout: 30000, // 30 seconds
                languages: ['javascript', 'typescript', 'python', 'go', 'java', 'rust'],
                linters: {
                    javascript: ['eslint'],
                    typescript: ['tsc', 'eslint'],
                    python: ['pylint', 'flake8', 'black'],
                    go: ['golint', 'gofmt', 'go vet'],
                    java: ['checkstyle', 'spotbugs'],
                    rust: ['rustfmt', 'clippy']
                }
            },
            unit_tests: {
                timeout: 300000, // 5 minutes
                frameworks: {
                    javascript: ['jest', 'mocha', 'vitest'],
                    typescript: ['jest', 'mocha', 'vitest'],
                    python: ['pytest', 'unittest'],
                    go: ['go test'],
                    java: ['junit', 'testng'],
                    rust: ['cargo test']
                },
                coverage: {
                    minimum: 80,
                    reportFormat: 'lcov'
                }
            },
            integration_tests: {
                timeout: 600000, // 10 minutes
                testSuites: ['api', 'database', 'external_services', 'e2e'],
                parallel: true,
                retries: 2
            },
            performance: {
                timeout: 900000, // 15 minutes
                metrics: ['response_time', 'memory_usage', 'cpu_usage', 'throughput'],
                thresholds: {
                    response_time: 1000, // 1 second
                    memory_usage: '512MB',
                    cpu_usage: '80%',
                    throughput: 100 // requests per second
                }
            },
            security: {
                timeout: 300000, // 5 minutes
                scanners: {
                    javascript: ['npm audit', 'snyk'],
                    typescript: ['npm audit', 'snyk'],
                    python: ['bandit', 'safety'],
                    go: ['gosec'],
                    java: ['spotbugs', 'owasp'],
                    rust: ['cargo audit']
                },
                severity: ['high', 'critical'],
                failOnVulnerabilities: true
            },
            regression: {
                timeout: 1200000, // 20 minutes
                baselineBranch: 'main',
                testSuites: ['smoke', 'critical_path', 'regression'],
                compareMetrics: true,
                allowedDegradation: 5 // 5% performance degradation allowed
            }
        };
    }

    /**
     * Run all validation layers
     * @param {string} deploymentId - Deployment ID
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Complete validation results
     */
    async runAllValidations(deploymentId, options = {}) {
        const results = {
            deploymentId,
            startTime: new Date(),
            layers: {},
            overall: {
                status: 'running',
                passed: 0,
                failed: 0,
                skipped: 0
            }
        };

        const layers = options.layers || Object.keys(this.layerConfigs);
        
        try {
            console.log(`Running ${layers.length} validation layers for deployment ${deploymentId}`);

            // Run layers in sequence for better resource management
            for (const layer of layers) {
                try {
                    console.log(`Running ${layer} validation...`);
                    results.layers[layer] = await this.runValidationLayer(deploymentId, layer, options[layer]);
                    
                    if (results.layers[layer].status === 'passed') {
                        results.overall.passed++;
                    } else if (results.layers[layer].status === 'failed') {
                        results.overall.failed++;
                        
                        // Stop on critical failures if configured
                        if (options.stopOnFailure && this.isCriticalLayer(layer)) {
                            console.log(`Critical layer ${layer} failed, stopping validation`);
                            break;
                        }
                    } else {
                        results.overall.skipped++;
                    }
                } catch (error) {
                    console.error(`Error running ${layer} validation:`, error);
                    results.layers[layer] = {
                        status: 'error',
                        error: error.message,
                        duration: 0
                    };
                    results.overall.failed++;
                }
            }

            // Determine overall status
            results.overall.status = results.overall.failed > 0 ? 'failed' : 'passed';
            results.endTime = new Date();
            results.totalDuration = results.endTime - results.startTime;

            console.log(`Validation complete: ${results.overall.passed} passed, ${results.overall.failed} failed, ${results.overall.skipped} skipped`);
            return results;

        } catch (error) {
            console.error('Error running validations:', error);
            results.overall.status = 'error';
            results.error = error.message;
            results.endTime = new Date();
            return results;
        }
    }

    /**
     * Run a specific validation layer
     * @param {string} deploymentId - Deployment ID
     * @param {string} layerName - Name of the validation layer
     * @param {Object} options - Layer-specific options
     * @returns {Promise<Object>} Validation layer result
     */
    async runValidationLayer(deploymentId, layerName, options = {}) {
        const startTime = Date.now();
        const config = { ...this.layerConfigs[layerName], ...options };

        try {
            let result;
            
            switch (layerName) {
                case 'syntax':
                    result = await this.validateSyntax(deploymentId, config);
                    break;
                case 'unit_tests':
                    result = await this.runUnitTests(deploymentId, config);
                    break;
                case 'integration_tests':
                    result = await this.runIntegrationTests(deploymentId, config);
                    break;
                case 'performance':
                    result = await this.runPerformanceTests(deploymentId, config);
                    break;
                case 'security':
                    result = await this.runSecurityScan(deploymentId, config);
                    break;
                case 'regression':
                    result = await this.runRegressionTests(deploymentId, config);
                    break;
                default:
                    throw new Error(`Unknown validation layer: ${layerName}`);
            }

            return {
                ...result,
                layer: layerName,
                duration: Date.now() - startTime,
                timestamp: new Date()
            };

        } catch (error) {
            return {
                layer: layerName,
                status: 'error',
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: new Date()
            };
        }
    }

    /**
     * Syntax validation
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Syntax validation configuration
     * @returns {Promise<Object>} Syntax validation result
     */
    async validateSyntax(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'syntax', {
            languages: config.languages,
            linters: config.linters,
            failOnWarnings: config.failOnWarnings || false,
            timeout: config.timeout
        });
    }

    /**
     * Unit testing
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Unit test configuration
     * @returns {Promise<Object>} Unit test result
     */
    async runUnitTests(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'unit_tests', {
            frameworks: config.frameworks,
            coverage: config.coverage,
            timeout: config.timeout,
            parallel: config.parallel || true
        });
    }

    /**
     * Integration testing
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Integration test configuration
     * @returns {Promise<Object>} Integration test result
     */
    async runIntegrationTests(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'integration_tests', {
            testSuites: config.testSuites,
            timeout: config.timeout,
            parallel: config.parallel,
            retries: config.retries || 1
        });
    }

    /**
     * Performance testing
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Performance test configuration
     * @returns {Promise<Object>} Performance test result
     */
    async runPerformanceTests(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'performance', {
            metrics: config.metrics,
            thresholds: config.thresholds,
            timeout: config.timeout,
            loadProfile: config.loadProfile || 'standard'
        });
    }

    /**
     * Security scanning
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Security scan configuration
     * @returns {Promise<Object>} Security scan result
     */
    async runSecurityScan(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'security', {
            scanners: config.scanners,
            severity: config.severity,
            failOnVulnerabilities: config.failOnVulnerabilities,
            timeout: config.timeout,
            excludePatterns: config.excludePatterns || []
        });
    }

    /**
     * Regression testing
     * @param {string} deploymentId - Deployment ID
     * @param {Object} config - Regression test configuration
     * @returns {Promise<Object>} Regression test result
     */
    async runRegressionTests(deploymentId, config) {
        return await this.claudeCode.runValidation(deploymentId, 'regression', {
            baselineBranch: config.baselineBranch,
            testSuites: config.testSuites,
            compareMetrics: config.compareMetrics,
            allowedDegradation: config.allowedDegradation,
            timeout: config.timeout
        });
    }

    /**
     * Custom validation layer
     * @param {string} deploymentId - Deployment ID
     * @param {string} layerName - Custom layer name
     * @param {Object} config - Custom validation configuration
     * @returns {Promise<Object>} Custom validation result
     */
    async runCustomValidation(deploymentId, layerName, config) {
        return await this.claudeCode.runValidation(deploymentId, 'custom', {
            name: layerName,
            script: config.script,
            environment: config.environment || {},
            timeout: config.timeout || 300000,
            expectedExitCode: config.expectedExitCode || 0
        });
    }

    /**
     * Check if a layer is critical (should stop validation on failure)
     * @param {string} layerName - Layer name
     * @returns {boolean} True if layer is critical
     */
    isCriticalLayer(layerName) {
        const criticalLayers = ['syntax', 'security'];
        return criticalLayers.includes(layerName);
    }

    /**
     * Get validation layer configuration
     * @param {string} layerName - Layer name
     * @returns {Object} Layer configuration
     */
    getLayerConfig(layerName) {
        return this.layerConfigs[layerName] || null;
    }

    /**
     * Update validation layer configuration
     * @param {string} layerName - Layer name
     * @param {Object} config - New configuration
     */
    updateLayerConfig(layerName, config) {
        if (this.layerConfigs[layerName]) {
            this.layerConfigs[layerName] = { ...this.layerConfigs[layerName], ...config };
        } else {
            this.layerConfigs[layerName] = config;
        }
    }

    /**
     * Get available validation layers
     * @returns {Array<string>} List of available layer names
     */
    getAvailableLayers() {
        return Object.keys(this.layerConfigs);
    }

    /**
     * Validate layer configuration
     * @param {string} layerName - Layer name
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result with errors if any
     */
    validateLayerConfig(layerName, config) {
        const errors = [];
        const warnings = [];

        // Check timeout
        if (config.timeout && (config.timeout < 1000 || config.timeout > 3600000)) {
            warnings.push('Timeout should be between 1 second and 1 hour');
        }

        // Layer-specific validations
        switch (layerName) {
            case 'unit_tests':
                if (config.coverage && config.coverage.minimum < 0 || config.coverage.minimum > 100) {
                    errors.push('Coverage minimum must be between 0 and 100');
                }
                break;
            case 'performance':
                if (config.thresholds && config.thresholds.response_time < 0) {
                    errors.push('Response time threshold must be positive');
                }
                break;
            case 'security':
                if (config.severity && !Array.isArray(config.severity)) {
                    errors.push('Severity must be an array');
                }
                break;
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Generate validation report
     * @param {Object} results - Validation results
     * @returns {string} Formatted validation report
     */
    generateValidationReport(results) {
        let report = `# Validation Report\n\n`;
        report += `**Deployment ID:** ${results.deploymentId}\n`;
        report += `**Duration:** ${Math.round(results.totalDuration / 1000)}s\n`;
        report += `**Overall Status:** ${results.overall.status.toUpperCase()}\n\n`;

        report += `## Summary\n`;
        report += `- ✅ Passed: ${results.overall.passed}\n`;
        report += `- ❌ Failed: ${results.overall.failed}\n`;
        report += `- ⏭️ Skipped: ${results.overall.skipped}\n\n`;

        report += `## Layer Results\n\n`;
        
        for (const [layerName, layerResult] of Object.entries(results.layers)) {
            const status = layerResult.status === 'passed' ? '✅' : 
                          layerResult.status === 'failed' ? '❌' : 
                          layerResult.status === 'skipped' ? '⏭️' : '⚠️';
            
            report += `### ${status} ${layerName.charAt(0).toUpperCase() + layerName.slice(1)}\n`;
            report += `**Duration:** ${Math.round(layerResult.duration / 1000)}s\n`;
            
            if (layerResult.message) {
                report += `**Message:** ${layerResult.message}\n`;
            }
            
            if (layerResult.details) {
                report += `**Details:** ${layerResult.details}\n`;
            }
            
            if (layerResult.error) {
                report += `**Error:** ${layerResult.error}\n`;
            }
            
            report += '\n';
        }

        return report;
    }
}

export default ValidationLayers;

