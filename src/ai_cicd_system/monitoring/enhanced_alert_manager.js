/**
 * @fileoverview Enhanced Alert Manager
 * @description Extends the existing AlertManager from PR #24 with AI CI/CD specific monitoring capabilities
 */

import { log } from '../../scripts/modules/utils.js';

// Define AlertSeverity constants
const AlertSeverity = {
    INFO: 'info',
    WARNING: 'warning', 
    CRITICAL: 'critical'
};

// Base AlertManager class (fallback implementation)
class BaseAlertManager {
    constructor(config) {
        this.config = config;
        this.activeAlerts = new Map();
        this.alertRules = new Map();
        this.alertHistory = [];
    }
    
    async initialize() {
        log('debug', 'Base AlertManager initialized');
    }
    
    async sendAlert(alert) {
        const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        alert.id = alertId;
        alert.timestamp = Date.now();
        alert.status = 'active';
        
        this.activeAlerts.set(alertId, alert);
        this.alertHistory.push({ ...alert });
        
        log('warning', `Alert: ${alert.message} (${alert.severity})`);
        return alertId;
    }
    
    async resolveAlert(alertId, reason) {
        const alert = this.activeAlerts.get(alertId);
        if (alert) {
            alert.status = 'resolved';
            alert.resolvedAt = Date.now();
            alert.resolutionReason = reason;
            this.activeAlerts.delete(alertId);
        }
    }
    
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    
    async getStatistics() {
        return {
            active_alerts: this.activeAlerts.size,
            total_alerts_fired: this.alertHistory.length
        };
    }
    
    async getHealth() {
        return { 
            status: 'healthy',
            active_alerts: this.activeAlerts.size
        };
    }
    
    async shutdown() {
        this.activeAlerts.clear();
        this.alertHistory.length = 0;
    }
}

// Use BaseAlertManager as the parent class
// In a real implementation, this would extend the AlertManager from PR #24
const AlertManager = BaseAlertManager;

/**
 * Enhanced Alert Manager with AI-specific monitoring capabilities
 * Extends the base AlertManager with intelligent alerting for AI CI/CD workflows
 */
export class EnhancedAlertManager extends AlertManager {
    constructor(config = {}) {
        super(config);
        
        this.aiConfig = {
            // AI-specific alert configuration
            codegenQualityThreshold: config.codegenQualityThreshold || 0.7,
            validationSuccessThreshold: config.validationSuccessThreshold || 0.8,
            workflowTimeoutThreshold: config.workflowTimeoutThreshold || 300000, // 5 minutes
            errorRateWindow: config.errorRateWindow || 300000, // 5 minutes
            performanceDegradationThreshold: config.performanceDegradationThreshold || 0.2,
            alertAggregationWindow: config.alertAggregationWindow || 60000, // 1 minute
            intelligentThrottling: config.intelligentThrottling !== false,
            predictiveAlerting: config.predictiveAlerting !== false,
            ...config.aiConfig
        };
        
        // AI-specific alert tracking
        this.aiMetrics = new Map();
        this.alertAggregator = new AlertAggregator(this.aiConfig);
        this.trendAnalyzer = new TrendAnalyzer(this.aiConfig);
        this.qualityTracker = new QualityTracker(this.aiConfig);
        
        // Performance impact tracking
        this.metricsCollectionTime = new Map();
        this.alertProcessingTime = new Map();
    }

    /**
     * Initialize enhanced alert manager with AI-specific rules
     */
    async initialize() {
        await super.initialize();
        
        log('debug', 'Initializing enhanced alert manager with AI-specific capabilities...');
        
        this._setupAIAlertRules();
        this._setupAINotificationChannels();
        this._setupPredictiveAlerting();
        
        // Start background processes
        this._startAlertAggregation();
        this._startTrendAnalysis();
        
        log('info', 'Enhanced alert manager initialized with AI monitoring capabilities');
    }

    /**
     * Process AI-specific metrics and generate intelligent alerts
     * @param {Object} metrics - AI metrics data
     */
    async processAIMetrics(metrics) {
        const startTime = Date.now();
        
        try {
            // Store metrics for trend analysis
            this._storeAIMetrics(metrics);
            
            // Check for immediate alerts
            await this._checkCodegenQuality(metrics);
            await this._checkValidationPerformance(metrics);
            await this._checkWorkflowHealth(metrics);
            await this._checkSystemPerformance(metrics);
            
            // Perform trend analysis for predictive alerting
            if (this.aiConfig.predictiveAlerting) {
                await this._performPredictiveAnalysis(metrics);
            }
            
            // Aggregate related alerts to reduce noise
            if (this.aiConfig.intelligentThrottling) {
                await this.alertAggregator.processAlerts(this.getActiveAlerts());
            }
            
        } catch (error) {
            log('error', `Error processing AI metrics: ${error.message}`);
        } finally {
            // Track processing time for performance monitoring
            const processingTime = Date.now() - startTime;
            this.alertProcessingTime.set('ai_metrics_processing', processingTime);
            
            if (processingTime > 1000) { // Alert if processing takes > 1 second
                await this.sendAlert({
                    type: 'monitoring_performance_degradation',
                    severity: AlertSeverity.WARNING,
                    message: `AI metrics processing took ${processingTime}ms`,
                    value: processingTime,
                    threshold: 1000,
                    labels: { component: 'enhanced_alert_manager' }
                });
            }
        }
    }

    /**
     * Get AI-specific alert statistics
     * @returns {Object} AI alert statistics
     */
    async getAIStatistics() {
        const baseStats = await super.getStatistics();
        
        const aiAlerts = this.getActiveAlerts().filter(alert => 
            alert.type.startsWith('ai_') || alert.type.startsWith('codegen_') || 
            alert.type.startsWith('validation_') || alert.type.startsWith('workflow_')
        );
        
        return {
            ...baseStats,
            ai_specific: {
                active_ai_alerts: aiAlerts.length,
                codegen_quality_score: this.qualityTracker.getCurrentQualityScore(),
                validation_success_rate: this.qualityTracker.getValidationSuccessRate(),
                workflow_completion_rate: this.qualityTracker.getWorkflowCompletionRate(),
                performance_trends: await this.trendAnalyzer.getCurrentTrends(),
                alert_aggregation_stats: this.alertAggregator.getStatistics(),
                processing_performance: {
                    avg_processing_time: this._getAverageProcessingTime(),
                    metrics_collection_efficiency: this._getMetricsCollectionEfficiency()
                }
            }
        };
    }

    /**
     * Get health status including AI-specific health indicators
     * @returns {Object} Enhanced health status
     */
    async getHealth() {
        const baseHealth = await super.getHealth();
        
        const aiHealth = {
            codegen_quality: this.qualityTracker.getCurrentQualityScore() > this.aiConfig.codegenQualityThreshold ? 'healthy' : 'degraded',
            validation_performance: this.qualityTracker.getValidationSuccessRate() > this.aiConfig.validationSuccessThreshold ? 'healthy' : 'degraded',
            workflow_efficiency: this.qualityTracker.getWorkflowCompletionRate() > 0.9 ? 'healthy' : 'degraded',
            monitoring_performance: this._getAverageProcessingTime() < 500 ? 'healthy' : 'degraded'
        };
        
        const overallAIHealth = Object.values(aiHealth).every(status => status === 'healthy') ? 'healthy' : 'degraded';
        
        return {
            ...baseHealth,
            ai_monitoring: {
                status: overallAIHealth,
                components: aiHealth,
                trend_analysis_active: this.trendAnalyzer.isActive(),
                alert_aggregation_active: this.alertAggregator.isActive(),
                predictive_alerting_enabled: this.aiConfig.predictiveAlerting
            }
        };
    }

    // Private methods for AI-specific functionality

    /**
     * Setup AI-specific alert rules
     * @private
     */
    _setupAIAlertRules() {
        // Codegen quality alerts
        this.addAlertRule('ai_codegen_quality_degradation', {
            type: 'ai_metric',
            condition: 'codegen_quality_score < threshold',
            threshold: this.aiConfig.codegenQualityThreshold,
            operator: 'less_than',
            severity: AlertSeverity.WARNING,
            message: 'Code generation quality has degraded',
            cooldown: 300000, // 5 minutes
            notificationChannels: ['console', 'ai_quality_channel']
        });

        this.addAlertRule('ai_codegen_critical_failure', {
            type: 'ai_metric',
            condition: 'codegen_quality_score < threshold',
            threshold: this.aiConfig.codegenQualityThreshold - 0.2,
            operator: 'less_than',
            severity: AlertSeverity.CRITICAL,
            message: 'Critical code generation quality failure',
            cooldown: 60000, // 1 minute
            notificationChannels: ['console', 'ai_quality_channel', 'escalation_channel']
        });

        // Validation performance alerts
        this.addAlertRule('ai_validation_performance_degradation', {
            type: 'ai_metric',
            condition: 'validation_success_rate < threshold',
            threshold: this.aiConfig.validationSuccessThreshold,
            operator: 'less_than',
            severity: AlertSeverity.WARNING,
            message: 'Validation success rate has degraded',
            cooldown: 300000
        });

        // Workflow timeout alerts
        this.addAlertRule('ai_workflow_timeout', {
            type: 'ai_event',
            condition: 'workflow_duration > threshold',
            threshold: this.aiConfig.workflowTimeoutThreshold,
            operator: 'greater_than',
            severity: AlertSeverity.WARNING,
            message: 'AI workflow execution timeout detected',
            cooldown: 180000 // 3 minutes
        });

        // Performance degradation alerts
        this.addAlertRule('ai_performance_degradation', {
            type: 'ai_trend',
            condition: 'performance_trend_degradation > threshold',
            threshold: this.aiConfig.performanceDegradationThreshold,
            operator: 'greater_than',
            severity: AlertSeverity.WARNING,
            message: 'AI system performance degradation detected',
            cooldown: 600000 // 10 minutes
        });

        // Database performance for AI operations
        this.addAlertRule('ai_database_performance', {
            type: 'ai_metric',
            condition: 'ai_db_query_time > threshold',
            threshold: 2000, // 2 seconds
            operator: 'greater_than',
            severity: AlertSeverity.WARNING,
            message: 'AI database operations are slow',
            cooldown: 300000
        });

        // Agent operation alerts
        this.addAlertRule('ai_agent_failure_rate', {
            type: 'ai_metric',
            condition: 'agent_failure_rate > threshold',
            threshold: 0.1, // 10%
            operator: 'greater_than',
            severity: AlertSeverity.CRITICAL,
            message: 'High AI agent failure rate detected',
            cooldown: 180000
        });

        // Webhook processing alerts
        this.addAlertRule('ai_webhook_processing_delay', {
            type: 'ai_metric',
            condition: 'webhook_processing_time > threshold',
            threshold: 5000, // 5 seconds
            operator: 'greater_than',
            severity: AlertSeverity.WARNING,
            message: 'AI webhook processing delays detected',
            cooldown: 300000
        });
    }

    /**
     * Setup AI-specific notification channels
     * @private
     */
    _setupAINotificationChannels() {
        // AI Quality monitoring channel
        this.addNotificationChannel('ai_quality_channel', {
            send: async (alert) => {
                const emoji = this._getAIAlertEmoji(alert);
                log('warning', `${emoji} AI QUALITY ALERT: ${alert.message} (Score: ${alert.value})`);
                
                // Could integrate with external monitoring systems here
                // await this._sendToGrafana(alert);
                // await this._sendToPrometheus(alert);
            }
        });

        // Performance monitoring channel
        this.addNotificationChannel('ai_performance_channel', {
            send: async (alert) => {
                log('warning', `⚡ AI PERFORMANCE: ${alert.message} (${alert.value}ms)`);
            }
        });

        // Escalation channel for critical AI issues
        this.addNotificationChannel('escalation_channel', {
            send: async (alert) => {
                log('error', `🚨 CRITICAL AI ISSUE: ${alert.message} - IMMEDIATE ATTENTION REQUIRED`);
                // Could trigger PagerDuty, send emails, etc.
            }
        });
    }

    /**
     * Setup predictive alerting based on trend analysis
     * @private
     */
    _setupPredictiveAlerting() {
        if (!this.aiConfig.predictiveAlerting) {
            return;
        }

        // Predictive quality degradation
        this.addAlertRule('ai_predictive_quality_degradation', {
            type: 'ai_prediction',
            condition: 'predicted_quality_degradation > threshold',
            threshold: 0.15, // 15% predicted degradation
            operator: 'greater_than',
            severity: AlertSeverity.INFO,
            message: 'Predictive analysis indicates potential quality degradation',
            cooldown: 1800000 // 30 minutes
        });

        // Predictive performance issues
        this.addAlertRule('ai_predictive_performance_issue', {
            type: 'ai_prediction',
            condition: 'predicted_performance_degradation > threshold',
            threshold: 0.2, // 20% predicted degradation
            operator: 'greater_than',
            severity: AlertSeverity.INFO,
            message: 'Predictive analysis indicates potential performance issues',
            cooldown: 1800000
        });
    }

    /**
     * Store AI metrics for trend analysis
     * @param {Object} metrics - AI metrics
     * @private
     */
    _storeAIMetrics(metrics) {
        const timestamp = Date.now();
        
        // Store with timestamp for trend analysis
        for (const [key, value] of Object.entries(metrics)) {
            if (!this.aiMetrics.has(key)) {
                this.aiMetrics.set(key, []);
            }
            
            const metricHistory = this.aiMetrics.get(key);
            metricHistory.push({ timestamp, value });
            
            // Keep only recent data (last 24 hours)
            const cutoff = timestamp - 86400000; // 24 hours
            while (metricHistory.length > 0 && metricHistory[0].timestamp < cutoff) {
                metricHistory.shift();
            }
        }
    }

    /**
     * Check code generation quality metrics
     * @param {Object} metrics - Metrics data
     * @private
     */
    async _checkCodegenQuality(metrics) {
        if (metrics.codegen_quality_score !== undefined) {
            this.qualityTracker.updateCodegenQuality(metrics.codegen_quality_score);
            
            if (metrics.codegen_quality_score < this.aiConfig.codegenQualityThreshold) {
                await this.sendAlert({
                    type: 'ai_codegen_quality_degradation',
                    severity: metrics.codegen_quality_score < (this.aiConfig.codegenQualityThreshold - 0.2) 
                        ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
                    message: `Code generation quality degraded to ${metrics.codegen_quality_score}`,
                    value: metrics.codegen_quality_score,
                    threshold: this.aiConfig.codegenQualityThreshold,
                    labels: { component: 'codegen', metric: 'quality_score' }
                });
            }
        }
    }

    /**
     * Check validation performance metrics
     * @param {Object} metrics - Metrics data
     * @private
     */
    async _checkValidationPerformance(metrics) {
        if (metrics.validation_success_rate !== undefined) {
            this.qualityTracker.updateValidationSuccessRate(metrics.validation_success_rate);
            
            if (metrics.validation_success_rate < this.aiConfig.validationSuccessThreshold) {
                await this.sendAlert({
                    type: 'ai_validation_performance_degradation',
                    severity: AlertSeverity.WARNING,
                    message: `Validation success rate degraded to ${metrics.validation_success_rate}`,
                    value: metrics.validation_success_rate,
                    threshold: this.aiConfig.validationSuccessThreshold,
                    labels: { component: 'validation', metric: 'success_rate' }
                });
            }
        }
    }

    /**
     * Check workflow health metrics
     * @param {Object} metrics - Metrics data
     * @private
     */
    async _checkWorkflowHealth(metrics) {
        if (metrics.workflow_duration !== undefined && 
            metrics.workflow_duration > this.aiConfig.workflowTimeoutThreshold) {
            
            await this.sendAlert({
                type: 'ai_workflow_timeout',
                severity: AlertSeverity.WARNING,
                message: `Workflow execution timeout: ${metrics.workflow_duration}ms`,
                value: metrics.workflow_duration,
                threshold: this.aiConfig.workflowTimeoutThreshold,
                labels: { component: 'workflow', metric: 'duration' }
            });
        }
        
        if (metrics.workflow_completion_rate !== undefined) {
            this.qualityTracker.updateWorkflowCompletionRate(metrics.workflow_completion_rate);
        }
    }

    /**
     * Check system performance metrics
     * @param {Object} metrics - Metrics data
     * @private
     */
    async _checkSystemPerformance(metrics) {
        // Database performance for AI operations
        if (metrics.ai_db_query_time !== undefined && metrics.ai_db_query_time > 2000) {
            await this.sendAlert({
                type: 'ai_database_performance',
                severity: AlertSeverity.WARNING,
                message: `AI database operations slow: ${metrics.ai_db_query_time}ms`,
                value: metrics.ai_db_query_time,
                threshold: 2000,
                labels: { component: 'database', metric: 'query_time' }
            });
        }

        // Agent failure rate
        if (metrics.agent_failure_rate !== undefined && metrics.agent_failure_rate > 0.1) {
            await this.sendAlert({
                type: 'ai_agent_failure_rate',
                severity: AlertSeverity.CRITICAL,
                message: `High agent failure rate: ${(metrics.agent_failure_rate * 100).toFixed(1)}%`,
                value: metrics.agent_failure_rate,
                threshold: 0.1,
                labels: { component: 'agents', metric: 'failure_rate' }
            });
        }

        // Webhook processing performance
        if (metrics.webhook_processing_time !== undefined && metrics.webhook_processing_time > 5000) {
            await this.sendAlert({
                type: 'ai_webhook_processing_delay',
                severity: AlertSeverity.WARNING,
                message: `Webhook processing delay: ${metrics.webhook_processing_time}ms`,
                value: metrics.webhook_processing_time,
                threshold: 5000,
                labels: { component: 'webhooks', metric: 'processing_time' }
            });
        }
    }

    /**
     * Perform predictive analysis on metrics trends
     * @param {Object} metrics - Current metrics
     * @private
     */
    async _performPredictiveAnalysis(metrics) {
        const predictions = await this.trendAnalyzer.analyzeTrends(this.aiMetrics);
        
        for (const [metric, prediction] of Object.entries(predictions)) {
            if (prediction.degradationRisk > 0.15) {
                await this.sendAlert({
                    type: 'ai_predictive_quality_degradation',
                    severity: AlertSeverity.INFO,
                    message: `Predictive analysis: ${metric} may degrade by ${(prediction.degradationRisk * 100).toFixed(1)}%`,
                    value: prediction.degradationRisk,
                    threshold: 0.15,
                    labels: { component: 'predictive_analysis', metric: metric }
                });
            }
        }
    }

    /**
     * Start alert aggregation background process
     * @private
     */
    _startAlertAggregation() {
        if (!this.aiConfig.intelligentThrottling) {
            return;
        }

        setInterval(async () => {
            try {
                await this.alertAggregator.aggregateAlerts(this.getActiveAlerts());
            } catch (error) {
                log('error', `Alert aggregation error: ${error.message}`);
            }
        }, this.aiConfig.alertAggregationWindow);
    }

    /**
     * Start trend analysis background process
     * @private
     */
    _startTrendAnalysis() {
        if (!this.aiConfig.predictiveAlerting) {
            return;
        }

        setInterval(async () => {
            try {
                await this.trendAnalyzer.updateTrends(this.aiMetrics);
            } catch (error) {
                log('error', `Trend analysis error: ${error.message}`);
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Get AI-specific alert emoji
     * @param {Object} alert - Alert object
     * @returns {string} Emoji
     * @private
     */
    _getAIAlertEmoji(alert) {
        if (alert.type.includes('codegen')) return '🤖';
        if (alert.type.includes('validation')) return '✅';
        if (alert.type.includes('workflow')) return '⚙️';
        if (alert.type.includes('performance')) return '⚡';
        if (alert.type.includes('predictive')) return '🔮';
        return '🚨';
    }

    /**
     * Get average processing time
     * @returns {number} Average processing time in ms
     * @private
     */
    _getAverageProcessingTime() {
        const times = Array.from(this.alertProcessingTime.values());
        return times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
    }

    /**
     * Get metrics collection efficiency
     * @returns {number} Efficiency score (0-1)
     * @private
     */
    _getMetricsCollectionEfficiency() {
        const avgTime = this._getAverageProcessingTime();
        return Math.max(0, 1 - (avgTime / 1000)); // 1 second baseline
    }
}

/**
 * Alert Aggregator for intelligent alert throttling
 */
class AlertAggregator {
    constructor(config) {
        this.config = config;
        this.aggregationRules = new Map();
        this.isActive = true;
        this._setupDefaultRules();
    }

    _setupDefaultRules() {
        // Aggregate similar alerts within time window
        this.aggregationRules.set('similar_alerts', {
            condition: (alerts) => alerts.filter(a => a.type === alerts[0].type).length > 3,
            action: 'suppress_duplicates',
            window: 300000 // 5 minutes
        });

        // Aggregate related component alerts
        this.aggregationRules.set('component_alerts', {
            condition: (alerts) => {
                const components = new Set(alerts.map(a => a.labels?.component));
                return components.size === 1 && alerts.length > 2;
            },
            action: 'create_summary_alert',
            window: 180000 // 3 minutes
        });
    }

    async processAlerts(alerts) {
        // Implementation for alert aggregation logic
        return alerts; // Simplified for now
    }

    async aggregateAlerts(alerts) {
        // Background aggregation process
        return alerts; // Simplified for now
    }

    isActive() {
        return this.isActive;
    }

    getStatistics() {
        return {
            rules_active: this.aggregationRules.size,
            aggregation_enabled: this.isActive
        };
    }
}

/**
 * Trend Analyzer for predictive alerting
 */
class TrendAnalyzer {
    constructor(config) {
        this.config = config;
        this.trends = new Map();
        this.isAnalysisActive = true;
    }

    async analyzeTrends(metrics) {
        const predictions = {};
        
        for (const [metricName, history] of metrics) {
            if (history.length < 10) continue; // Need sufficient data
            
            const trend = this._calculateTrend(history);
            predictions[metricName] = {
                degradationRisk: Math.max(0, -trend * 0.1), // Simplified calculation
                trend: trend
            };
        }
        
        return predictions;
    }

    async updateTrends(metrics) {
        // Update trend calculations
        for (const [metricName, history] of metrics) {
            this.trends.set(metricName, this._calculateTrend(history));
        }
    }

    async getCurrentTrends() {
        return Object.fromEntries(this.trends);
    }

    isActive() {
        return this.isAnalysisActive;
    }

    _calculateTrend(history) {
        if (history.length < 2) return 0;
        
        // Simple linear trend calculation
        const recent = history.slice(-10);
        const x = recent.map((_, i) => i);
        const y = recent.map(point => point.value);
        
        const n = recent.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return isNaN(slope) ? 0 : slope;
    }
}

/**
 * Quality Tracker for AI-specific quality metrics
 */
class QualityTracker {
    constructor(config) {
        this.config = config;
        this.currentQuality = {
            codegenScore: 1.0,
            validationSuccessRate: 1.0,
            workflowCompletionRate: 1.0
        };
    }

    updateCodegenQuality(score) {
        this.currentQuality.codegenScore = score;
    }

    updateValidationSuccessRate(rate) {
        this.currentQuality.validationSuccessRate = rate;
    }

    updateWorkflowCompletionRate(rate) {
        this.currentQuality.workflowCompletionRate = rate;
    }

    getCurrentQualityScore() {
        return this.currentQuality.codegenScore;
    }

    getValidationSuccessRate() {
        return this.currentQuality.validationSuccessRate;
    }

    getWorkflowCompletionRate() {
        return this.currentQuality.workflowCompletionRate;
    }
}

export default EnhancedAlertManager;
