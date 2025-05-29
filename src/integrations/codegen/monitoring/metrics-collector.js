/**
 * @fileoverview Unified Metrics Collector
 * @description Consolidated monitoring from PRs #52, #54, #87
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Unified Metrics Collector
 * Collects and aggregates system metrics
 */
export class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            enableMetrics: config.enableMetrics !== false,
            enableTracing: config.enableTracing !== false,
            metricsInterval: config.metricsInterval || 60000,
            ...config
        };

        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0
            },
            errors: {
                total: 0,
                byCategory: {}
            },
            system: {
                uptime: Date.now(),
                memoryUsage: 0,
                cpuUsage: 0
            }
        };

        this.isRunning = false;
        this.metricsTimer = null;
        
        log('debug', 'Metrics Collector initialized', {
            enabled: this.config.enabled,
            interval: this.config.metricsInterval
        });
    }

    start() {
        if (!this.config.enabled || this.isRunning) {
            return;
        }

        this.isRunning = true;
        
        if (this.config.enableMetrics) {
            this._startMetricsCollection();
        }
        
        log('info', 'Metrics collection started');
    }

    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
            this.metricsTimer = null;
        }
        
        log('info', 'Metrics collection stopped');
    }

    recordRequest(data) {
        if (!this.config.enabled) return;
        
        this.metrics.requests.total++;
        this.emit('metric:request', data);
    }

    recordResponse(data) {
        if (!this.config.enabled) return;
        
        if (data.success) {
            this.metrics.requests.successful++;
        } else {
            this.metrics.requests.failed++;
        }

        if (data.responseTime) {
            this._updateAverageResponseTime(data.responseTime);
        }

        this.emit('metric:response', data);
    }

    recordError(error) {
        if (!this.config.enabled) return;
        
        this.metrics.errors.total++;
        
        const category = error.category || 'unknown';
        this.metrics.errors.byCategory[category] = 
            (this.metrics.errors.byCategory[category] || 0) + 1;

        this.emit('metric:error', { error, category });
    }

    recordErrorHandling(data) {
        if (!this.config.enabled) return;
        
        this.emit('metric:error:handled', data);
    }

    getUptime() {
        return Date.now() - this.metrics.system.uptime;
    }

    getMetrics() {
        return {
            ...this.metrics,
            system: {
                ...this.metrics.system,
                uptime: this.getUptime()
            },
            timestamp: new Date().toISOString()
        };
    }

    isRunning() {
        return this.isRunning;
    }

    _startMetricsCollection() {
        this.metricsTimer = setInterval(() => {
            this._collectSystemMetrics();
        }, this.config.metricsInterval);
    }

    _collectSystemMetrics() {
        try {
            // Collect memory usage
            if (typeof process !== 'undefined' && process.memoryUsage) {
                const memUsage = process.memoryUsage();
                this.metrics.system.memoryUsage = memUsage.heapUsed;
            }

            this.emit('metrics:collected', this.getMetrics());
            
        } catch (error) {
            log('error', 'Error collecting system metrics', { error: error.message });
        }
    }

    _updateAverageResponseTime(responseTime) {
        const total = this.metrics.requests.total;
        const current = this.metrics.requests.averageResponseTime;
        
        this.metrics.requests.averageResponseTime = 
            ((current * (total - 1)) + responseTime) / total;
    }
}

