/**
 * AgentAPI Configuration
 * Default configuration and environment variable handling
 */

export const defaultConfig = {
  server: {
    port: 3284,
    host: 'localhost',
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
      credentials: true
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    }
  },
  
  claude: {
    baseURL: 'http://localhost:8080',
    apiKey: null,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  session: {
    defaultTimeout: 3600000, // 1 hour
    maxSessions: 100,
    cleanupInterval: 300000, // 5 minutes
    persistenceEnabled: false,
    persistencePath: './sessions.json'
  },
  
  queue: {
    maxSize: 10000,
    maxRetries: 3,
    retryDelay: 1000,
    deadLetterEnabled: true,
    persistenceEnabled: false,
    persistencePath: './queue.json',
    processingTimeout: 60000 // 1 minute
  },
  
  processor: {
    concurrency: 5,
    batchSize: 1,
    batchTimeout: 5000,
    processingTimeout: 60000,
    retryDelay: 1000,
    maxRetries: 3
  },
  
  messageHandler: {
    maxRetries: 3,
    retryDelay: 1000,
    messageTimeout: 30000
  }
};

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv() {
  return {
    server: {
      port: parseInt(process.env.AGENTAPI_PORT) || defaultConfig.server.port,
      host: process.env.AGENTAPI_HOST || defaultConfig.server.host,
      cors: {
        ...defaultConfig.server.cors,
        origin: process.env.AGENTAPI_CORS_ORIGIN || defaultConfig.server.cors.origin
      }
    },
    
    claude: {
      baseURL: process.env.CLAUDE_CODE_API_URL || defaultConfig.claude.baseURL,
      apiKey: process.env.CLAUDE_CODE_API_KEY || defaultConfig.claude.apiKey,
      timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT) || defaultConfig.claude.timeout,
      retryAttempts: parseInt(process.env.CLAUDE_CODE_RETRY_ATTEMPTS) || defaultConfig.claude.retryAttempts,
      retryDelay: parseInt(process.env.CLAUDE_CODE_RETRY_DELAY) || defaultConfig.claude.retryDelay
    },
    
    session: {
      defaultTimeout: parseInt(process.env.SESSION_DEFAULT_TIMEOUT) || defaultConfig.session.defaultTimeout,
      maxSessions: parseInt(process.env.SESSION_MAX_SESSIONS) || defaultConfig.session.maxSessions,
      cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || defaultConfig.session.cleanupInterval,
      persistenceEnabled: process.env.SESSION_PERSISTENCE_ENABLED === 'true' || defaultConfig.session.persistenceEnabled,
      persistencePath: process.env.SESSION_PERSISTENCE_PATH || defaultConfig.session.persistencePath
    },
    
    queue: {
      maxSize: parseInt(process.env.QUEUE_MAX_SIZE) || defaultConfig.queue.maxSize,
      maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES) || defaultConfig.queue.maxRetries,
      retryDelay: parseInt(process.env.QUEUE_RETRY_DELAY) || defaultConfig.queue.retryDelay,
      deadLetterEnabled: process.env.QUEUE_DEAD_LETTER_ENABLED !== 'false' && defaultConfig.queue.deadLetterEnabled,
      persistenceEnabled: process.env.QUEUE_PERSISTENCE_ENABLED === 'true' || defaultConfig.queue.persistenceEnabled,
      persistencePath: process.env.QUEUE_PERSISTENCE_PATH || defaultConfig.queue.persistencePath,
      processingTimeout: parseInt(process.env.QUEUE_PROCESSING_TIMEOUT) || defaultConfig.queue.processingTimeout
    },
    
    processor: {
      concurrency: parseInt(process.env.PROCESSOR_CONCURRENCY) || defaultConfig.processor.concurrency,
      batchSize: parseInt(process.env.PROCESSOR_BATCH_SIZE) || defaultConfig.processor.batchSize,
      batchTimeout: parseInt(process.env.PROCESSOR_BATCH_TIMEOUT) || defaultConfig.processor.batchTimeout,
      processingTimeout: parseInt(process.env.PROCESSOR_PROCESSING_TIMEOUT) || defaultConfig.processor.processingTimeout,
      retryDelay: parseInt(process.env.PROCESSOR_RETRY_DELAY) || defaultConfig.processor.retryDelay,
      maxRetries: parseInt(process.env.PROCESSOR_MAX_RETRIES) || defaultConfig.processor.maxRetries
    },
    
    messageHandler: {
      maxRetries: parseInt(process.env.MESSAGE_HANDLER_MAX_RETRIES) || defaultConfig.messageHandler.maxRetries,
      retryDelay: parseInt(process.env.MESSAGE_HANDLER_RETRY_DELAY) || defaultConfig.messageHandler.retryDelay,
      messageTimeout: parseInt(process.env.MESSAGE_HANDLER_MESSAGE_TIMEOUT) || defaultConfig.messageHandler.messageTimeout
    }
  };
}

/**
 * Merge configurations with precedence: custom > env > default
 */
export function mergeConfig(customConfig = {}) {
  const envConfig = loadConfigFromEnv();
  
  return {
    server: { ...defaultConfig.server, ...envConfig.server, ...customConfig.server },
    claude: { ...defaultConfig.claude, ...envConfig.claude, ...customConfig.claude },
    session: { ...defaultConfig.session, ...envConfig.session, ...customConfig.session },
    queue: { ...defaultConfig.queue, ...envConfig.queue, ...customConfig.queue },
    processor: { ...defaultConfig.processor, ...envConfig.processor, ...customConfig.processor },
    messageHandler: { ...defaultConfig.messageHandler, ...envConfig.messageHandler, ...customConfig.messageHandler }
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config) {
  const errors = [];
  
  // Validate server config
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }
  
  // Validate Claude config
  if (!config.claude.baseURL) {
    errors.push('Claude Code API URL is required');
  }
  
  if (config.claude.timeout < 1000) {
    errors.push('Claude timeout must be at least 1000ms');
  }
  
  // Validate session config
  if (config.session.defaultTimeout < 60000) {
    errors.push('Session default timeout must be at least 60000ms (1 minute)');
  }
  
  if (config.session.maxSessions < 1) {
    errors.push('Max sessions must be at least 1');
  }
  
  // Validate queue config
  if (config.queue.maxSize < 1) {
    errors.push('Queue max size must be at least 1');
  }
  
  if (config.queue.maxRetries < 0) {
    errors.push('Queue max retries must be 0 or greater');
  }
  
  // Validate processor config
  if (config.processor.concurrency < 1) {
    errors.push('Processor concurrency must be at least 1');
  }
  
  if (config.processor.batchSize < 1) {
    errors.push('Processor batch size must be at least 1');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  defaultConfig,
  loadConfigFromEnv,
  mergeConfig,
  validateConfig
};

