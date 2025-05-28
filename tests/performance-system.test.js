/**
 * @fileoverview Performance System Tests
 * @description Comprehensive tests for the performance optimization and monitoring system
 */

import { jest } from '@jest/globals';
import PerformanceSystem from '../src/performance-system.js';
import PerformanceMonitor from '../src/monitoring/performance-monitor.js';
import HealthChecker from '../src/monitoring/health-checker.js';
import DatabaseOptimizer from '../src/optimization/database-optimizer.js';
import CacheManager from '../src/optimization/cache-manager.js';
import LoadBalancer from '../src/optimization/load-balancer.js';
import MetricsCollector from '../src/analytics/metrics-collector.js';
import { getPerformanceConfig, validatePerformanceConfig } from '../src/config/performance-config.js';

describe('Performance System', () => {
    let performanceSystem;
    let mockDatabaseConnection;

    beforeEach(() => {
        // Create mock database connection
        mockDatabaseConnection = {
            connect: jest.fn().mockResolvedValue({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn()
            }),
            options: {
                max: 20,
                idleTimeoutMillis: 10000
            }
        };

        // Create performance system with test configuration
        const config = getPerformanceConfig('testing');
        performanceSystem = new PerformanceSystem(config);
    });

    afterEach(async () => {
        if (performanceSystem && performanceSystem.isRunning) {
            await performanceSystem.stop();
        }
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            await expect(performanceSystem.initialize()).resolves.not.toThrow();
            expect(performanceSystem.isInitialized).toBe(true);
        });

        test('should initialize with database connection', async () => {
            await expect(performanceSystem.initialize(mockDatabaseConnection)).resolves.not.toThrow();
            expect(performanceSystem.isInitialized).toBe(true);
        });

        test('should emit initialized event', async () => {
            const initSpy = jest.fn();
            performanceSystem.on('initialized', initSpy);
            
            await performanceSystem.initialize();
            expect(initSpy).toHaveBeenCalled();
        });
    });

    describe('Start and Stop', () => {
        test('should start successfully after initialization', async () => {
            await performanceSystem.initialize();
            await expect(performanceSystem.start()).resolves.not.toThrow();
            expect(performanceSystem.isRunning).toBe(true);
        });

        test('should emit started event', async () => {
            const startSpy = jest.fn();
            performanceSystem.on('started', startSpy);
            
            await performanceSystem.initialize();
            await performanceSystem.start();
            expect(startSpy).toHaveBeenCalled();
        });

        test('should stop successfully', async () => {
            await performanceSystem.initialize();
            await performanceSystem.start();
            await expect(performanceSystem.stop()).resolves.not.toThrow();
            expect(performanceSystem.isRunning).toBe(false);
        });

        test('should emit stopped event', async () => {
            const stopSpy = jest.fn();
            performanceSystem.on('stopped', stopSpy);
            
            await performanceSystem.initialize();
            await performanceSystem.start();
            await performanceSystem.stop();
            expect(stopSpy).toHaveBeenCalled();
        });
    });

    describe('Component Access', () => {
        test('should return correct components', () => {
            expect(performanceSystem.getComponent('performance')).toBeInstanceOf(PerformanceMonitor);
            expect(performanceSystem.getComponent('health')).toBeInstanceOf(HealthChecker);
            expect(performanceSystem.getComponent('database')).toBeInstanceOf(DatabaseOptimizer);
            expect(performanceSystem.getComponent('cache')).toBeInstanceOf(CacheManager);
            expect(performanceSystem.getComponent('loadBalancer')).toBeInstanceOf(LoadBalancer);
            expect(performanceSystem.getComponent('metrics')).toBeInstanceOf(MetricsCollector);
        });

        test('should return null for unknown component', () => {
            expect(performanceSystem.getComponent('unknown')).toBeNull();
        });
    });

    describe('Dashboard Data', () => {
        test('should return dashboard data', async () => {
            await performanceSystem.initialize();
            await performanceSystem.start();
            
            const dashboard = performanceSystem.getPerformanceDashboard();
            
            expect(dashboard).toHaveProperty('timestamp');
            expect(dashboard).toHaveProperty('uptime');
            expect(dashboard).toHaveProperty('status');
            expect(dashboard).toHaveProperty('components');
            expect(dashboard).toHaveProperty('alerts');
            expect(dashboard).toHaveProperty('recommendations');
            expect(dashboard).toHaveProperty('summary');
        });

        test('should calculate system status correctly', async () => {
            await performanceSystem.initialize();
            
            // Before starting
            expect(performanceSystem.getSystemStatus()).toBe('stopped');
            
            await performanceSystem.start();
            
            // After starting
            expect(performanceSystem.getSystemStatus()).toBe('healthy');
        });
    });

    describe('Performance Summary', () => {
        test('should generate performance summary', async () => {
            await performanceSystem.initialize();
            await performanceSystem.start();
            
            const summary = performanceSystem.getPerformanceSummary();
            
            expect(summary).toHaveProperty('overallScore');
            expect(summary).toHaveProperty('issues');
            expect(summary).toHaveProperty('improvements');
            expect(summary.overallScore).toBeGreaterThanOrEqual(0);
            expect(summary.overallScore).toBeLessThanOrEqual(100);
            expect(Array.isArray(summary.issues)).toBe(true);
            expect(Array.isArray(summary.improvements)).toBe(true);
        });
    });

    describe('Optimization Recommendations', () => {
        test('should return optimization recommendations', async () => {
            await performanceSystem.initialize();
            
            const recommendations = performanceSystem.getOptimizationRecommendations();
            expect(Array.isArray(recommendations)).toBe(true);
        });
    });

    describe('Alert Handling', () => {
        test('should handle alerts from components', async () => {
            const alertSpy = jest.fn();
            performanceSystem.on('alert', alertSpy);
            
            await performanceSystem.initialize();
            
            // Simulate alert from performance monitor
            performanceSystem.handleAlert('performance', {
                type: 'cpu_usage',
                value: 90,
                threshold: 80
            });
            
            expect(alertSpy).toHaveBeenCalled();
            expect(performanceSystem.dashboardData.alerts).toHaveLength(1);
        });

        test('should limit alert history', async () => {
            await performanceSystem.initialize();
            
            // Generate more than 100 alerts
            for (let i = 0; i < 150; i++) {
                performanceSystem.handleAlert('test', { type: 'test', value: i });
            }
            
            expect(performanceSystem.dashboardData.alerts).toHaveLength(100);
        });
    });

    describe('Error Handling', () => {
        test('should handle initialization errors gracefully', async () => {
            // Create system with invalid config
            const invalidConfig = { enabled: true, performanceMonitor: { collectInterval: -1 } };
            const invalidSystem = new PerformanceSystem(invalidConfig);
            
            // Should not throw, but may log warnings
            await expect(invalidSystem.initialize()).resolves.not.toThrow();
        });

        test('should handle component failures gracefully', async () => {
            await performanceSystem.initialize();
            
            // Mock a component failure
            const originalStart = performanceSystem.performanceMonitor.start;
            performanceSystem.performanceMonitor.start = jest.fn().mockImplementation(() => {
                throw new Error('Component failure');
            });
            
            // Should handle the error gracefully
            await expect(performanceSystem.start()).rejects.toThrow();
            
            // Restore original method
            performanceSystem.performanceMonitor.start = originalStart;
        });
    });
});

describe('Performance Configuration', () => {
    describe('getPerformanceConfig', () => {
        test('should return development config by default', () => {
            const config = getPerformanceConfig();
            expect(config.performanceMonitor.thresholds.cpuUsage).toBe(90);
        });

        test('should return production config', () => {
            const config = getPerformanceConfig('production');
            expect(config.performanceMonitor.thresholds.cpuUsage).toBe(70);
        });

        test('should return testing config', () => {
            const config = getPerformanceConfig('testing');
            expect(config.performanceMonitor.enabled).toBe(false);
        });

        test('should merge custom config', () => {
            const customConfig = {
                performanceMonitor: {
                    thresholds: {
                        cpuUsage: 95
                    }
                }
            };
            
            const config = getPerformanceConfig('development', customConfig);
            expect(config.performanceMonitor.thresholds.cpuUsage).toBe(95);
            expect(config.performanceMonitor.thresholds.memoryUsage).toBe(90); // Should keep other defaults
        });
    });

    describe('validatePerformanceConfig', () => {
        test('should validate valid config', () => {
            const config = getPerformanceConfig('development');
            const validation = validatePerformanceConfig(config);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        test('should detect invalid config', () => {
            const invalidConfig = {
                enabled: 'not a boolean',
                performanceMonitor: {
                    collectInterval: 500 // Too low
                }
            };
            
            const validation = validatePerformanceConfig(invalidConfig);
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });
    });
});

describe('Component Integration', () => {
    let config;

    beforeEach(() => {
        config = getPerformanceConfig('testing', {
            // Enable components for integration testing
            enablePerformanceMonitoring: true,
            enableHealthChecking: true,
            enableCaching: true,
            enableMetricsCollection: true,
            performanceMonitor: { enabled: true },
            healthChecker: { enabled: true },
            cacheManager: { enabled: true },
            metricsCollector: { enabled: true }
        });
    });

    test('should integrate performance monitor', async () => {
        const system = new PerformanceSystem(config);
        await system.initialize();
        await system.start();
        
        const perfMonitor = system.getComponent('performance');
        expect(perfMonitor.isRunning).toBe(true);
        
        // Test timer functionality
        const timer = perfMonitor.startTimer('test_operation');
        await new Promise(resolve => setTimeout(resolve, 10));
        const duration = perfMonitor.endTimer(timer.name);
        
        expect(duration).toBeGreaterThan(0);
        
        await system.stop();
    });

    test('should integrate cache manager', async () => {
        const system = new PerformanceSystem(config);
        await system.initialize();
        
        const cacheManager = system.getComponent('cache');
        expect(cacheManager.isInitialized).toBe(true);
        
        // Test cache operations
        await cacheManager.set('test_key', 'test_value');
        const value = await cacheManager.get('test_key');
        
        expect(value).toBe('test_value');
        
        await system.stop();
    });

    test('should integrate health checker', async () => {
        const system = new PerformanceSystem(config);
        await system.initialize();
        await system.start();
        
        const healthChecker = system.getComponent('health');
        expect(healthChecker.isRunning).toBe(true);
        
        // Test health check
        const healthSummary = healthChecker.getHealthSummary();
        expect(healthSummary).toHaveProperty('overall');
        expect(healthSummary).toHaveProperty('checks');
        
        await system.stop();
    });

    test('should integrate metrics collector', async () => {
        const system = new PerformanceSystem(config);
        await system.initialize();
        
        const metricsCollector = system.getComponent('metrics');
        expect(metricsCollector.isRunning).toBe(true);
        
        // Test metrics recording
        metricsCollector.recordMetric('test_metric', 42);
        const metrics = metricsCollector.getMetrics('test_metric');
        
        expect(metrics).toHaveLength(1);
        expect(metrics[0].value).toBe(42);
        
        await system.stop();
    });
});

describe('Performance Scenarios', () => {
    test('should handle high load scenario', async () => {
        const config = getPerformanceConfig('testing', {
            enablePerformanceMonitoring: true,
            performanceMonitor: { enabled: true }
        });
        
        const system = new PerformanceSystem(config);
        await system.initialize();
        await system.start();
        
        const perfMonitor = system.getComponent('performance');
        
        // Simulate high load
        for (let i = 0; i < 100; i++) {
            perfMonitor.recordRequest(true, Math.random() * 1000, { endpoint: '/api/test' });
        }
        
        const summary = perfMonitor.getPerformanceSummary();
        expect(summary.requests.total).toBe(100);
        expect(summary.averageResponseTime).toBeGreaterThan(0);
        
        await system.stop();
    });

    test('should handle error scenario', async () => {
        const config = getPerformanceConfig('testing', {
            enablePerformanceMonitoring: true,
            performanceMonitor: { enabled: true }
        });
        
        const system = new PerformanceSystem(config);
        await system.initialize();
        await system.start();
        
        const perfMonitor = system.getComponent('performance');
        
        // Simulate errors
        for (let i = 0; i < 10; i++) {
            perfMonitor.recordRequest(false, 500, { endpoint: '/api/test' });
        }
        
        const summary = perfMonitor.getPerformanceSummary();
        expect(summary.requests.failed).toBe(10);
        expect(summary.errorRate).toBe(100);
        
        await system.stop();
    });
});

// Mock timers for tests that use setTimeout/setInterval
jest.useFakeTimers();

