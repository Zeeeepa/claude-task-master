/**
 * @fileoverview Enhanced Error Handling and Retry Mechanisms
 * @description Robust error handling with intelligent retry logic and circuit breaker patterns
 */

import { log } from './simple_logger.js';

/**
 * Enhanced error handler with retry logic and circuit breaker
 */
export class EnhancedErrorHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.circuitBreakerThreshold = options.circuitBreakerThreshold || 5;
        this.circuitBreakerTimeout = options.circuitBreakerTimeout || 60000;
        
        // Circuit breaker state
        this.circuitBreakers = new Map();
        this.retryAttempts = new Map();
    }

    /**
     * Execute function with retry logic and circuit breaker
     * @param {Function} fn - Function to execute
     * @param {string} operationName - Name of the operation for logging
     * @param {Object} options - Execution options
     * @returns {Promise<any>} Result of the function
     */
    async executeWithRetry(fn, operationName, options = {}) {
        const maxRetries = options.maxRetries || this.maxRetries;
        const retryableErrors = options.retryableErrors || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
        
        // Check circuit breaker
        if (this.isCircuitBreakerOpen(operationName)) {
            throw new Error(`Circuit breaker is open for operation: ${operationName}`);
        }

        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn();
                
                // Reset circuit breaker on success
                this.resetCircuitBreaker(operationName);
                
                if (attempt > 0) {
                    log('info', `Operation ${operationName} succeeded after ${attempt} retries`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Record failure for circuit breaker
                this.recordFailure(operationName);
                
                // Check if error is retryable
                if (!this.isRetryableError(error, retryableErrors)) {
                    log('error', `Non-retryable error in ${operationName}: ${error.message}`);
                    throw error;
                }
                
                // Don't retry on last attempt
                if (attempt === maxRetries) {
                    break;
                }
                
                const delay = this.calculateDelay(attempt);
                log('warn', `Attempt ${attempt + 1} failed for ${operationName}, retrying in ${delay}ms: ${error.message}`);
                
                await this.sleep(delay);
            }
        }
        
        log('error', `All retry attempts exhausted for ${operationName}: ${lastError.message}`);
        throw lastError;
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @param {string[]} retryableErrors - List of retryable error codes
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error, retryableErrors) {
        // Network errors
        if (error.code && retryableErrors.includes(error.code)) {
            return true;
        }
        
        // HTTP status codes that are retryable
        if (error.status) {
            const retryableStatuses = [408, 429, 500, 502, 503, 504];
            return retryableStatuses.includes(error.status);
        }
        
        // Timeout errors
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return true;
        }
        
        // Rate limit errors
        if (error.message && error.message.toLowerCase().includes('rate limit')) {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate exponential backoff delay
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt) {
        const delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        return Math.min(delay + jitter, this.maxDelay);
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Record failure for circuit breaker
     * @param {string} operationName - Name of the operation
     */
    recordFailure(operationName) {
        if (!this.circuitBreakers.has(operationName)) {
            this.circuitBreakers.set(operationName, {
                failures: 0,
                lastFailureTime: null,
                state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
            });
        }
        
        const breaker = this.circuitBreakers.get(operationName);
        breaker.failures++;
        breaker.lastFailureTime = Date.now();
        
        if (breaker.failures >= this.circuitBreakerThreshold) {
            breaker.state = 'OPEN';
            log('warn', `Circuit breaker opened for operation: ${operationName}`);
        }
    }

    /**
     * Check if circuit breaker is open
     * @param {string} operationName - Name of the operation
     * @returns {boolean} Whether circuit breaker is open
     */
    isCircuitBreakerOpen(operationName) {
        const breaker = this.circuitBreakers.get(operationName);
        if (!breaker || breaker.state === 'CLOSED') {
            return false;
        }
        
        if (breaker.state === 'OPEN') {
            // Check if timeout has passed
            if (Date.now() - breaker.lastFailureTime > this.circuitBreakerTimeout) {
                breaker.state = 'HALF_OPEN';
                log('info', `Circuit breaker half-opened for operation: ${operationName}`);
                return false;
            }
            return true;
        }
        
        return false;
    }

    /**
     * Reset circuit breaker on success
     * @param {string} operationName - Name of the operation
     */
    resetCircuitBreaker(operationName) {
        if (this.circuitBreakers.has(operationName)) {
            const breaker = this.circuitBreakers.get(operationName);
            breaker.failures = 0;
            breaker.state = 'CLOSED';
            breaker.lastFailureTime = null;
        }
    }

    /**
     * Get circuit breaker status
     * @param {string} operationName - Name of the operation
     * @returns {Object} Circuit breaker status
     */
    getCircuitBreakerStatus(operationName) {
        const breaker = this.circuitBreakers.get(operationName);
        if (!breaker) {
            return { state: 'CLOSED', failures: 0 };
        }
        
        return {
            state: breaker.state,
            failures: breaker.failures,
            lastFailureTime: breaker.lastFailureTime
        };
    }

    /**
     * Get all circuit breaker statuses
     * @returns {Object} All circuit breaker statuses
     */
    getAllCircuitBreakerStatuses() {
        const statuses = {};
        for (const [operationName, breaker] of this.circuitBreakers) {
            statuses[operationName] = {
                state: breaker.state,
                failures: breaker.failures,
                lastFailureTime: breaker.lastFailureTime
            };
        }
        return statuses;
    }
}

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation
 * @returns {Promise} Promise with timeout
 */
export function withTimeout(promise, timeoutMs, operationName = 'operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Timeout after ${timeoutMs}ms for ${operationName}`));
            }, timeoutMs);
        })
    ]);
}

/**
 * Validate input parameters
 * @param {Object} params - Parameters to validate
 * @param {Object} schema - Validation schema
 * @throws {Error} If validation fails
 */
export function validateInput(params, schema) {
    for (const [key, rules] of Object.entries(schema)) {
        const value = params[key];
        
        // Required check
        if (rules.required && (value === undefined || value === null)) {
            throw new Error(`Required parameter '${key}' is missing`);
        }
        
        // Type check
        if (value !== undefined && rules.type && typeof value !== rules.type) {
            throw new Error(`Parameter '${key}' must be of type ${rules.type}, got ${typeof value}`);
        }
        
        // Min/Max checks for numbers
        if (typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
                throw new Error(`Parameter '${key}' must be at least ${rules.min}, got ${value}`);
            }
            if (rules.max !== undefined && value > rules.max) {
                throw new Error(`Parameter '${key}' must be at most ${rules.max}, got ${value}`);
            }
        }
        
        // Length checks for strings and arrays
        if (value && (typeof value === 'string' || Array.isArray(value))) {
            if (rules.minLength !== undefined && value.length < rules.minLength) {
                throw new Error(`Parameter '${key}' must have at least ${rules.minLength} characters/items`);
            }
            if (rules.maxLength !== undefined && value.length > rules.maxLength) {
                throw new Error(`Parameter '${key}' must have at most ${rules.maxLength} characters/items`);
            }
        }
        
        // Pattern check for strings
        if (typeof value === 'string' && rules.pattern && !rules.pattern.test(value)) {
            throw new Error(`Parameter '${key}' does not match required pattern`);
        }
        
        // Custom validation function
        if (rules.validate && typeof rules.validate === 'function') {
            const result = rules.validate(value);
            if (result !== true) {
                throw new Error(`Parameter '${key}' validation failed: ${result}`);
            }
        }
    }
}

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .replace(/['"]/g, '') // Remove quotes
        .replace(/[;]/g, '') // Remove semicolons
        .replace(/--/g, '') // Remove SQL comment markers
        .trim();
}

/**
 * Create a safe execution context with error boundaries
 * @param {Function} fn - Function to execute safely
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result with error handling
 */
export async function safeExecute(fn, options = {}) {
    const startTime = Date.now();
    const operationName = options.operationName || 'unknown';
    const timeout = options.timeout || 30000;
    
    try {
        log('debug', `Starting safe execution of ${operationName}`);
        
        const result = await withTimeout(fn(), timeout, operationName);
        const duration = Date.now() - startTime;
        
        log('debug', `Safe execution of ${operationName} completed in ${duration}ms`);
        
        return {
            success: true,
            result,
            duration,
            error: null
        };
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        log('error', `Safe execution of ${operationName} failed after ${duration}ms: ${error.message}`);
        
        return {
            success: false,
            result: null,
            duration,
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code,
                status: error.status
            }
        };
    }
}

// Create default error handler instance
export const defaultErrorHandler = new EnhancedErrorHandler();

