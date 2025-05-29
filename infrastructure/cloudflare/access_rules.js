/**
 * @fileoverview Cloudflare Access Rules Configuration
 * @description Security and access control rules for Cloudflare database proxy
 */

/**
 * Cloudflare Access Rules Configuration
 * 
 * This configuration defines security policies, access controls, and rate limiting
 * for database connections through Cloudflare proxy.
 */

export const accessRulesConfig = {
    // IP Access Rules
    ip_access_rules: {
        enabled: process.env.CLOUDFLARE_IP_RULES_ENABLED !== 'false',
        
        // Default action for unmatched IPs
        default_action: 'block', // allow, block, challenge
        
        // Whitelist (allow) rules
        whitelist: {
            enabled: true,
            rules: [
                // Codegen service IPs
                {
                    ip: process.env.CODEGEN_IP_RANGE || '0.0.0.0/0',
                    action: 'allow',
                    description: 'Codegen service access',
                    priority: 1
                },
                
                // Linear webhook IPs
                {
                    ip: '35.231.147.226/32',
                    action: 'allow',
                    description: 'Linear webhook IP',
                    priority: 2
                },
                
                // Claude Code service IPs
                {
                    ip: process.env.CLAUDE_CODE_IP_RANGE || '0.0.0.0/0',
                    action: 'allow',
                    description: 'Claude Code service access',
                    priority: 3
                },
                
                // AgentAPI middleware IPs
                {
                    ip: process.env.AGENTAPI_IP_RANGE || '0.0.0.0/0',
                    action: 'allow',
                    description: 'AgentAPI middleware access',
                    priority: 4
                },
                
                // Development/staging IPs
                {
                    ip: process.env.DEV_IP_RANGE || '192.168.0.0/16',
                    action: 'allow',
                    description: 'Development environment access',
                    priority: 5,
                    enabled: process.env.NODE_ENV !== 'production'
                },
                
                // Office/VPN IPs
                {
                    ip: process.env.OFFICE_IP_RANGE || '10.0.0.0/8',
                    action: 'allow',
                    description: 'Office/VPN access',
                    priority: 6
                }
            ]
        },
        
        // Blacklist (block) rules
        blacklist: {
            enabled: true,
            rules: [
                // Known malicious IPs
                {
                    ip: '0.0.0.0/32',
                    action: 'block',
                    description: 'Blocked malicious IP',
                    priority: 100
                }
            ]
        },
        
        // Challenge rules (CAPTCHA/JS challenge)
        challenge: {
            enabled: true,
            rules: [
                // Suspicious IP ranges
                {
                    ip: process.env.SUSPICIOUS_IP_RANGE || '0.0.0.0/32',
                    action: 'challenge',
                    description: 'Suspicious IP range - require challenge',
                    priority: 50
                }
            ]
        }
    },

    // Geographic Access Rules
    geographic_rules: {
        enabled: process.env.CLOUDFLARE_GEO_RULES_ENABLED !== 'false',
        
        // Country-based access control
        country_access: {
            mode: 'whitelist', // whitelist, blacklist, disabled
            
            // Allowed countries (ISO 3166-1 alpha-2 codes)
            allowed_countries: (process.env.CLOUDFLARE_ALLOWED_COUNTRIES || 'US,CA,GB,DE,FR,AU,JP').split(','),
            
            // Blocked countries
            blocked_countries: (process.env.CLOUDFLARE_BLOCKED_COUNTRIES || '').split(',').filter(c => c.trim()),
            
            // Action for blocked countries
            block_action: 'block', // block, challenge
            
            // Exceptions (IPs that bypass country restrictions)
            exceptions: [
                process.env.CODEGEN_IP_RANGE,
                process.env.CLAUDE_CODE_IP_RANGE,
                process.env.AGENTAPI_IP_RANGE
            ].filter(ip => ip)
        },
        
        // Continent-based rules
        continent_access: {
            enabled: false,
            allowed_continents: ['NA', 'EU', 'AS', 'OC'], // North America, Europe, Asia, Oceania
            blocked_continents: []
        }
    },

    // Rate Limiting Rules
    rate_limiting: {
        enabled: true,
        
        // Global rate limits
        global: {
            enabled: true,
            
            // Connection rate limits
            connections_per_minute: 100,
            connections_per_hour: 1000,
            connections_per_day: 10000,
            
            // Burst allowance
            burst_size: 20,
            
            // Action when limit exceeded
            action: 'block', // block, challenge, log
            timeout_seconds: 300,
            
            // Bypass conditions
            bypass: {
                whitelist_ips: true,
                authenticated_users: true
            }
        },
        
        // Per-IP rate limits
        per_ip: {
            enabled: true,
            
            // Limits per IP address
            connections_per_minute: 10,
            connections_per_hour: 100,
            
            // Progressive penalties
            progressive_penalties: {
                enabled: true,
                
                // Penalty levels
                levels: [
                    {
                        threshold: 50, // connections per hour
                        action: 'challenge',
                        duration_minutes: 15
                    },
                    {
                        threshold: 100,
                        action: 'block',
                        duration_minutes: 60
                    },
                    {
                        threshold: 200,
                        action: 'block',
                        duration_minutes: 1440 // 24 hours
                    }
                ]
            }
        },
        
        // Service-specific rate limits
        service_limits: {
            codegen: {
                enabled: true,
                connections_per_minute: 50,
                connections_per_hour: 500,
                identifier: 'user-agent', // ip, user-agent, custom-header
                identifier_value: 'codegen-bot'
            },
            
            linear_webhooks: {
                enabled: true,
                connections_per_minute: 20,
                connections_per_hour: 200,
                identifier: 'ip',
                allowed_ips: ['35.231.147.226/32']
            },
            
            claude_code: {
                enabled: true,
                connections_per_minute: 30,
                connections_per_hour: 300,
                identifier: 'custom-header',
                header_name: 'X-Claude-Code-Token'
            }
        }
    },

    // Bot Management Rules
    bot_management: {
        enabled: true,
        
        // Bot detection settings
        detection: {
            enabled: true,
            
            // Bot score threshold (0-100, lower = more likely bot)
            score_threshold: 30,
            
            // Actions based on bot score
            actions: {
                definitely_bot: 'block', // score 0-10
                likely_bot: 'challenge', // score 11-30
                possibly_bot: 'log', // score 31-50
                likely_human: 'allow' // score 51-100
            },
            
            // Machine learning model
            ml_model: {
                enabled: true,
                sensitivity: 'medium', // low, medium, high
                update_frequency: 'daily'
            }
        },
        
        // Known good bots (allow list)
        good_bots: {
            enabled: true,
            
            // Verified bots to allow
            verified_bots: [
                'googlebot',
                'bingbot',
                'slackbot',
                'twitterbot',
                'facebookexternalhit'
            ],
            
            // Custom good bot patterns
            custom_patterns: [
                {
                    user_agent: /codegen-bot/i,
                    action: 'allow',
                    description: 'Codegen service bot'
                },
                {
                    user_agent: /linear-webhook/i,
                    action: 'allow',
                    description: 'Linear webhook bot'
                }
            ]
        },
        
        // Bad bot detection
        bad_bots: {
            enabled: true,
            
            // Known bad bot patterns
            patterns: [
                {
                    user_agent: /sqlmap/i,
                    action: 'block',
                    description: 'SQL injection tool'
                },
                {
                    user_agent: /nikto/i,
                    action: 'block',
                    description: 'Web vulnerability scanner'
                },
                {
                    user_agent: /masscan/i,
                    action: 'block',
                    description: 'Port scanner'
                }
            ],
            
            // Behavioral detection
            behavioral: {
                enabled: true,
                
                // Suspicious patterns
                rapid_requests: {
                    threshold: 100, // requests per minute
                    action: 'challenge'
                },
                
                no_javascript: {
                    enabled: false, // Not applicable for database connections
                    action: 'challenge'
                },
                
                suspicious_headers: {
                    enabled: true,
                    action: 'log'
                }
            }
        }
    },

    // DDoS Protection Rules
    ddos_protection: {
        enabled: true,
        
        // Attack detection
        detection: {
            enabled: true,
            
            // Thresholds for attack detection
            thresholds: {
                requests_per_second: 1000,
                unique_ips_per_minute: 500,
                error_rate_percentage: 50
            },
            
            // Detection sensitivity
            sensitivity: 'medium', // low, medium, high
            
            // Automatic mitigation
            auto_mitigation: {
                enabled: true,
                
                // Mitigation actions
                actions: [
                    'rate_limit',
                    'challenge',
                    'block_suspicious_ips'
                ],
                
                // Mitigation duration
                duration_minutes: 30,
                
                // Escalation rules
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            threshold_multiplier: 2,
                            action: 'aggressive_rate_limit',
                            duration_minutes: 60
                        },
                        {
                            threshold_multiplier: 5,
                            action: 'emergency_block',
                            duration_minutes: 120
                        }
                    ]
                }
            }
        },
        
        // Layer 7 DDoS protection
        layer7_protection: {
            enabled: true,
            
            // Application-layer attack detection
            patterns: [
                {
                    name: 'sql_injection_attempt',
                    pattern: /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b)/i,
                    action: 'block',
                    severity: 'high'
                },
                {
                    name: 'connection_flooding',
                    pattern: 'rapid_connection_attempts',
                    threshold: 50, // connections per minute
                    action: 'rate_limit',
                    severity: 'medium'
                }
            ]
        }
    },

    // Custom Security Rules
    custom_rules: {
        enabled: true,
        
        // WAF-style rules for database connections
        rules: [
            {
                name: 'block_sql_injection',
                description: 'Block SQL injection attempts',
                enabled: true,
                
                // Rule conditions
                conditions: [
                    {
                        field: 'user_agent',
                        operator: 'contains',
                        value: 'sqlmap'
                    },
                    {
                        field: 'request_headers',
                        operator: 'contains',
                        value: 'union select'
                    }
                ],
                
                // Rule action
                action: 'block',
                priority: 1
            },
            
            {
                name: 'require_authentication_header',
                description: 'Require authentication header for API access',
                enabled: true,
                
                conditions: [
                    {
                        field: 'request_headers',
                        operator: 'not_contains',
                        value: 'Authorization'
                    },
                    {
                        field: 'ip',
                        operator: 'not_in',
                        value: process.env.TRUSTED_IP_RANGES || ''
                    }
                ],
                
                action: 'challenge',
                priority: 2
            }
        ]
    },

    // Monitoring and Alerting
    monitoring: {
        enabled: true,
        
        // Real-time monitoring
        real_time: {
            enabled: true,
            
            // Metrics to monitor
            metrics: [
                'connection_attempts',
                'blocked_connections',
                'challenged_connections',
                'error_rate',
                'response_time'
            ],
            
            // Alert thresholds
            alerts: {
                high_block_rate: {
                    threshold: 10, // percentage
                    duration_minutes: 5,
                    action: 'notify'
                },
                
                ddos_attack: {
                    threshold: 1000, // requests per minute
                    duration_minutes: 1,
                    action: 'emergency_notify'
                },
                
                geographic_anomaly: {
                    enabled: true,
                    threshold: 'unusual_country_pattern',
                    action: 'log_and_notify'
                }
            }
        },
        
        // Logging configuration
        logging: {
            enabled: true,
            
            // Log levels
            log_level: process.env.CLOUDFLARE_LOG_LEVEL || 'info',
            
            // Events to log
            events: [
                'blocked_requests',
                'challenged_requests',
                'rate_limit_exceeded',
                'ddos_detected',
                'bot_detected',
                'geographic_block'
            ],
            
            // Log destinations
            destinations: {
                cloudflare_logs: true,
                siem: process.env.SIEM_ENDPOINT,
                webhook: process.env.SECURITY_WEBHOOK_URL
            }
        }
    },

    // Environment-specific overrides
    environments: {
        development: {
            ip_access_rules: {
                default_action: 'allow'
            },
            geographic_rules: {
                enabled: false
            },
            rate_limiting: {
                global: {
                    connections_per_minute: 1000
                }
            },
            bot_management: {
                enabled: false
            },
            ddos_protection: {
                enabled: false
            }
        },
        
        staging: {
            rate_limiting: {
                global: {
                    connections_per_minute: 200
                }
            },
            bot_management: {
                detection: {
                    score_threshold: 20
                }
            }
        },
        
        production: {
            ip_access_rules: {
                default_action: 'block'
            },
            bot_management: {
                detection: {
                    score_threshold: 40,
                    sensitivity: 'high'
                }
            },
            ddos_protection: {
                detection: {
                    sensitivity: 'high',
                    auto_mitigation: {
                        enabled: true
                    }
                }
            }
        }
    }
};

/**
 * Get environment-specific access rules configuration
 * @param {string} environment - Environment name
 * @returns {Object} Merged access rules configuration
 */
export function getAccessRulesConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...accessRulesConfig };
    const envConfig = baseConfig.environments[environment] || {};
    
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Validate access rules configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateAccessRulesConfig(config = accessRulesConfig) {
    const errors = [];
    const warnings = [];

    // IP rules validation
    if (config.ip_access_rules.enabled && config.ip_access_rules.whitelist.rules.length === 0) {
        warnings.push('No IP whitelist rules configured - all IPs will be subject to default action');
    }

    // Geographic rules validation
    if (config.geographic_rules.enabled) {
        const allowedCountries = config.geographic_rules.country_access.allowed_countries;
        if (allowedCountries.length === 0) {
            warnings.push('No allowed countries configured - geographic access may be too restrictive');
        }
    }

    // Rate limiting validation
    if (!config.rate_limiting.enabled) {
        warnings.push('Rate limiting is disabled - consider enabling for production');
    }

    // Bot management validation
    if (!config.bot_management.enabled) {
        warnings.push('Bot management is disabled - consider enabling for production');
    }

    // DDoS protection validation
    if (!config.ddos_protection.enabled) {
        warnings.push('DDoS protection is disabled - consider enabling for production');
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

export default accessRulesConfig;

