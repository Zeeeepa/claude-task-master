/**
 * @fileoverview Simple Logger Utility
 * @description Basic logging functionality for the orchestration system
 */

/**
 * Log levels
 */
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * Current log level (can be overridden by environment)
 */
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

/**
 * Log a message with specified level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function log(level, message, metadata = {}) {
  const levelValue = LOG_LEVELS[level.toUpperCase()];
  
  if (levelValue <= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };
    
    // Format for console output
    const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    switch (level.toLowerCase()) {
      case 'error':
        console.error(formattedMessage, metadata);
        break;
      case 'warn':
        console.warn(formattedMessage, metadata);
        break;
      case 'debug':
        console.debug(formattedMessage, metadata);
        break;
      default:
        console.log(formattedMessage, metadata);
    }
  }
}

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Object} metadata - Additional metadata
 */
export function error(message, metadata = {}) {
  log('error', message, metadata);
}

/**
 * Log warning message
 * @param {string} message - Warning message
 * @param {Object} metadata - Additional metadata
 */
export function warn(message, metadata = {}) {
  log('warn', message, metadata);
}

/**
 * Log info message
 * @param {string} message - Info message
 * @param {Object} metadata - Additional metadata
 */
export function info(message, metadata = {}) {
  log('info', message, metadata);
}

/**
 * Log debug message
 * @param {string} message - Debug message
 * @param {Object} metadata - Additional metadata
 */
export function debug(message, metadata = {}) {
  log('debug', message, metadata);
}

