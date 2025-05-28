/**
 * @fileoverview Performance System Usage Example
 * @description Example demonstrating how to use the performance optimization and monitoring system
 */

import PerformanceSystem from '../performance-system.js';
import { getPerformanceConfig } from '../config/performance-config.js';

/**
 * Basic Performance System Usage Example
 */
export async function basicPerformanceSystemUsage() {
    console.log('🚀 Basic Performance System Usage Example');
    console.log('==========================================');

    try {
        // Get configuration for current environment
        const config = getPerformanceConfig(process.env.NODE_ENV || 'development');
        
        // Create performance system instance
        const performanceSystem = new PerformanceSystem(config);
        
        // Set up event listeners
        performanceSystem.on('initialized', () => {
            console.log('✅ Performance system initialized');
        });
        
        performanceSystem.on('started', () => {
            console.log('✅ Performance system started');
        });
        
        performanceSystem.on('alert', (alert) => {
            console.log(`🚨 Alert: ${alert.message} (${alert.severity})`);
        });
        
        // Initialize the system
        await performanceSystem.initialize();
        
        // Start monitoring
        await performanceSystem.start();
        
        // Simulate some work and monitoring
        await simulateWorkload(performanceSystem);
        
        // Get dashboard data
        const dashboard = performanceSystem.getPerformanceDashboard();
        console.log('\n📊 Performance Dashboard:');
        console.log(`Status: ${dashboard.status}`);
        console.log(`Uptime: ${Math.round(dashboard.uptime / 1000)}s`);
        console.log(`Overall Score: ${dashboard.summary.overallScore}/100`);
        
        if (dashboard.summary.issues.length > 0) {
            console.log('\n⚠️ Issues:');
            dashboard.summary.issues.forEach(issue => console.log(`  - ${issue}`));
        }
        
        if (dashboard.summary.improvements.length > 0) {
            console.log('\n💡 Improvements:');
            dashboard.summary.improvements.forEach(improvement => console.log(`  - ${improvement}`));
        }
        
        // Stop the system
        await performanceSystem.stop();
        console.log('✅ Performance system stopped');
        
    } catch (error) {
        console.error('❌ Error in basic usage example:', error);
    }
}

/**
 * Advanced Performance System Usage Example
 */
export async function advancedPerformanceSystemUsage() {
    console.log('\n🔧 Advanced Performance System Usage Example');
    console.log('=============================================');

    try {
        // Custom configuration
        const customConfig = getPerformanceConfig('production', {
            enableLoadBalancing: true,
            performanceMonitor: {
                thresholds: {
                    responseTime: 500, // Stricter threshold
                    errorRate: 1
                }
            },
            cacheManager: {
                strategy: 'lfu', // Least Frequently Used
                maxSize: 2000
            }
        });
        
        const performanceSystem = new PerformanceSystem(customConfig);
        
        // Initialize with database connection (simulated)
        const mockDatabaseConnection = createMockDatabaseConnection();
        await performanceSystem.initialize(mockDatabaseConnection);
        await performanceSystem.start();
        
        // Demonstrate component usage
        await demonstrateComponentUsage(performanceSystem);
        
        // Export metrics
        console.log('\n📈 Exporting Metrics:');
        try {
            const jsonMetrics = performanceSystem.exportMetrics('json');
            console.log('✅ JSON metrics exported');
            
            const prometheusMetrics = performanceSystem.exportMetrics('prometheus');
            console.log('✅ Prometheus metrics exported');
        } catch (error) {
            console.log('⚠️ Metrics export not available (metrics collection may be disabled)');
        }
        
        // Get optimization recommendations
        const recommendations = performanceSystem.getOptimizationRecommendations();
        if (recommendations.length > 0) {
            console.log('\n🎯 Optimization Recommendations:');
            recommendations.forEach(rec => {
                console.log(`  [${rec.priority.toUpperCase()}] ${rec.message}`);
            });
        }
        
        await performanceSystem.stop();
        
    } catch (error) {
        console.error('❌ Error in advanced usage example:', error);
    }
}

/**
 * Component-specific Usage Examples
 */
export async function componentSpecificUsage() {
    console.log('\n🧩 Component-specific Usage Examples');
    console.log('====================================');

    try {
        const config = getPerformanceConfig('development');
        const performanceSystem = new PerformanceSystem(config);
        
        await performanceSystem.initialize();
        await performanceSystem.start();
        
        // Performance Monitor Usage
        console.log('\n📊 Performance Monitor:');
        const perfMonitor = performanceSystem.getComponent('performance');
        if (perfMonitor) {
            // Start a timer
            const timer = perfMonitor.startTimer('example_operation');
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
            const duration = perfMonitor.endTimer(timer.name);
            console.log(`✅ Operation completed in ${duration.toFixed(2)}ms`);
            
            // Record custom metrics
            perfMonitor.recordRequest(true, 150, { endpoint: '/api/test' });
            perfMonitor.recordRequest(false, 500, { endpoint: '/api/test' });
            
            const summary = perfMonitor.getPerformanceSummary();
            console.log(`   Average response time: ${summary.averageResponseTime.toFixed(2)}ms`);
            console.log(`   Error rate: ${summary.errorRate.toFixed(2)}%`);
        }
        
        // Cache Manager Usage
        console.log('\n💾 Cache Manager:');
        const cacheManager = performanceSystem.getComponent('cache');
        if (cacheManager) {
            // Set and get cache values
            await cacheManager.set('user:123', { name: 'John Doe', email: 'john@example.com' });
            const user = await cacheManager.get('user:123');
            console.log(`✅ Cached user retrieved:`, user?.name);
            
            // Use memoization
            const expensiveOperation = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { result: 'expensive calculation result' };
            };
            
            const result1 = await cacheManager.memoize('expensive_op', expensiveOperation);
            const result2 = await cacheManager.memoize('expensive_op', expensiveOperation); // Should be cached
            console.log(`✅ Memoized operation result:`, result1.result);
            
            const stats = cacheManager.getStats();
            console.log(`   Cache hit rate: ${stats.hitRate.toFixed(2)}%`);
        }
        
        // Health Checker Usage
        console.log('\n🏥 Health Checker:');
        const healthChecker = performanceSystem.getComponent('health');
        if (healthChecker) {
            // Register custom health check
            healthChecker.registerHealthCheck('custom_service', async () => {
                // Simulate health check
                const isHealthy = Math.random() > 0.2; // 80% chance of being healthy
                if (!isHealthy) {
                    throw new Error('Service is down');
                }
                return {
                    status: 'healthy',
                    message: 'Custom service is running normally'
                };
            });
            
            // Run health checks
            await healthChecker.runAllHealthChecks();
            const healthSummary = healthChecker.getHealthSummary();
            console.log(`✅ Overall health: ${healthSummary.overall.status}`);
            console.log(`   Healthy checks: ${healthSummary.overall.summary.healthy}`);
            console.log(`   Warning checks: ${healthSummary.overall.summary.warning}`);
            console.log(`   Critical checks: ${healthSummary.overall.summary.critical}`);
        }
        
        // Metrics Collector Usage
        console.log('\n📈 Metrics Collector:');
        const metricsCollector = performanceSystem.getComponent('metrics');
        if (metricsCollector) {
            // Define custom metrics
            metricsCollector.defineMetric('api_requests_total', {
                type: 'counter',
                description: 'Total number of API requests'
            });
            
            metricsCollector.defineMetric('response_time_ms', {
                type: 'histogram',
                description: 'API response time in milliseconds'
            });
            
            // Record metrics
            metricsCollector.incrementCounter('api_requests_total', 1, { endpoint: '/api/users' });
            metricsCollector.recordHistogram('response_time_ms', 250, { endpoint: '/api/users' });
            
            // Time a function
            const timedResult = await metricsCollector.timeFunction('database_query', async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { rows: 10 };
            });
            console.log(`✅ Timed function result:`, timedResult);
            
            const metricsSummary = metricsCollector.getMetricsSummary();
            console.log(`   Total metric types: ${metricsSummary.totalMetricTypes}`);
            console.log(`   Total metric points: ${metricsSummary.totalMetricPoints}`);
        }
        
        await performanceSystem.stop();
        
    } catch (error) {
        console.error('❌ Error in component-specific usage:', error);
    }
}

/**
 * Simulate workload for demonstration
 */
async function simulateWorkload(performanceSystem) {
    console.log('\n⚡ Simulating workload...');
    
    const perfMonitor = performanceSystem.getComponent('performance');
    const cacheManager = performanceSystem.getComponent('cache');
    
    // Simulate API requests
    for (let i = 0; i < 10; i++) {
        const success = Math.random() > 0.1; // 90% success rate
        const responseTime = Math.random() * 500 + 100; // 100-600ms
        
        if (perfMonitor) {
            perfMonitor.recordRequest(success, responseTime, { 
                endpoint: `/api/endpoint${i % 3}` 
            });
        }
        
        // Simulate cache operations
        if (cacheManager) {
            await cacheManager.set(`key${i}`, { data: `value${i}` });
            await cacheManager.get(`key${Math.floor(i / 2)}`); // Some cache hits
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log('✅ Workload simulation completed');
}

/**
 * Demonstrate component usage
 */
async function demonstrateComponentUsage(performanceSystem) {
    console.log('\n🔧 Demonstrating component usage...');
    
    // Load balancer usage (if enabled)
    const loadBalancer = performanceSystem.getComponent('loadBalancer');
    if (loadBalancer && loadBalancer.isRunning) {
        // Add servers
        loadBalancer.addServer('server1', { host: 'localhost', port: 3001, weight: 1 });
        loadBalancer.addServer('server2', { host: 'localhost', port: 3002, weight: 2 });
        
        // Simulate requests
        try {
            await loadBalancer.executeRequest(async (server) => {
                // Simulate request to server
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
                return { serverId: server.id, response: 'OK' };
            });
            console.log('✅ Load balancer request executed');
        } catch (error) {
            console.log('⚠️ Load balancer request failed (expected in demo)');
        }
    }
    
    // Database optimizer usage (if enabled)
    const dbOptimizer = performanceSystem.getComponent('database');
    if (dbOptimizer && dbOptimizer.isInitialized) {
        try {
            // Simulate optimized query
            await dbOptimizer.optimizeQuery('SELECT * FROM users WHERE id = $1', [123]);
            console.log('✅ Database query optimized');
        } catch (error) {
            console.log('⚠️ Database query failed (expected in demo)');
        }
    }
}

/**
 * Create mock database connection for demonstration
 */
function createMockDatabaseConnection() {
    return {
        connect: async () => ({
            query: async (sql, params) => ({ rows: [] }),
            release: () => {}
        }),
        options: {
            max: 20,
            idleTimeoutMillis: 10000
        }
    };
}

/**
 * Run all examples
 */
export async function runAllExamples() {
    console.log('🎯 Performance System Examples');
    console.log('==============================\n');
    
    await basicPerformanceSystemUsage();
    await advancedPerformanceSystemUsage();
    await componentSpecificUsage();
    
    console.log('\n✅ All examples completed successfully!');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

