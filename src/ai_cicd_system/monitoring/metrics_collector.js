/**
 * @fileoverview Metrics Collector
 * @description Comprehensive metrics collection system for all system components
 */

import { log } from '../../scripts/modules/utils.js';
import { MetricsStorage } from './metrics_storage.js';
import os from 'os';
import { performance } from 'perf_hooks';

/**
 * System metrics collector
 */
class SystemMetricsCollector {
    async collect() {
        const cpuUsage = process.cpuUsage();
        const memUsage = process.memoryUsage();
        const loadAvg = os.loadavg();
        
        return {
            cpu_usage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // Convert to ms
            memory_usage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
            memory_heap_used: memUsage.heapUsed,
            memory_heap_total: memUsage.heapTotal,
            memory_rss: memUsage.rss,
            memory_external: memUsage.external,
            load_average_1m: loadAvg[0],
            load_average_5m: loadAvg[1],
            load_average_15m: loadAvg[2],
            uptime: process.uptime(),
            platform: os.platform(),
            arch: os.arch(),
            node_version: process.version,
            pid: process.pid
        };
    }
}

/**
 * Workflow metrics collector
 */
class WorkflowMetricsCollector {
    constructor() {
        this.activeWorkflows = new Map();
        this.completedToday = 0;
        this.errorCount = 0;
        this.totalExecutionTime = 0;
        this.workflowCount = 0;
    }

    async collect() {
        return {
            active_count: this.activeWorkflows.size,
            completed_today: this.completedToday,
            error_count: this.errorCount,
            average_execution_time: this.workflowCount > 0 ? this.totalExecutionTime / this.workflowCount : 0,
            success_rate: this.workflowCount > 0 ? ((this.workflowCount - this.errorCount) / this.workflowCount) * 100 : 100,
            total_workflows: this.workflowCount,
            active_workflows: Array.from(this.activeWorkflows.keys())
        };
    }

    trackWorkflowStart(workflowId) {
        this.activeWorkflows.set(workflowId, {
            startTime: Date.now(),
            status: 'running'
        });
    }

    trackWorkflowComplete(workflowId, success = true) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            const executionTime = Date.now() - workflow.startTime;
            this.totalExecutionTime += executionTime;
            this.workflowCount++;
            
            if (success) {
                this.completedToday++;
            } else {
                this.errorCount++;
            }
            
            this.activeWorkflows.delete(workflowId);
        }
    }
}

/**
 * Agent metrics collector
 */
class AgentMetricsCollector {
    constructor() {
        this.agentStats = new Map();
        this.totalRequests = 0;
        this.totalErrors = 0;
        this.totalResponseTime = 0;
    }

    async collect() {
        const agents = Array.from(this.agentStats.entries()).map(([id, stats]) => ({
            id,
            requests: stats.requests,
            errors: stats.errors,
            avg_response_time: stats.requests > 0 ? stats.totalResponseTime / stats.requests : 0,
            success_rate: stats.requests > 0 ? ((stats.requests - stats.errors) / stats.requests) * 100 : 100,
            last_activity: stats.lastActivity
        }));

        return {
            total_agents: this.agentStats.size,
            total_requests: this.totalRequests,
            total_errors: this.totalErrors,
            average_response_time: this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0,
            overall_success_rate: this.totalRequests > 0 ? ((this.totalRequests - this.totalErrors) / this.totalRequests) * 100 : 100,
            agents
        };
    }

    trackAgentRequest(agentId, responseTime, success = true) {
        if (!this.agentStats.has(agentId)) {
            this.agentStats.set(agentId, {
                requests: 0,
                errors: 0,
                totalResponseTime: 0,
                lastActivity: null
            });
        }

        const stats = this.agentStats.get(agentId);
        stats.requests++;
        stats.totalResponseTime += responseTime;
        stats.lastActivity = new Date().toISOString();
        
        if (!success) {
            stats.errors++;
            this.totalErrors++;
        }

        this.totalRequests++;
        this.totalResponseTime += responseTime;
    }
}

/**
 * Database metrics collector
 */
class DatabaseMetricsCollector {
    constructor() {
        this.queryStats = {
            total: 0,
            errors: 0,
            totalTime: 0,
            slowQueries: 0
        };
        this.connectionPool = {
            active: 0,
            idle: 0,
            waiting: 0
        };
    }

    async collect() {
        return {
            total_queries: this.queryStats.total,
            query_errors: this.queryStats.errors,
            average_query_time: this.queryStats.total > 0 ? this.queryStats.totalTime / this.queryStats.total : 0,
            slow_queries: this.queryStats.slowQueries,
            query_success_rate: this.queryStats.total > 0 ? ((this.queryStats.total - this.queryStats.errors) / this.queryStats.total) * 100 : 100,
            connection_pool_active: this.connectionPool.active,
            connection_pool_idle: this.connectionPool.idle,
            connection_pool_waiting: this.connectionPool.waiting,
            connection_pool_total: this.connectionPool.active + this.connectionPool.idle
        };
    }

    trackQuery(duration, success = true) {
        this.queryStats.total++;
        this.queryStats.totalTime += duration;
        
        if (!success) {
            this.queryStats.errors++;
        }
        
        if (duration > 1000) { // Slow query threshold: 1 second
            this.queryStats.slowQueries++;
        }
    }

    updateConnectionPool(active, idle, waiting = 0) {
        this.connectionPool.active = active;
        this.connectionPool.idle = idle;
        this.connectionPool.waiting = waiting;
    }
}

/**
 * API metrics collector
 */
class APIMetricsCollector {
    constructor() {
        this.requestStats = {
            total: 0,
            errors: 0,
            totalResponseTime: 0
        };
        this.statusCodes = new Map();
        this.endpoints = new Map();
    }

    async collect() {
        const endpointStats = Array.from(this.endpoints.entries()).map(([path, stats]) => ({
            path,
            requests: stats.requests,
            errors: stats.errors,
            avg_response_time: stats.requests > 0 ? stats.totalResponseTime / stats.requests : 0,
            success_rate: stats.requests > 0 ? ((stats.requests - stats.errors) / stats.requests) * 100 : 100
        }));

        const statusCodeStats = Array.from(this.statusCodes.entries()).map(([code, count]) => ({
            status_code: code,
            count
        }));

        return {
            total_requests: this.requestStats.total,
            total_errors: this.requestStats.errors,
            avg_response_time: this.requestStats.total > 0 ? this.requestStats.totalResponseTime / this.requestStats.total : 0,
            success_rate: this.requestStats.total > 0 ? ((this.requestStats.total - this.requestStats.errors) / this.requestStats.total) * 100 : 100,
            status_codes: statusCodeStats,
            endpoints: endpointStats
        };
    }

    trackRequest(path, statusCode, responseTime) {
        this.requestStats.total++;
        this.requestStats.totalResponseTime += responseTime;
        
        if (statusCode >= 400) {
            this.requestStats.errors++;
        }

        // Track status codes
        this.statusCodes.set(statusCode, (this.statusCodes.get(statusCode) || 0) + 1);

        // Track endpoints
        if (!this.endpoints.has(path)) {
            this.endpoints.set(path, {
                requests: 0,
                errors: 0,
                totalResponseTime: 0
            });
        }

        const endpointStats = this.endpoints.get(path);
        endpointStats.requests++;
        endpointStats.totalResponseTime += responseTime;
        
        if (statusCode >= 400) {
            endpointStats.errors++;
        }
    }
}

/**
 * Main metrics collector that orchestrates all metric collection
 */
export class MetricsCollector {
    constructor(config) {
        this.config = config;
        this.metrics = new Map();
        this.collectors = new Map();
        this.storage = new MetricsStorage(config);
        this.isCollecting = false;
        this.collectionInterval = null;
        
        this.initializeCollectors();
    }

    initializeCollectors() {
        // System metrics
        this.collectors.set('system', new SystemMetricsCollector());
        
        // Workflow metrics
        this.collectors.set('workflow', new WorkflowMetricsCollector());
        
        // Agent metrics
        this.collectors.set('agent', new AgentMetricsCollector());
        
        // Database metrics
        this.collectors.set('database', new DatabaseMetricsCollector());
        
        // API metrics
        this.collectors.set('api', new APIMetricsCollector());

        log('debug', 'Metrics collectors initialized');
    }

    /**
     * Start automatic metrics collection
     */
    startCollection(intervalMs = 60000) {
        if (this.isCollecting) {
            log('warning', 'Metrics collection already running');
            return;
        }

        this.isCollecting = true;
        this.collectionInterval = setInterval(async () => {
            try {
                await this.collectAllMetrics();
            } catch (error) {
                log('error', `Error during automatic metrics collection: ${error.message}`);
            }
        }, intervalMs);

        log('info', `Started automatic metrics collection with ${intervalMs}ms interval`);
    }

    /**
     * Stop automatic metrics collection
     */
    stopCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }
        this.isCollecting = false;
        log('info', 'Stopped automatic metrics collection');
    }

    /**
     * Collect metrics from all collectors
     */
    async collectAllMetrics() {
        const timestamp = Date.now();
        const allMetrics = {};

        for (const [name, collector] of this.collectors) {
            try {
                const startTime = performance.now();
                const metrics = await collector.collect();
                const collectionTime = performance.now() - startTime;
                
                allMetrics[name] = {
                    timestamp,
                    data: metrics,
                    status: 'success',
                    collection_time_ms: Math.round(collectionTime * 100) / 100
                };
                
                log('debug', `Collected ${name} metrics in ${collectionTime.toFixed(2)}ms`);
            } catch (error) {
                allMetrics[name] = {
                    timestamp,
                    error: error.message,
                    status: 'error',
                    collection_time_ms: 0
                };
                
                log('error', `Failed to collect ${name} metrics: ${error.message}`);
            }
        }

        // Store metrics
        try {
            await this.storage.store(allMetrics);
            log('debug', 'Metrics stored successfully');
        } catch (error) {
            log('error', `Failed to store metrics: ${error.message}`);
        }

        // Update internal metrics cache
        this.metrics.set(timestamp, allMetrics);
        
        // Keep only last 100 metric snapshots in memory
        if (this.metrics.size > 100) {
            const oldestKey = Math.min(...this.metrics.keys());
            this.metrics.delete(oldestKey);
        }

        return allMetrics;
    }

    /**
     * Get latest metrics
     */
    async getLatestMetrics() {
        if (this.metrics.size === 0) {
            return await this.collectAllMetrics();
        }
        
        const latestTimestamp = Math.max(...this.metrics.keys());
        return this.metrics.get(latestTimestamp);
    }

    /**
     * Get metrics for a specific time range
     */
    async getMetrics(timeRange = '1h') {
        const endTime = Date.now();
        let startTime;
        
        switch (timeRange) {
            case '5m':
                startTime = endTime - (5 * 60 * 1000);
                break;
            case '15m':
                startTime = endTime - (15 * 60 * 1000);
                break;
            case '1h':
                startTime = endTime - (60 * 60 * 1000);
                break;
            case '6h':
                startTime = endTime - (6 * 60 * 60 * 1000);
                break;
            case '24h':
                startTime = endTime - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = endTime - (7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = endTime - (60 * 60 * 1000); // Default to 1 hour
        }

        return await this.storage.getMetricsInRange(startTime, endTime);
    }

    /**
     * Get specific collector for external tracking
     */
    getCollector(type) {
        return this.collectors.get(type);
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        return {
            collectors: Array.from(this.collectors.keys()),
            is_collecting: this.isCollecting,
            cached_snapshots: this.metrics.size,
            storage_status: this.storage.isConnected()
        };
    }
}

export default MetricsCollector;

