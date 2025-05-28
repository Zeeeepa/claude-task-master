/**
 * @fileoverview Usage Examples
 * @description Examples demonstrating how to use the Advanced Error Recovery System
 */

import AdvancedErrorRecoverySystem, {
    ErrorSource,
    ErrorCategory,
    RetryStrategy,
    RecoveryStrategy,
    AlertLevel
} from '../index.js';
import { log } from '../../utils/getVersion.js';

/**
 * Basic usage example
 */
export async function basicUsageExample() {
    console.log('\n=== Basic Usage Example ===');
    
    // Initialize the recovery system
    const recoverySystem = new AdvancedErrorRecoverySystem({
        errorHandler: {
            enableRetry: true,
            enableCircuitBreaker: true,
            enablePredictiveFailure: true
        },
        retryManager: {
            enableAdaptive: true,
            maxConcurrentRetries: 5
        },
        errorMonitor: {
            enableRealTimeMonitoring: true,
            enableAlerting: true
        }
    });

    await recoverySystem.initialize();

    // Example operation that might fail
    const unreliableOperation = async () => {
        if (Math.random() < 0.3) {
            throw new Error('Random failure occurred');
        }
        return { success: true, data: 'Operation completed' };
    };

    try {
        // Execute operation with recovery support
        const result = await recoverySystem.executeWithRecovery(unreliableOperation, {
            source: ErrorSource.SYSTEM,
            retry: true,
            retryOptions: {
                maxRetries: 3,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF
            },
            circuitBreaker: 'example-service',
            enableRecovery: true
        });

        console.log('Operation succeeded:', result);
    } catch (error) {
        console.log('Operation failed after recovery attempts:', error.message);
    }

    // Get health report
    const healthReport = recoverySystem.getHealthReport();
    console.log('System Health Score:', healthReport.healthScore);

    await recoverySystem.shutdown();
}

/**
 * Database integration example
 */
export async function databaseIntegrationExample() {
    console.log('\n=== Database Integration Example ===');
    
    const recoverySystem = new AdvancedErrorRecoverySystem({
        errorHandler: {
            enableRetry: true,
            enableCircuitBreaker: true
        },
        retryManager: {
            enableAdaptive: true
        },
        stateManager: {
            enableAutoBackup: true,
            backupStrategy: 'on_change'
        }
    });

    await recoverySystem.initialize();

    // Configure database-specific settings
    recoverySystem.configureIntegration(ErrorSource.POSTGRESQL, {
        circuitBreaker: {
            failureThreshold: 3,
            timeout: 30000,
            strategy: 'failure_count'
        },
        monitoring: {
            thresholds: {
                errorRate: 0.05,
                responseTime: 2000
            }
        },
        recovery: {
            strategies: {
                [ErrorCategory.NETWORK]: RecoveryStrategy.GRADUAL,
                [ErrorCategory.TIMEOUT]: RecoveryStrategy.IMMEDIATE
            }
        }
    });

    // Simulate database operation
    const databaseOperation = async () => {
        // Simulate connection issues
        if (Math.random() < 0.4) {
            const error = new Error('Database connection failed');
            error.code = 'ECONNREFUSED';
            throw error;
        }
        return { rows: [{ id: 1, name: 'test' }] };
    };

    try {
        const result = await recoverySystem.executeWithRecovery(databaseOperation, {
            source: ErrorSource.POSTGRESQL,
            circuitBreaker: 'postgresql-main',
            saveState: true,
            retryOptions: {
                maxRetries: 5,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                policy: 'AGGRESSIVE'
            }
        });

        console.log('Database query succeeded:', result);
    } catch (error) {
        console.log('Database operation failed:', error.message);
    }

    await recoverySystem.shutdown();
}

/**
 * API integration example
 */
export async function apiIntegrationExample() {
    console.log('\n=== API Integration Example ===');
    
    const recoverySystem = new AdvancedErrorRecoverySystem({
        errorHandler: {
            enableRetry: true,
            enableCircuitBreaker: true,
            enableCorrelation: true
        },
        retryManager: {
            enableAdaptive: true,
            enableDeadLetterQueue: true
        },
        errorMonitor: {
            enableRealTimeMonitoring: true,
            enableAlerting: true,
            alertChannels: [AlertLevel.LOG]
        }
    });

    await recoverySystem.initialize();

    // Configure API-specific settings
    recoverySystem.configureIntegration(ErrorSource.LINEAR, {
        circuitBreaker: {
            failureThreshold: 5,
            timeout: 60000,
            strategy: 'failure_rate'
        },
        monitoring: {
            thresholds: {
                errorRate: 0.1,
                responseTime: 3000
            }
        },
        recovery: {
            strategies: {
                [ErrorCategory.RATE_LIMIT]: RecoveryStrategy.IMMEDIATE,
                [ErrorCategory.AUTHENTICATION]: RecoveryStrategy.MANUAL
            },
            fallback: 'linear-backup-api'
        }
    });

    // Simulate API calls
    const apiOperations = [
        () => simulateLinearAPICall('create-issue'),
        () => simulateLinearAPICall('update-issue'),
        () => simulateLinearAPICall('get-issues')
    ];

    for (const operation of apiOperations) {
        try {
            const result = await recoverySystem.executeWithRecovery(operation, {
                source: ErrorSource.LINEAR,
                circuitBreaker: 'linear-api',
                retryOptions: {
                    maxRetries: 3,
                    strategy: RetryStrategy.ADAPTIVE,
                    shouldRetry: (error) => {
                        // Custom retry logic
                        return error.response?.status >= 500 || error.code === 'ECONNRESET';
                    }
                }
            });

            console.log('API call succeeded:', result);
        } catch (error) {
            console.log('API call failed:', error.message);
        }
    }

    // Get monitoring dashboard
    const dashboard = recoverySystem.getDashboardData();
    console.log('Active Alerts:', dashboard.alerts.length);
    console.log('System Success Rate:', dashboard.system.successRate);

    await recoverySystem.shutdown();
}

/**
 * State management example
 */
export async function stateManagementExample() {
    console.log('\n=== State Management Example ===');
    
    const recoverySystem = new AdvancedErrorRecoverySystem({
        stateManager: {
            enableAutoBackup: true,
            enableStateValidation: true,
            backupStrategy: 'periodic',
            backupInterval: 30000,
            maxBackups: 5
        },
        errorHandler: {
            enableRetry: true
        }
    });

    await recoverySystem.initialize();

    // Example of stateful operation
    const statefulOperation = async () => {
        const transactionId = await recoverySystem.stateManager.startTransaction(['user-session', 'cart-data']);
        
        try {
            // Simulate some state changes
            await recoverySystem.stateManager.saveState('user-session', {
                userId: 123,
                sessionId: 'sess_' + Date.now(),
                lastActivity: Date.now()
            });

            await recoverySystem.stateManager.saveState('cart-data', {
                items: [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }],
                total: 29.99
            });

            // Simulate potential failure
            if (Math.random() < 0.3) {
                throw new Error('Transaction processing failed');
            }

            // Commit transaction
            await recoverySystem.stateManager.commitTransaction(transactionId);
            return { success: true, transactionId };

        } catch (error) {
            // Rollback on failure
            await recoverySystem.stateManager.rollbackTransaction(transactionId);
            throw error;
        }
    };

    try {
        const result = await recoverySystem.executeWithRecovery(statefulOperation, {
            source: ErrorSource.SYSTEM,
            saveState: true,
            enableRecovery: true
        });

        console.log('Stateful operation succeeded:', result);

        // Show state information
        const userSession = recoverySystem.stateManager.getStateInfo('user-session');
        console.log('User session state:', userSession);

    } catch (error) {
        console.log('Stateful operation failed:', error.message);
        
        // Attempt state restoration
        try {
            await recoverySystem.stateManager.restoreState('user-session');
            console.log('State restored from backup');
        } catch (restoreError) {
            console.log('State restoration failed:', restoreError.message);
        }
    }

    await recoverySystem.shutdown();
}

/**
 * Monitoring and alerting example
 */
export async function monitoringExample() {
    console.log('\n=== Monitoring and Alerting Example ===');
    
    const recoverySystem = new AdvancedErrorRecoverySystem({
        errorMonitor: {
            enableRealTimeMonitoring: true,
            enableAlerting: true,
            enableTrending: true,
            monitoringInterval: 10000,
            alertThresholds: {
                errorRate: 0.2,
                responseTime: 2000,
                availability: 0.9
            }
        }
    });

    await recoverySystem.initialize();

    // Set up alert handlers
    recoverySystem.errorMonitor.on('alert-created', (alert) => {
        console.log(`🚨 ALERT: ${alert.message} (Level: ${alert.level})`);
    });

    recoverySystem.errorMonitor.on('error-recorded', (event) => {
        console.log(`📊 Error recorded for ${event.source}: ${event.errorInfo.message}`);
    });

    // Simulate various operations with different outcomes
    const operations = [
        { name: 'fast-operation', duration: 100, failureRate: 0.1 },
        { name: 'slow-operation', duration: 3000, failureRate: 0.3 },
        { name: 'unreliable-operation', duration: 500, failureRate: 0.5 }
    ];

    for (let i = 0; i < 20; i++) {
        const operation = operations[i % operations.length];
        
        const testOperation = async () => {
            await new Promise(resolve => setTimeout(resolve, operation.duration));
            
            if (Math.random() < operation.failureRate) {
                throw new Error(`${operation.name} failed`);
            }
            
            return { success: true, operation: operation.name };
        };

        try {
            await recoverySystem.executeWithRecovery(testOperation, {
                source: ErrorSource.SYSTEM,
                operationId: `${operation.name}-${i}`
            });
        } catch (error) {
            // Expected failures for demonstration
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Get final dashboard data
    const dashboard = recoverySystem.getDashboardData();
    console.log('\n📈 Final Dashboard Summary:');
    console.log(`Total Operations: ${dashboard.system.totalOperations}`);
    console.log(`Success Rate: ${(dashboard.system.successRate * 100).toFixed(1)}%`);
    console.log(`Active Alerts: ${dashboard.alerts.length}`);
    console.log(`Health Score: ${(dashboard.system.healthScore * 100).toFixed(1)}%`);

    await recoverySystem.shutdown();
}

// Helper function to simulate API calls
async function simulateLinearAPICall(operation) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    
    // Simulate different types of failures
    const rand = Math.random();
    if (rand < 0.1) {
        const error = new Error('Rate limit exceeded');
        error.response = { status: 429 };
        throw error;
    } else if (rand < 0.2) {
        const error = new Error('Authentication failed');
        error.response = { status: 401 };
        throw error;
    } else if (rand < 0.3) {
        const error = new Error('Server error');
        error.response = { status: 500 };
        throw error;
    }
    
    return { success: true, operation, timestamp: Date.now() };
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🚀 Running Advanced Error Recovery System Examples\n');
    
    try {
        await basicUsageExample();
        await databaseIntegrationExample();
        await apiIntegrationExample();
        await stateManagementExample();
        await monitoringExample();
        
        console.log('\n✅ All examples completed successfully!');
    } catch (error) {
        console.error('\n❌ Example execution failed:', error.message);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

