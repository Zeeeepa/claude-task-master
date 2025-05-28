/**
 * @fileoverview Enhanced Database Configuration for Cloudflare Exposure
 * @description Production-ready PostgreSQL configuration with Cloudflare tunnel support
 */

import dotenv from 'dotenv';
import { dbConfig as baseConfig, validateConfig } from '../ai_cicd_system/config/database_config.js';

// Load environment variables
dotenv.config();

/**
 * Enhanced database configuration with Cloudflare tunnel support
 */
export const cloudflareDbConfig = {
    // Cloudflare tunnel configuration
    cloudflare: {
        enabled: process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true',
        tunnel_url: process.env.CLOUDFLARE_TUNNEL_URL || 'db.codegen-taskmaster.your-domain.com',
        tunnel_token: process.env.CLOUDFLARE_TUNNEL_TOKEN,
        api_url: process.env.CLOUDFLARE_API_URL || 'api.codegen-taskmaster.your-domain.com',
        health_url: process.env.CLOUDFLARE_HEALTH_URL || 'health.codegen-taskmaster.your-domain.com',
    },

    // Database connection credentials as specified in requirements
    credentials: {
        name: 'Database',
        description: 'PostgreSQL database',
        host: process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true' 
            ? process.env.CLOUDFLARE_TUNNEL_URL || 'db.codegen-taskmaster.your-domain.com'
            : process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'codegen-taskmaster-db',
        username: process.env.DB_USER || 'software_developer',
        password: process.env.DB_PASSWORD || 'password',
        ssl_mode: process.env.DB_SSL_MODE || 'require'
    },

    // Enhanced connection configuration for Cloudflare
    connection: {
        ...baseConfig,
        
        // Override host for Cloudflare tunnel
        host: process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true' 
            ? process.env.CLOUDFLARE_TUNNEL_URL || 'db.codegen-taskmaster.your-domain.com'
            : baseConfig.host,
            
        // Enhanced SSL configuration for Cloudflare
        ssl: process.env.DB_SSL_MODE === 'require' ? {
            rejectUnauthorized: false,
            ca: process.env.DB_SSL_CA,
            cert: process.env.DB_SSL_CERT,
            key: process.env.DB_SSL_KEY,
            // Cloudflare-specific SSL settings
            servername: process.env.CLOUDFLARE_TUNNEL_URL,
            checkServerIdentity: () => undefined, // Disable hostname verification for tunnel
        } : false,

        // Enhanced pool configuration for external access
        pool: {
            ...baseConfig.pool,
            // Increased timeouts for tunnel connections
            acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 60000,
            createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 60000,
            // Connection validation for tunnel stability
            testOnBorrow: true,
            testOnReturn: false,
            testWhileIdle: true,
            timeBetweenEvictionRunsMillis: 30000,
            numTestsPerEvictionRun: 3,
            minEvictableIdleTimeMillis: 60000,
        },

        // Enhanced retry configuration for tunnel connections
        retry: {
            ...baseConfig.retry,
            max_attempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS) || 5,
            delay_ms: parseInt(process.env.DB_RETRY_DELAY_MS) || 2000,
            backoff_factor: parseFloat(process.env.DB_RETRY_BACKOFF_FACTOR) || 2.5,
        },

        // Tunnel-specific timeouts
        tunnel: {
            connect_timeout: parseInt(process.env.TUNNEL_CONNECT_TIMEOUT) || 30000,
            read_timeout: parseInt(process.env.TUNNEL_READ_TIMEOUT) || 60000,
            write_timeout: parseInt(process.env.TUNNEL_WRITE_TIMEOUT) || 60000,
        }
    },

    // External service access configuration
    external_access: {
        enabled: process.env.EXTERNAL_ACCESS_ENABLED === 'true',
        allowed_origins: process.env.ALLOWED_ORIGINS ? 
            process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
            ['https://codegen.sh', 'https://api.codegen.sh'],
        api_keys: {
            codegen: process.env.CODEGEN_API_KEY,
            claude_code: process.env.CLAUDE_CODE_API_KEY,
            webhook: process.env.WEBHOOK_API_KEY,
        },
        rate_limiting: {
            enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
            requests_per_minute: parseInt(process.env.RATE_LIMIT_RPM) || 100,
            burst_limit: parseInt(process.env.RATE_LIMIT_BURST) || 20,
        }
    },

    // Security configuration
    security: {
        encryption: {
            enabled: process.env.DB_ENCRYPTION_ENABLED === 'true',
            key: process.env.DB_ENCRYPTION_KEY,
            algorithm: process.env.DB_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
        },
        access_control: {
            enabled: process.env.ACCESS_CONTROL_ENABLED !== 'false',
            roles: {
                read_only: ['codegen_reader', 'monitoring'],
                read_write: ['software_developer', 'codegen_writer'],
                admin: ['postgres', 'db_admin']
            }
        },
        audit: {
            ...baseConfig.audit,
            log_connections: process.env.AUDIT_LOG_CONNECTIONS === 'true',
            log_queries: process.env.AUDIT_LOG_QUERIES === 'true',
            sensitive_data_masking: process.env.AUDIT_MASK_SENSITIVE === 'true',
        }
    },

    // Monitoring and observability
    monitoring: {
        ...baseConfig.monitoring,
        cloudflare_metrics: {
            enabled: process.env.CLOUDFLARE_METRICS_ENABLED === 'true',
            endpoint: process.env.CLOUDFLARE_METRICS_ENDPOINT,
            api_token: process.env.CLOUDFLARE_METRICS_TOKEN,
        },
        external_monitoring: {
            enabled: process.env.EXTERNAL_MONITORING_ENABLED === 'true',
            endpoints: {
                health_check: `https://${process.env.CLOUDFLARE_HEALTH_URL || 'health.codegen-taskmaster.your-domain.com'}/health`,
                metrics: `https://${process.env.CLOUDFLARE_API_URL || 'api.codegen-taskmaster.your-domain.com'}/metrics`,
                status: `https://${process.env.CLOUDFLARE_API_URL || 'api.codegen-taskmaster.your-domain.com'}/status`,
            }
        }
    },

    // Backup and disaster recovery
    backup: {
        enabled: process.env.DB_BACKUP_ENABLED !== 'false',
        schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        retention_days: parseInt(process.env.DB_BACKUP_RETENTION) || 30,
        storage: {
            type: process.env.BACKUP_STORAGE_TYPE || 'local',
            path: process.env.BACKUP_STORAGE_PATH || './backups',
            s3_bucket: process.env.BACKUP_S3_BUCKET,
            s3_region: process.env.BACKUP_S3_REGION,
        }
    }
};

/**
 * Get the appropriate database configuration based on environment
 * @returns {Object} Database configuration
 */
export function getDatabaseConfig() {
    const isCloudflareEnabled = process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true';
    
    if (isCloudflareEnabled) {
        return {
            ...cloudflareDbConfig.connection,
            cloudflare: cloudflareDbConfig.cloudflare,
            external_access: cloudflareDbConfig.external_access,
            security: cloudflareDbConfig.security,
            monitoring: cloudflareDbConfig.monitoring,
            backup: cloudflareDbConfig.backup,
        };
    }
    
    return baseConfig;
}

/**
 * Validate Cloudflare-specific configuration
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];
    
    // Base configuration validation
    const baseValidation = validateConfig();
    errors.push(...baseValidation.errors);
    warnings.push(...baseValidation.warnings);
    
    // Cloudflare-specific validation
    if (cloudflareDbConfig.cloudflare.enabled) {
        if (!cloudflareDbConfig.cloudflare.tunnel_url) {
            errors.push('CLOUDFLARE_TUNNEL_URL is required when Cloudflare tunnel is enabled');
        }
        
        if (!cloudflareDbConfig.cloudflare.tunnel_token) {
            warnings.push('CLOUDFLARE_TUNNEL_TOKEN is not set - may be required for authentication');
        }
        
        if (cloudflareDbConfig.credentials.ssl_mode === 'require' && !process.env.DB_SSL_CA) {
            warnings.push('SSL CA certificate not configured - may cause connection issues');
        }
    }
    
    // External access validation
    if (cloudflareDbConfig.external_access.enabled) {
        if (!cloudflareDbConfig.external_access.api_keys.codegen) {
            warnings.push('CODEGEN_API_KEY not set - Codegen integration may not work');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get connection string for external services (with proper formatting)
 * @param {boolean} maskPassword - Whether to mask the password
 * @returns {string} Connection string
 */
export function getExternalConnectionString(maskPassword = true) {
    const config = cloudflareDbConfig.credentials;
    const password = maskPassword ? '***' : config.password;
    const sslMode = config.ssl_mode ? `?sslmode=${config.ssl_mode}` : '';
    
    return `postgresql://${config.username}:${password}@${config.host}:${config.port}/${config.database}${sslMode}`;
}

/**
 * Get Cloudflare tunnel status
 * @returns {Object} Tunnel status information
 */
export function getTunnelStatus() {
    return {
        enabled: cloudflareDbConfig.cloudflare.enabled,
        tunnel_url: cloudflareDbConfig.cloudflare.tunnel_url,
        api_url: cloudflareDbConfig.cloudflare.api_url,
        health_url: cloudflareDbConfig.cloudflare.health_url,
        external_access_enabled: cloudflareDbConfig.external_access.enabled,
        ssl_mode: cloudflareDbConfig.credentials.ssl_mode,
        monitoring_enabled: cloudflareDbConfig.monitoring.external_monitoring.enabled,
    };
}

export default cloudflareDbConfig;

