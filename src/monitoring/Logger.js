/**
 * Enhanced Logger System
 * 
 * Comprehensive logging system with structured logging, multiple transports,
 * log levels, and integration with monitoring systems
 */

import { EventEmitter } from 'events';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';

export class Logger extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      format: config.format || 'json',
      timestamp: config.timestamp !== false,
      colors: config.colors !== false && process.env.NODE_ENV !== 'production',
      maxFiles: config.maxFiles || 7,
      maxSize: config.maxSize || '10m',
      logDir: config.logDir || './logs',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile !== false,
      enableRemote: config.enableRemote || false,
      remoteEndpoint: config.remoteEndpoint,
      ...config
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      verbose: 4,
      debug: 5,
      silly: 6
    };

    this.colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      http: '\x1b[35m',    // Magenta
      verbose: '\x1b[34m', // Blue
      debug: '\x1b[32m',   // Green
      silly: '\x1b[37m',   // White
      reset: '\x1b[0m'
    };

    this.transports = [];
    this.fileStreams = new Map();
    this.buffer = [];
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushInterval || 5000;
    this.flushTimer = null;

    this._setupTransports();
    this._startFlushTimer();
  }

  /**
   * Setup logging transports
   */
  async _setupTransports() {
    try {
      // Console transport
      if (this.config.enableConsole) {
        this.transports.push({
          type: 'console',
          write: this._writeToConsole.bind(this)
        });
      }

      // File transport
      if (this.config.enableFile) {
        await this._setupFileTransport();
      }

      // Remote transport (e.g., ELK stack, CloudWatch)
      if (this.config.enableRemote && this.config.remoteEndpoint) {
        this.transports.push({
          type: 'remote',
          write: this._writeToRemote.bind(this)
        });
      }
    } catch (error) {
      console.error('Failed to setup logger transports:', error);
    }
  }

  /**
   * Setup file transport
   */
  async _setupFileTransport() {
    try {
      await mkdir(this.config.logDir, { recursive: true });

      const logFiles = [
        'application.log',
        'error.log',
        'access.log',
        'workflow.log',
        'security.log'
      ];

      for (const logFile of logFiles) {
        const filePath = join(this.config.logDir, logFile);
        const stream = createWriteStream(filePath, { flags: 'a' });
        
        stream.on('error', (error) => {
          console.error(`Error writing to log file ${logFile}:`, error);
        });

        this.fileStreams.set(logFile, stream);
      }

      this.transports.push({
        type: 'file',
        write: this._writeToFile.bind(this)
      });
    } catch (error) {
      console.error('Failed to setup file transport:', error);
    }
  }

  /**
   * Log workflow events
   */
  logWorkflowEvents(event) {
    const logData = {
      category: 'workflow',
      event: event.type,
      workflowId: event.workflowId,
      taskId: event.taskId,
      status: event.status,
      duration: event.duration,
      metadata: event.metadata || {},
      timestamp: new Date().toISOString()
    };

    this._log('info', 'Workflow event', logData, 'workflow.log');
    this.emit('workflowEvent', logData);
  }

  /**
   * Log errors with context
   */
  logErrors(error, context = {}) {
    const logData = {
      category: 'error',
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      context,
      timestamp: new Date().toISOString()
    };

    this._log('error', error.message, logData, 'error.log');
    this.emit('error', logData);
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(metrics) {
    const logData = {
      category: 'performance',
      metrics: {
        responseTime: metrics.responseTime,
        throughput: metrics.throughput,
        errorRate: metrics.errorRate,
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        diskUsage: metrics.diskUsage
      },
      timestamp: new Date().toISOString()
    };

    this._log('info', 'Performance metrics', logData, 'application.log');
    this.emit('performanceMetrics', logData);
  }

  /**
   * Log security events
   */
  logSecurityEvents(event) {
    const logData = {
      category: 'security',
      event: event.type,
      severity: event.severity || 'medium',
      source: event.source,
      target: event.target,
      details: event.details || {},
      userAgent: event.userAgent,
      ip: event.ip,
      timestamp: new Date().toISOString()
    };

    this._log('warn', `Security event: ${event.type}`, logData, 'security.log');
    this.emit('securityEvent', logData);
  }

  /**
   * Log HTTP requests
   */
  logHttpRequest(req, res, responseTime) {
    const logData = {
      category: 'http',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      contentLength: res.get('Content-Length'),
      referrer: req.get('Referrer'),
      timestamp: new Date().toISOString()
    };

    const level = res.statusCode >= 400 ? 'warn' : 'http';
    this._log(level, `${req.method} ${req.url} ${res.statusCode}`, logData, 'access.log');
    this.emit('httpRequest', logData);
  }

  /**
   * Configure log levels dynamically
   */
  configureLogLevels(newLevel) {
    if (this.levels.hasOwnProperty(newLevel)) {
      this.config.level = newLevel;
      this._log('info', `Log level changed to: ${newLevel}`);
    } else {
      this._log('warn', `Invalid log level: ${newLevel}`);
    }
  }

  /**
   * Standard logging methods
   */
  error(message, meta = {}) {
    this._log('error', message, meta);
  }

  warn(message, meta = {}) {
    this._log('warn', message, meta);
  }

  info(message, meta = {}) {
    this._log('info', message, meta);
  }

  http(message, meta = {}) {
    this._log('http', message, meta);
  }

  verbose(message, meta = {}) {
    this._log('verbose', message, meta);
  }

  debug(message, meta = {}) {
    this._log('debug', message, meta);
  }

  silly(message, meta = {}) {
    this._log('silly', message, meta);
  }

  /**
   * Core logging method
   */
  _log(level, message, meta = {}, targetFile = 'application.log') {
    if (this.levels[level] > this.levels[this.config.level]) {
      return;
    }

    const logEntry = this._createLogEntry(level, message, meta);
    
    // Add to buffer for batch processing
    this.buffer.push({ ...logEntry, targetFile });
    
    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this._flush();
    }

    // Emit log event
    this.emit('log', logEntry);
  }

  /**
   * Create structured log entry
   */
  _createLogEntry(level, message, meta) {
    const entry = {
      level,
      message,
      timestamp: this.config.timestamp ? new Date().toISOString() : undefined,
      ...meta
    };

    // Add process information
    if (this.config.includeProcessInfo) {
      entry.process = {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
    }

    // Add request ID if available
    if (meta.requestId) {
      entry.requestId = meta.requestId;
    }

    return entry;
  }

  /**
   * Format log entry for output
   */
  _formatLogEntry(entry) {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }

    // Simple text format
    const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : '';
    const level = entry.level.toUpperCase().padEnd(7);
    const message = entry.message;
    const meta = Object.keys(entry).length > 3 ? 
      ' ' + JSON.stringify(entry, ['level', 'message', 'timestamp'], 2) : '';

    return `${timestamp}${level} ${message}${meta}`;
  }

  /**
   * Write to console
   */
  _writeToConsole(entry) {
    const formatted = this._formatLogEntry(entry);
    const colorized = this.config.colors ? 
      `${this.colors[entry.level]}${formatted}${this.colors.reset}` : 
      formatted;

    if (entry.level === 'error') {
      console.error(colorized);
    } else {
      console.log(colorized);
    }
  }

  /**
   * Write to file
   */
  _writeToFile(entry, targetFile = 'application.log') {
    const stream = this.fileStreams.get(targetFile);
    if (stream) {
      const formatted = this._formatLogEntry(entry);
      stream.write(formatted + '\n');
    }
  }

  /**
   * Write to remote endpoint
   */
  async _writeToRemote(entry) {
    try {
      if (!this.config.remoteEndpoint) {
        return;
      }

      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.config.remoteAuth || ''
        },
        body: JSON.stringify(entry)
      });

      if (!response.ok) {
        console.error('Failed to send log to remote endpoint:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending log to remote endpoint:', error);
    }
  }

  /**
   * Flush buffered logs
   */
  _flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.buffer];
    this.buffer = [];

    for (const logEntry of logsToFlush) {
      for (const transport of this.transports) {
        try {
          if (transport.type === 'file') {
            transport.write(logEntry, logEntry.targetFile);
          } else {
            transport.write(logEntry);
          }
        } catch (error) {
          console.error(`Error writing to ${transport.type} transport:`, error);
        }
      }
    }

    this.emit('flushed', logsToFlush.length);
  }

  /**
   * Start flush timer
   */
  _startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this._flush();
    }, this.flushInterval);
  }

  /**
   * Stop flush timer
   */
  _stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Rotate log files
   */
  async rotateLogFiles() {
    try {
      for (const [fileName, stream] of this.fileStreams) {
        stream.end();
        
        // Implement log rotation logic here
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedName = fileName.replace('.log', `-${timestamp}.log`);
        
        // Move current log to rotated name and create new stream
        // This is a simplified implementation
        const newStream = createWriteStream(join(this.config.logDir, fileName), { flags: 'a' });
        this.fileStreams.set(fileName, newStream);
      }
      
      this._log('info', 'Log files rotated successfully');
    } catch (error) {
      console.error('Error rotating log files:', error);
    }
  }

  /**
   * Get logger statistics
   */
  getStats() {
    return {
      level: this.config.level,
      transports: this.transports.length,
      bufferSize: this.buffer.length,
      fileStreams: this.fileStreams.size,
      config: {
        format: this.config.format,
        enableConsole: this.config.enableConsole,
        enableFile: this.config.enableFile,
        enableRemote: this.config.enableRemote
      }
    };
  }

  /**
   * Cleanup and close logger
   */
  async close() {
    this._stopFlushTimer();
    this._flush();

    // Close file streams
    for (const [fileName, stream] of this.fileStreams) {
      stream.end();
    }

    this.fileStreams.clear();
    this.emit('closed');
  }
}

export default Logger;

