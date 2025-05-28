/**
 * Status API Routes
 * 
 * RESTful endpoints for system health monitoring and status information
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const os = require('os');

const router = express.Router();

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/status
 * Get overall system status
 */
router.get('/', async (req, res) => {
  try {
    const { 
      wsl2Manager, 
      claudeCodeInterface, 
      deploymentOrchestrator,
      databaseConnector 
    } = req.agentAPI;

    // Check component health
    const [
      wsl2Status,
      claudeCodeStatus,
      databaseStatus
    ] = await Promise.allSettled([
      getWSL2Status(wsl2Manager),
      getClaudeCodeStatus(claudeCodeInterface),
      getDatabaseStatus(databaseConnector)
    ]);

    // Get orchestrator status
    const orchestratorStatus = getOrchestratorStatus(deploymentOrchestrator);

    // Get system metrics
    const systemMetrics = getSystemMetrics();

    // Determine overall health
    const components = {
      wsl2: wsl2Status.status === 'fulfilled' ? wsl2Status.value : { healthy: false, error: wsl2Status.reason?.message },
      claudeCode: claudeCodeStatus.status === 'fulfilled' ? claudeCodeStatus.value : { healthy: false, error: claudeCodeStatus.reason?.message },
      database: databaseStatus.status === 'fulfilled' ? databaseStatus.value : { healthy: false, error: databaseStatus.reason?.message },
      orchestrator: orchestratorStatus
    };

    const allHealthy = Object.values(components).every(component => component.healthy);
    const overallStatus = allHealthy ? 'healthy' : 'degraded';

    res.json({
      success: true,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      components,
      system: systemMetrics
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/wsl2
 * Get detailed WSL2 status
 */
router.get('/wsl2', async (req, res) => {
  try {
    const { wsl2Manager } = req.agentAPI;

    const instances = wsl2Manager.getAllInstances();
    const resourceUsage = wsl2Manager.getResourceUsage();

    // Get detailed instance information
    const detailedInstances = await Promise.all(
      instances.map(async (instance) => {
        try {
          const status = await wsl2Manager.getInstanceStatus(instance.id);
          return status;
        } catch (error) {
          return {
            ...instance,
            status: 'error',
            error: error.message
          };
        }
      })
    );

    res.json({
      success: true,
      wsl2: {
        healthy: wsl2Manager.isInitialized,
        initialized: wsl2Manager.isInitialized,
        instances: {
          total: detailedInstances.length,
          active: detailedInstances.filter(i => i.status === 'running').length,
          failed: detailedInstances.filter(i => i.status === 'error').length,
          details: detailedInstances
        },
        resources: resourceUsage,
        limits: {
          maxInstances: wsl2Manager.config.maxInstances,
          resourceLimits: wsl2Manager.config.resourceLimits
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('WSL2 status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/claude-code
 * Get detailed Claude Code status
 */
router.get('/claude-code', async (req, res) => {
  try {
    const { claudeCodeInterface } = req.agentAPI;

    // Check Claude Code API health
    const healthCheck = await claudeCodeInterface.checkHealth();
    
    // Get active sessions
    const activeSessions = claudeCodeInterface.getActiveSessions();
    
    // Get interface statistics
    const statistics = claudeCodeInterface.getStatistics();

    res.json({
      success: true,
      claudeCode: {
        healthy: healthCheck.available,
        api: {
          available: healthCheck.available,
          url: claudeCodeInterface.config.apiUrl,
          responseTime: healthCheck.responseTime,
          status: healthCheck.status,
          error: healthCheck.error
        },
        sessions: {
          total: activeSessions.length,
          active: activeSessions.filter(s => s.status === 'active').length,
          details: activeSessions
        },
        statistics,
        config: {
          timeout: claudeCodeInterface.config.timeout,
          retryAttempts: claudeCodeInterface.config.retryAttempts,
          websocketUrl: claudeCodeInterface.config.websocketUrl
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Claude Code status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/database
 * Get database connection status
 */
router.get('/database', async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;

    // Check database connection
    const connectionStatus = await databaseConnector.checkConnection();
    
    // Get database statistics
    const dbStats = await databaseConnector.getStatistics();

    res.json({
      success: true,
      database: {
        healthy: connectionStatus.connected,
        connection: connectionStatus,
        statistics: dbStats,
        config: {
          host: databaseConnector.config.host || 'configured',
          database: databaseConnector.config.database || 'configured',
          ssl: databaseConnector.config.ssl || false
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/deployments
 * Get deployment system status
 */
router.get('/deployments', async (req, res) => {
  try {
    const { deploymentOrchestrator } = req.agentAPI;

    const allDeployments = deploymentOrchestrator.getAllDeployments();
    const statistics = deploymentOrchestrator.getStatistics();

    // Calculate deployment metrics
    const metrics = {
      total: allDeployments.length,
      running: allDeployments.filter(d => d.status === 'running').length,
      completed: allDeployments.filter(d => d.status === 'completed').length,
      failed: allDeployments.filter(d => d.status === 'failed').length,
      queued: allDeployments.filter(d => d.status === 'queued').length
    };

    res.json({
      success: true,
      deployments: {
        healthy: statistics.activeDeployments < statistics.maxConcurrentDeployments,
        metrics,
        statistics,
        recentDeployments: allDeployments
          .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
          .slice(0, 10)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Deployment status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/metrics
 * Get detailed performance metrics
 */
router.get('/metrics', [
  query('period').optional().isIn(['1h', '24h', '7d', '30d']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { databaseConnector, metrics } = req.agentAPI;
    const period = req.query.period || '24h';

    // Get system metrics
    const systemMetrics = getSystemMetrics();
    
    // Get historical metrics from database
    const historicalMetrics = await databaseConnector.getMetrics(period);
    
    // Get current application metrics
    const appMetrics = metrics || {
      totalDeployments: 0,
      successfulDeployments: 0,
      failedDeployments: 0,
      averageDeploymentTime: 0,
      activeInstances: 0
    };

    res.json({
      success: true,
      metrics: {
        current: {
          system: systemMetrics,
          application: appMetrics,
          timestamp: new Date().toISOString()
        },
        historical: historicalMetrics,
        period
      }
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/health
 * Simple health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * POST /api/status/cleanup
 * Trigger system cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { wsl2Manager, claudeCodeInterface } = req.agentAPI;

    const cleanupResults = {
      wsl2: { cleaned: 0, errors: 0 },
      claudeCode: { cleaned: 0, errors: 0 }
    };

    // Cleanup WSL2 instances
    try {
      await wsl2Manager.cleanupIdleInstances();
      cleanupResults.wsl2.cleaned = 1;
    } catch (error) {
      cleanupResults.wsl2.errors = 1;
      console.error('WSL2 cleanup error:', error);
    }

    // Cleanup Claude Code sessions
    try {
      const cleaned = await claudeCodeInterface.cleanupExpiredSessions();
      cleanupResults.claudeCode.cleaned = cleaned;
    } catch (error) {
      cleanupResults.claudeCode.errors = 1;
      console.error('Claude Code cleanup error:', error);
    }

    res.json({
      success: true,
      message: 'Cleanup completed',
      results: cleanupResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Helper function to get WSL2 status
 */
async function getWSL2Status(wsl2Manager) {
  try {
    const instances = wsl2Manager.getAllInstances();
    const resourceUsage = wsl2Manager.getResourceUsage();
    
    return {
      healthy: wsl2Manager.isInitialized,
      instanceCount: instances.length,
      resourceUsage: {
        memory: resourceUsage.memory,
        cpu: resourceUsage.cpu,
        activeInstances: resourceUsage.activeInstances
      }
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Helper function to get Claude Code status
 */
async function getClaudeCodeStatus(claudeCodeInterface) {
  try {
    const healthCheck = await claudeCodeInterface.checkHealth();
    const activeSessions = claudeCodeInterface.getActiveSessions();
    
    return {
      healthy: healthCheck.available,
      sessionCount: activeSessions.length,
      apiUrl: claudeCodeInterface.config.apiUrl,
      responseTime: healthCheck.responseTime
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Helper function to get database status
 */
async function getDatabaseStatus(databaseConnector) {
  try {
    const connectionStatus = await databaseConnector.checkConnection();
    
    return {
      healthy: connectionStatus.connected,
      connectionPool: connectionStatus.poolSize || 0,
      lastQuery: connectionStatus.lastQuery
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Helper function to get orchestrator status
 */
function getOrchestratorStatus(deploymentOrchestrator) {
  try {
    const statistics = deploymentOrchestrator.getStatistics();
    
    return {
      healthy: true,
      activeDeployments: statistics.activeDeployments,
      queuedDeployments: statistics.queuedDeployments,
      maxConcurrent: statistics.maxConcurrentDeployments
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Helper function to get system metrics
 */
function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuCount: os.cpus().length
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      version: process.version,
      versions: process.versions
    }
  };
}

module.exports = router;

