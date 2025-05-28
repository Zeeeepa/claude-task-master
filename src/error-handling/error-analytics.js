/**
 * @fileoverview Error Analytics
 * @description Error pattern analysis and trend detection
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Analytics time periods
 */
export const TimePeriod = {
    HOUR: 'hour',
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month'
};

/**
 * Trend directions
 */
export const TrendDirection = {
    INCREASING: 'increasing',
    DECREASING: 'decreasing',
    STABLE: 'stable',
    VOLATILE: 'volatile'
};

/**
 * Error pattern analysis and trend detection
 */
export class ErrorAnalytics {
    constructor(config = {}) {
        this.config = {
            retentionPeriod: config.retentionPeriod || 2592000000, // 30 days
            analysisInterval: config.analysisInterval || 3600000, // 1 hour
            trendThreshold: config.trendThreshold || 0.2, // 20% change
            volatilityThreshold: config.volatilityThreshold || 0.5, // 50% variance
            enablePrediction: config.enablePrediction !== false,
            predictionWindow: config.predictionWindow || 86400000, // 24 hours
            ...config
        };

        this.errorData = [];
        this.patterns = new Map();
        this.trends = new Map();
        this.predictions = new Map();
        this.analysisTimer = null;
        
        this._startAnalysisTimer();
    }

    /**
     * Record error for analytics
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     */
    recordError(errorInfo, context = {}) {
        const record = {
            id: this._generateRecordId(),
            timestamp: Date.now(),
            error: {
                type: errorInfo.type,
                category: errorInfo.category,
                severity: errorInfo.severity,
                message: errorInfo.message,
                confidence: errorInfo.confidence
            },
            context: {
                environment: context.environment || 'unknown',
                operationType: context.operationType || 'unknown',
                component: context.component || 'unknown',
                repository: context.repository || 'unknown',
                branch: context.branch || 'unknown'
            },
            metadata: {
                attempts: context.attempts || 1,
                totalTime: context.totalTime || 0,
                escalated: context.escalated || false,
                resolved: context.resolved || false
            }
        };

        this.errorData.push(record);
        this._cleanOldData();

        log('debug', 'Error recorded for analytics', {
            recordId: record.id,
            errorType: record.error.type,
            environment: record.context.environment
        });
    }

    /**
     * Analyze error patterns
     * @param {string} timePeriod - Time period for analysis
     * @returns {Object} Pattern analysis results
     */
    analyzePatterns(timePeriod = TimePeriod.DAY) {
        const timeWindow = this._getTimeWindow(timePeriod);
        const recentErrors = this._getErrorsInWindow(timeWindow);

        const analysis = {
            timePeriod,
            timeWindow,
            totalErrors: recentErrors.length,
            patterns: {
                byType: this._analyzeByType(recentErrors),
                byCategory: this._analyzeByCategory(recentErrors),
                bySeverity: this._analyzeBySeverity(recentErrors),
                byEnvironment: this._analyzeByEnvironment(recentErrors),
                byComponent: this._analyzeByComponent(recentErrors),
                temporal: this._analyzeTemporalPatterns(recentErrors, timePeriod)
            },
            correlations: this._analyzeCorrelations(recentErrors),
            anomalies: this._detectAnomalies(recentErrors, timePeriod),
            insights: this._generateInsights(recentErrors)
        };

        // Store pattern analysis
        this.patterns.set(timePeriod, analysis);

        log('info', 'Pattern analysis completed', {
            timePeriod,
            totalErrors: analysis.totalErrors,
            anomalies: analysis.anomalies.length
        });

        return analysis;
    }

    /**
     * Analyze error trends
     * @param {string} timePeriod - Time period for trend analysis
     * @returns {Object} Trend analysis results
     */
    analyzeTrends(timePeriod = TimePeriod.DAY) {
        const currentWindow = this._getTimeWindow(timePeriod);
        const previousWindow = {
            start: currentWindow.start - (currentWindow.end - currentWindow.start),
            end: currentWindow.start
        };

        const currentErrors = this._getErrorsInWindow(currentWindow);
        const previousErrors = this._getErrorsInWindow(previousWindow);

        const trends = {
            timePeriod,
            current: {
                period: currentWindow,
                count: currentErrors.length,
                byType: this._groupByField(currentErrors, 'error.type'),
                bySeverity: this._groupByField(currentErrors, 'error.severity')
            },
            previous: {
                period: previousWindow,
                count: previousErrors.length,
                byType: this._groupByField(previousErrors, 'error.type'),
                bySeverity: this._groupByField(previousErrors, 'error.severity')
            },
            changes: this._calculateTrendChanges(currentErrors, previousErrors),
            direction: this._determineTrendDirection(currentErrors, previousErrors),
            predictions: this.config.enablePrediction ? 
                this._generatePredictions(currentErrors, previousErrors, timePeriod) : null
        };

        // Store trend analysis
        this.trends.set(timePeriod, trends);

        log('info', 'Trend analysis completed', {
            timePeriod,
            direction: trends.direction,
            changePercent: trends.changes.overall.percentage
        });

        return trends;
    }

    /**
     * Get error statistics
     * @param {string} timePeriod - Time period for statistics
     * @returns {Object} Error statistics
     */
    getStatistics(timePeriod = TimePeriod.DAY) {
        const timeWindow = this._getTimeWindow(timePeriod);
        const errors = this._getErrorsInWindow(timeWindow);

        const stats = {
            timePeriod,
            timeWindow,
            total: errors.length,
            byType: this._getDistribution(errors, 'error.type'),
            byCategory: this._getDistribution(errors, 'error.category'),
            bySeverity: this._getDistribution(errors, 'error.severity'),
            byEnvironment: this._getDistribution(errors, 'context.environment'),
            resolution: {
                resolved: errors.filter(e => e.metadata.resolved).length,
                escalated: errors.filter(e => e.metadata.escalated).length,
                averageAttempts: this._calculateAverage(errors, 'metadata.attempts'),
                averageResolutionTime: this._calculateAverageResolutionTime(errors)
            },
            confidence: {
                average: this._calculateAverage(errors, 'error.confidence'),
                distribution: this._getConfidenceDistribution(errors)
            }
        };

        return stats;
    }

    /**
     * Detect error anomalies
     * @param {Array} errors - Error records
     * @param {string} timePeriod - Time period
     * @returns {Array} Detected anomalies
     * @private
     */
    _detectAnomalies(errors, timePeriod) {
        const anomalies = [];
        
        // Detect frequency anomalies
        const frequencyAnomalies = this._detectFrequencyAnomalies(errors, timePeriod);
        anomalies.push(...frequencyAnomalies);

        // Detect pattern anomalies
        const patternAnomalies = this._detectPatternAnomalies(errors);
        anomalies.push(...patternAnomalies);

        // Detect severity anomalies
        const severityAnomalies = this._detectSeverityAnomalies(errors);
        anomalies.push(...severityAnomalies);

        return anomalies;
    }

    /**
     * Detect frequency anomalies
     * @param {Array} errors - Error records
     * @param {string} timePeriod - Time period
     * @returns {Array} Frequency anomalies
     * @private
     */
    _detectFrequencyAnomalies(errors, timePeriod) {
        const anomalies = [];
        const bucketSize = this._getBucketSize(timePeriod);
        const buckets = this._createTimeBuckets(errors, bucketSize);
        
        const frequencies = buckets.map(bucket => bucket.length);
        const mean = frequencies.reduce((sum, freq) => sum + freq, 0) / frequencies.length;
        const stdDev = Math.sqrt(
            frequencies.reduce((sum, freq) => sum + Math.pow(freq - mean, 2), 0) / frequencies.length
        );

        const threshold = mean + (2 * stdDev); // 2 standard deviations

        buckets.forEach((bucket, index) => {
            if (bucket.length > threshold) {
                anomalies.push({
                    type: 'frequency_spike',
                    severity: 'high',
                    description: `Error frequency spike detected: ${bucket.length} errors (expected: ${mean.toFixed(1)})`,
                    timeRange: {
                        start: index * bucketSize,
                        end: (index + 1) * bucketSize
                    },
                    value: bucket.length,
                    expected: mean,
                    threshold
                });
            }
        });

        return anomalies;
    }

    /**
     * Detect pattern anomalies
     * @param {Array} errors - Error records
     * @returns {Array} Pattern anomalies
     * @private
     */
    _detectPatternAnomalies(errors) {
        const anomalies = [];
        
        // Detect unusual error type combinations
        const typePatterns = this._analyzeTypePatterns(errors);
        for (const [pattern, count] of typePatterns.entries()) {
            if (count > 5 && pattern.includes('critical')) {
                anomalies.push({
                    type: 'pattern_anomaly',
                    severity: 'medium',
                    description: `Unusual error pattern detected: ${pattern}`,
                    pattern,
                    count
                });
            }
        }

        return anomalies;
    }

    /**
     * Detect severity anomalies
     * @param {Array} errors - Error records
     * @returns {Array} Severity anomalies
     * @private
     */
    _detectSeverityAnomalies(errors) {
        const anomalies = [];
        const severityDistribution = this._getDistribution(errors, 'error.severity');
        
        // Check for unusual critical error ratio
        const criticalRatio = (severityDistribution.critical || 0) / errors.length;
        if (criticalRatio > 0.1) { // More than 10% critical errors
            anomalies.push({
                type: 'severity_anomaly',
                severity: 'high',
                description: `High critical error ratio: ${(criticalRatio * 100).toFixed(1)}%`,
                ratio: criticalRatio,
                threshold: 0.1
            });
        }

        return anomalies;
    }

    /**
     * Generate insights from error data
     * @param {Array} errors - Error records
     * @returns {Array} Generated insights
     * @private
     */
    _generateInsights(errors) {
        const insights = [];

        // Most common error type
        const typeDistribution = this._getDistribution(errors, 'error.type');
        const mostCommonType = Object.entries(typeDistribution)
            .sort(([,a], [,b]) => b - a)[0];
        
        if (mostCommonType) {
            insights.push({
                type: 'most_common_error',
                description: `Most common error type: ${mostCommonType[0]} (${mostCommonType[1]} occurrences)`,
                errorType: mostCommonType[0],
                count: mostCommonType[1],
                percentage: (mostCommonType[1] / errors.length * 100).toFixed(1)
            });
        }

        // Environment with most errors
        const envDistribution = this._getDistribution(errors, 'context.environment');
        const mostProblematicEnv = Object.entries(envDistribution)
            .sort(([,a], [,b]) => b - a)[0];
        
        if (mostProblematicEnv) {
            insights.push({
                type: 'problematic_environment',
                description: `Environment with most errors: ${mostProblematicEnv[0]} (${mostProblematicEnv[1]} errors)`,
                environment: mostProblematicEnv[0],
                count: mostProblematicEnv[1],
                percentage: (mostProblematicEnv[1] / errors.length * 100).toFixed(1)
            });
        }

        // Resolution rate insight
        const resolvedCount = errors.filter(e => e.metadata.resolved).length;
        const resolutionRate = resolvedCount / errors.length;
        
        if (resolutionRate < 0.8) {
            insights.push({
                type: 'low_resolution_rate',
                description: `Low error resolution rate: ${(resolutionRate * 100).toFixed(1)}%`,
                resolutionRate,
                resolvedCount,
                totalCount: errors.length
            });
        }

        return insights;
    }

    /**
     * Analyze correlations between error attributes
     * @param {Array} errors - Error records
     * @returns {Object} Correlation analysis
     * @private
     */
    _analyzeCorrelations(errors) {
        const correlations = {
            typeEnvironment: this._calculateCorrelation(errors, 'error.type', 'context.environment'),
            severityComponent: this._calculateCorrelation(errors, 'error.severity', 'context.component'),
            typeOperationType: this._calculateCorrelation(errors, 'error.type', 'context.operationType')
        };

        return correlations;
    }

    /**
     * Calculate correlation between two fields
     * @param {Array} errors - Error records
     * @param {string} field1 - First field path
     * @param {string} field2 - Second field path
     * @returns {Array} Correlation pairs
     * @private
     */
    _calculateCorrelation(errors, field1, field2) {
        const pairs = new Map();

        for (const error of errors) {
            const value1 = this._getNestedValue(error, field1);
            const value2 = this._getNestedValue(error, field2);
            const key = `${value1}:${value2}`;
            
            pairs.set(key, (pairs.get(key) || 0) + 1);
        }

        return Array.from(pairs.entries())
            .map(([pair, count]) => {
                const [value1, value2] = pair.split(':');
                return {
                    field1Value: value1,
                    field2Value: value2,
                    count,
                    percentage: (count / errors.length * 100).toFixed(1)
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10 correlations
    }

    /**
     * Analyze temporal patterns
     * @param {Array} errors - Error records
     * @param {string} timePeriod - Time period
     * @returns {Object} Temporal analysis
     * @private
     */
    _analyzeTemporalPatterns(errors, timePeriod) {
        const bucketSize = this._getBucketSize(timePeriod);
        const buckets = this._createTimeBuckets(errors, bucketSize);
        
        return {
            distribution: buckets.map((bucket, index) => ({
                timeSlot: index,
                count: bucket.length,
                timestamp: Date.now() - ((buckets.length - index) * bucketSize)
            })),
            peakHours: this._findPeakHours(buckets),
            quietHours: this._findQuietHours(buckets)
        };
    }

    /**
     * Generate predictions based on trends
     * @param {Array} currentErrors - Current period errors
     * @param {Array} previousErrors - Previous period errors
     * @param {string} timePeriod - Time period
     * @returns {Object} Predictions
     * @private
     */
    _generatePredictions(currentErrors, previousErrors, timePeriod) {
        const trend = this._calculateTrendChanges(currentErrors, previousErrors);
        const nextPeriodStart = Date.now();
        const nextPeriodEnd = nextPeriodStart + this._getTimeWindow(timePeriod).duration;

        return {
            nextPeriod: {
                start: nextPeriodStart,
                end: nextPeriodEnd
            },
            predictedErrorCount: Math.max(0, Math.round(currentErrors.length * (1 + trend.overall.change))),
            confidence: this._calculatePredictionConfidence(currentErrors, previousErrors),
            riskLevel: this._assessRiskLevel(trend),
            recommendations: this._generateRecommendations(trend, currentErrors)
        };
    }

    /**
     * Calculate prediction confidence
     * @param {Array} currentErrors - Current period errors
     * @param {Array} previousErrors - Previous period errors
     * @returns {number} Confidence score (0-1)
     * @private
     */
    _calculatePredictionConfidence(currentErrors, previousErrors) {
        // Simple confidence calculation based on data consistency
        const currentCount = currentErrors.length;
        const previousCount = previousErrors.length;
        
        if (currentCount === 0 && previousCount === 0) {
            return 0.5; // Neutral confidence with no data
        }

        const variance = Math.abs(currentCount - previousCount) / Math.max(currentCount, previousCount, 1);
        return Math.max(0.1, 1 - variance); // Higher variance = lower confidence
    }

    /**
     * Assess risk level based on trends
     * @param {Object} trend - Trend data
     * @returns {string} Risk level
     * @private
     */
    _assessRiskLevel(trend) {
        const changePercent = Math.abs(trend.overall.percentage);
        
        if (changePercent > 50) {
            return 'high';
        } else if (changePercent > 20) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Generate recommendations based on analysis
     * @param {Object} trend - Trend data
     * @param {Array} errors - Error records
     * @returns {Array} Recommendations
     * @private
     */
    _generateRecommendations(trend, errors) {
        const recommendations = [];

        if (trend.overall.change > 0.2) {
            recommendations.push({
                type: 'increasing_errors',
                priority: 'high',
                description: 'Error rate is increasing significantly. Consider investigating root causes.',
                action: 'investigate_trends'
            });
        }

        const criticalErrors = errors.filter(e => e.error.severity === 'critical');
        if (criticalErrors.length > 0) {
            recommendations.push({
                type: 'critical_errors',
                priority: 'critical',
                description: `${criticalErrors.length} critical errors detected. Immediate attention required.`,
                action: 'address_critical_errors'
            });
        }

        return recommendations;
    }

    /**
     * Start analysis timer
     * @private
     */
    _startAnalysisTimer() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
        }

        this.analysisTimer = setInterval(() => {
            this._performPeriodicAnalysis();
        }, this.config.analysisInterval);
    }

    /**
     * Perform periodic analysis
     * @private
     */
    _performPeriodicAnalysis() {
        try {
            // Analyze patterns for different time periods
            this.analyzePatterns(TimePeriod.HOUR);
            this.analyzePatterns(TimePeriod.DAY);
            
            // Analyze trends
            this.analyzeTrends(TimePeriod.HOUR);
            this.analyzeTrends(TimePeriod.DAY);

            log('debug', 'Periodic error analysis completed');
        } catch (error) {
            log('error', 'Periodic analysis failed', { error: error.message });
        }
    }

    /**
     * Get time window for period
     * @param {string} timePeriod - Time period
     * @returns {Object} Time window
     * @private
     */
    _getTimeWindow(timePeriod) {
        const now = Date.now();
        const durations = {
            [TimePeriod.HOUR]: 3600000,
            [TimePeriod.DAY]: 86400000,
            [TimePeriod.WEEK]: 604800000,
            [TimePeriod.MONTH]: 2592000000
        };

        const duration = durations[timePeriod] || durations[TimePeriod.DAY];
        
        return {
            start: now - duration,
            end: now,
            duration
        };
    }

    /**
     * Get errors within time window
     * @param {Object} timeWindow - Time window
     * @returns {Array} Filtered errors
     * @private
     */
    _getErrorsInWindow(timeWindow) {
        return this.errorData.filter(error => 
            error.timestamp >= timeWindow.start && error.timestamp <= timeWindow.end
        );
    }

    /**
     * Clean old data beyond retention period
     * @private
     */
    _cleanOldData() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        this.errorData = this.errorData.filter(error => error.timestamp > cutoff);
    }

    /**
     * Get distribution of values for a field
     * @param {Array} errors - Error records
     * @param {string} fieldPath - Field path
     * @returns {Object} Distribution
     * @private
     */
    _getDistribution(errors, fieldPath) {
        const distribution = {};
        
        for (const error of errors) {
            const value = this._getNestedValue(error, fieldPath);
            distribution[value] = (distribution[value] || 0) + 1;
        }
        
        return distribution;
    }

    /**
     * Get nested value from object
     * @param {Object} obj - Object
     * @param {string} path - Dot-separated path
     * @returns {any} Value
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Calculate average for a field
     * @param {Array} errors - Error records
     * @param {string} fieldPath - Field path
     * @returns {number} Average
     * @private
     */
    _calculateAverage(errors, fieldPath) {
        const values = errors.map(error => this._getNestedValue(error, fieldPath)).filter(v => v != null);
        return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    }

    /**
     * Generate unique record ID
     * @returns {string} Record ID
     * @private
     */
    _generateRecordId() {
        return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get latest analysis results
     * @param {string} timePeriod - Time period
     * @returns {Object} Analysis results
     */
    getLatestAnalysis(timePeriod = TimePeriod.DAY) {
        return {
            patterns: this.patterns.get(timePeriod),
            trends: this.trends.get(timePeriod),
            statistics: this.getStatistics(timePeriod)
        };
    }

    /**
     * Export analytics data
     * @returns {Object} Exported data
     */
    exportData() {
        return {
            errorData: this.errorData.slice(-1000), // Last 1000 errors
            patterns: Object.fromEntries(this.patterns),
            trends: Object.fromEntries(this.trends),
            config: this.config
        };
    }

    /**
     * Import analytics data
     * @param {Object} data - Data to import
     */
    importData(data) {
        if (data.errorData) {
            this.errorData = data.errorData;
        }
        
        if (data.patterns) {
            this.patterns = new Map(Object.entries(data.patterns));
        }
        
        if (data.trends) {
            this.trends = new Map(Object.entries(data.trends));
        }

        log('info', 'Analytics data imported', {
            errorCount: this.errorData.length,
            patternCount: this.patterns.size,
            trendCount: this.trends.size
        });
    }

    /**
     * Reset analytics state
     */
    reset() {
        this.errorData = [];
        this.patterns.clear();
        this.trends.clear();
        this.predictions.clear();
        
        log('info', 'Error analytics reset');
    }

    /**
     * Stop analytics
     */
    stop() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }
        
        log('info', 'Error analytics stopped');
    }
}

export default ErrorAnalytics;

