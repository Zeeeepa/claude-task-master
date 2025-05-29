/**
 * unified-logger.js
 * Comprehensive error logging and reporting pipeline
 * Consolidates logging approaches from across the codebase
 */

import chalk from 'chalk';

// Log levels with numeric priorities
export const LOG_LEVELS = {
  TRACE: { name: 'trace', priority: 0, color: chalk.gray },
  DEBUG: { name: 'debug', priority: 1, color: chalk.gray },
  INFO: { name: 'info', priority: 2, color: chalk.blue },
  WARN: { name: 'warn', priority: 3, color: chalk.yellow },
  ERROR: { name: 'error', priority: 4, color: chalk.red },
  FATAL: { name: 'fatal', priority: 5, color: chalk.redBright }
};

// Log contexts for categorizing logs
export const LOG_CONTEXTS = {
  SYSTEM: 'system',
  NETWORK: 'network', 
  AUTH: 'auth',
  VALIDATION: 'validation',
  BUSINESS: 'business',
  PERFORMANCE: 'performance',
  SECURITY: 'security'
};

/**
 * Unified logger with structured logging and multiple outputs
 * Consolidates logging from mcp-server/src/logger.js and other modules
 */
export class UnifiedLogger {
  constructor(config = {}) {
    this.config = {
      level: LOG_LEVELS.INFO,
      enableColors: true,
      enableTimestamps: true,
      enableContext: true,
      outputs: ['console'], // console, file, remote
      silentMode: false,
      maxLogSize: 1000000, // 1MB
      ...config
    };
    
    this.logBuffer = [];
    this.errorMetrics = {
      errorCounts: new Map(),
      errorRates: new Map(),
      lastReset: Date.now()
    };
  }

  /**
   * Log a message with specified level and context
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @param {string} context - Log context
   */
  log(level, message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    const logLevel = typeof level === 'string' 
      ? Object.values(LOG_LEVELS).find(l => l.name === level.toLowerCase())
      : level;

    if (!logLevel || logLevel.priority < this.config.level.priority) {
      return;
    }

    if (this.config.silentMode) {
      return;
    }

    const logEntry = this._createLogEntry(logLevel, message, meta, context);
    
    // Add to buffer for analysis
    this._addToBuffer(logEntry);
    
    // Update error metrics
    if (logLevel.priority >= LOG_LEVELS.ERROR.priority) {
      this._updateErrorMetrics(logEntry);
    }
    
    // Output to configured destinations
    this._output(logEntry);
  }

  /**
   * Create structured log entry
   * @param {Object} level - Log level object
   * @param {string} message - Log message
   * @param {Object} meta - Metadata
   * @param {string} context - Log context
   * @returns {Object} Structured log entry
   */
  _createLogEntry(level, message, meta, context) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.name,
      message,
      context,
      meta: { ...meta },
      pid: process.pid
    };

    // Add stack trace for errors
    if (level.priority >= LOG_LEVELS.ERROR.priority && meta.error) {
      entry.stack = meta.error.stack;
      entry.errorName = meta.error.name;
      entry.errorCode = meta.error.code;
    }

    // Add request ID if available
    if (meta.requestId) {
      entry.requestId = meta.requestId;
    }

    return entry;
  }

  /**
   * Output log entry to configured destinations
   * @param {Object} entry - Log entry
   */
  _output(entry) {
    for (const output of this.config.outputs) {
      switch (output) {
        case 'console':
          this._outputToConsole(entry);
          break;
        case 'file':
          this._outputToFile(entry);
          break;
        case 'remote':
          this._outputToRemote(entry);
          break;
      }
    }
  }

  /**
   * Output to console with formatting
   * @param {Object} entry - Log entry
   */
  _outputToConsole(entry) {
    const level = LOG_LEVELS[entry.level.toUpperCase()];
    const colorFn = this.config.enableColors ? level.color : (text) => text;
    
    let output = '';
    
    // Add timestamp
    if (this.config.enableTimestamps) {
      output += chalk.gray(`[${entry.timestamp}] `);
    }
    
    // Add level
    output += colorFn(`[${entry.level.toUpperCase()}]`);
    
    // Add context
    if (this.config.enableContext && entry.context) {
      output += chalk.cyan(` [${entry.context}]`);
    }
    
    // Add message
    output += ` ${colorFn(entry.message)}`;
    
    // Add metadata
    if (Object.keys(entry.meta).length > 0) {
      output += chalk.gray(` ${JSON.stringify(entry.meta)}`);
    }
    
    console.log(output);
    
    // Add stack trace for errors
    if (entry.stack) {
      console.log(chalk.gray(entry.stack));
    }
  }

  /**
   * Output to file (placeholder for file logging)
   * @param {Object} entry - Log entry
   */
  _outputToFile(entry) {
    // TODO: Implement file logging
    // This would write to rotating log files
  }

  /**
   * Output to remote logging service (placeholder)
   * @param {Object} entry - Log entry
   */
  _outputToRemote(entry) {
    // TODO: Implement remote logging
    // This would send to external logging services
  }

  /**
   * Add log entry to buffer for analysis
   * @param {Object} entry - Log entry
   */
  _addToBuffer(entry) {
    this.logBuffer.push(entry);
    
    // Trim buffer if it gets too large
    if (this.logBuffer.length > 1000) {
      this.logBuffer = this.logBuffer.slice(-500);
    }
  }

  /**
   * Update error metrics
   * @param {Object} entry - Log entry
   */
  _updateErrorMetrics(entry) {
    const errorKey = `${entry.context}:${entry.level}`;
    const currentCount = this.errorMetrics.errorCounts.get(errorKey) || 0;
    this.errorMetrics.errorCounts.set(errorKey, currentCount + 1);
    
    // Calculate error rate (errors per minute)
    const now = Date.now();
    const timeWindow = 60000; // 1 minute
    const recentErrors = this.logBuffer.filter(
      e => e.level === 'error' && 
      (now - new Date(e.timestamp).getTime()) < timeWindow
    ).length;
    
    this.errorMetrics.errorRates.set(entry.context, recentErrors);
  }

  /**
   * Convenience methods for different log levels
   */
  trace(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.TRACE, message, meta, context);
  }

  debug(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.DEBUG, message, meta, context);
  }

  info(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.INFO, message, meta, context);
  }

  warn(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.WARN, message, meta, context);
  }

  error(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.ERROR, message, meta, context);
  }

  fatal(message, meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.log(LOG_LEVELS.FATAL, message, meta, context);
  }

  /**
   * Log an error with full context
   * @param {Error} error - Error object
   * @param {string} message - Additional message
   * @param {Object} meta - Additional metadata
   * @param {string} context - Log context
   */
  logError(error, message = '', meta = {}, context = LOG_CONTEXTS.SYSTEM) {
    this.error(
      message || error.message,
      { ...meta, error },
      context
    );
  }

  /**
   * Get error metrics and statistics
   * @returns {Object} Error metrics
   */
  getErrorMetrics() {
    return {
      errorCounts: Object.fromEntries(this.errorMetrics.errorCounts),
      errorRates: Object.fromEntries(this.errorMetrics.errorRates),
      totalErrors: Array.from(this.errorMetrics.errorCounts.values())
        .reduce((sum, count) => sum + count, 0),
      lastReset: this.errorMetrics.lastReset,
      bufferSize: this.logBuffer.length
    };
  }

  /**
   * Get recent log entries
   * @param {number} count - Number of entries to return
   * @param {string} level - Filter by log level
   * @returns {Array} Recent log entries
   */
  getRecentLogs(count = 100, level = null) {
    let logs = this.logBuffer.slice(-count);
    
    if (level) {
      logs = logs.filter(entry => entry.level === level);
    }
    
    return logs;
  }

  /**
   * Clear log buffer and reset metrics
   */
  clearLogs() {
    this.logBuffer = [];
    this.errorMetrics.errorCounts.clear();
    this.errorMetrics.errorRates.clear();
    this.errorMetrics.lastReset = Date.now();
  }

  /**
   * Update logger configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Create a child logger with additional context
   * @param {string} context - Child context
   * @param {Object} meta - Additional metadata
   * @returns {Object} Child logger
   */
  child(context, meta = {}) {
    const parentLogger = this;
    
    return {
      trace: (message, additionalMeta = {}) => 
        parentLogger.trace(message, { ...meta, ...additionalMeta }, context),
      debug: (message, additionalMeta = {}) => 
        parentLogger.debug(message, { ...meta, ...additionalMeta }, context),
      info: (message, additionalMeta = {}) => 
        parentLogger.info(message, { ...meta, ...additionalMeta }, context),
      warn: (message, additionalMeta = {}) => 
        parentLogger.warn(message, { ...meta, ...additionalMeta }, context),
      error: (message, additionalMeta = {}) => 
        parentLogger.error(message, { ...meta, ...additionalMeta }, context),
      fatal: (message, additionalMeta = {}) => 
        parentLogger.fatal(message, { ...meta, ...additionalMeta }, context),
      logError: (error, message = '', additionalMeta = {}) =>
        parentLogger.logError(error, message, { ...meta, ...additionalMeta }, context)
    };
  }
}

// Export singleton instance
export const unifiedLogger = new UnifiedLogger();

