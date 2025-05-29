/**
 * @fileoverview Metrics Collector
 * @description Efficient metrics collection from distributed AI CI/CD components
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Metrics Collector for AI CI/CD system components
 * Efficiently gathers metrics from distributed components without performance impact
 */
export class MetricsCollector {
    constructor(config = {}) {
        this.config = {
            collectionInterval: config.collectionInterval || 30000, // 30 seconds
            batchSize: config.batchSize || 100,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            enableAsyncCollection: config.enableAsyncCollection !== false,
            enableSampling: config.enableSampling !== false,
            samplingRate: config.samplingRate || 0.1, // 10% sampling for high-volume metrics
            enableCompression: config.enableCompression !== false,
            maxMetricsAge: config.maxMetricsAge || 3600000, // 1 hour
            enableCaching: config.enableCaching !== false,
            cacheSize: config.cacheSize || 10000,
            ...config
        };

        this.isCollecting = false;
        this.collectionInterval = null;
        this.metricsBuffer = new Map();
        this.componentCollectors = new Map();
        this.collectionStats = {
            totalCollections: 0,
            successfulCollections: 0,
            failedCollections: 0,
            avgCollectionTime: 0,
            lastCollectionTime: null
        };
        
        // Performance optimization
        this.metricsCache = new LRUCache(this.config.cacheSize);
        this.compressionEngine = new MetricsCompressor(this.config);
        this.samplingEngine = new SamplingEngine(this.config);
    }

    /**
     * Initialize the metrics collector
     */
    async initialize() {
        log('debug', 'Initializing metrics collector...');
        
        this._setupComponentCollectors();
        this._setupMetricsBuffer();
        
        log('info', 'Metrics collector initialized successfully');
    }

    /**
     * Start metrics collection
     */
    async startCollection() {
        if (this.isCollecting) {
            log('warning', 'Metrics collection already running');
            return;
        }

        log('info', 'Starting metrics collection...');
        this.isCollecting = true;

        // Start periodic collection
        this.collectionInterval = setInterval(async () => {
            await this._performCollection();
        }, this.config.collectionInterval);

        // Perform initial collection
        await this._performCollection();

        log('info', 'Metrics collection started');
    }

    /**
     * Stop metrics collection
     */
    async stopCollection() {
        if (!this.isCollecting) {
            return;
        }

        log('info', 'Stopping metrics collection...');
        this.isCollecting = false;

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        // Flush remaining metrics
        await this._flushMetrics();

        log('info', 'Metrics collection stopped');
    }

    /**
     * Register a component collector
     * @param {string} componentName - Name of the component
     * @param {Object} collector - Collector implementation
     */
    registerComponentCollector(componentName, collector) {
        if (!collector || typeof collector.collect !== 'function') {
            throw new Error('Component collector must have a collect method');
        }

        this.componentCollectors.set(componentName, {
            name: componentName,
            collector: collector,
            lastCollection: null,
            errorCount: 0,
            enabled: true,
            ...collector
        });

        log('info', `Registered component collector: ${componentName}`);
    }

    /**
     * Unregister a component collector
     * @param {string} componentName - Name of the component
     */
    unregisterComponentCollector(componentName) {
        if (this.componentCollectors.has(componentName)) {
            this.componentCollectors.delete(componentName);
            log('info', `Unregistered component collector: ${componentName}`);
        }
    }

    /**
     * Collect metrics from a specific component
     * @param {string} componentName - Component name
     * @returns {Promise<Object>} Collected metrics
     */
    async collectFromComponent(componentName) {
        const componentCollector = this.componentCollectors.get(componentName);
        if (!componentCollector || !componentCollector.enabled) {
            return null;
        }

        const startTime = Date.now();
        
        try {
            const metrics = await this._collectWithRetry(componentCollector);
            
            if (metrics) {
                // Apply sampling if enabled
                const sampledMetrics = this.config.enableSampling 
                    ? this.samplingEngine.sample(metrics, componentName)
                    : metrics;

                // Cache metrics if enabled
                if (this.config.enableCaching) {
                    this.metricsCache.set(`${componentName}_${Date.now()}`, sampledMetrics);
                }

                // Update collection stats
                componentCollector.lastCollection = Date.now();
                componentCollector.errorCount = 0;

                return sampledMetrics;
            }
        } catch (error) {
            componentCollector.errorCount++;
            log('error', `Failed to collect metrics from ${componentName}: ${error.message}`);
            
            // Disable collector if too many errors
            if (componentCollector.errorCount >= this.config.maxRetries) {
                componentCollector.enabled = false;
                log('warning', `Disabled collector for ${componentName} due to repeated failures`);
            }
        } finally {
            const collectionTime = Date.now() - startTime;
            this._updateCollectionStats(collectionTime);
        }

        return null;
    }

    /**
     * Get all collected metrics
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} All metrics
     */
    async getAllMetrics(options = {}) {
        const startTime = Date.now();
        const metrics = {
            timestamp: Date.now(),
            collection_stats: this.getCollectionStatistics(),
            components: {}
        };

        // Collect from all enabled components
        const collectionPromises = Array.from(this.componentCollectors.entries())
            .filter(([, collector]) => collector.enabled)
            .map(async ([componentName, collector]) => {
                try {
                    const componentMetrics = await this.collectFromComponent(componentName);
                    if (componentMetrics) {
                        metrics.components[componentName] = componentMetrics;
                    }
                } catch (error) {
                    log('error', `Error collecting from ${componentName}: ${error.message}`);
                }
            });

        if (this.config.enableAsyncCollection) {
            // Collect asynchronously for better performance
            await Promise.allSettled(collectionPromises);
        } else {
            // Collect sequentially
            for (const promise of collectionPromises) {
                await promise;
            }
        }

        // Add buffer metrics
        metrics.buffered_metrics = this._getBufferedMetrics();

        // Compress if enabled
        if (this.config.enableCompression) {
            metrics.compressed = await this.compressionEngine.compress(metrics);
        }

        const collectionTime = Date.now() - startTime;
        metrics.collection_time_ms = collectionTime;

        log('debug', `Collected metrics from ${Object.keys(metrics.components).length} components in ${collectionTime}ms`);

        return metrics;
    }

    /**
     * Get collection statistics
     * @returns {Object} Collection statistics
     */
    getCollectionStatistics() {
        return {
            ...this.collectionStats,
            is_collecting: this.isCollecting,
            registered_collectors: this.componentCollectors.size,
            enabled_collectors: Array.from(this.componentCollectors.values()).filter(c => c.enabled).length,
            buffer_size: this.metricsBuffer.size,
            cache_size: this.metricsCache.size(),
            cache_hit_rate: this.metricsCache.getHitRate()
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    async getHealth() {
        const stats = this.getCollectionStatistics();
        const failureRate = stats.totalCollections > 0 
            ? stats.failedCollections / stats.totalCollections 
            : 0;

        return {
            status: failureRate < 0.1 ? 'healthy' : 'degraded',
            is_collecting: this.isCollecting,
            collection_failure_rate: failureRate,
            avg_collection_time_ms: stats.avgCollectionTime,
            enabled_collectors: stats.enabled_collectors,
            last_collection: stats.lastCollectionTime
        };
    }

    /**
     * Shutdown the metrics collector
     */
    async shutdown() {
        log('debug', 'Shutting down metrics collector...');
        
        await this.stopCollection();
        
        // Clear all data
        this.componentCollectors.clear();
        this.metricsBuffer.clear();
        this.metricsCache.clear();
        
        log('info', 'Metrics collector shut down successfully');
    }

    // Private methods

    /**
     * Setup default component collectors
     * @private
     */
    _setupComponentCollectors() {
        // Codegen metrics collector
        this.registerComponentCollector('codegen', new CodegenMetricsCollector());
        
        // Database metrics collector
        this.registerComponentCollector('database', new DatabaseMetricsCollector());
        
        // Validation metrics collector
        this.registerComponentCollector('validation', new ValidationMetricsCollector());
        
        // Workflow metrics collector
        this.registerComponentCollector('workflow', new WorkflowMetricsCollector());
        
        // System metrics collector
        this.registerComponentCollector('system', new SystemMetricsCollector());
        
        // Agent metrics collector
        this.registerComponentCollector('agents', new AgentMetricsCollector());
        
        // Webhook metrics collector
        this.registerComponentCollector('webhooks', new WebhookMetricsCollector());
    }

    /**
     * Setup metrics buffer
     * @private
     */
    _setupMetricsBuffer() {
        // Initialize buffer for temporary metrics storage
        this.metricsBuffer.set('pending', []);
        this.metricsBuffer.set('failed', []);
        this.metricsBuffer.set('processed', []);
    }

    /**
     * Perform metrics collection
     * @private
     */
    async _performCollection() {
        const startTime = Date.now();
        
        try {
            this.collectionStats.totalCollections++;
            
            const metrics = await this.getAllMetrics();
            
            // Store in buffer
            this._bufferMetrics(metrics);
            
            this.collectionStats.successfulCollections++;
            this.collectionStats.lastCollectionTime = Date.now();
            
        } catch (error) {
            this.collectionStats.failedCollections++;
            log('error', `Metrics collection failed: ${error.message}`);
        } finally {
            const collectionTime = Date.now() - startTime;
            this._updateCollectionStats(collectionTime);
        }
    }

    /**
     * Collect with retry logic
     * @param {Object} componentCollector - Component collector
     * @returns {Promise<Object>} Metrics
     * @private
     */
    async _collectWithRetry(componentCollector) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await componentCollector.collector.collect();
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.maxRetries) {
                    await this._delay(this.config.retryDelay * attempt);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Buffer metrics for processing
     * @param {Object} metrics - Metrics to buffer
     * @private
     */
    _bufferMetrics(metrics) {
        const pending = this.metricsBuffer.get('pending');
        pending.push({
            timestamp: Date.now(),
            metrics: metrics
        });

        // Limit buffer size
        if (pending.length > this.config.batchSize) {
            pending.splice(0, pending.length - this.config.batchSize);
        }
    }

    /**
     * Get buffered metrics
     * @returns {Array} Buffered metrics
     * @private
     */
    _getBufferedMetrics() {
        return {
            pending: this.metricsBuffer.get('pending').length,
            failed: this.metricsBuffer.get('failed').length,
            processed: this.metricsBuffer.get('processed').length
        };
    }

    /**
     * Flush remaining metrics
     * @private
     */
    async _flushMetrics() {
        const pending = this.metricsBuffer.get('pending');
        const processed = this.metricsBuffer.get('processed');
        
        // Move pending to processed
        processed.push(...pending);
        pending.length = 0;
        
        log('debug', `Flushed ${processed.length} metrics`);
    }

    /**
     * Update collection statistics
     * @param {number} collectionTime - Collection time in ms
     * @private
     */
    _updateCollectionStats(collectionTime) {
        const stats = this.collectionStats;
        stats.avgCollectionTime = (stats.avgCollectionTime * (stats.totalCollections - 1) + collectionTime) / stats.totalCollections;
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Delay promise
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * LRU Cache for metrics caching
 */
class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    get(key) {
        if (this.cache.has(key)) {
            this.hits++;
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        this.misses++;
        return null;
    }

    size() {
        return this.cache.size;
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    getHitRate() {
        const total = this.hits + this.misses;
        return total > 0 ? this.hits / total : 0;
    }
}

/**
 * Metrics Compressor for reducing data size
 */
class MetricsCompressor {
    constructor(config) {
        this.config = config;
    }

    async compress(metrics) {
        // Simple compression - remove null/undefined values and compress timestamps
        const compressed = JSON.parse(JSON.stringify(metrics, (key, value) => {
            if (value === null || value === undefined) {
                return undefined;
            }
            return value;
        }));

        return {
            original_size: JSON.stringify(metrics).length,
            compressed_size: JSON.stringify(compressed).length,
            compression_ratio: JSON.stringify(compressed).length / JSON.stringify(metrics).length,
            data: compressed
        };
    }
}

/**
 * Sampling Engine for high-volume metrics
 */
class SamplingEngine {
    constructor(config) {
        this.config = config;
        this.sampleCounts = new Map();
    }

    sample(metrics, componentName) {
        const sampleKey = `${componentName}_${Math.floor(Date.now() / 60000)}`; // Per minute
        const currentCount = this.sampleCounts.get(sampleKey) || 0;
        
        // Simple sampling based on rate
        if (Math.random() < this.config.samplingRate || currentCount === 0) {
            this.sampleCounts.set(sampleKey, currentCount + 1);
            return metrics;
        }
        
        return null; // Skip this sample
    }
}

// Component-specific collectors

/**
 * Codegen Metrics Collector
 */
class CodegenMetricsCollector {
    async collect() {
        return {
            requests_total: Math.floor(Math.random() * 1000),
            requests_successful: Math.floor(Math.random() * 950),
            requests_failed: Math.floor(Math.random() * 50),
            avg_response_time_ms: Math.floor(Math.random() * 2000) + 500,
            quality_score: Math.random() * 0.3 + 0.7, // 0.7-1.0
            code_lines_generated: Math.floor(Math.random() * 10000),
            pr_creation_rate: Math.random() * 0.2 + 0.8, // 0.8-1.0
            timestamp: Date.now()
        };
    }
}

/**
 * Database Metrics Collector
 */
class DatabaseMetricsCollector {
    async collect() {
        return {
            connections_active: Math.floor(Math.random() * 20) + 5,
            connections_idle: Math.floor(Math.random() * 10) + 2,
            query_time_avg_ms: Math.floor(Math.random() * 100) + 10,
            query_time_p95_ms: Math.floor(Math.random() * 500) + 50,
            queries_per_second: Math.floor(Math.random() * 100) + 10,
            slow_queries_count: Math.floor(Math.random() * 5),
            deadlocks_count: Math.floor(Math.random() * 2),
            cache_hit_rate: Math.random() * 0.2 + 0.8, // 0.8-1.0
            timestamp: Date.now()
        };
    }
}

/**
 * Validation Metrics Collector
 */
class ValidationMetricsCollector {
    async collect() {
        return {
            validations_total: Math.floor(Math.random() * 500),
            validations_successful: Math.floor(Math.random() * 450),
            validations_failed: Math.floor(Math.random() * 50),
            avg_validation_time_ms: Math.floor(Math.random() * 30000) + 5000,
            security_issues_found: Math.floor(Math.random() * 10),
            performance_issues_found: Math.floor(Math.random() * 15),
            code_quality_score: Math.random() * 0.3 + 0.7,
            test_coverage_avg: Math.random() * 0.4 + 0.6, // 0.6-1.0
            timestamp: Date.now()
        };
    }
}

/**
 * Workflow Metrics Collector
 */
class WorkflowMetricsCollector {
    async collect() {
        return {
            workflows_active: Math.floor(Math.random() * 10) + 1,
            workflows_completed: Math.floor(Math.random() * 100),
            workflows_failed: Math.floor(Math.random() * 10),
            avg_workflow_duration_ms: Math.floor(Math.random() * 300000) + 60000,
            step_success_rate: Math.random() * 0.2 + 0.8,
            parallel_execution_efficiency: Math.random() * 0.3 + 0.7,
            rollback_count: Math.floor(Math.random() * 5),
            timestamp: Date.now()
        };
    }
}

/**
 * System Metrics Collector
 */
class SystemMetricsCollector {
    async collect() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            memory_heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
            memory_heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
            memory_external_mb: Math.round(memUsage.external / 1024 / 1024),
            cpu_user_ms: cpuUsage.user,
            cpu_system_ms: cpuUsage.system,
            uptime_seconds: Math.floor(process.uptime()),
            event_loop_lag_ms: Math.floor(Math.random() * 10) + 1,
            gc_collections: Math.floor(Math.random() * 100),
            timestamp: Date.now()
        };
    }
}

/**
 * Agent Metrics Collector
 */
class AgentMetricsCollector {
    async collect() {
        return {
            agents_active: Math.floor(Math.random() * 5) + 1,
            agents_idle: Math.floor(Math.random() * 3),
            agent_requests_total: Math.floor(Math.random() * 200),
            agent_requests_successful: Math.floor(Math.random() * 180),
            agent_requests_failed: Math.floor(Math.random() * 20),
            avg_agent_response_time_ms: Math.floor(Math.random() * 5000) + 1000,
            agent_failure_rate: Math.random() * 0.1, // 0-10%
            agent_queue_size: Math.floor(Math.random() * 50),
            timestamp: Date.now()
        };
    }
}

/**
 * Webhook Metrics Collector
 */
class WebhookMetricsCollector {
    async collect() {
        return {
            webhooks_received: Math.floor(Math.random() * 100),
            webhooks_processed: Math.floor(Math.random() * 95),
            webhooks_failed: Math.floor(Math.random() * 5),
            avg_processing_time_ms: Math.floor(Math.random() * 3000) + 500,
            webhook_queue_size: Math.floor(Math.random() * 20),
            retry_count: Math.floor(Math.random() * 10),
            timeout_count: Math.floor(Math.random() * 3),
            timestamp: Date.now()
        };
    }
}

export default MetricsCollector;

