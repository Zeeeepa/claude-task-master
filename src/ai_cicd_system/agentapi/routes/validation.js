/**
 * Validation API Routes
 * 
 * RESTful endpoints for managing validation operations and results
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
 * POST /api/validation/start
 * Start a standalone validation process
 */
router.post('/start', [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('validationType').isIn([
    'code_analysis', 'test_execution', 'lint_check', 
    'build_verification', 'security_scan', 'custom_validation'
  ]).withMessage('Invalid validation type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { claudeCodeInterface, databaseConnector } = req.agentAPI;
    
    const {
      sessionId,
      validationType,
      scope = 'changed_files',
      focus = ['bugs', 'performance', 'security'],
      files = [],
      command,
      options = {}
    } = req.body;

    let result;

    switch (validationType) {
      case 'code_analysis':
        result = await claudeCodeInterface.executeAnalysis(sessionId, {
          type: 'code_review',
          scope,
          focus,
          files
        }, options);
        break;

      case 'test_execution':
      case 'lint_check':
      case 'build_verification':
      case 'security_scan':
      case 'custom_validation':
        // Send command to Claude Code session
        const message = command || `Please execute ${validationType}`;
        result = await claudeCodeInterface.sendMessage(sessionId, message, options);
        break;

      default:
        throw new Error(`Unsupported validation type: ${validationType}`);
    }

    // Store validation task in database
    const validationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await databaseConnector.createValidation({
      id: validationId,
      sessionId,
      type: validationType,
      status: 'running',
      taskId: result.taskId || result.messageId,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      validationId,
      taskId: result.taskId || result.messageId,
      status: 'running',
      message: 'Validation started successfully'
    });
  } catch (error) {
    console.error('Validation start error:', error);
    res.status(500).json({
      error: 'Validation Start Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/validation/:id
 * Get validation results
 */
router.get('/:id', [
  param('id').isLength({ min: 1 }).withMessage('Validation ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { claudeCodeInterface, databaseConnector } = req.agentAPI;
    const validationId = req.params.id;

    // Get validation from database
    const validation = await databaseConnector.getValidation(validationId);
    
    if (!validation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Validation not found'
      });
    }

    let results = null;
    let status = validation.status;

    // If validation is still running, check for results
    if (status === 'running') {
      try {
        if (validation.type === 'code_analysis') {
          const analysisResults = await claudeCodeInterface.getAnalysisResults(
            validation.sessionId, 
            validation.taskId
          );
          
          if (analysisResults.success) {
            results = analysisResults.results;
            status = results.status === 'completed' ? 'completed' : 'running';
          }
        } else {
          // For other validation types, get session messages
          const messages = await claudeCodeInterface.getSessionMessages(validation.sessionId, {
            limit: 10
          });
          
          if (messages.success) {
            results = {
              messages: messages.messages,
              lastMessage: messages.messages[messages.messages.length - 1]
            };
            
            // Simple heuristic to determine completion
            const lastMessage = results.lastMessage;
            if (lastMessage && lastMessage.type === 'assistant' && 
                (lastMessage.content.includes('completed') || 
                 lastMessage.content.includes('finished') ||
                 lastMessage.content.includes('done'))) {
              status = 'completed';
            }
          }
        }

        // Update status in database if changed
        if (status !== validation.status) {
          await databaseConnector.updateValidationStatus(validationId, status, results);
        }
      } catch (error) {
        console.error(`Error checking validation results: ${error.message}`);
        // Don't fail the request, just return current status
      }
    } else {
      // Get stored results from database
      results = validation.results;
    }

    res.json({
      success: true,
      validation: {
        id: validationId,
        sessionId: validation.sessionId,
        type: validation.type,
        status,
        taskId: validation.taskId,
        createdAt: validation.createdAt,
        updatedAt: validation.updatedAt,
        results
      }
    });
  } catch (error) {
    console.error('Get validation error:', error);
    res.status(500).json({
      error: 'Get Validation Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/validation/:id/retry
 * Retry a failed validation
 */
router.post('/:id/retry', [
  param('id').isLength({ min: 1 }).withMessage('Validation ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { claudeCodeInterface, databaseConnector } = req.agentAPI;
    const validationId = req.params.id;

    // Get original validation
    const originalValidation = await databaseConnector.getValidation(validationId);
    
    if (!originalValidation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Original validation not found'
      });
    }

    if (originalValidation.status !== 'failed') {
      return res.status(400).json({
        error: 'Invalid Status',
        message: 'Only failed validations can be retried'
      });
    }

    // Start new validation with same parameters
    let result;
    const validationType = originalValidation.type;

    switch (validationType) {
      case 'code_analysis':
        result = await claudeCodeInterface.executeAnalysis(
          originalValidation.sessionId,
          originalValidation.config || {
            type: 'code_review',
            scope: 'changed_files',
            focus: ['bugs', 'performance', 'security']
          }
        );
        break;

      default:
        // Retry by sending the same message
        const retryMessage = `Please retry the ${validationType} validation`;
        result = await claudeCodeInterface.sendMessage(
          originalValidation.sessionId, 
          retryMessage
        );
        break;
    }

    // Create new validation record
    const newValidationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await databaseConnector.createValidation({
      id: newValidationId,
      sessionId: originalValidation.sessionId,
      type: validationType,
      status: 'running',
      taskId: result.taskId || result.messageId,
      retryOf: validationId,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      validationId: newValidationId,
      taskId: result.taskId || result.messageId,
      originalValidationId: validationId,
      status: 'running',
      message: 'Validation retry started successfully'
    });
  } catch (error) {
    console.error('Retry validation error:', error);
    res.status(500).json({
      error: 'Retry Validation Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/validation
 * List validations with filtering and pagination
 */
router.get('/', [
  query('sessionId').optional().isLength({ min: 1 }),
  query('type').optional().isIn([
    'code_analysis', 'test_execution', 'lint_check', 
    'build_verification', 'security_scan', 'custom_validation'
  ]),
  query('status').optional().isIn(['running', 'completed', 'failed']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;
    
    const {
      sessionId,
      type,
      status,
      page = 1,
      limit = 20
    } = req.query;

    const validations = await databaseConnector.getValidations({
      sessionId,
      type,
      status,
      page,
      limit
    });

    res.json({
      success: true,
      validations: validations.validations,
      pagination: {
        page,
        limit,
        total: validations.total,
        totalPages: Math.ceil(validations.total / limit)
      }
    });
  } catch (error) {
    console.error('List validations error:', error);
    res.status(500).json({
      error: 'List Validations Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/validation/:id/report
 * Get detailed validation report
 */
router.get('/:id/report', [
  param('id').isLength({ min: 1 }).withMessage('Validation ID is required'),
  query('format').optional().isIn(['json', 'html', 'markdown']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;
    const validationId = req.params.id;
    const format = req.query.format || 'json';

    const validation = await databaseConnector.getValidation(validationId);
    
    if (!validation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Validation not found'
      });
    }

    if (!validation.results) {
      return res.status(400).json({
        error: 'Report Not Available',
        message: 'Validation results are not yet available'
      });
    }

    let report = validation.results;

    // Format report based on requested format
    if (format === 'html') {
      report = generateHTMLReport(validation);
      res.setHeader('Content-Type', 'text/html');
    } else if (format === 'markdown') {
      report = generateMarkdownReport(validation);
      res.setHeader('Content-Type', 'text/markdown');
    }

    res.json({
      success: true,
      validation: {
        id: validationId,
        type: validation.type,
        status: validation.status,
        createdAt: validation.createdAt
      },
      report,
      format
    });
  } catch (error) {
    console.error('Get validation report error:', error);
    res.status(500).json({
      error: 'Get Report Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/validation/batch
 * Start multiple validations in batch
 */
router.post('/batch', [
  body('validations').isArray({ min: 1 }).withMessage('At least one validation is required'),
  body('validations.*.sessionId').notEmpty().withMessage('Session ID is required for each validation'),
  body('validations.*.type').isIn([
    'code_analysis', 'test_execution', 'lint_check', 
    'build_verification', 'security_scan', 'custom_validation'
  ]).withMessage('Invalid validation type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { claudeCodeInterface, databaseConnector } = req.agentAPI;
    const { validations } = req.body;

    const results = [];

    for (const validation of validations) {
      try {
        let result;

        switch (validation.type) {
          case 'code_analysis':
            result = await claudeCodeInterface.executeAnalysis(
              validation.sessionId,
              {
                type: 'code_review',
                scope: validation.scope || 'changed_files',
                focus: validation.focus || ['bugs', 'performance', 'security'],
                files: validation.files || []
              },
              validation.options || {}
            );
            break;

          default:
            const message = validation.command || `Please execute ${validation.type}`;
            result = await claudeCodeInterface.sendMessage(
              validation.sessionId, 
              message, 
              validation.options || {}
            );
            break;
        }

        // Store validation in database
        const validationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await databaseConnector.createValidation({
          id: validationId,
          sessionId: validation.sessionId,
          type: validation.type,
          status: 'running',
          taskId: result.taskId || result.messageId,
          createdAt: new Date()
        });

        results.push({
          success: true,
          validationId,
          taskId: result.taskId || result.messageId,
          type: validation.type,
          sessionId: validation.sessionId
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          type: validation.type,
          sessionId: validation.sessionId
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.status(successCount > 0 ? 201 : 500).json({
      success: successCount > 0,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      },
      message: `Batch validation completed: ${successCount} successful, ${failureCount} failed`
    });
  } catch (error) {
    console.error('Batch validation error:', error);
    res.status(500).json({
      error: 'Batch Validation Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/validation/stats
 * Get validation statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;

    const stats = await databaseConnector.getValidationStatistics();

    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get validation stats error:', error);
    res.status(500).json({
      error: 'Get Statistics Failed',
      message: error.message
    });
  }
});

/**
 * Generate HTML report
 */
function generateHTMLReport(validation) {
  const results = validation.results;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Validation Report - ${validation.id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        .status { font-weight: bold; color: ${validation.status === 'completed' ? 'green' : 'red'}; }
        .results { margin-top: 20px; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 3px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Validation Report</h1>
        <p><strong>ID:</strong> ${validation.id}</p>
        <p><strong>Type:</strong> ${validation.type}</p>
        <p><strong>Status:</strong> <span class="status">${validation.status}</span></p>
        <p><strong>Created:</strong> ${validation.createdAt}</p>
      </div>
      <div class="results">
        <h2>Results</h2>
        <pre>${JSON.stringify(results, null, 2)}</pre>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(validation) {
  const results = validation.results;
  
  return `
# Validation Report

**ID:** ${validation.id}
**Type:** ${validation.type}
**Status:** ${validation.status}
**Created:** ${validation.createdAt}

## Results

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
  `;
}

module.exports = router;

