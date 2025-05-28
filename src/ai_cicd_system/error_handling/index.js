/**
 * @fileoverview Intelligent Error Handling & Auto-Recovery System
 * @description Main integration module for comprehensive error handling and recovery
 */

import { log } from '../../../scripts/modules/utils.js';
import ErrorAnalyzer from './error_analyzer.js';
import RecoveryManager from './recovery_manager.js';
import EscalationEngine from './escalation_engine.js';
import RetryStrategyManager from './retry_strategies.js';
import ContextManager from './context_manager.js';
import AlertSystem from '../notifications/alert_system.js';

/**
 * System states
 */
export const SYSTEM_STATES = {
	IDLE: 'IDLE',
	ANALYZING: 'ANALYZING',
	RECOVERING: 'RECOVERING',
	ESCALATING: 'ESCALATING',
	MONITORING: 'MONITORING'
};

/**
 * Intelligent Error Handling & Auto-Recovery System
 *
 * This is the main orchestrator that coordinates all error handling components:
 * - Error Analysis Engine
 * - Recovery Manager
 * - Escalation Engine
 * - Retry Strategy Manager
 * - Context Manager
 * - Alert System
 */
export class IntelligentErrorHandlingSystem {
	constructor(config = {}) {
		this.config = {
			enableSystem: config.enableSystem !== false,
			enableAnalysis: config.enableAnalysis !== false,
			enableRecovery: config.enableRecovery !== false,
			enableEscalation: config.enableEscalation !== false,
			enableRetry: config.enableRetry !== false,
			enableContext: config.enableContext !== false,
			enableAlerts: config.enableAlerts !== false,
			maxConcurrentOperations: config.maxConcurrentOperations || 10,
			systemTimeout: config.systemTimeout || 300000, // 5 minutes
			...config
		};

		this.state = SYSTEM_STATES.IDLE;
		this.activeOperations = new Map();
		this.systemMetrics = new SystemMetrics();

		// Initialize components
		this.errorAnalyzer = new ErrorAnalyzer(config.errorAnalyzer);
		this.recoveryManager = new RecoveryManager(config.recoveryManager);
		this.escalationEngine = new EscalationEngine(config.escalationEngine);
		this.retryManager = new RetryStrategyManager(config.retryManager);
		this.contextManager = new ContextManager(config.contextManager);
		this.alertSystem = new AlertSystem(config.alertSystem);

		// System initialization
		this._initializeSystem();
	}

	/**
	 * Handle error with comprehensive analysis and recovery
	 * @param {Error} error - The error to handle
	 * @param {Object} context - Error context
	 * @param {Object} options - Handling options
	 * @returns {Promise<Object>} Handling result
	 */
	async handleError(error, context = {}, options = {}) {
		if (!this.config.enableSystem) {
			return { success: false, reason: 'Error handling system disabled' };
		}

		const operationId = this._generateOperationId();
		const startTime = Date.now();

		try {
			// Check system capacity
			if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
				throw new Error('System at maximum capacity');
			}

			// Create operation record
			const operation = {
				id: operationId,
				startTime,
				error: {
					message: error.message,
					name: error.name,
					code: error.code,
					stack: error.stack
				},
				context,
				options,
				state: SYSTEM_STATES.ANALYZING,
				steps: []
			};

			this.activeOperations.set(operationId, operation);
			this.state = SYSTEM_STATES.ANALYZING;

			log('info', 'Starting error handling operation', {
				operationId,
				errorMessage: error.message,
				errorType: error.name
			});

			// Step 1: Create context
			let contextId = null;
			if (this.config.enableContext) {
				contextId = await this.contextManager.createContext(
					'ERROR',
					{ error, context, timestamp: new Date() },
					{ strategy: options.contextStrategy }
				);
				operation.contextId = contextId;
				operation.steps.push({
					step: 'context_created',
					timestamp: new Date(),
					contextId
				});
			}

			// Step 2: Analyze error
			let errorAnalysis = null;
			if (this.config.enableAnalysis) {
				errorAnalysis = await this.errorAnalyzer.analyzeError(error, context);
				operation.errorAnalysis = errorAnalysis;
				operation.steps.push({
					step: 'error_analyzed',
					timestamp: new Date(),
					analysisId: errorAnalysis.id
				});

				// Send error alert
				if (this.config.enableAlerts) {
					await this.alertSystem.sendErrorAlert(
						errorAnalysis,
						options.alertOptions
					);
				}
			}

			// Step 3: Attempt recovery
			let recoveryResult = null;
			if (this.config.enableRecovery && errorAnalysis) {
				operation.state = SYSTEM_STATES.RECOVERING;
				this.state = SYSTEM_STATES.RECOVERING;

				// Update context with analysis
				if (contextId) {
					await this.contextManager.updateContext(contextId, { errorAnalysis });
				}

				recoveryResult = await this.recoveryManager.attemptRecovery(
					errorAnalysis,
					{ ...context, contextId, operationId }
				);
				operation.recoveryResult = recoveryResult;
				operation.steps.push({
					step: 'recovery_attempted',
					timestamp: new Date(),
					success: recoveryResult.success
				});

				// Send recovery alert
				if (this.config.enableAlerts) {
					await this.alertSystem.sendRecoveryAlert(
						recoveryResult,
						options.alertOptions
					);
				}
			}

			// Step 4: Evaluate escalation
			let escalationResult = null;
			if (this.config.enableEscalation && errorAnalysis) {
				operation.state = SYSTEM_STATES.ESCALATING;
				this.state = SYSTEM_STATES.ESCALATING;

				escalationResult = await this.escalationEngine.evaluateEscalation(
					errorAnalysis,
					recoveryResult,
					{ ...context, contextId, operationId }
				);
				operation.escalationResult = escalationResult;
				operation.steps.push({
					step: 'escalation_evaluated',
					timestamp: new Date(),
					required: escalationResult.escalationRequired
				});

				// Send escalation alert if required
				if (escalationResult.escalationRequired && this.config.enableAlerts) {
					const escalation = await this.escalationEngine.escalations.get(
						escalationResult.escalationId
					);
					if (escalation) {
						await this.alertSystem.sendEscalationAlert(
							escalation,
							options.alertOptions
						);
					}
				}
			}

			// Step 5: Finalize operation
			operation.state = SYSTEM_STATES.MONITORING;
			operation.endTime = Date.now();
			operation.duration = operation.endTime - operation.startTime;
			operation.success = recoveryResult?.success || false;

			// Update final context
			if (contextId) {
				await this.contextManager.updateContext(contextId, {
					recoveryResult,
					escalationResult,
					operationComplete: true,
					duration: operation.duration
				});
			}

			// Record metrics
			this.systemMetrics.recordOperation(operation);

			// Create result
			const result = {
				success: operation.success,
				operationId,
				duration: operation.duration,
				errorAnalysis,
				recoveryResult,
				escalationResult,
				contextId,
				steps: operation.steps.length,
				metadata: {
					systemState: this.state,
					activeOperations: this.activeOperations.size
				}
			};

			log('info', 'Error handling operation completed', {
				operationId,
				success: result.success,
				duration: result.duration,
				steps: result.steps
			});

			return result;
		} catch (handlingError) {
			log('error', 'Error handling operation failed', {
				operationId,
				error: handlingError.message,
				originalError: error.message
			});

			// Record failed operation
			this.systemMetrics.recordFailure(operationId, handlingError);

			return {
				success: false,
				operationId,
				error: handlingError.message,
				originalError: error.message,
				duration: Date.now() - startTime
			};
		} finally {
			// Cleanup
			this.activeOperations.delete(operationId);
			if (this.activeOperations.size === 0) {
				this.state = SYSTEM_STATES.IDLE;
			}
		}
	}

	/**
	 * Execute operation with retry and error handling
	 * @param {Function} operation - Operation to execute
	 * @param {Object} options - Execution options
	 * @returns {Promise<any>} Operation result
	 */
	async executeWithErrorHandling(operation, options = {}) {
		const retryConfig = {
			maxRetries: options.maxRetries || 3,
			strategy: options.retryStrategy || 'EXPONENTIAL_BACKOFF',
			...options.retryConfig
		};

		const context = {
			operationKey: options.operationKey || 'default',
			errorCategory: options.errorCategory,
			...options.context
		};

		try {
			if (this.config.enableRetry) {
				return await this.retryManager.executeWithRetry(
					operation,
					retryConfig,
					context
				);
			} else {
				return await operation();
			}
		} catch (error) {
			// Handle the error through the comprehensive system
			const handlingResult = await this.handleError(error, context, options);

			// If recovery was successful, the error might have been resolved
			if (handlingResult.success && handlingResult.recoveryResult?.success) {
				// Attempt the operation again after successful recovery
				try {
					return await operation();
				} catch (retryError) {
					// If it still fails, throw the original error
					throw error;
				}
			}

			// If no recovery or recovery failed, throw the original error
			throw error;
		}
	}

	/**
	 * Get system status and health
	 * @returns {Object} System status
	 */
	getSystemStatus() {
		return {
			state: this.state,
			enabled: this.config.enableSystem,
			activeOperations: this.activeOperations.size,
			maxConcurrentOperations: this.config.maxConcurrentOperations,
			components: {
				errorAnalyzer: {
					enabled: this.config.enableAnalysis,
					statistics: this.errorAnalyzer.getStatistics()
				},
				recoveryManager: {
					enabled: this.config.enableRecovery,
					state: this.recoveryManager.getState(),
					statistics: this.recoveryManager.getStatistics()
				},
				escalationEngine: {
					enabled: this.config.enableEscalation,
					activeEscalations:
						this.escalationEngine.getActiveEscalations().length,
					statistics: this.escalationEngine.getStatistics()
				},
				retryManager: {
					enabled: this.config.enableRetry,
					statistics: this.retryManager.getStatistics()
				},
				contextManager: {
					enabled: this.config.enableContext,
					statistics: this.contextManager.getStatistics()
				},
				alertSystem: {
					enabled: this.config.enableAlerts,
					activeAlerts: this.alertSystem.getActiveAlerts().length,
					statistics: this.alertSystem.getStatistics()
				}
			},
			metrics: this.systemMetrics.getMetrics(),
			uptime: Date.now() - this.systemMetrics.startTime
		};
	}

	/**
	 * Get comprehensive system statistics
	 * @returns {Object} System statistics
	 */
	getStatistics() {
		const status = this.getSystemStatus();

		return {
			overview: {
				totalOperations: this.systemMetrics.totalOperations,
				successfulOperations: this.systemMetrics.successfulOperations,
				failedOperations: this.systemMetrics.failedOperations,
				successRate: this.systemMetrics.getSuccessRate(),
				averageDuration: this.systemMetrics.getAverageDuration(),
				uptime: status.uptime
			},
			components: status.components,
			performance: {
				operationsPerMinute: this.systemMetrics.getOperationsPerMinute(),
				errorRate: this.systemMetrics.getErrorRate(),
				recoveryRate: this.systemMetrics.getRecoveryRate(),
				escalationRate: this.systemMetrics.getEscalationRate()
			},
			health: {
				systemState: status.state,
				componentHealth: this._assessComponentHealth(),
				overallHealth: this._assessOverallHealth()
			}
		};
	}

	/**
	 * Reset the entire system
	 * @param {Object} options - Reset options
	 */
	async reset(options = {}) {
		log('info', 'Resetting error handling system', options);

		// Wait for active operations to complete or timeout
		if (this.activeOperations.size > 0 && !options.force) {
			const timeout = options.timeout || 30000;
			const startTime = Date.now();

			while (
				this.activeOperations.size > 0 &&
				Date.now() - startTime < timeout
			) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		// Force clear active operations if needed
		if (options.force) {
			this.activeOperations.clear();
		}

		// Reset all components
		this.errorAnalyzer.errorHistory = [];
		this.recoveryManager.reset();
		this.escalationEngine.reset();
		this.retryManager.reset();
		this.contextManager.reset();
		this.alertSystem.reset();
		this.systemMetrics.reset();

		this.state = SYSTEM_STATES.IDLE;

		log('info', 'Error handling system reset completed');
	}

	/**
	 * Initialize the system
	 * @private
	 */
	_initializeSystem() {
		this.systemMetrics.startTime = Date.now();

		log('info', 'Intelligent Error Handling System initialized', {
			components: {
				errorAnalyzer: this.config.enableAnalysis,
				recoveryManager: this.config.enableRecovery,
				escalationEngine: this.config.enableEscalation,
				retryManager: this.config.enableRetry,
				contextManager: this.config.enableContext,
				alertSystem: this.config.enableAlerts
			}
		});
	}

	/**
	 * Generate unique operation ID
	 * @returns {string} Unique ID
	 * @private
	 */
	_generateOperationId() {
		return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Assess component health
	 * @returns {Object} Component health assessment
	 * @private
	 */
	_assessComponentHealth() {
		const health = {};

		// Check each component
		health.errorAnalyzer = this.config.enableAnalysis ? 'healthy' : 'disabled';
		health.recoveryManager = this.config.enableRecovery
			? 'healthy'
			: 'disabled';
		health.escalationEngine = this.config.enableEscalation
			? 'healthy'
			: 'disabled';
		health.retryManager = this.config.enableRetry ? 'healthy' : 'disabled';
		health.contextManager = this.config.enableContext ? 'healthy' : 'disabled';
		health.alertSystem = this.config.enableAlerts ? 'healthy' : 'disabled';

		return health;
	}

	/**
	 * Assess overall system health
	 * @returns {string} Overall health status
	 * @private
	 */
	_assessOverallHealth() {
		if (!this.config.enableSystem) {
			return 'disabled';
		}

		const successRate = this.systemMetrics.getSuccessRate();
		const errorRate = this.systemMetrics.getErrorRate();

		if (successRate > 0.9 && errorRate < 0.1) {
			return 'excellent';
		} else if (successRate > 0.8 && errorRate < 0.2) {
			return 'good';
		} else if (successRate > 0.6 && errorRate < 0.4) {
			return 'fair';
		} else {
			return 'poor';
		}
	}
}

/**
 * System Metrics for tracking performance and health
 */
class SystemMetrics {
	constructor() {
		this.reset();
	}

	/**
	 * Record completed operation
	 * @param {Object} operation - Operation record
	 */
	recordOperation(operation) {
		this.totalOperations++;

		if (operation.success) {
			this.successfulOperations++;
		} else {
			this.failedOperations++;
		}

		this.totalDuration += operation.duration;
		this.operations.push({
			id: operation.id,
			timestamp: operation.endTime,
			duration: operation.duration,
			success: operation.success,
			steps: operation.steps.length
		});

		this._pruneOperations();
	}

	/**
	 * Record failed operation
	 * @param {string} operationId - Operation ID
	 * @param {Error} error - Error that caused failure
	 */
	recordFailure(operationId, error) {
		this.totalOperations++;
		this.failedOperations++;

		this.operations.push({
			id: operationId,
			timestamp: Date.now(),
			success: false,
			error: error.message
		});

		this._pruneOperations();
	}

	/**
	 * Get success rate
	 * @returns {number} Success rate (0-1)
	 */
	getSuccessRate() {
		return this.totalOperations > 0
			? this.successfulOperations / this.totalOperations
			: 0;
	}

	/**
	 * Get average operation duration
	 * @returns {number} Average duration in milliseconds
	 */
	getAverageDuration() {
		return this.successfulOperations > 0
			? this.totalDuration / this.successfulOperations
			: 0;
	}

	/**
	 * Get operations per minute
	 * @returns {number} Operations per minute
	 */
	getOperationsPerMinute() {
		const uptime = Date.now() - this.startTime;
		const minutes = uptime / 60000;
		return minutes > 0 ? this.totalOperations / minutes : 0;
	}

	/**
	 * Get error rate
	 * @returns {number} Error rate (0-1)
	 */
	getErrorRate() {
		return this.totalOperations > 0
			? this.failedOperations / this.totalOperations
			: 0;
	}

	/**
	 * Get recovery rate
	 * @returns {number} Recovery rate (0-1)
	 */
	getRecoveryRate() {
		// This would be calculated based on recovery success data
		return 0.8; // Placeholder
	}

	/**
	 * Get escalation rate
	 * @returns {number} Escalation rate (0-1)
	 */
	getEscalationRate() {
		// This would be calculated based on escalation data
		return 0.1; // Placeholder
	}

	/**
	 * Get all metrics
	 * @returns {Object} All metrics
	 */
	getMetrics() {
		return {
			totalOperations: this.totalOperations,
			successfulOperations: this.successfulOperations,
			failedOperations: this.failedOperations,
			totalDuration: this.totalDuration,
			successRate: this.getSuccessRate(),
			averageDuration: this.getAverageDuration(),
			operationsPerMinute: this.getOperationsPerMinute(),
			errorRate: this.getErrorRate(),
			recoveryRate: this.getRecoveryRate(),
			escalationRate: this.getEscalationRate(),
			recentOperations: this.operations.slice(-10)
		};
	}

	/**
	 * Reset metrics
	 */
	reset() {
		this.startTime = Date.now();
		this.totalOperations = 0;
		this.successfulOperations = 0;
		this.failedOperations = 0;
		this.totalDuration = 0;
		this.operations = [];
	}

	/**
	 * Prune old operations to prevent memory leaks
	 * @private
	 */
	_pruneOperations() {
		const maxOperations = 1000;
		if (this.operations.length > maxOperations) {
			this.operations = this.operations.slice(-maxOperations);
		}
	}
}

// Export all components for individual use
export {
	ErrorAnalyzer,
	RecoveryManager,
	EscalationEngine,
	RetryStrategyManager,
	ContextManager,
	AlertSystem
};

// Export the main system as default
export default IntelligentErrorHandlingSystem;
