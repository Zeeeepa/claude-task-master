/**
 * Encryption Service
 * Handles data encryption at rest and in transit, key management, and cryptographic operations
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { AuditLogger } from './audit_logger.js';

export class EncryptionService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            algorithm: config.algorithm || 'aes-256-gcm',
            keyDerivationAlgorithm: config.keyDerivationAlgorithm || 'pbkdf2',
            keyDerivationIterations: config.keyDerivationIterations || 100000,
            keyLength: config.keyLength || 32,
            ivLength: config.ivLength || 16,
            tagLength: config.tagLength || 16,
            saltLength: config.saltLength || 32,
            masterKey: config.masterKey || process.env.MASTER_ENCRYPTION_KEY,
            keyRotationInterval: config.keyRotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days
            enableKeyRotation: config.enableKeyRotation !== false,
            ...config
        };

        this.auditLogger = new AuditLogger();
        this.keyStore = new Map();
        this.keyVersions = new Map();
        this.currentKeyVersion = 1;

        // Initialize master key if not provided
        if (!this.config.masterKey) {
            this.config.masterKey = this.generateMasterKey();
            console.warn('Generated new master key. Store this securely:', this.config.masterKey);
        }

        this.initializeKeyManagement();
    }

    /**
     * Initialize key management system
     */
    async initializeKeyManagement() {
        try {
            // Generate initial data encryption key
            await this.generateDataEncryptionKey();
            
            // Start key rotation if enabled
            if (this.config.enableKeyRotation) {
                this.startKeyRotation();
            }

            await this.auditLogger.logSecurityEvent('ENCRYPTION_SERVICE_INITIALIZED', {
                algorithm: this.config.algorithm,
                keyRotationEnabled: this.config.enableKeyRotation,
                keyRotationInterval: this.config.keyRotationInterval
            });

        } catch (error) {
            await this.auditLogger.logSecurityEvent('ENCRYPTION_INIT_FAILED', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Generate master key
     */
    generateMasterKey() {
        return crypto.randomBytes(this.config.keyLength).toString('hex');
    }

    /**
     * Generate data encryption key
     */
    async generateDataEncryptionKey() {
        const keyId = crypto.randomUUID();
        const key = crypto.randomBytes(this.config.keyLength);
        const createdAt = new Date();
        
        const keyData = {
            id: keyId,
            key,
            version: this.currentKeyVersion,
            createdAt,
            expiresAt: new Date(createdAt.getTime() + this.config.keyRotationInterval),
            active: true
        };

        this.keyStore.set(keyId, keyData);
        this.keyVersions.set(this.currentKeyVersion, keyId);

        await this.auditLogger.logSecurityEvent('DATA_ENCRYPTION_KEY_GENERATED', {
            keyId,
            version: this.currentKeyVersion,
            expiresAt: keyData.expiresAt
        });

        this.emit('keyGenerated', { keyId, version: this.currentKeyVersion });
        return keyData;
    }

    /**
     * Get current active encryption key
     */
    getCurrentKey() {
        const keyId = this.keyVersions.get(this.currentKeyVersion);
        return this.keyStore.get(keyId);
    }

    /**
     * Get encryption key by version
     */
    getKeyByVersion(version) {
        const keyId = this.keyVersions.get(version);
        return this.keyStore.get(keyId);
    }

    /**
     * Encrypt data
     */
    async encrypt(data, options = {}) {
        try {
            const {
                keyVersion = this.currentKeyVersion,
                encoding = 'utf8',
                outputEncoding = 'base64'
            } = options;

            // Get encryption key
            const keyData = this.getKeyByVersion(keyVersion);
            if (!keyData) {
                throw new Error(`Encryption key version ${keyVersion} not found`);
            }

            // Convert data to buffer if needed
            const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);

            // Generate initialization vector
            const iv = crypto.randomBytes(this.config.ivLength);

            // Create cipher
            const cipher = crypto.createCipher(this.config.algorithm, keyData.key, { iv });

            // Encrypt data
            const encrypted = Buffer.concat([
                cipher.update(dataBuffer),
                cipher.final()
            ]);

            // Get authentication tag for GCM mode
            const tag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);

            // Create result object
            const result = {
                data: encrypted.toString(outputEncoding),
                iv: iv.toString(outputEncoding),
                tag: tag.toString(outputEncoding),
                keyVersion,
                algorithm: this.config.algorithm,
                timestamp: new Date().toISOString()
            };

            await this.auditLogger.logSecurityEvent('DATA_ENCRYPTED', {
                keyVersion,
                dataSize: dataBuffer.length,
                algorithm: this.config.algorithm
            });

            return result;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('ENCRYPTION_FAILED', {
                error: error.message,
                keyVersion: options.keyVersion
            });
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt data
     */
    async decrypt(encryptedData, options = {}) {
        try {
            const {
                encoding = 'utf8',
                inputEncoding = 'base64'
            } = options;

            // Parse encrypted data
            const {
                data,
                iv,
                tag,
                keyVersion,
                algorithm
            } = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;

            // Get decryption key
            const keyData = this.getKeyByVersion(keyVersion);
            if (!keyData) {
                throw new Error(`Decryption key version ${keyVersion} not found`);
            }

            // Convert from encoded strings to buffers
            const dataBuffer = Buffer.from(data, inputEncoding);
            const ivBuffer = Buffer.from(iv, inputEncoding);
            const tagBuffer = tag ? Buffer.from(tag, inputEncoding) : null;

            // Create decipher
            const decipher = crypto.createDecipher(algorithm, keyData.key, { iv: ivBuffer });

            // Set auth tag for GCM mode
            if (tagBuffer && decipher.setAuthTag) {
                decipher.setAuthTag(tagBuffer);
            }

            // Decrypt data
            const decrypted = Buffer.concat([
                decipher.update(dataBuffer),
                decipher.final()
            ]);

            await this.auditLogger.logSecurityEvent('DATA_DECRYPTED', {
                keyVersion,
                dataSize: decrypted.length,
                algorithm
            });

            return decrypted.toString(encoding);

        } catch (error) {
            await this.auditLogger.logSecurityEvent('DECRYPTION_FAILED', {
                error: error.message
            });
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Encrypt file
     */
    async encryptFile(inputPath, outputPath, options = {}) {
        const fs = await import('fs/promises');
        
        try {
            // Read file
            const data = await fs.readFile(inputPath);
            
            // Encrypt data
            const encrypted = await this.encrypt(data, options);
            
            // Write encrypted file
            await fs.writeFile(outputPath, JSON.stringify(encrypted, null, 2));

            await this.auditLogger.logSecurityEvent('FILE_ENCRYPTED', {
                inputPath,
                outputPath,
                fileSize: data.length,
                keyVersion: encrypted.keyVersion
            });

            return encrypted;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('FILE_ENCRYPTION_FAILED', {
                inputPath,
                outputPath,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Decrypt file
     */
    async decryptFile(inputPath, outputPath, options = {}) {
        const fs = await import('fs/promises');
        
        try {
            // Read encrypted file
            const encryptedData = JSON.parse(await fs.readFile(inputPath, 'utf8'));
            
            // Decrypt data
            const decrypted = await this.decrypt(encryptedData, options);
            
            // Write decrypted file
            await fs.writeFile(outputPath, decrypted);

            await this.auditLogger.logSecurityEvent('FILE_DECRYPTED', {
                inputPath,
                outputPath,
                keyVersion: encryptedData.keyVersion
            });

            return decrypted;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('FILE_DECRYPTION_FAILED', {
                inputPath,
                outputPath,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Hash data with salt
     */
    async hashData(data, options = {}) {
        const {
            algorithm = 'sha256',
            salt = crypto.randomBytes(this.config.saltLength),
            iterations = this.config.keyDerivationIterations,
            keyLength = this.config.keyLength,
            encoding = 'hex'
        } = options;

        try {
            const hash = crypto.pbkdf2Sync(data, salt, iterations, keyLength, algorithm);
            
            const result = {
                hash: hash.toString(encoding),
                salt: salt.toString(encoding),
                algorithm,
                iterations,
                keyLength
            };

            await this.auditLogger.logSecurityEvent('DATA_HASHED', {
                algorithm,
                iterations,
                keyLength
            });

            return result;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('HASHING_FAILED', {
                error: error.message,
                algorithm
            });
            throw error;
        }
    }

    /**
     * Verify hashed data
     */
    async verifyHash(data, hashData) {
        try {
            const {
                hash: expectedHash,
                salt,
                algorithm,
                iterations,
                keyLength
            } = hashData;

            const saltBuffer = Buffer.from(salt, 'hex');
            const computedHash = crypto.pbkdf2Sync(data, saltBuffer, iterations, keyLength, algorithm);
            
            const isValid = computedHash.toString('hex') === expectedHash;

            await this.auditLogger.logSecurityEvent('HASH_VERIFICATION', {
                result: isValid,
                algorithm
            });

            return isValid;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('HASH_VERIFICATION_FAILED', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Generate digital signature
     */
    async signData(data, privateKey, options = {}) {
        const {
            algorithm = 'sha256',
            encoding = 'base64'
        } = options;

        try {
            const sign = crypto.createSign(algorithm);
            sign.update(data);
            const signature = sign.sign(privateKey, encoding);

            await this.auditLogger.logSecurityEvent('DATA_SIGNED', {
                algorithm,
                dataSize: Buffer.byteLength(data)
            });

            return signature;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('SIGNING_FAILED', {
                error: error.message,
                algorithm
            });
            throw error;
        }
    }

    /**
     * Verify digital signature
     */
    async verifySignature(data, signature, publicKey, options = {}) {
        const {
            algorithm = 'sha256',
            encoding = 'base64'
        } = options;

        try {
            const verify = crypto.createVerify(algorithm);
            verify.update(data);
            const isValid = verify.verify(publicKey, signature, encoding);

            await this.auditLogger.logSecurityEvent('SIGNATURE_VERIFICATION', {
                result: isValid,
                algorithm
            });

            return isValid;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('SIGNATURE_VERIFICATION_FAILED', {
                error: error.message,
                algorithm
            });
            return false;
        }
    }

    /**
     * Generate key pair for asymmetric encryption
     */
    async generateKeyPair(options = {}) {
        const {
            type = 'rsa',
            modulusLength = 2048,
            publicKeyEncoding = { type: 'spki', format: 'pem' },
            privateKeyEncoding = { type: 'pkcs8', format: 'pem' }
        } = options;

        try {
            const { publicKey, privateKey } = crypto.generateKeyPairSync(type, {
                modulusLength,
                publicKeyEncoding,
                privateKeyEncoding
            });

            const keyPairId = crypto.randomUUID();

            await this.auditLogger.logSecurityEvent('KEY_PAIR_GENERATED', {
                keyPairId,
                type,
                modulusLength
            });

            return {
                id: keyPairId,
                publicKey,
                privateKey,
                type,
                modulusLength,
                createdAt: new Date()
            };

        } catch (error) {
            await this.auditLogger.logSecurityEvent('KEY_PAIR_GENERATION_FAILED', {
                error: error.message,
                type
            });
            throw error;
        }
    }

    /**
     * Rotate encryption keys
     */
    async rotateKeys() {
        try {
            // Mark current key as inactive
            const currentKey = this.getCurrentKey();
            if (currentKey) {
                currentKey.active = false;
            }

            // Generate new key
            this.currentKeyVersion++;
            const newKey = await this.generateDataEncryptionKey();

            await this.auditLogger.logSecurityEvent('KEY_ROTATION_COMPLETED', {
                oldVersion: this.currentKeyVersion - 1,
                newVersion: this.currentKeyVersion,
                newKeyId: newKey.id
            });

            this.emit('keyRotated', {
                oldVersion: this.currentKeyVersion - 1,
                newVersion: this.currentKeyVersion,
                newKeyId: newKey.id
            });

            return newKey;

        } catch (error) {
            await this.auditLogger.logSecurityEvent('KEY_ROTATION_FAILED', {
                error: error.message,
                currentVersion: this.currentKeyVersion
            });
            throw error;
        }
    }

    /**
     * Start automatic key rotation
     */
    startKeyRotation() {
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
        }

        this.keyRotationTimer = setInterval(async () => {
            try {
                await this.rotateKeys();
            } catch (error) {
                console.error('Automatic key rotation failed:', error);
            }
        }, this.config.keyRotationInterval);

        console.log(`Key rotation started with interval: ${this.config.keyRotationInterval}ms`);
    }

    /**
     * Stop automatic key rotation
     */
    stopKeyRotation() {
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
            this.keyRotationTimer = null;
        }
    }

    /**
     * Secure random string generation
     */
    generateSecureRandom(length = 32, encoding = 'hex') {
        return crypto.randomBytes(length).toString(encoding);
    }

    /**
     * Generate secure token
     */
    generateSecureToken(options = {}) {
        const {
            length = 32,
            encoding = 'base64url',
            prefix = '',
            includeTimestamp = false
        } = options;

        let token = prefix;
        
        if (includeTimestamp) {
            token += Date.now().toString(36) + '_';
        }
        
        token += crypto.randomBytes(length).toString(encoding);
        
        return token;
    }

    /**
     * Encrypt sensitive configuration
     */
    async encryptConfig(config) {
        const sensitiveFields = ['password', 'secret', 'key', 'token', 'apiKey'];
        const encrypted = { ...config };

        for (const [key, value] of Object.entries(config)) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                if (typeof value === 'string') {
                    encrypted[key] = await this.encrypt(value);
                }
            }
        }

        return encrypted;
    }

    /**
     * Decrypt sensitive configuration
     */
    async decryptConfig(encryptedConfig) {
        const decrypted = { ...encryptedConfig };

        for (const [key, value] of Object.entries(encryptedConfig)) {
            if (typeof value === 'object' && value.data && value.iv && value.keyVersion) {
                try {
                    decrypted[key] = await this.decrypt(value);
                } catch (error) {
                    console.warn(`Failed to decrypt config field ${key}:`, error.message);
                }
            }
        }

        return decrypted;
    }

    /**
     * Get encryption statistics
     */
    getEncryptionStats() {
        const activeKeys = Array.from(this.keyStore.values()).filter(key => key.active);
        const totalKeys = this.keyStore.size;
        
        return {
            totalKeys,
            activeKeys: activeKeys.length,
            currentKeyVersion: this.currentKeyVersion,
            algorithm: this.config.algorithm,
            keyRotationEnabled: this.config.enableKeyRotation,
            keyRotationInterval: this.config.keyRotationInterval
        };
    }

    /**
     * Export key metadata (without actual keys)
     */
    exportKeyMetadata() {
        const metadata = [];
        
        for (const [keyId, keyData] of this.keyStore) {
            metadata.push({
                id: keyId,
                version: keyData.version,
                createdAt: keyData.createdAt,
                expiresAt: keyData.expiresAt,
                active: keyData.active
            });
        }

        return metadata;
    }

    /**
     * Cleanup expired keys
     */
    async cleanupExpiredKeys() {
        const now = new Date();
        let cleanedCount = 0;

        for (const [keyId, keyData] of this.keyStore) {
            if (!keyData.active && keyData.expiresAt < now) {
                this.keyStore.delete(keyId);
                this.keyVersions.delete(keyData.version);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            await this.auditLogger.logSecurityEvent('EXPIRED_KEYS_CLEANED', {
                cleanedCount,
                remainingKeys: this.keyStore.size
            });
        }

        return cleanedCount;
    }

    /**
     * Destroy encryption service
     */
    async destroy() {
        this.stopKeyRotation();
        
        // Clear sensitive data from memory
        this.keyStore.clear();
        this.keyVersions.clear();
        
        await this.auditLogger.logSecurityEvent('ENCRYPTION_SERVICE_DESTROYED', {
            timestamp: new Date()
        });
    }
}

export default EncryptionService;

