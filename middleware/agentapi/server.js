#!/usr/bin/env node

/**
 * AgentAPI Middleware Server
 * 
 * Provides HTTP API middleware to control Claude Code, Goose, Aider, and Codex
 * for PR validation and debugging on WSL2 instances.
 * 
 * Features:
 * - Agent orchestration and management
 * - PR branch deployment automation
 * - Error handling and recovery
 * - State management and monitoring
 * - Custom CI/CD workflow endpoints
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentManager } from './agent-manager.js';
import { PRDeploymentService } from './pr-deployment.js';
import { StateManager } from './state-manager.js';
import { ErrorHandler } from './error-handler.js';
import { HealthMonitor } from './health-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentAPIServer {
  constructor(options = {}) {
    this.port = options.port || process.env.AGENTAPI_PORT || 3285;
    this.host = options.host || process.env.AGENTAPI_HOST || 'localhost';
    this.workspaceRoot = options.workspaceRoot || process.env.WORKSPACE_ROOT || '/tmp/agentapi-workspaces';
    
    this.app = express();
    this.agentManager = new AgentManager();
    this.prDeployment = new PRDeploymentService(this.workspaceRoot);
    this.stateManager = new StateManager();
    this.errorHandler = new ErrorHandler();
    this.healthMonitor = new HealthMonitor();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3284'],
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        agents: this.agentManager.getAgentStatuses(),
        workspaces: this.stateManager.getActiveWorkspaces(),
      });
    });

    // Agent management endpoints
    this.app.post('/agents/:type/start', this.handleStartAgent.bind(this));
    this.app.post('/agents/:type/stop', this.handleStopAgent.bind(this));
    this.app.get('/agents/:type/status', this.handleGetAgentStatus.bind(this));
    this.app.get('/agents', this.handleListAgents.bind(this));

    // PR deployment endpoints
    this.app.post('/deploy-pr', this.handleDeployPR.bind(this));
    this.app.post('/validate-code', this.handleValidateCode.bind(this));
    this.app.post('/debug-errors', this.handleDebugErrors.bind(this));
    
    // State management endpoints
    this.app.get('/agent-status', this.handleAgentStatus.bind(this));
    this.app.get('/task-progress', this.handleTaskProgress.bind(this));
    this.app.get('/workspaces', this.handleListWorkspaces.bind(this));
    this.app.delete('/workspaces/:id', this.handleCleanupWorkspace.bind(this));

    // Agent communication endpoints
    this.app.post('/agents/:type/message', this.handleSendMessage.bind(this));
    this.app.get('/agents/:type/messages', this.handleGetMessages.bind(this));
    this.app.get('/agents/:type/events', this.handleGetEvents.bind(this));

    // Monitoring and metrics
    this.app.get('/metrics', this.handleGetMetrics.bind(this));
    this.app.get('/logs/:agentType/:workspaceId?', this.handleGetLogs.bind(this));

    // Static files for web interface
    this.app.use('/static', express.static(path.join(__dirname, 'static')));
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'static', 'index.html'));
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      
      const errorResponse = this.errorHandler.handleError(err);
      res.status(errorResponse.status || 500).json(errorResponse);
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // Agent Management Handlers
  async handleStartAgent(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId, config = {} } = req.body;

      if (!this.agentManager.isValidAgentType(type)) {
        return res.status(400).json({
          error: 'Invalid agent type',
          supportedTypes: this.agentManager.getSupportedTypes(),
        });
      }

      const agent = await this.agentManager.startAgent(type, workspaceId, config);
      
      res.json({
        success: true,
        agent: {
          id: agent.id,
          type: agent.type,
          status: agent.status,
          workspaceId: agent.workspaceId,
          startedAt: agent.startedAt,
        },
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleStopAgent(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId } = req.body;

      await this.agentManager.stopAgent(type, workspaceId);
      
      res.json({
        success: true,
        message: `Agent ${type} stopped successfully`,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleGetAgentStatus(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId } = req.query;

      const status = await this.agentManager.getAgentStatus(type, workspaceId);
      
      res.json({
        success: true,
        status,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleListAgents(req, res) {
    try {
      const agents = this.agentManager.listAgents();
      
      res.json({
        success: true,
        agents,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  // PR Deployment Handlers
  async handleDeployPR(req, res) {
    try {
      const { repoUrl, prNumber, branch, targetBranch = 'main' } = req.body;

      if (!repoUrl || !prNumber || !branch) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['repoUrl', 'prNumber', 'branch'],
        });
      }

      const deployment = await this.prDeployment.deployPR({
        repoUrl,
        prNumber,
        branch,
        targetBranch,
      });

      this.stateManager.trackDeployment(deployment);

      res.json({
        success: true,
        deployment: {
          id: deployment.id,
          workspaceId: deployment.workspaceId,
          status: deployment.status,
          repoUrl,
          prNumber,
          branch,
        },
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleValidateCode(req, res) {
    try {
      const { workspaceId, agentType = 'claude', validationRules = [] } = req.body;

      if (!workspaceId) {
        return res.status(400).json({
          error: 'Missing workspaceId',
        });
      }

      const validation = await this.prDeployment.validateCode(workspaceId, {
        agentType,
        validationRules,
      });

      res.json({
        success: true,
        validation,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleDebugErrors(req, res) {
    try {
      const { workspaceId, errors, agentType = 'claude' } = req.body;

      if (!workspaceId || !errors) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['workspaceId', 'errors'],
        });
      }

      const debugResult = await this.prDeployment.debugErrors(workspaceId, {
        errors,
        agentType,
      });

      res.json({
        success: true,
        debugResult,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  // State Management Handlers
  async handleAgentStatus(req, res) {
    try {
      const statuses = this.stateManager.getAllAgentStatuses();
      
      res.json({
        success: true,
        statuses,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleTaskProgress(req, res) {
    try {
      const { workspaceId } = req.query;
      const progress = this.stateManager.getTaskProgress(workspaceId);
      
      res.json({
        success: true,
        progress,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleListWorkspaces(req, res) {
    try {
      const workspaces = this.stateManager.getActiveWorkspaces();
      
      res.json({
        success: true,
        workspaces,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleCleanupWorkspace(req, res) {
    try {
      const { id } = req.params;
      
      await this.prDeployment.cleanupWorkspace(id);
      this.stateManager.removeWorkspace(id);
      
      res.json({
        success: true,
        message: `Workspace ${id} cleaned up successfully`,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  // Agent Communication Handlers
  async handleSendMessage(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId, message } = req.body;

      if (!workspaceId || !message) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['workspaceId', 'message'],
        });
      }

      const response = await this.agentManager.sendMessage(type, workspaceId, message);
      
      res.json({
        success: true,
        response,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleGetMessages(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId } = req.query;

      const messages = await this.agentManager.getMessages(type, workspaceId);
      
      res.json({
        success: true,
        messages,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleGetEvents(req, res) {
    try {
      const { type } = req.params;
      const { workspaceId } = req.query;

      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const eventStream = this.agentManager.getEventStream(type, workspaceId);
      
      eventStream.on('data', (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      });

      eventStream.on('error', (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      });

      req.on('close', () => {
        eventStream.destroy();
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  // Monitoring Handlers
  async handleGetMetrics(req, res) {
    try {
      const metrics = await this.healthMonitor.getMetrics();
      
      res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async handleGetLogs(req, res) {
    try {
      const { agentType, workspaceId } = req.params;
      const { lines = 100, follow = false } = req.query;

      const logs = await this.healthMonitor.getLogs(agentType, workspaceId, {
        lines: parseInt(lines),
        follow: follow === 'true',
      });

      if (follow) {
        // Set up streaming logs
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        logs.on('data', (data) => {
          res.write(`data: ${JSON.stringify({ log: data })}\n\n`);
        });

        req.on('close', () => {
          logs.destroy();
        });
      } else {
        res.json({
          success: true,
          logs,
        });
      }
    } catch (error) {
      const errorResponse = this.errorHandler.handleError(error);
      res.status(errorResponse.status || 500).json(errorResponse);
    }
  }

  async start() {
    try {
      // Ensure workspace directory exists
      await fs.mkdir(this.workspaceRoot, { recursive: true });

      // Start health monitoring
      await this.healthMonitor.start();

      // Start the server
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`🚀 AgentAPI Middleware Server running on http://${this.host}:${this.port}`);
        console.log(`📁 Workspace root: ${this.workspaceRoot}`);
        console.log(`🔧 Supported agents: ${this.agentManager.getSupportedTypes().join(', ')}`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('Failed to start AgentAPI server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log('🛑 Shutting down AgentAPI server...');
    
    try {
      // Stop all agents
      await this.agentManager.stopAllAgents();
      
      // Stop health monitoring
      await this.healthMonitor.stop();
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      console.log('✅ AgentAPI server shut down gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AgentAPIServer();
  server.start();
}

export { AgentAPIServer };

