/**
 * error-classifier.js
 * 
 * Intelligent error classification system that categorizes errors by type,
 * severity, and determines appropriate resolution strategies.
 */

import { log } from '../../scripts/modules/utils.js';

// Error type definitions with resolution strategies
export const ErrorTypes = {
  SYNTAX_ERROR: {
    maxRetries: 3,
    strategy: 'auto-fix',
    severity: 'medium',
    escalationThreshold: 3,
    backoffMultiplier: 1.5,
    description: 'Code syntax errors that can be automatically fixed'
  },
  DEPENDENCY_ERROR: {
    maxRetries: 5,
    strategy: 'reinstall',
    severity: 'medium',
    escalationThreshold: 5,
    backoffMultiplier: 2.0,
    description: 'Missing or incompatible dependencies'
  },
  ENVIRONMENT_ERROR: {
    maxRetries: 2,
    strategy: 'reset-env',
    severity: 'high',
    escalationThreshold: 2,
    backoffMultiplier: 3.0,
    description: 'Environment configuration issues'
  },
  LOGIC_ERROR: {
    maxRetries: 1,
    strategy: 'escalate',
    severity: 'high',
    escalationThreshold: 1,
    backoffMultiplier: 1.0,
    description: 'Business logic errors requiring human intervention'
  },
  NETWORK_ERROR: {
    maxRetries: 10,
    strategy: 'retry-with-backoff',
    severity: 'low',
    escalationThreshold: 10,
    backoffMultiplier: 2.0,
    description: 'Network connectivity and timeout issues'
  },
  API_ERROR: {
    maxRetries: 5,
    strategy: 'retry-with-backoff',
    severity: 'medium',
    escalationThreshold: 5,
    backoffMultiplier: 2.0,
    description: 'API rate limits and service errors'
  },
  VALIDATION_ERROR: {
    maxRetries: 2,
    strategy: 'auto-fix',
    severity: 'medium',
    escalationThreshold: 2,
    backoffMultiplier: 1.5,
    description: 'Data validation and format errors'
  },
  RESOURCE_ERROR: {
    maxRetries: 3,
    strategy: 'retry-with-backoff',
    severity: 'high',
    escalationThreshold: 3,
    backoffMultiplier: 2.5,
    description: 'Resource exhaustion and memory issues'
  },
  AUTHENTICATION_ERROR: {
    maxRetries: 1,
    strategy: 'escalate',
    severity: 'high',
    escalationThreshold: 1,
    backoffMultiplier: 1.0,
    description: 'Authentication and authorization failures'
  },
  UNKNOWN_ERROR: {
    maxRetries: 2,
    strategy: 'escalate',
    severity: 'medium',
    escalationThreshold: 2,
    backoffMultiplier: 2.0,
    description: 'Unclassified errors requiring analysis'
  }
};

// Severity levels
export const SeverityLevels = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error classification patterns for automatic categorization
 */
const ERROR_PATTERNS = {
  SYNTAX_ERROR: [
    /syntax\s*error/i,
    /unexpected\s+token/i,
    /missing\s+semicolon/i,
    /unterminated\s+string/i,
    /invalid\s+syntax/i,
    /parse\s+error/i
  ],
  DEPENDENCY_ERROR: [
    /module\s+not\s+found/i,
    /cannot\s+resolve\s+module/i,
    /package\s+not\s+found/i,
    /dependency\s+missing/i,
    /npm\s+error/i,
    /yarn\s+error/i,
    /version\s+conflict/i
  ],
  ENVIRONMENT_ERROR: [
    /environment\s+variable/i,
    /config\s+not\s+found/i,
    /permission\s+denied/i,
    /enoent/i,
    /eacces/i,
    /path\s+not\s+found/i
  ],
  LOGIC_ERROR: [
    /assertion\s+failed/i,
    /business\s+logic/i,
    /invalid\s+state/i,
    /precondition\s+failed/i,
    /postcondition\s+failed/i
  ],
  NETWORK_ERROR: [
    /network\s+error/i,
    /connection\s+refused/i,
    /timeout/i,
    /econnrefused/i,
    /enotfound/i,
    /socket\s+hang\s+up/i,
    /request\s+timeout/i
  ],
  API_ERROR: [
    /rate\s+limit/i,
    /api\s+error/i,
    /service\s+unavailable/i,
    /bad\s+gateway/i,
    /internal\s+server\s+error/i,
    /too\s+many\s+requests/i,
    /quota\s+exceeded/i
  ],
  VALIDATION_ERROR: [
    /validation\s+error/i,
    /invalid\s+input/i,
    /schema\s+validation/i,
    /type\s+error/i,
    /format\s+error/i
  ],
  RESOURCE_ERROR: [
    /out\s+of\s+memory/i,
    /heap\s+out\s+of\s+memory/i,
    /resource\s+exhausted/i,
    /disk\s+full/i,
    /enomem/i
  ],
  AUTHENTICATION_ERROR: [
    /unauthorized/i,
    /authentication\s+failed/i,
    /invalid\s+credentials/i,
    /access\s+denied/i,
    /forbidden/i,
    /token\s+expired/i
  ]
};

/**
 * Enhanced error classifier that analyzes errors and determines appropriate handling
 */
export class ErrorClassifier {
  constructor() {
    this.classificationCache = new Map();
    this.patternMatches = new Map();
  }

  /**
   * Classify an error and return its type, severity, and handling strategy
   * @param {Error|string} error - The error to classify
   * @param {object} context - Additional context about the error
   * @returns {object} Classification result
   */
  classify(error, context = {}) {
    const errorMessage = this._extractErrorMessage(error);
    const errorStack = error?.stack || '';
    const errorCode = error?.code || context.code;
    const httpStatus = error?.status || context.status;

    // Check cache first
    const cacheKey = this._generateCacheKey(errorMessage, errorCode, httpStatus);
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey);
    }

    // Perform classification
    const classification = this._performClassification(
      errorMessage,
      errorStack,
      errorCode,
      httpStatus,
      context
    );

    // Cache the result
    this.classificationCache.set(cacheKey, classification);

    // Log classification for analytics
    this._logClassification(classification, error, context);

    return classification;
  }

  /**
   * Perform the actual error classification
   * @private
   */
  _performClassification(errorMessage, errorStack, errorCode, httpStatus, context) {
    let errorType = 'UNKNOWN_ERROR';
    let confidence = 0;
    let matchedPatterns = [];

    // Check HTTP status codes first
    if (httpStatus) {
      const statusClassification = this._classifyByHttpStatus(httpStatus);
      if (statusClassification) {
        errorType = statusClassification.type;
        confidence = statusClassification.confidence;
        matchedPatterns.push(`HTTP ${httpStatus}`);
      }
    }

    // Check error codes
    if (errorCode && confidence < 0.9) {
      const codeClassification = this._classifyByErrorCode(errorCode);
      if (codeClassification && codeClassification.confidence > confidence) {
        errorType = codeClassification.type;
        confidence = codeClassification.confidence;
        matchedPatterns.push(`Code: ${errorCode}`);
      }
    }

    // Pattern matching on error message
    if (confidence < 0.9) {
      const patternClassification = this._classifyByPatterns(errorMessage);
      if (patternClassification && patternClassification.confidence > confidence) {
        errorType = patternClassification.type;
        confidence = patternClassification.confidence;
        matchedPatterns = matchedPatterns.concat(patternClassification.patterns);
      }
    }

    // Context-based classification
    const contextClassification = this._classifyByContext(context);
    if (contextClassification && contextClassification.confidence > confidence) {
      errorType = contextClassification.type;
      confidence = contextClassification.confidence;
      matchedPatterns.push('Context-based');
    }

    const errorConfig = ErrorTypes[errorType];
    const severity = this._determineSeverity(errorType, context, confidence);

    return {
      type: errorType,
      severity,
      confidence,
      matchedPatterns,
      strategy: errorConfig.strategy,
      maxRetries: errorConfig.maxRetries,
      escalationThreshold: errorConfig.escalationThreshold,
      backoffMultiplier: errorConfig.backoffMultiplier,
      description: errorConfig.description,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        errorMessage: errorMessage.substring(0, 500), // Truncate for storage
        errorCode,
        httpStatus
      }
    };
  }

  /**
   * Classify error by HTTP status code
   * @private
   */
  _classifyByHttpStatus(status) {
    const statusRanges = {
      400: { type: 'VALIDATION_ERROR', confidence: 0.8 },
      401: { type: 'AUTHENTICATION_ERROR', confidence: 0.95 },
      403: { type: 'AUTHENTICATION_ERROR', confidence: 0.9 },
      404: { type: 'DEPENDENCY_ERROR', confidence: 0.7 },
      408: { type: 'NETWORK_ERROR', confidence: 0.9 },
      429: { type: 'API_ERROR', confidence: 0.95 },
      500: { type: 'API_ERROR', confidence: 0.8 },
      502: { type: 'NETWORK_ERROR', confidence: 0.85 },
      503: { type: 'API_ERROR', confidence: 0.9 },
      504: { type: 'NETWORK_ERROR', confidence: 0.9 }
    };

    return statusRanges[status] || null;
  }

  /**
   * Classify error by error code
   * @private
   */
  _classifyByErrorCode(code) {
    const codeMap = {
      'ENOENT': { type: 'ENVIRONMENT_ERROR', confidence: 0.9 },
      'EACCES': { type: 'ENVIRONMENT_ERROR', confidence: 0.9 },
      'ECONNREFUSED': { type: 'NETWORK_ERROR', confidence: 0.95 },
      'ENOTFOUND': { type: 'NETWORK_ERROR', confidence: 0.9 },
      'ETIMEDOUT': { type: 'NETWORK_ERROR', confidence: 0.95 },
      'ENOMEM': { type: 'RESOURCE_ERROR', confidence: 0.95 },
      'MODULE_NOT_FOUND': { type: 'DEPENDENCY_ERROR', confidence: 0.9 }
    };

    return codeMap[code] || null;
  }

  /**
   * Classify error by pattern matching
   * @private
   */
  _classifyByPatterns(errorMessage) {
    let bestMatch = null;
    let highestConfidence = 0;
    let matchedPatterns = [];

    for (const [errorType, patterns] of Object.entries(ERROR_PATTERNS)) {
      let matches = 0;
      let typePatterns = [];

      for (const pattern of patterns) {
        if (pattern.test(errorMessage)) {
          matches++;
          typePatterns.push(pattern.source);
        }
      }

      if (matches > 0) {
        const confidence = Math.min(0.95, 0.6 + (matches * 0.1));
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = errorType;
          matchedPatterns = typePatterns;
        }
      }
    }

    return bestMatch ? {
      type: bestMatch,
      confidence: highestConfidence,
      patterns: matchedPatterns
    } : null;
  }

  /**
   * Classify error by context information
   * @private
   */
  _classifyByContext(context) {
    if (context.operation) {
      const operationMap = {
        'api_call': { type: 'API_ERROR', confidence: 0.7 },
        'file_operation': { type: 'ENVIRONMENT_ERROR', confidence: 0.7 },
        'network_request': { type: 'NETWORK_ERROR', confidence: 0.8 },
        'validation': { type: 'VALIDATION_ERROR', confidence: 0.8 },
        'authentication': { type: 'AUTHENTICATION_ERROR', confidence: 0.9 }
      };

      return operationMap[context.operation] || null;
    }

    return null;
  }

  /**
   * Determine error severity based on type and context
   * @private
   */
  _determineSeverity(errorType, context, confidence) {
    const baseSeverity = ErrorTypes[errorType]?.severity || 'medium';
    
    // Adjust severity based on context
    if (context.critical || context.production) {
      return 'critical';
    }

    if (context.retryCount > 5) {
      return 'high';
    }

    if (confidence < 0.5) {
      return 'medium'; // Uncertain classifications get medium severity
    }

    return baseSeverity;
  }

  /**
   * Extract error message from various error formats
   * @private
   */
  _extractErrorMessage(error) {
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.data?.error?.message) {
      return error.data.error.message;
    }

    if (error?.error?.message) {
      return error.error.message;
    }

    return String(error);
  }

  /**
   * Generate cache key for classification results
   * @private
   */
  _generateCacheKey(message, code, status) {
    const key = `${message.substring(0, 100)}_${code || 'none'}_${status || 'none'}`;
    return key.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Log classification for analytics
   * @private
   */
  _logClassification(classification, originalError, context) {
    log('debug', 'Error classified:', {
      type: classification.type,
      severity: classification.severity,
      confidence: classification.confidence,
      strategy: classification.strategy,
      patterns: classification.matchedPatterns,
      context: context.operation || 'unknown'
    });
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return {
      cacheSize: this.classificationCache.size,
      patternMatchCount: this.patternMatches.size,
      supportedErrorTypes: Object.keys(ErrorTypes).length
    };
  }

  /**
   * Clear classification cache
   */
  clearCache() {
    this.classificationCache.clear();
    this.patternMatches.clear();
  }
}

// Export singleton instance
export const errorClassifier = new ErrorClassifier();

