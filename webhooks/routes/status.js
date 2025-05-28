/**
 * Status and Health Check Routes
 * Provides system status and health monitoring endpoints
 */

import { Router } from 'express';
import { DatabaseService } from '../services/database.js';
import { WebhookProcessor } from '../services/webhook-processor.js';

const router = Router();

/**
 * System health check
 * Returns overall system health status
 */
router.get('/', async (req, res) => {
  try {
    const database = new DatabaseService();
    const processor = new WebhookProcessor(database);

    // Check database connectivity
    const dbHealth = await database.healthCheck();
    
    // Check processor status
    const processorHealth = await processor.healthCheck();

    // Get system metrics
    const metrics = await getSystemMetrics();

    const overallHealth = dbHealth.healthy && processorHealth.healthy;

    res.status(overallHealth ? 200 : 503).json({
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      components: {
        database: dbHealth,
        processor: processorHealth
      },
      metrics
    });

  } catch (error) {
    console.error('❌ Health check error:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Detailed system status
 * Returns comprehensive system information
 */
router.get('/detailed', async (req, res) => {
  try {
    const database = new DatabaseService();
    const processor = new WebhookProcessor(database);

    // Get detailed status from all components
    const [dbStatus, processorStatus, systemInfo] = await Promise.all([
      database.getDetailedStatus(),
      processor.getDetailedStatus(),
      getDetailedSystemInfo()
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      database: dbStatus,
      processor: processorStatus
    });

  } catch (error) {
    console.error('❌ Detailed status error:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve detailed status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Webhook processing metrics
 * Returns metrics about webhook processing performance
 */
router.get('/metrics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const database = new DatabaseService();
    const metrics = await database.getWebhookMetrics(timeframe);

    res.json({
      timeframe,
      timestamp: new Date().toISOString(),
      metrics
    });

  } catch (error) {
    console.error('❌ Metrics error:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

/**
 * Recent webhook events summary
 * Returns summary of recent webhook activity
 */
router.get('/events', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const database = new DatabaseService();
    const events = await database.getRecentWebhookEvents(parseInt(limit));

    res.json({
      timestamp: new Date().toISOString(),
      events,
      summary: {
        total: events.length,
        byType: events.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {}),
        byStatus: events.reduce((acc, event) => {
          acc[event.status] = (acc[event.status] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('❌ Events summary error:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve events summary',
      message: error.message
    });
  }
});

/**
 * System configuration
 * Returns current system configuration (non-sensitive)
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.WEBHOOK_PORT || 3001,
      host: process.env.WEBHOOK_HOST || 'localhost',
      features: {
        githubWebhooks: !!process.env.GITHUB_WEBHOOK_SECRET,
        linearWebhooks: !!process.env.LINEAR_WEBHOOK_SECRET,
        codegenWebhooks: !!process.env.CODEGEN_WEBHOOK_SECRET,
        agentapiIntegration: !!process.env.AGENTAPI_URL,
        databaseLogging: !!process.env.DATABASE_URL
      },
      limits: {
        requestSizeLimit: '10mb',
        rateLimitWindow: '15 minutes',
        rateLimitRequests: 100
      }
    };

    res.json({
      timestamp: new Date().toISOString(),
      config
    });

  } catch (error) {
    console.error('❌ Config error:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve configuration',
      message: error.message
    });
  }
});

/**
 * Get basic system metrics
 */
async function getSystemMetrics() {
  return {
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    cpu: {
      usage: process.cpuUsage()
    },
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform
  };
}

/**
 * Get detailed system information
 */
async function getDetailedSystemInfo() {
  return {
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime()
    },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };
}

export default router;

