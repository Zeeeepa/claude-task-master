/**
 * @fileoverview Dashboard API
 * @description RESTful API for monitoring dashboards and real-time data access
 */

import { log } from '../../scripts/modules/utils.js';
import { MetricsCollector } from './metrics_collector.js';
import { PerformanceAnalyzer } from './performance_analyzer.js';
import { HealthChecker } from './health_checker.js';
import { AlertManager } from './alert_manager.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';

/**
 * Dashboard API for monitoring system
 */
export class DashboardAPI {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.server = null;
        this.port = config.dashboard_port || 8080;
        
        // Initialize monitoring components
        this.metricsCollector = new MetricsCollector(config);
        this.performanceAnalyzer = new PerformanceAnalyzer(config);
        this.healthChecker = new HealthChecker(config);
        this.alertManager = new AlertManager(config);
        
        // Connect components
        this.performanceAnalyzer.setMetricsStorage(this.metricsCollector.storage);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        this.app.use(cors({
            origin: this.config.cors_origins || ['http://localhost:3000', 'http://localhost:8080'],
            credentials: true
        }));
        
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging middleware
        this.app.use((req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                log('debug', `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
                
                // Track API metrics
                const apiCollector = this.metricsCollector.getCollector('api');
                if (apiCollector) {
                    apiCollector.trackRequest(req.path, res.statusCode, duration);
                }
            });
            
            next();
        });

        // Error handling middleware
        this.app.use((error, req, res, next) => {
            log('error', `API Error: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.healthChecker.performHealthCheck();
                res.status(health.overall_status === 'healthy' ? 200 : 503).json(health);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System overview endpoint
        this.app.get('/api/monitoring/overview', async (req, res) => {
            try {
                const overview = await this.getSystemOverview();
                res.json(overview);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Current metrics endpoint
        this.app.get('/api/monitoring/metrics', async (req, res) => {
            try {
                const metrics = await this.metricsCollector.getLatestMetrics();
                res.json(metrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Historical metrics endpoint
        this.app.get('/api/monitoring/metrics/history', async (req, res) => {
            try {
                const timeRange = req.query.range || '1h';
                const collectorType = req.query.type || null;
                
                const metrics = await this.metricsCollector.getMetrics(timeRange);
                
                if (collectorType) {
                    // Filter by collector type
                    const filteredMetrics = {};
                    Object.keys(metrics).forEach(timestamp => {
                        if (metrics[timestamp][collectorType]) {
                            filteredMetrics[timestamp] = {
                                [collectorType]: metrics[timestamp][collectorType]
                            };
                        }
                    });
                    res.json(filteredMetrics);
                } else {
                    res.json(metrics);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Performance analysis endpoint
        this.app.get('/api/monitoring/performance', async (req, res) => {
            try {
                const timeRange = req.query.range || '1h';
                const performance = await this.performanceAnalyzer.analyzePerformance(timeRange);
                res.json(performance);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Workflow metrics endpoint
        this.app.get('/api/monitoring/workflows', async (req, res) => {
            try {
                const timeRange = req.query.range || '24h';
                const workflowMetrics = await this.getWorkflowMetrics(timeRange);
                res.json(workflowMetrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Agent metrics endpoint
        this.app.get('/api/monitoring/agents', async (req, res) => {
            try {
                const agentMetrics = await this.getAgentMetrics();
                res.json(agentMetrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Database metrics endpoint
        this.app.get('/api/monitoring/database', async (req, res) => {
            try {
                const dbMetrics = await this.getDatabaseMetrics();
                res.json(dbMetrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // API metrics endpoint
        this.app.get('/api/monitoring/api', async (req, res) => {
            try {
                const apiMetrics = await this.getAPIMetrics();
                res.json(apiMetrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Alerts endpoint
        this.app.get('/api/monitoring/alerts', async (req, res) => {
            try {
                const alerts = await this.alertManager.getActiveAlerts();
                res.json(alerts);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Alert history endpoint
        this.app.get('/api/monitoring/alerts/history', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const alerts = await this.alertManager.getAlertHistory(limit);
                res.json(alerts);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Acknowledge alert endpoint
        this.app.post('/api/monitoring/alerts/:alertId/acknowledge', async (req, res) => {
            try {
                const { alertId } = req.params;
                const { user, comment } = req.body;
                
                const result = await this.alertManager.acknowledgeAlert(alertId, user, comment);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System statistics endpoint
        this.app.get('/api/monitoring/stats', async (req, res) => {
            try {
                const stats = await this.getSystemStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Configuration endpoint
        this.app.get('/api/monitoring/config', async (req, res) => {
            try {
                const config = this.getMonitoringConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Trigger manual metrics collection
        this.app.post('/api/monitoring/collect', async (req, res) => {
            try {
                const metrics = await this.metricsCollector.collectAllMetrics();
                res.json({
                    success: true,
                    timestamp: Date.now(),
                    metrics_collected: Object.keys(metrics).length
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export metrics endpoint
        this.app.get('/api/monitoring/export', async (req, res) => {
            try {
                const format = req.query.format || 'json';
                const timeRange = req.query.range || '24h';
                
                const exportData = await this.exportMetrics(timeRange, format);
                
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', 'attachment; filename=metrics.csv');
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', 'attachment; filename=metrics.json');
                }
                
                res.send(exportData);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    /**
     * Setup WebSocket for real-time updates
     */
    setupWebSocket() {
        // WebSocket implementation would go here
        // For now, we'll use Server-Sent Events as a simpler alternative
        
        this.app.get('/api/monitoring/stream', (req, res) => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            const sendUpdate = async () => {
                try {
                    const overview = await this.getSystemOverview();
                    res.write(`data: ${JSON.stringify(overview)}\n\n`);
                } catch (error) {
                    log('error', `Error sending SSE update: ${error.message}`);
                }
            };

            // Send initial data
            sendUpdate();

            // Send updates every 30 seconds
            const interval = setInterval(sendUpdate, 30000);

            // Clean up on client disconnect
            req.on('close', () => {
                clearInterval(interval);
                res.end();
            });
        });
    }

    /**
     * Get comprehensive system overview
     */
    async getSystemOverview() {
        try {
            const [health, metrics, performance, alerts] = await Promise.all([
                this.healthChecker.performHealthCheck(),
                this.metricsCollector.getLatestMetrics(),
                this.performanceAnalyzer.analyzePerformance('1h'),
                this.alertManager.getActiveAlerts()
            ]);

            return {
                timestamp: new Date().toISOString(),
                health: {
                    overall_status: health.overall_status,
                    score: health.summary.healthy / health.summary.total * 100,
                    critical_issues: health.summary.critical,
                    warnings: health.summary.warning
                },
                metrics: {
                    active_workflows: metrics.workflow?.data?.active_count || 0,
                    completed_tasks: metrics.workflow?.data?.completed_today || 0,
                    error_rate: metrics.system?.data?.error_rate || 0,
                    response_time: metrics.api?.data?.avg_response_time || 0,
                    cpu_usage: metrics.system?.data?.cpu_usage || 0,
                    memory_usage: metrics.system?.data?.memory_usage || 0
                },
                performance: {
                    system_score: performance.system_health?.overall_score || 0,
                    workflow_efficiency: performance.workflow_performance?.efficiency_score || 0,
                    agent_efficiency: performance.agent_efficiency?.overall_efficiency || 0,
                    bottlenecks: performance.bottlenecks?.slice(0, 3) || [],
                    recommendations: performance.recommendations?.slice(0, 5) || []
                },
                alerts: {
                    active_count: alerts.length,
                    critical_count: alerts.filter(a => a.severity === 'critical').length,
                    recent_alerts: alerts.slice(0, 5)
                }
            };
        } catch (error) {
            log('error', `Error getting system overview: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get workflow metrics
     */
    async getWorkflowMetrics(timeRange = '24h') {
        try {
            const metrics = await this.metricsCollector.getMetrics(timeRange);
            
            return {
                execution_times: await this.getWorkflowExecutionTimes(metrics),
                success_rates: await this.getWorkflowSuccessRates(metrics),
                agent_utilization: await this.getAgentUtilization(metrics),
                error_breakdown: await this.getErrorBreakdown(metrics),
                throughput: await this.getWorkflowThroughput(metrics)
            };
        } catch (error) {
            log('error', `Error getting workflow metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get agent metrics
     */
    async getAgentMetrics() {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            const agentData = metrics.agent?.data || {};
            
            return {
                summary: {
                    total_agents: agentData.total_agents || 0,
                    total_requests: agentData.total_requests || 0,
                    average_response_time: agentData.average_response_time || 0,
                    overall_success_rate: agentData.overall_success_rate || 100
                },
                agents: agentData.agents || [],
                performance_trends: await this.getAgentPerformanceTrends()
            };
        } catch (error) {
            log('error', `Error getting agent metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get database metrics
     */
    async getDatabaseMetrics() {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            const dbData = metrics.database?.data || {};
            
            return {
                summary: {
                    total_queries: dbData.total_queries || 0,
                    average_query_time: dbData.average_query_time || 0,
                    query_success_rate: dbData.query_success_rate || 100,
                    slow_queries: dbData.slow_queries || 0
                },
                connection_pool: {
                    active: dbData.connection_pool_active || 0,
                    idle: dbData.connection_pool_idle || 0,
                    waiting: dbData.connection_pool_waiting || 0,
                    total: dbData.connection_pool_total || 0
                },
                performance_analysis: await this.getDatabasePerformanceAnalysis()
            };
        } catch (error) {
            log('error', `Error getting database metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get API metrics
     */
    async getAPIMetrics() {
        try {
            const metrics = await this.metricsCollector.getLatestMetrics();
            const apiData = metrics.api?.data || {};
            
            return {
                summary: {
                    total_requests: apiData.total_requests || 0,
                    average_response_time: apiData.avg_response_time || 0,
                    success_rate: apiData.success_rate || 100,
                    total_errors: apiData.total_errors || 0
                },
                endpoints: apiData.endpoints || [],
                status_codes: apiData.status_codes || [],
                performance_trends: await this.getAPIPerformanceTrends()
            };
        } catch (error) {
            log('error', `Error getting API metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get system statistics
     */
    async getSystemStats() {
        try {
            const [metricsStats, healthSummary, alertStats] = await Promise.all([
                this.metricsCollector.storage.getMetricsStats(),
                this.healthChecker.getHealthSummary(),
                this.alertManager.getAlertStats()
            ]);

            return {
                metrics: metricsStats,
                health: healthSummary,
                alerts: alertStats,
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                node_version: process.version
            };
        } catch (error) {
            log('error', `Error getting system stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get monitoring configuration
     */
    getMonitoringConfig() {
        return {
            metrics_collection_interval: this.config.metrics_collection_interval || 60000,
            health_check_interval: this.config.health_check_interval || 30000,
            alert_evaluation_interval: this.config.alert_evaluation_interval || 60000,
            metrics_retention_days: this.config.metrics_retention_days || 30,
            dashboard_port: this.port,
            collectors: this.metricsCollector.getMetricsSummary(),
            health_checks: this.healthChecker.getAvailableChecks(),
            alert_rules: this.alertManager.getAlertRules()
        };
    }

    /**
     * Export metrics in various formats
     */
    async exportMetrics(timeRange, format) {
        try {
            const metrics = await this.metricsCollector.getMetrics(timeRange);
            
            if (format === 'csv') {
                return this.convertMetricsToCSV(metrics);
            } else {
                return JSON.stringify(metrics, null, 2);
            }
        } catch (error) {
            log('error', `Error exporting metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Convert metrics to CSV format
     */
    convertMetricsToCSV(metrics) {
        const rows = [];
        rows.push('timestamp,collector_type,metric_name,value');
        
        Object.entries(metrics).forEach(([timestamp, collectors]) => {
            Object.entries(collectors).forEach(([collectorType, data]) => {
                if (data.data) {
                    Object.entries(data.data).forEach(([metricName, value]) => {
                        rows.push(`${timestamp},${collectorType},${metricName},${value}`);
                    });
                }
            });
        });
        
        return rows.join('\n');
    }

    // Helper methods for specific metric calculations
    async getWorkflowExecutionTimes(metrics) {
        // Implementation for workflow execution time analysis
        return { average: 0, min: 0, max: 0, trend: 'stable' };
    }

    async getWorkflowSuccessRates(metrics) {
        // Implementation for workflow success rate analysis
        return { current: 100, trend: 'stable', history: [] };
    }

    async getAgentUtilization(metrics) {
        // Implementation for agent utilization analysis
        return { average: 0, peak: 0, agents: [] };
    }

    async getErrorBreakdown(metrics) {
        // Implementation for error breakdown analysis
        return { by_type: {}, by_component: {}, trends: {} };
    }

    async getWorkflowThroughput(metrics) {
        // Implementation for workflow throughput analysis
        return { current: 0, trend: 'stable', history: [] };
    }

    async getAgentPerformanceTrends() {
        // Implementation for agent performance trends
        return { response_time: 'stable', success_rate: 'stable' };
    }

    async getDatabasePerformanceAnalysis() {
        // Implementation for database performance analysis
        return { query_optimization_suggestions: [], index_recommendations: [] };
    }

    async getAPIPerformanceTrends() {
        // Implementation for API performance trends
        return { response_time: 'stable', error_rate: 'stable' };
    }

    /**
     * Start the dashboard API server
     */
    async start() {
        try {
            // Start monitoring components
            await this.metricsCollector.startCollection();
            await this.healthChecker.startPeriodicChecks();
            await this.alertManager.startMonitoring();
            
            // Start the server
            this.server = this.app.listen(this.port, () => {
                log('info', `Dashboard API server started on port ${this.port}`);
                log('info', `Health endpoint: http://localhost:${this.port}/health`);
                log('info', `API documentation: http://localhost:${this.port}/api/monitoring`);
            });
            
        } catch (error) {
            log('error', `Failed to start dashboard API: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the dashboard API server
     */
    async stop() {
        try {
            // Stop monitoring components
            this.metricsCollector.stopCollection();
            this.healthChecker.stopPeriodicChecks();
            this.alertManager.stopMonitoring();
            
            // Close the server
            if (this.server) {
                this.server.close();
                this.server = null;
            }
            
            log('info', 'Dashboard API server stopped');
        } catch (error) {
            log('error', `Error stopping dashboard API: ${error.message}`);
            throw error;
        }
    }
}

export default DashboardAPI;

