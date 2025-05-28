/**
 * Claude Code Result Collector
 * 
 * Collects, processes, and aggregates validation results from Claude Code
 * validation sessions and WSL2 deployments.
 */

import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class ResultCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            resultsDirectory: options.resultsDirectory || '/tmp/claude-results',
            maxResultsHistory: options.maxResultsHistory || 100,
            enableMetrics: options.enableMetrics !== false,
            enableReporting: options.enableReporting !== false,
            reportFormats: options.reportFormats || ['json', 'markdown', 'html'],
            aggregationInterval: options.aggregationInterval || 5 * 60 * 1000, // 5 minutes
            retentionPeriod: options.retentionPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
            ...options
        };

        this.logger = new SimpleLogger('ResultCollector', options.logLevel || 'info');
        this.results = new Map();
        this.metrics = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0,
            averageValidationTime: 0,
            validationsByType: new Map(),
            validationsByRepository: new Map(),
            issuesByCategory: new Map(),
            performanceMetrics: new Map()
        };

        this.aggregationTimer = null;
        this.isInitialized = false;

        this._initializeResultsDirectory();
        this._startAggregation();
    }

    /**
     * Initialize results directory
     */
    _initializeResultsDirectory() {
        try {
            if (!existsSync(this.config.resultsDirectory)) {
                mkdirSync(this.config.resultsDirectory, { recursive: true });
            }

            // Create subdirectories
            const subdirs = ['raw', 'processed', 'reports', 'metrics', 'archives'];
            for (const subdir of subdirs) {
                const path = join(this.config.resultsDirectory, subdir);
                if (!existsSync(path)) {
                    mkdirSync(path, { recursive: true });
                }
            }

            this.logger.info(`Results directory initialized: ${this.config.resultsDirectory}`);
            this.isInitialized = true;
        } catch (error) {
            this.logger.error('Failed to initialize results directory:', error);
            throw error;
        }
    }

    /**
     * Start aggregation timer
     */
    _startAggregation() {
        if (this.config.enableMetrics) {
            this.aggregationTimer = setInterval(() => {
                this._aggregateMetrics();
            }, this.config.aggregationInterval);
        }
    }

    /**
     * Collect validation result
     */
    async collectValidationResult(validationId, result) {
        try {
            this.logger.info(`Collecting validation result: ${validationId}`);

            const collectedResult = {
                id: validationId,
                timestamp: new Date().toISOString(),
                type: 'validation',
                status: result.success ? 'success' : 'failure',
                duration: result.duration || 0,
                prInfo: result.prInfo || {},
                validationData: result.validationData || {},
                issues: result.issues || [],
                metrics: result.metrics || {},
                recommendations: result.recommendations || [],
                artifacts: result.artifacts || [],
                metadata: {
                    collectedAt: new Date().toISOString(),
                    collectorVersion: '1.0.0',
                    ...result.metadata
                }
            };

            // Store result
            this.results.set(validationId, collectedResult);

            // Save to disk
            await this._saveResult(collectedResult);

            // Update metrics
            this._updateMetrics(collectedResult);

            // Emit event
            this.emit('result.collected', {
                validationId,
                status: collectedResult.status,
                timestamp: collectedResult.timestamp
            });

            this.logger.info(`Validation result collected successfully: ${validationId}`);

            return {
                success: true,
                resultId: validationId,
                collectedAt: collectedResult.timestamp
            };

        } catch (error) {
            this.logger.error(`Failed to collect validation result ${validationId}:`, error);
            throw error;
        }
    }

    /**
     * Collect deployment result
     */
    async collectDeploymentResult(deploymentId, result) {
        try {
            this.logger.info(`Collecting deployment result: ${deploymentId}`);

            const collectedResult = {
                id: deploymentId,
                timestamp: new Date().toISOString(),
                type: 'deployment',
                status: result.success ? 'success' : 'failure',
                duration: result.duration || 0,
                prInfo: result.prInfo || {},
                deploymentData: result.deploymentData || {},
                environment: result.environment || {},
                testResults: result.testResults || {},
                buildResults: result.buildResults || {},
                logs: result.logs || [],
                artifacts: result.artifacts || [],
                metadata: {
                    collectedAt: new Date().toISOString(),
                    collectorVersion: '1.0.0',
                    ...result.metadata
                }
            };

            // Store result
            this.results.set(deploymentId, collectedResult);

            // Save to disk
            await this._saveResult(collectedResult);

            // Update metrics
            this._updateMetrics(collectedResult);

            // Emit event
            this.emit('result.collected', {
                deploymentId,
                status: collectedResult.status,
                timestamp: collectedResult.timestamp
            });

            this.logger.info(`Deployment result collected successfully: ${deploymentId}`);

            return {
                success: true,
                resultId: deploymentId,
                collectedAt: collectedResult.timestamp
            };

        } catch (error) {
            this.logger.error(`Failed to collect deployment result ${deploymentId}:`, error);
            throw error;
        }
    }

    /**
     * Save result to disk
     */
    async _saveResult(result) {
        try {
            const filename = `${result.id}.json`;
            const rawPath = join(this.config.resultsDirectory, 'raw', filename);
            
            writeFileSync(rawPath, JSON.stringify(result, null, 2));

            // Also save processed version
            const processedResult = await this._processResult(result);
            const processedPath = join(this.config.resultsDirectory, 'processed', filename);
            
            writeFileSync(processedPath, JSON.stringify(processedResult, null, 2));

        } catch (error) {
            this.logger.error(`Failed to save result ${result.id}:`, error);
        }
    }

    /**
     * Process result for analysis
     */
    async _processResult(result) {
        try {
            const processed = {
                ...result,
                processed: true,
                processedAt: new Date().toISOString(),
                analysis: {}
            };

            // Analyze issues
            if (result.issues && result.issues.length > 0) {
                processed.analysis.issueAnalysis = this._analyzeIssues(result.issues);
            }

            // Analyze performance
            if (result.metrics) {
                processed.analysis.performanceAnalysis = this._analyzePerformance(result.metrics);
            }

            // Analyze code quality
            if (result.validationData) {
                processed.analysis.qualityAnalysis = this._analyzeCodeQuality(result.validationData);
            }

            // Calculate scores
            processed.analysis.scores = this._calculateScores(result);

            return processed;

        } catch (error) {
            this.logger.error(`Failed to process result ${result.id}:`, error);
            return result;
        }
    }

    /**
     * Analyze issues
     */
    _analyzeIssues(issues) {
        const analysis = {
            totalIssues: issues.length,
            issuesBySeverity: {},
            issuesByCategory: {},
            criticalIssues: [],
            recommendations: []
        };

        for (const issue of issues) {
            // Count by severity
            const severity = issue.severity || 'unknown';
            analysis.issuesBySeverity[severity] = (analysis.issuesBySeverity[severity] || 0) + 1;

            // Count by category
            const category = issue.category || 'unknown';
            analysis.issuesByCategory[category] = (analysis.issuesByCategory[category] || 0) + 1;

            // Collect critical issues
            if (severity === 'critical' || severity === 'high') {
                analysis.criticalIssues.push(issue);
            }
        }

        // Generate recommendations
        if (analysis.criticalIssues.length > 0) {
            analysis.recommendations.push('Address critical issues before merging');
        }

        if (analysis.issuesBySeverity.medium > 5) {
            analysis.recommendations.push('Consider addressing medium severity issues');
        }

        return analysis;
    }

    /**
     * Analyze performance
     */
    _analyzePerformance(metrics) {
        const analysis = {
            overallScore: 0,
            areas: {},
            recommendations: []
        };

        // Analyze different performance areas
        if (metrics.buildTime) {
            analysis.areas.buildPerformance = {
                score: this._calculateBuildScore(metrics.buildTime),
                value: metrics.buildTime,
                unit: 'ms'
            };
        }

        if (metrics.testTime) {
            analysis.areas.testPerformance = {
                score: this._calculateTestScore(metrics.testTime),
                value: metrics.testTime,
                unit: 'ms'
            };
        }

        if (metrics.memoryUsage) {
            analysis.areas.memoryEfficiency = {
                score: this._calculateMemoryScore(metrics.memoryUsage),
                value: metrics.memoryUsage,
                unit: 'MB'
            };
        }

        // Calculate overall score
        const scores = Object.values(analysis.areas).map(area => area.score);
        analysis.overallScore = scores.length > 0 ? 
            scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

        // Generate recommendations
        if (analysis.overallScore < 70) {
            analysis.recommendations.push('Performance optimization recommended');
        }

        return analysis;
    }

    /**
     * Analyze code quality
     */
    _analyzeCodeQuality(validationData) {
        const analysis = {
            overallScore: 0,
            areas: {},
            recommendations: []
        };

        // Analyze different quality areas
        if (validationData.linting) {
            analysis.areas.codeStyle = {
                score: this._calculateLintingScore(validationData.linting),
                issues: validationData.linting.issues || 0
            };
        }

        if (validationData.testing) {
            analysis.areas.testCoverage = {
                score: this._calculateTestCoverageScore(validationData.testing),
                coverage: validationData.testing.coverage || 0
            };
        }

        if (validationData.complexity) {
            analysis.areas.codeComplexity = {
                score: this._calculateComplexityScore(validationData.complexity),
                complexity: validationData.complexity.average || 0
            };
        }

        // Calculate overall score
        const scores = Object.values(analysis.areas).map(area => area.score);
        analysis.overallScore = scores.length > 0 ? 
            scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

        // Generate recommendations
        if (analysis.overallScore < 80) {
            analysis.recommendations.push('Code quality improvements recommended');
        }

        return analysis;
    }

    /**
     * Calculate various scores
     */
    _calculateBuildScore(buildTime) {
        // Score based on build time (lower is better)
        if (buildTime < 30000) return 100; // < 30s
        if (buildTime < 60000) return 80;  // < 1m
        if (buildTime < 120000) return 60; // < 2m
        if (buildTime < 300000) return 40; // < 5m
        return 20;
    }

    _calculateTestScore(testTime) {
        // Score based on test time (lower is better)
        if (testTime < 10000) return 100; // < 10s
        if (testTime < 30000) return 80;  // < 30s
        if (testTime < 60000) return 60;  // < 1m
        if (testTime < 120000) return 40; // < 2m
        return 20;
    }

    _calculateMemoryScore(memoryUsage) {
        // Score based on memory usage (lower is better)
        if (memoryUsage < 100) return 100; // < 100MB
        if (memoryUsage < 250) return 80;  // < 250MB
        if (memoryUsage < 500) return 60;  // < 500MB
        if (memoryUsage < 1000) return 40; // < 1GB
        return 20;
    }

    _calculateLintingScore(linting) {
        const issues = linting.issues || 0;
        if (issues === 0) return 100;
        if (issues < 5) return 80;
        if (issues < 10) return 60;
        if (issues < 20) return 40;
        return 20;
    }

    _calculateTestCoverageScore(testing) {
        const coverage = testing.coverage || 0;
        if (coverage >= 90) return 100;
        if (coverage >= 80) return 80;
        if (coverage >= 70) return 60;
        if (coverage >= 60) return 40;
        return 20;
    }

    _calculateComplexityScore(complexity) {
        const avgComplexity = complexity.average || 0;
        if (avgComplexity < 5) return 100;
        if (avgComplexity < 10) return 80;
        if (avgComplexity < 15) return 60;
        if (avgComplexity < 20) return 40;
        return 20;
    }

    /**
     * Calculate overall scores
     */
    _calculateScores(result) {
        const scores = {
            overall: 0,
            quality: 0,
            performance: 0,
            security: 0,
            maintainability: 0
        };

        // Calculate individual scores based on available data
        if (result.validationData) {
            scores.quality = this._calculateQualityScore(result.validationData);
        }

        if (result.metrics) {
            scores.performance = this._calculatePerformanceScore(result.metrics);
        }

        if (result.issues) {
            scores.security = this._calculateSecurityScore(result.issues);
            scores.maintainability = this._calculateMaintainabilityScore(result.issues);
        }

        // Calculate overall score
        const validScores = Object.values(scores).filter(score => score > 0);
        scores.overall = validScores.length > 0 ? 
            validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;

        return scores;
    }

    _calculateQualityScore(validationData) {
        // Implement quality score calculation
        return 85; // Placeholder
    }

    _calculatePerformanceScore(metrics) {
        // Implement performance score calculation
        return 80; // Placeholder
    }

    _calculateSecurityScore(issues) {
        const securityIssues = issues.filter(issue => 
            issue.category === 'security' || issue.type === 'security'
        );
        
        if (securityIssues.length === 0) return 100;
        if (securityIssues.length < 3) return 80;
        if (securityIssues.length < 5) return 60;
        return 40;
    }

    _calculateMaintainabilityScore(issues) {
        const maintainabilityIssues = issues.filter(issue => 
            issue.category === 'maintainability' || issue.type === 'maintainability'
        );
        
        if (maintainabilityIssues.length === 0) return 100;
        if (maintainabilityIssues.length < 5) return 80;
        if (maintainabilityIssues.length < 10) return 60;
        return 40;
    }

    /**
     * Update metrics
     */
    _updateMetrics(result) {
        try {
            this.metrics.totalValidations++;

            if (result.status === 'success') {
                this.metrics.successfulValidations++;
            } else {
                this.metrics.failedValidations++;
            }

            // Update average validation time
            const totalTime = (this.metrics.averageValidationTime * (this.metrics.totalValidations - 1)) + result.duration;
            this.metrics.averageValidationTime = totalTime / this.metrics.totalValidations;

            // Update validation by type
            const type = result.type || 'unknown';
            this.metrics.validationsByType.set(type, (this.metrics.validationsByType.get(type) || 0) + 1);

            // Update validation by repository
            if (result.prInfo && result.prInfo.repository) {
                const repo = result.prInfo.repository;
                this.metrics.validationsByRepository.set(repo, (this.metrics.validationsByRepository.get(repo) || 0) + 1);
            }

            // Update issues by category
            if (result.issues) {
                for (const issue of result.issues) {
                    const category = issue.category || 'unknown';
                    this.metrics.issuesByCategory.set(category, (this.metrics.issuesByCategory.get(category) || 0) + 1);
                }
            }

            // Update performance metrics
            if (result.metrics) {
                for (const [key, value] of Object.entries(result.metrics)) {
                    if (typeof value === 'number') {
                        const current = this.metrics.performanceMetrics.get(key) || { total: 0, count: 0, average: 0 };
                        current.total += value;
                        current.count++;
                        current.average = current.total / current.count;
                        this.metrics.performanceMetrics.set(key, current);
                    }
                }
            }

        } catch (error) {
            this.logger.error('Failed to update metrics:', error);
        }
    }

    /**
     * Aggregate metrics
     */
    _aggregateMetrics() {
        try {
            const aggregatedMetrics = {
                timestamp: new Date().toISOString(),
                summary: {
                    totalValidations: this.metrics.totalValidations,
                    successRate: this.metrics.totalValidations > 0 ? 
                        (this.metrics.successfulValidations / this.metrics.totalValidations) * 100 : 0,
                    averageValidationTime: this.metrics.averageValidationTime
                },
                validationsByType: Object.fromEntries(this.metrics.validationsByType),
                validationsByRepository: Object.fromEntries(this.metrics.validationsByRepository),
                issuesByCategory: Object.fromEntries(this.metrics.issuesByCategory),
                performanceMetrics: Object.fromEntries(this.metrics.performanceMetrics)
            };

            // Save aggregated metrics
            const metricsPath = join(this.config.resultsDirectory, 'metrics', `metrics-${Date.now()}.json`);
            writeFileSync(metricsPath, JSON.stringify(aggregatedMetrics, null, 2));

            this.emit('metrics.aggregated', aggregatedMetrics);

        } catch (error) {
            this.logger.error('Failed to aggregate metrics:', error);
        }
    }

    /**
     * Generate report
     */
    async generateReport(options = {}) {
        try {
            const {
                format = 'json',
                timeRange = '24h',
                includeDetails = false,
                filterBy = {}
            } = options;

            this.logger.info(`Generating report: ${format}, timeRange: ${timeRange}`);

            // Get results within time range
            const results = this._getResultsInTimeRange(timeRange, filterBy);

            // Generate report data
            const reportData = {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    timeRange,
                    totalResults: results.length,
                    format,
                    filters: filterBy
                },
                summary: this._generateSummary(results),
                details: includeDetails ? results : [],
                metrics: this._generateReportMetrics(results),
                trends: this._generateTrends(results),
                recommendations: this._generateRecommendations(results)
            };

            // Format report
            let formattedReport;
            switch (format) {
                case 'markdown':
                    formattedReport = this._formatMarkdownReport(reportData);
                    break;
                case 'html':
                    formattedReport = this._formatHtmlReport(reportData);
                    break;
                case 'json':
                default:
                    formattedReport = JSON.stringify(reportData, null, 2);
            }

            // Save report
            const reportFilename = `report-${Date.now()}.${format}`;
            const reportPath = join(this.config.resultsDirectory, 'reports', reportFilename);
            writeFileSync(reportPath, formattedReport);

            this.emit('report.generated', {
                format,
                path: reportPath,
                resultsCount: results.length,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                reportPath,
                format,
                data: reportData
            };

        } catch (error) {
            this.logger.error('Failed to generate report:', error);
            throw error;
        }
    }

    /**
     * Get results in time range
     */
    _getResultsInTimeRange(timeRange, filterBy = {}) {
        const now = new Date();
        let cutoffTime;

        switch (timeRange) {
            case '1h':
                cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        return Array.from(this.results.values()).filter(result => {
            const resultTime = new Date(result.timestamp);
            
            // Time filter
            if (resultTime < cutoffTime) return false;

            // Additional filters
            if (filterBy.status && result.status !== filterBy.status) return false;
            if (filterBy.type && result.type !== filterBy.type) return false;
            if (filterBy.repository && result.prInfo?.repository !== filterBy.repository) return false;

            return true;
        });
    }

    /**
     * Generate summary
     */
    _generateSummary(results) {
        const summary = {
            totalResults: results.length,
            successfulResults: results.filter(r => r.status === 'success').length,
            failedResults: results.filter(r => r.status === 'failure').length,
            averageDuration: 0,
            totalIssues: 0,
            criticalIssues: 0
        };

        if (results.length > 0) {
            summary.successRate = (summary.successfulResults / summary.totalResults) * 100;
            summary.averageDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;
            
            for (const result of results) {
                if (result.issues) {
                    summary.totalIssues += result.issues.length;
                    summary.criticalIssues += result.issues.filter(i => 
                        i.severity === 'critical' || i.severity === 'high'
                    ).length;
                }
            }
        }

        return summary;
    }

    /**
     * Generate report metrics
     */
    _generateReportMetrics(results) {
        // Implementation for report metrics
        return {
            validationsByType: {},
            issuesByCategory: {},
            performanceTrends: {}
        };
    }

    /**
     * Generate trends
     */
    _generateTrends(results) {
        // Implementation for trend analysis
        return {
            successRateTrend: 'stable',
            performanceTrend: 'improving',
            issuesTrend: 'decreasing'
        };
    }

    /**
     * Generate recommendations
     */
    _generateRecommendations(results) {
        const recommendations = [];

        const summary = this._generateSummary(results);

        if (summary.successRate < 80) {
            recommendations.push({
                type: 'quality',
                priority: 'high',
                message: 'Success rate is below 80%. Review validation processes and common failure patterns.'
            });
        }

        if (summary.criticalIssues > 0) {
            recommendations.push({
                type: 'security',
                priority: 'critical',
                message: `${summary.criticalIssues} critical issues found. Address immediately before deployment.`
            });
        }

        return recommendations;
    }

    /**
     * Format markdown report
     */
    _formatMarkdownReport(reportData) {
        // Implementation for markdown formatting
        return `# Validation Report\n\nGenerated: ${reportData.metadata.generatedAt}\n\n## Summary\n\n...`;
    }

    /**
     * Format HTML report
     */
    _formatHtmlReport(reportData) {
        // Implementation for HTML formatting
        return `<html><head><title>Validation Report</title></head><body>...</body></html>`;
    }

    /**
     * Get result by ID
     */
    getResult(resultId) {
        return this.results.get(resultId);
    }

    /**
     * List results
     */
    listResults(options = {}) {
        const { limit = 50, offset = 0, status, type } = options;
        
        let results = Array.from(this.results.values());

        // Apply filters
        if (status) {
            results = results.filter(r => r.status === status);
        }
        if (type) {
            results = results.filter(r => r.type === type);
        }

        // Sort by timestamp (newest first)
        results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination
        return results.slice(offset, offset + limit);
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            validationsByType: Object.fromEntries(this.metrics.validationsByType),
            validationsByRepository: Object.fromEntries(this.metrics.validationsByRepository),
            issuesByCategory: Object.fromEntries(this.metrics.issuesByCategory),
            performanceMetrics: Object.fromEntries(this.metrics.performanceMetrics)
        };
    }

    /**
     * Clear old results
     */
    async clearOldResults() {
        try {
            const cutoffTime = new Date(Date.now() - this.config.retentionPeriod);
            let removedCount = 0;

            for (const [resultId, result] of this.results.entries()) {
                if (new Date(result.timestamp) < cutoffTime) {
                    this.results.delete(resultId);
                    removedCount++;
                }
            }

            this.logger.info(`Cleared ${removedCount} old results`);
            return removedCount;

        } catch (error) {
            this.logger.error('Failed to clear old results:', error);
            return 0;
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalResults: this.results.size,
            maxResults: this.config.maxResultsHistory,
            metrics: this.getMetrics(),
            isInitialized: this.isInitialized,
            resultsDirectory: this.config.resultsDirectory
        };
    }

    /**
     * Shutdown result collector
     */
    async shutdown() {
        try {
            // Stop aggregation timer
            if (this.aggregationTimer) {
                clearInterval(this.aggregationTimer);
            }

            // Final metrics aggregation
            this._aggregateMetrics();

            // Clear old results
            await this.clearOldResults();

            this.logger.info('Result Collector shutdown completed');
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
        }
    }
}

export default ResultCollector;

