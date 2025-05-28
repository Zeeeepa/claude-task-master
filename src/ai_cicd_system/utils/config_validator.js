/**
 * @fileoverview Enhanced Configuration Validation
 * @description Comprehensive configuration validation with security checks and best practices
 */

import { log } from './simple_logger.js';
import { validateInput } from './error_handler.js';

/**
 * Enhanced configuration validator
 */
export class ConfigValidator {
    constructor() {
        this.validationRules = new Map();
        this.securityChecks = new Map();
        this.setupDefaultRules();
    }

    /**
     * Setup default validation rules
     */
    setupDefaultRules() {
        // Database configuration rules
        this.addValidationRule('database', {
            host: { 
                required: true, 
                type: 'string',
                validate: (value) => {
                    if (value === 'localhost' && process.env.NODE_ENV === 'production') {
                        return 'Database host should not be localhost in production';
                    }
                    return true;
                }
            },
            port: { 
                required: true, 
                type: 'number', 
                min: 1, 
                max: 65535 
            },
            database: { 
                required: true, 
                type: 'string', 
                minLength: 1 
            },
            username: { 
                required: true, 
                type: 'string', 
                minLength: 1 
            },
            password: { 
                required: true, 
                type: 'string', 
                minLength: 8,
                validate: (value) => {
                    if (process.env.NODE_ENV === 'production' && value === 'password') {
                        return 'Default password should not be used in production';
                    }
                    return true;
                }
            }
        });

        // Codegen configuration rules
        this.addValidationRule('codegen', {
            api_url: { 
                required: true, 
                type: 'string',
                pattern: /^https?:\/\/.+/,
                validate: (value) => {
                    if (process.env.NODE_ENV === 'production' && !value.startsWith('https://')) {
                        return 'API URL should use HTTPS in production';
                    }
                    return true;
                }
            },
            api_key: { 
                type: 'string',
                validate: (value) => {
                    if (value && value.length < 20) {
                        return 'API key appears to be too short';
                    }
                    return true;
                }
            },
            timeout: { 
                type: 'number', 
                min: 1000, 
                max: 300000 
            },
            max_retries: { 
                type: 'number', 
                min: 0, 
                max: 10 
            }
        });

        // Security configuration rules
        this.addValidationRule('security', {
            secret_key: {
                required: true,
                type: 'string',
                minLength: 32,
                validate: (value) => {
                    if (process.env.NODE_ENV === 'production' && value === 'dev-secret-key') {
                        return 'Production secret key must be changed from default';
                    }
                    if (value.length < 32) {
                        return 'Secret key should be at least 32 characters long';
                    }
                    return true;
                }
            },
            jwt_secret: {
                required: true,
                type: 'string',
                minLength: 32,
                validate: (value) => {
                    if (process.env.NODE_ENV === 'production' && value === 'dev-jwt-secret') {
                        return 'Production JWT secret must be changed from default';
                    }
                    return true;
                }
            }
        });

        // Workflow configuration rules
        this.addValidationRule('workflow', {
            max_concurrent_workflows: { 
                type: 'number', 
                min: 1, 
                max: 100 
            },
            max_concurrent_steps: { 
                type: 'number', 
                min: 1, 
                max: 20 
            },
            step_timeout: { 
                type: 'number', 
                min: 1000, 
                max: 3600000 
            }
        });

        // Monitoring configuration rules
        this.addValidationRule('monitoring', {
            health_check_interval: { 
                type: 'number', 
                min: 5000, 
                max: 300000 
            },
            metrics_collection_interval: { 
                type: 'number', 
                min: 10000, 
                max: 600000 
            }
        });
    }

    /**
     * Add validation rule for a configuration section
     * @param {string} section - Configuration section name
     * @param {Object} rules - Validation rules
     */
    addValidationRule(section, rules) {
        this.validationRules.set(section, rules);
    }

    /**
     * Add security check
     * @param {string} name - Security check name
     * @param {Function} checkFn - Security check function
     */
    addSecurityCheck(name, checkFn) {
        this.securityChecks.set(name, checkFn);
    }

    /**
     * Validate complete configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     */
    validateConfiguration(config) {
        const errors = [];
        const warnings = [];
        const securityIssues = [];

        // Validate each section
        for (const [section, rules] of this.validationRules) {
            const sectionConfig = config[section];
            if (!sectionConfig) {
                if (this.isSectionRequired(section, config.mode)) {
                    errors.push(`Required configuration section '${section}' is missing`);
                }
                continue;
            }

            try {
                validateInput(sectionConfig, rules);
            } catch (error) {
                errors.push(`${section}: ${error.message}`);
            }
        }

        // Run security checks
        for (const [name, checkFn] of this.securityChecks) {
            try {
                const result = checkFn(config);
                if (result !== true) {
                    securityIssues.push(`Security check '${name}': ${result}`);
                }
            } catch (error) {
                securityIssues.push(`Security check '${name}' failed: ${error.message}`);
            }
        }

        // Environment-specific validations
        const envIssues = this.validateEnvironmentSpecific(config);
        warnings.push(...envIssues.warnings);
        errors.push(...envIssues.errors);

        // Performance recommendations
        const perfRecommendations = this.getPerformanceRecommendations(config);
        warnings.push(...perfRecommendations);

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            securityIssues,
            summary: {
                totalErrors: errors.length,
                totalWarnings: warnings.length,
                totalSecurityIssues: securityIssues.length,
                configurationScore: this.calculateConfigurationScore(errors, warnings, securityIssues)
            }
        };
    }

    /**
     * Check if configuration section is required
     * @param {string} section - Section name
     * @param {string} mode - Configuration mode
     * @returns {boolean} Whether section is required
     */
    isSectionRequired(section, mode) {
        const requiredSections = {
            development: ['database', 'security'],
            testing: ['database', 'security'],
            production: ['database', 'codegen', 'validation', 'security', 'monitoring']
        };

        return requiredSections[mode]?.includes(section) || false;
    }

    /**
     * Validate environment-specific requirements
     * @param {Object} config - Configuration object
     * @returns {Object} Environment validation results
     */
    validateEnvironmentSpecific(config) {
        const errors = [];
        const warnings = [];

        if (config.mode === 'production') {
            // Production-specific validations
            if (!config.database?.ssl_mode || config.database.ssl_mode === 'disable') {
                warnings.push('SSL should be enabled for database connections in production');
            }

            if (!config.codegen?.api_key) {
                warnings.push('Codegen API key not configured - system will run in mock mode');
            }

            if (!config.validation?.api_key) {
                warnings.push('Validation API key not configured - system will run in mock mode');
            }

            if (config.logging?.enable_debug) {
                warnings.push('Debug logging should be disabled in production for performance');
            }

            if (!config.monitoring?.enable_metrics) {
                warnings.push('Metrics collection should be enabled in production');
            }
        }

        if (config.mode === 'development') {
            // Development-specific validations
            if (!config.database?.enable_mock && config.database?.host !== 'localhost') {
                warnings.push('Consider using mock database for development');
            }
        }

        return { errors, warnings };
    }

    /**
     * Get performance recommendations
     * @param {Object} config - Configuration object
     * @returns {Array} Performance recommendations
     */
    getPerformanceRecommendations(config) {
        const recommendations = [];

        // Database performance
        if (config.database?.pool_max_size && config.database.pool_max_size < 10) {
            recommendations.push('Consider increasing database pool size for better performance');
        }

        // Workflow performance
        if (config.workflow?.max_concurrent_workflows && config.workflow.max_concurrent_workflows > 50) {
            recommendations.push('High concurrent workflow limit may impact performance');
        }

        // Context caching
        if (!config.context?.enable_context_caching) {
            recommendations.push('Enable context caching for better performance');
        }

        // Monitoring intervals
        if (config.monitoring?.health_check_interval && config.monitoring.health_check_interval < 10000) {
            recommendations.push('Very frequent health checks may impact performance');
        }

        return recommendations;
    }

    /**
     * Calculate configuration score
     * @param {Array} errors - Configuration errors
     * @param {Array} warnings - Configuration warnings
     * @param {Array} securityIssues - Security issues
     * @returns {number} Configuration score (0-100)
     */
    calculateConfigurationScore(errors, warnings, securityIssues) {
        let score = 100;
        
        // Deduct points for errors (major issues)
        score -= errors.length * 20;
        
        // Deduct points for warnings (minor issues)
        score -= warnings.length * 5;
        
        // Deduct points for security issues (critical)
        score -= securityIssues.length * 15;
        
        return Math.max(0, score);
    }

    /**
     * Get configuration recommendations
     * @param {Object} config - Configuration object
     * @returns {Object} Configuration recommendations
     */
    getConfigurationRecommendations(config) {
        const recommendations = {
            security: [],
            performance: [],
            reliability: [],
            monitoring: []
        };

        // Security recommendations
        if (config.mode === 'production') {
            if (!config.security?.webhook_secret) {
                recommendations.security.push('Configure webhook secret for secure API communication');
            }
            
            if (!config.database?.ssl_mode || config.database.ssl_mode !== 'require') {
                recommendations.security.push('Enable SSL for database connections');
            }
        }

        // Performance recommendations
        if (!config.context?.enable_context_caching) {
            recommendations.performance.push('Enable context caching to improve response times');
        }

        if (config.workflow?.enable_parallel_execution === false) {
            recommendations.performance.push('Enable parallel execution for better throughput');
        }

        // Reliability recommendations
        if (!config.workflow?.enable_rollback) {
            recommendations.reliability.push('Enable workflow rollback for better error recovery');
        }

        if (config.codegen?.max_retries < 3) {
            recommendations.reliability.push('Increase retry attempts for better reliability');
        }

        // Monitoring recommendations
        if (!config.monitoring?.enable_real_time_updates) {
            recommendations.monitoring.push('Enable real-time updates for better observability');
        }

        if (!config.features?.enable_advanced_analytics) {
            recommendations.monitoring.push('Enable advanced analytics for better insights');
        }

        return recommendations;
    }

    /**
     * Validate configuration and provide detailed report
     * @param {Object} config - Configuration to validate
     * @returns {Object} Detailed validation report
     */
    validateWithReport(config) {
        const validation = this.validateConfiguration(config);
        const recommendations = this.getConfigurationRecommendations(config);
        
        return {
            ...validation,
            recommendations,
            configurationAnalysis: {
                mode: config.mode,
                mockModeComponents: this.getMockModeComponents(config),
                enabledFeatures: this.getEnabledFeatures(config),
                resourceLimits: this.getResourceLimits(config)
            }
        };
    }

    /**
     * Get components running in mock mode
     * @param {Object} config - Configuration object
     * @returns {Array} Components in mock mode
     */
    getMockModeComponents(config) {
        const mockComponents = [];
        
        if (config.database?.enable_mock) {
            mockComponents.push('database');
        }
        
        if (config.codegen?.enable_mock || !config.codegen?.api_key) {
            mockComponents.push('codegen');
        }
        
        if (config.validation?.enable_mock || !config.validation?.api_key) {
            mockComponents.push('validation');
        }
        
        return mockComponents;
    }

    /**
     * Get enabled features
     * @param {Object} config - Configuration object
     * @returns {Array} Enabled features
     */
    getEnabledFeatures(config) {
        const features = [];
        
        if (config.features) {
            for (const [feature, enabled] of Object.entries(config.features)) {
                if (enabled) {
                    features.push(feature);
                }
            }
        }
        
        return features;
    }

    /**
     * Get resource limits
     * @param {Object} config - Configuration object
     * @returns {Object} Resource limits
     */
    getResourceLimits(config) {
        return {
            maxConcurrentWorkflows: config.workflow?.max_concurrent_workflows || 10,
            maxConcurrentSteps: config.workflow?.max_concurrent_steps || 5,
            stepTimeout: config.workflow?.step_timeout || 300000,
            databasePoolSize: config.database?.pool_max_size || 20,
            contextCacheSize: config.context?.max_context_size || 8000
        };
    }
}

/**
 * Setup default security checks
 * @param {ConfigValidator} validator - Configuration validator instance
 */
export function setupDefaultSecurityChecks(validator) {
    // Check for default passwords
    validator.addSecurityCheck('default-passwords', (config) => {
        const defaultPasswords = ['password', 'admin', '123456', 'secret'];
        
        if (config.database?.password && defaultPasswords.includes(config.database.password.toLowerCase())) {
            return 'Database password appears to be a default/weak password';
        }
        
        return true;
    });

    // Check for insecure URLs
    validator.addSecurityCheck('insecure-urls', (config) => {
        if (config.mode === 'production') {
            const urls = [
                config.codegen?.api_url,
                config.validation?.agentapi_url
            ].filter(Boolean);
            
            for (const url of urls) {
                if (url.startsWith('http://')) {
                    return `Insecure HTTP URL detected: ${url}`;
                }
            }
        }
        
        return true;
    });

    // Check for weak secrets
    validator.addSecurityCheck('weak-secrets', (config) => {
        const secrets = [
            config.security?.secret_key,
            config.security?.jwt_secret
        ].filter(Boolean);
        
        for (const secret of secrets) {
            if (secret.length < 32) {
                return 'Secrets should be at least 32 characters long';
            }
            
            // Check for common patterns
            if (/^(dev|test|demo|example)/.test(secret.toLowerCase())) {
                return 'Secrets should not contain development/test patterns';
            }
        }
        
        return true;
    });

    // Check for exposed debug information
    validator.addSecurityCheck('debug-exposure', (config) => {
        if (config.mode === 'production' && config.logging?.enable_debug) {
            return 'Debug logging should be disabled in production';
        }
        
        return true;
    });
}

// Create default configuration validator
export const defaultConfigValidator = new ConfigValidator();
setupDefaultSecurityChecks(defaultConfigValidator);

