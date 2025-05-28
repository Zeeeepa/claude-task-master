/**
 * @fileoverview Cloudflare Configuration for Database Integration
 * @description Configuration for Cloudflare Workers, rate limiting, and secure database access
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Cloudflare configuration with environment-based settings
 */
export const cloudflareConfig = {
    // Worker configuration
    worker: {
        url: process.env.CLOUDFLARE_WORKER_URL || '',
        script_name: process.env.CLOUDFLARE_SCRIPT_NAME || 'database-api',
        environment: process.env.CLOUDFLARE_ENVIRONMENT || 'production',
        compatibility_date: process.env.CLOUDFLARE_COMPATIBILITY_DATE || '2024-01-01',
        compatibility_flags: (process.env.CLOUDFLARE_COMPATIBILITY_FLAGS || '').split(',').filter(Boolean),
    },
    
    // Authentication
    auth: {
        api_token: process.env.CLOUDFLARE_API_TOKEN || '',
        account_id: process.env.CLOUDFLARE_ACCOUNT_ID || '',
        zone_id: process.env.CLOUDFLARE_ZONE_ID || '',
        email: process.env.CLOUDFLARE_EMAIL || '',
        global_api_key: process.env.CLOUDFLARE_GLOBAL_API_KEY || '',
    },
    
    // Rate limiting configuration
    rate_limiting: {
        enabled: process.env.CLOUDFLARE_RATE_LIMITING_ENABLED !== 'false',
        requests_per_minute: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_RPM) || 1000,
        burst_limit: parseInt(process.env.CLOUDFLARE_BURST_LIMIT) || 100,
        window_size_seconds: parseInt(process.env.CLOUDFLARE_WINDOW_SIZE) || 60,
        block_duration_seconds: parseInt(process.env.CLOUDFLARE_BLOCK_DURATION) || 300,
        whitelist_ips: (process.env.CLOUDFLARE_WHITELIST_IPS || '').split(',').filter(Boolean),
        blacklist_ips: (process.env.CLOUDFLARE_BLACKLIST_IPS || '').split(',').filter(Boolean),
    },
    
    // DDoS protection
    ddos_protection: {
        enabled: process.env.CLOUDFLARE_DDOS_PROTECTION_ENABLED !== 'false',
        sensitivity: process.env.CLOUDFLARE_DDOS_SENSITIVITY || 'medium', // low, medium, high
        challenge_mode: process.env.CLOUDFLARE_CHALLENGE_MODE || 'js_challenge', // js_challenge, managed_challenge, captcha
        under_attack_mode: process.env.CLOUDFLARE_UNDER_ATTACK_MODE === 'true',
    },
    
    // SSL/TLS configuration
    ssl: {
        mode: process.env.CLOUDFLARE_SSL_MODE || 'full_strict', // off, flexible, full, full_strict
        min_tls_version: process.env.CLOUDFLARE_MIN_TLS_VERSION || '1.2',
        certificate_authority: process.env.CLOUDFLARE_CA || 'lets_encrypt',
        always_use_https: process.env.CLOUDFLARE_ALWAYS_HTTPS !== 'false',
        automatic_https_rewrites: process.env.CLOUDFLARE_AUTO_HTTPS_REWRITES !== 'false',
        hsts: {
            enabled: process.env.CLOUDFLARE_HSTS_ENABLED !== 'false',
            max_age: parseInt(process.env.CLOUDFLARE_HSTS_MAX_AGE) || 31536000, // 1 year
            include_subdomains: process.env.CLOUDFLARE_HSTS_SUBDOMAINS !== 'false',
            preload: process.env.CLOUDFLARE_HSTS_PRELOAD === 'true',
        }
    },
    
    // Caching configuration
    caching: {
        enabled: process.env.CLOUDFLARE_CACHING_ENABLED !== 'false',
        cache_level: process.env.CLOUDFLARE_CACHE_LEVEL || 'aggressive', // aggressive, basic, simplified
        browser_cache_ttl: parseInt(process.env.CLOUDFLARE_BROWSER_CACHE_TTL) || 14400, // 4 hours
        edge_cache_ttl: parseInt(process.env.CLOUDFLARE_EDGE_CACHE_TTL) || 7200, // 2 hours
        always_online: process.env.CLOUDFLARE_ALWAYS_ONLINE !== 'false',
        development_mode: process.env.CLOUDFLARE_DEV_MODE === 'true',
    },
    
    // Performance optimization
    performance: {
        minification: {
            css: process.env.CLOUDFLARE_MINIFY_CSS !== 'false',
            html: process.env.CLOUDFLARE_MINIFY_HTML !== 'false',
            js: process.env.CLOUDFLARE_MINIFY_JS !== 'false',
        },
        compression: {
            brotli: process.env.CLOUDFLARE_BROTLI !== 'false',
            gzip: process.env.CLOUDFLARE_GZIP !== 'false',
        },
        http2: process.env.CLOUDFLARE_HTTP2 !== 'false',
        http3: process.env.CLOUDFLARE_HTTP3 === 'true',
        early_hints: process.env.CLOUDFLARE_EARLY_HINTS === 'true',
    },
    
    // Database proxy configuration
    database_proxy: {
        enabled: process.env.CLOUDFLARE_DB_PROXY_ENABLED === 'true',
        connection_pooling: process.env.CLOUDFLARE_DB_POOLING !== 'false',
        max_connections: parseInt(process.env.CLOUDFLARE_DB_MAX_CONNECTIONS) || 10,
        connection_timeout_ms: parseInt(process.env.CLOUDFLARE_DB_TIMEOUT) || 30000,
        query_timeout_ms: parseInt(process.env.CLOUDFLARE_DB_QUERY_TIMEOUT) || 60000,
        retry_attempts: parseInt(process.env.CLOUDFLARE_DB_RETRY_ATTEMPTS) || 3,
        retry_delay_ms: parseInt(process.env.CLOUDFLARE_DB_RETRY_DELAY) || 1000,
    },
    
    // Monitoring and analytics
    monitoring: {
        analytics_enabled: process.env.CLOUDFLARE_ANALYTICS_ENABLED !== 'false',
        web_analytics_enabled: process.env.CLOUDFLARE_WEB_ANALYTICS_ENABLED === 'true',
        log_retention_days: parseInt(process.env.CLOUDFLARE_LOG_RETENTION) || 30,
        real_user_monitoring: process.env.CLOUDFLARE_RUM_ENABLED === 'true',
        performance_monitoring: process.env.CLOUDFLARE_PERF_MONITORING !== 'false',
    },
    
    // Security headers
    security_headers: {
        content_security_policy: process.env.CLOUDFLARE_CSP || "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        x_frame_options: process.env.CLOUDFLARE_X_FRAME_OPTIONS || 'DENY',
        x_content_type_options: process.env.CLOUDFLARE_X_CONTENT_TYPE_OPTIONS || 'nosniff',
        referrer_policy: process.env.CLOUDFLARE_REFERRER_POLICY || 'strict-origin-when-cross-origin',
        permissions_policy: process.env.CLOUDFLARE_PERMISSIONS_POLICY || 'geolocation=(), microphone=(), camera=()',
    },
    
    // API endpoints configuration
    api_endpoints: {
        base_path: process.env.CLOUDFLARE_API_BASE_PATH || '/api/v1',
        cors_enabled: process.env.CLOUDFLARE_CORS_ENABLED !== 'false',
        cors_origins: (process.env.CLOUDFLARE_CORS_ORIGINS || '*').split(',').filter(Boolean),
        cors_methods: (process.env.CLOUDFLARE_CORS_METHODS || 'GET,POST,PUT,DELETE,OPTIONS').split(',').filter(Boolean),
        cors_headers: (process.env.CLOUDFLARE_CORS_HEADERS || 'Content-Type,Authorization,X-Requested-With').split(',').filter(Boolean),
        max_request_size_mb: parseInt(process.env.CLOUDFLARE_MAX_REQUEST_SIZE) || 10,
        request_timeout_ms: parseInt(process.env.CLOUDFLARE_REQUEST_TIMEOUT) || 30000,
    },
    
    // Environment-specific settings
    environments: {
        development: {
            debug_mode: true,
            verbose_logging: true,
            cache_disabled: true,
            rate_limiting_disabled: true,
        },
        staging: {
            debug_mode: true,
            verbose_logging: false,
            cache_disabled: false,
            rate_limiting_disabled: false,
        },
        production: {
            debug_mode: false,
            verbose_logging: false,
            cache_disabled: false,
            rate_limiting_disabled: false,
        }
    }
};

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Object} Merged configuration
 */
export function getEnvironmentConfig(environment = 'production') {
    const envConfig = cloudflareConfig.environments[environment] || cloudflareConfig.environments.production;
    return {
        ...cloudflareConfig,
        ...envConfig
    };
}

/**
 * Validate Cloudflare configuration
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];
    
    // Required fields for basic functionality
    if (!cloudflareConfig.auth.api_token && !cloudflareConfig.auth.global_api_key) {
        errors.push('Either CLOUDFLARE_API_TOKEN or CLOUDFLARE_GLOBAL_API_KEY is required');
    }
    
    if (!cloudflareConfig.auth.account_id) {
        warnings.push('CLOUDFLARE_ACCOUNT_ID is not set - some features may not work');
    }
    
    if (!cloudflareConfig.worker.url) {
        warnings.push('CLOUDFLARE_WORKER_URL is not set - worker deployment will not be available');
    }
    
    // Rate limiting validation
    if (cloudflareConfig.rate_limiting.requests_per_minute < 1) {
        errors.push('CLOUDFLARE_RATE_LIMIT_RPM must be >= 1');
    }
    
    if (cloudflareConfig.rate_limiting.burst_limit < 1) {
        errors.push('CLOUDFLARE_BURST_LIMIT must be >= 1');
    }
    
    // SSL validation
    const validSslModes = ['off', 'flexible', 'full', 'full_strict'];
    if (!validSslModes.includes(cloudflareConfig.ssl.mode)) {
        errors.push(`Invalid SSL mode: ${cloudflareConfig.ssl.mode}. Must be one of: ${validSslModes.join(', ')}`);
    }
    
    // Database proxy validation
    if (cloudflareConfig.database_proxy.enabled) {
        if (cloudflareConfig.database_proxy.max_connections < 1) {
            errors.push('CLOUDFLARE_DB_MAX_CONNECTIONS must be >= 1');
        }
        
        if (cloudflareConfig.database_proxy.connection_timeout_ms < 1000) {
            warnings.push('CLOUDFLARE_DB_TIMEOUT is very low (<1s)');
        }
    }
    
    // Security validation
    if (cloudflareConfig.api_endpoints.cors_origins.includes('*') && 
        process.env.NODE_ENV === 'production') {
        warnings.push('CORS is set to allow all origins (*) in production - consider restricting');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get Cloudflare API headers
 * @returns {Object} Headers for Cloudflare API requests
 */
export function getCloudflareHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    
    if (cloudflareConfig.auth.api_token) {
        headers['Authorization'] = `Bearer ${cloudflareConfig.auth.api_token}`;
    } else if (cloudflareConfig.auth.global_api_key && cloudflareConfig.auth.email) {
        headers['X-Auth-Email'] = cloudflareConfig.auth.email;
        headers['X-Auth-Key'] = cloudflareConfig.auth.global_api_key;
    }
    
    return headers;
}

/**
 * Get Cloudflare API base URL
 * @returns {string} Base URL for Cloudflare API
 */
export function getCloudflareApiUrl() {
    return 'https://api.cloudflare.com/client/v4';
}

/**
 * Get worker script content for database proxy
 * @returns {string} Worker script content
 */
export function getWorkerScript() {
    return `
/**
 * Cloudflare Worker for Database API Proxy
 * Provides secure, rate-limited access to PostgreSQL database
 */

// Configuration from environment variables
const CONFIG = {
    DATABASE_URL: DATABASE_URL, // Set in worker environment
    RATE_LIMIT_RPM: ${cloudflareConfig.rate_limiting.requests_per_minute},
    BURST_LIMIT: ${cloudflareConfig.rate_limiting.burst_limit},
    MAX_REQUEST_SIZE: ${cloudflareConfig.api_endpoints.max_request_size_mb} * 1024 * 1024,
    REQUEST_TIMEOUT: ${cloudflareConfig.api_endpoints.request_timeout_ms},
    CORS_ORIGINS: ${JSON.stringify(cloudflareConfig.api_endpoints.cors_origins)},
    DEBUG_MODE: ${cloudflareConfig.environments[cloudflareConfig.worker.environment]?.debug_mode || false}
};

// Rate limiting using Durable Objects or KV
class RateLimiter {
    constructor() {
        this.requests = new Map();
    }
    
    async isAllowed(clientId) {
        const now = Date.now();
        const windowStart = now - (60 * 1000); // 1 minute window
        
        // Clean old requests
        const clientRequests = this.requests.get(clientId) || [];
        const recentRequests = clientRequests.filter(time => time > windowStart);
        
        // Check rate limit
        if (recentRequests.length >= CONFIG.RATE_LIMIT_RPM) {
            return false;
        }
        
        // Add current request
        recentRequests.push(now);
        this.requests.set(clientId, recentRequests);
        
        return true;
    }
}

const rateLimiter = new RateLimiter();

// CORS headers
function getCorsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': '${cloudflareConfig.api_endpoints.cors_methods.join(', ')}',
        'Access-Control-Allow-Headers': '${cloudflareConfig.api_endpoints.cors_headers.join(', ')}',
        'Access-Control-Max-Age': '86400',
    };
    
    if (CONFIG.CORS_ORIGINS.includes('*') || CONFIG.CORS_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin || '*';
        headers['Access-Control-Allow-Credentials'] = 'true';
    }
    
    return headers;
}

// Security headers
function getSecurityHeaders() {
    return {
        'Content-Security-Policy': '${cloudflareConfig.security_headers.content_security_policy}',
        'X-Frame-Options': '${cloudflareConfig.security_headers.x_frame_options}',
        'X-Content-Type-Options': '${cloudflareConfig.security_headers.x_content_type_options}',
        'Referrer-Policy': '${cloudflareConfig.security_headers.referrer_policy}',
        'Permissions-Policy': '${cloudflareConfig.security_headers.permissions_policy}',
        'Strict-Transport-Security': 'max-age=${cloudflareConfig.ssl.hsts.max_age}; includeSubDomains${cloudflareConfig.ssl.hsts.preload ? '; preload' : ''}',
    };
}

// Database connection
async function executeQuery(query, params = []) {
    // This would connect to your PostgreSQL database
    // Implementation depends on your database setup
    // You might use a connection pooler like PgBouncer
    
    try {
        // Placeholder for actual database connection
        // In a real implementation, you'd use a PostgreSQL client
        const response = await fetch(CONFIG.DATABASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + DATABASE_API_TOKEN,
            },
            body: JSON.stringify({ query, params }),
        });
        
        if (!response.ok) {
            throw new Error(\`Database query failed: \${response.status}\`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Database error:', error);
        throw error;
    }
}

// Main request handler
async function handleRequest(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: getCorsHeaders(origin)
        });
    }
    
    // Rate limiting
    const clientId = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await rateLimiter.isAllowed(clientId)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
                ...getCorsHeaders(origin),
                ...getSecurityHeaders(),
                'Content-Type': 'application/json',
                'Retry-After': '60'
            }
        });
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
        return new Response(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        }), {
            status: 200,
            headers: {
                ...getCorsHeaders(origin),
                ...getSecurityHeaders(),
                'Content-Type': 'application/json'
            }
        });
    }
    
    // API endpoints
    if (url.pathname.startsWith('${cloudflareConfig.api_endpoints.base_path}')) {
        try {
            // Validate request size
            const contentLength = request.headers.get('Content-Length');
            if (contentLength && parseInt(contentLength) > CONFIG.MAX_REQUEST_SIZE) {
                return new Response(JSON.stringify({ error: 'Request too large' }), {
                    status: 413,
                    headers: {
                        ...getCorsHeaders(origin),
                        ...getSecurityHeaders(),
                        'Content-Type': 'application/json'
                    }
                });
            }
            
            // Parse request body
            const body = request.method !== 'GET' ? await request.json() : {};
            
            // Route to appropriate handler
            const path = url.pathname.replace('${cloudflareConfig.api_endpoints.base_path}', '');
            const result = await routeRequest(path, request.method, body, url.searchParams);
            
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: {
                    ...getCorsHeaders(origin),
                    ...getSecurityHeaders(),
                    'Content-Type': 'application/json'
                }
            });
            
        } catch (error) {
            console.error('API error:', error);
            return new Response(JSON.stringify({ 
                error: 'Internal server error',
                message: CONFIG.DEBUG_MODE ? error.message : 'An error occurred'
            }), {
                status: 500,
                headers: {
                    ...getCorsHeaders(origin),
                    ...getSecurityHeaders(),
                    'Content-Type': 'application/json'
                }
            });
        }
    }
    
    // Default response
    return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: {
            ...getCorsHeaders(origin),
            ...getSecurityHeaders(),
            'Content-Type': 'application/json'
        }
    });
}

// Route requests to appropriate handlers
async function routeRequest(path, method, body, params) {
    switch (path) {
        case '/tasks':
            return await handleTasks(method, body, params);
        case '/workflows':
            return await handleWorkflows(method, body, params);
        case '/integrations':
            return await handleIntegrations(method, body, params);
        case '/logs':
            return await handleLogs(method, body, params);
        case '/templates':
            return await handleTemplates(method, body, params);
        case '/deployments':
            return await handleDeployments(method, body, params);
        default:
            throw new Error('Endpoint not found');
    }
}

// Handler functions for each endpoint
async function handleTasks(method, body, params) {
    switch (method) {
        case 'GET':
            const query = 'SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100';
            return await executeQuery(query);
        case 'POST':
            const insertQuery = \`
                INSERT INTO tasks (title, description, type, priority, requirements)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            \`;
            return await executeQuery(insertQuery, [
                body.title, body.description, body.type, body.priority, JSON.stringify(body.requirements)
            ]);
        default:
            throw new Error('Method not allowed');
    }
}

async function handleWorkflows(method, body, params) {
    // Implementation for workflow endpoints
    return { message: 'Workflows endpoint' };
}

async function handleIntegrations(method, body, params) {
    // Implementation for integration endpoints
    return { message: 'Integrations endpoint' };
}

async function handleLogs(method, body, params) {
    // Implementation for logs endpoints
    return { message: 'Logs endpoint' };
}

async function handleTemplates(method, body, params) {
    // Implementation for templates endpoints
    return { message: 'Templates endpoint' };
}

async function handleDeployments(method, body, params) {
    // Implementation for deployments endpoints
    return { message: 'Deployments endpoint' };
}

// Event listener
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
`;
}

/**
 * Generate wrangler.toml configuration
 * @returns {string} Wrangler configuration content
 */
export function getWranglerConfig() {
    return `
name = "${cloudflareConfig.worker.script_name}"
main = "src/worker.js"
compatibility_date = "${cloudflareConfig.worker.compatibility_date}"
compatibility_flags = [${cloudflareConfig.worker.compatibility_flags.map(f => `"${f}"`).join(', ')}]

[env.${cloudflareConfig.worker.environment}]
account_id = "${cloudflareConfig.auth.account_id}"
zone_id = "${cloudflareConfig.auth.zone_id}"

# Environment variables
[env.${cloudflareConfig.worker.environment}.vars]
ENVIRONMENT = "${cloudflareConfig.worker.environment}"
DEBUG_MODE = "${cloudflareConfig.environments[cloudflareConfig.worker.environment]?.debug_mode || false}"

# Secrets (set via wrangler secret put)
# DATABASE_URL
# DATABASE_API_TOKEN

# KV Namespaces for rate limiting
[[env.${cloudflareConfig.worker.environment}.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"

# Durable Objects for advanced rate limiting
[[env.${cloudflareConfig.worker.environment}.durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

# Routes
[[env.${cloudflareConfig.worker.environment}.routes]]
pattern = "${cloudflareConfig.worker.url}/*"
zone_id = "${cloudflareConfig.auth.zone_id}"
`;
}

export default cloudflareConfig;

