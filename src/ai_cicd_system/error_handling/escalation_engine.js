/**
 * @fileoverview Intelligent Escalation Engine
 * @description Manages escalation criteria, notifications, and human intervention requests
 */

import { log } from '../../../scripts/modules/utils.js';
import { ERROR_CATEGORIES, ERROR_SEVERITY } from './error_analyzer.js';

/**
 * Escalation levels
 */
export const ESCALATION_LEVELS = {
    NONE: 'NONE',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
    EMERGENCY: 'EMERGENCY'
};

/**
 * Escalation triggers
 */
export const ESCALATION_TRIGGERS = {
    ERROR_FREQUENCY: 'ERROR_FREQUENCY',
    ERROR_SEVERITY: 'ERROR_SEVERITY',
    RECOVERY_FAILURE: 'RECOVERY_FAILURE',
    PATTERN_DETECTION: 'PATTERN_DETECTION',
    RESOURCE_EXHAUSTION: 'RESOURCE_EXHAUSTION',
    SLA_BREACH: 'SLA_BREACH',
    MANUAL_REQUEST: 'MANUAL_REQUEST'
};

/**
 * Escalation statuses
 */
export const ESCALATION_STATUS = {
    PENDING: 'PENDING',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED'
};

/**
 * Intelligent Escalation Engine
 */
export class EscalationEngine {
    constructor(config = {}) {
        this.config = {
            enableEscalation: config.enableEscalation !== false,
            escalationThresholds: {
                errorFrequency: config.errorFrequency || 10, // errors per hour
                criticalErrorCount: config.criticalErrorCount || 3,
                recoveryFailureCount: config.recoveryFailureCount || 5,
                patternRecurrence: config.patternRecurrence || 5,
                ...config.escalationThresholds
            },
            slaThresholds: {
                responseTime: config.responseTime || 300000, // 5 minutes
                resolutionTime: config.resolutionTime || 3600000, // 1 hour
                ...config.slaThresholds
            },
            notificationChannels: config.notificationChannels || ['email', 'slack'],
            escalationMatrix: config.escalationMatrix || this._getDefaultEscalationMatrix(),
            ...config
        };

        this.escalations = new Map();
        this.escalationHistory = [];
        this.slaTracker = new SLATracker(this.config);
        this.notificationManager = new NotificationManager(this.config);
        this.escalationRules = new EscalationRules(this.config);
    }

    /**
     * Evaluate if escalation is needed
     * @param {Object} errorAnalysis - Error analysis result
     * @param {Object} recoveryResult - Recovery attempt result
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Escalation evaluation result
     */
    async evaluateEscalation(errorAnalysis, recoveryResult, context = {}) {
        if (!this.config.enableEscalation) {
            return { escalationRequired: false, reason: 'Escalation disabled' };
        }

        const evaluation = {
            escalationRequired: false,
            level: ESCALATION_LEVELS.NONE,
            triggers: [],
            priority: 'LOW',
            reason: '',
            recommendations: []
        };

        try {
            // Check various escalation triggers
            const triggers = await this._checkEscalationTriggers(errorAnalysis, recoveryResult, context);
            
            if (triggers.length > 0) {
                evaluation.escalationRequired = true;
                evaluation.triggers = triggers;
                evaluation.level = this._determineEscalationLevel(triggers, errorAnalysis);
                evaluation.priority = this._determinePriority(evaluation.level, triggers);
                evaluation.reason = this._generateEscalationReason(triggers, errorAnalysis);
                evaluation.recommendations = this._generateRecommendations(triggers, errorAnalysis, recoveryResult);

                // Create escalation if required
                if (evaluation.escalationRequired) {
                    const escalation = await this._createEscalation(evaluation, errorAnalysis, recoveryResult, context);
                    evaluation.escalationId = escalation.id;
                }
            }

            log('debug', 'Escalation evaluation completed', {
                escalationRequired: evaluation.escalationRequired,
                level: evaluation.level,
                triggers: evaluation.triggers.map(t => t.type)
            });

            return evaluation;

        } catch (evaluationError) {
            log('error', 'Error during escalation evaluation', {
                error: evaluationError.message,
                errorAnalysisId: errorAnalysis.id
            });

            // Create emergency escalation for evaluation failures
            return {
                escalationRequired: true,
                level: ESCALATION_LEVELS.EMERGENCY,
                triggers: [{ type: 'EVALUATION_FAILURE', details: evaluationError.message }],
                priority: 'CRITICAL',
                reason: 'Escalation evaluation failed',
                recommendations: ['Immediate manual review required']
            };
        }
    }

    /**
     * Check for escalation triggers
     * @param {Object} errorAnalysis - Error analysis result
     * @param {Object} recoveryResult - Recovery attempt result
     * @param {Object} context - Additional context
     * @returns {Promise<Array>} List of triggered escalation conditions
     * @private
     */
    async _checkEscalationTriggers(errorAnalysis, recoveryResult, context) {
        const triggers = [];

        // Check error severity trigger
        if (errorAnalysis.severity === ERROR_SEVERITY.CRITICAL) {
            triggers.push({
                type: ESCALATION_TRIGGERS.ERROR_SEVERITY,
                severity: errorAnalysis.severity,
                category: errorAnalysis.classification.category,
                confidence: 0.9
            });
        }

        // Check recovery failure trigger
        if (recoveryResult && !recoveryResult.success) {
            const failureCount = this._getRecoveryFailureCount(errorAnalysis.classification);
            if (failureCount >= this.config.escalationThresholds.recoveryFailureCount) {
                triggers.push({
                    type: ESCALATION_TRIGGERS.RECOVERY_FAILURE,
                    failureCount,
                    threshold: this.config.escalationThresholds.recoveryFailureCount,
                    confidence: 0.8
                });
            }
        }

        // Check error frequency trigger
        const errorFrequency = this._getErrorFrequency(errorAnalysis.classification);
        if (errorFrequency >= this.config.escalationThresholds.errorFrequency) {
            triggers.push({
                type: ESCALATION_TRIGGERS.ERROR_FREQUENCY,
                frequency: errorFrequency,
                threshold: this.config.escalationThresholds.errorFrequency,
                confidence: 0.7
            });
        }

        // Check pattern detection trigger
        if (errorAnalysis.patterns.isRecurring && 
            errorAnalysis.patterns.frequency >= this.config.escalationThresholds.patternRecurrence) {
            triggers.push({
                type: ESCALATION_TRIGGERS.PATTERN_DETECTION,
                pattern: errorAnalysis.patterns.pattern,
                frequency: errorAnalysis.patterns.frequency,
                confidence: 0.8
            });
        }

        // Check SLA breach trigger
        const slaStatus = await this.slaTracker.checkSLAStatus(errorAnalysis, context);
        if (slaStatus.breached) {
            triggers.push({
                type: ESCALATION_TRIGGERS.SLA_BREACH,
                slaType: slaStatus.type,
                actualTime: slaStatus.actualTime,
                threshold: slaStatus.threshold,
                confidence: 1.0
            });
        }

        // Check resource exhaustion trigger
        const resourceStatus = this._checkResourceStatus(context);
        if (resourceStatus.exhausted) {
            triggers.push({
                type: ESCALATION_TRIGGERS.RESOURCE_EXHAUSTION,
                resource: resourceStatus.resource,
                usage: resourceStatus.usage,
                threshold: resourceStatus.threshold,
                confidence: 0.9
            });
        }

        // Check manual escalation request
        if (context.manualEscalation) {
            triggers.push({
                type: ESCALATION_TRIGGERS.MANUAL_REQUEST,
                requestedBy: context.requestedBy,
                reason: context.escalationReason,
                confidence: 1.0
            });
        }

        return triggers;
    }

    /**
     * Determine escalation level based on triggers
     * @param {Array} triggers - Escalation triggers
     * @param {Object} errorAnalysis - Error analysis result
     * @returns {string} Escalation level
     * @private
     */
    _determineEscalationLevel(triggers, errorAnalysis) {
        let maxLevel = ESCALATION_LEVELS.NONE;

        for (const trigger of triggers) {
            let level = ESCALATION_LEVELS.LOW;

            switch (trigger.type) {
                case ESCALATION_TRIGGERS.ERROR_SEVERITY:
                    if (errorAnalysis.severity === ERROR_SEVERITY.CRITICAL) {
                        level = ESCALATION_LEVELS.CRITICAL;
                    } else if (errorAnalysis.severity === ERROR_SEVERITY.HIGH) {
                        level = ESCALATION_LEVELS.HIGH;
                    } else {
                        level = ESCALATION_LEVELS.MEDIUM;
                    }
                    break;

                case ESCALATION_TRIGGERS.RECOVERY_FAILURE:
                    if (trigger.failureCount >= 10) {
                        level = ESCALATION_LEVELS.HIGH;
                    } else if (trigger.failureCount >= 5) {
                        level = ESCALATION_LEVELS.MEDIUM;
                    }
                    break;

                case ESCALATION_TRIGGERS.ERROR_FREQUENCY:
                    if (trigger.frequency >= 50) {
                        level = ESCALATION_LEVELS.HIGH;
                    } else if (trigger.frequency >= 20) {
                        level = ESCALATION_LEVELS.MEDIUM;
                    }
                    break;

                case ESCALATION_TRIGGERS.PATTERN_DETECTION:
                    if (trigger.frequency >= 10) {
                        level = ESCALATION_LEVELS.HIGH;
                    } else {
                        level = ESCALATION_LEVELS.MEDIUM;
                    }
                    break;

                case ESCALATION_TRIGGERS.SLA_BREACH:
                    level = ESCALATION_LEVELS.HIGH;
                    break;

                case ESCALATION_TRIGGERS.RESOURCE_EXHAUSTION:
                    level = ESCALATION_LEVELS.CRITICAL;
                    break;

                case ESCALATION_TRIGGERS.MANUAL_REQUEST:
                    level = ESCALATION_LEVELS.MEDIUM;
                    break;
            }

            if (this._isHigherLevel(level, maxLevel)) {
                maxLevel = level;
            }
        }

        return maxLevel;
    }

    /**
     * Determine priority based on escalation level and triggers
     * @param {string} level - Escalation level
     * @param {Array} triggers - Escalation triggers
     * @returns {string} Priority level
     * @private
     */
    _determinePriority(level, triggers) {
        const priorityMap = {
            [ESCALATION_LEVELS.EMERGENCY]: 'CRITICAL',
            [ESCALATION_LEVELS.CRITICAL]: 'CRITICAL',
            [ESCALATION_LEVELS.HIGH]: 'HIGH',
            [ESCALATION_LEVELS.MEDIUM]: 'MEDIUM',
            [ESCALATION_LEVELS.LOW]: 'LOW'
        };

        return priorityMap[level] || 'LOW';
    }

    /**
     * Generate escalation reason
     * @param {Array} triggers - Escalation triggers
     * @param {Object} errorAnalysis - Error analysis result
     * @returns {string} Escalation reason
     * @private
     */
    _generateEscalationReason(triggers, errorAnalysis) {
        const reasons = triggers.map(trigger => {
            switch (trigger.type) {
                case ESCALATION_TRIGGERS.ERROR_SEVERITY:
                    return `Critical error in ${errorAnalysis.classification.category}`;
                case ESCALATION_TRIGGERS.RECOVERY_FAILURE:
                    return `Recovery failed ${trigger.failureCount} times`;
                case ESCALATION_TRIGGERS.ERROR_FREQUENCY:
                    return `High error frequency: ${trigger.frequency} errors/hour`;
                case ESCALATION_TRIGGERS.PATTERN_DETECTION:
                    return `Recurring error pattern detected (${trigger.frequency} occurrences)`;
                case ESCALATION_TRIGGERS.SLA_BREACH:
                    return `SLA breach: ${trigger.slaType}`;
                case ESCALATION_TRIGGERS.RESOURCE_EXHAUSTION:
                    return `Resource exhaustion: ${trigger.resource}`;
                case ESCALATION_TRIGGERS.MANUAL_REQUEST:
                    return `Manual escalation requested: ${trigger.reason}`;
                default:
                    return `Unknown trigger: ${trigger.type}`;
            }
        });

        return reasons.join('; ');
    }

    /**
     * Generate recommendations for escalation
     * @param {Array} triggers - Escalation triggers
     * @param {Object} errorAnalysis - Error analysis result
     * @param {Object} recoveryResult - Recovery attempt result
     * @returns {Array} Recommendations
     * @private
     */
    _generateRecommendations(triggers, errorAnalysis, recoveryResult) {
        const recommendations = [];

        for (const trigger of triggers) {
            switch (trigger.type) {
                case ESCALATION_TRIGGERS.ERROR_SEVERITY:
                    recommendations.push('Immediate investigation of critical error required');
                    recommendations.push('Review system logs and error context');
                    break;

                case ESCALATION_TRIGGERS.RECOVERY_FAILURE:
                    recommendations.push('Review and improve recovery strategies');
                    recommendations.push('Consider manual intervention');
                    break;

                case ESCALATION_TRIGGERS.ERROR_FREQUENCY:
                    recommendations.push('Investigate root cause of frequent errors');
                    recommendations.push('Consider system health check');
                    break;

                case ESCALATION_TRIGGERS.PATTERN_DETECTION:
                    recommendations.push('Analyze recurring error pattern');
                    recommendations.push('Implement targeted fix for pattern');
                    break;

                case ESCALATION_TRIGGERS.SLA_BREACH:
                    recommendations.push('Review SLA requirements and system capacity');
                    recommendations.push('Consider resource scaling');
                    break;

                case ESCALATION_TRIGGERS.RESOURCE_EXHAUSTION:
                    recommendations.push('Immediate resource allocation review');
                    recommendations.push('Scale system resources');
                    break;
            }
        }

        return [...new Set(recommendations)]; // Remove duplicates
    }

    /**
     * Create escalation record
     * @param {Object} evaluation - Escalation evaluation
     * @param {Object} errorAnalysis - Error analysis result
     * @param {Object} recoveryResult - Recovery attempt result
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Created escalation
     * @private
     */
    async _createEscalation(evaluation, errorAnalysis, recoveryResult, context) {
        const escalationId = this._generateEscalationId();
        
        const escalation = {
            id: escalationId,
            timestamp: new Date(),
            level: evaluation.level,
            priority: evaluation.priority,
            status: ESCALATION_STATUS.PENDING,
            triggers: evaluation.triggers,
            reason: evaluation.reason,
            recommendations: evaluation.recommendations,
            errorAnalysis: {
                id: errorAnalysis.id,
                category: errorAnalysis.classification.category,
                severity: errorAnalysis.severity
            },
            recoveryResult: recoveryResult ? {
                success: recoveryResult.success,
                message: recoveryResult.message
            } : null,
            context,
            assignedTo: null,
            acknowledgedAt: null,
            resolvedAt: null,
            slaDeadline: this._calculateSLADeadline(evaluation.level),
            notifications: []
        };

        this.escalations.set(escalationId, escalation);
        this.escalationHistory.push(escalation);
        this._pruneHistory();

        // Send notifications
        await this._sendEscalationNotifications(escalation);

        // Track SLA
        this.slaTracker.startTracking(escalation);

        log('info', 'Escalation created', {
            escalationId,
            level: escalation.level,
            priority: escalation.priority,
            triggers: escalation.triggers.map(t => t.type)
        });

        return escalation;
    }

    /**
     * Send escalation notifications
     * @param {Object} escalation - Escalation record
     * @returns {Promise<void>}
     * @private
     */
    async _sendEscalationNotifications(escalation) {
        try {
            const recipients = this._getEscalationRecipients(escalation.level, escalation.priority);
            
            for (const channel of this.config.notificationChannels) {
                const notification = await this.notificationManager.sendNotification(
                    channel,
                    escalation,
                    recipients
                );
                
                escalation.notifications.push({
                    channel,
                    sentAt: new Date(),
                    recipients,
                    success: notification.success,
                    messageId: notification.messageId
                });
            }
        } catch (notificationError) {
            log('error', 'Failed to send escalation notifications', {
                escalationId: escalation.id,
                error: notificationError.message
            });
        }
    }

    /**
     * Get escalation recipients based on level and priority
     * @param {string} level - Escalation level
     * @param {string} priority - Priority level
     * @returns {Array} Recipients
     * @private
     */
    _getEscalationRecipients(level, priority) {
        const matrix = this.config.escalationMatrix;
        return matrix[level] || matrix.default || [];
    }

    /**
     * Calculate SLA deadline for escalation
     * @param {string} level - Escalation level
     * @returns {Date} SLA deadline
     * @private
     */
    _calculateSLADeadline(level) {
        const slaMinutes = {
            [ESCALATION_LEVELS.EMERGENCY]: 15,
            [ESCALATION_LEVELS.CRITICAL]: 30,
            [ESCALATION_LEVELS.HIGH]: 60,
            [ESCALATION_LEVELS.MEDIUM]: 240,
            [ESCALATION_LEVELS.LOW]: 480
        };

        const minutes = slaMinutes[level] || 480;
        return new Date(Date.now() + minutes * 60000);
    }

    /**
     * Check if one escalation level is higher than another
     * @param {string} level1 - First level
     * @param {string} level2 - Second level
     * @returns {boolean} Whether level1 is higher than level2
     * @private
     */
    _isHigherLevel(level1, level2) {
        const levelOrder = [
            ESCALATION_LEVELS.NONE,
            ESCALATION_LEVELS.LOW,
            ESCALATION_LEVELS.MEDIUM,
            ESCALATION_LEVELS.HIGH,
            ESCALATION_LEVELS.CRITICAL,
            ESCALATION_LEVELS.EMERGENCY
        ];

        return levelOrder.indexOf(level1) > levelOrder.indexOf(level2);
    }

    /**
     * Get default escalation matrix
     * @returns {Object} Default escalation matrix
     * @private
     */
    _getDefaultEscalationMatrix() {
        return {
            [ESCALATION_LEVELS.EMERGENCY]: ['oncall-engineer', 'team-lead', 'manager'],
            [ESCALATION_LEVELS.CRITICAL]: ['oncall-engineer', 'team-lead'],
            [ESCALATION_LEVELS.HIGH]: ['oncall-engineer'],
            [ESCALATION_LEVELS.MEDIUM]: ['team-notifications'],
            [ESCALATION_LEVELS.LOW]: ['team-notifications'],
            default: ['team-notifications']
        };
    }

    /**
     * Get recovery failure count for error category
     * @param {Object} classification - Error classification
     * @returns {number} Failure count
     * @private
     */
    _getRecoveryFailureCount(classification) {
        // Implementation would track recovery failures by category
        return 0;
    }

    /**
     * Get error frequency for error category
     * @param {Object} classification - Error classification
     * @returns {number} Error frequency per hour
     * @private
     */
    _getErrorFrequency(classification) {
        // Implementation would calculate error frequency
        return 0;
    }

    /**
     * Check resource status
     * @param {Object} context - Context information
     * @returns {Object} Resource status
     * @private
     */
    _checkResourceStatus(context) {
        // Implementation would check system resources
        return { exhausted: false };
    }

    /**
     * Generate unique escalation ID
     * @returns {string} Unique ID
     * @private
     */
    _generateEscalationId() {
        return `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Prune escalation history
     * @private
     */
    _pruneHistory() {
        const maxHistory = 1000;
        if (this.escalationHistory.length > maxHistory) {
            this.escalationHistory = this.escalationHistory.slice(-maxHistory);
        }
    }

    /**
     * Acknowledge escalation
     * @param {string} escalationId - Escalation ID
     * @param {string} acknowledgedBy - Who acknowledged
     * @returns {Promise<boolean>} Success status
     */
    async acknowledgeEscalation(escalationId, acknowledgedBy) {
        const escalation = this.escalations.get(escalationId);
        if (!escalation) {
            return false;
        }

        escalation.status = ESCALATION_STATUS.ACKNOWLEDGED;
        escalation.acknowledgedAt = new Date();
        escalation.assignedTo = acknowledgedBy;

        log('info', 'Escalation acknowledged', {
            escalationId,
            acknowledgedBy
        });

        return true;
    }

    /**
     * Resolve escalation
     * @param {string} escalationId - Escalation ID
     * @param {string} resolution - Resolution details
     * @param {string} resolvedBy - Who resolved
     * @returns {Promise<boolean>} Success status
     */
    async resolveEscalation(escalationId, resolution, resolvedBy) {
        const escalation = this.escalations.get(escalationId);
        if (!escalation) {
            return false;
        }

        escalation.status = ESCALATION_STATUS.RESOLVED;
        escalation.resolvedAt = new Date();
        escalation.resolution = resolution;
        escalation.resolvedBy = resolvedBy;

        this.slaTracker.stopTracking(escalationId);

        log('info', 'Escalation resolved', {
            escalationId,
            resolvedBy,
            resolution
        });

        return true;
    }

    /**
     * Get escalation statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const levelStats = {};
        const statusStats = {};
        const triggerStats = {};

        for (const escalation of this.escalationHistory) {
            levelStats[escalation.level] = (levelStats[escalation.level] || 0) + 1;
            statusStats[escalation.status] = (statusStats[escalation.status] || 0) + 1;
            
            for (const trigger of escalation.triggers) {
                triggerStats[trigger.type] = (triggerStats[trigger.type] || 0) + 1;
            }
        }

        const totalEscalations = this.escalationHistory.length;
        const resolvedEscalations = this.escalationHistory.filter(e => e.status === ESCALATION_STATUS.RESOLVED).length;

        return {
            totalEscalations,
            resolvedEscalations,
            resolutionRate: totalEscalations > 0 ? resolvedEscalations / totalEscalations : 0,
            levelStats,
            statusStats,
            triggerStats,
            activeEscalations: this.escalations.size,
            slaStats: this.slaTracker.getStatistics()
        };
    }

    /**
     * Get active escalations
     * @returns {Array} Active escalations
     */
    getActiveEscalations() {
        return Array.from(this.escalations.values())
            .filter(e => e.status !== ESCALATION_STATUS.RESOLVED && e.status !== ESCALATION_STATUS.CLOSED);
    }

    /**
     * Reset escalation engine
     */
    reset() {
        this.escalations.clear();
        this.escalationHistory = [];
        this.slaTracker.reset();
    }
}

/**
 * SLA Tracker for monitoring service level agreements
 */
class SLATracker {
    constructor(config) {
        this.config = config;
        this.activeTracking = new Map();
    }

    /**
     * Check SLA status for error
     * @param {Object} errorAnalysis - Error analysis
     * @param {Object} context - Context
     * @returns {Promise<Object>} SLA status
     */
    async checkSLAStatus(errorAnalysis, context) {
        // Implementation would check SLA compliance
        return { breached: false };
    }

    /**
     * Start tracking SLA for escalation
     * @param {Object} escalation - Escalation record
     */
    startTracking(escalation) {
        this.activeTracking.set(escalation.id, {
            startTime: new Date(),
            deadline: escalation.slaDeadline,
            level: escalation.level
        });
    }

    /**
     * Stop tracking SLA
     * @param {string} escalationId - Escalation ID
     */
    stopTracking(escalationId) {
        this.activeTracking.delete(escalationId);
    }

    /**
     * Get SLA statistics
     * @returns {Object} SLA statistics
     */
    getStatistics() {
        return {
            activeTracking: this.activeTracking.size,
            // Add more SLA metrics
        };
    }

    /**
     * Reset SLA tracker
     */
    reset() {
        this.activeTracking.clear();
    }
}

/**
 * Notification Manager for sending escalation notifications
 */
class NotificationManager {
    constructor(config) {
        this.config = config;
    }

    /**
     * Send notification
     * @param {string} channel - Notification channel
     * @param {Object} escalation - Escalation record
     * @param {Array} recipients - Recipients
     * @returns {Promise<Object>} Notification result
     */
    async sendNotification(channel, escalation, recipients) {
        // Implementation would send notifications via various channels
        return {
            success: true,
            messageId: `msg_${Date.now()}`
        };
    }
}

/**
 * Escalation Rules for defining escalation logic
 */
class EscalationRules {
    constructor(config) {
        this.config = config;
        this.rules = this._loadRules();
    }

    /**
     * Load escalation rules
     * @returns {Array} Escalation rules
     * @private
     */
    _loadRules() {
        // Implementation would load rules from configuration
        return [];
    }
}

export default EscalationEngine;

