/**
 * @fileoverview Error Classification and Pattern Recognition System
 * @description Intelligent error classification with machine learning-based pattern recognition
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Error Classification System with ML-based pattern recognition
 */
export class ErrorClassifier {
    constructor(config = {}) {
        this.config = {
            enableMLClassification: config.enableMLClassification !== false,
            confidenceThreshold: config.confidenceThreshold || 0.7,
            maxPatternHistory: config.maxPatternHistory || 1000,
            ...config
        };
        
        this.errorPatterns = new Map();
        this.classificationHistory = [];
        this.featureExtractor = new ErrorFeatureExtractor();
        this.patternMatcher = new PatternMatcher();
    }

    /**
     * Classify an error and determine its category and severity
     * @param {Error} error - The error to classify
     * @param {Object} context - Additional context about the error
     * @returns {Object} Classification result
     */
    async classifyError(error, context = {}) {
        const features = this.featureExtractor.extractFeatures(error, context);
        const classification = await this._performClassification(features, error, context);
        
        // Store classification for learning
        this._recordClassification(classification, features);
        
        log('debug', 'Error classified', {
            type: classification.type,
            severity: classification.severity,
            confidence: classification.confidence,
            category: classification.category
        });
        
        return classification;
    }

    /**
     * Perform error classification using multiple strategies
     * @param {Object} features - Extracted error features
     * @param {Error} error - Original error
     * @param {Object} context - Error context
     * @returns {Object} Classification result
     * @private
     */
    async _performClassification(features, error, context) {
        // Rule-based classification (fast, deterministic)
        const ruleBasedResult = this._ruleBasedClassification(features, error, context);
        
        // Pattern-based classification (learned patterns)
        const patternBasedResult = await this._patternBasedClassification(features);
        
        // ML-based classification (if enabled)
        let mlBasedResult = null;
        if (this.config.enableMLClassification) {
            mlBasedResult = await this._mlBasedClassification(features);
        }
        
        // Combine results with confidence weighting
        return this._combineClassificationResults(
            ruleBasedResult,
            patternBasedResult,
            mlBasedResult,
            features
        );
    }

    /**
     * Rule-based error classification
     * @param {Object} features - Error features
     * @param {Error} error - Original error
     * @param {Object} context - Error context
     * @returns {Object} Classification result
     * @private
     */
    _ruleBasedClassification(features, error, context) {
        const rules = [
            // Network and connectivity errors
            {
                condition: (f) => f.hasNetworkKeywords || f.statusCode >= 500,
                result: {
                    type: 'INFRASTRUCTURE_ERROR',
                    category: 'NETWORK',
                    severity: 'HIGH',
                    confidence: 0.9,
                    retryable: true,
                    escalationLevel: 1
                }
            },
            
            // Authentication and authorization errors
            {
                condition: (f) => f.statusCode === 401 || f.statusCode === 403 || f.hasAuthKeywords,
                result: {
                    type: 'AUTHENTICATION_ERROR',
                    category: 'SECURITY',
                    severity: 'HIGH',
                    confidence: 0.95,
                    retryable: false,
                    escalationLevel: 2
                }
            },
            
            // Rate limiting errors
            {
                condition: (f) => f.statusCode === 429 || f.hasRateLimitKeywords,
                result: {
                    type: 'RATE_LIMIT_ERROR',
                    category: 'THROTTLING',
                    severity: 'MEDIUM',
                    confidence: 0.9,
                    retryable: true,
                    escalationLevel: 1
                }
            },
            
            // Validation and input errors
            {
                condition: (f) => f.statusCode === 400 || f.hasValidationKeywords,
                result: {
                    type: 'VALIDATION_ERROR',
                    category: 'INPUT',
                    severity: 'MEDIUM',
                    confidence: 0.85,
                    retryable: false,
                    escalationLevel: 2
                }
            },
            
            // Timeout errors
            {
                condition: (f) => f.hasTimeoutKeywords || f.statusCode === 408 || f.statusCode === 504,
                result: {
                    type: 'TIMEOUT_ERROR',
                    category: 'PERFORMANCE',
                    severity: 'MEDIUM',
                    confidence: 0.8,
                    retryable: true,
                    escalationLevel: 1
                }
            },
            
            // Code generation specific errors
            {
                condition: (f) => f.hasCodegenKeywords,
                result: {
                    type: 'CODEGEN_ERROR',
                    category: 'GENERATION',
                    severity: 'HIGH',
                    confidence: 0.85,
                    retryable: true,
                    escalationLevel: 2
                }
            },
            
            // Database errors
            {
                condition: (f) => f.hasDatabaseKeywords,
                result: {
                    type: 'DATABASE_ERROR',
                    category: 'PERSISTENCE',
                    severity: 'HIGH',
                    confidence: 0.8,
                    retryable: true,
                    escalationLevel: 2
                }
            }
        ];

        // Apply rules in order of specificity
        for (const rule of rules) {
            if (rule.condition(features)) {
                return {
                    ...rule.result,
                    method: 'rule_based',
                    timestamp: new Date(),
                    features
                };
            }
        }

        // Default classification
        return {
            type: 'UNKNOWN_ERROR',
            category: 'GENERAL',
            severity: 'MEDIUM',
            confidence: 0.5,
            retryable: false,
            escalationLevel: 3,
            method: 'rule_based',
            timestamp: new Date(),
            features
        };
    }

    /**
     * Pattern-based classification using historical data
     * @param {Object} features - Error features
     * @returns {Object} Classification result
     * @private
     */
    async _patternBasedClassification(features) {
        const similarPatterns = this.patternMatcher.findSimilarPatterns(features, this.errorPatterns);
        
        if (similarPatterns.length === 0) {
            return {
                type: 'UNKNOWN_PATTERN',
                confidence: 0.3,
                method: 'pattern_based'
            };
        }

        // Weight patterns by similarity and recency
        const weightedResults = similarPatterns.map(pattern => ({
            ...pattern.classification,
            weight: pattern.similarity * this._calculateRecencyWeight(pattern.timestamp)
        }));

        // Aggregate weighted results
        const aggregated = this._aggregateWeightedResults(weightedResults);
        
        return {
            ...aggregated,
            method: 'pattern_based',
            similarPatterns: similarPatterns.length
        };
    }

    /**
     * ML-based classification (placeholder for future ML implementation)
     * @param {Object} features - Error features
     * @returns {Object} Classification result
     * @private
     */
    async _mlBasedClassification(features) {
        // Placeholder for ML model integration
        // In a real implementation, this would use a trained model
        
        return {
            type: 'ML_PREDICTION',
            confidence: 0.6,
            method: 'ml_based',
            note: 'ML classification not yet implemented'
        };
    }

    /**
     * Combine multiple classification results
     * @param {Object} ruleResult - Rule-based result
     * @param {Object} patternResult - Pattern-based result
     * @param {Object} mlResult - ML-based result
     * @param {Object} features - Error features
     * @returns {Object} Combined classification
     * @private
     */
    _combineClassificationResults(ruleResult, patternResult, mlResult, features) {
        const results = [ruleResult, patternResult, mlResult].filter(Boolean);
        
        // If rule-based has high confidence, prefer it
        if (ruleResult.confidence >= 0.8) {
            return {
                ...ruleResult,
                alternativeClassifications: results.slice(1)
            };
        }

        // Otherwise, use weighted combination
        let bestResult = ruleResult;
        let bestScore = ruleResult.confidence;

        for (const result of results) {
            if (result.confidence > bestScore) {
                bestResult = result;
                bestScore = result.confidence;
            }
        }

        return {
            ...bestResult,
            combinedConfidence: this._calculateCombinedConfidence(results),
            alternativeClassifications: results.filter(r => r !== bestResult)
        };
    }

    /**
     * Calculate combined confidence from multiple results
     * @param {Array} results - Classification results
     * @returns {number} Combined confidence
     * @private
     */
    _calculateCombinedConfidence(results) {
        if (results.length === 0) return 0;
        
        const weights = results.map(r => r.confidence);
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        
        return weightSum / results.length;
    }

    /**
     * Calculate recency weight for pattern matching
     * @param {Date} timestamp - Pattern timestamp
     * @returns {number} Recency weight (0-1)
     * @private
     */
    _calculateRecencyWeight(timestamp) {
        const ageMs = Date.now() - timestamp.getTime();
        const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        return Math.max(0, 1 - (ageMs / maxAgeMs));
    }

    /**
     * Aggregate weighted classification results
     * @param {Array} weightedResults - Results with weights
     * @returns {Object} Aggregated result
     * @private
     */
    _aggregateWeightedResults(weightedResults) {
        if (weightedResults.length === 0) {
            return { confidence: 0 };
        }

        // Group by type and calculate weighted averages
        const typeGroups = new Map();
        
        for (const result of weightedResults) {
            const key = result.type;
            if (!typeGroups.has(key)) {
                typeGroups.set(key, []);
            }
            typeGroups.get(key).push(result);
        }

        // Find the type with highest total weight
        let bestType = null;
        let bestWeight = 0;
        let bestResult = null;

        for (const [type, results] of typeGroups.entries()) {
            const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
            if (totalWeight > bestWeight) {
                bestWeight = totalWeight;
                bestType = type;
                bestResult = results[0]; // Use first result as template
            }
        }

        return {
            ...bestResult,
            confidence: Math.min(0.9, bestWeight / weightedResults.length),
            patternMatches: weightedResults.length
        };
    }

    /**
     * Record classification for learning
     * @param {Object} classification - Classification result
     * @param {Object} features - Error features
     * @private
     */
    _recordClassification(classification, features) {
        const record = {
            classification,
            features,
            timestamp: new Date(),
            id: this._generateId()
        };

        this.classificationHistory.push(record);
        
        // Store as pattern for future matching
        this.errorPatterns.set(record.id, record);
        
        // Cleanup old records
        if (this.classificationHistory.length > this.config.maxPatternHistory) {
            const removed = this.classificationHistory.shift();
            this.errorPatterns.delete(removed.id);
        }
    }

    /**
     * Generate unique ID for classification record
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get classification statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const typeDistribution = new Map();
        const severityDistribution = new Map();
        const categoryDistribution = new Map();

        for (const record of this.classificationHistory) {
            const { type, severity, category } = record.classification;
            
            typeDistribution.set(type, (typeDistribution.get(type) || 0) + 1);
            severityDistribution.set(severity, (severityDistribution.get(severity) || 0) + 1);
            categoryDistribution.set(category, (categoryDistribution.get(category) || 0) + 1);
        }

        return {
            totalClassifications: this.classificationHistory.length,
            typeDistribution: Object.fromEntries(typeDistribution),
            severityDistribution: Object.fromEntries(severityDistribution),
            categoryDistribution: Object.fromEntries(categoryDistribution),
            patternCount: this.errorPatterns.size,
            averageConfidence: this._calculateAverageConfidence()
        };
    }

    /**
     * Calculate average confidence across all classifications
     * @returns {number} Average confidence
     * @private
     */
    _calculateAverageConfidence() {
        if (this.classificationHistory.length === 0) return 0;
        
        const totalConfidence = this.classificationHistory.reduce(
            (sum, record) => sum + (record.classification.confidence || 0), 0
        );
        
        return totalConfidence / this.classificationHistory.length;
    }

    /**
     * Export patterns for backup or analysis
     * @returns {Object} Exported patterns
     */
    exportPatterns() {
        return {
            patterns: Array.from(this.errorPatterns.values()),
            statistics: this.getStatistics(),
            exportDate: new Date()
        };
    }

    /**
     * Import patterns from backup
     * @param {Object} data - Imported pattern data
     */
    importPatterns(data) {
        if (data.patterns && Array.isArray(data.patterns)) {
            this.errorPatterns.clear();
            this.classificationHistory = [];
            
            for (const pattern of data.patterns) {
                this.errorPatterns.set(pattern.id, pattern);
                this.classificationHistory.push(pattern);
            }
            
            log('info', `Imported ${data.patterns.length} error patterns`);
        }
    }
}

/**
 * Error Feature Extractor
 */
class ErrorFeatureExtractor {
    /**
     * Extract features from error and context
     * @param {Error} error - The error
     * @param {Object} context - Error context
     * @returns {Object} Extracted features
     */
    extractFeatures(error, context) {
        const message = error.message || '';
        const stack = error.stack || '';
        const name = error.name || '';
        
        return {
            // Basic error properties
            errorName: name,
            messageLength: message.length,
            hasStack: !!stack,
            stackDepth: stack.split('\n').length,
            
            // HTTP-related features
            statusCode: error.status || error.statusCode || context.statusCode || 0,
            hasNetworkKeywords: this._hasKeywords(message + stack, [
                'network', 'connection', 'timeout', 'refused', 'unreachable',
                'dns', 'socket', 'econnrefused', 'enotfound', 'etimedout'
            ]),
            
            // Authentication features
            hasAuthKeywords: this._hasKeywords(message + stack, [
                'auth', 'unauthorized', 'forbidden', 'token', 'credential',
                'permission', 'access denied', 'invalid key'
            ]),
            
            // Rate limiting features
            hasRateLimitKeywords: this._hasKeywords(message + stack, [
                'rate limit', 'too many requests', 'quota', 'throttle',
                'limit exceeded', 'retry after'
            ]),
            
            // Validation features
            hasValidationKeywords: this._hasKeywords(message + stack, [
                'validation', 'invalid', 'required', 'missing', 'format',
                'schema', 'constraint', 'bad request'
            ]),
            
            // Timeout features
            hasTimeoutKeywords: this._hasKeywords(message + stack, [
                'timeout', 'timed out', 'deadline', 'expired', 'slow'
            ]),
            
            // Codegen-specific features
            hasCodegenKeywords: this._hasKeywords(message + stack, [
                'codegen', 'generation', 'template', 'compile', 'syntax',
                'parse', 'ast', 'transform'
            ]),
            
            // Database features
            hasDatabaseKeywords: this._hasKeywords(message + stack, [
                'database', 'sql', 'query', 'connection pool', 'transaction',
                'deadlock', 'constraint', 'foreign key'
            ]),
            
            // Context features
            contextSize: Object.keys(context).length,
            hasUserId: !!context.userId,
            hasRequestId: !!context.requestId,
            hasTimestamp: !!context.timestamp,
            
            // Timing features
            timeOfDay: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            
            // Frequency features (to be populated by caller)
            recentOccurrences: context.recentOccurrences || 0,
            totalOccurrences: context.totalOccurrences || 1
        };
    }

    /**
     * Check if text contains any of the specified keywords
     * @param {string} text - Text to search
     * @param {Array} keywords - Keywords to look for
     * @returns {boolean} Whether any keyword was found
     * @private
     */
    _hasKeywords(text, keywords) {
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }
}

/**
 * Pattern Matcher for finding similar error patterns
 */
class PatternMatcher {
    /**
     * Find similar patterns to the given features
     * @param {Object} features - Features to match
     * @param {Map} patterns - Pattern database
     * @returns {Array} Similar patterns with similarity scores
     */
    findSimilarPatterns(features, patterns) {
        const similarities = [];
        
        for (const [id, pattern] of patterns.entries()) {
            const similarity = this._calculateSimilarity(features, pattern.features);
            
            if (similarity > 0.5) { // Threshold for considering patterns similar
                similarities.push({
                    id,
                    pattern,
                    similarity,
                    classification: pattern.classification,
                    timestamp: pattern.timestamp
                });
            }
        }
        
        // Sort by similarity (descending)
        return similarities.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * Calculate similarity between two feature sets
     * @param {Object} features1 - First feature set
     * @param {Object} features2 - Second feature set
     * @returns {number} Similarity score (0-1)
     * @private
     */
    _calculateSimilarity(features1, features2) {
        const keys = new Set([...Object.keys(features1), ...Object.keys(features2)]);
        let matches = 0;
        let total = 0;
        
        for (const key of keys) {
            total++;
            
            const val1 = features1[key];
            const val2 = features2[key];
            
            // Handle different types of features
            if (typeof val1 === 'boolean' && typeof val2 === 'boolean') {
                if (val1 === val2) matches++;
            } else if (typeof val1 === 'number' && typeof val2 === 'number') {
                // Normalize numeric similarity
                const diff = Math.abs(val1 - val2);
                const max = Math.max(Math.abs(val1), Math.abs(val2), 1);
                matches += Math.max(0, 1 - (diff / max));
            } else if (typeof val1 === 'string' && typeof val2 === 'string') {
                if (val1 === val2) matches++;
            } else if (val1 === val2) {
                matches++;
            }
        }
        
        return total > 0 ? matches / total : 0;
    }
}

export default ErrorClassifier;

