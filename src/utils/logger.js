/**
 * Logger Utility
 * Centralized logging system for Task Master orchestrator
 * 
 * Provides structured logging with multiple levels, formatting options,
 * and output destinations for comprehensive system monitoring.
 */

import { createWriteStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Logger class for centralized logging
 */
export class Logger {
    constructor(options = {}) {
        this.options = {
            level: process.env.LOG_LEVEL || 'info',
            format: process.env.LOG_FORMAT || 'json',
            console: true,
            file: false,
            filePath: resolve(__dirname, '../../logs/taskmaster.log'),
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            ...options
        };

        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };

        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m', // Magenta
            trace: '\x1b[37m', // White
            reset: '\x1b[0m'
        };

        this.fileStream = null;
        this.currentFileSize = 0;
        this.fileIndex = 0;

        this._initializeFileLogging();
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        this._log('error', message, ...args);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        this._log('warn', message, ...args);
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        this._log('info', message, ...args);
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        this._log('debug', message, ...args);
    }

    /**
     * Log a trace message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    trace(message, ...args) {
        this._log('trace', message, ...args);
    }

    /**
     * Create a child logger with additional context
     * @param {Object} context - Additional context to include in logs
     * @returns {Logger} Child logger instance
     */
    child(context) {
        const childLogger = new Logger(this.options);
        childLogger.context = { ...this.context, ...context };
        return childLogger;
    }

    /**
     * Set the logging level
     * @param {string} level - New logging level
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.options.level = level;
        } else {
            throw new Error(`Invalid log level: ${level}`);
        }
    }

    /**
     * Get the current logging level
     * @returns {string} Current logging level
     */
    getLevel() {
        return this.options.level;
    }

    /**
     * Check if a level is enabled
     * @param {string} level - Level to check
     * @returns {boolean} True if level is enabled
     */
    isLevelEnabled(level) {
        return this.levels[level] <= this.levels[this.options.level];
    }

    /**
     * Close the logger and cleanup resources
     */
    close() {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
        }
    }

    /**
     * Internal logging method
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     * @private
     */
    _log(level, message, ...args) {
        if (!this.isLevelEnabled(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = this._createLogEntry(level, message, timestamp, args);

        if (this.options.console) {
            this._writeToConsole(logEntry);
        }

        if (this.options.file && this.fileStream) {
            this._writeToFile(logEntry);
        }
    }

    /**
     * Create a structured log entry
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {string} timestamp - Timestamp
     * @param {Array} args - Additional arguments
     * @returns {Object} Log entry object
     * @private
     */
    _createLogEntry(level, message, timestamp, args) {
        const entry = {
            timestamp,
            level,
            message,
            pid: process.pid,
            hostname: process.env.HOSTNAME || 'localhost',
            service: 'taskmaster-orchestrator'
        };

        // Add context if available
        if (this.context) {
            entry.context = this.context;
        }

        // Process additional arguments
        if (args.length > 0) {
            // If first arg is an Error object
            if (args[0] instanceof Error) {
                entry.error = {
                    name: args[0].name,
                    message: args[0].message,
                    stack: args[0].stack
                };
                args = args.slice(1);
            }

            // Add remaining args as data
            if (args.length > 0) {
                entry.data = args.length === 1 ? args[0] : args;
            }
        }

        return entry;
    }

    /**
     * Write log entry to console
     * @param {Object} logEntry - Log entry to write
     * @private
     */
    _writeToConsole(logEntry) {
        let output;

        if (this.options.format === 'json') {
            output = JSON.stringify(logEntry);
        } else {
            const color = this.colors[logEntry.level] || '';
            const reset = this.colors.reset;
            const levelStr = logEntry.level.toUpperCase().padEnd(5);
            
            output = `${color}[${logEntry.timestamp}] ${levelStr}${reset} ${logEntry.message}`;
            
            if (logEntry.error) {
                output += `\n${logEntry.error.stack}`;
            }
            
            if (logEntry.data) {
                output += `\n${JSON.stringify(logEntry.data, null, 2)}`;
            }
        }

        // Use appropriate console method based on level
        switch (logEntry.level) {
            case 'error':
                console.error(output);
                break;
            case 'warn':
                console.warn(output);
                break;
            default:
                console.log(output);
        }
    }

    /**
     * Write log entry to file
     * @param {Object} logEntry - Log entry to write
     * @private
     */
    _writeToFile(logEntry) {
        if (!this.fileStream) {
            return;
        }

        const output = JSON.stringify(logEntry) + '\n';
        const outputSize = Buffer.byteLength(output, 'utf8');

        // Check if we need to rotate the log file
        if (this.currentFileSize + outputSize > this.options.maxFileSize) {
            this._rotateLogFile();
        }

        this.fileStream.write(output);
        this.currentFileSize += outputSize;
    }

    /**
     * Initialize file logging
     * @private
     */
    _initializeFileLogging() {
        if (!this.options.file) {
            return;
        }

        try {
            // Ensure log directory exists
            const logDir = dirname(this.options.filePath);
            if (!existsSync(logDir)) {
                mkdirSync(logDir, { recursive: true });
            }

            // Create file stream
            this.fileStream = createWriteStream(this.options.filePath, { flags: 'a' });
            
            // Get current file size
            try {
                const stats = require('fs').statSync(this.options.filePath);
                this.currentFileSize = stats.size;
            } catch (error) {
                this.currentFileSize = 0;
            }

            // Handle stream errors
            this.fileStream.on('error', (error) => {
                console.error('Log file stream error:', error);
                this.options.file = false; // Disable file logging on error
            });

        } catch (error) {
            console.error('Failed to initialize file logging:', error);
            this.options.file = false;
        }
    }

    /**
     * Rotate log file when it gets too large
     * @private
     */
    _rotateLogFile() {
        if (!this.fileStream) {
            return;
        }

        try {
            // Close current stream
            this.fileStream.end();

            // Rotate existing files
            const basePath = this.options.filePath;
            const extension = '.log';
            const baseName = basePath.replace(extension, '');

            // Move existing rotated files
            for (let i = this.options.maxFiles - 1; i > 0; i--) {
                const oldFile = `${baseName}.${i}${extension}`;
                const newFile = `${baseName}.${i + 1}${extension}`;
                
                if (existsSync(oldFile)) {
                    if (i === this.options.maxFiles - 1) {
                        // Delete the oldest file
                        require('fs').unlinkSync(oldFile);
                    } else {
                        require('fs').renameSync(oldFile, newFile);
                    }
                }
            }

            // Move current file to .1
            if (existsSync(basePath)) {
                require('fs').renameSync(basePath, `${baseName}.1${extension}`);
            }

            // Create new file stream
            this.fileStream = createWriteStream(this.options.filePath, { flags: 'a' });
            this.currentFileSize = 0;

        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }
}

// Create and export singleton logger instance
export const logger = new Logger({
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    console: true,
    file: process.env.LOG_FILE === 'true'
});

// Export Logger class for custom instances
export default Logger;

