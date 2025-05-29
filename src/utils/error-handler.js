/**
 * Error Handler - Centralized error handling utilities
 * Provides error categorization, routing, recovery mechanisms, and reporting
 */

import { EventEmitter } from 'events';
import { logger } from './logger.js';
import { configManager } from './config-manager.js';

class ErrorHandler extends EventEmitter {
    constructor() {
        super();
        this.errorCounts = new Map();
        this.errorHistory = [];
        this.maxHistorySize = 1000;
        this.recoveryStrategies = new Map();
        this.alertThresholds = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the error handler
     */
    initialize() {
        try {
            logger.info('Initializing error handler...');
            
            // Setup default recovery strategies
            this.setupDefaultRecoveryStrategies();
            
            // Setup default alert thresholds
            this.setupDefaultAlertThresholds();
            
            // Setup process error handlers
            this.setupProcessErrorHandlers();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Error handler initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize error handler:', error);
            throw error;
        }
    }

    /**
     * Setup default recovery strategies
     */
    setupDefaultRecoveryStrategies() {
        // Network errors
        this.addRecoveryStrategy('NetworkError', async (error, context) => {
            logger.warn('Network error detected, attempting retry', { error: error.message, context });
            
            const maxRetries = context.maxRetries || 3;
            const retryDelay = context.retryDelay || 1000;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await this.delay(retryDelay * attempt);
                    
                    if (context.retryFunction) {
                        const result = await context.retryFunction();
                        logger.info(`Network operation succeeded on attempt ${attempt}`);
                        return result;
                    }
                } catch (retryError) {
                    logger.warn(`Retry attempt ${attempt} failed:`, retryError.message);
                    
                    if (attempt === maxRetries) {
                        throw retryError;
                    }
                }
            }
        });

        // Database errors
        this.addRecoveryStrategy('DatabaseError', async (error, context) => {
            logger.warn('Database error detected', { error: error.message, context });
            
            if (error.message.includes('connection')) {
                // Connection error - try to reconnect
                logger.info('Attempting database reconnection...');
                
                if (context.reconnectFunction) {
                    try {
                        await context.reconnectFunction();
                        logger.info('Database reconnection successful');
                        return { recovered: true, action: 'reconnected' };
                    } catch (reconnectError) {
                        logger.error('Database reconnection failed:', reconnectError);
                        throw reconnectError;
                    }
                }
            }
            
            if (error.message.includes('timeout')) {
                // Timeout error - retry with longer timeout
                logger.info('Retrying database operation with extended timeout...');
                
                if (context.retryWithTimeout) {
                    try {
                        const result = await context.retryWithTimeout(context.timeout * 2);
                        logger.info('Database operation succeeded with extended timeout');
                        return result;
                    } catch (timeoutError) {
                        logger.error('Database operation failed even with extended timeout:', timeoutError);
                        throw timeoutError;
                    }
                }
            }
            
            throw error;
        });

        // Authentication errors
        this.addRecoveryStrategy('AuthenticationError', async (error, context) => {
            logger.warn('Authentication error detected', { error: error.message, context });
            
            if (context.refreshTokenFunction) {
                try {
                    logger.info('Attempting token refresh...');
                    await context.refreshTokenFunction();
                    
                    if (context.retryFunction) {
                        const result = await context.retryFunction();
                        logger.info('Operation succeeded after token refresh');
                        return result;
                    }
                    
                    return { recovered: true, action: 'token_refreshed' };
                } catch (refreshError) {
                    logger.error('Token refresh failed:', refreshError);
                    throw refreshError;
                }
            }
            
            throw error;
        });

        // Rate limit errors
        this.addRecoveryStrategy('RateLimitError', async (error, context) => {
            logger.warn('Rate limit error detected', { error: error.message, context });
            
            const retryAfter = context.retryAfter || this.extractRetryAfter(error) || 60000; // Default 1 minute
            
            logger.info(`Waiting ${retryAfter}ms before retry due to rate limiting...`);
            await this.delay(retryAfter);
            
            if (context.retryFunction) {
                try {
                    const result = await context.retryFunction();
                    logger.info('Operation succeeded after rate limit wait');
                    return result;
                } catch (retryError) {
                    logger.error('Operation failed after rate limit wait:', retryError);
                    throw retryError;
                }
            }
            
            return { recovered: true, action: 'rate_limit_waited' };
        });
    }

    /**
     * Setup default alert thresholds
     */
    setupDefaultAlertThresholds() {
        this.setAlertThreshold('NetworkError', 5, 300000); // 5 errors in 5 minutes
        this.setAlertThreshold('DatabaseError', 3, 180000); // 3 errors in 3 minutes
        this.setAlertThreshold('AuthenticationError', 2, 120000); // 2 errors in 2 minutes
        this.setAlertThreshold('UnhandledError', 1, 60000); // 1 error in 1 minute
    }

    /**
     * Setup process error handlers
     */
    setupProcessErrorHandlers() {
        // Uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleCriticalError('UncaughtException', error, {
                fatal: true,
                source: 'process'
            });
        });

        // Unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.handleCriticalError('UnhandledRejection', reason, {
                fatal: false,
                source: 'promise',
                promise: promise
            });
        });

        // Warning events
        process.on('warning', (warning) => {
            this.handleWarning(warning);
        });
    }

    /**
     * Handle an error with categorization and recovery
     */
    async handleError(error, context = {}) {
        try {
            // Categorize the error
            const errorCategory = this.categorizeError(error);
            
            // Record the error
            this.recordError(errorCategory, error, context);
            
            // Check alert thresholds
            this.checkAlertThresholds(errorCategory);
            
            // Attempt recovery
            const recoveryResult = await this.attemptRecovery(errorCategory, error, context);
            
            // Emit error event
            this.emit('errorHandled', {
                category: errorCategory,
                error,
                context,
                recoveryResult,
                timestamp: Date.now()
            });
            
            return recoveryResult;
            
        } catch (handlingError) {
            logger.error('Error in error handler:', handlingError);
            throw error; // Re-throw original error
        }
    }

    /**
     * Handle critical errors
     */
    handleCriticalError(type, error, context = {}) {
        const errorInfo = {
            type,
            message: error.message || String(error),
            stack: error.stack,
            context,
            timestamp: Date.now(),
            pid: process.pid
        };

        // Log critical error
        logger.error(`Critical error: ${type}`, errorInfo);
        
        // Record error
        this.recordError('CriticalError', error, context);
        
        // Emit critical error event
        this.emit('criticalError', errorInfo);
        
        // Send alert
        this.sendAlert('CriticalError', errorInfo);
        
        // Handle fatal errors
        if (context.fatal) {
            logger.error('Fatal error detected, initiating graceful shutdown...');
            this.emit('fatalError', errorInfo);
            
            // Give some time for cleanup
            setTimeout(() => {
                process.exit(1);
            }, 5000);
        }
    }

    /**
     * Handle warnings
     */
    handleWarning(warning) {
        const warningInfo = {
            name: warning.name,
            message: warning.message,
            stack: warning.stack,
            timestamp: Date.now()
        };

        logger.warn('Process warning:', warningInfo);
        this.emit('warning', warningInfo);
    }

    /**
     * Categorize error based on type and message
     */
    categorizeError(error) {
        if (!error) {
            return 'UnknownError';
        }

        const errorMessage = error.message || String(error);
        const errorName = error.name || error.constructor.name;

        // Network-related errors
        if (errorName.includes('Network') || 
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('fetch')) {
            return 'NetworkError';
        }

        // Database-related errors
        if (errorName.includes('Database') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('SQL') ||
            errorMessage.includes('query')) {
            return 'DatabaseError';
        }

        // Authentication-related errors
        if (errorName.includes('Auth') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('token') ||
            errorMessage.includes('credential')) {
            return 'AuthenticationError';
        }

        // Rate limiting errors
        if (errorMessage.includes('rate limit') ||
            errorMessage.includes('too many requests') ||
            error.status === 429) {
            return 'RateLimitError';
        }

        // Validation errors
        if (errorName.includes('Validation') ||
            errorMessage.includes('invalid') ||
            errorMessage.includes('required')) {
            return 'ValidationError';
        }

        // File system errors
        if (errorName.includes('ENOENT') ||
            errorName.includes('EACCES') ||
            errorMessage.includes('file') ||
            errorMessage.includes('directory')) {
            return 'FileSystemError';
        }

        // Configuration errors
        if (errorMessage.includes('config') ||
            errorMessage.includes('environment') ||
            errorMessage.includes('missing')) {
            return 'ConfigurationError';
        }

        return 'UnhandledError';
    }

    /**
     * Record error for tracking and analysis
     */
    recordError(category, error, context) {
        // Update error counts
        const currentCount = this.errorCounts.get(category) || 0;
        this.errorCounts.set(category, currentCount + 1);

        // Add to error history
        const errorRecord = {
            category,
            message: error.message || String(error),
            stack: error.stack,
            context,
            timestamp: Date.now()
        };

        this.errorHistory.push(errorRecord);

        // Trim history if too large
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.splice(0, this.errorHistory.length - this.maxHistorySize);
        }

        logger.debug(`Error recorded: ${category}`, { 
            count: this.errorCounts.get(category),
            error: error.message 
        });
    }

    /**
     * Attempt error recovery
     */
    async attemptRecovery(category, error, context) {
        const strategy = this.recoveryStrategies.get(category);
        
        if (!strategy) {
            logger.debug(`No recovery strategy found for error category: ${category}`);
            return { recovered: false, reason: 'No recovery strategy' };
        }

        try {
            logger.info(`Attempting recovery for ${category} error...`);
            const result = await strategy(error, context);
            
            logger.info(`Recovery successful for ${category} error`);
            return { recovered: true, result };
            
        } catch (recoveryError) {
            logger.error(`Recovery failed for ${category} error:`, recoveryError);
            return { recovered: false, error: recoveryError.message };
        }
    }

    /**
     * Add recovery strategy
     */
    addRecoveryStrategy(category, strategy) {
        this.recoveryStrategies.set(category, strategy);
        logger.debug(`Recovery strategy added for category: ${category}`);
    }

    /**
     * Set alert threshold
     */
    setAlertThreshold(category, count, timeWindow) {
        this.alertThresholds.set(category, { count, timeWindow });
        logger.debug(`Alert threshold set for ${category}: ${count} errors in ${timeWindow}ms`);
    }

    /**
     * Check alert thresholds
     */
    checkAlertThresholds(category) {
        const threshold = this.alertThresholds.get(category);
        
        if (!threshold) {
            return;
        }

        const now = Date.now();
        const recentErrors = this.errorHistory.filter(
            record => record.category === category && 
                     (now - record.timestamp) <= threshold.timeWindow
        );

        if (recentErrors.length >= threshold.count) {
            const alertInfo = {
                category,
                count: recentErrors.length,
                threshold: threshold.count,
                timeWindow: threshold.timeWindow,
                recentErrors: recentErrors.slice(-5) // Last 5 errors
            };

            logger.warn(`Alert threshold exceeded for ${category}`, alertInfo);
            this.sendAlert(category, alertInfo);
        }
    }

    /**
     * Send alert
     */
    sendAlert(category, alertInfo) {
        this.emit('alert', {
            category,
            alertInfo,
            timestamp: Date.now()
        });

        // Here you could integrate with external alerting systems
        // like Slack, email, PagerDuty, etc.
        logger.warn(`ALERT: ${category}`, alertInfo);
    }

    /**
     * Extract retry-after value from error
     */
    extractRetryAfter(error) {
        if (error.headers && error.headers['retry-after']) {
            const retryAfter = parseInt(error.headers['retry-after']);
            return isNaN(retryAfter) ? null : retryAfter * 1000; // Convert to milliseconds
        }
        
        if (error.retryAfter) {
            return error.retryAfter;
        }
        
        return null;
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get error statistics
     */
    getStats() {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        
        const recentErrors = this.errorHistory.filter(
            record => record.timestamp >= last24Hours
        );

        const categoryCounts = {};
        for (const [category, count] of this.errorCounts) {
            categoryCounts[category] = count;
        }

        return {
            totalErrors: this.errorHistory.length,
            recentErrors: recentErrors.length,
            categoryCounts,
            recoveryStrategies: Array.from(this.recoveryStrategies.keys()),
            alertThresholds: Object.fromEntries(this.alertThresholds),
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get recent errors
     */
    getRecentErrors(limit = 50) {
        return this.errorHistory.slice(-limit).map(record => ({
            category: record.category,
            message: record.message,
            timestamp: record.timestamp,
            context: record.context
        }));
    }

    /**
     * Clear error history
     */
    clearHistory() {
        this.errorHistory = [];
        this.errorCounts.clear();
        logger.info('Error history cleared');
    }

    /**
     * Create error wrapper for functions
     */
    wrap(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.handleError(error, context);
                throw error;
            }
        };
    }

    /**
     * Create error boundary for promises
     */
    boundary(promise, context = {}) {
        return promise.catch(async (error) => {
            await this.handleError(error, context);
            throw error;
        });
    }
}

export const errorHandler = new ErrorHandler();

// Initialize error handler
if (!errorHandler.isInitialized) {
    try {
        errorHandler.initialize();
    } catch (error) {
        console.error('Failed to initialize error handler:', error);
    }
}

export default ErrorHandler;

