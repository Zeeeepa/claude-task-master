/**
 * @fileoverview Error Handling System
 * @description Main entry point for the comprehensive error handling system
 */

import { log } from '../scripts/modules/utils.js';
import { ErrorClassificationEngine } from './error-classifier.js';
import { IntelligentRetrySystem } from './retry-system.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { EscalationManager } from './escalation-manager.js';
import { RecoveryStrategies } from './recovery-strategies.js';
import { CodegenIntegration } from './codegen-integration.js';
import { EnvironmentReset } from './environment-reset.js';
import { NotificationSystem } from './notification-system.js';
import { ErrorAnalytics } from './error-analytics.js';
import { FailureTracking } from './failure-tracking.js';
import { ErrorReporting } from './reporting.js';

/**
 * Comprehensive error handling system with intelligent retry logic
 */
export class ErrorHandlingSystem {
    constructor(config = {}) {
        this.config = {
            enableRetry: config.enableRetry !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            enableEscalation: config.enableEscalation !== false,
            enableRecovery: config.enableRecovery !== false,
            enableCodegen: config.enableCodegen !== false,
            enableEnvironmentReset: config.enableEnvironmentReset !== false,
            enableNotifications: config.enableNotifications !== false,
            enableAnalytics: config.enableAnalytics !== false,
            enableTracking: config.enableTracking !== false,
            enableReporting: config.enableReporting !== false,
            ...config
        };

        this.isInitialized = false;
        this.components = {};
        
        this._initializeComponents();
    }

    /**
     * Initialize all error handling components
     * @private
     */
    _initializeComponents() {
        try {
            // Core classification engine
            this.components.classifier = new ErrorClassificationEngine(this.config.classification);

            // Retry system with circuit breaker
            if (this.config.enableRetry) {
                this.components.retrySystem = new IntelligentRetrySystem({
                    ...this.config.retry,
                    circuitBreaker: this.config.circuitBreaker
                });
            }

            // Escalation management
            if (this.config.enableEscalation) {
                this.components.escalationManager = new EscalationManager(this.config.escalation);
            }

            // Recovery strategies
            if (this.config.enableRecovery) {
                this.components.recoveryStrategies = new RecoveryStrategies(this.config.recovery);
            }

            // Codegen integration
            if (this.config.enableCodegen) {
                this.components.codegenIntegration = new CodegenIntegration(this.config.codegen);
            }

            // Environment reset
            if (this.config.enableEnvironmentReset) {
                this.components.environmentReset = new EnvironmentReset(this.config.environmentReset);
            }

            // Notification system
            if (this.config.enableNotifications) {
                this.components.notificationSystem = new NotificationSystem(this.config.notifications);
            }

            // Analytics and tracking
            if (this.config.enableAnalytics) {
                this.components.errorAnalytics = new ErrorAnalytics(this.config.analytics);
            }

            if (this.config.enableTracking) {
                this.components.failureTracking = new FailureTracking(this.config.tracking);
            }

            // Reporting
            if (this.config.enableReporting) {
                this.components.errorReporting = new ErrorReporting(this.config.reporting);
            }

            this.isInitialized = true;
            
            log('info', 'Error handling system initialized', {
                enabledComponents: Object.keys(this.components),
                config: this._getConfigSummary()
            });

        } catch (error) {
            log('error', 'Failed to initialize error handling system', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Handle error with comprehensive processing
     * @param {Error|string} error - Error to handle
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     */
    async handleError(error, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Error handling system not initialized');
        }

        const operationId = context.operationId || this._generateOperationId();
        const startTime = Date.now();

        log('info', 'Starting comprehensive error handling', {
            operationId,
            errorType: error.constructor?.name || 'Unknown',
            context: {
                environment: context.environment,
                operationType: context.operationType,
                component: context.component
            }
        });

        try {
            // 1. Classify the error
            const classification = this.components.classifier.classifyError(error, context.logs || '', context);
            
            // 2. Record for analytics and tracking
            if (this.components.errorAnalytics) {
                this.components.errorAnalytics.recordError(classification, context);
            }

            if (this.components.failureTracking) {
                this.components.failureTracking.startOperation(operationId, context);
            }

            // 3. Determine handling strategy
            const handlingStrategy = this._determineHandlingStrategy(classification, context);
            
            // 4. Execute handling strategy
            const result = await this._executeHandlingStrategy(handlingStrategy, {
                error,
                classification,
                context: { ...context, operationId },
                startTime
            });

            // 5. Record final result
            if (this.components.failureTracking) {
                if (result.success) {
                    this.components.failureTracking.recordSuccess(operationId, result);
                } else {
                    this.components.failureTracking.recordFailure(operationId, error, {
                        isFinalFailure: true,
                        handlingStrategy,
                        result
                    });
                }
            }

            const totalTime = Date.now() - startTime;
            
            log('info', 'Error handling completed', {
                operationId,
                success: result.success,
                strategy: handlingStrategy,
                totalTime,
                classification: {
                    type: classification.type,
                    category: classification.category,
                    severity: classification.severity
                }
            });

            return {
                ...result,
                operationId,
                classification,
                handlingStrategy,
                totalTime
            };

        } catch (handlingError) {
            const totalTime = Date.now() - startTime;
            
            log('error', 'Error handling failed', {
                operationId,
                error: handlingError.message,
                totalTime
            });

            if (this.components.failureTracking) {
                this.components.failureTracking.recordFailure(operationId, handlingError, {
                    isFinalFailure: true,
                    isHandlingError: true
                });
            }

            return {
                success: false,
                error: handlingError.message,
                operationId,
                totalTime,
                isHandlingError: true
            };
        }
    }

    /**
     * Determine handling strategy based on classification
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {string} Handling strategy
     * @private
     */
    _determineHandlingStrategy(classification, context) {
        // Critical errors need immediate escalation
        if (classification.severity === 'critical') {
            return 'immediate_escalation';
        }

        // Retryable errors go through retry system
        if (classification.retryable && this.components.retrySystem) {
            return 'intelligent_retry';
        }

        // Code-related errors can use recovery strategies
        if (['syntax', 'build', 'dependency', 'test'].includes(classification.type) && 
            this.components.recoveryStrategies) {
            return 'automated_recovery';
        }

        // Configuration errors might need environment reset
        if (classification.type === 'configuration' && 
            this.components.environmentReset) {
            return 'environment_reset';
        }

        // Default to escalation
        return 'escalation';
    }

    /**
     * Execute handling strategy
     * @param {string} strategy - Handling strategy
     * @param {Object} params - Strategy parameters
     * @returns {Promise<Object>} Strategy result
     * @private
     */
    async _executeHandlingStrategy(strategy, params) {
        const { error, classification, context } = params;

        switch (strategy) {
            case 'intelligent_retry':
                return await this._executeIntelligentRetry(error, classification, context);
                
            case 'automated_recovery':
                return await this._executeAutomatedRecovery(error, classification, context);
                
            case 'environment_reset':
                return await this._executeEnvironmentReset(error, classification, context);
                
            case 'immediate_escalation':
            case 'escalation':
                return await this._executeEscalation(error, classification, context, strategy === 'immediate_escalation');
                
            default:
                throw new Error(`Unknown handling strategy: ${strategy}`);
        }
    }

    /**
     * Execute intelligent retry strategy
     * @param {Error} error - Original error
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Retry result
     * @private
     */
    async _executeIntelligentRetry(error, classification, context) {
        if (!this.components.retrySystem) {
            throw new Error('Retry system not available');
        }

        try {
            // Create a mock operation that will fail to trigger retry logic
            const operation = async () => {
                throw error; // This will trigger the retry mechanism
            };

            const result = await this.components.retrySystem.executeWithRetry(operation, context);
            
            return {
                success: true,
                strategy: 'intelligent_retry',
                result,
                message: 'Operation succeeded after retry'
            };

        } catch (retryError) {
            // Retry exhausted, escalate
            log('warn', 'Retry strategy exhausted, escalating', {
                operationId: context.operationId,
                originalError: error.message,
                retryError: retryError.message
            });

            return await this._executeEscalation(error, classification, context, false);
        }
    }

    /**
     * Execute automated recovery strategy
     * @param {Error} error - Original error
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeAutomatedRecovery(error, classification, context) {
        if (!this.components.recoveryStrategies) {
            throw new Error('Recovery strategies not available');
        }

        const recoveryResult = await this.components.recoveryStrategies.executeRecovery(classification, context);
        
        if (recoveryResult.result === 'success') {
            return {
                success: true,
                strategy: 'automated_recovery',
                result: recoveryResult,
                message: 'Automated recovery completed successfully'
            };
        } else {
            // Recovery failed, escalate
            return await this._executeEscalation(error, classification, context, false);
        }
    }

    /**
     * Execute environment reset strategy
     * @param {Error} error - Original error
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeEnvironmentReset(error, classification, context) {
        if (!this.components.environmentReset) {
            throw new Error('Environment reset not available');
        }

        const escalation = {
            id: this._generateEscalationId(),
            operationId: context.operationId,
            error,
            classification,
            context,
            attempts: context.attempts || 1,
            totalTime: Date.now() - context.startTime
        };

        const resetResult = await this.components.environmentReset.resetEnvironment(escalation);
        
        if (resetResult.success) {
            return {
                success: true,
                strategy: 'environment_reset',
                result: resetResult,
                message: 'Environment reset completed successfully'
            };
        } else {
            // Reset failed, escalate
            return await this._executeEscalation(error, classification, context, false);
        }
    }

    /**
     * Execute escalation strategy
     * @param {Error} error - Original error
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @param {boolean} immediate - Whether this is immediate escalation
     * @returns {Promise<Object>} Escalation result
     * @private
     */
    async _executeEscalation(error, classification, context, immediate = false) {
        const escalation = {
            id: this._generateEscalationId(),
            operationId: context.operationId,
            error,
            classification,
            context,
            attempts: context.attempts || 1,
            totalTime: Date.now() - (context.startTime || Date.now()),
            priority: immediate ? 'critical' : this._determinePriority(classification, context)
        };

        // Send notification if enabled
        if (this.components.notificationSystem) {
            await this._sendErrorNotification(escalation);
        }

        // Execute escalation if enabled
        if (this.components.escalationManager) {
            const escalationResult = await this.components.escalationManager.escalateError(escalation);
            
            return {
                success: escalationResult.success,
                strategy: 'escalation',
                result: escalationResult,
                escalation,
                message: escalationResult.success ? 'Escalation completed' : 'Escalation failed'
            };
        }

        return {
            success: false,
            strategy: 'escalation',
            escalation,
            message: 'Escalation manager not available'
        };
    }

    /**
     * Send error notification
     * @param {Object} escalation - Escalation details
     * @private
     */
    async _sendErrorNotification(escalation) {
        try {
            const notification = {
                escalation,
                channels: this._getNotificationChannels(escalation.priority),
                priority: escalation.priority,
                template: 'error_escalation'
            };

            await this.components.notificationSystem.sendNotification(notification);
            
        } catch (notificationError) {
            log('warn', 'Failed to send error notification', {
                escalationId: escalation.id,
                error: notificationError.message
            });
        }
    }

    /**
     * Get notification channels based on priority
     * @param {string} priority - Error priority
     * @returns {Array} Notification channels
     * @private
     */
    _getNotificationChannels(priority) {
        const channelMap = {
            critical: ['slack', 'email', 'linear'],
            high: ['slack', 'linear'],
            medium: ['slack'],
            low: ['slack']
        };

        return channelMap[priority] || ['slack'];
    }

    /**
     * Determine priority based on classification and context
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {string} Priority level
     * @private
     */
    _determinePriority(classification, context) {
        if (classification.severity === 'critical') {
            return 'critical';
        }

        if (context.environment === 'production' && classification.severity === 'high') {
            return 'high';
        }

        if (classification.severity === 'high') {
            return 'medium';
        }

        return 'low';
    }

    /**
     * Get system statistics
     * @returns {Object} System statistics
     */
    getStatistics() {
        const stats = {
            system: {
                initialized: this.isInitialized,
                enabledComponents: Object.keys(this.components),
                config: this._getConfigSummary()
            }
        };

        // Collect statistics from each component
        for (const [name, component] of Object.entries(this.components)) {
            if (component.getStatistics) {
                stats[name] = component.getStatistics();
            }
        }

        return stats;
    }

    /**
     * Get system health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const health = {
            overall: 'healthy',
            components: {},
            issues: []
        };

        // Check each component health
        for (const [name, component] of Object.entries(this.components)) {
            try {
                if (component.getStatistics) {
                    const stats = component.getStatistics();
                    health.components[name] = {
                        status: 'healthy',
                        stats
                    };
                } else {
                    health.components[name] = {
                        status: 'unknown',
                        message: 'No health check available'
                    };
                }
            } catch (error) {
                health.components[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
                health.issues.push(`${name}: ${error.message}`);
            }
        }

        // Determine overall health
        const unhealthyComponents = Object.values(health.components)
            .filter(comp => comp.status === 'unhealthy');
        
        if (unhealthyComponents.length > 0) {
            health.overall = 'degraded';
        }

        if (unhealthyComponents.length > Object.keys(this.components).length / 2) {
            health.overall = 'unhealthy';
        }

        return health;
    }

    /**
     * Generate error report
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Generated report
     */
    async generateReport(options = {}) {
        if (!this.components.errorReporting) {
            throw new Error('Error reporting not enabled');
        }

        return await this.components.errorReporting.generateReport(options);
    }

    /**
     * Test Codegen connectivity
     * @returns {Promise<Object>} Test result
     */
    async testCodegenConnection() {
        if (!this.components.codegenIntegration) {
            return {
                success: false,
                error: 'Codegen integration not enabled'
            };
        }

        return await this.components.codegenIntegration.testConnection();
    }

    /**
     * Get configuration summary
     * @returns {Object} Configuration summary
     * @private
     */
    _getConfigSummary() {
        return {
            enableRetry: this.config.enableRetry,
            enableCircuitBreaker: this.config.enableCircuitBreaker,
            enableEscalation: this.config.enableEscalation,
            enableRecovery: this.config.enableRecovery,
            enableCodegen: this.config.enableCodegen,
            enableEnvironmentReset: this.config.enableEnvironmentReset,
            enableNotifications: this.config.enableNotifications,
            enableAnalytics: this.config.enableAnalytics,
            enableTracking: this.config.enableTracking,
            enableReporting: this.config.enableReporting
        };
    }

    /**
     * Generate unique operation ID
     * @returns {string} Operation ID
     * @private
     */
    _generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
     * Reset all components
     */
    reset() {
        for (const component of Object.values(this.components)) {
            if (component.reset) {
                component.reset();
            }
        }
        
        log('info', 'Error handling system reset');
    }

    /**
     * Stop all components
     */
    stop() {
        for (const component of Object.values(this.components)) {
            if (component.stop) {
                component.stop();
            }
        }
        
        this.isInitialized = false;
        log('info', 'Error handling system stopped');
    }
}

// Export all components for individual use
export {
    ErrorClassificationEngine,
    IntelligentRetrySystem,
    CircuitBreaker,
    EscalationManager,
    RecoveryStrategies,
    CodegenIntegration,
    EnvironmentReset,
    NotificationSystem,
    ErrorAnalytics,
    FailureTracking,
    ErrorReporting
};

export default ErrorHandlingSystem;

