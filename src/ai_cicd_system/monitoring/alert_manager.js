/**
 * @fileoverview Alert Manager
 * @description Intelligent alerting system with escalation and notification management
 */

import { log } from '../../scripts/modules/utils.js';
import { EventEmitter } from 'events';

/**
 * Intelligent alert manager with escalation and notification capabilities
 */
export class AlertManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.rules = new Map();
        this.channels = new Map();
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.suppressions = new Map();
        this.escalations = new Map();
        this.isMonitoring = false;
        this.evaluationInterval = null;
        this.metricsCollector = null;
        
        this.initializeAlertRules();
        this.initializeNotificationChannels();
    }

    /**
     * Initialize default alert rules
     */
    initializeAlertRules() {
        // System resource alerts
        this.rules.set('high_cpu_usage', {
            id: 'high_cpu_usage',
            name: 'High CPU Usage',
            description: 'CPU usage exceeds threshold',
            type: 'metric',
            metric_type: 'system',
            metric_field: 'cpu_usage',
            operator: 'greater_than',
            threshold: 80,
            critical_threshold: 95,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 300000, // 5 minutes
            min_duration: 120000, // 2 minutes
            enabled: true,
            channels: ['email', 'slack'],
            escalation_delay: 900000, // 15 minutes
            auto_resolve: true,
            resolve_threshold: 70
        });

        this.rules.set('high_memory_usage', {
            id: 'high_memory_usage',
            name: 'High Memory Usage',
            description: 'Memory usage exceeds threshold',
            type: 'metric',
            metric_type: 'system',
            metric_field: 'memory_usage',
            operator: 'greater_than',
            threshold: 85,
            critical_threshold: 95,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 300000,
            min_duration: 180000, // 3 minutes
            enabled: true,
            channels: ['email', 'slack'],
            escalation_delay: 600000, // 10 minutes
            auto_resolve: true,
            resolve_threshold: 80
        });

        this.rules.set('workflow_failure_rate', {
            id: 'workflow_failure_rate',
            name: 'High Workflow Failure Rate',
            description: 'Workflow failure rate exceeds threshold',
            type: 'metric',
            metric_type: 'workflow',
            metric_field: 'success_rate',
            operator: 'less_than',
            threshold: 95,
            critical_threshold: 90,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 600000, // 10 minutes
            min_duration: 300000, // 5 minutes
            enabled: true,
            channels: ['email', 'slack', 'pagerduty'],
            escalation_delay: 1200000, // 20 minutes
            auto_resolve: true,
            resolve_threshold: 98
        });

        this.rules.set('slow_api_response', {
            id: 'slow_api_response',
            name: 'Slow API Response Times',
            description: 'API response times exceed threshold',
            type: 'metric',
            metric_type: 'api',
            metric_field: 'avg_response_time',
            operator: 'greater_than',
            threshold: 2000,
            critical_threshold: 5000,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 300000,
            min_duration: 120000,
            enabled: true,
            channels: ['slack'],
            escalation_delay: 900000,
            auto_resolve: true,
            resolve_threshold: 1500
        });

        this.rules.set('database_slow_queries', {
            id: 'database_slow_queries',
            name: 'Database Slow Queries',
            description: 'Database query times exceed threshold',
            type: 'metric',
            metric_type: 'database',
            metric_field: 'average_query_time',
            operator: 'greater_than',
            threshold: 1000,
            critical_threshold: 3000,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 600000,
            min_duration: 300000,
            enabled: true,
            channels: ['email', 'slack'],
            escalation_delay: 1800000, // 30 minutes
            auto_resolve: true,
            resolve_threshold: 800
        });

        this.rules.set('health_check_failure', {
            id: 'health_check_failure',
            name: 'Health Check Failure',
            description: 'System health check failed',
            type: 'event',
            event_type: 'health_check_failed',
            severity: 'critical',
            evaluation_window: 60000, // 1 minute
            enabled: true,
            channels: ['email', 'slack', 'pagerduty'],
            escalation_delay: 300000, // 5 minutes
            auto_resolve: false
        });

        this.rules.set('agent_error_rate', {
            id: 'agent_error_rate',
            name: 'High Agent Error Rate',
            description: 'Agent error rate exceeds threshold',
            type: 'metric',
            metric_type: 'agent',
            metric_field: 'overall_success_rate',
            operator: 'less_than',
            threshold: 95,
            critical_threshold: 90,
            severity: 'warning',
            critical_severity: 'critical',
            evaluation_window: 600000,
            min_duration: 300000,
            enabled: true,
            channels: ['email', 'slack'],
            escalation_delay: 900000,
            auto_resolve: true,
            resolve_threshold: 98
        });

        log('debug', `Initialized ${this.rules.size} alert rules`);
    }

    /**
     * Initialize notification channels
     */
    initializeNotificationChannels() {
        // Email notification channel
        this.channels.set('email', {
            id: 'email',
            name: 'Email Notifications',
            type: 'email',
            enabled: this.config.notifications?.email?.enabled || false,
            config: this.config.notifications?.email || {},
            send: this.sendEmailNotification.bind(this)
        });

        // Slack notification channel
        this.channels.set('slack', {
            id: 'slack',
            name: 'Slack Notifications',
            type: 'slack',
            enabled: this.config.notifications?.slack?.enabled || false,
            config: this.config.notifications?.slack || {},
            send: this.sendSlackNotification.bind(this)
        });

        // PagerDuty notification channel
        this.channels.set('pagerduty', {
            id: 'pagerduty',
            name: 'PagerDuty Notifications',
            type: 'pagerduty',
            enabled: this.config.notifications?.pagerduty?.enabled || false,
            config: this.config.notifications?.pagerduty || {},
            send: this.sendPagerDutyNotification.bind(this)
        });

        // Webhook notification channel
        this.channels.set('webhook', {
            id: 'webhook',
            name: 'Webhook Notifications',
            type: 'webhook',
            enabled: this.config.notifications?.webhook?.enabled || false,
            config: this.config.notifications?.webhook || {},
            send: this.sendWebhookNotification.bind(this)
        });

        log('debug', `Initialized ${this.channels.size} notification channels`);
    }

    /**
     * Set metrics collector reference
     */
    setMetricsCollector(collector) {
        this.metricsCollector = collector;
    }

    /**
     * Start alert monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            log('warning', 'Alert monitoring already running');
            return;
        }

        this.isMonitoring = true;
        const interval = this.config.alert_evaluation_interval || 60000; // 1 minute

        this.evaluationInterval = setInterval(async () => {
            try {
                await this.evaluateAllAlerts();
            } catch (error) {
                log('error', `Error during alert evaluation: ${error.message}`);
            }
        }, interval);

        log('info', `Started alert monitoring with ${interval}ms evaluation interval`);
    }

    /**
     * Stop alert monitoring
     */
    stopMonitoring() {
        if (this.evaluationInterval) {
            clearInterval(this.evaluationInterval);
            this.evaluationInterval = null;
        }
        this.isMonitoring = false;
        log('info', 'Stopped alert monitoring');
    }

    /**
     * Evaluate all alert rules
     */
    async evaluateAllAlerts() {
        if (!this.metricsCollector) {
            log('warning', 'No metrics collector available for alert evaluation');
            return;
        }

        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            const alerts = [];

            for (const [ruleId, rule] of this.rules) {
                if (!rule.enabled) continue;

                try {
                    const result = await this.evaluateRule(rule, metrics);
                    if (result.triggered) {
                        const alert = await this.createAlert(rule, result, metrics);
                        alerts.push(alert);
                        
                        if (!this.activeAlerts.has(alert.id)) {
                            await this.fireAlert(alert);
                        } else {
                            await this.updateAlert(alert);
                        }
                    } else {
                        // Check for auto-resolution
                        await this.checkAutoResolve(rule, metrics);
                    }
                } catch (error) {
                    log('error', `Error evaluating rule ${ruleId}: ${error.message}`);
                }
            }

            return alerts;
        } catch (error) {
            log('error', `Error during alert evaluation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Evaluate individual alert rule
     */
    async evaluateRule(rule, metrics) {
        try {
            let triggered = false;
            let value = null;
            let details = {};

            switch (rule.type) {
                case 'metric':
                    const result = this.evaluateMetricRule(rule, metrics);
                    triggered = result.triggered;
                    value = result.value;
                    details = result.details;
                    break;
                    
                case 'event':
                    // Event-based rules would be triggered externally
                    triggered = false;
                    break;
                    
                case 'composite':
                    triggered = await this.evaluateCompositeRule(rule, metrics);
                    break;
                    
                default:
                    log('warning', `Unknown rule type: ${rule.type}`);
                    return { triggered: false };
            }

            return {
                triggered,
                value,
                details,
                timestamp: Date.now(),
                rule_id: rule.id
            };

        } catch (error) {
            log('error', `Error evaluating rule ${rule.id}: ${error.message}`);
            return { triggered: false, error: error.message };
        }
    }

    /**
     * Evaluate metric-based rule
     */
    evaluateMetricRule(rule, metrics) {
        const metricData = metrics[rule.metric_type];
        
        if (!metricData || metricData.status !== 'success') {
            return { triggered: false, value: null, details: { error: 'Metric data unavailable' } };
        }

        const value = metricData.data[rule.metric_field];
        
        if (value === undefined || value === null) {
            return { triggered: false, value: null, details: { error: 'Metric field not found' } };
        }

        let triggered = false;
        let severity = rule.severity;

        // Check critical threshold first
        if (rule.critical_threshold !== undefined) {
            if (this.compareValues(value, rule.critical_threshold, rule.operator)) {
                triggered = true;
                severity = rule.critical_severity || 'critical';
            }
        }

        // Check warning threshold if not already critical
        if (!triggered && this.compareValues(value, rule.threshold, rule.operator)) {
            triggered = true;
            severity = rule.severity;
        }

        return {
            triggered,
            value,
            severity,
            details: {
                threshold: triggered ? (severity === 'critical' ? rule.critical_threshold : rule.threshold) : rule.threshold,
                operator: rule.operator,
                metric_type: rule.metric_type,
                metric_field: rule.metric_field
            }
        };
    }

    /**
     * Compare values based on operator
     */
    compareValues(value, threshold, operator) {
        switch (operator) {
            case 'greater_than':
                return value > threshold;
            case 'greater_than_or_equal':
                return value >= threshold;
            case 'less_than':
                return value < threshold;
            case 'less_than_or_equal':
                return value <= threshold;
            case 'equals':
                return value === threshold;
            case 'not_equals':
                return value !== threshold;
            default:
                return false;
        }
    }

    /**
     * Evaluate composite rule (multiple conditions)
     */
    async evaluateCompositeRule(rule, metrics) {
        // Implementation for composite rules would go here
        return false;
    }

    /**
     * Create alert from rule evaluation
     */
    async createAlert(rule, result, metrics) {
        const alertId = `${rule.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const alert = {
            id: alertId,
            rule_id: rule.id,
            rule_name: rule.name,
            severity: result.severity || rule.severity,
            status: 'active',
            title: this.generateAlertTitle(rule, result),
            description: this.generateAlertDescription(rule, result),
            value: result.value,
            threshold: result.details?.threshold,
            fired_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            resolved_at: null,
            acknowledged_at: null,
            acknowledged_by: null,
            acknowledgment_comment: null,
            escalated: false,
            escalated_at: null,
            notification_count: 0,
            last_notification: null,
            metrics_snapshot: this.createMetricsSnapshot(metrics),
            tags: rule.tags || [],
            channels: rule.channels || [],
            escalation_delay: rule.escalation_delay,
            auto_resolve: rule.auto_resolve,
            resolve_threshold: rule.resolve_threshold
        };

        return alert;
    }

    /**
     * Fire new alert
     */
    async fireAlert(alert) {
        try {
            // Check for suppressions
            if (this.isAlertSuppressed(alert)) {
                log('debug', `Alert ${alert.id} is suppressed`);
                return;
            }

            // Store active alert
            this.activeAlerts.set(alert.id, alert);
            
            // Add to history
            this.alertHistory.push({
                ...alert,
                action: 'fired'
            });

            // Send notifications
            await this.sendNotifications(alert);

            // Schedule escalation if configured
            if (alert.escalation_delay && alert.escalation_delay > 0) {
                setTimeout(async () => {
                    await this.escalateAlert(alert.id);
                }, alert.escalation_delay);
            }

            // Emit event
            this.emit('alert_fired', alert);

            log('warning', `Alert fired: ${alert.title} (${alert.severity})`);

        } catch (error) {
            log('error', `Error firing alert ${alert.id}: ${error.message}`);
        }
    }

    /**
     * Update existing alert
     */
    async updateAlert(alert) {
        const existingAlert = this.activeAlerts.get(alert.id);
        if (!existingAlert) return;

        // Update alert data
        existingAlert.value = alert.value;
        existingAlert.updated_at = new Date().toISOString();
        existingAlert.metrics_snapshot = alert.metrics_snapshot;

        // Check if severity changed
        if (existingAlert.severity !== alert.severity) {
            existingAlert.severity = alert.severity;
            await this.sendNotifications(existingAlert, 'severity_changed');
            
            this.alertHistory.push({
                ...existingAlert,
                action: 'severity_changed',
                previous_severity: existingAlert.severity
            });
        }

        this.emit('alert_updated', existingAlert);
    }

    /**
     * Check for auto-resolution
     */
    async checkAutoResolve(rule, metrics) {
        const activeAlertsForRule = Array.from(this.activeAlerts.values())
            .filter(alert => alert.rule_id === rule.id && alert.auto_resolve);

        for (const alert of activeAlertsForRule) {
            if (this.shouldAutoResolve(alert, rule, metrics)) {
                await this.resolveAlert(alert.id, 'auto_resolved', 'Automatically resolved - metric returned to normal');
            }
        }
    }

    /**
     * Check if alert should be auto-resolved
     */
    shouldAutoResolve(alert, rule, metrics) {
        if (!rule.resolve_threshold) return false;

        const metricData = metrics[rule.metric_type];
        if (!metricData || metricData.status !== 'success') return false;

        const value = metricData.data[rule.metric_field];
        if (value === undefined || value === null) return false;

        // Invert the operator for resolution check
        const resolveOperator = this.getResolveOperator(rule.operator);
        return this.compareValues(value, rule.resolve_threshold, resolveOperator);
    }

    /**
     * Get resolve operator (inverse of trigger operator)
     */
    getResolveOperator(operator) {
        switch (operator) {
            case 'greater_than':
                return 'less_than_or_equal';
            case 'greater_than_or_equal':
                return 'less_than';
            case 'less_than':
                return 'greater_than_or_equal';
            case 'less_than_or_equal':
                return 'greater_than';
            default:
                return operator;
        }
    }

    /**
     * Resolve alert
     */
    async resolveAlert(alertId, resolvedBy = 'manual', comment = null) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }

        alert.status = 'resolved';
        alert.resolved_at = new Date().toISOString();
        alert.resolved_by = resolvedBy;
        alert.resolution_comment = comment;

        // Remove from active alerts
        this.activeAlerts.delete(alertId);

        // Add to history
        this.alertHistory.push({
            ...alert,
            action: 'resolved',
            resolved_by: resolvedBy,
            resolution_comment: comment
        });

        // Send resolution notification
        await this.sendNotifications(alert, 'resolved');

        // Emit event
        this.emit('alert_resolved', alert);

        log('info', `Alert resolved: ${alert.title} by ${resolvedBy}`);

        return alert;
    }

    /**
     * Acknowledge alert
     */
    async acknowledgeAlert(alertId, acknowledgedBy, comment = null) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }

        alert.acknowledged_at = new Date().toISOString();
        alert.acknowledged_by = acknowledgedBy;
        alert.acknowledgment_comment = comment;

        // Add to history
        this.alertHistory.push({
            ...alert,
            action: 'acknowledged',
            acknowledged_by: acknowledgedBy,
            acknowledgment_comment: comment
        });

        // Send acknowledgment notification
        await this.sendNotifications(alert, 'acknowledged');

        // Emit event
        this.emit('alert_acknowledged', alert);

        log('info', `Alert acknowledged: ${alert.title} by ${acknowledgedBy}`);

        return alert;
    }

    /**
     * Escalate alert
     */
    async escalateAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert || alert.acknowledged_at || alert.escalated) {
            return; // Don't escalate if acknowledged or already escalated
        }

        alert.escalated = true;
        alert.escalated_at = new Date().toISOString();

        // Add to history
        this.alertHistory.push({
            ...alert,
            action: 'escalated'
        });

        // Send escalation notification
        await this.sendNotifications(alert, 'escalated');

        // Emit event
        this.emit('alert_escalated', alert);

        log('warning', `Alert escalated: ${alert.title}`);
    }

    /**
     * Send notifications for alert
     */
    async sendNotifications(alert, action = 'fired') {
        const channels = alert.channels || [];
        
        for (const channelId of channels) {
            const channel = this.channels.get(channelId);
            
            if (!channel || !channel.enabled) {
                continue;
            }

            try {
                await channel.send(alert, action);
                alert.notification_count++;
                alert.last_notification = new Date().toISOString();
                
                log('debug', `Notification sent via ${channelId} for alert ${alert.id}`);
            } catch (error) {
                log('error', `Failed to send notification via ${channelId}: ${error.message}`);
            }
        }
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(alert, action) {
        // Email notification implementation would go here
        // For now, just log the notification
        log('info', `EMAIL NOTIFICATION: ${action.toUpperCase()} - ${alert.title}`);
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(alert, action) {
        // Slack notification implementation would go here
        // For now, just log the notification
        log('info', `SLACK NOTIFICATION: ${action.toUpperCase()} - ${alert.title}`);
    }

    /**
     * Send PagerDuty notification
     */
    async sendPagerDutyNotification(alert, action) {
        // PagerDuty notification implementation would go here
        // For now, just log the notification
        log('info', `PAGERDUTY NOTIFICATION: ${action.toUpperCase()} - ${alert.title}`);
    }

    /**
     * Send webhook notification
     */
    async sendWebhookNotification(alert, action) {
        // Webhook notification implementation would go here
        // For now, just log the notification
        log('info', `WEBHOOK NOTIFICATION: ${action.toUpperCase()} - ${alert.title}`);
    }

    /**
     * Check if alert is suppressed
     */
    isAlertSuppressed(alert) {
        // Check for rule-level suppressions
        const suppression = this.suppressions.get(alert.rule_id);
        if (suppression && suppression.until > Date.now()) {
            return true;
        }

        // Check for global suppressions
        const globalSuppression = this.suppressions.get('global');
        if (globalSuppression && globalSuppression.until > Date.now()) {
            return true;
        }

        return false;
    }

    /**
     * Generate alert title
     */
    generateAlertTitle(rule, result) {
        if (result.value !== null && result.details?.threshold !== undefined) {
            return `${rule.name}: ${result.value} ${result.details.operator.replace('_', ' ')} ${result.details.threshold}`;
        }
        return rule.name;
    }

    /**
     * Generate alert description
     */
    generateAlertDescription(rule, result) {
        let description = rule.description;
        
        if (result.value !== null) {
            description += ` Current value: ${result.value}`;
        }
        
        if (result.details?.threshold !== undefined) {
            description += `, Threshold: ${result.details.threshold}`;
        }

        return description;
    }

    /**
     * Create metrics snapshot for alert
     */
    createMetricsSnapshot(metrics) {
        // Create a lightweight snapshot of relevant metrics
        const snapshot = {};
        
        Object.keys(metrics).forEach(type => {
            if (metrics[type] && metrics[type].data) {
                snapshot[type] = {
                    timestamp: metrics[type].timestamp,
                    status: metrics[type].status,
                    key_metrics: this.extractKeyMetrics(metrics[type].data, type)
                };
            }
        });

        return snapshot;
    }

    /**
     * Extract key metrics for snapshot
     */
    extractKeyMetrics(data, type) {
        const keyFields = {
            system: ['cpu_usage', 'memory_usage', 'load_average_1m'],
            workflow: ['active_count', 'success_rate', 'average_execution_time'],
            agent: ['total_agents', 'overall_success_rate', 'average_response_time'],
            database: ['total_queries', 'average_query_time', 'query_success_rate'],
            api: ['total_requests', 'avg_response_time', 'success_rate']
        };

        const fields = keyFields[type] || Object.keys(data).slice(0, 5);
        const keyMetrics = {};
        
        fields.forEach(field => {
            if (data[field] !== undefined) {
                keyMetrics[field] = data[field];
            }
        });

        return keyMetrics;
    }

    /**
     * Get active alerts
     */
    async getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }

    /**
     * Get alert history
     */
    async getAlertHistory(limit = 100) {
        return this.alertHistory.slice(-limit);
    }

    /**
     * Get alert statistics
     */
    async getAlertStats() {
        const activeAlerts = Array.from(this.activeAlerts.values());
        const recentHistory = this.alertHistory.slice(-100);

        return {
            active_alerts: activeAlerts.length,
            critical_alerts: activeAlerts.filter(a => a.severity === 'critical').length,
            warning_alerts: activeAlerts.filter(a => a.severity === 'warning').length,
            acknowledged_alerts: activeAlerts.filter(a => a.acknowledged_at).length,
            escalated_alerts: activeAlerts.filter(a => a.escalated).length,
            total_rules: this.rules.size,
            enabled_rules: Array.from(this.rules.values()).filter(r => r.enabled).length,
            notification_channels: this.channels.size,
            enabled_channels: Array.from(this.channels.values()).filter(c => c.enabled).length,
            recent_activity: recentHistory.length,
            is_monitoring: this.isMonitoring
        };
    }

    /**
     * Get alert rules
     */
    getAlertRules() {
        return Array.from(this.rules.values());
    }

    /**
     * Add or update alert rule
     */
    setAlertRule(ruleId, rule) {
        this.rules.set(ruleId, {
            id: ruleId,
            ...rule
        });
        log('info', `Alert rule ${ruleId} ${this.rules.has(ruleId) ? 'updated' : 'added'}`);
    }

    /**
     * Remove alert rule
     */
    removeAlertRule(ruleId) {
        if (this.rules.delete(ruleId)) {
            log('info', `Alert rule ${ruleId} removed`);
            return true;
        }
        return false;
    }

    /**
     * Suppress alerts for a rule
     */
    suppressAlerts(ruleId, durationMs, reason = null) {
        this.suppressions.set(ruleId, {
            until: Date.now() + durationMs,
            reason: reason,
            created_at: new Date().toISOString()
        });
        
        log('info', `Alerts suppressed for rule ${ruleId} for ${durationMs}ms`);
    }

    /**
     * Remove alert suppression
     */
    removeSuppression(ruleId) {
        if (this.suppressions.delete(ruleId)) {
            log('info', `Alert suppression removed for rule ${ruleId}`);
            return true;
        }
        return false;
    }

    /**
     * Trigger manual alert (for testing or external events)
     */
    async triggerManualAlert(ruleId, value = null, details = {}) {
        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Alert rule ${ruleId} not found`);
        }

        const result = {
            triggered: true,
            value: value,
            details: details,
            timestamp: Date.now(),
            rule_id: ruleId,
            manual: true
        };

        const alert = await this.createAlert(rule, result, {});
        await this.fireAlert(alert);

        return alert;
    }
}

export default AlertManager;

