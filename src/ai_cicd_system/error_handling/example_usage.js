/**
 * @fileoverview Example Usage of Intelligent Error Handling System
 * @description Demonstrates various use cases and features of the error handling system
 */

import IntelligentErrorHandlingSystem from './index.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Example usage and demonstrations of the error handling system
 */
export class ErrorHandlingExamples {
    constructor() {
        this.errorSystem = new IntelligentErrorHandlingSystem({
            enableAnalysis: true,
            enableRecovery: true,
            enableEscalation: true,
            enableRetry: true,
            enableContext: true,
            enableAlerts: true,
            
            // Custom configuration for examples
            errorAnalyzer: {
                enablePatternLearning: true,
                enableContextExtraction: true,
                maxStackTraceDepth: 5
            },
            
            recoveryManager: {
                maxRecoveryAttempts: 3,
                recoveryTimeout: 30000
            },
            
            retryManager: {
                defaultMaxRetries: 3,
                defaultBaseDelay: 1000,
                enableAdaptive: true
            },
            
            alertSystem: {
                defaultChannels: ['console'],
                rateLimiting: {
                    maxAlertsPerMinute: 5
                }
            }
        });
    }

    /**
     * Example 1: Basic error handling
     */
    async basicErrorHandling() {
        console.log('\n=== Example 1: Basic Error Handling ===');
        
        try {
            // Simulate a network error
            const networkError = new Error('Connection refused');
            networkError.code = 'ECONNREFUSED';
            
            const result = await this.errorSystem.handleError(networkError, {
                operation: 'api_call',
                endpoint: 'https://api.example.com/data',
                method: 'GET'
            });
            
            console.log('Error handling result:', {
                success: result.success,
                operationId: result.operationId,
                duration: result.duration,
                steps: result.steps
            });
            
        } catch (error) {
            console.error('Error in basic example:', error.message);
        }
    }

    /**
     * Example 2: Execute with auto-recovery
     */
    async executeWithAutoRecovery() {
        console.log('\n=== Example 2: Execute with Auto-Recovery ===');
        
        let attemptCount = 0;
        
        const result = await this.errorSystem.executeWithErrorHandling(
            async () => {
                attemptCount++;
                console.log(`Attempt ${attemptCount}`);
                
                // Simulate intermittent failure
                if (attemptCount < 3) {
                    const error = new Error('Temporary service unavailable');
                    error.code = 'SERVICE_UNAVAILABLE';
                    throw error;
                }
                
                return { success: true, data: 'Operation completed successfully' };
            },
            {
                maxRetries: 5,
                retryStrategy: 'EXPONENTIAL_BACKOFF',
                errorCategory: 'NETWORK_ERROR',
                operationKey: 'service_call'
            }
        );
        
        console.log('Operation result:', result);
        console.log('Total attempts:', attemptCount);
    }

    /**
     * Example 3: Different error categories
     */
    async demonstrateErrorCategories() {
        console.log('\n=== Example 3: Different Error Categories ===');
        
        const errorTypes = [
            {
                name: 'Syntax Error',
                error: new SyntaxError('Unexpected token'),
                context: { file: 'app.js', line: 42 }
            },
            {
                name: 'Authentication Error',
                error: Object.assign(new Error('Unauthorized'), { code: 401 }),
                context: { endpoint: '/api/secure', token: 'invalid' }
            },
            {
                name: 'Rate Limit Error',
                error: Object.assign(new Error('Too Many Requests'), { code: 429 }),
                context: { endpoint: '/api/data', requestsPerMinute: 100 }
            },
            {
                name: 'Timeout Error',
                error: Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' }),
                context: { timeout: 5000, operation: 'database_query' }
            }
        ];
        
        for (const { name, error, context } of errorTypes) {
            console.log(`\n--- ${name} ---`);
            
            const result = await this.errorSystem.handleError(error, context);
            
            console.log('Analysis:', {
                category: result.errorAnalysis?.classification.category,
                severity: result.errorAnalysis?.severity,
                retryable: result.errorAnalysis?.retryable,
                escalationRequired: result.errorAnalysis?.escalationRequired
            });
        }
    }

    /**
     * Example 4: Pattern detection
     */
    async demonstratePatternDetection() {
        console.log('\n=== Example 4: Pattern Detection ===');
        
        // Simulate recurring errors
        const recurringError = new Error('Database connection failed');
        recurringError.code = 'ECONNREFUSED';
        
        const context = {
            database: 'primary',
            operation: 'user_query'
        };
        
        console.log('Simulating recurring errors...');
        
        for (let i = 1; i <= 5; i++) {
            console.log(`\nOccurrence ${i}:`);
            
            const result = await this.errorSystem.handleError(recurringError, {
                ...context,
                occurrence: i,
                timestamp: new Date()
            });
            
            if (result.errorAnalysis?.patterns.isRecurring) {
                console.log('Pattern detected!', {
                    frequency: result.errorAnalysis.patterns.frequency,
                    escalationRequired: result.escalationResult?.escalationRequired
                });
            }
        }
    }

    /**
     * Example 5: Context preservation
     */
    async demonstrateContextPreservation() {
        console.log('\n=== Example 5: Context Preservation ===');
        
        const error = new Error('Processing failed');
        const largeContext = {
            userId: 'user123',
            sessionId: 'session456',
            requestData: {
                items: Array.from({ length: 100 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`,
                    data: `Large data string for item ${i}`.repeat(10)
                }))
            },
            metadata: {
                timestamp: new Date(),
                version: '1.0.0',
                environment: 'production'
            }
        };
        
        const result = await this.errorSystem.handleError(error, largeContext, {
            contextStrategy: 'SELECTIVE'
        });
        
        console.log('Context handling:', {
            contextId: result.contextId,
            originalSize: JSON.stringify(largeContext).length,
            preserved: result.contextId ? 'Yes' : 'No'
        });
        
        // Retrieve and examine preserved context
        if (result.contextId) {
            const preservedContext = await this.errorSystem.contextManager.getContext(result.contextId);
            console.log('Preserved context size:', JSON.stringify(preservedContext.data).length);
        }
    }

    /**
     * Example 6: Circuit breaker demonstration
     */
    async demonstrateCircuitBreaker() {
        console.log('\n=== Example 6: Circuit Breaker ===');
        
        let callCount = 0;
        
        // Function that always fails
        const failingOperation = async () => {
            callCount++;
            console.log(`Call ${callCount} - Failing...`);
            throw new Error('Service consistently failing');
        };
        
        console.log('Making repeated calls to trigger circuit breaker...');
        
        for (let i = 1; i <= 8; i++) {
            try {
                await this.errorSystem.executeWithErrorHandling(
                    failingOperation,
                    {
                        maxRetries: 1,
                        operationKey: 'failing_service',
                        errorCategory: 'NETWORK_ERROR'
                    }
                );
            } catch (error) {
                console.log(`Attempt ${i}: ${error.message}`);
                
                // Check circuit breaker status
                const stats = this.errorSystem.retryManager.getStatistics();
                const circuitStats = stats.circuitBreakerStats?.failing_service;
                
                if (circuitStats) {
                    console.log(`Circuit breaker state: ${circuitStats.state}`);
                    
                    if (circuitStats.state === 'OPEN') {
                        console.log('Circuit breaker opened! Subsequent calls will be rejected.');
                        break;
                    }
                }
            }
            
            // Small delay between attempts
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Example 7: System monitoring and statistics
     */
    async demonstrateMonitoring() {
        console.log('\n=== Example 7: System Monitoring ===');
        
        // Get system status
        const status = this.errorSystem.getSystemStatus();
        console.log('System Status:', {
            state: status.state,
            activeOperations: status.activeOperations,
            uptime: Math.round(status.uptime / 1000) + 's'
        });
        
        // Get comprehensive statistics
        const stats = this.errorSystem.getStatistics();
        console.log('\nSystem Statistics:', {
            totalOperations: stats.overview.totalOperations,
            successRate: Math.round(stats.overview.successRate * 100) + '%',
            averageDuration: Math.round(stats.overview.averageDuration) + 'ms',
            errorRate: Math.round(stats.performance.errorRate * 100) + '%'
        });
        
        // Component-specific statistics
        console.log('\nComponent Statistics:');
        
        const analyzerStats = this.errorSystem.errorAnalyzer.getStatistics();
        console.log('Error Analyzer:', {
            totalAnalyses: analyzerStats.totalAnalyses,
            averageTime: Math.round(analyzerStats.averageAnalysisTime) + 'ms'
        });
        
        const recoveryStats = this.errorSystem.recoveryManager.getStatistics();
        console.log('Recovery Manager:', {
            totalAttempts: recoveryStats.totalAttempts,
            successRate: Math.round(recoveryStats.successRate * 100) + '%'
        });
        
        const alertStats = this.errorSystem.alertSystem.getStatistics();
        console.log('Alert System:', {
            totalAlerts: alertStats.totalAlerts,
            successRate: Math.round(alertStats.successRate * 100) + '%'
        });
    }

    /**
     * Example 8: Custom error handling workflow
     */
    async demonstrateCustomWorkflow() {
        console.log('\n=== Example 8: Custom Error Handling Workflow ===');
        
        // Simulate a complex operation with multiple potential failure points
        const complexOperation = async () => {
            const steps = [
                { name: 'Validate Input', failureRate: 0.1 },
                { name: 'Database Query', failureRate: 0.2 },
                { name: 'External API Call', failureRate: 0.3 },
                { name: 'Process Data', failureRate: 0.1 },
                { name: 'Save Results', failureRate: 0.1 }
            ];
            
            for (const step of steps) {
                console.log(`Executing: ${step.name}`);
                
                if (Math.random() < step.failureRate) {
                    const error = new Error(`${step.name} failed`);
                    error.step = step.name;
                    error.code = step.name.includes('API') ? 'NETWORK_ERROR' : 'PROCESSING_ERROR';
                    throw error;
                }
                
                // Simulate processing time
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            return { success: true, message: 'All steps completed successfully' };
        };
        
        try {
            const result = await this.errorSystem.executeWithErrorHandling(
                complexOperation,
                {
                    maxRetries: 2,
                    retryStrategy: 'EXPONENTIAL_BACKOFF_WITH_JITTER',
                    operationKey: 'complex_workflow',
                    context: {
                        workflowId: 'workflow_123',
                        userId: 'user456'
                    }
                }
            );
            
            console.log('Complex operation result:', result);
            
        } catch (error) {
            console.log('Complex operation failed after all retries:', error.message);
            
            // The error has been fully analyzed and handled by the system
            // Check if escalation was triggered
            const activeEscalations = this.errorSystem.escalationEngine.getActiveEscalations();
            if (activeEscalations.length > 0) {
                console.log('Escalations created:', activeEscalations.length);
            }
        }
    }

    /**
     * Run all examples
     */
    async runAllExamples() {
        console.log('🔄 Intelligent Error Handling & Auto-Recovery System Examples');
        console.log('================================================================');
        
        try {
            await this.basicErrorHandling();
            await this.executeWithAutoRecovery();
            await this.demonstrateErrorCategories();
            await this.demonstratePatternDetection();
            await this.demonstrateContextPreservation();
            await this.demonstrateCircuitBreaker();
            await this.demonstrateMonitoring();
            await this.demonstrateCustomWorkflow();
            
            console.log('\n=== Final System Statistics ===');
            const finalStats = this.errorSystem.getStatistics();
            console.log('Total operations processed:', finalStats.overview.totalOperations);
            console.log('Overall success rate:', Math.round(finalStats.overview.successRate * 100) + '%');
            console.log('System health:', finalStats.health.overallHealth);
            
        } catch (error) {
            console.error('Error running examples:', error);
        }
    }

    /**
     * Cleanup and reset system
     */
    async cleanup() {
        console.log('\n=== Cleaning up ===');
        await this.errorSystem.reset({ force: true });
        console.log('System reset completed');
    }
}

/**
 * Run examples if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    const examples = new ErrorHandlingExamples();
    
    examples.runAllExamples()
        .then(() => examples.cleanup())
        .then(() => {
            console.log('\n✅ All examples completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Examples failed:', error);
            process.exit(1);
        });
}

export default ErrorHandlingExamples;

