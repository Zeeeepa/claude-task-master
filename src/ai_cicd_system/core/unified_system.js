/**
 * @fileoverview Unified System
 * @description Main system entry point for the AI CI/CD system
 */

import { log } from '../../../scripts/modules/utils.js';
import { SystemOrchestrator } from '../orchestrator/system_orchestrator.js';
import { SystemConfig } from '../config/system_config.js';

/**
 * Unified System - Main entry point for the AI CI/CD system
 */
export class UnifiedSystem {
    constructor(config = {}) {
        this.config = config instanceof SystemConfig ? config : new SystemConfig(config);
        this.orchestrator = new SystemOrchestrator(this.config);
        this.isStarted = false;
        this.startTime = null;
        this.systemMetrics = {
            startupTime: null,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Start the unified system
     * @param {Object} options - Startup options
     * @param {boolean} options.registerCoreComponents - Whether to register core components
     * @param {boolean} options.parallel - Whether to initialize components in parallel
     * @param {number} options.timeout - Timeout per component in milliseconds
     * @returns {Promise<Object>} Startup results
     */
    async start(options = {}) {
        if (this.isStarted) {
            log('warning', 'Unified system already started');
            return this.systemMetrics;
        }

        this.startTime = Date.now();
        log('info', '🌟 Starting Unified AI CI/CD System...');

        try {
            // Initialize the orchestrator
            const initResults = await this.orchestrator.initialize(options);

            this.isStarted = true;
            this.systemMetrics.startupTime = Date.now() - this.startTime;

            log('info', `✅ Unified AI CI/CD System started successfully in ${this.systemMetrics.startupTime}ms`);
            log('info', `   System mode: ${this.config.config.mode}`);
            log('info', `   Mock mode: ${this.config.isMockMode ? 'enabled' : 'disabled'}`);
            log('info', `   Components initialized: ${initResults.successful}`);

            return {
                started: true,
                startup_time_ms: this.systemMetrics.startupTime,
                system_mode: this.config.config.mode,
                mock_mode: this.config.isMockMode,
                initialization_results: initResults,
                config_summary: this.config.getSummary()
            };

        } catch (error) {
            this.isStarted = false;
            log('error', `❌ Unified AI CI/CD System startup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process a task through the unified system
     * @param {Object} task - Task to process
     * @param {Object} context - Processing context
     * @returns {Promise<Object>} Processing result
     */
    async processTask(task, context = {}) {
        if (!this.isStarted) {
            throw new Error('Unified system not started');
        }

        const requestStartTime = Date.now();
        this.systemMetrics.totalRequests++;

        try {
            log('info', `📋 Processing task through unified system: ${task.id || task.title || 'unknown'}`);

            // Add system context
            const enhancedContext = {
                ...context,
                system: {
                    mode: this.config.config.mode,
                    mock_mode: this.config.isMockMode,
                    request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString()
                }
            };

            // Process through orchestrator
            const result = await this.orchestrator.processTask(task, enhancedContext);

            // Update metrics
            const responseTime = Date.now() - requestStartTime;
            this.systemMetrics.successfulRequests++;
            this._updateAverageResponseTime(responseTime);

            log('info', `✅ Task processed successfully in ${responseTime}ms`);

            return {
                ...result,
                system_metadata: {
                    request_id: enhancedContext.system.request_id,
                    processing_time_ms: responseTime,
                    system_mode: this.config.config.mode,
                    mock_mode: this.config.isMockMode
                }
            };

        } catch (error) {
            const responseTime = Date.now() - requestStartTime;
            this.systemMetrics.failedRequests++;
            this._updateAverageResponseTime(responseTime);

            log('error', `❌ Task processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process multiple tasks in batch
     * @param {Array<Object>} tasks - Tasks to process
     * @param {Object} options - Batch processing options
     * @param {boolean} options.parallel - Whether to process tasks in parallel
     * @param {number} options.maxConcurrency - Maximum concurrent tasks (if parallel)
     * @param {boolean} options.continueOnError - Whether to continue if a task fails
     * @returns {Promise<Object>} Batch processing results
     */
    async processBatch(tasks, options = {}) {
        const {
            parallel = false,
            maxConcurrency = 5,
            continueOnError = true
        } = options;

        if (!this.isStarted) {
            throw new Error('Unified system not started');
        }

        log('info', `📦 Processing batch of ${tasks.length} tasks (parallel: ${parallel})`);

        const results = {
            total: tasks.length,
            successful: 0,
            failed: 0,
            results: [],
            errors: []
        };

        if (parallel) {
            await this._processBatchParallel(tasks, maxConcurrency, continueOnError, results);
        } else {
            await this._processBatchSequential(tasks, continueOnError, results);
        }

        log('info', `📦 Batch processing completed: ${results.successful} successful, ${results.failed} failed`);
        return results;
    }

    /**
     * Process batch in parallel
     * @param {Array<Object>} tasks - Tasks to process
     * @param {number} maxConcurrency - Maximum concurrent tasks
     * @param {boolean} continueOnError - Whether to continue on error
     * @param {Object} results - Results object to update
     * @private
     */
    async _processBatchParallel(tasks, maxConcurrency, continueOnError, results) {
        const semaphore = new Array(maxConcurrency).fill(null);
        let taskIndex = 0;

        const processNext = async () => {
            while (taskIndex < tasks.length) {
                const currentIndex = taskIndex++;
                const task = tasks[currentIndex];

                try {
                    const result = await this.processTask(task);
                    results.successful++;
                    results.results[currentIndex] = result;
                } catch (error) {
                    results.failed++;
                    results.errors.push({ index: currentIndex, task, error: error.message });
                    
                    if (!continueOnError) {
                        throw error;
                    }
                }
            }
        };

        const workers = semaphore.map(() => processNext());
        await Promise.all(workers);
    }

    /**
     * Process batch sequentially
     * @param {Array<Object>} tasks - Tasks to process
     * @param {boolean} continueOnError - Whether to continue on error
     * @param {Object} results - Results object to update
     * @private
     */
    async _processBatchSequential(tasks, continueOnError, results) {
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            
            try {
                const result = await this.processTask(task);
                results.successful++;
                results.results[i] = result;
            } catch (error) {
                results.failed++;
                results.errors.push({ index: i, task, error: error.message });
                
                if (!continueOnError) {
                    throw error;
                }
            }
        }
    }

    /**
     * Get system health status
     * @returns {Promise<Object>} System health status
     */
    async getHealth() {
        if (!this.isStarted) {
            return {
                status: 'unhealthy',
                reason: 'System not started',
                uptime_ms: 0
            };
        }

        try {
            const orchestratorHealth = await this.orchestrator.getHealth();
            const uptime = this.startTime ? Date.now() - this.startTime : 0;

            return {
                status: orchestratorHealth.status,
                is_started: this.isStarted,
                uptime_ms: uptime,
                system_mode: this.config.config.mode,
                mock_mode: this.config.isMockMode,
                metrics: this.systemMetrics,
                orchestrator_health: orchestratorHealth
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                reason: `Health check failed: ${error.message}`,
                is_started: this.isStarted
            };
        }
    }

    /**
     * Get system statistics
     * @returns {Promise<Object>} System statistics
     */
    async getStatistics() {
        const orchestratorStats = await this.orchestrator.getStatistics();
        const uptime = this.startTime ? Date.now() - this.startTime : 0;

        return {
            is_started: this.isStarted,
            uptime_ms: uptime,
            system_mode: this.config.config.mode,
            mock_mode: this.config.isMockMode,
            system_metrics: this.systemMetrics,
            orchestrator_stats: orchestratorStats,
            config_summary: this.config.getSummary()
        };
    }

    /**
     * Get component information
     * @returns {Array<Object>} Component information
     */
    getComponents() {
        if (!this.isStarted) {
            return [];
        }

        return this.orchestrator.getComponentDetails();
    }

    /**
     * Register a new component
     * @param {string} name - Component name
     * @param {Object} component - Component instance
     * @param {Object} config - Component configuration
     */
    registerComponent(name, component, config = {}) {
        if (this.isStarted) {
            throw new Error('Cannot register components after system is started');
        }

        this.orchestrator.registerComponent(name, component, config);
        log('debug', `Component registered with unified system: ${name}`);
    }

    /**
     * Get a component by name
     * @param {string} name - Component name
     * @returns {Object|null} Component instance
     */
    getComponent(name) {
        return this.orchestrator.getComponent(name);
    }

    /**
     * Restart a component
     * @param {string} name - Component name
     * @param {Object} options - Restart options
     * @returns {Promise<void>}
     */
    async restartComponent(name, options = {}) {
        if (!this.isStarted) {
            throw new Error('System not started');
        }

        await this.orchestrator.restartComponent(name, options);
    }

    /**
     * Update average response time
     * @param {number} responseTime - Response time in milliseconds
     * @private
     */
    _updateAverageResponseTime(responseTime) {
        const totalRequests = this.systemMetrics.totalRequests;
        const currentAverage = this.systemMetrics.averageResponseTime;
        
        this.systemMetrics.averageResponseTime = 
            ((currentAverage * (totalRequests - 1)) + responseTime) / totalRequests;
    }

    /**
     * Stop the unified system
     * @param {Object} options - Shutdown options
     * @returns {Promise<Object>} Shutdown results
     */
    async stop(options = {}) {
        if (!this.isStarted) {
            log('warning', 'Unified system not started');
            return { stopped: false, reason: 'System not started' };
        }

        log('info', '🛑 Stopping Unified AI CI/CD System...');

        try {
            const shutdownResults = await this.orchestrator.shutdown(options);
            
            const uptime = this.startTime ? Date.now() - this.startTime : 0;
            this.isStarted = false;

            log('info', `✅ Unified AI CI/CD System stopped (uptime: ${uptime}ms)`);

            return {
                stopped: true,
                uptime_ms: uptime,
                final_metrics: this.systemMetrics,
                shutdown_results: shutdownResults
            };

        } catch (error) {
            log('error', `❌ Unified AI CI/CD System shutdown failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a unified system instance with environment-specific configuration
     * @param {string} environment - Environment name (development, testing, production)
     * @param {Object} overrides - Configuration overrides
     * @returns {UnifiedSystem} Unified system instance
     */
    static forEnvironment(environment, overrides = {}) {
        const config = SystemConfig.forEnvironment(environment);
        
        // Apply overrides
        if (Object.keys(overrides).length > 0) {
            config.config = { ...config.config, ...overrides };
        }

        return new UnifiedSystem(config);
    }

    /**
     * Create a unified system instance for development
     * @param {Object} overrides - Configuration overrides
     * @returns {UnifiedSystem} Unified system instance
     */
    static forDevelopment(overrides = {}) {
        return UnifiedSystem.forEnvironment('development', overrides);
    }

    /**
     * Create a unified system instance for testing
     * @param {Object} overrides - Configuration overrides
     * @returns {UnifiedSystem} Unified system instance
     */
    static forTesting(overrides = {}) {
        return UnifiedSystem.forEnvironment('testing', overrides);
    }

    /**
     * Create a unified system instance for production
     * @param {Object} overrides - Configuration overrides
     * @returns {UnifiedSystem} Unified system instance
     */
    static forProduction(overrides = {}) {
        return UnifiedSystem.forEnvironment('production', overrides);
    }
}

export default UnifiedSystem;
