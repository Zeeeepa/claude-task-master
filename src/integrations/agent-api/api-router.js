/**
 * API Router
 * 
 * Handles API routing and endpoint management for the AgentAPI middleware.
 * Provides endpoints for communication between System Orchestrator and Claude Code.
 */

import { Router } from 'express';
import { log } from '../../ai_cicd_system/utils/simple_logger.js';

export class APIRouter {
  constructor(options = {}) {
    this.authHandler = options.authHandler;
    this.dataTransformer = options.dataTransformer;
    this.logger = options.logger || new SimpleLogger('APIRouter');
    this.router = Router();

    this._setupRoutes();
  }

  /**
   * Setup all API routes
   */
  _setupRoutes() {
    // Authentication routes
    this._setupAuthRoutes();
    
    // Orchestrator communication routes
    this._setupOrchestratorRoutes();
    
    // Claude Code integration routes
    this._setupClaudeCodeRoutes();
    
    // Data transformation routes
    this._setupTransformationRoutes();
    
    // Monitoring and health routes
    this._setupMonitoringRoutes();
  }

  /**
   * Setup authentication routes
   */
  _setupAuthRoutes() {
    // Login endpoint
    this.router.post('/auth/login', async (req, res, next) => {
      try {
        const { username, password, apiKey } = req.body;

        if (!username || (!password && !apiKey)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Username and password or API key required'
          });
        }

        const authResult = await this.authHandler.authenticate({
          username,
          password,
          apiKey
        });

        if (!authResult.success) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: authResult.message || 'Authentication failed'
          });
        }

        res.json({
          success: true,
          token: authResult.token,
          refreshToken: authResult.refreshToken,
          expiresIn: authResult.expiresIn,
          user: authResult.user
        });

      } catch (error) {
        next(error);
      }
    });

    // Token refresh endpoint
    this.router.post('/auth/refresh', async (req, res, next) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Refresh token required'
          });
        }

        const refreshResult = await this.authHandler.refreshToken(refreshToken);

        if (!refreshResult.success) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: refreshResult.message || 'Token refresh failed'
          });
        }

        res.json({
          success: true,
          token: refreshResult.token,
          expiresIn: refreshResult.expiresIn
        });

      } catch (error) {
        next(error);
      }
    });

    // Token validation endpoint
    this.router.get('/auth/validate', this.authHandler.requireAuth(), async (req, res) => {
      res.json({
        valid: true,
        user: req.user,
        expiresAt: req.tokenExpiry
      });
    });

    // Logout endpoint
    this.router.post('/auth/logout', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        await this.authHandler.revokeToken(req.token);
        res.json({ success: true, message: 'Logged out successfully' });
      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Setup System Orchestrator communication routes
   */
  _setupOrchestratorRoutes() {
    // Receive workflow commands from orchestrator
    this.router.post('/orchestrator/workflow', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { workflowId, command, payload } = req.body;

        if (!workflowId || !command) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Workflow ID and command required'
          });
        }

        // Transform data for Claude Code integration
        const transformedPayload = await this.dataTransformer.transformForClaudeCode(payload);

        // Log the workflow command
        this.logger.info(`Received workflow command: ${command}`, {
          workflowId,
          command,
          userId: req.user.id,
          requestId: req.requestId
        });

        // Process the workflow command
        const result = await this._processWorkflowCommand(workflowId, command, transformedPayload);

        res.json({
          success: true,
          workflowId,
          command,
          result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Get workflow status
    this.router.get('/orchestrator/workflow/:workflowId/status', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { workflowId } = req.params;
        const status = await this._getWorkflowStatus(workflowId);

        res.json({
          workflowId,
          status,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Update workflow status
    this.router.put('/orchestrator/workflow/:workflowId/status', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { workflowId } = req.params;
        const { status, metadata } = req.body;

        if (!status) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Status required'
          });
        }

        await this._updateWorkflowStatus(workflowId, status, metadata);

        res.json({
          success: true,
          workflowId,
          status,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Setup Claude Code integration routes
   */
  _setupClaudeCodeRoutes() {
    // Forward analysis requests to Claude Code
    this.router.post('/claude-code/analyze', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { codebase, analysisType, options } = req.body;

        if (!codebase || !analysisType) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Codebase and analysis type required'
          });
        }

        // Transform data for Claude Code
        const transformedRequest = await this.dataTransformer.transformForClaudeCode({
          codebase,
          analysisType,
          options
        });

        this.logger.info(`Forwarding analysis request to Claude Code`, {
          analysisType,
          userId: req.user.id,
          requestId: req.requestId
        });

        // Forward to Claude Code (mock implementation)
        const analysisResult = await this._forwardToClaudeCode('analyze', transformedRequest);

        // Transform response back to orchestrator format
        const transformedResponse = await this.dataTransformer.transformFromClaudeCode(analysisResult);

        res.json({
          success: true,
          analysisType,
          result: transformedResponse,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Get Claude Code status
    this.router.get('/claude-code/status', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const status = await this._getClaudeCodeStatus();

        res.json({
          status,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Execute Claude Code commands
    this.router.post('/claude-code/execute', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { command, parameters } = req.body;

        if (!command) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Command required'
          });
        }

        this.logger.info(`Executing Claude Code command: ${command}`, {
          command,
          userId: req.user.id,
          requestId: req.requestId
        });

        const result = await this._forwardToClaudeCode('execute', { command, parameters });

        res.json({
          success: true,
          command,
          result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Setup data transformation routes
   */
  _setupTransformationRoutes() {
    // Transform data to Claude Code format
    this.router.post('/transform/to-claude-code', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { data } = req.body;

        if (!data) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Data required'
          });
        }

        const transformed = await this.dataTransformer.transformForClaudeCode(data);

        res.json({
          success: true,
          original: data,
          transformed,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Transform data from Claude Code format
    this.router.post('/transform/from-claude-code', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { data } = req.body;

        if (!data) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Data required'
          });
        }

        const transformed = await this.dataTransformer.transformFromClaudeCode(data);

        res.json({
          success: true,
          original: data,
          transformed,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Validate data format
    this.router.post('/transform/validate', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { data, schema } = req.body;

        if (!data) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Data required'
          });
        }

        const validation = await this.dataTransformer.validateData(data, schema);

        res.json({
          valid: validation.valid,
          errors: validation.errors,
          data,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Setup monitoring and health routes
   */
  _setupMonitoringRoutes() {
    // Get API metrics
    this.router.get('/monitoring/metrics', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const metrics = await this._getMetrics();

        res.json({
          metrics,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Get performance stats
    this.router.get('/monitoring/performance', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const performance = await this._getPerformanceStats();

        res.json({
          performance,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });

    // Get error logs
    this.router.get('/monitoring/errors', this.authHandler.requireAuth(), async (req, res, next) => {
      try {
        const { limit = 100, offset = 0 } = req.query;
        const errors = await this._getErrorLogs(parseInt(limit), parseInt(offset));

        res.json({
          errors,
          limit: parseInt(limit),
          offset: parseInt(offset),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        next(error);
      }
    });
  }

  /**
   * Process workflow command (mock implementation)
   */
  async _processWorkflowCommand(workflowId, command, payload) {
    // This would integrate with the actual System Orchestrator
    this.logger.info(`Processing workflow command: ${command} for workflow: ${workflowId}`);
    
    return {
      processed: true,
      command,
      workflowId,
      payload,
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Get workflow status (mock implementation)
   */
  async _getWorkflowStatus(workflowId) {
    // This would query the actual workflow status
    return {
      id: workflowId,
      status: 'running',
      progress: 75,
      startedAt: new Date(Date.now() - 300000).toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Update workflow status (mock implementation)
   */
  async _updateWorkflowStatus(workflowId, status, metadata) {
    // This would update the actual workflow status
    this.logger.info(`Updating workflow ${workflowId} status to: ${status}`);
    return true;
  }

  /**
   * Forward request to Claude Code (mock implementation)
   */
  async _forwardToClaudeCode(action, payload) {
    // This would integrate with the actual Claude Code service
    this.logger.info(`Forwarding to Claude Code: ${action}`);
    
    return {
      action,
      payload,
      result: 'success',
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Get Claude Code status (mock implementation)
   */
  async _getClaudeCodeStatus() {
    return {
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Get API metrics (mock implementation)
   */
  async _getMetrics() {
    return {
      requestCount: 1234,
      errorCount: 5,
      averageResponseTime: 150,
      uptime: process.uptime()
    };
  }

  /**
   * Get performance stats (mock implementation)
   */
  async _getPerformanceStats() {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Get error logs (mock implementation)
   */
  async _getErrorLogs(limit, offset) {
    return [
      {
        id: 1,
        message: 'Sample error',
        timestamp: new Date().toISOString(),
        level: 'error'
      }
    ];
  }

  /**
   * Get the Express router
   */
  getRouter() {
    return this.router;
  }
}

export default APIRouter;

