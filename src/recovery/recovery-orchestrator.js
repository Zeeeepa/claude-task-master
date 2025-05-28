/**
 * @fileoverview Recovery Orchestrator
 * @description Orchestrates recovery workflows and manages system recovery procedures
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';
import CentralErrorHandler, { ErrorSource, ErrorCategory, ErrorSeverity } from './error-handler.js';
import RetryManager from './retry-manager.js';
import { CircuitBreakerManager } from './circuit-breaker.js';

/**
 * Recovery strategies
 */
export const RecoveryStrategy = {
    IMMEDIATE: 'immediate',
    GRADUAL: 'gradual',
    MANUAL: 'manual',
    ADAPTIVE: 'adaptive'
};

/**
 * Recovery actions
 */
export const RecoveryAction = {
    RETRY: 'retry',
    FALLBACK: 'fallback',
    CIRCUIT_BREAK: 'circuit_break',
    GRACEFUL_DEGRADE: 'graceful_degrade',
    RESTART_SERVICE: 'restart_service',
    REFRESH_CREDENTIALS: 'refresh_credentials',
    CLEAR_CACHE: 'clear_cache',
    SCALE_RESOURCES: 'scale_resources',
    MANUAL_INTERVENTION: 'manual_intervention'
};

/**
 * Recovery status
 */
export const RecoveryStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Recovery Orchestrator for managing system recovery workflows
 */
export class RecoveryOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableAutoRecovery: config.enableAutoRecovery !== false,
            enableGracefulDegradation: config.enableGracefulDegradation !== false,
            maxConcurrentRecoveries: config.maxConcurrentRecoveries || 5,
            recoveryTimeout: config.recoveryTimeout || 300000, // 5 minutes
            validationTimeout: config.validationTimeout || 30000, // 30 seconds
            retryValidation: config.retryValidation !== false,
            ...config
        };

        // Initialize components
        this.errorHandler = new CentralErrorHandler(config.errorHandler);
        this.retryManager = new RetryManager(config.retryManager);
        this.circuitBreakerManager = new CircuitBreakerManager();
        
        // Recovery tracking
        this.activeRecoveries = new Map(); // recoveryId -> recovery info
        this.recoveryHistory = [];
        this.recoveryStrategies = new Map(); // errorType -> strategy
        this.fallbackServices = new Map(); // service -> fallback
        this.degradationLevels = new Map(); // service -> current level
        
        // Service health tracking
        this.serviceHealth = new Map(); // service -> health info
        this.lastHealthCheck = new Map(); // service -> timestamp
        
        // Initialize default recovery strategies
        this._initializeDefaultStrategies();
        
        // Set up event handlers
        this._setupEventHandlers();
        
        // Periodic health checks and cleanup
        this.healthCheckInterval = setInterval(() => {
            this._performHealthChecks();
            this._cleanupOldRecoveries();
        }, 30000); // Every 30 seconds
    }

    /**
     * Handle error and orchestrate recovery
     * @param {Error} error - The error to handle
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Recovery result
     */
    async handleErrorAndRecover(error, context = {}) {
        try {
            // Handle error through central error handler
            const errorResult = await this.errorHandler.handleError(error, context);
            
            // If error is not retryable or recovery is disabled, return error
            if (!errorResult.retryable || !this.config.enableAutoRecovery) {
                return errorResult;
            }

            // Start recovery process
            const recoveryId = this._generateRecoveryId();
            const recovery = await this._startRecovery(recoveryId, errorResult, context);
            
            return recovery;

        } catch (recoveryError) {
            log('error', 'Recovery orchestration failed', {
                originalError: error.message,
                recoveryError: recoveryError.message
            });
            throw recoveryError;
        }
    }

    /**
     * Start recovery process
     * @param {string} recoveryId - Recovery ID
     * @param {Object} errorResult - Error handling result
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _startRecovery(recoveryId, errorResult, context) {
        const recovery = {
            id: recoveryId,
            status: RecoveryStatus.PENDING,
            startTime: Date.now(),
            error: errorResult.classification,
            context,
            strategy: this._getRecoveryStrategy(errorResult.classification),
            actions: [],
            attempts: 0,
            maxAttempts: 3
        };

        this.activeRecoveries.set(recoveryId, recovery);
        
        log('info', `Starting recovery ${recoveryId}`, {
            errorType: errorResult.classification.category,
            source: errorResult.classification.source,
            strategy: recovery.strategy
        });

        this.emit('recovery-started', recovery);

        try {
            // Check if we've exceeded concurrent recovery limit
            if (this.activeRecoveries.size > this.config.maxConcurrentRecoveries) {
                throw new Error('Maximum concurrent recoveries exceeded');
            }

            recovery.status = RecoveryStatus.IN_PROGRESS;
            
            // Execute recovery based on strategy
            const result = await this._executeRecovery(recovery);
            
            recovery.status = RecoveryStatus.COMPLETED;
            recovery.endTime = Date.now();
            recovery.duration = recovery.endTime - recovery.startTime;
            recovery.result = result;
            
            this.emit('recovery-completed', recovery);
            
            return result;

        } catch (recoveryError) {
            recovery.status = RecoveryStatus.FAILED;
            recovery.endTime = Date.now();
            recovery.duration = recovery.endTime - recovery.startTime;
            recovery.error = recoveryError;
            
            this.emit('recovery-failed', recovery);
            
            // Try fallback recovery if available
            if (recovery.attempts < recovery.maxAttempts) {
                return this._attemptFallbackRecovery(recovery);
            }
            
            throw recoveryError;
            
        } finally {
            // Move to history and clean up
            this.recoveryHistory.push({ ...recovery });
            this.activeRecoveries.delete(recoveryId);
        }
    }

    /**
     * Execute recovery based on strategy
     * @param {Object} recovery - Recovery information
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeRecovery(recovery) {
        const { error, strategy } = recovery;
        
        switch (strategy) {
            case RecoveryStrategy.IMMEDIATE:
                return this._executeImmediateRecovery(recovery);
                
            case RecoveryStrategy.GRADUAL:
                return this._executeGradualRecovery(recovery);
                
            case RecoveryStrategy.ADAPTIVE:
                return this._executeAdaptiveRecovery(recovery);
                
            case RecoveryStrategy.MANUAL:
                return this._executeManualRecovery(recovery);
                
            default:
                return this._executeImmediateRecovery(recovery);
        }
    }

    /**
     * Execute immediate recovery
     * @param {Object} recovery - Recovery information
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeImmediateRecovery(recovery) {
        const actions = this._getRecoveryActions(recovery.error);
        recovery.actions = actions;
        
        for (const action of actions) {
            if (action.automated) {
                await this._executeRecoveryAction(action, recovery);
            }
        }
        
        // Validate recovery
        const isRecovered = await this._validateRecovery(recovery);
        
        return {
            success: isRecovered,
            strategy: RecoveryStrategy.IMMEDIATE,
            actions: actions.map(a => a.type),
            validated: isRecovered
        };
    }

    /**
     * Execute gradual recovery
     * @param {Object} recovery - Recovery information
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeGradualRecovery(recovery) {
        const actions = this._getRecoveryActions(recovery.error);
        recovery.actions = actions;
        
        // Execute actions gradually with validation between each
        for (const action of actions) {
            if (action.automated) {
                await this._executeRecoveryAction(action, recovery);
                
                // Wait and validate
                await this._delay(5000); // 5 second delay
                const isRecovered = await this._validateRecovery(recovery);
                
                if (isRecovered) {
                    return {
                        success: true,
                        strategy: RecoveryStrategy.GRADUAL,
                        actions: [action.type],
                        validated: true
                    };
                }
            }
        }
        
        return {
            success: false,
            strategy: RecoveryStrategy.GRADUAL,
            actions: actions.map(a => a.type),
            validated: false
        };
    }

    /**
     * Execute adaptive recovery
     * @param {Object} recovery - Recovery information
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeAdaptiveRecovery(recovery) {
        // Analyze historical success rates for different actions
        const actions = this._getRecoveryActions(recovery.error);
        const sortedActions = this._sortActionsBySuccessRate(actions, recovery.error);
        
        recovery.actions = sortedActions;
        
        // Try actions in order of success rate
        for (const action of sortedActions) {
            if (action.automated) {
                await this._executeRecoveryAction(action, recovery);
                
                const isRecovered = await this._validateRecovery(recovery);
                if (isRecovered) {
                    // Update success rate for this action
                    this._updateActionSuccessRate(action.type, recovery.error, true);
                    
                    return {
                        success: true,
                        strategy: RecoveryStrategy.ADAPTIVE,
                        actions: [action.type],
                        validated: true
                    };
                } else {
                    this._updateActionSuccessRate(action.type, recovery.error, false);
                }
            }
        }
        
        return {
            success: false,
            strategy: RecoveryStrategy.ADAPTIVE,
            actions: sortedActions.map(a => a.type),
            validated: false
        };
    }

    /**
     * Execute manual recovery
     * @param {Object} recovery - Recovery information
     * @returns {Promise<Object>} Recovery result
     * @private
     */
    async _executeManualRecovery(recovery) {
        const actions = this._getRecoveryActions(recovery.error);
        recovery.actions = actions;
        
        // Execute only automated actions, flag manual ones
        const automatedActions = actions.filter(a => a.automated);
        const manualActions = actions.filter(a => !a.automated);
        
        for (const action of automatedActions) {
            await this._executeRecoveryAction(action, recovery);
        }
        
        // Emit manual intervention required event
        if (manualActions.length > 0) {
            this.emit('manual-intervention-required', {
                recoveryId: recovery.id,
                actions: manualActions,
                error: recovery.error
            });
        }
        
        return {
            success: false,
            strategy: RecoveryStrategy.MANUAL,
            actions: automatedActions.map(a => a.type),
            manualActions: manualActions.map(a => a.type),
            requiresManualIntervention: manualActions.length > 0
        };
    }

    /**
     * Execute specific recovery action
     * @param {Object} action - Recovery action
     * @param {Object} recovery - Recovery context
     * @returns {Promise<void>}
     * @private
     */
    async _executeRecoveryAction(action, recovery) {
        log('info', `Executing recovery action: ${action.type}`, {
            recoveryId: recovery.id,
            source: recovery.error.source
        });

        try {
            switch (action.type) {
                case RecoveryAction.RETRY:
                    await this._executeRetryAction(action, recovery);
                    break;
                    
                case RecoveryAction.FALLBACK:
                    await this._executeFallbackAction(action, recovery);
                    break;
                    
                case RecoveryAction.CIRCUIT_BREAK:
                    await this._executeCircuitBreakAction(action, recovery);
                    break;
                    
                case RecoveryAction.GRACEFUL_DEGRADE:
                    await this._executeGracefulDegradeAction(action, recovery);
                    break;
                    
                case RecoveryAction.REFRESH_CREDENTIALS:
                    await this._executeRefreshCredentialsAction(action, recovery);
                    break;
                    
                case RecoveryAction.CLEAR_CACHE:
                    await this._executeClearCacheAction(action, recovery);
                    break;
                    
                case RecoveryAction.RESTART_SERVICE:
                    await this._executeRestartServiceAction(action, recovery);
                    break;
                    
                default:
                    log('warning', `Unknown recovery action: ${action.type}`);
            }
            
            action.status = 'completed';
            action.completedAt = Date.now();
            
        } catch (actionError) {
            action.status = 'failed';
            action.error = actionError.message;
            action.completedAt = Date.now();
            
            log('error', `Recovery action failed: ${action.type}`, {
                error: actionError.message,
                recoveryId: recovery.id
            });
        }
    }

    /**
     * Validate recovery success
     * @param {Object} recovery - Recovery information
     * @returns {Promise<boolean>} Whether recovery was successful
     * @private
     */
    async _validateRecovery(recovery) {
        const { error } = recovery;
        
        try {
            // Perform validation based on error source
            switch (error.source) {
                case ErrorSource.POSTGRESQL:
                    return this._validateDatabaseRecovery();
                    
                case ErrorSource.LINEAR:
                    return this._validateLinearRecovery();
                    
                case ErrorSource.GITHUB:
                    return this._validateGitHubRecovery();
                    
                case ErrorSource.AGENT_API:
                    return this._validateAgentAPIRecovery();
                    
                case ErrorSource.CLAUDE_CODE:
                    return this._validateClaudeCodeRecovery();
                    
                case ErrorSource.CODEGEN:
                    return this._validateCodegenRecovery();
                    
                default:
                    return this._validateGenericRecovery(error.source);
            }
            
        } catch (validationError) {
            log('error', 'Recovery validation failed', {
                recoveryId: recovery.id,
                error: validationError.message
            });
            return false;
        }
    }

    /**
     * Get recovery strategy for error type
     * @param {Object} error - Error classification
     * @returns {string} Recovery strategy
     * @private
     */
    _getRecoveryStrategy(error) {
        // Check for custom strategy
        const customStrategy = this.recoveryStrategies.get(`${error.source}:${error.category}`);
        if (customStrategy) {
            return customStrategy;
        }
        
        // Default strategies based on error characteristics
        if (error.severity === ErrorSeverity.CRITICAL) {
            return RecoveryStrategy.IMMEDIATE;
        }
        
        if (error.category === ErrorCategory.NETWORK || error.category === ErrorCategory.TIMEOUT) {
            return RecoveryStrategy.GRADUAL;
        }
        
        if (error.category === ErrorCategory.AUTHENTICATION || error.category === ErrorCategory.AUTHORIZATION) {
            return RecoveryStrategy.MANUAL;
        }
        
        return RecoveryStrategy.ADAPTIVE;
    }

    /**
     * Get recovery actions for error
     * @param {Object} error - Error classification
     * @returns {Array} Recovery actions
     * @private
     */
    _getRecoveryActions(error) {
        const actions = [];
        
        switch (error.category) {
            case ErrorCategory.NETWORK:
                actions.push(
                    { type: RecoveryAction.RETRY, automated: true, priority: 1 },
                    { type: RecoveryAction.CIRCUIT_BREAK, automated: true, priority: 2 },
                    { type: RecoveryAction.FALLBACK, automated: true, priority: 3 }
                );
                break;
                
            case ErrorCategory.AUTHENTICATION:
                actions.push(
                    { type: RecoveryAction.REFRESH_CREDENTIALS, automated: true, priority: 1 },
                    { type: RecoveryAction.MANUAL_INTERVENTION, automated: false, priority: 2 }
                );
                break;
                
            case ErrorCategory.RATE_LIMIT:
                actions.push(
                    { type: RecoveryAction.CIRCUIT_BREAK, automated: true, priority: 1 },
                    { type: RecoveryAction.GRACEFUL_DEGRADE, automated: true, priority: 2 }
                );
                break;
                
            case ErrorCategory.TIMEOUT:
                actions.push(
                    { type: RecoveryAction.RETRY, automated: true, priority: 1 },
                    { type: RecoveryAction.GRACEFUL_DEGRADE, automated: true, priority: 2 }
                );
                break;
                
            case ErrorCategory.SERVER_ERROR:
                actions.push(
                    { type: RecoveryAction.RETRY, automated: true, priority: 1 },
                    { type: RecoveryAction.FALLBACK, automated: true, priority: 2 },
                    { type: RecoveryAction.RESTART_SERVICE, automated: false, priority: 3 }
                );
                break;
                
            case ErrorCategory.RESOURCE:
                actions.push(
                    { type: RecoveryAction.CLEAR_CACHE, automated: true, priority: 1 },
                    { type: RecoveryAction.SCALE_RESOURCES, automated: false, priority: 2 }
                );
                break;
                
            default:
                actions.push(
                    { type: RecoveryAction.RETRY, automated: true, priority: 1 },
                    { type: RecoveryAction.MANUAL_INTERVENTION, automated: false, priority: 2 }
                );
        }
        
        return actions.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Initialize default recovery strategies
     * @private
     */
    _initializeDefaultStrategies() {
        // Set default strategies for common error patterns
        this.recoveryStrategies.set(`${ErrorSource.POSTGRESQL}:${ErrorCategory.NETWORK}`, RecoveryStrategy.GRADUAL);
        this.recoveryStrategies.set(`${ErrorSource.LINEAR}:${ErrorCategory.RATE_LIMIT}`, RecoveryStrategy.IMMEDIATE);
        this.recoveryStrategies.set(`${ErrorSource.GITHUB}:${ErrorCategory.RATE_LIMIT}`, RecoveryStrategy.IMMEDIATE);
        this.recoveryStrategies.set(`${ErrorSource.AGENT_API}:${ErrorCategory.TIMEOUT}`, RecoveryStrategy.ADAPTIVE);
    }

    /**
     * Set up event handlers
     * @private
     */
    _setupEventHandlers() {
        // Handle error events from error handler
        this.errorHandler.on('critical-error', (errorInfo) => {
            this.emit('critical-error', errorInfo);
        });
        
        this.errorHandler.on('predictive-failure', (prediction) => {
            this.emit('predictive-failure', prediction);
        });
        
        // Handle circuit breaker events
        this.circuitBreakerManager.on('state-change', (event) => {
            this.emit('circuit-breaker-state-change', event);
        });
    }

    /**
     * Perform periodic health checks
     * @private
     */
    async _performHealthChecks() {
        const sources = Object.values(ErrorSource);
        
        for (const source of sources) {
            try {
                const health = await this._checkServiceHealth(source);
                this.serviceHealth.set(source, health);
                this.lastHealthCheck.set(source, Date.now());
                
                if (!health.healthy) {
                    this.emit('service-unhealthy', {
                        source,
                        health,
                        timestamp: Date.now()
                    });
                }
                
            } catch (error) {
                log('error', `Health check failed for ${source}`, {
                    error: error.message
                });
            }
        }
    }

    /**
     * Check health of specific service
     * @param {string} source - Service source
     * @returns {Promise<Object>} Health information
     * @private
     */
    async _checkServiceHealth(source) {
        // This would be implemented with actual health check logic
        // For now, return a basic health check
        return {
            healthy: true,
            responseTime: Math.random() * 1000,
            lastCheck: Date.now(),
            details: {}
        };
    }

    /**
     * Clean up old recovery records
     * @private
     */
    _cleanupOldRecoveries() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        this.recoveryHistory = this.recoveryHistory.filter(
            recovery => recovery.startTime > cutoff
        );
    }

    // Recovery action implementations
    async _executeRetryAction(action, recovery) {
        // Implementation would depend on the specific operation being retried
        log('info', 'Executing retry action', { recoveryId: recovery.id });
    }

    async _executeFallbackAction(action, recovery) {
        const fallback = this.fallbackServices.get(recovery.error.source);
        if (fallback) {
            log('info', `Switching to fallback service: ${fallback}`, { recoveryId: recovery.id });
        }
    }

    async _executeCircuitBreakAction(action, recovery) {
        const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(recovery.error.source);
        circuitBreaker.forceState('OPEN');
        log('info', `Circuit breaker opened for ${recovery.error.source}`, { recoveryId: recovery.id });
    }

    async _executeGracefulDegradeAction(action, recovery) {
        const currentLevel = this.degradationLevels.get(recovery.error.source) || 0;
        this.degradationLevels.set(recovery.error.source, currentLevel + 1);
        log('info', `Graceful degradation level increased for ${recovery.error.source}`, { 
            recoveryId: recovery.id,
            level: currentLevel + 1
        });
    }

    async _executeRefreshCredentialsAction(action, recovery) {
        log('info', `Refreshing credentials for ${recovery.error.source}`, { recoveryId: recovery.id });
        // Implementation would depend on the specific service
    }

    async _executeClearCacheAction(action, recovery) {
        log('info', `Clearing cache for ${recovery.error.source}`, { recoveryId: recovery.id });
        // Implementation would depend on the specific caching system
    }

    async _executeRestartServiceAction(action, recovery) {
        log('warning', `Service restart required for ${recovery.error.source}`, { recoveryId: recovery.id });
        // This would typically require manual intervention or external orchestration
    }

    // Validation implementations
    async _validateDatabaseRecovery() {
        // Implement database connectivity check
        return true;
    }

    async _validateLinearRecovery() {
        // Implement Linear API connectivity check
        return true;
    }

    async _validateGitHubRecovery() {
        // Implement GitHub API connectivity check
        return true;
    }

    async _validateAgentAPIRecovery() {
        // Implement AgentAPI connectivity check
        return true;
    }

    async _validateClaudeCodeRecovery() {
        // Implement Claude Code connectivity check
        return true;
    }

    async _validateCodegenRecovery() {
        // Implement Codegen connectivity check
        return true;
    }

    async _validateGenericRecovery(source) {
        // Generic validation
        return true;
    }

    // Utility methods
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _generateRecoveryId() {
        return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _sortActionsBySuccessRate(actions, error) {
        // Simplified implementation - in practice, you'd track historical success rates
        return actions.sort((a, b) => a.priority - b.priority);
    }

    _updateActionSuccessRate(actionType, error, success) {
        // Implementation would track success rates for different action types
    }

    _attemptFallbackRecovery(recovery) {
        // Implementation for fallback recovery strategies
        recovery.attempts++;
        return this._executeRecovery(recovery);
    }

    /**
     * Get recovery statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            activeRecoveries: this.activeRecoveries.size,
            totalRecoveries: this.recoveryHistory.length,
            successfulRecoveries: this.recoveryHistory.filter(r => r.status === RecoveryStatus.COMPLETED).length,
            failedRecoveries: this.recoveryHistory.filter(r => r.status === RecoveryStatus.FAILED).length,
            averageRecoveryTime: 0,
            serviceHealth: {}
        };

        // Calculate average recovery time
        const completedRecoveries = this.recoveryHistory.filter(r => r.duration);
        if (completedRecoveries.length > 0) {
            const totalTime = completedRecoveries.reduce((sum, r) => sum + r.duration, 0);
            stats.averageRecoveryTime = totalTime / completedRecoveries.length;
        }

        // Add service health
        for (const [source, health] of this.serviceHealth.entries()) {
            stats.serviceHealth[source] = health;
        }

        return stats;
    }

    /**
     * Get active recoveries
     * @returns {Array} Active recovery operations
     */
    getActiveRecoveries() {
        return Array.from(this.activeRecoveries.values());
    }

    /**
     * Cancel active recovery
     * @param {string} recoveryId - Recovery ID to cancel
     * @returns {boolean} Whether recovery was cancelled
     */
    cancelRecovery(recoveryId) {
        const recovery = this.activeRecoveries.get(recoveryId);
        if (recovery) {
            recovery.status = RecoveryStatus.CANCELLED;
            recovery.endTime = Date.now();
            recovery.duration = recovery.endTime - recovery.startTime;
            
            this.recoveryHistory.push({ ...recovery });
            this.activeRecoveries.delete(recoveryId);
            
            this.emit('recovery-cancelled', recovery);
            return true;
        }
        return false;
    }

    /**
     * Set fallback service
     * @param {string} service - Primary service
     * @param {string} fallback - Fallback service
     */
    setFallbackService(service, fallback) {
        this.fallbackServices.set(service, fallback);
    }

    /**
     * Set recovery strategy for error type
     * @param {string} errorType - Error type (source:category)
     * @param {string} strategy - Recovery strategy
     */
    setRecoveryStrategy(errorType, strategy) {
        this.recoveryStrategies.set(errorType, strategy);
    }

    /**
     * Reset all recovery tracking
     */
    reset() {
        this.activeRecoveries.clear();
        this.recoveryHistory = [];
        this.serviceHealth.clear();
        this.lastHealthCheck.clear();
        this.degradationLevels.clear();
        
        this.errorHandler.reset();
        this.retryManager.reset();
        this.circuitBreakerManager.resetAll();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.errorHandler.destroy();
        this.retryManager.destroy();
        this.circuitBreakerManager.destroy();
        
        this.removeAllListeners();
    }
}

export default RecoveryOrchestrator;

