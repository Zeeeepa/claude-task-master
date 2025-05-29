/**
 * Logger - Centralized logging system
 * Provides structured logging with levels, rotation, archiving, and performance tracking
 */

import winston from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Logger {
    constructor() {
        this.winston = null;
        this.isInitialized = false;
        this.logDir = join(__dirname, '../../logs');
        this.performanceTimers = new Map();
        this.logCounts = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };
    }

    /**
     * Initialize the logger
     */
    initialize(config = {}) {
        try {
            // Ensure log directory exists
            this.ensureLogDirectory();
            
            // Get configuration with defaults
            const logConfig = {
                level: config.level || process.env.LOG_LEVEL || 'info',
                format: config.format || 'json',
                maxFiles: config.maxFiles || 5,
                maxSize: config.maxSize || '10m',
                datePattern: config.datePattern || 'YYYY-MM-DD',
                enableConsole: config.enableConsole !== false,
                enableFile: config.enableFile !== false,
                enablePerformance: config.enablePerformance !== false
            };
            
            // Create Winston logger
            this.winston = winston.createLogger({
                level: logConfig.level,
                format: this.createLogFormat(logConfig.format),
                transports: this.createTransports(logConfig),
                exitOnError: false
            });
            
            // Add error handling
            this.winston.on('error', (error) => {
                console.error('Logger error:', error);
            });
            
            this.isInitialized = true;
            this.info('Logger initialized successfully', { config: logConfig });
            
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            throw error;
        }
    }

    /**
     * Create log format
     */
    createLogFormat(formatType) {
        const { combine, timestamp, errors, printf, json, colorize, simple } = winston.format;
        
        const baseFormat = combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            errors({ stack: true })
        );
        
        if (formatType === 'json') {
            return combine(
                baseFormat,
                json()
            );
        } else {
            // Human-readable format
            const customFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
                let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
                
                if (Object.keys(meta).length > 0) {
                    log += ` ${JSON.stringify(meta)}`;
                }
                
                if (stack) {
                    log += `\n${stack}`;
                }
                
                return log;
            });
            
            return combine(
                baseFormat,
                customFormat
            );
        }
    }

    /**
     * Create transports
     */
    createTransports(config) {
        const transports = [];
        
        // Console transport
        if (config.enableConsole) {
            transports.push(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }));
        }
        
        // File transports
        if (config.enableFile) {
            // General log file
            transports.push(new winston.transports.File({
                filename: join(this.logDir, 'taskmaster.log'),
                maxsize: this.parseSize(config.maxSize),
                maxFiles: config.maxFiles,
                tailable: true
            }));
            
            // Error log file
            transports.push(new winston.transports.File({
                filename: join(this.logDir, 'error.log'),
                level: 'error',
                maxsize: this.parseSize(config.maxSize),
                maxFiles: config.maxFiles,
                tailable: true
            }));
            
            // Daily rotating file
            try {
                const DailyRotateFile = require('winston-daily-rotate-file');
                
                transports.push(new DailyRotateFile({
                    filename: join(this.logDir, 'taskmaster-%DATE%.log'),
                    datePattern: config.datePattern,
                    maxSize: config.maxSize,
                    maxFiles: config.maxFiles,
                    auditFile: join(this.logDir, 'audit.json')
                }));
            } catch (error) {
                console.warn('Daily rotate file transport not available:', error.message);
            }
        }
        
        return transports;
    }

    /**
     * Parse size string to bytes
     */
    parseSize(sizeStr) {
        const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
        const match = sizeStr.toLowerCase().match(/^(\d+)([kmg]?)$/);
        
        if (!match) {
            return 10 * 1024 * 1024; // Default 10MB
        }
        
        const size = parseInt(match[1]);
        const unit = match[2] || '';
        
        return size * (units[unit] || 1);
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Log error message
     */
    error(message, meta = {}) {
        this.logCounts.error++;
        
        if (this.winston) {
            this.winston.error(message, this.enrichMeta(meta));
        } else {
            console.error(`[ERROR] ${message}`, meta);
        }
    }

    /**
     * Log warning message
     */
    warn(message, meta = {}) {
        this.logCounts.warn++;
        
        if (this.winston) {
            this.winston.warn(message, this.enrichMeta(meta));
        } else {
            console.warn(`[WARN] ${message}`, meta);
        }
    }

    /**
     * Log info message
     */
    info(message, meta = {}) {
        this.logCounts.info++;
        
        if (this.winston) {
            this.winston.info(message, this.enrichMeta(meta));
        } else {
            console.info(`[INFO] ${message}`, meta);
        }
    }

    /**
     * Log debug message
     */
    debug(message, meta = {}) {
        this.logCounts.debug++;
        
        if (this.winston) {
            this.winston.debug(message, this.enrichMeta(meta));
        } else {
            console.debug(`[DEBUG] ${message}`, meta);
        }
    }

    /**
     * Start performance timer
     */
    startTimer(label) {
        const startTime = process.hrtime.bigint();
        this.performanceTimers.set(label, startTime);
        
        this.debug(`Performance timer started: ${label}`);
        
        return {
            end: () => this.endTimer(label)
        };
    }

    /**
     * End performance timer
     */
    endTimer(label) {
        const startTime = this.performanceTimers.get(label);
        
        if (!startTime) {
            this.warn(`Performance timer not found: ${label}`);
            return null;
        }
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        this.performanceTimers.delete(label);
        
        this.debug(`Performance timer ended: ${label}`, { 
            duration: `${duration.toFixed(2)}ms` 
        });
        
        return duration;
    }

    /**
     * Log performance metrics
     */
    performance(label, duration, meta = {}) {
        this.info(`Performance: ${label}`, {
            ...meta,
            duration: typeof duration === 'number' ? `${duration.toFixed(2)}ms` : duration,
            type: 'performance'
        });
    }

    /**
     * Log HTTP request
     */
    http(method, url, statusCode, duration, meta = {}) {
        const level = statusCode >= 400 ? 'warn' : 'info';
        
        this[level](`HTTP ${method} ${url}`, {
            ...meta,
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            type: 'http'
        });
    }

    /**
     * Log database operation
     */
    database(operation, table, duration, meta = {}) {
        this.debug(`Database ${operation}`, {
            ...meta,
            operation,
            table,
            duration: `${duration}ms`,
            type: 'database'
        });
    }

    /**
     * Log security event
     */
    security(event, level = 'warn', meta = {}) {
        this[level](`Security: ${event}`, {
            ...meta,
            event,
            type: 'security',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log audit event
     */
    audit(action, user, resource, meta = {}) {
        this.info(`Audit: ${action}`, {
            ...meta,
            action,
            user,
            resource,
            type: 'audit',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Enrich metadata with context
     */
    enrichMeta(meta) {
        return {
            ...meta,
            pid: process.pid,
            memory: process.memoryUsage().rss,
            uptime: process.uptime()
        };
    }

    /**
     * Create child logger with context
     */
    child(context) {
        return {
            error: (message, meta = {}) => this.error(message, { ...context, ...meta }),
            warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
            info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
            debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
            performance: (label, duration, meta = {}) => this.performance(label, duration, { ...context, ...meta }),
            http: (method, url, statusCode, duration, meta = {}) => this.http(method, url, statusCode, duration, { ...context, ...meta }),
            database: (operation, table, duration, meta = {}) => this.database(operation, table, duration, { ...context, ...meta }),
            security: (event, level, meta = {}) => this.security(event, level, { ...context, ...meta }),
            audit: (action, user, resource, meta = {}) => this.audit(action, user, resource, { ...context, ...meta })
        };
    }

    /**
     * Set log level
     */
    setLevel(level) {
        if (this.winston) {
            this.winston.level = level;
            this.info(`Log level changed to: ${level}`);
        }
    }

    /**
     * Get log statistics
     */
    getStats() {
        return {
            isInitialized: this.isInitialized,
            level: this.winston ? this.winston.level : 'unknown',
            counts: { ...this.logCounts },
            activeTimers: this.performanceTimers.size,
            logDir: this.logDir
        };
    }

    /**
     * Clear log counts
     */
    clearStats() {
        this.logCounts = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };
        
        this.info('Log statistics cleared');
    }

    /**
     * Flush logs
     */
    async flush() {
        if (this.winston) {
            return new Promise((resolve) => {
                this.winston.on('finish', resolve);
                this.winston.end();
            });
        }
    }

    /**
     * Close logger
     */
    async close() {
        if (this.winston) {
            await this.flush();
            this.winston.close();
            this.winston = null;
        }
        
        this.isInitialized = false;
        this.performanceTimers.clear();
    }
}

// Create and initialize logger instance
const logger = new Logger();

// Initialize with default configuration if not already initialized
if (!logger.isInitialized) {
    try {
        logger.initialize();
    } catch (error) {
        console.error('Failed to initialize default logger:', error);
    }
}

export { logger };
export default Logger;

