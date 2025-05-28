/**
 * Database Proxy Configuration
 * Configuration settings for the Cloudflare database proxy
 */

export const DATABASE_PROXY_CONFIG = {
  // Cloudflare Worker URL (set after deployment)
  PROXY_URL: process.env.CLOUDFLARE_DB_PROXY_URL || 'https://your-worker.your-subdomain.workers.dev',
  
  // API Authentication
  API_TOKEN: process.env.DB_PROXY_API_TOKEN || '',
  
  // Connection settings
  CONNECTION: {
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  },
  
  // Security settings
  SECURITY: {
    validateSSL: true,
    allowedOrigins: [
      'https://codegen.sh',
      'https://api.codegen.sh',
      'http://localhost:3000', // Development
      'http://localhost:8080', // Development
    ],
  },
  
  // Rate limiting (client-side awareness)
  RATE_LIMITS: {
    requestsPerMinute: 1000,
    burstLimit: 50,
    backoffMultiplier: 2,
    maxBackoffTime: 30000, // 30 seconds
  },
  
  // Query optimization
  QUERY: {
    maxLength: 10000,
    timeout: 30000,
    maxRows: 10000,
    enablePreparedStatements: true,
  },
  
  // Monitoring and logging
  MONITORING: {
    enableMetrics: true,
    logQueries: process.env.NODE_ENV === 'development',
    logErrors: true,
    metricsEndpoint: process.env.METRICS_ENDPOINT || null,
  },
  
  // Connection pooling (client-side)
  POOL: {
    maxConnections: 10,
    idleTimeout: 30000,
    acquireTimeout: 5000,
  },
  
  // Failover and redundancy
  FAILOVER: {
    enabled: true,
    fallbackUrls: [
      // Add backup proxy URLs if available
    ],
    healthCheckInterval: 60000, // 1 minute
    maxFailures: 3,
  },
};

/**
 * Database connection credentials structure
 * This matches the format specified in the requirements
 */
export const DATABASE_CREDENTIALS = {
  name: 'Database',
  description: 'PostgreSQL database',
  host: process.env.CLOUDFLARE_PROXY_URL || 'your-worker.your-subdomain.workers.dev',
  port: 443, // HTTPS port for Cloudflare Worker
  database: process.env.DB_NAME || 'codegen-taskmaster-db',
  username: process.env.DB_USER || 'software_developer',
  password: process.env.DB_PASSWORD || 'password',
  sslMode: 'require',
  
  // Additional proxy-specific settings
  proxy: {
    enabled: true,
    type: 'cloudflare-worker',
    apiToken: process.env.DB_PROXY_API_TOKEN,
    endpoint: process.env.CLOUDFLARE_DB_PROXY_URL,
  },
};

/**
 * Environment-specific configurations
 */
export const ENVIRONMENT_CONFIGS = {
  development: {
    ...DATABASE_PROXY_CONFIG,
    PROXY_URL: 'http://localhost:8787', // Local Wrangler dev server
    MONITORING: {
      ...DATABASE_PROXY_CONFIG.MONITORING,
      logQueries: true,
      enableMetrics: false,
    },
    SECURITY: {
      ...DATABASE_PROXY_CONFIG.SECURITY,
      validateSSL: false,
      allowedOrigins: ['*'], // Allow all origins in development
    },
  },
  
  staging: {
    ...DATABASE_PROXY_CONFIG,
    PROXY_URL: process.env.STAGING_CLOUDFLARE_DB_PROXY_URL,
    MONITORING: {
      ...DATABASE_PROXY_CONFIG.MONITORING,
      logQueries: true,
    },
  },
  
  production: {
    ...DATABASE_PROXY_CONFIG,
    MONITORING: {
      ...DATABASE_PROXY_CONFIG.MONITORING,
      logQueries: false,
    },
    SECURITY: {
      ...DATABASE_PROXY_CONFIG.SECURITY,
      validateSSL: true,
    },
  },
};

/**
 * Get configuration for current environment
 */
export function getConfig(environment = process.env.NODE_ENV || 'development') {
  return ENVIRONMENT_CONFIGS[environment] || ENVIRONMENT_CONFIGS.development;
}

/**
 * Validate configuration
 */
export function validateConfig(config = getConfig()) {
  const required = ['PROXY_URL', 'API_TOKEN'];
  const missing = required.filter(key => !config[key] && !process.env[key.replace('PROXY_', 'CLOUDFLARE_DB_PROXY_')]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  return true;
}

/**
 * Connection health check configuration
 */
export const HEALTH_CHECK = {
  query: 'SELECT 1 as health_check',
  timeout: 5000,
  interval: 30000, // 30 seconds
  retries: 3,
  
  // Expected response for healthy connection
  expectedResponse: {
    success: true,
    data: [{ health_check: 1 }],
  },
};

