/**
 * @fileoverview Unified Error Classification System
 * @description Consolidates error classification logic from all PRs into a single,
 * intelligent classification system with ML-based pattern recognition
 */

/**
 * Error categories
 */
export const ErrorCategory = {
    NETWORK: 'network',
    RATE_LIMIT: 'rate_limit',
    VALIDATION: 'validation',
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    RESOURCE: 'resource',
    SYSTEM: 'system',
    TIMEOUT: 'timeout',
    DEPENDENCY: 'dependency',
    CONFIGURATION: 'configuration',
    UNKNOWN: 'unknown'
};

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
 * Error types
 */
export const ErrorType = {
    TRANSIENT: 'transient',
    PERSISTENT: 'persistent',
    INTERMITTENT: 'intermittent',
    SYSTEMATIC: 'systematic'
};

/**
 * Unified Error Classifier
 * Consolidates classification logic from PRs #45, #88, #90, #91, #93
 */
export class ErrorClassifier {
    constructor(config = {}) {
        this.config = {
            enableMLClassification: config.enableMLClassification !== false,
            confidenceThreshold: config.confidenceThreshold || 0.7,
            maxPatternHistory: config.maxPatternHistory || 1000,
            enablePatternLearning: config.enablePatternLearning !== false,
            ...config
        };

        // Classification patterns learned from historical data
        this.patterns = new Map();
        this.classificationHistory = [];
        this.ruleBasedClassifiers = this._initializeRuleBasedClassifiers();
        this.mlModel = null; // Placeholder for ML model
        
        // Statistics
        this.stats = {
            totalClassifications: 0,
            accurateClassifications: 0,
            patternMatches: 0,
            ruleBasedMatches: 0,
            mlClassifications: 0
        };
    }

    /**
     * Classify an error using multiple strategies
     * @param {Error} error - Error to classify
     * @param {Object} context - Classification context
     * @returns {Promise<Object>} Classification result
     */
    async classify(error, context = {}) {
        const startTime = Date.now();
        this.stats.totalClassifications++;

        try {
            // Extract error features
            const features = this._extractErrorFeatures(error, context);
            
            // Try pattern-based classification first
            const patternResult = this._classifyByPattern(features);
            if (patternResult && patternResult.confidence >= this.config.confidenceThreshold) {
                this.stats.patternMatches++;
                return this._finalizeClassification(patternResult, features, startTime);
            }

            // Try rule-based classification
            const ruleResult = this._classifyByRules(features);
            if (ruleResult && ruleResult.confidence >= this.config.confidenceThreshold) {
                this.stats.ruleBasedMatches++;
                return this._finalizeClassification(ruleResult, features, startTime);
            }

            // Try ML-based classification if enabled
            if (this.config.enableMLClassification && this.mlModel) {
                const mlResult = await this._classifyByML(features);
                if (mlResult && mlResult.confidence >= this.config.confidenceThreshold) {
                    this.stats.mlClassifications++;
                    return this._finalizeClassification(mlResult, features, startTime);
                }
            }

            // Fallback to basic classification
            const fallbackResult = this._classifyBasic(features);
            return this._finalizeClassification(fallbackResult, features, startTime);

        } catch (classificationError) {
            // Classification itself failed - return basic classification
            return {
                category: ErrorCategory.UNKNOWN,
                type: ErrorType.PERSISTENT,
                severity: ErrorSeverity.MEDIUM,
                retryable: false,
                fixable: false,
                escalatable: true,
                confidence: 0.1,
                method: 'fallback',
                error: classificationError.message,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Learn from classification feedback
     * @param {Object} classification - Original classification
     * @param {Object} feedback - Feedback on classification accuracy
     */
    learnFromFeedback(classification, feedback) {
        if (!this.config.enablePatternLearning) return;

        // Update pattern confidence based on feedback
        if (classification.pattern) {
            const pattern = this.patterns.get(classification.pattern);
            if (pattern) {
                if (feedback.accurate) {
                    pattern.successCount++;
                    this.stats.accurateClassifications++;
                } else {
                    pattern.failureCount++;
                }
                pattern.confidence = pattern.successCount / (pattern.successCount + pattern.failureCount);
            }
        }

        // Store feedback for future learning
        this.classificationHistory.push({
            classification,
            feedback,
            timestamp: new Date()
        });

        // Cleanup old history
        if (this.classificationHistory.length > this.config.maxPatternHistory) {
            this.classificationHistory = this.classificationHistory.slice(-this.config.maxPatternHistory);
        }
    }

    /**
     * Get classification statistics
     * @returns {Object} Classification statistics
     */
    getStatistics() {
        const accuracy = this.stats.totalClassifications > 0 ? 
            this.stats.accurateClassifications / this.stats.totalClassifications : 0;

        return {
            ...this.stats,
            accuracy,
            patternsLearned: this.patterns.size,
            historySize: this.classificationHistory.length,
            averageConfidence: this._calculateAverageConfidence()
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: stats.accuracy > 0.8 ? 'healthy' : 
                   stats.accuracy > 0.6 ? 'degraded' : 'unhealthy',
            accuracy: stats.accuracy,
            totalClassifications: stats.totalClassifications,
            patternsLearned: stats.patternsLearned
        };
    }

    /**
     * Reset classifier state
     */
    reset() {
        this.patterns.clear();
        this.classificationHistory = [];
        this.stats = {
            totalClassifications: 0,
            accurateClassifications: 0,
            patternMatches: 0,
            ruleBasedMatches: 0,
            mlClassifications: 0
        };
    }

    // Private methods

    /**
     * Extract features from error for classification
     * @param {Error} error - Error object
     * @param {Object} context - Error context
     * @returns {Object} Extracted features
     * @private
     */
    _extractErrorFeatures(error, context) {
        const message = error.message || '';
        const stack = error.stack || '';
        const code = error.code || '';
        const status = error.status || error.statusCode || 0;

        return {
            // Basic error properties
            message: message.toLowerCase(),
            code,
            status,
            name: error.name || 'Error',
            
            // Message analysis
            messageLength: message.length,
            hasStackTrace: !!stack,
            stackDepth: stack ? stack.split('\n').length : 0,
            
            // Context features
            operation: context.operation || 'unknown',
            component: context.component || 'unknown',
            environment: context.environment || 'unknown',
            
            // Pattern features
            messageWords: message.toLowerCase().split(/\s+/),
            messagePatterns: this._extractMessagePatterns(message),
            
            // Network-specific features
            isNetworkError: this._isNetworkError(error),
            isTimeoutError: this._isTimeoutError(error),
            isRateLimitError: this._isRateLimitError(error),
            
            // System-specific features
            isSystemError: this._isSystemError(error),
            isValidationError: this._isValidationError(error),
            isAuthError: this._isAuthError(error),
            
            // Timing
            timestamp: new Date(),
            
            // Raw error for advanced analysis
            rawError: error
        };
    }

    /**
     * Classify error by learned patterns
     * @param {Object} features - Error features
     * @returns {Object|null} Classification result
     * @private
     */
    _classifyByPattern(features) {
        let bestMatch = null;
        let bestConfidence = 0;

        for (const [patternId, pattern] of this.patterns.entries()) {
            const similarity = this._calculatePatternSimilarity(features, pattern.features);
            const confidence = similarity * pattern.confidence;

            if (confidence > bestConfidence && confidence >= this.config.confidenceThreshold) {
                bestConfidence = confidence;
                bestMatch = {
                    ...pattern.classification,
                    confidence,
                    method: 'pattern',
                    pattern: patternId,
                    similarity
                };
            }
        }

        return bestMatch;
    }

    /**
     * Classify error using rule-based approach
     * @param {Object} features - Error features
     * @returns {Object} Classification result
     * @private
     */
    _classifyByRules(features) {
        for (const classifier of this.ruleBasedClassifiers) {
            const result = classifier(features);
            if (result) {
                return {
                    ...result,
                    method: 'rule_based',
                    confidence: result.confidence || 0.8
                };
            }
        }

        return null;
    }

    /**
     * Classify error using ML model
     * @param {Object} features - Error features
     * @returns {Promise<Object|null>} Classification result
     * @private
     */
    async _classifyByML(features) {
        if (!this.mlModel) return null;

        try {
            // Placeholder for ML classification
            // In a real implementation, this would use a trained model
            const prediction = await this.mlModel.predict(features);
            
            return {
                category: prediction.category,
                type: prediction.type,
                severity: prediction.severity,
                retryable: prediction.retryable,
                fixable: prediction.fixable,
                escalatable: prediction.escalatable,
                confidence: prediction.confidence,
                method: 'ml'
            };
        } catch (mlError) {
            return null;
        }
    }

    /**
     * Basic classification fallback
     * @param {Object} features - Error features
     * @returns {Object} Classification result
     * @private
     */
    _classifyBasic(features) {
        // Basic classification based on simple heuristics
        let category = ErrorCategory.UNKNOWN;
        let type = ErrorType.PERSISTENT;
        let severity = ErrorSeverity.MEDIUM;
        let retryable = false;
        let fixable = false;
        let escalatable = true;

        // Network errors
        if (features.isNetworkError || features.isTimeoutError) {
            category = ErrorCategory.NETWORK;
            type = ErrorType.TRANSIENT;
            retryable = true;
            fixable = false;
        }
        
        // Rate limit errors
        else if (features.isRateLimitError) {
            category = ErrorCategory.RATE_LIMIT;
            type = ErrorType.TRANSIENT;
            retryable = true;
            fixable = false;
        }
        
        // Validation errors
        else if (features.isValidationError) {
            category = ErrorCategory.VALIDATION;
            type = ErrorType.PERSISTENT;
            severity = ErrorSeverity.LOW;
            retryable = false;
            fixable = true;
        }
        
        // Authentication errors
        else if (features.isAuthError) {
            category = ErrorCategory.AUTHENTICATION;
            type = ErrorType.PERSISTENT;
            severity = ErrorSeverity.HIGH;
            retryable = false;
            fixable = true;
        }
        
        // System errors
        else if (features.isSystemError) {
            category = ErrorCategory.SYSTEM;
            type = ErrorType.INTERMITTENT;
            severity = ErrorSeverity.HIGH;
            retryable = true;
            fixable = true;
        }

        return {
            category,
            type,
            severity,
            retryable,
            fixable,
            escalatable,
            confidence: 0.5,
            method: 'basic'
        };
    }

    /**
     * Initialize rule-based classifiers
     * @returns {Array} Array of classifier functions
     * @private
     */
    _initializeRuleBasedClassifiers() {
        return [
            // Network error classifier
            (features) => {
                if (features.isNetworkError || features.isTimeoutError) {
                    return {
                        category: ErrorCategory.NETWORK,
                        type: ErrorType.TRANSIENT,
                        severity: ErrorSeverity.MEDIUM,
                        retryable: true,
                        fixable: false,
                        escalatable: false,
                        confidence: 0.9
                    };
                }
                return null;
            },

            // Rate limit classifier
            (features) => {
                if (features.isRateLimitError) {
                    return {
                        category: ErrorCategory.RATE_LIMIT,
                        type: ErrorType.TRANSIENT,
                        severity: ErrorSeverity.LOW,
                        retryable: true,
                        fixable: false,
                        escalatable: false,
                        confidence: 0.95
                    };
                }
                return null;
            },

            // Authentication classifier
            (features) => {
                if (features.isAuthError) {
                    return {
                        category: ErrorCategory.AUTHENTICATION,
                        type: ErrorType.PERSISTENT,
                        severity: ErrorSeverity.HIGH,
                        retryable: false,
                        fixable: true,
                        escalatable: true,
                        confidence: 0.9
                    };
                }
                return null;
            },

            // Validation classifier
            (features) => {
                if (features.isValidationError) {
                    return {
                        category: ErrorCategory.VALIDATION,
                        type: ErrorType.PERSISTENT,
                        severity: ErrorSeverity.LOW,
                        retryable: false,
                        fixable: true,
                        escalatable: false,
                        confidence: 0.85
                    };
                }
                return null;
            },

            // System error classifier
            (features) => {
                if (features.isSystemError) {
                    return {
                        category: ErrorCategory.SYSTEM,
                        type: ErrorType.INTERMITTENT,
                        severity: ErrorSeverity.HIGH,
                        retryable: true,
                        fixable: true,
                        escalatable: true,
                        confidence: 0.8
                    };
                }
                return null;
            }
        ];
    }

    /**
     * Check if error is network-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is network-related
     * @private
     */
    _isNetworkError(error) {
        const message = (error.message || '').toLowerCase();
        const code = error.code || '';
        
        return (
            message.includes('network') ||
            message.includes('connection') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('etimedout') ||
            code === 'ECONNREFUSED' ||
            code === 'ENOTFOUND' ||
            code === 'ETIMEDOUT' ||
            error.status >= 500
        );
    }

    /**
     * Check if error is timeout-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is timeout-related
     * @private
     */
    _isTimeoutError(error) {
        const message = (error.message || '').toLowerCase();
        const code = error.code || '';
        
        return (
            message.includes('timeout') ||
            message.includes('timed out') ||
            code === 'ETIMEDOUT' ||
            code === 'TIMEOUT'
        );
    }

    /**
     * Check if error is rate limit-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is rate limit-related
     * @private
     */
    _isRateLimitError(error) {
        const message = (error.message || '').toLowerCase();
        
        return (
            message.includes('rate limit') ||
            message.includes('too many requests') ||
            message.includes('quota exceeded') ||
            message.includes('throttled') ||
            error.status === 429
        );
    }

    /**
     * Check if error is system-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is system-related
     * @private
     */
    _isSystemError(error) {
        const message = (error.message || '').toLowerCase();
        
        return (
            message.includes('internal server error') ||
            message.includes('service unavailable') ||
            message.includes('bad gateway') ||
            error.status === 500 ||
            error.status === 502 ||
            error.status === 503
        );
    }

    /**
     * Check if error is validation-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is validation-related
     * @private
     */
    _isValidationError(error) {
        const message = (error.message || '').toLowerCase();
        
        return (
            message.includes('validation') ||
            message.includes('invalid') ||
            message.includes('bad request') ||
            message.includes('malformed') ||
            error.status === 400 ||
            error.name === 'ValidationError'
        );
    }

    /**
     * Check if error is authentication-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is authentication-related
     * @private
     */
    _isAuthError(error) {
        const message = (error.message || '').toLowerCase();
        
        return (
            message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('forbidden') ||
            message.includes('access denied') ||
            error.status === 401 ||
            error.status === 403
        );
    }

    /**
     * Extract message patterns for classification
     * @param {string} message - Error message
     * @returns {Array} Extracted patterns
     * @private
     */
    _extractMessagePatterns(message) {
        const patterns = [];
        const lowerMessage = message.toLowerCase();
        
        // Common error patterns
        const commonPatterns = [
            /error:\s*(.+)/,
            /failed to (.+)/,
            /cannot (.+)/,
            /unable to (.+)/,
            /(.+) not found/,
            /(.+) is required/,
            /invalid (.+)/
        ];
        
        for (const pattern of commonPatterns) {
            const match = lowerMessage.match(pattern);
            if (match) {
                patterns.push(match[1]);
            }
        }
        
        return patterns;
    }

    /**
     * Calculate similarity between features and pattern
     * @param {Object} features - Current error features
     * @param {Object} patternFeatures - Pattern features
     * @returns {number} Similarity score (0-1)
     * @private
     */
    _calculatePatternSimilarity(features, patternFeatures) {
        let score = 0;
        let totalFeatures = 0;
        
        // Compare categorical features
        const categoricalFeatures = ['operation', 'component', 'environment'];
        for (const feature of categoricalFeatures) {
            totalFeatures++;
            if (features[feature] === patternFeatures[feature]) {
                score++;
            }
        }
        
        // Compare boolean features
        const booleanFeatures = [
            'isNetworkError', 'isTimeoutError', 'isRateLimitError',
            'isSystemError', 'isValidationError', 'isAuthError'
        ];
        for (const feature of booleanFeatures) {
            totalFeatures++;
            if (features[feature] === patternFeatures[feature]) {
                score++;
            }
        }
        
        // Compare message similarity
        totalFeatures++;
        const messageSimilarity = this._calculateMessageSimilarity(
            features.message,
            patternFeatures.message
        );
        score += messageSimilarity;
        
        return totalFeatures > 0 ? score / totalFeatures : 0;
    }

    /**
     * Calculate message similarity
     * @param {string} message1 - First message
     * @param {string} message2 - Second message
     * @returns {number} Similarity score (0-1)
     * @private
     */
    _calculateMessageSimilarity(message1, message2) {
        if (!message1 || !message2) return 0;
        
        const words1 = new Set(message1.split(/\s+/));
        const words2 = new Set(message2.split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    /**
     * Finalize classification result
     * @param {Object} result - Classification result
     * @param {Object} features - Error features
     * @param {number} startTime - Processing start time
     * @returns {Object} Finalized classification
     * @private
     */
    _finalizeClassification(result, features, startTime) {
        const classification = {
            ...result,
            processingTime: Date.now() - startTime,
            timestamp: new Date(),
            features: features
        };

        // Learn from this classification if pattern learning is enabled
        if (this.config.enablePatternLearning && result.method !== 'pattern') {
            this._learnPattern(features, classification);
        }

        return classification;
    }

    /**
     * Learn a new pattern from classification
     * @param {Object} features - Error features
     * @param {Object} classification - Classification result
     * @private
     */
    _learnPattern(features, classification) {
        const patternId = this._generatePatternId(features);
        
        if (!this.patterns.has(patternId)) {
            this.patterns.set(patternId, {
                id: patternId,
                features,
                classification: {
                    category: classification.category,
                    type: classification.type,
                    severity: classification.severity,
                    retryable: classification.retryable,
                    fixable: classification.fixable,
                    escalatable: classification.escalatable
                },
                successCount: 1,
                failureCount: 0,
                confidence: 0.7,
                createdAt: new Date(),
                lastUsed: new Date()
            });
        }
    }

    /**
     * Generate pattern ID from features
     * @param {Object} features - Error features
     * @returns {string} Pattern ID
     * @private
     */
    _generatePatternId(features) {
        const key = [
            features.operation,
            features.component,
            features.isNetworkError,
            features.isTimeoutError,
            features.isRateLimitError,
            features.isSystemError,
            features.isValidationError,
            features.isAuthError
        ].join('|');
        
        return `pattern_${this._hashString(key)}`;
    }

    /**
     * Simple string hash function
     * @param {string} str - String to hash
     * @returns {string} Hash
     * @private
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Calculate average confidence of recent classifications
     * @returns {number} Average confidence
     * @private
     */
    _calculateAverageConfidence() {
        if (this.classificationHistory.length === 0) return 0;
        
        const recentClassifications = this.classificationHistory.slice(-100);
        const totalConfidence = recentClassifications.reduce(
            (sum, item) => sum + (item.classification.confidence || 0),
            0
        );
        
        return totalConfidence / recentClassifications.length;
    }
}

export default ErrorClassifier;

