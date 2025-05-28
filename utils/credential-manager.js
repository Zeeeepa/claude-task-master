/**
 * Enhanced Credential Manager Utility
 * Integrates the security framework with the existing task-master system
 */

import { credentialManager as securityCredentialManager } from '../security/index.js';
import { resolveEnvVariable } from '../scripts/modules/utils.js';
import { auditLogger } from '../security/audit/audit-logger.js';

class TaskMasterCredentialManager {
  constructor() {
    this.securityManager = securityCredentialManager;
    this.initialized = false;
  }

  /**
   * Initialize the credential manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.securityManager.initialize();
      this.initialized = true;
      
      auditLogger.log('system', 'task_master_credential_manager_initialized', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      auditLogger.log('system', 'task_master_credential_manager_init_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get API key with fallback to environment variables
   * This maintains compatibility with existing code while adding security
   */
  async getApiKey(provider, session = null) {
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    
    try {
      // First try environment variables (for backward compatibility)
      const envValue = resolveEnvVariable(keyName, session);
      if (envValue) {
        auditLogger.log('data', 'api_key_retrieved_from_env', {
          provider,
          keyName: this.hashKey(keyName),
          timestamp: new Date().toISOString()
        });
        return envValue;
      }

      // Then try secure credential store
      if (!this.initialized) {
        await this.initialize();
      }

      const secureValue = await this.securityManager.getSecret(keyName, session);
      if (secureValue) {
        auditLogger.log('data', 'api_key_retrieved_from_secure_store', {
          provider,
          keyName: this.hashKey(keyName),
          timestamp: new Date().toISOString()
        });
        return secureValue;
      }

      auditLogger.log('data', 'api_key_not_found', {
        provider,
        keyName: this.hashKey(keyName),
        timestamp: new Date().toISOString()
      });

      return null;
    } catch (error) {
      auditLogger.log('system', 'api_key_retrieval_failed', {
        provider,
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Store API key securely
   */
  async setApiKey(provider, apiKey, metadata = {}) {
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      await this.securityManager.setSecret(keyName, apiKey, {
        ...metadata,
        provider,
        type: 'api_key',
        setBy: 'task_master'
      });

      auditLogger.log('data', 'api_key_stored', {
        provider,
        keyName: this.hashKey(keyName),
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      auditLogger.log('system', 'api_key_storage_failed', {
        provider,
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Rotate API key
   */
  async rotateApiKey(provider, newApiKey = null) {
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const rotatedKey = await this.securityManager.rotateSecret(keyName, newApiKey);

      auditLogger.log('system', 'api_key_rotated', {
        provider,
        keyName: this.hashKey(keyName),
        timestamp: new Date().toISOString()
      });

      return rotatedKey;
    } catch (error) {
      auditLogger.log('system', 'api_key_rotation_failed', {
        provider,
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check if API key is available for provider
   */
  async hasApiKey(provider, session = null) {
    try {
      const apiKey = await this.getApiKey(provider, session);
      return !!apiKey;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all available providers with API keys
   */
  async getAvailableProviders(session = null) {
    const providers = [
      'anthropic',
      'openai',
      'perplexity',
      'google',
      'mistral',
      'openrouter',
      'xai',
      'azure'
    ];

    const available = [];
    
    for (const provider of providers) {
      if (await this.hasApiKey(provider, session)) {
        available.push(provider);
      }
    }

    auditLogger.log('data', 'available_providers_checked', {
      totalProviders: providers.length,
      availableProviders: available.length,
      providers: available,
      timestamp: new Date().toISOString()
    });

    return available;
  }

  /**
   * Validate API key format
   */
  validateApiKeyFormat(provider, apiKey) {
    const patterns = {
      anthropic: /^sk-ant-api03-[a-zA-Z0-9_-]{95}$/,
      openai: /^sk-[a-zA-Z0-9]{48}$/,
      perplexity: /^pplx-[a-zA-Z0-9]{56}$/,
      google: /^[a-zA-Z0-9_-]{39}$/,
      mistral: /^[a-zA-Z0-9]{32}$/,
      openrouter: /^sk-or-v1-[a-zA-Z0-9]{64}$/,
      xai: /^xai-[a-zA-Z0-9]{48}$/
    };

    const pattern = patterns[provider.toLowerCase()];
    if (!pattern) {
      return { valid: false, reason: 'Unknown provider' };
    }

    const isValid = pattern.test(apiKey);
    return {
      valid: isValid,
      reason: isValid ? 'Valid format' : 'Invalid format for provider'
    };
  }

  /**
   * Store webhook secret
   */
  async setWebhookSecret(service, secret, metadata = {}) {
    const keyName = `${service.toUpperCase()}_WEBHOOK_SECRET`;
    
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      await this.securityManager.setSecret(keyName, secret, {
        ...metadata,
        service,
        type: 'webhook_secret',
        setBy: 'task_master'
      });

      auditLogger.log('data', 'webhook_secret_stored', {
        service,
        keyName: this.hashKey(keyName),
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      auditLogger.log('system', 'webhook_secret_storage_failed', {
        service,
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get webhook secret
   */
  async getWebhookSecret(service, session = null) {
    const keyName = `${service.toUpperCase()}_WEBHOOK_SECRET`;
    
    try {
      // First try environment variables
      const envValue = resolveEnvVariable(keyName, session);
      if (envValue) {
        return envValue;
      }

      // Then try secure store
      if (!this.initialized) {
        await this.initialize();
      }

      return await this.securityManager.getSecret(keyName, session);
    } catch (error) {
      auditLogger.log('system', 'webhook_secret_retrieval_failed', {
        service,
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Store database credentials
   */
  async setDatabaseCredentials(credentials, metadata = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const credentialKeys = {
        'DB_HOST': credentials.host,
        'DB_PORT': credentials.port?.toString(),
        'DB_NAME': credentials.database,
        'DB_USER': credentials.username,
        'DB_PASSWORD': credentials.password,
        'DB_SSL_MODE': credentials.sslMode || 'require'
      };

      for (const [key, value] of Object.entries(credentialKeys)) {
        if (value) {
          await this.securityManager.setSecret(key, value, {
            ...metadata,
            type: 'database_credential',
            setBy: 'task_master'
          });
        }
      }

      auditLogger.log('data', 'database_credentials_stored', {
        host: credentials.host,
        database: credentials.database,
        username: credentials.username,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      auditLogger.log('system', 'database_credentials_storage_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get database credentials
   */
  async getDatabaseCredentials(session = null) {
    try {
      const credentials = {};
      const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_MODE'];

      for (const key of keys) {
        // Try environment first
        let value = resolveEnvVariable(key, session);
        
        // Then try secure store
        if (!value && this.initialized) {
          value = await this.securityManager.getSecret(key, session);
        }

        if (value) {
          const mappedKey = key.replace('DB_', '').toLowerCase();
          credentials[mappedKey === 'name' ? 'database' : mappedKey] = value;
        }
      }

      // Convert port to number
      if (credentials.port) {
        credentials.port = parseInt(credentials.port, 10);
      }

      auditLogger.log('data', 'database_credentials_retrieved', {
        host: credentials.host,
        database: credentials.database,
        username: credentials.username,
        hasPassword: !!credentials.password,
        timestamp: new Date().toISOString()
      });

      return credentials;
    } catch (error) {
      auditLogger.log('system', 'database_credentials_retrieval_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * List all stored credentials (metadata only)
   */
  async listCredentials() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      return await this.securityManager.listSecrets();
    } catch (error) {
      auditLogger.log('system', 'credentials_list_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Delete credential
   */
  async deleteCredential(keyName) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const deleted = await this.securityManager.deleteSecret(keyName);

      auditLogger.log('data', 'credential_deleted', {
        keyName: this.hashKey(keyName),
        deleted,
        timestamp: new Date().toISOString()
      });

      return deleted;
    } catch (error) {
      auditLogger.log('system', 'credential_deletion_failed', {
        keyName: this.hashKey(keyName),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Hash key for logging
   */
  hashKey(key) {
    return this.securityManager.hashKey(key);
  }

  /**
   * Check credentials that need rotation
   */
  async checkRotationNeeded() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      return await this.securityManager.checkRotationNeeded();
    } catch (error) {
      auditLogger.log('system', 'rotation_check_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Migrate environment variables to secure store
   */
  async migrateEnvironmentVariables() {
    const envKeys = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'PERPLEXITY_API_KEY',
      'GOOGLE_API_KEY',
      'MISTRAL_API_KEY',
      'OPENROUTER_API_KEY',
      'XAI_API_KEY',
      'AZURE_OPENAI_API_KEY'
    ];

    const migrated = [];
    const errors = [];

    for (const key of envKeys) {
      try {
        const value = process.env[key];
        if (value) {
          await this.securityManager.setSecret(key, value, {
            migratedFrom: 'environment',
            migratedAt: new Date().toISOString()
          });
          migrated.push(key);
        }
      } catch (error) {
        errors.push({ key, error: error.message });
      }
    }

    auditLogger.log('system', 'environment_variables_migrated', {
      migratedCount: migrated.length,
      errorCount: errors.length,
      migrated: migrated.map(k => this.hashKey(k)),
      errors,
      timestamp: new Date().toISOString()
    });

    return { migrated, errors };
  }
}

// Export singleton instance
export const taskMasterCredentialManager = new TaskMasterCredentialManager();
export default taskMasterCredentialManager;

