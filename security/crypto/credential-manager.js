/**
 * Credential Manager
 * Secure storage, retrieval, and rotation of API keys and secrets
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SecurityConfig } from '../config/security-config.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { resolveEnvVariable } from '../../scripts/modules/utils.js';

class CredentialManager {
  constructor() {
    this.config = SecurityConfig.encryption;
    this.auditLogger = new AuditLogger();
    this.credentialStore = new Map();
    this.encryptionKey = null;
    this.initialized = false;
  }

  /**
   * Initialize the credential manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadEncryptionKey();
      await this.loadCredentials();
      this.initialized = true;
      
      this.auditLogger.log('system', 'credential_manager_initialized', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.auditLogger.log('system', 'credential_manager_init_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Load or generate encryption key
   */
  async loadEncryptionKey() {
    const keyPath = path.join(process.cwd(), '.security', 'master.key');
    
    try {
      // Try to load existing key
      const keyData = await fs.readFile(keyPath);
      this.encryptionKey = keyData;
    } catch (error) {
      // Generate new key if none exists
      this.encryptionKey = crypto.randomBytes(this.config.keyLength);
      
      // Ensure .security directory exists
      await fs.mkdir(path.dirname(keyPath), { recursive: true });
      
      // Save key with restricted permissions
      await fs.writeFile(keyPath, this.encryptionKey, { mode: 0o600 });
      
      this.auditLogger.log('system', 'encryption_key_generated', {
        keyPath: keyPath,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Encrypt a secret value
   */
  encrypt(plaintext) {
    if (!this.encryptionKey) {
      throw new Error('Credential manager not initialized');
    }

    const iv = crypto.randomBytes(this.config.ivLength);
    const cipher = crypto.createCipher(this.config.algorithm, this.encryptionKey);
    cipher.setAAD(Buffer.from('credential-manager'));

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      algorithm: this.config.algorithm
    };
  }

  /**
   * Decrypt a secret value
   */
  decrypt(encryptedData) {
    if (!this.encryptionKey) {
      throw new Error('Credential manager not initialized');
    }

    const { encrypted, iv, tag, algorithm } = encryptedData;
    
    const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
    decipher.setAAD(Buffer.from('credential-manager'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Store a secret securely
   */
  async setSecret(key, value, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const encryptedValue = this.encrypt(value);
      const credentialData = {
        ...encryptedValue,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          lastRotated: new Date().toISOString()
        }
      };

      this.credentialStore.set(key, credentialData);
      await this.persistCredentials();

      this.auditLogger.log('data', 'secret_stored', {
        key: this.hashKey(key),
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      this.auditLogger.log('system', 'secret_store_failed', {
        key: this.hashKey(key),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Retrieve a secret
   */
  async getSecret(key, session = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    // First check environment variables (highest priority)
    const envValue = resolveEnvVariable(key, session);
    if (envValue) {
      this.auditLogger.log('data', 'secret_retrieved_from_env', {
        key: this.hashKey(key),
        timestamp: new Date().toISOString()
      });
      return envValue;
    }

    // Then check encrypted store
    const credentialData = this.credentialStore.get(key);
    if (!credentialData) {
      this.auditLogger.log('data', 'secret_not_found', {
        key: this.hashKey(key),
        timestamp: new Date().toISOString()
      });
      return null;
    }

    try {
      const decryptedValue = this.decrypt(credentialData);
      
      this.auditLogger.log('data', 'secret_retrieved_from_store', {
        key: this.hashKey(key),
        timestamp: new Date().toISOString()
      });

      return decryptedValue;
    } catch (error) {
      this.auditLogger.log('system', 'secret_decrypt_failed', {
        key: this.hashKey(key),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Rotate a secret (generate new value)
   */
  async rotateSecret(key, newValue = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const oldValue = await this.getSecret(key);
    if (!oldValue) {
      throw new Error(`Secret ${key} not found for rotation`);
    }

    // Generate new value if not provided
    if (!newValue) {
      newValue = this.generateSecretValue(key);
    }

    // Store new value
    await this.setSecret(key, newValue, {
      rotated: true,
      previousRotation: new Date().toISOString()
    });

    this.auditLogger.log('system', 'secret_rotated', {
      key: this.hashKey(key),
      timestamp: new Date().toISOString()
    });

    return newValue;
  }

  /**
   * Generate a secure secret value
   */
  generateSecretValue(keyType) {
    const length = keyType.includes('API_KEY') ? 64 : 32;
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate access to a resource
   */
  async validateAccess(user, resource, action = 'read') {
    if (!user || !resource) {
      return false;
    }

    const userRole = user.role || SecurityConfig.authorization.defaultRole;
    const roleConfig = SecurityConfig.authorization.roles[userRole];

    if (!roleConfig) {
      this.auditLogger.log('authorization', 'invalid_role', {
        userId: user.id,
        role: userRole,
        resource,
        action,
        timestamp: new Date().toISOString()
      });
      return false;
    }

    // Check if user has wildcard permission
    if (roleConfig.permissions.includes('*')) {
      this.auditLogger.log('authorization', 'access_granted_wildcard', {
        userId: user.id,
        role: userRole,
        resource,
        action,
        timestamp: new Date().toISOString()
      });
      return true;
    }

    // Check specific permission
    const permission = `${resource}:${action}`;
    const hasPermission = roleConfig.permissions.includes(permission);

    this.auditLogger.log('authorization', hasPermission ? 'access_granted' : 'access_denied', {
      userId: user.id,
      role: userRole,
      resource,
      action,
      permission,
      timestamp: new Date().toISOString()
    });

    return hasPermission;
  }

  /**
   * List all stored secrets (metadata only)
   */
  async listSecrets() {
    if (!this.initialized) {
      await this.initialize();
    }

    const secrets = [];
    for (const [key, data] of this.credentialStore.entries()) {
      secrets.push({
        key: this.hashKey(key),
        metadata: data.metadata,
        algorithm: data.algorithm
      });
    }

    return secrets;
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    const existed = this.credentialStore.delete(key);
    if (existed) {
      await this.persistCredentials();
      
      this.auditLogger.log('data', 'secret_deleted', {
        key: this.hashKey(key),
        timestamp: new Date().toISOString()
      });
    }

    return existed;
  }

  /**
   * Load credentials from persistent storage
   */
  async loadCredentials() {
    const credentialsPath = path.join(process.cwd(), '.security', 'credentials.enc');
    
    try {
      const encryptedData = await fs.readFile(credentialsPath, 'utf8');
      const credentials = JSON.parse(encryptedData);
      
      for (const [key, data] of Object.entries(credentials)) {
        this.credentialStore.set(key, data);
      }
    } catch (error) {
      // File doesn't exist or is corrupted, start with empty store
      this.credentialStore.clear();
    }
  }

  /**
   * Persist credentials to storage
   */
  async persistCredentials() {
    const credentialsPath = path.join(process.cwd(), '.security', 'credentials.enc');
    const credentials = Object.fromEntries(this.credentialStore);
    
    await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
    await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  }

  /**
   * Hash a key for logging (to avoid exposing actual key names)
   */
  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Check if credentials need rotation
   */
  async checkRotationNeeded() {
    const rotationInterval = this.parseInterval(this.config.keyRotationInterval);
    const now = new Date();
    const needsRotation = [];

    for (const [key, data] of this.credentialStore.entries()) {
      const lastRotated = new Date(data.metadata.lastRotated);
      const timeSinceRotation = now - lastRotated;

      if (timeSinceRotation > rotationInterval) {
        needsRotation.push({
          key,
          lastRotated: data.metadata.lastRotated,
          daysSinceRotation: Math.floor(timeSinceRotation / (1000 * 60 * 60 * 24))
        });
      }
    }

    return needsRotation;
  }

  /**
   * Parse interval string to milliseconds
   */
  parseInterval(interval) {
    const units = {
      'd': 24 * 60 * 60 * 1000,
      'h': 60 * 60 * 1000,
      'm': 60 * 1000,
      's': 1000
    };

    const match = interval.match(/^(\d+)([dhms])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }
}

// Export singleton instance
export const credentialManager = new CredentialManager();
export default CredentialManager;

