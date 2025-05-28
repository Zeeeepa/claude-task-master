/**
 * @fileoverview Cloudflare Integration Configuration
 * @description Production-ready Cloudflare tunnel and security configuration for PostgreSQL database access
 */

import dotenv from 'dotenv';
import { log } from '../../../scripts/modules/utils.js';

// Load environment variables
dotenv.config();

/**
 * Cloudflare tunnel configuration for secure database access
 */
export const cloudflareConfig = {
    // Tunnel configuration
    tunnel: {
        name: process.env.CLOUDFLARE_TUNNEL_NAME || 'codegen-taskmaster-db-tunnel',
        uuid: process.env.CLOUDFLARE_TUNNEL_UUID,
        secret: process.env.CLOUDFLARE_TUNNEL_SECRET,
        credentials_file: process.env.CLOUDFLARE_TUNNEL_CREDENTIALS_FILE || './cloudflare/tunnel-credentials.json',
        config_file: process.env.CLOUDFLARE_TUNNEL_CONFIG_FILE || './infrastructure/cloudflare/tunnel_config.yaml',
    },
    
    // Access configuration
    access: {
        domain: process.env.CLOUDFLARE_ACCESS_DOMAIN || 'db.codegen-taskmaster.com',
        zone_id: process.env.CLOUDFLARE_ZONE_ID,
        application_id: process.env.CLOUDFLARE_ACCESS_APP_ID,
        policy_id: process.env.CLOUDFLARE_ACCESS_POLICY_ID,
        
        // Authentication settings
        auth: {
            providers: ['email', 'github', 'google'],
            session_duration: process.env.CLOUDFLARE_SESSION_DURATION || '24h',
            require_mfa: process.env.CLOUDFLARE_REQUIRE_MFA === 'true',
        },
        
        // IP restrictions
        ip_restrictions: {
            enabled: process.env.CLOUDFLARE_IP_RESTRICTIONS_ENABLED === 'true',
            allowed_ips: process.env.CLOUDFLARE_ALLOWED_IPS ? 
                process.env.CLOUDFLARE_ALLOWED_IPS.split(',').map(ip => ip.trim()) : [],
            blocked_countries: process.env.CLOUDFLARE_BLOCKED_COUNTRIES ? 
                process.env.CLOUDFLARE_BLOCKED_COUNTRIES.split(',').map(country => country.trim()) : [],
        }
    },
    
    // Security settings
    security: {
        // WAF (Web Application Firewall) settings
        waf: {
            enabled: process.env.CLOUDFLARE_WAF_ENABLED !== 'false',
            mode: process.env.CLOUDFLARE_WAF_MODE || 'block', // block, challenge, simulate
            sensitivity: process.env.CLOUDFLARE_WAF_SENSITIVITY || 'medium', // low, medium, high
            custom_rules: [
                {
                    name: 'Rate Limit Database Connections',
                    expression: '(http.request.uri.path contains "/db" and rate(1m) > 100)',
                    action: 'block'
                },
                {
                    name: 'Block SQL Injection Attempts',
                    expression: '(any(http.request.body.form.values[*] contains "union select") or any(http.request.body.form.values[*] contains "drop table"))',
                    action: 'block'
                }
            ]
        },
        
        // DDoS protection
        ddos: {
            enabled: process.env.CLOUDFLARE_DDOS_ENABLED !== 'false',
            sensitivity: process.env.CLOUDFLARE_DDOS_SENSITIVITY || 'medium',
            threshold: parseInt(process.env.CLOUDFLARE_DDOS_THRESHOLD) || 1000,
        },
        
        // SSL/TLS settings
        ssl: {
            mode: process.env.CLOUDFLARE_SSL_MODE || 'strict', // off, flexible, full, strict
            min_tls_version: process.env.CLOUDFLARE_MIN_TLS_VERSION || '1.2',
            cipher_suites: ['ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES256-GCM-SHA384'],
            hsts: {
                enabled: process.env.CLOUDFLARE_HSTS_ENABLED !== 'false',
                max_age: parseInt(process.env.CLOUDFLARE_HSTS_MAX_AGE) || 31536000, // 1 year
                include_subdomains: process.env.CLOUDFLARE_HSTS_INCLUDE_SUBDOMAINS !== 'false',
                preload: process.env.CLOUDFLARE_HSTS_PRELOAD === 'true'
            }
        },
        
        // Certificate management
        certificates: {
            auto_renewal: process.env.CLOUDFLARE_CERT_AUTO_RENEWAL !== 'false',
            notification_email: process.env.CLOUDFLARE_CERT_NOTIFICATION_EMAIL,
            renewal_threshold_days: parseInt(process.env.CLOUDFLARE_CERT_RENEWAL_THRESHOLD) || 30,
        }
    },
    
    // Rate limiting configuration
    rate_limiting: {
        enabled: process.env.CLOUDFLARE_RATE_LIMITING_ENABLED !== 'false',
        rules: [
            {
                name: 'Database Connection Rate Limit',
                threshold: parseInt(process.env.CLOUDFLARE_DB_RATE_LIMIT) || 100,
                period: parseInt(process.env.CLOUDFLARE_DB_RATE_PERIOD) || 60, // seconds
                action: 'block',
                timeout: parseInt(process.env.CLOUDFLARE_DB_RATE_TIMEOUT) || 300, // seconds
            },
            {
                name: 'API Rate Limit',
                threshold: parseInt(process.env.CLOUDFLARE_API_RATE_LIMIT) || 1000,
                period: parseInt(process.env.CLOUDFLARE_API_RATE_PERIOD) || 3600, // 1 hour
                action: 'challenge',
                timeout: parseInt(process.env.CLOUDFLARE_API_RATE_TIMEOUT) || 600, // 10 minutes
            }
        ]
    },
    
    // Monitoring and analytics
    monitoring: {
        enabled: process.env.CLOUDFLARE_MONITORING_ENABLED !== 'false',
        analytics: {
            enabled: process.env.CLOUDFLARE_ANALYTICS_ENABLED !== 'false',
            retention_days: parseInt(process.env.CLOUDFLARE_ANALYTICS_RETENTION) || 30,
        },
        alerts: {
            enabled: process.env.CLOUDFLARE_ALERTS_ENABLED !== 'false',
            webhook_url: process.env.CLOUDFLARE_ALERTS_WEBHOOK_URL,
            email_notifications: process.env.CLOUDFLARE_ALERTS_EMAIL ? 
                process.env.CLOUDFLARE_ALERTS_EMAIL.split(',').map(email => email.trim()) : [],
            thresholds: {
                error_rate: parseFloat(process.env.CLOUDFLARE_ERROR_RATE_THRESHOLD) || 5.0, // percentage
                response_time: parseInt(process.env.CLOUDFLARE_RESPONSE_TIME_THRESHOLD) || 5000, // milliseconds
                traffic_spike: parseFloat(process.env.CLOUDFLARE_TRAFFIC_SPIKE_THRESHOLD) || 200.0, // percentage increase
            }
        }
    },
    
    // Caching configuration
    caching: {
        enabled: process.env.CLOUDFLARE_CACHING_ENABLED === 'true',
        ttl: parseInt(process.env.CLOUDFLARE_CACHE_TTL) || 300, // 5 minutes
        bypass_patterns: [
            '/health',
            '/metrics',
            '/admin/*'
        ]
    },
    
    // Load balancing (for multiple database instances)
    load_balancing: {
        enabled: process.env.CLOUDFLARE_LOAD_BALANCING_ENABLED === 'true',
        pool_id: process.env.CLOUDFLARE_LOAD_BALANCER_POOL_ID,
        health_check: {
            enabled: true,
            path: '/health',
            interval: parseInt(process.env.CLOUDFLARE_HEALTH_CHECK_INTERVAL) || 60, // seconds
            timeout: parseInt(process.env.CLOUDFLARE_HEALTH_CHECK_TIMEOUT) || 10, // seconds
            retries: parseInt(process.env.CLOUDFLARE_HEALTH_CHECK_RETRIES) || 3,
            expected_codes: ['200', '201', '202'],
        }
    },
    
    // API credentials
    api: {
        token: process.env.CLOUDFLARE_API_TOKEN,
        email: process.env.CLOUDFLARE_EMAIL,
        key: process.env.CLOUDFLARE_API_KEY,
        account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
    }
};

/**
 * Database connection configuration for Cloudflare tunnel
 */
export const cloudflareDbConfig = {
    host: process.env.CLOUDFLARE_DB_HOST || cloudflareConfig.access.domain,
    port: parseInt(process.env.CLOUDFLARE_DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD,
    
    // SSL configuration for Cloudflare tunnel
    ssl: {
        require: true,
        rejectUnauthorized: process.env.CLOUDFLARE_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.CLOUDFLARE_SSL_CA_CERT,
        cert: process.env.CLOUDFLARE_SSL_CLIENT_CERT,
        key: process.env.CLOUDFLARE_SSL_CLIENT_KEY,
        servername: cloudflareConfig.access.domain,
    },
    
    // Connection pool configuration optimized for Cloudflare
    pool: {
        min: parseInt(process.env.CLOUDFLARE_DB_POOL_MIN) || 2,
        max: parseInt(process.env.CLOUDFLARE_DB_POOL_MAX) || 20,
        idleTimeoutMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_IDLE_TIMEOUT) || 30000,
        acquireTimeoutMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_ACQUIRE_TIMEOUT) || 60000,
        createTimeoutMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_CREATE_TIMEOUT) || 30000,
        destroyTimeoutMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_DESTROY_TIMEOUT) || 5000,
        reapIntervalMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_REAP_INTERVAL) || 1000,
        createRetryIntervalMillis: parseInt(process.env.CLOUDFLARE_DB_POOL_CREATE_RETRY_INTERVAL) || 200,
    },
    
    // Query timeout optimized for network latency
    query_timeout: parseInt(process.env.CLOUDFLARE_DB_QUERY_TIMEOUT) || 120000, // 2 minutes
    
    // Connection retry configuration for network resilience
    retry: {
        max_attempts: parseInt(process.env.CLOUDFLARE_DB_RETRY_MAX_ATTEMPTS) || 5,
        delay_ms: parseInt(process.env.CLOUDFLARE_DB_RETRY_DELAY_MS) || 2000,
        backoff_factor: parseFloat(process.env.CLOUDFLARE_DB_RETRY_BACKOFF_FACTOR) || 2,
        max_delay_ms: parseInt(process.env.CLOUDFLARE_DB_RETRY_MAX_DELAY_MS) || 30000,
    }
};

/**
 * Validate Cloudflare configuration
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];
    
    // Required API credentials
    if (!cloudflareConfig.api.token && !cloudflareConfig.api.key) {
        errors.push('CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY is required');
    }
    
    if (!cloudflareConfig.api.account_id) {
        errors.push('CLOUDFLARE_ACCOUNT_ID is required');
    }
    
    if (!cloudflareConfig.access.zone_id) {
        errors.push('CLOUDFLARE_ZONE_ID is required');
    }
    
    // Tunnel configuration
    if (!cloudflareConfig.tunnel.uuid) {
        warnings.push('CLOUDFLARE_TUNNEL_UUID not set - tunnel may need to be created');
    }
    
    if (!cloudflareConfig.tunnel.secret) {
        warnings.push('CLOUDFLARE_TUNNEL_SECRET not set - tunnel authentication may fail');
    }
    
    // Security validation
    if (cloudflareConfig.security.ssl.mode === 'off') {
        warnings.push('SSL is disabled - this is not recommended for production');
    }
    
    if (!cloudflareConfig.security.ssl.hsts.enabled) {
        warnings.push('HSTS is disabled - consider enabling for better security');
    }
    
    // Rate limiting validation
    if (!cloudflareConfig.rate_limiting.enabled) {
        warnings.push('Rate limiting is disabled - this may expose the database to abuse');
    }
    
    // Database configuration validation
    if (!cloudflareDbConfig.password) {
        errors.push('DB_PASSWORD is required for database connection');
    }
    
    if (!cloudflareDbConfig.ssl.require) {
        warnings.push('SSL is not required for database connections - this is not recommended');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get Cloudflare tunnel connection URL
 * @returns {string} Tunnel connection URL
 */
export function getTunnelConnectionUrl() {
    const protocol = cloudflareConfig.security.ssl.mode !== 'off' ? 'https' : 'http';
    return `${protocol}://${cloudflareConfig.access.domain}`;
}

/**
 * Get database connection string for Cloudflare tunnel
 * @returns {string} Masked connection string
 */
export function getCloudflareConnectionString() {
    const maskedPassword = cloudflareDbConfig.password ? '***' : 'NOT_SET';
    return `postgresql://${cloudflareDbConfig.user}:${maskedPassword}@${cloudflareDbConfig.host}:${cloudflareDbConfig.port}/${cloudflareDbConfig.database}?sslmode=require`;
}

/**
 * Generate Cloudflare tunnel configuration YAML
 * @returns {string} YAML configuration
 */
export function generateTunnelConfigYaml() {
    return `# Cloudflare Tunnel Configuration
# Generated automatically - do not edit manually

tunnel: ${cloudflareConfig.tunnel.uuid}
credentials-file: ${cloudflareConfig.tunnel.credentials_file}

# Ingress rules for database access
ingress:
  # Database access rule
  - hostname: ${cloudflareConfig.access.domain}
    service: tcp://localhost:5432
    originRequest:
      tcpKeepAlive: 30s
      noTLSVerify: false
      connectTimeout: 30s
      tlsTimeout: 10s
      
  # Health check endpoint
  - hostname: ${cloudflareConfig.access.domain}
    path: /health
    service: http://localhost:8080
    
  # Metrics endpoint (internal only)
  - hostname: ${cloudflareConfig.access.domain}
    path: /metrics
    service: http://localhost:8080
    
  # Catch-all rule (required)
  - service: http_status:404

# Logging configuration
logLevel: info
logFile: /var/log/cloudflared.log

# Metrics configuration
metrics: 0.0.0.0:8081

# Auto-update configuration
no-autoupdate: false
`;
}

/**
 * Generate Cloudflare Access policy configuration
 * @returns {Object} Access policy configuration
 */
export function generateAccessPolicyConfig() {
    return {
        name: 'Database Access Policy',
        decision: 'allow',
        include: [
            {
                email_domain: {
                    domain: 'codegen.sh'
                }
            },
            {
                github: {
                    name: 'Zeeeepa',
                    teams: ['developers', 'admins']
                }
            }
        ],
        exclude: [],
        require: cloudflareConfig.access.auth.require_mfa ? [
            {
                mfa: true
            }
        ] : [],
        session_duration: cloudflareConfig.access.auth.session_duration,
        purpose_justification_required: true,
        purpose_justification_prompt: 'Please provide a reason for accessing the database'
    };
}

/**
 * Health check function for Cloudflare tunnel
 * @returns {Promise<Object>} Health status
 */
export async function checkTunnelHealth() {
    try {
        const tunnelUrl = getTunnelConnectionUrl();
        const healthEndpoint = `${tunnelUrl}/health`;
        
        const response = await fetch(healthEndpoint, {
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'Cloudflare-Health-Check/1.0'
            }
        });
        
        return {
            status: 'healthy',
            tunnel_url: tunnelUrl,
            response_time: response.headers.get('x-response-time'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Initialize Cloudflare configuration
 * @returns {Promise<void>}
 */
export async function initializeCloudflareConfig() {
    log('info', 'Initializing Cloudflare configuration...');
    
    // Validate configuration
    const validation = validateCloudflareConfig();
    if (!validation.valid) {
        throw new Error(`Cloudflare configuration invalid: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
        log('warn', `Cloudflare configuration warnings: ${validation.warnings.join(', ')}`);
    }
    
    log('info', `Cloudflare tunnel URL: ${getTunnelConnectionUrl()}`);
    log('info', `Database connection: ${getCloudflareConnectionString()}`);
    
    // Check tunnel health
    const health = await checkTunnelHealth();
    if (health.status === 'healthy') {
        log('info', 'Cloudflare tunnel is healthy');
    } else {
        log('warn', `Cloudflare tunnel health check failed: ${health.error}`);
    }
}

export default cloudflareConfig;

