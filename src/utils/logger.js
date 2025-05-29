/**
 * @fileoverview Unified Logger Utility
 * @description Centralized logging system for the webhook consolidation
 * @version 1.0.0
 */

/**
 * Simple logger implementation for webhook system
 */
class Logger {
    constructor(options = {}) {
        this.level = options.level || process.env.LOG_LEVEL || 'info';
        this.component = options.component || 'app';
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp !== false;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }

    child(options = {}) {
        return new Logger({
            level: this.level,
            enableColors: this.enableColors,
            enableTimestamp: this.enableTimestamp,
            ...options,
            component: options.component || this.component
        });
    }

    _shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    _formatMessage(level, message, meta = {}) {
        const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
        const component = this.component ? `[${this.component}]` : '';
        const levelStr = level.toUpperCase();
        
        let formatted = '';
        if (timestamp) formatted += `${timestamp} `;
        formatted += `${levelStr} ${component} ${message}`;
        
        if (Object.keys(meta).length > 0) {
            formatted += ` ${JSON.stringify(meta)}`;
        }
        
        return formatted;
    }

    error(message, meta = {}) {
        if (this._shouldLog('error')) {
            console.error(this._formatMessage('error', message, meta));
        }
    }

    warn(message, meta = {}) {
        if (this._shouldLog('warn')) {
            console.warn(this._formatMessage('warn', message, meta));
        }
    }

    info(message, meta = {}) {
        if (this._shouldLog('info')) {
            console.log(this._formatMessage('info', message, meta));
        }
    }

    debug(message, meta = {}) {
        if (this._shouldLog('debug')) {
            console.log(this._formatMessage('debug', message, meta));
        }
    }
}

// Create default logger instance
export const logger = new Logger();

export default logger;

