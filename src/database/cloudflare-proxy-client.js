/**
 * Cloudflare Database Proxy Client
 * Client library for connecting to PostgreSQL through Cloudflare Worker proxy
 */

import { getConfig, validateConfig, HEALTH_CHECK } from '../../config/database-proxy.js';

export class CloudflareProxyClient {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
    validateConfig(this.config);
    
    this.isHealthy = true;
    this.failureCount = 0;
    this.lastHealthCheck = null;
    this.connectionPool = new Map();
    
    // Start health monitoring if enabled
    if (this.config.FAILOVER.enabled) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Execute a database query through the Cloudflare proxy
   */
  async query(sql, params = []) {
    const startTime = Date.now();
    
    try {
      // Validate query
      this.validateQuery(sql);
      
      // Check if service is healthy
      if (!this.isHealthy && this.config.FAILOVER.enabled) {
        throw new Error('Database proxy is currently unhealthy');
      }
      
      // Prepare request
      const requestBody = {
        query: sql,
        params: params || [],
      };
      
      // Execute with retry logic
      const result = await this.executeWithRetry(requestBody);
      
      // Log metrics if enabled
      if (this.config.MONITORING.enableMetrics) {
        this.logMetrics('query_success', Date.now() - startTime, sql);
      }
      
      return result;
      
    } catch (error) {
      // Log error if enabled
      if (this.config.MONITORING.logErrors) {
        console.error('Database query failed:', {
          sql: sql.substring(0, 200),
          error: error.message,
          executionTime: Date.now() - startTime,
        });
      }
      
      // Update failure count for health monitoring
      this.failureCount++;
      
      throw error;
    }
  }

  /**
   * Execute request with retry logic
   */
  async executeWithRetry(requestBody, attempt = 1) {
    try {
      const response = await this.makeRequest(requestBody);
      
      // Reset failure count on success
      this.failureCount = 0;
      
      return response;
      
    } catch (error) {
      // Check if we should retry
      if (attempt < this.config.CONNECTION.retries && this.shouldRetry(error)) {
        const delay = this.calculateBackoffDelay(attempt);
        
        if (this.config.MONITORING.logErrors) {
          console.warn(`Database request failed, retrying in ${delay}ms (attempt ${attempt}/${this.config.CONNECTION.retries}):`, error.message);
        }
        
        await this.sleep(delay);
        return this.executeWithRetry(requestBody, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Make HTTP request to Cloudflare Worker
   */
  async makeRequest(requestBody) {
    const url = this.getCurrentProxyUrl();
    
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.API_TOKEN}`,
        'User-Agent': 'claude-task-master-db-client/1.0.0',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.CONNECTION.timeout),
    };
    
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Database query failed');
    }
    
    return result;
  }

  /**
   * Get current proxy URL (with failover support)
   */
  getCurrentProxyUrl() {
    if (this.isHealthy) {
      return this.config.PROXY_URL;
    }
    
    // Try failover URLs if primary is unhealthy
    if (this.config.FAILOVER.fallbackUrls.length > 0) {
      return this.config.FAILOVER.fallbackUrls[0];
    }
    
    return this.config.PROXY_URL;
  }

  /**
   * Validate SQL query
   */
  validateQuery(sql) {
    if (!sql || typeof sql !== 'string') {
      throw new Error('Query must be a non-empty string');
    }
    
    if (sql.length > this.config.QUERY.maxLength) {
      throw new Error(`Query exceeds maximum length of ${this.config.QUERY.maxLength} characters`);
    }
    
    // Basic validation for dangerous operations
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /DROP\s+DATABASE/i,
      /TRUNCATE/i,
      /DELETE\s+FROM\s+\w+\s*$/i, // DELETE without WHERE clause
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error('Query contains potentially dangerous operations');
      }
    }
  }

  /**
   * Check if error is retryable
   */
  shouldRetry(error) {
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Rate limit exceeded',
      'Internal server error',
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }

  /**
   * Calculate backoff delay for retries
   */
  calculateBackoffDelay(attempt) {
    const baseDelay = this.config.CONNECTION.retryDelay;
    const backoffDelay = baseDelay * Math.pow(this.config.RATE_LIMITS.backoffMultiplier, attempt - 1);
    
    return Math.min(backoffDelay, this.config.RATE_LIMITS.maxBackoffTime);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        if (this.config.MONITORING.logErrors) {
          console.error('Health check failed:', error.message);
        }
      }
    }, this.config.FAILOVER.healthCheckInterval);
  }

  /**
   * Perform health check
   */
  async healthCheck() {
    try {
      const result = await this.makeRequest({
        query: HEALTH_CHECK.query,
        params: [],
      });
      
      // Check if response matches expected format
      const isHealthy = result.success && 
                       result.data && 
                       result.data.length > 0 &&
                       result.data[0].health_check === 1;
      
      if (isHealthy) {
        this.isHealthy = true;
        this.failureCount = 0;
      } else {
        this.markUnhealthy();
      }
      
      this.lastHealthCheck = new Date();
      
    } catch (error) {
      this.markUnhealthy();
      throw error;
    }
  }

  /**
   * Mark service as unhealthy
   */
  markUnhealthy() {
    this.failureCount++;
    
    if (this.failureCount >= this.config.FAILOVER.maxFailures) {
      this.isHealthy = false;
    }
  }

  /**
   * Log metrics
   */
  logMetrics(event, duration, query = null) {
    const metrics = {
      timestamp: new Date().toISOString(),
      event,
      duration,
      query: query ? query.substring(0, 100) : null,
      isHealthy: this.isHealthy,
      failureCount: this.failureCount,
    };
    
    if (this.config.MONITORING.logQueries) {
      console.log('Database metrics:', metrics);
    }
    
    // Send to external metrics endpoint if configured
    if (this.config.MONITORING.metricsEndpoint) {
      this.sendMetrics(metrics).catch(error => {
        console.error('Failed to send metrics:', error.message);
      });
    }
  }

  /**
   * Send metrics to external endpoint
   */
  async sendMetrics(metrics) {
    try {
      await fetch(this.config.MONITORING.metricsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metrics),
      });
    } catch (error) {
      // Silently fail metrics sending to avoid affecting main functionality
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isHealthy: this.isHealthy,
      failureCount: this.failureCount,
      lastHealthCheck: this.lastHealthCheck,
      proxyUrl: this.getCurrentProxyUrl(),
      config: {
        timeout: this.config.CONNECTION.timeout,
        retries: this.config.CONNECTION.retries,
        rateLimit: this.config.RATE_LIMITS.requestsPerMinute,
      },
    };
  }

  /**
   * Close client and cleanup resources
   */
  async close() {
    // Clear any active intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Clear connection pool
    this.connectionPool.clear();
  }
}

/**
 * Create a singleton instance for easy use
 */
let defaultClient = null;

export function createClient(options = {}) {
  return new CloudflareProxyClient(options);
}

export function getDefaultClient(options = {}) {
  if (!defaultClient) {
    defaultClient = new CloudflareProxyClient(options);
  }
  return defaultClient;
}

/**
 * Convenience methods for common operations
 */
export async function query(sql, params = []) {
  const client = getDefaultClient();
  return client.query(sql, params);
}

export async function healthCheck() {
  const client = getDefaultClient();
  return client.healthCheck();
}

export async function getStatus() {
  const client = getDefaultClient();
  return client.getStatus();
}

