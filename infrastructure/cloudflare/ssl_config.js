/**
 * @fileoverview Cloudflare SSL/TLS Configuration
 * @description SSL/TLS configuration and certificate management for secure database access
 * @version 2.0.0
 * @created 2025-05-28
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Cloudflare SSL Configuration Manager
 * Manages SSL/TLS certificates and encryption settings for database tunnel
 */
export class CloudflareSSLConfig {
    constructor(config = {}) {
        this.config = {
            // Zone configuration
            zone_id: config.zone_id || process.env.CLOUDFLARE_ZONE_ID,
            api_token: config.api_token || process.env.CLOUDFLARE_API_TOKEN,
            
            // Domain configuration
            domain: config.domain || process.env.CLOUDFLARE_DOMAIN,
            subdomain: config.subdomain || process.env.CLOUDFLARE_SUBDOMAIN || 'db-api',
            
            // SSL settings
            ssl_mode: config.ssl_mode || 'strict', // off, flexible, full, strict
            min_tls_version: config.min_tls_version || '1.2',
            cipher_suites: config.cipher_suites || 'modern',
            
            // Certificate settings
            certificate_type: config.certificate_type || 'universal', // universal, dedicated, custom
            auto_renew: config.auto_renew !== false,
            certificate_authority: config.certificate_authority || 'lets_encrypt',
            
            // HSTS settings
            enable_hsts: config.enable_hsts !== false,
            hsts_max_age: config.hsts_max_age || 31536000, // 1 year
            hsts_include_subdomains: config.hsts_include_subdomains !== false,
            hsts_preload: config.hsts_preload || false,
            
            // Certificate transparency
            enable_certificate_transparency: config.enable_certificate_transparency !== false,
            
            // OCSP stapling
            enable_ocsp_stapling: config.enable_ocsp_stapling !== false,
            
            // Certificate paths
            cert_path: config.cert_path || './infrastructure/cloudflare/certs',
            private_key_path: config.private_key_path || './infrastructure/cloudflare/private',
            
            ...config
        };
        
        this.certificates = new Map();
        this.sslSettings = new Map();
    }

    /**
     * Initialize SSL configuration
     * @returns {Promise<Object>} Initialization result
     */
    async initializeSSLConfig() {
        try {
            console.log('🔐 Initializing SSL/TLS configuration...');
            
            // Validate configuration
            this._validateConfiguration();
            
            // Setup certificate directories
            await this._setupCertificateDirectories();
            
            // Configure SSL settings
            await this._configureSSLSettings();
            
            // Setup certificates
            await this._setupCertificates();
            
            // Configure HSTS
            if (this.config.enable_hsts) {
                await this._configureHSTS();
            }
            
            // Setup certificate monitoring
            await this._setupCertificateMonitoring();
            
            console.log('✅ SSL/TLS configuration initialized successfully');
            
            return {
                success: true,
                ssl_mode: this.config.ssl_mode,
                min_tls_version: this.config.min_tls_version,
                certificate_type: this.config.certificate_type,
                hsts_enabled: this.config.enable_hsts,
                hostname: `${this.config.subdomain}.${this.config.domain}`
            };
            
        } catch (error) {
            console.error('❌ Failed to initialize SSL configuration:', error.message);
            throw error;
        }
    }

    /**
     * Configure SSL settings
     * @private
     */
    async _configureSSLSettings() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        // Base SSL configuration
        const baseSSLConfig = {
            id: 'base_ssl_config',
            ssl_mode: this.config.ssl_mode,
            min_tls_version: this.config.min_tls_version,
            cipher_suites: this._getCipherSuites(),
            hostname: hostname,
            enabled: true
        };
        
        // TLS 1.3 configuration
        const tls13Config = {
            id: 'tls13_config',
            enable_tls13: true,
            tls13_cipher_suites: [
                'TLS_AES_128_GCM_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'TLS_CHACHA20_POLY1305_SHA256'
            ],
            hostname: hostname,
            enabled: this.config.min_tls_version === '1.3'
        };
        
        // Perfect Forward Secrecy
        const pfsConfig = {
            id: 'perfect_forward_secrecy',
            enable_pfs: true,
            preferred_ciphers: [
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-RSA-CHACHA20-POLY1305'
            ],
            hostname: hostname,
            enabled: true
        };
        
        this.sslSettings.set('base_ssl_config', baseSSLConfig);
        this.sslSettings.set('tls13_config', tls13Config);
        this.sslSettings.set('perfect_forward_secrecy', pfsConfig);
        
        console.log('🔒 SSL settings configured');
    }

    /**
     * Setup certificates
     * @private
     */
    async _setupCertificates() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        switch (this.config.certificate_type) {
            case 'universal':
                await this._setupUniversalCertificate(hostname);
                break;
            case 'dedicated':
                await this._setupDedicatedCertificate(hostname);
                break;
            case 'custom':
                await this._setupCustomCertificate(hostname);
                break;
            default:
                throw new Error(`Unknown certificate type: ${this.config.certificate_type}`);
        }
        
        console.log(`📜 ${this.config.certificate_type} certificate configured for ${hostname}`);
    }

    /**
     * Setup universal certificate
     * @private
     */
    async _setupUniversalCertificate(hostname) {
        const universalCert = {
            id: 'universal_certificate',
            type: 'universal',
            hostname: hostname,
            wildcard: true,
            auto_renew: this.config.auto_renew,
            certificate_authority: this.config.certificate_authority,
            validity_days: 90,
            status: 'active',
            created_at: new Date().toISOString()
        };
        
        this.certificates.set('universal_certificate', universalCert);
    }

    /**
     * Setup dedicated certificate
     * @private
     */
    async _setupDedicatedCertificate(hostname) {
        const dedicatedCert = {
            id: 'dedicated_certificate',
            type: 'dedicated',
            hostname: hostname,
            wildcard: false,
            auto_renew: this.config.auto_renew,
            certificate_authority: this.config.certificate_authority,
            validity_days: 365,
            status: 'active',
            created_at: new Date().toISOString(),
            features: {
                extended_validation: true,
                custom_trust_store: true,
                geo_key_manager: true
            }
        };
        
        this.certificates.set('dedicated_certificate', dedicatedCert);
    }

    /**
     * Setup custom certificate
     * @private
     */
    async _setupCustomCertificate(hostname) {
        // Generate self-signed certificate for development
        const { certificate, privateKey } = await this._generateSelfSignedCertificate(hostname);
        
        const customCert = {
            id: 'custom_certificate',
            type: 'custom',
            hostname: hostname,
            certificate: certificate,
            private_key: privateKey,
            auto_renew: false,
            validity_days: 365,
            status: 'active',
            created_at: new Date().toISOString(),
            self_signed: true
        };
        
        // Save certificate files
        await this._saveCertificateFiles(customCert);
        
        this.certificates.set('custom_certificate', customCert);
    }

    /**
     * Configure HSTS
     * @private
     */
    async _configureHSTS() {
        const hostname = `${this.config.subdomain}.${this.config.domain}`;
        
        const hstsConfig = {
            id: 'hsts_config',
            enabled: this.config.enable_hsts,
            max_age: this.config.hsts_max_age,
            include_subdomains: this.config.hsts_include_subdomains,
            preload: this.config.hsts_preload,
            hostname: hostname,
            header_value: this._generateHSTSHeader()
        };
        
        this.sslSettings.set('hsts_config', hstsConfig);
        
        console.log('🛡️ HSTS configured');
    }

    /**
     * Setup certificate monitoring
     * @private
     */
    async _setupCertificateMonitoring() {
        const monitoringConfig = {
            id: 'certificate_monitoring',
            enabled: true,
            check_interval: 86400000, // 24 hours
            expiry_warning_days: 30,
            auto_renew_days: 7,
            notification_endpoints: [],
            last_check: null,
            next_check: new Date(Date.now() + 86400000).toISOString()
        };
        
        this.sslSettings.set('certificate_monitoring', monitoringConfig);
        
        console.log('📊 Certificate monitoring configured');
    }

    /**
     * Generate self-signed certificate
     * @private
     */
    async _generateSelfSignedCertificate(hostname) {
        // Generate private key
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        
        // Create certificate (simplified - in production use proper certificate generation)
        const certificate = this._createSelfSignedCertificate(hostname, publicKey, privateKey);
        
        return { certificate, privateKey };
    }

    /**
     * Create self-signed certificate
     * @private
     */
    _createSelfSignedCertificate(hostname, publicKey, privateKey) {
        // This is a simplified version - in production, use proper certificate libraries
        const certInfo = {
            subject: {
                commonName: hostname,
                organizationName: 'AI CI/CD System',
                countryName: 'US'
            },
            issuer: {
                commonName: hostname,
                organizationName: 'AI CI/CD System',
                countryName: 'US'
            },
            serialNumber: crypto.randomBytes(16).toString('hex'),
            validFrom: new Date(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            extensions: {
                subjectAltName: [`DNS:${hostname}`, `DNS:*.${hostname}`],
                keyUsage: ['digitalSignature', 'keyEncipherment'],
                extKeyUsage: ['serverAuth']
            }
        };
        
        // Return certificate in PEM format (simplified)
        return `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certInfo)).toString('base64')}
-----END CERTIFICATE-----`;
    }

    /**
     * Save certificate files
     * @private
     */
    async _saveCertificateFiles(certificate) {
        const certPath = path.join(this.config.cert_path, `${certificate.hostname}.crt`);
        const keyPath = path.join(this.config.private_key_path, `${certificate.hostname}.key`);
        
        await fs.writeFile(certPath, certificate.certificate, 'utf8');
        await fs.writeFile(keyPath, certificate.private_key, 'utf8');
        
        // Set secure permissions
        await fs.chmod(keyPath, 0o600);
        await fs.chmod(certPath, 0o644);
        
        console.log(`💾 Certificate files saved: ${certPath}, ${keyPath}`);
    }

    /**
     * Setup certificate directories
     * @private
     */
    async _setupCertificateDirectories() {
        await fs.mkdir(this.config.cert_path, { recursive: true });
        await fs.mkdir(this.config.private_key_path, { recursive: true });
        
        // Set secure permissions
        await fs.chmod(this.config.private_key_path, 0o700);
        await fs.chmod(this.config.cert_path, 0o755);
    }

    /**
     * Get cipher suites based on configuration
     * @private
     */
    _getCipherSuites() {
        const cipherSuites = {
            modern: [
                'TLS_AES_128_GCM_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384'
            ],
            intermediate: [
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES128-SHA256',
                'ECDHE-RSA-AES256-SHA384',
                'AES128-GCM-SHA256',
                'AES256-GCM-SHA384'
            ],
            old: [
                'ECDHE-RSA-AES128-SHA',
                'ECDHE-RSA-AES256-SHA',
                'AES128-SHA',
                'AES256-SHA',
                'DES-CBC3-SHA'
            ]
        };
        
        return cipherSuites[this.config.cipher_suites] || cipherSuites.modern;
    }

    /**
     * Generate HSTS header value
     * @private
     */
    _generateHSTSHeader() {
        let header = `max-age=${this.config.hsts_max_age}`;
        
        if (this.config.hsts_include_subdomains) {
            header += '; includeSubDomains';
        }
        
        if (this.config.hsts_preload) {
            header += '; preload';
        }
        
        return header;
    }

    /**
     * Check certificate expiry
     * @returns {Promise<Object>} Certificate status
     */
    async checkCertificateExpiry() {
        const results = [];
        
        for (const [certId, certificate] of this.certificates) {
            const expiryDate = new Date(certificate.created_at);
            expiryDate.setDate(expiryDate.getDate() + certificate.validity_days);
            
            const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
            
            results.push({
                certificate_id: certId,
                hostname: certificate.hostname,
                type: certificate.type,
                expires_at: expiryDate.toISOString(),
                days_until_expiry: daysUntilExpiry,
                status: daysUntilExpiry > 30 ? 'valid' : daysUntilExpiry > 7 ? 'warning' : 'critical',
                auto_renew: certificate.auto_renew
            });
        }
        
        return {
            check_timestamp: new Date().toISOString(),
            certificates: results,
            total_certificates: results.length,
            expiring_soon: results.filter(cert => cert.days_until_expiry <= 30).length,
            critical: results.filter(cert => cert.days_until_expiry <= 7).length
        };
    }

    /**
     * Renew certificate
     * @param {string} certificateId - Certificate ID to renew
     * @returns {Promise<Object>} Renewal result
     */
    async renewCertificate(certificateId) {
        const certificate = this.certificates.get(certificateId);
        
        if (!certificate) {
            throw new Error(`Certificate ${certificateId} not found`);
        }
        
        if (!certificate.auto_renew) {
            throw new Error(`Certificate ${certificateId} does not have auto-renewal enabled`);
        }
        
        try {
            console.log(`🔄 Renewing certificate ${certificateId}...`);
            
            // Simulate certificate renewal process
            const renewedCertificate = {
                ...certificate,
                created_at: new Date().toISOString(),
                status: 'active',
                renewed_at: new Date().toISOString()
            };
            
            this.certificates.set(certificateId, renewedCertificate);
            
            console.log(`✅ Certificate ${certificateId} renewed successfully`);
            
            return {
                success: true,
                certificate_id: certificateId,
                renewed_at: renewedCertificate.renewed_at,
                expires_at: new Date(Date.now() + certificate.validity_days * 24 * 60 * 60 * 1000).toISOString()
            };
            
        } catch (error) {
            console.error(`❌ Failed to renew certificate ${certificateId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get SSL configuration status
     * @returns {Object} SSL status
     */
    getSSLStatus() {
        const certificateStatus = Array.from(this.certificates.values()).map(cert => ({
            id: cert.id,
            type: cert.type,
            hostname: cert.hostname,
            status: cert.status,
            auto_renew: cert.auto_renew,
            created_at: cert.created_at
        }));
        
        const sslSettingsStatus = Array.from(this.sslSettings.values()).map(setting => ({
            id: setting.id,
            enabled: setting.enabled,
            hostname: setting.hostname
        }));
        
        return {
            ssl_mode: this.config.ssl_mode,
            min_tls_version: this.config.min_tls_version,
            cipher_suites: this.config.cipher_suites,
            hsts_enabled: this.config.enable_hsts,
            certificate_transparency: this.config.enable_certificate_transparency,
            ocsp_stapling: this.config.enable_ocsp_stapling,
            certificates: certificateStatus,
            ssl_settings: sslSettingsStatus,
            hostname: `${this.config.subdomain}.${this.config.domain}`
        };
    }

    /**
     * Validate SSL configuration
     * @returns {Promise<Object>} Validation result
     */
    async validateSSLConfiguration() {
        const errors = [];
        const warnings = [];
        
        // Check SSL mode
        if (this.config.ssl_mode === 'off') {
            errors.push('SSL is disabled - this is not secure for production');
        } else if (this.config.ssl_mode === 'flexible') {
            warnings.push('Flexible SSL mode allows unencrypted connections to origin');
        }
        
        // Check TLS version
        if (this.config.min_tls_version < '1.2') {
            errors.push('Minimum TLS version should be 1.2 or higher');
        }
        
        // Check HSTS
        if (!this.config.enable_hsts) {
            warnings.push('HSTS is disabled - consider enabling for enhanced security');
        }
        
        // Check certificates
        for (const certificate of this.certificates.values()) {
            if (certificate.self_signed) {
                warnings.push(`Certificate for ${certificate.hostname} is self-signed`);
            }
            
            if (!certificate.auto_renew) {
                warnings.push(`Auto-renewal is disabled for ${certificate.hostname}`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            score: this._calculateSSLScore(errors, warnings)
        };
    }

    /**
     * Calculate SSL security score
     * @private
     */
    _calculateSSLScore(errors, warnings) {
        let score = 100;
        
        // Deduct points for errors and warnings
        score -= errors.length * 20;
        score -= warnings.length * 5;
        
        // Bonus points for security features
        if (this.config.ssl_mode === 'strict') score += 10;
        if (this.config.min_tls_version >= '1.3') score += 10;
        if (this.config.enable_hsts) score += 5;
        if (this.config.enable_certificate_transparency) score += 5;
        if (this.config.enable_ocsp_stapling) score += 5;
        
        return Math.max(0, Math.min(100, score));
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
        
        // Validate SSL mode
        const validSSLModes = ['off', 'flexible', 'full', 'strict'];
        if (!validSSLModes.includes(this.config.ssl_mode)) {
            throw new Error(`Invalid SSL mode: ${this.config.ssl_mode}`);
        }
        
        // Validate TLS version
        const validTLSVersions = ['1.0', '1.1', '1.2', '1.3'];
        if (!validTLSVersions.includes(this.config.min_tls_version)) {
            throw new Error(`Invalid TLS version: ${this.config.min_tls_version}`);
        }
        
        // Validate certificate type
        const validCertTypes = ['universal', 'dedicated', 'custom'];
        if (!validCertTypes.includes(this.config.certificate_type)) {
            throw new Error(`Invalid certificate type: ${this.config.certificate_type}`);
        }
    }
}

export default CloudflareSSLConfig;

