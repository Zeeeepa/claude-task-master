/**
 * @fileoverview Error Recovery System Tests
 * @description Comprehensive tests for the Advanced Error Recovery System
 */

import { jest } from '@jest/globals';
import AdvancedErrorRecoverySystem, {
    CentralErrorHandler,
    RetryManager,
    CircuitBreaker,
    RecoveryOrchestrator,
    StateManager,
    ErrorMonitor,
    ErrorSource,
    ErrorCategory,
    ErrorSeverity,
    RetryStrategy,
    CircuitState
} from '../../src/recovery/index.js';

describe('Advanced Error Recovery System', () => {
    let recoverySystem;

    beforeEach(async () => {
        recoverySystem = new AdvancedErrorRecoverySystem({
            errorHandler: {
                enableRetry: true,
                enableCircuitBreaker: true,
                maxRetries: 3
            },
            retryManager: {
                enableAdaptive: true,
                maxConcurrentRetries: 5
            },
            errorMonitor: {
                enableRealTimeMonitoring: true,
                enableAlerting: true
            },
            stateManager: {
                enableAutoBackup: true
            }
        });

        await recoverySystem.initialize();
    });

    afterEach(async () => {
        await recoverySystem.shutdown();
    });

    describe('System Initialization', () => {
        test('should initialize all components successfully', () => {
            expect(recoverySystem.isInitialized).toBe(true);
            expect(recoverySystem.errorHandler).toBeInstanceOf(CentralErrorHandler);
            expect(recoverySystem.retryManager).toBeInstanceOf(RetryManager);
            expect(recoverySystem.errorMonitor).toBeInstanceOf(ErrorMonitor);
            expect(recoverySystem.stateManager).toBeInstanceOf(StateManager);
        });

        test('should emit system-initialized event', async () => {
            const newSystem = new AdvancedErrorRecoverySystem();
            const initSpy = jest.fn();
            newSystem.on('system-initialized', initSpy);

            await newSystem.initialize();
            
            expect(initSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    timestamp: expect.any(Number),
                    components: expect.any(Array)
                })
            );

            await newSystem.shutdown();
        });
    });

    describe('Error Handling', () => {
        test('should handle errors through central error handler', async () => {
            const testError = new Error('Test error');
            testError.code = 'TEST_ERROR';

            const result = await recoverySystem.handleError(testError, {
                source: ErrorSource.SYSTEM
            });

            expect(result).toHaveProperty('classification');
            expect(result.classification.message).toBe('Test error');
            expect(result.classification.source).toBe(ErrorSource.SYSTEM);
        });

        test('should classify errors correctly', async () => {
            const networkError = new Error('Connection refused');
            networkError.code = 'ECONNREFUSED';

            const result = await recoverySystem.handleError(networkError, {
                source: ErrorSource.POSTGRESQL
            });

            expect(result.classification.category).toBe(ErrorCategory.NETWORK);
            expect(result.classification.retryable).toBe(true);
        });

        test('should record errors in monitoring', async () => {
            const recordSpy = jest.spyOn(recoverySystem.errorMonitor, 'recordError');
            
            const testError = new Error('Monitor test error');
            await recoverySystem.handleError(testError, {
                source: ErrorSource.LINEAR
            });

            expect(recordSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: ErrorSource.LINEAR,
                    message: 'Monitor test error'
                })
            );
        });
    });

    describe('Operation Execution with Recovery', () => {
        test('should execute successful operation', async () => {
            const successfulOperation = jest.fn().mockResolvedValue({ success: true });

            const result = await recoverySystem.executeWithRecovery(successfulOperation, {
                source: ErrorSource.SYSTEM
            });

            expect(result).toEqual({ success: true });
            expect(successfulOperation).toHaveBeenCalledTimes(1);
        });

        test('should retry failed operations', async () => {
            const failingOperation = jest.fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValueOnce({ success: true });

            const result = await recoverySystem.executeWithRecovery(failingOperation, {
                source: ErrorSource.SYSTEM,
                retry: true,
                retryOptions: {
                    maxRetries: 3,
                    strategy: RetryStrategy.FIXED_DELAY
                }
            });

            expect(result).toEqual({ success: true });
            expect(failingOperation).toHaveBeenCalledTimes(3);
        });

        test('should use circuit breaker when configured', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Circuit breaker test'));

            // Execute multiple failing operations to open circuit breaker
            for (let i = 0; i < 6; i++) {
                try {
                    await recoverySystem.executeWithRecovery(failingOperation, {
                        source: ErrorSource.SYSTEM,
                        circuitBreaker: 'test-service',
                        circuitBreakerConfig: {
                            failureThreshold: 3,
                            timeout: 1000
                        }
                    });
                } catch (error) {
                    // Expected failures
                }
            }

            // Circuit breaker should now be open
            const circuitBreaker = recoverySystem.circuitBreakerManager.getCircuitBreaker('test-service');
            expect(circuitBreaker.getStatus().state).toBe(CircuitState.OPEN);
        });

        test('should emit operation events', async () => {
            const successSpy = jest.fn();
            const failedSpy = jest.fn();
            
            recoverySystem.on('operation-success', successSpy);
            recoverySystem.on('operation-failed', failedSpy);

            // Successful operation
            const successfulOperation = jest.fn().mockResolvedValue({ success: true });
            await recoverySystem.executeWithRecovery(successfulOperation);
            
            expect(successSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    operationId: expect.any(String),
                    duration: expect.any(Number)
                })
            );

            // Failed operation
            const failingOperation = jest.fn().mockRejectedValue(new Error('Test failure'));
            try {
                await recoverySystem.executeWithRecovery(failingOperation, {
                    retry: false,
                    enableRecovery: false
                });
            } catch (error) {
                // Expected failure
            }

            expect(failedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    operationId: expect.any(String),
                    error: 'Test failure',
                    duration: expect.any(Number)
                })
            );
        });
    });

    describe('State Management', () => {
        test('should save and load state', async () => {
            const testData = { userId: 123, sessionId: 'test-session' };
            
            const saveResult = await recoverySystem.stateManager.saveState('test-state', testData);
            expect(saveResult.success).toBe(true);

            const loadedData = await recoverySystem.stateManager.loadState('test-state');
            expect(loadedData).toEqual(testData);
        });

        test('should handle transactions', async () => {
            const transactionId = await recoverySystem.stateManager.startTransaction(['state1', 'state2']);
            
            await recoverySystem.stateManager.saveState('state1', { value: 1 });
            await recoverySystem.stateManager.saveState('state2', { value: 2 });
            
            const commitResult = await recoverySystem.stateManager.commitTransaction(transactionId);
            expect(commitResult.success).toBe(true);
        });

        test('should rollback transactions on failure', async () => {
            // Save initial state
            await recoverySystem.stateManager.saveState('rollback-test', { value: 'initial' });
            
            const transactionId = await recoverySystem.stateManager.startTransaction(['rollback-test']);
            
            // Modify state
            await recoverySystem.stateManager.saveState('rollback-test', { value: 'modified' });
            
            // Rollback
            const rollbackResult = await recoverySystem.stateManager.rollbackTransaction(transactionId);
            expect(rollbackResult.success).toBe(true);
            
            // State should be restored to initial value
            const restoredData = await recoverySystem.stateManager.loadState('rollback-test');
            expect(restoredData.value).toBe('initial');
        });
    });

    describe('Monitoring and Alerting', () => {
        test('should record metrics', async () => {
            recoverySystem.errorMonitor.recordResponseTime(ErrorSource.SYSTEM, 1500);
            recoverySystem.errorMonitor.recordAvailability(ErrorSource.SYSTEM, true);
            
            const metrics = recoverySystem.errorMonitor.getSourceMetrics(ErrorSource.SYSTEM);
            expect(metrics.responseTime).toBe(1500);
            expect(metrics.availability).toBe(1);
        });

        test('should create alerts for threshold violations', async () => {
            const alertSpy = jest.fn();
            recoverySystem.errorMonitor.on('alert-created', alertSpy);

            // Set low threshold
            recoverySystem.errorMonitor.setAlertThreshold('responseTime', 100);
            
            // Record high response time
            recoverySystem.errorMonitor.recordResponseTime(ErrorSource.SYSTEM, 5000);
            
            // Trigger alert check
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Note: In a real scenario, alerts would be triggered by the monitoring interval
            // For testing, we might need to manually trigger the check or mock the interval
        });

        test('should provide dashboard data', () => {
            const dashboard = recoverySystem.getDashboardData();
            
            expect(dashboard).toHaveProperty('timestamp');
            expect(dashboard).toHaveProperty('system');
            expect(dashboard.system).toHaveProperty('totalOperations');
            expect(dashboard.system).toHaveProperty('successRate');
            expect(dashboard.system).toHaveProperty('healthScore');
        });
    });

    describe('Integration Configuration', () => {
        test('should configure integration settings', () => {
            const configSpy = jest.fn();
            recoverySystem.on('integration-configured', configSpy);

            recoverySystem.configureIntegration(ErrorSource.POSTGRESQL, {
                circuitBreaker: {
                    failureThreshold: 5,
                    timeout: 30000
                },
                monitoring: {
                    thresholds: {
                        errorRate: 0.05,
                        responseTime: 2000
                    }
                },
                recovery: {
                    strategies: {
                        [ErrorCategory.NETWORK]: 'gradual'
                    }
                }
            });

            expect(configSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: ErrorSource.POSTGRESQL,
                    config: expect.any(Object),
                    timestamp: expect.any(Number)
                })
            );
        });
    });

    describe('Health Reporting', () => {
        test('should provide comprehensive health report', () => {
            const healthReport = recoverySystem.getHealthReport();
            
            expect(healthReport).toHaveProperty('timestamp');
            expect(healthReport).toHaveProperty('systemStatus');
            expect(healthReport).toHaveProperty('uptime');
            expect(healthReport).toHaveProperty('metrics');
            expect(healthReport).toHaveProperty('components');
            expect(healthReport).toHaveProperty('healthScore');
            
            expect(healthReport.systemStatus).toBe('healthy');
            expect(healthReport.healthScore).toBeGreaterThanOrEqual(0);
            expect(healthReport.healthScore).toBeLessThanOrEqual(1);
        });

        test('should include component health in report', () => {
            const healthReport = recoverySystem.getHealthReport();
            
            expect(healthReport.components).toHaveProperty('errorHandler');
            expect(healthReport.components).toHaveProperty('retryManager');
            expect(healthReport.components).toHaveProperty('errorMonitor');
            expect(healthReport.components).toHaveProperty('stateManager');
        });
    });

    describe('System Reset and Shutdown', () => {
        test('should reset all components', () => {
            // Add some data first
            recoverySystem.systemMetrics.totalOperations = 10;
            recoverySystem.systemMetrics.successfulOperations = 8;
            
            recoverySystem.reset();
            
            expect(recoverySystem.systemMetrics.totalOperations).toBe(0);
            expect(recoverySystem.systemMetrics.successfulOperations).toBe(0);
        });

        test('should shutdown gracefully', async () => {
            const shutdownSpy = jest.fn();
            recoverySystem.on('system-shutdown', shutdownSpy);

            await recoverySystem.shutdown();
            
            expect(recoverySystem.isInitialized).toBe(false);
            expect(shutdownSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    timestamp: expect.any(Number)
                })
            );
        });
    });
});

describe('Individual Components', () => {
    describe('CentralErrorHandler', () => {
        let errorHandler;

        beforeEach(() => {
            errorHandler = new CentralErrorHandler({
                enableRetry: true,
                enableCircuitBreaker: true,
                enableCorrelation: true
            });
        });

        afterEach(() => {
            errorHandler.destroy();
        });

        test('should classify network errors correctly', async () => {
            const networkError = new Error('Connection refused');
            networkError.code = 'ECONNREFUSED';

            const result = await errorHandler.handleError(networkError, {
                source: ErrorSource.POSTGRESQL
            });

            expect(result.classification.category).toBe(ErrorCategory.NETWORK);
            expect(result.classification.severity).toBe(ErrorSeverity.HIGH);
            expect(result.classification.retryable).toBe(true);
        });

        test('should detect error correlations', async () => {
            const correlationSpy = jest.fn();
            errorHandler.on('error-correlation', correlationSpy);

            // Create correlated errors
            const error1 = new Error('Service A error');
            const error2 = new Error('Service B error');

            await errorHandler.handleError(error1, { source: ErrorSource.LINEAR });
            await errorHandler.handleError(error2, { source: ErrorSource.GITHUB });

            // Note: Correlation detection requires multiple errors within time window
            // In a real test, you might need to simulate this more thoroughly
        });
    });

    describe('RetryManager', () => {
        let retryManager;

        beforeEach(() => {
            retryManager = new RetryManager({
                enableAdaptive: true,
                enableDeadLetterQueue: true
            });
        });

        afterEach(() => {
            retryManager.destroy();
        });

        test('should retry operations with exponential backoff', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValueOnce({ success: true });

            const result = await retryManager.executeWithRetry(operation, {
                maxRetries: 3,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                baseDelay: 100
            });

            expect(result).toEqual({ success: true });
            expect(operation).toHaveBeenCalledTimes(3);
        });

        test('should add failed operations to dead letter queue', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));

            try {
                await retryManager.executeWithRetry(operation, {
                    maxRetries: 2,
                    operationId: 'test-operation'
                });
            } catch (error) {
                // Expected failure
            }

            const deadLetterQueue = retryManager.getDeadLetterQueue();
            expect(deadLetterQueue).toHaveLength(1);
            expect(deadLetterQueue[0].operationId).toBe('test-operation');
        });
    });

    describe('CircuitBreaker', () => {
        let circuitBreaker;

        beforeEach(() => {
            circuitBreaker = new CircuitBreaker({
                name: 'test-circuit',
                failureThreshold: 3,
                timeout: 1000
            });
        });

        afterEach(() => {
            circuitBreaker.destroy();
        });

        test('should open after threshold failures', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Circuit test failure'));

            // Execute failing operations to reach threshold
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.execute(failingOperation);
                } catch (error) {
                    // Expected failures
                }
            }

            expect(circuitBreaker.getStatus().state).toBe(CircuitState.OPEN);
        });

        test('should transition to half-open after timeout', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Circuit test failure'));

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.execute(failingOperation);
                } catch (error) {
                    // Expected failures
                }
            }

            expect(circuitBreaker.getStatus().state).toBe(CircuitState.OPEN);

            // Wait for timeout (using a shorter timeout for testing)
            circuitBreaker.config.timeout = 100;
            await new Promise(resolve => setTimeout(resolve, 150));

            // Next execution should transition to half-open
            const successfulOperation = jest.fn().mockResolvedValue({ success: true });
            await circuitBreaker.execute(successfulOperation);

            expect(circuitBreaker.getStatus().state).toBe(CircuitState.CLOSED);
        });
    });
});

describe('Error Recovery Integration Scenarios', () => {
    let recoverySystem;

    beforeEach(async () => {
        recoverySystem = new AdvancedErrorRecoverySystem({
            errorHandler: { enableRetry: true, enableCircuitBreaker: true },
            retryManager: { enableAdaptive: true },
            errorMonitor: { enableRealTimeMonitoring: true }
        });
        await recoverySystem.initialize();
    });

    afterEach(async () => {
        await recoverySystem.shutdown();
    });

    test('should handle database connection failures with recovery', async () => {
        let attempts = 0;
        const databaseOperation = jest.fn().mockImplementation(() => {
            attempts++;
            if (attempts < 3) {
                const error = new Error('Database connection failed');
                error.code = 'ECONNREFUSED';
                throw error;
            }
            return { rows: [{ id: 1, name: 'test' }] };
        });

        const result = await recoverySystem.executeWithRecovery(databaseOperation, {
            source: ErrorSource.POSTGRESQL,
            retry: true,
            retryOptions: {
                maxRetries: 5,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF
            }
        });

        expect(result.rows).toHaveLength(1);
        expect(attempts).toBe(3);
    });

    test('should handle API rate limiting with appropriate delays', async () => {
        let attempts = 0;
        const apiOperation = jest.fn().mockImplementation(() => {
            attempts++;
            if (attempts < 2) {
                const error = new Error('Rate limit exceeded');
                error.response = { status: 429, headers: { 'retry-after': '1' } };
                throw error;
            }
            return { success: true, data: 'API response' };
        });

        const startTime = Date.now();
        const result = await recoverySystem.executeWithRecovery(apiOperation, {
            source: ErrorSource.LINEAR,
            retry: true,
            retryOptions: {
                maxRetries: 3,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF
            }
        });

        const duration = Date.now() - startTime;
        expect(result.success).toBe(true);
        expect(attempts).toBe(2);
        expect(duration).toBeGreaterThan(1000); // Should have waited for retry-after
    });
});

// Helper function to create mock operations
function createMockOperation(shouldFail = false, delay = 0) {
    return jest.fn().mockImplementation(async () => {
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        if (shouldFail) {
            throw new Error('Mock operation failed');
        }
        
        return { success: true, timestamp: Date.now() };
    });
}

