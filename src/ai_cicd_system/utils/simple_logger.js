/**
 * Simple Logger Utility
 * 
 * Provides a lightweight logging utility for the AI CI/CD system components.
 * Supports multiple log levels and structured output.
 */

export class SimpleLogger {
  constructor(component = 'System', level = 'info') {
    this.component = component;
    this.level = level;
    
    // Log levels in order of severity
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    this.currentLevel = this.levels[level] || this.levels.info;
  }

  /**
   * Log error message
   */
  error(message, ...args) {
    if (this.currentLevel >= this.levels.error) {
      this._log('ERROR', message, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message, ...args) {
    if (this.currentLevel >= this.levels.warn) {
      this._log('WARN', message, ...args);
    }
  }

  /**
   * Log info message
   */
  info(message, ...args) {
    if (this.currentLevel >= this.levels.info) {
      this._log('INFO', message, ...args);
    }
  }

  /**
   * Log debug message
   */
  debug(message, ...args) {
    if (this.currentLevel >= this.levels.debug) {
      this._log('DEBUG', message, ...args);
    }
  }

  /**
   * Internal log method
   */
  _log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.component}]`;
    
    if (args.length > 0) {
      console.log(prefix, message, ...args);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.level = level;
      this.currentLevel = this.levels[level];
    }
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.level;
  }
}

export default SimpleLogger;

