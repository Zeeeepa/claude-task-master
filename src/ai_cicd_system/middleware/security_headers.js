/**
 * Security Headers Middleware
 * 
 * Implements comprehensive security headers for the AI CI/CD system.
 * Provides protection against common web vulnerabilities.
 */

import { SimpleLogger } from '../utils/simple_logger.js';

export class SecurityHeaders {
    constructor(config = {}) {
        this.config = {
            // Content Security Policy
            csp: {
                enabled: true,
                directives: {
                    'default-src': ["'self'"],
                    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    'style-src': ["'self'", "'unsafe-inline'"],
                    'img-src': ["'self'", 'data:', 'https:'],
                    'font-src': ["'self'"],
                    'connect-src': ["'self'"],
                    'media-src': ["'self'"],
                    'object-src': ["'none'"],
                    'child-src': ["'self'"],
                    'worker-src': ["'self'"],
                    'frame-ancestors': ["'none'"],
                    'base-uri': ["'self'"],
                    'form-action': ["'self'"]
                },
                reportOnly: false,
                reportUri: null,
                ...config.csp
            },
            
            // HTTP Strict Transport Security
            hsts: {
                enabled: true,
                maxAge: 31536000, // 1 year
                includeSubDomains: true,
                preload: true,
                ...config.hsts
            },
            
            // X-Frame-Options
            frameOptions: {
                enabled: true,
                action: 'DENY', // DENY, SAMEORIGIN, or ALLOW-FROM
                ...config.frameOptions
            },
            
            // X-Content-Type-Options
            noSniff: {
                enabled: true,
                ...config.noSniff
            },
            
            // X-XSS-Protection
            xssProtection: {
                enabled: true,
                mode: 'block', // block or sanitize
                ...config.xssProtection
            },
            
            // Referrer Policy
            referrerPolicy: {
                enabled: true,
                policy: 'strict-origin-when-cross-origin',
                ...config.referrerPolicy
            },
            
            // Permissions Policy (formerly Feature Policy)
            permissionsPolicy: {
                enabled: true,
                directives: {
                    'camera': [],
                    'microphone': [],
                    'geolocation': [],
                    'payment': [],
                    'usb': [],
                    'magnetometer': [],
                    'gyroscope': [],
                    'accelerometer': []
                },
                ...config.permissionsPolicy
            },
            
            // Cross-Origin Embedder Policy
            coep: {
                enabled: false,
                policy: 'require-corp',
                ...config.coep
            },
            
            // Cross-Origin Opener Policy
            coop: {
                enabled: true,
                policy: 'same-origin',
                ...config.coop
            },
            
            // Cross-Origin Resource Policy
            corp: {
                enabled: true,
                policy: 'same-origin',
                ...config.corp
            },
            
            // Remove server information
            hideServerInfo: {
                enabled: true,
                ...config.hideServerInfo
            },
            
            // Custom headers
            customHeaders: config.customHeaders || {},
            
            ...config
        };

        this.logger = new SimpleLogger('SecurityHeaders');
    }

    /**
     * Main security headers middleware
     */
    middleware() {
        return (req, res, next) => {
            try {
                // Set Content Security Policy
                if (this.config.csp.enabled) {
                    this._setCSP(res);
                }

                // Set HSTS
                if (this.config.hsts.enabled) {
                    this._setHSTS(res);
                }

                // Set X-Frame-Options
                if (this.config.frameOptions.enabled) {
                    this._setFrameOptions(res);
                }

                // Set X-Content-Type-Options
                if (this.config.noSniff.enabled) {
                    this._setNoSniff(res);
                }

                // Set X-XSS-Protection
                if (this.config.xssProtection.enabled) {
                    this._setXSSProtection(res);
                }

                // Set Referrer Policy
                if (this.config.referrerPolicy.enabled) {
                    this._setReferrerPolicy(res);
                }

                // Set Permissions Policy
                if (this.config.permissionsPolicy.enabled) {
                    this._setPermissionsPolicy(res);
                }

                // Set Cross-Origin Embedder Policy
                if (this.config.coep.enabled) {
                    this._setCOEP(res);
                }

                // Set Cross-Origin Opener Policy
                if (this.config.coop.enabled) {
                    this._setCOOP(res);
                }

                // Set Cross-Origin Resource Policy
                if (this.config.corp.enabled) {
                    this._setCORP(res);
                }

                // Hide server information
                if (this.config.hideServerInfo.enabled) {
                    this._hideServerInfo(res);
                }

                // Set custom headers
                this._setCustomHeaders(res);

                next();

            } catch (error) {
                this.logger.error('Security headers middleware error:', error);
                next(); // Continue even if security headers fail
            }
        };
    }

    /**
     * Set Content Security Policy
     */
    _setCSP(res) {
        const directives = [];
        
        for (const [directive, sources] of Object.entries(this.config.csp.directives)) {
            if (Array.isArray(sources) && sources.length > 0) {
                directives.push(`${directive} ${sources.join(' ')}`);
            } else if (typeof sources === 'string') {
                directives.push(`${directive} ${sources}`);
            }
        }

        const cspValue = directives.join('; ');
        
        if (this.config.csp.reportUri) {
            directives.push(`report-uri ${this.config.csp.reportUri}`);
        }

        const headerName = this.config.csp.reportOnly ? 
            'Content-Security-Policy-Report-Only' : 
            'Content-Security-Policy';
            
        res.setHeader(headerName, cspValue);
    }

    /**
     * Set HTTP Strict Transport Security
     */
    _setHSTS(res) {
        let hstsValue = `max-age=${this.config.hsts.maxAge}`;
        
        if (this.config.hsts.includeSubDomains) {
            hstsValue += '; includeSubDomains';
        }
        
        if (this.config.hsts.preload) {
            hstsValue += '; preload';
        }
        
        res.setHeader('Strict-Transport-Security', hstsValue);
    }

    /**
     * Set X-Frame-Options
     */
    _setFrameOptions(res) {
        res.setHeader('X-Frame-Options', this.config.frameOptions.action);
    }

    /**
     * Set X-Content-Type-Options
     */
    _setNoSniff(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    /**
     * Set X-XSS-Protection
     */
    _setXSSProtection(res) {
        const value = this.config.xssProtection.mode === 'block' ? 
            '1; mode=block' : '1';
        res.setHeader('X-XSS-Protection', value);
    }

    /**
     * Set Referrer Policy
     */
    _setReferrerPolicy(res) {
        res.setHeader('Referrer-Policy', this.config.referrerPolicy.policy);
    }

    /**
     * Set Permissions Policy
     */
    _setPermissionsPolicy(res) {
        const directives = [];
        
        for (const [feature, allowlist] of Object.entries(this.config.permissionsPolicy.directives)) {
            if (Array.isArray(allowlist)) {
                if (allowlist.length === 0) {
                    directives.push(`${feature}=()`);
                } else {
                    const origins = allowlist.map(origin => 
                        origin === 'self' ? '"self"' : origin
                    ).join(' ');
                    directives.push(`${feature}=(${origins})`);
                }
            }
        }
        
        if (directives.length > 0) {
            res.setHeader('Permissions-Policy', directives.join(', '));
        }
    }

    /**
     * Set Cross-Origin Embedder Policy
     */
    _setCOEP(res) {
        res.setHeader('Cross-Origin-Embedder-Policy', this.config.coep.policy);
    }

    /**
     * Set Cross-Origin Opener Policy
     */
    _setCOOP(res) {
        res.setHeader('Cross-Origin-Opener-Policy', this.config.coop.policy);
    }

    /**
     * Set Cross-Origin Resource Policy
     */
    _setCORP(res) {
        res.setHeader('Cross-Origin-Resource-Policy', this.config.corp.policy);
    }

    /**
     * Hide server information
     */
    _hideServerInfo(res) {
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
        res.setHeader('Server', 'AI-CICD-System');
    }

    /**
     * Set custom headers
     */
    _setCustomHeaders(res) {
        for (const [name, value] of Object.entries(this.config.customHeaders)) {
            res.setHeader(name, value);
        }
    }

    /**
     * Create middleware for specific security requirements
     */
    static createSecureAPI(options = {}) {
        const config = {
            csp: {
                directives: {
                    'default-src': ["'none'"],
                    'script-src': ["'none'"],
                    'style-src': ["'none'"],
                    'img-src': ["'none'"],
                    'font-src': ["'none'"],
                    'connect-src': ["'self'"],
                    'media-src': ["'none'"],
                    'object-src': ["'none'"],
                    'child-src': ["'none'"],
                    'worker-src': ["'none'"],
                    'frame-ancestors': ["'none'"],
                    'base-uri': ["'none'"],
                    'form-action': ["'none'"]
                }
            },
            frameOptions: {
                action: 'DENY'
            },
            ...options
        };

        return new SecurityHeaders(config).middleware();
    }

    /**
     * Create middleware for web applications
     */
    static createSecureWeb(options = {}) {
        const config = {
            csp: {
                directives: {
                    'default-src': ["'self'"],
                    'script-src': ["'self'", "'unsafe-inline'"],
                    'style-src': ["'self'", "'unsafe-inline'"],
                    'img-src': ["'self'", 'data:', 'https:'],
                    'font-src': ["'self'", 'https:'],
                    'connect-src': ["'self'"],
                    'media-src': ["'self'"],
                    'object-src': ["'none'"],
                    'child-src': ["'self'"],
                    'worker-src': ["'self'"],
                    'frame-ancestors': ["'self'"],
                    'base-uri': ["'self'"],
                    'form-action': ["'self'"]
                }
            },
            frameOptions: {
                action: 'SAMEORIGIN'
            },
            ...options
        };

        return new SecurityHeaders(config).middleware();
    }

    /**
     * Get current security configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update security configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Security headers configuration updated');
    }

    /**
     * Validate security headers configuration
     */
    validateConfig() {
        const errors = [];

        // Validate CSP directives
        if (this.config.csp.enabled) {
            const validDirectives = [
                'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
                'connect-src', 'media-src', 'object-src', 'child-src', 'worker-src',
                'frame-ancestors', 'base-uri', 'form-action', 'frame-src', 'manifest-src'
            ];

            for (const directive of Object.keys(this.config.csp.directives)) {
                if (!validDirectives.includes(directive)) {
                    errors.push(`Invalid CSP directive: ${directive}`);
                }
            }
        }

        // Validate HSTS max-age
        if (this.config.hsts.enabled && this.config.hsts.maxAge < 300) {
            errors.push('HSTS max-age should be at least 300 seconds');
        }

        // Validate frame options
        const validFrameOptions = ['DENY', 'SAMEORIGIN'];
        if (this.config.frameOptions.enabled && 
            !validFrameOptions.includes(this.config.frameOptions.action)) {
            errors.push(`Invalid frame options action: ${this.config.frameOptions.action}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export default SecurityHeaders;

