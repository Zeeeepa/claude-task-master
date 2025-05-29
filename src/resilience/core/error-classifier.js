/**
 * error-classifier.js
 * Unified error classification and routing system
 * Consolidates all error handling patterns into a single framework
 */

// Error Categories for unified classification
export const ERROR_CATEGORIES = {
  NETWORK: 'network',
  RATE_LIMIT: 'rate_limit', 
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  RESOURCE: 'resource',
  SYSTEM: 'system',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown'
};

// Error Severity Levels
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium', 
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Recovery Strategies
export const RECOVERY_STRATEGIES = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  CIRCUIT_BREAK: 'circuit_break',
  GRACEFUL_DEGRADE: 'graceful_degrade',
  FAIL_FAST: 'fail_fast',
  MANUAL_INTERVENTION: 'manual_intervention'
};

/**
 * Unified error classification system
 * Replaces scattered error detection logic across the codebase
 */
export class ErrorClassifier {
  constructor() {
    this.classificationRules = new Map();
    this._initializeDefaultRules();
  }

  /**
   * Initialize default classification rules
   * Consolidates logic from ai-services-unified.js and other modules
   */
  _initializeDefaultRules() {
    // Network-related errors (from ai-services-unified.js)
    this.addRule({
      category: ERROR_CATEGORIES.NETWORK,
      severity: ERROR_SEVERITY.MEDIUM,
      strategy: RECOVERY_STRATEGIES.RETRY,
      patterns: [
        /network error/i,
        /connection refused/i,
        /timeout/i,
        /econnreset/i,
        /enotfound/i
      ],
      statusCodes: [502, 503, 504]
    });

    // Rate limiting (from ai-services-unified.js)
    this.addRule({
      category: ERROR_CATEGORIES.RATE_LIMIT,
      severity: ERROR_SEVERITY.MEDIUM,
      strategy: RECOVERY_STRATEGIES.RETRY,
      patterns: [/rate limit/i, /too many requests/i],
      statusCodes: [429]
    });

    // Service overload (from ai-services-unified.js)
    this.addRule({
      category: ERROR_CATEGORIES.SYSTEM,
      severity: ERROR_SEVERITY.HIGH,
      strategy: RECOVERY_STRATEGIES.FALLBACK,
      patterns: [
        /overloaded/i,
        /service temporarily unavailable/i,
        /internal server error/i
      ],
      statusCodes: [500, 501, 502, 503, 504, 505]
    });

    // Authentication errors
    this.addRule({
      category: ERROR_CATEGORIES.AUTHENTICATION,
      severity: ERROR_SEVERITY.HIGH,
      strategy: RECOVERY_STRATEGIES.FAIL_FAST,
      patterns: [/unauthorized/i, /invalid.*key/i, /authentication/i],
      statusCodes: [401]
    });

    // Authorization errors
    this.addRule({
      category: ERROR_CATEGORIES.AUTHORIZATION,
      severity: ERROR_SEVERITY.HIGH,
      strategy: RECOVERY_STRATEGIES.FAIL_FAST,
      patterns: [/forbidden/i, /access denied/i],
      statusCodes: [403]
    });

    // Validation errors (from MCP server patterns)
    this.addRule({
      category: ERROR_CATEGORIES.VALIDATION,
      severity: ERROR_SEVERITY.LOW,
      strategy: RECOVERY_STRATEGIES.FAIL_FAST,
      patterns: [
        /validation.*error/i,
        /invalid.*input/i,
        /missing.*required/i,
        /bad request/i
      ],
      statusCodes: [400, 422]
    });

    // Resource errors
    this.addRule({
      category: ERROR_CATEGORIES.RESOURCE,
      severity: ERROR_SEVERITY.MEDIUM,
      strategy: RECOVERY_STRATEGIES.GRACEFUL_DEGRADE,
      patterns: [
        /not found/i,
        /file.*not.*found/i,
        /resource.*unavailable/i
      ],
      statusCodes: [404, 410]
    });
  }

  /**
   * Add a new classification rule
   * @param {Object} rule - Classification rule
   */
  addRule(rule) {
    const ruleId = `${rule.category}_${Date.now()}`;
    this.classificationRules.set(ruleId, rule);
  }

  /**
   * Classify an error and determine recovery strategy
   * @param {Error|Object} error - Error to classify
   * @returns {Object} Classification result
   */
  classify(error) {
    const errorMessage = error.message || error.toString() || '';
    const statusCode = error.status || error.statusCode || error.code;

    // Try to match against classification rules
    for (const [ruleId, rule] of this.classificationRules) {
      if (this._matchesRule(error, errorMessage, statusCode, rule)) {
        return {
          category: rule.category,
          severity: rule.severity,
          strategy: rule.strategy,
          retryable: this._isRetryable(rule.strategy),
          ruleId,
          originalError: error,
          timestamp: new Date().toISOString(),
          context: this._extractContext(error)
        };
      }
    }

    // Default classification for unknown errors
    return {
      category: ERROR_CATEGORIES.UNKNOWN,
      severity: ERROR_SEVERITY.MEDIUM,
      strategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION,
      retryable: false,
      ruleId: 'default',
      originalError: error,
      timestamp: new Date().toISOString(),
      context: this._extractContext(error)
    };
  }

  /**
   * Check if error matches a classification rule
   * @param {Error} error - Original error
   * @param {string} errorMessage - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} rule - Classification rule
   * @returns {boolean} Whether error matches rule
   */
  _matchesRule(error, errorMessage, statusCode, rule) {
    // Check status code match
    if (rule.statusCodes && statusCode && rule.statusCodes.includes(statusCode)) {
      return true;
    }

    // Check pattern match
    if (rule.patterns) {
      return rule.patterns.some(pattern => pattern.test(errorMessage));
    }

    return false;
  }

  /**
   * Determine if a recovery strategy allows retries
   * @param {string} strategy - Recovery strategy
   * @returns {boolean} Whether strategy is retryable
   */
  _isRetryable(strategy) {
    return [
      RECOVERY_STRATEGIES.RETRY,
      RECOVERY_STRATEGIES.FALLBACK,
      RECOVERY_STRATEGIES.CIRCUIT_BREAK
    ].includes(strategy);
  }

  /**
   * Extract relevant context from error
   * @param {Error} error - Error object
   * @returns {Object} Error context
   */
  _extractContext(error) {
    return {
      stack: error.stack,
      name: error.name,
      code: error.code,
      status: error.status || error.statusCode,
      details: error.details || error.data,
      timestamp: error.timestamp || new Date().toISOString()
    };
  }

  /**
   * Get statistics about error classifications
   * @returns {Object} Classification statistics
   */
  getStats() {
    const stats = {
      totalRules: this.classificationRules.size,
      categoryCounts: {},
      severityCounts: {},
      strategyCounts: {}
    };

    for (const rule of this.classificationRules.values()) {
      stats.categoryCounts[rule.category] = (stats.categoryCounts[rule.category] || 0) + 1;
      stats.severityCounts[rule.severity] = (stats.severityCounts[rule.severity] || 0) + 1;
      stats.strategyCounts[rule.strategy] = (stats.strategyCounts[rule.strategy] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const errorClassifier = new ErrorClassifier();

