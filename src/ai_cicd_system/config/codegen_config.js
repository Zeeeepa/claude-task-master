/**
 * @fileoverview Codegen Configuration
 * @description Configuration management for Codegen API integration
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Default configuration for Codegen integration
 */
export const DEFAULT_CODEGEN_CONFIG = {
    // API Configuration
    api_url: 'https://api.codegen.sh',
    timeout: 120000, // 2 minutes
    
    // Authentication
    token: null, // Must be provided
    org_id: null, // Must be provided
    
    // SDK Configuration
    python_path: 'python3',
    sdk_version: 'latest',
    
    // Retry Configuration
    max_retries: 3,
    base_delay: 1000,
    max_delay: 30000,
    backoff_multiplier: 2,
    jitter: true,
    
    // Retry Conditions
    retry_on_timeout: true,
    retry_on_rate_limit: true,
    retry_on_server_error: true,
    
    // Prompt Optimization
    max_prompt_length: 8000,
    include_context: true,
    include_examples: true,
    optimization_level: 'standard',
    
    // Feature Flags
    enable_mock: false,
    enable_tracking: true,
    enable_validation: true,
    enable_monitoring: true,
    
    // Performance
    connection_pool_size: 5,
    request_queue_size: 100,
    
    // Logging
    log_level: 'info',
    log_requests: false,
    log_responses: false
};

/**
 * Environment-specific configurations
 */
export const ENVIRONMENT_CONFIGS = {
    development: {
        ...DEFAULT_CODEGEN_CONFIG,
        log_level: 'debug',
        log_requests: true,
        timeout: 60000, // 1 minute for faster development
        enable_mock: true // Default to mock in development
    },
    
    testing: {
        ...DEFAULT_CODEGEN_CONFIG,
        log_level: 'warning',
        timeout: 30000, // 30 seconds for tests
        max_retries: 1, // Fewer retries in tests
        enable_mock: true,
        enable_tracking: false
    },
    
    staging: {
        ...DEFAULT_CODEGEN_CONFIG,
        log_level: 'info',
        enable_mock: false,
        enable_monitoring: true
    },
    
    production: {
        ...DEFAULT_CODEGEN_CONFIG,
        log_level: 'warning',
        enable_mock: false,
        enable_monitoring: true,
        log_requests: false,
        log_responses: false
    }
};

/**
 * Configuration manager for Codegen integration
 */
export class CodegenConfig {
    constructor(config = {}, environment = 'development') {
        this.environment = environment;
        this.config = this._mergeConfigs(config, environment);
        this._validateConfig();
        
        log('debug', `CodegenConfig initialized for environment: ${environment}`);
    }

    /**
     * Merge user config with environment defaults
     * @param {Object} userConfig - User-provided configuration
     * @param {string} environment - Environment name
     * @returns {Object} Merged configuration
     * @private
     */
    _mergeConfigs(userConfig, environment) {
        const envConfig = ENVIRONMENT_CONFIGS[environment] || ENVIRONMENT_CONFIGS.development;
        
        // Deep merge configurations
        const merged = {
            ...envConfig,
            ...userConfig
        };
        
        // Handle environment variables
        merged.token = merged.token || process.env.CODEGEN_TOKEN || process.env.CODEGEN_API_KEY;
        merged.org_id = merged.org_id || process.env.CODEGEN_ORG_ID;
        merged.api_url = merged.api_url || process.env.CODEGEN_API_URL || DEFAULT_CODEGEN_CONFIG.api_url;
        merged.python_path = merged.python_path || process.env.PYTHON_PATH || DEFAULT_CODEGEN_CONFIG.python_path;
        
        return merged;
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const errors = [];
        
        // Required fields when not in mock mode
        if (!this.config.enable_mock) {
            if (!this.config.token) {
                errors.push('Codegen API token is required when not in mock mode');
            }
            
            if (!this.config.org_id) {
                errors.push('Codegen organization ID is required when not in mock mode');
            }
        }
        
        // Validate numeric values
        if (this.config.timeout <= 0) {
            errors.push('Timeout must be a positive number');
        }
        
        if (this.config.max_retries < 0) {
            errors.push('Max retries must be non-negative');
        }
        
        if (this.config.max_prompt_length <= 0) {
            errors.push('Max prompt length must be positive');
        }
        
        // Validate URLs
        if (this.config.api_url && !this._isValidUrl(this.config.api_url)) {
            errors.push('API URL must be a valid URL');
        }
        
        // Validate optimization level
        const validOptimizationLevels = ['minimal', 'standard', 'comprehensive'];
        if (!validOptimizationLevels.includes(this.config.optimization_level)) {
            errors.push(`Optimization level must be one of: ${validOptimizationLevels.join(', ')}`);
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Check if URL is valid
     * @param {string} url - URL to validate
     * @returns {boolean} Whether URL is valid
     * @private
     */
    _isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get configuration value
     * @param {string} key - Configuration key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Configuration value
     */
    get(key, defaultValue = undefined) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    /**
     * Set configuration value
     * @param {string} key - Configuration key
     * @param {any} value - Configuration value
     */
    set(key, value) {
        this.config[key] = value;
        this._validateConfig();
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Get sanitized configuration (without sensitive data)
     * @returns {Object} Sanitized configuration
     */
    getSanitized() {
        const sanitized = { ...this.config };
        
        // Remove sensitive fields
        if (sanitized.token) {
            sanitized.token = `${sanitized.token.substring(0, 10)}...`;
        }
        
        return sanitized;
    }

    /**
     * Check if running in mock mode
     * @returns {boolean} Whether mock mode is enabled
     */
    isMockMode() {
        return this.config.enable_mock;
    }

    /**
     * Check if feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    isFeatureEnabled(feature) {
        const featureKey = `enable_${feature}`;
        return this.config[featureKey] === true;
    }

    /**
     * Get SDK configuration
     * @returns {Object} SDK-specific configuration
     */
    getSDKConfig() {
        return {
            org_id: this.config.org_id,
            token: this.config.token,
            api_url: this.config.api_url,
            timeout: this.config.timeout,
            python_path: this.config.python_path,
            max_retries: this.config.max_retries
        };
    }

    /**
     * Get retry configuration
     * @returns {Object} Retry-specific configuration
     */
    getRetryConfig() {
        return {
            max_retries: this.config.max_retries,
            base_delay: this.config.base_delay,
            max_delay: this.config.max_delay,
            backoff_multiplier: this.config.backoff_multiplier,
            jitter: this.config.jitter,
            retry_on_timeout: this.config.retry_on_timeout,
            retry_on_rate_limit: this.config.retry_on_rate_limit,
            retry_on_server_error: this.config.retry_on_server_error
        };
    }

    /**
     * Get prompt optimization configuration
     * @returns {Object} Prompt optimization configuration
     */
    getPromptConfig() {
        return {
            max_prompt_length: this.config.max_prompt_length,
            include_context: this.config.include_context,
            include_examples: this.config.include_examples,
            optimization_level: this.config.optimization_level
        };
    }

    /**
     * Update configuration from environment variables
     */
    updateFromEnvironment() {
        const envUpdates = {};
        
        if (process.env.CODEGEN_TOKEN) {
            envUpdates.token = process.env.CODEGEN_TOKEN;
        }
        
        if (process.env.CODEGEN_ORG_ID) {
            envUpdates.org_id = process.env.CODEGEN_ORG_ID;
        }
        
        if (process.env.CODEGEN_API_URL) {
            envUpdates.api_url = process.env.CODEGEN_API_URL;
        }
        
        if (process.env.CODEGEN_TIMEOUT) {
            envUpdates.timeout = parseInt(process.env.CODEGEN_TIMEOUT);
        }
        
        if (process.env.CODEGEN_ENABLE_MOCK) {
            envUpdates.enable_mock = process.env.CODEGEN_ENABLE_MOCK === 'true';
        }
        
        if (Object.keys(envUpdates).length > 0) {
            Object.assign(this.config, envUpdates);
            this._validateConfig();
            log('debug', 'Configuration updated from environment variables');
        }
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            environment: this.environment,
            mock_mode: this.config.enable_mock,
            has_credentials: !!(this.config.token && this.config.org_id),
            api_url: this.config.api_url
        };
    }

    /**
     * Create configuration for specific component
     * @param {string} component - Component name
     * @returns {Object} Component-specific configuration
     */
    getComponentConfig(component) {
        switch (component) {
            case 'sdk':
                return this.getSDKConfig();
            case 'retry':
                return this.getRetryConfig();
            case 'prompt':
                return this.getPromptConfig();
            default:
                return this.getAll();
        }
    }
}

/**
 * Create configuration instance
 * @param {Object} config - User configuration
 * @param {string} environment - Environment name
 * @returns {CodegenConfig} Configuration instance
 */
export function createCodegenConfig(config = {}, environment = 'development') {
    return new CodegenConfig(config, environment);
}

export default CodegenConfig;

