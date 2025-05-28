/**
 * @fileoverview Central Error Handler
 * @description Comprehensive error handling and classification system for all CI/CD components
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Error categories for classification
 */
export const ErrorCategory = {
    NETWORK: 'network',
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    RATE_LIMIT: 'rate_limit',
    TIMEOUT: 'timeout',
    SERVER_ERROR: 'server_error',
    CLIENT_ERROR: 'client_error',
    VALIDATION: 'validation',
    CONFIGURATION: 'configuration',
    RESOURCE: 'resource',
    BUSINESS_LOGIC: 'business_logic',
    UNKNOWN: 'unknown'
};

/**
 * Error sources for tracking integration points
 */
export const ErrorSource = {
    POSTGRESQL: 'postgresql',
    LINEAR: 'linear',
    GITHUB: 'github',
    AGENT_API: 'agent_api',
    CLAUDE_CODE: 'claude_code',
    CODEGEN: 'codegen',
    SYSTEM: 'system'
};

/**
 * Central Error Handler with comprehensive error classification and recovery
 */
export class CentralErrorHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableRetry: config.enableRetry !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            enablePredictiveFailure: config.enablePredictiveFailure !== false,
            enableCorrelation: config.enableCorrelation !== false,
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            correlationWindow: config.correlationWindow || 300000, // 5 minutes
            predictionThreshold: config.predictionThreshold || 0.8,
            ...config
        };

        this.errorHistory = new Map(); // source -> errors[]
        this.errorPatterns = new Map(); // pattern -> occurrences
        this.correlationMatrix = new Map(); // source1-source2 -> correlation
        this.circuitBreakers = new Map(); // source -> CircuitBreaker
        this.errorStats = new ErrorStatistics();
        
        // Initialize circuit breakers for each source
        Object.values(ErrorSource).forEach(source => {
            this.circuitBreakers.set(source, new CircuitBreaker(this.config, source));
        });

        // Set up periodic analysis
        this.analysisInterval = setInterval(() => {
            this._performPeriodicAnalysis();
        }, 60000); // Every minute
    }

    /**
     * Handle and classify an error
     * @param {Error} error - The error to handle
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Error handling result
     */
    async handleError(error, context = {}) {
        const errorInfo = await this._classifyError(error, context);
        
        // Record error for analysis
        this._recordError(errorInfo);
        
        // Emit error event for monitoring
        this.emit('error', errorInfo);
        
        // Check circuit breaker
        const circuitBreaker = this.circuitBreakers.get(errorInfo.source);
        if (circuitBreaker && circuitBreaker.isOpen()) {
            const cbError = new Error(`Circuit breaker is open for ${errorInfo.source}`);
            cbError.code = 'CIRCUIT_BREAKER_OPEN';
            cbError.source = errorInfo.source;
            throw cbError;
        }

        // Perform correlation analysis
        if (this.config.enableCorrelation) {
            await this._analyzeCorrelation(errorInfo);
        }

        // Predictive failure detection
        if (this.config.enablePredictiveFailure) {
            await this._predictiveFailureDetection(errorInfo);
        }

        // Handle the error based on classification
        const handlingResult = await this._handleClassifiedError(errorInfo, context);
        
        // Update circuit breaker
        if (circuitBreaker) {
            if (handlingResult.success) {
                circuitBreaker.recordSuccess();
            } else {
                circuitBreaker.recordFailure();
            }
        }

        return handlingResult;
    }

    /**
     * Classify an error into category, severity, and source
     * @param {Error} error - The error to classify
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Error classification
     * @private
     */
    async _classifyError(error, context) {
        const classification = {
            id: this._generateErrorId(),
            timestamp: new Date(),
            originalError: error,
            message: error.message,
            stack: error.stack,
            context,
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.MEDIUM,
            source: context.source || ErrorSource.SYSTEM,
            retryable: false,
            delay: this.config.baseDelay,
            metadata: {}
        };

        // Classify by error properties
        if (error.code) {
            classification.code = error.code;
            classification.metadata.errorCode = error.code;
        }

        if (error.response) {
            classification.metadata.httpStatus = error.response.status;
            classification.metadata.httpStatusText = error.response.statusText;
        }

        // Network errors
        if (this._isNetworkError(error)) {
            classification.category = ErrorCategory.NETWORK;
            classification.severity = ErrorSeverity.HIGH;
            classification.retryable = true;
            classification.delay = 5000;
        }
        // Authentication errors
        else if (this._isAuthenticationError(error)) {
            classification.category = ErrorCategory.AUTHENTICATION;
            classification.severity = ErrorSeverity.HIGH;
            classification.retryable = false;
        }
        // Authorization errors
        else if (this._isAuthorizationError(error)) {
            classification.category = ErrorCategory.AUTHORIZATION;
            classification.severity = ErrorSeverity.HIGH;
            classification.retryable = false;
        }
        // Rate limit errors
        else if (this._isRateLimitError(error)) {
            classification.category = ErrorCategory.RATE_LIMIT;
            classification.severity = ErrorSeverity.MEDIUM;
            classification.retryable = true;
            classification.delay = 60000; // 1 minute
        }
        // Timeout errors
        else if (this._isTimeoutError(error)) {
            classification.category = ErrorCategory.TIMEOUT;
            classification.severity = ErrorSeverity.MEDIUM;
            classification.retryable = true;
            classification.delay = 10000;
        }
        // Server errors
        else if (this._isServerError(error)) {
            classification.category = ErrorCategory.SERVER_ERROR;
            classification.severity = ErrorSeverity.HIGH;
            classification.retryable = true;
            classification.delay = 15000;
        }
        // Client errors
        else if (this._isClientError(error)) {
            classification.category = ErrorCategory.CLIENT_ERROR;
            classification.severity = ErrorSeverity.MEDIUM;
            classification.retryable = false;
        }
        // Validation errors
        else if (this._isValidationError(error)) {
            classification.category = ErrorCategory.VALIDATION;
            classification.severity = ErrorSeverity.LOW;
            classification.retryable = false;
        }

        // Source-specific classification
        await this._classifyBySource(classification, context);

        return classification;
    }

    /**
     * Classify error by source
     * @param {Object} classification - Error classification
     * @param {Object} context - Error context
     * @private
     */
    async _classifyBySource(classification, context) {
        switch (classification.source) {
            case ErrorSource.POSTGRESQL:
                this._classifyPostgreSQLError(classification);
                break;
            case ErrorSource.LINEAR:
                this._classifyLinearError(classification);
                break;
            case ErrorSource.GITHUB:
                this._classifyGitHubError(classification);
                break;
            case ErrorSource.AGENT_API:
                this._classifyAgentAPIError(classification);
                break;
            case ErrorSource.CLAUDE_CODE:
                this._classifyClaudeCodeError(classification);
                break;
            case ErrorSource.CODEGEN:
                this._classifyCodegenError(classification);
                break;
        }
    }

    /**
     * Handle classified error with appropriate strategy
     * @param {Object} errorInfo - Classified error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleClassifiedError(errorInfo, context) {
        log('error', `Handling ${errorInfo.category} error from ${errorInfo.source}`, {
            errorId: errorInfo.id,
            severity: errorInfo.severity,
            retryable: errorInfo.retryable
        });

        // Emit specific error category event
        this.emit(`error:${errorInfo.category}`, errorInfo);
        this.emit(`error:${errorInfo.source}`, errorInfo);

        // Critical errors require immediate attention
        if (errorInfo.severity === ErrorSeverity.CRITICAL) {
            this.emit('critical-error', errorInfo);
        }

        return {
            success: false,
            error: errorInfo.originalError,
            classification: errorInfo,
            retryable: errorInfo.retryable,
            delay: errorInfo.delay,
            strategy: this._getRetryStrategy(errorInfo),
            recovery: await this._getRecoveryActions(errorInfo)
        };
    }

    /**
     * Get retry strategy based on error classification
     * @param {Object} errorInfo - Error information
     * @returns {string} Retry strategy
     * @private
     */
    _getRetryStrategy(errorInfo) {
        switch (errorInfo.category) {
            case ErrorCategory.RATE_LIMIT:
                return 'exponential_backoff';
            case ErrorCategory.NETWORK:
                return 'linear_backoff';
            case ErrorCategory.TIMEOUT:
                return 'increase_timeout';
            case ErrorCategory.SERVER_ERROR:
                return 'exponential_backoff';
            default:
                return 'fixed_delay';
        }
    }

    /**
     * Get recovery actions for error
     * @param {Object} errorInfo - Error information
     * @returns {Promise<Array>} Recovery actions
     * @private
     */
    async _getRecoveryActions(errorInfo) {
        const actions = [];

        switch (errorInfo.category) {
            case ErrorCategory.AUTHENTICATION:
                actions.push({
                    type: 'refresh_credentials',
                    description: 'Refresh authentication credentials',
                    automated: true
                });
                break;
            case ErrorCategory.NETWORK:
                actions.push({
                    type: 'check_connectivity',
                    description: 'Verify network connectivity',
                    automated: true
                });
                break;
            case ErrorCategory.RATE_LIMIT:
                actions.push({
                    type: 'implement_backoff',
                    description: 'Implement exponential backoff',
                    automated: true
                });
                break;
            case ErrorCategory.CONFIGURATION:
                actions.push({
                    type: 'validate_config',
                    description: 'Validate configuration settings',
                    automated: false
                });
                break;
        }

        return actions;
    }

    /**
     * Record error for analysis
     * @param {Object} errorInfo - Error information
     * @private
     */
    _recordError(errorInfo) {
        // Add to error history
        if (!this.errorHistory.has(errorInfo.source)) {
            this.errorHistory.set(errorInfo.source, []);
        }
        
        const sourceErrors = this.errorHistory.get(errorInfo.source);
        sourceErrors.push(errorInfo);
        
        // Keep only recent errors (last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.errorHistory.set(
            errorInfo.source,
            sourceErrors.filter(error => error.timestamp.getTime() > oneHourAgo)
        );

        // Record in statistics
        this.errorStats.recordError(errorInfo);

        // Update error patterns
        const pattern = `${errorInfo.source}:${errorInfo.category}:${errorInfo.code || 'unknown'}`;
        const count = this.errorPatterns.get(pattern) || 0;
        this.errorPatterns.set(pattern, count + 1);
    }

    /**
     * Analyze error correlation across sources
     * @param {Object} errorInfo - Current error information
     * @private
     */
    async _analyzeCorrelation(errorInfo) {
        const currentTime = errorInfo.timestamp.getTime();
        const correlationWindow = this.config.correlationWindow;

        // Check for correlated errors in other sources
        for (const [source, errors] of this.errorHistory.entries()) {
            if (source === errorInfo.source) continue;

            const recentErrors = errors.filter(error => 
                currentTime - error.timestamp.getTime() < correlationWindow
            );

            if (recentErrors.length > 0) {
                const correlationKey = `${errorInfo.source}-${source}`;
                const correlation = this.correlationMatrix.get(correlationKey) || { count: 0, strength: 0 };
                correlation.count++;
                correlation.strength = Math.min(correlation.count / 10, 1); // Max strength of 1
                this.correlationMatrix.set(correlationKey, correlation);

                // Emit correlation event if strength is significant
                if (correlation.strength > 0.5) {
                    this.emit('error-correlation', {
                        source1: errorInfo.source,
                        source2: source,
                        strength: correlation.strength,
                        recentErrors: recentErrors.length
                    });
                }
            }
        }
    }

    /**
     * Predictive failure detection
     * @param {Object} errorInfo - Current error information
     * @private
     */
    async _predictiveFailureDetection(errorInfo) {
        const sourceErrors = this.errorHistory.get(errorInfo.source) || [];
        const recentErrors = sourceErrors.filter(error => 
            Date.now() - error.timestamp.getTime() < 300000 // Last 5 minutes
        );

        if (recentErrors.length >= 3) {
            const errorRate = recentErrors.length / 5; // errors per minute
            const failureProbability = Math.min(errorRate / 10, 1); // Normalize to 0-1

            if (failureProbability > this.config.predictionThreshold) {
                this.emit('predictive-failure', {
                    source: errorInfo.source,
                    probability: failureProbability,
                    recentErrors: recentErrors.length,
                    recommendation: 'Consider implementing circuit breaker or graceful degradation'
                });
            }
        }
    }

    /**
     * Perform periodic analysis
     * @private
     */
    _performPeriodicAnalysis() {
        // Clean up old data
        this._cleanupOldData();
        
        // Analyze patterns
        this._analyzeErrorPatterns();
        
        // Update circuit breaker states
        this._updateCircuitBreakers();
        
        // Emit health report
        this.emit('health-report', this.getHealthReport());
    }

    /**
     * Clean up old data
     * @private
     */
    _cleanupOldData() {
        const oneHourAgo = Date.now() - 3600000;
        
        for (const [source, errors] of this.errorHistory.entries()) {
            const recentErrors = errors.filter(error => 
                error.timestamp.getTime() > oneHourAgo
            );
            this.errorHistory.set(source, recentErrors);
        }
    }

    /**
     * Analyze error patterns
     * @private
     */
    _analyzeErrorPatterns() {
        const patterns = Array.from(this.errorPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10 patterns

        if (patterns.length > 0) {
            this.emit('pattern-analysis', {
                topPatterns: patterns,
                timestamp: new Date()
            });
        }
    }

    /**
     * Update circuit breaker states
     * @private
     */
    _updateCircuitBreakers() {
        for (const [source, circuitBreaker] of this.circuitBreakers.entries()) {
            const status = circuitBreaker.getStatus();
            if (status.state !== 'CLOSED') {
                this.emit('circuit-breaker-status', {
                    source,
                    status
                });
            }
        }
    }

    /**
     * Get comprehensive health report
     * @returns {Object} Health report
     */
    getHealthReport() {
        const report = {
            timestamp: new Date(),
            errorStats: this.errorStats.getStatistics(),
            circuitBreakers: {},
            correlations: Array.from(this.correlationMatrix.entries()),
            topPatterns: Array.from(this.errorPatterns.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
        };

        // Add circuit breaker status
        for (const [source, circuitBreaker] of this.circuitBreakers.entries()) {
            report.circuitBreakers[source] = circuitBreaker.getStatus();
        }

        return report;
    }

    /**
     * Reset all error tracking
     */
    reset() {
        this.errorHistory.clear();
        this.errorPatterns.clear();
        this.correlationMatrix.clear();
        this.errorStats.reset();
        
        for (const circuitBreaker of this.circuitBreakers.values()) {
            circuitBreaker.reset();
        }
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        this.removeAllListeners();
    }

    // Error classification helper methods
    _isNetworkError(error) {
        return error.code === 'ECONNREFUSED' || 
               error.code === 'ECONNABORTED' || 
               error.code === 'ENOTFOUND' ||
               error.message.includes('network') ||
               error.message.includes('connection');
    }

    _isAuthenticationError(error) {
        return error.response?.status === 401 ||
               error.code === 'AUTHENTICATION_FAILED' ||
               error.message.includes('authentication') ||
               error.message.includes('unauthorized');
    }

    _isAuthorizationError(error) {
        return error.response?.status === 403 ||
               error.code === 'AUTHORIZATION_FAILED' ||
               error.message.includes('authorization') ||
               error.message.includes('forbidden');
    }

    _isRateLimitError(error) {
        return error.response?.status === 429 ||
               error.code === 'RATE_LIMIT_EXCEEDED' ||
               error.message.includes('rate limit') ||
               error.message.includes('too many requests');
    }

    _isTimeoutError(error) {
        return error.code === 'ETIMEDOUT' ||
               error.name === 'TimeoutError' ||
               error.response?.status === 408 ||
               error.response?.status === 504 ||
               error.message.includes('timeout');
    }

    _isServerError(error) {
        return error.response?.status >= 500 ||
               error.message.includes('server error') ||
               error.message.includes('internal error');
    }

    _isClientError(error) {
        return error.response?.status >= 400 && error.response?.status < 500;
    }

    _isValidationError(error) {
        return error.name === 'ValidationError' ||
               error.code === 'VALIDATION_ERROR' ||
               error.message.includes('validation') ||
               error.message.includes('invalid');
    }

    // Source-specific classification methods
    _classifyPostgreSQLError(classification) {
        const error = classification.originalError;
        
        if (error.code === '28P01') {
            classification.category = ErrorCategory.AUTHENTICATION;
            classification.severity = ErrorSeverity.HIGH;
        } else if (error.code === '53300') {
            classification.category = ErrorCategory.RESOURCE;
            classification.severity = ErrorSeverity.CRITICAL;
            classification.retryable = true;
        } else if (error.code === '08006') {
            classification.category = ErrorCategory.NETWORK;
            classification.severity = ErrorSeverity.HIGH;
            classification.retryable = true;
        }
    }

    _classifyLinearError(classification) {
        // Linear API specific error handling
        if (classification.metadata.httpStatus === 429) {
            classification.delay = 60000; // Linear has strict rate limits
        }
    }

    _classifyGitHubError(classification) {
        // GitHub API specific error handling
        if (classification.metadata.httpStatus === 403) {
            // Could be rate limit or permissions
            const error = classification.originalError;
            if (error.response?.headers?.['x-ratelimit-remaining'] === '0') {
                classification.category = ErrorCategory.RATE_LIMIT;
                classification.retryable = true;
                classification.delay = 3600000; // GitHub rate limit reset time
            }
        }
    }

    _classifyAgentAPIError(classification) {
        // AgentAPI specific error handling
        // Add specific logic based on AgentAPI error patterns
    }

    _classifyClaudeCodeError(classification) {
        // Claude Code specific error handling
        // Add specific logic based on Claude Code error patterns
    }

    _classifyCodegenError(classification) {
        // Codegen specific error handling
        // Add specific logic based on Codegen error patterns
    }

    _generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
    constructor(config, source) {
        this.source = source;
        this.threshold = config.circuitBreakerThreshold || 5;
        this.timeout = config.circuitBreakerTimeout || 60000;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    isOpen() {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                return false;
            }
            return true;
        }
        return false;
    }

    recordSuccess() {
        this.successes++;
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.failures = 0;
        }
    }

    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    reset() {
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED';
    }

    getStatus() {
        return {
            source: this.source,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            threshold: this.threshold,
            lastFailureTime: this.lastFailureTime,
            timeUntilHalfOpen: this.state === 'OPEN' ? 
                Math.max(0, this.timeout - (Date.now() - this.lastFailureTime)) : 0
        };
    }
}

/**
 * Error Statistics tracking
 */
class ErrorStatistics {
    constructor() {
        this.errors = [];
        this.errorCounts = new Map();
        this.startTime = Date.now();
    }

    recordError(errorInfo) {
        this.errors.push(errorInfo);
        
        const key = `${errorInfo.source}:${errorInfo.category}`;
        const count = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, count + 1);
        
        // Keep only recent errors (last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.errors = this.errors.filter(error => 
            error.timestamp.getTime() > oneHourAgo
        );
    }

    getStatistics() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const recentErrors = this.errors.filter(error => 
            error.timestamp.getTime() > oneHourAgo
        );
        
        const errorsBySource = {};
        const errorsByCategory = {};
        const errorsBySeverity = {};
        
        for (const error of recentErrors) {
            errorsBySource[error.source] = (errorsBySource[error.source] || 0) + 1;
            errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
            errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
        }
        
        return {
            totalErrors: this.errors.length,
            recentErrors: recentErrors.length,
            errorsBySource,
            errorsByCategory,
            errorsBySeverity,
            errorRate: recentErrors.length / ((now - Math.max(this.startTime, oneHourAgo)) / 60000),
            uptime: now - this.startTime
        };
    }

    reset() {
        this.errors = [];
        this.errorCounts.clear();
        this.startTime = Date.now();
    }
}

export default CentralErrorHandler;

