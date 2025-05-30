/**
 * @fileoverview Feedback Processor
 * @description Processes and communicates validation results to orchestrators
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Feedback Processor for generating and communicating validation results
 */
export class FeedbackProcessor {
    constructor(config = {}) {
        this.config = {
            feedback_format: config.feedback_format || 'json',
            include_detailed_logs: config.include_detailed_logs !== false,
            include_recommendations: config.include_recommendations !== false,
            max_feedback_size: config.max_feedback_size || 10 * 1024 * 1024, // 10MB
            retry_attempts: config.retry_attempts || 3,
            retry_delay: config.retry_delay || 5000, // 5 seconds
            webhook_timeout: config.webhook_timeout || 30000, // 30 seconds
            ...config
        };

        this.feedbackHistory = [];
        this.communicationMetrics = {
            totalFeedbacks: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Generate comprehensive feedback from validation results
     */
    async generateFeedback(validationResults) {
        console.log('📝 Generating comprehensive feedback...');
        
        try {
            const feedback = {
                metadata: this.generateMetadata(validationResults),
                summary: this.generateSummary(validationResults),
                details: this.generateDetailedResults(validationResults),
                metrics: this.generateMetrics(validationResults),
                recommendations: this.generateRecommendations(validationResults),
                artifacts: this.generateArtifacts(validationResults),
                timestamp: new Date().toISOString()
            };

            // Validate feedback size
            const feedbackSize = JSON.stringify(feedback).length;
            if (feedbackSize > this.config.max_feedback_size) {
                console.warn(`⚠️ Feedback size (${feedbackSize} bytes) exceeds limit, truncating...`);
                feedback.details = this.truncateDetails(feedback.details);
                feedback.artifacts = this.truncateArtifacts(feedback.artifacts);
            }

            // Add to history
            this.feedbackHistory.push({
                id: feedback.metadata.feedbackId,
                timestamp: feedback.timestamp,
                size: feedbackSize,
                validationId: validationResults.validationId
            });

            console.log(`✅ Feedback generated (${feedbackSize} bytes)`);
            return feedback;
        } catch (error) {
            console.error('❌ Failed to generate feedback:', error);
            throw error;
        }
    }

    /**
     * Generate feedback metadata
     */
    generateMetadata(validationResults) {
        return {
            feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: validationResults.validationId,
            prInfo: validationResults.prInfo,
            version: '1.0.0',
            generator: 'Claude Code Validation Engine',
            format: this.config.feedback_format,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate executive summary
     */
    generateSummary(validationResults) {
        const { status, duration, testResults, errorAnalysis, fixResults } = validationResults;
        
        const summary = {
            overall_status: status,
            validation_duration: duration,
            quality_score: this.calculateQualityScore(validationResults),
            test_summary: {
                total_tests: testResults?.totalTests || 0,
                passed_tests: testResults?.passedTests || 0,
                failed_tests: testResults?.failedTests || 0,
                test_coverage: testResults?.coverage || 0
            },
            error_summary: {
                total_errors: errorAnalysis?.classification?.summary?.total || 0,
                critical_errors: this.countErrorsBySeverity(errorAnalysis, 'critical'),
                high_errors: this.countErrorsBySeverity(errorAnalysis, 'high'),
                medium_errors: this.countErrorsBySeverity(errorAnalysis, 'medium'),
                low_errors: this.countErrorsBySeverity(errorAnalysis, 'low')
            },
            fix_summary: {
                fixes_attempted: fixResults?.fixesApplied || 0,
                fixes_successful: fixResults?.fixesApplied || 0,
                fixes_failed: fixResults?.fixesFailed || 0,
                auto_fix_rate: this.calculateAutoFixRate(fixResults)
            },
            recommendations_count: errorAnalysis?.fixSuggestions?.length || 0
        };

        return summary;
    }

    /**
     * Generate detailed validation results
     */
    generateDetailedResults(validationResults) {
        const details = {
            test_results: this.formatTestResults(validationResults.testResults),
            error_analysis: this.formatErrorAnalysis(validationResults.errorAnalysis),
            fix_results: this.formatFixResults(validationResults.fixResults),
            performance_metrics: this.formatPerformanceMetrics(validationResults.testResults),
            security_analysis: this.formatSecurityAnalysis(validationResults.testResults),
            code_quality: this.formatCodeQuality(validationResults.testResults)
        };

        // Include detailed logs if configured
        if (this.config.include_detailed_logs) {
            details.execution_logs = this.formatExecutionLogs(validationResults);
        }

        return details;
    }

    /**
     * Generate validation metrics
     */
    generateMetrics(validationResults) {
        const { duration, testResults, errorAnalysis, fixResults } = validationResults;
        
        return {
            performance: {
                total_validation_time: duration,
                test_execution_time: testResults?.duration || 0,
                error_analysis_time: errorAnalysis?.duration || 0,
                fix_application_time: fixResults?.duration || 0
            },
            quality: {
                code_quality_score: this.calculateCodeQualityScore(testResults),
                test_coverage_percentage: testResults?.coverage || 0,
                error_density: this.calculateErrorDensity(errorAnalysis, testResults),
                fix_success_rate: this.calculateFixSuccessRate(fixResults)
            },
            security: {
                security_score: testResults?.securityScore || 0,
                vulnerabilities_found: testResults?.vulnerabilities?.length || 0,
                critical_vulnerabilities: this.countVulnerabilitiesBySeverity(testResults, 'critical'),
                high_vulnerabilities: this.countVulnerabilitiesBySeverity(testResults, 'high')
            },
            efficiency: {
                automated_fixes_percentage: this.calculateAutomatedFixesPercentage(fixResults),
                validation_efficiency: this.calculateValidationEfficiency(validationResults),
                resource_utilization: this.calculateResourceUtilization(validationResults)
            }
        };
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(validationResults) {
        if (!this.config.include_recommendations) {
            return [];
        }

        const recommendations = [];
        const { errorAnalysis, testResults, fixResults } = validationResults;

        // Error-based recommendations
        if (errorAnalysis?.fixSuggestions) {
            recommendations.push(...this.generateErrorRecommendations(errorAnalysis));
        }

        // Test-based recommendations
        if (testResults) {
            recommendations.push(...this.generateTestRecommendations(testResults));
        }

        // Performance recommendations
        if (testResults?.performanceIssues) {
            recommendations.push(...this.generatePerformanceRecommendations(testResults));
        }

        // Security recommendations
        if (testResults?.vulnerabilities) {
            recommendations.push(...this.generateSecurityRecommendations(testResults));
        }

        // Fix recommendations
        if (fixResults) {
            recommendations.push(...this.generateFixRecommendations(fixResults));
        }

        // Prioritize recommendations
        return this.prioritizeRecommendations(recommendations);
    }

    /**
     * Generate validation artifacts
     */
    generateArtifacts(validationResults) {
        const artifacts = {
            test_reports: [],
            coverage_reports: [],
            security_reports: [],
            performance_reports: [],
            error_logs: [],
            fix_logs: []
        };

        // Generate test reports
        if (validationResults.testResults) {
            artifacts.test_reports.push({
                type: 'junit',
                format: 'xml',
                content: this.generateJUnitReport(validationResults.testResults)
            });
        }

        // Generate coverage reports
        if (validationResults.testResults?.coverage) {
            artifacts.coverage_reports.push({
                type: 'lcov',
                format: 'text',
                content: this.generateCoverageReport(validationResults.testResults)
            });
        }

        // Generate security reports
        if (validationResults.testResults?.vulnerabilities) {
            artifacts.security_reports.push({
                type: 'sarif',
                format: 'json',
                content: this.generateSecurityReport(validationResults.testResults)
            });
        }

        return artifacts;
    }

    /**
     * Send feedback to OpenEvolve orchestrator
     */
    async sendToOrchestrator(feedback, orchestratorEndpoint) {
        console.log(`📤 Sending feedback to orchestrator: ${orchestratorEndpoint}`);
        
        const startTime = Date.now();
        let attempt = 0;
        
        while (attempt < this.config.retry_attempts) {
            try {
                const response = await this.deliverFeedback(feedback, orchestratorEndpoint);
                
                const responseTime = Date.now() - startTime;
                this.updateCommunicationMetrics(true, responseTime);
                
                console.log(`✅ Feedback delivered successfully (${responseTime}ms)`);
                return response;
            } catch (error) {
                attempt++;
                console.error(`❌ Delivery attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.config.retry_attempts) {
                    console.log(`⏳ Retrying in ${this.config.retry_delay}ms...`);
                    await this.delay(this.config.retry_delay);
                } else {
                    const responseTime = Date.now() - startTime;
                    this.updateCommunicationMetrics(false, responseTime);
                    throw new Error(`Failed to deliver feedback after ${this.config.retry_attempts} attempts: ${error.message}`);
                }
            }
        }
    }

    /**
     * Deliver feedback via HTTP POST
     */
    async deliverFeedback(feedback, endpoint) {
        const payload = JSON.stringify(feedback);
        
        try {
            // Use curl for HTTP delivery
            const curlCommand = [
                'curl',
                '-X POST',
                '-H "Content-Type: application/json"',
                '-H "User-Agent: Claude-Code-Validation-Engine/1.0"',
                `--max-time ${this.config.webhook_timeout / 1000}`,
                '--fail',
                '--silent',
                '--show-error',
                `--data '${payload.replace(/'/g, "\\'")}'`,
                endpoint
            ].join(' ');

            const { stdout, stderr } = await execAsync(curlCommand);
            
            return {
                success: true,
                response: stdout,
                endpoint
            };
        } catch (error) {
            throw new Error(`HTTP delivery failed: ${error.message}`);
        }
    }

    /**
     * Format test results for feedback
     */
    formatTestResults(testResults) {
        if (!testResults) return null;
        
        return {
            summary: {
                total: testResults.totalTests || 0,
                passed: testResults.passedTests || 0,
                failed: testResults.failedTests || 0,
                skipped: testResults.skippedTests || 0,
                coverage: testResults.coverage || 0
            },
            by_layer: testResults.by_layer || {},
            failures: testResults.failures || [],
            performance: testResults.performance || {},
            security: testResults.security || {}
        };
    }

    /**
     * Format error analysis for feedback
     */
    formatErrorAnalysis(errorAnalysis) {
        if (!errorAnalysis) return null;
        
        return {
            classification: errorAnalysis.classification || {},
            root_causes: errorAnalysis.rootCauseAnalysis?.rootCauses || [],
            patterns: errorAnalysis.patterns || {},
            fix_suggestions: errorAnalysis.fixSuggestions || []
        };
    }

    /**
     * Format fix results for feedback
     */
    formatFixResults(fixResults) {
        if (!fixResults) return null;
        
        return {
            summary: {
                attempted: fixResults.fixesApplied + fixResults.fixesFailed || 0,
                successful: fixResults.fixesApplied || 0,
                failed: fixResults.fixesFailed || 0,
                success_rate: this.calculateFixSuccessRate(fixResults)
            },
            details: fixResults.results || [],
            validation: fixResults.validation || {}
        };
    }

    /**
     * Generate error-based recommendations
     */
    generateErrorRecommendations(errorAnalysis) {
        const recommendations = [];
        
        if (errorAnalysis.fixSuggestions) {
            for (const suggestion of errorAnalysis.fixSuggestions.slice(0, 5)) {
                recommendations.push({
                    type: 'error_fix',
                    priority: this.mapPriorityScore(suggestion.priority_score),
                    category: suggestion.category,
                    title: `Fix ${suggestion.category} issues`,
                    description: suggestion.description,
                    estimated_effort: suggestion.estimated_time || 'unknown',
                    success_probability: suggestion.success_rate || 0.5
                });
            }
        }
        
        return recommendations;
    }

    /**
     * Generate test-based recommendations
     */
    generateTestRecommendations(testResults) {
        const recommendations = [];
        
        if (testResults.coverage < 80) {
            recommendations.push({
                type: 'test_coverage',
                priority: 'medium',
                category: 'testing',
                title: 'Improve test coverage',
                description: `Current coverage is ${testResults.coverage}%. Consider adding more tests to reach 80%+.`,
                estimated_effort: 'medium',
                success_probability: 0.8
            });
        }
        
        if (testResults.failedTests > 0) {
            recommendations.push({
                type: 'test_failures',
                priority: 'high',
                category: 'testing',
                title: 'Fix failing tests',
                description: `${testResults.failedTests} tests are currently failing and need attention.`,
                estimated_effort: 'high',
                success_probability: 0.9
            });
        }
        
        return recommendations;
    }

    /**
     * Generate performance recommendations
     */
    generatePerformanceRecommendations(testResults) {
        const recommendations = [];
        
        if (testResults.performanceIssues?.length > 0) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                category: 'performance',
                title: 'Address performance issues',
                description: `${testResults.performanceIssues.length} performance issues detected.`,
                estimated_effort: 'medium',
                success_probability: 0.7
            });
        }
        
        return recommendations;
    }

    /**
     * Generate security recommendations
     */
    generateSecurityRecommendations(testResults) {
        const recommendations = [];
        
        if (testResults.vulnerabilities?.length > 0) {
            const criticalVulns = this.countVulnerabilitiesBySeverity(testResults, 'critical');
            const highVulns = this.countVulnerabilitiesBySeverity(testResults, 'high');
            
            if (criticalVulns > 0) {
                recommendations.push({
                    type: 'security_critical',
                    priority: 'critical',
                    category: 'security',
                    title: 'Fix critical security vulnerabilities',
                    description: `${criticalVulns} critical security vulnerabilities require immediate attention.`,
                    estimated_effort: 'high',
                    success_probability: 0.95
                });
            }
            
            if (highVulns > 0) {
                recommendations.push({
                    type: 'security_high',
                    priority: 'high',
                    category: 'security',
                    title: 'Address high-severity security issues',
                    description: `${highVulns} high-severity security vulnerabilities should be fixed soon.`,
                    estimated_effort: 'medium',
                    success_probability: 0.85
                });
            }
        }
        
        return recommendations;
    }

    /**
     * Generate fix recommendations
     */
    generateFixRecommendations(fixResults) {
        const recommendations = [];
        
        if (fixResults.fixesFailed > 0) {
            recommendations.push({
                type: 'manual_review',
                priority: 'medium',
                category: 'maintenance',
                title: 'Review failed automatic fixes',
                description: `${fixResults.fixesFailed} automatic fixes failed and may require manual intervention.`,
                estimated_effort: 'medium',
                success_probability: 0.8
            });
        }
        
        return recommendations;
    }

    /**
     * Prioritize recommendations by priority and impact
     */
    prioritizeRecommendations(recommendations) {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        
        return recommendations
            .sort((a, b) => {
                const aPriority = priorityOrder[a.priority] || 0;
                const bPriority = priorityOrder[b.priority] || 0;
                
                if (aPriority !== bPriority) {
                    return bPriority - aPriority;
                }
                
                return (b.success_probability || 0) - (a.success_probability || 0);
            })
            .slice(0, 10); // Limit to top 10 recommendations
    }

    /**
     * Helper methods for calculations
     */

    calculateQualityScore(validationResults) {
        let score = 100;
        
        // Deduct for test failures
        if (validationResults.testResults?.failedTests > 0) {
            score -= Math.min(validationResults.testResults.failedTests * 10, 40);
        }
        
        // Deduct for errors
        const errorCount = validationResults.errorAnalysis?.classification?.summary?.total || 0;
        score -= Math.min(errorCount * 5, 30);
        
        // Deduct for security issues
        const criticalVulns = this.countVulnerabilitiesBySeverity(validationResults.testResults, 'critical');
        score -= criticalVulns * 20;
        
        return Math.max(score, 0);
    }

    countErrorsBySeverity(errorAnalysis, severity) {
        if (!errorAnalysis?.classification?.classification) return 0;
        
        let count = 0;
        for (const [category, errors] of Object.entries(errorAnalysis.classification.classification)) {
            if (Array.isArray(errors)) {
                count += errors.filter(e => e.severity === severity).length;
            }
        }
        return count;
    }

    countVulnerabilitiesBySeverity(testResults, severity) {
        if (!testResults?.vulnerabilities) return 0;
        return testResults.vulnerabilities.filter(v => v.severity === severity).length;
    }

    calculateAutoFixRate(fixResults) {
        if (!fixResults || !fixResults.fixesApplied) return 0;
        const total = fixResults.fixesApplied + fixResults.fixesFailed;
        return total > 0 ? (fixResults.fixesApplied / total) * 100 : 0;
    }

    calculateFixSuccessRate(fixResults) {
        return this.calculateAutoFixRate(fixResults);
    }

    calculateCodeQualityScore(testResults) {
        // Simplified calculation based on test coverage and failures
        if (!testResults) return 0;
        
        let score = testResults.coverage || 0;
        if (testResults.failedTests > 0) {
            score -= Math.min(testResults.failedTests * 10, 50);
        }
        
        return Math.max(score, 0);
    }

    calculateErrorDensity(errorAnalysis, testResults) {
        const errorCount = errorAnalysis?.classification?.summary?.total || 0;
        const linesOfCode = testResults?.linesOfCode || 1000; // Default estimate
        return (errorCount / linesOfCode) * 1000; // Errors per 1000 lines
    }

    calculateAutomatedFixesPercentage(fixResults) {
        return this.calculateAutoFixRate(fixResults);
    }

    calculateValidationEfficiency(validationResults) {
        // Simple efficiency metric based on time and results
        const duration = validationResults.duration || 1;
        const testsPerSecond = (validationResults.testResults?.totalTests || 0) / (duration / 1000);
        return Math.min(testsPerSecond * 10, 100);
    }

    calculateResourceUtilization(validationResults) {
        // Placeholder for resource utilization calculation
        return 75; // Default value
    }

    mapPriorityScore(score) {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    }

    truncateDetails(details) {
        // Implement detail truncation logic
        return details;
    }

    truncateArtifacts(artifacts) {
        // Implement artifact truncation logic
        return artifacts;
    }

    generateJUnitReport(testResults) {
        // Generate JUnit XML report
        return '<testsuite></testsuite>'; // Placeholder
    }

    generateCoverageReport(testResults) {
        // Generate LCOV coverage report
        return 'TN:\nend_of_record'; // Placeholder
    }

    generateSecurityReport(testResults) {
        // Generate SARIF security report
        return { version: '2.1.0', runs: [] }; // Placeholder
    }

    formatExecutionLogs(validationResults) {
        // Format execution logs
        return [];
    }

    formatPerformanceMetrics(testResults) {
        return testResults?.performance || {};
    }

    formatSecurityAnalysis(testResults) {
        return testResults?.security || {};
    }

    formatCodeQuality(testResults) {
        return {
            score: this.calculateCodeQualityScore(testResults),
            coverage: testResults?.coverage || 0,
            complexity: testResults?.complexity || 'unknown'
        };
    }

    updateCommunicationMetrics(success, responseTime) {
        this.communicationMetrics.totalFeedbacks++;
        
        if (success) {
            this.communicationMetrics.successfulDeliveries++;
        } else {
            this.communicationMetrics.failedDeliveries++;
        }
        
        // Update average response time
        const total = this.communicationMetrics.totalFeedbacks;
        const current = this.communicationMetrics.averageResponseTime;
        this.communicationMetrics.averageResponseTime = 
            ((current * (total - 1)) + responseTime) / total;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get feedback history
     */
    getFeedbackHistory() {
        return [...this.feedbackHistory];
    }

    /**
     * Get communication metrics
     */
    getCommunicationMetrics() {
        return { ...this.communicationMetrics };
    }
}

export default FeedbackProcessor;

