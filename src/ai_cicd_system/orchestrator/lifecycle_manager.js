/**
 * @fileoverview Lifecycle Manager
 * @description Component lifecycle management for the orchestrator
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Lifecycle Manager for managing component initialization and shutdown
 */
export class LifecycleManager {
    constructor(componentRegistry) {
        if (!componentRegistry) {
            throw new Error('ComponentRegistry is required');
        }

        this.registry = componentRegistry;
        this.initializationOrder = [];
        this.shutdownOrder = [];
        this.isInitialized = false;
        this.initializationPromises = new Map();
        this.shutdownPromises = new Map();
    }

    /**
     * Initialize the lifecycle manager
     */
    async initialize() {
        log('debug', 'Initializing lifecycle manager...');
        this.isInitialized = true;
        log('debug', 'Lifecycle manager initialized');
    }

    /**
     * Initialize all registered components in dependency order
     * @param {Object} options - Initialization options
     * @param {number} options.timeout - Timeout per component in milliseconds
     * @param {boolean} options.parallel - Whether to initialize independent components in parallel
     * @param {boolean} options.continueOnError - Whether to continue if a component fails
     * @returns {Promise<Object>} Initialization results
     */
    async initializeAll(options = {}) {
        const {
            timeout = 30000,
            parallel = true,
            continueOnError = false
        } = options;

        if (!this.isInitialized) {
            throw new Error('Lifecycle manager not initialized');
        }

        log('info', 'Starting component initialization...');

        try {
            // Get components in dependency order
            const sortedComponents = this.registry.topologicalSort();
            this.initializationOrder = [...sortedComponents];
            this.shutdownOrder = [...sortedComponents].reverse();

            const results = {
                total: sortedComponents.length,
                successful: 0,
                failed: 0,
                skipped: 0,
                errors: [],
                timing: {}
            };

            if (parallel) {
                await this._initializeInParallel(sortedComponents, timeout, continueOnError, results);
            } else {
                await this._initializeSequentially(sortedComponents, timeout, continueOnError, results);
            }

            log('info', `Component initialization completed: ${results.successful} successful, ${results.failed} failed, ${results.skipped} skipped`);
            return results;

        } catch (error) {
            log('error', `Component initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize components in parallel where possible
     * @param {Array<string>} sortedComponents - Components in dependency order
     * @param {number} timeout - Timeout per component
     * @param {boolean} continueOnError - Whether to continue on error
     * @param {Object} results - Results object to update
     * @private
     */
    async _initializeInParallel(sortedComponents, timeout, continueOnError, results) {
        const dependencyLevels = this._groupByDependencyLevel(sortedComponents);
        
        for (const level of dependencyLevels) {
            log('debug', `Initializing dependency level with ${level.length} components`);
            
            const levelPromises = level.map(componentName => 
                this._initializeComponentWithTimeout(componentName, timeout)
                    .then(timing => {
                        results.successful++;
                        results.timing[componentName] = timing;
                        return { componentName, success: true, timing };
                    })
                    .catch(error => {
                        results.failed++;
                        results.errors.push({ component: componentName, error: error.message });
                        
                        if (!continueOnError) {
                            throw error;
                        }
                        
                        return { componentName, success: false, error };
                    })
            );

            try {
                await Promise.all(levelPromises);
            } catch (error) {
                if (!continueOnError) {
                    throw error;
                }
            }
        }
    }

    /**
     * Initialize components sequentially
     * @param {Array<string>} sortedComponents - Components in dependency order
     * @param {number} timeout - Timeout per component
     * @param {boolean} continueOnError - Whether to continue on error
     * @param {Object} results - Results object to update
     * @private
     */
    async _initializeSequentially(sortedComponents, timeout, continueOnError, results) {
        for (const componentName of sortedComponents) {
            try {
                const timing = await this._initializeComponentWithTimeout(componentName, timeout);
                results.successful++;
                results.timing[componentName] = timing;
            } catch (error) {
                results.failed++;
                results.errors.push({ component: componentName, error: error.message });
                
                if (!continueOnError) {
                    throw error;
                }
            }
        }
    }

    /**
     * Group components by dependency level for parallel initialization
     * @param {Array<string>} sortedComponents - Components in dependency order
     * @returns {Array<Array<string>>} Components grouped by dependency level
     * @private
     */
    _groupByDependencyLevel(sortedComponents) {
        const levels = [];
        const processed = new Set();
        
        while (processed.size < sortedComponents.length) {
            const currentLevel = [];
            
            for (const componentName of sortedComponents) {
                if (processed.has(componentName)) continue;
                
                const dependencies = this.registry.dependencies.get(componentName) || [];
                const allDepsProcessed = dependencies.every(dep => processed.has(dep));
                
                if (allDepsProcessed) {
                    currentLevel.push(componentName);
                }
            }
            
            if (currentLevel.length === 0) {
                throw new Error('Circular dependency detected or unresolvable dependencies');
            }
            
            currentLevel.forEach(name => processed.add(name));
            levels.push(currentLevel);
        }
        
        return levels;
    }

    /**
     * Initialize a single component with timeout
     * @param {string} name - Component name
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Object>} Timing information
     */
    async _initializeComponentWithTimeout(name, timeout) {
        const startTime = Date.now();
        
        try {
            await Promise.race([
                this.initializeComponent(name),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Component initialization timeout: ${name}`)), timeout)
                )
            ]);
            
            const duration = Date.now() - startTime;
            return { duration, success: true };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            throw new Error(`Failed to initialize component '${name}': ${error.message}`);
        }
    }

    /**
     * Initialize a single component
     * @param {string} name - Component name
     * @returns {Promise<void>}
     */
    async initializeComponent(name) {
        const metadata = this.registry.getMetadata(name);
        if (!metadata) {
            throw new Error(`Component '${name}' not found in registry`);
        }

        if (metadata.status === 'initialized') {
            log('debug', `Component '${name}' already initialized`);
            return;
        }

        if (metadata.status === 'initializing') {
            // Wait for existing initialization
            const existingPromise = this.initializationPromises.get(name);
            if (existingPromise) {
                return await existingPromise;
            }
        }

        log('debug', `Initializing component: ${name}`);

        // Check dependencies are initialized
        const dependencies = metadata.dependencies || [];
        for (const dep of dependencies) {
            const depMetadata = this.registry.getMetadata(dep);
            if (!depMetadata || depMetadata.status !== 'initialized') {
                throw new Error(`Dependency '${dep}' of component '${name}' is not initialized`);
            }
        }

        // Mark as initializing
        this.registry.updateStatus(name, 'initializing');

        const initPromise = this._performComponentInitialization(name, metadata);
        this.initializationPromises.set(name, initPromise);

        try {
            await initPromise;
            this.registry.updateStatus(name, 'initialized');
            log('info', `✅ Component initialized: ${name}`);
        } catch (error) {
            this.registry.updateStatus(name, 'failed', error);
            log('error', `❌ Component initialization failed: ${name} - ${error.message}`);
            throw error;
        } finally {
            this.initializationPromises.delete(name);
        }
    }

    /**
     * Perform the actual component initialization
     * @param {string} name - Component name
     * @param {Object} metadata - Component metadata
     * @returns {Promise<void>}
     * @private
     */
    async _performComponentInitialization(name, metadata) {
        const component = metadata.instance;
        
        try {
            if (typeof component.initialize === 'function') {
                await component.initialize();
            } else {
                throw new Error(`Component '${name}' does not have an initialize method`);
            }
        } catch (error) {
            throw new Error(`Component '${name}' initialization failed: ${error.message}`);
        }
    }

    /**
     * Shutdown all components in reverse dependency order
     * @param {Object} options - Shutdown options
     * @param {number} options.timeout - Timeout per component in milliseconds
     * @param {boolean} options.force - Whether to force shutdown even if components fail
     * @returns {Promise<Object>} Shutdown results
     */
    async shutdownAll(options = {}) {
        const {
            timeout = 30000,
            force = true
        } = options;

        log('info', 'Starting component shutdown...');

        const results = {
            total: this.shutdownOrder.length,
            successful: 0,
            failed: 0,
            errors: [],
            timing: {}
        };

        for (const componentName of this.shutdownOrder) {
            try {
                const timing = await this._shutdownComponentWithTimeout(componentName, timeout);
                results.successful++;
                results.timing[componentName] = timing;
            } catch (error) {
                results.failed++;
                results.errors.push({ component: componentName, error: error.message });
                
                if (!force) {
                    throw error;
                }
            }
        }

        log('info', `Component shutdown completed: ${results.successful} successful, ${results.failed} failed`);
        return results;
    }

    /**
     * Shutdown a single component with timeout
     * @param {string} name - Component name
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Object>} Timing information
     * @private
     */
    async _shutdownComponentWithTimeout(name, timeout) {
        const startTime = Date.now();
        
        try {
            await Promise.race([
                this.shutdownComponent(name),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Component shutdown timeout: ${name}`)), timeout)
                )
            ]);
            
            const duration = Date.now() - startTime;
            return { duration, success: true };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            if (error.message.includes('timeout')) {
                throw error;
            }
            throw new Error(`Failed to shutdown component '${name}': ${error.message}`);
        }
    }

    /**
     * Shutdown a single component
     * @param {string} name - Component name
     * @returns {Promise<void>}
     */
    async shutdownComponent(name) {
        const metadata = this.registry.getMetadata(name);
        if (!metadata) {
            log('warning', `Component '${name}' not found in registry during shutdown`);
            return;
        }

        if (metadata.status === 'shutdown' || metadata.status === 'registered') {
            log('debug', `Component '${name}' already shutdown or not initialized`);
            return;
        }

        if (metadata.status === 'shutting_down') {
            // Wait for existing shutdown
            const existingPromise = this.shutdownPromises.get(name);
            if (existingPromise) {
                return await existingPromise;
            }
        }

        log('debug', `Shutting down component: ${name}`);

        // Mark as shutting down
        this.registry.updateStatus(name, 'shutting_down');

        const shutdownPromise = this._performComponentShutdown(name, metadata);
        this.shutdownPromises.set(name, shutdownPromise);

        try {
            await shutdownPromise;
            this.registry.updateStatus(name, 'shutdown');
            log('info', `✅ Component shutdown: ${name}`);
        } catch (error) {
            this.registry.updateStatus(name, 'failed', error);
            log('error', `❌ Component shutdown failed: ${name} - ${error.message}`);
            throw error;
        } finally {
            this.shutdownPromises.delete(name);
        }
    }

    /**
     * Perform the actual component shutdown
     * @param {string} name - Component name
     * @param {Object} metadata - Component metadata
     * @returns {Promise<void>}
     * @private
     */
    async _performComponentShutdown(name, metadata) {
        const component = metadata.instance;
        
        try {
            if (typeof component.shutdown === 'function') {
                await component.shutdown();
            } else {
                log('debug', `Component '${name}' does not have a shutdown method`);
            }
        } catch (error) {
            throw new Error(`Component '${name}' shutdown failed: ${error.message}`);
        }
    }

    /**
     * Get lifecycle statistics
     * @returns {Object} Lifecycle statistics
     */
    getStatistics() {
        const registryStats = this.registry.getStatistics();
        
        return {
            is_initialized: this.isInitialized,
            initialization_order: this.initializationOrder,
            shutdown_order: this.shutdownOrder,
            active_initializations: this.initializationPromises.size,
            active_shutdowns: this.shutdownPromises.size,
            registry_stats: registryStats
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = this.getStatistics();
        const healthChecks = await this.registry.runHealthChecks();
        
        const unhealthyComponents = Object.entries(healthChecks)
            .filter(([, result]) => result.status !== 'healthy')
            .map(([name]) => name);

        return {
            status: unhealthyComponents.length === 0 ? 'healthy' : 'degraded',
            is_initialized: this.isInitialized,
            total_components: stats.registry_stats.total_components,
            unhealthy_components: unhealthyComponents,
            health_checks: healthChecks
        };
    }

    /**
     * Restart a component (shutdown then initialize)
     * @param {string} name - Component name
     * @param {Object} options - Restart options
     * @returns {Promise<void>}
     */
    async restartComponent(name, options = {}) {
        const { timeout = 30000 } = options;
        
        log('info', `Restarting component: ${name}`);
        
        try {
            await this._shutdownComponentWithTimeout(name, timeout);
            await this._initializeComponentWithTimeout(name, timeout);
            log('info', `✅ Component restarted: ${name}`);
        } catch (error) {
            log('error', `❌ Component restart failed: ${name} - ${error.message}`);
            throw error;
        }
    }

    /**
     * Shutdown the lifecycle manager
     */
    async shutdown() {
        log('debug', 'Shutting down lifecycle manager...');
        
        // Shutdown all components first
        if (this.shutdownOrder.length > 0) {
            await this.shutdownAll({ force: true });
        }
        
        this.initializationOrder = [];
        this.shutdownOrder = [];
        this.initializationPromises.clear();
        this.shutdownPromises.clear();
        this.isInitialized = false;
        
        log('debug', 'Lifecycle manager shutdown complete');
    }
}

export default LifecycleManager;
