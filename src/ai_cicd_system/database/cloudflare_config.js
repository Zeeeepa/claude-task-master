/**
 * @fileoverview Cloudflare Configuration for Secure Database Exposure
 * @description Production-ready Cloudflare setup for secure PostgreSQL database access
 */

import { dbConfig } from '../config/database_config.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Cloudflare configuration for secure database exposure
 */
export const cloudflareConfig = {
    // Cloudflare Access configuration
    access: {
        enabled: process.env.CLOUDFLARE_ACCESS_ENABLED === 'true',
        applicationId: process.env.CLOUDFLARE_ACCESS_APP_ID,
        domain: process.env.CLOUDFLARE_ACCESS_DOMAIN,
        audienceTag: process.env.CLOUDFLARE_ACCESS_AUDIENCE_TAG,
        
        // JWT validation settings
        jwt: {
            issuer: process.env.CLOUDFLARE_ACCESS_JWT_ISSUER,
            audience: process.env.CLOUDFLARE_ACCESS_JWT_AUDIENCE,
            algorithm: 'RS256',
            clockTolerance: 60, // seconds
        },
        
        // Policy configuration
        policies: {
            // Admin access policy
            admin: {
                name: 'Database Admin Access',
                decision: 'allow',
                rules: [
                    {
                        type: 'email_domain',
                        values: process.env.CLOUDFLARE_ADMIN_EMAIL_DOMAINS?.split(',') || []
                    }
                ]
            },
            
            // API access policy
            api: {
                name: 'Database API Access',
                decision: 'allow',
                rules: [
                    {
                        type: 'service_token',
                        values: process.env.CLOUDFLARE_SERVICE_TOKENS?.split(',') || []
                    }
                ]
            },
            
            // Geographic restrictions
            geographic: {
                name: 'Geographic Restrictions',
                decision: 'allow',
                rules: [
                    {
                        type: 'geo',
                        values: process.env.CLOUDFLARE_ALLOWED_COUNTRIES?.split(',') || ['US', 'CA', 'GB', 'DE']
                    }
                ]
            }
        }
    },
    
    // Rate limiting configuration
    rateLimiting: {
        enabled: process.env.CLOUDFLARE_RATE_LIMITING_ENABLED !== 'false',
        
        // API endpoint rate limits
        api: {
            threshold: parseInt(process.env.CLOUDFLARE_API_RATE_LIMIT) || 100,
            period: parseInt(process.env.CLOUDFLARE_API_RATE_PERIOD) || 60, // seconds
            action: 'block',
            duration: parseInt(process.env.CLOUDFLARE_API_RATE_DURATION) || 300 // seconds
        },
        
        // Database connection rate limits
        database: {
            threshold: parseInt(process.env.CLOUDFLARE_DB_RATE_LIMIT) || 50,
            period: parseInt(process.env.CLOUDFLARE_DB_RATE_PERIOD) || 60,
            action: 'challenge',
            duration: parseInt(process.env.CLOUDFLARE_DB_RATE_DURATION) || 600
        },
        
        // Burst protection
        burst: {
            threshold: parseInt(process.env.CLOUDFLARE_BURST_LIMIT) || 20,
            period: 10, // seconds
            action: 'block',
            duration: 60
        }
    },
    
    // DDoS protection settings
    ddosProtection: {
        enabled: process.env.CLOUDFLARE_DDOS_PROTECTION_ENABLED !== 'false',
        sensitivity: process.env.CLOUDFLARE_DDOS_SENSITIVITY || 'medium', // low, medium, high
        
        // Custom rules for database endpoints
        customRules: [
            {
                name: 'Block suspicious database queries',
                expression: '(http.request.uri.path contains "/api/database" and http.request.method eq "POST" and http.request.body contains "DROP")',
                action: 'block'
            },
            {
                name: 'Rate limit heavy queries',
                expression: '(http.request.uri.path contains "/api/database/query" and http.request.body contains "SELECT" and http.request.body contains "JOIN")',
                action: 'challenge'
            }
        ]
    },
    
    // SSL/TLS configuration
    ssl: {
        mode: process.env.CLOUDFLARE_SSL_MODE || 'strict', // off, flexible, full, strict
        minTlsVersion: process.env.CLOUDFLARE_MIN_TLS_VERSION || '1.2',
        cipherSuites: [
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-RSA-CHACHA20-POLY1305'
        ],
        
        // HSTS settings
        hsts: {
            enabled: process.env.CLOUDFLARE_HSTS_ENABLED !== 'false',
            maxAge: parseInt(process.env.CLOUDFLARE_HSTS_MAX_AGE) || 31536000, // 1 year
            includeSubdomains: process.env.CLOUDFLARE_HSTS_INCLUDE_SUBDOMAINS !== 'false',
            preload: process.env.CLOUDFLARE_HSTS_PRELOAD === 'true'
        }
    },
    
    // WAF (Web Application Firewall) configuration
    waf: {
        enabled: process.env.CLOUDFLARE_WAF_ENABLED !== 'false',
        
        // Managed rulesets
        managedRulesets: [
            'cloudflare_managed_ruleset',
            'cloudflare_owasp_core_ruleset',
            'cloudflare_exposed_credentials_check'
        ],
        
        // Custom rules for database protection
        customRules: [
            {
                name: 'Block SQL injection attempts',
                expression: '(any(http.request.headers["content-type"][*] contains "application/json") and http.request.body contains "UNION") or (http.request.uri.query contains "UNION")',
                action: 'block',
                enabled: true
            },
            {
                name: 'Block unauthorized database access',
                expression: '(http.request.uri.path contains "/api/database" and not any(http.request.headers["authorization"][*] contains "Bearer"))',
                action: 'block',
                enabled: true
            },
            {
                name: 'Monitor admin operations',
                expression: '(http.request.uri.path contains "/api/database/admin")',
                action: 'log',
                enabled: true
            }
        ]
    },
    
    // Caching configuration
    caching: {
        // Cache static assets
        static: {
            enabled: true,
            ttl: 86400, // 24 hours
            patterns: ['*.css', '*.js', '*.png', '*.jpg', '*.gif', '*.ico']
        },
        
        // Cache API responses (with caution)
        api: {
            enabled: process.env.CLOUDFLARE_API_CACHING_ENABLED === 'true',
            ttl: parseInt(process.env.CLOUDFLARE_API_CACHE_TTL) || 300, // 5 minutes
            patterns: ['/api/database/health', '/api/database/metrics'],
            bypassPatterns: ['/api/database/query', '/api/database/execute']
        }
    },
    
    // Analytics and monitoring
    analytics: {
        enabled: process.env.CLOUDFLARE_ANALYTICS_ENABLED !== 'false',
        
        // Web Analytics
        webAnalytics: {
            enabled: true,
            token: process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN
        },
        
        // Security Analytics
        securityAnalytics: {
            enabled: true,
            alertThresholds: {
                blockedRequests: parseInt(process.env.CLOUDFLARE_BLOCKED_REQUESTS_THRESHOLD) || 100,
                rateLimitExceeded: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_THRESHOLD) || 50,
                wafBlocks: parseInt(process.env.CLOUDFLARE_WAF_BLOCKS_THRESHOLD) || 25
            }
        }
    },
    
    // Load balancing for database connections
    loadBalancing: {
        enabled: process.env.CLOUDFLARE_LOAD_BALANCING_ENABLED === 'true',
        
        pools: [
            {
                name: 'primary-database',
                origins: [
                    {
                        name: 'primary-db',
                        address: process.env.DB_PRIMARY_HOST || dbConfig.host,
                        port: process.env.DB_PRIMARY_PORT || dbConfig.port,
                        weight: 1.0,
                        enabled: true
                    }
                ],
                healthCheck: {
                    enabled: true,
                    path: '/health',
                    interval: 60,
                    timeout: 10,
                    retries: 3,
                    expectedCodes: ['200']
                }
            }
        ],
        
        // Failover configuration
        failover: {
            enabled: process.env.CLOUDFLARE_FAILOVER_ENABLED === 'true',
            fallbackPool: 'backup-database',
            sessionAffinity: 'cookie',
            sessionAffinityTtl: 3600
        }
    }
};

/**
 * Cloudflare Worker script for database proxy
 */
export const cloudflareWorkerScript = `
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
    const url = new URL(request.url);
    
    // Security headers
    const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
    };
    
    // CORS headers for API endpoints
    const corsHeaders = {
        'Access-Control-Allow-Origin': '${process.env.CLOUDFLARE_CORS_ORIGIN || '*'}',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Max-Age': '86400'
    };
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: { ...corsHeaders, ...securityHeaders }
        });
    }
    
    // Validate API key
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!apiKey && url.pathname.startsWith('/api/database')) {
        return new Response(JSON.stringify({ error: 'API key required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...securityHeaders }
        });
    }
    
    // Rate limiting check
    const clientIP = request.headers.get('CF-Connecting-IP');
    const rateLimitKey = \`rate_limit:\${clientIP}:\${url.pathname}\`;
    
    // Log request for monitoring
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: request.method,
        url: url.pathname,
        ip: clientIP,
        userAgent: request.headers.get('User-Agent'),
        apiKey: apiKey ? apiKey.substring(0, 8) + '...' : null
    }));
    
    // Proxy to backend
    const backendUrl = '${process.env.CLOUDFLARE_BACKEND_URL || 'https://api.example.com'}' + url.pathname + url.search;
    
    const modifiedRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
    });
    
    try {
        const response = await fetch(modifiedRequest);
        const modifiedResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: { ...response.headers, ...corsHeaders, ...securityHeaders }
        });
        
        return modifiedResponse;
    } catch (error) {
        console.error('Backend request failed:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...securityHeaders }
        });
    }
}
`;

/**
 * Validate Cloudflare configuration
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];
    
    // Check required environment variables
    if (cloudflareConfig.access.enabled) {
        if (!cloudflareConfig.access.applicationId) {
            errors.push('CLOUDFLARE_ACCESS_APP_ID is required when Cloudflare Access is enabled');
        }
        if (!cloudflareConfig.access.domain) {
            errors.push('CLOUDFLARE_ACCESS_DOMAIN is required when Cloudflare Access is enabled');
        }
    }
    
    // Check rate limiting configuration
    if (cloudflareConfig.rateLimiting.api.threshold < 10) {
        warnings.push('API rate limit threshold is very low, may impact legitimate usage');
    }
    
    // Check SSL configuration
    if (cloudflareConfig.ssl.mode !== 'strict') {
        warnings.push('SSL mode is not set to strict, consider upgrading for better security');
    }
    
    // Check WAF configuration
    if (!cloudflareConfig.waf.enabled) {
        warnings.push('WAF is disabled, consider enabling for better security');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Initialize Cloudflare configuration
 */
export async function initializeCloudflareConfig() {
    const validation = validateCloudflareConfig();
    
    if (!validation.valid) {
        throw new Error(`Cloudflare configuration invalid: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
        log('warn', `Cloudflare configuration warnings: ${validation.warnings.join(', ')}`);
    }
    
    log('info', 'Cloudflare configuration initialized successfully');
    
    return {
        config: cloudflareConfig,
        workerScript: cloudflareWorkerScript,
        validation
    };
}

/**
 * Generate Cloudflare deployment configuration
 */
export function generateCloudflareDeploymentConfig() {
    return {
        // Terraform configuration for Cloudflare
        terraform: {
            provider: {
                cloudflare: {
                    api_token: '${var.cloudflare_api_token}'
                }
            },
            
            resource: {
                // Zone settings
                cloudflare_zone_settings_override: {
                    database_zone: {
                        zone_id: '${var.cloudflare_zone_id}',
                        settings: {
                            ssl: cloudflareConfig.ssl.mode,
                            min_tls_version: cloudflareConfig.ssl.minTlsVersion,
                            security_level: 'medium',
                            browser_check: 'on',
                            challenge_ttl: 1800
                        }
                    }
                },
                
                // Access application
                cloudflare_access_application: {
                    database_app: {
                        zone_id: '${var.cloudflare_zone_id}',
                        name: 'Database API Access',
                        domain: '${var.database_domain}',
                        type: 'self_hosted',
                        session_duration: '24h'
                    }
                },
                
                // WAF rules
                cloudflare_ruleset: {
                    database_waf: {
                        zone_id: '${var.cloudflare_zone_id}',
                        name: 'Database WAF Rules',
                        description: 'Custom WAF rules for database protection',
                        kind: 'zone',
                        phase: 'http_request_firewall_custom',
                        rules: cloudflareConfig.waf.customRules.map((rule, index) => ({
                            action: rule.action,
                            expression: rule.expression,
                            description: rule.name,
                            enabled: rule.enabled
                        }))
                    }
                }
            }
        },
        
        // Docker configuration for deployment
        docker: {
            image: 'cloudflare/cloudflared:latest',
            environment: {
                TUNNEL_TOKEN: '${CLOUDFLARE_TUNNEL_TOKEN}',
                TUNNEL_ORIGIN_CERT: '${CLOUDFLARE_ORIGIN_CERT}',
                TUNNEL_HOSTNAME: '${DATABASE_HOSTNAME}',
                TUNNEL_URL: `http://localhost:${dbConfig.port}`
            },
            ports: ['8080:8080'],
            restart: 'unless-stopped'
        }
    };
}

export default {
    cloudflareConfig,
    cloudflareWorkerScript,
    validateCloudflareConfig,
    initializeCloudflareConfig,
    generateCloudflareDeploymentConfig
};

