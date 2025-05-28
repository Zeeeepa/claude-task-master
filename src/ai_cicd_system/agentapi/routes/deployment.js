/**
 * Deployment API Routes
 * 
 * RESTful endpoints for managing deployment operations
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

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
 * POST /api/deployment/start
 * Start a new deployment
 */
router.post('/start', [
  body('repositoryUrl').isURL().withMessage('Valid repository URL is required'),
  body('prBranch').notEmpty().withMessage('PR branch is required'),
  body('validationTasks').isArray({ min: 1 }).withMessage('At least one validation task is required'),
  body('validationTasks.*.type').isIn([
    'code_analysis', 'test_execution', 'lint_check', 
    'build_verification', 'security_scan', 'custom_validation'
  ]).withMessage('Invalid validation task type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector, io } = req.agentAPI;
    
    const deploymentRequest = {
      repositoryUrl: req.body.repositoryUrl,
      prBranch: req.body.prBranch,
      validationTasks: req.body.validationTasks,
      credentials: req.body.credentials,
      gitConfig: req.body.gitConfig || {
        name: 'AgentAPI Bot',
        email: 'agentapi@example.com'
      },
      allowedTools: req.body.allowedTools || ['Bash', 'Edit', 'Replace', 'Create'],
      model: req.body.model || 'claude-3-sonnet',
      claudeSettings: req.body.claudeSettings || {},
      additionalPackages: req.body.additionalPackages || [],
      metadata: {
        requestedBy: req.body.requestedBy || 'anonymous',
        priority: req.body.priority || 'normal',
        tags: req.body.tags || []
      }
    };

    // Start deployment
    const result = await deploymentOrchestrator.startDeployment(deploymentRequest);
    
    // Store deployment in database
    await databaseConnector.createDeployment({
      id: result.deploymentId,
      status: result.status,
      repositoryUrl: deploymentRequest.repositoryUrl,
      prBranch: deploymentRequest.prBranch,
      requestedBy: deploymentRequest.metadata.requestedBy,
      createdAt: new Date()
    });

    // Emit real-time update
    io.emit('deploymentStarted', {
      deploymentId: result.deploymentId,
      status: result.status,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      deploymentId: result.deploymentId,
      status: result.status,
      message: 'Deployment started successfully'
    });
  } catch (error) {
    console.error('Deployment start error:', error);
    res.status(500).json({
      error: 'Deployment Start Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/deployment/:id
 * Get deployment status and details
 */
router.get('/:id', [
  param('id').isLength({ min: 1 }).withMessage('Deployment ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector } = req.agentAPI;
    const deploymentId = req.params.id;

    // Get deployment status from orchestrator
    const status = deploymentOrchestrator.getDeploymentStatus(deploymentId);
    
    if (!status) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deployment not found'
      });
    }

    // Get additional details from database
    const dbDeployment = await databaseConnector.getDeployment(deploymentId);

    res.json({
      success: true,
      deployment: {
        ...status,
        ...dbDeployment,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get deployment error:', error);
    res.status(500).json({
      error: 'Get Deployment Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/deployment/:id/stop
 * Stop a running deployment
 */
router.post('/:id/stop', [
  param('id').isLength({ min: 1 }).withMessage('Deployment ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector, io } = req.agentAPI;
    const deploymentId = req.params.id;

    // Stop deployment
    const result = await deploymentOrchestrator.stopDeployment(deploymentId);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Stop Failed',
        message: result.message || 'Failed to stop deployment'
      });
    }

    // Update database
    await databaseConnector.updateDeploymentStatus(deploymentId, 'stopped');

    // Emit real-time update
    io.emit('deploymentStopped', {
      deploymentId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Deployment stopped successfully'
    });
  } catch (error) {
    console.error('Stop deployment error:', error);
    res.status(500).json({
      error: 'Stop Deployment Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/deployment
 * List all deployments with filtering and pagination
 */
router.get('/', [
  query('status').optional().isIn(['queued', 'running', 'completed', 'failed', 'stopped']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sortBy').optional().isIn(['createdAt', 'status', 'duration']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector } = req.agentAPI;
    
    const {
      status,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      repositoryUrl,
      requestedBy
    } = req.query;

    // Get active deployments from orchestrator
    const activeDeployments = deploymentOrchestrator.getAllDeployments();

    // Get historical deployments from database
    const dbDeployments = await databaseConnector.getDeployments({
      status,
      repositoryUrl,
      requestedBy,
      page,
      limit,
      sortBy,
      sortOrder
    });

    // Merge and deduplicate
    const allDeployments = [...activeDeployments];
    
    for (const dbDeployment of dbDeployments.deployments) {
      if (!allDeployments.find(d => d.id === dbDeployment.id)) {
        allDeployments.push(dbDeployment);
      }
    }

    // Apply filtering
    let filteredDeployments = allDeployments;
    if (status) {
      filteredDeployments = allDeployments.filter(d => d.status === status);
    }

    // Apply sorting
    filteredDeployments.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : -1;
      } else {
        return aVal > bVal ? 1 : -1;
      }
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedDeployments = filteredDeployments.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      deployments: paginatedDeployments,
      pagination: {
        page,
        limit,
        total: filteredDeployments.length,
        totalPages: Math.ceil(filteredDeployments.length / limit)
      },
      filters: {
        status,
        repositoryUrl,
        requestedBy
      }
    });
  } catch (error) {
    console.error('List deployments error:', error);
    res.status(500).json({
      error: 'List Deployments Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/deployment/:id/logs
 * Get deployment logs
 */
router.get('/:id/logs', [
  param('id').isLength({ min: 1 }).withMessage('Deployment ID is required'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator } = req.agentAPI;
    const deploymentId = req.params.id;
    const { limit = 100, offset = 0 } = req.query;

    // Get deployment
    const deployment = deploymentOrchestrator.activeDeployments.get(deploymentId);
    
    if (!deployment) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deployment not found'
      });
    }

    // Get logs with pagination
    const logs = deployment.logs || [];
    const paginatedLogs = logs.slice(offset, offset + limit);

    res.json({
      success: true,
      logs: paginatedLogs,
      pagination: {
        offset,
        limit,
        total: logs.length
      }
    });
  } catch (error) {
    console.error('Get deployment logs error:', error);
    res.status(500).json({
      error: 'Get Logs Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/deployment/:id/report
 * Get deployment final report
 */
router.get('/:id/report', [
  param('id').isLength({ min: 1 }).withMessage('Deployment ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator } = req.agentAPI;
    const deploymentId = req.params.id;

    const deployment = deploymentOrchestrator.activeDeployments.get(deploymentId);
    
    if (!deployment) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deployment not found'
      });
    }

    if (!deployment.results.finalReport) {
      return res.status(400).json({
        error: 'Report Not Available',
        message: 'Deployment report is not yet available'
      });
    }

    res.json({
      success: true,
      report: deployment.results.finalReport
    });
  } catch (error) {
    console.error('Get deployment report error:', error);
    res.status(500).json({
      error: 'Get Report Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/deployment/:id/retry
 * Retry a failed deployment
 */
router.post('/:id/retry', [
  param('id').isLength({ min: 1 }).withMessage('Deployment ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector } = req.agentAPI;
    const deploymentId = req.params.id;

    // Get original deployment
    const originalDeployment = await databaseConnector.getDeployment(deploymentId);
    
    if (!originalDeployment) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Original deployment not found'
      });
    }

    if (originalDeployment.status !== 'failed') {
      return res.status(400).json({
        error: 'Invalid Status',
        message: 'Only failed deployments can be retried'
      });
    }

    // Start new deployment with same parameters
    const result = await deploymentOrchestrator.startDeployment(originalDeployment.request);

    // Store retry relationship in database
    await databaseConnector.createDeployment({
      id: result.deploymentId,
      status: result.status,
      repositoryUrl: originalDeployment.repositoryUrl,
      prBranch: originalDeployment.prBranch,
      requestedBy: originalDeployment.requestedBy,
      retryOf: deploymentId,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      deploymentId: result.deploymentId,
      status: result.status,
      originalDeploymentId: deploymentId,
      message: 'Deployment retry started successfully'
    });
  } catch (error) {
    console.error('Retry deployment error:', error);
    res.status(500).json({
      error: 'Retry Deployment Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/deployment/stats
 * Get deployment statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector } = req.agentAPI;

    // Get orchestrator stats
    const orchestratorStats = deploymentOrchestrator.getStatistics();

    // Get database stats
    const dbStats = await databaseConnector.getDeploymentStatistics();

    res.json({
      success: true,
      statistics: {
        current: orchestratorStats,
        historical: dbStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get deployment stats error:', error);
    res.status(500).json({
      error: 'Get Statistics Failed',
      message: error.message
    });
  }
});

module.exports = router;

