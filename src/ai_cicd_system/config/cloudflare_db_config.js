/**
 * @fileoverview Cloudflare Database Configuration
 * @description Configuration for exposing PostgreSQL database to Codegen through Cloudflare
 * @version 2.0.0
 * @created 2025-05-28
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Cloudflare database configuration for Codegen integration
 */
export const CLOUDFLARE_DB_CONFIG = {
    // Database credential configuration
    credential_name: "Database",
    description: "PostgreSQL database for AI CI/CD orchestration system",
    
    // Connection details
    host: process.env.CLOUDFLARE_DB_URL || process.env.DB_HOST || "your-cloudflare-tunnel-url",
    port: parseInt(process.env.CLOUDFLARE_DB_PORT) || parseInt(process.env.DB_PORT) || 5432,
    database_name: process.env.CLOUDFLARE_DB_NAME || process.env.DB_NAME || "codegen-taskmaster-db",
    username: process.env.CLOUDFLARE_DB_USER || process.env.DB_USER || "software_developer",
    password: process.env.CLOUDFLARE_DB_PASSWORD || process.env.DB_PASSWORD,
    
    // SSL configuration
    ssl_mode: process.env.CLOUDFLARE_DB_SSL_MODE || process.env.DB_SSL_MODE || "require",
    
    // Connection pool configuration
    connection_pool: {
        min: parseInt(process.env.CLOUDFLARE_DB_POOL_MIN) || 5,
        max: parseInt(process.env.CLOUDFLARE_DB_POOL_MAX) || 20,
        idle_timeout: parseInt(process.env.CLOUDFLARE_DB_POOL_IDLE_TIMEOUT) || 30000,
        acquire_timeout: parseInt(process.env.CLOUDFLARE_DB_POOL_ACQUIRE_TIMEOUT) || 60000,
        create_timeout: parseInt(process.env.CLOUDFLARE_DB_POOL_CREATE_TIMEOUT) || 30000
    },
    
    // Query configuration
    query_timeout: parseInt(process.env.CLOUDFLARE_DB_QUERY_TIMEOUT) || 30000,
    
    // Cloudflare specific settings
    cloudflare: {
        tunnel_url: process.env.CLOUDFLARE_TUNNEL_URL,
        tunnel_token: process.env.CLOUDFLARE_TUNNEL_TOKEN,
        zone_id: process.env.CLOUDFLARE_ZONE_ID,
        api_token: process.env.CLOUDFLARE_API_TOKEN,
        
        // Access control
        access_policy: {
            enabled: process.env.CLOUDFLARE_ACCESS_ENABLED === 'true',
            policy_id: process.env.CLOUDFLARE_ACCESS_POLICY_ID,
            allowed_emails: process.env.CLOUDFLARE_ALLOWED_EMAILS ? 
                process.env.CLOUDFLARE_ALLOWED_EMAILS.split(',') : [],
            allowed_domains: process.env.CLOUDFLARE_ALLOWED_DOMAINS ? 
                process.env.CLOUDFLARE_ALLOWED_DOMAINS.split(',') : []
        },
        
        // Rate limiting
        rate_limiting: {
            enabled: process.env.CLOUDFLARE_RATE_LIMITING_ENABLED !== 'false',
            requests_per_minute: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_RPM) || 100,
            burst_size: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_BURST) || 20
        }
    },
    
    // Monitoring and logging
    monitoring: {
        enabled: process.env.CLOUDFLARE_DB_MONITORING_ENABLED !== 'false',
        log_queries: process.env.CLOUDFLARE_DB_LOG_QUERIES === 'true',
        log_slow_queries: process.env.CLOUDFLARE_DB_LOG_SLOW_QUERIES !== 'false',
        slow_query_threshold_ms: parseInt(process.env.CLOUDFLARE_DB_SLOW_QUERY_THRESHOLD) || 1000,
        metrics_collection: process.env.CLOUDFLARE_DB_METRICS_COLLECTION !== 'false'
    },
    
    // Security settings
    security: {
        encryption_at_rest: process.env.CLOUDFLARE_DB_ENCRYPTION_AT_REST !== 'false',
        encryption_in_transit: process.env.CLOUDFLARE_DB_ENCRYPTION_IN_TRANSIT !== 'false',
        audit_logging: process.env.CLOUDFLARE_DB_AUDIT_LOGGING !== 'false',
        ip_whitelist: process.env.CLOUDFLARE_DB_IP_WHITELIST ? 
            process.env.CLOUDFLARE_DB_IP_WHITELIST.split(',') : [],
        require_client_certificates: process.env.CLOUDFLARE_DB_REQUIRE_CLIENT_CERTS === 'true'
    }
};

/**
 * Codegen-specific database configuration
 */
export const CODEGEN_DB_CONFIG = {
    // Codegen API integration
    api_endpoint: process.env.CODEGEN_API_ENDPOINT || "https://api.codegen.sh",
    api_key: process.env.CODEGEN_API_KEY,
    
    // Database exposure settings
    expose_to_codegen: process.env.EXPOSE_DB_TO_CODEGEN !== 'false',
    allowed_operations: process.env.CODEGEN_ALLOWED_DB_OPERATIONS ? 
        process.env.CODEGEN_ALLOWED_DB_OPERATIONS.split(',') : 
        ['SELECT', 'INSERT', 'UPDATE'],
    
    // Table access control
    accessible_tables: process.env.CODEGEN_ACCESSIBLE_TABLES ? 
        process.env.CODEGEN_ACCESSIBLE_TABLES.split(',') : [
            'tasks', 'workflows', 'workflow_execution_steps', 'audit_logs', 'audit_summary'
        ],
    
    // View access control
    accessible_views: process.env.CODEGEN_ACCESSIBLE_VIEWS ? 
        process.env.CODEGEN_ACCESSIBLE_VIEWS.split(',') : [
            'v_active_tasks', 'v_task_statistics', 'v_high_priority_tasks',
            'v_active_workflows', 'v_workflow_statistics', 'v_recent_audit_activity'
        ],
    
    // Query limitations
    max_rows_per_query: parseInt(process.env.CODEGEN_MAX_ROWS_PER_QUERY) || 1000,
    max_query_duration_ms: parseInt(process.env.CODEGEN_MAX_QUERY_DURATION) || 30000,
    
    // Caching
    cache_enabled: process.env.CODEGEN_DB_CACHE_ENABLED !== 'false',
    cache_ttl_seconds: parseInt(process.env.CODEGEN_DB_CACHE_TTL) || 300
};

/**
 * Database schema information for Codegen
 */
export const SCHEMA_INFO = {
    version: "2.0.0",
    description: "AI CI/CD orchestration system database schema",
    
    tables: {
        tasks: {
            description: "Enhanced tasks table with CI/CD specific fields",
            primary_key: "id",
            indexes: [
                "idx_tasks_status", "idx_tasks_priority", "idx_tasks_assigned_to",
                "idx_tasks_workflow_id", "idx_tasks_repository_url", "idx_tasks_branch_name"
            ],
            key_columns: [
                "id", "title", "status", "priority", "complexity_score", 
                "repository_url", "branch_name", "pr_number", "assigned_to", "workflow_id"
            ]
        },
        
        workflows: {
            description: "Workflows table for CI/CD orchestration",
            primary_key: "id",
            indexes: [
                "idx_workflows_status", "idx_workflows_trigger_type", "idx_workflows_created_at"
            ],
            key_columns: [
                "id", "name", "status", "trigger_type", "current_step", "total_steps"
            ]
        },
        
        workflow_execution_steps: {
            description: "Detailed workflow step execution tracking",
            primary_key: "id",
            indexes: [
                "idx_workflow_execution_steps_workflow_id", "idx_workflow_execution_steps_status"
            ],
            key_columns: [
                "id", "workflow_id", "step_number", "step_name", "status", "duration_ms"
            ]
        },
        
        audit_logs: {
            description: "Comprehensive audit logging for all system changes",
            primary_key: "id",
            indexes: [
                "idx_audit_logs_entity_type_id", "idx_audit_logs_timestamp", "idx_audit_logs_user_id"
            ],
            key_columns: [
                "id", "entity_type", "entity_id", "action", "user_id", "timestamp", "severity"
            ]
        }
    },
    
    views: {
        v_active_tasks: {
            description: "Active tasks with progress and hierarchy information"
        },
        v_task_statistics: {
            description: "Task statistics grouped by status"
        },
        v_active_workflows: {
            description: "Active workflows with progress information"
        },
        v_recent_audit_activity: {
            description: "Recent audit activity with entity names"
        }
    }
};

/**
 * Validate Cloudflare database configuration
 * @returns {Object} Validation result
 */
export function validateCloudflareConfig() {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!CLOUDFLARE_DB_CONFIG.host || CLOUDFLARE_DB_CONFIG.host === 'your-cloudflare-tunnel-url') {
        errors.push('CLOUDFLARE_DB_URL or DB_HOST is required');
    }
    
    if (!CLOUDFLARE_DB_CONFIG.database_name) {
        errors.push('Database name is required');
    }
    
    if (!CLOUDFLARE_DB_CONFIG.username) {
        errors.push('Database username is required');
    }
    
    if (!CLOUDFLARE_DB_CONFIG.password) {
        warnings.push('Database password is not set');
    }
    
    // Cloudflare specific validation
    if (!CLOUDFLARE_DB_CONFIG.cloudflare.tunnel_url) {
        warnings.push('Cloudflare tunnel URL is not configured');
    }
    
    if (!CLOUDFLARE_DB_CONFIG.cloudflare.api_token) {
        warnings.push('Cloudflare API token is not configured');
    }
    
    // Codegen integration validation
    if (CODEGEN_DB_CONFIG.expose_to_codegen && !CODEGEN_DB_CONFIG.api_key) {
        warnings.push('Codegen API key is not configured but database exposure is enabled');
    }
    
    // Connection pool validation
    const pool = CLOUDFLARE_DB_CONFIG.connection_pool;
    if (pool.min < 0) {
        errors.push('Connection pool minimum must be non-negative');
    }
    
    if (pool.max < pool.min) {
        errors.push('Connection pool maximum must be >= minimum');
    }
    
    if (pool.max > 100) {
        warnings.push('Connection pool maximum is very high (>100)');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get connection string for Cloudflare (with masked password)
 * @returns {string} Masked connection string
 */
export function getCloudflareConnectionString() {
    const maskedPassword = CLOUDFLARE_DB_CONFIG.password ? '***' : 'NOT_SET';
    return `postgresql://${CLOUDFLARE_DB_CONFIG.username}:${maskedPassword}@${CLOUDFLARE_DB_CONFIG.host}:${CLOUDFLARE_DB_CONFIG.port}/${CLOUDFLARE_DB_CONFIG.database_name}`;
}

/**
 * Generate Cloudflare tunnel configuration
 * @returns {Object} Tunnel configuration
 */
export function generateTunnelConfig() {
    return {
        tunnel: CLOUDFLARE_DB_CONFIG.cloudflare.tunnel_token,
        credentials_file: "/etc/cloudflared/credentials.json",
        
        ingress: [
            {
                hostname: CLOUDFLARE_DB_CONFIG.cloudflare.tunnel_url,
                service: `tcp://localhost:${CLOUDFLARE_DB_CONFIG.port}`,
                originRequest: {
                    tcpKeepAlive: "30s",
                    noHappyEyeballs: true
                }
            },
            {
                service: "http_status:404"
            }
        ],
        
        warp_routing: {
            enabled: true
        }
    };
}

/**
 * Generate Cloudflare Access policy configuration
 * @returns {Object} Access policy configuration
 */
export function generateAccessPolicy() {
    const policy = CLOUDFLARE_DB_CONFIG.cloudflare.access_policy;
    
    if (!policy.enabled) {
        return null;
    }
    
    return {
        name: "Database Access Policy",
        decision: "allow",
        include: [
            {
                email: {
                    email: policy.allowed_emails
                }
            },
            {
                email_domain: {
                    domain: policy.allowed_domains
                }
            }
        ],
        require: [],
        exclude: []
    };
}

/**
 * Get database configuration for specific environment
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Object} Environment-specific configuration
 */
export function getEnvironmentConfig(environment = 'production') {
    const baseConfig = { ...CLOUDFLARE_DB_CONFIG };
    
    switch (environment) {
        case 'development':
            return {
                ...baseConfig,
                connection_pool: {
                    ...baseConfig.connection_pool,
                    min: 2,
                    max: 5
                },
                monitoring: {
                    ...baseConfig.monitoring,
                    log_queries: true
                }
            };
            
        case 'staging':
            return {
                ...baseConfig,
                connection_pool: {
                    ...baseConfig.connection_pool,
                    min: 3,
                    max: 10
                }
            };
            
        case 'production':
        default:
            return baseConfig;
    }
}

export default {
    CLOUDFLARE_DB_CONFIG,
    CODEGEN_DB_CONFIG,
    SCHEMA_INFO,
    validateCloudflareConfig,
    getCloudflareConnectionString,
    generateTunnelConfig,
    generateAccessPolicy,
    getEnvironmentConfig
};

