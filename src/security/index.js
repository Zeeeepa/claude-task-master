/**
 * Unified Security Framework
 * 
 * Consolidated security and authentication framework combining the best features
 * from PRs #77 and #84. Provides enterprise-grade security with zero duplication.
 * 
 * @version 1.0.0
 * @author AI CI/CD System
 */

import { AuthenticationManager } from './auth/authentication-manager.js';
import { AuthorizationManager } from './auth/authorization-manager.js';
import { EncryptionService } from './core/encryption-service.js';
import { AuditLogger } from './core/audit-logger.js';
import { SecurityMiddleware } from './middleware/security-middleware.js';
import { InputValidator } from './validation/input-validator.js';
import { VulnerabilityScanner } from './scanning/vulnerability-scanner.js';
import { SecurityConfig } from './config/security-config.js';
import { EventEmitter } from 'events';

/**
 * Main Security Framework Class
 * 
 * Provides a unified interface for all security operations including:
 * - Authentication (JWT, API keys, sessions)
 * - Authorization (RBAC, permissions)
 * - Encryption (data at rest and in transit)
 * - Audit logging and monitoring
 * - Input validation and sanitization
 * - Vulnerability scanning
 */
export class SecurityFramework extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Initialize configuration
        this.config = new SecurityConfig(config);
        
        // Component registry
        this.components = new Map();
        
        // Framework state
        this.initialized = false;
        this.startTime = Date.now();
        
        // Initialize components
        this._initializeComponents();
    }

    /**
     * Initialize all security components in proper order
     */
    async _initializeComponents() {
        try {
            // 1. Core services first (no dependencies)
            await this._initializeCore();
            
            // 2. Authentication services (depend on core)
            await this._initializeAuthentication();
            
            // 3. Authorization services (depend on authentication)
            await this._initializeAuthorization();
            
            // 4. Middleware and validation (depend on auth/authz)
            await this._initializeMiddleware();
            
            // 5. Security scanning (depends on all others)
            await this._initializeScanning();
            
            this.initialized = true;
            this.emit('initialized', { timestamp: new Date().toISOString() });
            
            // Log successful initialization
            if (this.components.has('auditLogger')) {
                await this.components.get('auditLogger').logSecurityEvent('SECURITY_FRAMEWORK_INITIALIZED', {
                    components: Array.from(this.components.keys()),
                    initializationTime: Date.now() - this.startTime
                });
            }
            
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Security framework initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize core security services
     */
    async _initializeCore() {
        // Audit Logger - foundational component
        if (this.config.isEnabled('auditLogging')) {
            const auditLogger = new AuditLogger(this.config.getSection('auditLogging'));
            await auditLogger.initialize();
            this.components.set('auditLogger', auditLogger);
        }

        // Encryption Service - foundational component
        if (this.config.isEnabled('encryption')) {
            const encryptionService = new EncryptionService(this.config.getSection('encryption'));
            await encryptionService.initialize();
            this.components.set('encryptionService', encryptionService);
        }
    }

    /**
     * Initialize authentication services
     */
    async _initializeAuthentication() {
        if (this.config.isEnabled('authentication')) {
            const authManager = new AuthenticationManager(
                this.config.getSection('authentication'),
                this.components.get('encryptionService'),
                this.components.get('auditLogger')
            );
            await authManager.initialize();
            this.components.set('authenticationManager', authManager);
        }
    }

    /**
     * Initialize authorization services
     */
    async _initializeAuthorization() {
        if (this.config.isEnabled('authorization')) {
            const authzManager = new AuthorizationManager(
                this.config.getSection('authorization'),
                this.components.get('authenticationManager'),
                this.components.get('auditLogger')
            );
            await authzManager.initialize();
            this.components.set('authorizationManager', authzManager);
        }
    }

    /**
     * Initialize middleware and validation
     */
    async _initializeMiddleware() {
        // Input Validator
        if (this.config.isEnabled('inputValidation')) {
            const inputValidator = new InputValidator(this.config.getSection('inputValidation'));
            this.components.set('inputValidator', inputValidator);
        }

        // Security Middleware
        if (this.config.isEnabled('securityMiddleware')) {
            const securityMiddleware = new SecurityMiddleware(
                this.config.getSection('securityMiddleware'),
                this.components.get('authenticationManager'),
                this.components.get('authorizationManager'),
                this.components.get('inputValidator'),
                this.components.get('auditLogger')
            );
            this.components.set('securityMiddleware', securityMiddleware);
        }
    }

    /**
     * Initialize security scanning
     */
    async _initializeScanning() {
        if (this.config.isEnabled('vulnerabilityScanning')) {
            const vulnerabilityScanner = new VulnerabilityScanner(
                this.config.getSection('vulnerabilityScanning'),
                this.components.get('auditLogger')
            );
            this.components.set('vulnerabilityScanner', vulnerabilityScanner);
        }
    }

    /**
     * Get a security component by name
     */
    getComponent(name) {
        if (!this.initialized) {
            throw new Error('Security framework not initialized');
        }
        return this.components.get(name);
    }

    /**
     * Get authentication manager
     */
    getAuthenticationManager() {
        return this.getComponent('authenticationManager');
    }

    /**
     * Get authorization manager
     */
    getAuthorizationManager() {
        return this.getComponent('authorizationManager');
    }

    /**
     * Get encryption service
     */
    getEncryptionService() {
        return this.getComponent('encryptionService');
    }

    /**
     * Get audit logger
     */
    getAuditLogger() {
        return this.getComponent('auditLogger');
    }

    /**
     * Get security middleware
     */
    getSecurityMiddleware() {
        return this.getComponent('securityMiddleware');
    }

    /**
     * Get input validator
     */
    getInputValidator() {
        return this.getComponent('inputValidator');
    }

    /**
     * Get vulnerability scanner
     */
    getVulnerabilityScanner() {
        return this.getComponent('vulnerabilityScanner');
    }

    /**
     * Perform health check on all components
     */
    async healthCheck() {
        const results = {};
        
        for (const [name, component] of this.components) {
            try {
                if (typeof component.healthCheck === 'function') {
                    results[name] = await component.healthCheck();
                } else {
                    results[name] = { status: 'ok', message: 'Component active' };
                }
            } catch (error) {
                results[name] = { status: 'error', message: error.message };
            }
        }
        
        return {
            framework: {
                status: this.initialized ? 'ok' : 'error',
                uptime: Date.now() - this.startTime,
                components: Object.keys(results).length
            },
            components: results
        };
    }

    /**
     * Gracefully shutdown the security framework
     */
    async shutdown() {
        try {
            // Shutdown components in reverse order
            const shutdownOrder = Array.from(this.components.keys()).reverse();
            
            for (const componentName of shutdownOrder) {
                const component = this.components.get(componentName);
                if (typeof component.shutdown === 'function') {
                    await component.shutdown();
                }
            }
            
            this.initialized = false;
            this.emit('shutdown', { timestamp: new Date().toISOString() });
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
}

// Export individual components for direct use if needed
export {
    AuthenticationManager,
    AuthorizationManager,
    EncryptionService,
    AuditLogger,
    SecurityMiddleware,
    InputValidator,
    VulnerabilityScanner,
    SecurityConfig
};

// Default export
export default SecurityFramework;

