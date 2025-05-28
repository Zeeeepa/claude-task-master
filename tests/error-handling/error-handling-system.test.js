/**
 * @fileoverview Error Handling System Tests
 * @description Comprehensive tests for the error handling system
 */

import { jest } from '@jest/globals';
import { ErrorHandlingSystem } from '../../src/error-handling/index.js';

describe('ErrorHandlingSystem', () => {
    let errorHandlingSystem;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            enableRetry: true,
            enableCircuitBreaker: true,
            enableEscalation: true,
            enableRecovery: true,
            enableCodegen: false, // Disable for testing
            enableEnvironmentReset: true,
            enableNotifications: true,
            enableAnalytics: true,
            enableTracking: true,
            enableReporting: true,
            retry: {
                maxRetries: 3,
                baseDelay: 100,
                maxDelay: 1000
            },
            circuitBreaker: {
                failureThreshold: 3,
                resetTimeout: 5000
            },
            escalation: {
                codegenThreshold: 2,
                manualThreshold: 5
            }
        };

        errorHandlingSystem = new ErrorHandlingSystem(mockConfig);
    });

    afterEach(() => {
        if (errorHandlingSystem) {
            errorHandlingSystem.stop();
        }
    });

    describe('initialization', () => {
        it('should initialize with default configuration', () => {
            const system = new ErrorHandlingSystem();
            expect(system.isInitialized).toBe(true);
            expect(system.components).toBeDefined();
        });

        it('should initialize with custom configuration', () => {
            expect(errorHandlingSystem.isInitialized).toBe(true);
            expect(errorHandlingSystem.components.classifier).toBeDefined();
            expect(errorHandlingSystem.components.retrySystem).toBeDefined();
            expect(errorHandlingSystem.components.escalationManager).toBeDefined();
        });

        it('should disable components based on configuration', () => {
            const config = {
                enableRetry: false,
                enableEscalation: false,
                enableCodegen: false
            };
            
            const system = new ErrorHandlingSystem(config);
            
            expect(system.components.retrySystem).toBeUndefined();
            expect(system.components.escalationManager).toBeUndefined();
            expect(system.components.codegenIntegration).toBeUndefined();
            
            system.stop();
        });
    });

    describe('error handling', () => {
        it('should handle simple errors', async () => {
            const error = new Error('Test error');
            const context = {
                environment: 'test',
                operationType: 'deployment',
                component: 'test-component'
            };

            const result = await errorHandlingSystem.handleError(error, context);

            expect(result).toBeDefined();
            expect(result.operationId).toBeDefined();
            expect(result.classification).toBeDefined();
            expect(result.handlingStrategy).toBeDefined();
            expect(result.totalTime).toBeGreaterThan(0);
        });

        it('should classify errors correctly', async () => {
            const dependencyError = new Error('Package not found: @types/node');
            const context = {
                environment: 'development',
                operationType: 'build'
            };

            const result = await errorHandlingSystem.handleError(dependencyError, context);

            expect(result.classification.type).toBe('dependency');
            expect(result.classification.category).toBe('persistent');
        });

        it('should handle network errors with retry', async () => {
            const networkError = new Error('Connection refused');
            networkError.code = 'ECONNREFUSED';
            
            const context = {
                environment: 'production',
                operationType: 'api_call'
            };

            const result = await errorHandlingSystem.handleError(networkError, context);

            expect(result.classification.type).toBe('network');
            expect(result.classification.retryable).toBe(true);
        });

        it('should escalate critical errors immediately', async () => {
            const criticalError = new Error('Security violation detected');
            const context = {
                environment: 'production',
                operationType: 'authentication'
            };

            const result = await errorHandlingSystem.handleError(criticalError, context);

            expect(result.classification.severity).toBe('critical');
            expect(result.handlingStrategy).toBe('immediate_escalation');
        });

        it('should handle errors when system is not initialized', async () => {
            const uninitializedSystem = Object.create(ErrorHandlingSystem.prototype);
            uninitializedSystem.isInitialized = false;

            const error = new Error('Test error');
            
            await expect(uninitializedSystem.handleError(error))
                .rejects.toThrow('Error handling system not initialized');
        });
    });

    describe('handling strategies', () => {
        it('should determine correct strategy for retryable errors', () => {
            const classification = {
                type: 'network',
                category: 'transient',
                severity: 'medium',
                retryable: true
            };
            
            const context = { environment: 'development' };
            const strategy = errorHandlingSystem._determineHandlingStrategy(classification, context);
            
            expect(strategy).toBe('intelligent_retry');
        });

        it('should determine correct strategy for code errors', () => {
            const classification = {
                type: 'syntax',
                category: 'persistent',
                severity: 'medium',
                retryable: false
            };
            
            const context = { environment: 'development' };
            const strategy = errorHandlingSystem._determineHandlingStrategy(classification, context);
            
            expect(strategy).toBe('automated_recovery');
        });

        it('should determine correct strategy for configuration errors', () => {
            const classification = {
                type: 'configuration',
                category: 'persistent',
                severity: 'medium',
                retryable: false
            };
            
            const context = { environment: 'development' };
            const strategy = errorHandlingSystem._determineHandlingStrategy(classification, context);
            
            expect(strategy).toBe('environment_reset');
        });

        it('should determine immediate escalation for critical errors', () => {
            const classification = {
                type: 'security',
                category: 'critical',
                severity: 'critical',
                retryable: false
            };
            
            const context = { environment: 'production' };
            const strategy = errorHandlingSystem._determineHandlingStrategy(classification, context);
            
            expect(strategy).toBe('immediate_escalation');
        });
    });

    describe('statistics and health', () => {
        it('should provide system statistics', () => {
            const stats = errorHandlingSystem.getStatistics();

            expect(stats.system).toBeDefined();
            expect(stats.system.initialized).toBe(true);
            expect(stats.system.enabledComponents).toBeInstanceOf(Array);
            expect(stats.system.config).toBeDefined();
        });

        it('should provide health status', () => {
            const health = errorHandlingSystem.getHealthStatus();

            expect(health.overall).toBeDefined();
            expect(health.components).toBeDefined();
            expect(health.issues).toBeInstanceOf(Array);
        });

        it('should detect unhealthy components', () => {
            // Mock a component to throw an error
            errorHandlingSystem.components.classifier.getStatistics = () => {
                throw new Error('Component error');
            };

            const health = errorHandlingSystem.getHealthStatus();

            expect(health.components.classifier.status).toBe('unhealthy');
            expect(health.issues.length).toBeGreaterThan(0);
        });
    });

    describe('reporting', () => {
        it('should generate error reports', async () => {
            const options = {
                type: 'summary',
                format: 'json',
                timeRange: '24h'
            };

            const report = await errorHandlingSystem.generateReport(options);

            expect(report).toBeDefined();
            expect(report.id).toBeDefined();
            expect(report.type).toBe('summary');
            expect(report.format).toBe('json');
        });

        it('should handle report generation when reporting is disabled', async () => {
            const systemWithoutReporting = new ErrorHandlingSystem({
                enableReporting: false
            });

            await expect(systemWithoutReporting.generateReport())
                .rejects.toThrow('Error reporting not enabled');
                
            systemWithoutReporting.stop();
        });
    });

    describe('codegen integration', () => {
        it('should test codegen connection when enabled', async () => {
            const systemWithCodegen = new ErrorHandlingSystem({
                enableCodegen: true,
                codegen: {
                    apiUrl: 'https://test-api.codegen.sh',
                    apiKey: 'test-key'
                }
            });

            const result = await systemWithCodegen.testCodegenConnection();

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
            
            systemWithCodegen.stop();
        });

        it('should handle codegen test when disabled', async () => {
            const result = await errorHandlingSystem.testCodegenConnection();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Codegen integration not enabled');
        });
    });

    describe('system lifecycle', () => {
        it('should reset all components', () => {
            const resetSpy = jest.fn();
            
            // Mock reset methods
            Object.values(errorHandlingSystem.components).forEach(component => {
                if (component.reset) {
                    component.reset = resetSpy;
                }
            });

            errorHandlingSystem.reset();

            expect(resetSpy).toHaveBeenCalled();
        });

        it('should stop all components', () => {
            const stopSpy = jest.fn();
            
            // Mock stop methods
            Object.values(errorHandlingSystem.components).forEach(component => {
                if (component.stop) {
                    component.stop = stopSpy;
                }
            });

            errorHandlingSystem.stop();

            expect(stopSpy).toHaveBeenCalled();
            expect(errorHandlingSystem.isInitialized).toBe(false);
        });
    });

    describe('error scenarios', () => {
        it('should handle component initialization failures', () => {
            // Mock a component constructor to throw
            const originalClassifier = errorHandlingSystem.components.classifier.constructor;
            
            expect(() => {
                new ErrorHandlingSystem({
                    classification: {
                        invalidConfig: true
                    }
                });
            }).not.toThrow(); // Should handle gracefully
        });

        it('should handle missing operation context', async () => {
            const error = new Error('Test error');
            
            const result = await errorHandlingSystem.handleError(error);

            expect(result.operationId).toBeDefined();
            expect(result.classification).toBeDefined();
        });

        it('should handle strategy execution failures', async () => {
            // Mock a strategy to fail
            const originalExecuteStrategy = errorHandlingSystem._executeHandlingStrategy;
            errorHandlingSystem._executeHandlingStrategy = jest.fn().mockRejectedValue(
                new Error('Strategy execution failed')
            );

            const error = new Error('Test error');
            const result = await errorHandlingSystem.handleError(error);

            expect(result.success).toBe(false);
            expect(result.isHandlingError).toBe(true);
            
            // Restore original method
            errorHandlingSystem._executeHandlingStrategy = originalExecuteStrategy;
        });
    });

    describe('configuration validation', () => {
        it('should work with minimal configuration', () => {
            const minimalSystem = new ErrorHandlingSystem({});
            
            expect(minimalSystem.isInitialized).toBe(true);
            expect(minimalSystem.components.classifier).toBeDefined();
            
            minimalSystem.stop();
        });

        it('should handle invalid configuration gracefully', () => {
            const invalidConfig = {
                retry: {
                    maxRetries: -1, // Invalid
                    baseDelay: 'invalid' // Invalid
                }
            };

            expect(() => {
                new ErrorHandlingSystem(invalidConfig);
            }).not.toThrow();
        });
    });

    describe('integration scenarios', () => {
        it('should handle complex error scenarios end-to-end', async () => {
            const complexError = new Error('Build failed: syntax error in src/main.js');
            const context = {
                environment: 'development',
                operationType: 'build',
                component: 'webpack',
                logs: 'Unexpected token at line 42',
                repository: 'test-repo',
                branch: 'feature/test'
            };

            const result = await errorHandlingSystem.handleError(complexError, context);

            expect(result.success).toBeDefined();
            expect(result.classification.type).toBe('syntax');
            expect(result.handlingStrategy).toBe('automated_recovery');
            expect(result.operationId).toBeDefined();
            expect(result.totalTime).toBeGreaterThan(0);
        });

        it('should handle multiple concurrent errors', async () => {
            const errors = [
                new Error('Network timeout'),
                new Error('Package not found'),
                new Error('Syntax error')
            ];

            const promises = errors.map((error, index) => 
                errorHandlingSystem.handleError(error, {
                    environment: 'test',
                    operationType: `operation_${index}`
                })
            );

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.operationId).toBeDefined();
                expect(result.classification).toBeDefined();
            });
        });
    });
});

describe('Error Classification Integration', () => {
    let errorHandlingSystem;

    beforeEach(() => {
        errorHandlingSystem = new ErrorHandlingSystem({
            enableAnalytics: true,
            enableTracking: true
        });
    });

    afterEach(() => {
        errorHandlingSystem.stop();
    });

    it('should classify dependency errors correctly', async () => {
        const error = new Error('Module not found: cannot resolve \'@types/node\'');
        const context = {
            environment: 'development',
            operationType: 'build',
            logs: 'npm ERR! 404 Not Found - GET https://registry.npmjs.org/@types/node'
        };

        const result = await errorHandlingSystem.handleError(error, context);

        expect(result.classification.type).toBe('dependency');
        expect(result.classification.category).toBe('persistent');
        expect(result.classification.retryable).toBe(true);
    });

    it('should classify network errors correctly', async () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
        error.code = 'ECONNREFUSED';
        
        const context = {
            environment: 'development',
            operationType: 'api_call'
        };

        const result = await errorHandlingSystem.handleError(error, context);

        expect(result.classification.type).toBe('network');
        expect(result.classification.category).toBe('transient');
        expect(result.classification.retryable).toBe(true);
    });

    it('should classify syntax errors correctly', async () => {
        const error = new Error('SyntaxError: Unexpected token \'}\'');
        const context = {
            environment: 'development',
            operationType: 'compilation',
            logs: 'Error in src/main.js at line 42:5'
        };

        const result = await errorHandlingSystem.handleError(error, context);

        expect(result.classification.type).toBe('syntax');
        expect(result.classification.category).toBe('persistent');
        expect(result.classification.retryable).toBe(false);
    });
});

describe('Performance Tests', () => {
    let errorHandlingSystem;

    beforeEach(() => {
        errorHandlingSystem = new ErrorHandlingSystem();
    });

    afterEach(() => {
        errorHandlingSystem.stop();
    });

    it('should handle errors within reasonable time', async () => {
        const error = new Error('Performance test error');
        const startTime = Date.now();

        const result = await errorHandlingSystem.handleError(error);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
        expect(result.totalTime).toBeLessThan(1000);
    });

    it('should handle multiple errors efficiently', async () => {
        const errorCount = 10;
        const errors = Array.from({ length: errorCount }, (_, i) => 
            new Error(`Test error ${i}`)
        );

        const startTime = Date.now();
        
        const promises = errors.map(error => 
            errorHandlingSystem.handleError(error, {
                environment: 'test',
                operationType: 'performance_test'
            })
        );

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;

        expect(results).toHaveLength(errorCount);
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        
        // Check that all errors were processed
        results.forEach(result => {
            expect(result.operationId).toBeDefined();
            expect(result.classification).toBeDefined();
        });
    });
});

