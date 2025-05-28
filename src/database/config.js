/**
 * @fileoverview Database Configuration
 * @description Environment-based database configuration management
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database configuration with environment-based settings
 */
export const databaseConfig = {
  // Connection settings
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'ai_cicd_system',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
  
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
    createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200
  },
  
  // Migration settings
  migrations: {
    directory: process.env.DB_MIGRATIONS_DIR || './src/database/migrations',
    tableName: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations'
  },
  
  // Query settings
  query: {
    timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
    slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000
  },
  
  // Health check settings
  healthCheck: {
    enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000
  },
  
  // Logging settings
  logging: {
    enabled: process.env.DB_LOGGING_ENABLED !== 'false',
    level: process.env.DB_LOGGING_LEVEL || 'info',
    logQueries: process.env.DB_LOG_QUERIES === 'true',
    logSlowQueries: process.env.DB_LOG_SLOW_QUERIES !== 'false'
  }
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
        }
      };
      
    case 'development':
    default:
      return baseConfig;
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
    ...config.pool
  };
}

export default databaseConfig;

