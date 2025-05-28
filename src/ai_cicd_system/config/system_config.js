/**
 * @fileoverview System Configuration Manager
 * @description Unified configuration for all AI-CICD system components with enhanced validation
 */

import { log } from '../utils/simple_logger.js';
import { defaultConfigValidator } from '../utils/config_validator.js';

/**
 * System configuration with environment-based defaults and enhanced validation
 */
export class SystemConfig {
    constructor(userConfig = {}) {
        this.startTime = Date.now();
        
        // Merge user config with defaults
        this.config = this._mergeWithDefaults(userConfig);
        
        // Validate configuration with enhanced validation
        this._validateConfigurationEnhanced();
    }

    /**
     * Get configuration for a specific component
     * @param {string} component - Component name
     * @returns {Object} Component configuration
     */
    getComponentConfig(component) {
        return this.config[component] || {};
    }

    /**
     * Get database configuration
     */
    get database() {
        return this.config.database;
    }

    /**
     * Get NLP configuration
     */
    get nlp() {
        return this.config.nlp;
    }

    /**
     * Get codegen configuration
     */
    get codegen() {
        return this.config.codegen;
    }

    /**
     * Get validation configuration
     */
    get validation() {
        return this.config.validation;
    }

    /**
     * Get workflow configuration
     */
    get workflow() {
        return this.config.workflow;
    }

    /**
     * Get context configuration
     */
    get context() {
        return this.config.context;
    }

    /**
     * Get monitoring configuration
     */
    get monitoring() {
        return this.config.monitoring;
    }

    /**
     * Check if running in mock mode
     */
    get isMockMode() {
        return this.config.mode === 'mock' || !this._hasRequiredCredentials();
    }

    /**
     * Merge user configuration with defaults
     * @param {Object} userConfig - User provided configuration
     * @returns {Object} Merged configuration
     * @private
     */
    _mergeWithDefaults(userConfig) {
        const defaults = {
            mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
            
            // Database configuration
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'codegen-taskmaster-db',
                username: process.env.DB_USER || 'software_developer',
                password: process.env.DB_PASSWORD || 'password',
                ssl_mode: process.env.DB_SSL_MODE || 'require',
                pool_min_size: parseInt(process.env.DB_POOL_MIN_SIZE) || 5,
                pool_max_size: parseInt(process.env.DB_POOL_MAX_SIZE) || 20,
                command_timeout: parseInt(process.env.DB_COMMAND_TIMEOUT) || 60000,
                enable_mock: !process.env.DB_HOST || userConfig.database?.enable_mock
            },

            // NLP and requirement processing
            nlp: {
                enable_entity_extraction: true,
                enable_keyword_extraction: true,
                confidence_threshold: 0.7,
                max_tasks_per_requirement: 15,
                enable_subtask_generation: true,
                enable_dependency_analysis: true,
                enable_complexity_estimation: true
            },

            // Codegen integration
            codegen: {
                api_url: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
                api_key: process.env.CODEGEN_API_KEY,
                timeout: 60000,
                retry_attempts: 3,
                retry_delay: 2000,
                enable_tracking: true,
                max_retries: 3,
                enable_mock: !process.env.CODEGEN_API_KEY || userConfig.codegen?.enable_mock
            },

            // Validation engine
            validation: {
                agentapi_url: process.env.AGENTAPI_URL || 'http://localhost:8000',
                api_key: process.env.CLAUDE_CODE_API_KEY,
                timeout: 300000, // 5 minutes
                enable_security_analysis: true,
                enable_performance_analysis: true,
                max_validation_time: 300000,
                scoring_criteria: {
                    code_quality: { weight: 0.3 },
                    functionality: { weight: 0.4 },
                    testing: { weight: 0.2 },
                    documentation: { weight: 0.1 }
                },
                enable_mock: !process.env.CLAUDE_CODE_API_KEY || userConfig.validation?.enable_mock
            },

            // Workflow orchestration
            workflow: {
                max_concurrent_workflows: 10,
                max_concurrent_steps: 5,
                step_timeout: 300000, // 5 minutes
                enable_parallel_execution: true,
                enable_state_persistence: true,
                enable_rollback: true,
                max_history_entries: 1000
            },

            // Context management
            context: {
                enable_context_caching: process.env.ENABLE_CONTEXT_CACHING !== 'false',
                enable_advanced_analytics: process.env.ENABLE_ADVANCED_ANALYTICS !== 'false',
                max_context_size: 8000,
                include_code_examples: true,
                enhance_with_best_practices: true,
                cache_ttl: 3600000 // 1 hour
            },

            // System monitoring
            monitoring: {
                enable_metrics: process.env.METRICS_ENABLED !== 'false',
                prometheus_port: parseInt(process.env.PROMETHEUS_PORT) || 8000,
                enable_real_time_updates: process.env.ENABLE_REAL_TIME_UPDATES !== 'false',
                health_check_interval: 30000, // 30 seconds
                metrics_collection_interval: 60000, // 1 minute
                enable_performance_tracking: true
            },

            // Security
            security: {
                secret_key: process.env.SECRET_KEY || 'dev-secret-key',
                jwt_secret: process.env.JWT_SECRET || 'dev-jwt-secret',
                webhook_secret: process.env.WEBHOOK_SECRET,
                webhook_timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 30000
            },

            // Feature flags
            features: {
                enable_real_time_updates: process.env.ENABLE_REAL_TIME_UPDATES !== 'false',
                enable_advanced_analytics: process.env.ENABLE_ADVANCED_ANALYTICS !== 'false',
                enable_context_caching: process.env.ENABLE_CONTEXT_CACHING !== 'false',
                enable_parallel_processing: true,
                enable_auto_retry: true,
                enable_workflow_rollback: true
            },

            // Logging
            logging: {
                level: process.env.LOG_LEVEL || 'INFO',
                enable_debug: process.env.DEBUG === 'true',
                enable_file_logging: false,
                log_file_path: './logs/ai-cicd-system.log'
            }
        };

        return this._deepMerge(defaults, userConfig);
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     * @private
     */
    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Validate configuration with enhanced validation
     * @private
     */
    _validateConfigurationEnhanced() {
        // Use enhanced configuration validator
        const validationResult = defaultConfigValidator.validateWithReport(this.config);
        
        // Log validation results
        if (validationResult.errors.length > 0) {
            validationResult.errors.forEach(error => log('error', `Config error: ${error}`));
        }
        
        if (validationResult.warnings.length > 0) {
            validationResult.warnings.forEach(warning => log('warn', `Config warning: ${warning}`));
        }
        
        if (validationResult.securityIssues.length > 0) {
            validationResult.securityIssues.forEach(issue => log('warn', `Security issue: ${issue}`));
        }
        
        // Log configuration score
        log('info', `Configuration score: ${validationResult.summary.configurationScore}/100`);
        
        // Log recommendations
        const recommendations = validationResult.recommendations;
        if (recommendations.security.length > 0) {
            log('info', `Security recommendations: ${recommendations.security.length} items`);
        }
        
        // Throw error if configuration is invalid
        if (!validationResult.valid) {
            throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
        }
        
        // Store validation result for later access
        this.validationResult = validationResult;
    }

    /**
     * Check if required credentials are available
     * @returns {boolean} Whether credentials are available
     * @private
     */
    _hasRequiredCredentials() {
        return !!(
            this.config.codegen.api_key &&
            this.config.validation.api_key &&
            this.config.database.host !== 'localhost'
        );
    }

    /**
     * Get configuration summary for debugging
     * @returns {Object} Configuration summary
     */
    getSummary() {
        return {
            mode: this.config.mode,
            is_mock_mode: this.isMockMode,
            database_configured: !!this.config.database.host,
            codegen_configured: !!this.config.codegen.api_key,
            validation_configured: !!this.config.validation.api_key,
            features_enabled: Object.entries(this.config.features)
                .filter(([, enabled]) => enabled)
                .map(([feature]) => feature),
            component_configs: {
                database: !!this.config.database.host,
                nlp: this.config.nlp.enable_entity_extraction,
                codegen: !!this.config.codegen.api_url,
                validation: !!this.config.validation.agentapi_url,
                workflow: this.config.workflow.enable_parallel_execution,
                context: this.config.context.enable_context_caching,
                monitoring: this.config.monitoring.enable_metrics
            },
            validation_result: this.validationResult?.summary || null
        };
    }

    /**
     * Get detailed validation report
     * @returns {Object} Detailed validation report
     */
    getValidationReport() {
        return this.validationResult || null;
    }

    /**
     * Create configuration for specific environment
     * @param {string} environment - Environment name
     * @returns {SystemConfig} Environment-specific configuration
     */
    static forEnvironment(environment) {
        const envConfigs = {
            development: {
                mode: 'development',
                database: { enable_mock: true },
                codegen: { enable_mock: true },
                validation: { enable_mock: true },
                logging: { enable_debug: true }
            },
            
            testing: {
                mode: 'testing',
                database: { enable_mock: true },
                codegen: { enable_mock: true },
                validation: { enable_mock: true },
                workflow: { max_concurrent_workflows: 2 },
                logging: { level: 'ERROR' }
            },
            
            production: {
                mode: 'production',
                database: { enable_mock: false },
                codegen: { enable_mock: false },
                validation: { enable_mock: false },
                logging: { enable_debug: false, level: 'INFO' }
            }
        };

        return new SystemConfig(envConfigs[environment] || {});
    }
}

export default SystemConfig;
