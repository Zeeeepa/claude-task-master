/**
 * @fileoverview Enhanced Database Configuration with Cloudflare Integration
 * @description Production-ready PostgreSQL configuration with environment-based settings and Cloudflare tunnel support
 */

import dotenv from 'dotenv';
import { cloudflareDbConfig, validateCloudflareConfig } from '../database/cloudflare_config.js';

// Load environment variables
dotenv.config();

/**
 * Database configuration with environment-based settings and Cloudflare support
 */
export const dbConfig = {
    // Connection settings - supports both direct and Cloudflare tunnel connections
    host: process.env.USE_CLOUDFLARE_TUNNEL === 'true' ? 
        (cloudflareDbConfig.host || process.env.CLOUDFLARE_DB_HOST) : 
        (process.env.DB_HOST || 'localhost'),
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD,
    
    // SSL configuration with Cloudflare tunnel support
    ssl: process.env.USE_CLOUDFLARE_TUNNEL === 'true' ? 
        cloudflareDbConfig.ssl : 
        (process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false),
    
    // Connection pool configuration optimized for Cloudflare
    pool: process.env.USE_CLOUDFLARE_TUNNEL === 'true' ? 
        cloudflareDbConfig.pool : {
            min: parseInt(process.env.DB_POOL_MIN) || 2,
            max: parseInt(process.env.DB_POOL_MAX) || 10,
            idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
            acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
            createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000,
            destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || 5000,
            reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || 1000,
            createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200,
        },
    
    // Query timeout optimized for network conditions
    query_timeout: process.env.USE_CLOUDFLARE_TUNNEL === 'true' ? 
        cloudflareDbConfig.query_timeout : 
        (parseInt(process.env.DB_QUERY_TIMEOUT) || 60000),
    
    // Connection retry configuration enhanced for network resilience
    retry: process.env.USE_CLOUDFLARE_TUNNEL === 'true' ? 
        cloudflareDbConfig.retry : {
            max_attempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS) || 3,
            delay_ms: parseInt(process.env.DB_RETRY_DELAY_MS) || 1000,
            backoff_factor: parseFloat(process.env.DB_RETRY_BACKOFF_FACTOR) || 2,
            max_delay_ms: parseInt(process.env.DB_RETRY_MAX_DELAY_MS) || 30000,
        },
    
    // Health check configuration
    health_check: {
        enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
        interval_ms: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
        timeout_ms: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000,
        failure_threshold: parseInt(process.env.DB_HEALTH_CHECK_FAILURE_THRESHOLD) || 3,
        recovery_threshold: parseInt(process.env.DB_HEALTH_CHECK_RECOVERY_THRESHOLD) || 2,
    },
    
    // Migration configuration
    migrations: {
        table_name: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
        directory: process.env.DB_MIGRATIONS_DIR || './src/ai_cicd_system/database/migrations',
        auto_run: process.env.DB_MIGRATIONS_AUTO_RUN === 'true',
        lock_timeout: parseInt(process.env.DB_MIGRATIONS_LOCK_TIMEOUT) || 300000, // 5 minutes
    },
    
    // Audit configuration
    audit: {
        enabled: process.env.DB_AUDIT_ENABLED !== 'false',
        retention_days: parseInt(process.env.DB_AUDIT_RETENTION_DAYS) || 90,
        sensitive_tables: ['tasks_enhanced', 'templates', 'template_permissions'],
        exclude_columns: ['password', 'secret', 'token'],
    },
    
    // Performance monitoring
    monitoring: {
        slow_query_threshold_ms: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
        log_queries: process.env.DB_LOG_QUERIES === 'true',
        log_slow_queries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
        track_query_plans: process.env.DB_TRACK_QUERY_PLANS === 'true',
        performance_insights: process.env.DB_PERFORMANCE_INSIGHTS === 'true',
    },
    
    // Security configuration
    security: {
        connection_encryption: process.env.DB_CONNECTION_ENCRYPTION !== 'false',
        query_validation: process.env.DB_QUERY_VALIDATION !== 'false',
        sql_injection_protection: process.env.DB_SQL_INJECTION_PROTECTION !== 'false',
        rate_limiting: {
            enabled: process.env.DB_RATE_LIMITING_ENABLED === 'true',
            max_queries_per_minute: parseInt(process.env.DB_MAX_QUERIES_PER_MINUTE) || 1000,
            max_connections_per_ip: parseInt(process.env.DB_MAX_CONNECTIONS_PER_IP) || 10,
        }
    },
    
    // Backup configuration
    backup: {
        enabled: process.env.DB_BACKUP_ENABLED !== 'false',
        schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        retention_days: parseInt(process.env.DB_BACKUP_RETENTION_DAYS) || 30,
        compression: process.env.DB_BACKUP_COMPRESSION !== 'false',
        encryption: process.env.DB_BACKUP_ENCRYPTION === 'true',
        storage_location: process.env.DB_BACKUP_STORAGE_LOCATION || './backups',
        s3_bucket: process.env.DB_BACKUP_S3_BUCKET,
        notification_webhook: process.env.DB_BACKUP_NOTIFICATION_WEBHOOK,
    },
    
    // Read replica configuration (for scaling)
    read_replicas: {
        enabled: process.env.DB_READ_REPLICAS_ENABLED === 'true',
        hosts: process.env.DB_READ_REPLICA_HOSTS ? 
            process.env.DB_READ_REPLICA_HOSTS.split(',').map(host => host.trim()) : [],
        load_balancing: process.env.DB_READ_REPLICA_LOAD_BALANCING || 'round_robin', // round_robin, random, least_connections
        fallback_to_primary: process.env.DB_READ_REPLICA_FALLBACK !== 'false',
    },
    
    // Environment-specific settings
    environment: process.env.NODE_ENV || 'development',
    cloudflare_tunnel: process.env.USE_CLOUDFLARE_TUNNEL === 'true',
    
    // Feature flags
    features: {
        enhanced_logging: process.env.DB_ENHANCED_LOGGING === 'true',
        query_caching: process.env.DB_QUERY_CACHING === 'true',
        connection_pooling_v2: process.env.DB_CONNECTION_POOLING_V2 === 'true',
        auto_vacuum: process.env.DB_AUTO_VACUUM !== 'false',
        parallel_queries: process.env.DB_PARALLEL_QUERIES === 'true',
    }
};

/**
 * Validate database configuration with Cloudflare support
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
    
    // Cloudflare-specific validation
    if (dbConfig.cloudflare_tunnel) {
        const cloudflareValidation = validateCloudflareConfig();
        errors.push(...cloudflareValidation.errors);
        warnings.push(...cloudflareValidation.warnings);
        
        if (!dbConfig.ssl || !dbConfig.ssl.require) {
            errors.push('SSL is required when using Cloudflare tunnel');
        }
    }
    
    // Pool configuration validation
    if (dbConfig.pool.min < 0) errors.push('DB_POOL_MIN must be >= 0');
    if (dbConfig.pool.max < dbConfig.pool.min) errors.push('DB_POOL_MAX must be >= DB_POOL_MIN');
    if (dbConfig.pool.max > 100) warnings.push('DB_POOL_MAX is very high (>100), consider reducing');
    
    // Timeout validation
    if (dbConfig.query_timeout < 1000) warnings.push('DB_QUERY_TIMEOUT is very low (<1s)');
    if (dbConfig.query_timeout > 300000) warnings.push('DB_QUERY_TIMEOUT is very high (>5min)');
    
    // Security validation
    if (!dbConfig.security.connection_encryption) {
        warnings.push('Connection encryption is disabled - not recommended for production');
    }
    
    if (!dbConfig.security.sql_injection_protection) {
        warnings.push('SQL injection protection is disabled - security risk');
    }
    
    // Backup validation
    if (!dbConfig.backup.enabled) {
        warnings.push('Database backups are disabled - data loss risk');
    }
    
    // Environment-specific validation
    if (dbConfig.environment === 'production') {
        if (!dbConfig.ssl) errors.push('SSL is required in production');
        if (!dbConfig.backup.enabled) errors.push('Backups are required in production');
        if (!dbConfig.audit.enabled) warnings.push('Audit logging should be enabled in production');
        if (dbConfig.monitoring.log_queries) warnings.push('Query logging should be disabled in production for performance');
    }
    
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
    const sslMode = dbConfig.ssl ? (dbConfig.ssl.require ? 'require' : 'prefer') : 'disable';
    const tunnelPrefix = dbConfig.cloudflare_tunnel ? '[Cloudflare] ' : '';
    
    return `${tunnelPrefix}postgresql://${dbConfig.user}:${maskedPassword}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}?sslmode=${sslMode}`;
}

/**
 * Get database configuration summary for monitoring
 * @returns {Object} Configuration summary
 */
export function getConfigSummary() {
    return {
        connection: {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user,
            ssl_enabled: !!dbConfig.ssl,
            cloudflare_tunnel: dbConfig.cloudflare_tunnel,
        },
        pool: {
            min: dbConfig.pool.min,
            max: dbConfig.pool.max,
            idle_timeout: dbConfig.pool.idleTimeoutMillis,
            acquire_timeout: dbConfig.pool.acquireTimeoutMillis,
        },
        features: {
            health_check: dbConfig.health_check.enabled,
            audit: dbConfig.audit.enabled,
            backup: dbConfig.backup.enabled,
            monitoring: dbConfig.monitoring.log_slow_queries,
            security: dbConfig.security.connection_encryption,
        },
        environment: dbConfig.environment,
        query_timeout: dbConfig.query_timeout,
        retry_attempts: dbConfig.retry.max_attempts,
    };
}

/**
 * Get environment-specific configuration overrides
 * @param {string} environment - Target environment
 * @returns {Object} Environment-specific config
 */
export function getEnvironmentConfig(environment = dbConfig.environment) {
    const baseConfig = { ...dbConfig };
    
    switch (environment) {
        case 'development':
            return {
                ...baseConfig,
                monitoring: {
                    ...baseConfig.monitoring,
                    log_queries: true,
                    log_slow_queries: true,
                },
                pool: {
                    ...baseConfig.pool,
                    min: 1,
                    max: 5,
                },
                health_check: {
                    ...baseConfig.health_check,
                    interval_ms: 60000, // Less frequent in dev
                }
            };
            
        case 'testing':
            return {
                ...baseConfig,
                database: `${baseConfig.database}_test`,
                pool: {
                    ...baseConfig.pool,
                    min: 1,
                    max: 3,
                },
                audit: {
                    ...baseConfig.audit,
                    enabled: false, // Disable audit in tests
                },
                backup: {
                    ...baseConfig.backup,
                    enabled: false, // No backups in test
                }
            };
            
        case 'staging':
            return {
                ...baseConfig,
                monitoring: {
                    ...baseConfig.monitoring,
                    log_queries: false,
                    log_slow_queries: true,
                },
                pool: {
                    ...baseConfig.pool,
                    max: Math.min(baseConfig.pool.max, 15),
                }
            };
            
        case 'production':
            return {
                ...baseConfig,
                monitoring: {
                    ...baseConfig.monitoring,
                    log_queries: false,
                    log_slow_queries: true,
                    performance_insights: true,
                },
                security: {
                    ...baseConfig.security,
                    connection_encryption: true,
                    sql_injection_protection: true,
                    rate_limiting: {
                        ...baseConfig.security.rate_limiting,
                        enabled: true,
                    }
                },
                backup: {
                    ...baseConfig.backup,
                    enabled: true,
                    encryption: true,
                },
                ssl: dbConfig.ssl || { require: true, rejectUnauthorized: true },
            };
            
        default:
            return baseConfig;
    }
}

/**
 * Initialize database configuration with validation
 * @param {string} environment - Target environment
 * @returns {Object} Validated configuration
 */
export function initializeConfig(environment = null) {
    const config = environment ? getEnvironmentConfig(environment) : dbConfig;
    const validation = validateConfig();
    
    if (!validation.valid) {
        throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
        console.warn(`Database configuration warnings: ${validation.warnings.join(', ')}`);
    }
    
    return config;
}

export default dbConfig;
