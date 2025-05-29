/**
 * @fileoverview Cloudflare Proxy Configuration
 * @description Production-ready Cloudflare configuration for secure database access
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Cloudflare configuration for database proxy
 */
export const cloudflareConfig = {
    // Cloudflare Access configuration
    access: {
        enabled: process.env.CLOUDFLARE_ACCESS_ENABLED === 'true',
        team_domain: process.env.CLOUDFLARE_TEAM_DOMAIN,
        application_aud: process.env.CLOUDFLARE_APPLICATION_AUD,
        service_token_id: process.env.CLOUDFLARE_SERVICE_TOKEN_ID,
        service_token_secret: process.env.CLOUDFLARE_SERVICE_TOKEN_SECRET,
        policy_id: process.env.CLOUDFLARE_POLICY_ID,
    },

    // Tunnel configuration
    tunnel: {
        enabled: process.env.CLOUDFLARE_TUNNEL_ENABLED === 'true',
        tunnel_id: process.env.CLOUDFLARE_TUNNEL_ID,
        tunnel_name: process.env.CLOUDFLARE_TUNNEL_NAME || 'taskmaster-db-tunnel',
        tunnel_secret: process.env.CLOUDFLARE_TUNNEL_SECRET,
        connector_id: process.env.CLOUDFLARE_CONNECTOR_ID,
    },

    // Database proxy settings
    proxy: {
        enabled: process.env.CLOUDFLARE_PROXY_ENABLED === 'true',
        hostname: process.env.CLOUDFLARE_PROXY_HOSTNAME,
        port: parseInt(process.env.CLOUDFLARE_PROXY_PORT) || 5432,
        ssl_mode: process.env.CLOUDFLARE_PROXY_SSL_MODE || 'require',
        connection_timeout: parseInt(process.env.CLOUDFLARE_PROXY_TIMEOUT) || 30000,
        max_connections: parseInt(process.env.CLOUDFLARE_PROXY_MAX_CONNECTIONS) || 100,
    },

    // Security settings
    security: {
        ip_whitelist: process.env.CLOUDFLARE_IP_WHITELIST ? 
            process.env.CLOUDFLARE_IP_WHITELIST.split(',').map(ip => ip.trim()) : [],
        rate_limiting: {
            enabled: process.env.CLOUDFLARE_RATE_LIMITING_ENABLED !== 'false',
            requests_per_minute: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_RPM) || 1000,
            burst_size: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_BURST) || 100,
        },
        ddos_protection: {
            enabled: process.env.CLOUDFLARE_DDOS_PROTECTION_ENABLED !== 'false',
            sensitivity: process.env.CLOUDFLARE_DDOS_SENSITIVITY || 'medium',
        },
        waf: {
            enabled: process.env.CLOUDFLARE_WAF_ENABLED !== 'false',
            mode: process.env.CLOUDFLARE_WAF_MODE || 'block',
            custom_rules: process.env.CLOUDFLARE_WAF_CUSTOM_RULES ? 
                JSON.parse(process.env.CLOUDFLARE_WAF_CUSTOM_RULES) : [],
        },
    },

    // Monitoring and analytics
    monitoring: {
        enabled: process.env.CLOUDFLARE_MONITORING_ENABLED !== 'false',
        analytics_enabled: process.env.CLOUDFLARE_ANALYTICS_ENABLED !== 'false',
        log_level: process.env.CLOUDFLARE_LOG_LEVEL || 'info',
        metrics_endpoint: process.env.CLOUDFLARE_METRICS_ENDPOINT,
        alert_webhook: process.env.CLOUDFLARE_ALERT_WEBHOOK,
    },

    // Cache settings (for read queries)
    cache: {
        enabled: process.env.CLOUDFLARE_CACHE_ENABLED === 'true',
        ttl: parseInt(process.env.CLOUDFLARE_CACHE_TTL) || 300, // 5 minutes
        cache_key_prefix: process.env.CLOUDFLARE_CACHE_PREFIX || 'taskmaster:',
        bypass_patterns: process.env.CLOUDFLARE_CACHE_BYPASS ? 
            process.env.CLOUDFLARE_CACHE_BYPASS.split(',').map(pattern => pattern.trim()) : 
            ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'],
    },

    // Load balancing (for multiple database instances)
    load_balancing: {
        enabled: process.env.CLOUDFLARE_LB_ENABLED === 'true',
        pool_id: process.env.CLOUDFLARE_LB_POOL_ID,
        health_check_enabled: process.env.CLOUDFLARE_LB_HEALTH_CHECK_ENABLED !== 'false',
        health_check_interval: parseInt(process.env.CLOUDFLARE_LB_HEALTH_CHECK_INTERVAL) || 60,
        failover_enabled: process.env.CLOUDFLARE_LB_FAILOVER_ENABLED !== 'false',
    },

    // API configuration
    api: {
        token: process.env.CLOUDFLARE_API_TOKEN,
        email: process.env.CLOUDFLARE_EMAIL,
        zone_id: process.env.CLOUDFLARE_ZONE_ID,
        account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
        base_url: process.env.CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4',
    },
};

/**
 * Validate Cloudflare configuration
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];

    // Check if Cloudflare proxy is enabled
    if (!cloudflareConfig.proxy.enabled) {
        warnings.push('Cloudflare proxy is disabled');
        return { valid: true, errors, warnings };
    }

    // Required fields for proxy
    if (!cloudflareConfig.proxy.hostname) {
        errors.push('CLOUDFLARE_PROXY_HOSTNAME is required when proxy is enabled');
    }

    // API configuration validation
    if (!cloudflareConfig.api.token && !cloudflareConfig.api.email) {
        warnings.push('Cloudflare API credentials not configured - management features disabled');
    }

    if (cloudflareConfig.api.token && !cloudflareConfig.api.zone_id) {
        warnings.push('CLOUDFLARE_ZONE_ID not set - some features may not work');
    }

    // Access configuration validation
    if (cloudflareConfig.access.enabled) {
        if (!cloudflareConfig.access.team_domain) {
            errors.push('CLOUDFLARE_TEAM_DOMAIN is required when Access is enabled');
        }
        if (!cloudflareConfig.access.application_aud) {
            errors.push('CLOUDFLARE_APPLICATION_AUD is required when Access is enabled');
        }
    }

    // Tunnel configuration validation
    if (cloudflareConfig.tunnel.enabled) {
        if (!cloudflareConfig.tunnel.tunnel_id) {
            errors.push('CLOUDFLARE_TUNNEL_ID is required when tunnel is enabled');
        }
        if (!cloudflareConfig.tunnel.tunnel_secret) {
            errors.push('CLOUDFLARE_TUNNEL_SECRET is required when tunnel is enabled');
        }
    }

    // Security validation
    if (cloudflareConfig.security.rate_limiting.requests_per_minute > 10000) {
        warnings.push('Rate limit is very high (>10k RPM) - consider reducing for security');
    }

    if (cloudflareConfig.security.ip_whitelist.length === 0) {
        warnings.push('No IP whitelist configured - consider adding trusted IPs');
    }

    // Load balancing validation
    if (cloudflareConfig.load_balancing.enabled && !cloudflareConfig.load_balancing.pool_id) {
        errors.push('CLOUDFLARE_LB_POOL_ID is required when load balancing is enabled');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get Cloudflare proxy connection string
 * @returns {string} Proxy connection string
 */
export function getCloudflareProxyString() {
    if (!cloudflareConfig.proxy.enabled) {
        return 'Cloudflare proxy disabled';
    }

    return `${cloudflareConfig.proxy.hostname}:${cloudflareConfig.proxy.port} (SSL: ${cloudflareConfig.proxy.ssl_mode})`;
}

/**
 * Get Cloudflare tunnel configuration for cloudflared
 * @returns {Object} Tunnel configuration
 */
export function getTunnelConfig() {
    return {
        tunnel: cloudflareConfig.tunnel.tunnel_id,
        'credentials-file': '/etc/cloudflared/credentials.json',
        ingress: [
            {
                hostname: cloudflareConfig.proxy.hostname,
                service: `tcp://localhost:5432`,
                originRequest: {
                    tcpKeepAlive: '30s',
                    noTLSVerify: false,
                }
            },
            {
                service: 'http_status:404'
            }
        ],
        'log-level': cloudflareConfig.monitoring.log_level,
        'metrics': cloudflareConfig.monitoring.metrics_endpoint || '0.0.0.0:8080',
    };
}

/**
 * Get Cloudflare Access JWT validation configuration
 * @returns {Object} JWT validation config
 */
export function getAccessJWTConfig() {
    if (!cloudflareConfig.access.enabled) {
        return null;
    }

    return {
        issuer: `https://${cloudflareConfig.access.team_domain}.cloudflareaccess.com`,
        audience: cloudflareConfig.access.application_aud,
        algorithms: ['RS256'],
        jwksUri: `https://${cloudflareConfig.access.team_domain}.cloudflareaccess.com/cdn-cgi/access/certs`,
    };
}

/**
 * Get Cloudflare API client configuration
 * @returns {Object} API client config
 */
export function getAPIClientConfig() {
    return {
        baseURL: cloudflareConfig.api.base_url,
        headers: {
            'Authorization': cloudflareConfig.api.token ? 
                `Bearer ${cloudflareConfig.api.token}` : 
                undefined,
            'X-Auth-Email': cloudflareConfig.api.email,
            'Content-Type': 'application/json',
        },
        timeout: 30000,
    };
}

/**
 * Generate Cloudflare Worker script for database proxy
 * @returns {string} Worker script
 */
export function generateWorkerScript() {
    return `
// Cloudflare Worker for TaskMaster Database Proxy
// Auto-generated configuration

const CONFIG = {
    DATABASE_HOST: '${process.env.DB_HOST || 'localhost'}',
    DATABASE_PORT: ${process.env.DB_PORT || 5432},
    ALLOWED_IPS: ${JSON.stringify(cloudflareConfig.security.ip_whitelist)},
    RATE_LIMIT_RPM: ${cloudflareConfig.security.rate_limiting.requests_per_minute},
    CACHE_TTL: ${cloudflareConfig.cache.ttl},
    CACHE_ENABLED: ${cloudflareConfig.cache.enabled},
};

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // IP whitelist check
    const clientIP = request.headers.get('CF-Connecting-IP');
    if (CONFIG.ALLOWED_IPS.length > 0 && !CONFIG.ALLOWED_IPS.includes(clientIP)) {
        return new Response('Access denied', { status: 403 });
    }

    // Rate limiting
    const rateLimitKey = \`rate_limit:\${clientIP}\`;
    const currentCount = await RATE_LIMIT_KV.get(rateLimitKey);
    if (currentCount && parseInt(currentCount) > CONFIG.RATE_LIMIT_RPM) {
        return new Response('Rate limit exceeded', { status: 429 });
    }

    // Increment rate limit counter
    await RATE_LIMIT_KV.put(rateLimitKey, (parseInt(currentCount) || 0) + 1, { expirationTtl: 60 });

    // Proxy database connection
    const url = new URL(request.url);
    const targetUrl = \`tcp://\${CONFIG.DATABASE_HOST}:\${CONFIG.DATABASE_PORT}\`;
    
    // Forward request to database
    const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });

    return response;
}
`;
}

export default cloudflareConfig;

