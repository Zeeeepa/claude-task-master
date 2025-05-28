/**
 * @fileoverview Recovery System Integration
 * @description Main integration module for the advanced error recovery and retry logic system
 */

import CentralErrorHandler, { ErrorSource, ErrorCategory, ErrorSeverity } from './error-handler.js';
import RetryManager, { RetryStrategy, RetryPolicy } from './retry-manager.js';
import CircuitBreaker, { CircuitBreakerManager, CircuitState, CircuitStrategy } from './circuit-breaker.js';
import RecoveryOrchestrator, { RecoveryStrategy, RecoveryAction, RecoveryStatus } from './recovery-orchestrator.js';
import StateManager, { StateType, StateStatus, BackupStrategy } from './state-manager.js';
import ErrorMonitor, { AlertLevel, AlertChannel, MonitoringMetric } from '../monitoring/error-monitor.js';
import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';

/**
 * Advanced Error Recovery System
 * Integrates all recovery components into a unified system
 */
export class AdvancedErrorRecoverySystem extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableErrorHandler: config.enableErrorHandler !== false,
            enableRetryManager: config.enableRetryManager !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            enableRecoveryOrchestrator: config.enableRecoveryOrchestrator !== false,
            enableStateManager: config.enableStateManager !== false,
            enableErrorMonitor: config.enableErrorMonitor !== false,
            enableIntegrationHealthCheck: config.enableIntegrationHealthCheck !== false,
            healthCheckInterval: config.healthCheckInterval || 300000, // 5 minutes
            ...config
        };

        // Initialize components
        this.errorHandler = this.config.enableErrorHandler ? 
            new CentralErrorHandler(config.errorHandler) : null;
            
        this.retryManager = this.config.enableRetryManager ? 
            new RetryManager(config.retryManager) : null;
            
        this.circuitBreakerManager = this.config.enableCircuitBreaker ? 
            new CircuitBreakerManager() : null;
            
        this.recoveryOrchestrator = this.config.enableRecoveryOrchestrator ? 
            new RecoveryOrchestrator({
                ...config.recoveryOrchestrator,
                errorHandler: this.errorHandler,
                retryManager: this.retryManager,
                circuitBreakerManager: this.circuitBreakerManager
            }) : null;
            
        this.stateManager = this.config.enableStateManager ? 
            new StateManager(config.stateManager) : null;
            
        this.errorMonitor = this.config.enableErrorMonitor ? 
            new ErrorMonitor(config.errorMonitor) : null;

        // Integration state
        this.isInitialized = false;
        this.integrationHealth = new Map();
        this.systemMetrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            recoveredOperations: 0,
            systemUptime: Date.now()
        };

        // Set up component integration
        this._setupComponentIntegration();
        
        // Set up health monitoring
        if (this.config.enableIntegrationHealthCheck) {
            this.healthCheckInterval = setInterval(() => {
                this._performIntegrationHealthCheck();
            }, this.config.healthCheckInterval);
        }
    }

    /**
     * Initialize the recovery system
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warning', 'Recovery system already initialized');
            return;
        }

        try {
            log('info', 'Initializing Advanced Error Recovery System');

            // Initialize state manager first (other components may need state)
            if (this.stateManager) {
                await this._initializeStateManager();
            }

            // Initialize monitoring
            if (this.errorMonitor) {
                await this._initializeErrorMonitor();
            }

            // Initialize recovery components
            if (this.errorHandler) {
                await this._initializeErrorHandler();
            }

            if (this.retryManager) {
                await this._initializeRetryManager();
            }

            if (this.circuitBreakerManager) {
                await this._initializeCircuitBreakerManager();
            }

            if (this.recoveryOrchestrator) {
                await this._initializeRecoveryOrchestrator();
            }

            // Perform initial health check
            await this._performIntegrationHealthCheck();

            this.isInitialized = true;
            
            this.emit('system-initialized', {
                timestamp: Date.now(),
                components: this._getEnabledComponents()
            });

            log('info', 'Advanced Error Recovery System initialized successfully', {
                components: this._getEnabledComponents()
            });

        } catch (error) {
            log('error', 'Failed to initialize recovery system', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute operation with full error recovery support
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Execution options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRecovery(operation, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Recovery system not initialized');
        }

        const operationId = options.operationId || this._generateOperationId();
        const startTime = Date.now();
        
        this.systemMetrics.totalOperations++;

        try {
            // Save operation state if state manager is enabled
            if (this.stateManager && options.saveState) {
                await this.stateManager.saveState(`operation_${operationId}`, {
                    operation: operation.toString(),
                    options,
                    startTime
                }, { type: StateType.TRANSACTION });
            }

            let result;

            // Execute with circuit breaker if enabled
            if (this.circuitBreakerManager && options.circuitBreaker) {
                const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(
                    options.circuitBreaker,
                    options.circuitBreakerConfig
                );
                result = await circuitBreaker.execute(operation);
            }
            // Execute with retry manager if enabled
            else if (this.retryManager && options.retry !== false) {
                result = await this.retryManager.executeWithRetry(operation, {
                    operationId,
                    ...options.retryOptions
                });
            }
            // Execute directly
            else {
                result = await operation();
            }

            // Record success
            this.systemMetrics.successfulOperations++;
            
            if (this.errorMonitor) {
                this.errorMonitor.recordResponseTime(
                    options.source || ErrorSource.SYSTEM,
                    Date.now() - startTime
                );
                this.errorMonitor.recordAvailability(
                    options.source || ErrorSource.SYSTEM,
                    true
                );
            }

            this.emit('operation-success', {
                operationId,
                duration: Date.now() - startTime,
                source: options.source
            });

            return result;

        } catch (error) {
            this.systemMetrics.failedOperations++;

            // Record error in monitoring
            if (this.errorMonitor) {
                this.errorMonitor.recordAvailability(
                    options.source || ErrorSource.SYSTEM,
                    false
                );
            }

            // Attempt recovery if orchestrator is enabled
            if (this.recoveryOrchestrator && options.enableRecovery !== false) {
                try {
                    const recoveryResult = await this.recoveryOrchestrator.handleErrorAndRecover(
                        error,
                        { ...options, operationId }
                    );

                    if (recoveryResult.success) {
                        this.systemMetrics.recoveredOperations++;
                        
                        this.emit('operation-recovered', {
                            operationId,
                            duration: Date.now() - startTime,
                            recoveryStrategy: recoveryResult.strategy
                        });

                        return recoveryResult;
                    }
                } catch (recoveryError) {
                    log('error', 'Recovery failed', {
                        operationId,
                        originalError: error.message,
                        recoveryError: recoveryError.message
                    });
                }
            }

            this.emit('operation-failed', {
                operationId,
                error: error.message,
                duration: Date.now() - startTime,
                source: options.source
            });

            throw error;
        }
    }

    /**
     * Handle error through the recovery system
     * @param {Error} error - Error to handle
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     */
    async handleError(error, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Recovery system not initialized');
        }

        try {
            // Handle through error handler
            let result = { success: false, error };
            
            if (this.errorHandler) {
                result = await this.errorHandler.handleError(error, context);
            }

            // Record in monitoring
            if (this.errorMonitor) {
                this.errorMonitor.recordError(result.classification || {
                    source: context.source || ErrorSource.SYSTEM,
                    category: ErrorCategory.UNKNOWN,
                    severity: ErrorSeverity.MEDIUM,
                    message: error.message,
                    timestamp: new Date()
                });
            }

            return result;

        } catch (handlingError) {
            log('error', 'Error handling failed', {
                originalError: error.message,
                handlingError: handlingError.message
            });
            throw handlingError;
        }
    }

    /**
     * Get system health report
     * @returns {Object} Comprehensive health report
     */
    getHealthReport() {
        const report = {
            timestamp: Date.now(),
            systemStatus: this.isInitialized ? 'healthy' : 'initializing',
            uptime: Date.now() - this.systemMetrics.systemUptime,
            metrics: { ...this.systemMetrics },
            components: {},
            integrationHealth: Object.fromEntries(this.integrationHealth)
        };

        // Add component health
        if (this.errorHandler) {
            report.components.errorHandler = this.errorHandler.getHealthReport();
        }

        if (this.retryManager) {
            report.components.retryManager = this.retryManager.getStatistics();
        }

        if (this.circuitBreakerManager) {
            report.components.circuitBreakers = this.circuitBreakerManager.getHealthReport();
        }

        if (this.recoveryOrchestrator) {
            report.components.recoveryOrchestrator = this.recoveryOrchestrator.getStatistics();
        }

        if (this.stateManager) {
            report.components.stateManager = this.stateManager.getStatistics();
        }

        if (this.errorMonitor) {
            report.components.errorMonitor = this.errorMonitor.getStatistics();
        }

        // Calculate overall health score
        report.healthScore = this._calculateOverallHealthScore(report);

        return report;
    }

    /**
     * Get monitoring dashboard data
     * @returns {Object} Dashboard data
     */
    getDashboardData() {
        if (!this.errorMonitor) {
            return { error: 'Error monitoring not enabled' };
        }

        const dashboardData = this.errorMonitor.getDashboardData();
        
        // Add system-level metrics
        dashboardData.system = {
            ...this.systemMetrics,
            healthScore: this._calculateOverallHealthScore(),
            uptime: Date.now() - this.systemMetrics.systemUptime,
            successRate: this.systemMetrics.totalOperations > 0 ? 
                this.systemMetrics.successfulOperations / this.systemMetrics.totalOperations : 0,
            recoveryRate: this.systemMetrics.failedOperations > 0 ? 
                this.systemMetrics.recoveredOperations / this.systemMetrics.failedOperations : 0
        };

        return dashboardData;
    }

    /**
     * Configure integration for specific service
     * @param {string} source - Service source
     * @param {Object} config - Integration configuration
     */
    configureIntegration(source, config) {
        // Configure circuit breaker
        if (this.circuitBreakerManager && config.circuitBreaker) {
            this.circuitBreakerManager.getCircuitBreaker(source, config.circuitBreaker);
        }

        // Configure monitoring thresholds
        if (this.errorMonitor && config.monitoring) {
            Object.entries(config.monitoring.thresholds || {}).forEach(([metric, threshold]) => {
                this.errorMonitor.setAlertThreshold(metric, threshold);
            });
        }

        // Configure recovery strategies
        if (this.recoveryOrchestrator && config.recovery) {
            Object.entries(config.recovery.strategies || {}).forEach(([errorType, strategy]) => {
                this.recoveryOrchestrator.setRecoveryStrategy(`${source}:${errorType}`, strategy);
            });

            if (config.recovery.fallback) {
                this.recoveryOrchestrator.setFallbackService(source, config.recovery.fallback);
            }
        }

        this.emit('integration-configured', {
            source,
            config,
            timestamp: Date.now()
        });
    }

    /**
     * Reset all components
     */
    reset() {
        if (this.errorHandler) this.errorHandler.reset();
        if (this.retryManager) this.retryManager.reset();
        if (this.circuitBreakerManager) this.circuitBreakerManager.resetAll();
        if (this.recoveryOrchestrator) this.recoveryOrchestrator.reset();
        if (this.stateManager) this.stateManager.reset();
        if (this.errorMonitor) this.errorMonitor.reset();

        this.systemMetrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            recoveredOperations: 0,
            systemUptime: Date.now()
        };

        this.integrationHealth.clear();
    }

    /**
     * Shutdown the recovery system
     */
    async shutdown() {
        log('info', 'Shutting down Advanced Error Recovery System');

        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Shutdown components
        if (this.errorHandler) this.errorHandler.destroy();
        if (this.retryManager) this.retryManager.destroy();
        if (this.circuitBreakerManager) this.circuitBreakerManager.destroy();
        if (this.recoveryOrchestrator) this.recoveryOrchestrator.destroy();
        if (this.stateManager) this.stateManager.destroy();
        if (this.errorMonitor) this.errorMonitor.destroy();

        this.isInitialized = false;
        this.removeAllListeners();

        this.emit('system-shutdown', {
            timestamp: Date.now()
        });

        log('info', 'Advanced Error Recovery System shutdown complete');
    }

    // Private methods

    _setupComponentIntegration() {
        // Connect error handler to monitoring
        if (this.errorHandler && this.errorMonitor) {
            this.errorHandler.on('error', (errorInfo) => {
                this.errorMonitor.recordError(errorInfo);
            });

            this.errorHandler.on('critical-error', (errorInfo) => {
                this.errorMonitor.createAlert({
                    level: AlertLevel.CRITICAL,
                    source: errorInfo.source,
                    message: `Critical error: ${errorInfo.message}`,
                    metric: 'error_severity'
                });
            });
        }

        // Connect retry manager to monitoring
        if (this.retryManager && this.errorMonitor) {
            this.retryManager.on('retry-success', (event) => {
                this.errorMonitor.recordRecovery(event.source || ErrorSource.SYSTEM, true, event);
            });

            this.retryManager.on('retry-exhausted', (event) => {
                this.errorMonitor.recordRecovery(event.source || ErrorSource.SYSTEM, false, event);
            });
        }

        // Connect circuit breaker to monitoring
        if (this.circuitBreakerManager && this.errorMonitor) {
            this.circuitBreakerManager.on('state-change', (event) => {
                if (event.to === CircuitState.OPEN) {
                    this.errorMonitor.createAlert({
                        level: AlertLevel.ERROR,
                        source: event.circuitBreaker,
                        message: `Circuit breaker opened: ${event.circuitBreaker}`,
                        metric: 'circuit_breaker_state'
                    });
                }
            });
        }

        // Connect recovery orchestrator to monitoring
        if (this.recoveryOrchestrator && this.errorMonitor) {
            this.recoveryOrchestrator.on('recovery-completed', (recovery) => {
                this.errorMonitor.recordRecovery(recovery.error.source, true, recovery);
            });

            this.recoveryOrchestrator.on('recovery-failed', (recovery) => {
                this.errorMonitor.recordRecovery(recovery.error.source, false, recovery);
            });
        }
    }

    async _initializeStateManager() {
        // Load any existing system state
        try {
            const systemState = await this.stateManager.loadState('system_config');
            log('debug', 'Loaded existing system state');
        } catch (error) {
            // No existing state, create initial state
            await this.stateManager.saveState('system_config', {
                initialized: true,
                version: '1.0.0',
                components: this._getEnabledComponents()
            }, { type: StateType.CONFIGURATION });
        }
    }

    async _initializeErrorMonitor() {
        // Set up default alert channels and thresholds
        this.errorMonitor.setAlertThreshold('errorRate', 0.1);
        this.errorMonitor.setAlertThreshold('responseTime', 5000);
        this.errorMonitor.setAlertThreshold('availability', 0.95);
    }

    async _initializeErrorHandler() {
        // Configure error handler for different sources
        // This would be customized based on actual integrations
    }

    async _initializeRetryManager() {
        // Configure retry policies for different operations
        // This would be customized based on actual use cases
    }

    async _initializeCircuitBreakerManager() {
        // Pre-configure circuit breakers for known services
        Object.values(ErrorSource).forEach(source => {
            this.circuitBreakerManager.getCircuitBreaker(source, {
                failureThreshold: 5,
                timeout: 60000,
                strategy: CircuitStrategy.FAILURE_COUNT
            });
        });
    }

    async _initializeRecoveryOrchestrator() {
        // Configure recovery strategies and fallbacks
        // This would be customized based on actual services
    }

    async _performIntegrationHealthCheck() {
        const sources = Object.values(ErrorSource);
        
        for (const source of sources) {
            try {
                const health = await this._checkIntegrationHealth(source);
                this.integrationHealth.set(source, health);
                
                if (!health.healthy && this.errorMonitor) {
                    this.errorMonitor.createAlert({
                        level: AlertLevel.WARNING,
                        source,
                        message: `Integration health check failed: ${source}`,
                        metric: 'integration_health'
                    });
                }
            } catch (error) {
                this.integrationHealth.set(source, {
                    healthy: false,
                    error: error.message,
                    lastCheck: Date.now()
                });
            }
        }
    }

    async _checkIntegrationHealth(source) {
        // This would implement actual health checks for each integration
        // For now, return a basic health status
        return {
            healthy: true,
            responseTime: Math.random() * 1000,
            lastCheck: Date.now(),
            details: {}
        };
    }

    _calculateOverallHealthScore(report) {
        // Simplified health score calculation
        let score = 1.0;
        
        if (this.systemMetrics.totalOperations > 0) {
            const successRate = this.systemMetrics.successfulOperations / this.systemMetrics.totalOperations;
            score *= successRate;
        }
        
        // Factor in component health
        const healthyIntegrations = Array.from(this.integrationHealth.values())
            .filter(health => health.healthy).length;
        const totalIntegrations = this.integrationHealth.size;
        
        if (totalIntegrations > 0) {
            score *= healthyIntegrations / totalIntegrations;
        }
        
        return Math.max(0, Math.min(1, score));
    }

    _getEnabledComponents() {
        return Object.entries(this.config)
            .filter(([key, value]) => key.startsWith('enable') && value)
            .map(([key]) => key.replace('enable', '').toLowerCase());
    }

    _generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export all components and types
export {
    CentralErrorHandler,
    RetryManager,
    CircuitBreaker,
    CircuitBreakerManager,
    RecoveryOrchestrator,
    StateManager,
    ErrorMonitor,
    ErrorSource,
    ErrorCategory,
    ErrorSeverity,
    RetryStrategy,
    RetryPolicy,
    CircuitState,
    CircuitStrategy,
    RecoveryStrategy,
    RecoveryAction,
    RecoveryStatus,
    StateType,
    StateStatus,
    BackupStrategy,
    AlertLevel,
    AlertChannel,
    MonitoringMetric
};

export default AdvancedErrorRecoverySystem;

