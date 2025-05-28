/**
 * @fileoverview Database Pool Configuration
 * @description Environment-specific connection pool configuration with performance tuning
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment-specific pool configurations
 */
const environments = {
    development: {
        pool: {
            min: 2,
            max: 10,
            idleTimeoutMillis: 10000,
            acquireTimeoutMillis: 30000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200
        },
        monitoring: {
            enabled: true,
            healthCheckInterval: 30000,
            slowQueryThreshold: 1000,
            logQueries: true,
            logSlowQueries: true
        },
        recovery: {
            enabled: true,
            maxRetries: 3,
            retryDelay: 5000
        }
    },
    
    test: {
        pool: {
            min: 1,
            max: 5,
            idleTimeoutMillis: 5000,
            acquireTimeoutMillis: 10000,
            createTimeoutMillis: 10000,
            destroyTimeoutMillis: 2000,
            reapIntervalMillis: 500,
            createRetryIntervalMillis: 100
        },
        monitoring: {
            enabled: false,
            healthCheckInterval: 60000,
            slowQueryThreshold: 2000,
            logQueries: false,
            logSlowQueries: false
        },
        recovery: {
            enabled: false,
            maxRetries: 1,
            retryDelay: 1000
        }
    },
    
    staging: {
        pool: {
            min: 5,
            max: 20,
            idleTimeoutMillis: 30000,
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 60000,
            destroyTimeoutMillis: 10000,
            reapIntervalMillis: 2000,
            createRetryIntervalMillis: 500
        },
        monitoring: {
            enabled: true,
            healthCheckInterval: 15000,
            slowQueryThreshold: 500,
            logQueries: false,
            logSlowQueries: true
        },
        recovery: {
            enabled: true,
            maxRetries: 5,
            retryDelay: 3000
        }
    },
    
    production: {
        pool: {
            min: 10,
            max: 50,
            idleTimeoutMillis: 60000,
            acquireTimeoutMillis: 120000,
            createTimeoutMillis: 120000,
            destroyTimeoutMillis: 15000,
            reapIntervalMillis: 5000,
            createRetryIntervalMillis: 1000
        },
        monitoring: {
            enabled: true,
            healthCheckInterval: 10000,
            slowQueryThreshold: 300,
            logQueries: false,
            logSlowQueries: true
        },
        recovery: {
            enabled: true,
            maxRetries: 10,
            retryDelay: 2000
        }
    }
};

/**
 * Performance tuning configurations based on workload type
 */
const workloadProfiles = {
    // High-throughput OLTP workload
    oltp: {
        pool: {
            min: 15,
            max: 100,
            idleTimeoutMillis: 30000,
            acquireTimeoutMillis: 5000, // Fast acquisition for OLTP
            createTimeoutMillis: 10000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 100
        },
        monitoring: {
            slowQueryThreshold: 100, // Very strict for OLTP
            alertThresholds: {
                connectionUtilization: 0.7,
                responseTime: 1000,
                errorRate: 0.01,
                queueLength: 5
            }
        }
    },
    
    // Analytics/reporting workload
    analytics: {
        pool: {
            min: 5,
            max: 25,
            idleTimeoutMillis: 120000, // Longer idle timeout for long queries
            acquireTimeoutMillis: 300000, // Longer acquisition timeout
            createTimeoutMillis: 60000,
            destroyTimeoutMillis: 30000,
            reapIntervalMillis: 10000,
            createRetryIntervalMillis: 2000
        },
        monitoring: {
            slowQueryThreshold: 30000, // More lenient for analytics
            alertThresholds: {
                connectionUtilization: 0.9,
                responseTime: 30000,
                errorRate: 0.05,
                queueLength: 20
            }
        }
    },
    
    // Mixed workload (default)
    mixed: {
        pool: {
            min: 8,
            max: 40,
            idleTimeoutMillis: 45000,
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 10000,
            reapIntervalMillis: 2000,
            createRetryIntervalMillis: 500
        },
        monitoring: {
            slowQueryThreshold: 1000,
            alertThresholds: {
                connectionUtilization: 0.8,
                responseTime: 5000,
                errorRate: 0.03,
                queueLength: 10
            }
        }
    }
};

/**
 * Get current environment
 */
function getCurrentEnvironment() {
    return process.env.NODE_ENV || 'development';
}

/**
 * Get workload profile
 */
function getWorkloadProfile() {
    return process.env.DB_WORKLOAD_PROFILE || 'mixed';
}

/**
 * Get base configuration for current environment
 */
function getEnvironmentConfig() {
    const env = getCurrentEnvironment();
    return environments[env] || environments.development;
}

/**
 * Get workload-specific configuration
 */
function getWorkloadConfig() {
    const profile = getWorkloadProfile();
    return workloadProfiles[profile] || workloadProfiles.mixed;
}

/**
 * Merge configurations with precedence: environment variables > workload profile > environment defaults
 */
function mergeConfigurations() {
    const envConfig = getEnvironmentConfig();
    const workloadConfig = getWorkloadConfig();
    
    // Deep merge configurations
    const merged = {
        pool: {
            ...envConfig.pool,
            ...workloadConfig.pool,
            // Environment variable overrides
            min: parseInt(process.env.DB_POOL_MIN) || envConfig.pool.min,
            max: parseInt(process.env.DB_POOL_MAX) || envConfig.pool.max,
            idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || envConfig.pool.idleTimeoutMillis,
            acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || envConfig.pool.acquireTimeoutMillis,
            createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || envConfig.pool.createTimeoutMillis,
            destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || envConfig.pool.destroyTimeoutMillis,
            reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || envConfig.pool.reapIntervalMillis,
            createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || envConfig.pool.createRetryIntervalMillis
        },
        monitoring: {
            ...envConfig.monitoring,
            ...workloadConfig.monitoring,
            // Environment variable overrides
            enabled: process.env.DB_MONITORING_ENABLED !== 'false',
            healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || envConfig.monitoring.healthCheckInterval,
            slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || envConfig.monitoring.slowQueryThreshold,
            logQueries: process.env.DB_LOG_QUERIES === 'true',
            logSlowQueries: process.env.DB_LOG_SLOW_QUERIES !== 'false'
        },
        recovery: {
            ...envConfig.recovery,
            // Environment variable overrides
            enabled: process.env.DB_RECOVERY_ENABLED !== 'false',
            maxRetries: parseInt(process.env.DB_RECOVERY_MAX_RETRIES) || envConfig.recovery.maxRetries,
            retryDelay: parseInt(process.env.DB_RECOVERY_RETRY_DELAY) || envConfig.recovery.retryDelay
        }
    };

    // Add alert thresholds from workload config
    if (workloadConfig.monitoring?.alertThresholds) {
        merged.monitoring.alertThresholds = {
            ...workloadConfig.monitoring.alertThresholds,
            // Environment variable overrides for thresholds
            connectionUtilization: parseFloat(process.env.DB_ALERT_CONNECTION_UTILIZATION) || workloadConfig.monitoring.alertThresholds.connectionUtilization,
            responseTime: parseInt(process.env.DB_ALERT_RESPONSE_TIME) || workloadConfig.monitoring.alertThresholds.responseTime,
            errorRate: parseFloat(process.env.DB_ALERT_ERROR_RATE) || workloadConfig.monitoring.alertThresholds.errorRate,
            queueLength: parseInt(process.env.DB_ALERT_QUEUE_LENGTH) || workloadConfig.monitoring.alertThresholds.queueLength
        };
    }

    return merged;
}

/**
 * Get optimized configuration based on system resources
 */
function getOptimizedConfig() {
    const baseConfig = mergeConfigurations();
    
    // Auto-tune based on available CPU cores
    const cpuCores = parseInt(process.env.UV_THREADPOOL_SIZE) || require('os').cpus().length;
    
    // Adjust pool size based on CPU cores (rule of thumb: 2-4 connections per core)
    const recommendedMaxConnections = cpuCores * 3;
    
    if (baseConfig.pool.max > recommendedMaxConnections * 2) {
        console.warn(`Pool max size (${baseConfig.pool.max}) is much higher than recommended (${recommendedMaxConnections}) for ${cpuCores} CPU cores`);
    }
    
    // Auto-tune based on memory (if available)
    if (process.env.MEMORY_LIMIT_MB) {
        const memoryLimitMB = parseInt(process.env.MEMORY_LIMIT_MB);
        const maxConnectionsForMemory = Math.floor(memoryLimitMB / 10); // Rough estimate: 10MB per connection
        
        if (baseConfig.pool.max > maxConnectionsForMemory) {
            console.warn(`Pool max size (${baseConfig.pool.max}) may exceed memory limits. Consider reducing to ${maxConnectionsForMemory}`);
        }
    }
    
    return baseConfig;
}

/**
 * Validate pool configuration
 */
function validatePoolConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Validate pool settings
    if (config.pool.min < 0) errors.push('Pool min must be >= 0');
    if (config.pool.max < config.pool.min) errors.push('Pool max must be >= pool min');
    if (config.pool.max > 200) warnings.push('Pool max is very high (>200), consider reducing');
    if (config.pool.min > config.pool.max / 2) warnings.push('Pool min is more than half of max, consider reducing');
    
    // Validate timeouts
    if (config.pool.acquireTimeoutMillis < 1000) warnings.push('Acquire timeout is very low (<1s)');
    if (config.pool.acquireTimeoutMillis > 300000) warnings.push('Acquire timeout is very high (>5min)');
    if (config.pool.idleTimeoutMillis < 5000) warnings.push('Idle timeout is very low (<5s)');
    
    // Validate monitoring settings
    if (config.monitoring.healthCheckInterval < 5000) warnings.push('Health check interval is very frequent (<5s)');
    if (config.monitoring.slowQueryThreshold < 100) warnings.push('Slow query threshold is very low (<100ms)');
    
    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Get read replica configurations
 */
function getReadReplicaConfigs() {
    const replicas = [];
    let replicaIndex = 1;
    
    while (process.env[`DB_REPLICA_${replicaIndex}_HOST`]) {
        replicas.push({
            host: process.env[`DB_REPLICA_${replicaIndex}_HOST`],
            port: parseInt(process.env[`DB_REPLICA_${replicaIndex}_PORT`]) || 5432,
            database: process.env[`DB_REPLICA_${replicaIndex}_NAME`] || process.env.DB_NAME,
            user: process.env[`DB_REPLICA_${replicaIndex}_USER`] || process.env.DB_USER,
            password: process.env[`DB_REPLICA_${replicaIndex}_PASSWORD`] || process.env.DB_PASSWORD,
            ssl: process.env[`DB_REPLICA_${replicaIndex}_SSL_MODE`] === 'require' ? { rejectUnauthorized: false } : false
        });
        replicaIndex++;
    }
    
    return replicas;
}

/**
 * Export the final configuration
 */
export const poolConfig = getOptimizedConfig();
export const readReplicas = getReadReplicaConfigs();

/**
 * Export configuration functions
 */
export {
    getCurrentEnvironment,
    getWorkloadProfile,
    getEnvironmentConfig,
    getWorkloadConfig,
    mergeConfigurations,
    getOptimizedConfig,
    validatePoolConfig,
    getReadReplicaConfigs,
    environments,
    workloadProfiles
};

/**
 * Export validation result
 */
export const configValidation = validatePoolConfig(poolConfig);

// Log configuration info on import
if (process.env.NODE_ENV !== 'test') {
    console.log(`Database pool configuration loaded:`);
    console.log(`- Environment: ${getCurrentEnvironment()}`);
    console.log(`- Workload Profile: ${getWorkloadProfile()}`);
    console.log(`- Pool Size: ${poolConfig.pool.min}-${poolConfig.pool.max}`);
    console.log(`- Monitoring: ${poolConfig.monitoring.enabled ? 'enabled' : 'disabled'}`);
    console.log(`- Read Replicas: ${readReplicas.length}`);
    
    if (configValidation.warnings.length > 0) {
        console.warn('Configuration warnings:', configValidation.warnings);
    }
    
    if (!configValidation.valid) {
        console.error('Configuration errors:', configValidation.errors);
    }
}

export default poolConfig;

