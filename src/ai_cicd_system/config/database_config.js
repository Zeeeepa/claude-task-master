/**
 * @fileoverview Database Configuration
 * @description Production-ready PostgreSQL configuration with environment-based settings
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database configuration with environment-based settings
 */
export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
    
    // Connection pool configuration
    pool: {
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
        acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
        createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000,
        destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || 5000,
        reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || 1000,
        createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200,
    },
    
    // Query timeout
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
    
    // Connection retry configuration
    retry: {
        max_attempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS) || 3,
        delay_ms: parseInt(process.env.DB_RETRY_DELAY_MS) || 1000,
        backoff_factor: parseFloat(process.env.DB_RETRY_BACKOFF_FACTOR) || 2,
    },
    
    // Health check configuration
    health_check: {
        enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
        interval_ms: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
        timeout_ms: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000,
    },
    
    // Migration configuration
    migrations: {
        table_name: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
        directory: process.env.DB_MIGRATIONS_DIR || './src/ai_cicd_system/database/migrations',
    },
    
    // Audit configuration
    audit: {
        enabled: process.env.DB_AUDIT_ENABLED !== 'false',
        retention_days: parseInt(process.env.DB_AUDIT_RETENTION_DAYS) || 90,
    },
    
    // Performance monitoring
    monitoring: {
        slow_query_threshold_ms: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
        log_queries: process.env.DB_LOG_QUERIES === 'true',
        log_slow_queries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
    }
};

/**
 * Validate database configuration
 * @returns {Object} Validation result
 */
export function validateConfig() {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!dbConfig.host) errors.push('DB_HOST is required');
    if (!dbConfig.database) errors.push('DB_NAME is required');
    if (!dbConfig.user) errors.push('DB_USER is required');
    if (!dbConfig.password) warnings.push('DB_PASSWORD is not set - using default');
    
    // Pool configuration validation
    if (dbConfig.pool.min < 0) errors.push('DB_POOL_MIN must be >= 0');
    if (dbConfig.pool.max < dbConfig.pool.min) errors.push('DB_POOL_MAX must be >= DB_POOL_MIN');
    if (dbConfig.pool.max > 100) warnings.push('DB_POOL_MAX is very high (>100), consider reducing');
    
    // Timeout validation
    if (dbConfig.query_timeout < 1000) warnings.push('DB_QUERY_TIMEOUT is very low (<1s)');
    if (dbConfig.query_timeout > 300000) warnings.push('DB_QUERY_TIMEOUT is very high (>5min)');
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get connection string for debugging (with masked password)
 * @returns {string} Masked connection string
 */
export function getConnectionString() {
    const maskedPassword = dbConfig.password ? '***' : 'NOT_SET';
    return `postgresql://${dbConfig.user}:${maskedPassword}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
}

export default dbConfig;

