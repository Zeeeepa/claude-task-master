/**
 * @fileoverview Unified Error Handler
 * @description Consolidated error handling from PRs #52, #55, #87
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Unified Error Handler
 * Handles errors with retry logic and categorization
 */
export class ErrorHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            exponentialBackoff: config.exponentialBackoff !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            retryableErrors: config.retryableErrors || [
                'NETWORK_ERROR',
                'TIMEOUT_ERROR',
                'RATE_LIMIT_EXCEEDED',
                'SERVER_ERROR'
            ],
            ...config
        };

        this.errorHistory = [];
        this.circuitBreakerState = 'closed'; // closed, open, half-open
        this.circuitBreakerOpenTime = null;
        
        log('debug', 'Error Handler initialized', {
            enabled: this.config.enabled,
            maxRetries: this.config.maxRetries
        });
    }

    async handleError(error, context = {}) {
        try {
            log('debug', 'Handling error', {
                error: error.message,
                type: error.constructor.name,
                context: context.type
            });

            // Record error
            this._recordError(error, context);

            // Check circuit breaker
            if (this._isCircuitBreakerOpen()) {
                throw new Error('Circuit breaker is open - too many recent failures');
            }

            // Categorize error
            const category = this._categorizeError(error);
            
            // Determine if retryable
            const isRetryable = this._isRetryableError(error, category);
            
            // Create enhanced error with context
            const enhancedError = this._enhanceError(error, {
                category,
                isRetryable,
                context,
                timestamp: new Date().toISOString()
            });

            this.emit('error:handled', {
                error: enhancedError,
                category,
                isRetryable,
                context
            });

            return enhancedError;

        } catch (handlingError) {
            log('error', 'Error in error handler', { error: handlingError.message });
            throw error; // Return original error if handling fails
        }
    }

    _categorizeError(error) {
        const message = error.message?.toLowerCase() || '';
        const code = error.code || error.statusCode;

        // Network errors
        if (message.includes('network') || message.includes('connection') || 
            message.includes('timeout') || code === 'ECONNREFUSED') {
            return 'NETWORK_ERROR';
        }

        // Authentication errors
        if (code === 401 || message.includes('unauthorized') || 
            message.includes('authentication')) {
            return 'AUTHENTICATION_ERROR';
        }

        // Rate limiting
        if (code === 429 || message.includes('rate limit') || 
            message.includes('too many requests')) {
            return 'RATE_LIMIT_EXCEEDED';
        }

        // Server errors
        if (code >= 500 || message.includes('server error') || 
            message.includes('internal error')) {
            return 'SERVER_ERROR';
        }

        // Validation errors
        if (code === 400 || code === 422 || message.includes('validation') || 
            message.includes('invalid')) {
            return 'VALIDATION_ERROR';
        }

        // Permission errors
        if (code === 403 || message.includes('forbidden') || 
            message.includes('permission')) {
            return 'PERMISSION_ERROR';
        }

        // Quota errors
        if (message.includes('quota') || message.includes('limit exceeded')) {
            return 'QUOTA_ERROR';
        }

        return 'UNKNOWN_ERROR';
    }

    _isRetryableError(error, category) {
        // Non-retryable categories
        const nonRetryableCategories = [
            'AUTHENTICATION_ERROR',
            'PERMISSION_ERROR',
            'VALIDATION_ERROR'
        ];

        if (nonRetryableCategories.includes(category)) {
            return false;
        }

        // Check against configured retryable errors
        return this.config.retryableErrors.includes(category);
    }

    _enhanceError(originalError, metadata) {
        const enhanced = new Error(originalError.message);
        enhanced.name = originalError.name;
        enhanced.stack = originalError.stack;
        enhanced.code = originalError.code;
        enhanced.statusCode = originalError.statusCode;
        
        // Add metadata
        enhanced.category = metadata.category;
        enhanced.isRetryable = metadata.isRetryable;
        enhanced.context = metadata.context;
        enhanced.timestamp = metadata.timestamp;
        enhanced.handledBy = 'CodegenErrorHandler';
        
        return enhanced;
    }

    _recordError(error, context) {
        const errorRecord = {
            error: error.message,
            type: error.constructor.name,
            code: error.code || error.statusCode,
            context: context.type || 'unknown',
            timestamp: Date.now()
        };

        this.errorHistory.push(errorRecord);

        // Keep only recent errors (last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.errorHistory = this.errorHistory.filter(record => 
            record.timestamp > oneHourAgo
        );

        // Check circuit breaker threshold
        this._checkCircuitBreaker();
    }

    _checkCircuitBreaker() {
        const recentErrors = this.errorHistory.filter(record => 
            Date.now() - record.timestamp < 300000 // Last 5 minutes
        );

        if (recentErrors.length >= this.config.circuitBreakerThreshold) {
            this.circuitBreakerState = 'open';
            this.circuitBreakerOpenTime = Date.now();
            
            log('warn', 'Circuit breaker opened due to high error rate', {
                errorCount: recentErrors.length,
                threshold: this.config.circuitBreakerThreshold
            });

            this.emit('circuit:breaker:opened', {
                errorCount: recentErrors.length,
                threshold: this.config.circuitBreakerThreshold
            });
        }
    }

    _isCircuitBreakerOpen() {
        if (this.circuitBreakerState === 'closed') {
            return false;
        }

        if (this.circuitBreakerState === 'open') {
            const timeSinceOpen = Date.now() - this.circuitBreakerOpenTime;
            
            if (timeSinceOpen >= this.config.circuitBreakerTimeout) {
                this.circuitBreakerState = 'half-open';
                log('info', 'Circuit breaker moved to half-open state');
                return false;
            }
            
            return true;
        }

        // half-open state - allow one request to test
        return false;
    }

    getStatistics() {
        const now = Date.now();
        const lastHour = this.errorHistory.filter(record => 
            now - record.timestamp < 3600000
        );
        const lastMinute = this.errorHistory.filter(record => 
            now - record.timestamp < 60000
        );

        return {
            totalErrors: this.errorHistory.length,
            errorsLastHour: lastHour.length,
            errorsLastMinute: lastMinute.length,
            circuitBreakerState: this.circuitBreakerState,
            circuitBreakerOpenTime: this.circuitBreakerOpenTime
        };
    }
}

