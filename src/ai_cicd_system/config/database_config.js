/**
 * @fileoverview Database Configuration
 * @description Configuration management for PostgreSQL database connections
 */

/**
 * Database configuration with environment variable support
 */
export class DatabaseConfig {
    constructor(overrides = {}) {
        this.config = {
            // Connection settings
            host: process.env.DB_HOST || overrides.host || 'localhost',
            port: parseInt(process.env.DB_PORT || overrides.port || '5432'),
            database: process.env.DB_NAME || overrides.database || 'codegen_taskmaster',
            user: process.env.DB_USER || overrides.user || 'software_developer',
            password: process.env.DB_PASSWORD || overrides.password,
            
            // SSL settings
            ssl: this._parseSSLConfig(process.env.DB_SSL || overrides.ssl),
            
            // Connection pool settings
            max: parseInt(process.env.DB_POOL_MAX || overrides.max_connections || '20'),
            min: parseInt(process.env.DB_POOL_MIN || overrides.min_connections || '5'),
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || overrides.idle_timeout || '30000'),
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || overrides.connection_timeout || '2000'),
            
            // Query settings
            statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || overrides.statement_timeout || '60000'),
            query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || overrides.query_timeout || '30000'),
            
            // Application settings
            enable_mock: process.env.DB_ENABLE_MOCK === 'true' || overrides.enable_mock || false,
            enable_logging: process.env.DB_ENABLE_LOGGING !== 'false' && (overrides.enable_logging !== false),
            log_level: process.env.DB_LOG_LEVEL || overrides.log_level || 'info',
            
            // Migration settings
            migrations_table: process.env.DB_MIGRATIONS_TABLE || overrides.migrations_table || 'schema_migrations',
            auto_migrate: process.env.DB_AUTO_MIGRATE === 'true' || overrides.auto_migrate || false,
            
            ...overrides
        };
        
        this._validateConfig();
    }
    
    /**
     * Parse SSL configuration from string or object
     * @param {string|object|boolean} sslConfig - SSL configuration
     * @returns {object|boolean} Parsed SSL configuration
     */
    _parseSSLConfig(sslConfig) {
        if (typeof sslConfig === 'boolean') {
            return sslConfig;
        }
        
        if (typeof sslConfig === 'string') {
            switch (sslConfig.toLowerCase()) {
                case 'true':
                case 'require':
                    return { rejectUnauthorized: true };
                case 'false':
                case 'disable':
                    return false;
                case 'prefer':
                    return { rejectUnauthorized: false };
                default:
                    return false;
            }
        }
        
        return sslConfig || false;
    }
    
    /**
     * Validate configuration parameters
     * @throws {Error} If configuration is invalid
     */
    _validateConfig() {
        const required = ['host', 'port', 'database', 'user'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
        }
        
        if (this.config.port < 1 || this.config.port > 65535) {
            throw new Error('Database port must be between 1 and 65535');
        }
        
        if (this.config.max < this.config.min) {
            throw new Error('Maximum pool size must be greater than or equal to minimum pool size');
        }
        
        if (!this.config.enable_mock && !this.config.password) {
            console.warn('⚠️  Database password not provided - this may cause connection failures');
        }
    }
    
    /**
     * Get configuration for pg Pool
     * @returns {object} Pool configuration
     */
    getPoolConfig() {
        return {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
            ssl: this.config.ssl,
            max: this.config.max,
            min: this.config.min,
            idleTimeoutMillis: this.config.idleTimeoutMillis,
            connectionTimeoutMillis: this.config.connectionTimeoutMillis,
            statement_timeout: this.config.statement_timeout,
            query_timeout: this.config.query_timeout
        };
    }
    
    /**
     * Get connection string for database
     * @returns {string} PostgreSQL connection string
     */
    getConnectionString() {
        const { host, port, database, user, password } = this.config;
        const auth = password ? `${user}:${password}` : user;
        return `postgresql://${auth}@${host}:${port}/${database}`;
    }
    
    /**
     * Get configuration for testing
     * @returns {object} Test database configuration
     */
    getTestConfig() {
        return new DatabaseConfig({
            ...this.config,
            database: `${this.config.database}_test`,
            enable_mock: true,
            enable_logging: false
        });
    }
    
    /**
     * Create configuration from environment variables
     * @returns {DatabaseConfig} Database configuration instance
     */
    static fromEnvironment() {
        return new DatabaseConfig();
    }
    
    /**
     * Create mock configuration for development
     * @returns {DatabaseConfig} Mock database configuration
     */
    static createMockConfig() {
        return new DatabaseConfig({
            enable_mock: true,
            enable_logging: true,
            log_level: 'debug'
        });
    }
    
    /**
     * Create production configuration
     * @returns {DatabaseConfig} Production database configuration
     */
    static createProductionConfig() {
        return new DatabaseConfig({
            ssl: { rejectUnauthorized: true },
            max: 50,
            min: 10,
            enable_logging: true,
            log_level: 'warn',
            auto_migrate: false
        });
    }
}

export default DatabaseConfig;

