/**
 * @fileoverview Cloudflare Proxy Configuration
 * @description Cloudflare proxy setup for secure PostgreSQL database access
 */

/**
 * Cloudflare Proxy Configuration for PostgreSQL Database
 * 
 * This configuration sets up Cloudflare as a proxy for secure external database access.
 * It includes SSL/TLS termination, access rules, and performance optimizations.
 */

export const cloudflareProxyConfig = {
    // Basic proxy settings
    proxy: {
        enabled: process.env.CLOUDFLARE_PROXY_ENABLED === 'true',
        hostname: process.env.CLOUDFLARE_PROXY_HOSTNAME || 'db-proxy.your-domain.com',
        target_host: process.env.DB_HOST || 'localhost',
        target_port: parseInt(process.env.DB_PORT) || 5432,
        protocol: 'tcp',
        
        // Cloudflare-specific settings
        cloudflare: {
            zone_id: process.env.CLOUDFLARE_ZONE_ID,
            api_token: process.env.CLOUDFLARE_API_TOKEN,
            account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
            
            // Spectrum application settings (for TCP proxy)
            spectrum: {
                enabled: true,
                protocol: 'tcp/5432',
                dns_name: process.env.CLOUDFLARE_PROXY_HOSTNAME,
                origin_direct: [`${process.env.DB_HOST}:${process.env.DB_PORT}`],
                
                // Traffic policies
                traffic_type: 'direct',
                proxy_protocol: 'off',
                
                // Edge locations
                edge_ips: {
                    type: 'dynamic',
                    connectivity: 'all'
                }
            }
        }
    },

    // SSL/TLS Configuration
    ssl: {
        enabled: true,
        mode: 'strict', // strict, flexible, full, full_strict
        
        // Certificate settings
        certificate: {
            type: 'universal', // universal, dedicated, custom
            custom_cert_path: process.env.CLOUDFLARE_CUSTOM_CERT_PATH,
            custom_key_path: process.env.CLOUDFLARE_CUSTOM_KEY_PATH,
            
            // Certificate validation
            validate_origin: true,
            min_tls_version: '1.2',
            ciphers: [
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES128-SHA256',
                'ECDHE-RSA-AES256-SHA384'
            ]
        },
        
        // HSTS settings
        hsts: {
            enabled: true,
            max_age: 31536000, // 1 year
            include_subdomains: true,
            preload: true
        }
    },

    // Access Control and Security
    security: {
        // IP whitelisting
        ip_access_rules: {
            enabled: true,
            allowed_ips: (process.env.CLOUDFLARE_ALLOWED_IPS || '').split(',').filter(ip => ip.trim()),
            blocked_ips: (process.env.CLOUDFLARE_BLOCKED_IPS || '').split(',').filter(ip => ip.trim()),
            
            // Geographic restrictions
            country_access: {
                mode: 'allow', // allow, block
                countries: (process.env.CLOUDFLARE_ALLOWED_COUNTRIES || 'US,CA,GB,DE,FR').split(',')
            }
        },
        
        // DDoS protection
        ddos_protection: {
            enabled: true,
            sensitivity: 'medium', // low, medium, high
            
            // Rate limiting
            rate_limiting: {
                enabled: true,
                requests_per_minute: 100,
                burst_size: 20,
                
                // Action when limit exceeded
                action: 'block', // block, challenge, log
                timeout: 300 // seconds
            }
        },
        
        // Bot management
        bot_management: {
            enabled: true,
            fight_mode: false,
            
            // Bot score threshold (0-100, lower = more likely bot)
            score_threshold: 30,
            action: 'challenge' // allow, block, challenge, log
        }
    },

    // Performance and Caching
    performance: {
        // Connection pooling at edge
        connection_pooling: {
            enabled: true,
            max_connections: 100,
            idle_timeout: 300, // seconds
            connection_timeout: 30 // seconds
        },
        
        // Load balancing
        load_balancing: {
            enabled: false, // Enable if multiple database instances
            method: 'round_robin', // round_robin, least_connections, ip_hash
            health_checks: {
                enabled: true,
                interval: 30, // seconds
                timeout: 10, // seconds
                retries: 3,
                
                // Health check configuration
                path: '/health',
                expected_codes: [200],
                method: 'GET'
            }
        },
        
        // Argo Smart Routing
        argo: {
            enabled: process.env.CLOUDFLARE_ARGO_ENABLED === 'true',
            smart_routing: true,
            tiered_caching: false // Not applicable for database connections
        }
    },

    // Monitoring and Logging
    monitoring: {
        // Analytics
        analytics: {
            enabled: true,
            
            // Custom analytics
            custom_events: {
                connection_attempts: true,
                failed_connections: true,
                query_performance: true,
                security_events: true
            }
        },
        
        // Logging
        logging: {
            enabled: true,
            log_level: process.env.CLOUDFLARE_LOG_LEVEL || 'info',
            
            // Log destinations
            destinations: {
                cloudflare_logs: true,
                external_siem: process.env.CLOUDFLARE_EXTERNAL_SIEM_ENABLED === 'true',
                webhook_url: process.env.CLOUDFLARE_LOG_WEBHOOK_URL
            },
            
            // Log retention
            retention_days: 30,
            
            // Fields to log
            fields: [
                'timestamp',
                'client_ip',
                'user_agent',
                'request_uri',
                'response_status',
                'response_time',
                'bytes_sent',
                'bytes_received',
                'security_level',
                'threat_score'
            ]
        },
        
        // Alerts
        alerts: {
            enabled: true,
            
            // Alert conditions
            conditions: {
                high_error_rate: {
                    threshold: 5, // percentage
                    duration: 300 // seconds
                },
                ddos_attack: {
                    threshold: 1000, // requests per minute
                    duration: 60 // seconds
                },
                ssl_certificate_expiry: {
                    days_before_expiry: 30
                }
            },
            
            // Notification channels
            notifications: {
                email: process.env.CLOUDFLARE_ALERT_EMAIL,
                webhook: process.env.CLOUDFLARE_ALERT_WEBHOOK,
                slack: process.env.CLOUDFLARE_ALERT_SLACK_WEBHOOK
            }
        }
    },

    // Environment-specific overrides
    environments: {
        development: {
            ssl: {
                mode: 'flexible'
            },
            security: {
                ip_access_rules: {
                    enabled: false
                },
                ddos_protection: {
                    enabled: false
                }
            }
        },
        
        staging: {
            security: {
                ip_access_rules: {
                    allowed_ips: ['192.168.1.0/24', '10.0.0.0/8']
                }
            },
            monitoring: {
                logging: {
                    log_level: 'debug'
                }
            }
        },
        
        production: {
            ssl: {
                mode: 'strict'
            },
            security: {
                ddos_protection: {
                    sensitivity: 'high'
                },
                bot_management: {
                    fight_mode: true
                }
            },
            performance: {
                argo: {
                    enabled: true
                }
            }
        }
    }
};

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Object} Merged configuration
 */
export function getCloudflareConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...cloudflareProxyConfig };
    const envConfig = baseConfig.environments[environment] || {};
    
    // Deep merge environment-specific config
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Validate Cloudflare configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig(config = cloudflareProxyConfig) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.proxy.hostname) {
        errors.push('Cloudflare proxy hostname is required');
    }

    if (!config.proxy.target_host) {
        errors.push('Target database host is required');
    }

    if (!config.proxy.cloudflare.zone_id) {
        errors.push('Cloudflare Zone ID is required');
    }

    if (!config.proxy.cloudflare.api_token) {
        errors.push('Cloudflare API token is required');
    }

    // Security warnings
    if (!config.ssl.enabled) {
        warnings.push('SSL is disabled - not recommended for production');
    }

    if (!config.security.ip_access_rules.enabled) {
        warnings.push('IP access rules are disabled - consider enabling for production');
    }

    if (config.security.ip_access_rules.allowed_ips.length === 0) {
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

export default cloudflareProxyConfig;

