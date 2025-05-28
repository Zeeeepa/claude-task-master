/**
 * Audit Logger
 * Comprehensive security event logging and monitoring
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SecurityConfig } from '../config/security-config.js';

class AuditLogger {
  constructor() {
    this.config = SecurityConfig.audit;
    this.logBuffer = [];
    this.bufferSize = 100;
    this.flushInterval = 5000; // 5 seconds
    this.logPath = path.join(process.cwd(), 'logs', 'audit');
    this.initialized = false;
    
    this.initializeLogger();
  }

  /**
   * Initialize the audit logger
   */
  async initializeLogger() {
    if (this.initialized) return;

    try {
      // Ensure log directory exists
      await fs.mkdir(this.logPath, { recursive: true });
      
      // Start periodic flush
      this.flushTimer = setInterval(() => {
        this.flushLogs();
      }, this.flushInterval);

      this.initialized = true;
      
      // Log initialization
      this.log('system', 'audit_logger_initialized', {
        logPath: this.logPath,
        bufferSize: this.bufferSize,
        flushInterval: this.flushInterval,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
      throw error;
    }
  }

  /**
   * Log a security event
   */
  log(category, event, data = {}) {
    if (!this.config.enabled) {
      return;
    }

    const logEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      event,
      data: this.sanitizeData(data),
      level: this.getLogLevel(category, event),
      source: 'claude-task-master',
      version: '1.0.0'
    };

    // Add to buffer
    this.logBuffer.push(logEntry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.bufferSize) {
      this.flushLogs();
    }

    // Also log to console for immediate visibility
    if (this.shouldLogToConsole(logEntry.level)) {
      this.logToConsole(logEntry);
    }
  }

  /**
   * Sanitize sensitive data from log entries
   */
  sanitizeData(data) {
    const sanitized = { ...data };
    
    for (const field of this.config.sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = this.maskSensitiveValue(sanitized[field]);
      }
    }

    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      }
    }

    return sanitized;
  }

  /**
   * Mask sensitive values
   */
  maskSensitiveValue(value) {
    if (typeof value !== 'string') {
      return '[REDACTED]';
    }

    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }

    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  /**
   * Get log level for event
   */
  getLogLevel(category, event) {
    const criticalEvents = [
      'failed_login',
      'permission_denied',
      'security_event',
      'unauthorized_access',
      'data_breach',
      'system_compromise'
    ];

    const warningEvents = [
      'login_attempt_locked_account',
      'token_verification_failed',
      'invalid_mfa',
      'suspicious_activity'
    ];

    if (criticalEvents.includes(event)) {
      return 'critical';
    } else if (warningEvents.includes(event)) {
      return 'warning';
    } else {
      return 'info';
    }
  }

  /**
   * Check if should log to console
   */
  shouldLogToConsole(level) {
    const levels = ['debug', 'info', 'warning', 'critical'];
    const configLevel = this.config.logLevel || 'info';
    
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }

  /**
   * Log to console with formatting
   */
  logToConsole(logEntry) {
    const colors = {
      critical: '\x1b[31m', // Red
      warning: '\x1b[33m',  // Yellow
      info: '\x1b[36m',     // Cyan
      debug: '\x1b[37m'     // White
    };

    const reset = '\x1b[0m';
    const color = colors[logEntry.level] || colors.info;

    console.log(
      `${color}[AUDIT]${reset} ${logEntry.timestamp} ${color}${logEntry.level.toUpperCase()}${reset} ` +
      `${logEntry.category}:${logEntry.event} - ${JSON.stringify(logEntry.data)}`
    );
  }

  /**
   * Flush logs to file
   */
  async flushLogs() {
    if (this.logBuffer.length === 0) {
      return;
    }

    try {
      const logsToFlush = [...this.logBuffer];
      this.logBuffer = [];

      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logPath, `audit-${date}.jsonl`);

      const logLines = logsToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      
      await fs.appendFile(logFile, logLines, 'utf8');
    } catch (error) {
      console.error('Failed to flush audit logs:', error);
      // Put logs back in buffer to retry
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}) {
    const {
      startDate,
      endDate,
      category,
      event,
      level,
      userId,
      limit = 100
    } = filters;

    const results = [];
    const logFiles = await this.getLogFiles(startDate, endDate);

    for (const logFile of logFiles) {
      try {
        const content = await fs.readFile(logFile, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          const logEntry = JSON.parse(line);
          
          // Apply filters
          if (category && logEntry.category !== category) continue;
          if (event && logEntry.event !== event) continue;
          if (level && logEntry.level !== level) continue;
          if (userId && logEntry.data.userId !== userId) continue;

          results.push(logEntry);

          if (results.length >= limit) {
            return results;
          }
        }
      } catch (error) {
        console.error(`Failed to read log file ${logFile}:`, error);
      }
    }

    return results;
  }

  /**
   * Get log files for date range
   */
  async getLogFiles(startDate, endDate) {
    const files = await fs.readdir(this.logPath);
    const logFiles = files
      .filter(file => file.startsWith('audit-') && file.endsWith('.jsonl'))
      .map(file => {
        const dateStr = file.replace('audit-', '').replace('.jsonl', '');
        return {
          file: path.join(this.logPath, file),
          date: new Date(dateStr)
        };
      });

    // Filter by date range if provided
    let filteredFiles = logFiles;
    if (startDate) {
      filteredFiles = filteredFiles.filter(f => f.date >= new Date(startDate));
    }
    if (endDate) {
      filteredFiles = filteredFiles.filter(f => f.date <= new Date(endDate));
    }

    return filteredFiles
      .sort((a, b) => b.date - a.date) // Most recent first
      .map(f => f.file);
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(days = 7) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const logs = await this.queryLogs({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 10000
    });

    const report = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days
      },
      summary: {
        totalEvents: logs.length,
        criticalEvents: logs.filter(l => l.level === 'critical').length,
        warningEvents: logs.filter(l => l.level === 'warning').length,
        infoEvents: logs.filter(l => l.level === 'info').length
      },
      categories: {},
      events: {},
      users: {},
      timeline: []
    };

    // Analyze by category
    for (const log of logs) {
      report.categories[log.category] = (report.categories[log.category] || 0) + 1;
      report.events[log.event] = (report.events[log.event] || 0) + 1;
      
      if (log.data.userId) {
        report.users[log.data.userId] = (report.users[log.data.userId] || 0) + 1;
      }
    }

    // Create timeline (hourly buckets)
    const timelineBuckets = {};
    for (const log of logs) {
      const hour = new Date(log.timestamp).toISOString().substring(0, 13) + ':00:00.000Z';
      timelineBuckets[hour] = (timelineBuckets[hour] || 0) + 1;
    }

    report.timeline = Object.entries(timelineBuckets)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    return report;
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs() {
    if (!this.config.retentionDays) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    try {
      const files = await fs.readdir(this.logPath);
      const logFiles = files.filter(file => file.startsWith('audit-') && file.endsWith('.jsonl'));

      for (const file of logFiles) {
        const dateStr = file.replace('audit-', '').replace('.jsonl', '');
        const fileDate = new Date(dateStr);

        if (fileDate < cutoffDate) {
          await fs.unlink(path.join(this.logPath, file));
          this.log('system', 'audit_log_cleaned', {
            file,
            fileDate: fileDate.toISOString(),
            cutoffDate: cutoffDate.toISOString(),
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old audit logs:', error);
    }
  }

  /**
   * Shutdown the audit logger
   */
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining logs
    await this.flushLogs();

    this.log('system', 'audit_logger_shutdown', {
      timestamp: new Date().toISOString()
    });

    // Final flush
    await this.flushLogs();
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
export default AuditLogger;

