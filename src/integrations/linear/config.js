/**
 * Linear Integration Configuration
 * 
 * Configuration management for Linear integration with environment
 * variable support and validation.
 */

const path = require('path');
const fs = require('fs');

class LinearConfig {
    constructor(options = {}) {
        this.configPath = options.configPath || path.join(process.cwd(), '.linear-config.json');
        this.envPrefix = options.envPrefix || 'LINEAR_';
        
        // Default configuration
        this.defaults = {
            // API Configuration
            apiKey: null,
            webhookSecret: null,
            endpoint: 'https://api.linear.app/graphql',
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            
            // Team and Project Defaults
            defaultTeamId: null,
            defaultProjectId: null,
            defaultAssigneeId: null,
            
            // Sync Configuration
            enableRealTimeSync: true,
            syncInterval: 30000,
            maxSyncRetries: 3,
            syncBatchSize: 50,
            
            // State Mapping
            stateMapping: {
                'backlog': 'pending',
                'unstarted': 'pending',
                'started': 'in_progress',
                'completed': 'completed',
                'canceled': 'cancelled'
            },
            
            // Webhook Configuration
            enableWebhooks: true,
            enableSignatureVerification: true,
            supportedEvents: [
                'Issue',
                'Comment',
                'IssueLabel',
                'Project',
                'ProjectUpdate'
            ],
            maxConcurrentProcessing: 5,
            processingDelay: 100,
            
            // Comment Configuration
            enableAutoComments: true,
            botIconUrl: 'https://avatars.githubusercontent.com/u/claude-task-master',
            maxCommentLength: 65536,
            enableMarkdown: true,
            enableMentions: true,
            timestampFormat: 'iso',
            includeMetadata: true,
            enableEmojis: true,
            batchSize: 10,
            batchDelay: 1000,
            
            // Priority Mapping
            priorityMapping: {
                'critical': 1,
                'high': 2,
                'medium': 3,
                'low': 4
            },
            
            // Auto Labeling
            autoLabeling: true,
            labelMapping: {
                'workflow:started': 'workflow',
                'workflow:completed': 'completed',
                'workflow:failed': 'error',
                'pr:created': 'pull-request',
                'pr:merged': 'merged',
                'build:started': 'build',
                'build:completed': 'build',
                'deployment:started': 'deployment',
                'deployment:completed': 'deployed',
                'error:reported': 'error'
            },
            
            // Rate Limiting
            minRequestInterval: 100,
            maxRequestsPerMinute: 600,
            
            // Logging
            enableLogging: true,
            logLevel: 'info',
            logFormat: 'json'
        };
        
        // Load configuration
        this.config = this.loadConfig();
    }
    
    /**
     * Load configuration from multiple sources
     */
    loadConfig() {
        const config = { ...this.defaults };
        
        // Load from file if exists
        const fileConfig = this.loadFromFile();
        Object.assign(config, fileConfig);
        
        // Load from environment variables
        const envConfig = this.loadFromEnv();
        Object.assign(config, envConfig);
        
        // Validate configuration
        this.validateConfig(config);
        
        return config;
    }
    
    /**
     * Load configuration from file
     */
    loadFromFile() {
        try {
            if (fs.existsSync(this.configPath)) {
                const fileContent = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(fileContent);
            }
        } catch (error) {
            console.warn(`Failed to load Linear config from file: ${error.message}`);
        }
        
        return {};
    }
    
    /**
     * Load configuration from environment variables
     */
    loadFromEnv() {
        const envConfig = {};
        
        // Map environment variables to config keys
        const envMappings = {
            [`${this.envPrefix}API_KEY`]: 'apiKey',
            [`${this.envPrefix}WEBHOOK_SECRET`]: 'webhookSecret',
            [`${this.envPrefix}ENDPOINT`]: 'endpoint',
            [`${this.envPrefix}TIMEOUT`]: 'timeout',
            [`${this.envPrefix}RETRY_ATTEMPTS`]: 'retryAttempts',
            [`${this.envPrefix}RETRY_DELAY`]: 'retryDelay',
            [`${this.envPrefix}DEFAULT_TEAM_ID`]: 'defaultTeamId',
            [`${this.envPrefix}DEFAULT_PROJECT_ID`]: 'defaultProjectId',
            [`${this.envPrefix}DEFAULT_ASSIGNEE_ID`]: 'defaultAssigneeId',
            [`${this.envPrefix}ENABLE_REAL_TIME_SYNC`]: 'enableRealTimeSync',
            [`${this.envPrefix}SYNC_INTERVAL`]: 'syncInterval',
            [`${this.envPrefix}MAX_SYNC_RETRIES`]: 'maxSyncRetries',
            [`${this.envPrefix}SYNC_BATCH_SIZE`]: 'syncBatchSize',
            [`${this.envPrefix}ENABLE_WEBHOOKS`]: 'enableWebhooks',
            [`${this.envPrefix}ENABLE_SIGNATURE_VERIFICATION`]: 'enableSignatureVerification',
            [`${this.envPrefix}MAX_CONCURRENT_PROCESSING`]: 'maxConcurrentProcessing',
            [`${this.envPrefix}PROCESSING_DELAY`]: 'processingDelay',
            [`${this.envPrefix}ENABLE_AUTO_COMMENTS`]: 'enableAutoComments',
            [`${this.envPrefix}BOT_ICON_URL`]: 'botIconUrl',
            [`${this.envPrefix}MAX_COMMENT_LENGTH`]: 'maxCommentLength',
            [`${this.envPrefix}ENABLE_MARKDOWN`]: 'enableMarkdown',
            [`${this.envPrefix}ENABLE_MENTIONS`]: 'enableMentions',
            [`${this.envPrefix}TIMESTAMP_FORMAT`]: 'timestampFormat',
            [`${this.envPrefix}INCLUDE_METADATA`]: 'includeMetadata',
            [`${this.envPrefix}ENABLE_EMOJIS`]: 'enableEmojis',
            [`${this.envPrefix}BATCH_SIZE`]: 'batchSize',
            [`${this.envPrefix}BATCH_DELAY`]: 'batchDelay',
            [`${this.envPrefix}AUTO_LABELING`]: 'autoLabeling',
            [`${this.envPrefix}MIN_REQUEST_INTERVAL`]: 'minRequestInterval',
            [`${this.envPrefix}MAX_REQUESTS_PER_MINUTE`]: 'maxRequestsPerMinute',
            [`${this.envPrefix}ENABLE_LOGGING`]: 'enableLogging',
            [`${this.envPrefix}LOG_LEVEL`]: 'logLevel',
            [`${this.envPrefix}LOG_FORMAT`]: 'logFormat'
        };
        
        for (const [envKey, configKey] of Object.entries(envMappings)) {
            const envValue = process.env[envKey];
            if (envValue !== undefined) {
                envConfig[configKey] = this.parseEnvValue(envValue, configKey);
            }
        }
        
        // Handle complex objects from environment
        this.loadComplexEnvConfig(envConfig);
        
        return envConfig;
    }
    
    /**
     * Load complex configuration objects from environment
     */
    loadComplexEnvConfig(envConfig) {
        // State mapping
        const stateMappingEnv = process.env[`${this.envPrefix}STATE_MAPPING`];
        if (stateMappingEnv) {
            try {
                envConfig.stateMapping = JSON.parse(stateMappingEnv);
            } catch (error) {
                console.warn(`Failed to parse state mapping from environment: ${error.message}`);
            }
        }
        
        // Priority mapping
        const priorityMappingEnv = process.env[`${this.envPrefix}PRIORITY_MAPPING`];
        if (priorityMappingEnv) {
            try {
                envConfig.priorityMapping = JSON.parse(priorityMappingEnv);
            } catch (error) {
                console.warn(`Failed to parse priority mapping from environment: ${error.message}`);
            }
        }
        
        // Label mapping
        const labelMappingEnv = process.env[`${this.envPrefix}LABEL_MAPPING`];
        if (labelMappingEnv) {
            try {
                envConfig.labelMapping = JSON.parse(labelMappingEnv);
            } catch (error) {
                console.warn(`Failed to parse label mapping from environment: ${error.message}`);
            }
        }
        
        // Supported events
        const supportedEventsEnv = process.env[`${this.envPrefix}SUPPORTED_EVENTS`];
        if (supportedEventsEnv) {
            try {
                envConfig.supportedEvents = JSON.parse(supportedEventsEnv);
            } catch (error) {
                // Try comma-separated format
                envConfig.supportedEvents = supportedEventsEnv.split(',').map(s => s.trim());
            }
        }
    }
    
    /**
     * Parse environment variable value based on config key type
     */
    parseEnvValue(value, configKey) {
        // Boolean values
        const booleanKeys = [
            'enableRealTimeSync', 'enableWebhooks', 'enableSignatureVerification',
            'enableAutoComments', 'enableMarkdown', 'enableMentions',
            'includeMetadata', 'enableEmojis', 'autoLabeling', 'enableLogging'
        ];
        
        if (booleanKeys.includes(configKey)) {
            return value.toLowerCase() === 'true' || value === '1';
        }
        
        // Number values
        const numberKeys = [
            'timeout', 'retryAttempts', 'retryDelay', 'syncInterval',
            'maxSyncRetries', 'syncBatchSize', 'maxConcurrentProcessing',
            'processingDelay', 'maxCommentLength', 'batchSize', 'batchDelay',
            'minRequestInterval', 'maxRequestsPerMinute'
        ];
        
        if (numberKeys.includes(configKey)) {
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? value : parsed;
        }
        
        return value;
    }
    
    /**
     * Validate configuration
     */
    validateConfig(config) {
        const errors = [];
        
        // Required fields
        if (!config.apiKey) {
            errors.push('API key is required (LINEAR_API_KEY)');
        }
        
        // Validate timeout
        if (config.timeout < 1000) {
            errors.push('Timeout must be at least 1000ms');
        }
        
        // Validate retry attempts
        if (config.retryAttempts < 0 || config.retryAttempts > 10) {
            errors.push('Retry attempts must be between 0 and 10');
        }
        
        // Validate sync interval
        if (config.syncInterval < 5000) {
            errors.push('Sync interval must be at least 5000ms');
        }
        
        // Validate batch sizes
        if (config.syncBatchSize < 1 || config.syncBatchSize > 100) {
            errors.push('Sync batch size must be between 1 and 100');
        }
        
        if (config.batchSize < 1 || config.batchSize > 50) {
            errors.push('Comment batch size must be between 1 and 50');
        }
        
        // Validate comment length
        if (config.maxCommentLength > 65536) {
            errors.push('Max comment length cannot exceed 65536 characters');
        }
        
        // Validate timestamp format
        const validTimestampFormats = ['iso', 'local', 'relative'];
        if (!validTimestampFormats.includes(config.timestampFormat)) {
            errors.push(`Timestamp format must be one of: ${validTimestampFormats.join(', ')}`);
        }
        
        // Validate log level
        const validLogLevels = ['error', 'warn', 'info', 'debug'];
        if (!validLogLevels.includes(config.logLevel)) {
            errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
        }
        
        if (errors.length > 0) {
            throw new Error(`Linear configuration validation failed:\n${errors.join('\n')}`);
        }
    }
    
    /**
     * Get configuration value
     */
    get(key, defaultValue = undefined) {
        const keys = key.split('.');
        let value = this.config;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }
    
    /**
     * Set configuration value
     */
    set(key, value) {
        const keys = key.split('.');
        let target = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in target) || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }
        
        target[keys[keys.length - 1]] = value;
    }
    
    /**
     * Get all configuration
     */
    getAll() {
        return { ...this.config };
    }
    
    /**
     * Update configuration
     */
    update(updates) {
        Object.assign(this.config, updates);
        this.validateConfig(this.config);
    }
    
    /**
     * Save configuration to file
     */
    saveToFile() {
        try {
            const configToSave = { ...this.config };
            
            // Remove sensitive data
            delete configToSave.apiKey;
            delete configToSave.webhookSecret;
            
            fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
            return true;
        } catch (error) {
            console.error(`Failed to save Linear config to file: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Get configuration for specific component
     */
    getClientConfig() {
        return {
            apiKey: this.config.apiKey,
            endpoint: this.config.endpoint,
            timeout: this.config.timeout,
            retryAttempts: this.config.retryAttempts,
            retryDelay: this.config.retryDelay,
            minRequestInterval: this.config.minRequestInterval
        };
    }
    
    getIssueManagerConfig() {
        return {
            defaultTeamId: this.config.defaultTeamId,
            defaultProjectId: this.config.defaultProjectId,
            defaultAssigneeId: this.config.defaultAssigneeId,
            autoLabeling: this.config.autoLabeling,
            priorityMapping: this.config.priorityMapping
        };
    }
    
    getStatusSyncConfig() {
        return {
            enableRealTimeSync: this.config.enableRealTimeSync,
            syncInterval: this.config.syncInterval,
            maxSyncRetries: this.config.maxSyncRetries,
            syncBatchSize: this.config.syncBatchSize,
            stateMapping: this.config.stateMapping
        };
    }
    
    getWebhookConfig() {
        return {
            webhookSecret: this.config.webhookSecret,
            enableSignatureVerification: this.config.enableSignatureVerification,
            supportedEvents: this.config.supportedEvents,
            maxConcurrentProcessing: this.config.maxConcurrentProcessing,
            processingDelay: this.config.processingDelay
        };
    }
    
    getCommentConfig() {
        return {
            enableAutoComments: this.config.enableAutoComments,
            botIconUrl: this.config.botIconUrl,
            maxCommentLength: this.config.maxCommentLength,
            enableMarkdown: this.config.enableMarkdown,
            enableMentions: this.config.enableMentions,
            timestampFormat: this.config.timestampFormat,
            includeMetadata: this.config.includeMetadata,
            enableEmojis: this.config.enableEmojis,
            batchSize: this.config.batchSize,
            batchDelay: this.config.batchDelay
        };
    }
    
    /**
     * Create example configuration file
     */
    static createExampleConfig(filePath = '.linear-config.example.json') {
        const exampleConfig = {
            "// API Configuration": "Configure Linear API access",
            "endpoint": "https://api.linear.app/graphql",
            "timeout": 30000,
            "retryAttempts": 3,
            "retryDelay": 1000,
            
            "// Team and Project Defaults": "Set default team and project IDs",
            "defaultTeamId": "your-team-id",
            "defaultProjectId": "your-project-id",
            "defaultAssigneeId": "your-assignee-id",
            
            "// Sync Configuration": "Configure real-time synchronization",
            "enableRealTimeSync": true,
            "syncInterval": 30000,
            "maxSyncRetries": 3,
            "syncBatchSize": 50,
            
            "// State Mapping": "Map Linear states to system states",
            "stateMapping": {
                "backlog": "pending",
                "unstarted": "pending",
                "started": "in_progress",
                "completed": "completed",
                "canceled": "cancelled"
            },
            
            "// Webhook Configuration": "Configure webhook processing",
            "enableWebhooks": true,
            "enableSignatureVerification": true,
            "supportedEvents": ["Issue", "Comment", "IssueLabel", "Project", "ProjectUpdate"],
            "maxConcurrentProcessing": 5,
            "processingDelay": 100,
            
            "// Comment Configuration": "Configure automated commenting",
            "enableAutoComments": true,
            "botIconUrl": "https://avatars.githubusercontent.com/u/claude-task-master",
            "maxCommentLength": 65536,
            "enableMarkdown": true,
            "enableMentions": true,
            "timestampFormat": "iso",
            "includeMetadata": true,
            "enableEmojis": true,
            "batchSize": 10,
            "batchDelay": 1000
        };
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(exampleConfig, null, 2));
            console.log(`Example Linear configuration created at: ${filePath}`);
            return true;
        } catch (error) {
            console.error(`Failed to create example config: ${error.message}`);
            return false;
        }
    }
}

module.exports = LinearConfig;

