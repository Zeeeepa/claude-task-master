/**
 * @fileoverview Error Analytics and Reporting Dashboard
 * @description Comprehensive error analytics with trend analysis, reporting, and insights
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Error Analytics Engine for comprehensive error analysis and reporting
 */
export class ErrorAnalytics {
    constructor(config = {}) {
        this.config = {
            retentionPeriod: config.retentionPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
            aggregationIntervals: config.aggregationIntervals || ['1h', '1d', '1w'],
            enableRealTimeAnalytics: config.enableRealTimeAnalytics !== false,
            enableTrendAnalysis: config.enableTrendAnalysis !== false,
            enableAnomalyDetection: config.enableAnomalyDetection !== false,
            ...config
        };
        
        this.errorEvents = [];
        this.aggregatedData = new Map();
        this.trends = new Map();
        this.anomalies = [];
        this.dashboardData = new Map();
        
        this.metricsCalculator = new MetricsCalculator();
        this.trendAnalyzer = new TrendAnalyzer();
        this.anomalyDetector = new AnomalyDetector();
        
        // Start background processing
        if (this.config.enableRealTimeAnalytics) {
            this._startRealTimeProcessing();
        }
    }

    /**
     * Record an error event for analytics
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @param {Object} resolution - Resolution details (if any)
     */
    recordError(errorInfo, context = {}, resolution = null) {
        const event = {
            id: this._generateEventId(),
            timestamp: new Date(),
            errorInfo,
            context,
            resolution,
            metadata: {
                source: context.source || 'unknown',
                environment: context.environment || 'unknown',
                userId: context.userId || null,
                sessionId: context.sessionId || null
            }
        };

        this.errorEvents.push(event);
        
        // Real-time processing
        if (this.config.enableRealTimeAnalytics) {
            this._processEventRealTime(event);
        }
        
        // Cleanup old events
        this._cleanupOldEvents();
        
        log('debug', 'Error event recorded for analytics', {
            eventId: event.id,
            errorType: errorInfo.type,
            severity: errorInfo.severity
        });
    }

    /**
     * Generate comprehensive analytics report
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Analytics report
     */
    async generateReport(options = {}) {
        const timeRange = {
            start: options.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            end: options.endDate || new Date()
        };

        const filteredEvents = this._filterEventsByTimeRange(this.errorEvents, timeRange);
        
        log('info', 'Generating analytics report', {
            eventCount: filteredEvents.length,
            timeRange
        });

        const report = {
            metadata: {
                generatedAt: new Date(),
                timeRange,
                eventCount: filteredEvents.length,
                reportId: this._generateReportId()
            },
            summary: await this._generateSummary(filteredEvents),
            errorDistribution: await this._analyzeErrorDistribution(filteredEvents),
            trends: await this._analyzeTrends(filteredEvents, timeRange),
            performance: await this._analyzePerformance(filteredEvents),
            insights: await this._generateInsights(filteredEvents),
            recommendations: await this._generateRecommendations(filteredEvents),
            anomalies: await this._detectAnomalies(filteredEvents),
            dashboardData: await this._generateDashboardData(filteredEvents)
        };

        return report;
    }

    /**
     * Generate real-time dashboard data
     * @returns {Object} Dashboard data
     */
    getDashboardData() {
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recentEvents = this._filterEventsByTimeRange(this.errorEvents, {
            start: last24Hours,
            end: now
        });

        return {
            realTime: {
                totalErrors: recentEvents.length,
                errorRate: this._calculateErrorRate(recentEvents, 24 * 60), // errors per minute
                activeIncidents: this._getActiveIncidents(),
                systemHealth: this._calculateSystemHealth(recentEvents)
            },
            charts: {
                errorTimeline: this._generateTimelineData(recentEvents),
                errorDistribution: this._generateDistributionData(recentEvents),
                severityBreakdown: this._generateSeverityData(recentEvents),
                topErrors: this._getTopErrors(recentEvents, 10)
            },
            alerts: this._getActiveAlerts(),
            lastUpdated: now
        };
    }

    /**
     * Get error trends for specific time period
     * @param {string} period - Time period ('1h', '1d', '1w', '1m')
     * @returns {Object} Trend data
     */
    getTrends(period = '1d') {
        const timeRange = this._getTimeRangeForPeriod(period);
        const events = this._filterEventsByTimeRange(this.errorEvents, timeRange);
        
        return this.trendAnalyzer.analyzeTrends(events, period);
    }

    /**
     * Get error insights and patterns
     * @param {Object} filters - Analysis filters
     * @returns {Object} Insights
     */
    getInsights(filters = {}) {
        const filteredEvents = this._applyFilters(this.errorEvents, filters);
        
        return {
            patterns: this._identifyPatterns(filteredEvents),
            correlations: this._findCorrelations(filteredEvents),
            predictions: this._generatePredictions(filteredEvents),
            recommendations: this._generateActionableRecommendations(filteredEvents)
        };
    }

    /**
     * Generate summary statistics
     * @param {Array} events - Error events
     * @returns {Object} Summary
     * @private
     */
    async _generateSummary(events) {
        const totalErrors = events.length;
        const uniqueErrorTypes = new Set(events.map(e => e.errorInfo.type)).size;
        const resolvedErrors = events.filter(e => e.resolution && e.resolution.success).length;
        const criticalErrors = events.filter(e => e.errorInfo.severity === 'CRITICAL').length;
        
        return {
            totalErrors,
            uniqueErrorTypes,
            resolvedErrors,
            criticalErrors,
            resolutionRate: totalErrors > 0 ? resolvedErrors / totalErrors : 0,
            criticalErrorRate: totalErrors > 0 ? criticalErrors / totalErrors : 0,
            averageResolutionTime: this._calculateAverageResolutionTime(events),
            errorFrequency: this._calculateErrorFrequency(events)
        };
    }

    /**
     * Analyze error distribution
     * @param {Array} events - Error events
     * @returns {Object} Distribution analysis
     * @private
     */
    async _analyzeErrorDistribution(events) {
        const byType = this._groupBy(events, e => e.errorInfo.type);
        const byCategory = this._groupBy(events, e => e.errorInfo.category);
        const bySeverity = this._groupBy(events, e => e.errorInfo.severity);
        const bySource = this._groupBy(events, e => e.metadata.source);
        const byEnvironment = this._groupBy(events, e => e.metadata.environment);
        
        return {
            byType: this._convertGroupsToStats(byType),
            byCategory: this._convertGroupsToStats(byCategory),
            bySeverity: this._convertGroupsToStats(bySeverity),
            bySource: this._convertGroupsToStats(bySource),
            byEnvironment: this._convertGroupsToStats(byEnvironment)
        };
    }

    /**
     * Analyze trends over time
     * @param {Array} events - Error events
     * @param {Object} timeRange - Time range
     * @returns {Object} Trend analysis
     * @private
     */
    async _analyzeTrends(events, timeRange) {
        const hourlyTrends = this.trendAnalyzer.analyzeHourlyTrends(events, timeRange);
        const dailyTrends = this.trendAnalyzer.analyzeDailyTrends(events, timeRange);
        const weeklyTrends = this.trendAnalyzer.analyzeWeeklyTrends(events, timeRange);
        
        return {
            hourly: hourlyTrends,
            daily: dailyTrends,
            weekly: weeklyTrends,
            growth: this.trendAnalyzer.calculateGrowthRates(events, timeRange),
            seasonality: this.trendAnalyzer.detectSeasonality(events, timeRange)
        };
    }

    /**
     * Analyze performance metrics
     * @param {Array} events - Error events
     * @returns {Object} Performance analysis
     * @private
     */
    async _analyzePerformance(events) {
        const resolvedEvents = events.filter(e => e.resolution);
        
        return {
            resolutionTimes: this.metricsCalculator.calculateResolutionTimeMetrics(resolvedEvents),
            errorRates: this.metricsCalculator.calculateErrorRates(events),
            availability: this.metricsCalculator.calculateAvailabilityMetrics(events),
            reliability: this.metricsCalculator.calculateReliabilityMetrics(events),
            mttr: this.metricsCalculator.calculateMTTR(resolvedEvents),
            mtbf: this.metricsCalculator.calculateMTBF(events)
        };
    }

    /**
     * Generate insights from error data
     * @param {Array} events - Error events
     * @returns {Object} Insights
     * @private
     */
    async _generateInsights(events) {
        return {
            topErrorTypes: this._getTopErrorTypes(events, 5),
            errorHotspots: this._identifyErrorHotspots(events),
            timePatterns: this._analyzeTimePatterns(events),
            userImpact: this._analyzeUserImpact(events),
            systemImpact: this._analyzeSystemImpact(events),
            correlations: this._findErrorCorrelations(events)
        };
    }

    /**
     * Generate recommendations
     * @param {Array} events - Error events
     * @returns {Array} Recommendations
     * @private
     */
    async _generateRecommendations(events) {
        const recommendations = [];
        
        // High error rate recommendation
        const errorRate = this._calculateErrorRate(events, 60); // per minute
        if (errorRate > 10) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                title: 'High Error Rate Detected',
                description: `Current error rate of ${errorRate.toFixed(2)} errors/minute is above threshold`,
                action: 'Investigate root causes and implement error reduction strategies'
            });
        }
        
        // Unresolved critical errors
        const unresolvedCritical = events.filter(e => 
            e.errorInfo.severity === 'CRITICAL' && (!e.resolution || !e.resolution.success)
        );
        if (unresolvedCritical.length > 0) {
            recommendations.push({
                type: 'reliability',
                priority: 'critical',
                title: 'Unresolved Critical Errors',
                description: `${unresolvedCritical.length} critical errors remain unresolved`,
                action: 'Prioritize resolution of critical errors immediately'
            });
        }
        
        // Recurring error patterns
        const recurringErrors = this._findRecurringErrors(events);
        if (recurringErrors.length > 0) {
            recommendations.push({
                type: 'maintenance',
                priority: 'medium',
                title: 'Recurring Error Patterns',
                description: `${recurringErrors.length} error types are recurring frequently`,
                action: 'Implement permanent fixes for recurring error patterns'
            });
        }
        
        return recommendations;
    }

    /**
     * Detect anomalies in error patterns
     * @param {Array} events - Error events
     * @returns {Array} Detected anomalies
     * @private
     */
    async _detectAnomalies(events) {
        if (!this.config.enableAnomalyDetection) {
            return [];
        }
        
        return this.anomalyDetector.detectAnomalies(events);
    }

    /**
     * Generate dashboard data
     * @param {Array} events - Error events
     * @returns {Object} Dashboard data
     * @private
     */
    async _generateDashboardData(events) {
        return {
            widgets: {
                errorCount: {
                    value: events.length,
                    trend: this._calculateTrend(events, 'count'),
                    sparkline: this._generateSparkline(events, 'count')
                },
                errorRate: {
                    value: this._calculateErrorRate(events, 60),
                    trend: this._calculateTrend(events, 'rate'),
                    sparkline: this._generateSparkline(events, 'rate')
                },
                resolutionRate: {
                    value: this._calculateResolutionRate(events),
                    trend: this._calculateTrend(events, 'resolution'),
                    sparkline: this._generateSparkline(events, 'resolution')
                },
                mttr: {
                    value: this.metricsCalculator.calculateMTTR(events.filter(e => e.resolution)),
                    trend: this._calculateTrend(events, 'mttr'),
                    sparkline: this._generateSparkline(events, 'mttr')
                }
            },
            charts: {
                errorTimeline: this._generateTimelineChart(events),
                errorDistribution: this._generateDistributionChart(events),
                severityBreakdown: this._generateSeverityChart(events),
                topErrors: this._generateTopErrorsChart(events)
            }
        };
    }

    /**
     * Process event in real-time
     * @param {Object} event - Error event
     * @private
     */
    _processEventRealTime(event) {
        // Update real-time metrics
        this._updateRealTimeMetrics(event);
        
        // Check for anomalies
        if (this.config.enableAnomalyDetection) {
            const anomaly = this.anomalyDetector.checkRealTimeAnomaly(event, this.errorEvents);
            if (anomaly) {
                this.anomalies.push(anomaly);
                this._triggerAnomalyAlert(anomaly);
            }
        }
        
        // Update dashboard data
        this._updateDashboardData(event);
    }

    /**
     * Start real-time processing
     * @private
     */
    _startRealTimeProcessing() {
        // Process aggregations every minute
        setInterval(() => {
            this._processAggregations();
        }, 60000);
        
        // Update trends every 5 minutes
        setInterval(() => {
            this._updateTrends();
        }, 300000);
        
        // Cleanup old data every hour
        setInterval(() => {
            this._cleanupOldData();
        }, 3600000);
    }

    /**
     * Process aggregations
     * @private
     */
    _processAggregations() {
        const now = new Date();
        const intervals = this.config.aggregationIntervals;
        
        for (const interval of intervals) {
            const timeRange = this._getTimeRangeForInterval(interval, now);
            const events = this._filterEventsByTimeRange(this.errorEvents, timeRange);
            
            const aggregation = {
                interval,
                timeRange,
                timestamp: now,
                metrics: this.metricsCalculator.calculateAggregatedMetrics(events)
            };
            
            const key = `${interval}_${now.getTime()}`;
            this.aggregatedData.set(key, aggregation);
        }
    }

    /**
     * Update trends
     * @private
     */
    _updateTrends() {
        if (!this.config.enableTrendAnalysis) return;
        
        const periods = ['1h', '1d', '1w'];
        
        for (const period of periods) {
            const timeRange = this._getTimeRangeForPeriod(period);
            const events = this._filterEventsByTimeRange(this.errorEvents, timeRange);
            const trend = this.trendAnalyzer.analyzeTrends(events, period);
            
            this.trends.set(period, trend);
        }
    }

    /**
     * Cleanup old events
     * @private
     */
    _cleanupOldEvents() {
        const cutoff = new Date(Date.now() - this.config.retentionPeriod);
        this.errorEvents = this.errorEvents.filter(event => event.timestamp > cutoff);
    }

    /**
     * Cleanup old data
     * @private
     */
    _cleanupOldData() {
        const cutoff = new Date(Date.now() - this.config.retentionPeriod);
        
        // Cleanup aggregated data
        for (const [key, aggregation] of this.aggregatedData.entries()) {
            if (aggregation.timestamp < cutoff) {
                this.aggregatedData.delete(key);
            }
        }
        
        // Cleanup anomalies
        this.anomalies = this.anomalies.filter(anomaly => anomaly.timestamp > cutoff);
    }

    /**
     * Filter events by time range
     * @param {Array} events - Events to filter
     * @param {Object} timeRange - Time range
     * @returns {Array} Filtered events
     * @private
     */
    _filterEventsByTimeRange(events, timeRange) {
        return events.filter(event => 
            event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
        );
    }

    /**
     * Apply filters to events
     * @param {Array} events - Events to filter
     * @param {Object} filters - Filters to apply
     * @returns {Array} Filtered events
     * @private
     */
    _applyFilters(events, filters) {
        let filtered = events;
        
        if (filters.errorType) {
            filtered = filtered.filter(e => e.errorInfo.type === filters.errorType);
        }
        
        if (filters.severity) {
            filtered = filtered.filter(e => e.errorInfo.severity === filters.severity);
        }
        
        if (filters.source) {
            filtered = filtered.filter(e => e.metadata.source === filters.source);
        }
        
        if (filters.environment) {
            filtered = filtered.filter(e => e.metadata.environment === filters.environment);
        }
        
        return filtered;
    }

    /**
     * Group events by a key function
     * @param {Array} events - Events to group
     * @param {Function} keyFn - Key function
     * @returns {Map} Grouped events
     * @private
     */
    _groupBy(events, keyFn) {
        const groups = new Map();
        
        for (const event of events) {
            const key = keyFn(event);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(event);
        }
        
        return groups;
    }

    /**
     * Convert groups to statistics
     * @param {Map} groups - Grouped data
     * @returns {Object} Statistics
     * @private
     */
    _convertGroupsToStats(groups) {
        const stats = {};
        
        for (const [key, events] of groups.entries()) {
            stats[key] = {
                count: events.length,
                percentage: 0, // Will be calculated later
                resolved: events.filter(e => e.resolution && e.resolution.success).length,
                critical: events.filter(e => e.errorInfo.severity === 'CRITICAL').length
            };
        }
        
        // Calculate percentages
        const total = Object.values(stats).reduce((sum, stat) => sum + stat.count, 0);
        for (const stat of Object.values(stats)) {
            stat.percentage = total > 0 ? (stat.count / total) * 100 : 0;
        }
        
        return stats;
    }

    /**
     * Calculate error rate
     * @param {Array} events - Error events
     * @param {number} timeWindowMinutes - Time window in minutes
     * @returns {number} Error rate
     * @private
     */
    _calculateErrorRate(events, timeWindowMinutes) {
        if (events.length === 0) return 0;
        
        const timeWindowMs = timeWindowMinutes * 60 * 1000;
        const now = new Date();
        const windowStart = new Date(now.getTime() - timeWindowMs);
        
        const recentEvents = events.filter(e => e.timestamp >= windowStart);
        return recentEvents.length / timeWindowMinutes;
    }

    /**
     * Calculate resolution rate
     * @param {Array} events - Error events
     * @returns {number} Resolution rate
     * @private
     */
    _calculateResolutionRate(events) {
        if (events.length === 0) return 0;
        
        const resolvedEvents = events.filter(e => e.resolution && e.resolution.success);
        return resolvedEvents.length / events.length;
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     * @private
     */
    _generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique report ID
     * @returns {string} Report ID
     * @private
     */
    _generateReportId() {
        return `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get time range for period
     * @param {string} period - Period string
     * @returns {Object} Time range
     * @private
     */
    _getTimeRangeForPeriod(period) {
        const now = new Date();
        const periodMs = {
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1m': 30 * 24 * 60 * 60 * 1000
        };
        
        const duration = periodMs[period] || periodMs['1d'];
        
        return {
            start: new Date(now.getTime() - duration),
            end: now
        };
    }

    /**
     * Get analytics statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            totalEvents: this.errorEvents.length,
            aggregatedDataPoints: this.aggregatedData.size,
            trendsTracked: this.trends.size,
            anomaliesDetected: this.anomalies.length,
            retentionPeriod: this.config.retentionPeriod,
            realTimeEnabled: this.config.enableRealTimeAnalytics
        };
    }

    /**
     * Export analytics data
     * @returns {Object} Exported data
     */
    exportData() {
        return {
            events: this.errorEvents,
            aggregatedData: Array.from(this.aggregatedData.entries()),
            trends: Array.from(this.trends.entries()),
            anomalies: this.anomalies,
            exportDate: new Date()
        };
    }

    /**
     * Import analytics data
     * @param {Object} data - Imported data
     */
    importData(data) {
        if (data.events) {
            this.errorEvents = data.events;
        }
        
        if (data.aggregatedData) {
            this.aggregatedData = new Map(data.aggregatedData);
        }
        
        if (data.trends) {
            this.trends = new Map(data.trends);
        }
        
        if (data.anomalies) {
            this.anomalies = data.anomalies;
        }
        
        log('info', `Imported analytics data: ${this.errorEvents.length} events, ${this.aggregatedData.size} aggregations`);
    }
}

/**
 * Metrics Calculator utility
 */
class MetricsCalculator {
    calculateResolutionTimeMetrics(resolvedEvents) {
        if (resolvedEvents.length === 0) return null;
        
        const resolutionTimes = resolvedEvents
            .filter(e => e.resolution && e.resolution.timestamp)
            .map(e => e.resolution.timestamp.getTime() - e.timestamp.getTime());
        
        resolutionTimes.sort((a, b) => a - b);
        
        return {
            mean: resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length,
            median: resolutionTimes[Math.floor(resolutionTimes.length / 2)],
            p95: resolutionTimes[Math.floor(resolutionTimes.length * 0.95)],
            p99: resolutionTimes[Math.floor(resolutionTimes.length * 0.99)],
            min: resolutionTimes[0],
            max: resolutionTimes[resolutionTimes.length - 1]
        };
    }
    
    calculateMTTR(resolvedEvents) {
        const metrics = this.calculateResolutionTimeMetrics(resolvedEvents);
        return metrics ? metrics.mean : 0;
    }
    
    calculateMTBF(events) {
        if (events.length <= 1) return 0;
        
        const sortedEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const intervals = [];
        
        for (let i = 1; i < sortedEvents.length; i++) {
            intervals.push(sortedEvents[i].timestamp.getTime() - sortedEvents[i-1].timestamp.getTime());
        }
        
        return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }
    
    calculateErrorRates(events) {
        // Implementation for various error rate calculations
        return {
            perMinute: this._calculateRate(events, 60 * 1000),
            perHour: this._calculateRate(events, 60 * 60 * 1000),
            perDay: this._calculateRate(events, 24 * 60 * 60 * 1000)
        };
    }
    
    _calculateRate(events, windowMs) {
        if (events.length === 0) return 0;
        
        const now = Date.now();
        const recentEvents = events.filter(e => now - e.timestamp.getTime() <= windowMs);
        return recentEvents.length / (windowMs / (60 * 1000)); // per minute
    }
}

/**
 * Trend Analyzer utility
 */
class TrendAnalyzer {
    analyzeTrends(events, period) {
        // Implementation for trend analysis
        return {
            direction: 'stable', // 'increasing', 'decreasing', 'stable'
            magnitude: 0,
            confidence: 0.5,
            dataPoints: this._generateTrendDataPoints(events, period)
        };
    }
    
    _generateTrendDataPoints(events, period) {
        // Generate data points for trend visualization
        return [];
    }
}

/**
 * Anomaly Detector utility
 */
class AnomalyDetector {
    detectAnomalies(events) {
        // Implementation for anomaly detection
        return [];
    }
    
    checkRealTimeAnomaly(event, historicalEvents) {
        // Implementation for real-time anomaly detection
        return null;
    }
}

export default ErrorAnalytics;

