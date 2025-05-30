/**
 * @fileoverview Codegen Integration Index
 * @description Main entry point for Codegen SDK integration and AI Development Engine
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenIntegration } from './client.js';
import { AIDevelopmentEngine } from './engine.js';
import { CodegenMonitor } from './monitor.js';
import { RequirementFormatter } from './formatter.js';
import { createCodegenConfig } from '../../config/codegen.js';
import { RequirementParser } from '../../utils/requirement-parser.js';
import { createCodegenAuthMiddleware } from '../../middleware/codegen-auth.js';

/**
 * Codegen Integration Factory
 * Creates and configures all Codegen integration components
 */
export class CodegenIntegrationFactory {
    constructor(options = {}) {
        this.options = {
            enableAutoInit: true,
            enableHealthChecks: true,
            enableMetrics: true,
            ...options
        };

        this.config = createCodegenConfig(this.options);
        this.components = {};
        this.initialized = false;

        log('debug', 'Codegen Integration Factory created');
    }

    /**
     * Initialize all Codegen integration components
     * @param {Object} dependencies - External dependencies (database, linear client, etc.)
     * @returns {Promise<Object>} Initialized components
     */
    async initialize(dependencies = {}) {
        if (this.initialized) {
            log('warning', 'Codegen integration already initialized');
            return this.components;
        }

        try {
            log('info', 'Initializing Codegen integration components...');

            // Initialize core client
            this.components.client = await this.createClient();

            // Initialize requirement parser and formatter
            this.components.requirementParser = this.createRequirementParser();
            this.components.requirementFormatter = this.createRequirementFormatter();

            // Initialize monitor
            this.components.monitor = this.createMonitor(dependencies);

            // Initialize AI Development Engine
            this.components.engine = await this.createEngine(dependencies);

            // Initialize authentication middleware
            this.components.authMiddleware = this.createAuthMiddleware();

            // Validate all components
            if (this.options.enableHealthChecks) {
                await this.validateComponents();
            }

            this.initialized = true;
            log('info', 'Codegen integration initialized successfully');

            return this.components;

        } catch (error) {
            log('error', `Failed to initialize Codegen integration: ${error.message}`);
            throw new Error(`Codegen integration initialization failed: ${error.message}`);
        }
    }

    /**
     * Create Codegen client
     * @returns {Promise<CodegenIntegration>} Codegen client
     */
    async createClient() {
        const apiConfig = this.config.getApiConfig();
        
        if (!apiConfig.token || !apiConfig.orgId) {
            if (this.config.isMockEnabled()) {
                log('info', 'Creating Codegen client in mock mode');
                return new CodegenIntegration('mock-token', 'mock-org', {
                    ...apiConfig,
                    mockMode: true
                });
            } else {
                throw new Error('Codegen API token and org ID are required');
            }
        }

        const client = new CodegenIntegration(apiConfig.token, apiConfig.orgId, apiConfig);

        // Validate connectivity if enabled
        if (this.config.get('auth.validateOnInit')) {
            const health = await client.getHealth();
            if (health.status === 'error') {
                throw new Error(`Codegen client health check failed: ${health.error}`);
            }
        }

        log('debug', 'Codegen client created successfully');
        return client;
    }

    /**
     * Create requirement parser
     * @returns {RequirementParser} Requirement parser
     */
    createRequirementParser() {
        const parser = new RequirementParser({
            enableNLP: this.config.isFeatureEnabled('enableNLP'),
            strictParsing: this.config.get('parsing.strictMode'),
            includeMetadata: true
        });

        log('debug', 'Requirement parser created');
        return parser;
    }

    /**
     * Create requirement formatter
     * @returns {RequirementFormatter} Requirement formatter
     */
    createRequirementFormatter() {
        const formatter = new RequirementFormatter({
            includeMetadata: true,
            includeTimestamps: true,
            maxPromptLength: this.config.get('api.maxPromptLength') || 8000,
            enableTemplating: true
        });

        log('debug', 'Requirement formatter created');
        return formatter;
    }

    /**
     * Create Codegen monitor
     * @param {Object} dependencies - External dependencies
     * @returns {CodegenMonitor} Codegen monitor
     */
    createMonitor(dependencies = {}) {
        const { database, linearClient } = dependencies;

        if (!this.components.client) {
            throw new Error('Codegen client must be created before monitor');
        }

        const monitor = new CodegenMonitor(
            this.components.client,
            database,
            linearClient,
            {
                ...this.config.getPollingConfig(),
                enableLinearUpdates: this.config.isFeatureEnabled('enableLinearIntegration'),
                enableDatabaseUpdates: this.config.isFeatureEnabled('enableDatabasePersistence')
            }
        );

        log('debug', 'Codegen monitor created');
        return monitor;
    }

    /**
     * Create AI Development Engine
     * @param {Object} dependencies - External dependencies
     * @returns {Promise<AIDevelopmentEngine>} AI Development Engine
     */
    async createEngine(dependencies = {}) {
        const { database, linearClient } = dependencies;

        if (!this.components.client || !this.components.monitor) {
            throw new Error('Client and monitor must be created before engine');
        }

        const engine = new AIDevelopmentEngine(
            this.components.client,
            database,
            linearClient,
            {
                enableProgressUpdates: this.config.isFeatureEnabled('enableProgressUpdates'),
                enableAutoMerge: this.config.isFeatureEnabled('enableAutoMerge'),
                maxRetries: this.config.get('retry.maxRetries'),
                pollInterval: this.config.get('polling.defaultInterval')
            }
        );

        log('debug', 'AI Development Engine created');
        return engine;
    }

    /**
     * Create authentication middleware
     * @returns {Function} Authentication middleware
     */
    createAuthMiddleware() {
        const middleware = createCodegenAuthMiddleware({
            enableTokenValidation: !this.config.isMockEnabled(),
            enableRateLimiting: this.config.get('rateLimiting.enabled'),
            enableAuditLogging: this.config.get('logging.enableRequestLogging'),
            tokenCacheTTL: 3600000, // 1 hour
            rateLimitWindow: 60000 // 1 minute
        });

        log('debug', 'Authentication middleware created');
        return middleware;
    }

    /**
     * Validate all components
     * @returns {Promise<void>}
     */
    async validateComponents() {
        log('debug', 'Validating Codegen integration components...');

        const validations = [];

        // Validate client
        if (this.components.client) {
            validations.push(
                this.components.client.getHealth().then(health => ({
                    component: 'client',
                    health
                }))
            );
        }

        // Validate parser
        if (this.components.requirementParser) {
            validations.push(
                Promise.resolve({
                    component: 'requirementParser',
                    health: this.components.requirementParser.getHealth()
                })
            );
        }

        // Validate formatter
        if (this.components.requirementFormatter) {
            validations.push(
                Promise.resolve({
                    component: 'requirementFormatter',
                    health: this.components.requirementFormatter.getHealth()
                })
            );
        }

        // Validate monitor
        if (this.components.monitor) {
            validations.push(
                Promise.resolve({
                    component: 'monitor',
                    health: this.components.monitor.getHealth()
                })
            );
        }

        // Validate engine
        if (this.components.engine) {
            validations.push(
                this.components.engine.getHealth().then(health => ({
                    component: 'engine',
                    health
                }))
            );
        }

        // Validate auth middleware
        if (this.components.authMiddleware && this.components.authMiddleware.middleware) {
            validations.push(
                Promise.resolve({
                    component: 'authMiddleware',
                    health: this.components.authMiddleware.middleware.getHealth()
                })
            );
        }

        const results = await Promise.allSettled(validations);
        const failures = results
            .filter(result => result.status === 'rejected' || result.value.health.status === 'error')
            .map(result => result.status === 'rejected' ? result.reason : result.value);

        if (failures.length > 0) {
            log('error', `Component validation failures: ${JSON.stringify(failures)}`);
            throw new Error(`Component validation failed: ${failures.length} components unhealthy`);
        }

        log('debug', 'All components validated successfully');
    }

    /**
     * Get component by name
     * @param {string} componentName - Name of component
     * @returns {*} Component instance
     */
    getComponent(componentName) {
        if (!this.initialized) {
            throw new Error('Integration not initialized. Call initialize() first.');
        }

        return this.components[componentName];
    }

    /**
     * Get all components
     * @returns {Object} All components
     */
    getComponents() {
        if (!this.initialized) {
            throw new Error('Integration not initialized. Call initialize() first.');
        }

        return { ...this.components };
    }

    /**
     * Get integration health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        if (!this.initialized) {
            return {
                status: 'not_initialized',
                message: 'Integration not initialized'
            };
        }

        try {
            const componentHealths = {};

            // Get health from all components
            for (const [name, component] of Object.entries(this.components)) {
                if (component && typeof component.getHealth === 'function') {
                    componentHealths[name] = await component.getHealth();
                } else if (component && component.middleware && typeof component.middleware.getHealth === 'function') {
                    componentHealths[name] = component.middleware.getHealth();
                } else {
                    componentHealths[name] = { status: 'unknown' };
                }
            }

            // Determine overall status
            const hasErrors = Object.values(componentHealths).some(health => health.status === 'error');
            const hasWarnings = Object.values(componentHealths).some(health => health.status === 'warning');

            return {
                status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy',
                initialized: this.initialized,
                configuration: this.config.getSummary(),
                components: componentHealths,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get integration metrics
     * @returns {Object} Integration metrics
     */
    getMetrics() {
        if (!this.initialized) {
            return { error: 'Integration not initialized' };
        }

        const metrics = {
            initialized: this.initialized,
            components: Object.keys(this.components),
            configuration: this.config.getSummary()
        };

        // Add component-specific metrics
        if (this.components.monitor) {
            metrics.monitoring = this.components.monitor.getStatistics();
        }

        if (this.components.engine) {
            metrics.activeTasks = this.components.engine.activeTasks.size;
        }

        return metrics;
    }

    /**
     * Shutdown all components
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }

        log('info', 'Shutting down Codegen integration...');

        const shutdownPromises = [];

        // Shutdown components in reverse order
        const shutdownOrder = ['engine', 'monitor', 'client', 'authMiddleware'];

        for (const componentName of shutdownOrder) {
            const component = this.components[componentName];
            
            if (component && typeof component.shutdown === 'function') {
                shutdownPromises.push(
                    component.shutdown().catch(error => {
                        log('error', `Error shutting down ${componentName}: ${error.message}`);
                    })
                );
            } else if (component && component.cleanup && typeof component.cleanup === 'function') {
                shutdownPromises.push(
                    Promise.resolve(component.cleanup()).catch(error => {
                        log('error', `Error cleaning up ${componentName}: ${error.message}`);
                    })
                );
            }
        }

        await Promise.allSettled(shutdownPromises);

        this.components = {};
        this.initialized = false;

        log('info', 'Codegen integration shutdown complete');
    }
}

/**
 * Create and initialize Codegen integration
 * @param {Object} dependencies - External dependencies
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Initialized components
 */
export async function createCodegenIntegration(dependencies = {}, options = {}) {
    const factory = new CodegenIntegrationFactory(options);
    return await factory.initialize(dependencies);
}

/**
 * Create Codegen integration factory
 * @param {Object} options - Configuration options
 * @returns {CodegenIntegrationFactory} Integration factory
 */
export function createCodegenIntegrationFactory(options = {}) {
    return new CodegenIntegrationFactory(options);
}

// Export all components for direct use
export {
    CodegenIntegration,
    AIDevelopmentEngine,
    CodegenMonitor,
    RequirementFormatter,
    RequirementParser,
    createCodegenAuthMiddleware
};

// Export configuration
export { createCodegenConfig };

export default CodegenIntegrationFactory;

