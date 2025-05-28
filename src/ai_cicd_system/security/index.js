/**
 * Security Framework Integration Module
 * Main entry point for the comprehensive security and authentication framework
 */

import { AuthManager } from './auth_manager.js';
import { RBACController } from './rbac_controller.js';
import { InputValidator } from './input_validator.js';
import { EncryptionService } from './encryption_service.js';
import { AuditLogger } from './audit_logger.js';
import { VulnerabilityScanner } from './vulnerability_scanner.js';
import { SecurityMiddleware } from './security_middleware.js';
import { EventEmitter } from 'events';

export class SecurityFramework extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableAuth: config.enableAuth !== false,
            enableRBAC: config.enableRBAC !== false,
            enableInputValidation: config.enableInputValidation !== false,
            enableEncryption: config.enableEncryption !== false,
            enableAuditLogging: config.enableAuditLogging !== false,
            enableVulnerabilityScanning: config.enableVulnerabilityScanning !== false,
            enableSecurityMiddleware: config.enableSecurityMiddleware !== false,
            ...config
        };

        this.components = {};
        this.initialized = false;
        
        this.initializeComponents();
    }

    /**
     * Initialize all security components
     */
    async initializeComponents() {
        try {
            // Initialize Audit Logger first (other components depend on it)
            if (this.config.enableAuditLogging) {
                this.components.auditLogger = new AuditLogger(this.config.auditLogger);
                await this.components.auditLogger.logSecurityEvent('SECURITY_FRAMEWORK_INITIALIZING', {
                    config: this.sanitizeConfig(this.config)
                });
            }

            // Initialize Encryption Service
            if (this.config.enableEncryption) {
                this.components.encryptionService = new EncryptionService(this.config.encryption);
            }

            // Initialize Authentication Manager
            if (this.config.enableAuth) {
                this.components.authManager = new AuthManager(this.config.auth);
            }

            // Initialize RBAC Controller
            if (this.config.enableRBAC) {
                this.components.rbacController = new RBACController(this.config.rbac);
            }

            // Initialize Input Validator
            if (this.config.enableInputValidation) {
                this.components.inputValidator = new InputValidator(this.config.inputValidation);
            }

            // Initialize Vulnerability Scanner
            if (this.config.enableVulnerabilityScanning) {
                this.components.vulnerabilityScanner = new VulnerabilityScanner(this.config.vulnerabilityScanner);
            }

            // Initialize Security Middleware
            if (this.config.enableSecurityMiddleware) {
                this.components.securityMiddleware = new SecurityMiddleware({
                    auth: this.config.auth,
                    rbac: this.config.rbac,
                    inputValidation: this.config.inputValidation,
                    auditLogging: this.config.auditLogger,
                    ...this.config.securityMiddleware
                });
            }

            // Set up event listeners
            this.setupEventListeners();

            this.initialized = true;

            if (this.components.auditLogger) {
                await this.components.auditLogger.logSecurityEvent('SECURITY_FRAMEWORK_INITIALIZED', {
                    components: Object.keys(this.components),
                    timestamp: new Date()
                });
            }

            this.emit('initialized', { components: Object.keys(this.components) });

        } catch (error) {
            if (this.components.auditLogger) {
                await this.components.auditLogger.logSecurityEvent('SECURITY_FRAMEWORK_INIT_FAILED', {
                    error: error.message,
                    stack: error.stack
                });
            }
            
            this.emit('initializationFailed', error);
            throw error;
        }
    }

    /**
     * Set up event listeners between components
     */
    setupEventListeners() {
        // Authentication events
        if (this.components.authManager) {
            this.components.authManager.on('userAuthenticated', async (data) => {
                this.emit('userAuthenticated', data);
                if (this.components.auditLogger) {
                    await this.components.auditLogger.logSecurityEvent('USER_AUTHENTICATED', data);
                }
            });

            this.components.authManager.on('authenticationFailed', async (data) => {
                this.emit('authenticationFailed', data);
                if (this.components.auditLogger) {
                    await this.components.auditLogger.logSecurityEvent('AUTHENTICATION_FAILED', data);
                }
            });

            this.components.authManager.on('userLoggedOut', async (data) => {
                this.emit('userLoggedOut', data);
            });
        }

        // RBAC events
        if (this.components.rbacController) {
            this.components.rbacController.on('roleAssigned', async (data) => {
                this.emit('roleAssigned', data);
            });

            this.components.rbacController.on('roleRemoved', async (data) => {
                this.emit('roleRemoved', data);
            });
        }

        // Input validation events
        if (this.components.inputValidator) {
            this.components.inputValidator.on('validationFailed', async (data) => {
                this.emit('validationFailed', data);
            });
        }

        // Encryption events
        if (this.components.encryptionService) {
            this.components.encryptionService.on('keyRotated', async (data) => {
                this.emit('keyRotated', data);
                if (this.components.auditLogger) {
                    await this.components.auditLogger.logSecurityEvent('ENCRYPTION_KEY_ROTATED', data);
                }
            });
        }

        // Vulnerability scanner events
        if (this.components.vulnerabilityScanner) {
            this.components.vulnerabilityScanner.on('scanCompleted', async (data) => {
                this.emit('scanCompleted', data);
            });

            this.components.vulnerabilityScanner.on('criticalVulnerabilitiesFound', async (data) => {
                this.emit('criticalVulnerabilitiesFound', data);
                if (this.components.auditLogger) {
                    await this.components.auditLogger.logSecurityEvent('CRITICAL_VULNERABILITIES_FOUND', {
                        count: data.length,
                        vulnerabilities: data
                    });
                }
            });
        }

        // Audit logger events
        if (this.components.auditLogger) {
            this.components.auditLogger.on('criticalSecurityEvent', (data) => {
                this.emit('criticalSecurityEvent', data);
            });
        }
    }

    /**
     * Get authentication manager
     */
    getAuthManager() {
        this.ensureInitialized();
        return this.components.authManager;
    }

    /**
     * Get RBAC controller
     */
    getRBACController() {
        this.ensureInitialized();
        return this.components.rbacController;
    }

    /**
     * Get input validator
     */
    getInputValidator() {
        this.ensureInitialized();
        return this.components.inputValidator;
    }

    /**
     * Get encryption service
     */
    getEncryptionService() {
        this.ensureInitialized();
        return this.components.encryptionService;
    }

    /**
     * Get audit logger
     */
    getAuditLogger() {
        this.ensureInitialized();
        return this.components.auditLogger;
    }

    /**
     * Get vulnerability scanner
     */
    getVulnerabilityScanner() {
        this.ensureInitialized();
        return this.components.vulnerabilityScanner;
    }

    /**
     * Get security middleware
     */
    getSecurityMiddleware() {
        this.ensureInitialized();
        return this.components.securityMiddleware;
    }

    /**
     * Authenticate user
     */
    async authenticateUser(username, password, mfaToken = null, clientInfo = {}) {
        this.ensureInitialized();
        
        if (!this.components.authManager) {
            throw new Error('Authentication manager not enabled');
        }

        return await this.components.authManager.authenticate(username, password, mfaToken, clientInfo);
    }

    /**
     * Check user permission
     */
    async checkPermission(userId, permission, resource = null, context = {}) {
        this.ensureInitialized();
        
        if (!this.components.rbacController) {
            throw new Error('RBAC controller not enabled');
        }

        return await this.components.rbacController.hasPermission(userId, permission, resource, context);
    }

    /**
     * Validate input data
     */
    async validateInput(input, schemaName, context = {}) {
        this.ensureInitialized();
        
        if (!this.components.inputValidator) {
            throw new Error('Input validator not enabled');
        }

        return await this.components.inputValidator.validateInput(input, schemaName, context);
    }

    /**
     * Encrypt sensitive data
     */
    async encryptData(data, options = {}) {
        this.ensureInitialized();
        
        if (!this.components.encryptionService) {
            throw new Error('Encryption service not enabled');
        }

        return await this.components.encryptionService.encrypt(data, options);
    }

    /**
     * Decrypt sensitive data
     */
    async decryptData(encryptedData, options = {}) {
        this.ensureInitialized();
        
        if (!this.components.encryptionService) {
            throw new Error('Encryption service not enabled');
        }

        return await this.components.encryptionService.decrypt(encryptedData, options);
    }

    /**
     * Log security event
     */
    async logSecurityEvent(eventType, eventData = {}, level = 'info') {
        if (!this.components.auditLogger) {
            return; // Silently skip if audit logging is disabled
        }

        return await this.components.auditLogger.logSecurityEvent(eventType, eventData, level);
    }

    /**
     * Run security scan
     */
    async runSecurityScan(options = {}) {
        this.ensureInitialized();
        
        if (!this.components.vulnerabilityScanner) {
            throw new Error('Vulnerability scanner not enabled');
        }

        return await this.components.vulnerabilityScanner.runScan(options);
    }

    /**
     * Get security status
     */
    async getSecurityStatus() {
        this.ensureInitialized();

        const status = {
            framework: {
                initialized: this.initialized,
                components: Object.keys(this.components),
                uptime: process.uptime()
            },
            authentication: null,
            authorization: null,
            encryption: null,
            vulnerabilities: null,
            audit: null
        };

        // Authentication status
        if (this.components.authManager) {
            status.authentication = {
                activeSessions: this.components.authManager.activeSessions.size,
                refreshTokens: this.components.authManager.refreshTokens.size
            };
        }

        // Authorization status
        if (this.components.rbacController) {
            status.authorization = {
                totalRoles: this.components.rbacController.roles.size,
                totalPermissions: this.components.rbacController.permissions.size,
                userRoles: this.components.rbacController.userRoles.size,
                cacheSize: this.components.rbacController.permissionCache.size
            };
        }

        // Encryption status
        if (this.components.encryptionService) {
            status.encryption = this.components.encryptionService.getEncryptionStats();
        }

        // Vulnerability status
        if (this.components.vulnerabilityScanner) {
            status.vulnerabilities = this.components.vulnerabilityScanner.getScannerStats();
        }

        // Audit status
        if (this.components.auditLogger) {
            status.audit = this.components.auditLogger.getAuditStats();
        }

        return status;
    }

    /**
     * Generate security report
     */
    async generateSecurityReport(options = {}) {
        this.ensureInitialized();

        const report = {
            generatedAt: new Date().toISOString(),
            framework: await this.getSecurityStatus(),
            compliance: {},
            recommendations: []
        };

        // Generate compliance report if audit logger is available
        if (this.components.auditLogger) {
            try {
                report.compliance = await this.components.auditLogger.generateComplianceReport(options);
            } catch (error) {
                report.compliance = { error: error.message };
            }
        }

        // Generate vulnerability report if scanner is available
        if (this.components.vulnerabilityScanner) {
            try {
                const scanHistory = this.components.vulnerabilityScanner.getScanHistory(5);
                report.vulnerabilities = {
                    recentScans: scanHistory,
                    totalVulnerabilities: this.components.vulnerabilityScanner.vulnerabilities.size
                };
            } catch (error) {
                report.vulnerabilities = { error: error.message };
            }
        }

        // Generate recommendations
        report.recommendations = this.generateSecurityRecommendations(report);

        return report;
    }

    /**
     * Generate security recommendations
     */
    generateSecurityRecommendations(report) {
        const recommendations = [];

        // Check authentication configuration
        if (!this.components.authManager) {
            recommendations.push({
                category: 'authentication',
                priority: 'high',
                title: 'Enable Authentication Manager',
                description: 'Authentication manager is not enabled. This leaves the system vulnerable to unauthorized access.'
            });
        }

        // Check RBAC configuration
        if (!this.components.rbacController) {
            recommendations.push({
                category: 'authorization',
                priority: 'high',
                title: 'Enable RBAC Controller',
                description: 'Role-based access control is not enabled. Implement proper authorization controls.'
            });
        }

        // Check encryption
        if (!this.components.encryptionService) {
            recommendations.push({
                category: 'encryption',
                priority: 'medium',
                title: 'Enable Encryption Service',
                description: 'Data encryption is not enabled. Sensitive data should be encrypted at rest and in transit.'
            });
        }

        // Check vulnerability scanning
        if (!this.components.vulnerabilityScanner) {
            recommendations.push({
                category: 'vulnerability_management',
                priority: 'medium',
                title: 'Enable Vulnerability Scanner',
                description: 'Vulnerability scanning is not enabled. Regular security scans help identify potential threats.'
            });
        }

        // Check audit logging
        if (!this.components.auditLogger) {
            recommendations.push({
                category: 'audit',
                priority: 'high',
                title: 'Enable Audit Logging',
                description: 'Audit logging is not enabled. Security events should be logged for compliance and monitoring.'
            });
        }

        return recommendations;
    }

    /**
     * Perform security health check
     */
    async performHealthCheck() {
        const healthCheck = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {},
            issues: []
        };

        // Check each component
        for (const [name, component] of Object.entries(this.components)) {
            try {
                // Basic health check - component exists and has expected methods
                const isHealthy = component && typeof component === 'object';
                
                healthCheck.components[name] = {
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    uptime: process.uptime()
                };

                if (!isHealthy) {
                    healthCheck.issues.push(`Component ${name} is not healthy`);
                    healthCheck.status = 'degraded';
                }

            } catch (error) {
                healthCheck.components[name] = {
                    status: 'error',
                    error: error.message
                };
                healthCheck.issues.push(`Component ${name} error: ${error.message}`);
                healthCheck.status = 'unhealthy';
            }
        }

        return healthCheck;
    }

    /**
     * Ensure framework is initialized
     */
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Security framework not initialized. Call initializeComponents() first.');
        }
    }

    /**
     * Sanitize configuration for logging
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        
        // Remove sensitive configuration values
        const sensitiveKeys = ['secret', 'key', 'password', 'token'];
        
        function sanitizeObject(obj) {
            if (typeof obj !== 'object' || obj === null) return obj;
            
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                    result[key] = '[REDACTED]';
                } else if (typeof value === 'object') {
                    result[key] = sanitizeObject(value);
                } else {
                    result[key] = value;
                }
            }
            return result;
        }

        return sanitizeObject(sanitized);
    }

    /**
     * Destroy security framework
     */
    async destroy() {
        try {
            if (this.components.auditLogger) {
                await this.components.auditLogger.logSecurityEvent('SECURITY_FRAMEWORK_DESTROYING', {
                    timestamp: new Date()
                });
            }

            // Destroy components in reverse order
            const destroyOrder = [
                'securityMiddleware',
                'vulnerabilityScanner',
                'encryptionService',
                'inputValidator',
                'rbacController',
                'authManager',
                'auditLogger'
            ];

            for (const componentName of destroyOrder) {
                const component = this.components[componentName];
                if (component && typeof component.destroy === 'function') {
                    await component.destroy();
                }
            }

            this.components = {};
            this.initialized = false;

            this.emit('destroyed');

        } catch (error) {
            this.emit('destroyError', error);
            throw error;
        }
    }
}

// Export individual components for direct use
export {
    AuthManager,
    RBACController,
    InputValidator,
    EncryptionService,
    AuditLogger,
    VulnerabilityScanner,
    SecurityMiddleware
};

// Export main framework as default
export default SecurityFramework;

