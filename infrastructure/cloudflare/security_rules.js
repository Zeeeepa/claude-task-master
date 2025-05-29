/**
 * @fileoverview Cloudflare Security Rules Configuration
 * @description Access control and security rules for database tunnel protection
 * @version 2.0.0
 * @created 2025-05-28
 */

import crypto from 'crypto';

/**
 * Cloudflare Security Rules Manager
 * Manages access control, rate limiting, and security policies for database access
 */
export class CloudflareSecurityRules {
    constructor(config = {}) {
        this.config = {
            // Zone configuration
            zone_id: config.zone_id || process.env.CLOUDFLARE_ZONE_ID,
            api_token: config.api_token || process.env.CLOUDFLARE_API_TOKEN,
            
            // Domain configuration
            domain: config.domain || process.env.CLOUDFLARE_DOMAIN,
            subdomain: config.subdomain || process.env.CLOUDFLARE_SUBDOMAIN || 'db-api',
            
            // Security settings
            enable_waf: config.enable_waf !== false,
            enable_ddos_protection: config.enable_ddos_protection !== false,
            enable_bot_management: config.enable_bot_management !== false,
            
            // Rate limiting
            rate_limit_threshold: config.rate_limit_threshold || 100,
            rate_limit_period: config.rate_limit_period || 60,
            rate_limit_action: config.rate_limit_action || 'challenge',
            
            // IP allowlist/blocklist
            allowed_ips: config.allowed_ips || [],
            blocked_ips: config.blocked_ips || [],
            allowed_countries: config.allowed_countries || [],
            blocked_countries: config.blocked_countries || [],
            
            // Authentication
            require_auth: config.require_auth !== false,
            auth_methods: config.auth_methods || ['api_key', 'jwt'],
            
            // Logging
            log_level: config.log_level || 'info',
            enable_security_logs: config.enable_security_logs !== false,
            
            ...config
        };
        
        this.rules = new Map();
        this.rulesets = new Map();
    }

    /**
     * Initialize security rules
     * @returns {Promise<Object>} Initialization result
     */
    async initializeSecurityRules() {
        try {
            console.log('🔒 Initializing Cloudflare security rules...');
            
            // Validate configuration
            this._validateConfiguration();
            
            // Create base security rules
            await this._createBaseSecurityRules();
            
            // Setup rate limiting
            await this._setupRateLimiting();
            
            // Configure IP access control
            await this._setupIPAccessControl();
            
            // Setup authentication rules
            await this._setupAuthenticationRules();
            
            // Configure WAF rules
            if (this.config.enable_waf) {
                await this._setupWAFRules();
            }
            
            // Setup bot management
            if (this.config.enable_bot_management) {
                await this._setupBotManagement();
            }
            
            console.log('✅ Security rules initialized successfully');
            
            return {
                success: true,
                rules_count: this.rules.size,
                rulesets_count: this.rulesets.size,
                hostname: `${this.config.subdomain}.${this.config.domain}`
            };
            
        } catch (error) {
            console.error('❌ Failed to initialize security rules:', error.message);
            throw error;
        }
    }

    /**
     * Create base security rules
     * @private
     */
    async _createBaseSecurityRules() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // Block known malicious IPs
        const blockMaliciousIPs = {
            id: 'block_malicious_ips',
            action: 'block',
            expression: `(http.host eq "${hostname}" and ip.src in $malicious_ips)`,
            description: 'Block known malicious IP addresses',
            enabled: true,
            priority: 1
        };
        
        // Block suspicious user agents
        const blockSuspiciousUA = {
            id: 'block_suspicious_ua',
            action: 'block',
            expression: `(http.host eq "${hostname}" and http.user_agent contains "sqlmap" or http.user_agent contains "nmap" or http.user_agent contains "nikto")`,
            description: 'Block suspicious user agents',
            enabled: true,
            priority: 2
        };
        
        // Block SQL injection attempts
        const blockSQLInjection = {
            id: 'block_sql_injection',
            action: 'block',
            expression: `(http.host eq "${hostname}" and (http.request.uri.query contains "union select" or http.request.uri.query contains "drop table" or http.request.uri.query contains "insert into"))`,
            description: 'Block SQL injection attempts',
            enabled: true,
            priority: 3
        };
        
        // Allow health checks
        const allowHealthChecks = {
            id: 'allow_health_checks',
            action: 'allow',
            expression: `(http.host eq "health.${hostname}" and http.request.uri.path eq "/health")`,
            description: 'Allow health check requests',
            enabled: true,
            priority: 0
        };
        
        this.rules.set('block_malicious_ips', blockMaliciousIPs);
        this.rules.set('block_suspicious_ua', blockSuspiciousUA);
        this.rules.set('block_sql_injection', blockSQLInjection);
        this.rules.set('allow_health_checks', allowHealthChecks);
        
        console.log('🛡️ Base security rules created');
    }

    /**
     * Setup rate limiting rules
     * @private
     */
    async _setupRateLimiting() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // Global rate limit
        const globalRateLimit = {
            id: 'global_rate_limit',
            action: this.config.rate_limit_action,
            expression: `(http.host eq "${hostname}")`,
            description: `Global rate limit: ${this.config.rate_limit_threshold} requests per ${this.config.rate_limit_period} seconds`,
            enabled: true,
            priority: 10,
            rate_limit: {
                threshold: this.config.rate_limit_threshold,
                period: this.config.rate_limit_period,
                mitigation_timeout: 600, // 10 minutes
                counting_expression: `(http.host eq "${hostname}")`,
                characteristics: ['ip.src']
            }
        };
        
        // API endpoint specific rate limits
        const apiRateLimit = {
            id: 'api_rate_limit',
            action: 'rate_limit',
            expression: `(http.host eq "${hostname}" and http.request.uri.path matches "^/api/")`,
            description: 'API endpoint rate limiting',
            enabled: true,
            priority: 11,
            rate_limit: {
                threshold: Math.floor(this.config.rate_limit_threshold * 0.8), // 80% of global limit
                period: this.config.rate_limit_period,
                mitigation_timeout: 300, // 5 minutes
                counting_expression: `(http.host eq "${hostname}" and http.request.uri.path matches "^/api/")`,
                characteristics: ['ip.src', 'http.request.headers["authorization"]']
            }
        };
        
        // Database query rate limit (stricter)
        const dbQueryRateLimit = {
            id: 'db_query_rate_limit',
            action: 'rate_limit',
            expression: `(http.host eq "${hostname}" and http.request.uri.path matches "^/api/query")`,
            description: 'Database query rate limiting',
            enabled: true,
            priority: 12,
            rate_limit: {
                threshold: Math.floor(this.config.rate_limit_threshold * 0.5), // 50% of global limit
                period: this.config.rate_limit_period,
                mitigation_timeout: 900, // 15 minutes
                counting_expression: `(http.host eq "${hostname}" and http.request.uri.path matches "^/api/query")`,
                characteristics: ['ip.src', 'http.request.headers["authorization"]']
            }
        };
        
        this.rules.set('global_rate_limit', globalRateLimit);
        this.rules.set('api_rate_limit', apiRateLimit);
        this.rules.set('db_query_rate_limit', dbQueryRateLimit);
        
        console.log('⏱️ Rate limiting rules configured');
    }

    /**
     * Setup IP access control
     * @private
     */
    async _setupIPAccessControl() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // IP allowlist
        if (this.config.allowed_ips.length > 0) {
            const allowedIPsRule = {
                id: 'ip_allowlist',
                action: 'allow',
                expression: `(http.host eq "${hostname}" and ip.src in {${this.config.allowed_ips.map(ip => `"${ip}"`).join(' ')}})`,
                description: 'IP allowlist for database access',
                enabled: true,
                priority: 5
            };
            this.rules.set('ip_allowlist', allowedIPsRule);
        }
        
        // IP blocklist
        if (this.config.blocked_ips.length > 0) {
            const blockedIPsRule = {
                id: 'ip_blocklist',
                action: 'block',
                expression: `(http.host eq "${hostname}" and ip.src in {${this.config.blocked_ips.map(ip => `"${ip}"`).join(' ')}})`,
                description: 'IP blocklist for database access',
                enabled: true,
                priority: 4
            };
            this.rules.set('ip_blocklist', blockedIPsRule);
        }
        
        // Country allowlist
        if (this.config.allowed_countries.length > 0) {
            const allowedCountriesRule = {
                id: 'country_allowlist',
                action: 'allow',
                expression: `(http.host eq "${hostname}" and ip.geoip.country in {${this.config.allowed_countries.map(c => `"${c}"`).join(' ')}})`,
                description: 'Country allowlist for database access',
                enabled: true,
                priority: 6
            };
            this.rules.set('country_allowlist', allowedCountriesRule);
        }
        
        // Country blocklist
        if (this.config.blocked_countries.length > 0) {
            const blockedCountriesRule = {
                id: 'country_blocklist',
                action: 'block',
                expression: `(http.host eq "${hostname}" and ip.geoip.country in {${this.config.blocked_countries.map(c => `"${c}"`).join(' ')}})`,
                description: 'Country blocklist for database access',
                enabled: true,
                priority: 7
            };
            this.rules.set('country_blocklist', blockedCountriesRule);
        }
        
        console.log('🌍 IP and geo access control configured');
    }

    /**
     * Setup authentication rules
     * @private
     */
    async _setupAuthenticationRules() {
        if (!this.config.require_auth) {
            return;
        }
        
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // Require authentication for API endpoints
        const requireAuth = {
            id: 'require_authentication',
            action: 'challenge',
            expression: `(http.host eq "${hostname}" and http.request.uri.path matches "^/api/" and not http.request.headers["authorization"])`,
            description: 'Require authentication for API access',
            enabled: true,
            priority: 15
        };
        
        // Validate API key format
        const validateAPIKey = {
            id: 'validate_api_key',
            action: 'block',
            expression: `(http.host eq "${hostname}" and http.request.headers["authorization"] and not http.request.headers["authorization"] matches "^Bearer [A-Za-z0-9_-]{32,}$")`,
            description: 'Validate API key format',
            enabled: this.config.auth_methods.includes('api_key'),
            priority: 16
        };
        
        // Validate JWT format
        const validateJWT = {
            id: 'validate_jwt',
            action: 'block',
            expression: `(http.host eq "${hostname}" and http.request.headers["authorization"] and http.request.headers["authorization"] contains "Bearer " and not http.request.headers["authorization"] matches "^Bearer [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")`,
            description: 'Validate JWT token format',
            enabled: this.config.auth_methods.includes('jwt'),
            priority: 17
        };
        
        this.rules.set('require_authentication', requireAuth);
        this.rules.set('validate_api_key', validateAPIKey);
        this.rules.set('validate_jwt', validateJWT);
        
        console.log('🔐 Authentication rules configured');
    }

    /**
     * Setup WAF rules
     * @private
     */
    async _setupWAFRules() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // OWASP Core Rule Set
        const owaspRules = {
            id: 'owasp_core_rules',
            action: 'block',
            expression: `(http.host eq "${hostname}" and cf.waf.score gt 50)`,
            description: 'OWASP Core Rule Set protection',
            enabled: true,
            priority: 20
        };
        
        // SQL injection protection
        const sqlInjectionWAF = {
            id: 'waf_sql_injection',
            action: 'block',
            expression: `(http.host eq "${hostname}" and cf.waf.score.sqli gt 20)`,
            description: 'WAF SQL injection protection',
            enabled: true,
            priority: 21
        };
        
        // XSS protection
        const xssProtection = {
            id: 'waf_xss_protection',
            action: 'block',
            expression: `(http.host eq "${hostname}" and cf.waf.score.xss gt 20)`,
            description: 'WAF XSS protection',
            enabled: true,
            priority: 22
        };
        
        // Command injection protection
        const cmdInjectionProtection = {
            id: 'waf_cmd_injection',
            action: 'block',
            expression: `(http.host eq "${hostname}" and cf.waf.score.rce gt 20)`,
            description: 'WAF command injection protection',
            enabled: true,
            priority: 23
        };
        
        this.rules.set('owasp_core_rules', owaspRules);
        this.rules.set('waf_sql_injection', sqlInjectionWAF);
        this.rules.set('waf_xss_protection', xssProtection);
        this.rules.set('waf_cmd_injection', cmdInjectionProtection);
        
        console.log('🛡️ WAF rules configured');
    }

    /**
     * Setup bot management
     * @private
     */
    async _setupBotManagement() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // Block known bad bots
        const blockBadBots = {
            id: 'block_bad_bots',
            action: 'block',
            expression: `(http.host eq "${hostname}" and cf.bot_management.score lt 30)`,
            description: 'Block known bad bots',
            enabled: true,
            priority: 25
        };
        
        // Challenge suspicious bots
        const challengeSuspiciousBots = {
            id: 'challenge_suspicious_bots',
            action: 'challenge',
            expression: `(http.host eq "${hostname}" and cf.bot_management.score lt 50 and cf.bot_management.score ge 30)`,
            description: 'Challenge suspicious bots',
            enabled: true,
            priority: 26
        };
        
        // Allow verified bots
        const allowVerifiedBots = {
            id: 'allow_verified_bots',
            action: 'allow',
            expression: `(http.host eq "${hostname}" and cf.bot_management.verified_bot)`,
            description: 'Allow verified bots (search engines, etc.)',
            enabled: true,
            priority: 24
        };
        
        this.rules.set('block_bad_bots', blockBadBots);
        this.rules.set('challenge_suspicious_bots', challengeSuspiciousBots);
        this.rules.set('allow_verified_bots', allowVerifiedBots);
        
        console.log('🤖 Bot management rules configured');
    }

    /**
     * Deploy rules to Cloudflare
     * @returns {Promise<Object>} Deployment result
     */
    async deployRules() {
        try {
            console.log('🚀 Deploying security rules to Cloudflare...');
            
            const deployedRules = [];
            const errors = [];
            
            for (const [ruleId, rule] of this.rules) {
                try {
                    // In a real implementation, you would make API calls to Cloudflare
                    // This is a simulation for demonstration
                    const deployResult = await this._deployRule(rule);
                    deployedRules.push({ ruleId, ...deployResult });
                    
                } catch (error) {
                    errors.push({ ruleId, error: error.message });
                    console.error(`❌ Failed to deploy rule ${ruleId}:`, error.message);
                }
            }
            
            console.log(`✅ Deployed ${deployedRules.length} rules successfully`);
            if (errors.length > 0) {
                console.warn(`⚠️ ${errors.length} rules failed to deploy`);
            }
            
            return {
                success: errors.length === 0,
                deployed: deployedRules.length,
                failed: errors.length,
                rules: deployedRules,
                errors
            };
            
        } catch (error) {
            console.error('❌ Failed to deploy security rules:', error.message);
            throw error;
        }
    }

    /**
     * Get security rules status
     * @returns {Object} Rules status
     */
    getSecurityStatus() {
        const rulesByPriority = Array.from(this.rules.values())
            .sort((a, b) => a.priority - b.priority);
        
        const enabledRules = rulesByPriority.filter(rule => rule.enabled);
        const disabledRules = rulesByPriority.filter(rule => !rule.enabled);
        
        return {
            total_rules: this.rules.size,
            enabled_rules: enabledRules.length,
            disabled_rules: disabledRules.length,
            hostname: `${this.config.subdomain}.${this.config.domain}`,
            security_features: {
                waf_enabled: this.config.enable_waf,
                bot_management_enabled: this.config.enable_bot_management,
                rate_limiting_enabled: true,
                ip_filtering_enabled: this.config.allowed_ips.length > 0 || this.config.blocked_ips.length > 0,
                geo_filtering_enabled: this.config.allowed_countries.length > 0 || this.config.blocked_countries.length > 0,
                authentication_required: this.config.require_auth
            },
            rules: rulesByPriority.map(rule => ({
                id: rule.id,
                action: rule.action,
                description: rule.description,
                enabled: rule.enabled,
                priority: rule.priority
            }))
        };
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfiguration() {
        const required = ['zone_id', 'api_token', 'domain'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }
        
        // Validate rate limit settings
        if (this.config.rate_limit_threshold <= 0) {
            throw new Error('Rate limit threshold must be greater than 0');
        }
        
        if (this.config.rate_limit_period <= 0) {
            throw new Error('Rate limit period must be greater than 0');
        }
    }

    /**
     * Deploy individual rule (simulation)
     * @private
     */
    async _deployRule(rule) {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // In a real implementation, this would make an actual API call to Cloudflare
        return {
            success: true,
            rule_id: rule.id,
            cloudflare_id: crypto.randomUUID(),
            deployed_at: new Date().toISOString()
        };
    }

    /**
     * Generate security report
     * @returns {Object} Security report
     */
    generateSecurityReport() {
        const status = this.getSecurityStatus();
        
        return {
            report_generated: new Date().toISOString(),
            hostname: status.hostname,
            security_score: this._calculateSecurityScore(status),
            summary: {
                total_rules: status.total_rules,
                enabled_rules: status.enabled_rules,
                security_features_enabled: Object.values(status.security_features).filter(Boolean).length,
                recommendations: this._generateRecommendations(status)
            },
            details: status
        };
    }

    /**
     * Calculate security score
     * @private
     */
    _calculateSecurityScore(status) {
        let score = 0;
        const maxScore = 100;
        
        // Base score for having rules
        if (status.enabled_rules > 0) score += 20;
        
        // Security features
        if (status.security_features.waf_enabled) score += 20;
        if (status.security_features.bot_management_enabled) score += 15;
        if (status.security_features.rate_limiting_enabled) score += 15;
        if (status.security_features.ip_filtering_enabled) score += 10;
        if (status.security_features.geo_filtering_enabled) score += 5;
        if (status.security_features.authentication_required) score += 15;
        
        return Math.min(score, maxScore);
    }

    /**
     * Generate security recommendations
     * @private
     */
    _generateRecommendations(status) {
        const recommendations = [];
        
        if (!status.security_features.waf_enabled) {
            recommendations.push('Enable WAF protection for enhanced security');
        }
        
        if (!status.security_features.bot_management_enabled) {
            recommendations.push('Enable bot management to protect against automated attacks');
        }
        
        if (!status.security_features.ip_filtering_enabled) {
            recommendations.push('Consider implementing IP allowlist for restricted access');
        }
        
        if (!status.security_features.authentication_required) {
            recommendations.push('Enable authentication requirements for API access');
        }
        
        if (status.enabled_rules < 5) {
            recommendations.push('Consider adding more security rules for comprehensive protection');
        }
        
        return recommendations;
    }
}

export default CloudflareSecurityRules;

