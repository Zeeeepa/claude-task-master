/**
 * @fileoverview Performance Analyzer
 * @description Advanced analytics and trend analysis for system performance
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Performance analyzer with advanced analytics and predictive insights
 */
export class PerformanceAnalyzer {
    constructor(config) {
        this.config = config;
        this.thresholds = config.performance_thresholds || this.getDefaultThresholds();
        this.trends = new Map();
        this.predictions = new Map();
        this.anomalies = [];
        this.metricsStorage = null;
    }

    /**
     * Set metrics storage reference
     */
    setMetricsStorage(storage) {
        this.metricsStorage = storage;
    }

    /**
     * Get default performance thresholds
     */
    getDefaultThresholds() {
        return {
            cpu_usage: { warning: 70, critical: 90 },
            memory_usage: { warning: 80, critical: 95 },
            response_time: { warning: 2000, critical: 5000 },
            error_rate: { warning: 5, critical: 10 },
            query_time: { warning: 1000, critical: 3000 },
            workflow_execution_time: { warning: 300000, critical: 600000 }, // 5-10 minutes
            agent_response_time: { warning: 5000, critical: 10000 }
        };
    }

    /**
     * Analyze performance for a given time range
     */
    async analyzePerformance(timeRange = '1h') {
        try {
            const metrics = await this.getMetrics(timeRange);
            
            if (!metrics || Object.keys(metrics).length === 0) {
                log('warning', 'No metrics available for performance analysis');
                return this.getEmptyAnalysis();
            }

            const analysis = {
                timestamp: Date.now(),
                time_range: timeRange,
                system_health: await this.analyzeSystemHealth(metrics),
                workflow_performance: await this.analyzeWorkflowPerformance(metrics),
                agent_efficiency: await this.analyzeAgentEfficiency(metrics),
                database_performance: await this.analyzeDatabasePerformance(metrics),
                api_performance: await this.analyzeAPIPerformance(metrics),
                bottlenecks: await this.identifyBottlenecks(metrics),
                trends: await this.analyzeTrends(metrics, timeRange),
                predictions: await this.generatePredictions(metrics),
                recommendations: await this.generateRecommendations(metrics),
                anomalies: await this.detectAnomalies(metrics)
            };

            log('debug', `Performance analysis completed for ${timeRange}`);
            return analysis;

        } catch (error) {
            log('error', `Error during performance analysis: ${error.message}`);
            throw error;
        }
    }

    /**
     * Analyze system health metrics
     */
    async analyzeSystemHealth(metrics) {
        const health = {
            overall_score: 0,
            components: {},
            alerts: [],
            status: 'healthy'
        };

        try {
            const latestSystemMetrics = this.getLatestMetrics(metrics, 'system');
            
            if (!latestSystemMetrics) {
                return { ...health, status: 'unknown', overall_score: 0 };
            }

            const data = latestSystemMetrics.data;

            // CPU utilization analysis
            const cpuUsage = data.cpu_usage || 0;
            health.components.cpu = {
                status: this.getHealthStatus(cpuUsage, this.thresholds.cpu_usage),
                value: cpuUsage,
                threshold_warning: this.thresholds.cpu_usage.warning,
                threshold_critical: this.thresholds.cpu_usage.critical,
                trend: this.calculateTrend(metrics, 'system', 'cpu_usage')
            };

            // Memory utilization analysis
            const memoryUsage = data.memory_usage || 0;
            health.components.memory = {
                status: this.getHealthStatus(memoryUsage, this.thresholds.memory_usage),
                value: memoryUsage,
                threshold_warning: this.thresholds.memory_usage.warning,
                threshold_critical: this.thresholds.memory_usage.critical,
                trend: this.calculateTrend(metrics, 'system', 'memory_usage')
            };

            // Load average analysis
            const loadAvg1m = data.load_average_1m || 0;
            health.components.load = {
                status: loadAvg1m > 2 ? 'critical' : loadAvg1m > 1 ? 'warning' : 'healthy',
                value: loadAvg1m,
                threshold_warning: 1,
                threshold_critical: 2,
                trend: this.calculateTrend(metrics, 'system', 'load_average_1m')
            };

            // Uptime analysis
            const uptime = data.uptime || 0;
            health.components.uptime = {
                status: 'healthy',
                value: uptime,
                human_readable: this.formatUptime(uptime)
            };

            // Calculate overall score
            const componentScores = Object.values(health.components).map(c => {
                switch (c.status) {
                    case 'healthy': return 100;
                    case 'warning': return 70;
                    case 'critical': return 30;
                    default: return 50;
                }
            });
            
            health.overall_score = Math.round(componentScores.reduce((a, b) => a + b, 0) / componentScores.length);

            // Determine overall status
            if (health.overall_score >= 90) {
                health.status = 'healthy';
            } else if (health.overall_score >= 70) {
                health.status = 'warning';
            } else {
                health.status = 'critical';
            }

            // Generate alerts for critical components
            Object.entries(health.components).forEach(([component, data]) => {
                if (data.status === 'critical') {
                    health.alerts.push({
                        component,
                        message: `${component.toUpperCase()} usage is critical: ${data.value}%`,
                        severity: 'critical',
                        threshold: data.threshold_critical
                    });
                } else if (data.status === 'warning') {
                    health.alerts.push({
                        component,
                        message: `${component.toUpperCase()} usage is elevated: ${data.value}%`,
                        severity: 'warning',
                        threshold: data.threshold_warning
                    });
                }
            });

        } catch (error) {
            log('error', `Error analyzing system health: ${error.message}`);
            health.status = 'error';
            health.error = error.message;
        }

        return health;
    }

    /**
     * Analyze workflow performance
     */
    async analyzeWorkflowPerformance(metrics) {
        const performance = {
            summary: {},
            trends: {},
            efficiency_score: 0,
            bottlenecks: [],
            recommendations: []
        };

        try {
            const latestWorkflowMetrics = this.getLatestMetrics(metrics, 'workflow');
            
            if (!latestWorkflowMetrics) {
                return performance;
            }

            const data = latestWorkflowMetrics.data;

            performance.summary = {
                active_workflows: data.active_count || 0,
                completed_today: data.completed_today || 0,
                success_rate: data.success_rate || 100,
                average_execution_time: data.average_execution_time || 0,
                total_workflows: data.total_workflows || 0,
                error_count: data.error_count || 0
            };

            // Calculate efficiency score
            const successRate = data.success_rate || 100;
            const avgExecTime = data.average_execution_time || 0;
            const execTimeScore = avgExecTime > 0 ? Math.max(0, 100 - (avgExecTime / this.thresholds.workflow_execution_time.warning * 100)) : 100;
            
            performance.efficiency_score = Math.round((successRate + execTimeScore) / 2);

            // Analyze trends
            performance.trends = {
                success_rate: this.calculateTrend(metrics, 'workflow', 'success_rate'),
                execution_time: this.calculateTrend(metrics, 'workflow', 'average_execution_time'),
                throughput: this.calculateTrend(metrics, 'workflow', 'completed_today')
            };

            // Identify bottlenecks
            if (avgExecTime > this.thresholds.workflow_execution_time.warning) {
                performance.bottlenecks.push({
                    type: 'execution_time',
                    severity: avgExecTime > this.thresholds.workflow_execution_time.critical ? 'critical' : 'warning',
                    value: avgExecTime,
                    description: 'Workflow execution time is above threshold'
                });
            }

            if (successRate < 95) {
                performance.bottlenecks.push({
                    type: 'success_rate',
                    severity: successRate < 90 ? 'critical' : 'warning',
                    value: successRate,
                    description: 'Workflow success rate is below optimal'
                });
            }

            // Generate recommendations
            if (performance.efficiency_score < 80) {
                performance.recommendations.push('Consider optimizing workflow execution paths');
            }
            
            if (avgExecTime > this.thresholds.workflow_execution_time.warning) {
                performance.recommendations.push('Investigate long-running workflow steps');
            }

        } catch (error) {
            log('error', `Error analyzing workflow performance: ${error.message}`);
            performance.error = error.message;
        }

        return performance;
    }

    /**
     * Analyze agent efficiency
     */
    async analyzeAgentEfficiency(metrics) {
        const efficiency = {
            summary: {},
            agent_stats: [],
            overall_efficiency: 0,
            recommendations: []
        };

        try {
            const latestAgentMetrics = this.getLatestMetrics(metrics, 'agent');
            
            if (!latestAgentMetrics) {
                return efficiency;
            }

            const data = latestAgentMetrics.data;

            efficiency.summary = {
                total_agents: data.total_agents || 0,
                total_requests: data.total_requests || 0,
                average_response_time: data.average_response_time || 0,
                overall_success_rate: data.overall_success_rate || 100,
                total_errors: data.total_errors || 0
            };

            // Analyze individual agents
            if (data.agents && Array.isArray(data.agents)) {
                efficiency.agent_stats = data.agents.map(agent => ({
                    ...agent,
                    efficiency_score: this.calculateAgentEfficiency(agent),
                    status: this.getAgentStatus(agent)
                }));
            }

            // Calculate overall efficiency
            const responseTimeScore = data.average_response_time > 0 ? 
                Math.max(0, 100 - (data.average_response_time / this.thresholds.agent_response_time.warning * 100)) : 100;
            const successRateScore = data.overall_success_rate || 100;
            
            efficiency.overall_efficiency = Math.round((responseTimeScore + successRateScore) / 2);

            // Generate recommendations
            if (data.average_response_time > this.thresholds.agent_response_time.warning) {
                efficiency.recommendations.push('Optimize agent response times');
            }
            
            if (data.overall_success_rate < 95) {
                efficiency.recommendations.push('Investigate agent error patterns');
            }

        } catch (error) {
            log('error', `Error analyzing agent efficiency: ${error.message}`);
            efficiency.error = error.message;
        }

        return efficiency;
    }

    /**
     * Analyze database performance
     */
    async analyzeDatabasePerformance(metrics) {
        const performance = {
            summary: {},
            query_analysis: {},
            connection_pool: {},
            recommendations: []
        };

        try {
            const latestDbMetrics = this.getLatestMetrics(metrics, 'database');
            
            if (!latestDbMetrics) {
                return performance;
            }

            const data = latestDbMetrics.data;

            performance.summary = {
                total_queries: data.total_queries || 0,
                average_query_time: data.average_query_time || 0,
                query_success_rate: data.query_success_rate || 100,
                slow_queries: data.slow_queries || 0
            };

            performance.query_analysis = {
                performance_score: this.calculateQueryPerformanceScore(data),
                slow_query_ratio: data.total_queries > 0 ? (data.slow_queries / data.total_queries) * 100 : 0,
                error_rate: data.total_queries > 0 ? ((data.total_queries - (data.query_success_rate / 100 * data.total_queries)) / data.total_queries) * 100 : 0
            };

            performance.connection_pool = {
                active_connections: data.connection_pool_active || 0,
                idle_connections: data.connection_pool_idle || 0,
                waiting_connections: data.connection_pool_waiting || 0,
                total_connections: data.connection_pool_total || 0,
                utilization: data.connection_pool_total > 0 ? (data.connection_pool_active / data.connection_pool_total) * 100 : 0
            };

            // Generate recommendations
            if (data.average_query_time > this.thresholds.query_time.warning) {
                performance.recommendations.push('Optimize slow database queries');
            }
            
            if (performance.connection_pool.utilization > 80) {
                performance.recommendations.push('Consider increasing database connection pool size');
            }

        } catch (error) {
            log('error', `Error analyzing database performance: ${error.message}`);
            performance.error = error.message;
        }

        return performance;
    }

    /**
     * Analyze API performance
     */
    async analyzeAPIPerformance(metrics) {
        const performance = {
            summary: {},
            endpoint_analysis: [],
            status_code_distribution: [],
            recommendations: []
        };

        try {
            const latestApiMetrics = this.getLatestMetrics(metrics, 'api');
            
            if (!latestApiMetrics) {
                return performance;
            }

            const data = latestApiMetrics.data;

            performance.summary = {
                total_requests: data.total_requests || 0,
                average_response_time: data.avg_response_time || 0,
                success_rate: data.success_rate || 100,
                total_errors: data.total_errors || 0
            };

            performance.endpoint_analysis = data.endpoints || [];
            performance.status_code_distribution = data.status_codes || [];

            // Generate recommendations
            if (data.avg_response_time > this.thresholds.response_time.warning) {
                performance.recommendations.push('Optimize API response times');
            }
            
            if (data.success_rate < 95) {
                performance.recommendations.push('Investigate API error patterns');
            }

        } catch (error) {
            log('error', `Error analyzing API performance: ${error.message}`);
            performance.error = error.message;
        }

        return performance;
    }

    /**
     * Identify system bottlenecks
     */
    async identifyBottlenecks(metrics) {
        const bottlenecks = [];

        try {
            // System bottlenecks
            const systemMetrics = this.getLatestMetrics(metrics, 'system');
            if (systemMetrics) {
                const data = systemMetrics.data;
                
                if (data.cpu_usage > this.thresholds.cpu_usage.warning) {
                    bottlenecks.push({
                        type: 'cpu',
                        severity: data.cpu_usage > this.thresholds.cpu_usage.critical ? 'critical' : 'warning',
                        value: data.cpu_usage,
                        description: 'High CPU utilization detected',
                        impact: 'May slow down all system operations'
                    });
                }
                
                if (data.memory_usage > this.thresholds.memory_usage.warning) {
                    bottlenecks.push({
                        type: 'memory',
                        severity: data.memory_usage > this.thresholds.memory_usage.critical ? 'critical' : 'warning',
                        value: data.memory_usage,
                        description: 'High memory utilization detected',
                        impact: 'May cause system instability'
                    });
                }
            }

            // Database bottlenecks
            const dbMetrics = this.getLatestMetrics(metrics, 'database');
            if (dbMetrics) {
                const data = dbMetrics.data;
                
                if (data.average_query_time > this.thresholds.query_time.warning) {
                    bottlenecks.push({
                        type: 'database_query',
                        severity: data.average_query_time > this.thresholds.query_time.critical ? 'critical' : 'warning',
                        value: data.average_query_time,
                        description: 'Slow database queries detected',
                        impact: 'May delay workflow execution'
                    });
                }
            }

            // API bottlenecks
            const apiMetrics = this.getLatestMetrics(metrics, 'api');
            if (apiMetrics) {
                const data = apiMetrics.data;
                
                if (data.avg_response_time > this.thresholds.response_time.warning) {
                    bottlenecks.push({
                        type: 'api_response',
                        severity: data.avg_response_time > this.thresholds.response_time.critical ? 'critical' : 'warning',
                        value: data.avg_response_time,
                        description: 'Slow API response times detected',
                        impact: 'May affect user experience'
                    });
                }
            }

        } catch (error) {
            log('error', `Error identifying bottlenecks: ${error.message}`);
        }

        return bottlenecks.sort((a, b) => {
            const severityOrder = { critical: 3, warning: 2, info: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    /**
     * Analyze trends over time
     */
    async analyzeTrends(metrics, timeRange) {
        const trends = {};

        try {
            // Analyze trends for each metric type
            const metricTypes = ['system', 'workflow', 'agent', 'database', 'api'];
            
            for (const type of metricTypes) {
                trends[type] = this.calculateMetricTrends(metrics, type);
            }

        } catch (error) {
            log('error', `Error analyzing trends: ${error.message}`);
        }

        return trends;
    }

    /**
     * Generate performance predictions
     */
    async generatePredictions(metrics) {
        const predictions = {};

        try {
            // Simple linear trend prediction (in production, use more sophisticated algorithms)
            const systemMetrics = this.getLatestMetrics(metrics, 'system');
            if (systemMetrics) {
                const cpuTrend = this.calculateTrend(metrics, 'system', 'cpu_usage');
                const memoryTrend = this.calculateTrend(metrics, 'system', 'memory_usage');
                
                predictions.system = {
                    cpu_usage_1h: this.predictValue(systemMetrics.data.cpu_usage, cpuTrend, 60),
                    memory_usage_1h: this.predictValue(systemMetrics.data.memory_usage, memoryTrend, 60),
                    confidence: 'medium'
                };
            }

        } catch (error) {
            log('error', `Error generating predictions: ${error.message}`);
        }

        return predictions;
    }

    /**
     * Generate performance recommendations
     */
    async generateRecommendations(metrics) {
        const recommendations = [];

        try {
            const systemHealth = await this.analyzeSystemHealth(metrics);
            const workflowPerf = await this.analyzeWorkflowPerformance(metrics);
            const agentEff = await this.analyzeAgentEfficiency(metrics);

            // System recommendations
            if (systemHealth.overall_score < 80) {
                recommendations.push({
                    category: 'system',
                    priority: 'high',
                    title: 'Optimize System Resources',
                    description: 'System health score is below optimal. Consider resource optimization.',
                    actions: ['Monitor CPU and memory usage', 'Scale resources if needed', 'Optimize running processes']
                });
            }

            // Workflow recommendations
            if (workflowPerf.efficiency_score < 80) {
                recommendations.push({
                    category: 'workflow',
                    priority: 'medium',
                    title: 'Improve Workflow Efficiency',
                    description: 'Workflow efficiency can be improved.',
                    actions: ['Analyze slow workflow steps', 'Optimize task dependencies', 'Consider parallel execution']
                });
            }

            // Agent recommendations
            if (agentEff.overall_efficiency < 80) {
                recommendations.push({
                    category: 'agent',
                    priority: 'medium',
                    title: 'Enhance Agent Performance',
                    description: 'Agent efficiency is below optimal.',
                    actions: ['Optimize agent response times', 'Review error handling', 'Consider load balancing']
                });
            }

        } catch (error) {
            log('error', `Error generating recommendations: ${error.message}`);
        }

        return recommendations.slice(0, 10); // Limit to top 10 recommendations
    }

    /**
     * Detect performance anomalies
     */
    async detectAnomalies(metrics) {
        const anomalies = [];

        try {
            // Simple anomaly detection based on thresholds and trends
            const systemMetrics = this.getLatestMetrics(metrics, 'system');
            if (systemMetrics) {
                const data = systemMetrics.data;
                
                // Detect sudden spikes
                if (data.cpu_usage > this.thresholds.cpu_usage.critical) {
                    anomalies.push({
                        type: 'spike',
                        metric: 'cpu_usage',
                        value: data.cpu_usage,
                        severity: 'critical',
                        description: 'Critical CPU usage spike detected'
                    });
                }
            }

        } catch (error) {
            log('error', `Error detecting anomalies: ${error.message}`);
        }

        return anomalies;
    }

    // Helper methods

    getLatestMetrics(metrics, type) {
        const timestamps = Object.keys(metrics).map(Number).sort((a, b) => b - a);
        for (const timestamp of timestamps) {
            if (metrics[timestamp][type]) {
                return metrics[timestamp][type];
            }
        }
        return null;
    }

    getHealthStatus(value, thresholds) {
        if (value >= thresholds.critical) return 'critical';
        if (value >= thresholds.warning) return 'warning';
        return 'healthy';
    }

    calculateTrend(metrics, type, field) {
        // Simple trend calculation - in production use more sophisticated algorithms
        const values = [];
        const timestamps = Object.keys(metrics).map(Number).sort();
        
        for (const timestamp of timestamps) {
            if (metrics[timestamp][type] && metrics[timestamp][type].data[field] !== undefined) {
                values.push(metrics[timestamp][type].data[field]);
            }
        }

        if (values.length < 2) return 'stable';
        
        const recent = values.slice(-3);
        const older = values.slice(-6, -3);
        
        if (recent.length === 0 || older.length === 0) return 'stable';
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    calculateAgentEfficiency(agent) {
        const responseTimeScore = agent.avg_response_time > 0 ? 
            Math.max(0, 100 - (agent.avg_response_time / this.thresholds.agent_response_time.warning * 100)) : 100;
        const successRateScore = agent.success_rate || 100;
        
        return Math.round((responseTimeScore + successRateScore) / 2);
    }

    getAgentStatus(agent) {
        if (agent.success_rate < 90 || agent.avg_response_time > this.thresholds.agent_response_time.critical) {
            return 'critical';
        }
        if (agent.success_rate < 95 || agent.avg_response_time > this.thresholds.agent_response_time.warning) {
            return 'warning';
        }
        return 'healthy';
    }

    calculateQueryPerformanceScore(data) {
        const timeScore = data.average_query_time > 0 ? 
            Math.max(0, 100 - (data.average_query_time / this.thresholds.query_time.warning * 100)) : 100;
        const successScore = data.query_success_rate || 100;
        
        return Math.round((timeScore + successScore) / 2);
    }

    calculateMetricTrends(metrics, type) {
        // Simplified trend calculation
        return {
            direction: 'stable',
            confidence: 'medium',
            change_percentage: 0
        };
    }

    predictValue(currentValue, trend, minutesAhead) {
        // Simple linear prediction
        let multiplier = 1;
        if (trend === 'increasing') multiplier = 1.1;
        if (trend === 'decreasing') multiplier = 0.9;
        
        return Math.round(currentValue * multiplier);
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        return `${days}d ${hours}h ${minutes}m`;
    }

    async getMetrics(timeRange) {
        if (this.metricsStorage) {
            const endTime = Date.now();
            let startTime;
            
            switch (timeRange) {
                case '5m': startTime = endTime - (5 * 60 * 1000); break;
                case '15m': startTime = endTime - (15 * 60 * 1000); break;
                case '1h': startTime = endTime - (60 * 60 * 1000); break;
                case '6h': startTime = endTime - (6 * 60 * 60 * 1000); break;
                case '24h': startTime = endTime - (24 * 60 * 60 * 1000); break;
                default: startTime = endTime - (60 * 60 * 1000);
            }
            
            return await this.metricsStorage.getMetricsInRange(startTime, endTime);
        }
        
        return {};
    }

    getEmptyAnalysis() {
        return {
            timestamp: Date.now(),
            system_health: { overall_score: 0, status: 'unknown', components: {}, alerts: [] },
            workflow_performance: { efficiency_score: 0, summary: {}, trends: {}, bottlenecks: [], recommendations: [] },
            agent_efficiency: { overall_efficiency: 0, summary: {}, agent_stats: [], recommendations: [] },
            database_performance: { summary: {}, query_analysis: {}, connection_pool: {}, recommendations: [] },
            api_performance: { summary: {}, endpoint_analysis: [], status_code_distribution: [], recommendations: [] },
            bottlenecks: [],
            trends: {},
            predictions: {},
            recommendations: [],
            anomalies: []
        };
    }
}

export default PerformanceAnalyzer;

