/**
 * @fileoverview Error Classification Engine
 * @description Comprehensive error classification system for deployment failures
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Comprehensive error classification system
 */
export class ErrorClassificationEngine {
    constructor(config = {}) {
        this.config = {
            confidenceThreshold: config.confidenceThreshold || 0.8,
            enableMachineLearning: config.enableMachineLearning !== false,
            updatePatterns: config.updatePatterns !== false,
            ...config
        };

        this.errorPatterns = {
            transient: {
                network: /network.*timeout|connection.*refused|dns.*error|socket.*hang.*up|econnreset|enotfound/i,
                resource: /out of memory|disk.*full|resource.*unavailable|enomem|enospc|resource.*exhausted/i,
                rate_limit: /rate.*limit|too many requests|quota.*exceeded|throttled|429/i,
                temporary: /temporary.*failure|service.*unavailable|try.*again.*later|503|502/i
            },
            persistent: {
                dependency: /package.*not found|module.*missing|dependency.*error|cannot.*resolve|npm.*error|yarn.*error/i,
                syntax: /syntax.*error|parse.*error|compilation.*failed|unexpected.*token|invalid.*syntax/i,
                configuration: /config.*error|environment.*variable|permission.*denied|eacces|missing.*config/i,
                test: /test.*failed|assertion.*error|spec.*failed|expect.*received|jest.*failed/i,
                build: /build.*failed|webpack.*error|rollup.*error|vite.*error|compilation.*error/i
            },
            critical: {
                security: /security.*violation|unauthorized|forbidden|access.*denied|csrf|xss|injection/i,
                corruption: /corrupt.*file|invalid.*format|checksum.*mismatch|malformed.*data/i,
                system: /system.*error|kernel.*panic|segmentation.*fault|out.*of.*memory|disk.*error/i,
                database: /database.*error|connection.*lost|deadlock|constraint.*violation|sql.*error/i
            }
        };

        this.contextPatterns = {
            deployment: /deploy|build|ci|cd|pipeline|workflow/i,
            testing: /test|spec|jest|mocha|cypress|playwright/i,
            database: /db|database|sql|postgres|mysql|mongo/i,
            network: /http|https|api|request|response|fetch/i,
            filesystem: /file|directory|path|fs|read|write/i
        };

        this.learningData = new Map(); // For ML pattern learning
    }

    /**
     * Classify error with comprehensive analysis
     * @param {Error|string} error - Error object or message
     * @param {string} logs - Additional log context
     * @param {Object} context - Deployment/execution context
     * @returns {Object} Classification result
     */
    classifyError(error, logs = '', context = {}) {
        const errorMessage = typeof error === 'string' ? error : error.message || error.toString();
        const stackTrace = error.stack || '';
        const combinedText = `${errorMessage} ${stackTrace} ${logs}`.toLowerCase();

        const classification = {
            category: 'unknown',
            type: 'unknown',
            severity: 'medium',
            retryable: false,
            suggestedAction: 'manual_investigation',
            confidence: 0,
            patterns: [],
            context: this._analyzeContext(combinedText, context),
            metadata: {
                errorMessage,
                timestamp: new Date().toISOString(),
                source: context.source || 'unknown',
                environment: context.environment || 'unknown'
            }
        };

        // Analyze error patterns
        const patternMatches = this._analyzePatterns(combinedText);
        if (patternMatches.length > 0) {
            const bestMatch = patternMatches[0];
            classification.category = bestMatch.category;
            classification.type = bestMatch.type;
            classification.confidence = bestMatch.confidence;
            classification.patterns = patternMatches;
        }

        // Determine retry strategy and severity
        classification.retryable = this._isRetryable(classification);
        classification.severity = this._calculateSeverity(classification, context);
        classification.suggestedAction = this._getSuggestedAction(classification);

        // Learn from this classification if ML is enabled
        if (this.config.enableMachineLearning) {
            this._updateLearningData(classification, context);
        }

        log('debug', 'Error classified', {
            category: classification.category,
            type: classification.type,
            confidence: classification.confidence,
            retryable: classification.retryable
        });

        return classification;
    }

    /**
     * Analyze error patterns against known patterns
     * @param {string} text - Combined error text
     * @returns {Array} Pattern matches sorted by confidence
     * @private
     */
    _analyzePatterns(text) {
        const matches = [];

        for (const [category, types] of Object.entries(this.errorPatterns)) {
            for (const [type, pattern] of Object.entries(types)) {
                const match = text.match(pattern);
                if (match) {
                    const confidence = this._calculatePatternConfidence(match, text, pattern);
                    matches.push({
                        category,
                        type,
                        pattern: pattern.source,
                        confidence,
                        matchedText: match[0]
                    });
                }
            }
        }

        // Sort by confidence descending
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Calculate pattern match confidence
     * @param {Array} match - Regex match result
     * @param {string} text - Full text
     * @param {RegExp} pattern - Matched pattern
     * @returns {number} Confidence score (0-1)
     * @private
     */
    _calculatePatternConfidence(match, text, pattern) {
        let confidence = 0.5; // Base confidence

        // Increase confidence based on match specificity
        const matchLength = match[0].length;
        const textLength = text.length;
        const specificity = matchLength / textLength;
        confidence += specificity * 0.3;

        // Increase confidence for exact keyword matches
        const exactKeywords = ['error', 'failed', 'timeout', 'refused', 'denied'];
        for (const keyword of exactKeywords) {
            if (match[0].toLowerCase().includes(keyword)) {
                confidence += 0.1;
            }
        }

        // Increase confidence for multiple pattern matches
        const globalMatches = text.match(new RegExp(pattern.source, 'gi'));
        if (globalMatches && globalMatches.length > 1) {
            confidence += Math.min(globalMatches.length * 0.05, 0.2);
        }

        return Math.min(confidence, 1.0);
    }

    /**
     * Analyze context to determine error domain
     * @param {string} text - Error text
     * @param {Object} context - Execution context
     * @returns {Object} Context analysis
     * @private
     */
    _analyzeContext(text, context) {
        const contextAnalysis = {
            domain: 'unknown',
            phase: context.phase || 'unknown',
            component: context.component || 'unknown',
            patterns: []
        };

        for (const [domain, pattern] of Object.entries(this.contextPatterns)) {
            if (pattern.test(text)) {
                contextAnalysis.patterns.push(domain);
                if (contextAnalysis.domain === 'unknown') {
                    contextAnalysis.domain = domain;
                }
            }
        }

        return contextAnalysis;
    }

    /**
     * Determine if error is retryable
     * @param {Object} classification - Error classification
     * @returns {boolean} Whether error is retryable
     * @private
     */
    _isRetryable(classification) {
        // Critical errors are generally not retryable
        if (classification.category === 'critical') {
            return false;
        }

        // Transient errors are retryable
        if (classification.category === 'transient') {
            return true;
        }

        // Some persistent errors may be retryable with intervention
        if (classification.category === 'persistent') {
            const retryableTypes = ['dependency', 'configuration'];
            return retryableTypes.includes(classification.type);
        }

        return false;
    }

    /**
     * Calculate error severity
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {string} Severity level
     * @private
     */
    _calculateSeverity(classification, context) {
        // Critical category is always high severity
        if (classification.category === 'critical') {
            return 'critical';
        }

        // High confidence errors in production are high severity
        if (classification.confidence > 0.8 && context.environment === 'production') {
            return 'high';
        }

        // Persistent errors are medium to high severity
        if (classification.category === 'persistent') {
            return classification.confidence > 0.7 ? 'high' : 'medium';
        }

        // Transient errors are low to medium severity
        if (classification.category === 'transient') {
            return classification.confidence > 0.8 ? 'medium' : 'low';
        }

        return 'medium';
    }

    /**
     * Get suggested action for error
     * @param {Object} classification - Error classification
     * @returns {string} Suggested action
     * @private
     */
    _getSuggestedAction(classification) {
        const actionMap = {
            transient: {
                network: 'retry_with_backoff',
                resource: 'retry_with_resource_check',
                rate_limit: 'retry_with_rate_limiting',
                temporary: 'retry_with_delay'
            },
            persistent: {
                dependency: 'fix_dependencies',
                syntax: 'fix_syntax_errors',
                configuration: 'fix_configuration',
                test: 'fix_tests',
                build: 'fix_build_issues'
            },
            critical: {
                security: 'security_review',
                corruption: 'data_recovery',
                system: 'system_maintenance',
                database: 'database_recovery'
            }
        };

        const categoryActions = actionMap[classification.category];
        if (categoryActions && categoryActions[classification.type]) {
            return categoryActions[classification.type];
        }

        // Fallback actions based on category
        const fallbackActions = {
            transient: 'retry_with_backoff',
            persistent: 'manual_investigation',
            critical: 'immediate_attention'
        };

        return fallbackActions[classification.category] || 'manual_investigation';
    }

    /**
     * Update learning data for ML improvements
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @private
     */
    _updateLearningData(classification, context) {
        if (!this.config.updatePatterns) return;

        const key = `${classification.category}_${classification.type}`;
        const existing = this.learningData.get(key) || { count: 0, contexts: [] };
        
        existing.count++;
        existing.contexts.push({
            environment: context.environment,
            phase: context.phase,
            timestamp: Date.now()
        });

        // Keep only recent learning data (last 1000 entries)
        if (existing.contexts.length > 1000) {
            existing.contexts = existing.contexts.slice(-1000);
        }

        this.learningData.set(key, existing);
    }

    /**
     * Get classification statistics
     * @returns {Object} Statistics about classifications
     */
    getStatistics() {
        const stats = {
            totalClassifications: 0,
            byCategory: {},
            byType: {},
            learningDataSize: this.learningData.size
        };

        for (const [key, data] of this.learningData.entries()) {
            const [category, type] = key.split('_');
            stats.totalClassifications += data.count;
            stats.byCategory[category] = (stats.byCategory[category] || 0) + data.count;
            stats.byType[type] = (stats.byType[type] || 0) + data.count;
        }

        return stats;
    }

    /**
     * Export learning data for analysis
     * @returns {Object} Learning data export
     */
    exportLearningData() {
        const exported = {};
        for (const [key, data] of this.learningData.entries()) {
            exported[key] = {
                count: data.count,
                recentContexts: data.contexts.slice(-10) // Last 10 contexts
            };
        }
        return exported;
    }

    /**
     * Import learning data
     * @param {Object} data - Learning data to import
     */
    importLearningData(data) {
        for (const [key, value] of Object.entries(data)) {
            this.learningData.set(key, {
                count: value.count,
                contexts: value.recentContexts || []
            });
        }
    }

    /**
     * Reset learning data
     */
    resetLearningData() {
        this.learningData.clear();
    }
}

export default ErrorClassificationEngine;

