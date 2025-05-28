/**
 * Encryption Utilities
 * End-to-end encryption for sensitive data transmission
 */

import crypto from 'crypto';
import { SecurityConfig } from '../config/security-config.js';
import { AuditLogger } from '../audit/audit-logger.js';

class EncryptionManager {
  constructor() {
    this.config = SecurityConfig.encryption;
    this.auditLogger = new AuditLogger();
    this.keyCache = new Map();
  }

  /**
   * Generate a new encryption key
   */
  generateKey() {
    return crypto.randomBytes(this.config.keyLength);
  }

  /**
   * Generate initialization vector
   */
  generateIV() {
    return crypto.randomBytes(this.config.ivLength);
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(data, key = null, additionalData = null) {
    try {
      const encryptionKey = key || this.generateKey();
      const iv = this.generateIV();
      
      const cipher = crypto.createCipher(this.config.algorithm, encryptionKey);
      
      if (additionalData) {
        cipher.setAAD(Buffer.from(additionalData));
      }

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();

      const result = {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.config.algorithm
      };

      this.auditLogger.log('system', 'data_encrypted', {
        algorithm: this.config.algorithm,
        dataLength: data.length,
        hasAdditionalData: !!additionalData,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      this.auditLogger.log('system', 'encryption_failed', {
        error: error.message,
        algorithm: this.config.algorithm,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(encryptedData, key, additionalData = null) {
    try {
      const { encrypted, iv, tag, algorithm } = encryptedData;
      
      const decipher = crypto.createDecipher(algorithm, key);
      
      if (additionalData) {
        decipher.setAAD(Buffer.from(additionalData));
      }
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.auditLogger.log('system', 'data_decrypted', {
        algorithm,
        dataLength: decrypted.length,
        hasAdditionalData: !!additionalData,
        timestamp: new Date().toISOString()
      });

      return decrypted;
    } catch (error) {
      this.auditLogger.log('system', 'decryption_failed', {
        error: error.message,
        algorithm: encryptedData.algorithm,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Encrypt object to JSON
   */
  encryptObject(obj, key = null, additionalData = null) {
    const jsonData = JSON.stringify(obj);
    return this.encrypt(jsonData, key, additionalData);
  }

  /**
   * Decrypt JSON to object
   */
  decryptObject(encryptedData, key, additionalData = null) {
    const jsonData = this.decrypt(encryptedData, key, additionalData);
    return JSON.parse(jsonData);
  }

  /**
   * Hash data with SHA-256
   */
  hash(data, salt = null) {
    const hash = crypto.createHash('sha256');
    
    if (salt) {
      hash.update(salt);
    }
    
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Generate HMAC signature
   */
  sign(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verify(data, signature, secret) {
    const expectedSignature = this.sign(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generate secure random string
   */
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate secure random number
   */
  generateRandomNumber(min = 0, max = Number.MAX_SAFE_INTEGER) {
    const range = max - min;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const maxValue = Math.pow(256, bytesNeeded);
    const randomBytes = crypto.randomBytes(bytesNeeded);
    const randomValue = randomBytes.readUIntBE(0, bytesNeeded);
    
    return min + (randomValue % range);
  }

  /**
   * Derive key from password using PBKDF2
   */
  deriveKey(password, salt, iterations = 100000) {
    return crypto.pbkdf2Sync(password, salt, iterations, this.config.keyLength, 'sha256');
  }

  /**
   * Generate salt for password hashing
   */
  generateSalt() {
    return crypto.randomBytes(16);
  }

  /**
   * Encrypt file
   */
  async encryptFile(inputPath, outputPath, key = null) {
    const fs = await import('fs/promises');
    
    try {
      const data = await fs.readFile(inputPath);
      const encryptionKey = key || this.generateKey();
      
      const encryptedData = this.encrypt(data.toString('base64'), encryptionKey);
      
      const fileData = {
        ...encryptedData,
        originalSize: data.length,
        encryptedAt: new Date().toISOString()
      };

      await fs.writeFile(outputPath, JSON.stringify(fileData, null, 2));

      this.auditLogger.log('system', 'file_encrypted', {
        inputPath,
        outputPath,
        originalSize: data.length,
        timestamp: new Date().toISOString()
      });

      return encryptionKey;
    } catch (error) {
      this.auditLogger.log('system', 'file_encryption_failed', {
        inputPath,
        outputPath,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Decrypt file
   */
  async decryptFile(inputPath, outputPath, key) {
    const fs = await import('fs/promises');
    
    try {
      const fileContent = await fs.readFile(inputPath, 'utf8');
      const fileData = JSON.parse(fileContent);
      
      const decryptedBase64 = this.decrypt(fileData, key);
      const decryptedData = Buffer.from(decryptedBase64, 'base64');
      
      await fs.writeFile(outputPath, decryptedData);

      this.auditLogger.log('system', 'file_decrypted', {
        inputPath,
        outputPath,
        originalSize: fileData.originalSize,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      this.auditLogger.log('system', 'file_decryption_failed', {
        inputPath,
        outputPath,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Encrypt stream data
   */
  createEncryptionStream(key = null) {
    const encryptionKey = key || this.generateKey();
    const iv = this.generateIV();
    
    const cipher = crypto.createCipher(this.config.algorithm, encryptionKey);
    
    return {
      stream: cipher,
      key: encryptionKey,
      iv: iv.toString('hex'),
      getTag: () => cipher.getAuthTag().toString('hex')
    };
  }

  /**
   * Decrypt stream data
   */
  createDecryptionStream(key, iv, tag) {
    const decipher = crypto.createDecipher(this.config.algorithm, key);
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    return decipher;
  }

  /**
   * Secure data wipe
   */
  secureWipe(data) {
    if (typeof data === 'string') {
      // Overwrite string memory (limited effectiveness in JS)
      for (let i = 0; i < data.length; i++) {
        data = data.substring(0, i) + '\0' + data.substring(i + 1);
      }
    } else if (Buffer.isBuffer(data)) {
      // Overwrite buffer with random data
      crypto.randomFillSync(data);
    }
  }

  /**
   * Generate key pair for asymmetric encryption
   */
  generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
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

    this.auditLogger.log('system', 'key_pair_generated', {
      keyType: 'rsa',
      modulusLength: 2048,
      timestamp: new Date().toISOString()
    });

    return { publicKey, privateKey };
  }

  /**
   * Encrypt with public key
   */
  encryptWithPublicKey(data, publicKey) {
    try {
      const encrypted = crypto.publicEncrypt(publicKey, Buffer.from(data));
      
      this.auditLogger.log('system', 'public_key_encryption', {
        dataLength: data.length,
        timestamp: new Date().toISOString()
      });

      return encrypted.toString('base64');
    } catch (error) {
      this.auditLogger.log('system', 'public_key_encryption_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Decrypt with private key
   */
  decryptWithPrivateKey(encryptedData, privateKey) {
    try {
      const decrypted = crypto.privateDecrypt(privateKey, Buffer.from(encryptedData, 'base64'));
      
      this.auditLogger.log('system', 'private_key_decryption', {
        timestamp: new Date().toISOString()
      });

      return decrypted.toString();
    } catch (error) {
      this.auditLogger.log('system', 'private_key_decryption_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}

// Export singleton instance
export const encryptionManager = new EncryptionManager();
export default EncryptionManager;

