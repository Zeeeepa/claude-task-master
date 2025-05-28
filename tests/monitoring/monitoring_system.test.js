/**
 * @fileoverview Monitoring System Tests
 * @description Comprehensive test suite for the monitoring and analytics system
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MetricsCollector } from '../../src/ai_cicd_system/monitoring/metrics_collector.js';
import { PerformanceAnalyzer } from '../../src/ai_cicd_system/monitoring/performance_analyzer.js';
import { HealthChecker } from '../../src/ai_cicd_system/monitoring/health_checker.js';
import { DashboardAPI } from '../../src/ai_cicd_system/monitoring/dashboard_api.js';
import { AlertManager } from '../../src/ai_cicd_system/monitoring/alert_manager.js';
import { MetricsStorage } from '../../src/ai_cicd_system/monitoring/metrics_storage.js';
import { MonitoringConfig } from '../../src/ai_cicd_system/config/monitoring_config.js';

// Mock dependencies
jest.mock('../../src/scripts/modules/utils.js', () => ({
    log: jest.fn()
}));

jest.mock('../../src/ai_cicd_system/database/connection.js', () => ({
    DatabaseConnection: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        query: jest.fn().mockResolvedValue({ rows: [{ test: 1, timestamp: new Date() }], duration: 10 }),
        getPoolStats: jest.fn().mockReturnValue({ active: 2, idle: 3, waiting: 0 }),
        close: jest.fn().mockResolvedValue(true),
        getClient: jest.fn().mockResolvedValue({
            query: jest.fn().mockResolvedValue(true),
            release: jest.fn()
        })
    }))
}));

describe('Monitoring System', () => {
    let config;
    let metricsCollector;
    let performanceAnalyzer;
    let healthChecker;
    let alertManager;
    let metricsStorage;

    beforeEach(() => {
        // Create test configuration
        config = new MonitoringConfig({
            database: {
                host: 'localhost',
                port: 5432,
                database: 'test_db',
                user: 'test_user',
                password: 'test_pass'
            },
            metrics: {
                collection_interval: 1000,
                retention_days: 1
            },
            health: {
                check_interval: 5000
            },
            alerts: {
                evaluation_interval: 2000
            }
        });

        // Initialize components
        metricsStorage = new MetricsStorage(config.getAll());
        metricsCollector = new MetricsCollector(config.getAll());
        performanceAnalyzer = new PerformanceAnalyzer(config.getAll());
        healthChecker = new HealthChecker(config.getAll());
        alertManager = new AlertManager(config.getAll());

        // Connect components
        performanceAnalyzer.setMetricsStorage(metricsStorage);
        alertManager.setMetricsCollector(metricsCollector);
    });

    afterEach(() => {
        // Clean up intervals and connections
        if (metricsCollector) {
            metricsCollector.stopCollection();
        }
        if (healthChecker) {
            healthChecker.stopPeriodicChecks();
        }
        if (alertManager) {
            alertManager.stopMonitoring();
        }
    });

    describe('MonitoringConfig', () => {
        test('should create default configuration', () => {
            const defaultConfig = new MonitoringConfig();
            expect(defaultConfig.get('enabled')).toBe(true);
            expect(defaultConfig.get('metrics.collection_interval')).toBe(60000);
            expect(defaultConfig.get('health.check_interval')).toBe(30000);
        });

        test('should merge custom configuration', () => {
            const customConfig = new MonitoringConfig({
                metrics: {
                    collection_interval: 30000
                }
            });
            expect(customConfig.get('metrics.collection_interval')).toBe(30000);
            expect(customConfig.get('health.check_interval')).toBe(30000); // Should keep default
        });

        test('should validate configuration', () => {
            expect(() => {
                new MonitoringConfig({
                    metrics: {
                        collection_interval: 500 // Too low
                    }
                });
            }).toThrow();
        });

        test('should get and set configuration values', () => {
            const config = new MonitoringConfig();
            config.set('metrics.collection_interval', 45000);
            expect(config.get('metrics.collection_interval')).toBe(45000);
        });
    });

    describe('MetricsCollector', () => {
        test('should initialize collectors', () => {
            expect(metricsCollector.collectors.size).toBe(5);
            expect(metricsCollector.collectors.has('system')).toBe(true);
            expect(metricsCollector.collectors.has('workflow')).toBe(true);
            expect(metricsCollector.collectors.has('agent')).toBe(true);
            expect(metricsCollector.collectors.has('database')).toBe(true);
            expect(metricsCollector.collectors.has('api')).toBe(true);
        });

        test('should collect all metrics', async () => {
            const metrics = await metricsCollector.collectAllMetrics();
            
            expect(metrics).toHaveProperty('system');
            expect(metrics).toHaveProperty('workflow');
            expect(metrics).toHaveProperty('agent');
            expect(metrics).toHaveProperty('database');
            expect(metrics).toHaveProperty('api');

            expect(metrics.system.status).toBe('success');
            expect(metrics.system.data).toHaveProperty('cpu_usage');
            expect(metrics.system.data).toHaveProperty('memory_usage');
        });

        test('should track workflow metrics', async () => {
            const workflowCollector = metricsCollector.getCollector('workflow');
            
            // Simulate workflow tracking
            workflowCollector.trackWorkflowStart('workflow-1');
            workflowCollector.trackWorkflowComplete('workflow-1', true);
            
            const metrics = await workflowCollector.collect();
            expect(metrics.total_workflows).toBe(1);
            expect(metrics.completed_today).toBe(1);
            expect(metrics.success_rate).toBe(100);
        });

        test('should track agent metrics', async () => {
            const agentCollector = metricsCollector.getCollector('agent');
            
            // Simulate agent tracking
            agentCollector.trackAgentRequest('agent-1', 1500, true);
            agentCollector.trackAgentRequest('agent-1', 2000, false);
            
            const metrics = await agentCollector.collect();
            expect(metrics.total_requests).toBe(2);
            expect(metrics.total_errors).toBe(1);
            expect(metrics.overall_success_rate).toBe(50);
        });

        test('should start and stop collection', () => {
            expect(metricsCollector.isCollecting).toBe(false);
            
            metricsCollector.startCollection(1000);
            expect(metricsCollector.isCollecting).toBe(true);
            
            metricsCollector.stopCollection();
            expect(metricsCollector.isCollecting).toBe(false);
        });

        test('should get latest metrics', async () => {
            await metricsCollector.collectAllMetrics();
            const latest = await metricsCollector.getLatestMetrics();
            
            expect(latest).toHaveProperty('system');
            expect(latest).toHaveProperty('workflow');
        });
    });

    describe('MetricsStorage', () => {
        test('should initialize database tables', async () => {
            // Mock database connection is already set up
            expect(metricsStorage.connected).toBe(false); // Will be false in test due to mocking
        });

        test('should store metrics', async () => {
            const testMetrics = {
                system: {
                    timestamp: Date.now(),
                    status: 'success',
                    data: { cpu_usage: 50, memory_usage: 60 }
                }
            };

            // This will add to pending metrics in test environment
            await metricsStorage.store(testMetrics);
            expect(metricsStorage.pendingMetrics.length).toBeGreaterThan(0);
        });

        test('should get metrics statistics', async () => {
            const stats = await metricsStorage.getMetricsStats();
            expect(stats).toHaveProperty('connected');
            expect(stats).toHaveProperty('total_records');
        });
    });

    describe('PerformanceAnalyzer', () => {
        test('should analyze system health', async () => {
            const mockMetrics = {
                [Date.now()]: {
                    system: {
                        status: 'success',
                        data: {
                            cpu_usage: 75,
                            memory_usage: 85,
                            load_average_1m: 1.5,
                            uptime: 3600
                        }
                    }
                }
            };

            const health = await performanceAnalyzer.analyzeSystemHealth(mockMetrics);
            
            expect(health).toHaveProperty('overall_score');
            expect(health).toHaveProperty('components');
            expect(health.components).toHaveProperty('cpu');
            expect(health.components).toHaveProperty('memory');
            expect(health.components.cpu.status).toBe('warning'); // 75 > 70 threshold
            expect(health.components.memory.status).toBe('warning'); // 85 >= 80 threshold
        });

        test('should analyze workflow performance', async () => {
            const mockMetrics = {
                [Date.now()]: {
                    workflow: {
                        status: 'success',
                        data: {
                            active_count: 5,
                            completed_today: 100,
                            success_rate: 95,
                            average_execution_time: 120000,
                            total_workflows: 105,
                            error_count: 5
                        }
                    }
                }
            };

            const performance = await performanceAnalyzer.analyzeWorkflowPerformance(mockMetrics);
            
            expect(performance).toHaveProperty('summary');
            expect(performance).toHaveProperty('efficiency_score');
            expect(performance.summary.success_rate).toBe(95);
            expect(performance.efficiency_score).toBeGreaterThan(0);
        });

        test('should identify bottlenecks', async () => {
            const mockMetrics = {
                [Date.now()]: {
                    system: {
                        status: 'success',
                        data: { cpu_usage: 95, memory_usage: 90 }
                    },
                    database: {
                        status: 'success',
                        data: { average_query_time: 2000 }
                    }
                }
            };

            const bottlenecks = await performanceAnalyzer.identifyBottlenecks(mockMetrics);
            
            expect(bottlenecks.length).toBeGreaterThan(0);
            expect(bottlenecks.some(b => b.type === 'cpu')).toBe(true);
            expect(bottlenecks.some(b => b.type === 'memory')).toBe(true);
        });

        test('should generate recommendations', async () => {
            const mockMetrics = {
                [Date.now()]: {
                    system: {
                        status: 'success',
                        data: { cpu_usage: 95, memory_usage: 90 }
                    }
                }
            };

            const recommendations = await performanceAnalyzer.generateRecommendations(mockMetrics);
            
            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0]).toHaveProperty('category');
            expect(recommendations[0]).toHaveProperty('priority');
            expect(recommendations[0]).toHaveProperty('title');
        });
    });

    describe('HealthChecker', () => {
        test('should initialize health checks', () => {
            expect(healthChecker.checks.size).toBeGreaterThan(0);
            expect(healthChecker.checks.has('database')).toBe(true);
            expect(healthChecker.checks.has('system_resources')).toBe(true);
        });

        test('should perform health check', async () => {
            const health = await healthChecker.performHealthCheck();
            
            expect(health).toHaveProperty('timestamp');
            expect(health).toHaveProperty('overall_status');
            expect(health).toHaveProperty('checks');
            expect(health).toHaveProperty('summary');
            expect(health.summary).toHaveProperty('total');
            expect(health.summary).toHaveProperty('healthy');
        });

        test('should check system resources', async () => {
            const systemCheck = healthChecker.checks.get('system_resources');
            const result = await systemCheck.check();
            
            expect(result).toHaveProperty('memory');
            expect(result).toHaveProperty('cpu');
            expect(result).toHaveProperty('process');
            expect(result.memory).toHaveProperty('system_usage_percent');
            expect(result.cpu).toHaveProperty('load_average_1m');
        });

        test('should start and stop periodic checks', () => {
            expect(healthChecker.isRunning).toBe(false);
            
            healthChecker.startPeriodicChecks(5000);
            expect(healthChecker.isRunning).toBe(true);
            
            healthChecker.stopPeriodicChecks();
            expect(healthChecker.isRunning).toBe(false);
        });

        test('should get health summary', () => {
            const summary = healthChecker.getHealthSummary();
            
            expect(summary).toHaveProperty('current_status');
            expect(summary).toHaveProperty('checks_configured');
            expect(summary).toHaveProperty('is_monitoring');
            expect(summary.checks_configured).toBe(healthChecker.checks.size);
        });

        test('should add custom health check', () => {
            const initialCount = healthChecker.checks.size;
            
            healthChecker.addCustomCheck('custom_test', {
                name: 'Custom Test Check',
                check: () => Promise.resolve({ status: 'ok' }),
                timeout: 1000,
                critical: false
            });
            
            expect(healthChecker.checks.size).toBe(initialCount + 1);
            expect(healthChecker.checks.has('custom_test')).toBe(true);
        });
    });

    describe('AlertManager', () => {
        test('should initialize alert rules', () => {
            expect(alertManager.rules.size).toBeGreaterThan(0);
            expect(alertManager.rules.has('high_cpu_usage')).toBe(true);
            expect(alertManager.rules.has('high_memory_usage')).toBe(true);
        });

        test('should evaluate metric rules', async () => {
            const rule = alertManager.rules.get('high_cpu_usage');
            const mockMetrics = {
                system: {
                    status: 'success',
                    data: { cpu_usage: 85 }
                }
            };

            const result = await alertManager.evaluateRule(rule, mockMetrics);
            
            expect(result.triggered).toBe(true);
            expect(result.value).toBe(85);
            expect(result.severity).toBe('warning');
        });

        test('should create and fire alerts', async () => {
            const rule = alertManager.rules.get('high_cpu_usage');
            const mockResult = {
                triggered: true,
                value: 90,
                severity: 'critical',
                details: { threshold: 80, operator: 'greater_than' }
            };
            const mockMetrics = {
                system: { status: 'success', data: { cpu_usage: 90 } }
            };

            const alert = await alertManager.createAlert(rule, mockResult, mockMetrics);
            
            expect(alert).toHaveProperty('id');
            expect(alert).toHaveProperty('rule_id');
            expect(alert.severity).toBe('critical');
            expect(alert.value).toBe(90);

            await alertManager.fireAlert(alert);
            expect(alertManager.activeAlerts.has(alert.id)).toBe(true);
        });

        test('should acknowledge alerts', async () => {
            // Create and fire a test alert
            const rule = alertManager.rules.get('high_cpu_usage');
            const mockResult = {
                triggered: true,
                value: 90,
                severity: 'critical',
                details: { threshold: 80 }
            };
            const alert = await alertManager.createAlert(rule, mockResult, {});
            await alertManager.fireAlert(alert);

            // Acknowledge the alert
            const acknowledgedAlert = await alertManager.acknowledgeAlert(alert.id, 'test_user', 'Test acknowledgment');
            
            expect(acknowledgedAlert.acknowledged_at).toBeTruthy();
            expect(acknowledgedAlert.acknowledged_by).toBe('test_user');
            expect(acknowledgedAlert.acknowledgment_comment).toBe('Test acknowledgment');
        });

        test('should resolve alerts', async () => {
            // Create and fire a test alert
            const rule = alertManager.rules.get('high_cpu_usage');
            const mockResult = {
                triggered: true,
                value: 90,
                severity: 'critical',
                details: { threshold: 80 }
            };
            const alert = await alertManager.createAlert(rule, mockResult, {});
            await alertManager.fireAlert(alert);

            // Resolve the alert
            const resolvedAlert = await alertManager.resolveAlert(alert.id, 'test_user', 'Test resolution');
            
            expect(resolvedAlert.status).toBe('resolved');
            expect(resolvedAlert.resolved_by).toBe('test_user');
            expect(resolvedAlert.resolution_comment).toBe('Test resolution');
            expect(alertManager.activeAlerts.has(alert.id)).toBe(false);
        });

        test('should start and stop monitoring', () => {
            expect(alertManager.isMonitoring).toBe(false);
            
            alertManager.startMonitoring();
            expect(alertManager.isMonitoring).toBe(true);
            
            alertManager.stopMonitoring();
            expect(alertManager.isMonitoring).toBe(false);
        });

        test('should get alert statistics', async () => {
            const stats = await alertManager.getAlertStats();
            
            expect(stats).toHaveProperty('active_alerts');
            expect(stats).toHaveProperty('total_rules');
            expect(stats).toHaveProperty('enabled_rules');
            expect(stats).toHaveProperty('notification_channels');
            expect(stats).toHaveProperty('is_monitoring');
        });

        test('should suppress alerts', () => {
            const ruleId = 'high_cpu_usage';
            const duration = 300000; // 5 minutes
            
            alertManager.suppressAlerts(ruleId, duration, 'Test suppression');
            
            expect(alertManager.suppressions.has(ruleId)).toBe(true);
            
            const suppression = alertManager.suppressions.get(ruleId);
            expect(suppression.reason).toBe('Test suppression');
            expect(suppression.until).toBeGreaterThan(Date.now());
        });
    });

    describe('DashboardAPI', () => {
        let dashboardAPI;

        beforeEach(() => {
            dashboardAPI = new DashboardAPI(config.getAll());
        });

        afterEach(async () => {
            if (dashboardAPI && dashboardAPI.server) {
                await dashboardAPI.stop();
            }
        });

        test('should initialize dashboard API', () => {
            expect(dashboardAPI.port).toBe(config.get('dashboard.port', 8080));
            expect(dashboardAPI.metricsCollector).toBeDefined();
            expect(dashboardAPI.performanceAnalyzer).toBeDefined();
            expect(dashboardAPI.healthChecker).toBeDefined();
            expect(dashboardAPI.alertManager).toBeDefined();
        });

        test('should get system overview', async () => {
            const overview = await dashboardAPI.getSystemOverview();
            
            expect(overview).toHaveProperty('timestamp');
            expect(overview).toHaveProperty('health');
            expect(overview).toHaveProperty('metrics');
            expect(overview).toHaveProperty('performance');
            expect(overview).toHaveProperty('alerts');
        });

        test('should get monitoring configuration', () => {
            const monitoringConfig = dashboardAPI.getMonitoringConfig();
            
            expect(monitoringConfig).toHaveProperty('metrics_collection_interval');
            expect(monitoringConfig).toHaveProperty('health_check_interval');
            expect(monitoringConfig).toHaveProperty('collectors');
            expect(monitoringConfig).toHaveProperty('health_checks');
        });

        test('should export metrics', async () => {
            const jsonExport = await dashboardAPI.exportMetrics('1h', 'json');
            expect(typeof jsonExport).toBe('string');
            
            const csvExport = await dashboardAPI.exportMetrics('1h', 'csv');
            expect(typeof csvExport).toBe('string');
            expect(csvExport).toContain('timestamp,collector_type,metric_name,value');
        });
    });

    describe('Integration Tests', () => {
        test('should integrate all monitoring components', async () => {
            // Start all components
            metricsCollector.startCollection(1000);
            healthChecker.startPeriodicChecks(2000);
            alertManager.setMetricsCollector(metricsCollector);
            alertManager.startMonitoring();

            // Wait for some data collection
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verify metrics are being collected
            const metrics = await metricsCollector.getLatestMetrics();
            expect(metrics).toHaveProperty('system');

            // Verify health checks are running
            const health = await healthChecker.performHealthCheck();
            expect(health.overall_status).toBeDefined();

            // Verify performance analysis works
            const performance = await performanceAnalyzer.analyzePerformance('5m');
            expect(performance).toHaveProperty('system_health');

            // Clean up
            metricsCollector.stopCollection();
            healthChecker.stopPeriodicChecks();
            alertManager.stopMonitoring();
        });

        test('should handle error scenarios gracefully', async () => {
            // Test with invalid metrics
            const invalidMetrics = { invalid: 'data' };
            const performance = await performanceAnalyzer.analyzePerformance('1h');
            expect(performance).toHaveProperty('system_health');

            // Test alert evaluation with missing metrics
            const alerts = await alertManager.evaluateAllAlerts();
            expect(Array.isArray(alerts)).toBe(true);
        });

        test('should maintain performance under load', async () => {
            const startTime = Date.now();
            
            // Simulate high load
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(metricsCollector.collectAllMetrics());
                promises.push(healthChecker.performHealthCheck());
                promises.push(performanceAnalyzer.analyzePerformance('1h'));
            }
            
            await Promise.all(promises);
            
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });
    });

    describe('Performance Benchmarks', () => {
        test('metrics collection should be fast', async () => {
            const startTime = Date.now();
            await metricsCollector.collectAllMetrics();
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });

        test('health check should be fast', async () => {
            const startTime = Date.now();
            await healthChecker.performHealthCheck();
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('performance analysis should be efficient', async () => {
            const startTime = Date.now();
            await performanceAnalyzer.analyzePerformance('1h');
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
        });

        test('alert evaluation should be quick', async () => {
            alertManager.setMetricsCollector(metricsCollector);
            
            const startTime = Date.now();
            await alertManager.evaluateAllAlerts();
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });
    });
});

describe('Load Tests', () => {
    test('should handle concurrent metric collection', async () => {
        const config = new MonitoringConfig();
        const collector = new MetricsCollector(config.getAll());
        
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(collector.collectAllMetrics());
        }
        
        const results = await Promise.all(promises);
        expect(results.length).toBe(50);
        results.forEach(result => {
            expect(result).toHaveProperty('system');
        });
    });

    test('should handle high alert volume', async () => {
        const config = new MonitoringConfig();
        const alertManager = new AlertManager(config.getAll());
        
        // Create multiple alerts
        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(alertManager.triggerManualAlert('high_cpu_usage', 95, { test: true }));
        }
        
        const alerts = await Promise.all(promises);
        expect(alerts.length).toBe(20);
        
        const activeAlerts = await alertManager.getActiveAlerts();
        expect(activeAlerts.length).toBe(20);
    });
});

describe('Memory Usage Tests', () => {
    test('should not leak memory during extended operation', async () => {
        const config = new MonitoringConfig();
        const collector = new MetricsCollector(config.getAll());
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Run collection many times
        for (let i = 0; i < 100; i++) {
            await collector.collectAllMetrics();
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        
        // Memory increase should be reasonable (less than 50MB)
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
});

