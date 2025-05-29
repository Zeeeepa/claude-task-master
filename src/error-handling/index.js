/**
 * @fileoverview Unified Error Handling & Recovery System
 * @description Consolidated error handling system that unifies all error handling,
 * recovery, and resilience components with zero redundancy
 */

// Core components
import { ErrorClassifier } from './core/ErrorClassifier.js';
import { RetryManager } from './core/RetryManager.js';
import { CircuitBreaker } from './core/CircuitBreaker.js';
import { ErrorReporter } from './core/ErrorReporter.js';

// Recovery components
import { AutomatedFixGenerator } from './recovery/AutomatedFixGenerator.js';
import { EscalationManager } from './recovery/EscalationManager.js';
import { RecoveryOrchestrator } from './recovery/RecoveryOrchestrator.js';

// Monitoring components
import { ErrorMonitor } from './monitoring/ErrorMonitor.js';
import { ErrorAnalytics } from './monitoring/ErrorAnalytics.js';
import { HealthMonitor } from './monitoring/HealthMonitor.js';

// Integration components
import { CodegenIntegration } from './integrations/CodegenIntegration.js';
import { LinearIntegration } from './integrations/LinearIntegration.js';
import { NotificationSystem } from './integrations/NotificationSystem.js';

// Configuration
import { ErrorHandlingConfig } from './config/ErrorHandlingConfig.js';

/**
 * Unified Error Handling System
 * Consolidates all error handling capabilities from PRs #45, #88, #90, #91, #93
 */
export class ErrorHandlingSystem {
    constructor(config = {}) {
        // Initialize configuration
        this.config = new ErrorHandlingConfig(config);
        
        // Initialize core components
        this.errorClassifier = new ErrorClassifier(this.config.classification);
        this.retryManager = new RetryManager(this.config.retry);
        this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
        this.errorReporter = new ErrorReporter(this.config.reporting);
        
        // Initialize recovery components
        this.automatedFixGenerator = new AutomatedFixGenerator(this.config.fixGeneration);
        this.escalationManager = new EscalationManager(this.config.escalation);
        this.recoveryOrchestrator = new RecoveryOrchestrator({
            errorClassifier: this.errorClassifier,
            retryManager: this.retryManager,
            fixGenerator: this.automatedFixGenerator,
            escalationManager: this.escalationManager
        });
        
        // Initialize monitoring components
        this.errorMonitor = new ErrorMonitor(this.config.monitoring);
        this.errorAnalytics = new ErrorAnalytics(this.config.analytics);
        this.healthMonitor = new HealthMonitor(this.config.health);
        
        // Initialize integrations
        this.codegenIntegration = new CodegenIntegration(this.config.integrations.codegen);
        this.linearIntegration = new LinearIntegration(this.config.integrations.linear);
        this.notificationSystem = new NotificationSystem(this.config.integrations.notifications);
        
        // Wire up component dependencies
        this._wireComponents();
        
        // Initialize system
        this._initialize();
    }

    /**
     * Main error handling entry point
     * Processes an error through the complete pipeline
     * @param {Error} error - The error to handle
     * @param {Object} context - Error context and options
     * @returns {Promise<Object>} Handling result
     */
    async handleError(error, context = {}) {
        const startTime = Date.now();
        const errorId = this._generateErrorId();
        
        try {
            // Step 1: Classify the error
            const classification = await this.classifyError(error, context);
            
            // Step 2: Record the error for monitoring
            this.errorMonitor.recordError({
                id: errorId,
                error,
                classification,
                context,
                timestamp: new Date()
            });
            
            // Step 3: Determine handling strategy
            const strategy = this._determineHandlingStrategy(classification, context);
            
            // Step 4: Execute handling strategy
            const result = await this._executeHandlingStrategy(
                error,
                classification,
                strategy,
                context,
                errorId
            );
            
            // Step 5: Record result and update analytics
            const processingTime = Date.now() - startTime;
            this.errorAnalytics.recordHandlingResult({
                errorId,
                classification,
                strategy,
                result,
                processingTime,
                context
            });
            
            return {
                success: result.success,
                errorId,
                classification,
                strategy: strategy.name,
                result,
                processingTime
            };
            
        } catch (handlingError) {
            // Handle errors in error handling (meta-error handling)
            const processingTime = Date.now() - startTime;
            
            this.errorReporter.reportCriticalError({
                originalError: error,
                handlingError,
                errorId,
                context,
                processingTime
            });
            
            return {
                success: false,
                errorId,
                error: handlingError.message,
                processingTime,
                fallback: true
            };
        }
    }

    /**
     * Classify an error using the unified classification system
     * @param {Error} error - Error to classify
     * @param {Object} context - Classification context
     * @returns {Promise<Object>} Classification result
     */
    async classifyError(error, context = {}) {
        return await this.errorClassifier.classify(error, context);
    }

    /**
     * Execute operation with retry logic and circuit breaker protection
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Execution options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const operationName = options.operationName || 'unknown_operation';
        
        // Check circuit breaker
        if (options.enableCircuitBreaker && this.circuitBreaker.isOpen(operationName)) {
            throw new Error(`Circuit breaker is open for operation: ${operationName}`);
        }
        
        try {
            // Execute with retry logic
            const result = await this.retryManager.executeWithRetry(operation, {
                ...options,
                onRetry: (attempt, error) => {
                    this.errorMonitor.recordRetryAttempt({
                        operationName,
                        attempt,
                        error,
                        timestamp: new Date()
                    });
                }
            });
            
            // Record success for circuit breaker
            if (options.enableCircuitBreaker) {
                this.circuitBreaker.recordSuccess(operationName);
            }
            
            return result;
            
        } catch (error) {
            // Record failure for circuit breaker
            if (options.enableCircuitBreaker) {
                this.circuitBreaker.recordFailure(operationName);
            }
            
            throw error;
        }
    }

    /**
     * Generate automated fix for an error
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Fix generation context
     * @returns {Promise<Object>} Fix generation result
     */
    async generateFix(errorInfo, context = {}) {
        return await this.automatedFixGenerator.generateFix(errorInfo, context);
    }

    /**
     * Escalate an error for resolution
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Escalation context
     * @returns {Promise<Object>} Escalation result
     */
    async escalateError(errorInfo, context = {}) {
        return await this.escalationManager.escalate(errorInfo, context);
    }

    /**
     * Execute operation with full resilience protection
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Resilience options
     * @returns {Promise<any>} Operation result
     */
    async executeWithResilience(operation, options = {}) {
        return await this.recoveryOrchestrator.executeWithResilience(operation, options);
    }

    /**
     * Get system health status
     * @returns {Object} System health information
     */
    getSystemHealth() {
        return {
            timestamp: new Date().toISOString(),
            overall: this._calculateOverallHealth(),
            components: {
                errorClassifier: this.errorClassifier.getHealth(),
                retryManager: this.retryManager.getHealth(),
                circuitBreaker: this.circuitBreaker.getHealth(),
                errorMonitor: this.errorMonitor.getHealth(),
                errorAnalytics: this.errorAnalytics.getHealth(),
                healthMonitor: this.healthMonitor.getHealth(),
                integrations: {
                    codegen: this.codegenIntegration.getHealth(),
                    linear: this.linearIntegration.getHealth(),
                    notifications: this.notificationSystem.getHealth()
                }
            },
            metrics: this._getSystemMetrics()
        };
    }

    /**
     * Get monitoring dashboard data
     * @returns {Object} Dashboard data
     */
    getDashboardData() {
        return {
            timestamp: new Date().toISOString(),
            summary: this._getDashboardSummary(),
            errorMetrics: this.errorMonitor.getMetrics(),
            analytics: this.errorAnalytics.getDashboardData(),
            health: this.healthMonitor.getDashboardData(),
            circuitBreakers: this.circuitBreaker.getAllStatus(),
            retryStats: this.retryManager.getStatistics()
        };
    }

    /**
     * Get error trends analysis
     * @param {string} timeRange - Time range for analysis
     * @returns {Object} Trend analysis
     */
    getErrorTrends(timeRange = '24h') {
        return this.errorAnalytics.getTrends(timeRange);
    }

    /**
     * Get comprehensive system statistics
     * @returns {Object} System statistics
     */
    getStatistics() {
        return {
            errorHandling: {
                totalErrors: this.errorMonitor.getTotalErrors(),
                errorsByCategory: this.errorAnalytics.getErrorsByCategory(),
                resolutionRate: this.errorAnalytics.getResolutionRate(),
                averageResolutionTime: this.errorAnalytics.getAverageResolutionTime()
            },
            retry: this.retryManager.getStatistics(),
            circuitBreaker: this.circuitBreaker.getStatistics(),
            escalation: this.escalationManager.getStatistics(),
            fixGeneration: this.automatedFixGenerator.getStatistics(),
            integrations: {
                codegen: this.codegenIntegration.getStatistics(),
                linear: this.linearIntegration.getStatistics(),
                notifications: this.notificationSystem.getStatistics()
            }
        };
    }

    /**
     * Format error response for external consumption
     * @param {Error} error - Error to format
     * @param {Object} classification - Error classification
     * @param {Object} options - Formatting options
     * @returns {Object} Formatted error response
     */
    formatErrorResponse(error, classification = null, options = {}) {
        return this.errorReporter.formatResponse(error, classification, options);
    }

    /**
     * Reset system state (useful for testing)
     */
    reset() {
        this.errorMonitor.reset();
        this.errorAnalytics.reset();
        this.retryManager.reset();
        this.circuitBreaker.reset();
        this.escalationManager.reset();
        this.automatedFixGenerator.reset();
    }

    /**
     * Gracefully shutdown the system
     */
    async shutdown() {
        await this.errorMonitor.shutdown();
        await this.errorAnalytics.shutdown();
        await this.healthMonitor.shutdown();
        await this.notificationSystem.shutdown();
    }

    // Private methods

    /**
     * Wire up component dependencies
     * @private
     */
    _wireComponents() {
        // Connect escalation manager to integrations
        this.escalationManager.setCodegenIntegration(this.codegenIntegration);
        this.escalationManager.setLinearIntegration(this.linearIntegration);
        this.escalationManager.setNotificationSystem(this.notificationSystem);
        
        // Connect fix generator to integrations
        this.automatedFixGenerator.setCodegenIntegration(this.codegenIntegration);
        
        // Connect monitoring to analytics
        this.errorMonitor.setAnalytics(this.errorAnalytics);
        
        // Connect health monitor to all components
        this.healthMonitor.addComponent('errorClassifier', this.errorClassifier);
        this.healthMonitor.addComponent('retryManager', this.retryManager);
        this.healthMonitor.addComponent('circuitBreaker', this.circuitBreaker);
        this.healthMonitor.addComponent('errorMonitor', this.errorMonitor);
        this.healthMonitor.addComponent('errorAnalytics', this.errorAnalytics);
    }

    /**
     * Initialize the system
     * @private
     */
    async _initialize() {
        // Initialize components that require async setup
        await this.errorAnalytics.initialize();
        await this.healthMonitor.initialize();
        
        // Start monitoring
        if (this.config.monitoring.enableRealTimeMonitoring) {
            this.errorMonitor.startMonitoring();
        }
        
        if (this.config.health.enableHealthChecks) {
            this.healthMonitor.startHealthChecks();
        }
    }

    /**
     * Determine handling strategy based on classification
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @returns {Object} Handling strategy
     * @private
     */
    _determineHandlingStrategy(classification, context) {
        const strategies = {
            retry: { name: 'retry', priority: 1 },
            fix: { name: 'automated_fix', priority: 2 },
            escalate: { name: 'escalate', priority: 3 },
            fail: { name: 'fail_fast', priority: 4 }
        };

        // Determine strategy based on classification and context
        if (classification.retryable && context.enableRetry !== false) {
            return strategies.retry;
        }
        
        if (classification.fixable && context.enableFix !== false) {
            return strategies.fix;
        }
        
        if (classification.escalatable && context.enableEscalation !== false) {
            return strategies.escalate;
        }
        
        return strategies.fail;
    }

    /**
     * Execute the determined handling strategy
     * @param {Error} error - Original error
     * @param {Object} classification - Error classification
     * @param {Object} strategy - Handling strategy
     * @param {Object} context - Error context
     * @param {string} errorId - Error ID
     * @returns {Promise<Object>} Strategy execution result
     * @private
     */
    async _executeHandlingStrategy(error, classification, strategy, context, errorId) {
        switch (strategy.name) {
            case 'retry':
                return await this._executeRetryStrategy(error, classification, context, errorId);
                
            case 'automated_fix':
                return await this._executeFixStrategy(error, classification, context, errorId);
                
            case 'escalate':
                return await this._executeEscalationStrategy(error, classification, context, errorId);
                
            case 'fail_fast':
            default:
                return await this._executeFailStrategy(error, classification, context, errorId);
        }
    }

    /**
     * Execute retry strategy
     * @private
     */
    async _executeRetryStrategy(error, classification, context, errorId) {
        if (context.operation) {
            try {
                const result = await this.executeWithRetry(context.operation, {
                    ...context.retryOptions,
                    operationName: context.operationName || 'error_recovery',
                    enableCircuitBreaker: context.enableCircuitBreaker !== false
                });
                
                return { success: true, result, method: 'retry' };
            } catch (retryError) {
                // Retry failed, try next strategy
                return await this._executeFixStrategy(error, classification, context, errorId);
            }
        }
        
        return { success: false, reason: 'No operation provided for retry' };
    }

    /**
     * Execute automated fix strategy
     * @private
     */
    async _executeFixStrategy(error, classification, context, errorId) {
        try {
            const fix = await this.generateFix({ error, classification, errorId }, context);
            
            if (fix.success && fix.confidence >= this.config.fixGeneration.confidenceThreshold) {
                return { success: true, fix, method: 'automated_fix' };
            } else {
                // Fix generation failed or low confidence, escalate
                return await this._executeEscalationStrategy(error, classification, context, errorId);
            }
        } catch (fixError) {
            // Fix generation failed, escalate
            return await this._executeEscalationStrategy(error, classification, context, errorId);
        }
    }

    /**
     * Execute escalation strategy
     * @private
     */
    async _executeEscalationStrategy(error, classification, context, errorId) {
        try {
            const escalation = await this.escalateError(
                { error, classification, errorId },
                context
            );
            
            return { success: true, escalation, method: 'escalation' };
        } catch (escalationError) {
            // Escalation failed, fail fast
            return await this._executeFailStrategy(error, classification, context, errorId);
        }
    }

    /**
     * Execute fail fast strategy
     * @private
     */
    async _executeFailStrategy(error, classification, context, errorId) {
        // Record the failure
        this.errorReporter.reportFailure({
            error,
            classification,
            context,
            errorId,
            reason: 'No recovery strategy available'
        });
        
        return {
            success: false,
            method: 'fail_fast',
            reason: 'No recovery strategy available',
            error: error.message
        };
    }

    /**
     * Calculate overall system health
     * @private
     */
    _calculateOverallHealth() {
        const components = [
            this.errorClassifier,
            this.retryManager,
            this.circuitBreaker,
            this.errorMonitor,
            this.errorAnalytics,
            this.healthMonitor
        ];
        
        const healthyComponents = components.filter(
            component => component.getHealth().status === 'healthy'
        ).length;
        
        const healthPercentage = healthyComponents / components.length;
        
        if (healthPercentage >= 0.9) return 'healthy';
        if (healthPercentage >= 0.7) return 'degraded';
        return 'unhealthy';
    }

    /**
     * Get system metrics summary
     * @private
     */
    _getSystemMetrics() {
        return {
            totalErrors: this.errorMonitor.getTotalErrors(),
            errorRate: this.errorAnalytics.getCurrentErrorRate(),
            resolutionRate: this.errorAnalytics.getResolutionRate(),
            averageResolutionTime: this.errorAnalytics.getAverageResolutionTime(),
            circuitBreakerTrips: this.circuitBreaker.getTotalTrips(),
            retrySuccessRate: this.retryManager.getSuccessRate()
        };
    }

    /**
     * Get dashboard summary
     * @private
     */
    _getDashboardSummary() {
        const stats = this.getStatistics();
        
        return {
            totalErrors: stats.errorHandling.totalErrors,
            resolutionRate: stats.errorHandling.resolutionRate,
            averageResolutionTime: stats.errorHandling.averageResolutionTime,
            activeCircuitBreakers: stats.circuitBreaker.openCircuits,
            retrySuccessRate: stats.retry.successRate,
            escalationRate: stats.escalation.escalationRate
        };
    }

    /**
     * Generate unique error ID
     * @private
     */
    _generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export individual components for direct use
export {
    ErrorClassifier,
    RetryManager,
    CircuitBreaker,
    ErrorReporter,
    AutomatedFixGenerator,
    EscalationManager,
    RecoveryOrchestrator,
    ErrorMonitor,
    ErrorAnalytics,
    HealthMonitor,
    CodegenIntegration,
    LinearIntegration,
    NotificationSystem,
    ErrorHandlingConfig
};

// Export convenience functions
export function createErrorHandler(config = {}) {
    return new ErrorHandlingSystem(config);
}

export function handleError(error, context = {}) {
    const defaultHandler = new ErrorHandlingSystem();
    return defaultHandler.handleError(error, context);
}

// Export default instance for simple usage
export const defaultErrorHandler = new ErrorHandlingSystem();

export default ErrorHandlingSystem;

