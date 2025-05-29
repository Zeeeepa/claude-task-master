/**
 * @fileoverview Enhanced Database Configuration
 * @description Production-ready PostgreSQL configuration with environment-based settings and Cloudflare integration
 * @version 2.0.0
 * @updated 2025-05-28
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Enhanced database configuration with environment-based settings
 */
export const dbConfig = {
    // Basic connection settings
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
    
    // Enhanced connection pool configuration
    pool: {
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
        acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
        createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000,
        destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || 5000,
        reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || 1000,
        createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200,
        
        // Enhanced pool settings
        maxUses: parseInt(process.env.DB_POOL_MAX_USES) || 7500,
        maxLifetimeSeconds: parseInt(process.env.DB_POOL_MAX_LIFETIME) || 3600,
        testOnBorrow: process.env.DB_POOL_TEST_ON_BORROW !== 'false',
        testOnReturn: process.env.DB_POOL_TEST_ON_RETURN !== 'false',
        testWhileIdle: process.env.DB_POOL_TEST_WHILE_IDLE !== 'false',
        
        // Load balancing
        loadBalancingMode: process.env.DB_LOAD_BALANCING_MODE || 'round_robin',
        
        // Failover settings
        enableFailover: process.env.DB_ENABLE_FAILOVER !== 'false',
        failoverTimeout: parseInt(process.env.DB_FAILOVER_TIMEOUT) || 5000,
        maxFailoverAttempts: parseInt(process.env.DB_MAX_FAILOVER_ATTEMPTS) || 3
    },
    
    // Read-only replicas for load balancing
    readOnlyHosts: process.env.DB_READONLY_HOSTS ? process.env.DB_READONLY_HOSTS.split(',') : [],
    
    // Query timeout
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
    
    // Connection retry configuration
    retry: {
        max_attempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS) || 3,
        delay_ms: parseInt(process.env.DB_RETRY_DELAY_MS) || 1000,
        backoff_factor: parseFloat(process.env.DB_RETRY_BACKOFF_FACTOR) || 2,
    },
    
    // Enhanced health check configuration
    health_check: {
        enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
        interval_ms: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
        timeout_ms: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000,
        response_time_threshold: parseInt(process.env.DB_RESPONSE_TIME_THRESHOLD) || 1000,
        connection_threshold: parseInt(process.env.DB_CONNECTION_THRESHOLD) || 80,
        error_rate_threshold: parseInt(process.env.DB_ERROR_RATE_THRESHOLD) || 5,
    },
    
    // Migration configuration
    migrations: {
        table_name: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
        directory: process.env.DB_MIGRATIONS_DIR || './src/ai_cicd_system/database/migrations',
        auto_run: process.env.DB_AUTO_RUN_MIGRATIONS === 'true',
        backup_before_migration: process.env.DB_BACKUP_BEFORE_MIGRATION !== 'false',
    },
    
    // Enhanced audit configuration
    audit: {
        enabled: process.env.DB_AUDIT_ENABLED !== 'false',
        retention_days: parseInt(process.env.DB_AUDIT_RETENTION_DAYS) || 90,
        log_queries: process.env.DB_AUDIT_LOG_QUERIES === 'true',
        log_connections: process.env.DB_AUDIT_LOG_CONNECTIONS === 'true',
        log_schema_changes: process.env.DB_AUDIT_LOG_SCHEMA_CHANGES !== 'false',
    },
    
    // Enhanced performance monitoring
    monitoring: {
        slow_query_threshold_ms: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
        log_queries: process.env.DB_LOG_QUERIES === 'true',
        log_slow_queries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
        collect_metrics: process.env.DB_COLLECT_METRICS !== 'false',
        metrics_interval_ms: parseInt(process.env.DB_METRICS_INTERVAL) || 10000,
        enable_query_stats: process.env.DB_ENABLE_QUERY_STATS !== 'false',
    },
    
    // Cloudflare integration settings
    cloudflare: {
        enabled: process.env.CLOUDFLARE_ENABLED === 'true',
        tunnel_id: process.env.CLOUDFLARE_TUNNEL_ID,
        credentials_file: process.env.CLOUDFLARE_CREDENTIALS_FILE,
        domain: process.env.CLOUDFLARE_DOMAIN,
        subdomain: process.env.CLOUDFLARE_SUBDOMAIN || 'db-api',
        ssl_mode: process.env.CLOUDFLARE_SSL_MODE || 'strict',
        enable_waf: process.env.CLOUDFLARE_ENABLE_WAF !== 'false',
        enable_ddos_protection: process.env.CLOUDFLARE_ENABLE_DDOS !== 'false',
        rate_limit: parseInt(process.env.CLOUDFLARE_RATE_LIMIT) || 100,
    },
    
    // External integrations
    external_integrations: {
        codegen: {
            enabled: process.env.CODEGEN_INTEGRATION_ENABLED !== 'false',
            api_url: process.env.CODEGEN_API_URL,
            api_key: process.env.CODEGEN_API_KEY,
            rate_limit: parseInt(process.env.CODEGEN_RATE_LIMIT) || 60,
        },
        github: {
            enabled: process.env.GITHUB_INTEGRATION_ENABLED !== 'false',
            api_url: process.env.GITHUB_API_URL || 'https://api.github.com',
            token: process.env.GITHUB_TOKEN,
            rate_limit: parseInt(process.env.GITHUB_RATE_LIMIT) || 5000,
        },
        linear: {
            enabled: process.env.LINEAR_INTEGRATION_ENABLED !== 'false',
            api_url: process.env.LINEAR_API_URL || 'https://api.linear.app/graphql',
            api_key: process.env.LINEAR_API_KEY,
            rate_limit: parseInt(process.env.LINEAR_RATE_LIMIT) || 1000,
        },
        claude: {
            enabled: process.env.CLAUDE_INTEGRATION_ENABLED !== 'false',
            api_url: process.env.CLAUDE_API_URL,
            api_key: process.env.CLAUDE_API_KEY,
            rate_limit: parseInt(process.env.CLAUDE_RATE_LIMIT) || 100,
        }
    },
    
    // Security settings
    security: {
        enable_row_level_security: process.env.DB_ENABLE_RLS === 'true',
        encrypt_sensitive_data: process.env.DB_ENCRYPT_SENSITIVE_DATA !== 'false',
        require_ssl: process.env.DB_REQUIRE_SSL === 'true',
        allowed_ips: process.env.DB_ALLOWED_IPS ? process.env.DB_ALLOWED_IPS.split(',') : [],
        blocked_ips: process.env.DB_BLOCKED_IPS ? process.env.DB_BLOCKED_IPS.split(',') : [],
    },
    
    // Backup and recovery
    backup: {
        enabled: process.env.DB_BACKUP_ENABLED !== 'false',
        schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        retention_days: parseInt(process.env.DB_BACKUP_RETENTION_DAYS) || 30,
        compression: process.env.DB_BACKUP_COMPRESSION !== 'false',
        encryption: process.env.DB_BACKUP_ENCRYPTION === 'true',
        storage_path: process.env.DB_BACKUP_STORAGE_PATH || './backups',
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
