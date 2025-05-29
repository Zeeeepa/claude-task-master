/**
 * Task Master Orchestrator Configuration
 */

export const defaultConfig = {
    // Core orchestrator settings
    orchestrator: {
        name: 'TaskMaster',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info'
    },

    // Task management configuration
    tasks: {
        tasksFile: process.env.TASKS_FILE || 'tasks.json',
        autoSave: process.env.TASKS_AUTO_SAVE !== 'false',
        backupEnabled: process.env.TASKS_BACKUP_ENABLED === 'true',
        backupInterval: parseInt(process.env.TASKS_BACKUP_INTERVAL) || 3600000 // 1 hour
    },

    // Database configuration
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'taskmaster',
        user: process.env.DB_USER || 'taskmaster',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000
    },

    // Codegen SDK configuration
    codegen: {
        token: process.env.CODEGEN_TOKEN,
        orgId: process.env.CODEGEN_ORG_ID,
        baseUrl: process.env.CODEGEN_BASE_URL || 'https://api.codegen.sh',
        timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 30000,
        retries: parseInt(process.env.CODEGEN_RETRIES) || 3
    },

    // Claude Code configuration (via AgentAPI)
    claude: {
        agentApiUrl: process.env.AGENT_API_URL || 'http://localhost:3001',
        apiKey: process.env.CLAUDE_API_KEY,
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        timeout: parseInt(process.env.CLAUDE_TIMEOUT) || 60000,
        maxRetries: parseInt(process.env.CLAUDE_MAX_RETRIES) || 3
    },

    // Linear integration configuration
    linear: {
        enabled: process.env.LINEAR_ENABLED === 'true',
        apiKey: process.env.LINEAR_API_KEY,
        teamId: process.env.LINEAR_TEAM_ID,
        projectId: process.env.LINEAR_PROJECT_ID,
        webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
        syncInterval: parseInt(process.env.LINEAR_SYNC_INTERVAL) || 300000, // 5 minutes
        autoCreateIssues: process.env.LINEAR_AUTO_CREATE_ISSUES === 'true',
        bidirectionalSync: process.env.LINEAR_BIDIRECTIONAL_SYNC === 'true'
    },

    // WSL2 deployment configuration
    wsl2: {
        enabled: process.env.WSL2_ENABLED === 'true',
        distributionName: process.env.WSL2_DISTRIBUTION || 'Ubuntu',
        workspaceRoot: process.env.WSL2_WORKSPACE_ROOT || '/mnt/c/workspace',
        dockerEnabled: process.env.WSL2_DOCKER_ENABLED === 'true',
        deploymentTimeout: parseInt(process.env.WSL2_DEPLOYMENT_TIMEOUT) || 600000, // 10 minutes
        validationEnabled: process.env.WSL2_VALIDATION_ENABLED === 'true',
        autoRollback: process.env.WSL2_AUTO_ROLLBACK === 'true'
    },

    // AgentAPI middleware configuration
    agentApi: {
        enabled: process.env.AGENT_API_ENABLED === 'true',
        port: parseInt(process.env.AGENT_API_PORT) || 3000,
        host: process.env.AGENT_API_HOST || '0.0.0.0',
        cors: {
            enabled: process.env.AGENT_API_CORS_ENABLED === 'true',
            origin: process.env.AGENT_API_CORS_ORIGIN || '*'
        },
        rateLimit: {
            enabled: process.env.AGENT_API_RATE_LIMIT_ENABLED === 'true',
            windowMs: parseInt(process.env.AGENT_API_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
            max: parseInt(process.env.AGENT_API_RATE_LIMIT_MAX) || 100
        },
        authentication: {
            enabled: process.env.AGENT_API_AUTH_ENABLED === 'true',
            secret: process.env.AGENT_API_SECRET || 'default-secret-change-me',
            tokenExpiry: process.env.AGENT_API_TOKEN_EXPIRY || '24h'
        }
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        file: {
            enabled: process.env.LOG_FILE_ENABLED === 'true',
            path: process.env.LOG_FILE_PATH || 'logs/taskmaster.log',
            maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
            maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES) || 5
        },
        console: {
            enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
            colorize: process.env.LOG_CONSOLE_COLORIZE !== 'false'
        }
    },

    // Health check configuration
    health: {
        enabled: process.env.HEALTH_CHECK_ENABLED === 'true',
        port: parseInt(process.env.HEALTH_CHECK_PORT) || 3001,
        path: process.env.HEALTH_CHECK_PATH || '/health',
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000 // 30 seconds
    }
};

/**
 * Load configuration from environment and validate
 */
export function loadConfig(overrides = {}) {
    const config = {
        ...defaultConfig,
        ...overrides
    };

    // Validate required configuration
    validateConfig(config);

    return config;
}

/**
 * Validate configuration
 */
function validateConfig(config) {
    const errors = [];

    // Validate database configuration
    if (!config.database.host) {
        errors.push('Database host is required');
    }
    if (!config.database.database) {
        errors.push('Database name is required');
    }
    if (!config.database.user) {
        errors.push('Database user is required');
    }

    // Validate Codegen configuration if enabled
    if (config.codegen.token && !config.codegen.orgId) {
        errors.push('Codegen organization ID is required when token is provided');
    }

    // Validate Claude configuration if enabled
    if (config.claude.apiKey && !config.claude.agentApiUrl) {
        errors.push('AgentAPI URL is required when Claude API key is provided');
    }

    // Validate Linear configuration if enabled
    if (config.linear.enabled) {
        if (!config.linear.apiKey) {
            errors.push('Linear API key is required when Linear integration is enabled');
        }
        if (!config.linear.teamId) {
            errors.push('Linear team ID is required when Linear integration is enabled');
        }
    }

    // Validate WSL2 configuration if enabled
    if (config.wsl2.enabled) {
        if (!config.wsl2.workspaceRoot) {
            errors.push('WSL2 workspace root is required when WSL2 deployment is enabled');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Get configuration for specific component
 */
export function getComponentConfig(component, config = null) {
    const fullConfig = config || loadConfig();
    
    if (!fullConfig[component]) {
        throw new Error(`Configuration for component '${component}' not found`);
    }
    
    return fullConfig[component];
}

export default {
    defaultConfig,
    loadConfig,
    getComponentConfig
};

