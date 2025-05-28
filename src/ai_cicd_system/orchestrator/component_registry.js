/**
 * @fileoverview Component Registry
 * @description Component registration and discovery system for the orchestrator
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Component Registry for managing system components and their dependencies
 */
export class ComponentRegistry {
    constructor() {
        this.components = new Map();
        this.dependencies = new Map();
        this.healthChecks = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the component registry
     */
    async initialize() {
        log('debug', 'Initializing component registry...');
        this.isInitialized = true;
        log('debug', 'Component registry initialized');
    }

    /**
     * Register a component with the registry
     * @param {string} name - Component name
     * @param {Object} component - Component instance
     * @param {Object} config - Component configuration
     * @param {Array<string>} config.dependencies - Component dependencies
     * @param {Function} config.healthCheck - Health check function
     * @param {number} config.priority - Initialization priority (lower = higher priority)
     */
    register(name, component, config = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error('Component name must be a non-empty string');
        }

        if (!component) {
            throw new Error('Component instance is required');
        }

        // Validate component interface
        this.validateComponent(component);

        // Register component with metadata
        const componentMetadata = {
            instance: component,
            config: { ...config },
            status: 'registered',
            dependencies: config.dependencies || [],
            healthCheck: config.healthCheck || null,
            priority: config.priority || 100,
            registeredAt: new Date(),
            initializedAt: null,
            error: null
        };

        this.components.set(name, componentMetadata);

        // Track dependencies
        if (config.dependencies && config.dependencies.length > 0) {
            this.dependencies.set(name, config.dependencies);
        }

        // Register health check if provided
        if (config.healthCheck && typeof config.healthCheck === 'function') {
            this.healthChecks.set(name, config.healthCheck);
        }

        log('debug', `Component registered: ${name} with ${componentMetadata.dependencies.length} dependencies`);
    }

    /**
     * Get a component instance by name
     * @param {string} name - Component name
     * @returns {Object|null} Component instance or null if not found
     */
    get(name) {
        const component = this.components.get(name);
        return component ? component.instance : null;
    }

    /**
     * Get component metadata
     * @param {string} name - Component name
     * @returns {Object|null} Component metadata or null if not found
     */
    getMetadata(name) {
        return this.components.get(name) || null;
    }

    /**
     * Get all registered component names
     * @returns {Array<string>} Array of component names
     */
    getComponentNames() {
        return Array.from(this.components.keys());
    }

    /**
     * Get components by status
     * @param {string} status - Component status
     * @returns {Array<Object>} Array of components with the specified status
     */
    getComponentsByStatus(status) {
        const result = [];
        for (const [name, metadata] of this.components) {
            if (metadata.status === status) {
                result.push({ name, ...metadata });
            }
        }
        return result;
    }

    /**
     * Check if a component is registered
     * @param {string} name - Component name
     * @returns {boolean} True if component is registered
     */
    has(name) {
        return this.components.has(name);
    }

    /**
     * Unregister a component
     * @param {string} name - Component name
     * @returns {boolean} True if component was unregistered
     */
    unregister(name) {
        const removed = this.components.delete(name);
        if (removed) {
            this.dependencies.delete(name);
            this.healthChecks.delete(name);
            log('debug', `Component unregistered: ${name}`);
        }
        return removed;
    }

    /**
     * Validate component interface
     * @param {Object} component - Component to validate
     * @throws {Error} If component doesn't implement required interface
     */
    validateComponent(component) {
        if (!component || typeof component !== 'object') {
            throw new Error('Component must be an object');
        }

        // Check for required initialize method
        if (!component.initialize || typeof component.initialize !== 'function') {
            throw new Error('Component must implement initialize() method');
        }

        // Check for optional shutdown method
        if (component.shutdown && typeof component.shutdown !== 'function') {
            throw new Error('Component shutdown must be a function if provided');
        }

        // Check for optional getHealth method
        if (component.getHealth && typeof component.getHealth !== 'function') {
            throw new Error('Component getHealth must be a function if provided');
        }
    }

    /**
     * Resolve component dependencies using topological sort
     * @returns {Array<string>} Array of component names in dependency order
     * @throws {Error} If circular dependencies are detected
     */
    topologicalSort() {
        const visited = new Set();
        const visiting = new Set();
        const result = [];

        const visit = (name) => {
            if (visiting.has(name)) {
                throw new Error(`Circular dependency detected involving component: ${name}`);
            }

            if (visited.has(name)) {
                return;
            }

            visiting.add(name);

            // Visit dependencies first
            const deps = this.dependencies.get(name) || [];
            for (const dep of deps) {
                if (!this.components.has(dep)) {
                    throw new Error(`Component '${name}' depends on unregistered component '${dep}'`);
                }
                visit(dep);
            }

            visiting.delete(name);
            visited.add(name);
            result.push(name);
        };

        // Sort components by priority first, then by name for deterministic ordering
        const componentNames = Array.from(this.components.keys()).sort((a, b) => {
            const priorityA = this.components.get(a).priority;
            const priorityB = this.components.get(b).priority;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            return a.localeCompare(b);
        });

        for (const name of componentNames) {
            visit(name);
        }

        return result;
    }

    /**
     * Update component status
     * @param {string} name - Component name
     * @param {string} status - New status
     * @param {Error} error - Error if status is 'failed'
     */
    updateStatus(name, status, error = null) {
        const component = this.components.get(name);
        if (component) {
            component.status = status;
            component.error = error;
            
            if (status === 'initialized') {
                component.initializedAt = new Date();
            }

            log('debug', `Component ${name} status updated to: ${status}`);
        }
    }

    /**
     * Run health checks for all components
     * @returns {Promise<Object>} Health check results
     */
    async runHealthChecks() {
        const results = {};
        const healthCheckPromises = [];

        for (const [name, healthCheck] of this.healthChecks) {
            const component = this.components.get(name);
            if (component && component.status === 'initialized') {
                healthCheckPromises.push(
                    this._runSingleHealthCheck(name, healthCheck)
                        .then(result => ({ name, result }))
                        .catch(error => ({ name, result: { status: 'unhealthy', error: error.message } }))
                );
            } else {
                results[name] = { status: 'not_initialized' };
            }
        }

        const healthCheckResults = await Promise.all(healthCheckPromises);
        for (const { name, result } of healthCheckResults) {
            results[name] = result;
        }

        return results;
    }

    /**
     * Run health check for a single component
     * @param {string} name - Component name
     * @param {Function} healthCheck - Health check function
     * @returns {Promise<Object>} Health check result
     * @private
     */
    async _runSingleHealthCheck(name, healthCheck) {
        try {
            const result = await Promise.race([
                healthCheck(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), 5000)
                )
            ]);
            
            return result || { status: 'healthy' };
        } catch (error) {
            log('warning', `Health check failed for component ${name}: ${error.message}`);
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Get registry statistics
     * @returns {Object} Registry statistics
     */
    getStatistics() {
        const statusCounts = {};
        let totalDependencies = 0;

        for (const [name, metadata] of this.components) {
            statusCounts[metadata.status] = (statusCounts[metadata.status] || 0) + 1;
            totalDependencies += metadata.dependencies.length;
        }

        return {
            total_components: this.components.size,
            status_counts: statusCounts,
            total_dependencies: totalDependencies,
            health_checks_registered: this.healthChecks.size,
            is_initialized: this.isInitialized
        };
    }

    /**
     * Get detailed component information
     * @returns {Array<Object>} Detailed component information
     */
    getDetailedInfo() {
        const components = [];
        
        for (const [name, metadata] of this.components) {
            components.push({
                name,
                status: metadata.status,
                dependencies: metadata.dependencies,
                priority: metadata.priority,
                has_health_check: this.healthChecks.has(name),
                registered_at: metadata.registeredAt,
                initialized_at: metadata.initializedAt,
                error: metadata.error?.message || null
            });
        }

        return components.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Clear all registered components
     */
    clear() {
        this.components.clear();
        this.dependencies.clear();
        this.healthChecks.clear();
        log('debug', 'Component registry cleared');
    }

    /**
     * Shutdown the registry
     */
    async shutdown() {
        log('debug', 'Shutting down component registry...');
        this.clear();
        this.isInitialized = false;
        log('debug', 'Component registry shutdown complete');
    }
}

export default ComponentRegistry;
