/**
 * Logger Utility
 * 
 * Centralized logging utility for the webhook system
 * with structured logging and multiple output formats.
 */

import util from 'util';

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      format: config.format || process.env.LOG_FORMAT || 'json',
      enableColors: config.enableColors !== false && process.stdout.isTTY,
      enableTimestamp: config.enableTimestamp !== false,
      enableMetadata: config.enableMetadata !== false,
      ...config
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

    this.currentLevel = this.levels[this.config.level] || this.levels.info;
  }

  /**
   * Log error message
   */
  error(message, metadata = {}) {
    this.log('error', message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  /**
   * Log info message
   */
  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  /**
   * Log debug message
   */
  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  /**
   * Log trace message
   */
  trace(message, metadata = {}) {
    this.log('trace', message, metadata);
  }

  /**
   * Core logging method
   */
  log(level, message, metadata = {}) {
    if (this.levels[level] > this.currentLevel) {
      return;
    }

    const logEntry = this.createLogEntry(level, message, metadata);
    const formattedMessage = this.formatMessage(logEntry);

    // Output to appropriate stream
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(formattedMessage + '\n');
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, metadata) {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      hostname: require('os').hostname(),
      service: 'claude-task-master-webhook'
    };

    if (this.config.enableMetadata && Object.keys(metadata).length > 0) {
      entry.metadata = metadata;
    }

    return entry;
  }

  /**
   * Format log message based on configuration
   */
  formatMessage(logEntry) {
    switch (this.config.format) {
      case 'json':
        return JSON.stringify(logEntry);
      
      case 'text':
        return this.formatTextMessage(logEntry);
      
      case 'simple':
        return this.formatSimpleMessage(logEntry);
      
      default:
        return JSON.stringify(logEntry);
    }
  }

  /**
   * Format text message with colors and structure
   */
  formatTextMessage(logEntry) {
    const { level, message, timestamp, metadata } = logEntry;
    
    let formatted = '';

    // Add timestamp
    if (this.config.enableTimestamp) {
      formatted += `[${timestamp}] `;
    }

    // Add level with color
    if (this.config.enableColors) {
      formatted += `${this.colors[level]}${level.toUpperCase()}${this.colors.reset} `;
    } else {
      formatted += `${level.toUpperCase()} `;
    }

    // Add message
    formatted += message;

    // Add metadata
    if (metadata && Object.keys(metadata).length > 0) {
      formatted += ` ${util.inspect(metadata, { 
        colors: this.config.enableColors,
        depth: 3,
        compact: true
      })}`;
    }

    return formatted;
  }

  /**
   * Format simple message (just level and message)
   */
  formatSimpleMessage(logEntry) {
    const { level, message } = logEntry;
    
    if (this.config.enableColors) {
      return `${this.colors[level]}[${level.toUpperCase()}]${this.colors.reset} ${message}`;
    } else {
      return `[${level.toUpperCase()}] ${message}`;
    }
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.config.level = level;
      this.currentLevel = this.levels[level];
    } else {
      throw new Error(`Invalid log level: ${level}`);
    }
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.config.level;
  }

  /**
   * Check if level is enabled
   */
  isLevelEnabled(level) {
    return this.levels[level] <= this.currentLevel;
  }

  /**
   * Create child logger with additional context
   */
  child(context = {}) {
    return new ChildLogger(this, context);
  }

  /**
   * Create timer for measuring execution time
   */
  timer(label) {
    return new LogTimer(this, label);
  }
}

/**
 * Child logger with additional context
 */
class ChildLogger {
  constructor(parent, context) {
    this.parent = parent;
    this.context = context;
  }

  error(message, metadata = {}) {
    this.parent.error(message, { ...this.context, ...metadata });
  }

  warn(message, metadata = {}) {
    this.parent.warn(message, { ...this.context, ...metadata });
  }

  info(message, metadata = {}) {
    this.parent.info(message, { ...this.context, ...metadata });
  }

  debug(message, metadata = {}) {
    this.parent.debug(message, { ...this.context, ...metadata });
  }

  trace(message, metadata = {}) {
    this.parent.trace(message, { ...this.context, ...metadata });
  }

  child(additionalContext = {}) {
    return new ChildLogger(this.parent, { ...this.context, ...additionalContext });
  }

  timer(label) {
    return new LogTimer(this.parent, label, this.context);
  }
}

/**
 * Timer for measuring execution time
 */
class LogTimer {
  constructor(logger, label, context = {}) {
    this.logger = logger;
    this.label = label;
    this.context = context;
    this.startTime = Date.now();
    
    this.logger.debug(`Timer started: ${label}`, this.context);
  }

  /**
   * End timer and log duration
   */
  end(level = 'debug', additionalMetadata = {}) {
    const duration = Date.now() - this.startTime;
    const metadata = {
      ...this.context,
      ...additionalMetadata,
      duration: `${duration}ms`
    };

    this.logger.log(level, `Timer ended: ${this.label}`, metadata);
    return duration;
  }

  /**
   * Log intermediate checkpoint
   */
  checkpoint(name, level = 'debug', additionalMetadata = {}) {
    const duration = Date.now() - this.startTime;
    const metadata = {
      ...this.context,
      ...additionalMetadata,
      checkpoint: name,
      duration: `${duration}ms`
    };

    this.logger.log(level, `Timer checkpoint: ${this.label}`, metadata);
    return duration;
  }
}

// Create default logger instance
const logger = new Logger();

// Export both the class and default instance
export { Logger, logger };
export default logger;

