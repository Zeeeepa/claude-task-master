/**
 * @fileoverview Monitoring System Usage Example
 * @description Comprehensive example showing how to use the enhanced monitoring system
 */

import { PerformanceMonitor } from '../monitoring/performance_monitor.js';
import { MetricsCollector, ConsoleExporter, FileExporter } from '../monitoring/metrics_collector.js';
import { HealthChecker, HealthCheckFunctions } from '../monitoring/health_checker.js';
import { AlertManager, EmailNotificationChannel, SlackNotificationChannel } from '../alerts/alert_manager.js';
import { SystemMonitor } from '../monitoring/system_monitor.js';
import { MetricTypes, AlertSeverity } from '../metrics/metric_types.js';
import { Counter, CounterRegistry } from '../metrics/counters.js';
import { Gauge, GaugeRegistry, PercentageGauge, MemoryGauge } from '../metrics/gauges.js';
import { Histogram, HistogramRegistry, ResponseTimeHistogram, SizeHistogram } from '../metrics/histograms.js';
import { Timer, TimerRegistry, Stopwatch, PerformanceTimer } from '../metrics/timers.js';

/**
 * Example: Basic Performance Monitoring Setup
 */
async function basicPerformanceMonitoringExample() {
    console.log('🚀 Basic Performance Monitoring Example');
    
    // Initialize performance monitor
    const performanceMonitor = new PerformanceMonitor({
        enableDetailedMetrics: true,
        metricsInterval: 5000, // 5 seconds
        alertThresholds: {
            apiResponseTime: 1000, // 1 second
            errorRate: 0.05, // 5%
            memoryUsage: 0.8 // 80%
        }
    });
    
    await performanceMonitor.initialize();
    
    // Example: Timing an API request
    console.log('📊 Timing API request...');
    const timerId = performanceMonitor.startTimer('api_request', {
        endpoint: '/users',
        method: 'GET'
    });
    
    // Simulate API processing
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const duration = performanceMonitor.endTimer(timerId);
    console.log(`⏱️ API request completed in ${duration}ms`);
    
    // Example: Recording custom metrics
    performanceMonitor.incrementCounter('api_requests_total', {
        endpoint: '/users',
        status: '200'
    });
    
    performanceMonitor.setGauge('active_connections', 42, {
        server: 'web-01'
    });
    
    performanceMonitor.recordMetric(MetricTypes.ERROR_RATE, 0.02, {
        service: 'user-api'
    });
    
    // Get statistics
    const stats = await performanceMonitor.getStatistics();
    console.log('📈 Performance Statistics:', JSON.stringify(stats, null, 2));
    
    await performanceMonitor.shutdown();
}

/**
 * Example: Advanced Metrics Collection
 */
async function advancedMetricsCollectionExample() {
    console.log('🔍 Advanced Metrics Collection Example');
    
    // Initialize metrics collector with exporters
    const metricsCollector = new MetricsCollector({
        aggregationWindow: 60000, // 1 minute
        exportInterval: 30000, // 30 seconds
        retentionPeriod: 3600000 // 1 hour
    });
    
    // Add exporters
    metricsCollector.addExporter(new ConsoleExporter({
        logLevel: 'info',
        includeValues: true
    }));
    
    metricsCollector.addExporter(new FileExporter({
        filePath: './metrics.json',
        format: 'json'
    }));
    
    await metricsCollector.initialize();
    
    // Simulate collecting metrics over time
    console.log('📊 Collecting metrics...');
    for (let i = 0; i < 10; i++) {
        metricsCollector.collect({
            type: 'response_time',
            value: Math.random() * 1000 + 100,
            labels: { service: 'api', endpoint: '/data' },
            timestamp: Date.now()
        });
        
        metricsCollector.collect({
            type: 'memory_usage',
            value: Math.random() * 0.3 + 0.5, // 50-80%
            labels: { instance: 'server-01' },
            timestamp: Date.now()
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Get current metrics
    const currentMetrics = metricsCollector.getMetrics();
    console.log('📈 Current Metrics:', JSON.stringify(currentMetrics, null, 2));
    
    await metricsCollector.shutdown();
}

/**
 * Example: Health Checking System
 */
async function healthCheckingExample() {
    console.log('🏥 Health Checking Example');
    
    const healthChecker = new HealthChecker({
        healthCheckInterval: 10000, // 10 seconds
        defaultTimeout: 5000,
        enableAutoHealthChecks: true
    });
    
    await healthChecker.initialize();
    
    // Register various health checks
    healthChecker.registerService('database', async () => {
        // Simulate database health check
        const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
        if (!isHealthy) {
            throw new Error('Database connection failed');
        }
        return {
            connectionPool: 'active',
            responseTime: Math.random() * 50 + 10
        };
    }, {
        timeout: 3000,
        critical: true,
        retryCount: 3
    });
    
    healthChecker.registerService('external-api', async () => {
        // Simulate external API health check
        const isHealthy = Math.random() > 0.2; // 80% chance of being healthy
        if (!isHealthy) {
            throw new Error('External API unavailable');
        }
        return {
            status: 'operational',
            latency: Math.random() * 200 + 50
        };
    }, {
        timeout: 5000,
        critical: false
    });
    
    // Register built-in health checks
    healthChecker.registerService('memory', HealthCheckFunctions.memoryCheck(0.9), {
        critical: true
    });
    
    healthChecker.registerService('custom-check', HealthCheckFunctions.customCheck(async () => {
        return {
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        };
    }));
    
    // Check overall health
    const overallHealth = await healthChecker.checkHealth();
    console.log('🏥 Overall Health:', JSON.stringify(overallHealth, null, 2));
    
    // Check specific service
    const dbHealth = await healthChecker.checkServiceHealth('database');
    console.log('💾 Database Health:', JSON.stringify(dbHealth, null, 2));
    
    // Get health trends
    setTimeout(async () => {
        const trends = healthChecker.getHealthTrends('database', 60000);
        console.log('📊 Database Health Trends:', JSON.stringify(trends, null, 2));
    }, 5000);
    
    // Cleanup after demo
    setTimeout(async () => {
        await healthChecker.shutdown();
    }, 15000);
}

/**
 * Example: Alert Management System
 */
async function alertManagementExample() {
    console.log('🚨 Alert Management Example');
    
    const alertManager = new AlertManager({
        enableAlerts: true,
        alertCooldown: 60000, // 1 minute
        maxActiveAlerts: 100
    });
    
    await alertManager.initialize();
    
    // Add custom alert rules
    alertManager.addAlertRule('high-response-time', {
        type: 'metric',
        threshold: 500,
        operator: 'greater_than',
        severity: AlertSeverity.WARNING,
        message: 'API response time is too high',
        notificationChannels: ['console', 'email']
    });
    
    alertManager.addAlertRule('critical-error-rate', {
        type: 'metric',
        threshold: 0.1,
        operator: 'greater_than',
        severity: AlertSeverity.CRITICAL,
        message: 'Critical error rate detected',
        notificationChannels: ['console', 'slack']
    });
    
    // Add notification channels
    alertManager.addNotificationChannel('email', new EmailNotificationChannel({
        recipients: ['admin@example.com', 'ops@example.com']
    }));
    
    alertManager.addNotificationChannel('slack', new SlackNotificationChannel({
        channel: '#alerts',
        webhook: 'https://hooks.slack.com/services/...'
    }));
    
    // Simulate alerts
    console.log('🚨 Sending test alerts...');
    
    await alertManager.sendAlert({
        type: 'high-response-time',
        severity: AlertSeverity.WARNING,
        message: 'API response time exceeded threshold',
        value: 750,
        threshold: 500,
        labels: { service: 'user-api', endpoint: '/login' }
    });
    
    await alertManager.sendAlert({
        type: 'critical-error-rate',
        severity: AlertSeverity.CRITICAL,
        message: 'Critical error rate in payment service',
        value: 0.15,
        threshold: 0.1,
        labels: { service: 'payment-api' }
    });
    
    // Get active alerts
    const activeAlerts = alertManager.getActiveAlerts();
    console.log('🚨 Active Alerts:', JSON.stringify(activeAlerts, null, 2));
    
    // Get alert statistics
    const alertStats = await alertManager.getStatistics();
    console.log('📊 Alert Statistics:', JSON.stringify(alertStats, null, 2));
    
    await alertManager.shutdown();
}

/**
 * Example: Individual Metric Components
 */
async function individualMetricsExample() {
    console.log('📊 Individual Metrics Example');
    
    // Counter example
    console.log('🔢 Counter Example:');
    const requestCounter = new Counter('http_requests_total', 'Total HTTP requests');
    
    for (let i = 0; i < 10; i++) {
        requestCounter.increment(1, { method: 'GET', status: '200' });
    }
    
    console.log('Counter Value:', requestCounter.getValue());
    console.log('Counter Stats:', requestCounter.getStatistics());
    
    // Gauge example
    console.log('📏 Gauge Example:');
    const memoryGauge = new MemoryGauge('memory_usage', 'Current memory usage');
    
    memoryGauge.setMegabytes(512);
    console.log('Memory Gauge:', memoryGauge.getValue());
    
    const percentageGauge = new PercentageGauge('cpu_usage', 'CPU usage percentage');
    percentageGauge.setPercentage(75.5);
    console.log('CPU Gauge:', percentageGauge.getValue());
    
    // Histogram example
    console.log('📊 Histogram Example:');
    const responseTimeHistogram = new ResponseTimeHistogram('api_response_time', 'API response times');
    
    // Simulate response times
    const responseTimes = [50, 100, 150, 200, 300, 500, 750, 1000, 1200, 2000];
    responseTimes.forEach(time => responseTimeHistogram.observeMs(time));
    
    console.log('Response Time Histogram:', responseTimeHistogram.getValue());
    console.log('SLA Statistics:', responseTimeHistogram.getSLAStatistics([100, 500, 1000]));
    
    // Timer example
    console.log('⏱️ Timer Example:');
    const operationTimer = new Timer('database_operation', 'Database operation timing');
    
    // Time a database operation
    const timerId = operationTimer.start('query_users', { table: 'users' });
    await new Promise(resolve => setTimeout(resolve, 250)); // Simulate DB query
    const result = operationTimer.stop(timerId);
    
    console.log('Timer Result:', result);
    console.log('Timer Statistics:', operationTimer.getStatistics());
    
    // Stopwatch example
    console.log('⏱️ Stopwatch Example:');
    const stopwatch = new Stopwatch();
    
    stopwatch.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    stopwatch.lap();
    await new Promise(resolve => setTimeout(resolve, 150));
    stopwatch.lap();
    const elapsed = stopwatch.stop();
    
    console.log('Stopwatch Elapsed:', elapsed);
    console.log('Stopwatch Laps:', stopwatch.getLaps());
}

/**
 * Example: Complete System Integration
 */
async function completeSystemExample() {
    console.log('🎯 Complete System Integration Example');
    
    // Initialize system monitor with advanced monitoring
    const systemMonitor = new SystemMonitor({
        enable_metrics: true,
        enable_advanced_monitoring: true,
        enable_performance_tracking: true,
        health_check_interval: 10000,
        metrics_collection_interval: 5000,
        alertThresholds: {
            apiResponseTime: 1000,
            errorRate: 0.05,
            memoryUsage: 0.8
        }
    });
    
    await systemMonitor.initialize();
    await systemMonitor.startMonitoring();
    
    // Simulate application activity
    console.log('🏃 Simulating application activity...');
    
    // Simulate API requests
    for (let i = 0; i < 5; i++) {
        const timerId = systemMonitor.startTimer('api_request', {
            endpoint: `/api/data/${i}`,
            method: 'GET'
        });
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
        
        const duration = systemMonitor.endTimer(timerId);
        
        // Record additional metrics
        await systemMonitor.recordMetric('requests_processed', 1, 'count', {
            endpoint: `/api/data/${i}`,
            status: Math.random() > 0.1 ? 'success' : 'error'
        });
        
        console.log(`📊 API request ${i + 1} completed in ${duration}ms`);
    }
    
    // Update component health
    await systemMonitor.updateComponentHealth('database', {
        status: 'healthy',
        responseTime: 45,
        connectionPool: 'active'
    });
    
    await systemMonitor.updateComponentHealth('cache', {
        status: 'degraded',
        responseTime: 150,
        hitRate: 0.75
    });
    
    // Record system events
    await systemMonitor.recordEvent('deployment', {
        version: '1.2.3',
        environment: 'production',
        timestamp: new Date()
    });
    
    await systemMonitor.recordEvent('scaling', {
        action: 'scale_up',
        instances: 5,
        reason: 'high_load'
    });
    
    // Get comprehensive system metrics
    setTimeout(async () => {
        console.log('📈 Getting system metrics...');
        
        const systemHealth = await systemMonitor.getSystemHealth();
        console.log('🏥 System Health:', JSON.stringify(systemHealth, null, 2));
        
        const systemMetrics = await systemMonitor.getSystemMetrics();
        console.log('📊 System Metrics:', JSON.stringify(systemMetrics, null, 2));
        
        const performanceAnalytics = await systemMonitor.getPerformanceAnalytics();
        console.log('📈 Performance Analytics:', JSON.stringify(performanceAnalytics, null, 2));
        
        const monitoringStats = await systemMonitor.getStatistics();
        console.log('📊 Monitoring Statistics:', JSON.stringify(monitoringStats, null, 2));
        
        // Cleanup
        await systemMonitor.shutdown();
        console.log('✅ System monitoring example completed');
    }, 10000);
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('🚀 Starting Monitoring System Examples\n');
    
    try {
        await basicPerformanceMonitoringExample();
        console.log('\n' + '='.repeat(50) + '\n');
        
        await advancedMetricsCollectionExample();
        console.log('\n' + '='.repeat(50) + '\n');
        
        await healthCheckingExample();
        console.log('\n' + '='.repeat(50) + '\n');
        
        await alertManagementExample();
        console.log('\n' + '='.repeat(50) + '\n');
        
        await individualMetricsExample();
        console.log('\n' + '='.repeat(50) + '\n');
        
        await completeSystemExample();
        
    } catch (error) {
        console.error('❌ Error running examples:', error);
    }
}

// Export examples for individual use
export {
    basicPerformanceMonitoringExample,
    advancedMetricsCollectionExample,
    healthCheckingExample,
    alertManagementExample,
    individualMetricsExample,
    completeSystemExample,
    runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples();
}

