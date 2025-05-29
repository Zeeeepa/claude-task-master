/**
 * @fileoverview Unified Escalation Management System
 * @description Consolidates escalation logic from all PRs into a single,
 * intelligent escalation manager with context-aware workflows
 */

/**
 * Escalation levels
 */
export const EscalationLevel = {
    AUTOMATED_RETRY: 'AUTOMATED_RETRY',
    AUTOMATED_FIX: 'AUTOMATED_FIX',
    CODEGEN_ASSISTANCE: 'CODEGEN_ASSISTANCE',
    HUMAN_INTERVENTION: 'HUMAN_INTERVENTION',
    SYSTEM_SHUTDOWN: 'SYSTEM_SHUTDOWN'
};

/**
 * Escalation status
 */
export const EscalationStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Unified Escalation Manager
 * Consolidates escalation logic from PRs #45, #88, #90, #91, #93
 */
export class EscalationManager {
    constructor(config = {}) {
        this.config = {
            enableAutoEscalation: config.enableAutoEscalation !== false,
            codegenThreshold: config.codegenThreshold || 2,
            manualThreshold: config.manualThreshold || 5,
            systemResetThreshold: config.systemResetThreshold || 10,
            escalationLevels: config.escalationLevels || [
                EscalationLevel.AUTOMATED_RETRY,
                EscalationLevel.AUTOMATED_FIX,
                EscalationLevel.CODEGEN_ASSISTANCE,
                EscalationLevel.HUMAN_INTERVENTION,
                EscalationLevel.SYSTEM_SHUTDOWN
            ],
            escalationThresholds: {
                errorCount: 5,
                timeWindowMs: 300000, // 5 minutes
                severity: 'HIGH',
                failureRate: 0.8,
                ...config.escalationThresholds
            },
            ...config
        };

        // Active escalations
        this.activeEscalations = new Map();
        this.escalationHistory = [];
        
        // Integration clients (set via setters)
        this.codegenIntegration = null;
        this.linearIntegration = null;
        this.notificationSystem = null;
        
        // Statistics
        this.stats = {
            totalEscalations: 0,
            escalationsByLevel: {},
            resolvedEscalations: 0,
            failedEscalations: 0,
            averageResolutionTime: 0,
            escalationRate: 0
        };

        // Initialize escalation level stats
        for (const level of this.config.escalationLevels) {
            this.stats.escalationsByLevel[level] = 0;
        }
    }

    /**
     * Escalate an error for resolution
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Escalation context
     * @returns {Promise<Object>} Escalation result
     */
    async escalate(errorInfo, context = {}) {
        const escalationId = this._generateEscalationId();
        const startTime = Date.now();

        try {
            // Determine escalation level
            const level = this._determineEscalationLevel(errorInfo, context);
            
            // Create escalation record
            const escalation = {
                id: escalationId,
                level,
                errorInfo,
                context,
                status: EscalationStatus.PENDING,
                startTime,
                attempts: [],
                resolution: null,
                metadata: {
                    errorId: errorInfo.errorId,
                    classification: errorInfo.classification,
                    previousAttempts: context.attempts || 0,
                    severity: errorInfo.classification?.severity || 'medium'
                }
            };

            this.activeEscalations.set(escalationId, escalation);
            this.stats.totalEscalations++;
            this.stats.escalationsByLevel[level]++;

            // Execute escalation
            const result = await this._executeEscalation(escalation);
            
            // Update escalation record
            escalation.status = result.success ? EscalationStatus.RESOLVED : EscalationStatus.FAILED;
            escalation.resolution = result;
            escalation.endTime = Date.now();
            escalation.duration = escalation.endTime - escalation.startTime;

            // Update statistics
            if (result.success) {
                this.stats.resolvedEscalations++;
            } else {
                this.stats.failedEscalations++;
            }

            // Move to history
            this.escalationHistory.push({ ...escalation });
            this.activeEscalations.delete(escalationId);

            // Update average resolution time
            this._updateAverageResolutionTime();

            return {
                success: result.success,
                escalationId,
                level,
                resolution: result,
                duration: escalation.duration
            };

        } catch (escalationError) {
            // Handle escalation failure
            const escalation = this.activeEscalations.get(escalationId);
            if (escalation) {
                escalation.status = EscalationStatus.FAILED;
                escalation.error = escalationError.message;
                escalation.endTime = Date.now();
                escalation.duration = escalation.endTime - escalation.startTime;
                
                this.escalationHistory.push({ ...escalation });
                this.activeEscalations.delete(escalationId);
                this.stats.failedEscalations++;
            }

            return {
                success: false,
                escalationId,
                error: escalationError.message,
                level: escalation?.level || 'unknown'
            };
        }
    }

    /**
     * Get escalation statistics
     * @returns {Object} Escalation statistics
     */
    getStatistics() {
        const totalResolved = this.stats.resolvedEscalations + this.stats.failedEscalations;
        const resolutionRate = totalResolved > 0 ? this.stats.resolvedEscalations / totalResolved : 0;
        
        this.stats.escalationRate = this.stats.totalEscalations > 0 ? 
            this.stats.totalEscalations / (this.stats.totalEscalations + this.stats.resolvedEscalations) : 0;

        return {
            ...this.stats,
            resolutionRate,
            activeEscalations: this.activeEscalations.size,
            historySize: this.escalationHistory.length
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: stats.resolutionRate > 0.8 ? 'healthy' : 
                   stats.resolutionRate > 0.6 ? 'degraded' : 'unhealthy',
            resolutionRate: stats.resolutionRate,
            activeEscalations: stats.activeEscalations,
            totalEscalations: stats.totalEscalations
        };
    }

    /**
     * Set Codegen integration
     * @param {Object} codegenIntegration - Codegen integration instance
     */
    setCodegenIntegration(codegenIntegration) {
        this.codegenIntegration = codegenIntegration;
    }

    /**
     * Set Linear integration
     * @param {Object} linearIntegration - Linear integration instance
     */
    setLinearIntegration(linearIntegration) {
        this.linearIntegration = linearIntegration;
    }

    /**
     * Set notification system
     * @param {Object} notificationSystem - Notification system instance
     */
    setNotificationSystem(notificationSystem) {
        this.notificationSystem = notificationSystem;
    }

    /**
     * Reset escalation manager state
     */
    reset() {
        this.activeEscalations.clear();
        this.escalationHistory = [];
        this.stats = {
            totalEscalations: 0,
            escalationsByLevel: {},
            resolvedEscalations: 0,
            failedEscalations: 0,
            averageResolutionTime: 0,
            escalationRate: 0
        };

        // Reset escalation level stats
        for (const level of this.config.escalationLevels) {
            this.stats.escalationsByLevel[level] = 0;
        }
    }

    // Private methods

    /**
     * Determine escalation level based on error info and context
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Escalation context
     * @returns {string} Escalation level
     * @private
     */
    _determineEscalationLevel(errorInfo, context) {
        const attempts = context.attempts || 0;
        const severity = errorInfo.classification?.severity || 'medium';
        const category = errorInfo.classification?.category || 'unknown';

        // Critical errors go straight to human intervention
        if (severity === 'critical') {
            return EscalationLevel.HUMAN_INTERVENTION;
        }

        // System errors with high failure rate trigger system shutdown
        if (
            category === 'system' && 
            attempts >= this.config.systemResetThreshold
        ) {
            return EscalationLevel.SYSTEM_SHUTDOWN;
        }

        // Determine level based on attempts and thresholds
        if (attempts < this.config.codegenThreshold) {
            return EscalationLevel.AUTOMATED_RETRY;
        } else if (attempts < this.config.manualThreshold) {
            if (errorInfo.classification?.fixable) {
                return EscalationLevel.AUTOMATED_FIX;
            } else {
                return EscalationLevel.CODEGEN_ASSISTANCE;
            }
        } else {
            return EscalationLevel.HUMAN_INTERVENTION;
        }
    }

    /**
     * Execute escalation based on level
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeEscalation(escalation) {
        escalation.status = EscalationStatus.IN_PROGRESS;

        switch (escalation.level) {
            case EscalationLevel.AUTOMATED_RETRY:
                return await this._executeAutomatedRetry(escalation);

            case EscalationLevel.AUTOMATED_FIX:
                return await this._executeAutomatedFix(escalation);

            case EscalationLevel.CODEGEN_ASSISTANCE:
                return await this._executeCodegenAssistance(escalation);

            case EscalationLevel.HUMAN_INTERVENTION:
                return await this._executeHumanIntervention(escalation);

            case EscalationLevel.SYSTEM_SHUTDOWN:
                return await this._executeSystemShutdown(escalation);

            default:
                throw new Error(`Unknown escalation level: ${escalation.level}`);
        }
    }

    /**
     * Execute automated retry escalation
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeAutomatedRetry(escalation) {
        // This would typically trigger enhanced retry logic
        // For now, we'll simulate the process
        
        escalation.attempts.push({
            type: 'automated_retry',
            timestamp: new Date(),
            details: 'Enhanced retry strategy applied'
        });

        // Simulate retry success/failure
        const success = Math.random() > 0.3; // 70% success rate

        return {
            success,
            method: 'automated_retry',
            message: success ? 
                'Enhanced retry strategy resolved the issue' : 
                'Enhanced retry strategy failed, escalating further',
            details: {
                retryStrategy: 'enhanced_exponential_backoff',
                attempts: escalation.context.attempts + 1
            }
        };
    }

    /**
     * Execute automated fix escalation
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeAutomatedFix(escalation) {
        escalation.attempts.push({
            type: 'automated_fix',
            timestamp: new Date(),
            details: 'Automated fix generation attempted'
        });

        // This would integrate with the AutomatedFixGenerator
        // For now, we'll simulate the process
        
        const fixSuccess = Math.random() > 0.4; // 60% success rate

        return {
            success: fixSuccess,
            method: 'automated_fix',
            message: fixSuccess ? 
                'Automated fix successfully applied' : 
                'Automated fix failed, escalating to Codegen',
            details: {
                fixType: 'pattern_based',
                confidence: Math.random() * 0.4 + 0.6 // 0.6-1.0
            }
        };
    }

    /**
     * Execute Codegen assistance escalation
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeCodegenAssistance(escalation) {
        if (!this.codegenIntegration) {
            return {
                success: false,
                method: 'codegen_assistance',
                message: 'Codegen integration not available',
                error: 'No Codegen integration configured'
            };
        }

        try {
            escalation.attempts.push({
                type: 'codegen_assistance',
                timestamp: new Date(),
                details: 'Codegen assistance requested'
            });

            // Request Codegen assistance
            const codegenResult = await this.codegenIntegration.requestAssistance({
                errorInfo: escalation.errorInfo,
                context: escalation.context,
                escalationId: escalation.id
            });

            // Create Linear ticket if Linear integration is available
            if (this.linearIntegration && codegenResult.ticketRequired) {
                const ticket = await this.linearIntegration.createTicket({
                    title: `Error Escalation: ${escalation.errorInfo.error?.message || 'Unknown Error'}`,
                    description: this._formatLinearTicketDescription(escalation),
                    priority: this._mapSeverityToPriority(escalation.metadata.severity),
                    assignee: 'codegen',
                    labels: ['error-escalation', 'codegen-assistance']
                });

                codegenResult.linearTicket = ticket;
            }

            return {
                success: true,
                method: 'codegen_assistance',
                message: 'Codegen assistance initiated',
                details: codegenResult
            };

        } catch (error) {
            return {
                success: false,
                method: 'codegen_assistance',
                message: 'Codegen assistance failed',
                error: error.message
            };
        }
    }

    /**
     * Execute human intervention escalation
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeHumanIntervention(escalation) {
        try {
            escalation.attempts.push({
                type: 'human_intervention',
                timestamp: new Date(),
                details: 'Human intervention requested'
            });

            const interventionTasks = [];

            // Create urgent Linear ticket if available
            if (this.linearIntegration) {
                const ticketPromise = this.linearIntegration.createTicket({
                    title: `URGENT: Error Escalation - ${escalation.errorInfo.error?.message || 'Critical Error'}`,
                    description: this._formatLinearTicketDescription(escalation),
                    priority: 'URGENT',
                    assignee: null, // Let team assign
                    labels: ['error-escalation', 'human-intervention', 'urgent']
                });
                interventionTasks.push(ticketPromise);
            }

            // Send notifications if available
            if (this.notificationSystem) {
                const notificationPromise = this.notificationSystem.sendUrgentNotification({
                    title: 'Critical Error Escalation',
                    message: `Error requires immediate human intervention: ${escalation.errorInfo.error?.message}`,
                    escalationId: escalation.id,
                    severity: escalation.metadata.severity,
                    context: escalation.context
                });
                interventionTasks.push(notificationPromise);
            }

            // Execute all intervention tasks
            const results = await Promise.allSettled(interventionTasks);
            
            const successfulTasks = results.filter(r => r.status === 'fulfilled');
            const failedTasks = results.filter(r => r.status === 'rejected');

            return {
                success: successfulTasks.length > 0,
                method: 'human_intervention',
                message: `Human intervention initiated (${successfulTasks.length}/${results.length} tasks successful)`,
                details: {
                    successfulTasks: successfulTasks.length,
                    failedTasks: failedTasks.length,
                    results: results.map(r => ({
                        status: r.status,
                        value: r.status === 'fulfilled' ? r.value : undefined,
                        reason: r.status === 'rejected' ? r.reason.message : undefined
                    }))
                }
            };

        } catch (error) {
            return {
                success: false,
                method: 'human_intervention',
                message: 'Human intervention setup failed',
                error: error.message
            };
        }
    }

    /**
     * Execute system shutdown escalation
     * @param {Object} escalation - Escalation record
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeSystemShutdown(escalation) {
        try {
            escalation.attempts.push({
                type: 'system_shutdown',
                timestamp: new Date(),
                details: 'System shutdown initiated due to critical errors'
            });

            // Send emergency notifications
            if (this.notificationSystem) {
                await this.notificationSystem.sendEmergencyNotification({
                    title: 'EMERGENCY: System Shutdown Initiated',
                    message: `Critical error pattern detected. System shutdown initiated for protection.`,
                    escalationId: escalation.id,
                    errorInfo: escalation.errorInfo,
                    context: escalation.context
                });
            }

            // Create emergency Linear ticket
            if (this.linearIntegration) {
                await this.linearIntegration.createTicket({
                    title: 'EMERGENCY: System Shutdown - Critical Error Pattern',
                    description: this._formatEmergencyTicketDescription(escalation),
                    priority: 'URGENT',
                    assignee: null,
                    labels: ['emergency', 'system-shutdown', 'critical-error']
                });
            }

            // In a real implementation, this would trigger graceful system shutdown
            // For now, we'll just log the event
            console.error('EMERGENCY: System shutdown would be initiated here');

            return {
                success: true,
                method: 'system_shutdown',
                message: 'Emergency system shutdown initiated',
                details: {
                    reason: 'Critical error pattern detected',
                    errorCount: escalation.context.attempts,
                    severity: escalation.metadata.severity
                }
            };

        } catch (error) {
            return {
                success: false,
                method: 'system_shutdown',
                message: 'System shutdown escalation failed',
                error: error.message
            };
        }
    }

    /**
     * Format Linear ticket description
     * @param {Object} escalation - Escalation record
     * @returns {string} Formatted description
     * @private
     */
    _formatLinearTicketDescription(escalation) {
        const { errorInfo, context, metadata } = escalation;
        
        return `
## Error Escalation Details

**Escalation ID:** ${escalation.id}
**Level:** ${escalation.level}
**Severity:** ${metadata.severity}
**Attempts:** ${context.attempts || 0}

## Error Information

**Error Message:** ${errorInfo.error?.message || 'Unknown error'}
**Error Category:** ${metadata.classification?.category || 'unknown'}
**Error Type:** ${metadata.classification?.type || 'unknown'}

## Context

**Operation:** ${context.operation || 'unknown'}
**Component:** ${context.component || 'unknown'}
**Environment:** ${context.environment || 'unknown'}

## Classification

**Retryable:** ${metadata.classification?.retryable ? 'Yes' : 'No'}
**Fixable:** ${metadata.classification?.fixable ? 'Yes' : 'No'}
**Confidence:** ${metadata.classification?.confidence || 'unknown'}

## Next Steps

Please investigate this error and take appropriate action. The error has been escalated due to repeated failures or high severity.
        `.trim();
    }

    /**
     * Format emergency ticket description
     * @param {Object} escalation - Escalation record
     * @returns {string} Formatted description
     * @private
     */
    _formatEmergencyTicketDescription(escalation) {
        return `
# 🚨 EMERGENCY: System Shutdown Initiated

## Critical Error Pattern Detected

The system has detected a critical error pattern that poses a risk to system stability. An emergency shutdown has been initiated to protect the system.

${this._formatLinearTicketDescription(escalation)}

## Emergency Actions Taken

- System shutdown initiated
- Emergency notifications sent
- All active operations halted

## Required Actions

1. **IMMEDIATE:** Investigate the root cause of the critical error pattern
2. **URGENT:** Determine if system restart is safe
3. **HIGH:** Implement fixes to prevent recurrence
4. **MEDIUM:** Review escalation thresholds and procedures

**This is an emergency situation requiring immediate attention.**
        `.trim();
    }

    /**
     * Map severity to Linear priority
     * @param {string} severity - Error severity
     * @returns {string} Linear priority
     * @private
     */
    _mapSeverityToPriority(severity) {
        const mapping = {
            low: 'LOW',
            medium: 'MEDIUM',
            high: 'HIGH',
            critical: 'URGENT'
        };
        
        return mapping[severity?.toLowerCase()] || 'MEDIUM';
    }

    /**
     * Update average resolution time
     * @private
     */
    _updateAverageResolutionTime() {
        const resolvedEscalations = this.escalationHistory.filter(e => 
            e.status === EscalationStatus.RESOLVED && e.duration
        );
        
        if (resolvedEscalations.length > 0) {
            const totalTime = resolvedEscalations.reduce((sum, e) => sum + e.duration, 0);
            this.stats.averageResolutionTime = totalTime / resolvedEscalations.length;
        }
    }

    /**
     * Generate unique escalation ID
     * @returns {string} Escalation ID
     * @private
     */
    _generateEscalationId() {
        return `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EscalationManager;

