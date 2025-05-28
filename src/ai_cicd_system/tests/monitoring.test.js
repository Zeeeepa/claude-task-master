/**
 * @fileoverview Monitoring System Tests
 * @description Comprehensive tests for the monitoring and performance system
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PerformanceMonitor } from '../monitoring/performance_monitor.js';
import { MetricsCollector, ConsoleExporter } from '../monitoring/metrics_collector.js';
import { HealthChecker, HealthCheckFunctions } from '../monitoring/health_checker.js';
import { AlertManager } from '../alerts/alert_manager.js';
import { MetricTypes, AlertSeverity } from '../metrics/metric_types.js';

describe('Performance Monitor', () => {
  let performanceMonitor;

  beforeEach(async () => {
    performanceMonitor = new PerformanceMonitor({
      metricsInterval: 100, // Fast interval for testing
      alertThresholds: {
        apiResponseTime: 1000,
        errorRate: 0.1,
        memoryUsage: 0.8
      }
    });
    await performanceMonitor.initialize();
  });

  afterEach(async () => {
    await performanceMonitor.shutdown();
  });

  test('should initialize successfully', async () => {
    const health = await performanceMonitor.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.initialized).toBe(true);
  });

  test('should start and end timers correctly', () => {
    const timerId = performanceMonitor.startTimer('test_operation', { test: true });
    expect(timerId).toBeDefined();
    expect(typeof timerId).toBe('string');

    const duration = performanceMonitor.endTimer(timerId);
    expect(duration).toBeGreaterThan(0);
    expect(typeof duration).toBe('number');
  });

  test('should handle timer not found', () => {
    const duration = performanceMonitor.endTimer('non-existent-timer');
    expect(duration).toBeNull();
  });

  test('should increment counters correctly', () => {
    performanceMonitor.incrementCounter('test_counter', { service: 'test' });
    performanceMonitor.incrementCounter('test_counter', { service: 'test' }, 5);

    const stats = performanceMonitor.counters.get('test_counter_{"service":"test"}');
    expect(stats).toBe(6);
  });

  test('should set gauge values correctly', () => {
    performanceMonitor.setGauge('test_gauge', 42.5, { type: 'test' });

    const value = performanceMonitor.gauges.get('test_gauge_{"type":"test"}');
    expect(value).toBe(42.5);
  });

  test('should collect system metrics', async () => {
    await performanceMonitor.collectSystemMetrics();

    // Check that system metrics were recorded
    const stats = await performanceMonitor.getStatistics();
    expect(stats.gauges_tracked).toBeGreaterThan(0);
  });

  test('should trigger alerts when thresholds are exceeded', async () => {
    const alertSpy = jest.spyOn(performanceMonitor.alertManager, 'sendAlert');

    // Trigger high response time alert
    performanceMonitor.recordMetric(MetricTypes.API_RESPONSE_TIME, 2000);

    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MetricTypes.API_RESPONSE_TIME,
        severity: AlertSeverity.CRITICAL,
        value: 2000
      })
    );

    alertSpy.mockRestore();
  });

  test('should collect metrics with minimal overhead', async () => {
    const operations = 100;
    const start = process.hrtime.bigint();

    for (let i = 0; i < operations; i++) {
      const timerId = performanceMonitor.startTimer('test_operation');
      await new Promise(resolve => setTimeout(resolve, 1));
      performanceMonitor.endTimer(timerId);
    }

    const end = process.hrtime.bigint();
    const totalTime = Number(end - start) / 1000000;
    const avgOverhead = totalTime / operations;

    expect(avgOverhead).toBeLessThan(10); // Less than 10ms overhead per operation
  });

  test('should get performance statistics', async () => {
    // Add some test data
    performanceMonitor.incrementCounter('test_counter');
    performanceMonitor.setGauge('test_gauge', 100);
    
    const timerId = performanceMonitor.startTimer('test_timer');
    await new Promise(resolve => setTimeout(resolve, 10));
    performanceMonitor.endTimer(timerId);

    const stats = await performanceMonitor.getStatistics();
    
    expect(stats).toHaveProperty('timers_active');
    expect(stats).toHaveProperty('counters_tracked');
    expect(stats).toHaveProperty('gauges_tracked');
    expect(stats).toHaveProperty('histograms_tracked');
    expect(stats.counters_tracked).toBeGreaterThan(0);
    expect(stats.gauges_tracked).toBeGreaterThan(0);
  });
});

describe('Metrics Collector', () => {
  let metricsCollector;
  let consoleExporter;

  beforeEach(async () => {
    metricsCollector = new MetricsCollector({
      aggregationWindow: 100, // Fast window for testing
      exportInterval: 50,
      retentionPeriod: 1000
    });
    
    consoleExporter = new ConsoleExporter({ logLevel: 'debug' });
    metricsCollector.addExporter(consoleExporter);
    
    await metricsCollector.initialize();
  });

  afterEach(async () => {
    await metricsCollector.shutdown();
  });

  test('should initialize successfully', async () => {
    const health = await metricsCollector.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.initialized).toBe(true);
  });

  test('should collect metrics correctly', () => {
    const metric = {
      type: 'test_metric',
      value: 42,
      labels: { service: 'test' },
      timestamp: Date.now()
    };

    metricsCollector.collect(metric);

    const windowKey = metricsCollector.getWindowKey(metric.timestamp);
    const metrics = metricsCollector.getMetrics(windowKey);
    
    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe('test_metric');
    expect(metrics[0].count).toBe(1);
    expect(metrics[0].sum).toBe(42);
  });

  test('should aggregate metrics in time windows', () => {
    const baseTime = Date.now();
    
    // Add multiple metrics to the same window
    for (let i = 0; i < 5; i++) {
      metricsCollector.collect({
        type: 'test_metric',
        value: i + 1,
        labels: { service: 'test' },
        timestamp: baseTime + i
      });
    }

    const windowKey = metricsCollector.getWindowKey(baseTime);
    const metrics = metricsCollector.getMetrics(windowKey);
    
    expect(metrics).toHaveLength(1);
    expect(metrics[0].count).toBe(5);
    expect(metrics[0].sum).toBe(15); // 1+2+3+4+5
    expect(metrics[0].avg).toBe(3);
    expect(metrics[0].min).toBe(1);
    expect(metrics[0].max).toBe(5);
  });

  test('should calculate percentiles correctly', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    const p50 = metricsCollector.calculatePercentile(values, 0.5);
    const p95 = metricsCollector.calculatePercentile(values, 0.95);
    const p99 = metricsCollector.calculatePercentile(values, 0.99);
    
    expect(p50).toBe(5);
    expect(p95).toBe(10);
    expect(p99).toBe(10);
  });

  test('should export metrics to configured exporters', async () => {
    const exportSpy = jest.spyOn(consoleExporter, 'export');
    
    // Add some metrics
    metricsCollector.collect({
      type: 'test_metric',
      value: 100,
      labels: { service: 'test' },
      timestamp: Date.now() - 200 // Past window
    });

    // Wait for export
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(exportSpy).toHaveBeenCalled();
    exportSpy.mockRestore();
  });

  test('should get metrics for time range', () => {
    const now = Date.now();
    const startTime = now - 1000;
    const endTime = now;

    // Add metrics across different time windows
    for (let i = 0; i < 5; i++) {
      metricsCollector.collect({
        type: 'test_metric',
        value: i,
        labels: { service: 'test' },
        timestamp: startTime + (i * 200)
      });
    }

    const rangeMetrics = metricsCollector.getMetricsRange(startTime, endTime);
    expect(rangeMetrics.length).toBeGreaterThan(0);
    
    for (const windowMetrics of rangeMetrics) {
      expect(windowMetrics).toHaveProperty('window');
      expect(windowMetrics).toHaveProperty('metrics');
      expect(Array.isArray(windowMetrics.metrics)).toBe(true);
    }
  });

  test('should clean up old windows', async () => {
    const oldTime = Date.now() - 2000; // Beyond retention period
    
    metricsCollector.collect({
      type: 'old_metric',
      value: 1,
      labels: {},
      timestamp: oldTime
    });

    // Trigger cleanup
    metricsCollector.cleanupOldWindows();

    const oldWindowKey = metricsCollector.getWindowKey(oldTime);
    const metrics = metricsCollector.getMetrics(oldWindowKey);
    expect(metrics).toHaveLength(0);
  });
});

describe('Health Checker', () => {
  let healthChecker;

  beforeEach(async () => {
    healthChecker = new HealthChecker({
      healthCheckInterval: 100, // Fast interval for testing
      enableAutoHealthChecks: false // Disable auto checks for testing
    });
    await healthChecker.initialize();
  });

  afterEach(async () => {
    await healthChecker.shutdown();
  });

  test('should initialize successfully', async () => {
    const health = await healthChecker.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.initialized).toBe(true);
  });

  test('should register and check healthy service', async () => {
    const healthyService = jest.fn().mockResolvedValue({ status: 'ok' });
    
    healthChecker.registerService('test-service', healthyService, {
      timeout: 1000,
      critical: true
    });

    const result = await healthChecker.checkServiceHealth('test-service');
    
    expect(result.service).toBe('test-service');
    expect(result.status).toBe('healthy');
    expect(result.responseTime).toBeGreaterThan(0);
    expect(healthyService).toHaveBeenCalled();
  });

  test('should detect unhealthy service', async () => {
    const unhealthyService = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    healthChecker.registerService('failing-service', unhealthyService, {
      timeout: 1000,
      retryCount: 1 // Reduce retries for faster testing
    });

    const result = await healthChecker.checkServiceHealth('failing-service');
    
    expect(result.service).toBe('failing-service');
    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Service unavailable');
  });

  test('should handle service timeout', async () => {
    const slowService = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 2000))
    );
    
    healthChecker.registerService('slow-service', slowService, {
      timeout: 100 // Short timeout
    });

    const result = await healthChecker.checkServiceHealth('slow-service');
    
    expect(result.service).toBe('slow-service');
    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Health check timeout');
  });

  test('should calculate overall health correctly', async () => {
    const healthyService = jest.fn().mockResolvedValue({ status: 'ok' });
    const unhealthyService = jest.fn().mockRejectedValue(new Error('Failed'));
    
    healthChecker.registerService('healthy-service', healthyService, { critical: false });
    healthChecker.registerService('critical-service', unhealthyService, { critical: true });

    const overallHealth = await healthChecker.checkHealth();
    
    expect(overallHealth.status).toBe('critical'); // Critical service is down
    expect(overallHealth.summary.total).toBe(2);
    expect(overallHealth.summary.criticalUnhealthy).toBe(1);
  });

  test('should record health history', async () => {
    const service = jest.fn().mockResolvedValue({ status: 'ok' });
    
    healthChecker.registerService('test-service', service);

    // Check health multiple times
    await healthChecker.checkServiceHealth('test-service');
    await healthChecker.checkServiceHealth('test-service');
    await healthChecker.checkServiceHealth('test-service');

    const history = healthChecker.getHealthHistory('test-service');
    expect(history).toHaveLength(3);
    
    for (const record of history) {
      expect(record).toHaveProperty('service');
      expect(record).toHaveProperty('status');
      expect(record).toHaveProperty('timestamp');
    }
  });

  test('should calculate health trends', async () => {
    const service = jest.fn().mockResolvedValue({ status: 'ok' });
    
    healthChecker.registerService('test-service', service);

    // Generate some health history
    for (let i = 0; i < 10; i++) {
      await healthChecker.checkServiceHealth('test-service');
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const trends = healthChecker.getHealthTrends('test-service', 1000);
    
    expect(trends).toHaveProperty('availability');
    expect(trends).toHaveProperty('averageResponseTime');
    expect(trends).toHaveProperty('errorRate');
    expect(trends).toHaveProperty('totalChecks');
    expect(trends.availability).toBe(100); // All checks were healthy
    expect(trends.errorRate).toBe(0);
  });

  test('should use built-in health check functions', async () => {
    // Test memory check
    const memoryCheck = HealthCheckFunctions.memoryCheck(0.5); // 50% threshold
    const memoryResult = await memoryCheck();
    
    expect(memoryResult).toHaveProperty('heapUsed');
    expect(memoryResult).toHaveProperty('heapTotal');
    expect(memoryResult).toHaveProperty('usage');
    expect(memoryResult).toHaveProperty('threshold');

    // Test custom check
    const customCheck = HealthCheckFunctions.customCheck(() => ({ custom: 'data' }));
    const customResult = await customCheck();
    
    expect(customResult).toEqual({ custom: 'data' });
  });
});

describe('Alert Manager', () => {
  let alertManager;

  beforeEach(async () => {
    alertManager = new AlertManager({
      enableAlerts: true,
      alertCooldown: 100, // Fast cooldown for testing
      maxActiveAlerts: 10
    });
    await alertManager.initialize();
  });

  afterEach(async () => {
    await alertManager.shutdown();
  });

  test('should initialize successfully', async () => {
    const health = await alertManager.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.initialized).toBe(true);
  });

  test('should add and remove alert rules', () => {
    alertManager.addAlertRule('test-rule', {
      type: 'metric',
      threshold: 100,
      severity: AlertSeverity.WARNING,
      message: 'Test alert'
    });

    expect(alertManager.alertRules.has('test-rule')).toBe(true);

    alertManager.removeAlertRule('test-rule');
    expect(alertManager.alertRules.has('test-rule')).toBe(false);
  });

  test('should send alerts correctly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await alertManager.sendAlert({
      type: 'test_alert',
      severity: AlertSeverity.WARNING,
      message: 'Test alert message',
      value: 150,
      threshold: 100
    });

    const activeAlerts = alertManager.getActiveAlerts();
    expect(activeAlerts).toHaveLength(1);
    expect(activeAlerts[0].message).toBe('Test alert message');
    expect(activeAlerts[0].severity).toBe(AlertSeverity.WARNING);

    consoleSpy.mockRestore();
  });

  test('should respect alert cooldowns', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Send first alert
    await alertManager.sendAlert({
      type: 'test_alert',
      severity: AlertSeverity.WARNING,
      message: 'First alert',
      labels: { service: 'test' }
    });

    // Send second alert immediately (should be blocked by cooldown)
    await alertManager.sendAlert({
      type: 'test_alert',
      severity: AlertSeverity.WARNING,
      message: 'Second alert',
      labels: { service: 'test' }
    });

    const activeAlerts = alertManager.getActiveAlerts();
    expect(activeAlerts).toHaveLength(1); // Only first alert should be active

    consoleSpy.mockRestore();
  });

  test('should resolve alerts', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await alertManager.sendAlert({
      type: 'test_alert',
      severity: AlertSeverity.WARNING,
      message: 'Test alert'
    });

    const activeAlerts = alertManager.getActiveAlerts();
    expect(activeAlerts).toHaveLength(1);

    const alertId = activeAlerts[0].id;
    await alertManager.resolveAlert(alertId, 'Test resolution');

    const remainingAlerts = alertManager.getActiveAlerts();
    expect(remainingAlerts).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  test('should filter alerts correctly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Send alerts with different severities
    await alertManager.sendAlert({
      type: 'warning_alert',
      severity: AlertSeverity.WARNING,
      message: 'Warning alert'
    });

    await alertManager.sendAlert({
      type: 'critical_alert',
      severity: AlertSeverity.CRITICAL,
      message: 'Critical alert'
    });

    const warningAlerts = alertManager.getActiveAlerts({ severity: AlertSeverity.WARNING });
    const criticalAlerts = alertManager.getActiveAlerts({ severity: AlertSeverity.CRITICAL });

    expect(warningAlerts).toHaveLength(1);
    expect(criticalAlerts).toHaveLength(1);
    expect(warningAlerts[0].severity).toBe(AlertSeverity.WARNING);
    expect(criticalAlerts[0].severity).toBe(AlertSeverity.CRITICAL);

    consoleSpy.mockRestore();
  });

  test('should get alert statistics', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Send some test alerts
    await alertManager.sendAlert({
      type: 'test_alert_1',
      severity: AlertSeverity.WARNING,
      message: 'Test alert 1'
    });

    await alertManager.sendAlert({
      type: 'test_alert_2',
      severity: AlertSeverity.CRITICAL,
      message: 'Test alert 2'
    });

    const stats = await alertManager.getStatistics();

    expect(stats).toHaveProperty('active_alerts');
    expect(stats).toHaveProperty('total_alerts_fired');
    expect(stats).toHaveProperty('alerts_last_24h');
    expect(stats).toHaveProperty('alerts_by_severity_24h');
    expect(stats.active_alerts).toBe(2);
    expect(stats.total_alerts_fired).toBe(2);

    consoleSpy.mockRestore();
  });
});

describe('Integration Tests', () => {
  let performanceMonitor;

  beforeEach(async () => {
    performanceMonitor = new PerformanceMonitor({
      metricsInterval: 50,
      alertThresholds: {
        apiResponseTime: 100,
        errorRate: 0.1
      }
    });
    await performanceMonitor.initialize();
  });

  afterEach(async () => {
    await performanceMonitor.shutdown();
  });

  test('should integrate all monitoring components', async () => {
    // Test timer -> metrics -> alerts flow
    const timerId = performanceMonitor.startTimer('api_request', { endpoint: '/test' });
    
    // Simulate slow operation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const duration = performanceMonitor.endTimer(timerId);
    expect(duration).toBeGreaterThan(100);

    // Check that metrics were collected
    const stats = await performanceMonitor.getStatistics();
    expect(stats.histograms_tracked).toBeGreaterThan(0);

    // Check that alert was triggered (duration > threshold)
    const alertStats = await performanceMonitor.alertManager.getStatistics();
    expect(alertStats.total_alerts_fired).toBeGreaterThan(0);
  });

  test('should handle concurrent operations correctly', async () => {
    const operations = 10;
    const promises = [];

    // Start multiple concurrent operations
    for (let i = 0; i < operations; i++) {
      promises.push(
        new Promise(async (resolve) => {
          const timerId = performanceMonitor.startTimer('concurrent_op', { id: i });
          await new Promise(r => setTimeout(r, Math.random() * 50));
          const duration = performanceMonitor.endTimer(timerId);
          resolve(duration);
        })
      );
    }

    const durations = await Promise.all(promises);
    
    expect(durations).toHaveLength(operations);
    durations.forEach(duration => {
      expect(duration).toBeGreaterThan(0);
      expect(typeof duration).toBe('number');
    });

    // Check that all operations were tracked
    const stats = await performanceMonitor.getStatistics();
    expect(stats.histograms_tracked).toBeGreaterThan(0);
  });

  test('should maintain performance under load', async () => {
    const startTime = Date.now();
    const operations = 1000;

    // Perform many operations quickly
    for (let i = 0; i < operations; i++) {
      performanceMonitor.incrementCounter('load_test_counter');
      performanceMonitor.setGauge('load_test_gauge', i);
      performanceMonitor.recordMetric('load_test_metric', Math.random() * 100);
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTimePerOp = totalTime / operations;

    // Should handle 1000 operations in reasonable time
    expect(avgTimePerOp).toBeLessThan(1); // Less than 1ms per operation
    expect(totalTime).toBeLessThan(1000); // Less than 1 second total

    const stats = await performanceMonitor.getStatistics();
    expect(stats.counters_tracked).toBeGreaterThan(0);
    expect(stats.gauges_tracked).toBeGreaterThan(0);
  });
});

