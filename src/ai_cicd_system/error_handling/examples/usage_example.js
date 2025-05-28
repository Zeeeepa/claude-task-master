/**
 * @fileoverview Error Handling System Usage Examples
 * @description Comprehensive examples demonstrating the error handling system capabilities
 */

import { ErrorHandlingSystem } from '../index.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Basic error handling example
 */
export async function basicErrorHandling() {
    console.log('\n=== Basic Error Handling Example ===');
    
    const errorHandler = new ErrorHandlingSystem({
        enableAnalytics: true,
        enablePatternRecognition: false, // Simplified for demo
        enableAutomatedFixes: true,
        enableEscalation: true
    });

    // Simulate various types of errors
    const errors = [
        {
            error: new Error('Connection timeout'),
            context: { operation: 'database_query', environment: 'production' }
        },
        {
            error: Object.assign(new Error('Rate limit exceeded'), { status: 429 }),
            context: { operation: 'api_call', service: 'external_api' }
        },
        {
            error: Object.assign(new Error('Unauthorized'), { status: 401 }),
            context: { operation: 'authentication', user: 'user123' }
        }
    ];

    for (const { error, context } of errors) {
        console.log(`\nHandling error: ${error.message}`);
        
        const result = await errorHandler.handleError(error, context);
        
        console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Method: ${result.resolution?.method || 'none'}`);
        console.log(`Duration: ${result.duration}ms`);
    }

    // Display statistics
    const stats = errorHandler.getStatistics();
    console.log('\nSystem Statistics:');
    console.log(`Total Errors: ${stats.system.totalErrors}`);
    console.log(`Resolved Errors: ${stats.system.resolvedErrors}`);
    console.log(`Resolution Rate: ${(stats.system.resolutionRate * 100).toFixed(1)}%`);
}

/**
 * Advanced pattern recognition example
 */
export async function patternRecognitionExample() {
    console.log('\n=== Pattern Recognition Example ===');
    
    const errorHandler = new ErrorHandlingSystem({
        enablePatternRecognition: true,
        enableAnalytics: true
    });

    // Simulate historical error data
    const historicalErrors = generateHistoricalErrors();
    
    // Feed historical data to analytics
    for (const errorData of historicalErrors) {
        errorHandler.analytics.recordError(
            errorData.errorInfo,
            errorData.context,
            errorData.resolution
        );
    }

    // Analyze patterns
    const patterns = await errorHandler.patternRecognition.analyzePatterns(
        errorHandler.analytics.errorEvents
    );

    console.log(`\nIdentified ${patterns.patterns.length} patterns:`);
    
    for (const pattern of patterns.patterns.slice(0, 3)) {
        console.log(`- ${pattern.type}: ${pattern.description}`);
        console.log(`  Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
        console.log(`  Frequency: ${pattern.frequency}`);
    }

    // Generate predictions
    const currentContext = {
        system: { cpuUsage: 85, memoryUsage: 90 },
        environment: 'production',
        timeOfDay: new Date().getHours()
    };

    const predictions = await errorHandler.predictErrors(currentContext);
    
    console.log(`\nGenerated ${predictions.predictions.length} predictions:`);
    console.log(`Risk Level: ${predictions.riskLevel || 'LOW'}`);
}

/**
 * Escalation workflow example
 */
export async function escalationWorkflowExample() {
    console.log('\n=== Escalation Workflow Example ===');
    
    // Mock clients for demonstration
    const mockCodegenClient = {
        requestAssistance: async (request) => ({
            requestId: 'req_123',
            estimatedTime: '30 minutes'
        })
    };

    const mockLinearClient = {
        createIssue: async (issue) => ({
            id: 'issue_456',
            url: 'https://linear.app/team/issue/456'
        })
    };

    const errorHandler = new ErrorHandlingSystem({
        enableEscalation: true,
        escalationThreshold: 1, // Lower threshold for demo
        codegenClient: mockCodegenClient,
        linearClient: mockLinearClient
    });

    // Simulate a critical error that requires escalation
    const criticalError = Object.assign(new Error('Database connection pool exhausted'), {
        severity: 'CRITICAL'
    });

    const context = {
        operation: 'database_connection',
        environment: 'production',
        affectedUsers: 1500
    };

    console.log('\nHandling critical error...');
    
    const result = await errorHandler.handleError(criticalError, context);
    
    console.log(`Escalation triggered: ${result.resolution?.result?.shouldEscalate || false}`);
    console.log(`Escalation level: ${result.resolution?.result?.level || 'none'}`);
    
    if (result.resolution?.result?.details) {
        console.log('Escalation details:', result.resolution.result.details);
    }
}

/**
 * Analytics and reporting example
 */
export async function analyticsReportingExample() {
    console.log('\n=== Analytics and Reporting Example ===');
    
    const errorHandler = new ErrorHandlingSystem({
        enableAnalytics: true
    });

    // Simulate error data over time
    const errorData = generateTimeSeriesErrors();
    
    for (const data of errorData) {
        errorHandler.analytics.recordError(data.errorInfo, data.context, data.resolution);
    }

    // Generate comprehensive report
    const report = await errorHandler.generateReport({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        endDate: new Date()
    });

    console.log('\nAnalytics Report:');
    console.log(`Total Events: ${report.metadata.eventCount}`);
    console.log(`Error Types: ${Object.keys(report.errorDistribution.byType).length}`);
    console.log(`Resolution Rate: ${(report.summary.resolutionRate * 100).toFixed(1)}%`);
    
    // Display top error types
    const topErrors = Object.entries(report.errorDistribution.byType)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 3);
    
    console.log('\nTop Error Types:');
    for (const [type, stats] of topErrors) {
        console.log(`- ${type}: ${stats.count} occurrences (${stats.percentage.toFixed(1)}%)`);
    }

    // Get real-time dashboard data
    const dashboard = errorHandler.getDashboardData();
    console.log('\nReal-time Dashboard:');
    console.log(`Current Error Rate: ${dashboard.analytics?.realTime?.errorRate?.toFixed(2) || 0} errors/min`);
    console.log(`System Health: ${dashboard.analytics?.realTime?.systemHealth || 'UNKNOWN'}`);
}

/**
 * Custom retry strategies example
 */
export async function customRetryStrategiesExample() {
    console.log('\n=== Custom Retry Strategies Example ===');
    
    const errorHandler = new ErrorHandlingSystem({
        retry: {
            maxRetries: 5,
            baseDelay: 500,
            retryStrategies: ['exponential', 'linear', 'fibonacci', 'adaptive']
        }
    });

    // Test different retry strategies
    const strategies = ['exponential', 'linear', 'fibonacci'];
    
    for (const strategy of strategies) {
        console.log(`\nTesting ${strategy} backoff strategy:`);
        
        let attempt = 0;
        const operation = async () => {
            attempt++;
            if (attempt < 3) {
                throw new Error(`Simulated failure (attempt ${attempt})`);
            }
            return `Success after ${attempt} attempts`;
        };

        try {
            const result = await errorHandler.retryManager.executeWithRetry(operation, {
                strategy,
                maxRetries: 3,
                operationId: `test_${strategy}`
            });
            
            console.log(`Result: ${result}`);
        } catch (error) {
            console.log(`Failed: ${error.message}`);
        }
        
        attempt = 0; // Reset for next strategy
    }

    // Display retry statistics
    const retryStats = errorHandler.retryManager.getStatistics();
    console.log('\nRetry Statistics:');
    console.log(JSON.stringify(retryStats, null, 2));
}

/**
 * Integration testing example
 */
export async function integrationTestingExample() {
    console.log('\n=== Integration Testing Example ===');
    
    const errorHandler = new ErrorHandlingSystem({
        enableAnalytics: true,
        enablePatternRecognition: true,
        enableAutomatedFixes: true,
        enableEscalation: true
    });

    // Simulate a complex error scenario
    const complexError = Object.assign(new Error('Service mesh communication failure'), {
        code: 'NETWORK_ERROR',
        status: 503
    });

    const complexContext = {
        operation: 'microservice_communication',
        service: 'user-service',
        targetService: 'payment-service',
        environment: 'production',
        requestId: 'req_789',
        userId: 'user456',
        timestamp: new Date(),
        metadata: {
            retryCount: 0,
            circuitBreakerState: 'CLOSED',
            loadBalancerHealth: 'DEGRADED'
        }
    };

    console.log('\nHandling complex error scenario...');
    
    const startTime = Date.now();
    const result = await errorHandler.handleError(complexError, complexContext);
    const duration = Date.now() - startTime;

    console.log(`\nHandling completed in ${duration}ms`);
    console.log(`Success: ${result.success}`);
    console.log(`Classification: ${result.classification.type} (${result.classification.category})`);
    console.log(`Confidence: ${(result.classification.confidence * 100).toFixed(1)}%`);
    console.log(`Resolution method: ${result.resolution.method}`);
    
    if (result.resolution.attempts) {
        console.log(`Attempts made: ${result.resolution.attempts.length}`);
        for (const attempt of result.resolution.attempts) {
            console.log(`- ${attempt.method}: ${attempt.result?.success ? 'SUCCESS' : 'FAILED'}`);
        }
    }

    // Export system data for analysis
    const exportData = errorHandler.exportData();
    console.log(`\nExported data size: ${JSON.stringify(exportData).length} bytes`);
    console.log(`Analytics events: ${exportData.analytics?.events?.length || 0}`);
    console.log(`Pattern data: ${exportData.patterns?.patterns?.length || 0}`);
}

/**
 * Generate historical error data for testing
 */
function generateHistoricalErrors() {
    const errorTypes = [
        'NETWORK_ERROR', 'DATABASE_ERROR', 'AUTHENTICATION_ERROR', 
        'RATE_LIMIT_ERROR', 'VALIDATION_ERROR', 'TIMEOUT_ERROR'
    ];
    
    const categories = ['NETWORK', 'PERSISTENCE', 'SECURITY', 'THROTTLING', 'INPUT', 'PERFORMANCE'];
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    
    const errors = [];
    
    for (let i = 0; i < 100; i++) {
        const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const severity = severities[Math.floor(Math.random() * severities.length)];
        
        errors.push({
            errorInfo: {
                type: errorType,
                category,
                severity,
                message: `Simulated ${errorType.toLowerCase()}`,
                confidence: 0.7 + Math.random() * 0.3,
                retryable: Math.random() > 0.3
            },
            context: {
                operation: `operation_${i % 10}`,
                environment: Math.random() > 0.7 ? 'staging' : 'production',
                userId: `user_${Math.floor(Math.random() * 100)}`,
                timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
            },
            resolution: Math.random() > 0.3 ? {
                success: true,
                method: 'automated_fix',
                timestamp: new Date()
            } : null
        });
    }
    
    return errors;
}

/**
 * Generate time series error data
 */
function generateTimeSeriesErrors() {
    const errors = [];
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now - (i * oneHour));
        const errorCount = Math.floor(Math.random() * 10) + 1;
        
        for (let j = 0; j < errorCount; j++) {
            errors.push({
                errorInfo: {
                    type: 'NETWORK_ERROR',
                    category: 'NETWORK',
                    severity: 'MEDIUM',
                    message: 'Connection timeout',
                    confidence: 0.8
                },
                context: {
                    operation: 'api_call',
                    environment: 'production',
                    timestamp
                },
                resolution: {
                    success: Math.random() > 0.2,
                    method: 'retry',
                    timestamp: new Date(timestamp.getTime() + Math.random() * 60000)
                }
            });
        }
    }
    
    return errors;
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🔧 Error Handling & Resolution Escalation System Examples');
    console.log('========================================================');
    
    try {
        await basicErrorHandling();
        await customRetryStrategiesExample();
        await analyticsReportingExample();
        await patternRecognitionExample();
        await escalationWorkflowExample();
        await integrationTestingExample();
        
        console.log('\n✅ All examples completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Example execution failed:', error.message);
        console.error(error.stack);
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples();
}

