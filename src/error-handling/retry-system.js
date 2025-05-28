/**
 * @fileoverview Intelligent Retry System
 * @description Retry system with exponential backoff and circuit breaker
 */

import { log } from '../scripts/modules/utils.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ErrorClassificationEngine } from './error-classifier.js';

/**
 * Retry system with exponential backoff and circuit breaker
 */
export class IntelligentRetrySystem {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            exponentialBase: config.exponentialBase || 2,
            jitterEnabled: config.jitterEnabled !== false,
            jitterRange: config.jitterRange || 0.1,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            ...config
        };

        this.circuitBreaker = new CircuitBreaker(config.circuitBreaker || {});
        this.errorClassifier = new ErrorClassificationEngine(config.classification || {});
        this.retryHistory = new Map();
        this.activeRetries = new Set();
    }

    /**
     * Execute operation with intelligent retry logic
     * @param {Function} operation - Operation to execute
     * @param {Object} context - Execution context
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, context = {}) {
        const operationId = context.operationId || this._generateOperationId();
        const operationType = context.operationType || 'unknown';
        
        let lastError;
        let attempt = 0;
        const startTime = Date.now();

        // Check if operation is already being retried
        if (this.activeRetries.has(operationId)) {
            throw new Error(`Operation ${operationId} is already being retried`);
        }

        this.activeRetries.add(operationId);

        try {
            while (attempt <= this.config.maxRetries) {
                try {
                    // Check circuit breaker before attempting
                    if (this.config.enableCircuitBreaker && this.circuitBreaker.isOpen(operationType)) {
                        throw new Error(`Circuit breaker is open for operation type: ${operationType}`);
                    }

                    log('debug', `Executing operation attempt ${attempt + 1}/${this.config.maxRetries + 1}`, {
                        operationId,
                        operationType,
                        attempt
                    });

                    const result = await operation();
                    
                    // Success - record and return
                    this.circuitBreaker.recordSuccess(operationType);
                    this._recordSuccess(operationId, attempt, Date.now() - startTime);
                    
                    log('info', `Operation succeeded on attempt ${attempt + 1}`, {
                        operationId,
                        operationType,
                        totalTime: Date.now() - startTime
                    });

                    return result;

                } catch (error) {
                    lastError = error;
                    attempt++;

                    // Classify the error
                    const classification = this.errorClassifier.classifyError(error, '', {
                        ...context,
                        attempt,
                        operationType
                    });

                    log('warn', `Operation failed on attempt ${attempt}`, {
                        operationId,
                        operationType,
                        error: error.message,
                        classification: {
                            category: classification.category,
                            type: classification.type,
                            retryable: classification.retryable,
                            confidence: classification.confidence
                        }
                    });

                    // Record failure in circuit breaker
                    this.circuitBreaker.recordFailure(operationType);

                    // Check if we should retry
                    if (!this._shouldRetry(classification, attempt, context)) {
                        break;
                    }

                    // Calculate delay for next attempt
                    const delay = this._calculateDelay(attempt, classification, context);
                    
                    log('info', `Retrying in ${delay}ms`, {
                        operationId,
                        operationType,
                        attempt,
                        nextAttempt: attempt + 1,
                        delay
                    });

                    await this._sleep(delay);
                }
            }

            // All retries exhausted - escalate
            const totalTime = Date.now() - startTime;
            this._recordFailure(operationId, attempt, totalTime, lastError);
            
            await this._escalateError(lastError, {
                ...context,
                operationId,
                operationType,
                attempts: attempt,
                totalTime
            });

            throw lastError;

        } finally {
            this.activeRetries.delete(operationId);
        }
    }

    /**
     * Determine if operation should be retried
     * @param {Object} classification - Error classification
     * @param {number} attempt - Current attempt number
     * @param {Object} context - Execution context
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetry(classification, attempt, context) {
        // Don't retry if we've exceeded max attempts
        if (attempt > this.config.maxRetries) {
            return false;
        }

        // Don't retry if error is not retryable
        if (!classification.retryable) {
            log('debug', 'Error is not retryable', {
                category: classification.category,
                type: classification.type
            });
            return false;
        }

        // Don't retry critical errors
        if (classification.severity === 'critical') {
            log('debug', 'Critical error - not retrying', {
                category: classification.category,
                type: classification.type
            });
            return false;
        }

        // Check circuit breaker state
        if (this.config.enableCircuitBreaker && this.circuitBreaker.isOpen(context.operationType)) {
            log('debug', 'Circuit breaker is open - not retrying', {
                operationType: context.operationType
            });
            return false;
        }

        return true;
    }

    /**
     * Calculate delay for next retry attempt
     * @param {number} attempt - Current attempt number
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt, classification, context) {
        let delay;

        // Use classification-specific delay if available
        if (classification.suggestedAction === 'retry_with_rate_limiting') {
            // Rate limit errors need longer delays
            delay = Math.min(this.config.baseDelay * Math.pow(3, attempt - 1), this.config.maxDelay);
        } else if (classification.category === 'transient' && classification.type === 'network') {
            // Network errors use standard exponential backoff
            delay = Math.min(
                this.config.baseDelay * Math.pow(this.config.exponentialBase, attempt - 1),
                this.config.maxDelay
            );
        } else if (classification.category === 'transient' && classification.type === 'resource') {
            // Resource errors need more time
            delay = Math.min(this.config.baseDelay * Math.pow(2.5, attempt - 1), this.config.maxDelay);
        } else {
            // Default exponential backoff
            delay = Math.min(
                this.config.baseDelay * Math.pow(this.config.exponentialBase, attempt - 1),
                this.config.maxDelay
            );
        }

        // Add jitter to prevent thundering herd
        if (this.config.jitterEnabled) {
            const jitter = delay * this.config.jitterRange * (Math.random() - 0.5);
            delay = Math.max(0, delay + jitter);
        }

        return Math.round(delay);
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Escalate error after all retries failed
     * @param {Error} error - Final error
     * @param {Object} context - Execution context
     * @private
     */
    async _escalateError(error, context) {
        const classification = this.errorClassifier.classifyError(error, '', context);
        
        const escalation = {
            error,
            context,
            classification,
            attempts: context.attempts,
            totalTime: context.totalTime,
            timestamp: new Date().toISOString(),
            escalationType: this._determineEscalationType(classification, context)
        };

        log('error', 'Escalating error after retry exhaustion', {
            operationId: context.operationId,
            operationType: context.operationType,
            escalationType: escalation.escalationType,
            attempts: context.attempts,
            totalTime: context.totalTime
        });

        switch (escalation.escalationType) {
            case 'codegen':
                await this._triggerCodegenFix(escalation);
                break;
            case 'manual':
                await this._notifyManualIntervention(escalation);
                break;
            case 'system_reset':
                await this._triggerSystemReset(escalation);
                break;
            case 'environment_reset':
                await this._triggerEnvironmentReset(escalation);
                break;
            default:
                log('warn', 'Unknown escalation type', { escalationType: escalation.escalationType });
        }
    }

    /**
     * Determine escalation type based on error classification
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {string} Escalation type
     * @private
     */
    _determineEscalationType(classification, context) {
        // Critical errors need immediate attention
        if (classification.severity === 'critical') {
            return 'manual';
        }

        // Code-related errors can be handled by Codegen
        if (['syntax', 'test', 'build', 'dependency'].includes(classification.type)) {
            return 'codegen';
        }

        // Configuration errors might need environment reset
        if (classification.type === 'configuration') {
            return 'environment_reset';
        }

        // System errors need system reset
        if (classification.category === 'critical' && classification.type === 'system') {
            return 'system_reset';
        }

        // High confidence persistent errors can be handled by Codegen
        if (classification.category === 'persistent' && classification.confidence > 0.8) {
            return 'codegen';
        }

        // Default to manual intervention
        return 'manual';
    }

    /**
     * Trigger Codegen for AI-powered error resolution
     * @param {Object} escalation - Escalation details
     * @private
     */
    async _triggerCodegenFix(escalation) {
        log('info', 'Triggering Codegen for error resolution', {
            operationId: escalation.context.operationId,
            errorType: escalation.classification.type
        });

        // This would integrate with the Codegen API
        // For now, we'll just log the intent
        // TODO: Implement actual Codegen integration
    }

    /**
     * Notify for manual intervention
     * @param {Object} escalation - Escalation details
     * @private
     */
    async _notifyManualIntervention(escalation) {
        log('warn', 'Manual intervention required', {
            operationId: escalation.context.operationId,
            errorType: escalation.classification.type,
            severity: escalation.classification.severity
        });

        // This would send notifications via configured channels
        // TODO: Implement notification system integration
    }

    /**
     * Trigger system reset
     * @param {Object} escalation - Escalation details
     * @private
     */
    async _triggerSystemReset(escalation) {
        log('warn', 'Triggering system reset', {
            operationId: escalation.context.operationId,
            errorType: escalation.classification.type
        });

        // This would trigger system-level recovery
        // TODO: Implement system reset procedures
    }

    /**
     * Trigger environment reset
     * @param {Object} escalation - Escalation details
     * @private
     */
    async _triggerEnvironmentReset(escalation) {
        log('info', 'Triggering environment reset', {
            operationId: escalation.context.operationId,
            errorType: escalation.classification.type
        });

        // This would reset the deployment environment
        // TODO: Implement environment reset procedures
    }

    /**
     * Record successful operation
     * @param {string} operationId - Operation ID
     * @param {number} attempts - Number of attempts
     * @param {number} totalTime - Total execution time
     * @private
     */
    _recordSuccess(operationId, attempts, totalTime) {
        const history = this.retryHistory.get(operationId) || { attempts: [], outcomes: [] };
        history.outcomes.push({
            success: true,
            attempts: attempts + 1,
            totalTime,
            timestamp: Date.now()
        });
        this.retryHistory.set(operationId, history);
    }

    /**
     * Record failed operation
     * @param {string} operationId - Operation ID
     * @param {number} attempts - Number of attempts
     * @param {number} totalTime - Total execution time
     * @param {Error} error - Final error
     * @private
     */
    _recordFailure(operationId, attempts, totalTime, error) {
        const history = this.retryHistory.get(operationId) || { attempts: [], outcomes: [] };
        history.outcomes.push({
            success: false,
            attempts,
            totalTime,
            error: error.message,
            timestamp: Date.now()
        });
        this.retryHistory.set(operationId, history);
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
     * Get retry statistics
     * @returns {Object} Retry statistics
     */
    getStatistics() {
        const stats = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageAttempts: 0,
            averageSuccessTime: 0,
            circuitBreakerStats: this.circuitBreaker.getStatistics(),
            classificationStats: this.errorClassifier.getStatistics()
        };

        let totalAttempts = 0;
        let totalSuccessTime = 0;
        let successCount = 0;

        for (const [operationId, history] of this.retryHistory.entries()) {
            stats.totalOperations += history.outcomes.length;
            
            for (const outcome of history.outcomes) {
                totalAttempts += outcome.attempts;
                
                if (outcome.success) {
                    stats.successfulOperations++;
                    totalSuccessTime += outcome.totalTime;
                    successCount++;
                } else {
                    stats.failedOperations++;
                }
            }
        }

        if (stats.totalOperations > 0) {
            stats.averageAttempts = totalAttempts / stats.totalOperations;
        }

        if (successCount > 0) {
            stats.averageSuccessTime = totalSuccessTime / successCount;
        }

        return stats;
    }

    /**
     * Get active retry operations
     * @returns {Array} Active operation IDs
     */
    getActiveRetries() {
        return Array.from(this.activeRetries);
    }

    /**
     * Cancel active retry operation
     * @param {string} operationId - Operation ID to cancel
     * @returns {boolean} Whether operation was cancelled
     */
    cancelRetry(operationId) {
        if (this.activeRetries.has(operationId)) {
            this.activeRetries.delete(operationId);
            log('info', 'Retry operation cancelled', { operationId });
            return true;
        }
        return false;
    }

    /**
     * Reset retry system state
     */
    reset() {
        this.retryHistory.clear();
        this.activeRetries.clear();
        this.circuitBreaker.reset();
        this.errorClassifier.resetLearningData();
    }
}

export default IntelligentRetrySystem;

