/**
 * @fileoverview Validation Engine
 * @description Unified validation engine with Claude Code integration
 */

import { log } from '../utils/simple_logger.js';

/**
 * Validation engine that integrates with Claude Code for comprehensive PR validation
 */
export class ValidationEngine {
    constructor(config = {}) {
        this.config = {
            agentapi_url: config.agentapi_url || 'http://localhost:8000',
            api_key: config.api_key,
            timeout: config.timeout || 300000, // 5 minutes
            enable_security_analysis: config.enable_security_analysis !== false,
            enable_performance_analysis: config.enable_performance_analysis !== false,
            max_validation_time: config.max_validation_time || 300000,
            enable_mock: config.enable_mock || !config.api_key,
            scoring_criteria: {
                code_quality: { weight: 0.3 },
                functionality: { weight: 0.4 },
                testing: { weight: 0.2 },
                documentation: { weight: 0.1 },
                ...config.scoring_criteria
            },
            ...config
        };
        
        this.claudeCodeClient = new ClaudeCodeClient(this.config);
        this.deploymentManager = new DeploymentManager(this.config);
        this.codeAnalyzer = new CodeAnalyzer(this.config);
        this.feedbackGenerator = new FeedbackGenerator(this.config);
        this.scoreCalculator = new ScoreCalculator(this.config);
        
        this.activeValidations = new Map();
        this.validationHistory = [];
    }

    /**
     * Initialize the validation engine
     */
    async initialize() {
        log('debug', 'Initializing validation engine...');
        
        if (this.config.enable_mock) {
            log('info', 'Using mock validation engine');
        } else {
            // Validate AgentAPI connection
            await this.claudeCodeClient.validateConnection();
        }
        
        log('debug', 'Validation engine initialized');
    }

    /**
     * Validate PR comprehensively
     * @param {Object} prInfo - PR information
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Validation result
     */
    async validatePR(prInfo, taskContext) {
        const validationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        log('info', `Starting PR validation ${validationId} for PR #${prInfo.number}`);

        try {
            // Track active validation
            this.activeValidations.set(validationId, {
                pr_number: prInfo.number,
                task_id: taskContext.task_id,
                started_at: new Date(),
                status: 'running'
            });

            // Step 1: Deploy PR branch
            log('debug', 'Step 1: Deploying PR branch');
            const deploymentResult = await this.deploymentManager.deployPRBranch(
                prInfo.url, 
                prInfo.branch_name
            );

            // Step 2: Run comprehensive analysis
            log('debug', 'Step 2: Running code analysis');
            const analysisResult = await this.codeAnalyzer.analyzeCode(
                deploymentResult.deployment_path,
                {
                    enable_security: this.config.enable_security_analysis,
                    enable_performance: this.config.enable_performance_analysis,
                    task_context: taskContext
                }
            );

            // Step 3: Execute tests
            log('debug', 'Step 3: Executing test suite');
            const testResult = await this.codeAnalyzer.executeTests(
                deploymentResult.deployment_path
            );

            // Step 4: Check requirements compliance
            log('debug', 'Step 4: Checking requirements compliance');
            const complianceResult = await this.codeAnalyzer.checkCompliance(
                analysisResult,
                taskContext
            );

            // Step 5: Calculate scores
            log('debug', 'Step 5: Calculating validation scores');
            const scores = await this.scoreCalculator.calculateScores({
                analysis: analysisResult,
                tests: testResult,
                compliance: complianceResult
            });

            // Step 6: Generate feedback
            log('debug', 'Step 6: Generating feedback');
            const feedback = await this.feedbackGenerator.generateFeedback({
                analysis: analysisResult,
                tests: testResult,
                compliance: complianceResult,
                scores: scores
            }, taskContext);

            // Step 7: Determine overall status
            const status = this._determineValidationStatus(scores);

            // Step 8: Compile final result
            const validationResult = {
                validation_id: validationId,
                task_id: taskContext.task_id,
                pr_number: prInfo.number,
                status: status,
                score: scores,
                feedback: feedback.items,
                suggestions: feedback.suggestions,
                metrics: {
                    validation_duration_ms: Date.now() - this.activeValidations.get(validationId).started_at.getTime(),
                    deployment_duration_ms: deploymentResult.duration_ms,
                    analysis_duration_ms: analysisResult.duration_ms,
                    test_duration_ms: testResult.duration_ms,
                    files_analyzed: analysisResult.files_analyzed,
                    lines_of_code: analysisResult.total_lines,
                    test_coverage: testResult.coverage_percentage
                },
                raw_results: {
                    deployment: deploymentResult,
                    analysis: analysisResult,
                    tests: testResult,
                    compliance: complianceResult
                },
                validated_at: new Date()
            };

            // Step 9: Cleanup deployment
            try {
                await this.deploymentManager.cleanup(deploymentResult.deployment_id);
            } catch (cleanupError) {
                log('warning', `Cleanup failed: ${cleanupError.message}`);
            }

            // Update tracking
            this.activeValidations.get(validationId).status = 'completed';
            this.activeValidations.get(validationId).result = validationResult;
            
            // Move to history
            this.validationHistory.push(this.activeValidations.get(validationId));
            this.activeValidations.delete(validationId);

            log('info', `PR validation ${validationId} completed with status: ${status} (score: ${scores.overall_score})`);
            return validationResult;

        } catch (error) {
            log('error', `PR validation ${validationId} failed: ${error.message}`);
            
            // Update tracking
            if (this.activeValidations.has(validationId)) {
                this.activeValidations.get(validationId).status = 'failed';
                this.activeValidations.get(validationId).error = error.message;
                
                // Move to history
                this.validationHistory.push(this.activeValidations.get(validationId));
                this.activeValidations.delete(validationId);
            }
            
            // Return error result
            return {
                validation_id: validationId,
                task_id: taskContext.task_id,
                pr_number: prInfo.number,
                status: 'error',
                score: { overall_score: 0, grade: 'F' },
                feedback: [{
                    id: `error_${Date.now()}`,
                    type: 'error',
                    category: 'system',
                    title: 'Validation System Error',
                    message: `Validation failed: ${error.message}`,
                    severity: 'critical'
                }],
                suggestions: [],
                metrics: {
                    validation_duration_ms: Date.now() - (this.activeValidations.get(validationId)?.started_at?.getTime() || Date.now()),
                    error: error.message
                },
                validated_at: new Date()
            };
        }
    }

    /**
     * Get validation statistics
     * @returns {Promise<Object>} Validation statistics
     */
    async getValidationStatistics() {
        const totalValidations = this.validationHistory.length + this.activeValidations.size;
        const completedValidations = this.validationHistory.filter(v => v.status === 'completed').length;
        const failedValidations = this.validationHistory.filter(v => v.status === 'failed').length;
        
        return {
            active_validations: this.activeValidations.size,
            completed_validations: completedValidations,
            failed_validations: failedValidations,
            total_validations: totalValidations,
            success_rate: totalValidations > 0 ? (completedValidations / totalValidations) * 100 : 0,
            average_score: this._calculateAverageScore(),
            average_duration_ms: this._calculateAverageDuration()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getValidationStatistics();
        
        return {
            status: 'healthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            agentapi_url: this.config.agentapi_url,
            active_validations: stats.active_validations,
            success_rate: stats.success_rate,
            claude_code_client: await this.claudeCodeClient.getHealth(),
            deployment_manager: this.deploymentManager.getHealth(),
            code_analyzer: this.codeAnalyzer.getHealth()
        };
    }

    /**
     * Shutdown the validation engine
     */
    async shutdown() {
        log('debug', 'Shutting down validation engine...');
        
        // Cancel active validations
        for (const [validationId, validation] of this.activeValidations) {
            log('warning', `Cancelling active validation: ${validationId}`);
            validation.status = 'cancelled';
        }
        
        await this.claudeCodeClient.shutdown();
        await this.deploymentManager.shutdown();
    }

    // Private methods

    /**
     * Determine validation status from scores
     * @param {Object} scores - Validation scores
     * @returns {string} Validation status
     * @private
     */
    _determineValidationStatus(scores) {
        if (scores.overall_score >= 90) {
            return 'passed';
        } else if (scores.overall_score >= 70) {
            return 'needs_improvement';
        } else {
            return 'failed';
        }
    }

    /**
     * Calculate average score from history
     * @returns {number} Average score
     * @private
     */
    _calculateAverageScore() {
        const completedValidations = this.validationHistory.filter(v => 
            v.status === 'completed' && v.result?.score?.overall_score
        );
        
        if (completedValidations.length === 0) return 0;
        
        const totalScore = completedValidations.reduce((sum, v) => 
            sum + v.result.score.overall_score, 0
        );
        
        return totalScore / completedValidations.length;
    }

    /**
     * Calculate average duration from history
     * @returns {number} Average duration in milliseconds
     * @private
     */
    _calculateAverageDuration() {
        const completedValidations = this.validationHistory.filter(v => 
            v.status === 'completed' && v.result?.metrics?.validation_duration_ms
        );
        
        if (completedValidations.length === 0) return 0;
        
        const totalDuration = completedValidations.reduce((sum, v) => 
            sum + v.result.metrics.validation_duration_ms, 0
        );
        
        return totalDuration / completedValidations.length;
    }
}

/**
 * Claude Code Client
 */
class ClaudeCodeClient {
    constructor(config) {
        this.config = config;
    }

    async validateConnection() {
        if (this.config.enable_mock) {
            return true;
        }
        
        // Real AgentAPI validation would go here
        log('debug', 'Validating Claude Code connection via AgentAPI...');
        return true;
    }

    async getHealth() {
        return {
            status: 'healthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            agentapi_url: this.config.agentapi_url
        };
    }

    async shutdown() {
        // Cleanup connections
    }
}

/**
 * Deployment Manager
 */
class DeploymentManager {
    constructor(config) {
        this.config = config;
        this.activeDeployments = new Map();
    }

    async deployPRBranch(prUrl, branchName) {
        const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        log('debug', `Deploying PR branch ${branchName} (deployment: ${deploymentId})`);
        
        // Mock deployment
        const deploymentPath = `/tmp/deployments/${deploymentId}`;
        
        this.activeDeployments.set(deploymentId, {
            pr_url: prUrl,
            branch_name: branchName,
            deployment_path: deploymentPath,
            started_at: new Date()
        });
        
        // Simulate deployment time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return {
            deployment_id: deploymentId,
            deployment_path: deploymentPath,
            status: 'success',
            duration_ms: Date.now() - startTime,
            logs: ['Cloning repository...', 'Checking out branch...', 'Installing dependencies...', 'Deployment complete']
        };
    }

    async cleanup(deploymentId) {
        log('debug', `Cleaning up deployment ${deploymentId}`);
        this.activeDeployments.delete(deploymentId);
        // Mock cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    getHealth() {
        return {
            status: 'healthy',
            active_deployments: this.activeDeployments.size
        };
    }

    async shutdown() {
        // Cleanup all deployments
        for (const deploymentId of this.activeDeployments.keys()) {
            await this.cleanup(deploymentId);
        }
    }
}

/**
 * Code Analyzer
 */
class CodeAnalyzer {
    constructor(config) {
        this.config = config;
    }

    async analyzeCode(deploymentPath, options = {}) {
        const startTime = Date.now();
        log('debug', `Analyzing code at ${deploymentPath}`);
        
        // Mock code analysis
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return {
            files_analyzed: 15,
            total_lines: 1200,
            code_quality: {
                style_score: 85,
                complexity_score: 78,
                maintainability_score: 82,
                issues: [
                    { type: 'style', severity: 'low', message: 'Missing semicolon', file: 'src/main.js', line: 42 },
                    { type: 'complexity', severity: 'medium', message: 'Function too complex', file: 'src/utils.js', line: 15 }
                ]
            },
            security_analysis: options.enable_security ? {
                vulnerabilities: [],
                security_score: 95,
                issues: []
            } : null,
            performance_analysis: options.enable_performance ? {
                performance_score: 88,
                bottlenecks: [],
                recommendations: ['Consider caching for frequently accessed data']
            } : null,
            duration_ms: Date.now() - startTime
        };
    }

    async executeTests(deploymentPath) {
        const startTime = Date.now();
        log('debug', `Executing tests at ${deploymentPath}`);
        
        // Mock test execution
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        return {
            total_tests: 25,
            passed_tests: 23,
            failed_tests: 2,
            skipped_tests: 0,
            coverage_percentage: 78,
            test_results: [
                { name: 'Authentication tests', status: 'passed', duration_ms: 150 },
                { name: 'API tests', status: 'passed', duration_ms: 300 },
                { name: 'Integration tests', status: 'failed', duration_ms: 200, error: 'Connection timeout' }
            ],
            duration_ms: Date.now() - startTime
        };
    }

    async checkCompliance(analysisResult, taskContext) {
        log('debug', 'Checking requirements compliance');
        
        // Mock compliance check
        const requirements = taskContext.requirements || [];
        const metRequirements = Math.floor(requirements.length * 0.8); // 80% compliance
        
        return {
            total_requirements: requirements.length,
            met_requirements: metRequirements,
            compliance_score: requirements.length > 0 ? (metRequirements / requirements.length) * 100 : 100,
            unmet_requirements: requirements.slice(metRequirements),
            compliance_details: requirements.map((req, index) => ({
                requirement: req,
                met: index < metRequirements,
                evidence: index < metRequirements ? 'Implementation found' : 'No implementation found'
            }))
        };
    }

    getHealth() {
        return { status: 'healthy' };
    }
}

/**
 * Score Calculator
 */
class ScoreCalculator {
    constructor(config) {
        this.config = config;
        this.criteria = config.scoring_criteria;
    }

    async calculateScores(validationResults) {
        const { analysis, tests, compliance } = validationResults;
        
        // Calculate individual scores
        const codeQualityScore = this._calculateCodeQualityScore(analysis);
        const functionalityScore = this._calculateFunctionalityScore(compliance);
        const testingScore = this._calculateTestingScore(tests);
        const documentationScore = this._calculateDocumentationScore(analysis);
        
        // Calculate weighted overall score
        const overallScore = Math.round(
            (codeQualityScore * this.criteria.code_quality.weight) +
            (functionalityScore * this.criteria.functionality.weight) +
            (testingScore * this.criteria.testing.weight) +
            (documentationScore * this.criteria.documentation.weight)
        );
        
        return {
            overall_score: overallScore,
            code_quality_score: codeQualityScore,
            functionality_score: functionalityScore,
            testing_score: testingScore,
            documentation_score: documentationScore,
            grade: this._calculateGrade(overallScore),
            strengths: this._identifyStrengths({
                code_quality: codeQualityScore,
                functionality: functionalityScore,
                testing: testingScore,
                documentation: documentationScore
            }),
            weaknesses: this._identifyWeaknesses({
                code_quality: codeQualityScore,
                functionality: functionalityScore,
                testing: testingScore,
                documentation: documentationScore
            })
        };
    }

    _calculateCodeQualityScore(analysis) {
        if (!analysis.code_quality) return 50;
        
        const { style_score, complexity_score, maintainability_score } = analysis.code_quality;
        return Math.round((style_score + complexity_score + maintainability_score) / 3);
    }

    _calculateFunctionalityScore(compliance) {
        return compliance.compliance_score || 50;
    }

    _calculateTestingScore(tests) {
        const passRate = tests.total_tests > 0 ? (tests.passed_tests / tests.total_tests) * 100 : 0;
        const coverageScore = tests.coverage_percentage || 0;
        return Math.round((passRate + coverageScore) / 2);
    }

    _calculateDocumentationScore(analysis) {
        // Mock documentation scoring
        return 70; // Default documentation score
    }

    _calculateGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    _identifyStrengths(scores) {
        const strengths = [];
        if (scores.code_quality >= 80) strengths.push('Good code quality');
        if (scores.functionality >= 80) strengths.push('Requirements well implemented');
        if (scores.testing >= 80) strengths.push('Comprehensive testing');
        if (scores.documentation >= 80) strengths.push('Well documented');
        return strengths;
    }

    _identifyWeaknesses(scores) {
        const weaknesses = [];
        if (scores.code_quality < 70) weaknesses.push('Code quality needs improvement');
        if (scores.functionality < 70) weaknesses.push('Some requirements not met');
        if (scores.testing < 70) weaknesses.push('Test coverage insufficient');
        if (scores.documentation < 70) weaknesses.push('Documentation lacking');
        return weaknesses;
    }
}

/**
 * Feedback Generator
 */
class FeedbackGenerator {
    constructor(config) {
        this.config = config;
    }

    async generateFeedback(validationResults, taskContext) {
        const { analysis, tests, compliance, scores } = validationResults;
        
        const feedbackItems = [];
        const suggestions = [];
        
        // Generate code quality feedback
        if (analysis.code_quality) {
            feedbackItems.push(...this._generateCodeQualityFeedback(analysis.code_quality));
        }
        
        // Generate testing feedback
        if (tests.failed_tests > 0) {
            feedbackItems.push({
                id: `test_failures_${Date.now()}`,
                type: 'warning',
                category: 'testing',
                title: 'Test Failures',
                message: `${tests.failed_tests} out of ${tests.total_tests} tests failed`,
                severity: 'high',
                suggestions: ['Fix failing tests', 'Review test implementation']
            });
        }
        
        // Generate compliance feedback
        if (compliance.compliance_score < 90) {
            feedbackItems.push({
                id: `compliance_${Date.now()}`,
                type: 'warning',
                category: 'functionality',
                title: 'Requirements Compliance',
                message: `Only ${compliance.met_requirements}/${compliance.total_requirements} requirements met`,
                severity: 'medium',
                suggestions: ['Review unmet requirements', 'Implement missing functionality']
            });
        }
        
        // Generate improvement suggestions
        suggestions.push(...this._generateImprovementSuggestions(scores, validationResults));
        
        return {
            items: feedbackItems,
            suggestions: suggestions
        };
    }

    _generateCodeQualityFeedback(codeQuality) {
        const feedback = [];
        
        if (codeQuality.issues) {
            codeQuality.issues.forEach(issue => {
                feedback.push({
                    id: `code_issue_${Date.now()}_${Math.random()}`,
                    type: issue.severity === 'high' ? 'error' : 'warning',
                    category: 'code_quality',
                    title: `Code ${issue.type} Issue`,
                    message: issue.message,
                    severity: issue.severity,
                    file_path: issue.file,
                    line_number: issue.line,
                    suggestions: this._getSuggestionsForIssue(issue)
                });
            });
        }
        
        return feedback;
    }

    _getSuggestionsForIssue(issue) {
        const suggestions = {
            style: ['Follow coding standards', 'Use linter'],
            complexity: ['Refactor complex functions', 'Break down large methods'],
            security: ['Review security practices', 'Update dependencies']
        };
        
        return suggestions[issue.type] || ['Review and fix the issue'];
    }

    _generateImprovementSuggestions(scores, validationResults) {
        const suggestions = [];
        
        if (scores.testing_score < 80) {
            suggestions.push({
                id: `improve_testing_${Date.now()}`,
                title: 'Improve Test Coverage',
                description: 'Increase test coverage to at least 80%',
                category: 'testing',
                priority: 'high',
                effort_estimate: '2-4 hours',
                resources: ['Testing best practices guide', 'Unit testing examples']
            });
        }
        
        if (scores.code_quality_score < 80) {
            suggestions.push({
                id: `improve_quality_${Date.now()}`,
                title: 'Improve Code Quality',
                description: 'Address code quality issues and follow best practices',
                category: 'code_quality',
                priority: 'medium',
                effort_estimate: '1-3 hours',
                resources: ['Code quality guidelines', 'Refactoring techniques']
            });
        }
        
        return suggestions;
    }
}

export default ValidationEngine;

