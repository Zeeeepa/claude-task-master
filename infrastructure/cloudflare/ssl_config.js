/**
 * @fileoverview Cloudflare SSL/TLS Configuration
 * @description SSL/TLS configuration for secure database connections through Cloudflare
 */

/**
 * SSL/TLS Configuration for Cloudflare Database Proxy
 * 
 * This configuration manages SSL certificates, encryption settings, and security policies
 * for database connections routed through Cloudflare.
 */

export const sslConfig = {
    // SSL/TLS Mode Configuration
    ssl_mode: {
        // SSL mode: off, flexible, full, strict
        mode: process.env.CLOUDFLARE_SSL_MODE || 'strict',
        
        // TLS version settings
        tls: {
            min_version: '1.2',
            max_version: '1.3',
            
            // Supported TLS versions
            supported_versions: ['1.2', '1.3'],
            
            // Cipher suites for TLS 1.2
            cipher_suites_tls12: [
                'ECDHE-ECDSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-AES128-SHA256',
                'ECDHE-ECDSA-AES256-SHA384',
                'ECDHE-RSA-AES128-SHA256',
                'ECDHE-RSA-AES256-SHA384'
            ],
            
            // Cipher suites for TLS 1.3
            cipher_suites_tls13: [
                'TLS_AES_128_GCM_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'TLS_CHACHA20_POLY1305_SHA256'
            ]
        },
        
        // SSL verification settings
        verification: {
            verify_origin: true,
            verify_client: false, // Set to true for mutual TLS
            
            // Certificate validation
            validate_hostname: true,
            validate_certificate_chain: true,
            allow_self_signed: process.env.NODE_ENV === 'development',
            
            // OCSP (Online Certificate Status Protocol)
            ocsp_stapling: true,
            ocsp_must_staple: false
        }
    },

    // Certificate Management
    certificates: {
        // Origin certificate (between Cloudflare and origin server)
        origin: {
            type: 'cloudflare_origin', // cloudflare_origin, custom, self_signed
            
            // Cloudflare Origin Certificate
            cloudflare_origin: {
                enabled: true,
                validity_days: 365,
                
                // Certificate details
                common_name: process.env.DB_HOST || 'localhost',
                san_list: [
                    process.env.DB_HOST || 'localhost',
                    process.env.CLOUDFLARE_PROXY_HOSTNAME || 'db-proxy.your-domain.com'
                ],
                
                // Key settings
                key_type: 'rsa', // rsa, ecdsa
                key_size: 2048, // 2048, 4096 for RSA; 256, 384 for ECDSA
                
                // Auto-renewal
                auto_renew: true,
                renew_days_before_expiry: 30
            },
            
            // Custom certificate
            custom: {
                enabled: false,
                certificate_path: process.env.SSL_CERT_PATH,
                private_key_path: process.env.SSL_KEY_PATH,
                ca_bundle_path: process.env.SSL_CA_BUNDLE_PATH,
                
                // Certificate validation
                validate_before_use: true,
                check_expiry: true
            }
        },
        
        // Edge certificate (between client and Cloudflare)
        edge: {
            type: 'universal', // universal, dedicated, custom
            
            // Universal SSL
            universal: {
                enabled: true,
                certificate_authority: 'lets_encrypt', // lets_encrypt, digicert, google
                
                // Domain validation
                validation_method: 'http', // http, dns, email
                validation_records: []
            },
            
            // Dedicated SSL
            dedicated: {
                enabled: false,
                certificate_authority: 'digicert',
                certificate_type: 'dedicated_wildcard',
                
                // Custom settings
                custom_hostname: process.env.CLOUDFLARE_PROXY_HOSTNAME,
                validation_method: 'dns'
            }
        }
    },

    // HSTS (HTTP Strict Transport Security)
    hsts: {
        enabled: true,
        max_age: 31536000, // 1 year in seconds
        include_subdomains: true,
        preload: true,
        
        // HSTS preload list submission
        preload_submission: {
            enabled: false,
            contact_email: process.env.ADMIN_EMAIL
        }
    },

    // Certificate Transparency
    certificate_transparency: {
        enabled: true,
        
        // CT log monitoring
        monitoring: {
            enabled: true,
            alert_on_new_certificates: true,
            notification_email: process.env.SECURITY_EMAIL
        }
    },

    // SSL/TLS Security Headers
    security_headers: {
        // Strict Transport Security
        strict_transport_security: {
            enabled: true,
            max_age: 31536000,
            include_subdomains: true,
            preload: true
        },
        
        // Certificate Transparency
        expect_ct: {
            enabled: true,
            max_age: 86400, // 24 hours
            enforce: true,
            report_uri: process.env.CT_REPORT_URI
        },
        
        // Public Key Pinning (use with caution)
        public_key_pinning: {
            enabled: false,
            pins: [],
            max_age: 5184000, // 60 days
            include_subdomains: false,
            report_only: true,
            report_uri: process.env.HPKP_REPORT_URI
        }
    },

    // SSL/TLS Monitoring and Alerts
    monitoring: {
        // Certificate expiry monitoring
        certificate_expiry: {
            enabled: true,
            check_interval_hours: 24,
            
            // Alert thresholds
            alert_days_before_expiry: [30, 14, 7, 1],
            
            // Notification settings
            notifications: {
                email: process.env.SSL_ALERT_EMAIL,
                webhook: process.env.SSL_ALERT_WEBHOOK,
                slack: process.env.SSL_ALERT_SLACK_WEBHOOK
            }
        },
        
        // SSL/TLS health checks
        health_checks: {
            enabled: true,
            check_interval_minutes: 15,
            
            // Checks to perform
            checks: {
                certificate_validity: true,
                certificate_chain: true,
                cipher_strength: true,
                protocol_version: true,
                revocation_status: true
            },
            
            // Alert conditions
            alert_on_failure: true,
            consecutive_failures_threshold: 3
        },
        
        // SSL Labs integration
        ssl_labs: {
            enabled: false,
            api_endpoint: 'https://api.ssllabs.com/api/v3/',
            
            // Scan settings
            scan_frequency_days: 7,
            target_grade: 'A+',
            alert_on_grade_drop: true
        }
    },

    // Performance Optimization
    performance: {
        // Session resumption
        session_resumption: {
            enabled: true,
            
            // Session tickets
            session_tickets: {
                enabled: true,
                rotation_interval_hours: 24,
                max_lifetime_hours: 168 // 7 days
            },
            
            // Session cache
            session_cache: {
                enabled: true,
                size_mb: 10,
                timeout_minutes: 300 // 5 hours
            }
        },
        
        // OCSP stapling
        ocsp_stapling: {
            enabled: true,
            cache_duration_hours: 24,
            
            // Fallback behavior
            fallback_on_error: true,
            max_response_size_kb: 10
        },
        
        // Early hints
        early_hints: {
            enabled: false, // Not typically used for database connections
            max_hints: 10
        }
    },

    // Environment-specific SSL settings
    environments: {
        development: {
            ssl_mode: {
                mode: 'flexible',
                verification: {
                    allow_self_signed: true,
                    verify_origin: false
                }
            },
            certificates: {
                origin: {
                    type: 'self_signed'
                }
            },
            monitoring: {
                certificate_expiry: {
                    enabled: false
                },
                health_checks: {
                    enabled: false
                }
            }
        },
        
        staging: {
            ssl_mode: {
                mode: 'full'
            },
            certificates: {
                origin: {
                    cloudflare_origin: {
                        validity_days: 90
                    }
                }
            },
            monitoring: {
                certificate_expiry: {
                    alert_days_before_expiry: [7, 1]
                }
            }
        },
        
        production: {
            ssl_mode: {
                mode: 'strict',
                verification: {
                    verify_origin: true,
                    verify_client: false
                }
            },
            certificates: {
                edge: {
                    type: 'dedicated'
                }
            },
            security_headers: {
                public_key_pinning: {
                    enabled: false // Enable only if you understand the risks
                }
            },
            monitoring: {
                ssl_labs: {
                    enabled: true
                }
            }
        }
    }
};

/**
 * Get environment-specific SSL configuration
 * @param {string} environment - Environment name
 * @returns {Object} Merged SSL configuration
 */
export function getSSLConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...sslConfig };
    const envConfig = baseConfig.environments[environment] || {};
    
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Validate SSL configuration
 * @param {Object} config - SSL configuration to validate
 * @returns {Object} Validation result
 */
export function validateSSLConfig(config = sslConfig) {
    const errors = [];
    const warnings = [];

    // SSL mode validation
    const validModes = ['off', 'flexible', 'full', 'strict'];
    if (!validModes.includes(config.ssl_mode.mode)) {
        errors.push(`Invalid SSL mode: ${config.ssl_mode.mode}`);
    }

    // TLS version validation
    if (config.ssl_mode.tls.min_version === '1.0' || config.ssl_mode.tls.min_version === '1.1') {
        warnings.push('TLS 1.0 and 1.1 are deprecated and insecure');
    }

    // Certificate validation
    if (config.certificates.origin.type === 'custom') {
        if (!config.certificates.origin.custom.certificate_path) {
            errors.push('Custom certificate path is required when using custom certificates');
        }
        if (!config.certificates.origin.custom.private_key_path) {
            errors.push('Private key path is required when using custom certificates');
        }
    }

    // HSTS validation
    if (config.hsts.enabled && config.hsts.max_age < 31536000) {
        warnings.push('HSTS max-age should be at least 1 year (31536000 seconds)');
    }

    // Security warnings
    if (config.ssl_mode.mode === 'flexible') {
        warnings.push('Flexible SSL mode is not recommended for production - use Full or Strict');
    }

    if (config.ssl_mode.verification.allow_self_signed && process.env.NODE_ENV === 'production') {
        warnings.push('Self-signed certificates should not be allowed in production');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Generate SSL certificate configuration for PostgreSQL
 * @param {Object} options - Certificate options
 * @returns {Object} PostgreSQL SSL configuration
 */
export function generatePostgreSQLSSLConfig(options = {}) {
    const config = getSSLConfig(options.environment);
    
    return {
        ssl: {
            require: config.ssl_mode.mode !== 'off',
            rejectUnauthorized: config.ssl_mode.mode === 'strict',
            
            // Certificate files (if using custom certificates)
            cert: config.certificates.origin.custom.certificate_path,
            key: config.certificates.origin.custom.private_key_path,
            ca: config.certificates.origin.custom.ca_bundle_path,
            
            // SSL options
            secureProtocol: 'TLSv1_2_method',
            ciphers: config.ssl_mode.tls.cipher_suites_tls12.join(':'),
            
            // Verification options
            checkServerIdentity: config.ssl_mode.verification.validate_hostname,
            
            // Session resumption
            sessionIdContext: 'postgresql-cloudflare-proxy'
        }
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

export default sslConfig;

