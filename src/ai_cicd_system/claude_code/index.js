/**
 * Claude Code WSL2 Integration
 * 
 * Main entry point for Claude Code integration with WSL2 deployment pipeline.
 * Orchestrates WSL2 environment management, deployment pipeline, validation engine,
 * test execution, and error resolution for comprehensive code validation.
 */

import WSL2Manager from './wsl2_manager.js';
import DeploymentPipeline from './deployment_pipeline.js';
import ValidationEngine from './validation_engine.js';
import TestExecutor from './test_executor.js';
import ErrorResolver from './error_resolver.js';

export class ClaudeCodeWSL2Integration {
    constructor(options = {}) {
        this.config = {
            maxConcurrentValidations: options.maxConcurrentValidations || 3,
            validationTimeout: options.validationTimeout || 30 * 60 * 1000, // 30 minutes
            autoErrorResolution: options.autoErrorResolution || true,
            feedbackEnabled: options.feedbackEnabled || true,
            monitoringEnabled: options.monitoringEnabled || true,
            ...options
        };

        // Initialize components
        this.wsl2Manager = new WSL2Manager(options.wsl2);
        this.deploymentPipeline = new DeploymentPipeline({
            ...options.deployment,
            wsl2: this.wsl2Manager
        });
        this.validationEngine = new ValidationEngine(options.validation);
        this.testExecutor = new TestExecutor(options.testing);
        this.errorResolver = new ErrorResolver(options.errorResolution);

        this.activeValidations = new Map();
        this.validationQueue = [];

        this.metrics = {
            validationsStarted: 0,
            validationsCompleted: 0,
            validationsFailed: 0,
            averageValidationTime: 0,
            errorsResolved: 0,
            successRate: 0,
            performanceMetrics: {
                averageProvisionTime: 0,
                averageDeploymentTime: 0,
                averageTestTime: 0,
                averageValidationTime: 0
            }
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the Claude Code WSL2 Integration
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Claude Code WSL2 Integration...');

            // Initialize all components
            const initResults = await Promise.all([
                this.wsl2Manager.initialize(),
                this.deploymentPipeline.initialize(),
                this.validationEngine.initialize(),
                this.testExecutor.initialize(),
                this.errorResolver.initialize()
            ]);

            // Check if all components initialized successfully
            const allInitialized = initResults.every(result => result === true);
            
            if (!allInitialized) {
                throw new Error('One or more components failed to initialize');
            }

            this.isInitialized = true;
            console.log('Claude Code WSL2 Integration initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize Claude Code WSL2 Integration:', error.message);
            return false;
        }
    }

    /**
     * Validate PR branch with comprehensive analysis
     * @param {Object} prInfo - Pull request information
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Comprehensive validation result
     */
    async validatePRBranch(prInfo, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Claude Code WSL2 Integration not initialized');
        }

        const validationId = this.generateValidationId();
        const startTime = Date.now();

        try {
            console.log(`Starting comprehensive PR validation ${validationId} for PR #${prInfo.prNumber}: ${prInfo.title}`);

            // Register validation
            this.registerValidation(validationId, prInfo, options);

            // Step 1: Deploy PR branch to WSL2 environment
            const deploymentResult = await this.deploymentPipeline.deployPRBranch(prInfo, options.deployment);
            
            if (!deploymentResult.success) {
                throw new Error(`Deployment failed: ${deploymentResult.error}`);
            }

            // Step 2: Perform code validation
            const validationResult = await this.validationEngine.validateCode(
                deploymentResult.deploymentPath,
                options.validation
            );

            // Step 3: Execute tests
            const testResult = await this.testExecutor.executeTests(
                deploymentResult.deploymentPath,
                options.testing
            );

            // Step 4: Analyze and resolve errors (if any)
            let errorResolutionResult = null;
            if (this.config.autoErrorResolution && (!validationResult.success || !testResult.success)) {
                const errorData = this.compileErrorData(validationResult, testResult);
                errorResolutionResult = await this.errorResolver.resolveErrors(errorData, options.errorResolution);
            }

            // Step 5: Generate comprehensive feedback
            const feedbackResult = await this.generateComprehensiveFeedback({
                validationId,
                prInfo,
                deploymentResult,
                validationResult,
                testResult,
                errorResolutionResult,
                options
            });

            // Step 6: Cleanup deployment (unless specified to keep)
            if (!options.keepDeployment) {
                await this.deploymentPipeline.cleanupDeployment(deploymentResult.deploymentId);
            }

            // Compile final results
            const finalResult = this.compileFinalResults({
                validationId,
                prInfo,
                deploymentResult,
                validationResult,
                testResult,
                errorResolutionResult,
                feedbackResult,
                validationTime: Date.now() - startTime
            });

            // Update metrics
            this.updateMetrics(finalResult);

            console.log(`PR validation ${validationId} completed in ${Date.now() - startTime}ms`);

            return finalResult;

        } catch (error) {
            this.updateMetrics({ success: false }, Date.now() - startTime);

            return {
                success: false,
                error: error.message,
                validationId,
                validationTime: Date.now() - startTime
            };
        } finally {
            // Unregister validation
            this.unregisterValidation(validationId);
        }
    }

    /**
     * Perform quick validation (syntax and basic checks only)
     * @param {Object} prInfo - Pull request information
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Quick validation result
     */
    async quickValidate(prInfo, options = {}) {
        const validationId = this.generateValidationId();
        const startTime = Date.now();

        try {
            console.log(`Starting quick validation ${validationId} for PR #${prInfo.prNumber}`);

            // Deploy with minimal resources
            const deploymentResult = await this.deploymentPipeline.deployPRBranch(prInfo, {
                ...options.deployment,
                cpuCores: 2,
                memoryGB: 4,
                buildCommands: ['npm run lint || echo "No lint script"']
            });

            if (!deploymentResult.success) {
                throw new Error(`Quick deployment failed: ${deploymentResult.error}`);
            }

            // Perform syntax validation only
            const validationResult = await this.validationEngine.validateFiles(
                deploymentResult.deploymentPath,
                { syntaxOnly: true }
            );

            // Cleanup immediately
            await this.deploymentPipeline.cleanupDeployment(deploymentResult.deploymentId);

            return {
                success: validationResult.success,
                validationId,
                validationTime: Date.now() - startTime,
                results: {
                    deployment: deploymentResult,
                    validation: validationResult
                },
                recommendation: this.generateQuickRecommendation(validationResult)
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                validationId,
                validationTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get validation status
     * @param {string} validationId - Validation ID
     * @returns {Object} Validation status
     */
    getValidationStatus(validationId) {
        if (!this.activeValidations.has(validationId)) {
            return { status: 'not_found' };
        }

        const validation = this.activeValidations.get(validationId);
        return {
            status: validation.status,
            validationId,
            prInfo: validation.prInfo,
            startedAt: validation.startedAt,
            progress: validation.progress,
            currentStep: validation.currentStep,
            estimatedTimeRemaining: validation.estimatedTimeRemaining
        };
    }

    /**
     * List active validations
     * @returns {Array} List of active validations
     */
    listActiveValidations() {
        return Array.from(this.activeValidations.entries()).map(([id, validation]) => ({
            validationId: id,
            prInfo: validation.prInfo,
            status: validation.status,
            startedAt: validation.startedAt,
            progress: validation.progress
        }));
    }

    /**
     * Get comprehensive status of all components
     * @returns {Object} Comprehensive status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeValidations: this.activeValidations.size,
            queuedValidations: this.validationQueue.length,
            components: {
                wsl2Manager: this.wsl2Manager.getStatus(),
                deploymentPipeline: this.deploymentPipeline.getStatus(),
                validationEngine: this.validationEngine.getStatus(),
                testExecutor: this.testExecutor.getStatus(),
                errorResolver: this.errorResolver.getStatus()
            },
            metrics: this.metrics,
            config: this.config
        };
    }

    /**
     * Generate comprehensive feedback
     * @private
     */
    async generateComprehensiveFeedback(data) {
        const {
            validationId,
            prInfo,
            deploymentResult,
            validationResult,
            testResult,
            errorResolutionResult,
            options
        } = data;

        const feedback = {
            summary: {
                overallStatus: this.determineOverallStatus(validationResult, testResult, errorResolutionResult),
                validationScore: this.calculateValidationScore(validationResult, testResult),
                recommendation: this.generateRecommendation(validationResult, testResult, errorResolutionResult)
            },
            details: {
                deployment: {
                    status: deploymentResult.success ? 'success' : 'failed',
                    deploymentTime: deploymentResult.deploymentTime,
                    environment: deploymentResult.environment
                },
                validation: {
                    status: validationResult.success ? 'passed' : 'failed',
                    overallScore: validationResult.results?.quality?.overallScore || 0,
                    securityRiskLevel: validationResult.results?.security?.riskLevel || 'unknown',
                    performanceScore: validationResult.results?.performance?.metrics || {}
                },
                testing: {
                    status: testResult.success ? 'passed' : 'failed',
                    totalTests: testResult.summary?.totalTests || 0,
                    passedTests: testResult.summary?.passedTests || 0,
                    failedTests: testResult.summary?.failedTests || 0,
                    coverage: testResult.summary?.coverage || 0
                },
                errorResolution: errorResolutionResult ? {
                    status: errorResolutionResult.success ? 'resolved' : 'unresolved',
                    errorsAnalyzed: errorResolutionResult.errorAnalysis?.totalErrors || 0,
                    errorsResolved: errorResolutionResult.resolutionResults?.stepsSuccessful || 0,
                    autoFixesApplied: errorResolutionResult.resolutionResults?.stepResults?.filter(r => r.result?.autoFixApplied).length || 0
                } : null
            },
            actionItems: this.generateActionItems(validationResult, testResult, errorResolutionResult),
            nextSteps: this.generateNextSteps(validationResult, testResult, errorResolutionResult)
        };

        return feedback;
    }

    /**
     * Compile error data from validation and test results
     * @private
     */
    compileErrorData(validationResult, testResult) {
        const errorData = {
            validationErrors: [],
            testErrors: [],
            buildErrors: [],
            runtimeErrors: []
        };

        // Extract validation errors
        if (validationResult.results?.syntax?.errors) {
            errorData.validationErrors.push(...validationResult.results.syntax.errors);
        }

        if (validationResult.results?.security?.vulnerabilities) {
            errorData.validationErrors.push(...validationResult.results.security.vulnerabilities);
        }

        // Extract test errors
        if (testResult.results?.tests?.suiteResults) {
            for (const suiteResult of testResult.results.tests.suiteResults) {
                if (!suiteResult.success) {
                    errorData.testErrors.push({
                        type: 'test_failure',
                        suite: suiteResult.suite,
                        error: suiteResult.error
                    });
                }
            }
        }

        return errorData;
    }

    /**
     * Generate validation ID
     * @private
     */
    generateValidationId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `validation-${timestamp}-${random}`;
    }

    /**
     * Register validation
     * @private
     */
    registerValidation(validationId, prInfo, options) {
        this.activeValidations.set(validationId, {
            validationId,
            prInfo,
            options,
            status: 'running',
            startedAt: new Date().toISOString(),
            progress: 0,
            currentStep: 'deployment',
            estimatedTimeRemaining: this.config.validationTimeout
        });

        this.metrics.validationsStarted++;
    }

    /**
     * Unregister validation
     * @private
     */
    unregisterValidation(validationId) {
        this.activeValidations.delete(validationId);
    }

    /**
     * Compile final results
     * @private
     */
    compileFinalResults(data) {
        const {
            validationId,
            prInfo,
            deploymentResult,
            validationResult,
            testResult,
            errorResolutionResult,
            feedbackResult,
            validationTime
        } = data;

        const overallSuccess = 
            deploymentResult.success &&
            validationResult.success &&
            testResult.success &&
            (!errorResolutionResult || errorResolutionResult.success);

        return {
            success: overallSuccess,
            validationId,
            prInfo,
            validationTime,
            results: {
                deployment: deploymentResult,
                validation: validationResult,
                testing: testResult,
                errorResolution: errorResolutionResult
            },
            feedback: feedbackResult,
            metrics: {
                deploymentTime: deploymentResult.deploymentTime,
                validationTime: validationResult.validationTime,
                testTime: testResult.executionTime,
                totalTime: validationTime
            }
        };
    }

    /**
     * Update metrics
     * @private
     */
    updateMetrics(result, validationTime = null) {
        if (result.success) {
            this.metrics.validationsCompleted++;
        } else {
            this.metrics.validationsFailed++;
        }

        if (validationTime) {
            this.metrics.averageValidationTime = 
                (this.metrics.averageValidationTime + validationTime) / 2;
        }

        if (result.results?.errorResolution?.resolutionResults?.stepsSuccessful) {
            this.metrics.errorsResolved += result.results.errorResolution.resolutionResults.stepsSuccessful;
        }

        // Update success rate
        const totalValidations = this.metrics.validationsCompleted + this.metrics.validationsFailed;
        if (totalValidations > 0) {
            this.metrics.successRate = this.metrics.validationsCompleted / totalValidations;
        }

        // Update performance metrics
        if (result.metrics) {
            this.metrics.performanceMetrics.averageDeploymentTime = 
                (this.metrics.performanceMetrics.averageDeploymentTime + (result.metrics.deploymentTime || 0)) / 2;
            this.metrics.performanceMetrics.averageTestTime = 
                (this.metrics.performanceMetrics.averageTestTime + (result.metrics.testTime || 0)) / 2;
            this.metrics.performanceMetrics.averageValidationTime = 
                (this.metrics.performanceMetrics.averageValidationTime + (result.metrics.validationTime || 0)) / 2;
        }
    }

    /**
     * Determine overall status
     * @private
     */
    determineOverallStatus(validationResult, testResult, errorResolutionResult) {
        if (!validationResult.success || !testResult.success) {
            if (errorResolutionResult && errorResolutionResult.success) {
                return 'resolved';
            }
            return 'failed';
        }
        return 'passed';
    }

    /**
     * Calculate validation score
     * @private
     */
    calculateValidationScore(validationResult, testResult) {
        let score = 0;
        let factors = 0;

        if (validationResult.results?.quality?.overallScore) {
            score += validationResult.results.quality.overallScore;
            factors++;
        }

        if (testResult.summary?.coverage) {
            score += testResult.summary.coverage / 10; // Convert percentage to 0-10 scale
            factors++;
        }

        return factors > 0 ? score / factors : 0;
    }

    /**
     * Generate recommendation
     * @private
     */
    generateRecommendation(validationResult, testResult, errorResolutionResult) {
        if (validationResult.success && testResult.success) {
            return {
                action: 'approve',
                message: 'All validations passed. PR is ready for merge.',
                priority: 'low'
            };
        }

        if (errorResolutionResult && errorResolutionResult.success) {
            return {
                action: 'review_fixes',
                message: 'Errors were automatically resolved. Please review the fixes.',
                priority: 'medium'
            };
        }

        return {
            action: 'request_changes',
            message: 'Validation or test failures detected. Changes required.',
            priority: 'high'
        };
    }

    /**
     * Generate action items
     * @private
     */
    generateActionItems(validationResult, testResult, errorResolutionResult) {
        const actionItems = [];

        if (!validationResult.success) {
            actionItems.push('Fix code validation issues');
        }

        if (!testResult.success) {
            actionItems.push('Fix failing tests');
        }

        if (testResult.summary?.coverage < 80) {
            actionItems.push('Improve test coverage');
        }

        if (validationResult.results?.security?.riskLevel === 'high' || validationResult.results?.security?.riskLevel === 'critical') {
            actionItems.push('Address security vulnerabilities');
        }

        return actionItems;
    }

    /**
     * Generate next steps
     * @private
     */
    generateNextSteps(validationResult, testResult, errorResolutionResult) {
        const nextSteps = [];

        if (validationResult.success && testResult.success) {
            nextSteps.push('PR is ready for code review');
            nextSteps.push('Consider merging after approval');
        } else {
            nextSteps.push('Address validation and test issues');
            nextSteps.push('Re-run validation after fixes');
        }

        return nextSteps;
    }

    /**
     * Shutdown the Claude Code WSL2 Integration
     */
    async shutdown() {
        console.log('Shutting down Claude Code WSL2 Integration...');

        // Shutdown all components
        await Promise.all([
            this.wsl2Manager.shutdown(),
            this.deploymentPipeline.shutdown(),
            this.validationEngine.shutdown(),
            this.testExecutor.shutdown(),
            this.errorResolver.shutdown()
        ]);

        this.activeValidations.clear();
        this.isInitialized = false;
        console.log('Claude Code WSL2 Integration shutdown complete');
    }
}

// Export individual components for direct use
export {
    WSL2Manager,
    DeploymentPipeline,
    ValidationEngine,
    TestExecutor,
    ErrorResolver
};

// Export default integration service
export default ClaudeCodeWSL2Integration;

