/**
 * Test Configuration Management
 * 
 * Centralized configuration management for all testing frameworks
 * including environment-specific settings, test parameters, and
 * validation thresholds.
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

export class TestConfig extends EventEmitter {
    constructor(configPath = null) {
        super();
        this.configPath = configPath || path.join(process.cwd(), 'tests', 'config', 'test-config.json');
        this.config = {};
        this.defaultConfig = this.getDefaultConfig();
        this.environmentOverrides = new Map();
        this.runtimeOverrides = new Map();
        
        this.loadConfiguration();
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            // Global test settings
            global: {
                timeout: 300000, // 5 minutes
                retryAttempts: 3,
                parallelExecution: true,
                maxConcurrency: 10,
                enableLogging: true,
                logLevel: 'info',
                reportFormat: 'json',
                enableMetrics: true,
                enableTrends: true
            },

            // Environment settings
            environments: {
                development: {
                    database: {
                        enabled: true,
                        type: 'mock',
                        host: 'localhost',
                        port: 5432,
                        database: 'test_dev',
                        username: 'test_user',
                        password: 'test_password',
                        poolSize: 5
                    },
                    cache: {
                        enabled: true,
                        type: 'mock',
                        host: 'localhost',
                        port: 6379,
                        database: 0
                    },
                    api: {
                        baseUrl: 'http://localhost:3000',
                        timeout: 30000,
                        retries: 3
                    },
                    isolation: 'process',
                    cleanup: true
                },
                staging: {
                    database: {
                        enabled: true,
                        type: 'postgresql',
                        host: 'staging-db.example.com',
                        port: 5432,
                        database: 'test_staging',
                        username: 'test_user',
                        password: 'test_password',
                        poolSize: 10
                    },
                    cache: {
                        enabled: true,
                        type: 'redis',
                        host: 'staging-cache.example.com',
                        port: 6379,
                        database: 1
                    },
                    api: {
                        baseUrl: 'https://staging-api.example.com',
                        timeout: 30000,
                        retries: 3
                    },
                    isolation: 'container',
                    cleanup: true
                },
                production: {
                    database: {
                        enabled: false, // Don't test against production DB
                        type: 'mock'
                    },
                    cache: {
                        enabled: false, // Don't test against production cache
                        type: 'mock'
                    },
                    api: {
                        baseUrl: 'https://api.example.com',
                        timeout: 30000,
                        retries: 5
                    },
                    isolation: 'vm',
                    cleanup: true,
                    readOnly: true
                }
            },

            // Test framework settings
            frameworks: {
                endToEnd: {
                    enabled: true,
                    timeout: 600000, // 10 minutes
                    validateSteps: true,
                    trackPerformance: true,
                    generateReports: true,
                    screenshotOnFailure: false
                },
                integration: {
                    enabled: true,
                    timeout: 300000, // 5 minutes
                    validateIntegration: true,
                    testAllComponents: true,
                    validateSecurity: true
                },
                performance: {
                    enabled: true,
                    timeout: 1800000, // 30 minutes
                    loadTestDuration: 600000, // 10 minutes
                    stressTestDuration: 900000, // 15 minutes
                    maxVirtualUsers: 1000,
                    rampUpTime: 120000, // 2 minutes
                    thresholds: {
                        responseTime: {
                            p95: 5000,
                            p99: 10000
                        },
                        throughput: 100,
                        errorRate: 0.01,
                        resourceUsage: {
                            cpu: 80,
                            memory: 70,
                            disk: 85
                        }
                    }
                },
                security: {
                    enabled: true,
                    timeout: 900000, // 15 minutes
                    vulnerabilityScanning: true,
                    penetrationTesting: false,
                    complianceChecking: true,
                    scanDepth: 'comprehensive'
                }
            },

            // Component-specific settings
            components: {
                database: {
                    testOperations: ['create', 'read', 'update', 'delete', 'query'],
                    testConcurrency: 50,
                    testDataSize: 1000,
                    validatePerformance: true,
                    validateIntegrity: true
                },
                orchestrator: {
                    testWorkflows: 10,
                    testComplexity: 'medium',
                    validateStateManagement: true,
                    validateErrorRecovery: true
                },
                codegen: {
                    testTasks: 5,
                    validatePRCreation: true,
                    validateAPIIntegration: true,
                    mockMode: false
                },
                agentapi: {
                    testSessions: 10,
                    validateCommunication: true,
                    validateAuthentication: true,
                    validateLoadBalancing: true
                },
                webhook: {
                    testEvents: 20,
                    validateProcessing: true,
                    validateSecurity: true,
                    validateRetry: true
                },
                monitoring: {
                    testDuration: 120000, // 2 minutes
                    validateMetrics: true,
                    validateAlerts: true,
                    validateDashboards: true
                }
            },

            // Validation settings
            validation: {
                workflow: {
                    strictValidation: true,
                    validateStateTransitions: true,
                    validateStepDependencies: true,
                    validateDataFlow: true,
                    validateTiming: true,
                    maxValidationTime: 30000
                },
                performance: {
                    enableBaseline: true,
                    enableRegression: true,
                    enableTrends: true,
                    regressionThreshold: 0.1,
                    baselineWindow: 30 // days
                },
                security: {
                    enableVulnerabilityScanning: true,
                    enableComplianceChecking: true,
                    enablePenetrationTesting: false,
                    severityThreshold: 'medium'
                },
                dataIntegrity: {
                    enableChecksums: true,
                    enableValidation: true,
                    enableConsistencyChecks: true,
                    validateTransactions: true
                }
            },

            // Reporting settings
            reporting: {
                enabled: true,
                formats: ['json', 'html', 'xml'],
                outputDir: './test-reports',
                includeMetrics: true,
                includeTrends: true,
                includeRecommendations: true,
                retentionDays: 30,
                realTimeUpdates: true
            },

            // Monitoring settings
            monitoring: {
                enabled: true,
                collectSystemMetrics: true,
                collectApplicationMetrics: true,
                collectPerformanceMetrics: true,
                metricsInterval: 5000, // 5 seconds
                alertThresholds: {
                    memoryUsage: 90,
                    cpuUsage: 95,
                    diskUsage: 85,
                    errorRate: 0.05,
                    responseTime: 10000
                }
            },

            // External services
            externalServices: {
                codegen: {
                    enabled: true,
                    apiUrl: 'https://api.codegen.sh',
                    timeout: 120000,
                    retries: 3,
                    mockMode: false
                },
                github: {
                    enabled: true,
                    apiUrl: 'https://api.github.com',
                    timeout: 30000,
                    retries: 3,
                    mockMode: false
                },
                linear: {
                    enabled: true,
                    apiUrl: 'https://api.linear.app',
                    timeout: 30000,
                    retries: 3,
                    mockMode: false
                }
            },

            // Data generation settings
            dataGeneration: {
                seed: null, // null for random seed
                locale: 'en-US',
                complexity: 'medium',
                cacheGenerated: true,
                cleanupAfterTest: true
            }
        };
    }

    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            // Load base configuration
            await this.loadBaseConfiguration();
            
            // Load environment-specific overrides
            await this.loadEnvironmentOverrides();
            
            // Apply runtime overrides
            this.applyRuntimeOverrides();
            
            // Validate configuration
            this.validateConfiguration();
            
            this.emit('config:loaded', this.config);
            
        } catch (error) {
            console.warn(`Failed to load configuration: ${error.message}`);
            this.config = { ...this.defaultConfig };
            this.emit('config:default', this.config);
        }
    }

    /**
     * Load base configuration
     */
    async loadBaseConfiguration() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            this.config = this.mergeConfigs(this.defaultConfig, loadedConfig);
        } catch (error) {
            // If config file doesn't exist, use default
            this.config = { ...this.defaultConfig };
        }
    }

    /**
     * Load environment-specific overrides
     */
    async loadEnvironmentOverrides() {
        const environment = process.env.NODE_ENV || 'development';
        const envConfigPath = path.join(
            path.dirname(this.configPath),
            `test-config.${environment}.json`
        );
        
        try {
            const envConfigData = await fs.readFile(envConfigPath, 'utf8');
            const envConfig = JSON.parse(envConfigData);
            this.config = this.mergeConfigs(this.config, envConfig);
            this.environmentOverrides.set(environment, envConfig);
        } catch (error) {
            // Environment-specific config is optional
        }
    }

    /**
     * Apply runtime overrides
     */
    applyRuntimeOverrides() {
        // Apply environment variables
        this.applyEnvironmentVariables();
        
        // Apply command line arguments
        this.applyCommandLineArguments();
        
        // Apply programmatic overrides
        for (const [key, value] of this.runtimeOverrides) {
            this.setConfigValue(key, value);
        }
    }

    /**
     * Apply environment variables
     */
    applyEnvironmentVariables() {
        const envMappings = {
            'TEST_TIMEOUT': 'global.timeout',
            'TEST_CONCURRENCY': 'global.maxConcurrency',
            'TEST_LOG_LEVEL': 'global.logLevel',
            'TEST_ENABLE_METRICS': 'global.enableMetrics',
            'TEST_DATABASE_HOST': 'environments.development.database.host',
            'TEST_DATABASE_PORT': 'environments.development.database.port',
            'TEST_API_BASE_URL': 'environments.development.api.baseUrl',
            'CODEGEN_API_URL': 'externalServices.codegen.apiUrl',
            'CODEGEN_MOCK_MODE': 'externalServices.codegen.mockMode'
        };

        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const envValue = process.env[envVar];
            if (envValue !== undefined) {
                this.setConfigValue(configPath, this.parseEnvironmentValue(envValue));
            }
        }
    }

    /**
     * Apply command line arguments
     */
    applyCommandLineArguments() {
        const args = process.argv.slice(2);
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg.startsWith('--test-')) {
                const configKey = arg.substring(7).replace(/-/g, '.');
                const value = args[i + 1];
                
                if (value && !value.startsWith('--')) {
                    this.setConfigValue(configKey, this.parseEnvironmentValue(value));
                    i++; // Skip the value argument
                }
            }
        }
    }

    /**
     * Parse environment value
     */
    parseEnvironmentValue(value) {
        // Try to parse as JSON first
        try {
            return JSON.parse(value);
        } catch {
            // If not JSON, try to parse as number or boolean
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (/^\d+$/.test(value)) return parseInt(value, 10);
            if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
            return value;
        }
    }

    /**
     * Validate configuration
     */
    validateConfiguration() {
        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Validate global settings
        this.validateGlobalSettings(validation);
        
        // Validate environment settings
        this.validateEnvironmentSettings(validation);
        
        // Validate framework settings
        this.validateFrameworkSettings(validation);
        
        // Validate thresholds
        this.validateThresholds(validation);

        if (!validation.valid) {
            throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.warnings.length > 0) {
            console.warn('Configuration warnings:', validation.warnings.join(', '));
        }
    }

    /**
     * Validate global settings
     */
    validateGlobalSettings(validation) {
        const global = this.config.global;
        
        if (global.timeout < 1000) {
            validation.errors.push('Global timeout must be at least 1000ms');
            validation.valid = false;
        }
        
        if (global.maxConcurrency < 1) {
            validation.errors.push('Max concurrency must be at least 1');
            validation.valid = false;
        }
        
        if (global.retryAttempts < 0) {
            validation.errors.push('Retry attempts cannot be negative');
            validation.valid = false;
        }
    }

    /**
     * Validate environment settings
     */
    validateEnvironmentSettings(validation) {
        for (const [envName, envConfig] of Object.entries(this.config.environments)) {
            if (envConfig.database?.enabled && !envConfig.database?.host) {
                validation.errors.push(`Database host required for environment: ${envName}`);
                validation.valid = false;
            }
            
            if (envConfig.api?.baseUrl && !this.isValidUrl(envConfig.api.baseUrl)) {
                validation.errors.push(`Invalid API base URL for environment: ${envName}`);
                validation.valid = false;
            }
        }
    }

    /**
     * Validate framework settings
     */
    validateFrameworkSettings(validation) {
        const frameworks = this.config.frameworks;
        
        if (frameworks.performance?.thresholds?.responseTime?.p95 <= 0) {
            validation.errors.push('Performance response time threshold must be positive');
            validation.valid = false;
        }
        
        if (frameworks.performance?.maxVirtualUsers < 1) {
            validation.errors.push('Max virtual users must be at least 1');
            validation.valid = false;
        }
    }

    /**
     * Validate thresholds
     */
    validateThresholds(validation) {
        const thresholds = this.config.frameworks?.performance?.thresholds;
        
        if (thresholds) {
            if (thresholds.errorRate < 0 || thresholds.errorRate > 1) {
                validation.errors.push('Error rate threshold must be between 0 and 1');
                validation.valid = false;
            }
            
            if (thresholds.resourceUsage) {
                for (const [resource, threshold] of Object.entries(thresholds.resourceUsage)) {
                    if (threshold < 0 || threshold > 100) {
                        validation.errors.push(`Resource usage threshold for ${resource} must be between 0 and 100`);
                        validation.valid = false;
                    }
                }
            }
        }
    }

    /**
     * Merge configurations
     */
    mergeConfigs(base, override) {
        const result = { ...base };
        
        for (const [key, value] of Object.entries(override)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.mergeConfigs(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * Set configuration value by path
     */
    setConfigValue(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get configuration value by path
     */
    getConfigValue(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    /**
     * Set runtime override
     */
    setRuntimeOverride(path, value) {
        this.runtimeOverrides.set(path, value);
        this.setConfigValue(path, value);
        this.emit('config:override', { path, value });
    }

    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
            this.emit('config:saved', this.config);
        } catch (error) {
            this.emit('config:save:failed', error);
            throw error;
        }
    }

    /**
     * Get environment configuration
     */
    getEnvironmentConfig(environment = null) {
        const env = environment || process.env.NODE_ENV || 'development';
        return this.config.environments[env] || this.config.environments.development;
    }

    /**
     * Get framework configuration
     */
    getFrameworkConfig(framework) {
        return this.config.frameworks[framework];
    }

    /**
     * Get component configuration
     */
    getComponentConfig(component) {
        return this.config.components[component];
    }

    /**
     * Get validation configuration
     */
    getValidationConfig(validator) {
        return this.config.validation[validator];
    }

    /**
     * Utility methods
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get full configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Reset to default configuration
     */
    resetToDefault() {
        this.config = { ...this.defaultConfig };
        this.runtimeOverrides.clear();
        this.emit('config:reset', this.config);
    }
}

// Export singleton instance
export const testConfig = new TestConfig();

