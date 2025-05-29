/**
 * @fileoverview Consolidated Configuration Manager
 * @description Unified configuration management consolidating PRs #48, #49, #68, #79
 * @version 3.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * Consolidated Configuration Manager
 * Merges configuration approaches from all PRs
 */
export class ConfigManager {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'config-manager' });
        this.config = this._mergeConfigurations(config);
        this.environment = process.env.NODE_ENV || 'development';
    }

    /**
     * Merge configurations from all sources
     */
    _mergeConfigurations(userConfig) {
        // Base configuration (from PR #48)
        const baseConfig = {
            environment: process.env.NODE_ENV || 'development',
            
            // Server configuration
            server: {
                port: parseInt(process.env.WEBHOOK_PORT) || 3000,
                host: process.env.WEBHOOK_HOST || '0.0.0.0',
                maxPayloadSize: process.env.WEBHOOK_MAX_PAYLOAD_SIZE || '10mb',
                timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 30000,
                enableCors: process.env.WEBHOOK_ENABLE_CORS !== 'false',
                enableCompression: process.env.WEBHOOK_ENABLE_COMPRESSION !== 'false',
                enableHelmet: process.env.WEBHOOK_ENABLE_HELMET !== 'false',
                trustProxy: process.env.WEBHOOK_TRUST_PROXY === 'true',
                
                // Rate limiting
                rateLimit: {
                    enabled: process.env.WEBHOOK_RATE_LIMIT_ENABLED !== 'false',
                    windowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
                    max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX) || 1000,
                    slowDownThreshold: parseInt(process.env.WEBHOOK_RATE_LIMIT_SLOWDOWN) || 100
                }
            },

            // Security configuration (from PR #49)
            security: {
                github: {
                    secret: process.env.GITHUB_WEBHOOK_SECRET,
                    algorithm: 'sha256',
                    encoding: 'hex'
                },
                validation: {
                    enablePayloadValidation: process.env.WEBHOOK_PAYLOAD_VALIDATION !== 'false',
                    maxPayloadSize: parseInt(process.env.WEBHOOK_MAX_PAYLOAD_SIZE_BYTES) || 10485760,
                    allowedEvents: this._parseArray(process.env.WEBHOOK_ALLOWED_EVENTS) || [
                        'pull_request', 'push', 'check_run', 'check_suite',
                        'pull_request_review', 'pull_request_review_comment', 'status'
                    ],
                    requiredHeaders: [
                        'X-GitHub-Event', 'X-GitHub-Delivery', 'X-Hub-Signature-256'
                    ]
                },
                security: {
                    enableRateLimiting: process.env.WEBHOOK_RATE_LIMITING !== 'false',
                    enableIPWhitelist: process.env.WEBHOOK_IP_WHITELIST_ENABLED === 'true',
                    allowedIPs: this._parseArray(process.env.WEBHOOK_ALLOWED_IPS) || [],
                    enableUserAgentValidation: process.env.WEBHOOK_USER_AGENT_VALIDATION !== 'false',
                    allowedUserAgents: [
                        '^GitHub-Hookshot/',
                        '^GitHub-Hookshot-[a-f0-9]+$'
                    ],
                    enableTimestampValidation: process.env.WEBHOOK_TIMESTAMP_VALIDATION !== 'false',
                    maxTimestampAge: parseInt(process.env.WEBHOOK_MAX_TIMESTAMP_AGE) || 300000
                }
            },

            // Queue configuration (from PR #49)
            queue: {
                enabled: process.env.WEBHOOK_QUEUE_ENABLED !== 'false',
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD,
                    db: parseInt(process.env.REDIS_DB) || 0,
                    keyPrefix: process.env.REDIS_KEY_PREFIX || 'webhook:'
                },
                processing: {
                    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
                    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 1000,
                    retryBackoffMultiplier: parseInt(process.env.WEBHOOK_RETRY_BACKOFF) || 2,
                    maxRetryDelay: parseInt(process.env.WEBHOOK_MAX_RETRY_DELAY) || 30000,
                    processingTimeout: parseInt(process.env.WEBHOOK_PROCESSING_TIMEOUT) || 300000,
                    batchSize: parseInt(process.env.WEBHOOK_BATCH_SIZE) || 10,
                    concurrency: parseInt(process.env.WEBHOOK_CONCURRENCY) || 5
                },
                queues: {
                    default: 'webhook:events:default',
                    deployment: 'webhook:events:deployment',
                    validation: 'webhook:events:validation',
                    workflow: 'webhook:events:workflow',
                    recovery: 'webhook:events:recovery',
                    deadLetter: 'webhook:events:dead_letter'
                }
            },

            // Database configuration (from PR #68, #79)
            database: {
                // Connection details
                host: process.env.CLOUDFLARE_DB_URL || process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.CLOUDFLARE_DB_PORT) || parseInt(process.env.DB_PORT) || 5432,
                database: process.env.CLOUDFLARE_DB_NAME || process.env.DB_NAME || 'codegen-taskmaster-db',
                username: process.env.CLOUDFLARE_DB_USER || process.env.DB_USER || 'software_developer',
                password: process.env.CLOUDFLARE_DB_PASSWORD || process.env.DB_PASSWORD,
                ssl: process.env.CLOUDFLARE_DB_SSL_MODE || process.env.DB_SSL_MODE || 'require',
                
                // Connection pool
                pool: {
                    min: parseInt(process.env.CLOUDFLARE_DB_POOL_MIN) || parseInt(process.env.DB_POOL_MIN) || 5,
                    max: parseInt(process.env.CLOUDFLARE_DB_POOL_MAX) || parseInt(process.env.DB_POOL_MAX) || 20,
                    idleTimeout: parseInt(process.env.CLOUDFLARE_DB_POOL_IDLE_TIMEOUT) || parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
                    acquireTimeout: parseInt(process.env.CLOUDFLARE_DB_POOL_ACQUIRE_TIMEOUT) || parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 60000,
                    createTimeout: parseInt(process.env.CLOUDFLARE_DB_POOL_CREATE_TIMEOUT) || parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000
                },
                
                // Query configuration
                queryTimeout: parseInt(process.env.CLOUDFLARE_DB_QUERY_TIMEOUT) || parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
                
                // Cloudflare specific
                cloudflare: {
                    enabled: process.env.CLOUDFLARE_ENABLED === 'true',
                    tunnelUrl: process.env.CLOUDFLARE_TUNNEL_URL,
                    tunnelToken: process.env.CLOUDFLARE_TUNNEL_TOKEN,
                    zoneId: process.env.CLOUDFLARE_ZONE_ID,
                    apiToken: process.env.CLOUDFLARE_API_TOKEN
                }
            },

            // Event processing configuration (from PR #58)
            processor: {
                enableQueue: process.env.WEBHOOK_PROCESSOR_QUEUE !== 'false',
                enableCorrelation: process.env.WEBHOOK_PROCESSOR_CORRELATION !== 'false',
                enableRetries: process.env.WEBHOOK_PROCESSOR_RETRIES !== 'false',
                maxRetries: parseInt(process.env.WEBHOOK_PROCESSOR_MAX_RETRIES) || 3,
                retryDelay: parseInt(process.env.WEBHOOK_PROCESSOR_RETRY_DELAY) || 1000,
                processingTimeout: parseInt(process.env.WEBHOOK_PROCESSOR_TIMEOUT) || 30000,
                
                // External service integration
                agentapi: {
                    enabled: process.env.AGENTAPI_ENABLED !== 'false',
                    baseUrl: process.env.AGENTAPI_BASE_URL || process.env.AGENTAPI_URL || 'http://localhost:8000',
                    apiKey: process.env.AGENTAPI_API_KEY,
                    timeout: parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
                    retries: parseInt(process.env.AGENTAPI_RETRIES) || 3
                },
                
                codegen: {
                    enabled: process.env.CODEGEN_ENABLED !== 'false',
                    apiUrl: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
                    apiKey: process.env.CODEGEN_API_KEY,
                    timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 60000
                },
                
                linear: {
                    enabled: process.env.LINEAR_ENABLED !== 'false',
                    apiKey: process.env.LINEAR_API_KEY,
                    baseUrl: process.env.LINEAR_API_URL || 'https://api.linear.app/graphql',
                    timeout: parseInt(process.env.LINEAR_TIMEOUT) || 30000
                },
                
                claudeCode: {
                    enabled: process.env.CLAUDE_CODE_ENABLED !== 'false',
                    apiUrl: process.env.CLAUDE_CODE_API_URL || 'http://localhost:3001',
                    apiKey: process.env.CLAUDE_CODE_API_KEY,
                    timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || 30000
                }
            },

            // Error handling configuration (from PR #89)
            error: {
                enabled: process.env.WEBHOOK_ERROR_HANDLING !== 'false',
                maxRetries: parseInt(process.env.WEBHOOK_ERROR_MAX_RETRIES) || 3,
                retryDelay: parseInt(process.env.WEBHOOK_ERROR_RETRY_DELAY) || 1000,
                backoffMultiplier: parseInt(process.env.WEBHOOK_ERROR_BACKOFF_MULTIPLIER) || 2,
                maxRetryDelay: parseInt(process.env.WEBHOOK_ERROR_MAX_RETRY_DELAY) || 30000,
                enableCircuitBreaker: process.env.WEBHOOK_ERROR_CIRCUIT_BREAKER !== 'false',
                circuitBreakerThreshold: parseInt(process.env.WEBHOOK_ERROR_CB_THRESHOLD) || 5,
                circuitBreakerTimeout: parseInt(process.env.WEBHOOK_ERROR_CB_TIMEOUT) || 60000,
                enableRecovery: process.env.WEBHOOK_ERROR_RECOVERY !== 'false',
                recoveryStrategies: this._parseArray(process.env.WEBHOOK_ERROR_RECOVERY_STRATEGIES) || [
                    'retry', 'fallback', 'circuit_breaker'
                ]
            },

            // Monitoring configuration
            monitoring: {
                enabled: process.env.WEBHOOK_MONITORING_ENABLED !== 'false',
                enableMetrics: process.env.WEBHOOK_ENABLE_METRICS !== 'false',
                enableTracing: process.env.WEBHOOK_ENABLE_TRACING !== 'false',
                enableSecurityMetrics: process.env.WEBHOOK_ENABLE_SECURITY_METRICS !== 'false',
                logSecurityEvents: process.env.WEBHOOK_LOG_SECURITY_EVENTS !== 'false',
                metricsInterval: parseInt(process.env.WEBHOOK_METRICS_INTERVAL) || 60000,
                healthCheckInterval: parseInt(process.env.WEBHOOK_HEALTH_CHECK_INTERVAL) || 30000
            },

            // Logging configuration
            logging: {
                level: process.env.WEBHOOK_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
                format: process.env.WEBHOOK_LOG_FORMAT || process.env.LOG_FORMAT || 'json',
                enableColors: process.env.WEBHOOK_LOG_COLORS !== 'false',
                enableTimestamp: process.env.WEBHOOK_LOG_TIMESTAMP !== 'false',
                enableMetadata: process.env.WEBHOOK_LOG_METADATA !== 'false'
            }
        };

        // Apply environment-specific overrides
        const envConfig = this._getEnvironmentConfig(this.environment);
        
        // Merge configurations: base -> environment -> user
        return this._deepMerge(baseConfig, envConfig, userConfig);
    }

    /**
     * Get environment-specific configuration
     */
    _getEnvironmentConfig(environment) {
        const envConfigs = {
            development: {
                server: {
                    port: 3001
                },
                security: {
                    validation: {
                        enablePayloadValidation: false
                    },
                    security: {
                        enableIPWhitelist: false,
                        enableUserAgentValidation: false
                    }
                },
                database: {
                    pool: {
                        min: 2,
                        max: 5
                    }
                },
                monitoring: {
                    logSecurityEvents: false
                },
                logging: {
                    level: 'debug'
                }
            },
            
            staging: {
                server: {
                    port: 3001
                },
                security: {
                    validation: {
                        enablePayloadValidation: true
                    },
                    security: {
                        enableIPWhitelist: false,
                        enableUserAgentValidation: true
                    }
                },
                database: {
                    pool: {
                        min: 3,
                        max: 10
                    }
                }
            },
            
            production: {
                server: {
                    port: 3001
                },
                security: {
                    validation: {
                        enablePayloadValidation: true
                    },
                    security: {
                        enableRateLimiting: true,
                        enableIPWhitelist: true,
                        allowedIPs: [
                            '140.82.112.0/20',
                            '185.199.108.0/22',
                            '192.30.252.0/22',
                            '143.55.64.0/20'
                        ],
                        enableUserAgentValidation: true,
                        enableTimestampValidation: true
                    }
                },
                queue: {
                    processing: {
                        concurrency: 10,
                        batchSize: 20
                    }
                },
                monitoring: {
                    enableMetrics: true,
                    enableTracing: true,
                    logSecurityEvents: true
                }
            }
        };

        return envConfigs[environment] || {};
    }

    /**
     * Load configuration from file
     */
    async loadFromFile(filePath) {
        try {
            const fullPath = path.resolve(filePath);
            const content = await fs.readFile(fullPath, 'utf8');
            const fileConfig = JSON.parse(content);
            
            this.logger.info('Loaded configuration from file', { filePath: fullPath });
            
            // Merge with existing configuration
            this.config = this._deepMerge(this.config, fileConfig);
            
            return this.config;
        } catch (error) {
            this.logger.error('Failed to load configuration from file', { 
                filePath, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Save configuration to file
     */
    async saveToFile(filePath) {
        try {
            const fullPath = path.resolve(filePath);
            const content = JSON.stringify(this.config, null, 2);
            
            await fs.writeFile(fullPath, content, 'utf8');
            
            this.logger.info('Saved configuration to file', { filePath: fullPath });
        } catch (error) {
            this.logger.error('Failed to save configuration to file', { 
                filePath, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Get configuration value by path
     */
    get(path, defaultValue = undefined) {
        return this._getNestedValue(this.config, path, defaultValue);
    }

    /**
     * Set configuration value by path
     */
    set(path, value) {
        this._setNestedValue(this.config, path, value);
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields validation
        if (!this.config.security.github.secret) {
            errors.push('GitHub webhook secret is required (GITHUB_WEBHOOK_SECRET)');
        }

        if (!this.config.database.password) {
            warnings.push('Database password is not set');
        }

        // Database configuration validation
        if (this.config.database.pool.min < 0) {
            errors.push('Database pool minimum must be non-negative');
        }

        if (this.config.database.pool.max < this.config.database.pool.min) {
            errors.push('Database pool maximum must be >= minimum');
        }

        // Security validation
        if (this.config.security.security.enableIPWhitelist && 
            this.config.security.security.allowedIPs.length === 0) {
            warnings.push('IP whitelist is enabled but no IPs are configured');
        }

        // Queue validation
        if (this.config.queue.enabled && !this.config.queue.redis.host) {
            errors.push('Redis host is required when queue is enabled');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get sanitized configuration (removes sensitive data)
     */
    getSanitized() {
        const sanitized = JSON.parse(JSON.stringify(this.config));
        
        // Remove sensitive fields
        if (sanitized.security?.github?.secret) {
            sanitized.security.github.secret = '***';
        }
        if (sanitized.database?.password) {
            sanitized.database.password = '***';
        }
        if (sanitized.queue?.redis?.password) {
            sanitized.queue.redis.password = '***';
        }
        if (sanitized.processor?.agentapi?.apiKey) {
            sanitized.processor.agentapi.apiKey = '***';
        }
        if (sanitized.processor?.codegen?.apiKey) {
            sanitized.processor.codegen.apiKey = '***';
        }
        if (sanitized.processor?.linear?.apiKey) {
            sanitized.processor.linear.apiKey = '***';
        }
        if (sanitized.processor?.claudeCode?.apiKey) {
            sanitized.processor.claudeCode.apiKey = '***';
        }

        return sanitized;
    }

    /**
     * Deep merge objects
     */
    _deepMerge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this._isObject(target) && this._isObject(source)) {
            for (const key in source) {
                if (this._isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this._deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this._deepMerge(target, ...sources);
    }

    /**
     * Check if value is object
     */
    _isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Get nested value from object
     */
    _getNestedValue(obj, path, defaultValue) {
        const keys = path.split('.');
        let current = obj;

        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return defaultValue;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Set nested value in object
     */
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || !this._isObject(current[key])) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Parse array from environment variable
     */
    _parseArray(value) {
        if (!value) return null;
        if (Array.isArray(value)) return value;
        return value.split(',').map(item => item.trim()).filter(Boolean);
    }

    /**
     * Get all configuration
     */
    getAll() {
        return this.config;
    }

    /**
     * Get environment
     */
    getEnvironment() {
        return this.environment;
    }
}

export default ConfigManager;

