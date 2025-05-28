/**
 * @fileoverview Core Integration Framework
 * @description Standardized interface for component communication and coordination
 * in the unified AI CI/CD development flow system
 */

import EventEmitter from 'events';
import { ServiceRegistry } from './service-registry.js';
import { HealthMonitor } from './health-monitor.js';
import { ConfigManager } from './config-manager.js';
import { EventBus } from './event-bus.js';

/**
 * Core Integration Framework
 * Provides standardized interface for component communication
 */
export class IntegrationFramework extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            name: 'integration-framework',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            ...config
        };

        // Core integration components
        this.serviceRegistry = new ServiceRegistry(this.config.serviceRegistry);
        this.healthMonitor = new HealthMonitor(this.config.healthMonitor);
        this.configManager = new ConfigManager(this.config.configManager);
        this.eventBus = new EventBus(this.config.eventBus);

        // Component state
        this.isInitialized = false;
        this.registeredComponents = new Map();
        this.componentInstances = new Map();
        this.circuitBreakers = new Map();
        this.rateLimiters = new Map();

        // Metrics
        this.metrics = {
            startTime: Date.now(),
            requestCount: 0,
            errorCount: 0,
            componentCount: 0,
            lastHealthCheck: null
        };

        this._setupEventHandlers();
    }

    /**
     * Initialize the integration framework
     */
    async initialize() {
        if (this.isInitialized) {
            throw new Error('Integration framework already initialized');
        }

        try {
            console.log('🚀 Initializing Integration Framework...');

            // Initialize core components in order
            await this.configManager.initialize();
            await this.serviceRegistry.initialize();
            await this.eventBus.initialize();
            await this.healthMonitor.initialize();

            // Register framework as a service
            await this.serviceRegistry.register({
                id: 'integration-framework',
                name: 'Integration Framework',
                type: 'framework',
                version: this.config.version,
                endpoints: {
                    health: '/health',
                    metrics: '/metrics',
                    status: '/status'
                },
                metadata: {
                    startTime: this.metrics.startTime,
                    environment: this.config.environment
                }
            });

            // Start health monitoring
            await this.healthMonitor.startMonitoring();

            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('✅ Integration Framework initialized successfully');
            
        } catch (error) {
            console.error('❌ Integration Framework initialization failed:', error);
            throw error;
        }
    }

    /**
     * Register a component with the integration framework
     * @param {Object} componentConfig - Component configuration
     * @param {Object} componentInstance - Component instance
     */
    async registerComponent(componentConfig, componentInstance) {
        if (!this.isInitialized) {
            throw new Error('Framework not initialized');
        }

        const {
            id,
            name,
            type,
            version,
            dependencies = [],
            endpoints = {},
            healthCheck,
            metadata = {}
        } = componentConfig;

        if (!id || !name || !type) {
            throw new Error('Component must have id, name, and type');
        }

        if (this.registeredComponents.has(id)) {
            throw new Error(`Component ${id} already registered`);
        }

        try {
            // Register with service registry
            const serviceInfo = await this.serviceRegistry.register({
                id,
                name,
                type,
                version,
                endpoints,
                dependencies,
                metadata: {
                    ...metadata,
                    registeredAt: new Date().toISOString(),
                    framework: 'integration-framework'
                }
            });

            // Store component information
            this.registeredComponents.set(id, {
                ...componentConfig,
                serviceInfo,
                registeredAt: Date.now(),
                status: 'registered'
            });

            this.componentInstances.set(id, componentInstance);

            // Initialize circuit breaker for component
            this._initializeCircuitBreaker(id);

            // Initialize rate limiter for component
            this._initializeRateLimiter(id);

            // Register health check if provided
            if (healthCheck && typeof healthCheck === 'function') {
                await this.healthMonitor.registerHealthCheck(id, healthCheck);
            }

            // Emit registration event
            this.eventBus.emit('component.registered', {
                componentId: id,
                name,
                type,
                timestamp: new Date().toISOString()
            });

            this.metrics.componentCount++;
            
            console.log(`✅ Component ${name} (${id}) registered successfully`);
            
            return serviceInfo;

        } catch (error) {
            console.error(`❌ Failed to register component ${name}:`, error);
            throw error;
        }
    }

    /**
     * Discover and get component information
     * @param {string} componentId - Component ID or type
     * @returns {Object} Component information
     */
    async discoverComponent(componentId) {
        return await this.serviceRegistry.discover(componentId);
    }

    /**
     * Get all registered components
     * @returns {Array} List of registered components
     */
    async getAllComponents() {
        return await this.serviceRegistry.getAll();
    }

    /**
     * Send request to a component with circuit breaker and rate limiting
     * @param {string} componentId - Target component ID
     * @param {string} method - HTTP method
     * @param {string} endpoint - Endpoint path
     * @param {Object} data - Request data
     * @param {Object} options - Request options
     */
    async sendRequest(componentId, method, endpoint, data = null, options = {}) {
        this.metrics.requestCount++;

        try {
            // Check circuit breaker
            if (!this._checkCircuitBreaker(componentId)) {
                throw new Error(`Circuit breaker open for component ${componentId}`);
            }

            // Check rate limit
            if (!this._checkRateLimit(componentId)) {
                throw new Error(`Rate limit exceeded for component ${componentId}`);
            }

            // Get component service info
            const serviceInfo = await this.serviceRegistry.discover(componentId);
            if (!serviceInfo) {
                throw new Error(`Component ${componentId} not found`);
            }

            // Get component instance
            const componentInstance = this.componentInstances.get(componentId);
            if (!componentInstance) {
                throw new Error(`Component instance ${componentId} not available`);
            }

            // Execute request
            let result;
            if (typeof componentInstance[method] === 'function') {
                result = await componentInstance[method](endpoint, data, options);
            } else if (typeof componentInstance.request === 'function') {
                result = await componentInstance.request(method, endpoint, data, options);
            } else {
                throw new Error(`Component ${componentId} does not support method ${method}`);
            }

            // Record success
            this._recordCircuitBreakerSuccess(componentId);

            // Emit request event
            this.eventBus.emit('request.completed', {
                componentId,
                method,
                endpoint,
                success: true,
                timestamp: new Date().toISOString()
            });

            return result;

        } catch (error) {
            this.metrics.errorCount++;
            
            // Record failure
            this._recordCircuitBreakerFailure(componentId);

            // Emit error event
            this.eventBus.emit('request.failed', {
                componentId,
                method,
                endpoint,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            throw error;
        }
    }

    /**
     * Broadcast event to all components
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    async broadcastEvent(eventName, data) {
        return this.eventBus.broadcast(eventName, data);
    }

    /**
     * Subscribe to events
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     */
    subscribe(eventName, handler) {
        return this.eventBus.subscribe(eventName, handler);
    }

    /**
     * Get framework health status
     * @returns {Object} Health status
     */
    async getHealth() {
        const componentHealth = await this.healthMonitor.getOverallHealth();
        
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            framework: {
                initialized: this.isInitialized,
                uptime: Date.now() - this.metrics.startTime,
                componentCount: this.metrics.componentCount,
                requestCount: this.metrics.requestCount,
                errorCount: this.metrics.errorCount,
                errorRate: this.metrics.requestCount > 0 ? 
                    (this.metrics.errorCount / this.metrics.requestCount) : 0
            },
            components: componentHealth,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get framework metrics
     * @returns {Object} Framework metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            errorRate: this.metrics.requestCount > 0 ? 
                (this.metrics.errorCount / this.metrics.requestCount) : 0,
            componentsRegistered: this.registeredComponents.size,
            circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, cb]) => ({
                componentId: id,
                state: cb.state,
                failures: cb.failures,
                lastFailure: cb.lastFailure
            }))
        };
    }

    /**
     * Shutdown the integration framework
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        try {
            console.log('🛑 Shutting down Integration Framework...');

            // Stop health monitoring
            await this.healthMonitor.stopMonitoring();

            // Unregister all components
            for (const [componentId] of this.registeredComponents) {
                await this.serviceRegistry.unregister(componentId);
            }

            // Shutdown core components
            await this.eventBus.shutdown();
            await this.serviceRegistry.shutdown();
            await this.configManager.shutdown();
            await this.healthMonitor.shutdown();

            // Clear state
            this.registeredComponents.clear();
            this.componentInstances.clear();
            this.circuitBreakers.clear();
            this.rateLimiters.clear();

            this.isInitialized = false;
            this.emit('shutdown');

            console.log('✅ Integration Framework shutdown completed');

        } catch (error) {
            console.error('❌ Error during framework shutdown:', error);
            throw error;
        }
    }

    // Private methods

    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        // Handle component health changes
        this.healthMonitor.on('health.changed', (data) => {
            this.eventBus.emit('component.health.changed', data);
        });

        // Handle configuration changes
        this.configManager.on('config.changed', (data) => {
            this.eventBus.emit('config.changed', data);
        });

        // Handle service registry changes
        this.serviceRegistry.on('service.registered', (data) => {
            this.eventBus.emit('service.registered', data);
        });

        this.serviceRegistry.on('service.unregistered', (data) => {
            this.eventBus.emit('service.unregistered', data);
        });
    }

    /**
     * Initialize circuit breaker for component
     * @param {string} componentId - Component ID
     * @private
     */
    _initializeCircuitBreaker(componentId) {
        this.circuitBreakers.set(componentId, {
            state: 'closed', // closed, open, half-open
            failures: 0,
            threshold: 5,
            timeout: 60000, // 1 minute
            lastFailure: null,
            nextAttempt: null
        });
    }

    /**
     * Initialize rate limiter for component
     * @param {string} componentId - Component ID
     * @private
     */
    _initializeRateLimiter(componentId) {
        this.rateLimiters.set(componentId, {
            requests: [],
            limit: 100, // requests per minute
            window: 60000 // 1 minute
        });
    }

    /**
     * Check circuit breaker state
     * @param {string} componentId - Component ID
     * @returns {boolean} Whether request is allowed
     * @private
     */
    _checkCircuitBreaker(componentId) {
        const cb = this.circuitBreakers.get(componentId);
        if (!cb) return true;

        const now = Date.now();

        if (cb.state === 'open') {
            if (now >= cb.nextAttempt) {
                cb.state = 'half-open';
                return true;
            }
            return false;
        }

        return true;
    }

    /**
     * Check rate limit
     * @param {string} componentId - Component ID
     * @returns {boolean} Whether request is allowed
     * @private
     */
    _checkRateLimit(componentId) {
        const rl = this.rateLimiters.get(componentId);
        if (!rl) return true;

        const now = Date.now();
        const windowStart = now - rl.window;

        // Remove old requests
        rl.requests = rl.requests.filter(time => time > windowStart);

        // Check if under limit
        if (rl.requests.length >= rl.limit) {
            return false;
        }

        // Add current request
        rl.requests.push(now);
        return true;
    }

    /**
     * Record circuit breaker success
     * @param {string} componentId - Component ID
     * @private
     */
    _recordCircuitBreakerSuccess(componentId) {
        const cb = this.circuitBreakers.get(componentId);
        if (!cb) return;

        if (cb.state === 'half-open') {
            cb.state = 'closed';
            cb.failures = 0;
        }
    }

    /**
     * Record circuit breaker failure
     * @param {string} componentId - Component ID
     * @private
     */
    _recordCircuitBreakerFailure(componentId) {
        const cb = this.circuitBreakers.get(componentId);
        if (!cb) return;

        cb.failures++;
        cb.lastFailure = Date.now();

        if (cb.failures >= cb.threshold) {
            cb.state = 'open';
            cb.nextAttempt = Date.now() + cb.timeout;
        }
    }
}

export default IntegrationFramework;

