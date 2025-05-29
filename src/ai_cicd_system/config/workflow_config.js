/**
 * Unified Workflow Orchestration Configuration
 * Consolidates workflow engine and database infrastructure configuration
 * Combines functionality from PRs #50 and #63 with zero redundancy
 */

export const WORKFLOW_CONFIG = {
    // Core Engine Configuration
    engine: {
        maxConcurrentWorkflows: parseInt(process.env.MAX_CONCURRENT_WORKFLOWS) || 10,
        defaultTimeout: parseInt(process.env.DEFAULT_WORKFLOW_TIMEOUT) || 3600000, // 1 hour
        enableMetrics: process.env.ENABLE_WORKFLOW_METRICS !== 'false',
        enableRecovery: process.env.ENABLE_WORKFLOW_RECOVERY !== 'false',
        retryPolicy: {
            maxRetries: parseInt(process.env.MAX_WORKFLOW_RETRIES) || 3,
            retryDelay: parseInt(process.env.WORKFLOW_RETRY_DELAY) || 5000,
            backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER) || 2
        }
    },

    // Unified State Management (Database Integration)
    stateManager: {
        // Cache Configuration
        cacheSize: parseInt(process.env.STATE_CACHE_SIZE) || 1000,
        persistInterval: parseInt(process.env.STATE_PERSIST_INTERVAL) || 5000,
        retentionDays: parseInt(process.env.STATE_RETENTION_DAYS) || 30,
        enableCompression: process.env.ENABLE_STATE_COMPRESSION !== 'false',
        
        // PostgreSQL Database Configuration (from PR #63)
        database: {
            type: process.env.DATABASE_TYPE || 'postgresql',
            host: process.env.DATABASE_HOST || 'localhost',
            port: parseInt(process.env.DATABASE_PORT) || 5432,
            database: process.env.DATABASE_NAME || 'codegen-taskmaster-db',
            username: process.env.DATABASE_USERNAME || 'software_developer',
            password: process.env.DATABASE_PASSWORD || '',
            ssl: process.env.DATABASE_SSL === 'true',
            
            // Connection Pool Management (from PR #63)
            pool: {
                // Read Pool (60% of connections)
                read: {
                    min: parseInt(process.env.DB_READ_POOL_MIN) || 2,
                    max: parseInt(process.env.DB_READ_POOL_MAX) || 12,
                    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
                    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
                },
                // Write Pool (30% of connections)
                write: {
                    min: parseInt(process.env.DB_WRITE_POOL_MIN) || 1,
                    max: parseInt(process.env.DB_WRITE_POOL_MAX) || 6,
                    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
                    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
                },
                // Analytics Pool (10% of connections)
                analytics: {
                    min: parseInt(process.env.DB_ANALYTICS_POOL_MIN) || 1,
                    max: parseInt(process.env.DB_ANALYTICS_POOL_MAX) || 2,
                    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
                    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
                }
            }
        }
    },

    // Step Executor Configuration
    stepExecutor: {
        defaultTimeout: parseInt(process.env.STEP_DEFAULT_TIMEOUT) || 300000, // 5 minutes
        maxRetries: parseInt(process.env.STEP_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.STEP_RETRY_DELAY) || 1000,
        retryBackoffMultiplier: parseFloat(process.env.STEP_RETRY_BACKOFF) || 2,
        enableMetrics: process.env.ENABLE_STEP_METRICS !== 'false'
    },

    // Parallel Processing Configuration
    parallelProcessor: {
        maxConcurrentSteps: parseInt(process.env.MAX_CONCURRENT_STEPS) || 5,
        memoryLimit: process.env.PARALLEL_MEMORY_LIMIT || '4GB',
        cpuLimit: process.env.PARALLEL_CPU_LIMIT || '4 cores',
        diskLimit: process.env.PARALLEL_DISK_LIMIT || '20GB',
        queueTimeout: parseInt(process.env.PARALLEL_QUEUE_TIMEOUT) || 30000,
        enableLoadBalancing: process.env.ENABLE_LOAD_BALANCING !== 'false',
        enableResourceMonitoring: process.env.ENABLE_RESOURCE_MONITORING !== 'false',
        failureStrategy: process.env.PARALLEL_FAILURE_STRATEGY || 'continue' // 'continue', 'fail_fast', 'fail_dependent'
    },

    // Agent Manager Configuration (Enhanced from PR #50)
    agentManager: {
        agents: {
            'claude-code': {
                endpoint: process.env.CLAUDE_CODE_ENDPOINT || 'http://localhost:3001',
                apiKey: process.env.CLAUDE_CODE_API_KEY || '',
                timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || 300000,
                maxConcurrent: parseInt(process.env.CLAUDE_CODE_MAX_CONCURRENT) || 3,
                retryCount: parseInt(process.env.CLAUDE_CODE_RETRY_COUNT) || 2
            },
            'codegen': {
                endpoint: process.env.CODEGEN_ENDPOINT || 'http://localhost:3002',
                apiKey: process.env.CODEGEN_API_KEY || '',
                timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 120000,
                maxConcurrent: parseInt(process.env.CODEGEN_MAX_CONCURRENT) || 5,
                retryCount: parseInt(process.env.CODEGEN_RETRY_COUNT) || 2
            },
            'aider': {
                endpoint: process.env.AIDER_ENDPOINT || 'http://localhost:3003',
                apiKey: process.env.AIDER_API_KEY || '',
                timeout: parseInt(process.env.AIDER_TIMEOUT) || 180000,
                maxConcurrent: parseInt(process.env.AIDER_MAX_CONCURRENT) || 2,
                retryCount: parseInt(process.env.AIDER_RETRY_COUNT) || 2
            },
            'goose': {
                endpoint: process.env.GOOSE_ENDPOINT || 'http://localhost:3004',
                apiKey: process.env.GOOSE_API_KEY || '',
                timeout: parseInt(process.env.GOOSE_TIMEOUT) || 240000,
                maxConcurrent: parseInt(process.env.GOOSE_MAX_CONCURRENT) || 2,
                retryCount: parseInt(process.env.GOOSE_RETRY_COUNT) || 1
            }
        },
        healthCheck: {
            enabled: process.env.ENABLE_AGENT_HEALTH_CHECK !== 'false',
            interval: parseInt(process.env.AGENT_HEALTH_CHECK_INTERVAL) || 30000,
            timeout: parseInt(process.env.AGENT_HEALTH_CHECK_TIMEOUT) || 5000,
            retryCount: parseInt(process.env.AGENT_HEALTH_CHECK_RETRIES) || 3
        },
        loadBalancing: {
            enabled: process.env.ENABLE_AGENT_LOAD_BALANCING !== 'false',
            strategy: process.env.AGENT_LOAD_BALANCE_STRATEGY || 'round_robin',
            weights: {
                'claude-code': parseFloat(process.env.CLAUDE_CODE_WEIGHT) || 1.0,
                'codegen': parseFloat(process.env.CODEGEN_WEIGHT) || 1.0,
                'aider': parseFloat(process.env.AIDER_WEIGHT) || 0.8,
                'goose': parseFloat(process.env.GOOSE_WEIGHT) || 0.7
            }
        }
    },

    // Infrastructure Configuration (from PR #63)
    infrastructure: {
        // Cloudflare Proxy Configuration
        cloudflare: {
            enabled: process.env.CLOUDFLARE_PROXY_ENABLED === 'true',
            tunnelId: process.env.CLOUDFLARE_TUNNEL_ID || '',
            hostname: process.env.CLOUDFLARE_PROXY_HOSTNAME || '',
            credentialsFile: process.env.CLOUDFLARE_CREDENTIALS_FILE || '/etc/cloudflared/credentials.json',
            access: {
                enabled: process.env.CLOUDFLARE_ACCESS_ENABLED === 'true',
                teamDomain: process.env.CLOUDFLARE_TEAM_DOMAIN || '',
                applicationAud: process.env.CLOUDFLARE_APPLICATION_AUD || ''
            }
        },
        
        // Load Balancer Configuration
        loadBalancer: {
            enabled: process.env.ENABLE_LOAD_BALANCER === 'true',
            primaryHost: process.env.DB_HOST_PRIMARY || 'localhost',
            secondaryHost: process.env.DB_HOST_SECONDARY || '',
            healthCheckInterval: parseInt(process.env.LB_HEALTH_CHECK_INTERVAL) || 30000
        }
    },

    // Monitoring and Observability (Enhanced)
    monitoring: {
        enabled: process.env.ENABLE_MONITORING !== 'false',
        metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 30000,
        logLevel: process.env.LOG_LEVEL || 'info',
        enableTracing: process.env.ENABLE_TRACING === 'true',
        
        // Prometheus Integration
        prometheus: {
            enabled: process.env.ENABLE_PROMETHEUS === 'true',
            port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
            path: process.env.PROMETHEUS_PATH || '/metrics'
        },
        
        // Alert Configuration
        alerts: {
            enabled: process.env.ENABLE_ALERTS === 'true',
            channels: {
                slack: {
                    enabled: process.env.ENABLE_SLACK_ALERTS === 'true',
                    webhook: process.env.SLACK_WEBHOOK_URL || '',
                    channel: process.env.SLACK_ALERT_CHANNEL || '#alerts'
                },
                email: {
                    enabled: process.env.ENABLE_EMAIL_ALERTS === 'true',
                    smtp: {
                        host: process.env.SMTP_HOST || '',
                        port: parseInt(process.env.SMTP_PORT) || 587,
                        secure: process.env.SMTP_SECURE === 'true',
                        auth: {
                            user: process.env.SMTP_USER || '',
                            pass: process.env.SMTP_PASS || ''
                        }
                    },
                    from: process.env.ALERT_EMAIL_FROM || 'alerts@workflow-engine.com',
                    to: process.env.ALERT_EMAIL_TO || ''
                }
            },
            thresholds: {
                failureRate: parseFloat(process.env.ALERT_FAILURE_RATE_THRESHOLD) || 0.1,
                avgExecutionTime: parseInt(process.env.ALERT_AVG_EXECUTION_TIME_THRESHOLD) || 1800000,
                queueSize: parseInt(process.env.ALERT_QUEUE_SIZE_THRESHOLD) || 50,
                resourceUtilization: parseFloat(process.env.ALERT_RESOURCE_UTILIZATION_THRESHOLD) || 0.8
            }
        }
    },

    // Security Configuration (Enhanced)
    security: {
        authentication: {
            enabled: process.env.ENABLE_AUTH !== 'false',
            type: process.env.AUTH_TYPE || 'jwt',
            jwt: {
                secret: process.env.JWT_SECRET || 'your-secret-key',
                expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                algorithm: process.env.JWT_ALGORITHM || 'HS256'
            },
            apiKey: {
                header: process.env.API_KEY_HEADER || 'X-API-Key',
                keys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : []
            }
        },
        authorization: {
            enabled: process.env.ENABLE_AUTHZ === 'true',
            rbac: {
                enabled: process.env.ENABLE_RBAC === 'true',
                roles: {
                    admin: ['workflow:*', 'task:*', 'validation:*', 'error:*'],
                    developer: ['workflow:read', 'workflow:execute', 'task:*', 'validation:*', 'error:read'],
                    operator: ['workflow:read', 'workflow:execute', 'workflow:pause', 'workflow:resume'],
                    viewer: ['workflow:read', 'task:read', 'validation:read', 'error:read']
                }
            }
        },
        encryption: {
            enabled: process.env.ENABLE_ENCRYPTION === 'true',
            algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
            key: process.env.ENCRYPTION_KEY || '',
            encryptSensitiveData: process.env.ENCRYPT_SENSITIVE_DATA === 'true'
        },
        rateLimiting: {
            enabled: process.env.ENABLE_RATE_LIMITING === 'true',
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true'
        }
    },

    // API Configuration
    api: {
        port: parseInt(process.env.API_PORT) || 3000,
        host: process.env.API_HOST || '0.0.0.0',
        cors: {
            enabled: process.env.ENABLE_CORS !== 'false',
            origin: process.env.CORS_ORIGIN || '*',
            credentials: process.env.CORS_CREDENTIALS === 'true'
        },
        compression: {
            enabled: process.env.ENABLE_COMPRESSION !== 'false',
            threshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024
        },
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
        bodyLimit: process.env.BODY_LIMIT || '10mb',
        swagger: {
            enabled: process.env.ENABLE_SWAGGER !== 'false',
            path: process.env.SWAGGER_PATH || '/api-docs',
            title: 'TaskMaster Workflow Engine API',
            version: '1.0.0'
        }
    },

    // Performance Configuration
    performance: {
        clustering: {
            enabled: process.env.ENABLE_CLUSTERING === 'true',
            workers: parseInt(process.env.CLUSTER_WORKERS) || require('os').cpus().length
        },
        caching: {
            enabled: process.env.ENABLE_CACHING !== 'false',
            type: process.env.CACHE_TYPE || 'memory',
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || '',
                db: parseInt(process.env.REDIS_DB) || 0,
                ttl: parseInt(process.env.CACHE_TTL) || 3600
            },
            memory: {
                maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE) || 100,
                ttl: parseInt(process.env.MEMORY_CACHE_TTL) || 3600
            }
        },
        optimization: {
            enableGzip: process.env.ENABLE_GZIP !== 'false',
            enableEtag: process.env.ENABLE_ETAG !== 'false',
            enableKeepAlive: process.env.ENABLE_KEEP_ALIVE !== 'false',
            maxSockets: parseInt(process.env.MAX_SOCKETS) || 50
        }
    },

    // Development Configuration
    development: {
        enabled: process.env.NODE_ENV === 'development',
        hotReload: process.env.ENABLE_HOT_RELOAD === 'true',
        debugMode: process.env.DEBUG_MODE === 'true',
        mockAgents: process.env.MOCK_AGENTS === 'true',
        seedData: process.env.SEED_DATA === 'true',
        testWorkflows: process.env.ENABLE_TEST_WORKFLOWS === 'true'
    }
};

/**
 * Validates the unified configuration
 * @returns {Object} Validation result with errors and warnings
 */
export function validateConfig() {
    const errors = [];
    const warnings = [];

    // Required environment variables
    const required = [
        'DATABASE_HOST',
        'DATABASE_NAME',
        'DATABASE_USERNAME'
    ];

    for (const envVar of required) {
        if (!process.env[envVar]) {
            errors.push(`Missing required environment variable: ${envVar}`);
        }
    }

    // Validate numeric values
    const numericConfigs = [
        ['MAX_CONCURRENT_WORKFLOWS', WORKFLOW_CONFIG.engine.maxConcurrentWorkflows],
        ['MAX_CONCURRENT_STEPS', WORKFLOW_CONFIG.parallelProcessor.maxConcurrentSteps],
        ['API_PORT', WORKFLOW_CONFIG.api.port]
    ];

    for (const [envVar, value] of numericConfigs) {
        if (isNaN(value) || value <= 0) {
            errors.push(`Invalid numeric value for ${envVar}: ${value}`);
        }
    }

    // Validate agent endpoints
    for (const [agentName, config] of Object.entries(WORKFLOW_CONFIG.agentManager.agents)) {
        if (!config.endpoint) {
            warnings.push(`No endpoint configured for agent: ${agentName}`);
        }
    }

    // Validate security configuration
    if (WORKFLOW_CONFIG.security.authentication.enabled) {
        if (WORKFLOW_CONFIG.security.authentication.type === 'jwt' && 
            !WORKFLOW_CONFIG.security.authentication.jwt.secret) {
            errors.push('JWT secret is required when JWT authentication is enabled');
        }
    }

    // Validate Cloudflare configuration
    if (WORKFLOW_CONFIG.infrastructure.cloudflare.enabled) {
        if (!WORKFLOW_CONFIG.infrastructure.cloudflare.tunnelId) {
            errors.push('Cloudflare tunnel ID is required when Cloudflare proxy is enabled');
        }
        if (!WORKFLOW_CONFIG.infrastructure.cloudflare.hostname) {
            errors.push('Cloudflare hostname is required when Cloudflare proxy is enabled');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Gets configuration for a specific component
 * @param {string} component - Component name
 * @returns {Object} Component configuration
 */
export function getComponentConfig(component) {
    return WORKFLOW_CONFIG[component] || {};
}

/**
 * Updates configuration at runtime
 * @param {string} path - Configuration path (e.g., 'engine.maxConcurrentWorkflows')
 * @param {any} value - New value
 */
export function updateConfig(path, value) {
    const keys = path.split('.');
    let current = WORKFLOW_CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
}

/**
 * Gets the current environment
 * @returns {string} Current environment
 */
export function getEnvironment() {
    return process.env.NODE_ENV || 'development';
}

/**
 * Checks if running in production
 * @returns {boolean} True if in production
 */
export function isProduction() {
    return getEnvironment() === 'production';
}

/**
 * Checks if running in development
 * @returns {boolean} True if in development
 */
export function isDevelopment() {
    return getEnvironment() === 'development';
}

/**
 * Gets configuration with environment-specific overrides
 * @returns {Object} Environment-specific configuration
 */
export function getEnvironmentConfig() {
    const config = { ...WORKFLOW_CONFIG };
    
    if (isDevelopment()) {
        // Development overrides
        config.monitoring.logLevel = 'debug';
        config.security.authentication.enabled = false;
        config.development.enabled = true;
        config.infrastructure.cloudflare.enabled = false;
    } else if (isProduction()) {
        // Production overrides
        config.monitoring.logLevel = 'warn';
        config.security.authentication.enabled = true;
        config.development.enabled = false;
        config.infrastructure.cloudflare.enabled = true;
    }
    
    return config;
}

export default WORKFLOW_CONFIG;

