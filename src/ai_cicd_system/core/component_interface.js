/**
 * @fileoverview Component Interface
 * @description Standardized component interface for the AI CI/CD system
 */

/**
 * Base Component Interface
 * All system components should implement this interface
 */
export class ComponentInterface {
    constructor(config = {}) {
        this.config = config;
        this.isInitialized = false;
        this.name = this.constructor.name;
        this.version = '1.0.0';
        this.dependencies = [];
    }

    /**
     * Initialize the component
     * This method must be implemented by all components
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error(`Component ${this.name} must implement initialize() method`);
    }

    /**
     * Shutdown the component
     * This method should be implemented by components that need cleanup
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.isInitialized = false;
    }

    /**
     * Get component health status
     * This method should be implemented by components that support health checks
     * @returns {Promise<Object>} Health status object
     */
    async getHealth() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            name: this.name,
            version: this.version,
            initialized: this.isInitialized
        };
    }

    /**
     * Get component configuration
     * @returns {Object} Component configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get component metadata
     * @returns {Object} Component metadata
     */
    getMetadata() {
        return {
            name: this.name,
            version: this.version,
            dependencies: this.dependencies,
            initialized: this.isInitialized,
            config: this.getConfig()
        };
    }

    /**
     * Validate component configuration
     * This method can be overridden by components to validate their specific config
     * @param {Object} config - Configuration to validate
     * @returns {boolean} True if configuration is valid
     * @throws {Error} If configuration is invalid
     */
    validateConfig(config) {
        if (config && typeof config !== 'object') {
            throw new Error(`Invalid configuration for component ${this.name}: must be an object`);
        }
        return true;
    }

    /**
     * Update component configuration
     * @param {Object} newConfig - New configuration
     * @returns {void}
     */
    updateConfig(newConfig) {
        this.validateConfig(newConfig);
        this.config = { ...this.config, ...newConfig };
    }
}

/**
 * Service Component Interface
 * For components that provide services to other components
 */
export class ServiceComponentInterface extends ComponentInterface {
    constructor(config = {}) {
        super(config);
        this.serviceType = 'service';
        this.endpoints = new Map();
    }

    /**
     * Register a service endpoint
     * @param {string} name - Endpoint name
     * @param {Function} handler - Endpoint handler function
     * @param {Object} options - Endpoint options
     */
    registerEndpoint(name, handler, options = {}) {
        if (typeof handler !== 'function') {
            throw new Error(`Endpoint handler for ${name} must be a function`);
        }

        this.endpoints.set(name, {
            handler,
            options,
            registeredAt: new Date()
        });
    }

    /**
     * Call a service endpoint
     * @param {string} name - Endpoint name
     * @param {...any} args - Arguments to pass to the endpoint
     * @returns {Promise<any>} Endpoint result
     */
    async callEndpoint(name, ...args) {
        const endpoint = this.endpoints.get(name);
        if (!endpoint) {
            throw new Error(`Endpoint ${name} not found in service ${this.name}`);
        }

        try {
            return await endpoint.handler(...args);
        } catch (error) {
            throw new Error(`Endpoint ${name} in service ${this.name} failed: ${error.message}`);
        }
    }

    /**
     * Get available endpoints
     * @returns {Array<string>} Array of endpoint names
     */
    getEndpoints() {
        return Array.from(this.endpoints.keys());
    }

    /**
     * Get service metadata including endpoints
     * @returns {Object} Service metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            service_type: this.serviceType,
            endpoints: this.getEndpoints()
        };
    }
}

/**
 * Monitor Component Interface
 * For components that monitor system state or performance
 */
export class MonitorComponentInterface extends ComponentInterface {
    constructor(config = {}) {
        super(config);
        this.monitorType = 'monitor';
        this.metrics = new Map();
        this.alerts = [];
    }

    /**
     * Start monitoring
     * @returns {Promise<void>}
     */
    async startMonitoring() {
        throw new Error(`Monitor component ${this.name} must implement startMonitoring() method`);
    }

    /**
     * Stop monitoring
     * @returns {Promise<void>}
     */
    async stopMonitoring() {
        // Default implementation - can be overridden
    }

    /**
     * Record a metric
     * @param {string} name - Metric name
     * @param {any} value - Metric value
     * @param {Object} metadata - Additional metadata
     */
    recordMetric(name, value, metadata = {}) {
        this.metrics.set(name, {
            value,
            metadata,
            timestamp: new Date()
        });
    }

    /**
     * Get metric value
     * @param {string} name - Metric name
     * @returns {any} Metric value or undefined if not found
     */
    getMetric(name) {
        const metric = this.metrics.get(name);
        return metric ? metric.value : undefined;
    }

    /**
     * Get all metrics
     * @returns {Object} All metrics
     */
    getAllMetrics() {
        const result = {};
        for (const [name, metric] of this.metrics) {
            result[name] = metric;
        }
        return result;
    }

    /**
     * Add an alert
     * @param {string} level - Alert level (info, warning, error, critical)
     * @param {string} message - Alert message
     * @param {Object} metadata - Additional metadata
     */
    addAlert(level, message, metadata = {}) {
        this.alerts.push({
            level,
            message,
            metadata,
            timestamp: new Date()
        });

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }
    }

    /**
     * Get recent alerts
     * @param {number} limit - Maximum number of alerts to return
     * @returns {Array<Object>} Recent alerts
     */
    getRecentAlerts(limit = 10) {
        return this.alerts.slice(-limit);
    }

    /**
     * Get monitor metadata including metrics and alerts
     * @returns {Object} Monitor metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            monitor_type: this.monitorType,
            metrics_count: this.metrics.size,
            alerts_count: this.alerts.length,
            recent_alerts: this.getRecentAlerts(5)
        };
    }
}

/**
 * Storage Component Interface
 * For components that provide data storage capabilities
 */
export class StorageComponentInterface extends ComponentInterface {
    constructor(config = {}) {
        super(config);
        this.storageType = 'storage';
        this.connectionStatus = 'disconnected';
    }

    /**
     * Connect to storage
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error(`Storage component ${this.name} must implement connect() method`);
    }

    /**
     * Disconnect from storage
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.connectionStatus = 'disconnected';
    }

    /**
     * Store data
     * @param {string} key - Data key
     * @param {any} value - Data value
     * @param {Object} options - Storage options
     * @returns {Promise<void>}
     */
    async store(key, value, options = {}) {
        throw new Error(`Storage component ${this.name} must implement store() method`);
    }

    /**
     * Retrieve data
     * @param {string} key - Data key
     * @param {Object} options - Retrieval options
     * @returns {Promise<any>} Retrieved data
     */
    async retrieve(key, options = {}) {
        throw new Error(`Storage component ${this.name} must implement retrieve() method`);
    }

    /**
     * Delete data
     * @param {string} key - Data key
     * @param {Object} options - Deletion options
     * @returns {Promise<boolean>} True if data was deleted
     */
    async delete(key, options = {}) {
        throw new Error(`Storage component ${this.name} must implement delete() method`);
    }

    /**
     * Check if storage is connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.connectionStatus === 'connected';
    }

    /**
     * Get storage health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const baseHealth = await super.getHealth();
        return {
            ...baseHealth,
            connection_status: this.connectionStatus,
            is_connected: this.isConnected()
        };
    }

    /**
     * Get storage metadata
     * @returns {Object} Storage metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            storage_type: this.storageType,
            connection_status: this.connectionStatus,
            is_connected: this.isConnected()
        };
    }
}

/**
 * Processor Component Interface
 * For components that process data or tasks
 */
export class ProcessorComponentInterface extends ComponentInterface {
    constructor(config = {}) {
        super(config);
        this.processorType = 'processor';
        this.processingQueue = [];
        this.isProcessing = false;
        this.processedCount = 0;
        this.errorCount = 0;
    }

    /**
     * Process an item
     * @param {any} item - Item to process
     * @param {Object} options - Processing options
     * @returns {Promise<any>} Processing result
     */
    async process(item, options = {}) {
        throw new Error(`Processor component ${this.name} must implement process() method`);
    }

    /**
     * Add item to processing queue
     * @param {any} item - Item to queue
     * @param {Object} options - Queue options
     */
    queueItem(item, options = {}) {
        this.processingQueue.push({
            item,
            options,
            queuedAt: new Date()
        });
    }

    /**
     * Start processing queue
     * @returns {Promise<void>}
     */
    async startProcessing() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        
        while (this.processingQueue.length > 0 && this.isProcessing) {
            const queuedItem = this.processingQueue.shift();
            
            try {
                await this.process(queuedItem.item, queuedItem.options);
                this.processedCount++;
            } catch (error) {
                this.errorCount++;
                // Log error but continue processing
                console.error(`Processing error in ${this.name}:`, error);
            }
        }
        
        this.isProcessing = false;
    }

    /**
     * Stop processing queue
     */
    stopProcessing() {
        this.isProcessing = false;
    }

    /**
     * Get processing statistics
     * @returns {Object} Processing statistics
     */
    getProcessingStats() {
        return {
            queue_length: this.processingQueue.length,
            is_processing: this.isProcessing,
            processed_count: this.processedCount,
            error_count: this.errorCount,
            success_rate: this.processedCount > 0 ? 
                ((this.processedCount - this.errorCount) / this.processedCount) * 100 : 0
        };
    }

    /**
     * Get processor metadata
     * @returns {Object} Processor metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            processor_type: this.processorType,
            processing_stats: this.getProcessingStats()
        };
    }

    /**
     * Shutdown processor
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.stopProcessing();
        await super.shutdown();
    }
}

/**
 * Component factory for creating components with proper interfaces
 */
export class ComponentFactory {
    /**
     * Create a component with the appropriate interface
     * @param {string} type - Component type
     * @param {string} name - Component name
     * @param {Object} config - Component configuration
     * @returns {ComponentInterface} Component instance
     */
    static createComponent(type, name, config = {}) {
        const componentClasses = {
            'service': ServiceComponentInterface,
            'monitor': MonitorComponentInterface,
            'storage': StorageComponentInterface,
            'processor': ProcessorComponentInterface,
            'base': ComponentInterface
        };

        const ComponentClass = componentClasses[type] || ComponentInterface;
        const component = new ComponentClass(config);
        component.name = name;
        
        return component;
    }

    /**
     * Validate component interface compliance
     * @param {Object} component - Component to validate
     * @param {string} expectedType - Expected component type
     * @returns {boolean} True if component is compliant
     * @throws {Error} If component is not compliant
     */
    static validateComponentInterface(component, expectedType = 'base') {
        if (!component || typeof component !== 'object') {
            throw new Error('Component must be an object');
        }

        // Check for required methods
        const requiredMethods = ['initialize', 'getHealth', 'getMetadata'];
        for (const method of requiredMethods) {
            if (typeof component[method] !== 'function') {
                throw new Error(`Component must implement ${method}() method`);
            }
        }

        // Type-specific validation
        if (expectedType === 'service' && typeof component.callEndpoint !== 'function') {
            throw new Error('Service component must implement callEndpoint() method');
        }

        if (expectedType === 'monitor' && typeof component.startMonitoring !== 'function') {
            throw new Error('Monitor component must implement startMonitoring() method');
        }

        if (expectedType === 'storage' && typeof component.connect !== 'function') {
            throw new Error('Storage component must implement connect() method');
        }

        if (expectedType === 'processor' && typeof component.process !== 'function') {
            throw new Error('Processor component must implement process() method');
        }

        return true;
    }
}

export default {
    ComponentInterface,
    ServiceComponentInterface,
    MonitorComponentInterface,
    StorageComponentInterface,
    ProcessorComponentInterface,
    ComponentFactory
};

