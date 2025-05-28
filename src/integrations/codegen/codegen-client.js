/**
 * Codegen Client
 * 
 * HTTP client for Codegen API with comprehensive features:
 * - Authentication and API communication
 * - Task creation and status tracking
 * - Error handling and retry logic
 * - Rate limiting and quota management
 * - Mock mode for testing
 */

import axios from 'axios';
import { EventEmitter } from 'events';

export class CodegenClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiKey: process.env.CODEGEN_API_KEY,
      orgId: process.env.CODEGEN_ORG_ID,
      apiUrl: 'https://api.codegen.sh',
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 1000,
      enableMock: false,
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 10,
        requestsPerHour: 100
      },
      ...config
    };
    
    this.httpClient = null;
    this.isInitialized = false;
    this.requestCount = {
      minute: 0,
      hour: 0,
      lastMinuteReset: Date.now(),
      lastHourReset: Date.now()
    };
    
    this.metrics = {
      requestsSent: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      totalResponseTime: 0
    };
    
    this.setupHttpClient();
  }

  /**
   * Setup HTTP client with interceptors
   */
  setupHttpClient() {
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Org-ID': this.config.orgId,
        'User-Agent': 'Codegen-SDK-Integration/1.0.0'
      }
    });

    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        config.metadata = { startTime };
        
        console.log(`Codegen API Request: ${config.method?.toUpperCase()} ${config.url}`);
        this.metrics.requestsSent++;
        
        return config;
      },
      (error) => {
        console.error('Codegen API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const responseTime = Date.now() - response.config.metadata.startTime;
        
        console.log(`Codegen API Response: ${response.status} ${response.config.url} (${responseTime}ms)`);
        
        this.metrics.requestsSuccessful++;
        this.metrics.totalResponseTime += responseTime;
        this.metrics.averageResponseTime = 
          this.metrics.totalResponseTime / this.metrics.requestsSuccessful;
        
        return response;
      },
      async (error) => {
        const responseTime = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;
        
        console.error(`Codegen API Response Error: ${error.response?.status} ${error.message} (${responseTime}ms)`);
        
        this.metrics.requestsFailed++;
        
        // Retry logic for specific errors
        if (this.shouldRetry(error) && error.config && !error.config._retry) {
          error.config._retry = true;
          await this.delay(this.config.retryDelay);
          return this.httpClient.request(error.config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the client
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      console.log('Initializing Codegen Client...');
      
      // Validate configuration
      this.validateConfig();
      
      // Test connection if not in mock mode
      if (!this.config.enableMock) {
        await this.testConnection();
      }
      
      this.isInitialized = true;
      console.log('Codegen Client initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize Codegen Client:', error);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config.enableMock) {
      if (!this.config.apiKey) {
        throw new Error('Codegen API key is required');
      }
      
      if (!this.config.orgId) {
        throw new Error('Codegen organization ID is required');
      }
    }
  }

  /**
   * Test connection to Codegen API
   */
  async testConnection() {
    try {
      const response = await this.httpClient.get('/health');
      console.log('Codegen API connection test successful');
      return response.data;
    } catch (error) {
      throw new Error(`Codegen API connection test failed: ${error.message}`);
    }
  }

  /**
   * Create PR using Codegen API
   */
  async createPR(request) {
    if (!this.isInitialized) {
      throw new Error('Client must be initialized before use');
    }
    
    // Check rate limits
    await this.checkRateLimit();
    
    try {
      console.log(`Creating PR via Codegen: ${request.description}`);
      
      if (this.config.enableMock) {
        return this.mockCreatePR(request);
      }
      
      const response = await this.httpClient.post('/pr/create', {
        description: request.description,
        prompt: request.prompt,
        context: request.context,
        repository: request.repository,
        baseBranch: request.baseBranch || 'main',
        metadata: {
          source: 'codegen-sdk-integration',
          timestamp: new Date().toISOString()
        }
      });
      
      const result = {
        success: true,
        taskId: response.data.taskId,
        status: response.data.status,
        prUrl: response.data.prUrl,
        prNumber: response.data.prNumber,
        repository: request.repository,
        description: request.description,
        metadata: {
          createdAt: new Date().toISOString(),
          responseTime: response.config.metadata 
            ? Date.now() - response.config.metadata.startTime 
            : 0,
          tokensUsed: response.data.tokensUsed
        }
      };
      
      this.emit('prCreated', result);
      
      return result;
      
    } catch (error) {
      console.error('Failed to create PR via Codegen:', error.message);
      
      const errorResult = {
        success: false,
        error: {
          type: this.getErrorType(error),
          message: error.message,
          details: error.response?.data
        },
        repository: request.repository,
        description: request.description,
        metadata: {
          createdAt: new Date().toISOString(),
          responseTime: error.config?.metadata 
            ? Date.now() - error.config.metadata.startTime 
            : 0
        }
      };
      
      this.emit('prFailed', errorResult);
      
      throw new Error(`PR creation failed: ${error.message}`);
    }
  }

  /**
   * Mock PR creation for testing
   */
  mockCreatePR(request) {
    console.log('Mock PR creation:', request.description);
    
    const mockResult = {
      success: true,
      taskId: `mock-task-${Date.now()}`,
      status: 'completed',
      prUrl: `https://github.com/mock/repo/pull/${Math.floor(Math.random() * 1000)}`,
      prNumber: Math.floor(Math.random() * 1000),
      repository: request.repository || 'mock/repo',
      description: request.description,
      code: `// Mock generated code for: ${request.description}\nfunction mockFunction() {\n  return 'mock implementation';\n}`,
      summary: `Mock implementation for: ${request.description}`,
      metadata: {
        createdAt: new Date().toISOString(),
        responseTime: Math.floor(Math.random() * 1000) + 500,
        tokensUsed: Math.floor(Math.random() * 1000) + 100,
        mock: true
      }
    };
    
    // Simulate async delay
    return new Promise(resolve => {
      setTimeout(() => resolve(mockResult), mockResult.metadata.responseTime);
    });
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId) {
    if (!this.isInitialized) {
      throw new Error('Client must be initialized before use');
    }
    
    await this.checkRateLimit();
    
    try {
      if (this.config.enableMock) {
        return this.mockGetTaskStatus(taskId);
      }
      
      const response = await this.httpClient.get(`/tasks/${taskId}`);
      
      return {
        success: true,
        taskId,
        status: response.data.status,
        progress: response.data.progress,
        result: response.data.result,
        error: response.data.error,
        metadata: response.data.metadata
      };
      
    } catch (error) {
      console.error(`Failed to get task status for ${taskId}:`, error.message);
      throw new Error(`Get task status failed: ${error.message}`);
    }
  }

  /**
   * Mock task status for testing
   */
  mockGetTaskStatus(taskId) {
    const statuses = ['pending', 'processing', 'completed', 'failed'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return {
      success: true,
      taskId,
      status: randomStatus,
      progress: randomStatus === 'completed' ? 100 : Math.floor(Math.random() * 90),
      result: randomStatus === 'completed' ? { prUrl: `https://github.com/mock/repo/pull/${Math.floor(Math.random() * 1000)}` } : null,
      error: randomStatus === 'failed' ? 'Mock error for testing' : null,
      metadata: {
        mock: true,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId) {
    if (!this.isInitialized) {
      throw new Error('Client must be initialized before use');
    }
    
    await this.checkRateLimit();
    
    try {
      if (this.config.enableMock) {
        return { success: true, taskId, status: 'cancelled' };
      }
      
      const response = await this.httpClient.post(`/tasks/${taskId}/cancel`);
      
      return {
        success: true,
        taskId,
        status: response.data.status
      };
      
    } catch (error) {
      console.error(`Failed to cancel task ${taskId}:`, error.message);
      throw new Error(`Cancel task failed: ${error.message}`);
    }
  }

  /**
   * Check rate limits
   */
  async checkRateLimit() {
    if (!this.config.rateLimiting.enabled) {
      return;
    }
    
    const now = Date.now();
    
    // Reset counters if needed
    if (now - this.requestCount.lastMinuteReset > 60000) {
      this.requestCount.minute = 0;
      this.requestCount.lastMinuteReset = now;
    }
    
    if (now - this.requestCount.lastHourReset > 3600000) {
      this.requestCount.hour = 0;
      this.requestCount.lastHourReset = now;
    }
    
    // Check limits
    if (this.requestCount.minute >= this.config.rateLimiting.requestsPerMinute) {
      const waitTime = 60000 - (now - this.requestCount.lastMinuteReset);
      console.warn(`Rate limit exceeded, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      return this.checkRateLimit();
    }
    
    if (this.requestCount.hour >= this.config.rateLimiting.requestsPerHour) {
      const waitTime = 3600000 - (now - this.requestCount.lastHourReset);
      throw new Error(`Hourly rate limit exceeded, wait ${Math.ceil(waitTime / 60000)} minutes`);
    }
    
    // Increment counters
    this.requestCount.minute++;
    this.requestCount.hour++;
  }

  /**
   * Get client health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      initialized: this.isInitialized,
      mockMode: this.config.enableMock,
      metrics: this.metrics,
      rateLimiting: {
        enabled: this.config.rateLimiting.enabled,
        requestsThisMinute: this.requestCount.minute,
        requestsThisHour: this.requestCount.hour
      }
    };
    
    if (!this.isInitialized) {
      health.status = 'unhealthy';
      health.error = 'Client not initialized';
      return health;
    }
    
    // Test connection if not in mock mode
    if (!this.config.enableMock) {
      try {
        await this.testConnection();
      } catch (error) {
        health.status = 'unhealthy';
        health.error = error.message;
      }
    }
    
    return health;
  }

  /**
   * Get error type from error object
   */
  getErrorType(error) {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          return 'AUTHENTICATION_FAILED';
        case 403:
          return 'AUTHORIZATION_FAILED';
        case 429:
          return 'RATE_LIMIT_EXCEEDED';
        case 500:
        case 502:
        case 503:
        case 504:
          return 'SERVER_ERROR';
        default:
          return 'API_ERROR';
      }
    } else if (error.code === 'ECONNABORTED') {
      return 'TIMEOUT';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'CONNECTION_ERROR';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Determine if request should be retried
   */
  shouldRetry(error) {
    const retryableErrors = ['TIMEOUT', 'CONNECTION_ERROR', 'SERVER_ERROR'];
    return retryableErrors.includes(this.getErrorType(error));
  }

  /**
   * Delay utility for retries and rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the client
   */
  async shutdown() {
    console.log('Shutting down Codegen Client...');
    this.isInitialized = false;
    this.emit('shutdown');
  }
}

export default CodegenClient;

