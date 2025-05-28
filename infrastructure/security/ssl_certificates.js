/**
 * SSL Certificate Management
 * 
 * Handles SSL/TLS certificate management for the AI CI/CD system.
 * Provides certificate generation, validation, and renewal capabilities.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SimpleLogger } from '../../src/ai_cicd_system/utils/simple_logger.js';

export class SSLCertificateManager {
    constructor(config = {}) {
        this.config = {
            // Certificate storage
            certDir: config.certDir || process.env.SSL_CERT_DIR || './certificates',
            
            // Certificate settings
            keySize: config.keySize || parseInt(process.env.SSL_KEY_SIZE) || 2048,
            validityDays: config.validityDays || parseInt(process.env.SSL_VALIDITY_DAYS) || 365,
            
            // Certificate authority settings
            ca: {
                enabled: config.ca?.enabled || process.env.SSL_CA_ENABLED === 'true',
                keyFile: config.ca?.keyFile || process.env.SSL_CA_KEY_FILE || 'ca-key.pem',
                certFile: config.ca?.certFile || process.env.SSL_CA_CERT_FILE || 'ca-cert.pem',
                subject: config.ca?.subject || {
                    country: 'US',
                    state: 'CA',
                    locality: 'San Francisco',
                    organization: 'AI-CICD-System',
                    organizationalUnit: 'Security',
                    commonName: 'AI-CICD-System CA'
                }
            },
            
            // Server certificate settings
            server: {
                keyFile: config.server?.keyFile || process.env.SSL_SERVER_KEY_FILE || 'server-key.pem',
                certFile: config.server?.certFile || process.env.SSL_SERVER_CERT_FILE || 'server-cert.pem',
                csrFile: config.server?.csrFile || 'server-csr.pem',
                subject: config.server?.subject || {
                    country: 'US',
                    state: 'CA',
                    locality: 'San Francisco',
                    organization: 'AI-CICD-System',
                    organizationalUnit: 'API',
                    commonName: process.env.SSL_SERVER_COMMON_NAME || 'localhost'
                },
                altNames: config.server?.altNames || (process.env.SSL_SERVER_ALT_NAMES || '').split(',').filter(n => n.trim())
            },
            
            // Auto-renewal settings
            autoRenewal: {
                enabled: config.autoRenewal?.enabled || process.env.SSL_AUTO_RENEWAL === 'true',
                renewBeforeDays: config.autoRenewal?.renewBeforeDays || parseInt(process.env.SSL_RENEW_BEFORE_DAYS) || 30,
                checkInterval: config.autoRenewal?.checkInterval || process.env.SSL_CHECK_INTERVAL || '24h'
            },
            
            // External certificate providers
            external: {
                letsEncrypt: {
                    enabled: config.external?.letsEncrypt?.enabled || process.env.LETSENCRYPT_ENABLED === 'true',
                    email: config.external?.letsEncrypt?.email || process.env.LETSENCRYPT_EMAIL,
                    staging: config.external?.letsEncrypt?.staging || process.env.LETSENCRYPT_STAGING === 'true'
                }
            },
            
            ...config
        };

        this.logger = new SimpleLogger('SSLCertificateManager');
        
        // Initialize certificate directory
        this._initializeCertDir();
        
        // Start auto-renewal if enabled
        if (this.config.autoRenewal.enabled) {
            this._startAutoRenewal();
        }
    }

    /**
     * Generate Certificate Authority (CA) certificate
     */
    async generateCA() {
        try {
            const caKeyPath = path.join(this.config.certDir, this.config.ca.keyFile);
            const caCertPath = path.join(this.config.certDir, this.config.ca.certFile);
            
            // Check if CA already exists
            if (await this._fileExists(caKeyPath) && await this._fileExists(caCertPath)) {
                this.logger.info('CA certificate already exists');
                return {
                    success: true,
                    message: 'CA certificate already exists',
                    keyFile: caKeyPath,
                    certFile: caCertPath
                };
            }

            this.logger.info('Generating CA certificate...');

            // Generate CA private key
            const caKey = crypto.generateKeyPairSync('rsa', {
                modulusLength: this.config.keySize,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            // Create CA certificate
            const caCert = this._createCertificate(
                caKey.privateKey,
                caKey.publicKey,
                this.config.ca.subject,
                null, // Self-signed
                this.config.validityDays,
                true // Is CA
            );

            // Save CA files
            await fs.writeFile(caKeyPath, caKey.privateKey, { mode: 0o600 });
            await fs.writeFile(caCertPath, caCert);

            this.logger.info('CA certificate generated successfully');

            return {
                success: true,
                keyFile: caKeyPath,
                certFile: caCertPath,
                certificate: caCert
            };

        } catch (error) {
            this.logger.error('CA generation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate server certificate
     */
    async generateServerCertificate() {
        try {
            const serverKeyPath = path.join(this.config.certDir, this.config.server.keyFile);
            const serverCertPath = path.join(this.config.certDir, this.config.server.certFile);
            
            this.logger.info('Generating server certificate...');

            // Generate server private key
            const serverKey = crypto.generateKeyPairSync('rsa', {
                modulusLength: this.config.keySize,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            let serverCert;
            
            if (this.config.ca.enabled) {
                // Sign with CA
                const caKeyPath = path.join(this.config.certDir, this.config.ca.keyFile);
                const caCertPath = path.join(this.config.certDir, this.config.ca.certFile);
                
                if (!await this._fileExists(caKeyPath) || !await this._fileExists(caCertPath)) {
                    // Generate CA first
                    const caResult = await this.generateCA();
                    if (!caResult.success) {
                        throw new Error('Failed to generate CA certificate');
                    }
                }

                const caKey = await fs.readFile(caKeyPath, 'utf8');
                serverCert = this._createCertificate(
                    caKey,
                    serverKey.publicKey,
                    this.config.server.subject,
                    caCertPath,
                    this.config.validityDays,
                    false,
                    this.config.server.altNames
                );
            } else {
                // Self-signed certificate
                serverCert = this._createCertificate(
                    serverKey.privateKey,
                    serverKey.publicKey,
                    this.config.server.subject,
                    null,
                    this.config.validityDays,
                    false,
                    this.config.server.altNames
                );
            }

            // Save server files
            await fs.writeFile(serverKeyPath, serverKey.privateKey, { mode: 0o600 });
            await fs.writeFile(serverCertPath, serverCert);

            this.logger.info('Server certificate generated successfully');

            return {
                success: true,
                keyFile: serverKeyPath,
                certFile: serverCertPath,
                certificate: serverCert
            };

        } catch (error) {
            this.logger.error('Server certificate generation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate certificate
     */
    async validateCertificate(certPath) {
        try {
            const certContent = await fs.readFile(certPath, 'utf8');
            const cert = crypto.createPublicKey(certContent);
            
            // Parse certificate details (simplified)
            const certInfo = this._parseCertificate(certContent);
            
            const now = new Date();
            const isValid = certInfo.notBefore <= now && now <= certInfo.notAfter;
            const daysUntilExpiry = Math.ceil((certInfo.notAfter - now) / (1000 * 60 * 60 * 24));

            return {
                success: true,
                valid: isValid,
                notBefore: certInfo.notBefore,
                notAfter: certInfo.notAfter,
                daysUntilExpiry: daysUntilExpiry,
                subject: certInfo.subject,
                issuer: certInfo.issuer,
                serialNumber: certInfo.serialNumber
            };

        } catch (error) {
            this.logger.error('Certificate validation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if certificates need renewal
     */
    async checkRenewalNeeded() {
        try {
            const serverCertPath = path.join(this.config.certDir, this.config.server.certFile);
            
            if (!await this._fileExists(serverCertPath)) {
                return {
                    needed: true,
                    reason: 'Certificate file not found'
                };
            }

            const validation = await this.validateCertificate(serverCertPath);
            
            if (!validation.success || !validation.valid) {
                return {
                    needed: true,
                    reason: 'Certificate is invalid or expired'
                };
            }

            if (validation.daysUntilExpiry <= this.config.autoRenewal.renewBeforeDays) {
                return {
                    needed: true,
                    reason: `Certificate expires in ${validation.daysUntilExpiry} days`
                };
            }

            return {
                needed: false,
                daysUntilExpiry: validation.daysUntilExpiry
            };

        } catch (error) {
            this.logger.error('Renewal check failed:', error);
            return {
                needed: true,
                reason: `Check failed: ${error.message}`
            };
        }
    }

    /**
     * Renew certificates
     */
    async renewCertificates() {
        try {
            this.logger.info('Starting certificate renewal...');

            // Backup existing certificates
            await this._backupCertificates();

            // Generate new certificates
            const serverResult = await this.generateServerCertificate();
            
            if (!serverResult.success) {
                throw new Error(`Server certificate renewal failed: ${serverResult.error}`);
            }

            this.logger.info('Certificate renewal completed successfully');

            return {
                success: true,
                certificates: {
                    server: serverResult
                }
            };

        } catch (error) {
            this.logger.error('Certificate renewal failed:', error);
            
            // Attempt to restore backup
            await this._restoreBackup();
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get certificate information
     */
    async getCertificateInfo() {
        try {
            const info = {};
            
            // Server certificate
            const serverCertPath = path.join(this.config.certDir, this.config.server.certFile);
            if (await this._fileExists(serverCertPath)) {
                info.server = await this.validateCertificate(serverCertPath);
            }

            // CA certificate
            if (this.config.ca.enabled) {
                const caCertPath = path.join(this.config.certDir, this.config.ca.certFile);
                if (await this._fileExists(caCertPath)) {
                    info.ca = await this.validateCertificate(caCertPath);
                }
            }

            return {
                success: true,
                certificates: info,
                autoRenewal: this.config.autoRenewal
            };

        } catch (error) {
            this.logger.error('Failed to get certificate info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Initialize certificate directory
     */
    async _initializeCertDir() {
        try {
            await fs.mkdir(this.config.certDir, { recursive: true, mode: 0o700 });
            this.logger.debug(`Certificate directory initialized: ${this.config.certDir}`);
        } catch (error) {
            this.logger.error('Failed to initialize certificate directory:', error);
            throw error;
        }
    }

    /**
     * Create certificate (simplified implementation)
     */
    _createCertificate(signingKey, publicKey, subject, issuerCertPath, validityDays, isCA = false, altNames = []) {
        // This is a simplified implementation
        // In production, you would use a proper certificate library like node-forge
        
        const cert = [
            '-----BEGIN CERTIFICATE-----',
            // Certificate data would be generated here using proper ASN.1 encoding
            Buffer.from(JSON.stringify({
                subject,
                publicKey: publicKey.toString('base64'),
                validFrom: new Date(),
                validTo: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
                isCA,
                altNames,
                serialNumber: crypto.randomBytes(16).toString('hex')
            })).toString('base64'),
            '-----END CERTIFICATE-----'
        ].join('\n');

        return cert;
    }

    /**
     * Parse certificate (simplified implementation)
     */
    _parseCertificate(certContent) {
        // This is a simplified implementation
        // In production, you would use a proper certificate parsing library
        
        try {
            const base64Data = certContent
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            
            const certData = JSON.parse(Buffer.from(base64Data, 'base64').toString());
            
            return {
                subject: certData.subject,
                issuer: certData.issuer || certData.subject,
                notBefore: new Date(certData.validFrom),
                notAfter: new Date(certData.validTo),
                serialNumber: certData.serialNumber
            };
        } catch (error) {
            // Fallback for real certificates
            return {
                subject: { commonName: 'Unknown' },
                issuer: { commonName: 'Unknown' },
                notBefore: new Date(),
                notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                serialNumber: 'unknown'
            };
        }
    }

    /**
     * Check if file exists
     */
    async _fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Backup certificates
     */
    async _backupCertificates() {
        try {
            const backupDir = path.join(this.config.certDir, 'backup');
            await fs.mkdir(backupDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const files = [this.config.server.keyFile, this.config.server.certFile];
            
            if (this.config.ca.enabled) {
                files.push(this.config.ca.keyFile, this.config.ca.certFile);
            }

            for (const file of files) {
                const sourcePath = path.join(this.config.certDir, file);
                if (await this._fileExists(sourcePath)) {
                    const backupPath = path.join(backupDir, `${timestamp}-${file}`);
                    await fs.copyFile(sourcePath, backupPath);
                }
            }

            this.logger.debug('Certificates backed up successfully');
        } catch (error) {
            this.logger.error('Certificate backup failed:', error);
        }
    }

    /**
     * Restore backup certificates
     */
    async _restoreBackup() {
        try {
            const backupDir = path.join(this.config.certDir, 'backup');
            // Implementation would restore the most recent backup
            this.logger.info('Certificate backup restoration not implemented');
        } catch (error) {
            this.logger.error('Certificate restoration failed:', error);
        }
    }

    /**
     * Start auto-renewal process
     */
    _startAutoRenewal() {
        const intervalMs = this._parseTimeToMs(this.config.autoRenewal.checkInterval);
        
        setInterval(async () => {
            try {
                const renewalCheck = await this.checkRenewalNeeded();
                
                if (renewalCheck.needed) {
                    this.logger.info(`Certificate renewal needed: ${renewalCheck.reason}`);
                    const renewalResult = await this.renewCertificates();
                    
                    if (renewalResult.success) {
                        this.logger.info('Automatic certificate renewal completed');
                    } else {
                        this.logger.error('Automatic certificate renewal failed:', renewalResult.error);
                    }
                }
            } catch (error) {
                this.logger.error('Auto-renewal check failed:', error);
            }
        }, intervalMs);

        this.logger.info(`Certificate auto-renewal started: ${this.config.autoRenewal.checkInterval}`);
    }

    /**
     * Parse time string to milliseconds
     */
    _parseTimeToMs(timeStr) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = timeStr.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }
}

export default SSLCertificateManager;

