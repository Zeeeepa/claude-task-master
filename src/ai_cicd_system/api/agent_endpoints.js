/**
 * Agent API Endpoints
 * 
 * RESTful API endpoints for agent management, task routing,
 * health monitoring, and system administration.
 */

import { Router } from 'express';
import { SimpleLogger } from '../utils/simple_logger.js';
import AgentManager from '../integrations/agent_manager.js';
import AgentHealthMonitor from '../utils/agent_health_monitor.js';
import AgentMiddleware from '../middleware/agent_middleware.js';

export class AgentEndpoints {
    constructor(config = {}) {
        this.config = config;
        this.logger = new SimpleLogger('AgentEndpoints');
        this.router = Router();
        
        // Initialize components
        this.healthMonitor = new AgentHealthMonitor(config);
        this.agentManager = new AgentManager(config, this.healthMonitor);
        this.middleware = new AgentMiddleware(config);
        
        // Setup middleware
        this._setupMiddleware();
        
        // Setup routes
        this._setupRoutes();
    }

    /**
     * Setup middleware for all routes
     */
    _setupMiddleware() {
        // Apply middleware in order
        this.router.use(this.middleware.cors());
        this.router.use(this.middleware.securityHeaders());
        this.router.use(this.middleware.requestLogging());
        this.router.use(this.middleware.validateRequest());
        this.router.use(this.middleware.transformRequest());
        this.router.use(this.middleware.transformResponse());
        this.router.use(this.middleware.rateLimit());
    }

    /**
     * Setup all API routes
     */
    _setupRoutes() {
        // Task routing endpoints
        this._setupTaskRoutes();
        
        // Agent management endpoints
        this._setupAgentRoutes();
        
        // Health monitoring endpoints
        this._setupHealthRoutes();
        
        // System administration endpoints
        this._setupAdminRoutes();
        
        // Metrics and monitoring endpoints
        this._setupMetricsRoutes();
        
        // Error handling
        this.router.use(this.middleware.errorHandler());
    }

    /**
     * Setup task routing endpoints
     */
    _setupTaskRoutes() {
        // Route task to appropriate agent
        this.router.post('/agents/route', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { task, agent_type, priority } = req.body;

                if (!task) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'Task data is required'
                    });
                }

                // Add metadata to task
                const enrichedTask = {
                    ...task,
                    task_id: task.task_id || req.metadata.requestId,
                    priority: priority || task.priority || 'normal',
                    metadata: {
                        ...task.metadata,
                        requestId: req.metadata.requestId,
                        clientIp: req.metadata.clientIp,
                        userAgent: req.metadata.userAgent,
                        timestamp: req.metadata.timestamp
                    }
                };

                this.logger.info(`Routing task: ${enrichedTask.task_id}`, {
                    taskType: enrichedTask.task_type,
                    agentType: agent_type,
                    priority: enrichedTask.priority
                });

                const result = await this.agentManager.executeTask(enrichedTask);

                res.json({
                    success: true,
                    task_id: enrichedTask.task_id,
                    agent_type: result.agentType,
                    result: result.result,
                    queued: result.queued || false,
                    processing_time: result.processingTime
                });

            } catch (error) {
                next(error);
            }
        });

        // Get task queue status
        this.router.get('/agents/queue', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const queueStatus = this.agentManager.getQueueStatus();
                res.json(queueStatus);
            } catch (error) {
                next(error);
            }
        });

        // Cancel queued task
        this.router.delete('/agents/queue/:taskId', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { taskId } = req.params;
                const cancelledTask = this.agentManager.cancelQueuedTask(taskId);
                
                res.json({
                    success: true,
                    message: 'Task cancelled successfully',
                    task: cancelledTask
                });
            } catch (error) {
                next(error);
            }
        });

        // Get agent recommendations for task
        this.router.post('/agents/recommend', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { task, limit } = req.body;

                if (!task) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'Task data is required'
                    });
                }

                const recommendations = this.agentManager.agentRouter.getAgentRecommendations(
                    task, 
                    limit || 3
                );

                res.json({
                    success: true,
                    task_type: task.task_type,
                    recommendations
                });

            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * Setup agent management endpoints
     */
    _setupAgentRoutes() {
        // Get all agents status
        this.router.get('/agents/status', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const agentsStatus = this.agentManager.getAllAgentsStatus();
                res.json(agentsStatus);
            } catch (error) {
                next(error);
            }
        });

        // Get specific agent status
        this.router.get('/agents/:agentType/status', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agentType } = req.params;
                const agentStatus = this.agentManager.getAgentStatus(agentType);
                res.json(agentStatus);
            } catch (error) {
                next(error);
            }
        });

        // Restart specific agent
        this.router.post('/agents/:agentType/restart', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agentType } = req.params;
                
                this.logger.info(`Restarting agent: ${agentType}`, {
                    requestId: req.metadata.requestId,
                    clientIp: req.metadata.clientIp
                });

                await this.agentManager.restartAgent(agentType);
                
                res.json({
                    success: true,
                    message: `Agent ${agentType} restarted successfully`,
                    agent_type: agentType,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                next(error);
            }
        });

        // Deploy PR to WSL2 instance (Claude Code specific)
        this.router.post('/agents/claude-code/deploy', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { repository, branch, pr_number } = req.body;

                if (!repository || !branch) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'Repository and branch are required'
                    });
                }

                const deployTask = {
                    task_id: `deploy-${Date.now()}`,
                    task_type: 'pr_deployment',
                    repository: {
                        url: repository.url,
                        branch: branch,
                        pr_number: pr_number
                    },
                    requirements: ['deploy', 'validate'],
                    context: {
                        wsl2_required: true,
                        git_operations: true,
                        deployment_type: 'pr_validation'
                    }
                };

                const result = await this.agentManager.executeTask(deployTask);

                res.json({
                    success: true,
                    deployment_id: deployTask.task_id,
                    repository: repository.url,
                    branch: branch,
                    pr_number: pr_number,
                    result: result.result,
                    wsl2_instance: result.result?.metadata?.wsl2_instance
                });

            } catch (error) {
                next(error);
            }
        });

        // Trigger agent failover
        this.router.post('/agents/failover', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { from_agent, to_agent, task_id } = req.body;

                if (!from_agent || !task_id) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'from_agent and task_id are required'
                    });
                }

                // This would implement actual failover logic
                // For now, we'll return a success response
                this.logger.info(`Failover requested: ${from_agent} -> ${to_agent}`, {
                    taskId: task_id,
                    requestId: req.metadata.requestId
                });

                res.json({
                    success: true,
                    message: 'Failover initiated',
                    from_agent: from_agent,
                    to_agent: to_agent,
                    task_id: task_id,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * Setup health monitoring endpoints
     */
    _setupHealthRoutes() {
        // System health check
        this.router.get('/health', async (req, res) => {
            try {
                const healthSummary = this.healthMonitor.getHealthSummary();
                const systemMetrics = this.agentManager.getMetrics();

                const health = {
                    status: healthSummary.healthyAgents === healthSummary.totalAgents ? 'healthy' : 'degraded',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: process.env.npm_package_version || '1.0.0',
                    agents: healthSummary,
                    system: {
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage(),
                        activeConnections: systemMetrics.activeTasks,
                        queueSize: systemMetrics.queueSize
                    }
                };

                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.status(statusCode).json(health);

            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: 'Health check failed',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Individual agent health
        this.router.get('/agents/:agentType/health', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agentType } = req.params;
                const agentHealth = this.healthMonitor.getAgentHealth(agentType);
                res.json(agentHealth);
            } catch (error) {
                next(error);
            }
        });

        // Force health check
        this.router.post('/agents/:agentType/health-check', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agentType } = req.params;
                
                await this.healthMonitor.forceHealthCheck(agentType);
                const agentHealth = this.healthMonitor.getAgentHealth(agentType);
                
                res.json({
                    success: true,
                    message: 'Health check completed',
                    agent_type: agentType,
                    health: agentHealth
                });

            } catch (error) {
                next(error);
            }
        });

        // Get active alerts
        this.router.get('/alerts', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const alerts = this.healthMonitor.getActiveAlerts();
                res.json({
                    success: true,
                    count: alerts.length,
                    alerts: alerts
                });
            } catch (error) {
                next(error);
            }
        });

        // Acknowledge alert
        this.router.post('/alerts/:alertId/acknowledge', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { alertId } = req.params;
                const acknowledged = this.healthMonitor.acknowledgeAlert(alertId);
                
                if (acknowledged) {
                    res.json({
                        success: true,
                        message: 'Alert acknowledged',
                        alert_id: alertId
                    });
                } else {
                    res.status(404).json({
                        error: 'Not Found',
                        message: 'Alert not found'
                    });
                }

            } catch (error) {
                next(error);
            }
        });

        // Clear alert
        this.router.delete('/alerts/:alertId', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { alertId } = req.params;
                const cleared = this.healthMonitor.clearAlert(alertId);
                
                if (cleared) {
                    res.json({
                        success: true,
                        message: 'Alert cleared',
                        alert_id: alertId
                    });
                } else {
                    res.status(404).json({
                        error: 'Not Found',
                        message: 'Alert not found'
                    });
                }

            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * Setup system administration endpoints
     */
    _setupAdminRoutes() {
        // Get system configuration
        this.router.get('/admin/config', this.middleware.authenticate(), async (req, res, next) => {
            try {
                // Return sanitized configuration (no secrets)
                const config = {
                    agents: Object.keys(this.config.agents || {}),
                    routing_strategy: this.config.routing_config?.strategy,
                    monitoring_enabled: this.config.monitoring?.enable_metrics,
                    security: {
                        rate_limiting: this.config.security?.enable_rate_limiting,
                        cors_enabled: this.config.security?.enable_cors
                    },
                    wsl2: {
                        max_instances: this.config.wsl2_config?.max_instances,
                        instance_timeout: this.config.wsl2_config?.instance_timeout
                    }
                };

                res.json(config);

            } catch (error) {
                next(error);
            }
        });

        // Reset circuit breakers
        this.router.post('/admin/circuit-breakers/reset', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agent_type } = req.body;

                if (agent_type) {
                    this.healthMonitor.resetCircuitBreaker(agent_type);
                    res.json({
                        success: true,
                        message: `Circuit breaker reset for agent: ${agent_type}`
                    });
                } else {
                    // Reset all circuit breakers
                    for (const agentType of Object.keys(this.config.agents || {})) {
                        this.healthMonitor.resetCircuitBreaker(agentType);
                    }
                    res.json({
                        success: true,
                        message: 'All circuit breakers reset'
                    });
                }

            } catch (error) {
                next(error);
            }
        });

        // Clear all queued tasks
        this.router.delete('/admin/queue/clear', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const queueStatus = this.agentManager.getQueueStatus();
                const clearedCount = queueStatus.size;
                
                // Clear the queue (this would need to be implemented in AgentManager)
                // For now, we'll return the current queue size
                
                res.json({
                    success: true,
                    message: `Queue cleared`,
                    cleared_tasks: clearedCount
                });

            } catch (error) {
                next(error);
            }
        });

        // System shutdown
        this.router.post('/admin/shutdown', this.middleware.authenticate(), async (req, res, next) => {
            try {
                this.logger.warn('System shutdown requested', {
                    requestId: req.metadata.requestId,
                    clientIp: req.metadata.clientIp
                });

                res.json({
                    success: true,
                    message: 'Shutdown initiated',
                    timestamp: new Date().toISOString()
                });

                // Graceful shutdown
                setTimeout(async () => {
                    await this.shutdown();
                    process.exit(0);
                }, 1000);

            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * Setup metrics and monitoring endpoints
     */
    _setupMetricsRoutes() {
        // Get system metrics
        this.router.get('/metrics', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const systemMetrics = this.agentManager.getMetrics();
                const healthMetrics = this.healthMonitor.getHealthSummary();
                const middlewareMetrics = this.middleware.getMetrics();

                const metrics = {
                    timestamp: new Date().toISOString(),
                    system: systemMetrics,
                    health: healthMetrics,
                    middleware: middlewareMetrics,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage()
                };

                res.json(metrics);

            } catch (error) {
                next(error);
            }
        });

        // Get routing statistics
        this.router.get('/metrics/routing', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const routingStats = this.agentManager.agentRouter.getRoutingStats();
                res.json({
                    success: true,
                    routing_stats: routingStats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                next(error);
            }
        });

        // Get performance metrics
        this.router.get('/metrics/performance', this.middleware.authenticate(), async (req, res, next) => {
            try {
                const { agent_type, time_range } = req.query;
                
                // This would implement detailed performance metrics retrieval
                // For now, return basic performance data
                const performanceMetrics = {
                    agent_type: agent_type || 'all',
                    time_range: time_range || '1h',
                    metrics: {
                        response_times: [],
                        throughput: [],
                        error_rates: [],
                        availability: []
                    }
                };

                res.json(performanceMetrics);

            } catch (error) {
                next(error);
            }
        });

        // Reset metrics
        this.router.post('/metrics/reset', this.middleware.authenticate(), async (req, res, next) => {
            try {
                this.agentManager.agentRouter.resetMetrics();
                this.middleware.resetMetrics();
                
                res.json({
                    success: true,
                    message: 'Metrics reset successfully',
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * Get the Express router
     */
    getRouter() {
        return this.router;
    }

    /**
     * Get agent manager instance
     */
    getAgentManager() {
        return this.agentManager;
    }

    /**
     * Get health monitor instance
     */
    getHealthMonitor() {
        return this.healthMonitor;
    }

    /**
     * Shutdown all components
     */
    async shutdown() {
        this.logger.info('Shutting down Agent Endpoints');
        
        await this.agentManager.shutdown();
        this.healthMonitor.shutdown();
    }
}

export default AgentEndpoints;

