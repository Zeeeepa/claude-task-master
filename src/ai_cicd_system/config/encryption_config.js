/**
 * Encryption Configuration
 * 
 * Handles encryption key management and cryptographic operations for the AI CI/CD system.
 * Provides secure encryption/decryption utilities and key rotation capabilities.
 */

import crypto from 'crypto';
import { SimpleLogger } from '../utils/simple_logger.js';

export class EncryptionConfig {
    constructor(config = {}) {
        this.logger = new SimpleLogger('EncryptionConfig');
        
        this.config = {
            // Primary encryption algorithm
            algorithm: config.algorithm || process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
            
            // Key derivation settings
            keyDerivation: {
                algorithm: config.keyDerivation?.algorithm || process.env.KEY_DERIVATION_ALGORITHM || 'pbkdf2',
                iterations: config.keyDerivation?.iterations || parseInt(process.env.ENCRYPTION_ITERATIONS) || 100000,
                keyLength: config.keyDerivation?.keyLength || parseInt(process.env.ENCRYPTION_KEY_LENGTH) || 32,
                saltLength: config.keyDerivation?.saltLength || parseInt(process.env.ENCRYPTION_SALT_LENGTH) || 32,
                hashFunction: config.keyDerivation?.hashFunction || process.env.KEY_DERIVATION_HASH || 'sha256'
            },
            
            // Encryption parameters
            ivLength: config.ivLength || parseInt(process.env.ENCRYPTION_IV_LENGTH) || 16,
            tagLength: config.tagLength || parseInt(process.env.ENCRYPTION_TAG_LENGTH) || 16,
            
            // Master key configuration
            masterKey: config.masterKey || process.env.MASTER_ENCRYPTION_KEY || this._generateMasterKey(),
            
            // Key rotation settings
            keyRotation: {
                enabled: config.keyRotation?.enabled || process.env.KEY_ROTATION_ENABLED === 'true',
                intervalDays: config.keyRotation?.intervalDays || parseInt(process.env.KEY_ROTATION_INTERVAL) || 90,
                keepOldKeys: config.keyRotation?.keepOldKeys || parseInt(process.env.KEY_ROTATION_KEEP_OLD) || 3
            },
            
            // Backup encryption
            backup: {
                enabled: config.backup?.enabled || process.env.BACKUP_ENCRYPTION_ENABLED !== 'false',
                algorithm: config.backup?.algorithm || 'aes-256-cbc',
                keyLength: config.backup?.keyLength || 32
            },
            
            ...config
        };

        // Initialize encryption keys
        this.keys = new Map();
        this.currentKeyId = null;
        
        // Validate configuration
        this._validateConfig();
        
        // Initialize master key
        this._initializeMasterKey();
    }

    /**
     * Encrypt data using current encryption key
     */
    encrypt(data, keyId = null) {
        try {
            const useKeyId = keyId || this.currentKeyId;
            const key = this._getEncryptionKey(useKeyId);
            
            if (!key) {
                throw new Error('Encryption key not found');
            }

            const iv = crypto.randomBytes(this.config.ivLength);
            const cipher = crypto.createCipher(this.config.algorithm, key);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            let authTag = null;
            if (this.config.algorithm.includes('gcm')) {
                authTag = cipher.getAuthTag();
            }

            const result = {
                data: encrypted,
                iv: iv.toString('hex'),
                keyId: useKeyId,
                algorithm: this.config.algorithm
            };

            if (authTag) {
                result.authTag = authTag.toString('hex');
            }

            return {
                success: true,
                encrypted: Buffer.from(JSON.stringify(result)).toString('base64')
            };

        } catch (error) {
            this.logger.error('Encryption failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData) {
        try {
            const encryptedObj = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
            const key = this._getEncryptionKey(encryptedObj.keyId);
            
            if (!key) {
                throw new Error('Decryption key not found');
            }

            const decipher = crypto.createDecipher(encryptedObj.algorithm, key);
            
            if (encryptedObj.authTag) {
                decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));
            }

            let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return {
                success: true,
                data: JSON.parse(decrypted)
            };

        } catch (error) {
            this.logger.error('Decryption failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Encrypt sensitive fields in an object
     */
    encryptFields(obj, fieldsToEncrypt = []) {
        try {
            const result = { ...obj };
            
            for (const field of fieldsToEncrypt) {
                if (field in result && result[field] !== null && result[field] !== undefined) {
                    const encryptionResult = this.encrypt(result[field]);
                    if (encryptionResult.success) {
                        result[field] = encryptionResult.encrypted;
                        result[`${field}_encrypted`] = true;
                    } else {
                        this.logger.error(`Failed to encrypt field ${field}:`, encryptionResult.error);
                    }
                }
            }

            return {
                success: true,
                data: result
            };

        } catch (error) {
            this.logger.error('Field encryption failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Decrypt sensitive fields in an object
     */
    decryptFields(obj, fieldsToDecrypt = []) {
        try {
            const result = { ...obj };
            
            for (const field of fieldsToDecrypt) {
                if (field in result && result[`${field}_encrypted`]) {
                    const decryptionResult = this.decrypt(result[field]);
                    if (decryptionResult.success) {
                        result[field] = decryptionResult.data;
                        delete result[`${field}_encrypted`];
                    } else {
                        this.logger.error(`Failed to decrypt field ${field}:`, decryptionResult.error);
                    }
                }
            }

            return {
                success: true,
                data: result
            };

        } catch (error) {
            this.logger.error('Field decryption failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate hash of data
     */
    hash(data, algorithm = 'sha256') {
        try {
            const hash = crypto.createHash(algorithm);
            hash.update(typeof data === 'string' ? data : JSON.stringify(data));
            return {
                success: true,
                hash: hash.digest('hex')
            };
        } catch (error) {
            this.logger.error('Hashing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate HMAC
     */
    hmac(data, secret, algorithm = 'sha256') {
        try {
            const hmac = crypto.createHmac(algorithm, secret);
            hmac.update(typeof data === 'string' ? data : JSON.stringify(data));
            return {
                success: true,
                hmac: hmac.digest('hex')
            };
        } catch (error) {
            this.logger.error('HMAC generation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify HMAC
     */
    verifyHmac(data, providedHmac, secret, algorithm = 'sha256') {
        try {
            const calculatedHmac = this.hmac(data, secret, algorithm);
            if (!calculatedHmac.success) {
                return { success: false, error: calculatedHmac.error };
            }

            const isValid = crypto.timingSafeEqual(
                Buffer.from(providedHmac, 'hex'),
                Buffer.from(calculatedHmac.hmac, 'hex')
            );

            return {
                success: true,
                valid: isValid
            };
        } catch (error) {
            this.logger.error('HMAC verification failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate secure random bytes
     */
    generateRandomBytes(length = 32) {
        try {
            return {
                success: true,
                bytes: crypto.randomBytes(length),
                hex: crypto.randomBytes(length).toString('hex'),
                base64: crypto.randomBytes(length).toString('base64')
            };
        } catch (error) {
            this.logger.error('Random bytes generation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Derive key from password
     */
    deriveKey(password, salt = null) {
        try {
            const useSalt = salt || crypto.randomBytes(this.config.keyDerivation.saltLength);
            const derivedKey = crypto.pbkdf2Sync(
                password,
                useSalt,
                this.config.keyDerivation.iterations,
                this.config.keyDerivation.keyLength,
                this.config.keyDerivation.hashFunction
            );

            return {
                success: true,
                key: derivedKey,
                salt: useSalt,
                keyHex: derivedKey.toString('hex'),
                saltHex: useSalt.toString('hex')
            };
        } catch (error) {
            this.logger.error('Key derivation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Rotate encryption keys
     */
    async rotateKeys() {
        try {
            if (!this.config.keyRotation.enabled) {
                return {
                    success: false,
                    error: 'Key rotation is disabled'
                };
            }

            // Generate new key
            const newKeyId = this._generateKeyId();
            const newKey = this._generateEncryptionKey();
            
            // Store new key
            this.keys.set(newKeyId, {
                key: newKey,
                createdAt: new Date(),
                active: true
            });

            // Mark old key as inactive
            if (this.currentKeyId) {
                const oldKey = this.keys.get(this.currentKeyId);
                if (oldKey) {
                    oldKey.active = false;
                }
            }

            // Set new key as current
            this.currentKeyId = newKeyId;

            // Clean up old keys
            this._cleanupOldKeys();

            this.logger.info(`Encryption key rotated: ${newKeyId}`);

            return {
                success: true,
                newKeyId: newKeyId
            };

        } catch (error) {
            this.logger.error('Key rotation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get encryption statistics
     */
    getStats() {
        return {
            algorithm: this.config.algorithm,
            currentKeyId: this.currentKeyId,
            totalKeys: this.keys.size,
            activeKeys: Array.from(this.keys.values()).filter(k => k.active).length,
            keyRotationEnabled: this.config.keyRotation.enabled,
            keyRotationInterval: this.config.keyRotation.intervalDays
        };
    }

    /**
     * Initialize master key
     */
    _initializeMasterKey() {
        try {
            // Generate initial encryption key
            const initialKeyId = this._generateKeyId();
            const initialKey = this._generateEncryptionKey();
            
            this.keys.set(initialKeyId, {
                key: initialKey,
                createdAt: new Date(),
                active: true
            });
            
            this.currentKeyId = initialKeyId;
            
            this.logger.info('Encryption system initialized');
        } catch (error) {
            this.logger.error('Failed to initialize encryption system:', error);
            throw error;
        }
    }

    /**
     * Generate master key
     */
    _generateMasterKey() {
        const key = crypto.randomBytes(64).toString('hex');
        this.logger.warn('Generated master encryption key. Set MASTER_ENCRYPTION_KEY environment variable for production.');
        return key;
    }

    /**
     * Generate encryption key
     */
    _generateEncryptionKey() {
        return crypto.randomBytes(this.config.keyDerivation.keyLength);
    }

    /**
     * Generate key ID
     */
    _generateKeyId() {
        return `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Get encryption key by ID
     */
    _getEncryptionKey(keyId) {
        const keyData = this.keys.get(keyId);
        return keyData ? keyData.key : null;
    }

    /**
     * Clean up old encryption keys
     */
    _cleanupOldKeys() {
        const sortedKeys = Array.from(this.keys.entries())
            .sort(([, a], [, b]) => b.createdAt - a.createdAt);

        // Keep only the specified number of old keys
        const keysToKeep = this.config.keyRotation.keepOldKeys + 1; // +1 for current key
        
        if (sortedKeys.length > keysToKeep) {
            const keysToDelete = sortedKeys.slice(keysToKeep);
            
            for (const [keyId] of keysToDelete) {
                this.keys.delete(keyId);
                this.logger.debug(`Deleted old encryption key: ${keyId}`);
            }
        }
    }

    /**
     * Validate encryption configuration
     */
    _validateConfig() {
        const errors = [];

        // Validate algorithm
        const supportedAlgorithms = [
            'aes-256-gcm', 'aes-256-cbc', 'aes-192-gcm', 'aes-192-cbc',
            'aes-128-gcm', 'aes-128-cbc'
        ];
        
        if (!supportedAlgorithms.includes(this.config.algorithm)) {
            errors.push(`Unsupported encryption algorithm: ${this.config.algorithm}`);
        }

        // Validate key derivation
        if (this.config.keyDerivation.iterations < 10000) {
            errors.push('Key derivation iterations should be at least 10,000');
        }

        if (this.config.keyDerivation.keyLength < 16) {
            errors.push('Key length should be at least 16 bytes');
        }

        // Validate IV length
        if (this.config.ivLength < 12) {
            errors.push('IV length should be at least 12 bytes');
        }

        // Validate master key
        if (!this.config.masterKey || this.config.masterKey.length < 32) {
            errors.push('Master key must be at least 32 characters');
        }

        if (errors.length > 0) {
            this.logger.error('Encryption configuration validation failed:', errors);
            throw new Error('Invalid encryption configuration');
        }
    }

    /**
     * Export configuration (without sensitive data)
     */
    export() {
        return {
            algorithm: this.config.algorithm,
            keyDerivation: {
                algorithm: this.config.keyDerivation.algorithm,
                iterations: this.config.keyDerivation.iterations,
                keyLength: this.config.keyDerivation.keyLength,
                hashFunction: this.config.keyDerivation.hashFunction
            },
            ivLength: this.config.ivLength,
            tagLength: this.config.tagLength,
            keyRotation: this.config.keyRotation,
            backup: this.config.backup
        };
    }
}

export default EncryptionConfig;

