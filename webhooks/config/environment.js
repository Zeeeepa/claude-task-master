/**
 * Environment Configuration
 * Centralized configuration management for webhook system
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Webhook Server Configuration
 */
export const serverConfig = {
  port: parseInt(process.env.WEBHOOK_PORT) || 3001,
  host: process.env.WEBHOOK_HOST || 'localhost',
  environment: process.env.NODE_ENV || 'development',
  
  // Security settings
  corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '10mb',
  
  // Rate limiting
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
  rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
  
  // Timeouts
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000, // 30 seconds
  shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT) || 10000 // 10 seconds
};

/**
 * Database Configuration
 */
export const databaseConfig = {
  url: process.env.DATABASE_URL,
  type: process.env.DATABASE_TYPE || 'memory', // 'memory', 'postgresql', 'mysql'
  
  // Connection pool settings
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  
  // Cleanup settings
  eventRetentionDays: parseInt(process.env.EVENT_RETENTION_DAYS) || 7,
  cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Webhook Secrets Configuration
 */
export const webhookSecrets = {
  github: process.env.GITHUB_WEBHOOK_SECRET,
  linear: process.env.LINEAR_WEBHOOK_SECRET,
  codegen: process.env.CODEGEN_WEBHOOK_SECRET,
  
  // API keys
  masterKey: process.env.WEBHOOK_MASTER_KEY,
  apiKeys: process.env.WEBHOOK_API_KEYS?.split(',') || [],
  
  // JWT settings
  jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
  jwtExpiration: process.env.JWT_EXPIRATION || '24h',
  
  // Internal authentication
  codegenInternalKey: process.env.CODEGEN_INTERNAL_KEY
};

/**
 * External Service Configuration
 */
export const externalServices = {
  // AgentAPI configuration
  agentapi: {
    url: process.env.AGENTAPI_URL,
    apiKey: process.env.AGENTAPI_KEY,
    timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
    retries: parseInt(process.env.AGENTAPI_RETRIES) || 3
  },
  
  // Linear API configuration
  linear: {
    apiKey: process.env.LINEAR_API_KEY,
    apiUrl: process.env.LINEAR_API_URL || 'https://api.linear.app/graphql',
    timeout: parseInt(process.env.LINEAR_TIMEOUT) || 10000
  },
  
  // GitHub API configuration
  github: {
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    timeout: parseInt(process.env.GITHUB_TIMEOUT) || 10000
  }
};

/**
 * Processing Configuration
 */
export const processingConfig = {
  // Retry settings
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  retryDelays: process.env.RETRY_DELAYS?.split(',').map(d => parseInt(d)) || [1000, 5000, 15000],
  
  // Queue settings
  maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE) || 1000,
  processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT) || 60000, // 1 minute
  
  // Batch processing
  batchSize: parseInt(process.env.BATCH_SIZE) || 10,
  batchInterval: parseInt(process.env.BATCH_INTERVAL) || 5000 // 5 seconds
};

/**
 * Logging Configuration
 */
export const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'json', // 'json', 'text'
  
  // Log destinations
  console: process.env.LOG_CONSOLE !== 'false',
  file: process.env.LOG_FILE,
  
  // Request logging
  logRequests: process.env.LOG_REQUESTS !== 'false',
  logResponses: process.env.LOG_RESPONSES === 'true',
  logBodies: process.env.LOG_BODIES === 'true',
  
  // Security logging
  logSecurityEvents: process.env.LOG_SECURITY_EVENTS !== 'false',
  logFailedAuth: process.env.LOG_FAILED_AUTH !== 'false'
};

/**
 * Monitoring Configuration
 */
export const monitoringConfig = {
  // Health check settings
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
  
  // Metrics collection
  collectMetrics: process.env.COLLECT_METRICS !== 'false',
  metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000, // 1 minute
  
  // Alerting
  alertingEnabled: process.env.ALERTING_ENABLED === 'true',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
  
  // Performance monitoring
  slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 5000, // 5 seconds
  errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05 // 5%
};

/**
 * Feature Flags
 */
export const featureFlags = {
  // Webhook processing features
  enableGithubWebhooks: process.env.ENABLE_GITHUB_WEBHOOKS !== 'false',
  enableLinearWebhooks: process.env.ENABLE_LINEAR_WEBHOOKS !== 'false',
  enableCodegenWebhooks: process.env.ENABLE_CODEGEN_WEBHOOKS !== 'false',
  
  // Processing features
  enableRetryQueue: process.env.ENABLE_RETRY_QUEUE !== 'false',
  enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING === 'true',
  enableAsyncProcessing: process.env.ENABLE_ASYNC_PROCESSING !== 'false',
  
  // Security features
  enableSignatureValidation: process.env.ENABLE_SIGNATURE_VALIDATION !== 'false',
  enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
  enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
  
  // Integration features
  enableAgentapiIntegration: process.env.ENABLE_AGENTAPI_INTEGRATION !== 'false',
  enableLinearIntegration: process.env.ENABLE_LINEAR_INTEGRATION !== 'false',
  enableGithubIntegration: process.env.ENABLE_GITHUB_INTEGRATION !== 'false'
};

/**
 * Validate configuration
 */
export function validateConfig() {
  const errors = [];
  
  // Check required webhook secrets
  if (featureFlags.enableGithubWebhooks && !webhookSecrets.github) {
    errors.push('GITHUB_WEBHOOK_SECRET is required when GitHub webhooks are enabled');
  }
  
  if (featureFlags.enableLinearWebhooks && !webhookSecrets.linear) {
    errors.push('LINEAR_WEBHOOK_SECRET is required when Linear webhooks are enabled');
  }
  
  if (featureFlags.enableCodegenWebhooks && !webhookSecrets.codegen) {
    errors.push('CODEGEN_WEBHOOK_SECRET is required when Codegen webhooks are enabled');
  }
  
  // Check external service configuration
  if (featureFlags.enableAgentapiIntegration && !externalServices.agentapi.url) {
    errors.push('AGENTAPI_URL is required when AgentAPI integration is enabled');
  }
  
  if (featureFlags.enableLinearIntegration && !externalServices.linear.apiKey) {
    errors.push('LINEAR_API_KEY is required when Linear integration is enabled');
  }
  
  if (featureFlags.enableGithubIntegration && !externalServices.github.token) {
    errors.push('GITHUB_TOKEN is required when GitHub integration is enabled');
  }
  
  // Check server configuration
  if (serverConfig.port < 1 || serverConfig.port > 65535) {
    errors.push('WEBHOOK_PORT must be between 1 and 65535');
  }
  
  // Check rate limiting configuration
  if (serverConfig.rateLimitRequests < 1) {
    errors.push('RATE_LIMIT_REQUESTS must be greater than 0');
  }
  
  if (serverConfig.rateLimitWindow < 1000) {
    errors.push('RATE_LIMIT_WINDOW must be at least 1000ms');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get configuration summary (for debugging)
 */
export function getConfigSummary() {
  return {
    server: {
      port: serverConfig.port,
      host: serverConfig.host,
      environment: serverConfig.environment
    },
    features: featureFlags,
    externalServices: {
      agentapi: !!externalServices.agentapi.url,
      linear: !!externalServices.linear.apiKey,
      github: !!externalServices.github.token
    },
    webhookSecrets: {
      github: !!webhookSecrets.github,
      linear: !!webhookSecrets.linear,
      codegen: !!webhookSecrets.codegen
    },
    database: {
      type: databaseConfig.type,
      configured: !!databaseConfig.url
    }
  };
}

/**
 * Export all configurations
 */
export default {
  server: serverConfig,
  database: databaseConfig,
  webhookSecrets,
  externalServices,
  processing: processingConfig,
  logging: loggingConfig,
  monitoring: monitoringConfig,
  features: featureFlags,
  validate: validateConfig,
  summary: getConfigSummary
};

