/**
 * Centralized Logging Utility
 * 
 * Provides structured logging for the AI Development Orchestrator
 * with different log levels and output formatting.
 */

import chalk from 'chalk';

class Logger {
    constructor() {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = process.env.LOG_LEVEL || 'info';
        this.colors = {
            error: chalk.red,
            warn: chalk.yellow,
            info: chalk.blue,
            debug: chalk.gray
        };
    }
    
    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {Error|Object} error - Optional error object
     */
    error(message, error = null) {
        this.log('error', message, error);
    }
    
    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {Object} meta - Optional metadata
     */
    warn(message, meta = null) {
        this.log('warn', message, meta);
    }
    
    /**
     * Log an info message
     * @param {string} message - The message to log
     * @param {Object} meta - Optional metadata
     */
    info(message, meta = null) {
        this.log('info', message, meta);
    }
    
    /**
     * Log a debug message
     * @param {string} message - The message to log
     * @param {Object} meta - Optional metadata
     */
    debug(message, meta = null) {
        this.log('debug', message, meta);
    }
    
    /**
     * Log a message with the specified level
     * @param {string} level - Log level
     * @param {string} message - The message to log
     * @param {Object} meta - Optional metadata
     */
    log(level, message, meta = null) {
        if (this.levels[level] > this.levels[this.currentLevel]) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const colorFn = this.colors[level] || chalk.white;
        const levelStr = level.toUpperCase().padEnd(5);
        
        let logMessage = `${chalk.gray(timestamp)} ${colorFn(levelStr)} ${message}`;
        
        if (meta) {
            if (meta instanceof Error) {
                logMessage += `\n${chalk.red(meta.stack)}`;
            } else if (typeof meta === 'object') {
                logMessage += `\n${JSON.stringify(meta, null, 2)}`;
            } else {
                logMessage += ` ${meta}`;
            }
        }
        
        console.log(logMessage);
    }
    
    /**
     * Set the current log level
     * @param {string} level - The log level to set
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.currentLevel = level;
        } else {
            throw new Error(`Invalid log level: ${level}`);
        }
    }
    
    /**
     * Get the current log level
     */
    getLevel() {
        return this.currentLevel;
    }
    
    /**
     * Create a child logger with a prefix
     * @param {string} prefix - Prefix for all log messages
     */
    child(prefix) {
        return new ChildLogger(this, prefix);
    }
}

class ChildLogger {
    constructor(parent, prefix) {
        this.parent = parent;
        this.prefix = prefix;
    }
    
    error(message, error = null) {
        this.parent.error(`[${this.prefix}] ${message}`, error);
    }
    
    warn(message, meta = null) {
        this.parent.warn(`[${this.prefix}] ${message}`, meta);
    }
    
    info(message, meta = null) {
        this.parent.info(`[${this.prefix}] ${message}`, meta);
    }
    
    debug(message, meta = null) {
        this.parent.debug(`[${this.prefix}] ${message}`, meta);
    }
    
    child(prefix) {
        return new ChildLogger(this.parent, `${this.prefix}:${prefix}`);
    }
}

// Create and export a default logger instance
export const logger = new Logger();
export default logger;

