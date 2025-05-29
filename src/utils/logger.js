/**
 * @fileoverview Simple Logger Utility
 * @description Basic logging functionality for the Codegen integration
 */

/**
 * Log levels
 */
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

/**
 * Current log level (can be set via environment variable)
 */
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

/**
 * Log a message with specified level
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function log(level, message, metadata = {}) {
    const levelValue = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    
    // Skip if log level is below current threshold
    if (levelValue < CURRENT_LOG_LEVEL) {
        return;
    }
    
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...metadata
    };
    
    // Format output
    const output = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    // Output to appropriate stream
    switch (level) {
        case 'error':
            console.error(output, metadata);
            break;
        case 'warn':
            console.warn(output, metadata);
            break;
        case 'debug':
            console.debug(output, metadata);
            break;
        default:
            console.log(output, metadata);
    }
}

/**
 * Log debug message
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function debug(message, metadata = {}) {
    log('debug', message, metadata);
}

/**
 * Log info message
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function info(message, metadata = {}) {
    log('info', message, metadata);
}

/**
 * Log warning message
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function warn(message, metadata = {}) {
    log('warn', message, metadata);
}

/**
 * Log error message
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function error(message, metadata = {}) {
    log('error', message, metadata);
}

export default { log, debug, info, warn, error };

