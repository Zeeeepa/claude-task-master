/**
 * @fileoverview Database Connection Configuration
 * @description Enhanced database connection settings with Cloudflare proxy integration
 */

import { getCloudflareConfig } from '../cloudflare/proxy_config.js';
import { getSSLConfig } from '../cloudflare/ssl_config.js';

/**
 * Enhanced Database Connection Configuration
 * 
 * This configuration extends the base database config with Cloudflare proxy
 * integration, SSL/TLS settings, and production-ready connection management.
 */

export const connectionConfig = {
    // Basic connection settings
    connection: {
        // Use Cloudflare proxy hostname if enabled, otherwise direct connection
        host: process.env.CLOUDFLARE_PROXY_ENABLED === 'true' 
            ? process.env.CLOUDFLARE_PROXY_HOSTNAME 
            : process.env.DB_HOST || 'localhost',
        
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'codegen-taskmaster-db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        
        // Connection timeout settings
        connectionTimeoutMillis: 30000, // 30 seconds
        idleTimeoutMillis: 30000, // 30 seconds
        query_timeout: 60000, // 60 seconds
        
        // Application name for connection identification
        application_name: process.env.APP_NAME || 'codegen-taskmaster',
        
        // Client encoding
        client_encoding: 'UTF8'
    },

    // SSL/TLS Configuration
    ssl: {
        enabled: process.env.DB_SSL_ENABLED !== 'false',
        
        // SSL mode based on environment and Cloudflare config
        mode: process.env.DB_SSL_MODE || (
            process.env.CLOUDFLARE_PROXY_ENABLED === 'true' ? 'require' : 'prefer'
        ),
        
        // Certificate settings
        certificates: {
            // Client certificate (for mutual TLS)
            client_cert: process.env.DB_CLIENT_CERT_PATH,
            client_key: process.env.DB_CLIENT_KEY_PATH,
            
            // CA certificate for server verification
            ca_cert: process.env.DB_CA_CERT_PATH,
            
            // Server certificate verification
            verify_server_cert: process.env.DB_VERIFY_SERVER_CERT !== 'false',
            verify_hostname: process.env.DB_VERIFY_HOSTNAME !== 'false',
            
            // Allow self-signed certificates (development only)
            allow_self_signed: process.env.NODE_ENV === 'development'
        },
        
        // TLS settings
        tls: {
            min_version: 'TLSv1.2',
            max_version: 'TLSv1.3',
            
            // Cipher suites
            ciphers: [
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES128-SHA256',
                'ECDHE-RSA-AES256-SHA384'
            ].join(':'),
            
            // Security options
            honor_cipher_order: true,
            secure_renegotiation: true
        }
    },

    // Connection Pool Configuration
    pool: {
        // Pool size settings
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        
        // Timeout settings
        acquireTimeoutMillis: 30000, // 30 seconds
        createTimeoutMillis: 30000, // 30 seconds
        destroyTimeoutMillis: 5000, // 5 seconds
        idleTimeoutMillis: 30000, // 30 seconds
        reapIntervalMillis: 1000, // 1 second
        createRetryIntervalMillis: 200, // 200ms
        
        // Pool validation
        validate: {
            enabled: true,
            query: 'SELECT 1',
            interval_ms: 30000 // 30 seconds
        },
        
        // Pool monitoring
        monitoring: {
            enabled: true,
            log_pool_stats: process.env.DB_LOG_POOL_STATS === 'true',
            stats_interval_ms: 60000 // 1 minute
        }
    },

    // Retry Configuration
    retry: {
        enabled: true,
        max_attempts: 3,
        delay_ms: 1000,
        backoff_factor: 2,
        max_delay_ms: 10000,
        
        // Retryable error codes
        retryable_errors: [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'ENETUNREACH',
            'EHOSTUNREACH',
            '53300', // PostgreSQL connection failure
            '08006', // PostgreSQL connection failure
            '08001', // PostgreSQL unable to connect
            '08004'  // PostgreSQL server rejected connection
        ],
        
        // Non-retryable errors (fail fast)
        non_retryable_errors: [
            '28000', // Invalid authorization
            '28P01', // Invalid password
            '3D000', // Invalid database name
            '42501'  // Insufficient privilege
        ]
    },

    // Health Check Configuration
    health_check: {
        enabled: true,
        interval_ms: 30000, // 30 seconds
        timeout_ms: 5000, // 5 seconds
        
        // Health check query
        query: 'SELECT NOW() as timestamp, version() as version',
        
        // Failure handling
        max_failures: 3,
        failure_action: 'reconnect', // reconnect, alert, shutdown
        
        // Recovery settings
        recovery: {
            enabled: true,
            check_interval_ms: 10000, // 10 seconds
            max_recovery_attempts: 5
        }
    },

    // Query Configuration
    query: {
        // Default query timeout
        timeout_ms: 60000, // 60 seconds
        
        // Query logging
        logging: {
            enabled: process.env.DB_LOG_QUERIES === 'true',
            log_slow_queries: true,
            slow_query_threshold_ms: 1000, // 1 second
            log_query_parameters: process.env.NODE_ENV === 'development',
            
            // Query statistics
            collect_stats: true,
            stats_retention_hours: 24
        },
        
        // Query optimization
        optimization: {
            // Prepared statements
            use_prepared_statements: true,
            prepared_statement_cache_size: 100,
            
            // Query planning
            enable_query_planning: true,
            plan_cache_size: 50
        }
    },

    // Transaction Configuration
    transactions: {
        // Default transaction isolation level
        isolation_level: 'READ_COMMITTED', // READ_UNCOMMITTED, READ_COMMITTED, REPEATABLE_READ, SERIALIZABLE
        
        // Transaction timeout
        timeout_ms: 30000, // 30 seconds
        
        // Deadlock handling
        deadlock_retry: {
            enabled: true,
            max_attempts: 3,
            delay_ms: 100,
            backoff_factor: 2
        },
        
        // Transaction monitoring
        monitoring: {
            enabled: true,
            log_long_transactions: true,
            long_transaction_threshold_ms: 10000 // 10 seconds
        }
    },

    // Monitoring and Metrics
    monitoring: {
        enabled: true,
        
        // Performance metrics
        metrics: {
            enabled: true,
            collection_interval_ms: 60000, // 1 minute
            
            // Metrics to collect
            collect: {
                connection_stats: true,
                query_performance: true,
                pool_utilization: true,
                error_rates: true,
                transaction_stats: true
            },
            
            // Metric storage
            storage: {
                type: 'database', // database, memory, external
                retention_hours: 168, // 7 days
                
                // External storage (if type is 'external')
                external: {
                    endpoint: process.env.METRICS_ENDPOINT,
                    api_key: process.env.METRICS_API_KEY
                }
            }
        },
        
        // Alerting
        alerts: {
            enabled: true,
            
            // Alert conditions
            conditions: {
                high_connection_usage: {
                    threshold: 80, // percentage
                    duration_minutes: 5
                },
                
                slow_query_rate: {
                    threshold: 10, // percentage
                    duration_minutes: 5
                },
                
                connection_failures: {
                    threshold: 5, // failures per minute
                    duration_minutes: 2
                },
                
                pool_exhaustion: {
                    threshold: 95, // percentage
                    duration_minutes: 1
                }
            },
            
            // Notification channels
            notifications: {
                email: process.env.DB_ALERT_EMAIL,
                webhook: process.env.DB_ALERT_WEBHOOK,
                slack: process.env.DB_ALERT_SLACK_WEBHOOK
            }
        }
    },

    // Security Configuration
    security: {
        // Connection security
        connection_security: {
            // Require SSL for production
            require_ssl: process.env.NODE_ENV === 'production',
            
            // Connection encryption
            encrypt_connection: true,
            
            // Authentication
            authentication: {
                method: 'password', // password, certificate, kerberos
                
                // Password security
                password_encryption: true,
                
                // Certificate authentication (if method is 'certificate')
                certificate: {
                    client_cert_path: process.env.DB_CLIENT_CERT_PATH,
                    client_key_path: process.env.DB_CLIENT_KEY_PATH
                }
            }
        },
        
        // Query security
        query_security: {
            // SQL injection protection
            sql_injection_protection: true,
            
            // Query validation
            validate_queries: true,
            
            // Dangerous query detection
            dangerous_query_detection: {
                enabled: true,
                
                // Patterns to detect
                patterns: [
                    /DROP\s+TABLE/i,
                    /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
                    /TRUNCATE\s+TABLE/i,
                    /ALTER\s+TABLE/i,
                    /CREATE\s+USER/i,
                    /GRANT\s+ALL/i
                ],
                
                // Action when detected
                action: 'block' // block, log, alert
            }
        },
        
        // Access control
        access_control: {
            // IP-based access control
            ip_whitelist: (process.env.DB_ALLOWED_IPS || '').split(',').filter(ip => ip.trim()),
            
            // User-based access control
            user_restrictions: {
                enabled: true,
                
                // Restricted operations per user
                restrictions: {
                    [process.env.DB_USER]: {
                        allowed_operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                        denied_operations: ['DROP', 'CREATE', 'ALTER', 'GRANT']
                    }
                }
            }
        }
    },

    // Environment-specific configurations
    environments: {
        development: {
            connection: {
                host: 'localhost',
                connectionTimeoutMillis: 10000
            },
            ssl: {
                enabled: false,
                certificates: {
                    allow_self_signed: true,
                    verify_server_cert: false
                }
            },
            pool: {
                min: 1,
                max: 5
            },
            query: {
                logging: {
                    enabled: true,
                    log_query_parameters: true
                }
            },
            security: {
                connection_security: {
                    require_ssl: false
                },
                query_security: {
                    dangerous_query_detection: {
                        action: 'log'
                    }
                }
            }
        },
        
        staging: {
            connection: {
                connectionTimeoutMillis: 20000
            },
            ssl: {
                enabled: true,
                mode: 'require'
            },
            pool: {
                min: 2,
                max: 8
            },
            monitoring: {
                alerts: {
                    conditions: {
                        high_connection_usage: {
                            threshold: 70
                        }
                    }
                }
            }
        },
        
        production: {
            connection: {
                connectionTimeoutMillis: 30000
            },
            ssl: {
                enabled: true,
                mode: 'require',
                certificates: {
                    verify_server_cert: true,
                    verify_hostname: true,
                    allow_self_signed: false
                }
            },
            pool: {
                min: 5,
                max: 20
            },
            query: {
                logging: {
                    log_query_parameters: false
                }
            },
            security: {
                connection_security: {
                    require_ssl: true
                },
                query_security: {
                    dangerous_query_detection: {
                        action: 'block'
                    }
                }
            }
        }
    }
};

/**
 * Get environment-specific database configuration
 * @param {string} environment - Environment name
 * @returns {Object} Merged database configuration
 */
export function getDatabaseConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...connectionConfig };
    const envConfig = baseConfig.environments[environment] || {};
    
    // Merge with Cloudflare configuration if enabled
    if (process.env.CLOUDFLARE_PROXY_ENABLED === 'true') {
        const cloudflareConfig = getCloudflareConfig(environment);
        const sslConfig = getSSLConfig(environment);
        
        // Update connection settings for Cloudflare proxy
        baseConfig.connection.host = cloudflareConfig.proxy.hostname;
        baseConfig.connection.port = cloudflareConfig.proxy.target_port;
        
        // Update SSL settings
        baseConfig.ssl = mergeDeep(baseConfig.ssl, {
            enabled: sslConfig.ssl_mode.mode !== 'off',
            mode: sslConfig.ssl_mode.mode,
            tls: sslConfig.ssl_mode.tls
        });
    }
    
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Generate PostgreSQL connection string
 * @param {Object} config - Database configuration
 * @returns {string} Connection string
 */
export function generateConnectionString(config = connectionConfig) {
    const { connection, ssl } = config;
    
    let connectionString = `postgresql://${connection.user}:${connection.password}@${connection.host}:${connection.port}/${connection.database}`;
    
    // Add SSL parameters
    const params = [];
    
    if (ssl.enabled) {
        params.push(`sslmode=${ssl.mode}`);
        
        if (ssl.certificates.ca_cert) {
            params.push(`sslrootcert=${ssl.certificates.ca_cert}`);
        }
        
        if (ssl.certificates.client_cert) {
            params.push(`sslcert=${ssl.certificates.client_cert}`);
        }
        
        if (ssl.certificates.client_key) {
            params.push(`sslkey=${ssl.certificates.client_key}`);
        }
    }
    
    // Add application name
    if (connection.application_name) {
        params.push(`application_name=${connection.application_name}`);
    }
    
    // Add connection timeout
    if (connection.connectionTimeoutMillis) {
        params.push(`connect_timeout=${Math.floor(connection.connectionTimeoutMillis / 1000)}`);
    }
    
    if (params.length > 0) {
        connectionString += '?' + params.join('&');
    }
    
    return connectionString;
}

/**
 * Validate database configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateDatabaseConfig(config = connectionConfig) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.connection.host) {
        errors.push('Database host is required');
    }

    if (!config.connection.database) {
        errors.push('Database name is required');
    }

    if (!config.connection.user) {
        errors.push('Database user is required');
    }

    if (!config.connection.password) {
        errors.push('Database password is required');
    }

    // Pool configuration validation
    if (config.pool.min > config.pool.max) {
        errors.push('Pool minimum size cannot be greater than maximum size');
    }

    if (config.pool.max > 50) {
        warnings.push('Large pool size may impact performance');
    }

    // SSL validation
    if (process.env.NODE_ENV === 'production' && !config.ssl.enabled) {
        warnings.push('SSL is disabled in production - not recommended');
    }

    // Security validation
    if (config.security.access_control.ip_whitelist.length === 0) {
        warnings.push('No IP whitelist configured - all IPs will be allowed');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Deep merge utility function
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = mergeDeep(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    
    return output;
}

/**
 * Check if value is an object
 * @param {*} item - Item to check
 * @returns {boolean} True if object
 */
function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

export default connectionConfig;

