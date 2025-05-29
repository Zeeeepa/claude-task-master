/**
 * @fileoverview Service Discovery and Registration
 * @description Automatic component registration and discovery system
 */

import EventEmitter from 'events';

/**
 * Service Registry for component discovery and registration
 */
export class ServiceRegistry extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            storage: 'memory', // memory, consul, etcd
            consulUrl: process.env.CONSUL_URL || 'http://localhost:8500',
            etcdUrl: process.env.ETCD_URL || 'http://localhost:2379',
            heartbeatInterval: 30000, // 30 seconds
            serviceTimeout: 90000, // 90 seconds
            ...config
        };

        this.services = new Map();
        this.serviceTypes = new Map();
        this.dependencies = new Map();
        this.heartbeats = new Map();
        this.isInitialized = false;
        this.heartbeatTimer = null;
    }

    /**
     * Initialize the service registry
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🔍 Initializing Service Registry...');

            // Initialize storage backend
            await this._initializeStorage();

            // Start heartbeat monitoring
            this._startHeartbeatMonitoring();

            this.isInitialized = true;
            this.emit('initialized');

            console.log('✅ Service Registry initialized successfully');

        } catch (error) {
            console.error('❌ Service Registry initialization failed:', error);
            throw error;
        }
    }

    /**
     * Register a service
     * @param {Object} serviceInfo - Service information
     * @returns {Object} Registration result
     */
    async register(serviceInfo) {
        if (!this.isInitialized) {
            throw new Error('Service registry not initialized');
        }

        const {
            id,
            name,
            type,
            version,
            endpoints = {},
            dependencies = [],
            metadata = {},
            healthCheck
        } = serviceInfo;

        if (!id || !name || !type) {
            throw new Error('Service must have id, name, and type');
        }

        if (this.services.has(id)) {
            throw new Error(`Service ${id} already registered`);
        }

        const service = {
            id,
            name,
            type,
            version: version || '1.0.0',
            endpoints,
            dependencies,
            metadata: {
                ...metadata,
                registeredAt: new Date().toISOString(),
                lastHeartbeat: new Date().toISOString()
            },
            healthCheck,
            status: 'healthy',
            registeredAt: Date.now()
        };

        try {
            // Store service
            this.services.set(id, service);

            // Index by type
            if (!this.serviceTypes.has(type)) {
                this.serviceTypes.set(type, new Set());
            }
            this.serviceTypes.get(type).add(id);

            // Store dependencies
            if (dependencies.length > 0) {
                this.dependencies.set(id, new Set(dependencies));
            }

            // Initialize heartbeat
            this.heartbeats.set(id, {
                lastHeartbeat: Date.now(),
                interval: this.config.heartbeatInterval,
                timeout: this.config.serviceTimeout
            });

            // Persist to storage backend
            await this._persistService(service);

            // Emit registration event
            this.emit('service.registered', {
                serviceId: id,
                name,
                type,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Service ${name} (${id}) registered successfully`);

            return {
                serviceId: id,
                registeredAt: service.registeredAt,
                status: 'registered'
            };

        } catch (error) {
            // Cleanup on failure
            this.services.delete(id);
            this.heartbeats.delete(id);
            
            if (this.serviceTypes.has(type)) {
                this.serviceTypes.get(type).delete(id);
            }
            
            this.dependencies.delete(id);

            console.error(`❌ Failed to register service ${name}:`, error);
            throw error;
        }
    }

    /**
     * Unregister a service
     * @param {string} serviceId - Service ID
     */
    async unregister(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new Error(`Service ${serviceId} not found`);
        }

        try {
            // Remove from storage
            this.services.delete(serviceId);
            this.heartbeats.delete(serviceId);
            this.dependencies.delete(serviceId);

            // Remove from type index
            if (this.serviceTypes.has(service.type)) {
                this.serviceTypes.get(service.type).delete(serviceId);
                if (this.serviceTypes.get(service.type).size === 0) {
                    this.serviceTypes.delete(service.type);
                }
            }

            // Remove from storage backend
            await this._removeService(serviceId);

            // Emit unregistration event
            this.emit('service.unregistered', {
                serviceId,
                name: service.name,
                type: service.type,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Service ${service.name} (${serviceId}) unregistered successfully`);

        } catch (error) {
            console.error(`❌ Failed to unregister service ${serviceId}:`, error);
            throw error;
        }
    }

    /**
     * Discover a service by ID or type
     * @param {string} query - Service ID or type
     * @returns {Object|Array} Service information
     */
    async discover(query) {
        if (!this.isInitialized) {
            throw new Error('Service registry not initialized');
        }

        // Try to find by ID first
        const serviceById = this.services.get(query);
        if (serviceById) {
            return this._sanitizeService(serviceById);
        }

        // Try to find by type
        const servicesByType = this.serviceTypes.get(query);
        if (servicesByType && servicesByType.size > 0) {
            const services = Array.from(servicesByType)
                .map(id => this.services.get(id))
                .filter(service => service && service.status === 'healthy')
                .map(service => this._sanitizeService(service));

            return services.length === 1 ? services[0] : services;
        }

        return null;
    }

    /**
     * Get all registered services
     * @param {Object} filters - Optional filters
     * @returns {Array} List of services
     */
    async getAll(filters = {}) {
        const { type, status, dependency } = filters;
        
        let services = Array.from(this.services.values());

        // Apply filters
        if (type) {
            services = services.filter(service => service.type === type);
        }

        if (status) {
            services = services.filter(service => service.status === status);
        }

        if (dependency) {
            services = services.filter(service => 
                service.dependencies.includes(dependency)
            );
        }

        return services.map(service => this._sanitizeService(service));
    }

    /**
     * Get services by type
     * @param {string} type - Service type
     * @returns {Array} List of services
     */
    async getByType(type) {
        const serviceIds = this.serviceTypes.get(type);
        if (!serviceIds) {
            return [];
        }

        return Array.from(serviceIds)
            .map(id => this.services.get(id))
            .filter(service => service && service.status === 'healthy')
            .map(service => this._sanitizeService(service));
    }

    /**
     * Get service dependencies
     * @param {string} serviceId - Service ID
     * @returns {Array} List of dependencies
     */
    async getDependencies(serviceId) {
        const dependencies = this.dependencies.get(serviceId);
        if (!dependencies) {
            return [];
        }

        const dependencyServices = [];
        for (const depId of dependencies) {
            const service = this.services.get(depId);
            if (service) {
                dependencyServices.push(this._sanitizeService(service));
            }
        }

        return dependencyServices;
    }

    /**
     * Update service heartbeat
     * @param {string} serviceId - Service ID
     * @param {Object} healthData - Optional health data
     */
    async heartbeat(serviceId, healthData = {}) {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new Error(`Service ${serviceId} not found`);
        }

        const heartbeatInfo = this.heartbeats.get(serviceId);
        if (heartbeatInfo) {
            heartbeatInfo.lastHeartbeat = Date.now();
        }

        // Update service metadata
        service.metadata.lastHeartbeat = new Date().toISOString();
        if (healthData.status) {
            service.status = healthData.status;
        }

        // Persist update
        await this._persistService(service);

        this.emit('service.heartbeat', {
            serviceId,
            timestamp: new Date().toISOString(),
            healthData
        });
    }

    /**
     * Get registry health
     * @returns {Object} Registry health information
     */
    async getHealth() {
        const totalServices = this.services.size;
        const healthyServices = Array.from(this.services.values())
            .filter(service => service.status === 'healthy').length;
        
        const servicesByType = {};
        for (const [type, serviceIds] of this.serviceTypes) {
            servicesByType[type] = serviceIds.size;
        }

        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            totalServices,
            healthyServices,
            unhealthyServices: totalServices - healthyServices,
            servicesByType,
            storageBackend: this.config.storage,
            lastCheck: new Date().toISOString()
        };
    }

    /**
     * Shutdown the service registry
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        try {
            console.log('🛑 Shutting down Service Registry...');

            // Stop heartbeat monitoring
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            // Unregister all services
            const serviceIds = Array.from(this.services.keys());
            for (const serviceId of serviceIds) {
                await this.unregister(serviceId);
            }

            // Clear storage
            this.services.clear();
            this.serviceTypes.clear();
            this.dependencies.clear();
            this.heartbeats.clear();

            this.isInitialized = false;
            this.emit('shutdown');

            console.log('✅ Service Registry shutdown completed');

        } catch (error) {
            console.error('❌ Error during service registry shutdown:', error);
            throw error;
        }
    }

    // Private methods

    /**
     * Initialize storage backend
     * @private
     */
    async _initializeStorage() {
        switch (this.config.storage) {
            case 'memory':
                // Already initialized with Maps
                break;
            case 'consul':
                // TODO: Initialize Consul client
                console.log('📡 Consul storage backend not yet implemented, using memory');
                break;
            case 'etcd':
                // TODO: Initialize etcd client
                console.log('📡 etcd storage backend not yet implemented, using memory');
                break;
            default:
                throw new Error(`Unsupported storage backend: ${this.config.storage}`);
        }
    }

    /**
     * Persist service to storage backend
     * @param {Object} service - Service information
     * @private
     */
    async _persistService(service) {
        // For memory storage, already persisted in Map
        // For external storage, implement persistence logic
        switch (this.config.storage) {
            case 'memory':
                // Already persisted
                break;
            case 'consul':
                // TODO: Persist to Consul
                break;
            case 'etcd':
                // TODO: Persist to etcd
                break;
        }
    }

    /**
     * Remove service from storage backend
     * @param {string} serviceId - Service ID
     * @private
     */
    async _removeService(serviceId) {
        // For memory storage, already removed from Map
        // For external storage, implement removal logic
        switch (this.config.storage) {
            case 'memory':
                // Already removed
                break;
            case 'consul':
                // TODO: Remove from Consul
                break;
            case 'etcd':
                // TODO: Remove from etcd
                break;
        }
    }

    /**
     * Start heartbeat monitoring
     * @private
     */
    _startHeartbeatMonitoring() {
        this.heartbeatTimer = setInterval(() => {
            this._checkHeartbeats();
        }, this.config.heartbeatInterval);
    }

    /**
     * Check service heartbeats and mark unhealthy services
     * @private
     */
    _checkHeartbeats() {
        const now = Date.now();
        
        for (const [serviceId, heartbeatInfo] of this.heartbeats) {
            const timeSinceLastHeartbeat = now - heartbeatInfo.lastHeartbeat;
            
            if (timeSinceLastHeartbeat > heartbeatInfo.timeout) {
                const service = this.services.get(serviceId);
                if (service && service.status === 'healthy') {
                    service.status = 'unhealthy';
                    
                    this.emit('service.unhealthy', {
                        serviceId,
                        name: service.name,
                        timeSinceLastHeartbeat,
                        timestamp: new Date().toISOString()
                    });

                    console.warn(`⚠️ Service ${service.name} (${serviceId}) marked as unhealthy`);
                }
            }
        }
    }

    /**
     * Sanitize service information for external consumption
     * @param {Object} service - Service object
     * @returns {Object} Sanitized service
     * @private
     */
    _sanitizeService(service) {
        return {
            id: service.id,
            name: service.name,
            type: service.type,
            version: service.version,
            endpoints: service.endpoints,
            dependencies: service.dependencies,
            status: service.status,
            metadata: service.metadata
        };
    }
}

export default ServiceRegistry;

