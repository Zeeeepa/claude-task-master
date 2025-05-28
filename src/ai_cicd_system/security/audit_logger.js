/**
 * Security Audit Logger
 * Comprehensive logging system for security events, compliance reporting, and incident tracking
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export class AuditLogger extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            logLevel: config.logLevel || 'info',
            logDirectory: config.logDirectory || './logs/security',
            maxLogFileSize: config.maxLogFileSize || 100 * 1024 * 1024, // 100MB
            maxLogFiles: config.maxLogFiles || 30,
            enableConsoleOutput: config.enableConsoleOutput !== false,
            enableFileOutput: config.enableFileOutput !== false,
            enableRemoteLogging: config.enableRemoteLogging || false,
            remoteEndpoint: config.remoteEndpoint || null,
            encryptLogs: config.encryptLogs || false,
            complianceMode: config.complianceMode || false,
            retentionPeriod: config.retentionPeriod || 365 * 24 * 60 * 60 * 1000, // 1 year
            ...config
        };

        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            critical: 4
        };

        this.currentLogFile = null;
        this.logBuffer = [];
        this.bufferSize = 100;
        this.flushInterval = 5000; // 5 seconds

        this.initializeLogger();
    }

    /**
     * Initialize the audit logger
     */
    async initializeLogger() {
        try {
            // Create log directory if it doesn't exist
            if (this.config.enableFileOutput) {
                await fs.mkdir(this.config.logDirectory, { recursive: true });
                await this.rotateLogFile();
            }

            // Start buffer flush interval
            this.startBufferFlush();

            // Log initialization
            await this.logSecurityEvent('AUDIT_LOGGER_INITIALIZED', {
                config: this.sanitizeConfig(this.config),
                timestamp: new Date()
            });

        } catch (error) {
            console.error('Failed to initialize audit logger:', error);
            throw error;
        }
    }

    /**
     * Log security event
     */
    async logSecurityEvent(eventType, eventData = {}, level = 'info') {
        try {
            const logEntry = this.createLogEntry(eventType, eventData, level);
            
            // Add to buffer
            this.logBuffer.push(logEntry);
            
            // Flush buffer if it's full
            if (this.logBuffer.length >= this.bufferSize) {
                await this.flushBuffer();
            }

            // Console output
            if (this.config.enableConsoleOutput && this.shouldLog(level)) {
                this.outputToConsole(logEntry);
            }

            // Emit event for real-time monitoring
            this.emit('securityEvent', logEntry);

            // Handle critical events immediately
            if (level === 'critical') {
                await this.handleCriticalEvent(logEntry);
            }

        } catch (error) {
            console.error('Failed to log security event:', error);
            // Don't throw to avoid breaking the application
        }
    }

    /**
     * Create structured log entry
     */
    createLogEntry(eventType, eventData, level) {
        const timestamp = new Date();
        const logId = crypto.randomUUID();
        
        const logEntry = {
            id: logId,
            timestamp: timestamp.toISOString(),
            level: level.toUpperCase(),
            eventType,
            eventData: this.sanitizeEventData(eventData),
            metadata: {
                hostname: process.env.HOSTNAME || 'unknown',
                pid: process.pid,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            compliance: this.config.complianceMode ? this.generateComplianceData(eventType, eventData) : null
        };

        // Add hash for integrity verification
        logEntry.hash = this.generateLogHash(logEntry);

        return logEntry;
    }

    /**
     * Generate compliance data for regulatory requirements
     */
    generateComplianceData(eventType, eventData) {
        const complianceData = {
            regulation: 'SOC2_GDPR',
            category: this.categorizeEvent(eventType),
            severity: this.calculateSeverity(eventType, eventData),
            dataClassification: this.classifyData(eventData),
            retentionRequired: true,
            auditTrail: true
        };

        // Add specific compliance fields based on event type
        switch (eventType) {
            case 'AUTH_SUCCESS':
            case 'AUTH_FAILED':
                complianceData.personalDataInvolved = true;
                complianceData.gdprArticle = 'Article 32';
                break;
            case 'DATA_ACCESS':
            case 'DATA_MODIFICATION':
                complianceData.dataProcessingActivity = true;
                complianceData.gdprArticle = 'Article 30';
                break;
            case 'SECURITY_INCIDENT':
                complianceData.incidentResponse = true;
                complianceData.notificationRequired = complianceData.severity === 'high';
                break;
        }

        return complianceData;
    }

    /**
     * Categorize security event
     */
    categorizeEvent(eventType) {
        const categories = {
            'AUTH_': 'authentication',
            'PERMISSION_': 'authorization',
            'DATA_': 'data_access',
            'ENCRYPTION_': 'cryptography',
            'NETWORK_': 'network_security',
            'SYSTEM_': 'system_security',
            'INCIDENT_': 'security_incident',
            'COMPLIANCE_': 'compliance'
        };

        for (const [prefix, category] of Object.entries(categories)) {
            if (eventType.startsWith(prefix)) {
                return category;
            }
        }

        return 'general';
    }

    /**
     * Calculate event severity
     */
    calculateSeverity(eventType, eventData) {
        const highSeverityEvents = [
            'AUTH_FAILED',
            'PERMISSION_DENIED',
            'SQL_INJECTION_ATTEMPT',
            'XSS_ATTEMPT',
            'COMMAND_INJECTION_ATTEMPT',
            'SECURITY_INCIDENT',
            'DATA_BREACH'
        ];

        const mediumSeverityEvents = [
            'SUSPICIOUS_ACTIVITY',
            'RATE_LIMIT_EXCEEDED',
            'INVALID_TOKEN',
            'ENCRYPTION_FAILED'
        ];

        if (highSeverityEvents.includes(eventType)) {
            return 'high';
        } else if (mediumSeverityEvents.includes(eventType)) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Classify data sensitivity
     */
    classifyData(eventData) {
        const sensitiveFields = ['password', 'token', 'key', 'secret', 'ssn', 'credit_card'];
        const personalFields = ['email', 'name', 'address', 'phone', 'ip'];

        const dataStr = JSON.stringify(eventData).toLowerCase();

        if (sensitiveFields.some(field => dataStr.includes(field))) {
            return 'sensitive';
        } else if (personalFields.some(field => dataStr.includes(field))) {
            return 'personal';
        } else {
            return 'public';
        }
    }

    /**
     * Sanitize event data for logging
     */
    sanitizeEventData(eventData) {
        if (typeof eventData !== 'object' || eventData === null) {
            return eventData;
        }

        const sanitized = {};
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'privateKey'];

        for (const [key, value] of Object.entries(eventData)) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeEventData(value);
            } else if (typeof value === 'string' && value.length > 1000) {
                sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Generate log entry hash for integrity
     */
    generateLogHash(logEntry) {
        const { hash, ...entryWithoutHash } = logEntry;
        const entryString = JSON.stringify(entryWithoutHash, Object.keys(entryWithoutHash).sort());
        return crypto.createHash('sha256').update(entryString).digest('hex');
    }

    /**
     * Verify log entry integrity
     */
    verifyLogIntegrity(logEntry) {
        const { hash, ...entryWithoutHash } = logEntry;
        const expectedHash = this.generateLogHash(entryWithoutHash);
        return hash === expectedHash;
    }

    /**
     * Check if event should be logged based on level
     */
    shouldLog(level) {
        const currentLevel = this.logLevels[this.config.logLevel] || 1;
        const eventLevel = this.logLevels[level] || 1;
        return eventLevel >= currentLevel;
    }

    /**
     * Output log entry to console
     */
    outputToConsole(logEntry) {
        const { timestamp, level, eventType, eventData } = logEntry;
        const message = `[${timestamp}] ${level}: ${eventType}`;
        
        switch (level) {
            case 'DEBUG':
                console.debug(message, eventData);
                break;
            case 'INFO':
                console.info(message, eventData);
                break;
            case 'WARN':
                console.warn(message, eventData);
                break;
            case 'ERROR':
                console.error(message, eventData);
                break;
            case 'CRITICAL':
                console.error(`🚨 ${message}`, eventData);
                break;
            default:
                console.log(message, eventData);
        }
    }

    /**
     * Start buffer flush interval
     */
    startBufferFlush() {
        this.flushTimer = setInterval(async () => {
            if (this.logBuffer.length > 0) {
                await this.flushBuffer();
            }
        }, this.flushInterval);
    }

    /**
     * Flush log buffer to file
     */
    async flushBuffer() {
        if (!this.config.enableFileOutput || this.logBuffer.length === 0) {
            return;
        }

        try {
            const logsToFlush = [...this.logBuffer];
            this.logBuffer = [];

            // Prepare log entries for writing
            const logLines = logsToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';

            // Check if log rotation is needed
            if (await this.needsLogRotation()) {
                await this.rotateLogFile();
            }

            // Write to current log file
            if (this.currentLogFile) {
                await fs.appendFile(this.currentLogFile, logLines);
            }

            // Send to remote logging if enabled
            if (this.config.enableRemoteLogging && this.config.remoteEndpoint) {
                await this.sendToRemoteLogger(logsToFlush);
            }

        } catch (error) {
            console.error('Failed to flush log buffer:', error);
            // Put logs back in buffer to retry
            this.logBuffer.unshift(...logsToFlush);
        }
    }

    /**
     * Check if log rotation is needed
     */
    async needsLogRotation() {
        if (!this.currentLogFile) {
            return true;
        }

        try {
            const stats = await fs.stat(this.currentLogFile);
            return stats.size >= this.config.maxLogFileSize;
        } catch (error) {
            return true; // Rotate if we can't check the file
        }
    }

    /**
     * Rotate log file
     */
    async rotateLogFile() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFileName = `security-audit-${timestamp}.log`;
            this.currentLogFile = path.join(this.config.logDirectory, logFileName);

            // Clean up old log files
            await this.cleanupOldLogs();

        } catch (error) {
            console.error('Failed to rotate log file:', error);
            throw error;
        }
    }

    /**
     * Clean up old log files
     */
    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.config.logDirectory);
            const logFiles = files
                .filter(file => file.startsWith('security-audit-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.logDirectory, file)
                }));

            // Sort by creation time and remove old files
            const stats = await Promise.all(
                logFiles.map(async file => ({
                    ...file,
                    stats: await fs.stat(file.path)
                }))
            );

            stats.sort((a, b) => b.stats.mtime - a.stats.mtime);

            // Remove files beyond retention limit
            const filesToDelete = stats.slice(this.config.maxLogFiles);
            for (const file of filesToDelete) {
                await fs.unlink(file.path);
            }

            // Remove files older than retention period
            const now = Date.now();
            const oldFiles = stats.filter(file => 
                now - file.stats.mtime.getTime() > this.config.retentionPeriod
            );

            for (const file of oldFiles) {
                await fs.unlink(file.path);
            }

        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    /**
     * Handle critical security events
     */
    async handleCriticalEvent(logEntry) {
        try {
            // Immediate flush for critical events
            await this.flushBuffer();

            // Send alert notifications
            this.emit('criticalSecurityEvent', logEntry);

            // Log the critical event handling
            console.error('🚨 CRITICAL SECURITY EVENT:', logEntry);

            // Additional actions for critical events
            if (this.config.enableRemoteLogging) {
                await this.sendCriticalAlert(logEntry);
            }

        } catch (error) {
            console.error('Failed to handle critical event:', error);
        }
    }

    /**
     * Send logs to remote logging service
     */
    async sendToRemoteLogger(logEntries) {
        if (!this.config.remoteEndpoint) {
            return;
        }

        try {
            const response = await fetch(this.config.remoteEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.REMOTE_LOG_TOKEN || ''}`
                },
                body: JSON.stringify({
                    source: 'ai-cicd-security',
                    logs: logEntries
                })
            });

            if (!response.ok) {
                throw new Error(`Remote logging failed: ${response.status}`);
            }

        } catch (error) {
            console.error('Failed to send logs to remote service:', error);
        }
    }

    /**
     * Send critical alert
     */
    async sendCriticalAlert(logEntry) {
        // This would integrate with your alerting system (Slack, PagerDuty, etc.)
        console.error('CRITICAL ALERT WOULD BE SENT:', logEntry.eventType);
    }

    /**
     * Generate compliance report
     */
    async generateComplianceReport(options = {}) {
        const {
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            endDate = new Date(),
            eventTypes = null,
            format = 'json'
        } = options;

        try {
            const logs = await this.queryLogs({
                startDate,
                endDate,
                eventTypes
            });

            const report = {
                reportId: crypto.randomUUID(),
                generatedAt: new Date().toISOString(),
                period: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                },
                summary: this.generateReportSummary(logs),
                events: logs,
                compliance: {
                    soc2: this.generateSOC2Report(logs),
                    gdpr: this.generateGDPRReport(logs)
                }
            };

            if (format === 'csv') {
                return this.convertReportToCSV(report);
            }

            return report;

        } catch (error) {
            console.error('Failed to generate compliance report:', error);
            throw error;
        }
    }

    /**
     * Query logs based on criteria
     */
    async queryLogs(criteria) {
        // This would typically query a database or search through log files
        // For now, we'll return a mock implementation
        return [];
    }

    /**
     * Generate report summary
     */
    generateReportSummary(logs) {
        const summary = {
            totalEvents: logs.length,
            eventsByType: {},
            eventsByLevel: {},
            securityIncidents: 0,
            complianceViolations: 0
        };

        logs.forEach(log => {
            // Count by type
            summary.eventsByType[log.eventType] = (summary.eventsByType[log.eventType] || 0) + 1;
            
            // Count by level
            summary.eventsByLevel[log.level] = (summary.eventsByLevel[log.level] || 0) + 1;
            
            // Count incidents
            if (log.eventType.includes('INCIDENT')) {
                summary.securityIncidents++;
            }
            
            // Count violations
            if (log.compliance && log.compliance.severity === 'high') {
                summary.complianceViolations++;
            }
        });

        return summary;
    }

    /**
     * Generate SOC2 compliance report
     */
    generateSOC2Report(logs) {
        return {
            controlObjectives: {
                security: this.evaluateSecurityControls(logs),
                availability: this.evaluateAvailabilityControls(logs),
                processing: this.evaluateProcessingControls(logs),
                confidentiality: this.evaluateConfidentialityControls(logs),
                privacy: this.evaluatePrivacyControls(logs)
            },
            findings: this.identifySOC2Findings(logs),
            recommendations: this.generateSOC2Recommendations(logs)
        };
    }

    /**
     * Generate GDPR compliance report
     */
    generateGDPRReport(logs) {
        return {
            dataProcessingActivities: this.analyzeDataProcessing(logs),
            dataSubjectRights: this.analyzeDataSubjectRights(logs),
            dataBreaches: this.identifyDataBreaches(logs),
            consentManagement: this.analyzeConsentManagement(logs),
            recommendations: this.generateGDPRRecommendations(logs)
        };
    }

    /**
     * Sanitize configuration for logging
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        delete sanitized.remoteEndpoint;
        delete sanitized.encryptionKey;
        return sanitized;
    }

    /**
     * Get audit statistics
     */
    getAuditStats() {
        return {
            bufferSize: this.logBuffer.length,
            currentLogFile: this.currentLogFile,
            config: this.sanitizeConfig(this.config),
            uptime: process.uptime()
        };
    }

    /**
     * Destroy audit logger
     */
    async destroy() {
        try {
            // Flush remaining logs
            await this.flushBuffer();
            
            // Clear timers
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }

            // Log shutdown
            await this.logSecurityEvent('AUDIT_LOGGER_SHUTDOWN', {
                timestamp: new Date()
            });

        } catch (error) {
            console.error('Error during audit logger shutdown:', error);
        }
    }

    // Placeholder methods for compliance analysis
    evaluateSecurityControls(logs) { return { status: 'compliant', findings: [] }; }
    evaluateAvailabilityControls(logs) { return { status: 'compliant', findings: [] }; }
    evaluateProcessingControls(logs) { return { status: 'compliant', findings: [] }; }
    evaluateConfidentialityControls(logs) { return { status: 'compliant', findings: [] }; }
    evaluatePrivacyControls(logs) { return { status: 'compliant', findings: [] }; }
    identifySOC2Findings(logs) { return []; }
    generateSOC2Recommendations(logs) { return []; }
    analyzeDataProcessing(logs) { return []; }
    analyzeDataSubjectRights(logs) { return []; }
    identifyDataBreaches(logs) { return []; }
    analyzeConsentManagement(logs) { return []; }
    generateGDPRRecommendations(logs) { return []; }
    convertReportToCSV(report) { return 'CSV format not implemented'; }
}

export default AuditLogger;

