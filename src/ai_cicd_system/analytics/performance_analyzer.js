/**
 * @fileoverview Performance Analyzer
 * @description Advanced performance analytics and insights for CI/CD systems
 */

import { EventEmitter } from 'events';

/**
 * Performance analyzer for comprehensive CI/CD analytics
 */
export class PerformanceAnalyzer extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            analysis_window: config.analysis_window || 3600000, // 1 hour
            trend_analysis_period: config.trend_analysis_period || 86400000, // 24 hours
            anomaly_detection_threshold: config.anomaly_detection_threshold || 2.0, // 2 standard deviations
            enable_predictive_analysis: config.enable_predictive_analysis !== false,
            enable_bottleneck_detection: config.enable_bottleneck_detection !== false,
            enable_capacity_planning: config.enable_capacity_planning !== false,
            min_data_points: config.min_data_points || 10,
            ...config
        };

        this.performanceData = [];
        this.analysisResults = new Map();
        this.trends = new Map();
        this.anomalies = [];
        this.bottlenecks = [];
        this.predictions = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize performance analyzer
     */
    async initialize() {
        if (this.isInitialized) return;

        this.isInitialized = true;
        this._startPeriodicAnalysis();
        
        this.emit('initialized');
    }

    /**
     * Add performance data point
     */
    addDataPoint(dataPoint) {
        const enrichedDataPoint = {
            ...dataPoint,
            timestamp: dataPoint.timestamp || new Date(),
            id: this._generateId()
        };

        this.performanceData.push(enrichedDataPoint);
        this._cleanupOldData();

        this.emit('data_point_added', enrichedDataPoint);
    }

    /**
     * Analyze CI/CD pipeline performance
     */
    analyzePipelinePerformance(timeRange = '1h') {
        const data = this._getDataInTimeRange(timeRange);
        const pipelineData = data.filter(d => d.type === 'pipeline');

        if (pipelineData.length < this.config.min_data_points) {
            return {
                status: 'insufficient_data',
                message: 'Not enough data points for analysis',
                dataPoints: pipelineData.length
            };
        }

        const analysis = {
            summary: this._analyzePipelineSummary(pipelineData),
            stages: this._analyzeStagePerformance(pipelineData),
            trends: this._analyzePipelineTrends(pipelineData),
            bottlenecks: this._identifyPipelineBottlenecks(pipelineData),
            recommendations: this._generatePipelineRecommendations(pipelineData)
        };

        this.analysisResults.set('pipeline_performance', analysis);
        this.emit('pipeline_analysis_completed', analysis);

        return analysis;
    }

    /**
     * Analyze code generation performance
     */
    analyzeCodeGenerationPerformance(timeRange = '1h') {
        const data = this._getDataInTimeRange(timeRange);
        const codeGenData = data.filter(d => d.type === 'code_generation');

        if (codeGenData.length < this.config.min_data_points) {
            return {
                status: 'insufficient_data',
                message: 'Not enough data points for analysis',
                dataPoints: codeGenData.length
            };
        }

        const analysis = {
            summary: this._analyzeCodeGenSummary(codeGenData),
            complexity: this._analyzeCodeComplexity(codeGenData),
            efficiency: this._analyzeCodeGenEfficiency(codeGenData),
            patterns: this._identifyCodeGenPatterns(codeGenData),
            recommendations: this._generateCodeGenRecommendations(codeGenData)
        };

        this.analysisResults.set('code_generation_performance', analysis);
        this.emit('codegen_analysis_completed', analysis);

        return analysis;
    }

    /**
     * Analyze validation performance
     */
    analyzeValidationPerformance(timeRange = '1h') {
        const data = this._getDataInTimeRange(timeRange);
        const validationData = data.filter(d => d.type === 'validation');

        if (validationData.length < this.config.min_data_points) {
            return {
                status: 'insufficient_data',
                message: 'Not enough data points for analysis',
                dataPoints: validationData.length
            };
        }

        const analysis = {
            summary: this._analyzeValidationSummary(validationData),
            testTypes: this._analyzeTestTypePerformance(validationData),
            coverage: this._analyzeTestCoverage(validationData),
            reliability: this._analyzeValidationReliability(validationData),
            recommendations: this._generateValidationRecommendations(validationData)
        };

        this.analysisResults.set('validation_performance', analysis);
        this.emit('validation_analysis_completed', analysis);

        return analysis;
    }

    /**
     * Analyze deployment performance
     */
    analyzeDeploymentPerformance(timeRange = '1h') {
        const data = this._getDataInTimeRange(timeRange);
        const deploymentData = data.filter(d => d.type === 'deployment');

        if (deploymentData.length < this.config.min_data_points) {
            return {
                status: 'insufficient_data',
                message: 'Not enough data points for analysis',
                dataPoints: deploymentData.length
            };
        }

        const analysis = {
            summary: this._analyzeDeploymentSummary(deploymentData),
            environments: this._analyzeEnvironmentPerformance(deploymentData),
            strategies: this._analyzeDeploymentStrategies(deploymentData),
            rollbacks: this._analyzeRollbackPatterns(deploymentData),
            recommendations: this._generateDeploymentRecommendations(deploymentData)
        };

        this.analysisResults.set('deployment_performance', analysis);
        this.emit('deployment_analysis_completed', analysis);

        return analysis;
    }

    /**
     * Detect performance anomalies
     */
    detectAnomalies(timeRange = '24h') {
        const data = this._getDataInTimeRange(timeRange);
        const anomalies = [];

        // Group data by operation type
        const groupedData = this._groupDataByOperation(data);

        Object.entries(groupedData).forEach(([operation, operationData]) => {
            const durations = operationData.map(d => d.duration);
            const stats = this._calculateStatistics(durations);

            // Detect outliers using statistical methods
            operationData.forEach(dataPoint => {
                const zScore = Math.abs((dataPoint.duration - stats.mean) / stats.stdDev);
                
                if (zScore > this.config.anomaly_detection_threshold) {
                    anomalies.push({
                        id: dataPoint.id,
                        operation,
                        timestamp: dataPoint.timestamp,
                        duration: dataPoint.duration,
                        expectedDuration: stats.mean,
                        deviation: zScore,
                        severity: this._calculateAnomalySeverity(zScore),
                        type: dataPoint.duration > stats.mean ? 'slow' : 'fast'
                    });
                }
            });
        });

        this.anomalies = anomalies;
        this.emit('anomalies_detected', anomalies);

        return anomalies;
    }

    /**
     * Identify system bottlenecks
     */
    identifyBottlenecks(timeRange = '1h') {
        if (!this.config.enable_bottleneck_detection) return [];

        const data = this._getDataInTimeRange(timeRange);
        const bottlenecks = [];

        // Analyze by operation type
        const operationStats = this._analyzeOperationStatistics(data);

        Object.entries(operationStats).forEach(([operation, stats]) => {
            // Identify operations that are consistently slow
            if (stats.avgDuration > stats.p95Duration * 0.8 && stats.count > 5) {
                bottlenecks.push({
                    type: 'consistent_slowness',
                    operation,
                    avgDuration: stats.avgDuration,
                    p95Duration: stats.p95Duration,
                    count: stats.count,
                    severity: this._calculateBottleneckSeverity(stats),
                    impact: this._calculateBottleneckImpact(stats, data.length)
                });
            }

            // Identify operations with high error rates
            if (stats.errorRate > 0.1 && stats.count > 3) {
                bottlenecks.push({
                    type: 'high_error_rate',
                    operation,
                    errorRate: stats.errorRate,
                    count: stats.count,
                    severity: 'high',
                    impact: this._calculateErrorImpact(stats, data.length)
                });
            }
        });

        // Analyze resource bottlenecks
        const resourceBottlenecks = this._identifyResourceBottlenecks(data);
        bottlenecks.push(...resourceBottlenecks);

        this.bottlenecks = bottlenecks;
        this.emit('bottlenecks_identified', bottlenecks);

        return bottlenecks;
    }

    /**
     * Generate performance predictions
     */
    generatePredictions(timeRange = '24h') {
        if (!this.config.enable_predictive_analysis) return {};

        const data = this._getDataInTimeRange(timeRange);
        const predictions = {};

        // Predict pipeline execution times
        predictions.pipeline = this._predictPipelinePerformance(data);

        // Predict resource usage
        predictions.resources = this._predictResourceUsage(data);

        // Predict error rates
        predictions.errors = this._predictErrorRates(data);

        // Predict capacity needs
        predictions.capacity = this._predictCapacityNeeds(data);

        this.predictions.set('latest', {
            timestamp: new Date(),
            predictions,
            confidence: this._calculatePredictionConfidence(data)
        });

        this.emit('predictions_generated', predictions);

        return predictions;
    }

    /**
     * Generate capacity planning insights
     */
    generateCapacityPlanningInsights(timeRange = '7d') {
        if (!this.config.enable_capacity_planning) return {};

        const data = this._getDataInTimeRange(timeRange);
        
        const insights = {
            currentCapacity: this._analyzeCurrentCapacity(data),
            utilizationTrends: this._analyzeUtilizationTrends(data),
            growthProjections: this._projectGrowth(data),
            recommendations: this._generateCapacityRecommendations(data),
            scalingPoints: this._identifyScalingPoints(data)
        };

        this.emit('capacity_insights_generated', insights);

        return insights;
    }

    /**
     * Get comprehensive performance report
     */
    generatePerformanceReport(timeRange = '24h') {
        const report = {
            timestamp: new Date(),
            timeRange,
            summary: this._generateReportSummary(timeRange),
            pipeline: this.analyzePipelinePerformance(timeRange),
            codeGeneration: this.analyzeCodeGenerationPerformance(timeRange),
            validation: this.analyzeValidationPerformance(timeRange),
            deployment: this.analyzeDeploymentPerformance(timeRange),
            anomalies: this.detectAnomalies(timeRange),
            bottlenecks: this.identifyBottlenecks(timeRange),
            predictions: this.generatePredictions(timeRange),
            recommendations: this._generateOverallRecommendations(timeRange)
        };

        this.emit('performance_report_generated', report);

        return report;
    }

    /**
     * Private methods
     */
    _getDataInTimeRange(timeRange) {
        const timeRangeMs = this._parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);
        
        return this.performanceData.filter(
            data => data.timestamp >= cutoffTime
        );
    }

    _analyzePipelineSummary(data) {
        const durations = data.map(d => d.duration);
        const successCount = data.filter(d => d.result?.success !== false).length;

        return {
            totalExecutions: data.length,
            avgDuration: this._calculateMean(durations),
            medianDuration: this._calculateMedian(durations),
            p95Duration: this._calculatePercentile(durations, 95),
            p99Duration: this._calculatePercentile(durations, 99),
            successRate: successCount / data.length,
            errorRate: (data.length - successCount) / data.length,
            throughput: data.length / (this.config.analysis_window / 1000) // per second
        };
    }

    _analyzeStagePerformance(data) {
        const stageData = {};
        
        data.forEach(item => {
            const stage = item.metadata?.stage || 'unknown';
            if (!stageData[stage]) {
                stageData[stage] = [];
            }
            stageData[stage].push(item);
        });

        const stageAnalysis = {};
        Object.entries(stageData).forEach(([stage, items]) => {
            const durations = items.map(i => i.duration);
            stageAnalysis[stage] = {
                count: items.length,
                avgDuration: this._calculateMean(durations),
                medianDuration: this._calculateMedian(durations),
                p95Duration: this._calculatePercentile(durations, 95),
                contribution: this._calculateMean(durations) / this._calculateMean(data.map(d => d.duration))
            };
        });

        return stageAnalysis;
    }

    _analyzePipelineTrends(data) {
        // Simple trend analysis - could be enhanced with more sophisticated algorithms
        const hourlyData = this._groupDataByHour(data);
        const trends = {};

        Object.entries(hourlyData).forEach(([hour, items]) => {
            const durations = items.map(i => i.duration);
            trends[hour] = {
                avgDuration: this._calculateMean(durations),
                count: items.length,
                errorRate: items.filter(i => i.result?.success === false).length / items.length
            };
        });

        return trends;
    }

    _identifyPipelineBottlenecks(data) {
        const bottlenecks = [];
        const stageAnalysis = this._analyzeStagePerformance(data);

        // Find stages that take disproportionately long
        const totalAvgDuration = this._calculateMean(data.map(d => d.duration));
        
        Object.entries(stageAnalysis).forEach(([stage, analysis]) => {
            if (analysis.contribution > 0.4) { // Stage takes more than 40% of total time
                bottlenecks.push({
                    stage,
                    type: 'time_bottleneck',
                    contribution: analysis.contribution,
                    avgDuration: analysis.avgDuration,
                    severity: analysis.contribution > 0.6 ? 'high' : 'medium'
                });
            }
        });

        return bottlenecks;
    }

    _generatePipelineRecommendations(data) {
        const recommendations = [];
        const summary = this._analyzePipelineSummary(data);
        const bottlenecks = this._identifyPipelineBottlenecks(data);

        // Performance recommendations
        if (summary.p95Duration > 600000) { // > 10 minutes
            recommendations.push({
                type: 'performance',
                priority: 'high',
                title: 'Long Pipeline Execution Times',
                description: 'Pipeline executions are taking longer than expected',
                suggestion: 'Consider parallelizing stages or optimizing slow operations'
            });
        }

        // Error rate recommendations
        if (summary.errorRate > 0.1) {
            recommendations.push({
                type: 'reliability',
                priority: 'high',
                title: 'High Error Rate',
                description: `Error rate is ${(summary.errorRate * 100).toFixed(1)}%`,
                suggestion: 'Investigate common failure patterns and improve error handling'
            });
        }

        // Bottleneck recommendations
        bottlenecks.forEach(bottleneck => {
            recommendations.push({
                type: 'bottleneck',
                priority: bottleneck.severity === 'high' ? 'high' : 'medium',
                title: `Stage Bottleneck: ${bottleneck.stage}`,
                description: `Stage ${bottleneck.stage} is consuming ${(bottleneck.contribution * 100).toFixed(1)}% of pipeline time`,
                suggestion: `Optimize ${bottleneck.stage} stage or consider breaking it into smaller parallel tasks`
            });
        });

        return recommendations;
    }

    _analyzeCodeGenSummary(data) {
        const durations = data.map(d => d.duration);
        const complexityData = data.filter(d => d.metadata?.complexity);
        const successCount = data.filter(d => d.result?.success !== false).length;

        return {
            totalRequests: data.length,
            avgDuration: this._calculateMean(durations),
            medianDuration: this._calculateMedian(durations),
            p95Duration: this._calculatePercentile(durations, 95),
            successRate: successCount / data.length,
            avgComplexity: complexityData.length > 0 ? 
                this._calculateMean(complexityData.map(d => d.metadata.complexity)) : null,
            throughput: data.length / (this.config.analysis_window / 1000)
        };
    }

    _analyzeCodeComplexity(data) {
        const complexityData = data.filter(d => d.metadata?.complexity);
        if (complexityData.length === 0) return null;

        const complexities = complexityData.map(d => d.metadata.complexity);
        const durations = complexityData.map(d => d.duration);

        return {
            avgComplexity: this._calculateMean(complexities),
            complexityDurationCorrelation: this._calculateCorrelation(complexities, durations),
            complexityDistribution: this._calculateDistribution(complexities)
        };
    }

    _analyzeCodeGenEfficiency(data) {
        const linesOfCodeData = data.filter(d => d.metadata?.linesOfCode);
        if (linesOfCodeData.length === 0) return null;

        const linesPerSecond = linesOfCodeData.map(d => 
            d.metadata.linesOfCode / (d.duration / 1000)
        );

        return {
            avgLinesPerSecond: this._calculateMean(linesPerSecond),
            medianLinesPerSecond: this._calculateMedian(linesPerSecond),
            efficiency: this._calculateMean(linesPerSecond) > 10 ? 'high' : 'medium'
        };
    }

    _identifyCodeGenPatterns(data) {
        const patterns = {};
        
        // Analyze by request type
        const typeData = this._groupBy(data, d => d.metadata?.requestType || 'unknown');
        Object.entries(typeData).forEach(([type, items]) => {
            patterns[type] = {
                count: items.length,
                avgDuration: this._calculateMean(items.map(i => i.duration)),
                successRate: items.filter(i => i.result?.success !== false).length / items.length
            };
        });

        return patterns;
    }

    _generateCodeGenRecommendations(data) {
        const recommendations = [];
        const summary = this._analyzeCodeGenSummary(data);
        const efficiency = this._analyzeCodeGenEfficiency(data);

        if (summary.p95Duration > 30000) { // > 30 seconds
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                title: 'Slow Code Generation',
                description: '95th percentile generation time exceeds 30 seconds',
                suggestion: 'Consider optimizing generation algorithms or using caching'
            });
        }

        if (efficiency && efficiency.avgLinesPerSecond < 5) {
            recommendations.push({
                type: 'efficiency',
                priority: 'medium',
                title: 'Low Generation Efficiency',
                description: 'Code generation efficiency is below optimal levels',
                suggestion: 'Review generation templates and optimize for common patterns'
            });
        }

        return recommendations;
    }

    _startPeriodicAnalysis() {
        setInterval(() => {
            this._performPeriodicAnalysis();
        }, this.config.analysis_window);
    }

    _performPeriodicAnalysis() {
        try {
            this.detectAnomalies();
            this.identifyBottlenecks();
            
            if (this.config.enable_predictive_analysis) {
                this.generatePredictions();
            }

            this.emit('periodic_analysis_completed');
        } catch (error) {
            this.emit('analysis_error', error);
        }
    }

    _cleanupOldData() {
        const cutoffTime = new Date(Date.now() - this.config.trend_analysis_period);
        this.performanceData = this.performanceData.filter(
            data => data.timestamp >= cutoffTime
        );
    }

    _generateId() {
        return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _parseTimeRange(timeRange) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = timeRange.match(/^(\d+)([smhd])$/);
        if (!match) return 60 * 60 * 1000; // Default to 1 hour

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }

    _calculateMean(values) {
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    _calculateMedian(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? 
            (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    _calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        
        if (lower === upper) return sorted[lower];
        
        const weight = index - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    _calculateStatistics(values) {
        const mean = this._calculateMean(values);
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        return { mean, variance, stdDev };
    }

    _groupBy(array, keyFn) {
        return array.reduce((groups, item) => {
            const key = keyFn(item);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
            return groups;
        }, {});
    }

    _groupDataByOperation(data) {
        return this._groupBy(data, d => d.operationId?.split('_')[0] || 'unknown');
    }

    _groupDataByHour(data) {
        return this._groupBy(data, d => new Date(d.timestamp).getHours());
    }

    _calculateCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) return 0;
        
        const meanX = this._calculateMean(x);
        const meanY = this._calculateMean(y);
        
        let numerator = 0;
        let denomX = 0;
        let denomY = 0;
        
        for (let i = 0; i < x.length; i++) {
            const deltaX = x[i] - meanX;
            const deltaY = y[i] - meanY;
            numerator += deltaX * deltaY;
            denomX += deltaX * deltaX;
            denomY += deltaY * deltaY;
        }
        
        const denominator = Math.sqrt(denomX * denomY);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    _calculateDistribution(values) {
        const distribution = {};
        values.forEach(value => {
            const bucket = Math.floor(value / 10) * 10; // Group by tens
            distribution[bucket] = (distribution[bucket] || 0) + 1;
        });
        return distribution;
    }

    // Additional helper methods would be implemented here...
    // This is a comprehensive foundation for the performance analyzer
}

export default PerformanceAnalyzer;

