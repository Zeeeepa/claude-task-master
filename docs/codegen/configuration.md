# Codegen Integration Configuration Guide

This guide covers all configuration options for the Codegen SDK integration.

## Environment Variables

### Required Variables

```bash
# Codegen API Authentication
CODEGEN_API_KEY=your-codegen-api-key
CODEGEN_ORG_ID=your-organization-id

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codegen-taskmaster-db
DB_USER=your-db-user
DB_PASSWORD=your-db-password
```

### Optional Variables

```bash
# Codegen API Configuration
CODEGEN_API_URL=https://api.codegen.sh
CODEGEN_API_TIMEOUT=30000
CODEGEN_ENABLE_MOCK=false
CODEGEN_VALIDATE_ON_INIT=true

# Rate Limiting
CODEGEN_RATE_LIMITING_ENABLED=true
CODEGEN_REQUESTS_PER_SECOND=2
CODEGEN_REQUESTS_PER_MINUTE=10
CODEGEN_REQUESTS_PER_HOUR=100
CODEGEN_REQUESTS_PER_DAY=1000
CODEGEN_MAX_QUEUE_SIZE=50

# Retry Configuration
CODEGEN_RETRY_ENABLED=true
CODEGEN_MAX_RETRIES=3
CODEGEN_RETRY_BASE_DELAY=1000
CODEGEN_RETRY_MAX_DELAY=10000

# Polling Configuration
CODEGEN_POLL_INTERVAL=5000
CODEGEN_MAX_WAIT_TIME=300000

# Quota Management
CODEGEN_DAILY_LIMIT=500
CODEGEN_MONTHLY_LIMIT=10000
CODEGEN_QUOTA_WARNINGS=true

# Logging
CODEGEN_LOG_LEVEL=info
CODEGEN_LOG_REQUESTS=false
CODEGEN_LOG_RESPONSES=false

# Linear Integration
LINEAR_API_KEY=your-linear-api-key
LINEAR_TEAM_ID=your-team-id
LINEAR_PROJECT_ID=your-project-id

# Webhook Configuration
WEBHOOK_URL=https://your-domain.com/webhooks/codegen
WEBHOOK_SECRET=your-webhook-secret

# Notification Channels
NOTIFICATION_SLACK_WEBHOOK=https://hooks.slack.com/services/...
NOTIFICATION_EMAIL_SMTP_HOST=smtp.gmail.com
NOTIFICATION_EMAIL_SMTP_PORT=587
NOTIFICATION_EMAIL_USER=your-email@domain.com
NOTIFICATION_EMAIL_PASSWORD=your-email-password
```

## Configuration Objects

### Main Configuration

```javascript
const config = {
  // Codegen Client Configuration
  codegen: {
    mode: 'production', // 'development', 'test', 'production'
    api: {
      baseURL: 'https://api.codegen.sh',
      timeout: 30000,
      enableMock: false
    },
    auth: {
      token: process.env.CODEGEN_API_KEY,
      orgId: process.env.CODEGEN_ORG_ID,
      validateOnInit: true
    },
    rateLimiting: {
      enabled: true,
      requestsPerSecond: 2,
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 1000,
      maxQueueSize: 50
    },
    retry: {
      enabled: true,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    },
    polling: {
      defaultInterval: 5000,
      maxWaitTime: 300000
    },
    quota: {
      dailyLimit: 500,
      monthlyLimit: 10000,
      enableWarnings: true
    },
    logging: {
      level: 'info',
      enableRequestLogging: false,
      enableResponseLogging: false
    }
  },

  // Task Analyzer Configuration
  taskAnalyzer: {
    maxComplexityScore: 100,
    enableDetailedAnalysis: true,
    supportedLanguages: [
      'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
    ],
    supportedFrameworks: [
      'react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'rails'
    ]
  },

  // Prompt Generator Configuration
  promptGenerator: {
    maxPromptLength: 4000,
    includeContext: true,
    includeExamples: true,
    optimizeForCodegen: true,
    templateVersion: '1.0'
  },

  // PR Creator Configuration
  prCreator: {
    defaultBranch: 'main',
    branchPrefix: 'codegen/',
    includeMetadata: true,
    autoAssignReviewers: false,
    defaultReviewers: [],
    templateVersion: '1.0'
  },

  // Context Manager Configuration
  contextManager: {
    maxContextSize: 10000,
    includeFileStructure: true,
    includeRecentChanges: true,
    includeDependencies: true,
    contextCacheSize: 100,
    enableSmartFiltering: true
  },

  // NLP Configuration
  requirementExtractor: {
    enableDetailedExtraction: true,
    includeImplicitRequirements: true,
    confidenceThreshold: 0.6,
    maxRequirements: 20
  },

  codeIntentAnalyzer: {
    enableComplexityAnalysis: true,
    enablePatternRecognition: true,
    complexityWeights: {
      lines: 0.1,
      functions: 2,
      classes: 3,
      files: 1.5,
      dependencies: 1,
      patterns: 0.5
    }
  },

  templateEngine: {
    enableAdvancedTemplates: true,
    includeComments: true,
    includeTypeAnnotations: true,
    templateStyle: 'modern',
    indentSize: 2
  },

  // Workflow Configuration
  taskProcessor: {
    enableCodegenIntegration: true,
    enableNLPAnalysis: true,
    enableTemplateGeneration: true,
    maxRetries: 3,
    timeoutMs: 300000,
    enableCaching: true
  },

  prWorkflow: {
    enableAutoReview: true,
    enableStatusTracking: true,
    enableNotifications: true,
    maxRetries: 3,
    retryDelayMs: 5000,
    timeoutMs: 600000,
    defaultReviewers: [],
    autoMergeEnabled: false
  },

  statusUpdater: {
    enableLinearIntegration: true,
    enableWebhooks: true,
    enableNotifications: true,
    updateIntervalMs: 30000,
    maxRetries: 3,
    retryDelayMs: 5000,
    linearApiKey: process.env.LINEAR_API_KEY,
    webhookUrl: process.env.WEBHOOK_URL,
    notificationChannels: ['slack', 'email']
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};
```

### Development Configuration

```javascript
const developmentConfig = {
  codegen: {
    mode: 'development',
    api: {
      baseURL: 'https://api.dev.codegen.sh',
      timeout: 10000,
      enableMock: true
    },
    auth: {
      validateOnInit: false
    },
    rateLimiting: {
      enabled: false
    },
    logging: {
      level: 'debug',
      enableRequestLogging: true,
      enableResponseLogging: true
    }
  },
  taskAnalyzer: {
    enableDetailedAnalysis: false
  },
  promptGenerator: {
    maxPromptLength: 2000
  },
  contextManager: {
    maxContextSize: 5000,
    enableSmartFiltering: false
  },
  database: {
    database: 'codegen-taskmaster-dev',
    logging: console.log
  }
};
```

### Test Configuration

```javascript
const testConfig = {
  codegen: {
    mode: 'test',
    api: {
      baseURL: 'https://api.test.codegen.sh',
      timeout: 5000,
      enableMock: true
    },
    auth: {
      token: 'test-token',
      orgId: 'test-org',
      validateOnInit: false
    },
    rateLimiting: {
      enabled: false
    },
    retry: {
      enabled: false
    },
    logging: {
      level: 'error'
    }
  },
  taskAnalyzer: {
    maxComplexityScore: 50,
    enableDetailedAnalysis: false
  },
  promptGenerator: {
    maxPromptLength: 1000,
    includeContext: false,
    includeExamples: false
  },
  contextManager: {
    maxContextSize: 2000,
    includeFileStructure: false,
    includeRecentChanges: false,
    includeDependencies: false
  },
  taskProcessor: {
    enableCodegenIntegration: false,
    enableNLPAnalysis: true,
    enableTemplateGeneration: false,
    enableCaching: false
  },
  database: {
    database: ':memory:',
    dialect: 'sqlite',
    logging: false
  }
};
```

## Configuration Validation

### Validation Rules

```javascript
const configValidation = {
  codegen: {
    auth: {
      token: { required: true, type: 'string', minLength: 10 },
      orgId: { required: true, type: 'string', minLength: 3 }
    },
    api: {
      baseURL: { required: true, type: 'string', format: 'url' },
      timeout: { type: 'number', min: 1000, max: 300000 }
    },
    rateLimiting: {
      requestsPerSecond: { type: 'number', min: 1, max: 10 },
      requestsPerMinute: { type: 'number', min: 1, max: 100 },
      requestsPerHour: { type: 'number', min: 1, max: 1000 }
    }
  },
  database: {
    host: { required: true, type: 'string' },
    port: { required: true, type: 'number', min: 1, max: 65535 },
    database: { required: true, type: 'string', minLength: 1 },
    username: { required: true, type: 'string' },
    password: { required: true, type: 'string' }
  }
};
```

### Validation Function

```javascript
function validateConfig(config, schema) {
  const errors = [];
  
  function validateObject(obj, schemaObj, path = '') {
    for (const [key, rules] of Object.entries(schemaObj)) {
      const value = obj[key];
      const fullPath = path ? `${path}.${key}` : key;
      
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${fullPath} is required`);
        continue;
      }
      
      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${fullPath} must be of type ${rules.type}`);
        }
        
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${fullPath} must be at least ${rules.minLength} characters`);
        }
        
        if (rules.min && value < rules.min) {
          errors.push(`${fullPath} must be at least ${rules.min}`);
        }
        
        if (rules.max && value > rules.max) {
          errors.push(`${fullPath} must be at most ${rules.max}`);
        }
        
        if (rules.format === 'url' && !isValidUrl(value)) {
          errors.push(`${fullPath} must be a valid URL`);
        }
      }
      
      if (typeof rules === 'object' && !rules.type && typeof value === 'object') {
        validateObject(value, rules, fullPath);
      }
    }
  }
  
  validateObject(config, schema);
  return errors;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
```

## Environment-Specific Configurations

### Production

```javascript
const productionConfig = {
  codegen: {
    mode: 'production',
    api: {
      enableMock: false
    },
    auth: {
      validateOnInit: true
    },
    rateLimiting: {
      enabled: true,
      requestsPerSecond: 1,
      requestsPerMinute: 5,
      requestsPerHour: 50
    },
    retry: {
      enabled: true,
      maxRetries: 5
    },
    logging: {
      level: 'warn',
      enableRequestLogging: false,
      enableResponseLogging: false
    }
  },
  taskProcessor: {
    enableCaching: true,
    timeoutMs: 600000
  },
  statusUpdater: {
    enableLinearIntegration: true,
    enableWebhooks: true,
    enableNotifications: true
  }
};
```

### Staging

```javascript
const stagingConfig = {
  codegen: {
    mode: 'staging',
    api: {
      baseURL: 'https://api.staging.codegen.sh'
    },
    rateLimiting: {
      requestsPerSecond: 2,
      requestsPerMinute: 15,
      requestsPerHour: 100
    },
    logging: {
      level: 'info',
      enableRequestLogging: true
    }
  },
  database: {
    database: 'codegen-taskmaster-staging'
  }
};
```

## Configuration Loading

### Configuration Loader

```javascript
import fs from 'fs';
import path from 'path';

class ConfigurationLoader {
  constructor() {
    this.config = {};
    this.environment = process.env.NODE_ENV || 'development';
  }
  
  load() {
    // Load base configuration
    this.loadBaseConfig();
    
    // Load environment-specific configuration
    this.loadEnvironmentConfig();
    
    // Load local overrides
    this.loadLocalConfig();
    
    // Apply environment variables
    this.applyEnvironmentVariables();
    
    // Validate configuration
    this.validateConfiguration();
    
    return this.config;
  }
  
  loadBaseConfig() {
    const baseConfigPath = path.join(__dirname, 'config', 'base.js');
    if (fs.existsSync(baseConfigPath)) {
      this.config = require(baseConfigPath);
    }
  }
  
  loadEnvironmentConfig() {
    const envConfigPath = path.join(__dirname, 'config', `${this.environment}.js`);
    if (fs.existsSync(envConfigPath)) {
      const envConfig = require(envConfigPath);
      this.config = this.mergeDeep(this.config, envConfig);
    }
  }
  
  loadLocalConfig() {
    const localConfigPath = path.join(__dirname, 'config', 'local.js');
    if (fs.existsSync(localConfigPath)) {
      const localConfig = require(localConfigPath);
      this.config = this.mergeDeep(this.config, localConfig);
    }
  }
  
  applyEnvironmentVariables() {
    // Apply environment variables with precedence
    const envMappings = {
      'CODEGEN_API_KEY': 'codegen.auth.token',
      'CODEGEN_ORG_ID': 'codegen.auth.orgId',
      'CODEGEN_API_URL': 'codegen.api.baseURL',
      'DB_HOST': 'database.host',
      'DB_PORT': 'database.port',
      'DB_NAME': 'database.database',
      'DB_USER': 'database.username',
      'DB_PASSWORD': 'database.password'
    };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(this.config, configPath, value);
      }
    }
  }
  
  validateConfiguration() {
    const errors = validateConfig(this.config, configValidation);
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }
  
  mergeDeep(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
  
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
  
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }
}

// Usage
const loader = new ConfigurationLoader();
const config = loader.load();
```

## Configuration Best Practices

### Security

1. **Never commit secrets to version control**
   ```bash
   # Use environment variables for sensitive data
   CODEGEN_API_KEY=your-secret-key
   DB_PASSWORD=your-db-password
   ```

2. **Use different configurations per environment**
   ```javascript
   // config/production.js
   module.exports = {
     codegen: {
       auth: {
         token: process.env.CODEGEN_API_KEY // Required in production
       }
     }
   };
   ```

3. **Validate configuration on startup**
   ```javascript
   if (!config.codegen.auth.token) {
     throw new Error('CODEGEN_API_KEY is required in production');
   }
   ```

### Performance

1. **Optimize rate limiting for your use case**
   ```javascript
   const rateLimiting = {
     // Conservative settings for production
     requestsPerSecond: 1,
     requestsPerMinute: 5,
     requestsPerHour: 50
   };
   ```

2. **Configure appropriate timeouts**
   ```javascript
   const timeouts = {
     api: 30000,        // 30 seconds for API calls
     processing: 300000, // 5 minutes for task processing
     workflow: 600000   // 10 minutes for complete workflow
   };
   ```

3. **Enable caching where appropriate**
   ```javascript
   const caching = {
     enableCaching: true,
     contextCacheSize: 100,
     maxAge: 3600000 // 1 hour
   };
   ```

### Monitoring

1. **Configure appropriate logging levels**
   ```javascript
   const logging = {
     production: 'warn',
     staging: 'info',
     development: 'debug',
     test: 'error'
   };
   ```

2. **Enable health checks**
   ```javascript
   const healthChecks = {
     enableHealthEndpoint: true,
     healthCheckInterval: 30000,
     includeComponentHealth: true
   };
   ```

3. **Set up alerts for critical errors**
   ```javascript
   const alerts = {
     enableErrorAlerts: true,
     alertThreshold: 5, // Alert after 5 consecutive errors
     alertChannels: ['slack', 'email']
   };
   ```

## Troubleshooting Configuration Issues

### Common Problems

1. **Authentication Failures**
   ```bash
   # Check API key format
   echo $CODEGEN_API_KEY | wc -c  # Should be > 10 characters
   
   # Verify organization ID
   curl -H "Authorization: Bearer $CODEGEN_API_KEY" \
        https://api.codegen.sh/v1/organizations/$CODEGEN_ORG_ID
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;"
   ```

3. **Rate Limiting Issues**
   ```javascript
   // Check current rate limit status
   const stats = await codegenClient.getStatistics();
   console.log('Request count:', stats.requestCount);
   console.log('Last request:', stats.lastRequestTime);
   ```

### Debug Configuration

```javascript
const debugConfig = {
  codegen: {
    logging: {
      level: 'debug',
      enableRequestLogging: true,
      enableResponseLogging: true
    }
  },
  taskProcessor: {
    debug: true,
    enableCaching: false // Disable caching for debugging
  }
};
```

### Configuration Validation Script

```javascript
// scripts/validate-config.js
import { ConfigurationLoader } from '../src/config/loader.js';

async function validateConfiguration() {
  try {
    const loader = new ConfigurationLoader();
    const config = loader.load();
    
    console.log('✅ Configuration is valid');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Codegen API URL:', config.codegen.api.baseURL);
    console.log('Database:', config.database.database);
    
    // Test connections
    console.log('Testing connections...');
    
    // Test Codegen API
    const client = new CodegenClient(config.codegen);
    await client.initialize();
    const health = await client.getHealth();
    console.log('✅ Codegen API connection:', health.status);
    
    // Test database
    // ... database connection test
    
    console.log('✅ All connections successful');
    
  } catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    process.exit(1);
  }
}

validateConfiguration();
```

Run validation:
```bash
npm run validate-config
```

