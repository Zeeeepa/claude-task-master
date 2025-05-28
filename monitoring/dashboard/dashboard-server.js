/**
 * Dashboard Server
 * Real-time monitoring dashboard with web interface
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(metricsCollector, analyticsEngine, config = {}) {
    this.metricsCollector = metricsCollector;
    this.analyticsEngine = analyticsEngine;
    this.config = {
      port: 3001,
      host: 'localhost',
      cors: true,
      ...config
    };
    
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedClients = new Set();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS middleware
    if (this.config.cors) {
      this.app.use(cors());
    }

    // JSON parsing
    this.app.use(express.json());

    // Static files
    this.app.use('/static', express.static(path.join(__dirname, 'static')));
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime()
      });
    });

    // Dashboard home
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'static', 'index.html'));
    });

    // API Routes
    this.setupApiRoutes();
  }

  /**
   * Setup API routes
   */
  setupApiRoutes() {
    const apiRouter = express.Router();

    // Get current metrics
    apiRouter.get('/metrics/:type', async (req, res) => {
      try {
        const { type } = req.params;
        const { timeRange = '1h', aggregation = 'avg' } = req.query;
        
        const metrics = await this.metricsCollector.getAggregatedMetrics(
          type, 
          aggregation, 
          timeRange
        );
        
        res.json({
          success: true,
          data: metrics,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get real-time metrics
    apiRouter.get('/metrics/realtime/:type', async (req, res) => {
      try {
        const { type } = req.params;
        const metrics = await this.metricsCollector.getMetrics(type, '5m');
        
        res.json({
          success: true,
          data: metrics.slice(-10), // Last 10 data points
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Generate reports
    apiRouter.get('/reports/:type', async (req, res) => {
      try {
        const { type } = req.params;
        const { timeRange = '24h', includeRawData = false } = req.query;
        
        const report = await this.analyticsEngine.generateReport(
          type,
          timeRange,
          { includeRawData: includeRawData === 'true' }
        );
        
        res.json({
          success: true,
          data: report,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get active alerts
    apiRouter.get('/alerts', async (req, res) => {
      try {
        const alerts = this.metricsCollector.alertManager.getActiveAlerts();
        const stats = this.metricsCollector.alertManager.getAlertStats();
        
        res.json({
          success: true,
          data: {
            active_alerts: alerts,
            statistics: stats
          },
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get system status
    apiRouter.get('/status', async (req, res) => {
      try {
        const [performanceMetrics, systemMetrics, workflowMetrics] = await Promise.all([
          this.metricsCollector.getAggregatedMetrics('performance', 'latest', '5m'),
          this.metricsCollector.getAggregatedMetrics('system', 'latest', '5m'),
          this.metricsCollector.getAggregatedMetrics('workflow', 'latest', '5m')
        ]);

        const status = {
          overall_health: this.calculateOverallHealth({
            performance: performanceMetrics,
            system: systemMetrics,
            workflow: workflowMetrics
          }),
          performance: performanceMetrics,
          system: systemMetrics,
          workflow: workflowMetrics,
          alerts: this.metricsCollector.alertManager.getActiveAlerts().length,
          uptime: Date.now() - this.metricsCollector.startTime
        };

        res.json({
          success: true,
          data: status,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Export metrics
    apiRouter.get('/export/:type', async (req, res) => {
      try {
        const { type } = req.params;
        const { format = 'json', timeRange = '24h' } = req.query;
        
        const metrics = await this.metricsCollector.getMetrics(type, timeRange);
        const exported = await this.metricsCollector.storage.exportMetrics(type, format);
        
        const filename = `${type}_metrics_${Date.now()}.${format}`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
        res.send(exported);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.use('/api', apiRouter);
  }

  /**
   * Setup WebSocket connections for real-time updates
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`📱 Dashboard client connected: ${socket.id}`);
      this.connectedClients.add(socket);

      // Send initial data
      this.sendInitialData(socket);

      // Handle client requests
      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });

      socket.on('unsubscribe', (data) => {
        this.handleUnsubscription(socket, data);
      });

      socket.on('disconnect', () => {
        console.log(`📱 Dashboard client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket);
      });
    });

    // Setup real-time data broadcasting
    this.setupRealTimeBroadcast();
  }

  /**
   * Send initial data to connected client
   */
  async sendInitialData(socket) {
    try {
      const [status, alerts] = await Promise.all([
        this.getSystemStatus(),
        this.metricsCollector.alertManager.getActiveAlerts()
      ]);

      socket.emit('initial_data', {
        status,
        alerts,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  /**
   * Handle client subscription to specific metrics
   */
  handleSubscription(socket, data) {
    const { type, interval = 5000 } = data;
    
    if (!socket.subscriptions) {
      socket.subscriptions = new Map();
    }

    // Clear existing subscription
    if (socket.subscriptions.has(type)) {
      clearInterval(socket.subscriptions.get(type));
    }

    // Setup new subscription
    const intervalId = setInterval(async () => {
      try {
        const metrics = await this.metricsCollector.getMetrics(type, '5m');
        socket.emit('metrics_update', {
          type,
          data: metrics.slice(-1)[0], // Latest data point
          timestamp: Date.now()
        });
      } catch (error) {
        console.error(`Error sending ${type} metrics:`, error);
      }
    }, interval);

    socket.subscriptions.set(type, intervalId);
    console.log(`📊 Client ${socket.id} subscribed to ${type} metrics`);
  }

  /**
   * Handle client unsubscription
   */
  handleUnsubscription(socket, data) {
    const { type } = data;
    
    if (socket.subscriptions && socket.subscriptions.has(type)) {
      clearInterval(socket.subscriptions.get(type));
      socket.subscriptions.delete(type);
      console.log(`📊 Client ${socket.id} unsubscribed from ${type} metrics`);
    }
  }

  /**
   * Setup real-time broadcasting to all clients
   */
  setupRealTimeBroadcast() {
    // Broadcast metrics updates
    this.metricsCollector.on('metrics_collected', (metrics) => {
      this.io.emit('metrics_broadcast', {
        type: metrics.type,
        data: metrics,
        timestamp: Date.now()
      });
    });

    // Broadcast alerts
    this.metricsCollector.alertManager.on('alert_triggered', (alert) => {
      this.io.emit('alert_triggered', {
        alert,
        timestamp: Date.now()
      });
    });

    this.metricsCollector.alertManager.on('alert_resolved', (alert) => {
      this.io.emit('alert_resolved', {
        alert,
        timestamp: Date.now()
      });
    });

    // Broadcast system status updates every 30 seconds
    setInterval(async () => {
      try {
        const status = await this.getSystemStatus();
        this.io.emit('status_update', {
          status,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error broadcasting status update:', error);
      }
    }, 30000);
  }

  /**
   * Get current system status
   */
  async getSystemStatus() {
    try {
      const [performanceMetrics, systemMetrics, workflowMetrics] = await Promise.all([
        this.metricsCollector.getAggregatedMetrics('performance', 'latest', '5m'),
        this.metricsCollector.getAggregatedMetrics('system', 'latest', '5m'),
        this.metricsCollector.getAggregatedMetrics('workflow', 'latest', '5m')
      ]);

      return {
        overall_health: this.calculateOverallHealth({
          performance: performanceMetrics,
          system: systemMetrics,
          workflow: workflowMetrics
        }),
        performance: performanceMetrics,
        system: systemMetrics,
        workflow: workflowMetrics,
        alerts_count: this.metricsCollector.alertManager.getActiveAlerts().length,
        uptime: Date.now() - this.metricsCollector.startTime,
        connected_clients: this.connectedClients.size
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        error: 'Unable to fetch system status',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Calculate overall system health
   */
  calculateOverallHealth(metrics) {
    let score = 100;
    let status = 'healthy';

    // Check performance metrics
    if (metrics.performance?.error_rate > 5) {
      score -= 20;
      status = 'warning';
    }
    if (metrics.performance?.response_time > 1000) {
      score -= 15;
      status = 'warning';
    }

    // Check system metrics
    if (metrics.system?.cpu_usage > 80) {
      score -= 15;
      status = 'warning';
    }
    if (metrics.system?.memory_usage > 85) {
      score -= 20;
      status = 'critical';
    }

    // Check workflow metrics
    if (metrics.workflow?.task_completion_rate < 80) {
      score -= 10;
      status = 'warning';
    }

    if (score < 60) {
      status = 'critical';
    } else if (score < 80) {
      status = 'warning';
    }

    return {
      score: Math.max(0, score),
      status,
      timestamp: Date.now()
    };
  }

  /**
   * Start the dashboard server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`📊 Dashboard server running at http://${this.config.host}:${this.config.port}`);
          resolve();
        }
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop() {
    return new Promise((resolve) => {
      // Clear all client subscriptions
      for (const socket of this.connectedClients) {
        if (socket.subscriptions) {
          for (const intervalId of socket.subscriptions.values()) {
            clearInterval(intervalId);
          }
        }
      }

      this.server.close(() => {
        console.log('📊 Dashboard server stopped');
        resolve();
      });
    });
  }
}

export default DashboardServer;

