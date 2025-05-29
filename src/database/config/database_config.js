/**
 * @fileoverview Consolidated Database Configuration
 * @description Environment-based database configuration management
 * Consolidates configuration patterns from PRs #41,42,53,59,62,64,65,69,70,74,79,81
 * @version 2.0.0
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenv.config();

/**
 * Consolidated database configuration with environment-based settings
 */
export const databaseConfig = {
  // Connection settings
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'codegen-taskmaster-db',
  username: process.env.DB_USER || 'software_developer',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL_MODE === 'require' ? { 
    rejectUnauthorized: false,
    ca: process.env.DB_SSL_CA ? readFileSync(process.env.DB_SSL_CA) : undefined,
    cert: process.env.DB_SSL_CERT ? readFileSync(process.env.DB_SSL_CERT) : undefined,
    key: process.env.DB_SSL_KEY ? readFileSync(process.env.DB_SSL_KEY) : undefined
  } : false,
  
  // Connection pool configuration
  pool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
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
    loadBalancingMode: process.env.DB_POOL_LOAD_BALANCING || 'round_robin',
    
    // Failover
    enableFailover: process.env.DB_POOL_ENABLE_FAILOVER !== 'false',
    failoverTimeout: parseInt(process.env.DB_POOL_FAILOVER_TIMEOUT) || 5000,
    maxFailoverAttempts: parseInt(process.env.DB_POOL_MAX_FAILOVER_ATTEMPTS) || 3
  },
  
  // Migration settings
  migrations: {
    directory: process.env.DB_MIGRATIONS_DIR || './src/database/migrations',
    tableName: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
    schemaName: process.env.DB_MIGRATIONS_SCHEMA || 'public'
  },
  
  // Query settings
  query: {
    timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
    slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
    idleInTransactionSessionTimeout: parseInt(process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT) || 30000
  },
  
  // Health check settings
  healthCheck: {
    enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000,
    retryAttempts: parseInt(process.env.DB_HEALTH_CHECK_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.DB_HEALTH_CHECK_RETRY_DELAY) || 1000
  },
  
  // Logging settings
  logging: {
    enabled: process.env.DB_LOGGING_ENABLED !== 'false',
    level: process.env.DB_LOGGING_LEVEL || 'info',
    logQueries: process.env.DB_LOG_QUERIES === 'true',
    logSlowQueries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
    logConnections: process.env.DB_LOG_CONNECTIONS === 'true',
    logDisconnections: process.env.DB_LOG_DISCONNECTIONS === 'true'
  },
  
  // Security settings
  security: {
    encryptionEnabled: process.env.DB_ENCRYPTION_ENABLED === 'true',
    encryptionKey: process.env.DB_ENCRYPTION_KEY,
    encryptionAlgorithm: process.env.DB_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    accessControlEnabled: process.env.ACCESS_CONTROL_ENABLED !== 'false',
    auditLogConnections: process.env.AUDIT_LOG_CONNECTIONS === 'true',
    auditLogQueries: process.env.AUDIT_LOG_QUERIES === 'true',
    auditMaskSensitive: process.env.AUDIT_MASK_SENSITIVE !== 'false'
  },
  
  // Backup settings
  backup: {
    enabled: process.env.DB_BACKUP_ENABLED !== 'false',
    schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *',
    retention: parseInt(process.env.DB_BACKUP_RETENTION) || 30,
    storageType: process.env.BACKUP_STORAGE_TYPE || 'local',
    storagePath: process.env.BACKUP_STORAGE_PATH || './backups',
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    s3Region: process.env.BACKUP_S3_REGION || 'us-east-1'
  },
  
  // Performance settings
  performance: {
    enableQueryCache: process.env.DB_ENABLE_QUERY_CACHE !== 'false',
    queryCacheSize: parseInt(process.env.DB_QUERY_CACHE_SIZE) || 100,
    queryCacheTTL: parseInt(process.env.DB_QUERY_CACHE_TTL) || 300000, // 5 minutes
    enablePreparedStatements: process.env.DB_ENABLE_PREPARED_STATEMENTS !== 'false',
    maxPreparedStatements: parseInt(process.env.DB_MAX_PREPARED_STATEMENTS) || 100
  },
  
  // Monitoring settings
  monitoring: {
    enabled: process.env.DB_MONITORING_ENABLED !== 'false',
    metricsInterval: parseInt(process.env.DB_METRICS_INTERVAL) || 60000,
    alertThresholds: {
      connectionUsage: parseInt(process.env.DB_ALERT_CONNECTION_USAGE) || 80,
      queryTime: parseInt(process.env.DB_ALERT_QUERY_TIME) || 5000,
      errorRate: parseInt(process.env.DB_ALERT_ERROR_RATE) || 5
    }
  }
};

/**
 * Cloudflare database configuration
 */
export const cloudflareDbConfig = {
  enabled: process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true',
  tunnelUrl: process.env.CLOUDFLARE_TUNNEL_URL,
  tunnelToken: process.env.CLOUDFLARE_TUNNEL_TOKEN,
  apiUrl: process.env.CLOUDFLARE_API_URL,
  healthUrl: process.env.CLOUDFLARE_HEALTH_URL,
  
  // Tunnel connection settings
  connectTimeout: parseInt(process.env.TUNNEL_CONNECT_TIMEOUT) || 30000,
  readTimeout: parseInt(process.env.TUNNEL_READ_TIMEOUT) || 60000,
  writeTimeout: parseInt(process.env.TUNNEL_WRITE_TIMEOUT) || 60000,
  
  // External access settings
  externalAccessEnabled: process.env.EXTERNAL_ACCESS_ENABLED === 'true',
  allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
  
  // API keys for external services
  codegenApiKey: process.env.CODEGEN_API_KEY,
  claudeCodeApiKey: process.env.CLAUDE_CODE_API_KEY,
  webhookApiKey: process.env.WEBHOOK_API_KEY,
  
  // Rate limiting
  rateLimitingEnabled: process.env.RATE_LIMITING_ENABLED !== 'false',
  rateLimitRpm: parseInt(process.env.RATE_LIMIT_RPM) || 100,
  rateLimitBurst: parseInt(process.env.RATE_LIMIT_BURST) || 20,
  
  // Metrics
  metricsEnabled: process.env.CLOUDFLARE_METRICS_ENABLED === 'true',
  metricsEndpoint: process.env.CLOUDFLARE_METRICS_ENDPOINT,
  metricsToken: process.env.CLOUDFLARE_METRICS_TOKEN,
  
  // Security
  wafEnabled: process.env.CLOUDFLARE_WAF_ENABLED !== 'false',
  ddosProtectionEnabled: process.env.CLOUDFLARE_DDOS_PROTECTION !== 'false',
  botManagementEnabled: process.env.CLOUDFLARE_BOT_MANAGEMENT === 'true'
};

/**
 * Validate database configuration
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result
 */
export function validateDatabaseConfig(config = databaseConfig) {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!config.host) {
    errors.push('Database host is required');
  }
  
  if (!config.database) {
    errors.push('Database name is required');
  }
  
  if (!config.username) {
    errors.push('Database username is required');
  }
  
  if (!config.password) {
    warnings.push('Database password is not set - this may cause connection issues');
  }
  
  // Validate port
  if (config.port && (config.port < 1 || config.port > 65535)) {
    errors.push('Database port must be between 1 and 65535');
  }
  
  // Validate pool settings
  if (config.pool) {
    if (config.pool.min < 0) {
      errors.push('Pool minimum connections must be >= 0');
    }
    
    if (config.pool.max < 1) {
      errors.push('Pool maximum connections must be >= 1');
    }
    
    if (config.pool.min > config.pool.max) {
      errors.push('Pool minimum connections cannot be greater than maximum');
    }
    
    if (config.pool.max > 100) {
      warnings.push('Pool maximum connections is very high (>100) - consider reducing for better performance');
    }
    
    if (config.pool.idleTimeoutMillis < 1000) {
      warnings.push('Pool idle timeout is very low (<1s) - may cause frequent reconnections');
    }
  }
  
  // Validate timeout settings
  if (config.query && config.query.timeout < 1000) {
    warnings.push('Query timeout is very low (<1s) - may cause premature timeouts');
  }
  
  // Validate security settings
  if (config.security && config.security.encryptionEnabled && !config.security.encryptionKey) {
    errors.push('Encryption key is required when encryption is enabled');
  }
  
  // Validate backup settings
  if (config.backup && config.backup.enabled) {
    if (config.backup.storageType === 's3' && !config.backup.s3Bucket) {
      errors.push('S3 bucket is required when using S3 backup storage');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate Cloudflare configuration
 * @param {Object} config - Cloudflare configuration object
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig(config = cloudflareDbConfig) {
  const errors = [];
  const warnings = [];
  
  if (config.enabled) {
    if (!config.tunnelUrl) {
      errors.push('Cloudflare tunnel URL is required when tunnel is enabled');
    }
    
    if (!config.tunnelToken) {
      errors.push('Cloudflare tunnel token is required when tunnel is enabled');
    }
    
    if (config.externalAccessEnabled && !config.allowedOrigins.length) {
      warnings.push('No allowed origins specified for external access');
    }
    
    if (config.rateLimitingEnabled && config.rateLimitRpm < 10) {
      warnings.push('Rate limit is very low (<10 RPM) - may cause legitimate requests to be blocked');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get database connection string (without password for logging)
 * @param {Object} config - Configuration object
 * @param {boolean} includePassword - Whether to include password in connection string
 * @returns {string} Connection string
 */
export function getConnectionString(config = databaseConfig, includePassword = false) {
  const { host, port, database, username, password } = config;
  const auth = includePassword ? `${username}:${password}` : username;
  return `postgresql://${auth}@${host}:${port}/${database}`;
}

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name (development, test, production)
 * @returns {Object} Environment-specific configuration
 */
export function getEnvironmentConfig(environment = process.env.NODE_ENV || 'development') {
  const baseConfig = { ...databaseConfig };
  
  switch (environment) {
    case 'test':
      return {
        ...baseConfig,
        database: process.env.DB_TEST_NAME || `${baseConfig.database}_test`,
        pool: {
          ...baseConfig.pool,
          max: 5, // Smaller pool for tests
          min: 1
        },
        logging: {
          ...baseConfig.logging,
          enabled: false // Disable logging in tests
        },
        healthCheck: {
          ...baseConfig.healthCheck,
          interval: 60000 // Less frequent health checks in tests
        }
      };
      
    case 'production':
      return {
        ...baseConfig,
        ssl: baseConfig.ssl || { rejectUnauthorized: true }, // Require SSL in production
        pool: {
          ...baseConfig.pool,
          max: Math.max(baseConfig.pool.max, 10) // Ensure minimum pool size in production
        },
        logging: {
          ...baseConfig.logging,
          logQueries: false // Don't log queries in production for security
        },
        security: {
          ...baseConfig.security,
          encryptionEnabled: true, // Force encryption in production
          accessControlEnabled: true,
          auditLogConnections: true
        }
      };
      
    case 'development':
    default:
      return {
        ...baseConfig,
        logging: {
          ...baseConfig.logging,
          logQueries: true, // Enable query logging in development
          logConnections: true
        }
      };
  }
}

/**
 * Create database configuration for connection manager
 * @param {string} environment - Environment name
 * @returns {Object} Configuration object for DatabaseConnectionManager
 */
export function createConnectionConfig(environment = process.env.NODE_ENV || 'development') {
  const config = getEnvironmentConfig(environment);
  
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl: config.ssl,
    ...config.pool,
    query: config.query,
    healthCheck: config.healthCheck,
    logging: config.logging,
    security: config.security,
    performance: config.performance,
    monitoring: config.monitoring
  };
}

/**
 * Get connection configuration for specific pool type
 * @param {string} poolType - Pool type (primary, readonly, background, priority)
 * @param {string} environment - Environment name
 * @returns {Object} Pool-specific configuration
 */
export function getPoolConfig(poolType = 'primary', environment = process.env.NODE_ENV || 'development') {
  const baseConfig = createConnectionConfig(environment);
  
  const poolConfigs = {
    primary: {
      ...baseConfig,
      max: baseConfig.max,
      min: baseConfig.min
    },
    readonly: {
      ...baseConfig,
      max: Math.ceil(baseConfig.max * 0.3), // 30% of primary pool
      min: Math.max(1, Math.ceil(baseConfig.min * 0.5)),
      // Use read replica if available
      host: process.env.DB_READ_HOST || baseConfig.host,
      port: process.env.DB_READ_PORT || baseConfig.port
    },
    background: {
      ...baseConfig,
      max: Math.ceil(baseConfig.max * 0.2), // 20% of primary pool
      min: 1,
      priority: 'low'
    },
    priority: {
      ...baseConfig,
      max: Math.ceil(baseConfig.max * 0.1), // 10% of primary pool
      min: 1,
      priority: 'high',
      acquireTimeoutMillis: baseConfig.acquireTimeoutMillis * 0.5 // Faster timeout
    }
  };
  
  return poolConfigs[poolType] || poolConfigs.primary;
}

export default databaseConfig;

