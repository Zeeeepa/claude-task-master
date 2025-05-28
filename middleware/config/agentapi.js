/**
 * AgentAPI Configuration
 * 
 * Central configuration for AgentAPI middleware
 * Supports environment-based configuration with sensible defaults
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config();

export const agentApiConfig = {
  // Server configuration
  server: {
    host: process.env.AGENTAPI_HOST || 'localhost',
    port: parseInt(process.env.AGENTAPI_PORT) || 3285,
    cors: {
      origins: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3284',
        'http://localhost:8080',
      ],
      credentials: true,
    },
    security: {
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
      },
    },
  },

  // Workspace configuration
  workspace: {
    root: process.env.WORKSPACE_ROOT || '/tmp/agentapi-workspaces',
    maxConcurrentWorkspaces: parseInt(process.env.MAX_CONCURRENT_WORKSPACES) || 10,
    cleanupInterval: parseInt(process.env.WORKSPACE_CLEANUP_INTERVAL) || 3600000, // 1 hour
    maxWorkspaceAge: parseInt(process.env.MAX_WORKSPACE_AGE) || 86400000, // 24 hours
    diskSpaceThreshold: parseFloat(process.env.DISK_SPACE_THRESHOLD) || 0.9, // 90%
  },

  // Agent configurations
  agents: {
    claude: {
      command: process.env.CLAUDE_COMMAND || 'claude',
      defaultArgs: process.env.CLAUDE_ARGS?.split(' ') || ['--allowedTools', 'Bash(git*) Edit Replace'],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
      healthCheck: {
        timeout: parseInt(process.env.CLAUDE_TIMEOUT) || 30000,
        retries: parseInt(process.env.CLAUDE_RETRIES) || 3,
        readyPattern: /ready|waiting|>/i,
      },
      capabilities: ['code-editing', 'git-operations', 'file-management', 'debugging'],
      resourceLimits: {
        memory: process.env.CLAUDE_MEMORY_LIMIT || '1g',
        cpu: process.env.CLAUDE_CPU_LIMIT || '1.0',
      },
    },

    goose: {
      command: process.env.GOOSE_COMMAND || 'goose',
      defaultArgs: process.env.GOOSE_ARGS?.split(' ') || [],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: parseInt(process.env.GOOSE_TIMEOUT) || 30000,
        retries: parseInt(process.env.GOOSE_RETRIES) || 3,
        readyPattern: /ready|waiting|>/i,
      },
      capabilities: ['code-editing', 'project-management', 'testing', 'debugging'],
      resourceLimits: {
        memory: process.env.GOOSE_MEMORY_LIMIT || '1g',
        cpu: process.env.GOOSE_CPU_LIMIT || '1.0',
      },
    },

    aider: {
      command: process.env.AIDER_COMMAND || 'aider',
      defaultArgs: process.env.AIDER_ARGS?.split(' ') || ['--model', 'sonnet'],
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: parseInt(process.env.AIDER_TIMEOUT) || 30000,
        retries: parseInt(process.env.AIDER_RETRIES) || 3,
        readyPattern: /ready|waiting|>/i,
      },
      capabilities: ['code-editing', 'refactoring', 'git-operations', 'testing'],
      resourceLimits: {
        memory: process.env.AIDER_MEMORY_LIMIT || '1g',
        cpu: process.env.AIDER_CPU_LIMIT || '1.0',
      },
    },

    codex: {
      command: process.env.CODEX_COMMAND || 'codex',
      defaultArgs: process.env.CODEX_ARGS?.split(' ') || [],
      envVars: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      healthCheck: {
        timeout: parseInt(process.env.CODEX_TIMEOUT) || 30000,
        retries: parseInt(process.env.CODEX_RETRIES) || 3,
        readyPattern: /ready|waiting|>/i,
      },
      capabilities: ['code-generation', 'code-completion', 'debugging'],
      resourceLimits: {
        memory: process.env.CODEX_MEMORY_LIMIT || '512m',
        cpu: process.env.CODEX_CPU_LIMIT || '0.5',
      },
    },
  },

  // PR deployment configuration
  deployment: {
    maxConcurrentDeployments: parseInt(process.env.MAX_CONCURRENT_DEPLOYMENTS) || 5,
    deploymentTimeout: parseInt(process.env.DEPLOYMENT_TIMEOUT) || 600000, // 10 minutes
    gitConfig: {
      user: {
        name: process.env.GIT_USER_NAME || 'AgentAPI Bot',
        email: process.env.GIT_USER_EMAIL || 'agentapi@example.com',
      },
      defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main',
    },
    validation: {
      rules: process.env.VALIDATION_RULES?.split(',') || [
        'syntax-check',
        'lint-check',
        'test-run',
        'build-check',
      ],
      timeout: parseInt(process.env.VALIDATION_TIMEOUT) || 300000, // 5 minutes
    },
    packageManagers: {
      npm: {
        installCommand: ['npm', 'install'],
        testCommand: ['npm', 'test'],
        buildCommand: ['npm', 'run', 'build'],
        lintCommand: ['npx', 'eslint', '.'],
      },
      yarn: {
        installCommand: ['yarn', 'install'],
        testCommand: ['yarn', 'test'],
        buildCommand: ['yarn', 'build'],
        lintCommand: ['yarn', 'lint'],
      },
      pnpm: {
        installCommand: ['pnpm', 'install'],
        testCommand: ['pnpm', 'test'],
        buildCommand: ['pnpm', 'build'],
        lintCommand: ['pnpm', 'lint'],
      },
      pip: {
        installCommand: ['pip', 'install', '-r', 'requirements.txt'],
        testCommand: ['python', '-m', 'pytest'],
        buildCommand: ['python', 'setup.py', 'build'],
        lintCommand: ['python', '-m', 'flake8', '.'],
      },
    },
  },

  // State management configuration
  state: {
    persistenceFile: process.env.STATE_FILE || '/tmp/agentapi-state.json',
    persistenceInterval: parseInt(process.env.STATE_PERSISTENCE_INTERVAL) || 30000, // 30 seconds
    maxHistoryEntries: parseInt(process.env.MAX_HISTORY_ENTRIES) || 1000,
    cleanupInterval: parseInt(process.env.STATE_CLEANUP_INTERVAL) || 3600000, // 1 hour
  },

  // Health monitoring configuration
  monitoring: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    metricsRetention: parseInt(process.env.METRICS_RETENTION) || 86400000, // 24 hours
    alertThresholds: {
      cpu: {
        warning: parseFloat(process.env.CPU_WARNING_THRESHOLD) || 70,
        critical: parseFloat(process.env.CPU_CRITICAL_THRESHOLD) || 90,
      },
      memory: {
        warning: parseFloat(process.env.MEMORY_WARNING_THRESHOLD) || 80,
        critical: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD) || 95,
      },
      disk: {
        warning: parseFloat(process.env.DISK_WARNING_THRESHOLD) || 85,
        critical: parseFloat(process.env.DISK_CRITICAL_THRESHOLD) || 95,
      },
      agentResponseTime: {
        warning: parseInt(process.env.AGENT_RESPONSE_WARNING) || 10000, // 10 seconds
        critical: parseInt(process.env.AGENT_RESPONSE_CRITICAL) || 30000, // 30 seconds
      },
      errorRate: {
        warning: parseFloat(process.env.ERROR_RATE_WARNING) || 0.1, // 10%
        critical: parseFloat(process.env.ERROR_RATE_CRITICAL) || 0.25, // 25%
      },
    },
    notifications: {
      webhook: process.env.ALERT_WEBHOOK_URL,
      email: {
        enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        from: process.env.ALERT_EMAIL_FROM || 'agentapi@example.com',
        to: process.env.ALERT_EMAIL_TO?.split(',') || [],
      },
    },
  },

  // Error handling configuration
  errorHandling: {
    maxRetries: parseInt(process.env.MAX_ERROR_RETRIES) || 3,
    retryDelay: parseInt(process.env.ERROR_RETRY_DELAY) || 5000, // 5 seconds
    enableRecovery: process.env.ENABLE_ERROR_RECOVERY !== 'false',
    logLevel: process.env.LOG_LEVEL || 'info',
    errorReporting: {
      enabled: process.env.ERROR_REPORTING_ENABLED === 'true',
      endpoint: process.env.ERROR_REPORTING_ENDPOINT,
      apiKey: process.env.ERROR_REPORTING_API_KEY,
    },
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.FILE_LOGGING_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || '/tmp/agentapi.log',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES) || 5,
    },
    console: {
      enabled: process.env.CONSOLE_LOGGING_ENABLED !== 'false',
      colorize: process.env.LOG_COLORIZE !== 'false',
    },
  },

  // WSL2 specific configuration
  wsl2: {
    enabled: process.env.WSL2_ENABLED === 'true',
    distro: process.env.WSL2_DISTRO || 'Ubuntu',
    user: process.env.WSL2_USER || 'ubuntu',
    homeDir: process.env.WSL2_HOME_DIR || '/home/ubuntu',
    setupScript: process.env.WSL2_SETUP_SCRIPT || './wsl2-setup/setup.sh',
    resourceLimits: {
      memory: process.env.WSL2_MEMORY_LIMIT || '4g',
      processors: parseInt(process.env.WSL2_PROCESSORS) || 2,
      swap: process.env.WSL2_SWAP || '1g',
    },
  },

  // CI/CD integration configuration
  cicd: {
    webhookSecret: process.env.WEBHOOK_SECRET,
    supportedEvents: process.env.SUPPORTED_WEBHOOK_EVENTS?.split(',') || [
      'pull_request',
      'push',
      'workflow_run',
    ],
    autoValidation: process.env.AUTO_VALIDATION_ENABLED !== 'false',
    autoDeployment: process.env.AUTO_DEPLOYMENT_ENABLED !== 'false',
    statusReporting: {
      enabled: process.env.STATUS_REPORTING_ENABLED !== 'false',
      githubToken: process.env.GITHUB_TOKEN,
      gitlabToken: process.env.GITLAB_TOKEN,
    },
  },

  // Database configuration (optional)
  database: {
    enabled: process.env.DATABASE_ENABLED === 'true',
    type: process.env.DATABASE_TYPE || 'postgresql',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT) || 5432,
    name: process.env.DATABASE_NAME || 'agentapi',
    user: process.env.DATABASE_USER || 'agentapi',
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true',
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN) || 2,
      max: parseInt(process.env.DATABASE_POOL_MAX) || 10,
    },
  },
};

// Configuration validation
export function validateConfig() {
  const errors = [];

  // Check required API keys
  const requiredKeys = [];
  
  if (agentApiConfig.agents.claude.envVars.ANTHROPIC_API_KEY) {
    // Claude is configured
  } else {
    requiredKeys.push('ANTHROPIC_API_KEY for Claude agent');
  }

  if (!agentApiConfig.agents.goose.envVars.ANTHROPIC_API_KEY && 
      !agentApiConfig.agents.goose.envVars.OPENAI_API_KEY) {
    requiredKeys.push('ANTHROPIC_API_KEY or OPENAI_API_KEY for Goose agent');
  }

  if (!agentApiConfig.agents.aider.envVars.ANTHROPIC_API_KEY && 
      !agentApiConfig.agents.aider.envVars.OPENAI_API_KEY) {
    requiredKeys.push('ANTHROPIC_API_KEY or OPENAI_API_KEY for Aider agent');
  }

  if (!agentApiConfig.agents.codex.envVars.OPENAI_API_KEY) {
    requiredKeys.push('OPENAI_API_KEY for Codex agent');
  }

  if (requiredKeys.length > 0) {
    errors.push(`Missing required API keys: ${requiredKeys.join(', ')}`);
  }

  // Check workspace directory
  if (!agentApiConfig.workspace.root) {
    errors.push('Workspace root directory not configured');
  }

  // Check port availability
  if (agentApiConfig.server.port < 1024 || agentApiConfig.server.port > 65535) {
    errors.push('Invalid server port number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Environment-specific configurations
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  const envConfigs = {
    development: {
      logging: {
        level: 'debug',
        console: { enabled: true, colorize: true },
        file: { enabled: false },
      },
      monitoring: {
        checkInterval: 10000, // 10 seconds for faster feedback
      },
    },
    
    production: {
      logging: {
        level: 'info',
        console: { enabled: true, colorize: false },
        file: { enabled: true },
      },
      monitoring: {
        checkInterval: 30000, // 30 seconds
      },
      server: {
        security: {
          rateLimit: {
            windowMs: 15 * 60 * 1000,
            max: 50, // More restrictive in production
          },
        },
      },
    },
    
    test: {
      logging: {
        level: 'error',
        console: { enabled: false },
        file: { enabled: false },
      },
      workspace: {
        root: '/tmp/agentapi-test-workspaces',
      },
      state: {
        persistenceFile: '/tmp/agentapi-test-state.json',
      },
    },
  };

  return envConfigs[env] || envConfigs.development;
}

// Merge environment-specific config with base config
export function getFinalConfig() {
  const envConfig = getEnvironmentConfig();
  
  // Deep merge function
  function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  return deepMerge(agentApiConfig, envConfig);
}

export default agentApiConfig;

