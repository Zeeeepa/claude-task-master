/**
 * @fileoverview Escalation Manager for Complex Error Resolution
 * @description Manages escalation workflow to codegen and other resolution systems with context preservation
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Escalation Manager for handling complex errors that require human or AI intervention
 */
export class EscalationManager {
    constructor(config = {}) {
        this.config = {
            enableAutoEscalation: config.enableAutoEscalation !== false,
            escalationThresholds: {
                errorCount: config.errorCountThreshold || 5,
                timeWindow: config.timeWindowMs || 300000, // 5 minutes
                severity: config.severityThreshold || 'HIGH',
                failureRate: config.failureRateThreshold || 0.8
            },
            escalationLevels: config.escalationLevels || [
                'AUTOMATED_RETRY',
                'AUTOMATED_FIX',
                'CODEGEN_ASSISTANCE',
                'HUMAN_INTERVENTION',
                'SYSTEM_SHUTDOWN'
            ],
            codegenClient: config.codegenClient || null,
            linearClient: config.linearClient || null,
            alertingClient: config.alertingClient || null,
            ...config
        };
        
        this.escalationQueue = [];
        this.activeEscalations = new Map();
        this.escalationHistory = [];
        this.contextPreserver = new ContextPreserver();
        this.escalationRules = new Map();
        
        this._initializeEscalationRules();
    }

    /**
     * Evaluate if an error should be escalated
     * @param {Object} errorInfo - Classified error information
     * @param {Object} context - Error context
     * @param {Object} fixAttempts - Previous fix attempts
     * @returns {Promise<Object>} Escalation decision
     */
    async evaluateEscalation(errorInfo, context, fixAttempts = []) {
        const escalationContext = {
            errorInfo,
            context,
            fixAttempts,
            timestamp: new Date(),
            evaluationId: this._generateEscalationId()
        };

        log('debug', 'Evaluating escalation need', {
            errorType: errorInfo.type,
            severity: errorInfo.severity,
            fixAttempts: fixAttempts.length
        });

        // Check escalation rules
        const escalationDecision = await this._evaluateEscalationRules(escalationContext);
        
        if (escalationDecision.shouldEscalate) {
            return await this._initiateEscalation(escalationDecision, escalationContext);
        }

        return {
            shouldEscalate: false,
            reason: escalationDecision.reason,
            nextEvaluation: escalationDecision.nextEvaluation
        };
    }

    /**
     * Initiate escalation process
     * @param {Object} decision - Escalation decision
     * @param {Object} context - Escalation context
     * @returns {Promise<Object>} Escalation result
     * @private
     */
    async _initiateEscalation(decision, context) {
        const escalationId = context.evaluationId;
        
        log('info', `Initiating escalation ${escalationId}`, {
            level: decision.level,
            reason: decision.reason
        });

        // Preserve context for escalation
        const preservedContext = await this.contextPreserver.preserveContext(context);
        
        const escalation = {
            id: escalationId,
            level: decision.level,
            reason: decision.reason,
            context: preservedContext,
            status: 'INITIATED',
            createdAt: new Date(),
            updatedAt: new Date(),
            attempts: []
        };

        this.activeEscalations.set(escalationId, escalation);
        this.escalationQueue.push(escalation);

        // Execute escalation based on level
        const result = await this._executeEscalation(escalation);
        
        // Update escalation status
        escalation.status = result.success ? 'RESOLVED' : 'FAILED';
        escalation.result = result;
        escalation.updatedAt = new Date();

        // Move to history if completed
        if (escalation.status === 'RESOLVED' || escalation.status === 'FAILED') {
            this.escalationHistory.push(escalation);
            this.activeEscalations.delete(escalationId);
        }

        return {
            shouldEscalate: true,
            escalationId,
            level: decision.level,
            status: escalation.status,
            result
        };
    }

    /**
     * Execute escalation based on level
     * @param {Object} escalation - Escalation to execute
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeEscalation(escalation) {
        switch (escalation.level) {
            case 'AUTOMATED_RETRY':
                return await this._executeAutomatedRetry(escalation);
                
            case 'AUTOMATED_FIX':
                return await this._executeAutomatedFix(escalation);
                
            case 'CODEGEN_ASSISTANCE':
                return await this._executeCodegenAssistance(escalation);
                
            case 'HUMAN_INTERVENTION':
                return await this._executeHumanIntervention(escalation);
                
            case 'SYSTEM_SHUTDOWN':
                return await this._executeSystemShutdown(escalation);
                
            default:
                return {
                    success: false,
                    error: `Unknown escalation level: ${escalation.level}`
                };
        }
    }

    /**
     * Execute automated retry escalation
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Result
     * @private
     */
    async _executeAutomatedRetry(escalation) {
        log('info', `Executing automated retry for escalation ${escalation.id}`);
        
        // This would integrate with the retry manager
        return {
            success: true,
            action: 'automated_retry',
            message: 'Automated retry strategy applied',
            details: {
                strategy: 'exponential_backoff',
                maxRetries: 5
            }
        };
    }

    /**
     * Execute automated fix escalation
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Result
     * @private
     */
    async _executeAutomatedFix(escalation) {
        log('info', `Executing automated fix for escalation ${escalation.id}`);
        
        // This would integrate with the automated fix generator
        return {
            success: true,
            action: 'automated_fix',
            message: 'Automated fix applied',
            details: {
                fixType: 'configuration_update',
                confidence: 0.8
            }
        };
    }

    /**
     * Execute codegen assistance escalation
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Result
     * @private
     */
    async _executeCodegenAssistance(escalation) {
        log('info', `Requesting codegen assistance for escalation ${escalation.id}`);
        
        if (!this.config.codegenClient) {
            return {
                success: false,
                error: 'Codegen client not configured'
            };
        }

        try {
            // Create detailed request for codegen
            const codegenRequest = await this._buildCodegenRequest(escalation);
            
            // Submit to codegen
            const codegenResponse = await this.config.codegenClient.requestAssistance(codegenRequest);
            
            // Create Linear ticket if configured
            let linearTicket = null;
            if (this.config.linearClient) {
                linearTicket = await this._createLinearTicket(escalation, codegenResponse);
            }
            
            return {
                success: true,
                action: 'codegen_assistance',
                message: 'Codegen assistance requested',
                details: {
                    requestId: codegenResponse.requestId,
                    linearTicket: linearTicket?.id,
                    estimatedResolution: codegenResponse.estimatedTime
                }
            };
            
        } catch (error) {
            log('error', 'Codegen assistance request failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute human intervention escalation
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Result
     * @private
     */
    async _executeHumanIntervention(escalation) {
        log('warning', `Human intervention required for escalation ${escalation.id}`);
        
        try {
            // Send alerts
            if (this.config.alertingClient) {
                await this.config.alertingClient.sendAlert({
                    severity: 'HIGH',
                    title: 'Human Intervention Required',
                    description: `Escalation ${escalation.id} requires human intervention`,
                    context: escalation.context,
                    escalationLevel: escalation.level
                });
            }
            
            // Create high-priority Linear ticket
            let linearTicket = null;
            if (this.config.linearClient) {
                linearTicket = await this._createUrgentLinearTicket(escalation);
            }
            
            return {
                success: true,
                action: 'human_intervention',
                message: 'Human intervention requested',
                details: {
                    alertSent: !!this.config.alertingClient,
                    linearTicket: linearTicket?.id,
                    urgency: 'HIGH'
                }
            };
            
        } catch (error) {
            log('error', 'Human intervention request failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute system shutdown escalation
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Result
     * @private
     */
    async _executeSystemShutdown(escalation) {
        log('critical', `System shutdown initiated for escalation ${escalation.id}`);
        
        try {
            // Send critical alerts
            if (this.config.alertingClient) {
                await this.config.alertingClient.sendAlert({
                    severity: 'CRITICAL',
                    title: 'System Shutdown Initiated',
                    description: `Critical escalation ${escalation.id} triggered system shutdown`,
                    context: escalation.context,
                    escalationLevel: escalation.level
                });
            }
            
            // Create critical Linear ticket
            if (this.config.linearClient) {
                await this._createCriticalLinearTicket(escalation);
            }
            
            // Note: Actual system shutdown would be implemented based on specific requirements
            
            return {
                success: true,
                action: 'system_shutdown',
                message: 'System shutdown initiated',
                details: {
                    reason: escalation.reason,
                    timestamp: new Date()
                }
            };
            
        } catch (error) {
            log('error', 'System shutdown execution failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build codegen assistance request
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Codegen request
     * @private
     */
    async _buildCodegenRequest(escalation) {
        const context = escalation.context;
        
        return {
            type: 'error_resolution',
            priority: this._mapSeverityToPriority(context.errorInfo.severity),
            title: `Error Resolution: ${context.errorInfo.type}`,
            description: this._buildErrorDescription(context),
            context: {
                error: context.errorInfo,
                environment: context.context,
                fixAttempts: context.fixAttempts,
                escalationReason: escalation.reason
            },
            requirements: [
                'Analyze the error and its context',
                'Provide a comprehensive fix strategy',
                'Implement necessary code changes',
                'Test the solution',
                'Document the resolution'
            ],
            metadata: {
                escalationId: escalation.id,
                originalTimestamp: context.timestamp,
                escalationLevel: escalation.level
            }
        };
    }

    /**
     * Create Linear ticket for codegen assistance
     * @param {Object} escalation - Escalation details
     * @param {Object} codegenResponse - Codegen response
     * @returns {Promise<Object>} Linear ticket
     * @private
     */
    async _createLinearTicket(escalation, codegenResponse) {
        const context = escalation.context;
        
        return await this.config.linearClient.createIssue({
            title: `[Escalation] ${context.errorInfo.type} - ${escalation.id}`,
            description: this._buildLinearDescription(escalation, codegenResponse),
            priority: this._mapSeverityToPriority(context.errorInfo.severity),
            labels: ['escalation', 'error-handling', context.errorInfo.category.toLowerCase()],
            assignee: 'codegen',
            metadata: {
                escalationId: escalation.id,
                errorType: context.errorInfo.type,
                codegenRequestId: codegenResponse.requestId
            }
        });
    }

    /**
     * Create urgent Linear ticket for human intervention
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Linear ticket
     * @private
     */
    async _createUrgentLinearTicket(escalation) {
        const context = escalation.context;
        
        return await this.config.linearClient.createIssue({
            title: `[URGENT] Human Intervention Required - ${escalation.id}`,
            description: this._buildUrgentLinearDescription(escalation),
            priority: 'URGENT',
            labels: ['urgent', 'human-intervention', 'escalation'],
            metadata: {
                escalationId: escalation.id,
                errorType: context.errorInfo.type,
                escalationLevel: escalation.level
            }
        });
    }

    /**
     * Create critical Linear ticket for system shutdown
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Linear ticket
     * @private
     */
    async _createCriticalLinearTicket(escalation) {
        const context = escalation.context;
        
        return await this.config.linearClient.createIssue({
            title: `[CRITICAL] System Shutdown - ${escalation.id}`,
            description: this._buildCriticalLinearDescription(escalation),
            priority: 'CRITICAL',
            labels: ['critical', 'system-shutdown', 'escalation'],
            metadata: {
                escalationId: escalation.id,
                errorType: context.errorInfo.type,
                shutdownReason: escalation.reason
            }
        });
    }

    /**
     * Evaluate escalation rules
     * @param {Object} context - Escalation context
     * @returns {Promise<Object>} Escalation decision
     * @private
     */
    async _evaluateEscalationRules(context) {
        const { errorInfo, fixAttempts } = context;
        
        // Rule 1: Too many failed fix attempts
        if (fixAttempts.length >= 3) {
            return {
                shouldEscalate: true,
                level: 'CODEGEN_ASSISTANCE',
                reason: `Multiple fix attempts failed (${fixAttempts.length})`
            };
        }
        
        // Rule 2: High severity errors
        if (errorInfo.severity === 'CRITICAL') {
            return {
                shouldEscalate: true,
                level: 'HUMAN_INTERVENTION',
                reason: 'Critical severity error detected'
            };
        }
        
        // Rule 3: Authentication/Security errors
        if (errorInfo.category === 'SECURITY') {
            return {
                shouldEscalate: true,
                level: 'HUMAN_INTERVENTION',
                reason: 'Security-related error requires human review'
            };
        }
        
        // Rule 4: Unknown error types
        if (errorInfo.type === 'UNKNOWN_ERROR' && errorInfo.confidence < 0.5) {
            return {
                shouldEscalate: true,
                level: 'CODEGEN_ASSISTANCE',
                reason: 'Unknown error type with low confidence'
            };
        }
        
        // Rule 5: Repeated errors in time window
        const recentErrors = await this._getRecentSimilarErrors(errorInfo);
        if (recentErrors.length >= this.config.escalationThresholds.errorCount) {
            return {
                shouldEscalate: true,
                level: 'AUTOMATED_FIX',
                reason: `Repeated errors (${recentErrors.length}) in time window`
            };
        }
        
        // Rule 6: Custom escalation rules
        for (const [ruleId, rule] of this.escalationRules.entries()) {
            if (await rule.evaluate(context)) {
                return {
                    shouldEscalate: true,
                    level: rule.escalationLevel,
                    reason: rule.reason,
                    ruleId
                };
            }
        }
        
        return {
            shouldEscalate: false,
            reason: 'No escalation criteria met',
            nextEvaluation: new Date(Date.now() + 60000) // Check again in 1 minute
        };
    }

    /**
     * Get recent similar errors
     * @param {Object} errorInfo - Error to match
     * @returns {Promise<Array>} Recent similar errors
     * @private
     */
    async _getRecentSimilarErrors(errorInfo) {
        const timeWindow = this.config.escalationThresholds.timeWindow;
        const cutoff = new Date(Date.now() - timeWindow);
        
        return this.escalationHistory.filter(escalation => {
            return escalation.createdAt > cutoff &&
                   escalation.context.errorInfo.type === errorInfo.type;
        });
    }

    /**
     * Initialize escalation rules
     * @private
     */
    _initializeEscalationRules() {
        // Database connection errors
        this.escalationRules.set('database_connection', {
            evaluate: async (context) => {
                return context.errorInfo.type === 'DATABASE_ERROR' &&
                       context.errorInfo.message.includes('connection');
            },
            escalationLevel: 'AUTOMATED_FIX',
            reason: 'Database connection error detected'
        });
        
        // Memory/Resource errors
        this.escalationRules.set('resource_exhaustion', {
            evaluate: async (context) => {
                return context.errorInfo.message.includes('memory') ||
                       context.errorInfo.message.includes('resource');
            },
            escalationLevel: 'HUMAN_INTERVENTION',
            reason: 'Resource exhaustion detected'
        });
        
        // Code generation failures
        this.escalationRules.set('codegen_failure', {
            evaluate: async (context) => {
                return context.errorInfo.type === 'CODEGEN_ERROR' &&
                       context.fixAttempts.length >= 2;
            },
            escalationLevel: 'HUMAN_INTERVENTION',
            reason: 'Code generation consistently failing'
        });
    }

    /**
     * Build error description for codegen
     * @param {Object} context - Error context
     * @returns {string} Description
     * @private
     */
    _buildErrorDescription(context) {
        const { errorInfo, fixAttempts } = context;
        
        return `
## Error Details
- **Type**: ${errorInfo.type}
- **Category**: ${errorInfo.category}
- **Severity**: ${errorInfo.severity}
- **Message**: ${errorInfo.message}
- **Confidence**: ${errorInfo.confidence}

## Context
${JSON.stringify(context.context, null, 2)}

## Previous Fix Attempts
${fixAttempts.map((attempt, i) => `
### Attempt ${i + 1}
- **Type**: ${attempt.type}
- **Result**: ${attempt.success ? 'Success' : 'Failed'}
- **Details**: ${attempt.details || 'No details available'}
`).join('\n')}

## Escalation Reason
This error has been escalated due to repeated failures or high severity.
        `.trim();
    }

    /**
     * Build Linear description
     * @param {Object} escalation - Escalation details
     * @param {Object} codegenResponse - Codegen response
     * @returns {string} Description
     * @private
     */
    _buildLinearDescription(escalation, codegenResponse) {
        return `
## Escalation Details
- **ID**: ${escalation.id}
- **Level**: ${escalation.level}
- **Reason**: ${escalation.reason}
- **Created**: ${escalation.createdAt.toISOString()}

## Codegen Request
- **Request ID**: ${codegenResponse.requestId}
- **Estimated Resolution**: ${codegenResponse.estimatedTime}

## Error Information
${this._buildErrorDescription(escalation.context)}
        `.trim();
    }

    /**
     * Build urgent Linear description
     * @param {Object} escalation - Escalation details
     * @returns {string} Description
     * @private
     */
    _buildUrgentLinearDescription(escalation) {
        return `
# 🚨 URGENT: Human Intervention Required

## Escalation Details
- **ID**: ${escalation.id}
- **Level**: ${escalation.level}
- **Reason**: ${escalation.reason}
- **Created**: ${escalation.createdAt.toISOString()}

## Immediate Action Required
This error requires immediate human attention due to its severity or repeated failures.

${this._buildErrorDescription(escalation.context)}
        `.trim();
    }

    /**
     * Build critical Linear description
     * @param {Object} escalation - Escalation details
     * @returns {string} Description
     * @private
     */
    _buildCriticalLinearDescription(escalation) {
        return `
# 🔥 CRITICAL: System Shutdown Initiated

## Escalation Details
- **ID**: ${escalation.id}
- **Level**: ${escalation.level}
- **Reason**: ${escalation.reason}
- **Shutdown Time**: ${new Date().toISOString()}

## Critical System Event
The system has initiated a shutdown procedure due to critical errors.

${this._buildErrorDescription(escalation.context)}
        `.trim();
    }

    /**
     * Map severity to priority
     * @param {string} severity - Error severity
     * @returns {string} Priority level
     * @private
     */
    _mapSeverityToPriority(severity) {
        const mapping = {
            'LOW': 'LOW',
            'MEDIUM': 'MEDIUM',
            'HIGH': 'HIGH',
            'CRITICAL': 'URGENT'
        };
        
        return mapping[severity] || 'MEDIUM';
    }

    /**
     * Generate unique escalation ID
     * @returns {string} Escalation ID
     * @private
     */
    _generateEscalationId() {
        return `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get escalation statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const totalEscalations = this.escalationHistory.length;
        const resolvedEscalations = this.escalationHistory.filter(e => e.status === 'RESOLVED').length;
        
        const levelStats = new Map();
        const reasonStats = new Map();
        
        for (const escalation of this.escalationHistory) {
            levelStats.set(escalation.level, (levelStats.get(escalation.level) || 0) + 1);
            reasonStats.set(escalation.reason, (reasonStats.get(escalation.reason) || 0) + 1);
        }
        
        return {
            totalEscalations,
            activeEscalations: this.activeEscalations.size,
            resolvedEscalations,
            resolutionRate: totalEscalations > 0 ? resolvedEscalations / totalEscalations : 0,
            escalationsByLevel: Object.fromEntries(levelStats),
            escalationsByReason: Object.fromEntries(reasonStats),
            queueSize: this.escalationQueue.length
        };
    }

    /**
     * Get active escalations
     * @returns {Array} Active escalations
     */
    getActiveEscalations() {
        return Array.from(this.activeEscalations.values());
    }

    /**
     * Get escalation by ID
     * @param {string} escalationId - Escalation ID
     * @returns {Object|null} Escalation details
     */
    getEscalation(escalationId) {
        return this.activeEscalations.get(escalationId) ||
               this.escalationHistory.find(e => e.id === escalationId);
    }

    /**
     * Cancel active escalation
     * @param {string} escalationId - Escalation ID
     * @returns {boolean} Success status
     */
    cancelEscalation(escalationId) {
        const escalation = this.activeEscalations.get(escalationId);
        if (escalation) {
            escalation.status = 'CANCELLED';
            escalation.updatedAt = new Date();
            
            this.escalationHistory.push(escalation);
            this.activeEscalations.delete(escalationId);
            
            log('info', `Escalation ${escalationId} cancelled`);
            return true;
        }
        
        return false;
    }
}

/**
 * Context Preserving utility for maintaining error context during escalation
 */
class ContextPreserver {
    /**
     * Preserve context for escalation
     * @param {Object} context - Original context
     * @returns {Promise<Object>} Preserved context
     */
    async preserveContext(context) {
        return {
            errorInfo: this._preserveErrorInfo(context.errorInfo),
            environment: this._preserveEnvironment(context.context),
            fixAttempts: this._preserveFixAttempts(context.fixAttempts),
            timestamp: context.timestamp,
            preservedAt: new Date(),
            metadata: {
                preservationVersion: '1.0',
                contextSize: JSON.stringify(context).length
            }
        };
    }

    /**
     * Preserve error information
     * @param {Object} errorInfo - Error info
     * @returns {Object} Preserved error info
     * @private
     */
    _preserveErrorInfo(errorInfo) {
        return {
            ...errorInfo,
            preservedFields: Object.keys(errorInfo),
            originalMessage: errorInfo.message,
            originalStack: errorInfo.stack
        };
    }

    /**
     * Preserve environment context
     * @param {Object} environment - Environment context
     * @returns {Object} Preserved environment
     * @private
     */
    _preserveEnvironment(environment) {
        return {
            ...environment,
            preservedAt: new Date(),
            sanitized: this._sanitizeEnvironment(environment)
        };
    }

    /**
     * Preserve fix attempts
     * @param {Array} fixAttempts - Fix attempts
     * @returns {Array} Preserved fix attempts
     * @private
     */
    _preserveFixAttempts(fixAttempts) {
        return fixAttempts.map(attempt => ({
            ...attempt,
            preservedAt: new Date(),
            originalTimestamp: attempt.timestamp
        }));
    }

    /**
     * Sanitize environment data
     * @param {Object} environment - Environment data
     * @returns {Object} Sanitized environment
     * @private
     */
    _sanitizeEnvironment(environment) {
        const sanitized = { ...environment };
        
        // Remove sensitive information
        const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }
}

export default EscalationManager;

