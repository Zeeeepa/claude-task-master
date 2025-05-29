/**
 * Error Handler Utility
 * Centralized error handling system for Task Master orchestrator
 * 
 * Provides structured error handling, classification, recovery strategies,
 * and comprehensive error reporting for system reliability.
 */

import { logger } from './logger.js';

/**
 * Custom error classes for different error types
 */
export class TaskMasterError extends Error {
    constructor(message, code = 'TASKMASTER_ERROR', details = {}) {
        super(message);
        this.name = 'TaskMasterError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date();
        this.isOperational = true;
    }
}

export class ValidationError extends TaskMasterError {
    constructor(message, field = null, value = null) {
        super(message, 'VALIDATION_ERROR', { field, value });
        this.name = 'ValidationError';
    }
}

export class ConfigurationError extends TaskMasterError {
    constructor(message, configKey = null) {
        super(message, 'CONFIGURATION_ERROR', { configKey });
        this.name = 'ConfigurationError';
    }
}

export class IntegrationError extends TaskMasterError {
    constructor(message, integration = null, statusCode = null) {
        super(message, 'INTEGRATION_ERROR', { integration, statusCode });
        this.name = 'IntegrationError';
    }
}

export class DatabaseError extends TaskMasterError {
    constructor(message, operation = null, table = null) {
        super(message, 'DATABASE_ERROR', { operation, table });
        this.name = 'DatabaseError';
    }
}

export class WorkflowError extends TaskMasterError {
    constructor(message, workflowId = null, step = null) {
        super(message, 'WORKFLOW_ERROR', { workflowId, step });
        this.name = 'WorkflowError';
    }
}

export class AgentError extends TaskMasterError {
    constructor(message, agentType = null, agentId = null) {
        super(message, 'AGENT_ERROR', { agentType, agentId });
        this.name = 'AgentError';
    }
}

/**
 * ErrorHandler class for centralized error management
 */
export class ErrorHandler {
    constructor(options = {}) {
        this.options = {
            logErrors: true,
            logLevel: 'error',
            includeStackTrace: process.env.NODE_ENV !== 'production',
            maxRetries: 3,
            retryDelay: 1000,
            enableRecovery: true,
            ...options
        };

        this.errorCounts = new Map();
        this.recoveryStrategies = new Map();
        this.errorListeners = new Set();

        this._setupDefaultRecoveryStrategies();
        this._setupProcessHandlers();
    }

    /**
     * Handle an error with appropriate logging and recovery
     * @param {Error} error - Error to handle
     * @param {Object} context - Additional context information
     * @returns {Promise<Object>} Error handling result
     */
    async handleError(error, context = {}) {
        try {
            // Normalize error to TaskMasterError if needed
            const normalizedError = this._normalizeError(error);
            
            // Add context to error
            normalizedError.context = context;
            
            // Log the error
            if (this.options.logErrors) {
                this._logError(normalizedError);
            }
            
            // Track error occurrence
            this._trackError(normalizedError);
            
            // Notify error listeners
            this._notifyListeners(normalizedError);
            
            // Attempt recovery if enabled
            let recoveryResult = null;
            if (this.options.enableRecovery) {
                recoveryResult = await this._attemptRecovery(normalizedError);
            }
            
            return {
                error: normalizedError,
                handled: true,
                recovery: recoveryResult,
                timestamp: new Date()
            };
        } catch (handlingError) {
            // Error in error handling - log and return basic result
            logger.error('Error in error handler:', handlingError);
            return {
                error: error,
                handled: false,
                recovery: null,
                handlingError: handlingError,
                timestamp: new Date()
            };
        }
    }

    /**
     * Wrap a function with error handling
     * @param {Function} fn - Function to wrap
     * @param {Object} context - Context for error handling
     * @returns {Function} Wrapped function
     */
    wrapFunction(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const result = await this.handleError(error, {
                    ...context,
                    functionName: fn.name,
                    arguments: args
                });
                
                // Re-throw if not recovered
                if (!result.recovery || !result.recovery.success) {
                    throw result.error;
                }
                
                return result.recovery.result;
            }
        };
    }

    /**
     * Wrap a class method with error handling
     * @param {Object} instance - Class instance
     * @param {string} methodName - Method name to wrap
     * @param {Object} context - Context for error handling
     */
    wrapMethod(instance, methodName, context = {}) {
        const originalMethod = instance[methodName];
        
        instance[methodName] = this.wrapFunction(originalMethod.bind(instance), {
            ...context,
            className: instance.constructor.name,
            methodName
        });
    }

    /**
     * Register a recovery strategy for a specific error type
     * @param {string} errorType - Error type or code
     * @param {Function} strategy - Recovery strategy function
     */
    registerRecoveryStrategy(errorType, strategy) {
        this.recoveryStrategies.set(errorType, strategy);
        logger.debug(`Registered recovery strategy for error type: ${errorType}`);
    }

    /**
     * Add an error listener
     * @param {Function} listener - Error listener function
     */
    addErrorListener(listener) {
        this.errorListeners.add(listener);
    }

    /**
     * Remove an error listener
     * @param {Function} listener - Error listener function
     */
    removeErrorListener(listener) {
        this.errorListeners.delete(listener);
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        const stats = {
            totalErrors: 0,
            byType: {},
            byCode: {},
            recent: []
        };

        for (const [key, count] of this.errorCounts) {
            stats.totalErrors += count;
            
            if (key.startsWith('type:')) {
                stats.byType[key.substring(5)] = count;
            } else if (key.startsWith('code:')) {
                stats.byCode[key.substring(5)] = count;
            }
        }

        return stats;
    }

    /**
     * Clear error statistics
     */
    clearStatistics() {
        this.errorCounts.clear();
    }

    /**
     * Normalize error to TaskMasterError
     * @param {Error} error - Error to normalize
     * @returns {TaskMasterError} Normalized error
     * @private
     */
    _normalizeError(error) {
        if (error instanceof TaskMasterError) {
            return error;
        }

        // Convert common error types
        if (error.name === 'ValidationError') {
            return new ValidationError(error.message);
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return new IntegrationError(error.message, 'network', error.code);
        }

        if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
            return new ValidationError('Invalid JSON format', 'json', error.message);
        }

        // Default to generic TaskMasterError
        return new TaskMasterError(error.message, error.code || 'UNKNOWN_ERROR', {
            originalError: error.name,
            stack: error.stack
        });
    }

    /**
     * Log error with appropriate level and formatting
     * @param {TaskMasterError} error - Error to log
     * @private
     */
    _logError(error) {
        const logData = {
            errorType: error.name,
            errorCode: error.code,
            message: error.message,
            details: error.details,
            context: error.context,
            timestamp: error.timestamp
        };

        if (this.options.includeStackTrace && error.stack) {
            logData.stack = error.stack;
        }

        logger[this.options.logLevel]('Error occurred:', logData);
    }

    /**
     * Track error occurrence for statistics
     * @param {TaskMasterError} error - Error to track
     * @private
     */
    _trackError(error) {
        const typeKey = `type:${error.name}`;
        const codeKey = `code:${error.code}`;

        this.errorCounts.set(typeKey, (this.errorCounts.get(typeKey) || 0) + 1);
        this.errorCounts.set(codeKey, (this.errorCounts.get(codeKey) || 0) + 1);
    }

    /**
     * Notify error listeners
     * @param {TaskMasterError} error - Error to notify about
     * @private
     */
    _notifyListeners(error) {
        for (const listener of this.errorListeners) {
            try {
                listener(error);
            } catch (listenerError) {
                logger.warn('Error in error listener:', listenerError);
            }
        }
    }

    /**
     * Attempt error recovery using registered strategies
     * @param {TaskMasterError} error - Error to recover from
     * @returns {Promise<Object|null>} Recovery result
     * @private
     */
    async _attemptRecovery(error) {
        // Try specific error type strategy first
        let strategy = this.recoveryStrategies.get(error.name);
        
        // Fall back to error code strategy
        if (!strategy) {
            strategy = this.recoveryStrategies.get(error.code);
        }

        // Fall back to generic strategy
        if (!strategy) {
            strategy = this.recoveryStrategies.get('default');
        }

        if (!strategy) {
            return null;
        }

        try {
            logger.debug(`Attempting recovery for error: ${error.name}`);
            const result = await strategy(error);
            
            if (result && result.success) {
                logger.info(`Successfully recovered from error: ${error.name}`);
            }
            
            return result;
        } catch (recoveryError) {
            logger.warn(`Recovery failed for error ${error.name}:`, recoveryError);
            return {
                success: false,
                error: recoveryError
            };
        }
    }

    /**
     * Setup default recovery strategies
     * @private
     */
    _setupDefaultRecoveryStrategies() {
        // Default retry strategy
        this.registerRecoveryStrategy('default', async (error) => {
            if (error.context && error.context.retryCount >= this.options.maxRetries) {
                return { success: false, reason: 'Max retries exceeded' };
            }

            // Simple delay before retry
            await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
            
            return {
                success: false,
                shouldRetry: true,
                retryDelay: this.options.retryDelay
            };
        });

        // Integration error recovery
        this.registerRecoveryStrategy('IntegrationError', async (error) => {
            logger.info(`Attempting to recover from integration error: ${error.details.integration}`);
            
            // Could implement specific recovery logic here
            // e.g., reconnect to service, refresh tokens, etc.
            
            return { success: false, reason: 'Integration recovery not implemented' };
        });

        // Configuration error recovery
        this.registerRecoveryStrategy('ConfigurationError', async (error) => {
            logger.warn(`Configuration error detected: ${error.details.configKey}`);
            
            // Could implement config reload or default value fallback
            
            return { success: false, reason: 'Configuration recovery not implemented' };
        });
    }

    /**
     * Setup process-level error handlers
     * @private
     */
    _setupProcessHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception:', error);
            this.handleError(error, { source: 'uncaughtException' });
            
            // Exit gracefully after logging
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            logger.error('Unhandled promise rejection:', error);
            this.handleError(error, { source: 'unhandledRejection', promise });
        });

        // Handle process warnings
        process.on('warning', (warning) => {
            logger.warn('Process warning:', {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });
    }
}

// Create and export singleton error handler instance
export const errorHandler = new ErrorHandler();

// Export utility functions
export const handleError = (error, context) => errorHandler.handleError(error, context);
export const wrapFunction = (fn, context) => errorHandler.wrapFunction(fn, context);
export const wrapMethod = (instance, methodName, context) => errorHandler.wrapMethod(instance, methodName, context);

export default ErrorHandler;

