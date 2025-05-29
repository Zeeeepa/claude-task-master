/**
 * Unified Encryption Service
 * 
 * Provides comprehensive encryption capabilities for data at rest and in transit.
 * Consolidates encryption functionality from multiple security implementations.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

export class EncryptionService extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = {
            algorithm: 'aes-256-gcm',
            keyDerivation: {
                algorithm: 'pbkdf2',
                iterations: 100000,
                keyLength: 32,
                digest: 'sha256'
            },
            ...config
        };
        
        // Key storage
        this.keys = new Map();
        this.keyRotationSchedule = new Map();
        
        this.initialized = false;
    }

    /**
     * Initialize encryption service
     */
    async initialize() {
        try {
            // Generate master key if not provided
            if (!this.config.masterKey) {
                this.config.masterKey = await this._generateMasterKey();
                console.warn('Generated new master key. Store securely for production use.');
            }
            
            // Initialize default encryption key
            await this._initializeDefaultKey();
            
            // Setup key rotation if enabled
            if (this.config.dataAtRest?.keyRotation?.enabled) {
                await this._setupKeyRotation();
            }
            
            this.initialized = true;
            this.emit('initialized');
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Generate master key
     */
    async _generateMasterKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Initialize default encryption key
     */
    async _initializeDefaultKey() {
        const defaultKey = await this._deriveKey(this.config.masterKey, 'default');
        this.keys.set('default', {
            key: defaultKey,
            createdAt: new Date(),
            algorithm: this.config.algorithm,
            active: true
        });
    }

    /**
     * Setup key rotation
     */
    async _setupKeyRotation() {
        const intervalDays = this.config.dataAtRest.keyRotation.intervalDays || 90;
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        
        setInterval(async () => {
            try {
                await this._rotateKeys();
            } catch (error) {
                this.emit('error', error);
            }
        }, intervalMs);
    }

    /**
     * Derive encryption key from master key
     */
    async _deriveKey(masterKey, salt) {
        const keyDerivation = this.config.keyDerivation;
        
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(
                masterKey,
                salt,
                keyDerivation.iterations,
                keyDerivation.keyLength,
                keyDerivation.digest,
                (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve(derivedKey);
                }
            );
        });
    }

    /**
     * Encrypt data
     */
    async encrypt(data, options = {}) {
        if (!this.initialized) {
            throw new Error('Encryption service not initialized');
        }

        try {
            const keyId = options.keyId || 'default';
            const keyData = this.keys.get(keyId);
            
            if (!keyData || !keyData.active) {
                throw new Error(`Encryption key ${keyId} not found or inactive`);
            }

            const algorithm = options.algorithm || keyData.algorithm;
            const iv = crypto.randomBytes(16);
            
            let encryptedData;
            let authTag;

            if (algorithm.includes('gcm')) {
                // GCM mode provides built-in authentication
                const cipher = crypto.createCipher(algorithm, keyData.key);
                cipher.setAAD(Buffer.from(options.additionalData || ''));
                
                encryptedData = Buffer.concat([
                    cipher.update(Buffer.from(JSON.stringify(data), 'utf8')),
                    cipher.final()
                ]);
                
                authTag = cipher.getAuthTag();
            } else {
                // CBC mode with separate HMAC for authentication
                const cipher = crypto.createCipher(algorithm, keyData.key);
                encryptedData = Buffer.concat([
                    cipher.update(Buffer.from(JSON.stringify(data), 'utf8')),
                    cipher.final()
                ]);
                
                // Generate HMAC for authentication
                const hmac = crypto.createHmac('sha256', keyData.key);
                hmac.update(encryptedData);
                authTag = hmac.digest();
            }

            const result = {
                algorithm,
                keyId,
                iv: iv.toString('hex'),
                data: encryptedData.toString('hex'),
                authTag: authTag.toString('hex'),
                timestamp: new Date().toISOString()
            };

            // Add metadata if provided
            if (options.metadata) {
                result.metadata = options.metadata;
            }

            return result;

        } catch (error) {
            this.emit('encryptionError', { error: error.message, data: typeof data });
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt data
     */
    async decrypt(encryptedData, options = {}) {
        if (!this.initialized) {
            throw new Error('Encryption service not initialized');
        }

        try {
            const { algorithm, keyId, iv, data, authTag } = encryptedData;
            const keyData = this.keys.get(keyId);
            
            if (!keyData) {
                throw new Error(`Decryption key ${keyId} not found`);
            }

            const ivBuffer = Buffer.from(iv, 'hex');
            const dataBuffer = Buffer.from(data, 'hex');
            const authTagBuffer = Buffer.from(authTag, 'hex');

            let decryptedData;

            if (algorithm.includes('gcm')) {
                // GCM mode with built-in authentication
                const decipher = crypto.createDecipher(algorithm, keyData.key);
                decipher.setAuthTag(authTagBuffer);
                
                if (options.additionalData) {
                    decipher.setAAD(Buffer.from(options.additionalData));
                }
                
                decryptedData = Buffer.concat([
                    decipher.update(dataBuffer),
                    decipher.final()
                ]);
            } else {
                // CBC mode - verify HMAC first
                const hmac = crypto.createHmac('sha256', keyData.key);
                hmac.update(dataBuffer);
                const computedAuthTag = hmac.digest();
                
                if (!crypto.timingSafeEqual(authTagBuffer, computedAuthTag)) {
                    throw new Error('Authentication verification failed');
                }
                
                const decipher = crypto.createDecipher(algorithm, keyData.key);
                decryptedData = Buffer.concat([
                    decipher.update(dataBuffer),
                    decipher.final()
                ]);
            }

            return JSON.parse(decryptedData.toString('utf8'));

        } catch (error) {
            this.emit('decryptionError', { error: error.message });
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Hash data with salt
     */
    async hash(data, options = {}) {
        const algorithm = options.algorithm || 'sha256';
        const salt = options.salt || crypto.randomBytes(16).toString('hex');
        const iterations = options.iterations || 10000;

        if (options.useScrypt) {
            // Use scrypt for password hashing
            return new Promise((resolve, reject) => {
                crypto.scrypt(data, salt, 64, (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve({
                        hash: derivedKey.toString('hex'),
                        salt,
                        algorithm: 'scrypt',
                        iterations
                    });
                });
            });
        } else {
            // Use PBKDF2 for general purpose hashing
            return new Promise((resolve, reject) => {
                crypto.pbkdf2(data, salt, iterations, 64, algorithm, (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve({
                        hash: derivedKey.toString('hex'),
                        salt,
                        algorithm,
                        iterations
                    });
                });
            });
        }
    }

    /**
     * Verify hash
     */
    async verifyHash(data, hashData) {
        try {
            const { hash, salt, algorithm, iterations } = hashData;
            
            let computedHash;
            
            if (algorithm === 'scrypt') {
                computedHash = await new Promise((resolve, reject) => {
                    crypto.scrypt(data, salt, 64, (err, derivedKey) => {
                        if (err) reject(err);
                        else resolve(derivedKey.toString('hex'));
                    });
                });
            } else {
                computedHash = await new Promise((resolve, reject) => {
                    crypto.pbkdf2(data, salt, iterations, 64, algorithm, (err, derivedKey) => {
                        if (err) reject(err);
                        else resolve(derivedKey.toString('hex'));
                    });
                });
            }
            
            return crypto.timingSafeEqual(
                Buffer.from(hash, 'hex'),
                Buffer.from(computedHash, 'hex')
            );
            
        } catch (error) {
            this.emit('hashVerificationError', { error: error.message });
            return false;
        }
    }

    /**
     * Generate secure random data
     */
    async generateRandom(length = 32, encoding = 'hex') {
        return crypto.randomBytes(length).toString(encoding);
    }

    /**
     * Generate cryptographic signature
     */
    async sign(data, privateKey, algorithm = 'sha256') {
        try {
            const sign = crypto.createSign(algorithm);
            sign.update(JSON.stringify(data));
            return sign.sign(privateKey, 'hex');
        } catch (error) {
            this.emit('signingError', { error: error.message });
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    /**
     * Verify cryptographic signature
     */
    async verify(data, signature, publicKey, algorithm = 'sha256') {
        try {
            const verify = crypto.createVerify(algorithm);
            verify.update(JSON.stringify(data));
            return verify.verify(publicKey, signature, 'hex');
        } catch (error) {
            this.emit('verificationError', { error: error.message });
            return false;
        }
    }

    /**
     * Generate key pair for asymmetric encryption
     */
    async generateKeyPair(options = {}) {
        const keyOptions = {
            type: options.type || 'rsa',
            modulusLength: options.modulusLength || 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        };

        return new Promise((resolve, reject) => {
            crypto.generateKeyPair(keyOptions.type, keyOptions, (err, publicKey, privateKey) => {
                if (err) reject(err);
                else resolve({ publicKey, privateKey });
            });
        });
    }

    /**
     * Rotate encryption keys
     */
    async _rotateKeys() {
        try {
            // Generate new key
            const newKeyId = `key_${Date.now()}`;
            const newKey = await this._deriveKey(this.config.masterKey, newKeyId);
            
            // Add new key
            this.keys.set(newKeyId, {
                key: newKey,
                createdAt: new Date(),
                algorithm: this.config.algorithm,
                active: true
            });
            
            // Mark old keys as inactive (but keep for decryption)
            for (const [keyId, keyData] of this.keys) {
                if (keyId !== newKeyId && keyData.active) {
                    keyData.active = false;
                    keyData.rotatedAt = new Date();
                }
            }
            
            // Update default key
            this.keys.set('default', this.keys.get(newKeyId));
            
            this.emit('keyRotated', { newKeyId, timestamp: new Date() });
            
        } catch (error) {
            this.emit('keyRotationError', { error: error.message });
            throw error;
        }
    }

    /**
     * Get key information
     */
    async getKeyInfo(keyId = 'default') {
        const keyData = this.keys.get(keyId);
        if (!keyData) {
            throw new Error(`Key ${keyId} not found`);
        }
        
        return {
            keyId,
            algorithm: keyData.algorithm,
            createdAt: keyData.createdAt,
            active: keyData.active,
            rotatedAt: keyData.rotatedAt
        };
    }

    /**
     * List all keys
     */
    async listKeys() {
        const keyList = [];
        
        for (const [keyId, keyData] of this.keys) {
            keyList.push({
                keyId,
                algorithm: keyData.algorithm,
                createdAt: keyData.createdAt,
                active: keyData.active,
                rotatedAt: keyData.rotatedAt
            });
        }
        
        return keyList.sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Health check
     */
    async healthCheck() {
        const activeKeys = Array.from(this.keys.values()).filter(key => key.active).length;
        const totalKeys = this.keys.size;
        
        return {
            status: 'ok',
            activeKeys,
            totalKeys,
            algorithm: this.config.algorithm,
            keyRotationEnabled: this.config.dataAtRest?.keyRotation?.enabled || false
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        // Clear sensitive data from memory
        for (const keyData of this.keys.values()) {
            if (keyData.key && keyData.key.fill) {
                keyData.key.fill(0);
            }
        }
        
        this.keys.clear();
        this.keyRotationSchedule.clear();
        this.initialized = false;
    }
}

export default EncryptionService;

