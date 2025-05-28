/**
 * @fileoverview AgentAPI Configuration
 * @description Configuration settings for AgentAPI integration with Claude Code
 */

/**
 * Default AgentAPI configuration
 */
export const DEFAULT_AGENTAPI_CONFIG = {
    // AgentAPI Server Settings
    baseURL: process.env.AGENTAPI_URL || 'http://localhost:3284',
    timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
    retries: parseInt(process.env.AGENTAPI_RETRIES) || 3,
    retryDelay: parseInt(process.env.AGENTAPI_RETRY_DELAY) || 1000,
    
    // Claude Code Settings
    claudeCodePath: process.env.CLAUDE_CODE_PATH || 'claude',
    claudeCodeArgs: process.env.CLAUDE_CODE_ARGS ? 
        process.env.CLAUDE_CODE_ARGS.split(',') : 
        ['--allowedTools', 'Bash(git*) Edit Replace'],
    
    // Session Management
    sessionTimeout: parseInt(process.env.AGENTAPI_SESSION_TIMEOUT) || 300000, // 5 minutes
    maxConcurrentSessions: parseInt(process.env.AGENTAPI_MAX_SESSIONS) || 5,
    sessionCleanupInterval: parseInt(process.env.AGENTAPI_CLEANUP_INTERVAL) || 60000, // 1 minute
    
    // Health Check Settings
    healthCheckInterval: parseInt(process.env.AGENTAPI_HEALTH_INTERVAL) || 30000, // 30 seconds
    healthCheckTimeout: parseInt(process.env.AGENTAPI_HEALTH_TIMEOUT) || 5000,
    
    // WSL2 Environment Settings
    wsl2: {
        enabled: process.env.WSL2_ENABLED === 'true',
        distro: process.env.WSL2_DISTRO || 'Ubuntu',
        workingDirectory: process.env.WSL2_WORKING_DIR || '/tmp/claude-task-master',
        environmentVariables: {
            PATH: process.env.WSL2_PATH || '/usr/local/bin:/usr/bin:/bin',
            HOME: process.env.WSL2_HOME || '/home/ubuntu',
            ...parseEnvironmentVariables(process.env.WSL2_ENV_VARS)
        }
    },
    
    // Validation Settings
    validation: {
        maxValidationTime: parseInt(process.env.VALIDATION_MAX_TIME) || 300000, // 5 minutes
        maxFileSize: parseInt(process.env.VALIDATION_MAX_FILE_SIZE) || 10485760, // 10MB
        allowedFileTypes: process.env.VALIDATION_ALLOWED_TYPES ? 
            process.env.VALIDATION_ALLOWED_TYPES.split(',') : 
            ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h'],
        excludePatterns: process.env.VALIDATION_EXCLUDE_PATTERNS ? 
            process.env.VALIDATION_EXCLUDE_PATTERNS.split(',') : 
            ['node_modules', '.git', 'dist', 'build', '.next', '.cache']
    },
    
    // Deployment Settings
    deployment: {
        maxDeploymentTime: parseInt(process.env.DEPLOYMENT_MAX_TIME) || 600000, // 10 minutes
        cleanupAfterDeployment: process.env.DEPLOYMENT_CLEANUP !== 'false',
        deploymentPath: process.env.DEPLOYMENT_PATH || '/tmp/deployments',
        maxConcurrentDeployments: parseInt(process.env.DEPLOYMENT_MAX_CONCURRENT) || 3
    },
    
    // Error Handling
    errorHandling: {
        maxRetryAttempts: parseInt(process.env.ERROR_MAX_RETRIES) || 3,
        retryBackoffMultiplier: parseFloat(process.env.ERROR_RETRY_BACKOFF) || 2,
        circuitBreakerThreshold: parseInt(process.env.ERROR_CIRCUIT_BREAKER_THRESHOLD) || 5,
        circuitBreakerTimeout: parseInt(process.env.ERROR_CIRCUIT_BREAKER_TIMEOUT) || 60000
    },
    
    // Logging and Monitoring
    logging: {
        level: process.env.AGENTAPI_LOG_LEVEL || 'info',
        enableRequestLogging: process.env.AGENTAPI_LOG_REQUESTS !== 'false',
        enableResponseLogging: process.env.AGENTAPI_LOG_RESPONSES !== 'false',
        enableMetrics: process.env.AGENTAPI_ENABLE_METRICS !== 'false'
    }
};

/**
 * Parse environment variables string into object
 * @param {string} envVarsString - Comma-separated key=value pairs
 * @returns {Object} Parsed environment variables
 */
function parseEnvironmentVariables(envVarsString) {
    if (!envVarsString) return {};
    
    const envVars = {};
    envVarsString.split(',').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            envVars[key.trim()] = value.trim();
        }
    });
    
    return envVars;
}

/**
 * Validate AgentAPI configuration
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateAgentAPIConfig(config) {
    const errors = [];
    
    // Validate required fields
    if (!config.baseURL) {
        errors.push('baseURL is required');
    }
    
    if (!config.claudeCodePath) {
        errors.push('claudeCodePath is required');
    }
    
    // Validate numeric fields
    const numericFields = [
        'timeout', 'retries', 'retryDelay', 'sessionTimeout', 
        'maxConcurrentSessions', 'healthCheckInterval'
    ];
    
    numericFields.forEach(field => {
        if (config[field] && (typeof config[field] !== 'number' || config[field] < 0)) {
            errors.push(`${field} must be a positive number`);
        }
    });
    
    // Validate URL format
    try {
        new URL(config.baseURL);
    } catch (error) {
        errors.push('baseURL must be a valid URL');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Merge user configuration with defaults
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Merged configuration
 */
export function mergeAgentAPIConfig(userConfig = {}) {
    const merged = {
        ...DEFAULT_AGENTAPI_CONFIG,
        ...userConfig
    };
    
    // Deep merge nested objects
    if (userConfig.wsl2) {
        merged.wsl2 = {
            ...DEFAULT_AGENTAPI_CONFIG.wsl2,
            ...userConfig.wsl2
        };
        
        if (userConfig.wsl2.environmentVariables) {
            merged.wsl2.environmentVariables = {
                ...DEFAULT_AGENTAPI_CONFIG.wsl2.environmentVariables,
                ...userConfig.wsl2.environmentVariables
            };
        }
    }
    
    if (userConfig.validation) {
        merged.validation = {
            ...DEFAULT_AGENTAPI_CONFIG.validation,
            ...userConfig.validation
        };
    }
    
    if (userConfig.deployment) {
        merged.deployment = {
            ...DEFAULT_AGENTAPI_CONFIG.deployment,
            ...userConfig.deployment
        };
    }
    
    if (userConfig.errorHandling) {
        merged.errorHandling = {
            ...DEFAULT_AGENTAPI_CONFIG.errorHandling,
            ...userConfig.errorHandling
        };
    }
    
    if (userConfig.logging) {
        merged.logging = {
            ...DEFAULT_AGENTAPI_CONFIG.logging,
            ...userConfig.logging
        };
    }
    
    return merged;
}

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name (development, production, test)
 * @returns {Object} Environment-specific configuration
 */
export function getEnvironmentConfig(environment = 'development') {
    const envConfigs = {
        development: {
            baseURL: 'http://localhost:3284',
            timeout: 30000,
            retries: 2,
            logging: {
                level: 'debug',
                enableRequestLogging: true,
                enableResponseLogging: true
            }
        },
        
        production: {
            baseURL: process.env.AGENTAPI_URL || 'http://agentapi:3284',
            timeout: 60000,
            retries: 3,
            logging: {
                level: 'info',
                enableRequestLogging: false,
                enableResponseLogging: false
            },
            errorHandling: {
                maxRetryAttempts: 5,
                circuitBreakerThreshold: 10
            }
        },
        
        test: {
            baseURL: 'http://localhost:3285',
            timeout: 10000,
            retries: 1,
            sessionTimeout: 30000,
            logging: {
                level: 'error',
                enableRequestLogging: false,
                enableResponseLogging: false
            }
        }
    };
    
    return mergeAgentAPIConfig(envConfigs[environment] || {});
}

