/**
 * @fileoverview Advanced Error Recovery
 * @description Intelligent retry strategies, fallback mechanisms, state recovery,
 *              and detailed error analysis for codegen operations
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Advanced error recovery with intelligent retry and fallback strategies
 */
export class AdvancedErrorRecovery {
    constructor(config = {}) {
        this.config = {
            max_retry_attempts: config.max_retry_attempts || 5,
            backoff_strategy: config.backoff_strategy || 'exponential',
            base_delay: config.base_delay || 1000,
            max_delay: config.max_delay || 30000,
            jitter: config.jitter !== false,
            fallback_providers: config.fallback_providers || [],
            state_persistence: config.state_persistence !== false,
            circuit_breaker: {
                failure_threshold: config.circuit_breaker?.failure_threshold || 5,
                recovery_timeout: config.circuit_breaker?.recovery_timeout || 60000,
                half_open_max_calls: config.circuit_breaker?.half_open_max_calls || 3
            },
            error_categorization: config.error_categorization !== false,
            ...config
        };

        // State tracking
        this.operationStates = new Map();
        this.retryAttempts = new Map();
        this.circuitBreakers = new Map();
        this.errorStatistics = new Map();
        this.fallbackUsage = new Map();

        // Error patterns for categorization
        this.errorPatterns = {
            network: [
                /ECONNREFUSED/,
                /ECONNABORTED/,
                /ETIMEDOUT/,
                /ENOTFOUND/,
                /socket hang up/i
            ],
            authentication: [
                /unauthorized/i,
                /invalid.*key/i,
                /authentication.*failed/i,
                /401/,
                /403/
            ],
            rate_limit: [
                /rate.*limit/i,
                /too.*many.*requests/i,
                /429/,
                /quota.*exceeded/i
            ],
            server_error: [
                /internal.*server.*error/i,
                /service.*unavailable/i,
                /502/,
                /503/,
                /504/
            ],
            validation: [
                /validation.*error/i,
                /invalid.*input/i,
                /bad.*request/i,
                /400/
            ],
            resource: [
                /not.*found/i,
                /does.*not.*exist/i,
                /404/
            ]
        };

        log('info', 'Advanced Error Recovery initialized');
    }

    /**
     * Initialize error recovery system
     */
    async initialize() {
        log('info', 'Initializing Advanced Error Recovery...');

        // Load persisted states if enabled
        if (this.config.state_persistence) {
            await this._loadPersistedStates();
        }

        // Initialize circuit breakers for fallback providers
        for (const provider of this.config.fallback_providers) {
            this.circuitBreakers.set(provider.name, {
                state: 'closed', // closed, open, half-open
                failures: 0,
                last_failure: null,
                half_open_calls: 0
            });
        }

        log('info', 'Advanced Error Recovery initialized');
    }

    /**
     * Execute operation with advanced error recovery
     * @param {Function} operation - Operation to execute
     * @param {Object} context - Operation context
     * @returns {Promise<any>} Operation result
     */
    async executeWithRecovery(operation, context = {}) {
        const operationId = context.operation_id || `op_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const operationType = context.operation || 'unknown';
        
        log('debug', `Executing operation ${operationId} with error recovery`);

        // Initialize operation state
        this.operationStates.set(operationId, {
            operation_type: operationType,
            started_at: new Date(),
            attempts: 0,
            errors: [],
            fallback_used: false,
            context: context
        });

        try {
            return await this._executeWithRetry(operation, operationId, context);
        } catch (error) {
            log('error', `Operation ${operationId} failed after all recovery attempts: ${error.message}`);
            
            // Update error statistics
            this._updateErrorStatistics(operationType, error);
            
            // Try fallback providers if available
            if (this.config.fallback_providers.length > 0) {
                return await this._tryFallbackProviders(operation, operationId, context, error);
            }

            throw error;
        } finally {
            // Persist state if enabled
            if (this.config.state_persistence) {
                await this._persistOperationState(operationId);
            }
        }
    }

    /**
     * Resume interrupted operation
     * @param {string} operationId - Operation ID to resume
     * @returns {Promise<any>} Operation result
     */
    async resumeOperation(operationId) {
        const state = this.operationStates.get(operationId);
        
        if (!state) {
            throw new Error(`Operation ${operationId} not found or cannot be resumed`);
        }

        if (state.status === 'completed') {
            log('info', `Operation ${operationId} already completed`);
            return state.result;
        }

        log('info', `Resuming operation ${operationId} from attempt ${state.attempts}`);
        
        // Reconstruct operation from state
        const operation = this._reconstructOperation(state);
        return await this.executeWithRecovery(operation, state.context);
    }

    /**
     * Get error recovery statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const totalOperations = this.operationStates.size;
        const completedOperations = Array.from(this.operationStates.values())
            .filter(state => state.status === 'completed').length;
        const failedOperations = Array.from(this.operationStates.values())
            .filter(state => state.status === 'failed').length;

        return {
            operations: {
                total: totalOperations,
                completed: completedOperations,
                failed: failedOperations,
                success_rate: totalOperations > 0 ? completedOperations / totalOperations : 0
            },
            retries: {
                total_attempts: Array.from(this.retryAttempts.values()).reduce((sum, attempts) => sum + attempts, 0),
                avg_attempts_per_operation: totalOperations > 0 
                    ? Array.from(this.retryAttempts.values()).reduce((sum, attempts) => sum + attempts, 0) / totalOperations 
                    : 0
            },
            errors: Object.fromEntries(this.errorStatistics),
            fallbacks: Object.fromEntries(this.fallbackUsage),
            circuit_breakers: Object.fromEntries(
                Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [
                    name, 
                    { state: breaker.state, failures: breaker.failures }
                ])
            )
        };
    }

    /**
     * Get success rate for error recovery
     * @returns {number} Success rate (0-1)
     */
    getSuccessRate() {
        const stats = this.getStatistics();
        return stats.operations.success_rate;
    }

    /**
     * Get fallback usage statistics
     * @returns {Object} Fallback statistics
     */
    getFallbackStatistics() {
        return Object.fromEntries(this.fallbackUsage);
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        const recentFailureRate = this._calculateRecentFailureRate();
        
        return {
            status: recentFailureRate < 0.5 ? 'healthy' : 'degraded',
            success_rate: stats.operations.success_rate,
            recent_failure_rate: recentFailureRate,
            active_operations: Array.from(this.operationStates.values())
                .filter(state => state.status === 'processing').length,
            circuit_breakers: Object.fromEntries(
                Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [
                    name, 
                    breaker.state
                ])
            )
        };
    }

    /**
     * Shutdown error recovery system
     */
    async shutdown() {
        log('info', 'Shutting down Advanced Error Recovery...');

        // Persist all states if enabled
        if (this.config.state_persistence) {
            await this._persistAllStates();
        }

        // Clear all tracking
        this.operationStates.clear();
        this.retryAttempts.clear();
        this.circuitBreakers.clear();
        this.errorStatistics.clear();
        this.fallbackUsage.clear();

        log('info', 'Advanced Error Recovery shut down');
    }

    // Private methods

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Operation to execute
     * @param {string} operationId - Operation ID
     * @param {Object} context - Operation context
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _executeWithRetry(operation, operationId, context) {
        const state = this.operationStates.get(operationId);
        let lastError;

        for (let attempt = 1; attempt <= this.config.max_retry_attempts; attempt++) {
            state.attempts = attempt;
            this.retryAttempts.set(operationId, attempt);

            try {
                log('debug', `Operation ${operationId} attempt ${attempt}/${this.config.max_retry_attempts}`);
                
                const result = await operation();
                
                // Success - update state and return
                state.status = 'completed';
                state.result = result;
                state.completed_at = new Date();
                
                log('debug', `Operation ${operationId} completed successfully on attempt ${attempt}`);
                return result;

            } catch (error) {
                lastError = error;
                state.errors.push({
                    attempt: attempt,
                    error: error.message,
                    error_type: this._categorizeError(error),
                    timestamp: new Date()
                });

                log('warning', `Operation ${operationId} attempt ${attempt} failed: ${error.message}`);

                // Don't retry on certain error types
                if (this._shouldNotRetry(error)) {
                    log('info', `Operation ${operationId} failed with non-retryable error: ${error.message}`);
                    break;
                }

                // Calculate delay for next attempt
                if (attempt < this.config.max_retry_attempts) {
                    const delay = this._calculateDelay(attempt);
                    log('debug', `Waiting ${delay}ms before retry attempt ${attempt + 1}`);
                    await this._sleep(delay);
                }
            }
        }

        // All attempts failed
        state.status = 'failed';
        state.final_error = lastError;
        state.completed_at = new Date();
        
        throw lastError;
    }

    /**
     * Try fallback providers
     * @param {Function} operation - Original operation
     * @param {string} operationId - Operation ID
     * @param {Object} context - Operation context
     * @param {Error} originalError - Original error
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _tryFallbackProviders(operation, operationId, context, originalError) {
        log('info', `Trying fallback providers for operation ${operationId}`);
        
        const state = this.operationStates.get(operationId);
        
        for (const provider of this.config.fallback_providers) {
            const circuitBreaker = this.circuitBreakers.get(provider.name);
            
            // Check circuit breaker state
            if (!this._canUseFallback(provider.name, circuitBreaker)) {
                log('debug', `Skipping fallback provider ${provider.name} (circuit breaker: ${circuitBreaker.state})`);
                continue;
            }

            try {
                log('info', `Attempting fallback with provider ${provider.name}`);
                
                // Create fallback operation
                const fallbackOperation = this._createFallbackOperation(operation, provider, context);
                const result = await fallbackOperation();
                
                // Success with fallback
                state.fallback_used = provider.name;
                state.status = 'completed';
                state.result = result;
                state.completed_at = new Date();
                
                // Update fallback usage statistics
                this.fallbackUsage.set(provider.name, 
                    (this.fallbackUsage.get(provider.name) || 0) + 1);
                
                // Reset circuit breaker on success
                circuitBreaker.failures = 0;
                circuitBreaker.state = 'closed';
                
                log('info', `Operation ${operationId} completed using fallback provider ${provider.name}`);
                return result;

            } catch (error) {
                log('warning', `Fallback provider ${provider.name} failed: ${error.message}`);
                
                // Update circuit breaker
                this._updateCircuitBreaker(provider.name, circuitBreaker);
                
                state.errors.push({
                    fallback_provider: provider.name,
                    error: error.message,
                    error_type: this._categorizeError(error),
                    timestamp: new Date()
                });
            }
        }

        // All fallbacks failed
        log('error', `All fallback providers failed for operation ${operationId}`);
        throw new Error(`Operation failed: ${originalError.message}. All fallback providers also failed.`);
    }

    /**
     * Calculate delay for retry attempt
     * @param {number} attempt - Attempt number
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt) {
        let delay;

        switch (this.config.backoff_strategy) {
            case 'linear':
                delay = this.config.base_delay * attempt;
                break;
            case 'exponential':
                delay = this.config.base_delay * Math.pow(2, attempt - 1);
                break;
            case 'fixed':
                delay = this.config.base_delay;
                break;
            default:
                delay = this.config.base_delay * Math.pow(2, attempt - 1);
        }

        // Apply jitter if enabled
        if (this.config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }

        // Ensure delay doesn't exceed maximum
        return Math.min(delay, this.config.max_delay);
    }

    /**
     * Categorize error type
     * @param {Error} error - Error to categorize
     * @returns {string} Error category
     * @private
     */
    _categorizeError(error) {
        const errorMessage = error.message || error.toString();
        
        for (const [category, patterns] of Object.entries(this.errorPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(errorMessage)) {
                    return category;
                }
            }
        }

        return 'unknown';
    }

    /**
     * Check if error should not be retried
     * @param {Error} error - Error to check
     * @returns {boolean} True if should not retry
     * @private
     */
    _shouldNotRetry(error) {
        const errorType = this._categorizeError(error);
        
        // Don't retry authentication, validation, or resource errors
        return ['authentication', 'validation', 'resource'].includes(errorType);
    }

    /**
     * Check if fallback provider can be used
     * @param {string} providerName - Provider name
     * @param {Object} circuitBreaker - Circuit breaker state
     * @returns {boolean} True if can use fallback
     * @private
     */
    _canUseFallback(providerName, circuitBreaker) {
        const now = Date.now();

        switch (circuitBreaker.state) {
            case 'closed':
                return true;
            
            case 'open':
                // Check if recovery timeout has passed
                if (now - circuitBreaker.last_failure > this.config.circuit_breaker.recovery_timeout) {
                    circuitBreaker.state = 'half-open';
                    circuitBreaker.half_open_calls = 0;
                    return true;
                }
                return false;
            
            case 'half-open':
                return circuitBreaker.half_open_calls < this.config.circuit_breaker.half_open_max_calls;
            
            default:
                return false;
        }
    }

    /**
     * Update circuit breaker state
     * @param {string} providerName - Provider name
     * @param {Object} circuitBreaker - Circuit breaker state
     * @private
     */
    _updateCircuitBreaker(providerName, circuitBreaker) {
        circuitBreaker.failures++;
        circuitBreaker.last_failure = Date.now();

        if (circuitBreaker.state === 'half-open') {
            circuitBreaker.half_open_calls++;
        }

        // Open circuit breaker if failure threshold reached
        if (circuitBreaker.failures >= this.config.circuit_breaker.failure_threshold) {
            circuitBreaker.state = 'open';
            log('warning', `Circuit breaker opened for fallback provider ${providerName}`);
        }
    }

    /**
     * Create fallback operation
     * @param {Function} originalOperation - Original operation
     * @param {Object} provider - Fallback provider config
     * @param {Object} context - Operation context
     * @returns {Function} Fallback operation
     * @private
     */
    _createFallbackOperation(originalOperation, provider, context) {
        return async () => {
            // Modify context for fallback provider
            const fallbackContext = {
                ...context,
                fallback_provider: provider.name,
                fallback_config: provider.config || {}
            };

            // Execute with fallback provider
            if (provider.operation) {
                return await provider.operation(fallbackContext);
            } else {
                // Use original operation with modified context
                return await originalOperation(fallbackContext);
            }
        };
    }

    /**
     * Update error statistics
     * @param {string} operationType - Operation type
     * @param {Error} error - Error that occurred
     * @private
     */
    _updateErrorStatistics(operationType, error) {
        const errorType = this._categorizeError(error);
        const key = `${operationType}_${errorType}`;
        
        this.errorStatistics.set(key, (this.errorStatistics.get(key) || 0) + 1);
    }

    /**
     * Calculate recent failure rate
     * @returns {number} Recent failure rate
     * @private
     */
    _calculateRecentFailureRate() {
        const recentOperations = Array.from(this.operationStates.values())
            .filter(state => {
                const age = Date.now() - state.started_at.getTime();
                return age < 300000; // Last 5 minutes
            });

        if (recentOperations.length === 0) return 0;

        const failures = recentOperations.filter(state => state.status === 'failed').length;
        return failures / recentOperations.length;
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
     * Load persisted states
     * @private
     */
    async _loadPersistedStates() {
        // Implementation would depend on persistence mechanism
        // For now, this is a placeholder
        log('debug', 'Loading persisted operation states...');
    }

    /**
     * Persist operation state
     * @param {string} operationId - Operation ID
     * @private
     */
    async _persistOperationState(operationId) {
        // Implementation would depend on persistence mechanism
        // For now, this is a placeholder
        log('debug', `Persisting state for operation ${operationId}`);
    }

    /**
     * Persist all states
     * @private
     */
    async _persistAllStates() {
        // Implementation would depend on persistence mechanism
        // For now, this is a placeholder
        log('debug', 'Persisting all operation states...');
    }

    /**
     * Reconstruct operation from state
     * @param {Object} state - Operation state
     * @returns {Function} Reconstructed operation
     * @private
     */
    _reconstructOperation(state) {
        // This would need to be implemented based on how operations are serialized
        // For now, return a placeholder
        return async () => {
            throw new Error('Operation reconstruction not implemented');
        };
    }
}

export default AdvancedErrorRecovery;

