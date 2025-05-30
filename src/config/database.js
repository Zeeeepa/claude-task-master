/**
 * Database Configuration for Claude Task Master
 * Supports multiple environments with secure connection management
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database configuration for different environments
 */
export const config = {
  // PostgreSQL configuration
  postgres: {
    // Connection settings
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'claude_task_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    
    // SSL configuration
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.DB_SSL_CA,
      cert: process.env.DB_SSL_CERT,
      key: process.env.DB_SSL_KEY
    } : false,
    
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,
    evict: parseInt(process.env.DB_POOL_EVICT) || 1000,
    
    // Connection timeout settings
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
    
    // Application name for connection tracking
    application_name: process.env.DB_APPLICATION_NAME || 'claude-task-master',
    
    // Statement timeout
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
    
    // Additional options
    options: process.env.DB_OPTIONS || ''
  },
  
  // Migration settings
  migrations: {
    directory: path.join(__dirname, '../database/migrations'),
    tableName: 'schema_migrations',
    schemaName: 'public'
  },
  
  // Backup settings
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    directory: process.env.BACKUP_DIR || path.join(__dirname, '../../backups'),
    retention: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *' // Daily at 2 AM
  },
  
  // Environment-specific configurations
  development: {
    logging: true,
    debug: process.env.NODE_ENV === 'development',
    logQueries: process.env.LOG_QUERIES === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  
  test: {
    database: process.env.TEST_DB_NAME || 'claude_task_master_test',
    logging: false,
    debug: false,
    logQueries: false
  },
  
  production: {
    logging: false,
    debug: false,
    logQueries: false,
    logLevel: 'error'
  }
};

/**
 * Get configuration for current environment
 */
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  return {
    ...config,
    ...config[env]
  };
}

/**
 * Validate database configuration
 */
export function validateConfig() {
  const errors = [];
  
  if (!config.postgres.host) {
    errors.push('Database host is required');
  }
  
  if (!config.postgres.database) {
    errors.push('Database name is required');
  }
  
  if (!config.postgres.user) {
    errors.push('Database user is required');
  }
  
  if (config.postgres.port < 1 || config.postgres.port > 65535) {
    errors.push('Database port must be between 1 and 65535');
  }
  
  if (config.postgres.max < config.postgres.min) {
    errors.push('Maximum pool size must be greater than minimum pool size');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get database URL for connection
 */
export function getDatabaseUrl() {
  const { host, port, database, user, password } = config.postgres;
  const auth = password ? `${user}:${password}` : user;
  return `postgresql://${auth}@${host}:${port}/${database}`;
}

/**
 * Get test database configuration
 */
export function getTestConfig() {
  return {
    ...config.postgres,
    database: config.test.database,
    logging: config.test.logging,
    debug: config.test.debug
  };
}

/**
 * Environment-specific database URLs
 */
export const DATABASE_URLS = {
  development: getDatabaseUrl(),
  test: (() => {
    const testConfig = getTestConfig();
    const auth = testConfig.password ? `${testConfig.user}:${testConfig.password}` : testConfig.user;
    return `postgresql://${auth}@${testConfig.host}:${testConfig.port}/${testConfig.database}`;
  })(),
  production: process.env.DATABASE_URL || getDatabaseUrl()
};

export default config;

